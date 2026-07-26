# Plan Challenge — Workflow Harness Overhaul

Gate: full (spec-driven mandates it). Mode: pre-mortem. Agent:
`massa-ai-plan-critic`, read-only, given `spec.md` + `design.md`.

## Findings triage

| # | Finding | Verdict | Action |
| --- | --- | --- | --- |
| 1 | "The four new reference files are designed but never created — no task creates them" | **Rejected — stale context.** The critic was dispatched before `tasks.md` existed and was not given it. T4–T7 create all four, one atomic commit each. | Cross-link `tasks.md` from `design.md` so a future reader cannot repeat the misread |
| 2 | "`skills/agents/handoff-writer/SKILL.md:49` names `agent-handoff`/`restart-save` and becomes dangling prose" | **Rejected — moot.** WHO-R2/T2 delete the entire `skills/agents/handoff-writer/` directory. A deleted file cannot dangle. | None |
| 3 | "`[Unreleased]` is empty; the CI merge gate fails and no release is cut" | **Accepted.** Already covered by T10, but the critic is right that it is a hard gate, not a nicety. | Keep T10; it is now a release-blocking task, not documentation polish |
| 4 | "The test suite asserts that sentences *exist*, not that the encoded decisions are *correct*. A reference shipping `≥3` instead of `≥2` passes." | **Accepted — this is the real gap.** CONTRIBUTING Step 6 (invariants) is genuinely applicable to documentation that encodes decisions. | T9 extended: assert the literal threshold value, the merge prohibition, the exhaustive language map, and the precedence ordering — not just the presence of a heading |
| 5 | "Installer roster strings (`install.sh` ×6, `install-agents.sh` ×5) may be missed; WHO-R4 has no gate" | **Accepted.** These are user-facing public compatibility surface with no existing assertion. | T9 gains a repo-wide roster-count assertion covering shell installers |

## Fatal assumption after triage

Not the one the critic named. The real one: **that a documentation contract an
agent can read is a contract an agent will follow.** Nothing executes these
references. The mitigation is bounded and honest — the contract test proves the
rules are *present and correct*, and `design.md` records that runtime
enforcement would need a hook, which is explicitly out of scope.

## Deterministic falsifying check

```bash
bun test scripts/__tests__/workflow-harness-contract.test.ts
```

Must fail if any single workflow loses a load line, if a removed path returns,
if a roster count regresses to 16, or if a reference's encoded threshold changes
value. Verified by manual mutation during T9.

## Escalation

The critic returned `escalate_to_full: true`. The gate already ran at full
depth, and findings 3–5 are absorbed into the plan rather than deferred. No
second challenge round: the two highest-ranked findings were context artifacts,
which is the signal that the critique has converged.
