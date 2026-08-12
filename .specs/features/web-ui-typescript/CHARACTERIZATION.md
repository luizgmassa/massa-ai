# Characterization — web-ui TypeScript conversion

Baseline frozen at commit `6227b4ac`, clean tree, 2026-08-11. Every figure below
was measured on this machine at that commit, not estimated. These are the
behaviours the conversion must preserve; a change to any of them is a regression
until proven otherwise.

## Subject

The 21 browser modules under `apps/web-ui/src/static/` — **4,439 lines**
(`wc -l app.js dashboard.js start-app.js wire-view-handlers.js lib/*.js views/*.js`).

```
app.js 220  dashboard.js 222  start-app.js 323  wire-view-handlers.js 363
lib/    api-client 80  banner 33  forms 19  html 47  markdown 165  theme 38        (382)
views/  checkpoints 150  config 572  handoffs 99  logs 351  memory 319
        profiles 151  projects 198  proposals 70  registry 448  registry-state 514
        search 57                                                                 (2,929)
```

## Command baselines

| Command | Result | Wall clock |
|---|---|---|
| `bun test apps/web-ui/src/__tests__/` | **700 pass, 0 fail, 15 files** | 1348 ms |
| `bun test apps/tools-api/src/__tests__/web-ui-readonly.test.ts …web-ui-render… …web-ui-views… …dashboard-views… apps/tools-api/src/routes/web-ui-static-dir.test.ts …config-section-coverage.test.ts` | **56 pass, 0 fail, 6 files** | 227 ms |
| `bun test scripts/__tests__/installer-config-template.test.ts` | **31 pass, 0 fail, 1 file** | 532 ms |

Total protecting the subject: **787 tests across 22 files.**

## Artifact baselines

| Artifact | sha256 |
|---|---|
| `apps/web-ui/src/__tests__/fixtures/render-golden.json` | `27195c2e9975ae28481d7fd6d8d778232f3df07e0556253a2dfbc05ffb77af30` |
| `apps/web-ui/src/static/index.html` | `60cb0daed27b78c0ce777a1f5aa6f4f2679c299f87fba74e56881b343df7ee58` |

`render-golden.json` is the strongest single characterization asset in the set:
`render-golden.test.ts` drives every renderer against it and compares HTML
output literally. It must survive the conversion **unmodified** — a diff to this
fixture during the refactor is the primary signal that behaviour moved.

## Behavioural contracts the conversion must not break

1. **Zero-build serving.** `apps/tools-api/src/routes/web-ui.ts` reads
   `apps/web-ui/src/static/` verbatim at request time and serves
   `.js` as `text/javascript`. `index.html:61` loads
   `<script type="module" src="/ui/app.js" defer>` — an **absolute** URL, so
   the served root must expose `app.js` at its top level.
2. **Browser-resolvable module graph.** `static-module-graph.test.ts` pins 7
   properties: ≥15 modules found, every specifier relative, every specifier
   carries an explicit `.js` extension, every specifier resolves on disk, no
   specifier escapes the root, every module reachable from `app.js`, and no
   module over **600 lines**.
3. **Frozen public surface.** `public-surface.test.ts` freezes the literal list
   of `app.js` named exports **and** the separate `globalThis.MASSA_AI_UI` list.
   The two sets differ on purpose (5 symbols global-only, `readLogsLivePreference`
   export-only).
4. **Silent-failure mode of the serving route.** An unresolved non-traversal
   path falls back to `index.html` under `content-type: text/html`. A wrong
   specifier therefore does **not** 404 — the tab renders blank and every
   `bun test` still passes. This is why contract 2 exists and why it is the
   highest-value guard in the package.
5. **Coverage floor.** `scripts/check-coverage.ts` `isMeasuredSource` accepts
   `.js` and `.ts`, excludes any path containing `/dist/`, and applies
   `LINE_COVERAGE_FLOOR = 90` per file. All 21 modules are measured subjects today.
6. **Docker image.** `Dockerfile:42` `COPY apps/web-ui ./apps/web-ui` (base) and
   `:62` `COPY --from=base /app/apps/web-ui ./apps/web-ui` (api). Base runs
   `bun run build` at `:50`, **after** the copy. CI asserts `GET /ui` returns
   `text/html` with `<!DOCTYPE html>` and `GET /ui/app.js` succeeds
   (`.github/workflows/ci.yml:359-370`).

## Cross-package consumers (the blast radius)

Read as **source text**, asserting on file contents — these break on a rename.
**Six**, not five: `web-ui-readonly.test.ts` was originally filed only under the
module-imports table below (it also `require()`s `app.js`), which is exactly why
its own `readBundleSource` source-text scan escaped both T31's original scope
and any population guard until T38/T31 (WUT-14, D7) — see tasks.md Execution Log.

| Consumer | Line | Reads |
|---|---|---|
| `apps/web-ui/src/__tests__/app-renderers.test.ts` | 1649 | `wire-view-handlers.ts` |
| `apps/web-ui/src/__tests__/registry-editor.test.ts` | 726-734 | `registry.ts`, `registry-state.ts`, `profiles.ts`, memory view |
| `apps/web-ui/src/__tests__/static-module-graph.test.ts` | 31-40 | every `.js` under `dist/static/` |
| `apps/tools-api/src/__tests__/web-ui-readonly.test.ts` | 49-68 | every `.js`+`.ts` under `src/static` (`readBundleSource`) |
| `apps/tools-api/src/routes/config-section-coverage.test.ts` | 30 | `views/config-sections.ts` |
| `scripts/__tests__/installer-config-template.test.ts` | 31 | `views/config-sections.ts` |

Imported as **modules** by explicit `.js` path:

| Consumer | Line | Imports |
|---|---|---|
| `apps/tools-api/src/__tests__/web-ui-readonly.test.ts` | 21, 27 | `app.js`, `STATIC_DIR` (also a source-text scanner, above) |
| `apps/tools-api/src/__tests__/web-ui-render.test.ts` | 13 | `app.js` |
| `apps/tools-api/src/__tests__/web-ui-views.test.ts` | 14 | `app.js` |
| `apps/tools-api/src/__tests__/dashboard-views.test.ts` | 12 | `dashboard.js` |
| `apps/web-ui/src/__tests__/view-handlers.test.ts` | 23-34 | `../static/lib/forms.js`, `../static/views/*.js` |
| `apps/web-ui/src/__tests__/public-surface.test.ts` | 30 | `../static/app.js` |

Path-only references (no content coupling):

- `apps/tools-api/src/routes/web-ui.ts:41-42` — the candidate list
- `apps/tools-api/src/routes/web-ui-static-dir.test.ts:19` — 8 tests, real
  filesystem, including a child-process probe from a cwd outside the repo
- `scripts/check-security-allowlist.ts:85` — population root `apps/web-ui/src/`,
  scoped to tracked **`.ts`** files. Today that population is `index.ts` alone;
  after conversion it gains 21 files.
- `scripts/check-coverage.ts:261-265` — the `apps/web-ui` coverage group
- `scripts/worktree-verify.sh:274` — `bun test apps/web-ui/src/__tests__/`
- `Dockerfile:38-39` — a comment asserting "apps/web-ui ships no build step"
- `.github/workflows/ci.yml:360` — a comment asserting the same

`scripts/verify-package-contents.ts` has **zero** web-ui references — the package
is `private: true` and is not published, so there is no npm packaging surface.

## Verification recipe

Re-run all three command baselines and compare literally against the table above.
A pass is 700 / 56 / 31 with 0 fail. Additionally:

- `bun run type-check` (web-ui declares it; `tsc --noEmit`)
- `bun run lint` (oxlint, root, `correctness` at error)
- `bun test apps/web-ui/src/__tests__/static-module-graph.test.ts` — the
  browser-resolvability guard, run against whatever directory is served
- `curl -sf http://localhost:3333/ui/app.js` against `bun run dev:api`
- `bun run test:coverage` — the 90%-per-file blocking gate

## Validation assets that must not be weakened

`render-golden.json`, `public-surface.test.ts`'s two frozen lists,
`static-module-graph.test.ts`'s 7 assertions (especially the 600-line cap and the
reachability walk), `web-ui-static-dir.test.ts`'s child-process probe, and the
CI Docker `/ui` + `/ui/app.js` smoke.
