# Validation — ask-first-defaults

**Result: PASS.** Independent verify: `massa-ai:code-reviewer` verify mode ran static
AC1–AC4 (its MCP shell bridge was down — skipped-delegation reason recorded below);
the dynamic half (all suites + the 7-mutant discrimination sensor) was executed by the
main agent as the documented fallback. Author ≠ verifier for the audit and static verify.

Branch `feat/ask-first-defaults` (commits `1b58faa3` Part A, `36c6cb49` Part B).
Verified 2026-10-15. Isolation record: main checkout on a new branch — explicit
user pick (option 3, shared-checkout warning shown), per the feature's own new
Stage 1 policy.

## Per-AC evidence

| AC | Verdict | Evidence |
| --- | --- | --- |
| **AC1** — gate line byte-identical across 13, asks before Stage 0–1, both directions test-enforced | ✅ PASS | 13 files at line 17 replaced by byte-identical line (python full-line replace + set-identity check: `all 13 byte-identical: OK`); enforced by `scripts/__tests__/workflow-harness-contract.test.ts:240-281` (presence per impl file `:240-245`, read-only leak guard `:247-257`, byte-identity + mechanism `:259-281`); suite green (111 pass). |
| **AC2** — Stage 1 encodes the ask-first policy | ✅ PASS | `skills/massa-ai/references/implementation-delivery.md:32-76`: host-native mechanism `:34-36`, exactly three options `:39-49`, option-3 verbatim warning + recorded override `:46-52`, not-a-repo auto-skip `:54-55`, `--skip-declined` `:45,:56-60`, once-per-session reuse `:62-64`, subagents inherit `:65-66`; invariant tests `workflow-harness-contract.test.ts:327-363` green. `ensure_worktree.ts` untouched (`git diff main..HEAD -- skills/massa-ai/scripts/ensure_worktree.ts` = empty). |
| **AC3** — fresh install renders all-off contract, deterministic | ✅ PASS | `rules.ts` all six `defaultEnabled: false`; rendered contract inspected (`/tmp/maa-scratch2/.claude/MASSA-AI.md`): ask-first preamble, all-off notice, per-host companion path, six-rule menu, zero rule spans; asserted by `engine.test.ts:866-881` (real source end-to-end), `render.test.ts:351-394`, `render-bootstrap.test.ts:327-355` (host-root normalization). Determinism: no clock/env/fs reads in `renderHeader`; cross-host normalize test `render.test.ts:361-379`. |
| **AC4** — companion written on apply, check/idempotency covered, gone on uninstall | ✅ PASS | Live: scratch-home apply → present in all 3 detected hosts; re-apply → `up to date`; `--check` drift branch fires on missing companion; uninstall → skill dirs (incl. companion) removed, `grep -rc "massa-ai:bootstrap:start"` = no hits. Encoded: `install-skills.sh:952-965` (write), `:925`/`:1333` (diff exclusions), `:1340-1348` (check drift), uninstall wholesale `rm -rf` `:1186`. Shell suite Scenario 16 `test-install-skills-bootstrap-file.sh:1348-1375` (152/152 green). Plugin route: `generate-skill-artifacts.ts` ships the companion in all four bundles (verified on disk after `bun run generate:artifacts`). |
| **AC5** — suites pass | ✅ PASS | `bun test packages/shared` 999 pass / 0 fail; `bun run test:scripts` green except a pre-existing, stash-confirmed excluded set (below); `bash scripts/tests/test-install-skills-bootstrap-file.sh` 152/152; `bash scripts/run-shell-suites.sh` green except one pre-existing suite; `bun run type-check` 6/6 tasks. |
| **AC6** — residue-leak + harness-integrity pass | ✅ PASS | `bootstrap-source-contract.test.ts` 11/11 (new preamble contains no rule id, no backticked bare `massa-ai`); `skills-harness-integrity.test.ts` green in full runs (`conversation_feedback:` block only in `skills/AGENTS.md`). |

## Excluded pre-existing failures (stash-confirmed identical without this diff)

- `scripts/__tests__/generate-subagent-artifacts.test.ts` — profile/baseline/drift-gate cluster (machine-local model-profile vs generator output: `model: inherit` vs the active profile).
- `scripts/__tests__/harness-e2e.test.ts` EB-HB-8 (host detection on this machine).
- `scripts/__tests__/mlx-embedding-server` (flaky server start, 35 s timeout run).
- `scripts/tests/test-harness-single-generation.sh` (codex detected on this machine).
- `apps/mcp-client` EmbeddedApiClient/env-setup cluster (DB-dependent).
These fail on a stash of the feature diff exactly as with it; none touch the diff surface.

## Independent verification

- Diff audit (`code-reviewer` audit, session `ses_ec22e012bffevlse83dGgbpMr3`): 1 blocking + 4 advisory, all fixed and amended into `36c6cb49` (config-cli default-string retargets ×2, companion shell scenario, stale "all 16" name, duplicate-relPath guard, header wording). Verified-clean list recorded in the audit.
- Independent verify (`code-reviewer` verify, session `ses_ec2165834ffezAZtt7n3DUcW8f`): MCP shell bridge down in the subagent (massa-ai API unreachable) → static AC1–AC4 PASS; dynamic half executed by the main agent instead (skipped-delegation reason recorded): all suites above plus the **discrimination sensor — 7/7 mutants killed** (gate-line reword, read-only leak, subagent-inherit reword, default flip, all-off notice reword, installer exclusion break, preamble reword), each reverted, tree clean.
- `bun skills/massa-ai/scripts/validate_state.ts ask-first-defaults` — run at close-out; see delivery report.

## Lessons recorded

- `ac_gap`: the plan's verification recipe used `TARGET_HOME=<scratch>` as an env var; `install-skills.sh` only honors `--target` (`:82` pins it to `$HOME`), so the recipe's first run installed into the real home. Recorded via `lessons.ts`.

## Review round (2026-10-17)

The patch was applied on a fresh `feat/ask-first-defaults` from `main` @ `5bead653` and
reviewed before the PR. Three defects found and fixed:

- **Lessons store destroyed.** The patch's `.specs/lessons.json` kept 4 of 23 lessons (the
  known `lessons.ts` rewrite defect). Restored `main`'s store byte-identical and appended
  only L-028 (24 lessons, `next_id` 29).
- **Preamble overrode persisted choices.** The always-rendered preamble said "Do not
  auto-activate any rule below" unconditionally, so a rule the user persisted with
  `massa-ai-config bootstrap enable` still rendered but was never activated and the ask
  repeated every session — the persist option had no effect. The preamble now activates
  rendered rules and asks only when no rule section renders; sensed by
  `bootstrap-source-contract.test.ts` (residue test) and `engine.test.ts`.
- **Generator temp-file leak.** `generate-skill-artifacts.ts` left one
  `massa-ai-bootstrap-rules-<pid>.md` in the temp dir per run; it is now removed on exit.

Also excluded from the PR: the unrelated `apps/opencode-plugin/*` + `bun.lock` migration the
patch's first commit carried (user decision; kept as a local stash).

Evidence: `bun test packages/shared` 998/0; bootstrap/installer shell suites 152/0 and 36/0;
`bun run test:plugins` 224/0; `lint`, `build`, `type-check` green; companion bytes
`cmp`-identical between the installer and the generated Claude bundle. `bun run test:scripts`
2225/17 — the 14 stable reds (npm pack ×5, subagent profile drift ×7, `generate:artifacts`
drift ×2) fail identically on `main`; the other 3 passed when re-run in isolation.
