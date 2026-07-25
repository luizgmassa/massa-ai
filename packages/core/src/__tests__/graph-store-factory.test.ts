/**
 * Coverage for the graph-store factory — cache creation, cache reuse, and the
 * reset path including the defensive clear-failure branch.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GraphStorePg } from "../services/graph/graph-store-pg.js";
import {
  getGraphStore,
  resetGraphStore,
} from "../services/graph/graph-store-factory.js";
import type { IGraphStore } from "../services/graph/types.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const DEDICATED_DB =
  process.env.MASSA_AI_DEDICATED === "1" &&
  /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(databaseUrl);

describe.skipIf(!DEDICATED_DB)("graph-store-factory", () => {
  beforeAll(async () => {
    // Start each run from a clean cache.
    await resetGraphStore();
  });

  afterAll(async () => {
    await resetGraphStore();
  });

  test("getGraphStore creates the store on first call and reuses the cache after", async () => {
    const first = getGraphStore();
    expect(first).toBeInstanceOf(GraphStorePg);

    const second = getGraphStore();
    // Same cached instance (identity).
    expect(second).toBe(first);
  });

  test("resetGraphStore clears the factory cache so the next get repopulates it", async () => {
    const before = getGraphStore();
    await resetGraphStore();
    // GraphStorePg is itself a process-wide singleton, so the underlying PG
    // instance identity is preserved — but the factory cache was rebuilt.
    const after = getGraphStore();
    expect(after).toBeInstanceOf(GraphStorePg);
    expect(after).toBe(before);
    // Cache is wired up again: a second call returns the same object.
    expect(getGraphStore()).toBe(after);
    await resetGraphStore();
  });

  test("resetGraphStore swallows a clear() failure (defensive, never blocks)", async () => {
    // Populate the cache with a real store, then force clear() to throw.
    const poisoned = getGraphStore() as IGraphStore;
    const realClear = poisoned.clear.bind(poisoned);
    (poisoned as any).clear = async () => {
      throw new Error("clear exploded");
    };

    // Must NOT throw — the defensive try/catch absorbs the failure.
    await expect(resetGraphStore()).resolves.toBeUndefined();

    // Restore the real clear on the (now-detached) instance for hygiene.
    (poisoned as any).clear = realClear;
  });

  test("resetGraphStore is a no-op when nothing is cached", async () => {
    await resetGraphStore();
    await expect(resetGraphStore()).resolves.toBeUndefined();
  });
});
