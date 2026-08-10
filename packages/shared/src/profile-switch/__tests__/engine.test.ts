/**
 * engine.ts unit tests — listProfiles / switchProfile against temp-dir
 * fixtures. Covers MPS-02, MPS-09, MPS-10 and every row of the design's
 * Error Handling Strategy table.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveHostLayout, type Host, type HostFileLayout } from "../hosts.js";
import { acquireLock } from "../lock.js";
import { listProfiles, switchProfile } from "../engine.js";
import { reportSucceeded } from "../report.js";

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-engine-"));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function statePath(h: string): string {
  return path.join(h, ".config", "massa-ai", "install-state.json");
}

function layoutFor(h: string, host: Host): HostFileLayout {
  const layout = resolveHostLayout(host, { targetHome: h });
  if (layout.route !== "files") throw new Error(`expected files route for ${host}`);
  return layout;
}

function stageVariant(h: string, host: Host, profile: string, files: Record<string, string>): void {
  const dir = layoutFor(h, host).variantDir(profile);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
}

function stageActive(h: string, host: Host, files: Record<string, string>): void {
  const dir = layoutFor(h, host).activeDir;
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
}

function writeState(h: string, state: unknown): string {
  const p = statePath(h);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + "\n");
  return p;
}

/** Stages `<h>/.claude/plugins/installed_plugins.json` naming `installPath`
 * as the single "user"-scoped record for the massa-ai plugin — the fixture
 * `resolveClaudeMarketplaceRoot` (claude-marketplace.test.ts's own subject)
 * reads. Does NOT create `installPath` itself — callers stage that
 * separately so a test can exercise the "path missing on disk" case too. */
function stageMarketplaceRegistry(h: string, installPath: string): void {
  const registryPath = path.join(h, ".claude", "plugins", "installed_plugins.json");
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(
    registryPath,
    JSON.stringify(
      {
        version: 1,
        plugins: {
          "massa-ai@massa-ai": [
            { scope: "user", installPath, version: "1.0.0", installedAt: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-01T00:00:00Z" },
          ],
        },
      },
      null,
      2,
    ),
  );
}

describe("listProfiles", () => {
  test("lists available profiles per host purely from on-disk variant dirs, no registry access", () => {
    stageVariant(home, "claude", "balanced", { "massa-ai-planner.md": "b" });
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "w" });
    stageVariant(home, "codex", "balanced", { "massa-ai-planner.toml": "b" });
    stageActive(home, "claude", { "massa-ai-planner.md": "b" });

    const inv = listProfiles({ targetHome: home });
    const claude = inv.hosts.find((h) => h.host === "claude")!;
    expect(claude.installed).toBe(true);
    expect([...claude.availableProfiles].sort()).toEqual(["balanced", "work"]);
    expect(claude.activeProfile).toBe("balanced"); // default when unrecorded (P1 AC7)

    const codex = inv.hosts.find((h) => h.host === "codex")!;
    expect(codex.installed).toBe(false); // no active dir staged
    expect(codex.availableProfiles).toEqual(["balanced"]);

    const cursor = inv.hosts.find((h) => h.host === "cursor")!;
    expect(cursor.skipped).toBe(true);
  });

  test("reports recorded active profile and bundle version from existing state", () => {
    stageVariant(home, "claude", "home", { "massa-ai-planner.md": "h" });
    writeState(home, {
      version: 2,
      platforms: {
        claude: {
          root: "/x",
          skills: [],
          skillsOwner: "plugin",
          plugin: { version: "1.23.0", installedAt: "2026-01-01T00:00:00Z" },
          modelProfile: { profile: "home", switchedAt: "2026-01-02T00:00:00Z" },
        },
      },
    });

    const inv = listProfiles({ targetHome: home });
    const claude = inv.hosts.find((h) => h.host === "claude")!;
    expect(claude.activeProfile).toBe("home");
    expect(claude.bundleVersion).toBe("1.23.0");
  });

  test("(i) honours opts.hostDefaults as the fallback for an unrecorded host", () => {
    stageVariant(home, "claude", "local_models", { "massa-ai-planner.md": "b" });
    // No install-state written -> claude has no recorded modelProfile.

    const inv = listProfiles({ targetHome: home, hostDefaults: { claude: "local_models" } });
    const claude = inv.hosts.find((h) => h.host === "claude")!;
    expect(claude.activeProfile).toBe("local_models");
  });

  test("(i) omitting opts.hostDefaults still yields the last-resort \"balanced\" literal", () => {
    stageVariant(home, "claude", "balanced", { "massa-ai-planner.md": "b" });
    // No install-state, no hostDefaults passed at all.

    const inv = listProfiles({ targetHome: home });
    const claude = inv.hosts.find((h) => h.host === "claude")!;
    expect(claude.activeProfile).toBe("balanced");
  });

  test("(i) a recorded modelProfile still wins over opts.hostDefaults", () => {
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "b" });
    writeState(home, {
      version: 2,
      platforms: {
        claude: {
          root: "/x",
          skills: [],
          skillsOwner: "plugin",
          modelProfile: { profile: "work", switchedAt: "2026-01-02T00:00:00Z" },
        },
      },
    });

    const inv = listProfiles({ targetHome: home, hostDefaults: { claude: "local_models" } });
    const claude = inv.hosts.find((h) => h.host === "claude")!;
    expect(claude.activeProfile).toBe("work");
  });
});

describe("switchProfile — happy path", () => {
  test("switches a file-route host, overwrites only massa-ai-owned files, records state only after copies", () => {
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "opus" });
    stageActive(home, "claude", { "massa-ai-planner.md": "sonnet", "user-notes.md": "keep me" });
    writeState(home, {
      version: 2,
      platforms: { claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "file" } },
    });

    const report = switchProfile({ profile: "work", host: "claude", targetHome: home });
    expect(report.hosts).toEqual([{ host: "claude", status: "switched", filesChanged: 1 }]);
    expect(report.restartRequired).toBe(true);

    const activeDir = layoutFor(home, "claude").activeDir;
    expect(fs.readFileSync(path.join(activeDir, "massa-ai-planner.md"), "utf-8")).toBe("opus");
    // Non-massa-ai file in the same directory is never touched.
    expect(fs.readFileSync(path.join(activeDir, "user-notes.md"), "utf-8")).toBe("keep me");

    const state = JSON.parse(fs.readFileSync(statePath(home), "utf-8"));
    expect(state.platforms.claude.modelProfile.profile).toBe("work");
    expect(state.platforms.claude.installRoute).toBe("file"); // preserved, not overwritten
  });

  test("host filter switches only the requested host", () => {
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "opus" });
    stageActive(home, "claude", { "massa-ai-planner.md": "sonnet" });
    stageVariant(home, "codex", "work", { "massa-ai-planner.toml": "opus" });
    stageActive(home, "codex", { "massa-ai-planner.toml": "sonnet" });
    writeState(home, {
      version: 2,
      platforms: {
        claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "file" },
        codex: { root: "/y", skills: [], skillsOwner: "plugin", installRoute: "file" },
      },
    });

    const report = switchProfile({ profile: "work", host: "claude", targetHome: home });
    expect(report.hosts.map((h) => h.host)).toEqual(["claude"]);

    const codexActive = layoutFor(home, "codex").activeDir;
    expect(fs.readFileSync(path.join(codexActive, "massa-ai-planner.toml"), "utf-8")).toBe("sonnet"); // untouched
  });

  test("dry-run changes nothing on disk", () => {
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "opus" });
    stageActive(home, "claude", { "massa-ai-planner.md": "sonnet" });
    const sp = writeState(home, {
      version: 2,
      platforms: { claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "file" } },
    });
    const before = fs.readFileSync(sp, "utf-8");
    const activeFile = path.join(layoutFor(home, "claude").activeDir, "massa-ai-planner.md");
    const beforeContent = fs.readFileSync(activeFile, "utf-8");

    const report = switchProfile({ profile: "work", host: "claude", targetHome: home, dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.restartRequired).toBe(false);
    expect(fs.readFileSync(activeFile, "utf-8")).toBe(beforeContent);
    expect(fs.readFileSync(sp, "utf-8")).toBe(before);
  });

  test("idempotent re-run: switching to the already-active profile is safe and repeatable", () => {
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "opus" });
    stageActive(home, "claude", { "massa-ai-planner.md": "sonnet" });
    writeState(home, {
      version: 2,
      platforms: { claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "file" } },
    });

    switchProfile({ profile: "work", host: "claude", targetHome: home });
    const second = switchProfile({ profile: "work", host: "claude", targetHome: home });
    expect(second.hosts[0]).toEqual({ host: "claude", status: "switched", filesChanged: 1 });
    const activeFile = path.join(layoutFor(home, "claude").activeDir, "massa-ai-planner.md");
    expect(fs.readFileSync(activeFile, "utf-8")).toBe("opus");
  });
});

describe("switchProfile — Error Handling Strategy: unknown profile (MPS-09)", () => {
  test("unknown profile fails loud, lists available profiles, changes no files", () => {
    stageVariant(home, "claude", "balanced", { "massa-ai-planner.md": "b" });
    stageActive(home, "claude", { "massa-ai-planner.md": "b" });
    writeState(home, {
      version: 2,
      platforms: { claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "file" } },
    });

    expect(() => switchProfile({ profile: "nonexistent", targetHome: home })).toThrow();
    try {
      switchProfile({ profile: "nonexistent", targetHome: home });
    } catch (err) {
      expect((err as Error).name).toBe("UnknownProfileError");
      expect((err as Error).message).toContain("balanced");
    }
    const activeFile = path.join(layoutFor(home, "claude").activeDir, "massa-ai-planner.md");
    expect(fs.readFileSync(activeFile, "utf-8")).toBe("b");
  });
});

describe("switchProfile — Error Handling Strategy: unsupported host (MPS-09)", () => {
  test("a profile absent for one host reports 'unsupported' there while another host still switches", () => {
    stageVariant(home, "claude", "open_models", { "massa-ai-planner.md": "oss" });
    stageActive(home, "claude", { "massa-ai-planner.md": "opus" });
    stageVariant(home, "codex", "balanced", { "massa-ai-planner.toml": "b" }); // no open_models for codex
    stageActive(home, "codex", { "massa-ai-planner.toml": "b" });
    writeState(home, {
      version: 2,
      platforms: {
        claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "file" },
        codex: { root: "/y", skills: [], skillsOwner: "plugin", installRoute: "file" },
      },
    });

    const report = switchProfile({ profile: "open_models", targetHome: home, hosts: ["claude", "codex"] });
    const claudeRow = report.hosts.find((h) => h.host === "claude")!;
    const codexRow = report.hosts.find((h) => h.host === "codex")!;
    expect(claudeRow.status).toBe("switched");
    expect(codexRow.status).toBe("unsupported");
    expect(codexRow.reason).toContain("open_models");
    expect(reportSucceeded(report)).toBe(false); // mixed report -> non-zero exit for callers
  });

  test("a host whose bundle predates variants (no agent-profiles dir at all) reports the upgrade-plugin reason", () => {
    stageActive(home, "codex", { "massa-ai-planner.toml": "b" }); // active dir exists, no variants dir ever created
    writeState(home, {
      version: 2,
      platforms: { codex: { root: "/y", skills: [], skillsOwner: "plugin", installRoute: "file" } },
    });
    // Give the profile a home elsewhere so it's not globally unknown.
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "opus" });
    stageActive(home, "claude", { "massa-ai-planner.md": "s" });
    writeState(home, {
      version: 2,
      platforms: {
        claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "file" },
        codex: { root: "/y", skills: [], skillsOwner: "plugin", installRoute: "file" },
      },
    });

    const report = switchProfile({ profile: "work", targetHome: home, hosts: ["claude", "codex"] });
    const codexRow = report.hosts.find((h) => h.host === "codex")!;
    expect(codexRow.status).toBe("unsupported");
    expect(codexRow.reason).toMatch(/upgrade plugin/i);
  });
});

describe("switchProfile — Cursor is always skipped with an explicit reason", () => {
  test("cursor never touches files and is reported skipped even when requested explicitly", () => {
    const report = switchProfile({ profile: "anything", host: "cursor", targetHome: home });
    expect(report.hosts).toEqual([{ host: "cursor", status: "skipped", reason: expect.stringContaining("inherit") }]);
  });
});

describe("switchProfile — Error Handling Strategy: marketplace-route refusal (F1)", () => {
  test("installRoute absent refuses loud (never guesses from file absence)", () => {
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "opus" });
    stageActive(home, "claude", { "massa-ai-planner.md": "sonnet" });
    writeState(home, { version: 2, platforms: { claude: { root: "/x", skills: [], skillsOwner: "plugin" } } });

    const report = switchProfile({ profile: "work", host: "claude", targetHome: home });
    expect(report.hosts[0].status).toBe("failed");
    expect(report.hosts[0].reason?.toLowerCase()).toContain("install route");
    const activeFile = path.join(layoutFor(home, "claude").activeDir, "massa-ai-planner.md");
    expect(fs.readFileSync(activeFile, "utf-8")).toBe("sonnet"); // untouched
  });

  // T18/CPP-06: claude+marketplace now PROCEEDS when the install root
  // resolves (see the dedicated "Claude marketplace parity" describe block
  // below) — this fixture stages no `installed_plugins.json`, so the root is
  // genuinely unresolvable and the failure below is CPP-06's "unresolved
  // path" reason, not the pre-T18 blanket marketplace refusal.
  test('installRoute "marketplace" with no resolvable install root fails, naming the unresolved registry path', () => {
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "opus" });
    stageActive(home, "claude", { "massa-ai-planner.md": "sonnet" });
    writeState(home, {
      version: 2,
      platforms: { claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "marketplace" } },
    });

    const report = switchProfile({ profile: "work", host: "claude", targetHome: home });
    expect(report.hosts[0].status).toBe("failed");
    expect(report.hosts[0].reason).toMatch(/marketplace/i);
    expect(report.hosts[0].reason).toContain(path.join(home, ".claude", "plugins", "installed_plugins.json"));
    // Never falls back to the $HOME-derived file-route path (CPP-06) — the
    // staged ~/.claude/agents/massa-ai-planner.md is untouched.
    const activeFile = path.join(layoutFor(home, "claude").activeDir, "massa-ai-planner.md");
    expect(fs.readFileSync(activeFile, "utf-8")).toBe("sonnet");
  });
});

describe("Claude marketplace parity (T18, CPP-03..06)", () => {
  test("(CPP-03) listProfiles reports installed:true + variants from the resolved marketplace root", () => {
    const cacheRoot = path.join(home, ".claude", "plugins", "cache", "massa-ai", "massa-ai", "1.0.0");
    fs.mkdirSync(path.join(cacheRoot, "agent-profiles", "balanced"), { recursive: true });
    fs.writeFileSync(path.join(cacheRoot, "agent-profiles", "balanced", "massa-ai-planner.md"), "b");
    fs.mkdirSync(path.join(cacheRoot, "agents"), { recursive: true });
    stageMarketplaceRegistry(home, cacheRoot);
    writeState(home, {
      version: 2,
      platforms: { claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "marketplace" } },
    });

    const inv = listProfiles({ targetHome: home });
    const claude = inv.hosts.find((h) => h.host === "claude")!;
    expect(claude.installed).toBe(true);
    expect(claude.availableProfiles).toEqual(["balanced"]);
  });

  test("(CPP-06) listProfiles reports installed:false + no variants when the marketplace root is unresolvable", () => {
    writeState(home, {
      version: 2,
      platforms: { claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "marketplace" } },
    });
    // No installed_plugins.json staged — root genuinely unresolvable.

    const inv = listProfiles({ targetHome: home });
    const claude = inv.hosts.find((h) => h.host === "claude")!;
    expect(claude.installed).toBe(false);
    expect(claude.availableProfiles).toEqual([]);
  });

  test("(CPP-04) switchProfile on a resolved marketplace root copies into <root>/agents and records modelProfile only after the copy", () => {
    const cacheRoot = path.join(home, ".claude", "plugins", "cache", "massa-ai", "massa-ai", "2.0.0");
    fs.mkdirSync(path.join(cacheRoot, "agent-profiles", "work"), { recursive: true });
    fs.writeFileSync(path.join(cacheRoot, "agent-profiles", "work", "massa-ai-planner.md"), "opus");
    fs.mkdirSync(path.join(cacheRoot, "agents"), { recursive: true });
    fs.writeFileSync(path.join(cacheRoot, "agents", "massa-ai-planner.md"), "sonnet");
    stageMarketplaceRegistry(home, cacheRoot);
    writeState(home, {
      version: 2,
      platforms: { claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "marketplace" } },
    });

    const report = switchProfile({ profile: "work", host: "claude", targetHome: home });
    expect(report.hosts[0].status).toBe("switched");
    expect(report.hosts[0].filesChanged).toBe(1);
    expect(fs.readFileSync(path.join(cacheRoot, "agents", "massa-ai-planner.md"), "utf-8")).toBe("opus");

    const stateAfter = JSON.parse(fs.readFileSync(statePath(home), "utf-8"));
    expect(stateAfter.platforms.claude.modelProfile.profile).toBe("work");
    // Never wrote the $HOME-derived file-route path.
    expect(fs.existsSync(path.join(home, ".claude", "agents"))).toBe(false);
  });

  test("(CPP-05) re-switching to the already-active marketplace profile still reports switched with a file count, never an error", () => {
    const cacheRoot = path.join(home, ".claude", "plugins", "cache", "massa-ai", "massa-ai", "3.0.0");
    fs.mkdirSync(path.join(cacheRoot, "agent-profiles", "cheap"), { recursive: true });
    fs.writeFileSync(path.join(cacheRoot, "agent-profiles", "cheap", "massa-ai-planner.md"), "haiku");
    fs.mkdirSync(path.join(cacheRoot, "agents"), { recursive: true });
    stageMarketplaceRegistry(home, cacheRoot);
    writeState(home, {
      version: 2,
      platforms: { claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "marketplace" } },
    });

    switchProfile({ profile: "cheap", host: "claude", targetHome: home });
    const report = switchProfile({ profile: "cheap", host: "claude", targetHome: home });
    expect(report.hosts[0].status).toBe("switched");
    expect(report.hosts[0].filesChanged).toBe(1);
  });

  test("codex marketplace-route switch still refuses even after the host-aware detectRoute wiring, reason names codex only", () => {
    stageVariant(home, "codex", "work", { "massa-ai-planner.toml": "opus" });
    stageActive(home, "codex", { "massa-ai-planner.toml": "sonnet" });
    writeState(home, {
      version: 2,
      platforms: { codex: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "marketplace" } },
    });

    const report = switchProfile({ profile: "work", host: "codex", targetHome: home });
    expect(report.hosts[0].status).toBe("failed");
    expect(report.hosts[0].reason).toMatch(/codex/i);
    expect(report.hosts[0].reason).not.toMatch(/claude/i);
  });
});

describe("switchProfile — Error Handling Strategy: corrupt/unwritable state (F4)", () => {
  test("corrupt state fails globally before any copy", () => {
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "opus" });
    stageActive(home, "claude", { "massa-ai-planner.md": "sonnet" });
    const sp = statePath(home);
    fs.mkdirSync(path.dirname(sp), { recursive: true });
    fs.writeFileSync(sp, "{ not json ");

    try {
      switchProfile({ profile: "work", host: "claude", targetHome: home });
      throw new Error("expected switchProfile to throw");
    } catch (err) {
      expect((err as Error).name).toBe("CorruptInstallStateError");
    }
    const activeFile = path.join(layoutFor(home, "claude").activeDir, "massa-ai-planner.md");
    expect(fs.readFileSync(activeFile, "utf-8")).toBe("sonnet"); // no copy happened
  });

  test("unwritable state directory fails globally before any copy", () => {
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "opus" });
    stageActive(home, "claude", { "massa-ai-planner.md": "sonnet" });

    // .config exists (and reads fine — install-state.json is legitimately
    // missing, so readInstallState returns the default) but is read-only,
    // so creating the missing massa-ai/ subdir fails at the writability
    // preflight, distinct from a corrupt-content failure.
    const configDir = path.join(home, ".config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.chmodSync(configDir, 0o555);

    try {
      switchProfile({ profile: "work", host: "claude", targetHome: home });
      throw new Error("expected switchProfile to throw");
    } catch (err) {
      expect((err as Error).name).toBe("UnwritableInstallStateError");
    } finally {
      fs.chmodSync(configDir, 0o755); // let afterEach's rmSync clean up
    }
    const activeFile = path.join(layoutFor(home, "claude").activeDir, "massa-ai-planner.md");
    expect(fs.readFileSync(activeFile, "utf-8")).toBe("sonnet");
  });
});

describe("switchProfile — Error Handling Strategy: concurrent switch (A10)", () => {
  test("a held lock fails the whole switch loud, with no files copied", () => {
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "opus" });
    stageActive(home, "claude", { "massa-ai-planner.md": "sonnet" });
    const sp = writeState(home, {
      version: 2,
      platforms: { claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "file" } },
    });

    const held = acquireLock(sp);
    try {
      switchProfile({ profile: "work", host: "claude", targetHome: home });
      throw new Error("expected switchProfile to throw");
    } catch (err) {
      expect((err as Error).name).toBe("LockHeldError");
    } finally {
      held.release();
    }
    const activeFile = path.join(layoutFor(home, "claude").activeDir, "massa-ai-planner.md");
    expect(fs.readFileSync(activeFile, "utf-8")).toBe("sonnet");
  });
});

describe("switchProfile — Error Handling Strategy: partial multi-host failure", () => {
  test("one host's copy failure does not roll back another host's completed switch", () => {
    stageVariant(home, "claude", "work", { "massa-ai-planner.md": "opus" });
    stageActive(home, "claude", { "massa-ai-planner.md": "sonnet" });
    stageVariant(home, "codex", "work", { "massa-ai-planner.toml": "opus" });
    // Sabotage codex's active dir: put a file where a directory must go, so
    // mkdir(activeDir, {recursive:true}) fails.
    const codexLayout = layoutFor(home, "codex");
    fs.mkdirSync(path.dirname(codexLayout.activeDir), { recursive: true });
    fs.writeFileSync(codexLayout.activeDir, "blocking file");

    writeState(home, {
      version: 2,
      platforms: {
        claude: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "file" },
        codex: { root: "/y", skills: [], skillsOwner: "plugin", installRoute: "file" },
      },
    });

    const report = switchProfile({ profile: "work", targetHome: home, hosts: ["claude", "codex"] });
    const claudeRow = report.hosts.find((h) => h.host === "claude")!;
    const codexRow = report.hosts.find((h) => h.host === "codex")!;
    expect(claudeRow.status).toBe("switched");
    expect(codexRow.status).toBe("failed");
    expect(reportSucceeded(report)).toBe(false);

    const state = JSON.parse(fs.readFileSync(statePath(home), "utf-8"));
    expect(state.platforms.claude.modelProfile.profile).toBe("work");
    expect(state.platforms.codex.modelProfile).toBeUndefined();
  });
});

describe("switchProfile — Edge case: no hosts detected", () => {
  test("no installed host anywhere fails loud and non-vacuously", () => {
    try {
      switchProfile({ profile: "work", targetHome: home, hosts: ["claude", "codex"] });
      throw new Error("expected switchProfile to throw");
    } catch (err) {
      expect((err as Error).name).toBe("NoHostsDetectedError");
    }
  });

  test("requesting only cursor never throws, even with nothing else installed", () => {
    const report = switchProfile({ profile: "work", host: "cursor", targetHome: home });
    expect(report.hosts[0].status).toBe("skipped");
  });
});

describe("switchProfile — F3: OpenCode symlink repoint", () => {
  test("the active OpenCode agent stays a symlink post-switch, repointed at the new profile's variant file", () => {
    stageVariant(home, "opencode", "balanced", { "massa-ai-planner.md": "b" });
    stageVariant(home, "opencode", "work", { "massa-ai-planner.md": "w" });

    const layout = layoutFor(home, "opencode");
    fs.mkdirSync(layout.activeDir, { recursive: true });
    fs.symlinkSync(layout.variantDir("balanced") + "/massa-ai-planner.md", path.join(layout.activeDir, "massa-ai-planner.md"));

    writeState(home, {
      version: 2,
      platforms: { opencode: { root: "/z", skills: [], skillsOwner: "plugin", installRoute: "file" } },
    });

    const report = switchProfile({ profile: "work", host: "opencode", targetHome: home });
    expect(report.hosts[0].status).toBe("switched");

    const dest = path.join(layout.activeDir, "massa-ai-planner.md");
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(dest, "utf-8")).toBe("w");
    expect(path.basename(fs.readlinkSync(dest))).toBe("massa-ai-planner.md");
    expect(fs.readlinkSync(dest)).toContain(path.join("agent-profiles", "work"));
  });

  test("F3: a regular (non-symlink) file at the active path is never clobbered, mirroring install.sh's pre-flight", () => {
    stageVariant(home, "opencode", "work", { "massa-ai-planner.md": "w" });
    const layout = layoutFor(home, "opencode");
    fs.mkdirSync(layout.activeDir, { recursive: true });
    fs.writeFileSync(path.join(layout.activeDir, "massa-ai-planner.md"), "user hand-edited this");

    writeState(home, {
      version: 2,
      platforms: { opencode: { root: "/z", skills: [], skillsOwner: "plugin", installRoute: "file" } },
    });

    switchProfile({ profile: "work", host: "opencode", targetHome: home });

    const dest = path.join(layout.activeDir, "massa-ai-planner.md");
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(dest, "utf-8")).toBe("user hand-edited this");
  });
});
