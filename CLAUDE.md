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
  schema and migrations live in `packages/core/prisma/` (23 migrations — 23 `migration.sql`
  directories; the 24th tracked entry under `migrations/` is `migration_lock.toml`, the lock
  file, not a migration).
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
bun run build                  # turbo build — 6 packages (core, shared, tools-api, mcp-client, opencode-plugin, web-ui)
bun run type-check             # turbo tsc --noEmit — 4 packages (see below)
bun run test                   # turbo test — 6 packages; does NOT cover scripts/ (see below)
bun run test:scripts           # root-level suites outside the workspace globs
bun run diagnose               # validates Ollama, DB, embeddings, migration status
bun run dev:api                # REST API :3333 with hot reload; also serves Web UI at /ui
bun run dev:mcp                # MCP server (stdio) with watch
cd packages/core && bunx prisma migrate deploy
```

`bun run lint` is **oxlint** (pinned exact, root devDependency), configured by
`.oxlintrc.json`: the `correctness` category at `error`, every other category off. It is a
real gate — CI's `build` job runs it and it exits non-zero on a violation.

It runs **once from the repo root**, not through turbo. Turbo only dispatches tasks to
workspace packages (`packages/*`, `apps/*`), so a per-package `lint` task could never reach
`scripts/` or `benchmarks/` — neither is a workspace package, and they held 21 of the
violations found on adoption. `turbo.json` no longer declares a `lint` task at all.

Two consequences worth knowing. `oxlint --quiet` reports only errors, and it surfaces oxc
**semantic** errors (duplicate declarations and the like) that no rule severity can silence
— that is how the duplicate `AttributionResolverLike` import in `hook-service.test.ts` was
found, which `tsc` structurally could not see because `packages/core/tsconfig.json` excludes
`src/__tests__`. And `--fix` is safe, while `--fix-suggestions` / `--fix-dangerously` are
documented as behavior-changing; only `--fix` is wired into `bun run lint:fix`.

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
runners are now **thin per-package wrappers** (121 / 30 / 46 lines, `wc -l` at HEAD) over
the shared `scripts/lib/run-tests-isolated.ts` (373 lines), which owns discovery, process
forking, and result aggregation; each wrapper supplies only its package's classification
rules and CLI surface. The table below is core's classification set, the richest.
`packages/shared` and `apps/opencode-plugin` do run plain `bun test`.

The runner scans test *source* and forks a dedicated child process for any file it
classifies as needing isolation:

| Detected pattern | Reason |
|---|---|
| `mock.module(` | module mock |
| `integration/` dir, `*.e2e.test.ts`, `DATABASE_URL`, `PrismaClient(`, `Postgres*Repository`, `EtlPipeline`, `get{Graph,Memory,Vector,…}Store(` | database/integration |
| `eventBus`, `useFakeTimers`, `setSystemTime`, `_set*ForTesting(`, `process.env.X =` | process-global state |

Consequence: running `bun test` over a whole directory cross-contaminates module and
process state and will produce false failures. Use the runner, or target one file.

**Provisioning a fresh worktree: `bun install` can silently skip the native grammars.** On
macOS arm64 with the pinned Node 25 as the build helper, node-gyp fails (the documented clang
break above) while **`bun install` still exits 0** — no `node_modules/tree-sitter*/build/`
directories exist, and the first `test:scripts` run fails exactly 3 "native Tree-sitter
package contract" suites with `No native build was found for platform=… runtime=node`. That
signature means provisioning, not code. Two repairs: copy the `node_modules/tree-sitter*/build/`
directories from any provisioned checkout of the same lockfile (the addon is N-API —
position-independent between identical dependency trees), or re-run the install with a Node 22
helper. Verify with `bun test ./scripts/tests/verify-tree-sitter-grammars.test.ts` → 9 pass.
Measured 2026-08-03: fresh worktree red 1227/3 → addon copy → 9/0 and the full run green.

**`bun run test` is not the whole suite.** Turbo only reaches packages under
`packages/*` / `apps/*` that declare a `test` script. Root-level suites live outside those
globs and run from a separate script:

```bash
bun run test:scripts   # scripts/__tests__ + scripts/tests (1230 TS tests across 55 files + 21 shell suites)
```

That covers `scripts/__tests__/subagent-parity.test.ts`, the guard for the generated
Claude/Codex/Cursor/OpenCode plugin artifacts. Run it after touching
`generate-subagent-artifacts.ts`. `scripts/run-deterministic.ts` only scans
`packages/core/src/__tests__` — it is a core gate, not a repo-wide one.

`bunfig.toml` sets a global **5 s per-test timeout**. Coverage is no longer on by default —
it is the explicit `bun run test:coverage` gate (DEBT-02). A test doing real indexing,
embedding, or a cold native compile needs an explicit longer budget, passed as the third
arg to `test()` — the established idiom here is `}, 60_000);` or `}, 30_000);` (see
`architecture-map.test.ts`, `vector-store-factory.test.ts`). Raise the per-test value,
never the global one; the 5 s default is what keeps real hangs visible.

**A 5001 ms failure is not automatically a load problem.** That was the standing advice and
it was wrong at least as often as it was right. The commoner cause is that the test reached
a **live LLM or embedding provider**, because the config layer reads the developer's own
`~/.config/massa-ai/config.json` — and on a machine with a local Ollama, `llm.enabled` is
`true` there. Measured on `CodeCompressor`: **42030 ms on a cold model load, 690 ms warm**.
That is exactly why it looks like flakiness — it passes on a warm model and hangs on a cold
one — and why **CI never sees it**, since CI has no config file and every LLM feature
defaults off.

Before reaching for a bigger budget, re-run with an empty config dir:

```bash
XDG_CONFIG_HOME=$(mktemp -d) bun test <file>
```

If that fixes it, the test is missing a seam, not a timeout. Pin `_setLlmEnabledForTesting(false)`,
inject the subject's own LLM seam, or add the `mock.module` the file is missing — the recurring
omission is `../services/vector/vector-store-factory.js`, without which `ensureInitialized`
reaches the real factory and runs live embedding-provider auto-selection. `dart-support`,
`code-compressor` and `search-facade-admin` were all this, and were fixed rather than budgeted.

**PR-C narrowed that failure mode rather than only moving its path.** A `BaseVectorStore`
built without an `embeddingProviderFactory` now **throws** instead of quietly auto-selecting a
live provider — the factory above is the only production construction site, and it is the only
thing that injects one. So a test that constructs a store directly and embeds fails loudly and
immediately rather than hanging on a cold model. Mocking the factory module is still the right
seam when the subject calls `getVectorStore()`; passing `embeddingProviderFactory` explicitly is
the right seam when it constructs a store itself.

Genuinely slow tests are a separate class and do get budgets: `etl-cache-invalidation` measures
**66 s** under `--coverage` instrumentation, and `architecture-map`'s `getProjectMap` cases need
a budget that tracks accumulated shared test-database state rather than the fixture — the
same file measures 1213 ms against a fresh database and over 120 s partway through the gate.
Note the isolation runner is **sequential**, one child process at a time, so a slow suite
inside it is accumulation, not contention. The former known outstanding case — `mcp-client`
`embedded-api-client-endpoints.test.ts` failing at 5001 ms under a real user config — is
closed, and its post-mortem is worth the paragraph: the standing diagnosis blamed the
unexported LLM seam, but the failing `/search/project` + `/search/code` cases reach **live
embedding-provider auto-selection** through `ensureInitialized` → `getVectorStore()`
unconditionally — a second mechanism `MASSA_AI_LLM_ENABLED` never gated. The suite now sets a
scratch `XDG_CONFIG_HOME` **before any core-reaching import** (static imports hoist, so the
core imports are dynamic — the m25-m26 pattern) and pins `_setLlmEnabledForTesting(false)` as
the env-path second gate, exactly mirroring what `buildChildEnv` (SEN-03) gives every wrapper
child. Both seams are exported from `@massa-ai/core` for any `apps/` suite that needs the
same treatment. Direct runs went 93/2-cold → 95/0 in ~5.8 s. When a suite fails only under a
real config, trace the call graph before trusting a prior triage's named mechanism — two
independent gates can look like one blocker from the symptom alone.

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
`MASSA_AI_*` knob means editing that list too. There is exactly one env prefix in this
project (**AD-010**), and all ten `MASSA_AI_LLM_*` vars are now listed — six of them were
absent before that decision, so they arrived `undefined` under `bun run test` while
appearing to work under a direct `bun test`. `scripts/__tests__/turbo-passthrough-env.test.ts`
mechanizes the "editing that list too" rule for every `MASSA_AI_*` var read via a literal
`process.env` accessor anywhere in `packages/`+`apps/`, failing with the missing names
whenever the read-set and the allowlist diverge.

## Architecture

`packages/core` is the whole product; everything in `apps/` is a transport or an install
surface. Core is four layers, stated in `packages/core/src/index.ts` and enforced by
directory — `scripts/check-core-layering.ts`, which fails the build rather than reporting:

```
tools/        thin MCP handlers — schema + delegation, no logic
services/     domain logic AND orchestration — search, synapse, embeddings, graph,
              structural, memory, jobs, executor, context
data/         persistence — PostgreSQL repositories, vector store, FTS, migrations
kernel/       cross-cutting leaves — any tier may import kernel; kernel imports no tier
```

Imports run one way, `tools → services → data`, so **`data → services` is a violation, not
a shortcut**. `kernel/` is the answer to "this module is needed by two tiers": it is joined
by `git mv`, membership being the path prefix `packages/core/src/kernel/`, and **there is no
allowlist** — an allowlisted exception is indistinguishable from a new violation, which is
the property the tier exists to preserve. It holds 11 modules.

**`controllers/` was a fifth layer and is retired.** The five orchestrators moved into the
`services/` subdirectory that already held their collaborators — `services/{memory,search,
context,executor,symbol}/` — keeping their exported symbol names, and `@massa-ai/core`
re-exports them through `./services/index.js`. The published `@massa-ai/core/controllers`
subpath is gone; `./services` gained the 17 symbols it used to carry. Naming is a trap
for a newcomer here, and the trap is **three** directories: `services/memory-graph/` is the
**memory-relation** graph; the **symbol** graph and the controller fronting it live in
`services/symbol/`; and the symbol **repository** is `data/symbol/`, the one that has already
produced a real path error in in-repo specs (a spec cited
`services/symbol/symbol-repository-pg.ts`; the file lives under `data/`).

This section and `packages/core/src/index.ts`'s header are the only two descriptions of
this contract. Do not add a third — `docs/ONBOARDING.md` cites them rather than restating.

Repositories and services are reached through `get*()` factory functions with matching
`reset*()` for tests (that `reset*` pairing is why those tests get isolated processes).

### Two transports, one contract

- `apps/tools-api` — Elysia REST on :3333, routes in `src/routes/*.ts`, Swagger at
  `/swagger`, Web UI mounted at `/ui`. Route files sit beside their own `*.test.ts`.

  **Auth is mandatory (AD-011).** Every route outside `PUBLIC_PATHS` (`/health`,
  `/swagger`, `/swagger/json`, `/ui`, `/ui/`) needs `x-api-key`; the old no-key
  pass-through is deleted and is not configurable. The key is resolved by an explicit
  `initAuth()` called **only from `index.ts`** — never at module-import time, because
  `CONFIG_DIR` is a module-level const and an import-time resolve would provision a key
  into the real `~/.config` of every developer and CI runner running `bun test`. Use
  `__setAuthKeyForTests()` in tests. Two further traps: Elysia runs `onBeforeHandle`
  *after* route matching, so an unregistered path 404s before auth is consulted and a
  "this path must 401" test proves nothing unless a real route is registered; and HTTP
  strips whitespace from header values, so a `"   "` key arrives as `""`.

- `apps/mcp-client` — MCP stdio server exposing 59 tools. Tool schemas are plain
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
`MASSA_AI_LLM_ENABLED=true` turns them all on. There are 10 call sites split by task shape
via a `modelRole` option in `packages/core/src/services/memory/llm-client.ts`: 7 NL-judgment
sites use `MASSA_AI_LLM_MODEL`, 3 code-oriented sites (bootstrap seed, reranker,
code-compressor) use `MASSA_AI_LLM_CODE_MODEL`. Both must be **non-thinking instruct** models —
a thinking model routes structured output into the reasoning channel and silently burns
the 90 s timeout.

### Configuration

`~/.config/massa-ai/config.json` is the runtime source; precedence is
env > `config.json` > literal defaults. Secrets including `DATABASE_URL` live there. Data
dir is `~/.config/massa-ai/data`. `.env.example` is the annotated reference for every
variable; copy it to `.env` and edit there.

### Agent-harness surface

`skills/` holds the repo-local skills (`massa-ai` router, `persona-router`, `agents/`);
`skills/AGENTS.md` is the registry for the 18 sub-agent specialists **and** the single
source of the Persona Router / Plan Challenge / Conversation Feedback policies (the
`<!-- massa-ai:bootstrap -->` block the installer copies to `<host>/AGENTS.md`). MCP tool
contracts and the Synapse lifecycle live in `skills/massa-ai/references/mcp-tools.md` and
`references/synapse-policy.md` — the former standalone `massa-ai-memory` and
`synapse-usage` skills were folded into those two references and deleted. `apps/{claude,codex,cursor,opencode}-plugin/` ship those same 18
specialists plus hooks per host, generated by
`scripts/generate-subagent-artifacts.ts` and guarded by parity tests. Claude/Codex/Cursor
share one Bun hook binary — `apps/claude-plugin/hooks/massa-ai-hook.ts` is the real file;
Codex and Cursor each ship a real, generated copy at `hooks/massa-ai-hook` (not a
symlink — `npm pack` silently drops symlink entries, so a symlinked hook binary would
have shipped absent from every published tarball). OpenCode uses in-process handlers.

**Sub-agent tool gating diverges by host — only Claude needed a fix.** Claude's `tools:`
field is an allowlist, so a generated sub-agent that carried one could reach no MCP tool
the parent session had active: Claude's own docs state an allowlisted subagent "can't edit
files, write files, or use any MCP tools." `emitClaude` therefore stopped emitting `tools:`
for ordinary charters and gates them with `disallowedTools: Write, Edit, NotebookEdit`
instead — a denylist, which Claude documents as leaving the rest of the pool, MCP included,
intact ("keeps Bash, MCP tools, and the rest of its pool"). Write charters get neither key.
`navigator` is the deliberate allowlist exception (`AGENT_TOOLS_OVERRIDE`): it keeps
`tools: ["mcp__massa-ai__*","Read","Grep","Glob","Bash(pwd)"]` on purpose, so it stays
index-first instead of widening to every MCP server on the machine. The other three hosts
have no allowlist to maintain: Cursor inherits all tools including MCP with no `tools` key
at all (permission is `readonly: true`, a different mechanism); Codex has no `tools` key at
any layer and gates via `sandbox_mode`; OpenCode's `tools` key is deprecated in favor of a
`permission` wildcard map, and the emitter writes only `edit`/`bash` keys, denying no MCP
pattern. The per-host mechanism and its verbatim citation live in
`scripts/lib/host-capabilities.ts`'s `toolGating` field; the full evidence is in
`.specs/features/subagent-tool-inheritance/spec.md`.

**`skills/model-profiles.json` is the only hand-authored place that names a model or an
effort level for any agent on any host.** Resolution is `charter metadata.model_tier` +
host + profile → `{model, effort}`, done at build time by `scripts/lib/model-profiles.ts`
and rendered into each host's own syntax by the emitters; the registry holds **no agent
list**, so adding a specialist is one new charter directory. Profile selection is
`--profile=<name>` > `MASSA_AI_MODEL_PROFILE` > registry `hostDefaults[host]`, with no
rank 4 — an unknown name at any rank throws rather than shipping a default, and
`validateRegistry` reports every violation in one throw. Adding a `MASSA_AI_*` knob here
means editing `turbo.json` → `tasks.test.passThroughEnv` too (AD-010). Four traps:
Cursor's frontmatter schema is exactly `name`/`description`/`model`/`readonly`/
`is_background`, so `tools` and `reasoningEffort` there are inert; OpenCode forwards
**unrecognized frontmatter keys to the model provider as model options**, which is why its
`massa-ai-owned: true` marker is a body comment and not `metadata:` — `config-cli.ts`
scopes `agents uninstall` by that literal substring, so deleting it orphans installed
agents; every Cursor tier resolves to `inherit` because Cursor publishes no model-ID table
(`cursor-agent models` is the only discovery path); and **`CLAUDE_CODE_SUBAGENT_MODEL` set
to a real model silently defeats every registry pin on Claude**, because it overrides both
the per-invocation `model` parameter and the subagent definition's `model` frontmatter —
set it to `inherit` to restore normal resolution. Codex's `agents.default_subagent_model`
is the opposite, a fallback the agent file wins against. `bun run verify:model-ids` probes
the installed harness CLIs and is advisory, not a CI gate — CI has no harness CLI, so it
would either fail always or pass vacuously.

**Switching an already-installed machine to a different profile is a separate,
runtime concern from the build-time registry above.** Every profile ships
pre-rendered per host (`agent-profiles/<profile>/`, sibling of `agents/`, generated
alongside the default `agents/` set); one switch engine
(`packages/shared/src/profile-switch/`) copies a chosen variant over the installed
active agent files, fronted by MCP tools (`profile_list`/`profile_set`), both
`massa-ai-config profile list|show|set` CLIs, and the Claude `skills/profile/` skill
(the OpenCode in-process `profile` tool was retired with the rest of the in-process
tool surface — AD-017; OpenCode switches via the MCP pair or its `massa-ai-config` CLI). A host session restart is always required
after a switch — no host supports per-agent runtime indirection (unchanged from the
registry's own finding); see `.specs/features/model-profile-switching/spec.md`.

`scripts/generate-skill-artifacts.ts` is the analogous generator for
`skills/massa-ai/`, `skills/persona-router/`, `skills/profile/`, and the raw
`skills/agents/<n>/SKILL.md` charters: it emits real, byte-identical files into
`apps/<host>-plugin/skills/{massa-ai,persona-router,profile,agents}/` for all four hosts (~5 MB /
580 files). These bundles, plus the generated `hooks/massa-ai-hook` copies above and
`apps/opencode-plugin/lib/opencode-config.cjs` (mirrored from
`scripts/lib/opencode-config.cjs`, D1), are **generated-on-demand, gitignored build output —
not checked in** (`.gitignore` root-precise entries; AD-016). Both generators prune each
managed root before emit, so a stale file from a deleted source cannot linger once git no
longer tracks deletions. `bun run generate:artifacts` is the single entrypoint; it runs
ahead of every consumer via Bun pre-scripts (`pretest:scripts`, `pretest:plugins`,
`pretest:coverage`, the opencode package's own `pretest`), an explicit `ci.yml`/`publish.yml`
build-job step, and a checkout-detected step in every `install.sh`. `--check` diffs full
directory inventories per managed subtree against freshly-generated output, so it catches
both a changed source file and a stale bundle entry left behind after a source deletion — a
"diff known paths" check would miss the latter. Run it after touching anything under
`skills/` or `scripts/lib/opencode-config.cjs`; CI runs it explicitly in the `build` job
(beside `verify-package-contents.ts`) and again via
`scripts/__tests__/skill-artifact-parity.test.ts` in `bun run test:scripts` — the latter's
`beforeAll` guard fails loudly, naming `bun run generate:artifacts`, if the bundles are
absent rather than failing vacuously on ENOENT.

The installers are **bash**, not TypeScript: `scripts/install-skills.sh` (real copies,
not symlinks — nothing installed depends on this repo checkout staying at the path it
was installed from; `AGENTS.md` bootstrap; `--apply/--uninstall/--dry-run/--check`),
`scripts/install-agents.sh` (MCP), and `scripts/install-harness.sh` (orchestrates both
plus the plugin bundles). They follow the plugin-installer pattern — bash orchestration
with an inline `node`/`bun` heredoc for every JSON/TOML edit; there is no `jq` in this
repo, and `exit 3` means neither runtime was on PATH. Skills have two writers per host —
`install-skills.sh` (repo checkout) and each plugin's own `install.sh` (registry
tarball) — coordinated the same way MCP registration is: `install-state.json` (v2)
records a per-host `skillsOwner: "repo" | "plugin"`, a plugin's `install.sh` installs its
bundled skills only when that field is not already `"repo"`, and an explicit repo
`--apply` always takes precedence over a prior plugin install. The harness plugin phase
is host-detected and version-gated: it installs a host's bundle only when the host's
config dir exists or its binary is on `PATH`, skips hosts already at the bundle
version, upgrades older records, never downgrades, and records each successful
install as `platforms[host].plugin = {version, installedAt}` in `install-state.json`
(a v2 extension `install-skills.sh` round-trips but never writes).

**`scripts/install-agents.sh` is the only writer of host MCP config, and it always writes
the entry for every host, including OpenCode (AD-017: plugins deliver, MCP serves tools,
hooks observe).** The plugin installers call it rather than shipping their own MCP file; a
manifest `mcp` pointer or a plugin-local `.mcp.json`/`mcp.json` would reintroduce a second
registration path. `scripts/tests/test-mcp-single-writer.sh` guards that. OpenCode used to
be the one host where the MCP write was skipped whenever `opencode.json` listed the plugin
in any accepted form — a false "redundant" premise that cost OpenCode users 40 of the 54
MCP tools, since the plugin's own in-process tool set never covered more than a subset. The
skip is removed: `apps/opencode-plugin/install.sh` now delegates registration to
`install-agents.sh --agent opencode` on every install (mirroring the Codex delegation
pattern), and its `--uninstall` path no longer calls `install-agents.sh --uninstall` —
plugin lifecycle is independent of MCP tool-surface lifecycle, so a standalone plugin
uninstall leaves the MCP entry in place (removal, if wanted:
`bash scripts/install-agents.sh --agent opencode --uninstall`). The OpenCode plugin itself
is hooks-only (`apps/opencode-plugin/src/index.ts` registers zero `tool({...})` entries —
only event handlers); see `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md`.

The registered MCP command depends on `--mcp-source` (`local` | `npx` | `auto`, default
`auto`; also read from `MASSA_AI_MCP_SOURCE`, flag wins). `setup-local-first.sh` passes
`local` (→ `bun run <repo>/apps/mcp-client/src/index.ts`); the root `install.sh` passes
`npx`. `auto` picks `local` when `apps/mcp-client/src/index.ts` exists. Two traps live
here: the package's bin is `massa-ai`, not `mcp-client`, so `-p` is mandatory or npx dies
with "could not determine executable to run" — and `bunx` accepts `-p` but has **no** `-y`.
The npx path also drags in `@massa-ai/core` and compiles native tree-sitter grammars on
first run, which outlasts any MCP host's handshake timeout, so `local` is the right default
for a checkout.

**Stdout belongs to the protocol.** `packages/shared/src/utils/logger.ts` routes every
level to stderr on purpose. A stdio MCP server whose stdout carries anything but JSON-RPC
fails with `connection closed: initialize response`; a single `logger.info()` reaching
stdout is enough. `apps/mcp-client/src/__tests__/mcp-stdout-clean.test.ts` is the guard.

Claude Code reads MCP *definitions* from `~/.claude.json`, **not** from
`~/.claude/settings.json` — that file holds only approval controls
(`allowedMcpServers`, `enabledMcpjsonServers`, `disabledMcpServers`) plus `hooks`. Entry
shape is per-host: Claude/Cursor need a **string** `command` plus an `args` array (Claude
also `type: "stdio"`); OpenCode uses array `command` + `type: "local"` + `environment`.
Do not generalise one host's shape to the others — that bug is what made Claude MCP
registration a no-op before this release.

All four plugin dirs are now workspace packages (`@massa-ai/{claude,codex,cursor,
opencode}-plugin`, all publishing to npm and GitHub Packages) — each still ships its own
`install.sh`, alongside the 42 KB root `install.sh`. The OpenCode one needs
`bun run build` first: it installs a real copy of `dist/index.js` (a symlink went dead
whenever the gitignored `dist/` vanished, and OpenCode skips an unresolvable local
plugin with no log line) and refuses to run without it; the
other three require no compilation pass before publishing — their entire publishable
surface is static source (`agents/`, `hooks/`, `skills/`, `install.sh`, `README.md`,
the dotdir manifest).
None of the three new `package.json` files declares a `test` script, deliberately: `apps/*`
is a turbo-discovered glob, so a declared `test` script would make turbo's `test` task
run the same `__tests__/` directory the root `bun run test:plugins` script already runs,
double-executing every plugin suite. Verify this stays true with
`npx turbo run test --dry-run=json` — a plugin package legitimately appears as
`"command": "<NONEXISTENT>"` there (turbo enumerates it as in-scope but has nothing to
run), and the real per-package run count is what `bun run test`'s own `Tasks: N
successful` line reports. `bun run test:plugins` (wired into the CI `build` job, not by
`bun run test`) remains the single runner for all four plugins' `__tests__/`.

The parity guard is `scripts/__tests__/subagent-parity.test.ts`, reached by
`bun run test:scripts` (which CI runs). Bundles are generated-on-demand and gitignored
(AD-016), not checked in — `bun run test:scripts`'s `pretest:scripts` regenerates them
automatically, but after touching the generator itself, run `bun run generate:artifacts`
and re-run the suite directly (`bun test scripts/__tests__/subagent-parity.test.ts`) to see
the drift check against your edit in isolation.

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

Three separate workflows sit outside `ci.yml`, plus the release pair below — five files in
`.github/workflows/` besides `ci.yml` itself.

- **`coverage.yml`** — `bun run test:coverage`, the 90%-per-file floor. No `continue-on-error`,
  on push to `main` and every PR. **Blocking takes two things, and only one of them is in this
  repository.** Omitting `continue-on-error` makes the check go red; it does not make a red check
  stop a merge. That is the `main` branch ruleset's `required_status_checks` list, a repo setting
  with no diff anywhere here. This workflow shipped claiming `BLOCKING BY DESIGN` while `coverage`
  was absent from that list, and blocked nothing until it was added. Verify the live value, and
  note the context is the **job id** (`coverage`), not the workflow `name:` (`Coverage`):

  ```bash
  gh api repos/luizgmassa/massa-ai/rules/branches/main \
    --jq '[.[] | select(.type=="required_status_checks")
           | .parameters.required_status_checks[].context]'
  ```

  Updating that ruleset goes through **PUT** (full replace) — `PATCH` on the same route returns
  **404**, not 405, which reads exactly like a missing permission and is not one. Send the whole
  object (`name`, `target`, `enforcement`, `bypass_actors`, `conditions`, `rules`) and diff before
  against after; the `DeployKey` bypass entry is what lets `release.yml` push the bump commit past
  the ruleset, so dropping it breaks releases silently.

  It is outside `ci.yml` on purpose:
  `release.yml` triggers on `workflow_run: workflows: [CI]`, keyed by workflow **name**, so a
  job added to CI would extend the chain that cuts a release. Coverage must be able to fail a
  merge without touching that chain — never rename this workflow to `CI`. Its own
  `pgvector/pgvector:pg17` service differs from every other job in three ways that
  `isDedicatedDatabase()` enforces via `/127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/`: literal
  **`127.0.0.1`** (not `localhost`), port **5433**, database **`massa_ai_test`**. It also sets
  `RUN_POSTGRES_TESTS=1` — ten-plus core suites gate on it, and without it they skip and the
  gate reports phantom below-floor files instead of the truth.
- **`needles-gate.yml`** — retrieval floors, `bun run bench:needles:gate`
  (`NEEDLE_FLOOR_HIT1=0.5 NEEDLE_FLOOR_MRR=0.65`). `workflow_dispatch`-only and
  `continue-on-error: true`; it never blocks a merge.
- **`skills.yml`** — validates `SKILL.md` frontmatter only. It runs no tests.

### Releasing and CHANGELOG authoring

**The release chain is automatic.** `release.yml` fires on a **green CI run on `main`**
and owns the whole chain; `publish.yml` is a reusable workflow (`workflow_call` +
`workflow_dispatch`, both requiring an explicit `ref`) and has no triggers of its own.

#### How to write CHANGELOG entries

`CONTRIBUTING.md` under "## CHANGELOG authoring" is the single source for the
heading→bump table and authoring rules. Read that section; do not restate it here.

#### How the release works

`scripts/release-version.ts` derives the bump from the `[Unreleased]` section of
`CHANGELOG.md`, bumps root + workspace versions via `version:sync`, promotes the
changelog section, commits `chore(release): vX.Y.Z [skip ci]`, tags it, and calls
`publish.yml` to publish to **both** npmjs.org and GitHub Packages.

Every trap below is load-bearing, not stylistic:

- **Never write the skip-ci marker literally in a commit message or PR body.** GitHub scans
  the **entire** commit message for `[skip ci]`, not just the subject line, and a squash
  merge concatenates every commit body into that message. PR #29's body *explained* the
  marker and quoted it in prose, which skipped CI on the merge commit — and with no `CI`
  run there is no `completed` `workflow_run` event, so `release.yml` never fired and
  `v1.3.0` sat underived. Nothing in CI can catch this, because CI is what got skipped.
  Call it "the skip-ci marker" in prose; the literal belongs only in the release commit
  subject and in files like this one.
- **A cross-package `@massa-ai/*` dep is either `workspace:*` or the exact root version —
  and `version:sync` owns keeping the exact ones current.** The three apps use
  `workspace:*`, which `publish.yml` rewrites to `^X.Y.Z` at publish time. `packages/core`
  instead pins `@massa-ai/shared` to the root version *exactly*, and that is a tested
  contract: `verifyStaticContract` in `scripts/verify-tree-sitter-grammars.ts` asserts
  `core.dependencies["@massa-ai/shared"] === root.version`. `version:sync` originally
  rewrote `version` fields only, so the v1.3.0 bump left that pin at `1.2.1` — the
  workspace copy stopped satisfying it, bun resolved `shared` from the **registry**, and
  `bun install --frozen-lockfile` failed with `lockfile had changes, but lockfile is
  frozen`. A successful install would have been worse: `publish.yml`'s resolve step only
  rewrites the literal `"workspace:*"`, so the published core would have depended on the
  previous release. `version-sync.ts` now realigns every non-`workspace:` `@massa-ai/*`
  spec, guarded by `scripts/__tests__/workspace-dependency-pinning.test.ts` and a
  `syncVersions` unit test. Note that bun does **not** validate `bun.lock`'s
  `workspaces[*].version` fields, so their staleness is cosmetic and never the cause —
  don't chase it.
- A tag or release created with `GITHUB_TOKEN` raises **no event**. `push: tags` and
  `release: published` triggers would be dead, which is why the chain is sequenced with
  `workflow_call` and not events. The same guard is what stops the bump commit from
  starting another CI run, and so another release.
- No job may declare `environment:` — that is what writes a GitHub *Deployment* record.
  `NPM_TOKEN` therefore has to live at **repository** scope, not environment scope.
- **The bump commit is pushed with the `release-bot` deploy key (`RELEASE_SSH_KEY`), not
  `GITHUB_TOKEN`.** The branch ruleset on `main` requires a PR + 5 checks, so
  `GITHUB_TOKEN`'s push is rejected with `GH013`. Getting through means being in the
  ruleset's bypass list, and GitHub Actions *cannot* be a bypass actor on a user-owned repo
  (`must be part of the ruleset source or owner organization`; it is also absent from the
  UI list). A deploy key can, and is the narrowest option — repo-scoped, git-only, no
  expiry. Requires `Deploy keys` in the ruleset bypass list; without it the release fails
  at "Commit, tag and push". Because a deploy-key push *does* raise events, the `[skip ci]`
  in the commit subject is load-bearing — do not remove it.

#### Recovering a half-released version

The release is two irreversible halves — tag + GitHub Release, then registry publish — and
**only the first half is idempotent-by-refusal**. If `publish` fails after the tag is
pushed, git says `vX.Y.Z` shipped while npm still serves the previous version. That is what
happened to v1.4.0 (run `30208930036`): `publish / build` died in `bun install`, so all four
publish jobs skipped.

`release.yml` cannot retry this. Re-running it hits the tag-exists guard, and it never gets
that far anyway — `[Unreleased]` was already promoted, so it derives `null` and exits at
"no releasable entry". **That message on a run whose CHANGELOG looks full usually means the
release already happened and your checkout is behind `main`, not that the gate is broken.**

Recovery goes through `publish.yml` directly:

```bash
gh workflow enable publish.yml                  # it ships disabled; workflow_call still works
gh workflow run publish.yml -f ref=vX.Y.Z
```

`workflow_dispatch` takes the workflow *file* from `main` while `inputs.ref` only drives
`actions/checkout`, so fixes to `publish.yml` apply retroactively to old tags. That property
is why the install retry in that job is an inline `run:` and **must never become a
`uses: ./.github/actions/...` composite** — a local action resolves from the checked-out
tree and would be missing on every tag older than itself.

Re-dispatching is safe: each publish step checks `npm view <pkg>@<version>` first and skips
what already landed, so a partial publish resumes instead of dying on `403
EPUBLISHCONFLICT`. Rehearse the guard against an already-complete tag (`-f ref=v1.3.1`),
where the correct outcome is one "already on npm — skipping" line per publishable package — eight
today, measured from every non-`private` `package.json`; five when v1.3.1 itself shipped — and
zero publishes.

## Working conventions

- Figures quoted as evidence follow `CONTRIBUTING.md` § "Measurement discipline" — the
  recurring measurement-defect classes and their rules live there, once.
- `.specs/` is the source of truth for in-flight work: `project/STATE.md`,
  `project/FEATURES.json`, `HANDOFF.md`, `features/<slug>/{spec,design,tasks,validation}.md`,
  `lessons.json` (the single lessons store; `lessons list` is the on-demand view). Read
  state from these files, never from recalled memory.
- Docs are layered: `README.md` = install/integration/quick-start, `FEATURES.md` = the
  complete per-feature reference, `docs/` = per-workflow guides and ADRs. Keep each rule
  in one place and link from the others.
- `origin` is SSH (`git@github.com:luizgmassa/massa-ai.git`) — keep it SSH; HTTPS 403s
  against the wrong account.
- Version bumps go through `bun run version:sync`.
