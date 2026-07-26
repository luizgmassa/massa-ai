# Tasks — Persona / Sub-Agent Boundary

Spec: `spec.md` · Design: `design.md`

7 tasks — under the ~8 task-budget batch threshold, so no sub-agent execution offer fires.
One atomic commit per task, after its gate passes.

## Environment baseline (verified before Task 1)

- Worktree `../massa-ai-wt-persona-agent-boundary` off `origin/main` @ `77dd144` (v1.6.0).
- `bun test scripts/__tests__/skills-harness-integrity.test.ts` → **15 pass / 0 fail**, no
  `bun install` needed (suite uses only `bun:test`, node builtins, and `git ls-files`).
- `bun scripts/generate-skill-artifacts.ts --check` → **no drift**.

Both gates are green on an untouched tree, so any red below is caused by this feature, not
by an unprovisioned worktree.

## Order

Tests first (T1), red by construction. Each subsequent content task turns a named subset
green. This yields the mutation evidence PAB-09/AC3 requires as a by-product of the order
itself, rather than as a separate manual mutation pass.

| # | Task | Requirements | Files | Gate |
|---|---|---|---|---|
| T1 | Add the persona/sub-agent boundary `describe` block + header-comment entry 7 | PAB-09 | `scripts/__tests__/skills-harness-integrity.test.ts` | Suite runs; the 9 new cases are **red**, the existing 15 stay **green**. Record the red list — it is the discrimination evidence |
| T2 | Add C1 `persona` packet field to all three packet definitions | PAB-01 | `skills/AGENTS.md`, `skills/massa-ai/references/agent-orchestration.md`, `skills/massa-ai/references/subagent-design.md` | Cases 1–2 go green; charter + router cases stay red |
| T3 | Apply C3 (replace ban) then C2 (add precedence) in all 15 charters, **then regenerate both mirrors** | PAB-02, PAB-06, PAB-08 | `skills/agents/*/SKILL.md` × 15; `apps/*/skills/agents/**`; `apps/*/agents/*.{md,toml}` | Cases 3–5 go green; **both** `--check`s no-drift; `skill-artifact-parity` + `subagent-parity` green |
| T4 | Add C4 section + C5 scoped stop condition, then regenerate the skill bundles | PAB-03, PAB-04, PAB-05, PAB-07, PAB-08 | `skills/persona-router/SKILL.md`; `apps/*/skills/persona-router/**` | Cases 6–9 go green → integrity suite 24/24; `generate-skill-artifacts.ts --check` no drift |
| T5 | Register the two charter lines in § How to Add an Agent | PAB-01 (Step 2) | `skills/AGENTS.md`; `apps/*/skills/**` | Suite stays 24/24; `--check` no drift |
| T6 | Full regeneration reconciliation + aggregate | PAB-08 | (verification only, or residual regen) | `bun run test:scripts` fully green — the first run of the complete aggregate |
| T7 | Add the `[Unreleased]` → `### Changed` entry | PAB-10 | `CHANGELOG.md` | Entry sits under a minor-class heading with bullets; CI merge gate satisfied |

### Why regeneration moved into T3/T4/T5 (Plan Challenge finding 1 — critical)

The original T6 batched all regeneration at the end and named only
`scripts/generate-skill-artifacts.ts`. Two defects, one of them shipping-blocking:

1. **A second generator was missed.** `scripts/generate-subagent-artifacts.ts:287` returns
   `fm + c.body` — the charter body verbatim — into `apps/<host>-plugin/agents/massa-ai-<n>.md`.
   Verified: `grep "Never spawn subagents" apps/claude-plugin/agents/massa-ai-builder.md`
   returns 1. T3 edits that exact line. `subagent-parity.test.ts` runs that generator's
   `--check` as a hard gate and lives under `scripts/__tests__/`, so it is in
   `bun run test:scripts`. Unaddressed, the tree would have gone red only at the pre-PR
   aggregate — after six commits, forcing an amend or an unplanned eighth commit.
2. **Deferred regeneration breaks the plan's own per-task-green property.** Regenerating in
   the same task that edits the source keeps every commit self-consistent, which is what
   "one atomic commit per task" is supposed to mean.

## Test coverage matrix

| Requirement | Covered by | Assertion shape |
|---|---|---|
| PAB-01 | T1 cases 1, 2 | canonical clause present in all 3 packet files; clause appears in exactly those 3 files under `skills/` |
| PAB-02 | T1 case 3 | disk-enumerated charters, **`## Restrictions`-scoped**, all contain the C2 line |
| PAB-03 | T1 case 8 | router states persona may be passed as advisory framing, never authority |
| PAB-04 | T1 cases 6, 7 | scoped form present **and** unscoped fragment absent |
| PAB-05 | T1 case 9 | router states a persona route is not a specialist consultation |
| PAB-06 | T1 cases 4, 5 | disk-enumerated, `## Restrictions`-scoped C3 extended ban present **and** superseded form absent |
| PAB-07 | T1 case 8 | router states persona grants no tool access / write scope / permission |
| PAB-08 | T3, T4, T5 gates + T6 | **both** generators' `--check` exit 0; both parity suites green |
| PAB-09 | T1 red list | the 9 cases observed red before T2–T4 |
| PAB-10 | T7 gate | manual inspection against the CONTRIBUTING heading table |

## Gate check commands

```bash
cd ../massa-ai-wt-persona-agent-boundary

# per-task gate (T1-T5)
bun test scripts/__tests__/skills-harness-integrity.test.ts

# mirror regeneration — BOTH generators, run in the task that edits their source
bun scripts/generate-skill-artifacts.ts
bun scripts/generate-subagent-artifacts.ts          # T3 only (charter bodies)
bun scripts/generate-skill-artifacts.ts --check
bun scripts/generate-subagent-artifacts.ts --check  # T3 only
bun test scripts/__tests__/skill-artifact-parity.test.ts
bun test scripts/__tests__/subagent-parity.test.ts  # T3 only

# T6 / pre-PR aggregate
bun run test:scripts
```

## Plan Challenge record

Full gate, mode `pre_mortem`, dispatched to `massa-ai-plan-critic` (read-only). Verdict:
2 critical, 1 high, 2 medium. Policy `serious_findings: revise_plan` applied — all five
incorporated before Execute began.

| Finding | Severity | Disposition |
|---|---|---|
| 1 — `generate-subagent-artifacts.ts` never run despite T3 editing its source | critical | **Revised.** Independently confirmed at `generate-subagent-artifacts.ts:287`. Regeneration moved into T3/T4/T5; PAB-08 now names both generators |
| 2 — bare persona id is not self-defining; sub-agent could open `personas/<id>.md` | critical | **Revised.** C3 extended with a `personas/` ban; C4 states id-only. New PAB-06/AC4 |
| 3 — presence-only assertions; PAB-02/AC2 not actually enforced | high | **Partly revised.** Section-scoping + absence assertion added for the charter rules (cases 3–5). Remaining presence-only cases recorded as accepted risk with the reason |
| 4 — "no accepted assumptions" contradicted design's own Risks table | medium | **Revised.** Closure reworded to "no open questions", pointing at Risks |
| 5 — release-vs-`no-changelog` never examined | medium | **Revised.** PAB-10/AC2 states why this takes a real release |

## MCP and skill question

No MCP tool choice affects correctness here. The massa-ai MCP server is **not registered in
this session**, so `recall`/`remember` are unavailable; durable-memory synchronization is
recorded as a skipped sensor. It does not gate any requirement — `.specs/` artifacts and
repository source are the canonical inputs for every task above.

## Deviations

None recorded yet.
