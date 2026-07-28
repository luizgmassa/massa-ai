# Audit Remediation 2026-07 — Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow
and Critical Rules.** Do not search for skill files by filesystem path. If the skill cannot be
activated, STOP and tell the user.

**Design**: `.specs/features/audit-remediation-2026-07/design.md`
**Spec**: `.specs/features/audit-remediation-2026-07/spec.md`
**Status**: Draft — awaiting approval

---

## Project Testing Guidelines Scan

Guidelines **found** — the Coverage Expectation below conforms to them rather than to a default.

| Source | Rule taken |
| --- | --- |
| `CLAUDE.md` → "Running tests" | `packages/core`, `apps/tools-api`, `apps/mcp-client` must run through `bun scripts/run-tests-isolated.ts`, never a bare `bun test` over a directory — module and process-global state cross-contaminate |
| `CLAUDE.md` → same | A bare-string Elysia handler body overrides content-type; **in-process tests do not catch it — assert on a real HTTP response** |
| `CLAUDE.md` → same | Any env var a test reads must be in `turbo.json` → `tasks.test.passThroughEnv` or it is `undefined` under `bun run test` |
| `bunfig.toml` | Global 5 s per-test timeout. Raise per-test as a third arg (`}, 60_000);`), never the global |
| `CONTRIBUTING.md` Step 7 | Tests must **discriminate** — kill mutations. A gate never observed red is not evidence |
| `.specs/.../plugin-distribution-overhaul` D4 | Precedent: the tarball gate landed first and was observed failing on the real defect before the fix existed |
| `.github/workflows/ci.yml` | CI runs type-check → build → `bun run test` → `test:scripts` → `test:plugins`, against a real pgvector service |
| Existing samples | `apps/tools-api/src/routes/*.test.ts` and `middleware/*.test.ts` are **co-located**; `packages/core` uses a flat `src/__tests__/` tree; root suites live in `scripts/__tests__/` |

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec. Guidelines found: `CLAUDE.md`,
> `CONTRIBUTING.md`, `bunfig.toml`, `.github/workflows/ci.yml`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Shared config (`packages/shared/src/config/**`) | unit | All branches; 1:1 to spec ACs; every listed edge case (partial config, unwritable dir, concurrent write, env precedence) | `packages/shared/src/config/*.test.ts` (co-located) | `cd packages/shared && bun test` |
| Tools API middleware (`apps/tools-api/src/middleware/**`) | integration (real HTTP) | Every guarded path: 401 without key, 200 with key, public-path bypass; **assertions against a booted server** | `apps/tools-api/src/middleware/*.test.ts` (co-located) | `cd apps/tools-api && bun run test` |
| Tools API routes (`apps/tools-api/src/routes/**`) | integration (real HTTP) | All routes in scope: happy + every listed edge case + error path | `apps/tools-api/src/routes/*.test.ts` (co-located) | `cd apps/tools-api && bun run test` |
| Core services (`packages/core/src/services/**`) | unit | All branches; 1:1 to spec ACs; every listed edge case | `packages/core/src/__tests__/*.test.ts` (flat) | `cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='<pattern>'` |
| Core data / PG-backed (`packages/core/src/data/**`, graph) | integration | Key query paths + the cross-project isolation case + error handling | `packages/core/src/__tests__/*.test.ts` (DB-detected → forked) | `cd packages/core && bun scripts/run-tests-isolated.ts --filter='<pattern>'` |
| MCP transport (`apps/mcp-client/src/**`) | unit | Embedded-client passthrough of any new response field | `apps/mcp-client/src/__tests__/*.test.ts` | `cd apps/mcp-client && bun run test` |
| Web UI static (`apps/web-ui/src/static/**`) | unit | Renderer + request-header behavior with and without the injected key | `apps/web-ui/src/__tests__/*.test.ts` | `cd apps/web-ui && bun test` |
| Root scripts & generators (`scripts/**`) | unit | Guard behavior + drift detection | `scripts/__tests__/*.test.ts` | `bun run test:scripts` |
| Shell installers (`scripts/*.sh`, `install.sh`) | integration (shell) | Key provisioning present; idempotent re-run | `scripts/tests/*.sh` | `bun run test:scripts` |
| Config files (`bunfig.toml`, `turbo.json`, `.env.example`, `docker-compose.yml`) | none | Build/artifact gate only | — | build gate |

## Gate Check Commands

> Generated from codebase — `bun run lint` is **excluded from Build until TASK-018 lands**; it is
> a documented no-op before then and must not be cited as a gate.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| **Quick** | After a task with unit tests in one package | `cd <pkg> && bun scripts/run-tests-isolated.ts --unit --filter='<pattern>'` (core / tools-api / mcp-client) or `cd <pkg> && bun test` (shared / web-ui) |
| **Full** | After a task with integration / PG / real-HTTP tests | `bun run test` **+** `bun run test:scripts` |
| **Build** | End of each phase, and before each PR opens | `bun run type-check && bun run build && bun run test && bun run test:scripts && bun run test:plugins` (+ `bun run lint` from TASK-018 onward) |

---

## Execution Plan

Two PRs. Phases run sequentially; tasks within a phase run in order.

### PR1 — `fix/audit-remediation-security-and-bugs`

**Phase 0: Spike** — resolve the one unverified mechanism before anything depends on it.
`T0`

**Phase 1: Config foundation** — nothing in SEC-01 is testable until the key can be stored.
`T1 → T2`

**Phase 2: API surface** — the auth change and everything gated behind it.
`T3 → T4 → T5 → T6`

**Phase 3: Install surfaces + executor visibility**
`T7 → T23 → T8`

**Phase 4: Correctness bugs** — independent of each other; ordered by blast radius.
`T9 → T10 → T11 → T12 → T13 → T14`

**Phase 5: PR1 close**
`T15`

### PR2 — `chore/audit-remediation-debt`

**Phase 6: Tech debt** — T16 first because the decision record must exist before the rename it authorises.
`T16 → T17 → T18 → T19 → T20 → T21 → T22`

---

## Phase Execution Map

```
PR1: Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
PR2: Phase 6

Phase 0:  T0
Phase 1:  T1 ──→ T2
Phase 2:  T3 ──→ T4 ──→ T5 ──→ T6
Phase 3:  T7 ──→ T23 ──→ T8
Phase 4:  T9 ──→ T10 ──→ T11 ──→ T12 ──→ T13 ──→ T14
Phase 5:  T15
Phase 6:  T16 ──→ T17 ──→ T18 ──→ T19 ──→ T20 ──→ T21 ──→ T22
```

24 tasks → packs into **4 batches** at the ~7-task budget: `[P0+P1+P2]` (7), `[P3+P4]` (9),
`[P5]` (1), `[P6]` (7). The sub-agent offer fires; it is offer-then-confirm, never automatic.

---

## Task Breakdown

### T0 / TASK-000: Spike — can this stack see the caller's remote address?

**What**: Determine empirically whether a route handler under `adapter: node()` can read the client's remote address, and record the answer in `design.md`.
**Where**: throwaway spike + a committed finding in `design.md`; no production code ships from this task.
**Depends on**: None
**Requirement**: SEC-05 (prerequisite)
**Why first (Plan Challenge finding 1b)**: `apps/tools-api/src/index.ts:72` builds with `adapter: node()`. Elysia's documented `server.requestIP()` throws `"This adapter doesn't support Bun requestIP method"` under `@elysiajs/node`. An undocumented `srvx` `NodeRequest.ip` getter may survive into `Context.request`, but nothing in this repo uses it. Committing T6 to a loopback check the stack cannot perform would burn the task and its tests.

**Done when**:
- [ ] A **booted** server (not `app.handle()`) is hit from loopback and the observed remote-address value is recorded verbatim
- [ ] The same is checked for a non-loopback interface where the environment allows; otherwise the gap is recorded rather than assumed
- [ ] `design.md`'s `web-ui.ts` component is updated with the verified mechanism **or** with the decision to use the `MASSA_AI_WEB_UI_TRUST_LOCAL` fallback
- [ ] If the fallback is chosen, spec SEC-05's ACs are amended before T6 starts — the spec is not left describing a mechanism that does not exist

**Tests**: none (spike; the finding is the deliverable) · **Gate**: quick
**Commit**: `docs(specs): record the verified remote-address mechanism for the web-ui key injection`

---

### T1 / TASK-001: Atomic config persistence + `security` section

**What**: Make `saveConfig` atomic and add a `security` section to `MassaAiConfig` that survives a partial user config.
**Where**: `packages/shared/src/config/massa-ai-config.ts`, `packages/shared/src/config/config-loader.ts`
**Depends on**: None
**Reuses**: The existing explicit sub-object merge pattern at `config-loader.ts:34-43`; the `llm.apiKey` field shape.
**Requirement**: SEC-01
**Non-goals**: No key generation yet. No consumer changes.

**Tools** — MCP: `massa-ai` (`search`, `read_file`). Skill: NONE.

**Done when**:
- [ ] `MassaAiSecurityConfig { apiKey?: string; corsOrigins?: string[] }` added to `MassaAiConfig`
- [ ] `loadConfig()` has an explicit `security` merge line — a config.json missing `security` round-trips without losing it
- [ ] `saveConfig` writes to a temp file in the same dir then `fs.renameSync` over the target
- [ ] Test: partial config.json (no `security`) → load → save → reload keeps every other section intact
- [ ] Test: two concurrent `saveConfig` calls leave a parseable file (never a truncated one)
- [ ] **Every test in this task sets `XDG_CONFIG_HOME` to a temp dir BEFORE importing `config-loader`** — `CONFIG_DIR` is a module-level const at `config-loader.ts:7`, so a late assignment has no effect and the test would write to the developer's real `~/.config` (Plan Challenge finding 4). The isolation runner already forks on `process.env.X =`, so this classifies correctly
- [ ] Quick gate passes; test count recorded

**Tests**: unit · **Gate**: quick
**Commit**: `fix(shared): make config persistence atomic and add a security section`

---

### T2 / TASK-002: `resolveApiKey()` with first-start provisioning

**What**: One resolver returning the runtime API key, provisioning and persisting one when absent.
**Where**: `packages/shared/src/config/api-key.ts` (new), `packages/shared/src/env.ts`
**Depends on**: T1
**Reuses**: `loadConfig`/`saveConfig` from T1; the `env.ts:63-74` seeding pattern for `llm.apiKey`.
**Requirement**: SEC-01

**Done when**:
- [ ] `resolveApiKey(): { key, provisioned, source }` implemented per design
- [ ] Precedence proven: env wins over config.json (`env > config.json > generated`)
- [ ] Generation uses `crypto.randomBytes(32).toString("hex")`
- [ ] After a generating write, the file is re-read and the persisted key adopted (concurrent-start edge case)
- [ ] Throws a typed error when generation is required and the config dir is unwritable
- [ ] `env.ts` seeds `cfg.security.apiKey → MASSA_AI_API_KEY` only when the env var is unset
- [ ] Test: warn line is emitted exactly once and **never contains the key value**
- [ ] Quick gate passes; test count recorded

**Tests**: unit · **Gate**: quick
**Commit**: `feat(shared): resolve and auto-provision the Tools API key`

---

### T3 / TASK-003: Remove the auth bypass

**What**: `authMiddleware` uses the resolved key; the no-key pass-through is deleted; the API exits non-zero when a key cannot be obtained.
**Where**: `apps/tools-api/src/middleware/auth.ts`, `apps/tools-api/src/index.ts`
**Depends on**: T2
**Reuses**: the existing 401 envelope, `deriveActor`, `PUBLIC_PATHS`, and `validateApiStartup`'s fail-fast placement.
**Requirement**: SEC-01
**Non-goals**: `PUBLIC_PATHS` is unchanged — `/health` must stay public for the Docker healthcheck.

**Done when**:
- [ ] `if (!apiKey) return;` at `auth.ts:51` is gone
- [ ] The key is resolved by an explicit `initAuth()` called **only from `index.ts`**, never at module-import time — `auth.test.ts` imports this module directly, and an import-time resolve would persist a key into the real `~/.config` of every developer and CI runner (Plan Challenge finding 4)
- [ ] **`/ui` and `/ui/` added to `PUBLIC_PATHS`** — `authMiddleware` (`index.ts:121`) runs before `webUiRoutes` (`:140`), so without this `GET /ui` 401s and SEC-05 is dead code (Plan Challenge finding 1a)
- [ ] Test: a decoy path `/uixyz` is **not** exempted — `PUBLIC_PATHS` matches with `startsWith` (`auth.ts:46`)
- [ ] **`apps/tools-api/src/middleware/auth.test.ts:24-34`** — the two "dev mode — allows requests without header" assertions encode the exact bypass being deleted. They are **rewritten**, not removed, and the net test delta is explained
- [ ] **Real-HTTP** test: `POST /api/v1/executor/execute` with no header → 401; with the header → not 401
- [ ] Real-HTTP test: `/health`, `/swagger`, `/swagger/json`, `/ui` reachable with no key
- [ ] Test: unwritable config + no env key → non-zero exit before the port binds
- [ ] Discriminating test observed **red** against the current bypass before the fix
- [ ] Full gate passes; test count recorded

**Tests**: integration (real HTTP) · **Gate**: full
**Commit**: `fix(tools-api)!: require an API key for every non-public route`

---

### T4 / TASK-004: CORS allowlist

**What**: Replace bare `cors()` with an explicit origin allowlist read from `security.corsOrigins`.
**Where**: `apps/tools-api/src/index.ts`, `packages/shared/src/config/index.ts`
**Depends on**: T3
**Reuses**: the `ServerConfig.security` section (`config/index.ts:215-222`) and existing `envString` helpers.
**Requirement**: SEC-02

**Done when**:
- [ ] `MASSA_AI_API_CORS_ORIGINS` (comma-separated) added to `ServerConfig.security` and `.env.example`
- [ ] Empty/unset → `{ origin: false, credentials: false }`
- [ ] Real-HTTP test: foreign `Origin` → no matching `Access-Control-Allow-Origin`
- [ ] Real-HTTP test: allow-listed `Origin` → header present and exact
- [ ] Unit test: `corsOrigins` containing `*` with credentials → startup throws
- [ ] Full gate passes; test count recorded

**Tests**: integration (real HTTP) · **Gate**: full
**Commit**: `fix(tools-api)!: restrict CORS to an explicit origin allowlist`

---

### T5 / TASK-005: Delete the inert admin-preservation ladder

**What**: Remove `admin-preservation.ts`, its wiring, and its tests; replace with a parameterised 401 test over the endpoints it claimed to protect.
**Where**: `apps/tools-api/src/middleware/admin-preservation.ts` (delete), `apps/tools-api/src/index.ts`, associated test files
**Depends on**: T3
**Reuses**: T3's real-HTTP harness.
**Requirement**: SEC-04
**Non-goals**: No new auth model. The six endpoints are protected by T3's middleware.

**Done when**:
- [ ] Module, its `.use(...)` registration, and its tests are removed
- [ ] A parameterised real-HTTP test asserts 401 without a key for all six former `ADMIN_ENDPOINTS`
- [ ] `rg 'getUserCount|adminPreservation'` returns nothing outside CHANGELOG
- [ ] Full gate passes; test count recorded (net test delta explained — removals are justified, not silent)

**Tests**: integration (real HTTP) · **Gate**: full
**Commit**: `refactor(tools-api): remove the inert admin-preservation ladder`

---

### T6 / TASK-006: Web UI key injection for loopback callers

**What**: Serve `/ui` with the API key in a meta tag for loopback requests only; the browser client reads it.
**Where**: `apps/tools-api/src/routes/web-ui.ts`, `apps/web-ui/src/static/app.js` (`request()` at `:625`), `apps/web-ui/src/static/index.html`
**Depends on**: T0, T3
**Reuses**: the existing static-dir resolver and `resolveSafePath` traversal guard.
**Requirement**: SEC-05
**Blocked by T0**: implement whichever mechanism T0 verified — remote address, or the `MASSA_AI_WEB_UI_TRUST_LOCAL` fallback. Do not implement both.

**Done when**:
- [ ] Local/trusted request to `/ui` → `index.html` carries `<meta name="massa-ai-api-key">`
- [ ] Untrusted request → no meta tag, plus a configure-access element
- [ ] `app.js` `request()` sends `x-api-key` when the meta tag is present and omits it otherwise
- [ ] Real-HTTP test for both remote-address cases
- [ ] `apps/web-ui` unit test for `request()` header behavior both ways
- [ ] Known limitation (loopback-terminating reverse proxy) documented in `docs/`
- [ ] Full gate passes; test count recorded

**Tests**: integration (real HTTP) + unit · **Gate**: full
**Commit**: `fix(web-ui): authenticate dashboard calls via a loopback-injected key`

---

### T7 / TASK-007: Install surfaces provision a key

**What**: The documented install paths produce a working authenticated setup.
**Where**: `scripts/setup-local-first.sh`, `install.sh`, `.env.example`, `docker-compose.yml`, `README.md`
**Depends on**: T2
**Reuses**: `installer_env_publish` and the existing config.json writer in `setup-local-first.sh:414`.
**Requirement**: SEC-06

**Done when**:
- [ ] `setup-local-first.sh` leaves a key in `config.json` and prints where to find it
- [ ] `.env.example` documents `MASSA_AI_API_KEY` and `MASSA_AI_API_CORS_ORIGINS`
- [ ] `docker-compose.yml` passes `MASSA_AI_API_KEY` through (optional; absent → container auto-provisions into its mounted volume)
- [ ] Shell test in `scripts/tests/` asserts the key lands and that a re-run is idempotent
- [ ] MCP client resolves the same key — `api-client.ts:36` already reads `MASSA_AI_API_KEY`; add a **discriminating test of the config-seeded path** rather than assuming it works by analogy with `env.ts`
- [ ] **Docker-path assertion (Plan Challenge finding 3)**: a host-originated request through the mapped `3333:3333` port receives the SEC-05 trusted treatment. `docker-compose.yml:66-71` uses a bridge mapping, so the container may see a bridge address rather than loopback — the dashboard must not silently break for the one deployment SEC-06 promises to support
- [ ] Full gate passes; test count recorded

**Tests**: integration (shell) + unit · **Gate**: full
**Commit**: `fix(install): provision an API key on every documented install path`

---

### T23 / TASK-023: Propagate the key to the lifecycle hook binary

**What**: Make the shipped hook binary find the auto-provisioned key so lifecycle capture survives SEC-01.
**Where**: `apps/claude-plugin/hooks/massa-ai-hook.ts` (the real file), the generated `apps/{codex,cursor}-plugin/hooks/massa-ai-hook` copies, `scripts/generate-subagent-artifacts.ts` output
**Depends on**: T2, T3
**Requirement**: SEC-06
**Why (Plan Challenge finding 2)**: `massa-ai-hook.ts:152` reads `process.env.MASSA_AI_API_KEY` and attaches `x-api-key` only `if (apiKey)`. It imports only `child_process`/`fs`/`path` — never `@massa-ai/shared` — so it never runs the `env.ts` config→env seeding the design relies on. It is fire-and-forget and silent-degrade by design, so a 401 after SEC-01 produces **no visible symptom**: passive observation capture just stops.
**Constraint**: do **not** add a `@massa-ai/shared` import — that changes the hook's dependency surface and startup cost. Read `~/.config/massa-ai/config.json` directly with `fs`, honoring `env > config.json` precedence.
**Managed-harness protocol**: the hook binary is a public compatibility surface. `CONTRIBUTING.md`'s 7-step protocol applies, and the Codex/Cursor copies are **real generated files, not symlinks** — they must be regenerated.

**Done when**:
- [ ] Hook resolves the key as `process.env.MASSA_AI_API_KEY` → `config.json` `security.apiKey` → none
- [ ] `scripts/generate-subagent-artifacts.ts` re-run; `scripts/__tests__/subagent-parity.test.ts` green
- [ ] **Capture-server test** proving the hook POSTs to the correct endpoint with a valid `x-api-key` on a fresh auto-provisioned install — asserting the body and endpoint, not merely `exit 0`. This directly closes candidate lesson **L-002**
- [ ] Test: with no key anywhere, the hook still exits 0 and never blocks the agent (silent-degrade contract preserved)
- [ ] Build gate passes; test count recorded

**Tests**: unit + integration · **Gate**: build
**Commit**: `fix(hooks): resolve the API key from config.json so lifecycle capture survives mandatory auth`

---

### T8 / TASK-008: Surface the effective sandbox mode

**What**: Carry `sandboxMode` from `#spawn` into every executor response and warn once when `auto` degrades to `none`.
**Where**: `packages/core/src/services/executor/executor.ts`, `sandbox.ts`, `packages/core/src/controllers/executor-controller.ts`, `.env.example`
**Depends on**: None (independent of the auth chain)
**Reuses**: the existing `SandboxMode` type; both transports are passthrough, so the controller is the only serialization point.
**Requirement**: SEC-03
**Conforms to**: **AD-007** — the `auto` default and its best-effort fallback are unchanged.

**Done when**:
- [ ] `sandboxMode: SandboxMode` on `ExecResult`, set in all three `#spawn` resolution branches
- [ ] Present in `execute`, `executeFile`, and every `batchExecute` result item
- [ ] One process-lifetime warn when `auto` resolves to `none`, naming the missing tool; **not** emitted for an explicit `none`
- [ ] `.env.example` documents `MASSA_AI_EXECUTOR_SANDBOX` with values and default
- [ ] `apps/mcp-client` test asserts the field survives the embedded passthrough
- [ ] Full gate passes; test count recorded

**Tests**: unit + integration · **Gate**: full
**Commit**: `feat(executor): report the effective sandbox mode on every result`

---

### T9 / TASK-009: Embeddings fail instead of fabricating

**What**: Delete the random-vector fallback and the now-dead `EmbeddingService` field in the relation extractor.
**Where**: `packages/core/src/services/embeddings/embedding-service.ts`, `packages/core/src/services/graph/relation-extractor.ts`, `packages/core/src/__tests__/embedding-service.test.ts`
**Depends on**: None
**Requirement**: BUG-01
**Non-goals**: No remediation of already-written vectors (spec AS-03).

**Done when**:
- [ ] Both `!this.provider` branches throw unconditionally; the `NODE_ENV` check is gone
- [ ] `getDimensions()`'s 384 fallback removed with it
- [ ] Unused `embeddingService` field at `relation-extractor.ts:105` deleted; the file still compiles and its tests pass
- [ ] The three tests at `embedding-service.test.ts:66,76,132` are **rewritten to assert the throw**, not deleted
- [ ] `rg 'Math.random' packages/core/src/services/embeddings/` returns nothing
- [ ] Test: `store_memory` with no provider returns `{success:false}` rather than succeeding
- [ ] Quick gate passes; test count recorded

**Tests**: unit · **Gate**: quick
**Commit**: `fix(embeddings)!: throw when no provider is available instead of returning random vectors`

---

### T10 / TASK-010: Project-scope the graph-neighbor stream

**What**: Drop any graph-neighbor row whose `project_id` differs from the search's project.
**Where**: `packages/core/src/services/search/rlm-synapse.ts:213-230`
**Depends on**: None
**Requirement**: BUG-02
**Non-goals**: No schema migration; `memory_edges` keeps no `project_id` column (user decision).

**Done when**:
- [ ] Filter added beside the existing `deleted_at` check
- [ ] PG integration test: two projects, one cross-project `memory_edges` row, search A → B's content absent. **Observed red first**
- [ ] Test: when the filter removes every neighbor, other RRF streams still return normally
- [ ] Full gate passes; test count recorded

**Tests**: integration (PG) · **Gate**: full
**Commit**: `fix(search): filter graph-neighbor results by project`

---

### T11 / TASK-011: Stop the heartbeat on the stale-generation retry

**What**: Tear down the managed-run heartbeat before `runInternal` re-enters on `graph_generation_stale_active:*`.
**Where**: `packages/core/src/services/etl/pipeline.ts:307-327, 341-352`
**Depends on**: None
**Requirement**: BUG-03

**Done when**:
- [ ] `stopManagedRunHeartbeat` set and the timer controller aborted on the retry path
- [ ] Test with fake timers: after the outer run completes, no further `heartbeat()` call occurs
- [ ] Test: exhausting all 3 retries leaves zero running loops
- [ ] Discriminating test observed red first
- [ ] Quick gate passes; test count recorded

**Tests**: unit · **Gate**: quick
**Commit**: `fix(etl): stop the managed-run heartbeat before a stale-generation retry`

---

### T12 / TASK-012: Correct namespace-import resolution order

**What**: Try the resolved module path before the project-wide symbol index, matching the docstring.
**Where**: `packages/core/src/services/etl/stages/resolve.ts:403-425`
**Depends on**: None
**Requirement**: BUG-04

**Done when**:
- [ ] Module-scoped FQN attempted first; the global `symbolIndex` becomes the fallback
- [ ] Test: `import * as Utils from './utils'; Utils.parse(x)` binds to `./utils#parse` even when another file exports a top-level `parse`
- [ ] Test: with no module-scoped match, the global fallback still resolves
- [ ] Discriminating test observed red first
- [ ] Quick gate passes; test count recorded

**Tests**: unit · **Gate**: quick
**Commit**: `fix(etl): resolve namespace-imported callees against their module first`

---

### T13 / TASK-013: Resolve the canonical project id before fetching centrality

**What**: Use the alias-resolved id at the `getCentrality` call so centrality is not silently zero.
**Where**: `packages/core/src/services/search/rlm-indexing.ts:179`
**Depends on**: None
**Requirement**: BUG-05

**Done when**:
- [ ] `getCentrality` receives the same canonical id `indexFileImpl` resolves at `:477`
- [ ] Test: indexing with a retired alias yields non-zero `metadata.centralityScore`
- [ ] Discriminating test observed red first
- [ ] Quick gate passes; test count recorded

**Tests**: unit · **Gate**: quick
**Commit**: `fix(search): resolve the canonical project id before loading centrality`

---

### T14 / TASK-014: Close the observation read-after-write hole

**What**: Key the synchronous mirror on the canonical project id at insert time.
**Where**: `packages/core/src/data/memory/observation-repository-pg.ts:165-192`
**Depends on**: None
**Requirement**: BUG-06

**Done when**:
- [ ] A read by canonical id in the same tick as an insert with a retired id finds the observation
- [ ] Existing documented same-id concurrency caveat is preserved (not silently widened) or explicitly updated
- [ ] Discriminating test observed red first
- [ ] Full gate passes; test count recorded

**Tests**: integration (PG) · **Gate**: full
**Commit**: `fix(memory): resolve the canonical project id before the observation mirror write`

---

### T15 / TASK-015: PR1 close — docs, CHANGELOG, full gate

**What**: Document the breaking auth change and land PR1.
**Where**: `CHANGELOG.md`, `README.md`, `FEATURES.md`, `CLAUDE.md`, `.specs/project/STATE.md`
**Depends on**: T3, T4, T5, T6, T7, T23, T8, T9, T10, T11, T12, T13, T14
**Requirement**: SEC-01..06, BUG-01..06

**Done when**:
- [ ] `CHANGELOG.md` `[Unreleased]` gains `### Security` (auth, CORS) and `### Changed` (embedding throw, sandbox field) entries — minor wins, per `CONTRIBUTING.md`
- [ ] The entry explicitly states that the API now requires a key and that a key is auto-provisioned
- [ ] AS-03 re-index guidance documented for anyone who ran without a reachable provider
- [ ] **The skip-ci marker is never written in any commit body or PR body**
- [ ] Build gate green: type-check 6/6, build 5/5, `bun run test`, `test:scripts`, `test:plugins` all 0 fail
- [ ] `AD-011` appended to `.specs/project/STATE.md` `## Decisions`

**Tests**: none (docs) · **Gate**: build
**Commit**: `docs: record the audit-remediation security changes`

---

### T16 / TASK-016: Record AD-010 / mark superseded decisions

**What**: Write the decision record that authorises the hard env rename **before** performing it.
**Where**: `.specs/project/STATE.md` `## Decisions`
**Depends on**: None (PR2 entry point)
**Requirement**: DEBT-03
**Why first**: prior approved artifacts recorded `RLM_LLM_*` as an intentional compatibility boundary. Reversing it silently is exactly what the Decision Supersession rule forbids.

**Done when**:
- [ ] `AD-010` appended: one env prefix, `MASSA_AI_LLM_*`, no dual-read; rationale and rejected alternatives recorded
- [ ] The prior exclusions in `repo-rename-massa-ai` and `project-identity-rename` are annotated `superseded by AD-010`
- [ ] No `plan_challenge:` / `persona_router:` / `conversation_feedback:` block is introduced into root `AGENTS.md` (`skills-harness-integrity.test.ts` guards this)

**Tests**: none · **Gate**: quick (`bun run test:scripts`)
**Commit**: `docs(specs): record AD-010 superseding the RLM_ compatibility boundary`

---

### T17 / TASK-017: Hard-rename `RLM_LLM_*` → `MASSA_AI_LLM_*`

**What**: Rename all 10 env vars across 34 tracked files and complete the `passThroughEnv` list.
**Where**: `packages/shared/src/config/index.ts:555-583,720`, `env.ts:63-64`, `turbo.json:39-42`, `docker-compose.yml:57-59`, `install.sh:389-396,583,871`, `scripts/setup-local-first.sh:178,201`, `.env.example:181-284`, `benchmarks/llm-judge/**`, `packages/core/src/services/memory/llm-client.ts:11,149`, `observation-consolidation-job.ts:154`, tests, `README.md`, `FEATURES.md`, `CLAUDE.md`, `docs/ONBOARDING.md`, `apps/claude-plugin/hooks/README.md`
**Depends on**: T16
**Requirement**: DEBT-03
**Conforms to**: **AD-008** — no json_schema gating logic is touched.
**Non-goals**: config.json keys are already prefix-free — **no config-file migration**.

**Done when**:
- [x] `rg 'RLM_' --hidden --glob '!CHANGELOG.md' --glob '!.specs/**' --glob '!**/llm-env-prefix.test.ts' --glob '!**/llm-env-passthrough.test.ts'` returns nothing.
      **Glob set amended during Execute** — the original omitted `.specs/project/**` (which holds AD-010 itself) and predates the two test files whose entire purpose is to name the retired prefix. Hiding the literal by string concatenation was considered and rejected: it satisfies the grep while making the gate lie. See `design.md` → "TASK-017 — the zero-`RLM_` gate cannot be literally zero".
- [x] `turbo.json` `passThroughEnv` lists **all 10** `MASSA_AI_LLM_*` vars (was 4 of 10 — renaming without this preserves a silent bug under a new name)
- [x] `CLAUDE.md:159` reworded (not substituted) and the "11 call sites" claim corrected to **10** (3 `modelRole:"code"` + 7 default-instruct). The companion "8 NL-judgment sites" was also wrong and is corrected to **7**, which the task text did not name; counted from source in `design.md`.
- [x] Test: `MASSA_AI_LLM_ENABLED=true` activates the call sites; the old name does nothing — `packages/shared/src/config/__tests__/llm-env-prefix.test.ts`, observed **red in both directions** before the rename
- [x] Full gate passes; test count recorded — shared 207 pass/0 fail (was 204), `test:scripts` 577 pass/0 fail (was 574), type-check 6/6, build 5/5, core LLM filter PASS all 14 groups

**Tests**: unit · **Gate**: full
**Commit**: `feat(config)!: rename RLM_LLM_* env vars to MASSA_AI_LLM_*`

---

### T18 / TASK-018: Adopt oxlint and make `bun run lint` real

**What**: Add oxlint with correctness rules, implement the `lint` script per package, wire CI.
**Where**: root `package.json`, `.oxlintrc.json`, each package's `package.json`, `turbo.json:47`, `.github/workflows/ci.yml`
**Depends on**: None
**Requirement**: DEBT-01
**Non-goals**: **No formatter, no reformat.** A repo-wide format is a separate PR by user direction.

**Done when**:
- [x] oxlint added as a root devDependency (**exact** `1.76.0`); `.oxlintrc.json` enables `correctness` only, every other category `off`
- [x] ~~The initial rule set passes on the current tree with **zero source changes**~~ — **SUPERSEDED during Execute by the spec owner.** Adoption found **337** violations; honouring this literally meant downgrading the 15 firing rules to `warn`, i.e. a gate that reports but never enforces. The owner chose instead to **fix all 337 and keep every correctness rule at `error`**. See `design.md` → "TASK-018 — scope amended by the spec owner during Execute". The "no formatter, no reformat" non-goal is unchanged.
- [x] ~~`turbo.json`'s `lint` task is implemented by real per-package scripts~~ — **not implementable.** Turbo dispatches only to workspace packages (`packages/*`, `apps/*`); `scripts/` and `benchmarks/` are neither and held 21 of the 337 violations, so a per-package task would report success while never reading them. `ignorePatterns` also resolve against cwd and stop matching per-package. Shipped as root `"lint": "oxlint"` over the whole repo; the dead `"lint": {}` turbo task is removed. See `design.md`.
- [x] Test: a seeded violation file makes `bun run lint` exit non-zero; removed, it exits 0 — `scripts/__tests__/lint-gate.test.ts`, 2/2. Uses `no-dupe-keys` (clean across the tree, and not auto-fixable, so `--fix` cannot erase the probe); `afterEach` removes the probe even when an assertion throws, since a leaked probe would break every later lint run.
- [x] CI `build` job runs `bun run lint` (placed before Build — cheapest gate in the job)
- [x] Build gate passes — and the full matrix beyond it: oxlint exit 0 / 0 diagnostics (from 337), type-check 6/6, build 5/5, `test:scripts` 579 pass exit 0, shared 207, web-ui 113, plugins 94, tools-api 25 groups, mcp-client 8 groups, **core unit 126 groups all passing** vs a baseline of 126 groups with 2 Dart timeouts
- [x] All 337 violations cleared: 16 by `oxlint --fix` (documented-safe fixes only), 321 by hand across six disjoint write sets. `--fix-suggestions` / `--fix-dangerously` were **not** used — oxc documents both as behavior-changing.

**Tests**: unit (`scripts/__tests__`) · **Gate**: build
**Commit**: `feat(tooling): add oxlint and implement the lint gate`

---

### T19 / TASK-019: Make coverage an explicit gate

**What**: Stop computing coverage on every run; add a threshold-enforcing script.
**Where**: `bunfig.toml`, root `package.json`
**Depends on**: None
**Requirement**: DEBT-02

**Done when**:
- [x] `coverage = true` removed from `bunfig.toml`; the 5 s global timeout is left untouched
- [x] `bun run test:coverage` exists and fails below a documented threshold — `scripts/check-coverage.ts`, wired as a root script
- [x] The threshold matches the 90% floor and the 9 documented exclusions — **moved out of `.specs/HANDOFF.md` into the script as executable data** (`LINE_COVERAGE_FLOOR`, `EXCLUSIONS`), each exclusion carrying the justification that earned it. Per the user's decision, and for the same reason as the T7 installer-api-key precedent: T22 rewrites `HANDOFF.md`, so a gate pinned to it would silently lose its own definition.
- [ ] **BLOCKED — the floor is implemented but unverified.** See below.

**Blocker: the floor cannot be measured without the dedicated test database.**

50 core suites are wrapped in `describe.skipIf(!DEDICATED_DB)`, requiring `MASSA_AI_DEDICATED=1`
and a `DATABASE_URL` on `127.0.0.1:5433/massa_ai_test`. Run without them, the suites report
`0 pass / N skip` and their subjects measure near zero — a first full run reported **132 of 314
files below the floor**, including `graph-queries.ts` at 3.98% while its own 19 tests sat
skipped beside it. That number is an artifact, not a coverage gap.

The script therefore refuses to run without that environment rather than emitting a report that
looks like a catastrophe; a gate that silently measures a skipped suite trains people to ignore
it. The refusal path is verified. **The passing path is not** — running it needs the dedicated
database, and the attempt was denied by the sandbox classifier as credential exploration.

Two further findings the first run surfaced, both real:

- `packages/shared/src/config/api-key.ts` measures **13.79%** despite 373 lines of dedicated
  tests, because `api-key.test.ts` exercises it exclusively through the `runIsolated` subprocess
  harness (21 call sites) and Bun's coverage does not cross a process boundary. This is a
  measurement blind spot, not missing tests, and it is not among the 9 recorded exclusions.
- Core emitted **122** lcov files for **126** groups, so 4 groups produced no coverage output at
  all. Unexplained; needs its own look before the floor can be trusted.

**Tests**: none (config) · **Gate**: full
**Commit**: `chore(tooling): make coverage an explicit gate instead of a default`

---

### T20 / TASK-020: One test-runner implementation

**What**: Collapse three divergent `run-tests-isolated.ts` copies into one shared module plus thin wrappers.
**Where**: `scripts/lib/run-tests-isolated.ts` (new), `packages/core/scripts/`, `apps/tools-api/scripts/`, `apps/mcp-client/scripts/`
**Depends on**: None
**Reuses**: `scripts/lib/opencode-config.cjs` as the shared-lib precedent.
**Requirement**: DEBT-04
**Non-goals**: `packages/shared` is a published package (`files: ["dist"]`) and does not host dev tooling.

**Done when**:
- [x] Shared module owns `findTestFiles`, `findTopLevelTestFiles`, signal forwarding, `runGroup`, reporting and exit codes — `scripts/lib/run-tests-isolated.ts`
- [x] Each package's wrapper supplies only its own `isolationReason` predicate; core additionally supplies `--unit/--e2e/--filter` and the forced-last `17.cleanup-verify.test.ts` ordering
- [x] Each package's suite runs green through its wrapper with the **same** group counts as before — core **126** (224 files → 99 shared + 125 isolated), tools-api **25** (44 → 20 + 24), mcp-client **8** (20 → 13 + 7). All three identical to the pre-change baseline captured at `origin/main` @ `c992ae9`.
- [x] Test asserting the three wrappers resolve the same shared module — `scripts/__tests__/isolated-runner-parity.test.ts`, 5/5. Also asserts no wrapper re-implements `spawn`/signal handling/`process.exitCode`, which is what would signal a partial revert.
- [x] Build gate passes; group counts recorded above. lint 0, type-check 6/6, build 5/5, `test:scripts` 584 exit 0 (579 + 5 new).
- [x] Observable contracts preserved rather than normalised: unknown args still exit **2** in all three; core still rejects `--unit --e2e`; mcp-client still prints `shared (N files)` and tools-api still prints `isolated: <path>` without a reason. Normalising the wording would have changed CI log shape in the same commit that moved the code.
- [x] Latent defect fixed in passing: core's predicate read `/\b(?:DATABASE_URL|DATABASE_URL)\b/` — the same alternative twice. Now `/\bDATABASE_URL\b/`, behaviourally identical.
- [x] Shared module gained `--coverage` / `--coverage-dir=` passthrough with a per-group subdirectory, which is the prerequisite that lets **TASK-019**'s gate reach the three packages that cannot run a plain `bun test`. This is why T20 was executed before T19.

**Tests**: unit (`scripts/__tests__`) · **Gate**: build
**Commit**: `refactor(scripts): share one isolated-test-runner implementation`

---

### T21 / TASK-021: Naming residuals

**What**: Fix the stale `bunfig.toml` header and relocate the two one-off scripts sitting in the core package root.
**Where**: `bunfig.toml`, `packages/core/create-3072d-table.ts`, `packages/core/create-progress-memory.ts`
**Depends on**: None
**Requirement**: DEBT-05
**Non-goals**: `rlm-*` source filenames stay — deferred to the god-module refactor that rewrites them (spec Out of Scope).

**Done when**:
- [ ] `bunfig.toml` header names this project, not `MCP RLM Mem0`
- [ ] Both scripts moved under `packages/core/scripts/` (or deleted if dead — verify no reference first)
- [ ] `rg 'create-3072d-table|create-progress-memory'` shows no stale path reference
- [ ] Quick gate passes

**Tests**: none (config/move) · **Gate**: quick
**Commit**: `chore: fix stale naming and relocate one-off core scripts`

---

### T22 / TASK-022: PR2 close — CHANGELOG and full gate

**What**: Document the breaking rename and land PR2.
**Where**: `CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`
**Depends on**: T16..T21
**Requirement**: DEBT-01..05

**Done when**:
- [ ] `### Changed` entry states that `RLM_LLM_*` no longer works and names each replacement
- [ ] `### Added` entry for the lint gate
- [ ] The skip-ci marker is never written in any commit or PR body
- [ ] Build gate green including `bun run lint`
- [ ] STATE.md and HANDOFF.md updated

**Tests**: none (docs) · **Gate**: build
**Commit**: `docs: record the audit-remediation debt changes`

---

## Pre-Approval Check 1 — Task Granularity

| Task | Scope | Status |
| --- | --- | --- |
| T0 | 1 spike, 1 recorded finding | ✅ Granular |
| T23 | 1 resolver + regeneration of its copies | ✅ Granular |
| T1 | 2 cohesive files, one concern (config persistence) | ✅ Granular |
| T2 | 1 new module + 1 seed line | ✅ Granular |
| T3 | 1 middleware + its startup wiring | ✅ Granular |
| T4 | 1 config surface + 1 plugin option | ✅ Granular |
| T5 | 1 module deletion + its wiring | ✅ Granular |
| T6 | 1 route + 1 client function | ✅ Granular |
| T7 | Install surfaces — 4 files, one concern (key provisioning) | ⚠️ OK — cohesive; splitting installers from `.env.example` would leave an untestable half |
| T8 | 1 interface field threaded to 1 serialization point | ✅ Granular |
| T9 | 1 function pair + 1 dead-field deletion | ✅ Granular |
| T10 | 1 filter line | ✅ Granular |
| T11 | 1 teardown path | ✅ Granular |
| T12 | 1 function | ✅ Granular |
| T13 | 1 call site | ✅ Granular |
| T14 | 1 method | ✅ Granular |
| T15 | Docs + gate | ✅ Granular |
| T16 | 1 artifact section | ✅ Granular |
| T17 | Mechanical rename, 34 files, one concern | ⚠️ OK — a rename split across files would leave the repo unbuildable mid-way |
| T18 | 1 dependency + config + CI wiring | ✅ Granular |
| T19 | 2 config edits | ✅ Granular |
| T20 | 1 shared module + 3 wrappers | ✅ Granular |
| T21 | 1 header + 2 moves | ✅ Granular |
| T22 | Docs + gate | ✅ Granular |

No ❌. The two ⚠️ entries are cohesive-by-necessity, per the "2–3 related things in the same concern" allowance.

## Pre-Approval Check 2 — Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T0 | None | phase 0 start | ✅ |
| T1 | None | phase 1 start | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 (phase 1 → 2) | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T3 | T4 → T5 (same phase, later) | ✅ |
| T6 | **T0**, T3 | phase 0 → phase 2; T5 → T6 | ✅ backward across phases |
| T7 | T2 | phase 3 after phase 2 | ✅ |
| T23 | T2, T3 | T7 → T23 (phase 3, after phase 2) | ✅ backward |
| T8 | None | T23 → T8 (ordering only) | ✅ |
| T9–T14 | None | phase 4 chain (ordering only) | ✅ |
| T15 | T3..T14, T23 | phase 5 after phase 4 | ✅ |
| T16 | None | phase 6 start | ✅ |
| T17 | T16 | T16 → T17 | ✅ |
| T18–T21 | None | phase 6 chain (ordering only) | ✅ |
| T22 | T16..T21 | end of phase 6 | ✅ |

No task depends on a later phase. Backward and same-phase only. ✅

## Pre-Approval Check 3 — Test Co-location Validation

| Task | Layer modified | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T0 | none (spike; no production code ships) | none | none | ✅ |
| T23 | Root scripts + plugin hook binary | unit | unit + integration | ✅ |
| T1 | Shared config | unit | unit | ✅ |
| T2 | Shared config | unit | unit | ✅ |
| T3 | Tools API middleware | integration (real HTTP) | integration | ✅ |
| T4 | Tools API middleware + shared config | integration (highest) | integration | ✅ |
| T5 | Tools API middleware | integration | integration | ✅ |
| T6 | Tools API routes + web-ui static | integration + unit (highest = integration) | integration + unit | ✅ |
| T7 | Shell installers + config files | integration (shell) | integration + unit | ✅ |
| T8 | Core services + MCP transport | unit + unit | unit + integration | ✅ |
| T9 | Core services | unit | unit | ✅ |
| T10 | Core services + PG data | integration | integration | ✅ |
| T11 | Core services | unit | unit | ✅ |
| T12 | Core services | unit | unit | ✅ |
| T13 | Core services | unit | unit | ✅ |
| T14 | Core data (PG) | integration | integration | ✅ |
| T15 | Docs only | none | none | ✅ |
| T16 | `.specs/` artifact | none | none | ✅ |
| T17 | Shared config + core services | unit | unit | ✅ |
| T18 | Root scripts / tooling | unit | unit | ✅ |
| T19 | Config files | none | none | ✅ |
| T20 | Root scripts | unit | unit | ✅ |
| T21 | Config files + file moves | none | none | ✅ |
| T22 | Docs only | none | none | ✅ |

No ❌ VIOLATION. Every `Tests: none` corresponds to a matrix row that says `none`.

## Requirement Coverage

| Requirement | Tasks |
| --- | --- |
| SEC-01 | T1, T2, T3 |
| SEC-02 | T4 |
| SEC-03 | T8 |
| SEC-04 | T5 |
| SEC-05 | T0 (spike), T3 (`PUBLIC_PATHS`), T6 |
| SEC-06 | T7, T23 |
| BUG-01 | T9 |
| BUG-02 | T10 |
| BUG-03 | T11 |
| BUG-04 | T12 |
| BUG-05 | T13 |
| BUG-06 | T14 |
| DEBT-01 | T18 |
| DEBT-02 | T19 |
| DEBT-03 | T16, T17 |
| DEBT-04 | T20 |
| DEBT-05 | T21 |

17/17 mapped. 0 unmapped.

## MCP and Skill Question

| Question | Answer |
| --- | --- |
| Does any MCP change implementation or verification? | `massa-ai` MCP (`search`, `read_file`, `get_references`) is used for locating call sites during T17's rename and T20's runner comparison. It is a discovery aid only — current source is authoritative, and every claim is confirmed by a direct read. |
| Does any skill change implementation? | `massa-ai` router (Execute flow) and `massa-ai-verification-agent` for the mandatory final gate. No other skill applies. |
| Skipped | Context7 MCP is not registered this session — recorded as a skipped Knowledge-Verification-Chain sensor. oxlint's current rule catalogue was therefore not verified against upstream docs; T18 must confirm the rule set against the installed version before claiming AC-2. |
</content>
