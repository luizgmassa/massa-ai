#!/usr/bin/env python3
"""Analyze Synapse benchmark JSONL files.

Examples:
  python3 scripts/synapse-bench-analyze-v2.py /tmp/synapse-bench-A.jsonl /tmp/synapse-bench-B.jsonl /tmp/synapse-bench-C.jsonl
  python3 scripts/synapse-bench-analyze-v2.py --golden synapse-golden.json /tmp/synapse-bench-*.jsonl
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


def load_jsonl(paths: Iterable[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for raw_path in paths:
        path = Path(raw_path)
        if not path.exists():
            print(f"warning: missing file: {path}")
            continue
        with path.open("r", encoding="utf-8") as f:
            for lineno, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as exc:
                    print(f"warning: invalid JSON {path}:{lineno}: {exc}")
                    continue
                if not row.get("batch"):
                    stem = path.stem
                    row["batch"] = stem.rsplit("-", 1)[-1]
                rows.append(row)
    return rows


def mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def pct(xs: list[float], p: float) -> float:
    if not xs:
        return float("nan")
    xs = sorted(xs)
    if len(xs) == 1:
        return xs[0]
    pos = (len(xs) - 1) * p
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return xs[lo]
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def fmt(x: Any) -> str:
    if isinstance(x, float):
        if math.isnan(x):
            return "-"
        if abs(x) >= 100:
            return f"{x:.0f}"
        return f"{x:.3f}".rstrip("0").rstrip(".")
    return str(x)


def print_table(title: str, headers: list[str], rows: list[list[Any]]) -> None:
    print(f"\n## {title}")
    if not rows:
        print("No data.")
        return
    srows = [[fmt(cell) for cell in row] for row in rows]
    widths = [len(h) for h in headers]
    for row in srows:
        widths = [max(w, len(c)) for w, c in zip(widths, row)]
    print("| " + " | ".join(h.ljust(w) for h, w in zip(headers, widths)) + " |")
    print("| " + " | ".join("-" * w for w in widths) + " |")
    for row in srows:
        print("| " + " | ".join(c.ljust(w) for c, w in zip(row, widths)) + " |")


def top_files(row: dict[str, Any], k: int) -> list[str]:
    files = row.get("top10_files") or row.get("top5_files") or []
    if not files and row.get("top10"):
        files = [x.get("filePath") for x in row["top10"] if x.get("filePath")]
    return [str(x) for x in files[:k] if x]


def jaccard(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 1.0
    return len(sa & sb) / len(sa | sb)


def ndcg_at_k(files: list[str], relevant: set[str], k: int) -> float:
    if not relevant:
        return float("nan")
    dcg = 0.0
    for i, f in enumerate(files[:k], 1):
        if f in relevant:
            dcg += 1.0 / math.log2(i + 1)
    ideal_hits = min(len(relevant), k)
    idcg = sum(1.0 / math.log2(i + 1) for i in range(1, ideal_hits + 1))
    return dcg / idcg if idcg else 0.0


def mrr_at_k(files: list[str], relevant: set[str], k: int) -> float:
    for i, f in enumerate(files[:k], 1):
        if f in relevant:
            return 1.0 / i
    return 0.0


def recall_at_k(files: list[str], relevant: set[str], k: int) -> float:
    if not relevant:
        return float("nan")
    return len(set(files[:k]) & relevant) / len(relevant)


def precision_at_k(files: list[str], relevant: set[str], k: int) -> float:
    if k <= 0:
        return float("nan")
    return len(set(files[:k]) & relevant) / k


def batch_summary(rows: list[dict[str, Any]]) -> None:
    by_batch: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_batch[str(row.get("batch", "?"))].append(row)

    out = []
    for batch, br in sorted(by_batch.items()):
        ok = [r for r in br if r.get("ok") is True]
        lat = [float(r.get("duration_ms", r.get("wall_ms", 0))) for r in ok if r.get("duration_ms", r.get("wall_ms")) is not None]
        counts = [float(r.get("result_count", 0)) for r in ok]
        top1 = [float(r.get("top1_score", 0) or 0) for r in ok]
        div5 = []
        dup5 = []
        for r in ok:
            n = min(5, int(r.get("result_count", 0) or 0))
            if n > 0:
                unique = int(r.get("unique_files_top5", len(set(top_files(r, 5)))) or 0)
                dup = int(r.get("duplicate_files_top5", max(0, len(top_files(r, 5)) - unique)) or 0)
                div5.append(unique / n)
                dup5.append(dup / n)
        out.append([
            batch,
            len(br),
            len(ok),
            100 * len(ok) / len(br) if br else float("nan"),
            len({r.get("query") for r in br}),
            mean(lat),
            pct(lat, 0.50),
            pct(lat, 0.95),
            statistics.stdev(lat) if len(lat) > 1 else 0.0,
            mean(counts),
            100 * sum(1 for r in ok if int(r.get("result_count", 0) or 0) == 0) / len(ok) if ok else float("nan"),
            mean(div5),
            mean(dup5),
            mean(top1),
        ])
    print_table(
        "Aggregate metrics by batch",
        ["batch", "req", "ok", "ok_%", "queries", "lat_avg", "lat_p50", "lat_p95", "lat_sd", "avg_results", "zero_%", "div@5", "dup@5", "avg_top1"],
        out,
    )


def latency_deltas(rows: list[dict[str, Any]], baseline: str) -> None:
    grouped: dict[tuple[str, str], list[float]] = defaultdict(list)
    for r in rows:
        if r.get("ok") is True:
            grouped[(str(r.get("batch")), str(r.get("query")))].append(float(r.get("duration_ms", r.get("wall_ms", 0)) or 0))
    batches = sorted({b for b, _ in grouped})
    queries_by_batch = {b: {q: mean(v) for (bb, q), v in grouped.items() if bb == b} for b in batches}
    base_q = queries_by_batch.get(baseline, {})
    out = []
    for b in batches:
        if b == baseline:
            continue
        common = sorted(set(base_q) & set(queries_by_batch[b]))
        deltas = [queries_by_batch[b][q] - base_q[q] for q in common]
        pct_deltas = [(queries_by_batch[b][q] - base_q[q]) / base_q[q] * 100 for q in common if base_q[q] > 0]
        out.append([b, len(common), mean(deltas), mean(pct_deltas), pct(deltas, 0.50), pct(deltas, 0.95)])
    print_table("Latency delta vs baseline", ["batch", "queries", "avg_delta_ms", "avg_delta_%", "delta_p50", "delta_p95"], out)


def rank_deltas(rows: list[dict[str, Any]], baseline: str) -> None:
    by_bqr: dict[tuple[str, str, int], dict[str, Any]] = {}
    by_bq: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        if r.get("ok") is True:
            b = str(r.get("batch"))
            q = str(r.get("query"))
            rep = int(r.get("repeat", 1) or 1)
            by_bqr[(b, q, rep)] = r
            by_bq[(b, q)].append(r)

    batches = sorted({b for b, _, _ in by_bqr})
    out = []
    for b in batches:
        if b == baseline:
            continue
        j5, j10 = [], []
        common_pairs = 0
        common_queries = {q for bb, q in by_bq if bb == b} & {q for bb, q in by_bq if bb == baseline}
        for q in common_queries:
            base_reps = {rep for bb, qq, rep in by_bqr if bb == baseline and qq == q}
            target_reps = {rep for bb, qq, rep in by_bqr if bb == b and qq == q}
            reps = sorted(base_reps & target_reps)
            if reps:
                pairs = [(by_bqr[(baseline, q, rep)], by_bqr[(b, q, rep)]) for rep in reps]
            else:
                # Fallback: compare all combinations if repeat IDs do not align.
                pairs = list(itertools.product(by_bq[(baseline, q)], by_bq[(b, q)]))
            for a, c in pairs:
                j5.append(jaccard(top_files(a, 5), top_files(c, 5)))
                j10.append(jaccard(top_files(a, 10), top_files(c, 10)))
                common_pairs += 1
        out.append([b, len(common_queries), common_pairs, mean(j5), mean(j10)])
    print_table("Result-set overlap vs baseline", ["batch", "queries", "pairs", "jaccard@5", "jaccard@10"], out)


def stability(rows: list[dict[str, Any]]) -> None:
    by_bq: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        if r.get("ok") is True:
            by_bq[(str(r.get("batch")), str(r.get("query")))].append(r)
    by_batch: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for (batch, _query), rs in by_bq.items():
        if len(rs) < 2:
            continue
        vals5, vals10 = [], []
        for a, b in itertools.combinations(rs, 2):
            vals5.append(jaccard(top_files(a, 5), top_files(b, 5)))
            vals10.append(jaccard(top_files(a, 10), top_files(b, 10)))
        by_batch[batch].append((mean(vals5), mean(vals10)))
    out = []
    for batch, vals in sorted(by_batch.items()):
        out.append([batch, len(vals), mean([x[0] for x in vals]), mean([x[1] for x in vals])])
    print_table("Within-batch stability across repeats", ["batch", "queries", "stability_j@5", "stability_j@10"], out)


def golden_metrics(rows: list[dict[str, Any]], golden_path: str | None) -> None:
    if not golden_path:
        return
    with Path(golden_path).open("r", encoding="utf-8") as f:
        raw = json.load(f)
    golden: dict[str, set[str]] = {str(q): set(map(str, files)) for q, files in raw.items()}
    scored: dict[str, list[dict[str, float]]] = defaultdict(list)
    missing_queries: Counter[str] = Counter()
    for r in rows:
        if r.get("ok") is not True:
            continue
        q = str(r.get("query"))
        if q not in golden:
            missing_queries[q] += 1
            continue
        rel = golden[q]
        files = top_files(r, 10)
        scored[str(r.get("batch"))].append({
            "precision@5": precision_at_k(files, rel, 5),
            "recall@5": recall_at_k(files, rel, 5),
            "mrr@10": mrr_at_k(files, rel, 10),
            "ndcg@10": ndcg_at_k(files, rel, 10),
        })
    out = []
    for batch, vals in sorted(scored.items()):
        out.append([
            batch,
            len(vals),
            mean([v["precision@5"] for v in vals]),
            mean([v["recall@5"] for v in vals]),
            mean([v["mrr@10"] for v in vals]),
            mean([v["ndcg@10"] for v in vals]),
        ])
    print_table("Golden-set relevance metrics", ["batch", "scored_req", "precision@5", "recall@5", "mrr@10", "ndcg@10"], out)
    if missing_queries:
        print(f"\nGolden file did not contain {len(missing_queries)} query strings from the benchmark.")


def slow_queries(rows: list[dict[str, Any]], top_n: int) -> None:
    by_bq: dict[tuple[str, str], list[float]] = defaultdict(list)
    for r in rows:
        if r.get("ok") is True:
            by_bq[(str(r.get("batch")), str(r.get("query")))].append(float(r.get("duration_ms", r.get("wall_ms", 0)) or 0))
    items = []
    for (batch, query), vals in by_bq.items():
        items.append([batch, query[:64], len(vals), mean(vals), pct(vals, 0.95)])
    items.sort(key=lambda x: x[4], reverse=True)
    print_table("Slowest query/batch combinations", ["batch", "query", "n", "lat_avg", "lat_p95"], items[:top_n])


def error_summary(rows: list[dict[str, Any]], top_n: int) -> None:
    errors = [r for r in rows if r.get("ok") is not True]
    out = []
    for r in errors[:top_n]:
        err = r.get("error") or {}
        msg = r.get("response_error") or err.get("curl_error") or err.get("body_sample") or ""
        out.append([r.get("batch"), r.get("http_code"), r.get("curl_exit"), str(r.get("query", ""))[:48], str(msg)[:80]])
    print_table("Sample failures", ["batch", "http", "curl", "query", "message"], out)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="*", default=["/tmp/synapse-bench-A.jsonl", "/tmp/synapse-bench-B.jsonl", "/tmp/synapse-bench-C.jsonl"])
    parser.add_argument("--baseline", default="A")
    parser.add_argument("--golden", default=None, help="JSON mapping query string -> list of relevant file paths")
    parser.add_argument("--top-slow", type=int, default=10)
    args = parser.parse_args()

    rows = load_jsonl(args.files)
    if not rows:
        raise SystemExit("No benchmark rows loaded.")

    print(f"Loaded {len(rows)} rows from {len(args.files)} file(s).")
    batch_summary(rows)
    latency_deltas(rows, args.baseline)
    rank_deltas(rows, args.baseline)
    stability(rows)
    golden_metrics(rows, args.golden)
    slow_queries(rows, args.top_slow)
    error_summary(rows, 10)
    print("\nNote: avg_top1 is useful for sanity checks, but do not treat it as comparable quality if batches use different scoring formulas.")


if __name__ == "__main__":
    main()
