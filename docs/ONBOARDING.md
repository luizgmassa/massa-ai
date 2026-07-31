# massa-ai — Onboarding Guide

Generated from the knowledge graph at commit `17ee7083` (`.ua/knowledge-graph.json`).
Regenerate with `/understand` then `/understand-onboard`.

> **Scope of this guide.** The knowledge graph behind it analyzed **733 of 2094 tracked
> files** — the `src/` trees of `packages/core`, `packages/shared`, and the four `apps/`
> transports. It deliberately excluded `scripts/`, `docs/`, `skills/`, `.specs/`,
> `benchmarks/`, `prisma/`, all config/manifest files, and the four generated
> `apps/*-plugin/` duplicate trees.
>
> That means this guide describes **the runtime architecture accurately and completely**,
> but says nothing about the release machinery, the agent-harness surface, the Prisma
> schema and its 24 migrations, or the installers. Several of those carry load-bearing
> traps. **Read `CLAUDE.md` and `CONTRIBUTING.md` alongside this document** — see
> [What this guide does not cover](#what-this-guide-does-not-cover) at the end.

---

## Project Overview

**massa-ai** is a local-first MCP server that indexes codebases for semantic search,
keyword search, and dependency-ranked symbol graphs, providing persistent cross-session
memory of decisions and patterns while reducing the token cost of AI-assisted coding.

Instead of loading whole files into an assistant's context, it retrieves just the relevant
symbols, references, and memories — so the assistant reads less, forgets nothing between
sessions, and costs less to run.

| | |
|---|---|
| **Language** | TypeScript (700 files), ESM strict, `module: NodeNext` |
| **Runtime** | **Bun 1.3.14** — *not* Node. Node exists only as a `node-gyp` build helper for native tree-sitter grammars. |
| **Backend** | **PostgreSQL 17 + pgvector, exclusively.** There is no SQLite path. |
| **ORM** | Prisma |
| **Embeddings** | Ollama, `qwen3-embedding:8b` (4096-dim) |
| **REST** | Elysia on :3333 — Swagger at `/swagger`, Web UI at `/ui` |
| **MCP** | stdio server exposing 52 tools |
| **Monorepo** | Turborepo; workspaces `packages/*` + `apps/*` |
| **Graph size** | 1847 nodes, 4226 edges, 9 layers |

The ~24 other languages the scanner reports (Rust, Go, Kotlin, Clojure, Zig, …) are
**single-file tree-sitter grammar test fixtures** under `packages/core/src/__tests__`.
They are not product code.

### The one asymmetry to internalize first

`packages/core` **is** the whole product. Everything under `apps/` is a transport or an
install surface. When you are looking for behavior, look in `packages/core`; when you are
looking for how that behavior is *exposed*, look in `apps/`.

---

## Architecture Layers

Nine layers. The first four are `packages/core`'s internal decomposition and are
**enforced by directory** — the repo states this contract in `packages/core/src/index.ts`
and means it.

```
                    ┌─────────────────┐   ┌──────────────────┐
                    │ REST Transport  │   │  MCP Transport   │
                    │ apps/tools-api  │   │ apps/mcp-client  │
                    │      (26)       │   │       (15)       │
                    └────────┬────────┘   └────────┬─────────┘
                             └──────────┬──────────┘
                                        ▼
   ╔════════════════════════════ packages/core ════════════════════════════╗
   ║   tools/  (31)        thin MCP handlers — schema + delegation only    ║
   ║      ▼                                                                ║
   ║   controllers/ (6)    orchestration — composes services, side-effects ║
   ║      ▼                                                                ║
   ║   services/ (208)     domain logic — the bulk of the product          ║
   ║      ▼                                                                ║
   ║   data/    (49)       PostgreSQL repositories, vector store, FTS      ║
   ╚═══════════════════════════════════════════════════════════════════════╝
                                        ▲
              packages/shared (18) ─────┘   logger, config, env, types
```

| Layer | Files | What belongs here |
|---|---:|---|
| **Tool Handlers** (`core/src/tools/`) | 31 | One file per MCP tool. Deliberately thin: parse input, delegate, serialize output, **no business logic**. This discipline is what lets two very different transports expose one tool contract without duplicating logic. |
| **Controllers** (`core/src/controllers/`) | 6 | Orchestration. Composes multiple services and owns side-effects. An *internal* orchestration layer — not an HTTP API layer, despite the name. |
| **Service** (`core/src/services/`) | 208 | The dominant domain-logic layer: search, synapse, embeddings, graph, structural, memory, jobs, etl, scheduler, symbol, project-identity, hooks, executor, checkpoint, cache, web, workspace, metrics, handoff, events. Highest internal cohesion in the codebase. |
| **Data** (`core/src/data/`, `core/src/models/`) | 49 | PostgreSQL/pgvector persistence — repositories, vector store, FTS — plus data-model types and the core barrel that declares the four-layer contract. |
| **Test** (everywhere) | 371 | All test files. Kept as one cross-cutting layer because core's dominant test tree is **flat and unmirrored** (see below). |
| **Shared Utility** (`packages/shared/src/`) | 18 | Cross-cutting logger, runtime config loader, env handling, shared types. Consumed by core *and* every transport. |
| **REST API Transport** (`apps/tools-api/src/`) | 26 | Elysia server on :3333 — routes, middleware, startup/health wiring. Mounts the Web UI at `/ui`. |
| **MCP Stdio Transport** (`apps/mcp-client/src/`) | 15 | MCP stdio server, 52 tools, tool-def JSON Schemas, and the dual-client contract. |
| **Auxiliary App Surfaces** | 9 | `apps/web-ui` static dashboard + `apps/opencode-plugin` in-process handlers. |

---

## Key Concepts

These are the patterns that recur. Learn them once and large parts of the codebase become
predictable.

### 1. Two transports, one contract

`apps/tools-api` (REST) and `apps/mcp-client` (MCP stdio) are both thin wrappers over
`packages/core`. Inside `mcp-client`, `call-tool-proxy.ts` translates an MCP CallTool
request into an HTTP-shaped call — and there are **two interchangeable implementations**
behind the same `ToolProxyApiClient` interface:

- `api-client.ts` — real HTTP to the tools-api server
- `embedded-api-client.ts` — dispatches directly to core in-process (`MASSA_AI_EMBEDDED=true`)

Their endpoint maps being identical is a **tested contract**, not a convention. This is the
Adapter pattern doing real work: the proxy never knows whether a call crosses a socket.

> ⚠️ **Adding or changing a tool means touching three places**: the `tool-defs` schema, the
> tools-api route, and the embedded mapping. Miss one and parity breaks.

### 2. Everything LLM defaults OFF and degrades gracefully

Every LLM-driven feature falls back to a rule-based path; `MASSA_AI_LLM_ENABLED=true` turns them
all on. `llm-client.ts` is the shared gate (Ollama over an OpenAI-compatible endpoint, with
timeout enforcement and default-off gating built in). `bootstrap-service.ts`,
`handoff-service.ts`, `handoff-auto-injector.ts`, and the rerank/query-understanding
services are all instances of the same discipline.

This is a flag the system *degrades around*, not one that hides a UI element — every call
site has a deterministic non-LLM path, not an early return.

> ⚠️ Both configured models must be **non-thinking instruct** models. A thinking model
> routes structured output into the reasoning channel and silently burns the 90 s timeout.

### 3. `get*()` / `reset*()` factory singletons

Repositories and services are reached through `get*()` factory functions with matching
`reset*()` for tests. A `getXStore()` / `getXRepository()` call is a strong dependency
signal. **This pairing is why many tests need isolated processes** — see the testing note
below.

### 4. Blue-green generations for the symbol graph

The ETL run does not mutate the symbol graph in place. It builds a new versioned
*generation*, lease-locked against concurrent writers, activated only once complete —
blue-green deployment applied to a database table. Readers never see a half-indexed graph.
See `graph-generation-coordinator.ts` and `symbol-repo-generation.ts`.

### 5. Facade-plus-capability-modules

`ContextualSearchRLM` is the busiest file in the service layer. Rather than let one class
grow unbounded, its methods were extracted into capability modules — `result-fusion.ts`,
`graph-stream.ts`, `session-bias.ts`, `hybrid-search.ts`, `project-indexer.ts` and
`index-admin.ts` — as plain functions taking a **narrow deps record** as their first
parameter: `doThing(deps, args)`, not `doThing(rlm, args)`. Passing the facade itself hands
every module the whole class back, which is the coupling the split exists to remove. The
public API is preserved; the class stays as the composition root that assembles the records.

Assemble a record **per call**, from whatever the fields hold right now. Hoisting it to a
constructor-time capture compiles, type-checks and passes the whole suite, while the ~80 test
sites that stub facade state *after* construction go on passing against the real collaborator.
The `*-late-bind.test.ts` suites exist to catch exactly that.

### 6. Stdout belongs to the protocol

`packages/shared/src/utils/logger.ts` routes **every** log level to stderr on purpose. A
stdio MCP server whose stdout carries anything but JSON-RPC dies with
`connection closed: initialize response`. A single `logger.info()` reaching stdout is
enough to break it. Guarded by `mcp-stdout-clean.test.ts`.

### 7. Barrel files distort the dependency graph

ESM strict + `module: NodeNext` means relative specifiers carry a `.js` suffix even in
`.ts` sources. Barrel `index.ts` files are common — and because a re-export
(`export * from`) is not a value import, static analysis does not trace through it. Several
clearly-central barrels show as graph orphans. **Do not read that isolation as dead code.**

---

## Guided Tour

Thirteen steps, ordered the way a request actually flows. Each names the files to open.

| # | Step | Start here |
|---|---|---|
| 1 | **The Core Package Contract** — the product's own statement of its architecture; re-exports the four enforced layers as one import surface. Read first. | `packages/core/src/index.ts` |
| 2 | **Tool Handlers** — 31 thin files, one per MCP tool. `search_project.ts` is representative: call the controller, serialize, done. | `tools/index.ts`, `tools/search_project.ts` |
| 3 | **Controllers** — six orchestrators. `search-controller.ts` shows what orchestration means: admission preflight, optional auto-reindex, glob filtering, centrality boosting, optional LLM rerank. | `services/search/search-controller.ts` |
| 4 | **The Search Facade** — hybrid vector + Postgres FTS with reciprocal-rank fusion. A composition root plus six capability modules, each taking a narrow deps record rather than the facade. | `services/search/contextual-search-rlm.ts` + `hybrid-search.ts`, `project-indexer.ts`, `index-admin.ts`, `session-bias.ts`, `graph-stream.ts`, `result-fusion.ts` |
| 5 | **The ETL Indexing Pipeline** — `discover → parse → resolve → load`. Hash-skip unchanged files, tree-sitter parse, resolve FQNs, persist in per-batch transactions with deadlock retry. | `services/etl/pipeline.ts`, `stages/*.ts` |
| 6 | **Symbol Graph & Blue-Green Generations** — go-to-definition, find-references, project map; generations flipped atomically. | `services/symbol/symbol-graph.service.ts`, `etl/graph-generation-coordinator.ts` |
| 7 | **The PostgreSQL Data Layer** — the lazily-created `pg` pool and the Prisma singleton everything funnels through, plus the typed event bus. | `kernel/db-connection.ts`, `kernel/prisma-client.ts`, `services/events/event-bus.ts` |
| 8 | **Synapse: Cross-Session Memory** — ~28 service files for scoring, inhibition, plasticity, metacognition, prefetch. Session state in Postgres with an in-memory mirror; working-memory buffer matches queries by Jaccard overlap. | `services/synapse/{index,types}.ts`, `session/session-store-pg.ts` |
| 9 | **Graceful Degradation for LLM Features** — the shared client and three concrete instances of the fallback pattern. | `services/memory/llm-client.ts`, `bootstrap/`, `handoff/` |
| 10 | **Shared Utilities** — the seam between core and its consumers; `env.ts` runs at startup for every entry point. | `packages/shared/src/{index,env}.ts` |
| 11 | **REST API Transport** — highest fan-out entry point in the codebase: 18 routes + 3 middleware + startup validation, then bind :3333. | `apps/tools-api/src/index.ts` |
| 12 | **MCP Transport & the Two-Client Contract** — the primary way users consume massa-ai; the Adapter pattern in concept #1. | `apps/mcp-client/src/{index,call-tool-proxy,api-client,embedded-api-client}.ts` |
| 13 | **Declaring Tools as JSON Schema** — per-domain modules concatenated into one test-pinned ordered array. Closes the loop back to step 2. | `apps/mcp-client/src/tool-definitions.ts`, `tool-defs/*.ts` |

---

## File Map

Key files per layer, ranked by coupling (in + out dependency edges).

### Tool Handlers

| Deg | File | Role |
|---:|---|---|
| 31 | `tools/serialize.ts` | Shared success-path serializer — field projection, TOON/JSON/tree encoding |
| 21 | `kernel/enum-validation.ts` | `validateEnum` + `ToolError`; replaces silent-fallback branches across nearly every handler |
| 13 | `tools/index_project.ts` | Validates/canonicalizes target path, guards concurrent roots, kicks off indexing |
| 12 | `tools/read_file.ts` | Compression, caching, symbol enrichment, multi-range selection, path safety |
| 11 | `tools/trace_path.ts` | Traces the typed structural-edge graph from a seed symbol |
| 10 | `tools/search_project.ts` | The canonical thin handler — delegate + serialize |

### Controllers

| Deg | File | Role |
|---:|---|---|
| 29 | `services/memory/memory-controller.ts` | Composes memory repo, MemoryService, MemoryGraphService, salience judging, consolidation |
| 20 | `services/search/search-controller.ts` | Admission preflight, auto-reindex, glob filter, centrality boost, LLM rerank |
| 15 | `services/context/context-controller.ts` | The "optimized context" use case — composes search, memory, compression, file cache |
| 10 | `services/executor/executor-controller.ts` | Owns the singleton PolyglotExecutor for execute/execute_file/batch_execute |
| 8 | `controllers/graph-controller.ts` | Fronts symbol-graph traversal (trace_path, impact_analysis) |

### Service (largest layer — top by coupling)

| Deg | File | Role |
|---:|---|---|
| 72 | `services/search/contextual-search-rlm.ts` | Central hybrid-search facade (vector + keyword, RRF); indexing, caching, Synapse integration |
| 68 | `kernel/prisma-client.ts` | Lazily-constructed Prisma singleton — **the most depended-upon file in the codebase** |
| 39 | `services/symbol/symbol-graph.service.ts` | Code navigation API: definitions, references, dependencies, project map |
| 38 | `services/etl/pipeline.ts` | Singleton orchestrator for the 4-stage pipeline |
| 38 | `services/events/event-bus.ts` | Typed EventEmitter singleton; decouples ETL writers from hooks/jobs/SSE listeners |
| 26 | `services/structural/query-pack.ts` | One structural parse of one file → imports, symbols, call edges, syntax edges |
| 24 | `services/memory/llm-client.ts` | Shared Ollama client with timeout enforcement and default-off gating |

### Data

| Deg | File | Role |
|---:|---|---|
| 62 | `data/symbol/symbol-repository-pg.ts` | Singleton facade — thin delegates to the graph/queries/generation modules |
| 31 | `data/symbol/symbol-repo-generation.ts` | Lease-ownership locking + transactional generation writes |
| 31 | `data/symbol/symbol-repo-queries.ts` | Workspace/file/definition/reference/import/centrality CRUD |
| 27 | `data/symbol/symbol-repository-factory.ts` | Singleton factory; guards on a configured Postgres `DATABASE_URL` |
| 21 | `data/symbol/symbol-repo-graph.ts` | Project map snapshots, BFS impact analysis, edge search, FQN resolution |

### Kernel

Cross-cutting leaves. A file here imports from no tier, which is what makes membership
checkable by path prefix rather than by a maintained list.

| Deg | File | Role |
|---:|---|---|
| 31 | `kernel/alias-resolver.ts` | Canonical project-ID resolution for write paths the DB trigger cannot rewrite |
| 18 | `kernel/db-connection.ts` | Shared `pg` pool sized from `DB_POOL_SIZE` |

### Shared Utility

| Deg | File | Role |
|---:|---|---|
| 9 | `shared/src/config/index.ts` | `ServerConfig` shape + central `Config` manager |
| 9 | `shared/src/utils/logger.ts` | Structured logger — **stderr only**, keeping stdout clean for MCP |
| 6 | `shared/src/config/config-loader.ts` | Reads/merges/persists `~/.config/massa-ai/config.json` |
| 5 | `shared/src/utils/rate-limiter.ts` | Token-bucket + combined request/token `SmartRateLimiter` |

### REST API Transport

| Deg | File | Role |
|---:|---|---|
| 26 | `tools-api/src/index.ts` | Bootstraps Elysia, wires 18 routes + 3 middleware, Swagger, binds :3333 |
| 6 | `tools-api/src/routes/project.ts` | Project lifecycle: list, async index, reset with audit logging |
| 5 | `tools-api/src/routes/handoff.ts` | Cross-session handoffs (begin/accept/cancel/list) |
| 4 | `tools-api/src/middleware/auth.ts` | Validates `x-api-key`, exempting `/health` and `/swagger` |
| 4 | `tools-api/src/routes/workspace.ts` | Largest route module — workspace CRUD + full symbol-graph surface |

### MCP Stdio Transport

| Deg | File | Role |
|---:|---|---|
| 22 | `mcp-client/src/tool-definitions.ts` | Concatenates per-domain tool-defs in fixed, test-pinned order |
| 15 | `mcp-client/src/index.ts` | Wires MCP SDK handlers for `tools/list` and `tools/call` |
| 11 | `mcp-client/src/call-tool-proxy.ts` | MCP CallTool → HTTP-shaped call via endpoint-template substitution |
| 10 | `mcp-client/src/api-client.ts` | HTTP client with retries, backoff, AbortController timeouts |
| 8 | `mcp-client/src/embedded-api-client.ts` | In-process implementation of the same interface |
| 4 | `mcp-client/src/moonshot-flavor.ts` | Strips root-level JSON Schema combinators for Moonshot compatibility |

---

## Complexity Hotspots

Files that are **both** rated `complex` **and** heavily coupled. Approach these carefully —
a change here propagates. (251 of 733 files are rated `complex`; these are the ones where
that rating meets high fan-in/fan-out.)

| Edges | File | Why it's dense |
|---:|---|---|
| **72** | `services/search/contextual-search-rlm.ts` | Highest total coupling in the codebase (25 in / 47 out). The search facade — already split into 5 files and still the busiest. |
| **62** | `data/symbol/symbol-repository-pg.ts` | 46 outgoing. Facade over graph/queries/generation modules. |
| **39** | `services/symbol/symbol-graph.service.ts` | The navigation API everything calls for definitions and references. |
| **38** | `services/etl/pipeline.ts` | Third-highest fan-out; coordinates all four stages. |
| **31** | `data/symbol/symbol-repo-generation.ts` | Lease locking + transactional writes. Concurrency-sensitive. |
| **31** | `data/symbol/symbol-repo-queries.ts` | Broad CRUD surface. |
| **31** | `tools/serialize.ts` | Touched by nearly every tool handler — a bug here surfaces everywhere. |
| **29** | `services/memory/memory-controller.ts` | Composes five subsystems. |
| **26** | `apps/tools-api/src/index.ts` | Highest fan-out of any entry point; 26 one-hop dependencies. |
| **24** | `services/memory/llm-client.ts` | The single gate all 11 LLM call sites pass through. |

**Highest-blast-radius files** (change these and everything downstream feels it):

1. `kernel/prisma-client.ts` — **68 incoming**. Every repository funnels through it.
2. `services/events/event-bus.ts` — **38 incoming**. Decouples writers from listeners.
3. `kernel/alias-resolver.ts` — **30 incoming**.
4. `tools/serialize.ts` — **30 incoming**. Every tool response.

---

## What this guide does not cover

The knowledge graph scoped to `src/` trees only. These areas are **absent from the analysis
above** and several contain traps that will bite you. Read the named sources.

| Area | Where to read | Why it matters |
|---|---|---|
| **Test running** | `CLAUDE.md` § Running tests | `bun run test` is **not** the whole suite. Three packages use `scripts/run-tests-isolated.ts`, which forks a process per file matching `mock.module(`, `PrismaClient(`, `eventBus`, `reset*ForTesting(`, etc. Running plain `bun test` over a directory **cross-contaminates state and produces false failures.** There's also a global 5 s per-test timeout — a 5001 ms failure is load, not logic. |
| **Prisma schema + 24 migrations** | `packages/core/prisma/` | The entire persistence schema. Excluded from the graph. |
| **Release chain** | `CLAUDE.md` § Releasing, `CONTRIBUTING.md` | Fully automatic and full of load-bearing traps — never write the skip-ci marker literally in a commit body; cross-package `@massa-ai/*` deps are `workspace:*` or the exact root version; the bump commit needs a deploy key. |
| **CHANGELOG gate** | `CONTRIBUTING.md` § CHANGELOG authoring | A PR that doesn't touch `CHANGELOG.md` **fails CI** without the `no-changelog` label. |
| **Agent-harness surface** | `skills/AGENTS.md`, `CLAUDE.md` | 17 sub-agent specialists, 4 plugin hosts, generated artifacts with parity tests. `apps/*-plugin/skills/` are byte-identical generated copies — never edit them directly, edit `skills/` and regenerate. |
| **Installers** | `scripts/install-{skills,agents,harness}.sh` | Bash, not TypeScript. `install-agents.sh` is the **only** writer of host MCP config. |
| **Build/CI config** | `turbo.json`, `.github/workflows/` | Any env var a test reads must be in `turbo.json` → `tasks.test.passThroughEnv` or it arrives `undefined` under `bun run test`. |
| **`.specs/`** | `.specs/project/STATE.md`, `HANDOFF.md` | The source of truth for in-flight work. |

### Getting set up

```bash
bun install                            # workspace install
docker compose up -d postgres          # pgvector/pgvector:pg17 on :5432
cd packages/core && bunx prisma migrate deploy
bun run diagnose                       # validates Ollama, DB, embeddings, migrations
bun run dev:api                        # REST on :3333, Web UI at /ui
bun run dev:mcp                        # MCP stdio server
```

Or the full offline wizard: `bash scripts/setup-local-first.sh`.

Note: `bun run lint` runs **oxlint** over the whole repo (`correctness` rules at `error`,
config in `.oxlintrc.json`). It is a real gate and CI enforces it. `bun run lint:fix`
applies only the fixes oxlint documents as safe.
