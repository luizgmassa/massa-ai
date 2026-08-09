# Admin Portal UX Overhaul Specification

- **Feature name**: Admin Portal UX Overhaul
- **Slug**: `admin-portal-ux-overhaul`
- **Workflow session**: `spec-admin-portal-ux-overhaul` · workflow: spec-driven (Large)
- **Branch**: `spec/admin-portal-ux-overhaul` from `main` @ v1.43.0 (`b1831197`), worktree
  `/Users/luizmassa/Projects/massa-ai-wt-admin-portal-ux-overhaul`

## Problem Statement

The admin portal (apps/web-ui, served at `/ui`) exposes the model registry and admin
surfaces with internal vocabulary (overlay, tombstoned, Host Defaults, Edit Registry),
browser `prompt()` popups, unstyled/piled-up controls, and a registry grid that merges
tool + tier into one header cell. There is also no way to change an agent's capability
tier per tool — the only knob is the charter default, which is uniform across all four
hosts. The operator (repo owner, solo local user) asked for nine concrete changes,
resolved into the requirements below.

## Decisions Confirmed With The User (2026-08-09)

| Decision | Chosen |
| --- | --- |
| Item 1 semantics | **Tier per agent × tool** — 17 agent rows × 4 tool columns, tier dropdown per cell, stored as a user-overlay override; charters keep the defaults |
| Item 4 naming | **Plain-English, keep "profile"** — Scheme A (see Nomenclature Map below) |
| Item 9 provider | **Two fields, join on save** — registry keeps one model string; UI splits/joins `provider/model` on first `/` |
| Item 6 depth | **Fix the listed pain points** — targeted pass; current layout and CSS architecture kept |

## Goals

- [ ] Per-agent per-tool tier overrides editable in the UI, applied at artifact regeneration.
- [ ] Model Catalog grid readable: Tool and Tier as separate leading columns, provider/model
      split per cell, hints in every editable string field.
- [ ] One Save & Apply action replacing Save Overlay + Regenerate Artifacts, ending with a
      restart-your-CLIs warning.
- [ ] Plain-English nomenclature across the Models (ex-Profiles) tab.
- [ ] `prompt()` popups replaced with dropdown-driven inline forms.
- [ ] Projects, Checkpoints, Dashboard, Config, Models tabs styled consistently with
      rewritten help sections.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Full visual redesign (sidebar nav, modals-everywhere, toasts, design system) | User chose targeted fixes; layout + CSS architecture kept |
| Registry schema v2 with a real `provider` key per cell | User chose join-on-save; single model string stays the storage format |
| New backend delete-project endpoint | `POST /api/v1/project/reset` with default flags already removes vectors + keywords + workspace + memories; the project vanishes from the list. Label change only |
| Renaming CLI/MCP vocabulary (`profile_list`, `profile_set`, `MASSA_AI_MODEL_PROFILE`, `massa-ai-config profile ...`) | UI-label change only; command surface is a public compatibility surface |
| Hash-route renames (`#/profiles` etc.) | Bookmarks/tests bind to routes; labels change, routes do not |
| Polish of Memory / Search / Handoffs / Proposals tabs | User listed Projects, Checkpoints, Dashboard, Config, Profile(Models); shared CSS improvements may land incidentally but are not acceptance-gated |
| Per-agent MODEL overrides (naming a model per agent) | Registry principle: tier is the per-agent knob; model comes from tier × host × profile |
| Editing charter `metadata.model_tier` defaults from the UI | Charters are git-tracked product source; overrides live in the user overlay |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Provider on Claude/Codex cells | Allowed but hinted against (hint says leave blank); no hard client/server block | Registry validation stays string-based; massa-ai's join responsibility is discharged by the hint + docs; a hard block would need per-host provider knowledge the schema does not carry | y (implied by join-on-save choice) |
| Model string with multiple `/` | Split on FIRST `/` only for display; join preserves the remainder | OpenCode ids are `provider/rest`; deeper paths stay intact | n (assumption) |
| Stale `agentTiers` agent name (charter deleted later) | Generator logs one warn line naming the agent and ignores the entry; regeneration continues | User-overlay data must not hard-fail the build; a warn is not silent | n (assumption) |
| "Reset to default" in the per-agent table | Selecting the `(default)` option removes the override key from the overlay (absent = inherit charter tier) | Matches D-1 delta semantics: absent key inherits; builtin `agentTiers` is `{}` so no `null` tombstone is needed | n (assumption) |
| Nav label | "Profiles" → "Models"; route `#/profiles` unchanged | Route is a compatibility surface; label is not | y (Scheme A) |
| Save & Apply partial failure | If overlay save succeeds but regenerate fails, the UI reports "changes saved, apply failed" and offers pressing Save & Apply again (idempotent) | PUT overlay is idempotent; regenerate is idempotent; no rollback needed | n (assumption) |
| Projects "Files" column value | Keep the existing `documentCount ?? docCount` value under the new "Files" header | The list endpoint exposes this count; renaming the header is the user request | n (assumption) |
| `agentTiers` placement | New optional top-level registry section (like `workflowTiers`), builtin ships `{}` | Keeps the "no agent list in the registry" principle for defaults — overrides are opt-in user data, not a second source of truth for charter defaults | n (assumption) |

**Open questions:** none — all resolved or logged above.

## Nomenclature Map (APUX-07, Scheme A)

| Current | New |
| --- | --- |
| Nav tab "Profiles" | "Models" |
| Sub-tab "Switch Profile" | "Active Profile" |
| Sub-tab "Edit Registry" | "Model Catalog" |
| H2 "Model Registry" | "Model Catalog" |
| "host / tier" merged row header | "Tool" column + "Tier" column |
| "Host Defaults" | "Default Profile per Tool" |
| "Workflow Tiers" | "Per-Workflow Tier Overrides" |
| (new section) | "Per-Agent Tier Overrides" |
| "overlay" badge / "Overlay is overriding N entries" | "override" badge / "You have N custom overrides of the built-in defaults." |
| "Save Overlay" + "Regenerate Artifacts" | single "Save & Apply" |
| "Reset to Built-in (clear overlay)" | "Discard All Overrides" |
| "Deleted (restorable)" / tombstoned | "Removed Profiles (restorable)" |
| hosts (user-facing prose) | "tools" |

Internal identifiers (`data-action` values, state keys, API routes, registry JSON keys)
keep their names — only user-visible text changes, plus new `data-action`s for new controls.

---

## User Stories

### P1-A: Per-Agent Tier Overrides ⭐ MVP

**User Story**: As the operator, I want to change each agent's capability tier per tool so
that e.g. `builder` runs `deep` on OpenCode while staying `standard` on Claude.

**Why P1**: The only genuinely new capability in the batch; everything else restyles what exists.

**Acceptance Criteria**:

1. The registry loader (`scripts/lib/model-profiles.ts`) SHALL accept an optional
   `agentTiers` section shaped `{ [agentName]: { [host]: tier } }`, validating every host
   key against `HOSTS` and every tier value against `tiers`, and SHALL treat an absent
   section as `{}`. <!-- ubiquitous -->
2. WHEN `mergeOverlay` merges an overlay carrying `agentTiers` THEN it SHALL deep-merge per
   agent and per host (absent key = inherit, `null` value = delete), mirroring the D-1
   delta semantics used for `workflowTiers`. <!-- event-driven -->
3. WHEN `normalizeOverlay` runs THEN the system SHALL drop `agentTiers` entries byte-identical to the builtin's value at the same path, and SHALL count each surviving `agentTiers` leaf in `overlayOverrideCount`. <!-- event-driven -->
4. WHEN `emitHostProfile` resolves an agent's tier for a host THEN it SHALL use
   `registry.agentTiers[agent][host]` when present, otherwise the charter's
   `metadata.model_tier`. <!-- event-driven -->
5. IF the merged registry's `agentTiers` names an agent with no charter THEN the generator SHALL print one warning line naming the agent and continue. <!-- unwanted-behavior -->
6. WHEN the UI loads the Model Catalog THEN `GET /api/v1/model-registry` SHALL include an
   `agents` array of `{ name, charterTier }` for every charter under `skills/agents/`,
   degrading exactly like the existing off-checkout 501 path when the checkout is absent.
   <!-- event-driven -->
7. WHEN the Model Catalog renders THEN it SHALL show a "Per-Agent Tier Overrides" table with
   one row per agent and one column per tool, each cell a dropdown listing
   `(default: <charterTier>)` plus every declared tier, showing the effective value and
   marking overridden cells. <!-- event-driven -->
8. WHEN the operator picks a tier in a cell THEN the in-memory overlay SHALL record
   `agentTiers[agent][host] = tier`, set the dirty flag, and show the unsaved badge; WHEN
   the operator picks `(default)` THEN the override key SHALL be removed. <!-- event-driven -->

**Independent Test**: Set `builder`→`opencode`→`deep` in the UI, Save & Apply, confirm the
regenerated OpenCode `massa-ai-builder` artifact carries the deep-tier model while the
Claude artifact keeps the standard-tier model.

---

### P1-B: Model Catalog Grid Restructure ⭐ MVP

**User Story**: As the operator, I want the grid readable — Tool and Tier as leading
columns, provider and model as separate hinted fields — so I can tell at a glance what
each tool runs at each tier.

**Acceptance Criteria**:

1. WHEN the Model Catalog grid renders THEN column 1 SHALL be the tool name (rendered once
   per tool group), column 2 SHALL be the tier (Light/Standard/Deep), and the remaining
   columns SHALL be profiles. <!-- event-driven -->
2. WHEN a grid cell renders in write mode THEN it SHALL show a Provider text input above a
   Model text input above the existing Effort control, where Provider+Model are derived by
   splitting the stored model string on the first `/` (no `/` → Provider empty).
   <!-- event-driven -->
3. WHEN the operator edits Provider or Model THEN the overlay SHALL store the joined string
   (`provider + "/" + model` when Provider is non-blank, else `model` alone).
   <!-- event-driven -->
4. The Provider input SHALL carry a hint (placeholder + title) naming examples
   (`opencode-go`, `zai-coding-plan`, `local`) and stating that Claude/Codex ids are bare —
   leave Provider blank there; the Model input SHALL carry a hint with per-tool example ids;
   every other editable string field in the Model Catalog (profile name, description,
   workflow picker, duplicate name) SHALL carry a hint describing expected content.
   <!-- ubiquitous -->
5. IF a stored model string is `null` (inherit) THEN both Provider and Model inputs SHALL
   render empty and a blank save SHALL keep `null` (never the string `"null"` or `""`).
   <!-- unwanted-behavior -->

**Independent Test**: Load the catalog, verify `opencode / standard / balanced` shows
Provider `opencode-go` and Model `glm-5.2`; edit Provider to `zai-coding-plan`, save, and
verify the overlay stores `zai-coding-plan/glm-5.2`.

---

### P1-C: Unified Save & Apply ⭐ MVP

**User Story**: As the operator, I want one button that saves my changes and applies them
to the installed agents, warning me to restart my CLI sessions.

**Acceptance Criteria**:

1. WHEN the operator clicks Save & Apply and confirms THEN the UI SHALL first `PUT
   /api/v1/model-registry` with the overlay, and only on success SHALL start the existing
   regenerate-and-install SSE stream. <!-- event-driven -->
2. WHEN the stream finishes successfully THEN the UI SHALL show a success banner that
   includes the sentence "Restart your CLI sessions (Claude, Codex, Cursor, OpenCode) to
   pick up the changes." and that banner SHALL NOT auto-hide. <!-- event-driven -->
3. IF the overlay save fails THEN the UI SHALL show the validation errors and SHALL NOT
   start regeneration. <!-- unwanted-behavior -->
4. IF the save succeeds but regeneration fails THEN the UI SHALL report that changes were
   saved but not applied, and pressing Save & Apply again SHALL be safe (idempotent).
   <!-- unwanted-behavior -->
5. The Model Catalog SHALL NOT render separate "Save Overlay" or "Regenerate Artifacts"
   buttons; "Discard All Overrides" SHALL remain a separate, confirm-gated action.
   <!-- ubiquitous -->

**Independent Test**: Edit one cell, click Save & Apply, observe save → stream → success
banner with the restart sentence; verify the overlay file and a regenerated artifact both
changed.

---

### P2-D: Nomenclature + Dropdown Forms

**User Story**: As the operator, I want understandable names and pickable options instead
of type-the-exact-string popups.

**Acceptance Criteria**:

1. The Models tab SHALL use every "New" label from the Nomenclature Map, and no
   user-visible text in that tab SHALL use the words "overlay", "tombstoned", "registry",
   or "host" (code identifiers, `<code>` samples, and file paths excepted).
   <!-- ubiquitous -->
2. WHEN the operator clicks "Add Workflow Override" THEN the UI SHALL show an inline form
   with a workflow dropdown (known workflow stems minus those already overridden) and a
   tier dropdown, not a `prompt()`. <!-- event-driven -->
3. WHEN the operator clicks Duplicate Profile THEN the UI SHALL show an inline form with a
   source-profile dropdown (from the display registry) and a new-name text input.
   <!-- event-driven -->
4. WHEN the operator clicks Delete Profile THEN the UI SHALL show an inline form with a
   profile dropdown; deletion SHALL keep today's tombstone/remove semantics.
   <!-- event-driven -->
5. WHEN the operator clicks Add Profile THEN the UI SHALL show an inline form (name +
   optional description inputs) instead of `prompt()`. <!-- event-driven -->
6. The Models tab SHALL contain zero calls to `window.prompt` at runtime.
   <!-- ubiquitous -->

**Independent Test**: Walk each of the four flows without typing a profile/workflow name
that already exists on screen as a dropdown option.

---

### P2-E: Projects Tab — Delete + Files

**Acceptance Criteria**:

1. WHEN the Projects table renders in write mode THEN the action button SHALL be labeled
   "Delete" (class `btn-delete`), and WHEN clicked THEN the confirm text SHALL state that
   the project's indexed vectors, symbols and memories are removed irreversibly.
   <!-- event-driven -->
2. The Projects table header SHALL read "Files" where it now reads "docs", and column
   headers SHALL be Title Case ("Project", "Files", "Actions"). <!-- ubiquitous -->

**Independent Test**: Render Projects in write mode; assert header text and button label;
click Delete on a scratch project and verify it leaves the list.

---

### P2-F: Five-Tab UI/UX Polish

**User Story**: As the operator, I want Projects, Checkpoints, Dashboard, Config and
Models to look consistent: styled buttons, labeled width-limited fields, Title Case
labels, grouped controls, real help prose, code-styled technical tokens.

**Acceptance Criteria**:

1. The five tabs SHALL render every `<button>` with a styling class (no bare unclassed buttons), and SHALL render form fields inside `.form-field`/`.create-form` (or a new equivalent) styled containers with a max-width so text inputs do not span the full viewport. <!-- ubiquitous -->
2. The five tabs SHALL use Title Case English for every user-facing label (e.g. "Project Path", not "projectPath") and SHALL render machine tokens (env vars, paths, model ids, JSON keys) inside `<code>`. <!-- ubiquitous -->
3. WHEN a help section renders THEN it SHALL be a titled collapsible ("About this tab" /
   "Field guide") with prose explanations, replacing the bare "?" summary toggles.
   <!-- event-driven -->
4. WHEN action buttons cluster (registry actions, table actions) THEN they SHALL render in
   a spaced button row/group, not visually piled. <!-- event-driven -->
5. The Checkpoints create/edit form SHALL group its 8 fields into labeled rows within a
   two-column layout at desktop width. <!-- ubiquitous -->
6. The Dashboard SHALL render its stats in styled cards with Title Case labels and
   formatted values (no raw unformatted variable dumps). <!-- ubiquitous -->

**Independent Test**: Render each tab against fixtures and assert class presence, label
casing, and help-section structure.

---

## Edge Cases

- IF the overlay carries `agentTiers` with an unknown host key or tier value THEN
  validation SHALL reject the merged registry with a path-named violation (existing
  RegistryValidationError pattern), and the UI SHALL surface it in the save-error banner.
- IF the checkout is absent (installed-package mode) THEN the registry GET SHALL degrade
  as today (501 path) and the Models tab SHALL show its existing degraded message —
  the `agents` array is checkout-derived and follows the same gate.
- WHEN a model string contains multiple `/` THEN the display split SHALL take the first
  segment as Provider and the remainder (with `/`s) as Model, and join SHALL reproduce the
  original string byte-identically.
- IF every workflow stem already has an override THEN the Add Workflow Override form's
  dropdown SHALL be empty-with-notice, replacing today's `alert()`.
- WHEN Save & Apply is pressed with no dirty changes THEN the save step SHALL still PUT
  the current overlay (idempotent no-op) and proceed to apply — the button is the single
  path to "make installed agents match what I see".
- IF the SSE stream closes without a `done` frame THEN the UI SHALL show the existing
  "stream closed unexpectedly" error and clear the in-flight state.

## Requirement Traceability

| Requirement ID | Story | Scope | Status |
| --- | --- | --- | --- |
| APUX-01 | P1-A | `scripts/lib/model-profiles.ts`: `agentTiers` schema + validate + merge + normalize + count | Pending |
| APUX-02 | P1-A | `scripts/generate-subagent-artifacts.ts`: override consumption + stale-agent warn | Pending |
| APUX-03 | P1-A | `apps/tools-api/src/routes/model-registry.ts`: `agents` array in GET | Pending |
| APUX-04 | P1-A | web-ui: Per-Agent Tier Overrides table + cell edit handler | Pending |
| APUX-05 | P1-B | web-ui: hints (placeholder/title) in every editable Model Catalog string field | Pending |
| APUX-06 | P1-B | web-ui: Tool + Tier leading columns | Pending |
| APUX-07 | P2-D | web-ui: nomenclature Scheme A | Pending |
| APUX-08 | P2-E | web-ui: Projects Delete label + Files header | Pending |
| APUX-09 | P2-F | web-ui: five-tab styling pass (buttons, fields, widths, grouping, casing) | Pending |
| APUX-10 | P2-F | web-ui: help sections rewrite | Pending |
| APUX-11 | P2-F | web-ui: `<code>` styling for machine tokens; Dashboard cards | Pending |
| APUX-12 | P2-D | web-ui: dropdown/inline forms replacing all four `prompt()` flows | Pending |
| APUX-13 | P1-C | web-ui: unified Save & Apply + restart warning + button removal | Pending |
| APUX-14 | P1-B | web-ui: provider/model split-join per cell | Pending |

**Coverage:** 14 total, mapped to tasks in `tasks.md`.

## Implicit-Requirement Dimensions Sweep (Large — all dimensions)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | APUX-01 (agentTiers host/tier validation), P1-B AC5 (null-model handling), existing PUT validation via `validateRegistry` on the merged result |
| Failure / partial-failure | P1-C AC3/AC4 (save-fail stops apply; save-ok+apply-fail reported, retry safe); SSE close edge case |
| Idempotency / retry | Save & Apply idempotent (PUT full overlay + idempotent regenerate); re-press safe (P1-C AC4) |
| Auth boundaries & rate limits | N/A because the existing `x-api-key` write-mode gate and trusted-local-caller model are unchanged; no new route methods added beyond GET-field addition |
| Concurrency / ordering | N/A because solo local operator; existing `beforeunload` dirty guard extends to agentTiers edits via the shared dirty flag (P1-A AC8) |
| Data lifecycle / expiry | Overrides live in the user overlay file; `(default)` removes the key (assumption row); Discard All Overrides deletes the file (existing) |
| Observability | Banners for save/apply outcomes (P1-C), SSE line stream retained, generator warn line for stale agents (P1-A AC5) |
| External-dependency failure | Off-checkout 501 degrade retained for `agents` (P1-A AC6); overlay parse/validation failure falls back to builtin (existing, unchanged) |
| State-transition integrity | Dirty flag + unsaved badge cover the new edit surfaces (P1-A AC8); `registryLoaded` re-seed after save (existing, unchanged) |

## Verification Approach

- Unit: `apps/web-ui/src/__tests__/` (renderers + handlers, fixtures extended with
  `agents` + `agentTiers`), `scripts/__tests__/model-profiles.test.ts` (schema, merge,
  normalize, count), generator test for override resolution + stale-agent warn,
  `apps/tools-api/src/routes/model-registry.test.ts` (agents array + degrade path).
- Gates: web-ui `bun test`, `bun run test:scripts` (model-profiles + subagent-parity),
  tools-api isolated runner, `bun run type-check`, `bun run lint`,
  `bun run generate:artifacts --check`, CHANGELOG entry.
- Final: verification-agent (author ≠ verifier) writes `validation.md` with per-AC
  evidence + discrimination sensor.

## Success Criteria

- [ ] Every APUX requirement Verified in `validation.md`.
- [ ] The operator can complete the Independent Test of each P1 story against the live portal.
- [ ] Zero `prompt()` calls reachable from the Models tab.
