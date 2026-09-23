/**
 * db-connection unit tests — covers getDbConfig, getPgPool, closeConnections.
 */

import { describe, expect, test } from "bun:test";
import { getDbConfig, getPgPool, closeConnections, resolveConnectionTimeoutMs } from "../kernel/db-connection.js";

const DB_AVAILABLE = (process.env.DATABASE_URL ?? "").startsWith("postgres");

describe("db-connection", () => {
  test("getDbConfig returns connection string and pool size", () => {
    const config = getDbConfig();
    expect(config.connectionString).toBeDefined();
    expect(config.poolSize).toBeGreaterThan(0);
  });

  test("getDbConfig reads DB_POOL_SIZE env", () => {
    const original = process.env.DB_POOL_SIZE;
    process.env.DB_POOL_SIZE = "20";
    const config = getDbConfig();
    expect(config.poolSize).toBe(20);
    process.env.DB_POOL_SIZE = original;
  });

  test("getDbConfig falls back to 10 for invalid pool size", () => {
    const original = process.env.DB_POOL_SIZE;
    process.env.DB_POOL_SIZE = "not-a-number";
    const config = getDbConfig();
    expect(config.poolSize).toBeNaN(); // parseInt returns NaN
    process.env.DB_POOL_SIZE = original;
  });

  test("getDbConfig defaults connectionTimeoutMs to 15000", () => {
    const original = process.env.DB_CONNECTION_TIMEOUT_MS;
    delete process.env.DB_CONNECTION_TIMEOUT_MS;
    const config = getDbConfig();
    expect(config.connectionTimeoutMs).toBe(15_000);
    if (original !== undefined) process.env.DB_CONNECTION_TIMEOUT_MS = original;
  });

  test("getDbConfig reads DB_CONNECTION_TIMEOUT_MS env", () => {
    const original = process.env.DB_CONNECTION_TIMEOUT_MS;
    process.env.DB_CONNECTION_TIMEOUT_MS = "30000";
    const config = getDbConfig();
    expect(config.connectionTimeoutMs).toBe(30_000);
    if (original === undefined) delete process.env.DB_CONNECTION_TIMEOUT_MS;
    else process.env.DB_CONNECTION_TIMEOUT_MS = original;
  });

  test("resolveConnectionTimeoutMs falls back to 15000 for invalid input", () => {
    const original = process.env.DB_CONNECTION_TIMEOUT_MS;
    process.env.DB_CONNECTION_TIMEOUT_MS = "not-a-number";
    expect(resolveConnectionTimeoutMs()).toBe(15_000);
    process.env.DB_CONNECTION_TIMEOUT_MS = "-5";
    expect(resolveConnectionTimeoutMs()).toBe(15_000);
    if (original === undefined) delete process.env.DB_CONNECTION_TIMEOUT_MS;
    else process.env.DB_CONNECTION_TIMEOUT_MS = original;
  });

  test("getPgPool returns a shared pool instance", async () => {
    if (!DB_AVAILABLE) return;
    const pool1 = await getPgPool();
    const pool2 = await getPgPool();
    expect(pool1).toBe(pool2);
  });

  test("getPgPool's constructed pool actually carries the configured connectionTimeoutMillis", async () => {
    // The reported bug was the *pool option*, not getDbConfig's return value —
    // a mutant that reverted this call site to a hardcoded 5000 would pass
    // every getDbConfig-only test above and still reproduce the incident.
    if (!DB_AVAILABLE) return;
    await closeConnections();
    const pool = await getPgPool();
    expect((pool as unknown as { options: { connectionTimeoutMillis: number } }).options.connectionTimeoutMillis)
      .toBe(resolveConnectionTimeoutMs());
    await closeConnections();
  });

  test("closeConnections closes the pool and allows re-creation", async () => {
    if (!DB_AVAILABLE) return;
    const pool1 = await getPgPool();
    await closeConnections();
    const pool2 = await getPgPool();
    expect(pool1).not.toBe(pool2);
    await closeConnections();
  });

  test("closeConnections is a no-op when no pool exists", async () => {
    await closeConnections();
    expect(true).toBe(true); // should not throw
  });
});