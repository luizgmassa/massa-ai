/**
 * Unit tests for ReadFileTool path resolution (COVERAGE finding #3).
 *
 * Covers the three resolveFilePath branches surfaced through handle():
 *   1. relative filePath + no projectId  → distinct { success:false } error,
 *      NOT a cwd guess (the bug fixed in T3).
 *   2. relative filePath + projectId     → resolves against the workspace
 *      project_path (workspaceManager stubbed).
 *   3. absolute filePath                 → used verbatim (base-independent).
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

import { ReadFileTool } from "../tools/read_file.js";
import type { SymbolGraphService } from "../services/symbol/symbol-graph.service.js";

// Stub the workspaceManager singleton BEFORE the tool imports it transitively.
// We only need getWorkspace(); the tool caches the returned project_path.
// Use a real temp dir so the tool can actually fs.readFile the resolved path.
const FAKE_WORKSPACE_ROOT = path.join(
  os.tmpdir(),
  `massa-th0th-readfile-ws-${process.pid}`
);
beforeEach(() => {
  fs.mkdirSync(FAKE_WORKSPACE_ROOT, { recursive: true });
});
mock.module("../services/workspace/workspace-manager.js", () => ({
  workspaceManager: {
    getWorkspace: async (_projectId: string) => ({
      project_path: FAKE_WORKSPACE_ROOT,
    }),
  },
}));

describe("ReadFileTool — resolveFilePath branches", () => {
  let tmpFile: string;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-th0th-readfile-"));
    tmpFile = path.join(tmpDir, "sample.txt");
    fs.writeFileSync(tmpFile, "line1\nline2\nline3\n");
  });

  test("relative filePath + no projectId → distinct success:false error", async () => {
    const tool = new ReadFileTool();
    const res = await tool.handle({
      filePath: "packages/core/src/tools/read_file.ts",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error!).toMatch(/requires a projectId.*absolute path/i);
    // Must NOT be the generic catch message — confirms we hit the early return.
    expect(res.error!).not.toMatch(/^Failed to read file:/);
  });

  test("relative filePath + projectId → resolves against workspace root", async () => {
    // Build an absolute target that matches what the tool will compute from the
    // (stubbed) workspace root + relative path, then assert absolutePath in the
    // successful response equals path.resolve(root, rel).
    const rel = "nested/file.txt";
    const expectedAbs = path.resolve(FAKE_WORKSPACE_ROOT, rel);

    // The tool will try to fs.readFile(expectedAbs). Create it so the read
    // succeeds and we can assert the resolved absolute path.
    fs.mkdirSync(path.dirname(expectedAbs), { recursive: true });
    fs.writeFileSync(expectedAbs, "hello\n");

    const tool = new ReadFileTool();
    const res = await tool.handle({
      filePath: rel,
      projectId: "proj-xyz",
    });

    expect(res.success).toBe(true);
    const data = res.data as { absolutePath: string };
    expect(data.absolutePath).toBe(expectedAbs);

    // cleanup the synthetic workspace file
    fs.rmSync(path.join(FAKE_WORKSPACE_ROOT, rel), { force: true });
  });

  afterEach(() => {
    // best-effort teardown of both temp dirs
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(FAKE_WORKSPACE_ROOT, { recursive: true, force: true });
  });

  test("absolute filePath → used verbatim (base-independent)", async () => {
    const tool = new ReadFileTool();
    const res = await tool.handle({ filePath: tmpFile });

    expect(res.success).toBe(true);
    const data = res.data as { absolutePath: string; content: string };
    // path.resolve on an already-absolute path is idempotent.
    expect(data.absolutePath).toBe(path.resolve(tmpFile));
    expect(data.content).toContain("line2");
  });
});

// ── cache-key regression (side-finding [med] — the only e2e red: 08.search F33) ─
//
// ReadFileTool.fileCache keys on filePath ONLY, so a second read of the same
// file within the 60s TTL with different includeSymbols/includeImports returns
// stale, options-baked metadata. In production ONE ReadFileTool instance is a
// module singleton (apps/tools-api/src/routes/file.ts:15), so the cache
// survives across HTTP requests → F33 (includeSymbols:false) fails in-suite,
// warmed by F30 (includeSymbols defaults true) on the same file.
//
// CRITICAL: a real SymbolGraphService must be injected via the constructor —
// without it metadata.symbols is NEVER populated, so a vacuous pass would mask
// the bug. The stub provides listDefinitions returning one definition so the
// includeSymbols:true path populates metadata.symbols.
describe("ReadFileTool — cache key includes option flags", () => {
  let tmpFile: string;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-th0th-readfile-cache-"));
    // .ts so extractMetadata detects a language and the symbol path engages.
    tmpFile = path.join(tmpDir, "sample.ts");
    fs.writeFileSync(tmpFile, "import { x } from 'y';\nexport function foo() {}\n");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("same file, different includeSymbols within TTL → distinct metadata", async () => {
    // Duck-typed stub matching the slice of SymbolGraphService the tool calls
    // (extractMetadata → listDefinitions). Cast to the service type so the
    // constructor accepts it.
    const stubSymbolGraph = {
      listDefinitions: async (_projectId: string, _opts: any) => [
        {
          name: "foo",
          kind: "function",
          filePath: tmpFile,
          lineStart: 2,
          lineEnd: 2,
        },
      ],
      getReferences: async (_projectId: string, _name: string, _fqn?: string) => [],
    } as unknown as SymbolGraphService;

    // ONE instance — mirrors the production singleton.
    const tool = new ReadFileTool(stubSymbolGraph);

    // Call 1: includeSymbols true (default). Assert symbols populated.
    const r1 = await tool.handle({
      filePath: tmpFile,
      projectId: "proj-cache",
      compress: false,
    });
    expect(r1.success).toBe(true);
    const d1 = r1.data as { metadata?: { symbols?: { definitions: number } } };
    expect(d1.metadata?.symbols).toBeDefined();
    expect(d1.metadata!.symbols!.definitions).toBe(1);

    // Call 2: SAME file, SAME projectId, back-to-back (within TTL), but
    // includeSymbols:false. Pre-fix this returned d1's stale symbols entry.
    const r2 = await tool.handle({
      filePath: tmpFile,
      projectId: "proj-cache",
      includeSymbols: false,
      compress: false,
    });
    expect(r2.success).toBe(true);
    const d2 = r2.data as { metadata?: { symbols?: unknown } };
    expect(d2.metadata?.symbols).toBeUndefined();
  });
});
