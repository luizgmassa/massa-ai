/**
 * Coverage tests for MemoryRepositoryPg — PostgreSQL CRUD operations.
 *
 * Uses the dedicated maintenance DB (127.0.0.1:5433/massa_ai_test).
 * Every fixture is scoped by a unique project id and removed after the test.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { MemoryLevel, MemoryType } from "@massa-ai/shared";
import { MemoryRepositoryPg } from "../data/memory/memory-repository-pg.js";
import type { InsertMemoryInput } from "../data/memory/memory-repository.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const DEDICATED_DB =
  process.env.MASSA_AI_DEDICATED === "1" &&
  /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(databaseUrl);
const TEST_PREFIX = "cov-mem-";

let prisma: any;
let repo: MemoryRepositoryPg;
let projectId = "";

function memoryId(label: string): string {
  return `${TEST_PREFIX}${label}-${randomUUID()}`;
}

async function insert(
  label: string,
  content: string,
  tags: string[] = [],
  overrides: Partial<InsertMemoryInput> = {},
): Promise<string> {
  const id = memoryId(label);
  await repo.insert({
    id,
    content,
    type: MemoryType.DECISION,
    level: MemoryLevel.PERSISTENT,
    projectId,
    importance: 0.5,
    tags,
    embedding: [0.01, 0.02, 0.03, 0.04],
    ...overrides,
  });
  return id;
}

async function cleanup(): Promise<void> {
  if (!prisma) return;
  await prisma.$executeRaw`DELETE FROM memories WHERE project_id LIKE ${TEST_PREFIX + "%"}`;
  await prisma.$executeRaw`DELETE FROM memory_edges WHERE from_id LIKE ${TEST_PREFIX + "%"} OR to_id LIKE ${TEST_PREFIX + "%"}`;
}

describe.skipIf(!DEDICATED_DB)("MemoryRepositoryPg — coverage", () => {
  beforeAll(async () => {
    const { getPrismaClient } = await import("../services/query/prisma-client.js");
    prisma = getPrismaClient();
    (MemoryRepositoryPg as any).instance = null;
    repo = MemoryRepositoryPg.getInstance();
    await cleanup();
  });

  beforeEach(async () => {
    projectId = `${TEST_PREFIX}${randomUUID()}`;
    await cleanup();
  });

  afterEach(cleanup);
  afterAll(cleanup);

  // ── insert + getById ──────────────────────────────────────────────────────

  test("insert with embedding and getById round-trips", async () => {
    const id = await insert("roundtrip", "test content", ["tag1", "tag2"], {
      userId: "user1",
      sessionId: "sess1",
      agentId: "architect",
      importance: 0.8,
      pinned: true,
    });
    const row = await repo.getById(id);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(id);
    expect(row!.content).toBe("test content");
    expect(row!.type).toBe("decision");
    expect(row!.level).toBe(MemoryLevel.PERSISTENT);
    expect(row!.user_id).toBe("user1");
    expect(row!.session_id).toBe("sess1");
    expect(row!.project_id).toBe(projectId);
    expect(row!.agent_id).toBe("architect");
    expect(row!.importance).toBe(0.8);
    expect(JSON.parse(row!.tags ?? "[]")).toEqual(["tag1", "tag2"]);
    expect(row!.pinned).toBe(1);
    expect(row!.deleted_at).toBeNull();
    expect(row!.embedding).not.toBeNull();
  });

  test("insert without embedding (null)", async () => {
    const id = await insert("no-emb", "no embedding content", [], {
      embedding: [],
    });
    const row = await repo.getById(id);
    expect(row).not.toBeNull();
    expect(row!.embedding).toBeNull();
  });

  test("insert with metadata", async () => {
    const id = await insert("metadata", "content with metadata", [], {
      metadata: { custom: "value", count: 42 },
    });
    const row = await repo.getById(id);
    expect(row).not.toBeNull();
    expect(row!.metadata).not.toBeNull();
    expect(JSON.parse(row!.metadata!)).toMatchObject({ custom: "value", count: 42 });
  });

  test("getById returns null for missing id", async () => {
    const row = await repo.getById(memoryId("missing"));
    expect(row).toBeNull();
  });

  // ── search ────────────────────────────────────────────────────────────────

  test("search filters by minImportance and projectId", async () => {
    const high = await insert("high", "high importance", [], { importance: 0.9 });
    const low = await insert("low", "low importance", [], { importance: 0.3 });
    const results = await repo.search({
      minImportance: 0.5,
      projectId,
      limit: 10,
      includePersistent: true,
    });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(high);
    expect(ids).not.toContain(low);
  });

  test("search filters by userId, sessionId, agentId", async () => {
    const id = await insert("filtered", "filtered content", [], {
      userId: "u1",
      sessionId: "s1",
      agentId: "a1",
    });
    const byUser = await repo.search({
      minImportance: 0,
      userId: "u1",
      limit: 10,
      includePersistent: true,
    });
    expect(byUser.map((r) => r.id)).toContain(id);

    const bySession = await repo.search({
      minImportance: 0,
      sessionId: "s1",
      limit: 10,
      includePersistent: true,
    });
    expect(bySession.map((r) => r.id)).toContain(id);

    const byAgent = await repo.search({
      minImportance: 0,
      agentId: "a1",
      limit: 10,
      includePersistent: true,
    });
    expect(byAgent.map((r) => r.id)).toContain(id);
  });

  test("search filters by types", async () => {
    const decision = await insert("dec", "decision content", [], {
      type: MemoryType.DECISION,
    });
    const pattern = await insert("pat", "pattern content", [], {
      type: MemoryType.PATTERN,
    });
    const results = await repo.search({
      minImportance: 0,
      projectId,
      types: [MemoryType.DECISION],
      limit: 10,
      includePersistent: true,
    });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(decision);
    expect(ids).not.toContain(pattern);
  });

  test("search respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await insert(`limit-${i}`, `content ${i}`, [], { importance: 0.5 });
    }
    const results = await repo.search({
      minImportance: 0,
      projectId,
      limit: 2,
      includePersistent: true,
    });
    expect(results.length).toBe(2);
  });

  // ── fullTextSearch ────────────────────────────────────────────────────────

  test("fullTextSearch finds by content token", async () => {
    const id = await insert("fts", "unique searchable phrase", []);
    const results = await repo.fullTextSearch("unique", 10, {
      projectId,
      minImportance: 0,
    });
    expect(results.map((r) => r.id)).toContain(id);
  });

  test("fullTextSearch with multiple tokens (OR)", async () => {
    const a = await insert("fts-a", "alpha content", []);
    const b = await insert("fts-b", "beta content", []);
    const results = await repo.fullTextSearch("alpha beta", 10, {
      projectId,
      minImportance: 0,
    });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
  });

  test("fullTextSearch filters by userId, sessionId, agentId, minImportance, types", async () => {
    const id = await insert("fts-filtered", "filtered searchable", [], {
      userId: "u1",
      sessionId: "s1",
      agentId: "a1",
      importance: 0.8,
      type: MemoryType.DECISION,
    });
    const results = await repo.fullTextSearch("filtered", 10, {
      userId: "u1",
      sessionId: "s1",
      agentId: "a1",
      minImportance: 0.5,
      types: [MemoryType.DECISION],
      projectId,
    });
    expect(results.map((r) => r.id)).toContain(id);
  });

  // BEH-01. "Persistent" is L0 — `MemoryLevel.PERSISTENT` — which is the only
  // concrete meaning the codebase gives the word; there is no `persistent`
  // column. Both rows are inserted with the same content token so the filter,
  // not the query, is what separates them.
  test("fullTextSearch excludes L0 memories when includePersistent is false", async () => {
    const persistentId = await insert("lvl-persistent", "tiered recall", [], {
      level: MemoryLevel.PERSISTENT,
    });
    const userId = await insert("lvl-user", "tiered recall", [], {
      level: MemoryLevel.USER,
    });

    const withPersistent = await repo.fullTextSearch("tiered", 10, {
      projectId,
      minImportance: 0,
      includePersistent: true,
    });
    expect(withPersistent.map((r) => r.id)).toContain(persistentId);
    expect(withPersistent.map((r) => r.id)).toContain(userId);

    const withoutPersistent = await repo.fullTextSearch("tiered", 10, {
      projectId,
      minImportance: 0,
      includePersistent: false,
    });
    // The discriminating pair: the L0 row disappears, the non-L0 row survives.
    // An assertion on the L0 row alone could also pass by returning nothing.
    expect(withoutPersistent.map((r) => r.id)).not.toContain(persistentId);
    expect(withoutPersistent.map((r) => r.id)).toContain(userId);

    // Omitting the filter must behave as `true`, not as `false` — the schema
    // documents `default: true` and callers rely on it.
    const omitted = await repo.fullTextSearch("tiered", 10, {
      projectId,
      minImportance: 0,
    });
    expect(omitted.map((r) => r.id)).toContain(persistentId);
  });

  test("fullTextSearch escapes ILIKE special chars", async () => {
    const id = await insert("escape", "100% reliable", []);
    const results = await repo.fullTextSearch("100%", 10, {
      projectId,
      minImportance: 0,
    });
    expect(results.map((r) => r.id)).toContain(id);
  });

  // ── updateImportance ──────────────────────────────────────────────────────

  test("updateImportance changes the importance", async () => {
    const id = await insert("imp", "content", [], { importance: 0.5 });
    await repo.updateImportance(id, 0.9);
    const row = await repo.getById(id);
    expect(row!.importance).toBe(0.9);
  });

  // ── incrementAccessCount ───────────────────────────────────────────────────

  test("incrementAccessCount increments and sets last_accessed", async () => {
    const id = await insert("access", "content", []);
    await repo.incrementAccessCount(id);
    await repo.incrementAccessCount(id);
    const row = await repo.getById(id);
    expect(row!.access_count).toBe(2);
    expect(row!.last_accessed).not.toBeNull();
  });

  // ── delete (hard) ──────────────────────────────────────────────────────────

  test("delete removes the row", async () => {
    const id = await insert("del", "content", []);
    await repo.delete(id);
    expect(await repo.getById(id)).toBeNull();
  });

  // ── deleteById ─────────────────────────────────────────────────────────────

  test("deleteById returns true when row exists", async () => {
    const id = await insert("del-id", "content", []);
    expect(await repo.deleteById(id)).toBe(true);
    expect(await repo.getById(id)).toBeNull();
  });

  test("deleteById returns false when row missing", async () => {
    expect(await repo.deleteById(memoryId("missing"))).toBe(false);
  });

  // ── update ─────────────────────────────────────────────────────────────────

  test("update content, importance, tags, embedding, pinned", async () => {
    const id = await insert("upd", "original content", ["old"], { importance: 0.5 });
    const updated = await repo.update(id, {
      content: "new content",
      importance: 0.9,
      tags: ["new", "shiny"],
      embedding: [0.04, 0.03, 0.02, 0.01],
      pinned: true,
    });
    expect(updated).toBe(true);
    const row = await repo.getById(id);
    expect(row!.content).toBe("new content");
    expect(row!.importance).toBe(0.9);
    expect(JSON.parse(row!.tags ?? "[]")).toEqual(["new", "shiny"]);
    expect(row!.pinned).toBe(1);
  });

  test("update with empty patch returns true if row exists", async () => {
    const id = await insert("empty-patch", "content", []);
    expect(await repo.update(id, {})).toBe(true);
  });

  test("update with empty patch returns false if row missing", async () => {
    expect(await repo.update(memoryId("missing"), {})).toBe(false);
  });

  test("update only content", async () => {
    const id = await insert("upd-content", "original", []);
    await repo.update(id, { content: "changed" });
    const row = await repo.getById(id);
    expect(row!.content).toBe("changed");
  });

  test("update only importance", async () => {
    const id = await insert("upd-imp", "content", [], { importance: 0.5 });
    await repo.update(id, { importance: 0.8 });
    const row = await repo.getById(id);
    expect(row!.importance).toBe(0.8);
  });

  test("update only tags", async () => {
    const id = await insert("upd-tags", "content", ["old"]);
    await repo.update(id, { tags: ["new"] });
    const row = await repo.getById(id);
    expect(JSON.parse(row!.tags ?? "[]")).toEqual(["new"]);
  });

  test("update only embedding", async () => {
    const id = await insert("upd-emb", "content", []);
    await repo.update(id, { embedding: [0.1, 0.2, 0.3, 0.4] });
    const row = await repo.getById(id);
    expect(row!.embedding).not.toBeNull();
  });

  test("update only pinned", async () => {
    const id = await insert("upd-pin", "content", [], { pinned: false });
    await repo.update(id, { pinned: true });
    const row = await repo.getById(id);
    expect(row!.pinned).toBe(1);
  });

  // ── softDeleteById ─────────────────────────────────────────────────────────

  test("softDeleteById tombstones a live row", async () => {
    const id = await insert("soft", "content", []);
    expect(await repo.softDeleteById(id)).toBe(true);
    const row = await repo.getById(id);
    expect(row!.deleted_at).not.toBeNull();
  });

  test("softDeleteById returns false for missing row", async () => {
    expect(await repo.softDeleteById(memoryId("missing"))).toBe(false);
  });

  test("softDeleteById returns false for already-deleted row", async () => {
    const id = await insert("soft2", "content", []);
    await repo.softDeleteById(id);
    expect(await repo.softDeleteById(id)).toBe(false);
  });

  // ── deleteByProject ────────────────────────────────────────────────────────

  test("deleteByProject removes all rows for a project", async () => {
    const id1 = await insert("del-proj-1", "content 1", []);
    const id2 = await insert("del-proj-2", "content 2", []);
    const count = await repo.deleteByProject(projectId);
    expect(count).toBeGreaterThanOrEqual(2);
    expect(await repo.getById(id1)).toBeNull();
    expect(await repo.getById(id2)).toBeNull();
  });

  // ── list ───────────────────────────────────────────────────────────────────

  test("list returns paginated non-deleted rows", async () => {
    for (let i = 0; i < 5; i++) {
      await insert(`list-${i}`, `content ${i}`, []);
    }
    const page1 = await repo.list(2, 0);
    expect(page1.length).toBe(2);
    const page2 = await repo.list(2, 2);
    expect(page2.length).toBeLessThanOrEqual(2);
    // No overlap
    const ids1 = page1.map((r) => r.id);
    const ids2 = page2.map((r) => r.id);
    for (const id of ids1) expect(ids2).not.toContain(id);
  });

  test("list excludes soft-deleted rows", async () => {
    const id = await insert("list-del", "content", []);
    await repo.softDeleteById(id);
    const results = await repo.list(100, 0);
    expect(results.map((r) => r.id)).not.toContain(id);
  });

  // ── findRecentByTag ─────────────────────────────────────────────────────────

  test("findRecentByTag finds memories with a tag", async () => {
    const id = await insert("tag", "tagged content", ["special-tag"]);
    const results = await repo.findRecentByTag("special-tag", {
      projectId,
      sinceMs: 0,
      limit: 10,
    });
    expect(results.map((r) => r.id)).toContain(id);
  });

  test("findRecentByTag excludes by excludeId", async () => {
    const id = await insert("tag-excl", "tagged content", ["exclude-tag"]);
    const results = await repo.findRecentByTag("exclude-tag", {
      projectId,
      excludeId: id,
      sinceMs: 0,
      limit: 10,
    });
    expect(results.map((r) => r.id)).not.toContain(id);
  });

  test("findRecentByTag filters by sessionId", async () => {
    const id = await insert("tag-sess", "tagged content", ["sess-tag"], {
      sessionId: "s1",
    });
    const results = await repo.findRecentByTag("sess-tag", {
      sessionId: "s1",
      sinceMs: 0,
      limit: 10,
    });
    expect(results.map((r) => r.id)).toContain(id);
  });

  test("findRecentByTag respects sinceMs", async () => {
    const id = await insert("tag-since", "tagged content", ["since-tag"]);
    // Query with a future sinceMs → should not find it
    const results = await repo.findRecentByTag("since-tag", {
      projectId,
      sinceMs: Date.now() + 10000,
      limit: 10,
    });
    expect(results.map((r) => r.id)).not.toContain(id);
  });

  test("findRecentByTag respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await insert(`tag-limit-${i}`, `content ${i}`, ["limit-tag"]);
    }
    const results = await repo.findRecentByTag("limit-tag", {
      projectId,
      sinceMs: 0,
      limit: 2,
    });
    expect(results.length).toBe(2);
  });

  // ── findRecentWithEmbeddings ────────────────────────────────────────────────

  test("findRecentWithEmbeddings returns rows with embeddings", async () => {
    const id = await insert("emb", "content with embedding", [], {
      embedding: [0.1, 0.2, 0.3, 0.4],
    });
    const results = await repo.findRecentWithEmbeddings("excluded-id", projectId, 10);
    expect(results.map((r) => r.id)).toContain(id);
  });

  test("findRecentWithEmbeddings excludes the given id", async () => {
    const id = await insert("emb-excl", "content", [], {
      embedding: [0.1, 0.2, 0.3, 0.4],
    });
    const results = await repo.findRecentWithEmbeddings(id, projectId, 10);
    expect(results.map((r) => r.id)).not.toContain(id);
  });

  test("findRecentWithEmbeddings with null projectId includes all", async () => {
    const id = await insert("emb-null", "content", [], {
      embedding: [0.1, 0.2, 0.3, 0.4],
    });
    const results = await repo.findRecentWithEmbeddings("excluded", null, 100);
    expect(results.map((r) => r.id)).toContain(id);
  });

  test("findRecentWithEmbeddings excludes soft-deleted", async () => {
    const id = await insert("emb-del", "content", [], {
      embedding: [0.1, 0.2, 0.3, 0.4],
    });
    await repo.softDeleteById(id);
    const results = await repo.findRecentWithEmbeddings("excluded", projectId, 100);
    expect(results.map((r) => r.id)).not.toContain(id);
  });

  // ── listConsolidationCandidates ─────────────────────────────────────────────

  test("listConsolidationCandidates returns stale, non-pinned, non-deleted rows with embeddings", async () => {
    const oldId = await insert("stale", "old content", [], {
      embedding: [0.1, 0.2, 0.3, 0.4],
    });
    // Make it old by updating created_at directly
    await prisma.$executeRaw`UPDATE memories SET created_at = ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)} WHERE id = ${oldId}`;
    const results = await repo.listConsolidationCandidates(Date.now() - 7 * 24 * 60 * 60 * 1000, 100);
    expect(results.map((r) => r.id)).toContain(oldId);
  });

  test("listConsolidationCandidates excludes pinned rows", async () => {
    const id = await insert("pinned", "pinned content", [], {
      embedding: [0.1, 0.2, 0.3, 0.4],
      pinned: true,
    });
    await prisma.$executeRaw`UPDATE memories SET created_at = ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)} WHERE id = ${id}`;
    const results = await repo.listConsolidationCandidates(Date.now() - 7 * 24 * 60 * 60 * 1000, 100);
    expect(results.map((r) => r.id)).not.toContain(id);
  });

  test("listConsolidationCandidates excludes soft-deleted rows", async () => {
    const id = await insert("deleted", "deleted content", [], {
      embedding: [0.1, 0.2, 0.3, 0.4],
    });
    await prisma.$executeRaw`UPDATE memories SET created_at = ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)} WHERE id = ${id}`;
    await repo.softDeleteById(id);
    const results = await repo.listConsolidationCandidates(Date.now() - 7 * 24 * 60 * 60 * 1000, 100);
    expect(results.map((r) => r.id)).not.toContain(id);
  });

  test("listConsolidationCandidates excludes rows without embedding", async () => {
    const id = await insert("no-emb", "no embedding content", [], {
      embedding: [],
    });
    await prisma.$executeRaw`UPDATE memories SET created_at = ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)} WHERE id = ${id}`;
    const results = await repo.listConsolidationCandidates(Date.now() - 7 * 24 * 60 * 60 * 1000, 100);
    expect(results.map((r) => r.id)).not.toContain(id);
  });

  test("listConsolidationCandidates respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      const id = await insert(`limit-${i}`, `content ${i}`, [], {
        embedding: [0.1, 0.2, 0.3, 0.4],
      });
      await prisma.$executeRaw`UPDATE memories SET created_at = ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)} WHERE id = ${id}`;
    }
    const results = await repo.listConsolidationCandidates(Date.now() - 7 * 24 * 60 * 60 * 1000, 2);
    expect(results.length).toBe(2);
  });

  // ── close ─────────────────────────────────────────────────────────────────

  test("close is a no-op", async () => {
    await repo.close();
    // repo should still work after close
    const id = await insert("after-close", "content", []);
    expect(await repo.getById(id)).not.toBeNull();
  });

  // ── toMemoryRow edge cases ──────────────────────────────────────────────────

  test("toMemoryRow handles null tags", async () => {
    const id = await insert("null-tags", "content", []);
    // Manually set tags to null
    await prisma.$executeRaw`UPDATE memories SET tags = NULL WHERE id = ${id}`;
    const row = await repo.getById(id);
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.tags ?? "[]")).toEqual([]);
  });

  test("toMemoryRow handles numeric timestamps (non-Date)", async () => {
    const id = await insert("num-ts", "content", []);
    // The DB returns Date objects; toMemoryRow handles both Date and number
    const row = await repo.getById(id);
    expect(row).not.toBeNull();
    expect(typeof row!.created_at).toBe("number");
    expect(typeof row!.updated_at).toBe("number");
  });

  test("toMemoryRow handles null last_accessed", async () => {
    const id = await insert("null-la", "content", []);
    const row = await repo.getById(id);
    expect(row).not.toBeNull();
    expect(row!.last_accessed).toBeNull();
  });

  test("toMemoryRow handles pinned as boolean false", async () => {
    const id = await insert("pin-false", "content", [], { pinned: false });
    const row = await repo.getById(id);
    expect(row).not.toBeNull();
    expect(row!.pinned).toBe(0);
  });

  test("toMemoryRow handles null metadata", async () => {
    const id = await insert("null-meta", "content", []);
    const row = await repo.getById(id);
    expect(row).not.toBeNull();
    expect(row!.metadata).not.toBeNull(); // insert writes default metadata
  });

  // ── parsePgTextArray edge cases ─────────────────────────────────────────────

  test("handles PostgreSQL array literal tags", async () => {
    const id = await insert("pg-array", "content", ["alpha", "beta"]);
    // The DB stores tags as text[]; the driver may return it as a PG array literal
    const row = await repo.getById(id);
    expect(row).not.toBeNull();
    expect(JSON.parse(row!.tags ?? "[]")).toEqual(["alpha", "beta"]);
  });
});