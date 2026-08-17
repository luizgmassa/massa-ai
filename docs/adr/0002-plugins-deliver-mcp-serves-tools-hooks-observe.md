# ADR 0002: Plugins Deliver, MCP Serves Tools, Hooks Observe

**Date**: 2026-08-05
**Status**: Accepted
**Recorded as**: AD-017 (`.specs/project/STATE.md` `## Decisions`)

## Context

The four host plugins (Claude, Codex, Cursor, OpenCode) had drifted onto three
different architectures for the same product:

1. **OpenCode shipped 14 in-process tools and its installer removed the
   host's MCP entry as "redundant."** That premise was false: the MCP server
   exposes 54 tools (`apps/mcp-client/src/tool-defs/tool-defs-*.ts`:
   hooks-exec 14, memory 11, project 12, search 7, synapse 10), so OpenCode
   users had 14 of 54 — every Synapse tool, graph/trace tool, checkpoint,
   handoff, `execute`/`execute_file`, and project-admin tool was silently
   missing. The installer's `opencode_plugin_present()` skip
   (`scripts/install-agents.sh:573-597,641-642`, since removed) treated the
   plugin's own presence as a reason not to register the tool surface it
   depends on.
2. **Cursor 3.14 loads massa-ai twice.** Once from
   `~/.cursor/plugins/local/massa-ai/` (the local installer copy) and again
   through Cursor's Claude-marketplace bridge from `~/.claude` — verified
   live in "Cursor Plugins" exthost logs, both paths registering the same
   hook wiring, risking double hook firing per event.
3. **An external wipe exposed a version-record-only skip.** On 2026-08-05,
   something outside this repo's control deleted `~/.cursor/agents` and
   `~/.cursor/plugins/local/massa-ai` minutes after install (marker file
   `~/.cursor/projects/.agent-data-cleanup-2026-08-05`). The harness plugin
   phase trusted `install-state.json`'s recorded version against the bundle
   version with no on-disk check, so it reported `skip-current` forever with
   zero artifacts actually present.

Docs also claimed 52 MCP tools; the measured count was 54.

## Decision

**Plugins deliver. MCP serves tools. Hooks observe.**

- A plugin is a **delivery vehicle**: it ships agents, skills, hooks, and
  host-specific wiring. It is not a tool-serving mechanism.
- The MCP server registered by `scripts/install-agents.sh` (the single
  writer of host MCP config — `scripts/tests/test-mcp-single-writer.sh`) is
  the **one canonical tool surface**, currently 59 tools across
  hooks-exec/memory/project/search/synapse (54 at this ADR's writing;
  portal-handoff-proposal-crud's T10 added 5 handoff/proposal PATCH/DELETE/
  create tools to hooks-exec since — see CLAUDE.md's tool-count history).
- **Hooks are host-native and always on**, independent of any tool
  registration path.
- **In-process tools are never a coverage mechanism.** No plugin may treat
  its own in-process tool set as a substitute for MCP registration, and no
  installer may skip MCP registration because a plugin happens to expose an
  overlapping tool locally.

Four coordinated changes implement this (`plugin-architecture-unification`
feature, PAU-01 through PAU-14):

1. OpenCode's installer stops removing the MCP entry and delegates
   registration to `scripts/install-agents.sh --agent opencode`, mirroring
   the codex pattern (`apps/codex-plugin/install.sh:699-715`);
   `install-agents.sh` drops its plugin-presence skip so the entry is always
   written.
2. The harness plugin phase gates `skip-current` on a per-host,
   `installRoute`-keyed presence probe (sentinel); an absent sentinel
   triggers reinstall instead of a permanent skip.
3. The Cursor installer prefers the Claude-bridge load path when the Claude
   marketplace registry lists massa-ai — skipping the local plugin copy and
   its hook wiring so hooks fire exactly once — with the local install
   preserved as fallback, and `installRoute: "bridge"|"local"` recorded.
4. The OpenCode plugin drops its 14 in-process tools and keeps only event
   handlers (`apps/opencode-plugin/src/index.ts`), closing the 14-vs-54 gap
   the MCP registration in item 1 opened up correctly. Items 1 and 4 land in
   the same release so the tool-surface overlap window never ships on its
   own.

## Alternatives Considered

- **Hybrid in-process hot-path tool subset on OpenCode** — keep a small set
  of frequently-used tools in-process for latency, MCP for the rest.
  Rejected: it depended on an OpenCode per-server tool-disable configuration
  that was never verified to exist, and it re-introduces exactly the
  dual-surface confusion this ADR exists to close.
- **Prefer-local Cursor dedupe** — keep installing the local plugin copy and
  document that users should disable the Claude bridge. Rejected: the
  bridge is host behavior an installer cannot suppress; the local copy is
  the one thing fully within this project's control, so withholding it is
  the only mechanism that actually converges to a single load.

## Consequences

- The OpenCode plugin is hooks-only: `apps/opencode-plugin/src/index.ts`
  registers zero `tool({...})` entries. Its event handlers stay — OpenCode
  has no external/host-native hook surface the way Claude Code does, so the
  in-process `event`/lifecycle hooks are the only mechanism for observation
  on that host.
- The 14-tool overlap window between the OpenCode plugin's old in-process
  tools and the MCP server's equivalents closes in the same release that
  restored MCP registration — it never ships as a standalone state.
- **Bridge-route Cursor installs lose hooks if the Claude plugin is later
  removed.** The Cursor sentinel (flat agents at `~/.cursor/agents/`) still
  reports present, so the harness will not falsely reinstall, but hook
  wiring is gone until the next harness/installer run, which converges back
  to the local-fallback branch. Recovery: re-run the installer or harness.
- **A standalone plugin uninstall leaves the MCP entry.** Plugin lifecycle
  is no longer coupled to tool-surface lifecycle (PAU-03, user-confirmed) —
  `apps/opencode-plugin/install.sh --uninstall` removes only the owned
  plugin file and config entry. Removal of the MCP entry itself goes through
  `bash scripts/install-agents.sh --agent <host> --uninstall`.
- **Stale local-path MCP command if the checkout is deleted after a
  standalone plugin uninstall.** This is an accepted, pre-existing class
  shared by every host that registers a local (`local`-source) MCP command —
  not new to this change. Recovery is the same: re-run
  `scripts/install-agents.sh --agent <host>`.
- In-process tools are permanently retired as a coverage mechanism across
  all four plugins: an installer or plugin author adding a new in-process
  tool without also registering it through the MCP single writer is
  reintroducing the defect this ADR closes.

## Evidence

- `.specs/features/plugin-architecture-unification/{spec,design,tasks}.md`
- `scripts/tests/test-mcp-single-writer.sh`, `scripts/tests/test-plugin-auto-install.sh`
- `apps/opencode-plugin/src/__tests__/index.test.ts` (hooks-only contract test)
- `apps/mcp-client/src/tool-defs/tool-defs-*.ts` (54-tool count)
