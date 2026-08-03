/**
 * Unit tests for `services/indexing/acquire-indexing-lease.ts` — the lease
 * module out of `tools/index_project.ts` (PR-D, T14b).
 *
 * WHAT THE PRE-EXISTING SUITES ALREADY REACH, measured at HEAD before a line
 * moved, so what this file adds is stated rather than assumed:
 *
 *  - `index-project-tool.test.ts` drives both lease branches — `:406` (busy) and
 *    `:419` (begin throws) — but asserts ONLY the `ToolResponse`: `result.error`
 *    contains `"indexing_busy"` / `"Failed to acquire indexing lease"`. It never
 *    calls `indexJobTracker.getJob`, and the marker string
 *    `managed_runs_begin_failed:` occurred at exactly ONE site in the whole
 *    repository (`index_project.ts:196`) and in ZERO tests.
 *  - `index-job-tracker-events.test.ts` uses `indexing_busy:run-42` and friends,
 *    but drives the tracker DIRECTLY with hardcoded strings; it never reaches
 *    this call site.
 *  - `etl-pipeline-lease.test.ts` covers the pipeline's heartbeat/complete/abort
 *    half of FR-09 — what happens to a lease AFTER it is acquired.
 *
 * So the terminal job-tracker transition on both failure branches was unpinned:
 * the ONE observable that separates "the module resolved to `failed`" from "the
 * module threw and `handle()`'s outer catch swallowed it" is exactly the one
 * nothing asserted. `handle()`'s outer catch calls no `setResult` at all, so a
 * throw that escapes leaves the job non-terminal forever while still returning
 * a plausible-looking 500 body.
 *
 * NO module mock, ON `execute-indexing.test.ts`'s PRECEDENT. One is registered
 * by resolved path and reaches every module loaded beside it in the same
 * process; `spyOn` is scoped to the object and restored per test.
 *
 * IT ALSO NAMES NONE OF `run-tests-isolated.ts`'s ISOLATION LITERALS — and this
 * paragraph is deliberately vague about which, because an earlier draft of it
 * listed the three pipeline / search / workspace singletons BY NAME in order to
 * claim their absence, and that claim is what matched. The predicate at
 * `run-tests-isolated.ts:28-54` is a plain word-boundary scan over test SOURCE,
 * comments included; the sentence asserting the property destroyed it. Measured
 * rather than argued: core went `150 → 151` isolated for a suite that mocks
 * nothing of the kind, and back to fork-free once the names were removed. Read
 * the classification out of the runner's own output; never predict it (T13's
 * gate predicted a label and got it wrong while the count held).
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { logger } from "@massa-ai/shared";
import { indexJobTracker } from "../services/jobs/index-job-tracker.js";
import { ManagedRunRepositoryPg } from "../data/managed-runs/managed-run-repository-pg.js";
import {
  acquireIndexingLease,
  type AcquireIndexingLeaseResult,
} from "../services/indexing/acquire-indexing-lease.js";

/* ── harness ──────────────────────────────────────────────────────────────── */

const LEASE = {
  runId: "run-77",
  projectId: "proj",
  runKind: "indexing" as const,
  leaseToken: "tok-77",
  leaseExpiresAt: 1_700_000_090_000,
  eventId: "index:job-77",
};

const spies: Array<{ mockRestore: () => void }> = [];
const track = <T extends { mockRestore: () => void }>(s: T): T => {
  spies.push(s);
  return s;
};

type BeginBehaviour =
  | { kind: "acquired" }
  | { kind: "busy"; activeRunId: string; leaseExpiresAt: number }
  | { kind: "throws"; message: string }
  | { kind: "getInstanceThrows"; message: string };

/** Records the exact `begin()` input and the order of observable effects. */
function harness(behaviour: BeginBehaviour) {
  const order: string[] = [];
  const beginCalls: unknown[] = [];

  const begin = async (input: unknown) => {
    order.push("begin");
    beginCalls.push(input);
    if (behaviour.kind === "throws") throw new Error(behaviour.message);
    if (behaviour.kind === "busy") {
      return {
        status: "busy" as const,
        activeRunId: behaviour.activeRunId,
        leaseExpiresAt: behaviour.leaseExpiresAt,
      };
    }
    return { status: "acquired" as const, lease: LEASE };
  };

  track(
    spyOn(ManagedRunRepositoryPg, "getInstance").mockImplementation((() => {
      if (behaviour.kind === "getInstanceThrows") {
        throw new Error(behaviour.message);
      }
      order.push("getInstance");
      return { begin } as unknown as ManagedRunRepositoryPg;
    }) as typeof ManagedRunRepositoryPg.getInstance),
  );

  const setResult = track(
    spyOn(indexJobTracker, "setResult").mockImplementation((() => {
      order.push("setResult");
    }) as typeof indexJobTracker.setResult),
  );

  const errorLog = track(
    spyOn(logger, "error").mockImplementation((() => {
      order.push("logger.error");
    }) as typeof logger.error),
  );

  return { order, beginCalls, setResult, errorLog };
}

afterEach(() => {
  while (spies.length) spies.pop()!.mockRestore();
});

/* ── 1. the acquired arm ──────────────────────────────────────────────────── */

describe("acquireIndexingLease — acquired", () => {
  test("returns the lease under the `acquired` discriminant", async () => {
    harness({ kind: "acquired" });
    const result = await acquireIndexingLease({ jobId: "job-77", projectId: "proj" });
    expect(result.status).toBe("acquired");
    expect(result).toEqual({ status: "acquired", lease: LEASE });
  });

  test("derives eventId from the job id and asks for runKind `indexing`", async () => {
    const h = harness({ kind: "acquired" });
    await acquireIndexingLease({ jobId: "job-77", projectId: "proj" });
    expect(h.beginCalls).toHaveLength(1);
    expect(h.beginCalls[0]).toEqual({
      projectId: "proj",
      runKind: "indexing",
      eventId: "index:job-77",
    });
  });

  test("records NO terminal job result on the happy path", async () => {
    const h = harness({ kind: "acquired" });
    await acquireIndexingLease({ jobId: "job-77", projectId: "proj" });
    expect(h.setResult).not.toHaveBeenCalled();
    expect(h.errorLog).not.toHaveBeenCalled();
  });
});

/* ── 2. the busy arm ──────────────────────────────────────────────────────── */

describe("acquireIndexingLease — busy", () => {
  const busy = { kind: "busy" as const, activeRunId: "run-existing", leaseExpiresAt: 1_700_000_500_000 };

  test("returns activeRunId and leaseExpiresAt under the `busy` discriminant", async () => {
    harness(busy);
    const result = await acquireIndexingLease({ jobId: "job-b", projectId: "proj" });
    expect(result).toEqual({
      status: "busy",
      activeRunId: "run-existing",
      leaseExpiresAt: 1_700_000_500_000,
    });
  });

  test("marks the job terminal with the indexing_busy marker and errors 0", async () => {
    const h = harness(busy);
    await acquireIndexingLease({ jobId: "job-b", projectId: "proj" });
    expect(h.setResult).toHaveBeenCalledTimes(1);
    const [jobId, stats, message] = h.setResult.mock.calls[0] as [
      string,
      { filesIndexed: number; chunksIndexed: number; errors: number; duration: number },
      string,
    ];
    expect(jobId).toBe("job-b");
    expect(message).toBe("indexing_busy:run-existing");
    expect(stats).toEqual({ filesIndexed: 0, chunksIndexed: 0, errors: 0, duration: 0 });
  });

  test("records the terminal result BEFORE resolving, not after", async () => {
    const h = harness(busy);
    await acquireIndexingLease({ jobId: "job-b", projectId: "proj" });
    expect(h.order).toEqual(["getInstance", "begin", "setResult"]);
  });

  test("does not log an error — busy is an expected outcome, not a failure", async () => {
    const h = harness(busy);
    await acquireIndexingLease({ jobId: "job-b", projectId: "proj" });
    expect(h.errorLog).not.toHaveBeenCalled();
  });
});

/* ── 3. the failed arm — a thrown begin() RESOLVES, it does not reject ────── */

describe("acquireIndexingLease — a thrown begin()", () => {
  const thrown = { kind: "throws" as const, message: "connection refused" };

  test("RESOLVES to `failed` carrying the thrown message", async () => {
    harness(thrown);
    // `await expect(...).resolves` and not a floating assertion: a floating
    // `.rejects` passes under the very mutation it exists to kill (C74, T12).
    const result: AcquireIndexingLeaseResult = await acquireIndexingLease({
      jobId: "job-f",
      projectId: "proj",
    });
    expect(result).toEqual({ status: "failed", message: "connection refused" });
  });

  test("marks the job terminal with the begin-failed marker and errors 1", async () => {
    const h = harness(thrown);
    await acquireIndexingLease({ jobId: "job-f", projectId: "proj" });
    expect(h.setResult).toHaveBeenCalledTimes(1);
    const [jobId, stats, message] = h.setResult.mock.calls[0] as [
      string,
      { errors: number },
      string,
    ];
    expect(jobId).toBe("job-f");
    expect(message).toBe("managed_runs_begin_failed:connection refused");
    expect(stats).toEqual({ filesIndexed: 0, chunksIndexed: 0, errors: 1, duration: 0 });
  });

  test("logs the failure with the job and project context", async () => {
    const h = harness(thrown);
    await acquireIndexingLease({ jobId: "job-f", projectId: "proj" });
    expect(h.errorLog).toHaveBeenCalledTimes(1);
    const [message, , context] = h.errorLog.mock.calls[0] as [string, Error, unknown];
    expect(message).toBe("managed_runs begin failed");
    expect(context).toEqual({ jobId: "job-f", projectId: "proj" });
  });

  test("logs before it records, so a thrown setResult cannot swallow the log", async () => {
    const h = harness(thrown);
    await acquireIndexingLease({ jobId: "job-f", projectId: "proj" });
    expect(h.order).toEqual(["getInstance", "begin", "logger.error", "setResult"]);
  });
});

/* ── 4. the throw POSITION, which is the contract the call site depends on ── */

describe("acquireIndexingLease — getInstance() is outside the try, deliberately", () => {
  test("a throw from getInstance() REJECTS rather than resolving to `failed`", async () => {
    harness({ kind: "getInstanceThrows", message: "no prisma client" });
    // In the shipped handler this call sat OUTSIDE the inner try but inside
    // `handle()`'s outer one, so it produced "Failed to start indexing: …" and
    // NO tracker transition. Pulling it inside this module's try would silently
    // change both. Asserted with `await` — see C74.
    await expect(
      acquireIndexingLease({ jobId: "job-g", projectId: "proj" }),
    ).rejects.toThrow("no prisma client");
  });

  test("and records no terminal result, matching the outer catch it belongs to", async () => {
    const h = harness({ kind: "getInstanceThrows", message: "no prisma client" });
    await acquireIndexingLease({ jobId: "job-g", projectId: "proj" }).catch(() => undefined);
    expect(h.setResult).not.toHaveBeenCalled();
    expect(h.order).toEqual([]);
  });
});
