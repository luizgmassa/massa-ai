/**
 * claude-marketplace.ts unit tests — install-root resolver for a Claude
 * marketplace install (design "4a. claude-marketplace.ts", CPP-01, CPP-02,
 * CPP-06, and MDS-01/D1 for the directory-source branch).
 *
 * Every fixture is a temp dir with synthetic registry files — never the
 * developer's real `~/.claude`.
 *
 * Since T1, `resolveClaudeMarketplaceRoot` reads `known_marketplaces.json`
 * FIRST. Every "remote"/cache-path test below therefore stages a
 * `known_marketplaces.json` entry with a non-"directory" `source.source`
 * (AC-01.2's "any other kind") so it genuinely exercises the old
 * `installed_plugins.json` fallback rather than accidentally exercising
 * AC-01.3's "registry absent" null case instead.
 */
import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveClaudeMarketplaceRoot } from "../claude-marketplace.js";

const homes: string[] = [];

function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-claude-mp-"));
  homes.push(home);
  return home;
}

function registryPath(home: string): string {
  return path.join(home, ".claude", "plugins", "installed_plugins.json");
}

function writeRegistry(home: string, content: unknown): void {
  const p = registryPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

function knownMarketplacesPath(home: string): string {
  return path.join(home, ".claude", "plugins", "known_marketplaces.json");
}

function writeKnownMarketplaces(home: string, content: unknown): void {
  const p = knownMarketplacesPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

/** AC-01.2's "any other kind" fixture — a remote (github-sourced)
 *  marketplace entry. `installLocation` is present, as it would be on a
 *  real machine, but irrelevant to the cache-path resolution below. */
function remoteMarketplaceEntry(): unknown {
  return { source: { source: "github", repo: "octo/example" }, installLocation: "/opt/unused" };
}

/** Creates `<home>/.claude/plugins/cache/massa-ai/massa-ai/<version>` on disk
 *  so a resolved installPath can pass the "exists on disk" gate. */
function makeInstallDir(home: string, version: string): string {
  const dir = path.join(home, ".claude", "plugins", "cache", "massa-ai", "massa-ai", version);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Stages a directory-source `known_marketplaces.json` entry plus that
 *  directory's own `.claude-plugin/marketplace.json` (D1). Does not create
 *  `installLocation` or the composed live root — callers do that
 *  separately so a test can exercise a not-yet-existing composed path. */
function stageDirectorySource(
  home: string,
  opts: { marketplaceName?: string; pluginName?: string; installLocation: string; pluginSource: string },
): void {
  const { marketplaceName = "massa-ai", pluginName = "massa-ai", installLocation, pluginSource } = opts;
  writeKnownMarketplaces(home, {
    [marketplaceName]: { source: { source: "directory", path: installLocation }, installLocation },
  });
  const manifestPath = path.join(installLocation, ".claude-plugin", "marketplace.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ plugins: [{ name: pluginName, source: pluginSource }] }, null, 2));
}

afterEach(() => {
  for (const home of homes.splice(0)) {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

describe("resolveClaudeMarketplaceRoot — valid registry (cache path, AC-01.2)", () => {
  test("a single user-scoped record whose installPath exists resolves to that path", () => {
    const home = makeHome();
    const installPath = makeInstallDir(home, "1.45.0");
    writeKnownMarketplaces(home, { "massa-ai": remoteMarketplaceEntry() });
    writeRegistry(home, {
      version: 2,
      plugins: {
        "massa-ai@massa-ai": [
          {
            scope: "user",
            installPath,
            version: "1.45.0",
            installedAt: "2026-08-05T21:11:52.743Z",
            lastUpdated: "2026-08-10T01:35:53.885Z",
            gitCommitSha: "bf2d0de182da92b12094dbd0307a9aeb3d939bdc",
          },
        ],
      },
    });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBe(installPath);
  });

  test("a non-default pluginKey resolves via that key", () => {
    const home = makeHome();
    const installPath = makeInstallDir(home, "2.0.0");
    writeKnownMarketplaces(home, { "other-marketplace": remoteMarketplaceEntry() });
    writeRegistry(home, {
      version: 2,
      plugins: {
        "other-plugin@other-marketplace": [
          { scope: "user", installPath, lastUpdated: "2026-01-01T00:00:00.000Z" },
        ],
      },
    });

    expect(
      resolveClaudeMarketplaceRoot({ targetHome: home, pluginKey: "other-plugin@other-marketplace" }),
    ).toBe(installPath);
  });
});

describe("resolveClaudeMarketplaceRoot — absent/corrupt installed_plugins.json (CPP-06, cache path)", () => {
  test("no installed_plugins.json at all resolves to null (known_marketplaces.json names a remote kind)", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, { "massa-ai": remoteMarketplaceEntry() });
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("no .claude directory at all resolves to null (also AC-01.3's known_marketplaces.json-absent case)", () => {
    const home = makeHome();
    // makeHome() only mkdtemp's the bare temp dir — nothing under it exists,
    // so this doubles as an AC-01.3 "absent known_marketplaces.json" case.
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("unparseable installed_plugins.json resolves to null, never throws", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, { "massa-ai": remoteMarketplaceEntry() });
    writeRegistry(home, "{ this is not valid json");
    expect(() => resolveClaudeMarketplaceRoot({ targetHome: home })).not.toThrow();
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("registry present but names no record for the plugin key resolves to null", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, { "massa-ai": remoteMarketplaceEntry() });
    writeRegistry(home, { version: 2, plugins: { "someone-else@else": [] } });
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("the plugin key maps to an empty array resolves to null", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, { "massa-ai": remoteMarketplaceEntry() });
    writeRegistry(home, { version: 2, plugins: { "massa-ai@massa-ai": [] } });
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });
});

describe("resolveClaudeMarketplaceRoot — installPath missing on disk (CPP-06, cache path)", () => {
  test("a record present but whose installPath does not exist on disk resolves to null", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, { "massa-ai": remoteMarketplaceEntry() });
    const neverCreated = path.join(home, ".claude", "plugins", "cache", "massa-ai", "massa-ai", "9.9.9");
    writeRegistry(home, {
      version: 2,
      plugins: {
        "massa-ai@massa-ai": [{ scope: "user", installPath: neverCreated, lastUpdated: "2026-01-01T00:00:00.000Z" }],
      },
    });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });
});

describe("resolveClaudeMarketplaceRoot — multi-record precedence (spec Edge Cases, cache path)", () => {
  test("prefers the scope:\"user\" record over a non-user-scoped record, regardless of order", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, { "massa-ai": remoteMarketplaceEntry() });
    const userPath = makeInstallDir(home, "1.0.0-user");
    const otherPath = makeInstallDir(home, "1.0.0-project");
    writeRegistry(home, {
      version: 2,
      plugins: {
        "massa-ai@massa-ai": [
          { scope: "project", installPath: otherPath, lastUpdated: "2026-02-01T00:00:00.000Z" },
          { scope: "user", installPath: userPath, lastUpdated: "2026-01-01T00:00:00.000Z" },
        ],
      },
    });

    // The non-user record is more recently updated, but scope:"user" wins first.
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBe(userPath);
  });

  test("among several user-scoped records, the most recent lastUpdated wins", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, { "massa-ai": remoteMarketplaceEntry() });
    const older = makeInstallDir(home, "1.0.0");
    const newer = makeInstallDir(home, "1.1.0");
    writeRegistry(home, {
      version: 2,
      plugins: {
        "massa-ai@massa-ai": [
          { scope: "user", installPath: older, lastUpdated: "2026-01-01T00:00:00.000Z" },
          { scope: "user", installPath: newer, lastUpdated: "2026-06-01T00:00:00.000Z" },
        ],
      },
    });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBe(newer);
  });

  test("a tie on lastUpdated (or none parseable) falls through to the last entry — deterministic", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, { "massa-ai": remoteMarketplaceEntry() });
    const first = makeInstallDir(home, "1.0.0");
    const second = makeInstallDir(home, "2.0.0");
    writeRegistry(home, {
      version: 2,
      plugins: {
        "massa-ai@massa-ai": [
          { scope: "user", installPath: first },
          { scope: "user", installPath: second },
        ],
      },
    });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBe(second);
  });

  test("no user-scoped record at all still resolves deterministically among the rest", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, { "massa-ai": remoteMarketplaceEntry() });
    const older = makeInstallDir(home, "1.0.0");
    const newer = makeInstallDir(home, "1.1.0");
    writeRegistry(home, {
      version: 2,
      plugins: {
        "massa-ai@massa-ai": [
          { scope: "project", installPath: older, lastUpdated: "2026-01-01T00:00:00.000Z" },
          { scope: "project", installPath: newer, lastUpdated: "2026-06-01T00:00:00.000Z" },
        ],
      },
    });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBe(newer);
  });
});

describe("resolveClaudeMarketplaceRoot — never caches (CPP-02, cache path)", () => {
  test("two calls across a moved installPath return two different roots", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, { "massa-ai": remoteMarketplaceEntry() });
    const first = makeInstallDir(home, "1.0.0");
    writeRegistry(home, {
      version: 2,
      plugins: {
        "massa-ai@massa-ai": [{ scope: "user", installPath: first, lastUpdated: "2026-01-01T00:00:00.000Z" }],
      },
    });

    const firstResolved = resolveClaudeMarketplaceRoot({ targetHome: home });
    expect(firstResolved).toBe(first);

    // Simulate `claude plugin update`: a new version directory appears and the
    // registry is rewritten to point at it.
    const second = makeInstallDir(home, "2.0.0");
    writeRegistry(home, {
      version: 2,
      plugins: {
        "massa-ai@massa-ai": [{ scope: "user", installPath: second, lastUpdated: "2026-06-01T00:00:00.000Z" }],
      },
    });

    const secondResolved = resolveClaudeMarketplaceRoot({ targetHome: home });
    expect(secondResolved).toBe(second);
    expect(secondResolved).not.toBe(firstResolved);
  });
});

describe("resolveClaudeMarketplaceRoot — directory source (MDS-01 D1, AC-01.1, AC-01.5)", () => {
  test("a directory-source marketplace resolves the composed live root from its own manifest, never the cache", () => {
    const home = makeHome();
    const installLocation = path.join(home, "checkout");
    const liveRoot = path.join(installLocation, "apps", "claude-plugin");
    fs.mkdirSync(liveRoot, { recursive: true });
    stageDirectorySource(home, { installLocation, pluginSource: "./apps/claude-plugin" });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBe(liveRoot);
  });

  test("edge case table: directory source wins even when installed_plugins.json also has a resolvable cache entry", () => {
    const home = makeHome();
    const installLocation = path.join(home, "checkout");
    const liveRoot = path.join(installLocation, "apps", "claude-plugin");
    fs.mkdirSync(liveRoot, { recursive: true });
    stageDirectorySource(home, { installLocation, pluginSource: "./apps/claude-plugin" });
    const cachePath = makeInstallDir(home, "1.48.0"); // stale cache — must be ignored
    writeRegistry(home, {
      version: 2,
      plugins: {
        "massa-ai@massa-ai": [{ scope: "user", installPath: cachePath, lastUpdated: "2026-01-01T00:00:00.000Z" }],
      },
    });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBe(liveRoot);
  });

  test("AC-01.5: the marketplace name comes from the plugin key's right-hand side, never a hardcoded literal", () => {
    const home = makeHome();
    const installLocation = path.join(home, "checkout");
    const liveRoot = path.join(installLocation, "bundle");
    fs.mkdirSync(liveRoot, { recursive: true });
    stageDirectorySource(home, {
      marketplaceName: "acme-market",
      pluginName: "acme-tool",
      installLocation,
      pluginSource: "./bundle",
    });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home, pluginKey: "acme-tool@acme-market" })).toBe(liveRoot);
  });
});

describe("resolveClaudeMarketplaceRoot — AC-01.3 failure modes (directory source, never falls back to cache)", () => {
  test("(1) absent known_marketplaces.json resolves null, even with a separately valid, resolvable cache record", () => {
    const home = makeHome();
    const cachePath = makeInstallDir(home, "1.0.0");
    writeRegistry(home, {
      version: 2,
      plugins: {
        "massa-ai@massa-ai": [{ scope: "user", installPath: cachePath, lastUpdated: "2026-01-01T00:00:00.000Z" }],
      },
    });
    // No known_marketplaces.json staged at all.

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("(1) unparseable known_marketplaces.json resolves null, never throws", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, "{ not valid json");
    expect(() => resolveClaudeMarketplaceRoot({ targetHome: home })).not.toThrow();
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("(2) a directory-source entry missing installLocation resolves null", () => {
    const home = makeHome();
    writeKnownMarketplaces(home, { "massa-ai": { source: { source: "directory" } } });
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("(3) a directory source whose own marketplace.json is absent resolves null", () => {
    const home = makeHome();
    const installLocation = path.join(home, "checkout");
    fs.mkdirSync(installLocation, { recursive: true });
    writeKnownMarketplaces(home, { "massa-ai": { source: { source: "directory" }, installLocation } });
    // No .claude-plugin/marketplace.json written.

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("(3) a directory source whose marketplace.json is unparseable resolves null", () => {
    const home = makeHome();
    const installLocation = path.join(home, "checkout");
    const manifestPath = path.join(installLocation, ".claude-plugin", "marketplace.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, "{ not valid json");
    writeKnownMarketplaces(home, { "massa-ai": { source: { source: "directory" }, installLocation } });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("(4) no plugin entry matching the name resolves null", () => {
    const home = makeHome();
    const installLocation = path.join(home, "checkout");
    const manifestPath = path.join(installLocation, ".claude-plugin", "marketplace.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ plugins: [{ name: "someone-else", source: "./x" }] }));
    writeKnownMarketplaces(home, { "massa-ai": { source: { source: "directory" }, installLocation } });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("(5) a composed path that does not exist on disk resolves null", () => {
    const home = makeHome();
    const installLocation = path.join(home, "checkout");
    const manifestPath = path.join(installLocation, ".claude-plugin", "marketplace.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ plugins: [{ name: "massa-ai", source: "./never-created" }] }));
    writeKnownMarketplaces(home, { "massa-ai": { source: { source: "directory" }, installLocation } });
    // ./never-created is never mkdir'd.

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });
});

describe("resolveClaudeMarketplaceRoot — AC-01.6 path containment", () => {
  test("a ../-escaping source that resolves to an EXISTING directory outside installLocation resolves null, not that directory", () => {
    const home = makeHome();
    const installLocation = path.join(home, "checkout");
    const manifestPath = path.join(installLocation, ".claude-plugin", "marketplace.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    // The escape target genuinely exists on disk — proving the existsSync
    // check alone would have let this through; only containment catches it.
    const escapeTarget = path.join(home, "escape-target");
    fs.mkdirSync(escapeTarget, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ plugins: [{ name: "massa-ai", source: "../escape-target" }] }));
    writeKnownMarketplaces(home, { "massa-ai": { source: { source: "directory" }, installLocation } });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
    // Prove the escape target really does exist — a non-existent target
    // would already be rejected by the plain existsSync gate and would prove
    // nothing about containment specifically.
    expect(fs.existsSync(escapeTarget)).toBe(true);
  });

  test("a source resolving exactly to installLocation itself is allowed (boundary is inclusive)", () => {
    const home = makeHome();
    const installLocation = path.join(home, "checkout");
    const manifestPath = path.join(installLocation, ".claude-plugin", "marketplace.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ plugins: [{ name: "massa-ai", source: "." }] }));
    writeKnownMarketplaces(home, { "massa-ai": { source: { source: "directory" }, installLocation } });

    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBe(path.resolve(installLocation));
  });
});
