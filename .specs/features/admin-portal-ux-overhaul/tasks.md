# Admin Portal UX Overhaul — Tasks

Spec: `./spec.md` · Design: `./design.md` · Sizing: **3 Phases = 15 Tasks**.
One atomic commit per task. Worktree:
`/Users/luizmassa/Projects/massa-ai-wt-admin-portal-ux-overhaul`, branch
`spec/admin-portal-ux-overhaul`.

## Execution Plan

```text
T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T9 -> T10 -> T11 -> T12 -> T13 -> T14 -> T15
```

Phase 1 = T1–T3 (backbone), Phase 2 = T4–T9 (catalog UI), Phase 3 = T10–T15 (polish + close-out).

Phase 2 tasks are sequential (all edit `app.js`); Phase 3 T12/T13/T14 could interleave but
stay ordered to keep one-writer-per-file discipline.

## Task Breakdown

### Phase 1 — Registry backbone

### T1: `agentTiers` in the registry lib

**Where**: `scripts/lib/model-profiles.ts`, `skills/model-profiles.json`,
`scripts/__tests__/model-profiles.test.ts`
**Depends on**: none
Add the optional `agentTiers` section per design D-1: types, loader default `{}`,
validation (host keys via `isHost`, tier values via declared `tiers`), deep merge with
`null` tombstones at both levels, normalization against the builtin, and
`countOverlayEntries` counting surviving leaves. Add `"agentTiers": {}` to the builtin
JSON.
**Tests**: `scripts/__tests__/model-profiles.test.ts` — validate accept/reject paths
(unknown host, unknown tier, non-object), a registry JSON with NO `agentTiers` key at all
loads with `registry.agentTiers` equal to `{}` (not `undefined`), merge
inherit/override/tombstone at both levels, normalize drops builtin-identical leaves and
no-op tombstones, count includes agentTiers leaves. The agentTiers merge cases use the
shared parity fixture consumed again by T6 (design D-4.3). Covers APUX-01 AC1–AC3.
**Gate**: `bun test scripts/__tests__/model-profiles.test.ts`

### T2: Generator consumes agent tier overrides

**Where**: `scripts/generate-subagent-artifacts.ts`,
`scripts/__tests__/generate-subagent-artifacts.test.ts`
**Depends on**: T1
`emitHostProfile` resolves `registry.agentTiers?.[c.name]?.[host] ?? c.modelTier` (design
D-2). Stale-name warn via the shared `warnStaleAgentTiers(registry, charters, warnedSet)`
helper, `Set` created once in `main()` and threaded through `EmitOptions` to both
`emitAll` and `emitVariants` (blocking finding #2). Warn must not fire when agentTiers is
empty (keeps `--check` output stable).
**Tests**: fixture registry with an override — regenerated artifact for the overridden
(agent, host) carries the override tier's model while another host keeps the charter
tier's model; stale-name fixture runs `emitAll` AND `emitVariants` in the same test body
against the same registry and asserts EXACTLY one warn line total + successful emit;
empty agentTiers asserts zero warn lines. Covers APUX-02 / P1-A AC4–AC5.
**Gate**: `bun test scripts/__tests__/generate-subagent-artifacts.test.ts && bun run generate:artifacts --check`

### T3: `agents` array in the registry GET route

**Where**: `apps/tools-api/src/routes/model-registry.ts`,
`apps/tools-api/src/routes/model-registry.test.ts`,
`apps/web-ui/src/__tests__/fixtures/model-registry-get.json`
**Depends on**: T2
GET gains `agents: [{name, charterTier}]` via lazy require of the generator's
`loadAllCharters()` (design D-3); best-effort with `agentsError`; 501 gate unchanged.
Fixture gains `agents` + one `agentTiers` override so web-ui tests exercise real shapes.
**Tests**: route test asserts agents present with correct shape and charter-derived
tiers; failure injection asserts `agents: []` + `agentsError`; existing 501 test still
green. PLUS the unmocked round-trip sensor (blocking finding #1): real route handler,
`profilesLib()` unmocked, scratch `overlayPath` — PUT
`{"agentTiers":{"builder":{"opencode":"deep"}}}` then GET asserts
`data.registry.agentTiers.builder.opencode === "deep"`. Covers APUX-03 / P1-A AC6.
**Gate**: `cd apps/tools-api && bun scripts/run-tests-isolated.ts model-registry`

### Phase 2 — Model Catalog UI

### T4: Tool + Tier leading columns

**Where**: `apps/web-ui/src/static/app.js`, `apps/web-ui/src/static/styles.css`,
`apps/web-ui/src/__tests__/registry-editor.test.ts`
**Depends on**: T3
Grid restructure per design D-4.1: `Tool` rowspan cell per host group, `Tier` column,
capitalized labels, `.grid-scroll` wrapper.
**Tests**: renderer asserts header cells `Tool`/`Tier`, rowspan = tiers.length, one tool
cell per host, capitalized tier labels. Covers APUX-06 / P1-B AC1.
**Gate**: `cd apps/web-ui && bun test`

### T5: Provider/model split-join + field hints

**Where**: `apps/web-ui/src/static/app.js`, `apps/web-ui/src/__tests__/registry-editor.test.ts`,
`apps/web-ui/src/__tests__/admin-handlers.test.ts`
**Depends on**: T4
`splitModelId`/`joinModelId` exported helpers; Provider input above Model input per cell;
change handler joins and routes through `handleRegistryCellEdit`; hints
(placeholder+title) on Provider, Model, and every other editable Model Catalog string
field (design D-4.2).
**Tests**: split/join round-trips incl. multi-`/`, bare, null/empty (P1-B AC5); renderer
asserts both inputs + values for `opencode-go/glm-5.2`; hint attributes present; edit
handler stores joined string / null. Covers APUX-14, APUX-05 / P1-B AC2–AC5.
**Gate**: `cd apps/web-ui && bun test`

### T6: Per-Agent Tier Overrides table

**Where**: `apps/web-ui/src/static/app.js`, `apps/web-ui/src/static/styles.css`,
`apps/web-ui/src/__tests__/registry-editor.test.ts`,
`apps/web-ui/src/__tests__/admin-handlers.test.ts`
**Depends on**: T5
Render the agents × tools table with `(default: <charterTier>)` + tier options, effective
selection, `.overridden` marks, empty/`agentsError` notice;
`handleRegistryAgentTierEdit` with default-removal semantics; `mergeRegistryForDisplay`
extended for agentTiers (design D-4.3).
**Tests**: renderer rows/columns/options/marks from the fixture; handler sets override,
sets dirty, removes key on `""` (and prunes empty agent objects); display merge shows
unsaved edits. Covers APUX-04 / P1-A AC7–AC8.
**Gate**: `cd apps/web-ui && bun test`

### T7: Inline dropdown forms replace prompt()

**Where**: `apps/web-ui/src/static/app.js`, `apps/web-ui/src/static/styles.css`,
`apps/web-ui/src/__tests__/registry-editor.test.ts`,
`apps/web-ui/src/__tests__/admin-handlers.test.ts`
**Depends on**: T6
`state.registryForm` toggle + four inline forms (add-workflow, duplicate-profile,
delete-profile, add-profile) per design D-4.4; handlers read form fields; inline
`.form-error` instead of `alert()`; all-stems-taken notice.
**Tests**: each form renders with expected dropdown options (stems minus overridden;
display-registry profiles); handlers behave identically to today's semantics
(tombstone, duplicate copy, add with empty cells); no-prompt sensor scoping (advisory
finding #4): extract source spans by function-declaration boundaries for every
`handleRegistry*` handler and `renderModelRegistry`/`renderProfilesView`, and scan those
spans for `prompt(`/`alert(` — never a whole-file scan (the Memory tab's prompt at
app.js:2389 is out of scope). Covers APUX-12 / P2-D AC2–AC6.
**Gate**: `cd apps/web-ui && bun test`

### T8: Unified Save & Apply

**Where**: `apps/web-ui/src/static/app.js`, `apps/web-ui/src/__tests__/admin-handlers.test.ts`,
`apps/web-ui/src/__tests__/write-mode.test.ts`, `apps/web-ui/src/__tests__/route-contract.test.ts`
**Depends on**: T7
`handleRegistrySaveAndApply` per design D-4.5: confirm → PUT → on success stream via
extracted `runRegenerateStream` → persistent success banner with the restart sentence;
save-failure stops; apply-failure message names safe retry. Remove Save Overlay +
Regenerate buttons/wiring; `showBanner` gains `{persist}`.
**Tests**: order (PUT resolves before fetch of the stream), save-fail short-circuit,
apply-fail message, banner sentence + no auto-hide, buttons absent, old data-actions
swept from tests. Covers APUX-13 / P1-C AC1–AC5.
**Gate**: `cd apps/web-ui && bun test`

### T9: Nomenclature Scheme A

**Where**: `apps/web-ui/src/static/app.js`, `apps/web-ui/src/static/index.html`,
`apps/web-ui/src/__tests__/registry-editor.test.ts`, `apps/web-ui/src/__tests__/app-renderers.test.ts`
**Depends on**: T8
Apply every row of the spec's Nomenclature Map: nav label "Models", sub-tabs "Active
Profile"/"Model Catalog", section headings, badges, override-count sentence, button
labels, removed-profiles heading. Routes and `data-action` ids unchanged.
**Tests**: label assertions per map row; negative check — rendered Models-tab HTML free of
"overlay", "tombstoned", "host" outside `<code>`/attributes. Covers APUX-07 / P2-D AC1.
**Gate**: `cd apps/web-ui && bun test`

### Phase 3 — Tab polish + close-out

### T10: Projects tab Delete + Files

**Where**: `apps/web-ui/src/static/app.js`, `apps/web-ui/src/__tests__/app-renderers.test.ts`
**Depends on**: T9
Header `Project / Files / Actions` (Title Case), button label "Delete", confirm text per
P2-E AC1.
**Tests**: renderer header + label + confirm-text assertions. Covers APUX-08.
**Gate**: `cd apps/web-ui && bun test`

### T11: Shared CSS pass (buttons, forms, help cards, code)

**Where**: `apps/web-ui/src/static/styles.css`, `apps/web-ui/src/static/app.js`
**Depends on**: T10
Design D-5: `.btn` variants applied to every rendered button, `.form-grid` +
input max-widths, `.button-row`, `.help-card`, `code` styling, `.banner-persist`,
`.overridden`, `.form-error`.
**Tests**: renderer assertions that every `<button` in the five tabs' output carries a
class (scan-based test); `.form-grid` present on Projects/Checkpoints forms. Covers
APUX-09 (partial — structure).
**Gate**: `cd apps/web-ui && bun test && bun run lint`

### T12: Config + Checkpoints polish

**Where**: `apps/web-ui/src/static/app.js`, `apps/web-ui/src/__tests__/config-forms.test.ts`,
`apps/web-ui/src/__tests__/app-renderers.test.ts`
**Depends on**: T11
Checkpoints form two-column `.form-grid` with Title Case labels; Config save buttons
`.btn-primary`, guides' machine tokens in `<code>`, checkbox alignment verified.
**Tests**: label casing + structure assertions. Covers APUX-09 (Config/Checkpoints slice).
**Gate**: `cd apps/web-ui && bun test`

### T13: Dashboard cards

**Where**: `apps/web-ui/src/static/dashboard.js`, `apps/web-ui/src/static/styles.css`,
`apps/web-ui/src/__tests__/dashboard.test.ts`
**Depends on**: T12
`.stat-card` grid, Title Case labels, `toLocaleString()` numbers, `<code>` ids/paths per
design D-6.
**Tests**: dashboard renderer assertions on card structure + formatted values. Covers
APUX-11 (Dashboard slice).
**Gate**: `cd apps/web-ui && bun test`

### T14: Help sections rewrite

**Where**: `apps/web-ui/src/static/app.js`, `apps/web-ui/src/__tests__/app-renderers.test.ts`,
`apps/web-ui/src/__tests__/registry-editor.test.ts`
**Depends on**: T13
All five tabs: `.help-card` titled collapsibles with rewritten plain-English prose
(new nomenclature, Save & Apply flow, per-agent/per-workflow overrides, Delete project
consequences). Replaces `?` summaries.
**Tests**: help-card structure + key-sentence assertions per tab. Covers APUX-10.
**Gate**: `cd apps/web-ui && bun test`

### T15: Close-out — CHANGELOG, artifacts, state, full gates

**Where**: `CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/project/FEATURES.json`,
`.specs/HANDOFF.md`
**Depends on**: T14
CHANGELOG `[Unreleased]` entry; `.specs` state/registry/handoff updated;
`check_specs_delivered` clean; full gate sweep.
**Tests**: none new — this task runs the aggregate gates below.
**Gate**: `cd apps/web-ui && bun test && bun run test:scripts && cd apps/tools-api && bun scripts/run-tests-isolated.ts model-registry && bun run type-check && bun run lint && bun run generate:artifacts --check && bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal-ux-overhaul --root .`

## Test Coverage Matrix

| Requirement | AC | Sensor (test) | Task |
| --- | --- | --- | --- |
| APUX-01 | P1-A 1–3 | model-profiles.test.ts agentTiers validate/merge/normalize/count | T1 |
| APUX-02 | P1-A 4–5 | generate-subagent-artifacts.test.ts override + warn + empty-silent | T2 |
| APUX-03 | P1-A 6 | model-registry.test.ts agents shape + agentsError + 501 | T3 |
| APUX-04 | P1-A 7–8 | registry-editor.test.ts agent table; admin-handlers.test.ts agentTier edit | T6 |
| APUX-05 | P1-B 4 | registry-editor.test.ts hint attributes on every editable string field | T5 |
| APUX-06 | P1-B 1 | registry-editor.test.ts Tool/Tier columns + rowspan | T4 |
| APUX-07 | P2-D 1 | registry-editor/app-renderers label + negative-vocabulary assertions | T9 |
| APUX-08 | P2-E 1–2 | app-renderers.test.ts Projects header/label/confirm | T10 |
| APUX-09 | P2-F 1–2, 4–5 | button-class scan, form-grid, casing assertions | T11, T12 |
| APUX-10 | P2-F 3 | help-card structure + prose assertions per tab | T14 |
| APUX-11 | P2-F 2, 6 | dashboard.test.ts cards + code-token assertions | T13 |
| APUX-12 | P2-D 2–6 | registry-editor forms + admin-handlers semantics + no-prompt scan | T7 |
| APUX-13 | P1-C 1–5 | admin-handlers.test.ts Save & Apply order/failures/banner; button removal | T8 |
| APUX-14 | P1-B 2–3, 5 | split/join round-trips + cell render/edit | T5 |

## Gate Check Commands

```bash
cd /Users/luizmassa/Projects/massa-ai-wt-admin-portal-ux-overhaul
cd apps/web-ui && bun test                                   # every web-ui task
bun test scripts/__tests__/model-profiles.test.ts            # T1
bun test scripts/__tests__/generate-subagent-artifacts.test.ts  # T2
cd apps/tools-api && bun scripts/run-tests-isolated.ts model-registry  # T3
bun run type-check && bun run lint                           # every task
bun run generate:artifacts --check                           # T2, T15
bun run test:scripts                                         # T15 (full)
bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal-ux-overhaul --root .  # T15
```

MCP/tool question: no MCP tool choice changes correctness here — all gates are local Bun
commands; massa-ai index tools were used for discovery only.
