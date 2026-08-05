/**
 * Prune-before-emit unit tests for scripts/generate-subagent-artifacts.ts
 * (T2, UGB-03/04).
 *
 * emitAll()/emitVariants() must remove each host's prior `agents/` /
 * `agent-profiles/<profile>/` contents before repopulating — including a
 * whole stale variant directory left behind by a profile that is no longer
 * supported by a host (dropped from the registry, or lost host support) —
 * so a deleted charter or retired profile never survives regeneration once
 * git stops tracking these bundles.
 *
 * All assertions run against scratch temp dirs via emitAll/emitVariants'
 * existing injectable targetDirs/pluginRootDirs + hosts seam (same pattern as
 * generate-subagent-artifacts-variants.test.ts) — the real checked-in
 * `apps/*-plugin` trees are never written by this file.
 */
import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { emitAll, emitVariants, staleVariantDirs, variantDir, type Host } from "../generate-subagent-artifacts.ts";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-subagent-prune-"));
}

function agentDirsFor(root: string): Record<Host, string> {
  return {
    claude: path.join(root, "claude"),
    codex: path.join(root, "codex"),
    cursor: path.join(root, "cursor"),
    opencode: path.join(root, "opencode"),
  };
}

function pluginDirsFor(root: string): Record<Host, string> {
  return {
    claude: path.join(root, "claude-plugin"),
    codex: path.join(root, "codex-plugin"),
    cursor: path.join(root, "cursor-plugin"),
    opencode: path.join(root, "opencode-plugin"),
  };
}

describe("emitAll — prune-before-emit (T2, UGB-04)", () => {
  test("a stale agent file (retired charter) inside agents/ vanishes after emit", async () => {
    const root = await tmpDir();
    try {
      const dirs = agentDirsFor(root);
      await fs.mkdir(dirs.claude, { recursive: true });
      const staleFile = path.join(dirs.claude, "massa-ai-retired-specialist.md");
      await fs.writeFile(staleFile, "stale content from a removed charter");

      await emitAll(dirs, {}, ["claude"]);

      await expect(fs.access(staleFile)).rejects.toThrow();
      // The real 17 charters are still there — prune did not clobber emit.
      const files = (await fs.readdir(dirs.claude)).filter((f) => f.endsWith(".md"));
      expect(files.length).toBe(17);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("emitVariants — prune-before-emit (T2, UGB-04)", () => {
  test("a stale file inside a still-supported profile dir vanishes after emit", async () => {
    const root = await tmpDir();
    try {
      const plugins = pluginDirsFor(root);
      const workDir = variantDir("claude", "work", plugins);
      await fs.mkdir(workDir, { recursive: true });
      const staleFile = path.join(workDir, "massa-ai-retired-specialist.md");
      await fs.writeFile(staleFile, "stale");

      await emitVariants(plugins, {}, ["claude"]);

      await expect(fs.access(staleFile)).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("a whole stale variant directory for a no-longer-supported profile is removed (not just detected)", async () => {
    const root = await tmpDir();
    try {
      const plugins = pluginDirsFor(root);
      const staleProfileDir = path.join(plugins.claude, "agent-profiles", "retired_profile");
      await fs.mkdir(staleProfileDir, { recursive: true });
      await fs.writeFile(path.join(staleProfileDir, "massa-ai-builder.md"), "stale\n");

      const supported = await emitVariants(plugins, {}, ["claude"]);

      await expect(fs.access(staleProfileDir)).rejects.toThrow();
      // staleVariantDirs() — the same detector --check uses — now reports clean.
      const stale = await staleVariantDirs(plugins.claude, supported.claude);
      expect(stale).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
