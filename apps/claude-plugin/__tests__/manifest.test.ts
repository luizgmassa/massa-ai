/**
 * Claude Code plugin manifest + marketplace tests.
 *
 * Before this feature, apps/claude-plugin/ had no .claude-plugin/plugin.json
 * and the repo had no marketplace.json, so massa-ai could never appear in
 * /plugin no matter how much of it install.sh wired into ~/.claude/. These
 * tests pin the two files that make the plugin discoverable, plus the
 * constraints that keep it safe to install:
 *
 * - no `mcp` key (scripts/install-agents.sh is the single writer of host MCP)
 * - hooks/hooks.json covers exactly the events install.sh wires, addressed via
 *   ${CLAUDE_PLUGIN_ROOT} (Claude Code COPIES the plugin dir into a cache on
 *   install, so an absolute repo path would break for every installed user)
 * - manifest version tracks the root package.json (scripts/version-sync.ts
 *   cannot glob a dotdir, so it carries these paths explicitly)
 */

import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";

const PLUGIN_ROOT = path.resolve(import.meta.dir, "..");
const REPO_ROOT = path.resolve(PLUGIN_ROOT, "../..");

// The 5 events wired by install.sh (merge_settings_hooks EVENTS).
const EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PostToolUse",
  "PreCompact",
  "Stop",
];

async function readJson(p: string): Promise<Record<string, any>> {
  return JSON.parse(await fs.readFile(p, "utf8"));
}

describe("claude-plugin manifest", () => {
  test(".claude-plugin/plugin.json exists, parses, and is named massa-ai", async () => {
    const manifest = await readJson(
      path.join(PLUGIN_ROOT, ".claude-plugin/plugin.json"),
    );
    expect(manifest.name).toBe("massa-ai");
    expect(typeof manifest.version).toBe("string");
    expect(typeof manifest.description).toBe("string");
  });

  test("manifest declares no mcp key — MCP has a single writer", async () => {
    const manifest = await readJson(
      path.join(PLUGIN_ROOT, ".claude-plugin/plugin.json"),
    );
    expect(manifest).not.toHaveProperty("mcp");
    expect(manifest).not.toHaveProperty("mcpServers");
  });

  test("manifest version matches the root package.json version", async () => {
    const manifest = await readJson(
      path.join(PLUGIN_ROOT, ".claude-plugin/plugin.json"),
    );
    const rootPkg = await readJson(path.join(REPO_ROOT, "package.json"));
    expect(manifest.version).toBe(rootPkg.version);
  });

  test("no plugin-local .mcp.json ships", async () => {
    const present = await fs
      .access(path.join(PLUGIN_ROOT, ".mcp.json"))
      .then(() => true)
      .catch(() => false);
    expect(present).toBe(false);
  });
});

describe("claude-plugin hooks/hooks.json", () => {
  test("covers exactly the 5 events install.sh wires", async () => {
    const cfg = await readJson(path.join(PLUGIN_ROOT, "hooks/hooks.json"));
    expect(Object.keys(cfg.hooks).sort()).toEqual([...EVENTS].sort());
  });

  test("every entry uses the nested matcher-group shape", async () => {
    const cfg = await readJson(path.join(PLUGIN_ROOT, "hooks/hooks.json"));
    for (const entries of Object.values(cfg.hooks) as any[][]) {
      expect(entries.length).toBeGreaterThanOrEqual(1);
      for (const entry of entries) {
        expect(Array.isArray(entry.hooks)).toBe(true);
        for (const h of entry.hooks) {
          expect(h.type).toBe("command");
          expect(typeof h.command).toBe("string");
        }
      }
    }
  });

  test("commands address the binary via ${CLAUDE_PLUGIN_ROOT}, never an absolute repo path", async () => {
    const raw = await fs.readFile(
      path.join(PLUGIN_ROOT, "hooks/hooks.json"),
      "utf8",
    );
    const cfg = JSON.parse(raw);
    for (const entries of Object.values(cfg.hooks) as any[][]) {
      for (const entry of entries) {
        for (const h of entry.hooks) {
          expect(h.command).toContain("${CLAUDE_PLUGIN_ROOT}");
        }
      }
    }
    // Claude Code copies the plugin dir on install; an absolute path baked at
    // authoring time would point outside the copy on every other machine.
    expect(raw).not.toContain(REPO_ROOT);
    expect(raw).not.toMatch(/"command": "[^"]*\/Users\//);
  });

  test("the referenced hook binary exists in the plugin dir", async () => {
    // The plugin is self-contained once copied: the binary must live inside it.
    const stat = await fs.stat(path.join(PLUGIN_ROOT, "hooks/massa-ai-hook.ts"));
    expect(stat.isFile()).toBe(true);
  });
});

describe("install.sh double-fire guard", () => {
  test("reads the plugin registry from $HOME, not the install scope", async () => {
    const src = await fs.readFile(path.join(PLUGIN_ROOT, "install.sh"), "utf8");
    // Claude Code records plugin installs at user scope even for --project, so
    // a $TARGET-relative lookup would never find the file and silently no-op.
    expect(src).toContain(
      'PLUGIN_REGISTRY="$HOME/.claude/plugins/installed_plugins.json"',
    );
    expect(src).not.toContain("$TARGET/plugins/installed_plugins.json");
  });

  test("the guard fails open — a malformed registry must not block install", async () => {
    const src = await fs.readFile(path.join(PLUGIN_ROOT, "install.sh"), "utf8");
    expect(src).toContain("pluginAlreadyInstalled");
    expect(src).toContain("wiring hooks anyway");
  });
});

describe("repo marketplaces", () => {
  test("Claude marketplace parses and its plugin source resolves to the plugin dir", async () => {
    const mp = await readJson(
      path.join(REPO_ROOT, ".claude-plugin/marketplace.json"),
    );
    expect(mp.name).toBe("massa-ai");
    expect(Array.isArray(mp.plugins)).toBe(true);
    expect(mp.plugins).toHaveLength(1);

    const entry = mp.plugins[0];
    const manifest = await readJson(
      path.join(PLUGIN_ROOT, ".claude-plugin/plugin.json"),
    );
    expect(entry.name).toBe(manifest.name);

    const resolved = path.resolve(REPO_ROOT, entry.source);
    expect((await fs.stat(resolved)).isDirectory()).toBe(true);
    // The source dir must itself carry the manifest, or /plugin install fails.
    await fs.access(path.join(resolved, ".claude-plugin/plugin.json"));
  });

  test("Codex marketplace parses and its plugin source resolves to the plugin dir", async () => {
    const mp = await readJson(
      path.join(REPO_ROOT, ".agents/plugins/marketplace.json"),
    );
    expect(mp.name).toBe("massa-ai");
    expect(mp.plugins).toHaveLength(1);

    const entry = mp.plugins[0];
    expect(entry.source.source).toBe("local");

    const resolved = path.resolve(REPO_ROOT, entry.source.path);
    expect((await fs.stat(resolved)).isDirectory()).toBe(true);
    const manifest = await readJson(
      path.join(resolved, ".codex-plugin/plugin.json"),
    );
    expect(entry.name).toBe(manifest.name);
  });
});
