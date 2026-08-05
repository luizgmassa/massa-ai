---
name: profile
description: Switch the installed massa-ai agents to a registry model profile (e.g. "work", "cheap", "home") or report the currently active profile per host. Use when the user asks to change/switch the model profile, asks which models the agents currently use, or asks to preview a profile switch. Do NOT use for editing the model registry itself (a registry edit is a massa-ai repository change, not a runtime switch) and do NOT claim the new profile is active before the user restarts the host session.
license: MIT
metadata:
  author: Luiz Massa
  version: 1.0.0
---

# Profile Switch Skill

## Mission
Drive the one massa-ai model-profile switch engine and relay its report — never a second implementation.

## When To Use
- The user asks to switch, change, or set the model profile (by name, e.g. "work", "cheap", "home", "balanced").
- The user asks what profile is currently active, or which profiles are shipped.
- The user asks to preview a switch without applying it.

## How To Drive It
There is exactly one switch implementation (`@massa-ai/shared`'s switch engine); every front — this skill, the MCP tools, and both `massa-ai-config` CLIs — calls the same engine and returns the same per-host report shape. Prefer whichever front is already available in the session:

- **MCP tools** (preferred when the massa-ai MCP server is connected): call `profile_list` to report shipped profiles + per-host active profile + bundle version, and `profile_set` to switch (`{profile, host?, dryRun?}`).
- **CLI fallback**: `massa-ai-config profile list` / `massa-ai-config profile show` / `massa-ai-config profile set <name> [--host <h>] [--dry-run]`.

Default to a dry run first when the user has not explicitly asked to apply the switch immediately — `dryRun: true` (MCP) or `--dry-run` (CLI) previews the per-host plan and changes nothing.

## Relaying The Result
Always relay the per-host outcome and the restart notice verbatim in substance, not just "done":

- Report each host as switched / skipped (with its reason) / unsupported (with its reason) / failed (with its reason). Cursor is always reported skipped — every tier resolves to inherit, so switching it is a no-op by design, not an error.
- When at least one host switched (non-dry-run), state explicitly that a session restart of that host is required before the new models take effect — hosts load agent definitions at session start; there is no live in-session switch.
- On a dry run, say so and that no files changed.
- On a fully failed request (e.g. unknown profile name), relay the named error and the list of profiles the report says are actually available — never guess a profile name.

## Restrictions
- Never invent a profile name; only use names the engine's own report lists as shipped/available.
- Never claim a profile switch is "live" before the affected host's session restarts.
- Never edit the model-profile registry (`skills/model-profiles.json`) to satisfy a switch request — that is a build-time registry change owned by a different workflow, not a runtime switch.
