/**
 * Phase 4 D1 — Typed Structural Edges
 *
 * Two layers of tests:
 *
 *   (1) Unit: the extractor module is a pure function — feed it a TS source
 *       string + symbols, assert each edge type (CALLS, DATA_FLOWS, HTTP_CALLS,
 *       EMITS, LISTENS) is detected with correct metadata.
 *
 *   (2) Integration: run the full ETL pipeline on a TINY TS fixture (2 files)
 *       and assert the typed edges land in the symbol DB and are queryable via
 *       `symbolGraphService.getEdges` with type/direction filtering. NEVER a
 *       full-repo index — fixture only.
 *
 * Isolation: each integration test uses a throwaway projectId cleared in
 * beforeEach/afterEach (mirrors etl-pipeline.test.ts).
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { extractTypedEdges } from "../services/etl/typed-edges.js";
import type { RawSymbol } from "../services/etl/stage-context.js";
import { EtlPipeline } from "../services/etl/pipeline.js";
import { symbolGraphService } from "../services/symbol/symbol-graph.service.js";
import { getSymbolRepository } from "../data/sqlite/symbol-repository-factory.js";

// ─── (1) Extractor unit tests (pure function, no DB) ───────────────────────

describe("typed-edges extractor (pure function)", () => {
  // A minimal symbol table: one function spanning the whole snippet so caller
  // resolution has something to bind to.
  const symbols: RawSymbol[] = [
    { kind: "function", name: "handleRequest", lineStart: 1, lineEnd: 20, exported: true },
  ];

  test("extracts HTTP_CALLS from fetch + axios with route metadata", () => {
    const src = `
      export async function handleRequest() {
        await fetch('/api/users');
        axios.post('/api/login');
      }
    `;
    const edges = extractTypedEdges(src, symbols);
    const http = edges.filter((e) => e.kind === "http_call");
    expect(http.length).toBeGreaterThanOrEqual(2);
    const fetchEdge = http.find((e) => e.symbolName === "fetch");
    expect(fetchEdge).toBeDefined();
    expect(fetchEdge!.meta?.route).toBe("/api/users");
    expect(fetchEdge!.meta?.client).toBe("fetch");
    const axiosEdge = http.find((e) => e.symbolName === "axios.post");
    expect(axiosEdge).toBeDefined();
    expect(axiosEdge!.meta?.route).toBe("/api/login");
    expect(axiosEdge!.meta?.method).toBe("post");
  });

  test("graphql/gql regex captures the client token (no dead fallback)", () => {
    // graphql(`query ...`) and gql`...` must surface their actual token as
    // symbolName. The prior non-capturing group made m[1] always undefined.
    const src = `
      export function runQueries() {
        graphql(\`query { users { id } }\`);
        return gql\`fragment X on Y { id }\`;
      }
    `;
    const edges = extractTypedEdges(src, symbols);
    const gqlEdges = edges.filter(
      (e) => e.kind === "http_call" && e.meta?.client === "graphql",
    );
    expect(gqlEdges.length).toBeGreaterThanOrEqual(2);
    const names = gqlEdges.map((e) => e.symbolName).sort();
    // Both "graphql" and "gql" are captured — not a constant fallback.
    expect(names).toEqual(expect.arrayContaining(["graphql", "gql"]));
  });

  test("extracts EMITS edges with event names", () => {
    const src = `
      export function handleRequest(emitter) {
        emitter.emit('user.loggedIn', { id: 1 });
        emitter.emit('logout');
      }
    `;
    const edges = extractTypedEdges(src, symbols);
    const emits = edges.filter((e) => e.kind === "emit");
    const events = emits.map((e) => e.meta?.event).sort();
    expect(events).toEqual(expect.arrayContaining(["user.loggedIn", "logout"]));
  });

  test("extracts LISTENS edges with event names", () => {
    const src = `
      export function handleRequest(bus) {
        bus.on('user.loggedIn', handler);
        bus.once('signup', other);
      }
    `;
    const edges = extractTypedEdges(src, symbols);
    const listens = edges.filter((e) => e.kind === "listen");
    const events = listens.map((e) => e.meta?.event).sort();
    expect(events).toEqual(expect.arrayContaining(["user.loggedIn", "signup"]));
  });

  test("extracts CALLS edges (caller → callee) and stamps callerSymbol", () => {
    const src = `
      export function handleRequest() {
        parseInput(raw);
        return transform(result);
      }
    `;
    const edges = extractTypedEdges(src, symbols);
    const calls = edges.filter((e) => e.kind === "call");
    const callees = calls.map((e) => e.symbolName).sort();
    expect(callees).toEqual(expect.arrayContaining(["parseInput", "transform"]));
    // callerSymbol should resolve to the enclosing function
    for (const c of calls) {
      expect(c.callerSymbol).toBe("handleRequest");
    }
  });

  test("extracts DATA_FLOWS edges with param index for identifier args", () => {
    const src = `
      export function handleRequest(payload) {
        processPayload(payload);
      }
    `;
    const edges = extractTypedEdges(src, symbols);
    const flows = edges.filter((e) => e.kind === "data_flow");
    expect(flows.length).toBeGreaterThanOrEqual(1);
    const flow = flows.find((e) => e.symbolName === "processPayload");
    expect(flow).toBeDefined();
    expect(flow!.meta?.paramIndex).toBe(0);
    expect(flow!.meta?.argName).toBe("payload");
  });

  test("skips control-flow keywords as call edges", () => {
    const src = `
      export function handleRequest(items) {
        if (items.length) {
          for (const x of items) { work(x); }
        }
      }
    `;
    const edges = extractTypedEdges(src, symbols);
    const calls = edges.filter((e) => e.kind === "call").map((e) => e.symbolName);
    // 'if', 'for', 'of' must NOT appear as call edges
    expect(calls).not.toContain("if");
    expect(calls).not.toContain("for");
    expect(calls).not.toContain("of");
    expect(calls).toContain("work");
  });
});

// ─── (2) Pipeline integration: extraction → load → query ───────────────────

const TEST_PROJECT = "p4d1-typed-edges";

async function makeTempProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "massa-th0th-d1-"));
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
 * Fixture: two files. `emitter.ts` defines processEvent; `handler.ts` imports
 * it and calls it, plus an HTTP fetch, an emit, and a listen. This lets the
 * Resolve stage bind the call edge to `emitter.ts#processEvent` (import path).
 */
const FIXTURE: Record<string, string> = {
  "emitter.ts": `
    export function processEvent(payload: unknown): void {
      // ...
    }
  `,
  "handler.ts": `
    import { processEvent } from './emitter.js';

    export async function run(emitter: any) {
      fetch('/api/v1/events');
      emitter.emit('event.fired');
      emitter.on('event.fired', () => {});
      processEvent({ id: 42 });
    }
  `,
};

describe("typed-edges ETL integration (fixture pipeline)", () => {
  const repo = getSymbolRepository();

  beforeEach(async () => {
    try {
      await Promise.resolve(repo.clearProject(TEST_PROJECT));
    } catch {
      /* clearProject is SQLite-only on the SQLite repo; PG path is best-effort */
    }
  });
  afterEach(async () => {
    try {
      await Promise.resolve(repo.clearProject(TEST_PROJECT));
    } catch {
      /* noop */
    }
  });

  /**
   * Run the pipeline on the fixture and return per-kind edge counts.
   */
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

  test("forceReindex emits typed edges into symbol_references", async () => {
    const dir = await makeTempProject(FIXTURE);
    try {
      const counts = await indexFixture(dir, "d1-int-1");
      expect(counts.http_call ?? 0).toBeGreaterThanOrEqual(1);
      expect(counts.emit ?? 0).toBeGreaterThanOrEqual(1);
      expect(counts.listen ?? 0).toBeGreaterThanOrEqual(1);
      // 'call' for processEvent invocation; 'data_flow' for the { id: 42 } arg
      // is not a bare identifier so may be absent — assert call only.
      expect(counts.call ?? 0).toBeGreaterThanOrEqual(1);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  test("getEdges filters by type", async () => {
    const dir = await makeTempProject(FIXTURE);
    try {
      await indexFixture(dir, "d1-filter-1");

      // Filter: only http_call edges.
      const http = await symbolGraphService.getEdges(TEST_PROJECT, {
        types: ["http_call"],
      });
      expect(http.length).toBeGreaterThanOrEqual(1);
      expect(http.every((e) => e.refKind === "http_call")).toBe(true);
      const fetchEdge = http.find((e) => e.symbolName === "fetch");
      expect(fetchEdge).toBeDefined();
      expect(fetchEdge!.meta?.route).toBe("/api/v1/events");

      // Filter: only emit edges.
      const emits = await symbolGraphService.getEdges(TEST_PROJECT, {
        types: ["emit"],
      });
      expect(emits.length).toBeGreaterThanOrEqual(1);
      expect(emits[0].meta?.event).toBe("event.fired");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  test("getEdges filters by fromFile (direction: outgoing)", async () => {
    const dir = await makeTempProject(FIXTURE);
    try {
      await indexFixture(dir, "d1-dir-1");

      // All edges should originate from handler.ts (the file with the call sites).
      const fromHandler = await symbolGraphService.getEdges(TEST_PROJECT, {
        fromFile: "handler.ts",
        types: ["call", "http_call", "emit", "listen"],
      });
      expect(fromHandler.length).toBeGreaterThanOrEqual(4);
      expect(fromHandler.every((e) => e.fromFile === "handler.ts")).toBe(true);

      // emitter.ts has no call sites of its own.
      const fromEmitter = await symbolGraphService.getEdges(TEST_PROJECT, {
        fromFile: "emitter.ts",
        types: ["call", "http_call", "emit", "listen"],
      });
      expect(fromEmitter.length).toBe(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  test("CALLS edge resolves target FQN via import path", async () => {
    const dir = await makeTempProject(FIXTURE);
    try {
      await indexFixture(dir, "d1-resolve-1");

      // The call to processEvent should resolve target_fqn → emitter.ts#processEvent
      const calls = await symbolGraphService.getEdges(TEST_PROJECT, {
        types: ["call"],
      });
      const pe = calls.find((e) => e.symbolName === "processEvent");
      expect(pe).toBeDefined();
      expect(pe!.targetFqn).toBe("emitter.ts#processEvent");
      // callerFqn stamped into meta
      expect(pe!.meta?.callerFqn).toBe("handler.ts#run");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  test("project_map surfaces edgesByKind counts", async () => {
    const dir = await makeTempProject(FIXTURE);
    try {
      await indexFixture(dir, "d1-map-1");

      const map = await symbolGraphService.getProjectMap(TEST_PROJECT);
      expect(map).toBeDefined();
      expect(map!.edgesByKind).toBeDefined();
      expect(Object.keys(map!.edgesByKind!).length).toBeGreaterThan(0);
      expect((map!.edgesByKind!.http_call ?? 0)).toBeGreaterThanOrEqual(1);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});

// ─── (3) Cross-file callee resolution falsifier + include_tests ───────────
//
// These tests gate the D1 cross-file fix. The falsifier creates a scenario
// where the callee definition is ONLY in the repo (fingerprint-skipped this
// run) and NOT in the current parse batch. Before the fix (batch-only symbol
// index), the A→B CALL edge would resolve to target_fqn=null. After the fix
// (repo-seeded project-wide index), it resolves to callee.ts#calleeFn.

describe("typed-edges cross-file resolution + include_tests", () => {
  const repo = getSymbolRepository();

  beforeEach(async () => {
    try {
      await Promise.resolve(repo.clearProject(TEST_PROJECT));
    } catch {
      /* noop */
    }
  });
  afterEach(async () => {
    try {
      await Promise.resolve(repo.clearProject(TEST_PROJECT));
    } catch {
      /* noop */
    }
  });

  const CALLEE_SRC = `
    export function calleeFn(input: unknown): void {
      // defined in callee.ts
    }
  `;

  const CALLER_SRC = `
    import { calleeFn } from './callee.js';

    export function callerFn() {
      calleeFn({ value: 1 });
    }
  `;

  /**
   * FALSIFIER: caller in batch, callee only in repo (fingerprint-skipped).
   *
   * Run 1 indexes callee.ts alone (forceReindex). Run 2 adds caller.ts and
   * runs forceReindex=false: callee.ts is fingerprint-skipped, caller.ts is
   * parsed. The CALL edge in caller.ts → calleeFn must resolve to
   * callee.ts#calleeFn via the repo-seeded project-wide symbol index.
   *
   * Before the fix (batch-only index) the target would be null because
   * calleeFn's definition is not in the current parse batch.
   */
  test("cross-file CALL edge resolves when callee is fingerprint-skipped (repo-seed)", async () => {
    // Run 1: index callee.ts alone so its symbols land in the repo.
    const dir1 = await makeTempProject({ "callee.ts": CALLEE_SRC });
    try {
      const pipeline = EtlPipeline.getInstance();
      await pipeline.run({
        projectId: TEST_PROJECT,
        projectPath: dir1,
        jobId: "d1-xfile-seed",
        forceReindex: true,
      });
    } finally {
      await fs.rm(dir1, { recursive: true, force: true });
    }

    // Run 2: project now has BOTH callee.ts (unchanged) + caller.ts (new).
    // forceReindex=false → callee.ts fingerprint-skipped, caller.ts parsed.
    const dir2 = await makeTempProject({
      "callee.ts": CALLEE_SRC,
      "caller.ts": CALLER_SRC,
    });
    try {
      const pipeline = EtlPipeline.getInstance();
      await pipeline.run({
        projectId: TEST_PROJECT,
        projectPath: dir2,
        jobId: "d1-xfile-2",
        forceReindex: false,
      });

      const calls = await symbolGraphService.getEdges(TEST_PROJECT, {
        types: ["call"],
        fromFile: "caller.ts",
      });
      const edge = calls.find((e) => e.symbolName === "calleeFn");
      expect(edge).toBeDefined();
      // The go/no-go signal: target_fqn MUST be non-null and resolve to the
      // repo-seeded callee. Falsifies both the batch-only bug and stale reads.
      expect(edge!.targetFqn).toBe("callee.ts#calleeFn");
      expect(edge!.meta?.callerFqn).toBe("caller.ts#callerFn");
    } finally {
      await fs.rm(dir2, { recursive: true, force: true });
    }
  }, 30000);

  /**
   * include_tests=true: the Discover stage does NOT exclude test files, so a
   * `.test.ts` file's typed edges are indexed. include_tests=false (default)
   * emits no edges from test files.
   */
  test("include_tests=true indexes edges from .test.ts files", async () => {
    const dir = await makeTempProject({
      "sum.ts": `export function sum(a: number, b: number) { return a + b; }`,
      "sum.test.ts": `
        import { sum } from './sum.js';
        export function testSum() {
          sum(1, 2);
          fetch('/api/result');
        }
      `,
    });
    try {
      const pipeline = EtlPipeline.getInstance();
      await pipeline.run({
        projectId: TEST_PROJECT,
        projectPath: dir,
        jobId: "d1-include-tests-true",
        forceReindex: true,
        include_tests: true,
      });

      const edges = await symbolGraphService.getEdges(TEST_PROJECT, {
        fromFile: "sum.test.ts",
      });
      // At least the CALL edge to sum() and the http_call to fetch().
      expect(edges.length).toBeGreaterThanOrEqual(1);
      const sumCall = edges.find((e) => e.symbolName === "sum");
      expect(sumCall).toBeDefined();
      expect(sumCall!.targetFqn).toBe("sum.ts#sum");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  test("include_tests=false (default) emits NO edges from .test.ts files", async () => {
    const dir = await makeTempProject({
      "sum.ts": `export function sum(a: number, b: number) { return a + b; }`,
      "sum.test.ts": `
        import { sum } from './sum.js';
        export function testSum() { sum(1, 2); }
      `,
    });
    try {
      const pipeline = EtlPipeline.getInstance();
      await pipeline.run({
        projectId: TEST_PROJECT,
        projectPath: dir,
        jobId: "d1-include-tests-false",
        forceReindex: true,
        // include_tests omitted → default false
      });

      // sum.ts still indexed; sum.test.ts excluded by DEFAULT_IGNORES.
      const testEdges = await symbolGraphService.getEdges(TEST_PROJECT, {
        fromFile: "sum.test.ts",
      });
      expect(testEdges.length).toBe(0);

      // Non-test file edges still present.
      const sumEdges = await symbolGraphService.getEdges(TEST_PROJECT, {
        fromFile: "sum.ts",
      });
      expect(sumEdges.length).toBe(0); // sum.ts has no call sites of its own
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});
