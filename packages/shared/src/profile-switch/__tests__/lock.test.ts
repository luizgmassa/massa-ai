/**
 * lock.ts unit tests — single-flight lock beside install-state.json, ported
 * from the M19 owner-identity + proven-dead-reclaim protocol
 * (scripts/lib/installer-env-transaction.sh, reference only — bash source is
 * not imported). Covers MPS-02 (A10) / design F2.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { acquireLock, type LockIdentity } from "../lock.js";

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-lock-"));
  statePath = path.join(dir, "install-state.json");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Deterministic identity: pid 4242 always reports process-start "start-A" —
 * models "this process is alive and unchanged" for as long as a test keeps
 * using it. */
const liveIdentity: LockIdentity = {
  pid: () => 4242,
  hostname: () => "test-host",
  processStart: (pid) => (pid === 4242 ? "start-A" : null),
};

describe("acquireLock — basic acquire/release", () => {
  test("creates a lock directory beside the state file and returns a release handle", () => {
    const lock = acquireLock(statePath, { identity: liveIdentity });
    expect(fs.existsSync(`${statePath}.switch.lock`)).toBe(true);
    lock.release();
    expect(fs.existsSync(`${statePath}.switch.lock`)).toBe(false);
  });

  test("a second acquire after release succeeds", () => {
    const lock1 = acquireLock(statePath, { identity: liveIdentity });
    lock1.release();
    const lock2 = acquireLock(statePath, { identity: liveIdentity });
    expect(fs.existsSync(`${statePath}.switch.lock`)).toBe(true);
    lock2.release();
  });
});

describe("acquireLock — live-owner contention fails loud (no queueing)", () => {
  test("a second acquire while the first is held throws a named LockHeldError immediately", () => {
    const lock1 = acquireLock(statePath, { identity: liveIdentity });
    const started = Date.now();
    try {
      acquireLock(statePath, { identity: liveIdentity });
      throw new Error("expected acquireLock to throw");
    } catch (err) {
      expect((err as Error).name).toBe("LockHeldError");
    }
    // Fail-loud, not a poll/wait loop.
    expect(Date.now() - started).toBeLessThan(1000);
    lock1.release();
  });
});

describe("acquireLock — dead-owner reclaim (F2, kill-mid-switch)", () => {
  test("a lock whose owner process no longer exists, past the stale threshold, is reclaimed", () => {
    let currentTime = 1_000_000;
    const clock = { now: () => currentTime };

    // First acquire (simulated "switch process") — never released, as if
    // SIGKILLed mid-switch.
    acquireLock(statePath, { identity: liveIdentity, clock, staleAfterMs: 5_000 });

    // Time passes well beyond the stale threshold.
    currentTime += 10_000;

    // A new switch runs; its identity reports the recorded owner pid (4242)
    // as no longer existing (process-start lookup returns null => dead),
    // while still being able to identify itself (pid 9999).
    const deadIdentity: LockIdentity = {
      pid: () => 9999,
      hostname: () => "test-host",
      processStart: (pid) => (pid === 4242 ? null : "reclaimer-start"),
    };
    const lock2 = acquireLock(statePath, { identity: deadIdentity, clock, staleAfterMs: 5_000 });
    expect(fs.existsSync(`${statePath}.switch.lock`)).toBe(true);
    lock2.release();
  });

  test("PID reuse: owner pid now belongs to a different process (start-time signature mismatch) is also reclaimed", () => {
    let currentTime = 1_000_000;
    const clock = { now: () => currentTime };

    acquireLock(statePath, { identity: liveIdentity, clock, staleAfterMs: 5_000 });
    currentTime += 10_000;

    // Same pid, but the process currently occupying it reports a different
    // start-time signature than the one recorded at acquire time.
    const reusedPidIdentity: LockIdentity = {
      pid: () => 9999,
      hostname: () => "test-host",
      processStart: (pid) => (pid === 4242 ? "start-B" : "self-start"),
    };
    const lock2 = acquireLock(statePath, { identity: reusedPidIdentity, clock, staleAfterMs: 5_000 });
    lock2.release();
  });

  test("a lock that is not yet stale is NOT reclaimed even when the owner looks dead (grace period)", () => {
    let currentTime = 1_000_000;
    const clock = { now: () => currentTime };

    acquireLock(statePath, { identity: liveIdentity, clock, staleAfterMs: 5_000 });
    // Advance less than the stale threshold.
    currentTime += 1_000;

    const deadIdentity: LockIdentity = {
      pid: () => 9999,
      hostname: () => "test-host",
      processStart: () => null,
    };
    expect(() => acquireLock(statePath, { identity: deadIdentity, clock, staleAfterMs: 5_000 })).toThrow();
    try {
      acquireLock(statePath, { identity: deadIdentity, clock, staleAfterMs: 5_000 });
    } catch (err) {
      expect((err as Error).name).toBe("LockHeldError");
    }
  });

  test("deliberate fault: a no-reclaim stub (age check disabled) leaves the dead lock held forever — reclaim must be implemented, not assumed", () => {
    // This test exercises the real acquireLock with a huge staleAfterMs,
    // i.e. simulating what a "no-reclaim" implementation would always do:
    // the lock is never considered stale, so contention always fails loud
    // even though the owner is provably dead. Confirms the stale/dead
    // distinction is load-bearing, not redundant.
    let currentTime = 1_000_000;
    const clock = { now: () => currentTime };
    acquireLock(statePath, { identity: liveIdentity, clock, staleAfterMs: Number.MAX_SAFE_INTEGER });
    currentTime += 10_000;
    const deadIdentity: LockIdentity = { pid: () => 9999, hostname: () => "test-host", processStart: () => null };
    try {
      acquireLock(statePath, { identity: deadIdentity, clock, staleAfterMs: Number.MAX_SAFE_INTEGER });
      throw new Error("expected acquireLock to throw under an unreachable stale threshold");
    } catch (err) {
      expect((err as Error).name).toBe("LockHeldError");
    }
  });
});
