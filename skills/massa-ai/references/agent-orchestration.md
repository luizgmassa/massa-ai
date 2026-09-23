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

The Plan Challenge `judge` dispatch in `plan-critique` mode is a standing policy exception to the normal dispatch triggers after a concrete plan exists. Always attempt it for both `depth: lite` and `depth: full` when subagent tooling is available and platform policy permits spawning. Normal base requirements still matter for packet quality: the critique must be bounded, write nothing, and be concrete, but it does not need to satisfy the ordinary dispatch triggers such as file count, module count, or explicit user delegation.

For all other roles, preserve the normal delegation gates above.

## Independent Verification Exception (fix workflows + Standard+ light-workflow tiers)

The Independent Verification Mandate in `references/verification-ladder.md` is a second standing policy exception, parallel to the Plan Challenge one: when a `*-fix` workflow closes a finding, or a light workflow (`debug`, `feature`, `refactor`) completes Standard+ work, always attempt the `code-reviewer` dispatch in `verify` mode when subagent tooling is available and platform policy permits spawning — it does not need to satisfy the ordinary dispatch triggers (file count, module count, explicit user delegation). Base packet-quality requirements still apply, and the mandate's own tier gates, security-fix unconditional rule, and fresh-eyes fallback live in that ladder section, not here.

## Screen Implementation Exception (any workflow that can produce a screen)

A third standing policy exception, parallel to the two above: **when a task creates or modifies a user-facing screen, always attempt the `designer` dispatch** while subagent tooling is available and platform policy permits spawning. Once that condition holds the dispatch is not subject to the ordinary dispatch triggers — not file count, not module count, not explicit user delegation.

The condition is the whole gate. On a task with no screen surface the dispatch does not fire at all, which is why the dispatching workflows can carry it without firing it on every task. The `design`, `mobile-figma-audit`, and `mobile-figma-fix` workflows dispatch it unconditionally, because every task there is screen work. "Creates or modifies a user-facing screen" means a change to a screen, view, page, component, layout, style, theme, or design-token file, or any change whose acceptance criteria describe what a user sees.

Two shape rules follow from the roles involved:

- **Read-only inside findings-only workflows.** An audit workflow passes `permissions: read-only` in the packet. The agent's charter permits writes only when explicitly scoped, and charter Restrictions win over the packet on conflict, so the read-only packet is the narrower of the two and governs.
- **Disjoint from the implementer.** When a screen task also dispatches an implementer, the UI layer belongs to one agent and everything else to the other. Overlapping write sets are a consolidation signal under Cognitive Locality, not a parallel dispatch.

Base packet-quality requirements still apply, and the no-agent fallback below applies unchanged: run the scope locally against the same output contract and report the skipped delegation in the Evidence Gate.

## Name Resolution

Charters live at `skills/agents/<role>/SKILL.md`. Every host registers each
charter under its bare role name (`scripts/generate-subagent-artifacts.ts` emits
`<role>.md` / `<role>.toml` with `name: <role>`). Installers tell massa-ai's
agent files apart from a user's by the `massa-ai-owned` content marker, never
by name, and never overwrite a same-named agent the user owns.

- **Claude plugin route: dispatch `massa-ai:<role>`.** Plugin agents live in the
  plugin namespace (the agent list shows them as `massa-ai:<role>`), so the
  qualified name reaches massa-ai's agent even when the user or the project
  defines an agent with the same bare name. The always-loaded router states this
  rule, so dispatch never depends on this file being loaded.
- **Claude file route, Codex, Cursor, OpenCode: dispatch the bare `<role>`.**
  These hosts have no agent namespace. Accepted risk: when an installer skipped
  a same-named agent the user owns (it warns at install time), that user agent
  receives the dispatch.
- Dispatch blocks and prose name the bare role; it is also the registry key in
  memory tags and capability packets.
- The pre-rename `massa-ai-<role>` names are retired: installers prune them on
  upgrade, and no workflow dispatches them.

If the named agent is unavailable for any reason — not registered, plugin not
installed, spawning forbidden by platform policy, or the host returns an unknown
`subagent_type` — do not retry under another name and do not invent one. Run the
delegated scope locally against the same output contract, and report the skipped
delegation with its reason in the Evidence Gate.

## Model Diversity Fallback

Applies to any charter whose dispatching workflow requests per-invocation model diversity
at dispatch time (e.g. `judge` in `scorer` mode — 3 parallel slots; `judge` in `spec-author` mode — one slot).

- Agents without a per-agent model override in the built-in profiles (`code-explorer`,
  `code-reviewer`, `judge`, `product-manager`) resolve to the profile's per-tool default.
  By convention, the default is the profile's strongest model.
- The dispatching workflow (e.g. `workflows/judge-with-debate.md`) is the single source
  for the current slot/model assignment, not the charter file.
- When dispatch-time selection is unavailable, every affected slot runs the profile default,
  and the orchestrator records `DIVERSITY DEGRADED` (multi-slot) or an equivalent diversity
  warning (single-slot) per the dispatching workflow's own contract.

## Roles

Use the role names in prompts and memory tags; use the host agent names to
dispatch.

Before adding a new reusable role, load `references/subagent-design.md` and write a bounded role charter. For one-off tasks, use an existing role plus the prompt contract below instead of inventing a new role.

**The roster lives in one place: the Agent Table of `skills/AGENTS.md`**, which names
every shipped specialist with its purpose, trigger, permission, and charter path. Do not
restate it here. A second roster in this file is what once let the two debate-panel charters go
undocumented for a whole release with every gate green — the guard checked that the
charter paths *mentioned* here resolve, which a charter that is never mentioned cannot
fail.

This file owns dispatch mechanics. The one roster fact it owns is the **legacy role
vocabulary**: names earlier workflows dispatched by, kept so an old reference still
resolves to a current agent.

| Legacy role | Current agent | Note |
|---|---|---|
| `implementer` | `builder` | renamed |
| `verifier` | `code-reviewer` | folded in; `mode: verify`, which centralizes the Verification Ladder |
| `domain-mapper` | `code-reviewer` | folded in; `mode: audit`, `lens: architecture`, `sub-mode: domain` (packet field defined in the `code-reviewer` charter Inputs) |
| `coupling-auditor` | `code-reviewer` | folded in; `mode: audit`, `lens: architecture`, `sub-mode: coupling` |
| `deepening-architect` | `code-reviewer` | folded in; `mode: audit`, `lens: architecture`, `sub-mode: deepening` |

The charter names retired by the roster consolidation map to current agents in the
single old→new table of `skills/AGENTS.md`; this file does not repeat it. Workflows
dispatch the current `<role>` name through a named dispatch block — the legacy column
is traceability only, never a dispatch target.

## Capability Packet

**This section is the sole canonical Capability Packet definition.** `references/subagent-design.md` mirrors this list and the root `skills/AGENTS.md` registry points here without restating it. Bespoke packets (judge panel, `product-manager` FURPS dispatch, phase-batch worker) are declared specializations that map onto these fields in their own workflow files.

**A subagent inherits nothing from the parent session** — no skills, no loaded references, no conversation history. Everything the subagent needs is named explicitly in the packet, including the exact reference file paths it must read itself.

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
- `next_use`: what the main agent will do with the result
- `mode`: conditional — for a charter that declares modes (`code-explorer`, `code-reviewer`, `designer`, `judge`, `product-manager`, `test-engineer`), the `Mode:` section of the charter this dispatch runs.
- `lens`: conditional — `code-reviewer` `audit` dispatches only. One of `bugs | architecture | security | code-quality | performance`; the requirements lens is `product-manager` `audit` mode and the tests lens is `test-engineer` `audit` mode.

The named dispatch block that workflows embed (the quoted block whose header carries the agent name, role, and mode) is the block projection of this packet: `role`, `mode`, and `purpose` live in the block's header line, and `next_use` defaults to "the main agent synthesizes and continues the workflow" when absent. The remaining eight fields — `trigger, scope, permissions, inputs, sensors, output, firewall, memory` — appear as the block's body lines, except where Role Defaults below already fix a field's value.

### Role Defaults

A dispatch block carries only what varies. Every line below is that field's value
for **every** dispatch of the named role, supplied by this file rather than
restated per workflow. A block that restates one has forked the contract, which
is the failure these defaults exist to make impossible — the same field said
twice is the same field free to disagree.

Reading a workflow's dispatch block therefore means reading this section beside
it. That is the trade: the block stops being self-contained in exchange for
having exactly one place a shared value can be wrong.

**`code-reviewer`** (every mode)

- `permissions`: read-only

**`code-reviewer`, `mode: review`**

- `fallback`: if the subagent is unavailable, run a standalone fresh-eyes review against this output contract and record the skipped-delegation reason

**`designer`** — its dispatch is mandatory-on-condition, so its trigger is
fixed here rather than per workflow; a block that reworded it would silently make
the dispatch advisory in that one file.

- `trigger`: the task creates or modifies a user-facing screen — mandatory once that condition holds, per the Screen Implementation Exception in `references/agent-orchestration.md`; it does not fire when no screen surface is touched, and the `design`, `mobile-figma-audit`, and `mobile-figma-fix` workflows dispatch it unconditionally
- `sensors`: Figma MCP read when a design source exists; per-element expected-vs-actual comparison; the UI module's own build/lint; the states a design under-specifies — empty, loading, error, long text, small and large sizes
- `inputs`: exact `projectId`, parent `workflowSessionId`, Figma links/node ids or screenshots when supplied, acceptance criteria, the repository's existing UI conventions and design tokens, recalled screen patterns
- `firewall`: summarized design-source evidence and `path:line` pointers only, never raw Figma node dumps or full file bodies
- `memory`: suggest-only; the main agent persists durable screen and design-token conventions

A designer block therefore carries only `scope`, `permissions` and `output` — the
three fields that genuinely differ between an audit that may not write and an
implementation workflow that may.

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

- `Agent Started` when a role is launched: name the agent, its model, and its effort (see Model/Effort Announcement below), with scope and permission mode.
- `Agent Running` when waiting on a long-running role or reporting its current bounded task.
- `Agent Done` when the role returns usable evidence, findings, implementation, or verification.
- `Agent Blocked` when the role cannot complete its assigned scope.

Do not expose raw subagent prompts, raw logs, private reasoning, or full output dumps in feedback lines.

Example:

```md
🤖 [Agent Started] Verifier is checking the docs-only change set. Scope: massa-ai references and README.
🤖 [Agent Done] Verifier found no stale references. Skipped checks: none.
```

### Model/Effort Announcement

Every dispatch of any of the 7 massa-ai roster specialists names the agent, its model,
and its effort in the `Agent Started` line above, inside that line's existing 1-2 line
budget. No exemption: this covers the three standing dispatch exceptions
(`judge` in `plan-critique` mode, `code-reviewer` in `verify` mode, `designer`) and spec-driven batch workers exactly
like every other dispatch.

- **Source**: the *installed* agent file for the active host — never
  `skills/model-profiles.json`. The installed file reports what the host will actually
  load, including any local profile-switch overlay the registry cannot see.
- **Read once per session**, for all 7 agents, and cache the result — not once per
  dispatch.
- Absent `effort` in the installed file announces `effort: inherit`. Absent `model`, or
  `model: inherit`, announces `model: inherit`.
- A missing or unreadable installed file announces `model/effort unknown`, names the
  exact attempted path, and the dispatch proceeds — the read never blocks a dispatch.

```md
🤖 [Agent Started] Code-explorer — model opus, effort high. Scope: the four emitters.
🤖 [Agent Started] Designer — model/effort unknown (no installed agent file at
   <liveRoot>/agents/designer.md). Dispatching anyway.
```

That second line is a measured case, not a hypothetical: on a machine with plugin
bundle `1.48.0` installed, `designer.md` is absent because `designer` shipped
in `1.50.0` — a live instance of the degraded path above.

Per-host installed-agent path, matching `resolveHostLayout` in
`packages/shared/src/profile-switch/hosts.ts` — a sensor executes that resolver against
this table so the two cannot drift silently:

| Host | Installed agents directory | Owned files | Model / effort keys |
| --- | --- | --- | --- |
| Claude — marketplace route | `<marketplaceRoot>/agents`, where `<marketplaceRoot>` is `resolveClaudeMarketplaceInstall`'s live root: for a **directory-source** marketplace the host loads the plugin LIVE from the source bundle — e.g. `<repo>/apps/claude-plugin/agents`; for any other kind it is the *versioned* cache snapshot, e.g. `~/.claude/plugins/cache/massa-ai/massa-ai/1.48.0/agents` (a stale-able snapshot — never hardcode it; read `profile_list`'s `liveRoot`) | `*.md` whose first body line is `<!-- massa-ai-owned: true -->` | `model:` / `effort:` |
| Claude — file route | `~/.claude/agents` | `*.md` whose first body line is `<!-- massa-ai-owned: true -->` | `model:` / `effort:` |
| Codex | `~/.codex/agents` | `*.toml` whose first line is `# massa-ai-owned` | `model` / `model_reasoning_effort` |
| OpenCode | `~/.config/opencode/agents` | `*.md` symlinks into the massa-ai bundle | `model:` / `reasoningEffort:` |
| Cursor | no lookup — `resolveHostLayout` returns route `skip` | — | announce `model: inherit, effort: inherit` for every agent; Cursor publishes no resolvable model IDs |

Claude's active route (`marketplace` vs `file`) comes from `install-state.json`'s
per-platform `installRoute` field, never guessed from directory presence.

## Plan-Critique Contract

Dispatch `judge` with `mode: plan-critique` only after a concrete plan exists. Dispatch it with the capability packet above and the standard output contract. The subagent receives the plan, scope, constraints, compact recalled facts/evidence, selected depth, `fool_mode` (the selected The Fool mode: `pre_mortem`, `red_team`, `evidence_audit`, `socratic`, or `dialectic`; distinct from the packet `mode`, which stays `plan-critique`) only for full gates, known risks, verification recipe, parent identifiers, and context-firewall limits. It never receives full conversation context.

For `depth: lite`, the packet uses the low-risk checklist and does not include The Fool mode references. It returns:

- strongest low-risk challenges
- assumption most likely to fail
- deterministic check that would falsify success
- high-risk or broad-scope trigger found, if any
- `escalate_to_full: true|false`
- escalation reason

For `depth: full`, or after lite escalation, the main agent selects the The Fool mode, loads the relevant The Fool references, and dispatches a full packet carrying it as `fool_mode`. It returns:

- selected `fool_mode`
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
- Use tags such as `agent:code-reviewer` or `agent:code-explorer` only when they improve retrieval.
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
