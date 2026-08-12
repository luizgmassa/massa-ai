# Web UI TypeScript Conversion Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/web-ui-typescript/design.md`
**Status**: In Progress — Batches 1-11 of 14 in flight; **22 of 22** modules converted, 0 `.js` left under `src/static` (see `## Execution Log`). The denominator was 21 until T23 created `views/config-sections`. T39 (D9) landed. Phases 12 complete; 13-14 remain.

**Sizing note:** `PLAN.md` proposed 7 phases. The Tasks contract caps a phase at
**3 tasks (ideal 2)**, so those 7 semantic groups re-split into **14 Phases = 39
Tasks**. The extra tasks versus `PLAN.md`'s 31 are `config-sections` becoming its
own module (T23/T24) plus one-file-per-task granularity across the 21 conversions.
T37, T38 and T39 were added mid-execution as remediation (Execution Log D6, D7, D9);
they sit in Phases 8, 10 and 11 respectively, despite their numbers.

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
| 10 | Shell renderers | T26 → T27 → T38 |
| 11 | Shell entry | T28 → T29 → T39 |
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
> a truncated span. Use a **named interface** for every parameter type in this module.
> The same lexer already survived `registry.ts`/`registry-state.ts` in Batch 8 —
> because those signatures used named interfaces too, not because it is immune.
>
> *Corrected after Batch 10:* an earlier draft of this note said the failure would
> "point nowhere near its cause". It would not. `app-renderers.test.ts:1703` is a
> named sanity test — "finds the `wireViewHandlers` function span (sensor sanity — a
> null/tiny span proves nothing)" — asserting `length > 500`, so a truncated span
> fails loudly and self-describingly. The hazard is real; the diagnosis cost is not.

**Done when**:
- [ ] `.ts` replaces `.js`; the `data-action`/`data-filter` dispatch map typed
- [ ] `app-renderers.test.ts:1649` source read repointed to `.ts`
- [ ] `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(web-ui): convert wire-view-handlers to TypeScript`

#### T38: Re-arm the write-gating source scanner

**Task ID**: TASK-038
**What**: Restore `web-ui-readonly.test.ts`'s source population, which this feature narrowed from 21 files to 2, and repair the discrimination sensor that narrowing exposed as broken.
**Where**: `apps/tools-api/src/__tests__/web-ui-readonly.test.ts`
**Depends on**: T27
**Reuses**: the non-zero-population idiom already in `config-section-coverage.test.ts` and `installer-config-template.test.ts`
**Requirement**: WUT-14
**Non-goals**: no production code changes; no assertion removed; `static-module-graph.test.ts` is **correct as written** and must not be touched — its `STATIC_DIR` is `dist/static`, where `.js` is the right extension.
**Tools**: MCP: NONE · Skill: NONE

> **Why this was invisible.** `readBundleSource` (line 39) recursively globs
> `e.name.endsWith(".js")` over **`src/static`**. Every conversion in this feature
> removed one file from its population: **21 → 2**, measured per commit. Its two
> assertions hid the decay in opposite ways. `expect(APP_JS).not.toContain(
> "FORBIDDEN_MUTATING_PATHS")` is a `not.toContain`, which gets *more* likely to pass
> as the population empties and could never have reddened. The other is a positive
> `toContain` that survived only while some remaining `.js` file happened to hold the
> marker — T27 removed the last one, which is the only reason any of this surfaced.

> **The sensor it exposed has never worked.** The mutant at line 100 is built as
> `'… data-action=\\"memory-edit\\" …'`, so at runtime it contains
> `data-action=\"memory-edit"` — with backslashes — while the assertion looks for
> `data-action="memory-edit"` without them. Measured: the mutant string does **not**
> contain its own assertion target. Every pass came from `APP_JS`, not from the
> mutant. Fixing the population alone turns this tautology green again and re-hides
> it permanently, which is why both repairs are one task.

> **Inventory correction, and the reason it matters.** `CHARACTERIZATION.md` lines
> 79-83 enumerate **five** source-text scanners and T31 is scoped to those five. This
> file is listed separately at line 89, under module-`require` sites, so its
> `readBundleSource` glob — structurally identical to `static-module-graph.test.ts`'s
> — was never classified as a scanner and never got a population assertion. The D5
> note even records "verified *not* affected: `static-module-graph.test.ts`", which
> checked the one that was fine while the one that was breaking sat under a different
> heading. The real population is **six**.

**Done when**:
- [ ] `readBundleSource` reads `.ts` as well as `.js`; measured population goes 2 → **22** files
- [ ] A non-zero-population assertion guards it — assert the **file count** it read, not just that the string is non-empty, and print the count
- [ ] The mutant's escaping is fixed so `expect(mutant).toContain('data-action="memory-edit"')` is satisfied **by the mutant itself**. Prove it: with `APP_JS` replaced by `""` in scratch, the assertion still passes; before the fix it fails. Both observed, reverted by hand
- [ ] Scratch: point `readBundleSource` at an empty directory → the population assertion fails. Red observed and reverted
- [ ] `expect(APP_JS).not.toContain("FORBIDDEN_MUTATING_PATHS")` still passes against the restored 22-file population (measured: that literal appears in **0** files under `src/static`) — it is now meaningful rather than vacuous
- [ ] No assertion deleted or weakened; `git diff` shows only the glob, the mutant literal, and added assertions
- [ ] The six tools-api web-ui suites → **56 pass, 0 fail**

**Tests**: unit
**Gate**: full
**Commit**: `test(tools-api): re-arm the write-gating source scanner`

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
- [ ] **`bun test apps/tools-api/src/__tests__/web-ui-serve.test.ts apps/tools-api/src/__tests__/web-ui-key-http.test.ts` → 15 pass, 0 fail.** This supersedes the original `curl -sf localhost:3333/ui/app.js` bullet: `web-ui-serve.test.ts:54` already is that check — *"GET /ui/app.js returns 200 + javascript content-type"* — as a real HTTP fetch against a listening server, which is the only form that catches Elysia's bare-string content-type override. It is automated and permanent where the curl was neither. `/ui/app.js` is auth-exempt (`isPublicPath` matches `startsWith("/ui/")`, measured), so no key is involved either way. A manual `curl` against a running `dev:api` remains available to the user as an eyeball check, alongside T7's two deferred browser bullets
- [ ] **Gate extended for this task**: these two suites are absent from the feature's `full` gate list, which is how a phase that changes the served bytes could go green without ever asserting them. They are reached by the repo-wide `bun run test`, so this is a gate-scope gap, not a coverage gap (D8)

**Tests**: unit
**Gate**: full
**Commit**: `refactor(web-ui): convert app barrel to TypeScript`

#### T39: Restore the `doc` the ctx conversion dropped

**Task ID**: TASK-039
**What**: Put `doc` back on the shared context object T28 removed, and make the type **require** it so it cannot be dropped again silently.
**Where**: `apps/web-ui/src/static/start-app.ts`, `apps/web-ui/src/static/wire-view-handlers.ts`
**Depends on**: T29
**Reuses**: the existing `ConfigDocument` and `LogsDoc` structural document types
**Requirement**: WUT-07, WUT-08
**Non-goals**: **do not revert T28's ctx consolidation** — one shared `ctx` replacing five ad hoc literals is an improvement and stays. Only the dropped member is the defect. No renderer changes, no behaviour change beyond restoring what was lost.
**Tools**: MCP: NONE · Skill: NONE

> **Two user-facing features are silently broken right now.** T28 replaced five
> `{ api, root, state, render, doc }` literals with one `{ api, root, state, render }`,
> dropping `doc`. Its stated reason was a *type* collision — a real `Document` against
> `LogsDoc`'s structural shape via `Document.body.appendChild`'s generic signature — so
> a type error was resolved by deleting a runtime value. Both consumers guard with
> `&&`, so neither throws:
>
> - `config.ts:417` `handleConfigReveal` → `ctx.doc && ctx.doc.getElementById ? … : null`, then `if (!el) return`. **The Config tab's secret-reveal button does nothing.**
> - `logs.ts:419` `handleLogsExport` → `doc && doc.createElement ? … : null`, then `if (a)`. **The Logs export never creates its download anchor.**
>
> Measured by calling `handleConfigReveal` with each ctx shape: `getElementById` calls
> **1** with `doc`, **0** without.

> **Why every gate stayed green, and what that demands of the fix.**
> `WireViewHandlersCtx` (`wire-view-handlers.ts:104`) declares only
> `root`/`state`/`api`/`render` — written during T27 from what `wireViewHandlers`
> *destructures*, while the function **forwards `ctx` wholesale** to both handlers
> above. `ConfigCtx.doc` and `LogsCtx.doc` are then both `doc?:`. So the declared
> contract never mentioned the member, the downstream types made it optional, and
> dropping it was invisible to the compiler. The suite missed it because
> `admin-handlers.test.ts` calls `handleConfigReveal(ctx, …)` with **its own** ctx — a
> method test, not a call-site test. One conversion wrote the type that made the
> removal undetectable; the next conversion used it.

**Done when**:
- [ ] `doc` restored on start-app's shared `ctx`; T28's consolidation otherwise untouched
- [ ] `WireViewHandlersCtx` declares `doc` as a **required** member — the durable guard, and what turns a future drop into a compile error instead of a silent no-op
- [ ] Every other consumer of the shared ctx audited for `doc` reads (`handleIndexStatusEvent`, `startIndexPoll`, `runLogsLiveStream`, and everything `wireViewHandlers` forwards to) — report the enumerated list **and its size**, not "checked"
- [ ] The `Document`-vs-structural-doc collision resolved by **widening the structural type or casting at the boundary**, never by dropping the value. State which and why
- [ ] Measured proof the break is closed: `handleConfigReveal`, called with the ctx `startApp` actually builds, reaches `getElementById` — **1** call, not 0
- [ ] **Discrimination sensor**: in scratch, remove `doc` from start-app's ctx again → `bun run --filter @massa-ai/web-ui build` red. Red observed and recorded, reverted by hand. If it stays green the required-member guard did not take
- [ ] `render-golden.json` sha256 unchanged; `bun test apps/web-ui/src/__tests__/` → 700 pass, 0 fail

**Tests**: unit
**Gate**: full
**Commit**: `fix(web-ui): restore the doc dropped from the shared app context`

### Phase 12: Cross-package consumers

#### T30: Repoint the remaining tools-api module requires

**Task ID**: TASK-030
**What**: Confirm the three `require("../../../web-ui/src/static/app.js")` sites need **no** repoint after T29, and record the evidence. Rewritten from a repoint task — see below.
**Where**: `apps/tools-api/src/__tests__/web-ui-readonly.test.ts`, `apps/tools-api/src/__tests__/web-ui-render.test.ts`, `apps/tools-api/src/__tests__/web-ui-views.test.ts`
**Depends on**: T29
**Reuses**: existing suites, assertions untouched
**Requirement**: WUT-14
**Non-goals**: change nothing that passes. This task's deliverable is evidence, not a diff.
**Tools**: MCP: NONE · Skill: NONE

> **Both of this task's original bullets were falsified before it ran.** It directed
> repointing three `require` paths, but **T26 measured** that `createRequire`'s
> `require()` resolves `.js` → `.ts` exactly like `import`, even crossing the
> tools-api → web-ui package boundary: `dashboard.js` was gone from disk, the
> specifier still said `.js`, and the suite was 13/0. And it directed repointing
> `STATIC_DIR` at `web-ui-readonly.test.ts:27` — but that constant is a **directory**
> path and is correct as written. The actual defect was one line below it, the `.js`
> extension filter inside `readBundleSource`, and **T38 fixed that**. What remains
> here is verification.

**Done when**:
- [ ] After T29, all three `require(".../app.js")` sites resolve with **no edit** — prove it the way T26 did: `src/static/app.js` absent from disk, the specifier still reading `.js`, suites green
- [ ] `git diff` on all three files is **empty**; if any edit turns out to be needed, record which and why the T26 measurement did not generalise
- [ ] 56 tests across the 6 tools-api web-ui suites pass, 0 fail

**Tests**: unit
**Gate**: full
**Commit**: `test(tools-api): repoint web-ui module requires at the TypeScript sources`

#### T31: Prove every text-scanning suite still discriminates

**Task ID**: TASK-031
**What**: Add a non-zero population assertion to each of the **six** source-text scanners and observe each red.
**Where**: `apps/web-ui/src/__tests__/app-renderers.test.ts` plus `registry-editor.test.ts`, verifying the four already carrying one (`config-section-coverage`, `installer-config-template`, `static-module-graph`, and `web-ui-readonly` from T38)
**Depends on**: T30
**Reuses**: lesson L-001 (`scope:test-strength`) — a missing-population path with no discriminating test
**Requirement**: WUT-14
**Non-goals**: no content assertions added or removed.
**Tools**: MCP: NONE · Skill: NONE
**Done when**:
- [ ] Each of the **6** scanners asserts a non-zero parsed population before content assertions
- [ ] Scratch: point each scanner at an empty file → each fails. **6** reds observed and recorded, all reverted
- [ ] The enumeration in `CHARACTERIZATION.md` lines 79-83 is corrected from five to six — `web-ui-readonly.test.ts`'s `readBundleSource` was filed under module-`require` sites at line 89 and so escaped both this task's original scope and any population guard (D7)
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
P10: T26 ──→ T27 ──→ T38
P11: T28 ──→ T29 ──→ T39
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
| T38 | 1 test file | ✅ Granular |
| T39 | 2 modules — the ctx producer and the type that must require it | ⚠️ Cohesive, **deliberate**: restoring the value without tightening the type leaves the same drop possible next time |

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
| T38 | T27 | T27 → T38 | ✅ Match |
| T39 | T29 | T29 → T39 | ✅ Match |

All 39 match. No dependency points to a later phase — every cross-phase edge (T3→T4, T3→T7, T4→T8, T4→T9, T9→T10, T12→T13, T15→T16, T18→T19, T20→T21, T22→T23, T25→T26, T27→T28, T29→T30, T31→T32, T33→T34) points backward.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1, T2, T3, T7, T32, T33 | Build config | none | none | ✅ OK |
| T4, T8-T22, T25-T29, T37, T39 | Browser module | unit | unit | ✅ OK |
| T5 | Serving route | integration | integration | ✅ OK |
| T6 | Guard / sensor test | unit | unit | ✅ OK |
| T23, T24 | Browser module + cross-package text scanner | unit (highest of the two) | unit | ✅ OK |
| T30, T31, T38 | Cross-package text scanner | unit | unit | ✅ OK |
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

### Batch 10 — Phase 10 (shell renderers) — T26/T27 complete, T38 added

| Task | Commit | Result |
| --- | --- | --- |
| T26 | `efbf661c` | `dashboard.js` → `.ts` (222 → 305 source). 1 file. **No repoint needed** — see below |
| T27 | `4a1cac48` | `wire-view-handlers.js` → `.ts` (363 → 428 source) + `app-renderers.test.ts:1649` fs-path repoint. 2 files |
| T38 | `000f9a84` | D7 remediation — scanner population 2 → 22, mutant repaired, file-count assertion added. 1 file |

Orchestrator-verified: build exit 0; web-ui **700 pass / 0 fail**; `render-golden.json`
still `27195c2e…` with **0 commits touching it across the branch**; `dist/static`
**22 `.js` / 0 `.ts`** from a clean rebuild; **20 of 22 modules converted**, only
`start-app.js` and `app.js` left. Emitted counts: `dashboard.js` 215, `wire-view-handlers.js`
367; largest emitted module is still `registry-state.js` at 554 against the 600 cap.

**D5's `require` row is now measured, not reasoned — and it holds.** T26's bullet had
directed a repoint of `dashboard-views.test.ts:12`; the pre-dispatch review flagged it
as a module specifier that D5's table says to leave alone, while noting D5 had only
*observed* `import` and `await import` and had reasoned the `require` row in. The
measurement is a clean triangle: `src/static/dashboard.js` is **absent from disk**,
the test line still literally reads
`require("../../../web-ui/src/static/dashboard.js")`, and the suite is **13 pass / 0
fail**. `createRequire`'s `require()` resolves `.js` → `.ts`, across a package
boundary, into another package's raw source tree. No repoint was made or needed.

**T27's brace-lexer hazard did not fire, because the worker was told not to trigger
it.** Zero inline object-type parameters across 428 lines of `wire-view-handlers.ts`;
the span sensor reports 2 pass / 0 fail. Note the sensor was already self-guarding —
`app-renderers.test.ts:1703-1705` asserts `length > 500` under the name "sensor
sanity — a null/tiny span proves nothing" — so the failure mode would have been loud.
The pre-dispatch note has been corrected on that point.

**D7 — a write-gating source scanner in `tools-api` has been going blind since Batch 3,
and only surfaced now by accident.** `web-ui-readonly.test.ts:39`'s `readBundleSource`
recursively globs `e.name.endsWith(".js")` over **`src/static`**. Every conversion in
this feature removed one file from its population. Measured per commit:

| commit | `.js` under `src/static` | files holding `data-action="memory-edit"` |
| --- | --- | --- |
| `6227b4ac` (base) | 21 | 2 |
| `fcdd78ec` | 14 | 2 |
| `cd93763f` (B7) | 7 | 1 |
| `fa8a4c0a` (B8) | 5 | 1 |
| `235ad1b4` (B9) | 4 | 1 |
| `efbf661c` (T26) | 3 | 1 |
| `4a1cac48` (T27) | **2** | **0** |

Its two `APP_JS` assertions hid the decay in opposite directions.
`expect(APP_JS).not.toContain("FORBIDDEN_MUTATING_PATHS")` is a **`not.toContain`** —
it becomes *more* likely to pass as the population empties, and could never have
reddened. The other is a positive `toContain` that survived only while some remaining
`.js` file still held the marker. T27 removed the last one. **A guard that had been
degrading for eight commits announced itself only because an unrelated accident ran
out.**

*The sensor it exposed has never worked.* The mutant at line 100 is built with
`\\"` escapes, so at runtime it contains `data-action=\"memory-edit\"` while the
assertion looks for `data-action="memory-edit"`. Measured in isolation: the mutant
string does **not** contain its own assertion target. Every pass it ever recorded came
from `APP_JS`. The "discrimination sensor" has never discriminated — a defect that
predates this branch.

*Why nobody guarded it.* `CHARACTERIZATION.md` lines 79-83 enumerate **five**
source-text scanners, and T31 is scoped to exactly those five. This file appears
instead at line 89, under module-`require` sites — so its `readBundleSource` glob,
structurally identical to `static-module-graph.test.ts`'s, was never classified as a
scanner. The D5 note records "verified *not* affected: `static-module-graph.test.ts`
(its `STATIC_DIR` is `dist/static`, where `.js` is the correct extension)" — the
verification checked the sibling that was fine, and never reached the one that was
breaking, because it sat under a different heading. **Two files, the same glob, one
correct and one not; the inventory that would have paired them had six members and
listed five.**

**T38 — complete, `000f9a84`.** Population **2 → 22**, verified by the scanner's own new
output line: `[web-ui-readonly] scanned 22 files under …/apps/web-ui/src/static`. One
file changed, +45 / −7; the 7 removed lines are the function signature, the `.js`
filter, the mutant literal and a comment — **no assertion deleted**. The six tools-api
suites go 55/1 → **57 pass / 0 fail** (56 pre-existing plus the new
`readBundleSource scans a non-trivial population` test); web-ui 700/0; installer
scanner 31/0; golden unchanged.

The mutant repair was verified the same way the defect was found — by evaluating the
literal in isolation with `APP_JS` simulated as `""`. Before: `contains target? false`.
After: **`true`**. The escapes were removed rather than doubled, which also makes the
mutant match how the marker actually appears in real source (`memory.ts` and
`wire-view-handlers.ts` both hold it unescaped, since they build HTML inside
single-quoted strings). The deliberate red for the population assertion:
`expect(APP_JS_FILE_COUNT).toBeGreaterThanOrEqual(22)` → `Received: 0` against an empty
scratch directory. `static-module-graph.test.ts` was not touched — its only branch
commit is `bce9bb91` (T6), which is the intended `dist/static` repoint.

*Consequences recorded, not just the fix.* T38 (new, Phase 10) restores the population
to 22, repairs the mutant's escaping, and adds the file-count assertion that would have
caught this in Batch 3. Both repairs must be one task: fixing the population alone
makes the tautology green again and re-hides it permanently. T31's scope goes from five
scanners to six. And **T30 was rewritten from a repoint task to a verification task** —
both its bullets were falsified before it ran, one by T26's `require` measurement and
one because `STATIC_DIR` is a directory path that was always correct, the defect being
the extension filter on the line below it.

**D8 — the feature's `full` gate never runs the two suites that assert the served
bytes.** Found during the Phase 11 pre-dispatch review, while checking whether T29's
`curl -sf localhost:3333/ui/app.js` bullet was executable. It is — `isPublicPath`
matches `startsWith("/ui/")`, so no key is needed — but it is also **already a test**:
`web-ui-serve.test.ts:54`, *"GET /ui/app.js returns 200 + javascript content-type"*, a
real HTTP fetch against a listening server. That is the only form that catches Elysia's
bare-string content-type override, which `CLAUDE.md` calls out explicitly and which
in-process tests cannot see.

Neither `web-ui-serve.test.ts` nor `web-ui-key-http.test.ts` appears in the `full`
gate's six-suite list. A feature whose entire subject is *what bytes get served* has
been gating on six suites that never make an HTTP request for them. Both are reached by
the repo-wide `bun run test`, so nothing shipped unverified — this is a gate-scope gap,
not a coverage gap, and the distinction is the reason it stayed invisible: the suites
were green the whole time, just never at the moment a task claimed done. Measured now:
**15 pass / 0 fail** across the two. T29's bullet is rewritten to run them and the curl
is retired into the same deferred-to-user bucket as T7's browser checks.

### Batch 11 — Phase 11 (shell entry) — T28/T29 complete, T39 added

| Task | Commit | Result |
| --- | --- | --- |
| T28 | `4d0a1fd1` | `start-app.js` → `.ts` (323 → 461 source, 356 emitted) + `AppState`, `AppRootElement`, one shared `ctx`. **Introduced D9** |
| T29 | `df4918fb` | `app.js` → `.ts` (220 source unchanged, 116 emitted). The barrel; one cast at the `globalThis.MASSA_AI_UI` assignment |
| T39 | `7a2ea525` | D9 remediation — `doc` restored and made **required** on `WireViewHandlersCtx`. 4 files, +35 / −9 |

**Every module is now TypeScript: 0 `.js` remain under `src/static`, 22 of 22
converted.** Orchestrator-verified: build exit 0; web-ui **700 pass / 0 fail**;
`dist/static` **22 `.js` / 0 `.ts`** from a clean rebuild; the two serving suites
**15 pass / 0 fail**; `render-golden.json` still `27195c2e…` with **0 commits touching
it across the branch**; `public-surface.test.ts` also **0 commits across the branch** —
the frozen export lists were never edited, the property T29 most needed.

T29's discrimination sensor fired correctly: deleting `markdownToHtml` from the named
re-export block turned `public-surface.test.ts` red on three separate assertions — the
frozen-set check, the "undefined re-export hole" check, and the shared-identity check —
then green again on restore. The barrel is genuinely guarded.

**D9 — T28 fixed a type error by deleting a runtime value, and silently broke two
user-facing features.** The task was a conversion; the worker additionally consolidated
five ad hoc `{ api, root, state, render, doc }` literals into one shared
`{ api, root, state, render }` and **dropped `doc`**, reporting that "nothing it's
passed to reads it". Two things read it:

- `views/config.ts:417` — `handleConfigReveal`: `ctx.doc && ctx.doc.getElementById ? … : null`, then `if (!el) return`. **The Config tab's secret-reveal button does nothing.**
- `views/logs.ts:419` — `handleLogsExport`: `doc && doc.createElement ? … : null`, then `if (a)`. **The Logs export never builds its download anchor.**

Both are reached from `wire-view-handlers.ts:295` and `:308`, which receive
`start-app.ts:379`'s ctx verbatim. Measured by invoking `handleConfigReveal` with each
ctx shape: `getElementById` calls **1** with `doc`, **0** without. Not a theoretical
gap — the handler does not reach the document.

*The stated reason was a type collision*: a real `Document` against `LogsDoc`'s
structural shape, via `Document.body.appendChild`'s generic signature. The repair
chosen was to delete the value rather than reconcile the type.

*Why nothing caught it, which is the part worth keeping.* `WireViewHandlersCtx`
(`wire-view-handlers.ts:104`) declares exactly `root`/`state`/`api`/`render` — authored
during **T27** from what `wireViewHandlers` *destructures in its own body*, while the
function forwards `ctx` wholesale to handlers that read more than that. `ConfigCtx.doc`
and `LogsCtx.doc` are both `doc?:`, inherited from the `&&` guards the original
JavaScript used. So the declared parameter type never mentioned the member and the
downstream types made it optional: the compiler had nothing to object to. The suite
missed it because `admin-handlers.test.ts` calls `handleConfigReveal(ctx, …)` with
**its own** ctx — a method test, not a call-site test. **One conversion wrote the type
that made the removal undetectable; the next conversion used it.** And the `&&` guards,
which exist to make the handlers defensive, are exactly what turned a missing member
into a silent no-op instead of a crash.

*Recorded consequence.* T39 restores `doc` and makes it **required** on
`WireViewHandlersCtx`, so the guard against a repeat is a compile error rather than a
test. Restoring the value without tightening the type would leave the identical drop
available to the next edit, which is why both are one task. T28's consolidation itself
is kept — it is a real simplification, and reverting it to fix a one-member omission
would discard the improvement along with the defect.

**T39 — complete, `7a2ea525`.** `doc` is back on start-app's shared ctx and
`WireViewHandlersCtx.doc: ConfigDocument & LogsDoc` is now a **required** member. All
four gates green and matching their known-good numbers exactly: **700/0**, **57/0**,
**31/0**, **15/0**; golden unchanged; `public-surface.test.ts` still at **0 commits**
across the branch.

The guard was re-observed by the orchestrator rather than accepted on report —
re-applying T28's exact edit now fails to compile:

```
start-app.ts(386,22): error TS2345: … Property 'doc' is missing in type '{ api: …; root: AppRootElement; state: AppState; render: () => Promise<void>; }' but required in type 'WireViewHandlersCtx'.
```

Control green after restoring, tree clean. **The specific mistake that caused D9 is now
a compile error** — the only kind of guard that could have stopped it, since the suite
was green throughout.

*Two scope notes, both accepted.* The worker touched 4 files rather than the 2 named;
the extra two are one `export` keyword each on the already-existing `ConfigDocument`
and `LogsDoc` interfaces, verified by diff to be export-only with no shape change. That
is the right call — the alternative is re-declaring driftable copies of both shapes in
`wire-view-handlers.ts`. And the `Document` collision was reconciled by casting once at
the ctx boundary (`doc as unknown as ConfigDocument & LogsDoc`) rather than widening
either structural type, so `ConfigDocument.getElementById`'s narrow return and
`LogsDoc.body.appendChild`'s shape keep their precision for every other caller.

**Orchestrator measurement defect, recorded because T31 inherits it.** A first attempt
to answer "which of the six scanners already assert their population" counted
`toBeGreaterThan|sanity|population` per file and produced 15, 11, 3, 7, 4, 4 — numbers
that credit index-ordering assertions
(`expect(configIdx).toBeGreaterThan(dashboardIdx)`) and rendered-output counts
(`expect(buttons.length).toBeGreaterThan(0)`) as though they guarded a source-text
scan. They do not. **The assertion T31 is looking for is one on the size of the text the
scanner read from disk**, not on anything derived from rendered HTML. A keyword sweep
cannot separate them; each of the six has to be read.

### Batch 12 — Phase 12 (cross-package consumers) — T30/T31 complete

**T30 — no repoint needed; verification-only, evidence recorded here rather than
in a diff.** Both of the task's original bullets were falsified before it ran (see
the task block quote): T26 already measured that `createRequire`'s `require()`
resolves `.js` → `.ts` across the tools-api → web-ui package boundary, and
`web-ui-readonly.test.ts`'s real defect (the `.js`-only extension filter inside
`readBundleSource`) was fixed by T38, not by repointing `STATIC_DIR`.

Re-measured directly rather than trusted:

- The three specifiers, unchanged, still read the `.js` extension literally:
  `web-ui-readonly.test.ts:21`, `web-ui-render.test.ts:13`,
  `web-ui-views.test.ts:14` — all three
  `require("../../../web-ui/src/static/app.js")`.
- `apps/web-ui/src/static/app.js` is **absent from disk**; `find apps/web-ui/src/static
  -name '*.js'` returns **0** files (22 `.ts`, 0 `.js`).
- `git diff --stat` on all three files is **empty** — zero lines, confirmed after
  the full gate run below, no edit made.

Gate (full, plus the two serve/key-http suites the feature's `full` label omits):

| Suite | Result |
| --- | --- |
| `bun run --filter @massa-ai/web-ui build` | exit 0 |
| `bun test apps/web-ui/src/__tests__/` | **700 pass, 0 fail**, 15 files |
| six tools-api web-ui suites (`web-ui-readonly`, `web-ui-render`, `web-ui-views`, `dashboard-views`, `web-ui-static-dir`, `config-section-coverage`) | **57 pass, 0 fail**, 6 files |
| `bun test scripts/__tests__/installer-config-template.test.ts` | **31 pass, 0 fail** |
| `bun test apps/tools-api/src/__tests__/web-ui-serve.test.ts apps/tools-api/src/__tests__/web-ui-key-http.test.ts` | **15 pass, 0 fail** |

All five numbers match the branch's known-green baselines exactly. `render-golden.json`
sha256 unchanged at `27195c2e…`.

**Conclusion: the T26 measurement generalises.** No edit was needed on any of the
three files; the task's deliverable is this evidence entry, not a code change.

**T31 — `857652d2`'s successor.** Reads each of the six source-text scanners
individually rather than trusting the earlier keyword-sweep counts (15, 11, 3,
7, 4, 4) recorded above under Batch 11, which credited derived-data assertions
(index-ordering, rendered-HTML-length checks) as though they guarded a disk
read. True state, measured by reading each file:

| Scanner | Reads | Population assertion |
| --- | --- | --- |
| `static-module-graph.test.ts` | every `.js` under `dist/static` | **Already real.** `expect(FILES.length).toBeGreaterThanOrEqual(15)` (line 91), plus the `beforeAll` sentinel that throws on a missing `dist/static`. Verified by both: `rm -rf dist/static` → sentinel throws naming the build command; a re-created but *empty* `dist/static` → the population assertion itself fails (`Expected: >= 15, Received: 0`). The sentinel and the population assertion are two different guards catching two different failure shapes — confirmed non-equivalent, both needed, both already present |
| `web-ui-readonly.test.ts` | every `.js`+`.ts` under `src/static` (`readBundleSource`) | **Already real**, added by T38. `expect(APP_JS_FILE_COUNT).toBeGreaterThanOrEqual(22)`. Re-verified red on a scratch empty `views/config-sections.ts`-adjacent probe is unnecessary here — T38's own scratch run already proved it against `rm -rf` of the scanned tree; not re-run a second time in this task, since T31's scope is *finding* which scanners lack the guard, and this one does not |
| `config-section-coverage.test.ts` | `views/config-sections.ts` | **Already real.** `expect(keys.length).toBeGreaterThanOrEqual(16)`. Re-verified: pointed at `config-sections.ts` emptied to `export const CONFIG_SECTIONS = [];` → `Expected: >= 16, Received: 0` |
| `installer-config-template.test.ts` | `views/config-sections.ts` | **Already real.** `expect(sections.length).toBeGreaterThanOrEqual(16)`. Re-verified against the same emptied file → `Expected: >= 16, Received: 0` |
| `app-renderers.test.ts` | `index.html`, `wire-view-handlers.ts` | **Added.** Neither raw disk read had a size assertion — the file's only existing size check (`wireViewHandlersSpan.length > 500`, line ~1718) is on the *extracted function span*, derived data, not the whole-file read. Added `expect(INDEX_HTML.length).toBeGreaterThan(1000)` and `expect(WIRE_VIEW_HANDLERS_SOURCE.length).toBeGreaterThan(5000)` |
| `registry-editor.test.ts` | `registry.ts`, `registry-state.ts`, `profiles.ts` (joined `MODELS_TAB_SOURCE`), `memory.ts` (`MEMORY_VIEW_SOURCE`) | **Added.** The file's existing `expect(targetSpans.length).toBeGreaterThanOrEqual(6)` (line 805) counts *extracted function spans*, derived data, not the raw joined source. Added `expect(MODELS_TAB_SOURCE.length).toBeGreaterThan(20000)` and `expect(MEMORY_VIEW_SOURCE.length).toBeGreaterThan(5000)` |

Four of six already carried a real guard; two (`app-renderers.test.ts`,
`registry-editor.test.ts`) did not and got one each covering both of their
respective source-text reads — four new assertions total, `apps/web-ui/src/__tests__/`
now **703 pass, 0 fail** (700 + 3 new `it`s; `registry-editor.test.ts`'s two new
assertions share one `it`).

**Six reds, all observed in scratch and reverted by hand from a `/tmp/t31-backups/`
copy (never `git checkout`), tree confirmed clean after each (`git diff --stat`
empty):**

1. `index.html` → `printf '' > index.html`: `expect(INDEX_HTML.length).toBeGreaterThan(1000)` → `Expected: > 1000, Received: 0`.
2. `wire-view-handlers.ts` → shrunk to a 37-byte valid stub (a literal empty file cascades into an unrelated `SyntaxError: Export named 'wireViewHandlers' not found`, from the same file's `await import("../static/app.js")` at module scope — a real but confounded red; the stub isolates the assertion itself): `Expected: > 5000, Received: 37`.
3. `registry.ts`/`registry-state.ts`/`profiles.ts` → all three replaced with minimal valid stubs preserving every export `app.js`'s barrel and each other require (so the module graph still imports cleanly): `MODELS_TAB_SOURCE` `Expected: > 20000, Received: 3251`.
4. `memory.ts` → replaced with a minimal valid stub, same reasoning: `MEMORY_VIEW_SOURCE` `Expected: > 5000, Received: 740`.
5. `dist/static` → moved aside entirely: `beforeAll` sentinel throws `Emitted bundle missing at … — run 'bun run --filter @massa-ai/web-ui build' first.` Re-created as an *empty* directory (sentinel now passes, existence check only): `expect(FILES.length).toBeGreaterThanOrEqual(15)` → `Expected: >= 15, Received: 0`.
6. `views/config-sections.ts` → replaced with `export const CONFIG_SECTIONS = [];`: both `config-section-coverage.test.ts` and `installer-config-template.test.ts` → `Expected: >= 16, Received: 0` (proven independently against the same emptied file, since both scanners read it).

**CHARACTERIZATION.md correction (D7 closed).** Lines 79-83 enumerated **five**
source-text scanners; `web-ui-readonly.test.ts` was filed only in the
module-imports table (it does `require("app.js")`), which is exactly why its own
`readBundleSource` source-text scan escaped this task's original scope until T38
added the population guard by hand. The source-text table now lists all **six**,
and the module-imports table's `web-ui-readonly.test.ts` row is annotated
"(also a source-text scanner, above)" so the dual nature is visible from either
table. The two `views/config.js` citations (stale since T23/T24 renamed the
module) were also corrected to `views/config-sections.ts` while in the file.

**Gate:** `bun run --filter @massa-ai/web-ui build` exit 0; `apps/web-ui/src/__tests__/`
**703 pass, 0 fail**; six tools-api web-ui suites **57 pass, 0 fail**;
`installer-config-template.test.ts` **31 pass, 0 fail**; `web-ui-serve`+`web-ui-key-http`
**15 pass, 0 fail**; `render-golden.json` sha256 unchanged at `27195c2e…`.
`bun run test:scripts`: TypeScript suites **1804 pass, 0 fail across 80 files**
(39.77s); every named shell suite block **0 failed** (`install-agents CLI` 48,
`install-agents JSON writers` 66, `MCP single writer` 57,
`plugin-auto-install` 201, `install-skills CLI` 42, and 20+ more blocks, all
0 failed). The `[deterministic] FAIL (exit 2)` / `SIGNAL SIGTERM` /
`ERROR: spawn ENOENT` lines inside that run are `run-deterministic.test.ts` and
`run-deterministic-coverage.test.ts` exercising the deterministic-gate script's
own error-handling paths under a mocked spawn — confirmed by their repeated
`[deterministic] Running 142 deterministic test files...` preamble and the
bracketing PASS run at the same file count; not a real failure.

**Orchestrator verification of Batch 12.** Re-measured independently: build exit 0;
`apps/web-ui/src/__tests__/` **703 pass / 0 fail** (700 + T31's 3 new tests); the six
tools-api suites **57/0**; installer scanner **31/0**; serving suites **15/0**;
`bun run test:scripts` **exit 0**, TypeScript portion **1804 pass / 0 fail across 80
files** in 40.8 s. `render-golden.json` unchanged; `public-surface.test.ts` still at
**0 commits** across the branch. T30's evidence re-confirmed directly: all three
specifiers still literally read `require(".../app.js")`, `src/static/app.js` is absent
from disk, and `src/static` holds **0** `.js` files.

**The D7 population guard was observed firing by the orchestrator, and the first
attempt to observe it was invalid.** Pointing `STATIC_DIR` at an empty directory
produced `0 pass / 1 fail` — but that is the module-scope
`readFileSync(STATIC_DIR/index.html)` throwing ENOENT before any test runs, not the
assertion. Isolated correctly by redirecting **only** the `readBundleSource` argument,
leaving `index.html` resolvable:

```
[web-ui-readonly] scanned 0 files under …/apps/web-ui/src/static
Expected: >= 22
Received: 0        → 4 pass, 1 fail
```

Control: `scanned 22 files`, 5 pass / 0 fail, tree clean. This is the same confounding
the worker reported honestly for `wire-view-handlers.ts` (a literally empty file
cascades into an unrelated `SyntaxError` first) — **emptying a scanner's subject
frequently breaks something upstream of the assertion under test, and the resulting
red proves nothing.** Shrink to a valid stub, or redirect only the read being tested.

That run also produced the clearest possible argument for T31's existence: with the
corpus emptied, **exactly one** of the suite's assertions failed. The
`not.toContain("FORBIDDEN_MUTATING_PATHS")` check passed vacuously on an empty string,
and the repaired mutant assertion passed because T38 made it self-satisfying. The
population count is the only thing standing between this suite and vacuous green.

**Threshold headroom differs sharply between the pre-existing guards and the new
ones, and the difference should not be read as uniform coverage.** Measured tolerance
before each assertion fires:

| Assertion | Threshold | Actual | Shrink tolerated |
| --- | --- | --- | --- |
| `APP_JS_FILE_COUNT >= 22` | 22 | 22 | **0%** |
| section keys `>= 16` (both scanners) | 16 | 16 | **0%** |
| `FILES.length >= 15` | 15 | 22 | 32% |
| `INDEX_HTML.length > 1000` | 1000 | 2133 | 53% |
| `MEMORY_VIEW_SOURCE.length > 5000` | 5000 | 14850 | 66% |
| `MODELS_TAB_SOURCE.length > 20000` | 20000 | 66110 | 69% |
| `WIRE_VIEW_HANDLERS_SOURCE.length > 5000` | 5000 | 19514 | 74% |

Accepted rather than tightened: a byte-length threshold on a source file must tolerate
ordinary editing, where a file count or a parsed-key count is a discrete, stable fact
that can sit at zero tolerance. All four new thresholds comfortably catch the failure
shape they exist for — a path that stops resolving or points at a stub, both of which
land near zero. They would *not* catch a slow 50% erosion, which is precisely how D7
actually happened (21 → 2 over eight commits, passing through 14, 7, 5, 4, 3). Worth
knowing before quoting "all six guarded" as though the six were equivalent.

**A `grep -c` on the shell-suite output returned 25 "failed" lines; every one is
`0 failed` or a test name.** The matches are result lines (`install-agents CLI: 48
passed, 0 failed`) and deliberately-named cases (`✓ codex failed install → non-zero
exit`). Filtering for a *nonzero* leading count returns nothing. Sixth instance of this
class on this feature.

**Observed doc drift, not attributable to this feature.** `CLAUDE.md` documents
`test:scripts` as "1230 TS tests across 55 files + 21 shell suites"; measured here it
is **1804 across 80 files**. This branch added no `scripts/` tests, so the gap predates
it. `CLAUDE.md` is already in T35's write set — worth correcting there, flagged rather
than folded in silently.

---

## Artifact-Store Evidence

Active artifact key `.specs/features/web-ui-typescript/tasks.md`.
Version 2 (v1 used a `### Tn (TASK-00N):` heading shape that `validate_tasks.ts`'s
`TASK_RE = /^#{2,4}\s+([A-Z]*T\d+)\s*:/i` did not match — it parsed **zero** tasks
and still reported `0 error(s)`. v2 moves the task id into the body and puts
`Tests` and `Gate` on their own lines so `TESTS_RE`/`GATE_RE` both match).
Checksum recorded on commit.
