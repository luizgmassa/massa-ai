# Cross-Pollination Ports & Gap Closure Specification

- **Slug:** `cross-pollination-ports`
- **workflowSessionId:** `spec-cross-pollination-ports`
- **Workflow:** spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute + independent validation)
- **Source:** `.specs/reports/cross-pollination-portability-and-gaps.md` (2026-07-29, written at `45daaa1`)
- **Spec baseline:** every report claim **re-verified at `94e6b05`** (v1.18.0, `main`) on 2026-08-03 via scripted sweep (`/tmp/xpoll-verify.sh`, plain `/usr/bin/grep`, no rtk). The report is input, not authority; this spec's re-measured statuses win where they differ.

## Problem Statement

A cross-repo portability audit produced 7 ranked port recommendations and 11 newly-found defects. Five days and several releases later, part of the inventory is already fixed and the rest is live: the blocking CI gate silently skips ~50 DEDICATED_DB suites, the default Passive Capture path persists raw payloads with no sanitization boundary, no gate catches new dangerous-primitive call sites, CI's Bun cache race remains mitigated only reactively, two CLAUDE.md testing claims are materially wrong, and 27 `MASSA_AI_*` env vars are invisible under `bun run test`. This feature implements the still-live recommendations and closes the still-live defects.

## Re-verified status of report items (2026-08-03, `94e6b05`)

| Report item | Status at `94e6b05` | Disposition |
|---|---|---|
| PORT-01 (Bun cache warm) | LIVE — 0 real `actions/cache` steps (1 grep hit is the comment at `ci.yml:75`); reactive purge at `ci.yml:102,369,413` | **XP-01** |
| PORT-02 / DB-08 (sanitization) | LIVE — 0 `Sanitized<` hits in packages+apps; 0 `redact\|scrub` hits under `services/hooks/` | **XP-02** |
| PORT-03 (security allowlist) | LIVE — no script in `scripts/`; ~31 rough-regex exec/spawn hits (overcount; AST recount in Design) | **XP-03** |
| PORT-04 / DB-07 (RUN_POSTGRES_TESTS) | LIVE — `ci.yml` 0 hits; `coverage.yml:95` sets it | **XP-04** |
| PORT-05 (tripwire pattern doc) | LIVE — `CONTRIBUTING.md` Step 6 exists, no tripwire paragraph | **XP-05** |
| PORT-06 (host capability prep) | LIVE — no capability predicate in generator/installer | **XP-06** (user: full prep refactor) |
| PORT-07 (rss-delta helper) | LIVE — no `__tests__/helpers/`; RSS idiom in `cycle-detection.test.ts` + `structural-runtime.test.ts` | **XP-07** |
| DB-01 (CLAUDE.md count 16) | **FIXED** — CLAUDE.md says 17; `ls skills/agents` = 17; parity test asserts 17 ×4 (`:192,200,210,218`); `:669`'s 15 is a deliberately frozen baseline fixture (documented in-file) | no-op, recorded |
| DB-02 (FEATURES.md 16/64) | **FIXED** — `FEATURES.md:507` says 17 charters / 68 files (17×4) | no-op, recorded |
| DB-03 (FEATURES.md "12 registry") | **FIXED** — no "12 … registry" claim remains; `FEATURES.md:456`'s "the 12 specialists" is historical prose about a pre-fix release state | no-op, recorded |
| DB-04 (24 migrations) | **FIXED** — CLAUDE.md says 23; measured 23 dirs | no-op, recorded |
| DB-05 (runner "divergent copies 236/124/141") | LIVE — `CLAUDE.md:104`; measured 121/30/46 + shared `scripts/lib/run-tests-isolated.ts` 373 | **XP-08** |
| DB-06 ("551 TS tests + 3 shell suites") | LIVE — `CLAUDE.md:125`; measured 21 `scripts/tests/*.sh`; STATE records `test:scripts` 1114 pass / 49 files at T8b | **XP-09** |
| DB-09 (passThroughEnv gaps) | LIVE and WIDER — 27 `MASSA_AI_*` vars read in `packages/`+`apps/` are missing from `turbo.json` `passThroughEnv` (24 present, 35 read) | **XP-10** |
| DB-10 (`"in-progress"` spelling) | LIVE — `FEATURES.json:573` | **XP-11** |
| DB-11 (audit methodology note) | N/A — process note, already recorded in the report itself | out of scope |
| L-DRAFT-A..E | Pending — lessons.py store exists (8 lessons), none of these five recorded | **XP-12** |

## Goals

- [ ] Every live port (XP-01..XP-07) implemented with a deterministic, observed-red gate where the port *is* a gate.
- [ ] Every live defect (XP-08..XP-11) closed with re-measured figures, not the report's.
- [ ] Five lessons recorded through the `lessons.py` pipeline (XP-12), never by hand-editing.
- [ ] One branch, one PR, atomic per-task commits, CHANGELOG entry present (XP-13).

## Out of Scope

| Item | Reason |
|---|---|
| R-01 daemon, R-02 schema-CLI, R-03 AV hardening, R-04 prerelease channel, R-05 Kimi/Grok literal workarounds | Report classifies REJECT/DEFER; user did not overrule |
| N-01..N-12 stack-specific items | Not portable to Bun/TS per report |
| DA-01..DA-17 already-documented defects | Tracked elsewhere; not this feature's inventory (DA-15 overlaps XP-10 only where the same env var is involved — XP-10 fixes passthrough, not the isolation-rule gap) |
| Building an actual 5th-host adapter | XP-06 is prep only: predicate extraction + docs; no new host ships |
| General PII/entropy-based secret detection in XP-02 | v1 is narrow credential shapes only (report's own guidance; over-redaction is the adjacent regression class) |
| Caching compiled native `.node` addons in XP-01 | Stale-ABI failure mode worse than cold cache; report concurs |
| DB-01/02/03/04 edits | Verified already fixed at `94e6b05` |
| Fixing DA-14 `includePersistent` ambiguity | Report flags for a 5-minute look, not a change; separate concern |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Scope = live ports + live defects + lessons | As tabled above | "implement the changes available at the report"; rejected/deferred stay rejected | y (user, via scope Qs) |
| XP-04 shape | Enforce in `ci.yml` + venue-parity script | User selected "Enforce + parity script" | y |
| XP-06 shape | Full prep refactor + docs | User selected "Full prep refactor" | y |
| Delivery | One branch `feature/cross-pollination-ports`, one PR, per-task commits | User selected; matches PR-D precedent | y |
| XP-02 redaction v1 rule set | Narrow, recognizable credential shapes (PEM blocks, JWTs, AWS `AKIA…` ids, `sk-…` keys, GitHub `gh[pousr]_…`, `Bearer <long token>`); exact set fixed in Design with both-direction tests | Report: scope narrowly; over-redaction mangles legitimate code | y (report guidance; user accepted via scope) |
| XP-02 boundary placement | Scrub inside core ingestion (`HookService`) before enqueue/persist; branded type enforced at `ObservationStore.insert` | Wire shape of `POST /api/v1/hook` unchanged; every transport inherits the boundary | assumption |
| XP-10 mechanism | `turbo.json` wildcard `"MASSA_AI_*"` if Turbo `^2.5.0` supports wildcards in `passThroughEnv` (verify in Design via docs); else explicit 27-var addition | Wildcard retires the recurrence class permanently (AD-010's "editing that list too" rule) | assumption |
| XP-01 scope | All `ci.yml` jobs that run `bun install` + `coverage.yml` (same race class); cache key `hashFiles('bun.lock')` + runner os/arch; keep purge-and-retry fallback | L-DRAFT-C: warming fixes, purge stays as fallback | assumption |
| XP-04 DB wiring | `ci.yml` test job gains dedicated `127.0.0.1:5433/massa_ai_test` service + `RUN_POSTGRES_TESTS=1`, mirroring `coverage.yml`'s tested shape; `release.yml` chain untouched (no new job, no workflow rename) | `isDedicatedDatabase()` requires that literal shape | assumption |
| New gates wire into existing surfaces | `check-security-allowlist` + `check-workflow-venue-parity` run in CI `build` job beside oxlint, with unit suites under `scripts/__tests__/` reached by `test:scripts` | Precedent: `check-core-layering`, `check-tools-thin` | assumption |
| XP-08/09 figures | Re-measure at HEAD during Execute (`wc -l`, `ls`, fresh `bun run test:scripts` run) — never copy the report's or STATE's numbers | Lessons: a correction re-derived from a wrong baseline; cached results are not measurements | assumption |
| Unmerged `refactor/skills-directive-dedup` branch also edits CLAUDE.md | Proceed; XP-08/09 touch the "Running tests" section, dedup branch touched roster counts — disjoint paragraphs; conflict risk named, accepted | assumption |

**Open questions:** none — all resolved or logged above.

## User Stories

### P1: The blocking gate stops being blind ⭐ MVP (XP-04)

As a contributor, I want `ci.yml`'s own `bun run test` to exercise the DEDICATED_DB-gated suites so that the gate every PR must pass cannot silently skip ~50 suites.

**Acceptance Criteria**
1. WHEN `ci.yml`'s test job runs THEN it SHALL set `RUN_POSTGRES_TESTS=1` with a `DATABASE_URL` satisfying `isDedicatedDatabase()` (literal `127.0.0.1`, port `5433`, db `massa_ai_test`), and previously-skipped suites SHALL execute (measured: the run's skip count for that class drops; exact sensor in Design).
2. WHEN any workflow's test-invocation env diverges semantically from another's THEN `scripts/check-workflow-venue-parity.ts` SHALL fail naming the divergence, unless the divergence is declared in an explicit justified exception list.
3. WHEN a synthetic divergence is injected into a scratch copy of a workflow THEN the parity check SHALL exit non-zero naming file + key (observed red, then reverted).
4. WHEN `release.yml`'s trigger chain is inspected after the change THEN it SHALL be untouched: no workflow renamed, `CI` workflow name preserved, no new required-check semantics removed.

### P1: Passive Capture stops persisting raw secrets (XP-02)

As a user whose hooks capture tool outputs, I want secret-shaped content redacted before durable persistence so that the default memory path cannot store live credentials.

**Acceptance Criteria**
1. WHEN a hook event payload contains a synthetic credential of each v1 shape (PEM block, JWT, AWS key id, `sk-` key, GitHub token, bearer token) THEN the persisted Observation row SHALL contain a redaction marker in its place and SHALL NOT contain the credential bytes.
2. WHEN a payload contains near-miss content (a short `sk-` prefixed identifier, the word "bearer" in prose, a variable named `skColor`) THEN it SHALL pass through byte-identical (both-direction test, per L-DRAFT-B / llm-env-prefix precedent).
3. WHEN code constructs `ObservationStore.insert` input without passing the sanitizer THEN the TypeScript build SHALL reject it (`Sanitized<T>` branded type; `@ts-expect-error` type-level test).
4. WHEN the batch endpoint (`/api/v1/hook/batch`) ingests events THEN the same boundary SHALL apply.
5. WHEN sanitization runs THEN the wire schema of `POST /api/v1/hook` SHALL be unchanged (same requests accepted/rejected as before).

### P1: New dangerous call sites cannot land unreviewed (XP-03)

As a maintainer of a product that ships a code-execution sandbox, I want a count-bounded allowlist gate so that a new `exec`/`spawn`/raw-SQL/`eval` call site outside the reviewed set fails CI.

**Acceptance Criteria**
1. WHEN `scripts/check-security-allowlist.ts` runs on a clean tree THEN it SHALL exit 0 and print the measured population per primitive class beside the allowlisted expected counts (population printed, never silent — lesson: a mutation that resolves to nothing).
2. WHEN a new unreviewed dangerous call site is added on a scratch branch THEN the gate SHALL exit non-zero naming file + line + primitive (observed red, then reverted).
3. WHEN a dangerous call site is *removed* THEN the gate SHALL also fail (count mismatch in either direction) until the allowlist entry is updated — stale-allowlist drift is a defect.
4. WHEN counting THEN matching SHALL be AST-based (TypeScript compiler API), not regex over text — string literals, comments, and `RegExp.prototype.exec` SHALL NOT count (lessons: literal filter overcounts; a claim of absence can be the match).
5. The gate SHALL run in CI's `build` job and its unit tests in `test:scripts`.

### P1: CI's Bun install cache is warmed (XP-01)

As a release owner, I want `~/.bun/install/cache` round-tripped through `actions/cache` so the native-grammar install race stops being hit cold.

**Acceptance Criteria**
1. WHEN any `ci.yml` job (and `coverage.yml`) that runs `bun install` starts THEN an `actions/cache` step SHALL restore `~/.bun/install/cache` keyed on `hashFiles('bun.lock')` with os/arch discrimination and a lockfile-independent restore-key fallback.
2. WHEN the cache step is added THEN the purge-and-retry fallback SHALL remain byte-identical in behavior (removed nothing).
3. WHEN caching THEN build outputs and compiled `.node` addons SHALL NOT be cached.
4. Deterministic check: workflow YAML asserts (unit-testable by parsing the YAML in `test:scripts`) that every job invoking `bun install` in `ci.yml`/`coverage.yml` has a preceding cache step for that path.

### P2: The tripwire pattern becomes a rule (XP-05)

As a future contributor retiring a compatibility boundary, I want the two-directional tripwire-test pattern documented in `CONTRIBUTING.md` Step 6 so the next retirement inherits it by rule.

**Acceptance Criteria**
1. WHEN reading `CONTRIBUTING.md` Step 6 THEN it SHALL contain the pattern paragraph: assert both directions (new name reaches target, old name has zero effect), citing `llm-env-prefix.test.ts` as reference shape.

### P2: A 5th host slots in without reactive hardcoding (XP-06)

As the harness maintainer, I want per-host capability predicates extracted as an explicit table so a future host is added by declaring capabilities, not by patching emitters under pressure.

**Acceptance Criteria**
1. WHEN the generators run after the refactor THEN every generated artifact for the 4 existing hosts SHALL be byte-identical to pre-refactor output (`generate-subagent-artifacts.ts` + `generate-skill-artifacts.ts` `--check` both report no drift; parity suites pass unchanged).
2. WHEN a fixture 5th host is declared in tests only THEN the capability-predicate path SHALL drive real emitter behavior differences (exercised in a unit test; fixture host never ships).
3. WHEN reading `docs/adding-a-host.md` THEN it SHALL name the capability contract a new host must declare (incl. SessionStart-stdout-discarding and passive-UserPromptSubmit quirk classes from the ai-memory evidence).
4. The change SHALL satisfy CONTRIBUTING's 7-step protocol (contract, register, argv N/A-recorded, read-only export of the capability table, deliver-before-ack N/A-recorded, invariants, discriminating tests).

### P2: RSS-delta idiom is shared (XP-07)

As a test author, I want `measureRssDelta` in one helper so the third native-heavy subsystem doesn't reinvent it.

**Acceptance Criteria**
1. WHEN both existing RSS call sites (`cycle-detection.test.ts`, `structural-runtime.test.ts`) are refactored onto the helper THEN their asserted thresholds and semantics SHALL be unchanged (same bounds, same pass/fail behavior).
2. The helper SHALL live under `packages/core/src/__tests__/helpers/` and be test-only (not exported from the package).

### P2: CLAUDE.md testing claims match reality (XP-08, XP-09)

As a session-bootstrapping agent, I want CLAUDE.md's testing section to describe the current tree.

**Acceptance Criteria**
1. WHEN reading the runner paragraph THEN it SHALL describe the thin-wrapper-over-shared-module architecture with line counts measured at HEAD (currently 121/30/46 over `scripts/lib/run-tests-isolated.ts` 373 — re-measure before writing) (XP-08).
2. WHEN reading the `test:scripts` line THEN its TS-test and shell-suite counts SHALL come from a fresh `bun run test:scripts` run and `ls scripts/tests/*.sh | wc -l` at HEAD (XP-09).

### P2: Env knobs survive turbo (XP-10)

As a test author, I want every `MASSA_AI_*` var visible under `bun run test` so a knob set in the environment cannot silently arrive `undefined`.

**Acceptance Criteria**
1. WHEN `turbo.json` is updated (wildcard if supported, else explicit) THEN every `MASSA_AI_*` var read anywhere in `packages/`+`apps/` SHALL be passed through to the `test` task (re-derive the read-set at HEAD; 35 known at spec time).
2. WHEN a var is added later THEN either the wildcard covers it structurally, or a `test:scripts` unit test SHALL fail listing vars read-but-not-passed (mechanical recurrence guard — one of the two must hold).
3. CLAUDE.md's AD-010 note ("Adding a new MASSA_AI_* knob means editing that list too") SHALL be updated to match the shipped mechanism.

### P2: Registry spelling normalized (XP-11)

1. WHEN reading `FEATURES.json` THEN `workflow-harness-overhaul`'s status SHALL be `in_progress` (underscore), and no other status value SHALL use a hyphen.

### P2: Lessons recorded through the pipeline (XP-12)

1. WHEN L-DRAFT-A..E are recorded THEN they SHALL enter via `lessons.py add` (candidates), `LESSONS.md` SHALL be regenerated by the tool, and `lessons.json` SHALL never be hand-edited.

### Process (XP-13)

1. CHANGELOG entry under `[Unreleased]` (`### Added` for gates/sanitizer/cache + `### Fixed` for doc/config corrections; minor wins). No skip-ci marker anywhere in commits/PR body. `no-changelog` label MUST NOT be applied.

## Edge Cases

- WHEN a payload's credential-shaped string spans a JSON-escaped boundary (e.g. `\n` inside PEM) THEN the sanitizer SHALL still match the serialized form it actually scrubs (Design fixes the scrub representation; test covers escaped-newline PEM).
- WHEN a payload is exactly at `HOOKS_MAX_PAYLOAD_BYTES` THEN sanitization SHALL not push handling into a different code path (size check order defined in Design).
- WHEN redaction replaces content THEN payload size MAY shrink but never grow past the cap (marker shorter than or comparable to matches; asserted).
- WHEN the security-allowlist gate parses a file with syntax errors THEN it SHALL fail loudly naming the file, never skip it silently (silence is a failure mode).
- WHEN the venue-parity script sees a workflow with no test invocation THEN it SHALL classify it explicitly (exempt list with reason), not silently produce an empty comparison (a mutation that resolves to nothing reads as a gate that catches nothing).
- WHEN `actions/cache` misses (first run / lockfile change) THEN install SHALL proceed exactly as today (cache is additive; purge-retry intact).
- WHEN the dedicated-DB service is up but migrations have not run against it THEN the test job SHALL run `prisma migrate deploy` against the dedicated URL before tests (mirror coverage.yml's sequence).
- WHEN the fixture 5th host declares a capability combination no real host has THEN emitters SHALL follow the predicate table, proving the table is load-bearing (not a naming exercise).

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| XP-01 | P1 Bun cache | Design | Pending |
| XP-02 | P1 Sanitization | Design | Pending |
| XP-03 | P1 Allowlist gate | Design | Pending |
| XP-04 | P1 PG gate + parity | Design | Pending |
| XP-05 | P2 Tripwire doc | Tasks | Pending |
| XP-06 | P2 Host prep | Design | Pending |
| XP-07 | P2 RSS helper | Tasks | Pending |
| XP-08 | P2 CLAUDE.md runner | Tasks | Pending |
| XP-09 | P2 CLAUDE.md counts | Tasks | Pending |
| XP-10 | P2 passThroughEnv | Design | Pending |
| XP-11 | P2 registry spelling | Tasks | Pending |
| XP-12 | P2 lessons | Tasks | Pending |
| XP-13 | Process | Execute | Pending |

**Coverage:** 13 total, 13 mapped to phases, 0 unmapped.

## Implicit-Requirement Dimensions (Large — every dimension resolved)

| Dimension | Resolution |
|---|---|
| Input validation & bounds | XP-02 AC-1/2 + edge cases (payload cap, near-miss pass-through); XP-03 AC-4 (AST not regex) |
| Failure / partial-failure | XP-01 AC-2 (purge fallback retained); gates fail loud on parse errors (edge case); XP-04 AC-2 exception list explicit |
| Idempotency / retry / duplicates | XP-01 cache restore idempotent; sanitizer pure function (same input → same output; asserted); N/A for doc edits |
| Auth boundaries & rate limits | N/A — no auth surface changes; hook route auth (AD-011) untouched, asserted by existing route tests staying green |
| Concurrency / ordering | XP-04: dedicated DB service isolated per job run; sanitizer runs before `WriterQueue` enqueue (ordering fixed in Design); N/A elsewhere |
| Data lifecycle / expiry | XP-02 changes content at write time only; no retention change. Pre-existing rows stay unsanitized — recorded as accepted limitation in Design (retrofit cost is L-DRAFT-E's own lesson) |
| Observability | Gates print population + verdict; sanitizer emits a counter/log line (debug level, stderr per stdout-protocol rule) when redaction fires — exact surface in Design |
| External-dependency failure | XP-01: cache service down ⇒ actions/cache no-ops, install unaffected; MCP memory server down this session ⇒ `.specs/` canonical (recorded) |
| State-transition integrity | FEATURES.json status enum normalized (XP-11); feature registry transitions via approved writes only |

## Verification Approach

- Per-task gates from `tasks.md` (Test Coverage Matrix + Gate Check Commands); every **new** gate/sensor must show an observed red on an injected violation before its task closes (a new sensor needs an observed red).
- Full battery per behavior-changing commit: `bun run lint`, `bun run type-check`, `bun run build`, `bun run test`, `bun run test:scripts`, `bun run test:plugins`, both generators `--check` (XP-06 tasks), `bun scripts/run-deterministic.ts`.
- CI-shape changes (XP-01/XP-04) verified by YAML-parsing unit tests locally + real CI run on the PR.
- Final: independent `massa-ai-verification-agent` (author ≠ verifier) writes `validation.md`; fix→re-verify loop capped at 3.

## Discuss Summary

Three user decisions taken interactively before spec write: XP-04 = enforce + parity script; XP-06 = full prep refactor (agent recommended defer; user overruled); delivery = one branch/PR. MCP memory unavailable all session — durable-memory sync skipped, `.specs/` files canonical.

## Artifact-Store Evidence

- Active artifact: `.specs/features/cross-pollination-ports/spec.md` v1 (checksum recorded in STATE at registration).
