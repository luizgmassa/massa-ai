# Handoff — persona-router-token-optimization (mid-Execute: T0–T6 done, T7 partially blocked, T8 delivering, T9 pending)

Previous handoffs closed: workflow-policy-updates merged as PR #66, released
v1.23.0 @ `d18e7764`; subagent-orchestration-io merged as PR #67 @ `5b338af4`,
released v1.24.0 (this branch merged origin/main at that point mid-Execute).

Session `spec-persona-router-token-optimization` · workflow spec-driven (Large) ·
persona route: AI Engineer (`context-skill-harness-engineer-architect`) — the
repo `AGENTS.md` now carries a `persona_pin` for it (landed T5), so a fresh
session pin-routes without inference. massa-ai MCP was unreachable all session;
`.specs/` files are canonical. Contract files:
`.specs/features/persona-router-token-optimization/{spec,design,tasks}.md`.
Plan Challenge already ran (full, pre_mortem, massa-ai-plan-critic; findings
F1–F6 all folded into spec/design — see design.md § Risks and spec.md
Assumptions). Do not re-run it for the existing plan.

## Environment (do not re-create)

- Worktree `.claude/worktrees/persona-router-token-optimization`, branch
  `spec/persona-router-token-optimization`, cut from `origin/main` @ `d18e7764`
  (v1.23.0). Working tree clean at handoff.
- Provisioned: `bun install` done; native tree-sitter `build/` dirs copied from
  the main checkout; `bun run build` + `bunx prisma generate` done. Verify with
  `bun test scripts/tests/verify-tree-sitter-grammars.test.ts` → 9/0.
- Lessons loaded: L-001 (confirmed, test-strength). `validate_tasks.ts` /
  `validate_state.ts` exist under `skills/massa-ai/scripts/` (tasks.md already
  passes validate_tasks with 0 errors).

## Commit map (branch, oldest first)

| Commit | Task | Content |
| --- | --- | --- |
| `ee5df5c` | T0 | activation: spec/design/tasks + FEATURES.json + STATE.md |
| `575d89e` | T2 | catalog v2 index (2,385 B) + `signals/<id>.json` ×5 + validate-repository v2 repoint (C13/F3) |
| `e267829` | T3 | SKILL.md slim 13,316→5,484 B + `references/routing-details.md` + authority-scan widening (seeded red observed) + reference-integrity resolver own-skill-first repoint |
| `901c42a` | T4 | five prompts ≤4,500 B (4,485–4,498) |
| `cc8377c` | T5 | `persona_pin` policy in `skills/AGENTS.md` bootstrap + repo `AGENTS.md` pin line |
| `ef29a3cc` | T6 | double-surface probe in `check_platform()` + `test-skills-check-double-surface.sh` (red observed first: 5/5 scenario-1 assertions failed probe-less, then 14/0) + CHANGELOG entries |
| `ad04e953` | — | merge `origin/main` @ `5b338af4` (v1.24.0, PR #67); conflicts only `.specs/` state + CHANGELOG; post-merge gates 223/0, bundles no-drift |

Tasks T0–T6 complete; T7 partially done (see below); T8 in progress; T9 not started. Every task commit
regenerated the 4-host bundles; `generate-skill-artifacts.ts --check`,
integrity (32/0), validate-repository (183/0), parity — all green at HEAD.
`skill-size-budgets.test.ts` green 6/0 at HEAD.

## Deviations and session-only facts

1. **Size-budget gate landed early.** tasks.md T1/T6 planned the test file
   uncommitted until T6; `git add -A` at T2 swept it in at `575d89e`, red
   against the not-yet-slimmed subjects until `901c42a`. PR-head is green
   (what CI evaluates). T6's "commit the gate" sub-step is therefore DONE;
   what remains of T6 is the probe + shell test + CHANGELOG only.
2. **T1 observed red evidence** (for validation.md; per-file figures from the
   pre-slim run): `skills/persona-router/SKILL.md 13316 B > 5000 B`;
   `catalog.json 8871 B > 2500 B`; five prompts over 4,500 (8308, 7435, 6614,
   6321, 4929 — spec predicted four; `product-manager.md` 4,929 was the
   fifth); two empty-glob failures (`references/`, `signals/` not yet
   created). Population prints verified non-empty globs.
3. **Spec amendment at T3** (recorded in spec.md PRT-02 AC5): SKILL.md budget
   5,000 → 5,500 B — six gate-anchored sentences (~700 B) + frozen frontmatter
   description (~430 B) weren't priced in; 5,498 B measured floor. Budget map
   in `scripts/__tests__/skill-size-budgets.test.ts` says 5_500.
4. **Byte-vs-char trap:** python `len()` under-reports these files (multi-byte
   punctuation); the gate uses `statSync().size` bytes. Measure with `wc -c`
   or `os.path.getsize`, never `len()`.
5. **Seeded-red for the authority-scan widening** was observed then removed
   (T3 commit body records it) — do not re-seed.
6. **Reference-integrity resolver** now resolves `references/*.md` mentions
   own-skill-first with massa-ai fallback (`skills-harness-integrity.test.ts`
   § reference integrity) — a gate repoint, T3 commit body has the rationale.

## T6 — DONE @ `ef29a3cc`

Probe in `check_platform()` (claude-only, `owner = "repo"` guard, runner-heredoc
settings read, drift row names both surfaces); shell suite 5 scenarios, red
observed first (scenario 1 failed 5/5 probe-less), then 14/0; CHANGELOG entries
under `[Unreleased]`. Gates at commit: install-skills suites 130/0 total,
integrity 32/0, size budgets 6/0, `--check` no-drift, oxlint 0.

## T7 — partially done; steps 1b–4 BLOCKED on user permission

Provenance verified per design risk row: `apps/claude-plugin/install.sh --user`
(file route when `MASSA_AI_SKIP_PLUGIN_REGISTRY=1`) is what writes
`~/.claude/{commands,agents}/massa-ai-*.md`; its hooks merge self-skips while
the plugin is still registered (`pluginAlreadyInstalled()` reads
`installed_plugins.json`) — which is exactly why C11's install-first order keeps
hooks unchanged. Bundle agents/commands/installer byte-identical between main
checkout @ `5b338af4` and this worktree, so the plugin installer should run from
the MAIN checkout (keeps the owned `massa-ai` MCP entry pointed at the main
checkout; run from the worktree it would repoint MCP at a path that dies after
merge).

- Step 1a DONE: `MASSA_AI_SKIP_PLUGIN_REGISTRY=1 bash scripts/install-skills.sh
  --apply --platform claude --yes` from the worktree → "2 skills copied,
  AGENTS.md bootstrap written".
- Steps 1b–4 DENIED by the host permission classifier (self-modification of
  live `~/.claude`): plugin install.sh run, symlink rm, settings.json plugin
  disable. Awaiting user go-ahead or manual execution.
- BEFORE evidence captured (redacted per AC5) at `/tmp/prt01-evidence.md` via
  `/tmp/prt01-capture.sh` (re-run with args `<out> AFTER` for the after shot):
  16 agents (handoff-writer present, judge/meta-judge absent), 6 commands,
  2 BROKEN symlinks (`massa-ai-memory`, `synapse-usage`), enabledPlugins
  `massa-ai@massa-ai: true`, plugin cache 1.2.1, skillsOwner repo.
- Side observation, outside PRT-01 scope: `~/.claude.json` `mcpServers` carries
  a dead `th0th` entry (`/Users/luizmassa/Personal Projects/th0th/...`) beside
  the owned `massa-ai` entry — likely why massa-ai MCP kept failing; flagged to
  the user, do not touch without direction.

Remaining T7 commands (order load-bearing, run after go-ahead):
1b. From MAIN checkout: `MASSA_AI_SKIP_PLUGIN_REGISTRY=1 bash
    apps/claude-plugin/install.sh --user` → 17-agent roster + 6 commands.
2.  `rm ~/.claude/skills/massa-ai-memory ~/.claude/skills/synapse-usage`.
3.  LAST: settings.json `enabledPlugins["massa-ai@massa-ai"] = false`
    (read-before-write, quote only enabledPlugins/hooks);
    `installed_plugins.json` has no enablement field (verified) — record
    alignment as no-op, record stays (F5: cache inert once disabled).
4.  Falsifying 3-file re-check + AFTER capture; evidence → validation.md.

## T8 — in progress this session

Merge of main done pre-push (`ad04e953`). Sweep: test:plugins 96/0, lint 0,
`--check` no-drift, contract gates 223/0; `test:scripts` full run + push + PR
next. PR description per `references/implementation-delivery.md`; user's resume
instructions carry the Stage-3 delivery authorization; merge stays the user's.

## T9

Independent verification-agent (author ≠ verifier) writes `validation.md`;
PRT-02 walkthrough is restart-gated (F6) — record pending-restart if
same-session. Machine dedupe evidence from T7 goes into validation.md, not a
repo commit. T1 red-run figures for validation.md are in "Deviations" above.
