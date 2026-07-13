-- PostgreSQL parity for the existing handoff/proposal runtime stores.
-- Additive only: SQLite tables and runtime fallback remain unchanged.

CREATE TABLE "handoffs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_session_id" TEXT,
    "target_agent" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "open_questions_json" TEXT NOT NULL DEFAULT '[]',
    "next_steps_json" TEXT NOT NULL DEFAULT '[]',
    "files_json" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "handoffs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "handoffs_status_check" CHECK ("status" IN ('open', 'accepted', 'expired'))
);

CREATE INDEX "handoffs_project_id_status_idx" ON "handoffs"("project_id", "status");
CREATE INDEX "handoffs_target_agent_status_idx" ON "handoffs"("target_agent", "status");
CREATE INDEX "handoffs_created_at_idx" ON "handoffs"("created_at" DESC);

CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target_memory_id" TEXT,
    "payload_json" TEXT NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "proposals_kind_check" CHECK ("kind" IN ('memory.create', 'memory.update', 'memory.tag')),
    CONSTRAINT "proposals_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX "proposals_project_id_status_idx" ON "proposals"("project_id", "status");
CREATE INDEX "proposals_created_at_idx" ON "proposals"("created_at" DESC);
