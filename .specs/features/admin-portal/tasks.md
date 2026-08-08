# Admin Portal Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/admin-portal/design.md`
**Status**: Draft

---

## Project Testing Guidelines Scan

Sources inspected:
- `AGENTS.md` (repo root + `skills/AGENTS.md`): tech stack — Bun 1.3.14, TypeScript ESM strict, `bun test`, `bun run type-check`, `bun run build`, `oxlint`, `generate:artifacts --check`.
- `package.json` root: `test:scripts` (scripts + shell suites), `test:plugins`, `test:coverage`, `lint` (oxlint), `type-check` (turbo, 6 projects), `build` (turbo, 5 packages), `generate:artifacts`.
- `apps/web-ui/package.json`: `test` = `bun test`, `type-check` = `tsc --noEmit`.
- `apps/tools-api/package.json`: `test` = `bun scripts/run-tests-isolated.ts`, `type-check` = `tsc --noEmit`.
- Existing test seams: `apps/web-ui/src/__tests__/{app-renderers,write-mode,route-contract,index}.test.ts`; `apps/tools-api/src/routes/*.test.ts` (per-route, mock-store pattern); `apps/tools-api/src/routes/web-ui-contract.test.ts` (golden fixtures); `scripts/__tests__/model-profiles.test.ts`.
- CONTRIBUTING: one atomic commit per task; tests derive from spec ACs; never weaken tests to pass.
- Confirmed lesson L-001 (test-strength): UNION GUARD missing-suite path has no discriminating test — applies to any new gate: add a mock-drop test asserting exit 1 + guard FAIL.

Conventions: co-located tests under `__tests__/` sibling to source; route tests mock the store/tool and assert response shape; web-ui renderer tests feed fixtures and assert HTML output (pure functions, no DOM); contract tests pin UI↔API via golden fixtures.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec. Guidelines found: `AGENTS.md`, `package.json`, per-app `package.json`, existing test seams.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| shared config writer (`savePartialConfig`, masking, restart sections) | unit | All sections validated; bad type/enum/range rejected; masked sentinel preserved; backup created; atomic temp+rename; F2 per-section validation | `packages/shared/src/config/__tests__/config-writer.test.ts` | `bun test packages/shared/src/config/__tests__/` |
| model-profiles effective loader (`loadEffectiveRegistry`) | unit | Overlay merge (shallow per profile); tombstone removal + `source.tombstoned`; corrupted-overlay fallback + `overlayError`; validation-failure fallback | `scripts/__tests__/model-profiles.test.ts` (extend) | `bun test scripts/__tests__/model-profiles.test.ts` |
| tools-api config route | integration | GET masks sensitive + returns restartNeededSections; PUT validates + rejects 400; PUT backup + atomic; masked sentinel preserved; GET missing-config returns defaults | `apps/tools-api/src/routes/config.test.ts` (new) | `bun test apps/tools-api/src/routes/config.test.ts` |
| tools-api checkpoint delete route | integration | delete existing → 200 ok; non-existent → 404; store error → 500 | `apps/tools-api/src/routes/checkpoints.test.ts` (extend) | `bun test apps/tools-api/src/routes/checkpoints.test.ts` |
| tools-api model-registry routes | integration | GET returns merged registry + source attribution; GET overlay-corrupted 200 + overlayError; PUT validates merged → 400 on violation; PUT atomic write; DELETE removes overlay; regenerate spawns script → success/failure | `apps/tools-api/src/routes/model-registry.test.ts` (new) | `bun test apps/tools-api/src/routes/model-registry.test.ts` |
| web-ui renderers (config section, profiles, model registry grid, create forms) | unit | Each section renders correct field types; sensitive masked + reveal toggle; profiles list + active + switch button; registry grid rows=host×tier cols=profiles; overlay-sourced cells marked; tombstoned restorable; effort select constrained per host; create forms produce correct fields | `apps/web-ui/src/__tests__/{app-renderers,config-forms,registry-editor}.test.ts` (extend + new) | `bun test apps/web-ui/src/__tests__/` |
| web-ui write-mode + nav + FORBIDDEN removal | unit | F1 trusted-meta-tag fixture → isWriteModeEnabled true; env/localStorage opt-out; delete/create buttons visible when trusted; FORBIDDEN_MUTATING_PATHS export gone; viewFromHash allows config+profiles; footer text; nav items | `apps/web-ui/src/__tests__/{write-mode,route-contract,app-renderers}.test.ts` (extend) | `bun test apps/web-ui/src/__tests__/` |
| generate-subagent-artifacts read-path split | unit | F3 sensor: set overlay, run non-`--check` generation, assert regenerated file reflects overlay model; `--check` still passes with same overlay | `scripts/__tests__/model-profiles.test.ts` (extend) + live generation probe | `bun test scripts/__tests__/model-profiles.test.ts` + `bun run generate:artifacts -- --check` |
| entity/config/schema | none | build gate only (type-check + lint + generate:artifacts --check) | — | build gate |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with web-ui unit tests only | `bun test apps/web-ui/src/__tests__/` |
| Shared-config | After config-writer tasks | `bun test packages/shared/src/config/__tests__/ && bun run type-check` |
| Route | After tools-api route tasks | `bun test apps/tools-api/src/routes/config.test.ts apps/tools-api/src/routes/checkpoints.test.ts apps/tools-api/src/routes/model-registry.test.ts` |
| Scripts | After model-profiles loader tasks | `bun test scripts/__tests__/model-profiles.test.ts` |
| Build | After phase completion / config-entity tasks | `bun run type-check && bun run lint && bun run generate:artifacts -- --check` |
| Full | Before validation (all layers) | `bun run test:scripts && bun run test:plugins && bun run lint && bun run type-check && bun run generate:artifacts -- --check` |

---

## Execution Plan

Phases ordered sequentially; tasks run in order within a phase.

### Phase 1: Backend foundation (config writer + effective registry loader)

T1 → T2 → T3

### Phase 2: Backend routes (config, checkpoint delete, model-registry)

T4 → T5 → T6 → T7

### Phase 3: Frontend write-mode + nav + FORBIDDEN removal

T8 → T9

### Phase 4: Frontend views (config, profiles, registry editor, create/delete forms)

T10 → T11 → T12 → T13

### Phase 5: generate-subagent-artifacts read-path split + close-out

T14 → T15

---

## Task Breakdown

### T1: savePartialConfig + masking + restart sections (shared)

**What**: New `packages/shared/src/config/config-writer.ts` exporting `savePartialConfig(partial)`, `maskSensitive(config)`, `restartNeededSections(config)`. Reads current config via `loadConfig`, merges shallowly per top-level key (provided sections replace whole sections), runs hand-written validation guards per section, backs up to `config.json.bak.<ISO-timestamp>`, writes atomically via existing `saveConfig`. Masking replaces `security.apiKey`, `llm.apiKey`, `embedding.apiKey`, `database.url` with `"***"`. `restartNeededSections` returns the hard-coded `["database","embedding","llm","security"]` filtered to present keys. Masked-sentinel handling: a sensitive field equal to `"***"` in the partial preserves the existing value. Never called at import time.
**Where**: `packages/shared/src/config/config-writer.ts` (new)
**Depends on**: None
**Reuses**: `saveConfig` atomic (`config-loader.ts:143`), `loadConfig` shallow-merge pattern (`config-loader.ts:23`), `MassaAiConfig` + `defaultMassaAiConfig` (`massa-ai-config.ts`)
**Requirement**: CFG-02, CFG-03, CFG-04, CFG-05, CFG-06, CFG-07, CFG-09, CFG-10

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `config-writer.ts` exports `savePartialConfig`, `maskSensitive`, `restartNeededSections`
- [x] Validation rejects bad type, bad enum, out-of-range number per section (returns `details[]`, never throws on validation)
- [x] Backup file `config.json.bak.<ts>` created before write
- [x] Atomic temp+rename via existing `saveConfig`
- [x] Masked sentinel `"***"` preserves existing value
- [x] Module never reads/writes at import time
- [x] `bun test packages/shared/src/config/__tests__/` passes (new `config-writer.test.ts`: per-section validation bad-value cases, backup, atomic, masked-sentinel, restart sections)
- [x] `bun run type-check` passes

**Tests**: unit (shared config writer)
**Gate**: shared-config

---

### T2: loadEffectiveRegistry (scripts/lib)

**What**: New `loadEffectiveRegistry(opts?)` in `scripts/lib/model-profiles.ts`. Reads builtin via existing `loadRegistry`, reads overlay from `configDir("massa-ai")/model-profiles.json` if present, merges shallowly per profile (overlay profile replaces entire builtin profile; `_delete:true` tombstone removes a builtin profile), `hostDefaults`/`workflowTiers`/`tiers` replaced wholesale if present. Validates the merged result via `validateRegistry`. On overlay read/parse/validation failure: log warning, return `{ registry: builtin, source: { builtin, overlay: null, tombstoned: [] }, overlayError: "<msg>" }`. Collects tombstoned profile keys into `source.tombstoned`. Returns `{ registry, source, overlayError? }`.
**Where**: `scripts/lib/model-profiles.ts` (extend)
**Depends on**: None
**Reuses**: `loadRegistry` (`:316`), `validateRegistry` (`:158`), `configDir` from `packages/shared/src/config/xdg.ts`
**Requirement**: REG-16, REG-17

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `loadEffectiveRegistry` exported; `OverlayData` + `OverlayProfile` types exported
- [x] Overlay merge: shallow per profile; tombstone removes from effective + lists in `source.tombstoned`
- [x] Corrupted overlay JSON → builtin + `overlayError`, no throw
- [x] Validation failure on merged result → builtin + `overlayError`, no throw
- [x] Missing overlay file → `{ registry: builtin, overlay: null, tombstoned: [] }`
- [x] `bun test scripts/__tests__/model-profiles.test.ts` passes (extend: overlay merge, tombstone, corrupted fallback, validation-failure fallback)
- [x] `bun run type-check` passes

**Tests**: unit (model-profiles effective loader)
**Gate**: scripts

---

### T3: wire config-writer + effective-loader exports

**What**: Re-export `savePartialConfig`, `maskSensitive`, `restartNeededSections` from `packages/shared/src/config/index.ts` (or a subpath the tools-api route imports). Re-export `loadEffectiveRegistry` + `OverlayData`/`OverlayProfile` from `scripts/lib/model-profiles.ts` (already the export site). Ensure no import-time side effects.
**Where**: `packages/shared/src/config/index.ts` (extend), `scripts/lib/model-profiles.ts` (already done in T2)
**Depends on**: T1, T2
**Reuses**: existing export pattern
**Requirement**: CFG-02, REG-16

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `savePartialConfig`/`maskSensitive`/`restartNeededSections` importable from `@massa-ai/shared/config`
- [x] `loadEffectiveRegistry`/`OverlayData`/`OverlayProfile` importable from `scripts/lib/model-profiles.ts`
- [x] No import-time side effects (test imports the module under a scratch XDG dir)
- [x] `bun run type-check` passes

**Tests**: none (build gate — re-export only)
**Gate**: build

---

### T4: config route (GET/PUT /api/v1/config)

**What**: New `apps/tools-api/src/routes/config.ts` Elysia route. GET returns `{ success:true, data:{ config: maskSensitive(loadConfig()), restartNeededSections } }`; when config.json absent returns `defaultMassaAiConfig` masked. PUT accepts `t.Object` with optional top-level section keys; calls `savePartialConfig` → on validation failure returns 400 `{ success:false, error:"validation failed", details }`; on success returns 200 `{ success:true, data:{ config: masked, restartNeededSections } }`. Register in `apps/tools-api/src/index.ts` via `app.use(configRoutes)`.
**Where**: `apps/tools-api/src/routes/config.ts` (new), `apps/tools-api/src/index.ts` (extend — import + `.use`)
**Depends on**: T3
**Reuses**: route envelope + error pattern from `profiles.ts:68`, `authMiddleware` (already global)
**Requirement**: CFG-01, CFG-02, CFG-03, CFG-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `GET /api/v1/config` returns masked config + restartNeededSections
- [x] `GET` when config.json absent returns defaults + warning
- [x] `PUT` with valid section → 200 + updated masked config
- [x] `PUT` with invalid value → 400 + `details`
- [x] `PUT` with masked sentinel `"***"` preserves existing value
- [x] Route registered in `index.ts`
- [x] `bun test apps/tools-api/src/routes/config.test.ts` passes (new: GET masking, GET missing-config, PUT valid, PUT invalid 400, masked sentinel)
- [x] `bun run type-check` passes

**Tests**: integration (tools-api config route)
**Gate**: route

---

### T5: checkpoint delete route

**What**: Extend `apps/tools-api/src/routes/checkpoints.ts` with `POST /delete`. Body `{ id: string, projectId?: string }`. Calls the checkpoint store's `deleteCheckpoint(id)` (verified to exist at `checkpoint-store-pg.ts:358`). Returns 200 `{ success:true, data:{ ok:true } }` on mirror-hit, 404 `{ success:false, error:"not found" }` on mirror-miss, 500 on store error. Add a lazy store getter (same pattern as `getCreateCheckpointTool`). If a `DeleteCheckpointTool` is needed for MCP parity, add it to `packages/core`; otherwise call the store directly (verify reachability during this task — CHKP-05).
**Where**: `apps/tools-api/src/routes/checkpoints.ts` (extend); `packages/core` tool wrapper only if MCP parity required
**Depends on**: None
**Reuses**: lazy-tool getter pattern (`checkpoints.ts:24-43`), `deleteCheckpoint` store method
**Requirement**: CHKP-04, CHKP-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `POST /api/v1/checkpoints/delete` with existing ID → 200 `{ ok:true }`
- [x] Non-existent ID → 404 `{ error:"not found" }`
- [x] Store error → 500 `{ error }`
- [x] JSDoc notes the mirror-sync/async-durability (F4 accepted assumption)
- [x] `bun test apps/tools-api/src/routes/checkpoints.test.ts` passes (extend: delete existing, delete non-existent, delete store-error)
- [x] `bun run type-check` passes

CHKP-05 decision: store is directly reachable via `CheckpointManager.getInstance().deleteCheckpoint(id)` — no `DeleteCheckpointTool` wrapper added (MCP parity not needed for route-only access).

**Tests**: integration (checkpoint delete route)
**Gate**: route

---

### T6: model-registry routes (GET/PUT/DELETE/regenerate)

**What**: New `apps/tools-api/src/routes/model-registry.ts` Elysia route. GET calls `loadEffectiveRegistry` → `{ success:true, data:{ registry, source, overlayError? } }`. PUT accepts full overlay body; merges over builtin (via `loadEffectiveRegistry`'s merge or a shared merge helper), validates via `validateRegistry` → 400 with all violations on failure; on success writes atomically (temp+rename) to `~/.config/massa-ai/model-profiles.json` and returns updated effective registry. `POST /regenerate` spawns `bun scripts/generate-subagent-artifacts.ts` as child process (inherit env) → 200 `{ regenerated:true }` or 500 on non-zero exit. `DELETE /overlay` deletes the overlay file → returns builtin registry. Register in `index.ts`.
**Where**: `apps/tools-api/src/routes/model-registry.ts` (new), `apps/tools-api/src/index.ts` (extend)
**Depends on**: T3
**Reuses**: `loadEffectiveRegistry` (T2), `validateRegistry` (`model-profiles.ts:158`), atomic write pattern from `saveConfig`, route envelope from `profiles.ts`
**Requirement**: REG-01, REG-10, REG-11, REG-12, REG-13, REG-15, REG-16, REG-18

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] GET returns merged registry + source + `overlayError?` (200 on overlay corruption)
- [x] PUT validates merged → 400 + all violations on failure
- [x] PUT writes atomically to XDG overlay path
- [x] DELETE overlay removes the file, returns builtin registry
- [x] regenerate spawns the script, returns success/failure
- [x] Route registered in `index.ts`
- [x] `bun test apps/tools-api/src/routes/model-registry.test.ts` passes (new: GET merged + attribution, GET overlay-corrupted 200, PUT valid, PUT invalid 400, DELETE removes overlay, regenerate success/failure with mocked child_process)
- [x] `bun run type-check` passes

**Tests**: integration (model-registry routes)
**Gate**: route

---

### T7: contract test extension (web-ui-contract + route-contract)

**What**: Extend `apps/tools-api/src/routes/web-ui-contract.test.ts` with golden fixtures for config GET (masked) + model-registry GET (merged). Extend `apps/web-ui/src/__tests__/route-contract.test.ts` with rows: config view sends `GET /api/v1/config`; config save sends `PUT /api/v1/config` with section body; profiles view sends `GET /api/v1/profiles`; registry view sends `GET /api/v1/model-registry`; registry save sends `PUT /api/v1/model-registry` with overlay body.
**Where**: `apps/tools-api/src/routes/web-ui-contract.test.ts` (extend), `apps/web-ui/src/__tests__/route-contract.test.ts` (extend)
**Depends on**: T4, T6
**Reuses**: existing golden-fixture + contract-row pattern
**Requirement**: CFG-01, REG-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] web-ui-contract has config + registry golden fixtures
- [x] route-contract has config + profiles + registry rows
- [x] Both test files pass
- [x] `bun run type-check` passes

**Tests**: integration (contract)
**Gate**: route

---

### T8: isWriteModeEnabled default-ON refactor + FORBIDDEN_MUTATING_PATHS removal

**What**: Refactor `apps/web-ui/src/static/app.js` `isWriteModeEnabled()` to default ON when the `massa-ai-api-key` meta tag is present (trusted caller). Read the meta tag via `readInjectedApiKey(document)` (existing helper, `app.js:626`). `MASSA_AI_WEB_WRITE_MODE=false` env + `localStorage massa-ai-write-mode=false` remain opt-out. Remove the `FORBIDDEN_MUTATING_PATHS` export + its comment block (F5: pre-removal sweep `rg -l "FORBIDDEN_MUTATING_PATHS\|web-ui-readonly"` across the repo including generated bundles; print population in commit body). Update the file's header comment from "READ-ONLY" to "Admin portal".
**Where**: `apps/web-ui/src/static/app.js` (modify)
**Depends on**: None
**Reuses**: `readInjectedApiKey` (`app.js:626`)
**Requirement**: UX-01, UX-02, UX-11

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `isWriteModeEnabled()` returns true when meta tag present (trusted); false when env/localStorage opt-out
- [x] F1 trusted-meta-tag fixture test added to `write-mode.test.ts` (fake `document` with `massa-ai-api-key` meta → `isWriteModeEnabled()===true`); existing opt-out tests updated (default is now ON-when-trusted, not unconditionally false)
- [x] `FORBIDDEN_MUTATING_PATHS` export + comment block removed; pre-removal sweep population in commit body
- [x] Header comment updated to "Admin portal"
- [x] `bun test apps/web-ui/src/__tests__/write-mode.test.ts` passes
- [x] `bun run type-check` passes

**Tests**: unit (write-mode + FORBIDDEN removal)
**Gate**: quick

---

### T9: nav + viewFromHash + footer + index.html

**What**: Add "Config" and "Profiles" nav items after "Dashboard" in `index.html`. Extend `viewFromHash` allow-list (`app.js:693`) to include `config` + `profiles`. Update footer text to "Admin portal · served by the massa-ai Tools API". Add nav-render + view-dispatch stubs for `config` + `profiles` (renderers land in T10-T12; this task wires the nav + hash routing so the views are reachable).
**Where**: `apps/web-ui/src/static/index.html` (modify), `apps/web-ui/src/static/app.js` (modify — nav + viewFromHash + dispatch)
**Depends on**: T8
**Reuses**: existing nav + hash-routing pattern (`app.js:685-698`)
**Requirement**: UX-07, UX-08, UX-09

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] "Config" + "Profiles" nav items present after "Dashboard"
- [x] `viewFromHash` allows `config` + `profiles`
- [x] Footer text updated
- [x] Dispatch stubs route to (empty) config/profiles views without error
- [x] `bun test apps/web-ui/src/__tests__/` passes (extend route-contract / app-renderers with nav + footer assertions)
- [x] `bun run type-check` passes

**Tests**: unit (nav + routing)
**Gate**: quick

---

### T10: Config view renderer (15 sectioned forms)

**What**: New `renderConfig(data, { writeMode })` in `app.js`. Renders 15 collapsible section cards from the `GET /api/v1/config` response. Each card generated from declarative field-definition objects (one per section: field name, type [text/number/boolean/enum/string[]], label, validation). Sensitive fields masked with a reveal toggle. Sections in `restartNeededSections` show a badge. Per-section "Save" button sends only that section to `PUT /api/v1/config`.
**Where**: `apps/web-ui/src/static/app.js` (extend), `apps/web-ui/src/__tests__/config-forms.test.ts` (new)
**Depends on**: T4, T9
**Reuses**: `escapeHtml`, `createApiClient`, existing render pattern (`renderCheckpoints`)
**Requirement**: CFG-01, CFG-04, CFG-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `renderConfig` renders 15 sections with typed inputs
- [ ] Sensitive fields masked + reveal toggle works
- [ ] Restart-needed sections show a badge
- [ ] Per-section Save sends the correct partial body
- [ ] `bun test apps/web-ui/src/__tests__/config-forms.test.ts` passes (new: each section field types, sensitive masking + reveal, save partial body)
- [ ] `bun run type-check` passes

**Tests**: unit (config forms)
**Gate**: quick

---

### T11: Profiles view renderer (switcher)

**What**: New `renderProfiles(data, { writeMode })` in `app.js`. Calls `GET /api/v1/profiles`, renders available profiles with the current active profile marked, a "Switch" button per profile calling `POST /api/v1/profiles/switch`, shows per-host switch results.
**Where**: `apps/web-ui/src/static/app.js` (extend), `apps/web-ui/src/__tests__/app-renderers.test.ts` (extend)
**Depends on**: T9
**Reuses**: existing `profiles` API, render pattern
**Requirement**: PROF-01, PROF-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `renderProfiles` renders profile cards with active marked
- [ ] Switch button calls `POST /api/v1/profiles/switch`
- [ ] Per-host results rendered
- [ ] `bun test apps/web-ui/src/__tests__/app-renderers.test.ts` passes (extend: profiles render + switch button)
- [ ] `bun run type-check` passes

**Tests**: unit (profiles renderer)
**Gate**: quick

---

### T12: Model-registry editor renderer (grid + overlay + tombstone + regenerate + clear)

**What**: New `renderModelRegistry(data, overlaySource, { writeMode })` in `app.js`. Renders a grid (rows = `{host, tier}` pairs, columns = profiles, cells = `{model, effort}`). Marks overlay-sourced cells (profile key in `source.overlay.profiles`). Effort input constrained to `HOST_EFFORT_ENUM` per host (re-export from `scripts/lib/model-profiles.ts` or duplicate the map in the frontend). Supports: edit cell, add profile (name+description, init `null/null`), duplicate profile, delete profile (tombstone → restore list), restore, edit hostDefaults, edit workflowTiers, regenerate button (`POST .../regenerate`), clear-overlay button (`DELETE .../overlay` with confirm), save-overlay button (`PUT .../model-registry` with full overlay). All edits staged in an in-memory overlay model; save sends the full overlay.
**Where**: `apps/web-ui/src/static/app.js` (extend), `apps/web-ui/src/__tests__/registry-editor.test.ts` (new)
**Depends on**: T6, T9
**Reuses**: `HOST_EFFORT_ENUM` (`model-profiles.ts:71`), `escapeHtml`, `createApiClient`
**Requirement**: REG-01..REG-18 (UI side)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Grid renders all profiles as columns, `{host,tier}` as rows, cells `{model,effort}`
- [ ] Overlay-sourced cells marked
- [ ] Effort select constrained per host (`HOST_EFFORT_ENUM`)
- [ ] Add/duplicate/delete/restore profile flows work
- [ ] hostDefaults + workflowTiers editable
- [ ] Regenerate + clear-overlay + save-overlay buttons present and wired
- [ ] `bun test apps/web-ui/src/__tests__/registry-editor.test.ts` passes (new: grid render, overlay mark, effort constraint, add/duplicate/delete/restore, save full overlay)
- [ ] `bun run type-check` passes

**Tests**: unit (registry editor)
**Gate**: quick

---

### T13: Create/delete forms for existing CRUD APIs (memory, handoff, checkpoint, project)

**What**: Add create-form renderers + delete-button handlers in `app.js` for the existing CRUD APIs: memory create (content/type/importance/tags/projectId) → `POST /memory/store`; handoff create (projectId/summary/targetAgent/openQuestions/nextSteps/files) → `POST /handoff/begin`; checkpoint create (taskId/description/status/progress/...) → `POST /checkpoints/create`; project index (projectPath/projectId/forceReindex/warmCache) → `POST /project/index`; memory delete (confirm) → `POST /memory/delete`; handoff cancel (confirm) → `POST /handoff/cancel`; checkpoint delete (confirm) → `POST /checkpoints/delete`; project reset (confirm + clearVectors/Symbols/Memories) → `POST /project/reset`; proposal approve/reject → existing buttons. All gated by `isWriteModeEnabled()` and confirm dialogs on destructive ops.
**Where**: `apps/web-ui/src/static/app.js` (extend), `apps/web-ui/src/__tests__/app-renderers.test.ts` + `write-mode.test.ts` (extend)
**Depends on**: T5, T8
**Reuses**: existing `createApiClient`, `renderMemoryBrowser`/`renderProposals` button pattern, existing CRUD APIs
**Requirement**: MEM-02, MEM-04, PROJ-02, PROJ-04, HAND-02, HAND-04, CHKP-02, CHKP-04, PROP-02, PROP-03, UX-03, UX-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Create forms render correct fields for memory/handoff/checkpoint/project
- [ ] Delete buttons render when write-mode on (memory/handoff/checkpoint)
- [ ] Destructive ops show `confirm()` dialog naming entity + action
- [ ] Success/error feedback after each write; view refreshes
- [ ] `bun test apps/web-ui/src/__tests__/` passes (extend app-renderers + write-mode: create-form fields, delete buttons visible when trusted, confirm gating)
- [ ] `bun run type-check` passes

**Tests**: unit (create/delete forms)
**Gate**: quick

---

### T14: generate-subagent-artifacts read-path split + F3 sensor

**What**: Update `scripts/generate-subagent-artifacts.ts` to switch its runtime registry read from `loadRegistry` (builtin only) to `loadEffectiveRegistry().registry`. Keep the `--check` path on `loadRegistry` (builtin alone) so the build gate still validates the shipped builtin. F3 sensor test: set an overlay, run non-`--check` generation in a scratch dir, assert a regenerated file reflects the overlay model; `--check` still passes with the same overlay present.
**Where**: `scripts/generate-subagent-artifacts.ts` (modify), `scripts/__tests__/model-profiles.test.ts` (extend) or a new generate-path probe
**Depends on**: T2
**Reuses**: `loadEffectiveRegistry` (T2), existing `--check` path
**Requirement**: REG-13, REG-18 (generate-side)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Runtime generation (non-`--check`) reads `loadEffectiveRegistry().registry`
- [ ] `--check` path still reads `loadRegistry` (builtin alone)
- [ ] F3 sensor: overlay present → regenerated file reflects overlay model; `--check` passes with overlay present
- [ ] `bun run generate:artifacts -- --check` exit 0
- [ ] `bun test scripts/__tests__/model-profiles.test.ts` passes
- [ ] `bun run type-check` passes

**Tests**: unit (generate read-path split)
**Gate**: build

---

### T15: close-out — CHANGELOG + state + FEATURES.json

**What**: Add CHANGELOG entry under [Unreleased] ### Added (admin portal). Update `.specs/project/STATE.md` (Current section), `.specs/HANDOFF.md`, `.specs/project/FEATURES.json` (status → complete, phases). Run `bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal --root .` (must exit 0 before PR). Commit all on the branch.
**Where**: `CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`, `.specs/project/FEATURES.json`
**Depends on**: T1-T14
**Reuses**: established close-out pattern
**Requirement**: (delivery)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] CHANGELOG entry added
- [ ] STATE.md Current section updated (admin portal)
- [ ] HANDOFF.md updated
- [ ] FEATURES.json status → complete, phases marked
- [ ] `bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal --root .` exit 0
- [ ] Committed on `spec/admin-portal`

**Tests**: none (close-out)
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T4 ──→ T5 ──→ T6 ──→ T7
Phase 3:  T8 ──→ T9
Phase 4:  T10 ──→ T11 ──→ T12 ──→ T13
Phase 5:  T14 ──→ T15
```

Execution is strictly sequential — no intra-phase parallelism. One agent (or batch worker) works one task at a time, in order.

**Packing:** 15 tasks across 5 phases. Phase 1 = 3 tasks; Phase 2 = 4 tasks; Phase 3 = 2 tasks; Phase 4 = 4 tasks; Phase 5 = 2 tasks. At ~7-task worker budget, this packs to ~2-3 batch workers (e.g. Batch A = Phases 1-2 = 7 tasks; Batch B = Phases 3-4 = 6 tasks; Batch C = Phase 5 = 2 tasks + close-out). The sub-agent offer fires because the feature has >3 tasks.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: savePartialConfig + masking + restart sections | 1 module (3 functions) | ✅ Granular (cohesive) |
| T2: loadEffectiveRegistry | 1 function (extend 1 file) | ✅ Granular |
| T3: wire exports | 1 re-export | ✅ Granular |
| T4: config route | 1 route module + registration | ✅ Granular |
| T5: checkpoint delete route | 1 route extension | ✅ Granular |
| T6: model-registry routes | 1 route module + registration | ✅ Granular |
| T7: contract test extension | 2 test files extended | ✅ Granular (cohesive) |
| T8: write-mode refactor + FORBIDDEN removal | 1 file modify | ✅ Granular |
| T9: nav + viewFromHash + footer + index.html | 2 files (nav+routing) | ✅ Granular (cohesive) |
| T10: Config view renderer | 1 renderer + tests | ✅ Granular |
| T11: Profiles view renderer | 1 renderer + tests | ✅ Granular |
| T12: Model-registry editor renderer | 1 renderer + tests | ✅ Granular |
| T13: create/delete forms | 1 file (forms+handlers) | ✅ Granular (cohesive) |
| T14: generate read-path split + F3 sensor | 1 script modify + sensor | ✅ Granular |
| T15: close-out | docs/state artifacts | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (none) | ✅ Match |
| T2 | None | (none) | ✅ Match |
| T3 | T1, T2 | T1→T3, T2→T3 | ✅ Match |
| T4 | T3 | T3→T4 | ✅ Match |
| T5 | None | (none) | ✅ Match |
| T6 | T3 | T3→T6 | ✅ Match |
| T7 | T4, T6 | T4→T7, T6→T7 | ✅ Match |
| T8 | None | (none) | ✅ Match |
| T9 | T8 | T8→T9 | ✅ Match |
| T10 | T4, T9 | T4→T10, T9→T10 | ✅ Match |
| T11 | T9 | T9→T11 | ✅ Match |
| T12 | T6, T9 | T6→T12, T9→T12 | ✅ Match |
| T13 | T5, T8 | T5→T13, T8→T13 | ✅ Match |
| T14 | T2 | T2→T14 | ✅ Match |
| T15 | T1-T14 | all→T15 | ✅ Match |

No task depends on a later phase. ✅

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | shared config writer | unit | unit | ✅ OK |
| T2 | model-profiles loader | unit | unit | ✅ OK |
| T3 | re-export | none (build gate) | none | ✅ OK |
| T4 | tools-api config route | integration | integration | ✅ OK |
| T5 | checkpoint delete route | integration | integration | ✅ OK |
| T6 | model-registry routes | integration | integration | ✅ OK |
| T7 | contract tests | integration | integration | ✅ OK |
| T8 | web-ui write-mode + FORBIDDEN | unit | unit | ✅ OK |
| T9 | web-ui nav + routing | unit | unit | ✅ OK |
| T10 | config view renderer | unit | unit | ✅ OK |
| T11 | profiles renderer | unit | unit | ✅ OK |
| T12 | registry editor renderer | unit | unit | ✅ OK |
| T13 | create/delete forms | unit | unit | ✅ OK |
| T14 | generate read-path split | unit (scripts) | unit | ✅ OK |
| T15 | docs/state | none | none | ✅ OK |

No `Tests: none` violates the matrix. ✅

---

## Requirement Coverage

| Requirement ID | Task(s) |
| --- | --- |
| MEM-01,03 | (existing UI views — T13 wiring) |
| MEM-02,04 | T13 |
| PROJ-01,03,05,06 | (existing UI views) |
| PROJ-02,04 | T13 |
| HAND-01,03 | (existing UI views) |
| HAND-02,04 | T13 |
| PROP-01 | (existing UI views) |
| PROP-02,03 | T13 |
| CHKP-01,03 | (existing UI views) |
| CHKP-02 | T13 |
| CHKP-04 | T5, T13 |
| CHKP-05 | T5 |
| CFG-01..10 | T1, T4, T10 |
| PROF-01,02 | T11 |
| REG-01..18 | T2, T6, T12, T14 |
| UX-01..11 | T8, T9, T13 |

Coverage: 61/61 requirements mapped to tasks. 0 unmapped.