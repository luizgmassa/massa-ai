---
name: bootstrap
description: Inspect or toggle the massa-ai startup-contract rules (caveman, massa-ai-router, persona-router, dedupe-guardrails, plan-challenge, conversation-feedback, indexing-hygiene, english-code, code-comments) that the installed MASSA-AI.md delivers to this host. Use when the user asks which startup rules are active, asks to turn one on or off, or asks why a rule is or is not being applied. Do NOT use for editing the rule text itself (that is a massa-ai repository change, not a runtime toggle) and do NOT claim a toggle is live before the user restarts the host session.
license: MIT
metadata:
  author: Luiz Massa
  version: 1.0.0
---

# Bootstrap Rule Toggle Skill

## Mission
Drive the one massa-ai bootstrap toggle engine through its CLI and relay the engine's own per-host report — never a second toggle path, never a hand-edited `MASSA-AI.md`.

## When To Use
- The user asks which startup-contract rules are active, or what a rule does.
- The user asks to enable or disable one rule by id.
- The user asks to preview a toggle without applying it.
- The user asks why a rule appears not to be in force on this host.

## How To Drive It
`massa-ai-config` is the only front for this surface. There is no `bootstrap_*` MCP tool, deliberately: the toggle has to keep working when the massa-ai MCP server is unreachable, because that is exactly the state a user is in after disabling `massa-ai-router` — the rule that loads the router which would otherwise drive the toggle. Never reach for an MCP call here, and never fall back to editing a rendered file by hand.

```
massa-ai-config bootstrap list                  # every rule: id, current state, default, description
massa-ai-config bootstrap show                  # same output as list
massa-ai-config bootstrap enable <rule-id>  [--dry-run]
massa-ai-config bootstrap disable <rule-id> [--dry-run]
```

Run `bootstrap list` before any toggle, so the reported change is against a state that was read, not assumed. Default to `--dry-run` first when the user has not explicitly asked to apply the change immediately: a dry run persists nothing at all — not the preference either — and only previews the per-host delivery plan.

`--target <dir>` exists for scratch homes and requires `--yes`; it redirects only where the contract is *rendered*. The preference itself is always persisted to `~/.config/massa-ai/config.json`, so under a redirected target the CLI names both paths on stderr. Do not pass `--target` unless the user asked for a specific directory.

## The Rule Ids
Exactly nine ids exist, and only these are accepted. There is no protected subset — every one of them can be switched both ways, including `massa-ai-router`.

- `caveman` — keep communication compressed while preserving technical accuracy. Default: enabled.
- `massa-ai-router` — load the massa-ai skill as the workflow router before substantive work. Default: enabled.
- `persona-router` — select one cataloged specialist persona after massa-ai context is available. Default: enabled.
- `dedupe-guardrails` — reuse already-loaded massa-ai context instead of bulk-loading workflows or references. Default: enabled.
- `plan-challenge` — run The Fool as a post-plan challenge gate per the configured policy. Default: enabled.
- `conversation-feedback` — emit chat-visible status updates for massa-ai workflow progress. Default: enabled.
- `indexing-hygiene` — ignore build output, dependency, and secret paths during indexing and context loading. Default: enabled.
- `english-code` — write generated code, identifiers, comments, and commit-facing artifacts in English regardless of conversational language. Default: enabled.
- `code-comments` — require API doc blocks and rationale comments on generated code. Default: **disabled**.

Never invent an id. An unrecognised id is refused before anything is read or written, and the error names the id and lists all nine — relay that list rather than guessing what the user meant.

Disabling `massa-ai-router` is allowed and is the user's call. Say plainly that it removes the router which reads the startup contract, and that the recovery is this same CLI (`massa-ai-config bootstrap enable massa-ai-router`), which is a binary and not a rule, so it stays reachable.

## Relaying The Result
Always relay the per-host outcome and the restart notice verbatim in substance, not just "done". The report prints one line per host, each carrying its own status literal:

- `written` — the contract was written and this host loads it.
- `written-not-wired` — the contract was written, but **nothing on this host loads it**. Never collapse this into `written` and never report it as success: the command exits non-zero on it. Relay the reason as the engine states it — which artifact is missing, in which file — together with its remedy, `scripts/install-skills.sh --apply`, and say the toggle will not take effect on that host until the wiring is added.
- `skipped` — a byte-identical re-apply whose wiring is already present. Relay its reason; a bare "skipped" does not distinguish "already up to date" from any other no-op.
- `failed` — relay the reason that host failed for.

Three further lines carry meaning and must not be dropped:

- **No host installed.** When no host is recorded, the report says so and the command exits 0. That is "nothing to do", not "nothing happened" — say which it is.
- **Ignored persisted state.** A persisted entry that is not a known rule id with a boolean value is reported once and is never fatal. Relay the names.
- **Restart.** When at least one host was written in a non-dry-run pass, the report states that a host session restart is required. Say so explicitly, and never claim a toggle is already in force before that restart — hosts load the startup contract at session start; there is no live in-session reload.

On a dry run, say so and that no files changed.

## Restrictions
- Never use an MCP tool for this surface; none exists. The CLI must keep working with the MCP server unreachable.
- Never invent, abbreviate, or pluralise a rule id; use only the nine ids above, exactly as the engine lists them.
- Never hand-edit a delivered `MASSA-AI.md`, a host's `AGENTS.md`, or `~/.config/massa-ai/config.json` to satisfy a toggle request — the engine owns those bytes, and a hand edit is overwritten by the next apply.
- Never edit the rule text itself to satisfy a toggle request; that is a massa-ai repository change owned by a different workflow.
- Never claim a toggle is live before the affected host's session restarts.
- Never report a `written-not-wired` host as switched.
