# Agent-Era Harness Upgrades Specification

Slug: `agent-era-harness-upgrades`

## Problem Statement

A gap analysis of the skills/ corpus against agent-era Clean Code practice (Uncle Bob's
no-longer-reading-code workflow, Ousterhout deep modules, the two 2025/26 refactoring
studies) found eight implementable gaps: extraction guidance is size-dogmatic instead of
discoverability-driven, no source-file-size guidance exists tied to agent read mechanics,
no per-category trust ramp exists for earning the right not to read diffs, variation/
property testing and quality-metric trend tracking are absent from every testing surface,
the reviewer agent is chartered but never dispatched by any workflow, the lighter
`feature` workflow has no spec anchor, and test coverage is mislabeled under the
`performance` audit lens. The testing surfaces (`tests-audit`, `tests-fix`,
`test-engineer`) lack the layered gate model where each gate catches a distinct error
class.

## Goals

- [ ] Extraction and file-size guidance in code-quality/refactor/coding-guidelines is agent-read-cost aware (discoverability rationale, ~500/~600-line thresholds) without reintroducing size dogma.
- [ ] `lessons.ts` accumulates per-category review-feedback streaks (advisory trust ramp) and per-validation quality-metric snapshots (trend), with discriminating tests.
- [ ] Every implementing workflow dispatches the `massa-ai-reviewer` agent (with standalone fallback) between implementation and verification.
- [ ] `tests-audit`/`tests-fix`/`test-engineer` express the five-gate error-class model (logic, untouched code, brittleness, built-the-right-thing, drift).
- [ ] All existing gates stay green: `generate:artifacts --check`, parity suites, skills frontmatter validation.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Flat/vertical-slice structure preference over layered | User excluded; contradicts standing evidence-gated anti-VSA-default policy in 4 files |
| Changing the merge-approval clause (`implementation-delivery.md` "Approval for one PR does not carry to the next") | User decision: trust ramp is advisory-only; merge gate untouched |
| Gherkin/BDD test format adoption | Substance (AC-to-test mapping, spec-anchored validation) already covered; transcript itself says format is not the point |
| New MCP/REST tools or host plugin surface changes | Only regenerated bundles from skills sources; no tool-surface change |
| Retroactive backfill of trust categories from git history | Ramp starts empty; backfill is speculative |
| Automatic feedback-level inference from PR comments | Feedback level is recorded explicitly by the user/agent at review time |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| File-size numbers | ~500 lines fine for a one-subject file; over ~600 flag for splitting | **Amended by user 2026-08-06** (superseding the transcript-derived ~1000/~2000; ~2000 judged too much): bound is working-context headroom, not the host single-read cap | y (user decision) |
| Trust streak threshold | 30 consecutive reviews with feedback level `none`/`minor` marks a category trusted; configurable `trust_threshold` in lessons config | Transcript's ~30-PR operational rule; config mirrors existing `promote_threshold` pattern | n (default accepted via advisory-only answer) |
| Feedback levels | `none` and `minor` extend the streak; `major` resets streak to 0 and demotes a trusted category | Transcript: "quase nada de feedback" — near-zero, not literally zero | n (logged) |
| Trust category identity | Free-form kebab-case label supplied at record time (e.g. `installer`, `admin-ui`), same convention as lessons `--scope` | Reuses existing vocabulary; no fixed taxonomy exists | n (logged) |
| Metric snapshot fields | `feature`, `result` (PASS/FAIL), `fixLoopIterations`, `survivingMutants`, `acsTotal`, `acsCovered`, `recordedAt` | Everything validate.md already produces per run; no new measurement invented | n (logged) |
| Reviewer fallback | When the `massa-ai-reviewer` subagent is unavailable, run a standalone fresh-eyes review against the same output contract and record the skipped-delegation reason | Mirrors the established plan-critic fallback pattern | n (logged) |
| Property-testing tool neutrality | Guidance names the technique (vary inputs beyond the fixture example), never a library | Skills run against arbitrary target repos | n (logged) |
| lessons.json backward compatibility | Old stores load unchanged; new record kinds are additive; absent kinds mean empty views, never errors | Store is machine-owned and already versioned by lessons.ts | n (logged) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Agent-read-aware code-shape guidance ⭐ MVP

**User Story**: As an agent following code-quality/refactor guidance, I want extraction and file-size rules justified by agent read mechanics so that refactors optimize discoverability and context cost instead of line-count dogma.

**Why P1**: The current rules actively contradict the evidence (split-on-"and" dogma); every code-quality pass propagates the wrong rationale.

**Acceptance Criteria**:

1. WHEN `code-quality-audit.md` describes a function-split lead THEN the workflow SHALL require the finding to cite an external-discoverability or change-risk rationale, and SHALL prohibit recommending a split on size or "does more than one thing" grounds alone. <!-- AEH-01 -->
2. WHEN `code-quality-fix.md` executes a split finding THEN it SHALL apply the same discoverability-or-change-risk criterion. <!-- AEH-01 -->
3. The `refactor.md` workflow SHALL name extract-for-findability (a named unit findable by search from outside the file) as the primary payoff of extraction. <!-- AEH-01 -->
4. The `coding-guidelines.md` reference SHALL state: a one-subject file up to ~500 lines is acceptable; a file over ~600 lines must be flagged for splitting; splitting one subject across many files adds per-hop navigation cost. <!-- AEH-02, amended by user 2026-08-06: was ~1000/~2000 -->
5. WHEN `code-quality-audit.md` scans static leads THEN it SHALL flag multi-subject files and files over ~600 lines, and SHALL NOT flag a single-subject file on line count below that bound. <!-- AEH-02, amended by user 2026-08-06: was ~2000 -->
6. The file-size guidance SHALL state it derives from agent read mechanics and SHALL NOT be phrased as a module-depth metric (deepening lens L100 rejects LOC-as-depth). <!-- AEH-02 -->

**Independent Test**: Read the four edited files; every split/size rule cites discoverability, change risk, or read mechanics; grep finds no remaining split-on-"and"-alone rule.

---

### P1: Layered test-gate model on testing surfaces ⭐ MVP

**User Story**: As an agent running tests workflows, I want each test gate mapped to the error class it catches so that audits detect the gap types the other gates structurally miss.

**Why P1**: This is the direct "Testing with AI agents" capability request.

**Acceptance Criteria**:

1. The `tests-audit.md` workflow SHALL contain a gate table mapping each gate to its error class: unit → business-logic errors; coverage → code no test touched; variation → hardcoded-example brittleness; acceptance-criteria mapping → built-the-wrong-thing; quality-metric trend → drift over time. <!-- AEH-09 -->
2. WHEN `tests-audit.md` runs its sensors THEN it SHALL include a variation check that flags tests exercising only the single fixture example where input bounds or parameters can vary. <!-- AEH-04 -->
3. WHEN `tests-fix.md` fixes a variation finding THEN it SHALL add varied-input cases (bounds, parameter changes) rather than a second copy of the fixture example. <!-- AEH-04 -->
4. The `test-engineer` charter SHALL list variation/property-style test design (technique-level, library-neutral) among its responsibilities. <!-- AEH-04 -->
5. The `test-engineer` charter mission SHALL name the five error classes its strategy covers. <!-- AEH-09 -->
6. WHEN `tests-audit.md` dispatches the audit-specialist THEN the dispatch SHALL reference a `tests` lens, and the `audit-specialist` charter lens table SHALL contain a `tests` lens row covering coverage/regression/assertion quality. <!-- AEH-08 -->
7. WHEN `tests-audit.md` runs its sensors THEN it SHALL include a trend check that reads recorded metric snapshots and reports direction (improving, stable, degrading) when two or more snapshots exist. <!-- AEH-05 -->

**Independent Test**: Read the three edited surfaces; five error classes present and mapped; `tests` lens exists in charter and dispatch; variation and trend sensors present.

---

### P1: Reviewer in the loop ⭐ MVP

**User Story**: As a user relying on agent-written changes, I want every implementing workflow to run the reviewer agent between implementation and verification so that diff review is structural, not optional.

**Why P1**: The reviewer charter's own trigger ("after a builder completes a task and before the verification gate") is wired to nothing today.

**Acceptance Criteria**:

1. The workflows `feature`, `spec-driven` (Execute), `general`, `debug`, `refactor`, `bugs-fix`, `code-quality-fix`, `architecture-fix`, `security-fix`, `requirements-fix`, `tests-fix`, `implementation-fix`, `maestro-fix`, and `mobile-figma-fix` SHALL each contain a `massa-ai-reviewer` dispatch block (read-only, post-implementation, pre-verification) following the `agent-orchestration.md` dispatch format. <!-- AEH-06 -->
2. IF the `massa-ai-reviewer` subagent is unavailable THEN the workflow SHALL run a standalone fresh-eyes review against the same output contract and record the skipped-delegation reason. <!-- AEH-06 -->
3. The reviewer dispatch SHALL NOT replace or weaken any existing verification gate; it runs in addition to them. <!-- AEH-06 -->

**Independent Test**: Grep the 14 workflow files for the dispatch block; each has one; verification gates unchanged.

---

### P2: Advisory trust ramp

**User Story**: As a user deciding whether to read an agent PR's diff, I want per-category feedback streaks tracked so that I earn the right to stop reading a category on evidence instead of vibes.

**Why P2**: New capability with schema + script work; valuable but independent of the P1 guidance corrections.

**Acceptance Criteria**:

1. WHEN `lessons.ts review add --category <label> --feedback none|minor|major --source <ref>` is invoked THEN it SHALL append a review-feedback record to `.specs/lessons.json`. <!-- AEH-03 -->
2. WHEN `lessons.ts trust status` is invoked THEN it SHALL list each category with its current streak (consecutive `none`/`minor` records since the last `major`), total reviews, and trusted state. <!-- AEH-03 -->
3. WHEN a category's streak reaches `trust_threshold` (default 30) THEN `trust status` SHALL mark it `trusted`. <!-- AEH-03 -->
4. IF a `major` feedback record is added to a trusted category THEN the category SHALL demote to untrusted and its streak SHALL reset to 0. <!-- AEH-03 -->
5. IF `.specs/lessons.json` predates the new record kinds THEN `lessons.ts` SHALL load it without error and report empty trust state. <!-- AEH-03 -->
6. The `implementation-delivery.md` reference SHALL instruct reporting the change's category trust status as advisory context at the human-review stage, and SHALL leave the per-PR merge-approval clause unchanged. <!-- AEH-03 -->
7. The trust-ramp policy (categories, levels, threshold, advisory meaning) SHALL be documented in `references/lessons.md`. <!-- AEH-03 -->

**Independent Test**: Scripted: add 30 `none` records → trusted; add `major` → demoted, streak 0; old-store fixture loads clean.

---

### P2: Quality-metric trend recording

**User Story**: As a user steering a long-lived project, I want per-validation metric snapshots accumulated so that "is the harness improving or degrading" is answerable from data.

**Why P2**: Depends on the same lessons.ts extension; consumed by the P1 trend sensor.

**Acceptance Criteria**:

1. WHEN `lessons.ts metrics add --feature <slug> --result PASS|FAIL --fix-iterations <n> --surviving-mutants <n> --acs-total <n> --acs-covered <n>` is invoked THEN it SHALL append a metric snapshot to `.specs/lessons.json`. <!-- AEH-05 -->
2. WHEN `lessons.ts metrics trend` is invoked THEN it SHALL print the snapshots in order with a direction verdict (improving, stable, degrading) derived from result and surviving-mutant movement; IF fewer than 2 snapshots exist THEN it SHALL report `insufficient data` and exit 0. <!-- AEH-05 -->
3. WHEN spec-driven validation completes THEN `validate.md` SHALL instruct recording the snapshot via the `metrics add` command. <!-- AEH-05 -->

**Independent Test**: Scripted: two snapshots with fewer surviving mutants and PASS → `improving`; single snapshot → `insufficient data`.

---

### P2: Spec anchor for the feature workflow

**User Story**: As a user running the lighter `feature` workflow, I want acceptance criteria captured before implementation and verified after so that the one artifact the agent didn't derive itself exists on every feature, not only spec-driven ones.

**Why P2**: Closes the "spec-as-truth only in spec-driven" gap without forcing full spec-driven ceremony.

**Acceptance Criteria**:

1. WHEN the `feature` workflow starts implementation THEN it SHALL first capture 1–5 testable acceptance criteria in the conversation (or reference an existing spec artifact). <!-- AEH-07 -->
2. WHEN the `feature` workflow verifies THEN it SHALL check outcomes against those captured criteria, not only against a generic verification recipe. <!-- AEH-07 -->

**Independent Test**: Read `feature.md`; AC capture precedes implementation steps; verification step references the captured criteria.

---

## Edge Cases

- IF `.specs/lessons.json` is absent THEN `review add`/`metrics add` SHALL create the store (existing first-write behavior) and `trust status`/`metrics trend` SHALL report empty state, exit 0.
- WHEN a streak sits exactly at `trust_threshold` THEN the category SHALL be trusted (`>=`, boundary tested — off-by-one is a recorded defect class).
- IF `--feedback` or `--result` receives an unknown value THEN the script SHALL exit non-zero naming the accepted values.
- WHEN `trust status` runs against a store containing only legacy lesson records THEN it SHALL report zero categories, exit 0.
- IF a reviewer dispatch and its fallback are both impossible (no read access) THEN the workflow SHALL record the skipped review as a residual risk, never claim it ran.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| AEH-01 | P1: Code-shape guidance | Design | Pending |
| AEH-02 | P1: Code-shape guidance | Design | Pending |
| AEH-03 | P2: Trust ramp | Design | Pending |
| AEH-04 | P1: Test-gate model | Design | Pending |
| AEH-05 | P2: Metric trend | Design | Pending |
| AEH-06 | P1: Reviewer in loop | Design | Pending |
| AEH-07 | P2: Feature spec anchor | Design | Pending |
| AEH-08 | P1: Test-gate model | Design | Pending |
| AEH-09 | P1: Test-gate model | Design | Pending |
| AEH-10 | cross-cutting gates | Design | Pending |

**Coverage:** 10 total, 0 mapped to tasks, 10 unmapped ⚠️ (mapping happens in Tasks phase)

AEH-10: WHEN any skills source changes land THEN `bun run generate:artifacts --check` SHALL exit 0 after regeneration, `skill-artifact-parity` and `subagent-parity` suites SHALL pass, and lessons.ts changes SHALL carry discriminating tests whose failure was observed under deliberate mutation before being trusted.

## Implicit-Requirement Sweep (Large)

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | AEH-03/05 edge cases: unknown enum values exit non-zero; threshold boundary tested |
| Failure / partial-failure | Reviewer fallback (AEH-06 AC2); missing store → empty state; both-impossible → residual risk |
| Idempotency / retry / duplicates | `review add`/`metrics add` are append-only event logs; duplicates are legitimate repeated events — N/A because dedup would erase real review history |
| Auth boundaries & rate limits | N/A because lessons.ts is a local file-store CLI with no auth surface |
| Concurrency / ordering | N/A because lessons.ts is invoked serially by one agent per session (existing store assumption, unchanged) |
| Data lifecycle / expiry | Trust streaks reset on `major`; metric snapshots append-only, versioned by git — no expiry (matches lessons store) |
| Observability | `trust status` / `metrics trend` are the read views; validation reports cite them |
| External-dependency failure | N/A because no new external dependency is introduced |
| State-transition integrity | trusted → demoted on `major` (AEH-03 AC4); streak arithmetic tested at boundary |

## Verification Approach

- Prose surfaces: read-back per AC + grep sensors authored after the content lands (sensor-before-subject drift is a recorded defect class); parity + frontmatter gates.
- `lessons.ts`: unit tests beside existing lessons tests; mutation-verified (each new branch observed red under deliberate mutation before the suite is trusted); deterministic (no DB, no network).
- Final gate: fresh verification-agent, spec-anchored, evidence-or-zero, per workflow contract.
