/**
 * Per-project in-memory cache invalidator. Apply invokes every registered
 * invalidator for BOTH the source and target project IDs after commit so a
 * rename/merge cannot serve stale project-scoped state (search caches, project
 * root caches, file filters, index managers).
 *
 * Spec req 8: invalidation failures MUST NEVER flip a committed operation to
 * failure. They are captured as sanitized diagnostics in the report.
 */
export interface ProjectIdentityInvalidator {
  /** Stable identifier surfaced in the sanitized failure report. */
  readonly id: string;
  /** Drop only entries scoped to this projectId. Must not throw (but if it does,
   *  the registry catches and records a sanitized code). */
  invalidateProject(projectId: string): Promise<void> | void;
}

export interface ProjectIdentityInvalidationReport {
  readonly invalidated: readonly { invalidatorId: string; projectId: string }[];
  readonly failures: readonly { invalidatorId: string; code: string }[];
}

export const EMPTY_INVALIDATION_REPORT: ProjectIdentityInvalidationReport = Object.freeze({
  invalidated: Object.freeze([] as readonly { invalidatorId: string; projectId: string }[]),
  failures: Object.freeze([] as readonly { invalidatorId: string; code: string }[]),
}) as ProjectIdentityInvalidationReport;

/**
 * Registry of process-local invalidators. Apply owns one instance and invokes
 * `invalidateBoth(source, target)` post-commit. Production registers invalidators
 * for QueryUnderstandingCache, SymbolGraphService.projectRootCache, and any other
 * in-memory projectId-scoped state.
 *
 * L1MemoryCache and the read_file tool cache are deliberately NOT registered:
 * both are TTL-bounded, so a stale entry self-evicts within the TTL window
 * without a per-project hook.
 */
export class ProjectIdentityInvalidatorRegistry {
  private readonly invalidators: ProjectIdentityInvalidator[] = [];

  register(invalidator: ProjectIdentityInvalidator): void {
    this.invalidators.push(invalidator);
  }

  /**
   * Run every registered invalidator for BOTH source and target. Each call is
   * wrapped in try/catch: success → push to `invalidated`; failure → push the
   * SANITIZED code to `failures`. NEVER throws — even if a registrant throws.
   *
   * The report's failure.code contains only a PG SQLSTATE-style code or
   * "UNKNOWN"; it never contains err.message, row data, or project IDs that
   * could leak sensitive material.
   */
  async invalidateBoth(
    source: string,
    target: string,
  ): Promise<ProjectIdentityInvalidationReport> {
    if (this.invalidators.length === 0) {
      // Return the frozen shared instance so callers can use reference
      // equality (apply leaves `result.invalidation` absent in this case,
      // keeping the T1–T3 result shape byte-identical).
      return EMPTY_INVALIDATION_REPORT;
    }
    const invalidated: { invalidatorId: string; projectId: string }[] = [];
    const failures: { invalidatorId: string; code: string }[] = [];

    // Parallel fan-out across (invalidator × projectId). Each cell is isolated;
    // a throw in one never short-circuits the others. Promise.allSettled keeps
    // the {invalidatorId, projectId} binding so the report can attribute each
    // outcome without losing the cell identity on rejection.
    const cells: { invalidator: ProjectIdentityInvalidator; projectId: string }[] = [];
    for (const invalidator of this.invalidators) {
      cells.push({ invalidator, projectId: source });
      cells.push({ invalidator, projectId: target });
    }
    const settled = await Promise.allSettled(
      // Promise.resolve().then(...) converts a SYNCHRONOUS throw from a
      // registrant into a rejection, so one bad invalidator cannot abort the
      // remaining cells before allSettled even sees them.
      cells.map((c) => Promise.resolve().then(() => c.invalidator.invalidateProject(c.projectId))),
    );
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      const outcome = settled[i]!;
      if (outcome.status === "fulfilled") {
        invalidated.push({ invalidatorId: cell.invalidator.id, projectId: cell.projectId });
      } else {
        failures.push({ invalidatorId: cell.invalidator.id, code: sanitizeErrorCode(outcome.reason) });
      }
    }
    return { invalidated, failures };
  }
}

function sanitizeErrorCode(reason: unknown): string {
  if (reason && typeof reason === "object" && "code" in reason) {
    const code = (reason as { code: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "UNKNOWN";
}
