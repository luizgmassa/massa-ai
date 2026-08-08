# Admin Portal UI Fixes — Tasks

**Design**: skipped — no architectural decisions (CSS + render function fixes only)
**Status**: Draft

---

## Test Coverage Matrix

| Code Layer | Test Type | Coverage Expectation | Test Files |
|------------|-----------|----------------------|------------|
| CSS classes (styles.css) | unit (rendered HTML class presence) | All referenced classes have CSS definitions | `app-renderers.test.ts`, `config-forms.test.ts` |
| Render functions (app.js) | unit (HTML output assertions) | Each AC has a deterministic assertion | `app-renderers.test.ts`, `config-forms.test.ts`, `registry-editor.test.ts`, `write-mode.test.ts` |
| Handler functions (app.js) | unit (mock ctx handler tests) | Edit/delete handlers produce correct state | `admin-handlers.test.ts` |

**Provenance**: Existing test suite (278 tests, 9 files) uses `bun test` with HTML string assertions against rendered output. No DOM simulation — pure function tests.

## Gate Check Commands

```bash
bun test apps/web-ui          # web-ui unit tests
bun run type-check             # 6 tsc projects
bun run lint                   # oxlint
```

---

## Execution Plan

### Phase 1: CSS Foundation + UI Fixes

All tasks are independent and can execute in order. No cross-task dependencies.

T1 → T2 → T3 → T4 → T5 → T6

---

## Task Breakdown

### T1: Add Missing CSS Classes

**What**: Add CSS definitions for `.btn-edit`, `.btn-delete`, `.btn-approve`, `.btn-reject`, `.actions-cell`, `.create-form`, `.form-field` classes referenced in app.js but absent from styles.css.
**Where**: `apps/web-ui/src/static/styles.css`
**Depends on**: None
**Reuses**: Existing CSS variable system (`--accent`, `--bg-panel`, `--border`, etc.)
**Requirement**: UIC-01

**Done when**:

- [ ] `.btn-edit` styled with accent blue background, white text, padding, border-radius, cursor pointer, hover state
- [ ] `.btn-delete` styled with red-tinted background, white text, same structure
- [ ] `.btn-approve` styled with green-tinted background
- [ ] `.btn-reject` styled with red-tinted background
- [ ] `.actions-cell` styled as inline flex with gap
- [ ] `.create-form` styled as card container matching `.config-section`
- [ ] `.form-field` styled as flex column matching `.config-field`
- [ ] Checkbox inputs in `.form-field` left-aligned (align-self: flex-start)
- [ ] `bun test apps/web-ui` passes

**Tests**: unit — existing tests should still pass; no new test needed (CSS is validated by visual inspection + existing HTML class assertions
**Gate**: `bun test apps/web-ui`

---

### T2: Fix Projects Tab UI Consistency

**What**: Change `renderProjects` to use `.grid` table pattern instead of bare `<ul>`, with reset button in `.actions-cell`.
**Where**: `apps/web-ui/src/static/app.js` (`renderProjects` function)
**Depends on**: T1 (CSS classes)
**Reuses**: `.grid` table pattern from `renderMemoryBrowser` and `renderCheckpoints`
**Requirement**: UIC-02

**Done when**:

- [ ] Projects rendered as `<table class="grid">` with columns: Project, Docs, Actions
- [ ] Reset button uses `btn-delete` class inside `<td class="actions-cell">`
- [ ] Index Project form keeps `.create-form` + `.form-field` structure
- [ ] Index progress line preserved
- [ ] Empty state preserved (no projects + no write mode)
- [ ] `bun test apps/web-ui` passes (update project list tests)

**Tests**: unit — update `app-renderers.test.ts` projects tests to assert table structure
**Gate**: `bun test apps/web-ui`

---

### T3: Fix Checkpoints Tab Edit/Delete Buttons

**What**: Add Edit button to checkpoints actions column, matching Memory tab pattern, and wire the edit handler.
**Where**: `apps/web-ui/src/static/app.js` (`renderCheckpoints` function + `wireViewHandlers`)
**Depends on**: T1 (CSS classes)
**Reuses**: Memory tab's `btn-edit` + `btn-delete` pattern in `.actions-cell`
**Requirement**: UIC-03

**Done when**:

- [ ] Checkpoints actions cell has both `btn-edit` (Edit) and `btn-delete` (Delete) buttons
- [ ] Edit button has `data-action="checkpoint-edit"` with `data-id` + `data-task`
- [ ] Edit handler populates create-checkpoint form fields from checkpoint data
- [ ] `bun test apps/web-ui` passes (update checkpoint tests)

**Tests**: unit — update `app-renderers.test.ts` + `write-mode.test.ts` to assert both buttons
**Gate**: `bun test apps/web-ui`

---

### T4: Fix Config Tab Checkbox Alignment + Error Display

**What**: Fix checkbox center-alignment in config fields + add error display when config API fails.
**Where**: `apps/web-ui/src/static/styles.css`, `apps/web-ui/src/static/app.js`
**Depends on**: T1 (CSS classes)
**Reuses**: Existing `.config-field` flex layout
**Requirement**: UIC-04

**Done when**:

- [ ] Checkbox inputs in `.config-field` left-aligned via `align-self: flex-start`
- [ ] Config view shows error block when API returns `success: false`
- [ ] `bun test apps/web-ui` passes (update config tests)

**Tests**: unit — update `config-forms.test.ts` to assert checkbox alignment CSS + error state
**Gate**: `bun test apps/web-ui`

---

### T5: Fix Profiles Tab Claude Installed + Registry Error Display

**What**: Fix `renderProfiles` to separate `installed` from `availableProfiles.length`, and add registry error display.
**Where**: `apps/web-ui/src/static/app.js` (`renderProfiles` function + profiles view render branch)
**Depends on**: T1 (CSS classes)
**Reuses**: Existing profiles card structure
**Requirement**: UIC-05, UIC-06

**Done when**:

- [ ] `installed: true` + `availableProfiles: []` shows "installed" with marketplace message (not "Not installed")
- [ ] `installed: true` + `availableProfiles.length > 0` shows profile cards as before
- [ ] `installed: false` shows "Not installed" as before
- [ ] `skipped` shows skip reason as before
- [ ] Registry error shows error message (not "No profiles in registry") when API fails
- [ ] `bun test apps/web-ui` passes (update profiles + registry tests)

**Tests**: unit — update `app-renderers.test.ts` + `registry-editor.test.ts`
**Gate**: `bun test apps/web-ui`

---

### T6: Full Gate Matrix + State Update

**What**: Run full gate matrix, update spec state artifacts.
**Where**: `.specs/project/STATE.md`, `.specs/project/FEATURES.json`
**Depends on**: T1-T5
**Reuses**: None
**Requirement**: All

**Done when**:

- [ ] `bun test apps/web-ui` — 0 new failures
- [ ] `bun run type-check` — 6/6 projects pass
- [ ] `bun run lint` — 0 errors
- [ ] STATE.md updated with feature completion
- [ ] FEATURES.json updated with new feature entry
- [ ] `bun skills/massa-ai/scripts/validate_state.ts --root .` exits 0

**Tests**: none
**Gate**: all gates above