# Workflow Interaction Policies — Validation Report

- **Verdict**: **PASS**
- **Verifier**: independent verification-agent (author ≠ verifier), session `spec-workflow-interaction-policies`
- **Diff range**: `6c438a98..HEAD` (13 commits, `af1b24d7`..`e5c18736`)
- **Worktree**: `/Users/luizmassa/Projects/massa-ai-wt-workflow-interaction-policies`, branch `spec/workflow-interaction-policies`
- **Pre-check**: `git status --porcelain` empty before and after all mutation sensors (re-verified after each restore)

## Per-AC Evidence Table

| AC (WF-ID) | Evidence | Verdict |
| --- | --- | --- |
| WF-01 packing budget max 3/ideal 2 at 4 sites | `sub-agents.md:14,16,111`; `tasks.md:149,356,361`; `execute.md:14,34,38`; `workflows/spec-driven.md:53,111` all state "max 3 tasks per worker, ideal 2" (or Task-capitalized mirror) | PASS |
| WF-02 phase granularity ≤3/ideal 2, whole-phase invariant unchanged | `tasks.md:149-151` sizes phases to max 3/ideal 2, no exception carve-out; `sub-agents.md:23` "Never split a phase" (whole-phase invariant) unchanged; `tasks.md:156` "No trailing wiring phase" survives verbatim (out of scope, confirmed present) | PASS |
| WF-03 derived prose recomputed, trigger unchanged | `sub-agents.md:14` trigger still ">3 tasks"; `sub-agents.md:26` worked examples recomputed (`ceil(T/3)`, `20 tasks → roughly 7–10 workers`); repo-wide sweep for `~7`/`7-task`/`4–8`/`20 tasks → 3`/`ceil(T / 7)`/`sweet spot` over `skills/` returns only 2 unrelated PR-size "sweet spot" hits (`pr-task-fix.md:17`, `tdd/document-contract.md:44`) — not packing-budget hits | PASS |
| WF-04 over-sized-phase safety valve | `execute.md:38` "If any phase in tasks.md holds more than 3 tasks, that is a wrongly-sized Tasks artifact — stop and split the phase during Tasks" | PASS |
| WF-05 discuss.md cap removed, ask-first stance | `discuss.md:88-91,196` — `≤2 independent`/"Never dump 3+" replaced with no-cap + ask-first-for-important/assume-trivial language | PASS |
| WF-06 tdd caps removed in both files | `references/tdd/discovery-and-sizing.md:71` and `workflows/tdd.md:35` both drop "at most three related questions"; repo-wide sweep for `at most three` over `skills/` returns 0 hits | PASS |
| WF-07 specify.md no-limit note | `specify.md:84-85` "No limit on the number of clarifying questions... ask rather than assume" | PASS |
| WF-08 specify.md Closure Gate qualifier | `specify.md:131` "Recording an assumption without asking is allowed only for genuinely trivial/safe details or questions the user explicitly deferred; important decisions... resolved by asking" | PASS |
| WF-09 design.md ask-limiter rephrased | `workflows/design.md:23` "Ask only when" → "Ask whenever ... remains ambiguous or in doubt after source inspection" | PASS |
| WF-10 implementation-delivery.md Summarize stage | Chain table row `1.5 \| Summarize` (`implementation-delivery.md:23`); `### Stage 1.5` section (`:78-106`) with `- T01`/`--` example block (`:88-98`), self-sufficient anchor language (`:100-104`) | PASS |
| WF-11 execute.md summary hook | `execute.md:38` "The offer message MUST begin with the pre-implementation change summary required by ... Stage 1.5"; `execute.md:24` (Stage 0 fallback) also attaches Stage 1.5 when Tasks is skipped | PASS |
| WF-12 spec-driven.md mirrors + version bump | `workflows/spec-driven.md:53,111` mirrors; `metadata.version: "1.4.0"` present (`:6`), diff confirms `1.3.0 → 1.4.0` | PASS |
| WF-13 artifacts regenerate clean, parity suites green | `XDG_CONFIG_HOME=$(mktemp -d) bun run generate:artifacts --check` → "No drift" exit 0; `subagent-parity` 65/0, `skill-artifact-parity` 23/0, `skills-harness-integrity` 32/0 — all re-run independently, all green | PASS |
| WF-14 CHANGELOG entry | `CHANGELOG.md` `[Unreleased] → ### Changed` has 3 bullets, one per policy (batch cap, question caps, Stage 1.5) | PASS |
| WF-15 caveat deletion + six-workflow pause audit | Repo-wide sweep for `1.5×`/`10+ tasks`/`tight dependency chain` over `skills/` = 0 hits; spot-checked commit `987207fc`'s six recorded "pause-ok" verdicts against the actual files — all six (`debug.md`, `design.md`, `maestro.md`, `maestro-fix.md`, `tests-fix.md`, `implementation-fix.md`) independently confirmed to load `references/implementation-delivery.md` at line 15 and run the Isolation Gate at line 17 before the first repository mutation, matching the recorded verdicts | PASS |
| WF-16 validate_tasks.ts phase-size error | `validate_tasks.ts:339,407-415` adds `MAX_TASKS_PER_PHASE = 3` error check; `spec-driven-validators.test.ts` red case (4-task phase → exit 1, `"Phase 1 has 4 tasks (max 3 per phase, ideal 2)"`) and green case (≤3-task phases) both present and passing; `bun test spec-driven-validators.test.ts` 65/0 (66 cases, 1 pre-existing skip unrelated); `bun test pyts-golden.test.ts` 46/0 — no golden fixture entries fired (all fixture phases ≤3 tasks, confirmed by reading `fixtures/pyts-golden/validate_tasks.json`, 7 cases, no diff needed) | PASS |
| P2-3 version bump per edited workflow file | `workflows/spec-driven.md` 1.3.0→1.4.0, `workflows/design.md` 1.3.0→1.4.0, `workflows/tdd.md` 1.1.0→1.2.0; references carry no frontmatter (unaffected) | PASS |

## Gates Run (independently, in the worktree)

| Command | Exit | Result |
| --- | --- | --- |
| `bun test scripts/__tests__/spec-driven-validators.test.ts` | 0 | 66 pass (65 pre-mutation baseline run; see sensor section for the induced-fail rerun), 0 fail |
| `bun test scripts/__tests__/pyts-golden.test.ts` | 0 | 46 pass, 0 fail |
| `bun test scripts/__tests__/subagent-parity.test.ts` | 0 | 65 pass, 0 fail |
| `bun test scripts/__tests__/skill-artifact-parity.test.ts` | 0 | 23 pass, 0 fail |
| `bun test scripts/__tests__/skills-harness-integrity.test.ts` | 0 | 32 pass, 0 fail |
| `XDG_CONFIG_HOME=$(mktemp -d) bun run generate:artifacts --check` | 0 | "No drift: generated files match checked-in files." |
| `bun skills/massa-ai/scripts/validate_tasks.ts workflow-interaction-policies --root .` | 0 | 0 errors, 5 warnings (all "Where names multiple files" granularity smells on close-out/mirror tasks — expected for T6/T7/T8/T9, non-blocking; diagram-cross-check skip is pre-existing tool behavior) |
| `bun skills/massa-ai/scripts/check_specs_delivered.ts workflow-interaction-policies --root .` | 0 | 0 errors, 6 paths checked |
| `rtk proxy grep -rn "~7\|7-task\|7 task\|4–8\|4-8\|20 tasks → 3\|1.5×\|10+ tasks\|tight dependency chain\|ceil(T / 7)\|sweet spot" skills/` | 0 (matches found) | Only 2 unrelated PR-size hits (`pr-task-fix.md`, `tdd/document-contract.md`) — no packing-budget stragglers |
| `rtk proxy grep -rn "≤2 independent\|at most three\|at most 2\|3+ questions" skills/` | 1 (no matches) | 0 hits — clean |

## Discrimination Sensor Results

Population: 4 mutations targeting the 3 highest-risk delivered mechanisms (validator threshold, packing-budget literal sweep, Stage 1.5 heading, question-cap literal sweep). Restore method: `cp X X.bak` → mutate → run sensor → `mv X.bak X`; `git status --porcelain` confirmed empty after every restore (no `git checkout`/`restore` used).

| # | Mutation | File | Sensor run | Verdict | Restore confirmed |
| --- | --- | --- | --- | --- | --- |
| M1 | `MAX_TASKS_PER_PHASE` threshold 3 → 4 | `skills/massa-ai/scripts/validate_tasks.ts:339` | `bun test scripts/__tests__/spec-driven-validators.test.ts` | **KILLED** — "a phase with 4 tasks in Task Breakdown exits 1..." case failed (`Expected: 1, Received: 0`); 65 pass / 1 fail | Yes — `git status --porcelain` empty, line 339 back to `= 3` |
| M2 | Reintroduce `~7 tasks per worker` claim | `skills/massa-ai/references/spec-driven/sub-agents.md:26` | `rtk proxy grep -rn "7 task\|7-task\|7-Task" skills/` | **KILLED** — sweep produced 1 hit (matched via the "7 task" substring inside "7 tasks per worker") | Yes — `git status --porcelain` empty, sweep re-run returns 0 hits |
| M3 | Delete the `### Stage 1.5` section heading (body/table row left intact) | `skills/massa-ai/references/implementation-delivery.md:78` | Task's own T5 gate: `rtk proxy grep -n "Stage 1.5\|T01" implementation-delivery.md`; also re-ran `skills-harness-integrity.test.ts` (32/0, unaffected) | **SURVIVED** — the chain-table row (`\| 1.5 \| Summarize \|... (see Stage 1.5) \|`) and the `- T01` example body both still contain their literals after the heading alone is deleted, so the T5 gate as specified in `tasks.md` (and the harness-integrity suite) both still report the pattern present; the mutated file's Stage 1.5 *content* (format rule, anchor note, example) becomes silently unlabeled body text folded under the preceding `### Stage 1` heading. **This is a gap in the T5 gate's specificity, not in the delivered file** — the actual committed file has the heading (independently confirmed present before and after the mutation). See Gaps below. | Yes — `git status --porcelain` empty, heading restored and independently reconfirmed present |
| M4 | Re-add a numeric question cap (`ask **at most 2**`) to `discuss.md`, equivalence check | `skills/massa-ai/references/spec-driven/discuss.md:91` | `rtk proxy grep -rn "≤2 independent\|at most three\|at most 2\|3+ questions" skills/` | **KILLED** — sweep caught the reintroduced literal `at most 2` (1 hit) | Yes — `git status --porcelain` empty, sweep re-run returns 0 hits |

Mutation population: 4/4 exercised, 3/4 killed, 1/4 survived (a gate-precision gap, not a delivered-content defect — see Gaps).

## Gaps (ranked)

1. **T5 gate is not heading-specific (low severity, gate-precision gap, not a shipped defect).** `implementation-delivery.md`'s Stage-1.5 section body and the chain-table's "(see Stage 1.5)" reference both contain the literal string "Stage 1.5" independent of whether the `### Stage 1.5` markdown heading itself exists, and the `T01` example literal is likewise independent of the heading. A future accidental deletion of just the section heading (leaving the body text orphaned under the prior `### Stage 1` heading) would pass both the T5 gate command specified in `tasks.md` and `skills-harness-integrity.test.ts` silently. Current delivered state is correct (heading present, independently re-confirmed) — this is a recommendation for a follow-up sensor (e.g. assert the exact heading text `### Stage 1.5 — summarize before you touch the tree` is present, not just substring literals), not a blocker for this feature's PASS verdict.

No other gaps found. All 16 WF-IDs plus the P2-3 version-bump criterion have PASS evidence with file:line citations; the six-workflow pause audit in commit `987207fc` was independently re-verified against source rather than trusted at face value; all 8 required gates exit 0; the repo-wide literal sweeps (packing-budget and question-cap) both come back clean.
