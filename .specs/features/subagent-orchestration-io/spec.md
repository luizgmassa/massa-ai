# Sub-Agent Orchestration I/O Specification

Feature: `subagent-orchestration-io` — encode orchestrator working-memory protection
(Fowler, "The Orchestrator's Tax", 2026) into the massa-ai dispatch contracts, and
unify the fragmented capability-packet / output-contract definitions across workflows
and references.

## Problem Statement

The massa-ai sub-agent surface has four independently maintained capability-packet
shapes, two output-contract copies, and two workflows that dispatch by prose instead
of the standard dispatch block. None of the dispatch-mechanics references encode the
orchestrator-tax findings: nothing prohibits polling a running subagent or ingesting
its raw transcript, no wave-size cap exists for parallel fan-out, consolidation by
shared file/knowledge ownership is stated only for writers, repository-wide git
operations are unconstrained for concurrent workers outside the Verifier's sensor,
subagent non-inheritance of parent skills/context is stated only inside individual
charters, and no output contract carries a quantitative return bound.

Measured baseline (re-measured in this session, 2026-08-04, repo @ d18e7764 v1.23.0):
24 dispatch blocks across 16 files, all 9 fields (`trigger, scope, permissions,
inputs, sensors, output, firewall, memory, persona`) present in all 24;
`judge-with-debate.md` and `refinement/furps-refinement.md` carry 0 blocks (prose
dispatch); capability packet restated in `references/agent-orchestration.md:108-122`,
`references/subagent-design.md:92-106`, and `skills/AGENTS.md:305-321` with
diverging membership (`exact next step` vs `lens`); output contract duplicated in
`agent-orchestration.md:144-151` and `skills/AGENTS.md:327-334`.

## Goals

- [ ] Orchestrator context stays clean by contract: no transcript ingestion, no
      status polling, bounded returns.
- [ ] One canonical capability packet and one canonical output contract, with a
      scripted parity sensor between the two files that must stay self-contained.
- [ ] Every subagent dispatch in every workflow uses the standard dispatch block.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Edits to the 17 charters under `skills/agents/` | All 17 already declare explicit Inputs/Outputs sections (verified this session); charter content is owned by `skills/AGENTS.md` registry rules |
| `skills/model-profiles.json` / model-tier changes | Tiering already structural (`metadata.model_tier`); orchestrator-tax findings do not touch model selection |
| `mcp-tools.md` `batch_execute` concurrency cap (256) | Shell-command primitive, not agent dispatch |
| Installed-copy updates under `~/.claude/skills/` | `scripts/install-skills.sh` owns propagation; repo sources are canonical |
| Runtime enforcement (hooks) of the new rules | Contract text + parity sensor only; hook enforcement is a separate feature if ever needed |
| Rewriting the phase-batch worker protocol (`sub-agents.md` batching algorithm) | The ~7-task budget and sequential model already implement cognitive locality; only its packet mapping and git-safety/transcript rules change |
| `maestro*`, `design`, `mobile-figma*`, `ticket`, `commit`, `adr`, `rfc`, `tdd` workflow edits | They dispatch nothing directly or already inherit via the canonical references; no divergent dispatch text found in them this session |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Wave-size cap value | 4 concurrent subagents per wave; ≥5 planned requires a recorded consolidation check first | Fowler article calibration ("prefer 2-4 per wave; 5+ → consolidate"); FURPS 6-way fan-out becomes waves of ≤4 | n (user absent; autonomous session) |
| Canonical packet owner | `references/agent-orchestration.md`; `subagent-design.md` defers by link; `skills/AGENTS.md` stays self-contained but field-list-identical, guarded by a scripted parity sensor | Bootstrap block is copied to hosts and cannot link into skill internals; parity sensor replaces impossible deduplication | n |
| Default output bound | ≤ 40 lines of returned chat text per subagent unless the dispatch block's `output:` overrides it; file-writing dispatches keep dual-channel (file + compact verdict) | Article: returns should carry conclusions, not reasoning; context-firewall ingestion threshold (200 lines) is the outer bound, return bound must be far smaller | n |
| `exact next step` packet field | Stays in the canonical packet, renamed rationale: it is orchestrator-side framing ("what the main agent will do with the result"); aligned copies carry it identically | Dropping it would change 24 shipped blocks' semantics for no measured harm; aligning is cheaper than removing | n |
| `lens` addendum | Promoted into the canonical packet definition as a conditional field (`audit-specialist` only) | It is real, shipped behavior (`skills/AGENTS.md:321`); canonical definition must not be a subset of practice | n |
| Delivery authorization | Task commits land locally in the feature worktree; push and PR creation deferred until explicit user go-ahead | `implementation-delivery.md` Stage 3 requires one explicit per-feature authorization; user is absent this session | n |
| Batch-worker offer | Execute runs inline in the main agent; offer recorded as not-honorable (autonomous session, user cannot confirm) | Offer-then-confirm requires a user; precedent recorded in STATE for `workflow-policy-updates` | n |

**Open questions:** none — all resolved or logged above.

## User Stories

### P1: Orchestrator working-memory protection ⭐ MVP

**User Story**: As the orchestrating main agent, I want dispatch contracts that keep
subagent reasoning out of my context so that every post-dispatch decision is made on
clean working memory.

**Why P1**: This is the article's core finding and the largest unpriced cost in the
current contracts.

**Acceptance Criteria**:

1. The `references/agent-orchestration.md` Guardrails section SHALL prohibit polling a
   running subagent for status and SHALL prohibit ingesting a dispatched subagent's
   raw transcript, JSONL, or intermediate reasoning; the orchestrator SHALL consume
   only the returned output contract. <!-- ubiquitous / ORC-01 -->
2. The `references/context-firewall.md` Subagent Firewall section SHALL list running
   or completed subagent transcripts among the raw artifacts that never enter the
   main context. <!-- ubiquitous / ORC-01 -->
3. The canonical Output Contract SHALL state a default quantitative bound of at most
   40 lines of returned chat text per subagent, overridable only by an explicit
   `output:` field in a dispatch block. <!-- ubiquitous / ORC-07 -->
4. WHEN a dispatch writes a persisted report file THEN the contract SHALL require the
   chat return to be the compact verdict only, never the file body. <!-- event-driven / ORC-07 -->

**Independent Test**: grep the two references for the new prohibitions and bound;
confirm the bound text exists exactly once (single source) and dispatch blocks are
unchanged in count (24).

### P1: Wave discipline and cognitive locality ⭐ MVP

**User Story**: As the orchestrating main agent, I want an explicit wave-size cap and
a consolidation signal so that fan-out never fragments a shared mental model or
floods the host.

**Acceptance Criteria**:

1. The `references/agent-orchestration.md` SHALL cap concurrent subagent dispatch at
   4 per wave. <!-- ubiquitous / ORC-02 -->
2. IF a workflow plans 5 or more concurrent subagents THEN the reference SHALL
   require a recorded consolidation check (can any two planned agents be merged?)
   before dispatch, and dispatch SHALL proceed in waves of at most 4. <!-- unwanted-behavior / ORC-02 -->
3. The reference SHALL state that overlapping file/module ownership or a shared
   knowledge domain between planned subagents is a consolidation signal for read-only
   agents as well as writers. <!-- ubiquitous / ORC-03 -->
4. WHEN `furps-refinement.md` dispatches its 6 dimension analysts THEN it SHALL
   instruct waves of at most 4 while preserving order-independence. <!-- event-driven / ORC-02 -->

**Independent Test**: grep for the cap in `agent-orchestration.md`; grep
`furps-refinement.md` for the wave instruction.

### P1: Concurrent-worker git safety ⭐ MVP

**User Story**: As a repo owner, I want concurrent subagents structurally barred from
repository-wide git operations so that parallel work cannot corrupt shared state.

**Acceptance Criteria**:

1. The `references/agent-orchestration.md` Guardrails SHALL prohibit repository-wide
   git operations (`git stash`, `git checkout`/`git switch` of shared state,
   `git reset`, `git clean`) inside any concurrently-dispatched subagent's scope, and
   SHALL require disjoint worktrees for concurrent writers. <!-- ubiquitous / ORC-04 -->
2. The `references/spec-driven/sub-agents.md` batch-worker contract SHALL carry the
   same prohibition for workers and SHALL bar the orchestrator from reading worker
   transcripts (compact summary only). <!-- ubiquitous / ORC-04, ORC-01 -->

**Independent Test**: grep both files for the prohibition; confirm the existing
Verifier scratch-worktree rule is untouched.

### P2: One canonical packet and non-inheritance rule

**User Story**: As a workflow author, I want exactly one capability-packet definition
and an explicit non-inheritance rule so that every dispatch names what the subagent
actually receives.

**Acceptance Criteria**:

1. The file `references/agent-orchestration.md` SHALL be the sole canonical
   Capability Packet definition, including the conditional `lens` field for
   `audit-specialist` dispatches. <!-- ubiquitous / ORC-06 -->
2. The file `references/subagent-design.md` SHALL defer to the canonical packet by
   link instead of restating the field list. <!-- ubiquitous / ORC-06 -->
3. The file `skills/AGENTS.md` SHALL carry a field list identical to the canonical
   one, and the parity sensor SHALL fail when the two field lists diverge. <!-- ubiquitous / ORC-06, ORC-08 -->
4. The canonical reference SHALL state that a subagent inherits nothing from the
   parent session — no skills, personas, loaded references, or conversation — and
   that every needed reference path, fact, and artifact is named explicitly in the
   packet. <!-- ubiquitous / ORC-05 -->
5. WHERE a workflow uses a bespoke packet (judge, FURPS analyst, phase-batch worker) that workflow SHALL declare it a specialization of the canonical packet and map its fields. <!-- optional-feature / ORC-06 -->

**Independent Test**: run the parity sensor red (mutate one field name in a scratch
copy) then green; grep `subagent-design.md` for the absence of the old 11-bullet list.

### P2: Uniform dispatch blocks

**User Story**: As a workflow maintainer, I want every dispatch expressed in the
standard 9-field block so that the dispatch population is homogeneous and auditable
by grep.

**Acceptance Criteria**:

1. The file `workflows/judge-with-debate.md` SHALL carry standard dispatch blocks
   for its meta-judge and judge dispatches while preserving the fixed
   3-judge/3-round protocol prose. <!-- ubiquitous / ORC-09 -->
2. The file `workflows/refinement/furps-refinement.md` SHALL carry a standard
   dispatch block for the furps-analyst fan-out. <!-- ubiquitous / ORC-09 -->
3. The repo-wide dispatch-block census SHALL count at least 27 blocks after the
   change (24 existing + ≥3 new), with the 9 field names each matching the block
   count. <!-- ubiquitous / ORC-09 -->

**Independent Test**: `grep -rc '\*\*Dispatch:' skills/massa-ai/` and the per-field
census from this session's baseline commands.

## Edge Cases

- IF the parity sensor's subject text is renamed or moved THEN the sensor SHALL fail
  loudly (it keys on required literals present in both files), never pass on an empty
  population — the sensor prints the extracted field lists beside the verdict.
- IF a host cannot run subagents THEN existing standalone fallbacks remain unchanged
  (no new behavior gated on spawning).
- WHEN the wave cap conflicts with a fixed protocol (judge panel of 3) THEN no change
  is needed — 3 ≤ 4.
- IF `generate-skill-artifacts.ts --check` fails after any edit THEN the task's gate
  is red; bundles regenerate in the same commit as the source edit.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| ORC-01 | P1: Working-memory protection | Design | Pending |
| ORC-02 | P1: Wave discipline | Design | Pending |
| ORC-03 | P1: Wave discipline | Design | Pending |
| ORC-04 | P1: Git safety | Design | Pending |
| ORC-05 | P2: Canonical packet | Design | Pending |
| ORC-06 | P2: Canonical packet | Design | Pending |
| ORC-07 | P1: Working-memory protection | Design | Pending |
| ORC-08 | P2: Canonical packet (parity sensor) | Design | Pending |
| ORC-09 | P2: Uniform dispatch blocks | Design | Pending |

**Coverage:** 9 total, 0 mapped to tasks (pending Tasks phase), 9 unmapped ⚠️

## Implicit-Requirement Sweep (Large — every dimension)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | ORC-07 output bound; parity sensor validates field lists. Others N/A because the feature ships contract text, not runtime input paths |
| Failure / partial-failure states | Parity sensor prints populations beside verdicts (edge case above); degraded paths already owned by router Graceful Degradation — unchanged |
| Idempotency / retry / duplicate handling | N/A because doc edits are idempotent by content; generator `--check` is the duplicate-drift sensor |
| Auth boundaries & rate limits | N/A because no auth surface; wave cap is the only throttle concept and is ORC-02 |
| Concurrency / ordering | ORC-02 (cap), ORC-04 (git safety); sequential rules in `figma-pre-analysis.md` and batch workers untouched |
| Data lifecycle / expiry | N/A because no data at rest beyond git-tracked markdown |
| Observability | Conversation-feedback labels unchanged; no new events |
| External-dependency failure | N/A because no external calls; article content already fetched and summarized |
| State-transition integrity | `.specs/` phase artifacts follow the standard flow; STATE stale-section correction included in close-out |

## Verification Approach

- `bun skills/massa-ai/scripts/validate_spec.ts subagent-orchestration-io` — spec structure.
- Dispatch-block census (count + per-field) before/after: baseline 24/24×9; target ≥27/≥27×9.
- Parity sensor: new `scripts/__tests__/capability-packet-parity.test.ts`, observed red (scratch mutation) before green.
- `bun scripts/generate-skill-artifacts.ts --check` + `bun run lint` per task commit.
- Independent `massa-ai-verification-agent` after the last task (author ≠ verifier), writing `validation.md`.

## Success Criteria

- [ ] All 9 ORC requirements Verified in traceability table.
- [ ] Census and parity sensors green; sensor demonstrated red once.
- [ ] Zero drift between `skills/AGENTS.md` and `agent-orchestration.md` field lists.
