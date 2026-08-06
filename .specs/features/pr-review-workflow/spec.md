# PR Review Workflow Specification

Feature: **pr-review-workflow** — slug `pr-review-workflow`, route name `pr-review`.

## Problem Statement

massa-ai has audit workflows for local diffs but no workflow that reviews a **hosted**
Pull Request (PR) / Merge Request (MR) and posts findings back to the host. The TLC
`pr-review` skill (CC-BY-4.0, github.com/augusto-dmh) proves the six-dimension
orchestrated-review protocol but is GitHub-only, uses generic subagents, and knows
nothing of massa-ai's roster, memory, retrieval, or `.specs/` requirements store. We
adapt it into a first-class massa-ai workflow supporting GitHub (`gh`) and GitLab
(`glab`).

## Goals

- [ ] One new routed workflow `pr-review` that reviews a hosted PR/MR across six
      dimensions and posts inline comments plus one consolidated summary.
- [ ] Both GitHub and GitLab supported through one host command map; GitLab commands
      verified against official documentation before implementation.
- [ ] Review dimensions executed by the existing massa-ai specialist roster
      (audit-specialist lenses, test-engineer, reviewer) under the canonical
      dispatch/packet contract — no new agents.
- [ ] All harness gates green (count locks, frontmatter, integrity, parity, size,
      duplication) with bundles regenerated.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Creating PRs/MRs, responding to review comments, fixing CI | Source skill scopes these to sibling skills; different intent |
| Bitbucket or other hosts | User asked for GitHub + GitLab only |
| Auto-trigger during coding | Explicit-route only, mirroring the source skill's `disable-model-invocation` |
| New MCP tools / TypeScript code in `packages/` or `apps/` src | Workflow is harness prose + gate-count edits only |
| Subagents executing host CLI commands | Roster review agents are charter read-only; orchestrator owns all posting |
| Approving / requesting changes on the PR/MR | Comment-only is a hard safety invariant |
| `references/pr-task-fix.md` changes | Existing reference serves PR *fix* tasks, not hosted review |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| License of the new workflow file | `CC-BY-4.0` with attribution line to github.com/augusto-dmh | Content adapts a CC-BY-4.0 skill; WMH gate allowlists CC-BY-4.0 for imported content (skill-architect precedent) | y (repo precedent) |
| Workflow classification | Read-only (NOT in IMPLEMENTATION_WORKFLOWS) | It never mutates repository files; posting comments is not a repo mutation; complement lock moves 22→23 | y (gate semantics) |
| Consolidation performed by orchestrator from reply blocks, not a 7th subagent | Orchestrator assembles and posts | Matches judge-with-debate channel discipline and the 40-line reply contract; subagents are read-only and host-agnostic | y (repo convention) |
| Test-coverage dimension agent | `massa-ai-audit-specialist`, `lens: performance` with a coverage scope packet | Repo precedent: `tests-audit.md` dispatches exactly this ("test coverage is under the performance lens"); `massa-ai-test-engineer` rejected — its charter is write-permitted test authoring, off-label for a findings-only review | y (repo precedent) |
| Regression/hallucination dimension agent | `massa-ai-reviewer` | Charter is verbatim this dimension: read-only diff review detecting bugs, regressions, code smells, missing edge cases | y (charter evidence) |
| Six dispatches vs wave cap | Two waves (4 + 2) | agent-orchestration.md wave cap is 4 concurrent | y (reference evidence) |
| Command surface location | Inline in `workflows/pr-review.md` (no new reference file) | Single-file protocol mirrors source skill; workflows dir has no per-file byte budget; avoids a second load hop | y (gate evidence) |
| Route precedence position | Target-type tier (tier 3): hosted PR/MR reference → `pr-review`; local working diff stays with existing audit/review routes | Distinguishes hosted review from `implementation-audit`/`*-audit` | y (router semantics) |
| Delivery endpoint this session | Commits on `spec/pr-review-workflow`; push/PR left to the user | Outward-facing actions need explicit go-ahead; user absent this turn | y (session policy) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Review a hosted PR/MR end to end ⭐ MVP

**User Story**: As a developer, I want massa-ai to review my GitHub PR or GitLab MR
across security, requirements, tests, architecture, regression, and performance, and
post the findings to the PR/MR, so that review quality is uniform and I keep working.

**Why P1**: This is the feature.

**Acceptance Criteria** (each line is one EARS pattern):

1. PRW-01a — The repository SHALL contain `skills/massa-ai/workflows/pr-review.md` whose YAML frontmatter parses (real YAML) with `name: pr-review`, a single-line description of 20–1024 characters, `license: CC-BY-4.0`, and `metadata.version: "1.0.0"`.  <!-- ubiquitous -->
2. PRW-01b — The workflow file SHALL contain the intake line loading `references/project-context.md` and SHALL NOT contain the delivery-reference path string that marks implementation workflows.  <!-- ubiquitous -->
3. PRW-01c — The workflow body SHALL carry an attribution line naming the upstream TLC `pr-review` skill and author github.com/augusto-dmh under CC-BY-4.0.  <!-- ubiquitous -->
4. PRW-02a — WHEN a user asks to review a hosted PR/MR by number or URL THEN the router SHALL resolve to `pr-review` via a workflow-table row pointing at `workflows/pr-review.md` plus a target-type precedence clause.  <!-- event-driven -->
5. PRW-02b — The router `skills/massa-ai/SKILL.md` SHALL remain ≤ 21,000 bytes after the edit.  <!-- ubiquitous -->
6. PRW-03a — WHEN the workflow starts THEN it SHALL resolve the host as `github` or `gitlab` in this order: explicit user statement > host CLI probe (`gh repo view` / `glab repo view`) > git remote URL host, and SHALL record the resolved host and repository identity before any subagent dispatch.  <!-- event-driven -->
7. PRW-03b — IF no host CLI resolves the current repository (both probes fail) THEN the workflow SHALL stop and report which CLI/authentication is missing instead of guessing a host.  <!-- unwanted-behavior -->
8. PRW-04a — The workflow SHALL define one host command map covering, for both hosts: repository identity, PR/MR metadata (title, body/description, source branch, head SHA / `diff_refs`), full diff, changed-file list, existing inline comment/discussion inventory (id, path, line), inline comment anchored to an added line, threaded reply to an existing comment/discussion, and PR/MR-level summary post.  <!-- ubiquitous -->
9. PRW-04b — Every GitLab command or Application Programming Interface (API) endpoint in the map SHALL be verified against official GitLab CLI/API documentation during Design, with source citations recorded in `design.md`.  <!-- ubiquitous -->
10. PRW-04c — The workflow SHALL require every multiline comment or summary body to be written to a temp file and posted via the host's file-body mechanism (`--body-file`, `-F body=@file`, or `--input`), never inlined on the command line.  <!-- ubiquitous -->
11. PRW-05a — The workflow SHALL run exactly six review dimensions — security, requirements/Definition of Done (DoD), test coverage, architecture/conventions, regression/hallucination, performance — mapped to: `massa-ai-audit-specialist` with lenses security, requirements, architecture, performance, and a fifth performance-lens dispatch scoped to test coverage (the `tests-audit.md` precedent), plus `massa-ai-reviewer` for regression/hallucination.  <!-- ubiquitous -->
12. PRW-05b — Every subagent dispatch in the workflow SHALL be a canonical capability-packet blockquote (`> **Dispatch: \`massa-ai-<agent>\`**` with role, charter path, trigger, scope, permissions, inputs, sensors, output, firewall, memory, and the persona clause) so the harness-integrity dispatch gates parse and resolve it.  <!-- ubiquitous -->
13. PRW-05c — WHILE dispatching review subagents the workflow SHALL respect the wave cap of 4 concurrent subagents (six dimensions run as two waves).  <!-- state-driven -->
14. PRW-05d — Review subagents SHALL be host-agnostic: each receives the diff, PR/MR intent, discovery profile, and existing-comment inventory inside its packet, returns findings as a structured reply block, and never executes host CLI commands; only the orchestrator posts.  <!-- ubiquitous -->
15. PRW-08a — WHEN all six dimensions have returned THEN the orchestrator SHALL post exactly one consolidated summary (severity-grouped findings, one highlight per dimension, a files-with-no-findings gap section, and a metadata table naming host, runner, requirements sources, and loaded convention docs) via the host summary command.  <!-- event-driven -->
16. PRW-08b — IF no findings survive across all dimensions THEN the summary SHALL state that explicitly and still include the metadata table.  <!-- unwanted-behavior -->

**Independent Test**: Route "review PR 128" in a GitHub checkout and "review MR 12" in
a GitLab checkout; observe host resolution, two dispatch waves, inline posts on `+`
lines only, and one summary post.

---

### P2: Review protocol safety invariants

**User Story**: As a repo owner, I want the automated review to be non-destructive,
deduplicated, and evidence-gated so it never damages the PR/MR or spams it.

**Why P2**: Ported invariants; the feature is unusable without them but they are
independently testable from the happy path.

**Acceptance Criteria**:

1. PRW-06a — WHEN posting an inline comment THEN the workflow SHALL anchor it only to an added (`+`) diff line on the head revision (GitHub: `side=RIGHT` head-file line; GitLab: `position.new_line` with the MR `diff_refs` SHAs).  <!-- event-driven -->
2. PRW-06b — IF an existing comment lies within ±3 lines of the same path/line THEN the workflow SHALL skip posting a duplicate; and WHEN an existing comment's issue is fixed by the current diff THEN the workflow SHALL reply `[RESOLVED]` on that thread via the host reply mechanism.  <!-- complex -->
3. PRW-06c — IF a reviewer is not confident a finding is real THEN the workflow SHALL withhold it (the source skill's ≥80% gate, applied as a qualitative when-uncertain-stay-silent bar — Plan Challenge F3: a numeric self-reported threshold is unfalsifiable, no roster precedent gates on one).  <!-- unwanted-behavior -->
4. PRW-06d — WHILE the review runs the workflow SHALL stay comment-only: it SHALL name approve/request-changes/merge commands (`gh pr review --approve/--request-changes`, `glab mr approve`, merge commands) as forbidden and SHALL never modify repository files.  <!-- state-driven -->
5. PRW-06e — WHEN posting any inline body THEN the workflow SHALL start it with an invisible `<!-- pr-review:{type} -->` marker and SHALL include no AI/assistant/tool attribution.  <!-- event-driven -->
6. PRW-10a — IF the PR/MR reference is absent from the user request THEN the workflow SHALL ask for it rather than guessing.  <!-- unwanted-behavior -->
7. PRW-10b — IF the host CLI cannot resolve the referenced PR/MR THEN the workflow SHALL stop and surface the CLI error output.  <!-- unwanted-behavior -->

**Independent Test**: Dry-run against a PR with an existing inline comment: the
duplicate site is skipped, a fixed finding gets a `[RESOLVED]` reply, no approval
command appears anywhere in the transcript.

---

### P3: massa-ai platform integration

**User Story**: As a massa-ai user, I want the review to use the project's index,
memory, and `.specs/` store so findings reflect this project's real conventions and
requirements.

**Why P3**: Differentiator over the stack-agnostic source skill; the review still
works (degraded) without the massa-ai server.

**Acceptance Criteria**:

1. PRW-07a — WHEN the workflow starts THEN it SHALL resolve `projectId`/`workflowSessionId` (`pr-review-<number>`) and run a budgeted `recall` per the Core Contract.  <!-- event-driven -->
2. PRW-07b — The discovery step SHALL prefer massa-ai retrieval (`list_projects`, `project_map`, `get_architecture`, `search` under freshness rules, `impact_analysis` on the PR/MR diff when the index is fresh) before shell fallback, and SHALL read `.specs/` artifacts (`project/FEATURES.json`, feature `spec.md`/`tasks.md` acceptance criteria) as a requirements source alongside the issue tracker.  <!-- ubiquitous -->
3. PRW-07c — IF the massa-ai server, index freshness, or Synapse is unavailable THEN the workflow SHALL degrade per `references/graceful-degradation.md` and continue on CLI/file evidence, recording the skipped sensors.  <!-- unwanted-behavior -->

**Independent Test**: Run once with the MCP server up (recall + index-backed
discovery observed) and once with it down (review completes on CLI evidence, skip
recorded).

---

### Gate story (cross-cutting): harness gates stay green

1. PRW-09a — `EXPECTED_WORKFLOW_COUNT` SHALL equal 39 in both `scripts/__tests__/workflow-harness-contract.test.ts` and `scripts/__tests__/workflow-metadata-headers.test.ts`, and the read-only-complement assertion SHALL equal 23.  <!-- ubiquitous -->
2. PRW-09b — WHEN bundles are regenerated (`bun run generate:artifacts`) THEN `--check` SHALL exit 0 and the parity, harness-integrity, size-budget, and duplication-metric suites SHALL pass.  <!-- event-driven -->
3. PRW-09c — `CHANGELOG.md` SHALL gain an `### Added` entry under `[Unreleased]` describing the workflow (minor bump).  <!-- ubiquitous -->

---

## Edge Cases

- IF a posted body would be multiline THEN system SHALL use the file-body mechanism (broken-body posting is the source skill's #1 failure mode) — PRW-04c.
- IF the diff is very large THEN the orchestrator SHALL summarize per `references/context-firewall.md` before packing subagent packets (packets carry hunks relevant to the dimension, never unbounded raw diff).
- IF no convention docs / requirements source / test runner is discovered THEN the affected dimension SHALL fall back to its generic checklist and say so (profile rows marked `none`).
- IF the discussion/comment list is paginated (GitLab default `per_page=20`) THEN the inventory fetch SHALL page to completion before dedupe decisions.
- IF the MR originates from a fork THEN repository identity SHALL come from the host CLI's project resolution (GitLab `:id` placeholder / `gh` nameWithOwner), never from parsing the remote URL by hand.
- WHEN anchoring on GitHub THEN `line` SHALL be the 1-based head-file line on side RIGHT (a diff-relative offset 422s or lands wrong) — carried into the workflow verbatim from the source skill.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PRW-01 | P1 | Design | Pending |
| PRW-02 | P1 | Design | Pending |
| PRW-03 | P1 | Design | Pending |
| PRW-04 | P1 | Design | Pending |
| PRW-05 | P1 | Design | Pending |
| PRW-06 | P2 | Design | Pending |
| PRW-07 | P3 | Design | Pending |
| PRW-08 | P1 | Design | Pending |
| PRW-09 | Gate | Design | Pending |
| PRW-10 | P2 | Design | Pending |

**ID format:** `PRW-[NUMBER]` with lettered acceptance criteria.

**Coverage:** 10 requirements, mapped to tasks in `tasks.md` (pending).

---

## Implicit-Requirement Sweep (Large)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | PRW-10a/b (missing/invalid PR ref); PRW-04c (body mechanics) |
| Failure / partial-failure | PRW-03b, PRW-07c, PRW-10b; a failed dimension dispatch is reported in the summary as a skipped dimension, never silently dropped |
| Idempotency / retry / duplicates | PRW-06b (±3 dedupe, [RESOLVED] replies); re-running the review against the same head SHA re-applies dedupe |
| Auth boundaries & rate limits | Host CLI auth is the boundary (PRW-03b); no credentials are ever stored or invented — N/A beyond that because the workflow only uses pre-authenticated CLIs |
| Concurrency / ordering | PRW-05c wave cap; consolidation strictly after all dimensions return (PRW-08a) |
| Data lifecycle / expiry | N/A because the workflow persists nothing locally except optional durable memories under the persistence policy |
| Observability | Conversation Feedback status updates at workflow boundaries; skipped sensors recorded (PRW-07c) |
| External-dependency failure | PRW-03b (CLI absent), PRW-07c (massa-ai server down), PRW-10b (host API errors) |
| State-transition integrity | N/A because the workflow holds no persistent state machine; each run is stateless against the live PR/MR |

## Verification Approach

- Structural gates are deterministic: the two count locks, frontmatter parse, dispatch
  resolution/persona gates, parity `--check`, size budget, duplication ceiling — all
  runnable locally (`bun test scripts/__tests__/<suite>` + `bun run generate:artifacts --check`).
- Behavioral ACs (PRW-03/04/05/06/08/10) verify by reading the shipped workflow text
  against this spec (prose contract) — the massa-ai pattern for workflow features
  (precedent: workflow-policy-updates, judge-with-debate).
- Independent validation: fresh verification-agent (author ≠ verifier) per
  `references/spec-driven/validate.md`, with discrimination mutations against the gate
  edits (e.g., revert a count to 38 → suite must fail).

## Sizing

**Large** (public harness surface, cross-host external contract, >5 files touched:
workflow file, router, 2 test gates, CHANGELOG, bundles, `.specs/`). Design: required
(host command map verification, dispatch mapping). Tasks: required (>3 steps with a
research dependency).
