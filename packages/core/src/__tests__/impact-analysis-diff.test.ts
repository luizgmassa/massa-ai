import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultDiffRunner, ImpactAnalysisService } from "../services/symbol/impact-analysis.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function git(dir: string, args: string[], env?: Record<string, string>): string {
  return execFileSync("git", args, {
    cwd: dir,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  }).trim();
}

describe("defaultDiffRunner committed scope", () => {
  test("resolves an ISO date to a commit before building the diff range", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "massa-th0th-impact-git-"));
    tempDirs.push(dir);
    git(dir, ["init", "-q"]);
    git(dir, ["config", "user.email", "test@example.com"]);
    git(dir, ["config", "user.name", "Test"]);

    await fs.writeFile(path.join(dir, "before.ts"), "export const before = 1;\n");
    git(dir, ["add", "before.ts"]);
    git(dir, ["commit", "-qm", "before"], {
      GIT_AUTHOR_DATE: "2026-01-01T12:00:00Z",
      GIT_COMMITTER_DATE: "2026-01-01T12:00:00Z",
    });

    await fs.writeFile(path.join(dir, "after.ts"), "export const after = 2;\n");
    git(dir, ["add", "after.ts"]);
    git(dir, ["commit", "-qm", "after"], {
      GIT_AUTHOR_DATE: "2026-02-01T12:00:00Z",
      GIT_COMMITTER_DATE: "2026-02-01T12:00:00Z",
    });

    expect(defaultDiffRunner(dir, "committed", undefined, "2026-01-15")).toEqual(["after.ts"]);
    expect(defaultDiffRunner(dir, "committed", undefined, "2025-01-01")).toEqual([
      "after.ts",
      "before.ts",
    ]);
  });

  test("continues to accept a commit ref", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "massa-th0th-impact-ref-"));
    tempDirs.push(dir);
    git(dir, ["init", "-q"]);
    git(dir, ["config", "user.email", "test@example.com"]);
    git(dir, ["config", "user.name", "Test"]);
    await fs.writeFile(path.join(dir, "one.ts"), "one\n");
    git(dir, ["add", "one.ts"]);
    git(dir, ["commit", "-qm", "one"]);
    const first = git(dir, ["rev-parse", "HEAD"]);
    await fs.writeFile(path.join(dir, "two.ts"), "two\n");
    git(dir, ["add", "two.ts"]);
    git(dir, ["commit", "-qm", "two"]);

    expect(defaultDiffRunner(dir, "committed", undefined, first)).toEqual(["two.ts"]);
  });
});

test("impact analysis never falls back from exact identity to a bare overload name", async () => {
  let nameFallbacks = 0;
  const changed = {
    id: "src/changed.ts#run~function~" + "a".repeat(64), project_id: "p", generation_id: "active",
    file_path: "src/changed.ts", name: "run", qualified_name: "run", kind: "function" as const,
    line_start: 1, line_end: 1, exported: true, indexed_at: 1,
  };
  const repo = {
    allFiles: async () => ["src/changed.ts"],
    listDefinitions: async () => [changed],
    allImportEdges: async () => [],
    getCentrality: async () => new Map(),
    findReferencesByFqn: async () => [],
    findReferencesByName: async () => { nameFallbacks += 1; return []; },
  };
  const result = await ImpactAnalysisService.getInstance().analyze({
    projectId: "p", projectPath: ".", scope: "unstaged", depth: 1,
    diffRunner: () => ["src/changed.ts"], repoOverride: repo as never,
  });
  expect(result.changedFiles[0]?.symbols[0]?.fqn).toBe(changed.id);
  expect(result.impacted).toEqual([]);
  expect(nameFallbacks).toBe(0);
});
