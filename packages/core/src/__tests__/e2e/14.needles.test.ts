/**
 * T10 — Needles benchmark (E2E, live stack).
 *
 * Domain: search quality — needle-in-haystack retrieval against the running
 * massa-ai instance. Read-only: no production source / route edits, no
 * restart of tools-api (pid 9524), no dist rebuild, no DB schema changes.
 *
 * Strategy:
 *  - Reuses the shared index `e2e-ai-shared` (indexed ONCE across the whole
 *    E2E suite via ensureSharedIndex). Do NOT reset SHARED_PID.
 *  - Loads the dogfood corpus from benchmarks/needles/fixtures/massa-ai.json
 *    (14 needles covering string-literal magic, business-rule utilities,
 *    cross-file event coupling, cross-language stack).
 *  - Reuses scorer semantics from benchmarks/needles/scorer.ts (hit@1/3/5/10 +
 *    MRR + ±5 line tolerance, filePath equality + line-range intersection).
 *  - For each needle: ONE search = ONE Ollama embed (~10-40s on this host).
 *    Run needles SEQUENTIALLY (no Promise.all — Ollama mutex serializes and
 *    parallel embeds risk OOM). One big `test()` with a high timeout.
 *
 * Scenarios:
 *  - F-NEEDLE-1: aggregate hit@1/hit@5/MRR floors (CONSERVATIVE — set to ~80%
 *    of the observed warm baseline so the test is a regression guard, not an
 *    aspirational target). See OBSERVED_BASELINE below.
 *  - F-NEEDLE-2: every needle returns SOMETHING (no empty result arrays). A
 *    needle returning 0 hits is reported as a search-quality finding and
 *    skipped, not failed.
 *  - F-NEEDLE-3 (determinism): re-run the benchmark once more in the same test
 *    and assert the two runs' hit@k counts are identical (warm-cache ranking
 *    stability).
 *
 * OBSERVED_BASELINE (warm shared index, qwen3-embedding:8b, PostgreSQL):
 *   T7 lift (fixture refresh + chunk overlap):
 *     hit@1  = 0.500  (7/14)
 *     hit@3  = 0.643  (9/14)
 *     hit@5  = 0.714  (10/14)
 *     hit@10 = 0.714  (10/14)
 *     MRR    = 0.586
 *   Pre-T7 (stale fixture ranges, no overlap):
 *     hit@1  = 0.357  (5/14)
 *     hit@5  = 0.571  (8/14)
 *     MRR    = 0.443
 * Floors below are derived from the T7 baseline at ~80% (rounded down) so a
 * catastrophic regression trips the test while normal embed jitter does not.
 * Determinism: two sequential sweeps on the warm index produced IDENTICAL
 * per-needle ranks (zero rank drift) — embedding cache yields stable ranking.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  E2E_ENABLED,
  probeAvailability,
  ensureSharedIndex,
  PROJECT_PATH,
  ACTIVE_EMBEDDING_PROFILE,
} from "./_helpers";
import {
  resolveNeedles,
  findRank,
  type ResolvedSpan,
} from "../../../../../benchmarks/needles/resolve.ts";

// ── Gating ────────────────────────────────────────────────────────────────
// Two-stage gate: RUN_E2E + API up + the configured inference provider up
// (search needs embeddings). Provider-neutral on purpose: LIP-22's subject is
// the 768 arm, and gating on Ollama specifically is exactly what made this
// file structurally incapable of observing it.
const AVAIL = E2E_ENABLED ? await probeAvailability() : null;
const READY = !!AVAIL?.API_UP && !!AVAIL?.INFERENCE_UP;

/**
 * Per-arm regression floors (F-NEEDLE-1).
 *
 * Keyed by provider because a floor is a statement about one embedding
 * stack, not about retrieval in general. `null` means "no calibrated
 * baseline yet": the arm runs and records, and the run below refuses to
 * assert a number nobody measured for it.
 */
const FLOORS: Record<string, { hit1: number; hit5: number; mrr: number } | null> = {
  // Measured on this host, warm shared index, qwen3-embedding (2560d, so the
  // > 2000 two-phase binary-quantization search path). See OBSERVED_BASELINE
  // in the file header for the run these are derived from.
  ollama: { hit1: 0.36, hit5: 0.64, mrr: 0.47 },
  // LM Studio at 768 takes the OTHER store branch (≤ 2000, direct HNSW
  // cosine). Calibrated 2026-09-20 from the LIP-22 measurement on this host —
  // same corpus (743 files / 8129 chunks), same fixture, same ±5-line scorer,
  // two deterministic sweeps: hit@1 0.1429 (2/14), hit@5 0.2857 (4/14),
  // MRR 0.2116. Floors at ~80% rounded DOWN to the nearest whole needle, the
  // same rule the Ollama row uses: hit@1 1/14, hit@5 3/14, MRR 0.16.
  //
  // These floors are LOW because the arm is, not because the gate was relaxed
  // to fit it. That gap is the finding LIP-22 exists to record, and it is the
  // reason the row is written rather than the row being omitted.
  lmstudio: { hit1: 0.07, hit5: 0.21, mrr: 0.16 },
};

// ── Long-timeout POST (shared helper caps at 120s; search embeds can exceed) ─
async function postLong<T = any>(endpoint: string, body?: unknown, timeoutMs = 120_000): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = process.env.MASSA_AI_API_KEY ?? "";
  if (key) headers["x-api-key"] = key;
  const api = process.env.MASSA_AI_API_URL ?? "http://localhost:3333";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${api}${endpoint}`, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Dataset + scorer (imported from the repo, read-only) ────────────────────
const FIXTURE_PATH = path.join(
  PROJECT_PATH,
  "benchmarks/needles/fixtures/massa-ai.json",
);

// The fixture's own shape. `expected` is a content anchor plus signed line
// offsets — never a physical position — and the concrete span comes from
// `resolveNeedles` against the working tree.
interface NeedleExpected {
  anchor?: string;
  startOffset?: number;
  endOffset?: number;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
}
interface Needle {
  id: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  query: string;
  expected: NeedleExpected;
  rationale: string;
}
interface Dataset {
  projectId: string;
  version: string;
  description: string;
  scoring: { topK: number; hitAtK: number[]; lineTolerance: number; notes: string; staleNeedles?: string[] };
  needles: Needle[];
}
interface Hit {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  score: number;
}

// `intersects` and `findRank` used to be transcribed here, verbatim, from
// scorer.ts — a third copy of the same predicate reading the same fixture. That
// is why this file is in scope for the anchoring work at all: repairing run.ts
// and scorer.ts while leaving this one positionally pinned would let a later
// refactor break it invisibly. With the 7 `services/search/` targets moved, its
// hit@5 caps at 7/14 = 0.50 against its own 0.64 floor below.
//
// It now consumes the shared resolver, so there is exactly one predicate and one
// definition of where a needle points.

interface SweepResult {
  hitAt1: number;
  hitAt3: number;
  hitAt5: number;
  hitAt10: number;
  mrr: number;
  perNeedle: Array<{
    id: string;
    difficulty: string;
    query: string;
    rank: number | null;
    topHit: Hit | null;
    expected: ResolvedSpan;
    reciprocalRank: number;
    empty: boolean;
  }>;
  emptyNeedles: string[];
}

/** Run the full needle sweep against the shared index, sequentially. */
async function runSweep(pid: string, dataset: Dataset): Promise<SweepResult> {
  const tol = dataset.scoring.lineTolerance;
  const perNeedle: SweepResult["perNeedle"] = [];
  const emptyNeedles: string[] = [];

  // Resolve every needle by content before the sweep. A stale fixture throws
  // here — loudly, and before any search is issued — instead of quietly scoring
  // zeros that are indistinguishable from a retrieval regression.
  const spans = new Map<string, ResolvedSpan>(
    resolveNeedles(dataset.needles, PROJECT_PATH, {
      staleNeedles: dataset.scoring.staleNeedles,
    }).map((r) => [r.needle.id, r.resolved]),
  );

  for (const needle of dataset.needles) {
    const r = await postLong<any>(
      "/api/v1/search/project",
      {
        query: needle.query,
        projectId: pid,
        maxResults: 10,
        minScore: 0.05,
        format: "json",
      },
      90_000,
    );
    const hits: Hit[] = (r?.data?.results ?? []).map((x: any) => ({
      filePath: String(x.filePath),
      lineStart: Number(x.lineStart ?? 0),
      lineEnd: Number(x.lineEnd ?? 0),
      score: Number(x.score ?? 0),
    }));
    const empty = hits.length === 0;
    if (empty) emptyNeedles.push(needle.id);
    const expectedSpan = spans.get(needle.id)!;
    const { rank } = findRank(expectedSpan, hits, tol);
    perNeedle.push({
      id: needle.id,
      difficulty: needle.difficulty,
      query: needle.query,
      rank,
      topHit: hits[0] ?? null,
      expected: expectedSpan,
      reciprocalRank: rank ? 1 / rank : 0,
      empty,
    });
  }

  const total = perNeedle.length;
  const hitAt1 = perNeedle.filter((e) => e.rank !== null && e.rank <= 1).length / total;
  const hitAt3 = perNeedle.filter((e) => e.rank !== null && e.rank <= 3).length / total;
  const hitAt5 = perNeedle.filter((e) => e.rank !== null && e.rank <= 5).length / total;
  const hitAt10 = perNeedle.filter((e) => e.rank !== null && e.rank <= 10).length / total;
  const mrr = perNeedle.reduce((s, e) => s + e.reciprocalRank, 0) / total;

  return { hitAt1, hitAt3, hitAt5, hitAt10, mrr, perNeedle, emptyNeedles };
}

function printTable(label: string, s: SweepResult): void {
  console.log(`\n=== T10 Needles — ${label} ===`);
  console.log("per-needle:");
  console.log(
    "  id                              diff     rank  hit  expected",
  );
  for (const e of s.perNeedle) {
    const rank = e.rank === null ? "—" : String(e.rank);
    const hit = e.rank === null ? "MISS" : `@${e.rank}`;
    const top = e.topHit ? `${e.topHit.filePath}:${e.topHit.lineStart}-${e.topHit.lineEnd}` : "(no hits)";
    console.log(
      `  ${e.id.padEnd(30)}  ${e.difficulty.padEnd(6)}  ${String(rank).padStart(4)}  ${hit.padEnd(5)}  ${e.expected.filePath}:${e.expected.lineStart}-${e.expected.lineEnd}`,
    );
    if (e.rank === null || e.rank > 5) {
      console.log(`    ↳ top: ${top}`);
    }
  }
  console.log("\naggregate:");
  console.log(`  hit@1  = ${(s.hitAt1 * 100).toFixed(1)}%`);
  console.log(`  hit@3  = ${(s.hitAt3 * 100).toFixed(1)}%`);
  console.log(`  hit@5  = ${(s.hitAt5 * 100).toFixed(1)}%`);
  console.log(`  hit@10 = ${(s.hitAt10 * 100).toFixed(1)}%`);
  console.log(`  MRR    = ${s.mrr.toFixed(3)}`);
  if (s.emptyNeedles.length > 0) {
    console.log(`  empty-result needles: ${s.emptyNeedles.join(", ")}`);
  }
}

describe.skipIf(!READY)("T10 needles benchmark", () => {
  let pid: string;
  let dataset: Dataset;
  const profile = ACTIVE_EMBEDDING_PROFILE;

  beforeAll(async () => {
    // The scores below describe whichever stack actually served the searches.
    // `profile` comes from THIS process's config resolver while the searches
    // are served by the API process, so a disagreement means the run would
    // measure one stack and label it another — fail here rather than publish
    // a mislabelled number. This is the whole failure mode LIP-22 turns on.
    const served = AVAIL?.EMBEDDING_MODEL;
    if (served && served !== profile.model) {
      throw new Error(
        `arm mismatch: the API reports embedding model "${served}" but this process's ` +
          `resolver says "${profile.model}" (${profile.provider}, ${profile.dimensions}d). ` +
          `Point both at the same config before measuring.`,
      );
    }
    console.log(
      `[T10] arm: provider=${profile.id} (dispatch=${profile.dispatchPath}) model=${profile.model} ` +
        `dimensions=${profile.dimensions} ` +
        `searchPath=${profile.dimensions > 2000 ? "binary-quantization" : "hnsw-cosine"}`,
    );
    pid = await ensureSharedIndex();
    dataset = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
    // 700s was not enough to build this index cold and is why the file could
    // sit unrun: `ensureSharedIndex` polls until the store is richly
    // searchable, and a COLD full-repo index measured 1h 12m on the Ollama arm
    // (743 files / 8129 chunks / 23913 symbols at 0.19 files/sec — the embed
    // call dominates). The LM Studio arm indexed the same corpus at 3.86
    // files/sec, ~20x faster, in about 3 minutes. Budget the slow arm, since
    // this hook is a no-op once the index is warm.
  }, 5_400_000);

  test(
    "F-NEEDLE-1/2/3: needle sweep — hit@k floors, non-empty results, determinism",
    async () => {
      // ── Run #1 ──────────────────────────────────────────────────────────
      const sweep1 = await runSweep(pid, dataset);
      printTable("run #1", sweep1);

      // F-NEEDLE-2: every needle returns SOMETHING. A needle returning 0 hits
      // is a search-quality finding — report it. We do NOT fail the suite on
      // empty results (per task contract), but surface them prominently.
      if (sweep1.emptyNeedles.length > 0) {
        console.log(
          `[T10] FINDING — ${sweep1.emptyNeedles.length} needle(s) returned zero results: ` +
            sweep1.emptyNeedles.join(", "),
        );
      }
      // Defensive: assert the API didn't error out wholesale (at least some
      // needle returned hits). If literally every needle is empty, that's a
      // broken stack, not a quality finding.
      const anyHits = sweep1.perNeedle.some((e) => !e.empty);
      expect(anyHits).toBe(true);

      // ── Run #2 (determinism — F-NEEDLE-3) ───────────────────────────────
      const sweep2 = await runSweep(pid, dataset);
      printTable("run #2 (determinism)", sweep2);

      // F-NEEDLE-3: warm-cache ranking must be stable on a warm index.
      // Tolerance: exact equality on hit@k counts.
      expect(sweep2.hitAt1).toBe(sweep1.hitAt1);
      expect(sweep2.hitAt3).toBe(sweep1.hitAt3);
      expect(sweep2.hitAt5).toBe(sweep1.hitAt5);
      expect(sweep2.hitAt10).toBe(sweep1.hitAt10);

      // Also compare per-needle ranks for stability visibility.
      let rankDrift = 0;
      for (let i = 0; i < sweep1.perNeedle.length; i++) {
        const a = sweep1.perNeedle[i].rank;
        const b = sweep2.perNeedle[i].rank;
        if (a !== b) {
          rankDrift++;
          console.log(
            `[T10] rank drift ${sweep1.perNeedle[i].id}: run1=${a ?? "—"} run2=${b ?? "—"}`,
          );
        }
      }
      // hit@k equality is the contract; rank drift within the same hit@k bucket
      // is tolerated by the spec. Surface it but don't fail on it.

      // ── F-NEEDLE-1: conservative regression floors ──────────────────────
      // OBSERVED_BASELINE (T7 lift: fixture refresh + chunk overlap; warm shared
      // index, this host; two sequential sweeps identical):
      //   hit@1 = 0.500 (7/14)  hit@3 = 0.643 (9/14)
      //   hit@5 = 0.714 (10/14) hit@10= 0.714 (10/14)
      //   MRR   = 0.586
      // Floors set at ~80% of baseline (rounded DOWN to the nearest whole
      // needle so the test only trips on a real regression, not jitter):
      //   hit@1 ≥ 5/14 ≈ 0.357 → floor 0.36   (was 0.28 pre-T7)
      //   hit@5 ≥ 9/14 ≈ 0.643 → floor 0.64   (was 0.57 pre-T7)
      //   MRR  ≥ 0.47              (was 0.40 pre-T7)
      // Pre-T7 floors (0.28/0.57/0.4) were derived from a stale-fixture
      // baseline (0.357/0.571/0.443); the T7 fixture refresh + chunk overlap
      // lifted quality ~40% on hit@1, so the floors rise with it. Every new
      // floor is ≥ its pre-T7 value — this is a quality lift, not a carve-out.
      // We assert against the FIRST run (warm cache); if run #1 dipped, run #2
      // almost certainly dipped too, so this is the right gate.
      // Floors are calibrated PER ARM. The numbers above were measured on
      // Ollama at 2560; they are not a statement about any other provider, and
      // asserting them against an arm nobody calibrated would be inventing a
      // number — which is the exact defect LIP-22 exists to prevent. An arm
      // with no calibrated baseline still runs, still asserts the
      // provider-independent invariants (non-empty, determinism), and records
      // its aggregate as the candidate baseline.
      // An arm the table does not mention at all is a misconfiguration, not a
      // new provider: `FLOORS` is keyed on the same ids `embeddingProviders`
      // uses, so an id that is absent means this run measured something other
      // than what it claims to. Distinguish that from a DELIBERATE `null`
      // (recorded, awaiting calibration) — without this, an unknown id takes
      // the no-assertion path and F-NEEDLE-1 passes green having asserted
      // nothing. That is not hypothetical: reading the provider's dispatch
      // path instead of its id produced exactly this, `"custom"`, and it was
      // caught by eye rather than by a gate.
      if (!(profile.id in FLOORS)) {
        throw new Error(
          `unknown arm "${profile.id}": not a key of FLOORS. Add a row (or an explicit ` +
            `null pending calibration) before trusting a run labelled with it.`,
        );
      }
      const floors = FLOORS[profile.id];

      console.log("\n=== T10 regression floors ===");
      if (!floors) {
        console.log(
          `  no calibrated floor for arm "${profile.id}" — recording this run as the ` +
            `candidate baseline (hit@1 ${sweep1.hitAt1.toFixed(4)}, hit@5 ${sweep1.hitAt5.toFixed(4)}, ` +
            `MRR ${sweep1.mrr.toFixed(4)}). Set FLOORS["${profile.id}"] at ~80% of it, ` +
            `rounded DOWN to the nearest whole needle, once it is confirmed.`,
        );
      } else {
        console.log(`  hit@1 ${sweep1.hitAt1.toFixed(3)} ≥ ${floors.hit1}  → ${sweep1.hitAt1 >= floors.hit1 ? "PASS" : "FAIL"}`);
        console.log(`  hit@5 ${sweep1.hitAt5.toFixed(3)} ≥ ${floors.hit5}  → ${sweep1.hitAt5 >= floors.hit5 ? "PASS" : "FAIL"}`);
        console.log(`  MRR   ${sweep1.mrr.toFixed(3)} ≥ ${floors.mrr}   → ${sweep1.mrr >= floors.mrr ? "PASS" : "FAIL"}`);

        expect(sweep1.hitAt1).toBeGreaterThanOrEqual(floors.hit1);
        expect(sweep1.hitAt5).toBeGreaterThanOrEqual(floors.hit5);
        expect(sweep1.mrr).toBeGreaterThanOrEqual(floors.mrr);
      }

      // ── LIP-22: the arm record, machine-readable ────────────────────────
      // One line per arm, so the two arms can be diffed exactly rather than
      // transcribed from a console table. `searchPath` is the whole point:
      // it names which branch of postgres-vector-store.ts actually ran, which
      // is the thing `bench:needles` structurally could not observe.
      console.log(
        "[T10][LIP-22] " +
          JSON.stringify({
            provider: profile.id,
            dispatchPath: profile.dispatchPath,
            model: profile.model,
            dimensions: profile.dimensions,
            searchPath: profile.dimensions > 2000 ? "binary-quantization" : "hnsw-cosine",
            projectId: pid,
            n: sweep1.perNeedle.length,
            aggregate: {
              hitAt1: Number(sweep1.hitAt1.toFixed(4)),
              hitAt3: Number(sweep1.hitAt3.toFixed(4)),
              hitAt5: Number(sweep1.hitAt5.toFixed(4)),
              hitAt10: Number(sweep1.hitAt10.toFixed(4)),
              mrr: Number(sweep1.mrr.toFixed(4)),
            },
            misses: sweep1.perNeedle.filter((e) => e.rank === null).map((e) => e.id),
          }),
      );
    },
    // 14 needles × 2 runs × ~40s worst-case embed = ~1120s; pad to 1500s.
    1_500_000,
  );
});
