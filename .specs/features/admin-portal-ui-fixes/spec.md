# Admin Portal UI Consistency Fixes Specification

## Problem Statement

The admin portal (`apps/web-ui`) has four tabs with UI/UX inconsistencies and bugs: Projects and Memory/Checkpoints tabs use action buttons and form layouts that lack CSS styling (`.btn-edit`, `.btn-delete`, `.btn-approve`, `.btn-reject`, `.create-form`, `.form-field`, `.actions-cell` classes are referenced in HTML but never defined in `styles.css`), the Config tab renders all fields empty despite the API returning valid data, and the Profiles tab incorrectly shows "Not installed" for claude (which IS installed via marketplace route) and shows "No profiles in registry" in the Edit Registry sub-tab despite the API returning 7 profiles.

## Goals

- [ ] All action buttons across all tabs use consistent CSS-styled classes
- [ ] Projects tab Index Project form follows the same `.create-form` pattern as Memory/Handoff/Checkpoints
- [ ] Checkpoints tab Edit/Delete buttons follow the same `.actions-cell` + `.btn-edit`/`.btn-delete` pattern as Memory tab
- [ ] Config tab loads and displays current configuration values from the API
- [ ] Config tab checkboxes left-align (not center-aligned)
- [ ] Profiles tab correctly shows claude as installed even when variant profiles dir is absent
- [ ] Edit Registry sub-tab displays the model registry grid with all profiles from the API

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Backend API changes for config/model-registry routes | Routes work correctly (verified via curl); issues are frontend-only |
| New profile variant directory creation for claude marketplace installs | Separate concern; this fix makes the UI handle the absence gracefully |
| Redesigning the overall admin portal layout | Only consistency fixes, no layout overhaul |
| Adding new tabs or features | Bug fixes only |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Missing CSS classes are the root cause of UI inconsistency for buttons/forms | Add all missing CSS class definitions to styles.css | Grep confirmed `.btn-edit`, `.btn-delete`, `.btn-approve`, `.btn-reject`, `.create-form`, `.form-field`, `.actions-cell` are used in app.js but absent from styles.css | y |
| Config tab empty fields is a frontend rendering bug, not an API issue | Fix `renderConfig` field value extraction or API response handling | curl `GET /api/v1/config` returns valid config with populated fields; frontend `renderConfig` receives `data.data.config` correctly | y |
| Profiles "Not installed" for claude is caused by `availableProfiles: []` (no variant dir) being treated as "not installed" | Separate `installed` from `availableProfiles.length === 0` in `renderProfiles` | API returns `installed: true` for claude; `renderProfiles` line 977 checks `!installed || available.length === 0` — the OR conflates two distinct states | y |
| Edit Registry "No profiles in registry" is a frontend rendering issue | Fix `renderModelRegistry` empty-state check or data access | curl `GET /api/v1/model-registry` returns 7 profiles; `renderModelRegistry` line 1051 checks `profileNames.length === 0 && !overlayError` — the registry data path may be wrong | y |
| Checkbox center-alignment is a CSS issue in `.config-field` | Fix `.config-field` flex layout for boolean/checkbox fields | `renderConfigField` renders checkboxes inside `.config-field` which uses `flex-direction: column`; checkbox inputs need `align-self: flex-start` | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Consistent Action Button Styling ⭐ MVP

**User Story**: As an admin portal operator, I want all action buttons (edit, delete, reset, approve, reject, cancel) across all tabs to use the same visual style so that the UI feels consistent and professional.

**Why P1**: Action buttons are the primary interaction surface; unstyled buttons look broken and reduce trust.

**Acceptance Criteria** (each line is one EARS pattern):

1. The system SHALL render all `.btn-edit`, `.btn-delete`, `.btn-approve`, `.btn-reject` buttons with consistent padding, border-radius, cursor pointer, and color-coded backgrounds (edit=accent blue, delete=red-tinted, approve=green-tinted, reject=red-tinted). <!-- ubiquitous -->
2. The system SHALL render all `.actions-cell` containers with consistent flex layout (inline, gap, nowrap). <!-- ubiquitous -->
3. WHEN the user hovers over any action button THEN the system SHALL show a visible hover state (background change). <!-- event-driven -->
4. The system SHALL render all `.create-form` containers with consistent background, border, padding, and margin matching the existing `.config-section` card style. <!-- ubiquitous -->
5. The system SHALL render all `.form-field` containers with consistent flex-direction column, label-input gap, and font-size. <!-- ubiquitous -->

**Independent Test**: Open each tab (Projects, Memory, Checkpoints, Handoffs, Proposals) in write mode and verify buttons + forms look the same.

---

### P1: Projects Tab UI Consistency ⭐ MVP

**User Story**: As an admin portal operator, I want the Projects tab to use the same table + actions column pattern as the Memory and Checkpoints tabs, so that project rows look consistent with other data views.

**Why P1**: The Projects tab currently uses a bare `<ul>` list with inline reset buttons, unlike the `.grid` table pattern used by Memory/Checkpoints.

**Acceptance Criteria**:

1. WHEN the Projects tab renders with projects THEN the system SHALL display projects in a `.grid` table with columns: project ID, docs count, actions. <!-- event-driven -->
2. WHEN write mode is enabled THEN the system SHALL render a reset button in an `.actions-cell` column using `btn-delete` class for each project row. <!-- state-driven -->
3. WHEN write mode is enabled THEN the system SHALL render the Index Project form inside a `.create-form` container with `.form-field` styled inputs. <!-- state-driven -->
4. IF no projects exist and write mode is off THEN the system SHALL show the empty-state message. <!-- unwanted-behavior -->

**Independent Test**: Navigate to Projects tab, verify table layout matches Memory tab structure.

---

### P1: Checkpoints Tab Edit/Delete Button Consistency ⭐ MVP

**User Story**: As an admin portal operator, I want the Checkpoints tab to have both Edit and Delete buttons matching the Memory tab's action button pattern.

**Why P1**: Checkpoints currently only has a Delete button with no Edit; the actions column should follow the same pattern as Memory (edit + delete).

**Acceptance Criteria**:

1. WHEN the Checkpoints tab renders in write mode THEN the system SHALL render an Edit button (`btn-edit` class) and Delete button (`btn-delete` class) in an `.actions-cell` for each checkpoint row. <!-- state-driven -->
2. WHEN the user clicks Edit THEN the system SHALL populate the create-checkpoint form with the checkpoint's data for editing. <!-- event-driven -->
3. The system SHALL render the actions column header as "actions" matching the Memory tab. <!-- ubiquitous -->

**Independent Test**: Navigate to Checkpoints tab in write mode, verify both Edit and Delete buttons appear.

---

### P1: Config Tab Loads Current Configuration ⭐ MVP

**User Story**: As an admin portal operator, I want the Config tab to display the current configuration values so that I can review and edit them.

**Why P1**: All config fields are currently empty despite the API returning valid data — the tab is non-functional.

**Acceptance Criteria**:

1. WHEN the Config tab loads THEN the system SHALL display current configuration values from `GET /api/v1/config` response in all section fields. <!-- event-driven -->
2. WHEN a config field has a value THEN the system SHALL populate the corresponding input with that value. <!-- event-driven -->
3. WHEN a config field is a boolean THEN the system SHALL check the checkbox if the value is `true`. <!-- event-driven -->
4. The system SHALL left-align all checkbox inputs in config fields (not center-aligned). <!-- ubiquitous -->
5. IF the config API returns an error THEN the system SHALL show an error message. <!-- unwanted-behavior -->

**Independent Test**: Navigate to Config tab, verify all fields show current config values (not empty).

---

### P1: Profiles Tab Shows Claude as Installed ⭐ MVP

**User Story**: As an admin portal operator, I want the Profiles tab to correctly show claude as "installed" even when no variant profile directories exist (marketplace install), so that I see the real install state.

**Why P1**: Claude is installed (install-state.json records plugin v1.41.0) but the UI shows "Not installed" because `availableProfiles.length === 0` is conflated with `installed === false`.

**Acceptance Criteria**:

1. WHEN a host has `installed: true` but `availableProfiles: []` THEN the system SHALL show the host as installed with a message indicating "No variant profiles available (marketplace install)". <!-- state-driven -->
2. WHEN a host has `installed: true` and `availableProfiles` has entries THEN the system SHALL show profile cards with Switch buttons as before. <!-- state-driven -->
3. WHEN a host has `installed: false` THEN the system SHALL show "Not installed". <!-- state-driven -->
4. WHEN a host is `skipped` THEN the system SHALL show the skip reason as before. <!-- state-driven -->

**Independent Test**: Navigate to Profiles tab, verify claude shows as installed (not "Not installed").

---

### P1: Edit Registry Shows Profiles Grid ⭐ MVP

**User Story**: As an admin portal operator, I want the Edit Registry sub-tab to display the model registry grid with all profiles so that I can edit model/effort assignments.

**Why P1**: The Edit Registry tab shows "No profiles in registry" despite the API returning 7 profiles — the registry editor is non-functional.

**Acceptance Criteria**:

1. WHEN the Edit Registry sub-tab loads THEN the system SHALL render the registry grid with all profiles from `GET /api/v1/model-registry` response. <!-- event-driven -->
2. WHEN the registry API returns profiles THEN the system SHALL display profile names as column headers and {host, tier} pairs as rows. <!-- event-driven -->
3. WHEN the registry API returns an error THEN the system SHALL show the error message. <!-- unwanted-behavior -->
4. IF no profiles exist in the registry THEN the system SHALL show the "No profiles in registry" empty state. <!-- unwanted-behavior -->

**Independent Test**: Navigate to Profiles > Edit Registry, verify the grid with 7 profiles appears.

---

## Edge Cases

- IF the config API returns `config: {}` (empty config) THEN the system SHALL render all fields with empty/default values (not crash). <!-- unwanted-behavior -->
- IF a host has `installed: true` but no `activeProfile` THEN the system SHALL default to "balanced" as the API does. <!-- unwanted-behavior -->
- IF the model-registry API returns `overlayError` THEN the system SHALL show the overlay error banner + the builtin registry grid. <!-- unwanted-behavior -->
- WHEN the Projects tab has zero projects and write mode is on THEN the system SHALL show the Index Project form (not the empty state). <!-- event-driven -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| UIC-01 | P1: Consistent Action Button Styling | Execute | Pending |
| UIC-02 | P1: Projects Tab UI Consistency | Execute | Pending |
| UIC-03 | P1: Checkpoints Tab Edit/Delete | Execute | Pending |
| UIC-04 | P1: Config Tab Loads Config | Execute | Pending |
| UIC-05 | P1: Profiles Tab Claude Installed | Execute | Pending |
| UIC-06 | P1: Edit Registry Shows Profiles | Execute | Pending |

**Coverage:** 6 total, 6 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] All 6 acceptance criteria pass via deterministic test assertions
- [ ] `bun test apps/web-ui` passes with 0 new failures
- [ ] `bun run type-check` passes (6/6 projects)
- [ ] `bun run lint` passes (0 errors)
- [ ] Visual inspection: all tabs have consistent button + form styling

---

## Verification Approach

1. **Unit tests**: `app-renderers.test.ts`, `config-forms.test.ts`, `registry-editor.test.ts` — extend with assertions for new CSS class presence, config value population, profiles installed detection, and registry grid rendering.
2. **Gate commands**: `bun test apps/web-ui`, `bun run type-check`, `bun run lint`.
3. **Manual verification**: Start the server, open `/ui`, navigate each tab, confirm visual consistency.

---

## Sizing

- **Scope**: Medium — clear feature, <10 tasks, no architectural decisions.
- **Design**: Skipped — no architecture, interface, data model, or migration decisions. Fixes are CSS + render function logic.
- **Tasks**: Included — 6 distinct fix areas with dependency-free execution order.