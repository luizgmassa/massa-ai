# Install Harness Migration — Validation

## Result: PASS

| Gate | Result |
|---|---|
| `bun run test:scripts` | exit 0 — 396 TypeScript tests + 12 bash suites (296 assertions), 0 fail |
| `bun test scripts/__tests__/root-install-menu.test.ts` | 14 pass / 0 fail |
| `bun test scripts/__tests__/validate-repository.test.ts` | 185 pass / 0 fail |
| `bun test apps/{codex,cursor}-plugin/__tests__` | 33 pass / 0 fail |
| `bun run type-check` | 6/6 successful |
| `bun run build` | 5/5 successful |
| `bash -n` on all three new scripts | clean |

Per-suite assertion counts:

| Suite | Assertions |
|---|---|
| `test-install-skills-apply.sh` | 22 |
| `test-install-skills-state.sh` | 21 |
| `test-install-skills-check.sh` | 19 |
| `test-install-skills-uninstall.sh` | 13 |
| `test-install-skills-cli.sh` | 36 |
| `test-install-agents-json.sh` | 27 |
| `test-install-agents-toml.sh` | 29 |
| `test-install-agents-uninstall.sh` | 16 |
| `test-install-agents-cli.sh` | 37 |
| `test-install-agents-claude-hooks.sh` | 15 |
| `test-install-harness-cli.sh` | 25 |
| `test-mcp-single-writer.sh` | 36 |

## Gates

```bash
bun run test:scripts                                   # all bash suites + scripts/__tests__
bun test scripts/__tests__/root-install-menu.test.ts
bun test scripts/__tests__/validate-repository.test.ts
bun run type-check && bun run build                    # nothing referenced the deleted .ts
bash -n scripts/install-skills.sh scripts/install-agents.sh scripts/install-harness.sh
```

## Manual recipe

```bash
# skills round-trip in an isolated home
H=$(mktemp -d)
bash scripts/install-skills.sh --apply --platform all --target "$H" --yes
bash scripts/install-skills.sh --check --platform all --target "$H"; echo "drift=$?"   # 0
bash scripts/install-skills.sh --apply --platform all --target "$H" --yes              # idempotent
rm "$H/.claude/skills/"*
bash scripts/install-skills.sh --check --platform all --target "$H"; echo "drift=$?"   # 1
bash scripts/install-skills.sh --uninstall --platform all --target "$H" --yes

# codex TOML comment preservation
H2=$(mktemp -d); mkdir -p "$H2/.codex"
printf 'model = "gpt-5"\n\n# keep me\n[user_settings]\ntheme = "dark"\n' > "$H2/.codex/config.toml"
bash scripts/install-agents.sh --agent codex --target "$H2" --yes
grep -q '\[mcp_servers.massa-ai\]' "$H2/.codex/config.toml" && grep -q '# keep me' "$H2/.codex/config.toml"
bash scripts/install-agents.sh --agent codex --target "$H2" --yes    # no second table
bash scripts/install-agents.sh --uninstall --agent codex --target "$H2" --yes
grep -q '# keep me' "$H2/.codex/config.toml"

# consent gate
bash scripts/install-agents.sh --agent codex < /dev/null; echo "expect 13 -> $?"
bash scripts/install-skills.sh --apply < /dev/null;       echo "expect 1  -> $?"

# orchestrator
H3=$(mktemp -d)
bash scripts/install-harness.sh --skills --agents --platform all --target "$H3" --yes

# no MCP double-write after a plugin install
H4=$(mktemp -d)
HOME="$H4" bash apps/codex-plugin/install.sh --user
test ! -e "$H4/.codex/plugins/massa-ai/.mcp.json"
grep -c 'mcp_servers.massa-ai' "$H4/.codex/config.toml"    # exactly 1
```

Not automated: walking the `install.sh` post-install menu interactively to confirm
`k)` renders and the docker-mode back-fetch resolves the new scripts. The menu's
*source* is grep-pinned by `scripts/__tests__/root-install-menu.test.ts` (option
letter, case route, harness invocation, and the four back-fetch filenames), so
what is unverified is only the live TTY interaction and the GitHub raw fetch.

## Findings during execution

- `apps/codex-plugin/.mcp.json` was **gitignored** (`.gitignore:61`) and had never
  been committed, while `install.sh:206` did `cp "$SCRIPT_DIR/.mcp.json"` under
  `set -e`. On a fresh clone that copy would have aborted the Codex plugin install
  outright. Deleting the copy step fixes a latent breakage, not just a redundancy.
- `apps/codex-plugin/.codex-plugin/plugin.json` declared `"mcp": ".mcp.json"`, so
  Codex was the one host where the plugin-local file had a plausible read path.
  The manifest pointer is removed along with the file, which is what makes the
  single-writer claim true rather than merely tidy.
- `apps/claude-plugin/settings.json.template` never contained an `mcpServers`
  block, so the planned "strip it" step was a no-op. A guard was added instead.
- The bash `--uninstall` is **stricter** than the TypeScript version it replaces:
  the old code removed the `massa-ai` key regardless of the ownership marker. The
  new one refuses to touch an unmarked entry, which is what the spec asks for
  (AC8) and what the uninstall suites assert.

## Coverage note

`bunfig.toml` sets `coverage = true` for `bun test`. The bash suites run outside that
instrumentation, so removing 1,637 lines of instrumented TypeScript source together
with 1,976 lines of TypeScript tests moves the reported percentages. The behavioural
coverage is not lost — it moved to `scripts/tests/*.sh`, which CI runs via
`bun run test:scripts` (`.github/workflows/ci.yml`).

## CONTRIBUTING 7-step mapping

| Step | Evidence |
|---|---|
| 1 Contract | `spec.md` — flags, exit codes, invariants per script |
| 2 Register | scripts live in `scripts/`, invoked from `install.sh` + `setup-local-first.sh`; suites auto-registered by the `scripts/tests/*.sh` glob |
| 3 Preserve argv | `test-install-harness-cli.sh` stubs the sub-scripts on a temp `PATH` and asserts forwarded argv |
| 4 Read-only export | `--check` / `--dry-run`; suites checksum the fake home before and after and assert equality |
| 5 Deliver-before-ack | symlinks written before state persists; backup written before config mutation; asserted in the apply suites |
| 6 Invariants | happy / conflict-abort / partial-failure covered; timeout N/A (synchronous bash, no network) — stated in `spec.md` |
| 7 Discriminating | e.g. the uninstall suite plants an unmarked `massa-ai` entry and asserts it survives |
