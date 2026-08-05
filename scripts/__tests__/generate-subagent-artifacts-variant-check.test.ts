/**
 * `--check` full-inventory variant diff (T6, MPS-01 AC2, MPS-12).
 *
 * Exercises the two primitives `runCheck` composes for variant trees —
 * `diffHost` (now full-inventory, not a fixed known-name list) and
 * `staleVariantDirs` (whole stale-profile-directory detection) — against
 * scratch fixtures. Never touches the real `apps/*-plugin` tree: `runCheck`
 * itself is bound to the real repo paths (like the pre-existing active-dir
 * check), so its own red/green transition is exercised at T7's regen, not
 * here; these tests prove the composed primitives behave correctly in
 * isolation, which is what `runCheck` calls.
 */
import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  diffHost,
  emitVariants,
  staleVariantDirs,
  variantDir,
  type Host,
} from "../generate-subagent-artifacts.ts";
import { loadRegistry } from "../lib/model-profiles.ts";

const REGISTRY = loadRegistry();

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-variant-check-"));
}

function pluginDirsFor(root: string): Record<Host, string> {
  return {
    claude: path.join(root, "claude-plugin"),
    codex: path.join(root, "codex-plugin"),
    cursor: path.join(root, "cursor-plugin"),
    opencode: path.join(root, "opencode-plugin"),
  };
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  for (const f of await fs.readdir(src)) {
    await fs.copyFile(path.join(src, f), path.join(dest, f));
  }
}

describe("diffHost — full-inventory variant diff (MPS-01 AC2)", () => {
  test("clean tree: freshly generated == checked-in copy -> no diffs", async () => {
    const root = await tmpDir();
    try {
      const generated = pluginDirsFor(path.join(root, "generated"));
      await emitVariants(generated, {}, ["claude"]);
      const genWorkDir = variantDir("claude", "work", generated);

      const checkedInWorkDir = path.join(root, "checked-in", "claude-plugin", "agent-profiles", "work");
      await copyDir(genWorkDir, checkedInWorkDir);

      const diffs = await diffHost(genWorkDir, checkedInWorkDir, "claude");
      expect(diffs).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("observed red (a): a deleted variant file is flagged (missing in checked-in)", async () => {
    const root = await tmpDir();
    try {
      const generated = pluginDirsFor(path.join(root, "generated"));
      await emitVariants(generated, {}, ["claude"]);
      const genWorkDir = variantDir("claude", "work", generated);

      const checkedInWorkDir = path.join(root, "checked-in", "claude-plugin", "agent-profiles", "work");
      await copyDir(genWorkDir, checkedInWorkDir);
      await fs.rm(path.join(checkedInWorkDir, "massa-ai-builder.md"));

      const diffs = await diffHost(genWorkDir, checkedInWorkDir, "claude");
      expect(diffs).toContain("- massa-ai-builder.md (missing in checked-in)");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("observed red (b): a stale extra variant file is flagged (missing in generated)", async () => {
    const root = await tmpDir();
    try {
      const generated = pluginDirsFor(path.join(root, "generated"));
      await emitVariants(generated, {}, ["claude"]);
      const genWorkDir = variantDir("claude", "work", generated);

      const checkedInWorkDir = path.join(root, "checked-in", "claude-plugin", "agent-profiles", "work");
      await copyDir(genWorkDir, checkedInWorkDir);
      // A leftover file from a renamed/removed charter — the generator no
      // longer produces it, but it is still sitting in the checked-in tree.
      await fs.writeFile(path.join(checkedInWorkDir, "massa-ai-retired-specialist.md"), "stale\n");

      const diffs = await diffHost(genWorkDir, checkedInWorkDir, "claude");
      expect(diffs).toContain("+ massa-ai-retired-specialist.md (missing in generated)");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("staleVariantDirs — whole stale profile directory (MPS-01 AC2)", () => {
  test("clean tree: only currently-supported profile dirs present -> no stale dirs", async () => {
    const root = await tmpDir();
    try {
      const generated = pluginDirsFor(path.join(root, "generated"));
      const supported = await emitVariants(generated, {}, ["claude"]);
      const claudePluginRoot = path.join(root, "checked-in", "claude-plugin");
      for (const profile of supported.claude) {
        await copyDir(
          variantDir("claude", profile, generated),
          variantDir("claude", profile, { claude: claudePluginRoot } as Record<Host, string>),
        );
      }

      const stale = await staleVariantDirs(claudePluginRoot, supported.claude);
      expect(stale).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("no checked-in agent-profiles/ root at all -> no stale dirs (pre-T7 state, not a false positive)", async () => {
    const root = await tmpDir();
    try {
      const claudePluginRoot = path.join(root, "checked-in", "claude-plugin");
      await fs.mkdir(claudePluginRoot, { recursive: true });
      const stale = await staleVariantDirs(claudePluginRoot, ["balanced", "cheap", "heavy", "work", "home"]);
      expect(stale).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("observed red: a profile-removal leftover directory is flagged stale", async () => {
    const root = await tmpDir();
    try {
      const generated = pluginDirsFor(path.join(root, "generated"));
      const supported = await emitVariants(generated, {}, ["claude"]);
      const claudePluginRoot = path.join(root, "checked-in", "claude-plugin");
      for (const profile of supported.claude) {
        await copyDir(
          variantDir("claude", profile, generated),
          variantDir("claude", profile, { claude: claudePluginRoot } as Record<Host, string>),
        );
      }
      // Simulate: "retired_profile" used to be a supported profile and shipped
      // a variant dir; it was removed from the registry, but the checked-in
      // directory was never cleaned up.
      const retiredDir = path.join(claudePluginRoot, "agent-profiles", "retired_profile");
      await fs.mkdir(retiredDir, { recursive: true });
      await fs.writeFile(path.join(retiredDir, "massa-ai-builder.md"), "stale\n");

      const stale = await staleVariantDirs(claudePluginRoot, supported.claude);
      expect(stale).toContain("retired_profile");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("registry sanity: claude's currently-supported set does not include the opencode-only profiles", () => {
    // Not a magic-number pin — proves the fixture above exercises a realistic
    // supported set, not an empty or trivially-true one.
    expect(REGISTRY.profiles.open_models).toBeDefined();
    expect("claude" in REGISTRY.profiles.open_models!.hosts).toBe(false);
  });
});
