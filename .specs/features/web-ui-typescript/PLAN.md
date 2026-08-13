# Plan — convert the web UI browser bundle to TypeScript

Slug `web-ui-typescript`. Session `refactor-web-ui-typescript`. Baseline commit
`6227b4ac`, 2026-08-11. Companion: `CHARACTERIZATION.md` (frozen baselines,
blast radius, verification recipe).

**Status: plan only. No repository mutation has been made and none is authorized yet.**

## Sizing

**Spec-driven**, not Standard. Against `references/verification-ladder.md`:
21 source files (4,439 LOC) plus ~19 consumer/config files, three ownership areas
(`apps/web-ui`, `apps/tools-api`, `scripts/` + CI + Docker), a **new build step**
where the package's defining property today is that it has none, and an
unresolved architecture decision (output location) that is settled below.

The refactor workflow routes work at this size to `spec-driven` **or** splits it
into atomic tasks. This plan takes the split: 7 Phases = 31 Tasks, each phase
independently buildable, green, and revertible. That containment is the user's
call to accept — see "Decision needed" at the end.

## The actual payoff

State it plainly so the work can be judged on it. The win is not "TypeScript is
nicer". `apps/web-ui/src/__tests__/route-contract.test.ts` exists because the
renderers and the tools-api routes drift apart, and that drift is caught today
only by a hand-written JSON fixture. In `.ts`,
`import type { … } from "@massa-ai/shared"` **erases at emit** — nothing reaches
the browser, no bare specifier ships — while making the same drift a compile
error under `bun run type-check`.

Acceptance consequence: **a phase that converts files without moving at least one
renderer onto a shared server type bought syntax and nothing else.** Each phase
below names the type coupling it must land.

> **Revised 2026-08-11 after the Plan Challenge.** This payoff is real but it is
> **not exclusive to `.ts`**. Measured: JSDoc `/** @import { Section } from
> "./types.js" */` + `/** @type {Section[]} */` under `checkJs: true` produces
> `error TS2322: Type 'string' is not assignable to type 'boolean'` on a
> deliberate mismatch and passes clean on a correct one — same diagnostic, no
> build step, no `dist/`, no consumer repointing. The payoff argument therefore
> justifies *typing the bundle*; it does **not** justify Shape A over Shape C.
> See the revised Design It Twice table.

## Design It Twice — output location

The one real decision. Everything else follows from it.

| Shape | Sources | Emit | Verdict |
|---|---|---|---|
| **A (chosen)** | `src/static/*.ts` | `dist/static/*.js` | Route, Docker comment, CI comment and `web-ui-static-dir.test.ts` all change. |
| B | `src/ui/*.ts` | `src/static/*.js` | Route untouched, zero consumer path churn. **Rejected.** |
| C | stay `.js` + JSDoc | none | `checkJs: true`, no build step at all. **Rejected.** |

**A is chosen on coverage integrity.** `scripts/check-coverage.ts`
`isMeasuredSource` accepts `.js` *and* `.ts` and excludes any path containing
`/dist/`, at a blocking 90%-per-file floor. Under A the 21 modules stay measured
as `.ts` and the emitted JS is excluded exactly as every other package's `dist/`
is. Under B the emitted JS lands **inside** the measured population — 42 files
where there were 21 — and the natural repair is an `EXCLUSIONS` entry for
`apps/web-ui/src/`, which exempts real product code from a blocking gate. A also
matches `turbo.json` `build.outputs: ["dist/**"]`, so turbo's cache stays correct;
any other location silently breaks it. B additionally puts build output inside a
git-tracked source dir, and `.gitignore:8` is a bare `dist/` — the negation rule
B would need is the kind `git check-ignore` cannot see.

**C is not rejected. It is an open decision, and the original rejection rationale
was wrong.**

The first draft rejected C on two grounds: (i) the request was TypeScript, and
(ii) "the `import type` payoff is materially better in `.ts`". Ground (ii) is
**falsified** — measured above, JSDoc `@import` + `checkJs: true` delivers the
same cross-package type-only coupling with the same compiler diagnostic and zero
runtime footprint. Ground (i) stands on its own and is a legitimate reason to
pick A, but it is a **preference for native syntax, not a technical argument**,
and it was being propped up by a technical claim that does not survive checking.

The honest cost comparison:

| | Shape A | Shape C |
|---|---|---|
| Phases | 7 (29 Tasks) | ~3 (Phases 2, 3, 5-partial) |
| Build step | new, permanent | none |
| Serving route / Docker / CI comments | all change | untouched |
| Consumer repointing | 10 sites | 0 |
| `dist/` editing hazard (pre-mortem #3) | live | does not exist |
| Coverage subject | needs Shape-A discipline to stay honest | unchanged, 21 `.js` still measured |
| `static-module-graph.test.ts` rewrite | required, high risk | **not needed at all** |
| Native TS syntax | yes | no — typed JavaScript |

C removes the two highest-severity risks in this plan by construction. A buys
`.ts` syntax and `strict` on real declarations rather than JSDoc comments. That
is a genuine benefit; it is just much smaller than the first draft implied.
**Decision item 2 below is now a live question, not a formality.**

## Phases

### Phase 0 — Characterization (4 Tasks) — **complete**

Baselines measured and frozen in `CHARACTERIZATION.md`: 700 / 56 / 31 tests
across 22 files, 0 fail; `render-golden.json` and `index.html` sha256; the six
behavioural contracts; the full consumer inventory. No code touched.

### Phase 1 — Build seam and one pilot file (8 Tasks)

Proves the entire pipeline while exactly one file is converted, when the diff is
still small enough to read.

0. **Declare the dependency that Phase 3's type coupling needs.**
   `apps/web-ui/package.json` has **zero** `dependencies` today. Every other real
   consumer declares `"@massa-ai/shared": "workspace:*"` (e.g.
   `apps/tools-api/package.json`). An `import type` from `@massa-ai/shared` will
   type-check anyway in this checkout — bun's flat workspace install symlinks
   every member into the repo-root `node_modules/@massa-ai/*` regardless of who
   declares the edge — so the missing edge is **invisible until a scoped install
   or a dependency-hygiene lint**. Add it explicitly. Applies under Shape C too.
1. `tsconfig.build.json` — `rootDir: src`, `outDir: dist`, `noEmit: false`,
   `module: ESNext`, `moduleResolution: Bundler`, `target: ES2022`,
   `lib: [ES2022, DOM]`, `strict`, `verbatimModuleSyntax`, `sourceMap` +
   `inlineSources`. **Add `verbatimModuleSyntax` to the existing `tsconfig.json`
   too.** Two configs at two strictness levels means a developer's local
   `bun run type-check` is green on code the build rejects; CI catches it only
   because `bun run build` is a separate step. There is no reason for the
   asymmetry — either both carry the flag, or the divergence is stated here.
   Existing `tsconfig.json` otherwise keeps `noEmit` for `type-check`.
2. `build` script = `tsc -p tsconfig.build.json` **plus a copy-through step**
   that copies `index.html`, `styles.css`, and every *not yet converted* `.js`
   from `src/static/` into `dist/static/`. The copy-through is what makes every
   later phase independently shippable; see pre-mortem #4.
3. `dev` script = the same with `--watch`; wire into root `dev:api`.
4. Pilot: `lib/html.js` → `lib/html.ts` (47 lines, zero imports, 4 exports).
5. Repoint `buildStaticDirCandidates` in `apps/tools-api/src/routes/web-ui.ts`
   to `dist/static`, and update `web-ui-static-dir.test.ts` (8 tests, real
   filesystem, child-process probe from a cwd outside the repo).
6. Rewrite `static-module-graph.test.ts` to scan **`dist/static/*.js`** — the
   bytes the browser loads — with a `beforeAll` that fails naming
   `bun run --filter @massa-ai/web-ui build` when `dist/static` is absent
   (the `skill-artifact-parity.test.ts` idiom already used in this repo).

**Type coupling:** none — this phase is infrastructure.

**Gate:** `bun run test:coverage` still green with 21 measured `.ts`+`.js`
modules and nothing under `dist/` counted; `curl -sf localhost:3333/ui/app.js`
against a running `dev:api`; discrimination sensor on the rewritten graph guard.

**Baseline caveat — the recipe becomes build-order-dependent here, and that is a
change to contract 1, not a side effect.** Once Task 6 requires `dist/static/`,
two commands that need nothing today acquire a prerequisite:

- `bun test apps/web-ui/src/__tests__/` — `CHARACTERIZATION.md`'s own canonical
  baseline command, a direct invocation outside turbo.
- `bun run test:coverage` — root script is `bun scripts/check-coverage.ts`, a raw
  script (not a turbo task) that spawns a bare `bun test --coverage` at
  `cwd: apps/web-ui`. Turbo's `test dependsOn build` does not protect it.

CI is safe: `coverage.yml:169` runs `bun run build` before `:173`
`bun run test:coverage`. A developer following the local recipe is not.
Falsify with `rm -rf apps/web-ui/dist && bun test apps/web-ui/src/__tests__/` on
a clean tree after Phase 1. Resolve by making the rewritten guard invoke the
build itself rather than only naming it, **and** restating the canonical baseline
command in `CHARACTERIZATION.md` as the turbo-mediated one. Do not leave "all
three baselines unchanged" as the gate text — it is false as literally written.

### Phase 2 — `lib/` leaves (3 Tasks)

6 files, 382 lines, zero internal dependents beyond each other:
`html` → `forms` → `banner` → `theme` → `api-client` → `markdown`. Convert in
that order; `markdown.ts` last because `marked`/`DOMPurify` arrive as CDN globals
and need ambient declarations rather than package types.

**Type coupling:** `api-client.ts` gets the real response envelope type.
**Gate:** baselines + `bun run type-check`. `view-handlers.test.ts:23` imports
`../static/lib/forms.js` — repoint to `.ts` here, not later.

### Phase 3 — `views/` (5 Tasks)

11 files, 2,929 lines. Order: leaf renderers (`search`, `proposals`, `handoffs`,
`checkpoints`, `projects`, `profiles`) → `memory`, `logs` → `registry`,
`registry-state` → `config`.

**`config.ts` is a planned split, budgeted up front, not a reaction to a red
test.** `config.js` is 572 lines; annotating the 15-section `CONFIG_SECTIONS`
schema plus every handler signature lands at ~610-650, over the 600-line cap in
`static-module-graph.test.ts`. Split into `config.ts` (renderer + handlers) and
`config-sections.ts` (the declarative schema) *before* annotating.

Second-order effect that must be handled in the same task:
`apps/tools-api/src/routes/config-section-coverage.test.ts:30` and
`scripts/__tests__/installer-config-template.test.ts:31` both read
`views/config.js` **as text** and parse section keys out of it. If the keys move
to `config-sections.ts` and those two are not repointed, they do not fail — they
pass **vacuously**, scanning a file that no longer contains their subject.

**Type coupling:** `config-sections.ts` typed against `MassaAiConfig` from
`@massa-ai/shared` via `import type`. This is the single highest-value coupling
in the whole refactor — 15 config sections currently kept in sync by hand.
**Gate:** baselines + `render-golden.json` byte-identical (sha256 above) +
`type-check`.

### Phase 4 — Shell (3 Tasks)

`dashboard` (222), `wire-view-handlers` (363), `start-app` (323), `app` (220).
`app.ts` last — it is the barrel, and `public-surface.test.ts` freezes both its
named-export list and the separate `globalThis.MASSA_AI_UI` list, which differ
on purpose.

**Type coupling:** `start-app.ts`'s state object gets a real `AppState` type.
**Gate:** baselines + `public-surface.test.ts` green **without editing either
frozen list** — an edit there means a symbol moved and the browser bootstrap
changed.

### Phase 5 — Consumers and strictness (4 Tasks)

1. Repoint the 4 tools-api `require("…/static/*.js")` sites and the 5
   source-text readers listed in `CHARACTERIZATION.md`.
2. `tsconfig.json`: drop `allowJs`, drop `checkJs: false` — there is no JS left.
3. `apps/web-ui/src/index.ts`: its docblock currently asserts the static set is
   "intentionally NOT type-checked" and that no runtime code is exported. Both
   become false.
4. `scripts/check-security-allowlist.ts` population `apps/web-ui/src/` goes from
   1 tracked `.ts` file to 22. Run it and confirm zero new hits across
   `child-process`, `bun-spawn`, `raw-sql-unsafe`, `dynamic-eval` — browser code
   should produce none, but "should" is not a measurement.

**Gate:** full `bun run test`, `bun run test:scripts`, `bun run lint`,
`bun run test:coverage`.

### Phase 6 — Retire the copy-through and the stale claims (4 Tasks)

1. Delete the `.js` half of Phase 1's copy-through; keep `index.html` + `styles.css`.
   **Completion proof: the `src/static/**/*.js` glob is empty.**
2. `Dockerfile:38-39` — the comment asserts "apps/web-ui ships no build step".
   No `COPY` line changes: base already runs `bun run build` at `:50` *after*
   `COPY apps/web-ui` at `:42`, and api copies the built tree at `:62`. Only the
   comment is now false.
3. `.github/workflows/ci.yml:360` — same stale claim.
4. `CLAUDE.md` + `docs/ONBOARDING.md:102` + `CHANGELOG.md` under `[Unreleased]`.
   The CHANGELOG entry is a CI merge gate.

**Gate:** Docker image build + the `/ui` and `/ui/app.js` smoke from
`ci.yml:359-370`, which is the only check that exercises the real deployment path.

**Total: 7 Phases = 31 Tasks** (Phase 1 grew 6 → 8 after the Plan Challenge).

## Plan Challenge — pass 1 (author-as-verifier) — SUPERSEDED

Full gate (refactor workflow, >5 files). `massa-ai-plan-critic` not dispatched on
this pass: the session's operating instruction is *"Do not call the AgentTool
unless the user requested it"* — a **request gate, not a prohibition**, which the
first draft mis-stated as "forbidden". Ran the standalone fresh-eyes critique per
the documented fallback.

**Kept below verbatim as the record of what author-as-verifier produces.** Pass 2
(a real `massa-ai-plan-critic` dispatch, 2026-08-11) found 3 of these 5 findings
describe failure modes the plan's own body already prevents by construction. Read
pass 2 first; treat everything in this section as superseded where they conflict.

### 1. The graph guard is rewritten into a weaker guard — Critical

It is 6 months from now. `/ui` renders a blank tab in production. All 787 tests
pass. The cause traces to Phase 1: `static-module-graph.test.ts` was updated by
changing `listJsFiles`'s filter from `.js` to `.ts`, which is the obvious edit.
That version scans TypeScript **source**, where
`import type { MassaAiConfig } from "@massa-ai/shared"` is a bare specifier —
so "every specifier is relative" went red on code that is perfectly correct in
the browser, and the repair was an `import type` exemption. From that commit on,
the guard checks source that has never been through the emitter. An emitter
setting changed (`verbatimModuleSyntax` dropped during a tsconfig cleanup), one
type import survived into the emitted JS, the browser refused the module, the SPA
fallback answered `index.html` under `text/html`, and the tab went blank — the
exact silent failure the file's own docblock says it exists to prevent.

- 1st order: the strongest guard in the package stops describing the artifact.
- 2nd order: the tests keep passing, so the loss is invisible until a human loads `/ui`.
- 3rd order: confidence in the suite transfers to the next refactor, which ships the same class of break.

**Mitigation:** Phase 1 Task 6 points the guard at `dist/static/*.js`. Run the
discrimination sensor on the rewritten guard — mutate an emitted specifier in
scratch and confirm it dies — before any bulk conversion depends on it.

### 2. The 600-line cap is raised instead of `config.ts` being split — High

Phase 3, `config.js` 572 → ~610-650 with annotations. `static-module-graph.test.ts`'s
last assertion goes red on a phase whose stated goal is behaviour preservation.
The cheap repair is `n > 700`. That number is not arbitrary: the test's own
comment records that 600 is the repo coding-guidelines threshold, that `app.js`
was 3,832 lines before the split, and that the cap **already forced `registry.js`
to split again at 948**. Raising it retires the only automated defence against
regrowth, and it would be raised inside a commit whose message says "convert
config to TypeScript".

**Mitigation:** the split is Phase 3's own task, budgeted before annotation
starts. Standing rule for this refactor: **neither the 600-line cap nor the
bare-specifier assertion may be relaxed in the same commit that reddens it.**

### 3. Someone edits `dist/` and loses the change — High

First rendering bug after Phase 1. Devtools shows `dist/static/views/logs.js`,
so that is the file that gets edited. It works. The next `bun run build` erases
it. Detection point: a bug "fixed last week" reappears, and the fix is nowhere
in git history because `.gitignore:8` (`dist/`, bare, matches at any depth)
silently kept it out of `git status`.

**Mitigation:** `sourceMap: true` + `inlineSources` (Phase 1 Task 1) so devtools
opens the `.ts`; the `--watch` dev script (Task 3) so the loop stays as tight as
the zero-build one it replaces.

### 4. The halfway house — two served roots for one commit — High

21 files cannot convert atomically without a 4,400-line diff. Every incremental
sequence has a window where `src/static/` is a mix. Repoint the route to
`dist/static` *before* the copy-through exists and `/ui` serves a graph with
holes — the browser 404s, the SPA fallback returns `index.html` as `text/html`,
the tab is blank, and every test passes. Repoint it *after* and `/ui` serves the
old `.js` for the entire migration, so no phase's output is ever exercised.

**Mitigation:** Phase 1 bundles the copy-through and the route repoint into one
phase, before any bulk conversion. Every later phase then keeps `dist/static/`
complete by construction. Phase 6's empty-glob assertion is the completion proof.

### 5. Coverage silently changes subject — Medium

Covered by the Shape A/B decision above. Verify at Phase 1, with one file
converted, when the coverage diff is small enough to read line by line — not at
Phase 5 with 21.

### Inversion — what would guarantee failure

| Condition | Present today? |
|---|---|
| All 21 files in one PR | No — 7 phases |
| Route repointed without the copy-through | No — bundled in Phase 1 |
| `static-module-graph.test.ts` thresholds relaxed in response to a red | **Live.** Both the 600-line cap and the bare-specifier assertion *will* go red during this work. Guarded by the standing rule in #2. |
| `bun test` trusted as proof `/ui` works | **Live by construction** — CHARACTERIZATION contract 4. Every phase gate ends with a real `curl` against a running API. |

## Plan Challenge — pass 2, `massa-ai-plan-critic` (authoritative)

Dispatched 2026-08-11 at the user's explicit request, mode `pre_mortem`, read-only.
Method constraint enforced: the agent read `CHARACTERIZATION.md`, then `PLAN.md`
**stopping at the pass-1 header**, verified claims against live source, generated
its own narratives, and only then read pass 1 — Klein's silent-generation
ordering, which pass 1 structurally could not honour.

Every finding below was **re-verified independently** before being accepted here.

### C1 — [CRITICAL] The Shape C rejection was technically unsubstantiated

Confirmed, and it is the finding that matters. Verified by scratch compile:
JSDoc `@import` + `@type` under `checkJs: true` emits
`error TS2322: Type 'string' is not assignable to type 'boolean'` on a deliberate
mismatch, clean on a correct one — identical diagnostic to the `.ts` case, zero
build step. The "materially better in `.ts`" claim is false. Design It Twice and
"The actual payoff" are revised above; decision item 2 is now live.

### C2 — [HIGH] The verification recipe silently becomes build-order-dependent

Confirmed. Root `test:coverage` is `bun scripts/check-coverage.ts` — a raw
script, not a turbo task — spawning a bare `bun test --coverage` at
`cwd: apps/web-ui`, outside turbo's `test dependsOn build`. Same for
`CHARACTERIZATION.md`'s own canonical baseline command. CI is safe
(`coverage.yml:169` build → `:173` coverage); the documented local recipe is not.
Folded into Phase 1's Gate above as an explicit contract-1 change.

### C3 — [MEDIUM-HIGH] Phase 3's type coupling has no task adding its dependency

Confirmed. `apps/web-ui/package.json` declares **zero** `dependencies`;
`apps/tools-api` declares `"@massa-ai/shared": "workspace:*"`. It type-checks
today only because bun's flat workspace install symlinks every member at the repo
root — an incidental property, not a declared edge. Added as Phase 1 Task 0.

### C4 — [MEDIUM] Two tsconfigs, two strictness levels, no stated reason

Confirmed. `verbatimModuleSyntax` on the build config only means local
`type-check` is green on code the build rejects. Resolved in Phase 1 Task 1.

### Verdict on pass 1's own findings

| # | Pass-1 finding | Pass-2 verdict |
|---|---|---|
| 1 | Graph guard rewritten weaker | **Overstated / self-answering.** Critiques a Task 6 the plan does not contain — the `dist/static` target and discrimination sensor were already in Phase 1's gate text. Its elision mechanism is also shakier than stated: full-program `tsc` auto-elides pure type-only imports without `verbatimModuleSyntax`; that flag matters for single-file transpilers, which this pipeline is not. **Keep only** the standing rule and the sensor. |
| 2 | 600-line cap raised not split | **Evidence confirmed, novelty overstated.** Both historical numbers check out (`app.js` 3,832→220, `registry.js` re-split at 948, commit `8ac1cead`). But Phase 3's first line already says the split is budgeted up front. **Keep** the standing rule. |
| 3 | Someone edits `dist/` | **Confirmed, genuine.** Not restated elsewhere; mitigation concrete. |
| 4 | Halfway house, two served roots | **Overstated / self-answering.** Already prevented by Phase 1's task ordering (copy-through Task 2, repoint Task 5). Fair rationale for phase atomicity, not a gap. |
| 5 | Coverage changes subject | **Reasonable, was unevidenced.** Now measured: `config.js` is 98.9% covered (439/444), all 5 uncovered lines in handler branches — the split cannot plausibly push either half under the 90% floor. |

**Net: 2 of 5 genuine (3, 5), 3 self-answering (1, 2, 4).** That ratio is the
cost of author-as-verifier, and it is the reason the Independent Verification
Mandate exists. None of the 5 touched C1-C4.

Pass 1 also miscounted itself as "4 findings" in the dispatch packet and in the
chat summary; it holds 5.

### Confidence impact

Downgrade concentrated in the **size decision**, not the mechanics. Every
low-level technical claim held under independent check — `tsc` `Bundler`
resolution of `./x.js` → `x.ts` with verbatim specifier emit, `import type`
erasure, all line counts, all file:line citations, `.gitignore:8` coverage,
Docker ordering, `verify-package-contents.ts` absence. Phases 1-6 are executable
as written **if** Shape A is confirmed. What is falsified is the premise that A
is clearly right over C.

## Decision needed before Phase 1

1. **Accept Spec-driven size inside the refactor workflow**, or route to
   `workflows/spec-driven.md` for the full Specify → Design → Tasks → Execute
   treatment with independent validation.
2. **Shape A or Shape C — now the primary question, not a formality.** The
   technical case for A over C was falsified (C1). C drops the plan from 7
   phases to ~3, introduces no build step, requires no route/Docker/CI change,
   no consumer repointing, no `static-module-graph.test.ts` rewrite, and
   eliminates pre-mortem findings #3 and #4 by construction — while delivering
   the same `@massa-ai/shared` type coupling with the same compiler diagnostic.
   A's remaining advantage is native TS syntax and `strict` over real
   declarations instead of JSDoc comments. That is a real preference and a
   sufficient reason to choose A; it is just not the technical landslide the
   first draft asserted. **Pick on the syntax question, with the cost table above
   in view.**
3. **Delivery authorization.** No worktree, branch, or commit has been created.
   `references/implementation-delivery.md` Stage 0-1 runs at Phase 1 start.
