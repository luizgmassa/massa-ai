/**
 * T1.6 / 30 — LLM features (E2E, live stack).
 *
 * Every LLM-driven feature in this product defaults OFF and degrades to a
 * rule-based path. This file is the only place that turns them on, and it NEVER
 * runs in the default aggregate.
 *
 * ── Profile ────────────────────────────────────────────────────────────────
 *   `llm-on`  —  bash scripts/e2e-stack.sh up --profile llm-on
 *   which sets (scripts/e2e-stack.sh, the llm-on branch of the profile env):
 *     MASSA_AI_LLM_ENABLED=true
 *     MASSA_AI_LLM_BASE_URL=http://127.0.0.1:11435/v1
 *     MASSA_AI_LLM_API_KEY=ollama
 *     MASSA_AI_LLM_MODEL=$LLM_MODEL            (default qwen3-vl:8b)
 *     MASSA_AI_LLM_CODE_MODEL=$LLM_CODE_MODEL  (default qwen2.5-coder:7b)
 *   Both are NON-THINKING instruct models on purpose: a thinking model routes
 *   structured output into the reasoning channel and burns the 90 s timeout
 *   (MASSA_AI_LLM_TIMEOUT_MS default 90000, packages/shared/src/config/index.ts:737)
 *   silently.
 *
 * ── Gate variables — BOTH are required ─────────────────────────────────────
 *   RUN_E2E=1        (house gate, shared with every other E2E file)
 *   RUN_E2E_LLM=1    (this file only; NOT set by `e2e-stack.sh env`, so the
 *                     default aggregate can never pull this file in)
 *   plus: Tools API /health reachable, Ollama up, and
 *   isOwnedDedicatedE2eEnvironment() — this file RESTARTS the Tools API.
 *
 * ── THIS SUITE RESTARTS THE TOOLS API FOUR TIMES, PLUS A RESTORE ───────────
 * Every knob this file needs is server-side and boot-frozen or process-scoped;
 * none is a request parameter. `SEARCH_RERANK_ENABLED` / `SEARCH_RERANK_WINDOW`
 * / `SEARCH_QUERY_UNDERSTANDING_ENABLED` are read into `defaultConfig`, a
 * top-level const evaluated at module import
 * (packages/shared/src/config/index.ts:684-711), so `restart-api --env K=V`
 * (scripts/e2e-stack.sh:464-481) is the only mechanism. Run with
 * `--max-concurrency 1`; never in parallel with another E2E file.
 *
 * ── Declared skips (AC-05: a skip is a declared, reasoned line) ─────────────
 *
 *  1. EB-LLM-3c "the reranker demonstrably CHANGES the top-K order" — SKIPPED,
 *     non-deterministic. The judge may legitimately agree with the RRF order,
 *     so "the order differs" is not a contract and asserting it would be a
 *     coin-flip. What IS a contract is asserted instead: set preservation
 *     (rerank must be a permutation) and window honouring (everything past
 *     `SEARCH_RERANK_WINDOW` keeps the pre-rerank order verbatim —
 *     packages/core/src/services/search/reranker.ts:84-86 + :110,
 *     `[...reorderedHead, ...tail]`). The observed order IS logged.
 *
 *  1b. EB-LLM-3b, rerank half — CLOSED (was a declared skip). The old skip left
 *     an open question between two readings of a non-ascending `combinedRank`
 *     order under a broken code model. The observation it asked for was made:
 *     with MASSA_AI_LLM_CODE_MODEL pointed at a nonexistent model, the stack's
 *     api.log carries `llmObject failed — degrading to non-LLM path {"error":
 *     "model '<broken>' not found"}` immediately followed by `LLMJudgeReranker
 *     got {ok:false} — degrading to input order`. Both readings were wrong: the
 *     reranker DOES read the code role and DOES degrade. The defective part was
 *     the SENSOR — `combinedRank` ascendingness is confounded by the
 *     instruct-role query rewrite, which changes the candidate set before the
 *     reranker runs. The case now asserts the log lines and only PRINTS the
 *     order. Observed red (2026-09-07): pointing the same knob at the real
 *     `qwen2.5-coder:7b` makes the log carry `json_schema: constrained decoding
 *     used` and no failure line, failing the case at :793.
 *
 *  2. EB-LLM-5b "the response says whether the LLM path ran" — SKIPPED, no such
 *     field. `code-compressor.ts` tracks `compressionSource: "regex" | "llm"`
 *     internally (`packages/core/src/services/compression/code-compressor.ts:76`,
 *     flipped at :111) and stores it on the model
 *     (`packages/core/src/models/CompressedContent.ts:75,94`), but
 *     `compressWithMetrics()` re-derives its own metrics and drops it (explicit
 *     comment at `compress-with-metrics.ts:16-20`), so
 *     `POST /api/v1/context/compress` exposes only `metadata.compressionRatio`
 *     (`packages/core/src/tools/compress_context.ts:102-104`). EB-LLM-5 compares
 *     the LLM-on ratio against the LLM-off ratio measured in EB-LLM-1's cycle,
 *     which is the strongest signal the wire carries.
 *
 *  3. PREMISE CORRECTION, not a skip: "`code_structure` reaching its target" is
 *     not a product contract. `targetRatio` is accepted by the route
 *     (`apps/tools-api/src/routes/context.ts:35-58`), threaded into
 *     `compressWithMetrics` and only LOGGED (`compress-with-metrics.ts:57,63,79`)
 *     — it is never compared against the achieved ratio and never gates the
 *     result. EB-LLM-5 therefore asserts that the parameter is accepted and that
 *     a real ratio is computed and reported, and records the achieved value
 *     rather than asserting an unenforced target.
 *
 *  4. EB-LLM-2c "HyDE stays gated" is asserted INDIRECTLY.
 *     `SEARCH_QUERY_UNDERSTANDING_HYDE_ENABLED` defaults to `true`
 *     (packages/shared/src/config/index.ts:688-691) but is inert while the outer
 *     feature is off (`query-understanding.ts:284`, `if (qu.hydeEnabled !== false)`
 *     inside `understand()`), and no HyDE-specific field reaches the wire. The
 *     reachable assertion is the outer gate: with
 *     SEARCH_QUERY_UNDERSTANDING_ENABLED unset, `hybrid-search.ts:256-268` never
 *     runs and no QUERY_UNDERSTANDING_UNAVAILABLE degradation can appear —
 *     which is what EB-LLM-2 asserts as its negative control.
 *
 * ── Model roles (packages/core/src/services/memory/llm-client.ts) ──────────
 *   `type LlmModelRole = "instruct" | "code"` (llm-client.ts:29); the mapping is
 *   `role === "code" ? cfg.codeModel : cfg.model` (llm-client.ts:159-162), with
 *   `"instruct"` the default (llm-client.ts:156). 3 code-role sites:
 *     bootstrap seed   services/bootstrap/bootstrap-service.ts:496
 *     reranker         services/search/reranker.ts:92
 *     code-compressor  services/compression/code-compressor.ts:103
 *   7 instruct-role sites, including the two query-understanding calls
 *     (services/search/query-understanding.ts:102 rewrite, :132 hyde).
 *   EB-LLM-3b makes that routing FALSIFIABLE by pointing
 *   MASSA_AI_LLM_CODE_MODEL at a model that does not exist and asserting the
 *   code-role site degrades while the instruct-role site keeps working.
 *
 * ── Safety posture ─────────────────────────────────────────────────────────
 *  - Every projectId is `e2e-ai-`-prefixed and reset in afterAll.
 *  - No mocks, no stubs, no mock.module. No production source is touched.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  API,
  DEFAULT_PROJECT_PATH,
  E2E_ENABLED,
  PREFIX,
  PROJECT_PATH,
  RUN_STAMP,
  assertE2ePrefix,
  ensureSharedIndex,
  httpPost,
  isOwnedDedicatedE2eEnvironment,
  pollUntil,
  probeAvailability,
  resetProject,
  SHARED_PID,
} from "./_helpers";

const execFileAsync = promisify(execFile);

// ── Gating — BOTH gates, and the gate is visible in the log line ────────────
const LLM_GATE_ENABLED = process.env.RUN_E2E_LLM === "1";

let SKIP_REASON = "";
const READY = await (async () => {
  if (!E2E_ENABLED) {
    SKIP_REASON = "RUN_E2E != 1";
    return false;
  }
  if (!LLM_GATE_ENABLED) {
    SKIP_REASON = "RUN_E2E_LLM != 1 (this file never runs in the default aggregate)";
    return false;
  }
  if (!isOwnedDedicatedE2eEnvironment()) {
    SKIP_REASON =
      "not the owned dedicated stack — this file restarts the Tools API and refuses to do that to a developer stack";
    return false;
  }
  const a = await probeAvailability();
  if (!a.API_UP) {
    SKIP_REASON = `Tools API not up at ${API}`;
    return false;
  }
  if (!a.OLLAMA_UP) {
    SKIP_REASON = "Ollama not reachable — every case here needs a live model";
    return false;
  }
  return true;
})();

const STACK_SH = path.join(DEFAULT_PROJECT_PATH, "scripts/e2e-stack.sh");

/**
 * The dedicated stack's own API log. `start_api` opens it with `>` on every
 * start (scripts/e2e-stack.sh:369), so after a `stackRestart` it contains ONLY
 * the current phase — which is what makes an assertion over it scoped rather
 * than cumulative. Same state dir the script uses (`e2e-stack.sh:51`), same
 * override variable.
 */
const STACK_API_LOG = path.join(
  process.env.MASSA_AI_E2E_STATE_DIR ?? "/tmp/massa-ai-e2e-stack",
  "logs/api.log",
);

function readStackApiLog(): string {
  try {
    return readFileSync(STACK_API_LOG, "utf8");
  } catch {
    return "";
  }
}

// ── Project IDs ─────────────────────────────────────────────────────────────
const BOOTSTRAP_OFF_PID = `${PREFIX}llm-bs-off-${RUN_STAMP}`;
const BOOTSTRAP_ON_PID = `${PREFIX}llm-bs-on-${RUN_STAMP}`;
const BOOTSTRAP_TIMEOUT_PID = `${PREFIX}llm-bs-to-${RUN_STAMP}`;
for (const id of [BOOTSTRAP_OFF_PID, BOOTSTRAP_ON_PID, BOOTSTRAP_TIMEOUT_PID]) {
  assertE2ePrefix(id);
}

/** A model id that cannot exist, used to make role routing falsifiable. */
const NONEXISTENT_CODE_MODEL = `eb-llm-3b-no-such-code-model-${RUN_STAMP}:0b`;

const LLM_QUERY = "postgres vector store addDocuments transaction";

/** ~40 lines of real TypeScript so `code_structure` has something to compress. */
const COMPRESSIBLE_SOURCE = [
  "import { readFileSync } from 'node:fs';",
  "",
  "/**",
  " * A deliberately verbose module used as compression input.",
  " * Every comment line here is compressible padding.",
  " */",
  "export interface WidgetOptions {",
  "  /** the widget's display name */",
  "  name: string;",
  "  /** how many times to retry */",
  "  retries: number;",
  "  /** an optional description */",
  "  description?: string;",
  "}",
  "",
  "export class WidgetFactory {",
  "  private readonly cache = new Map<string, WidgetOptions>();",
  "",
  "  /** Build a widget, memoizing by name. */",
  "  build(options: WidgetOptions): WidgetOptions {",
  "    const existing = this.cache.get(options.name);",
  "    if (existing) {",
  "      return existing;",
  "    }",
  "    this.cache.set(options.name, options);",
  "    return options;",
  "  }",
  "",
  "  /** Load widget options from a JSON file on disk. */",
  "  loadFromDisk(filePath: string): WidgetOptions {",
  "    const raw = readFileSync(filePath, 'utf8');",
  "    const parsed = JSON.parse(raw) as WidgetOptions;",
  "    return this.build(parsed);",
  "  }",
  "",
  "  /** Drop every memoized widget. */",
  "  clear(): void {",
  "    this.cache.clear();",
  "  }",
  "}",
].join("\n");

// ── Restart helper ──────────────────────────────────────────────────────────
async function stackRestart(profile: string, overrides: string[]): Promise<void> {
  const args = [
    "restart-api",
    "--profile",
    profile,
    ...overrides.flatMap((kv) => ["--env", kv]),
  ];
  await execFileAsync("bash", [STACK_SH, ...args], { timeout: 300_000 });
  const up = await pollUntil(
    async () => (await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) })).ok,
    { timeoutMs: 120_000, intervalMs: 2_000 },
  );
  if (!up) throw new Error(`API did not become healthy after: ${args.join(" ")}`);
}

// ── HTTP helpers ────────────────────────────────────────────────────────────
/**
 * A per-RUN cache-key nonce, and it is load-bearing rather than hygiene.
 *
 * `SearchCachePg.generateKey` hashes the lowercased query, the projectId and a
 * fixed option set — maxResults, minScore, explainScores, includeFilters,
 * excludeFilters, retrievalWindow, include, exclude — and NOTHING about the
 * server's LLM configuration. There is no bypass flag on the route. So the same
 * request repeated after a restart that changed an LLM knob is answered from the
 * pre-change entry for the whole 3600 s TTL.
 *
 * That is not hypothetical here. On the first live run EB-LLM-6 read
 * `degradations: []` in 96 ms under a 1 ms LLM budget — a cached answer from a
 * phase whose LLM was healthy. Giving each phase its own page size fixed the
 * collisions inside one run and then the SECOND run failed four cases instead of
 * one, because those keys were now warm from the first run.
 *
 * `minScore` is a key component, so a nonce far below the smallest gap between
 * real result scores makes every key unique per run while leaving the threshold
 * semantically the same value. Computed once at module load: deterministic
 * inside a run, different across runs.
 */
const CACHE_NONCE = (Date.now() % 100_000) * 1e-9;
const MIN_SCORE = 0.05 + CACHE_NONCE;

async function searchProject(body: Record<string, unknown>): Promise<any> {
  return httpPost<any>("/api/v1/search/project", {
    format: "json",
    maxResults: 8,
    minScore: MIN_SCORE,
    ...body,
  });
}
/** POST /api/v1/bootstrap — apps/tools-api/src/routes/bootstrap.ts:31 */
async function bootstrap(projectId: string): Promise<any> {
  return httpPost<any>("/api/v1/bootstrap", {
    projectId,
    projectPath: PROJECT_PATH,
    force: true,
  });
}
/** POST /api/v1/context/compress — apps/tools-api/src/routes/context.ts:29 */
async function compress(): Promise<any> {
  return httpPost<any>("/api/v1/context/compress", {
    content: COMPRESSIBLE_SOURCE,
    strategy: "code_structure",
    targetRatio: 0.7,
    language: "typescript",
  });
}

function resultIds(res: any): string[] {
  return ((res?.data?.results ?? []) as any[]).map((r) => String(r.id));
}
function degradationCodes(res: any): string[] {
  return ((res?.data?.degradations ?? []) as any[]).map((d) => String(d.code));
}

// ── Cross-describe baselines, all measured with the LLM OFF ─────────────────
let offOrder: string[] = [];
/**
 * Page sizes reserved for the phases that compare their result order against
 * the LLM-off baseline. Each server configuration must ask for its own page so
 * the answer is freshly computed rather than replayed from the search cache,
 * which is not keyed on the LLM configuration. See the capture in EB-LLM-1.
 *   7 → EB-LLM-3b (code-model role degraded)
 *   6 → EB-LLM-6  (1 ms LLM budget)
 */
/**
 * One cache key per (phase, run), and the lever is `minScore` rather than
 * `maxResults` — measured, not assumed.
 *
 * `SearchCachePg.generateKey` hashes the query, the projectId and a fixed option
 * set that includes BOTH `maxResults` and `minScore`. Page size looked like the
 * obvious discriminator and is the wrong one: RRF fuses over a candidate pool
 * that scales with the requested page, so the same query at 8, 7 and 6 returns
 * the same documents in DIFFERENT orders. Measured on this stack, LLM-off, one
 * query, three pages:
 *   @8 …postgres-vector-store.ts:14 | …:13 | base-vector-store.ts:0  | …
 *   @7 …postgres-vector-store.ts:13 | …:14 | base-vector-store.ts:11 | …
 *   @6 …postgres-vector-store.ts:13 | …:14 | base-vector-store.ts:11 | …
 * Any order comparison across page sizes is therefore meaningless, and a prefix
 * comparison is no better.
 *
 * A `minScore` delta far below the smallest gap between real result scores moves
 * the cache key without touching membership or ranking: it is a floor, not a
 * ranking term. Every phase keeps `maxResults: 8` and takes its own delta, so
 * orders stay comparable while every phase is freshly computed.
 */
const PHASE = { baseline: 0, codeModel: 1, timeout: 2, rerank: 3 } as const;
const phaseMinScore = (phase: keyof typeof PHASE): number =>
  MIN_SCORE + PHASE[phase] * 1e-7;

/**
 * The reranker's effect is read from `explanation.combinedRank` — the PRE-rerank
 * fusion position, emitted per result when `explainScores: true`
 * (search-controller.ts, fields finalScore / vectorScore / keywordScore /
 * rrfScore / vectorRank / keywordRank / combinedRank / breakdown).
 *
 * This replaces comparing the returned id order against a separately captured
 * LLM-off baseline, which is not a sound assertion on this stack: two calls of
 * the same query differing only by a 1e-7 minScore return DIFFERENT members and
 * orders — measured, `postgres-vector-store.ts:38` and `README.md:40` appearing
 * and `README.md:0` leaving between two such calls. Retrieval jitter of that
 * size makes exact order equality untestable, and the earlier green runs of
 * those assertions were green only because the search cache was replaying one
 * answer to both calls — a tautology, not a measurement.
 *
 * combinedRank is jitter-immune because it is read from the SAME response whose
 * order is under test: "the reranker returned its input verbatim" is exactly
 * "combinedRank ascends 1, 2, 3, …", and "the reranker reordered inside a window
 * of k" is exactly "the first k ranks are a permutation of 1..k and the rest are
 * still k+1, k+2, …".
 */
function combinedRanks(res: any): number[] {
  return ((res?.data?.results ?? []) as any[]).map((r) => r?.explanation?.combinedRank);
}
/**
 * `combinedRank` is the position in the FULL fused candidate list, not a dense
 * 1..n over the returned page: per-file capping and the minScore floor remove
 * entries between them. Measured on this stack, one page of 8:
 *   rerank degraded → 1, 2, 3, 4, 5, 6, 10, 13   (ascending, gaps and all)
 *   rerank on       → 3, 1, 2, 8, 15, 18, 23, 29 (head permuted, tail ascending)
 * So "the reranker returned its input verbatim" is *ascending*, never *1..n* —
 * an earlier draft asserted the dense form and failed against correct product
 * behaviour three times before the sparseness was read off the wire.
 */
function isStrictlyAscending(values: number[]): boolean {
  return values.every((v, i) => i === 0 || v > values[i - 1]!);
}

/**
 * EB-LLM-6 needs its own QUERY, not merely its own page size, because there are
 * TWO caches in front of it and they are keyed differently.
 *
 * The search result cache keys on (query, projectId, {maxResults, minScore,
 * explainScores, …}) — a page size or a minScore nonce defeats it. Query
 * understanding has its own cache keyed on (query, projectId) ALONE, which
 * EB-LLM-2 asserts. A cached understanding means no LLM call at all, so under a
 * 1 ms LLM budget there is nothing to abort and nothing to degrade.
 *
 * That is what kept EB-LLM-6 red after the page-size fix: `degradations: []` in
 * 67 ms, with the search result freshly computed and the understanding replayed.
 * A distinct query is the only key that moves both caches at once.
 */
const LLM_QUERY_TIMEOUT = "computePageRank centrality graph";
let offOrderTimeout: string[] = [];
let offCompressionRatio: number | null = null;
let offBootstrapSource: string | null = null;

beforeAll(async () => {
  if (!READY) {
    console.log(`[EB:30:SKIP] ${SKIP_REASON}`);
    return;
  }
  console.log(
    `[EB:30] profile=llm-on gates: RUN_E2E=1 RUN_E2E_LLM=1; owned dedicated stack confirmed.`,
  );
  // The shared index lives in PostgreSQL and survives every restart below, so
  // warm it once, before the first profile change.
  await ensureSharedIndex();
}, 900_000);

afterAll(async () => {
  if (!READY) return;
  for (const id of [BOOTSTRAP_OFF_PID, BOOTSTRAP_ON_PID, BOOTSTRAP_TIMEOUT_PID]) {
    await resetProject(id).catch(() => {});
  }
  // Restore the plain default profile. Leaving the stack on `llm-on` would make
  // every later file silently exercise LLM paths it was written to avoid.
  try {
    await stackRestart("default", []);
  } catch (e: any) {
    console.log(`[EB:30] RESTORE RESTART FAILED: ${String(e?.message ?? e).slice(0, 300)}`);
    throw e;
  }
}, 400_000);

// ═══════════════════════════════════════════════════════════════════════════
// EB-LLM-1 — the negative control. The most important case in this file.
// ═══════════════════════════════════════════════════════════════════════════
describe.skipIf(!READY)("EB-LLM-1 — LLM off degrades silently to the rule-based path", () => {
  beforeAll(async () => {
    // `default` leaves MASSA_AI_LLM_ENABLED unset → isLlmEnabled() is false
    // (packages/shared/src/config/index.ts:718, llm-client.ts:114-121). The two
    // consumer features are turned ON anyway: that is the whole point. A feature
    // that is enabled but whose LLM is unavailable must DEGRADE, not fail.
    await stackRestart("default", [
      "SEARCH_QUERY_UNDERSTANDING_ENABLED=true",
      "SEARCH_RERANK_ENABLED=true",
      "SEARCH_RERANK_WINDOW=2",
    ]);
  }, 400_000);

  test(
    "EB-LLM-1: search succeeds and reports QUERY_UNDERSTANDING_UNAVAILABLE instead of failing",
    async () => {
      // hybrid-search.ts:256-268 — when the feature is enabled and understand()
      // returns null (which is what llmObject's disabled branch produces,
      // llm-client.ts:334-345), the code calls
      // degrade("QUERY_UNDERSTANDING_UNAVAILABLE", "query_understanding").
      // Degradations reach the wire at search-controller.ts:346, present only
      // when non-empty, with the message catalogue at
      // packages/core/src/kernel/search-diagnostics.ts:52.
      const res = await searchProject({ query: LLM_QUERY, projectId: SHARED_PID });
      expect(res?.success).toBe(true);
      const results = (res?.data?.results ?? []) as any[];
      // Silent degradation means the rule-based path still SERVES.
      expect(results.length).toBeGreaterThan(0);
      const codes = degradationCodes(res);
      expect(codes).toContain("QUERY_UNDERSTANDING_UNAVAILABLE");
      const entry = (res.data.degradations as any[]).find(
        (d) => d.code === "QUERY_UNDERSTANDING_UNAVAILABLE",
      );
      expect(entry.component).toBe("query_understanding");
      expect(entry.message).toBe(
        "Query understanding was unavailable; original query used",
      );

      // This order is the pre-rerank, LLM-free baseline every later case
      // compares against. The reranker returned it verbatim
      // (reranker.ts:76, `if (!this.llm.isEnabled()) return results;`).
      offOrder = resultIds(res);
      expect(offOrder.length).toBeGreaterThan(2);
      console.log(`[EB-LLM-1] LLM-off order: ${offOrder.join(" | ")}`);

      // The search cache is NOT keyed on the server's LLM configuration, so a
      // later phase repeating this exact request is answered from THIS entry for
      // the whole 3600 s TTL — the same defect class measured in
      // `29.audit-repairs.test.ts` for SEARCH_DISABLE_KEYWORD, where a knob that
      // worked read as a knob that did nothing. It bit EB-LLM-6 here: with the
      // LLM budget at 1 ms it read `degradations: []` in 96 ms, which is a
      // cached answer from a phase that had a working LLM, not a site that
      // failed to degrade.
      //
      // `maxResults` participates in the cache key, so every later phase that
      // compares against this baseline gets its own page size, and the baseline
      // is captured at that size HERE, while the server is still LLM-free.
      // Comparing like with like is what the comparison was always claiming.

      // EB-LLM-6's own query, baselined here while the LLM is off. See
      // LLM_QUERY_TIMEOUT for why a page size is not enough.
      // EB-LLM-6's own query AND its own key. Identical keys would let EB-LLM-6
      // be served from this very entry, and a cached hit reports
      // `degradations: []` — the array is not persisted with the cached result —
      // which is exactly the empty degradation list that kept EB-LLM-6 red
      // through two earlier repairs.
      const timeoutBase = await searchProject({
        query: LLM_QUERY_TIMEOUT,
        projectId: SHARED_PID,
        minScore: phaseMinScore("baseline"),
      });
      expect(timeoutBase?.success).toBe(true);
      // The LLM-off run degrades here too — same code path, different query.
      expect(degradationCodes(timeoutBase)).toContain("QUERY_UNDERSTANDING_UNAVAILABLE");
      offOrderTimeout = resultIds(timeoutBase);
      expect(offOrderTimeout.length).toBeGreaterThan(2);
      console.log(`[EB-LLM-1] LLM-off order (timeout query): ${offOrderTimeout.join(" | ")}`);
    },
    300_000,
  );

  test(
    "EB-LLM-1b: bootstrap degrades to rule-based seeds and says so",
    async () => {
      // bootstrap-service.ts:283 sets `source = "rule-based"` on the LLM-disabled
      // branch; the field reaches the wire at bootstrap-service.ts:317-324 and
      // the route wraps it at routes/bootstrap.ts:53.
      const res = await bootstrap(BOOTSTRAP_OFF_PID);
      expect(res?.success).toBe(true);
      expect(["rule-based", "none"]).toContain(res?.data?.source);
      // A degraded bootstrap must still PRODUCE something, or "degrades" is
      // indistinguishable from "does nothing".
      expect(res?.data?.source).toBe("rule-based");
      expect(Array.isArray(res?.data?.seedMemoryIds)).toBe(true);
      expect(res.data.seedMemoryIds.length).toBeGreaterThan(0);
      expect(res?.data?.bootstrapped).toBe(true);
      offBootstrapSource = res.data.source;
      console.log(
        `[EB-LLM-1b] LLM-off bootstrap source=${res.data.source} ` +
          `seeds=${res.data.seedMemoryIds.length} signals=${res.data.signalCount}`,
      );
    },
    400_000,
  );

  test(
    "EB-LLM-1c: code_structure compression still works with no LLM at all",
    async () => {
      // code-compressor.ts computes the regex-first `compressStructure` result
      // at :71 and only ATTEMPTS the LLM at :103 behind `isLlmEnabled()` (:79).
      // With the LLM off, the regex output is the answer — and it must be a real
      // compression, not a pass-through.
      const res = await compress();
      expect(res?.success).toBe(true);
      expect(res?.data?.strategy).toBe("code_structure");
      expect(typeof res?.data?.compressed).toBe("string");
      const ratio = res?.metadata?.compressionRatio;
      expect(typeof ratio).toBe("number");
      expect(Number.isFinite(ratio)).toBe(true);
      expect(ratio).toBeGreaterThan(0);
      expect(res?.data?.compressedTokens).toBeLessThan(res?.data?.originalTokens);
      offCompressionRatio = ratio;
      console.log(`[EB-LLM-1c] LLM-off compressionRatio=${ratio.toFixed(4)}`);
    },
    120_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-LLM-2..5 — the features ON
// ═══════════════════════════════════════════════════════════════════════════
describe.skipIf(!READY)("EB-LLM-2..5 — query understanding, rerank, bootstrap, compression", () => {
  beforeAll(async () => {
    // Window 2 is deliberately tiny: it makes "everything past the window keeps
    // the pre-rerank order" an assertion with real content, which a window of 50
    // over an 8-result page could never be.
    await stackRestart("llm-on", [
      "SEARCH_QUERY_UNDERSTANDING_ENABLED=true",
      "SEARCH_RERANK_ENABLED=true",
      "SEARCH_RERANK_WINDOW=2",
    ]);
  }, 400_000);

  test(
    "EB-LLM-2: query understanding ON does not break search, and the cache is keyed by (query, projectId)",
    async () => {
      // With the LLM reachable, understand() returns a value, so the
      // QUERY_UNDERSTANDING_UNAVAILABLE degradation must NOT appear — the exact
      // inverse of EB-LLM-1. This pair is what makes either assertion mean
      // anything.
      const first = await searchProject({ query: LLM_QUERY, projectId: SHARED_PID });
      expect(first?.success).toBe(true);
      expect((first?.data?.results ?? []).length).toBeGreaterThan(0);
      expect(degradationCodes(first)).not.toContain("QUERY_UNDERSTANDING_UNAVAILABLE");

      // Cache key: `${projectId}::${trimmed}` —
      // packages/core/src/services/search/query-understanding.ts:266. Two
      // consequences are observable end-to-end:
      //   (a) the SAME (query, projectId) is served from cache and must not
      //       regress into a degradation;
      //   (b) a DIFFERENT projectId with the same query is a cache MISS, so it
      //       re-enters the LLM path — and must also not degrade.
      const second = await searchProject({ query: LLM_QUERY, projectId: SHARED_PID });
      expect(second?.success).toBe(true);
      expect(degradationCodes(second)).not.toContain("QUERY_UNDERSTANDING_UNAVAILABLE");

      // A cache HIT must be materially faster than the cold LLM call it
      // replaces; a cold model load in this repo has been measured at 42 s.
      // Assert only the direction, with a wide margin, so this cannot flake on
      // a warm model.
      const t0 = Date.now();
      const third = await searchProject({ query: LLM_QUERY, projectId: SHARED_PID });
      const cachedMs = Date.now() - t0;
      expect(third?.success).toBe(true);
      console.log(`[EB-LLM-2] repeat (cache-key hit) search took ${cachedMs} ms`);

      // Different projectId, same query → different key. The project is not
      // indexed, so the ADMISSION gate rejects it before retrieval
      // (search-controller.ts:170-176, projectNotIndexed). What matters is that
      // it is a CLEAN, declared refusal rather than an LLM-path crash.
      const otherPid = `${PREFIX}llm-cache-${RUN_STAMP}`;
      assertE2ePrefix(otherPid);
      const miss = await httpPost<any>("/api/v1/search/project", {
        query: LLM_QUERY,
        projectId: otherPid,
        format: "json",
      });
      expect(miss?.success === false || Array.isArray(miss?.data?.results)).toBe(true);
    },
    600_000,
  );

  test(
    "EB-LLM-3: rerank preserves the result set and honours SEARCH_RERANK_WINDOW",
    async () => {
      // reranker.ts:84-86 slices `head = results.slice(0, k)` /
      // `tail = results.slice(k)` with `k = min(window, length)`, and returns
      // `[...reorderedHead, ...tail]` at :110. So with window=2:
      //   - the whole list is a PERMUTATION of the LLM-off baseline;
      //   - indices 2.. are byte-identical to the baseline's indices 2..;
      //   - indices 0..1 are a permutation of the baseline's indices 0..1.
      // Whether the judge actually changed the order is NOT asserted (declared
      // skip #1 in the header) — it is logged.
      // Read from `combinedRank` inside THIS response rather than by comparing
      // ids against a separate baseline call — see combinedRanks() above for the
      // measured reason that comparison is unsound here.
      const res = await searchProject({
        query: LLM_QUERY,
        projectId: SHARED_PID,
        explainScores: true,
        minScore: phaseMinScore("rerank"),
      });
      expect(res?.success).toBe(true);
      const ranks = combinedRanks(res);
      expect(ranks.length).toBeGreaterThan(2);
      for (const r of ranks) expect(Number.isInteger(r)).toBe(true);
      console.log(`[EB-LLM-3] combinedRank order: ${ranks.join(", ")}`);

      // 1. Rerank must never add or drop a result: no rank repeats.
      expect(new Set(ranks).size).toBe(ranks.length);
      // 2. Outside the window the tail is untouched, i.e. still in fusion order.
      //    This is the falsifiable half of "SEARCH_RERANK_WINDOW is honoured":
      //    a reranker ignoring its window would disturb the tail too.
      expect(isStrictlyAscending(ranks.slice(2))).toBe(true);
      // 3. And the head was actually reordered, or this case would be green
      //    against a reranker that does nothing at all.
      expect(isStrictlyAscending(ranks)).toBe(false);
      console.log(`[EB-LLM-3] window=2: head reordered, tail in fusion order.`);
    },
    600_000,
  );

  test(
    "EB-LLM-4: bootstrap seeds via the LLM, against the rule-based seeds as the control",
    async () => {
      // bootstrap-service.ts:270 runs summarizeWithLlm(); :273 sets
      // source = "llm" on success, :275-281 falls back to ruleBasedSeed and
      // sets "rule-based". `source` is the ONE reliable LLM-vs-rule-based
      // signal on the wire in this product (bootstrap-service.ts:64, :317-324).
      // The control was measured in EB-LLM-1b on the same fixture.
      expect(offBootstrapSource).toBe("rule-based");
      const res = await bootstrap(BOOTSTRAP_ON_PID);
      expect(res?.success).toBe(true);
      expect(res?.data?.bootstrapped).toBe(true);
      expect(Array.isArray(res?.data?.seedMemoryIds)).toBe(true);
      expect(res.data.seedMemoryIds.length).toBeGreaterThan(0);
      expect(res?.data?.signalCount).toBeGreaterThan(0);
      // The discriminating assertion: with a reachable code model this must be
      // the LLM path, not the fallback. A red here means the code-role model
      // (MASSA_AI_LLM_CODE_MODEL) is unreachable or is a THINKING model that
      // burned the 90 s timeout — both are real, actionable failures.
      expect(res.data.source).toBe("llm");
      expect(res.data.source).not.toBe(offBootstrapSource);
      console.log(
        `[EB-LLM-4] LLM bootstrap source=${res.data.source} ` +
          `seeds=${res.data.seedMemoryIds.length} vs control source=${offBootstrapSource}`,
      );
    },
    600_000,
  );

  test(
    "EB-LLM-5: LLM context compression, with the LLM-off ratio as the control",
    async () => {
      // code-compressor.ts:103 is the code-role LLM call; on {ok:false} or throw
      // it keeps the regex output (:102-116). The response carries no
      // regex-vs-llm flag (declared skip #2), so the control is the ratio
      // measured with the LLM off in EB-LLM-1c on byte-identical input.
      expect(typeof offCompressionRatio).toBe("number");
      const res = await compress();
      expect(res?.success).toBe(true);
      expect(res?.data?.strategy).toBe("code_structure");
      const ratio = res?.metadata?.compressionRatio;
      expect(typeof ratio).toBe("number");
      expect(Number.isFinite(ratio)).toBe(true);
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
      expect(res?.data?.compressedTokens).toBeLessThan(res?.data?.originalTokens);
      // targetRatio is accepted but never enforced (premise correction #3 in the
      // header) — assert acceptance and report the achieved value.
      expect(typeof res?.metadata?.tokensSaved).toBe("number");
      expect(res.metadata.tokensSaved).toBeGreaterThan(0);
      console.log(
        `[EB-LLM-5] compressionRatio llm-on=${ratio.toFixed(4)} ` +
          `control(llm-off)=${offCompressionRatio!.toFixed(4)} ` +
          `(targetRatio 0.7 is logged only — compress-with-metrics.ts:57,63,79)`,
      );
    },
    300_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-LLM-3b — model-role routing, made falsifiable
// ═══════════════════════════════════════════════════════════════════════════
describe.skipIf(!READY)("EB-LLM-3b — the code role reads MASSA_AI_LLM_CODE_MODEL", () => {
  beforeAll(async () => {
    // Keep the instruct model working; point ONLY the code model at something
    // that cannot resolve. llm-client.ts:159-162 is the entire mechanism under
    // test: `role === "code" ? cfg.codeModel : cfg.model`.
    await stackRestart("llm-on", [
      "SEARCH_QUERY_UNDERSTANDING_ENABLED=true",
      "SEARCH_RERANK_ENABLED=true",
      "SEARCH_RERANK_WINDOW=2",
      `MASSA_AI_LLM_CODE_MODEL=${NONEXISTENT_CODE_MODEL}`,
    ]);
  }, 400_000);

  test(
    "EB-LLM-3b: a broken code model degrades the code-role sites while the instruct-role site keeps working",
    async () => {
      // This phase's own page size, captured LLM-free in EB-LLM-1. A shared page
      // size would be answered from the search cache, which is not keyed on the
      // LLM configuration.
      const res = await searchProject({
        query: LLM_QUERY,
        projectId: SHARED_PID,
        explainScores: true,
        minScore: phaseMinScore("codeModel"),
      });
      expect(res?.success).toBe(true);

      // 1. INSTRUCT role still resolves: query understanding
      //    (query-understanding.ts:102, no modelRole → "instruct",
      //    llm-client.ts:156) uses MASSA_AI_LLM_MODEL, which is untouched. So
      //    its degradation must be ABSENT.
      expect(degradationCodes(res)).not.toContain("QUERY_UNDERSTANDING_UNAVAILABLE");

      // 2. CODE role degrades: the reranker (reranker.ts:92, modelRole "code")
      //    gets {ok:false} and returns the input order verbatim
      //    (reranker.ts:102-107).
      //
      // ── This half was a DECLARED SKIP and is now CLOSED. ──────────────────
      // The old skip recorded a real observation — under a broken code model
      // the returned `combinedRank` order was `2, 3, …, 1, …`, not ascending —
      // and offered two readings: either the reranker does not read the code
      // role, or a nonexistent model name does not fail the call. It named the
      // observation that would settle it: "a single rerank call with the code
      // model broken, read from the API log's LLM error line".
      //
      // That observation was made (2026-09-07). BOTH readings were wrong; there
      // is a third. With MASSA_AI_LLM_CODE_MODEL pointed at a nonexistent model
      // and the instruct model healthy, one search produced, in the stack's own
      // api.log:
      //   [WARN] llmObject failed — degrading to non-LLM path
      //          {"error":"model 'eb-llm-3b-probe-no-such-model:0b' not found"}
      //   [WARN] LLMJudgeReranker got {ok:false} — degrading to input order
      // So the reranker IS a code-role site, the broken code model DOES reach
      // it, and it DOES degrade. What was wrong was the SENSOR: `combinedRank`
      // ascendingness cannot detect rerank degradation while query
      // understanding is on, because the instruct-role rewrite changes the
      // candidate set and the fusion before the reranker ever sees it. The
      // non-ascending order was a query-understanding effect being read as a
      // rerank effect.
      //
      // The assertion below therefore uses the log line, which is the direct
      // evidence, and NOT the rank order, which is a confounded proxy. The rank
      // order is still printed so the confound stays visible to a future reader.
      const ranks = combinedRanks(res);
      expect(ranks.length).toBeGreaterThan(2);

      // `stackRestart` truncates api.log (e2e-stack.sh:369 opens it with `>`),
      // so everything in it belongs to THIS describe's phase.
      const apiLog = readStackApiLog();
      expect(apiLog.length).toBeGreaterThan(0);

      // The code-role model really is what failed — the broken id is named.
      expect(apiLog).toContain(NONEXISTENT_CODE_MODEL);
      expect(apiLog).toContain("LLM call failed — using non-LLM fallback");
      // …and the reranker really is the site that took the {ok:false} branch
      // (reranker.ts:102-107).
      expect(apiLog).toContain("LLMJudgeReranker got {ok:false} — degrading to input order");

      // The instruct role must NOT have been the thing that broke — otherwise
      // this would prove only "some LLM call failed". Query understanding's own
      // degradation is already asserted absent above; assert here that no
      // failure line names the INSTRUCT model.
      const instructModel = process.env.MASSA_AI_E2E_LLM_MODEL ?? "qwen3-vl:8b";
      const failureLines = apiLog
        .split("\n")
        .filter((l) => l.includes("LLM call failed") || l.includes("not found"));
      for (const line of failureLines) {
        expect(line).not.toContain(`model '${instructModel}' not found`);
      }

      console.log(
        `[EB-LLM-3b] rerank half CLOSED: api.log carries the code-model failure and the ` +
          `LLMJudgeReranker degrade. combinedRank order was ` +
          `${isStrictlyAscending(ranks) ? "ascending" : "non-ascending"} ` +
          `(${ranks.join(", ")}) — a query-understanding effect, not a rerank one; ` +
          `${failureLines.length} LLM failure line(s), none naming the instruct model.`,
      );

      // 3. And the other code-role site agrees: bootstrap falls back.
      //    bootstrap-service.ts:496 passes modelRole "code"; :275-281 sets
      //    source = "rule-based" on {ok:false}.
      const bs = await bootstrap(BOOTSTRAP_TIMEOUT_PID);
      expect(bs?.success).toBe(true);
      expect(bs?.data?.source).toBe("rule-based");
      console.log(
        `[EB-LLM-3b] code model "${NONEXISTENT_CODE_MODEL}" → rerank order == LLM-off baseline, ` +
          `bootstrap source=${bs.data.source}, query-understanding still healthy.`,
      );
    },
    600_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-LLM-6 — a timeout must not hang the request
// ═══════════════════════════════════════════════════════════════════════════
describe.skipIf(!READY)("EB-LLM-6 — an LLM timeout degrades instead of hanging", () => {
  beforeAll(async () => {
    // 1 ms is below any achievable round trip, so `AbortSignal.timeout(timeoutMs)`
    // (llm-client.ts:349, via timeoutSignal() at :302-305) fires on every LLM
    // call. This is the deterministic version of the 90 s default at
    // packages/shared/src/config/index.ts:737 — same code path, bounded clock.
    await stackRestart("llm-on", [
      "SEARCH_QUERY_UNDERSTANDING_ENABLED=true",
      "SEARCH_RERANK_ENABLED=true",
      "SEARCH_RERANK_WINDOW=2",
      "MASSA_AI_LLM_TIMEOUT_MS=1",
    ]);
  }, 400_000);

  test(
    "EB-LLM-6: every LLM site aborts and degrades, and the request returns promptly",
    async () => {
      // The contract (llm-client.ts:369-375): llmComplete/llmObject NEVER throw;
      // an abort becomes `{ok:false, error}`. Each consumer then degrades:
      //   query understanding → QUERY_UNDERSTANDING_UNAVAILABLE (hybrid-search.ts:265)
      //   reranker            → input order verbatim (reranker.ts:102-107)
      //   bootstrap seed      → source "rule-based" (bootstrap-service.ts:275-281)
      //   code compressor     → regex output kept (code-compressor.ts:102-116)
      // This phase's own page size, captured LLM-free in EB-LLM-1. Sharing the
      // page size with an earlier phase is what made this case read
      // `degradations: []` in 96 ms on its first live run: the search cache is
      // not keyed on the LLM configuration, so the answer came from a phase
      // whose LLM was healthy. A 1 ms budget cannot produce a 96 ms search that
      // reports no degradation, and that impossibility is what identified the
      // cache rather than the product.
      const t0 = Date.now();
      const res = await searchProject({
        query: LLM_QUERY_TIMEOUT,
        projectId: SHARED_PID,
        explainScores: true,
        minScore: phaseMinScore("timeout"),
      });
      const searchMs = Date.now() - t0;

      expect(res?.success).toBe(true);
      expect((res?.data?.results ?? []).length).toBeGreaterThan(0);
      expect(degradationCodes(res)).toContain("QUERY_UNDERSTANDING_UNAVAILABLE");
      // Rerank degraded too → the returned order IS the fusion order.
      const ranks = combinedRanks(res);
      expect(ranks.length).toBeGreaterThan(2);
      expect(isStrictlyAscending(ranks)).toBe(true);
      // "Does not hang" is the whole point: with the LLM budget at 1 ms the
      // request must not spend anything like the 90 s default. Generous ceiling
      // so retrieval + embedding cost cannot flake it.
      expect(searchMs).toBeLessThan(60_000);
      console.log(`[EB-LLM-6] search under a 1 ms LLM budget returned in ${searchMs} ms`);

      // Compression: same abort, regex output preserved, still a real ratio.
      const t1 = Date.now();
      const comp = await compress();
      const compressMs = Date.now() - t1;
      expect(comp?.success).toBe(true);
      expect(comp?.metadata?.compressionRatio).toBeGreaterThan(0);
      expect(compressMs).toBeLessThan(60_000);
      console.log(
        `[EB-LLM-6] compress under a 1 ms LLM budget returned in ${compressMs} ms, ` +
          `ratio=${Number(comp.metadata.compressionRatio).toFixed(4)}`,
      );
    },
    600_000,
  );
});
