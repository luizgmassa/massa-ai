-- Additive + reversible attribution provenance for hook observations (M45/HAR-05, HAR-06).
-- No backfill: pre-existing rows keep NULL provenance/agent.
ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS agent_id TEXT,
  ADD COLUMN IF NOT EXISTS attribution_source TEXT;
