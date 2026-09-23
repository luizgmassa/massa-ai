# Agent Roster Consolidation Specification

- Feature slug: `agent-roster-consolidation`
- workflowSessionId: `spec-agent-roster-consolidation`
- projectId: `massa-ai`
- Branch / worktree: `feat/agent-roster-consolidation` @ `origin/main` `f582b602` (v1.60.1), `~/Projects/massa-ai-wt-roster`
- Scope class: **Large** (≈300 tracked files, 4 host generators, 4 plugin installers, profile-switch engine, one runtime hook, ~60 dispatch blocks, 40 workflow files, ~80 test suites)

## Problem Statement

The massa-ai harness has accumulated three overlapping layers of role routing: a persona
catalog with its own router skill and bootstrap rule, 18 sub-agent charters whose
responsibilities overlap (three separate judges, two explorers, five read-only reviewers,
two requirement analysts), and 40 workflows, some of which are niche (`maestro*`), a
catch-all (`general`), or named inconsistently with the artifact they produce (`adr`,
`rfc`, `tdd`, `ticket`, `to-prd`, `discovery`). Every generated sub-agent also carries a
`massa-ai-` name prefix that is noise at dispatch time.

The owner wants a smaller, sharper surface: no personas, 7 sub-agents with clear
ownership, artifact-producing workflows named `create-*`, and unprefixed agent names —
without losing the ability of installers to tell massa-ai's files apart from a user's
own files in shared host directories.

## Goals

- [ ] The persona feature no longer exists in the product, its generated bundles, its installers, or its bootstrap contract.
- [ ] The shipped roster is exactly 7 agents: `builder`, `code-explorer`, `code-reviewer`, `designer`, `judge`, `product-manager`, `test-engineer`.
- [ ] Every workflow dispatches only roster agents, per the mapping in ROS/WFL requirements.
- [ ] The workflow inventory drops `general` and `maestro*`, and six workflows are renamed.
- [ ] Generated agents carry no `massa-ai-` prefix on any host, and installers identify owned files by an explicit ownership marker, never overwriting or deleting a user's file.
- [ ] An already-installed machine upgrades cleanly: legacy `massa-ai-*` agents and the `persona-router` skill are pruned.

## Out of Scope

| Item | Reason |
| --- | --- |
| Dropping the `massa-ai-` prefix from slash commands (`/massa-ai-<stem>` file route, OpenCode `command/massa-ai-*.md`) or from the hook binary `massa-ai-hook` | Request item 14 scopes the prefix removal to subagents |
| Deprecated aliases for old workflow names | User decision: hard rename |
| Widening the `design` workflow beyond mobile UI | Request item 4 changes the agent's charter and dispatch, not the workflow's target platform |
| A replacement fallback workflow for `general` | User decision: no workflow when nothing matches |
| Rewriting historical `.specs/` artifacts, `CHANGELOG.md` history, or `.ua/` | Historical records |
| Removing the red-team "adversary personas" in `references/the-fool/` | Not the persona feature; a critique technique |
| Model-profile registry changes beyond what renamed agents require | Registry holds no agent list |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| A1 Fallback when no workflow matches | No workflow file is loaded; the main agent works under the router's Core Contract (recall, verify, Evidence Gate) | User decision (question round 1) | y |
| A2 Collision policy in shared host agent dirs | Marker ownership: write only when the target is absent or massa-ai-owned; skip a foreign same-named file with a warning; prune legacy `massa-ai-*` owned files on upgrade | User decision (round 1) | y |
| A3 Old workflow command names | Hard rename, no aliases; CHANGELOG records it | User decision (round 1) | y |
| A4 Workflow | `spec-driven` (switched from `feature`) | User decision (round 1) | y |
| A5 Name of merged investigator+navigator | `code-explorer` on every host (avoids Codex built-in `explorer`; preserves the "no intentional override" rule) | User decision (round 2) | y |
| A6 "designer workflow" in request item 4 | The existing `design` workflow (the only candidate) | Only workflow whose stem matches | n — trivial, recorded |
| A7 `requirements-fix` agent | `builder` (unchanged); request item 5 lists five fix families and is silent on requirements-fix | Keeps current behavior; the fix-family pattern is builder | n — recorded |
| A8 `mobile-figma-fix` implementer | `designer` implements every UI-layer MFM fix; `builder` remains only for MFM findings whose fix needs non-UI wiring (designer is UI-layer-only) | Request item 4 + plan-challenge C4 (no implementer for non-UI wiring otherwise) | n — recorded |
| A9 `code-explorer` tool policy | Read-only via the Claude denylist (`disallowedTools: Write, Edit, NotebookEdit`) and default OpenCode read-only bash; the `navigator` allowlist exception and its `pwd`-only bash override are retired; index-first behavior moves into charter prose | The merged role needs investigator's broader read tooling; the allowlist existed only for navigator | n — recorded |
| A10 `judge` permission | `write`, restricted by charter to its own report file in `scorer` mode; `spec-author` and `plan-critique` modes write nothing. **Accepted risk:** the Plan Challenge critic loses tool-level read-only enforcement (prose-only restriction) | One charter has one permission; the debate channel is the filesystem | n — recorded (plan-challenge C4) |
| A11 `code-reviewer` permission | `read-only` (all five sources were read-only) | Direct inheritance | n — recorded |
| A12 Persisted `bootstrap.rules["persona-router"]` in a user's `config.json` | Silently ignored as a retired id — no per-apply warning, key left in place | Existing tolerance already skips it; the warning would print on every install forever | n — recorded |
| A13 Installed `persona-router` harness skill on a host | Removed by the plugin installer only when `install-state.json` records it among that host's plugin-installed skills; repo route already prunes by marker | Ownership proof without a new marker | n — recorded |
| A14 Ownership marker for Claude/Cursor `.md` agents | Body comment `<!-- massa-ai-owned: true -->` (the existing OpenCode marker), first body line; Codex keeps `# massa-ai-owned` | Cursor frontmatter schema forbids extra keys; one marker text for all `.md` hosts | n — recorded |
| A16 Installed `MASSA-AI.md` after a plugin-only update | Plugin installers do not render `MASSA-AI.md` today (only `install-skills.sh` does); a machine updated only through `claude plugin update` keeps the old contract text until `install-harness.sh` / `install-skills.sh --apply` or a `massa-ai-config bootstrap enable|disable` re-renders it. **Accepted risk**, stated as an upgrade note in CHANGELOG | Pre-existing delivery gap for any contract change, not introduced here | n — recorded (plan-challenge C5) |
| A18 Dispatch interception on the Claude file route and non-Claude hosts | **Accepted risk:** no agent namespace exists there; a user agent that won a collision skip receives massa-ai dispatches; the install-time skip warning is the signal | Only Claude's plugin route has a namespace | n — recorded (lite re-gate) |
| A17 Legacy agent names for upgrade pruning | Exactly `massa-ai-<one of the 18 pre-change charter names>`, never `massa-ai-*` | Codex AC-02.3 (`test-installer-prune-codex.sh:78-86`) requires an unmarked user `massa-ai-mine.toml` to survive | n — recorded (plan-challenge C1) |
| A19 Reference/doc renames | Included per user annotation (2026-09-23); `adr-authoring.md` → `create-adr.md` (single file, so no directory) | User review of spec.md | y |
| A15 CHANGELOG classification | `### Removed` + `### Changed` under `[Unreleased]` (minor bump per CONTRIBUTING table); entries call out the breaking renames | Repo release rules | n — recorded |

**Open questions:** none — all behavior-changing decisions were resolved with the user; the rest are recorded defaults above.

---

## User Stories

### P1: Personas removed ⭐ MVP

**User Story**: As the harness owner, I want the persona feature gone so that role
routing lives in one place (workflows + sub-agents).

**Acceptance Criteria**:

1. The repository SHALL contain no `skills/persona-router/` directory and no `skills/massa-ai/personas/` directory.
2. The bootstrap rule registry (`BOOTSTRAP_RULE_IDS`) SHALL contain exactly 8 ids, none of them `persona-router`, and `skills/AGENTS.md` SHALL contain no `massa-ai:rule:persona-router` marker, no `persona_router:` policy block, and no `persona_pin` contract.
3. WHEN `bun run generate:artifacts` runs THEN no `apps/*-plugin/skills/persona-router/` directory SHALL exist afterwards, even if one existed before.
4. The four plugin installers and `install-skills.sh` SHALL install exactly the harness skills `massa-ai`, `profile`, `bootstrap`.
5. WHEN a plugin installer installs or uninstalls on a host whose `install-state.json` records `persona-router` among that host's plugin-installed skills THEN it SHALL delete that host's installed `persona-router` skill directory.
6. IF a user's `config.json` persists `bootstrap.rules["persona-router"]` THEN bootstrap apply SHALL render the 8-rule contract and SHALL NOT print an "Ignored persisted rule state" warning for that id.
7. No agent charter, workflow, or reference SHALL mention a `persona` capability-packet field, a persona catalog, or the persona router.
8. WHEN a user prompt starts with `/persona` THEN the observation extractor SHALL NOT classify it as a role signal by that prefix alone.

### P1: Seven-agent roster ⭐ MVP

**User Story**: As a workflow author, I want 7 sub-agents with non-overlapping ownership
so that every dispatch has one obvious target.

**Acceptance Criteria**:

1. `skills/agents/` SHALL contain exactly the directories `builder`, `code-explorer`, `code-reviewer`, `designer`, `judge`, `product-manager`, `test-engineer`, each with a `SKILL.md` whose frontmatter `name` equals the directory.
2. The `code-explorer` charter SHALL cover index-first lookup (navigator) and source-first flow tracing, dependency mapping, and impact estimation (investigator), and SHALL be read-only.
3. The `judge` charter SHALL define three modes selected by the capability packet — `spec-author` (meta-judge), `scorer` (debate judge), `plan-critique` (plan-critic, lite and full) — each with its former output contract.
4. The `product-manager` charter SHALL cover per-dimension FURPS+ analysis (furps-analyst) and ambiguity/gap/contradiction analysis of requirements (requirements-analyst), and SHALL be read-only.
5. The `code-reviewer` charter SHALL define lenses/modes covering diff review (reviewer), independent verification with the Verification Ladder and discrimination sensor (verification-agent), findings-only audit lenses bugs/architecture/security/code-quality/performance (audit-specialist), architecture guidance (architecture-specialist), and mobile platform guidance (mobile-specialist), and SHALL be read-only.
6. The `designer` charter SHALL state it both reads (audits/conformance) and writes (implements) UI from Figma, screenshots, or other supplied design direction.
7. No tracked file outside `.specs/`, `.ua/`, and `CHANGELOG.md` history SHALL reference `planner`, `context-curator`, `documentation-agent`, `investigator`, `navigator`, `meta-judge`, `plan-critic`, `furps-analyst`, `requirements-analyst`, `verification-agent`, `mobile-specialist`, `architecture-specialist`, `audit-specialist`, or `reviewer` as an agent name, except a single old→new mapping table in `skills/AGENTS.md`.
8. Every hardcoded specialist count in docs, installers, manifests, and tests SHALL read 7.
9. The output fields declared by the 14 retired charters at `f582b602` (frozen as a committed fixture) SHALL each appear in the merged charter that absorbed them, asserted by a test (covers judge YAML reply block, plan-critic `escalate_to_full`, furps-analyst `FR-<letter>-<N>`, verification-agent verdict/gap list, audit-specialist audit-report-io findings).

### P1: Workflow dispatch mapping ⭐ MVP

**User Story**: As a user running a workflow, I want each workflow to delegate to the
agent that owns that kind of work.

**Acceptance Criteria**:

1. The workflows `architecture-audit`, `bugs-audit`, `implementation-audit`, `code-quality-audit`, `security-audit` SHALL dispatch `code-reviewer` (with the matching lens) for the correctness, architecture, code-quality, security, and performance lenses, and `implementation-audit` SHALL dispatch `product-manager` (`audit` mode) for its Requirements lens and `test-engineer` (`audit` mode) for its Tests lens.
2. The workflows `architecture-fix`, `bugs-fix`, `implementation-fix`, `code-quality-fix`, `security-fix` SHALL dispatch `builder` for implementation and `code-reviewer` for review and verification.
3. The workflows `tests-audit` and `tests-fix` SHALL dispatch `test-engineer` for the audit and for the fix implementation.
4. The workflows `furps-refinement` and `requirements-audit` SHALL dispatch `product-manager`.
5. The workflows `design`, `mobile-figma-audit`, and `mobile-figma-fix` SHALL dispatch `designer` unconditionally (not gated on "task touches a screen"), and `mobile-figma-fix` SHALL dispatch `builder` only for an MFM finding whose fix requires non-UI-layer changes.
6. The Plan Challenge gate (router + `skills/AGENTS.md` + `the-fool`) SHALL dispatch `judge` in `plan-critique` mode.
7. `judge-with-debate` SHALL dispatch `judge` in `spec-author` mode once and in `scorer` mode for the panel.
8. The Independent Verification Mandate SHALL dispatch `code-reviewer` in verification mode.
9. Every `**Dispatch: `<name>`**` block in `skills/` SHALL name an unprefixed roster agent that exists as a generated agent file in all four host bundles.

### P1: Workflow inventory ⭐ MVP

**User Story**: As a user, I want the workflow list to contain only workflows I use, named
after what they produce.

**Acceptance Criteria**:

1. `skills/massa-ai/workflows/` SHALL NOT contain `general.md`, `maestro/maestro.md`, `maestro/maestro-audit.md`, or `maestro/maestro-fix.md`, and SHALL contain 36 workflow files.
2. The workflows `discovery`, `adr`, `to-prd`, `rfc`, `tdd`, `ticket` SHALL exist only as `product-discovery`, `create-adr`, `create-prd`, `create-rfc`, `create-tdd`, `create-ticket`, each with frontmatter `name` equal to the new stem and session-id/tag prefixes using the new stem.
3. The references `references/maestro.md` and `references/maestro/` and the doc `docs/massa-ai-maestro.md` SHALL NOT exist, and the `maestro` audit-report family and `MST` prefix SHALL be removed from `audit-report-io.md` and `validate_audit_report.ts`.
4. WHEN no route's precedence key matches THEN the router SHALL instruct the main agent to proceed without loading a workflow file under the Core Contract, and SHALL NOT name a `general` workflow.
5. The Plan Challenge policy sentence SHALL name `spec-driven`, `feature`, `create-adr`, `create-rfc`, `create-tdd`, `refactor`, and each named file SHALL exist and contain "Plan Challenge Gate".
6. WHEN `bun run generate:artifacts` runs THEN the generated workflow commands SHALL be exactly the 36 new stems (plus the 6 quick commands), with no command for a removed or old stem.
7. The web UI `WORKFLOW_STEMS` list SHALL equal the 36 current stems.
8. `bun scripts/check-stale-pointers.ts` (and the reference-graph orphan check) SHALL report no dangling pointer to a removed or renamed workflow or reference.
9. The workflow-owned references and guides SHALL follow the new stems: `references/create-tdd/`, `references/create-rfc/`, `references/create-ticket/`, `references/create-adr.md` (was `adr-authoring.md`), `docs/massa-ai-create-rfc.md`, `docs/massa-ai-create-tdd.md`, `docs/massa-ai-create-ticket.md`, and no tracked file outside `.specs/`, `.ua/`, and CHANGELOG history SHALL point at an old path.

### P1: Unprefixed names with marker ownership ⭐ MVP

**User Story**: As a user, I want agents named `builder`, not `massa-ai-builder`, without an
installer ever touching my own agent files.

**Acceptance Criteria**:

1. Generated agent files on all four hosts, in `agents/` and every `agent-profiles/<profile>/`, SHALL be named `<agent>.<ext>` and carry `name: <agent>` (where the host has a name field).
2. Every generated `.md` agent (Claude, Cursor, OpenCode) SHALL carry the body line `<!-- massa-ai-owned: true -->`, and every generated Codex `.toml` agent SHALL start with `# massa-ai-owned`.
3. IF a same-named agent file (regular file or symlink) that is not massa-ai-owned exists in a host's installed agents directory THEN the installer SHALL leave it byte-identical (symlink target unchanged), SHALL NOT install massa-ai's version over it, and SHALL print a warning naming the file.
4. WHEN an installer or uninstaller removes agents THEN it SHALL remove only massa-ai-owned entries, where owned is, per host: Claude/Cursor — a regular file whose first body line is the marker, or a legacy name (A17); Codex — first line `# massa-ai-owned`; OpenCode — a symlink whose target's first body line is the marker or whose link text matches `*/opencode-plugin/agents/<base>` or `*/plugins/massa-ai/agent-profiles/*/<base>`, or a legacy-named symlink.
5. WHEN a plugin installer upgrades a host that has legacy `massa-ai-*` agent files THEN those files SHALL be removed and the 7 unprefixed agents installed.
6. The profile-switch engine (`packages/shared/src/profile-switch/`) and `doctor` SHALL select active agent files by ownership marker, not by `massa-ai-*` glob, and SHALL NOT overwrite an unmarked file.
7. The OpenCode `massa-ai-config agents install|uninstall`, `verify-harness-install.ts`, and `installer-shared.sh` host-detection SHALL identify owned agents by marker.
8. The Claude hook drift-check sentinel SHALL read an agent file that exists in the new roster.
9. No generated agent name SHALL equal a host built-in (`Explore`, `Plan`, `general-purpose`, `default`, `worker`, `explorer`, `build`, `plan`, `general`, `explore`, `scout`).
10. WHILE Claude runs on the plugin route the router `SKILL.md` (always loaded) SHALL instruct dispatching the plugin-namespaced agent `massa-ai:<name>`, so a same-named user or project agent cannot intercept the dispatch.
11. WHEN a profile switch copies or repoints variant files THEN it SHALL skip every variant entry that is legacy-named or not massa-ai-owned.

### P2: Docs and records

**User Story**: As a reader, I want docs that describe the current harness.

**Acceptance Criteria**:

1. `README.md`, `FEATURES.md`, `CLAUDE.md`, root `AGENTS.md`, `docs/CHEATSHEET.md`, `docs/ONBOARDING.md`, `docs/adding-a-host.md`, and plugin READMEs SHALL describe 7 agents, 36 workflows, 8 bootstrap rules, and no persona router.
2. `docs/removed-features.md` SHALL gain a section recording the removed personas, agents, and workflows with the rationale.
3. `CHANGELOG.md` `[Unreleased]` SHALL carry `### Removed` and `### Changed` entries covering every removal and rename.

## Edge Cases

- A user already has `~/.claude/agents/reviewer.md` of their own: installer skips `code-reviewer` only if names collide — here they don't; `builder.md`/`judge.md` collisions are the realistic ones (NAM AC-3).
- A profile variant directory installed by an older version still contains `massa-ai-*` files: variant sync must not copy them back into the active dir (NAM AC-5/6).
- OpenCode installs agents as symlinks; a user's regular file named like an agent is already refused — preserved.
- A stale local `apps/cursor-plugin/skills/persona-router/` would be copied as a command skill by the cursor installer loop once `persona-router` leaves its exclusion list — PER AC-3 removes it first.
- `generate:artifacts` reads a local profile overlay; regenerated bundles in the worktree must be produced with the default registry.

## Requirement Traceability

| Requirement ID | Description | Story | Phase | Status |
| --- | --- | --- | --- | --- |
| PER-01 | Delete persona router skill + catalog (PER AC-1, AC-7) | Personas removed | Design | Pending |
| PER-02 | Bootstrap registry 9→8, AGENTS.md spans, retired-id silence (AC-2, AC-6) | Personas removed | Design | Pending |
| PER-03 | Generator + installers drop persona-router, prune installed copy (AC-3, AC-4, AC-5) | Personas removed | Design | Pending |
| PER-04 | Observation-extractor `/persona` trigger removed (AC-8) | Personas removed | Design | Pending |
| ROS-01 | Seven charters authored from merged sources + contract-preservation fixture test (ROS AC-1..6, AC-9) | Seven-agent roster | Design | Pending |
| ROS-02 | Old agent names purged; single mapping table (AC-7) | Seven-agent roster | Design | Pending |
| ROS-03 | Counts 18→7 everywhere (AC-8) | Seven-agent roster | Design | Pending |
| WFL-01 | Dispatch mapping per workflow family (Dispatch AC-1..9) | Workflow dispatch mapping | Design | Pending |
| WFL-02 | Remove general + maestro, fallback rewrite (Inventory AC-1, AC-3, AC-4) | Workflow inventory | Design | Pending |
| WFL-03 | Six renames incl. policy sentence, commands, web UI, owned references and docs guides (AC-2, AC-5, AC-6, AC-7, AC-9) | Workflow inventory | Design | Pending |
| WFL-04 | No dangling pointers (AC-8) | Workflow inventory | Design | Pending |
| NAM-01 | Generator emits unprefixed names + markers (NAM AC-1, AC-2, AC-9) | Unprefixed names | Design | Pending |
| NAM-02 | Installers: marker ownership, collision skip, legacy prune (AC-3, AC-4, AC-5) | Unprefixed names | Design | Pending |
| NAM-03 | Profile-switch, config-cli, verify, installer-shared, hook sentinel, Claude name resolution (AC-6, AC-7, AC-8, AC-10, AC-11) | Unprefixed names | Design | Pending |
| DOC-01 | Docs, removed-features, CHANGELOG (Docs AC-1..3) | Docs and records | Design | Pending |

## Implicit-Requirement Sweep (Large)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | NAM AC-3 (foreign same-named file), PER AC-6 (unknown persisted rule id) |
| Failure / partial-failure states | Installers use existing copy-then-prune order (IPT-02 D1); a failed copy never precedes a prune |
| Idempotency / retry / duplicates | Re-running any installer after upgrade is a no-op (legacy files already gone, markers present) — covered by existing reinstall tests, extended in NAM-02 |
| Auth boundaries & rate limits | N/A because no network or auth surface changes |
| Concurrency / ordering | N/A because installers are single-process; existing installer-race-safety locking unchanged |
| Data lifecycle / expiry | Legacy files and the persona-router skill are deleted on upgrade (NAM AC-5, PER AC-5); `config.json` key left in place (A12) |
| Observability | NAM AC-3 warning on skipped foreign file; installer summaries report counts of 7 |
| External-dependency failure | N/A because no external service is involved |
| State-transition integrity | `install-state.json` skill lists drop `persona-router` after upgrade; profile-switch state keeps working across the rename (NAM AC-6) |

## Verification Approach

- Deterministic gates: `bun run build`, `bun run type-check`, `bun run lint`, `bun run test`, `bun run test:scripts`, `bun run test:plugins`, `bun run generate:artifacts --check`, `bun scripts/check-stale-pointers.ts`, `bun skills/massa-ai/scripts/validate_spec.ts agent-roster-consolidation`.
- New/updated sensors: roster exact-set tests (charters, generated files per host), marker-ownership installer tests with a planted foreign `builder.md` and legacy `massa-ai-*` files, bootstrap retired-id silence test, dispatch-mapping content tests per workflow family, generated-command inventory test.
- Independent verification by a fresh `code-reviewer`-mode verifier (author ≠ verifier) with a discrimination sensor over the installer ownership logic and dispatch mapping.
