---
name: massa-ai
description: Default memory-backed workflow router for every coding, planning-before-coding, debugging, code review, refactoring, or implementation conversation. Always load it once per new coding session, select specialized workflows first, and work under the Core Contract without a workflow file otherwise. Handles massa-ai recall/search, durable memory, context compaction, handoff, audits, specs, ADR/RFC/TDD, and evidence gates. Do NOT use for generic non-coding chat or bulk-loading every workflow/reference.
license: MIT
metadata:
  author: Luiz Massa
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

## Core Contract

- Every coding/planning task uses one stable `projectId` and
  `workflowSessionId`.
- Sub-agents are dispatched by bare charter name (`senior-engineer`,
  `code-reviewer`, ...). On the Claude plugin route, dispatch the
  plugin-namespaced `massa-ai:<name>` so a same-named agent cannot
  intercept the dispatch.
- Lazy charters (`designer`, `judge`, `test-engineer`) read
  `references/agent-modes/<agent>/<mode>.md` before dispatch and inline it as
  `mode_contract` (`judge` `plan-critique`: lite/full by `depth`); missing it
  on a lazy mode returns `Blocked`.
- Start with `recall` (prior decisions/patterns), budgeted: `limit <= 3`,
  `minImportance >= 0.7`, `types=["critical","decision","pattern"]`, unless
  the workflow needs a broader query. Never use it as an artifact loader --
  exact project/handoff/feature/validation state comes from `.specs/` files.
- Multi-search tasks use an ephemeral `synapseSessionId` per
  `references/synapse-policy.md` (only `search.sessionId`, never
  `workflowSessionId`) per `synapse_task_begin`/`synapse_task_end`.
- The full 59-tool surface is contracted in `references/mcp-tools.md`. Graph tools (`trace_path`, `impact_analysis`, `get_architecture`) count as evidence only when fresh for the current repository path and commit/worktree state.
- Persist only durable, useful knowledge; do not fabricate memories. Use
  `memory_update`/`memory_delete` to correct/remove.
- Expand abbreviations on first use; one vocabulary for batches: **Task**,
  **Phase** (`1 Phase = X Tasks`, never batch/wave/stage/chunk). Emit concise
  status updates at workflow boundaries when Conversation Feedback is active.
- Verify, don't assume: claims driving a decision are verified against
  current codebase/command evidence or the user; docs are leads, not truth.
  Genuine doubt goes to the user, not a silent choice.
- Before implementation edits, load `references/coding-guidelines.md` if
  not already loaded. Complete Evidence Gate before claiming done.

Use internal references only when needed:

| Need | Reference |
|---|---|
| MCP/REST schemas, polling | `references/mcp-tools.md` |
| Synapse lifecycle/fallback | `references/synapse-policy.md` |
| Install/config/deployment | `references/installation.md` |
| Importance scoring | `references/decision-engine.md` |
| Memory tiers/conflicts | `references/memory-policy.md` |
| Lesson loading/capture | `references/lessons.md` |
| Naming standards | `references/naming-standards.md` |
| Status updates | `references/conversation-feedback.md` |
| Completion evidence | `references/evidence-gate.md` |

## Session And Project

If no `workflowSessionId` is explicit: classify the workflow, infer the main
entity, generate a stable id `<workflow>-<entity>` (e.g.
`debug-login-crash`), and reuse it for the whole conversation.

Resolve `projectId`:

1. Call `recall` with query `"projectId for this workspace"` (default budget
   above).
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
| `create-adr` | record a finalized decision | `workflows/create-adr.md` |
| `create-rfc` | propose a significant change | `workflows/create-rfc.md` |
| `create-tdd` | technical design / implementation plan | `workflows/create-tdd.md` |
| `create-ticket` | draft and create Jira Epics, issues, and sub-tasks through Atlassian MCP | `workflows/create-ticket.md` |
| `commit` | draft or create safe Conventional Commits with Jira branch prefixes and audit report exclusions | `workflows/commit.md` |
| `the-fool` | direct challenge, red-team, pre-mortem, evidence audit | `workflows/the-fool.md` |
| `judge-with-debate` | standalone multi-judge debate evaluation of user-supplied artifacts | `workflows/judge-with-debate.md` |
| `pr-review` | review a hosted GitHub PR / GitLab MR and post findings via `gh`/`glab` | `workflows/pr-review.md` |
| `product-discovery` | product brainstorming / problem-space thinking partner | `workflows/product-discovery.md` |
| `create-prd` | turn the current conversation into a PRD without a new interview | `workflows/create-prd.md` |
| `skill-architect` | design and build a new skill through structured conversation | `workflows/skill-architect.md` |
| `furps-refinement` | FURPS+ refinement of a PRD and/or ADR before implementation, with The Fool pre-validation and DoR coverage | `workflows/refinement/furps-refinement.md` |

Explicitly requested workflows win. Otherwise choose the most specific matching
workflow. Use `exploration` only for explicitly read-only understanding or flow
mapping; when no route's precedence key above matches, load no workflow file. Ask
the user only when two or more routes match the same precedence tier; a single
match or no match is resolved deterministically without asking.

Deterministic routing precedence, first match wins:

1. **Explicit route:** user names a massa-ai workflow, report family, saved finding type, or asks for a direct challenge.
2. **Requested artifact:** ADR, RFC, TDD, Jira ticket, commit, session guide, audit report, implementation audit report, mobile Figma report, FURPS refinement report, PRD synthesized from the current conversation -> `create-prd` (explicit request only; refining an existing PRD stays `furps-refinement`), or new SKILL.md / skill design -> `skill-architect`.
3. **Target type:** broken behavior/error -> `debug`; hosted PR/MR reference (number or URL) to review with posted findings -> `pr-review` (local working diff stays with audit routes); saved audit finding -> matching `*-fix`; implementation scope review -> `implementation-audit`; security/privacy/auth finding -> security workflow; tests/flakes/coverage finding -> tests workflow; supplied Figma/screenshot mobile UI design -> `design`; mobile Figma compare/audit -> `mobile-figma-audit`; saved `MFM-*` findings -> `mobile-figma-fix`.
4. **Primary verb:** create/add/implement -> `feature`; restructure without behavior change -> `refactor`; inspect/understand only -> `exploration`; brainstorm/explore a product problem, idea, or direction with no concrete code target -> `product-discovery`; record selected decision -> `create-adr`; compare open options -> `create-rfc`; design settled implementation -> `create-tdd`; refine/quality-check an existing PRD or ADR document (not implementation auditing) -> `furps-refinement`.
5. **Risk domain escalation:** migrations, irreversible operations, auth/privacy, cross-service contracts, public compatibility, or work over 10 files routes to `spec-driven` unless the user explicitly requests a narrower workflow and accepts the containment.
6. **No match:** proceed without loading a workflow file. The main agent works under the Core Contract above (recall, verify, Evidence Gate) and states in one line which specialized workflow it considered and why none applies.

Mobile is a context modifier, not a workflow. Route by primary intent first.
Load `references/mobile-context.md` for non-debug mobile work, or
`references/mobile-diagnosis.md` for mobile crashes/regressions, only when the
selected workflow asks for it.

## Plan Challenge Gate

Apply the installed Plan Challenge Policy from `skills/AGENTS.md` (canonical
source); prompt-level instructions override it for the current turn.

- **Lite** (default, low-risk `feature`/`refactor`): dispatch `judge` in `plan-critique` mode
  (`judge/plan-critique-lite.md`) with a bounded checklist packet (failing
  assumption, falsifying check, risk/size check, `escalate_to_full:
  true|false` + reason); skip The Fool references unless it escalates.
- **Full** (`spec-driven`, `design`, `create-adr`/`rfc`/`tdd`, explicit
  challenge, high-risk domain, >5 files/modules, or lite escalation): load
  `workflows/the-fool.md`, select the mode, dispatch `judge` in `plan-critique`
  mode (`judge/plan-critique-full.md`) with `fool_mode` in the packet.
- If `judge` is unavailable, run a local fresh-eyes critique and report the
  skipped reason; never retry under a different agent name.

## Retrieval And Synapse

Follow the shared order in `references/codebase-investigation.md` (schemas in
`references/mcp-tools.md`). Index output is a lead until confirmed against
current source; source and approved `.specs/` artifacts stay authoritative.
Load `references/synapse-policy.md` before 2+ related `search` calls.

## Persistence

Required tags and memory types are in `references/memory-policy.md`; load it
before writing memory.

## Graceful Degradation

On any tool/index/MCP failure (server unavailable, index incomplete, Synapse
unavailable), load and follow `references/graceful-degradation.md` instead
of blocking.

## Completion

Before claiming done, load `references/evidence-gate.md` if not already
loaded; report deterministic evidence, changed artifacts, memory outcome,
residual risk.
