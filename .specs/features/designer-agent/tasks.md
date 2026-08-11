# Designer Agent + ADR Plan-Challenge Gate Tasks

**Design**: `.specs/features/designer-agent/design.md`
**Spec**: `.specs/features/designer-agent/spec.md`
**Status**: Approved for Execute (user requested spec-driven delivery of both items)

---

## Project Testing Guidelines Scan

Guidelines found: repo `AGENTS.md` (Tech Stack: `bun test`, `bun run test:scripts`,
`bun run test:plugins`, `bun run type-check`, `bun run lint`); `skills/AGENTS.md` →
*How to Add an Agent* steps 4-5 (generator + parity enforcement are the enforced steps);
`CLAUDE.md` → "Running tests" (isolation runner; `bun run test` does **not** reach
`scripts/`); recorded lesson L-007 — a 15→17 roster change shipped green under
`test:scripts` and went red in CI because the plugin install rosters, shell installer
advisories, config-CLI help, and README/FEATURES copy are covered by `test:plugins`,
which the local final gate did not run. **This feature changes the same shared
cardinality, so `bun run test:plugins` runs before the local final gate, not after CI.**

This is a harness-text feature: the "product code" is Markdown charters, workflow text,
registry tables, and generator name sets. The enforcing suites already exist and are
extended inside the same task as the registration edit (test co-location).

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Charter Markdown | integrity (structural) | Charter sections present, both persona-boundary lines verbatim, `metadata.permission` agrees with the shipped artifact, charter registered in registry + generator | `scripts/__tests__/skills-harness-integrity.test.ts` | `bun run test:scripts` |
| Workflow dispatch text | integrity (dispatch resolution) | Every `**Dispatch:` block names a `massa-ai-*` agent present in all 4 host dirs; block count ≥ 20 | `scripts/__tests__/skills-harness-integrity.test.ts` | `bun run test:scripts` |
| Plan Challenge coverage | contract (filesystem-derived) | Every workflow named in `skills/AGENTS.md`'s full-gate list carries a Plan Challenge Gate step | `scripts/__tests__/workflow-harness-contract.test.ts` | `bun run test:scripts` |
| Roster cardinality | contract (repo-wide sweep) | No tracked file outside `.specs/` and `CHANGELOG.md` advertises a specialist count other than 18 | `scripts/__tests__/workflow-harness-contract.test.ts` | `bun run test:scripts` |
| Generated host bundles | parity (generated-artifact) | 18 × 4 hosts = 72 default files, 18 per (host, profile) variant, byte-identical, no drift | `scripts/__tests__/subagent-parity.test.ts`, `scripts/__tests__/generate-subagent-artifacts.test.ts` | `bun run test:scripts` |
| Plugin install paths | install (shell + CLI) | All 4 installers copy 18 specialists and print `18 subagent specialists` | `apps/*/__tests__/install.test.ts`, `apps/opencode-plugin/src/__tests__/agents-install.test.ts` | `bun run test:plugins` |
| Admin portal inventory | behavioral (executed) | `loadAgentsInventory` returns a `designer` row with `charterTier: "standard"` | `apps/tools-api/src/routes/model-registry.ts` | executed probe, recorded in `validation.md` |
| `.specs/` artifacts | none | Review + independent validation | — | — |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After each task | `bun test scripts/__tests__/skills-harness-integrity.test.ts scripts/__tests__/workflow-harness-contract.test.ts` |
| Regen | Before any parity assertion | `XDG_CONFIG_HOME=$(mktemp -d) bun run generate:artifacts` then `… --check` |
| Full | After T11 | `bun run test:scripts` |
| Plugins | After T10, **before** the final gate (lesson L-007) | `bun run test:plugins` |
| Build | T14 close-out | `bun run lint && bun run type-check && bun run test:scripts && bun run test:plugins && bun run generate:artifacts --check` |

Baseline captured T0, 2026-08-11, worktree `/Users/luizmassa/Projects/massa-ai-wt-designer-agent`
@ `origin/main` `f8427283`, tracked tree clean, scratch `XDG_CONFIG_HOME`:

- `bun run lint` (oxlint): 0 errors
- `bun run generate:artifacts`: 374 variant agent files emitted; both generators report `No drift`
- `bun test` over the 4 suites this feature touches: **259 pass, 0 fail, 1859 expect() calls, 4 files, 885 ms**

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and
tasks within a phase execute in order.

### Phase 0: Baseline

T0

### Phase 1: ADR Plan Challenge Gate

T1 → T2

### Phase 2: Charter and registration

T3 → T4 → T5

### Phase 3: Orchestration contract and dispatch wiring

T6 → T7 → T8

### Phase 4: Regeneration and gate rosters

T9 → T10 → T11

### Phase 5: Docs, portal proof, close-out

T12 → T13 → T14

## Task Breakdown

### T0: Capture the gate baseline

- **What**: Record pre-change readings for every gate this feature will move, under a scratch `XDG_CONFIG_HOME` so no local profile overlay leaks into a cited figure.
**Where**: no repository mutation
**Depends on**: none
- **Requirement**: (instrumentation)
- **Done when**: lint, generation, and the 4 touched suites have recorded numbers in this file
**Tests**: none
**Gate**: none
- **Validation command**: `XDG_CONFIG_HOME=$(mktemp -d) bun run generate:artifacts && bun run lint && bun test scripts/__tests__/{skills-harness-integrity,subagent-parity,generate-subagent-artifacts,workflow-harness-contract}.test.ts`
- **Commit**: none (recorded in tasks.md)

### T1: Add the Plan Challenge Gate step to `adr.md`

- **What**: Insert a numbered step that runs the configured Plan Challenge Gate before the Evidence Gate step, in the same shape `rfc.md:37` and `tdd.md:51` use. ADR plans take the **full** gate under the default policy (`skills/AGENTS.md` names `adr` in the full-gate set).
**Where**: `skills/massa-ai/workflows/adr.md`
**Depends on**: T0
- **Reuses**: `workflows/rfc.md` step 7, `workflows/tdd.md` step 7 (wording precedent)
- **Requirement**: ADRG-01
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: the step exists, names the gate, sits before the Evidence Gate step, and the file's step numbering stays contiguous
**Tests**: contract (added in T2)
**Gate**: quick (T2's sensor does not exist yet; record interim state)
- **Validation command**: `grep -n 'Plan Challenge Gate' skills/massa-ai/workflows/adr.md`
- **Commit**: `fix(skills): run the Plan Challenge Gate in the adr workflow`

### T2: Add the full-gate coverage sensor with an observed red

- **What**: New group in the harness contract suite. Parse the full-gate workflow list out of `skills/AGENTS.md`'s policy line, then assert each named workflow file carries a Plan Challenge Gate step. Parsing (not hardcoding) is the requirement — a hardcoded list needs the same edit the workflow needs. Prove the sensor red by removing the step from `adr.md` **and** from one other full-gate workflow in scratch, then restore.
**Where**: `scripts/__tests__/workflow-harness-contract.test.ts`
**Depends on**: T1
- **Requirement**: ADRG-02
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: the sensor is green on the delivered tree; two independent scratch mutations (one per workflow) each turn it red; the parsed population is asserted to contain at least 6 entries **and** to include `adr` — a reworded policy sentence that yields a partial or empty parse must fail, not pass vacuously
**Tests**: contract
**Gate**: quick
- **Validation command**: `bun test scripts/__tests__/workflow-harness-contract.test.ts`
- **Commit**: `test(skills): assert every full-gate workflow runs the Plan Challenge Gate`

### T3: Create the `designer` charter

- **What**: `skills/agents/designer/SKILL.md` per design "Charter outline": `model_tier: standard`, `permission: write` with the write scope narrowed to screen/view/component/layout/style/design-token files in `## Restrictions`, the Figma MCP read path, and explicit boundaries against `mobile-specialist` and `builder`. Both persona-boundary lines verbatim.
**Where**: `skills/agents/designer/SKILL.md`
**Depends on**: T2
- **Reuses**: `skills/agents/test-engineer/SKILL.md` (scoped-writer template)
- **Requirement**: DSG-01, DSG-02
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: all template sections present; both persona-boundary lines byte-identical to the registry's required text; frontmatter carries `name`, `description`, `metadata.model_tier: standard`, `metadata.permission: write`
**Tests**: integrity (structural)
**Gate**: quick (count and dispatch checks stay red until T5/T9; record interim state)
- **Validation command**: `bun test scripts/__tests__/skills-harness-integrity.test.ts`
- **Commit**: `feat(harness): add designer sub-agent charter`

### T4: Register `designer` in the generator

- **What**: Add `designer` to `SPECIALIST_NAMES` and to `WRITE_AGENTS`, and correct the header comment's `68 files (17 x 4 hosts)`.
**Where**: `scripts/generate-subagent-artifacts.ts`
**Depends on**: T3
- **Requirement**: DSG-04
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: `WRITE_AGENTS` and the charter's `permission: write` agree (integrity suite enforces this); regeneration emits `massa-ai-designer` for all 4 hosts
**Tests**: parity, integrity
**Gate**: quick
- **Validation command**: `XDG_CONFIG_HOME=$(mktemp -d) bun run generate:artifacts && ls apps/*/agents/massa-ai-designer.*`
- **Commit**: `feat(harness): register designer in the subagent generator`

### T5: Register `designer` in `skills/AGENTS.md`

- **What**: One Agent Table row (purpose, permission, trigger, charter path), one Mapping table row (new capability, no legacy role), `17 reusable sub-agent skills` → `18`, and the tail validator anchor `17 agents` → `18 agents`.
**Where**: `skills/AGENTS.md`
**Depends on**: T4
- **Requirement**: DSG-03
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: the integrity suite's "every charter is registered in `skills/AGENTS.md` and in the generator" test passes for `designer`
**Tests**: integrity
**Gate**: quick
- **Validation command**: `bun test scripts/__tests__/skills-harness-integrity.test.ts`
- **Commit**: `feat(harness): register designer in the sub-agent registry`

### T6: Add the Screen Implementation Exception to agent orchestration

- **What**: A third standing-exception section beside Plan Challenge and Independent Verification, defining the conditional-mandatory rule: when a task creates or modifies a user-facing screen, the `massa-ai-designer` dispatch is not subject to the ordinary dispatch triggers. **Must name no charter path** — `skills-harness-integrity.test.ts` asserts `charterPaths).toEqual([])` for this file.
**Where**: `skills/massa-ai/references/agent-orchestration.md`
**Depends on**: T5
- **Reuses**: the two existing exception sections (wording precedent)
- **Requirement**: DSG-07
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: the section exists; `charterPaths).toEqual([])` and "carries no second roster" both still green
**Tests**: integrity
**Gate**: quick
- **Validation command**: `bun test scripts/__tests__/skills-harness-integrity.test.ts`
- **Commit**: `feat(skills): add the screen-implementation dispatch exception`

### T7: Wire the dispatch into the 3 UI/Figma workflows

- **What**: Add the `> **Dispatch: \`massa-ai-designer\`**` block to `design.md`, `mobile-figma/mobile-figma-audit.md` (read-only packet — that workflow is findings-only), and `mobile-figma/mobile-figma-fix.md`. One authored block text, adapted per workflow only in `scope`/`permissions`.
**Where**: `skills/massa-ai/workflows/design.md`, `skills/massa-ai/workflows/mobile-figma/mobile-figma-audit.md`, `skills/massa-ai/workflows/mobile-figma/mobile-figma-fix.md`
**Depends on**: T6
- **Requirement**: DSG-05, DSG-06
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: each block carries all 8 packet body fields plus `persona`; each `trigger:` states the conditional-mandatory rule; `mobile-figma-audit`'s packet says read-only and that workflow's no-edit contract is untouched
**Tests**: integrity (dispatch resolution)
**Gate**: quick
- **Validation command**: `bun test scripts/__tests__/skills-harness-integrity.test.ts`
- **Commit**: `feat(skills): dispatch designer from the UI and Figma workflows`

### T8: Wire the dispatch into the 4 general implementation workflows

- **What**: Same block in `feature.md`, `general.md`, `spec-driven.md`, `implementation/implementation-fix.md`, with the conditional trigger — these workflows run mostly on non-screen work, so the condition is what keeps the dispatch from firing on every task.
**Where**: `skills/massa-ai/workflows/feature.md`, `skills/massa-ai/workflows/general.md`, `skills/massa-ai/workflows/spec-driven.md`, `skills/massa-ai/workflows/implementation/implementation-fix.md`
**Depends on**: T7
- **Requirement**: DSG-05, DSG-06
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: all 7 workflows carry the block; a grep for the shared trigger sentence returns exactly 7 workflow files (uniform wording — the design's named drift risk)
**Tests**: integrity (dispatch resolution)
**Gate**: quick
- **Validation command**: `bun test scripts/__tests__/skills-harness-integrity.test.ts`
- **Commit**: `feat(skills): dispatch designer from the implementation workflows`

### T9: Regenerate bundles and move the generator-side gate counts

- **What**: Regenerate all bundles under a scratch `XDG_CONFIG_HOME`, then move `17`→`18` / `68`→`72` in the generator-side suites: `subagent-parity.test.ts` (roster array + `WRITE_AGENTS` + 14 count sites), `generate-subagent-artifacts.test.ts` (7), `generate-subagent-artifacts-prune.test.ts` (2), `validate-repository.test.ts` (2), `verify-model-tokens.test.ts` (assertion + comment arithmetic), and the comment counts in `verify-package-contents.test.ts` and `skills-duplication-metric.test.ts`. The frozen parity baseline fixture is **not** regenerated (design D-5).
**Where**: `scripts/__tests__/` (7 files), regenerated `apps/*/agents*/`
**Depends on**: T8
- **Requirement**: DSG-09
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: 72 default files (18 × 4) and 396 variant files (18 × 22 host-profile cases); `--check` reports no drift; all generator-side suites green
**Tests**: parity, generated-artifact
**Gate**: full
- **Validation command**: `XDG_CONFIG_HOME=$(mktemp -d) bun run generate:artifacts && bun run test:scripts` — the **full** scripts suite, not the named files. A suite asserting a hardcoded roster name array with no count literal is invisible to both sweeps (Plan Challenge finding); only the full run can see it. Diff failures against the T0 baseline.
- **Commit**: `test(harness): move generator gate counts to 18 specialists`

### T10: Move the install-path counts (lesson L-007 surface)

- **What**: The surfaces that went red in CI last time this cardinality changed: the 4 plugin install suites, the OpenCode agents-install suite, `apps/opencode-plugin/src/config-cli.ts` help text (×2), `scripts/install-agents.sh` advisories (5 lines), and root `install.sh`.
**Where**: `apps/{claude,codex,cursor}-plugin/__tests__/install.test.ts`, `apps/opencode-plugin/src/__tests__/agents-install.test.ts`, `apps/opencode-plugin/src/config-cli.ts`, `scripts/install-agents.sh`, `install.sh`
**Depends on**: T9
- **Requirement**: DSG-09
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: `bun run test:plugins` green; each installer prints `18 subagent specialists`
**Tests**: install (shell + CLI)
**Gate**: plugins
- **Validation command**: `bun run test:plugins`
- **Commit**: `test(plugins): move install-path specialist counts to 18`

### T11: Flip the roster gate and prove the admin portal inventory

- **What**: Set `ROSTER = 17` → `18`, update the correct-spelling fixtures and the "shell installers advertise" assertion, and add two `HISTORICAL` allowlist entries covering the 5 `pyts-golden` fixture lines (design D-8 — those files are frozen test inputs imported by `pyts-golden.test.ts`; editing them breaks the golden comparison, and their text genuinely narrates a past roster size). That gate sweeps `git ls-files` with **no path filter**, so it is the authority for T12 — run it first to get the offender list. Separately, execute the admin portal's `loadAgentsInventory` and record the `designer` row.
**Where**: `scripts/__tests__/workflow-harness-contract.test.ts`
**Depends on**: T10
- **Requirement**: DSG-08, DSG-09
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: the roster test's offender list is captured (expected non-empty until T12); the portal probe returns `{name: "designer", charterTier: "standard"}` — executed, not read
**Tests**: contract, behavioral
**Gate**: quick
- **Validation command**: `bun test scripts/__tests__/workflow-harness-contract.test.ts`; portal probe script
- **Commit**: `test(skills): move the roster cardinality gate to 18`

### T12: Close every doc offender the roster gate names

- **What**: Fix exactly the files the T11 offender list names, plus the `FEATURES.md` role→tier table row `designer | standard`, the `FEATURES.md` specialist list and section heading, and the `README.md` anchor that points at that heading. Print the offender total before the rows; do not hand-enumerate. Measured population at `ROSTER = 18`: **58 offenders across 19 files**, including three classes the ad-hoc sweep never saw — `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json`, root `install.sh` (6 lines), and `.ua/knowledge-graph.json` (one targeted string replacement in a 2.0 MB generated file, design D-9).
**Where**: `FEATURES.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/ONBOARDING.md`, `install.sh`, `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json`, `.ua/knowledge-graph.json`, plus any further file the gate names
**Depends on**: T11
- **Requirement**: DSG-10
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: the roster gate's offender list is empty; the `FEATURES.md` doc-drift test for the role→tier table passes with the `designer` row
**Tests**: contract, parity (doc-drift)
**Gate**: full
- **Validation command**: `bun run test:scripts`
- **Commit**: `docs: record the designer specialist across the roster surfaces`

### T13: CHANGELOG and the sub-agents reference

- **What**: `[Unreleased]` entry under the heading `CONTRIBUTING.md` § CHANGELOG authoring maps to a feature addition, and the `designer` classification row in the spec-driven sub-agents reference (scoped writer, not a read-only specialist).
**Where**: `CHANGELOG.md`, `skills/massa-ai/references/spec-driven/sub-agents.md`
**Depends on**: T12
- **Requirement**: DSG-10, DSG-11
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: the CI CHANGELOG merge gate would pass (the file is modified); the reference no longer implies `designer` is read-only
**Tests**: contract
**Gate**: quick
- **Validation command**: `bun run test:scripts`
- **Commit**: `docs(changelog): record the designer agent and the adr plan-challenge gate`

### T14: Close-out — `.specs/` state, temp-script removal, full build gate

- **What**: Write `validation.md` inputs, update `.specs/project/STATE.md`, `.specs/project/FEATURES.json`, and `.specs/HANDOFF.md`; delete `scripts/tmp-count-sweep.sh`; run the full build gate. `check_specs_delivered.ts` must exit 0 before any push.
**Where**: `.specs/`, `scripts/tmp-count-sweep.sh` (deleted)
**Depends on**: T13
- **Requirement**: (delivery)
- **Tools**: MCP: NONE. Skill: NONE
- **Done when**: `bun run lint && bun run type-check && bun run test:scripts && bun run test:plugins && bun run generate:artifacts --check` all green; `check_specs_delivered.ts designer-agent` exits 0; the temp sweep script is gone
**Tests**: full build
**Gate**: build
- **Validation command**: `bun skills/massa-ai/scripts/check_specs_delivered.ts designer-agent --root .`
- **Commit**: `chore(specs): close out the designer-agent feature`
