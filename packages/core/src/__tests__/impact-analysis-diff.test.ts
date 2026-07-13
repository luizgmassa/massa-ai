import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultDiffRunner } from "../services/symbol/impact-analysis.js";

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
