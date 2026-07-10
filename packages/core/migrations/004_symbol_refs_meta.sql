-- 004: Add `meta` JSON column to symbol_references for typed-edge metadata.
-- Parity with Prisma migration 20260710140000 and SQLite symbol-db migration v2.
-- Backward-compatible: existing rows have NULL meta.

ALTER TABLE symbol_references
  ADD COLUMN IF NOT EXISTS meta JSONB;

CREATE INDEX IF NOT EXISTS idx_sym_ref_kind
  ON symbol_references (project_id, ref_kind);
