# massa-ai — Claude Code plugin

Slash commands and a specialized subagent that make massa-ai feel native in Claude Code.

## What you get

Slash commands (installed as `/massa-ai-*`):

| Command | What it does |
|---------|--------------|
| `/massa-ai-map` | Project map: stats, top central files, symbols by kind, languages, recent indexes |
| `/massa-ai-index [projectId]` | Index the cwd (polls status, reports ETA) |
| `/massa-ai-find <query>` | Semantic code search |
| `/massa-ai-def <symbol>` | Go-to-definition (exact then fuzzy fallback) |
| `/massa-ai-graph <symbol>` | Reference graph (who calls / imports / extends) |
| `/massa-ai-status` | Workspaces health + search analytics |

Subagent:

- **`massa-ai-navigator`** — exploration specialist that prefers semantic queries over blind file reads. Protects the parent agent's context during large investigations.

## Install

```bash
# user scope (~/.claude), default
apps/claude-plugin/install.sh

# or project scope (./.claude)
apps/claude-plugin/install.sh --project
```

Restart Claude Code to pick up the new commands.

### Or install as a plugin

This is the route that makes massa-ai appear in `/plugin`:

```
/plugin marketplace add ~/Projects/massa-ai
/plugin install massa-ai@massa-ai
/reload-plugins
```

The marketplace manifest is `.claude-plugin/marketplace.json` at the repo root;
the plugin manifest is `.claude-plugin/plugin.json` here. Commands installed this
way are namespaced (`/massa-ai:find` rather than `/massa-ai-find`).

Claude Code **copies** the plugin directory into a cache on install, so the
plugin can only reference files inside itself — `hooks/hooks.json` addresses the
hook binary through `${CLAUDE_PLUGIN_ROOT}`, never an absolute repo path.

Because the plugin ships hooks, running `install.sh` afterwards would wire a
second copy of all 5 events. It doesn't: the installer checks
`~/.claude/plugins/installed_plugins.json` for a `massa-ai@*` entry and skips its
hook merge when it finds one. The check fails open — a missing or malformed
registry never blocks an install. Note it resolves from `$HOME` even under
`--project`, because Claude Code records plugin installs at user scope
regardless of install scope.

Neither manifest carries an `mcp` key: `scripts/install-agents.sh` is the single
writer of host MCP config, and it writes to `~/.claude.json` (not
`~/.claude/settings.json`, which holds only approval controls and hooks).

## Prerequisites

The massa-ai MCP server must be registered for Claude Code. See `apps/mcp-client/README.md`.

A quick check after install:

```
/massa-ai-status
```

If nothing shows up, the MCP server probably isn't running — start it with the dev-server command from the massa-ai repo.
