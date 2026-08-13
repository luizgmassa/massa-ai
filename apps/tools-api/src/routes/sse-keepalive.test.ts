/**
 * Unit coverage for the shared SSE keep-alive constants + resolvers
 * (T1, spec SSE-01 AC-01.1/AC-01.2/AC-01.4).
 *
 * `resolveHeartbeatMs` / `resolveMaxDurationMs` are read PER CALL (design
 * D1), so every env-driven case here sets/deletes the var around the call
 * rather than relying on module-load order — mirroring `logs.test.ts` /
 * `events.test.ts`'s own approach to the same env vars.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  TRANSPORT_IDLE_WINDOW_MS,
  SSE_HEARTBEAT_MS_DEFAULT,
  SSE_MAX_DURATION_MS_DEFAULT,
  SSE_REQUEST_TIMEOUT_SECONDS,
  resolveHeartbeatMs,
  resolveMaxDurationMs,
} from "./sse-keepalive.js";

afterEach(() => {
  delete process.env.MASSA_AI_SSE_HEARTBEAT_MS;
  delete process.env.MASSA_AI_SSE_MAX_DURATION_MS;
});

describe("sse-keepalive constants", () => {
  test("TRANSPORT_IDLE_WINDOW_MS is Bun's measured 10s default (spec E4)", () => {
    expect(TRANSPORT_IDLE_WINDOW_MS).toBe(10_000);
  });

  test("SSE_HEARTBEAT_MS_DEFAULT is 5s — strictly below the idle window", () => {
    expect(SSE_HEARTBEAT_MS_DEFAULT).toBe(5_000);
    expect(SSE_HEARTBEAT_MS_DEFAULT).toBeLessThan(TRANSPORT_IDLE_WINDOW_MS);
  });

  test("SSE_MAX_DURATION_MS_DEFAULT is unchanged at 10 minutes (AC-05.1)", () => {
    expect(SSE_MAX_DURATION_MS_DEFAULT).toBe(10 * 60 * 1000);
  });

  test("SSE_REQUEST_TIMEOUT_SECONDS is 120 (spec E6)", () => {
    expect(SSE_REQUEST_TIMEOUT_SECONDS).toBe(120);
  });
});

describe("resolveHeartbeatMs", () => {
  test("falls back to the default with no env var set", () => {
    delete process.env.MASSA_AI_SSE_HEARTBEAT_MS;
    expect(resolveHeartbeatMs()).toBe(SSE_HEARTBEAT_MS_DEFAULT);
  });

  test("honors an explicit numeric override", () => {
    process.env.MASSA_AI_SSE_HEARTBEAT_MS = "1234";
    expect(resolveHeartbeatMs()).toBe(1234);
  });

  test("falls back to the default on a non-numeric override (`Number(x) || default`)", () => {
    process.env.MASSA_AI_SSE_HEARTBEAT_MS = "not-a-number";
    expect(resolveHeartbeatMs()).toBe(SSE_HEARTBEAT_MS_DEFAULT);
  });

  test("falls back to the default on \"0\" — preserved falsy-zero quirk, not fixed", () => {
    process.env.MASSA_AI_SSE_HEARTBEAT_MS = "0";
    expect(resolveHeartbeatMs()).toBe(SSE_HEARTBEAT_MS_DEFAULT);
  });

  test("reads the env var per call, not once at import time", () => {
    delete process.env.MASSA_AI_SSE_HEARTBEAT_MS;
    expect(resolveHeartbeatMs()).toBe(SSE_HEARTBEAT_MS_DEFAULT);
    process.env.MASSA_AI_SSE_HEARTBEAT_MS = "777";
    expect(resolveHeartbeatMs()).toBe(777);
    delete process.env.MASSA_AI_SSE_HEARTBEAT_MS;
    expect(resolveHeartbeatMs()).toBe(SSE_HEARTBEAT_MS_DEFAULT);
  });
});

describe("resolveMaxDurationMs", () => {
  test("falls back to the default with no env var set", () => {
    delete process.env.MASSA_AI_SSE_MAX_DURATION_MS;
    expect(resolveMaxDurationMs()).toBe(SSE_MAX_DURATION_MS_DEFAULT);
  });

  test("honors an explicit numeric override", () => {
    process.env.MASSA_AI_SSE_MAX_DURATION_MS = "9999";
    expect(resolveMaxDurationMs()).toBe(9999);
  });

  test("falls back to the default on a non-numeric override (`Number(x) || default`)", () => {
    process.env.MASSA_AI_SSE_MAX_DURATION_MS = "nope";
    expect(resolveMaxDurationMs()).toBe(SSE_MAX_DURATION_MS_DEFAULT);
  });

  test("falls back to the default on \"0\" — preserved falsy-zero quirk, not fixed", () => {
    process.env.MASSA_AI_SSE_MAX_DURATION_MS = "0";
    expect(resolveMaxDurationMs()).toBe(SSE_MAX_DURATION_MS_DEFAULT);
  });

  test("reads the env var per call, not once at import time", () => {
    delete process.env.MASSA_AI_SSE_MAX_DURATION_MS;
    expect(resolveMaxDurationMs()).toBe(SSE_MAX_DURATION_MS_DEFAULT);
    process.env.MASSA_AI_SSE_MAX_DURATION_MS = "42";
    expect(resolveMaxDurationMs()).toBe(42);
    delete process.env.MASSA_AI_SSE_MAX_DURATION_MS;
    expect(resolveMaxDurationMs()).toBe(SSE_MAX_DURATION_MS_DEFAULT);
  });
});
