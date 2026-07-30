# Model Profile Registry Validation

**Date**: 2026-07-30
**Spec**: `.specs/features/model-profile-registry/spec.md`
**Diff range**: `45daaa1..af79151` (base `origin/main` @ `45daaa1`, head `af79151` — 12 commits:
`d256d09` T1, `f9944d9` T2, `17102f2` T3, `e714fe9` T4, `0be5a30` T5+T8, `ce326be` T6, `9cbb57a`
docs, `cb56fd0` T7, `611f29e` T10, `412c076` T11, `fdbc8eb` T12, `af79151` T13)
**Verifier**: independent (author ≠ verifier); massa-ai MCP not registered this session —
`recall`/`search` skipped throughout, state derived entirely from `.specs/` files and source
reads
**Iteration**: fix→re-verify iteration 2 of the capped 3 — this is the **single validation
record** for this feature, replacing both prior reports (at `cb56fd0` and `fdbc8eb`), not
appending to them

---

## Verdict: **PASS**

Every gap opened across three verification passes is now closed and independently
re-confirmed, including the residual non-blocking finding carried from iteration 1, which the
coordinator elected to close rather than carry further (T13). T13 itself introduces no new
false-positive risk — verified by 12 targeted probes plus an end-to-end injection through the
real CLI. One **pre-existing** (since T10, not introduced or worsened by T13), currently-dormant
false-positive risk was found this pass and is reported in full per instruction; it is judged
**non-blocking** for reasons stated below. Full gate ladder green at HEAD, exact expected
counts. Tree confirmed clean (`git status --short` → 0 lines) throughout and at the end.

---

## Fix-Loop Record — All Three Iterations

| Iteration | Found | Closed by | Re-verified this pass? |
| --- | --- | --- | --- |
| 0 (at `cb56fd0`) | **Gap 1**: MPR-R1's "scripted scan for model tokens" AC had no enforcing mechanism — a model name typed into charter prose propagated through 9 sites (1 charter + 4 mirrored + 4 generated bodies) with every existing gate green. | `611f29e` (T10) — new `scripts/verify-model-tokens.ts` + test suite. | Yes — carried through iteration 1, base scan still exit 0 at HEAD. |
| 0 (at `cb56fd0`) | **Gap 2**: design.md §6's "let `loadCharter` default a missing `model_tier`" mutation survived its designated killer test — the test never called `loadCharter`. | `412c076` (T11) — real temp-charter harness; mutation re-run and killed in iteration 1. | Not touched by T13; carried forward unchanged. |
| 0 (at `cb56fd0`) | **Gap 3**: `design.md`/`tasks.md` stale against the shipped 7-profile registry. | `fdbc8eb` (T12) — docs-only, amendments A1–A5 recorded transparently; judged legitimate in iteration 1. | Not touched by T13; carried forward unchanged. |
| 1 (at `fdbc8eb`) | **Residual, non-blocking finding B/C/D**: the T10 scan (line-based matching) missed a multi-word display name split across a line wrap, a separator-reformatted mention of a known id, and a double-whitespace variant. Reported non-blocking in iteration 1. | `af79151` (T13) — whole-content matching (catches line-wraps) + interchangeable `-`/`_`/whitespace separators (catches paraphrases). Closed rather than carried, because the coordinator judged the line-wrap case realistic given this repo's ~95-column prose wrapping. | **Yes — this pass, in full** (see below). |
| 2 (this pass, at `af79151`) | **New finding**: the bare single-word Claude aliases (`opus`, `haiku`, `sonnet` — all three are ordinary English words / poetry-form names) collide with entirely innocent prose (`"a magnum opus of clarity"`, `"summarize as a haiku"`, `"reads like a sonnet"`). Confirmed live end-to-end through the real CLI. **Pre-existing since T10** (reproduced against the pre-T13 regex too); not introduced or worsened by T13's separator/cross-line widening. | — not fixed | **Judged non-blocking** — see "New Finding" section below. |

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1–T9 | Done | T9 = the original FAIL verdict this report supersedes. |
| T10 | Done | `611f29e` — MPR-R1 scripted scan, gap 1 |
| T11 | Done | `412c076` — `loadCharter` throw tests exercise `loadCharter`, gap 2 |
| T12 | Done | `fdbc8eb` — plan-document amendments, gap 3 |
| T13 | Done | `af79151` — cross-line + separator-normalized matching, iteration-1 residual (B/C/D) |

---

## Spec-Anchored Acceptance Criteria (MPR-R1..R12)

| Req | AC (summarized) | Verdict | Evidence |
| --- | --- | --- | --- |
| **MPR-R1** | Scripted scan for model tokens returns 0 hits in charter sources, mirrored charters, generated bodies, and the generator, minus the one declared exception. | ✅ **PASS** | `scripts/verify-model-tokens.ts` (T10 `611f29e`, hardened T13 `af79151`). Live re-run: `bun run verify:model-tokens` → `OK — scanned 136 file(s) for 29 token(s).`, exit 0. Original iteration-0 reproduction (literal token in prose) still caught — re-verified in iteration 1. Iteration-1 residual (line-wrap, separator paraphrase, double-whitespace) now closed and independently re-verified this pass (see below). `subagent-parity.test.ts` correctly excluded (MPR-R1's declared exception). Reached by `bun run test:scripts` via `scripts/__tests__/verify-model-tokens.test.ts` (18 tests, all passing). Scanning zero files still exits 2. **One live, non-blocking false-positive risk found this pass** — see "New Finding" below; does not change this AC's PASS verdict since the AC is about *0 hits when the surfaces are clean of real duplication*, which holds. |
| MPR-R2 | Fact count = `A + Σ(hosts(p)×T)`; no agent list. | ✅ PASS — carried forward | Unchanged since iteration 1; `skills/model-profiles.json` and `model-profiles.test.ts` untouched by T10–T13. |
| MPR-R3 | Open profile set; no enumeration outside registry/tests. | ✅ PASS — carried forward | Unchanged; untouched by T10–T13. |
| MPR-R4 | Deterministic precedence, table-driven. | ✅ PASS — carried forward | Unchanged; `scripts/lib/model-profiles.ts` untouched by T10–T13. |
| MPR-R5 | Fail-loud, one error class per test, multi-error single throw. | ✅ PASS — carried forward | Unchanged; untouched by T10–T13. |
| MPR-R6 | Charters declare tier, never model; `model_hint` retired. | ✅ PASS — carried forward | Strengthened in iteration 1 (T11's real `model_hint`-reappearance test); untouched this pass. |
| MPR-R7 | Workflow resolution; no workflow markdown gains a model line. | ✅ PASS — carried forward | `git diff --stat 45daaa1..af79151 -- skills/massa-ai/workflows/` → empty (re-verified live this pass). |
| MPR-R8 | Exactly the 5 pins change; frozen-fixture regression. | ✅ PASS — carried forward | Unchanged; `subagent-parity.test.ts`'s frozen-baseline tests untouched by T10–T13; fixture still pinned to `45daaa162ca18799a6da4ac832a65b5e83199572`. |
| MPR-R9 | Per-host allowed-key subset assertion. | ✅ PASS — carried forward | Mutations #5/#6 (Cursor `reasoningEffort`, OpenCode `metadata`) last re-run in iteration 1 against a `generate-subagent-artifacts.ts` state T13 does not touch (T13 only edits `scripts/verify-model-tokens.ts`). Not re-run this pass — correctly out of T13's diff surface. |
| MPR-R10 | Effort renders per host syntax, enum-validated. | ✅ PASS — carried forward | Unchanged; untouched by T10–T13. |
| MPR-R11 | Generated role→tier table; no per-host table/rationale column. | ✅ PASS — carried forward | Unchanged; `FEATURES.md` and its doc-drift test untouched by T10–T13. |
| MPR-R12 | `verify-model-ids.ts` probes, exits non-zero on miss, skips with reason. | ✅ PASS — carried forward | Live re-run this pass: opencode 11/11 OK, claude 3/3 OK, cursor OK (inherit), codex SKIPPED with reason, exit 0. Unchanged file. |

---

## Spec §4 Enumerated Behavior Changes — Row-by-Row

Unchanged since iteration 0. T10–T13 touch only `scripts/verify-model-tokens.ts` (+ its test),
`scripts/generate-subagent-artifacts.ts`'s `loadCharter` signature and `emitCursor`'s docblock
comment (iteration 1), and `.specs/` prose (T12) — none affect any emitter's resolved output.
All 5 pin rows and both host key-set-change rows remain PASS, carried forward, re-confirmed by
this pass's full `test:scripts` re-run (857/0) which includes the unchanged frozen-baseline
diff tests.

---

## Gap 1 Residual (Iteration 1's B/C/D) — Re-Derived Independently This Pass

### 1. Is B/C/D actually closed?

Re-ran the exact iteration-1 defeat attempts against the new (T13) matcher, plus additional
variants:

| Attempt | Iteration 1 | This pass (post-T13) | Verdict |
| --- | --- | --- | --- |
| B: `DeepSeek V4\nPro` (line-wrapped display name) | 0 hits | **1 hit** (`DeepSeek V4 Pro`) | ✅ Closed |
| C: `glm 5.2` (separator paraphrase of `glm-5.2`) | 0 hits | **1 hit** (`glm-5.2`) | ✅ Closed |
| D: `DeepSeek  V4 Pro` (double-whitespace variant) | 0 hits | **1 hit** (`DeepSeek V4 Pro`) | ✅ Closed |
| I (new): `glm_5.2` (underscore separator) | — | **1 hit** | ✅ Also closed (design says `-`/`_`/whitespace are interchangeable) |
| J (new): `glm\t5.2` (tab separator) | — | **1 hit** | ✅ Also closed (`\s` includes tab) |
| K (new): `prefer\nDeepSeek\nV4\nPro\nhere` (split across **two** line breaks, one word per line) | — | **1 hit** | ✅ Also closed — more robust than the shipped test claims |
| L (new): `GLM_5.2` (mixed case + separator swap) | — | **1 hit** | ✅ Also closed |
| N (new): `opencode go/deepseek v4 pro` (separator swap on a 3-segment provider-qualified id, slash preserved) | — | **1 hit** (`opencode-go/deepseek-v4-pro`) | ✅ Also closed |
| P (new): `glm-5.2,then done` (token immediately followed by a comma) | — | **1 hit** | ✅ Boundary rule still correct with the widened pattern |
| M (new): `glm.5.2` (dot as separator, not `-`/`_`/space) | — | **0 hits** | Deliberately out of scope — dots are already literal version-number separators inside real ids (`gpt-5.4-mini`), so widening them would risk exploding false positives on any nearby decimal number. Reasonable, disclosed boundary, not a defect. |
| O (new): `V4 Pro DeepSeek` (word-order reversal) | — | **0 hits** | Deliberately out of scope — this is permutation, not separator/whitespace variation; would need fuzzy/NLP matching, disproportionate to the AC and not attempted by design. |

**B, C, D are fully closed**, plus several additional realistic variants (underscore, tab,
multi-line-wrap, mixed case, 3-segment paraphrase) that the shipped tests don't explicitly
cover but the widened regex correctly catches as a side effect of the general rule. Two
residual non-catches remain (dot-as-separator, word-order reversal) — both are reasonable,
disclosed scope boundaries rather than defects, given the disproportionate cost of covering
them relative to their plausibility.

### 2. Did widening the match introduce a false positive?

**No new false-positive shape attributable to the widening itself.** Twelve targeted
false-positive probes were run against realistic, plausible charter-adjacent prose using the
actual repository's vocabulary — hyphenated phrases (`read-only`), version numbers unrelated to
any model (`Bun 1.3.14`, `section 5.2`), and words that are substrings of retired/compound
tokens (`pro`, `mini`, `flash`, `sol`, `terra`, `k3s`) — **all returned 0 hits**. The
commit's own claimed proof (reverting only the separator-normalization line turns exactly the 3
new tests red and leaves the other 15 green) was **independently reproduced live**: `15 pass /
3 fail` after the isolated revert. A second isolation I ran myself — reverting only the
whole-content-matching half of the change while keeping separator normalization — also turned
the line-wrap test red (`0 pass / 1 fail`), confirming **both halves of T13 are independently
load-bearing**, not just the one the commit message proved.

**However — a real, live false-positive risk exists, orthogonal to T13.** See "New Finding"
below. It is not caused by the widening (single-word tokens are unaffected by the
separator-substitution logic, since it only fires on tokens containing an internal `-`, `_`,
or space), and it reproduces identically against the pre-T13 regex. I report it in full per
instruction, but it is not evidence that T13 "made something worse" — T13's own change is
clean.

### 3. Are A and G still correctly excluded?

| Exclusion | Verdict | Evidence |
| --- | --- | --- |
| A: a model name in neither the registry nor the frozen fixture (`claude-4-omega`) | ✅ Correctly excluded | Direct probe: 0 hits. **The pinning test is well-formed**: `scripts/__tests__/verify-model-tokens.test.ts` (T13) — `"a model name in NO registry and NO fixture is deliberately NOT a hit"` asserts `expect(hits).toEqual([])` against `"runs on totally-made-up-model-9"`, a correct negative assertion of the intended scope boundary, not a decorative or wrongly-shaped test. |
| G: homoglyph substitution (Cyrillic `а` in `hаiku`) | ✅ Correctly excluded | Direct probe: 0 hits, unchanged since iteration 1. Not pinned by a test (only documented in the docblock), which is proportionate — G is an adversarial-evasion scenario outside this gate's stated threat model (a well-meaning engineer pasting a value, not someone hiding one), so a regression here would be a much lower-priority miss than A's. |

---

## New Finding — Live False-Positive Risk on Ordinary English (Non-Blocking)

**What**: the bare, single-word Claude model aliases in the token list — `opus`, `haiku`,
`sonnet` — are also ordinary English words (a poetry form, another poetry form, and the
Latin for "a great work," as in "magnum opus"). Reproduced **end-to-end through the real CLI**,
not just the pure `scan()` function: appended `"Aim for documentation that reads like a magnum
opus of clarity, not a rushed draft."` to `skills/agents/documentation-agent/SKILL.md`,
regenerated both artifact sets, ran `bun scripts/verify-model-tokens.ts` → **FAIL, 9 hits**,
one per propagated site (1 charter + 4 mirrored + 4 generated bodies), token `opus`, exit 1.
Reverted; tree confirmed clean afterward. Also confirmed via the pure `scan()` function for
`haiku` (`"Summarize this finding as a haiku for the changelog."`) and `sonnet`
(`"The comment reads like a sonnet, four clean lines."`) — both also fire.

**Attribution**: this is **not** introduced or worsened by T13. Reconstructed the pre-T13
`tokenRegex` and confirmed it matches `"magnum opus"` identically — single-word tokens have no
internal `-`/`_`/space for T13's substitution to act on, so their matching behavior is
byte-for-byte unchanged across T10→T13. This risk has existed, live, since `611f29e` (T10,
iteration 0's own fix); I did not test for this specific collision shape during iterations 0 or
1, so this is a newly *discovered* finding this pass, not a newly *introduced* one — and the
coordinator's own framing for this pass ("a word pair that collides with a short token like the
bare Claude aliases") named exactly this risk category to check for.

**Currently dormant**: grepped all 136 scanned surfaces for `opus`, `haiku`, `sonnet` as
standalone words (excluding the legitimate `model:`/`model =` assignments, which are already
excluded by construction) — zero occurrences. No charter currently triggers this.

**Blocking judgment: non-blocking.** Reasons:
1. It is a false **positive**, not a false **negative** — the exact opposite failure mode from
   the defect this whole feature (and MPR-R1 specifically) exists to prevent. A silent
   duplicated model fact is the danger; a loud, immediately-diagnosable red gate on an unlucky
   word choice is friction, not risk. The failure output names the exact file, line, matched
   token, and 120-character text snippet — a human sees "opus" flagged next to "magnum opus"
   and understands the false alarm in seconds, with no silent wrong behavior anywhere.
2. It requires an unusual, coincidental word choice (three specific short English words,
   currently absent from all 15 charters) rather than a common one.
3. Zero cost to recover: reword the sentence, no data loss, no silent regression.
4. T13 did not cause or worsen it — failing T13 for a defect it doesn't introduce would be
   penalizing the wrong change.
5. It does not violate MPR-R1's AC as written ("0 hits" when the surfaces are actually clean of
   duplicated facts — the AC does not promise zero false positives, only that the gate catches
   real ones and is a scripted mechanism, which it is).

**Recommendation (optional, not required)**: if hardened later, the cheapest fix would be
requiring the three single-word aliases to be adjacent to a `model` context word, or accepting
the (small, disclosed) false-positive surface as the tradeoff for a scan simple enough to stay
auditable. Not a required fix task — recorded for awareness only.

> **Main-agent note, added when persisting this report.** The recommendation above was
> considered and **declined**, deliberately. Gating the three bare aliases on an adjacent
> `model` context word would trade a false positive for a false *negative*: `use haiku for
> this agent` in charter prose is a real duplicated fact and carries no context word, so the
> narrowed rule would stop catching the exact case MPR-R1 exists to catch. A loud, dormant,
> five-second-to-diagnose false alarm is the better side of that trade. The finding is instead
> recorded in the script's own docblock, so the next person to hit it rewords their sentence
> rather than weakening the gate.

---

## Discrimination Sensor — Full History Across All Three Iterations

| # | Mutation | Iteration found/last run | This pass | Result |
| --- | --- | --- | --- | --- |
| 1 | Swap two charters' `model_tier` | 0 | Carried forward — `skills/model-profiles.json`/`subagent-parity.test.ts` untouched since | ✅ Killed |
| 2 | Flip `hostDefaults.claude` | 0 | Carried forward — untouched | ✅ Killed |
| 3 | `selectProfile` silent fallback | 0 | Carried forward — `scripts/lib/model-profiles.ts` untouched | ✅ Killed |
| 4 | Drop a tier from a host block | 0 | Carried forward — untouched | ✅ Killed |
| 5 | Reinstate `reasoningEffort` in `emitCursor` | 0, re-run 1 | Carried forward — `generate-subagent-artifacts.ts` untouched by T12/T13 | ✅ Killed |
| 6 | Reinstate `metadata` in `emitOpenCode` | 0, re-run 1 | Carried forward — untouched by T12/T13 | ✅ Killed |
| 7 | Drop `OPENCODE_OWNED_MARKER` | 0, re-run 1 | Carried forward — untouched by T12/T13 | ✅ Killed |
| 8 | Edit charter `model_tier` without regenerating | 0, re-run 1 | Carried forward — untouched by T12/T13 | ✅ Killed |
| 9 | Reintroduce a rationale column in `FEATURES.md` | 0 | Carried forward — `FEATURES.md` untouched | ✅ Killed |
| 10 | Point a registry tier at a nonexistent model id | 0 | Carried forward — `scripts/verify-model-ids.ts` untouched | ✅ Killed |
| 11 | `validateRegistry` throws on first fault only | 0 | Carried forward — untouched | ✅ Killed |
| 12 | `loadCharter` silently defaults a missing `model_tier` | 0 (SURVIVED) → 1 (killed) | Carried forward — `loadCharter` untouched by T12/T13 | ✅ Killed |
| 13 | Tighten `config-cli.ts`'s uninstall substring match | 0 | Carried forward — `config-cli.ts` untouched | ✅ Killed |
| 14 | Revert T13's separator-normalization only (coordinator's own claimed proof) | — | **Re-run this pass** | ✅ 3 targeted tests red, 15 green — exact match to claim |
| 15 (new, this pass) | Revert T13's whole-content-matching only, keep separator normalization | — | **New this pass** | ✅ Killed (line-wrap test fails: 0 pass / 1 fail) — proves both halves of T13 are independently load-bearing |
| 16 (new, this pass) | Defeat attempts against the widened matcher (B/C/D + I/J/K/L/M/N/O/P + 12 false-positive probes) | — | **New this pass** | B/C/D + 6 extra variants caught; M/O correctly out of scope; 11/12 false-positive probes clean; 1 (`opus`/`haiku`/`sonnet` vs. ordinary English) fires — reported as non-blocking, pre-existing since T10 |

**Result: 16/16 mutation/defeat exercises produce the expected outcome** (13 kill-list mutations
killed, T13's own proof reproduced, an independent second isolation also killed, and the
defeat/false-positive probing correctly separated "closed" from "still out of scope by design"
from "a real but non-blocking residual risk").

Tree confirmed clean after every mutation this pass and at the end of the full sequence.

---

## Gate Re-Run Evidence (at `af79151`)

Build state: all five packages already built (`packages/shared`, `packages/core`,
`apps/tools-api`, `apps/mcp-client`, `apps/opencode-plugin` each with non-empty `dist/`),
confirmed before running any gate.

| Gate | Command | Result | Exit | Expected | Match |
| --- | --- | --- | --- | --- | --- |
| Subagent artifacts drift | `bun run scripts/generate-subagent-artifacts.ts --check` | `No drift` | 0 | No drift | ✅ |
| Skill bundles drift | `bun run scripts/generate-skill-artifacts.ts --check` | `No drift` | 0 | No drift | ✅ |
| Scripts test suite | `bun run test:scripts` | **857 pass / 0 fail** | 0 | 857/0 | ✅ exact |
| Plugin test suite | `bun run test:plugins` | **96 pass / 0 fail** (8 files) | 0 | 96/0 | ✅ exact |
| Lint | `bun run lint` (oxlint) | silent success | 0 | 0 | ✅ |
| Model-token scan | `bun run verify:model-tokens` | `OK — scanned 136 file(s) for 29 token(s)` | 0 | 0 | ✅ |
| Model-ID verification | `bun run verify:model-ids` | opencode 11/11 OK, claude 3/3 OK, cursor OK (inherit), codex **SKIPPED** with named reason | 0 | 0, codex SKIPPED | ✅ exact |

All figures match the coordinator's stated expectation exactly.

---

## Skipped Sensors

| Sensor | Reason |
| --- | --- |
| massa-ai MCP `recall`/`search` | MCP server not registered in this session; all state from `.specs/` files and direct source/live-code reads across all three iterations. |
| Cursor hard-error-vs-silent-fallback probe (`cursor-agent`) | `cursor-agent` still not installed on this machine (re-confirmed this session). Unchanged from iterations 0/1 — `inherit` remains correct under either reading, per `spec.md` §7 / `fool.md` finding A. |
| Codex model-ID probe | By design — `verify-model-ids.ts` reports it SKIPPED with a named reason, re-confirmed firing correctly this session. |

---

## Remaining Gap List

**No blocking gaps remain.**

1. *(Non-blocking, pre-existing since T10, reported this pass)* `scripts/verify-model-tokens.ts`
   can false-fire on ordinary English use of `opus`, `haiku`, or `sonnet` (e.g. "a magnum opus of
   clarity," "summarize as a haiku"), since these three model aliases are also common English
   words / poetry-form names. Reproduced live, end-to-end. **Does not block this verdict** — see
   "New Finding" above for the full reasoning (false positive vs. false negative, loud and
   immediately diagnosable, zero cost to recover, no currently-shipped charter affected, not
   caused or worsened by T13). Recorded for awareness; no fix task required to ship. The
   suggested narrowing was considered and declined — see the main-agent note under that section.
2. *(Non-blocking, disclosed scope boundary, not a defect)* The scan does not catch a
   dot-separated paraphrase (`glm.5.2`) or a word-order permutation (`V4 Pro DeepSeek`) of a
   known model name. Both are reasonable, deliberate scope limits — widening either would
   introduce disproportionate false-positive risk (dots are legitimate version-number
   separators already in real ids) or require fuzzy/NLP matching out of proportion to the AC.

No other gaps — spec-anchored, structural, or sensor-based — survive independent re-derivation
across all three verification passes.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — T13 is a focused, 2-file change (44 lines in the script, 36 in its test) |
| Surgical changes | ✅ — touches only the file it needed to |
| No scope creep | ✅ |
| Matches patterns | ✅ |
| T13's own claimed proof independently reproduced | ✅ — exact match (3 red / 15 green) |
| Second isolation (whole-content matching half) independently tested | ✅ — also load-bearing |
| False-positive risk actively hunted, not assumed absent | ✅ — 12 targeted probes + 1 live end-to-end injection |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed | `CONTRIBUTING.md` step 7 (discrimination plan), `design.md` §6 kill-list (all 12 + 4 mutations added across three verification passes now closed) |

---

## Summary

**Overall**: ✅ Ready — PASS.

**Spec-anchored check**: 12/12 requirement rows PASS with re-derived evidence; 0 unmet ACs.

**Sensor**: 16/16 mutation/defeat exercises across three iterations produce the expected
outcome — 13 kill-list mutations killed (including the previously-surviving #12, now killed),
T13's own claimed proof reproduced exactly, a second independent isolation also killed, and
targeted defeat/false-positive probing correctly separates closed gaps from disclosed scope
boundaries from one real but non-blocking residual risk.

**Gate**: `test:scripts` 857/0 exit 0, `test:plugins` 96/0 exit 0, both `--check` "No drift" exit
0, `lint` exit 0, `verify:model-tokens` exit 0, `verify:model-ids` exit 0 with codex correctly
SKIPPED — all six exactly matching the expected counts.

**What works**: the full registry/resolver/emitter architecture (unchanged since iteration 0);
the MPR-R1 scan now closes the original reproduced hole, the iteration-1 residual
(line-wrap/paraphrase/whitespace), and several additional realistic variants beyond its own
shipped tests; the repaired `loadCharter` throw tests; the transparent, independently
re-verifiable `design.md`/`tasks.md` amendments.

**Issues found**: one non-blocking, pre-existing, currently-dormant false-positive risk on
ordinary English collisions with the three bare Claude aliases (not caused by T13); two
disclosed, deliberate scope boundaries (dot-separator paraphrase, word-order permutation). None
require a fix to ship.

**Next steps**: none required. Feature is verified complete against `spec.md` MPR-R1..R12 and
`spec.md` §4's enumerated behavior changes, at commit `af79151b6847126d5f53c7173a5183d691cb450c`.

---

## Requirement Traceability Update

| Requirement | Status at iteration 0 | Status at iteration 1 | Final status (iteration 2) |
| --- | --- | --- | --- |
| MPR-R1 | ❌ Needs Fix | ✅ Verified (1 non-blocking residual noted) | ✅ Verified (residual closed; 1 new non-blocking finding reported) |
| MPR-R2..R12 | ✅ Verified | ✅ Verified | ✅ Verified (carried forward / re-confirmed) |
