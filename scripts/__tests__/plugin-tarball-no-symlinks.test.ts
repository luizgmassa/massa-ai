/**
 * T14/PDO-14 — real npm pack round trip for the three new host plugin
 * packages, proving no symlink survives the tarball.
 *
 * `npm pack` silently DROPS symlink entries — no warning, no error, both the
 * link and its containing directory simply absent from the tarball (verified
 * empirically this session against the old codex/cursor
 * `hooks/massa-ai-hook -> ../../claude-plugin/hooks/massa-ai-hook.ts` symlinks).
 * This is a real `npm pack` + `tar -tzf` inspection, not a hand-built file
 * list — it fails the moment a symlink reappears in the packed tree, from any
 * cause (a regenerated bundle, a hand-added file, a future `files` entry).
 *
 * `verify-package-contents.ts` (PDO-26, extended to 8 packages by T17) covers
 * inventory *completeness*; this file is narrower and specifically guards the
 * symlink-drop failure mode T14 exists to close.
 */
import { describe, test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const decoder = new TextDecoder();

function command(executable: string, args: string[], cwd: string) {
  const result = Bun.spawnSync([executable, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
    exitCode: result.exitCode ?? 1,
  };
}

const PLUGINS = [
  { dir: "apps/claude-plugin", name: "@massa-ai/claude-plugin", manifest: ".claude-plugin/plugin.json" },
  { dir: "apps/codex-plugin", name: "@massa-ai/codex-plugin", manifest: ".codex-plugin/plugin.json" },
  { dir: "apps/cursor-plugin", name: "@massa-ai/cursor-plugin", manifest: ".cursor-plugin/plugin.json" },
] as const;

describe.each(PLUGINS)("npm pack — $name", (plugin) => {
  test("tarball contains zero symlinks and the dotdir manifest survives", () => {
    const pluginDir = resolve(REPO_ROOT, plugin.dir);
    const destination = mkdtempSync(join(tmpdir(), "massa-ai-plugin-pack-"));
    try {
      const pack = command("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", destination], pluginDir);
      expect(pack.exitCode).toBe(0);
      const [record] = JSON.parse(pack.stdout) as { filename: string }[];
      expect(record?.filename).toBeTruthy();
      const tarball = resolve(destination, record.filename);
      expect(existsSync(tarball)).toBe(true);

      const extractDir = join(destination, "extracted");
      mkdirSync(extractDir, { recursive: true });
      const extract = command("tar", ["-xzf", tarball, "-C", extractDir], destination);
      expect(extract.exitCode).toBe(0);

      // Real filesystem symlink check — not a tar-entry-type guess. A tarball
      // that dropped a symlink silently would otherwise pass a naive check.
      const findSymlinks = command("find", [extractDir, "-type", "l"], destination);
      expect(findSymlinks.exitCode).toBe(0);
      expect(findSymlinks.stdout.trim()).toBe("");

      const manifestPath = resolve(extractDir, "package", plugin.manifest);
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect(typeof manifest.version).toBe("string");
    } finally {
      rmSync(destination, { recursive: true, force: true });
    }
  }, 30_000);

  test("hooks/massa-ai-hook, if present, is a real executable file (codex/cursor only)", () => {
    const hookPath = resolve(REPO_ROOT, plugin.dir, "hooks/massa-ai-hook");
    if (!existsSync(hookPath)) return; // claude-plugin IS the source, no copy shipped
    const stat = Bun.file(hookPath);
    expect(stat.size).toBeGreaterThan(0);
    const fs = require("node:fs") as typeof import("node:fs");
    const lst = fs.lstatSync(hookPath);
    expect(lst.isSymbolicLink()).toBe(false);
    expect(lst.mode & 0o111).toBeGreaterThan(0);
  });
});
