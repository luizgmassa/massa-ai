# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Startup contract

`AGENTS.md` (repo root) is the canonical agent startup contract: `projectId`, session-id
convention, workflow routing, `.specs/` artifacts, plan-challenge policy, conversation
feedback. Read it once per session. Do not duplicate its rules here.

`CONTRIBUTING.md` defines the mandatory 7-step managed-harness protocol (contract →
register → preserve argv → read-only export → deliver-before-ack → invariants →
discriminating tests) for any change to skills, workflows, agents, plugins, MCP servers,
or permission rules.

## Naming divergence (read first)

The repo was renamed from `massa-th0th`. Sources are clean; residuals survive in a few
places. Canonical identity:

- npm scope / packages: `@massa-ai/*`; root package `massa-ai`
- `projectId` for memory/index tools: `massa-ai`
- env prefix: `MASSA_AI_*`; config dir `~/.config/massa-ai/`
- The MCP server is registered locally under the name `th0th`, so its tools surface as
  `mcp__th0th__*`. That prefix is a host-side registration name, not the project id.
- `th0th` also appears in Credits (the upstream project) — leave those refs alone.

Stale `massa-th0th-config.*` files under `packages/shared/dist/` are build output, not
sources.

`sicad` is **not** a rename residual — Sicad is a separate external codebase used as the
retrieval benchmark corpus (`benchmarks/needles/fixtures/sicad.json`,
`packages/core/src/scripts/create-sicad-beir-fixture.ts`). Leave those names alone.

## Runtime and toolchain

- **Bun 1.3.14** is the application runtime and package manager (pinned in
  `.tool-versions`, `mise.toml`, `packageManager`). Not Node.
- **Node 25.9.0 + npm 11.14.1** exist only as the `node-gyp` build helper for native
  tree-sitter grammars. Never run app code under Node.
- Turborepo drives cross-package tasks; TypeScript ESM strict, `module: NodeNext`.
- **PostgreSQL 17 + pgvector is the only backend.** There is no SQLite path. Prisma
  schema and migrations live in `packages/core/prisma/` (24 migrations).
- Native tree-sitter grammars build via **node-gyp during `bun install`**. On macOS arm64
  the build helper must be **Node 22**, not the pinned 25 — Node 25's V8 headers use a
  braced-init-list template arg that Apple clang rejects (`error: expected expression`).
  CI encodes this split (`structural-native` job on macos-14 pins Node 22; Linux x64 uses
  25.9.0). The addon is N-API, so the build-helper major never affects runtime under Bun.
- `tree-sitter@0.25.0` is **patched** (`patches/tree-sitter@0.25.0.patch`, 22 KB). Bumping
  that dep invalidates the patch and breaks the native structural path.

## Commands

```bash
bun install                    # workspace install (--frozen-lockfile in CI)
bun run build                  # turbo build — 5 buildable packages (core, shared, tools-api, mcp-client, opencode-plugin)
bun run type-check             # turbo tsc --noEmit — 4 packages (see below)
bun run test                   # turbo test — 6 packages; does NOT cover scripts/ (see below)
bun run test:scripts           # root-level suites outside the workspace globs
bun run diagnose               # validates Ollama, DB, embeddings, migration status
bun run dev:api                # REST API :3333 with hot reload; also serves Web UI at /ui
bun run dev:mcp                # MCP server (stdio) with watch
cd packages/core && bunx prisma migrate deploy
```

`bun run lint` is a **no-op** — `turbo.json` declares a `lint` task but no package
implements it ("No tasks were executed"). There is no linter in this repo; don't cite it
as a gate.

`type-check` only covers the 4 packages that declare the script (tools-api, mcp-client,
opencode-plugin, web-ui). `packages/core` and `packages/shared` are type-checked by their
`build`, which is a real `tsc` emit. Core's `prebuild` runs `bunx prisma generate`, and its
`build` copies `src/generated` into `dist/` — a plain `tsc` will not produce a working
`dist`.

Bringing up the database:

```bash
docker compose up -d postgres          # pgvector/pgvector:pg17, port 5432
bash scripts/setup-native-postgres.sh  # or a native install
bash scripts/setup-local-first.sh      # full offline wizard: Postgres + Ollama + .env
```

`predev*` scripts auto-run `scripts/diagnose.ts` (and `ensure-ollama.sh` for `dev`).

### Running tests

Three packages — `packages/core`, `apps/tools-api`, `apps/mcp-client` — do **not** run
plain `bun test`; their `test` script is `bun scripts/run-tests-isolated.ts`. The three
runners are **separate, divergent copies** (236 / 124 / 141 lines) with different pattern
sets; the table below is core's, the richest. `packages/shared` and
`apps/opencode-plugin` do run plain `bun test`.

The runner scans test *source* and forks a dedicated child process for any file it
classifies as needing isolation:

| Detected pattern | Reason |
|---|---|
| `mock.module(` | module mock |
| `integration/` dir, `*.e2e.test.ts`, `DATABASE_URL`, `PrismaClient(`, `Postgres*Repository`, `EtlPipeline`, `get{Graph,Memory,Vector,…}Store(` | database/integration |
| `eventBus`, `useFakeTimers`, `setSystemTime`, `_set*ForTesting(`, `process.env.X =` | process-global state |

Consequence: running `bun test` over a whole directory cross-contaminates module and
process state and will produce false failures. Use the runner, or target one file.

**`bun run test` is not the whole suite.** Turbo only reaches packages under
`packages/*` / `apps/*` that declare a `test` script. Root-level suites live outside those
globs and run from a separate script:

```bash
bun run test:scripts   # scripts/__tests__ + scripts/tests (551 TS tests + 3 shell suites)
```

That covers `scripts/__tests__/subagent-parity.test.ts`, the guard for the generated
Claude/Codex/Cursor/OpenCode plugin artifacts. Run it after touching
`generate-subagent-artifacts.ts`. `scripts/run-deterministic.ts` only scans
`packages/core/src/__tests__` — it is a core gate, not a repo-wide one.

`bunfig.toml` sets a global **5 s per-test timeout** and `coverage = true`. A test doing
real indexing or embedding needs an explicit longer timeout or it fails as flake. Two
tests currently flake this way in the full parallel aggregate while passing standalone —
`mcp-client` `embedded-api-client-endpoints.test.ts` ("routes without 404") and core's
Dart `structural` case, both dying at exactly 5001 ms when Postgres and Ollama are
contended. A 5001 ms failure is a load problem, not a logic bug; re-run the package alone
before chasing it.

```bash
# one file (safe — single process)
bun test packages/core/src/__tests__/read-file.test.ts
bun test packages/core/src/__tests__/read-file.test.ts -t "cache key"

# subset via the isolation runner (regex on path relative to src/__tests__)
cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='structural|serialize'

# unit only / e2e only
cd packages/core && bun run test:unit
cd packages/core && bun run test:e2e          # sets RUN_E2E=1

# live-API integration (opt-in gate, never in the default aggregate)
cd packages/core && bun run test:integration

# deterministic gate — no PostgreSQL, no Ollama, no native tree-sitter
bun scripts/run-deterministic.ts             # sets _DETERMINISTIC_ONLY=1
```

E2E suites live in `packages/core/src/__tests__/e2e/`, numbered for ordering; the runner
forces `17.cleanup-verify.test.ts` to run last. `16.destructive.test.ts` additionally
requires `RUN_E2E_DESTRUCTIVE`. Files are numbered up to `24.*`, but the number is not the
execution order — 18–24 run before the forced-last 17. E2E needs a real PostgreSQL —
indexing the full repo in one shot never completes, and concurrent indexes OOM; reuse a
shared index.

Turbo sandboxes the environment: any env var a test reads must be listed in
`turbo.json` → `tasks.test.passThroughEnv`, or it arrives `undefined` under
`bun run test` while working fine when you invoke `bun test` directly. Adding a new
`RLM_*` / `MASSA_AI_*` knob means editing that list too.

`packages/core/src/__tests__/e2e/fixtures/qwen-profile.json` pins commit-locked hashes.
Editing any file it tracks (including `README.md`) fails 2 tests until the change is
committed **and** `bun run update-qwen-hashes` refreshes the manifest.

## Architecture

`packages/core` is the whole product; everything in `apps/` is a transport or an install
surface. Core is four layers, stated in `packages/core/src/index.ts` and enforced by
directory:

```
tools/        thin MCP handlers — schema + delegation, no logic
controllers/  orchestration — composes services, owns side-effects
services/     domain logic — search, synapse, embeddings, graph, structural, memory, jobs
data/         persistence — PostgreSQL repositories, vector store, FTS, migrations
```

Repositories and services are reached through `get*()` factory functions with matching
`reset*()` for tests (that `reset*` pairing is why those tests get isolated processes).

### Two transports, one contract

- `apps/tools-api` — Elysia REST on :3333, routes in `src/routes/*.ts`, Swagger at
  `/swagger`, Web UI mounted at `/ui`. Route files sit beside their own `*.test.ts`.
- `apps/mcp-client` — MCP stdio server exposing 52 tools. Tool schemas are plain
  `ToolDefinition[]` JSON Schema arrays in `src/tool-defs/tool-defs-*.ts`;
  `call-tool-proxy.ts` maps a tool call onto an HTTP method + endpoint template.

It has **two** interchangeable clients behind `ToolProxyApiClient`:
`api-client.ts` (HTTP to tools-api) and `embedded-api-client.ts`
(in-process core calls, when `MASSA_AI_EMBEDDED=true`). The embedded client mirrors the
REST endpoint map exactly — that parity is a tested contract. **Adding or changing a tool
means touching three places:** the `tool-defs` schema, the tools-api route, and the
embedded mapping.

Gotcha: returning a bare string body from an Elysia handler overrides the wire
content-type to `text/plain`. In-process tests do not catch it; assert on a real HTTP
response.

### LLM behaviour

Every LLM-driven feature defaults **OFF** and silently degrades to a rule-based path;
`RLM_LLM_ENABLED=true` turns them all on. There are 11 call sites split by task shape via
a `modelRole` option in `packages/core/src/services/memory/llm-client.ts`: 8 NL-judgment
sites use `RLM_LLM_MODEL`, 3 code-oriented sites (bootstrap seed, reranker,
code-compressor) use `RLM_LLM_CODE_MODEL`. Both must be **non-thinking instruct** models —
a thinking model routes structured output into the reasoning channel and silently burns
the 90 s timeout.

### Configuration

`~/.config/massa-ai/config.json` is the runtime source; precedence is
env > `config.json` > literal defaults. Secrets including `DATABASE_URL` live there. Data
dir is `~/.config/massa-ai/data`. `.env.example` is the annotated reference for every
variable; copy it to `.env` and edit there.

### Agent-harness surface

`skills/` holds the repo-local skills (`massa-ai` router, `massa-ai-memory`,
`synapse-usage`, `persona-router`, `agents/`); `skills/AGENTS.md` is the registry for the
12 sub-agent specialists. `apps/{claude,codex,cursor,opencode}-plugin/` ship those same 12
specialists plus hooks and MCP config per host, generated by
`scripts/generate-subagent-artifacts.ts` and guarded by parity tests. Claude/Codex/Cursor
share one Bun hook binary — `apps/claude-plugin/hooks/massa-ai-hook.ts` is the real file,
Codex and Cursor symlink to it; OpenCode uses in-process handlers.
`scripts/install-skills.ts` and `scripts/install-agents.ts` are symlink-based and support
`--dry-run`, `--check`, `--uninstall`. Note the three plugin dirs are **not** workspace
packages (no `package.json`) — each ships its own `install.sh`, alongside the 42 KB root
`install.sh`.

The parity guard is `scripts/__tests__/subagent-parity.test.ts`, which no CI job runs (see
"Running tests"). Regenerate and run it by hand after touching the generator.

Installers, hooks, generated config, and symlinks are public compatibility surfaces —
treat a change to them as breaking until proven otherwise.

## CI gates

`.github/workflows/ci.yml`:

1. type-check → build → `bun run test` (with `MASSA_AI_EXECUTOR_SANDBOX=none`)
2. **CHANGELOG merge gate** — a PR that does not modify `CHANGELOG.md` fails unless it
   carries the `no-changelog` label (bots exempt). Add entries under `[Unreleased]`.
3. **Grammar verifier** — changes under `services/structural/**`,
   `prisma/migrations/**`, or `scripts/verify-tree-sitter*.ts` trigger
   `bun run verify:tree-sitter-native`.
4. Docker API/MCP image build + health + Swagger smoke — one multi-stage `Dockerfile`
   with `base` → `api` / `mcp` targets, both on `oven/bun:1.3.14-alpine`.
5. Native-structural unit tests on macos-14 arm64 (Node 22 helper) and ubuntu x64
   (Node 25.9.0) via `run-tests-isolated.ts --unit --filter='structural|parse-long…'`.

Every job runs against a real `pgvector/pgvector:pg17` service with
`DATABASE_URL=postgresql://massa_ai:massa_ai_password@localhost:5432/massa_ai`, and CI
pins npm to 11.14.1 explicitly before install.

Separate workflows: `needles-gate.yml` (retrieval floors — `bun run bench:needles:gate`,
`NEEDLE_FLOOR_HIT1=0.5 NEEDLE_FLOOR_MRR=0.65`), `publish.yml` (npm, fires on green
`main`), `skills.yml` — which only validates `SKILL.md` frontmatter, it runs no tests.

## Working conventions

- `.specs/` is the source of truth for in-flight work: `project/STATE.md`,
  `project/FEATURES.json`, `HANDOFF.md`, `features/<slug>/{spec,design,tasks,validation}.md`,
  `LESSONS.md`. Read state from these files, never from recalled memory.
- Docs are layered: `README.md` = install/integration/quick-start, `FEATURES.md` = the
  complete per-feature reference, `docs/` = per-workflow guides and ADRs. Keep each rule
  in one place and link from the others.
- `origin` is SSH (`git@github.com:luizgmassa/massa-ai.git`) — keep it SSH; HTTPS 403s
  against the wrong account.
- Version bumps go through `bun run version:sync`.
