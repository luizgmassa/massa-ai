# Config Tab: Capture Policy, Reveal, and Field Guides — Tasks

**Design**: skipped — no architecture decisions (UI additions + one new authenticated GET endpoint)
**Status**: Draft

---

## Test Coverage Matrix

| Code Layer | Test Type | Coverage Expectation | Test Files |
|------------|-----------|----------------------|------------|
| Capture Policy indicator (app.js) | unit (HTML output) | "not configured" note when capturePolicy absent | `config-forms.test.ts` |
| Reveal handler (app.js) | unit (handler mock) | fetches real value, sets input, toggles type | `admin-handlers.test.ts` |
| Reveal route (tools-api) | unit (route test) | returns unmasked value for requested field | `config.test.ts` |
| Field guides (app.js) | unit (HTML output) | `<details>` per section with field descriptions | `config-forms.test.ts` |

## Gate Check Commands

```bash
bun test apps/web-ui          # web-ui unit tests
bun test apps/tools-api        # tools-api route tests
bun run type-check             # 6 tsc projects
bun run lint                   # oxlint
```

---

## Task Breakdown

### T11: Capture Policy "Not Configured" Indicator

**What**: Show a "not configured (using built-in defaults)" note inside the Capture Policy section when `capturePolicy` is absent from the API response.
**Where**: `apps/web-ui/src/static/app.js` (`renderConfig` function), `apps/web-ui/src/static/styles.css`
**Depends on**: None
**Requirement**: CFG-01

**Done when**:

- [ ] `renderConfig` checks if `config.capturePolicy` is undefined/absent
- [ ] If absent, renders a muted info note "Not configured — using built-in defaults" inside the section
- [ ] Note appears above the fields
- [ ] CSS `.config-info-note` for the note styling
- [ ] `bun test apps/web-ui` passes (new test in `config-forms.test.ts`)

**Tests**: unit — assert "not configured" note present when config has no capturePolicy, absent when it does
**Gate**: `bun test apps/web-ui`

---

### T12: Reveal Shows Real Value

**What**: Add a `GET /api/v1/config/reveal` endpoint that returns the unmasked value for a single field, and update the frontend reveal handler to fetch and display it.
**Where**: `apps/tools-api/src/routes/config.ts` (new route), `apps/web-ui/src/static/app.js` (`handleConfigReveal` + reveal wiring)
**Depends on**: None
**Requirement**: CFG-02

**Done when**:

- [ ] New `GET /api/v1/config/reveal?section=X&field=Y` route in `config.ts`
- [ ] Route reads config.json via `loadConfig()`, extracts the field value by section+field path, returns it unmasked
- [ ] Route only reveals fields in `SENSITIVE_FIELDS` set (rejects non-sensitive fields with 400)
- [ ] Route requires API key (existing auth middleware)
- [ ] `handleConfigReveal` updated: fetches from reveal endpoint, sets input value to real value, toggles type
- [ ] Second click toggles back to `password` + restores `***` value
- [ ] Error handling: if fetch fails, show brief error, keep `***`
- [ ] `bun test apps/web-ui` passes (new test in `admin-handlers.test.ts`)
- [ ] `bun test apps/tools-api` passes (new test in `config.test.ts`)

**Tests**: unit — reveal route returns unmasked value; reveal handler fetches + sets value; toggle back restores mask
**Gate**: `bun test apps/web-ui`, `bun test apps/tools-api`

---

### T13: Per-Section Field Guides

**What**: Add a `guide` property to each field in `CONFIG_SECTIONS` and render a collapsible `<details>` field guide at the end of each section.
**Where**: `apps/web-ui/src/static/app.js` (`CONFIG_SECTIONS` definitions, `renderConfig` function), `apps/web-ui/src/static/styles.css`
**Depends on**: None
**Requirement**: CFG-03

**Done when**:

- [ ] Each field in `CONFIG_SECTIONS` has a `guide` string describing what it does
- [ ] `renderConfig` renders a `<details class="config-field-guide">` at the end of each section
- [ ] `<summary>` text is "Field guide"
- [ ] Guide body lists each field with label + description
- [ ] Boolean fields explain what checking the box enables
- [ ] CSS `.config-field-guide` for styling
- [ ] Guide is collapsible (closed by default — no `open` attribute)
- [ ] `bun test apps/web-ui` passes (new test in `config-forms.test.ts`)

**Tests**: unit — assert `<details>` per section, `<summary>Field guide</summary>`, field descriptions present
**Gate**: `bun test apps/web-ui`

---

### T14: Full Gate Matrix + State Update

**What**: Run full gate matrix, update spec state artifacts.
**Where**: `.specs/project/STATE.md`, `.specs/project/FEATURES.json`
**Depends on**: T11-T13
**Requirement**: All

**Done when**:

- [ ] `bun test apps/web-ui` — 0 new failures
- [ ] `bun test apps/tools-api` — 0 new failures
- [ ] `bun run type-check` — 6/6 projects pass
- [ ] `bun run lint` — 0 errors
- [ ] STATE.md + FEATURES.json updated
- [ ] `bun skills/massa-ai/scripts/validate_state.ts --root .` exits 0
- [ ] Validation report written

**Tests**: none
**Gate**: all gates above