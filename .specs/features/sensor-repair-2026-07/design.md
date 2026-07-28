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

---

# Second fork — the anchor shape itself (T5a, 2026-07-28)

The shape proposed above (`{anchor, endAnchor}`) does not survive contact with the
fixture's actual boundaries. Same failure mode as everything else on this feature: the
design was written without looking at the lines it describes.

## The measurement

Repo-wide occurrence counts of each of the 11 valid needles' boundary lines, over tracked
`.ts` excluding `node_modules`, `dist` and `generated`:

| Needle | `lineStart` line | n | `lineEnd` line | n |
| --- | --- | --- | --- | --- |
| N01 | `const DAMPING = 0.85;` | 1 | same | 1 |
| N02 | `const ITERATIONS = 20;` | 1 | same | 1 |
| N03 | *comment* | — | **blank line** | — |
| N04 | `const rrfNormalized = rrfScore / maxRrfScore;` | 1 | `const combinedScore = …` | 1 |
| N05 | *comment* | — | `const normalizedScore = …` | 1 |
| N06 | `    }` | **11130** | `rerankedTop = applyProximityRerank(…)` | 1 |
| N10 | `const results = await Promise.all(` | **4** | `ctx.emit({` | **16** |
| N11 | `projectId: ctx.projectId,` | **11** | `return discovered;` | 1 |
| N12 | *comment separator* | — | `` return `vector_documents_${dimensions}d`; `` | 1 |
| N13 | **blank line** | — | `` GROUP BY project_id`, `` | 1 |
| N14 | *comment (JSDoc)* | — | `private normalizeScore(raw: unknown): number {` | 1 |

**Only 3 of 11 — N01, N02, N04 — have both boundaries on a repo-wide-unique code line.**
The `endAnchor` half is mostly fine; it is the **start** boundaries that are comments,
blank lines, or `    }`.

Two of these are not merely hard, they are impossible: a **blank line cannot be a unique
anchor**, and N03 ends on one while N13 starts on one. No amount of lengthening fixes that.

The root cause is that the existing spans are eyeballed chunk-ish regions, not syntactic
units. Their boundaries are arbitrary. Any scheme required to reproduce them *exactly*
inherits that arbitrariness.

## Decision — anchor on code inside the span, plus signed offsets

Confirmed by the user, 2026-07-28.

```jsonc
"expected": {
  "anchor":      "<unique code substring INSIDE the span>",
  "startOffset": <signed line delta from the anchor's line to lineStart>,
  "endOffset":   <signed line delta from the anchor's line to lineEnd>
}
```

This keeps every property that mattered and drops only the one that was unbuildable:

- **AC-8 holds exactly.** Measured: all 11 resolve to `n = 1` repo-wide and reproduce their
  previous `lineStart`/`lineEnd` **byte-for-byte, zero diff**.
- **Every anchor sits on code**, never a comment — the Wave 6 lesson is preserved, and now
  enforced by a test rather than by convention.
- **AC-3's three transformations all still work**: verbatim move to another file, file
  rename, and within-file move of any distance. All three preserve the span's *internal*
  line structure, which is exactly what offsets depend on.

The tradeoff is stated rather than hidden: offsets do **not** survive edits *inside* the
span. AC-3 already excludes that class ("not required to tolerate reformatting, because the
repo-wide reformat is a separate PR").

**Why this is not the `anchor + spanLines` design rejected above.** That objection was that
"the regions are shorter now" — true, and it is an objection about the three *stale* needles
whose content genuinely changed between `af3dab6` and HEAD. It does not apply to the 11
whose files never moved, and for the three recovered in T5b the offsets are authored against
*current* content, so they are correct by construction. The rejected design carried an
**old** length forward onto **new** content; this one measures the length that is there.

## Third fork — scoping the loud failure so T5a remains measurable

Landing the out-of-range hard failure in T5a collides with T5a's own purpose. N07/N08/N09
have spans past EOF *right now*; a hard failure that covers them aborts the T5a run before
scoring, and the equivalence baseline — the single most important evidence in this PR —
cannot be produced at all.

**Decision, confirmed by the user**: hard failure is a property of **anchor resolution**, so
it covers anchored needles only. N07/N08/N09 stay positional and are grandfathered by an
explicit `scoring.staleNeedles` id list for exactly one commit.

The list is checked in **both** directions, which is what keeps it from becoming a
permanent exemption:

| Condition | Outcome |
| --- | --- |
| needle has no anchor, id **not** in the list | `NEEDLE_ANCHOR_MISSING` — hard failure |
| needle has an anchor, id **is** in the list | `NEEDLE_STALE_ENTRY_OBSOLETE` — hard failure |
| grandfathered needle's file deleted | `NEEDLE_FILE_MISSING` — hard failure, not a skip |

So a positional needle cannot be added back later, and T5b cannot anchor the three without
also deleting their entries. The run additionally prints the grandfathered ids to stderr
every time, stating their scores are not trustworthy.

## AC-8, rewritten once more — and why it is not frozen into a test

AC-8's exact-span reproduction was run as **one-time calibration** and its result recorded
in `tasks.md`. It is deliberately **not** a permanent test.

A test asserting absolute `lineStart`/`lineEnd` forever would fail the moment code
legitimately moves — which is precisely the positional pinning SEN-04 exists to delete. It
would rebuild the defect one layer up, in the suite meant to prevent it.

What `scripts/__tests__/needle-resolution.test.ts` asserts permanently are the properties
that hold wherever the code lives: every needle resolves, every anchor is unique repo-wide,
every resolved span lies inside its file, no anchor sits on a comment, the grandfather list
is consistent in both directions, and each of the failure paths fails loudly.

---

## Evidence

| Claim | How it was measured |
| --- | --- |
| Baseline: hit@1 0.500 PASS, MRR 0.569 FAIL | `bun benchmarks/needles/run.ts --label before-anchoring` at `c33a5c1` |
| Only 3 of 11 boundaries are unique code lines | `git grep -F -c` per boundary literal over tracked `.ts` |
| `    }` occurs 11130 times | same |
| All 11 anchors resolve `n = 1` and reproduce spans exactly | `resolveAnchoredNeedle` over the pre-change fixture values, zero diff |
| Loud failure precedes embedding | broken fixture run with `OLLAMA_HOST=http://127.0.0.1:1` → exit 1 |
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

---

# Fourth fork — T6's gate is unrunnable, because a full index aborts (T6, 2026-07-28)

T6's stated gate is `cd packages/core && bun run test:e2e`. It cannot run on this tree,
and the reason is not cost. Every E2E suite reaches `ensureSharedIndex`, which indexes the
whole repository into `e2e-ai-shared` and blocks until probe queries hit. That index
**aborts**.

## The measurement

Two index jobs for `e2e-ai-shared`, one launched by the previous session and one by this
one, read from `index_jobs` on the developer database:

| job_id | status | progress | elapsed | error |
| --- | --- | --- | --- | --- |
| `16b38fd0` | failed | 1219/1219 | 4392 ms | `fqn_identity_collision: apps/tools-api/scripts/coverage-by-file.ts#total` |
| `07862bf3` | failed | 1219/1219 | 4118 ms | same |

Deterministic, and **fast** — ~4 s, not a timeout. Discovery and parsing complete; the
abort is in structural resolution. So "the shared index is impractical" was the wrong
diagnosis to reach for: nothing was slow, something was throwing.

## Root cause, measured rather than inferred

Parsing the real file and printing every symbol that shares a name:

```
pct    kind=constant  qualifiedName=pct    scope=top_level  overload=overloaded
pct    kind=constant  qualifiedName=pct    scope=top_level  overload=overloaded
total  kind=variable  qualifiedName=total  scope=top_level  overload=unique
total  kind=constant  qualifiedName=total  scope=top_level  overload=unique     → THROWS
```

`createStructuralIdentity` (`fqn-codec.ts:205-209`) gives a symbol the simple FQN
`file#name` only when it is `top_level`, `unique`, and unreserved; everything else gets
`file#qualifiedName~kind~hash`. The `overload` classification that decides this was
computed from a group keyed on `(file, qualifiedName, kind)` — **finer than the
`(file, name)` namespace it protects**. Two top-level declarations sharing a name but
differing in kind each sat alone in a group, each was classified `unique`, and both then
claimed `file#total`. `StructuralFqnRegistry.register` (`fqn-codec.ts:313-316`) saw two
different canonical signatures on one FQN and threw, aborting the index.

`pct` is the control: declared twice, but both `constant`, so they shared a group, were
classified `overloaded`, and disambiguated correctly. **Same-name/same-kind already
worked. Only same-name/different-kind crashed.** That asymmetry is the whole defect.

The source that triggers it is not exotic. `let total` in one block and `const total` in
another is ordinary TypeScript; `class X` + `interface X` is declaration merging, which is
legal and which the indexer must not reject.

## Decision — make the uniqueness key kind-free

`declarationGroupKey(file, qualifiedName)`, dropping `kind`, so the count is taken over
exactly the namespace the FQN occupies.

This is the **general form of a remedy the same function already applied one-off**.
`isExportMarker` (`resolver.ts:177-181`) forces export-clause markers to the `overloaded`
shape, and its comment describes precisely this failure — "would otherwise share its simple
FQN (file#name) and abort the index via fqn_identity_collision". The special case stays: a
marker can be the sole claimant of a name, so its group size is 1 and a count alone would
not cover it.

**Blast radius is provably confined to the crashing set**, which is why this is safe to
land inside a sensor-repair PR:

- `overload` is not an input to `canonicalizeStructuralSignature` (`fqn-codec.ts:127-136`
  lists version, language, dialect, qualifiedName, kind, arity, typeTokens, modifiers). So
  flipping it cannot move a `signatureHash`.
- A `nested` symbol takes the disambiguated FQN whatever its overload says, so nested
  identities are untouched.
- The only identities that change are top-level symbols sharing a name with a
  different-kind sibling — which today have no usable identity at all, because they abort
  the index instead of receiving one.

## The existing test asserted the defect

`structural-resolver.test.ts` "fails session construction on a generation identity
collision" pinned exactly this scenario — `class Same` + `interface Same` — as a throw. It
was rewritten, not deleted: the same input now asserts two distinct identities, neither
claiming the bare `file#name`, both resolvable. Pinning a crash on legal source is not a
contract worth keeping.

## Divergence — this is a second behavior change, and the spec said there would be one

`spec.md`'s BEH-01 states the programme has exactly one behavior change, "deliberately
isolated here so that neither PR-B nor PR-C — both behavior-preserving — carries one".
That is now false for PR-A: the indexer no longer rejects a file it used to reject. The
claim is corrected rather than quietly broken. It remains true that PR-B and PR-C carry
none, which is what the isolation was protecting.

The alternative was to record T6's gate as not-run. That was offered with the evidence
above and declined in favour of repairing the blocker — correctly, since a gate that
cannot run is the same class of defect this whole feature exists to remove.
