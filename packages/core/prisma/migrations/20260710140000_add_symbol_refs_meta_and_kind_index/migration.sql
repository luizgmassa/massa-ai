-- Add nullable `meta` JSON column to symbol_references for typed-edge metadata
-- (route URL, event name, param index, caller FQN). Backward-compatible:
-- existing rows have NULL meta. Parity with SQLite backend (migration v2).
ALTER TABLE "symbol_references" ADD COLUMN "meta" JSONB;

-- Index for typed-edge filtering (WHERE ref_kind IN (...)).
CREATE INDEX IF NOT EXISTS "symbol_references_project_id_ref_kind_idx"
  ON "symbol_references" ("project_id", "ref_kind");
