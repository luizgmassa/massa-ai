# Characterization — `apps/web-ui/src/static/app.js` god-file split

Behavior-preserving structural split of a 3832-line browser module into feature
modules. Baseline frozen at `6a0b1c2d` (`chore(release): v1.48.0`), before any
line moved.

## Subject

| | |
|---|---|
| File | `apps/web-ui/src/static/app.js` |
| Lines | 3832 |
| Loaded as | `<script type="module" src="/ui/app.js">` (`index.html:61`) |
| Also loaded as | `await import("../static/app.js")` by 8 suites in this package |
| Served by | `apps/tools-api/src/routes/web-ui.ts` — `/ui/*` reads the static dir verbatim |
| Already modular | imports `./dashboard.js`, so sibling ES modules are a proven-served pattern |

## Baseline commands and results

```
cd apps/web-ui && XDG_CONFIG_HOME=$(mktemp -d) bun test
→ 528 pass, 0 fail, 1415 expect() calls, 10 files, 1309 ms
```

```
cd apps/web-ui && XDG_CONFIG_HOME=$(mktemp -d) \
  bun test --coverage --coverage-reporter=lcov --coverage-dir=coverage-baseline
→ src/static/app.js      2524/2737   92.22%
  src/static/dashboard.js  140/142   98.59%
  src/index.ts               1/1    100.00%
```

The scratch `XDG_CONFIG_HOME` is not decoration: without it the suites read the
developer's real `~/.config/massa-ai/config.json`, which is what makes a local
number not a CI number.

## The constraint that shapes the whole refactor

`apps/web-ui` is a unit in `scripts/check-coverage.ts` under a **90% per-file
line floor**, enforced by the blocking `coverage.yml` workflow. `app.js` has no
exclusion entry, so today's 92.22% is a real gate reading — and it is one
low-coverage region hidden inside a well-covered mass:

| span | lines | covered |
|---|---|---|
| everything except `startApp` | 2062 | ~98.6% |
| `startApp` (L2957–3755) | 675 | **500 / 74.07%** |
| ├ closure form handlers (L3479–3638) | 128 | 59 / 46.09% |
| ├ `startIndexPoll` + `clearIndexPoll` | 32 | 4 / 12.50% |
| ├ EventSource block | 28 | 8 / 28.57% |
| ├ `beforeunload` | 10 | 2 / 20.00% |
| └ `render()` | 112 | 90 / 80.36% |
| `wireViewHandlers` | 281 | 261 / 92.88% |

Consequence, measured rather than assumed: **any** split that separates
`startApp` from the rest fails the gate. Extracting only the three worst chunks
still leaves the shell at 492/547 = **89.95%**. So raising `startApp`'s coverage
is part of the refactor, not a follow-up — the extracted logic becomes
`ctx`-taking exported functions, which is the pattern `app.js:1911-1914` already
documents for exactly this reason ("this avoids a `startApp` DOM harness for
handler tests").

Projected per-file coverage for the chosen layout, computed by mapping the
baseline lcov `DA:` records onto the planned line spans:

| file | projected | file | projected |
|---|---|---|---|
| `lib/html.js` | 100% | `views/search.js` | 100% |
| `lib/markdown.js` | 100% | `views/proposals.js` | 93.75% |
| `lib/theme.js` | 100% | `views/logs.js` | 95.10% |
| `lib/api-client.js` | 100% | `views/config.js` | 98.85% |
| `lib/banner.js` | 100% | `views/profiles.js` | 95.74% |
| `lib/forms.js` | **70.00%** | `views/registry.js` | 98.70% |
| `views/projects.js` | **58.27%** | `views/handoffs.js` | **82.54%** |
| `views/memory.js` | 90.28% | `views/checkpoints.js` | **81.18%** |
| `app.js` (barrel) | 92.86% | `start-app.js` | **84.85%** |

Six files land below the floor and are the explicit test-writing scope of P4.

## Behavior contract — what must not change

1. **Named exports.** Exactly 55, frozen literally in `public-surface.test.ts`.
2. **`globalThis.MASSA_AI_UI`.** Exactly 59 keys. The asymmetry is real and
   pinned: 5 symbols are UI-only (`startApp`, `renderDashboard`,
   `createApiClient`, `readInjectedApiKey`, `collectConfigSectionFields`) and
   `readLogsLivePreference` is a named export that is not on the global.
3. **Shared identity.** A symbol on both surfaces must be the same function
   object — the barrel re-exports bindings, never wrappers.
4. **Rendered HTML, byte-identical.** 85 frozen cases in
   `fixtures/render-golden.json`, 372 229 characters.
5. **528 existing tests stay green.**
6. **Every file at or above the 90% floor.**

## Characterization sensors added

| Sensor | What it pins |
|---|---|
| `src/__tests__/render-golden.test.ts` + `fixtures/render-golden.json` | Exact output string of every renderer over 85 fixed inputs, both write modes, including error branches and pure helpers |
| `src/__tests__/public-surface.test.ts` | Both export surfaces literally, plus undefined-hole and shared-identity checks |

The golden fixture is **committed, not regenerated on read**. A baseline read
from the live tree goes green against whatever the refactor happens to produce,
which is the one thing it must not do. Regeneration is deliberate and explicit:
`MASSA_AI_WRITE_GOLDEN=1 bun test src/__tests__/render-golden.test.ts`.

Existing substring assertions (`toContain('data-action="…"')`) are the right
shape for pinning a decision and the wrong shape for proving a move: a renderer
can lose a whole help card and still contain every asserted substring. That gap
is what the golden fixture closes.

## Discrimination sensor — observed red

A sensor written in the same session as its subject is unquotable until it has
failed on purpose. Five mutations applied to `app.js` in place; backup taken as
a byte copy and restored from that copy (never `git checkout`, which restores to
HEAD rather than to the pre-mutation state); post-restore SHA-256 verified equal
to pre-mutation.

| # | Mutation | Result |
|---|---|---|
| M1 | `renderProjects` help-card heading text changed | **killed** — 5 fail |
| M2 | `escapeHtml` drops `"` → `&quot;` | **killed** — 31 fail |
| M3 | `MASSA_AI_UI` drops `splitModelId` | **killed** — 3 fail |
| M4 | `renderSearch` stops being a named export | **killed** — 4 fail |
| M5 | markdown code-fence language class dropped | **killed** — 7 fail |

Restore verification: `YES` (pre- and post-SHA identical).

## Known hazards carried into execution

1. **Text-anchored sensors on `app.js` source.** Three of them, and they read
   the file verbatim rather than importing it:
   - `app-renderers.test.ts:1646` extracts the `wireViewHandlers` span → the
     function moves to `start-app.js`.
   - `registry-editor.test.ts:718` extracts `handleRegistry*` /
     `renderModelRegistry` / `renderProfilesView` spans → move to
     `views/registry.js`.
   - the same file asserts `APP_JS_SOURCE` contains
     `prompt("Edit memory content:", "")` → moves to `views/memory.js`.

   Each has a sanity assertion, so a null span fails loudly rather than passing
   vacuously. Repointing them is editing a guard mid-refactor, so each repoint
   is re-proved red by mutation before its group is marked verified, and every
   assertion is kept byte-identical — only the file the source is read from
   changes.

2. **`/ui/*` falls back to `index.html`.** `web-ui.ts:250-257` serves the shell
   for any unresolved non-traversal path. A wrong import specifier therefore
   ships `text/html` where the browser expects a module: the tab renders blank
   while every `bun test` stays green, because Bun resolves the same specifier
   off disk. Closed by a route-level test asserting `content-type:
   text/javascript` and a non-`<!DOCTYPE` body for every new module path.

3. **One PR, not four.** `release.yml` fires on green CI on `main`, so each
   merge cuts a release, and sibling PRs conflict on `CHANGELOG.md` — which
   stops CI running on them at all (recorded incident). The four phases are
   atomic commits on one branch.

## Phases

| Phase | Scope | Gate |
|---|---|---|
| P1 | Characterization assets only, no source moves | both new suites green; 5/5 mutations killed |
| P2 | `lib/{html,markdown,theme,api-client,banner}.js` — pure moves, all already 100% | golden + surface + 528 green |
| P3 | `views/{search,proposals,config,profiles,registry,logs}.js` — pure moves; served-module route test | golden + surface + 528 green; per-file coverage ≥ 90% |
| P4 | `startApp` decomposition into `ctx` handlers, `start-app.js`, new tests for the six below-floor files, three sensors repointed | full suite + `bun run test:coverage --only=apps/web-ui` green |
