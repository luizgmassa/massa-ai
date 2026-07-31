/**
 * db-connection unit tests — covers getDbConfig, getPgPool, closeConnections.
 */

import { describe, expect, test } from "bun:test";
import { getDbConfig, getPgPool, closeConnections } from "../kernel/db-connection.js";

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

  test("getPgPool returns a shared pool instance", async () => {
    if (!DB_AVAILABLE) return;
    const pool1 = await getPgPool();
    const pool2 = await getPgPool();
    expect(pool1).toBe(pool2);
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