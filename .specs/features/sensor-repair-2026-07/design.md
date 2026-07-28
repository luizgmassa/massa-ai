# Sensor Repair 2026-07 — Design (SEN-04 fork)

- **Slug**: `sensor-repair-2026-07`
- **Status**: written mid-Execute, 2026-07-28, under `tasks.md`'s safety valve — *"If a design
  fork appears mid-Execute, stop and write `design.md`."*
- **Scope**: SEN-04 only. SEN-01, SEN-02, SEN-03 and BEH-01 keep their inline design.
- **Trigger**: T7's pre-change equivalence baseline, run before T5 per the ordering constraint.

---

## Why this document exists

The spec's design was inline because *"none introduces an architectural boundary, a data-model
change, or a public contract change"* and *"SEN-04 is the only one with genuine design content, and
it is specified concretely."*

The first measurement taken against SEN-04 falsified three of its acceptance criteria. Not the
mechanism — the mechanism is real and worse than specified — but the **premise every criterion was
written on: that the fixture is currently valid and the gate currently passes.** It is not, and it
does not.

---

## The measurement

Pre-change baseline. Unchanged tree at `c33a5c1`, `qwen3-embedding:8b`, local Ollama,
`benchmarks/needles/reports/massa-ai-before-anchoring-results.json`.

```
files: 6, total chunks: 68

  N01-pagerank-damping               medium   @1
  N02-pagerank-iterations            medium   @1
  N03-keyword-boost-code-query       hard     @1
  N04-rrf-vector-blend               hard     @1
  N05-centrality-rerank-bonus        hard     @5
  N06-minscore-on-raw-vector         hard     @3
  N07-brace-counter-strip-strings    hard     MISS   ← smart-chunker.ts:642-674
  N08-no-merge-labeled-chunks        medium   MISS   ← smart-chunker.ts:737-744
  N09-markdown-no-headings-fallback  medium   MISS   ← smart-chunker.ts:198-206
  N10-discover-sort-priority         medium   @1
  N11-fingerprint-cache-key          medium   @1
  N12-vector-table-by-dimension      medium   @10
  N13-orphaned-chunks-warning        hard     @1
  N14-binary-quantization-sign       medium   @3

  hit@1  = 0.500  >= 0.5   → PASS   (exact knife edge)
  MRR    = 0.569  >= 0.65  → FAIL
```

**The gate is red today, on an untouched tree, before any refactor.** All three misses share one
top hit — `smart-chunker.ts:30-82` — because that 81-line file yields only 2 chunks and neither
contains the targeted content.

Wall clock: **~2 minutes**, not the ~90 minutes `tasks.md` and `HANDOFF.md` budget. That figure
comes from `needles-gate.yml`'s header, which sizes the fixture for a **2-core CI runner**. Both
documents carry it forward as the local cost. It is not.

---

## Root cause

`smart-chunker.ts` was split into `services/search/chunker/` at **`56c84d1`** — *"Wave 6:
Architecture & medium features (N31 god-files…)"*. It went from **945 lines to 81**, and is now a
dispatcher plus a re-export barrel.

The needle fixture was authored at **`af3dab6`** — *"test(search): promote needle benchmark to
standalone harness"* — the commit immediately before, where the file was still 945 lines. The
fixture has not been touched since `4feca2d` (the repo rename).

So needles N07, N08 and N09 target lines **642-674, 737-744 and 198-206** of a file that now ends
at line **81**.

**The exact transformation SEN-04 predicts would break the gate has already happened, to this exact
file, and the gate has been failing ever since.** The spec treats it as a future risk. It is a past
event that nobody measured.

---

## The failure path the spec does not model

SEN-04 AC-2 replaces `run.ts:233-236` — the `[warn] needle file missing, skipping` branch — with a
hard failure, and calls the silent skip *"the core of the requirement"*. That branch is guarded by
`existsSync(abs)`.

**`smart-chunker.ts` exists.** `existsSync` returns true, the file is chunked, no warning is
emitted, and the needle scores zero through `scorer.ts:94-104`'s line-intersection test against a
span that has no chunk behind it.

| # | Path | Firing today | Signal emitted | Covered by AC-2 as written |
| --- | --- | --- | --- | --- |
| 1 | Target file absent | no | `[warn]`, skip | **yes** |
| 2 | Target file present, span past EOF | **yes, ×3** | **none at all** | **no** |
| 3 | Target file present, span in range, content moved away | not currently | none | partly (AC-3) |

Path 2 is quieter than path 1 — the case the spec calls the core of the requirement at least prints
a line. **Implementing SEN-04 exactly as specified would not have caught the defect that is
actually firing.**

This is T1's lesson repeating: *the named mechanism got verified, not every mechanism that reaches
the same symptom.*

---

## The transformation was not verbatim

AC-3 requires resolution to tolerate three transformations — verbatim move to another file, file
rename, within-file move beyond `lineTolerance` — and explicitly **not** reformatting, *"because
the repo-wide reformat is a separate PR."*

The Wave 6 split is none of those. It **stripped comments while moving code**. Recovered from
`af3dab6`, N07's span opened with:

```ts
    // Update depth using the line's brace counts (strings/regex/comments
    // stripped first, so braces inside `"{"`, `/\{/`, etc. don't drift the
    // depth — this matters for files like parsers that contain regex
    // literals with curly braces).
    depth += netBraceDelta(line);
```

At HEAD, `chunker-code.ts` has `depth += netBraceDelta(line);` with no comment block. The same
happened to `netBraceDelta`'s JSDoc, to its per-line `.replace()` comments, to N08's four-line
comment in `chunker-post.ts`, and to N09's JSDoc in `chunker-markdown.ts`. Systematic, not
incidental.

Two consequences:

1. **Anchors must be authored on code, not comments.** N07's original span *starts* on a comment
   line that no longer exists anywhere.
2. **A span cannot be carried forward as a line-count delta.** The regions are shorter now. An
   `anchor + spanLines` design reproduces the old length against new content and silently
   mis-targets.

---

## Decision

Recover the three needles' original content from `af3dab6`, and anchor on it. Confirmed by the
user, 2026-07-28.

All three anchors verified unique repo-wide (AC-9), each resolving into the module that received
the code:

| Needle | Anchor (substring, code only) | Resolves to |
| --- | --- | --- |
| N07 | `function netBraceDelta(line: string): number {` | `chunker/chunker-code.ts:168` |
| N08 | `if (chunk.label && chunk.type === "code_block") {` | `chunker/chunker-post.ts:33` |
| N09 | `const hasHeading = /^\s*#{1,6}\s+/m.test(content);` | `chunker/chunker-markdown.ts:11` |

Note N07: at `af3dab6` the line was `function netBraceDelta(…)`; at HEAD it is `export function
netBraceDelta(…)`. **Anchors match as substrings, never as whole lines** — a whole-line match would
have failed on an added `export`.

### Anchor shape

```jsonc
"expected": {
  "anchor":    "<unique substring locating lineStart>",
  "endAnchor": "<substring, unique within the resolved file, locating lineEnd>"
}
```

Two anchors rather than `anchor + spanLines`, because AC-8 demands the resolved span reproduce the
existing `lineStart`/`lineEnd` **exactly** on an unchanged tree, and a length delta cannot survive
the comment-stripping class of move. `filePath`, `lineStart` and `lineEnd` are removed from the
fixture and resolved at run time.

---

## The corpus problem — why this must ship as two steps

`run.ts` builds its corpus from the distinct `expected.filePath` values across the fixture: six
files, 68 chunks. Resolution changes that set. `smart-chunker.ts` leaves it (no needle targets it
any more) and three `chunker/*.ts` modules enter, so the corpus goes from **6 files to 8**.

Every needle competes against every chunk. **Changing the corpus changes rank competition for all
14 needles, including the 11 whose targets never moved.** AC-4's *"identical per-needle ranks"* is
therefore unsatisfiable if anchoring and stale-needle recovery land in one step — and it would fail
for a reason that has nothing to do with whether the anchoring is correct, which is the exact
failure mode AC-4 exists to detect.

**T5 splits in two:**

| Step | Change | Corpus | AC-4 equivalence |
| --- | --- | --- | --- |
| **T5a** | Anchor the 11 valid needles; keep N07/N08/N09 targeting `smart-chunker.ts` as they are | **unchanged** — 6 files, 68 chunks | **provable, and required**: ranks must be byte-identical, MRR must stay 0.569 |
| **T5b** | Recover N07/N08/N09 from `af3dab6`, anchor them into `chunker/*.ts` | 6 → 8 files | not applicable; a **new baseline** is recorded instead |

T5a is the pure representation change the spec intended, and it is the only step against which
"a representation change that moves a score is not a representation change" is a meaningful test.
T5b is a fixture repair whose whole purpose is to move the score — from a false 0.569 to whatever
the retrieval quality actually is.

Both loud-failure requirements (AC-2, plus new path 2 below) land in T5a, because they are what
makes T5b's staleness impossible to reintroduce silently.

---

## Acceptance criteria rewrites

Rewritten in place in `spec.md` with the measurement attached, following the T1 precedent: *when a
criterion and a measurement disagree, the measurement wins and the criterion gets rewritten with
the evidence.*

### SEN-04 AC-2 — extended

Add path 2 to the hard-failure set. **A resolved span that falls outside the target file's line
count is a hard failure**, named with the needle id, the file, the resolved span and the file's
length. Zero anchor matches, two-or-more anchor matches, and an out-of-range span all exit non-zero
before scoring. Discriminating check: point a needle at a span past EOF and assert non-zero exit —
today that produces a passing run with a silently wrong number.

### SEN-04 AC-6 — was "all 14 needles keep their identical target span"

Unsatisfiable as written. Three of the fourteen have no valid span to keep.

**Rewritten**: the 11 needles whose targets resolve within their current files keep byte-identical
spans, and no needle is added, removed or **re-queried**. N07, N08 and N09 are **re-targeted, once,
to the location their original content now occupies** — recovered from `af3dab6`, not re-authored
against current code. Their queries are unchanged. The recovery is recorded needle-by-needle with
the source commit and the pre-split span.

### SEN-04 AC-8 — was "resolving the unchanged tree reproduces each needle's existing lineStart/lineEnd exactly"

Unsatisfiable for the same three: their existing values are stale.

**Rewritten**: resolution reproduces the existing `lineStart`/`lineEnd` exactly for the **11 valid
needles**, and a non-zero diff on any of them falsifies "representation-only". For N07/N08/N09 the
recorded spans are the resolved ones, and the check is instead that each anchor resolves to exactly
one location repo-wide (AC-9) and that the resolved span lies within its file.

### T7 AC-4 — was "ranks identical" and "both floors still clear"

Split across the two steps.

- **After T5a**: per-needle ranks identical to the pre-change baseline, MRR **0.569**, hit@1
  **0.500**. Any divergence stops the work — corpus and representation are both unchanged, so a
  rank move has no legitimate explanation.
- **After T5b**: a new baseline is recorded. Floors are **not** a pass condition for this PR.

**The floors cannot be a completion criterion for this feature.** They fail on the tree this PR
starts from, for a reason that predates it. Making them pass is a retrieval-quality question, and
SEN-04's "Out of Scope" already forbids touching the floors here — *"the floors were never the
defect. Changing them here would hide what the repaired sensors are about to reveal."* The same
logic forbids adopting them as this PR's bar.

What this PR owes is a sensor that **reports the truth loudly**. Whether the truth clears 0.65 is
the next question, and it belongs to whoever answers it with retrieval work, not fixture edits.

---

## What this does not change

- The decision to content-anchor, and to make a stale fixture fail loudly. Both are reinforced.
- SEN-04 AC-1, AC-3, AC-5, AC-7, AC-9.
- Every other requirement. SEN-01, SEN-02, SEN-03 and BEH-01 are untouched by this fork.
- The "no re-authoring needle content" constraint. Recovering a span from the commit that authored
  the fixture is not re-authoring; writing fresh anchors against current code would have been, and
  was rejected.

---

## Evidence

| Claim | How it was measured |
| --- | --- |
| Baseline: hit@1 0.500 PASS, MRR 0.569 FAIL | `bun benchmarks/needles/run.ts --label before-anchoring` at `c33a5c1` |
| N07/N08/N09 MISS, shared top hit `smart-chunker.ts:30-82` | same run, per-needle table |
| `smart-chunker.ts` is 81 lines | `wc -l` at `c33a5c1` |
| Needle spans 198-206 / 642-674 / 737-744 | `benchmarks/needles/fixtures/massa-ai.json` |
| Split at `56c84d1`, 945 → 81 lines | `git show <sha>:…/smart-chunker.ts \| wc -l` across the file's history |
| Fixture authored at `af3dab6`, file then 945 lines | `git log -- benchmarks/needles/fixtures/…`; `git show af3dab6:…` |
| Comment-stripping during the split | `git show af3dab6:…` spans vs `chunker-{code,post,markdown}.ts` at HEAD |
| Three anchors unique repo-wide | `rg -F` over the repo, excluding `node_modules`, `dist`, `reports` |
| `export` prefix added to `netBraceDelta` | `af3dab6:642-674` vs `chunker-code.ts:168` |
| Corpus is the distinct `expected.filePath` set | `run.ts` "files: 6, total chunks: 68" against 6 distinct target files |
| Run cost ~2 min, not ~90 | wall clock on the baseline run; 90 min is `needles-gate.yml`'s 2-core CI figure |
