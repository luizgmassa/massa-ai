/**
 * Unit tests for `services/file-read/project-root-cache.ts` — module 3 of the
 * `tools/read_file.ts` extraction (PR-D, T9).
 *
 * The module moved out of `ReadFileTool` as a private field plus a private
 * method plus a constructor subscription. Only two of those three had any
 * sensor before this file existed: `read-file.test.ts` drives the
 * `indexing:started` call site (T8/C49) and `lru-eviction-characterization.test.ts`
 * drives the cached-root path through `handle()`. Neither reaches the
 * workspace-lookup failure branches, which are what this file adds.
 *
 * DEBT-02's coverage floor is per file and applies to this module on its own
 * (R-36), so every branch is exercised here rather than through the handler.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

type IndexingStartedPayload = {
  jobId: string;
  projectId: string;
  projectPath: string;
  totalFiles?: number;
};
const indexingStartedListeners = new Set<(payload: IndexingStartedPayload) => void>();

/** Swapped per test so the failure branches are reachable without a live DB. */
let getWorkspaceImpl: (projectId: string) => Promise<{ project_path?: string } | null> = async () => ({
  project_path: "/ws/default",
});

mock.module("../services/events/event-bus.js", () => ({
  eventBus: {
    subscribe: (event: string, listener: (payload: IndexingStartedPayload) => void) => {
      if (event === "indexing:started") indexingStartedListeners.add(listener);
      return () => indexingStartedListeners.delete(listener);
    },
    publish: (event: string, payload: IndexingStartedPayload) => {
      if (event === "indexing:started") {
        for (const listener of indexingStartedListeners) listener(payload);
      }
    },
  },
}));
mock.module("../services/workspace/workspace-manager.js", () => ({
  workspaceManager: {
    getWorkspace: (projectId: string) => getWorkspaceImpl(projectId),
  },
}));

const { ProjectRootCache } = await import("../services/file-read/project-root-cache.js");
const { eventBus } = await import("../services/events/event-bus.js");

/** The Map is private; the repo's established reach for a cap assertion is a
 *  cast, exactly as `symbol-graph-service.test.ts` reaches its own. */
type Priv = {
  projectRootCache: Map<string, string>;
  PROJECT_ROOT_CACHE_MAX_ENTRIES: number;
};
const priv = (c: InstanceType<typeof ProjectRootCache>) => c as unknown as Priv;

beforeEach(() => {
  indexingStartedListeners.clear();
  getWorkspaceImpl = async () => ({ project_path: "/ws/default" });
});

describe("ProjectRootCache — lookup and caching", () => {
  test("a miss resolves through workspaceManager and caches the root", async () => {
    const calls: string[] = [];
    getWorkspaceImpl = async (projectId) => {
      calls.push(projectId);
      return { project_path: `/ws/${projectId}` };
    };
    const cache = new ProjectRootCache();

    expect(await cache.getProjectRoot("proj-a")).toBe("/ws/proj-a");
    expect(calls).toEqual(["proj-a"]);
    expect(priv(cache).projectRootCache.get("proj-a")).toBe("/ws/proj-a");
  });

  test("a hit is served from the cache and does NOT re-enter workspaceManager", async () => {
    let calls = 0;
    getWorkspaceImpl = async (projectId) => {
      calls++;
      return { project_path: `/ws/${projectId}` };
    };
    const cache = new ProjectRootCache();

    expect(await cache.getProjectRoot("proj-a")).toBe("/ws/proj-a");
    expect(await cache.getProjectRoot("proj-a")).toBe("/ws/proj-a");
    // Exact, not "at most": a second lookup would mean the cache is inert.
    expect(calls).toBe(1);
  });

  test("a hit PROMOTES the key to most-recently-used (delete+set reorder)", async () => {
    const cache = new ProjectRootCache();
    const m = priv(cache).projectRootCache;

    getWorkspaceImpl = async (projectId) => ({ project_path: `/ws/${projectId}` });
    await cache.getProjectRoot("first");
    await cache.getProjectRoot("second");
    expect([...m.keys()]).toEqual(["first", "second"]);

    // Touch the older key — insertion order must now put it last.
    await cache.getProjectRoot("first");
    expect([...m.keys()]).toEqual(["second", "first"]);
  });

  test("a workspace with no project_path caches nothing and returns null", async () => {
    getWorkspaceImpl = async () => ({});
    const cache = new ProjectRootCache();

    expect(await cache.getProjectRoot("proj-missing")).toBeNull();
    expect(priv(cache).projectRootCache.size).toBe(0);
  });

  test("a null workspace caches nothing and returns null", async () => {
    getWorkspaceImpl = async () => null;
    const cache = new ProjectRootCache();

    expect(await cache.getProjectRoot("proj-absent")).toBeNull();
    expect(priv(cache).projectRootCache.size).toBe(0);
  });

  test("a throwing workspaceManager is caught and returns null, not a rejection", async () => {
    getWorkspaceImpl = async () => {
      throw new Error("workspace repo is down");
    };
    const cache = new ProjectRootCache();

    expect(await cache.getProjectRoot("proj-boom")).toBeNull();
    expect(priv(cache).projectRootCache.size).toBe(0);
  });
});

describe("ProjectRootCache — the LRU bound, at both call sites", () => {
  test("the cap is 512 and matches what ReadFileTool applied before the move", () => {
    const cache = new ProjectRootCache();
    expect(priv(cache).PROJECT_ROOT_CACHE_MAX_ENTRIES).toBe(512);
  });

  test("one lookup past a full cache evicts exactly the oldest — getProjectRoot's call site", async () => {
    const cache = new ProjectRootCache();
    const p = priv(cache);
    const CAP = p.PROJECT_ROOT_CACHE_MAX_ENTRIES;

    for (let i = 0; i < CAP; i++) p.projectRootCache.set(`seeded-${i}`, `/roots/r${i}`);
    expect(p.projectRootCache.size).toBe(CAP);

    // A key the seed loop cannot have produced, so the lookup is a guaranteed
    // miss and the eviction call is the only thing between CAP and CAP + 1.
    const fresh = "fresh-project-outside-seed-namespace";
    expect(p.projectRootCache.has(fresh)).toBe(false);
    getWorkspaceImpl = async () => ({ project_path: "/roots/fresh" });

    expect(await cache.getProjectRoot(fresh)).toBe("/roots/fresh");

    // Exact, not an upper bound: an over-evicting mutation satisfies `<= CAP`.
    expect(p.projectRootCache.size).toBe(CAP);
    expect(p.projectRootCache.has("seeded-0")).toBe(false); // oldest evicted
    expect(p.projectRootCache.has("seeded-1")).toBe(true); // and only the oldest
    expect(p.projectRootCache.get(fresh)).toBe("/roots/fresh");
  });

  test("one indexing:started past a full cache evicts exactly the oldest — the subscription's call site", () => {
    const cache = new ProjectRootCache();
    const p = priv(cache);
    const CAP = p.PROJECT_ROOT_CACHE_MAX_ENTRIES;

    for (let i = 0; i < CAP; i++) p.projectRootCache.set(`seeded-${i}`, `/roots/r${i}`);
    expect(p.projectRootCache.size).toBe(CAP);

    // The handler deletes the incoming projectId BEFORE evicting, so a key that
    // was already cached would free its own slot and the size assertion would
    // hold with or without the eviction call.
    const fresh = "fresh-project-outside-seed-namespace";
    expect(p.projectRootCache.has(fresh)).toBe(false);

    eventBus.publish("indexing:started", {
      jobId: "job-cap-boundary",
      projectId: fresh,
      projectPath: "/roots/fresh",
    });

    expect(p.projectRootCache.size).toBe(CAP);
    expect(p.projectRootCache.has("seeded-0")).toBe(false);
    expect(p.projectRootCache.has("seeded-1")).toBe(true);
    expect(p.projectRootCache.get(fresh)).toBe("/roots/fresh");
  });
});

describe("ProjectRootCache — the indexing:started subscription", () => {
  test("the constructor subscribes, and a published root overwrites the cached one", async () => {
    getWorkspaceImpl = async () => ({ project_path: "/ws/before" });
    const cache = new ProjectRootCache();

    expect(await cache.getProjectRoot("proj-x")).toBe("/ws/before");

    eventBus.publish("indexing:started", {
      jobId: "job-1",
      projectId: "proj-x",
      projectPath: "/ws/after",
    });

    // Served from the cache the event just rewrote — workspaceManager still
    // answers "/ws/before", so reading "/ws/after" can only come from the event.
    expect(await cache.getProjectRoot("proj-x")).toBe("/ws/after");
  });

  test("each instance subscribes exactly once, so two tools do not share a cache", async () => {
    const before = indexingStartedListeners.size;
    const a = new ProjectRootCache();
    const b = new ProjectRootCache();
    expect(indexingStartedListeners.size).toBe(before + 2);

    eventBus.publish("indexing:started", {
      jobId: "job-2",
      projectId: "shared-id",
      projectPath: "/ws/published",
    });

    // Both saw the event...
    expect(priv(a).projectRootCache.get("shared-id")).toBe("/ws/published");
    expect(priv(b).projectRootCache.get("shared-id")).toBe("/ws/published");

    // ...but the Maps are distinct objects, which is the property that makes
    // per-instance construction behavior-preserving rather than a shared cache.
    expect(priv(a).projectRootCache).not.toBe(priv(b).projectRootCache);
    priv(a).projectRootCache.set("only-in-a", "/ws/a");
    expect(priv(b).projectRootCache.has("only-in-a")).toBe(false);
  });

  test("ROOT_CACHE_TTL is declared and read NOWHERE — the pre-existing defect, carried across unfixed", async () => {
    // RFS-02 AC-4: PR-D logs this and does not fix it. If the extraction had
    // quietly started enforcing the TTL, that would be a behavior change inside
    // a behavior-preserving PR — this asserts it did not.
    const src = await Bun.file(
      new URL("../services/file-read/project-root-cache.ts", import.meta.url).pathname,
    ).text();
    const declarations = src.match(/ROOT_CACHE_TTL/g) ?? [];
    // Exactly one occurrence in code: the declaration itself. Every other
    // mention is inside the module docblock explaining why it is unread.
    const codeMentions = src
      .split("\n")
      .filter((l) => l.includes("ROOT_CACHE_TTL") && !l.trim().startsWith("*"));
    expect(declarations.length).toBeGreaterThan(0);
    expect(codeMentions).toHaveLength(1);
    expect(codeMentions[0]).toContain("private readonly ROOT_CACHE_TTL = 300000");
  });
});
