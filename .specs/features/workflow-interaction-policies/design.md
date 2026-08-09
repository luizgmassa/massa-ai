# Workflow Interaction Policies — Design

- **Slug**: `workflow-interaction-policies` · session `spec-workflow-interaction-policies`
- **Spec**: `.specs/features/workflow-interaction-policies/spec.md` (WF-01..WF-16)

## Design Summary

Three policy changes land as coordinated text edits across the massa-ai skill sources,
with `references/spec-driven/sub-agents.md` staying the canonical packing model and
`references/implementation-delivery.md` becoming the canonical pre-implementation summary
contract. No code changes — the deterministic surface is the generated-bundle pipeline
(`bun run generate:artifacts`) plus parity suites, and scripted grep sensors for text
invariants. Mirrors are updated in place with minimal diffs; the in-progress
`skills-directive-dedup` feature owns any deeper single-sourcing.

**New packing model (canonical text, sub-agents.md):** budget is **max 3 tasks per
worker, ideal 2**, whole phases only, cuts on phase boundaries only. Phases are sized to
the budget at Tasks time (max 3 tasks per phase, ideal 2), so packing degenerates to
one-or-two phases per worker naturally. The offer trigger is unchanged (>3 total tasks);
under the new budget a triggered feature always packs into **at least two workers**, so
every "single batch is still offered" clause is replaced, the `ceil(T / 7)` formula
becomes a budget-3 greedy bound, the worked example becomes `20 tasks → ~7–10 workers`,
and the unmeasured "benchmarked sweet spot" claim is removed rather than restated.

**New summary stage (canonical text, implementation-delivery.md):** chain gains
`1.5 — Summarize` between Isolate and Implement. Before the first implementation
mutation, present one task-separated list of the planned changes — `- T01` items with
`--` sub-items, medium-length phrases, clear/direct/objective — derived from approved
spec/design/tasks artifacts when they exist, otherwise from the plan/conversation's
logical work items. The summary rides the existing pre-implementation pause (the Stage 3
delivery-authorization ask; in spec-driven, the same message as the sub-agent offer) — no
new standalone gate. Applies to Quick mode (single-item summary valid).

**Question policy:** numeric caps deleted (`≤2 independent questions per turn` in
discuss.md, `at most three related questions per turn` in tdd discovery); replaced with
no-cap guidance that keeps dependency-ordered pacing and the facts-vs-decisions split.
Stance: ask-first for important or uncertain decisions; genuinely trivial, safe details
may be assumed and recorded. The Requirement Closure Gate's assumption-without-asking
path is restricted to trivial/safe or explicitly user-deferred questions.

## Tech Decisions

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Canonical packing site | `references/spec-driven/sub-agents.md`; mirrors updated in place (tasks.md 149/357/362, execute.md 14/34/38, workflows/spec-driven.md 53/111) |
| D2 | Budget wording | "max 3 tasks per worker, ideal 2"; formula `ceil(T / 3)` as lower bound, `~T / 2` typical; example `20 tasks → ~7–10 workers` |
| D3 | Dead "single batch" clauses | Replaced with "a triggered (>3-task) feature always packs into at least two workers"; offer still presented before Execute |
| D4 | Phase granularity rule | tasks.md: phases sized max 3 tasks (ideal 2); a >3-task phase at Execute packing is a Tasks defect → route back to Tasks split guidance (execute.md safety valve) |
| D5 | Benchmark claim | Removed, not re-derived — new cap is an operator directive, not a measurement (measurement discipline) |
| D6 | Summary stage number | `1.5 — Summarize` chain row + `### Stage 1.5` section with the operator's T01/T02 example verbatim-shaped |
| D7 | Summary presentation moment | Rides the existing pre-implementation authorization ask; spec-driven: same message as the sub-agent offer (execute.md hook) |
| D8 | Question-cap removals | discuss.md Tips line rewritten; tdd discovery Clarification Policy bullet rewritten; specify.md §1 gains no-limit note; §4 item 4 gains trivial/deferred qualifier; workflows/design.md "Ask only when" → "Ask whenever … remain in doubt" |
| D9 | Version bumps | `workflows/spec-driven.md` and `workflows/design.md` 1.3.0 → 1.4.0, `workflows/tdd.md` 1.1.0 → 1.2.0; references carry no frontmatter |
| D10 | Verification | Scripted grep sensors (old literals absent, new literals present), `generate:artifacts` + `--check`, skill-artifact-parity, subagent-parity, skills-harness-integrity, validate_spec/design/tasks, check_specs_delivered |
| D11 | Worktree provisioning | `bun install` in the worktree before gates; parity/generator suites need no native tree-sitter, so no addon copy unless a gate proves otherwise |
| D12 | Coarse-phase caveat (post-critique) | The `~1.5× budget / ~10+ tasks` caveat and the "tight dependency chain cannot be split" exception are deleted from sub-agents.md AND tasks.md — superseded by the hard ≤3 rule + unconditional Execute safety valve (user rejected the soft-cap option); sensors extended with `1.5×`, `10+ tasks`, `tight dependency chain` |
| D13 | Stage 1.5 self-sufficiency (post-critique) | Stage text attaches the summary to the Stage 3 authorization ask defined in implementation-delivery.md itself; six workflows without their own authorization sentence (debug, design, maestro, maestro-fix, tests-fix, implementation-fix) audited in T5, anchor lines added only on contradiction |
| D14 | Phase-size enforcement (post-critique, user choice) | `validate_tasks.ts` reports ERROR for any phase >3 tasks; red test on a 4-task-phase fixture, green on this feature's tasks.md; golden entries the check fires on re-recorded deliberately and named in the PR |

## Risks & Concerns

| Concern | Impact | Mitigation |
| --- | --- | --- |
| A missed mirror of the old budget survives (16th site) | Contradictory packing contract ships | Grep sensor over `skills/` for `~7`, `7-task`, `7 tasks`, `4–8`, `4-8`, `20 tasks → 3`, `ceil(T / 7)` must return zero packing hits; verifier re-runs it independently |
| Parity/integrity tests pin old literals | Red CI after edit | Pre-commit run of subagent-parity, skill-artifact-parity, skills-harness-integrity in the worktree; only `subagent-parity.test.ts` references `sub-agents.md` by name — verify it checks structure, not content literals, before relying on green |
| Regenerated bundles drift from sources | `generate:artifacts --check` fails in CI | Run generator + `--check` in the worktree after every skill edit batch, before commit |
| Summary stage adds a second user prompt in workflows that already pause | Prompt fatigue, contract noise | D7: summary attaches to the existing authorization moment; stage text says explicitly it is not a new standalone gate |
| RTK hook rewrites grep evidence | Wrong counts quoted as proof | All cited sensors run via `rtk proxy` or scripted `bun`/`sed` invocations |
| Fresh worktree unprovisioned (no node_modules) | Gates fail as environment failures | `bun install` before first gate; report environment vs code failures distinctly |
| New validator error changes recorded golden output | `pyts-golden.test.ts` red on validate_tasks entries | Inspect golden fixtures' phase sizes in T9; re-record only entries the new check legitimately fires on, name each in the PR description |
| A packing clause outside the enumerated lines survives (the caveat class) | Contradictory prose ships silently | T1/T2 scopes widened to the whole packing blocks (sub-agents.md 14–45, tasks.md 149–156), not line lists; caveat-literal sensors added to T8's repo-wide sweep |
