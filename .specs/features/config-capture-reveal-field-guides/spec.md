# Config Tab: Capture Policy, Reveal, and Field Guides Specification

## Problem Statement

The Config tab of the admin portal has three issues:

1. **Capture Policy section shows empty fields.** The `capturePolicy` config block defaults to `undefined` in the config schema (`packages/shared/src/config/massa-ai-config.ts:243`). When absent, `JSON.parse(JSON.stringify(config))` in `maskSensitive()` drops the `undefined` key, so the API response has no `capturePolicy` object. The UI's `getConfigFieldValue` returns `undefined` → fields render empty. The user sees no values because the defaults live in the pure module (`packages/core/src/services/search/capture-policy.ts:39` — `DEFAULT_POLICY`), not in config.json. The UI should show a "not configured (using defaults)" indicator when the section is absent.

2. **Reveal button shows `***`, not the real value.** The config API route calls `maskSensitive()` (`packages/shared/src/config/config-writer.ts:14-21`) which replaces `database.url`, `embedding.apiKey`, `llm.apiKey`, and `security.apiKey` with the `"***"` sentinel before sending to the frontend. The reveal button (`handleConfigReveal` at `app.js:1431-1436`) toggles the input `type` from `password` to `text`, but the value is still `***`. The real value is in `~/.config/massa-ai/config.json` on disk — the frontend never receives it.

3. **No field/checkbox guide per section.** The Edit Registry tab has a `?` help section explaining its buttons. The Config tab has 15 sections (Database, Embedding, Compression, Impact Analysis, Capture Policy, Cache, Data Directory, Logging, Search, LLM, Memory, Hooks, Synapse, Handoffs, Security) with no per-section explanation of what each field does or what the checkboxes mean.

## Goals

- [ ] Capture Policy section shows a "not configured (using built-in defaults)" indicator when `capturePolicy` is absent from the API response
- [ ] Reveal button fetches and displays the real sensitive value from a new unmasked API endpoint
- [ ] Each of the 15 config sections has a collapsible field guide explaining its fields

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Changing the config schema to include capturePolicy defaults | The defaults live in the pure module by design; the config is optional |
| Revealing sensitive values without authentication | The new unmasked endpoint requires the API key like all other routes |
| Redesigning the config section layout | Only adding field guides, not changing layout |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Capture Policy "not configured" indicator is a note inside the section, not an empty-state replacement | Inline note after the fields | The fields should still be editable (write mode), just with a visual cue that they're currently using defaults | y |
| Reveal fetches from a new `GET /api/v1/config/reveal?section=X&field=Y` endpoint | New authenticated endpoint returns the unmasked value for one field | The API key is already required on all routes. The endpoint takes section+field, reads config.json, returns only that field's real value. This avoids sending all secrets in one response. | y |
| Field guides use `<details>` collapsible elements per section (like the Edit Registry help) | `<details>` per section | Matches the pattern from the Edit Registry help section; keeps the config form compact by default | y |
| Field guide content is static text per field definition | Add a `guide` property to each field in `CONFIG_SECTIONS` | Each field already has `name`, `type`, `label`; adding `guide` is the minimal change | y |

---

## User Stories

### P1: Capture Policy "Not Configured" Indicator

**User Story**: As an admin portal operator, I want the Capture Policy section to indicate when it's not configured (using built-in defaults), so that I understand why the fields are empty.

**Acceptance Criteria**:

1. WHEN the config API response has no `capturePolicy` key THEN the system SHALL render a "Not configured — using built-in defaults" note inside the Capture Policy section. <!-- event-driven -->
2. WHEN the config API response has a `capturePolicy` key THEN the system SHALL render the fields with values as before. <!-- event-driven -->
3. The "not configured" note SHALL appear above the fields, styled as a muted info banner. <!-- ubiquitous -->

**Independent Test**: Navigate to Config tab, verify Capture Policy section shows the "not configured" note.

---

### P1: Reveal Shows Real Value

**User Story**: As an admin portal operator, I want the reveal button to show the real value of sensitive fields (Database URL, API Keys), so that I can verify the actual configuration.

**Acceptance Criteria**:

1. WHEN the user clicks "reveal" on a sensitive field THEN the system SHALL fetch the real value from `GET /api/v1/config/reveal?section=X&field=Y`. <!-- event-driven -->
2. WHEN the reveal endpoint returns the value THEN the system SHALL set the input value to the real value and switch the input type to `text`. <!-- event-driven -->
3. WHEN the user clicks "reveal" again THEN the system SHALL switch the input type back to `password` and restore the `***` masked value. <!-- event-driven -->
4. The reveal endpoint SHALL require the API key (same auth as all other routes). <!-- ubiquitous -->
5. The reveal endpoint SHALL return only the requested field's value, not the entire config. <!-- ubiquitous -->

**Independent Test**: Navigate to Config tab, click reveal on Database URL, verify the real URL appears.

---

### P1: Per-Section Field Guides

**User Story**: As an admin portal operator, I want a collapsible field guide at the end of each config section explaining what each field does, so that I can configure the system correctly without external documentation.

**Acceptance Criteria**:

1. The system SHALL render a `<details>` field guide at the end of each of the 15 config sections. <!-- ubiquitous -->
2. The field guide SHALL list each field with its label and a description of what it does. <!-- ubiquitous -->
3. The field guide SHALL use a `<summary>` with the text "Field guide". <!-- ubiquitous -->
4. WHEN a field is a boolean/checkbox THEN the guide SHALL explain what checking the box enables. <!-- ubiquitous -->
5. The field guide SHALL be collapsible (closed by default). <!-- ubiquitous -->

**Independent Test**: Navigate to Config tab, expand a section's field guide, verify all fields are explained.

---

## Edge Cases

- IF the reveal endpoint fails (server error, network) THEN the system SHALL show a brief error message and keep the `***` value. <!-- unwanted-behavior -->
- IF the config API returns `capturePolicy` with partial fields THEN the system SHALL render the provided values (not show the "not configured" note). <!-- unwanted-behavior -->
- IF a section has no field guide content THEN the `<details>` SHALL not render (no empty guide). <!-- unwanted-behavior -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| CFG-01 | P1: Capture Policy Indicator | Execute | Pending |
| CFG-02 | P1: Reveal Shows Real Value | Execute | Pending |
| CFG-03 | P1: Per-Section Field Guides | Execute | Pending |

**Coverage:** 3 total, 3 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] All 3 acceptance criteria pass via deterministic test assertions
- [ ] `bun test apps/web-ui` passes with 0 new failures
- [ ] `bun test apps/tools-api` passes with 0 new failures (new reveal route)
- [ ] `bun run type-check` passes (6/6 projects)
- [ ] `bun run lint` passes (0 errors)

---

## Verification Approach

1. **Unit tests**: `config-forms.test.ts` (capturePolicy indicator, field guides), `admin-handlers.test.ts` (reveal handler fetches real value), `config.test.ts` (reveal route returns unmasked value).
2. **Gate commands**: `bun test apps/web-ui`, `bun test apps/tools-api`, `bun run type-check`, `bun run lint`.
3. **Manual verification**: Start the server, open `/ui`, navigate to Config tab, verify capturePolicy note, reveal shows real values, field guides present.

---

## Sizing

- **Scope**: Medium — 3 features touching app.js, styles.css, config route, and tests.
- **Design**: Skipped — no architecture decisions (UI additions + one new authenticated GET endpoint).
- **Tasks**: Included — 4 tasks with dependency-free execution order.