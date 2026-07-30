# Judge With Debate Specification

- Feature slug: `judge-with-debate`
- workflowSessionId: `spec-judge-with-debate`
- projectId: `massa-ai`
- Base pattern: NeoLabHQ `context-engineering-kit` `plugins/sadd/skills/judge-with-debate/SKILL.md` @ `555b952` (external reference, not authority — this repo's contracts win on conflict)

## Problem Statement

Single-pass evaluation of an artifact (one agent, one verdict) carries single-agent bias and
unforced justification. The Multi-Agent Debate pattern fixes this by having a meta-judge generate
a tailored evaluation specification once, three independent judges score against it, and the
judges then debate their disagreements over up to 3 rounds until consensus. massa-ai has no such
capability; this feature ports the pattern into the harness as a standalone workflow plus two new
sub-agent charters, following this repo's charter, registry, generator, and report conventions.

## Goals

- [ ] User can invoke `judge-with-debate` on any artifact(s) with a task description and receive an evidence-grounded consensus verdict produced by 3 model-diverse judges under a shared meta-judge evaluation specification.
- [ ] Judge reports and the consensus report persist under `audits/judge/` per `references/audit-report-io.md`.
- [ ] Two new charters (`meta-judge`, `judge`) registered, generated into all 4 plugin bundles, and enforced by existing integrity/parity gates.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Wiring judge-with-debate into other workflows (Design gate, audit second-instance) | User decision: standalone invocation only; adoption is a follow-up |
| Configurable judge count or debate-round count | User decision: full protocol fixed at 3 judges / max 3 rounds |
| Model pins in generated agent frontmatter | User decision: model diversity is a dispatch-time advisory in workflow text (Task tools have no model parameter) |
| Single-judge / single-pass mode | Defeats the pattern; not requested |
| Telemetry, cost tracking, or model-usage analytics | Not requested |
| Special-casing massa-ai's own `.specs/` artifacts as judgment targets | Generic artifacts only |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| A1 Model IDs `kimi-k3`, `deepseek-v4-pro`, `minimax-m3`, `GLM-5.2` | Recorded verbatim as given by user; unverified against provider catalogs | Knowledge Verification Chain step 5: no catalog tool available this session; user accepted as-given | y |
| A2 Model fallback | Unavailable/unsupported pinned model → host default model for that slot + loud diversity warning in consensus output. **Reactivation is per-invocation**: the workflow probes host dispatch-time model capability on every run, so a host gaining the capability activates diversity automatically — the mark is not a permanent state (Plan Challenge C1) | User decision; matches existing advisory `model_hint` convention (`plan-critic` charter precedent) | y |
| A3 Orchestrator never opens judge report files | Consensus computed from structured dispatch replies; final synthesis assembled from replies, files are the judge-to-judge channel only | Resolves base skill's internal contradiction ("orchestrator doesn't read reports" vs "read all three reports"); preserves Context Firewall across up to 13 dispatches | y (design decision, validated in Design) |
| A4 `audits/judge/` is a new report family added to `references/audit-report-io.md` | Path shape `audits/judge/<YYYY-MM-DD judge-with-debate ...>`; git-tracking policy identical to existing audit families | User decision: follow audit-report-io | y |
| A5 Consensus synthesis saved to file | `audits/judge/<YYYY-MM-DD judge-with-debate consensus.md>` plus chat reply | User decision | y |
| A6 Judge charter `model_hint` records the 3-slot assignment descriptively | Single charter cannot pin 3 models; hint text states per-slot diversity is assigned by the workflow at dispatch | One-charter constraint (user decision in round 2) | y |
| A7 Feature executes on its own branch/worktree | Per SWU-01..06 mandatory-worktree convention; main checkout carries PR-B Execute | Repo convention (STATE.md Current block) | y |

**Open questions:** none — all resolved with the user across three question rounds.

---

## User Stories

### P1: Full debate evaluation ⭐ MVP

**User Story**: As a developer, I want to invoke judge-with-debate on any artifact with a task
description so that I receive an evidence-grounded consensus verdict from three independent,
model-diverse judges instead of one biased single-pass assessment.

**Why P1**: It is the entire feature; every other story is a failure mode of this one.

**Acceptance Criteria**:

1. WHEN the user invokes judge-with-debate with artifact path(s) and a task description THEN the workflow SHALL dispatch `massa-ai-meta-judge` exactly once and pass its evaluation specification YAML verbatim to all judges in all rounds.
2. WHEN the evaluation specification exists THEN the workflow SHALL dispatch 3 `massa-ai-judge` agents in parallel, each writing its own independent report to `audits/judge/<YYYY-MM-DD judge-with-debate judge-N.md>` with per-criterion scores, quoted evidence, and a weighted overall score.
3. WHEN judges disagree (overall gap > 0.5 or any criterion gap > 1.0) THEN the workflow SHALL run debate rounds (max 3) in which each judge reads peer reports from the filesystem directly, appends a `## Debate Round {R}` section to its own file, and replies with revisited scores.
4. WHEN consensus is reached (all overalls within 0.5, every criterion within 1.0, all judges explicitly accept) THEN the workflow SHALL save `audits/judge/<YYYY-MM-DD judge-with-debate consensus.md>` and reply with consensus scores, strengths/weaknesses, rounds taken, and a Pass/Fail/Needs-Revision recommendation.
5. WHEN initial independent analyses already satisfy consensus THEN the workflow SHALL skip debate rounds and proceed directly to the consensus report.

**Independent Test**: Invoke on a sample artifact with a rubric-able task; verify 1 meta + 3 judge dispatches, 3 judge files, consensus file, and a verdict reply — without reading any judge file in the orchestrator context.

---

### P2: Honest no-consensus and failure handling

**User Story**: As a developer, I want the workflow to report persistent disagreement honestly so
that I am never handed a forced verdict the panel did not reach.

**Why P2**: Trust in the verdict is the feature's value; a manufactured consensus is worse than none.

**Acceptance Criteria**:

1. WHEN no consensus exists after 3 debate rounds THEN the workflow SHALL report each judge's final scores, the specific criteria with unresolved disagreement, an analysis of why, and a flag for human review — and SHALL NOT emit a consensus verdict.
2. WHEN a judge or meta-judge dispatch fails or is unavailable THEN the workflow SHALL apply `references/agent-orchestration.md` Name Resolution fallback; if fewer than 3 judges can be dispatched, the workflow SHALL stop with `Blocked` rather than run a reduced panel silently.
3. WHEN the meta-judge returns malformed evaluation YAML THEN the workflow SHALL retry the meta-judge once with the defect named; if still malformed, stop with `Blocked`.
4. WHEN artifact paths are missing/unreadable or the task description is empty THEN the workflow SHALL refuse before any dispatch and say what is missing.

**Independent Test**: Fixture judges with locked disagreement and one unavailable slot; verify Blocked/no-consensus outputs and absence of a consensus verdict.

---

### P2: Model diversity advisory with loud fallback

**User Story**: As a developer, I want judges dispatched on diverse models (meta: kimi-k3; J1:
deepseek-v4-pro; J2: minimax-m3; J3: GLM-5.2) so that correlated model bias does not masquerade
as consensus — and I want to know loudly when a host cannot honor that.

**Why P2**: Diversity is the statistical point of the panel; silent single-model panels destroy it.

**Acceptance Criteria**:

1. WHEN the workflow dispatches meta-judge and judges THEN each dispatch SHALL request the slot's pinned model per A1.
2. WHEN a host cannot apply a dispatch-time model or the model is unavailable THEN the workflow SHALL fall back to the host default for that slot and SHALL record a diversity warning naming the slot in the consensus output and reply.
3. WHEN all slots fall back THEN the workflow SHALL still complete the protocol and SHALL mark the verdict `DIVERSITY DEGRADED` in the consensus file.
4. WHEN the workflow starts THEN it SHALL probe whether the host supports dispatch-time model selection on every invocation, so a host that gains the capability activates per-slot diversity without any harness edit (the degradation mark is per-run, never a standing state).

**Independent Test**: Dispatch on a host without per-dispatch model support; verify fallback warning appears in file + reply and verdict is marked.

---

### P3: Report hygiene

**User Story**: As a developer, I want repeat evaluations on the same day to accumulate without
clobbering so that I can compare runs.

**Why P3**: Cheap, prevents silent overwrite; follows existing audit-report-io collision rule.

**Acceptance Criteria**:

1. WHEN a report path for the same target and date already exists THEN the workflow SHALL apply the audit-report-io suffix rule (`-2`, `-3`, …) and state the deviation.
2. WHEN judges run in parallel THEN each judge SHALL write only its own `judge-N` file (disjoint write set per dispatch).

**Independent Test**: Two runs same day, same target; verify both file sets exist.

---

## Edge Cases

- WHEN a judge revises a score without quoting new evidence THEN the charter SHALL treat it as a violation — revisions require compelling quoted evidence (anti-sycophancy restriction in the judge charter).
- WHEN a judge creates a new file instead of appending during debate THEN the workflow's output contract is violated; the dispatch text SHALL state append-only explicitly (base-skill documented pitfall).
- WHEN the evaluation specification is modified between rounds THEN the protocol is broken; workflow SHALL pass the original YAML verbatim every round (base-skill documented pitfall).
- WHEN the target artifact is very large THEN the workflow SHALL pass paths, not content, and judges read what they need within their own context (Context Firewall).
- WHEN consensus check inputs are incomplete (a judge reply missing scores) THEN the workflow SHALL treat that round as no-consensus and proceed to the next round or the no-consensus path.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| JD-01 Meta-judge once, YAML verbatim, mandatory | P1 | Design | Verified |
| JD-02 3 parallel independent judges, evidence-grounded reports | P1 | Design | Verified |
| JD-03 Debate rounds ≤3, filesystem-only judge channel, append-only | P1 | Design | Verified |
| JD-04 Consensus detection from replies (0.5 / 1.0 / explicit accept), skip-when-already-consensus | P1 | Design | Verified |
| JD-05 Consensus report file + verdict reply | P1 | Design | Verified |
| JD-06 No-consensus honest reporting, no forced verdict | P2 | Design | Verified |
| JD-07 Dispatch failure → Name Resolution → Blocked under 3 judges; malformed YAML → 1 retry → Blocked; input validation before dispatch | P2 | Design | Verified |
| JD-08 Model diversity advisory + loud fallback + DIVERSITY DEGRADED mark | P2 | Design | Verified |
| JD-09 `audits/judge/` family, collision suffix, disjoint per-judge writes | P3 | Design | Verified |
| JD-10 Two charters from template (read-only, persona-boundary lines verbatim, model_hint metadata) | P1 | Design | Verified |
| JD-11 Registry + generator + parity/integrity registration (15→17 agents, tables, rosters, regenerated bundles) | P1 | Design | Verified |
| JD-12 Workflow file + router table entry (explicit route: "judge", "judge-with-debate", "evaluate with debate") + conversation-feedback status lines | P1 | Design | Verified |

**Coverage:** 12 total, 12 mapped (Design pending), 0 unmapped.

## Implicit-Requirement Sweep (Large)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | JD-07 AC-4 (paths + non-empty task description validated pre-dispatch) |
| Failure / partial-failure states | JD-06, JD-07 (no-consensus path, dispatch failure, malformed YAML) |
| Idempotency / retry / duplicates | JD-09 AC-1 (collision suffix, never overwrite); meta-judge exactly-once (JD-01) |
| Auth boundaries & rate limits | N/A — local agent dispatches; external model API cost/rate limits accepted as host concern |
| Concurrency / ordering | JD-02/JD-09 (parallel judges, disjoint write sets, fixed phase order) |
| Data lifecycle / expiry | Assumption: reports accumulate under `audits/judge/`; no TTL, manual cleanup, same policy as other audit families |
| Observability | JD-12 (conversation-feedback status lines at phase transitions) |
| External-dependency failure | JD-08 (model unavailable → loud fallback) |
| State-transition integrity | JD-01/JD-04 (fixed phase order; meta-judge never skipped or re-run; debate skipped only on immediate consensus) |

## Success Criteria

- [ ] Full debate runs end-to-end on a sample artifact with consensus file + verdict reply produced.
- [ ] `skills-harness-integrity` and `subagent-parity` suites pass with 17 agents registered; both generators `--check` no drift.
- [ ] `bun run test:scripts` zero new failures vs pre-feature baseline.
- [ ] Independent verification-agent PASS with per-AC evidence.

## Verification Approach

Harness-text feature (precedent: `persona-agent-boundary`). Gates: existing integrity/parity
suites (charter enumeration from disk, persona-boundary lines, dispatch-name resolution, generator
drift), `bun run test:scripts` aggregate, both generators `--check`. Discrimination sensor at
validation: e.g., remove a charter's persona-boundary line or a registry row and confirm a suite
goes red. Independent `massa-ai-verification-agent` runs at Execute end (author ≠ verifier).
