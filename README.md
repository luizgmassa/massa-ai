# massa-ai

massa-ai is a local-first MCP server that indexes your codebase — semantic search, keyword search, and a symbol graph ranked by dependency centrality — and keeps a persistent, cross-session memory of decisions, patterns, and critical facts.

Instead of loading whole files into context, your assistant retrieves just the relevant symbols, references, and memories, so it reads less, forgets nothing between sessions, and costs less to run. It runs on a local inference provider — Ollama or LM Studio (free, offline) — with optional LLM consolidation, rerank, and query understanding, and plugs into Claude Code, Codex, Cursor, and OpenCode via MCP plus passive-capture hooks.

> **[FEATURES.md](./FEATURES.md)** contains a complete reference for every feature — what it does, why it exists, and how to use it. This README covers installation, integration, and quick-start; FEATURES.md has the depth.

---

## Quick Start

### One-line install (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/luizgmassa/massa-ai/main/install.sh | bash
```

Installs interactively. Three modes:

| Mode | Requires | Best for |
|------|----------|----------|
| **Docker** (default) | Docker | Production, quick start (PostgreSQL via Docker/colima, ~5GB RAM) |
| **Docker build** | Docker + Git | Custom builds, local changes (PostgreSQL via Docker/colima, ~5GB RAM) |
| **Source** | Git + Bun | Development (Native PostgreSQL ~100MB or Docker PostgreSQL) |

> ⚠️ **Docker modes run PostgreSQL through Docker/colima and reserve ~5GB RAM.**
> For native PostgreSQL (~100MB, no Docker), use **Source mode** (`./scripts/setup-local-first.sh`)
> and pick **Native PostgreSQL** at the database prompt.

Non-interactive (CI/scripted):

```bash
# Docker mode, custom port, skip start
MASSA_AI_MODE=docker MASSA_AI_API_PORT=4000 MASSA_AI_NO_START=1 \
  curl -fsSL https://raw.githubusercontent.com/luizgmassa/massa-ai/main/install.sh | bash
```

### Manual setup (from source)

```bash
# 1. Clone and install
git clone https://github.com/luizgmassa/massa-ai.git
cd massa-ai
bun install

# 2. Setup (100% offline — Ollama by default, or LM Studio)
./scripts/setup-local-first.sh
# - Prompts for a local inference provider (Ollama or LM Studio), or set
#   MASSA_AI_INFERENCE_PROVIDER=ollama|lmstudio to skip the prompt
# - Ollama: pulls qwen3-embedding:0.6b (embeddings, 1024 dims), qwen3-vl:8b
#   (default LLM), and qwen2.5-coder:7b (code-oriented LLM sites)
# - LM Studio: installs the `lms` CLI if missing, starts the server, and fetches
#   text-embedding-qwen3-embedding-0.6b (embeddings, 1024 dims), qwen3-vl-8b-instruct
#   (default LLM) and qwen2.5-coder-7b-instruct (code-oriented LLM sites) —
#   override via LMSTUDIO_EMBEDDING_MODEL, MASSA_AI_LLM_MODEL, MASSA_AI_LLM_CODE_MODEL
# - Creates .env with defaults
# - Runs bun run diagnose to validate the stack

# 3. Build and start
bun run build
bun run start:api
```

Verify: `curl http://localhost:3333/health`

#### Native PostgreSQL (macOS, recommended over Docker)

Instead of Docker (~5GB RAM), run PostgreSQL natively (~100MB):

```bash
# setup-local-first.sh option 1 does this automatically, or run standalone:
./scripts/setup-native-postgres.sh      # brew install postgresql@17 + pgvector, create role/db, migrate

# .env then contains:
#   DATABASE_URL=postgresql://massa_ai:massa_ai_password@localhost:5432/massa_ai
```

Linux/WSL: install `postgresql` + `postgresql-*-pgvector` from your distro, create the role/db/extension, then set `DATABASE_URL`. Or use Docker (option 3, ~5GB RAM).

> **Tip:** Run `bun run diagnose` at any time to validate your local inference
> provider (Ollama or LM Studio), database access, embedding generation, and
> migration status.

---

## Integration

### OpenCode (recommended)

The OpenCode plugin's hooks are in-process (no `hooks.json` to merge): the plugin
registers lifecycle handlers (`session.created`, `tool.execute.after`,
`experimental.session.compacting`, `shell.env`, `event`, `dispose`) directly, so
observations are captured the moment the plugin loads.

**Install from source (recommended — same as the other three hosts):**

```bash
bun run build                             # produces apps/opencode-plugin/dist/index.js
bash apps/opencode-plugin/install.sh --user
```

That installs `~/.config/opencode/plugins/massa-ai/index.js` as a real copy of
the repo's `dist/index.js` (re-run the installer after `bun run build` to
refresh it — a symlink here used to go dead whenever the gitignored `dist/`
vanished, and OpenCode skips an unresolvable local plugin silently), adds
`"./plugins/massa-ai/index.js"` to the `plugin` array of `opencode.json`, and
symlinks the 7 specialist agents into `~/.config/opencode/agents/`. The plugin
is hooks-only (AD-017: plugins deliver, MCP serves tools, hooks observe) — it
registers zero in-process tools, so the installer delegates MCP registration to
`scripts/install-agents.sh --agent opencode`, giving you all 59 MCP tools
alongside the lifecycle hooks. Uninstalling the plugin (`install.sh
--uninstall`) removes only the plugin file and its config entry; the MCP entry
stays (`bash scripts/install-agents.sh --agent opencode --uninstall` removes it
separately).

**Install as an npm package (alternative):**

```bash
npm install @massa-ai/opencode-plugin
# or from source:
bun add @massa-ai/opencode-plugin
```

**Configure** `~/.config/opencode/opencode.json`:

File: `~/.config/opencode/opencode.json`

**Via MCP package:**

```json
{
  "mcp": {
    "massa-ai": {
      "type": "local",
      "command": [
        "bunx",
        "-p",
        "@massa-ai/mcp-client",
        "massa-ai"
      ],
      "environment": {
        "MASSA_AI_API_URL": "http://localhost:3333"
      },
      "enabled": true
    }
  }
}
```

**Via Plugin:**

```json
{
  "plugin": ["@massa-ai/opencode-plugin"]
}
```

**From source (development):**

```json
{
  "mcp": {
    "massa-ai": {
      "type": "local",
      "command": ["bun", "run", "/path/to/massa-ai/apps/mcp-client/src/index.ts"],
      "enabled": true
    }
  }
}
```

> OpenCode's MCP key is `mcp`, not `mcpServers`. Do not copy Claude's or
> Cursor's shape here — `scripts/install-agents.sh --agent opencode` writes the
> correct one for you.

**Events wired (in-process, 6 lifecycle handlers):** `session.created`,
`tool.execute.after`, `experimental.session.compacting`, `shell.env`, `event`,
`dispose` — all registered in-process by the plugin (no external hooks file).

### Plugin Bundles (4-Tool Parity)

All four major AI coding tools have native plugin bundles that install skills
(slash commands), MCP server config, and passive-capture hooks in one command.
Hooks are **auto-written** (not just printed) using array-append merge with
backup + `_massaAiOwned` marker — user hooks are always preserved.

| Tool | Install command | Events | Bundles | Trust step? |
|------|----------------|--------|---------|-------------|
| **Claude Code** | `bash apps/claude-plugin/install.sh --user` | 5 | 6 slash commands + 7 subagent specialists + hooks into `settings.json` | No |
| **Codex** | `bash apps/codex-plugin/install.sh --user` | 6 | 6 skills + 7 subagent specialists (TOML to `~/.codex/agents/`) + hooks into `hooks.json` + MCP into `~/.codex/config.toml` | Yes — run `/hooks` in Codex |
| **Cursor** | `bash apps/cursor-plugin/install.sh --user` | 7 | 6 skills + hooks into `hooks.json` + MCP into `~/.cursor/mcp.json` + 7 subagent specialists | No |
| **OpenCode** | `bash apps/opencode-plugin/install.sh --user` | 6 (in-process) | MCP into `opencode.json`/`opencode.jsonc` (59 tools) + lifecycle handlers + 7 subagent specialists (`.md` to `~/.config/opencode/agents/`) | No |

Each plugin also ships generated slash commands — one per massa-ai workflow (36 today)
(`/massa-ai:debug`, `$debug`, etc., naming varies by host) — alongside the 6
quick commands in the table above; see
[Workflow Commands](./FEATURES.md#workflow-commands-generated-slash-commands)
in the feature reference for the full per-host naming table.

Claude Code and Codex additionally support their **native plugin managers**,
which is what makes massa-ai visible in `/plugin` and `/plugins`:

**Generation prerequisite for a checkout (not a tarball install):** the
`skills/`, `agents/`, and `agent-profiles/` trees under every `apps/*-plugin/`
directory are generated build output, gitignored rather than checked in. Run
`bun run generate:artifacts` once before `marketplace add` against a checkout
— any of the `install.sh` scripts or `install-harness.sh` already run it for
you, so this only matters if you point the marketplace at a checkout without
running an installer first. A published npm/tarball install ships the bundles
pre-generated and needs nothing extra.

```
# Claude Code
/plugin marketplace add ~/Projects/massa-ai
/plugin install massa-ai@massa-ai
```

```bash
# Codex
codex plugin marketplace add ~/Projects/massa-ai
codex plugin add massa-ai@massa-ai
```

**After every `git pull`**, regenerate the bundles a checkout-based
marketplace entry serves — `bun run generate:artifacts` — or the plugin
manager keeps serving the pre-pull skills/agents until you do. This is opt-in,
not automatic; the repo does not install a hook for you. If you want it
automated, copy this into `.git/hooks/post-merge` (and `chmod +x` it):

```bash
#!/bin/sh
# Optional: keep checkout-based plugin bundles fresh after every pull.
cd "$(git rev-parse --show-toplevel)" && bun run generate:artifacts
```

Standalone `massa-ai-config agents install` (the `@massa-ai/opencode-plugin`
bin — the `@massa-ai/mcp-client` bin of the same name has no `agents`
subcommand) run against an ungenerated checkout fails (the source
`agents/`/`agent-profiles/` directories it copies from do not exist yet) until
`bun run generate:artifacts` has run at least once. Tarball installs are
unaffected — they ship pre-generated.

On Claude Code the plugin ships its own hooks, so running `install.sh` after a
plugin install skips the hook merge instead of double-firing. On Codex the two
are complementary — a Codex plugin manifest cannot carry hooks, so `install.sh`
is still what wires `~/.codex/hooks.json`. MCP registration stays with
`scripts/install-agents.sh` on both, the single writer of host MCP config.

All four installers support `--user` (default, e.g. `~/.claude`), `--project`
(e.g. `./.claude`), `--uninstall` (removes only massa-ai-owned entries), and
`--quiet` / `--verbose`. The OpenCode installer additionally needs
`apps/opencode-plugin/dist/index.js` to exist — run `bun run build` first; it
exits non-zero with that hint otherwise. `npm install @massa-ai/opencode-plugin`
plus `"plugin": ["@massa-ai/opencode-plugin"]` remains a supported alternative.

Or pick the `p` option from the root `bash install.sh` post-install menu, which
offers all four plugin choices plus an "All four" shortcut. The `k` option in
the same menu opens the harness sub-menu: skills only, MCP registration only,
everything including plugin bundles, or a dry-run preview.

When the plugin bundles are installed through the harness — the root `install.sh`
`k)` harness menu, `scripts/setup-local-first.sh`, or `bash scripts/install-harness.sh
--plugins` — the plugin phase **detects which hosts are present** (the host's
config dir exists, or its binary is on `PATH`) and installs only those; absent
hosts produce one skip log line and no filesystem writes. Every successful
plugin install records the bundle version in
`~/.config/massa-ai/install-state.json`: a re-run at the same version is a
no-op, an older recorded version upgrades automatically, and a newer recorded
version is never downgraded. `--dry-run` reports the per-host decision
(install / upgrade / skip-current / skip-absent) without writing anything.
Direct per-host installs (`apps/<host>-plugin/install.sh --user`) behave
exactly as before, plus the same version recording.

**Shared binary:** Claude Code, Codex, and Cursor all use the same
`massa-ai-hook.ts` Bun binary from `apps/claude-plugin/hooks/`. Codex and Cursor
each ship a **generated real copy** at `hooks/massa-ai-hook` — not a symlink,
because `npm pack` silently drops symlink entries and the hook would have been
absent from every published tarball. OpenCode uses in-process handlers (no
external hooks file).

**MCP has exactly one writer.** `scripts/install-agents.sh` owns every host's
MCP config; the plugin installers call it for you (`--agent claude-code` /
`codex` / `cursor`). Nothing else writes an MCP entry, so installing a plugin
and running the installer directly cannot double-register. MCP is always
registered at **user** scope, even for a `--project` plugin install.

OpenCode is no longer an exception (AD-017): `install-agents.sh` always writes
its MCP entry, regardless of which form `opencode.json` lists the plugin in —
the npm package name (`@massa-ai/opencode-plugin`), the local path
(`./plugins/massa-ai/index.js`), or the bare dir name (`massa-ai`). The
OpenCode plugin is hooks-only and registers zero in-process tools; its
installer delegates MCP registration to `install-agents.sh --agent opencode`
on every install (mirroring the Codex delegation pattern), so OpenCode users
get all 59 MCP tools rather than a 14-tool in-process subset. Uninstalling the
plugin does not remove the MCP entry — plugin lifecycle and MCP tool-surface
lifecycle are independent; remove the entry with
`bash scripts/install-agents.sh --agent opencode --uninstall` if wanted.

**7 subagent specialists:** all four plugins ship the 7 massa-ai
sub-agent specialists (senior-engineer, code-explorer, code-reviewer, designer,
judge, product-manager, test-engineer) as host-native subagent definitions,
registered under their bare names (`test-engineer`, not `massa-ai-test-engineer`; on the
Claude plugin route the host namespaces them as `massa-ai:<name>`). Installers
tell their own agent files apart by a `massa-ai-owned` content marker, never by
name: a same-named agent you own is skipped with a warning and left untouched,
and the pre-consolidation `massa-ai-<name>` files are pruned on upgrade.

Model + effort are pinned per host, resolved at build time from
`skills/model-profiles.json` — the only hand-authored place that names a model
or an effort level for any agent on any host. Under the default `balanced`
profile: Claude `effort: high` + aliases (haiku/sonnet/opus); Codex
`model_reasoning_effort = "high"` + IDs
(gpt-5.4-mini/gpt-5.6-terra/gpt-5.6-sol); OpenCode `reasoningEffort: max` +
`opencode-go/` IDs (deepseek-v4-pro / glm-5.2 / minimax-m3); **Cursor
deliberately resolves every tier to `model: inherit`**, because Cursor
publishes no display-name→ID mapping and its frontmatter schema carries no
effort key at all. Seven profiles ship (`balanced`, `cheap`, `heavy`, `work`,
`home`, plus OpenCode-only `open_models` and `local_models`) and an installed
machine switches between them at runtime — see
[FEATURES.md → Model Profile Switching](./FEATURES.md#model-profile-switching).
See [FEATURES.md → Subagent Skills (7 Specialists)](./FEATURES.md#subagent-skills-7-specialists)
for the full per-agent model/effort/permission tables, file locations, and
the generator + parity-test contract.

**Cursor advanced (extension authors):** register the plugin directory
programmatically via
`vscode.cursor.plugins.registerPath("/abs/path/to/apps/cursor-plugin")`.

See [§Passive Capture (Hooks)](#passive-capture-hooks) for the full event
tables and [FEATURES.md](./FEATURES.md#plugins-4-tool-parity) for details.

---

## Skills & Install System

The repo ships a set of repo-local skills plus a unified installer that copies them into each tool's config directory. The per-plugin installers (above) handle hooks + MCP + subagent specialists; this installer handles skills and the bootstrap contract.

### Included skills

| Skill | Location | Purpose |
|-------|----------|---------|
| `massa-ai` | `skills/massa-ai/` | Workflow router (36 workflows: spec-driven, debug, feature, refactor, audits, ADR/RFC/TDD, etc.) |
| `bootstrap` | `skills/bootstrap/` | Inspect or toggle the eight startup-contract rules delivered by `MASSA-AI.md` |
| `agents/<n>` | `skills/agents/` | The 7 sub-agent specialist charters |

### Unified skills installer

Installs every skill bundle into each detected tool's config dir and delivers the startup contract. Installs are **real copies, not symlinks** — nothing installed depends on this checkout staying where it was installed from, which also means a repo edit is only picked up by re-running `--apply`.

```bash
# Install skills for all detected tools
bash scripts/install-skills.sh --apply --platform all --yes

# Install for one platform
bash scripts/install-skills.sh --apply --platform claude --yes

# Preview changes (write nothing)
bash scripts/install-skills.sh --dry-run --platform all

# Check for drift (exit 1 if an installed copy is missing or stale)
bash scripts/install-skills.sh --check --platform all

# Uninstall (remove only massa-ai-owned copies + the contract wiring)
bash scripts/install-skills.sh --uninstall --platform all --yes
```

**The startup contract is a file, not an inlined block.** The contract body lives
in a per-host `MASSA-AI.md` at that host's config root; the host is then wired to
load it through its own real mechanism:

| Platform | Skills dir | Contract | Wiring |
|----------|-----------|----------|--------|
| Claude Code | `~/.claude/skills/<name>` | `~/.claude/MASSA-AI.md` | `@MASSA-AI.md` managed block in `~/.claude/CLAUDE.md` (Claude Code reads `CLAUDE.md`, never `AGENTS.md`) |
| Codex | `$CODEX_HOME/skills/<name>` | `$CODEX_HOME/MASSA-AI.md` | pointer block in `AGENTS.md` |
| Cursor | `~/.cursor/skills/<name>` | `~/.cursor/MASSA-AI.md` | pointer block in `AGENTS.md` |
| OpenCode | `~/.config/opencode/skills/<name>` | `~/.config/opencode/MASSA-AI.md` | absolute path in the config's `instructions` array |

Eight contract rules ship (`caveman`, `massa-ai-router`, `dedupe-guardrails`,
`plan-challenge`, `conversation-feedback`, `indexing-hygiene`, `english-code`,
`code-comments`), each individually
toggleable at runtime — `massa-ai-config bootstrap list|enable|disable`.

**State:** `~/.config/massa-ai/install-state.json` (v2 format; v1 auto-migrates).

**Safety:** aborts on a foreign conflict at a target path (won't overwrite user files); `--dry-run` and `--check` write nothing; requires `--yes` for real `$HOME`.

### MCP registration

`scripts/install-agents.sh` is the single writer of host MCP config. It merges
the `massa-ai` server entry into each host's own config shape, preserving every
existing user key and taking a `<config>.massa-ai.bak-<ts>` backup first.

```bash
bash scripts/install-agents.sh --yes                 # every applicable host
bash scripts/install-agents.sh --agent codex --yes   # one host
bash scripts/install-agents.sh --dry-run             # plan only, writes nothing
bash scripts/install-agents.sh --uninstall --yes     # remove only owned entries
```

| Agent | Config file | Shape |
|-------|-------------|-------|
| `claude-code` | `~/.claude.json` | `mcpServers`, `type: "stdio"`, string `command` + `args`, `env`, `npx` |
| `claude-desktop` | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) | `mcpServers`, `env`, `npx` |
| `codex` | `~/.codex/config.toml` | `[mcp_servers.massa-ai]` (comments and user tables preserved) |
| `cursor` | `~/.cursor/mcp.json` | `mcpServers`, `env`, `npx` |
| `opencode` | `~/.config/opencode/opencode.json` | `mcp`, `environment`, `bunx` |

Uninstall removes only entries carrying `_massaAiOwned: true` — a `massa-ai`
entry you wrote by hand is left alone.

**Which command gets registered — `--mcp-source`.** The MCP entry can point at
either a local checkout or the published npm package:

| `--mcp-source` | Command written | Chosen by |
|---|---|---|
| `local` | `bun run <repo>/apps/mcp-client/src/index.ts` | `scripts/setup-local-first.sh` |
| `npx` | `npx -y -p @massa-ai/mcp-client massa-ai` (OpenCode: `bunx -p …`) | the root `install.sh` |
| `auto` (default) | `local` when `apps/mcp-client/src/index.ts` exists, else `npx` | direct invocation |

`MASSA_AI_MCP_SOURCE` sets it via the environment; the flag wins over the env var.
Switching sources rewrites the entry in place — you never end up with two.

Prefer `local` when you have a clone. The npx path resolves `@massa-ai/core`, which
compiles native tree-sitter grammars on first run, and an MCP host will time out
during the handshake long before that finishes. Note also that `-p` is required
in both launchers: the package's bin is named `massa-ai`, not `mcp-client`, so a
bare `npx @massa-ai/mcp-client` fails with "could not determine executable to
run". `bunx` takes `-p` but has no `-y`.

> Claude Code reads MCP *definitions* from `~/.claude.json`, not from
> `~/.claude/settings.json` (that file holds approval controls — `allowedMcpServers`,
> `enabledMcpjsonServers`, `disabledMcpServers` — plus `hooks`). Installs before
> this release wrote to `settings.json`, where Claude Code ignored them; the
> installer now migrates that stale owned entry away on the next apply.

### One-shot harness install

`scripts/install-harness.sh` runs skills, MCP registration, and the plugin
bundles in one pass. Both `install.sh` (menu option `k`) and
`scripts/setup-local-first.sh` (step 6/6) call it.

```bash
bash scripts/install-harness.sh --all --yes           # skills + MCP + all four plugin bundles
bash scripts/install-harness.sh --skills --agents     # skip the plugin bundles
bash scripts/install-harness.sh --all --dry-run       # preview everything (forces --verbose)
bash scripts/install-harness.sh --all --yes --verbose # per-file / per-key detail
```

Output is **quiet by default** — one line per changed thing plus a summary.
`--verbose` (or `MASSA_AI_VERBOSE=1`) adds the per-file and per-config-key
detail; `--dry-run` and `--check` force it on. Errors and warnings are never
suppressed. The banner prints at most once per process tree, so nesting the
plugin installers under the harness no longer repeats it four times.

Plugin bundles are installed by default. Set `MASSA_AI_INSTALL_PLUGINS=0` to make
`scripts/setup-local-first.sh` step 6 fall back to `--skills --agents`.

Exit codes: `0` when every requested step completed, otherwise the first failing
sub-installer's code (`13` = consent gate refused).

See [FEATURES.md → Skills & Install System](./FEATURES.md#skills--install-system) for the full reference.

### Workflow guides

Migrated documentation for massa-ai workflows lives in `docs/`:

| Guide | File |
|-------|------|
| Spec-Driven | `docs/massa-ai-spec-driven.md` |
| TDD | `docs/massa-ai-create-tdd.md` |
| RFC | `docs/massa-ai-create-rfc.md` |
| Commit | `docs/massa-ai-commit.md` |
| Ticket | `docs/massa-ai-create-ticket.md` |
| Mobile Figma | `docs/massa-ai-mobile-figma.md` |
| Context Slices | `docs/context-slices.md` |
| Cheatsheet (commands, flags, tools, skills, agents) | `docs/CHEATSHEET.md` |
| Onboarding (generated) | `docs/ONBOARDING.md` — see [Understanding the codebase](#understanding-the-codebase) |

### Running the MCP server from Docker

For a Docker deployment, point the host at the `mcp` compose service instead of a
local checkout. OpenCode shape (`opencode.json`) shown; Claude/Cursor use
`mcpServers` with a string `command` plus an `args` array:

```json
{
  "mcp": {
    "massa-ai": {
      "type": "local",
      "command": ["docker", "compose", "run", "--rm", "-i", "mcp"],
      "enabled": true
    }
  }
}
```

---

## Step-by-step: the memory lifecycle

```
bootstrap → capture → recall/search → handoff → proposals → checkpoint
```

### 1. Bootstrap a project

Seed initial context (git log, README, docs, top central files) so an agent
starts with usable memories instead of a cold start. Idempotent — re-running is
a no-op unless `force: true`. Degrades silently to rule-based seeds when the LLM
is off.

```bash
# MCP
bootstrap { projectId: "my-app", projectPath: "/abs/path" }
# REST
curl -X POST http://localhost:3333/api/v1/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"projectId":"my-app","projectPath":"/abs/path"}'
```

### 2. Enable passive capture

Install hooks for your tool (see [§Passive Capture (Hooks)](#passive-capture-hooks))
so observations are streamed to `/api/v1/hook`. All four tools (Claude Code,
Codex, Cursor, OpenCode) have plugin installers that auto-write hooks. Non-hook
hosts use `hook_ingest` or `POST /api/v1/hook/batch`.

```bash
# Observations persist in PostgreSQL and are consolidated into memories only
# when MASSA_AI_LLM_ENABLED=true (else stored raw, bridge skips silently).
```

### 3. Work — recall and search

```bash
# Semantic memory search
recall { query: "how does auth work", projectId: "my-app" }
# Code search (enriched = full content + imports + parent symbol in one call)
search { query: "token validation", projectId: "my-app", responseMode: "enriched" }
```

Quality knobs (default **OFF**, opt-in via env): `queryUnderstanding`
(LLM rewrite + HyDE) and `rerank` (LLM-judge). See
[FEATURES.md](./FEATURES.md#query-understanding-rewrite--hyde) and
[FEATURES.md](./FEATURES.md#rerank-llm-judge).

### 4. Hand off to the next session

Session A leaves a structured record; session B discovers and accepts it.

```bash
# Session A — leave the handoff
handoff_begin {
  projectId: "my-app",
  summary: "Auth refactor in progress; token rotation unfinished",
  nextSteps: ["finish rotateToken in auth.ts", "add tests"],
  files: ["src/auth.ts", "src/token.ts"]
}
# Session B — discover and accept
handoff_list_pending { projectId: "my-app" }
handoff_accept { id: "<handoff-id>" }
```

### 5. Review auto-improvement proposals

The auto-improve loop detects recurring patterns (repeated queries, hot files,
common fixes) and generates memory-edit proposals. With
`AUTO_IMPROVE_REVIEW_GATE=false` (the default) proposals are auto-approved; set
it `true` to surface them for review.

```bash
list_proposals   { projectId: "my-app" }
approve_proposal { id: "<proposal-id>" }
reject_proposal  { id: "<proposal-id>", reason: "stale" }
```

### 6. Snapshot and restore

Save task progress (status, steps, file changes, decisions, next action) and
resume later — across a restart, a context compaction, or a new agent.

```bash
create_checkpoint {
  taskId: "auth-refactor",
  description: "Token rotation mid-flight",
  progressPercent: 60,
  nextAction: "finish rotateToken in src/auth.ts"
}
list_checkpoints   { taskId: "auth-refactor" }
restore_checkpoint { checkpointId: "<cp-id>" }
```

---

## Available Tools

59 tools total, grouped by category: Indexing & Search, Symbol Graph, Code
Execution (Sandbox), Memory & Lifecycle, Synapse (Cognitive Layer), Passive
Capture, Project Bootstrap, Cross-session Handoffs, Auto-improvement
(Proposals), and Checkpoints.

The current roster fits in one MCP `tools/list` page (pagination via
`nextCursor` activates over 100 tools).

**See [FEATURES.md](./FEATURES.md#mcp-server-59-tools) for the complete tool
roster** with required/optional params for every tool.

### Workflow integration

The massa-ai workflow skill (`skills/massa-ai/`) references all 59 tools
by their canonical un-prefixed names. Each workflow adopts the tools that
materially benefit its flow — e.g. `spec-driven` and `long-session` use
checkpoints for task save/resume; `debug` uses `trace_path` for call-path
tracing and `execute_file` for large-file analysis; `architecture-audit` uses
`impact_analysis` and `get_architecture`; `onboarding` uses `bootstrap`. See
[FEATURES.md → Workflow Tools (59-Tool Adoption)](./FEATURES.md#workflow-tools-59-tool-adoption)
for the full tool-to-workflow adoption map.

---

## Local-first LLM (Ollama or LM Studio)

All LLM-driven features run against a local inference provider — Ollama or
LM Studio — and **default OFF**, degrading silently to rule-based behavior
when disabled. Everything still works without an LLM — you just lose
consolidation, polish, rerank, and query rewrite.

### Prerequisites (Ollama)

```bash
# Install Ollama (if missing)
curl -fsSL https://ollama.com/install.sh | sh

# Start the daemon
ollama serve

# Pull models
ollama pull qwen3-embedding:0.6b  # embeddings (1024 dims)
ollama pull qwen3-vl:8b           # default LLM (consolidation, salience, handoff, query rewrite, HyDE)
ollama pull qwen2.5-coder:7b      # code-oriented LLM sites (bootstrap seed, reranker, code compression)
```

### Prerequisites (LM Studio)

```bash
# Install LM Studio's CLI (if missing)
curl -fsSL https://lmstudio.ai/install.sh | bash

# Start the daemon
lms daemon up

# Download and load models (pick any instruct + embedding model you prefer)
lms get -y text-embedding-qwen3-embedding-0.6b    # embeddings (1024 dims)
lms get -y <your-instruct-model>                   # chat model
```

Or run `./scripts/setup-local-first.sh` with `MASSA_AI_INFERENCE_PROVIDER=lmstudio`
(or answer the interactive prompt) — it drives this flow for you, fetching its
own default models rather than offering a picker. Note where the settings land:
it writes only `DATABASE_URL` into `.env`, while the provider, model and LLM
settings go to `~/.config/massa-ai/config.json`.

### Validate the stack

`bun run diagnose` (also auto-runs as `predev` / `predev:api` / `predev:mcp`)
checks Ollama connectivity, database access, embedding generation, and migration
status. It does not currently probe LM Studio — verify an LM Studio setup with
`curl http://localhost:1234/v1/models` and `bun run start:api` +
`curl http://localhost:3333/health` instead.

> **Ran without a reachable embedding provider before? Re-index.** Earlier versions
> silently substituted **random vectors** when no provider was available, and stored and
> searched them as if they were real — so retrieval returned plausible-looking nonsense
> with no error anywhere. That fallback is gone: embedding now fails loudly instead.
>
> There is no detector and no repair. A 384-dimension random vector is indistinguishable
> from a genuine embedding after the fact, so the only fix is to overwrite the affected
> rows:
>
> ```bash
> # per affected project
> curl -X POST http://localhost:3333/api/v1/project/reindex \
>   -H "x-api-key: $MASSA_AI_API_KEY" -H "Content-Type: application/json" \
>   -d '{"projectId": "my-project", "force": true}'
> ```
>
> Memories stored during such a window are not covered by re-indexing — their embeddings
> were written at `store_memory` time — and need to be re-created.

### Turn the LLM features on

```bash
# .env  — all LLM-gated features default OFF; flip one switch to enable them all
MASSA_AI_LLM_ENABLED=true
MASSA_AI_LLM_BASE_URL=http://localhost:11434/v1
MASSA_AI_LLM_API_KEY=ollama
MASSA_AI_LLM_MODEL=qwen3-vl:8b                # default instruct model (NL-judgment sites)
MASSA_AI_LLM_CODE_MODEL=qwen2.5-coder:7b      # code-oriented sites (bootstrap seed, reranker, compress)
# MASSA_AI_LLM_DISABLE_THINK=true             # best-effort thinking-disable (default true; safety net)
```

On LM Studio, point the same variables at its OpenAI-compatible server instead
(`MASSA_AI_LLM_BASE_URL=http://localhost:1234/v1`, any non-empty
`MASSA_AI_LLM_API_KEY`, and the model ids loaded in LM Studio). LM Studio
implements `response_format: {type:"json_schema"}` natively and needs neither
the Ollama-only version probe nor the injected `think:false` flag — provider
identity handles that automatically.

With `MASSA_AI_LLM_ENABLED=true` you get: hook→memory consolidation, handoff-summary
polish, query understanding (rewrite + HyDE), LLM-judge rerank, and auto
importance scoring. Set it `false` (the default) and every one of those silently
falls back to its rule-based path.

> **Per-task model routing:** the 10 LLM call sites split by
> task shape. The 7 NL-judgment sites (salience judge, consolidator,
> observation/auto-improve jobs, handoff summary, query rewrite, HyDE) use
> `MASSA_AI_LLM_MODEL`; the 3 code-oriented sites (bootstrap `SeedMemoriesSchema`,
> reranker, `code-compressor`) use `MASSA_AI_LLM_CODE_MODEL`. Routing is per-call via
> a `modelRole` option in `packages/core/src/services/memory/llm-client.ts`.
> Both default to **non-thinking instruct** models so structured-output calls
> return fast (~5 s) and reliably, instead of burning a 90 s wall-clock timeout
> on a thinking model (the prior default routed answers into the
> reasoning channel and silently degraded). Override either with the env vars
> above.

> **Embeddings note:** The config default embedding model is `qwen3-embedding:0.6b`
> (1024d — see `massa-ai-config.ts`), a smaller/faster model than the prior
> default (`qwen3-embedding:4b`, 2560d). Override via `OLLAMA_EMBEDDING_MODEL`
> or config `embedding.model`, and move `embedding.dimensions` with it — a
> width that disagrees with what the model returns fails loudly rather than
> degrading. On LM Studio, `LMSTUDIO_EMBEDDING_MODEL` defaults to
> `text-embedding-qwen3-embedding-0.6b` (1024d, resolved automatically);
> override `LMSTUDIO_EMBEDDING_DIMENSIONS` alongside a different model the
> same way. **Breaking change if you upgrade an existing install:** switching
> the default moves every workspace's embedding width from 2560 to 1024
> dimensions, which invalidates the stored `embedding_fingerprint` and
> requires a full reindex (see the reindex command above) — the fingerprint
> gates fail closed with an actionable message rather than silently mixing
> widths. Retrieval quality at 1024 dimensions has not been re-measured
> against the retired 2560-dimension default.

> **Switching providers:** changing `embedding.provider` or the embedding
> model changes what future searches expect the stored vectors to look like.
> massa-ai stamps a per-project embedding fingerprint and blocks search with a
> named error until you run a full reindex (the reindex command above forces
> one with `"force": true`). **This protects only projects that have been
> fully reindexed since the fingerprint was introduced** — an existing project
> with no stamped fingerprint is treated as legacy and is not blocked; it gets
> protected starting from its next full reindex.

---

## Passive Capture (Hooks)

Passive capture streams agent lifecycle events into massa-ai as Observations,
so the agent's behaviour is recorded without any change to how you prompt.

- **Fire-and-forget:** each hook POSTs to the endpoint with a **2s timeout** and
  always `exit 0`. The agent is never blocked, even if the API is down.
- **No stdout:** scripts produce no output.
- **Empty stdin is a no-op:** if a hook fires with no payload, the script exits
  without posting (the API requires a non-empty payload object).

### Install hooks for your tool

All four tools have plugin installers that **auto-write** the hooks config (not
just print it) using array-append merge with backup + `_massaAiOwned` marker,
so user hooks are always preserved:

```bash
bash apps/claude-plugin/install.sh --user   # 5 events → ~/.claude/settings.json
bash apps/codex-plugin/install.sh --user    # 6 events → ~/.codex/hooks.json
bash apps/cursor-plugin/install.sh --user   # 7 events → ~/.cursor/hooks.json
```

OpenCode has **in-process hooks** — nothing to merge into a `hooks.json`:

```bash
bash apps/opencode-plugin/install.sh --user   # 6 in-process lifecycle handlers
```

Or pick the `p` option from the root `bash install.sh` post-install menu, which
offers all four plugin choices plus an "All four" shortcut. The `k` option in
the same menu opens the harness sub-menu (skills only, MCP only, everything
including plugin bundles, or a dry-run preview). See
[§Integration](#integration) for per-plugin details.

### What each hook captures

Six lifecycle event kinds are recognised: `session-start`, `user-prompt`,
`pre-tool-use`, `post-tool-use`, `pre-compact`, `session-end`. The `pre-compact`
hook does a dual-POST (observation + snapshot to `/api/v1/hook/compact-snapshot`)
to build a bounded, reference-based table-of-contents of the session's
observations — zero loss across `/compact`.

### Events wired per tool

**Claude Code (5 events)** — wired by `apps/claude-plugin/install.sh` into
`settings.json` (nested matcher-group + `hooks[]` form):

| Claude event | Binary subcommand | Observation `source` |
|--------------|--------------------|----------------------|
| `SessionStart` | `session-start` | `session-start` |
| `UserPromptSubmit` | `user-prompt-submit` | `user-prompt` |
| `PostToolUse` | `post-tool-use` | `post-tool-use` |
| `PreCompact` | `pre-compact` | `pre-compact` |
| `Stop` | `stop` | `session-end` |

**Codex (6 events)** — wired by `apps/codex-plugin/install.sh` into
`~/.codex/hooks.json`:

| Codex event | Binary subcommand | Observation `source` |
|-------------|--------------------|----------------------|
| `SessionStart` | `session-start` | `session-start` |
| `UserPromptSubmit` | `user-prompt-submit` | `user-prompt` |
| `PreToolUse` | `pre-tool-use` | `pre-tool-use` |
| `PostToolUse` | `post-tool-use` | `post-tool-use` |
| `PreCompact` | `pre-compact` | `pre-compact` |
| `Stop` | `stop` | `session-end` |

> **Trust step (Codex only):** after install, run `/hooks` in Codex to trust
> massa-ai hooks — Codex skips non-managed plugin hooks until trusted.

**Cursor (7 events)** — wired by `apps/cursor-plugin/install.sh` into
`~/.cursor/hooks.json`:

| Cursor event | Binary subcommand | Observation `source` |
|--------------|-------------------|----------------------|
| `sessionStart` | `session-start` | `session-start` |
| `sessionEnd` | `stop` | `session-end` |
| `beforeSubmitPrompt` | `user-prompt-submit` | `user-prompt` |
| `preToolUse` | `pre-tool-use` | `pre-tool-use` |
| `postToolUse` | `post-tool-use` | `post-tool-use` |
| `preCompact` | `pre-compact` | `pre-compact` |
| `stop` | `stop` | `session-end` |

**OpenCode (in-process, 6 lifecycle handlers)** — registered by the plugin
itself (local install or `@massa-ai/opencode-plugin`), no external hooks file:
`session.created`, `tool.execute.after`, `experimental.session.compacting`,
`shell.env`, `event`, `dispose`.

### Env

| Variable | Default | Notes |
|----------|---------|-------|
| `MASSA_AI_API_BASE` | `http://localhost:3333` | Tools API base URL |
| `MASSA_AI_API_KEY` | auto-provisioned | Required by every route except `/health`, `/swagger` and `/ui`. Generated on first API start and saved to `security.apiKey` in `~/.config/massa-ai/config.json`; set this only to pin a specific value. See [docs/web-ui-access.md](./docs/web-ui-access.md) |
| `MASSA_AI_PROJECT_ID` | cwd basename | Project the observations attach to |

### Non-Claude hosts

Use the MCP tool `hook_ingest`, or POST directly to
`/api/v1/hook/batch` with `{ events: [...] }` — useful for Docker deployments
where the repo (and hook scripts) aren't on the host filesystem.

### For a complete feature reference

See [FEATURES.md](./FEATURES.md) for every feature, what it does, why it exists,
and how to use it.

---

## Web UI

Read-only browser for memories, search, handoffs, and checkpoints, served by
the Tools API.

- **URL:** `http://localhost:3333/ui`
- **Run:** `bun run dev:api` (the UI is served by the API — there is no separate
  UI dev script). See [§Scripts](#scripts).
- **Disable:** set `WEB_UI_ENABLED=false` (the `/ui` prefix then returns 404).

```bash
bun run dev:api
# then open http://localhost:3333/ui
```

> The `dev:ui` script was removed — `@massa-ai/ui-client` (its target) did not
> exist. The web UI is served exclusively via `dev:api` at `/ui`.

---

## Search Quality Tuning

Environment variables for fine-tuning retrieval (all optional). LLM-gated
knobs (`SEARCH_QUERY_UNDERSTANDING_*`, `SEARCH_RERANK_*`) default **OFF** and
require `MASSA_AI_LLM_ENABLED=true`.

**See [FEATURES.md](./FEATURES.md#search-quality-tuning) for the full table**
of search quality variables and defaults.

---

## REST API

```bash
# Development
bun run dev:api

# Production
bun run start:api
```

Swagger docs: `http://localhost:3333/swagger` · Web UI: `http://localhost:3333/ui`

### Authentication (required)

Every route except `/health`, `/swagger`, `/swagger/json` and `/ui` requires an
`x-api-key` header. There is no supported way to run the API unauthenticated — it binds
`0.0.0.0`, and the executor routes run commands.

You do not have to create the key. On first start the API generates one and saves it to
`security.apiKey` in `~/.config/massa-ai/config.json`, logging the *path* and never the
value. It refuses to start only when no key exists **and** that file cannot be written.
Set `MASSA_AI_API_KEY` only to pin a specific value; env wins over `config.json`.

```bash
# Read the provisioned key
grep -A2 '"security"' ~/.config/massa-ai/config.json

curl -X POST http://localhost:3333/api/v1/search/project \
  -H "x-api-key: $MASSA_AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "auth", "projectId": "my-project"}'
```

The Web UI needs no configuration on a normal local install: `/ui` is served with the key
embedded for loopback callers only. A browser reaching it from anywhere else gets a
configure-access screen instead — see [docs/web-ui-access.md](./docs/web-ui-access.md),
which also covers the Docker case and the reverse-proxy limitation.

Cross-origin browser access is closed by default. Add exact origins through
`MASSA_AI_API_CORS_ORIGINS` (comma-separated) when you need it; `*` together with
credentials is rejected at startup rather than served.

### Endpoints

> The examples below omit `-H "x-api-key: …"` for brevity. Every one of them requires it.

```bash
# Index a project
curl -X POST http://localhost:3333/api/v1/project/index \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/home/user/my-project", "projectId": "my-project"}'

# Search
curl -X POST http://localhost:3333/api/v1/search/project \
  -H "Content-Type: application/json" \
  -d '{"query": "authentication", "projectId": "my-project"}'

# Store memory
curl -X POST http://localhost:3333/api/v1/memory/store \
  -H "Content-Type: application/json" \
  -d '{"content": "Important decision...", "type": "decision"}'

# Update a memory (re-embeds on content change)
curl -X POST http://localhost:3333/api/v1/memory/update \
  -H "Content-Type: application/json" \
  -d '{"id": "<memory-id>", "content": "Updated...", "mergeTags": true}'

# List memories — level filter: 1=Project, 2=User, 3=Session
curl -X POST http://localhost:3333/api/v1/memory/list \
  -H "Content-Type: application/json" \
  -d '{"projectId": "my-project", "level": 1}'

# Compress context
curl -X POST http://localhost:3333/api/v1/context/compress \
  -H "Content-Type: application/json" \
  -d '{"content": "...", "strategy": "code_structure"}'

# Bootstrap a project (seed memories)
curl -X POST http://localhost:3333/api/v1/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"projectId": "my-project", "projectPath": "/abs/path"}'

# Passive capture — batch lifecycle events
curl -X POST http://localhost:3333/api/v1/hook/batch \
  -H "Content-Type: application/json" \
  -d '{"events": [{"event": "user-prompt", "projectId": "my-project", "payload": {"prompt": "..."}}]}'

# Begin a cross-session handoff
curl -X POST http://localhost:3333/api/v1/handoff/begin \
  -H "Content-Type: application/json" \
  -d '{"projectId": "my-project", "summary": "WIP", "nextSteps": ["..."]}'

# Create a checkpoint
curl -X POST http://localhost:3333/api/v1/checkpoints/create \
  -H "Content-Type: application/json" \
  -d '{"taskId": "auth-refactor", "description": "mid-flight"}'

# List auto-improvement proposals
curl -X POST http://localhost:3333/api/v1/proposal/list \
  -H "Content-Type: application/json" \
  -d '{"projectId": "my-project"}'
```

---

## Configuration

Config file: `~/.config/massa-ai/config.json` (auto-created on first run).
Precedence is env > `config.json` > literal defaults. The canonical annotated
reference for every environment variable is
[`.env.example`](./.env.example) — mirror it into `.env` and edit there.

The `massa-ai-config` CLI (a bin of `@massa-ai/mcp-client`, and of
`@massa-ai/opencode-plugin`) is the front for everything stored there:

```bash
massa-ai-config show                              # current configuration
massa-ai-config path                              # config file path
massa-ai-config init --mistral your-api-key       # or --ollama (default) / --lmstudio / --openai <key>
massa-ai-config use ollama --model qwen3-embedding:0.6b   # or: use lmstudio --model text-embedding-qwen3-embedding-0.6b
massa-ai-config set embedding.dimensions 1024
massa-ai-config recover my-project --path /new/path   # re-associate a moved index
massa-ai-config profile list                      # shipped profiles + per-host active one
massa-ai-config profile set work --dry-run
massa-ai-config bootstrap list                    # the eight startup-contract rules
massa-ai-config bootstrap disable caveman
```

The two bins differ slightly: `recover` ships only on the `mcp-client` bin, and
`agents install|uninstall` only on the `opencode-plugin` bin.

**See [FEATURES.md](./FEATURES.md#configuration) for the complete environment
variable table, search quality tuning, operational knobs, embedding providers,
and config CLI commands.**

---

## Scripts

| Command | Description |
|---------|-------------|
| `bun run build` | Build all packages |
| `bun run dev` | Development (all apps) |
| `bun run dev:api` | REST API with hot reload (also serves the Web UI at `/ui`) |
| `bun run dev:mcp` | MCP server with watch |
| `bun run start:api` | Start REST API |
| `bun run start:mcp` | Start MCP server |
| `bun run test` | Workspace tests (turbo — does **not** reach `scripts/` or the plugin suites) |
| `bun run test:scripts` | Root-level suites: `scripts/__tests__` + `scripts/tests` |
| `bun run test:plugins` | All four plugin `__tests__/` directories |
| `bun run test:coverage` | The 90%-per-file coverage floor |
| `bun run lint` | Lint code (oxlint, `correctness` rules — CI-enforced) |
| `bun run lint:fix` | Apply oxlint's safe auto-fixes |
| `bun run type-check` | Type checking |
| `bun run generate:artifacts` | Regenerate the skill/agent/command bundles (add `--check` to diff only) |
| `bun run diagnose` | Validate full stack (inference provider, database, embeddings) |
| `bun run version:sync` | Bump root + workspace versions (all bumps go through this) |
| `bun run bench:fixture` | Run the massa-ai retrieval fixture benchmark |

> **`dev:ui` was removed.** Its target (`@massa-ai/ui-client`) did not exist.
> The Web UI is served by the Tools API at `http://localhost:3333/ui` — run it
> with `bun run dev:api`.

---

## Architecture

massa-ai/
├── apps/
│   ├── mcp-client/           # MCP Server (stdio) — 59 tools
│   ├── tools-api/            # REST API (port 3333) + Web UI at /ui
│   ├── web-ui/               # Read-only memory/search/handoff/checkpoint browser
│   ├── claude-plugin/        # Claude Code plugin (slash commands + subagent + hooks)
│   ├── codex-plugin/         # Codex plugin (skills + hooks + MCP)
│   ├── cursor-plugin/        # Cursor plugin (skills + hooks + MCP + agent)
│   └── opencode-plugin/      # OpenCode plugin (npm package, in-process hooks)
├── packages/
│   ├── core/                 # Business logic, search, embeddings, compression
│   └── shared/               # Shared types, config loader, utilities
└── scripts/

| Component | Description |
|-----------|-------------|
| **Semantic Search** | Hybrid vector + keyword with RRF ranking, `enriched` response mode |
| **Synapse** | Post-retrieval cognitive modulation: task alignment, agent affinity, working-memory buffer |
| **Symbol Graph** | PageRank-based centrality, definitions, references, go-to-definition |
| **Embeddings** | Ollama or LM Studio (local), or Mistral/OpenAI API |
| **Compression** | Rule-based code structure extraction (target 70% reduction) |
| **Memory** | Persistent PostgreSQL/pgvector storage across sessions |
| **Cache** | Multi-level L1/L2 with TTL |
| **Passive Capture** | Fire-and-forget hooks (Claude Code, Codex, Cursor, OpenCode) → Observations → LLM bridge → memories |
| **Bootstrap** | Repo scan (git log/README/docs/centrality) → idempotent seed memories |
| **Handoffs** | Cross-session structured records (summary/next-steps/files), dual-written as searchable memories |
| **Auto-improvement** | Rule-based pattern detection → proposals (auto-approve or review-gated) |
| **Web UI** | Read-only browser served by the Tools API at `/ui` |

### Understanding the codebase

New to the repo? **[docs/ONBOARDING.md](./docs/ONBOARDING.md)** is a generated guide to the
runtime architecture: the nine layers, the seven recurring patterns (two-transports-one-contract,
LLM-off-by-default, `get*()`/`reset*()` factories, blue-green symbol-graph generations), a
13-step guided tour, a per-layer file map, and the complexity hotspots worth approaching
carefully.

It is generated from a knowledge graph of the source tree — 1847 nodes, 4226 edges — built
with the [Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) plugin. The
graph itself lives in `.ua/knowledge-graph.json` and is pinned to the commit it was built
from, so it goes stale as `main` moves. Regenerate both when it drifts:

```bash
/understand              # rebuild .ua/knowledge-graph.json (scoped by .ua/.understandignore)
/understand-dashboard    # interactive graph explorer on 127.0.0.1:5173
/understand-onboard      # regenerate docs/ONBOARDING.md from the graph
```

Two caveats worth knowing before you trust it:

- **The graph covers `src/` trees only** — 733 of 2094 tracked files. `scripts/`, `prisma/`,
  `skills/`, `.specs/`, `benchmarks/`, and the four generated `apps/*-plugin/` duplicate
  trees are excluded by `.ua/.understandignore`. So `ONBOARDING.md` describes the runtime
  architecture completely, but says nothing about the release chain, the agent-harness
  surface, or the Prisma schema. It names those gaps and points at `CLAUDE.md` and
  `CONTRIBUTING.md` for each.
- **Barrel `index.ts` files show as graph orphans.** A re-export (`export * from`) is not a
  value import, so static analysis does not trace through it. That isolation is an artifact,
  not dead code.

`ONBOARDING.md` is a convenience, not a source of truth. `CLAUDE.md`, `CONTRIBUTING.md`, and
`.specs/` remain canonical.

---

## Structural indexing (polyglot native Tree-sitter)

massa-ai indexes code with **pinned native Tree-sitter grammars** across all
33 canonical source extensions, producing a versioned symbol/edge graph ranked by
dependency centrality. The native runtime is correct and verified; no WASM or
runtime/post-install download is used.

**Native target:** macOS arm64 and Linux glibc x64. Application runtime is
**Bun `1.3.14`**; **Node `25.9.0`** (npm `11.14.1`) is a build-only `node-gyp`
helper.

**Performance status:** Correct and verified. The perf contract (MLTS-022) was
reframed (spec-owner approved, 2026-07-17): the hard gate is the 16 MiB
disposal-stress native-retention test (PASS); throughput/RSS are an absolute
self-baseline, not a regex-relative threshold.

**See [FEATURES.md](./FEATURES.md#structural-indexing-polyglot-native-tree-sitter)**
for supported languages, capability tiers, graph schema, FQN identities,
embedded parsing, verification commands, and performance details.

---

## Releases

Releases are automatic. Merging a PR into `main` with a green CI run cuts the next
version, tags it, publishes a GitHub Release, and pushes the packages to both registries —
there is no manual release step.

The version comes from the `[Unreleased]` section of [`CHANGELOG.md`](./CHANGELOG.md):
feature-shaped entries cut a minor, bug-shaped entries cut a patch, and majors are only
ever bumped by hand. Contributors — the exact heading-to-bump mapping lives in
[`CONTRIBUTING.md`](./CONTRIBUTING.md), and the heading you write decides the released
version.

### Installing

The same build ships to two registries under two scopes.

**npmjs.org** — the public packages, no configuration needed:

```bash
npm install @massa-ai/core
```

**GitHub Packages** — mirrored under `@luizgmassa`, because GitHub Packages requires the
npm scope to equal the repository owner. Add this to `.npmrc` first:

```ini
@luizgmassa:registry=https://npm.pkg.github.com
```

```bash
npm install @luizgmassa/core
```

Both carry identical code at identical versions; only the scope differs.

---

## Credits

massa-ai builds on ideas and inspiration from these open-source projects:

- **[th0th](https://github.com/S1LV4/th0th)** — the semantic code-search and memory platform this project is built on
- **[ai-memory](https://github.com/akitaonrails/ai-memory)** — persistent agent memory concepts
- **[codebase-context-mcp](https://github.com/DeusData/codebase-memory-mcp)** — MCP-based codebase context indexing
- **[context-memory](https://github.com/mksglu/context-memory)** — cross-session context and memory persistence
- **[code-context-engine](https://github.com/elara-labs/code-context-engine)** — index codebase, agents search instead of reading files

## License

MIT
