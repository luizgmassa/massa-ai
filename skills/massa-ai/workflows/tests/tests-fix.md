---
name: tests-fix
description: "Executes fixes from a saved tests audit report; not for findings-only coverage review or generic test-writing work without an audit report."
license: MIT
metadata:
  version: "1.3.0"
---

### Tests Fix

Execute fixes from a tests audit markdown report only.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate — one go-ahead covers local commits through PR creation only, force-push/deploy/merge stay separately gated per `references/audit-report-io.md`'s Execution Report Input) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

**Isolation Gate — before the first file edit:** execute `references/implementation-delivery.md` Stage 0–1 now (fetch base, create the worktree + branch, work inside it) and record the worktree path + branch — or one of Stage 1's two legal skip reasons, verbatim — before any repository mutation.

Not for findings-only test coverage, assertion quality, fixture health, flakiness, or regression-risk review — route to `workflows/tests/tests-audit.md`. Not for generic "write some tests" work without an audit report — route broad test planning through the relevant feature, debug, refactor, or spec-driven workflow.
**Reuse Scan — before writing new implementation code:** run the mandatory reuse scan per `references/code-reuse-scan.md` (separate read-only subagents; the reuse map's use/extend/new decisions are consumed before new code is planned or written) — or record its inline-fallback reason, verbatim.


1. Resolve/reuse `workflowSessionId`: `tests-fix-[entity]`
2. Load shared references:
   - `references/audit-report-io.md` before any code or test change
   - `references/naming-standards.md` before introducing or renaming identifiers, screens, components, attributes, or implementation-facing names (English-conversion rule applies)
   - `references/lessons.md` to load confirmed project lessons
   - `references/codebase-investigation.md` before changing unfamiliar tests or fixtures
   - `references/mobile-context.md` when the report target touches KMP, iOS, Android, native bridges, mobile lifecycle, offline sync, permissions, local persistence, UI snapshots/screenshots, or backend-mobile contracts
   - `references/verification-ladder.md` before non-trivial edits
   - `references/discrimination-sensor.md` before closing a TST finding at Standard+/Spec-driven size or high/critical severity, to size the mutation-target sensor against the new or repaired test's subject code
   - `references/knowledge-verification-chain.md` when the fix direction depends on an external test framework's or assertion library's current behavior rather than in-repo convention
   - `references/context-firewall.md` before inspecting large logs, snapshots, generated reports, or broad search output
   - `references/agent-orchestration.md` only for large/high-risk findings, disjoint implementation slices, or independent verification
   - `references/brownfield-mapping.md` (Minimum Bar's `TESTING.md` only — the report's `Regression Risk` field already covers `CONCERNS.md`) when recall returns no hit for the target test suite/harness and no gate command is derivable from the report's evidence, for Standard+ findings
3. `recall` -> load testing conventions, mock boundaries, test frameworks, prior flaky tests, known regressions, accepted exceptions, and reusable verification recipes for the report target.
4. Select the tests audit report with execution focus:
   - Establish the report selector, target focus, and optional finding selector before selecting a report. Target focus can be a behavior, flow, module, test suite, files/globs, branch comparison, commit range, symbol/class/function, or explicit whole-repo target.
   - If the user gives a path, read that exact markdown file.
   - If the user asks for "latest" or gives no path, require a concrete target focus first; do not run the latest tests report against an unspecified target.
   - Select the latest `audits/tests/<YYYY-MM-DD tests-audit>.md` only after target focus is known, using `references/audit-report-io.md`.
   - Stop if no report exists; do not infer findings from conversation history.
   - Validate the report deterministically: `bun skills/massa-ai/scripts/validate_audit_report.ts <path> --family tests` (`references/audit-report-io.md`, Deterministic Validation); non-zero exit blocks editing. Also confirm resolved files or material scope evidence and current file/line evidence; stop on stale, target-drifted, or ambiguous reports.
5. Extract actionable test findings:
   - Keep findings with concrete `Location`, `Evidence`, impacted behavior, regression risk, `Simplest Test Direction`, `Deterministic Sensor`, and `Verification Suggestion`.
   - Ignore ruled-out candidates, no-finding sections, and low-confidence hardening ideas unless the user explicitly asks to include them.
   - If the user supplied finding IDs, extract only those IDs after validating they exist and match the current target focus.
   - Rank by regression risk, severity, dependency order, and determinism.
6. Build a coverage execution map before editing:
   - Finding ID -> behavior under test, missing/weak assertion, fixture/mock boundary, deterministic harness, validation asset, expected failure before fix when possible, verification command, and discrimination sensor result.
   - Separate missing coverage, weak assertion, fixture drift, flakiness, skipped test, and missing deterministic sensor findings.
   - Keep this map current through closure: filled in, it is the pre-edit draft of the Fix Closure Report's Closure Matrix, one row per finding.
   - For mobile findings, include KMP/shared vs platform-specific boundary, native bridge payload or backend-mobile contract, Android/iOS harness, device matrix or simulator/emulator assumptions, platform parity expectation, and skipped platform checks from `references/mobile-context.md`.
7. Size each finding with `references/verification-ladder.md`:
   - Quick: local test addition, assertion strengthening, fixture field correction, or focused skipped-test restoration.
   - Standard: integration harness change, shared fixture/mocking repair, flake root-cause fix, or production seam needed for deterministic testing; define verification recipe first.
   - Spec-driven: test strategy redesign, broad harness migration, unclear behavior contract, or production behavior change beyond enabling deterministic tests; pause and route to `workflows/spec-driven.md` or ask for approval.
8. Apply test fixing methods:
   - Missing coverage: write the smallest deterministic test that fails on the risky behavior and passes with correct behavior.
   - Weak assertions: assert externally meaningful behavior, outputs, side effects, persisted state, emitted events, or user-visible contracts rather than implementation details.
   - Fixture drift: repair fixtures/builders to match current contracts while keeping them minimal and explicit.
   - Flakiness: prove root cause first; control time, randomness, async scheduling, filesystem, network, and global state with deterministic seams.
   - Missing sensor: add or document the focused command needed to prove the regression cannot recur.
   - Variation: add varied-input cases (bounds, parameter changes) that exercise the behavior beyond the fixture example — never add a second copy of the fixture example.
   - Mobile coverage: prefer KMP/shared tests before device loops when the behavior is shared; use Android/iOS harnesses, bridge contract tests, screenshot/snapshot checks, lifecycle or permission simulations, and parity validation when the report finding requires them.
9. Guard validation assets:
   - Never weaken assertions only to make the suite pass.
   - Do not delete coverage, snapshots, fixtures, or benchmarks unless the audit report explicitly calls them obsolete and behavior remains protected elsewhere.
   - Prefer production-code changes only when required to expose a deterministic seam or fix a real bug found while writing the audited test.

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
> - trigger: mandatory per the verification-ladder's Independent Verification Mandate for any TST finding closed at Standard+/Spec-driven size or high/critical severity; at Quick size the subagent hop is skipped and the standalone fresh-eyes assertion re-check below runs instead
> - scope: the fixed TST finding's assertion strength, fixture/mock boundary, coverage-execution-map row, and report claim closure
> - permissions: read-only
> - inputs: the finding, the applied test change, the coverage execution map row, the verification command, and validation assets
> - sensors: deterministic command (focused test run, assertion inspection, fixture-not-weakened check) against the coverage execution map row; discrimination sensor per `references/discrimination-sensor.md` (mutate the new/repaired test's subject; the test must kill it)
> - output: confirmed/disproven TST closure verdict with assertion evidence
> - firewall: raw test output/logs summarized
> - memory: suggest-only; main agent persists tests-closure verification outcomes
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes re-check of each TST closure row's assertion evidence and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

10. Use strict harness sensors:
   - Never rely on AI subjective evaluation.
   - If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
     `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
   - Apply the Mandatory Verification Fix Gate from `references/verification-ladder.md`: run the report's Verification Suggestion or an equivalent deterministic command/artifact check for each selected finding or coherent group.
   - Run the actual focused test command first, then broader relevant suites when feasible, such as `rtk yarn test`, `rtk npm test`, `rtk pytest`, or `rtk cargo test`.
   - Continue only when the execution harness returns a clean exit code, or report the exact skipped-check reason.
   - A finding cannot be marked `fixed` when a target-relevant command or artifact check exists but was not attempted; if verification cannot run, mark it `blocked`, `deferred`, or `skipped` with an allowed skipped-check reason.
   - Record command/artifact, result, skipped reason or `none`, highest Verification Ladder level reached, validation assets protected, and residual risk.
   - Sequence the TST proof in two passes, in order: first reproduce the coverage execution map's `expected failure before fix` row red (the pre-fix run proves the assertion can fail); only then, at Standard+/Spec-driven size or high/critical severity, run the discrimination sensor from `references/discrimination-sensor.md` as the post-fix kill-check against the new/repaired test's subject code — Quick focused-assertion findings are exempt from the sensor pass but never from the pre-fix red check.
   - A surviving mutant means the TST claim is unproven: close that finding's row `blocked` rather than `fixed` and emit the `surviving_mutant` lessons signal via the recording command above.
   - The fix→re-verify cycle is capped per `references/verification-ladder.md`'s Bounded Fix→Re-verify Loop (3 verification iterations, then `Blocked` with evidence preserved). That cap is a distinct counter from the "two consecutive failed fixes" breaker in the preamble above, which escalates a single stuck iteration to `references/root-cause-scripts.md` and neither consumes nor resets this cap.
11. Use agent orchestration only when it improves signal — except the verification-agent dispatch above, which `references/agent-orchestration.md`'s Independent Verification Exception mandates for TST closures at the sizes/severities its trigger names, regardless of signal improvement. Dispatch per `references/agent-orchestration.md`:

> **Dispatch: `massa-ai-builder`** (role: `builder`) — charter `skills/agents/builder/SKILL.md`
> - trigger: large/high-risk finding, disjoint implementation slice, or explicit subagent request
> - scope: one isolated test finding with a disjoint write set
> - permissions: write (disjoint write set)
> - inputs: the finding ID, missing/weak coverage type, fixture/mock boundary, deterministic harness, and verification command
> - sensors: focused test command (`bun test`, `pytest`, `cargo test`) with clean exit code; no weakened assertions
> - output: implementation summary, test counts, commands run, deviations
> - firewall: raw test output/logs summarized
> - memory: suggest-only; main agent persists reusable testing patterns
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed
   - Main agent owns report parsing, prioritization, memory writes, final synthesis, and Evidence Gate.
12. Close out with the Fix Closure Report:
   - The coverage execution map from step 6, now filled in through step 10's discrimination sensor result column, is the pre-edit draft of the Closure Matrix — carry its rows forward rather than re-deriving them.
   - Write the final Fix Closure Report per `references/audit-report-io.md` (Fix Closure Report Contract) to `audits/tests/<YYYY-MM-DD tests-fix-closure>.md`, one Closure Matrix row per selected TST finding.
   - Run `bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family tests` before Propose/Evidence Gate; a non-zero exit blocks Propose. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).
13. At completion, persist only durable knowledge after scoring with the Importance Calibration System:
   - Testing conventions, deterministic harness recipes, flaky-test root causes, accepted exceptions, or reusable edge-case coverage patterns.
   - Use required tags: `project:<projectId>`, `session:<workflowSessionId>`, `workflow:tests-fix`, `entity:<entity>`, and one `memory:<tier>` tag.
14. Complete the Evidence Gate from `references/evidence-gate.md`; do not mark tests complete without a clean deterministic exit code or explicit skipped-check reason.

## Examples

User asks: "Use tests-fix to fix latest audit findings for report scheduling."

1. Confirm target focus is `report scheduling`, then read the latest matching `audits/tests/* tests-audit.md`.
2. Validate metadata, target focus, freshness, required fields, and current evidence before editing.
3. Map each finding to missing coverage, weak assertions, fixture drift, flakiness, or missing sensor work.
4. Add or repair deterministic tests without weakening validation assets.
5. Run focused tests and report broader skipped checks when needed.

<!-- validator anchors: references/discrimination-sensor.md | references/knowledge-verification-chain.md | references/brownfield-mapping.md (Minimum Bar's TESTING.md only) | Independent Verification Exception | mandatory per the verification-ladder's Independent Verification Mandate for any TST finding | discrimination sensor per references/discrimination-sensor.md (mutate the new/repaired test's subject; the test must kill it) | Sequence the TST proof in two passes | surviving_mutant lessons signal | Bounded Fix→Re-verify Loop | Fix Closure Report Contract | audits/tests/<YYYY-MM-DD tests-fix-closure>.md | bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family tests | graceful degradation preserved -->
