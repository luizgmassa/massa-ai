# Handoff — persona-router-token-optimization (mid-Execute, resume at T6)

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

Tasks T0–T5 complete; T6 in progress; T7–T9 not started. Every commit
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

## T6 remaining (in progress)

Per design.md C9 + tasks.md T6, minus the already-landed gate commit:

- Add the double-surface probe to `scripts/install-skills.sh` inside
  `check_platform()` (≈ line 698): claude platform only, after the
  `owner != "plugin"` block. Read `STATE_PATH` (`install-state.json`, v2) and
  `$TARGET_HOME/.claude/settings.json`; when `skillsOwner == "repo"` AND
  `enabledPlugins["massa-ai@massa-ai"] === true`, `record "drift" ...` naming
  both surfaces — the existing drift aggregation (≈ line 862) already exits 1.
  Missing `enabledPlugins` key or missing state file → no drift (spec edge
  cases). Use the inline `"$RUNNER"` heredoc house pattern (no jq);
  `--apply`/`--dry-run` untouched (CONTRIBUTING 7-step protocol applies).
- New `scripts/tests/test-skills-check-double-surface.sh` driving fixture
  `TARGET_HOME`s: both-surfaces → exit 1 + both surfaces named;
  single-surface and missing-key fixtures → exit 0. Observe the red polarity
  before trusting the green (a-new-sensor-needs-an-observed-red).
- CHANGELOG `[Unreleased]`: `### Changed` (catalog v2, slim router + fast
  paths, prompt compression) + `### Added` (size-budget gate, double-surface
  probe). CHANGELOG merge gate needs this before the PR.
- Commit (one or two atomic; per-task gates: the new shell suite,
  `bun run lint`, integrity, `generate-skill-artifacts.ts --check`).

## T7–T9

Follow tasks.md T7 (order is load-bearing — design.md C11 / Plan Challenge F1;
`MASSA_AI_SKIP_PLUGIN_REGISTRY=1` on every installer invocation, plugin
disable LAST, falsifying 3-file re-check; evidence redacted to
`enabledPlugins`/`hooks` keys only per PRT-01 AC5 — `~/.claude/settings.json`
carries a live OAuth token). T8 full sweep + push + PR (PR description per
`references/implementation-delivery.md`; merge stays the user's). T9
independent verification-agent (author ≠ verifier) writes `validation.md`;
PRT-02 walkthrough is restart-gated (F6) — record pending-restart if
same-session. Machine dedupe evidence from T7 goes into validation.md, not a
repo commit.
