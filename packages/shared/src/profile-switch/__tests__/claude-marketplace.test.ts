/**
 * claude-marketplace.ts unit tests — install-root resolver for a Claude
 * marketplace install (design "4a. claude-marketplace.ts", CPP-01, CPP-02,
 * CPP-06).
 *
 * Every fixture is a temp dir with a synthetic `installed_plugins.json` —
 * never the developer's real `~/.claude`.
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

/** Creates `<home>/.claude/plugins/cache/massa-ai/massa-ai/<version>` on disk
 *  so a resolved installPath can pass the "exists on disk" gate. */
function makeInstallDir(home: string, version: string): string {
  const dir = path.join(home, ".claude", "plugins", "cache", "massa-ai", "massa-ai", version);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

afterEach(() => {
  for (const home of homes.splice(0)) {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

describe("resolveClaudeMarketplaceRoot — valid registry", () => {
  test("a single user-scoped record whose installPath exists resolves to that path", () => {
    const home = makeHome();
    const installPath = makeInstallDir(home, "1.45.0");
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

describe("resolveClaudeMarketplaceRoot — absent/corrupt registry (CPP-06)", () => {
  test("no installed_plugins.json at all resolves to null", () => {
    const home = makeHome();
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("no .claude directory at all resolves to null", () => {
    const home = makeHome();
    // makeHome() only mkdtemp's the bare temp dir — nothing under it exists.
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("unparseable JSON resolves to null, never throws", () => {
    const home = makeHome();
    writeRegistry(home, "{ this is not valid json");
    expect(() => resolveClaudeMarketplaceRoot({ targetHome: home })).not.toThrow();
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("registry present but names no record for the plugin key resolves to null", () => {
    const home = makeHome();
    writeRegistry(home, { version: 2, plugins: { "someone-else@else": [] } });
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });

  test("the plugin key maps to an empty array resolves to null", () => {
    const home = makeHome();
    writeRegistry(home, { version: 2, plugins: { "massa-ai@massa-ai": [] } });
    expect(resolveClaudeMarketplaceRoot({ targetHome: home })).toBeNull();
  });
});

describe("resolveClaudeMarketplaceRoot — installPath missing on disk (CPP-06)", () => {
  test("a record present but whose installPath does not exist on disk resolves to null", () => {
    const home = makeHome();
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

describe("resolveClaudeMarketplaceRoot — multi-record precedence (spec Edge Cases)", () => {
  test("prefers the scope:\"user\" record over a non-user-scoped record, regardless of order", () => {
    const home = makeHome();
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

describe("resolveClaudeMarketplaceRoot — never caches (CPP-02)", () => {
  test("two calls across a moved installPath return two different roots", () => {
    const home = makeHome();
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
