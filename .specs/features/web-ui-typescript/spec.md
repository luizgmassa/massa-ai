# Web UI TypeScript Conversion Specification

Slug `web-ui-typescript` · session `spec-web-ui-typescript` · projectId `massa-ai`
Branch `spec/web-ui-typescript` from `origin/main` @ `6227b4ac`, worktree
`/Users/luizmassa/Projects/massa-ai-wt-web-ui-typescript`.

Inputs: `CHARACTERIZATION.md` (frozen baselines, blast radius, six behavioural
contracts) and `PLAN.md` (Design It Twice, 7-phase plan, two Plan Challenge
passes) in this directory. Both were authored before this spec and carry the
measured evidence this document depends on.

## Problem Statement

`apps/web-ui/src/static/` is 21 hand-written browser ES modules, 4,439 lines,
served verbatim with no build step. They carry no types at all — `tsconfig.json`
sets `allowJs: true, checkJs: false`, so `bun run type-check` reads them and
asserts nothing. The renderers reproduce the tools-api response shapes and the
15-section `MassaAiConfig` schema by hand, and the only thing keeping them in
sync is `route-contract.test.ts` plus a hand-maintained JSON fixture. Drift is
caught after the fact, by a test someone remembered to write, or not at all.

## Goals

- [ ] All 21 modules are `.ts` under `strict`, and `bun run type-check` covers them.
- [ ] At least one renderer's data shape is coupled to `@massa-ai/shared` at
      compile time, so server-contract drift becomes a `type-check` failure.
- [ ] Zero behaviour change: `render-golden.json` byte-identical, both frozen
      public-surface lists unedited, 787 tests green.
- [ ] The browser-resolvability guard asserts against the bytes the browser
      actually loads, which it cannot do today.

## Out of Scope

| Item | Reason |
| --- | --- |
| Shape C (JSDoc + `checkJs: true`) | Evaluated and rejected by the user 2026-08-11 after the Plan Challenge falsified the original technical case. `PLAN.md` retains the full cost table. |
| Bundling, minification, tree-shaking | The 21 modules ship as separate ES modules today and continue to. A bundler is a second, unrelated decision. |
| Any renderer behaviour change | Behaviour-preserving conversion. A rendering improvement noticed mid-work becomes a follow-up, not a task here. |
| Migrating `index.html` / `styles.css` | Not JavaScript. Copied through unchanged. |
| Publishing `@massa-ai/web-ui` | Stays `private: true`. See ASM-04. |
| Converting `apps/web-ui/src/__tests__/*.ts` | Already TypeScript. Only their `.js` → `.ts` path references change. |
| `packages/*/dist` or any other `.js` in the repo | Build output and benchmark corpus. Different subjects. |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| ASM-01 Output location | `apps/web-ui/dist/static/` | `isMeasuredSource` excludes `/dist/`, keeping the 21 `.ts` sources measured at the 90% floor with emitted JS correctly excluded; matches `turbo.json` `build.outputs: ["dist/**"]`. Any other location either corrupts the coverage population or breaks turbo cache correctness. | y — user chose Shape A |
| ASM-02 Dev loop | `tsc --watch` via turbo, `dev:api` filter extended | User-selected. **Mechanism differs from the option preview:** `concurrently` is **absent** from this repo. Verified instead that `turbo run dev --filter @massa-ai/tools-api... --filter @massa-ai/web-ui` resolves all 4 packages, and that `@massa-ai/core#dev` (`bunx tsc --watch`) already runs concurrently with tools-api's watch today — same mechanism, proven in-repo, no new dependency. | y |
| ASM-03 Graph guard target | `dist/static/*.js` only | User-selected. Accepts the build-order coupling (WUT-04) in exchange for a guard that describes the shipped artifact. | y |
| ASM-04 No tools-api → web-ui dependency edge | Extend the `dev:api` **filter**; do not add `@massa-ai/web-ui` to tools-api `dependencies` | `@massa-ai/tools-api` is published (`private: false`); `@massa-ai/web-ui` is `private: true`. `publish.yml` rewrites `workspace:*` to `^X.Y.Z`, so the edge would publish tools-api depending on a package absent from npm — install-breaking for every consumer. | y (agent-resolved; verified from both `package.json` files) |
| ASM-05 Emit/refresh race | Accepted, unmitigated | `tsc --watch` on a large file can lose a race with a fast browser refresh, serving the previous emit. Cost is one extra refresh. Mitigating it needs a serve-time build barrier, which reintroduces the latency watch mode exists to remove. | y (accepted risk) |
| ASM-06 CDN globals | Ambient declarations, not `@types` packages | `marked` and `DOMPurify` arrive as `<script>` globals from jsDelivr (`index.html:8-9`), not as imports. A bare `import` of their types would emit a bare specifier and break browser resolution. | y (agent-resolved) |
| ASM-07 Delivery shape | One branch, one PR | User-selected. 31 task commits on `spec/web-ui-typescript`. | y |
| ASM-08 `config.ts` split | In scope, budgeted before annotation | `config.js` is 572 lines; annotation lands it at ~610-650, over the 600-line cap. The split is forced by this work, so it belongs to this work. | y (agent-resolved) |

**Open questions:** none — all resolved with the user or logged above.

---

## User Stories

### P1: The browser still gets a working bundle ⭐ MVP

**User Story**: As an operator opening `/ui`, I want the dashboard to load and
work exactly as before, so that a source-language change is invisible to me.

**Why P1**: `web-ui.ts`'s SPA fallback answers an unresolved path with
`index.html` under `content-type: text/html`. A broken module graph therefore
does not 404 — the tab renders blank while every test passes. This is
CHARACTERIZATION contract 4 and the reason this story is the MVP.

**Acceptance Criteria**:

1. WHEN `bun run --filter @massa-ai/web-ui build` completes THEN the build SHALL produce `apps/web-ui/dist/static/app.js` plus one emitted `.js` per converted module, preserving each module's relative path under `static/`. <!-- event-driven -->
2. WHEN `GET /ui/app.js` is requested against a running Tools API THEN the response SHALL carry status 200 and `content-type: text/javascript; charset=utf-8`. <!-- event-driven -->
3. WHEN `GET /ui` is requested THEN the response SHALL carry `content-type: text/html` and contain `<!DOCTYPE html>`. <!-- event-driven -->
4. The emitted bundle SHALL contain zero bare import specifiers — every specifier relative, carrying an explicit `.js` extension, resolving to a file inside `dist/static/`, and reachable from `app.js`. <!-- ubiquitous -->
5. IF `apps/web-ui/dist/static/` is absent when the module-graph guard runs THEN the guard SHALL fail with a message naming `bun run --filter @massa-ai/web-ui build`, never pass vacuously on a zero-file scan. <!-- unwanted-behavior -->
6. WHILE the conversion is partially complete, the build SHALL copy every not-yet-converted `src/static/**/*.js` plus `index.html` and `styles.css` into `dist/static/`, so the served graph is complete at every commit. <!-- state-driven -->

**Independent Test**: `bun run --filter @massa-ai/web-ui build && bun run dev:api`, then `curl -sf localhost:3333/ui/app.js` and load `/ui` in a browser.

---

### P1: Every module is TypeScript under strict ⭐ MVP

**User Story**: As a maintainer, I want the whole bundle type-checked under
`strict`, so that a wrong property name fails at build time instead of rendering
`undefined` into the page.

**Why P1**: This is the request.

**Acceptance Criteria**:

1. The `src/static/**/*.js` glob SHALL match zero files. <!-- ubiquitous -->
2. WHEN `bun run type-check` runs THEN it SHALL type-check all 21 modules under `strict` and exit 0. <!-- event-driven -->
3. The `apps/web-ui` `tsconfig.json` SHALL declare neither `allowJs` nor `checkJs`, both being meaningless once no JavaScript remains. <!-- ubiquitous -->
4. The `tsconfig.json` and `tsconfig.build.json` files SHALL both carry `verbatimModuleSyntax`, so a local `type-check` cannot be green on code the build rejects. <!-- ubiquitous -->
5. The bundle SHALL contain no module under `src/static/` exceeding 600 lines. <!-- ubiquitous -->
6. WHERE a browser global arrives from a CDN `<script>` tag rather than an import, the module SHALL type it through an ambient declaration and SHALL NOT import it by bare specifier. <!-- optional-feature -->

**Independent Test**: `bun run type-check`; `git ls-files 'apps/web-ui/src/static/**/*.js'` returns nothing.

---

### P1: Behaviour is provably unchanged ⭐ MVP

**User Story**: As a reviewer, I want deterministic proof that rendering did not
change, so that "behaviour-preserving" is a measurement rather than a claim.

**Why P1**: The whole justification for calling this a refactor.

**Acceptance Criteria**:

1. The `render-golden.json` fixture SHALL remain byte-identical to sha256 `27195c2e9975ae28481d7fd6d8d778232f3df07e0556253a2dfbc05ffb77af30`. <!-- ubiquitous -->
2. The two frozen lists in `public-surface.test.ts` — `app.js` named exports and `globalThis.MASSA_AI_UI` — SHALL pass unedited. <!-- ubiquitous -->
3. WHEN the three characterization command baselines run THEN they SHALL report 700, 56 and 31 passing tests with 0 failures. <!-- event-driven -->
4. The `index.html` shell SHALL remain byte-identical to sha256 `60cb0daed27b78c0ce777a1f5aa6f4f2679c299f87fba74e56881b343df7ee58`. <!-- ubiquitous -->
5. IF a test must be edited to pass THEN the change SHALL be a path or extension repoint only, never a weakened assertion, a raised threshold, or a new exemption. <!-- unwanted-behavior -->
6. WHEN `bun run test:coverage` runs THEN every converted module SHALL meet the 90% per-file floor, and no file under `dist/` SHALL appear in the measured population. <!-- event-driven -->

**Independent Test**: `shasum -a 256` on both fixtures; the three baseline commands; `git diff --stat` on `public-surface.test.ts` is empty.

---

### P2: The renderers are coupled to the server contract

**User Story**: As a maintainer, I want the config renderer typed against the
real `MassaAiConfig`, so that adding a config section server-side fails the UI
build instead of silently rendering a missing form.

**Why P2**: The payoff that makes this more than a syntax change — but the
bundle is shippable without it, so it is not MVP.

**Acceptance Criteria**:

1. The `apps/web-ui/package.json` file SHALL declare `"@massa-ai/shared": "workspace:*"` in `dependencies`. <!-- ubiquitous -->
2. The config section schema SHALL be typed against `MassaAiConfig` imported from `@massa-ai/shared` via `import type`. <!-- ubiquitous -->
3. WHEN the build emits the config module THEN the emitted `.js` SHALL contain no reference to `@massa-ai/shared`. <!-- event-driven -->
4. IF a config section key is added to `MassaAiConfig` without a matching entry in the UI schema THEN `bun run type-check` SHALL fail. <!-- unwanted-behavior -->

**Independent Test**: add a bogus key to the shared config type in scratch; `bun run type-check` goes red; revert. Grep the emitted config `.js` for `massa-ai/shared` — zero hits.

---

### P2: The dev loop survives the build step

**User Story**: As a developer editing a view, I want save-then-refresh to show
my change, so that adding a build step does not cost the zero-build loop.

**Acceptance Criteria**:

1. WHEN `bun run dev:api` starts THEN it SHALL run the web-ui `tsc --watch` alongside the Tools API watch, both persistent. <!-- event-driven -->
2. WHEN a `src/static/**/*.ts` file is saved WHILE the dev watch runs THEN the corresponding `dist/static/**/*.js` SHALL be re-emitted without a manual command. <!-- complex -->
3. The build SHALL emit source maps with inlined sources, so browser devtools opens the `.ts` file rather than the emitted `.js`. <!-- ubiquitous -->
4. The `apps/web-ui/dist/` directory SHALL remain untracked by git. <!-- ubiquitous -->

**Independent Test**: start `dev:api`, edit a view's literal string, save, refresh, observe the change; confirm devtools shows `.ts` sources; `git check-ignore -v apps/web-ui/dist/static/app.js` resolves.

---

### P2: Consumers are repointed without going vacuous

**User Story**: As a reviewer, I want every cross-package reference updated and
still asserting, so that a scan whose subject moved fails loudly instead of
passing on an empty population.

**Why P2**: Five suites read these modules as **source text**. A repoint that
leaves them scanning a file that no longer holds their subject does not fail —
it passes on zero matches, which reads as success.

**Acceptance Criteria**:

1. The repository SHALL resolve every cross-package reference to a `src/static/**/*.js` path to the corresponding `.ts` file or its post-split successor. <!-- ubiquitous -->
2. WHERE a suite parses a module as source text, it SHALL assert a non-zero population count before asserting on its contents. <!-- optional-feature -->
3. IF the config schema keys move to a new module THEN `config-section-coverage.test.ts` and `installer-config-template.test.ts` SHALL be repointed in the same commit that moves them. <!-- unwanted-behavior -->
4. WHEN `scripts/check-security-allowlist.ts` runs THEN it SHALL report zero new hits across `child-process`, `bun-spawn`, `raw-sql-unsafe` and `dynamic-eval` for the 21 newly-in-population `.ts` files. <!-- event-driven -->

**Independent Test**: `bun run test:scripts` and `bun run test:plugins` green; deliberately empty each text-scanning suite's population in scratch and confirm it fails.

---

### P3: Stale claims are corrected

**User Story**: As the next reader, I want the "no build step" claims removed, so
that the documentation does not contradict the repository.

**Acceptance Criteria**:

1. WHEN the conversion completes THEN `Dockerfile:38-39`, `.github/workflows/ci.yml:360`, `apps/web-ui/src/index.ts`'s docblock, `CLAUDE.md` and `docs/ONBOARDING.md` SHALL no longer assert that `apps/web-ui` ships no build step. <!-- event-driven -->
2. The `CHANGELOG.md` file SHALL carry an entry under `[Unreleased]`. <!-- ubiquitous -->
3. The `CHARACTERIZATION.md` canonical baseline command SHALL be restated as the turbo-mediated form, since the direct form acquires a build prerequisite. <!-- ubiquitous -->

**Independent Test**: `git grep -n 'no build step' -- Dockerfile .github docs apps/web-ui CLAUDE.md` returns nothing; CI CHANGELOG merge gate passes.

---

## Edge Cases

- IF `bun run test:coverage` or a direct `bun test apps/web-ui/src/__tests__/` runs on a clean tree with no `dist/static/` THEN the module-graph guard SHALL fail with the named build command (WUT-04). Neither command is turbo-mediated — root `test:coverage` is `bun scripts/check-coverage.ts`, a raw script spawning bare `bun test` at `cwd: apps/web-ui`.
- IF `tsc` emits an extensionless or bare specifier into `dist/static/` THEN the module-graph guard SHALL fail (WUT-03).
- WHEN `config.ts` is split, the two halves SHALL each stay under 600 lines and each meet the 90% coverage floor. `config.js` measures 98.9% today (439/444), all 5 uncovered lines in handler branches.
- IF a Docker image is built without the web-ui build having run THEN `GET /ui` SHALL fail loudly with `500 web ui static dir not found`, not serve a partial graph. The `base` stage runs `bun run build` after `COPY apps/web-ui`, so the nominal path is covered.
- WHEN the API-key `<meta>` injection path is exercised after `api-client.ts` converts, the trusted and untrusted caller branches SHALL both behave as before (`api-key-header.test.ts`, `write-mode.test.ts`).

## Implicit-Requirement Dimensions Sweep

Large scope — every dimension resolves to a requirement or an explicit `N/A because`.

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | WUT-07 (600-line bound). Runtime input validation (`escapeHtml`, DOMPurify) is unchanged and guarded by WUT-08. |
| Failure / partial-failure states | WUT-04 (copy-through keeps the served graph complete at every commit); WUT-05 (guard fails loudly, never vacuously). |
| Idempotency / retry / duplicate handling | `tsc` emit is idempotent; re-running the build over an existing `dist/` is safe. `N/A because` no stateful or networked operation is introduced. |
| Auth boundaries & rate limits | The `x-api-key` meta-injection and write-mode gate live in `api-client.ts`, which converts. Covered by WUT-10 (existing auth suites in the 700) and the edge case above. No auth behaviour changes. |
| Concurrency / ordering | ASM-05 (emit/refresh race, accepted). Build-order coupling is WUT-04 plus the edge case. |
| Data lifecycle / expiry | `N/A because` the conversion introduces no persisted data; `dist/` is regenerable build output. |
| Observability | A failed build fails the turbo task and the CI `build` job loudly. `N/A because` no new runtime logging surface is introduced — stdout discipline belongs to the MCP server, not this bundle. |
| External-dependency failure | ASM-06 — `marked` and DOMPurify are CDN `<script>` globals; typing them must not introduce a bare specifier. WUT-11 (P1) is the guard. |
| State-transition integrity | WUT-04. The migration's own states (partially converted, fully converted, copy-through retired) each keep `dist/static/` complete; Phase 6's empty-glob assertion is the terminal-state proof. |

Prose sweep: users/permissions unchanged (operator at `/ui`, same trust model);
no new payload fields, persisted records or emitted events; no migration or
irreversible behaviour (`dist/` is regenerable, the branch is revertible);
empty/loading/error states are existing renderer behaviour under WUT-08;
performance is unmeasured and out of scope — the same modules ship, unbundled;
accessibility and localization unchanged; platform-specific behaviour `N/A because`
the bundle is browser-only. Deterministic assertions are required for every AC
except the two browser-visual ones (P1 story 1 Independent Test, P2 dev-loop
AC2), which are manual observations recorded as such.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| WUT-01 | P1: browser bundle | Execute | Verified |
| WUT-02 | P1: browser bundle | Execute | Verified |
| WUT-03 | P1: browser bundle | Execute | Verified |
| WUT-04 | P1: browser bundle | Execute | Verified |
| WUT-05 | P1: TypeScript under strict | Execute | Verified |
| WUT-06 | P1: TypeScript under strict | Execute | Verified |
| WUT-07 | P1: TypeScript under strict | Execute | Verified |
| WUT-08 | P1: behaviour unchanged | Execute | Verified |
| WUT-09 | P1: behaviour unchanged | Execute | Verified |
| WUT-10 | P1: behaviour unchanged | Execute | Verified |
| WUT-11 | P2: server-contract coupling | Execute | Verified |
| WUT-12 | P2: server-contract coupling | Execute | Verified |
| WUT-13 | P2: dev loop | Execute | Verified |
| WUT-14 | P2: consumers repointed | Execute | Verified |
| WUT-15 | P2: consumers repointed | Execute | Verified |
| WUT-16 | P3: stale claims | Execute | Verified |

**ID format:** `WUT-NN`. **Status values:** Pending → In Design → In Tasks → Implementing → Verified.

**Coverage:** 16 total, 16 mapped to tasks, 0 unmapped ✅. Every ID is cited by at least one task in `tasks.md` (verified: `grep -oE 'WUT-[0-9]+' tasks.md | sort -u` returns WUT-01..WUT-16 with no gaps and no phantom ids), and all 16 were re-measured against the tree by an independent verification pass — see `validation.md`.

---

## Verification Approach

Ladder level 3 (behavioural) is the floor; level 2 (file integrity) is where the
behaviour-preservation claim actually rests.

| Level | Check |
| --- | --- |
| 1 static | `bun run type-check`, `bun run lint`, `bun run --filter @massa-ai/web-ui build` |
| 2 integrity | `shasum -a 256` on `render-golden.json` + `index.html`; `git diff` on `public-surface.test.ts` empty; no threshold or exemption edited in `static-module-graph.test.ts` |
| 3 behavioural | the three characterization baselines (700/56/31); `bun run test`, `test:scripts`, `test:plugins`, `test:coverage`; `curl` against a running `dev:api`; Docker `/ui` + `/ui/app.js` smoke |
| 4 higher-order | discrimination sensor on the rewritten module-graph guard and on each converted PR group, per `references/discrimination-sensor.md` |

Validation assets that must not be weakened: `render-golden.json`,
`public-surface.test.ts`'s two frozen lists, `static-module-graph.test.ts`'s
seven assertions (especially the 600-line cap and the reachability walk),
`web-ui-static-dir.test.ts`'s child-process probe, and the CI Docker `/ui` smoke.

## Discuss Context

Three decisions were put to the user 2026-08-11 and answered: dev loop (watch
wired into `dev:api`), module-graph guard target (emitted `dist` only), delivery
shape (one branch, one PR). Recorded as ASM-02, ASM-03, ASM-07. A fourth — Shape
A vs Shape C — was resolved in the preceding Plan Challenge and is recorded in
Out of Scope with its full cost table in `PLAN.md`.

## Success Criteria

- [ ] `git ls-files 'apps/web-ui/src/static/**/*.js'` returns zero rows.
- [ ] 787 tests green across the three characterization baselines.
- [ ] `render-golden.json` and `index.html` sha256 unchanged.
- [ ] A deliberate `MassaAiConfig` mismatch fails `bun run type-check` in scratch.
- [ ] `/ui` and `/ui/app.js` served correctly from a Docker image built by CI.
- [ ] No validation asset weakened; every test edit is a path repoint.

## Artifact-Store Evidence

Active artifact key `.specs/features/web-ui-typescript/spec.md`.
Version 1 (initial write, 2026-08-11). Checksum recorded on commit.
