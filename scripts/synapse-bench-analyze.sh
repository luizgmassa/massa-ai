#!/bin/bash
# Compare batches A (off), B (Synapse), C (Synapse+Attention).
set -euo pipefail

A=/tmp/synapse-bench-A.jsonl
B=/tmp/synapse-bench-B.jsonl
C=/tmp/synapse-bench-C.jsonl

echo "=== Aggregate metrics ==="
for f in A B C; do
  case $f in A) src=$A;; B) src=$B;; C) src=$C;; esac
  jq -s --arg name "$f" '
    {
      name: $name,
      n: length,
      avg_latency_ms: (([.[].duration_ms] | add) / length | floor),
      avg_top1: ([.[].top1_score] | add / length),
      avg_unique_files_top5: ([.[].unique_files_top5] | add / length),
      avg_unique_files_top10: ([.[].unique_files_top10] | add / length),
      diversity_at_5_pct: ([.[].unique_files_top5] | add / length * 20 | floor)
    }' "$src"
done

echo
echo "=== Top-5 Jaccard (A vs B per query) ==="
paste <(jq -c '{q:.query, top5:[.top10_files[:5][]]}' "$A") <(jq -c '{q:.query, top5:[.top10_files[:5][]]}' "$B") | \
  awk -F'\t' '{print $1; print $2}' | \
  jq -s '
    [range(0;length/2) as $i |
     {q: .[$i*2].q,
      a: .[$i*2].top5,
      b: .[$i*2+1].top5}] |
    map({
      query: (.q[:40]),
      jaccard_AB: (
        ((.a | unique) as $sa | (.b | unique) as $sb |
         ($sa + $sb | unique) as $u |
         ($sa - ($sa - $sb)) as $i |
         if $u|length == 0 then 1.0 else ($i|length) / ($u|length) end
        )
      )
    })' | jq -c '.[]'

echo
echo "=== Top-5 Jaccard (A vs C per query) ==="
paste <(jq -c '{q:.query, top5:[.top10_files[:5][]]}' "$A") <(jq -c '{q:.query, top5:[.top10_files[:5][]]}' "$C") | \
  awk -F'\t' '{print $1; print $2}' | \
  jq -s '
    [range(0;length/2) as $i |
     {q: .[$i*2].q,
      a: .[$i*2].top5,
      c: .[$i*2+1].top5}] |
    map({
      query: (.q[:40]),
      jaccard_AC: (
        ((.a | unique) as $sa | (.c | unique) as $sc |
         ($sa + $sc | unique) as $u |
         ($sa - ($sa - $sc)) as $i |
         if $u|length == 0 then 1.0 else ($i|length) / ($u|length) end
        )
      )
    })' | jq -c '.[]'

echo
echo "=== Top-5 Jaccard summary ==="
echo "A vs B avg:"
paste <(jq -c '[.top10_files[:5][]]' "$A") <(jq -c '[.top10_files[:5][]]' "$B") | \
  awk -F'\t' 'BEGIN{sum=0;n=0} {
    cmd="echo -e \"" $1 "\\n" $2 "\" | jq -s \"((.[0]|unique) as $a | (.[1]|unique) as $b | (($a + $b | unique)|length) as $u | (($a - ($a - $b))|length) as $i | if $u==0 then 1 else $i/$u end)\"";
    cmd | getline j; close(cmd); sum+=j; n++;
  } END{printf "  %.3f (over %d queries)\n", sum/n, n}'

echo "A vs C avg:"
paste <(jq -c '[.top10_files[:5][]]' "$A") <(jq -c '[.top10_files[:5][]]' "$C") | \
  awk -F'\t' 'BEGIN{sum=0;n=0} {
    cmd="echo -e \"" $1 "\\n" $2 "\" | jq -s \"((.[0]|unique) as $a | (.[1]|unique) as $b | (($a + $b | unique)|length) as $u | (($a - ($a - $b))|length) as $i | if $u==0 then 1 else $i/$u end)\"";
    cmd | getline j; close(cmd); sum+=j; n++;
  } END{printf "  %.3f (over %d queries)\n", sum/n, n}'

echo "B vs C avg:"
paste <(jq -c '[.top10_files[:5][]]' "$B") <(jq -c '[.top10_files[:5][]]' "$C") | \
  awk -F'\t' 'BEGIN{sum=0;n=0} {
    cmd="echo -e \"" $1 "\\n" $2 "\" | jq -s \"((.[0]|unique) as $a | (.[1]|unique) as $b | (($a + $b | unique)|length) as $u | (($a - ($a - $b))|length) as $i | if $u==0 then 1 else $i/$u end)\"";
    cmd | getline j; close(cmd); sum+=j; n++;
  } END{printf "  %.3f (over %d queries)\n", sum/n, n}'
