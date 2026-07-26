# Install Harness Migration — Design

## Shape

Bash owns orchestration, arg parsing, path resolution, symlinks, and messaging.
An inline `node`/`bun` heredoc owns every structured-data mutation. This is the
pattern already used by all three plugin installers
(`apps/claude-plugin/install.sh:61-153`); no `jq` exists anywhere in this repo and
none is introduced.

```
scripts/lib/installer-shared.sh   sourceable helpers (no side effects at source time)
scripts/install-skills.sh         symlinks + AGENTS.md bootstrap + install-state.json
scripts/install-agents.sh         host MCP config (JSON x4, TOML x1)
scripts/install-harness.sh        orchestrator over the two above + plugin installers
```

### `installer-shared.sh`

| Function | Behaviour |
|---|---|
| `installer_detect_runner` | echoes `node` or `bun`; returns 1 if neither |
| `installer_require_runner` | echoes runner or exits 3 with a message |
| `installer_timestamp` | `date -u +%Y-%m-%dT%H-%M-%S-000Z` |
| `installer_is_real_home <path>` | resolved-path equality against `$HOME` |
| `installer_consent_gate <home> <yes> <code>` | refuses real `$HOME` without `--yes`; exit code is a parameter because skills exits 1 and agents exits 13 |
| `installer_backup_file <path>` | copies to `<path>.massa-ai.bak-<ts>`, or reserves an empty marker when the file does not exist yet |

Bash 3.2 compatible (macOS system bash): no `declare -A`, no `${var^^}`, no
`readarray`.

### `install-skills.sh`

Flow: parse args → resolve repo root / home / codex home → consent gate → discover
skills → extract bootstrap block → detect tools on PATH → load state → per-platform
apply/uninstall/check → save state → emit text or `--json`.

Heredoc responsibilities (one `state_op` helper, dispatched by mode):

- `load` — parse `install-state.json`, migrate v1 → v2, validate skill names
  (reject empty, `.`, `..`, or anything containing `/`), dedupe, emit
  `platform<TAB>root<TAB>skill,skill,...` lines for bash to consume.
- `save` — build the v2 document from `platform=root=skills` triples and write it.
- `bootstrap` — replace/remove the marker block inside a target `AGENTS.md`.
- `json` — emit the `--json` result object from collected result tuples.

Symlink safety uses `[ -L ]` (lstat), never `[ -e ]`. Conflict detection runs as a
**pre-pass over every skill** before the first `ln -s`, so an abort leaves the target
tree untouched (AC2). Uninstall resolves each candidate with `readlink` and removes
it only when the resolved path is a prefix match on `--repo-root`.

### `install-agents.sh`

Five agents, two writers:

- JSON heredoc, parameterised by `serversKey` (`mcpServers` | `mcp`),
  `envKey` (`env` | `environment`), and `command[0]` (`npx` | `bunx`). Deep-merge
  semantics ported verbatim from `install-agents.ts:144-154`: recursive for plain
  objects, arrays replaced not concatenated.
- TOML heredoc for Codex. The hand-rolled parser/emitter from
  `install-agents.ts:466-600` is ported as-is: split on `^\s*\[header\]\s*$`, keep
  preamble and body lines verbatim, rewrite only the `mcp_servers.massa-ai` table.
  A generic TOML library would drop comments; that is why this stays hand-rolled.

`claude-desktop` resolves to `null` off macOS and is skipped.

The Claude writer keeps the `hasPluginHooks` scan: after a write it re-reads
`settings.json` and reports that plugin hooks were preserved. That is the visible
proof the deep-merge did not clobber the sibling `hooks` key.

### `install-harness.sh`

Selection flags are additive; `--all` (default) turns on all three. Steps run in a
fixed order — skills, agents, plugins — because plugin installers delegate MCP back
to `install-agents.sh`, and running agents first makes the plugin-side call a no-op
rather than a first write.

`--target` is forwarded to skills and agents. Plugin installers take `$HOME` from the
environment, so the harness exports `HOME="$TARGET"` for that step only when
`--target` was passed.

## MCP single-writer

Before: four sources of truth (two inert plugin-local files, one settings template,
one real installer) and three messages telling users to skip the real one.

After: `install-agents.sh` writes; everything else calls it.

```bash
# tail of each plugin installer
if [ -x "${REPO_ROOT}/scripts/install-agents.sh" ]; then
  bash "${REPO_ROOT}/scripts/install-agents.sh" --agent <host> --yes \
    || warn "MCP wiring failed — run: bash scripts/install-agents.sh --agent <host> --yes"
fi
```

MCP is always user-scope. A `--project` plugin install still registers MCP at user
scope; the installer says so rather than doing it silently.

OpenCode is the one host where an MCP entry genuinely duplicates the tool surface —
`apps/opencode-plugin/src/index.ts` registers tools in-process. So the OpenCode MCP
write is skipped **only when** `opencode.json` lists `@massa-ai/opencode-plugin`
under `plugin`. Users without the plugin still get the MCP entry.

## Entry points

`install.sh` gains menu letter `k)`; `c)` and `p)` are untouched because
`scripts/__tests__/root-install-menu.test.ts` grep-pins their literal strings. The
unknown-choice prompt becomes `"Enter w, v, t, c, k, p, or s."` and the pinned
assertion moves with it in the same commit.

Docker mode downloads only `docker-compose.yml`, so the back-fetch loop at
`install.sh:601`/`:606` is extended with the new scripts plus
`lib/installer-shared.sh`; otherwise `k)` is dead in that mode.

`setup-local-first.sh` gains a `[6/6]` step honouring `MASSA_AI_INSTALL_HARNESS=1|0`
for non-interactive runs, mirroring the `MASSA_AI_DB_BACKEND` override pattern.

## Test strategy

Plain bash suites, `ok()`/`fail()` counters, `mktemp -d` roots, `trap … EXIT`
cleanup, mock binaries on a temp `PATH`. No bats, no TAP — neither is used in this
repo. `bun run test:scripts` already globs `scripts/tests/*.sh`, and
`.github/workflows/ci.yml` runs it, so the replacement gate is real CI coverage.

Read-only exports (`--check`, `--dry-run`) are verified by taking a recursive
checksum of the fake home before and after and asserting equality — a stronger claim
than "exit code was 0".
