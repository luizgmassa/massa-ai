# Web UI TypeScript Conversion Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/web-ui-typescript/design.md`
**Status**: In Progress — Batches 1-9 of 14 complete; **18 of 22** modules converted (see `## Execution Log`). The denominator was 21 until T23 created `views/config-sections`; 4 remain — `dashboard.js`, `wire-view-handlers.js`, `start-app.js`, `app.js`.

**Sizing note:** `PLAN.md` proposed 7 phases. The Tasks contract caps a phase at
**3 tasks (ideal 2)**, so those 7 semantic groups re-split into **14 Phases = 37
Tasks**. The extra tasks versus `PLAN.md`'s 31 are `config-sections` becoming its
own module (T23/T24) plus one-file-per-task granularity across the 21 conversions.
T37 was added mid-execution as Batch 8 remediation (Execution Log D6); it sits in
Phase 8 despite its number.

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
| 8 | Registry pair | T21 → T22 → T37 |
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

#### T37: Consolidate the duplicated registry types

**Task ID**: TASK-037
**What**: Define the five duplicated-and-divergent registry interfaces once, narrow the `data: unknown` parameter T21 widened, and replace T22's four non-null assertions with narrowing locals.
**Where**: `apps/web-ui/src/static/views/registry.ts`, `apps/web-ui/src/static/views/registry-state.ts`, `apps/web-ui/src/static/views/profiles.ts`
**Depends on**: T22
**Reuses**: the `RegistryPayload` / `RegistryHost` shapes already defined in `registry.ts`
**Requirement**: WUT-07, WUT-08
**Non-goals**: no renderer or state-machine behaviour change; `start-app.js` and `app.js` are still JavaScript and are not edited here (T28/T29 own them).
**Tools**: MCP: NONE · Skill: NONE

> **Out-of-sequence number, deliberate.** Added after T36 was already numbered, as
> Batch 8 remediation (Execution Log D6). A `T22a` heading would parse as **zero**
> tasks — `validate_tasks.ts`'s `TASK_RE = /^#{2,4}\s+([A-Z]*T\d+)\s*:/i` requires
> the digits to be followed by optional whitespace then `:`. Renumbering T23–T36
> would invalidate every cross-reference in this file and the Execution Log.

> **Types live in `registry.ts`, not a new `registry-types.ts`.** A types-only
> module emits an empty `.js` into `dist/static/` that nothing imports — every
> `import type` erases at emit — so `static-module-graph.test.ts`'s "every shipped
> module is reachable from app.js" check reddens on a new orphan.
> `registry-state.ts:17` and `profiles.ts:9` already **value**-import from
> `./registry.js`, so those edges survive emit and the graph stays connected.

> **Three files because narrowing stops dead otherwise.** `profiles.ts:124` also
> declares `registryData: unknown` and forwards it straight to
> `renderModelRegistry`. Narrowing only the callee turns that forward into a
> compile error whose cheapest repair is a cast — reinstating the escape one level
> up. Its own callers are still untyped JavaScript, so widening risk is nil.

**Done when**:
- [ ] `RegistryCell`, `RegistryProfile`, `RegistrySchema`, `RegistrySource`, `RegistryFormState` are defined **once**, in `registry.ts`, and exported
- [ ] `registry-state.ts` imports them via `import type { … } from "./registry.js"`; `grep -c '^interface Registry' registry-state.ts` drops by 5
- [ ] `renderModelRegistry(data: RegistryPayload | null | undefined, …)` — no `unknown` in the signature and no `as RegistryPayload` in the body
- [ ] `renderProfilesView`'s `registryData` narrowed to the same type
- [ ] Zero non-null assertions in all three files: `perl -ne 'print "$.: $_" if /[\w\)\]]!(?=[.\[])/' <file>` prints nothing for each. **A `!\.`-anchored grep returns 0 while four exist** — and `grep -cE '[A-Za-z0-9_)\]]!(\.|\[)'` returns 1, because POSIX ERE reads `\]` inside a bracket expression as literal. Use the perl form (D6)
- [ ] Delta semantics preserved: optional properties only, never `| undefined`; no `_delete: false`, no key written with value `undefined`
- [ ] `render-golden.json` sha256 still `27195c2e9975ae28481d7fd6d8d778232f3df07e0556253a2dfbc05ffb77af30`
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail
- [ ] **Discrimination sensor for the narrowing**: in scratch, add `renderModelRegistry({ registry: { tiers: 42 } })` to a `.ts` caller → `bun run --filter @massa-ai/web-ui build` red on the `tiers` type. Under the old `data: unknown` the same line is green. Red observed and recorded, then reverted

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): consolidate the duplicated registry types`

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
- [ ] `config-section-coverage.test.ts:30` and `installer-config-template.test.ts:31` repointed from `views/config.js` to `views/config-sections.js` — **step 1 of 2; T24 renames this file again** (D5 table)
- [ ] **Each repointed suite asserts a non-zero parsed population before asserting content** (WUT-14 AC2)
- [ ] Scratch: point each scanner at an empty file → each fails; both reds observed, both reverted
- [ ] `render-golden.json` sha256 unchanged

**Tests**: unit
**Gate**: full
**Commit**: `refactor(web-ui): split the config section schema into its own module`

#### T24: Convert config-sections and couple it to MassaAiConfig

**Task ID**: TASK-024
**What**: Convert the schema module and type its section keys against the real server config type. **This is the feature's stated payoff.**
**Where**: `apps/web-ui/src/static/views/config-sections.ts`, plus the two external scanners repointed a second time (below)
**Depends on**: T23
**Reuses**: `@massa-ai/shared` `MassaAiConfig`; the dependency edge declared in T3
**Requirement**: WUT-11, WUT-12
**Non-goals**: no runtime change; the emitted `.js` must carry no `@massa-ai/shared` reference.
**Tools**: MCP: NONE · Skill: NONE

> **Second D5 repoint, found during Batch 9 pre-dispatch review.** The D5 inventory
> assigned `config-section-coverage.test.ts:30` and `installer-config-template.test.ts:31`
> to T23 and stopped there, because it was built when both pointed at `views/config.js`.
> T23 moves them to `views/config-sections.js`; **this task renames that file again**, so
> both need a second repoint here or they throw ENOENT. The failure is loud rather than
> vacuous — plain `fs.readFileSync` on a missing path throws — but it belongs to the task
> that causes it. Rename each `CONFIG_VIEW_JS` const to `CONFIG_SECTIONS_SRC` while
> repointing; after this task the name is wrong twice over.

**Done when**:
- [ ] `import type { MassaAiConfig } from "@massa-ai/shared"` and `type ConfigSectionKey = keyof MassaAiConfig`
- [ ] `config-section-coverage.test.ts:30` and `installer-config-template.test.ts:31` repointed from `views/config-sections.js` to `views/config-sections.ts` — **step 2 of 2**, same commit as the rename
- [ ] Both scanners still report a **non-zero** section-key population (the assertion T23 added); print the count, not just the pass
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
- [ ] `apps/tools-api/src/__tests__/dashboard-views.test.ts:12` — **measure, do not assume.** It is `require("../../../web-ui/src/static/dashboard.js")` via `createRequire`, a **module specifier**, and D5's table says those auto-resolve `.js` → `.ts`. But D5 measured `import` and `await import`; the `require` row was reasoned into the table, not observed, and this one also crosses a package boundary into another package's raw source. Rename the module first, run the suite, and repoint **only if** it fails. Record which outcome was measured either way
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

> **The sensor reading this module is a brace-depth lexer, and annotations can feed
> it braces.** `app-renderers.test.ts` extracts `wireViewHandlers`' own source span by
> counting braces from the declaration, skipping only those inside string/template
> literals and comments — **not** those inside type annotations. An inline object type
> in the signature (`function wireViewHandlers(ctx: { state: AppState })`) opens a
> brace the lexer counts and closes early, and the `confirm()` assertion then fails on
> a truncated span for a reason that looks nothing like its cause. Use a **named
> interface** for every parameter type in this module. The same lexer already survived
> `registry.ts`/`registry-state.ts` in Batch 8 — because those signatures used named
> interfaces too, not because it is immune.

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
P8:  T21 ──→ T22 ──→ T37
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
| T4, T8-T22, T25-T29 | 1 module each | ✅ Granular |
| T24 | 3 files — the module plus the second hop of both scanner repoints | ⚠️ Cohesive, **deliberate**: the rename and the repoints must be one commit or the scanners ENOENT between them |
| T5 | 1 route plus its co-located suite | ✅ Granular (test co-location) |
| T6 | 1 test file | ✅ Granular |
| T23 | 4 files — schema split plus 2 external scanner repoints | ⚠️ Cohesive, **deliberate**: splitting opens a window where the scanners pass vacuously on zero matches |
| T30 | 3 test files, one mechanical repoint | ⚠️ Cohesive: splitting leaves the repo red between commits |
| T31 | 2 test files plus verification of 3 more | ⚠️ Cohesive: one sensor-strengthening pass |
| T34 | 0-1 files; the measurement is the deliverable | ✅ Granular |
| T35 | 7 doc/config sites, one class of stale claim | ⚠️ Cohesive |
| T36 | 3 `.specs` files, the workflow's own close-out contract | ⚠️ Cohesive |
| T37 | 3 modules — one type definition and its two consumers | ⚠️ Cohesive, **deliberate**: a type moved in one commit and imported in another leaves the tree uncompilable between them |

No ❌. Six ⚠️ rows, each with a stated reason why splitting would be worse.

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
| T37 | T22 | T22 → T37 | ✅ Match |

All 37 match. No dependency points to a later phase — every cross-phase edge (T3→T4, T3→T7, T4→T8, T4→T9, T9→T10, T12→T13, T15→T16, T18→T19, T20→T21, T22→T23, T25→T26, T27→T28, T29→T30, T31→T32, T33→T34) points backward.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1, T2, T3, T7, T32, T33 | Build config | none | none | ✅ OK |
| T4, T8-T22, T25-T29, T37 | Browser module | unit | unit | ✅ OK |
| T5 | Serving route | integration | integration | ✅ OK |
| T6 | Guard / sensor test | unit | unit | ✅ OK |
| T23, T24 | Browser module + cross-package text scanner | unit (highest of the two) | unit | ✅ OK |
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
| `apps/tools-api/src/routes/config-section-coverage.test.ts:30` | `views/config.js` → `views/config-sections.js` | T23 (step 1 of 2) |
| `scripts/__tests__/installer-config-template.test.ts:31` | `views/config.js` → `views/config-sections.js` | T23 (step 1 of 2) |
| `apps/tools-api/src/routes/config-section-coverage.test.ts:30` | `views/config-sections.js` → `.ts` | **T24 (step 2 of 2)** |
| `scripts/__tests__/installer-config-template.test.ts:31` | `views/config-sections.js` → `.ts` | **T24 (step 2 of 2)** |
| `apps/web-ui/src/__tests__/app-renderers.test.ts:1649` | `wire-view-handlers.js` (`STATIC_DIR` = `src/static`) | T27 |

Verified *not* affected: `static-module-graph.test.ts` (its `STATIC_DIR` is
`dist/static`, where `.js` is the correct extension), and the `app.js` string
assertions in `web-ui-serve.test.ts` / `web-ui-errors.test.ts`, which describe
served URLs rather than source files.

The first sweep for this inventory required the literal `static` on the same line
and therefore missed `app-renderers.test.ts:1649`, which reaches the directory
through a `STATIC_DIR` variable. The table above is from the corrected sweep.

**Amended at Batch 9 pre-dispatch — a repoint can need two steps, and the sweep only
sees the first.** The inventory was built by sweeping the tree for filesystem-literal
`.js` reads, so each row records the path *as it stood when the sweep ran* and the one
task that changes it next. That is correct for a single rename and wrong for a path
that moves twice. The two config scanners move twice: T23 relocates them from
`views/config.js` to `views/config-sections.js` (the keys leave `config.js`), and T24
renames that file to `.ts`. Only the first hop was assigned. Both rows are now split
into step 1 and step 2, and the two-hop shape is the thing to look for — **a
"conversion" task preceded by a "pure move" task always produces one.** T23 → T24 is
the only such pair in this plan; every other conversion moves its target once.

The second hop fails loudly (`fs.readFileSync` throws ENOENT on a missing path), not
vacuously, so it would not have shipped silently. It would have surfaced as an
unexplained ENOENT inside T24 with no bullet explaining it — which is exactly how T17's
missing repoint presented before D5 was written.

### Batch 4 — Phase 4 (remaining lib leaves) — Complete

| Task | Commit | Result |
| --- | --- | --- |
| T10 | `4080be24` | `lib/theme.js` → `.ts` |
| T11 | `d008f865` | `lib/api-client.js` → `.ts` |
| T12 | `bb46e38f` | `lib/markdown.js` → `.ts`, CDN globals typed |

`SPEC_DEVIATION: none`, and it held under check. Orchestrator-verified: `lib/` is
now **6/6 TypeScript with 0 `.js`**; `dist/static` 21 `.js` / 0 `.ts`; web-ui
700/0; `index.html` still `60cb0dae…`; `api-key-header.test.ts` and
`write-mode.test.ts` show an empty diff **against the `6227b4ac` baseline**, not
merely against the previous commit. Conversion progress: **6 of 21**.

CDN typing landed as designed — `interface MarkedLike { parse(markdown: string): string }`
and `interface DomPurifyLike { sanitize(html: string): string }`, applied by cast at
the two `globalThis` reads, with the `if (markedLib && purifyLib)` fallback guard
preserved. No `declare global`, no bare import, no `any`, no `.d.ts` (repo still
ships zero). XSS ordering intact: `markedLib.parse(text)` then
`purifyLib.sanitize(rawHtml)`.

**Orchestrator note — a false positive worth recording.** `grep -c 'declare global'`
over `markdown.ts` returns **1**, which reads as a violation of the design
constraint. The match is inside the module's own docblock, explaining why
`declare global` was rejected. The count was the naive measurement; the matched
line was the answer. Any future audit of this file's forbidden constructs must read
the line, not the count.

### Batch 5 — Phase 5 (small views A) — Complete

| Task | Commit | Result |
| --- | --- | --- |
| T13 | `fcdd78ec` | `views/search.js` → `.ts` (+27/−6) |
| T14 | `693b8603` | `views/proposals.js` → `.ts` (+34/−4) |
| T15 | `dc71b938` | `views/handoffs.js` → `.ts` (+46/−7) |

`SPEC_DEVIATION: none`. Orchestrator-verified: `render-golden.json` still
`27195c2e…` after all three; web-ui 700/0; `dist/static` 21 `.js` / 0 `.ts`; zero
import specifiers rewritten. **9 of 21 modules converted.**

The behaviour-preservation check here was a diff scan for silently-added defaults
(`??`, `|| ""`) — the failure mode where a type annotation turns a genuinely
`undefined` field into a rendered empty string and moves the golden fixture. Zero
found, over diff populations of 27/34/46 insertions, so the clean result is a real
measurement rather than a vacuous scan of an empty rename diff.

State parameters were typed narrowly against what each renderer actually reads
(`{ api: { request }, render }` for `handleProposalAction`) rather than an invented
full app-state interface — deliberate, so T28's `AppState` work is not
pre-constrained by three renderers' guesses.

One duplication accepted knowingly: `handoffs.ts`'s `HandoffCtx.root` is
structurally identical to `lib/forms.ts`'s unexported `FormDataRoot`. Matching
structurally avoided widening `forms.ts`'s public surface for a single consumer;
revisit only if a third appears.

### Batch 6 — Phase 6 (small views B) — Complete

| Task | Commit | Result |
| --- | --- | --- |
| T16 | `1aad4526` | `views/checkpoints.js` → `.ts` |
| T17 | `41844867` | `views/profiles.js` → `.ts` **+ `registry-editor.test.ts:728` repoint, same commit** |
| T18 | `53abf42b` | `views/projects.js` → `.ts`, job-progress state machine preserved |

`SPEC_DEVIATION: none`. Orchestrator-verified: `render-golden.json` still
`27195c2e…`; web-ui 700/0; `dist/static` 21 `.js` / 0 `.ts`; `route-contract.test.ts`
diff empty. **12 of 21 modules converted.**

The D5 repoint landed as intended — T17's diff shows
`"views", "profiles.js"` → `"views", "profiles.ts"` on line 728, atomically with
the module it follows. Without the bullet added after Batch 3, this task would have
failed on an unexplained ENOENT.

Defaults check: the `??` operators in `checkpoints.ts` and `projects.ts` appear in
neither the added nor the removed side of their diffs — they are untouched context,
so they were pre-existing rather than introduced by annotation. Stronger evidence
than "none added": they were never edited at all.

`route-contract.test.ts` needed no repoint because it reaches
`renderCheckpoints`/`CHECKPOINTS_LIST_BODY` through the `app.js` barrel re-export
rather than a direct path — a module specifier, which auto-resolves.

### Batch 7 — Phase 7 (large views) — Complete

| Task | Commit | Result |
| --- | --- | --- |
| T19 | `fd6b395d` | `views/memory.js` → `.ts` (398 lines) **+ `registry-editor.test.ts` memory read repoint, same commit** |
| T20 | `cd93763f` | `views/logs.js` → `.ts` (432 lines) |

`SPEC_DEVIATION: none`. Orchestrator-verified: `render-golden.json` still
`27195c2e…`; web-ui 700/0; `dist/static` 21 `.js` / 0 `.ts`; both files well under
the 600-line cap. **14 of 21 modules converted.**

Defaults were **position-checked**, not count-checked: zero `??` or `|| ""` on any
added line in either diff. The worker reported count parity (2→2, 7→7), which is
weaker — equal counts are consistent with one removed and a different one added.

`logs.ts` constraints held: the live tail is still `fetch` + `getReader()`
(lines 295, 302), and the `"explicitly off" from "never chosen"` comment survives at
line 375, keeping the module-graph guard's comment-stripping exercised.

**Orchestrator note — second false positive of the same shape.** `grep -c 'EventSource'`
over `logs.ts` returns **2**, which reads as a violation of the "do not introduce
EventSource" constraint. Both matches are comments at lines 4 and 175 explaining why
`EventSource` is unusable here (it cannot set `x-api-key`, and a query-string key
would leak into access logs). There is no `new EventSource`. This is the same trap as
Batch 4's `declare global` count. **For this feature, a forbidden-construct check must
read the matched line; the count alone is not evidence.**

Typing note for later batches: a freestanding interface with zero property-name
overlap against `showBanner`'s `BannerRoot` fails TypeScript's weak-type check
(`has no properties in common`) even when every member is optional. Resolved with the
`Parameters<typeof showBanner>[0] & {…}` intersection already established in
`profiles.ts`, and in `memory.ts` by giving the two interfaces one shared member. No
new pattern was introduced.

### Batch 8 — Phase 8 (registry pair) — Complete

| Task | Commit | Result |
| --- | --- | --- |
| T21 | `812d4913` | `views/registry.js` → `.ts` (448 → 499 lines) **+ `registry-editor.test.ts:723` repoint, same commit** |
| T22 | `fa8a4c0a` | `views/registry-state.js` → `.ts` (514 → 598 lines) **+ `registry-editor.test.ts:724` repoint, same commit** |

`SPEC_DEVIATION: D6` (below). Orchestrator-verified: `render-golden.json` still
`27195c2e…`, and **0 commits touched it across the whole branch** (`6227b4ac..HEAD`
→ 0) — stronger than a matching hash, which a compensating edit could also produce;
web-ui **700 pass / 0 fail**, 1663 `expect()` calls, 15 files; `dist/static` **21
`.js` / 0 `.ts`** from a `rm -rf apps/web-ui/dist` rebuild. **16 of 21 modules
converted.**

Both D5 repoints landed as their own commits with the correct owner each: T21 moved
line 723 `registry.js` → `.ts`, T22 moved line 724 `registry-state.js` → `.ts`. The
`registry-editor.test.ts:723-725` source-read array is now fully `.ts` for the
registry trio.

**D6 — the worker's compaction report did not survive the diff, and neither did the
cap premise that followed from it.** Three separate corrections, recorded because
each has a reusable shape.

*The four non-null assertions exist; two independent regex sweeps were wrong.*
`registry-state.ts` lines 223, 224, 225 (`…profiles[profile].hosts![host]…`) and 253
(`…agentTiers[agent]![host]`), all added by `fa8a4c0a`. The sweeps returned zero
because **every one is `!` before `[`, never before `.`** — `grep -c '!\.'` → `0`.
A second dialect trap sits behind the obvious repair:
`grep -cE '[A-Za-z0-9_)\]]!(\.|\[)'` returns **1**, not 4, because POSIX ERE reads
`\]` inside a bracket expression as a literal backslash-plus-close. Only
`perl -ne 'print "$.: $_" if /[\w\)\]]!(?=[.\[])/'` returns all four. All four are
runtime-safe — line 222 assigns `hosts = {}` and line 252 assigns
`agentTiers[agent] = {}` immediately before — so TypeScript's inability to narrow is
about the repeated deep index access, not about the value.

*Nothing was compacted; the file grew.* 514 → 598 for `registry-state`, 448 → 499 for
`registry`. The `-` side of hunk `@@ -152,13 +220,13 @@` shows the pre-existing
JavaScript already carried the deep chains, so no narrowing locals were removed. The
worker chose `!` **instead of** introducing locals and reported that choice as a
replacement.

*The 600-line cap never measured 598.* `static-module-graph.test.ts:39` sets
`STATIC_DIR` to **`dist/static`** — the cap reads emitted bytes, where types erase.
`dist/static/views/registry-state.js` is **549**, a 51-line margin, not 2. The
emit-side subject is a recorded, user-selected design decision (`design.md` → Tech
Decisions, "Module-graph guard subject | Emitted `dist/static/*.js` only |
User-selected"), so the gate did not shape this code and **no split is warranted**.
The file nearest the cap is `dist/static/views/config.js` at **572**, still
unconverted, and T23/T25 already budget its split.

> **Standing note for the rest of this feature.** The cap's own comment cites a
> *source*-side authoring rule ("a file over ~600 lines must be flagged for
> splitting") while enforcing on the *emit* surface. Pre-conversion those were the
> same bytes; they now diverge by 49 lines on this file alone and will keep
> diverging as annotation density grows. Source-side growth is ungated from here on.
> Quote the emitted number when citing the cap, and the source number when citing
> authoring burden — they are different measurements and this feature created the
> gap.

**D6 remediation — T37 added.** The `data: unknown` widening on
`renderModelRegistry` (T21) is a real type-safety regression in a public signature,
and its root cause is duplication, not the signature: `registry.ts` and
`registry-state.ts` each define their own `RegistryCell`, `RegistryProfile`,
`RegistrySchema`, `RegistrySource`, `RegistryFormState` — five names with divergent
shapes (`Partial<Record<RegistryHost,…>>` against `Record<string,…>`).
`mergeRegistryForDisplay` returns registry-state's `RegistryServerData`;
`renderModelRegistry` wants registry.ts's `RegistryPayload`; they are structurally
incompatible and `unknown` was the escape. **`start-app.js:235` passes one straight
into the other** — untyped JavaScript today, a hard compile error at T28, where the
cheapest repair in that seat is another cast. User decision: fix now, before Batch 9,
rather than at T28 or as recorded debt.

### Batch 8b — T37 (D6 remediation) — Complete

| Task | Commit | Result |
| --- | --- | --- |
| T37 | `f2371c62` | 5 interfaces defined once in `registry.ts`; `renderModelRegistry` and `renderProfilesView` narrowed; 4 non-null assertions → narrowing locals. 3 files, +33 / −45 |

Orchestrator-verified independently of the worker's report: build exit 0; web-ui
**700 pass / 0 fail**, 1663 `expect()` calls, 15 files; `render-golden.json` still
`27195c2e…` with **0 commits touching it across the branch**; `dist/static` **21
`.js` / 0 `.ts`** from a `rm -rf apps/web-ui/dist` rebuild; `grep -c '^interface
Registry' registry-state.ts` **12 → 7**; the perl sweep prints nothing across
**1290 lines** of the three files; **0** `??` or `|| ""` on any `+` line.

**Discrimination sensor re-observed by the orchestrator, not accepted from the
worker.** The worker's probe was an in-file edit to `profiles.ts`; the orchestrator's
was a throwaway `views/__t37probe.ts` calling
`renderModelRegistry({ registry: { tiers: 42 } })`, so the red could not depend on
anything else the worker had touched:

```
apps/web-ui/src/static/views/__t37probe.ts(2,56): error TS2322: Type 'number' is not assignable to type 'string[]'.
```

Control with the probe removed: exit 0, `git status --porcelain` empty. Under the
old `data: unknown` that line compiles, so this is the evidence the narrowing is
real — the 700-test suite was green both before and after and proves nothing here.

**Unrequested type change, reviewed and accepted.** Consolidation had to pick one
shape where the two files disagreed, and the worker chose `Record<string, X>` over
registry.ts's original `Partial<Record<RegistryHost, X>>` for `RegistryProfile.hosts`,
`RegistrySchema.hostDefaults` and `RegistrySchema.agentTiers` — a widening it was not
asked to make. Accepted on review, for a reason worth keeping: the widening lands
**only on wire-shape types**, and exhaustiveness survives where it actually bites.
`UI_HOST_EFFORT_ENUM: Record<RegistryHost, string[]>` and `REGISTRY_HOST_LABELS:
Record<RegistryHost, string>` are still keyed by the 4-member union, so adding a
fifth host still fails to compile until both are updated. The overlay is
user-editable JSON on disk and never guaranteed a 4-key domain, so
`Partial<Record<RegistryHost, …>>` was claiming a constraint the wire does not
enforce. Narrowing the DOM-sourced `host: string` at the boundary is the real repair
and is behaviour-adjacent — out of scope here.

**Residual, deliberately not fixed.** `RegistryRenderOpts.registryForm` and
`ProfilesViewOpts.registryForm` are still `unknown`, with an
`as RegistryFormState | null` cast at `registry.ts:259`. Same class of escape as the
one T37 removed, also introduced by T21, but outside T37's named contract. It is now
a one-line fix on each side because `RegistryFormState` is exported — worth folding
into a later task rather than widening this one after the fact.

**Third false positive of the comment class** (after Batch 4's `declare global` and
Batch 7's `EventSource`). `grep '_delete: false'` over the views returns 1 and
`grep '| undefined'` over `registry.ts` returns 2 — all three are docblocks stating
the rule they appear to violate ("never written as `_delete: false`"; "a
`| undefined` union would invite…"). Every `| undefined` outside a comment is a
function parameter or a local, never an interface property, so delta semantics hold.

**Emit grew while source shrank — a second datapoint for the standing note above.**
`registry-state.ts` source went 598 → 579 (−19), but
`dist/static/views/registry-state.js` went 549 → **554** (+5), because narrowing
locals are runtime code where the erased assertions were not. The two surfaces now
move in opposite directions on the same edit. Cap margin on the measured surface: 46
lines.

### Batch 9 — Phase 9 (config split and coupling) — Complete

| Task | Commit | Result |
| --- | --- | --- |
| T23 | `abd82b6f` | `CONFIG_SECTIONS` moved verbatim into `views/config-sections.js`; both external scanners repointed (step 1 of 2). 4 files, +222 / −206 |
| T24 | `b24ea124` | `config-sections.js` → `.ts`, coupled to `MassaAiConfig`; both scanners repointed (step 2 of 2), `CONFIG_VIEW_JS` → `CONFIG_SECTIONS_SRC`. 3 files |
| T25 | `235ad1b4` | `views/config.js` → `.ts` (375 → 446 source). 1 file |

`SPEC_DEVIATION: none`. Orchestrator-verified independently: build exit 0; web-ui
**700 pass / 0 fail**; the six tools-api web-ui suites **56 pass / 0 fail**; the
installer scanner **31 pass / 0 fail**; `render-golden.json` still `27195c2e…` with
**0 commits touching it across the branch**; `dist/static` **22 `.js` / 0 `.ts`** from
a `rm -rf apps/web-ui/dist` rebuild. **18 of 22 modules converted** — the denominator
moved from 21 because T23 created a module; `dashboard.js`, `wire-view-handlers.js`,
`start-app.js` and `app.js` remain.

**The split did exactly what it was budgeted for.** `dist/static/views/config.js` was
the largest emitted module in the bundle at **572** against the 600 cap. It is now
**362**, with `config-sections.js` at 221 beside it. The largest emitted module is now
`registry-state.js` at 554. No cap pressure remains anywhere in the bundle, and T25's
"the cap is not to be raised" never had to be tested.

**The coupling is stronger than the task asked for, and the difference is the whole
point.** T24's bullet specified `ConfigSection`/`ConfigField` interfaces with
`CONFIG_SECTIONS: ConfigSection[]`, where each element carries `key: ConfigSectionKey`.
That form catches a **wrong** key and is blind to a **missing** one — the array would
happily hold 15 sections. What shipped instead is a mapped type,

```ts
const CONFIG_SECTIONS_BY_KEY: { [K in ConfigSectionKey]: ConfigSection & { key: K } } = { … };
export const CONFIG_SECTIONS: ConfigSection[] = Object.values(CONFIG_SECTIONS_BY_KEY);
```

so the array every consumer and both scanners read is **derived** from an exhaustive
map rather than being a second literal that could drift from it. Both failure
directions are now compile errors.

**Key sets verified by membership, not by count.** `MassaAiConfig` has **16**
top-level keys across a 168-line interface; `CONFIG_SECTIONS_BY_KEY` has **16**; the
scanners' own regex parses **16**. Sorted, the three lists are identical — `cache
capturePolicy compression dataDir database embedding handoffs hooks impact llm logging
memory scheduler search security synapse`. Three matching counts would not have
established that.

**Both sensor directions re-observed by the orchestrator, not accepted from the
worker.** Reverted by `cp` from a scratch backup in both cases, never `git checkout`;
`git status --porcelain` empty afterwards.

*Direction 1 — a config key with no section* (added `probeOnlyKey?` to
`MassaAiConfig`):

```
config-sections.ts(36,7): error TS2741: Property 'probeOnlyKey' is missing in type '{ database: … }' but required in type '{ probeOnlyKey: ConfigSection & { key: "probeOnlyKey"; }; … }'.
```

*Direction 2 — a section key that is not a config key* (renamed `scheduler` →
`schedulerX`):

```
config-sections.ts(214,3): error TS2561: Object literal may only specify known properties, but 'schedulerX' does not exist in type '{ … }'. Did you mean to write 'scheduler'?
```

**`import type` erasure holds.** `import type { MassaAiConfig } from "@massa-ai/shared"`
is present at `config-sections.ts:17`; `grep -c 'massa-ai/shared'` over the emitted
`dist/static/views/config-sections.js` returns **0 across 221 lines** — the denominator
matters, since a zero-byte emit would also return 0. A sweep of all of `dist/static/`
for any bare specifier returns nothing.

**Worker finding worth keeping.** Verifying the *revert* of direction 1 requires the
turbo-mediated `bun run type-check`, not a bare `tsc` — `@massa-ai/shared` resolves
through its built `dist/`, which a bare `tsc` run does not rebuild after the source is
restored. A bare run would report a stale red on a clean tree.

**Orchestrator measurement defect, caught before it was quoted.** The first count of
`MassaAiConfig`'s keys used `grep -A40` and returned **6**, which read as a direct
contradiction of the scanners' 16 and nearly became a reported finding. The interface
is 168 body lines. The window was the population — the same truncation trap this log
has already recorded once.

**Third emit-versus-source datapoint, and the direction flipped again.** `config`
source went 375 → 446 (+71 of annotation) while its emit went 375 → **362** (−13). On
`registry-state` last batch, source shrank and emit grew. Neither surface predicts the
other; quote whichever one the claim is actually about.

---

## Artifact-Store Evidence

Active artifact key `.specs/features/web-ui-typescript/tasks.md`.
Version 2 (v1 used a `### Tn (TASK-00N):` heading shape that `validate_tasks.ts`'s
`TASK_RE = /^#{2,4}\s+([A-Z]*T\d+)\s*:/i` did not match — it parsed **zero** tasks
and still reported `0 error(s)`. v2 moves the task id into the body and puts
`Tests` and `Gate` on their own lines so `TESTS_RE`/`GATE_RE` both match).
Checksum recorded on commit.
