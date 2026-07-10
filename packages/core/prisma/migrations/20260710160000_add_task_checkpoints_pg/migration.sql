-- Task Checkpoints (Phase 3, #16): PG parity for the checkpoint store.
-- The SQLite store (CheckpointManager / memories.db / task_checkpoints) is the
-- local-first default; this table lets a Postgres deployment persist task/INDEX
-- execution state in the same backend as the rest of the data plane (one-backend
-- rule). Timestamps are BIGINT ms-epochs (parity with the SQLite store's INTEGER
-- epoch columns and IndexJob/ScheduledJob/SynapseSession). State is a
-- gzip-compressed JSON blob (parity with Bun.deflateSync). Idempotent — safe
-- to re-run.

CREATE TABLE IF NOT EXISTS "task_checkpoints" (
    "id"                    TEXT NOT NULL,
    "task_id"               TEXT NOT NULL,
    "task_description"      TEXT,
    "agent_id"              TEXT,
    "project_id"            TEXT,
    "state"                 BYTEA NOT NULL,
    "state_schema_version"  INTEGER NOT NULL DEFAULT 1,
    "memory_ids"            TEXT,
    "file_changes"          TEXT,
    "checkpoint_type"       TEXT NOT NULL,
    "parent_checkpoint_id"  TEXT,
    "created_at"            BIGINT NOT NULL,
    "expires_at"            BIGINT,
    CONSTRAINT "task_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "task_checkpoints_task_id_idx" ON "task_checkpoints"("task_id");
CREATE INDEX IF NOT EXISTS "task_checkpoints_project_id_idx" ON "task_checkpoints"("project_id");
CREATE INDEX IF NOT EXISTS "task_checkpoints_created_at_idx" ON "task_checkpoints"("created_at");
CREATE INDEX IF NOT EXISTS "task_checkpoints_checkpoint_type_idx" ON "task_checkpoints"("checkpoint_type");
