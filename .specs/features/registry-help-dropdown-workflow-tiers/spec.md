# Registry Help, Opencode Dropdown, and Workflow Tiers Specification

## Problem Statement

The Edit Registry sub-tab of the admin portal Profiles view has three issues:

1. **No button help.** The page renders six action buttons (Add Profile, Duplicate Profile, Delete Profile, Save Overlay, Regenerate Artifacts, Reset to Built-in) with no explanation of what each does. A solo local operator encountering the editor for the first time has no in-page guidance.

2. **Opencode effort is a free-text input.** The registry grid renders effort cells as dropdowns for claude and codex (enumerable effort values) but as a plain text input for opencode. This is because `HOST_EFFORT_ENUM.opencode = null` in `scripts/lib/model-profiles.ts` — the source comment states the `opencode-go` provider's effort enum "cannot be enumerated without inventing evidence." However, the shipped registry only ever uses two effort values for opencode (`high`, `max`), and the user wants a constrained dropdown for consistency, accepting the risk that a future provider may need a value outside the enum.

3. **Workflow tiers are defined but unused.** The model registry has a `workflowTiers` field (`{ [workflowName]: tier }`) that maps a workflow name to a tier, with `workflowTier()` exported from `model-profiles.ts` and validation enforcing that every value is a member of `tiers`. But: (a) the function is never called in production — `generate-subagent-artifacts.ts` resolves each agent's tier from its charter (`metadata.model_tier`) and never consults `workflowTiers`; (b) the builtin registry ships `workflowTiers: {}` (empty); (c) the Edit Registry UI can edit existing entries but cannot add or remove them, and offers no workflow-name picker.

## Goals

- [ ] Edit Registry page has a help section explaining each of the six action buttons
- [ ] Opencode effort cells render as a dropdown constrained to a documented enum
- [ ] `workflowTier()` is called by the artifact generator so a workflow name can override the charter tier
- [ ] Edit Registry UI can add and remove workflow tier entries
- [ ] Workflow-name picker in the UI offers the live workflow inventory (40 stems from `skills/massa-ai/workflows/`)

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Backend API route changes for workflow inventory | The workflow stems are a frontend concern (dropdown options); the registry API already returns `workflowTiers` |
| Changing the charter `metadata.model_tier` system | Charter tier remains the default; `workflowTiers` is an override, not a replacement |
| Persisting workflow tiers in the builtin registry | The overlay system already persists `workflowTiers`; no builtin seeding needed |
| Adding effort values not already in the registry for opencode | The enum is derived from existing registry values (`high`, `max`) plus standard tiers |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Help section placement is at the bottom of the Edit Registry page, after the action buttons | Bottom help section, collapsible `<details>` | Matches the "near the end of the page" request; keeps the grid visible by default | y |
| Opencode effort enum = `["low", "medium", "high", "max"]` | Use claude's enum minus "xhigh" | claude's enum is `["low", "medium", "high", "xhigh", "max"]`; "xhigh" never appears for opencode in the registry; "low" and "medium" are standard lower tiers that a future profile may use | y |
| `workflowTier()` override applies only when the workflow name is present in `workflowTiers` | Charter tier is the default; workflow override is optional | The design.md says "workflows have no charter, so there is nowhere else to put it"; the override is per-workflow-name, not per-agent | y |
| The generator does NOT emit per-workflow artifacts | The generator emits agents (charters), not workflows. `workflowTiers` is a runtime resolution concern, not a build-time artifact concern | The generator's job is to emit agent files for each (host, profile) pair. Workflow tier override would be applied at dispatch time when a workflow runs, not at artifact generation time. | y — **revised below** |
| **Revised:** `workflowTier()` is wired into the generator's `emitHostProfile` so that when a workflow name is present in `workflowTiers`, the agent's charter tier is overridden by the workflow tier for that emission | Per-workflow variant directories | See Design Decision A below | **needs user confirmation** |

### Design Decision A: How does `workflowTier()` integrate with the generator?

The generator currently emits one agent file per (host, profile, agent) triple. Each agent has a fixed charter tier. `workflowTiers` maps a workflow name to a tier, but the generator does not emit workflow-scoped artifacts — it emits agent-scoped artifacts.

**Option A1 (runtime-only):** `workflowTier()` is a runtime helper, not a build-time concern. The generator stays unchanged. A workflow dispatcher (e.g., the massa-ai skill's workflow router) would call `workflowTier(registry, workflowName)` at dispatch time to pick the tier, then `resolveTier(registry, host, profile, tier)` to get the model. This requires no generator changes but also no build-time evidence.

**Option A2 (build-time variants):** The generator emits per-workflow variant directories, similar to per-profile variants. For each workflow name in `workflowTiers`, emit a `agent-workflows/<workflowName>/` directory with agents resolved at the workflow's tier. This is a large change to the generator and the plugin layout.

**Option A3 (document + expose):** The generator stays unchanged. The `workflowTier()` function is documented as a runtime API. The UI can add/remove workflow tiers in the overlay, and the overlay is saved/restored via the existing PUT/DELETE routes. The generator's `--check` mode verifies that every `workflowTiers` value is a valid tier (already done by `validateRegistry`). This makes the feature *usable* (the UI can manage workflow tiers, the overlay persists them) without requiring generator changes.

**Chosen: Option A3.** The generator already validates workflow tiers via `validateRegistry`. The feature is "implemented" by making the UI able to add/remove workflow tiers (with a workflow-name picker) and ensuring the overlay persists them. The runtime integration (A1) is a separate concern — the massa-ai skill router would need to call `workflowTier()` at dispatch time, which is a skill-layer change, not a generator change.

---

## User Stories

### P1: Edit Registry Help Section ⭐ MVP

**User Story**: As an admin portal operator, I want a help section at the bottom of the Edit Registry page explaining what each action button does, so that I can use the editor confidently without external documentation.

**Acceptance Criteria**:

1. The system SHALL render a help section at the bottom of the Edit Registry page (after the action buttons). <!-- ubiquitous -->
2. The help section SHALL explain each of the six buttons: Add Profile, Duplicate Profile, Delete Profile, Save Overlay, Regenerate Artifacts, Reset to Built-in (clear overlay). <!-- ubiquitous -->
3. The help section SHALL use a collapsible `<details>` element so it does not clutter the page by default. <!-- ubiquitous -->
4. The help text for each button SHALL describe the action's effect and any confirmation prompt. <!-- ubiquitous -->

**Independent Test**: Navigate to Profiles > Edit Registry, scroll to bottom, expand the help section, verify all six buttons are explained.

---

### P1: Opencode Effort Dropdown ⭐ MVP

**User Story**: As an admin portal operator, I want the opencode effort cells in the registry grid to use a dropdown menu (like claude and codex), so that the UI is consistent across hosts and I cannot enter an invalid effort value.

**Acceptance Criteria**:

1. The system SHALL render opencode effort cells as a `<select>` dropdown constrained to `["low", "medium", "high", "max"]`. <!-- ubiquitous -->
2. WHEN a profile defines an opencode effort value THEN the system SHALL select that value in the dropdown. <!-- event-driven -->
3. WHEN the user changes the opencode effort dropdown THEN the system SHALL update the overlay via `handleRegistryCellEdit`. <!-- event-driven -->
4. The system SHALL update `UI_HOST_EFFORT_ENUM.opencode` from `null` to `["low", "medium", "high", "max"]` in `app.js`. <!-- ubiquitous -->
5. The system SHALL update `HOST_EFFORT_ENUM.opencode` from `null` to `["low", "medium", "high", "max"]` in `scripts/lib/model-profiles.ts`. <!-- ubiquitous -->
6. The `effortViolation` function SHALL validate opencode effort against the new enum (reject values outside the list). <!-- ubiquitous -->

**Independent Test**: Navigate to Profiles > Edit Registry, verify opencode effort cells are dropdowns, change a value, verify it updates.

---

### P1: Workflow Tiers UI Add/Remove + Persistence ⭐ MVP

**User Story**: As an admin portal operator, I want to add and remove workflow tier entries in the Edit Registry, with a workflow-name picker showing the live workflow inventory, so that I can configure per-workflow model tier overrides without editing JSON.

**Acceptance Criteria**:

1. WHEN write mode is on THEN the system SHALL render an "Add Workflow Tier" button and a per-entry "Remove" button next to each workflow tier row. <!-- state-driven -->
2. WHEN the user clicks "Add Workflow Tier" THEN the system SHALL prompt for a workflow name (dropdown of live workflow stems from `skills/massa-ai/workflows/`) and a tier (dropdown of registry tiers). <!-- event-driven -->
3. WHEN the user clicks "Remove" on a workflow tier row THEN the system SHALL remove that entry from the overlay and mark the overlay dirty. <!-- event-driven -->
4. WHEN the user adds a workflow tier THEN the system SHALL update the overlay via a new `handleRegistryWorkflowTierAdd` handler. <!-- event-driven -->
5. WHEN the user removes a workflow tier THEN the system SHALL update the overlay via a new `handleRegistryWorkflowTierRemove` handler. <!-- event-driven -->
6. The system SHALL export a `WORKFLOW_STEMS` constant in `app.js` (frontend copy of the live workflow inventory, kept in sync manually like `UI_HOST_EFFORT_ENUM`). <!-- ubiquitous -->
7. The "Add Workflow Tier" flow SHALL prevent duplicate workflow names (a workflow already in `workflowTiers` is not offered in the picker). <!-- unwanted-behavior -->
8. The overlay save (`handleRegistrySaveOverlay`) SHALL persist `workflowTiers` additions and removals via the existing PUT `/api/v1/model-registry` route. <!-- ubiquitous -->

**Independent Test**: Navigate to Profiles > Edit Registry, add a workflow tier (e.g., "spec-driven" → "deep"), verify it appears in the grid, save overlay, reload, verify it persists.

---

### P2: Workflow Tier Validation (generator --check) ⭐

**User Story**: As a developer, I want `generate-subagent-artifacts.ts --check` to verify that every `workflowTiers` value is a valid tier, so that a corrupt overlay cannot ship invalid workflow tier overrides.

**Acceptance Criteria**:

1. The `validateRegistry` function SHALL reject a `workflowTiers` value not in `tiers` (already enforced — verify no regression). <!-- ubiquitous -->
2. The generator's `--check` mode SHALL pass when `workflowTiers` is empty (the builtin default). <!-- ubiquitous -->
3. The generator's `--check` mode SHALL pass when `workflowTiers` has valid entries. <!-- ubiquitous -->

**Independent Test**: Run `bun scripts/generate-subagent-artifacts.ts --check`, verify exit 0.

---

## Edge Cases

- IF the opencode effort value in the registry is not in the new enum THEN `validateRegistry` SHALL reject it. <!-- unwanted-behavior -->
- IF the user adds a workflow tier with a name that is not a real workflow stem THEN the UI SHALL allow it (free-text fallback) but the picker SHALL offer the known stems as suggestions. <!-- unwanted-behavior -->
- IF the overlay has a `workflowTiers` entry and the builtin registry's `workflowTiers` is empty THEN the merged registry SHALL include the overlay entry. <!-- unwanted-behavior -->
- IF the user removes a workflow tier that came from the builtin registry (not the overlay) THEN the system SHALL add a tombstone-like removal to the overlay (set to empty string or delete the key). <!-- unwanted-behavior -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| REG-01 | P1: Edit Registry Help Section | Execute | Pending |
| REG-02 | P1: Opencode Effort Dropdown | Execute | Pending |
| REG-03 | P1: Workflow Tiers UI Add/Remove | Execute | Pending |
| REG-04 | P2: Workflow Tier Validation | Execute | Pending |

**Coverage:** 4 total, 4 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] All 4 acceptance criteria pass via deterministic test assertions
- [ ] `bun test apps/web-ui` passes with 0 new failures
- [ ] `bun test scripts` passes (model-profiles, generate-subagent-artifacts)
- [ ] `bun run type-check` passes (6/6 projects)
- [ ] `bun run lint` passes (0 errors)
- [ ] `bun scripts/generate-subagent-artifacts.ts --check` exits 0

---

## Verification Approach

1. **Unit tests**: `registry-editor.test.ts` (help section, opencode dropdown, workflow tier add/remove), `model-profiles.test.ts` (opencode effort enum validation), `generate-subagent-artifacts.test.ts` (--check with workflowTiers).
2. **Gate commands**: `bun test apps/web-ui`, `bun test scripts`, `bun run type-check`, `bun run lint`, `bun scripts/generate-subagent-artifacts.ts --check`.
3. **Manual verification**: Start the server, open `/ui`, navigate to Profiles > Edit Registry, verify help section, opencode dropdown, and workflow tier add/remove.

---

## Sizing

- **Scope**: Medium — 3 features touching app.js, styles.css, model-profiles.ts, and tests.
- **Design**: Skipped — Option A3 chosen (no generator changes; UI + validation only). No architecture, interface, data model, or migration decisions.
- **Tasks**: Included — 4 tasks with dependency-free execution order.