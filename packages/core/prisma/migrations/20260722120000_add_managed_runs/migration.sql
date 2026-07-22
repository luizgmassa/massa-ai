-- Wave 5 M-W5-01 — managed_runs (FR-08 / AD-W5-004 / AD-W5-013 / AD-W5-014)
--
-- Single table unifying indexing lease (CAS, 90s expiry + 30s heartbeat) and
-- idempotent event_id dedup + FileCursor resume (FR-09 / FR-10). Mirrors the
-- proven graph_generations lease pattern (Wave 3 MLTS-011) but decoupled from
-- the immutable snapshot row (AD-W5-004): an indexing run is a process-writer
-- concept with a different lifecycle than a generation snapshot.
--
-- Reaper (AD-W5-013): every begin() first UPDATEs expired active rows to
-- 'aborted'. The managed_runs_status_active partial index supports that
-- reaper query (status='active' filter).
--
-- getActive pin (AD-W5-014): WHERE status='active' AND lease_expires_at >
-- clock_timestamp() ORDER BY lease_expires_at DESC LIMIT 1. The
-- managed_runs_one_active_per_project_kind partial UNIQUE index enforces "one
-- live active row per (project_id, run_kind)" so concurrent begin() calls
-- cannot both acquire.
--
-- event_id uniqueness (FR-10): UNIQUE(project_id, event_id) prevents duplicate
-- application across crashes/restarts (idempotent incremental import).

BEGIN;

CREATE TABLE "managed_runs" (
  "id" BIGSERIAL PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "run_kind" TEXT NOT NULL CHECK ("run_kind" IN ('indexing', 'reindex', 'maintenance')),
  "event_id" TEXT NOT NULL,
  "content_hash" TEXT,
  "file_cursor" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'completed', 'failed', 'aborted')),
  "lease_token" TEXT,
  "lease_expires_at" TIMESTAMPTZ,
  "heartbeat_at" TIMESTAMPTZ,
  "created_at" BIGINT NOT NULL,
  "completed_at" BIGINT,
  CONSTRAINT "managed_runs_lease_pair_check" CHECK (("lease_token" IS NULL) = ("lease_expires_at" IS NULL))
);

-- FR-10: idempotent event_id — one committed row per (project_id, event_id).
CREATE UNIQUE INDEX "managed_runs_event_unique"
  ON "managed_runs" ("project_id", "event_id");

-- AD-W5-014: one ACTIVE row per (project_id, run_kind). Partial unique on
-- `status='active'` only — `clock_timestamp()` is not allowed in an index
-- predicate (PostgreSQL requires IMMUTABLE functions). Stale-but-active
-- rows (orphaned by SIGKILL) remain in this index, so begin() MUST first run
-- the reaper (AD-W5-013: UPDATE expired active→aborted) inside the same
-- transaction before the INSERT. That keeps the partial unique satisfiable
-- for the new row while still enforcing "at most one live active row" once
-- the reaper has cleared the stale entry. getActive() then filters by
-- `lease_expires_at > clock_timestamp()` at query time (AD-W5-014 pin).
CREATE UNIQUE INDEX "managed_runs_one_active_per_project_kind"
  ON "managed_runs" ("project_id", "run_kind")
  WHERE "status" = 'active';

-- Lease expiry lookup (reaper + heartbeat queries).
CREATE INDEX "managed_runs_lease_expiry"
  ON "managed_runs" ("lease_expires_at") WHERE "lease_expires_at" IS NOT NULL;

-- AD-W5-013: reaper index. begin() UPDATEs expired active rows to 'aborted';
-- this partial index makes that UPDATE fast even with many historical rows.
CREATE INDEX "managed_runs_status_active"
  ON "managed_runs" ("project_id", "run_kind", "status") WHERE "status" = 'active';

COMMIT;