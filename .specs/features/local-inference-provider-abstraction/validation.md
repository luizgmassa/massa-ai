# Validation — Local inference provider abstraction + LM Studio (LIP)

**Feature slug:** `local-inference-provider-abstraction`
**Commit range verified:** `d523f06f..75496925`. This pass re-verifies the three findings
the previous pass raised, against the two commits that answer them: `92e1a098` (H1 + M1 +
L1) and `75496925` (H2 / LIP-22 measurement). The four commits it already reviewed
(`06ddadb1`, `a691cf0b`, `c9232108`, and the Phase-8 set behind them) are carried forward,
not re-derived.
**Worktree:** `/Users/luizmassa/Projects/massa-ai-feat-local-inference-provider-abstraction`,
branch `feat/local-inference-provider-abstraction`, HEAD `75496925`.
**Verifier:** verification agent (author != verifier). **Third** independent pass; it
supersedes the report at `1ea64f15`, whose verdict was FAIL on H1/H2/M1.
**Date:** 2026-09-20.

---

## Summary

**Result: PASS**

All three findings are closed, and closed by mechanism rather than by narration. Each was
re-induced or re-executed from scratch here; none was accepted on the author's record.

| | Finding | Previous | Now | How it was settled |
|---|---|---|---|---|
| **H1** | LIP-18 body clause — `diagnose.ts`'s `DEFAULT_MODEL` unguarded | **FAIL**, M14b survived | **PASS** | M14b re-induced by this verifier in the hard direction (both files drifted together). Parity goes **7/2** naming both providers while `diagnose.test.ts` stays **33/0**. |
| **M1** | LIP-19b G12 — "in the same commit" unmet, unrecorded | **FAIL** | **PASS** | The deviation record exists with owner and date, **and its stated reason is true**: the extractor regex is byte-unchanged across the window and matched **exactly 1**, on the correct block, at every revision in it. |
| **L1** | LIP-20 shell-population figure decayed | **LOW** (27 stated, 30 measured) | **PASS** | Re-measured by the stated method: **58 tracked `.sh` / 27 read / 24 absent** — exact. The moving-baseline explanation is arithmetically confirmed. |
| **H2** | LIP-22 — AC named a sensor nobody ran | **FAIL** | **PASS** | The sensor was run on both arms through the real store. Figures are internally consistent on every axis checkable without re-running. |

**Surviving mutants: 0.** M14b was the only survivor of the previous pass and it now dies.

Four new findings are recorded below. **None unmets an acceptance criterion** — three are
citation/bookkeeping defects and one is a latent vacuity path in a manually-run gate. The
sharpest of them (N1) is a *causal attribution* in four internal artifacts that the
measurement does not support; the measurement itself, and the user-facing CHANGELOG entry,
are sound.

---

## Method

**Evidence-or-zero, and re-derived rather than read.** Every figure quoted from the
author's record was recomputed here from source or from arithmetic. The one exception is
stated explicitly and prominently: **the `14.needles.test.ts` run was not reproduced** (see
"What was not reproduced").

**Restore discipline.** Five files were copied to `/tmp/lip-p9-backup` *before* any
mutation and restored **from those copies**. No `git checkout`, `git restore` or `git
stash` was used at any point. The patcher asserts its own match count and refuses to write
on a miss, because a `perl -pi -e` carrying `${...}` is eaten by shell interpolation and can
silently patch nothing.

---

## H1 — LIP-18 body clause: closed, mutant dead

`92e1a098` adds `scripts/diagnose.ts` to **both** surface tables in
`scripts/__tests__/embedding-defaults-parity.test.ts`:

- `MODEL_ONLY_SURFACES` — `/^ {2}ollama: "([^"]+)",$/gm`
- `LMSTUDIO_MODEL_ONLY_SURFACES` — `/^ {2}lmstudio: "([^"]+)",$/gm`

Both anchors were checked for uniqueness before trusting them: `grep -cE '^  (ollama|lmstudio): "'`
→ **2** in `diagnose.ts`, one per provider, so `extractOne`'s `!== 1` throw is armed rather
than ambiguous. Deleting the table would raise "extractor rotted or surface removed", so the
new pin cannot go vacuous.

**M14b re-induced, in the direction that matters.** Not the easy single-file drift — the
realistic one, where a developer changes a default and edits its test in the same commit.
Four literal patches, each asserting exactly 1 match:

| File | From | To |
|---|---|---|
| `scripts/diagnose.ts:128` | `ollama: "qwen3-embedding:4b",` | `ollama: "drifted-ollama-v9",` |
| `scripts/diagnose.ts:129` | `lmstudio: "text-embedding-nomic-embed-text-v1.5",` | `lmstudio: "drifted-lmstudio-v9",` |
| `scripts/__tests__/diagnose.test.ts:174` | the `resolveModelName("ollama", …)` default assertion | drifted to match |
| `scripts/__tests__/diagnose.test.ts:175-177` | the `resolveModelName("lmstudio", …)` default assertion | drifted to match |

Only those two assertions read `DEFAULT_MODEL`; the file's other occurrences of the same
literals are `modelIsAvailable` and fetch-stub fixtures, which a real drift would not touch.
That was verified by reading `:165-200` and `:250-300` before choosing the patch set.

**Measured under the mutation:**

| Gate | Clean | Under M14b |
|---|---|---|
| `scripts/__tests__/diagnose.test.ts` | 33 pass / 0 fail | **33 pass / 0 fail** — still green, as predicted |
| `scripts/__tests__/embedding-defaults-parity.test.ts` | 9 pass / 0 fail | **7 pass / 2 fail** |

Both failures name the file and the drifted value:

```
Expected: "scripts/diagnose.ts model=qwen3-embedding:4b"
Received: "scripts/diagnose.ts model=drifted-ollama-v9"
  at embedding-defaults-parity.test.ts:269   (model-only surfaces)

Expected: "scripts/diagnose.ts model=text-embedding-nomic-embed-text-v1.5"
Received: "scripts/diagnose.ts model=drifted-lmstudio-v9"
  at embedding-defaults-parity.test.ts:305   (LM Studio model-only surfaces)
```

The commit's claim is reproduced exactly: **7/2, both providers named, `diagnose.test.ts`
33/0**. The two-file agreement is not a sensor; the anchor to the canonical table is.
**LIP-18 body clause: PASS. M14b: killed.**

---

## M1 — LIP-19b / G12: the reason is true, not merely present

`92e1a098` adds an accepted-deviation record at `spec.md:438-453`, attributed
**"orchestrator, 2026-09-20"**. The clause stays as written; no code change follows.

The record's load-bearing claim is falsifiable, so it was falsified rather than read: *the
gate never went vacuous in the four-phase window, because the interface block never contains
the literal `provider: "ollama",`, so `extractOne`'s `!== 1` throw was never armed.*

**First, the precondition.** `git show 018e1529 -- scripts/__tests__/embedding-defaults-parity.test.ts`
shows the re-anchor commit changed **only the comment**. The regex
`/embedding:\s*(\{[^}]*provider:\s*"ollama",[^}]*\})/g` is byte-identical before and after —
the commit message says so ("the regex itself needed no change") and the diff confirms it.
That makes the claim purely a question of file contents.

**Then, the regex executed against the real file at five revisions spanning the window:**

| Revision | `extractOne` matches | literal `provider: "ollama",` count | extracted |
|---|---|---|---|
| `7987443d~1` (before the union was deleted) | **1** | 1 | `qwen3-embedding:4b` / `2560` |
| `7987443d` (T03 — union deleted, LIP-19b's trigger) | **1** | 1 | `qwen3-embedding:4b` / `2560` |
| `018e1529~1` (last revision before the re-anchor) | **1** | 1 | `qwen3-embedding:4b` / `2560` |
| `018e1529` (T15 — re-anchored) | **1** | 1 | `qwen3-embedding:4b` / `2560` |
| `HEAD` | **1** | 1 | `qwen3-embedding:4b` / `2560` |

Exactly one match at every point, always the `defaultMassaAiConfig` block, always the same
values. The throw was never armed and the gate never matched the wrong block. **The stated
reason holds.**

It is in fact *stronger* than the record claims, and worth recording because it explains why
the four-phase gap was survivable at all: at `7987443d~1` the interface read
`provider: "ollama" | "mistral" | "openai" | "google" | "cohere"` — a union whose `"ollama"`
is followed by ` |`, **never a comma**. So the old comment's stated discriminator ("the
trailing comma distinguishes literal from union") was already describing the mechanism
loosely: the regex never depended on LIP-01's union existing, which is precisely why deleting
it could not break the gate. The defect in the window was a comment that described a
mechanism that no longer existed — the lesser half, as the record says.

**LIP-19b: PASS** (deviation accepted on a verified reason, with owner and date).

---

## L1 — the shell-population figure now reproduces exactly

Re-measured here by the method the comment now states beside the number: over tracked `.sh`
files under `scripts/` (`git ls-files`, not a filesystem glob), a name counted as *read* when
it appears as `$NAME`/`${NAME…}` in a file that does not also assign it, unioned over files.

| Quantity | Stated at `turbo-passthrough-env.test.ts:17-42` | Measured here |
|---|---|---|
| tracked `.sh` files under `scripts/` | 58 | **58** |
| distinct `MASSA_AI_*` names read without same-file assignment | 27 | **27** |
| of those, absent from `passThroughEnv` | 24 | **24** |

**Exact on all three.** The moving-baseline explanation is confirmed arithmetically, not
taken on faith: `MASSA_AI_INFERENCE_PROVIDER` **is** in the read set, and removing it from
the allowlist yields **25** absent — so "25 before it was allowlisted, 24 after" is literally
true. The three names present on the allowlist are `MASSA_AI_INFERENCE_PROVIDER`,
`MASSA_AI_LLM_MODEL`, `MASSA_AI_LLM_CODE_MODEL`.

The design conclusion it supports is sound and stable: the absent set is two dozen
installer-internal knobs (`MASSA_AI_INSTALLER_TEST_*` ×6, `MASSA_AI_PG_ROLE`,
`MASSA_AI_PLUGIN_SOURCE`, `MASSA_AI_NONINTERACTIVE`, …) that turbo has no reason to forward,
because turbo never dispatches the shell suites at all.

**Residual (N4, LOW).** One parenthetical does not reproduce. The comment attributes the
prior pass's `30/25` to "an independent re-measure counting only `local`-scoped assignment".
Implemented literally — treating only `local NAME=` as assignment — the measurement gives
**35 read / 31 absent**, not 30/25. Membership was diffed rather than counts compared: the
broad 27-name set is a strict **subset** of the narrow 35-name set (0 names only in broad, 8
only in narrow), so the definitions are nested and the direction is right, but the specific
method named for that figure is not the one that produces it. Inside a comment whose whole
thesis is "quote the method beside the number", that is worth one more edit.

**LIP-20: PASS.**

---

## H2 — LIP-22: the AC is met, and the measurement survives every consistency check

### What the AC now demands, and whether it was delivered

> the retrieval-algorithm change at 768 is measured by `14.needles.test.ts` — a full-stack
> run against a real pgvector index at each width, the only sensor that exercises the branch.

Delivered. Both arms ran; figures, workspaces, fingerprints and miss lists are transcribed
in `spec.md`'s LIP-22 block. **The AC's own standard — "a promise to measure later is not an
AC" — is satisfied this time.**

### (1) Both arms through the real store, on different branches

Verified in source. `packages/core/src/data/vector/postgres-vector-store.ts` branches on the
same threshold in two places, and the cited lines are correct:

- `:233` — `const hasBq = dimensions > 2000;` gates the `embedding_bq bit(N)` column at table creation
- `:267` — `if (this.schemaDimensions && this.schemaDimensions > 2000) { await this.createBqIndex(); return; }`
- `:564` — "Direct cosine similarity search (for dims ≤ 2000 with HNSW index)"
- `:596` — "Two-phase binary-quantization search (for dims > 2000)"

2560 → `> 2000` → binary quantization; 768 → `≤ 2000` → direct HNSW cosine. The branch
assignment is correct.

**One precision note, in the interest of not overstating it.** The `searchPath` field in the
`[T10][LIP-22]` record is *derived in the test* (`profile.dimensions > 2000 ? … : …`), not
read back from the store. It is a sound inference — the store applies the identical
predicate at the identical threshold, and the widths are independently attested twice (direct
`curl` per provider, plus the LIP-15 fingerprint each workspace stamped itself:
`ollama:qwen3-embedding:4b:2560` and `custom:text-embedding-nomic-embed-text-v1.5:768`) — but
it is an inference, not an observation.

### (2) Corpus identity

`743 files / 8129 chunks / 23913 symbols` is recorded for the **2560 arm**. The 768 row
records "same corpus" plus its own rate and duration, with identity resting on both arms
indexing the same `PROJECT_PATH` at the same commit — and `SHARED_PID` being keyed on
`{commit, provider, model, dimensions}`, which is what gave the two arms independent
workspaces for free. The reasoning is sound (chunking precedes embedding, so the model cannot
move the chunk count), but **arm B's chunk count is not independently recorded** — see N3.

### (3) Internal consistency of the aggregates — every check passes

**Every hit@k is an exact n/14.** Recomputed:

| | 2560 | | 768 | |
|---|---|---|---|---|
| hit@1 | 0.5000 | = 7/14 ✓ | 0.1429 | = 2/14 ✓ |
| hit@3 | 0.6429 | = 9/14 ✓ | 0.2143 | = 3/14 ✓ |
| hit@5 | 0.7143 | = 10/14 ✓ | 0.2857 | = 4/14 ✓ |
| hit@10 | 0.7143 | = 10/14 ✓ | 0.5000 | = 7/14 ✓ |

**Each MRR falls inside the bounds its own hit@k ladder implies** — the same check applied to
the `bench:needles` figures in the previous pass:

| Arm | ladder-implied `[min, max]` | recorded MRR | verdict |
|---|---|---|---|
| 2560 | `[0.5619, 0.5893]` | **0.5893** | inside — **exactly at the ceiling** |
| 768 | `[0.2024, 0.2321]` | **0.2116** | inside, with room both sides |

Both admit an exact per-needle rank decomposition: 2560 = `7@r1 + 2@r2 + 1@r4` (= 8.25/14 =
0.58928…, which rounds to the recorded 0.5893) and 768 = `2@r1 + 1@r3 + 1@r5 + 3@r7` (=
2.96190/14 = 0.21156…, → 0.2116), among others. The 2560 arm sitting exactly at its ceiling
is a uniquely-determined configuration, not an impossible one — it means every needle found
within k=3 was at rank 2 and the one found within k=5 was at rank 4.

**The miss lists independently corroborate hit@10**, which is a cross-check the aggregates do
not imply on their own: 2560 lists 4 misses (N05, N12, N13, N14) and 14 − 10 = 4 ✓; 768 lists
those four plus N07, N08, N11 = 7, and 14 − 7 = 7 ✓.

**Two further signals that the run is real rather than transcribed from an earlier record.**
The file header's pre-existing `OBSERVED_BASELINE` for Ollama is hit@1 0.500 / hit@3 0.643 /
hit@5 0.714 / hit@10 0.714 / **MRR 0.586**. The new 2560 arm reproduces the *identical hit
ladder* but reports **MRR 0.5893** — which decomposes as one needle moving from rank 5 to rank
4 (8.20/14 → 8.25/14). A fabricated figure copied from the header would have read 0.586; a
genuine re-index on a newer tree drifts in exactly this way. Separately, the author's recorded
observed-red transcript shows `Received: 0.14285714285714285` — the full-precision float of
2/14, produced at runtime by the assertion, not a value anyone types.

### (4) The derived "understated by about half" claim — arithmetic sound, attribution not

**The arithmetic is exact.** ΔMRR recorded: 0.4650 − 0.6423 = **−0.1773** ✓. ΔMRR measured:
0.2116 − 0.5893 = **−0.3777** ✓. Δhit@1: −0.2143 and −0.3571 ✓. Ratio 0.3777 / 0.1773 =
**2.13**, so "roughly twice" and "understated by about half" are both fair descriptions of
the two numbers.

**The causal attribution is not supported by the data** — see **N1**. The claim, stated as
settled in four artifacts, is that the in-process exact-cosine ranker *"did not merely fail to
observe the branch; by removing approximate search from both sides it understated the risk by
about half."* That assigns the entire −0.2004 difference-of-deltas to the store branch, but
**three variables moved together** between the two harnesses, and the repo's own records prove
at least two of them:

1. **The ranker** — the mechanism under test. Real.
2. **The embedding stack.** `bench:needles` embeds **only** via Ollama `/api/embeddings`
   (`run.ts:113-140`), so its 768 arm used Ollama's **`nomic-embed-text`**, not LM Studio's
   `text-embedding-nomic-embed-text-v1.5`. `tasks.md`'s T17 brief states this explicitly
   ("the same model family under a different server, with Ollama-only knobs applied … truncates
   at 8000 chars and passes `options.num_ctx`, which has no `/v1/embeddings` counterpart") and
   the Phase-7 table's column header literally reads `768 — nomic-embed-text`. The caveat was
   recorded at the source and was not carried forward into the LIP-22 block that now compares
   against it.
3. **The whole indexing pipeline** — the bench chunks in-process; the E2E arm runs the real ETL
   over 743 files / 8129 chunks.

**The decisive evidence is the shared control arm.** Both harnesses measured the *same* 2560
Ollama `qwen3-embedding:4b` stack against the *same* 14-needle fixture
(`benchmarks/needles/fixtures/massa-ai.json` — confirmed, `run.ts:228` and the E2E header both
load it), and they disagree:

| 2560 arm, same model, same fixture | `bench:needles` | `14.needles.test.ts` | instrument delta |
|---|---|---|---|
| hit@1 | 0.5000 | 0.5000 | 0 |
| hit@3 | 0.7143 | 0.6429 | −0.0714 |
| hit@5 | 0.7857 | 0.7143 | −0.0714 |
| hit@10 | **1.0000** | **0.7143** | **−0.2857 (4 needles)** |
| MRR | 0.6423 | 0.5893 | **−0.0530** |

The two instruments differ by **4 needles at hit@10 and −0.0530 MRR on an identical embedding
stack**. An instrument that moves the control arm that much cannot have its delta subtracted
from the other instrument's delta and the remainder attributed to a single mechanism. The
*direction* of the finding is well supported — approximate search should and does bite harder
— and the 768 result stands on its own as a real-store measurement. What is not supported is
the quantified causal claim "the ranker understated the risk by about half."

**This does not unmet the AC**, which asks for a full-stack run at each width and got one.
It is a claim in the narrative that outruns its evidence, in artifacts future readers will
treat as settled.

**Notably, the user-facing CHANGELOG entry does not make this error.** It reports the measured
figures, attributes them to the model's width, and adds the indexing-speed trade-off. That
entry is sound as written.

### (5) The floors: derived from the measurement, not fitted to it

`FLOORS["lmstudio"] = { hit1: 0.07, hit5: 0.21, mrr: 0.16 }`, against measured 0.1429 /
0.2857 / 0.2116. The stated rule is "~80% rounded DOWN to the nearest whole needle, the same
rule the Ollama row uses". Recomputed:

| | measured | 80% | rounded down to whole needles | floor set | ✓ |
|---|---|---|---|---|---|
| hit@1 | 2/14 | 1.6 needles | 1/14 = 0.0714 | 0.07 | ✓ |
| hit@5 | 4/14 | 3.2 needles | 3/14 = 0.2143 | 0.21 | ✓ |
| MRR | 0.2116 | 0.1693 | — | 0.16 | ✓ (down, 2dp) |

**The LM Studio row applies the stated rule correctly on all three.** It was set *after* the
measurement and *below* it with real headroom, and it is armed: the author's observed red
(`hit1` → 0.99 → `Expected: >= 0.99  Received: 0.14285714285714285`) shows the assertion
executing against the live value.

**On "the identical rule the Ollama row uses" — 2 of 3.** Against the header's `OBSERVED_BASELINE`
(hit@1 7/14, hit@5 10/14, MRR 0.586), the rule reproduces `hit@1` (80% of 7 = 5.6 → 5/14 =
0.357 → 0.36 ✓) and `MRR` (80% of 0.586 = 0.469 → 0.47 ✓), but **not** `hit@5`: 80% of 10 = 8
→ 8/14 = 0.571, while the row carries **0.64** (= 9/14, i.e. 90%). That value is
**pre-existing and unchanged by this commit** — `75496925` moved `0.36/0.64/0.47` verbatim
from three consts into the map. So the new row is the more rule-consistent of the two; the
inconsistency is in the old one and predates this feature. Recorded, not charged.

### (6) `probeAvailability` — the discriminator is sound; the count and the rationale are loose

**The unblocking works.** `probeAvailability` now reads `/api/v1/system/inference` and sets
the neutral `INFERENCE_UP`, with `OLLAMA_UP` kept as a deprecated alias carrying the same
neutral value — so every existing gate stops skipping without being edited. The route exists
and returns what the probe expects: `apps/tools-api/src/routes/system.ts:199-214` spreads
`checkInference()`'s `ServiceStatus` (which carries a boolean `available`) and adds
`provider`, `models`, `configuredModel`, `baseUrl`. `checkInference()` delegates to the
LIP-10 provider-dispatched `checkOllama()`, so `provider` really does name the configured
provider.

**Is `typeof available === "boolean"` a sound discriminator for a 404?** Yes, and it is sound
in both directions, which is what matters:

- If the neutral route is absent and the 404 body parses as JSON without an `available` key →
  not a boolean → no value taken, fall through.
- If the 404 body does **not** parse as JSON (Elysia's default 404 is the bare string
  `NOT_FOUND`) → `r.json()` rejects → the `catch` falls through.

Either way the legacy probe runs. **The comment's stated reason is narrower than the code's
actual robustness** — it claims "a 404 still parses as JSON, so the `available` field being
absent is what distinguishes it, not a throw", which is true for some servers and false for
this stack's own default 404. The code handles both; only the rationale is imprecise.

**The fallback to `/system/ollama` is correct for a pre-LIP-10 server**, for a reason worth
stating: a server predating LIP-10 has no provider dispatch at all, so the only provider it
can be serving is Ollama, and an Ollama-specific answer is the right one. There is no case
where the fallback answers for the wrong provider.

**One shape note.** The fallback's actual trigger is `if (!INFERENCE_PROVIDER)`, not "the
neutral route gave no boolean". A LIP-10 server reporting `available` without a `provider`
field (the unavailable path, where `details` may be absent) therefore runs the legacy probe
redundantly. Traced through every case, the resulting `INFERENCE_UP` is correct each time —
it costs one wasted 4-second-timeout request, nothing more.

**LIP-22: PASS.**

---

## New findings (none unmets an AC)

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| **N1** | **MED** | **The "the in-process ranker understated the risk by about half" attribution is not supported.** Three variables moved between the two harnesses, not one — the ranker, *and* the embedding stack (bench's 768 arm was Ollama `nomic-embed-text`, not LM Studio's model, as `tasks.md`'s own T17 brief records), *and* the indexing pipeline. On the **shared 2560 control arm** the two instruments disagree by 4 needles at hit@10 and −0.0530 MRR, so the −0.2004 difference-of-deltas cannot be assigned to the store branch. | `spec.md` LIP-22 block, `tasks.md` Phase-8 note, `HANDOFF.md`, `STATE.md` (**not** CHANGELOG, which is correct as written) | Keep the measurement and the direction; replace the quantified cause with the control-arm numbers. Two sentences: the real-store 768 result stands alone, and the cross-harness delta is not attributable. |
| **N2** | **MED** | **`FLOORS[profile.id]` has a silent no-assertion path with no guard.** When `profile.id` is not a key of `FLOORS`, `14.needles.test.ts:383` logs "no calibrated floor" and asserts **nothing** — F-NEEDLE-1 passes vacuously while the suite reports green. This is not hypothetical: it is exactly the bug the author hit mid-measurement (`id` read as `"custom"` → `FLOORS["custom"]` undefined → floors skipped), found by eye rather than by a gate. A third provider, or any regression in `ACTIVE_EMBEDDING_PROFILE.id`, disarms the floor silently. | `packages/core/src/__tests__/e2e/14.needles.test.ts:380-398` | One line: `expect(Object.keys(FLOORS)).toContain(profile.id)` before the branch, or make the uncalibrated path fail loudly with the candidate baseline in the message. Blast radius is low (RUN_E2E-gated, manual, out of CI), which is why this is MED not HIGH. |
| **N3** | **LOW** | **"16 E2E files" is 15.** `grep -l 'OLLAMA_UP\|INFERENCE_UP'` over `e2e/` returns 16 paths, but one is `_helpers.ts` — the file that *defines* the flag, not one that gates on it. Of 19 E2E test files, 15 gate (4 do not: `06.checkpoints`, `13.cli`, `17.cleanup-verify`, `23.owned-destructive`). The claim counts grep hits, not gated suites. Repeated identically in five places including the published CHANGELOG ("Sixteen E2E files"). | `spec.md`, `tasks.md`, `HANDOFF.md`, `STATE.md`, `CHANGELOG.md`, and the `_helpers.ts` docblock | s/16/15/, or say "every E2E file that gates on it". The substantive claim — one edit unblocks all of them — is true. |
| **N4** | **LOW** | **The `30/25` method attribution does not reproduce.** `turbo-passthrough-env.test.ts:36-38` attributes that figure to "counting only `local`-scoped assignment"; implemented literally it yields **35/31**. The sets are properly nested (the 27-set is a strict subset of the 35-set), so the reasoning is directionally right, but the named method is not the one producing the cited number — inside the very comment arguing that a number without its method decays into folklore. | `scripts/__tests__/turbo-passthrough-env.test.ts:36-38` | Drop the parenthetical, or replace it with the measured 35/31 and its definition. |

### Carried forward, unchanged from the previous pass

| # | Sev | Gap | Status |
|---|---|---|---|
| **M2** | MED | LIP-13's reverse direction is proven at the read gate's *detection* layer only. No test drives an LM-Studio-flavoured fingerprint through to an actual `EmbeddingIndexStaleError` **throw**, and every `activeProvider` in the write-gate block is still `provider: "ollama"`. | Open |
| **L2** | LOW | LIP-24's docblock still records the completeness population as "25 → 27 → 26" (`embedding-defaults-parity.test.ts:320-321`); the scan printed **32** at HEAD this pass. | Open |
| **L3** | LOW | LIP-22's original amendment line ("AC amended in Phase 8 (gap G14)") still carries no author. The new "AC MET — measured 2026-09-20" carries a date but no owner; the G12 record's "orchestrator, 2026-09-20" is the shape to copy. | Partly addressed |
| **L4** | LOW | `init --lmstudio`'s `knownDimensions[model] ?? 768` is an unreachable fallback with no comment recording that, unlike its `use`-branch siblings. | Open |
| **L5** | LOW | No completeness sensor would catch a *future* TypeScript probe site regressing to `response.ok`; `probe-dialect-parity`'s scan covers four shell files by construction. | Open |

---

## Gates run this pass

| Gate | Result |
|---|---|
| `bun run lint` (oxlint) | clean, **exit 0** |
| `bun run type-check --force` | **6/6 successful, 0 cached**, exit 0 (re-run uncached — the first invocation replayed FULL TURBO from cache, which is not a measurement) |
| `scripts/__tests__/embedding-defaults-parity.test.ts` | **9 pass / 0 fail**; completeness population 32, width-writer population 5 |
| `scripts/__tests__/turbo-passthrough-env.test.ts` | **4 pass / 0 fail** |
| `scripts/__tests__/diagnose.test.ts` | **33 pass / 0 fail** |
| `scripts/__tests__/provider-list-parity.test.ts` | **9 pass / 0 fail** |
| `scripts/__tests__/probe-dialect-parity.test.ts` | **14 pass / 0 fail** |
| **M14b re-induced** (both files drifted together) | parity **7 pass / 2 fail** naming both providers; `diagnose.test.ts` **33/0** |
| G12 regex executed at 5 revisions | exactly **1** match at each, correct block, stable values |
| L1 population re-measured | **58 / 27 / 24** — exact |
| LIP-22 aggregates | every hit@k an exact n/14; both MRRs inside their ladder bounds; both miss lists consistent with hit@10 |

**Note on coverage.** `packages/core/tsconfig.json` excludes `src/__tests__`, so neither
`14.needles.test.ts` nor `e2e/_helpers.ts` is reached by `type-check`. oxlint (which surfaces
oxc semantic errors regardless of rule severity) runs repo-wide and is clean, which is the
only static gate covering those two files.

---

## What was not reproduced, and why

**`packages/core/src/__tests__/e2e/14.needles.test.ts` was not re-run.** Stated plainly
because it is the single largest input to the H2 verdict. The ephemeral stack it ran on
(scratch PostgreSQL on `127.0.0.1:5433/massa_ai_test`, API on `127.0.0.1:3334`, scratch
`XDG_CONFIG_HOME` per arm) has been torn down, and reproducing it costs a **~1h 12m cold
index on the Ollama arm alone** — the figure the run itself measured. A verification gate
does not get to spend that, and re-running on the developer's own database is exactly what
the author correctly avoided.

**What was done instead**, and what it is worth: source reading of every mechanism the
figures claim (the store's two branches, the route, the probe, the floor derivation), plus
full internal-consistency checking of the aggregates — exact-n/14, MRR-within-ladder-bounds,
miss-lists-versus-hit@10, and the cross-arm/cross-harness coherence checks above. Those are
sufficient to catch a fabricated or mis-transcribed figure (the 2560 MRR drifting from the
header's 0.586 to 0.5893 in exactly the way a real re-index would, and the full-precision
`0.14285714285714285` in the observed-red transcript, are both positive evidence of a real
run). They are **not** sufficient to catch a run that executed correctly against a
misconfigured stack — that residual risk is mitigated by, but not eliminated by, the
double width attestation (`curl` + stamped fingerprint) and the arm-mismatch guard at
`14.needles.test.ts:281-290`, which throws if the API's reported model disagrees with the
test process's resolver.

**Also not run:** `bun run bench:needles` (slow, mutates the index, and nothing in this range
touched it); the full `bun run test` turbo aggregate (turbo cancels siblings on failure and
would hide reds — targeted per-package gates were used instead, as in the previous pass);
Docker/Swagger smoke and the 90% coverage floor, both out of scope for this gate.

**Pre-existing and explicitly not this feature's:** `bun run test:scripts` exits 1 on
`scripts/tests/test-install-skills-cli.sh` (2 failures), measured identically on `d523f06f`
in an earlier pass; both that script and `scripts/install-skills.sh` have an empty diff over
the range. And `tasks.md` has never passed `validate_tasks.ts` ("no tasks parsed") because it
writes `### T19 — ` against `/^#{2,4}\s+T\d+\s*:/m`.

---

## What would have falsified this PASS

Named explicitly, because a PASS without its falsifier is an opinion:

1. **M14b surviving the co-drift.** If drifting `diagnose.ts` *and* `diagnose.test.ts`
   together had left the parity gate at 9/0, H1 would still be FAIL — the new surface entries
   would be pinning an agreement rather than an anchor. It went 7/2.
2. **The G12 regex matching 0 or 2 anywhere in the window**, or matching the interface block
   instead of `defaultMassaAiConfig`. Either would make the accepted deviation's stated reason
   false and return LIP-19b to FAIL, because the record would then be an excuse rather than an
   argument. It matched exactly 1, on the right block, at all five revisions.
3. **Any hit@k not being an exact n/14**, or **either MRR falling outside its own ladder
   bounds**, or **a miss list disagreeing with hit@10**. Any one of those would mean the LIP-22
   figures were not produced by a single coherent run over 14 needles, and H2 would stay FAIL
   regardless of how the run was narrated. All ten checks passed.
4. **The LM Studio floors sitting at or above the measured values**, or being derived by a
   different rule than the one stated — i.e. a gate fitted to pass. They are ~80% rounded down
   to whole needles, below the measurement with headroom, and demonstrably armed.
5. **`/api/v1/system/inference` not existing, or not returning a boolean `available`.** The
   probe rewrite would then have unblocked nothing and the run could not have happened as
   described. The route exists and returns it.

---

## Restore verification

`git status --porcelain` was **empty before the first mutation and is empty after the last**.
Five files were copied to `/tmp/lip-p9-backup` before any mutation; the two that were
mutated were restored **from those copies**. sha256, post-restore, all matching:

| File | sha256 |
|---|---|
| `scripts/diagnose.ts` | `dfea7f56c87b7c3b64edd3d2f1f48e18f9f536ab873fd66ce4b88108cf311fb9` |
| `scripts/__tests__/diagnose.test.ts` | `affeb49bf7ffdd735f6e89424c623c89de33d13fab1cd4ff16e2072cb187a74f` |
| `scripts/__tests__/embedding-defaults-parity.test.ts` | `0a562c58ce402087aa90e59a6515b25dde43f3faa7ca9657451530adb6c82fd6` |
| `packages/core/src/__tests__/e2e/14.needles.test.ts` | `c5d49f03198c6b01348a39271e8408b04368d13347e580303633911976594f98` |
| `packages/core/src/__tests__/e2e/_helpers.ts` | `36ef896ee0647724dfae5381e493fb5b46bc39ef6a875a309fdcf5d10335ecbf` |

The `14.needles.test.ts` hash independently matches the `c5d49f03…` the author recorded when
restoring their own floor-row mutation — a small but real corroboration that that restore was
genuine.

**No `git checkout`, `git restore` or `git stash` was used at any point.** The developer's
tools-api on `:3333` was left down as instructed and was not restarted; no broad `pkill` was
issued. The only repository file this verification wrote is this one.

---

## Exact next step

**N1 is the one to land**, and it is prose, not code: the LIP-22 block, `tasks.md`,
`HANDOFF.md` and `STATE.md` state a causal claim the control arm refutes. The measurement is
good and should be kept exactly as it is — what needs replacing is the sentence assigning the
doubling to the ranker. The control-arm table above (4 needles at hit@10, −0.0530 MRR, same
model, same fixture) is the replacement evidence.

Then **N2**, one line, which closes the last gate in this feature whose failure mode is
green. **N3** and **N4** are single-token edits and can ride along. **M2** remains the oldest
open item.

`FEATURES.json` `status` is `in_progress`. Nothing above blocks moving it: no requirement is
unmet, no mutant survives, and every new finding is a bookkeeping or hardening item rather
than a defect in shipped behaviour. **That is a decision for the orchestrator, not the
verifier** — but this pass does not withhold it.
