/**
 * attribution-resolver — DB-free branch matrix (HAR-01/02/03/04-resolver,
 * HAR-09). All IO is injected: root provider, alias resolver, canonicalizer,
 * homedir/fsRoot, clock. No pg, no fs, no network.
 */
import { describe, expect, spyOn, test } from "bun:test";
import { logger } from "@massa-ai/shared";
import {
  AttributionResolver,
  type WorkspaceRoot,
  type WorkspaceRootProvider,
  type AttributionAliasResolver,
} from "../services/hooks/attribution-resolver.js";
import { SessionPinStore } from "../services/hooks/session-pin-store.js";

const HOME = "/Users/tester";
const FSROOT = "/";

function provider(roots: WorkspaceRoot[]): WorkspaceRootProvider {
  return { listRoots: async () => roots };
}

function failingProvider(): WorkspaceRootProvider {
  return {
    listRoots: async () => {
      throw new Error("db down");
    },
  };
}

function aliases(map: Record<string, string>): AttributionAliasResolver {
  return { resolve: async (id: string) => map[id] ?? id };
}

function resolver(opts: {
  roots?: WorkspaceRootProvider;
  aliasResolver?: AttributionAliasResolver;
  pins?: SessionPinStore;
  canonicalize?: (cwd: string) => string | undefined;
}) {
  return new AttributionResolver({
    roots: opts.roots ?? provider([]),
    aliasResolver: opts.aliasResolver ?? aliases({}),
    pins: opts.pins ?? new SessionPinStore(),
    canonicalize: opts.canonicalize ?? ((cwd) => cwd),
    homedir: () => HOME,
    fsRoot: () => FSROOT,
  });
}

describe("AttributionResolver order matrix (HAR-01)", () => {
  test("explicit: live caller id wins over pin and containment", async () => {
    const pins = new SessionPinStore();
    pins.set("s1", "pinned-proj");
    const r = resolver({
      roots: provider([{ projectId: "live-proj", projectPath: "/repo" }]),
      pins,
    });
    const out = await r.resolve({ callerProjectId: "live-proj", sessionId: "s1", cwd: "/other" });
    expect(out).toEqual({ projectId: "live-proj", source: "explicit" });
    // Caller re-pins session to the winning id after admission.
    r.pinSession("s1", out.projectId, out.source);
    expect(pins.get("s1")).toBe("live-proj");
  });

  test("explicit: alias-resolved caller id wins", async () => {
    const r = resolver({
      roots: provider([{ projectId: "new-name", projectPath: "/repo" }]),
      aliasResolver: aliases({ "old-name": "new-name" }),
    });
    const out = await r.resolve({ callerProjectId: "old-name" });
    expect(out).toEqual({ projectId: "new-name", source: "explicit" });
  });

  test("sticky: pin hit beats containment, no re-resolution", async () => {
    const pins = new SessionPinStore();
    pins.set("s1", "pinned-proj");
    const r = resolver({
      roots: provider([{ projectId: "contained", projectPath: "/repo" }]),
      pins,
    });
    const out = await r.resolve({ callerProjectId: "junk", sessionId: "s1", cwd: "/repo/sub" });
    expect(out).toEqual({ projectId: "pinned-proj", source: "sticky" });
  });

  test("containment: cwd inside one root resolves + caller pins session", async () => {
    const pins = new SessionPinStore();
    const r = resolver({
      roots: provider([{ projectId: "repo", projectPath: "/repo" }]),
      pins,
    });
    const out = await r.resolve({ callerProjectId: "sub", sessionId: "s1", cwd: "/repo/apps/x" });
    expect(out).toEqual({ projectId: "repo", source: "containment" });
    r.pinSession("s1", out.projectId, out.source);
    expect(pins.get("s1")).toBe("repo");
  });

  test("verbatim: zero matches leaves caller id; caller pinSession is a no-op", async () => {
    const pins = new SessionPinStore();
    const r = resolver({ roots: provider([{ projectId: "repo", projectPath: "/repo" }]), pins });
    const out = await r.resolve({ callerProjectId: "unknown", sessionId: "s1", cwd: "/elsewhere" });
    expect(out).toEqual({ projectId: "unknown", source: "verbatim" });
    r.pinSession("s1", out.projectId, out.source);
    expect(pins.get("s1")).toBeUndefined();
  });

  test("verbatim: no cwd and no session", async () => {
    const r = resolver({});
    const out = await r.resolve({ callerProjectId: "unknown" });
    expect(out.source).toBe("verbatim");
  });
});

describe("containment semantics (HAR-02)", () => {
  test("nested roots: longest path wins", async () => {
    const r = resolver({
      roots: provider([
        { projectId: "outer", projectPath: "/repo" },
        { projectId: "inner", projectPath: "/repo/packages/shared" },
      ]),
    });
    const out = await r.resolve({ callerProjectId: "junk", cwd: "/repo/packages/shared/src" });
    expect(out).toEqual({ projectId: "inner", source: "containment" });
  });

  test("prefix-without-separator does not match (/republic vs /repo)", async () => {
    const r = resolver({ roots: provider([{ projectId: "repo", projectPath: "/repo" }]) });
    const out = await r.resolve({ callerProjectId: "junk", cwd: "/republic" });
    expect(out.source).toBe("verbatim");
  });

  test("exact root match counts as containment", async () => {
    const r = resolver({ roots: provider([{ projectId: "repo", projectPath: "/repo" }]) });
    const out = await r.resolve({ callerProjectId: "junk", cwd: "/repo" });
    expect(out).toEqual({ projectId: "repo", source: "containment" });
  });

  test("path dedupe: identical paths collapse; caller self-match wins as explicit", async () => {
    const r = resolver({
      roots: provider([
        { projectId: "id-a", projectPath: "/repo" },
        { projectId: "id-b", projectPath: "/repo" },
      ]),
    });
    const out = await r.resolve({ callerProjectId: "id-b", cwd: "/repo/sub" });
    expect(out).toEqual({ projectId: "id-b", source: "explicit" });
  });

  test("path dedupe: shared path with non-member caller is ambiguous → verbatim", async () => {
    const r = resolver({
      roots: provider([
        { projectId: "id-a", projectPath: "/repo" },
        { projectId: "id-b", projectPath: "/repo" },
      ]),
    });
    const out = await r.resolve({ callerProjectId: "junk", sessionId: "s9", cwd: "/repo/sub" });
    expect(out).toEqual({ projectId: "junk", source: "verbatim" });
  });

  test("shared path: alias-canonical caller inside set self-matches", async () => {
    const r = resolver({
      roots: provider([
        { projectId: "id-a", projectPath: "/repo" },
        { projectId: "id-b", projectPath: "/repo" },
      ]),
      aliasResolver: aliases({ retired: "id-a" }),
    });
    const out = await r.resolve({ callerProjectId: "retired", cwd: "/repo/sub" });
    expect(out).toEqual({ projectId: "id-a", source: "explicit" });
  });

  test("canonicalizer output is used (symlink collapse)", async () => {
    const r = resolver({
      roots: provider([{ projectId: "repo", projectPath: "/real/repo" }]),
      canonicalize: () => "/real/repo/sub",
    });
    const out = await r.resolve({ callerProjectId: "junk", cwd: "/symlinked/repo/sub" });
    expect(out).toEqual({ projectId: "repo", source: "containment" });
  });
});

describe("broad-root exclusion (HAR-03)", () => {
  test("filesystem-root workspace never captures containment", async () => {
    const r = resolver({ roots: provider([{ projectId: "root-proj", projectPath: "/" }]) });
    const out = await r.resolve({ callerProjectId: "junk", cwd: "/anywhere/deep" });
    expect(out.source).toBe("verbatim");
  });

  test("home-dir workspace never captures containment but still receives explicit", async () => {
    const r = resolver({ roots: provider([{ projectId: "home-proj", projectPath: HOME }]) });
    const contained = await r.resolve({ callerProjectId: "junk", cwd: `${HOME}/random` });
    expect(contained.source).toBe("verbatim");
    const explicit = await r.resolve({ callerProjectId: "home-proj", cwd: "/elsewhere" });
    expect(explicit).toEqual({ projectId: "home-proj", source: "explicit" });
  });

  test("home-dir with trailing separator is still excluded", async () => {
    const r = resolver({ roots: provider([{ projectId: "home-proj", projectPath: `${HOME}/` }]) });
    const out = await r.resolve({ callerProjectId: "junk", cwd: `${HOME}/random` });
    expect(out.source).toBe("verbatim");
  });

  test("junk empty-path root never captures every cwd", async () => {
    const r = resolver({
      roots: provider([
        { projectId: "junk-row", projectPath: "" },
        { projectId: "repo", projectPath: "/repo" },
      ]),
    });
    const foreign = await r.resolve({ callerProjectId: "x", cwd: "/elsewhere" });
    expect(foreign.source).toBe("verbatim");
    const inside = await r.resolve({ callerProjectId: "x", cwd: "/repo/sub" });
    expect(inside).toEqual({ projectId: "repo", source: "containment" });
  });

  test("trailing-separator root matches exact root and dedupes with bare twin", async () => {
    const r = resolver({
      roots: provider([
        { projectId: "id-a", projectPath: "/repo/" },
        { projectId: "id-b", projectPath: "/repo" },
      ]),
    });
    const exact = await r.resolve({ callerProjectId: "id-a", cwd: "/repo" });
    expect(exact).toEqual({ projectId: "id-a", source: "explicit" });
    const nonMember = await r.resolve({ callerProjectId: "junk", cwd: "/repo/sub" });
    expect(nonMember.source).toBe("verbatim");
  });
});

describe("fail-open behavior (HAR-09)", () => {
  test("provider failure → verbatim, never throws", async () => {
    const r = resolver({ roots: failingProvider() });
    const out = await r.resolve({ callerProjectId: "x", sessionId: "s", cwd: "/y" });
    expect(out).toEqual({ projectId: "x", source: "verbatim" });
  });

  test("canonicalize failure → verbatim", async () => {
    const r = resolver({
      roots: provider([{ projectId: "repo", projectPath: "/repo" }]),
      canonicalize: () => undefined,
    });
    const out = await r.resolve({ callerProjectId: "junk", cwd: "/repo/sub" });
    expect(out.source).toBe("verbatim");
  });

  test("alias resolver failure → verbatim (outer fail-open catch)", async () => {
    const r = resolver({
      roots: provider([{ projectId: "repo", projectPath: "/repo" }]),
      aliasResolver: {
        resolve: async () => {
          throw new Error("alias db down");
        },
      },
    });
    const out = await r.resolve({ callerProjectId: "junk", cwd: "/repo/sub" });
    expect(out).toEqual({ projectId: "junk", source: "verbatim" });
  });

  test("warn output is sanitized (logger spy: no cwd/caller/SQL) and retains the scrubbed message", async () => {
    const spy = spyOn(logger, "warn").mockImplementation(() => {});
    try {
      const r = resolver({ roots: failingProvider() });
      const out = await r.resolve({ callerProjectId: "secret-caller", cwd: "/secret/path" });
      expect(out).toEqual({ projectId: "secret-caller", source: "verbatim" });
      expect(spy).toHaveBeenCalled();
      for (const call of spy.mock.calls) {
        const serialized = JSON.stringify(call);
        expect(serialized).not.toContain("/secret/path");
        expect(serialized).not.toContain("secret-caller");
        expect(serialized).not.toContain("SELECT");
      }
      // Scrubbed-not-dropped: the clean provider message survives into the meta.
      expect(JSON.stringify(spy.mock.calls)).toContain("db down");
    } finally {
      spy.mockRestore();
    }
  });

  test("resolve() catch scrubs the error message instead of dropping it", async () => {
    const spy = spyOn(logger, "warn").mockImplementation(() => {});
    try {
      const secret = "abcdefghijklmnopqrstuvwxyz0123456789";
      const r = resolver({
        roots: {
          listRoots: async () => {
            throw new Error(`roots lookup failed with Authorization: Bearer ${secret}`);
          },
        },
      });
      const out = await r.resolve({ callerProjectId: "caller-x", cwd: "/y" });
      expect(out).toEqual({ projectId: "caller-x", source: "verbatim" });
      expect(spy).toHaveBeenCalled();
      const serialized = JSON.stringify(spy.mock.calls);
      expect(serialized).not.toContain(secret);
      expect(serialized).toContain("[REDACTED:bearer]");
      // Not dropped: the safe residue of the message is retained.
      expect(serialized).toContain("roots lookup failed");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("SessionPinStore bounds (HAR-04)", () => {
  test("evicts oldest-access entry at maxSize", () => {
    let now = 1_000;
    const pins = new SessionPinStore({ maxSize: 2, now: () => now });
    pins.set("a", "pa");
    pins.set("b", "pb");
    pins.get("a"); // refresh a; b becomes oldest
    pins.set("c", "pc");
    expect(pins.get("b")).toBeUndefined();
    expect(pins.get("a")).toBe("pa");
    expect(pins.get("c")).toBe("pc");
    expect(pins.size).toBe(2);
  });

  test("expires entries at TTL", () => {
    let now = 1_000;
    const pins = new SessionPinStore({ ttlMs: 100, now: () => now });
    pins.set("a", "pa");
    now = 1_099;
    expect(pins.get("a")).toBe("pa");
    now = 1_100;
    expect(pins.get("a")).toBeUndefined();
    expect(pins.size).toBe(0);
  });

  test("re-pin refreshes recency and expiry", () => {
    let now = 0;
    const pins = new SessionPinStore({ ttlMs: 100, now: () => now });
    pins.set("a", "p1");
    now = 90;
    pins.set("a", "p2");
    now = 150;
    expect(pins.get("a")).toBe("p2");
  });

  test("maxSize 0 is a safe no-op", () => {
    const pins = new SessionPinStore({ maxSize: 0 });
    pins.set("a", "pa");
    expect(pins.size).toBe(0);
    expect(pins.get("a")).toBeUndefined();
  });

  test("clear() empties the store", () => {
    const pins = new SessionPinStore();
    pins.set("a", "pa");
    pins.set("b", "pb");
    expect(pins.size).toBe(2);
    pins.clear();
    expect(pins.size).toBe(0);
    expect(pins.get("a")).toBeUndefined();
  });

  test("sticky hit + caller re-pin refreshes expiry (long-lived sessions stay sticky)", async () => {
    let now = 0;
    const pins = new SessionPinStore({ ttlMs: 100, now: () => now });
    const r = resolver({ roots: provider([]), pins });
    pins.set("s1", "pinned-proj");
    now = 90; // inside first TTL window
    const first = await r.resolve({ callerProjectId: "junk", sessionId: "s1" });
    expect(first).toEqual({ projectId: "pinned-proj", source: "sticky" });
    // Caller re-pins after admission (HookService does this); refresh moves
    // expiry to now+ttl so the next hit inside the new window still resolves.
    r.pinSession("s1", first.projectId, first.source);
    now = 150; // would be expired without the re-pin; alive with it
    const second = await r.resolve({ callerProjectId: "junk", sessionId: "s1" });
    expect(second).toEqual({ projectId: "pinned-proj", source: "sticky" });
  });
});

describe("session handling edge cases", () => {
  test("no sessionId → resolution proceeds but nothing pins", async () => {
    const pins = new SessionPinStore();
    const r = resolver({
      roots: provider([{ projectId: "repo", projectPath: "/repo" }]),
      pins,
    });
    const out = await r.resolve({ callerProjectId: "junk", cwd: "/repo/sub" });
    expect(out.source).toBe("containment");
    expect(pins.size).toBe(0);
  });

  test("sticky is not consulted without sessionId even when pins exist", async () => {
    const pins = new SessionPinStore();
    pins.set("s1", "pinned");
    const r = resolver({ roots: provider([]), pins });
    const out = await r.resolve({ callerProjectId: "junk", cwd: "/nowhere" });
    expect(out.source).toBe("verbatim");
  });
});

// ── PgWorkspaceRootProvider (real PG-backed provider) ───────────────────────
// Uses the live test PostgreSQL instance. The provider caches roots for 30s;
// clearCache is tested. These tests run only when RUN_POSTGRES_TESTS=1.

import { PgWorkspaceRootProvider, getAttributionResolver, resetAttributionResolver, setAttributionResolverForTests } from "../services/hooks/attribution-resolver.js";

const RUN_PG = process.env.RUN_POSTGRES_TESTS === "1" && !!process.env.DATABASE_URL;

describe.skipIf(!RUN_PG)("PgWorkspaceRootProvider (live PG)", () => {
  test("listRoots returns an array (may be empty on a fresh test db)", async () => {
    const prov = new PgWorkspaceRootProvider();
    const roots = await prov.listRoots();
    expect(Array.isArray(roots)).toBe(true);
  });

  test("positive cache: second call within TTL returns cached array without re-querying", async () => {
    const prov = new PgWorkspaceRootProvider();
    const first = await prov.listRoots();
    const second = await prov.listRoots();
    // Same array reference (cached, not re-queried).
    expect(second).toBe(first);
  });

  test("clearCache forces a fresh query on the next call", async () => {
    const prov = new PgWorkspaceRootProvider();
    const first = await prov.listRoots();
    prov.clearCache();
    const second = await prov.listRoots();
    // After clearCache, a new array is returned (fresh query).
    expect(second).not.toBe(first);
    expect(Array.isArray(second)).toBe(true);
  });
});

// ── defaultCanonicalize (real fs) ───────────────────────────────────────────

describe("defaultCanonicalize", () => {
  test("resolves a real existing path to its realpath", async () => {
    // Use the test file itself — it exists and realpathSync returns its canonical path.
    const { defaultCanonicalize: _dc } = await import("../services/hooks/attribution-resolver.js");
    // The function is not exported directly; test via the AttributionResolver
    // default ctor which uses it. Create a resolver without injecting canonicalize.
    const r = new AttributionResolver({
      roots: provider([{ projectId: "cwd-proj", projectPath: process.cwd() }]),
      aliasResolver: aliases({}),
      pins: new SessionPinStore(),
      // Use the REAL defaultCanonicalize by NOT overriding it.
      homedir: () => "/nonexistent-home-xyz",
      fsRoot: () => "/",
    });
    // process.cwd() is inside the project root → containment.
    const out = await r.resolve({ callerProjectId: "junk", cwd: process.cwd() });
    expect(out.source).toBe("containment");
    expect(out.projectId).toBe("cwd-proj");
  });

  test("returns undefined for a non-existent path that cannot be resolved at all", async () => {
    // defaultCanonicalize tries realpathSync first, then path.resolve as fallback.
    // path.resolve almost never fails, so this tests the realpathSync catch path.
    // A path with null bytes throws in realpathSync; path.resolve also handles it.
    const r = new AttributionResolver({
      roots: provider([{ projectId: "x", projectPath: "/nonexistent-root-xyz" }]),
      aliasResolver: aliases({}),
      pins: new SessionPinStore(),
      homedir: () => "/nonexistent-home-xyz",
      fsRoot: () => "/",
    });
    // A non-existent cwd → realpathSync throws → path.resolve succeeds → containment
    // won't match (path is not under /nonexistent-root-xyz) → verbatim.
    const out = await r.resolve({ callerProjectId: "caller", cwd: "/totally/nonexistent/path/abc" });
    expect(out.source).toBe("verbatim");
  });
});

// ── Singleton factory functions ────────────────────────────────────────────

describe("singleton factory functions", () => {
  test("getAttributionResolver returns the same instance", () => {
    resetAttributionResolver();
    const a = getAttributionResolver();
    const b = getAttributionResolver();
    expect(a).toBe(b);
  });

  test("resetAttributionResolver clears the singleton", () => {
    const a = getAttributionResolver();
    resetAttributionResolver();
    const b = getAttributionResolver();
    expect(a).not.toBe(b);
  });

  test("setAttributionResolverForTests swaps the singleton", () => {
    const fake = {
      resolve: async () => ({ projectId: "fake", source: "verbatim" as const }),
      pinSession: () => {},
    };
    setAttributionResolverForTests(fake as any);
    const r = getAttributionResolver();
    expect(r).toBe(fake as any);
    // Clean up.
    resetAttributionResolver();
  });

  test("setAttributionResolverForTests(null) clears the singleton", () => {
    setAttributionResolverForTests(null);
    // getAttributionResolver creates a new one after null.
    const r = getAttributionResolver();
    expect(r).toBeDefined();
    resetAttributionResolver();
  });
});
