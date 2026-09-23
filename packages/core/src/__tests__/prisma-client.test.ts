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
  _getPrismaPoolForTesting,
  _resetPrismaForTesting,
  disconnectPrisma,
  getPrismaClient,
} from "../kernel/prisma-client.js";
import { resolveConnectionTimeoutMs } from "../kernel/db-connection.js";

const DB_AVAILABLE = (process.env.DATABASE_URL ?? "").startsWith("postgres");

describe("prisma-client", () => {
  test("disconnectPrisma is a no-op when no client was ever constructed", async () => {
    _resetPrismaForTesting();
    await expect(disconnectPrisma()).resolves.toBeUndefined();
  });

  test("getPrismaClient's pool carries the configured connectionTimeoutMillis", async () => {
    // Regression: this pool's connectionTimeoutMillis was hardcoded to 5000,
    // independently of db-connection.ts's getPgPool — a shared local Postgres
    // under concurrent-reindex load timed out this pool's interactive
    // transactions at the same incident that produced the ETL "Connection
    // terminated due to connection timeout" failures.
    if (!DB_AVAILABLE) return;
    _resetPrismaForTesting();
    getPrismaClient();
    const pool = _getPrismaPoolForTesting();
    expect((pool as unknown as { options: { connectionTimeoutMillis: number } } | null)?.options.connectionTimeoutMillis)
      .toBe(resolveConnectionTimeoutMs());
    await disconnectPrisma();
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
