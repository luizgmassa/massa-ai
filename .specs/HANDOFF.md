# Handoff — plugin-architecture-unification (VALIDATED PASS; PR next — creation authorized this session, merge = user decision)

Previous handoffs closed: untracked-generated-bundles merged as PR #73 @
`40ec631a` (main, released v1.29.0).

Session `spec-plugin-architecture-unification` · workflow spec-driven (Large) ·
branch `spec/plugin-architecture-unification` from `96ee1850` with origin/main
(v1.29.0) merged at `bb3e90bf`. Contract files:
`.specs/features/plugin-architecture-unification/{spec,design,tasks,context,validation}.md`.

## Objective

AD-017 — plugins deliver, MCP serves tools, hooks observe. Four coordinated
changes: OpenCode installer registers MCP alongside the plugin (54 tools; skip
rule removed; uninstall preserves the entry), harness skip-current gated on
per-host on-disk sentinels (wiped installs self-heal), Cursor prefers the
Claude-bridge load with local fallback (hooks fire exactly once,
installRoute bridge|local recorded), OpenCode plugin hooks-only (14 in-process
tools removed). Folded baseline: cursor flat agents, opencode real-copy
plugin, install-skills cursor warning.

## State

- Commits: `f0d84a7e` specs → `0a81f85d` T1 → `bb3e90bf` merge → T2–T6
  (`7efd1633`, `4f198e82`, `251621ec`, `3b1a5642`, `c9aee7c3`) → T7–T10
  (`fca8e995`, `3fb8c44c`, `dc18ed30`, `186bbd12`) → `8376dee6` validation fix.
- Validation: PASS (iteration 2 of 3) — 17/17 ACs, 6/6 mutations killed,
  gates green (single-writer 57/0, plugin-auto-install 201/0, cursor 25/0,
  opencode 27/0 + package 125/0, parity 88/0, lint 0, test:plugins 119/0,
  test:scripts 1455/0). Iteration-1 gap: PAU-14 "in-process `profile` tool"
  phrase outside the T9 sweep literals — class enumerated (pop 142), 2 live
  rows fixed; verifier re-derived independently (184-row superset, 0 live).
- ADR: `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md` +
  AD-017 row in STATE.md Decisions (duplicate `## Decisions` heading noted,
  canonical = the AD-016 table).
- Lessons: L-021 recorded by verifier (sweep-literal class gap).

## Next Step

Push branch + `gh pr create` (authorized at Execute start this session), CI
watch. After merge, the user runs the staged machine repairs (this machine's
wiped `~/.cursor` artifacts + opencode plugin/MCP refresh):

```bash
bun run build                       # fresh opencode dist for the real-copy install
bash scripts/install-harness.sh     # sentinel probe now sees the wipe → reinstalls cursor; re-registers opencode MCP
# then verify: ls ~/.cursor/agents/massa-ai-*.md | wc -l   (expect 17)
#              /usr/bin/grep -c '"massa-ai"' ~/.config/opencode/opencode.json*  (MCP entry present)
```

Live once-only Cursor hook check (bridge route): restart Cursor, confirm one
massa-ai load line in the "Cursor Plugins" exthost log and single hook events.
