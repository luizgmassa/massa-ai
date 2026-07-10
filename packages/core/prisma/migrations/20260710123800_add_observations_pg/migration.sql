-- Observations (Phase 3, G1): PG parity for the observation store.
-- The SQLite store (SqliteObservationStore / observations.db) is the
-- local-first default; this table lets a Postgres deployment persist the
-- passive lifecycle captures (hook-ingestion telemetry) and compaction
-- snapshots in the SAME backend as the rest of the data plane (one-backend
-- rule). Timestamps are BIGINT ms-epochs (parity with the SQLite store's
-- INTEGER epoch `created_at` column and the ObservationStore interface's
-- `createdAt: number`). Idempotent — safe to re-run.
--
-- NOTE: the Prisma `Observation` model declares `createdAt DateTime`, but the
-- ObservationStore interface (and the SQLite store) use a numeric ms-epoch.
-- PgObservationStore reads/writes created_at as BIGINT to match the store
-- contract; the Prisma model's DateTime is aspirational and not used by the
-- raw-SQL store (same discipline as scheduled_jobs / synapse_sessions).

CREATE TABLE IF NOT EXISTS "observations" (
    "id"            TEXT NOT NULL,
    "project_id"    TEXT NOT NULL,
    "session_id"    TEXT,
    "source"        TEXT NOT NULL,
    "category"      TEXT,
    "payload_json"  TEXT NOT NULL,
    "importance"    DOUBLE PRECISION NOT NULL,
    "created_at"    BIGINT NOT NULL,
    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "observations_project_id_created_at_idx"
    ON "observations"("project_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "observations_session_id_idx"
    ON "observations"("session_id");

CREATE INDEX IF NOT EXISTS "observations_session_id_created_at_idx"
    ON "observations"("session_id", "created_at" DESC);
