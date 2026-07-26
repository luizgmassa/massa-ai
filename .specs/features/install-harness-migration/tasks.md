# Install Harness Migration — Tasks

## Phase 1 — Bash installers

- [x] T1 `scripts/lib/installer-shared.sh` — runner detection, consent gate, backup, timestamp
- [x] T2 `scripts/install-skills.sh` — full CLI parity with the deleted `.ts`
- [x] T3 `scripts/install-agents.sh` — JSON + TOML writers, ownership marker, backups

## Phase 2 — MCP single writer

- [x] T4 Delete `apps/codex-plugin/.mcp.json`, `apps/cursor-plugin/mcp.json` and their `cp` lines
- [x] T5 ~~Strip the `mcpServers` block from `apps/claude-plugin/settings.json.template`~~ —
      **no-op on inspection**: the template ships only `hooks` + `permissions`, no MCP block.
      `test-mcp-single-writer.sh` now guards that it stays that way.
- [x] T4b Remove the `"mcp": ".mcp.json"` pointer from `apps/codex-plugin/.codex-plugin/plugin.json`
      — found during execution. Codex's manifest declared MCP, so deleting only the file
      would have left a dangling pointer and a possible second registration path.
      (The file itself was gitignored via `.gitignore:61` and had never been committed, so
      a fresh clone's `cp "$SCRIPT_DIR/.mcp.json"` would have aborted the installer under
      `set -e`.)
- [x] T6 Delegate MCP from all three plugin installers to `install-agents.sh`
- [x] T7 Correct the four misleading "skip MCP" messages
- [x] T8 Fix the OpenCode config snippet in `scripts/setup-local-first.sh` (`mcp`/`environment`/`bunx`)
- [x] T9 Plugin reinstall removes the stale plugin-local MCP file if an older install left one

## Phase 3 — Unified wiring

- [x] T10 `scripts/install-harness.sh`
- [x] T11 `install.sh` — menu letter `k)`, updated prompt string, extended docker back-fetch
- [x] T12 `scripts/setup-local-first.sh` — step `[6/6]`, `MASSA_AI_INSTALL_HARNESS` override, renumber

## Phase 4 — Tests

- [x] T13 Repoint `scripts/__tests__/validate-repository.test.ts` at the bash markers
- [x] T14 Delete the four TypeScript installer suites
- [x] T15 12 bash suites in `scripts/tests/`
- [x] T16 Update `scripts/__tests__/root-install-menu.test.ts` for the new prompt string
      (+ a new describe block for menu `k` and the docker back-fetch list)
- [x] T17 `package.json` — `install:skills` / `uninstall:skills` point at the `.sh`;
      added `install:agents` and `install:harness`
- [x] T17b Update the codex/cursor plugin `__tests__` that asserted the deleted MCP files
      (`manifest.test.ts`, `install.test.ts`) to assert the single-writer rule instead

## Phase 5 — Docs

- [x] T18 `README.md` — installer commands, harness section, MCP single-writer rule
- [x] T19 `FEATURES.md` — installer feature entry, flags, tests table
- [x] T20 `CHANGELOG.md` `[Unreleased]` — CI merge gate requires it
