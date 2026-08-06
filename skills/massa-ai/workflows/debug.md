---
name: debug
description: "Use this workflow for evidence-backed root-cause diagnosis of broken behavior, failures, regressions, or crashes; route new capabilities to feature and broad redesign to spec-driven."
license: MIT
metadata:
  version: "1.2.0"
---

### 🔴 Debug

Use when the user reports broken behavior, failures, regressions, crashes, unexpected output, flaky behavior, or any issue needing evidence-backed root-cause diagnosis before a fix. Not for new capabilities — route to `workflows/feature.md`. Not for broad redesign or unclear cross-boundary changes — route to `workflows/spec-driven.md`.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

1. Generate/reuse `workflowSessionId`: `debug-[entity]`
2. Load shared references:
   - `references/codebase-investigation.md`
   - `references/debug-diagnosis-loop.md`
   - `references/mobile-diagnosis.md` when the bug target involves KMP, iOS, Android, native bridges, devices, simulators/emulators, or mobile lifecycle
   - `references/verification-ladder.md` before Quick/Standard/Spec-driven sizing or applying fixes
   - `references/context-firewall.md` before inspecting logs, traces, snapshots, or generated output that meet its threshold table (a single source/log/doc block >200 lines, >20 KB, or >50 search hits)
   - `references/lessons.md` when `.specs/lessons.json` exists, to load confirmed project lessons before diagnosis
3. `recall` → load prior debugging attempts for this entity
4. IF prior attempts exist:
   - Review what was already tried
   - Focus on untested hypotheses
   - Treat memories tagged `stale` or superseded by `stale-replaces:*` as historical only
   - Do not repeat ruled-out hypotheses unless new evidence invalidates the prior result
5. Follow the shared retrieval order from `references/codebase-investigation.md`
   to load relevant code. `optimized_context` has no session field; put
   `workflowSessionId` in query text/tags and pass only `synapseSessionId` to
   `search.sessionId`.
   - For large files (>200 lines) or derived-value computation, call `execute_file` with `path`, `language`, and `code` to run analysis code over the file instead of loading the entire file into context. Respect the local-dev-only trust model (no untrusted-client exposure).
   - After opening a file for deep investigation, call `synapse_prefetch` with `id` (the `synapseSessionId`) and `filePath` to warm the Synapse buffer before the next search. Requires an existing `synapse_session` id.
6. IF step 3's `recall` returned no hit for the debug target AND no `.specs/project/onboarding/` docs already exist for this codebase: run the brownfield Minimum Bar gate in `references/brownfield-mapping.md` — derive `TESTING.md` (feeds the feedback loop's gate commands in step 7) and `CONCERNS.md` (feeds the Hypothesis Board's ranking in step 9) under `.specs/project/onboarding/`. A fix that already looks Quick-sized may proceed on `TESTING.md` alone.
7. Build or request a trustworthy feedback loop before editing:
   - Use the reproduction ladder in `references/debug-diagnosis-loop.md`: unit/CLI repro, integration/API repro, app/browser/device repro, then structured HITL.
   - IF no loop can run, record a skipped-reason enum from the debug reference and collect the strongest root-cause proof available
8. Reproduce and minimize the user-described failure without losing the original failure signal
9. Rank 3-5 falsifiable hypotheses before testing:
   - include evidence, prediction, probe, disproof criteria, and tested result
   - test one hypothesis at a time; instrument only to answer the current hypothesis
   - for flaky failures, measure and improve reproduction rate before root-cause guessing
   - When a hypothesis's disproof turns on external library/API behavior (a narrow case — most debug work is internal to this codebase), run the chain in `references/knowledge-verification-chain.md` before accepting or ruling out that hypothesis.
10. Apply debugging heuristics (see `references/decision-engine.md`):
   - Trace data flow: input → transformation → output
   - Compare expected vs actual behavior
   - Check recent changes first
   - Minimize search space to relevant modules
   - For call/data-flow path tracing, call `trace_path` with `function_name` (or `qualifiedName`), `project`, `direction` (outbound/inbound/both), `mode` (calls/data_flow/cross_service/all), and `depth` to trace typed-edge BFS paths. `trace_path` only counts as evidence when the index is fresh for the current repository path and commit/worktree state; fall back to `search`/`get_references` and record reduced retrieval confidence when the index is stale or unavailable.
11. Size the fix before editing:
   - Use the exact Quick, Standard, and Spec-driven thresholds in `references/verification-ladder.md`.
   - Refactor route applies only when the fix becomes behavior-preserving cleanup after the root cause is proven.
12. Define the verification recipe before changing code:
   - reproduction or root-cause proof
   - commands, tests, or artifact checks that prove the fix
   - file-integrity checks for validation assets such as tests, specs, benchmarks, fixtures, and snapshots
13. Fix the divergence point closest to the root cause
14. Add regression coverage at the correct seam, or document why no valid regression seam exists:
   - (a) write the test first, asserting the exact previously-broken behavior at the divergence point
   - (b) at Standard+, prove the coverage discriminates: run the sensor in `references/discrimination-sensor.md` against the just-fixed code; a surviving mutant means the regression test does not yet prove the fix

> **Dispatch: `massa-ai-reviewer`** (role: `reviewer`) — charter `skills/agents/reviewer/SKILL.md`
> - trigger: implementation complete, before the verification gate — never optional
> - scope: the fix's diff surface and its task/AC context
> - permissions: read-only
> - inputs: diff, acceptance context, recalled code-quality conventions
> - sensors: bugs, regressions, missing edge cases, smells introduced by the diff
> - output: ranked findings, blocking vs advisory; blocking findings become fix items before verification runs
> - firewall: summarized findings only, never raw diff dumps
> - memory: suggest-only; main agent persists
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes review against this output contract and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

> **Dispatch: `massa-ai-verification-agent`** (role: `verification-agent`) — charter `skills/agents/verification-agent/SKILL.md`
> - trigger: mandatory at Standard+/Spec-driven fix size, per the Independent Verification Mandate tier gate in `references/verification-ladder.md`; a Quick-tier fix takes the fallback below instead
> - scope: the fixed divergence point from step 13, its reproduction path, and the regression test added in step 14
> - permissions: read-only
> - inputs: the root cause, the reproduction evidence, the regression test, and the changed files — not spec acceptance criteria
> - sensors: re-run of the reproduction/feedback loop confirming the original failure signal no longer reproduces; discrimination sensor per `references/discrimination-sensor.md` (mutate the fixed code; the regression test must kill it)
> - output: confirmed/disproven root-cause-closure verdict with evidence
> - firewall: raw reproduction transcripts and logs summarized, never raw dumps
> - memory: suggest-only; main agent persists debug verification outcomes
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes re-check of root cause, reproduction, and regression coverage, and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

15. If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
     `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
     Rerun the original feedback loop, run the verification recipe, and remove temporary instrumentation unless intentionally retained as observability. The fix → re-verify cycle is capped by `references/verification-ladder.md`'s Bounded Fix→Re-verify Loop; a reached cap stops the session `Blocked` with the evidence preserved. That cap counts re-verify cycles across the whole symptom and is a separate counter from the two-consecutive-failed-fixes breaker into `references/root-cause-scripts.md` named in this file's preamble — that breaker fires inside a single edit iteration and neither consumes nor resets the re-verify count.
16. Use `references/agent-orchestration.md` for isolated investigation branches; the Standard+ verifier dispatch above is mandated by that reference's Independent Verification Exception, not merely loaded when it improves signal.
17. IF fix found:
   - Persist the root cause via `remember` as a scored `decision` memory with `memory:semantic`
   - Persist the fix pattern via `remember` as a scored `pattern` memory with `memory:procedural`
   - If a prior debugging memory for this entity is now stale or contradicted by the fix, call `memory_update` with its `id` and the corrected `content` (re-embeds automatically)
18. IF NOT resolved:
   - Persist what was ruled out via `remember` as a scored `conversation` memory with `memory:episodic`
   - Persist repeated failed tool loops as procedural cognition lessons only when they are reusable
   - Document remaining hypotheses for future sessions
19. At Standard+ size, serialize this file's Output Contract sections into `.specs/debug/<slug>/REPORT.md` and run `bun skills/massa-ai/scripts/check_specs_delivered.ts <slug> --kind debug` before the Evidence Gate; a non-zero exit blocks completion. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved). See `references/artifact-persistence.md` for the canonical-store and precedence rules governing this artifact.
20. Complete the Evidence Gate from `references/evidence-gate.md`

## Output Contract

- Issue Summary: symptom, impact, frequency, and environment
- Feedback Loop: command, tool, artifact, or root-cause proof that showed failure and then success
- Hypothesis Board: ranked hypotheses and tested results
- Root Cause: evidence-backed diagnosis with the divergence point
- Fix + Validation: code/test strategy, verification recipe, and commands or artifacts checked
- Prevention: regression test, monitor/runbook suggestion, and memory outcome
- For mobile bugs: device matrix, platform parity, crash/log artifact, and impacted/unaffected platform validation

## Failure Handling

- `.specs/debug/<slug>/` unwritable at Standard+: block the `REPORT.md` write and record the blocker; never substitute a memory write or chat summary for the canonical debug artifact.
- Fix → re-verify loop reaches the `references/verification-ladder.md` cap: stop the session `Blocked`, preserve the collected reproduction and verification evidence, and ask the user for direction.
- Discrimination sensor mutation on the fixed divergence point is not safely reversible: mark `Blocked` unless the verification-agent can show equivalent discrimination from an existing deterministic mutation fixture.

## Example

User asks: "The login route returns 500 after deploy."

1. Use `workflowSessionId=debug-login-route-500` and recall `session:debug-login-route-500 login route 500 prior attempts`.
2. If recall says "session expiry was ruled out on 2026-05-30", do not repeat that hypothesis unless new evidence contradicts it.
3. Establish the feedback loop: reproduce the 500 with the smallest route check that preserves the deploy failure signal.
4. Build a hypothesis board: missing env, middleware ordering, expired session lookup, or database connection regression; probe one at a time.
5. Trace request → auth middleware → session lookup → response, then fix the divergence point closest to the root cause.
6. Define the verification recipe: rerun the original route check, add or update regression coverage at the failing seam, and confirm validation assets were not weakened.
7. If root cause is a missing `DATABASE_URL`, persist via `remember`: a semantic decision memory for the root cause and a procedural pattern memory for the deploy-env verification command.
8. At Standard+ size, dispatch `massa-ai-verification-agent` to independently re-run the reproduction against the `DATABASE_URL` fix and confirm the regression test kills a mutant on the restored connection check before closing.

<!-- validator anchors: brownfield Minimum Bar gate | references/knowledge-verification-chain.md | prove the coverage discriminates | Dispatch: `massa-ai-verification-agent` | Independent Verification Exception | Bounded Fix→Re-verify Loop | .specs/debug/<slug>/REPORT.md | check_specs_delivered.ts <slug> --kind debug | graceful degradation preserved | references/artifact-persistence.md | ## Failure Handling -->

