/**
 * Per-profile variant emission (T5, MPS-01 AC1/AC3/AC5).
 *
 * `emitVariants` is the generator's new per-profile loop (design.md Component 1):
 * for each host, for each registry profile supporting that host, emit the full
 * charter set into `agent-profiles/<profile>/`, sibling of `agents/`. These tests
 * never touch the real `apps/*-plugin` tree — every dir is a temp fixture.
 */
import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  emitAll,
  emitVariants,
  profilesSupporting,
  variantDir,
  type Host,
} from "../generate-subagent-artifacts.ts";
import { loadRegistry } from "../lib/model-profiles.ts";

const REGISTRY = loadRegistry();

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-variants-"));
}

function pluginDirsFor(root: string): Record<Host, string> {
  return {
    claude: path.join(root, "claude-plugin"),
    codex: path.join(root, "codex-plugin"),
    cursor: path.join(root, "cursor-plugin"),
    opencode: path.join(root, "opencode-plugin"),
  };
}

function agentDirsFor(root: string): Record<Host, string> {
  return {
    claude: path.join(root, "claude"),
    codex: path.join(root, "codex"),
    cursor: path.join(root, "cursor"),
    opencode: path.join(root, "opencode"),
  };
}

async function readDirSorted(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).sort();
  } catch {
    return [];
  }
}

describe("profilesSupporting", () => {
  test("matches hostsSupportedBy membership, per host", () => {
    for (const host of ["claude", "codex", "cursor", "opencode"] as Host[]) {
      const supporting = profilesSupporting(REGISTRY, host);
      for (const p of supporting) {
        expect(Object.keys(REGISTRY.profiles[p]!.hosts)).toContain(host);
      }
    }
  });

  test("open_models/local_models support opencode only, not claude/codex/cursor", () => {
    expect(profilesSupporting(REGISTRY, "opencode")).toContain("open_models");
    for (const host of ["claude", "codex", "cursor"] as Host[]) {
      expect(profilesSupporting(REGISTRY, host)).not.toContain("open_models");
      expect(profilesSupporting(REGISTRY, host)).not.toContain("local_models");
    }
  });
});

describe("emitVariants — byte-equality round-trip (MPS-01 AC1)", () => {
  test("a sampled (claude, work) variant byte-equals a direct single-profile emission", async () => {
    const root = await tmpDir();
    try {
      const plugins = pluginDirsFor(root);
      await emitVariants(plugins, {}, ["claude"]);

      const direct = path.join(root, "direct-claude-work");
      await emitAll({ claude: direct } as Record<Host, string>, { profileFlag: "work", env: {} }, [
        "claude",
      ]);

      const variantPath = variantDir("claude", "work", plugins);
      const variantFiles = await readDirSorted(variantPath);
      const directFiles = await readDirSorted(direct);
      expect(variantFiles.length).toBeGreaterThan(0);
      expect(variantFiles).toEqual(directFiles);

      for (const f of variantFiles) {
        const [a, b] = await Promise.all([
          fs.readFile(path.join(variantPath, f)),
          fs.readFile(path.join(direct, f)),
        ]);
        expect(a.equals(b)).toBe(true);
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("a sampled (opencode, open_models) variant byte-equals a direct single-profile emission", async () => {
    const root = await tmpDir();
    try {
      const plugins = pluginDirsFor(root);
      await emitVariants(plugins, {}, ["opencode"]);

      const direct = path.join(root, "direct-opencode-open-models");
      await emitAll(
        { opencode: direct } as Record<Host, string>,
        { profileFlag: "open_models", env: {} },
        ["opencode"],
      );

      const variantPath = variantDir("opencode", "open_models", plugins);
      const variantFiles = await readDirSorted(variantPath);
      const directFiles = await readDirSorted(direct);
      expect(variantFiles.length).toBeGreaterThan(0);
      expect(variantFiles).toEqual(directFiles);

      for (const f of variantFiles) {
        const [a, b] = await Promise.all([
          fs.readFile(path.join(variantPath, f)),
          fs.readFile(path.join(direct, f)),
        ]);
        expect(a.equals(b)).toBe(true);
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("emitVariants — unsupported (host, profile) emits nothing (MPS-01 AC3)", () => {
  test("claude gets no agent-profiles/open_models directory at all", async () => {
    const root = await tmpDir();
    try {
      const plugins = pluginDirsFor(root);
      await emitVariants(plugins, {}, ["claude"]);
      const unsupportedDir = variantDir("claude", "open_models", plugins);
      await expect(fs.access(unsupportedDir)).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("returned profile list per host never includes a profile the host doesn't support", async () => {
    const root = await tmpDir();
    try {
      const plugins = pluginDirsFor(root);
      const out = await emitVariants(plugins, {}, ["claude", "codex", "cursor"]);
      for (const host of ["claude", "codex", "cursor"] as Host[]) {
        expect(out[host]).not.toContain("open_models");
        expect(out[host]).not.toContain("local_models");
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("active agents/ byte-equals agent-profiles/<default>/ (MPS-01 AC5)", () => {
  test("claude's active emission equals its default-profile variant, byte for byte", async () => {
    const root = await tmpDir();
    try {
      const active = agentDirsFor(root);
      const profiles = await emitAll(active, { env: {} }, ["claude"]);
      const plugins = pluginDirsFor(root);
      await emitVariants(plugins, {}, ["claude"]);

      const defaultVariantPath = variantDir("claude", profiles.claude, plugins);
      const activeFiles = await readDirSorted(active.claude);
      const variantFiles = await readDirSorted(defaultVariantPath);
      expect(activeFiles.length).toBeGreaterThan(0);
      expect(activeFiles).toEqual(variantFiles);

      for (const f of activeFiles) {
        const [a, b] = await Promise.all([
          fs.readFile(path.join(active.claude, f)),
          fs.readFile(path.join(defaultVariantPath, f)),
        ]);
        expect(a.equals(b)).toBe(true);
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("opencode's active emission equals its default-profile variant, byte for byte", async () => {
    const root = await tmpDir();
    try {
      const active = agentDirsFor(root);
      const profiles = await emitAll(active, { env: {} }, ["opencode"]);
      const plugins = pluginDirsFor(root);
      await emitVariants(plugins, {}, ["opencode"]);

      const defaultVariantPath = variantDir("opencode", profiles.opencode, plugins);
      const activeFiles = await readDirSorted(active.opencode);
      const variantFiles = await readDirSorted(defaultVariantPath);
      expect(activeFiles.length).toBeGreaterThan(0);
      expect(activeFiles).toEqual(variantFiles);

      for (const f of activeFiles) {
        const [a, b] = await Promise.all([
          fs.readFile(path.join(active.opencode, f)),
          fs.readFile(path.join(defaultVariantPath, f)),
        ]);
        expect(a.equals(b)).toBe(true);
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
