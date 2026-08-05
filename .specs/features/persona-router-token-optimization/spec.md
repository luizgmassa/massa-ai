# Persona Router Token Optimization Specification

Slug: `persona-router-token-optimization` · Workflow: spec-driven (Large) ·
Session: `spec-persona-router-token-optimization`

## Problem Statement

Persona routing consumes ~25% of the user's Claude Code token usage. Measured per
coding session: `persona-router/SKILL.md` 13,316 B (~3.3k tokens) + full
`catalog.json` read 8,871 B (~2.5k tokens) + selected persona prompt 4,929–8,308 B
(~1.6–2k tokens) + optional workspace-doc inspection — ~7.5–10k tokens loaded at
turn 1 and re-billed every turn. On top of that, every skill, agent, and command is
registered twice on the user's machine (user-level installs from
`install-skills.sh`/`install-agents.sh` AND the `massa-ai@massa-ai` local plugin
pointing at this checkout), duplicating ~2.5–3k tokens of descriptions in every
session's system prompt. The user-level agent roster is also stale (16 agents, has
retired `massa-ai-handoff-writer`, missing `judge`/`meta-judge`).

## Goals

- [ ] Routing chain cost per session drops from ~8k to ~2k tokens (pinned-project path).
- [ ] Exactly one registration surface per skill/agent/command on the user's machine.
- [ ] Regression guards prevent silent regrowth and re-duplication.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Slimming `skills/massa-ai/SKILL.md` (20,514 B) | Separate feature; only a freeze ceiling ships here (PRT-07) |
| Compressing massa-ai workflow/reference files | Same |
| `persona_router.enabled: off` default | Conflicts with pin fast path; user chose pin approach |
| Other machines / Codex/Cursor/OpenCode user-level config | Only this machine's Claude host is in evidence; repo-side generators cover all hosts |
| Host-side system-prompt skill-description overhead | Controlled by Claude Code, not this repo |
| Renaming/removing personas from the catalog | Catalog membership unchanged; only its shape changes |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Pin syntax must not retrigger `skills-harness-integrity.test.ts` | Pin is per-project data (single documented line in project `AGENTS.md`), not a `persona_router:` policy block; exact syntax decided in Design | Integrity test forbids policy-block restatement in repo AGENTS.md | y (structural requirement wins) |
| Catalog schema bump | `schema_version: 2`, two-tier (index + per-persona signals) | SKILL.md validates schema version; a shape change without a bump would validate incorrectly | y |
| Prompt-compression quality bar | Byte ceiling + all original top-level section themes retained per prompt | Quality is otherwise unmeasurable; skeleton retention keeps persona voice auditable | y |
| Dedupe direction | Keep user-level installs; disable `massa-ai@massa-ai` plugin registration | User decision 2026-08-04; un-namespaced dispatch names (`massa-ai-<role>`) must keep resolving | y (user) |
| Scope | Fixes 1–7 all in; both guard gaps in | User selected core set + prompt compression + route memory | y (user) |
| User-machine mutations run in Execute | Plugin disable, installer refresh, symlink deletion are reversible; run with before/after evidence, no per-step prompt | Autonomy contract; all reversible | y |
| Route-memory verification | MCP unreachable this session; AC verified as documented contract + graceful-degradation text, not live round-trip | Cannot exercise live `remember`/`recall` | y |
| Live-session routing walkthrough needs a fresh session | Skills load at session start, not hot-reload; the PRT-02 walkthrough is recorded as restart-gated — validated in a new session or marked pending-restart in validation.md (Plan Challenge F6) | Same-session walkthrough would read stale in-memory instructions | y |
| Stale plugin cache (`1.2.1`) | Plugin is disabled and its enablement re-verified last (F1 fix); cache dir left in place — inert once disabled | Deleting the cache is the host CLI's job (`claude plugin uninstall`); out of evidence scope (Plan Challenge F5) | y |

**Open questions:** none — all resolved or logged above.

## User Stories

### P1: Cheap routing on a pinned project ⭐ MVP

As the repo owner, I want persona routing on a pinned project to cost ~2k tokens
instead of ~8k, so routing overhead stops dominating short sessions.

**Acceptance Criteria** (PRT-02, PRT-03, PRT-04):

1. WHEN a project `AGENTS.md` carries a valid persona pin THEN the router SHALL
   read only the pinned persona's prompt file — no catalog-signals load, no memory
   recall, no workspace-doc inspection, no prompt classification.
2. WHEN the pin value is `no_persona` THEN the router SHALL complete silently
   with no persona file reads.
3. WHEN the pin names an id absent from the catalog index THEN the router SHALL
   report the invalid pin and continue with the normal (unpinned) workflow.
4. WHEN this repo's `AGENTS.md` is read THEN it SHALL pin
   `context-skill-harness-engineer-architect`, and
   `scripts/__tests__/skills-harness-integrity.test.ts` SHALL still pass.
5. WHEN persona-router artifacts are measured THEN `SKILL.md` SHALL be ≤ 5,000 B
   and `catalog.json` ≤ 2,500 B.

**Independent Test**: byte measurements + a routing walkthrough over the pinned
repo showing the only persona file opened is the pinned prompt.

### P1: Single registration surface ⭐ MVP

As the machine owner, I want each skill/agent/command registered once, so system
prompts stop carrying duplicate descriptions.

**Acceptance Criteria** (PRT-01):

1. WHEN dedupe is applied THEN `~/.claude/settings.json` SHALL NOT enable
   `massa-ai@massa-ai`, `~/.claude/plugins/installed_plugins.json` SHALL no
   longer resolve an enabled `massa-ai@massa-ai`, and the hooks pointing at
   `apps/claude-plugin/hooks/massa-ai-hook.ts` SHALL be unchanged.
2. WHEN user-level installs are refreshed THEN `~/.claude/agents/` SHALL contain
   exactly the current 17-agent roster (`judge` and `meta-judge` present,
   `handoff-writer` absent) AND `~/.claude/commands/massa-ai-*.md` SHALL exist
   with current content (the surviving command syntax is `/massa-ai-<cmd>`).
3. WHEN `~/.claude/skills/` is listed THEN the broken `massa-ai-memory` and
   `synapse-usage` symlinks SHALL be gone.
4. WHEN any installer that can register plugins runs during dedupe THEN it
   SHALL run with plugin registration suppressed
   (`MASSA_AI_SKIP_PLUGIN_REGISTRY=1`), and the plugin-disable step SHALL be
   re-verified after the last installer invocation (Plan Challenge F1).
5. WHEN dedupe evidence is recorded THEN `~/.claude/settings.json` content
   SHALL be quoted only for the `enabledPlugins` and `hooks` keys — never a
   raw file dump (the file carries a live OAuth token; Plan Challenge F4).

**Independent Test**: file-level inventory diff before/after (redacted per AC5).

### P2: Two-tier catalog and slim artifacts

As a session, I want signal detail loaded only when classification actually runs.

**Acceptance Criteria** (PRT-04, PRT-03, PRT-05):

1. WHEN `catalog.json` (schema_version 2) is read THEN it SHALL contain per entry
   only `id`, `display_name`, `aliases`, `summary`, `prompt_path`, `signals_path`.
2. WHEN routing resolves via explicit user selection or a valid pin THEN no
   `signals_path` file SHALL be read; WHEN classification runs THEN signals SHALL
   be loaded from `signals_path` files.
3. WHEN the router meets a catalog with `schema_version` other than 2 THEN it
   SHALL report found vs supported and continue without a persona.
4. WHEN persona prompts are measured THEN each `personas/*.md` prompt SHALL be
   ≤ 4,500 B and SHALL retain its original top-level section themes.
5. WHEN normative content is moved out of `SKILL.md` THEN each moved section SHALL
   exist under `skills/persona-router/references/` with an explicit load condition
   named in `SKILL.md`.

### P2: Cross-session route memory

**Acceptance Criteria** (PRT-06):

1. WHEN an unpinned route succeeds via inference THEN the router contract SHALL
   direct storing a `pattern` memory keyed `persona-route:<projectId>`.
2. WHEN a later session recalls that memory and the id is valid in the catalog
   index THEN the router SHALL skip doc inspection and classification.
3. WHEN the massa-ai server is unreachable THEN routing SHALL proceed without
   memory reads/writes and without error surfacing to the user.

### P2: Regression guards

**Acceptance Criteria** (PRT-07, PRT-08):

1. WHEN `bun run test:scripts` runs THEN a size-budget test SHALL fail if:
   `skills/persona-router/SKILL.md` > 5,000 B; `catalog.json` > 2,500 B; any
   `personas/*.md` prompt > 4,500 B; `skills/massa-ai/SKILL.md` > 21,000 B
   (freeze ceiling); any `skills/persona-router/references/*.md` > 8,000 B.
2. WHEN the size-budget test is introduced THEN it SHALL have been observed red
   against a deliberately oversized fixture or pre-slim tree before first green.
3. WHEN `install-skills.sh --check` runs on a machine where install-state
   records `skillsOwner: repo` for claude AND `~/.claude/settings.json` enables
   `massa-ai@massa-ai` THEN it SHALL report the double surface and exit non-zero.
4. WHEN only one surface is active THEN `--check` SHALL keep its current exit
   behavior.

### P1: Parity and delivery (cross-cutting)

**Acceptance Criteria** (PRT-09):

1. WHEN any `skills/` source changes THEN all four host bundles SHALL be
   regenerated and `bun scripts/generate-skill-artifacts.ts --check` SHALL pass.
2. WHEN the PR is assembled THEN `CHANGELOG.md` `[Unreleased]` SHALL carry the
   entries (Changed; Added for the new gates).
3. WHEN `bun run test:scripts` and `bun run lint` run THEN they SHALL pass.

## Edge Cases

- WHEN a pin line exists but the catalog is missing/invalid THEN routing reports
  unavailable and continues without a persona (existing failure contract holds).
- WHEN a `signals_path` file is missing during classification THEN that persona
  is still a candidate via summary/aliases; the missing file is reported.
- WHEN `~/.claude/settings.json` has no `enabledPlugins` key THEN `--check`'s
  double-surface probe treats the plugin as disabled (no false positive).
- WHEN install-state.json is absent THEN the double-surface probe is skipped
  (unknown owner ≠ double surface).
- WHEN a remembered route names a persona absent from the v2 index THEN it is
  discarded as stale (existing rule, now against the index).

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PRT-01 | P1 single surface | Design | Pending |
| PRT-02 | P1 pinned routing | Design | Pending |
| PRT-03 | P1/P2 slim SKILL.md | Design | Pending |
| PRT-04 | P2 two-tier catalog | Design | Pending |
| PRT-05 | P2 prompt compression | Design | Pending |
| PRT-06 | P2 route memory | Design | Pending |
| PRT-07 | P2 size-budget gate | Design | Pending |
| PRT-08 | P2 double-surface check | Design | Pending |
| PRT-09 | P1 parity/delivery | Design | Pending |

**Coverage:** 9 total, 0 mapped to tasks yet.

## Implicit-Requirement Sweep (Large — all dimensions)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | Pin id validated against catalog index (PRT-02 AC3); size budgets are explicit bounds (PRT-07) |
| Failure / partial-failure | Catalog/schema/signals-missing paths defined (PRT-04 AC3, Edge Cases); MCP-down path (PRT-06 AC3) |
| Idempotency / retry | Installer `--apply` re-run and dedupe re-run are no-ops by existing installer contract; verified in Execute evidence |
| Auth boundaries & rate limits | N/A because all changes are local files and prose contracts; no network surface |
| Concurrency / ordering | N/A because single-user local config writes; no concurrent writers introduced |
| Data lifecycle / expiry | Stale route memories discarded against current index (Edge Cases); stale symlinks deleted (PRT-01) |
| Observability | `--check` names both surfaces on failure (PRT-08); conversation-feedback lines at workflow boundaries |
| External-dependency failure | massa-ai MCP unreachable → silent skip (PRT-06 AC3) |
| State-transition integrity | `install-state.json` v2 `skillsOwner`/`platforms` fields round-tripped unchanged; only read by the new probe |

## Success Criteria

- [ ] Pinned-project routing walkthrough opens exactly one persona file.
- [ ] Byte budgets met and enforced by a gate that was observed red first.
- [ ] One registration surface on this machine; roster current at 17.
- [ ] All parity/lint/test gates green; CHANGELOG updated.

## Verification Approach

Deterministic: `wc -c` measurements in the gate test; `generate-skill-artifacts.ts
--check`; shell test for `--check` double-surface probe with fixture configs;
`skills-harness-integrity.test.ts` unchanged and green; file inventories for the
user-machine dedupe. Independent verification-agent run at Execute end
(author ≠ verifier), spec-anchored + discrimination sensor.
