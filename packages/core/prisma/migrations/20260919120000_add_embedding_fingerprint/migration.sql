/*
  Migration: add_embedding_fingerprint
  Adds workspaces.embedding_fingerprint (LIP-15): the "${provider}:${model}:${dimensions}"
  string stamped on the workspace row by a full reindex, so search and the
  auto-reindex write gate can detect a provider/model switch and refuse to mix
  two embedding spaces in one vector table. NULL means legacy/never-stamped —
  never blocks, warned once, and stamped by the next full reindex.
  Idempotent — safe to re-run.
*/

ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "embedding_fingerprint" TEXT;
