/**
 * Single-flight lock for the profile-switch engine, ported from the M19
 * owner-identity + proven-dead-reclaim protocol in
 * `scripts/lib/installer-env-transaction.sh` (bash source is a behavioral
 * reference only — this is a TS port of the protocol, not code reuse: that
 * file is not importable from a package published to npm).
 *
 * Unlike the bash installer transaction (which waits up to a timeout for a
 * held lock), the switch engine's Error Handling Strategy is "fail loud, no
 * queueing" (design table): contention on a live owner throws immediately.
 * A lock is only ever reclaimed when its owner is *proven* dead — past a
 * stale-age threshold AND the recorded process-start identity no longer
 * matches reality (process gone, or PID reused by a different process).
 * Without reclaim, one SIGKILL mid-switch would deadlock every future
 * switch (design F2).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export class LockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockError";
  }
}

function namedError(name: string, message: string): LockError {
  const err = new LockError(message);
  err.name = name;
  return err;
}

export const LockHeldError = (lockDir: string): LockError =>
  namedError("LockHeldError", `another switch is running (lock held at ${lockDir})`);

export const LockAcquireError = (lockDir: string, cause: string): LockError =>
  namedError("LockAcquireError", `could not acquire switch lock at ${lockDir}: ${cause}`);

/** Injectable so tests can simulate process death / PID reuse without
 * spawning or killing real processes. */
export interface LockIdentity {
  pid(): number;
  hostname(): string;
  /** Returns a stable identity string for `pid`'s current process-start
   * time, or `null` when no such process currently exists. */
  processStart(pid: number): string | null;
}

export interface LockClock {
  now(): number;
}

export interface AcquireLockOptions {
  /** Age (ms) an owner record must reach before it is even eligible for
   * proven-dead reclaim. Mirrors the bash default of 300s. */
  staleAfterMs?: number;
  clock?: LockClock;
  identity?: LockIdentity;
}

export interface AcquiredLock {
  readonly lockDir: string;
  release(): void;
}

interface OwnerRecord {
  host: string;
  pid: number;
  processStart: string;
  token: string;
  timestamp: number;
}

const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;

const DEFAULT_CLOCK: LockClock = { now: () => Date.now() };

const DEFAULT_IDENTITY: LockIdentity = {
  pid: () => process.pid,
  hostname: () => os.hostname(),
  processStart: (pid: number): string | null => {
    try {
      const out = execFileSync("ps", ["-p", String(pid), "-o", "lstart="], {
        encoding: "utf-8",
      }).trim();
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  },
};

function readOwner(ownerPath: string): OwnerRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(ownerPath, "utf-8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<OwnerRecord>;
  if (
    typeof r.host === "string" &&
    typeof r.pid === "number" &&
    typeof r.processStart === "string" &&
    typeof r.token === "string" &&
    typeof r.timestamp === "number"
  ) {
    return r as OwnerRecord;
  }
  return null;
}

function releaseIfOwned(lockDir: string, ownerPath: string, token: string): void {
  const owner = readOwner(ownerPath);
  if (owner === null || owner.token !== token) return; // never release a lock we don't own
  fs.rmSync(lockDir, { recursive: true, force: true });
}

/**
 * Acquires the single-flight switch lock beside `stateFilePath`
 * (`<stateFilePath>.switch.lock`). Throws `LockHeldError` immediately on
 * live-owner contention (no wait/poll loop). When the lock directory exists
 * but its owner is provably dead (stale age + a process-start mismatch),
 * reclaims it once and retries; a race lost during reclaim also fails loud
 * rather than looping.
 */
export function acquireLock(stateFilePath: string, options: AcquireLockOptions = {}): AcquiredLock {
  const lockDir = `${stateFilePath}.switch.lock`;
  const ownerPath = path.join(lockDir, "owner.json");
  const clock = options.clock ?? DEFAULT_CLOCK;
  const identity = options.identity ?? DEFAULT_IDENTITY;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  const createFresh = (): AcquiredLock => {
    fs.mkdirSync(lockDir);
    const pid = identity.pid();
    const startedAt = identity.processStart(pid);
    if (startedAt == null) {
      fs.rmSync(lockDir, { recursive: true, force: true });
      throw LockAcquireError(lockDir, "could not determine this process's start-time identity");
    }
    const token = crypto.randomUUID();
    const record: OwnerRecord = {
      host: identity.hostname(),
      pid,
      processStart: startedAt,
      token,
      timestamp: clock.now(),
    };
    fs.mkdirSync(path.dirname(ownerPath), { recursive: true });
    fs.writeFileSync(ownerPath, JSON.stringify(record));
    return { lockDir, release: () => releaseIfOwned(lockDir, ownerPath, token) };
  };

  try {
    return createFresh();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }

  // Lock dir already exists — decide reclaim vs fail loud, once, no wait.
  const owner = readOwner(ownerPath);
  const provenDead =
    owner !== null &&
    clock.now() - owner.timestamp >= staleAfterMs &&
    identity.processStart(owner.pid) !== owner.processStart;

  if (!provenDead) throw LockHeldError(lockDir);

  const reclaimDir = `${lockDir}.reclaim.${owner!.token}`;
  try {
    fs.renameSync(lockDir, reclaimDir);
  } catch {
    // Another switch reclaimed or refreshed it first — fail loud, don't loop.
    throw LockHeldError(lockDir);
  }
  fs.rmSync(reclaimDir, { recursive: true, force: true });

  try {
    return createFresh();
  } catch {
    throw LockHeldError(lockDir);
  }
}
