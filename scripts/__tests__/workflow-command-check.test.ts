/**
 * Marker-scoped `--check` unit tests for generate-skill-artifacts.ts's
 * workflow-command branch (T3, WFC-07).
 *
 * runCheck() itself always diffs the real checked-in apps/*-plugin trees
 * against a fresh tmp emission — it takes no seam for a fixture checked-in
 * tree. These tests instead call `bun run scripts/generate-skill-artifacts.ts
 * --check` as a subprocess against the real repo (clean baseline) and, for
 * the two red-first fixtures, plant a real file inside a checked-in
 * apps/*-plugin directory, observe the drift, then remove it — the same
 * "real subprocess against a live-but-restored tree" shape
 * skill-artifact-parity.test.ts already uses for the sibling gate.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { WORKFLOW_COMMAND_MARKER } from "../lib/workflow-commands.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const GEN_SCRIPT = path.join(REPO_ROOT, "scripts/generate-skill-artifacts.ts");

function runCheckSubprocess() {
  return spawnSync("bun", ["run", GEN_SCRIPT, "--check"], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: 60000,
  });
}

const plantedFiles: string[] = [];

afterEach(async () => {
  while (plantedFiles.length > 0) {
    const f = plantedFiles.pop()!;
    await fs.rm(f, { force: true });
  }
});

describe("--check — clean baseline (WFC-07 sanity)", () => {
  test("exits 0 against the checked-in workflow-command bundles (must run `bun run generate:artifacts` first)", async () => {
    const sentinel = path.join(REPO_ROOT, "apps/claude-plugin/commands/debug.md");
    try {
      await fs.access(sentinel);
    } catch {
      throw new Error(
        `Generated workflow-command bundle missing at ${sentinel} — run 'bun run generate:artifacts' first.`,
      );
    }
    const res = runCheckSubprocess();
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("No drift");
  });
});

describe("--check — red-first: stale marker-bearing file (WFC-07)", () => {
  test("a planted marker-bearing file with no live source is reported unexpected", async () => {
    const stale = path.join(REPO_ROOT, "apps/claude-plugin/commands/__stale-workflow-fixture.md");
    await fs.writeFile(
      stale,
      `---\ndescription: "stale"\n---\n${WORKFLOW_COMMAND_MARKER}\n\nStale, no live source.\n`,
    );
    plantedFiles.push(stale);

    const res = runCheckSubprocess();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("__stale-workflow-fixture.md");
    expect(res.stderr).toContain("unexpected");
  });

  test("a planted marker-bearing file inside codex skills/ is reported unexpected", async () => {
    const stale = path.join(REPO_ROOT, "apps/codex-plugin/skills/__stale-workflow-fixture.md");
    await fs.writeFile(
      stale,
      `---\ndescription: "stale"\n---\n${WORKFLOW_COMMAND_MARKER}\n\nStale, no live source.\n`,
    );
    plantedFiles.push(stale);

    const res = runCheckSubprocess();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("__stale-workflow-fixture.md");
  });

  test("a planted marker-bearing SKILL.md inside a cursor stem dir is reported unexpected", async () => {
    const staleDir = path.join(REPO_ROOT, "apps/cursor-plugin/skills/__stale-workflow-fixture");
    await fs.mkdir(staleDir, { recursive: true });
    const stale = path.join(staleDir, "SKILL.md");
    await fs.writeFile(
      stale,
      `---\ndescription: "stale"\n---\n${WORKFLOW_COMMAND_MARKER}\n\nStale, no live source.\n`,
    );
    plantedFiles.push(stale);

    const res = runCheckSubprocess();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("__stale-workflow-fixture/SKILL.md");

    await fs.rmdir(staleDir).catch(() => undefined);
  });

  test("a hand-authored file beside the marker-bearing ones (no marker) is never reported — the diff is marker-scoped, not a directory-root walk", async () => {
    // Sanity: the 6 real quick-command files are hand-authored and carry no
    // marker. If the check were a plain directory walk (like diffManagedRoot),
    // it would already be red on every developer's checkout — assert clean.
    const res = runCheckSubprocess();
    expect(res.status).toBe(0);
  });
});

describe("--check — red-first: modified generated file (WFC-07)", () => {
  test("byte-modifying a checked-in generated command file is reported modified", async () => {
    const target = path.join(REPO_ROOT, "apps/claude-plugin/commands/debug.md");
    const original = await fs.readFile(target, "utf8");
    expect(original).toContain(WORKFLOW_COMMAND_MARKER); // sanity: this really is a generated file
    try {
      await fs.writeFile(target, original + "\n<!-- tampered for a red-first check -->\n");
      const res = runCheckSubprocess();
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("debug.md");
      expect(res.stderr).toContain("differs from source");
    } finally {
      await fs.writeFile(target, original);
    }
  });
});
