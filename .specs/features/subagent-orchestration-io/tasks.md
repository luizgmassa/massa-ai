# Sub-Agent Orchestration I/O Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path.

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/subagent-orchestration-io/design.md`
**Status**: Approved (autonomous session — recorded assumption; user absent)

---

## Project Testing Guidelines Scan

Guidelines found: `CLAUDE.md` (root — test runner topology, oxlint gate, generator
`--check` discipline, `test:scripts` covers `scripts/__tests__`), `CONTRIBUTING.md`
(7-step managed-harness protocol, measurement discipline), `bunfig.toml` (5 s per-test
timeout), precedent parity suites `scripts/__tests__/skill-artifact-parity.test.ts`
and `scripts/__tests__/subagent-parity.test.ts`. Doc-contract changes in `skills/`
are gated by literal grep sensors + `generate-skill-artifacts.ts --check` (WFP
precedent, tasks committed with sensor populations printed in commit bodies).

## Test Coverage Matrix

> Generated from codebase + guidelines above — confirm before Execute. (Autonomous
> session: confirmed by recorded assumption.)

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Skill contract markdown (`skills/massa-ai/**`, `skills/AGENTS.md`) | none — deterministic sensors | Every ORC AC has a literal grep sensor with expected count; bundles regenerate drift-free | n/a (markdown) | sensor commands per task + `bun scripts/generate-skill-artifacts.ts --check` |
| Parity sensor script | unit (the sensor IS the test) | Extracts both field lists, ordered equality, prints populations, hard-fails on empty extraction; observed red before first green | `scripts/__tests__/*.test.ts` | `bun test scripts/__tests__/capability-packet-parity.test.ts` |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After each markdown-contract task | task's grep sensors + `bun scripts/generate-skill-artifacts.ts --check` |
| Full | After TASK-004 (sensor) and close-out | Quick + `bun test scripts/__tests__/capability-packet-parity.test.ts scripts/__tests__/skill-artifact-parity.test.ts` |
| Build | Phase completion / close-out | Full + `bun run lint` + dispatch-block census (`grep -rc '\*\*Dispatch:' skills/massa-ai/` ≥27; 9 per-field counts each equal block count) |

## MCP And Skill Question

massa-ai MCP server unreachable this session (recorded at startup). Tools per task:
Read/Edit/Write + Bash sensors + repo generators. Skills: `massa-ai` (active). No
other MCP materially changes implementation or verification — recorded as the
selected answer (user absent).

---

## Execution Plan

### Phase 1: Canonical contracts (4 Tasks)

T1 → T2 → T3 → T4

### Phase 2: Consumers + close-out (4 Tasks)

T5 → T6 → T7 → T8

Sizing: `2 Phases = 8 Tasks` (Phase 1 = 4 Tasks, Phase 2 = 4 Tasks).

---

## Task Breakdown

### T1: Rewrite agent-orchestration.md — working-memory rules + canonical packet

**Task ID**: TASK-001

**What**: Add Orchestrator Working Memory section (polling/transcript ban, wave cap 4,
consolidation signal, git safety), rewrite §Capability Packet to backticked canonical
field list with `lens` + `next_use` + non-inheritance preamble, add ≤40-line output
bound + dual-channel rule to §Output Contract, document the 9-field block projection.
**Where**: `skills/massa-ai/references/agent-orchestration.md`
**Depends on**: None
**Reuses**: Existing section structure; D1/D2 text from design.md
**Requirement**: ORC-01, ORC-02, ORC-03, ORC-04, ORC-05, ORC-07 (canonical halves)

**Tools**: MCP: NONE · Skill: massa-ai

**Done when**:

- [ ] Sensors (all exact-count): `grep -c 'never poll a running subagent' <file>` = 1; `grep -c 'transcript' <file>` ≥ 2; `grep -c 'at most 4 concurrent' <file>` = 1; `grep -c 'consolidation signal' <file>` ≥ 1; `grep -c 'git stash' <file>` = 1; `grep -c 'inherits nothing' <file>` = 1; `grep -c '40 lines' <file>` = 1; `grep -Ec '^- \`(role|purpose|trigger|scope|permissions|inputs|sensors|output|firewall|memory|persona|next_use|lens)\`:' <file>` = 13
- [ ] `grep -rc '\*\*Dispatch:' skills/massa-ai/` still 24 (blocks untouched)
- [ ] Counted rename sensor (Plan Challenge F1): `grep -rc 'exact next step: what the main agent' skills/` goes 1 → 0 (the single input-side packet bullet, renamed `next_use`). The output contract's `Exact next step` **return** field is a different concept and is exempt as a class (measured 251 repo-wide `exact next step` occurrences incl. charters + generated bundles — all output-side or prose; population printed in commit body)
- [ ] `bun scripts/generate-skill-artifacts.ts --check` green (regen same commit)

**Tests**: none (matrix: sensors)
**Gate**: quick
**Commit**: `feat(skills): orchestrator working-memory rules + canonical capability packet (ORC-01..05,07)`

---

### T2: context-firewall.md — subagent transcript ingestion ban

**Task ID**: TASK-002

**What**: Add subagent transcripts/JSONL to §Thresholds raw-artifact list; add
no-polling/no-transcript sentence + canonical link to §Subagent Firewall.
**Where**: `skills/massa-ai/references/context-firewall.md`
**Depends on**: T1 (links to canonical section name)
**Reuses**: Existing threshold list shape
**Requirement**: ORC-01

**Tools**: MCP: NONE · Skill: massa-ai

**Done when**:

- [ ] `grep -c 'subagent transcript' <file>` ≥ 2; `grep -c 'agent-orchestration.md' <file>` ≥ 2
- [ ] `bun scripts/generate-skill-artifacts.ts --check` green (regen same commit)

**Tests**: none
**Gate**: quick
**Commit**: `feat(skills): context-firewall bans subagent transcript ingestion (ORC-01)`

---

### T3: subagent-design.md — defer packet to canonical

**Task ID**: TASK-003

**What**: Replace the 11-bullet §Capability Packet restatement with a deferral link to
`references/agent-orchestration.md` plus the design-time-only guidance that stays.
**Where**: `skills/massa-ai/references/subagent-design.md`
**Depends on**: T1
**Reuses**: Existing deferral idiom ("the roster lives in one place" pattern from agent-orchestration.md)
**Requirement**: ORC-06

**Tools**: MCP: NONE · Skill: massa-ai

**Done when**:

- [ ] `grep -Ec '^- \`(role|purpose|trigger|scope)\`:' <file>` = 0 (old list gone)
- [ ] `grep -c 'agent-orchestration.md' <file>` ≥ 3 (deferral present)
- [ ] `bun scripts/generate-skill-artifacts.ts --check` green (regen same commit)

**Tests**: none
**Gate**: quick
**Commit**: `refactor(skills): subagent-design defers capability packet to canonical (ORC-06)`

---

### T4: skills/AGENTS.md alignment + capability-packet parity sensor

**Task ID**: TASK-004

**What**: Rewrite AGENTS.md packet + output-contract field lists to the identical
backticked shape/order as T1; author
`scripts/__tests__/capability-packet-parity.test.ts` (ordered equality, populations
printed, empty extraction = hard fail); demonstrate observed red via scratch mutation
before green.
**Where**: `skills/AGENTS.md`
**Depends on**: T1
**Reuses**: `scripts/__tests__/skill-artifact-parity.test.ts` test idiom
**Requirement**: ORC-06, ORC-08

**Tools**: MCP: NONE · Skill: massa-ai

**Done when**:

- [ ] Parity test green; observed-red run recorded in commit body (scratch mutation of one field name → fail with diverging names printed)
- [ ] `bun test scripts/__tests__/capability-packet-parity.test.ts` passes
- [ ] `bun scripts/generate-skill-artifacts.ts --check` green; `bun run lint` green (new TS file)

**Tests**: unit (sensor script layer)
**Gate**: full
**Commit**: `feat(skills): align AGENTS.md packet/output contracts + parity sensor (ORC-06,08)`

---

### T5: spec-driven sub-agents.md — worker git safety + packet mapping

**Task ID**: TASK-005

**What**: Declare batch-worker packet a specialization of the canonical packet with
field mapping; add orchestrator never-read-worker-transcript rule; prohibit
repository-wide git ops inside workers; map Verifier inputs to canonical fields.
**Where**: `skills/massa-ai/references/spec-driven/sub-agents.md`
**Depends on**: T1
**Reuses**: Existing worker/Verifier sections
**Requirement**: ORC-01, ORC-04, ORC-06

**Tools**: MCP: NONE · Skill: massa-ai

**Done when**:

- [ ] `grep -c 'specialization of the' <file>` ≥ 2; `grep -c 'never read' <file>` ≥ 1; `grep -c 'repository-wide git' <file>` ≥ 1
- [ ] Existing Verifier scratch-worktree sensor text unchanged (`grep -c 'never \`git stash\`' <file>` unchanged from baseline)
- [ ] `bun scripts/generate-skill-artifacts.ts --check` green (regen same commit)

**Tests**: none
**Gate**: quick
**Commit**: `feat(skills): batch-worker git safety + canonical packet mapping (ORC-01,04,06)`

---

### T6: judge-with-debate.md — standard dispatch blocks

**Task ID**: TASK-006

**What**: Add 9-field dispatch blocks for `massa-ai-meta-judge` and `massa-ai-judge`
(panel-of-3 within wave cap noted), declare judge packet a canonical specialization;
protocol prose unchanged.
**Where**: `skills/massa-ai/workflows/judge-with-debate.md`
**Depends on**: T1
**Reuses**: Dispatch-block shape from `workflows/spec-driven.md:104`
**Requirement**: ORC-09, ORC-06

**Tools**: MCP: NONE · Skill: massa-ai

**Done when**:

- [ ] `grep -c 'Dispatch:' <file>` = 2; 9 per-field greps = 2 each
- [ ] `grep -c 'exceed 3 debate rounds' <file>` = 1 (protocol prose intact)
- [ ] `bun scripts/generate-skill-artifacts.ts --check` green (regen same commit)

**Tests**: none
**Gate**: quick
**Commit**: `feat(skills): standard dispatch blocks for judge-with-debate (ORC-09)`

---

### T7: furps-refinement.md — dispatch block + wave rule

**Task ID**: TASK-007

**What**: Add 9-field dispatch block for `massa-ai-furps-analyst`; replace "batch if a
concurrency cap applies" with waves of ≤4 concurrent analysts (order-independent);
declare packet a canonical specialization.
**Where**: `skills/massa-ai/workflows/refinement/furps-refinement.md`
**Depends on**: T1
**Reuses**: Dispatch-block shape
**Requirement**: ORC-02, ORC-09, ORC-06

**Tools**: MCP: NONE · Skill: massa-ai

**Done when**:

- [ ] `grep -c 'Dispatch:' <file>` = 1; 9 per-field greps = 1 each
- [ ] `grep -c 'waves of at most 4' <file>` = 1; `grep -c 'batch if a concurrency cap applies' <file>` = 0
- [ ] `bun scripts/generate-skill-artifacts.ts --check` green (regen same commit)

**Tests**: none
**Gate**: quick
**Commit**: `feat(skills): furps fan-out wave cap + dispatch block (ORC-02,09)`

---

### T8: Close-out — census, CHANGELOG, .specs state

**Task ID**: TASK-008

**What**: Run full dispatch census (≥27 blocks, 9 field counts equal), add CHANGELOG
`[Unreleased]` entry, update `.specs/project/STATE.md` (new Current section; correct
stale workflow-policy-updates section to merged/v1.23.0), `.specs/HANDOFF.md`,
`.specs/project/FEATURES.json` registry entry; commit `.specs/` artifacts.
**Where**: `CHANGELOG.md` (+ `.specs/` state files — state layer, not code)
**Depends on**: T1–T7
**Reuses**: STATE section shape from prior features
**Requirement**: ORC-09 (census evidence); delivery contract
**Tools**: MCP: NONE · Skill: massa-ai

**Done when**:

- [ ] Census printed: total blocks ≥27, every one of 9 field greps equals block count
- [ ] `bun test scripts/__tests__/capability-packet-parity.test.ts scripts/__tests__/skill-artifact-parity.test.ts` green; `bun run lint` green
- [ ] CHANGELOG entry under `[Unreleased]` (### Added)
- [ ] STATE/HANDOFF/FEATURES.json updated and committed
- [ ] Plan Challenge F2: dispatch `massa-ai-verification-agent` (author ≠ verifier) after this commit per the spec-driven dispatch block; flip spec.md traceability rows Pending → Verified per its per-AC evidence; `validation.md` written by the verifier

**Tests**: none
**Gate**: build
**Commit**: `docs(specs): subagent-orchestration-io close-out + CHANGELOG`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4
Phase 2:  T5 ──→ T6 ──→ T7 ──→ T8
```

Execution is strictly sequential — no intra-phase parallelism. Feature has more than
3 Tasks → the batch-worker offer applies; autonomous session (user absent, cannot
confirm) → execute inline in the main agent, deviation recorded (precedent:
`workflow-policy-updates`).

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 file (largest single-file rewrite) | ✅ Granular — **accepted risk (Plan Challenge F4)**: this file is the contract every dispatch in the repo depends on; blast radius mitigated by the 24-block census sensor staying at baseline and per-field greps |
| T2 | 1 file, 2 small sections | ✅ Granular |
| T3 | 1 file, 1 section replacement | ✅ Granular |
| T4 | 1 contract file + its co-located sensor test | ✅ Granular (test co-location rule) |
| T5 | 1 file, 3 rule insertions | ✅ Granular |
| T6 | 1 file, 2 blocks | ✅ Granular |
| T7 | 1 file, 1 block + 1 rule swap | ✅ Granular |
| T8 | state layer close-out | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | phase start | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T1 | T2→T3 (sequential within phase; T1 backward) | ✅ Match |
| T4 | T1 | T3→T4 (sequential; T1 backward) | ✅ Match |
| T5 | T1 | Phase 1→Phase 2 start | ✅ Match |
| T6 | T1 | T5→T6 (sequential; T1 backward) | ✅ Match |
| T7 | T1 | T6→T7 (sequential; T1 backward) | ✅ Match |
| T8 | T1–T7 | phase tail | ✅ Match |

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | skill contract markdown | none (sensors) | none + sensors | ✅ OK |
| T2 | skill contract markdown | none (sensors) | none + sensors | ✅ OK |
| T3 | skill contract markdown | none (sensors) | none + sensors | ✅ OK |
| T4 | contract + parity sensor script | unit | unit (sensor authored in-task, red→green) | ✅ OK |
| T5 | skill contract markdown | none (sensors) | none + sensors | ✅ OK |
| T6 | skill contract markdown | none (sensors) | none + sensors | ✅ OK |
| T7 | skill contract markdown | none (sensors) | none + sensors | ✅ OK |
| T8 | state layer | none (build gate) | none + build gate | ✅ OK |
