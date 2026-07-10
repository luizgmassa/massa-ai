/**
 * ScheduledJobStore factory — selects SQLite or PG backend, mirroring
 * getJobStore() / getMemoryRepository().
 *
 * Dispatch rule (one-backend rule): if DATABASE_URL is postgres, use
 * PgScheduledJobStore; otherwise SqliteScheduledJobStore (local-first default).
 * On failure, fall back to a no-op store so the scheduler never crashes the
 * host process on a store init error.
 */

import { logger } from "@massa-th0th/shared";
import type { ScheduledJobStore } from "./scheduler-store.js";
import type { ScheduledJob } from "./scheduler-types.js";

let cachedStore: ScheduledJobStore | null = null;

export function getScheduledJobStore(): ScheduledJobStore {
  if (cachedStore) return cachedStore;
  const databaseUrl = process.env.DATABASE_URL;
  const isPostgres =
    databaseUrl?.startsWith("postgresql://") ||
    databaseUrl?.startsWith("postgres://");
  try {
    if (isPostgres) {
      const { PgScheduledJobStore } = require("./scheduler-store-pg.js") as {
        PgScheduledJobStore: new () => ScheduledJobStore;
      };
      cachedStore = new PgScheduledJobStore();
      logger.info("Using PostgreSQL ScheduledJobStore");
    } else {
      const { SqliteScheduledJobStore } = require("./scheduler-store.js") as {
        SqliteScheduledJobStore: new () => ScheduledJobStore;
      };
      cachedStore = new SqliteScheduledJobStore();
    }
  } catch (e) {
    logger.warn("ScheduledJobStore unavailable — using no-op store", {
      backend: isPostgres ? "postgres" : "sqlite",
      error: (e as Error).message,
    });
    cachedStore = new NoopScheduledJobStore();
  }
  return cachedStore;
}

export function resetScheduledJobStore(): void {
  cachedStore = null;
}

/** No-op fallback: scheduler can still register jobs in-memory. */
class NoopScheduledJobStore implements ScheduledJobStore {
  private jobs: Map<string, ScheduledJob> = new Map();
  save(job: ScheduledJob): void {
    this.jobs.set(job.id, job);
  }
  get(id: string): ScheduledJob | null {
    return this.jobs.get(id) ?? null;
  }
  listAll(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }
  listEnabled(): ScheduledJob[] {
    return Array.from(this.jobs.values()).filter((j) => j.enabled);
  }
  delete(id: string): void {
    this.jobs.delete(id);
  }
}
