/**
 * T6 (WAVE4-N7): three-source diff + secrets denylist in defaultDiffRunner.
 *
 * Asserts spec AC 7, 8, 9, 9a (N7):
 *   - `scope=unstaged` (default) merges unstaged + untracked new files
 *   - `scope=staged` merges staged + untracked new files
 *   - `scope=all` merges committed + unstaged + untracked new files (deduped)
 *   - `scope=committed` stays single-source (NO untracked)
 *   - secret-like untracked paths (`.env*`, `*.key`, `*.pem`, `secrets.*`,
 *     `*.p12`, `*.pfx`, `*.keystore`, `id_rsa*`, `*.asc`) are excluded and
 *     counted in `untrackedFiltered` (N7 AC 9a)
 *   - dedup is via `Set<string>` (an untracked path already in `git diff`
 *     is kept once)
 *
 * Discrimination:
 *   - drop the `git ls-files --others` call → untracked normal file missing
 *     from `scope=unstaged` paths.
 *   - drop the `isSecretLike` check → `.env` appears in paths and
 *     `untrackedFiltered` stays 0.
 *   - make `committed` include untracked → `scope=committed` test fails
 *     (both untracked files would appear).
 */
import { afterEach, describe, test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultDiffRunner } from "../services/symbol/impact-analysis.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      fs.rm(dir, { recursive: true, force: true }),
    ),
  );
});

function git(dir: string, args: string[], env?: Record<string, string>): string {
  return execFileSync("git", args, {
    cwd: dir,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  }).trim();
}

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "massa-th0th-wave4-n7-"));
  tempDirs.push(dir);
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  return dir;
}

describe("defaultDiffRunner — N7 three-source diff + secrets denylist", () => {
  test("scope=unstaged (default) merges unstaged + untracked, excludes .env, counts untrackedFiltered", async () => {
    const dir = await makeRepo();
    // Committed file
    await fs.writeFile(path.join(dir, "committed.ts"), "export const a = 1;\n");
    git(dir, ["add", "committed.ts"]);
    git(dir, ["commit", "-qm", "init"]);
    // Unstaged tracked change
    await fs.writeFile(path.join(dir, "committed.ts"), "export const a = 2;\n");
    // Untracked normal file (should appear in paths)
    await fs.writeFile(path.join(dir, "new-normal.ts"), "export const b = 1;\n");
    // Untracked .env (should be filtered + counted)
    await fs.writeFile(path.join(dir, ".env"), "SECRET=abc\n");

    const result = defaultDiffRunner(dir, "unstaged");

    expect(result.paths).toContain("committed.ts");
    expect(result.paths).toContain("new-normal.ts");
    expect(result.paths).not.toContain(".env");
    expect(result.untrackedFiltered).toBe(1);
  });

  test("scope=staged merges staged + untracked, excludes .key, counts untrackedFiltered", async () => {
    const dir = await makeRepo();
    await fs.writeFile(path.join(dir, "base.ts"), "export const a = 1;\n");
    git(dir, ["add", "base.ts"]);
    git(dir, ["commit", "-qm", "init"]);
    // Staged tracked change
    await fs.writeFile(path.join(dir, "base.ts"), "export const a = 2;\n");
    git(dir, ["add", "base.ts"]);
    // Untracked normal file
    await fs.writeFile(path.join(dir, "staged-new.ts"), "export const b = 1;\n");
    // Untracked private key (filtered)
    await fs.writeFile(path.join(dir, "deploy.key"), "PRIVATE KEY MATERIAL\n");

    const result = defaultDiffRunner(dir, "staged");

    expect(result.paths).toContain("base.ts");
    expect(result.paths).toContain("staged-new.ts");
    expect(result.paths).not.toContain("deploy.key");
    expect(result.untrackedFiltered).toBe(1);
  });

  test("scope=committed stays single-source (no untracked files)", async () => {
    const dir = await makeRepo();
    await fs.writeFile(path.join(dir, "v1.ts"), "export const a = 1;\n");
    git(dir, ["add", "v1.ts"]);
    git(dir, ["commit", "-qm", "v1"]);
    // Make a branch we can diff against
    git(dir, ["branch", "prev"]);
    // New commit changing v1.ts
    await fs.writeFile(path.join(dir, "v1.ts"), "export const a = 2;\n");
    git(dir, ["add", "v1.ts"]);
    git(dir, ["commit", "-qm", "v2"]);
    // Untracked files (should NOT appear in committed-scope diff)
    await fs.writeFile(path.join(dir, "untracked.ts"), "export const x = 1;\n");
    await fs.writeFile(path.join(dir, ".env"), "SECRET=abc\n");

    const result = defaultDiffRunner(dir, "committed", "prev");

    expect(result.paths).toContain("v1.ts");
    expect(result.paths).not.toContain("untracked.ts");
    expect(result.paths).not.toContain(".env");
    expect(result.untrackedFiltered).toBe(0);
  });

  test("scope=all merges committed + unstaged + untracked, deduped", async () => {
    const dir = await makeRepo();
    await fs.writeFile(path.join(dir, "base.ts"), "export const a = 1;\n");
    git(dir, ["add", "base.ts"]);
    git(dir, ["commit", "-qm", "init"]);
    // New committed change
    await fs.writeFile(path.join(dir, "base.ts"), "export const a = 2;\n");
    git(dir, ["add", "base.ts"]);
    git(dir, ["branch", "prev"]);
    git(dir, ["commit", "-qm", "v2"]);
    // Unstaged tracked change (different file)
    await fs.writeFile(path.join(dir, "second.ts"), "export const b = 1;\n");
    git(dir, ["add", "second.ts"]);
    git(dir, ["commit", "-qm", "second-init"]);
    await fs.writeFile(path.join(dir, "second.ts"), "export const b = 2;\n");
    // Untracked normal
    await fs.writeFile(path.join(dir, "untracked.ts"), "export const c = 1;\n");
    // Untracked .pem (filtered)
    await fs.writeFile(path.join(dir, "cert.pem"), "-----BEGIN CERTIFICATE-----\n");

    const result = defaultDiffRunner(dir, "all", "prev");

    expect(result.paths).toContain("base.ts"); // committed
    expect(result.paths).toContain("second.ts"); // unstaged
    expect(result.paths).toContain("untracked.ts"); // untracked
    expect(result.paths).not.toContain("cert.pem");
    expect(result.untrackedFiltered).toBe(1);
    // Dedup: no duplicate entries.
    expect(new Set(result.paths).size).toBe(result.paths.length);
  });

  test("secrets denylist covers .env, .key, .pem, .p12, .pfx, secrets.*, .keystore, id_rsa*, .asc", async () => {
    const dir = await makeRepo();
    await fs.writeFile(path.join(dir, "keep.ts"), "export const a = 1;\n");
    git(dir, ["add", "keep.ts"]);
    git(dir, ["commit", "-qm", "init"]);

    const secretFiles = [
      ".env",
      ".env.local",
      "prod.env",
      "private.key",
      "cert.pem",
      "bundle.p12",
      "bundle.pfx",
      "secrets.json",
      "secret.yaml",
      "java.keystore",
      "id_rsa",
      "armor.asc",
    ];
    for (const f of secretFiles) {
      await fs.writeFile(path.join(dir, f), "x\n");
    }
    await fs.writeFile(path.join(dir, "safe.ts"), "export const safe = 1;\n");

    const result = defaultDiffRunner(dir, "unstaged");

    expect(result.paths).toContain("safe.ts");
    for (const f of secretFiles) {
      expect(result.paths).not.toContain(f);
    }
    expect(result.untrackedFiltered).toBe(secretFiles.length);
  });

  test("dedup keeps one copy when an untracked path is also in git diff", async () => {
    // Edge case from spec: "WHEN `git ls-files --others` returns paths already
    // in `git diff --name-only` THEN the dedup SHALL keep one copy (Set-based)."
    const dir = await makeRepo();
    // Create an untracked file that also appears in unstaged diff. This is
    // unusual but possible if a file is staged for deletion and re-created
    // in the working tree — both `git diff` (deletion) and `git ls-files
    // --others` (re-created untracked) can surface it.
    await fs.writeFile(path.join(dir, "base.ts"), "export const a = 1;\n");
    git(dir, ["add", "base.ts"]);
    git(dir, ["commit", "-qm", "init"]);
    git(dir, ["rm", "--cached", "base.ts"]); // now untracked + deleted from index
    // `git diff --name-only` shows the deletion; `git ls-files --others`
    // shows base.ts as untracked. The deduped set keeps one copy.

    const result = defaultDiffRunner(dir, "unstaged");

    expect(result.paths.filter((p) => p === "base.ts").length).toBe(1);
  });
});