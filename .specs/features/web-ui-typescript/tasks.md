# Web UI TypeScript Conversion Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/web-ui-typescript/design.md`
**Status**: In Progress — Batches 1-3 of 14 complete (see `## Execution Log`)

**Sizing note:** `PLAN.md` proposed 7 phases. The Tasks contract caps a phase at
**3 tasks (ideal 2)**, so those 7 semantic groups re-split into **14 Phases = 36
Tasks**. The extra tasks versus `PLAN.md`'s 31 are `config-sections` becoming its
own module (T23/T24) plus one-file-per-task granularity across the 21 conversions.

---

## Project Testing Guidelines Scan

| Source | What it sets |
| --- | --- |
| `CLAUDE.md` § Running tests | `apps/web-ui` runs plain `bun test` (not the isolation runner); per-test 5 s budget; a 5001 ms failure usually means a live provider, not load |
| `CONTRIBUTING.md` | Measurement discipline; the CHANGELOG merge gate |
| `AGENTS.md` | Startup contract, `projectId`, `.specs/` artifact ownership |
| `bunfig.toml` | Global 5 s per-test timeout; coverage off by default |
| `.oxlintrc.json` | `correctness` at `error`; `bun run lint` is a real CI gate |
| `scripts/check-coverage.ts:125` | `LINE_COVERAGE_FLOOR = 90` per non-excluded file — blocking via `coverage.yml` |
| `scripts/check-coverage.ts:405-414` | `isMeasuredSource` accepts `.ts`/`.js`, excludes `/dist/`, `__tests__/`, `scripts/`, `benchmarks/` |

Guidelines **were** found, so Coverage Expectation conforms to them (90% per-file
line floor) rather than to a strong default. The 15 existing suites (700 tests)
supply style, location and framework only.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `CLAUDE.md`, `CONTRIBUTING.md`, `AGENTS.md`, `bunfig.toml`, `.oxlintrc.json`, `scripts/check-coverage.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Browser module (`lib/`, `views/`, shell) | unit | ≥90% line per file; every existing assertion preserved; `render-golden.json` byte-identical | `apps/web-ui/src/__tests__/*.test.ts` | `bun test apps/web-ui/src/__tests__/` |
| Serving route (`web-ui.ts`) | integration | ≥90% line; real-filesystem resolution incl. the cwd-outside-repo child-process probe | `apps/tools-api/src/routes/web-ui-*.test.ts` | `bun test apps/tools-api/src/routes/web-ui-static-dir.test.ts` |
| Guard / sensor test file | unit | Every pre-existing assertion preserved, zero thresholds relaxed, zero exemptions added; proven discriminating by a scratch mutation | `apps/web-ui/src/__tests__/static-module-graph.test.ts` | `bun test apps/web-ui/src/__tests__/static-module-graph.test.ts` |
| Cross-package text scanner | unit | Non-zero parsed population asserted before any content assertion | `apps/tools-api/src/routes/*.test.ts`, `scripts/__tests__/*.test.ts` | `bun run test:scripts` |
| Build config (`tsconfig*.json`, `package.json`) | none | — (build gate only) | — | build gate only |
| Docs / CHANGELOG / `.specs` / registry | none | — (build gate only) | — | build gate only |

---

## Gate Check Commands

> Generated from codebase — confirm before Execute. Every command verified present in `package.json` at design time.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| quick | After a browser-module conversion task | `bun run --filter @massa-ai/web-ui build && bun test apps/web-ui/src/__tests__/` |
| full | After a task touching the serving route, a guard, or a cross-package scanner | quick, then `bun test apps/tools-api/src/__tests__/web-ui-readonly.test.ts apps/tools-api/src/__tests__/web-ui-render.test.ts apps/tools-api/src/__tests__/web-ui-views.test.ts apps/tools-api/src/__tests__/dashboard-views.test.ts apps/tools-api/src/routes/web-ui-static-dir.test.ts apps/tools-api/src/routes/config-section-coverage.test.ts` and `bun test scripts/__tests__/installer-config-template.test.ts` |
| build | After phase completion, or config/docs-only tasks | `bun run build && bun run type-check && bun run lint && bun run test && bun run test:scripts && bun run test:plugins` |
| coverage | Phase 2 and close-out only (slow) | `bun run test:coverage` |

**The quick gate carries a build prefix on purpose.** From T6 onward the
module-graph guard reads `dist/static`, and neither `bun test` nor
`bun run test:coverage` is turbo-mediated (`test:coverage` is
`bun scripts/check-coverage.ts`, a raw script). Omitting the prefix produces a red
that is an environment failure, not a code failure — design Risks row 1.

---

## Execution Plan

Phases run sequentially; tasks within a phase run in order.

| Phase | Name | Tasks |
| --- | --- | --- |
| 1 | Build configuration | T1 → T2 → T3 |
| 2 | Serve from dist | T4 → T5 → T6 |
| 3 | Dev loop and leaf modules | T7 → T8 → T9 |
| 4 | Remaining lib leaves | T10 → T11 → T12 |
| 5 | Small views A | T13 → T14 → T15 |
| 6 | Small views B | T16 → T17 → T18 |
| 7 | Large views | T19 → T20 |
| 8 | Registry pair | T21 → T22 |
| 9 | Config split and coupling | T23 → T24 → T25 |
| 10 | Shell renderers | T26 → T27 |
| 11 | Shell entry | T28 → T29 |
| 12 | Cross-package consumers | T30 → T31 |
| 13 | Retire the transitional path | T32 → T33 |
| 14 | Close-out | T34 → T35 → T36 |

---

## Task Breakdown

### Phase 1: Build configuration

#### T1: Create the emit tsconfig

**Task ID**: TASK-001
**What**: Add the emit-only compiler configuration.
**Where**: `apps/web-ui/tsconfig.build.json`
**Depends on**: None
**Reuses**: `packages/core/tsconfig.json` (`rootDir: ./src`, `outDir: ./dist`, `module: ESNext`, `moduleResolution: bundler`)
**Requirement**: WUT-01, WUT-10
**Non-goals**: converts no module; does not edit `tsconfig.json`.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `extends: "./tsconfig.json"`, `noEmit: false`, `rootDir: "./src"`, `outDir: "./dist"`, `sourceMap: true`, `inlineSources: true`, `verbatimModuleSyntax: true`
- [ ] `include: ["src/static/**/*"]` — tests are not emitted
- [ ] `bunx tsc -p apps/web-ui/tsconfig.build.json --noEmit` exits 0 against the current tree

**Tests**: none
**Gate**: build
**Commit**: `build(web-ui): add emit tsconfig for the static bundle`

#### T2: Align the type-check tsconfig

**Task ID**: TASK-002
**What**: Add `verbatimModuleSyntax` so local `type-check` cannot pass code the build rejects.
**Where**: `apps/web-ui/tsconfig.json`
**Depends on**: T1
**Reuses**: existing file
**Requirement**: WUT-10
**Non-goals**: does **not** remove `allowJs`/`checkJs` — that is T33, after the last `.js` is gone.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `verbatimModuleSyntax: true` present
- [ ] `bun run type-check` exits 0 (Plan Challenge C4 closed)

**Tests**: none
**Gate**: build
**Commit**: `build(web-ui): match verbatimModuleSyntax across both tsconfigs`

#### T3: Add build, dev, and the shared dependency

**Task ID**: TASK-003
**What**: Add `build` (tsc + asset copy + transitional copy) and `dev` (watch) scripts, and declare `@massa-ai/shared`.
**Where**: `apps/web-ui/package.json`
**Depends on**: T1
**Reuses**: `packages/core/package.json` `build` (`rm -f tsconfig.tsbuildinfo && tsc && cp -r src/generated dist/`) and `dev` (`bunx tsc --watch`)
**Requirement**: WUT-01, WUT-06, WUT-12, WUT-13
**Non-goals**: does not touch the root `dev:api` script — that is T7.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `build` runs `tsc -p tsconfig.build.json`, then copies `index.html` + `styles.css`, then copies remaining `src/static/**/*.js` on **its own line** so T32 is a one-line deletion
- [ ] `dev` is `bunx tsc -p tsconfig.build.json --watch`
- [ ] `dependencies` declares `"@massa-ai/shared": "workspace:*"`; package stays `private: true`
- [ ] `bun run --filter @massa-ai/web-ui build` produces `dist/static/` with all 21 `.js`, `index.html`, `styles.css`
- [ ] `git check-ignore -v apps/web-ui/dist/static/app.js` resolves against `.gitignore:8`

**Tests**: none
**Gate**: build
**Commit**: `build(web-ui): add tsc build and watch scripts`

### Phase 2: Serve from dist

#### T4: Convert the pilot leaf module

**Task ID**: TASK-004
**What**: Convert `lib/html.js` — 47 lines, zero imports, 4 exports, the graph's deepest leaf.
**Where**: `apps/web-ui/src/static/lib/html.ts`
**Depends on**: T3
**Reuses**: existing module body, unchanged apart from annotation
**Requirement**: WUT-07, WUT-08
**Non-goals**: no behaviour change; no other module converted.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `lib/html.js` deleted, `lib/html.ts` added, every export name preserved
- [ ] Build emits `dist/static/lib/html.js`; dependent `.js` specifiers still resolve
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail
- [ ] `bun run test:coverage` shows `lib/html.ts` measured ≥90% and **no** `dist/` file in the population

**Tests**: unit
**Gate**: coverage
**Commit**: `refactor(web-ui): convert lib/html to TypeScript`

#### T5: Serve from dist

**Task ID**: TASK-005
**What**: Repoint `buildStaticDirCandidates` at `dist/static` and update its real-filesystem suite.
**Where**: `apps/tools-api/src/routes/web-ui.ts`
**Depends on**: T4
**Reuses**: the existing 10-level walk-up, unchanged
**Requirement**: WUT-02, WUT-03
**Non-goals**: no change to the SPA fallback, traversal guard, or access-markup injection.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] Candidates become `apps/web-ui/dist/static` and `web-ui/dist/static`
- [ ] `web-ui-static-dir.test.ts` updated; all 8 tests pass **including the cwd-outside-repo child-process probe**
- [ ] `curl -sf localhost:3333/ui/app.js` → 200, `text/javascript; charset=utf-8`
- [ ] `curl -sf localhost:3333/ui` → `text/html` containing `<!DOCTYPE html>`

**Tests**: integration
**Gate**: full
**Commit**: `fix(tools-api): serve the web UI from its built output`

#### T6: Move the module-graph guard onto emitted output

**Task ID**: TASK-006
**What**: Rewrite the guard to scan `dist/static/*.js` with a loud-absence sentinel.
**Where**: `apps/web-ui/src/__tests__/static-module-graph.test.ts`
**Depends on**: T5
**Reuses**: `scripts/__tests__/skill-artifact-parity.test.ts:35-40` sentinel pattern
**Requirement**: WUT-04, WUT-05, WUT-11
**Non-goals**: **no assertion may be relaxed** — no `import type` exemption, no raised line cap, no widened tolerance.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `STATIC_DIR` resolves to `../../dist/static`
- [ ] `beforeAll` throws naming `bun run --filter @massa-ai/web-ui build` when the directory is absent
- [ ] All 7 original assertions present and passing; `git diff` shows zero threshold or exemption changes
- [ ] Discrimination sensor, three mutations in scratch, each red observed and recorded, each reverted: bare specifier injected into an emitted file; a 601-line emitted module; `rm -rf dist/static`

**Tests**: unit
**Gate**: full
**Commit**: `test(web-ui): assert the module graph against emitted output`

### Phase 3: Dev loop and leaf modules

#### T7: Extend the dev:api filter

**Task ID**: TASK-007
**What**: Make `bun run dev:api` also run the web-ui watch.
**Where**: `package.json`
**Depends on**: T3
**Reuses**: turbo's existing multi-persistent-task behaviour (`@massa-ai/core#dev` already runs beside `@massa-ai/tools-api#dev`)
**Requirement**: WUT-13
**Non-goals**: **must not** add `@massa-ai/web-ui` to `apps/tools-api` dependencies — tools-api is published, web-ui is `private: true`, and `publish.yml` would rewrite `workspace:*` to a version absent from npm (design ASM-04).
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `dev:api` is `turbo run dev --filter @massa-ai/tools-api... --filter @massa-ai/web-ui`
- [ ] `npx turbo run dev --dry-run=json` lists `@massa-ai/web-ui#dev` with a real command
- [ ] Manual: start `dev:api`, edit a `.ts` literal, save, refresh, observe the change
- [ ] Manual: devtools opens the `.ts` source, not the emitted `.js`
- [ ] `apps/tools-api/package.json` unchanged, verified by `git diff`

**Tests**: none
**Gate**: build
**Commit**: `build: run the web-ui watch alongside dev:api`

#### T8: Convert lib/forms

**Task ID**: TASK-008
**What**: Convert `lib/forms.js` (19 lines).
**Where**: `apps/web-ui/src/static/lib/forms.ts`
**Depends on**: T4
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: no behaviour change.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; `collectFormData` types the checkbox/number coercion
- [ ] `view-handlers.test.ts:23` import repointed in this task, not later
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert lib/forms to TypeScript`

#### T9: Convert lib/banner

**Task ID**: TASK-009
**What**: Convert `lib/banner.js` (33 lines).
**Where**: `apps/web-ui/src/static/lib/banner.ts`
**Depends on**: T4
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: no behaviour change.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; `BANNER_AUTOHIDE_MS` and the `opts` shape typed
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert lib/banner to TypeScript`

### Phase 4: Remaining lib leaves

#### T10: Convert lib/theme

**Task ID**: TASK-010
**What**: Convert `lib/theme.js` (38 lines).
**Where**: `apps/web-ui/src/static/lib/theme.ts`
**Depends on**: T9
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: the `massa-ai-ui-theme` key is duplicated literally in `index.html`'s no-FOUC inline script — do not rename it.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; `doc`/`store` typed against `Document`/`Storage`
- [ ] `index.html` sha256 still `60cb0dae…`
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert lib/theme to TypeScript`

#### T11: Convert lib/api-client

**Task ID**: TASK-011
**What**: Convert `lib/api-client.js` (80 lines), typing the response envelope.
**Where**: `apps/web-ui/src/static/lib/api-client.ts`
**Depends on**: T10
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: the `x-api-key` meta read and the write-mode trust signal are auth-adjacent (AD-011) — preserve both branches exactly.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; `readInjectedApiKey`, `isWriteModeEnabled`, `createApiClient` typed
- [ ] `api-key-header.test.ts` and `write-mode.test.ts` pass unmodified
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert lib/api-client to TypeScript`

#### T12: Convert lib/markdown with CDN-global typing

**Task ID**: TASK-012
**What**: Convert `lib/markdown.js` (165 lines) and type the `marked`/`DOMPurify` globals.
**Where**: `apps/web-ui/src/static/lib/markdown.ts`
**Depends on**: T11
**Reuses**: `packages/core/src/services/web/html-to-md.ts:18-26` — minimal local shape plus cast, the repo's convention for untyped third-party surfaces (the repo ships **zero** `.d.ts` files)
**Requirement**: WUT-07, WUT-08, WUT-09
**Non-goals**: **no `declare global`** — it types the globals as unconditionally present and contradicts the load-bearing `if (markedLib && purifyLib)` fallback at `markdown.js:26-27`. **No bare import** of `marked`/`dompurify` types.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] Minimal local interfaces for `parse(string): string` and `sanitize(string): string`, applied by cast at the two `globalThis` reads
- [ ] The CDN-absent fallback branch stays reachable and type-visible
- [ ] Emitted `dist/static/lib/markdown.js` carries no bare specifier (module-graph guard confirms)
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert lib/markdown to TypeScript`

### Phase 5: Small views A

#### T13: Convert views/search

**Task ID**: TASK-013
**What**: Convert `views/search.js` (57 lines).
**Where**: `apps/web-ui/src/static/views/search.ts`
**Depends on**: T12
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: no behaviour change.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`, exports preserved
- [ ] `render-golden.json` sha256 unchanged
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert views/search to TypeScript`

#### T14: Convert views/proposals

**Task ID**: TASK-014
**What**: Convert `views/proposals.js` (70 lines).
**Where**: `apps/web-ui/src/static/views/proposals.ts`
**Depends on**: T13
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: no behaviour change.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`, exports preserved
- [ ] `render-golden.json` sha256 unchanged
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert views/proposals to TypeScript`

#### T15: Convert views/handoffs

**Task ID**: TASK-015
**What**: Convert `views/handoffs.js` (99 lines).
**Where**: `apps/web-ui/src/static/views/handoffs.ts`
**Depends on**: T14
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: no behaviour change.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`, exports preserved
- [ ] `render-golden.json` sha256 unchanged
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert views/handoffs to TypeScript`

### Phase 6: Small views B

#### T16: Convert views/checkpoints

**Task ID**: TASK-016
**What**: Convert `views/checkpoints.js` (150 lines).
**Where**: `apps/web-ui/src/static/views/checkpoints.ts`
**Depends on**: T15
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: `CHECKPOINTS_LIST_BODY` is read by `route-contract.test.ts` against a shared fixture — do not change its shape.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`, exports preserved
- [ ] `route-contract.test.ts` passes unmodified
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert views/checkpoints to TypeScript`

#### T17: Convert views/profiles

**Task ID**: TASK-017
**What**: Convert `views/profiles.js` (151 lines).
**Where**: `apps/web-ui/src/static/views/profiles.ts`
**Depends on**: T16
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: it imports `renderModelRegistry` from `./registry.js`, still JavaScript at this point — keep the `.js` specifier. Module specifiers resolve `.js` → `.ts` automatically (see Execution Log D5); do not rewrite them.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`, exports preserved
- [ ] `registry-editor.test.ts:728` **`fs.readFileSync` path** repointed from `views/profiles.js` to `.ts` — a filesystem path, not a module specifier, so it does not auto-resolve and will throw ENOENT otherwise (Execution Log D5)
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert views/profiles to TypeScript`

#### T18: Convert views/projects

**Task ID**: TASK-018
**What**: Convert `views/projects.js` (198 lines).
**Where**: `apps/web-ui/src/static/views/projects.ts`
**Depends on**: T17
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: preserve the index-job progress state machine (SSE frame, polling fallback) exactly.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`, exports preserved
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert views/projects to TypeScript`

### Phase 7: Large views

#### T19: Convert views/memory

**Task ID**: TASK-019
**What**: Convert `views/memory.js` (319 lines).
**Where**: `apps/web-ui/src/static/views/memory.ts`
**Depends on**: T18
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08, WUT-14
**Non-goals**: the retype-to-confirm bulk delete is destructive-adjacent — preserve its guard exactly.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; `MEMORY_TYPES`/`MEMORY_LEVELS` typed as const tuples
- [ ] `registry-editor.test.ts`'s memory-view source read repointed to `.ts`
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert views/memory to TypeScript`

#### T20: Convert views/logs

**Task ID**: TASK-020
**What**: Convert `views/logs.js` (351 lines).
**Where**: `apps/web-ui/src/static/views/logs.ts`
**Depends on**: T19
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: the live tail deliberately avoids `EventSource` (it cannot set `x-api-key`; a query-string key would leak into access logs) — preserve the fetch-stream implementation.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; `logsDatetimeLocalToIso` and the log-entry shape typed
- [ ] The doc comment containing `"explicitly off" from "never chosen"` survives — it previously broke a naive specifier regex, keeping the guard's comment-stripping exercised
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert views/logs to TypeScript`

### Phase 8: Registry pair

#### T21: Convert views/registry

**Task ID**: TASK-021
**What**: Convert `views/registry.js` (448 lines), the pure renderer half of the Model Catalog.
**Where**: `apps/web-ui/src/static/views/registry.ts`
**Depends on**: T20
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08, WUT-14
**Non-goals**: no renderer behaviour change.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; `REGISTRY_HOSTS` typed as a const tuple
- [ ] `registry-editor.test.ts:726` source read repointed to `.ts`
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert views/registry to TypeScript`

#### T22: Convert views/registry-state

**Task ID**: TASK-022
**What**: Convert `views/registry-state.js` (514 lines), the overlay state machine.
**Where**: `apps/web-ui/src/static/views/registry-state.ts`
**Depends on**: T21
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08, WUT-14
**Non-goals**: the overlay is a **delta** against the builtin registry (absent key = inherit). A type annotation must not turn an absent key into an explicit `undefined` — that changes merge semantics.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; delta semantics preserved via optional properties, not `| undefined`
- [ ] `registry-editor.test.ts:727` source read repointed to `.ts`
- [ ] Line count stays ≤600
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert views/registry-state to TypeScript`

### Phase 9: Config split and coupling

#### T23: Split the config schema out, still JavaScript

**Task ID**: TASK-023
**What**: Move the 15-section `CONFIG_SECTIONS` schema into its own module and repoint every consumer, as a pure move with no conversion.
**Where**: `apps/web-ui/src/static/views/config-sections.js` (new), plus `views/config.js` and the two external scanners named below
**Depends on**: T22
**Reuses**: the existing `CONFIG_SECTIONS` literal, moved verbatim
**Requirement**: WUT-11, WUT-14
**Non-goals**: no annotation, no behaviour change, no section-key renaming.
**Tools**: MCP: NONE · Skill: NONE

> **Granularity exception, deliberate.** Four files in one task. `config-section-coverage.test.ts:30` and `installer-config-template.test.ts:31` parse `views/config.js` as **source text** for section keys. If the keys move without those two being repointed in the same commit, they do not fail — they pass **vacuously** on zero matches, which reads as success. Two tasks would create exactly that window.

**Done when**:
- [ ] `config-sections.js` holds `CONFIG_SECTIONS`; `config.js` imports via `./config-sections.js` and re-exports for compatibility
- [ ] Both files ≤600 lines
- [ ] `config-section-coverage.test.ts:30` and `installer-config-template.test.ts:31` repointed
- [ ] **Each repointed suite asserts a non-zero parsed population before asserting content** (WUT-14 AC2)
- [ ] Scratch: point each scanner at an empty file → each fails; both reds observed, both reverted
- [ ] `render-golden.json` sha256 unchanged

**Tests**: unit
**Gate**: full
**Commit**: `refactor(web-ui): split the config section schema into its own module`

#### T24: Convert config-sections and couple it to MassaAiConfig

**Task ID**: TASK-024
**What**: Convert the schema module and type its section keys against the real server config type. **This is the feature's stated payoff.**
**Where**: `apps/web-ui/src/static/views/config-sections.ts`
**Depends on**: T23
**Reuses**: `@massa-ai/shared` `MassaAiConfig`; the dependency edge declared in T3
**Requirement**: WUT-11, WUT-12
**Non-goals**: no runtime change; the emitted `.js` must carry no `@massa-ai/shared` reference.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `import type { MassaAiConfig } from "@massa-ai/shared"` and `type ConfigSectionKey = keyof MassaAiConfig`
- [ ] `ConfigSection`/`ConfigField` interfaces defined; `CONFIG_SECTIONS: ConfigSection[]`
- [ ] `grep -c 'massa-ai/shared' dist/static/views/config-sections.js` → **0** (WUT-11 AC3)
- [ ] Module-graph guard green — no bare specifier reached the emit
- [ ] **Discrimination sensor for the payoff**: in scratch, add a `MassaAiConfig` key with no matching section → `bun run type-check` red; remove a section key → red. Both reds observed and recorded, both reverted
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: full
**Commit**: `refactor(web-ui): couple the config schema to MassaAiConfig`

#### T25: Convert views/config

**Task ID**: TASK-025
**What**: Convert the renderer/handler half of the config tab.
**Where**: `apps/web-ui/src/static/views/config.ts`
**Depends on**: T24
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: per-section save coercion and the secret-reveal path are behaviour — preserve exactly.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; `buildConfigSectionBody`, `handleConfigSave`, `handleConfigReveal` typed
- [ ] Line count ≤600 — **the cap is not to be raised** (design Risks row 2)
- [ ] `config-forms.test.ts` and `restart-handlers.test.ts` pass unmodified
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert views/config to TypeScript`

### Phase 10: Shell renderers

#### T26: Convert dashboard

**Task ID**: TASK-026
**What**: Convert `dashboard.js` (222 lines).
**Where**: `apps/web-ui/src/static/dashboard.ts`
**Depends on**: T25
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08, WUT-14
**Non-goals**: `dashboard.js` carries its own private `escapeHtml` — do not dedupe it against `lib/html`; that is a behaviour-adjacent refactor outside this feature.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; `fetchDashboardData` and its unwrap shape typed
- [ ] `apps/tools-api/src/__tests__/dashboard-views.test.ts:12` `require` repointed
- [ ] `dashboard.test.ts` passes unmodified

**Tests**: unit
**Gate**: full
**Commit**: `refactor(web-ui): convert dashboard to TypeScript`

#### T27: Convert wire-view-handlers

**Task ID**: TASK-027
**What**: Convert `wire-view-handlers.js` (363 lines).
**Where**: `apps/web-ui/src/static/wire-view-handlers.ts`
**Depends on**: T26
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08, WUT-14
**Non-goals**: rebinding-from-scratch after each render is deliberate — do not introduce listener tracking.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; the `data-action`/`data-filter` dispatch map typed
- [ ] `app-renderers.test.ts:1649` source read repointed to `.ts`
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert wire-view-handlers to TypeScript`

### Phase 11: Shell entry

#### T28: Convert start-app

**Task ID**: TASK-028
**What**: Convert `start-app.js` (323 lines) and give the app state a real type.
**Where**: `apps/web-ui/src/static/start-app.ts`
**Depends on**: T27
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08
**Non-goals**: preserve the SSE subscription, hash route, and `beforeunload` guard exactly.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; an `AppState` interface types the state object
- [ ] `start-app-dispatch.test.ts` passes unmodified
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert start-app to TypeScript`

#### T29: Convert app, the barrel

**Task ID**: TASK-029
**What**: Convert `app.js` (220 lines) — the last module, and the one whose export surface is frozen.
**Where**: `apps/web-ui/src/static/app.ts`
**Depends on**: T28
**Reuses**: existing module body
**Requirement**: WUT-07, WUT-08, WUT-14
**Non-goals**: **do not edit either frozen list in `public-surface.test.ts`.** The named-export set and the `globalThis.MASSA_AI_UI` set differ on purpose — 5 symbols are global-only, `readLogsLivePreference` is export-only.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `.ts` replaces `.js`; every re-export preserved
- [ ] `public-surface.test.ts` passes with `git diff` on that file **empty**
- [ ] `dist/static/app.js` emitted and reachable from the module-graph walk
- [ ] `curl -sf localhost:3333/ui/app.js` → 200 against a running `dev:api`

**Tests**: unit
**Gate**: full
**Commit**: `refactor(web-ui): convert app barrel to TypeScript`

### Phase 12: Cross-package consumers

#### T30: Repoint the remaining tools-api module requires

**Task ID**: TASK-030
**What**: Repoint the three `require("../../../web-ui/src/static/app.js")` sites left after T26.
**Where**: `apps/tools-api/src/__tests__/web-ui-readonly.test.ts`, `apps/tools-api/src/__tests__/web-ui-render.test.ts`, `apps/tools-api/src/__tests__/web-ui-views.test.ts`
**Depends on**: T29
**Reuses**: existing suites, assertions untouched
**Requirement**: WUT-14
**Non-goals**: path repoint only — no assertion body changes.
**Tools**: MCP: NONE · Skill: NONE

> **Granularity note**: three files (`web-ui-readonly`, `web-ui-render`, `web-ui-views`), one mechanical change, one cohesive unit. Splitting leaves the repo red between commits.

**Done when**:
- [ ] All three `require` paths resolve to `app.ts`; `STATIC_DIR` in `web-ui-readonly.test.ts:27` repointed
- [ ] 56 tests across the 6 tools-api web-ui suites pass, 0 fail
- [ ] `git diff` shows no assertion body changed

**Tests**: unit
**Gate**: full
**Commit**: `test(tools-api): repoint web-ui module requires at the TypeScript sources`

#### T31: Prove every text-scanning suite still discriminates

**Task ID**: TASK-031
**What**: Add a non-zero population assertion to each of the five source-text scanners and observe each red.
**Where**: `apps/web-ui/src/__tests__/app-renderers.test.ts` plus `registry-editor.test.ts`, verifying the three repointed in T23/T26
**Depends on**: T30
**Reuses**: lesson L-001 (`scope:test-strength`) — a missing-population path with no discriminating test
**Requirement**: WUT-14
**Non-goals**: no content assertions added or removed.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] Each of the 5 scanners asserts a non-zero parsed population before content assertions
- [ ] Scratch: point each scanner at an empty file → each fails. 5 reds observed and recorded, all reverted
- [ ] `bun run test:scripts` green

**Tests**: unit
**Gate**: full
**Commit**: `test(web-ui): assert non-zero population in every source-text scanner`

### Phase 13: Retire the transitional path

#### T32: Retire the transitional copy-through

**Task ID**: TASK-032
**What**: Delete the `.js` copy line from the build script now that no `.js` remains under `src/static/`.
**Where**: `apps/web-ui/package.json`
**Depends on**: T31
**Reuses**: the one-line shape established in T3
**Requirement**: WUT-06, WUT-07
**Non-goals**: the `index.html` + `styles.css` copy line is permanent — do not remove it.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] The transitional `.js` copy line deleted, a one-line diff
- [ ] **`git ls-files 'apps/web-ui/src/static/**/*.js'` returns zero rows** — the terminal-state proof
- [ ] `bun run --filter @massa-ai/web-ui build` still produces a complete `dist/static/`
- [ ] Module-graph guard green; `curl -sf localhost:3333/ui/app.js` → 200

**Tests**: none
**Gate**: build
**Commit**: `build(web-ui): retire the transitional JavaScript copy-through`

#### T33: Drop allowJs and checkJs

**Task ID**: TASK-033
**What**: Remove the now-meaningless JavaScript interop flags.
**Where**: `apps/web-ui/tsconfig.json`
**Depends on**: T32
**Reuses**: existing file
**Requirement**: WUT-09
**Non-goals**: `verbatimModuleSyntax` from T2 stays.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] Neither `allowJs` nor `checkJs` present
- [ ] `bun run type-check` exits 0 and covers all 21 modules under `strict`

**Tests**: none
**Gate**: build
**Commit**: `build(web-ui): drop allowJs and checkJs`

### Phase 14: Close-out

#### T34: Measure the security-allowlist population change

**Task ID**: TASK-034
**What**: Run the primitive scanner now that `apps/web-ui/src/` holds 22 tracked `.ts` files instead of 1, and record the measured counts.
**Where**: `scripts/security-allowlist.txt` — edited only if a real hit appears
**Depends on**: T33
**Reuses**: `scripts/check-security-allowlist.ts`, unchanged
**Requirement**: WUT-15
**Non-goals**: do **not** pre-emptively allowlist anything. Record zero as zero.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `bun scripts/check-security-allowlist.ts` run; population size printed and recorded (expected 1 → 22)
- [ ] Hit counts across `child-process`, `bun-spawn`, `raw-sql-unsafe`, `dynamic-eval` recorded — the measurement is the deliverable, not the assumption that browser code produces none
- [ ] Any hit triaged in this task rather than allowlisted silently

**Tests**: none
**Gate**: build
**Commit**: `chore(security): record the web-ui allowlist population after conversion`

#### T35: Correct the stale no-build-step claims

**Task ID**: TASK-035
**What**: Update every place asserting `apps/web-ui` ships no build step, and add the CHANGELOG entry.
**Where**: `CHANGELOG.md`, `Dockerfile`, `.github/workflows/ci.yml`, `apps/web-ui/src/index.ts`, `CLAUDE.md`, `docs/ONBOARDING.md`, `.specs/features/web-ui-typescript/CHARACTERIZATION.md`
**Depends on**: T34
**Reuses**: existing files
**Requirement**: WUT-16
**Non-goals**: **no `COPY` line changes in `Dockerfile`** — base already runs `bun run build` at `:50` after `COPY apps/web-ui` at `:42`, and api copies the built tree at `:62`. Only the comment at `:38-39` is false.
**Tools**: MCP: NONE · Skill: NONE

> Sites: `Dockerfile:38-39`, `.github/workflows/ci.yml:360`, `apps/web-ui/src/index.ts`, `CLAUDE.md`, `docs/ONBOARDING.md:102`, `.specs/features/web-ui-typescript/CHARACTERIZATION.md`.

**Done when**:
- [ ] `git grep -n 'no build step' -- Dockerfile .github docs apps/web-ui CLAUDE.md` returns zero rows
- [ ] `apps/web-ui/src/index.ts` no longer claims the static set is "intentionally NOT type-checked"
- [ ] `CHARACTERIZATION.md`'s canonical baseline command restated as the turbo-mediated form (design Risks row 1)
- [ ] `CHANGELOG.md` entry under `[Unreleased]` per `CONTRIBUTING.md` § CHANGELOG authoring — the CI merge gate requires it

**Tests**: none
**Gate**: build
**Commit**: `docs: correct the web-ui no-build-step claims`

#### T36: Close out the specs and append AD-021

**Task ID**: TASK-036
**What**: Write the feature's final `.specs/` state and append the project decision, before the first push.
**Where**: `.specs/project/STATE.md` plus `.specs/HANDOFF.md` and `.specs/project/FEATURES.json`
**Depends on**: T35
**Reuses**: the existing STATE Decisions table and HANDOFF rotation convention
**Requirement**: WUT-01, WUT-16
**Non-goals**: this is the last commit before push — no commits may land between it and PR creation.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] `STATE.md` `## Decisions` gains **AD-021**, extending AD-016's "consumers chain the generation" principle to every untracked generated root, naming `apps/web-ui/dist/` as the second instance and the `beforeAll` sentinel as the enforcement pattern where a consumer cannot chain the build itself
- [ ] **Highest existing AD re-checked at append time** (AD-020 at design time) — AD-014 records a pre-assigned number already being taken at close-out
- [ ] `HANDOFF.md` rotated: rename the current section to Previous **first**, then prepend, then assert the section count grew
- [ ] `FEATURES.json` `phases.execute: true`, `status: complete`, `validation` path set
- [ ] `bun skills/massa-ai/scripts/check_specs_delivered.ts web-ui-typescript --root .` exits 0

**Tests**: none
**Gate**: build
**Commit**: `docs(specs): close out the web-ui TypeScript conversion`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → ... → Phase 14   (strictly sequential)

Within-phase edges only. Cross-phase dependencies are implied by phase order
and listed in the table below.

P1:  T1 ──→ T2
     T1 ──→ T3
P2:  T4 ──→ T5 ──→ T6
P3:  (no within-phase edges: T7, T8, T9 each depend on an earlier phase)
P4:  T10 ──→ T11 ──→ T12
P5:  T13 ──→ T14 ──→ T15
P6:  T16 ──→ T17 ──→ T18
P7:  T19 ──→ T20
P8:  T21 ──→ T22
P9:  T23 ──→ T24 ──→ T25
P10: T26 ──→ T27
P11: T28 ──→ T29
P12: T30 ──→ T31
P13: T32 ──→ T33
P14: T34 ──→ T35 ──→ T36
```

Cross-phase edges, all pointing backward:

| Edge | From phase | To phase |
| --- | --- | --- |
| T3 → T4 | 1 | 2 |
| T3 → T7 | 1 | 3 |
| T4 → T8, T4 → T9 | 2 | 3 |
| T9 → T10 | 3 | 4 |
| T12 → T13 | 4 | 5 |
| T15 → T16 | 5 | 6 |
| T18 → T19 | 6 | 7 |
| T20 → T21 | 7 | 8 |
| T22 → T23 | 8 | 9 |
| T25 → T26 | 9 | 10 |
| T27 → T28 | 10 | 11 |
| T29 → T30 | 11 | 12 |
| T31 → T32 | 12 | 13 |
| T33 → T34 | 13 | 14 |

Execution is strictly sequential — no intra-phase parallelism.

> **Diagram encoding note.** `validate_tasks.ts`'s `parseDiagramOrder` stores a
> **per-line** index and lets later lines overwrite earlier ones. A chain that
> repeats the previous phase's last task as its leading token (`P5: T12 ──→ T13
> ──→ …`) therefore resets that task's position to 0, making its within-phase
> predecessor look like it comes after. v1 of this file did exactly that and
> produced 11 spurious ordering errors. Keep each phase's chain limited to its
> own tasks; cross-phase edges belong in the table above, which the validator
> skips by design (`pDep !== pHere → continue`).

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1, T2, T3, T7, T32, T33 | 1 config file each | ✅ Granular |
| T4, T8-T22, T24-T29 | 1 module each | ✅ Granular |
| T5 | 1 route plus its co-located suite | ✅ Granular (test co-location) |
| T6 | 1 test file | ✅ Granular |
| T23 | 4 files — schema split plus 2 external scanner repoints | ⚠️ Cohesive, **deliberate**: splitting opens a window where the scanners pass vacuously on zero matches |
| T30 | 3 test files, one mechanical repoint | ⚠️ Cohesive: splitting leaves the repo red between commits |
| T31 | 2 test files plus verification of 3 more | ⚠️ Cohesive: one sensor-strengthening pass |
| T34 | 0-1 files; the measurement is the deliverable | ✅ Granular |
| T35 | 7 doc/config sites, one class of stale claim | ⚠️ Cohesive |
| T36 | 3 `.specs` files, the workflow's own close-out contract | ⚠️ Cohesive |

No ❌. Five ⚠️ rows, each with a stated reason why splitting would be worse.

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (root) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T1 | T1 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T3 | T3 → T7 | ✅ Match |
| T8 | T4 | T4 → T8 | ✅ Match |
| T9 | T4 | T4 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T19 | T19 → T20 | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |
| T22 | T21 | T21 → T22 | ✅ Match |
| T23 | T22 | T22 → T23 | ✅ Match |
| T24 | T23 | T23 → T24 | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |
| T26 | T25 | T25 → T26 | ✅ Match |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | T27 | T27 → T28 | ✅ Match |
| T29 | T28 | T28 → T29 | ✅ Match |
| T30 | T29 | T29 → T30 | ✅ Match |
| T31 | T30 | T30 → T31 | ✅ Match |
| T32 | T31 | T31 → T32 | ✅ Match |
| T33 | T32 | T32 → T33 | ✅ Match |
| T34 | T33 | T33 → T34 | ✅ Match |
| T35 | T34 | T34 → T35 | ✅ Match |
| T36 | T35 | T35 → T36 | ✅ Match |

All 36 match. No dependency points to a later phase — every cross-phase edge (T3→T4, T3→T7, T4→T8, T4→T9, T9→T10, T12→T13, T15→T16, T18→T19, T20→T21, T22→T23, T25→T26, T27→T28, T29→T30, T31→T32, T33→T34) points backward.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1, T2, T3, T7, T32, T33 | Build config | none | none | ✅ OK |
| T4, T8-T22, T24-T29 | Browser module | unit | unit | ✅ OK |
| T5 | Serving route | integration | integration | ✅ OK |
| T6 | Guard / sensor test | unit | unit | ✅ OK |
| T23 | Browser module + cross-package text scanner | unit (highest of the two) | unit | ✅ OK |
| T30, T31 | Cross-package text scanner | unit | unit | ✅ OK |
| T34 | none (measurement) | none | none | ✅ OK |
| T35, T36 | Docs / registry | none | none | ✅ OK |

No ❌ VIOLATION. No task defers its tests to a later task.

**Note on the conversion tasks:** each converts a module already covered by the
700-test suite. The Coverage Expectation is met by the **existing** tests
continuing to pass at ≥90% per-file line coverage — not by writing new ones. New
assertions are added only where the conversion creates a new failure mode: T6 (the
guard's new subject), T23 and T31 (vacuous-scan risk), T24 (the type coupling's
discrimination sensor).

---

## MCP and Skill Question

Asked and answered — **none selected**. Every task is a local file edit verified by
a local command; no task's correctness or verification changes with tool choice.
`mcp__massa-ai__*` search tools remain available for navigation, but no task
depends on one.

---

## Execution Log

Orchestrator-maintained. One row per completed task; deviations recorded with
their resolution.

### Batch 1 — Phase 1 (build configuration) — Complete

| Task | Commit | Result |
| --- | --- | --- |
| T1 | `bb0f8e74` | `tsconfig.build.json`, 12 lines |
| T2 | `7f092b56` | `verbatimModuleSyntax` on `tsconfig.json`, 1 line |
| T3 | `e4425912` | build/dev scripts + `@massa-ai/shared` dep; `bun.lock` +12/−9 |
| T3 fix | `bed47a42` | transitional copy narrowed to `.js`, 1 line |

Tests: `bun test apps/web-ui/src/__tests__/` 700 pass / 0 fail throughout.
Build verified from clean: 21 `.js` + `index.html` + `styles.css` in `dist/static/`.

**Deviation D1 — T3 copied everything, not `.js` (found by orchestrator, fixed).**
The committed script ended `cp -r src/static/. dist/static/`. Invisible at Phase 1
because `src/static/` held only `.js`/`.html`/`.css`, so every gate was legitimately
green; it would have copied TypeScript sources into the served directory from T4
onward, where the `.js`-only module-graph guard could never see them. Proven by
dropping a scratch `.ts` into `src/static/`, building, and observing it in
`dist/static/`. Fixed in `bed47a42` and re-proven absent, with the probe still
compiling to `.js` so the filter does not suppress real emit.

**Deviation D2 — "pre-existing failure" labels were partly wrong (measured, no code change).**
The worker reported four classes of environment-caused failures outside its write set.
Verified independently:

| Claimed | Measured |
| --- | --- |
| `apps/opencode-plugin/__tests__/install.test.ts` | **Confirmed pre-existing** — 8 fail on clean `main` @ `6227b4ac` |
| `scripts/tests/test-plugin-auto-install.sh`, 18 failures | **Contradicted** — 201/0 green on `main` *and* 201/0 green in the worktree at `bed47a42`. Session residue inside the worker, not a repository state |
| `packages/core/.../scheduler-store-pg.test.ts` DB contamination | Not yet verified — check before the final gate |
| `apps/tools-api/src/routes/logs.test.ts` under turbo concurrency | Not yet verified — check before the final gate |

Consequence for later batches: gate levels are chosen to avoid installer suites for
batches that do not touch them, and no worker's "pre-existing" label is accepted
without running the named suite at both the baseline commit and the worker's own HEAD.

**Deviation D3 — T4's `Gate: coverage` is not runnable as written (correction below).**
`bun run test:coverage` is `bun scripts/check-coverage.ts`, which requires the
dedicated database contract (`MASSA_AI_DEDICATED=1` plus
`127.0.0.1:5433/massa_ai_test`) and `RUN_POSTGRES_TESTS=1`; without them ten-plus
core suites skip and the gate reports phantom below-floor files rather than the
truth. T4's actual claim is narrower — that `lib/html.ts` is measured ≥90% and no
`dist/` file enters the population. That is provable with a package-scoped run:

```
cd apps/web-ui && bun test --coverage --coverage-reporter=lcov --coverage-dir=coverage
```

then reading the lcov for the `lib/html.ts` record and for any `SF:` path containing
`/dist/`. T4's gate is amended to that scoped form; the full `test:coverage` gate
runs once at close-out (T36) where the dedicated database is set up deliberately.

### Batch 2 — Phase 2 (serve from dist) — Complete

Committed in **reordered** form, T6 → T5 → T4, for the reason in D4 below.

| Task | Commit | Result |
| --- | --- | --- |
| T6 | `bce9bb91` | guard rewritten onto `dist/static`, `beforeAll` sentinel added |
| T5 | `5379f8da` | `buildStaticDirCandidates` + docblock repointed; `web-ui-static-dir.test.ts` `STATIC_DIR` repointed |
| T4 | `65392f2f` | `lib/html.js` → `lib/html.ts` |

Measured at the reordered HEAD, by the orchestrator, after `rm -rf dist && build`:
`dist/static` = 21 `.js`, 0 `.ts`; web-ui 700/0; the six tools-api web-ui suites
56/0; `installer-config-template` 31/0 — 787 total, matching the frozen baseline.
`lib/html.ts` measured 100% (26/26 lines) with **0** `/dist/` paths in the lcov.
Live: `GET /ui/app.js` → 200 `text/javascript; charset=utf-8`; `GET /ui` → `<!DOCTYPE html>`.

Guard integrity: 7 assertions before, 7 after; `git diff` over the file changes
**zero** `it(` or `expect(` lines — only the docblock, `STATIC_DIR`, and the
sentinel/lazy-`FILES` mechanism. Thresholds unchanged, no exemption added.
`.js.map` files were already excluded by `listJsFiles`'s `endsWith(".js")` filter
(`"foo.js.map".endsWith(".js")` is `false`), so source-map handling is unchanged
behaviour rather than a new decision.

Discrimination sensor: 3 mutations, 3 killed, 0 survived — bare specifier injected
into a scratch `app.js`; a module padded to 648 lines; `dist/static` removed. The
orchestrator independently re-ran the third and observed the sentinel's own error
text. `git status --porcelain` matched the pre-sensor baseline after cleanup.

**Deviation D4 — T4 could not be green in isolation; a planning defect, fixed by reordering.**
`tasks.md` gave T4 the `Done when` bullet "700 pass, 0 fail". That was unreachable
as authored: at T4 the guard still scanned `src/static`, and converting
`lib/html.js` to `.ts` leaves `app.js` importing `./lib/html.js`, which no longer
exists there — so assertion 4 ("every specifier resolves to a file that exists")
fails. Measured directly from the original commit: `src/static/lib/html.js` absent,
`app.js` still referencing it, guard `STATIC_DIR` still `src/static`.

The worker's mitigation was to implement all three tasks before committing any, so
no red state was ever observable outside its session — honest, and it disclosed the
gap rather than hiding it. But it still produced a commit that is red when isolated,
which the Execution Contract forbids.

Resolution: the three commits are **file-disjoint** (`lib/html.ts` /
`web-ui.ts`+`web-ui-static-dir.test.ts` / `static-module-graph.test.ts`), so they
were reordered to T6 → T5 → T4 by cherry-pick onto `533df648`, with the resulting
tree verified **byte-identical** to the pre-reorder state (`git diff` empty against
a backup tag, since deleted). In that order every commit is green: T6 points the
guard at `dist/static`, which at that point is populated entirely by the
transitional copy from an all-`.js` source tree; T5 touches only tools-api; T4 then
converts a module whose emitted output the guard already reads.

**This defect is unique to the first conversion.** From T8 onward the guard reads
`dist/static`, where `tsc` emits each converted module as the transitional copy
stops matching it — so every later single-module task is independently green as
authored, and no further reordering is needed.

### Batch 3 — Phase 3 (dev loop and leaf modules) — Complete

| Task | Commit | Result |
| --- | --- | --- |
| T7 | `32e42f6a` | root `dev:api` → `turbo run dev --filter @massa-ai/tools-api... --filter @massa-ai/web-ui` |
| T8 | `b0f7fbb5` | `lib/forms.js` → `lib/forms.ts` |
| T9 | `dc2f327a` | `lib/banner.js` → `lib/banner.ts` |

web-ui 700/0 after each task and after a clean rebuild. `dist/static` 21 `.js` / 0
`.ts` throughout. `npx turbo run dev --dry-run=json` lists
`@massa-ai/web-ui#dev → bunx tsc -p tsconfig.build.json --watch` beside
`@massa-ai/tools-api#dev`. `apps/tools-api/package.json` verified untouched across
the whole batch — the install-breaking dependency edge (ASM-04) was avoided.

Watch re-emit measured: with `tsc --watch` running, touching `src/static/lib/html.ts`
advanced `dist/static/lib/html.js` mtime by ~8 s with "Found 0 errors" in the watch
log. Emitted `.js` carries `//# sourceMappingURL=html.js.map`; the map carries
`sourcesContent` (1 entry, source `../../../src/static/lib/html.ts`).

**Two `Done when` bullets are deferred to the user, not done** — T7's "start
`dev:api`, edit a `.ts` literal, save, refresh, observe the change" and "devtools
opens the `.ts` source". No automated executor has a browser. Authoring those as
task acceptance criteria was an orchestrator error; the scriptable half above is
the closest available evidence and is what was actually measured.

**Deviation D5 — module specifiers auto-resolve `.js` → `.ts`; filesystem paths do not.**
T8's `Done when` said to repoint `view-handlers.test.ts:23`'s
`import … from "../static/lib/forms.js"`. Measured: no repoint is needed or was
made. With `src/static/lib/forms.js` **absent**, that literal `.js` specifier still
resolves to `forms.ts` under `moduleResolution: bundler` at type-check and under
Bun's resolver at runtime — `git diff` on the file is empty and the suite is 700/0.
The same holds for every `await import("../static/app.js")` in the package.

The distinction that matters, and that several task bullets conflated:

| Form | Resolves `.js` → `.ts`? | Action on conversion |
| --- | --- | --- |
| `import … from "./x.js"`, `await import("./x.js")`, `require("./x.js")` | **Yes** | none — leave the specifier alone |
| `fs.readFileSync(path.join(…, "x.js"))` | **No** | must be repointed, or it throws ENOENT |

Full measured inventory of the second kind — every filesystem-literal `.js` read of
a `src/static` source, and the task that must repoint it:

| Reference | Target | Repointed by |
| --- | --- | --- |
| `apps/web-ui/src/__tests__/registry-editor.test.ts:728` | `views/profiles.js` | **T17** — bullet was missing, added |
| `apps/web-ui/src/__tests__/registry-editor.test.ts:735` | `views/memory.js` | T19 |
| `apps/web-ui/src/__tests__/registry-editor.test.ts:726` | `views/registry.js` | T21 |
| `apps/web-ui/src/__tests__/registry-editor.test.ts:727` | `views/registry-state.js` | T22 |
| `apps/tools-api/src/routes/config-section-coverage.test.ts:30` | `views/config.js` | T23 |
| `scripts/__tests__/installer-config-template.test.ts:31` | `views/config.js` | T23 |
| `apps/web-ui/src/__tests__/app-renderers.test.ts:1649` | `wire-view-handlers.js` (`STATIC_DIR` = `src/static`) | T27 |

Verified *not* affected: `static-module-graph.test.ts` (its `STATIC_DIR` is
`dist/static`, where `.js` is the correct extension), and the `app.js` string
assertions in `web-ui-serve.test.ts` / `web-ui-errors.test.ts`, which describe
served URLs rather than source files.

The first sweep for this inventory required the literal `static` on the same line
and therefore missed `app-renderers.test.ts:1649`, which reaches the directory
through a `STATIC_DIR` variable. The table above is from the corrected sweep.

---

## Artifact-Store Evidence

Active artifact key `.specs/features/web-ui-typescript/tasks.md`.
Version 2 (v1 used a `### Tn (TASK-00N):` heading shape that `validate_tasks.ts`'s
`TASK_RE = /^#{2,4}\s+([A-Z]*T\d+)\s*:/i` did not match — it parsed **zero** tasks
and still reported `0 error(s)`. v2 moves the task id into the body and puts
`Tests` and `Gate` on their own lines so `TESTS_RE`/`GATE_RE` both match).
Checksum recorded on commit.
