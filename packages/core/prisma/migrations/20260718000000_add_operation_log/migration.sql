-- M8 — audit-log attribution for destructive operations.
-- Additive + reversible: a single new table for who/when/what/scope/result.
-- No data backfill, no changes to existing tables.

CREATE TABLE IF NOT EXISTS "operation_log" (
    "id" BIGSERIAL PRIMARY KEY,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "actor_type" TEXT NOT NULL DEFAULT 'api_key',
    "actor_id" TEXT NOT NULL DEFAULT 'unknown',
    "project_id" TEXT,
    "op" TEXT NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "result" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "error" TEXT,

    CONSTRAINT "operation_log_result_check"
      CHECK ("result" IN ('success', 'failure', 'partial'))
);

CREATE INDEX IF NOT EXISTS "operation_log_project_id_occurred_at_idx"
    ON "operation_log" ("project_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "operation_log_op_occurred_at_idx"
    ON "operation_log" ("op", "occurred_at" DESC);
