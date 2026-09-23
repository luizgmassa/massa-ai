/**
 * doctor.ts unit tests — runtimeDriftReport against temp-dir fixtures.
 * Covers both install routes (directory-source / registry-cache), the three
 * recorded versions, per-role frontmatter reads, variant-staleness (including
 * the incomparable case), the env override, INV1 (read-only, never throws),
 * and the AC-01.2 fallback fixture the plan critique required (non-directory
 * marketplace named → registry-cache, never a live-load claim).
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runtimeDriftReport } from "../doctor.js";
import { resolveClaudeMarketplaceInstall, readInstalledPluginVersion } from "../claude-marketplace.js";

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-doctor-"));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/** Stages the claude plugin registries for a directory-source marketplace
 *  whose live bundle root is `<repo>/apps/claude-plugin`. */
function stageDirectorySource(bundleVersion: string): string {
  const repoRoot = path.join(home, "repo");
  writeJson(path.join(repoRoot, ".claude-plugin", "marketplace.json"), {
    plugins: [{ name: "massa-ai", source: "./apps/claude-plugin" }],
  });
  const bundleRoot = path.join(repoRoot, "apps", "claude-plugin");
  writeJson(path.join(bundleRoot, ".claude-plugin", "plugin.json"), { version: bundleVersion });
  writeJson(path.join(home, ".claude", "plugins", "known_marketplaces.json"), {
    massa: { source: { source: "github", repo: "octo/other" } },
    "massa-ai": { source: { source: "directory" }, installLocation: repoRoot },
  });
  return bundleRoot;
}

function stageState(claude: Record<string, unknown>): void {
  writeJson(path.join(home, ".config", "massa-ai", "install-state.json"), {
    version: 2,
    platforms: { claude },
  });
}

function stagePinnedRegistry(version: string, installPath: string): void {
  writeJson(path.join(home, ".claude", "plugins", "installed_plugins.json"), {
    version: 1,
    plugins: {
      "massa-ai@massa-ai": [
        { scope: "user", installPath, version, installedAt: "t0", lastUpdated: "t1" },
      ],
    },
  });
}

const AGENT_FILE = "---\nname: code-explorer\nmodel: glm-5.3-flash-tencent-claude[1m]\neffort: max\n---\n<!-- massa-ai-owned: true -->\nbody\n";

/** INV1: snapshot every file under `root` (relativePath → bytes). */
function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.set(path.relative(root, full), fs.readFileSync(full, "utf8"));
    }
  };
  walk(root);
  return out;
}

describe("runtimeDriftReport — directory-source route", () => {
  test("reports the live tree, both stale version recordings, roles, and drift", () => {
    const bundleRoot = stageDirectorySource("1.57.0");
    writeText(path.join(bundleRoot, "agents", "code-explorer.md"), AGENT_FILE);
    writeText(path.join(bundleRoot, "agents", "designer.md"), AGENT_FILE.replace("code-explorer", "designer"));
    writeText(path.join(bundleRoot, "agent-profiles", "work", "code-explorer.md"), AGENT_FILE);
    writeText(path.join(bundleRoot, "agent-profiles", "work", "designer.md"), AGENT_FILE.replace("code-explorer", "designer"));
    stageState({
      root: "/x", skills: [], skillsOwner: "plugin",
      installRoute: "marketplace",
      plugin: { version: "1.56.0" },
      modelProfile: { profile: "work", switchedAt: "t" },
    });
    stagePinnedRegistry("1.56.0", path.join(home, "unused-cache"));

    const report = runtimeDriftReport({ targetHome: home, env: {} });

    expect(report.route).toBe("directory-source");
    expect(report.liveRoot).toBe(bundleRoot);
    expect(report.sourceVersion).toBe("1.57.0");
    expect(report.stateVersion).toBe("1.56.0");
    expect(report.pinnedVersion).toBe("1.56.0");
    expect(report.versionDrift).toBe(true);
    expect(report.activeProfile).toBe("work");
    expect(report.roles.map((r) => r.name).sort()).toEqual([
      "code-explorer.md",
      "designer.md",
    ]);
    expect(report.roles.every((r) => r.model === "glm-5.3-flash-tencent-claude[1m]")).toBe(true);
    expect(report.roles.every((r) => r.effort === "max")).toBe(true);
    expect(report.roles.every((r) => r.staleVariant === false)).toBe(true);
    expect(report.profileMaterialized).toBe(false);
    expect(report.envOverride).toBeNull();
  });

  test("a regenerated variant that disagrees with the active file is drift (re-switch needed)", () => {
    const bundleRoot = stageDirectorySource("1.57.0");
    writeText(path.join(bundleRoot, "agents", "code-explorer.md"), AGENT_FILE);
    writeText(
      path.join(bundleRoot, "agent-profiles", "work", "code-explorer.md"),
      AGENT_FILE.replace("glm-5.3-flash", "glm-5.2"),
    );
    stageState({
      root: "/x", skills: [], skillsOwner: "plugin",
      installRoute: "marketplace", plugin: { version: "1.57.0" },
      modelProfile: { profile: "work", switchedAt: "t" },
    });

    const report = runtimeDriftReport({ targetHome: home, env: {} });
    expect(report.roles.find((r) => r.name === "code-explorer.md")?.staleVariant).toBe(true);
    expect(report.profileMaterialized).toBe(true);
  });

  test("an incomparable pair (variant missing) is unknown, not drift (no false positives)", () => {
    const bundleRoot = stageDirectorySource("1.57.0");
    writeText(path.join(bundleRoot, "agents", "code-explorer.md"), AGENT_FILE);
    stageState({
      root: "/x", skills: [], skillsOwner: "plugin",
      installRoute: "marketplace", plugin: { version: "1.57.0" },
      modelProfile: { profile: "work", switchedAt: "t" },
    });

    const report = runtimeDriftReport({ targetHome: home, env: {} });
    expect(report.roles.find((r) => r.name === "code-explorer.md")?.staleVariant).toBe(false);
    expect(report.profileMaterialized).toBe(false);
  });
});

describe("runtimeDriftReport — registry-cache route (AC-01.2 fallback fixture)", () => {
  test("a non-directory marketplace falls through to the pinned cache, never live-load semantics", () => {
    const cacheRoot = path.join(home, "cache", "massa-ai", "1.56.0");
    writeJson(path.join(cacheRoot, ".claude-plugin", "plugin.json"), { version: "1.56.0" });
    writeText(path.join(cacheRoot, "agents", "code-explorer.md"), AGENT_FILE);
    writeJson(path.join(home, ".claude", "plugins", "known_marketplaces.json"), {
      "massa-ai": { source: { source: "github", repo: "octo/example" }, installLocation: "/opt/unused" },
    });
    stagePinnedRegistry("1.56.0", cacheRoot);
    stageState({
      root: "/x", skills: [], skillsOwner: "plugin",
      installRoute: "marketplace", plugin: { version: "1.56.0" },
    });

    const report = runtimeDriftReport({ targetHome: home, env: {} });
    expect(report.route).toBe("registry-cache");
    expect(report.liveRoot).toBe(cacheRoot);
    expect(report.sourceVersion).toBe("1.56.0");
    expect(report.versionDrift).toBe(false);
    expect(report.roles).toHaveLength(1);

    const install = resolveClaudeMarketplaceInstall({ targetHome: home });
    expect(install?.route).toBe("registry-cache");
    expect(readInstalledPluginVersion({ targetHome: home })).toBe("1.56.0");
  });
});

describe("runtimeDriftReport — degraded and guarded (INV1)", () => {
  test("empty home resolves unresolved with nulls, empty roles, and never throws", () => {
    const report = runtimeDriftReport({ targetHome: home, env: {} });
    expect(report.route).toBe("unresolved");
    expect(report.liveRoot).toBeNull();
    expect(report.sourceVersion).toBeNull();
    expect(report.stateVersion).toBeNull();
    expect(report.pinnedVersion).toBeNull();
    expect(report.activeProfile).toBeNull();
    expect(report.roles).toEqual([]);
    expect(report.versionDrift).toBe(false);
    expect(report.profileMaterialized).toBe(false);
    expect(report.envOverride).toBeNull();
  });

  test("corrupt install-state degrades to nulls instead of throwing", () => {
    const statePath = path.join(home, ".config", "massa-ai", "install-state.json");
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, "{ not json");
    const report = runtimeDriftReport({ targetHome: home, env: {} });
    expect(report.stateVersion).toBeNull();
    expect(report.activeProfile).toBeNull();
  });

  test("the first present, non-blank override var wins; blank counts as unset", () => {
    expect(runtimeDriftReport({ targetHome: home, env: { CLAUDE_CODE_SUBAGENT_MODEL: "minimax-m3" } }).envOverride)
      .toEqual({ name: "CLAUDE_CODE_SUBAGENT_MODEL", value: "minimax-m3" });
    expect(runtimeDriftReport({ targetHome: home, env: { CLAUDE_CODE_SUBAGENT_MODEL: "   " } }).envOverride)
      .toBeNull();
  });

  test("read-only: the report leaves every staged byte identical", () => {
    const bundleRoot = stageDirectorySource("1.57.0");
    writeText(path.join(bundleRoot, "agents", "code-explorer.md"), AGENT_FILE);
    writeText(path.join(bundleRoot, "agent-profiles", "work", "code-explorer.md"), AGENT_FILE);
    stageState({ root: "/x", skills: [], skillsOwner: "plugin", installRoute: "marketplace", plugin: { version: "1.56.0" } });
    stagePinnedRegistry("1.56.0", path.join(home, "unused-cache"));

    const before = snapshot(home);
    runtimeDriftReport({ targetHome: home, env: {} });
    const after = snapshot(home);
    expect(after.size).toBe(before.size);
    for (const [rel, content] of before) {
      expect(after.get(rel)).toBe(content);
    }
  });
});
