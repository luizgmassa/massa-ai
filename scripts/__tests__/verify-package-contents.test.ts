/**
 * verify-package-contents.ts — PDO-26 gate coverage.
 *
 * Three layers, matching `verify-tree-sitter-package-artifact-coverage.test.ts`'s
 * precedent of testing pure helpers directly plus one real tarball round-trip:
 *
 *  1. `extractArtifactPaths` against synthetic `publish.yml` text (no filesystem, no
 *     process spawn).
 *  2. `diffInventory` — the discriminating logic itself, exercised in BOTH directions
 *     (missing entry, unexpected entry, exact match) so a regression that weakens the
 *     comparison to a subset check fails here immediately.
 *  3. A real `npm pack` + `tar` round trip against a synthetic scratch package, proving
 *     `topLevelEntries` reads an actual tarball correctly rather than a hand-built list.
 *  4. An end-to-end run of `verifyPackageContents()` against this repo's own
 *     `publish.yml` + package dirs, skipped when `bun run build` has not produced dist
 *     output yet (dist is gitignored, so a fresh checkout legitimately lacks it — the
 *     real CI gate always runs this script after the Build step).
 */
import { describe, test, expect } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  EXPECTED_PACKAGES,
  checkGeneratedEntries,
  diffInventory,
  extractArtifactPaths,
  fullEntries,
  pathsForPackage,
  topLevelEntries,
  verifyPackageContents,
} from "../verify-package-contents.ts";

const REPO_ROOT = resolve(import.meta.dir, "../..");

// ── extractArtifactPaths ─────────────────────────────────────────────────────

describe("extractArtifactPaths", () => {
  const sample = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - name: Some other step",
    "        run: echo hi",
    "      - name: Upload build artifacts",
    "        uses: actions/upload-artifact@v4",
    "        with:",
    "          name: build-output",
    "          path: |",
    "            packages/shared/dist",
    "            packages/shared/package.json",
    "            apps/opencode-plugin/dist",
    "            apps/opencode-plugin/package.json",
    "          retention-days: 1",
    "",
    "  next-job:",
    "    steps: []",
  ].join("\n");

  test("collects every indented path line under the Upload build artifacts step", () => {
    const paths = extractArtifactPaths(sample);
    expect(paths).toEqual([
      "packages/shared/dist",
      "packages/shared/package.json",
      "apps/opencode-plugin/dist",
      "apps/opencode-plugin/package.json",
    ]);
  });

  test("stops at the first line back at or below the path: block's own indentation", () => {
    const paths = extractArtifactPaths(sample);
    expect(paths).not.toContain("retention-days: 1");
  });

  test("throws when the Upload build artifacts step is missing", () => {
    expect(() => extractArtifactPaths("jobs:\n  build:\n    steps: []\n")).toThrow(
      /Upload build artifacts.*not found/,
    );
  });

  test("throws when the step exists but has no path: | block", () => {
    const noPath = [
      "      - name: Upload build artifacts",
      "        uses: actions/upload-artifact@v4",
      "        with:",
      "          name: build-output",
    ].join("\n");
    expect(() => extractArtifactPaths(noPath)).toThrow(/path: \|.*not found/);
  });

  test("matches this repo's real publish.yml (regression pin, PDO-26)", () => {
    const workflowText = require("node:fs").readFileSync(
      resolve(REPO_ROOT, ".github/workflows/publish.yml"),
      "utf8",
    );
    const paths = extractArtifactPaths(workflowText);
    expect(paths).toContain("packages/shared/dist");
    // apps/opencode-plugin/agents is the PDO-26 fix: without it, the staged-copy this
    // script reproduces cannot see the 17 agent charters declared in package.json#files.
    expect(paths).toContain("apps/opencode-plugin/agents");
    // apps/opencode-plugin/command (T11, WFC-09): package.json#files declares
    // "command/*.md" — same PDO-26 defect shape as agents/ if this artifact
    // path were ever dropped from publish.yml while the files glob stayed.
    expect(paths).toContain("apps/opencode-plugin/command");
  });
});

// ── pathsForPackage ───────────────────────────────────────────────────────────

describe("pathsForPackage", () => {
  const all = [
    "packages/shared/dist",
    "packages/shared/package.json",
    "packages/core/dist",
    "apps/opencode-plugin/dist",
    "apps/opencode-plugin/agents",
    "apps/opencode-plugin/package.json",
  ];

  test("filters to only paths under the given package directory", () => {
    expect(pathsForPackage(all, "apps/opencode-plugin")).toEqual([
      "apps/opencode-plugin/dist",
      "apps/opencode-plugin/agents",
      "apps/opencode-plugin/package.json",
    ]);
  });

  test("does not prefix-match a sibling directory with a shared prefix", () => {
    // "apps/opencode-plugin-extra" must never match a filter for "apps/opencode-plugin"
    const withDecoy = [...all, "apps/opencode-plugin-extra/dist"];
    const matched = pathsForPackage(withDecoy, "apps/opencode-plugin");
    expect(matched).not.toContain("apps/opencode-plugin-extra/dist");
  });
});

// ── diffInventory — discrimination in both directions ────────────────────────

describe("diffInventory", () => {
  const pkg = { dir: "apps/example", name: "@massa-ai/example", requiredTopLevel: ["dist", "agents", "package.json"] };

  test("passes on an exact match", () => {
    const result = diffInventory(pkg, new Set(["dist", "agents", "package.json"]));
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });

  test("fails and reports a missing required entry (the real opencode-plugin defect shape)", () => {
    const result = diffInventory(pkg, new Set(["dist", "package.json"]));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["agents"]);
    expect(result.unexpected).toEqual([]);
  });

  test("fails and reports an unexpected extra entry", () => {
    const result = diffInventory(pkg, new Set(["dist", "agents", "package.json", "node_modules"]));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.unexpected).toEqual(["node_modules"]);
  });

  test("removing an entry from the expected manifest turns a real match into a failure", () => {
    // This is the shape of the required mutation-verification: shrinking the expected
    // manifest (as if a maintainer deleted a requiredTopLevel entry) must make a
    // previously-passing actual inventory fail as "unexpected", proving the comparison
    // is an exact set match rather than a one-directional subset check.
    const shrunk = { ...pkg, requiredTopLevel: ["dist", "package.json"] };
    const actual = new Set(["dist", "agents", "package.json"]);
    const full = diffInventory(pkg, actual);
    const afterShrink = diffInventory(shrunk, actual);
    expect(full.ok).toBe(true);
    expect(afterShrink.ok).toBe(false);
    expect(afterShrink.unexpected).toEqual(["agents"]);
  });
});

// ── topLevelEntries against a real tarball ───────────────────────────────────

describe("topLevelEntries", () => {
  test("reads a real npm-pack tarball's top-level inventory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "massa-ai-verify-package-contents-"));
    try {
      const staging = join(tmp, "staging");
      mkdirSync(join(staging, "dist"), { recursive: true });
      mkdirSync(join(staging, "agents"), { recursive: true });
      writeFileSync(join(staging, "dist", "index.js"), "module.exports = 1;\n");
      writeFileSync(join(staging, "agents", "one.md"), "# one\n");
      writeFileSync(
        join(staging, "package.json"),
        JSON.stringify({ name: "@massa-ai/scratch-example", version: "0.0.0", files: ["dist", "agents"] }),
      );

      const packOutput = execSync(
        `npm pack --json --ignore-scripts --pack-destination ${JSON.stringify(tmp)}`,
        { cwd: staging, encoding: "utf8" },
      );
      const [record] = JSON.parse(packOutput) as [{ filename: string }];
      const tarball = join(tmp, record.filename);

      const { tarEntries } = require("../verify-tree-sitter-package-artifact.ts") as {
        tarEntries: (tarball: string) => string[];
      };
      const entries = tarEntries(tarball);
      const top = topLevelEntries(entries);
      expect(top).toEqual(new Set(["dist", "agents", "package.json"]));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);
});

// ── fullEntries ───────────────────────────────────────────────────────────────

describe("fullEntries", () => {
  test("strips the npm package/ prefix and keeps the full in-package path (not just the top segment)", () => {
    const entries = [
      "package/commands/",
      "package/commands/debug.md",
      "package/commands/adr.md",
      "package/package.json",
    ];
    expect(fullEntries(entries)).toEqual(
      new Set(["commands", "commands/debug.md", "commands/adr.md", "package.json"]),
    );
  });
});

// ── checkGeneratedEntries (T11, WFC-09) ──────────────────────────────────────

describe("checkGeneratedEntries", () => {
  const pkg = {
    dir: "apps/example-plugin",
    name: "@massa-ai/example-plugin",
    requiredTopLevel: ["command", "package.json"],
    requiredGeneratedEntries: ["command/massa-ai-debug.md"],
  };

  test("passes silently when a package declares no requiredGeneratedEntries", () => {
    const bare = { dir: "x", name: "@massa-ai/x", requiredTopLevel: ["dist"] };
    expect(checkGeneratedEntries(bare, new Set(["dist"]))).toEqual([]);
  });

  test("passes when the declared generated entry is a real tar entry", () => {
    const actual = new Set(["command", "command/massa-ai-debug.md", "package.json"]);
    expect(checkGeneratedEntries(pkg, actual)).toEqual([]);
  });

  test("fails when the top-level directory name ships but is empty of the generated member — the exact gap requiredTopLevel alone cannot see", () => {
    // "command" is present as a top-level entry (would pass diffInventory), but the
    // one file inside it that must be there is absent — the shape a generator that
    // silently emits into the wrong per-host branch would produce.
    const actualEmptyDir = new Set(["command", "package.json"]);
    expect(checkGeneratedEntries(pkg, actualEmptyDir)).toEqual([
      "command/massa-ai-debug.md",
    ]);
  });
});

// ── EXPECTED_PACKAGES sanity ─────────────────────────────────────────────────

describe("EXPECTED_PACKAGES", () => {
  test("covers exactly the current 8 publishable packages (PR2 scope, T17)", () => {
    expect(EXPECTED_PACKAGES.map((pkg) => pkg.name).sort()).toEqual([
      "@massa-ai/claude-plugin",
      "@massa-ai/core",
      "@massa-ai/cursor-plugin",
      "@massa-ai/codex-plugin",
      "@massa-ai/mcp-client",
      "@massa-ai/opencode-plugin",
      "@massa-ai/shared",
      "@massa-ai/tools-api",
    ].sort());
  });

  test("every declared package directory exists in this repo", () => {
    for (const pkg of EXPECTED_PACKAGES) {
      expect(existsSync(resolve(REPO_ROOT, pkg.dir, "package.json"))).toBe(true);
    }
  });
});

// ── End-to-end: the real gate against this repo ──────────────────────────────

describe("verifyPackageContents (end-to-end, PDO-26 AC10)", () => {
  const builtDistExists = existsSync(resolve(REPO_ROOT, "packages/shared/dist"));

  // A real staged-copy run against this repo's own publish.yml + package dirs must pass
  // on all 8 current publishable packages. `apps/opencode-plugin/agents` is part of
  // publish.yml's build-output artifact list (PDO-26's fix), so its 15 `agents/*.md`
  // charters survive the artifact-only staging this gate reproduces. Before that entry
  // existed, this exact assertion failed with `missing: ["agents"]` on
  // @massa-ai/opencode-plugin — the live defect this gate exists to catch (spec PDO-26
  // AC10; the captured red-state run is in this task's delivery notes). T17 extended the
  // package count from 5 to 8 for the three new static-source host plugins.
  test.skipIf(!builtDistExists)(
    "passes on all 8 packages against this repo's real publish.yml artifact list",
    () => {
      const results = verifyPackageContents();
      const byName = new Map(results.map((r) => [r.pkg.name, r]));
      expect(byName.size).toBe(8);
      for (const result of results) {
        expect(result.ok).toBe(true);
      }
    },
    60_000,
  );

  test("skip reason is legitimate: dist is gitignored and only produced by `bun run build`", () => {
    if (!builtDistExists) {
      expect(existsSync(resolve(REPO_ROOT, "packages/shared/src"))).toBe(true);
    } else {
      expect(builtDistExists).toBe(true);
    }
  });

  // T17 mutation-verification: simulates the exact real-world defect class this gate
  // exists to catch — a package's build-output artifact list in publish.yml silently
  // dropping one of its declared directories — for one of the three new static-source
  // plugins, without mutating the real workflow file on disk.
  test("mutation: dropping a declared artifact path for a new plugin fails the check", () => {
    const claudePlugin = EXPECTED_PACKAGES.find((pkg) => pkg.name === "@massa-ai/claude-plugin")!;
    expect(claudePlugin).toBeDefined();

    const fullArtifactPaths = [
      "apps/claude-plugin/agents",
      "apps/claude-plugin/agent-profiles",
      "apps/claude-plugin/commands",
      "apps/claude-plugin/hooks",
      "apps/claude-plugin/skills",
      "apps/claude-plugin/install.sh",
      "apps/claude-plugin/README.md",
      "apps/claude-plugin/.claude-plugin/plugin.json",
      "apps/claude-plugin/package.json",
    ];
    const actualFull = new Set(
      pathsForPackage(fullArtifactPaths, claudePlugin.dir).map((p) => p.split("/")[2]!),
    );
    expect(diffInventory(claudePlugin, actualFull).ok).toBe(true);

    // Mutation: publish.yml's artifact list silently drops "skills" (the actual
    // shape of the opencode-plugin agents/ defect this gate was built to catch).
    const droppedArtifactPaths = fullArtifactPaths.filter((p) => !p.endsWith("/skills"));
    const actualDropped = new Set(
      pathsForPackage(droppedArtifactPaths, claudePlugin.dir).map((p) => p.split("/")[2]!),
    );
    const result = diffInventory(claudePlugin, actualDropped);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["skills"]);
  });

  // T7 (MPS-01/MPS-12): agent-profiles is the switch engine's shipped variant tree —
  // dropped from publish.yml's artifact list or a plugin's package.json#files, an
  // npm-only user's installer has nothing to switch to (same defect shape as the
  // opencode-plugin `agents` glob PDO-26 fixed). Observed red BEFORE requiredTopLevel
  // gained "agent-profiles": a staged copy that has it (current reality, post-T7)
  // reported an UNEXPECTED "agent-profiles" entry against the pre-fix expectation,
  // exactly the "maintainer forgot to update requiredTopLevel after adding a new
  // directory" shape — see this task's commit message for the captured red-state run.
  test("mutation: a staged copy WITHOUT agent-profiles fails every one of the 4 plugin packages that require it", () => {
    const variantShipping = EXPECTED_PACKAGES.filter((pkg) =>
      pkg.requiredTopLevel.includes("agent-profiles"),
    );
    expect(variantShipping.map((pkg) => pkg.name).sort()).toEqual(
      [
        "@massa-ai/claude-plugin",
        "@massa-ai/codex-plugin",
        "@massa-ai/cursor-plugin",
        "@massa-ai/opencode-plugin",
      ].sort(),
    );
    for (const pkg of variantShipping) {
      const withVariants = new Set(pkg.requiredTopLevel);
      expect(diffInventory(pkg, withVariants).ok).toBe(true);

      // Mutation: the staged copy (what publish.yml's artifact list actually
      // produced) is missing agent-profiles — the pre-T7 / a regressed state.
      const withoutVariants = new Set(pkg.requiredTopLevel.filter((e) => e !== "agent-profiles"));
      const result = diffInventory(pkg, withoutVariants);
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual(["agent-profiles"]);
    }
  });
});
