# Design — Worktree Isolation Gate

## D1 — Gate shape: one identical preamble line, not a numbered step

Options considered:

1. **Numbered step inserted per workflow** (rejected): every workflow numbers its
   list literally (debug has 18 steps); insertion renumbers all following steps in
   16 files and breaks cross-references — `implementation-delivery.md` Stage 3.5
   cites "workflows/spec-driven.md step 7" by number. High churn, high drift risk.
2. **One identical bolded gate line placed directly after the existing
   "Before the first repository mutation, load …" clause** (chosen): uniform
   position, zero renumbering, one-literal sensor, and it sits textually *before*
   every numbered list, i.e. before any step that could mutate.
3. Sub-bullet under each workflow's implement step (rejected): insertion point
   varies per file; sensor cannot assert a uniform contract.

Gate line (identical in all 16 files, single source of policy stays in the
reference):

> **Isolation Gate — before the first file edit:** execute
> `references/implementation-delivery.md` Stage 0–1 now (fetch base, create the
> worktree + branch, work inside it) and record the worktree path + branch — or
> one of Stage 1's two legal skip reasons, verbatim — before any repository
> mutation.

## D2 — Hook-level blocking: deferred, with reason

`apps/claude-plugin/hooks/massa-ai-hook.ts` is a single observation binary whose
documented contract is "Silent-degrade: never blocks the agent (exit 0, no
stdout)"; `hooks.json` registers no PreToolUse event at all. A blocking
worktree guard inverts that contract and fans out to Codex/Cursor translation,
block-semantics tests, and false-positive handling (legit direct edits on main
by user instruction). That is a separate feature with its own spec, not a rider.
`references/hook-enforcement.md` already *describes* blocking PreToolUse hooks
that do not exist on disk (gateguard/config_protection, Python names) — stale
doc, out of scope here.

## D3 — Duplication budget

`skills-duplication-metric` ceiling on origin/main: excess 483 ≤ 483 @ window 4 —
zero headroom. The preamble already holds a 2-line identical run across the 15
non-spec-driven implementation workflows ("Load references/project-context.md …" +
delivery clause; blank lines are excluded by normalization). Adding one line makes
a 3-line run < window 4 → zero new excess. The gate line must therefore stay one
markdown source line. Measured before/after in T3; raising the ceiling is refused
(fix the subject, not the gate).

## D4 — Sensor placement

Extend `scripts/__tests__/workflow-harness-contract.test.ts` group 4
("delivery scope"), which already derives the 16-file implementation set from
disk and asserts both directions. New assertions:

- every implementation workflow contains the literal `Isolation Gate — before the first file edit`;
- no read-only workflow contains it;
- invariant: the gate line names `Stage 0–1` and evidence recording (guards
  against a rewrite that keeps the label but drops the mechanism).

Sensor is written first and observed RED (16 missing files) before T3 lands.

## D5 — Reference amendment

`implementation-delivery.md` Stage 1 gains one short paragraph (single source):
record worktree path + branch immediately after creation; never switch branches
in a checkout another session may share — two sessions sharing one checkout can
move each other's HEAD mid-run (recorded incident, `.specs/project/STATE.md`
2026-08-05). No other stage text changes.
