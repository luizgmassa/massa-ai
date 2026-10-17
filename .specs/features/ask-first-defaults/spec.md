# Feature: ask-first-defaults

Workflow: `feature` (explicit route; Plan Challenge full gate already run — 5 findings
incorporated as emendas E1–E5 in the approved plan
`~/.opencode/plan/ask-first-defaults.md`). Session: `feature-ask-first-defaults`.
Approved plan is authoritative for design; this file persists the acceptance criteria.

## Request (user, 2026-10-14)

Implement the approved plan at `/Users/luiz.massa/.opencode/plan/ask-first-defaults.md`:
two behavior changes in massa-ai — (1) workflows stop creating git worktrees by default;
the agent must ASK where to work via the host's native question mechanism, then execute
the confirmed path; (2) all six bootstrap rules default to off; at session start the agent
must ASK what to activate instead of auto-activating, with a persist option.

## User-approved design decisions (do not re-litigate)

- Worktree ask offers exactly 3 options: isolated worktree + new branch (recommended),
  current checkout on current branch, current checkout on a new branch.
- Bootstrap defaults flip to all-off; the ask offers per-session options (all / none /
  pick) plus a persist-choice option via `massa-ai-config bootstrap enable <id>`.
- `ensure_worktree.ts` is NOT modified. Scratch worktrees are NOT affected.

## Delivery record (Stage 1 isolation, 2026-10-14)

- Ask presented via OpenCode `question` tool with the 3 options; the shared-checkout
  warning was shown verbatim in option 3's description. User picked option 3:
  **current checkout on a new branch** — the recorded user override of the
  branch-switch rule.
- Branch: `feat/ask-first-defaults` (from `main`). Path: the main checkout
  `/Users/luiz.massa/Workspace/iFood/massa-ai`.
- Delivery authorization: commits only — hold before push/PR (user choice).
- Pre-existing unrelated changes (`apps/opencode-plugin/*`, `bun.lock`) present in the
  checkout before branch creation; never staged by this feature.

## Acceptance criteria

- **AC1** Every implementation workflow's Isolation Gate line is byte-identical across
  the 13 files and instructs asking before Stage 0–1 (test-enforced both directions:
  implementation set carries it, read-only set does not).
- **AC2** `implementation-delivery.md` Stage 1 encodes: ask via host-native mechanism,
  3 options, option-3 warning + recorded override, once-per-session reuse, subagents
  inherit, not-a-repo auto-skip, decline via `--skip-declined`.
- **AC3** Fresh install renders an all-off contract: all six rule spans dropped,
  preamble (ask-first) + header (all-off notice, per-host `bootstrap-rules.md` path,
  six-rule menu) present; renderer output deterministic.
- **AC4** `bootstrap-rules.md` is written per host on `--apply`, covered by
  `--check`/idempotency, removed on uninstall.
- **AC5** All updated suites pass: `bun test` (shared + scripts), installer shell
  tests, `bun run type-check`.
- **AC6** Residue-leak and harness-integrity gates still pass with the new prose.

## Verification recipe

```bash
bun test packages/shared/src/bootstrap
bun run test:scripts
bash scripts/tests/test-install-skills-bootstrap-file.sh
bun run type-check
TARGET_HOME=<scratch> bash scripts/install-skills.sh --apply    # written; bootstrap-rules.md present per host
TARGET_HOME=<scratch> bash scripts/install-skills.sh --apply    # nochange
TARGET_HOME=<scratch> bash scripts/install-skills.sh --uninstall
grep -rc "massa-ai:bootstrap:start" <scratch>                   # no hits
```
