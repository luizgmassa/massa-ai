# Registry Help, Opencode Dropdown, and Workflow Tiers — Validation

## Summary

**Result**: PASS
**Date**: 2026-08-08
**Verifier**: standalone fresh-eyes fallback (verification-agent subagent unavailable)
**Commit range**: 7b76fcb..e23b983

## Per-AC Evidence

### REG-01: Edit Registry Help Section

**Status**: PASS

- `<details class="registry-help">` with `<summary>?</summary>` rendered after `actionButtons` in `renderModelRegistry` return at `app.js:1231-1241`.
- Six buttons explained: Add Profile, Duplicate Profile, Delete Profile, Save Overlay, Regenerate Artifacts, Reset to Built-in — each with `<dt>`/`<dd>` describing effect + confirmation prompt.
- Workflow Tiers section also explained in the help body.
- CSS `.registry-help` defined at `styles.css:533-574` with panel styling, summary cursor, body padding.
- Tests: `registry-editor.test.ts:270-294` — 4 tests asserting `<details>`+`<summary>`, all 6 button names, help after action buttons, renders in read mode.
- **Evidence**: `app.js:1215-1241` (help section HTML), `styles.css:533-574` (CSS).

### REG-02: Opencode Effort Dropdown

**Status**: PASS

- `UI_HOST_EFFORT_ENUM.opencode` changed from `null` to `["low", "medium", "high", "max"]` at `app.js:1046`.
- `HOST_EFFORT_ENUM.opencode` changed from `null` to `["low", "medium", "high", "max"]` at `scripts/lib/model-profiles.ts:76`.
- `effortViolation` at `model-profiles.ts:306` now validates opencode effort against the enum (rejects values outside list).
- Comment updated at `model-profiles.ts:67-72` documenting the trade-off.
- FEATURES.md table updated at line 469: `any non-empty string` → `` `low` `medium` `high` `max` ``.
- Tests: `registry-editor.test.ts:110-116` asserts `<select>` + `data-type="enum"` + option values; `model-profiles.test.ts:355-370` asserts valid values pass + invalid rejected.
- **Evidence**: `model-profiles.ts:72-77` (enum), `model-profiles.ts:306` (validation), `app.js:1046` (frontend copy).

### REG-03: Workflow Tiers UI Add/Remove

**Status**: PASS

- `WORKFLOW_STEMS` constant (40 stems) at `app.js:1054-1064`.
- "Add Workflow Tier" button rendered in write mode at `app.js:1184`.
- Per-row "Remove" button rendered next to each workflow tier in write mode at `app.js:1175`.
- `handleRegistryWorkflowTierAdd` at `app.js:1536-1563`: prompts for name+tier, rejects duplicates, rejects invalid tiers, sets dirty, re-renders.
- `handleRegistryWorkflowTierRemove` at `app.js:1565-1571`: deletes from overlay, sets dirty, re-renders.
- Both wired in `wireViewHandlers` at `app.js:2089-2097`.
- Both exported in `MASSA_AI_UI` block at `app.js:2429-2430`.
- Tests: `registry-editor.test.ts:186-207` (UI: Add button, Remove button, hidden in read mode); `admin-handlers.test.ts:534-607` (handler: add happy path, duplicate reject, invalid tier reject, cancel no-op, remove happy path, no-op on empty overlay).
- **Evidence**: `app.js:1054-1064` (constant), `app.js:1166-1184` (UI), `app.js:1536-1571` (handlers), `app.js:2089-2097` (wiring).

### REG-04: Workflow Tier Validation (generator --check)

**Status**: PASS

- `validateRegistry` at `model-profiles.ts:262-274` enforces every `workflowTiers` value is a member of `tiers` (pre-existing, verified no regression).
- `bun scripts/generate-subagent-artifacts.ts --check` exits 0 with builtin `workflowTiers: {}`.
- **Evidence**: `model-profiles.ts:262-274` (validation), generator --check exit 0.

## Discrimination Sensor

3 mutations injected, 3 killed (0 survivors):

1. **Remove help section from return** → 3 REG-01 tests FAIL ✅ killed
2. **Revert opencode enum to null** → 2 model-profiles tests FAIL ✅ killed
3. **Make handleRegistryWorkflowTierRemove a no-op** → 1 REG-03 test FAILS ✅ killed

**Survivors**: 0

## Gate Results

- `bun test apps/web-ui`: 298 pass, 0 fail, 652 expect() calls
- `bun test scripts` (model-profiles + subagent-parity): 113 pass, 0 fail
- `bun run type-check`: 6/6 projects pass
- `bun run lint`: oxlint exit 0
- `bun scripts/generate-subagent-artifacts.ts --check`: exit 0, no drift

## Gaps

None. All 4 ACs verified with evidence. All mutations killed.

## Verdict

**PASS** — 4/4 ACs evidenced, 3/3 mutations killed, all gates green.