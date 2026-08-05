# Agent Orchestration

Use when a workflow benefits from isolated context, parallel work, or independent verification.

Load `references/context-firewall.md` first when the delegated work may involve verbose logs, snapshots, generated reports, external research, or broad source inspection.

Load `references/subagent-design.md` only when designing or revising reusable subagent roles, adding a new role to this file, or turning repeated delegated work into a stable role charter. Do not load it for ordinary one-off delegation.

## Principle

The main agent is the orchestrator. It owns:

- workflow routing
- memory recall and persistence
- user questions and trade-off synthesis
- conversation feedback status updates
- final Evidence Gate
- final user-facing report

Subagents do bounded work only. Do not delegate everything.

## Orchestrator Working Memory

Tokens are spent once; context shapes every decision that follows. The orchestrator's
working memory is the asset every rule below protects — delegation exists to keep
disposable reasoning out of the main thread, not just to parallelize.

- **Never poll a running subagent for status, and never ingest a subagent's raw
  transcript, JSONL, or intermediate reasoning — running or completed.** The
  orchestrator consumes only the subagent's returned output contract (its completion
  result). When lifecycle visibility helps the user, report the dispatch itself via
  conversation-feedback labels, not by fetching agent state.
- **Wave cap: dispatch at most 4 concurrent subagents.** Before planning 5 or more,
  run and record a consolidation check — can any two planned agents be merged? — then
  dispatch in waves of at most 4. Fixed protocols smaller than the cap (e.g. a
  3-judge panel) are unaffected.
- **Cognitive locality:** overlapping file/module ownership or a shared knowledge
  domain between planned subagents — read-only agents included — is a consolidation signal:
  consolidate into one agent before spawning. Two agents independently reconstructing
  the same mental model is waste; one agent holding it once is the cheaper and more
  coherent shape.
- **Git safety for concurrent work:** no repository-wide git operations (`git stash`,
  `git checkout`/`git switch` of shared state, `git reset`, `git clean`) inside any
  concurrently-dispatched subagent's scope. Concurrent writers require disjoint git
  worktrees. The Verifier's scratch-worktree discrimination sensor keeps its own
  stricter isolation rules.

## Delegation Gates

Delegate only when all base requirements are true and at least one dispatch trigger is true.

Base requirements:

- The task is isolated, concrete, and has a clear output contract.
- The subagent can make progress without full conversation history.
- The work is parallelizable, context-heavy, or useful as independent verification.
- The task has deterministic sensors or concrete artifact checks.
- The write set is disjoint from other active agents when edits are allowed.

Dispatch triggers:

- User explicitly asks for subagents, delegation, parallel agent work, or independent review.
- The scope has >=2 independent slices with disjoint write sets.
- The scope touches >10 files, >500 LOC, or >2 modules.
- A high/critical audit finding needs independent verification.
- Verbose context would exceed the context-firewall thresholds and can be summarized independently.

Keep local when any are true:

- The next main-agent step is blocked on the result.
- The task needs unresolved user intent.
- The work is tightly coupled across many files without a clear owner.
- The subagent would only duplicate main-agent thinking.
- Platform policy does not permit spawning an agent for this request.

## Plan Challenge Exception

Plan Challenge `plan-critic` is a standing policy exception to the normal dispatch triggers after a concrete plan exists. Always attempt a read-only `massa-ai-plan-critic` for both `depth: lite` and `depth: full` when subagent tooling is available and platform policy permits spawning. Normal base requirements still matter for packet quality: the critique must be bounded, read-only, and concrete, but it does not need to satisfy the ordinary dispatch triggers such as file count, module count, or explicit user delegation.

For all other roles, preserve the normal delegation gates above.

## Name Resolution

Charters live at `skills/agents/<role>/SKILL.md`. Hosts register every charter
under the prefixed name `massa-ai-<role>` (Claude, Codex, Cursor, OpenCode all
use that prefix; `scripts/generate-subagent-artifacts.ts` emits it).

- **Dispatch under the prefixed host name**, never the bare role name. A bare
  `subagent_type` does not resolve on any supported host.
- The bare role name is the registry key: use it in memory tags, capability
  packets, and prose.
- Every dispatch block in a workflow carries the prefixed name inline so
  dispatch never depends on this file being loaded.

If the named agent is unavailable for any reason — not registered, plugin not
installed, spawning forbidden by platform policy, or the host returns an unknown
`subagent_type` — do not retry under another name and do not invent one. Run the
delegated scope locally against the same output contract, and report the skipped
delegation with its reason in the Evidence Gate.

## Model Diversity Fallback

Applies to any charter whose `metadata.model_tier` is a fallback and whose
dispatching workflow additionally requests per-invocation model diversity at
dispatch time (e.g. `judge` — 3 parallel slots; `meta-judge` — one slot).

- The charter's `metadata.model_tier` is the fallback every host runs when
  dispatch-time model selection is unavailable.
- The dispatching workflow (e.g. `workflows/judge-with-debate.md`) is the
  single source for the current slot/model assignment, not the charter file.
- When dispatch-time selection is unavailable, every affected slot runs the
  charter default, and the orchestrator records `DIVERSITY DEGRADED`
  (multi-slot) or an equivalent diversity warning (single-slot) per the
  dispatching workflow's own contract.

## Roles

Use the role names in prompts and memory tags; use the host agent names to
dispatch.

Before adding a new reusable role, load `references/subagent-design.md` and write a bounded role charter. For one-off tasks, use an existing role plus the prompt contract below instead of inventing a new role.

## Roles

**The roster lives in one place: the Agent Table of `skills/AGENTS.md`**, which names
every shipped specialist with its purpose, trigger, permission, and charter path. Do not
restate it here. A second roster in this file is what let `judge` and `meta-judge` go
undocumented for a whole release with every gate green — the guard checked that the
charter paths *mentioned* here resolve, which a charter that is never mentioned cannot
fail.

This file owns dispatch mechanics. The one roster fact it owns is the **legacy role
vocabulary**: names earlier workflows dispatched by, kept so an old reference still
resolves to a current agent.

| Legacy role | Current agent | Note |
|---|---|---|
| `implementer` | `massa-ai-builder` | renamed |
| `verifier` | `massa-ai-verification-agent` | renamed; also centralizes the Verification Ladder |
| `domain-mapper` | `massa-ai-architecture-specialist` | folded in; `lens: domain` |
| `coupling-auditor` | `massa-ai-architecture-specialist` | folded in; `lens: coupling` |
| `deepening-architect` | `massa-ai-architecture-specialist` | folded in; `lens: deepening` |

`investigator`, `plan-critic` and `furps-analyst` kept their own names; every other
specialist is new and never had a legacy one. Workflows dispatch the current
`massa-ai-<role>` name through a named dispatch block — the legacy column is traceability
only, never a dispatch target.

## Capability Packet

**This section is the sole canonical Capability Packet definition.** `references/subagent-design.md` mirrors this list and the root `skills/AGENTS.md` registry points here without restating it. Bespoke packets (judge panel, FURPS analyst, phase-batch worker) are declared specializations that map onto these fields in their own workflow files.

**A subagent inherits nothing from the parent session** — no skills, no personas, no loaded references, no conversation history. Everything the subagent needs is named explicitly in the packet, including the exact reference file paths it must read itself.

When dispatching a subagent, send a compact capability packet rather than a loose instruction. Include:

- `role`: the role name from the Agent Table of `skills/AGENTS.md`
- `purpose`: one sentence tied to this workflow
- `trigger`: why delegation is justified now
- `scope`: exact files, modules, diff, report finding, task IDs, or artifact
- `permissions`: read-only or write with disjoint ownership
- `inputs`: recalled facts, source pointers, constraints, and exclusions
- `sensors`: expected commands or concrete checks
- `output`: the exact output contract
- `firewall`: raw logs, diffs, snapshots, reports, or research that must be summarized
- `memory`: whether the subagent may suggest memories and who persists them
- `persona`: optional. The cataloged persona id in effect for the parent conversation, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions. Pass the id alone, never the persona prompt.
- `next_use`: what the main agent will do with the result
- `lens`: conditional — `audit-specialist` dispatches only. One of `bugs | architecture | security | requirements | code-quality | performance`.

The named dispatch block that workflows embed (the quoted block whose header carries the prefixed agent name and role) is the block projection of this packet: `role` and `purpose` live in the block's header line, and `next_use` defaults to "the main agent synthesizes and continues the workflow" when absent. The remaining eight fields — `trigger, scope, permissions, inputs, sensors, output, firewall, memory` — appear as the block's body lines. The optional `persona` field appears there too.

## Prompt Contract

Every delegated task must include:

- exact `projectId`
- exact parent `workflowSessionId` or child session tag
- workflow name
- role name
- scope and file/module ownership
- facts already known
- what to avoid redoing
- allowed tools or mutation level
- deterministic validation expected
- context-firewall limit: what raw output must not be returned
- skipped-check policy and how to report unavailable sensors
- memory boundary: whether to suggest memories only or write none
- exact output format

## Output Contract

Every subagent returns:

- Status: `Complete`, `Blocked`, or `Partial`
- Scope checked or files changed
- Evidence: command result, static finding, source location, or artifact inspected
- Findings or implementation summary
- Risks and skipped checks
- Exact next step

Subagents must summarize verbose research, logs, snapshots, diffs, search output,
and transcripts. The main agent should receive only evidence, findings, risk,
skipped checks, memory suggestions when allowed, and the next step, not raw dumps.

**Default return bound: at most 40 lines of returned chat text.** A dispatch block's
`output:` field may override the bound with a stated reason. When a dispatch writes a
persisted report file, the chat return is the compact verdict only — never the file
body (dual-channel rule).

## Conversation Feedback

Use `references/conversation-feedback.md` when subagent lifecycle visibility would help the user understand what is running. Keep status updates to 1-2 human-readable lines.

Use these labels for delegated work:

- `Agent Started` when a role is launched with scope and permission mode.
- `Agent Running` when waiting on a long-running role or reporting its current bounded task.
- `Agent Done` when the role returns usable evidence, findings, implementation, or verification.
- `Agent Blocked` when the role cannot complete its assigned scope.

Do not expose raw subagent prompts, raw logs, private reasoning, or full output dumps in feedback lines.

Example:

```md
🤖 [Agent Started] Verifier is checking the docs-only change set. Scope: massa-ai references and README.
🤖 [Agent Done] Verifier found no stale references. Skipped checks: none.
```

## Plan-Critic Contract

Dispatch `massa-ai-plan-critic` only after a concrete plan exists. Dispatch it with the capability packet above and the standard output contract. The subagent receives the plan, scope, constraints, compact recalled facts/evidence, selected depth, selected The Fool mode only for full gates, known risks, verification recipe, parent identifiers, and context-firewall limits. It never receives full conversation context.

For `depth: lite`, the packet uses the low-risk checklist and does not include The Fool mode references. It returns:

- strongest low-risk challenges
- assumption most likely to fail
- deterministic check that would falsify success
- high-risk or broad-scope trigger found, if any
- `escalate_to_full: true|false`
- escalation reason

For `depth: full`, or after lite escalation, the main agent selects the mode, loads the relevant The Fool references, and dispatches a full packet. It returns:

- selected mode
- steelmanned thesis
- 3-5 strongest challenges
- severity: `critical`, `high`, `medium`, or `low`
- affected plan section
- evidence gap or assumption at risk
- required revision or accepted-risk framing
- confidence impact
- exact next step

The main agent owns final synthesis and applies the canonical Plan Challenge
Policy: the `<!-- massa-ai:bootstrap -->` block installed as `<host>/AGENTS.md`,
whose single source is `skills/AGENTS.md` in the product repo.

## Memory Rules

- Main agent persists durable conclusions after synthesis.
- Subagents may suggest memory content but should not create broad project memories unless explicitly assigned.
- Use tags such as `agent:verifier` or `agent:domain-mapper` only when they improve retrieval.
- Do not persist one-off subagent chatter.

## Synapse Isolation

For delegated tasks that expect repeated searches:

- create one ephemeral Synapse session per subagent
- pass only that agent's `synapseSessionId` to its `search` calls
- keep parent/child `workflowSessionId` values in memory tags and output packets
- never share one Synapse session across concurrent agents
- allow stateless fallback when session creation or adapter translation fails

## Guardrails

- No polling, no transcripts: never poll a running subagent and never ingest its
  transcript or intermediate reasoning — see Orchestrator Working Memory.
- No self-evaluation: claims need deterministic sensors or concrete source evidence.
- No hidden scope expansion: subagents must not improve adjacent code.
- No context dragging: send only task-specific source pointers and constraints, and receive compact summaries only.
- No conflicting writes: parallel implementers need disjoint files or worktrees.
