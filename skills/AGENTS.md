<!-- massa-ai:bootstrap:start -->
# Coding Session Startup Contract

## Required Coding Bootstrap

For every new conversation involving coding, planning before coding, debugging,
code review, refactoring, or implementation, activate the rules below in the
order they appear. Each rule can be switched off individually through
`massa-ai-config bootstrap`; a disabled rule's section is absent from the
rendered contract, and the remaining rules still activate in their own
relative order.

<!-- massa-ai:rule:caveman:start -->
### `caveman full`

Keep communication compressed while preserving technical accuracy; relax
compression when clarity or safety requires it.
<!-- massa-ai:rule:caveman:end -->
<!-- massa-ai:rule:massa-ai-router:start -->
### `massa-ai`

Activation means loading and using each available behavior. Load the installed
`massa-ai` skill's `SKILL.md` once before substantive work begins. Use it as
the public workflow router and load internal workflows or references only on
demand, including `references/coding-guidelines.md` before implementation
edits. Let it select the most specific workflow; when none applies, work
under its Core Contract without loading a workflow file. Recall relevant durable context
before work, retrieve only source context needed for the goal, remember only
verified outcomes worth reusing, and compact context only when size reduces
execution quality.

## Contract Ownership

This file is canonical only for session startup, lazy-loading guardrails,
user-editable policies, and global indexing/context exclusions.

Runtime workflow routing, project/session handling, retrieval, persistence,
graceful degradation, and completion behavior are canonical in
`skills/massa-ai/SKILL.md`. Do not copy those contracts into this file.

## Runtime Contract Pointer

After activation, follow `skills/massa-ai/SKILL.md` for all runtime behavior.
Its selected workflows and references define exact tool contracts, memory
tags, failure handling, and completion evidence.
<!-- massa-ai:rule:massa-ai-router:end -->

<!-- massa-ai:rule:dedupe-guardrails:start -->
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

The first load is mandatory in each new coding conversation and must load
`massa-ai`. Dedupe applies only after that load and must never skip initial
activation.
<!-- massa-ai:rule:dedupe-guardrails:end -->

<!-- massa-ai:rule:plan-challenge:start -->
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
`feature`, `create-adr`, `create-rfc`, `create-tdd`, or `refactor`; when the plan touches security,
data loss, migrations, irreversible actions, auth/privacy, cross-service
contracts; or when the plan touches more than 5 files, classes, or modules. If
The Fool or the selected Fool reference is already loaded, reuse it.

Both gates dispatch the `judge` agent in `plan-critique` mode (`depth: lite` or
`depth: full`); it writes nothing in that mode. For low-risk plans, the lite packet
carries this auto-lite checklist without loading The Fool references:

- What assumption would most likely make this plan fail?
- What evidence or deterministic check would falsify success?
- Does the plan touch more than 5 files/classes/modules or a high-risk domain?
- If a serious risk is found, revise the plan or load full The Fool.
<!-- massa-ai:rule:plan-challenge:end -->

<!-- massa-ai:rule:conversation-feedback:start -->
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
🤖 [Agent Running] Judge (plan-critique mode) is checking failure modes for the proposed design.
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
<!-- massa-ai:rule:conversation-feedback:end -->

<!-- massa-ai:rule:indexing-hygiene:start -->
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
!.env.example
*.pem
*.key
.ssh/
secrets.json
.idea/
.vscode/
.DS_Store
Thumbs.db
```
<!-- massa-ai:rule:indexing-hygiene:end -->

<!-- massa-ai:rule:english-code:start -->
## English-Only Code

All generated code, identifiers, comments, commit-facing code artifacts
(commit messages, PR titles and bodies), and code documentation are written
in English, regardless of the language the user writes in. This rule does
not change the language of the agent's conversational replies — only
generated code and its accompanying artifacts are English-only.
<!-- massa-ai:rule:english-code:end -->

<!-- massa-ai:rule:code-comments:start -->
## Code Comments

While `code-comments` is enabled, follow §1 (API Doc Block) and §2 (Rationale
Comment) of `skills/massa-ai/references/code-annotation.md` for every created
or updated unit of code.

<!-- massa-ai:rule:code-comments:off -->
`code-comments` is disabled: generated code gets no API doc blocks and no
rationale comments, overriding §1 (API Doc Block) and §2 (Rationale Comment)
of `skills/massa-ai/references/code-annotation.md`.
<!-- massa-ai:rule:code-comments:off-end -->
<!-- massa-ai:rule:code-comments:end -->
<!-- massa-ai:bootstrap:end -->

# Sub-Agent Registry

Single registry for the 7 reusable sub-agent skills in this repo. Workflows remain the orchestrators; these agents are specialists any workflow can invoke via the host's task/subagent tool. A charter that owns several output contracts selects one per dispatch through the capability packet's `mode` field.

**Dispatch names are the bare role.** A charter at `skills/agents/<role>/SKILL.md` is registered by every host as `<role>`; on the Claude plugin route dispatch the plugin-namespaced `massa-ai:<role>`. See `skills/massa-ai/references/agent-orchestration.md` -> Name Resolution for the convention and for the fallback when a named agent is unavailable.

## Capability Packet (dispatch contract)

The canonical field list and dispatch gates live in
`skills/massa-ai/references/agent-orchestration.md` §Capability Packet. An
agent inherits nothing from the parent session — no skills, no loaded
references, no conversation history; everything it needs is named in the
packet.

## Output Contract (shared by all agents)

Canonical shape — Status, Scope, Evidence, Findings, Risks and skipped checks,
Exact next step — lives in `skills/massa-ai/references/agent-orchestration.md`
§Output Contract.

## Agent Table

This table names no model. Each agent's model is resolved at build time from the active
profile in `skills/model-profiles.json`, which is the only hand-authored place that names
a model or an effort level for any host. Most agents use the profile's default per-tool
model; some carry optional per-agent overrides in the profile. A second copy here would
drift, and did.

| Name | Purpose | Permission | Modes | Charter |
|---|---|---|---|---|
| senior-engineer | Implement approved plans | write | — (one contract) | `skills/agents/senior-engineer/SKILL.md` |
| code-explorer | Understand an existing codebase, index-first | read-only | `lookup` (index-first answer), `trace` (flow, dependencies, impact) | `skills/agents/code-explorer/SKILL.md` |
| code-reviewer | Verify and audit existing or changed code | read-only | `verify` (Verification Ladder + discrimination sensor), `audit` (lenses bugs, architecture, security, code-quality, performance, diff) | `skills/agents/code-reviewer/SKILL.md` |
| designer | Read and write user-facing screens from Figma, screenshots, or other design direction | read-only (UI-layer write when scoped) | `audit` (conformance), `implement` (UI layer) | `skills/agents/designer/SKILL.md` |
| judge | Evaluate artifacts and challenge plans with quoted evidence | write (own judge-N report, `scorer` mode only) | `spec-author` (evaluation specification), `scorer` (debate panel), `plan-critique` (lite or full Plan Challenge gate) | `skills/agents/judge/SKILL.md` |
| product-manager | Hold requirements to a clear, complete, consistent standard | read-only | `furps` (one FURPS+ dimension), `requirements` (ambiguity, gaps, contradictions, implicit needs), `audit` (requirements lens) | `skills/agents/product-manager/SKILL.md` |
| test-engineer | Plan, audit, and fix tests | read-only (test-write when scoped) | `plan` (strategy), `audit` (tests lens), `fix` (tests-fix implementation) | `skills/agents/test-engineer/SKILL.md` |

## Mapping — Retired Agents → Current Agents

The single old→new table for the charters retired by the roster consolidation. Workflows dispatch only the current agent; this table is traceability, never a dispatch target. Older role vocabulary (`implementer`, `verifier`, `domain-mapper`, ...) is mapped in `skills/massa-ai/references/agent-orchestration.md` §Roles.

| Retired agent | Current agent | Mode / lens |
|---|---|---|
| builder | senior-engineer | `—` (renamed) |
| investigator | code-explorer | `trace` |
| navigator | code-explorer | `lookup` |
| reviewer | code-reviewer | `audit` (`lens: diff`) |
| verification-agent | code-reviewer | `verify` |
| audit-specialist | code-reviewer | `audit` (the `requirements` lens moved to product-manager `audit`, the `tests` lens to test-engineer `audit`) |
| architecture-specialist | code-reviewer | `audit` with `lens: architecture` and a `sub-mode` (its folded `domain-mapper`, `coupling-auditor`, `deepening-architect` roles; see `agent-orchestration.md` §Roles) |
| mobile-specialist | — | Retired; mobile guidance now comes from the main agent loading `references/mobile-context.md` directly (agent-roster-revision D3) |
| meta-judge | judge | `spec-author` |
| plan-critic | judge | `plan-critique` |
| furps-analyst | product-manager | `furps` |
| requirements-analyst | product-manager | `requirements` |
| planner | — | Retired; the dispatching workflow's main agent plans |
| context-curator | — | Retired; the main agent curates context under the Context Firewall |
| documentation-agent | — | Retired; the `create-*` workflows produce their documents |

## How to Add an Agent

1. Create `skills/agents/<name>/SKILL.md` from the charter template (see any existing agent skill), including `metadata.permission`.
2. Add one row to the Agent Table above.
3. Add one row to the Mapping table if it maps to an existing role.
4. Run `bun run generate:artifacts` to regenerate the host artifacts — the generator discovers agents by scanning `skills/agents/*/SKILL.md` directories. Add per-agent overrides to `skills/model-profiles.json` if the agent's model should differ from the profile default (optional; most agents use the default).
5. Add `<name>` to the roster in `scripts/__tests__/subagent-parity.test.ts` and run `bun run test:scripts`.

Steps 3-4 are enforced: the parity test fails on generator drift and `scripts/__tests__/skills-harness-integrity.test.ts` fails if a workflow dispatches an agent with no shipped artifact.

## massa-ai Concepts

All agents integrate these concepts (documented per-agent in each charter):

- **Massa-ai Memory**: agents suggest durable memories only when useful; the main agent persists.
- **Synapse**: repeated-search agents (code-explorer, code-reviewer in `audit` mode, product-manager) receive their own ephemeral Synapse session.
- **Context Firewall**: agents summarize verbose output and never return raw dumps.
- **Verification Ladder**: agents declare the deterministic sensors they run.
- **References**: agents point to the relevant massa-ai reference files by name.
- **Lessons**: agents surface reusable failures for lesson distillation.

<!-- validator anchors: 7 agents | mapping table -->