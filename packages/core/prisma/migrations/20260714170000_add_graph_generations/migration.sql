BEGIN;

LOCK TABLE "workspaces", "symbol_files", "symbol_definitions", "symbol_references", "symbol_imports", "symbol_centrality" IN ACCESS EXCLUSIVE MODE;

-- Sensors capture the exact legacy row population before any ownership rewrite.
CREATE TEMP TABLE "_graph_generation_pre_counts" ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM "workspaces") AS workspaces,
  (SELECT count(*) FROM "symbol_files") AS files,
  (SELECT count(*) FROM "symbol_definitions") AS definitions,
  (SELECT count(*) FROM "symbol_references") AS references,
  (SELECT count(*) FROM "symbol_imports") AS imports,
  (SELECT count(*) FROM "symbol_centrality") AS centrality;

CREATE TABLE "graph_generations" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "fingerprint" TEXT NOT NULL,
  "input_snapshot_hash" TEXT NOT NULL,
  "expected_active_id" TEXT,
  "lease_token" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "expected_files_count" INTEGER NOT NULL DEFAULT 0,
  "completed_files_count" INTEGER NOT NULL DEFAULT 0,
  "files_count" INTEGER NOT NULL DEFAULT 0,
  "definitions_count" INTEGER NOT NULL DEFAULT 0,
  "references_count" INTEGER NOT NULL DEFAULT 0,
  "imports_count" INTEGER NOT NULL DEFAULT 0,
  "centrality_count" INTEGER NOT NULL DEFAULT 0,
  "diagnostics_count" INTEGER NOT NULL DEFAULT 0,
  "recovered_count" INTEGER NOT NULL DEFAULT 0,
  "hard_failures_count" INTEGER NOT NULL DEFAULT 0,
  "stale_files_count" INTEGER NOT NULL DEFAULT 0,
  "failure_reason" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "superseded_at" TIMESTAMP(3),
  CONSTRAINT "graph_generations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "graph_generations_project_id_id_key" UNIQUE ("project_id", "id"),
  CONSTRAINT "graph_generations_status_check" CHECK ("status" IN ('pending','active','superseded','failed')),
  CONSTRAINT "graph_generations_counts_check" CHECK (
    "expected_files_count" >= 0 AND "completed_files_count" >= 0 AND "files_count" >= 0 AND
    "definitions_count" >= 0 AND "references_count" >= 0 AND "imports_count" >= 0 AND
    "centrality_count" >= 0 AND "diagnostics_count" >= 0 AND "recovered_count" >= 0 AND
    "hard_failures_count" >= 0 AND "stale_files_count" >= 0
  ),
  CONSTRAINT "graph_generations_lease_pair_check" CHECK (("lease_token" IS NULL) = ("lease_expires_at" IS NULL))
);

ALTER TABLE "workspaces"
  ADD COLUMN "active_graph_generation_id" TEXT,
  ADD COLUMN "pending_graph_generation_id" TEXT,
  ADD COLUMN "graph_lease_token" TEXT,
  ADD COLUMN "graph_lease_expires_at" TIMESTAMP(3),
  ADD COLUMN "graph_lease_heartbeat_at" TIMESTAMP(3),
  ADD COLUMN "active_files_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "active_definitions_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "active_references_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "active_imports_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "active_centrality_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "active_diagnostics_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "active_recovered_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "active_hard_failures_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "active_stale_files_count" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "workspaces_graph_lease_pair_check" CHECK (
    (("graph_lease_token" IS NULL) = ("graph_lease_expires_at" IS NULL)) AND
    ("graph_lease_heartbeat_at" IS NULL OR "graph_lease_token" IS NOT NULL)
  ),
  ADD CONSTRAINT "workspaces_active_counts_check" CHECK (
    "active_files_count" >= 0 AND "active_definitions_count" >= 0 AND "active_references_count" >= 0 AND
    "active_imports_count" >= 0 AND "active_centrality_count" >= 0 AND "active_diagnostics_count" >= 0 AND
    "active_recovered_count" >= 0 AND "active_hard_failures_count" >= 0 AND "active_stale_files_count" >= 0
  );

ALTER TABLE "symbol_files"
  ADD COLUMN "generation_id" TEXT,
  ADD COLUMN "language" TEXT,
  ADD COLUMN "dialect" TEXT,
  ADD COLUMN "grammar_version" TEXT,
  ADD COLUMN "query_pack_version" TEXT,
  ADD COLUMN "resolver_version" TEXT,
  ADD COLUMN "parser_status" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "parser_error_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "diagnostics" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "is_stale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "last_known_good_generation_id" TEXT,
  ADD COLUMN "last_successful_at" TIMESTAMP(3),
  ADD CONSTRAINT "symbol_files_parser_status_check" CHECK ("parser_status" IN ('legacy','ok','recovered','unsupported','failed')),
  ADD CONSTRAINT "symbol_files_parser_error_count_check" CHECK ("parser_error_count" >= 0),
  ADD CONSTRAINT "symbol_files_diagnostics_check" CHECK (jsonb_typeof("diagnostics") = 'array' AND jsonb_array_length("diagnostics") <= 10);

ALTER TABLE "symbol_definitions"
  ADD COLUMN "generation_id" TEXT,
  ADD COLUMN "qualified_name" TEXT,
  ADD COLUMN "canonical_signature" TEXT,
  ADD COLUMN "signature_hash" TEXT,
  ADD COLUMN "legacy_fqn" TEXT,
  ADD COLUMN "source_span" JSONB;

ALTER TABLE "symbol_references" ADD COLUMN "generation_id" TEXT, ADD COLUMN "source_span" JSONB;
ALTER TABLE "symbol_imports" ADD COLUMN "generation_id" TEXT;
ALTER TABLE "symbol_centrality" ADD COLUMN "generation_id" TEXT;

INSERT INTO "graph_generations" (
  "id", "project_id", "status", "fingerprint", "input_snapshot_hash",
  "expected_files_count", "completed_files_count", "files_count", "definitions_count",
  "references_count", "imports_count", "centrality_count", "started_at", "completed_at", "activated_at"
)
SELECT
  'legacy-' || md5(w."project_id"), w."project_id", 'active', 'legacy:v1',
  'md5:' || md5(w."project_path" || E'\n' || COALESCE((
    SELECT string_agg(f."relative_path" || E'\x1f' || f."content_hash", E'\n' ORDER BY f."relative_path", f."content_hash")
    FROM "symbol_files" f WHERE f."project_id" = w."project_id"
  ), '')),
  (SELECT count(*) FROM "symbol_files" f WHERE f."project_id" = w."project_id"),
  (SELECT count(*) FROM "symbol_files" f WHERE f."project_id" = w."project_id"),
  (SELECT count(*) FROM "symbol_files" f WHERE f."project_id" = w."project_id"),
  (SELECT count(*) FROM "symbol_definitions" d WHERE d."project_id" = w."project_id"),
  (SELECT count(*) FROM "symbol_references" r WHERE r."project_id" = w."project_id"),
  (SELECT count(*) FROM "symbol_imports" i WHERE i."project_id" = w."project_id"),
  (SELECT count(*) FROM "symbol_centrality" c WHERE c."project_id" = w."project_id"),
  COALESCE(w."last_indexed_at", w."updated_at"), COALESCE(w."last_indexed_at", w."updated_at"),
  COALESCE(w."last_indexed_at", w."updated_at")
FROM "workspaces" w;

UPDATE "workspaces" w SET
  "active_graph_generation_id" = g."id",
  "active_files_count" = g."files_count", "active_definitions_count" = g."definitions_count",
  "active_references_count" = g."references_count", "active_imports_count" = g."imports_count",
  "active_centrality_count" = g."centrality_count"
FROM "graph_generations" g WHERE g."project_id" = w."project_id" AND g."status" = 'active';

UPDATE "symbol_files" t SET
  "generation_id" = w."active_graph_generation_id",
  "last_known_good_generation_id" = w."active_graph_generation_id",
  "last_successful_at" = t."indexed_at"
FROM "workspaces" w WHERE w."project_id" = t."project_id";
UPDATE "symbol_definitions" t SET
  "generation_id" = w."active_graph_generation_id",
  "qualified_name" = CASE
    WHEN t."id" LIKE t."file_path" || '#%'
      AND length(t."id") - length(replace(t."id", '#', '')) = 1
      AND substring(split_part(t."id", '#', 2) FROM '~(module|namespace|class|interface|trait|enum|function|method|constructor|property|field|variable|constant|type|type_parameter|export|heading|key)~[0-9a-f]{64}$') = t."kind"
      AND split_part(substring(split_part(t."id", '#', 2) FROM '^(.*)~(?:module|namespace|class|interface|trait|enum|function|method|constructor|property|field|variable|constant|type|type_parameter|export|heading|key)~[0-9a-f]{64}$'), '.', -1) = t."name"
    THEN substring(split_part(t."id", '#', 2) FROM '^(.*)~(?:module|namespace|class|interface|trait|enum|function|method|constructor|property|field|variable|constant|type|type_parameter|export|heading|key)~[0-9a-f]{64}$')
    ELSE t."name"
  END,
  "signature_hash" = CASE
    WHEN t."id" LIKE t."file_path" || '#%'
      AND length(t."id") - length(replace(t."id", '#', '')) = 1
      AND substring(split_part(t."id", '#', 2) FROM '~(module|namespace|class|interface|trait|enum|function|method|constructor|property|field|variable|constant|type|type_parameter|export|heading|key)~[0-9a-f]{64}$') = t."kind"
      AND split_part(substring(split_part(t."id", '#', 2) FROM '^(.*)~(?:module|namespace|class|interface|trait|enum|function|method|constructor|property|field|variable|constant|type|type_parameter|export|heading|key)~[0-9a-f]{64}$'), '.', -1) = t."name"
    THEN substring(split_part(t."id", '#', 2) FROM '~([0-9a-f]{64})$')
    ELSE NULL
  END,
  "legacy_fqn" = t."file_path" || '#' || t."name"
FROM "workspaces" w WHERE w."project_id" = t."project_id";
UPDATE "symbol_references" t SET
  "generation_id" = w."active_graph_generation_id",
  "source_span" = CASE
    WHEN jsonb_typeof(t."meta"->'sourceSpan') = 'object'
      AND jsonb_typeof(t."meta"->'sourceSpan'->'startByte') = 'number'
      AND jsonb_typeof(t."meta"->'sourceSpan'->'endByte') = 'number'
      AND jsonb_typeof(t."meta"->'sourceSpan'->'start') = 'object'
      AND jsonb_typeof(t."meta"->'sourceSpan'->'end') = 'object'
      AND jsonb_typeof(t."meta"->'sourceSpan'->'start'->'row') = 'number'
      AND jsonb_typeof(t."meta"->'sourceSpan'->'start'->'column') = 'number'
      AND jsonb_typeof(t."meta"->'sourceSpan'->'end'->'row') = 'number'
      AND jsonb_typeof(t."meta"->'sourceSpan'->'end'->'column') = 'number'
      AND (t."meta"->'sourceSpan'->>'startByte')::numeric = trunc((t."meta"->'sourceSpan'->>'startByte')::numeric)
      AND (t."meta"->'sourceSpan'->>'endByte')::numeric = trunc((t."meta"->'sourceSpan'->>'endByte')::numeric)
      AND (t."meta"->'sourceSpan'->'start'->>'row')::numeric = trunc((t."meta"->'sourceSpan'->'start'->>'row')::numeric)
      AND (t."meta"->'sourceSpan'->'start'->>'column')::numeric = trunc((t."meta"->'sourceSpan'->'start'->>'column')::numeric)
      AND (t."meta"->'sourceSpan'->'end'->>'row')::numeric = trunc((t."meta"->'sourceSpan'->'end'->>'row')::numeric)
      AND (t."meta"->'sourceSpan'->'end'->>'column')::numeric = trunc((t."meta"->'sourceSpan'->'end'->>'column')::numeric)
      AND (t."meta"->'sourceSpan'->>'startByte')::numeric BETWEEN 0 AND 9007199254740991
      AND (t."meta"->'sourceSpan'->>'endByte')::numeric BETWEEN (t."meta"->'sourceSpan'->>'startByte')::numeric AND 9007199254740991
      AND (t."meta"->'sourceSpan'->'start'->>'row')::numeric BETWEEN 0 AND 9007199254740991
      AND (t."meta"->'sourceSpan'->'start'->>'column')::numeric BETWEEN 0 AND 9007199254740991
      AND (t."meta"->'sourceSpan'->'end'->>'row')::numeric BETWEEN 0 AND 9007199254740991
      AND (t."meta"->'sourceSpan'->'end'->>'column')::numeric BETWEEN 0 AND 9007199254740991
    THEN t."meta"->'sourceSpan'
    ELSE NULL
  END
FROM "workspaces" w WHERE w."project_id" = t."project_id";
UPDATE "symbol_imports" t SET "generation_id" = w."active_graph_generation_id" FROM "workspaces" w WHERE w."project_id" = t."project_id";
UPDATE "symbol_centrality" t SET "generation_id" = w."active_graph_generation_id" FROM "workspaces" w WHERE w."project_id" = t."project_id";

DO $$
DECLARE pre "_graph_generation_pre_counts"%ROWTYPE;
BEGIN
  SELECT * INTO pre FROM "_graph_generation_pre_counts";
  IF (SELECT count(*) FROM "workspaces") <> pre.workspaces OR
     (SELECT count(*) FROM "symbol_files") <> pre.files OR
     (SELECT count(*) FROM "symbol_definitions") <> pre.definitions OR
     (SELECT count(*) FROM "symbol_references") <> pre.references OR
     (SELECT count(*) FROM "symbol_imports") <> pre.imports OR
     (SELECT count(*) FROM "symbol_centrality") <> pre.centrality THEN
    RAISE EXCEPTION 'graph_generation_backfill_row_count_changed';
  END IF;
  IF (SELECT count(*) FROM "graph_generations" WHERE "status" = 'active') <> pre.workspaces OR
     EXISTS (SELECT 1 FROM "workspaces" w LEFT JOIN "graph_generations" g ON g."id" = w."active_graph_generation_id" AND g."project_id" = w."project_id" WHERE g."id" IS NULL) THEN
    RAISE EXCEPTION 'graph_generation_backfill_cardinality';
  END IF;
  IF EXISTS (SELECT 1 FROM "symbol_files" WHERE "generation_id" IS NULL) OR
     EXISTS (SELECT 1 FROM "symbol_definitions" WHERE "generation_id" IS NULL OR "qualified_name" IS NULL OR "legacy_fqn" IS NULL) OR
     EXISTS (SELECT 1 FROM "symbol_references" WHERE "generation_id" IS NULL) OR
     EXISTS (SELECT 1 FROM "symbol_imports" WHERE "generation_id" IS NULL) OR
     EXISTS (SELECT 1 FROM "symbol_centrality" WHERE "generation_id" IS NULL) THEN
    RAISE EXCEPTION 'graph_generation_backfill_null';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT "project_id", "generation_id" FROM "symbol_files" UNION ALL
      SELECT "project_id", "generation_id" FROM "symbol_definitions" UNION ALL
      SELECT "project_id", "generation_id" FROM "symbol_references" UNION ALL
      SELECT "project_id", "generation_id" FROM "symbol_imports" UNION ALL
      SELECT "project_id", "generation_id" FROM "symbol_centrality"
    ) x LEFT JOIN "graph_generations" g ON g."project_id" = x."project_id" AND g."id" = x."generation_id"
    WHERE g."id" IS NULL
  ) THEN RAISE EXCEPTION 'graph_generation_backfill_orphan'; END IF;
  IF EXISTS (
    SELECT 1 FROM "workspaces" w JOIN "graph_generations" g ON g."id" = w."active_graph_generation_id"
    WHERE g."files_count" <> w."active_files_count" OR g."definitions_count" <> w."active_definitions_count" OR
      g."references_count" <> w."active_references_count" OR g."imports_count" <> w."active_imports_count" OR
      g."centrality_count" <> w."active_centrality_count"
  ) THEN RAISE EXCEPTION 'graph_generation_backfill_count_mismatch'; END IF;
END $$;

ALTER TABLE "symbol_files" ALTER COLUMN "generation_id" SET NOT NULL;
ALTER TABLE "symbol_definitions" ALTER COLUMN "generation_id" SET NOT NULL, ALTER COLUMN "qualified_name" SET NOT NULL, ALTER COLUMN "legacy_fqn" SET NOT NULL;
ALTER TABLE "symbol_references" ALTER COLUMN "generation_id" SET NOT NULL;
ALTER TABLE "symbol_imports" ALTER COLUMN "generation_id" SET NOT NULL;
ALTER TABLE "symbol_centrality" ALTER COLUMN "generation_id" SET NOT NULL;

ALTER TABLE "symbol_files" DROP CONSTRAINT "symbol_files_pkey", ADD CONSTRAINT "symbol_files_pkey" PRIMARY KEY ("project_id", "generation_id", "relative_path");
ALTER TABLE "symbol_definitions" DROP CONSTRAINT "symbol_definitions_pkey", ADD CONSTRAINT "symbol_definitions_pkey" PRIMARY KEY ("project_id", "generation_id", "id");
ALTER TABLE "symbol_centrality" DROP CONSTRAINT "symbol_centrality_pkey", ADD CONSTRAINT "symbol_centrality_pkey" PRIMARY KEY ("project_id", "generation_id", "file_path");

ALTER TABLE "graph_generations" ADD CONSTRAINT "graph_generations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "workspaces"("project_id") ON DELETE CASCADE;
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_active_graph_generation_fkey"
  FOREIGN KEY ("project_id", "active_graph_generation_id") REFERENCES "graph_generations"("project_id", "id")
  ON DELETE SET NULL ("active_graph_generation_id");
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_pending_graph_generation_fkey"
  FOREIGN KEY ("project_id", "pending_graph_generation_id") REFERENCES "graph_generations"("project_id", "id")
  ON DELETE SET NULL ("pending_graph_generation_id");
ALTER TABLE "symbol_files" ADD CONSTRAINT "symbol_files_generation_fkey" FOREIGN KEY ("project_id", "generation_id") REFERENCES "graph_generations"("project_id", "id") ON DELETE CASCADE;
ALTER TABLE "symbol_definitions" ADD CONSTRAINT "symbol_definitions_generation_fkey" FOREIGN KEY ("project_id", "generation_id") REFERENCES "graph_generations"("project_id", "id") ON DELETE CASCADE;
ALTER TABLE "symbol_references" ADD CONSTRAINT "symbol_references_generation_fkey" FOREIGN KEY ("project_id", "generation_id") REFERENCES "graph_generations"("project_id", "id") ON DELETE CASCADE;
ALTER TABLE "symbol_imports" ADD CONSTRAINT "symbol_imports_generation_fkey" FOREIGN KEY ("project_id", "generation_id") REFERENCES "graph_generations"("project_id", "id") ON DELETE CASCADE;
ALTER TABLE "symbol_centrality" ADD CONSTRAINT "symbol_centrality_generation_fkey" FOREIGN KEY ("project_id", "generation_id") REFERENCES "graph_generations"("project_id", "id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "graph_generations_one_active_per_project" ON "graph_generations"("project_id") WHERE "status" = 'active';
CREATE UNIQUE INDEX "graph_generations_one_pending_per_project" ON "graph_generations"("project_id") WHERE "status" = 'pending';
DROP INDEX IF EXISTS "symbol_files_project_id_idx";
DROP INDEX IF EXISTS "symbol_definitions_project_id_idx";
DROP INDEX IF EXISTS "symbol_definitions_project_id_file_path_idx";
DROP INDEX IF EXISTS "symbol_definitions_project_id_name_idx";
DROP INDEX IF EXISTS "symbol_references_project_id_idx";
DROP INDEX IF EXISTS "symbol_references_project_id_target_fqn_idx";
DROP INDEX IF EXISTS "symbol_references_project_id_from_file_idx";
DROP INDEX IF EXISTS "symbol_references_project_id_ref_kind_idx";
DROP INDEX IF EXISTS "symbol_imports_project_id_from_file_idx";
DROP INDEX IF EXISTS "symbol_imports_project_id_to_file_idx";

CREATE INDEX "graph_generations_project_id_status_idx" ON "graph_generations"("project_id", "status");
CREATE INDEX "graph_generations_project_id_fingerprint_idx" ON "graph_generations"("project_id", "fingerprint");
CREATE INDEX "graph_generations_lease_expires_at_idx" ON "graph_generations"("lease_expires_at");
CREATE INDEX "workspaces_active_graph_generation_id_idx" ON "workspaces"("active_graph_generation_id");
CREATE INDEX "workspaces_pending_graph_generation_id_idx" ON "workspaces"("pending_graph_generation_id");
CREATE INDEX "workspaces_graph_lease_expires_at_idx" ON "workspaces"("graph_lease_expires_at");
CREATE INDEX "symbol_files_project_id_generation_id_idx" ON "symbol_files"("project_id", "generation_id");
CREATE INDEX "symbol_definitions_project_id_generation_id_idx" ON "symbol_definitions"("project_id", "generation_id");
CREATE INDEX "symbol_definitions_project_id_generation_id_file_path_idx" ON "symbol_definitions"("project_id", "generation_id", "file_path");
CREATE INDEX "symbol_definitions_project_id_generation_id_name_idx" ON "symbol_definitions"("project_id", "generation_id", "name");
CREATE INDEX "symbol_definitions_project_id_generation_id_legacy_fqn_idx" ON "symbol_definitions"("project_id", "generation_id", "legacy_fqn");
CREATE INDEX "symbol_references_project_id_generation_id_idx" ON "symbol_references"("project_id", "generation_id");
CREATE INDEX "symbol_references_project_id_generation_id_target_fqn_idx" ON "symbol_references"("project_id", "generation_id", "target_fqn");
CREATE INDEX "symbol_references_project_id_generation_id_from_file_idx" ON "symbol_references"("project_id", "generation_id", "from_file");
CREATE INDEX "symbol_references_project_id_generation_id_ref_kind_idx" ON "symbol_references"("project_id", "generation_id", "ref_kind");
CREATE INDEX "symbol_imports_project_id_generation_id_from_file_idx" ON "symbol_imports"("project_id", "generation_id", "from_file");
CREATE INDEX "symbol_imports_project_id_generation_id_to_file_idx" ON "symbol_imports"("project_id", "generation_id", "to_file");

COMMIT;
