# Discrimination sensor — `apps/web-ui/src/static/app.js` split

Verdict per phase, with the mutation evidence behind it. A characterization
suite that has never failed on purpose is an assertion, not a sensor — every row
below was observed red before it was quoted.

## Protocol

Each mutation is applied in place to the delivered file, the target suite is
run, and the file is restored **from a byte copy taken before the mutation**,
never with `git checkout` — that restores to HEAD, which during a
multi-commit refactor is not the pre-mutation state. Post-restore SHA-256 is
compared to pre-mutation for every row. A mutation whose subject is absent is
reported as `NO-OP -- INVALID` rather than scored, so a dead subject can never
read as a clean kill.

## Results

| # | Mutation | Target suite | Result |
|---|---|---|---|
| M1 | `renderProjects` help-card heading text changed | render-golden | killed — 5 fail |
| M2 | `escapeHtml` drops `"` → `&quot;` | render-golden | killed — 31 fail |
| M3 | `MASSA_AI_UI` drops `splitModelId` | public-surface | killed — 3 fail |
| M4 | `renderSearch` stops being a named export | public-surface | killed — 4 fail |
| M5 | markdown code-fence language class dropped | render-golden | killed — 7 fail |
| M6 | project-reset confirm text weakened (`start-app.js`) | app-renderers | killed — 1 fail |
| M7 | `data-action="project-reset"` renamed (`start-app.js`) | app-renderers | killed — 1 fail |
| M8 | `prompt()` reintroduced in `views/registry.js` | registry-editor | killed — 1 fail |
| M9 | `alert()` reintroduced in `views/profiles.js` | registry-editor | killed — 1 fail |
| M10 | `renderProfilesView` leaves the scanned population | registry-editor | killed — sanity assertion, 0 pass |
| M11 | project-reset confirm weakened (`wire-view-handlers.js`) | app-renderers | killed — 1 fail |
| M12 | `alert()` reintroduced in `views/registry-state.js` | registry-editor | killed — 1 fail |
| M13 | `renderModelRegistry` leaves the scanned population | registry-editor | killed — sanity assertion, 0 pass |
| M14 | config help-card text changed (`views/config.js`) | render-golden | killed — 2 fail |
| M15 | registry tombstone heading changed (`views/registry.js`) | render-golden | killed — 15 fail |

15 mutations, 15 killed, 0 survivors. Restore verified byte-identical on every
row. Two setup failures (perl quoting on M8/M9's first attempt) were reported as
`NO-OP -- INVALID` by the harness and re-run under a different mutator rather
than scored.

## Sensors repointed, and why that is not weakening them

Three tests read module source verbatim to extract function spans. Their
subjects moved during the split, so each now reads the file its subject lives
in. Nothing else changed — every assertion is byte-identical to what it was
before, and each repointed sensor was mutation-proved afterwards (M6/M7 →
M11 for `wireViewHandlers`; M8/M9/M10 → M12/M13 for the Models tab).

| Sensor | Read before | Reads now |
|---|---|---|
| `app-renderers.test.ts` `wireViewHandlers` span | `app.js` | `wire-view-handlers.js` |
| `registry-editor.test.ts` Models-tab spans | `app.js` | `views/registry.js` + `views/registry-state.js` + `views/profiles.js` |
| `registry-editor.test.ts` Memory-tab `prompt()` control | `app.js` | `views/memory.js` |

The Models-tab sensor's own span-count sanity assertion caught the population
shrinking **twice** during the split — first when `renderProfilesView` moved to
`views/profiles.js`, then when the `handleRegistry*` family moved to
`views/registry-state.js`. That is the assertion earning its place: a
scanned-population sensor that reads one file too few reports zero offenders and
looks green.

## Verdict per phase

| Phase | Scope | Verdict |
|---|---|---|
| P1 | Characterization assets | **Preserved** — sensors proved red (M1–M5) before any source moved |
| P2 | `lib/` shared leaves | **Preserved** — 622 green, all five modules at 100.00% |
| P3 | Five per-tab modules + `startApp` handler extraction | **Preserved** — 673 green, four below-floor files to 100.00% |
| P4 | Remaining views, `wire-view-handlers.js`, `start-app.js`, barrel | **Preserved** — 700 green, every file at or above the floor |

## Final measurements

```
cd apps/web-ui && XDG_CONFIG_HOME=$(mktemp -d) bun test
→ 700 pass, 0 fail

cd apps/web-ui && bunx tsc --noEmit          → exit 0
bunx oxlint --quiet apps/web-ui              → exit 0, no findings
cd apps/tools-api && bun test src/routes/web-ui-*.test.ts
→ 27 pass, 0 fail   (the route that serves this bundle)
```

| file | before | after |
|---|---|---|
| `app.js` | 3832 lines, 92.22% | 220 lines, 94.38% |
| `start-app.js` | — | 249 measured lines, 97.19% |
| `wire-view-handlers.js` | — | 291 measured lines, 93.13% |
| every other module | — | 95.15% – 100.00% |

Twenty measured source files, all at or above the 90% floor. Largest module is
`views/config.js` at 550 lines; the 600-line ceiling is enforced by
`static-module-graph.test.ts`, which already forced a second split when
`views/registry.js` reached 948.

## Residual risk

- **Two unreachable lines in `views/logs.js`** (`state.logsLive === undefined`)
  are dead under the current state initializer — the pre-existing Live-preference
  bug recorded in `CHARACTERIZATION.md` and the CHANGELOG. They are counted
  against that file's coverage and left in place, because fixing them is a
  behavior change and this refactor is not.
- **No browser was driven.** The module graph is verified statically — every
  specifier relative, extensioned, existing, inside the served root, and
  reachable from `app.js` — and the serving route's own 27 tests pass. That is
  strictly stronger than what existed before the split, and it is still not the
  same as loading `/ui` in a real browser.
