# Spec — AGENTS.md bootstrap trim

- projectId: `massa-ai` · workflowSessionId: `feature-agents-md-cleanup`
- Workflow: feature (Standard tier — rule registry + tests + skills + docs)
- Branch: `feat/agents-md-bootstrap-trim` (worktree `/Users/luizmassa/Projects/massa-ai-feat-agents-md-bootstrap-trim`, base origin/main @ 058afeef)

## Problem

`skills/AGENTS.md` carries content the user no longer wants delivered or maintained
(user direction, 2026-09-23):

1. The `caveman` bootstrap rule.
2. The Plan Challenge Policy bootstrap rule — the gate is already carried by
   `skills/massa-ai/SKILL.md` §Plan Challenge Gate and each workflow's own step.
3. The registry sections "Mapping — Retired Agents → Current Agents", "How to Add an
   Agent", and "massa-ai Concepts". These sit outside the bootstrap block, so no
   bootstrap change is needed for them.
4. The Conversation Feedback Policy does not say that `Agent Started` must name the
   agent's model and effort, although `references/agent-orchestration.md`
   §Model/Effort Announcement already defines that rule. The policy block is the one
   always in context.

## Decisions (user, 2026-09-23)

- **D1 — Plan Challenge becomes fixed behavior.** `SKILL.md` §Plan Challenge Gate is
  the only source: lite by default, full for the existing trigger set. The Fool picks
  its mode automatically and revises the plan on valid critical/high findings. The
  `plan_challenge` YAML settings are removed. Prompt-level overrides still apply for
  the current turn.
- **D2 — Model/effort source stays the installed agent file**, as already defined in
  `agent-orchestration.md` §Model/Effort Announcement. That file is the rendered
  output of the active model profile. The AGENTS.md policy states the requirement and
  points to that definition.
- **D3 (precedent, not asked)** — `caveman` and `plan-challenge` join `RETIRED_RULE_IDS`,
  mirroring `persona-router` (commit 32e8cd1c). A persisted entry is skipped silently;
  `bootstrap enable|disable <id>` fails with "was retired".

- **D4 (user, 2026-09-23, after lite-gate finding F3)** — Canonical trigger set is
  SKILL.md's: `feature`/`refactor` start lite. Full = `spec-driven`, `design`,
  `create-adr`, `create-rfc`, `create-tdd`, explicit challenge, the routing rule-5 risk
  domains plus security and data loss, >5 files/modules, or lite escalation.
- **D5 (user)** — `workflows/design.md` gains a Plan Challenge Gate step (it is in the
  full list but ran no gate).
- **D6 (user)** — References quick wins: delete `spec-driven/lessons.md` and
  `furps/analyst-role.md` (repoint consumers); align `lessons.md` dual-write text with the
  real silent-drop behavior; drop the false "mirrors this list" claim at
  `agent-orchestration.md:174`.
- **D7 (user)** — ~~`references/hook-enforcement.md` moves to `docs/`~~ **Resolved (user,
  2026-09-23): deleted.** During W1 all six hooks it documented (`stop_evidence_gate`,
  `gateguard`, `config_protection`, `observe_runner`, `continuous_learning_evaluate`,
  `precompact_save_state`) were found absent from the codebase; the user chose deletion over
  a move. Its still-true contracts are sensed in `lessons.md` / `memory-policy.md`.
- **D8 (user)** — Deduplicate, same PR: one retrieval order owned by
  `codebase-investigation.md`; `spec-driven/coding-principles.md` keeps only its unique
  sections; partial summaries slimmed (`architecture-lenses.md`,
  `design-implementation.md` + platform contracts reachable via
  `repository-detection.md`, `pr-task-fix.md`, `decision-engine.md:59-73`, one owner for
  STATE precedence); `conversation-feedback.md` stops restating the AGENTS.md policy.

## Requirements

- **R1** — `skills/AGENTS.md` has no `caveman` span, no `plan-challenge` span, and none
  of the three registry sections. The trailing validator-anchor comment drops
  `mapping table`.
- **R2** — `BOOTSTRAP_RULE_IDS` / `BOOTSTRAP_RULES` hold six rules;
  `RETIRED_RULE_IDS` holds `persona-router`, `caveman`, `plan-challenge`.
- **R3** — No skill file directs the reader to a Plan Challenge Policy in `AGENTS.md`,
  and none uses the removed setting names (`plan_challenge`, `full_gate`,
  `serious_findings`, `mode: ask`) as configuration. `SKILL.md` §Plan Challenge Gate
  is self-contained.
- **R4** — The AGENTS.md Conversation Feedback Policy requires `Agent Started` to name
  model and effort, cites `agent-orchestration.md` §Model/Effort Announcement, and its
  example shows an `Agent Started` line carrying both.
- **R5** — CLI help, `skills/bootstrap/SKILL.md`, README, FEATURES, CHEATSHEET, and
  CLAUDE.md list six rule ids and cite no removed section.
- **R6** — CHANGELOG `[Unreleased]` entry under `### Removed` (and `### Changed` for R4),
  marked breaking for the `bootstrap enable|disable caveman|plan-challenge` CLI change and
  the silently dropped persisted `plan-challenge: false` opt-out.
- **R7** — `workflow-harness-contract.test.ts`'s gate-population parser reads SKILL.md
  §Plan Challenge Gate (Lite ∪ Full workflow names, unabbreviated) instead of AGENTS.md;
  every named workflow, `design.md` included, carries the gate step. SKILL.md stays
  within its 13,000 B budget.
- **R8** — References changes D6–D8 land with the tests that pin them updated, not
  deleted; no reference cites a moved or deleted file.

## Acceptance Criteria

- **AC1** — `git grep -n -E 'rule:(caveman|plan-challenge)|Plan Challenge Policy|Retired Agents|How to Add an Agent|massa-ai Concepts' skills/AGENTS.md` returns nothing.
- **AC2** — `massa-ai-config bootstrap enable caveman` and `… plan-challenge` fail
  naming the id as retired; a persisted `bootstrap.rules.caveman: false` renders the
  six-rule contract with no "Ignored persisted rule state" line (unit tests in
  `packages/shared/src/bootstrap/__tests__/`).
- **AC3** — `git grep -n -E 'Plan Challenge Policy|plan_challenge|serious_findings|full_gate' skills/` returns nothing.
- **AC4** — The Conversation Feedback span of `skills/AGENTS.md` contains an
  `Agent Started` example line naming a model and an effort, and a rule citing
  `Model/Effort Announcement`; a test asserts both.
- **AC6** — `git grep -n -E 'spec-driven/lessons\.md|analyst-role|references/hook-enforcement' -- skills/` returns nothing; `hook-enforcement.md` exists nowhere (amended per D7 resolution).
- **AC7** — Only `codebase-investigation.md` states the ordered retrieval list (sensor:
  `validate-repository.test.ts` "retrieval order has one owner", ≥3 distinct tools in
  numbered items);
  `mcp-tools.md` and `spec-driven/code-analysis.md` point to it (keeping code-analysis's
  ast-grep tier as a delta).
- **AC5** — Gates green in the worktree: `bun run test:scripts`,
  `packages/shared` tests, both `config-cli-bootstrap` suites, `bun run lint`,
  `bun run generate:artifacts --check`.

## Execution plan

**Phase 1 — bootstrap trim (main agent, one commit per task; T1 is atomic because
`render.ts` rejects a stale rule marker and a registry rule with no span):**

- T1 — `rules.ts` six ids + `RETIRED_RULE_IDS` += caveman, plan-challenge; `state.ts:154`
  wording; `skills/AGENTS.md` spans removed; every bootstrap test repointed (shared
  `__tests__/{rules,state,engine,format,render}`, both `config-cli-bootstrap`,
  `profile-cli-parity`, `bootstrap-source-contract`, `bootstrap-skill-contract`,
  `render-bootstrap`, `validate-repository:97`, `skills-harness-integrity:12,266`,
  `test-install-skills-bootstrap-file.sh`); example toggle id `caveman` → `english-code`;
  retired-id sensors for both new ids. Both `config-cli.ts` help examples.
- T2 — Plan Challenge fixed (D1/D4/D5): SKILL.md §Plan Challenge Gate self-contained
  (byte budget measured), the-fool.md §Configuration + steps 6/10, `design.md` gate step,
  "configured" wording in create-adr/rfc/tdd, spec-driven, refactor; agent-orchestration
  :355-358; `workflow-harness-contract` parser repointed to SKILL.md;
  `workflow-dispatch-mapping:195` repointed.
- T3 — Registry sections removed (Mapping, How to Add, Concepts, anchor comment);
  `workflow-dispatch-mapping:293,331` sanction row + guard-the-guard retargeted to the
  surviving legacy table in agent-orchestration.md.
- T4 — Conversation Feedback: AGENTS.md rule + `Agent Started` example with model/effort,
  citing agent-orchestration §Model/Effort Announcement (no `model: inherit` /
  `effort: inherit` marker restated — S8); agent-orchestration:285 example gains
  model/effort; `conversation-feedback.md` slimmed to what the policy does not say (D8);
  :174 false claim removed (D6). Sensor for AC4.
- T5 — Docs: README, FEATURES, CHEATSHEET, CLAUDE.md, root AGENTS.md:97-110,
  docs/removed-features.md, skills/bootstrap/SKILL.md; "eight" → "six" everywhere.

**Phase 2 — references cleanup (D6–D8), after Phase 1 commits; parallel
`senior-engineer` workers, disjoint write sets under `skills/` and `docs/` only, no
test edits and no commits — main agent fixes pinned tests and commits per group:**

- W1 — delete `spec-driven/lessons.md`, `furps/analyst-role.md` (+ consumers);
  `lessons.md` dual-write text; delete `hook-enforcement.md` (D7 resolution).
- W2 — retrieval order single owner (`codebase-investigation.md`, `mcp-tools.md`,
  `spec-driven/code-analysis.md`); `spec-driven/coding-principles.md` slimmed.
- W3 — `architecture-lenses.md`, `design-implementation.md` + `repository-detection.md`,
  `pr-task-fix.md`, `decision-engine.md`, STATE precedence owner
  (`artifact-persistence.md` / `spec-driven/artifact-store.md` / `spec-driven/memory.md`).

**Phase 3 — close-out:** CHANGELOG (Removed + Changed, breaking notes), full gates,
`code-reviewer` diff audit, `code-reviewer` verify, `validation.md`, PR.

## Plan Challenge outcome (full, pre_mortem — judge, 2026-09-23)

Revisions adopted before the first edit:

- **C1 → D9 (user)** — The retired-agent mapping table is deleted, not moved. The
  retired-name sweep in `workflow-dispatch-mapping.test.ts` loses its AGENTS.md sanction
  row, and its guard-the-guard asserts against a synthetic fixture naming all 14 retired
  names. Citing sites repointed or dropped: `agent-orchestration.md:167-168`, root
  `AGENTS.md:31`, `FEATURES.md:371,1338`, `docs/CHEATSHEET.md:391`,
  `docs/removed-features.md:89,127`. Added check: `git grep -n -i 'mapping table' -- AGENTS.md FEATURES.md docs skills CLAUDE.md`
  returns no pointer to `skills/AGENTS.md`.
- **C2** — W2 builds the retrieval owner as the **union** of `codebase-investigation.md`,
  `mcp-tools.md:149-175` and `spec-driven/code-analysis.md:7-22` (a before/after step table in
  the PR body). Tool parameters and budgets stay in `mcp-tools.md` as a schema delta. W2's
  write set adds `skills/agents/code-explorer/SKILL.md:77`, `workflows/exploration.md`,
  `synapse-policy.md` and `spec-driven/validate.md`. W1 does not touch `validate.md` or
  `spec-driven.md`; the main agent applies W1's two repoints there. AC7 widens to a
  `skills/`-wide sweep.
- **C3** — W3 keep-list: the platform→contract surface map in `design-implementation.md:17-21`
  and the non-mobile rule `:25-27`; `decision-engine.md:59-73` content that `debug.md:52`
  loads (only the text duplicated in `debug-diagnosis-loop.md` goes); the three
  `spec-driven/memory.md:22` precedence rules move into `artifact-persistence.md` before
  memory.md is slimmed. New sensor: every `mobile-figma-matcher/<platform>.md` is named
  by file on the Figma load path.
- **C4** — R6 adds an upgrade note (re-render with `install-skills.sh --apply`). Accepted
  risk: a persisted `plan-challenge: false` silently returns to gate-on; the owner's
  `bootstrap.rules` is `{}`.
- **C5** — `design.md` gate step sits after the Design-To-Code Mapping Matrix and before
  any edit or `designer` dispatch. `scripts/skill-protected-literals.ts` inventory runs
  before Phase 2. Phase 2 stays in this PR (user, earlier) with one revertible commit per
  W-group and a unique-content-preserved table in the PR body.
- Low: T2 also covers `create-rfc/quality-and-lifecycle.md:49` and
  `create-tdd/quality-and-lifecycle.md:34`. (The `docs/hook-enforcement.md` header item is
  void: the file was deleted, D7 resolution.)
