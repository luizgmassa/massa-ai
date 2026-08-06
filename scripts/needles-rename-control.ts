#!/usr/bin/env bun
/**
 * The rename-controlled needles re-run — GMS-05 AC-4's discriminating half.
 *
 * ## Why `needles-diff.ts` exiting 0 is not reachable for this PR
 *
 * `needles-diff.ts` compares per-needle rank across a refactor and treats any
 * rank loss as a regression. Its own docblock exempts *score* drift from failure,
 * and gives the right reason: "cosine scores move with chunk boundaries, and a
 * rename changes them without changing retrieval quality." It then declares rank
 * the invariant. **Rank is a function of score**, so the exemption granted to one
 * does not reach the other, and a rename can move rank without moving retrieval
 * quality at all.
 *
 * The route is exact rather than statistical. `smart-chunker.ts:69` prepends
 * `// File: ${relativePath}` to every chunk before it is embedded, so renaming a
 * file changes the embedded bytes of every chunk in it. Where two adjacent chunks
 * sit inside that perturbation, they swap, and a needle whose target is the lower
 * of the two loses a rank.
 *
 * Measured at T17: `rlm-fusion` became `result-fusion.ts` and `rlm-search`'s body
 * merged into `hybrid-search.ts`, so `N05-centrality-rerank-bonus` went rank 5 to 6
 * and the gate reported REGRESSION. At chunk level its target and the rival that
 * overtook it were separated by **+0.0134** cosine before and **-0.0030** after,
 * and a 2x2 showed neither the header change nor the body change flips it alone.
 *
 * Those two predecessor names are written without their `.ts` deliberately. This
 * file sits inside `check-stale-pointers.ts`'s corpus and is not in its `EXCLUDED`
 * list, so spelled in full they are `HISTORICAL` tokens against a pin compared with
 * `===`: staging this file with the extensions took that gate from PASS at 28 to
 * FAIL at 30. It is the same trap that fired one level up inside that gate's own
 * exclusion docblock at T15. Do not restore the extensions.
 *
 * Phase 0 saw the catastrophic form of this same mechanism — an old report's hit
 * list naming paths that no longer exist "reads as a miss on every needle" — and
 * closed it by recording `rank` at run time. That fixed total collapse and left the
 * marginal form live. This script closes the marginal form.
 *
 * ## What it does
 *
 * Re-ranks the current tree twice, changing exactly one thing between the passes:
 * the string handed to `smartChunk` as the file's path, which is the only route by
 * which a filename reaches embedded text. Chunk bodies, chunk boundaries, corpus
 * membership, queries, model, topK and line tolerance are the shipping ones in both.
 *
 *   pass A — identity: the real paths.
 *   pass B — control:  each corpus file labelled with the path it had when the
 *                      baseline was captured, derived from the baseline report
 *                      rather than hardcoded, so it needs no edit for PR-C.
 *
 * A rank that returns to its baseline value in pass B is **not** thereby shown to
 * be caused by the file path alone, and an earlier draft of this docblock claimed
 * exactly that. It is shown to require the path change as one conjunct: reverting
 * that one input is sufficient to restore the rank, which is a statement about
 * sufficiency, not about sole causation.
 *
 * The distinction is load-bearing here because the path is **not** the only naming
 * change PR-B pushes into embedded text. `smart-chunker.ts:62-70` also emits a
 * `// Section: <label>` line and, for any chunk of at least `REPEAT_MIN_LINES`,
 * repeats the bare label three more times — and `label` is derived from the body's
 * symbol boundaries, not from the path. De-facading renamed the two symbols that
 * own the rival chunks (`fuseResultsImpl` to `fuseResults`, `searchImpl` to
 * `search`), so each chunk's embedded prefix carries a changed symbol name four
 * times over. Pass B does not revert that, by design: it is a genuine code edit,
 * not a measurement artifact.
 *
 * So the honest decomposition, and the chunk-level 2x2 at T17 shows it directly:
 * the rank loss needs **both** naming changes, and reverting **either** restores
 * it. What no reading here supports is that any change to retrieval *logic* moved
 * a rank — nothing in the moved bodies changed except the names.
 *
 * ## Pass A is the anti-drift check, and it is not optional
 *
 * This re-implements the ranking loop that `benchmarks/needles/run.ts` owns, and a
 * second implementation that can disagree with the gate it stands in for is worse
 * than none — Phase 0 refused exactly that for `check-frozen-anchors.ts`, which
 * reuses `resolve.ts` instead of reimplementing it. The mitigation is that pass A
 * must reproduce, rank for rank, the report the shipping harness actually wrote.
 * It is compared before pass B is believed, and a mismatch **aborts** rather than
 * degrading into a plausible wrong number. A gate's enabling condition is part of
 * the gate.
 *
 * ## What a reading here does NOT prove
 *
 * - **It is not a CI gate and cannot become one.** It needs a local Ollama and an
 *   8B embedding model; that is the same constraint that keeps `needles-gate.yml`
 *   `workflow_dispatch`-only and `continue-on-error: true`. It is an evidence
 *   instrument, in the same class as this feature's mutation harnesses.
 * - **The corpus is bounded** — the 8 files the 14 needles resolve into, not the
 *   full index. A pass here is weaker evidence than a pass on the full corpus and
 *   the two numbers are not comparable.
 * - **One file's control path is an approximation, and it is recorded rather than
 *   hidden.** A file assembled from more than one predecessor can only be labelled
 *   with one of them, so the control uses whichever predecessor the baseline
 *   recorded for that needle's own target span. That is the right one for the
 *   needle being judged and wrong for any other span in the same file.
 *
 * Usage:
 *   bun scripts/needles-rename-control.ts <baseline.json> <shipped-after.json>
 *
 * Exit codes:
 *   0  every needle is back at or above its baseline rank once the path is
 *      controlled for
 *   1  a needle is still below baseline with the path controlled for — a rank loss
 *      the path change does not participate in
 *   2  usage error, a report could not be read, or pass A disagreed with the
 *      shipped report — the instrument is not faithful and reports nothing
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { findRank, resolveNeedles, type ResolvedSpan } from "../benchmarks/needles/resolve.ts";
import { smartChunk } from "../packages/core/src/services/search/smart-chunker.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");
const DEFAULT_FIXTURE = "benchmarks/needles/fixtures/massa-ai.json";
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env.NEEDLE_MODEL ?? "qwen3-embedding:4b";

export interface ReportResult {
  needleId: string;
  rank: number | null;
  expected?: { filePath: string; lineStart: number; lineEnd: number };
}
export interface Report {
  model?: string;
  results: ReportResult[];
}

export interface ChunkRec {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  content: string;
}

/** Embedding is injected so the ranking loop is testable without a live model. */
export type Embedder = (text: string) => Promise<number[]>;

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * `currentPath -> the path that file had when the baseline was captured`.
 *
 * Derived from the baseline report's own `expected.filePath` against a fresh
 * resolution of the same needles, so no predecessor name is written here. That
 * keeps this file out of `check-stale-pointers.ts`'s pin — a hardcoded
 * predecessor would be a pointer token in a file that gate scans — and it means
 * PR-C, which moves the same directory again, needs no edit.
 *
 * Only differing paths are emitted, so an unrenamed corpus yields an empty map
 * and pass B becomes identical to pass A by construction.
 */
export function deriveControlPaths(
  baseline: Report,
  current: Array<{ id: string; filePath: string }>,
): Map<string, string> {
  const was = new Map(baseline.results.map((r) => [r.needleId, r.expected?.filePath]));
  const map = new Map<string, string>();
  for (const { id, filePath } of current) {
    const before = was.get(id);
    if (before && before !== filePath) map.set(filePath, before);
  }
  return map;
}

/** Chunk every corpus file, labelling it with `labelAs` where the map supplies one. */
export function buildChunks(
  root: string,
  files: string[],
  controlPaths: Map<string, string>,
): ChunkRec[] {
  const out: ChunkRec[] = [];
  for (const rel of files) {
    const content = readFileSync(resolve(root, rel), "utf8");
    // Only the label changes. `filePath` on the record stays real, so `findRank`
    // still matches against the span the needle actually resolved to.
    for (const c of smartChunk(content, controlPaths.get(rel) ?? rel, {})) {
      out.push({ filePath: rel, lineStart: c.lineStart, lineEnd: c.lineEnd, content: c.content });
    }
  }
  return out;
}

export async function rankAll(
  chunks: ChunkRec[],
  needles: Array<{ id: string; query: string }>,
  spans: Map<string, ResolvedSpan>,
  embed: Embedder,
  tolerance: number,
  topK: number,
): Promise<Map<string, number | null>> {
  const vecs: number[][] = [];
  for (const c of chunks) vecs.push(await embed(c.content));
  const ranks = new Map<string, number | null>();
  for (const n of needles) {
    const q = await embed(n.query);
    const hits = chunks
      .map((c, i) => ({ ...c, score: cosine(q, vecs[i]!) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, topK);
    ranks.set(n.id, findRank(spans.get(n.id)!, hits, tolerance).rank);
  }
  return ranks;
}

export interface Verdict {
  ok: boolean;
  faithful: boolean;
  rows: Array<{
    needleId: string;
    baseline: number | null;
    shipped: number | null;
    control: number | null;
    /** Rank the filename does not explain: control is still worse than baseline. */
    unexplained: boolean;
    /** Lost rank in the shipped run and regained it once the path was controlled. */
    restoredByPathControl: boolean;
  }>;
  disagreements: string[];
  lines: string[];
}

const worse = (a: number | null, b: number | null, topK: number): boolean =>
  (a === null ? topK + 1 : a) > (b === null ? topK + 1 : b);

export function verdictOf(
  baseline: Report,
  shipped: Report,
  identity: Map<string, number | null>,
  control: Map<string, number | null>,
  topK = 10,
): Verdict {
  const base = new Map(baseline.results.map((r) => [r.needleId, r.rank]));
  const ship = new Map(shipped.results.map((r) => [r.needleId, r.rank]));

  // Pass A must reproduce the shipping harness rank for rank, or nothing below
  // it means anything.
  const disagreements: string[] = [];
  for (const [id, rank] of ship) {
    if (identity.get(id) !== rank) {
      disagreements.push(`${id}: shipped @${rank ?? "MISS"} but pass A produced @${identity.get(id) ?? "MISS"}`);
    }
  }

  const rows: Verdict["rows"] = [];
  for (const [needleId, b] of base) {
    const s = ship.get(needleId) ?? null;
    const c = control.get(needleId) ?? null;
    rows.push({
      needleId,
      baseline: b ?? null,
      shipped: s,
      control: c,
      unexplained: worse(c, b ?? null, topK),
      restoredByPathControl: worse(s, b ?? null, topK) && !worse(c, b ?? null, topK),
    });
  }

  const faithful = disagreements.length === 0;
  const unexplained = rows.filter((r) => r.unexplained);
  const explained = rows.filter((r) => r.restoredByPathControl);
  const fmt = (n: number | null) => (n === null ? "MISS" : `@${n}`);

  const lines: string[] = [];
  if (!faithful) {
    lines.push(`[rename-control] ABORT — pass A does not reproduce the shipped report:`);
    for (const d of disagreements) lines.push(`  ${d}`);
    lines.push(`  This instrument re-implements the ranking loop run.ts owns. If the two`);
    lines.push(`  disagree, its control pass explains nothing. Nothing below is reported.`);
    return { ok: false, faithful, rows, disagreements, lines };
  }

  lines.push("per-needle rank:   baseline -> shipped -> control (filename as at baseline)");
  for (const r of rows) {
    const mark = r.unexplained ? "  UNEXPLAINED" : r.restoredByPathControl ? "  restored by path control" : "";
    lines.push(
      `  ${r.needleId.padEnd(33)} ${fmt(r.baseline).padStart(5)} -> ${fmt(r.shipped).padStart(5)} -> ${fmt(r.control).padStart(5)}${mark}`,
    );
  }
  lines.push("");
  lines.push(`  ranks lost in the shipped run and restored by the path control: ${explained.length}`);
  lines.push(
    unexplained.length === 0
      ? `[rename-control] PASS — 0 needles below their baseline rank with the file path controlled for`
      : `[rename-control] FAIL — ${unexplained.length} needle(s) still below baseline with the file path controlled for`,
  );
  return { ok: unexplained.length === 0, faithful, rows, disagreements, lines };
}

async function ollamaEmbed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: DEFAULT_MODEL, prompt: text.slice(0, 8000) }),
  });
  if (!res.ok) throw new Error(`Ollama embeddings HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { embedding?: number[]; error?: string };
  if (!json.embedding) throw new Error(`Ollama error: ${json.error ?? "no embedding"}`);
  return json.embedding;
}

async function main(argv: string[]): Promise<number> {
  if (argv.length < 2) {
    console.error("usage: bun scripts/needles-rename-control.ts <baseline.json> <shipped-after.json>");
    return 2;
  }
  let baseline: Report;
  let shipped: Report;
  try {
    baseline = JSON.parse(readFileSync(resolve(argv[0]!), "utf8")) as Report;
    shipped = JSON.parse(readFileSync(resolve(argv[1]!), "utf8")) as Report;
  } catch (error) {
    console.error(`cannot read report: ${error instanceof Error ? error.message : error}`);
    return 2;
  }

  const dataset = JSON.parse(readFileSync(resolve(REPO_ROOT, DEFAULT_FIXTURE), "utf8")) as {
    scoring: { topK: number; lineTolerance: number; staleNeedles?: string[] };
    needles: Array<{ id: string; query: string }>;
  };
  const resolved = resolveNeedles(dataset.needles as never, REPO_ROOT, {
    staleNeedles: dataset.scoring.staleNeedles,
  });
  const spans = new Map<string, ResolvedSpan>(resolved.map((r) => [r.needle.id, r.resolved]));
  const files = Array.from(new Set(resolved.map((r) => r.resolved.filePath)));
  const controlPaths = deriveControlPaths(
    baseline,
    resolved.map((r) => ({ id: r.needle.id, filePath: r.resolved.filePath })),
  );

  console.log(`corpus: ${files.length} files`);
  if (controlPaths.size === 0) {
    console.log("no corpus file was renamed since the baseline — the control pass is a no-op.");
  }
  for (const [now, then] of controlPaths) console.log(`  control label: ${now}  <-  ${then}`);

  const { topK, lineTolerance } = dataset.scoring;
  const identityChunks = buildChunks(REPO_ROOT, files, new Map());
  const controlChunks = buildChunks(REPO_ROOT, files, controlPaths);
  console.log(`\npass A (identity), ${identityChunks.length} chunks + ${dataset.needles.length} queries...`);
  const identity = await rankAll(identityChunks, dataset.needles, spans, ollamaEmbed, lineTolerance, topK);
  console.log(`pass B (control),  ${controlChunks.length} chunks + ${dataset.needles.length} queries...\n`);
  const control = await rankAll(controlChunks, dataset.needles, spans, ollamaEmbed, lineTolerance, topK);

  const v = verdictOf(baseline, shipped, identity, control, topK);
  for (const l of v.lines) (v.ok ? console.log : console.error)(l);
  if (!v.faithful) return 2;
  return v.ok ? 0 : 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
