# Skills Harness Audit

Date: 2026-07-26
Workflow: implementation (harness lens)
ProjectId: `massa-ai`
WorkflowSessionId: `explore-skills-harness`
Target: `skills/` agent harness — router, 36 workflows, ~70 references, agent charters, 3 standalone skills
Target Focus: duplication between `skills/massa-ai-memory/` + `skills/synapse-usage/` and `skills/massa-ai/references/`; workflow drift, dispatch correctness, non-deterministic instructions
Scope: `skills/**`, `scripts/generate-subagent-artifacts.ts`, `scripts/install-skills.sh`, `scripts/install-agents.sh`, `apps/*/agents/**`, `apps/*/install.sh`, `scripts/__tests__/**`, `.github/workflows/skills.yml`, root `AGENTS.md`, `CLAUDE.md`, `README.md`, `FEATURES.md`
Git Base: `4fa589b` (`main`)
Git Head: `harness/skills-audit-remediation` working tree
Source Evidence Timestamp: 2026-07-26 01:46 local time
Requirements Source: n/a (user prompt: analyze duplication, gaps, bugs, drift, non-deterministic instructions, subagent misuse)

All line numbers below are as of base `4fa589b`.

## Findings

### HRN-1: every workflow dispatch block named an agent no host registers

Severity: critical
Confidence: high
Location: 24 dispatch blocks across 16 files, e.g. `skills/massa-ai/workflows/exploration.md:58`, `workflows/spec-driven.md:100`, `workflows/security/security-fix.md:51,61`
Evidence: blocks read `> **Dispatch: investigator** — see \`skills/agents/investigator/SKILL.md\``, while `scripts/generate-subagent-artifacts.ts:234` emits `name: massa-ai-${c.name}` and every shipped artifact is `apps/*/agents/massa-ai-*.md|toml`. `.specs/features/subagent-skills-plugin-parity/spec.md:65` states the prefix is intentional ("we still prefix names `massa-ai-`").
Impact: `subagent_type: "investigator"` does not resolve on any of the four hosts. Every delegating workflow — audits, fixes, spec-driven validation — failed at the dispatch step or silently degraded to in-main-agent work with no record.
Simplest Fix Direction: carry the host-resolvable name inline in each block, plus one Name Resolution section defining the convention and the no-agent fallback.
Verification Suggestion: `bun test scripts/__tests__/skills-harness-integrity.test.ts -t "dispatch"`
Remediation: dispatch blocks rewritten to `> **Dispatch: \`massa-ai-<role>\`** (role: \`<role>\`) — charter \`skills/agents/<role>/SKILL.md\``; `references/agent-orchestration.md` gained a **Name Resolution** section and the missing degradation rule (agent absent for any reason -> run the scope locally against the same output contract, report the skipped delegation, never retry under another name).

### HRN-2: `plan-critic`, `furps-analyst`, `handoff-writer` were phantom roles

Severity: critical
Confidence: high
Location: `skills/massa-ai/references/agent-orchestration.md:52,70-72`; `skills/AGENTS.md:365`; `skills/massa-ai/SKILL.md:174,192`; `workflows/the-fool.md:23`
Evidence: `agent-orchestration.md:52` mandated "Always attempt a read-only `plan-critic` for both `depth: lite` and `depth: full`", while `:70-72` listed all three roles with Charter = "role-based (no charter)". No `skills/agents/plan-critic/`, no artifact in any of the four host dirs, absent from the 12-row Agent Table (`skills/AGENTS.md:331-344`). `skills/AGENTS.md:365` asserted the three "remain in `references/agent-orchestration.md` unchanged".
Impact: the Plan Challenge gate — which the startup contract runs on *every* plan — dispatched a name that cannot exist. The only documented fallback covered "spawning unavailable", not "the agent does not exist", so behavior was undefined at the most-used gate in the harness. Same for the six-way `furps-analyst` fan-out in `workflows/refinement/furps-refinement.md:31,65`.
Simplest Fix Direction: charter the three roles from the contracts that already existed rather than inventing new ones.
Verification Suggestion: `bun test scripts/__tests__/skills-harness-integrity.test.ts -t "phantom"`
Remediation: created `skills/agents/{plan-critic,furps-analyst,handoff-writer}/SKILL.md` (bodies sourced from `agent-orchestration.md:144-169`, `references/furps/analyst-role.md`, `references/handoff-package.md`); registered in `skills/AGENTS.md`, `SPECIALIST_NAMES`, both model-pinning tables, and the parity roster; Charter column now points at real paths; the false claim at `skills/AGENTS.md:365` is gone.

### HRN-3: the Plan Challenge Policy shipped in two contradicting copies

Severity: critical
Confidence: high
Location: `skills/AGENTS.md:135-181` (bootstrap block) vs root `AGENTS.md:94-107`; pointers at `skills/massa-ai/SKILL.md:14,170`, `workflows/the-fool.md:9`, `references/agent-orchestration.md:169`, `references/conversation-feedback.md:11`
Evidence: the bootstrap block routes `feature`/`refactor` to the **lite** gate first, includes `design` in the full-gate list, and **delegates** lite to `plan-critic`. Root `AGENTS.md:105-107` routes `feature`/`refactor` to the **full** gate, omits `design`, and says "run the inline auto-lite checklist". Both were reachable through the same instruction: `[\`AGENTS.md\`](../../AGENTS.md)` resolves to the repo file from a checkout and to the installed host file from `~/.claude/skills/massa-ai/`.
Impact: the gate an agent applied depended on which copy its vantage point resolved — opposite depth for the two most common planning workflows, and delegated-vs-inline execution of the same checklist.
Simplest Fix Direction: make the bootstrap block the single source; reduce the root file to a pointer; replace every vantage-dependent relative link.
Verification Suggestion: `bun test scripts/__tests__/skills-harness-integrity.test.ts -t "policy single-source"`
Remediation: root `AGENTS.md` policy bodies replaced with an "Agent Policies (single source elsewhere)" pointer; all four pointers now name the installed `<!-- massa-ai:bootstrap -->` block with `skills/AGENTS.md` as its source; the substantive conflict is resolved in favor of the bootstrap block, which is what the router's own Plan Challenge Gate section already implemented.

### HRN-4: two standalone skills duplicated the references and contradicted them

Severity: high
Confidence: high
Location: `skills/massa-ai-memory/SKILL.md` (400 lines), `skills/synapse-usage/SKILL.md` (271 lines)
Evidence, duplication: `massa-ai-memory:26-338` restated tool contracts already in `references/mcp-tools.md`; `:340-401` restated `references/installation.md`; `synapse-usage:26-118,150-252` restated the lifecycle already in `references/synapse-policy.md`.
Evidence, contradiction and defect:
- `massa-ai-memory:28-51` ranked only **21 of the 52** tools, so 31 tools (`trace_path`, `impact_analysis`, `handoff_*`, `synapse_task_begin/end`, `compact_snapshot`, `execute*`, …) were absent from the preference list agents were told to follow.
- `:38` placed destructive `reset_project` at "Priority 9" inside a preference-ordered list, above `remember`/`recall`, with no confirmation guard — while `references/mcp-tools.md:26,260` require explicit user intent and forbid it as reindex preparation.
- `:51` ranked `Glob/Grep/Read` at priority 22 "only when massa-ai doesn't find what you need", with no index-staleness escape — contradicting the router's freshness gating, which mandates the shell fallback when the index is stale.
- `:41` claimed `compress` reduces "70-98%", contradicting its own table at `:282-290` (max 80-95%).
- `:98-102` branched on `ScheduleWakeup`, a Claude-Code-only tool, inside a host-agnostic skill.
- `synapse-usage` taught the whole lifecycle as unauthenticated `curl` (`:47-55,84-88,96-107,113-115,189-196,211-225`) while the router mandates MCP-first, piped through `jq` at `:54,216` (`CLAUDE.md:231`: there is no `jq` in this repo) with no fallback, never used `synapse_task_begin`/`synapse_task_end` though the router mandates the task envelope, and linked two nonexistent files at `:269` (`docs/rfc-venvanse-for-agents.md`, `docs/synapse-dev-plan.md`).
Impact: two parallel sources of truth for retrieval policy, where the duplicate was both less complete and wrong in the places it diverged — including a destructive tool ranked as routine.
Simplest Fix Direction: migrate only the unique, correct content into the references; delete both skills.
Verification Suggestion: `bun run test:scripts`; `bash scripts/install-skills.sh --dry-run --agent claude` reports 2 skills
Remediation: migrated four items — the compression-strategy table into `references/mcp-tools.md` (which named no strategy at all), and the Synapse pipeline-diagnostics table, config knobs (`SYNAPSE_ATTENTION_ENABLED` defaults **false**), 20-entry buffer bound, 1h TTL, and anti-patterns into `references/synapse-policy.md`. Added the missing `synapse_task_begin`/`synapse_task_end` lifecycle steps. Deleted `skills/massa-ai-memory/` and `skills/synapse-usage/`; updated `validate-repository.test.ts`, `workflows/general.md:14`, root `AGENTS.md`, `CLAUDE.md`, `README.md`, `FEATURES.md`. `scripts/install-skills.sh:190` globs `$SKILLS_ROOT/*/`, so the installer needed no change.

### HRN-5: `massa-ai-navigator` shipped ungoverned, with an explicit drift-check exemption

Severity: high
Confidence: high
Location: `apps/claude-plugin/agents/massa-ai-navigator.md`, `apps/cursor-plugin/agents/massa-ai-navigator.md`; `scripts/generate-subagent-artifacts.ts:356-358`; `apps/claude-plugin/install.sh:179-188,210-215`; `apps/cursor-plugin/install.sh:218-232`
Evidence: navigator existed in claude + cursor (13 agents each) but not codex or opencode (12 each); it had no charter under `skills/agents/`, no row in the Agent Table, and `diffHost()` excluded it from the drift check by comment and by construction ("the navigator … are not generator-owned"). Both installers special-cased it: copied explicitly, skipped in the copy loop, preserved on uninstall.
Impact: a shipped agent no test covered, absent on half the hosts, editable without any gate — and a permanent exemption class in the one script that guarantees charter-to-artifact parity.
Simplest Fix Direction: charter it, register it, generate it for all hosts, drop the exemption.
Verification Suggestion: `bun scripts/generate-subagent-artifacts.ts --check`; `bun test scripts/__tests__/subagent-parity.test.ts`
Remediation: authored `skills/agents/navigator/SKILL.md` from the shipped body; added to `SPECIALIST_NAMES` and both model tables; removed the `diffHost` exemption; taught the generator a per-agent tool override (`AGENT_TOOLS_OVERRIDE`) so navigator keeps `["mcp__massa-ai__*","Read","Grep","Glob","Bash(pwd)"]`, plus an OpenCode bash override (`{ "pwd": "allow", "*": "deny" }`). Installers now treat the `massa-ai-` prefix as the single ownership marker: uninstall removes navigator like every other generated agent, and a non-prefixed user agent is left alone (asserted in `apps/claude-plugin/__tests__/install.test.ts`).

### HRN-6: no gate protected any of the above

Severity: medium
Confidence: high
Location: `.github/workflows/skills.yml:21-47`; `scripts/__tests__/subagent-parity.test.ts`; `turbo.json` `lint`
Evidence: `skills.yml` validated only `name:`/`description:` in `skills/*/SKILL.md` — never the 12 charters under `skills/agents/*/SKILL.md`. The parity test compared generated bytes but never checked that a *dispatched* name resolves. `bun run lint` is a declared-but-unimplemented no-op (`CLAUDE.md:100`), so no linter existed either. Consequently HRN-1 through HRN-5 were all CI-green.
Impact: each defect class could regress silently; a broken dispatch name is invisible to byte-parity.
Simplest Fix Direction: one integrity test per defect class, each proven to fail on the pre-fix state.
Verification Suggestion: `bun run test:scripts`
Remediation: added `scripts/__tests__/skills-harness-integrity.test.ts` (14 assertions across 6 groups: dispatch resolution, no phantom roles, policy single-source, reference integrity, router-table↔disk, charter↔artifact permission + no-recursion). Extended `skills.yml` to validate `skills/agents/*/SKILL.md` including `metadata.model_hint` and `metadata.permission`.

### HRN-7: `test-engineer` and `documentation-agent` charters misdeclared their permission

Severity: medium
Confidence: high
Location: `skills/agents/test-engineer/SKILL.md:9`, `skills/agents/documentation-agent/SKILL.md:9` vs `scripts/generate-subagent-artifacts.ts:50-57`
Evidence: both charters declared `permission: read-only` while the generator hardcoded them into `WRITE_AGENTS`, shipping `tools: [... "Write","Edit"]` and `sandbox_mode = "workspace-write"`. The generator comment stated the divergence as intent: "Charters mark test-engineer + documentation-agent as read-only, but the spec grants them Write/Edit".
Impact: the charter — the artifact a human reads to reason about blast radius — understated the agents' actual write capability.
Simplest Fix Direction: make the charters declare `write` honestly; keep the scoped-write wording their bodies already carried.
Verification Suggestion: `bun test scripts/__tests__/skills-harness-integrity.test.ts -t "permission"`
Remediation: both charters now declare `permission: write`; the integrity test asserts charter permission matches Claude `tools` and Codex `sandbox_mode` for all 16 charters, so the two can no longer drift apart.

### HRN-8: non-deterministic and stale workflow instructions

Severity: low
Confidence: high
Location: `skills/massa-ai/workflows/exploration.md:24,101`; `workflows/spec-driven.md:148`; `references/spec-driven/sub-agents.md:77`
Evidence:
- The Knowledge Verification Chain said "follow this chain in strict order. Never skip steps" with Context7 MCP as step 3 and no rule for Context7 being absent — an unregistered MCP left the chain unsatisfiable, with either silent skipping or a stall.
- `exploration.md:101` still named "CodeNavi-style local notebooks", an upstream residual with no referent in this repo.
- The no-recursive-spawning rule existed only as orchestrator-side prose at `references/spec-driven/sub-agents.md:77`; no charter stated it, so nothing constrained a subagent that read only its own charter.
Impact: unsatisfiable-chain stalls, a dangling concept name, and an unenforced anti-recursion rule.
Simplest Fix Direction: explicit skipped-sensor rule; drop the residual; put the restriction in every charter.
Verification Suggestion: `bun test scripts/__tests__/skills-harness-integrity.test.ts -t "recursive"`
Remediation: both chain sites gained "an unavailable step is skipped with its reason recorded, never silently treated as answered"; the CodeNavi wording is gone; all 16 charters carry "Never spawn subagents and never load the `massa-ai` router", asserted by the integrity test. Atlassian-dependent workflows (`ticket.md:14`, `tdd.md:44`, `adr.md:28`, `implementation/implementation-audit.md:24`) already had absence fallbacks and were left unchanged.

## Ruled-Out Candidates

- **"`references/installation.md` is missing an installation guide, so `massa-ai-memory:340-401` fills a gap."** Disproved: `skills/massa-ai/references/installation.md` exists and covers install, config, validation, deployment, and client integrations. The skill section was duplication, not coverage.
- **"`skills/synapse-usage` uniquely documents the REST fallback, including auth."** Disproved: `references/synapse-policy.md:58-79` already had the REST fallback table *and* the `x-api-key` rule that `synapse-usage` omitted entirely. The skill's REST examples were unauthenticated.
- **"`sicad` in `benchmarks/needles/fixtures/` is a rename residual."** Disproved: `CLAUDE.md` records Sicad as a separate external benchmark corpus. Left alone.
- **"`install-skills.sh` needs an edit when two skill dirs are deleted."** Disproved: `scripts/install-skills.sh:190` iterates `for dir in "$SKILLS_ROOT"/*/`, so the set is discovered, not enumerated.
- **"`workflows/ticket.md` lacks an Atlassian-absence fallback."** Disproved: `ticket.md:14` already stops before approval-to-create and reports the unavailable capability.

## Scope And Evidence

Read in full: `skills/massa-ai/SKILL.md`, `references/agent-orchestration.md`, `references/context-firewall.md`, `references/synapse-policy.md`, `references/mcp-tools.md`, `references/installation.md`, `references/handoff-package.md`, `references/furps/analyst-role.md`, `workflows/exploration.md`, `workflows/the-fool.md`, `skills/AGENTS.md`, root `AGENTS.md`, `skills/massa-ai-memory/SKILL.md`, `skills/synapse-usage/SKILL.md`, `scripts/generate-subagent-artifacts.ts`, `scripts/__tests__/subagent-parity.test.ts`, `scripts/__tests__/validate-repository.test.ts`, `apps/{claude,cursor,codex,opencode}-plugin/install.sh`, `apps/claude-plugin/agents/massa-ai-navigator.md`, `.github/workflows/skills.yml`.

Searches: `grep -rn "Dispatch:" skills/` (24 blocks, 16 files); `grep -rhoE '^\s*name: "[a-z_]+"' apps/mcp-client/src/tool-defs/` (52 tools, set-differenced against the 21 in `massa-ai-memory`); `grep -rn "massa-ai-memory\|synapse-usage"` across `*.md|*.ts|*.sh|*.json|*.yml` for deletion blast radius; `grep -rn "navigator" apps/*/install.sh apps/*/__tests__/`.

Skipped checks: the behavioral end-to-end check — a fresh session actually spawning `massa-ai-plan-critic` and `massa-ai-investigator` — cannot run inside this session, because installed host agents are read at session start. Recorded as residual risk below. The two duplicate skills' git history was not mined for content that predates `4fa589b`; the deletion commit is kept separate so it can be reverted alone.

Residual risk: (1) dispatch names are proven to resolve to *shipped artifacts* by test, not to a live host registry — the behavioral check below closes that gap; (2) four `scripts/tests/verify-tree-sitter-*` tests fail in this worktree with "shared dist is missing" because it has no build output — unrelated to `skills/`, and they pass in the main checkout; (3) `apps/*/agents/` grew from 12-13 to 16 files per host, and installers are a public compatibility surface — uninstall now removes `massa-ai-navigator.md`, which previously survived.

## Verification/Test Fidelity Checklist

| Item | Evidence |
|---|---|
| Deterministic sensor | `bun test scripts/__tests__/skills-harness-integrity.test.ts`; `bun test scripts/__tests__/subagent-parity.test.ts`; `bun scripts/generate-subagent-artifacts.ts --check`; `bun run test:scripts`; `bun run test:plugins`; `bash scripts/tests/test-install-skills-check.sh`; `bash scripts/tests/test-mcp-single-writer.sh` |
| Result | pass (see the branch's verification run; `verify-tree-sitter-*` fails worktree-only for a missing build dist, and passes in the main checkout) |
| Coverage target | HRN-1 (dispatch resolution), HRN-2 (no phantom roles), HRN-3 (policy single-source), HRN-4 (reference integrity + skill set), HRN-5 (generator drift, all 4 hosts), HRN-6 (the gates themselves), HRN-7 (charter↔artifact permission), HRN-8 (no-recursion restriction) |
| Validation assets protected | `scripts/__tests__/subagent-parity.test.ts`, `scripts/__tests__/generate-subagent-artifacts.test.ts`, `scripts/__tests__/validate-repository.test.ts`, `apps/{claude,cursor}-plugin/__tests__/install.test.ts`, `apps/cursor-plugin/__tests__/manifest.test.ts`, `scripts/tests/test-mcp-single-writer.sh`, the 64 generated host artifacts |
| Skipped-check reason | `not-applicable` for the live-host dispatch check (a session cannot re-read its own agent registry); `tool-missing` for the worktree tree-sitter dist |
| Execution handoff | Each finding's Verification Suggestion above; the integrity test was proven discriminating by re-injecting a bare dispatch name, a `role-based (no charter)` cell, and a `plan_challenge:` block into root `AGENTS.md` and confirming exactly the three matching assertions fail |

## Execution Handoff

Remediation is complete on `harness/skills-audit-remediation`; this report is the record, not a backlog. Remaining owner actions, in order:

1. `bash scripts/install-skills.sh --apply --agent <host>` then `bash apps/<host>-plugin/install.sh --user` to pick up the 16 agents and the reduced skill set.
2. In a **fresh** session, run one delegating workflow (`exploration`) and one plan that triggers the Challenge gate; confirm the subagent spawns under the printed name instead of erroring on an unknown `subagent_type`. A green suite with a still-unresolvable name would be a false pass.
3. If a host still lists `massa-ai-navigator` from a pre-change install, it is now generator-owned; reinstalling overwrites it and uninstalling removes it.

Cautions: `apps/*/agents/**`, `apps/*/install.sh`, and `skills/AGENTS.md`'s bootstrap block are public compatibility surfaces. Any further charter change must be followed by `bun scripts/generate-subagent-artifacts.ts` plus `bun run test:scripts`, or the drift gate fails CI.
