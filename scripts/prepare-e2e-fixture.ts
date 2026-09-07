#!/usr/bin/env bun
/**
 * prepare-e2e-fixture.ts — build the sparse git repository the live-stack E2E
 * suite indexes as its shared corpus.
 *
 * Why this exists: `packages/core/src/__tests__/e2e/_helpers.ts` refuses to run
 * unless four environment pins are all present, and one of them —
 * `MASSA_AI_E2E_PROJECT_PATH` — must point at a **git repository**, because
 * `resolveSharedProfileIdentity` runs `git rev-parse HEAD` there and mixes the
 * SHA into the shared index identity. Pointing it at the repo root satisfies
 * the pins but makes the shared index a full-repo index, which CLAUDE.md
 * records as never completing in one shot.
 *
 * The historical runbook (.specs/features/close-maintenance-next-steps-2026-07-13/)
 * solved this with a commit-locked sparse clone produced by
 * `scripts/prepare-qwen-e2e-fixture.ts` — a script that was never committed in
 * any revision, which is why that fixture is not reproducible today. This is
 * its replacement, written against what the suites actually reference rather
 * than against the lost original.
 *
 *   bun scripts/prepare-e2e-fixture.ts
 *   bun scripts/prepare-e2e-fixture.ts --out /tmp/my-fixture --force
 *   bun scripts/prepare-e2e-fixture.ts --json
 *
 * Exit 0 when the fixture is built and every self-check passes, 1 otherwise.
 * The commit is deterministic: identical content yields an identical SHA, so
 * the shared index identity is stable across rebuilds on any machine.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const DEFAULT_OUT = "/tmp/massa-ai-e2e-fixture";

/**
 * Directory subtrees copied wholesale. Every entry is repo-relative and is
 * reproduced at the same relative path inside the fixture, because the suites
 * address files by repo-relative path (`08.search.test.ts` reads
 * `packages/core/src/services/search/search-controller.ts` through `read_file`).
 */
const COPY_DIRS: readonly { from: string; skipTests: boolean }[] = [
  // The search stack: the corpus behind the shared-index probe queries
  // (`_helpers.ts` SHARED_PROBE_QUERIES) and 6 of the 14 needle anchors.
  { from: "packages/core/src/services/search", skipTests: true },
  // postgres-vector-store.ts carries needle anchors N12/N13/N14 and the third
  // probe query ("postgres vector store addDocuments transaction").
  { from: "packages/core/src/data/vector", skipTests: true },
  // The 33-extension polyglot sentinel corpus. 02/09/15 index it separately
  // under their own project id, but it must exist under the fixture root
  // because `POLY_FIXTURE_PATH` is derived from `PROJECT_PATH`.
  { from: "packages/core/src/__tests__/e2e/fixtures/polyglot", skipTests: false },
];

/** Individual files copied by exact path. */
const COPY_FILES: readonly string[] = [
  // Needle anchors N01/N02, and the second probe query.
  "packages/core/src/services/symbol/centrality.ts",
  // Needle anchors N10/N11.
  "packages/core/src/services/etl/stages/discover.ts",
  // `08.search.test.ts` searches for "function getPrismaClient()".
  "packages/core/src/kernel/prisma-client.ts",
  // `20.new-features.test.ts` reads its own path through `read_file`.
  "packages/core/src/__tests__/e2e/20.new-features.test.ts",
  // `14.needles.test.ts` loads the dataset from `PROJECT_PATH`.
  "benchmarks/needles/fixtures/massa-ai.json",
  // Bootstrap reads a README first paragraph and package manifests.
  "README.md",
];

/**
 * Paths whose absence makes a suite fail in a way that looks like a product
 * bug. Checked after the copy; a miss is a hard error, never a warning.
 */
const REQUIRED_PATHS: readonly string[] = [
  "packages/core/src/services/search/contextual-search-rlm.ts",
  "packages/core/src/services/search/search-controller.ts",
  "packages/core/src/services/search/result-fusion.ts",
  "packages/core/src/services/search/hybrid-search.ts",
  "packages/core/src/services/search/chunker/chunker-code.ts",
  "packages/core/src/services/search/chunker/chunker-markdown.ts",
  "packages/core/src/services/search/chunker/chunker-post.ts",
  "packages/core/src/services/symbol/centrality.ts",
  "packages/core/src/services/etl/stages/discover.ts",
  "packages/core/src/data/vector/postgres-vector-store.ts",
  "packages/core/src/kernel/prisma-client.ts",
  "packages/core/src/__tests__/e2e/20.new-features.test.ts",
  "packages/core/src/__tests__/e2e/fixtures/polyglot",
  "benchmarks/needles/fixtures/massa-ai.json",
  "package.json",
  "README.md",
];

/** Fixed identity so the commit SHA is a pure function of the tree. */
const COMMIT_IDENTITY = {
  GIT_AUTHOR_NAME: "massa-ai e2e fixture",
  GIT_AUTHOR_EMAIL: "e2e-fixture@massa-ai.invalid",
  GIT_AUTHOR_DATE: "2000-01-01T00:00:00+00:00",
  GIT_COMMITTER_NAME: "massa-ai e2e fixture",
  GIT_COMMITTER_EMAIL: "e2e-fixture@massa-ai.invalid",
  GIT_COMMITTER_DATE: "2000-01-01T00:00:00+00:00",
} as const;

interface Args {
  out: string;
  force: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const out = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : undefined;
  if (argv.includes("--out") && (out === undefined || out.startsWith("--"))) {
    throw new Error("--out requires a directory path");
  }
  return {
    out: resolve(out ?? DEFAULT_OUT),
    force: argv.includes("--force"),
    json: argv.includes("--json"),
  };
}

function git(args: string[], cwd: string, env: Record<string, string> = {}): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  }).trim();
}

/** Every file under `dir`, repo-relative and posix-separated. */
function listFiles(dir: string, root: string): string[] {
  const found: string[] = [];
  const walk = (absolute: string): void => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = join(absolute, entry.name);
      if (entry.isDirectory()) {
        walk(child);
      } else {
        found.push(relative(root, child).split(sep).join("/"));
      }
    }
  };
  walk(dir);
  return found.sort();
}

function copyInto(outDir: string): { copied: number; skipped: number } {
  let copied = 0;
  let skipped = 0;

  for (const spec of COPY_DIRS) {
    const source = join(REPO_ROOT, spec.from);
    if (!existsSync(source)) {
      throw new Error(`manifest directory is missing from the repository: ${spec.from}`);
    }
    for (const rel of listFiles(source, REPO_ROOT)) {
      if (spec.skipTests && (rel.includes("/__tests__/") || rel.endsWith(".test.ts"))) {
        skipped++;
        continue;
      }
      const destination = join(outDir, rel);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(join(REPO_ROOT, rel), destination);
      copied++;
    }
  }

  for (const rel of COPY_FILES) {
    const source = join(REPO_ROOT, rel);
    if (!existsSync(source)) {
      throw new Error(`manifest file is missing from the repository: ${rel}`);
    }
    const destination = join(outDir, rel);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
    copied++;
  }

  return { copied, skipped };
}

/**
 * A minimal root manifest. Bootstrap reads package manifests as a signal, and
 * the ETL discovery stage keys some of its ordering off the project root, so
 * the fixture needs one — but it must not be the repo's own 40-script manifest,
 * which would make the fixture look like a workspace root with absent packages.
 */
function writeRootManifest(outDir: string): void {
  writeFileSync(
    join(outDir, "package.json"),
    `${JSON.stringify(
      {
        name: "massa-ai-e2e-fixture",
        version: "0.0.0",
        private: true,
        description:
          "Sparse, commit-locked corpus indexed by the massa-ai live-stack E2E suite. Generated by scripts/prepare-e2e-fixture.ts — do not edit by hand.",
        type: "module",
      },
      null,
      2,
    )}\n`,
  );
}

/**
 * Self-check 1: every path a suite addresses by name exists in the fixture.
 * Without this the failure surfaces as a search returning no hits, which reads
 * like a retrieval regression rather than a missing file.
 */
function verifyRequiredPaths(outDir: string): string[] {
  return REQUIRED_PATHS.filter((rel) => !existsSync(join(outDir, rel)));
}

/**
 * Self-check 2: every needle anchor resolves to exactly one location inside the
 * fixture. `14.needles.test.ts` resolves anchors against `PROJECT_PATH`, and
 * `resolve.ts` throws on both zero matches and two-or-more matches — so a
 * fixture that drops an anchor file, or that duplicates one, fails the
 * relevance gate for a reason that has nothing to do with retrieval quality.
 * Scans `.ts`/`.tsx` only, mirroring `SCANNED_EXTENSIONS` in that resolver.
 */
function verifyNeedleAnchors(outDir: string): { id: string; matches: number }[] {
  const datasetPath = join(outDir, "benchmarks/needles/fixtures/massa-ai.json");
  if (!existsSync(datasetPath)) return [{ id: "<dataset missing>", matches: 0 }];
  const dataset = JSON.parse(readFileSync(datasetPath, "utf8")) as {
    needles: { id: string; expected: { anchor: string } }[];
  };

  const ignoredDirectories = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    "generated",
    "reports",
    ".turbo",
  ]);
  const sources: string[] = [];
  const walk = (absolute: string): void => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) continue;
        walk(join(absolute, entry.name));
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        sources.push(join(absolute, entry.name));
      }
    }
  };
  walk(outDir);

  const contents = sources.map((file) => readFileSync(file, "utf8"));
  const failures: { id: string; matches: number }[] = [];
  for (const needle of dataset.needles) {
    let matches = 0;
    for (const content of contents) {
      let index = content.indexOf(needle.expected.anchor);
      while (index !== -1) {
        matches++;
        index = content.indexOf(needle.expected.anchor, index + 1);
      }
    }
    if (matches !== 1) failures.push({ id: needle.id, matches });
  }
  return failures;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (existsSync(args.out)) {
    if (!args.force) {
      const entries = readdirSync(args.out);
      if (entries.length > 0) {
        throw new Error(
          `refusing to overwrite non-empty ${args.out} — pass --force to rebuild it`,
        );
      }
    } else {
      rmSync(args.out, { recursive: true, force: true });
    }
  }
  mkdirSync(args.out, { recursive: true });

  const { copied, skipped } = copyInto(args.out);
  writeRootManifest(args.out);

  const missing = verifyRequiredPaths(args.out);
  if (missing.length > 0) {
    throw new Error(
      `fixture is missing ${missing.length} required path(s):\n  ${missing.join("\n  ")}`,
    );
  }

  const anchorFailures = verifyNeedleAnchors(args.out);
  if (anchorFailures.length > 0) {
    const detail = anchorFailures
      .map((failure) => `  ${failure.id}: ${failure.matches} match(es), expected exactly 1`)
      .join("\n");
    throw new Error(`fixture fails the needle-anchor uniqueness check:\n${detail}`);
  }

  git(["init", "--quiet", "--initial-branch=fixture"], args.out);
  git(["add", "-A"], args.out);
  git(
    ["commit", "--quiet", "-m", "massa-ai E2E fixture corpus"],
    args.out,
    COMMIT_IDENTITY as unknown as Record<string, string>,
  );
  const commit = git(["rev-parse", "HEAD"], args.out);

  const tracked = git(["ls-files"], args.out).split("\n").filter(Boolean);
  const bytes = tracked.reduce((sum, rel) => sum + statSync(join(args.out, rel)).size, 0);

  const result = {
    out: args.out,
    commit,
    files: tracked.length,
    bytes,
    copied,
    skippedTestFiles: skipped,
    requiredPathsChecked: REQUIRED_PATHS.length,
    needleAnchorsChecked: true,
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `massa-ai E2E fixture ready\n` +
      `  path    ${result.out}\n` +
      `  commit  ${result.commit}\n` +
      `  files   ${result.files} tracked (${(result.bytes / 1024).toFixed(0)} KB)\n` +
      `  checks  ${result.requiredPathsChecked} required paths present, all needle anchors unique\n\n` +
      `Point the suite at it with:\n` +
      `  export MASSA_AI_E2E_PROJECT_PATH=${result.out}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`prepare-e2e-fixture: ${(error as Error).message}\n`);
  process.exit(1);
}
