/**
 * Codex plugin manifest + structure tests (Phase 1, T5).
 *
 * Verifies the static plugin bundle shape against the spec acceptance
 * criteria (CPX-01, CPX-03, CPX-04, CPX-05):
 * - .codex-plugin/plugin.json has name, version, description, string skills,
 *   and an interface block — matching the shape Codex's plugin UI renders
 * - 6 skills/*.md files exist (map, index, find, def, graph, status)
 * - `skills/` holds exactly those 6 marker-free hand-authored files plus one
 *   marker-bearing generated file per live workflow (widened, workflow-commands
 *   T5, WFC-11) — the population lock a plain "6 named files exist" check
 *   could never catch drift in, since it never enumerated the directory
 * - hooks/hooks.json has exactly 6 event keys, each with an owned entry in
 *   Codex's nested matcher-group shape
 * - no plugin-local .mcp.json and no manifest "mcp" pointer — MCP is owned
 *   solely by scripts/install-agents.sh (writes ~/.codex/config.toml)
 * - hooks/massa-ai-hook symlink resolves to the claude-plugin binary
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import { collectWorkflowCommandEntries, WORKFLOW_COMMAND_MARKER } from "../../../scripts/lib/workflow-commands.ts";

const PLUGIN_ROOT = path.resolve(import.meta.dir, "..");
const REPO_ROOT = path.resolve(PLUGIN_ROOT, "../..");
const CLAUDE_PLUGIN_BIN = path.resolve(
  REPO_ROOT,
  "apps/claude-plugin/hooks/massa-ai-hook.ts",
);

beforeAll(async () => {
  const sentinel = path.join(PLUGIN_ROOT, "skills/debug.md");
  try {
    await fs.access(sentinel);
  } catch {
    throw new Error(
      `Generated workflow-command bundle missing at ${sentinel} — run 'bun run generate:artifacts' first.`,
    );
  }
});

async function readJson(p: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(p, "utf8"));
}

describe("codex-plugin manifest (T5 / CPX-01,03,04,05)", () => {
  test(".codex-plugin/plugin.json has name, version, description, string skills", async () => {
    const manifest = await readJson(
      path.join(PLUGIN_ROOT, ".codex-plugin/plugin.json"),
    );
    expect(manifest).toHaveProperty("name");
    expect(typeof manifest.name).toBe("string");
    expect(manifest).toHaveProperty("version");
    expect(typeof manifest.version).toBe("string");
    expect(manifest).toHaveProperty("description");
    expect(typeof manifest.description).toBe("string");
    // `skills` is a STRING path, not an array. Codex ships 203 manifests across
    // its bundled/curated/runtime marketplaces and every one uses the string
    // form; the array form is what kept massa-ai out of /plugins.
    expect(typeof manifest.skills).toBe("string");
    // MCP has exactly one writer (scripts/install-agents.sh). A manifest
    // pointer here would reintroduce a second registration path.
    expect(manifest).not.toHaveProperty("mcp");
    // No `hooks` pointer: it is not a Codex manifest key (0 of those 203
    // manifests declares one). Hooks reach Codex through ~/.codex/hooks.json,
    // written by install.sh. Re-adding it here would also point Codex at a
    // hooks.json whose <PLUGIN_DIR> placeholder is never substituted.
    expect(manifest).not.toHaveProperty("hooks");
  });

  test("manifest carries the interface block Codex's plugin UI renders", async () => {
    const manifest = await readJson(
      path.join(PLUGIN_ROOT, ".codex-plugin/plugin.json"),
    );
    const iface = manifest.interface as Record<string, unknown> | undefined;
    expect(iface).toBeDefined();
    expect(typeof iface!.displayName).toBe("string");
    expect(typeof iface!.shortDescription).toBe("string");
    expect(typeof iface!.category).toBe("string");
  });

  test("manifest version matches the root package.json version", async () => {
    const manifest = await readJson(
      path.join(PLUGIN_ROOT, ".codex-plugin/plugin.json"),
    );
    const rootPkg = await readJson(path.join(REPO_ROOT, "package.json"));
    expect(manifest.version).toBe(rootPkg.version);
  });

  test("6 skills/*.md files exist (map, index, find, def, graph, status)", async () => {
    const expected = ["map", "index", "find", "def", "graph", "status"];
    for (const name of expected) {
      const p = path.join(PLUGIN_ROOT, `skills/${name}.md`);
      const stat = await fs.stat(p);
      expect(stat.isFile()).toBe(true);
      const content = await fs.readFile(p, "utf8");
      // Adapted frontmatter keeps description + allowed-tools
      expect(content).toContain("description:");
      expect(content).toContain("allowed-tools:");
    }
  });

  test("skills/ holds exactly the 6 hand-authored marker-free quick files plus one marker-bearing generated file per live workflow (widened, WFC-11)", async () => {
    const skillsDir = path.join(PLUGIN_ROOT, "skills");
    const mdFiles = (await fs.readdir(skillsDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name);

    const quickFiles: string[] = [];
    const generatedFiles: string[] = [];
    for (const name of mdFiles) {
      const content = await fs.readFile(path.join(skillsDir, name), "utf8");
      if (content.includes(WORKFLOW_COMMAND_MARKER)) {
        generatedFiles.push(name);
      } else {
        quickFiles.push(name);
      }
    }

    const expectedQuick = ["map", "index", "find", "def", "graph", "status"].map((n) => `${n}.md`);
    expect(quickFiles.sort()).toEqual(expectedQuick.sort());

    const liveEntries = await collectWorkflowCommandEntries();
    expect(generatedFiles.length).toBe(liveEntries.length);
    expect(generatedFiles.sort()).toEqual(liveEntries.map((e) => `${e.stem}.md`).sort());
  });

  test("hooks/hooks.json contains exactly 6 event keys (nested under hooks), each with an owned entry", async () => {
    const cfg = await readJson(path.join(PLUGIN_ROOT, "hooks/hooks.json"));
    expect(cfg.hooks).toBeDefined();
    const expectedEvents = [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PreCompact",
      "Stop",
    ];
    expect(Object.keys(cfg.hooks).sort()).toEqual(expectedEvents.sort());
    for (const evt of expectedEvents) {
      const arr = cfg.hooks[evt] as unknown[];
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeGreaterThanOrEqual(1);
      const owned = arr.find(
        (e) =>
          (e as Record<string, unknown>)._massaAiOwned === true,
      );
      expect(owned).toBeDefined();
      // Each owned entry points at the binary with a subcommand
      const inner = (owned as Record<string, unknown>).hooks as {
        command: string;
      }[];
      expect(inner[0]!.command).toContain("massa-ai-hook");
    }
  });

  test("every owned hook entry uses Codex's nested matcher-group shape", async () => {
    // Codex addresses hook state as "<file>:<event>:<group>:<hook>", so an
    // entry whose type/command sit at the top level has no ":<hook>" index. It
    // is never enumerated, never appears in /hooks, and never fires. Releases
    // before this one wrote exactly that flat shape.
    const cfg = await readJson(path.join(PLUGIN_ROOT, "hooks/hooks.json"));
    const events = cfg.hooks as Record<string, Record<string, unknown>[]>;
    for (const entries of Object.values(events)) {
      for (const entry of entries) {
        expect(entry.type).toBeUndefined();
        expect(entry.command).toBeUndefined();
        expect(Array.isArray(entry.hooks)).toBe(true);
        const inner = entry.hooks as Record<string, unknown>[];
        expect(inner.length).toBeGreaterThanOrEqual(1);
        for (const h of inner) {
          expect(h.type).toBe("command");
          expect(h.command as string).toContain("massa-ai-hook");
        }
      }
    }
  });

  test("install.sh writes the nested shape, never the flat one", async () => {
    const src = await fs.readFile(path.join(PLUGIN_ROOT, "install.sh"), "utf8");
    // The push must nest under a `hooks: [` array.
    expect(src).toMatch(/push\(\{\s*\n\s*hooks: \[/);
    // And it must migrate pre-fix flat entries rather than leaving them to
    // satisfy the idempotency check and silently block the fix.
    expect(src).toContain("isOwnedMatcherGroup");
  });

  test("no plugin-local .mcp.json ships — MCP has a single writer", async () => {
    const present = await fs
      .access(path.join(PLUGIN_ROOT, ".mcp.json"))
      .then(() => true)
      .catch(() => false);
    expect(present).toBe(false);
  });

  test("installer delegates MCP registration to scripts/install-agents.sh", async () => {
    const src = await fs.readFile(path.join(PLUGIN_ROOT, "install.sh"), "utf8");
    expect(src).toContain("scripts/install-agents.sh");
    expect(src).toContain("--agent codex");
    // The old copy step must not come back.
    expect(src).not.toMatch(/cp\s+"\$SCRIPT_DIR\/\.mcp\.json"/);
  });

  test("hooks/massa-ai-hook is a real, executable, byte-identical copy of the claude-plugin binary (T14/PDO-14)", async () => {
    // Real file, not a symlink: `npm pack` silently drops symlink entries
    // (verified empirically — both the link and its target directory were
    // absent from the tarball, with no pack-time error). Generated by
    // scripts/generate-skill-artifacts.ts so it cannot drift.
    const linkPath = path.join(PLUGIN_ROOT, "hooks/massa-ai-hook");
    const stat = await fs.lstat(linkPath);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isFile()).toBe(true);
    expect(stat.mode & 0o111).toBeGreaterThan(0); // executable — invoked directly, no "bun run" prefix

    const [copy, source] = await Promise.all([
      fs.readFile(linkPath),
      fs.readFile(CLAUDE_PLUGIN_BIN),
    ]);
    expect(copy.equals(source)).toBe(true);
  });
});