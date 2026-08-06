# Validation — agent-era-harness-upgrades

**Verdict: PASS**

**Verifier**: fresh verification-agent (author ≠ verifier), spec-anchored, evidence-or-zero.
**Commit range verified**: `4e524878`..`d39fb040` (branch `spec/agent-era-harness-upgrades`),
worktree `/Users/luizmassa/Projects/massa-ai/.claude/worktrees/agent-era-harness-upgrades`.
Tree confirmed clean (`git status --short`) before and after every mutation cycle below.

## Summary

28/28 EARS ACs covered with direct evidence (18 by re-derived prose citation, 10 by
running the actual scripted commands against scratch temp roots with real exit codes —
no piping that masks exit codes). 8 discrimination mutations run (6 mandated + 2
additional spot-checks of the authors' self-attested claims); all 8 killed by the
existing suites, and the tree was restored byte-identical after each. Asset-integrity
gates (unit 106/0, full 205/0, parity 88/0, lint 0, `generate:artifacts --check` 0)
reproduce exactly the figures claimed in `.specs/project/STATE.md`. The recorded
SPEC_DEVIATION (T9/T10 `validate_skill.ts` re-baseline) is verified accurate: all 17
agent charters, including both edited ones, fail only the single pre-existing
`description_has_negative_scope` check, confirmed present at the pre-feature baseline
commit `1906a04e` (parent of the specs commit `4e524878`) — no new failure class.

## Per-AC Table

### P1: Agent-read-aware code-shape guidance (AEH-01, AEH-02) — 6 ACs

| # | AC | Evidence | Verdict |
|---|----|----------|---------|
| 1 | code-quality-audit.md split lead requires discoverability/change-risk, prohibits size/"and"-alone | `skills/massa-ai/workflows/code-quality/code-quality-audit.md:88,95` — "only when separating them yields an externally-findable named unit... or measurably reduces change risk — never on concern-count or size alone" / "never split on size or 'more than one thing' alone" | PASS |
| 2 | code-quality-fix.md applies same criterion | `skills/massa-ai/workflows/code-quality/code-quality-fix.md:51-53` — SOLID/Clean Code/KISS lines all cite "externally-findable named unit... or reduces change risk" | PASS |
| 3 | refactor.md names extract-for-findability as primary payoff | `skills/massa-ai/workflows/refactor.md:43` — "The primary payoff of extraction is extract-for-findability: create a named unit locatable by search or grep from outside the file... not extraction volume alone" | PASS |
| 4 | coding-guidelines.md states ~1000/~2000 thresholds + per-hop cost | `skills/massa-ai/references/coding-guidelines.md:73-75` — one-subject ~1000 fine; >2000 exceeds one read; N-file split "multiplies" cost, per-hop navigation loss | PASS |
| 5 | code-quality-audit.md static leads flag multi-subject + >2000, no-flag-below-bound guard | `skills/massa-ai/workflows/code-quality/code-quality-audit.md:79` — "flag multi-subject files... and any file over ~2000 lines... Do NOT flag a single-subject file for line count alone below that bound" | PASS |
| 6 | File-size guidance framed as read mechanics, not depth metric | `skills/massa-ai/references/coding-guidelines.md:76` — "This guidance derives from agent read mechanics, not from module depth... depth is NOT a lines-of-code ratio (`references/architecture-deepening-lens.md` Rejected Framings)"; cross-checked against `architecture-deepening-lens.md:100` ("Depth is NOT a lines-of-code ratio") | PASS |

### P1: Layered test-gate model (AEH-04, AEH-05, AEH-08, AEH-09) — 7 ACs

| # | AC | Evidence | Verdict |
|---|----|----------|---------|
| 1 | tests-audit.md gate table: 5 gates → 5 error classes | `skills/massa-ai/workflows/tests/tests-audit.md:22-28` — Unit→Business-logic errors, Coverage→Code no test touched, Variation→Hardcoded-example brittleness, Acceptance-criteria mapping→Built-the-wrong-thing, Quality-metric trend→Drift over time | PASS |
| 2 | tests-audit.md variation sensor (single-fixture-example flag) | `skills/massa-ai/workflows/tests/tests-audit.md:69` — "Variation check: flag tests exercising only the single fixture example where input bounds or parameters can vary — hardcoded-example brittleness the unit gate cannot see" | PASS |
| 3 | tests-fix.md variation fix method (varied-input, never a 2nd fixture copy) | `skills/massa-ai/workflows/tests/tests-fix.md:55` — "Variation: add varied-input cases (bounds, parameter changes)... never add a second copy of the fixture example" | PASS |
| 4 | test-engineer charter lists variation/property-style design | `skills/agents/test-engineer/SKILL.md:21` — "Design variation/property-style test cases — vary inputs beyond the fixture example (bounds, parameter changes) — technique-level, library-neutral" | PASS |
| 5 | test-engineer mission names the five error classes | `skills/agents/test-engineer/SKILL.md:15` — "...catches the five distinct error classes a test suite must cover: business-logic errors, code no test touched, hardcoded-example brittleness, built-the-wrong-thing, and drift over time" | PASS |
| 6 | tests-audit.md dispatch references `tests` lens; audit-specialist lens table has `tests` row | `skills/massa-ai/workflows/tests/tests-audit.md:61` (`lens: tests`) + `skills/agents/audit-specialist/SKILL.md` lens table `tests` row → "Coverage, regression protection, assertion quality, variation" routing to `workflows/tests/tests-audit.md` | PASS |
| 7 | tests-audit.md trend sensor reads recorded snapshots, reports direction ≥2 snapshots | `skills/massa-ai/workflows/tests/tests-audit.md:70` — "Trend check: read `bun skills/massa-ai/scripts/lessons.ts --root . metrics trend` and report the direction... when two or more snapshots exist; report `insufficient data` otherwise" | PASS |

### P1: Reviewer in the loop (AEH-06) — 3 ACs

| # | AC | Evidence | Verdict |
|---|----|----------|---------|
| 1 | All 14 named workflows carry `massa-ai-reviewer` dispatch block (read-only, post-impl, pre-verification) | Grep count across all 14 target files: `dispatch=1` in each of `feature.md`, `general.md`, `debug.md`, `refactor.md`, `spec-driven.md` (Execute step 6, `skills/massa-ai/workflows/spec-driven.md:113`, immediately before verification-agent block at `:125`), `bugs-fix.md`, `code-quality-fix.md`, `architecture-fix.md`, `security-fix.md`, `requirements-fix.md`, `tests-fix.md`, `implementation-fix.md`, `maestro-fix.md`, `mobile-figma-fix.md` — 14/14 confirmed by direct grep, matching the suite's own count-sensor (`scripts/__tests__/agent-era-guidance-content.test.ts:422-431`) | PASS |
| 2 | Fallback clause present when subagent unavailable | Same 14-file grep: `fallback=1` in every file — literal "fallback: if the subagent is unavailable, run a standalone fresh-eyes review against this output contract and record the skipped-delegation reason" | PASS |
| 3 | Reviewer dispatch does not replace/weaken existing verification gates | `skills/massa-ai/workflows/spec-driven.md:113-127` — reviewer dispatch block immediately precedes, and does not replace, the pre-existing `massa-ai-verification-agent` dispatch block (still present verbatim, `Finish Execute by running references/spec-driven/validate.md... verification-agent always runs automatically`); content-sensor test "spec-driven.md's existing verification-agent dispatch block stays intact" passes | PASS |

### P2: Advisory trust ramp (AEH-03) — 7 ACs

| # | AC | Evidence (command + exit code, scratch root) | Verdict |
|---|----|----------|---------|
| 1 | `review add --category --feedback --source` appends to `data.reviews` | `bun skills/massa-ai/scripts/lessons.ts --root /tmp/aeh-scratch review add --category installer --feedback none --source pr-1` → `.specs/lessons.json` grows a `reviews[]` record each call, verified across 30 calls | PASS |
| 2 | `trust status` lists streak/total/trusted per category | `trust status` → `installer: streak=29/30 total=29 trusted=no` then `installer: streak=30/30 total=30 trusted=yes`, exit 0 both times | PASS |
| 3 | Streak == `trust_threshold` (30) → trusted (boundary, `>=`) | 29 records → `trusted=no`; 30th record → `trusted=yes` (both sides of the boundary directly exercised) | PASS |
| 4 | `major` demotes trusted category, resets streak to 0 | 31st record (`--feedback major`) on the now-trusted `installer` category → `REVIEW installer (streak=0, trusted=false)`; `trust status` → `installer: streak=0/30 total=31 trusted=no` | PASS |
| 5 | Legacy store (pre-ramp fields) loads clean, empty trust view, exit 0 | Hand-authored legacy-schema store (`schema/promote_threshold/window_days/quarantine_threshold/next_id/lessons` only) → `trust status` → `(no review records)`, exit 0; `list --status all` afterward left the store file byte-identical (`diff` confirmed) | PASS |
| 6 | implementation-delivery.md instructs advisory trust-status reporting at human-review stage, merge clause unchanged | `skills/massa-ai/references/implementation-delivery.md:114` — "the change's category trust status (`bun skills/massa-ai/scripts/lessons.ts --root . trust status --category <kebab>`) as advisory reading-depth context — it never substitutes for the approval decision below"; `:108` — "Approval for one PR does not carry to the next" present verbatim (matches spec Out-of-Scope's cited clause) | PASS |
| 7 | Trust-ramp policy documented in `references/lessons.md` | `skills/massa-ai/references/lessons.md:69-116` — "Trust Ramp and Quality-Metric Trend (Advisory)" section: Categories, Feedback levels, Trust threshold (`>=` stated explicitly), Advisory-only scope, Commands (4 commands, literal-matched against the CLI) | PASS |

Edge case also confirmed: `--feedback catastrophic` → exit 2, "invalid choice: 'catastrophic' (choose from 'none', 'minor', 'major')".

### P2: Quality-metric trend recording (AEH-05) — 3 ACs

| # | AC | Evidence (command + exit code, scratch root) | Verdict |
|---|----|----------|---------|
| 1 | `metrics add` appends a snapshot | `metrics add --feature f1 --result FAIL --fix-iterations 3 --surviving-mutants 5 --acs-total 10 --acs-covered 6` → `METRICS f1 (result=FAIL, survivingMutants=5, fixIters=3, acs=6/10)`, exit 0 | PASS |
| 2 | `metrics trend` prints snapshots + direction verdict; `insufficient data` under 2, exit 0 | 1 snapshot → `trend: insufficient data`, exit 0. 2nd snapshot (PASS, 0 mutants) → `trend: improving`. 3rd snapshot (FAIL, more mutants) → `trend: degrading`. 4th identical-score snapshot → `trend: stable`. All exit 0 | PASS |
| 3 | `validate.md` instructs recording the snapshot via `metrics add` | `skills/massa-ai/references/spec-driven/validate.md:223-226` — "Immediately after validation completes, record this run's quality-metric snapshot..." followed by the literal `lessons.ts --root . metrics add --feature <slug> --result PASS|FAIL --fix-iterations <n> --surviving-mutants <n> --acs-total <n> --acs-covered <n>` | PASS |

Edge cases also confirmed: `--result MAYBE` → exit 2 naming accepted values; `--fix-iterations -1` → exit 2, "must be a non-negative integer, got '-1'".

### P2: Spec anchor for the feature workflow (AEH-07) — 2 ACs

| # | AC | Evidence | Verdict |
|---|----|----------|---------|
| 1 | `feature.md` captures 1-5 testable ACs (or references existing spec artifact) before implementation | `skills/massa-ai/workflows/feature.md:42` (step 11) — "Capture 1-5 testable acceptance criteria in the conversation before implementation starts, or reference an existing spec artifact..." precedes step 12 "Implement the feature..." (`:43`) | PASS |
| 2 | `feature.md` verification checks outcomes against captured ACs | `skills/massa-ai/workflows/feature.md:61` (step 13) — "Run the verification recipe and check outcomes against the captured acceptance criteria from step 11, not only against a generic verification recipe" | PASS |

**AC coverage: 28/28 (100%).** Every AC has a file:line citation or a real command
transcript with exit code; none rests on recall.

## Discrimination-Sensor Results

Tree verified clean (`git status --short`, empty) before mutation work began. Each
mutation below was applied by direct file edit, the relevant suite run to observe red,
then `git checkout -- <file>` restored the file and `git status --short` was re-run to
confirm a byte-identical, clean tree before the next mutation. All 8 mutations —
6 mandated by the verification brief plus 2 additional spot-checks of the authors'
self-attested "observed red" claims — were killed.

| # | Mutation | File | Killed by | Result |
|---|----------|------|-----------|--------|
| 1 | Threshold operator `>=` → `>` in `cmdTrustStatus` | `skills/massa-ai/scripts/lessons.ts:866` | `scripts/__tests__/lessons-trust-metrics.test.ts` | 19 pass / 3 fail → restored 22/0 |
| 2 | Dropped the `major`-breaks-streak-scan guard in `categoryStreak` | `skills/massa-ai/scripts/lessons.ts:492` | `scripts/__tests__/lessons-trust-metrics.test.ts` | 20 pass / 2 fail → restored 22/0 |
| 3 | Swapped `improving`/`degrading` comparison direction in `trendVerdict` | `skills/massa-ai/scripts/lessons.ts:515-516` | `scripts/__tests__/lessons-trust-metrics.test.ts` | 20 pass / 2 fail → restored 22/0 |
| 4 | Deleted the discoverability-criterion split lead sentence | `skills/massa-ai/workflows/code-quality/code-quality-audit.md:95` | `scripts/__tests__/agent-era-guidance-content.test.ts` | 51 pass / 1 fail → restored 52/0 |
| 5 (mandated: reviewer-dispatch/persona) | Removed the `persona:` bullet from one reviewer-dispatch block | `skills/massa-ai/workflows/debug.md:71` | `scripts/__tests__/skills-harness-integrity.test.ts` ("dispatch persona emission" check) | 31 pass / 1 fail (named the file+dispatch target) → restored 32/0 |
| 6 | Deleted the "Quality-metric trend / Drift over time" gate-table row | `skills/massa-ai/workflows/tests/tests-audit.md:28` | `scripts/__tests__/agent-era-guidance-content.test.ts` | 51 pass / 1 fail → restored 52/0 |
| 7 (spot-check) | Corrupted the reviewer-dispatch header text in one fix workflow (kills both the per-file sensor and the 14-file count sensor) | `skills/massa-ai/workflows/maestro/maestro-fix.md:66` | `scripts/__tests__/agent-era-guidance-content.test.ts` (per-file assertion + "all 14 wired workflows" count sensor) | 50 pass / 2 fail (count sensor read 13, not 14) → restored 52/0 |
| 8 (spot-check) | Deleted the variation-sensor bullet from `tests-audit.md` | `skills/massa-ai/workflows/tests/tests-audit.md:69` | `scripts/__tests__/agent-era-guidance-content.test.ts` | 51 pass / 1 fail → restored 52/0 |

**Sensor kill count: 8/8.** All restores verified byte-identical via `git status --short`
(empty) and the affected suite returning to its pre-mutation green count.

## Spot-Check of Authors' Self-Attested Mutation-Evidence Claims

`.specs/HANDOFF.md:37-39` and `.specs/features/agent-era-harness-upgrades/tasks.md`
Done-when items claim every T15-T17 sensor and every content-sensor assertion was
"observed red" before being trusted, but no itemized sensor→mutation→red table exists
anywhere in the committed tree (T18's Done-when literally asks for one "recorded in the
task record"; none was found in `tasks.md`, `STATE.md`, or `HANDOFF.md` — the claim is
narrative-only). This is exactly the repo's own named failure class ("self-attested
sensors"), so 3 of the 8 mutations above (#5, #7, #8) were chosen specifically to
re-derive claims from that class independently, without reading or trusting any
author-provided mutation log:

1. **T15-T17 persona-bullet claim** ("every Dispatch block... mandatory `persona:`
   bullet... sensor per file, observed red once") — re-run independently on
   `debug.md` (mutation #5 above): killed by `skills-harness-integrity.test.ts`'s
   aggregate "dispatch persona emission" check, which named the exact broken target
   (`skills/massa-ai/workflows/debug.md -> massa-ai-reviewer`). Claim verified true.
2. **T17 "14-file count sensor" claim** — re-run independently on `maestro-fix.md`
   (mutation #7 above): the count sensor
   (`scripts/__tests__/agent-era-guidance-content.test.ts:428-431`) read 13/14 under
   mutation, exactly as its own assertion promises. Claim verified true.
3. **T7 variation-sensor claim** ("variation sensor... observed red") — re-run
   independently (mutation #8 above): killed cleanly, isolated to the one assertion
   naming the variation-check literal. Claim verified true.

All 3 independently-reproduced claims held. The narrative claim is accurate but its
recording mechanism (prose in HANDOFF.md, no itemized table) is weaker than the task
spec asked for — noted as a process gap, not a correctness gap (see Gaps below).

## Asset-Integrity Results

| Gate | Command | Result | Matches STATE.md claim? |
|------|---------|--------|--------------------------|
| Quick suites | `bun test scripts/__tests__/lessons-trust-metrics.test.ts scripts/__tests__/agent-era-guidance-content.test.ts scripts/__tests__/skills-harness-integrity.test.ts` | 106 pass / 0 fail | Yes (106/0 claimed) |
| Full gate | + `pyts-golden.test.ts` + `spec-driven-validators.test.ts` | 205 pass / 0 fail | Yes (205/0 claimed) |
| `generate:artifacts` (plain) | `bun run generate:artifacts` | exit 0, zero tracked-file drift (`git status --short` empty after) | Yes |
| `generate:artifacts --check` | `bun run generate:artifacts --check` | exit 0, "No drift: generated files match checked-in files." | Yes |
| Parity suites | `bun test scripts/__tests__/skill-artifact-parity.test.ts scripts/__tests__/subagent-parity.test.ts` | 88 pass / 0 fail | Yes (88/0 claimed) |
| Lint | `bun run lint` | exit 0 (oxlint) | Yes |
| `validate_skill.ts` (edited charters) | `bun skills/massa-ai/scripts/validate_skill.ts skills/agents/test-engineer` / `.../audit-specialist` | Both fail only `description_has_negative_scope` | See Deviation below |

No test was weakened: `lessons-trust-metrics.test.ts` and `agent-era-guidance-content.test.ts`
are new co-located suites (not edits to pre-existing ones); `pyts-golden.test.ts`,
`spec-driven-validators.test.ts`, `skill-artifact-parity.test.ts`,
`subagent-parity.test.ts`, and `skills-harness-integrity.test.ts` were run unmodified
(`git diff` over the full 17-commit range shows no edits to any of these five files —
confirmed by `git log --oneline -- <path>` returning nothing for this range on each).

## SPEC_DEVIATION Disposition

**Recorded deviation**: T9/T10's `tasks.md` Done-when literally reads
"`validate_skill.ts` exits 0"; the batch re-baselined this to "no NEW failures" during
Batches A+B, because `description_has_negative_scope` fails pre-existing on all 17
agent charters.

**Independently re-derived**: Ran `validate_skill.ts` on all 17 `skills/agents/*/SKILL.md`
directories at HEAD — every one fails exactly `description_has_negative_scope` (two,
`judge` and `meta-judge`, additionally fail `description_has_triggers`, but neither was
touched by this feature). Then extracted the pre-feature baseline
(`git archive 4e524878^` — `4e524878` is the specs commit, `^` its parent, release commit
`1906a04e`, i.e. before any of this feature's source edits) and ran the same validator on
`test-engineer`, `audit-specialist`, and the untouched `reviewer` charter from that
baseline tree: all three already failed `description_has_negative_scope` there, and
nothing else. The two edited charters (`test-engineer`, `audit-specialist`) show exactly
the same single failure class post-edit as they did pre-edit and as every untouched
charter shows today.

**Disposition: deviation confirmed accurate, no NEW failure introduced.** Accepted as
documented (pre-existing repo-wide gap, out of this feature's scope).

## Gaps (ranked)

1. **(Low) Mutation-sweep table not recorded as a discrete artifact.** T18's Done-when
   asks for "the mutation sweep table (sensor → mutation → red evidence)" to be
   "recorded in the task record"; only a narrative summary exists in
   `.specs/HANDOFF.md:37-39`. Does not affect correctness — the 3 independent
   spot-check re-runs above confirm the narrative claim is true — but the letter of the
   task's Done-when was not satisfied literally. No fix required to ship; worth a
   one-line addendum to `HANDOFF.md` naming the specific sensors exercised, or accept as
   the batch workflow's standing convention (STATE.md/HANDOFF.md narrative in lieu of a
   separate table, consistent with how other features in this repo record mutation
   sweeps).
2. **(Cosmetic) `tasks.md` T9's literal validator invocation is a file path, not a
   directory.** `bun skills/massa-ai/scripts/validate_skill.ts skills/agents/test-engineer/SKILL.md`
   (as written in the task) errors "Path is not a directory"; the working invocation
   drops `/SKILL.md`. Does not affect the shipped feature — task-doc wording only, not a
   product defect.

Neither gap blocks merge.

## Commit Range

`4e524878` (specs) .. `d39fb040` (state/registry/changelog), 17 commits total, branch
`spec/agent-era-harness-upgrades`. All discrimination mutations above were applied to
and reverted from the working tree at `d39fb040`; `git status --short` was empty both
before verification began and after the final restore.
