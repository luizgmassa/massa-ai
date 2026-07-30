# Tasks — skills/ directive dedup

One atomic commit per task, after its gate passes. Never batch.

## Baseline (measured in this worktree, after `bun install` + `bun run build`)

| Signal | Value at `6d5dc6b` |
| --- | --- |
| `bun run test:scripts` | **892 pass / 0 fail across 44 files**, exit 0 |
| `bun run lint` | 0 |
| `bun run build` | 5/5 |
| `skills-duplication-metric --window=4` | duplicatedLines **535**, excessLines **313** |
| `skills-reference-graph` | orphans **0**, weakly-referenced **0** |
| files under `skills/` | 152 (148 `.md`), 12,624 normalized lines |

The first baseline run reported 891/1. The one failure was `lint-gate.test.ts`, red
because the new metric script used `new Array(n)` — a violation in this feature's own
untracked deliverable, not a pre-existing defect. Fixed at source before baselining.
*A measurement script has to be verified in the tracked state it ships in.*

## Gate check commands

Per task, the minimum: `bun run lint` and the guard suites the task can move —
`bun test scripts/__tests__/skills-harness-integrity.test.ts
scripts/__tests__/workflow-harness-contract.test.ts
scripts/__tests__/validate-repository.test.ts`.
Any task touching `skills/` also runs `bun scripts/generate-skill-artifacts.ts` then
`--check`. Full `bun run test:scripts` + `bun run test:plugins` at T9 and T11.

## Tasks

| # | Requirement | Deliverable | Sensor that would fail if the task were skipped or wrong |
| --- | --- | --- | --- |
| **T1** | SDD-09 / AC-18 | Commit `scripts/skills-duplication-metric.ts` + `scripts/skills-reference-graph.ts` with `scripts/__tests__/skills-duplication-metric.test.ts`. Unit tests cover: a block in 2 files is counted, a block repeated inside 1 file is not, `excessLines` = `length x (copies-1)`, `duplicatedLines > excessLines` whenever any block has ≥2 copies, empty/whitespace-only lines are dropped, fenced blocks are included, orphan detection flags a file nothing names. | `bun test scripts/__tests__/skills-duplication-metric.test.ts` — and the excess-vs-duplicated assertion fails against the pre-fix implementation, which is the defect §7.1 records. |
| **T2** | SDD-02 / AC-4, AC-5 | Remove the three `/Users/luizmassa/Downloads/questions.md` citations (`references/maestro.md:9`, `references/maestro/fact-ledger.md:10,42`); rewrite the coverage-checklist rule so it names no unreachable path. Add the `skills/`-wide absolute-path scan to `skills-harness-integrity.test.ts`. | New scan test. Mutation: reinsert a `/Users/x/y.md` citation in any `skills/` file → scan must go red. |
| **T3** | SDD-01 / AC-1, AC-2, AC-3 | Delete the Model hint column from the `skills/AGENTS.md` Agent Table; add one pointer line naming `metadata.model_tier` as the owner. Add the model-name scan (registry model IDs **and** display-name spellings) over `skills/AGENTS.md` to `skills-harness-integrity.test.ts`. | New scan test. Mutation: re-add `GLM-5.2` to a table row → red. Existing: `subagent-parity.test.ts` stays green (it reads `FEATURES.md`, untouched). |
| **T4** | SDD-07 / AC-15, AC-16 | Add `judge` and `meta-judge` to `references/agent-orchestration.md`'s Roles table. Add the coverage test enumerating `skills/agents/*/` and requiring each charter path in that file. | New coverage test. Mutation: delete one row → red. Existing "no phantom roles" test stays green (opposite direction). |
| **T5** | SDD-08 / AC-17 | Correct `CLAUDE.md`'s "15 sub-agent specialists" to 17. Generalize the roster guard in `workflow-harness-contract.test.ts` from the literal "16" to any count ≠ 17 in the `N specialist` shape. | Generalized guard. Mutation: write "15 specialists" anywhere tracked → red. It passes today, which is the defect. |
| **T6** | SDD-03 / AC-6, AC-7, AC-8 | Create `references/knowledge-verification-chain.md` holding the one copy, with the reconciled closing rule (spec-driven's longer form). Replace the block in `workflows/spec-driven.md:147-164` and `workflows/exploration.md:19-36` with load-and-follow lines. Repoint `references/spec-driven/design.md:44` at the new file and delete its re-inlined copy at `:44-52`. | Scripted: the five-step chain text occurs in exactly one file under `skills/`. `skills-harness-integrity.test.ts:297-322` (dead-link guard) proves the new pointer resolves — it is exactly what caught nothing when the pointer named `SKILL.md`, because `SKILL.md` exists; so the count assertion, not the link check, is this task's sensor. |
| **T7** | SDD-05 / AC-10, AC-11, SDD-04 / AC-9 | Apply P1-P6 from `design.md` §D3. P6 moves `debug.md`'s mobile bullet into `references/debug-diagnosis-loop.md` before deleting the copy. | Per-pair scripted check that each block now occurs once. `validate-repository.test.ts:191-193` guards that `SKILL.md:60-62` was not collaterally edited. |
| **T8** | SDD-06 / AC-12, AC-13, AC-14 | Extend `references/audit-scope.md` per `design.md` §D4 (four existing sections, two new). Remove the extracted bullets from all six `*-audit.md`. Leave each `:9` findings-only gate inline. | `workflow-harness-contract.test.ts` intake + mutation-scope assertions stay green in both directions. Scripted: each extracted rule occurs once. Metric: `excessLines` drops. |
| **T9** | SDD-09 / AC-19, AC-20 | Measure post-cleanup `excessLines`; wire the ceiling into `skills-duplication-metric.test.ts` and assert orphans still 0. Full `test:scripts` + `test:plugins`. | Mutation: paste a 10-line block into a second file → ceiling red. |
| **T10** | D7 | Regenerate all four plugin bundles; `generate-skill-artifacts.ts --check` and `generate-subagent-artifacts.ts --check` both report No drift. | `skill-artifact-parity.test.ts`, `subagent-parity.test.ts`. |
| **T11** | — | `CHANGELOG.md` `[Unreleased]` entry. CI merge-gate requires it. Heading choice per `CONTRIBUTING.md` § CHANGELOG authoring — read it; do not guess the bump. | CI CHANGELOG gate. |
| **T12** | — | Independent `massa-ai-verification-agent` (author ≠ verifier), writes `validation.md`. | The Execute gate itself. |

## Ordering

T1 first: it is the instrument every later task is measured by, and Phase-0 precedent
(`core-layering-god-module-split`) is that the measurement lands before the change it
measures. T2-T5 are independent defect fixes, any order. T6-T8 are the dedup proper and
must follow T1. T9 depends on T6-T8 being complete or the ceiling is measured against a
half-done tree. T10 after every `skills/` edit. T12 last, always.

## Amendments

**A0 — the Plan Challenge gate ran concurrently with Execute, not before it.**
The workflow requires the full gate to complete before Execute. It did not: the
`massa-ai-plan-critic` dispatch and T2–T5 overlapped, and the critic reports
reading files that changed between two of its own tool calls. Its evidence
grades are therefore taken against a moving tree. This is a process defect, not
a finding about the work, and it is recorded rather than quietly corrected —
every amendment below exists because the critique arrived after the commit it
should have preceded. T6–T8 have not started and do receive the gate's output
before execution.

**A1 — T5's real scope was four files, not one.** The task said "correct
`CLAUDE.md`'s 15 to 17". Scanning first, rather than fixing the known site,
found three more current-tense claims: `.claude-plugin/marketplace.json` (12, in
the shipped Claude marketplace description), `docs/ONBOARDING.md` (16), and
`FEATURES.md` (12, while enumerating 12 of the 17 names — so the enumeration was
corrected too, not just the digit). All four are fixed.

**A2 — T5 needed a historical allowlist the task did not anticipate.** Four
tracked files legitimately narrate past roster sizes. A blanket "any count ≠ 17"
regex breaks all of them, and a line-crossing pattern additionally pairs
`command_count=0` with a distant "specialist". Both were found by running the
naive form. The guard is line-scoped with an explicit `HISTORICAL` allowlist.

**A3 — the old roster guard could not see the defect it was written for.**
`docs/ONBOARDING.md` read "16 sub-agent specialists" while the guard banned
`16 subagent`, `16 [Ss]pecialist`, and `16 reusable sub-agent`. The hyphen
defeated all three. Verified empirically before and after.

**A4 — SDD-01's "never assigned" is wrong for `meta-judge`.** Raised by the plan
critic, verified against `skills/model-profiles.json`: `kimi-k3` is the `deep`
model under `heavy`, `home`, `open_models`, and `local_models` — four of seven
profiles. Only `judge`'s hint is unassignable under any profile. The accurate
diagnosis is **profile-ambiguous**, and it is worse than plainly stale: the
column named a model without naming a profile or host, so it reads as correct to
anyone running `heavy` and is wrong under the shipped default. The fix (delete
the column) is unchanged; `spec.md` SDD-01's table wording is corrected.

**A5 — the file count is 151, not 152.** `find skills -type f` counts
`.DS_Store`. By type: 148 `.md`, 2 `.json`, 1 `.py`. Corrected in `spec.md` §1.
`skills-reference-graph.ts` reported 151 all along; the prose disagreed with the
instrument and the instrument was right.

**A6 — T7's P5 is withdrawn as specified and must be re-scoped before T7 runs.**
The plan critic found that `SKILL.md`'s 11-item retrieval procedure and
`mcp-tools.md`'s Retrieval Order are paraphrase-duplicates across items 1–6 and
11; only 7–10 are byte-identical, which is precisely why the window=4 metric saw
those four and nothing else. Extracting only the shingle-visible four would
split one numbered list across two files, leave the larger paraphrased duplicate
in place, and renumber the remainder — optimizing for what the instrument can
see rather than for the defect. **This is the metric's blind spot appearing
inside this feature's own plan.** T7 either extracts the whole list or drops P5
with a stated reason; it does not extract four of eleven.

**A7 — `excessLines` overstates the net saving.** It is the removable figure
before pointer and load-line text is added back. Post-cleanup net reduction will
be below the 313 headline. The ceiling gate is unaffected — it measures the tree
as it ends up — but the narrative should not promise 313 fewer lines.

**A8 — T1 corrected two defects in its own instruments.** Recorded in `spec.md`
§7 rather than here, since they are corrections to claims, not to tasks.
