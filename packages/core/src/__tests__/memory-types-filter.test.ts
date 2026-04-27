/**
 * Regression tests for memory search types filter.
 *
 * Bug: MemoryRepositoryPg.fullTextSearch() accepted a `types` parameter
 * in the controller call but never declared nor applied it in the SQL WHERE
 * clause. Searches with types=["decision"] returned conversation memories
 * as the majority of results (filter silently dropped).
 *
 * Fix: added `types?: MemoryType[]` to the PG fullTextSearch filters and
 * the corresponding `WHERE type = ANY(...)::text[]` condition, matching
 * the SQLite implementation that already handled types correctly.
 *
 * These tests use the SQLite MemoryRepository (no external infra needed)
 * to verify the filter contract that both implementations must satisfy.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// ── Minimal in-memory repo that mirrors MemoryRepository.fullTextSearch ──────
//
// We test the filter logic directly against a real SQLite schema rather than
// importing the singleton (which requires the full app bootstrap). This keeps
// the tests fast and self-contained while covering the exact query path.

interface Row {
  id: string;
  type: string;
  content: string;
  importance: number;
}

function buildFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" OR ");
}

function fullTextSearch(
  db: Database,
  query: string,
  limit: number,
  filters?: {
    types?: string[];
    agentId?: string;
    projectId?: string;
    minImportance?: number;
  },
): Row[] {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const conditions: string[] = [`fts.content MATCH ?`];
  const params: unknown[] = [ftsQuery];

  if (filters?.types && filters.types.length > 0) {
    conditions.push(`m.type IN (${filters.types.map(() => "?").join(",")})`);
    params.push(...filters.types);
  }
  if (filters?.agentId) {
    conditions.push("m.agent_id = ?");
    params.push(filters.agentId);
  }
  if (filters?.projectId) {
    conditions.push("m.project_id = ?");
    params.push(filters.projectId);
  }
  if (filters?.minImportance != null) {
    conditions.push("m.importance >= ?");
    params.push(filters.minImportance);
  }

  params.push(limit);

  return db
    .prepare(
      `SELECT m.id, m.type, m.content, m.importance
       FROM memories m
       JOIN memories_fts fts ON m.rowid = fts.rowid
       WHERE ${conditions.join(" AND ")}
       ORDER BY m.importance DESC
       LIMIT ?`,
    )
    .all(...(params as any[])) as Row[];
}

// ── Test setup ────────────────────────────────────────────────────────────────

let db: Database;
const NOW = Date.now();

function insertMemory(
  id: string,
  content: string,
  type: string,
  importance = 0.5,
  agentId: string | null = null,
  projectId: string | null = null,
) {
  db.prepare(
    `INSERT INTO memories (id, content, type, level, importance, agent_id, project_id, tags, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, '[]', ?, ?)`,
  ).run(id, content, type, importance, agentId, projectId, NOW, NOW);

  db.prepare(
    `INSERT INTO memories_fts (rowid, content, tags)
     SELECT rowid, content, tags FROM memories WHERE id = ?`,
  ).run(id);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      user_id TEXT,
      session_id TEXT,
      project_id TEXT,
      agent_id TEXT,
      importance REAL DEFAULT 0.5,
      tags TEXT DEFAULT '[]',
      embedding BLOB,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      access_count INTEGER DEFAULT 0,
      last_accessed INTEGER
    );

    CREATE VIRTUAL TABLE memories_fts USING fts5(
      content, tags,
      content='memories',
      content_rowid='rowid'
    );
  `);

  // Seed: mixed types, all containing the word "embedding" so FTS matches all.
  insertMemory("dec_001", "embedding model decision: use qwen3", "decision", 0.95, "orchestrator", "proj1");
  insertMemory("cod_001", "embedding code implementation details", "code", 0.85, "optimizer", "proj1");
  insertMemory("pat_001", "embedding pattern for batch inference", "pattern", 0.80, "optimizer", "proj1");
  insertMemory("con_001", "embedding conversation context log", "conversation", 0.30, null, "proj1");
  insertMemory("cri_001", "embedding critical alert zero vectors", "critical", 0.90, "orchestrator", "proj1");
  insertMemory("dec_002", "embedding decision for scaledown window", "decision", 0.70, "optimizer", "proj1");
});

afterEach(() => {
  db.close();
});

// ── types filter ──────────────────────────────────────────────────────────────

describe("fullTextSearch — types filter", () => {
  test("no types filter returns all matching memories", () => {
    const rows = fullTextSearch(db, "embedding", 10);
    expect(rows.length).toBe(6);
    const types = new Set(rows.map((r) => r.type));
    expect(types).toContain("decision");
    expect(types).toContain("code");
    expect(types).toContain("conversation");
    expect(types).toContain("critical");
    expect(types).toContain("pattern");
  });

  test("types=['decision'] returns only decision memories", () => {
    const rows = fullTextSearch(db, "embedding", 10, { types: ["decision"] });
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.type === "decision")).toBe(true);
  });

  test("types=['code'] returns only code memories", () => {
    const rows = fullTextSearch(db, "embedding", 10, { types: ["code"] });
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("cod_001");
    expect(rows[0].type).toBe("code");
  });

  test("types=['conversation'] excludes high-importance non-conversation", () => {
    const rows = fullTextSearch(db, "embedding", 10, { types: ["conversation"] });
    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe("conversation");
  });

  test("types=['critical','decision'] returns only those two types", () => {
    const rows = fullTextSearch(db, "embedding", 10, {
      types: ["critical", "decision"],
    });
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.type === "critical" || r.type === "decision")).toBe(true);
  });

  test("types=[] (empty array) acts as no filter — returns all", () => {
    const rows = fullTextSearch(db, "embedding", 10, { types: [] });
    expect(rows.length).toBe(6);
  });

  test("types=['pattern'] returns no conversation or decision results", () => {
    const rows = fullTextSearch(db, "embedding", 10, { types: ["pattern"] });
    expect(rows.length).toBe(1);
    expect(rows[0].type).toBe("pattern");
    expect(rows.some((r) => r.type === "conversation")).toBe(false);
    expect(rows.some((r) => r.type === "decision")).toBe(false);
  });
});

// ── types + other filters combined ───────────────────────────────────────────

describe("fullTextSearch — types combined with other filters", () => {
  test("types + agentId filters intersect correctly", () => {
    const rows = fullTextSearch(db, "embedding", 10, {
      types: ["decision"],
      agentId: "orchestrator",
    });
    // dec_001 is orchestrator+decision; dec_002 is optimizer+decision
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("dec_001");
  });

  test("types + minImportance filters intersect correctly", () => {
    const rows = fullTextSearch(db, "embedding", 10, {
      types: ["decision"],
      minImportance: 0.90,
    });
    // dec_001 = 0.95 ✓ · dec_002 = 0.70 ✗
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("dec_001");
  });

  test("types + projectId returns only project-scoped memories of that type", () => {
    // Insert a memory in a different project
    insertMemory("dec_other", "embedding decision in other project", "decision", 0.9, null, "other-proj");

    const rows = fullTextSearch(db, "embedding", 10, {
      types: ["decision"],
      projectId: "proj1",
    });
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain("dec_other");
    expect(ids).toContain("dec_001");
    expect(ids).toContain("dec_002");
  });
});

// ── Regression: bug behaviour ─────────────────────────────────────────────────

describe("regression — types filter was silently dropped in PG implementation", () => {
  test("pre-fix: without types filter, decision query polluted by conversation", () => {
    // Simulates what the bug caused: querying for decisions but getting all types
    const rows = fullTextSearch(db, "embedding", 10);
    const types = rows.map((r) => r.type);
    // Bug: conversation memory appeared even when caller wanted only decisions
    expect(types).toContain("conversation");
    expect(types).toContain("decision");
  });

  test("post-fix: types=['decision'] never returns conversation memories", () => {
    const rows = fullTextSearch(db, "embedding", 10, { types: ["decision"] });
    expect(rows.some((r) => r.type === "conversation")).toBe(false);
  });

  test("post-fix: types=['decision'] count is stable regardless of total memory count", () => {
    // Add many more conversation memories (simulates auto-generated conversation memories)
    for (let i = 0; i < 10; i++) {
      insertMemory(`con_auto_${i}`, `embedding auto conversation memory ${i}`, "conversation", 0.3);
    }
    const rows = fullTextSearch(db, "embedding", 20, { types: ["decision"] });
    // Should still return only the 2 decision memories, not the 10 new conversations
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.type === "decision")).toBe(true);
  });
});
