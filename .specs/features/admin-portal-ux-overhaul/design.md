# Admin Portal UX Overhaul — Design

Spec: `./spec.md` (APUX-01..14). Sizing: Large — 3 Phases = 15 Tasks (see `tasks.md`).

## Components Touched

| Component | Files | Requirements |
| --- | --- | --- |
| Registry lib | `scripts/lib/model-profiles.ts` | APUX-01 |
| Generator | `scripts/generate-subagent-artifacts.ts` | APUX-02 |
| Tools API | `apps/tools-api/src/routes/model-registry.ts` | APUX-03 |
| Web UI | `apps/web-ui/src/static/{app.js,styles.css,dashboard.js}` | APUX-04..14 |
| Tests | `scripts/__tests__/model-profiles.test.ts`, `scripts/__tests__/generate-subagent-artifacts.test.ts`, `apps/tools-api/src/routes/model-registry.test.ts`, `apps/web-ui/src/__tests__/*` (+ fixtures) | all |
| Registry data | `skills/model-profiles.json` (`"agentTiers": {}`) | APUX-01 |

## D-1 — `agentTiers` Registry Section (APUX-01)

New optional top-level section, sibling of `workflowTiers`:

```jsonc
"agentTiers": {
  "builder": { "opencode": "deep" }        // agent → host → tier
}
```

- **Types**: `Registry` gains `readonly agentTiers: { readonly [agent: string]: { readonly [host: string]: string } }`.
  `OverlayData` gains `agentTiers?: Record<string, Record<string, string | null> | null>`
  (`null` at either level = D-1 tombstone).
- **Builtin ships `{}`** in `skills/model-profiles.json`. The registry's "no agent list"
  principle holds for *defaults* — charter `metadata.model_tier` stays the single source of
  each agent's default tier; `agentTiers` is opt-in override data (same standing as
  `workflowTiers`, which likewise names workflows the lib does not enumerate).
- **Validation** (`validateRegistry`): section optional → treated as `{}` when absent
  (loader injects `{}` so downstream code never branches). For each entry: every inner key
  must satisfy `isHost`, every value must be in `tiers`. Agent-name validity is NOT checked
  here (the lib knows nothing about agents — deliberate); the generator warns (D-2).
  Violation strings follow the existing path pattern: `agentTiers.builder.opencode must be
  one of light, standard, deep, got "max"`.
- **Merge** (`mergeOverlay`): per agent, per host — mirrors `mergeFlatMap` one level
  deeper. `agentTiers[agent] === null` deletes the whole agent entry;
  `agentTiers[agent][host] === null` deletes one host key; absent keys inherit.
- **Normalize** (`normalizeOverlay`): drop leaves byte-identical to the builtin at the
  same path; drop `null` tombstones for keys the builtin lacks (builtin is `{}` today, so
  every surviving leaf is an override by construction).
- **Count** (`countOverlayEntries`): +1 per surviving `agentTiers` leaf (host-level).
- **Back-compat**: version stays `1`. An old overlay without `agentTiers` is untouched; an
  old lib reading a new overlay never happens (lib and overlay live on the same machine).

## D-2 — Generator Consumption (APUX-02)

`emitHostProfile` (scripts/generate-subagent-artifacts.ts:484) becomes:

```ts
const tierOverride = registry.agentTiers?.[c.name]?.[host];
const resolved = resolveTier(registry, host, profile, tierOverride ?? c.modelTier);
```

Stale-agent warn: after loading charters, diff `Object.keys(registry.agentTiers)` against
charter names; for each unknown, print one `console.warn` line
(`[massa-ai] agentTiers names unknown agent "<name>" — ignored`) and continue. **Warn-dedup
mechanism (plan-critic blocking finding #2):** a real run calls both `emitAll` (line ~725)
and `emitVariants` (line ~740) against the same registry, so a per-entry warn would print
twice. The stale-name diff runs in ONE shared helper (`warnStaleAgentTiers(registry,
charters, warned: Set<string>)`) with a caller-supplied `Set` threaded through
`EmitOptions`; `main()` creates the Set once and passes it to both calls. The T2 test
asserts exactly one warn line across `emitAll`+`emitVariants` executed in the same test
body against the same registry — not per-function in isolation. Rationale: user-overlay
data must not hard-fail regeneration; a warn is not silent (spec assumption row).

Rejected alternative: throwing on unknown agent — consistent with "unknown profile
throws", but that philosophy governs *product* data; `agentTiers` arrives from the user
overlay, and a deleted charter would otherwise brick every regenerate until the user
hand-edits a JSON file the UI wrote.

## D-3 — `agents` Array In GET /api/v1/model-registry (APUX-03)

The GET response gains `agents: [{ name, charterTier }]` + optional `agentsError`.
Implementation mirrors the existing `profilesLib()` lazy dynamic-require pattern: lazily
require `<root>/scripts/generate-subagent-artifacts.ts` and call its exported
`loadAllCharters()`, mapping to `{ name, charterTier: c.modelTier }`. Best-effort: any
throw → `agents: [], agentsError: <message>` (the GET keeps its "200, never fails once
the checkout exists" contract; the 501 off-checkout gate is unchanged and runs first).
Reuses the real charter parser — no second frontmatter parser to drift.

**Unmocked round-trip sensor (plan-critic blocking finding #1):** the existing PUT test
suite mocks `validateRegistry`/`mergeOverlay`/`loadEffectiveRegistry` at the module
boundary, so a merge omission that silently drops `agentTiers` would stay green. T3 adds
one test that exercises the real route handler with `profilesLib()` UNMOCKED (scratch
`overlayPath`): PUT `{"agentTiers":{"builder":{"opencode":"deep"}}}` → GET asserts
`data.registry.agentTiers.builder.opencode === "deep"`.

## D-4 — Web UI

### D-4.1 Grid restructure (APUX-06)

`renderModelRegistry` row loop stays host-major. Row header cells become:

```html
<tr><th class="tool-cell" rowspan="3">Claude</th><th class="tier-cell">Light</th>...profile cells...</tr>
<tr>                                             <th class="tier-cell">Standard</th>...</tr>
```

First tier row of each host carries `rowspan=tiers.length` for the Tool cell; subsequent
rows omit it. Header row: `<th>Tool</th><th>Tier</th>` + profile columns. Tool/tier
display labels are capitalized (`Claude`, `Light`); `data-*` attributes keep raw ids.
Grid wraps in `<div class="grid-scroll">` (horizontal scroll at 7 profiles).

### D-4.2 Provider/model split-join (APUX-14, APUX-05)

Two exported pure helpers (unit-tested directly):

```js
export function splitModelId(model)  // "a/b/c" → {provider:"a", model:"b/c"}; "m" → {provider:"", model:"m"}; null → {provider:"", model:""}
export function joinModelId(provider, model) // ("a","b/c") → "a/b/c"; ("","m") → "m"; ("","") → null
```

Cell renders Provider input above Model input above Effort (existing control). Both
inputs share `data-action="registry-model"` semantics via a new change handler that reads
its sibling field and stores `joinModelId(...)` through the existing
`handleRegistryCellEdit(ctx, profile, host, tier, "model", joined)` — overlay format
unchanged. Hints (placeholder + title) per APUX-05:

- Provider: `e.g. opencode-go, zai-coding-plan, local — leave blank for Claude/Codex`
- Model: `e.g. sonnet · gpt-5.6-terra · glm-5.2`
- Other Model Catalog string fields (profile name, description, duplicate name): concrete
  example placeholders.

### D-4.3 Per-Agent Tier Overrides table (APUX-04)

New section after Per-Workflow Tier Overrides. Data: `payload.agents` (from GET) +
`display.registry.agentTiers`. Row per agent, column per tool; cell:

```html
<select data-action="registry-agentTier" data-agent="builder" data-host="opencode">
  <option value="">(default: standard)</option>
  <option value="light">Light</option> ... </select>
```

Effective selected value = `agentTiers[agent]?.[host] ?? ""`. Overridden cells get class
`overridden`. Handler `handleRegistryAgentTierEdit(ctx, agent, host, value)`: `value === ""`
deletes the override key (and empty agent objects); else sets it. Sets dirty flag.
`mergeRegistryForDisplay` gains the same per-agent/per-host merge as D-1 so unsaved edits
render. `agentsError` or empty `agents` → muted notice instead of the table.

**Cross-boundary parity fixture (reuse-scan finding 2b):** the client merge functions are
hand-copied twins of the server's (documented in app.js itself, with a prior bug from
exactly this drift). A shared JSON fixture (builtin registry + overlay with `agentTiers`
override/tombstone cases) is exercised by BOTH `scripts/__tests__/model-profiles.test.ts`
(through `mergeOverlay`) and `apps/web-ui` tests (through `mergeRegistryForDisplay`),
asserting identical merged `agentTiers` output. Full unification is blocked by the
browser/module boundary; the fixture keeps the twins provably identical.

### D-4.4 Inline forms replace prompt() (APUX-12)

New state key `state.registryForm: null | {kind: "add-profile"|"duplicate-profile"|"delete-profile"|"add-workflow"}`.
Each trigger button toggles its form; renderer emits the open form under the button row:

- **add-workflow**: workflow `<select>` (stems minus overridden) + tier `<select>` + Add + Cancel.
  All stems taken → muted notice in place of the form (replaces `alert()`).
- **duplicate-profile**: source `<select>` (display-registry profiles) + new-name `<input>` + Duplicate + Cancel.
- **delete-profile**: profile `<select>` + Delete + Cancel (tombstone semantics unchanged).
- **add-profile**: name `<input>` + description `<input>` + Add + Cancel.

Existing handlers keep their names and validation but read from the form fields instead of
`prompt()`; duplicate-name / existing-workflow errors render as inline `.form-error` text,
not `alert()`. `window.prompt`/`alert` calls in the Models tab go to zero (P2-D AC6;
memory edit prompt on the Memory tab is out of scope).

### D-4.5 Unified Save & Apply (APUX-13)

New `handleRegistrySaveAndApply(ctx)`:

1. `confirm()` — one dialog stating both steps + restart consequence.
2. PUT overlay (body = `ctx.state.registryOverlay`). Failure → error banner with
   validation details, stop (regenerate not started).
3. On success: clear dirty, reset `registryLoaded`, then run the existing
   `handleRegistryRegenerate` body (extracted into a `runRegenerateStream(ctx)` helper so
   the SSE/classification logic exists once) **without its own confirm**.
4. Success frame → `showBanner(root, "success", ..., {persist: true})` including the exact
   sentence "Restart your CLI sessions (Claude, Codex, Cursor, OpenCode) to pick up the
   changes." `showBanner` gains an options arg; persist skips the 6 s auto-hide.
5. Stream/regenerate failure → error banner "Changes saved, but applying them failed —
   press Save & Apply again to retry." (P1-C AC4; PUT is idempotent).

Buttons: `Save & Apply` + `Discard All Overrides` only. `registry-save-overlay` and
`registry-regenerate` actions are removed (renderer + wiring + tests updated).

### D-4.6 Nomenclature (APUX-07)

Label constants live inline at the render sites (no indirection layer — labels are used
once each). The spec's Nomenclature Map table is the contract; a renderer test asserts the
new labels and the absence of "overlay"/"tombstoned"/"host" in user-visible text of the
Models tab (`<code>` content and data-attributes excepted).

## D-5 — CSS (APUX-09, APUX-11)

Additions to `styles.css` (existing custom-property theme retained):

- `.btn` base + variants (`.btn-primary`, `.btn-secondary`, `.btn-danger`) — existing
  `.btn-edit/.btn-delete/.btn-approve/.btn-reject` restyled through shared rules; every
  rendered button carries at least one class (P2-F AC1).
- `.form-grid` — two-column labeled field layout, `max-width: 40rem`; `.form-field input,
  select, textarea { max-width: 28rem }` so fields stop spanning the viewport.
- `.button-row` — spaced action groups (replaces piled buttons).
- `.grid-scroll` — horizontal-scroll wrapper for wide tables.
- `.help-card` — titled collapsible help (`<details class="help-card"><summary>About this
  tab</summary>…`), replacing `.registry-help`'s bare `?` summary.
- `code` styling (monospace, subtle background) for machine tokens.
- `.banner-persist` — non-auto-hiding success banner.
- `.overridden` cell marker; `.form-error` inline error text.
- Dashboard `.stat-card` grid (D-6).

## D-6 — Five-Tab Polish Inventory (APUX-08..11)

| Tab | Changes |
| --- | --- |
| Projects | Header "Project / Files / Actions" Title Case (APUX-08); Delete button label + confirm text; Index form into `.form-grid` with Title Case labels ("Project Path", "Project ID (optional)", "Force Reindex", "Warm Cache") + placeholders; help rewritten into `.help-card` |
| Checkpoints | Create/edit form → `.form-grid` two-column with Title Case labels; buttons classed; help card added ("About checkpoints") |
| Dashboard | `dashboard.js` renderers emit `.stat-card` grid, Title Case labels, formatted values (numbers via `toLocaleString()`, ids/paths in `<code>`) |
| Config | Section save buttons → `.btn-primary`; field labels already Title Case — verify; checkbox row alignment kept; Field guide → `.help-card` styling; machine tokens in guides wrapped in `<code>` |
| Models | Everything in D-4; help sections rewritten in plain English matching the new nomenclature (Button Guide, Per-Workflow/Per-Agent overrides, Default Profile per Tool) |

## Test Design (sensor mapping)

| Sensor | File | Kills |
| --- | --- | --- |
| agentTiers validate/merge/normalize/count unit tests (incl. registry with NO `agentTiers` key → loader yields `{}`) | `scripts/__tests__/model-profiles.test.ts` | APUX-01 mutations (whole-replace instead of deep-merge; count miss; tombstone drop; missing-key crash) |
| Unmocked PUT→GET round-trip with live `profilesLib()` + scratch overlayPath | `apps/tools-api/src/routes/model-registry.test.ts` | Silent `mergeOverlay` key drop (blocking #1) |
| Client/server merge parity: shared fixture through `mergeOverlay` and `mergeRegistryForDisplay` | both suites | Twin drift (reuse 2b) |
| Generator override + warn test (fixture registry with agentTiers; assert resolved model differs per host; assert warn on stale name) | `scripts/__tests__/generate-subagent-artifacts.test.ts` | APUX-02 (`?? c.modelTier` inversion; missing warn) |
| Route test: agents array present with name+charterTier; agentsError path mocked | `apps/tools-api/src/routes/model-registry.test.ts` | APUX-03 |
| Renderer tests: Tool rowspan + Tier column; provider/model inputs + split values; hints present; agent table rows/marks; label assertions incl. negative vocabulary check; no prompt() reachable (handlers invoked with mock ctx, no prompt stub needed) | `apps/web-ui/src/__tests__/registry-editor.test.ts`, `app-renderers.test.ts` | APUX-04..07, 12, 14 |
| Handler tests: splitModelId/joinModelId round-trips (incl. multi-`/`, null); agentTier edit/default-removal; Save & Apply order (PUT before stream; failure stops stream; persist banner sentence; retry) | `apps/web-ui/src/__tests__/admin-handlers.test.ts` | APUX-13, 14, 04 |
| Projects/Checkpoints/Dashboard/Config polish assertions (classes, casing, help structure) | `app-renderers.test.ts`, `dashboard.test.ts`, `config-forms.test.ts` | APUX-08..11 |
| Fixture `model-registry-get.json` gains `agents` + an `agentTiers` override | web-ui fixtures | keeps route-contract honest |

## Risks

- **Widest change surface is app.js** (2710 lines, string-concat renderers). Mitigation:
  per-task commits, renderer tests per task, oxlint + type-check gates.
- **`registry-editor.test.ts` and `admin-handlers.test.ts` assert current labels/buttons**
  — nomenclature task must update them in the same commit (test-first per AC).
- **Save & Apply removes two established buttons** — `route-contract`/`write-mode` tests
  referencing old `data-action`s must be swept (`registry-save-overlay`,
  `registry-regenerate` literals).
- **Generator warn placement** must not print during `--check` diff runs' normal path
  (only when stale names actually exist) — otherwise `generate:artifacts --check` output
  drifts.
