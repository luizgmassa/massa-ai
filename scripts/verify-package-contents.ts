#!/usr/bin/env bun
/**
 * massa-ai package-contents verifier (PDO-26).
 *
 * `publish.yml`'s `publish-packages` / `publish-apps` / `publish-github-packages` jobs
 * have NO `actions/checkout` — their entire filesystem is whatever the `build` job's
 * `build-output` artifact uploaded (see `Upload build artifacts` in that workflow). A
 * package's `files` field can declare a directory that was never uploaded, and `npm pack`
 * silently omits whatever is not on disk — no warning, no error. That is exactly how
 * `@massa-ai/opencode-plugin@1.3.1` shipped without the 15 `agents/*.md` charters its
 * manifest has always declared: `files: ["dist", "agents/*.md"]`, but the artifact list
 * only ever uploaded `dist` + `package.json`.
 *
 * This script reproduces that constrained filesystem locally instead of trusting a full
 * repo checkout (which would never catch the defect, since the checkout has every file):
 *
 *   1. Parse the `path:` list out of the `Upload build artifacts` step in `publish.yml` —
 *      the exact same list the real publish jobs are limited to.
 *   2. For each publishable package, stage a scratch directory containing ONLY the paths
 *      that list declares for that package (a plain recursive copy, nothing else).
 *   3. Run `npm pack` from inside that scratch directory, exactly like a publish step's
 *      `working-directory` would see it.
 *   4. Extract the tarball and assert its top-level inventory against the expected
 *      manifest below, which is independent of (and must agree with) each package's own
 *      `files` field — the whole point is that the two can silently disagree.
 *
 * A defect in the artifact list therefore fails here, in CI, before a release — instead
 * of surfacing in an already-published tarball.
 *
 *   bun scripts/verify-package-contents.ts
 *
 * Requires `bun run build` to have already produced each package's `dist/` (and, for
 * core, `prisma/` is source-controlled so it needs no build step). Run this after the
 * Build step in ci.yml, not before.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLISH_WORKFLOW = resolve(ROOT, ".github/workflows/publish.yml");
const decoder = new TextDecoder();

// ── Expected manifest (PDO-26) ──────────────────────────────────────────────
// Committed alongside the script per the task, deliberately independent of each
// package's own `package.json#files` field — the defect this gate exists to catch is
// exactly a `files` field that lies about what actually ships. `requiredTopLevel` is the
// exact set of top-level tar entries (relative to the `package/` prefix npm always adds);
// "exact" means both a missing entry and an unexpected extra one are failures, which is
// what makes the mutation-verification test meaningful in both directions.
interface PackageExpectation {
  /** Path to the package directory, relative to repo root. */
  dir: string;
  /** npm package name, asserted against the packed manifest as a sanity check. */
  name: string;
  /** Exact set of top-level entries `npm pack` must produce (package.json included). */
  requiredTopLevel: string[];
}

export const EXPECTED_PACKAGES: readonly PackageExpectation[] = [
  {
    dir: "packages/shared",
    name: "@massa-ai/shared",
    requiredTopLevel: ["dist", "package.json"],
  },
  {
    dir: "packages/core",
    name: "@massa-ai/core",
    requiredTopLevel: ["dist", "prisma", "package.json"],
  },
  {
    dir: "apps/tools-api",
    name: "@massa-ai/tools-api",
    requiredTopLevel: ["dist", "package.json"],
  },
  {
    dir: "apps/mcp-client",
    name: "@massa-ai/mcp-client",
    requiredTopLevel: ["dist", "package.json"],
  },
  {
    dir: "apps/opencode-plugin",
    name: "@massa-ai/opencode-plugin",
    // "agents" here stands for the `agents/*.md` glob in package.json#files — npm packs
    // the matching files under an "agents/" top-level directory in the tarball.
    requiredTopLevel: ["dist", "agents", "package.json"],
  },
];

interface PublishManifest {
  name?: string;
  version?: string;
}

interface PackRecord {
  filename?: string;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function command(
  executable: string,
  args: string[],
  options: { cwd?: string } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync([executable, ...args], {
    cwd: options.cwd ?? ROOT,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
    exitCode: result.exitCode ?? 1,
  };
}

// ── Step 1: read the real artifact list out of publish.yml ─────────────────
// Deliberately NOT a general YAML parser — same precedent as
// `generate-subagent-artifacts.ts`'s `parseSimpleYaml`. This reads one fixed, self-owned
// block (`Upload build artifacts` -> `with.path: |`) whose shape this repo controls, so a
// small indentation-based scanner is safer than pulling in a YAML dependency this package
// does not actually declare (the `yaml` module present in node_modules is transitive, not
// a direct dependency of any manifest in this workspace).
export function extractArtifactPaths(workflowText: string): string[] {
  const lines = workflowText.split("\n");
  const stepIndex = lines.findIndex((line) => line.trim() === "- name: Upload build artifacts");
  invariant(stepIndex !== -1, "publish.yml: 'Upload build artifacts' step not found");

  const pathLineIndex = lines.findIndex(
    (line, index) => index > stepIndex && /^\s*path:\s*\|\s*$/.test(line),
  );
  invariant(pathLineIndex !== -1, "publish.yml: 'path: |' block not found under Upload build artifacts");
  const baseIndent = lines[pathLineIndex]!.match(/^\s*/)![0].length;

  const paths: string[] = [];
  for (let i = pathLineIndex + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const indent = line.match(/^\s*/)![0].length;
    if (indent <= baseIndent) break;
    paths.push(line.trim());
  }
  invariant(paths.length > 0, "publish.yml: artifact path list parsed empty");
  return paths;
}

export function pathsForPackage(artifactPaths: readonly string[], pkgDir: string): string[] {
  const prefix = `${pkgDir}/`;
  return artifactPaths.filter((path) => path.startsWith(prefix));
}

// ── Step 2: stage a scratch copy limited to those declared paths ───────────
function stagePackage(pkg: PackageExpectation, artifactPaths: readonly string[], scratchRoot: string): string {
  const declared = pathsForPackage(artifactPaths, pkg.dir);
  invariant(
    declared.length > 0,
    `publish.yml declares no build-output artifact paths under ${pkg.dir}/ — the publish ` +
      `job would receive an empty directory`,
  );
  const stagedDir = resolve(scratchRoot, pkg.dir);
  mkdirSync(stagedDir, { recursive: true });
  for (const relPath of declared) {
    const source = resolve(ROOT, relPath);
    invariant(
      existsSync(source),
      `${relPath} is declared in publish.yml's artifact list but does not exist on disk ` +
        `— run 'bun run build' first`,
    );
    const dest = resolve(scratchRoot, relPath);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(source, dest, { recursive: true });
  }
  return stagedDir;
}

// ── Step 3 + 4: npm pack the staged copy and inspect the tarball ───────────
function packStaged(stagedDir: string, destination: string): string {
  const result = command("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", destination], {
    cwd: stagedDir,
  });
  invariant(
    result.exitCode === 0,
    `npm pack failed in staged ${stagedDir}: ${result.stderr || result.stdout}`,
  );
  const records = JSON.parse(result.stdout) as PackRecord[];
  invariant(records.length === 1 && records[0].filename, `npm pack in ${stagedDir} produced no tarball`);
  const tarball = resolve(destination, records[0].filename!);
  invariant(existsSync(tarball), `expected tarball missing: ${tarball}`);
  return tarball;
}

function tarEntries(tarball: string): string[] {
  const result = command("tar", ["-tzf", tarball]);
  invariant(result.exitCode === 0, `tar -tzf failed for ${tarball}: ${result.stderr}`);
  return result.stdout.trim().split("\n").filter(Boolean);
}

function tarManifest(tarball: string): PublishManifest {
  const result = command("tar", ["-xOzf", tarball, "package/package.json"]);
  invariant(result.exitCode === 0, `tar extraction of package.json failed for ${tarball}: ${result.stderr}`);
  return JSON.parse(result.stdout) as PublishManifest;
}

export function topLevelEntries(entries: readonly string[]): Set<string> {
  const top = new Set<string>();
  for (const entry of entries) {
    // Every entry is prefixed "package/" by npm; the first remaining path segment is the
    // top-level inventory item this gate cares about.
    const withoutPrefix = entry.replace(/^package\//, "");
    if (!withoutPrefix) continue;
    top.add(withoutPrefix.split("/")[0]!);
  }
  return top;
}

interface PackageResult {
  pkg: PackageExpectation;
  missing: string[];
  unexpected: string[];
  ok: boolean;
}

export function diffInventory(pkg: PackageExpectation, actual: Set<string>): PackageResult {
  const expected = new Set(pkg.requiredTopLevel);
  const missing = [...expected].filter((entry) => !actual.has(entry)).sort();
  const unexpected = [...actual].filter((entry) => !expected.has(entry)).sort();
  return { pkg, missing, unexpected, ok: missing.length === 0 && unexpected.length === 0 };
}

function formatResult(result: PackageResult): string {
  if (result.ok) {
    return `  PASS  ${result.pkg.name} (${result.pkg.dir}) — inventory matches: ${result.pkg.requiredTopLevel.join(", ")}`;
  }
  const lines = [`  FAIL  ${result.pkg.name} (${result.pkg.dir})`];
  if (result.missing.length > 0) {
    lines.push(`          missing:    ${result.missing.join(", ")}`);
  }
  if (result.unexpected.length > 0) {
    lines.push(`          unexpected: ${result.unexpected.join(", ")}`);
  }
  return lines.join("\n");
}

export function verifyPackageContents(): PackageResult[] {
  const workflowText = readFileSync(PUBLISH_WORKFLOW, "utf8");
  const artifactPaths = extractArtifactPaths(workflowText);

  const scratchRoot = mkdtempSync(resolve(tmpdir(), "massa-ai-package-contents-"));
  try {
    const results: PackageResult[] = [];
    for (const pkg of EXPECTED_PACKAGES) {
      const stagedDir = stagePackage(pkg, artifactPaths, scratchRoot);
      const destination = resolve(scratchRoot, "tarballs", basename(pkg.dir));
      mkdirSync(destination, { recursive: true });
      const tarball = packStaged(stagedDir, destination);

      const manifest = tarManifest(tarball);
      invariant(
        manifest.name === pkg.name,
        `packed manifest name mismatch in ${pkg.dir}: expected ${pkg.name}, got ${manifest.name}`,
      );

      const entries = tarEntries(tarball);
      const actual = topLevelEntries(entries);
      results.push(diffInventory(pkg, actual));
    }
    return results;
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  console.log("Verifying publishable package contents against publish.yml's artifact list...\n");
  try {
    const results = verifyPackageContents();
    for (const result of results) {
      console.log(formatResult(result));
    }
    const failed = results.filter((result) => !result.ok);
    console.log("");
    if (failed.length > 0) {
      console.error(
        `${failed.length}/${results.length} package(s) failed the inventory check. ` +
          `A package's build-output artifact list in publish.yml (or its ` +
          `requiredTopLevel expectation in this script) is out of sync with what it ` +
          `actually publishes.`,
      );
      process.exitCode = 1;
    } else {
      console.log(`${results.length}/${results.length} packages OK.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    process.exitCode = 1;
  }
}
