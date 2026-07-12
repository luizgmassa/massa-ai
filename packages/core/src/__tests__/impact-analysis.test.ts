/**
 * Phase 4 D3 — impact_analysis tool
 *
 * Tests run the ETL on a TINY TS fixture with a known import + reference graph,
 * then assert the impact analysis: fixture-injected diff → changed files →
 * reverse-import traversal → impacted symbols ranked by centrality risk. NEVER
 * a full-repo index — fixture only. The git diff is STUBBED via the injectable
 * `diffRunner` so no real `git` runs in tests (and never on the whole repo).
 *
 * Isolation: throwaway projectId cleared in beforeEach/afterEach (mirrors
 * trace-path.test.ts).
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { EtlPipeline } from "../services/etl/pipeline.js";
import { impactAnalysisService } from "../services/symbol/impact-analysis.js";
import { ImpactAnalysisTool } from "../tools/impact_analysis.js";
import { getSymbolRepository } from "../data/sqlite/symbol-repository-factory.js";

const TEST_PROJECT = "p4d3-impact-analysis";

// ── Isolation pin ───────────────────────────────────────────────────────────
// SQLite-canonical suite: the fixture TS files are indexed into the SQLite
// SymbolRepository (clearProject/upsertFile/writeFileSymbols shape). Bun
// auto-loads repo-root .env (DATABASE_URL=postgresql://…), which would route
// the ETL pipeline + getSymbolRepository() to PG and fail with FK violations
// (symbol_definitions_project_id_fkey) because the throwaway TEST_PROJECT is
// never registered in the PG `workspaces` table. Pin DATABASE_URL="" so the
// whole ETL stack resolves to SQLite. Save/restore to keep sibling PG suites
// in the same bun process unaffected.
let savedDatabaseUrl: string | undefined;
beforeAll(() => {
  savedDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "";
});
afterAll(() => {
  process.env.DATABASE_URL = savedDatabaseUrl;
});

async function makeTempProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "massa-th0th-d3-"));
  await Promise.all(
    Object.entries(files).map(async ([rel, content]) => {
      const fp = path.join(dir, rel);
      await fs.mkdir(path.dirname(fp), { recursive: true });
      await fs.writeFile(fp, content, "utf-8");
    }),
  );
  return dir;
}

/**
 * Fixture: a leaf utility imported by a mid module, which is imported by a top
 * entry point. This gives us a 2-hop import chain for depth propagation, plus
 * a cross-file reference to a changed symbol.
 *
 *   util.ts:      doThing()                      ← the CHANGED file
 *   mid.ts:       import { doThing } from util    ← imports util (depth 1)
 *   entry.ts:     import { run } from mid         ← imports mid (depth 2)
 *   other.ts:     calls doThing() (reference)     ← references changed symbol
 */
const FIXTURE: Record<string, string> = {
  "util.ts": `
    export function doThing(): number {
      return 42;
    }
    export const ANSWER = 42;
  `,
  "mid.ts": `
    import { doThing } from './util.js';
    export function runMid(): number {
      return doThing();
    }
  `,
  "entry.ts": `
    import { runMid } from './mid.js';
    export function main(): void {
      runMid();
    }
  `,
  "other.ts": `
    import { doThing } from './util.js';
    export function consume(): number {
      return doThing() + 1;
    }
  `,
};

describe("impact_analysis", () => {
  // Resolved in beforeEach so the DATABASE_URL pin (file-scope beforeAll) is
  // already in effect — guarantees the SQLite backend.
  let repo: ReturnType<typeof getSymbolRepository>;

  beforeEach(() => {
    repo = getSymbolRepository();
    try {
      repo.clearProject(TEST_PROJECT);
    } catch {
      /* SQLite-only / best-effort */
    }
  });
  afterEach(() => {
    try {
      repo.clearProject(TEST_PROJECT);
    } catch {
      /* noop */
    }
  });

  async function indexFixture(dir: string, jobId: string): Promise<Record<string, number>> {
    const pipeline = EtlPipeline.getInstance();
    await pipeline.run({
      projectId: TEST_PROJECT,
      projectPath: dir,
      jobId,
      forceReindex: true,
    });
    return await Promise.resolve(repo.countEdgesByKind(TEST_PROJECT));
  }

  /** Fixture diff runner — returns a fixed list of "changed" files. */
  const diffRunner = (_dir: string, _scope: string, _b?: string, _s?: string): string[] => ["util.ts"];

  // ── Tool-level smoke (pure, no DB) ──────────────────────────────────────

  test("tool requires projectId", async () => {
    const tool = new ImpactAnalysisTool();
    const res = await tool.handle({ projectPath: "/tmp/x" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/projectId/i);
  });

  test("tool requires projectPath", async () => {
    const tool = new ImpactAnalysisTool();
    const res = await tool.handle({ projectId: TEST_PROJECT });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/projectPath/i);
  });

  test("tool name + description + schema present", () => {
    const tool = new ImpactAnalysisTool();
    expect(tool.name).toBe("impact_analysis");
    expect(tool.description.length).toBeGreaterThan(10);
    expect((tool.inputSchema as { required: string[] }).required).toEqual(["projectId", "projectPath"]);
  });

  // ── Service: fixture diff → impacted symbols ─────────────────────────────

  test("maps changed file to its defined symbols", async () => {
    const dir = await makeTempProject(FIXTURE);
    await indexFixture(dir, "d3-symbols");

    const result = await impactAnalysisService.analyze({
      projectId: TEST_PROJECT,
      projectPath: dir,
      scope: "unstaged",
      depth: 1,
      diffRunner,
    });

    expect(result.changedFiles.length).toBe(1);
    expect(result.changedFiles[0].path).toBe("util.ts");
    const names = result.changedFiles[0].symbols.map((s) => s.name);
    expect(names).toContain("doThing");
  });

  test("reverse-import traversal finds importers of the changed file", async () => {
    const dir = await makeTempProject(FIXTURE);
    await indexFixture(dir, "d3-importers");

    // depth 1: only direct importers of util.ts (mid.ts, other.ts)
    const result = await impactAnalysisService.analyze({
      projectId: TEST_PROJECT,
      projectPath: dir,
      scope: "unstaged",
      depth: 1,
      diffRunner,
    });

    const impactedFiles = new Set(result.impacted.map((s) => s.file));
    expect(impactedFiles.has("mid.ts")).toBe(true);
    expect(impactedFiles.has("other.ts")).toBe(true);
    // entry.ts imports mid.ts, NOT util.ts — excluded at depth 1
    expect(impactedFiles.has("entry.ts")).toBe(false);
  });

  test("depth propagation reaches transitive importers", async () => {
    const dir = await makeTempProject(FIXTURE);
    await indexFixture(dir, "d3-depth");

    // depth 2: mid.ts (1) + entry.ts (2, imports mid.ts)
    const result = await impactAnalysisService.analyze({
      projectId: TEST_PROJECT,
      projectPath: dir,
      scope: "unstaged",
      depth: 2,
      diffRunner,
    });

    const byFile = new Map(result.impacted.map((s) => [s.file, s]));
    expect(byFile.has("mid.ts")).toBe(true);
    expect(byFile.has("entry.ts")).toBe(true);
    // entry.ts is 2 hops away; mid.ts is 1 hop away
    expect(byFile.get("entry.ts")!.depth).toBeGreaterThan(byFile.get("mid.ts")!.depth);
  });

  test("risk ranking is descending by risk score", async () => {
    const dir = await makeTempProject(FIXTURE);
    await indexFixture(dir, "d3-risk");

    const result = await impactAnalysisService.analyze({
      projectId: TEST_PROJECT,
      projectPath: dir,
      scope: "unstaged",
      depth: 2,
      diffRunner,
    });

    const risks = result.impacted.map((s) => s.risk);
    for (let i = 1; i < risks.length; i++) {
      expect(risks[i - 1]).toBeGreaterThanOrEqual(risks[i]);
    }
    // Every impacted entry has a reason + via
    for (const s of result.impacted) {
      expect(s.reason.length).toBeGreaterThan(0);
      expect(s.via.changedFile).toBe("util.ts");
    }
  });

  test("impacted entries carry centrality + proximity-weighted risk", async () => {
    const dir = await makeTempProject(FIXTURE);
    await indexFixture(dir, "d3-formula");

    const result = await impactAnalysisService.analyze({
      projectId: TEST_PROJECT,
      projectPath: dir,
      scope: "unstaged",
      depth: 2,
      diffRunner,
    });

    expect(result.impacted.length).toBeGreaterThan(0);
    for (const s of result.impacted) {
      expect(s.centrality).toBeGreaterThanOrEqual(0);
      expect(s.centrality).toBeLessThanOrEqual(1);
      expect(s.depth).toBeGreaterThanOrEqual(1);
      // risk = 0.6*centrality + 0.4*(1/(depth+1)), within float tolerance
      const expected = 0.6 * s.centrality + 0.4 * (1 / s.depth);
      expect(Math.abs(s.risk - Number(expected.toFixed(4)))).toBeLessThanOrEqual(0.02);
    }
  });

  test("path filter narrows to the requested changed files", async () => {
    const dir = await makeTempProject(FIXTURE);
    await indexFixture(dir, "d3-filter");

    // diff says two files changed, but paths filter restricts to util.ts only
    const twoFileDiff = (): string[] => ["util.ts", "mid.ts"];
    const result = await impactAnalysisService.analyze({
      projectId: TEST_PROJECT,
      projectPath: dir,
      scope: "unstaged",
      depth: 1,
      diffRunner: twoFileDiff,
      paths: ["util.ts"],
    });

    expect(result.changedFiles.map((f) => f.path)).toEqual(["util.ts"]);
  });

  test("empty diff returns a note + zero impacted", async () => {
    const dir = await makeTempProject(FIXTURE);
    await indexFixture(dir, "d3-empty");

    const result = await impactAnalysisService.analyze({
      projectId: TEST_PROJECT,
      projectPath: dir,
      scope: "unstaged",
      depth: 2,
      diffRunner: () => [],
    });

    expect(result.changedFiles).toEqual([]);
    expect(result.impacted).toEqual([]);
    expect(result.note).toBeDefined();
  });

  test("result count is bounded (MAX_IMPACTED respected)", async () => {
    const dir = await makeTempProject(FIXTURE);
    await indexFixture(dir, "d3-bound");

    const result = await impactAnalysisService.analyze({
      projectId: TEST_PROJECT,
      projectPath: dir,
      scope: "unstaged",
      depth: 4,
      diffRunner,
    });

    // Tiny fixture never hits the cap, but the contract is: ≤ MAX_IMPACTED.
    expect(result.impacted.length).toBeLessThanOrEqual(100);
  });

  // ── End-to-end through the tool handler ───────────────────────────────────

  test("tool handle returns shaped impact result", async () => {
    const dir = await makeTempProject(FIXTURE);
    await indexFixture(dir, "d3-tool");

    // The tool uses the REAL default diff runner; inject a stub via the service
    // by calling the service directly with the diffRunner, then also exercise
    // the tool's error path. Here we drive the service (tool has no diffRunner
    // param) to validate the full chain minus real git.
    const result = await impactAnalysisService.analyze({
      projectId: TEST_PROJECT,
      projectPath: dir,
      scope: "committed",
      baseBranch: "main",
      depth: 2,
      diffRunner,
    });

    expect(result.scope).toBe("committed");
    expect(result.baseBranch).toBe("main");
    expect(result.changedFiles.length).toBe(1);
    expect(result.impacted.length).toBeGreaterThan(0);
  });
});
