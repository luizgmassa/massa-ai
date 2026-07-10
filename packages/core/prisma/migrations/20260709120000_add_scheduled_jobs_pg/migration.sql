-- Scheduled Jobs (Phase 3, C2): PG parity for the in-process scheduler.
-- The SQLite store (SqliteScheduledJobStore / scheduled-jobs.db) is the
-- local-first default; this table lets a Postgres deployment keep scheduler
-- state in the SAME backend as the rest of the data plane (one-backend rule).
-- Timestamps are BIGINT ms-epochs (parity with the SQLite store's INTEGER epoch
-- columns and IndexJob). Idempotent — safe to re-run.
CREATE TABLE IF NOT EXISTS "scheduled_jobs" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "job_kind"      TEXT NOT NULL,
    "schedule_type" TEXT NOT NULL,
    "interval_ms"   BIGINT,
    "cron"          TEXT,
    "next_run_at"   BIGINT NOT NULL,
    "last_run_at"   BIGINT NOT NULL DEFAULT 0,
    "enabled"       INTEGER NOT NULL DEFAULT 1,
    "payload"       TEXT,
    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "scheduled_jobs_enabled_idx" ON "scheduled_jobs"("enabled");
CREATE INDEX IF NOT EXISTS "scheduled_jobs_next_run_at_idx" ON "scheduled_jobs"("next_run_at");
