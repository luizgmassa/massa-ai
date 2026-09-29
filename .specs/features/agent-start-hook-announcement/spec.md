# Feature: agent-start-hook-announcement

Workflow: `feature` (explicit route, Standard tier). Session: `feature-agent-start-hook-announcement`.

## Request (user, 2026-09-29)

massa-ai must always show on the Claude Code screen, during the session, a message when an
agent is started, naming the model and effort massa-ai assigns to it, through Claude Code's
`PreToolUse` hook. The prompt-level (non-deterministic) version of this in massa-ai's rules,
skills and workflows is removed, leaving it to a deterministic hook.

## Decisions (user, 2026-09-29, via AskUserQuestion)

- D1 Remove the prose rule for every host **and** add hooks for all four hosts.
- D2 Announce massa-ai roster agents only; foreign agents (Explore, general-purpose, ...) stay silent.
- D3 Delivery authorized through PR creation; merge stays with the user.
- D4 Cursor is skipped and documented: its `preToolUse`/`subagentStart` hooks document
  `user_message` as shown only when the action is denied (cursor.com/docs/hooks), and the
  generated Cursor agents carry `model: inherit` with no effort.

## Evidence

- Claude (code.claude.com/docs/en/hooks): `systemMessage` is a "Warning message shown to the
  user"; PreToolUse plain stdout goes to the debug log only; omitting `permissionDecision`
  leaves the normal permission flow. The subagent tool is `Agent`; its `model` input takes
  precedence over the agent definition's `model` frontmatter.
- Codex (learn.chatgpt.com/docs/hooks; openai/codex `1983c48f`): `SubagentStart` carries
  `agent_type` (the role name) and `model`; JSON stdout `systemMessage` renders as a
  `↳ Hook ·` warning line. PreToolUse only exposes `agent_type` behind a config flag, so
  `SubagentStart` is the reliable trigger. Custom agents are matched by their TOML `name`.
- OpenCode (`@opencode-ai/plugin` 1.17.13): `tool.execute.before(input: {tool}, output: {args})`
  fires for tool `task` with `args.subagent_type`, including user `@agent` subtasks;
  `client.tui.showToast` displays without affecting the tool. Agent name is the file name.

## Acceptance criteria

- **AC1** Claude: dispatching a massa-ai agent (`massa-ai:<name>` → the plugin bundle's
  `agents/<name>.md`; bare `<name>` → `<cwd>/.claude/agents` then `~/.claude/agents`) prints
  exactly one `{"systemMessage": "🤖 [massa-ai] Agent dispatch: <name> — model <m>, effort <e>"}`
  read from the owned file's frontmatter; absent keys print `inherit`. A `model` on the call
  or a non-`inherit` `CLAUDE_CODE_SUBAGENT_MODEL` is appended as a runtime override.
- **AC2** Silent-degrade: non-`Agent`/`Task` tools, foreign agents, files without the
  ownership marker, path-shaped names, and malformed stdin print nothing and exit 0.
  `agent-start` never POSTs an observation and never sets a permission decision.
- **AC3** Registration: `hooks/hooks.json`, `settings.json.template` and `install.sh`
  register `PreToolUse` (matcher `Agent|Task`) → `agent-start` and agree on every event,
  subcommand and matcher. Codex registers `SubagentStart` → `agent-start codex` in its
  `hooks/hooks.json` and `install.sh`.
- **AC4** Codex and OpenCode announce the same line from their installed agent files
  (`<CODEX_DIR>/agents/<name>.toml` with `# massa-ai-owned` and a matching `name`;
  OpenCode `<project>/.opencode/agents` then `$XDG_CONFIG_HOME|~/.config/opencode/agents`,
  `model:`/`reasoningEffort:`), OpenCode through a TUI toast.
- **AC5** The prose rule is gone: no contract, reference, workflow or agent charter asks the
  orchestrator to restate a sub-agent's model or effort, guarded by a sweep sensor.

## Out of scope

Cursor (D4). Observation capture for `agent-start` (it only announces). Changing how
agent files are generated.
