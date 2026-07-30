### Judge With Debate

Use this workflow when the user explicitly asks to evaluate an artifact through multi-judge
debate — "judge this", "judge-with-debate", "evaluate with debate", "run the judges on X". The
user supplies artifact path(s) plus a task description (what the artifact was supposed to
accomplish) and optionally evaluation context. This is a standalone, explicit-route workflow: it
is never auto-selected by the router for generic review work (use `reviewer`, `*-audit`, or
`plan-critic` for those).

The protocol: a meta-judge authors a tailored evaluation specification **once**; three
independent judges score the artifact against it with quoted evidence; the judges debate their
disagreements over **up to 3 rounds**; the panel converges on a consensus verdict or reports an
honest no-consensus. Ported from the NeoLabHQ `judge-with-debate` pattern; this file is the
canonical contract here — repository contracts win on any conflict with the base.

Before the first substantive read, load `references/project-context.md` and run the
project-context intake sweep for the target repository (the workspace holding the artifact
under evaluation, which may differ from this repo).

Report contracts (paths, schemas, fidelity checklist) live in
`references/audit-report-io.md` → **Judge With Debate Report Contracts**. Dispatch contract,
capability packet, output contract, Name Resolution, and feedback labels live in
`references/agent-orchestration.md`.

## Channel Discipline (non-negotiable)

- **Orchestrator → judges**: capability packet + the evaluation specification YAML verbatim.
- **Judges → orchestrator**: the structured reply block only (schema below). The orchestrator
  **never opens `audits/judge/*.md` report files** — reports are the judge-to-judge channel.
  Consensus is computed from reply blocks; the final synthesis is assembled from reply blocks.
- **Judges ↔ judges**: report files on disk, read directly by each judge during debate rounds.
  The orchestrator never relays report content between judges.

## Step 0 — Input validation

Before any dispatch:

1. Artifact path(s) exist and are readable; task description is non-empty. Otherwise refuse and
   name what is missing.
2. Create `audits/judge/` under the target project root when missing. Resolve same-day
   same-target collisions with the audit-report-io suffix rule (`-2`, `-3`, …) and state the
   deviation.
3. Assign report paths: `audits/judge/<YYYY-MM-DD judge-with-debate judge-N.md>` for N in 1..3
   and `audits/judge/<YYYY-MM-DD judge-with-debate consensus.md>`.

## Step 0.5 — Host capability probe (every invocation)

Check whether the host supports **dispatch-time model selection** (a per-dispatch model
parameter on the task/subagent tool). This probe runs on every invocation — when a host gains
the capability, per-slot diversity activates automatically with no harness edit.

- Probe positive → request per-slot models at dispatch: meta-judge `kimi-k3`, Judge 1
  `deepseek-v4-pro`, Judge 2 `minimax-m3`, Judge 3 `GLM-5.2`.
- Probe negative (all four hosts today) → dispatch the charter-default artifacts and record the
  unmet per-slot requests. Every fallback is named; if any slot fell back the consensus file and
  the reply carry `DIVERSITY DEGRADED` with the actual model state. The mark is per-run, never a
  standing state.
- A pinned-but-unavailable model falls back to the host default for that slot, named loudly in
  the same way.

## Step 1 — Meta-judge (exactly once)

Dispatch `massa-ai-meta-judge` (read-only) with the task description, artifact type, context,
and artifact paths. Model request: `kimi-k3` (see Step 0.5).

Validate the returned evaluation specification in two stages, in order; a retry names the
**first failed check** and nothing else:

1. **Syntactic** — output parses as YAML (common failure: JSON-style braces or a prose wrapper).
2. **Weights** — every `criteria[].weight` present, summing to 1.0 ± 0.001.
3. **Semantic shape** — every criterion has `id`, `name`, `weight`, `scale` (min 1, max 5),
   `rubric` with anchors for scores 1, 3, 5, and a `checklist` with ≥1 item. Parseable but
   invalid specs (e.g. `scale.max: 7`) fail here, not at stage 1.

On failure: retry the meta-judge **once** with the failed stage + check name. Second failure →
stop `Blocked`. The meta-judge runs exactly once per evaluation — never re-run between rounds,
never edited by the orchestrator; the YAML passes to all judges in all rounds **verbatim**.

Feedback: `🤖 [Agent Started] Meta-Judge is authoring the evaluation specification.`
then `🤖 [Agent Done]` or `🤖 [Agent Blocked]` with the one-line reason.

## Step 2 — Independent analysis (3 judges in parallel)

Dispatch three `massa-ai-judge` agents **in parallel** (round 0), one per judge number, each
with: the verbatim specification YAML, task description, artifact paths, its own report path,
`round: 0`, and its model request (Step 0.5). Each judge writes its own
`audits/judge/<...> judge-N.md` per the report contract and returns the reply block:

```yaml
status: Complete | Partial | Blocked
judge: 1 | 2 | 3
round: 0 | 1 | 2 | 3
scores:
  overall: <weighted score>
  criteria: { <id>: <score>, ... }
agreement: accept-consensus | contest
strengths: [<≤3 items>]
weaknesses: [<≤3 items>]
revisions: [<criterion: old→new, evidence pointer>]   # debate rounds only
risks_and_skips: <string>
next_step: <string>
```

A reply block with malformed or missing `scores` counts as `contest` for that round; the same
judge malformed twice → stop `Blocked`. A judge dispatch that fails goes through Name Resolution
(`references/agent-orchestration.md`): the main agent runs that judge's scope locally against
the same output contract and marks the substitution in the consensus file; if a full marked
panel still cannot complete, stop `Blocked`. A silently reduced panel is never allowed.

## Step 3 — Consensus check (from reply blocks only)

After every round (including round 0), compute step by step:

1. Extract each judge's `scores.overall` and list them explicitly.
2. max − min ≤ **0.5** → overall consensus candidate; otherwise no consensus.
3. For every criterion, list the three scores side by side; max − min ≤ **1.0** on **every**
   criterion → criterion consensus; otherwise name the contested criteria.
4. Every judge's `agreement` is `accept-consensus`.

Consensus requires **all three** conditions. If consensus after round 0 → skip debate, go to
Step 5. If no consensus and rounds remain → Step 4. If no consensus after round 3 → Step 6.

## Step 4 — Debate round (rounds 1..3, max 3)

Increment the round. Dispatch three `massa-ai-judge` agents **in parallel** again, each with:
the verbatim specification YAML (unchanged), task description, artifact paths, its own report
path, **all three** report paths as peer paths, and `round: R`. Each judge:

1. Re-reads its own previous report and reads the peer reports from the filesystem directly.
2. Identifies criterion disagreements (> 1.0 gap).
3. Defends with quoted evidence; challenges with quoted counter-evidence.
4. Revises a score **only** when peer evidence is compelling, quoting the new evidence.
5. **Appends** a `## Debate Round {R}` section to its own file (append-only — never rewrites,
   never creates a fresh file).
6. Returns the reply block with revisited `scores`, `agreement`, and `revisions`.

Then return to Step 3.

## Step 5 — Consensus report

Assemble from reply blocks only (never by opening judge files):

1. Consensus score table (J1/J2/J3/mean per criterion + overall).
2. Consensus strengths/weaknesses = the intersection of the judges' replies.
3. Debate summary: rounds taken, initial disagreements, and how each resolved (from `revisions`).
4. Final recommendation: Pass / Fail / Needs Revision with justification tied to the scores.
5. Diversity line: `OK`, or `DIVERSITY DEGRADED` naming slots and actual models; local-fallback
   marks when a Name Resolution local run substituted for a judge.

Write `audits/judge/<YYYY-MM-DD judge-with-debate consensus.md>` per the report contract
(freshness header + Verification/Test Fidelity Checklist) and reply the verdict to the user with
rounds taken and the diversity state.

## Step 6 — No-consensus report

After round 3 without consensus: write the consensus-path file with
`Final Recommendation: NO CONSENSUS — human review required`, the per-judge score table showing
the unresolved gaps, the specific criteria that never converged, and an analysis of why. Reply
with the disagreement summary and the report paths. **Never emit a consensus verdict the panel
did not reach.**

## Pitfalls (each is a rule, not advice)

- Never skip the meta-judge; never let judges score without the shared specification.
- Never modify or regenerate the specification between rounds — verbatim, every round.
- Never let a debate judge create a new report file — append-only `## Debate Round {R}` sections.
- Never relay reports between judges through the orchestrator — filesystem channel only.
- Never open judge report files in orchestrator context — reply blocks carry everything needed.
- Never accept a score revision without quoted evidence (sycophancy check).
- Never exceed 3 debate rounds or 3 judges — the protocol is fixed.
- Never treat a `contest` or malformed reply as agreement — missing scores mean no consensus.
