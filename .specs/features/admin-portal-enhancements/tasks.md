# Admin Portal Enhancements — Tasks

Slug: `admin-portal-enhancements`. Branch: `spec/admin-portal-enhancements`.
Spec: `.specs/features/admin-portal-enhancements/spec.md`.
Design: `.specs/features/admin-portal-enhancements/design.md`.

## Execution Plan

3 Phases = 9 Tasks. Inline execution (sub-agents unavailable this session).

- Phase 1 (Backend): T1-T2 — new streaming regenerate route + registration.
- Phase 2 (Frontend): T3-T8 — CSS styling, handlers, confirm flow, banners,
  tab switcher, in-memory overlay state, streaming regenerate, index progress.
- Phase 3 (Close-out): T9 — full gate matrix + state artifacts + CHANGELOG.

Dependencies: T2 depends on T1 (register the route T1 creates). T4-T8 depend
on T3 (CSS classes must exist before handlers render into them — though
handlers work without CSS, tests assert classes). T7 depends on T1 (streaming
route must exist). T9 depends on all.

## Task Breakdown

### Phase 1 — Backend (streaming route + registration)

### T1: New `model-registry-stream.ts` route

Where: `apps/tools-api/src/routes/model-registry-stream.ts` (new), `apps/tools-api/src/routes/model-registry-stream.test.ts` (new)

- [x] Create `apps/tools-api/src/routes/model-registry-stream.ts` with a single
  `POST /regenerate-stream` route that:
  - Sets `Content-Type: text/event-stream` + `X-Accel-Buffering: no`.
  - Uses `child_process.spawn("bun", [GENERATE_SCRIPT], { env: { ...process.env }, stdio: ["pipe","pipe","pipe"] })`.
  - Pipes stdout/stderr line-by-line as `data: {"type":"line","stream":"stdout|stderr","text":"..."}\n\n`.
  - On `child.on("close", code)`, emits `data: {"type":"done","exitCode":code}\n\n` and ends.
  - On spawn error, emits `data: {"type":"done","exitCode":null,"error":"..."}\n\n` and ends.
  - Reuses the `GENERATE_SCRIPT` path + `profilesLib()` lazy pattern from `model-registry.ts`.
  - **F1 fold:** Follow the exact `events.ts` pattern: `return new Response(new ReadableStream({ start, cancel }), { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" } })`. Do NOT use `set.headers` for streaming. The `cancel` hook must `child.kill()` so a client disconnect does not orphan the spawn.
- [x] Create `apps/tools-api/src/routes/model-registry-stream.test.ts`:
  - Mock `spawn` to emit a stdout line, a stderr line, then close with exit 0 → assert SSE chunks.
  - Mock `spawn` to error → assert `done` with `exitCode:null,error`.
  - Assert the existing blocking `/regenerate` route is unchanged (REGEN-SSE-08).

Tests: `apps/tools-api/src/routes/model-registry-stream.test.ts` (SSE chunk shape, spawn failure, blocking route preserved)

Gate: `bun test apps/tools-api/src/routes/model-registry-stream.test.ts`

### T2: Register streaming route + type-check

Where: `apps/tools-api/src/index.ts` (existing, one-line import + `.use()`)

Depends on: T1

- [x] Verify `apps/tools-api/src/index.ts` imports and `.use()`s the new route.
- [x] Run `bun run type-check` (6 tsc projects) — must be green.
- [x] Run `bun run test:plugins` — must be green (no plugin regression).

Tests: `bun run type-check` (6 tsc projects green); `bun run test:plugins` (no regression)

Gate: `bun run type-check && bun run test:plugins`

### Phase 2 — Frontend (handlers, styling, confirm, banners, progress, tabs)

### T3: CSS design system extension

Where: `apps/web-ui/src/static/styles.css` (existing, append-only)

- [x] Append to `apps/web-ui/src/static/styles.css`:
  - `.config-section`, `.config-section-header`, `.config-fields`, `.config-field`, `.save-btn`, `.reveal-btn` (DS-01).
  - `.profile-host`, `.profile-cards`, `.profile-card`, `.switch-btn` (DS-02).
  - `.registry-grid`, `.registry-cell`, `.overlay-sourced`, `.cell-empty`, `.registry-actions`, `.registry-action-buttons`, `.registry-hostDefaults`, `.registry-workflowTiers`, `.tombstoned`, `.tombstoned-item`, `.overlay-badge` (DS-03).
  - `.success` (green-tinted, matches `.error` shape) + dark-mode override (DS-04).
  - `.tab-switcher`, `.tab` (DS-05).
  - `.regenerate-log` (monospace, `--bg-code`, max-height, overflow-y) (DS-06).
  - `.index-progress` (DS-07).
  - `.badge` base + `.restart-badge` (amber), `.active-badge` (green) variants.
  - All rules use existing CSS variables; no hardcoded colors. **F5 fold:** Define `--accent-tint: rgba(37, 99, 235, 0.08)` in `:root` and `--accent-tint: rgba(96, 165, 250, 0.12)` in `[data-theme="dark"]`; use `background: var(--accent-tint)` as the baseline rule for `.overlay-sourced` (static rgba IS the rule, `color-mix` is optional progressive enhancement).
- [x] Verify no existing CSS rule is overridden destructively (append-only).

Tests: `bun test apps/web-ui` (existing renderer tests assert classes in HTML, not CSS rules — must remain green)

Gate: `bun test apps/web-ui`

### T4: Status banner helper + config handlers

Where: `apps/web-ui/src/static/app.js` (existing, extend `wireViewHandlers`), `apps/web-ui/src/__tests__/admin-handlers.test.ts` (new)

Depends on: T3

- [x] Add `showBanner(type, message)` to `app.js`: clears prior banner, inserts `.success` or `.error` div at top of `#app`, auto-hides success after 6s.
- [x] Add `handleConfigSave(section)` handler: `confirm(...)` → collect fields → `buildConfigSectionBody` → PUT `/api/v1/config` → banner on result → re-render on success.
  - Collect field values: `root.querySelectorAll('[data-section="' + section + '"]')` → read each `[data-field]` + `[data-type]`.
  - On 400, parse `data.details` and list all in the error banner.
  - On cancel, no-op (form retains edits).
- [x] Add `handleConfigReveal(targetId)` handler: toggle `input.type` between `password` and `text`.
- [x] Wire both in `wireViewHandlers()`: `root.querySelectorAll('[data-action="config-save"]')` and `[data-action="config-reveal"]`.
- [x] Test `apps/web-ui/src/__tests__/admin-handlers.test.ts`:
  - Config save: mock confirm → true, mock `api.request` → success, assert PUT called with body containing the section.
  - Config save 400: mock → 400 with details, assert `.error` banner contains all details.
  - Config save cancel: mock confirm → false, assert no `api.request` call.
  - Config reveal: simulate toggle, assert `input.type` changes.

Tests: `apps/web-ui/src/__tests__/admin-handlers.test.ts` (save confirm, PUT body, 400 details banner, cancel no-op, reveal toggle)

Gate: `bun test apps/web-ui`

### T5: Profiles tab switcher + switch handler

Where: `apps/web-ui/src/static/app.js` (existing, extend `renderProfiles` + `wireViewHandlers`), `apps/web-ui/src/__tests__/admin-handlers.test.ts` (extend)

Depends on: T3

- [x] Add `state.profilesTab` (default `"switch"`), loaded from `localStorage massa-ai-profiles-tab`.
- [x] Extend `renderProfiles` (or add a wrapper) to emit a `.tab-switcher` with two `.tab` buttons; render the switcher sub-view or the registry sub-view based on `state.profilesTab`.
- [x] Wire tab clicks in `wireViewHandlers()`: set `state.profilesTab`, persist to localStorage, re-render.
- [x] Add `handleProfileSwitch(profile, host)` handler: `confirm(...)` → POST `/api/v1/profiles/switch` with `{ profile, host }` → banner with per-host results → re-render.
  - On error, banner shows error code + message.
- [x] Wire `[data-action="profile-switch"]` in `wireViewHandlers()`.
- [x] Test in `admin-handlers.test.ts`:
  - Tab switcher renders both tabs; clicking "Edit Registry" sets `state.profilesTab="registry"`.
  - Tab persists in localStorage.
  - Profile switch: mock confirm → true, mock POST → success with per-host results, assert banner shows results.
  - Profile switch cancel: mock confirm → false, assert no POST.

Tests: `apps/web-ui/src/__tests__/admin-handlers.test.ts` (tab switch, persist, switch confirm, per-host banner, cancel)

Gate: `bun test apps/web-ui`

### T6: Registry in-memory overlay state + CRUD + save/clear handlers

Where: `apps/web-ui/src/static/app.js` (existing, extend `wireViewHandlers` + new state), `apps/web-ui/src/__tests__/admin-handlers.test.ts` (extend)

Depends on: T3

- [x] Add `state.registryOverlay` (init from `source.overlay` on registry view load), `state.registryDirty`.
  - **F2 fold:** Do NOT re-initialize `state.registryOverlay` on every render — only on first load or after a successful Save/Clear. Add `state.registryLoaded` guard. Add a `beforeunload` handler when `state.registryDirty` is true that prompts "You have unsaved registry changes. Leave anyway?".
- [x] Wire cell edits (`registry-model`, `registry-effort`) on `change` event → update `state.registryOverlay.profiles[profile].hosts[host][tier]` → set `registryDirty=true` → update unsaved indicator.
- [x] Wire `registry-hostDefault` / `registry-workflowTier` on `change` → update overlay → dirty.
- [x] Add `handleRegistryAddProfile()`: `prompt` for name + description → init profile with null model/effort for all {host,tier} → add to overlay → re-render.
- [x] Add `handleRegistryDuplicateProfile()`: `prompt` for new name → copy selected profile's grid → add → re-render.
- [x] Add `handleRegistryDeleteProfile()`: `prompt` for name → set `_delete:true` → re-render (moves to tombstoned).
- [x] Wire `registry-restore` → remove `_delete` → re-render.
- [x] Add `handleRegistrySaveOverlay()`: `confirm(...)` → PUT `state.registryOverlay` → on success: banner + reset `registryDirty=false` + re-render with new source; on 400: banner with all violations.
- [x] Add `handleRegistryClearOverlay()`: `confirm(...)` → DELETE `/api/v1/model-registry/overlay` → banner → re-render with builtin.
- [x] Wire all in `wireViewHandlers()`.
- [x] Add unsaved-changes indicator to `renderModelRegistry` output (or a wrapper) when `state.registryDirty`.
- [x] **F6 fold (mid-task gate):** after wiring cell edits + add/duplicate/delete/restore (in-memory mutations), run `bun test apps/web-ui/src/__tests__/admin-handlers.test.ts` for those cases BEFORE wiring save/clear. Checkpoint within the task.
- [x] Test in `admin-handlers.test.ts`:
  - Cell edit updates `state.registryOverlay` + sets dirty.
  - Add profile: mock prompt → name, assert profile added to overlay + grid.
  - Delete profile: mock prompt → name, assert `_delete:true` set + profile in tombstoned.
  - Restore: assert `_delete` removed.
  - Save overlay: mock confirm → true, mock PUT → success, assert PUT body = overlay, dirty reset.
  - Save 400: mock → violations, assert banner lists all.
  - Clear overlay: mock confirm → true, mock DELETE → success, assert re-render with builtin.
  - Cancel cases: confirm → false, assert no request.

Tests: `apps/web-ui/src/__tests__/admin-handlers.test.ts` (cell edit dirty, add/dup/delete/restore, save PUT + dirty reset, save 400, clear DELETE, cancel cases, unsaved indicator)

Gate: `bun test apps/web-ui`

### T7: Registry regenerate streaming handler

Where: `apps/web-ui/src/static/app.js` (existing, extend `wireViewHandlers` + new handler), `apps/web-ui/src/__tests__/admin-handlers.test.ts` (extend)

Depends on: T1, T3

- [ ] Add `handleRegistryRegenerate()` handler: `confirm(...)` → if confirmed:
  - Set `state.regenerating=true`; disable button; set label "regenerating…".
  - Show `.regenerate-log` panel.
  - `fetch("/api/v1/model-registry/regenerate-stream", { method:"POST", headers:{...,"content-type":"application/json"} })`.
  - Read `response.body` as `ReadableStream`; decode chunks; split on `\n\n`; parse `data: {...}` JSON.
  - `type:"line"` → append text to log panel.
  - `type:"done"` → success banner (exitCode 0) or failure banner (non-zero/null + error) → re-enable button → re-render.
  - On fetch error → error banner → re-enable.
  - Guard with `state.regenerating` to prevent double-trigger.
- [ ] Wire `[data-action="registry-regenerate"]` in `wireViewHandlers()`.
- [ ] Test in `admin-handlers.test.ts`:
  - Confirm → true: mock `fetch` returning a `ReadableStream` with a line event + done event → assert log panel updated + success banner.
  - Confirm → true: mock `fetch` returning done with exitCode 1 → assert failure banner.
  - Confirm → false: assert no fetch.
  - Spawn failure: mock `fetch` returning done with exitCode null + error → assert failure banner.

Tests: `apps/web-ui/src/__tests__/admin-handlers.test.ts` (confirm, line streaming, done success, done failure, cancel, spawn failure, button disable)

Gate: `bun test apps/web-ui`

### T8: Project index progress

Where: `apps/web-ui/src/static/app.js` (existing, extend `handleProjectIndex` + `renderProjects` + SSE block), `apps/web-ui/src/__tests__/admin-handlers.test.ts` (extend)

Depends on: T3

- [ ] Extend `handleProjectIndex()`: after POST returns `jobId`, set `state.indexJobId` + `state.indexJobStatus="pending"`; re-render.
- [ ] Extend `renderProjects()` to prepend a `.index-progress` line when `state.indexJobId` is set (jobId, status badge, phase, file count).
- [ ] Extend the SSE `es.onmessage` block: if `data.type==="index_status"` and `data.jobId===state.indexJobId`, update `state.indexJobStatus/Phase/FileCount` and re-render (if current view is projects).
- [ ] Add polling fallback: if `EventSource` unavailable or on `es.onerror`, start `setInterval(2000)` calling `GET /api/v1/project/index/status/<jobId>`; update state; stop on `completed`/`failed`; cap at 150 polls (5 min).
  - **F4 fold:** Store the interval ID in `state.indexPollInterval`. Clear it in three places: (1) on terminal status; (2) at the top of `render()` when `state.view !== "projects"`; (3) on `beforeunload`.
- [ ] On `completed`: refresh project list.
- [ ] On `failed`: progress line shows "failed" + error.
- [ ] Test in `admin-handlers.test.ts`:
  - Index submit returns jobId → assert `.index-progress` line in rendered Projects.
  - Simulate `index_status` SSE event with matching jobId → assert progress updates.
  - Simulate `index_status` with different jobId → assert ignored.
  - Poll fallback: mock EventSource unavailable, mock status poll → assert interval calls status endpoint, stops on completed.

Tests: `apps/web-ui/src/__tests__/admin-handlers.test.ts` (jobId progress line, SSE matching jobId, SSE mismatch ignored, poll fallback, completed refresh, failed error)

Gate: `bun test apps/web-ui`

### Phase 3 — Integration + close-out

### T9: Full gate matrix + state artifacts

Where: `.specs/project/STATE.md`, `.specs/project/FEATURES.json`, `.specs/HANDOFF.md`, `CHANGELOG.md`

Depends on: T1, T2, T3, T4, T5, T6, T7, T8

- [ ] Run `bun run test:scripts` (all web-ui + tools-api + scripts tests) — green.
- [ ] Run `bun run lint` (oxlint) — exit 0.
- [ ] Run `bun run type-check` (6 tsc projects) — green.
- [ ] Run `bun run test:plugins` — green.
- [ ] Update `.specs/project/STATE.md` — move `admin-portal` to Previous, add `admin-portal-enhancements` as Current.
- [ ] Update `.specs/project/FEATURES.json` — add `admin-portal-enhancements` entry, set `active_feature`.
- [ ] Update `.specs/HANDOFF.md`.
- [ ] Update `CHANGELOG.md` under `[Unreleased]` → `### Added` (streaming regenerate route, confirm-on-all-edits, success/failure banners, index progress, registry sub-tab, design-system styling).
- [ ] Run `bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal-enhancements --root .` — exit 0.

Tests: full gate matrix (test:scripts, lint, type-check, test:plugins) + check_specs_delivered exit 0

Gate: `bun run test:scripts && bun run lint && bun run type-check && bun run test:plugins && bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal-enhancements --root .`

---

## Test Coverage Matrix

| Requirement ID | Test file | Test case |
| --- | --- | --- |
| CFG-SAVE-01 | admin-handlers.test.ts | confirm dialog shown before PUT |
| CFG-SAVE-02 | admin-handlers.test.ts | PUT called with section body on confirm |
| CFG-SAVE-03 | admin-handlers.test.ts | success banner + re-render on 200 |
| CFG-SAVE-04 | admin-handlers.test.ts | error banner lists all details on 400 |
| CFG-SAVE-05 | admin-handlers.test.ts | error banner on 500/network |
| CFG-SAVE-06 | admin-handlers.test.ts | reveal toggles input type |
| CFG-SAVE-07 | config-forms.test.ts (existing) | form pre-populated from GET |
| CFG-SAVE-08 | admin-handlers.test.ts | cancel preserves edits (no PUT) |
| PROFTAB-01 | admin-handlers.test.ts | tab switcher renders two tabs |
| PROFTAB-02 | admin-handlers.test.ts | switch profile tab renders switcher |
| PROFTAB-03 | admin-handlers.test.ts | registry tab renders registry |
| PROFTAB-05 | admin-handlers.test.ts | tab persists in localStorage |
| PROFSW-01 | admin-handlers.test.ts | confirm before switch |
| PROFSW-02 | admin-handlers.test.ts | POST switch on confirm |
| PROFSW-03 | admin-handlers.test.ts | success banner with per-host results |
| PROFSW-04 | admin-handlers.test.ts | error banner on switch error |
| REGWIRE-01 | admin-handlers.test.ts | cell edit updates overlay + dirty |
| REGWIRE-02 | admin-handlers.test.ts | hostDefault/workflowTier edit updates overlay |
| REGWIRE-03 | admin-handlers.test.ts | add profile via prompt |
| REGWIRE-04 | admin-handlers.test.ts | duplicate profile via prompt |
| REGWIRE-05 | admin-handlers.test.ts | delete sets _delete + tombstoned |
| REGWIRE-06 | admin-handlers.test.ts | restore removes _delete |
| REGWIRE-07 | admin-handlers.test.ts | save confirm dialog |
| REGWIRE-08 | admin-handlers.test.ts | PUT overlay on confirm |
| REGWIRE-09 | admin-handlers.test.ts | save success banner + dirty reset |
| REGWIRE-10 | admin-handlers.test.ts | save 400 violations banner |
| REGWIRE-11 | admin-handlers.test.ts | clear confirm dialog |
| REGWIRE-12 | admin-handlers.test.ts | clear DELETE on confirm |
| REGWIRE-13 | admin-handlers.test.ts | unsaved indicator when dirty |
| REGEN-SSE-01 | admin-handlers.test.ts | confirm before regenerate |
| REGEN-SSE-02 | admin-handlers.test.ts | fetch regenerate-stream on confirm |
| REGEN-SSE-03 | model-registry-stream.test.ts | server spawn + SSE chunks |
| REGEN-SSE-04 | admin-handlers.test.ts | live log panel updates |
| REGEN-SSE-05 | admin-handlers.test.ts | terminal banner (success/failure) |
| REGEN-SSE-06 | admin-handlers.test.ts | button disabled while running |
| REGEN-SSE-07 | model-registry-stream.test.ts | spawn failure → done with error |
| REGEN-SSE-08 | model-registry-stream.test.ts | blocking route unchanged |
| PRG-01 | admin-handlers.test.ts | jobId progress line |
| PRG-02 | admin-handlers.test.ts | SSE update for matching jobId |
| PRG-03 | admin-handlers.test.ts | poll fallback when SSE unavailable |
| PRG-04 | admin-handlers.test.ts | completed → refresh project list |
| PRG-05 | admin-handlers.test.ts | failed → error in progress line |
| PRG-06 | admin-handlers.test.ts | reindex tracks new jobId |
| DS-01 | config-forms.test.ts (existing) | config classes present in HTML |
| DS-02 | app-renderers.test.ts (existing) | profile classes present in HTML |
| DS-03 | registry-editor.test.ts (existing) | registry classes present in HTML |
| DS-04 | admin-handlers.test.ts | success + error banner classes present |
| DS-05 | admin-handlers.test.ts | tab switcher classes present |
| DS-06 | admin-handlers.test.ts | regenerate-log class present |
| DS-07 | admin-handlers.test.ts | index-progress class present |

---

## Gate Check Commands

```bash
bun run test:scripts
bun run lint
bun run type-check
bun run test:plugins
bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal-enhancements --root .
```