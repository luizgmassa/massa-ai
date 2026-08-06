---
name: massa-ai
description: Default memory-backed workflow router for every coding, planning-before-coding, debugging, code review, refactoring, or implementation conversation. Always load it once per new coding session, select specialized workflows first, and use the general fallback otherwise. Handles massa-ai recall/search, durable memory, context compaction, handoff, audits, specs, ADR/RFC/TDD, and evidence gates. Do NOT use for generic non-coding chat or bulk-loading every workflow/reference.
license: MIT
metadata:
  author: S1LV4, luizgmassa
  version: "1.0.0"
---

# massa-ai Router

Public router for massa-ai workflows. Keep this file small in context; load
workflow/reference details only when the selected request requires them.

This file is the canonical runtime contract for project/session handling,
workflow routing, retrieval, persistence, graceful degradation, and completion.
Startup activation, user-editable policies, and global ignore paths are owned by
the installed `AGENTS.md` bootstrap block (the `<!-- massa-ai:bootstrap -->`
section of `<host>/AGENTS.md`, for example `~/.claude/AGENTS.md`). Its single
source is `skills/AGENTS.md` in the product repo; `scripts/install-skills.sh`
copies that block out. Edit the policies there, never in a host copy.

## Dedupe Guard

Before reading any massa-ai file:

- In a new coding conversation, load this router once before using dedupe.
- After that initial load, reuse already-loaded `massa-ai`, workflow,
  reference, or The Fool context.
- Do not re-read a file only because another instruction names it.
- Load only the missing minimum context needed to act.
- Never load all workflows or references "just in case."

## Core Contract

- Every coding/planning task uses one stable `projectId` and
  `workflowSessionId`.
- Start with `recall` for relevant prior decisions/patterns.
- Default startup/context recall is budgeted: use `limit <= 3`,
  `minImportance >= 0.7`, and `types=["critical","decision","pattern"]`
  unless the selected workflow explicitly needs a broader memory query.
- Never use `recall` as an artifact loader. Exact project, handoff,
  feature, and validation state must come from .specs/ files.
- For multi-search tasks, use a separate ephemeral `synapseSessionId` according
  to `references/synapse-policy.md`; pass it only to `search.sessionId`.
  Never pass `workflowSessionId` in that field. Use `synapse_task_begin`/`synapse_task_end`
  for task envelopes and `synapse_prefetch` to warm the buffer on file open.
- Prefer the shared v2 retrieval order; fall back gracefully if the massa-ai
  server or Synapse is unavailable. The full tool surface includes 54 tools
  (see `references/mcp-tools.md`): indexing, search, symbol graph
  (`trace_path`, `impact_analysis`, `get_architecture`), memory CRUD
  (`remember`, `recall`, `memory_update`, `memory_delete`), checkpoints
  (`create_checkpoint`/`list_checkpoints`/`restore_checkpoint`), handoffs
  (`handoff_begin`/`accept`/`cancel`/`list_pending`), `bootstrap`,
  `compact_snapshot`, code execution (`execute`/`execute_file`/`batch_execute`),
  `fetch_and_index`, full Synapse lifecycle, `read_file`, `symbol_snippet`,
  and `analytics`. Graph tools (`trace_path`, `impact_analysis`,
  `get_architecture`) only count as evidence when the index is fresh for the
  current repository path and commit/worktree state.
- Persist only durable, useful knowledge. Do not fabricate memories to satisfy
  process. Use `memory_update` to correct stale memories and `memory_delete`
  to remove obsolete ones.
- Expand every word abbreviation on first use in user-facing output — e.g.
  "PR (Pull Request)", "AC (Acceptance Criteria)", "KMP (Kotlin Multiplatform)"
  — including workflow-specific shorthands and finding-ID families.
- Use one uniform vocabulary for separating batches of work in every workflow:
  a **Task** is the atomic unit; a **Phase** is an ordered group of Tasks.
  Report a phase's size as `1 Phase = X Tasks` and a plan's total as
  `Y Phases = Z Tasks`. Do not substitute synonyms such as batch, wave, stage,
  or chunk for these units in agent prose.
- Emit concise user-facing status updates at meaningful workflow boundaries
  when the Conversation Feedback Policy is active.
- Verify, don't assume: every factual claim that drives a decision is
  verified against current codebase/command evidence or confirmed with the
  user. Documentation of any kind — README, docs/, inline comments, external
  summaries, even `.specs/` prose — is a lead to verify against current
  source, never a trustable source of truth by itself. Unverifiable claims
  become explicit assumptions the user confirms or accepts.
- Ask when in doubt: when genuine doubt remains after looking it up —
  requirement meaning, scope boundaries, destructive/irreversible choices,
  contradictory evidence — ask the user rather than choose silently. Facts
  are looked up; decisions are asked.
- Before writing or changing implementation code, load
  `references/coding-guidelines.md` if not already loaded.
- Complete Evidence Gate before claiming done.

Use internal references only when needed:

| Need | Reference |
|---|---|
| MCP/REST schemas, response modes, polling | `references/mcp-tools.md` |
| Multi-search Synapse lifecycle and fallback | `references/synapse-policy.md` |
| Install/config/deployment | `references/installation.md` |
| Importance scoring, tradeoffs, debugging | `references/decision-engine.md` |
| Memory tiers/conflict handling | `references/memory-policy.md` |
| Shared lesson loading/capture lifecycle | `references/lessons.md` |
| Meaningful code and contract identifier names | `references/naming-standards.md` |
| Chat-visible workflow status updates | `references/conversation-feedback.md` |
| Completion evidence | `references/evidence-gate.md` |

## Session And Project

If no `workflowSessionId` is explicit:

1. Classify the workflow.
2. Infer the main entity.
3. Generate a stable id: `<workflow>-<entity>`.
4. Reuse it for the whole conversation.

Examples:

- `debug-login-crash`
- `feature-user-onboarding`
- `refactor-auth-module`
- `spec-billing-workflow`
- `adr-postgres-migration`

Resolve `projectId`:

1. Call `recall` with query `"projectId for this workspace"`,
   `limit <= 3`, `minImportance >= 0.7`, and
   `types=["critical","decision","pattern"]`.
2. If found, reuse exactly.
3. If absent, derive from workspace root.
4. If ambiguous, ask the user.
5. Store durable projectId memory only when it is new or corrected.

## Workflow Router

Classify by meaning, not keywords. Load exactly one selected workflow unless the
current context already contains it.

| Workflow | Use for | File |
|---|---|---|
| `onboarding` | first session / missing `projectId` | `workflows/onboarding.md` |
| `feature` | new capability | `workflows/feature.md` |
| `debug` | broken behavior, errors, crashes | `workflows/debug.md` |
| `code-quality-audit` | findings-only SOLID/Clean Code/KISS/YAGNI/DRY/maintainability audit | `workflows/code-quality/code-quality-audit.md` |
| `code-quality-fix` | fix code-quality audit report findings | `workflows/code-quality/code-quality-fix.md` |
| `architecture-audit` | DDD, boundaries, coupling, module depth, seams | `workflows/architecture/architecture-audit.md` |
| `architecture-fix` | fix architecture audit report findings | `workflows/architecture/architecture-fix.md` |
| `security-audit` | security/privacy/auth/validation/secret handling findings | `workflows/security/security-audit.md` |
| `security-fix` | fix security audit report findings | `workflows/security/security-fix.md` |
| `requirements-audit` | requirements/spec/acceptance/scope alignment findings | `workflows/requirements/requirements-audit.md` |
| `requirements-fix` | fix requirements audit report findings | `workflows/requirements/requirements-fix.md` |
| `maestro` | implement new Maestro mobile E2E flows | `workflows/maestro/maestro.md` |
| `maestro-audit` | run and audit existing Maestro mobile E2E flows | `workflows/maestro/maestro-audit.md` |
| `maestro-fix` | child-only fix for saved Maestro audit findings | `workflows/maestro/maestro-fix.md` |
| `tests-audit` | test coverage/regression/assertion/flakiness findings | `workflows/tests/tests-audit.md` |
| `tests-fix` | fix tests audit report findings | `workflows/tests/tests-fix.md` |
| `bugs-audit` | findings-only bug discovery | `workflows/bugs/bugs-audit.md` |
| `bugs-fix` | fix bugs audit report findings | `workflows/bugs/bugs-fix.md` |
| `long-session` | context compaction / continuation package | `workflows/long-session.md` |
| `exploration` | understand codebase/flow | `workflows/exploration.md` |
| `spec-driven` | TLC v3 Specify, optional Design, optional Tasks, and Execute with mandatory independent validation | `workflows/spec-driven.md` |
| `implementation-audit` | multi-lens audit of a concrete implementation target | `workflows/implementation/implementation-audit.md` |
| `implementation-fix` | fix saved implementation audit report findings | `workflows/implementation/implementation-fix.md` |
| `design` | implement supported mobile UI from Figma evidence or screenshot context | `workflows/design.md` |
| `mobile-figma-audit` | compare an Android, iOS, or KMP UI implementation with a Figma design | `workflows/mobile-figma/mobile-figma-audit.md` |
| `mobile-figma-fix` | fix saved mobile Figma findings | `workflows/mobile-figma/mobile-figma-fix.md` |
| `refactor` | behavior-preserving structural cleanup | `workflows/refactor.md` |
| `adr` | record a finalized decision | `workflows/adr.md` |
| `rfc` | propose a significant change | `workflows/rfc.md` |
| `tdd` | technical design / implementation plan | `workflows/tdd.md` |
| `ticket` | draft and create Jira Epics, issues, and sub-tasks through Atlassian MCP | `workflows/ticket.md` |
| `commit` | draft or create safe Conventional Commits with Jira branch prefixes and audit report exclusions | `workflows/commit.md` |
| `the-fool` | direct challenge, red-team, pre-mortem, evidence audit | `workflows/the-fool.md` |
| `judge-with-debate` | standalone multi-judge debate evaluation of user-supplied artifacts | `workflows/judge-with-debate.md` |
| `pr-review` | review a hosted GitHub PR / GitLab MR and post findings via `gh`/`glab` | `workflows/pr-review.md` |
| `discovery` | product brainstorming / problem-space thinking partner | `workflows/discovery.md` |
| `to-prd` | turn the current conversation into a PRD without a new interview | `workflows/to-prd.md` |
| `skill-architect` | design and build a new skill through structured conversation | `workflows/skill-architect.md` |
| `furps-refinement` | FURPS+ refinement of a PRD and/or ADR before implementation, with The Fool pre-validation and DoR coverage | `workflows/refinement/furps-refinement.md` |
| `general` | coding work with no more specific workflow | `workflows/general.md` |

Explicitly requested workflows win. Otherwise choose the most specific matching
workflow. Use `exploration` only for explicitly read-only understanding or flow
mapping; route to `general` when no route's precedence key above matches. Ask
the user only when two or more routes match the same precedence tier; a single
match or no match is resolved deterministically without asking.

Deterministic routing precedence, first match wins:

1. **Explicit route:** user names a massa-ai workflow, report family, saved finding type, or asks for a direct challenge.
2. **Requested artifact:** ADR, RFC, TDD, Jira ticket, commit, session guide, audit report, implementation audit report, mobile Figma report, FURPS refinement report, PRD synthesized from the current conversation -> `to-prd` (explicit request only; refining an existing PRD stays `furps-refinement`), or new SKILL.md / skill design -> `skill-architect`.
3. **Target type:** broken behavior/error -> `debug`; hosted PR/MR reference (number or URL) to review with posted findings -> `pr-review` (local working diff stays with audit routes); saved audit finding -> matching `*-fix`; implementation scope review -> `implementation-audit`; Maestro E2E/device automation target -> `maestro`, `maestro-audit`, or child-only `maestro-fix` before generic tests workflows; security/privacy/auth finding -> security workflow; tests/flakes/coverage finding -> tests workflow; supplied Figma/screenshot mobile UI design -> `design`; mobile Figma compare/audit -> `mobile-figma-audit`; saved `MFM-*` findings -> `mobile-figma-fix`.
4. **Primary verb:** create/add/implement -> `feature` unless the concrete target is new Maestro flow work, which routes to `maestro`; restructure without behavior change -> `refactor`; inspect/understand only -> `exploration`; brainstorm/explore a product problem, idea, or direction with no concrete code target -> `discovery`; record selected decision -> `adr`; compare open options -> `rfc`; design settled implementation -> `tdd`; refine/quality-check an existing PRD or ADR document (not implementation auditing) -> `furps-refinement`.
5. **Risk domain escalation:** migrations, irreversible operations, auth/privacy, cross-service contracts, public compatibility, or work over 10 files routes to `spec-driven` unless the user explicitly requests a narrower workflow and accepts the containment.
6. **General fallback:** use `general` only after a one-line General fallback preflight names the specialized workflow considered, rejected reason, and why fallback does not change verification or mutation behavior.

Mobile is a context modifier, not a workflow. Route by primary intent first.
Load `references/mobile-context.md` for non-debug mobile work, or
`references/mobile-diagnosis.md` for mobile crashes/regressions, only when the
selected workflow asks for it.

## Plan Challenge Gate

Read and apply the canonical Plan Challenge Policy from the installed
`AGENTS.md` bootstrap block (single source: `skills/AGENTS.md`). Prompt-level
user instructions override that policy for the current turn.

For a low-risk plan that receives the lite gate, attempt a read-only
`massa-ai-plan-critic` subagent with a bounded checklist packet instead of
running the checklist in the main agent. The packet includes the proposed plan, scope,
constraints, compact recalled facts/evidence, known risks, verification recipe,
parent identifiers, and this output requirement:

- What assumption would most likely make this fail?
- What deterministic check would falsify success?
- Does it touch a high-risk domain or more than 5 files/classes/modules?
- `escalate_to_full: true|false` plus reason.

Lite preserves progressive disclosure: do not load The Fool mode references
unless the lite critique escalates to full.

Low-risk `feature` and `refactor` plans receive the lite gate first. Full The
Fool stays for `spec-driven`, `design`, `adr`, `rfc`, `tdd`, explicit challenge
requests, high-risk domains, or plans touching more than 5 files/classes/modules.
When the policy selects the full gate, or lite escalates, load
`workflows/the-fool.md`, select the mode in the main agent, load only the
selected The Fool references, and attempt a read-only `massa-ai-plan-critic`
subagent with selected mode context and a bounded critique packet. Subagents inherit
`projectId`, parent `workflowSessionId`, workflow name, entity, and compact
evidence; they do not receive full conversation context.

If the policy file is unavailable, use the conservative fallback: run the full
gate for high-risk domains, broad multi-module plans, explicit challenge
requests, and planning workflows that commit to a feature, refactor, ADR, RFC,
or TDD. If the `massa-ai-plan-critic` agent is unavailable for any reason —
spawning forbidden, plugin not installed, unknown `subagent_type` — run a strict
standalone fresh-eyes local critique against the same output contract and report
the skipped delegation reason. Do not retry under a different agent name. Reuse
The Fool context when it is already loaded.

## Retrieval And Synapse

Use this default retrieval sequence when it matches the task:

1. `list_projects` or equivalent freshness evidence before relying on indexed project state.
2. `project_map` for general architecture orientation (PageRank backbone, symbol counts) when the index is fresh for the current repository path and worktree state.
3. `get_architecture` for architecture-specific deep maps (packages, routes, hotspots, communities, cycles) when the index is fresh.
4. `search(responseMode="summary", maxResults=10)` for broad discovery.
5. `search(responseMode="enriched", maxResults=3)` for targeted deep reads; use `maxResults=5` only when the user named 4-5 concrete files, symbols, or findings.
6. Symbol navigation (`search_definitions`, `get_references`, `go_to_definition`) and `read_file` for exact definitions, usages, and line ranges.
7. `symbol_snippet` for raw code snippets by file + line range.
8. `trace_path` for typed-edge BFS call/data-flow path tracing (fresh index only).
9. `impact_analysis` for git-diff centrality-ranked impact (fresh index only).
10. `optimized_context` for compact synthesized context when available.
11. Focused shell/file fallback when the massa-ai server is unavailable, stale, incomplete, or misses obvious local truth.

`project_map`, `get_architecture`, `search`, and `optimized_context` are leads
until their results are confirmed against current source files read in this session or returned with current freshness evidence. Current repository source
and approved `.specs/` artifacts remain authoritative. Graph tools (`trace_path`,
`impact_analysis`, `get_architecture`) only count as evidence when the index is
fresh for the current repository path and commit/worktree state; fall back to
`search`/`get_references` and record reduced retrieval confidence when stale.

Load `references/synapse-policy.md` when the planned investigation includes
two or more related `search` calls. MCP is primary; authenticated REST may
fill missing or broken Synapse lifecycle operations once after a documented MCP
schema or adapter failure. Keep REST-only fields out of MCP calls.

## Persistence

Before writing memory, load `references/decision-engine.md` if scoring details
are not already in context. Use supported massa-ai types only: `critical`,
`conversation`, `code`, `decision`, `pattern`.

Required memory tags:

- `project:<projectId>`
- `session:<workflowSessionId>`
- `workflow:<type>`
- `entity:<name>`
- one of `memory:working`, `memory:episodic`, `memory:semantic`,
  `memory:procedural`

## Shared References

Load only when a selected workflow asks for them:

- `references/agent-orchestration.md`
- `references/subagent-design.md`
- `references/adr-authoring.md`
- `references/audit-scope.md`
- `references/audit-report-io.md`
- `references/hook-enforcement.md`
- `references/codebase-investigation.md`
- `references/debug-diagnosis-loop.md`
- `references/mobile-context.md`
- `references/mobile-diagnosis.md`
- `references/figma-pre-analysis.md`
- `references/mobile-figma-matcher/`
- `references/lessons.md`
- `references/naming-standards.md`
- `references/pr-task-fix.md`
- `references/architecture-lenses.md`
- `references/architecture-domain-lens.md`
- `references/architecture-coupling-lens.md`
- `references/architecture-deepening-lens.md`
- `references/the-fool/`
- `references/verification-ladder.md`
- `references/context-firewall.md`
- `references/project-context.md`
- `references/implementation-delivery.md`
- `references/code-annotation.md`
- `references/repo-rules-discovery.md`
- `references/root-cause-scripts.md`
- `references/conversation-feedback.md`
- `references/maestro.md`
- `references/maestro/`
- `references/synapse-policy.md`
- `references/tdd/`
- `references/rfc/`
- `references/ticket/`
- `references/spec-driven/`
- `references/furps/`

## Graceful Degradation

On any tool/index/MCP failure (server unavailable, index incomplete, Synapse unavailable, `create_checkpoint`/`handoff_begin`/`bootstrap`/`compact_snapshot`/`execute`/`fetch_and_index` unavailable), load and follow `references/graceful-degradation.md` instead of blocking.

## Completion

Before claiming done, load `references/evidence-gate.md` if not already loaded
and report deterministic evidence, changed artifacts, memory outcome, and
residual risk.
