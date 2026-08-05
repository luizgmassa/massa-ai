<!-- massa-ai:bootstrap:start -->
# Coding Session Startup Contract

## Required Coding Bootstrap

For every new conversation involving coding, planning before coding, debugging,
code review, refactoring, or implementation, activate this stack in order:

1. `caveman full`
2. `coding-guidelines`
3. `massa-ai`
4. `persona-router`

Activation means loading and using each available behavior. Load the installed
`massa-ai` skill's `SKILL.md` once before substantive work begins. Let it
select the most specific workflow; use `workflows/general.md` only when no
specialized workflow applies. Recall relevant durable context before work,
retrieve only source context needed for the goal, remember only verified
outcomes worth reusing, and compact context only when size reduces execution
quality. After massa-ai finishes its initial memory setup, load and run
`persona-router` against the first user prompt before substantive work.

For generic non-coding conversations, preserve massa-ai's exclusion: do not
load `massa-ai` solely for persona selection. Run `persona-router` directly
against the configured policy, persona catalog, workspace documentation, and
the first user prompt.

### Dedupe And Lazy-Load Guardrails

Before reading any massa-ai workflow or reference:

- First ensure `massa-ai` has been loaded in the current conversation. If it
  has not, load it before applying any dedupe rule.
- After the initial load, reuse already-loaded `massa-ai`, The Fool, or the
  selected workflow/reference context.
- Do not re-read a massa-ai skill or reference only because `AGENTS.md` names
  it after initial activation is complete.
- Treat `massa-ai` as a router, not permission to bulk-load all workflows or
  references.
- Load only the missing minimum context required for the current request.
- Never load all workflows or all references "just in case."

Load `persona-router` once per conversation after the coding bootstrap, or
directly for non-coding conversations. Reuse its selected route across turns;
do not reload the router or persona prompt unless its rerouting rules apply.

The first load is mandatory in each new coding conversation and must load
`massa-ai`. Dedupe applies only after that load and must never skip initial
activation.

### Skill Summary

- `caveman full`: keep communication compressed while preserving technical
  accuracy; relax compression when clarity or safety requires it.
- `coding-guidelines`: think before coding, prefer the simplest complete
  solution, and keep edits surgical and goal-driven.
- `massa-ai`: use it as the public workflow router and load internal
  workflows or references only on demand.
- `persona-router`: select one cataloged specialist perspective after
  massa-ai context is available, using progressive disclosure and at most
  one secondary review lens.

### Conditional RTK Rules

RTK is a token-optimized CLI proxy. When the `rtk` command is available in the
current environment, prefix shell commands with `rtk`:

```bash
rtk git status
rtk cargo test
rtk npm run build
rtk pytest -q
```

Useful RTK commands:

```bash
rtk gain
rtk gain --history
rtk proxy <cmd>
rtk --version
which rtk
```

If `rtk` is unavailable, run commands normally. Its absence must not block or
fail the task. An availability check may run without the prefix.

## Contract Ownership

This file is canonical only for session startup, lazy-loading guardrails,
user-editable policies, and global indexing/context exclusions.

Runtime workflow routing, project/session handling, retrieval, persistence,
graceful degradation, and completion behavior are canonical in
`skills/massa-ai/SKILL.md`. Do not copy those contracts into this file.
Persona selection, evidence gathering, route persistence, and persona failure
handling are canonical in `skills/persona-router/SKILL.md`.

## Persona Router Policy

This user-editable policy controls automatic persona selection. SessionStart
transports this policy before the first user prompt; the agent performs the
actual selection only after that prompt is available.

```yaml
persona_router:
  enabled: auto
  ambiguity: ask
  no_match: no_persona
  mid_conversation: task_change
```

Supported values:

- `enabled`: `auto` runs automatic inference for every conversation; `off`
  disables inference but still honors explicit persona or no-persona requests.
- `ambiguity`: `ask` asks the user to choose among plausible personas or no
  persona; `best_match` applies the strongest supported route; `no_persona`
  continues without a persona.
- `no_match`: `no_persona` continues silently when no catalog entry fits;
  `ask` asks whether to use a weakly supported candidate or no persona.
- `mid_conversation`: `task_change` re-evaluates when the primary deliverable
  changes ownership or a new task begins; `explicit_only` changes the route
  only when the user requests it.

A project `AGENTS.md` may additionally declare a persona pin as a single data
line (not a policy block):

```text
persona_pin: <catalog-id> | no_persona
```

A valid pin is a routing fast path: the router reads only the pinned persona's
prompt — no memory recall, no workspace-doc inspection, no signals loading, no
classification. `no_persona` completes routing silently. A pin naming an id
absent from the catalog is reported in one line and routing continues normally.
Precedence: explicit prompt-level choice > pin > automatic inference. With no
pin, a `persona-route:<projectId>` pattern memory from a prior successful
inferred route may skip doc inspection and classification the same way.

Prompt-level explicit persona or no-persona instructions override this policy
for the current task. Applicable system, developer, and project instructions
remain higher priority than persona behavior.

Automatic routing must use progressive disclosure: inspect catalog metadata
first, reuse relevant massa-ai evidence when available, read only targeted
workspace documentation when needed, and load only the selected persona prompt.
Ask the user only when the configured edge-case policy requires it.

## Plan Challenge Policy

This user-editable policy controls whether massa-ai runs The Fool after
constructing a plan. It is a second-pass gate, not the initial workflow router.

```yaml
plan_challenge:
  enabled: auto
  depth: lite
  mode: auto
  full_gate: high_risk_or_explicit
  serious_findings: revise_plan
```

Supported values:

- `enabled`: `auto` runs the configured gate; `off` disables it;
  `explicit_only` runs only when the user asks for a challenge, pre-mortem,
  red-team, or evidence audit.
- `depth`: `lite` uses an inline checklist for low-risk plans; `full` loads
  `workflows/the-fool.md` when needed.
- `full_gate`: `high_risk_or_explicit` loads full The Fool for high-risk plans
  or direct requests; `always` loads it for every plan; `explicit_only` loads it
  only on direct request.
- `mode`: `auto` chooses from The Fool mode-selection guide; `ask` asks when
  interactive input is available; concrete modes are `pre_mortem`, `red_team`,
  `evidence_audit`, `socratic`, or `dialectic`.
- `serious_findings`: `revise_plan` incorporates valid high-risk findings
  before finalizing; `append_critique` keeps the plan and attaches critique;
  `warn_only` briefly reports risks.

Prompt-level user instructions override this policy for the current turn.

Load full `workflows/the-fool.md` when the workflow is `spec-driven`,
`feature`, `adr`, `rfc`, `tdd`, or `refactor`; when the plan touches security,
data loss, migrations, irreversible actions, auth/privacy, cross-service
contracts; or when the plan touches more than 5 files, classes, or modules. If
The Fool or the selected Fool reference is already loaded, reuse it.

For low-risk plans, run this inline auto-lite checklist without loading The Fool
references:

- What assumption would most likely make this plan fail?
- What evidence or deterministic check would falsify success?
- Does the plan touch more than 5 files/classes/modules or a high-risk domain?
- If a serious risk is found, revise the plan or load full The Fool.

## Conversation Feedback Policy

This user-editable policy controls chat-visible status updates for
`massa-ai` workflows. It is a progress and observability layer, not a
persistence system.

```yaml
conversation_feedback:
  enabled: auto
  density: transition_updates
  style: emoji_capitalized_ascii
  max_lines_per_update: 2
  include: [workflow, loads, memory, notebooklm, subagents, divergences, verification]
  suppress: [chain_of_thought, raw_tool_output, repeated_micro_events]
```

Supported labels are `Start`, `Routing`, `Loading`, `Context`, `Decision`,
`Agent Started`, `Agent Running`, `Agent Done`, `Agent Blocked`, `Divergence`,
`Warning`, `Error`, `Verified`, and `Finished`.

Use this shape:

```md
🔵 [Start] Planning visual feedback for massa-ai. Workflow: Spec Driven. Session: Visual Feedback.
🔄 [Loading] Reading AGENTS.md and massa-ai router guidance before planning.
🧠 [Context] Found 8 relevant massa-ai memories and queried the requested NotebookLM source.
🤖 [Agent Running] Plan Critic is checking failure modes for the proposed design.
⚠️ [Divergence] Expected the legacy router path, but this checkout uses skills/massa-ai/SKILL.md.
✅ [Verified] Stale-reference checks and skill validation passed.
🏁 [Finished] Plan complete. Changed files: none. Remaining risk: none found.
```

Rules:

- Keep each status update to 1-2 lines.
- Use capitalized labels and human-readable sentences.
- Avoid `=` syntax, tiny abbreviations, and ultra-compressed words.
- Never expose chain-of-thought, raw tool output, raw logs, secrets, or raw
  subagent prompts.
- Load `skills/massa-ai/references/conversation-feedback.md` only when
  detailed feedback guidance is needed.

## Runtime Contract Pointer

After activation, follow `skills/massa-ai/SKILL.md` for all runtime behavior.
Its selected workflows and references define exact tool contracts, memory tags,
failure handling, and completion evidence.

## Indexing / Context Hygiene

Always ignore these paths during indexing and context loading:

```text
node_modules/
vendor/
.venv/
env/
__pycache__/
*.pyc
dist/
build/
.next/
.nuxt/
out/
bin/
obj/
target/
ios/Pods/
ios/build/
android/app/build/
android/.gradle/
android/.idea/
.expo/
.dart_tool/
*.ipa
*.apk
*.app
*.log
logs/
.npm/
.eslintcache
.stylelintcache
.cache/
tmp/
.env*
*.pem
*.key
.ssh/
secrets.json
.idea/
.vscode/
.DS_Store
Thumbs.db
```
<!-- massa-ai:bootstrap:end -->

# Sub-Agent Registry

Single registry for the 17 reusable sub-agent skills in this repo. Workflows remain the orchestrators; these agents are single-purpose specialists any workflow can invoke via the host's task/subagent tool.

**Dispatch names are prefixed.** A charter at `skills/agents/<role>/SKILL.md` is registered by every host as `massa-ai-<role>`. Dispatch `massa-ai-investigator`, not `investigator`; the bare name is the registry key only. See `massa-ai/references/agent-orchestration.md` -> Name Resolution for the convention and for the fallback when a named agent is unavailable.

## Orchestration Model

```
Workflow (orchestrator)
  │  owns: routing, memory recall/persistence, user synthesis, Evidence Gate
  │
  ├─ dispatch massa-ai-investigator        (read-only: locate, trace, understand)
  ├─ dispatch massa-ai-navigator           (read-only: index-first navigation)
  ├─ dispatch massa-ai-context-curator     (read-only: build Context Packet)
  ├─ dispatch massa-ai-planner             (read-only: produce plan)
  ├─ dispatch massa-ai-plan-critic         (read-only: challenge the plan)
  ├─ dispatch massa-ai-meta-judge          (read-only: author evaluation specification, once per evaluation)
  ├─ dispatch massa-ai-judge               (read-only: score + debate against the specification, 3 per panel)
  ├─ dispatch massa-ai-builder             (write: implement approved task, disjoint write set)
  ├─ dispatch massa-ai-reviewer            (read-only: review diff)
  ├─ dispatch massa-ai-verification-agent  (read-only: run Verification Ladder)
  └─ Evidence Gate + persist memory
```

Workflows own routing, memory, user-facing synthesis, and the final Evidence Gate. Agents own one bounded capability. Dispatch follows the gates and capability-packet shape in `references/agent-orchestration.md` (symlinked massa-ai skill).

## Capability Packet (dispatch contract)

Workflows send this packet when dispatching any agent:

- `role`: agent name from the table below
- `purpose`: one sentence tied to this workflow
- `trigger`: why delegation is justified now (must satisfy a dispatch gate from `references/agent-orchestration.md`)
- `scope`: exact files, modules, diff, report finding, or task IDs
- `permissions`: read-only or write with disjoint write set
- `inputs`: recalled facts, source pointers, task/report IDs, constraints, exclusions
- `sensors`: commands or concrete checks expected
- `output`: the exact output contract (see below)
- `firewall`: raw logs, diffs, snapshots, or research that must be summarized, not returned raw
- `memory`: whether the agent may suggest memory and who persists it (default: suggest only; main agent persists)
- `persona`: optional. The cataloged persona id in effect for the parent conversation, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions. Pass the id alone, never the persona prompt.
- `next_use`: what the main agent will do with the result
- `lens`: conditional — `audit-specialist` dispatches only. One of `bugs | architecture | security | requirements | code-quality | performance`.

This list mirrors the canonical Capability Packet in `references/agent-orchestration.md` (single source; `scripts/__tests__/capability-packet-parity.test.ts` fails when the two field lists diverge). An agent inherits nothing from the parent session — no skills, no personas, no loaded references, no conversation history; everything it needs is named in the packet.

The `persona` field is optional and absent is the valid default. Personas and agents are different layers: a persona shapes the main agent's stance, an agent executes a bounded capability under its own charter. See `skills/persona-router/SKILL.md` -> Persona And Sub-Agents for the boundary rules.

## Output Contract (shared by all agents)

Every agent returns:

- **Status**: `Complete` | `Partial` | `Blocked`
- **Scope**: files checked or changed
- **Evidence**: commands, source locations, artifacts inspected
- **Findings**: summary of what was found or implemented
- **Risks and skipped checks**: with reasons
- **Exact next step**: what the main agent should do with the result

Agents summarize verbose output. They never return raw logs, diffs, snapshots, or research dumps to the main context (Context Firewall). Default return bound: at most 40 lines of returned chat text unless the dispatch's `output:` field overrides it with a reason; a dispatch that writes a persisted report returns the compact verdict only, never the file body.

## Agent Table

Dispatch each agent as `massa-ai-<Name>`.

This table names no model. Each agent's model is resolved at build time from its
charter's `metadata.model_tier` plus the host and the selected profile in
`skills/model-profiles.json`, which is the only hand-authored place that names a model
or an effort level for any host. Read the tier from the charter; a second copy here
would drift, and did.

| Name | Purpose | Permission | Trigger | Charter |
|---|---|---|---|---|
| investigator | Read and understand the codebase | read-only | Locate implementations, trace flow, estimate impact | `skills/agents/investigator/SKILL.md` |
| planner | Transform requests into implementation plans | read-only | Break work into steps, identify risks, order execution | `skills/agents/planner/SKILL.md` |
| builder | Implement approved plans | write | Modify source code with a disjoint write set | `skills/agents/builder/SKILL.md` |
| reviewer | Review implementation quality | read-only | Analyze diffs for bugs, regressions, smells | `skills/agents/reviewer/SKILL.md` |
| context-curator | Prepare the minimum high-quality Context Packet | read-only | Decide files to open, retrieve memories, apply firewall | `skills/agents/context-curator/SKILL.md` |
| verification-agent | Centralize Verification Ladder logic | read-only | Validate outputs, choose verification level | `skills/agents/verification-agent/SKILL.md` |
| requirements-analyst | Analyze requirements before implementation | read-only | Detect ambiguity, gaps, contradictions, implicit needs | `skills/agents/requirements-analyst/SKILL.md` |
| architecture-specialist | Provide architectural guidance | read-only | Evaluate architecture, suggest boundaries, trade-offs | `skills/agents/architecture-specialist/SKILL.md` |
| test-engineer | Generate testing strategy | read-only (test-write when scoped) | Unit, integration, edge cases, acceptance coverage | `skills/agents/test-engineer/SKILL.md` |
| documentation-agent | Generate engineering documentation | read-only (doc-write when scoped) | README, ADR, RFC, changelog, KDoc | `skills/agents/documentation-agent/SKILL.md` |
| audit-specialist | Execute specialized audits through configurable lenses | read-only | One of: bugs, architecture, security, requirements, code-quality, performance | `skills/agents/audit-specialist/SKILL.md` |
| mobile-specialist | Provide mobile-specific expertise (conditional) | read-only | Mobile-related project detected (Android/iOS/KMP) | `skills/agents/mobile-specialist/SKILL.md` |
| plan-critic | Challenge a constructed plan (lite or full Plan Challenge gate) | read-only | A concrete plan exists; standing policy exception to the dispatch triggers | `skills/agents/plan-critic/SKILL.md` |
| furps-analyst | Analyze one FURPS+ dimension of a PRD/ADR | read-only | `furps-refinement` fans out per-dimension analysis | `skills/agents/furps-analyst/SKILL.md` |
| navigator | Navigate an indexed codebase index-first | read-only | "where is X", "who calls Y" against a fresh massa-ai index | `skills/agents/navigator/SKILL.md` |
| meta-judge | Author the evaluation specification YAML a debate panel scores against (once per evaluation) | read-only | `judge-with-debate` opens an evaluation | `skills/agents/meta-judge/SKILL.md` |
| judge | Score an artifact against the evaluation specification with quoted evidence; debate to consensus | read-only | `judge-with-debate` dispatches the 3-judge panel or a debate round | `skills/agents/judge/SKILL.md` |

## Mapping — New Agents ↔ Existing Roles

The symlinked massa-ai skill defines the roles in `references/agent-orchestration.md`. This registry maps the agent skills to those roles:

| New agent skill | Existing role | Relationship |
|---|---|---|
| investigator | `investigator` | Identical capability; new skill is the product-repo packaging. |
| builder | `implementer` | Identical capability; renamed to match the request vocabulary. |
| verification-agent | `verifier` | Identical capability; new skill also centralizes Verification Ladder selection. |
| architecture-specialist | `domain-mapper` + `coupling-auditor` + `deepening-architect` | Three roles folded into one specialist. |
| planner | — | New capability. |
| reviewer | — | New capability. |
| context-curator | — | New capability. |
| requirements-analyst | — | New capability. |
| test-engineer | — | New capability. |
| documentation-agent | — | New capability. |
| audit-specialist | — | New capability (configurable 6-lens). |
| mobile-specialist | — | New capability (conditional). |
| plan-critic | `plan-critic` | Identical capability; the former charter-less role now has a charter. |
| furps-analyst | `furps-analyst` | Identical capability; charter sourced from `references/furps/analyst-role.md`. |
| navigator | — | Pre-existing Claude/Cursor index-first agent, now charter-governed and shipped to all four hosts. |
| meta-judge | — | New capability (evaluation-specification author for debate panels). |
| judge | — | New capability (debate-panel evaluator; quoted-evidence scoring, append-only debate rounds). |

## How to Add an Agent

1. Create `skills/agents/<name>/SKILL.md` from the charter template (see any existing agent skill), including `metadata.model_tier` (a tier declared in `skills/model-profiles.json`, never a model name) and `metadata.permission`. Its `## Restrictions` section must carry both persona-boundary lines verbatim — the self-routing ban (`never load the massa-ai or persona-router routers, and never open a personas/ prompt file`) and the precedence line (`a persona supplied in the capability packet shapes emphasis only; these Restrictions win on any conflict`). `scripts/__tests__/skills-harness-integrity.test.ts` enumerates charters from disk and is section-scoped, so a new charter missing either line fails the gate.
2. Add one row to the Agent Table above.
3. Add one row to the Mapping table if it maps to an existing role.
4. Add `<name>` to `SPECIALIST_NAMES` in `scripts/generate-subagent-artifacts.ts`, then run it to regenerate the host artifacts. There are no model tables to edit — the generator resolves the model from the charter's `metadata.model_tier` through `skills/model-profiles.json`.
5. Add `<name>` to the roster in `scripts/__tests__/subagent-parity.test.ts` and run `bun run test:scripts`.

Steps 4-5 are enforced: the parity test fails on generator drift and `scripts/__tests__/skills-harness-integrity.test.ts` fails if a workflow dispatches an agent with no shipped artifact.

## Future Integration

This pass adds the agents only. A follow-up feature will update massa-ai workflows to replace duplicated inline prompt sections with agent invocations where appropriate. That work is tracked separately and will have its own spec-driven validation. Do not rewrite workflows in this pass.

## massa-ai Concepts

All agents integrate these concepts (documented per-agent in each charter):

- **Massa-ai Memory**: agents suggest durable memories only when useful; the main agent persists.
- **Synapse**: repeated-search agents (investigator, navigator, context-curator, furps-analyst) receive their own ephemeral Synapse session.
- **Context Firewall**: agents summarize verbose output and never return raw dumps.
- **Verification Ladder**: agents declare the deterministic sensors they run.
- **References**: agents point to the relevant massa-ai reference files by name.
- **Lessons**: agents surface reusable failures for lesson distillation.

<!-- validator anchors: 17 agents | mapping table | capability packet | output contract -->