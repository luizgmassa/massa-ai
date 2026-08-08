# Admin Portal Enhancements Specification

Slug: `admin-portal-enhancements`. Workflow: `spec-driven`. Branch:
`spec/admin-portal-enhancements` from `main` @ `cb2ca3d9` (PR #92 merge).

Builds on the prior feature `admin-portal` (PR #92, merged) which shipped
config/profile/registry **renderers** but left the event handlers, styling,
confirmation flow, and progress UX unimplemented or missing.

## Problem Statement

The prior `admin-portal` feature (PR #92) shipped three new view renderers
(`renderConfig`, `renderProfiles`, `renderModelRegistry`) and the backend
routes they call (`GET/PUT /api/v1/config`, `GET/POST/switch
/api/v1/profiles`, `GET/PUT/POST regenerate/DELETE overlay
/api/v1/model-registry`). But the frontend never wired the renderers to the
backend:

1. **No event handlers for the new views.** `wireViewHandlers()` in
   `apps/web-ui/src/static/app.js:1397` wires memory, search, handoffs,
   proposals, checkpoints, and projects — but has zero handlers for
   `config-save`, `config-reveal`, `profile-switch`, or any `registry-*`
   action. Every button the new renderers emit is dead on click.
2. **No styling for the new views.** `styles.css` defines `.filters`,
   `.grid`, `.card`, `.pager`, `.create-form`, `.form-field`,
   `.btn-edit/.btn-delete/.btn-approve`, `.actions-cell`, `.empty`,
   `.error`. It does NOT define any of the ~20 classes the new renderers
   emit: `.config-section`, `.config-fields`, `.config-field`,
   `.config-section-header`, `.save-btn`, `.reveal-btn`, `.badge`,
   `.restart-badge`, `.overlay-badge`, `.active-badge`, `.profile-host`,
   `.profile-cards`, `.profile-card`, `.switch-btn`, `.registry-grid`,
   `.registry-cell`, `.overlay-sourced`, `.cell-empty`,
   `.registry-actions`, `.registry-action-buttons`,
   `.registry-hostDefaults`, `.registry-workflowTiers`, `.tombstoned`,
   `.tombstoned-item`. The Config, Profiles, and Model Registry views
   render as unstyled plain text — fields stack vertically, buttons look
   like default browser buttons, the grid has no borders, badges have no
   color. The design system (CSS variables, panel backgrounds, border
   colors, accent button style, radius, spacing) is not applied.
3. **No confirmation step before config/profile/registry edits.** The prior
   feature's spec (UX-03) only required `confirm()` for destructive ops
   (delete/reset/cancel/clear). The user now wants confirmation before
   **every** config or profile edit — config save, profile switch,
   registry overlay save, regenerate, add/duplicate/delete profile, clear
   overlay — so a solo operator never mutates the system by accident.
4. **No success/failure feedback after edits.** Existing handlers call
   `render()` on success and `alert()` on error, but show no status
   banner. The user wants a visible success/failure indication after
   every edit, consistent with the existing error block styling.
5. **No real-time progress for long-running operations.** Project index
   returns a `jobId` and `index_status` SSE events already exist (app.js
   SSE block, line 1692), but the Projects view shows only an `alert()`
   with the job ID — it does not poll or show indexing progress. Registry
   regeneration spawns a blocking child process
   (`spawnSync` in `model-registry.ts:115`) and the UI has no spinner or
   live output at all. The user wants real-time progress where
   applicable.
6. **Model-registry editor has no nav link.** `viewFromHash` (app.js:1309)
   includes `model-registry` but the nav bar (`index.html:25-35`) has no
   link to it. The editor is reachable only by typing `#/model-registry`
   in the URL bar. The user wants it surfaced as a sub-tab inside the
   Profiles view.

## Goals

- [ ] Wire every `data-action` the Config, Profiles, and Model Registry
  renderers emit to a real handler that calls the right API route, then
  refreshes the view.
- [ ] Apply the existing design system (CSS variables, fonts, colors,
  spacing, button style, panel/border/radius, badges) to all new view
  classes so Config, Profiles, and Model Registry match the rest of the
  portal.
- [ ] Add a confirmation step (confirm dialog naming the entity and
  action) before every config or profile edit, not just destructive ones.
- [ ] Show a success or failure status banner after every edit, using the
  existing `.error` styling for failures and a new `.success` styling for
  successes.
- [ ] Add real-time progress for two long-running operations: project
  indexing (poll `index_status` or consume the existing SSE event, show
  a progress line in the Projects view) and registry regeneration
  (convert `spawnSync` to a streaming SSE-backed child process, show live
  stdout lines in the Profiles/Registry view).
- [ ] Surface the model-registry editor as a sub-tab inside the Profiles
  view (tab switcher: "Switch Profile" / "Edit Registry"), with one nav
  item "Profiles".

## Out of Scope

| Feature | Reason |
| --- | --- |
| Per-field inline validation in config forms (real-time red borders) | V1 validates on Save and shows server 400 details in the banner. Inline per-field is future polish. |
| Config diff viewer / rollback history | V1 keeps the single `.bak.<timestamp>` backup model from the prior feature. Browsable history is future work. |
| Registry overlay versioning / ETag concurrency | V1 keeps last-writer-wins (prior feature assumption). |
| Bulk operations (bulk delete memories, bulk reindex) | Prior feature out-of-scope, unchanged. |
| Auth/RBAC for remote operators | Solo local operator trust model (prior feature). |
| Custom tier names UI flow | Prior feature out-of-scope; overlay `tiers` array replacement is the escape hatch. |
| Undo for config save | Backup file is the rollback path; UI undo button is future. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Confirm-on-all-edits includes config Save | `confirm("Save <section> config? Backup will be created.")` before PUT | User explicitly requested confirmation on every editing action. Config Save is non-destructive (auto-backup) but still mutates the running system's config file. | y (user) |
| Confirm-on-all-edits includes profile Switch | `confirm("Switch <host> to profile <name>? Replaces installed agent files. Session restart required.")` | Switching mutates installed agent files on disk (MPS-01). User wants confirmation. | y (user) |
| Confirm-on-all-edits includes registry overlay Save | `confirm("Save registry overlay? Validates and writes to ~/.config/massa-ai/model-profiles.json.")` | Writes the overlay file. User wants confirmation. | y (user) |
| Confirm-on-all-edits includes Regenerate Artifacts | `confirm("Regenerate subagent artifacts? Spawns generate-subagent-artifacts.ts. This overwrites installed variant dirs.")` | Regenerate overwrites installed agent variant directories. User wants confirmation. | y (user) |
| Add/Duplicate/Delete profile are in-memory until Save Overlay | Adding/duplicating/deleting a profile in the grid edits the in-memory overlay state; only Save Overlay writes to disk. Confirm on Save (not on each in-memory grid edit) to avoid prompt fatigue. | Matches prior feature's in-memory overlay model. User confirmed confirm-all applies to the disk-writing action. | y (user) |
| Success/failure banner is transient (auto-hide after 6s) | Status banner appears at the top of the view, auto-hides after 6 seconds, stays on error until next action | Matches common admin UI patterns; error must be dismissable but not auto-hidden too fast. | y |
| Regenerate streams stdout via a new SSE channel | New route `POST /api/v1/model-registry/regenerate-stream` spawns the script with `spawn` (not `spawnSync`), pipes stdout/stderr lines to an SSE channel keyed by a `jobId`; UI subscribes to the SSE stream, shows lines live, shows final success/failure. The existing `POST .../regenerate` (blocking) stays for API compatibility. | User chose "Stream lines via SSE" over a spinner-only approach. | y (user) |
| Project index progress uses existing SSE `/api/v1/events` | The existing SSE block (app.js:1692) already refreshes on `index_status` events. We extend the Projects view to render the status line (phase, progress, file count) from the last received event; poll `index_status` by jobId as a fallback when SSE is not connected. | Reuses existing SSE; no new backend route needed for index progress. | y |
| Model-registry editor is a sub-tab inside Profiles, not a separate nav item | Profiles view renders a tab switcher ("Switch Profile" / "Edit Registry"); state persists in `localStorage massa-ai-profiles-tab`. One nav item "Profiles". | User chose "Sub-tab inside Profiles". | y (user) |
| Config reveal toggle uses `type` swap (password↔text), not a separate value display | Clicking "reveal" on a sensitive field sets `input.type = "text"`; clicking again sets it back to `password`. No separate value element. | Simplest vanilla-JS approach; matches the renderer's existing `reveal-btn` data-action. | y |
| Status banner reuses `.error` for failure, new `.success` class for success | `.success` gets `background: var(--bg-panel)`, green-tinted border, accent check icon. Mirrors `.error` shape. | Consistent with existing design tokens. | y |
| Polling fallback for index status uses 2s interval, stops on completed/failed | When SSE is not connected, poll `GET /api/v1/index-status?jobId=<id>` every 2s until status is `completed` or `failed`; stop on terminal. | Bounds polling; 2s is responsive without hammering. | y |

**Open questions:** none — all resolved above.

---

## User Stories

### P1: Config View — Wire Save + Reveal + Confirm + Feedback ⭐ MVP

**User Story**: As a solo operator, when I open the Config view, I want every
Save button to actually save the section (with a confirmation asking if I'm
sure), and I want to see if the save succeeded or failed — with the current
config values loaded into the form, not an empty form.

**Why P1**: The Config renderer exists but Save is dead on click; the form
already loads current values via `GET /api/v1/config` in `render()` (app.js:1382)
— the missing piece is the handler. Without it the entire Config view is
read-only-by-accident.

**Acceptance Criteria** (EARS):

1. WHEN the operator clicks Save on a config section THEN the system SHALL show a confirmation dialog naming the section and warning that a backup will be created. <!-- event-driven -->
2. IF the operator confirms the save dialog THEN the client SHALL collect the section's field values, build the partial body via `buildConfigSectionBody`, and PUT it to `/api/v1/config`. <!-- unwanted-behavior -->
3. WHEN the PUT returns success THEN the system SHALL show a success banner ("Config section <section> saved. Backup created.") and re-render the Config view with the updated masked config. <!-- event-driven -->
4. WHEN the PUT returns a 400 validation error THEN the system SHALL show an error banner listing the validation details from the response body. <!-- event-driven -->
5. WHEN the PUT fails (network/500) THEN the system SHALL show an error banner with the failure message. <!-- event-driven -->
6. WHEN the operator clicks reveal on a sensitive field THEN the system SHALL toggle the input type between `password` and `text` without submitting. <!-- event-driven -->
7. WHEN the Config view renders THEN the form inputs SHALL be pre-populated with the current config values returned by `GET /api/v1/config` (already implemented in `render()`). <!-- ubiquitous -->
8. IF the operator cancels the save confirmation dialog THEN the system SHALL not send any request and the form SHALL retain the edited values. <!-- unwanted-behavior -->

**Independent Test**: Open Config view (verify all 15 sections show current values), edit `logging.level` to `debug`, click Save (verify confirm dialog appears), confirm (verify success banner + view refresh), edit `llm.temperature` to `not-a-number`, Save, confirm (verify error banner with validation detail), click reveal on `database.url` (verify value shows), click reveal again (verify value hidden).

**Requirement IDs**: CFG-01 (confirm before save), CFG-02 (PUT on confirm), CFG-03 (success banner + refresh), CFG-04 (400 details banner), CFG-05 (failure banner), CFG-06 (reveal toggle), CFG-07 (pre-populated values), CFG-08 (cancel preserves edits).

---

### P1: Profiles View — Wire Switch + Confirm + Feedback + Sub-tab ⭐ MVP

**User Story**: As a solo operator, when I open the Profiles view, I want to
see the current profiles and active profile per host (already loaded), be
able to switch profiles (with a confirmation), see success/failure per host,
and access the Model Registry editor as a sub-tab inside the same view.

**Why P1**: The Profiles renderer loads data via `GET /api/v1/profiles`
(already in `render()`, app.js:1385) but the Switch button is dead. The
registry editor is unreachable from the nav.

**Acceptance Criteria**:

1. WHEN the operator navigates to the Profiles view THEN the system SHALL render a tab switcher with two tabs: "Switch Profile" and "Edit Registry". <!-- event-driven -->
2. WHEN the operator clicks "Switch Profile" tab THEN the system SHALL render the profile switcher (existing `renderProfiles`). <!-- event-driven -->
3. WHEN the operator clicks "Edit Registry" tab THEN the system SHALL render the model-registry editor (existing `renderModelRegistry`). <!-- event-driven -->
4. WHEN the operator clicks Switch on a profile THEN the system SHALL show a confirmation dialog naming the host and target profile, warning that installed agent files are replaced and a session restart is required. <!-- event-driven -->
5. IF the operator confirms the switch dialog THEN the client SHALL POST to `/api/v1/profiles/switch` with the profile and optional host. <!-- unwanted-behavior -->
6. WHEN the switch returns success THEN the system SHALL show a success banner summarizing per-host results (switched / skipped / failed) and re-render the Profiles view. <!-- event-driven -->
7. WHEN the switch returns an error THEN the system SHALL show an error banner with the error code and message. <!-- event-driven -->
8. WHEN the operator reloads the page THEN the last-selected tab SHALL persist via `localStorage massa-ai-profiles-tab`. <!-- state-driven -->

**Independent Test**: Open Profiles (verify tab switcher + Switch Profile tab active), click Switch on a profile (verify confirm dialog), confirm (verify success banner with per-host results), click "Edit Registry" tab (verify registry grid renders), reload page (verify Edit Registry tab still active).

**Requirement IDs**: PROFTAB-01 (tab switcher), PROFTAB-02 (switch profile tab), PROFTAB-03 (registry tab), PROFSW-01 (confirm before switch), PROFSW-02 (POST on confirm), PROFSW-03 (success banner + per-host), PROFSW-04 (error banner), PROFTAB-05 (tab persistence).

---

### P1: Model Registry — Wire CRUD + Confirm + Feedback ⭐ MVP

**User Story**: As a solo operator, when I open the registry editor, I want
to edit cell values (model + effort), add/duplicate/delete/restore profiles,
edit hostDefaults and workflowTiers, save the overlay (with confirmation),
clear the overlay (with confirmation), and see success/failure after each
disk-writing action.

**Why P1**: The registry renderer emits all the buttons but none are wired.
The in-memory overlay state (add/duplicate/delete/restore, cell edits) needs
to be tracked client-side so Save Overlay sends the full accumulated overlay.

**Acceptance Criteria**:

1. WHEN the operator edits a cell (model or effort) THEN the client SHALL update the in-memory overlay state for that `{profile, host, tier}` triple. <!-- event-driven -->
2. WHEN the operator edits a hostDefault or workflowTier select THEN the client SHALL update the in-memory overlay state. <!-- event-driven -->
3. WHEN the operator clicks Add Profile THEN the system SHALL prompt for a name and description, initialize the profile with `model: null, effort: null` for every `{host, tier}`, and add it to the in-memory overlay and grid. <!-- event-driven -->
4. WHEN the operator clicks Duplicate Profile THEN the system SHALL prompt for a new name, copy the selected profile's full grid, and add it to the in-memory overlay and grid. <!-- event-driven -->
5. WHEN the operator clicks Delete Profile THEN the system SHALL add a tombstone `{_delete: true}` to the in-memory overlay, remove the profile from the grid, and show it in the "Deleted (restorable)" list. <!-- event-driven -->
6. WHEN the operator clicks Restore on a tombstoned profile THEN the system SHALL remove the tombstone from the in-memory overlay and re-add the profile to the grid. <!-- event-driven -->
7. WHEN the operator clicks Save Overlay THEN the system SHALL show a confirmation dialog naming the overlay file path and warning that validation runs before write. <!-- event-driven -->
8. IF the operator confirms the save dialog THEN the client SHALL PUT the full in-memory overlay to `/api/v1/model-registry`. <!-- unwanted-behavior -->
9. WHEN the PUT returns success THEN the system SHALL show a success banner and re-render the registry view with the updated effective registry + source. <!-- event-driven -->
10. WHEN the PUT returns 400 validation violations THEN the system SHALL show an error banner listing all violations. <!-- event-driven -->
11. WHEN the operator clicks Clear Overlay THEN the system SHALL show a confirmation dialog warning that the overlay file is deleted and the registry reverts to built-in. <!-- event-driven -->
12. IF the operator confirms the clear dialog THEN the client SHALL DELETE `/api/v1/model-registry/overlay` and re-render with the built-in registry. <!-- unwanted-behavior -->
13. WHEN the in-memory overlay has unsaved changes THEN the system SHALL show an "unsaved changes" indicator in the registry view. <!-- state-driven -->

**Independent Test**: Open Profiles → Edit Registry tab, edit a cell (verify unsaved indicator), add a profile (verify in grid + unsaved indicator), delete a profile (verify in restore list), restore it, edit hostDefaults, click Save Overlay (verify confirm dialog), confirm (verify success banner + refresh), click Clear Overlay (verify confirm), confirm (verify built-in registry + success banner).

**Requirement IDs**: REGWIRE-01 (cell edit in-memory), REGWIRE-02 (hostDefault/workflowTier edit), REGWIRE-03 (add profile), REGWIRE-04 (duplicate), REGWIRE-05 (delete + tombstone), REGWIRE-06 (restore), REGWIRE-07 (save confirm), REGWIRE-08 (PUT on confirm), REGWIRE-09 (save success banner), REGWIRE-10 (save 400 violations banner), REGWIRE-11 (clear confirm), REGWIRE-12 (clear DELETE), REGWIRE-13 (unsaved indicator).

---

### P1: Registry Regenerate — Streaming Progress via SSE ⭐ MVP

**User Story**: As a solo operator, when I click Regenerate Artifacts, I want
a confirmation, then a live view of the script's stdout/stderr lines as they
happen, then a final success or failure indication.

**Why P1**: The existing regenerate route uses `spawnSync` (blocking) with no
progress. The user explicitly chose a streaming SSE approach.

**Acceptance Criteria**:

1. WHEN the operator clicks Regenerate Artifacts THEN the system SHALL show a confirmation dialog warning that the script overwrites installed variant dirs. <!-- event-driven -->
2. IF the operator confirms THEN the client SHALL call `POST /api/v1/model-registry/regenerate-stream` and subscribe to the SSE stream keyed by the returned `jobId`. <!-- unwanted-behavior -->
3. WHEN the server spawns the child process THEN the server SHALL use `child_process.spawn` (not `spawnSync`), pipe stdout/stderr line-by-line to an SSE channel, and emit a terminal event with exit code on completion. <!-- event-driven -->
4. WHEN the client receives stdout/stderr lines THEN the UI SHALL append them to a scrolling log panel in the registry view. <!-- event-driven -->
5. WHEN the client receives the terminal event THEN the UI SHALL show a success banner (exit 0) or failure banner (non-zero exit + stderr tail) and stop the SSE subscription. <!-- event-driven -->
6. WHILE the regeneration is running THEN the Regenerate button SHALL be disabled and show "regenerating…". <!-- state-driven -->
7. WHEN the regenerate route fails to spawn (script not found) THEN the server SHALL return 500 with an error message and the UI SHALL show an error banner. <!-- unwanted-behavior -->
8. The existing blocking `POST /api/v1/model-registry/regenerate` route SHALL remain unchanged for API compatibility. <!-- ubiquitous -->

**Independent Test**: Open registry editor, click Regenerate (verify confirm), confirm (verify log panel appears + lines stream), wait for completion (verify success/failure banner), verify Regenerate button re-enabled.

**Requirement IDs**: REGEN-01 (confirm), REGEN-02 (call stream route + subscribe), REGEN-03 (server spawn + SSE), REGEN-04 (live log panel), REGEN-05 (terminal banner), REGEN-06 (button disabled while running), REGEN-07 (spawn failure), REGEN-08 (blocking route preserved).

---

### P1: Project Index Progress ⭐ MVP

**User Story**: As a solo operator, when I index or reindex a project, I want
to see the indexing job progress in real time (phase, file count, status)
within the Projects view, not just an alert with a job ID.

**Why P1**: The existing `handleProjectIndex` shows `alert("Indexing job started: " + jobId)` and stops. The SSE `/api/v1/events` already emits `index_status` events (app.js:1700) but the Projects view ignores them. `index_status` polling API exists (`GET /api/v1/index-status`).

**Acceptance Criteria**:

1. WHEN the operator submits the index-project form and the API returns a jobId THEN the Projects view SHALL show a progress line with the jobId and initial status "pending". <!-- event-driven -->
2. WHEN an `index_status` SSE event arrives for the tracked jobId THEN the Projects view SHALL update the progress line with the event's phase, file count, and status. <!-- event-driven -->
3. WHEN SSE is not connected THEN the client SHALL poll `GET /api/v1/index-status?jobId=<id>` every 2 seconds until the status is `completed` or `failed`. <!-- state-driven -->
4. WHEN the job status reaches `completed` THEN the progress line SHALL show "completed" and the project list SHALL refresh. <!-- event-driven -->
5. WHEN the job status reaches `failed` THEN the progress line SHALL show "failed" with the error message. <!-- event-driven -->
6. WHEN a reindex is triggered for an existing project THEN the same progress line SHALL track the new jobId. <!-- event-driven -->

**Independent Test**: Open Projects, submit index form (verify progress line with jobId + pending), wait (verify progress updates via SSE or polling), verify "completed" + project list refresh, trigger reindex (verify new progress line).

**Requirement IDs**: PRG-01 (jobId progress line), PRG-02 (SSE update), PRG-03 (poll fallback), PRG-04 (completed refresh), PRG-05 (failed error), PRG-06 (reindex tracks new jobId).

---

### P1: Design System — Style All New View Classes ⭐ MVP

**User Story**: As a solo operator, I want the Config, Profiles, and Model
Registry views to look like the rest of the portal — same fonts, colors,
spacing, button style, borders, badges — not raw unstyled HTML.

**Why P1**: The renderers emit ~20 CSS classes that have no definitions in
`styles.css`. The views currently render as unstyled plain text.

**Acceptance Criteria**:

1. WHEN the Config view renders THEN `.config-section`, `.config-section-header`, `.config-fields`, `.config-field`, `.save-btn`, `.reveal-btn`, `.badge`, `.restart-badge` SHALL be styled using the existing CSS variables (`--bg-panel`, `--border`, `--accent`, `--fg-muted`, `--error-fg`) with consistent radius, padding, and spacing matching `.card` / `.filters` / `.form-field`. <!-- ubiquitous -->
2. WHEN the Profiles view renders THEN `.profile-host`, `.profile-cards`, `.profile-card`, `.switch-btn`, `.active-badge`, `.badge.muted` SHALL be styled consistently with the existing `.card` and `.filters button` patterns. <!-- ubiquitous -->
3. WHEN the Model Registry view renders THEN `.registry-grid`, `.registry-cell`, `.overlay-sourced`, `.cell-empty`, `.registry-actions`, `.registry-action-buttons`, `.registry-hostDefaults`, `.registry-workflowTiers`, `.tombstoned`, `.tombstoned-item`, `.overlay-badge` SHALL be styled as a bordered grid with accent buttons, muted empty cells, and a distinct (accent-tinted) background for overlay-sourced cells. <!-- ubiquitous -->
4. WHEN a success or failure banner renders THEN `.success` and `.error` SHALL use matching shape (padding, radius, border) with `.success` using a green accent and `.error` using the existing red accent. <!-- ubiquitous -->
5. WHEN the tab switcher renders THEN `.tab-switcher`, `.tab` SHALL be styled consistently with `.nav a` (active state uses `--accent` + `--row-hover`). <!-- ubiquitous -->
6. WHEN the regenerate log panel renders THEN `.regenerate-log` SHALL be a monospace scrolling panel with `--bg-code` background, max-height, and overflow-y auto. <!-- ubiquitous -->
7. WHEN the project index progress line renders THEN `.index-progress` SHALL be a muted panel line with the jobId, status badge, and file count. <!-- ubiquitous -->

**Independent Test**: Open Config (verify section cards have borders, padding, panel background; Save buttons are accent-colored; badges are tinted), open Profiles (verify profile cards match card style; Switch button is accent), open Registry (verify grid has borders, overlay cells tinted, action buttons accent), trigger a write (verify success banner is green-tinted, error banner red-tinted), check tab switcher styling, check regenerate log panel styling, check index progress line styling.

**Requirement IDs**: DS-01 (config classes), DS-02 (profile classes), DS-03 (registry classes), DS-04 (success/error banners), DS-05 (tab switcher), DS-06 (regenerate log), DS-07 (index progress).

---

## Edge Cases

- IF the operator cancels any confirmation dialog THEN no request is sent and the in-memory state (overlay edits, form values) is preserved.
- IF the config PUT returns 400 with `details` array THEN the error banner lists every detail (not just the first).
- IF the registry PUT returns 400 with `violations` array THEN the error banner lists every violation.
- IF the profile switch returns per-host results with some `failed` entries THEN the banner shows switched/skipped/failed counts and the failed reasons.
- IF the regenerate SSE stream closes before a terminal event THEN the UI shows an error banner ("stream closed unexpectedly") and re-enables the button.
- IF the regenerate child process emits no stdout lines but exits 0 THEN the log panel shows "(no output)" and the success banner appears.
- IF the index_status SSE event arrives for a different jobId than the one being tracked THEN the progress line ignores it.
- IF the operator navigates away from the registry view while regeneration is running THEN the SSE subscription is cancelled (no orphan streams).
- IF the operator has unsaved overlay changes and clicks Save Overlay without changing any cells THEN the PUT sends the current in-memory overlay (which may equal the on-disk overlay; server writes it idempotently).
- IF the tab switcher has no persisted tab (first visit) THEN "Switch Profile" is the default.
- IF two browser tabs edit the overlay concurrently THEN last-writer-wins (prior feature assumption; no ETag in V1).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CFG-01 | Config View | Design | Pending |
| CFG-02 | Config View | Design | Pending |
| CFG-03 | Config View | Design | Pending |
| CFG-04 | Config View | Design | Pending |
| CFG-05 | Config View | Design | Pending |
| CFG-06 | Config View | Design | Pending |
| CFG-07 | Config View | Design | Pending |
| CFG-08 | Config View | Design | Pending |
| PROFTAB-01 | Profiles View | Design | Pending |
| PROFTAB-02 | Profiles View | Design | Pending |
| PROFTAB-03 | Profiles View | Design | Pending |
| PROFSW-01 | Profiles View | Design | Pending |
| PROFSW-02 | Profiles View | Design | Pending |
| PROFSW-03 | Profiles View | Design | Pending |
| PROFSW-04 | Profiles View | Design | Pending |
| PROFTAB-05 | Profiles View | Design | Pending |
| REGWIRE-01 | Model Registry | Design | Pending |
| REGWIRE-02 | Model Registry | Design | Pending |
| REGWIRE-03 | Model Registry | Design | Pending |
| REGWIRE-04 | Model Registry | Design | Pending |
| REGWIRE-05 | Model Registry | Design | Pending |
| REGWIRE-06 | Model Registry | Design | Pending |
| REGWIRE-07 | Model Registry | Design | Pending |
| REGWIRE-08 | Model Registry | Design | Pending |
| REGWIRE-09 | Model Registry | Design | Pending |
| REGWIRE-10 | Model Registry | Design | Pending |
| REGWIRE-11 | Model Registry | Design | Pending |
| REGWIRE-12 | Model Registry | Design | Pending |
| REGWIRE-13 | Model Registry | Design | Pending |
| REGEN-01 | Registry Regenerate | Design | Pending |
| REGEN-02 | Registry Regenerate | Design | Pending |
| REGEN-03 | Registry Regenerate | Design | Pending |
| REGEN-04 | Registry Regenerate | Design | Pending |
| REGEN-05 | Registry Regenerate | Design | Pending |
| REGEN-06 | Registry Regenerate | Design | Pending |
| REGEN-07 | Registry Regenerate | Design | Pending |
| REGEN-08 | Registry Regenerate | Design | Pending |
| PRG-01 | Project Index Progress | Design | Pending |
| PRG-02 | Project Index Progress | Design | Pending |
| PRG-03 | Project Index Progress | Design | Pending |
| PRG-04 | Project Index Progress | Design | Pending |
| PRG-05 | Project Index Progress | Design | Pending |
| PRG-06 | Project Index Progress | Design | Pending |
| DS-01 | Design System | Design | Pending |
| DS-02 | Design System | Design | Pending |
| DS-03 | Design System | Design | Pending |
| DS-04 | Design System | Design | Pending |
| DS-05 | Design System | Design | Pending |
| DS-06 | Design System | Design | Pending |
| DS-07 | Design System | Design | Pending |

**Coverage:** 51 total, 51 mapped to stories, 0 unmapped.

---

## Success Criteria

- [ ] Every button the Config, Profiles, and Model Registry renderers emit is wired to a handler that calls the right API and refreshes the view.
- [ ] Every config/profile/registry edit action shows a confirmation dialog before executing.
- [ ] Every edit action shows a success or failure banner after completing.
- [ ] Registry regeneration streams live stdout/stderr lines to a log panel via SSE.
- [ ] Project indexing shows real-time progress (SSE + polling fallback).
- [ ] Config, Profiles, and Model Registry views are styled consistently with the existing portal design system.
- [ ] Model-registry editor is reachable as a sub-tab inside the Profiles view.
- [ ] All existing tests remain green; no existing test weakened or deleted.
- [ ] New tests cover the wired handlers, confirmation flow, banner feedback, tab switcher, and SSE regenerate path.

---

## Verification Approach

- **External behavior, not implementation details.** Tests assert rendered
  HTML output, `data-action` attributes, `confirm()` call sequences (mocked),
  and API call bodies — never internal function calls.
- **Existing test seams extended**: `write-mode.test.ts`,
  `app-renderers.test.ts`, `config-forms.test.ts`, `registry-editor.test.ts`
  assert the renderers emit the right `data-action` attributes. New test
  files assert the handler wiring + confirmation + banner logic.
- **New backend test**: `model-registry-stream.test.ts` for the new
  `regenerate-stream` route (SSE shape, line emission, terminal event).
- **Gate commands**: `bun run test:scripts`, `bun run lint`, `bun run type-check`, `bun run test:plugins`.
- **Independent validation** (author ≠ verifier) per the spec-driven Execute contract.

---

## Further Notes

- **Relationship to prior feature**: extends `admin-portal` (PR #92). The
  renderers and backend routes from that feature are the foundation; this
  feature adds the missing interactivity, styling, confirmation, and
  progress UX. No backend route signatures change except the new
  `regenerate-stream` addition.
- **Confirm-on-all-edits is a policy change** from the prior feature's
  UX-03 (destructive-only). The prior feature's spec is not amended; this
  feature's spec supersedes the confirm scope for config/profile/registry
  edits.
- **In-memory overlay state**: the registry editor needs client-side state
  tracking the accumulated overlay (cell edits, added/duplicated/deleted/
  restored profiles, hostDefaults, workflowTiers). This state is built on
  view load from `GET /api/v1/model-registry` `source.overlay` and mutated
  by the grid handlers. Save Overlay sends this state as the full overlay
  body. This matches the prior feature's shallow-merge + full-replace
  overlay contract.
- **SSE for regenerate-stream**: the new route holds the HTTP response
  open with `Content-Type: text/event-stream`, emits `data: {"type":"line","text":"..."}` 
  events for each stdout/stderr line, and a final `data: {"type":"done","exitCode":0}` 
  event. The client uses `EventSource` or `fetch` + `ReadableStream` reader. 
  Elysia supports streaming responses via `set.headers` + returning a `ReadableStream`.