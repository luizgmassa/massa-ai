# Tasks — Worktree Isolation Gate

Plan: `2 Phases = 5 Tasks`. Batch-worker offer: declined by precedent
(pr-review/discovery: sequential deps, one dominant prose domain; sensor-first
ordering forbids parallel file fan-out anyway).

## Phase 1 — Contract + sensor + edits (3 Tasks)

- **T1** — `references/implementation-delivery.md` Stage 1: add record-evidence +
  shared-checkout paragraph (design D5). The paragraph is a **cross-session** rule,
  deliberately distinct from `references/agent-orchestration.md`'s "Git safety for
  concurrent work" bullet (**cross-subagent** scope); name that distinction in the
  paragraph (Plan Challenge F2). Gate: harness-contract invariants group still
  green + duplication excess measured ≤ 483 immediately after this edit (F2).
- **T2** — Sensor first: extend `scripts/__tests__/workflow-harness-contract.test.ts`
  with the Isolation Gate assertions (design D4). Presence assertion is a
  **per-file test loop** (mirroring the existing mutation-references loop), so a
  single-file deletion flips exactly one assertion (Plan Challenge F4). Gate:
  observed RED — exactly the 16 implementation workflows fail; read-only
  direction green.
- **T3** — Add the one-line Isolation Gate (design D1) to all 16 implementation
  workflows, directly after the delivery-clause paragraph. Gate: harness-contract
  green; duplication excess ≤ 483 @ window 4 (measured — critic pre-measured
  delta 0, re-confirm on the real tree). Note: `skill-size-budgets` has no
  budget under `workflows/**` (Plan Challenge F6) — it is not evidence for this
  task; largest file growth pre-measured 21,498 → 21,804 B (spec-driven.md).

## Phase 2 — Close-out (2 Tasks)

- **T4** — CHANGELOG `[Unreleased]` entry (heading per CONTRIBUTING authoring
  table). Gate: changelog-merge-gate satisfied by file modification.
- **T5** — Close-out: regenerate artifacts (`bun run generate:artifacts` +
  `--check`), run gate suite (harness-contract, duplication, size, metadata
  headers, doc-paths, integrity, venue parity, artifact parity), update
  `.specs/project/STATE.md` + `FEATURES.json` + `HANDOFF.md`, run
  `check_specs_delivered.ts worktree-isolation-gate`, dispatch verification-agent
  (author ≠ verifier) → `validation.md`.

## Test Coverage Matrix

| AC | Sensor |
| --- | --- |
| AC1/AC2 | new harness-contract presence + invariant assertions (T2) |
| AC3 | T2 observed-red run log; single-file deletion flip is structural (per-file test) |
| AC4 | harness-contract invariant assertion on Stage 1 text (T2) |
| AC5 | gate suite run in T5 |
| AC6 | CHANGELOG diff in T4 |

## Gate Check Commands

```bash
cd <worktree>
bun test scripts/__tests__/workflow-harness-contract.test.ts
bun test scripts/__tests__/skills-duplication-metric.test.ts
bun test scripts/__tests__/skill-size-budgets.test.ts scripts/__tests__/workflow-metadata-headers.test.ts scripts/__tests__/skill-doc-paths.test.ts
bun test scripts/__tests__/skills-harness-integrity.test.ts scripts/__tests__/check-workflow-venue-parity.test.ts
bun run generate:artifacts && bun run generate:artifacts --check
bun skills/massa-ai/scripts/check_specs_delivered.ts worktree-isolation-gate --root .
```

Delivery note: commits per task on `spec/worktree-isolation-gate`; push/PR =
user decision (session precedent).
