/**
 * T4 tests — ProjectIdentityAliasResolver (application-layer canonical-ID
 * resolution, spec req 3). The SQL function `project_identity_resolve` owns
 * chain flattening and cycle safety server-side; these tests pin the client
 * contract: passthrough for live ids, mapping for retired ids, TTL caching,
 * post-commit invalidation, and FAIL-OPEN behavior on lookup failure.
 */

import { describe, expect, test } from "bun:test";

import {
  ProjectIdentityAliasResolver,
  type AliasResolverQuerier,
} from "../services/project-identity/index.js";

class FakeQuerier implements AliasResolverQuerier {
  calls: string[] = [];
  mapping = new Map<string, string>();
  error: unknown = null;

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: Row[] }> {
    expect(text).toContain("project_identity_resolve");
    const id = values[0] as string;
    this.calls.push(id);
    if (this.error) throw this.error;
    // Mirror the SQL contract: live ids resolve to themselves.
    const resolved = this.mapping.get(id) ?? id;
    return { rows: [{ project_identity_resolve: resolved }] as unknown as Row[] };
  }
}

function makeResolver(querier: FakeQuerier, ttlMs = 30_000, now?: () => number) {
  let tick = 0;
  const clock = now ?? (() => tick);
  const resolver = new ProjectIdentityAliasResolver({ querier, ttlMs, now: clock });
  return { resolver, advance: (ms: number) => { tick += ms; } };
}

describe("project identity alias resolver", () => {
  test("live ids pass through; retired ids resolve to the canonical target", async () => {
    const querier = new FakeQuerier();
    querier.mapping.set("retired", "live-target");
    const { resolver } = makeResolver(querier);

    await expect(resolver.resolve("plain")).resolves.toBe("plain");
    await expect(resolver.resolve("retired")).resolves.toBe("live-target");
    expect(querier.calls).toEqual(["plain", "retired"]);
  });

  test("positive and negative results are cached within the TTL", async () => {
    const querier = new FakeQuerier();
    querier.mapping.set("retired", "live-target");
    const { resolver } = makeResolver(querier);

    await resolver.resolve("retired"); // positive entry
    await resolver.resolve("retired");
    await resolver.resolve("plain"); // negative entry (no alias)
    await resolver.resolve("plain");
    expect(querier.calls).toEqual(["retired", "plain"]);
  });

  test("expired entries re-query; invalidateProject forces re-resolution before expiry", async () => {
    const querier = new FakeQuerier();
    querier.mapping.set("retired", "target-a");
    const { resolver, advance } = makeResolver(querier, 1_000);

    await resolver.resolve("retired");
    advance(1_001);
    querier.mapping.set("retired", "target-b");
    await expect(resolver.resolve("retired")).resolves.toBe("target-b");

    // Post-commit invalidation drops the fresh cached mapping immediately.
    querier.mapping.set("retired", "target-c");
    resolver.invalidateProject("retired");
    await expect(resolver.resolve("retired")).resolves.toBe("target-c");
  });

  test("lookup failure is FAIL-OPEN: original id returned, no negative cache, next call retries", async () => {
    const querier = new FakeQuerier();
    const { resolver } = makeResolver(querier);

    querier.error = new Error("connection reset /secret-host");
    await expect(resolver.resolve("proj")).resolves.toBe("proj");
    expect(resolver.cacheSize).toBe(0); // nothing cached on failure

    querier.error = null;
    querier.mapping.set("proj", "canonical");
    await expect(resolver.resolve("proj")).resolves.toBe("canonical");
    expect(querier.calls).toEqual(["proj", "proj"]);
  });

  test("empty id returns as-is without a query", async () => {
    const querier = new FakeQuerier();
    const { resolver } = makeResolver(querier);
    await expect(resolver.resolve("")).resolves.toBe("");
    expect(querier.calls).toEqual([]);
  });

  test("a null/empty SQL result falls back to the input id", async () => {
    const querier = new FakeQuerier();
    const original = querier.query.bind(querier);
    querier.query = async <Row = Record<string, unknown>>(): Promise<{ rows: Row[] }> =>
      ({ rows: [{ project_identity_resolve: null }] as unknown as Row[] });
    const { resolver } = makeResolver(querier);
    await expect(resolver.resolve("proj")).resolves.toBe("proj");
    void original;
  });
});

describe("project identity alias resolver — latency bound", () => {
  test("a hanging lookup fails open within resolveTimeoutMs instead of stalling the write seam", async () => {
    const hanging: AliasResolverQuerier = {
      query: () => new Promise(() => { /* never settles */ }),
    };
    const resolver = new ProjectIdentityAliasResolver({
      querier: hanging,
      resolveTimeoutMs: 25,
    });
    const started = Date.now();
    await expect(resolver.resolve("proj")).resolves.toBe("proj");
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(resolver.cacheSize).toBe(0);
  });
});

describe("project identity alias resolver — timeout cache discrimination", () => {
  test("a lookup settling AFTER the timeout never populates the cache; the next call re-queries", async () => {
    let calls = 0;
    const slow: AliasResolverQuerier = {
      query: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 60)); // beyond the 25ms bound
        return { rows: [{ project_identity_resolve: "canonical" }] as never };
      },
    };
    const resolver = new ProjectIdentityAliasResolver({
      querier: slow,
      resolveTimeoutMs: 25,
    });

    // First call times out → fail-open, no cache write even after the late settle.
    await expect(resolver.resolve("proj")).resolves.toBe("proj");
    await new Promise((r) => setTimeout(r, 80)); // let the late lookup finish
    expect(resolver.cacheSize).toBe(0);

    // Second call re-queries (and times out again) — a cache-after-timeout
    // mutant would instead serve "canonical" without a second query.
    await expect(resolver.resolve("proj")).resolves.toBe("proj");
    expect(calls).toBe(2);
  });
});
