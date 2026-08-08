# Registry Help, Opencode Dropdown, and Workflow Tiers — Tasks

**Design**: skipped — Option A3 (no generator changes; UI + validation only)
**Status**: Draft

---

## Test Coverage Matrix

| Code Layer | Test Type | Coverage Expectation | Test Files |
|------------|-----------|----------------------|------------|
| Help section (app.js) | unit (HTML output assertions) | Help `<details>` + 6 button explanations present | `registry-editor.test.ts` |
| Opencode effort dropdown (app.js) | unit (HTML output assertions) | opencode effort cells render `<select>` not `<input>` | `registry-editor.test.ts` |
| Opencode effort enum (model-profiles.ts) | unit (validation) | `effortViolation` rejects values outside enum | `model-profiles.test.ts` |
| Workflow tier add/remove (app.js) | unit (handler tests) | Add/remove handlers update overlay state | `admin-handlers.test.ts` |
| Workflow tier UI (app.js) | unit (HTML output assertions) | Add button, remove buttons, workflow-name picker present | `registry-editor.test.ts` |
| Generator --check (generate-subagent-artifacts.ts) | unit (exit code) | --check passes with empty + valid workflowTiers | `generate-subagent-artifacts.test.ts` |

**Provenance**: Existing test suite (285 tests, 9 files in web-ui; model-profiles.test.ts, generate-subagent-artifacts.test.ts in scripts). Uses `bun test` with HTML string assertions + handler mock-ctx tests.

## Gate Check Commands

```bash
bun test apps/web-ui          # web-ui unit tests
bun test scripts              # scripts unit tests (model-profiles, generator)
bun run type-check             # 6 tsc projects
bun run lint                   # oxlint
bun scripts/generate-subagent-artifacts.ts --check  # generator check
```

---

## Execution Plan

### Phase 1: Registry Editor Enhancements

All tasks are independent and can execute in order. No cross-task dependencies.

T7 → T8 → T9 → T10

---

## Task Breakdown

### T7: Add Help Section to Edit Registry

**What**: Add a collapsible `<details>` help section at the bottom of the Edit Registry page explaining the six action buttons.
**Where**: `apps/web-ui/src/static/app.js` (`renderModelRegistry` function), `apps/web-ui/src/static/styles.css`
**Depends on**: None
**Reuses**: Existing `<details>`/`<summary>` pattern (if any) or plain HTML
**Requirement**: REG-01

**Done when**:

- [ ] `<details>` help section rendered after `actionButtons` in `renderModelRegistry`
- [ ] Six buttons explained: Add Profile, Duplicate Profile, Delete Profile, Save Overlay, Regenerate Artifacts, Reset to Built-in
- [ ] Each explanation describes the action's effect + confirmation prompt
- [ ] CSS for `.registry-help` section (subtle styling, not prominent)
- [ ] `bun test apps/web-ui` passes (new test in `registry-editor.test.ts`)

**Tests**: unit — add test asserting `<details>` + `<summary>` + all six button names in help text
**Gate**: `bun test apps/web-ui`

---

### T8: Opencode Effort Dropdown

**What**: Change opencode effort cells from text input to dropdown constrained to `["low", "medium", "high", "max"]`.
**Where**: `apps/web-ui/src/static/app.js` (`UI_HOST_EFFORT_ENUM`), `scripts/lib/model-profiles.ts` (`HOST_EFFORT_ENUM`, `effortViolation`)
**Depends on**: None
**Reuses**: Existing effort dropdown rendering logic (claude/codex path)
**Requirement**: REG-02

**Done when**:

- [ ] `UI_HOST_EFFORT_ENUM.opencode` changed from `null` to `["low", "medium", "high", "max"]`
- [ ] `HOST_EFFORT_ENUM.opencode` changed from `null` to `["low", "medium", "high", "max"]`
- [ ] `effortViolation` validates opencode effort against the new enum (rejects values outside list)
- [ ] Existing registry values (`high`, `max`) pass validation
- [ ] Opencode effort cells render as `<select>` dropdown in the grid
- [ ] `bun test apps/web-ui` passes (update `registry-editor.test.ts` — opencode cells now `<select>`)
- [ ] `bun test scripts` passes (update `model-profiles.test.ts` — opencode effort now validated)
- [ ] `bun scripts/generate-subagent-artifacts.ts --check` exits 0

**Tests**: unit — update `registry-editor.test.ts` to assert opencode effort `<select>`, update `model-profiles.test.ts` to assert opencode effort rejection outside enum
**Gate**: `bun test apps/web-ui`, `bun test scripts`, `bun scripts/generate-subagent-artifacts.ts --check`

---

### T9: Workflow Tiers UI Add/Remove

**What**: Add UI and handlers to add/remove workflow tier entries in the Edit Registry, with a workflow-name picker from the live inventory.
**Where**: `apps/web-ui/src/static/app.js` (`renderModelRegistry` function, new `handleRegistryWorkflowTierAdd`/`handleRegistryWorkflowTierRemove` handlers, `wireViewHandlers`)
**Depends on**: None
**Reuses**: Existing `handleRegistryWorkflowTierEdit` pattern, existing overlay dirty-flag mechanism
**Requirement**: REG-03

**Done when**:

- [ ] `WORKFLOW_STEMS` constant exported in `app.js` (frontend copy of 40 live workflow stems)
- [ ] "Add Workflow Tier" button rendered in write mode
- [ ] Per-entry "Remove" button rendered next to each workflow tier row in write mode
- [ ] `handleRegistryWorkflowTierAdd` handler: prompts for workflow name (dropdown of `WORKFLOW_STEMS` minus already-present names) + tier (dropdown of registry tiers), adds to overlay, marks dirty, re-renders
- [ ] `handleRegistryWorkflowTierRemove` handler: removes entry from overlay, marks dirty, re-renders
- [ ] Duplicate workflow names prevented (picker excludes already-present names)
- [ ] Overlay save persists workflow tier additions/removals
- [ ] `bun test apps/web-ui` passes (new tests in `registry-editor.test.ts` + `admin-handlers.test.ts`)

**Tests**: unit — `registry-editor.test.ts` asserts Add button + Remove buttons + workflow-name picker; `admin-handlers.test.ts` asserts add/remove handler state changes
**Gate**: `bun test apps/web-ui`

---

### T10: Full Gate Matrix + State Update

**What**: Run full gate matrix, update spec state artifacts.
**Where**: `.specs/project/STATE.md`, `.specs/project/FEATURES.json`
**Depends on**: T7-T9
**Reuses**: None
**Requirement**: All

**Done when**:

- [ ] `bun test apps/web-ui` — 0 new failures
- [ ] `bun test scripts` — 0 new failures
- [ ] `bun run type-check` — 6/6 projects pass
- [ ] `bun run lint` — 0 errors
- [ ] `bun scripts/generate-subagent-artifacts.ts --check` — exit 0
- [ ] STATE.md updated with feature completion
- [ ] FEATURES.json updated with new feature entry
- [ ] `bun skills/massa-ai/scripts/validate_state.ts --root .` exits 0

**Tests**: none
**Gate**: all gates above