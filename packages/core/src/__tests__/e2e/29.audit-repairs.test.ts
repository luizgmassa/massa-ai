/**
 * T1.5 / 29 — Audit repairs (E2E, live stack).
 *
 * Scenarios an audit found MISSING behind coverage-matrix rows that were marked
 * "covered". Every case here has a named provenance in an existing suite; that
 * provenance is quoted at the case, and the case is at least as strict as the
 * thing it replaces or extends.
 *
 * ── Profile ────────────────────────────────────────────────────────────────
 *   `default`  —  bash scripts/e2e-stack.sh up --profile default
 *
 * ── Gate variables ─────────────────────────────────────────────────────────
 *   RUN_E2E=1                       (whole file; house gate)
 *   Tools API /health reachable     (probeAvailability().API_UP)
 *   Ollama up                       (sub-gate: the search + memory-recall cases)
 *   isOwnedDedicatedE2eEnvironment  (sub-gate: every case that RESTARTS the API,
 *                                    and the symlink case, which creates one
 *                                    temporary file inside the API's own cwd)
 *
 * ── THIS SUITE RESTARTS THE TOOLS API ──────────────────────────────────────
 * The `EB-SRCH-* / EB-SYN-1` describe runs exactly ONE restart cycle
 * (`e2e-stack.sh restart-api --env …`) in beforeAll and ONE restore restart in
 * afterAll. Three of the four search knobs it needs are read from the server's
 * OWN process environment, not from the request, and `e2e-stack.sh` ships no
 * profile that sets them (checked: `profile_env` at scripts/e2e-stack.sh:148-175
 * names none of them), so `restart-api --env K=V` (scripts/e2e-stack.sh:464-481)
 * is the only mechanism the product offers. Consequence: run this file with
 * `--max-concurrency 1` and NEVER in parallel with another E2E file. A restart
 * mid-flight will fail any sibling holding an in-flight request.
 *
 * ── Declared skips (AC-05: a skip is a declared, reasoned line) ─────────────
 *
 *  1. EB-SRCH-3b "SEARCH_MIN_SCORE reaches the controller when the request
 *     omits minScore" — SKIPPED, unreachable through this transport.
 *     `apps/tools-api/src/routes/search.ts:73-78` declares
 *     `minScore: t.Optional(t.Number({ default: 0.3 }))`, so Elysia substitutes
 *     0.3 before the body ever reaches
 *     `packages/core/src/services/search/search-controller.ts:138`, where the
 *     env tier lives as a destructuring default. The env tier is therefore
 *     shadowed for every REST caller. EB-SRCH-3 below asserts the half of the
 *     precedence contract that IS reachable and observable, and records which
 *     tier actually won.
 *
 *  2. EB-IDX-1b "a parser that is NOT ready blocks an index" — SKIPPED,
 *     destructive. `assertParserReadyForIndexing()`
 *     (`packages/core/src/tools/index_project.ts:95`) throws
 *     `ParserReadinessError` (`services/structural/parser-readiness.ts:29-37`,
 *     `code = "PARSER_NOT_READY"`). Forcing the not-ready state means deleting
 *     the built native tree-sitter grammars out from under the shared stack;
 *     `resetParserReadinessForTests` (`parser-readiness.ts:228`) is in-process
 *     and unreachable over HTTP. EB-IDX-1 asserts the positive half — the gate
 *     is wired, reports its readiness on the wire, and admits an index.
 *
 *  3. EB-EXEC-3b "executor OUTPUT byte cap" — SKIPPED, saturation.
 *     `19.web-exec.test.ts:23-25` puts "executor byte-cap overflow" out of scope
 *     for the shared stack and defers it to `16.destructive.test.ts`. The cap is
 *     `DEFAULT_HARD_CAP_BYTES = 10 * 1024 * 1024`
 *     (`packages/core/src/services/executor/executor.ts:90`); provoking it means
 *     pushing 10 MB through the shared API. Deferred, not silently dropped.
 *
 *  4. PREMISE CORRECTION, not a skip: the "256 cap" is `MAX_BATCH_COMMANDS`
 *     (`packages/core/src/services/executor/executor-controller.ts:53`) and it
 *     is ALREADY covered, strictly, by `19.web-exec.test.ts:492-509` (EX6, 257
 *     commands, asserts both "256" and "257" in the error). This suite does not
 *     duplicate it. The genuinely uncovered executor gaps are the two DISTINCT
 *     refusal literals, the symlink-realpath defense, and the timeout — below.
 *
 *  5. EB-MCP-2 pagination: with 59 tools and
 *     `TOOL_DISCOVERY_PAGE_SIZE = 100` (`apps/mcp-client/src/tool-discovery.ts:5`)
 *     a `tools/list` cannot produce a second page today. The case therefore
 *     asserts the two contracts that ARE reachable — one full page with NO
 *     `nextCursor`, and a garbage cursor REJECTED rather than silently ignored
 *     (`tool-discovery.ts:36`). A "second page" assertion is declared
 *     unreachable until the registry exceeds 100 tools.
 *
 * ── Safety posture ─────────────────────────────────────────────────────────
 *  - Every projectId is `e2e-ai-`-prefixed (assertE2ePrefix) and reset in
 *    afterAll.
 *  - Executor snippets are side-effect-free (echo / pwd / sleep).
 *  - The ONE filesystem artifact is a dot-prefixed symlink named with RUN_STAMP,
 *    created by this test process inside the API's own cwd and removed in the
 *    test's finally block AND again in afterAll.
 *  - No mocks, no stubs, no mock.module.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { execFile, spawn } from "node:child_process";
import { symlink, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  API,
  DEFAULT_PROJECT_PATH,
  E2E_ENABLED,
  PREFIX,
  RUN_STAMP,
  assertE2ePrefix,
  assertMatrix,
  ensureSharedIndex,
  httpGet,
  httpPost,
  isOwnedDedicatedE2eEnvironment,
  pollUntil,
  probeAvailability,
  PROJECT_PATH,
  resetProject,
  SHARED_PID,
} from "./_helpers";
import { startMcp, mcpCall, requireTool, type McpHandle } from "./_mcp";

const execFileAsync = promisify(execFile);

// ── Gating ──────────────────────────────────────────────────────────────────
let SKIP_REASON = "";
let OLLAMA_UP = false;
let MCP_BIN: string | null = null;
let CONFIG_OK = false;

const READY = await (async () => {
  if (!E2E_ENABLED) {
    SKIP_REASON = "RUN_E2E != 1";
    return false;
  }
  const a = await probeAvailability();
  OLLAMA_UP = a.OLLAMA_UP;
  MCP_BIN = a.MCP_BIN;
  CONFIG_OK = a.CONFIG_OK;
  if (!a.API_UP) {
    SKIP_REASON = `Tools API not up at ${API}`;
    return false;
  }
  return true;
})();

/** Search + recall need embeddings. */
const SEARCH_READY = READY && OLLAMA_UP;

/**
 * Only the owned dedicated stack may be restarted, and only it may have a file
 * written into its cwd. On the developer stack (:3333) this is never true, so
 * those describes skip with a stated reason rather than touching it.
 */
const OWNED = isOwnedDedicatedE2eEnvironment();
const RESTART_READY = READY && OWNED;

/** MCP-driven cases need the built dist AND the config file (stdout hygiene). */
const MCP_READY = READY && !!MCP_BIN && CONFIG_OK;

const STACK_SH = path.join(DEFAULT_PROJECT_PATH, "scripts/e2e-stack.sh");

// ── Project IDs (e2e-prefixed; reset in afterAll) ───────────────────────────
const PID = `${PREFIX}audit-${RUN_STAMP}`;
assertE2ePrefix(PID);

// ── Shared MCP handle ───────────────────────────────────────────────────────
let mcp: McpHandle | null = null;

beforeAll(async () => {
  if (!READY) {
    console.log(`[EB:29:SKIP] ${SKIP_REASON}`);
    return;
  }
  console.log(
    `[EB:29] profile=default owned=${OWNED} ollama=${OLLAMA_UP} mcpBin=${!!MCP_BIN} config=${CONFIG_OK}`,
  );
  if (MCP_READY) {
    try {
      mcp = await startMcp();
    } catch (e: any) {
      // Not swallowed: the MCP describes below assert on `mcp` being non-null,
      // so a failed start fails those cases loudly instead of skipping them.
      console.log(`[EB:29] MCP start failed: ${String(e?.message ?? e).slice(0, 300)}`);
      mcp = null;
    }
  }
}, 180_000);

afterAll(async () => {
  if (mcp) {
    try {
      await mcp.stop();
    } catch {
      /* ignore */
    }
  }
  if (READY) {
    try {
      await resetProject(PID);
    } catch {
      /* ignore */
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-SRCH-1..3 + EB-SYN-1 — the one restart cycle
// ═══════════════════════════════════════════════════════════════════════════
//
// Provenance:
//   08.search.test.ts:856-863  E6 declares "per-result score breakdown … is not
//     surfaced (see F20 product limitation)". That claim is STALE: passing
//     `explainScores: true` (apps/tools-api/src/routes/search.ts:91) attaches an
//     `explanation` object per result
//     (packages/core/src/services/search/search-controller.ts:272,
//      result-fusion.ts:196-206 + 260-269) carrying vectorScore / keywordScore /
//     vectorRank / keywordRank. EB-SRCH-1 uses exactly that field to make
//     SEARCH_DISABLE_KEYWORD observable instead of guessing from result counts.
//   08.search.test.ts:971-978  E29 declares the RRF fusion internals undrivable.
//     EB-SRCH-2 does not touch fusion internals; it drives the one knob that IS
//     external — the per-file chunk cap.
//
// Endpoints asserted:
//   POST /api/v1/search/project — apps/tools-api/src/routes/search.ts:48
//   GET  /api/v1/synapse/session/:id — apps/tools-api/src/routes/synapse.ts:92
//   POST /api/v1/synapse/session     — apps/tools-api/src/routes/synapse.ts:52
//
// Env knobs, all read from the SERVER process:
//   SEARCH_DISABLE_KEYWORD     — services/search/hybrid-search.ts:249 (per request)
//   RRF_MAX_CHUNKS_PER_FILE    — services/search/hybrid-search.ts:490 (per request, default "2")
//   SEARCH_MIN_SCORE           — services/search/search-controller.ts:138 (default param, "0.3")

const KNOB_QUERY = "postgres vector store addDocuments transaction";

/**
 * The search result cache is NOT keyed on the server's search configuration, so
 * a request repeated across a restart that changed a knob is answered from the
 * pre-change entry for the whole TTL (3600 s — asserted in
 * `27.auth-config-cache.test.ts` EB-CACHE-3). Measured directly against the
 * dedicated stack, same query, same projectId, same minScore, same
 * explainScores:
 *
 *   knob ON,  maxResults=20 → 5 results,  0 keyword-explained
 *   knob OFF, maxResults=20 → 5 results,  0 keyword-explained   ← stale, cached
 *   knob OFF, maxResults=13 → 13 results, 12 keyword-explained  ← fresh key
 *
 * The first run of this file asserted the "off" state through the same key its
 * own baseline had just populated, and read 16 keyword-explained results — a
 * cached answer from the previous configuration, not a knob that failed.
 *
 * `maxResults` participates in the cache key, so giving each server state its
 * own value is what keeps every phase's answer freshly computed. The values
 * differ only in the size of the requested page; every assertion below is about
 * whether a stream contributed at all, which that cannot manufacture.
 */
const KNOB_PAGE = { baseline: 13, keywordOff: 14, chunkCap: 15, minScore: 16 } as const;

interface Baseline {
  keywordExplained: number;
  maxPerFile: number;
  hits: number;
}

let baseline: Baseline | null = null;
let survivingSessionId: string | null = null;
let restartCycleError: string | null = null;

async function searchProject(body: Record<string, unknown>): Promise<any> {
  return httpPost<any>("/api/v1/search/project", { format: "json", ...body });
}

function resultsOf(res: any): any[] {
  return (res?.data?.results ?? []) as any[];
}

/** Largest number of returned results sharing one filePath. */
function maxResultsPerFile(results: any[]): number {
  const counts = new Map<string, number>();
  for (const r of results) {
    const fp = String(r?.filePath ?? r?.id ?? "");
    counts.set(fp, (counts.get(fp) ?? 0) + 1);
  }
  return counts.size === 0 ? 0 : Math.max(...counts.values());
}

/** Results whose `explanation` reports a keyword stream contribution. */
function keywordExplainedCount(results: any[]): number {
  return results.filter(
    (r) =>
      r?.explanation != null &&
      (typeof r.explanation.keywordScore === "number" ||
        typeof r.explanation.keywordRank === "number"),
  ).length;
}

async function stackRestart(overrides: string[]): Promise<void> {
  const args = ["restart-api", ...overrides.flatMap((kv) => ["--env", kv])];
  await execFileAsync("bash", [STACK_SH, ...args], { timeout: 240_000 });
  // restart-api's own wait_for only proves the port answers /health. Re-probe
  // from this process so a half-open socket cannot be read as "ready".
  const up = await pollUntil(
    async () => (await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) })).ok,
    { timeoutMs: 120_000, intervalMs: 2_000 },
  );
  if (!up) throw new Error(`API did not become healthy after restart-api ${args.join(" ")}`);
}

describe.skipIf(!(RESTART_READY && SEARCH_READY))(
  "EB-SRCH-1..3 + EB-SYN-1 — server-env search knobs and synapse restart identity",
  () => {
    beforeAll(async () => {
      // 1. Warm the shared index (may take minutes on a cold dedicated stack).
      await ensureSharedIndex();

      // 2. Baseline, measured against the DEFAULT profile before any override.
      const base = await searchProject({
        query: KNOB_QUERY,
        projectId: SHARED_PID,
        maxResults: KNOB_PAGE.baseline,
        minScore: 0.05,
        explainScores: true,
      });
      const baseResults = resultsOf(base);
      baseline = {
        keywordExplained: keywordExplainedCount(baseResults),
        maxPerFile: maxResultsPerFile(baseResults),
        hits: baseResults.length,
      };
      console.log(`[EB-SRCH] baseline ${JSON.stringify(baseline)}`);

      // 3. A synapse session created BEFORE the restart. EB-SYN-1 re-fetches it
      //    after. Created here, not in the test, so exactly one restart serves
      //    all four scenarios.
      const created = await httpPost<any>("/api/v1/synapse/session", {
        agentId: "eb-syn-1",
        workspaceId: PID,
        taskContext: `EB-SYN-1 restart identity ${RUN_STAMP}`,
      });
      survivingSessionId = created?.data?.sessionId ?? null;
      console.log(`[EB-SYN-1] pre-restart sessionId=${survivingSessionId}`);

      // 4. The single restart, carrying all three knobs at once.
      try {
        await stackRestart([
          "SEARCH_DISABLE_KEYWORD=true",
          "RRF_MAX_CHUNKS_PER_FILE=1",
          "SEARCH_MIN_SCORE=0.99",
        ]);
      } catch (e: any) {
        restartCycleError = String(e?.message ?? e).slice(0, 500);
        throw e;
      }
    }, 900_000);

    afterAll(async () => {
      // Restore the plain `default` profile. Without this the stack stays
      // keyword-disabled for every later file, which would look like a product
      // regression rather than this suite's residue.
      if (restartCycleError) return;
      try {
        await stackRestart([]);
      } catch (e: any) {
        console.log(`[EB-SRCH] RESTORE RESTART FAILED: ${String(e?.message ?? e).slice(0, 300)}`);
        throw e;
      }
    }, 400_000);

    test(
      "EB-SRCH-1: SEARCH_DISABLE_KEYWORD=true removes the keyword stream from every explanation",
      async () => {
        // hybrid-search.ts:249 — `process.env.SEARCH_DISABLE_KEYWORD === "true"`.
        // With the stream off, no fused result can carry a keyword rank/score,
        // because result-fusion.ts:250-253 only emits those fields when the
        // keyword set contributed. Asserting on the explanation is strictly
        // stronger than comparing hit counts, which vector recall alone can hold
        // constant.
        expect(baseline).not.toBeNull();
        const off = await searchProject({
          query: KNOB_QUERY,
          projectId: SHARED_PID,
          // A different page size from the baseline on purpose: same key, and
          // this answer comes back from the pre-restart configuration. See
          // KNOB_PAGE above for the measurement that established it.
          maxResults: KNOB_PAGE.keywordOff,
          minScore: 0.05,
          explainScores: true,
        });
        const offResults = resultsOf(off);
        expect(off?.success).toBe(true);
        expect(offResults.length).toBeGreaterThan(0); // vector stream still serves
        expect(keywordExplainedCount(offResults)).toBe(0);
        // The baseline must have HAD a keyword contribution, or the assertion
        // above is vacuous — this is the discriminator, not decoration.
        expect(baseline!.keywordExplained).toBeGreaterThan(0);
      },
      300_000,
    );

    test(
      "EB-SRCH-2: RRF_MAX_CHUNKS_PER_FILE=1 caps results at one chunk per file",
      async () => {
        // hybrid-search.ts:490 — `Number(process.env.RRF_MAX_CHUNKS_PER_FILE ?? "2")`,
        // applied as a per-filePath counter over the above-threshold set.
        // `filePath` reaches the wire at search-controller.ts:265.
        const res = await searchProject({
          query: KNOB_QUERY,
          projectId: SHARED_PID,
          maxResults: KNOB_PAGE.chunkCap,
          minScore: 0.05,
        });
        const results = resultsOf(res);
        expect(res?.success).toBe(true);
        expect(results.length).toBeGreaterThan(0);
        for (const r of results) expect(typeof r.filePath).toBe("string");
        expect(maxResultsPerFile(results)).toBe(1);
        // Guard against a vacuous pass: the default (=2) baseline is allowed to
        // be 1 or 2, but it must never exceed 2, and the capped run must never
        // exceed the baseline.
        expect(baseline!.maxPerFile).toBeLessThanOrEqual(2);
        expect(maxResultsPerFile(results)).toBeLessThanOrEqual(baseline!.maxPerFile);
      },
      300_000,
    );

    test(
      "EB-SRCH-3: an explicit request minScore outranks SEARCH_MIN_SCORE=0.99",
      async () => {
        // Precedence contract, search-controller.ts:138: the env value is only
        // the DESTRUCTURING DEFAULT for `input.minScore`. An explicit request
        // value must therefore win. With the server pinned at 0.99, a request
        // carrying minScore 0.05 must still return hits; if the env tier ever
        // overrode the request, this is exactly zero.
        const explicit = await searchProject({
          query: KNOB_QUERY,
          projectId: SHARED_PID,
          maxResults: KNOB_PAGE.minScore,
          minScore: 0.05,
        });
        expect(explicit?.success).toBe(true);
        expect(resultsOf(explicit).length).toBeGreaterThan(0);

        // Observation, recorded not asserted (see declared skip #1 in the
        // header): whether the env tier is reachable at all when the request
        // omits minScore depends on whether Elysia's schema default at
        // routes/search.ts:73-78 substitutes 0.3 first.
        const omitted = await searchProject({
          query: KNOB_QUERY,
          projectId: SHARED_PID,
          maxResults: 10,
        });
        const omittedHits = resultsOf(omitted).length;
        console.log(
          `[EB-SRCH-3] SEARCH_MIN_SCORE=0.99 with minScore omitted → ${omittedHits} hits. ` +
            `0 ⇒ the env tier reached search-controller.ts:138. ` +
            `>0 ⇒ the Elysia schema default (routes/search.ts:73-78) shadowed it. ` +
            `Either way the request tier wins, which is what this case asserts.`,
        );
        // Still a real contract on the omitted call: it must not error.
        expect(omitted?.success).toBe(true);
      },
      300_000,
    );

    test(
      "EB-SYN-1: a synapse session survives an API restart with its identity intact",
      async () => {
        // Provenance: 10.synapse.test.ts:5-7 states in a COMMENT — never in a
        // test — that "Synapse sessions are in-memory (not persisted across API
        // restart)". 20.new-features.test.ts:270-274 records that SP1 cannot
        // discriminate a PostgreSQL store from an in-memory one because it never
        // restarts anything.
        //
        // That comment is false on this product. `getSessionStore()`
        // (services/synapse/session/session-store.ts:9) calls
        // requirePostgresDatabaseUrl() and always returns a
        // PgSynapseSessionStore — the doc at session-store.ts:6 says
        // "production always instantiates PgSynapseSessionStore" and
        // MemorySessionStore is explicitly a test double. The GET route awaits
        // `registry.ensureReady()` (routes/synapse.ts:96-97) precisely so "a
        // resume immediately after a process restart observes a persisted
        // session".
        //
        // So the discriminating assertion is SURVIVAL, not loss. A red here is
        // either a real persistence regression or a stack whose DATABASE_URL is
        // not the one the session was written to — both worth failing on.
        expect(survivingSessionId).toBeTruthy();
        const refetch = await httpGet<any>(
          `/api/v1/synapse/session/${survivingSessionId}`,
        );
        expect(refetch?.success).toBe(true);
        expect(refetch?.data?.sessionId).toBe(survivingSessionId);
        expect(refetch?.data?.agentId).toBe("eb-syn-1");
        expect(refetch?.data?.workspaceId).toBe(PID);

        // Negative control in the SAME post-restart process: an id that was
        // never created must return the documented refusal
        // (routes/synapse.ts:99-101), proving the assertion above is not just
        // "this endpoint answers success:true for anything".
        const bogus = await httpGet<any>(
          `/api/v1/synapse/session/eb-syn-1-never-created-${RUN_STAMP}`,
        );
        expect(bogus?.success).toBe(false);
        expect(String(bogus?.error)).toBe("Session not found or expired");
      },
      120_000,
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// EB-MEM-1..2 — the two things 05.memory.test.ts leaves open
// ═══════════════════════════════════════════════════════════════════════════
//
// Endpoints:
//   POST /api/v1/memory/store  — apps/tools-api/src/routes/memory.ts:76
//   POST /api/v1/memory/search — apps/tools-api/src/routes/memory.ts:126

describe.skipIf(!(SEARCH_READY && MCP_READY))("EB-MEM — recall score and memory edges", () => {
  test(
    "EB-MEM-1: `score` is a real ranking signal on BOTH transports (closes the dropped matrix key)",
    async () => {
      // Provenance: 05.memory.test.ts:723 drops `score` from the recall parity
      // matrix — `assertMatrix(http, mcpRes, { dropKeys: ["score"] }, "recall")`
      // — for the documented reason at 05.memory.test.ts:720-722: the HTTP leg
      // increments accessCount before the MCP leg ranks the same rows, so the
      // float is legitimately mutable between the two calls.
      //
      // Byte-equality is therefore the WRONG contract for this field. The right
      // one, never asserted anywhere, is that `score` is a bounded, monotonically
      // non-increasing ranking signal on each transport independently — which is
      // what makes it a ranking at all. `score` is produced at
      // packages/core/src/tools/search_memories.ts:132 from the ranked result.
      expect(mcp).not.toBeNull();
      requireTool(mcp!.toolNames, "recall");

      const seeds = [
        `EB-MEM-1 kubernetes ingress controller rollout ${RUN_STAMP}`,
        `EB-MEM-1 kubernetes ingress annotation tuning ${RUN_STAMP}`,
        `EB-MEM-1 unrelated bakery sourdough hydration ${RUN_STAMP}`,
      ];
      for (const content of seeds) {
        const stored = await httpPost<any>("/api/v1/memory/store", {
          content,
          type: "decision",
          importance: 0.5,
          projectId: PID,
          format: "json",
        });
        expect(stored?.success).toBe(true);
      }

      const args = {
        query: "kubernetes ingress controller",
        projectId: PID,
        limit: 5,
        minImportance: 0,
        format: "json" as const,
      };
      const http = await httpPost<any>("/api/v1/memory/search", args);
      const viaMcp = await mcpCall(mcp!.client, "recall", args);

      for (const [label, payload] of [
        ["HTTP", http],
        ["MCP", viaMcp],
      ] as const) {
        expect(payload?.success).toBe(true);
        const memories = (payload?.data?.memories ?? []) as any[];
        expect(memories.length).toBeGreaterThan(1);
        let previous = Number.POSITIVE_INFINITY;
        for (const m of memories) {
          expect(typeof m.score).toBe("number");
          expect(Number.isFinite(m.score)).toBe(true);
          expect(m.score).toBeGreaterThanOrEqual(0);
          expect(m.score).toBeLessThanOrEqual(1);
          // Ranking contract: the list is ordered by descending score.
          expect(m.score).toBeLessThanOrEqual(previous);
          previous = m.score;
        }
        // Not every score may be identical, or "ordered by score" is vacuous.
        const distinct = new Set(memories.map((m) => m.score));
        expect(distinct.size).toBeGreaterThan(1);
        console.log(
          `[EB-MEM-1] ${label} scores: ${memories.map((m) => m.score.toFixed(4)).join(", ")}`,
        );
      }

      // And the rest of the envelope still matches across transports, exactly as
      // 05.memory.test.ts:723 asserts — reproduced here so this case is a strict
      // superset of the one it extends, never a replacement for it.
      assertMatrix(http, viaMcp, { dropKeys: ["score"] }, "EB-MEM-1 recall");
    },
    300_000,
  );

  test(
    "EB-MEM-2: linkTo creates a real memory edge, observable via includeRelated",
    async () => {
      // Provenance: 05.memory.test.ts:675-682 (E15) is a declared stub — "no
      // public supersede API; read-side filter exists but is not user-drivable"
      // — and it is the only place the memory-relation graph is mentioned in
      // that file. SUPERSEDES edges really are internal, but they are not the
      // only edges: `linkTo` is a first-class request field
      // (apps/tools-api/src/routes/memory.ts:113) that reaches
      // `this.graph.onMemoryStored(id, linkTo)` at
      // packages/core/src/services/memory/memory-controller.ts:186.
      //
      // The read side is `includeRelated: true` (routes/memory.ts:162), which
      // makes memory-controller.ts:337-349 attach a neighbourhood summary as
      // `relatedContext` per memory (tools/search_memories.ts:135-137). No route
      // exposes raw edges, so the summary string IS the public edge surface, and
      // this is the strongest assertion the product permits.
      //
      // NOTE memory-controller.ts:186 is `void this.graph.onMemoryStored(...)` —
      // fire-and-forget. The edge is therefore eventually consistent and this
      // case polls rather than asserting on the first read.
      const anchorContent = `EB-MEM-2 anchor terraform state locking ${RUN_STAMP}`;
      const anchor = await httpPost<any>("/api/v1/memory/store", {
        content: anchorContent,
        type: "decision",
        importance: 0.7,
        projectId: PID,
        format: "json",
      });
      expect(anchor?.success).toBe(true);
      const anchorId: string = anchor?.data?.memoryId ?? anchor?.data?.id;
      expect(typeof anchorId).toBe("string");

      const linkedContent = `EB-MEM-2 linked terraform backend migration ${RUN_STAMP}`;
      const linked = await httpPost<any>("/api/v1/memory/store", {
        content: linkedContent,
        type: "decision",
        importance: 0.7,
        projectId: PID,
        linkTo: [anchorId],
        format: "json",
      });
      expect(linked?.success).toBe(true);
      const linkedId: string = linked?.data?.memoryId ?? linked?.data?.id;
      expect(typeof linkedId).toBe("string");

      const recallArgs = {
        query: "terraform backend migration",
        projectId: PID,
        limit: 10,
        minImportance: 0,
        includeRelated: true,
        format: "json" as const,
      };

      let withRelated: any = null;
      const sawEdge = await pollUntil(
        async () => {
          const res = await httpPost<any>("/api/v1/memory/search", recallArgs);
          const hit = (res?.data?.memories ?? []).find((m: any) => m.id === linkedId);
          if (hit?.relatedContext) {
            withRelated = hit;
            return true;
          }
          return false;
        },
        { timeoutMs: 60_000, intervalMs: 2_000 },
      );

      expect(sawEdge).toBe(true);
      expect(typeof withRelated?.relatedContext).toBe("string");
      expect(String(withRelated.relatedContext).length).toBeGreaterThan(0);

      // Negative control: the SAME query WITHOUT includeRelated must not carry
      // the field, or `relatedContext` is unconditional decoration rather than
      // evidence of an edge.
      const withoutRelated = await httpPost<any>("/api/v1/memory/search", {
        ...recallArgs,
        includeRelated: false,
      });
      const plainHit = (withoutRelated?.data?.memories ?? []).find(
        (m: any) => m.id === linkedId,
      );
      expect(plainHit).toBeDefined();
      expect(plainHit.relatedContext).toBeUndefined();
    },
    300_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-EXEC-1..3 — separating two refusals that 19.web-exec conflates
// ═══════════════════════════════════════════════════════════════════════════
//
// Endpoints:
//   POST /api/v1/executor/execute      — apps/tools-api/src/routes/executor.ts:39
//   POST /api/v1/executor/execute_file — apps/tools-api/src/routes/executor.ts:73

async function execute(body: Record<string, unknown>): Promise<any> {
  return httpPost<any>("/api/v1/executor/execute", body);
}
async function executeFile(body: Record<string, unknown>): Promise<any> {
  return httpPost<any>("/api/v1/executor/execute_file", body);
}

describe.skipIf(!READY)("EB-EXEC — boundary vs deny-glob vs timeout", () => {
  test(
    "EB-EXEC-1: an out-of-root path is refused by the BOUNDARY, naming the project root",
    async () => {
      // Provenance: 19.web-exec.test.ts:444-462 (EX4) is titled "DENY-GLOB" and
      // its own comment at 19:447-449 admits the conflation — "/etc/passwd is
      // outside the project root AND a sensitive file. The executor's boundary +
      // deny-glob guard returns a 'Blocked:' stderr". It then asserts only
      // `startsWith("Blocked:")`, which BOTH refusals satisfy, so it cannot tell
      // which guard fired — and in fact only the boundary can, because
      // `passwd` is not in DENY_PATH_PATTERNS
      // (packages/core/src/services/executor/executor.ts:106-121).
      //
      // The two literals are distinct:
      //   boundary  executor.ts:363 — 'resolves outside the project root'
      //   deny-glob executor.ts:380 — 'matches a deny-listed pattern (secrets/credentials)'
      // and the boundary is checked FIRST (executor.ts:359-372 before :377-386).
      const r = await executeFile({
        path: "/etc/passwd",
        language: "shell",
        code: 'echo "$FILE_CONTENT"',
      });
      expect(r?.success).toBe(false);
      expect(typeof r?.error).toBe("string");
      expect(String(r.error).startsWith("Blocked:")).toBe(true);
      expect(String(r.error)).toContain("resolves outside the project root");
      // And NOT the other refusal — this is the separation EX4 cannot make.
      expect(String(r.error)).not.toContain("deny-listed pattern");
    },
    60_000,
  );

  test(
    "EB-EXEC-2: an IN-root secrets path is refused by the DENY-GLOB, not the boundary",
    async () => {
      // `.env` is a DENY_PATH_PATTERNS entry (executor.ts:112) and a RELATIVE
      // path, so `resolve(root, ".env")` lands strictly inside the project root
      // whatever that root is (it is `process.cwd()` of the API process —
      // executor.ts:260, and ExecutorController constructs the executor with no
      // projectRoot at executor-controller.ts:79). The boundary check therefore
      // passes and the deny-glob is the ONLY guard that can fire.
      //
      // The file need not exist: realpathSync failure falls back to the lexical
      // absolute path (executor.ts:344-350), and matchesDenyPattern is applied to
      // that lexical path at executor.ts:377.
      const r = await executeFile({
        path: ".env",
        language: "shell",
        code: 'echo "$FILE_CONTENT"',
      });
      expect(r?.success).toBe(false);
      expect(typeof r?.error).toBe("string");
      expect(String(r.error).startsWith("Blocked:")).toBe(true);
      expect(String(r.error)).toContain("matches a deny-listed pattern (secrets/credentials)");
      expect(String(r.error)).not.toContain("resolves outside the project root");
    },
    60_000,
  );

  test(
    "EB-EXEC-2b: a symlink inside the root that escapes it is refused (realpath defense)",
    async () => {
      // `symlink` has ZERO occurrences in 19.web-exec.test.ts (verified by a
      // case-insensitive scan of that file), so the defense documented at
      // executor.ts:323-331 and implemented by the realpathSync pair at
      // executor.ts:344 + :352 has no executed coverage anywhere.
      //
      // Without those two calls the link path is lexically under the root and
      // matches no deny pattern, so BOTH guards pass and readFileSync follows the
      // link out of the project. This case is the only thing that can tell the
      // difference.
      //
      // Gated on OWNED: it writes one dot-prefixed file into the API's own cwd,
      // which is only ever done against the dedicated stack this feature owns.
      expect(OWNED).toBe(true);

      // Discover the root from the product itself rather than assuming it:
      // `execute` with no `cwd` runs in `#projectRootResolver()`
      // (executor.ts:308) and the controller echoes it back as `data.cwd`
      // (executor-controller.ts:~124).
      const probe = await execute({ language: "shell", code: "pwd" });
      expect(probe?.success).toBe(true);
      const root: string = String(probe?.data?.cwd ?? "").trim();
      expect(root.length).toBeGreaterThan(0);

      const linkName = `.e2e-link-${RUN_STAMP}`;
      const linkPath = path.join(root, linkName);
      // /etc/hosts is outside any plausible project root and matches no
      // DENY_PATH_PATTERNS entry, so ONLY the realpath boundary can refuse it.
      const target = "/etc/hosts";

      try {
        await symlink(target, linkPath);
        const r = await executeFile({
          path: linkName,
          language: "shell",
          code: 'echo "$FILE_CONTENT"',
        });
        expect(r?.success).toBe(false);
        expect(String(r?.error).startsWith("Blocked:")).toBe(true);
        expect(String(r?.error)).toContain("resolves outside the project root");
      } finally {
        await unlink(linkPath).catch(() => {});
      }
    },
    90_000,
  );

  test(
    "EB-EXEC-3: an over-budget command times out instead of hanging the request",
    async () => {
      // Provenance: 19.web-exec.test.ts:23-25 puts the timeout out of scope
      // ("background detach on timeout"), so the executor's central liveness
      // contract has no E2E coverage. `timeout` is a real request field
      // (apps/tools-api/src/routes/executor.ts:47-51), clamped by #clampTimeout
      // (executor.ts:392-398) under MAX_TIMEOUT_MS (executor.ts:87); the default
      // is DEFAULT_TIMEOUT_MS = 30_000 (executor.ts:86).
      //
      // On timeout the process group is killed (killTree, executor.ts:483-508)
      // and the result is a NORMAL envelope carrying `timedOut: true` and
      // `exitCode: null` (executor.ts:539-540) — not a thrown error, not a hang.
      // `success` is false because ok = !timedOut && exitCode === 0
      // (executor-controller.ts:115).
      const started = Date.now();
      const r = await execute({
        language: "shell",
        code: "sleep 20",
        timeout: 2000,
      });
      const elapsed = Date.now() - started;

      expect(r?.success).toBe(false);
      expect(r?.data?.timedOut).toBe(true);
      expect(r?.data?.exitCode).toBeNull();
      // The request returned; it did not ride the 20 s sleep to completion.
      // Generous upper bound so a loaded box cannot flake this, but far below
      // the 20 s the command would have taken unkilled.
      expect(elapsed).toBeLessThan(15_000);
      // background defaults to false (routes/executor.ts body schema), so this
      // must NOT be the detach path (executor.ts:495-504).
      expect(r?.data?.backgrounded).toBe(false);
      console.log(`[EB-EXEC-3] timeout observed after ${elapsed} ms`);
    },
    60_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-MCP-1..3 — protocol hygiene, pagination, and transport parity
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!MCP_READY)("EB-MCP — stdout hygiene, cursor, embedded parity", () => {
  test(
    "EB-MCP-1: every byte the MCP server writes to stdout is JSON-RPC",
    async () => {
      // Provenance: 00.harness.smoke.test.ts:73-87 pins the strict 59-tool set
      // but asserts nothing about the CHANNEL. A single stray stdout write
      // breaks the transport with "connection closed: initialize response"; the
      // logger routes every level to stderr for exactly this reason
      // (packages/shared/src/utils/logger.ts:158, `console.error(line)`), and
      // apps/mcp-client/src/__tests__/mcp-stdout-clean.test.ts guards it — but
      // only in-process, never against the built dist that hosts actually spawn.
      //
      // This drives the REAL dist over a raw pipe so a banner, a dotenv notice,
      // or a console.log from any transitively imported module is caught.
      expect(MCP_BIN).toBeTruthy();

      const child = spawn("bun", [MCP_BIN!], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, MASSA_AI_API_URL: API } as NodeJS.ProcessEnv,
      });

      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (c: string) => {
        stdout += c;
      });
      child.stderr.on("data", (c: string) => {
        stderr += c;
      });

      const send = (msg: unknown) => child.stdin.write(JSON.stringify(msg) + "\n");

      try {
        send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "eb-mcp-1", version: "1.0.0" },
          },
        });
        // Wait for the initialize response specifically, not a fixed sleep.
        const gotInit = await pollUntil(
          async () => stdout.includes('"id":1'),
          { timeoutMs: 60_000, intervalMs: 250 },
        );
        expect(gotInit).toBe(true);

        send({ jsonrpc: "2.0", method: "notifications/initialized" });
        send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
        const gotList = await pollUntil(async () => stdout.includes('"id":2'), {
          timeoutMs: 60_000,
          intervalMs: 250,
        });
        expect(gotList).toBe(true);
      } finally {
        child.kill("SIGTERM");
      }

      const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      const offenders: string[] = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed?.jsonrpc !== "2.0") offenders.push(line.slice(0, 200));
        } catch {
          offenders.push(line.slice(0, 200));
        }
      }
      if (offenders.length > 0) {
        console.log(`[EB-MCP-1] stderr (context): ${stderr.slice(0, 500)}`);
      }
      expect(offenders).toEqual([]);
    },
    150_000,
  );

  test(
    "EB-MCP-2: tools/list returns one full page with no nextCursor, and rejects a bad cursor",
    async () => {
      // Provenance: _mcp.ts:48 calls `client.listTools()` and reads only
      // `list.tools`, never `nextCursor`. Paging is real, not a stub:
      // apps/mcp-client/src/tool-discovery.ts:67-86 slices the registry and
      // returns an encoded cursor whenever nextOffset < tools.length, with
      // TOOL_DISCOVERY_PAGE_SIZE = 100 (tool-discovery.ts:5). The handler is
      // wired at apps/mcp-client/src/index.ts:181/188.
      //
      // With 59 tools a second page is unreachable (declared skip #5 in the
      // header). The two reachable contracts are asserted instead.
      expect(mcp).not.toBeNull();
      const first: any = await mcp!.client.listTools();
      expect(Array.isArray(first?.tools)).toBe(true);
      expect(first.tools.length).toBe(mcp!.toolNames.length);
      // One page holds the whole registry, so there is nothing to continue with.
      expect(first.nextCursor).toBeUndefined();
      expect(first.tools.length).toBeLessThanOrEqual(100);

      // A cursor the server did not mint must be REFUSED, not ignored — the
      // fingerprint check at tool-discovery.ts:44-65 throws McpError
      // "Invalid or stale tools cursor" (tool-discovery.ts:36). Silently
      // returning page 1 for a stale cursor is the failure this guards.
      let rejected = false;
      let message = "";
      try {
        await mcp!.client.listTools({ cursor: "eb-mcp-2-not-a-real-cursor" });
      } catch (e: any) {
        rejected = true;
        message = String(e?.message ?? e);
      }
      expect(rejected).toBe(true);
      expect(message).toContain("cursor");
    },
    60_000,
  );

  test(
    "EB-MCP-3: the embedded client answers identically to the HTTP client",
    async () => {
      // Provenance: embedded-vs-HTTP parity does not exist anywhere in the E2E
      // suite. `MASSA_AI_EMBEDDED === "true"` selects EmbeddedApiClient
      // (apps/mcp-client/src/index.ts:142, selection at :165-171), and
      // apps/mcp-client/src/embedded-api-client.ts:10-16 states the mapping
      // "mirrors the tools-api REST routes exactly so a tool call yields the
      // same result shape in both modes (parity contract, T19)". That contract
      // has unit coverage and zero live-stack coverage.
      expect(mcp).not.toBeNull();

      let embedded: McpHandle | null = null;
      try {
        embedded = await startMcp({ MASSA_AI_EMBEDDED: "true" });

        // 1. The advertised roster must be identical — an embedded build that
        //    drops a tool is the exact regression the OpenCode MCP skip caused.
        expect([...embedded.toolNames].sort()).toEqual([...mcp!.toolNames].sort());

        // 2. A read-only tool must produce an equivalent envelope. list_projects
        //    is bucket C (no format param, always JSON), the same tool
        //    00.harness.smoke.test.ts:89-95 uses for its HTTP matrix.
        const viaHttpMcp = await mcpCall(mcp!.client, "list_projects", { status: "all" });
        const viaEmbedded = await mcpCall(embedded.client, "list_projects", {
          status: "all",
        });
        // KNOWN RED — a real parity break, kept rather than masked. Measured:
        //   http (MCP over REST): {"success":true,"data":{"total":26}}
        //   mcp  (embedded):      {"success":true,"data":{"total":26,"filter":"all"}}
        // Same tool, same arguments, two transports, two shapes. The mechanism is
        // that the two modes reach different code: embedded delegates to the core
        // tool, `listProjectsTool().handle({status})`
        // (apps/mcp-client/src/embedded-api-client.ts:463-464), and that tool's
        // envelope carries `filter`; the REST route hand-rolls its own projection
        // and never emits it (apps/tools-api/src/routes/workspace.ts:110-128).
        // Which side is wrong is a product decision — the route could delegate to
        // the tool, or the tool's extra field could be dropped from the mapping —
        // but the divergence itself contradicts the stated contract at
        // embedded-api-client.ts:10-16, that the mapping "mirrors the tools-api
        // REST routes exactly so a tool call yields the same result shape in both
        // modes (parity contract, T19)".
        //
        // Adding `filter` to dropKeys would make this green and delete the only
        // sensor for the class, so it stays red until the product picks a side.
        assertMatrix(
          viaHttpMcp,
          viaEmbedded,
          { dropKeys: ["workspaces"] },
          "EB-MCP-3 list_projects embedded≡http",
        );

        // 3. And against the REST route itself, closing the triangle.
        const viaRest = await httpGet<any>("/api/v1/workspace/list");
        assertMatrix(
          viaRest,
          viaEmbedded,
          { dropKeys: ["workspaces"] },
          "EB-MCP-3 list_projects embedded≡REST",
        );
      } finally {
        if (embedded) {
          try {
            await embedded.stop();
          } catch {
            /* ignore */
          }
        }
      }
    },
    240_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-IDX-1 — the parser-readiness gate
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!READY)("EB-IDX — parser readiness gates indexing", () => {
  test(
    "EB-IDX-1: readiness is reported on the wire and a ready parser admits an index",
    async () => {
      // GET /health — apps/tools-api/src/index.ts:166,
      //   `buildHealthResponse(getParserReadiness())`; shape at
      //   apps/tools-api/src/health.ts:12-23.
      // The gate itself: assertParserReadyForIndexing() at
      //   packages/core/src/tools/index_project.ts:95, throwing
      //   ParserReadinessError (services/structural/parser-readiness.ts:29-37).
      // The negative half is a declared skip (#2 in the header): forcing
      // not-ready means removing native grammars from the shared stack.
      const health = await httpGet<any>("/health");
      expect(health?.status).toBe("ok");
      expect(health?.parser).toBeDefined();
      expect(typeof health.parser.status).toBe("string");
      // The four documented states; anything else is drift in health.ts.
      expect(["pending", "validating", "ready", "failed"]).toContain(health.parser.status);
      expect(health.parser.status).toBe("ready");
      // `requiredExtensions` and `validatedExtensions` are COUNTS, not lists —
      // ParserReadinessSnapshot (services/structural/parser-readiness.ts:21-27)
      // declares both as numbers. Asserting Array.isArray here read `false` on a
      // stack whose parser was demonstrably ready (25.observability asserts
      // `status === "ready"` with a full validated count against the same API
      // minutes earlier), so this was the test's shape being wrong, not the
      // product's.
      expect(Number.isInteger(health.parser.requiredExtensions)).toBe(true);
      expect(Number.isInteger(health.parser.validatedExtensions)).toBe(true);
      expect(health.parser.requiredExtensions).toBeGreaterThan(0);
      // Ready means every required extension actually validated. A "ready"
      // status with a short validated count is the silent degradation this
      // asserts against (the invariant runValidation establishes at
      // parser-readiness.ts:178-184).
      expect(health.parser.validatedExtensions).toBe(health.parser.requiredExtensions);
      expect(health.parser.errors ?? []).toEqual([]);

      // And the gate admits: with a ready parser, an index of the polyglot
      // fixture starts rather than being refused for PARSER_NOT_READY.
      const idxPid = `${PREFIX}idx-${RUN_STAMP}`;
      assertE2ePrefix(idxPid);
      const started = await httpPost<any>("/api/v1/project/index", {
        projectPath: path.join(
          DEFAULT_PROJECT_PATH,
          "packages/core/src/__tests__/e2e/fixtures/polyglot",
        ),
        projectId: idxPid,
        forceReindex: true,
      });
      try {
        // index_project.ts:180-183 wraps a thrown ParserReadinessError as
        // `success:false, error:"Failed to start indexing: …"`. A ready parser
        // must not produce that.
        expect(String(started?.error ?? "")).not.toContain("Structural parser is not ready");
        expect(started?.success).toBe(true);
      } finally {
        await resetProject(idxPid).catch(() => {});
      }
    },
    300_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-TOOL-1 — every advertised tool answers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tools this case does NOT call, each with its reason. The partition assertion
 * below requires CALLED ∪ NOT_CALLED to equal the advertised roster EXACTLY, so
 * a tool added upstream cannot slip into neither set and read as covered.
 */
const NOT_CALLED: Record<string, string> = {
  // Mutates machine state outside the e2e prefix.
  profile_set: "rewrites the installed agent files on this machine (host-wide mutation)",
  reset_project: "destructive; exercised under its own prefix guard in 11.lifecycle",
  rename_project: "renames a workspace; not prefix-reversible from a read probe",
  merge_projects: "merges two workspaces destructively",
  reindex: "full re-index of a workspace; cost and shared-stack contention",
  index: "starts a real index job; covered by EB-IDX-1 and 02.indexing",
  // Reach the network or a live model.
  fetch_and_index: "performs a real outbound HTTP fetch (SSRF surface, 19.web-exec owns it)",
  bootstrap: "runs an LLM seed step; belongs to 30.llm-features under RUN_E2E_LLM",
  // Require an argument this suite has not established from source.
  index_status: "requires a jobId minted by a live index job",
  restore_checkpoint: "requires a checkpointId and mutates workspace state",
  approve_proposal: "requires a proposalId and mutates proposal state",
  reject_proposal: "requires a proposalId and mutates proposal state",
  update_proposal: "requires a proposalId",
  delete_proposal: "requires a proposalId",
  handoff_accept: "requires a handoffId",
  handoff_cancel: "requires a handoffId",
  handoff_update: "requires a handoffId",
  handoff_delete: "requires a handoffId",
  memory_update: "requires a memoryId; covered by 05.memory E14/matrix",
  memory_delete: "requires a memoryId; covered by 05.memory",
  synapse_get: "requires a sessionId",
  synapse_update: "requires a sessionId",
  synapse_end: "requires a sessionId",
  synapse_prime: "requires a sessionId",
  synapse_access: "requires a sessionId",
  synapse_prefetch: "requires a sessionId",
  synapse_task_end: "requires a taskId",
  execute: "covered with verified args by EB-EXEC-3 above",
  execute_file: "covered with verified args by EB-EXEC-1/2/2b above",
  batch_execute: "covered by 19.web-exec EX5/EX6/EX7",
  // Named by the total-partition assertion on the first live run: each has
  // required fields, so none could be called with {}, and each writes state
  // that a read probe must not create on a shared stack.
  create_checkpoint: "requires taskId+description and CREATES a checkpoint row; 06.checkpoints owns the lifecycle",
  create_proposal: "requires projectId+kind+payload and CREATES a proposal; 28.hooks-handoffs-proposals owns EB-AI-3",
  handoff_begin: "requires projectId and OPENS a handoff; 28.hooks-handoffs-proposals owns EB-HO-1",
  hook_ingest: "requires event+projectId+payload and WRITES a captured event; 28 owns EB-HOOK-1",
  compact_snapshot: "requires a sessionId minted by a hook batch; 28 owns EB-HOOK-3a end to end",
  synapse_task_begin: "requires an id from an existing synapse session; 10.synapse owns the task envelope",
};

describe.skipIf(!MCP_READY)("EB-TOOL — every advertised tool answers", () => {
  test(
    "EB-TOOL-1: the roster partitions exactly, and every called tool returns a non-error envelope",
    async () => {
      // Provenance: 00.harness.smoke.test.ts:73-87 proves the 59 NAMES are
      // advertised. It never calls them, so a tool whose proxy mapping is broken
      // — the exact failure class BUG-SYN-1..4 were (10.synapse.test.ts:18-26) —
      // is invisible to that assertion.
      //
      // Arguments are only ever taken from a source-verified schema; nothing is
      // invented. Two admission rules:
      //   (a) a tool whose advertised inputSchema declares no `required` entries
      //       is called with {} — it must accept that by its own contract;
      //   (b) a tool in VERIFIED_ARGS is called with fields read from the route
      //       schema cited beside it.
      // Everything else is in NOT_CALLED with a reason.
      expect(mcp).not.toBeNull();

      const VERIFIED_ARGS: Record<string, Record<string, unknown>> = {
        // routes/search.ts:62-99
        search: { query: "vector store", projectId: SHARED_PID, maxResults: 3, format: "json" },
        // routes/memory.ts:90-116
        remember: {
          content: `EB-TOOL-1 probe ${RUN_STAMP}`,
          type: "code",
          importance: 0.4,
          projectId: PID,
          format: "json",
        },
        // routes/memory.ts:140-165
        recall: {
          query: "EB-TOOL-1 probe",
          projectId: PID,
          limit: 3,
          minImportance: 0,
          format: "json",
        },
        // routes/memory.ts:283-309
        memory_list: { projectId: PID, limit: 5, offset: 0 },
        // 00.harness.smoke.test.ts:91
        list_projects: { status: "all" },
        // routes/synapse.ts:75-87 (agentId is the only required field)
        synapse_session: {
          agentId: `eb-tool-1-${RUN_STAMP}`,
          workspaceId: PID,
          taskContext: "EB-TOOL-1 probe",
        },

        // ── Read-only tools whose required fields were missing from the first
        //    draft of this table. The first live run named all of them through
        //    the total-partition assertion, which is the assertion working: they
        //    were in neither `called` nor NOT_CALLED. Every field below is read
        //    from the advertised inputSchema in
        //    apps/mcp-client/src/tool-defs/tool-defs-*.ts, and every value is a
        //    real object on this stack — SHARED_PID is the fixture's own index,
        //    the file paths are `git ls-files` entries of the fixture at
        //    788facbd, and the seed symbols are the ones SHARED_PROBE_QUERIES
        //    already relies on.
        // tool-defs-project.ts — analytics, required ["type"]
        analytics: { type: "summary" },
        // tool-defs-project.ts — get_architecture, required ["id"]; `id` IS the
        // project id (endpoint /api/v1/project/:id/architecture).
        get_architecture: { id: SHARED_PID },
        // tool-defs-project.ts — project_map, required ["id"], same aliasing.
        project_map: { id: SHARED_PID, centralityLimit: 5, recentLimit: 5 },
        // tool-defs-project.ts — read_file, required ["filePath"]
        read_file: {
          filePath: "packages/core/src/services/symbol/centrality.ts",
          projectId: SHARED_PID,
          lineStart: 1,
          lineEnd: 20,
        },
        // tool-defs-search.ts — search_definitions, required ["projectId"]
        search_definitions: { projectId: SHARED_PID, search: "compute", limit: 5 },
        // tool-defs-search.ts — symbol_snippet, required ["projectId", "file"]
        symbol_snippet: {
          projectId: SHARED_PID,
          file: "packages/core/src/services/symbol/centrality.ts",
          lineStart: 1,
          lineEnd: 20,
        },
        // tool-defs-search.ts — trace_path, required ["projectId"], and the
        // description makes a seed mandatory in practice: "Requires a seed:
        // supply exactly one of function_name, symbol, or qualifiedName".
        trace_path: { projectId: SHARED_PID, function_name: "computePageRank", mode: "calls" },
        // tool-defs-search.ts — get_references / go_to_definition, required
        // ["projectId", "symbolName"]
        get_references: { projectId: SHARED_PID, symbolName: "computePageRank" },
        go_to_definition: { projectId: SHARED_PID, symbolName: "computePageRank" },
        // tool-defs-search.ts — impact_analysis, required ["projectId","projectPath"]
        impact_analysis: { projectId: SHARED_PID, projectPath: PROJECT_PATH },
        // tool-defs-memory.ts — optimized_context, required ["query","projectId"]
        optimized_context: {
          query: "page rank centrality",
          projectId: SHARED_PID,
          maxTokens: 1000,
          maxResults: 3,
        },
        // tool-defs-memory.ts — compress, required ["content"]
        compress: { content: `EB-TOOL-1 compress probe ${RUN_STAMP}` },
        // tool-defs-handoff.ts — handoff_list_pending / list_proposals, required
        // ["projectId"]. Read-only listings scoped to this suite's own prefix.
        handoff_list_pending: { projectId: PID },
        list_proposals: { projectId: PID },
      };

      const advertised = [...mcp!.toolNames].sort();
      const called: string[] = [];
      const failures: string[] = [];

      const schemaByName = new Map<string, any>();
      const list: any = await mcp!.client.listTools();
      for (const t of list.tools) schemaByName.set(t.name, t.inputSchema);

      for (const name of advertised) {
        if (name in NOT_CALLED) continue;
        const schema = schemaByName.get(name);
        const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
        let args: Record<string, unknown> | null = null;
        if (name in VERIFIED_ARGS) {
          args = VERIFIED_ARGS[name]!;
        } else if (required.length === 0) {
          args = {};
        }
        if (args === null) {
          failures.push(
            `${name}: requires [${required.join(", ")}] but has neither a verified arg set nor a NOT_CALLED reason`,
          );
          continue;
        }
        called.push(name);
        try {
          const res = await mcp!.client.callTool(
            { name, arguments: args },
            undefined,
            { timeout: 150_000 },
          );
          // A protocol-level error surfaces as isError; the proxy's own failures
          // surface as {success:false} inside the parsed payload.
          if ((res as any)?.isError === true) {
            failures.push(
              `${name}: isError envelope — ${String((res as any)?.content?.[0]?.text ?? "").slice(0, 200)}`,
            );
            continue;
          }
          const text = (res as any)?.content?.[0]?.text ?? "";
          expect(typeof text).toBe("string");
          let payload: any = text;
          try {
            payload = JSON.parse(text);
          } catch {
            /* bare TOON string is a valid envelope — index.ts:178-187 */
          }
          if (payload && typeof payload === "object" && payload.success === false) {
            failures.push(`${name}: success:false — ${String(payload.error).slice(0, 200)}`);
          }
        } catch (e: any) {
          failures.push(`${name}: threw — ${String(e?.message ?? e).slice(0, 200)}`);
        }
      }

      // 1. Total partition. Every advertised name is either called or has a
      //    written reason — a new tool cannot land in neither.
      const accountedFor = new Set([...called, ...Object.keys(NOT_CALLED)]);
      const unaccounted = advertised.filter((n) => !accountedFor.has(n));
      expect(unaccounted).toEqual([]);
      // 2. And no NOT_CALLED entry may name a tool that no longer exists, which
      //    is how an exclusion list silently grows to cover the whole roster.
      const stale = Object.keys(NOT_CALLED).filter((n) => !advertised.includes(n));
      expect(stale).toEqual([]);
      // 3. The called set must be a real majority of the roster, or "every tool
      //    answers" has been reduced to "a handful answer".
      expect(called.length).toBeGreaterThanOrEqual(20);

      console.log(
        `[EB-TOOL-1] advertised=${advertised.length} called=${called.length} ` +
          `declared-skips=${Object.keys(NOT_CALLED).length} failures=${failures.length}`,
      );
      expect(failures).toEqual([]);
    },
    600_000,
  );
});
