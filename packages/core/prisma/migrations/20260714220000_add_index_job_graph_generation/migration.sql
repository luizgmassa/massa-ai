ALTER TABLE index_jobs
  ADD COLUMN IF NOT EXISTS activated_graph_generation_id TEXT;

CREATE INDEX IF NOT EXISTS index_jobs_activated_graph_generation_id_idx
  ON index_jobs(activated_graph_generation_id);
