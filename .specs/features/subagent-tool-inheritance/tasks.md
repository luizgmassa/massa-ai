# Sub-agent Tool Inheritance Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/subagent-tool-inheritance/design.md`
**Status**: Approved

`CONTRIBUTING.md`'s 7-step managed-harness protocol applies to every task here — every task touches skills, agents, or generated plugin artifacts.

---

## Project Testing Guidelines Scan

Sources inspected in this session, with what each contributed.

| Source | Contribution |
| --- | --- |
| `CLAUDE.md` § Running tests | The isolation runner, the 5 s `bunfig.toml` per-test timeout, and the rule that `bun run test` does not reach `scripts/` — `bun run test:scripts` does. |
| `CLAUDE.md` § CI gates | The `build` job runs `lint`, `test:scripts`, `test:plugins`; the CHANGELOG merge gate blocks a PR that does not touch `CHANGELOG.md`. |
| `CONTRIBUTING.md` | The mandatory 7-step managed-harness protocol for any change to skills, workflows, agents, or plugins, and the Measurement discipline section. |
| `package.json` scripts | Verified command names rather than assuming them: `lint` is bare `oxlint`; `test:scripts` is `bun test scripts/__tests__ scripts/tests/*.test.ts` plus 21 shell suites; `pretest:scripts` runs `bun run generate:artifacts` first. |
| `.github/workflows/ci.yml:228-238` | **CI does not run `bun run generate:artifacts --check`.** It runs the plain generator at `:135`, and `bun scripts/generate-skill-artifacts.ts --check` at `:238`. Subagent-artifact drift is checked *inside* `scripts/__tests__/subagent-parity.test.ts`, per that step's own comment. The gate commands below name what actually exists. |
| `.oxlintrc.json` | `correctness` at `error`, everything else off. An unused export after `toolsFor` is deleted would be a real CI failure, not a style note. |
| `.github/workflows/coverage.yml` | 90%-per-file floor via `bun scripts/check-coverage.ts`. Its scope is the packages' isolated-runner groups, not `scripts/`, so no coverage-floor row applies to this feature's files. |

**Known trap applied to every generate command below:** plain `generate:artifacts` reads the developer's local profile overlay, while `--check` is builtin-only. Any run whose output is quoted as evidence uses a scratch `XDG_CONFIG_HOME`; this machine has profile `balanced` recorded in `install-state.json`, which would otherwise contaminate a cited byte-diff.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `CLAUDE.md`, `CONTRIBUTING.md`, `package.json`, `.oxlintrc.json`, `.github/workflows/ci.yml`, `.github/workflows/coverage.yml`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Generator module (`scripts/*.ts`) | unit | All branches of the new policy function; 1:1 to STI-01 ACs; the unrecognized-permission edge case has its own test | `scripts/__tests__/*.test.ts` | `bun run test:scripts` |
| Generated host artifacts (`apps/*-plugin/agents/`, `agent-profiles/`) | unit (artifact assertion) | Every one of the 18 agents asserted per host, not a sample; both the active set and every profile variant | `scripts/__tests__/subagent-parity.test.ts` | `bun run test:scripts` |
| Charter + reference markdown (`skills/`) | unit (contract sensor) | The whole prohibition class swept by pattern, not by literal phrase; retained-clause count asserted as 18 | `scripts/__tests__/*.test.ts` | `bun run test:scripts` |
| Capability table (`scripts/lib/host-capabilities.ts`) | unit | New field present for all 4 hosts; exercised by the existing fixture-host discrimination test | `scripts/__tests__/*.test.ts` | `bun run test:scripts` |
| Documentation (`CLAUDE.md`, `CHANGELOG.md`) | none | Build gate only — existing stale-pointer and doc-path sensors | — | build gate only |
| Live host behavior (MCP reachability) | none (not CI-reachable) | Recorded in `validation.md` as a measurement or a skipped sensor with its reason | — | manual dispatch |

## Gate Check Commands

> Generated from codebase — confirm before Execute. Every command below was read out of `package.json` or `ci.yml`, not assumed.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After a task touching one test file or one generator module | `bun test scripts/__tests__/<file>.test.ts` |
| Full | After a task changing charters, references, or emitted artifacts | `bun run test:scripts` |
| Build | After phase completion, and before Propose | `bun run lint && bun run type-check && XDG_CONFIG_HOME=$(mktemp -d) bun scripts/generate-subagent-artifacts.ts --check && bun run test:scripts && bun run test:plugins` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Claude tool policy

The defect itself. Must land before Phase 2, or the bundles would tell agents they may nest while `Agent` is still allowlisted away.

T1 → T2

### Phase 2: Nesting policy retirement

T3 → T4

### Phase 3: Dispatch announcement

T5 → T6

### Phase 4: Capability record and documentation

T7 → T8

### Phase 5: Close-out

T9

---

## Task Breakdown

### T1: Replace the Claude tools allowlist with a per-charter tool policy

**Task ID**: TASK-001

**What**: Replace `toolsFor` with `claudeToolPolicyFor` returning `allowlist | denylist | inherit`, and make `emitClaude` render the matching key.
**Where**: `scripts/generate-subagent-artifacts.ts`
**Depends on**: None
**Reuses**: `AGENT_TOOLS_OVERRIDE` and `WRITE_AGENTS`, both unchanged
**Requirement**: STI-01, STI-02
**Scope**: the policy function, the `READ_ONLY_DISALLOWED` constant, `emitClaude`'s key emission, and deletion of `READ_ONLY_TOOLS` / `WRITE_TOOLS` / `toolsFor`.
**Non-goals**: `emitCursor`, `emitCodex`, `emitOpenCode`, and `AGENT_TOOLS_OVERRIDE`'s contents.

**Tools**:

- MCP: NONE — a local single-file edit; no index or memory lookup changes correctness here
- Skill: `massa-ai`

**Done when**:

- [ ] `claudeToolPolicyFor` returns `allowlist` for an `AGENT_TOOLS_OVERRIDE` member, `inherit` for a `WRITE_AGENTS` member, `denylist` otherwise
- [ ] `emitClaude` emits `disallowedTools: Write, Edit, NotebookEdit` for the denylist branch, `tools: [...]` for the allowlist branch, and neither key for `inherit`
- [ ] The gating key stays in the slot `tools` occupied, keeping key order `name, description, <gate>, model, effort`
- [ ] `READ_ONLY_TOOLS`, `WRITE_TOOLS`, and `toolsFor` are deleted and `bun run lint` reports 0 errors
- [ ] Sensors S1 and S2 exist in `scripts/__tests__/generate-subagent-artifacts.test.ts`, including the unrecognized-permission edge case
- [ ] S1 and S2 each observed RED against a deliberate mutation, with the failure recorded before the fix is restored
- [ ] Gate check passes: `bun test scripts/__tests__/generate-subagent-artifacts.test.ts`
- [ ] Test count recorded before and after (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `fix(agents): inherit session MCP tools in Claude sub-agents`

---

### T2: Assert the emitted artifacts and guard every host against MCP-blocking constructs

**Task ID**: TASK-002

**What**: Rewrite the CLA-02/03 group to the new contract and add a per-host sensor that fails on any MCP-blocking construct.
**Where**: `scripts/__tests__/subagent-parity.test.ts`
**Depends on**: T1
**Reuses**: the existing `ALLOWED_KEYS` per-host schemas and `readAgentMd` helper
**Requirement**: STI-01, STI-02, STI-03
**Scope**: the CLA-02/03 describe block and one new describe block.
**Non-goals**: the Codex/Cursor/OpenCode model-pin groups.

**Tools**:

- MCP: NONE
- Skill: `massa-ai`

**Done when**:

- [ ] The rewritten group asserts, for all 18 agents and every profile variant, that only `navigator` carries `tools:`, that read-only agents carry the exact `disallowedTools` line, and that write agents carry neither key
- [ ] The assertions test presence of the expected line, not only absence of substrings — the pre-change test passed vacuously for read-only agents once `tools` was gone, and that failure mode must not survive the rewrite
- [ ] `massa-ai-navigator.md` is asserted byte-identical to its recorded pre-change frontmatter
- [ ] A new group fails when any host emits an MCP-blocking construct, naming the host and the construct
- [ ] S3 and S4 each observed RED against a deliberate mutation (S3: add `investigator` to `AGENT_TOOLS_OVERRIDE`; S4: add `"mcp__*": "deny"` to the OpenCode permission block)
- [ ] Gate check passes: `bun test scripts/__tests__/subagent-parity.test.ts`
- [ ] Test count recorded before and after (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `test(agents): assert MCP inheritance and per-host non-regression`

---

### T3: Retire the spawn prohibition from the 18 charters

**Task ID**: TASK-003

**What**: Remove the `Never spawn subagents, ` direction from each charter's Restrictions clause, keeping the router/persona sentence.
**Where**: `skills/agents/`
**Depends on**: T2
**Reuses**: the identical clause text shared by all 18 charters
**Requirement**: STI-04
**Scope**: exactly one line per charter, 18 lines.
**Non-goals**: any other charter content; the reference files (T4).

**Tools**:

- MCP: NONE
- Skill: `massa-ai`

**Done when**:

- [ ] All 18 charters retain `never load the massa-ai or persona-router routers, and never open a personas/ prompt file; the dispatching workflow owns routing and persona selection`, recapitalized as a sentence
- [ ] A repository sweep for the spawn prohibition over `skills/agents/` returns 0; a sweep for the retained clause returns exactly 18
- [ ] Sensor S5 exists in `scripts/__tests__/skills-harness-integrity.test.ts` and sweeps the prohibition class by pattern, not by the literal phrase
- [ ] S5 observed RED twice — once by re-adding the phrase to one charter, once by deleting the retained clause from another
- [ ] Gate check passes: `bun run test:scripts`
- [ ] Test count recorded before and after (no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `feat(agents): allow sub-agent nesting in specialist charters`

---

### T4: Retire the nesting prohibition from the 4 reference lines

**Task ID**: TASK-004

**What**: Remove the nesting prohibition from `code-reuse-scan.md:46`, `figma-pre-analysis.md:68`, and `sub-agents.md:70`, and restate `sub-agents.md:87`'s sequential-execution rule without its nesting sentence.
**Where**: `skills/massa-ai/references/`
**Depends on**: T3
**Reuses**: the existing sequential-execution wording, preserved verbatim
**Requirement**: STI-04
**Scope**: 4 lines across 3 files.
**Non-goals**: the batch-worker packing budget, the offer-then-confirm rule, and every other line of those references.

**Tools**:

- MCP: NONE
- Skill: `massa-ai`

**Done when**:

- [ ] `sub-agents.md`'s `**No nesting:**` heading becomes `**Sequential execution:**` and the strictly-sequential sentence survives verbatim — the rule must not be lost with the sentence that carried it
- [ ] `sub-agents.md:70`'s `It does NOT spawn further sub-agents.` is removed and the surrounding paragraph still reads as one sentence sequence
- [ ] A PCRE sweep of the prohibition class over `skills/` returns 0 matches
- [ ] Sensors S6 and S7 exist in `scripts/__tests__/workflow-harness-contract.test.ts`
- [ ] S6 and S7 each observed RED against a deliberate mutation (S6: re-add the sentence to `code-reuse-scan.md`; S7: delete the restated sequential rule)
- [ ] Gate check passes: `bun run test:scripts`
- [ ] Test count recorded before and after (no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `feat(skills): retire the nesting prohibition from shared references`

---

### T5: Add the dispatch announcement contract

**Task ID**: TASK-005

**What**: Add the model/effort announcement rule and the per-host installed-agent path table to the Conversation Feedback section.
**Where**: `skills/massa-ai/references/agent-orchestration.md`
**Depends on**: T4
**Reuses**: the existing `Agent Started` / `Agent Running` / `Agent Done` / `Agent Blocked` label set and its example block
**Requirement**: STI-05
**Scope**: the Conversation Feedback section only.
**Non-goals**: the Capability Packet, the Prompt Contract, and the Plan-Critic Contract sections.

**Tools**:

- MCP: NONE
- Skill: `massa-ai`

**Done when**:

- [ ] The `Agent Started` bullet requires the agent name, model, and effort
- [ ] The rule states the source is the installed agent file for the active host, read once per session for all 18 agents rather than once per dispatch
- [ ] Absent `effort` announces `effort: inherit`; absent or `inherit` `model` announces `model: inherit`
- [ ] An unreadable or missing file announces unknown, names the attempted path, and proceeds — with the worked example being the real one measured on this machine, where `massa-ai-designer.md` is absent from a 1.48.0 bundle
- [ ] The rule states it applies to `plan-critic`, `verification-agent`, `designer`, and spec-driven batch workers with no exemption
- [ ] `references/conversation-feedback.md` points at this section without restating the rule
- [ ] Gate check passes: `bun run test:scripts`

**Tests**: unit
**Gate**: full

**Commit**: `feat(skills): announce sub-agent model and effort at dispatch`

---

### T6: Guard the announcement contract and its path table against drift

**Task ID**: TASK-006

**What**: Add S8 (single canonical announcement shape) and S9 (documented paths equal `resolveHostLayout`'s output).
**Where**: `scripts/__tests__/workflow-harness-contract.test.ts`
**Depends on**: T5
**Reuses**: `resolveHostLayout` from `packages/shared/src/profile-switch/hosts.ts`, executed as the drift oracle
**Requirement**: STI-05
**Scope**: two new test groups.
**Non-goals**: S6 and S7, added by T4 in the same file.

**Tools**:

- MCP: NONE
- Skill: `massa-ai`

**Done when**:

- [ ] S9 calls the real `resolveHostLayout` per host and compares against the paths documented in T5's table — it must execute the resolver, never re-implement it, since re-implementation would pass while both copies drift together
- [ ] S8 fails if a second announcement shape is defined in any workflow dispatch block
- [ ] S8 and S9 each observed RED against a deliberate mutation
- [ ] Gate check passes: `bun test scripts/__tests__/workflow-harness-contract.test.ts`
- [ ] Test count recorded before and after (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `test(skills): guard the dispatch announcement contract`

---

### T7: Record per-host tool gating in the capability table

**Task ID**: TASK-007

**What**: Add a `toolGating` field to `HostCapabilities` with one cited value per host.
**Where**: `scripts/lib/host-capabilities.ts`
**Depends on**: T6
**Reuses**: the existing `HostCapabilities` interface, `deepFreeze`, and `capabilitiesFor`
**Requirement**: STI-15
**Scope**: the interface, the four `RAW_CAPABILITIES` entries, and whatever fixture-host test the new field obliges.
**Non-goals**: making any emitter read the new field — the divergence is one host's, and this table is documentation-bearing.

**Tools**:

- MCP: NONE
- Skill: `massa-ai`

**Done when**:

- [ ] Each of the 4 host entries carries the field with the verbatim documentation citation that established it
- [ ] The field's docblock states why Claude needs a denylist and the other three need nothing
- [ ] The existing fixture-host discrimination test still passes, updated if the new field obliges it
- [ ] Gate check passes: `bun run test:scripts`
- [ ] Test count recorded before and after (no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `docs(agents): record per-host sub-agent tool gating`

---

### T8: Update the contributor documentation and CHANGELOG

**Task ID**: TASK-008

**What**: State the per-host tool-gating contract in the agent-harness section and add the `[Unreleased]` entry.
**Where**: `CLAUDE.md`
**Depends on**: T7
**Reuses**: the existing agent-harness surface section
**Requirement**: STI-15
**Scope**: the agent-harness paragraph in `CLAUDE.md` and one `CHANGELOG.md` entry.
**Non-goals**: restating the tier/profile resolution rules that section already owns.

**Tools**:

- MCP: NONE
- Skill: `massa-ai`

**Done when**:

- [ ] `CLAUDE.md` states that Claude gates by denylist so MCP inherits, that `navigator` is the deliberate allowlist exception, and that the other three hosts inherit with no allowlist to maintain
- [ ] `CHANGELOG.md` carries an `[Unreleased]` entry whose heading selects the intended bump per `CONTRIBUTING.md` § CHANGELOG authoring
- [ ] The skip-ci marker appears nowhere in any commit message or PR body for this branch
- [ ] Gate check passes: `bun run test:scripts`

**Tests**: none
**Gate**: build

**Commit**: `docs: record sub-agent MCP inheritance contract`

---

### T9: Close out the spec artifacts before Propose

**Task ID**: TASK-009

**What**: Commit `STATE.md`, `HANDOFF.md`, and `FEATURES.json` on the branch so the Propose precondition is met.
**Where**: `.specs/project/STATE.md`
**Depends on**: T8
**Reuses**: the existing STATE Current/Previous rotation and the FEATURES registry shape
**Requirement**: STI-14, STI-15
**Scope**: the three `.specs/` state artifacts plus `validation.md` once the verifier writes it.
**Non-goals**: any source change.

**Tools**:

- MCP: NONE
- Skill: `massa-ai`

**Done when**:

- [ ] `STATE.md` rotates Current to Previous first, then prepends the new section — replacing instead of rotating is a recorded past failure
- [ ] `HANDOFF.md` names the worktree, branch, base commit, commit range, and the STI-14 result or its skipped reason
- [ ] `FEATURES.json` gains the `subagent-tool-inheritance` entry with its phase flags
- [ ] `bun skills/massa-ai/scripts/check_specs_delivered.ts subagent-tool-inheritance --root .` exits 0
- [ ] Gate check passes: `bun run lint && bun run type-check && XDG_CONFIG_HOME=$(mktemp -d) bun scripts/generate-subagent-artifacts.ts --check && bun run test:scripts && bun run test:plugins`

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): close out subagent-tool-inheritance`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5 ──→ T6 ──→ T7 ──→ T8 ──→ T9
```

The chain is drawn unbroken because every dependency here is sequential: each
task's `Depends on` is the task immediately before it. The phase boundaries fall
between T2/T3, T4/T5, T6/T7, and T8/T9.

Execution is strictly sequential — there is no intra-phase parallelism.

`5 Phases = 9 Tasks`. Phase sizes: `1 Phase = 2 Tasks` for Phases 1-4, `1 Phase = 1 Task` for Phase 5.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Claude tool policy | 1 module, 3 symbols replaced by 2 | ✅ Granular |
| T2: Artifact + per-host sensors | 1 test file, 2 describe blocks | ✅ Granular |
| T3: 18 charter lines | 1 line per file, one identical mechanical edit | ✅ Granular — cohesive class, not 18 decisions |
| T4: 4 reference lines | 3 files, one prohibition class | ✅ Granular — same class as T3, split from it because the edit differs (one line is a retitle, not a deletion) |
| T5: Announcement contract | 1 reference section | ✅ Granular |
| T6: Announcement sensors | 1 test file, 2 groups | ✅ Granular |
| T7: Capability field | 1 module, 1 field × 4 entries | ✅ Granular |
| T8: Docs + CHANGELOG | 2 doc files, no logic | ✅ Granular |
| T9: Spec close-out | 3 state artifacts, no logic | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (phase entry) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |

No dependency points to a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Generator module | unit | unit | ✅ OK |
| T2 | Generated host artifacts | unit (artifact assertion) | unit | ✅ OK |
| T3 | Charter markdown | unit (contract sensor) | unit | ✅ OK |
| T4 | Reference markdown | unit (contract sensor) | unit | ✅ OK |
| T5 | Reference markdown | unit (contract sensor) | unit | ✅ OK |
| T6 | Generator-adjacent contract sensor | unit | unit | ✅ OK |
| T7 | Capability table | unit | unit | ✅ OK |
| T8 | Documentation | none | none | ✅ OK — matrix says none for this layer |
| T9 | Spec state artifacts | none | none | ✅ OK — matrix says none; the artifact check is `check_specs_delivered.ts` |

No task carries `Tests: none` for a layer the matrix requires tests for.

---

## Requirement Coverage

| Requirement | Tasks |
| --- | --- |
| STI-01 | T1, T2 |
| STI-02 | T1, T2 |
| STI-03 | T2 |
| STI-04 | T3, T4 |
| STI-05 | T5, T6 |
| STI-14 | T9 (recorded), measured during validation |
| STI-15 | T7, T8 |

Every in-scope requirement maps to at least one task.

---

## MCP and Skill Question

Asked and answered for every task: no available MCP server changes correctness or verification for this feature. Every task's evidence is a local file read, a local generator run, or a local test run. The massa-ai index would be a lead requiring confirmation against source anyway, and each task's subject is already located by exact `file:line`. `massa-ai` is the active skill throughout; no other skill applies.
