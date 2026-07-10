/**
 * PgScheduledJobStore — PostgreSQL parity for the scheduler store.
 *
 * Mirrors PgJobStore's discipline: the ScheduledJobStore interface is
 * SYNCHRONOUS (the scheduler calls store.save/get with no await, matching the
 * SQLite store). PG is inherently async, so this store:
 *   - Writes fire-and-forget (best-effort, logged on failure — matching the
 *     SQLite store's try/catch best-effort semantics).
 *   - Reads are served from an in-memory mirror hydrated from PG on first use
 *     (async) and kept in sync by every save.
 *
 * Uses raw SQL ($executeRaw / $queryRaw) via the shared prisma client — the
 * same pattern as PgJobStore and MemoryRepositoryPg — to avoid the Prisma 7.7.0
 * + adapter-pg isObjectEnumValue incompatibility. Reuses getPrismaClient().
 */

import { logger } from "@massa-th0th/shared";
import { getPrismaClient } from "../query/prisma-client.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import type { ScheduledJob, ScheduleSpec, JobKind } from "./scheduler-types.js";
import type { ScheduledJobStore } from "./scheduler-store.js";

interface ScheduledJobRow {
  id: string;
  name: string;
  job_kind: string;
  schedule_type: string;
  interval_ms: number | bigint | null;
  cron: string | null;
  next_run_at: number | bigint;
  last_run_at: number | bigint;
  enabled: number | bigint;
  payload: string | null;
}

function toNum(v: number | bigint | null | undefined): number | null {
  if (v == null) return null;
  return typeof v === "bigint" ? Number(v) : v;
}

function rowToJob(r: ScheduledJobRow): ScheduledJob {
  const scheduleType = r.schedule_type;
  const intervalMs = toNum(r.interval_ms);
  const cron = r.cron;
  const schedule: ScheduleSpec =
    scheduleType === "cron"
      ? { type: "cron", cron: cron ?? undefined }
      : { type: "interval", intervalMs: intervalMs ?? undefined };

  let payload: Record<string, unknown> | undefined;
  if (r.payload) {
    try {
      payload = JSON.parse(r.payload);
    } catch {
      payload = undefined;
    }
  }

  return {
    id: r.id,
    name: r.name,
    jobKind: r.job_kind as JobKind,
    schedule,
    nextRunAt: Number(r.next_run_at),
    lastRunAt: Number(r.last_run_at),
    enabled: Number(r.enabled) !== 0,
    payload,
  };
}

export class PgScheduledJobStore implements ScheduledJobStore {
  private prisma!: PrismaClient;
  private mirror: Map<string, ScheduledJob> = new Map();
  private hydrated = false;
  private hydrating: Promise<void> | null = null;

  private getClient(): PrismaClient {
    if (!this.prisma) this.prisma = getPrismaClient();
    return this.prisma;
  }

  /**
   * Best-effort hydrate the mirror from PG. Resolves (never rejects) — failures
   * log a warn and leave the mirror empty; the scheduler can still register jobs
   * in-memory and will persist them once PG is reachable.
   */
  private ensureHydrated(): Promise<void> {
    if (this.hydrated) return Promise.resolve();
    if (this.hydrating) return this.hydrating;
    this.hydrating = (async () => {
      try {
        const prisma = this.getClient();
        const rows = await prisma.$queryRaw<ScheduledJobRow[]>`
          SELECT * FROM scheduled_jobs
        `;
        const next: Map<string, ScheduledJob> = new Map();
        const inflightIds = new Set(this.mirror.keys());
        const dbIds = new Set<string>();
        for (const row of rows) {
          dbIds.add(row.id);
          next.set(row.id, rowToJob(row));
        }
        // Re-apply any in-flight save whose row isn't in the DB snapshot yet.
        for (const id of inflightIds) {
          if (!dbIds.has(id)) {
            const existing = this.mirror.get(id);
            if (existing) next.set(id, existing);
          }
        }
        this.mirror = next;
        this.hydrated = true;
        logger.info("PgScheduledJobStore hydrated", { rows: this.mirror.size });
      } catch (e) {
        logger.warn("PgScheduledJobStore hydrate failed (best-effort)", {
          error: (e as Error).message,
        });
      } finally {
        this.hydrating = null;
      }
    })();
    return this.hydrating;
  }

  save(job: ScheduledJob): void {
    // Mirror update is synchronous so a subsequent sync get() sees the value.
    this.mirror.set(job.id, job);
    void this.ensureHydrated();
    // Fire-and-forget persist (best-effort, matching PgJobStore).
    void (async () => {
      try {
        const prisma = this.getClient();
        const intervalMs = job.schedule.intervalMs ?? null;
        const cron = job.schedule.cron ?? null;
        const payload = job.payload ? JSON.stringify(job.payload) : null;
        await prisma.$executeRaw`
          INSERT INTO scheduled_jobs (
            id, name, job_kind, schedule_type, interval_ms, cron,
            next_run_at, last_run_at, enabled, payload
          ) VALUES (
            ${job.id},
            ${job.name},
            ${job.jobKind},
            ${job.schedule.type},
            ${intervalMs !== null ? intervalMs : null}::bigint,
            ${cron},
            ${job.nextRunAt}::bigint,
            ${job.lastRunAt}::bigint,
            ${job.enabled ? 1 : 0}::int,
            ${payload}
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            job_kind = EXCLUDED.job_kind,
            schedule_type = EXCLUDED.schedule_type,
            interval_ms = EXCLUDED.interval_ms,
            cron = EXCLUDED.cron,
            next_run_at = EXCLUDED.next_run_at,
            last_run_at = EXCLUDED.last_run_at,
            enabled = EXCLUDED.enabled,
            payload = EXCLUDED.payload
        `;
      } catch (e) {
        logger.warn("PgScheduledJobStore.save failed (best-effort)", {
          id: job.id,
          error: (e as Error).message,
        });
      }
    })();
  }

  get(id: string): ScheduledJob | null {
    void this.ensureHydrated();
    return this.mirror.get(id) ?? null;
  }

  listAll(): ScheduledJob[] {
    void this.ensureHydrated();
    return Array.from(this.mirror.values()).sort((a, b) => a.nextRunAt - b.nextRunAt);
  }

  listEnabled(): ScheduledJob[] {
    void this.ensureHydrated();
    return Array.from(this.mirror.values())
      .filter((j) => j.enabled)
      .sort((a, b) => a.nextRunAt - b.nextRunAt);
  }

  delete(id: string): void {
    this.mirror.delete(id);
    void (async () => {
      try {
        const prisma = this.getClient();
        await prisma.$executeRaw`DELETE FROM scheduled_jobs WHERE id = ${id}`;
      } catch {
        /* best-effort */
      }
    })();
  }

  /** Test helper: await in-flight writes. Not for production use. */
  async __drain(): Promise<void> {
    // No per-id chain (scheduler saves are low-frequency); a short settle delay
    // covers the fire-and-forget persist. Kept for API parity with PgJobStore.
    await new Promise((r) => setTimeout(r, 10));
  }
}
