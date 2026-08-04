#!/usr/bin/env bun
/**
 * synapse-bench-analyze-v2.ts - analyze Synapse benchmark JSONL files.
 *
 * Manual tool (PTS-03/D8): not wired into `package.json` or any CI gate, and
 * not registered in the dual-run harness — no sample benchmark JSONL ships
 * in-repo, so parity for this port rests on the usage/help/arg-error paths
 * (characterized by hand against the Python original) plus a straight
 * line-by-line translation of the analysis functions below. Run it manually
 * against real `synapse-bench-*.jsonl` output the same way the Python
 * original was invoked.
 *
 * Bun builtins only, no new dependencies (D2/D8).
 *
 * Usage (manual invocation):
 *   bun scripts/synapse-bench-analyze-v2.ts /tmp/synapse-bench-A.jsonl /tmp/synapse-bench-B.jsonl /tmp/synapse-bench-C.jsonl
 *   bun scripts/synapse-bench-analyze-v2.ts --golden synapse-golden.json /tmp/synapse-bench-*.jsonl
 *
 * Exit codes: 0 rows analyzed and printed, 1 no benchmark rows loaded, 2 usage error.
 */

import { existsSync, readFileSync } from "node:fs";

type Row = Record<string, unknown>;

/** Mirrors Python truthiness for the `or`/`if` idioms this script relies on. */
function pyTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
}

function loadJsonl(paths: string[]): Row[] {
  const rows: Row[] = [];
  for (const rawPath of paths) {
    if (!existsSync(rawPath)) {
      console.log(`warning: missing file: ${rawPath}`);
      continue;
    }
    const text = readFileSync(rawPath, "utf-8");
    const lines = text.split(/\r\n|\r|\n/);
    let lineno = 0;
    for (const rawLine of lines) {
      lineno++;
      const line = rawLine.trim();
      if (!line) continue;
      let row: Row;
      try {
        row = JSON.parse(line) as Row;
      } catch (exc) {
        console.log(`warning: invalid JSON ${rawPath}:${lineno}: ${String(exc)}`);
        continue;
      }
      if (!pyTruthy(row.batch)) {
        const stem = rawPath.replace(/\\/g, "/").split("/").pop()!.replace(/\.[^./]+$/, "");
        const parts = stem.split("-");
        row.batch = parts[parts.length - 1];
      }
      rows.push(row);
    }
  }
  return rows;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN;
}

function pct(xs: number[], p: number): number {
  if (!xs.length) return Number.NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Sample standard deviation (Bessel's correction), mirroring `statistics.stdev`. */
function stdev(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/** Tags an integer-valued cell so `fmt` renders it without decimals (mirrors Python's int vs float). */
interface PyInt {
  readonly pyInt: number;
}
function int(n: number): PyInt {
  return { pyInt: n };
}
type Cell = string | number | PyInt;

function fmt(x: Cell): string {
  if (typeof x === "object") return String((x as PyInt).pyInt);
  if (typeof x === "number") {
    if (Number.isNaN(x)) return "-";
    if (Math.abs(x) >= 100) return x.toFixed(0);
    return x.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }
  return String(x);
}

function printTable(title: string, headers: string[], rows: Cell[][]): void {
  console.log(`\n## ${title}`);
  if (!rows.length) {
    console.log("No data.");
    return;
  }
  const srows = rows.map((row) => row.map((cell) => fmt(cell)));
  let widths = headers.map((h) => h.length);
  for (const row of srows) {
    widths = widths.map((w, i) => Math.max(w, row[i]?.length ?? 0));
  }
  console.log(`| ${headers.map((h, i) => h.padEnd(widths[i]!)).join(" | ")} |`);
  console.log(`| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`);
  for (const row of srows) {
    console.log(`| ${row.map((c, i) => c.padEnd(widths[i]!)).join(" | ")} |`);
  }
}

function topFiles(row: Row, k: number): string[] {
  let files: unknown[] = pyTruthy(row.top10_files)
    ? (row.top10_files as unknown[])
    : pyTruthy(row.top5_files)
      ? (row.top5_files as unknown[])
      : [];
  if (!pyTruthy(files) && pyTruthy(row.top10)) {
    files = (row.top10 as Row[]).filter((x) => pyTruthy(x.filePath)).map((x) => x.filePath);
  }
  return files
    .slice(0, k)
    .filter((x) => pyTruthy(x))
    .map((x) => String(x));
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1.0;
  const union = new Set([...sa, ...sb]);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / union.size;
}

function ndcgAtK(files: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return Number.NaN;
  let dcg = 0.0;
  files.slice(0, k).forEach((f, idx) => {
    const i = idx + 1;
    if (relevant.has(f)) dcg += 1.0 / Math.log2(i + 1);
  });
  const idealHits = Math.min(relevant.size, k);
  let idcg = 0;
  for (let i = 1; i <= idealHits; i++) idcg += 1.0 / Math.log2(i + 1);
  return idcg ? dcg / idcg : 0.0;
}

function mrrAtK(files: string[], relevant: Set<string>, k: number): number {
  for (let idx = 0; idx < Math.min(k, files.length); idx++) {
    if (relevant.has(files[idx]!)) return 1.0 / (idx + 1);
  }
  return 0.0;
}

function recallAtK(files: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return Number.NaN;
  const top = new Set(files.slice(0, k));
  let inter = 0;
  for (const x of top) if (relevant.has(x)) inter++;
  return inter / relevant.size;
}

function precisionAtK(files: string[], relevant: Set<string>, k: number): number {
  if (k <= 0) return Number.NaN;
  const top = new Set(files.slice(0, k));
  let inter = 0;
  for (const x of top) if (relevant.has(x)) inter++;
  return inter / k;
}

function getFloat(row: Row, key: string, fallbackKey?: string, dflt = 0): number {
  const raw = row[key] ?? (fallbackKey ? row[fallbackKey] : undefined);
  const v = raw === undefined || raw === null ? dflt : raw;
  const n = Number(v);
  return Number.isNaN(n) ? dflt : n;
}

function batchSummary(rows: Row[]): void {
  const byBatch = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row.batch ?? "?");
    if (!byBatch.has(key)) byBatch.set(key, []);
    byBatch.get(key)!.push(row);
  }

  const out: Cell[][] = [];
  for (const batch of [...byBatch.keys()].sort()) {
    const br = byBatch.get(batch)!;
    const ok = br.filter((r) => r.ok === true);
    const lat = ok
      .filter((r) => r.duration_ms !== undefined || r.wall_ms !== undefined)
      .map((r) => getFloat(r, "duration_ms", "wall_ms"));
    const counts = ok.map((r) => getFloat(r, "result_count", undefined));
    const top1 = ok.map((r) => getFloat(r, "top1_score", undefined, 0));
    const div5: number[] = [];
    const dup5: number[] = [];
    for (const r of ok) {
      const n = Math.min(5, Math.trunc(getFloat(r, "result_count", undefined)));
      if (n > 0) {
        const files5 = topFiles(r, 5);
        const uniqueCount = r.unique_files_top5 !== undefined ? Number(r.unique_files_top5) : new Set(files5).size;
        const dupCount = r.duplicate_files_top5 !== undefined ? Number(r.duplicate_files_top5) : Math.max(0, files5.length - uniqueCount);
        div5.push(uniqueCount / n);
        dup5.push(dupCount / n);
      }
    }
    out.push([
      batch,
      int(br.length),
      int(ok.length),
      br.length ? (100 * ok.length) / br.length : Number.NaN,
      int(new Set(br.map((r) => r.query)).size),
      mean(lat),
      pct(lat, 0.5),
      pct(lat, 0.95),
      lat.length > 1 ? stdev(lat) : 0.0,
      mean(counts),
      ok.length ? (100 * ok.filter((r) => Math.trunc(getFloat(r, "result_count", undefined)) === 0).length) / ok.length : Number.NaN,
      mean(div5),
      mean(dup5),
      mean(top1),
    ]);
  }
  printTable(
    "Aggregate metrics by batch",
    ["batch", "req", "ok", "ok_%", "queries", "lat_avg", "lat_p50", "lat_p95", "lat_sd", "avg_results", "zero_%", "div@5", "dup@5", "avg_top1"],
    out,
  );
}

function latencyDeltas(rows: Row[], baseline: string): void {
  const grouped = new Map<string, number[]>();
  const key = (b: string, q: string) => `${b} ${q}`;
  for (const r of rows) {
    if (r.ok === true) {
      const k = key(String(r.batch), String(r.query));
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(getFloat(r, "duration_ms", "wall_ms"));
    }
  }
  const batches = [...new Set([...grouped.keys()].map((k) => k.split(" ")[0]!))].sort();
  const queriesByBatch = new Map<string, Map<string, number>>();
  for (const b of batches) {
    const m = new Map<string, number>();
    for (const [k, v] of grouped) {
      const [bb, q] = k.split(" ") as [string, string];
      if (bb === b) m.set(q, mean(v));
    }
    queriesByBatch.set(b, m);
  }
  const baseQ = queriesByBatch.get(baseline) ?? new Map<string, number>();
  const out: Cell[][] = [];
  for (const b of batches) {
    if (b === baseline) continue;
    const bq = queriesByBatch.get(b)!;
    const common = [...baseQ.keys()].filter((q) => bq.has(q)).sort();
    const deltas = common.map((q) => bq.get(q)! - baseQ.get(q)!);
    const pctDeltas = common.filter((q) => baseQ.get(q)! > 0).map((q) => ((bq.get(q)! - baseQ.get(q)!) / baseQ.get(q)!) * 100);
    out.push([b, int(common.length), mean(deltas), mean(pctDeltas), pct(deltas, 0.5), pct(deltas, 0.95)]);
  }
  printTable("Latency delta vs baseline", ["batch", "queries", "avg_delta_ms", "avg_delta_%", "delta_p50", "delta_p95"], out);
}

function rankDeltas(rows: Row[], baseline: string): void {
  const byBqr = new Map<string, Row>();
  const byBq = new Map<string, Row[]>();
  const keyBqr = (b: string, q: string, rep: number) => `${b} ${q} ${rep}`;
  const keyBq = (b: string, q: string) => `${b} ${q}`;
  for (const r of rows) {
    if (r.ok === true) {
      const b = String(r.batch);
      const q = String(r.query);
      const rep = r.repeat !== undefined && r.repeat !== null ? Number(r.repeat) : 1;
      byBqr.set(keyBqr(b, q, rep), r);
      const bqKey = keyBq(b, q);
      if (!byBq.has(bqKey)) byBq.set(bqKey, []);
      byBq.get(bqKey)!.push(r);
    }
  }

  const batches = [...new Set([...byBqr.keys()].map((k) => k.split(" ")[0]!))].sort();
  const out: Cell[][] = [];
  for (const b of batches) {
    if (b === baseline) continue;
    const j5: number[] = [];
    const j10: number[] = [];
    let commonPairs = 0;
    const queriesForBatch = (target: string) =>
      new Set([...byBq.keys()].filter((k) => k.startsWith(`${target} `)).map((k) => k.split(" ")[1]!));
    const commonQueries = [...queriesForBatch(b)].filter((q) => queriesForBatch(baseline).has(q));
    for (const q of commonQueries) {
      const baseReps = [...byBqr.keys()]
        .filter((k) => k.startsWith(`${baseline} ${q} `))
        .map((k) => Number(k.split(" ")[2]));
      const targetReps = [...byBqr.keys()].filter((k) => k.startsWith(`${b} ${q} `)).map((k) => Number(k.split(" ")[2]));
      const reps = [...new Set(baseReps)].filter((rep) => targetReps.includes(rep)).sort((a, c) => a - c);
      let pairs: [Row, Row][];
      if (reps.length) {
        pairs = reps.map((rep) => [byBqr.get(keyBqr(baseline, q, rep))!, byBqr.get(keyBqr(b, q, rep))!]);
      } else {
        // Fallback: compare all combinations if repeat IDs do not align.
        const baseRows = byBq.get(keyBq(baseline, q)) ?? [];
        const targetRows = byBq.get(keyBq(b, q)) ?? [];
        pairs = [];
        for (const a of baseRows) for (const c of targetRows) pairs.push([a, c]);
      }
      for (const [a, c] of pairs) {
        j5.push(jaccard(topFiles(a, 5), topFiles(c, 5)));
        j10.push(jaccard(topFiles(a, 10), topFiles(c, 10)));
        commonPairs++;
      }
    }
    out.push([b, int(commonQueries.length), int(commonPairs), mean(j5), mean(j10)]);
  }
  printTable("Result-set overlap vs baseline", ["batch", "queries", "pairs", "jaccard@5", "jaccard@10"], out);
}

function stability(rows: Row[]): void {
  const byBq = new Map<string, Row[]>();
  const key = (b: string, q: string) => `${b} ${q}`;
  for (const r of rows) {
    if (r.ok === true) {
      const k = key(String(r.batch), String(r.query));
      if (!byBq.has(k)) byBq.set(k, []);
      byBq.get(k)!.push(r);
    }
  }
  const byBatch = new Map<string, [number, number][]>();
  for (const [k, rs] of byBq) {
    if (rs.length < 2) continue;
    const batch = k.split(" ")[0]!;
    const vals5: number[] = [];
    const vals10: number[] = [];
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        vals5.push(jaccard(topFiles(rs[i]!, 5), topFiles(rs[j]!, 5)));
        vals10.push(jaccard(topFiles(rs[i]!, 10), topFiles(rs[j]!, 10)));
      }
    }
    if (!byBatch.has(batch)) byBatch.set(batch, []);
    byBatch.get(batch)!.push([mean(vals5), mean(vals10)]);
  }
  const out: Cell[][] = [];
  for (const batch of [...byBatch.keys()].sort()) {
    const vals = byBatch.get(batch)!;
    out.push([batch, int(vals.length), mean(vals.map((x) => x[0])), mean(vals.map((x) => x[1]))]);
  }
  printTable("Within-batch stability across repeats", ["batch", "queries", "stability_j@5", "stability_j@10"], out);
}

function goldenMetrics(rows: Row[], goldenPath: string | null): void {
  if (!goldenPath) return;
  const raw = JSON.parse(readFileSync(goldenPath, "utf-8")) as Record<string, unknown[]>;
  const golden = new Map<string, Set<string>>();
  for (const [q, files] of Object.entries(raw)) {
    golden.set(String(q), new Set(files.map((f) => String(f))));
  }
  const scored = new Map<string, Record<string, number>[]>();
  const missingQueries = new Map<string, number>();
  for (const r of rows) {
    if (r.ok !== true) continue;
    const q = String(r.query);
    const rel = golden.get(q);
    if (!rel) {
      missingQueries.set(q, (missingQueries.get(q) ?? 0) + 1);
      continue;
    }
    const files = topFiles(r, 10);
    const batch = String(r.batch);
    if (!scored.has(batch)) scored.set(batch, []);
    scored.get(batch)!.push({
      "precision@5": precisionAtK(files, rel, 5),
      "recall@5": recallAtK(files, rel, 5),
      "mrr@10": mrrAtK(files, rel, 10),
      "ndcg@10": ndcgAtK(files, rel, 10),
    });
  }
  const out: Cell[][] = [];
  for (const batch of [...scored.keys()].sort()) {
    const vals = scored.get(batch)!;
    out.push([
      batch,
      int(vals.length),
      mean(vals.map((v) => v["precision@5"]!)),
      mean(vals.map((v) => v["recall@5"]!)),
      mean(vals.map((v) => v["mrr@10"]!)),
      mean(vals.map((v) => v["ndcg@10"]!)),
    ]);
  }
  printTable("Golden-set relevance metrics", ["batch", "scored_req", "precision@5", "recall@5", "mrr@10", "ndcg@10"], out);
  if (missingQueries.size) {
    console.log(`\nGolden file did not contain ${missingQueries.size} query strings from the benchmark.`);
  }
}

function slowQueries(rows: Row[], topN: number): void {
  const byBq = new Map<string, number[]>();
  const key = (b: string, q: string) => `${b} ${q}`;
  for (const r of rows) {
    if (r.ok === true) {
      const k = key(String(r.batch), String(r.query));
      if (!byBq.has(k)) byBq.set(k, []);
      byBq.get(k)!.push(getFloat(r, "duration_ms", "wall_ms"));
    }
  }
  const items: { row: Cell[]; sortKey: number }[] = [];
  for (const [k, vals] of byBq) {
    const [batch, query] = k.split(" ") as [string, string];
    const sortKey = pct(vals, 0.95);
    items.push({ row: [batch, query.slice(0, 64), int(vals.length), mean(vals), sortKey], sortKey });
  }
  items.sort((a, b) => b.sortKey - a.sortKey);
  printTable(
    "Slowest query/batch combinations",
    ["batch", "query", "n", "lat_avg", "lat_p95"],
    items.slice(0, topN).map((x) => x.row),
  );
}

function errorSummary(rows: Row[], topN: number): void {
  const errors = rows.filter((r) => r.ok !== true);
  const out: Cell[][] = [];
  for (const r of errors.slice(0, topN)) {
    const err = (r.error as Row) ?? {};
    const msg = r.response_error ?? err.curl_error ?? err.body_sample ?? "";
    out.push([
      String(r.batch ?? ""),
      String(r.http_code ?? ""),
      String(r.curl_exit ?? ""),
      String(r.query ?? "").slice(0, 48),
      String(msg ?? "").slice(0, 80),
    ]);
  }
  printTable("Sample failures", ["batch", "http", "curl", "query", "message"], out);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `usage: synapse-bench-analyze-v2.ts [-h] [--baseline BASELINE]
                                   [--golden GOLDEN] [--top-slow TOP_SLOW]
                                   [files ...]`;

const HELP = `${USAGE}

positional arguments:
  files

options:
  -h, --help           show this help message and exit
  --baseline BASELINE
  --golden GOLDEN      JSON mapping query string -> list of relevant file
                       paths
  --top-slow TOP_SLOW`;

interface Args {
  files: string[];
  baseline: string;
  golden: string | null;
  topSlow: number;
}

function printUsageError(msg: string): void {
  process.stderr.write(`${USAGE}\nsynapse-bench-analyze-v2.ts: error: ${msg}\n`);
}

function parseArgs(argv: string[]): Args | null {
  const files: string[] = [];
  let baseline = "A";
  let golden: string | null = null;
  let topSlow = 10;
  const unrecognized: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") {
      console.log(HELP);
      process.exit(0);
    } else if (a === "--baseline") {
      if (i + 1 >= argv.length) {
        printUsageError("argument --baseline: expected one argument");
        return null;
      }
      baseline = argv[++i]!;
    } else if (a.startsWith("--baseline=")) {
      baseline = a.slice("--baseline=".length);
    } else if (a === "--golden") {
      if (i + 1 >= argv.length) {
        printUsageError("argument --golden: expected one argument");
        return null;
      }
      golden = argv[++i]!;
    } else if (a.startsWith("--golden=")) {
      golden = a.slice("--golden=".length);
    } else if (a === "--top-slow") {
      if (i + 1 >= argv.length) {
        printUsageError("argument --top-slow: expected one argument");
        return null;
      }
      const raw = argv[++i]!;
      if (!/^-?\d+$/.test(raw)) {
        printUsageError(`argument --top-slow: invalid int value: '${raw}'`);
        return null;
      }
      topSlow = Number.parseInt(raw, 10);
    } else if (a.startsWith("--top-slow=")) {
      const raw = a.slice("--top-slow=".length);
      if (!/^-?\d+$/.test(raw)) {
        printUsageError(`argument --top-slow: invalid int value: '${raw}'`);
        return null;
      }
      topSlow = Number.parseInt(raw, 10);
    } else if (a.startsWith("--")) {
      unrecognized.push(a);
    } else {
      files.push(a);
    }
  }

  if (unrecognized.length) {
    printUsageError(`unrecognized arguments: ${unrecognized.join(" ")}`);
    return null;
  }

  return {
    files: files.length ? files : ["/tmp/synapse-bench-A.jsonl", "/tmp/synapse-bench-B.jsonl", "/tmp/synapse-bench-C.jsonl"],
    baseline,
    golden,
    topSlow,
  };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args === null) return 2;

  const rows = loadJsonl(args.files);
  if (!rows.length) {
    console.error("No benchmark rows loaded.");
    return 1;
  }

  console.log(`Loaded ${rows.length} rows from ${args.files.length} file(s).`);
  batchSummary(rows);
  latencyDeltas(rows, args.baseline);
  rankDeltas(rows, args.baseline);
  stability(rows);
  goldenMetrics(rows, args.golden);
  slowQueries(rows, args.topSlow);
  errorSummary(rows, 10);
  console.log(
    "\nNote: avg_top1 is useful for sanity checks, but do not treat it as comparable quality if batches use different scoring formulas.",
  );
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
