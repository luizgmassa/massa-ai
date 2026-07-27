# Audit Remediation 2026-07 Specification

- **Slug**: `audit-remediation-2026-07`
- **projectId**: `massa-ai`
- **workflowSessionId**: `spec-audit-remediation-2026-07`
- **Workflow**: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute)
- **Sizing**: Large. 17 requirements, 2 delivery phases, security + public-contract + breaking-change surface.

## Problem Statement

A knowledge-graph analysis of the repository (1847 nodes / 4226 edges at commit `17ee708`)
followed by two verification passes surfaced a set of defects that are individually small but
collectively load-bearing. The most severe is that the Tools API ships **unauthenticated by
default and exposes three arbitrary-code-execution endpoints**; a permissive CORS default turns
that into a drive-by browser attack against any developer running `bun run dev:api`. Alongside
it sit six confirmed correctness bugs — including an embedding path that silently writes
`Math.random()` vectors into the index when no provider is reachable — and a set of tech-debt
items where the repository's own documented gates do not do what they claim (`bun run lint` is
a no-op; coverage is collected and never enforced; two env-var prefixes are live at once).

Every finding below was confirmed by reading current source. Nothing here is inferred from the
knowledge graph alone.

## Goals

- [ ] No path through the Tools API serves an unauthenticated request to a non-public route.
- [ ] No code path silently substitutes fabricated data for a failed dependency.
- [ ] Every declared quality gate either runs something real or is removed.
- [ ] One env-var prefix, one test-runner implementation, one documented truth.

## Out of Scope

| Item | Reason |
| --- | --- |
| Controllers-layer restructuring (38 backward imports; `tools → services` 34× vs `tools → controllers` 6×) | Behavior-preserving structural refactor. Needs its own risk budget and validation pass. Separate spec. |
| `contextual-search-rlm.ts` god-module split (fan-in 22, fan-out 26) | Same. Also rewrites the exact files a `rlm-*` rename would touch. Separate spec. |
| `rlm-*` source/test filename rename (12 files, 40+ importers) | Deferred to the god-module refactor, which rewrites those files. Renaming twice is churn for zero behavior change. |
| Generated skills-bundle duplication (592 files / 5.2 MB across 4 plugin dirs) | Excluded by the user. Documented tradeoff (`npm pack` drops symlinks). |
| Repo hygiene (`.ua/` committed artifacts, untracked trash dir, `.gitignore`) | Excluded by the user. |
| Rate limiting on the Tools API | No rate limiting exists today. Adding it is a new capability, not a remediation. |
| Repo-wide code reformat | User direction: wanted, but as its **own separate PR**. Deferred so the formatter runs over already-corrected code instead of churning it twice, and so this feature's diff stays reviewable. DEBT-01 adopts a linter with **no** formatter. |
| `project_id` column on `memory_edges` | User decision: BUG-02 is closed by a read-side filter. Adding a 25th migration + backfill for a latent, currently-unexploitable defect is not justified. Logged as a follow-up. |
| Remediation of already-poisoned vector rows written by BUG-01 | No reliable detector for a random 384-d vector after the fact. Handled by documentation (see AS-03). |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| AS-01 API-key bootstrap | Auto-provision on first start: generate a random key, persist to `~/.config/massa-ai/config.json`, warn-log once, continue. Refuse to start only when no key exists **and** config is unwritable. | Satisfies "a key is always required" — anonymous access is never served — without breaking every existing install whose thin `.env` holds only `DATABASE_URL`. | **y** (user) |
| AS-02 Web UI under mandatory auth | `web-ui.ts` stamps the configured key into `index.html` only when the request's remote address is loopback. Non-loopback receives the shell with no key and a configure-access message. | No new login surface, no cookie, no long-lived credential in browser storage. | **y** (user) |
| AS-03 Previously-poisoned vectors | Not detected or repaired. CHANGELOG + README note tells operators who ran without a reachable embedding provider to re-index. | A 384-d random vector is indistinguishable from a legitimate 384-d embedding after the fact. | y (agent default) |
| AS-04 `RLM_LLM_*` removal | Hard rename to `MASSA_AI_LLM_*`. Old names stop working; no dual-read, no deprecation window. | User decision. Recorded here because it silently disables LLM features for existing installs until they edit config — the CHANGELOG entry must say so under `### Changed`. | **y** (user) |
| AS-05 Bind address | Unchanged (`0.0.0.0` via `app.listen(PORT)`). No `MASSA_AI_API_HOST` knob is introduced. | User decision. Docker port mapping (`3333:3333`) keeps working unmodified. Exposure is closed by auth (SEC-01), not by address. | **y** (user) |
| AS-06 Linter selection | Deferred to Design. Selection criteria fixed here: zero-config-capable, Bun-compatible, fast enough for a pre-commit gate, and able to land with a **non-blocking** rule set first. | The linter choice is a Design-phase tradeoff; the requirement is that `bun run lint` stops lying. | y (agent default) |
| AS-07 Delivery shape | Two PRs. PR1 = SEC-01..06 + BUG-01..06. PR2 = DEBT-01..05. | User decision. | **y** (user) |

**Open questions:** none — all resolved or logged above.

---

## Implicit-Requirement Sweep

Large scope: every dimension resolves to a requirement or an explicit `N/A because …`.

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | SEC-02 (CORS origin list parsing, reject `*` when credentials are on), SEC-01 (generated key length/entropy). |
| Failure / partial-failure states | BUG-01 (throw instead of fabricate), SEC-01 (fail-closed when config unwritable), BUG-03 (heartbeat teardown on the retry path). |
| Idempotency / retry / duplicate handling | BUG-03 (retry re-entry leaks a timer), BUG-06 (mirror/PG upsert keyed on the same canonical id). |
| Auth boundaries & rate limits | SEC-01, SEC-04, SEC-05. Rate limits: **N/A because** none exist today; adding them is new capability, listed out-of-scope. |
| Concurrency / ordering | BUG-03 (concurrent orphaned heartbeat loops), BUG-06 (sync mirror write races the async canonical resolve). |
| Data lifecycle / expiry | **N/A because** no requirement changes retention, TTL, or deletion semantics. |
| Observability | SEC-03 (sandbox mode surfaced in startup log **and** every executor response), SEC-01 (one-time key-provisioned warn line), DEBT-01 (lint gate output). |
| External-dependency failure | BUG-01 (embedding provider unreachable → error, never fabricated data). |
| State-transition integrity | BUG-03 (managed-run lease states: heartbeat must not outlive its frame). |
| Data migration / compatibility | AS-04 (`RLM_LLM_*` hard rename), AS-01 (key auto-provision), AS-03 (poisoned vectors). All breaking-change surface goes in CHANGELOG under `### Security` / `### Changed`. |
| Privacy / auditability / irreversible behavior | SEC-04 removes an inert control; `operation-log-pg.ts` audit trail is unchanged. **N/A** beyond that. |
| Empty / loading / error / offline states | SEC-05 (non-loopback `/ui` renders a configure-access state), BUG-01 (offline embedding provider surfaces an error to the caller). |
| Performance | DEBT-02 (global `coverage = true` is paid on every test run). Otherwise **N/A because** no requirement changes a hot path. |
| Accessibility / localization / platform | **N/A because** the only UI change is a one-line configure-access message; no new localized surface. |
| Testing & validation expectations | Every requirement below carries a deterministic AC. Discriminating tests are mandatory per `CONTRIBUTING.md` Step 7. |

---

## User Stories

### P1: The API is not open to the network ⭐ MVP

**User Story**: As an operator running massa-ai on a laptop or a shared box, I want the Tools
API to never serve an unauthenticated request, so that reachable ports do not equal arbitrary
code execution.

**Why P1**: `apps/tools-api/src/middleware/auth.ts:51` returns early when `MASSA_AI_API_KEY` is
unset; that variable is absent from `.env.example` and from the `.env` that
`scripts/setup-local-first.sh:394` generates. `apps/tools-api/src/routes/executor.ts` exposes
three unauthenticated `POST` routes that run arbitrary code as the process user.
`apps/tools-api/src/index.ts:148` binds `0.0.0.0`; `:73` enables `cors()` with reflected origin
and `credentials: true`.

**Acceptance Criteria**:

1. WHEN the API starts and no API key is configured in env or `config.json` THEN the system
   SHALL generate a cryptographically random key, persist it to `~/.config/massa-ai/config.json`,
   and emit exactly one warn-level log line naming the config path (never the key value).
2. WHEN the API starts, no API key is configured, and `config.json` cannot be written THEN the
   system SHALL exit non-zero before binding the port.
3. WHEN a request without a valid `x-api-key` targets any path outside `PUBLIC_PATHS` THEN the
   system SHALL respond `401` — including every `/api/v1/executor/*` route.
4. WHEN a request carries an `Origin` header that is not in the configured allowlist THEN the
   response SHALL NOT contain an `Access-Control-Allow-Origin` header for that origin.
5. WHEN the CORS allowlist is unset THEN the system SHALL permit no cross-origin request with
   credentials, and SHALL NOT reflect the request `Origin`.

**Independent Test**: Boot the API with no key configured; observe the generated key in
`config.json` and one warn line. `curl -X POST localhost:3333/api/v1/executor/execute` without a
key returns `401`. `curl -H 'Origin: https://evil.test'` returns no matching
`Access-Control-Allow-Origin`.

---

### P1: A failed dependency is never replaced by fabricated data ⭐ MVP

**User Story**: As a user searching an indexed project, I want a failure to surface as an error,
so that I never receive results ranked against random numbers.

**Why P1**: `packages/core/src/services/embeddings/embedding-service.ts:76-83` and `:107-114`
return `Math.random()` 384-dimension vectors when no provider initialized, guarded only by
`process.env.NODE_ENV === 'production'` — which is set in `Dockerfile` and `docker-compose.yml`
but **not** on the local-first path. Two production callers actually reach it:
`memory-service.ts:59-61` (reached from `memory-controller.ts:145/223/289`, whose tool handlers
convert a throw into a failed `ToolResponse`) and `query-understanding.ts:346` (HyDE, already
double-wrapped in try/catch and off by default). The third apparent caller,
`relation-extractor.ts:105`, only *constructs* an `EmbeddingService` and never calls `embed()` —
it reads the precomputed `memory.embedding` blob instead. That field is dead and is removed as
part of this requirement. Default `OLLAMA_EMBEDDING_DIMENSIONS` is 4096, so the fabricated
vector is also the wrong width.

**Acceptance Criteria**:

1. WHEN `embed()` or `embedBatch()` is called and no provider is available THEN the system SHALL
   throw, in every environment, regardless of `NODE_ENV`.
2. WHEN the thrown error reaches a search or memory caller THEN the caller SHALL surface a
   degradation signal rather than returning results computed from fabricated vectors.
3. WHEN the repository is searched for `Math.random()` under `services/embeddings/` THEN there
   SHALL be no match.

**Independent Test**: Unset every embedding provider variable, call `search`, and observe an
error or explicit degradation — not a populated result set.

---

### P1: Project isolation does not depend on writer discipline ⭐ MVP

**User Story**: As a user with several projects in one PostgreSQL instance, I want the graph
augmentation path to filter by project, so that isolation is enforced where results are read.

**Why P1**: `memory_edges` (`prisma/schema.prisma:335`) has no `project_id` column.
`graph-store-pg.ts:167` (`findEdges`) builds its `where` from source/target/type/weight only, so
`bfsNeighbors` walks edges globally. `rlm-synapse.ts:213-230` then pushes `row.content` into the
RRF stream checking only `deleted_at`. Verified edge writers are project-scoped today, so this is
**latent, not currently exploitable** — but isolation currently rests entirely on every future
writer staying disciplined.

**Acceptance Criteria**:

1. WHEN the graph-neighbor stream resolves a memory row whose `project_id` differs from the
   search's `projectId` THEN the system SHALL exclude that row from the result set.
2. WHEN a test seeds a cross-project edge and searches project A THEN no project-B content SHALL
   appear in the results.

**Independent Test**: Integration test that inserts two projects, links a memory in each with a
`memory_edges` row, searches A, and asserts B's content is absent.

---

### P2: Confirmed correctness defects are fixed

**User Story**: As a maintainer, I want the four remaining verified bugs fixed with
discriminating tests, so that they cannot regress silently.

**Acceptance Criteria**:

1. WHEN `EtlPipeline.runInternal` returns early on `graph_generation_stale_active:*`
   (`pipeline.ts:341-352`) THEN the heartbeat loop started at `:307-327` SHALL be stopped and its
   abort controller signalled before the retry frame begins.
2. WHEN `resolveEdgeTarget` (`resolve.ts:403-425`) binds a namespace-imported callee THEN it
   SHALL try the resolved module path **before** the project-wide `symbolIndex`, matching the
   order its own docstring at `:393-402` states.
3. WHEN `_indexProjectInternalImpl` (`rlm-indexing.ts:179`) fetches centrality THEN it SHALL use
   the canonical project id resolved by the same alias resolver `indexFileImpl` uses at `:477`.
4. WHEN `PgObservationStore.insert` (`observation-repository-pg.ts:165-192`) writes the
   synchronous mirror THEN a read keyed on the canonical project id in the same tick SHALL find
   the observation.

**Independent Test**: One discriminating test per criterion; each observed failing against the
current implementation before the fix lands.

---

### P2: The executor never runs unsandboxed without saying so

**User Story**: As an operator, I want to know when code ran with no OS isolation, so that a
missing Docker install is not a silent downgrade.

**Why P2**: `packages/core/src/services/executor/sandbox.ts:94-97` — in default `auto` mode,
`getSandboxMode()` returns `"none"` when `sandbox-exec` (macOS) or `docker` (Linux) is absent,
and `wrapSpawn` (`:157-163`) then returns the command unchanged. Nothing tells the caller.
`MASSA_AI_EXECUTOR_SANDBOX` is absent from `.env.example` entirely.

**Acceptance Criteria**:

1. WHEN `getSandboxMode()` resolves to `"none"` in `auto` mode THEN the system SHALL emit exactly
   one warn-level log line per process naming the missing tool.
2. WHEN an executor route or tool returns a result THEN the payload SHALL include the effective
   `sandboxMode`.
3. WHEN `.env.example` is read THEN it SHALL document `MASSA_AI_EXECUTOR_SANDBOX` with its
   accepted values and its default.

---

### P2: Inert security controls are removed, not left as decoration

**User Story**: As a reviewer, I want the auth surface to contain no control that cannot fire, so
that defense-in-depth claims are true.

**Why P2**: `apps/tools-api/src/middleware/admin-preservation.ts:26-31` — `getUserCount()` is
hardcoded `return 0`, so the documented "1+ users → admin endpoints require auth" rung can never
engage. With SEC-01 in place, the API-key middleware already gates every admin endpoint.

**Acceptance Criteria**:

1. WHEN the admin-preservation module is inspected THEN it SHALL either enforce a real check or
   be removed together with its wiring and tests — no stub returning a constant SHALL remain.
2. WHEN admin endpoints are called without a valid key THEN they SHALL return `401` via SEC-01's
   middleware, with a test proving it for each entry in `ADMIN_ENDPOINTS`.

---

### P2: Documented install paths still work after the auth change

**User Story**: As a new user following the README, I want the documented install to produce a
working, authenticated setup, so that the security fix does not turn into an onboarding failure.

**Acceptance Criteria**:

1. WHEN `scripts/setup-local-first.sh` completes THEN a key SHALL exist in `config.json` and the
   script SHALL print where to find it.
2. WHEN `docker compose up` runs with no `MASSA_AI_API_KEY` in the environment THEN the API
   container SHALL start, auto-provision a key into its mounted data volume, and pass its
   healthcheck (`/health` is public).
3. WHEN the MCP client calls the Tools API THEN it SHALL send the configured key — `api-client.ts:36,100`
   already reads `MASSA_AI_API_KEY` and sets `X-API-Key`; the requirement is that its key source
   resolves the same value the API auto-provisioned.
4. WHEN `/ui` is requested from a trusted local caller THEN the served `index.html` SHALL carry
   the key and the dashboard SHALL function; WHEN requested from an untrusted caller THEN it SHALL
   render a configure-access state and issue no authenticated call. *(Revised after the Plan
   Challenge: "trusted local" is defined by TASK-000's verified mechanism — the caller's remote
   address if `@elysiajs/node` exposes it, otherwise the explicit `MASSA_AI_WEB_UI_TRUST_LOCAL`
   flag. The spec does not assert a mechanism the stack cannot perform.)*
5. WHEN `/ui` or `/ui/<asset>` is requested with no API key THEN the static shell SHALL be served,
   because `authMiddleware` runs before `webUiRoutes` and would otherwise 401 the page that
   carries the key. WHEN `/uixyz` is requested with no key THEN it SHALL still return 401 — the
   exemption is the two exact prefixes `/ui` and `/ui/`, not a loose `startsWith` match.
6. WHEN the shipped lifecycle hook binary posts an event on a fresh auto-provisioned install THEN
   it SHALL attach a valid `x-api-key`. The hook reads `process.env.MASSA_AI_API_KEY` only
   (`massa-ai-hook.ts:152`), never imports `@massa-ai/shared`, and silently degrades — so without
   this, passive observation capture stops with no visible symptom.

---

### P3: Declared quality gates do something (PR2)

**User Story**: As a contributor, I want `bun run lint` and the coverage setting to mean
something, so that a green gate is evidence.

**Why P3**: `turbo.json` declares a `lint` task no package implements — `bun run lint` reports
success across 2101 tracked files it never reads. No eslint/biome/prettier/oxlint dependency
exists anywhere. `bunfig.toml` sets `coverage = true` with no threshold: coverage is computed on
every run and enforced by nothing.

**Acceptance Criteria**:

1. WHEN `bun run lint` is executed THEN it SHALL run a real linter over the workspace and exit
   non-zero on a seeded violation.
2. WHEN the linter is introduced THEN its initial rule set SHALL pass on the current tree without
   a mass reformat commit, and CI SHALL run it.
3. WHEN the default test command runs THEN it SHALL NOT compute coverage; coverage SHALL be
   available under an explicit script that enforces a documented threshold.

---

### P3: One prefix, one runner, one truth (PR2)

**User Story**: As a maintainer, I want a single env-var prefix and a single test-runner
implementation, so that the documented contract matches the code.

**Acceptance Criteria**:

1. WHEN the repository is searched for `RLM_` THEN there SHALL be no match outside `CHANGELOG.md`
   and archived `.specs/` history.
2. WHEN `MASSA_AI_LLM_ENABLED=true` is set THEN every LLM call site SHALL activate, and
   `turbo.json` → `tasks.test.passThroughEnv` SHALL list the new names.
3. WHEN `run-tests-isolated.ts` is inspected THEN there SHALL be one implementation shared by
   `packages/core`, `apps/tools-api`, and `apps/mcp-client` — today three divergent copies of
   236 / 124 / 141 lines.
4. WHEN `bunfig.toml` is read THEN its header SHALL name this project, not `MCP RLM Mem0`, and
   `packages/core/create-3072d-table.ts` and `create-progress-memory.ts` SHALL live under a
   scripts directory or be deleted.

---

## Edge Cases

- WHEN two processes start concurrently with no key configured THEN exactly one key SHALL end up
  persisted and both processes SHALL use it (write must be atomic or re-read after conflict).
- WHEN `MASSA_AI_API_KEY` is set in env **and** a different key exists in `config.json` THEN env
  SHALL win, per the documented `env > config.json > defaults` precedence.
- WHEN the CORS allowlist contains `*` and credentials are enabled THEN startup SHALL reject the
  configuration rather than serving a spec-violating combination.
- WHEN an embedding provider is reachable at boot but fails mid-index THEN the existing per-call
  error path SHALL apply — BUG-01 changes only the *no provider at all* branch.
- WHEN the graph-neighbor filter (BUG-02) removes every candidate THEN the search SHALL return
  its other RRF streams normally, not an empty result.
- WHEN a stale-active retry (BUG-03) exhausts all 3 attempts THEN no heartbeat loop from any
  attempt SHALL remain running.
- WHEN `/ui` is reached through a reverse proxy that terminates on loopback THEN the loopback
  check SHALL be evaluated against the socket's remote address, and the resulting behavior SHALL
  be documented as a known limitation.

---

## Requirement Traceability

| ID | Story | PR | Phase | Status |
| --- | --- | --- | --- | --- |
| SEC-01 | P1: API not open | 1 | Design | Pending |
| SEC-02 | P1: API not open (CORS) | 1 | Design | Pending |
| SEC-03 | P2: executor sandbox visibility | 1 | Design | Pending |
| SEC-04 | P2: inert controls removed | 1 | Design | Pending |
| SEC-05 | P2: install paths still work (`/ui`) | 1 | Design | Pending |
| SEC-06 | P2: install paths still work (setup/docker/mcp) | 1 | Design | Pending |
| BUG-01 | P1: no fabricated data | 1 | Design | Pending |
| BUG-02 | P1: project isolation | 1 | Design | Pending |
| BUG-03 | P2: heartbeat leak | 1 | Tasks | Pending |
| BUG-04 | P2: namespace resolution order | 1 | Tasks | Pending |
| BUG-05 | P2: centrality canonical id | 1 | Tasks | Pending |
| BUG-06 | P2: observation read-after-write | 1 | Tasks | Pending |
| DEBT-01 | P3: real lint gate | 2 | Design | Pending |
| DEBT-02 | P3: coverage gate | 2 | Tasks | Pending |
| DEBT-03 | P3: env prefix rename | 2 | Design | Pending |
| DEBT-04 | P3: single test runner | 2 | Tasks | Pending |
| DEBT-05 | P3: naming residuals | 2 | Tasks | Pending |

**Coverage:** 17 total, 17 mapped to 24 tasks, 0 unmapped.

### Plan Challenge amendments

The full red-team gate (`massa-ai-plan-critic`, mode `red_team`) returned 2 critical, 1 high, and
1 medium/high finding; all four were verified against source before acceptance, and policy
`serious_findings: revise_plan` applied. Net effect on this spec: SEC-05 gained ACs 5 and 6 above,
its AC 4 no longer asserts an unverified mechanism, and two tasks were added — `TASK-000` (spike
the remote-address mechanism before committing to it) and `TASK-023` (propagate the key to the
lifecycle hook binary). Full finding table in `design.md` → "Plan Challenge — Red Team".

---

## Verification Approach

- Every AC gets a discriminating test per `CONTRIBUTING.md` Step 7 — each observed **red** against
  the current implementation before its fix lands. A gate never seen failing is not evidence
  (precedent: `plugin-distribution-overhaul` D4).
- Gate commands are derived in `tasks.md`. Baseline: `bun run type-check`, `bun run build`,
  `bun run test`, `bun run test:scripts`, `bun run test:plugins`.
- `packages/core`, `apps/tools-api`, `apps/mcp-client` must run through their isolation runners,
  never a bare `bun test` over a directory.
- SEC-01/02/05 require assertions against a **real HTTP response**, not an in-process handler
  call — the documented Elysia content-type gotcha applies to the same surface.
- Independent verification-agent runs at the end of each PR's Execute phase (author ≠ verifier),
  writing `validation.md`.
- CHANGELOG entries are mandatory (CI merge gate). PR1 lands under `### Security` and `### Changed`
  (breaking auth + `NODE_ENV`-independent embedding throw). PR2 lands under `### Changed`
  (`RLM_LLM_*` removal).

## Success Criteria

- [ ] An unauthenticated `POST /api/v1/executor/execute` returns `401` on a default install.
- [ ] `rg 'Math.random' packages/core/src/services/embeddings/` returns nothing.
- [ ] A cross-project graph-edge integration test passes.
- [ ] `bun run lint` exits non-zero on a seeded violation.
- [ ] `rg 'RLM_' --glob '!CHANGELOG.md' --glob '!.specs/archive/**'` returns nothing.
- [ ] Full gate green: type-check 6/6, build 5/5, all package suites 0 fail, `test:scripts` and
      `test:plugins` 0 fail.

---

## Phase Decisions

- **Design: required.** Security architecture (key provisioning + persistence + precedence), a
  public-contract break (`RLM_LLM_*`), a new dependency (linter), and the `/ui` loopback-injection
  mechanism are all approach tradeoffs.
- **Tasks: required.** 17 requirements across 2 PRs with ordering constraints — SEC-01 must land
  before SEC-04/05/06 can be tested, and DEBT-03 touches `turbo.json` passThroughEnv which gates
  every other suite.
- **Discuss: ran inside Specify.** Four scope questions and two behavior questions resolved with
  the user; results recorded in the Assumptions table (AS-01, AS-02, AS-04, AS-05, AS-07).
</content>
</invoke>
