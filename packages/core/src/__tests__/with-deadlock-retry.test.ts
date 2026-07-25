/**
 * withDeadlockRetry unit tests — pure retry logic, no DB.
 * Covers isRetriableTransactionError detection + retry loop + backoff +
 * non-retriable immediate throw + maxAttempts exhaustion.
 */

import { describe, expect, test } from "bun:test";
import {
  isRetriableTransactionError,
  withDeadlockRetry,
} from "../data/with-deadlock-retry.js";

describe("isRetriableTransactionError", () => {
  test("detects SQLSTATE 40P01 (deadlock_detected) via .code", () => {
    expect(isRetriableTransactionError({ code: "40P01" })).toBe(true);
  });

  test("detects SQLSTATE 40001 (serialization_failure) via .code", () => {
    expect(isRetriableTransactionError({ code: "40001" })).toBe(true);
  });

  test("detects SQLSTATE 40P02 (deadlock_found) via .code", () => {
    expect(isRetriableTransactionError({ code: "40P02" })).toBe(true);
  });

  test("detects retriable SQLSTATE embedded in Prisma message text", () => {
    expect(
      isRetriableTransactionError(
        new Error("Raw query failed. Code: `40P01`. db query breached"),
      ),
    ).toBe(true);
    expect(
      isRetriableTransactionError(
        new Error("Raw query failed. Code: `40001`. serialization issue"),
      ),
    ).toBe(true);
    expect(
      isRetriableTransactionError(
        new Error("Raw query failed. Code: `40P02`. deadlock"),
      ),
    ).toBe(true);
  });

  test("returns false for non-retriable error codes", () => {
    expect(isRetriableTransactionError({ code: "23505" })).toBe(false);
    expect(isRetriableTransactionError({ code: "42703" })).toBe(false);
  });

  test("returns false for errors without a code or matching message", () => {
    expect(isRetriableTransactionError(new Error("something else"))).toBe(false);
    expect(isRetriableTransactionError({})).toBe(false);
    expect(isRetriableTransactionError(null)).toBe(false);
    expect(isRetriableTransactionError(undefined)).toBe(false);
    expect(isRetriableTransactionError("string")).toBe(false);
    expect(isRetriableTransactionError(42)).toBe(false);
  });

  test("returns false when code is not a string", () => {
    expect(isRetriableTransactionError({ code: 404 })).toBe(false);
    expect(isRetriableTransactionError({ code: null })).toBe(false);
  });
});

describe("withDeadlockRetry", () => {
  test("returns the result on first success (no retry)", async () => {
    let calls = 0;
    const result = await withDeadlockRetry(async () => {
      calls++;
      return "ok";
    }, { operation: "test" });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retries on retriable error and succeeds on second attempt", async () => {
    let calls = 0;
    const result = await withDeadlockRetry(async () => {
      calls++;
      if (calls === 1) throw { code: "40P01" };
      return "recovered";
    }, { operation: "test", baseDelayMs: 1 });
    expect(result).toBe("recovered");
    expect(calls).toBe(2);
  });

  test("retries on retriable Prisma message and succeeds on later attempt", async () => {
    let calls = 0;
    const result = await withDeadlockRetry(async () => {
      calls++;
      if (calls < 3) throw new Error("Raw query failed. Code: `40001`.");
      return "ok-3";
    }, { operation: "test", baseDelayMs: 1 });
    expect(result).toBe("ok-3");
    expect(calls).toBe(3);
  });

  test("throws immediately on non-retriable error", async () => {
    let calls = 0;
    await expect(
      withDeadlockRetry(async () => {
        calls++;
        throw new Error("non-retriable");
      }, { operation: "test", baseDelayMs: 1 }),
    ).rejects.toThrow("non-retriable");
    expect(calls).toBe(1);
  });

  test("throws after exhausting maxAttempts on persistent retriable error", async () => {
    let calls = 0;
    await expect(
      withDeadlockRetry(async () => {
        calls++;
        throw { code: "40P01", message: "deadlock" };
      }, { operation: "test", maxAttempts: 3, baseDelayMs: 1 }),
    ).rejects.toMatchObject({ code: "40P01" });
    expect(calls).toBe(3);
  });

  test("respects custom maxAttempts=1 (no retries)", async () => {
    let calls = 0;
    await expect(
      withDeadlockRetry(async () => {
        calls++;
        throw { code: "40P01" };
      }, { operation: "test", maxAttempts: 1, baseDelayMs: 1 }),
    ).rejects.toMatchObject({ code: "40P01" });
    expect(calls).toBe(1);
  });

  test("uses default maxAttempts=5 when not specified", async () => {
    let calls = 0;
    await expect(
      withDeadlockRetry(async () => {
        calls++;
        throw { code: "40P01" };
      }, { operation: "test", baseDelayMs: 1 }),
    ).rejects.toMatchObject({ code: "40P01" });
    expect(calls).toBe(5);
  });
});