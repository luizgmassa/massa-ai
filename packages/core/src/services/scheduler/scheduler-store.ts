import type { ScheduledJob } from "./scheduler-types.js";

/**
 * Backend-neutral scheduler persistence contract.
 *
 * Every read is **synchronous by design** — the tick loop must not await inside
 * a scheduling decision. A backend that cannot answer synchronously from
 * memory therefore serves reads from a mirror it fills asynchronously, and
 * `ready()` is how a caller waits for that mirror before making a decision that
 * depends on persisted state.
 *
 * EB-SCH-6: without it, `PgScheduledJobStore.get()` answered from a cold mirror
 * at boot (`scheduler-store-pg.ts:246-249` calls `ensureHydrated()`
 * fire-and-forget), so `registerOrResumeJob` saw no existing row and recomputed
 * `nextRunAt` as `now + intervalMs` — the schedule silently restarted on every
 * API restart. The measured drift equalled the restart duration, 20702 ms.
 */
export interface ScheduledJobStore {
  save(job: ScheduledJob): void;
  get(id: string): ScheduledJob | null;
  listAll(): ScheduledJob[];
  listEnabled(): ScheduledJob[];
  delete(id: string): void;
  /**
   * Resolve once synchronous reads reflect persisted state.
   *
   * Optional: a store that is authoritative in memory (the in-memory store,
   * and every test double) is ready the moment it is constructed and omits
   * this. Await it before any decision that compares against persisted state —
   * boot-time job registration above all.
   */
  ready?(): Promise<void>;
}
