# Admin Portal UX Overhaul Validation

**Date**: 2026-08-09
**Spec**: `.specs/features/admin-portal-ux-overhaul/spec.md`
**Diff range**: `main..HEAD` (b1831197..58a79a39, 18 commits) on worktree
`/Users/luizmassa/Projects/massa-ai-wt-admin-portal-ux-overhaul`, branch `spec/admin-portal-ux-overhaul`
**Verifier**: independent sub-agent (author ≠ verifier)

**Amendment (this pass)**: re-verifies fix-loop 2 (`58a79a39`, test-only, closes both gaps flagged
in the prior pass of this report) and corrects an arithmetic error in the prior pass's AC
denominator (see "Spec-Anchored Check Summary" below).

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | `agentTiers` schema/validate/merge/normalize/count — `scripts/lib/model-profiles.ts` |
| T2 | ✅ Done | Generator resolution + stale-agent warn — `scripts/generate-subagent-artifacts.ts` |
| T3 | ✅ Done | `agents` array in GET — `apps/tools-api/src/routes/model-registry.ts` |
| T4 | ✅ Done | Tool + Tier leading columns |
| T5 | ✅ Done | Provider/Model split-join + hints |
| T6 | ✅ Done | Per-Agent Tier Overrides table |
| T7 | ✅ Done | Inline dropdown forms replace `prompt()`/`alert()` |
| T8 | ✅ Done | Unified Save & Apply |
| T9 | ✅ Done | Nomenclature Scheme A |
| T10 | ✅ Done | Projects Delete + Files |
| T11 | ✅ Done | Shared CSS pass |
| T12 | ✅ Done | Config + Checkpoints polish |
| T13 | ✅ Done | Dashboard cards |
| T14 | ✅ Done | Help sections rewrite |
| T15 | ✅ Done | Close-out (CHANGELOG, `.specs` state, gates) |
| fix-loop 1 | ✅ Done | `f26ed6e3` — SSE-closed-without-`done` edge case now survives into the unified retry banner |
| fix-loop 2 | ✅ Done | `58a79a39` — test-only (149 insertions, 2 files, 0 implementation changes): closes both spec-precision gaps this report flagged in its prior pass (P2-E AC1 delete-confirm-text sensor, P2-F AC4 button-row sensor) |

All 15 tasks plus two reviewer fix-loop commits are present in `git log --oneline main..HEAD`. Tree is clean at HEAD.

---

## Spec-Anchored Acceptance Criteria

### P1-A: Per-Agent Tier Overrides (APUX-01..04)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: registry accepts optional `agentTiers`, validates host/tier, absent→`{}` | `validateRegistry` injects `{}` when absent; rejects unknown host/tier | `scripts/lib/model-profiles.ts:289-312` (validation) — `scripts/__tests__/model-profiles.test.ts:924-970`: `expect(r.agentTiers).toEqual({})` (absent), `'agentTiers.builder.emacs is not a known host...'` (unknown host), `'...must be one of light, standard, deep, got "max"'` (unknown tier) | ✅ PASS |
| AC2: `mergeOverlay` deep-merges `agentTiers` per agent/host, absent=inherit, `null`=delete | Per-agent-per-host delta merge, not whole-replace | `scripts/lib/model-profiles.ts:601-602,643-659` — `scripts/__tests__/model-profiles.test.ts:997-1027` (`expect(merged.agentTiers.builder).toEqual({claude:"standard",opencode:"deep"})`, agent-level null tombstone, host-level null tombstone, new-agent passthrough) PLUS unmocked end-to-end: `apps/tools-api/src/routes/model-registry-round-trip.test.ts:63-77` (`expect(getRes.json.data.registry.agentTiers.builder.opencode).toBe("deep")` through the REAL `mergeOverlay`+`validateRegistry`) | ✅ PASS |
| AC3: `normalizeOverlay` drops builtin-identical leaves; `countOverlayEntries` counts surviving `agentTiers` leaves | Byte-identical drop + leaf count | `scripts/lib/model-profiles.ts:710-713,749-768,806-836` — `scripts/__tests__/model-profiles.test.ts:1054+` (describe "agentTiers — normalize + count (APUX-01 AC3, P1-A AC3)") | ✅ PASS |
| AC4: `emitHostProfile` uses `agentTiers[agent][host]` when present, else charter tier | `tierOverride ?? c.modelTier` per host | `scripts/generate-subagent-artifacts.ts:495-496` — `scripts/__tests__/generate-subagent-artifacts.test.ts:525-551`: asserts the overridden (agent,host) artifact carries the override tier's model while an unmentioned host keeps the charter tier's model | ✅ PASS |
| AC5: stale agentTiers agent name → one warn line, continues | Exactly one `console.warn` naming the agent, across `emitAll`+`emitVariants` in one run | `scripts/generate-subagent-artifacts.ts:549-560` — `scripts/__tests__/generate-subagent-artifacts.test.ts:553-591` (exactly one warn across both callers sharing one `Set`), `:633-654` (empty `agentTiers` → zero warn lines, `--check` output stays stable) | ✅ PASS |
| AC6: GET gains `agents:[{name,charterTier}]`, degrades like existing 501 path | 200 with agents array; off-checkout still 501; internal failure → `agents:[]`+`agentsError`, still 200 | `apps/tools-api/src/routes/model-registry.ts:79-92,104-123` — `apps/tools-api/src/routes/model-registry.test.ts:206-233` (agents shape asserted + failure-injection → `agents:[]`+`agentsError`); existing 501 off-checkout test unchanged and still green | ✅ PASS |
| AC7: Model Catalog renders Per-Agent Tier Overrides table, one row/agent one col/tool, `(default: <charterTier>)` + declared tiers, marks overridden | Table structure + effective selection + overridden mark | `apps/web-ui/src/static/app.js:1422-1460` — `apps/web-ui/src/__tests__/registry-editor.test.ts:334-379` (rows/columns/options, "(default: standard)" label, effective-selected + `.overridden` mark, unmarked non-overridden cell, disabled in read mode, empty/agentsError notices) | ✅ PASS |
| AC8: picking a tier records `agentTiers[agent][host]`+dirty+unsaved badge; `(default)` removes key | Set-on-pick, remove-on-default, dirty flag | `apps/web-ui/src/static/app.js:1972-1986` — `apps/web-ui/src/__tests__/admin-handlers.test.ts:927-966` (sets override + dirty, adds second host without disturbing first, removes key on `""`, prunes empty agent object, no-op-but-dirty on clearing never-overridden host, lazy-inits `agentTiers`); unsaved-before-save display via `mergeRegistryForDisplay` at `apps/web-ui/src/__tests__/admin-handlers.test.ts:969-994` | ✅ PASS |

**P1-A: 8/8 ACs covered.**

### P1-B: Model Catalog Grid Restructure (APUX-06, 05, 14)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: col1=Tool (rowspan), col2=Tier, remaining=profiles | Header/rowspan structure | `apps/web-ui/src/static/app.js:1374-1385` — `apps/web-ui/src/__tests__/registry-editor.test.ts:60-113` (Tool/Tier header cells, rowspan=tiers.length, one tool cell per host's first tier row, capitalized labels with lowercase `data-*`) | ✅ PASS |
| AC2: write-mode cell shows Provider input above Model input above Effort, split on first `/` | `splitModelId` semantics + input order | `apps/web-ui/src/static/app.js:1141-1146,1363-1371` — `apps/web-ui/src/__tests__/registry-editor.test.ts:121-133,158-171` (`splitModelId("a/b/c")→{provider:"a",model:"b/c"}`, bare id, null→`{"",""}`; renders both inputs with `opencode-go`/`glm-5.2` values; empty inputs for null-model cell) | ✅ PASS |
| AC3: editing Provider/Model stores joined string via `handleRegistryCellEdit` | `joinModelId` semantics + write path | `apps/web-ui/src/static/app.js:1157-1163` — `apps/web-ui/src/__tests__/registry-editor.test.ts:135-148` (join round-trips) + `apps/web-ui/src/__tests__/admin-handlers.test.ts:897`: "stores the joined provider/model string produced by joinModelId (T5)" | ✅ PASS |
| AC4: Provider/Model hints (placeholder+title) + every other editable string field hinted | Hint text present | `apps/web-ui/src/static/app.js:1369-1370` (Provider/Model) — `apps/web-ui/src/__tests__/registry-editor.test.ts:172-179` (placeholder+title asserted on both); other fields (workflow select, new-name input, description input) hinted at `apps/web-ui/src/static/app.js:1211,1234,1267-1268` — `apps/web-ui/src/__tests__/registry-editor.test.ts:547-631` (title/placeholder attributes on each inline-form field) | ✅ PASS |
| AC5: `null` model → both inputs empty; blank save keeps `null` (never `""`/`"null"`) | Round-trip through null sentinel | `apps/web-ui/src/static/app.js:1141-1163` — `apps/web-ui/src/__tests__/registry-editor.test.ts:129-133` (`splitModelId(null)→{"",""}`), `:143-148` (`joinModelId("","")→null`, "never '' or the string 'null'"), `:167-171` (empty Provider+Model inputs render for a null-model cell) | ✅ PASS |

**P1-B: 5/5 ACs covered.**

### P1-C: Unified Save & Apply (APUX-13)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: confirm → PUT first → only on success starts SSE stream | Strict ordering, no stream on PUT failure | `apps/web-ui/src/static/app.js:2308-2325` — `apps/web-ui/src/__tests__/admin-handlers.test.ts:1627-1643`: `expect(calls).toEqual(["put","fetch"])` (order proven, not merely "both called") | ✅ PASS |
| AC2: success banner includes the exact restart sentence, does not auto-hide | Literal sentence + `persist:true` | `apps/web-ui/src/static/app.js:2199,2266-2267` — `apps/web-ui/src/__tests__/admin-handlers.test.ts:1401,1669-1687` (banner text contains the exact "Restart your CLI sessions (Claude, Codex, Cursor, OpenCode)..." sentence, banner persists) | ✅ PASS |
| AC3: overlay save failure → show validation errors, do NOT start regeneration | `fetch` never called on save failure | `apps/web-ui/src/static/app.js:2310-2320` (early `return` before `runRegenerateStream`) — `apps/web-ui/src/__tests__/admin-handlers.test.ts:1645-1656`: `expect(fetchMock).not.toHaveBeenCalled()` — this exact assertion is what caught mutation (d) below | ✅ PASS |
| AC4: save-ok+apply-fail → "saved but not applied" message, retry is safe/idempotent | Exact retry sentence + specific-reason detail (fix-loop 1) + idempotent re-PUT | `apps/web-ui/src/static/app.js:2325-2335` — `apps/web-ui/src/__tests__/admin-handlers.test.ts:1688-1747` (exact string `"Changes saved, but applying them failed — press Save & Apply again to retry. Details: Regeneration failed (exit 1)."` and the per-host / SSE-closed variants), `:1748+` (pressing again re-PUTs and can succeed) | ✅ PASS |
| AC5: no separate Save Overlay/Regenerate buttons; Discard All Overrides stays separate, confirm-gated | Exactly 2 buttons rendered | `apps/web-ui/src/static/app.js:1485-1490` — `apps/web-ui/src/__tests__/registry-editor.test.ts:396-410` ("renders exactly one Save & Apply button... no separate Save Overlay/Regenerate", "renders clear-overlay button... labeled Discard All Overrides") | ✅ PASS |

**P1-C: 5/5 ACs covered.**

**Edge case — SSE stream closes without a `done` frame (fix-loop 1, `f26ed6e3`):** Independently re-derived end-to-end. Before the fix, `runRegenerateStream` returned a bare boolean, so the unified Save & Apply retry banner showed only the generic "press Save & Apply again to retry" sentence and *discarded* the specific stream-closed diagnostic — unsatisfiable once the standalone Regenerate button (which used to show that diagnostic on its own) was removed by T8. The fix changes the return shape to `{ok, reason}` and folds `reason` into the final banner. Evidence:
  - `apps/web-ui/src/static/app.js:2199-2302` (`runRegenerateStream` returns `{ok, reason}`, `reason = "Regeneration stream closed unexpectedly."` at the no-`done`-frame branch)
  - `apps/web-ui/src/static/app.js:2325-2335` (`handleRegistrySaveAndApply` folds `reason` into `"... Details: " + reason`)
  - `apps/web-ui/src/__tests__/admin-handlers.test.ts:1440-1453` (unit level: `runRegenerateStream` alone returns `reason: "Regeneration stream closed unexpectedly."` and the banner equals it verbatim)
  - `apps/web-ui/src/__tests__/admin-handlers.test.ts:1730-1747` (end-to-end: `handleRegistrySaveAndApply` final banner is exactly `"Changes saved, but applying them failed — press Save & Apply again to retry. Details: Regeneration stream closed unexpectedly."`)
  - Independently re-run: `bun test apps/web-ui/src/__tests__/admin-handlers.test.ts` — both tests pass in the current tree (see Gate Check below).
  **Result: ✅ closed end-to-end**, both at the unit (`runRegenerateStream`) and integration (`handleRegistrySaveAndApply`) level.

### P2-D: Nomenclature + Dropdown Forms (APUX-07, 12)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: every Nomenclature Map label applied; no "overlay"/"tombstoned"/"registry"/"host" in Models-tab user-visible text | Negative-vocabulary scan | `apps/web-ui/src/static/app.js` (Scheme A labels inline at render sites) — `apps/web-ui/src/__tests__/registry-editor.test.ts:745-786` (per-row label assertions) + `apps/web-ui/src/__tests__/app-renderers.test.ts:1370,1375,1380,1388` (4-word negative-vocabulary sensor: no "overlay"/"tombstoned"/"host"/"registry" outside `<code>`/attributes) | ✅ PASS |
| AC2: Add Workflow Override → inline dropdown form (workflow − already-overridden, tier), not `prompt()` | Dropdown options = stems minus overridden | `apps/web-ui/src/static/app.js:1196-1218` — `apps/web-ui/src/__tests__/registry-editor.test.ts:547-593` (options exclude overridden stems; all-taken → muted notice, not `alert()`) | ✅ PASS |
| AC3: Duplicate Profile → inline form (source-profile dropdown + new-name input) | Dropdown from display registry | `apps/web-ui/src/static/app.js:1220-1240` — `apps/web-ui/src/__tests__/registry-editor.test.ts:594-612` | ✅ PASS |
| AC4: Delete Profile → inline form (profile dropdown), tombstone semantics unchanged | Dropdown + existing tombstone behavior | `apps/web-ui/src/static/app.js:1242-1261` — `apps/web-ui/src/__tests__/registry-editor.test.ts:613-620` | ✅ PASS |
| AC5: Add Profile → inline form (name + optional description), not `prompt()` | Two-input form | `apps/web-ui/src/static/app.js:1263-1274` — `apps/web-ui/src/__tests__/registry-editor.test.ts:621-631` | ✅ PASS |
| AC6: zero `window.prompt` calls reachable from the Models tab | Function-span-scoped scan, not whole-file | `apps/web-ui/src/__tests__/registry-editor.test.ts:712-744` ("finds at least the known Models-tab handler+renderer functions", "contains zero prompt( calls across every handleRegistry*/renderModelRegistry span", zero `alert(`, and the Memory tab's own out-of-scope `prompt()` at app.js:2389 is explicitly still present — proving the scan is span-scoped, not vacuous) | ✅ PASS |

**P2-D: 6/6 ACs covered.**

### P2-E: Projects Tab — Delete + Files (APUX-08)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: write-mode action button labeled "Delete" (`btn-delete`); click confirm text states vectors/symbols/memories removed irreversibly | Button label/class asserted; confirm-text content asserted via source-span sensor | `apps/web-ui/src/static/app.js:279` (button: `class="btn-delete" data-action="project-reset"` labeled "Delete") — `apps/web-ui/src/__tests__/app-renderers.test.ts:1015-1022` (button label+class). Confirm text at `apps/web-ui/src/static/app.js:2643`: `"Delete project " + project + "? This removes its indexed vectors, symbols and memories permanently. This cannot be undone."` — **closed by fix-loop 2, `58a79a39`**: `apps/web-ui/src/__tests__/app-renderers.test.ts:1403-1483` adds a `wireViewHandlers` source-span sensor (`extractFunctionSpan`, the same brace-depth-lexer idiom as the existing no-prompt sensor) asserting the exact literal `confirm("Delete project " + project + "? This removes its indexed vectors, symbols and memories permanently. This cannot be undone.")` lives inside the real `wireViewHandlers` function body. A click-simulation approach was tried and found vacuous first (the shared fake-DOM harness's `dataset` never carries a `project` key, so the handler's own `if (!project) return;` guard exits before `confirm()` runs — confirmed by reading `makeFakeDom` in the test file); the span sensor is non-vacuous by construction — independently re-verified by this pass: `grep -n 'Delete project '` on `app.js` finds exactly one occurrence, at line 2643, inside `wireViewHandlers` (function span 2570-2780ish), and the sensor's own sanity test additionally asserts a second, independently-known literal from the same function (`confirm("Delete checkpoint " + id + " (task: " + task + ")? This cannot be undone.")`, verified present at `app.js:2630`) to prove the extracted span is the real body, not a truncated or empty match | ✅ PASS |
| AC2: header reads "Files" (was "docs"), Title Case ("Project"/"Files"/"Actions") | Exact header text | `apps/web-ui/src/__tests__/app-renderers.test.ts:1032-1042`: `expect(html).toContain("<th>Project</th>")`, `<th>Files</th>`, `<th>Actions</th>`, negative-checks lowercase variants absent | ✅ PASS |

**P2-E: 2/2 ACs covered** (AC1 closed this pass by fix-loop 2, `58a79a39`).

### P2-F: Five-Tab UI/UX Polish (APUX-09, 10, 11)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: every `<button>` carries a class; form fields in `.form-field`/`.create-form` with max-width | Scan-based, no bare buttons | `apps/web-ui/src/__tests__/app-renderers.test.ts:1100-1193` (scan-based: `extractButtonTags` + `expect(tag).toContain("class=")` across Projects/Checkpoints/Config/Models write-mode renders, incl. every inline-form + empty-state branch); `:1195-1201` (`.form-grid` present on Projects index form + Checkpoints create form) | ✅ PASS |
| AC2: Title Case labels everywhere; machine tokens in `<code>` | Exact label text + `<code>` wrapping | `apps/web-ui/src/__tests__/app-renderers.test.ts:1206-1249` (Checkpoints/Projects Title Case labels, camelCase absence asserted) + `apps/web-ui/src/__tests__/dashboard.test.ts:87-100,167-176,209-219` (`<code>j1</code>`, session/agent/workspace ids in `<code>`, formatted large numbers) | ✅ PASS |
| AC3: help section is a titled collapsible ("About this tab") with prose, replacing bare "?" | `<details class="help-card"><summary>About this tab</summary>` | `apps/web-ui/src/static/app.js` (Models help at 1492-1519) — `apps/web-ui/src/__tests__/registry-editor.test.ts:481-541` (structure + "About this tab" text + prose content) and `apps/web-ui/src/__tests__/app-renderers.test.ts:1063-1097` (Projects/Checkpoints/Config help cards) | ✅ PASS |
| AC4: action buttons cluster in a spaced button-row, not piled | `.button-row` grouping present | `apps/web-ui/src/static/app.js` — `.button-row` renders at exactly 7 sites, all inside the Models catalog's four inline forms: lines 1202, 1213 (add-workflow: empty-state, has-options), 1225, 1235 (duplicate-profile: empty-state, has-options), 1247, 1256 (delete-profile: empty-state, has-options), 1269 (add-profile, single branch) — independently re-verified this pass via `grep -n 'class="button-row"' apps/web-ui/src/static/app.js` returning exactly those 7 lines and no others (i.e. `.button-row` never appears outside these four forms, so a passing assertion cannot be satisfied vacuously by an unrelated element). **Closed by fix-loop 2, `58a79a39`**: `apps/web-ui/src/__tests__/registry-editor.test.ts:646-711` adds one `expect(html).toContain('class="button-row"')` per site — 7 assertions covering both branches of add-workflow/duplicate-profile/delete-profile and the single branch of add-profile, a 1:1 match against the 7 real emission sites | ✅ PASS |
| AC5: Checkpoints create/edit form groups 8 fields into labeled rows, two-column `.form-grid` at desktop width | `.form-grid` + 8 Title Case labels | `apps/web-ui/src/__tests__/app-renderers.test.ts:1199-1200` (`.form-grid` on Checkpoints form) + `:1206-1225` (all 8 fields: Task ID, Description, Status, Progress Percent, Current Step, Total Steps, Completed Steps, Checkpoint Type) | ✅ PASS |
| AC6: Dashboard stats in styled cards, Title Case labels, formatted values (no raw dumps) | `.stat-card`/`.stat-grid` + `toLocaleString()` + Title Case | `apps/web-ui/src/static/dashboard.js` — `apps/web-ui/src/__tests__/dashboard.test.ts:87-100` (`stat-grid`/`stat-card` + "Tick Interval" Title Case), `:135-142` (stat-card grid on a second section), `:209-219` (formatted large numbers) | ✅ PASS |

**P2-F: 6/6 ACs covered** (AC4 closed this pass by fix-loop 2, `58a79a39`).

---

## Spec-Anchored Check Summary

**Arithmetic correction (this pass):** the prior pass of this report stated "36/39 total ACs" with
"3 spec-precision gaps," and that denominator was wrong — re-counted directly from `spec.md`'s
numbered Acceptance Criteria per story: P1-A has AC1-AC8 (8), P1-B has AC1-AC5 (5), P1-C has
AC1-AC5 (5), P2-D has AC1-AC6 (6), P2-E has AC1-AC2 (2), P2-F has AC1-AC6 (6). Sum = 8+5+5+6+2+6
= **32 total story-level ACs** (the spec's separate "Edge Cases" section — 6 unnumbered items — is
correctly tracked in its own checklist below, per `references/spec-driven/validate.md`'s own
process, which treats "Acceptance Criteria" and "Edge Cases" as two distinct steps; it is not part
of this denominator, consistent with the prior pass's treatment). The prior pass's own per-story
subtotals (8/8 + 5/5 + 5/5 + 6/6 + 1/2 + 4/6 = 29 full + 3 partial across 32, not 39) already
implied 32, not 39 — the "39" total was a transcription error in that pass's summary line, caught
during this re-derivation rather than propagated forward.

**Before this pass (pre-`58a79a39`):** 30/32 ACs fully evidenced (P1-A 8/8, P1-B 5/5, P1-C 5/5,
P2-D 6/6, P2-E 1/2, P2-F 4/6), 2 spec-precision gaps (P2-E AC1, P2-F AC4) — both implemented
correctly, neither uncovered/failing, just missing a direct assertion on the spec-named mechanism.

**After this pass (`58a79a39`, test-only, re-verified independently — see per-AC rows above):**
**32/32 total ACs matched their spec-defined outcome with direct `file:line` evidence. 0
spec-precision gaps remain.**

1. P2-E AC1 — **closed**. `apps/web-ui/src/__tests__/app-renderers.test.ts:1403-1483` adds a
   `wireViewHandlers` source-span sensor asserting the exact Delete-project `confirm()` literal,
   with a built-in non-vacuity check (a second, independently-verified literal from the same
   function span).
2. P2-F AC4 — **closed**. `apps/web-ui/src/__tests__/registry-editor.test.ts:646-711` adds 7
   `class="button-row"` assertions, one per real emission site (independently re-counted via
   `grep` against `app.js` — 7 sites, 7 assertions, 1:1, and the class appears nowhere else in the
   file).
3. Edge case — none; the SSE-closed-without-`done` edge case (fix-loop 1, `f26ed6e3`) remains
   fully closed with direct evidence (see the dedicated write-up under P1-C above).

---

## Discrimination Sensor

Sensor depth: **P0/full — 5 mutations**, spanning all 5 named target areas. All mutations run **in this worktree** (per task instruction — a scratch worktree here lacks `node_modules`/build state), one at a time, restored from a pre-mutation byte-copy and verified by SHA-256 before the next mutation. Real-worktree porcelain baseline (`git status --porcelain`) was empty before sensor work and empty again after all 5 mutations + restorations.

| # | Target | File:line mutated | Mutation | Killing suite | Population | Result |
| - | ------ | ------------------ | -------- | -------------- | ----------- | ------ |
| 1 | `mergeOverlay` agentTiers deep-merge | `scripts/lib/model-profiles.ts:602` | `result.agentTiers = mergeAgentTiers(builtin.agentTiers, overlay.agentTiers);` → `result.agentTiers = overlay.agentTiers;` (whole-replace, not deep-merge) | `bun test scripts/__tests__/model-profiles.test.ts` | 71 tests in file | ❌ Killed — 7/71 failed (agentTiers merge/normalize describe blocks) |
| 2 | Generator override resolution | `scripts/generate-subagent-artifacts.ts:496` | `resolveTier(registry, host, profile, tierOverride ?? c.modelTier)` → `resolveTier(registry, host, profile, c.modelTier ?? tierOverride)` (inverted precedence) | `bun test scripts/__tests__/generate-subagent-artifacts.test.ts` | 53 tests in file | ❌ Killed — 1/53 failed ("registry.agentTiers[agent][host] wins over the charter's own metadata.model_tier...") |
| 3 | `joinModelId` blank-blank sentinel | `apps/web-ui/src/static/app.js:1160` | `if (!p && !m) return null;` → `return "";` | `cd apps/web-ui && bun test` | 459 tests | ❌ Killed — 1/459 failed ("joins both-blank to null, never '' or the string 'null'") |
| 4 | `handleRegistrySaveAndApply` PUT-failure short-circuit | `apps/web-ui/src/static/app.js:2312-2320` | Removed the two `return;` statements after the PUT-failure/exception banners, so the regenerate stream runs even when PUT fails | `cd apps/web-ui && bun test` | 459 tests | ❌ Killed — 2/459 failed ("save failure shows the validation banner and does NOT start the stream (P1-C AC3)", "save network failure shows an error banner and does NOT start the stream") |
| 5 | Client `mergeAgentTiersForDisplay` host-level tombstone handling | `apps/web-ui/src/static/app.js:1867-1880` | Replaced the `mergeFlatMapForDisplay(...)` call (which deletes a key on `null`) with a plain spread `{ ...base[agent], ...value }` (a host-level `null` overlay value now survives as a literal `null` property instead of deleting the key — diverges from server `mergeAgentTiers` semantics) | `cd apps/web-ui && bun test` | 459 tests | ❌ Killed — 1/459 failed ("cross-boundary parity: mergeRegistryForDisplay reproduces the shared fixture's expected merged agentTiers") |

**Population**: 5/5 mutations attempted, 5/5 killed, 0 survived, 0 equivalent/dead.

**Isolation verification**:
- Pre-sensor `git status --porcelain`: empty.
- Post-sensor (after all 5 mutate→test→restore cycles) `git status --porcelain`: empty — matches baseline exactly (`diff` confirmed no output).
- Each restoration verified by SHA-256 before proceeding to the next mutation:
  - `scripts/lib/model-profiles.ts`: `bb5706c1eaefd9cfc683580d6eb1bf3c891b50b498a62e2abacddbc57a533cba` (pre and post-restore match)
  - `scripts/generate-subagent-artifacts.ts`: `3878b23a38f8d99b91b762c18073bb6f9a5b8418ae1a364af713da2172783d38` (pre and post-restore match)
  - `apps/web-ui/src/static/app.js`: `0765ce32984fce515b837d32a268f3cdcb18a60cc58bc61b268dfc5458add428` (pre and post-restore match, re-verified after all 4 app.js mutations)
- No `git checkout`/`git stash` used at any point — restoration was byte-copy-from-temp only.

**Sensor depth**: P0-full (≥5 covering all named target areas).
**Result**: 5/5 killed — **PASS ✅**

---

## Interactive UAT Results

**UAT: not applicable.** This is a non-interactive, evidence-based verification pass (independent sub-agent, no live UI session available in this environment). The spec's Independent Tests for P1-A/B/C are covered by the equivalent automated behavioral tests cited in the AC table above (unit + unmocked-round-trip level), which is the strongest available evidence in this environment. A live click-through UAT of the Model Catalog / Save & Apply flow against the real `/ui` portal was not performed and is recommended before considering this feature fully human-verified, particularly for the P2-E AC1 confirm-text gap noted above.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| No features beyond what was asked | ✅ — scope matches the 14 APUX requirements; no scope creep found in the diff |
| No abstractions for single-use code | ✅ — `splitModelId`/`joinModelId` are the only new pure helpers, each used at multiple call sites (justified) |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ — diff is scoped to `scripts/lib/model-profiles.ts`, `scripts/generate-subagent-artifacts.ts`, `apps/tools-api/src/routes/model-registry.ts`, `apps/web-ui/src/static/{app.js,dashboard.js,index.html,styles.css}`, their tests/fixtures, `skills/model-profiles.json`, and `.specs`/`CHANGELOG.md` |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns/style | ✅ — mirrors `mergeFlatMap`/`normalizeFlatMap`/`workflowTiers` precedent throughout; client/server twin pattern (with the cross-boundary parity fixture) matches the existing documented convention |
| Would senior engineer approve? | ✅ |
| Tests map to acceptance criteria and are non-shallow (spot-check one story) | ✅ — spot-checked P1-C: every AC has an assertion targeting the exact spec-named outcome (ordering via a `calls` array, exact banner strings, `not.toHaveBeenCalled()` for the no-regen-on-failure case), not merely "an assertion exists" |
| Spec-anchored outcome check | ✅ — 32/32 ACs with exact-outcome evidence (corrected denominator; was mis-stated as 36/39 in this report's prior pass — see "Spec-Anchored Check Summary"); the 2 spec-precision gaps flagged in the prior pass (P2-E AC1 confirm-text, P2-F AC4 `.button-row` class) are closed by fix-loop 2 (`58a79a39`), none silently passed |
| Per-layer Coverage Expectation met | ✅ — domain logic (`model-profiles.ts`) has 1:1 AC→test mapping including validate/merge/normalize/count; the tools-api route has both a mocked-boundary suite (existing pattern) and the new unmocked round-trip test closing the exact gap the design doc calls out (plan-critic finding #1) |
| Every test maps to a spec AC/edge case/Done-when — no unclaimed tests | ✅ — every new test file/describe block cites its APUX-NN / AC / task id in its name |
| Documented guidelines followed | `scripts/lib/model-profiles.ts` file header ("no dependency outside node:fs/node:path", "every failure is a named error") and `CLAUDE.md`'s core-layering + test-isolation conventions — followed throughout |

---

## Edge Cases

- [x] Unknown host key/tier value in `agentTiers` overlay → validation rejects with a path-named violation, surfaced in the save-error banner — `scripts/lib/model-profiles.ts:300-311` (`agentTiers.<a>.<h> is not a known host`, `...must be one of...`), reaches the UI via the existing `PUT` 400-path/`Save failed:` banner (`apps/web-ui/src/static/app.js:2312-2314`).
- [x] Checkout absent → GET degrades as today (501), Models tab shows existing degraded message; `agents` follows the same gate — `apps/tools-api/src/routes/model-registry.ts:104-108` (501 before `agents` is ever computed).
- [x] Multi-`/` model string → display splits first segment as Provider, remainder (with `/`s) as Model; join reproduces original byte-identically — `apps/web-ui/src/__tests__/registry-editor.test.ts:121-124,149-156` (round-trip test).
- [x] Every workflow stem already overridden → Add Workflow Override dropdown is empty-with-notice, not `alert()` — `apps/web-ui/src/__tests__/registry-editor.test.ts:563-587`.
- [x] Save & Apply pressed with no dirty changes → PUT still fires (idempotent no-op), proceeds to apply — the `handleRegistrySaveAndApply` code path has no dirty-flag gate before the PUT (`apps/web-ui/src/static/app.js:2308-2325` calls `ctx.api.request` unconditionally); `apps/web-ui/src/__tests__/admin-handlers.test.ts:1748+` proves a second, idempotent PUT+retry cycle.
- [x] SSE stream closes without a `done` frame → "stream closed unexpectedly" error, in-flight state cleared, **and (fix-loop 1) the specific diagnostic survives into the unified retry banner** — see the dedicated Edge Case write-up under P1-C above. This was the one AC this verifier traced end-to-end per the task's explicit instruction, and it is now closed with both unit- and integration-level evidence.

All 6 listed edge cases handled correctly.

---

## Gate Check

- **Gate commands** (re-run independently from the worktree, not reused from author evidence):
  - `cd apps/web-ui && bun test` → **459 pass, 0 fail**, 1234 expect() calls, 9 files (pre-`58a79a39`
    measurement, this report's original pass) — **re-run this pass, post-`58a79a39`: 468 pass, 0
    fail**, 1246 expect() calls, 9 files (independently confirms the author's reported figure)
  - `bun test scripts/__tests__/model-profiles.test.ts scripts/__tests__/generate-subagent-artifacts.test.ts` → **124 pass, 0 fail**, 473 expect() calls, 2 files (incl. `generate:artifacts --check`-equivalent "No drift" lines emitted inline by the generator tests)
  - `bun test apps/tools-api/src/routes/model-registry.test.ts apps/tools-api/src/routes/model-registry-round-trip.test.ts` → **23 pass, 0 fail**, 82 expect() calls, 2 files
  - `bun run type-check` → **6/6 packages successful** (turbo, cache-hit — content-addressed, reflects current tree)
  - `bun run lint` (oxlint) → **exit 0**, zero violations
  - `bun run generate:artifacts --check` → **"No drift: generated files match checked-in files."** (899 skill-bundle files + subagent artifacts, both checked)
- **Test count before feature** (measured on `main`@`b1831197`, same machine, same commands):
  - web-ui: 346 pass / 0 fail
  - model-profiles + generate-subagent-artifacts: 98 pass / **3 fail** (pre-existing "runCheck / main drift gate" + F3 read-path-split failures — environment/checkout drift on the `main` working copy, unrelated to this feature's code; not present on `spec/admin-portal-ux-overhaul`)
  - tools-api model-registry (round-trip file did not exist yet): 18 pass / 0 fail
- **Test count after feature** (this worktree, HEAD = `58a79a39`): web-ui 468 / model-profiles+generator 124 / tools-api model-registry+round-trip 23
- **Delta**: web-ui +122 (of which +9 are fix-loop 2's new sensors: 2 in `app-renderers.test.ts`,
  7 in `registry-editor.test.ts`), scripts +23 (and the 3 pre-existing `main`-checkout drift
  failures are absent here — this worktree's generated artifacts are current), tools-api +5 (4 new
  in `model-registry.test.ts` + 1 new file `model-registry-round-trip.test.ts`)
- **Skipped/environment-limited checks** (per task instruction, this machine lacks the required env):
  - `cd apps/tools-api && bun scripts/run-tests-isolated.ts` (full package, unfiltered — the filtered form `... model-registry` from tasks.md's Gate Check Commands is not actually supported by this runner's `allowedArguments`, which accepts no extra argument; confirmed by running it and getting `Unknown argument(s): model-registry`, exit 2) — the two model-registry files that matter for this feature were run directly instead (see above, 23/23 pass). Running the *full* isolated suite: 22 groups fail with `DATABASE_URL is required and must be a PostgreSQL URL` / `Cannot find module '../../generated/prisma/index.js'` — this machine has no live PostgreSQL and `packages/core/src/generated/prisma` was never generated in this worktree (`packages/core/dist/generated/prisma` exists, `src/generated` does not — a `bunx prisma generate` provisioning gap, matching the documented pattern in `CLAUDE.md`'s "fresh worktree" caveats). None of the 22 failing groups touch `model-registry*`.
  - `bun run test:scripts` (full, 1732 tests across 77 files): **1729 pass, 3 fail** — all 3 failures are in "native Tree-sitter package contract" (cold-child-process tests requiring `packages/core/src/generated/prisma/index.js`, the same missing-provisioning artifact noted above). Zero failures in any admin-portal-ux-overhaul-related file (`model-profiles.test.ts`, `generate-subagent-artifacts.test.ts` both green inside this full run too). Recorded as **environment-limited**, not a feature regression — confirmed by the fact these are pre-existing provisioning-dependent tests unrelated to `scripts/lib/model-profiles.ts` / `scripts/generate-subagent-artifacts.ts` / web-ui / tools-api model-registry.
- **Failures**: none attributable to this feature.

---

## Fix Plans

None required for the Discrimination Sensor (5/5 killed) or the Gate Check (0 feature-attributable failures). The two spec-precision gaps recorded in this report's prior pass are both **closed** by fix-loop 2 (`58a79a39`, test-only):

### Gap 1: P2-E AC1 confirm-text-on-click not directly asserted — ✅ CLOSED (`58a79a39`)

- **Root cause**: The click handler's `confirm()` string (`apps/web-ui/src/static/app.js:2643`) was written to satisfy the spec's irreversibility requirement, but no test exercised the `[data-action="project-reset"]` click listener itself.
- **Why a click-simulation fix was not used**: verified by reading the shared fake-DOM harness (`makeFakeDom` in `apps/web-ui/src/__tests__/app-renderers.test.ts`) — every wired handler attaches to one generic stable child whose `dataset` never carries a `project` key, so the real handler's `if (!project) return;` guard exits before `confirm()` would run; a click-simulation test here would pass vacuously (no dialog ever fires) rather than exercise the real message.
- **Fix delivered**: `apps/web-ui/src/__tests__/app-renderers.test.ts:1403-1483` — a `wireViewHandlers` source-span sensor (`extractFunctionSpan`, mirroring the existing no-prompt sensor's brace-depth-lexer idiom in `registry-editor.test.ts`) that extracts the real `wireViewHandlers` function body and asserts the exact confirm() literal lives inside it, with a built-in sanity check (a second, independently-known confirm literal from the same span) proving the extraction is not vacuous.
- **Verification**: re-read at HEAD by this pass; `grep -n 'Delete project '` on `app.js` confirms exactly one occurrence (line 2643) matching the asserted literal, and `grep -n 'Delete checkpoint'` confirms the sanity-check literal (line 2630) — both inside the same function. `bun test` (web-ui) re-run this pass: 468 pass, 0 fail (includes these new tests).
- **Priority**: Minor, now resolved.

### Gap 2: P2-F AC4 `.button-row` class not directly asserted — ✅ CLOSED (`58a79a39`)

- **Root cause**: `.button-row` is used consistently in the renderer but no test asserted the literal class string; the closest prior coverage (button-class scan) proved every button is classed, not specifically grouped via `.button-row`.
- **Fix delivered**: `apps/web-ui/src/__tests__/registry-editor.test.ts:646-711` — 7 `expect(html).toContain('class="button-row"')` assertions, one per real emission site (add-workflow ×2 branches, duplicate-profile ×2 branches, delete-profile ×2 branches, add-profile ×1).
- **Verification**: re-derived independently this pass via `grep -n 'class="button-row"' apps/web-ui/src/static/app.js` → exactly 7 matches (lines 1202, 1213, 1225, 1235, 1247, 1256, 1269), all inside the four inline-form renderers and nowhere else in the file — a 1:1 match against the 7 new assertions, and non-vacuous by construction (the class cannot be satisfied by an unrelated element since it appears at no other site). `bun test` (web-ui) re-run this pass: 468 pass, 0 fail (includes these new tests).
- **Priority**: Cosmetic, now resolved.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ---------- |
| APUX-01 | Pending | ✅ Verified |
| APUX-02 | Pending | ✅ Verified |
| APUX-03 | Pending | ✅ Verified |
| APUX-04 | Pending | ✅ Verified |
| APUX-05 | Pending | ✅ Verified |
| APUX-06 | Pending | ✅ Verified |
| APUX-07 | Pending | ✅ Verified |
| APUX-08 | Pending | ✅ Verified (confirm-text-on-click gap closed by fix-loop 2, `58a79a39`) |
| APUX-09 | Pending | ✅ Verified (`.button-row` class-name gap closed by fix-loop 2, `58a79a39`) |
| APUX-10 | Pending | ✅ Verified |
| APUX-11 | Pending | ✅ Verified |
| APUX-12 | Pending | ✅ Verified |
| APUX-13 | Pending | ✅ Verified — including the SSE-closed edge case, closed by fix-loop 1 (`f26ed6e3`) |
| APUX-14 | Pending | ✅ Verified |

(This verifier records the above for the orchestrator; per this session's Restrictions, it does not itself edit `spec.md` checkboxes or `.specs/project/FEATURES.json` — that update is left to the orchestrator/main agent.)

---

## Summary

**Overall**: ✅ Ready
**Result**: PASS

**Spec-anchored check**: **32/32 ACs matched spec outcome with direct evidence, 0 spec-precision
gaps remain** (corrected denominator this pass — the prior pass of this report mis-stated the
total as "36/39"; the true count, re-derived directly from `spec.md`'s numbered ACs per story, is
32 — see "Spec-Anchored Check Summary" for the full correction). Both gaps flagged in the prior
pass (P2-E AC1 confirm-text-on-click, P2-F AC4 `.button-row` class-name) are closed by fix-loop 2
(`58a79a39`, test-only, independently re-verified this pass by reading the diff, confirming the
new assertions 1:1 against the real emission sites via `grep`, and re-running the suite). The
SSE-closed edge case remains independently confirmed closed end-to-end by fix-loop 1.

**Sensor**: 5/5 mutations killed (population: mergeOverlay whole-replace, generator override-precedence inversion, joinModelId null→"" sentinel break, Save&Apply PUT-failure short-circuit removal, client agentTiers host-tombstone-handling drop) — 0 survived, 0 equivalent/dead

**Gate**: web-ui 468/468 (re-run this pass, post-`58a79a39`; was 459/459 pre-fix-loop-2), scripts (model-profiles+generator) 124/124, tools-api model-registry(+round-trip) 23/23, type-check 6/6, lint clean, generate:artifacts --check clean — 0 feature-attributable failures. Full `test:scripts` (1729/1732) and the unfiltered tools-api isolated runner have environment-limited failures (missing `DATABASE_URL`/ungenerated `packages/core/src/generated/prisma`), none in this feature's files.

**What works**: All 14 APUX requirements (P1-A/B/C MVP + P2-D/E/F polish) are implemented and covered by tests targeting their exact spec-defined outcomes, including the deep-merge/tombstone semantics parity between server (`scripts/lib/model-profiles.ts`) and client (`apps/web-ui/src/static/app.js`) enforced by a shared cross-boundary fixture; the SSE-closed-without-`done` edge case, closed end-to-end by fix-loop 1 (`f26ed6e3`); and both prior spec-precision gaps, closed test-only by fix-loop 2 (`58a79a39`).

**Issues found**: None outstanding. Both issues from this report's prior pass are resolved:
1. P2-E AC1 — confirm()-text-on-click for Project Delete: closed by a `wireViewHandlers` source-span sensor (fix-loop 2).
2. P2-F AC4 — `.button-row` class-name: closed by 7 site-scoped assertions (fix-loop 2).

**Next steps**: No fix-blocking action required. Feature is ready for the orchestrator to update `.specs/project/FEATURES.json`/`spec.md` traceability and proceed toward PR/merge per the user's process (push/PR remains subject to the standing "no self-merge without review" rule).
