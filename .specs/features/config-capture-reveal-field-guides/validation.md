# Config Tab: Capture Policy, Reveal, and Field Guides — Validation

## Summary

**Result**: PASS
**Date**: 2026-08-08
**Verifier**: standalone fresh-eyes fallback (verification-agent subagent unavailable)
**Commit range**: 9761afa..20b483c

## Per-AC Evidence

### CFG-01: Capture Policy "Not Configured" Indicator

**Status**: PASS

- `renderConfig` at `app.js:907-910` checks `config.capturePolicy === undefined` and renders a `config-info-note` div.
- Note text: "Not configured — using built-in defaults (DEFAULT_POLICY from the capture-policy pure module)".
- CSS `.config-info-note` at `styles.css:350-360` with left-border accent, italic, muted.
- Tests: `config-forms.test.ts:280-293` — note present when absent, absent when present.

### CFG-02: Reveal Shows Real Value

**Status**: PASS

- New `GET /api/v1/config/reveal?section=X&field=Y` route at `config.ts:35-63`.
- Route reads `loadConfig()`, extracts field by path, returns unmasked value.
- Only sensitive fields allowed (database.url, embedding.apiKey, llm.apiKey, security.apiKey).
- Frontend `handleConfigReveal` at `app.js:1436-1458`: async, fetches real value, sets input, toggles type.
- Second click toggles back to password + restores `***`.
- Tests: `config.test.ts:168-210` (5 backend tests), `admin-handlers.test.ts:290-337` (4 frontend tests).

### CFG-03: Per-Section Field Guides

**Status**: PASS

- Each field in `CONFIG_SECTIONS` has a `guide` string at `app.js:668-842`.
- `renderConfig` at `app.js:917-926` renders `<details class="config-field-guide"><summary>Field guide</summary>` per section.
- 15 sections all have guides. Boolean fields use "When checked, ...".
- CSS `.config-field-guide` at `styles.css:362-392`.
- Tests: `config-forms.test.ts:296-322` — 5 tests (count=15, summary text, closed, descriptions present, "When checked").

## Discrimination Sensor

3 mutations injected, 3 killed (0 survivors):

1. **Remove capturePolicy note text** → 1 CFG-01 test FAILS ✅ killed
2. **Revert reveal handler to simple toggle** → 3 CFG-02 tests FAIL ✅ killed
3. **Remove fieldGuide from render** → 4 CFG-03 tests FAIL ✅ killed

**Survivors**: 0

## Gate Results

- `bun test apps/web-ui`: 307 pass, 0 fail, 674 expect() calls
- `bun test apps/tools-api` (config.test.ts): 14 pass, 0 fail
- `bun run type-check`: 6/6 projects pass
- `bun run lint`: oxlint exit 0

## Gaps

None. All 3 ACs verified with evidence. All mutations killed.

## Verdict

**PASS** — 3/3 ACs evidenced, 3/3 mutations killed, all gates green.