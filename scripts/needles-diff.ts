#!/usr/bin/env bun
/**
 * needles-diff — per-needle rank comparison between two retrieval runs.
 *
 * ## Why the printed table is not the sensor
 *
 * `bench:needles:gate` enforces floors: hit@1 >= 0.5, MRR >= 0.65. Floors
 * answer "is retrieval still acceptable", which is not the question a
 * behavior-preserving refactor asks. Three needles slipping from rank 1 to
 * rank 4 leaves hit@5 untouched, moves MRR from 1.00 to 0.25 on those three,
 * and can still clear both floors — a real regression that passed
 * (GMS-05 AC-4 note 2). This compares rank per needle, so a slip is visible
 * whether or not the aggregate notices.
 *
 * ## Rank is read from the report, not recomputed
 *
 * A needle's rank is its position among the hits *relative to its resolved
 * target*. Recomputing that for an old report against the current tree is
 * wrong in exactly the case this tool exists for: after PR-B renames
 * `rlm-fusion.ts`, the anchor resolves to the new file, the old report's hit
 * list names the old one, nothing matches, and every needle reads as a miss.
 * The before/after diff would then show a total collapse caused entirely by
 * the measurement. `run.ts` therefore records `rank` and `expected` at run
 * time and this reads them back.
 *
 * Reports written before that change carry neither. They are still usable, by
 * resolving anchors against the working tree — but only while the tree still
 * matches the report, so the fallback announces itself rather than being
 * silently equivalent.
 *
 * ## What counts as a regression
 *
 * Rank worsening, and needles disappearing. A dropped needle is called out
 * because removing a hard one is the cheapest way to raise every aggregate.
 * Score drift is reported and is deliberately *not* a failure: cosine scores
 * move with chunk boundaries, and a rename changes them without changing
 * retrieval quality. Rank is the invariant; the scores are context.
 *
 * Usage:
 *   bun scripts/needles-diff.ts <before.json> <after.json> [--json]
 *                               [--fixture <path>] [--root <dir>]
 *
 * Exit codes:
 *   0  no regression
 *   1  regression — a needle lost rank, or a needle disappeared
 *   2  usage error, or a report could not be read
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { findRank, resolveNeedles, type ResolvedSpan } from "../benchmarks/needles/resolve.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");
const DEFAULT_FIXTURE = "benchmarks/needles/fixtures/massa-ai.json";

export interface Hit {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  score: number;
}

export interface NeedleResult {
  needleId: string;
  hits: Hit[];
  rank?: number | null;
  expected?: ResolvedSpan;
}

export interface Report {
  ranAt?: string;
  model?: string;
  aggregate?: { hitAt1: number; hitAt3: number; hitAt5: number; hitAt10: number; mrr: number };
  results: NeedleResult[];
}

export interface NeedleDelta {
  needleId: string;
  beforeRank: number | null;
  afterRank: number | null;
  /** Positive means it got worse. `null` ranks are treated as beyond the list. */
  drop: number;
  regression: boolean;
  beforeTopScore: number | null;
  afterTopScore: number | null;
}

export interface DiffResult {
  deltas: NeedleDelta[];
  regressions: NeedleDelta[];
  improvements: NeedleDelta[];
  missing: string[];
  added: string[];
  /** Needles whose rank had to be recomputed because the report predates it. */
  recomputed: string[];
  beforeMrr: number;
  afterMrr: number;
  ok: boolean;
}

/** A miss sorts after every real rank, so `null` becomes topK + 1. */
function rankValue(rank: number | null, topK: number): number {
  return rank === null ? topK + 1 : rank;
}

function mrrOf(results: Array<{ rank: number | null }>): number {
  if (results.length === 0) return 0;
  return results.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / results.length;
}

/**
 * Rank per needle, preferring what the run recorded.
 *
 * `spans` is only consulted for reports predating the recorded-rank change;
 * the ids it had to be used for come back in `recomputed`.
 */
export function ranksOf(
  report: Report,
  spans: Map<string, ResolvedSpan>,
  tolerance: number,
  recomputed: string[] = [],
): Map<string, { rank: number | null; topScore: number | null }> {
  const out = new Map<string, { rank: number | null; topScore: number | null }>();
  for (const r of report.results) {
    const topScore = r.hits[0]?.score ?? null;
    if (r.rank !== undefined) {
      out.set(r.needleId, { rank: r.rank, topScore });
      continue;
    }
    const span = r.expected ?? spans.get(r.needleId);
    if (!span) {
      out.set(r.needleId, { rank: null, topScore });
      recomputed.push(r.needleId);
      continue;
    }
    recomputed.push(r.needleId);
    out.set(r.needleId, { rank: findRank(span, r.hits, tolerance).rank, topScore });
  }
  return out;
}

export function diffReports(
  before: Report,
  after: Report,
  spans: Map<string, ResolvedSpan> = new Map(),
  tolerance = 5,
  topK = 10,
): DiffResult {
  const recomputed: string[] = [];
  const b = ranksOf(before, spans, tolerance, recomputed);
  const a = ranksOf(after, spans, tolerance, recomputed);

  const deltas: NeedleDelta[] = [];
  for (const [needleId, beforeEntry] of b) {
    const afterEntry = a.get(needleId);
    if (!afterEntry) continue; // handled as `missing`
    const drop = rankValue(afterEntry.rank, topK) - rankValue(beforeEntry.rank, topK);
    deltas.push({
      needleId,
      beforeRank: beforeEntry.rank,
      afterRank: afterEntry.rank,
      drop,
      regression: drop > 0,
      beforeTopScore: beforeEntry.topScore,
      afterTopScore: afterEntry.topScore,
    });
  }

  const missing = [...b.keys()].filter((id) => !a.has(id));
  const added = [...a.keys()].filter((id) => !b.has(id));
  const regressions = deltas.filter((d) => d.regression).sort((x, y) => y.drop - x.drop);

  return {
    deltas: deltas.sort((x, y) => x.needleId.localeCompare(y.needleId)),
    regressions,
    improvements: deltas.filter((d) => d.drop < 0).sort((x, y) => x.drop - y.drop),
    missing,
    added,
    recomputed: [...new Set(recomputed)],
    beforeMrr: before.aggregate?.mrr ?? mrrOf([...b.values()]),
    afterMrr: after.aggregate?.mrr ?? mrrOf([...a.values()]),
    ok: regressions.length === 0 && missing.length === 0,
  };
}

function readReport(path: string): Report {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Report;
  if (!Array.isArray(parsed.results)) throw new Error(`${path}: no "results" array`);
  return parsed;
}

/** Resolved spans for the fallback path. Never needed for a current report. */
function loadSpans(fixturePath: string, root: string): { spans: Map<string, ResolvedSpan>; tolerance: number } {
  const dataset = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    scoring: { lineTolerance: number; staleNeedles?: string[] };
    needles: Array<{ id: string; expected: Record<string, unknown> }>;
  };
  const resolved = resolveNeedles(dataset.needles as never, root, {
    staleNeedles: dataset.scoring.staleNeedles,
  });
  return {
    spans: new Map(resolved.map((r) => [r.needle.id, r.resolved])),
    tolerance: dataset.scoring.lineTolerance,
  };
}

function fmtRank(rank: number | null): string {
  return rank === null ? "MISS" : `@${rank}`;
}

function main(argv: string[]): number {
  const json = argv.includes("--json");
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i < 0 ? undefined : argv[i + 1];
  };
  const positional = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  if (positional.length < 2) {
    console.error("usage: bun scripts/needles-diff.ts <before.json> <after.json> [--json] [--fixture <p>] [--root <d>]");
    return 2;
  }

  let before: Report;
  let after: Report;
  try {
    before = readReport(resolve(positional[0]!));
    after = readReport(resolve(positional[1]!));
  } catch (error) {
    console.error(`cannot read report: ${error instanceof Error ? error.message : error}`);
    return 2;
  }

  // Only resolve anchors when a report actually lacks recorded ranks: the
  // fallback walks the source tree, and a current report does not need it.
  const needsFallback = [...before.results, ...after.results].some((r) => r.rank === undefined);
  let spans = new Map<string, ResolvedSpan>();
  let tolerance = 5;
  if (needsFallback) {
    try {
      const loaded = loadSpans(resolve(flag("--fixture") ?? resolve(REPO_ROOT, DEFAULT_FIXTURE)), resolve(flag("--root") ?? REPO_ROOT));
      spans = loaded.spans;
      tolerance = loaded.tolerance;
    } catch (error) {
      console.error(`cannot resolve needle spans for the legacy report path: ${error instanceof Error ? error.message : error}`);
      return 2;
    }
  }

  const diff = diffReports(before, after, spans, tolerance);

  if (json) {
    console.log(JSON.stringify(diff, null, 2));
    return diff.ok ? 0 : 1;
  }

  if (diff.recomputed.length > 0) {
    console.log(
      `note: ${diff.recomputed.length} needle(s) had no recorded rank and were recomputed against the working tree.\n` +
        `      That is only valid while the tree still matches the report — a rename since it was\n` +
        `      captured resolves the anchor elsewhere and reads as a miss.\n`,
    );
  }

  console.log("per-needle rank:");
  for (const d of diff.deltas) {
    const mark = d.regression ? "REGRESSION" : d.drop < 0 ? "improved" : "";
    const scores =
      d.beforeTopScore !== null && d.afterTopScore !== null
        ? `  score ${d.beforeTopScore.toFixed(4)} → ${d.afterTopScore.toFixed(4)}`
        : "";
    console.log(`  ${d.needleId.padEnd(33)}  ${fmtRank(d.beforeRank).padStart(5)} → ${fmtRank(d.afterRank).padEnd(5)}  ${mark.padEnd(10)}${scores}`);
  }

  console.log(`\nMRR ${diff.beforeMrr.toFixed(4)} → ${diff.afterMrr.toFixed(4)}`);
  for (const id of diff.missing) console.log(`  MISSING: ${id} was measured before and is absent after`);
  for (const id of diff.added) console.log(`  added:   ${id} is new in the after run`);

  if (diff.ok) {
    console.log(`\nno regression: ${diff.deltas.length} needles, ${diff.improvements.length} improved.`);
    return 0;
  }
  console.log(`\nREGRESSION: ${diff.regressions.length} needle(s) lost rank, ${diff.missing.length} disappeared.`);
  return 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
