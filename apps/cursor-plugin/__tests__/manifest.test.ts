/**
 * Cursor plugin manifest + structure tests (Phase 2, T10).
 *
 * Verifies the static plugin bundle shape against the spec acceptance
 * criteria (CRS-01, CRS-03, CRS-04, CRS-05, CRS-06, CRS-08):
 * - 7 events in hooks/hooks.json including sessionStart + preCompact (historical gap fix)
 * - 6 skills/<name>/SKILL.md files exist
 * - `skills/` holds exactly those 6 marker-free hand-authored stem dirs plus
 *   one marker-bearing generated stem dir per live workflow (widened,
 *   workflow-commands T6, WFC-11)
 * - agents/massa-ai-navigator.md exists
 * - mcp.json declares the massa-ai MCP server (npx @massa-ai/mcp-client)
 * - .cursor-plugin/plugin.json has name and version
 * - hooks/massa-ai-hook symlink resolves to the claude-plugin binary
 * - directory layout matches vscode.cursor.plugins.registerPath auto-discovery
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import {
  collectWorkflowCommandEntries,
  WORKFLOW_COMMAND_MARKER,
  RESERVED_BUNDLE_ROOTS,
} from "../../../scripts/lib/workflow-commands.ts";

const PLUGIN_ROOT = path.resolve(import.meta.dir, "..");
const REPO_ROOT = path.resolve(PLUGIN_ROOT, "../..");
const CLAUDE_PLUGIN_BIN = path.resolve(
  REPO_ROOT,
  "apps/claude-plugin/hooks/massa-ai-hook.ts",
);

async function readJson(p: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(p, "utf8"));
}

beforeAll(async () => {
  const sentinel = path.join(PLUGIN_ROOT, "skills/debug/SKILL.md");
  try {
    await fs.access(sentinel);
  } catch {
    throw new Error(
      `Generated workflow-command bundle missing at ${sentinel} — run 'bun run generate:artifacts' first.`,
    );
  }
});

describe("cursor-plugin manifest (T10 / CRS-01,03,04,05,06,08)", () => {
  test("hooks/hooks.json contains 7 events including sessionStart + preCompact (historical gap fix)", async () => {
    const cfg = await readJson(path.join(PLUGIN_ROOT, "hooks/hooks.json"));
    expect(cfg).toHaveProperty("version");
    expect(cfg).toHaveProperty("hooks");
    const hooks = cfg.hooks as Record<string, unknown[]>;
    const expectedEvents = [
      "sessionStart",
      "sessionEnd",
      "beforeSubmitPrompt",
      "preToolUse",
      "postToolUse",
      "preCompact",
      "stop",
    ];
    expect(Object.keys(hooks).sort()).toEqual(expectedEvents.sort());
    // Historical gap fix: sessionStart + preCompact must be present
    expect(hooks).toHaveProperty("sessionStart");
    expect(hooks).toHaveProperty("preCompact");
    for (const evt of expectedEvents) {
      const arr = hooks[evt];
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeGreaterThanOrEqual(1);
      const owned = arr.find(
        (e) =>
          (e as Record<string, unknown>)._massaAiOwned === true,
      );
      expect(owned).toBeDefined();
      const cmd = (owned as Record<string, unknown>).command as string;
      expect(cmd).toContain("massa-ai-hook");
    }
  });

  test("6 skills/<name>/SKILL.md files exist (map, index, find, def, graph, status)", async () => {
    const expected = ["map", "index", "find", "def", "graph", "status"];
    for (const name of expected) {
      const p = path.join(PLUGIN_ROOT, `skills/${name}/SKILL.md`);
      const stat = await fs.stat(p);
      expect(stat.isFile()).toBe(true);
      const content = await fs.readFile(p, "utf8");
      // Adapted frontmatter keeps description + allowed-tools
      expect(content).toContain("description:");
      expect(content).toContain("allowed-tools:");
    }
  });

  test("skills/ holds exactly the 6 hand-authored marker-free quick stem dirs plus one marker-bearing generated stem dir per live workflow (widened, WFC-11)", async () => {
    const skillsDir = path.join(PLUGIN_ROOT, "skills");
    const reserved = new Set<string>(RESERVED_BUNDLE_ROOTS);
    const stemDirs = (await fs.readdir(skillsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !reserved.has(e.name))
      .map((e) => e.name);

    const quickStems: string[] = [];
    const generatedStems: string[] = [];
    for (const stem of stemDirs) {
      const skillMd = path.join(skillsDir, stem, "SKILL.md");
      let content: string;
      try {
        content = await fs.readFile(skillMd, "utf8");
      } catch {
        continue; // not a stem dir this lock is scoped to (e.g. nested agents/)
      }
      if (content.includes(WORKFLOW_COMMAND_MARKER)) {
        generatedStems.push(stem);
      } else {
        quickStems.push(stem);
      }
    }

    const expectedQuick = ["map", "index", "find", "def", "graph", "status"];
    expect(quickStems.sort()).toEqual(expectedQuick.sort());

    const liveEntries = await collectWorkflowCommandEntries();
    expect(generatedStems.length).toBe(liveEntries.length);
    expect(generatedStems.sort()).toEqual(liveEntries.map((e) => e.stem).sort());
  });

  test("agents/massa-ai-navigator.md exists", async () => {
    const p = path.join(PLUGIN_ROOT, "agents/massa-ai-navigator.md");
    const stat = await fs.stat(p);
    expect(stat.isFile()).toBe(true);
    const content = await fs.readFile(p, "utf8");
    expect(content).toContain("massa-ai-navigator");
  });

  test("no plugin-local mcp.json ships — MCP has a single writer", async () => {
    const present = await fs
      .access(path.join(PLUGIN_ROOT, "mcp.json"))
      .then(() => true)
      .catch(() => false);
    expect(present).toBe(false);
  });

  test("installer delegates MCP registration to scripts/install-agents.sh", async () => {
    const src = await fs.readFile(path.join(PLUGIN_ROOT, "install.sh"), "utf8");
    expect(src).toContain("scripts/install-agents.sh");
    expect(src).toContain("--agent cursor");
    // The old copy step must not come back.
    expect(src).not.toMatch(/cp\s+"\$SCRIPT_DIR\/mcp\.json"/);
  });

  test(".cursor-plugin/plugin.json has name and version", async () => {
    const manifest = await readJson(
      path.join(PLUGIN_ROOT, ".cursor-plugin/plugin.json"),
    );
    expect(manifest).toHaveProperty("name");
    expect(typeof manifest.name).toBe("string");
    expect(manifest).toHaveProperty("version");
    expect(typeof manifest.version).toBe("string");
    expect(manifest).toHaveProperty("description");
    expect(typeof manifest.description).toBe("string");
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

  test("directory layout matches vscode.cursor.plugins.registerPath auto-discovery", async () => {
    // Cursor auto-discovers: skills/, hooks/hooks.json, agents/. MCP is not
    // discovered from the plugin dir — Cursor reads ~/.cursor/mcp.json, which
    // scripts/install-agents.sh owns.
    const required = [
      "skills",
      "skills/map/SKILL.md",
      "skills/index/SKILL.md",
      "skills/find/SKILL.md",
      "skills/def/SKILL.md",
      "skills/graph/SKILL.md",
      "skills/status/SKILL.md",
      "hooks/hooks.json",
      "agents/massa-ai-navigator.md",
    ];
    for (const rel of required) {
      const p = path.join(PLUGIN_ROOT, rel);
      await fs.access(p); // throws if missing
    }
  });
});