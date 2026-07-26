# Install Harness Migration — Specification

Migrate the two TypeScript installers to bash, make `install-agents.sh` the single
writer of host MCP config, and wire skills/agents/plugins installation into both
top-level entry points.

## Requirements

- IHM-R1: `scripts/install-skills.sh` replaces `scripts/install-skills.ts` with an
  identical CLI contract (flags, exit codes, marker strings, platform roots).
- IHM-R2: `scripts/install-agents.sh` replaces `scripts/install-agents.ts` with an
  identical CLI contract (flags, exit codes, ownership marker, backup convention).
- IHM-R3: All JSON/TOML manipulation runs inside an inline `node`/`bun` heredoc,
  matching `apps/claude-plugin/install.sh:61-153`. Exit 3 when neither runtime exists.
- IHM-R4: `scripts/install-agents.sh` is the **only** path that writes host MCP config.
  Plugin installers delegate to it; the inert `apps/codex-plugin/.mcp.json` and
  `apps/cursor-plugin/mcp.json` copies are removed.
- IHM-R5: OpenCode MCP registration is skipped **only when** the OpenCode plugin is
  detected in `~/.config/opencode/opencode.json` under `plugin`.
- IHM-R6: `scripts/install-harness.sh` orchestrates skills + agents + plugins and is
  reachable from `install.sh` (post-install menu) and `scripts/setup-local-first.sh`.
- IHM-R7: Bash test suites under `scripts/tests/` replace the deleted TypeScript
  installer suites and are picked up by `bun run test:scripts` (CI-gated).

## Contract — `scripts/install-skills.sh`

| Surface | Value |
|---|---|
| Flags | `--apply` (default), `--uninstall`, `--dry-run`, `--check`, `--platform <claude\|codex\|cursor\|opencode\|all>`, `--target <dir>`, `--repo-root <dir>`, `--yes\|-y`, `--json`, `-h\|--help` |
| Exit 0 | success; `--check` with no drift; `--help` |
| Exit 1 | real `$HOME` without `--yes`; `--check` found drift; conflict error |
| Exit 2 | unknown platform; unknown flag; no agent tools on PATH; integration error |
| Exit 3 | neither `node` nor `bun` on PATH |
| Markers | `<!-- massa-ai:bootstrap:start -->` / `<!-- massa-ai:bootstrap:end -->` |
| Roots | `~/.claude`, `~/.codex` (fallback `~/.config/codex`), `~/.cursor`, `~/.config/opencode` |
| State | `~/.config/massa-ai/install-state.json`, v2 shape, v1 auto-migrated |

## Contract — `scripts/install-agents.sh`

| Surface | Value |
|---|---|
| Flags | `--dry-run`, `--uninstall`, `--agent <claude-code\|claude-desktop\|codex\|cursor\|opencode>`, `--target <dir>`, `--api-base <url>` (default `http://localhost:3333`), `--yes\|-y`, `-h\|--help` |
| Exit 0 | success; `--help` |
| Exit 1 | write/parse error |
| Exit 2 | unknown flag; unknown agent |
| Exit 3 | neither `node` nor `bun` on PATH |
| Exit 13 | consent gate refused (real `$HOME` without `--yes`) |
| Ownership | `_massaAiOwned: true` (JSON) / `_massaAiOwned = true` (TOML) under key `massa-ai` |
| Backup | `<config>.massa-ai.bak-<ts>` written before every mutation; none on `--dry-run` |

## Contract — `scripts/install-harness.sh`

| Surface | Value |
|---|---|
| Flags | `--skills`, `--agents`, `--plugins`, `--all` (default), `--platform <p>`, `--api-base <url>`, `--target <dir>`, `--dry-run`, `--uninstall`, `--yes\|-y`, `-h\|--help` |
| Exit 0 | all requested steps completed |
| Exit n | first failing sub-script's exit code, propagated verbatim (including 13) |

## Acceptance Criteria

- AC1: `install-skills.sh --apply` creates one symlink per `skills/<name>/SKILL.md`
  and writes the bootstrap block; a second run changes nothing.
- AC2: A regular file at a symlink target aborts before any mutation and leaves the
  file byte-identical.
- AC3: `--check` reports drift with exit 1 and writes nothing to disk.
- AC4: `--uninstall` removes only symlinks resolving inside `--repo-root`; foreign
  symlinks and unrelated `AGENTS.md` content survive.
- AC5: v1 state migrates to v2 in memory and is persisted only after validation;
  malformed JSON and path-traversal skill names are rejected with exit 2.
- AC6: `install-agents.sh` merges the MCP entry while preserving every existing user
  key; OpenCode uses `mcp` / `environment` / `bunx`.
- AC7: Codex TOML round-trips preamble, comments, and user tables through install and
  uninstall.
- AC8: `--uninstall` removes only `_massaAiOwned` entries; an unmarked `massa-ai`
  entry written by the user survives.
- AC9: After `apps/codex-plugin/install.sh --user`, `~/.codex/config.toml` holds
  exactly one `[mcp_servers.massa-ai]` table and no plugin-local `.mcp.json` exists.
- AC10: `bun run test:scripts` passes with every new bash suite.

## Out of Scope

- Timeout / cancellation paths — all three scripts are synchronous bash with no
  network I/O and no long-running child processes. CONTRIBUTING Step 6's timeout
  invariant is N/A here; happy, conflict-abort, and partial-failure paths are covered.
- `packages/core/.mcp.json` (monorepo dev entry, not user config).
- The OpenCode plugin's npm distribution path.
- Migrating any other `.ts` script in `scripts/`.
