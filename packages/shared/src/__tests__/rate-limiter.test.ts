/**
 * Rate limiter unit tests.
 * Mocks ../config/index (rateLimit block) for SmartRateLimiter and the logger
 * for noise suppression.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ── Logger mock (rate-limiter logs on init/check) ──
mock.module("../utils/logger.js", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    metric: () => {},
  },
  LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
}));

// ── Config mock (resilient: handles all keys any utils module may call) ──
let rateLimitState = { requestsPerMinute: 60, tokensPerMinute: 100000 };
let loggingState = { level: "info", enableMetrics: false };
let securityState = { sanitizeInputs: true, maxInputLength: 100000 };

mock.module("../config/index.js", () => ({
  config: {
    get: (key: string) => {
      if (key === "rateLimit") return rateLimitState;
      if (key === "logging") return loggingState;
      if (key === "security") return securityState;
      return undefined;
    },
  },
}));

import { RateLimiter, SmartRateLimiter } from "../utils/rate-limiter";

describe("RateLimiter (token bucket)", () => {
  test("starts full: tryConsume succeeds up to maxTokens", () => {
    const rl = new RateLimiter(5, 1);
    expect(rl.tryConsume(1)).toBe(true);
    expect(rl.tryConsume(1)).toBe(true);
    expect(rl.tryConsume(1)).toBe(true);
    expect(rl.tryConsume(1)).toBe(true);
    expect(rl.tryConsume(1)).toBe(true);
  });

  test("tryConsume fails when insufficient tokens", () => {
    const rl = new RateLimiter(2, 1);
    expect(rl.tryConsume(1)).toBe(true);
    expect(rl.tryConsume(1)).toBe(true);
    expect(rl.tryConsume(1)).toBe(false);
  });

  test("tryConsume default tokens=1", () => {
    const rl = new RateLimiter(1, 1);
    expect(rl.tryConsume()).toBe(true); // default 1
    expect(rl.tryConsume()).toBe(false);
  });

  test("refills over time (stub Date.now to simulate elapsed time)", () => {
    const rl = new RateLimiter(10, 10); // 10 tokens/sec
    // Drain all
    for (let i = 0; i < 10; i++) rl.tryConsume(1);
    expect(rl.tryConsume(1)).toBe(false);

    // Advance time by 100ms -> 1 token added (10/sec * 0.1s = 1)
    const realNow = Date.now;
    let t = realNow();
    Date.now = () => t + 100;
    try {
      expect(rl.tryConsume(1)).toBe(true); // 1 token now available
      expect(rl.tryConsume(1)).toBe(false); // drained again
    } finally {
      Date.now = realNow;
    }
  });

  test("refill caps at maxTokens (no overflow)", () => {
    const rl = new RateLimiter(5, 100);
    // advance a lot of time
    const realNow = Date.now;
    let t = realNow();
    Date.now = () => t + 10_000;
    try {
      expect(rl.getAvailableTokens()).toBeLessThanOrEqual(5);
      expect(rl.getAvailableTokens()).toBe(5);
    } finally {
      Date.now = realNow;
    }
  });

  test("getAvailableTokens returns current token count after refill", () => {
    const rl = new RateLimiter(3, 1);
    expect(rl.getAvailableTokens()).toBe(3);
    rl.tryConsume(2);
    expect(rl.getAvailableTokens()).toBe(1);
  });

  test("reset restores full tokens and lastRefill", () => {
    const rl = new RateLimiter(4, 1);
    rl.tryConsume(4);
    expect(rl.getAvailableTokens()).toBeLessThanOrEqual(4);
    rl.reset();
    expect(rl.getAvailableTokens()).toBe(4);
    expect(rl.tryConsume(1)).toBe(true);
  });

  test("consume() waits then succeeds", async () => {
    const rl = new RateLimiter(2, 1000); // 2 tokens max, fast refill
    // Drain both tokens so consume() must wait for a refill.
    expect(rl.tryConsume(2)).toBe(true);
    // Advance time dynamically so refill() sees elapsed time and grants tokens.
    const realNow = Date.now;
    let t = realNow();
    Date.now = () => (t += 50); // each call advances 50ms -> ~50 tokens added
    try {
      await rl.consume(1); // should succeed after one short sleep loop iteration
    } finally {
      Date.now = realNow;
    }
  });

  test("consume() enters the wait loop and sleeps when refilled tokens are insufficient", async () => {
    // 1 token max, slow-ish refill (20/sec). After draining, the first
    // tryConsume inside consume() fails (no time has elapsed -> 0 tokens), so
    // the loop must actually await sleep() before the next refill grants enough.
    const rl = new RateLimiter(1, 20);
    expect(rl.tryConsume(1)).toBe(true); // drain -> 0 tokens

    const start = Date.now();
    await rl.consume(1); // sleeps ~100ms (Math.max(100, waitTime)) then succeeds
    const elapsed = Date.now() - start;

    // Real sleep happened (>= ~90ms), proving the wait-loop / sleep() path ran.
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(rl.tryConsume(1)).toBe(false); // consumed again -> empty
  });
});

describe("SmartRateLimiter", () => {
  let frozenNow: number;
  let realNow: () => number;

  beforeEach(() => {
    rateLimitState = { requestsPerMinute: 60, tokensPerMinute: 100000 };
    realNow = Date.now;
    frozenNow = realNow();
    Date.now = () => frozenNow; // freeze time -> no refill between calls
  });

  afterEach(() => {
    Date.now = realNow;
  });

  test("constructor initializes request + token limiters from config", () => {
    const srl = new SmartRateLimiter();
    const status = srl.getStatus();
    expect(status.requestsMax).toBe(60);
    expect(status.tokensMax).toBe(100000);
    expect(status.requestsAvailable).toBe(60);
    expect(status.tokensAvailable).toBe(100000);
  });

  test("checkRequest true when capacity available", async () => {
    const srl = new SmartRateLimiter();
    expect(await srl.checkRequest(1000)).toBe(true);
  });

  test("checkRequest false when request capacity exhausted", async () => {
    const srl = new SmartRateLimiter();
    // exhaust request capacity (60) — time frozen so no refill
    for (let i = 0; i < 60; i++) await srl.checkRequest(1);
    expect(await srl.checkRequest(1)).toBe(false);
  });

  test("checkRequest false when token capacity exhausted", async () => {
    rateLimitState = { requestsPerMinute: 100, tokensPerMinute: 1000 };
    const srl = new SmartRateLimiter();
    // one request consuming 1000 tokens exhausts token limiter
    expect(await srl.checkRequest(1000)).toBe(true);
    // request capacity remains but token capacity gone
    expect(await srl.checkRequest(1000)).toBe(false);
  });

  test("getStatus returns floored available counts", async () => {
    const srl = new SmartRateLimiter();
    await srl.checkRequest(500);
    const status = srl.getStatus();
    expect(Number.isInteger(status.requestsAvailable)).toBe(true);
    expect(Number.isInteger(status.tokensAvailable)).toBe(true);
  });

  test("waitForCapacity resolves when capacity is available (consumes 1 request + tokens)", async () => {
    const srl = new SmartRateLimiter();
    const before = srl.getStatus();
    await srl.waitForCapacity(500);
    const after = srl.getStatus();
    // One request consumed and 500 tokens consumed (time frozen -> no refill).
    expect(after.requestsAvailable).toBe(before.requestsAvailable - 1);
    expect(after.tokensAvailable).toBe(before.tokensAvailable - 500);
  });

  test("checkRequest returns true when both request and token capacity are available", async () => {
    const srl = new SmartRateLimiter();
    expect(await srl.checkRequest(100)).toBe(true);
    expect(await srl.checkRequest()).toBe(true); // default estimatedTokens
  });

  test("reset restores both limiters", async () => {
    const srl = new SmartRateLimiter();
    for (let i = 0; i < 60; i++) await srl.checkRequest(1);
    expect(await srl.checkRequest(1)).toBe(false);
    srl.reset();
    expect(await srl.checkRequest(1)).toBe(true);
  });
});