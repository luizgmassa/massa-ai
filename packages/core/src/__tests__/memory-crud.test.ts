/**
 * Unit tests for memory CRUD: MemoryRepository.update / deleteById
 * and MemoryController update (tag merge) + delete (graph edge severance).
 *
 * Uses a temp dataDir (mocked config) so the real SQLite singletons run
 * against throwaway databases. No Ollama: content updates are exercised at
 * the repository layer (embedding supplied), and controller.update is only
 * tested with tag changes (no embedding call).
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

// ── Mock config and logger ────────────────────────────────────
let tmpDir: string;

mock.module("@th0th-ai/shared", () => {
  const actual = require("@th0th-ai/shared");
  return {
    ...actual,
    config: {
      get: (key: string) => {
        if (key === "dataDir") return tmpDir;
        const defaults: Record<string, any> = {
          vectorStore: { type: "sqlite", dbPath: path.join(tmpDir, "vector.db"), collectionName: "test", embeddingModel: "default" },
          keywordSearch: { dbPath: path.join(tmpDir, "kw.db"), ftsVersion: "fts5" },
          security: { maxInputLength: 10000, sanitizeInputs: true, maxIndexSize: 1000, maxFileSize: 1048576, allowedExtensions: [".ts"], excludePatterns: [] },
        };
        return defaults[key];
      },
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      metric: () => {},
    },
  };
});

import { MemoryLevel, MemoryRelationType } from "@th0th-ai/shared";
import { MemoryRepository } from "../data/memory/memory-repository.js";
import type { InsertMemoryInput } from "../data/memory/memory-repository.js";
import { MemoryController } from "../controllers/memory-controller.js";
import { MemoryGraphService } from "../services/graph/memory-graph.service.js";
import { GraphStore } from "../services/graph/graph-store.js";
import { MemoryService } from "../services/memory/memory-service.js";

const synthEmbedding = () => [0.01, 0.02, 0.03, 0.04];

function insertMemory(repo: MemoryRepository, id: string, content: string, tags: string[] = []) {
  const input: InsertMemoryInput = {
    id,
    content,
    type: "decision",
    level: MemoryLevel.PERSISTENT,
    importance: 0.5,
    tags,
    embedding: synthEmbedding(),
  };
  repo.insert(input);
}

describe("MemoryRepository.update / deleteById", () => {
  let repo: MemoryRepository;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "th0th-crud-"));
    (MemoryRepository as any).instance = null;
    repo = MemoryRepository.getInstance();
  });

  afterEach(() => {
    try { (repo as any).db?.close?.(); } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("update content rewrites the row and rebuilds the FTS index", () => {
    insertMemory(repo, "m1", "alpha content here");
    const updated = repo.update("m1", { content: "beta gamma content", embedding: synthEmbedding() });

    expect(updated).toBe(true);
    expect(repo.getById("m1")?.content).toBe("beta gamma content");

    const before = repo.fullTextSearch("alpha", 10, { minImportance: 0, includePersistent: true, limit: 10 });
    const after = repo.fullTextSearch("gamma", 10, { minImportance: 0, includePersistent: true, limit: 10 });
    expect(before.map((r) => r.id)).not.toContain("m1");
    expect(after.map((r) => r.id)).toContain("m1");
  });

  test("update importance only leaves content intact (no FTS rebuild needed)", () => {
    insertMemory(repo, "m2", "unchanged content");
    const updated = repo.update("m2", { importance: 0.9 });

    expect(updated).toBe(true);
    const row = repo.getById("m2");
    expect(row?.importance).toBe(0.9);
    expect(row?.content).toBe("unchanged content");
  });

  test("update tags replaces the tag array", () => {
    insertMemory(repo, "m3", "some content", ["old"]);
    repo.update("m3", { tags: ["new", "shiny"] });

    const row = repo.getById("m3");
    expect(JSON.parse(row?.tags ?? "[]")).toEqual(["new", "shiny"]);
  });

  test("update on a missing id returns false", () => {
    expect(repo.update("nope", { importance: 0.1 })).toBe(false);
  });

  test("update with an empty patch reports existence (true if present, false if absent)", () => {
    insertMemory(repo, "m4", "present");
    expect(repo.update("m4", {})).toBe(true);
    expect(repo.update("missing", {})).toBe(false);
  });

  test("deleteById removes the row and its FTS entry, returns true", () => {
    insertMemory(repo, "m5", "deletable gamma");
    expect(repo.deleteById("m5")).toBe(true);
    expect(repo.getById("m5")).toBeNull();
    const hits = repo.fullTextSearch("gamma", 10, { minImportance: 0, includePersistent: true, limit: 10 });
    expect(hits.map((r) => r.id)).not.toContain("m5");
  });

  test("deleteById on a missing id returns false and is idempotent", () => {
    expect(repo.deleteById("ghost")).toBe(false);
    expect(repo.deleteById("ghost")).toBe(false);
  });
});

describe("MemoryController update (merge tags) + delete (sever edges)", () => {
  let repo: MemoryRepository;
  let controller: MemoryController;
  let graph: MemoryGraphService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "th0th-crud-ctrl-"));
    (GraphStore as any).instance = null;
    (MemoryGraphService as any).instance = null;
    (MemoryRepository as any).instance = null;
    (MemoryService as any).instance = null;
    (MemoryController as any).instance = null;
    repo = MemoryRepository.getInstance();
    controller = MemoryController.getInstance();
    graph = MemoryGraphService.getInstance();
  });

  afterEach(() => {
    try { (repo as any).db?.close?.(); } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("update merges tags when mergeTags is true (no content change → no embedding)", async () => {
    insertMemory(repo, "c1", "controller merge target", ["alpha"]);
    const result = await controller.update({ id: "c1", tags: ["beta"], mergeTags: true });

    expect(result.updated).toBe(true);
    const tags = JSON.parse(result.memory?.tags ?? "[]");
    expect(tags.sort()).toEqual(["alpha", "beta"]);
  });

  test("update returns updated:false for a missing id", async () => {
    const result = await controller.update({ id: "ghost", tags: ["x"] });
    expect(result.updated).toBe(false);
  });

  test("update rejects empty/whitespace content", async () => {
    insertMemory(repo, "c-empty", "has content");
    await expect(
      controller.update({ id: "c-empty", content: "   " }),
    ).rejects.toThrow(/content must not be empty/);
  });

  test("update with empty tags + mergeTags:false explicitly clears tags", async () => {
    insertMemory(repo, "c-clear", "has content", ["old", "stale"]);
    const result = await controller.update({ id: "c-clear", tags: [] });
    expect(result.updated).toBe(true);
    expect(JSON.parse(result.memory?.tags ?? "[]")).toEqual([]);
  });

  test("delete hard-deletes the memory and severs its graph edges", async () => {
    insertMemory(repo, "c2", "edge source");
    insertMemory(repo, "c3", "edge target");

    graph.linkMemories("c2", "c3", MemoryRelationType.RELATES_TO);
    expect(graph.getEdges("c2").length).toBeGreaterThan(0);

    const result = await controller.delete("c2");
    expect(result.deleted).toBe(true);
    expect(repo.getById("c2")).toBeNull();
    expect(graph.getEdges("c2").length).toBe(0);
  });

  test("delete on a missing id returns deleted:false", async () => {
    const result = await controller.delete("ghost");
    expect(result.deleted).toBe(false);
  });
});
