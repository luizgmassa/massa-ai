# Portal Handoff/Proposal CRUD — Validation

Contract: `spec.md` · Design: `design.md` · Tasks: `tasks.md`.
Branch `feat/portal-handoff-proposal-crud`, stacked on `dbdceead` (PR #107).

**Verdict: PASS.** Independent verification was performed by an agent that built
none of this feature. It re-derived every quoted figure and independently
reproduced four mutations rather than trusting the commit messages that claimed
them. No coverage-matrix row was found asserting something its sensor did not
test.

## Re-measured at close-out — not quoted from Phase 1

Every figure below was measured on `feed5575`. The route population is stated
three times in this document's history and **changed twice**, which is exactly
why the spec requires re-measurement rather than citation.

| Figure | Value | Command |
| --- | --- | --- |
| Routes in `apps/tools-api/src/routes/` | **91** | `cd apps/tools-api && bun test src/middleware/write-mode-population.test.ts` (prints the population) |
| `GET` / non-`GET` | **32 / 59** | same |
| Classified read-only / gate-refused | **10 / 49** | same |
| MCP tools | **59** | `TOOL_DEFINITIONS.length`, evaluated directly |
| FK constraints on `handoffs`/`proposals` | **0**, both directions | live `pg_constraint` query, both the :5432 and :5433 instances |

The population's history is worth preserving because two of the three values
were wrong when written:

- **81 / 50** — the original. A newline-anchored regex (`\n\s*\.`) silently
  missed every route chained onto its own `new Elysia({ prefix })` call on the
  same line: `POST /api/v1/analytics/`, `POST /api/v1/bootstrap/`,
  `POST /api/v1/file/read`, `POST /api/v1/web/fetch_and_index`,
  `GET /api/v1/events`.
- **86 / 54** — corrected in `8ae87e10`, and the Phase 1 floors raised to match.
- **91 / 59** — after this feature's own five new write routes.

Four of the five originally-missed routes are non-`GET`, one of them fetches and
indexes remote content, and **all four were protected regardless**, because
default-deny refuses whatever nobody classified. That is the argument for D1
stated as a measurement rather than a prediction: a denylist can only contain
what its author's enumeration found.

## Suite results — command by command

| Suite | Result | Command |
| --- | --- | --- |
| write-mode classification | 34 / 0 | `cd apps/tools-api && bun test src/middleware/write-mode-classification.test.ts` |
| write-mode gate | 12 / 0 | `cd apps/tools-api && bun test src/middleware/write-mode.test.ts` |
| write-mode population | 8 / 0 | `cd apps/tools-api && bun test src/middleware/write-mode-population.test.ts` |
| handoff routes | 43 / 0 | `cd apps/tools-api && bun test src/routes/handoff.test.ts` |
| proposal routes | 55 / 0 | `cd apps/tools-api && bun test src/routes/proposals.test.ts` |
| memory routes | 12 / 0 | `cd apps/tools-api && bun test src/routes/memory.test.ts` |
| handoff service | 40 / 0 | `bun test packages/core/src/__tests__/handoff-service.test.ts` |
| store parity | 20 / 0 | see the env note below — **mandatory** |
| MCP embedded parity | 14 / 0 | `cd apps/mcp-client && bun test src/__tests__/embedded-mode-parity.test.ts` |
| web-ui (whole dir) | 778 / 0 | `cd apps/web-ui && bun test` |
| plugins | 135 / 0 | `bun run test:plugins` — a separate runner `bun run test` never reaches |
| root script suites | **1810 / 0** | `bun run test:scripts` — see the config note below |
| lint | clean | `bun run lint` |
| type-check | 6 / 6 | `bun run type-check` |

### The store-parity env trap — name it, do not rediscover it

`packages/core/src/__tests__/handoff-proposal-pg.test.ts:75` is
`describe.skipIf(!DEDICATED_DB)`. Without the exact env below the file reports a
pass having executed **none** of its 20 substantive cases (measured: `0 pass /
22 skip`):

```bash
MASSA_AI_DEDICATED=1 \
DATABASE_URL="postgresql://massa_ai:massa_ai_password@127.0.0.1:5433/massa_ai_test" \
  bun test packages/core/src/__tests__/handoff-proposal-pg.test.ts
```

The predicate requires literal `127.0.0.1` (not `localhost`), port **5433**, and
database **`massa_ai_test`**. Phase 2 was dispatched with this incantation
specifically because the gate would otherwise have been green and empty.

### `test:scripts` needs a scratch config dir to be meaningful locally

Measured on this machine, same tree, same commit:

```
bun run test:scripts                          -> EXIT=1, 1806 pass / 4 fail
XDG_CONFIG_HOME=$(mktemp -d) bun run test:scripts -> EXIT=0, 1810 pass / 0 fail
```

`generate:artifacts` (run by `pretest:scripts`) reads the developer's **local
profile overlay** from `~/.config/massa-ai`, while the drift gate's `--check` is
builtin-only — so a local overlay manufactures drift against bundles it just
regenerated. CI has no such config and never sees it. An earlier run of the same
gate reported **10** failures from a related cause: `apps/cursor-plugin/skills/`
had lost its real skill directories and retained a `__stale-workflow-fixture/`
directory planted by a test that failed and did not clean up. Those bundles are
gitignored generated output (AD-016), so `git status` was clean throughout and
none of it was ever repo state.

**A background-run wrapper reports its own exit code, not the gate's.** The first
`test:scripts` run was reported by the task harness as "exit code 0" while the
log recorded `EXIT=1`. Capture the gate's exit explicitly.

## AC-04.4 — the pre-fix RED, recorded

The spec requires this as a persisted artifact rather than a claim. Reproduced
independently by the verifying agent, which reverted `views/memory.ts` to its
pre-fix shape, ran the sensor, and restored the file by hand:

```
[route-contract] routes/** files=28 routes=91 | web-ui/static/** files=22 calls=39 in-scope(/api/v1/*)=38
[route-contract] DEAD Web UI calls — no matching registered route:
  PUT /api/v1/memory/:param  (views/memory.ts:361, via request)
  DELETE /api/v1/memory/:param  (views/memory.ts:378, via request)
```

Population stated beside the verdict — 91 registered routes against 38 in-scope
Web UI calls — and **only those two were dead**. A negative result with a real
denominator.

The sensor's own first draft under-scanned: a query-string branch never set
`sawLiteral`, silently dropping `GET /api/v1/config/reveal?section=…` and
reporting 37 calls instead of 38. It was fixed before the RED above was
recorded. An instrument that quietly under-scans is indistinguishable from one
that finds nothing.

**Three separate tests were asserting the dead URLs and passing** — two in
`view-handlers.test.ts`, one in `app-renderers.test.ts` that surfaces only in a
full-directory run — because a mocked request capture accepts any URL string.
That is the defect class in one sentence: the tests pinned the bug in place.

## Mutations independently reproduced by the verifier

Each was applied by hand, observed red, and restored with checksum verification.
No `git checkout` / `restore` / `stash` was used at any point.

| Mutation | Result |
| --- | --- |
| Delete `.use(writeModeMiddleware)` from `index.ts` | 10 pass / 2 fail — exactly the wiring-check block; all 10 harness-level tests stayed green, proving the wiring sensor catches what the logic tests structurally cannot see |
| Flip default-deny to default-allow in `write-mode.ts` | 10 pass / 2 fail — the cross-plugin default-deny test and the AC-03.8 fail-closed test |
| Revert `views/memory.ts` to the dead URL | route-contract sensor red, naming both URLs |
| Remove the `confirm()` gate on `handoff-delete` | 158 pass / 2 fail — the declined-confirm test and the confirm-message assertion |

That last one matters: this fake-DOM harness has a measured vacuous-pass mode
where a generic child's empty dataset makes a guard-first handler exit before
`confirm()` is reached. The shared fixture's dataset is `{filter:"type",
id:"fake-id"}` — non-empty — and the mutation proves the sensor genuinely
exercises the gate.

## Coverage

| Requirement | Sensor | Status |
| --- | --- | --- |
| HPC-01 (AC-01.1 … .7) | `handoff.test.ts` (incl. a 6-field parametrized allowlist loop at `:262`), `handoff-service.test.ts` | verified |
| HPC-01 (AC-01.8) | `handoff-service.test.ts:595-611` — asserts the memory's **content**, plus a full `formatMemoryContent` equality proving a complete recompute; sibling at `:621` proves a `targetAgent`-only PATCH does not touch the memory | verified |
| HPC-02 | `proposals.test.ts` 55/0; one shared `PROPOSAL_PAYLOAD_RULES` table at `proposal-payload-validation.ts:50`, no second copy | verified |
| HPC-03 | `write-mode*.test.ts`; 2/2 required mutations independently reproduced | verified |
| HPC-03 (AC-03.3b) | all ten entries have behavioural no-write tests, including `test.each` over every schema-exposed body flag; `/checkpoints/list` diffs a real temp-directory snapshot rather than spying | verified |
| HPC-04 | `route-contract.test.ts` source-level diff, pre-fix RED recorded above | verified |
| HPC-05 | five tool defs + embedded regex blocks; parity test now genuinely asserts `patch`/`delete` on both clients (it previously claimed to in a comment and asserted only `get`/`post`) | verified |

## Open, recorded, not built

- **AC-03.3c** — `POST /api/v1/analytics/` and `POST /api/v1/file/read` are
  deliberately unclassified and therefore refused under read-only mode.
  `get_analytics.ts:70-111` calls only getters; `read_file.ts:106` delegates to
  `ReadFileService.read`, whose documented cache path has **not** been traced to
  a verdict. Over-blocking a read fails safe; allowlisting a write does not.
  **This gates read-only mode being usable**: enabling it today costs the portal
  its analytics and file-view panels.
- **HPC-06** — `authMiddleware`'s docblock claims "every destructive op already
  takes `ActorContext` from the request." Measured: **1 of 28** route files calls
  `recordOperation`. Either the reach or the docblock should change. The five new
  destructive routes do not audit; the classification was designed so audit can
  consume it later.
- **HPC-07** — the four existing config gates (`handoffsDisabled`,
  `autoImproveDisabled`, `bootstrap.ts:21`, `hooks.ts:35`) all fail **open** on a
  config-read error. AC-03.8 inverted this for the new gate only; changing four
  live gates was not this feature's to smuggle in.
- **Plugin-suite flake** — `bun run test:plugins` was observed once at 134/1 and
  passed 135/0 on immediate re-run, with the only `apps/opencode-plugin/` change
  on this branch being a two-line comment. Recorded so a future reader does not
  mistake a real recurrence for a known-ignorable one.

## Merge sequencing

PR #107 must land first. `[Unreleased]` on this branch still carries #107's
entries; after it merges, take `main` into this branch by **merge, never rebase**
(long spec branches rebase badly here) and re-check `[Unreleased]` before
relying on the changelog entry below.
