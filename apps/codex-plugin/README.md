# massa-ai — Codex plugin

A native Codex plugin bundle that makes massa-ai feel native in Codex CLI: semantic code search skills, the massa-ai MCP server, and passive lifecycle capture via 6 hook events.

## What you get

Skills (invocable via Codex `$` mentions):

| Skill | What it does |
|-------|--------------|
| `map` | Project map: stats, top central files, symbols by kind, languages, recent indexes |
| `index` | Index the cwd (polls status, reports ETA) |
| `find` | Semantic code search |
| `def` | Go-to-definition (exact then fuzzy fallback) |
| `graph` | Reference graph (who calls / imports / extends) |
| `status` | Workspaces health + search analytics |

MCP server: `massa-ai` (`npx @massa-ai/mcp-client` with `MASSA_AI_API_URL`) — registered into `~/.codex/config.toml` by `scripts/install-agents.sh`, which this installer calls for you. That script is the single writer of host MCP config; the plugin ships no `.mcp.json`.

Hooks: 6 Codex lifecycle events wired to the shared `massa-ai-hook` binary (fire-and-forget POSTs to the tools-api):

| Codex event | Binary subcommand | Lifecycle kind |
|-------------|-------------------|----------------|
| `SessionStart` | `session-start` | `session-start` |
| `UserPromptSubmit` | `user-prompt-submit` | `user-prompt` |
| `PreToolUse` | `pre-tool-use` | `pre-tool-use` |
| `PostToolUse` | `post-tool-use` | `post-tool-use` |
| `PreCompact` | `pre-compact` | `pre-compact` (dual-POST: observation + snapshot) |
| `Stop` | `stop` | `session-end` |

## Install

```bash
# user scope (~/.codex), default
apps/codex-plugin/install.sh

# or project scope (./.codex)
apps/codex-plugin/install.sh --project

# uninstall (removes only massa-ai-owned entries; user hooks preserved)
apps/codex-plugin/install.sh --uninstall
```

The installer copies the plugin bundle to `~/.codex/plugins/massa-ai/` (user) or `./.codex/plugins/massa-ai/` (project), creates the `massa-ai-hook` symlink to the repo's shared binary, and merges the 6 hook events into `~/.codex/hooks.json` (or `./.codex/hooks.json`) using an array-append merge that preserves any existing user hooks (a timestamped backup is written before the first write). Re-running is a no-op when massa-ai-owned entries already exist.

### Or install as a plugin

This is the route that makes massa-ai appear in `/plugins`:

```bash
codex plugin marketplace add ~/Projects/massa-ai
codex plugin add massa-ai@massa-ai
codex plugin list          # expect: massa-ai@massa-ai  installed, enabled
```

The marketplace manifest is `.agents/plugins/marketplace.json` at the repo root; the plugin manifest is `.codex-plugin/plugin.json` here. Codex copies the bundle to `~/.codex/plugins/cache/massa-ai/massa-ai/<version>/` — a *different* location from the flat `~/.codex/plugins/massa-ai/` the installer writes, and the only one Codex scans.

The two routes are **complementary, not exclusive**. A Codex plugin manifest has no `hooks` key (0 of the 203 manifests across Codex's bundled, curated and runtime marketplaces declares one), so the marketplace route delivers skills and the `/plugins` entry but no lifecycle capture. Run `install.sh` as well for hooks.

### Hook entry shape

Codex hook entries are matcher-groups whose `hooks` is an array:

```json
{ "hooks": [ { "type": "command", "command": "<bin> session-start" } ] }
```

Codex addresses hook state as `"<file>:<event>:<group>:<hook>"`. A flat entry — `type` and `command` at the top level, no inner array — has no `:<hook>` index, so Codex never enumerates it: it does not appear in `/hooks`, cannot be trusted, and never fires. Releases before 1.2.1 wrote exactly that shape; an install now migrates any owned flat entry to the nested form, leaving user entries untouched.

## Trust step (required)

Codex skips non-managed plugin hooks until they are trusted. After install, run:

```
/hooks
```

in Codex and trust the massa-ai hooks. **Without this step, no observations will be captured.**

## Prerequisites

- The massa-ai tools-api running (`bun run dev:api` from the massa-ai repo) so hook POSTs land at `http://localhost:3333`.
- [Bun](https://bun.sh) installed (the `massa-ai-hook` binary is a Bun script).
- The `massa-ai-hook` symlink points at `apps/claude-plugin/hooks/massa-ai-hook.ts` in this repo — keep the repo checkout present, or replace the symlink with a copy of the binary if you relocate.

## Local plugin dir discovery

Codex discovers plugins from `~/.codex/plugins/` (user scope) or `./.codex/plugins/` (project scope). The installer places the bundle at `~/.codex/plugins/massa-ai/` (or the project equivalent). Codex reads `.codex-plugin/plugin.json` for the manifest (`skills`, `hooks` pointers), then auto-loads `skills/*.md` and `hooks/hooks.json`. MCP is not bundled — it lives in `~/.codex/config.toml`.

## MCP ownership

`scripts/install-agents.sh` is the only writer of host MCP config. This installer calls it with `--agent codex --yes`, so there is exactly one `[mcp_servers.massa-ai]` table in `~/.codex/config.toml` no matter how many times you install.

MCP is always registered at **user** scope. A `--project` plugin install still writes `~/.codex/config.toml`.

Earlier versions copied a plugin-local `.mcp.json` into `~/.codex/plugins/massa-ai/`. That was never a Codex read path; reinstalling removes the stale file.