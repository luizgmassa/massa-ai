# massa-ai Cheatsheet

Quick reference for installing and driving massa-ai: the stack, the MCP tool surface,
the agent harness (skills, workflows, sub-agents), and the developer commands.

Canonical identity: npm scope `@massa-ai/*`, `projectId` `massa-ai`, env prefix
`MASSA_AI_*`, config dir `~/.config/massa-ai/`. The MCP server is registered locally
under the name `th0th` on some machines, so its tools may surface as `mcp__th0th__*`
instead of `mcp__massa-ai__*` — that prefix is a host-side registration name.

---

## 1. Install the stack

### One-line installer

```bash
curl -fsSL https://raw.githubusercontent.com/luizgmassa/massa-ai/main/install.sh | bash
```

Environment overrides (export before piping):

| Variable | Default | Meaning |
|---|---|---|
| `MASSA_AI_MODE` | `source` | `docker` \| `build` \| `source` |
| `MASSA_AI_DIR` | `~/.massa-ai` | Install directory |
| `MASSA_AI_API_PORT` | `3333` | REST API port |
| `MASSA_AI_POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_PASSWORD` | `massa_ai_password` | Database password |
| `OLLAMA_BASE_URL` | auto-detected | Ollama endpoint |
| `MASSA_AI_BRANCH` | `main` | Git branch (source/build mode) |
| `MASSA_AI_NO_START` | unset | `1` skips starting services after install |

### From source

```bash
git clone git@github.com:luizgmassa/massa-ai.git
cd massa-ai
bun install                            # Bun 1.3.14 — not Node
bash scripts/setup-local-first.sh      # Postgres + Ollama + .env wizard
bun run build
bun run start:api
```

### Database only

```bash
docker compose up -d postgres          # pgvector/pgvector:pg17 on :5432
bash scripts/setup-native-postgres.sh  # or a native install
cd packages/core && bunx prisma migrate deploy
```

### Health check

```bash
bun run diagnose                       # Ollama, DB, embeddings, migration status
```

---

## 2. Install the agent harness

One entrypoint that orchestrates skills + MCP registration + plugin bundles:

```bash
bash scripts/install-harness.sh --all
bun run install:harness                 # same thing
```

### `scripts/install-harness.sh`

| Flag | Meaning |
|---|---|
| `--all` | skills + agents (MCP) + plugins |
| `--skills` / `--agents` / `--plugins` | run only that phase |
| `--platform <p>` | limit to one host (`claude`, `codex`, `cursor`, `opencode`, `all`) — note `install-agents.sh` uses its own `--agent` names below |
| `--api-base <url>` | REST base URL written into host config |
| `--mcp-source <s>` | `local` \| `npx` \| `auto` (default `auto`) |
| `--plugin-source <s>` | where plugin bundles come from |
| `--target <dir>` | install root instead of `$HOME` |
| `--dry-run` / `--uninstall` | preview / remove |
| `--quiet` / `--verbose` / `--yes` (`-y`) / `--help` (`-h`) | |

### `scripts/install-skills.sh` — repo-local skills + `AGENTS.md` bootstrap

```bash
bun run install:skills                  # bash scripts/install-skills.sh --apply
bun run uninstall:skills
bash scripts/install-skills.sh --check --json
```

| Flag | Meaning |
|---|---|
| `--apply` | install (real copies, not symlinks) |
| `--uninstall` | remove |
| `--dry-run` | preview, verbose |
| `--check` | report drift without writing |
| `--platform <p>` / `--target <dir>` / `--repo-root <dir>` | scope |
| `--json` | machine-readable report |
| `--quiet` / `--verbose` / `--yes` (`-y`) / `--help` | |

### `scripts/install-agents.sh` — the only writer of host MCP config

```bash
bun run install:agents
bash scripts/install-agents.sh --agent opencode
bash scripts/install-agents.sh --agent opencode --uninstall
```

| Flag | Meaning |
|---|---|
| `--agent <host>` | `claude-code` \| `claude-desktop` \| `codex` \| `cursor` \| `opencode` (repeatable) |
| `--mcp-source <s>` | `local` \| `npx` \| `auto`; also `MASSA_AI_MCP_SOURCE`, flag wins |
| `--api-base <url>` / `--target <dir>` | |
| `--dry-run` / `--uninstall` / `--yes` / `--verbose` / `--quiet` / `--help` | |

Notes:

- `local` registers `bun run <repo>/apps/mcp-client/src/index.ts`. Prefer it for a
  checkout — the `npx` path compiles native tree-sitter grammars on first run and
  outlasts every MCP host's handshake timeout.
- With `npx`, `-p` is mandatory (`npx -p @massa-ai/mcp-client massa-ai`) because the
  package bin is `massa-ai`, not `mcp-client`. `bunx` accepts `-p` but has no `-y`.
- Claude Code reads MCP definitions from `~/.claude.json`, not `~/.claude/settings.json`.

### Per-host plugin installers

Each of `apps/{claude,codex,cursor,opencode}-plugin/` ships its own `install.sh`.
The OpenCode one needs `bun run build` first (it installs a real copy of `dist/index.js`
and refuses to run without it).

---

## 3. Configure — `massa-ai-config`

Installed as a bin of `@massa-ai/mcp-client` (also `@massa-ai/opencode-plugin`).

```
massa-ai-config <command> [options]
```

| Command | Options | Purpose |
|---|---|---|
| `init` | `--ollama` (default), `--mistral <key>`, `--openai <key>` | Create the config |
| `path` | | Print config file path |
| `show` | | Print current configuration |
| `set <key> <val>` | | Set one value, e.g. `set embedding.dimensions 1024` |
| `use <provider>` | `--api-key <key>`, `--model <name>`, `--base-url <url>` | Switch embedding provider |
| `recover <projectId>` | `--path <newPath>` | Re-associate an index with a moved directory (`mcp-client` bin only) |
| `agents install\|uninstall` | `--user`, `--project` | Write/remove the 18 agent files (`opencode-plugin` bin only) |
| `profile list` / `profile show` | | Shipped profiles + per-host active profile |
| `profile set <name>` | `--host <h>`, `--dry-run` | Switch installed agents to a profile |
| `bootstrap list` / `bootstrap show` | | Every startup-contract rule: state, default, description |
| `bootstrap enable <rule-id>` | `--target <dir>`, `--yes`, `--dry-run` | Turn a rule on |
| `bootstrap disable <rule-id>` | same | Turn a rule off |

Examples:

```bash
massa-ai-config init --mistral your-api-key
massa-ai-config use ollama --model qwen3-embedding:4b
massa-ai-config set embedding.dimensions 1024
massa-ai-config recover my-project --path /home/user/renamed-dir
massa-ai-config profile set work --dry-run
massa-ai-config bootstrap disable caveman
```

Precedence: env > `~/.config/massa-ai/config.json` > literal defaults. Secrets,
including `DATABASE_URL`, live in the config file. `.env.example` is the annotated
reference for every variable.

---

## 4. Model profiles

Registry: `skills/model-profiles.json` — the only hand-authored place that names a model
or effort level for any agent on any host. Resolution is
`charter metadata.model_tier` + host + profile → `{model, effort}`, at build time.

| Profile | Hosts | Tiers |
|---|---|---|
| `balanced` (host default) | claude, codex, cursor, opencode | light, standard, deep |
| `cheap` | all four | light, standard, deep |
| `heavy` | all four | light, standard, deep |
| `work` | all four | light, standard, deep |
| `home` | all four | light, standard, deep |
| `open_models` | opencode only | — |
| `local_models` | opencode only | — |

Selection: `--profile=<name>` > `MASSA_AI_MODEL_PROFILE` > `hostDefaults[host]`.
An unknown name throws rather than silently defaulting.

Three interchangeable switch surfaces — all wrap one engine
(`packages/shared/src/profile-switch/`):

```bash
massa-ai-config profile list
massa-ai-config profile set work --host claude
```

MCP tools: `profile_list`, `profile_set`. Claude skill: `/profile`.

**A host session restart is always required after a switch.** No host supports
per-agent runtime indirection.

Gotcha: `CLAUDE_CODE_SUBAGENT_MODEL` set to a real model silently defeats every
registry pin on Claude. Set it to `inherit` to restore normal resolution.

---

## 5. Bootstrap rules

Toggle blocks of the startup contract rendered into each host's `MASSA-AI.md`:

```bash
massa-ai-config bootstrap list
massa-ai-config bootstrap disable persona-router --dry-run
```

Rule ids: `caveman`, `massa-ai-router`, `persona-router`, `dedupe-guardrails`,
`plan-challenge`, `conversation-feedback`, `indexing-hygiene`, `english-code`,
`code-comments`.

The contract body lives in a per-host `MASSA-AI.md` at that host's config root
(`~/.claude/MASSA-AI.md`, `$CODEX_HOME/MASSA-AI.md`, `~/.cursor/MASSA-AI.md`,
`~/.config/opencode/MASSA-AI.md`), loaded via an `@MASSA-AI.md` block in
`~/.claude/CLAUDE.md` on Claude, a pointer block in `AGENTS.md` on Codex/Cursor,
and the `instructions` array on OpenCode. There is deliberately no `bootstrap_*`
MCP tool — the toggle has to keep working after `massa-ai-router` is disabled.
Restart the host session after a toggle.

---

## 6. MCP tools (59)

Exposed by `apps/mcp-client` over stdio; mirrored one-to-one by the REST API on :3333
and by the embedded in-process client (`MASSA_AI_EMBEDDED=true`). Schemas live in
`apps/mcp-client/src/tool-defs/tool-defs-*.ts`. Full contracts:
`skills/massa-ai/references/mcp-tools.md`.

**Search and retrieval** — `search`, `search_definitions`, `recall`, `read_file`,
`symbol_snippet`, `optimized_context`, `compress`, `compact_snapshot`

**Code intelligence** — `go_to_definition`, `get_references`, `get_architecture`,
`project_map`, `trace_path`, `impact_analysis`

**Indexing** — `index`, `reindex`, `index_status`, `fetch_and_index`, `bootstrap`

**Projects** — `list_projects`, `rename_project`, `merge_projects`, `reset_project`

**Memory** — `remember`, `memory_list`, `memory_update`, `memory_delete`

**Synapse (multi-search sessions)** — `synapse_session`, `synapse_prime`,
`synapse_prefetch`, `synapse_access`, `synapse_get`, `synapse_list`, `synapse_update`,
`synapse_task_begin`, `synapse_task_end`, `synapse_end`

**Handoff** — `handoff_begin`, `handoff_update`, `handoff_accept`, `handoff_cancel`,
`handoff_delete`, `handoff_list_pending`

**Proposals** — `create_proposal`, `update_proposal`, `list_proposals`,
`approve_proposal`, `reject_proposal`, `delete_proposal`

**Checkpoints** — `create_checkpoint`, `list_checkpoints`, `restore_checkpoint`

**Execution** — `execute`, `execute_file`, `batch_execute`

**Other** — `analytics`, `hook_ingest`, `profile_list`, `profile_set`

Adding or changing a tool means touching **three** places: the `tool-defs` schema, the
tools-api route, and the embedded mapping in `apps/mcp-client/src/embedded-api-client.ts`.

---

## 7. REST API

```bash
bun run dev:api          # :3333 with hot reload, Web UI at /ui
bun run start:api
```

- Swagger: `http://localhost:3333/swagger`
- Web UI: `http://localhost:3333/ui`
- Health: `http://localhost:3333/health`

**Auth is mandatory.** Every route outside `/health`, `/swagger`, `/ui` requires an
`x-api-key` header. The key is resolved by `initAuth()` at startup; set it via
`MASSA_AI_API_KEY`.

```bash
curl -H "x-api-key: $MASSA_AI_API_KEY" http://localhost:3333/projects
```

---

## 8. Skills

Repo-local skills live in `skills/`; generated per-host bundles land in
`apps/<host>-plugin/skills/` (gitignored build output).

| Skill | Purpose |
|---|---|
| `massa-ai` | Default memory-backed workflow router — load once per coding session |
| `persona-router` | Select and apply a conversation persona |
| `profile` | Switch installed agents to a model profile / report the active one |
| `bootstrap` | Inspect or toggle the nine startup-contract rules |
| `agents/<name>` | The 18 sub-agent charters |

Registry and policies (Persona Router, Plan Challenge, Conversation Feedback):
`skills/AGENTS.md`.

Regenerate bundles after touching anything under `skills/`:

```bash
bun run generate:artifacts
bun run generate:artifacts --check      # diff bundles against fresh output
```

---

## 9. Workflows

The `massa-ai` skill routes to exactly one workflow per task. Files under
`skills/massa-ai/workflows/`.

| Workflow | Use for |
|---|---|
| `onboarding` | First session / missing `projectId` |
| `feature` | New capability |
| `debug` | Broken behavior, errors, crashes |
| `general` | Coding work with no more specific workflow |
| `exploration` | Read-only codebase/flow understanding |

Audit/fix pairs — the `-audit` half is findings-only, the `-fix` half consumes a saved
audit report:

| Pair | Scope |
|---|---|
| `code-quality-audit` / `-fix` | SOLID, Clean Code, KISS, YAGNI, DRY, maintainability |
| `architecture-audit` / `-fix` | DDD, boundaries, coupling, module depth, seams |
| `security-audit` / `-fix` | Security, privacy, auth, validation, secret handling |
| `requirements-audit` / `-fix` | Requirements, spec, acceptance, scope alignment |
| `tests-audit` / `-fix` | Coverage, regression, assertions, flakiness |
| `bugs-audit` / `-fix` | Bug discovery |
| `implementation-audit` / `-fix` | Multi-lens audit of a concrete implementation target |
| `maestro-audit` / `-fix` | Maestro mobile E2E flows (plus `maestro` to author new ones) |
| `mobile-figma-audit` / `-fix` | Android/iOS/KMP UI versus a Figma design |

Documents and process:

| Workflow | Use for |
|---|---|
| `spec-driven` | TLC v3: Specify → Design → Tasks → Execute with independent validation |
| `adr` / `rfc` / `tdd` | Record a decision / propose a change / technical design |
| `discovery` / `to-prd` | Product brainstorming / turn the conversation into a PRD |
| `furps-refinement` | FURPS+ refinement of a PRD or ADR before implementation |
| `refactor` | Behavior-preserving structural cleanup |
| `design` | Implement mobile UI from Figma evidence |
| `commit` | Conventional Commits with Jira branch prefixes |
| `pr-review` | Review a GitHub PR / GitLab MR, post findings via `gh`/`glab` |
| `ticket` | Jira Epics, issues, sub-tasks through Atlassian MCP |
| `the-fool` | Direct challenge, red-team, pre-mortem, evidence audit |
| `judge-with-debate` | Multi-judge debate evaluation of a supplied artifact |
| `skill-architect` | Design and build a new skill |
| `long-session` | Context compaction / continuation package |

Explicitly requested workflows win; otherwise the most specific match.

---

## 10. Sub-agents (18)

Charters in `skills/agents/<name>/SKILL.md`, shipped to all four hosts by
`scripts/generate-subagent-artifacts.ts`.

| Agent | Purpose | Permission |
|---|---|---|
| `investigator` | Read and understand the codebase | read-only |
| `navigator` | Navigate an indexed codebase index-first | read-only |
| `context-curator` | Prepare the minimum high-quality Context Packet | read-only |
| `planner` | Turn requests into implementation plans | read-only |
| `plan-critic` | Challenge a constructed plan (Plan Challenge gate) | read-only |
| `builder` | Implement approved plans | write |
| `reviewer` | Review implementation quality, analyze diffs | read-only |
| `verification-agent` | Verification Ladder logic | read-only |
| `test-engineer` | Testing strategy | read-only (test-write when scoped) |
| `requirements-analyst` | Analyze requirements before implementation | read-only |
| `architecture-specialist` | Architectural guidance | read-only |
| `audit-specialist` | Specialized audits through configurable lenses | read-only |
| `documentation-agent` | Engineering documentation | read-only (doc-write) |
| `furps-analyst` | One FURPS+ dimension of a PRD/ADR | read-only |
| `mobile-specialist` | Mobile-specific expertise | read-only |
| `designer` | Verify/implement screens against their design source | read-only (UI-layer write when scoped) |
| `meta-judge` | Author the evaluation spec a debate panel scores against | read-only |
| `judge` | Score an artifact against that spec with quoted evidence | read-only (report-write, own file only) |

Tool gating differs per host — only Claude needed a fix. Ordinary Claude charters get
`disallowedTools: Write, Edit, NotebookEdit` (a denylist that keeps MCP tools reachable);
`navigator` is the deliberate allowlist exception so it stays index-first.

---

## 11. Development commands

```bash
bun install                    # workspace install (--frozen-lockfile in CI)
bun run build                  # turbo build — 6 packages
bun run type-check             # 4 packages; core/shared type-check via their build
bun run lint                   # oxlint from the repo root (real CI gate)
bun run lint:fix               # oxlint --fix only — never --fix-dangerously
bun run dev:api                # REST API :3333 + Web UI at /ui
bun run dev:mcp                # MCP server (stdio), watch mode
bun run clean
bun run version:sync           # all version bumps go through this
```

### Tests

```bash
bun run test                   # turbo test — 6 packages, NOT the whole suite
bun run test:scripts           # scripts/__tests__ + scripts/tests (root-level suites)
bun run test:plugins           # all four plugin __tests__ directories
bun run test:coverage          # the 90%-per-file floor
```

`packages/core`, `apps/tools-api`, `apps/mcp-client` run `bun scripts/run-tests-isolated.ts`,
not plain `bun test` — they fork a child process per file that needs isolation.
**Running `bun test` over a whole directory in those packages cross-contaminates module
and process state and produces false failures.** Use the runner, or target one file.

```bash
bun test packages/core/src/__tests__/read-file.test.ts
bun test packages/core/src/__tests__/read-file.test.ts -t "cache key"

cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='structural|serialize'
cd packages/core && bun run test:unit
cd packages/core && bun run test:e2e            # sets RUN_E2E=1
cd packages/core && bun run test:integration    # live-API, opt-in
bun scripts/run-deterministic.ts                # no Postgres, Ollama, or native tree-sitter
```

`bunfig.toml` sets a global 5 s per-test timeout. Raise a per-test budget
(`}, 60_000);`), never the global one.

A 5001 ms failure is usually a live LLM or embedding provider reached through the
developer's own `~/.config/massa-ai/config.json`, not load. Confirm with:

```bash
XDG_CONFIG_HOME=$(mktemp -d) bun test <file>
```

If that fixes it, the test is missing a seam — pin `_setLlmEnabledForTesting(false)` or
mock `../services/vector/vector-store-factory.js`.

### Benchmarks and verifiers

```bash
bun run bench:needles                       # retrieval needles
bun run bench:needles:gate                  # with floors
bun run bench:beir / bench:parser / bench:fixture
bun run verify:tree-sitter-native           # source-dist + package artifact
bun run verify:model-ids                    # probes installed harness CLIs; advisory
bun run verify:model-tokens
```

---

## 12. Environment variables

Every `MASSA_AI_*` var a test reads must also be listed in `turbo.json` →
`tasks.test.passThroughEnv`, or it arrives `undefined` under `bun run test`.

### Core

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL + pgvector; the only backend |
| `MASSA_AI_API_PORT` | Default `3333` |
| `MASSA_AI_API_URL` / `MASSA_AI_API_BASE` | Where MCP/REST clients point |
| `MASSA_AI_API_KEY` | Sent by REST clients as `x-api-key` |
| `MASSA_AI_EMBEDDED` | `true` runs the MCP client in-process instead of over HTTP |
| `MASSA_AI_PROJECT_ID` | Overrides project identity |
| `MASSA_AI_DATA_DIR` / `MASSA_AI_MEMORY_PATH` / `MASSA_AI_UPLOAD_DIR` | Storage locations |
| `MASSA_AI_READ_ONLY_MODE` | Blocks write paths |
| `MASSA_AI_EXECUTOR_SANDBOX` | `none` in CI |
| `MASSA_AI_MCP_SOURCE` | `local` \| `npx` \| `auto` for the installers |
| `MASSA_AI_MODEL_PROFILE` | Profile selection, rank 2 |

### LLM (all features default OFF)

| Variable | Notes |
|---|---|
| `MASSA_AI_LLM_ENABLED` | `false` by default; `true` turns on all 10 call sites |
| `MASSA_AI_LLM_BASE_URL` | e.g. `http://localhost:11434/v1` |
| `MASSA_AI_LLM_API_KEY` | e.g. `ollama` |
| `MASSA_AI_LLM_MODEL` | 7 NL-judgment sites |
| `MASSA_AI_LLM_CODE_MODEL` | 3 code sites: bootstrap seed, reranker, code-compressor |
| `MASSA_AI_LLM_TEMPERATURE`, `MASSA_AI_LLM_MAX_OUTPUT_TOKENS` | |

Both models must be **non-thinking instruct** models. A thinking model routes structured
output into the reasoning channel and silently burns the 90 s timeout.

### Embeddings

`OLLAMA_BASE_URL`, `OLLAMA_EMBEDDING_MODEL` (default `qwen3-embedding:4b`),
`OLLAMA_EMBEDDING_DIMENSIONS` (default `2560`).

### Search and Synapse tuning

`SEARCH_DISABLE_KEYWORD`, `SEARCH_MIN_SCORE`, `RRF_KEYWORD_BOOST`, `RRF_VECTOR_WEIGHT`,
`RRF_MAX_CHUNKS_PER_FILE`, `SYNAPSE_ENABLED`, `SYNAPSE_ATTENTION_ENABLED`.

### Scheduler

`MASSA_AI_SCHEDULER_ENABLED`, `..._TICK_MS`, `..._MAX_CONCURRENT`, `..._SAFE_DEFAULTS`,
plus per-job `..._{DECAY,CONSOLIDATION,CHECKPOINT_PURGE,AUTO_IMPROVE,OBSERVATION_BRIDGE}_{ENABLED,INTERVAL_MS}`.

---

## 13. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| MCP `connection closed: initialize response` | Something wrote to stdout. Stdout belongs to JSON-RPC; the logger routes every level to stderr on purpose. |
| MCP `-32000 Connection closed` on startup | The registered command itself crashes. Run it by hand to see the real error. |
| `npx` MCP dies with "could not determine executable to run" | The bin is `massa-ai`; `-p @massa-ai/mcp-client` is mandatory. |
| MCP handshake times out on first run | The `npx` path compiles native tree-sitter grammars. Use `--mcp-source local` for a checkout. |
| 3 "native Tree-sitter package contract" suites fail on a fresh worktree | `bun install` exited 0 but node-gyp silently failed under Node 25 on macOS arm64. Re-install with a Node 22 helper, or copy `node_modules/tree-sitter*/build/` from a provisioned checkout of the same lockfile. |
| Test fails at exactly 5001 ms | Usually a live LLM/embedding provider via your own config, not load. Re-run under `XDG_CONFIG_HOME=$(mktemp -d)`. |
| An env var reads `undefined` under `bun run test` but works under `bun test` | Add it to `turbo.json` → `tasks.test.passThroughEnv`. |
| Profile switch appears to do nothing | Restart the host session. On Claude, also check `CLAUDE_CODE_SUBAGENT_MODEL` is `inherit`. |
| Generated bundles look stale | `bun run generate:artifacts`, then `bun run generate:artifacts --check`. |
| An index points at a moved directory | `massa-ai-config recover <projectId> --path <newPath>` |

---

## See also

| Topic | File |
|---|---|
| Agent startup contract | `AGENTS.md` |
| Managed-harness protocol, CHANGELOG authoring, measurement discipline | `CONTRIBUTING.md` |
| Architecture, CI gates, release chain | `CLAUDE.md` |
| Per-feature reference | `FEATURES.md` |
| Install/integration/quick-start | `README.md` |
| Onboarding walkthrough | `docs/ONBOARDING.md` |
| Adding a new host | `docs/adding-a-host.md` |
| MCP tool contracts | `skills/massa-ai/references/mcp-tools.md` |
| Synapse lifecycle | `skills/massa-ai/references/synapse-policy.md` |
| Sub-agent registry and policies | `skills/AGENTS.md` |
| In-flight work | `.specs/project/STATE.md` |
