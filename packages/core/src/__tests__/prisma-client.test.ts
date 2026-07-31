/**
 * prisma-client unit tests — covers disconnectPrisma's teardown path and the
 * `_adapters` failure seam on `getPrismaClient`.
 *
 * `packages/core/src/kernel/prisma-client.ts` (moved here from
 * `services/query/prisma-client.ts` by PR-C T2b) had no dedicated test file.
 * Its happy path is already exercised indirectly by the ~46 repository test
 * files that call `getPrismaClient()`, but nothing called `disconnectPrisma()`
 * or forced the adapter-load failure branch its own `_adapters` seam exists
 * for — the three lines this file closes.
 */

import { describe, expect, test } from "bun:test";
import {
  _adapters,
  _resetPrismaForTesting,
  disconnectPrisma,
  getPrismaClient,
} from "../kernel/prisma-client.js";

describe("prisma-client", () => {
  test("disconnectPrisma is a no-op when no client was ever constructed", async () => {
    _resetPrismaForTesting();
    await expect(disconnectPrisma()).resolves.toBeUndefined();
  });

  test("getPrismaClient wraps an adapter-load failure in a named error", () => {
    _resetPrismaForTesting();
    const originalLoadPg = _adapters.loadPg;
    _adapters.loadPg = () => {
      throw new Error("native pg binding unavailable");
    };

    try {
      expect(() => getPrismaClient()).toThrow(
        /pg and @prisma\/adapter-pg are required for PostgreSQL: native pg binding unavailable/,
      );
    } finally {
      _adapters.loadPg = originalLoadPg;
      _resetPrismaForTesting();
    }
  });
});
