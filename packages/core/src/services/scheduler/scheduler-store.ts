/**
 * ScheduledJobStore — durable persistence for the in-process scheduler.
 *
 * Mirrors the JobStore pattern from jobs/index-job-store.ts: SQLite-canonical
 * for local-first, with a PG variant for parity when DATABASE_URL is postgres.
 * The scheduler engine keeps an in-memory copy of enabled jobs as the hot
 * cache; the store persists definitions + nextRunAt/lastRunAt so a process
 * restart can resume the schedule.
 *
 * The store interface is SYNCHRONOUS (matching SqliteJobStore). The PG variant
 * uses an in-memory mirror hydrated async + fire-and-forget writes, exactly
 * like PgJobStore — see scheduler-store-pg.ts.
 */

import { config, logger } from "@massa-th0th/shared";
import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import type { ScheduledJob, ScheduleSpec, JobKind } from "./scheduler-types.js";

export interface ScheduledJobStore {
  /** Upsert a job definition. */
  save(job: ScheduledJob): void;
  /** Get a single job by id. */
  get(id: string): ScheduledJob | null;
  /** List all persisted jobs. */
  listAll(): ScheduledJob[];
  /** List enabled jobs (the scheduler only considers these). */
  listEnabled(): ScheduledJob[];
  /** Delete a job definition. */
  delete(id: string): void;
}

// ── Row ↔ object mapping ─────────────────────────────────────────────────────

interface ScheduledJobRow {
  id: string;
  name: string;
  job_kind: string;
  schedule_type: string; // "interval" | "cron"
  interval_ms: number | null;
  cron: string | null;
  next_run_at: number;
  last_run_at: number;
  enabled: number; // 0 | 1 (SQLite has no native bool)
  payload: string | null; // JSON string
}

function rowToJob(r: ScheduledJobRow): ScheduledJob {
  const schedule: ScheduleSpec =
    r.schedule_type === "cron"
      ? { type: "cron", cron: r.cron ?? undefined }
      : { type: "interval", intervalMs: r.interval_ms ?? undefined };

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
    enabled: r.enabled !== 0,
    payload,
  };
}

// ── SQLite implementation ────────────────────────────────────────────────────

export class SqliteScheduledJobStore implements ScheduledJobStore {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    const dataDir = config.get("dataDir") as string;
    this.dbPath = dbPath ?? path.join(dataDir, "scheduled-jobs.db");
  }

  private getDB(): Database {
    if (this.db) return this.db;
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.exec("PRAGMA busy_timeout = 3000");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        job_kind      TEXT NOT NULL,
        schedule_type TEXT NOT NULL,
        interval_ms   INTEGER,
        cron          TEXT,
        next_run_at   INTEGER NOT NULL,
        last_run_at   INTEGER NOT NULL DEFAULT 0,
        enabled       INTEGER NOT NULL DEFAULT 1,
        payload       TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);
      CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at);
    `);
    logger.info("SqliteScheduledJobStore initialized", { dbPath: this.dbPath });
    return this.db;
  }

  save(job: ScheduledJob): void {
    try {
      const db = this.getDB();
      db.prepare(
        `INSERT INTO scheduled_jobs (
          id, name, job_kind, schedule_type, interval_ms, cron,
          next_run_at, last_run_at, enabled, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          job_kind = excluded.job_kind,
          schedule_type = excluded.schedule_type,
          interval_ms = excluded.interval_ms,
          cron = excluded.cron,
          next_run_at = excluded.next_run_at,
          last_run_at = excluded.last_run_at,
          enabled = excluded.enabled,
          payload = excluded.payload`,
      ).run(
        job.id,
        job.name,
        job.jobKind,
        job.schedule.type,
        job.schedule.intervalMs ?? null,
        job.schedule.cron ?? null,
        job.nextRunAt,
        job.lastRunAt,
        job.enabled ? 1 : 0,
        job.payload ? JSON.stringify(job.payload) : null,
      );
    } catch (e) {
      logger.warn("ScheduledJobStore.save failed (best-effort)", {
        id: job.id,
        error: (e as Error).message,
      });
    }
  }

  get(id: string): ScheduledJob | null {
    try {
      const db = this.getDB();
      const row = db
        .prepare(`SELECT * FROM scheduled_jobs WHERE id = ?`)
        .get(id) as ScheduledJobRow | null;
      return row ? rowToJob(row) : null;
    } catch {
      return null;
    }
  }

  listAll(): ScheduledJob[] {
    try {
      const db = this.getDB();
      const rows = db
        .prepare(`SELECT * FROM scheduled_jobs ORDER BY next_run_at ASC`)
        .all() as ScheduledJobRow[];
      return rows.map(rowToJob);
    } catch {
      return [];
    }
  }

  listEnabled(): ScheduledJob[] {
    try {
      const db = this.getDB();
      const rows = db
        .prepare(`SELECT * FROM scheduled_jobs WHERE enabled = 1 ORDER BY next_run_at ASC`)
        .all() as ScheduledJobRow[];
      return rows.map(rowToJob);
    } catch {
      return [];
    }
  }

  delete(id: string): void {
    try {
      this.getDB().prepare(`DELETE FROM scheduled_jobs WHERE id = ?`).run(id);
    } catch {
      /* best-effort */
    }
  }
}
