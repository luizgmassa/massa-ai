/**
 * @massa-ai/core - Managed-run lease acquisition for indexing
 *
 * The second module out of `tools/index_project.ts` (PR-D, T14b), after module 8
 * (`execute-indexing.ts`, T13). It owns the synchronous managed_runs lease
 * acquisition that used to sit inline in `IndexProjectTool.handle()` at
 * `:151-202`, and it is the task that closes `check-tools-thin`'s third clause:
 * `handle()` was 129 lines against a ceiling of 120, and nothing else in Phase 4
 * removes a single line from inside it (C33).
 *
 * THE FILENAME IS AN AUTHOR-LEVEL CHOICE AND NO ARTIFACT MAKES IT. `design.md`
 * §5.1's module table runs 1-8 plus 8b and has no row for this module at all —
 * C33 minted T14b at Tasks time, after Design was written — and the task row
 * names only the directory, `services/indexing/`. Chosen for the convention its
 * one sibling already sets: `execute-indexing.ts` exports `executeIndexing`, so
 * a verb-led stem whose kebab-case is the exported function. Rejected:
 * `managed-run-lease.ts`, which borrows `data/managed-runs/`'s vocabulary and
 * names the persisted concept rather than the indexing action this module
 * performs; and `indexing-lease.ts`, noun-led, which reads like a type module
 * and breaks the sibling's convention.
 *
 * THE RESULT IS THE REPOSITORY'S OWN UNION PLUS ONE ARM. `BeginManagedRunOutcome`
 * (`managed-run-contract.ts:92-94`) is already
 * `{acquired, lease} | {busy, activeRunId, leaseExpiresAt}`. This module adds
 * `failed`, because `begin()` THROWS on infrastructure failure and the handler
 * needs one exhaustive discriminant rather than a union plus a try/catch. The
 * three arms are what `handle()` switches on; nothing else crosses the boundary.
 *
 * `getInstance()` IS DELIBERATELY OUTSIDE THIS FUNCTION'S `try`, AND MOVING IT IN
 * IS A SILENT BEHAVIOUR CHANGE. In the shipped handler it sat at `:159`, outside
 * the inner try but inside `handle()`'s outer one, so a throw from it produced
 * `"Failed to start indexing: …"` and NO job-tracker transition. Inside this
 * try it would instead produce `"Failed to acquire indexing lease: …"` AND a
 * terminal `setResult`. Both observable differences are pinned, in this module's
 * suite and at the call site — C74's shape, where the call POSITION rather than
 * the call is what carries the contract.
 *
 * THE TERMINAL TRANSITION IS THE HALF NOTHING WATCHED. `handle()`'s outer catch
 * never calls `setResult`, while both branches moved here always do — so a
 * failure that escapes this function instead of resolving to `{status:"failed"}`
 * leaves the job non-terminal forever. Measured before this module existed:
 * `managed_runs_begin_failed:` occurred at exactly ONE site in the repository
 * and in ZERO tests, and no suite anywhere asserted the tracker's state on
 * either lease path. That gap, not the response text, is why the sensors here
 * assert `setResult` rather than the returned string.
 *
 * IT DOES NOT SERVE `project-indexer.ts`'s AUTO-REINDEX PATH, ON PURPOSE.
 * `services/search/project-indexer.ts:436` runs the same begin/busy/lease shape
 * with its own `reindex:${projectId}:${randomUUID()}` event id and no `jobId` at
 * all. Generalising this module to cover both would widen T14b's write set past
 * what its row prices, for a caller that shares neither the id format nor the
 * job-tracker transitions. Recorded so the omission reads as a decision.
 */
import { logger } from "@massa-ai/shared";
import { indexJobTracker } from "../jobs/index-job-tracker.js";
import { ManagedRunRepositoryPg } from "../../data/managed-runs/managed-run-repository-pg.js";
import type { ManagedRunLease } from "../../data/managed-runs/managed-run-contract.js";

export interface AcquireIndexingLeaseRequest {
  /** The tracker job this lease belongs to; also the event-id source. */
  jobId: string;
  projectId: string;
}

/**
 * `BeginManagedRunOutcome` plus the `failed` arm this module converts a thrown
 * `begin()` into, so the caller has one exhaustive discriminant.
 */
export type AcquireIndexingLeaseResult =
  | { status: "acquired"; lease: ManagedRunLease }
  | { status: "busy"; activeRunId: string; leaseExpiresAt: number }
  | { status: "failed"; message: string };

/**
 * Wave 5 FR-09: acquire a managed_runs lease synchronously so the MCP/HTTP
 * caller gets 202 (acquired) or 409 busy BEFORE the long ETL runs in the
 * background. The lease is passed into the pipeline, which owns
 * heartbeat/complete/abort. `eventId` is derived from the job id so a retry of
 * the same job is idempotent at the lease layer (a completed/aborted row's
 * event_id is not reused because the partial UNIQUE only covers active rows).
 *
 * Resolves on every outcome the caller can act on and rejects only on what the
 * handler's own outer catch used to own — see the docblock above.
 */
export async function acquireIndexingLease(
  request: AcquireIndexingLeaseRequest,
): Promise<AcquireIndexingLeaseResult> {
  const { jobId, projectId } = request;
  const eventId = `index:${jobId}`;
  const managedRunRepo = ManagedRunRepositoryPg.getInstance();

  try {
    const beginOutcome = await managedRunRepo.begin({
      projectId,
      runKind: "indexing",
      eventId,
    });
    if (beginOutcome.status === "busy") {
      // 409: another live indexer holds this project. The tracker gets a
      // terminal result here; the handler shapes the runId into the 409 body.
      indexJobTracker.setResult(
        jobId,
        { filesIndexed: 0, chunksIndexed: 0, errors: 0, duration: 0 },
        `indexing_busy:${beginOutcome.activeRunId}`,
      );
      return {
        status: "busy",
        activeRunId: beginOutcome.activeRunId,
        leaseExpiresAt: beginOutcome.leaseExpiresAt,
      };
    }
    return { status: "acquired", lease: beginOutcome.lease };
  } catch (beginError) {
    logger.error("managed_runs begin failed", beginError as Error, {
      jobId,
      projectId,
    });
    // Fail loud — a lease failure is a 500, not a silent retry. The caller
    // can retry; the lease table is the source of truth.
    indexJobTracker.setResult(
      jobId,
      { filesIndexed: 0, chunksIndexed: 0, errors: 1, duration: 0 },
      `managed_runs_begin_failed:${(beginError as Error).message}`,
    );
    return { status: "failed", message: (beginError as Error).message };
  }
}
