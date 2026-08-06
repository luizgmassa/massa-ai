---
name: security-fix
description: "Executes fixes from a saved security audit report; not for findings-only security review or generic correctness fixes outside an exploitable path."
license: MIT
metadata:
  version: "1.2.0"
---

### Security Fix

Execute fixes from a security audit markdown report only.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate — its Stage 3 delivery-authorization scope covers one go-ahead through PR creation; force-push/deploy/merge stay separately gated) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

**Isolation Gate — before the first file edit:** execute `references/implementation-delivery.md` Stage 0–1 now (fetch base, create the worktree + branch, work inside it) and record the worktree path + branch — or one of Stage 1's two legal skip reasons, verbatim — before any repository mutation.

Not for findings-only security review — route to `workflows/security/security-audit.md`. Not for generic correctness fixes unless the security report identifies the correctness issue as part of an exploitable path.

1. Resolve/reuse `workflowSessionId`: `security-fix-[entity]`
2. Load shared references:
   - `references/audit-report-io.md` before any code change
   - `references/lessons.md` to load confirmed project lessons
   - `references/codebase-investigation.md` before changing unfamiliar security boundaries; that trigger also gates `.specs/project/onboarding/CONCERNS.md` — consult it before working the finding
   - `references/mobile-context.md` when the report target touches KMP, iOS, Android, native bridges, mobile permissions, secure storage, biometrics, deep links, push/background behavior, local persistence, offline queues, logs/crash privacy, or backend-mobile contracts
   - `references/verification-ladder.md` before non-trivial edits
   - `references/context-firewall.md` before inspecting large diffs, logs, generated reports, or broad search output
   - `references/agent-orchestration.md` only for large/high-risk findings, disjoint implementation slices, or independent verification
   - `references/discrimination-sensor.md` before closing any SEC finding under the Mandatory Verification Fix Gate — its Mutation Target table names the guard just added as the security row
   - `references/knowledge-verification-chain.md` when a guard, validation rule, crypto choice, or auth fix depends on an external library's or API's actual behavior
   - `references/brownfield-mapping.md` (Minimum Bar only — `CONCERNS.md` and `TESTING.md`, Standard+ findings) when recall returns no hit for the security boundary and no gate command is derivable from the report's evidence
3. `recall` -> load auth boundaries, tenant rules, validation conventions, secret-handling policies, accepted exceptions, prior incidents, and verification recipes for the report target.
4. Select the security audit report with execution focus:
   - Establish the report selector, target focus, and optional finding selector before selecting a report. Target focus can be a trust boundary, route, module, flow, files/globs, branch comparison, commit range, symbol/class/function, or explicit whole-repo target.
   - If the user gives a path, read that exact markdown file.
   - If the user asks for "latest" or gives no path, require a concrete target focus first; do not run the latest security report against an unspecified target.
   - Select the latest `audits/security/<YYYY-MM-DD security-audit>.md` only after target focus is known, using `references/audit-report-io.md`.
   - Stop if no report exists; do not infer findings from conversation history.
   - Validate the report deterministically: `bun skills/massa-ai/scripts/validate_audit_report.ts <path> --family security` (`references/audit-report-io.md`, Deterministic Validation); non-zero exit blocks editing. Also confirm resolved files or material scope evidence and current file/line evidence; stop on stale, target-drifted, or ambiguous reports.
5. Extract actionable findings:
   - Keep findings with concrete `Security Boundary`, `Asset`, `Location`, `Evidence`, exploit path or trigger, `Negative Test Direction`, `Simplest Fix Direction`, and `Verification Suggestion`.
   - Ignore ruled-out candidates, no-finding sections, and low-confidence hardening ideas unless the user explicitly asks to include them.
   - If the user supplied finding IDs, extract only those IDs after validating they exist and match the current target focus.
   - Rank by exploitability, severity, affected asset, dependency order, and regression risk.
6. Build a threat-model fix map before editing:
   - Finding ID -> attacker or misuse path, trust boundary, missing/weak guard, data asset, required invariant, negative test, and rollback path.
   - Identify whether the fix belongs in authentication, authorization, ownership/tenant isolation, validation, output encoding, persistence, logging, crypto, config, or tests.
   - For mobile findings, identify whether the fix belongs in secure storage, permission handling, deep-link routing, push/background token handling, biometric fallback, local persistence/offline queue, logs/crash privacy, native bridge payload validation, or backend-mobile contract hardening.
7. Size each finding with `references/verification-ladder.md`:
   - Quick: local guard, schema validation, log redaction, config hardening, or focused negative test.
   - Standard: policy-layer change, middleware ordering, ownership rule, public API validation, data-access guard, or multi-file regression coverage; define verification recipe first.
   - Spec-driven: security model redesign, role model change, tenant model migration, crypto migration, or behavior change needing stakeholder approval; pause and route to `workflows/spec-driven.md` or ask for approval.
8. Apply security fixing methods:
   - Authentication: fail closed on missing/invalid identity, preserve session/token invariants, and avoid bypass paths.
   - Authorization: enforce permission checks at stable boundaries, verify object ownership and tenant isolation, and deny by default.
   - Validation: validate untrusted input before transformation or persistence; prefer schema or framework validators over ad hoc checks.
   - Output and privacy: encode or sanitize outputs, redact secrets and sensitive personal data from logs/errors, and avoid leaking existence of protected resources.
   - Injection and traversal: parameterize queries, constrain paths/URLs, validate protocols/hosts, and avoid unsafe deserialization or dynamic execution.
   - Secrets and crypto: remove hardcoded secrets, use safe config sources, avoid weak algorithms, and preserve key/credential rotation paths.
   - Mobile trust boundaries: preserve platform parity, fail closed on denied/restricted permissions when security-sensitive, validate native bridge payloads before trust, redact local logs/crash artifacts, and protect tokens or personal data in secure storage and offline queues.
9. Preserve security intent with tests:
   - Add or update negative tests for the exploit path when feasible.
   - Include positive tests for allowed behavior so the fix does not over-block legitimate use.
   - Do not weaken existing security assertions to make tests pass.
10. Use agent orchestration only when it improves signal — except the verifier dispatch below, which is unconditional for every SEC finding closed `fixed`, carved out under `references/agent-orchestration.md`'s Independent Verification Exception as the security-fix unconditional case (other fix families use the tier-gated one). Dispatch per `references/agent-orchestration.md`:

> **Dispatch: `massa-ai-builder`** (role: `builder`) — charter `skills/agents/builder/SKILL.md`
> - trigger: large/high-risk finding, disjoint implementation slice, or explicit subagent request
> - scope: one isolated security finding with a disjoint write set
> - permissions: write (disjoint write set)
> - inputs: the finding ID, impacted asset/boundary, exploit path, current guards, and simplest fix direction
> - sensors: report's verification suggestion or equivalent deterministic command; negative tests that attempt to disprove the fix
> - output: implementation summary, commands run, test counts, deviations
> - firewall: raw diffs/logs summarized
> - memory: suggest-only; main agent persists reusable security patterns
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

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
> - trigger: every SEC finding closed `fixed` — never optional, at every tier (verification-ladder Independent Verification Mandate, security-fix exception)
> - scope: the fixed SEC finding's guard, exploit path, negative test, and report claim closure
> - permissions: read-only
> - inputs: the SEC finding, the applied guard, the verification suggestion, the exploit path, and validation assets
> - sensors: deterministic command (negative-test re-run, guard/middleware-order inspection, redaction or crypto check) and report claim closure; guard-mutation discrimination sensor per `references/discrimination-sensor.md` (invert the specific guard just added; the negative test must kill it)
> - output: confirmed/disproven SEC closure verdict with evidence, feeding the Fix Closure Report's Independent Verifier column
> - firewall: raw exploit transcripts and test/log output summarized
> - memory: suggest-only; main agent persists security verification outcomes
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes re-check of each fixed SEC row's guard and negative test, and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed
   - Main agent owns report parsing, prioritization, memory writes, final synthesis, and Evidence Gate.

11. Verify each completed finding:
   - If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
     `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
   - Apply the Mandatory Verification Fix Gate from `references/verification-ladder.md`: run the report's Verification Suggestion or an equivalent deterministic command/artifact check for each selected finding or coherent group.
   - A finding cannot be marked `fixed` when a target-relevant command or artifact check exists but was not attempted; if verification cannot run, mark it `blocked`, `deferred`, or `skipped` with an allowed skipped-check reason.
   - Run the report's verification suggestion when available.
   - At Standard+ size or high/critical severity, run the guard-mutation discrimination sensor per `references/discrimination-sensor.md`: invert the specific guard just added and confirm the negative test kills it; a surviving mutant marks the finding's Closure Matrix row `blocked` and records the `surviving_mutant` lessons signal even when the exploit-path test is green.
   - The fix→re-verify cycle is capped per `references/verification-ladder.md`'s Bounded Fix→Re-verify Loop at 3 iterations; that counter is separate from the two-consecutive-failed-fixes breaker into `references/root-cause-scripts.md` named in this file's preamble, which fires inside a single edit iteration and neither consumes nor resets the loop count.
   - Run targeted tests for negative and positive paths, plus lint/type/build checks relevant to touched files.
   - Inspect logs/config/errors when the finding involves data exposure.
   - Record command/artifact, result, skipped reason or `none`, highest Verification Ladder level reached, validation assets protected, and residual risk.
12. At completion, persist only durable knowledge:
   - Security boundary decisions, accepted exceptions, reusable exploit-path tests, or incident-prevention patterns after scoring with the Importance Calibration System.
   - When step 2's unfamiliar-security-boundary trigger fired for this finding, append any newly discovered security hotspot to `.specs/project/onboarding/CONCERNS.md` — the same wiring that required consulting it before working the finding.
   - Use required tags: `project:<projectId>`, `session:<workflowSessionId>`, `workflow:security-fix`, `entity:<entity>`, and one `memory:<tier>` tag.
13. Write the Fix Closure Report per `references/audit-report-io.md`'s Fix Closure Report Contract, at `audits/security/<YYYY-MM-DD security-fix-closure>.md`, sibling of the consumed audit report; then run `bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family security` before Propose and the Evidence Gate — a non-zero exit blocks both. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).
14. Complete the Evidence Gate from `references/evidence-gate.md`. Urgency does not expand delivery authorization: hotfix pressure never widens the Stage 3 one-go-ahead-through-PR-creation scope named in this file's preamble, and force-push, deploy, and merge stay separately gated regardless of severity.

## Examples

User asks: "Use security-fix to fix latest audit findings for user routes."

1. Confirm target focus is `user routes`, then read the latest matching `audits/security/* security-audit.md`.
2. Validate metadata, target focus, freshness, required fields, and current evidence before editing.
3. Fix critical/high exploit paths first.
4. Add negative tests for denied access, invalid input, or redacted output.
5. Run deterministic tests and report residual security risk.

<!-- validator anchors: every SEC finding closed `fixed` — never optional, at every tier | guard-mutation discrimination sensor | Fix Closure Report Contract | security-fix-closure | consult it before working the finding | append any newly discovered security hotspot | Urgency does not expand delivery authorization | Bounded Fix→Re-verify Loop | graceful degradation preserved -->

