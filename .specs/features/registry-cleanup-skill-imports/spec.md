# Registry Cleanup And Skill Imports Specification

Slug: `registry-cleanup-skill-imports` · Workflow: spec-driven (Large) ·
Session: `spec-registry-cleanup-skill-imports`

## Problem Statement

`skills/AGENTS.md` carries verified defects and duplication: two stale
"symlinked" claims (the installer makes real copies; `npm pack` drops
symlinks), a judge permission three-way contradiction (table `read-only`,
charter frontmatter `read-only`, charter body mandates report-file writes —
and the generator therefore ships judge without write tools on all four
hosts), a stale §Future Integration prohibiting work that already shipped,
mirror copies of the Capability Packet and Output Contract whose canonical
source is `skills/massa-ai/references/agent-orchestration.md`, a partial
Orchestration Model diagram (10 of 17 agents), a duplicated dispatch-name
rule, and a `.env*` ignore pattern that hides `.env.example` — the documented
env reference — from indexing. Separately, three skills from the
Useful-Agent-Skills checkout (`coding-guidelines`, `skill-architect`,
`to-prd`) belong inside the massa-ai skill as router-owned workflows and
references (user decision 2026-08-05).

## Goals

- [ ] `skills/AGENTS.md` registry: zero stale claims, zero mirror copies of
      canonical agent-orchestration content, judge permission consistent
      end-to-end (table → charter → generated artifacts).
- [ ] `coding-guidelines`, `skill-architect`, `to-prd` integrated into
      `skills/massa-ai/` as workflows/references with router rows, passing the
      workflow-metadata-headers gate; sources in Useful-Agent-Skills untouched.
- [ ] All gates green: `test:scripts`, `lint`, `test:plugins`, both generators
      `--check` 0, CHANGELOG entry present.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Deleting sources from `~/Projects/Useful-Agent-Skills` | User decision 2026-08-05: copy only, leave source |
| Moving the Mapping table to an ADR | Kept in place — surgical scope; historical value acknowledged, relocation optional later |
| Fixing the judge `judge_number`/`own_report_path` packet-field gap in `references/agent-orchestration.md` | Canonical-packet content change; separate concern from registry cleanup |
| Splitting bootstrap block and registry into separate files | Structural change to installer contract; candidate follow-up, not directed |
| Editing installed host copies under `~/.claude`, `~/.codex`, `~/.cursor`, `~/.config/opencode` | Machine mutation; staged as user-run `install-skills.sh --apply` after merge |
| RTK docs, `~/.claude/RTK.md` duplication | Outside this repository |
| Hand-editing `apps/*-plugin/skills/**` bundles | Generated; regenerated via `scripts/generate-skill-artifacts.ts` |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Import shape | Convert to massa-ai workflows/references (to-prd + skill-architect → workflows; coding-guidelines → reference) | Matches folding precedent (massa-ai-memory, synapse-usage) and WMH frontmatter gate | y (user, 2026-08-05) |
| Source repo mutation | Copy only | No cross-repo mutation | y (user, 2026-08-05) |
| coding-guidelines activation | Lazy: loaded before implementation edits, not at session start | Saves ~70 lines/session startup | y (user, 2026-08-05) |
| Branch base | Fresh branch from main (PR #71 merged, main @ `394770fc`) | User confirmed #71 merged | y (user, 2026-08-05) |
| Capability Packet / Output Contract mirror deletion reverses recorded design ORC-06/ORC-08 (persona-agent-boundary design A1: three packet copies) | Delete the AGENTS.md mirror; update `PACKET_FILES` 3→2; retire `capability-packet-parity.test.ts` | The mirror's recorded rationale ("installer copies it to hosts") is factually wrong — `install-skills.sh:213-228` extracts only the bootstrap block; the registry never reaches hosts. User directed the deletion | y (user directive; reversal recorded here) |
| coding-guidelines wiring point | One line in `skills/massa-ai/SKILL.md` Core Contract ("before writing or changing implementation code, load `references/coding-guidelines.md`") | One authoritative location; avoids duplicating a load line across 14+ workflows | n (agent default; persona rule: one authoritative location per rule) |
| `validate-repository.test.ts:84` requires literal `coding-guidelines` in bootstrap block | Keep the literal truthfully: massa-ai Skill Summary bullet names `references/coding-guidelines.md` as an on-demand load | Gate stays green without weakening; bootstrap still tells hosts where the behavior lives | n (agent default) |
| Judge charter description starts "Read-only debate-panel evaluator" | Reword to "Debate-panel evaluator" (rest unchanged) | Description must not contradict `permission: write`; feeds generated host descriptions | n (agent default) |
| `.env.example` carve-out shape | Add `!.env.example` line directly under `.env*` in the ignore list | gitignore-negation idiom, readable by agents consuming the list as text | n (agent default) |
| judge charter `metadata.version` | Bump `1.1.0` → `1.2.0` | Permission change alters generated artifacts on all hosts; minor bump signals it | n (agent default) |
| `validate_skill.py` stays Python | Copy as-is into `skills/massa-ai/scripts/` | Surgical; generator already skips `__pycache__` (`generate-skill-artifacts.ts:113`); workflow notes manual-checklist fallback when Python is absent | n (agent default) |
| skill-architect license (source `CC-BY-4.0`, author Felipe Rodrigues; WMH gate hardcodes `MIT`) | Keep `license: CC-BY-4.0` + attribution line; widen the WMH gate license assertion to allowlist `["MIT", "CC-BY-4.0"]` | Third-party CC-BY content cannot be silently relabeled MIT; gate's all-MIT assumption predates third-party imports | y (user, 2026-08-05) |
| `PACKET_FILES` shrink also narrows `AUTHORITY_SCANNED_FILES` (persona-authority prose scanner) | Re-add `AGENTS.md` to the authority scanner directly, decoupled from `PACKET_FILES` | Bootstrap Persona Router Policy prose stays in the file; coverage must not silently drop (plan-critic C2) | n (agent default) |

**Open questions:** none — all resolved or logged above.

## User Stories

### P1: Registry cleanup ⭐ MVP

**User Story**: As the repo owner, I want `skills/AGENTS.md` free of stale
claims, contradictions, and mirror copies so that agents reading it act on
correct, single-sourced contracts.

**Why P1**: Verified defects actively mislead (symlink claims, judge
permission, Future Integration prohibition against shipped work).

**Acceptance Criteria**:

1. The file `skills/AGENTS.md` SHALL contain no section headed "Orchestration Model", no section headed "Future Integration", and zero occurrences of the word "symlinked". <!-- RCS-01, RCS-05, RCS-07 -->
2. The Capability Packet and Output Contract sections in `skills/AGENTS.md` SHALL each consist of a pointer to `skills/massa-ai/references/agent-orchestration.md` (canonical) with no field list of their own. <!-- RCS-02, RCS-03 -->
3. The file `skills/AGENTS.md` SHALL state the `massa-ai-<role>` dispatch-name rule exactly once. <!-- RCS-04 -->
4. WHEN `scripts/generate-subagent-artifacts.ts` runs THEN the generated judge artifacts on every host SHALL carry write permission, and the judge Agent Table row SHALL read `read-only (report-write, own file only)` while `skills/agents/judge/SKILL.md` declares `permission: write`. <!-- RCS-06 -->
5. The file `skills/AGENTS.md` SHALL cite the agent-orchestration reference only under the single spelling `skills/massa-ai/references/agent-orchestration.md`. <!-- RCS-08 -->
6. The validator-anchor comment SHALL list only anchors whose sections still exist. <!-- RCS-09 -->
7. The bootstrap ignore list SHALL contain `!.env.example` on the line after `.env*`. <!-- RCS-10 -->
8. The bootstrap activation stack SHALL NOT list `coding-guidelines` as a stack item, WHILE the bootstrap block still contains the literal `coding-guidelines` inside the massa-ai Skill Summary bullet naming `references/coding-guidelines.md`. <!-- RCS-11 -->

**Independent Test**: grep assertions over `skills/AGENTS.md` + charter + one generated judge artifact per host.

### P1: Skill imports ⭐ MVP

**User Story**: As the skill author, I want `coding-guidelines`,
`skill-architect`, and `to-prd` owned by the massa-ai router so that one
skill surface routes them with the repo's gates and generators.

**Why P1**: Directed work; the standalone copies bypass massa-ai routing,
frontmatter gates, and bundle generation.

**Acceptance Criteria**:

1. The file `skills/massa-ai/references/coding-guidelines.md` SHALL contain the four coding-guidelines sections (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) without YAML frontmatter, and `skills/massa-ai/SKILL.md` SHALL instruct loading it before implementation edits. <!-- IMP-01 -->
2. The files `skills/massa-ai/workflows/to-prd.md` and `skills/massa-ai/workflows/skill-architect.md` SHALL carry WMH frontmatter (name = file stem, single-line quoted description of length 20–1024, `metadata.version: "1.0.0"`; license `MIT` for to-prd, `CC-BY-4.0` with attribution for skill-architect) and SHALL pass `scripts/__tests__/workflow-metadata-headers.test.ts` with its license assertion widened to the allowlist `["MIT", "CC-BY-4.0"]` and `EXPECTED_WORKFLOW_COUNT` bumped 36 → 38 in the same commit that adds the 38th file. <!-- IMP-02, IMP-03 -->
3. The `skills/massa-ai/SKILL.md` Workflow Router table SHALL contain one row for `to-prd` and one for `skill-architect`, and the routing precedence SHALL route "convert this conversation/discussion into a PRD" to `to-prd` and "create/design a new skill" to `skill-architect`. <!-- IMP-04 -->
4. The imported skill-architect content SHALL reference its materials at `references/skill-architect/{examples,patterns,quality-checklist}.md` and `scripts/validate_skill.py`, and SHALL contain zero occurrences of `massa-th0th`. <!-- IMP-05 -->
5. IF Python is unavailable THEN the skill-architect workflow SHALL direct running the quality checklist manually instead of `validate_skill.py`. <!-- IMP-06 -->
6. The directory `/Users/luizmassa/Projects/Useful-Agent-Skills/skills/` SHALL be byte-identical before and after this feature (no writes). <!-- IMP-07 -->
7. The file `skills/massa-ai/workflows/to-prd.md` SHALL preserve the source skill's explicit-invocation-only intent by stating it routes only on explicit user request, and the router SHALL keep `furps-refinement` as the route for refining an existing PRD. <!-- IMP-08 -->

**Independent Test**: WMH gate over the two new workflows; router-table grep; `git -C ~/Projects/Useful-Agent-Skills status --porcelain` empty.

### P1: Gates, regeneration, delivery ⭐ MVP

**User Story**: As the maintainer, I want every guard updated with the
subjects it polices so that CI is green and generated bundles match sources.

**Why P1**: Guard/subject drift is the repo's recurring defect class.

**Acceptance Criteria**:

1. The file `scripts/__tests__/capability-packet-parity.test.ts` SHALL NOT exist, and `scripts/__tests__/skills-harness-integrity.test.ts` `PACKET_FILES` SHALL list exactly the two canonical files (`agent-orchestration.md`, `subagent-design.md`). <!-- REG-01 -->
2. WHEN `bun scripts/generate-skill-artifacts.ts --check` and `bun scripts/generate-subagent-artifacts.ts` + parity test run THEN both SHALL exit 0 with regenerated bundles committed. <!-- REG-02, REG-03 -->
3. The commands `bun run test:scripts`, `bun run lint`, and `bun run test:plugins` SHALL exit 0. <!-- REG-04 -->
4. The `CHANGELOG.md` `[Unreleased]` section SHALL contain entries for the registry cleanup and the skill imports. <!-- REG-05 -->

**Independent Test**: run the three commands; grep CHANGELOG.

## Edge Cases

- IF the WMH gate rejects an imported description (length/newline) THEN the description SHALL be hand-shortened, never the gate widened.
- IF `skills-harness-integrity.test.ts` holds further assertions against the deleted AGENTS.md sections (beyond `PACKET_FILES`) THEN those assertions SHALL be repointed to the canonical files in the same task that deletes the sections (a clause and its fix touch the same lines).
- WHEN the bootstrap block changes THEN installed hosts remain stale until the user runs `bash scripts/install-skills.sh --apply` — recorded in validation, staged user-run.
- IF `validate-repository.test.ts` bootstrap assertions (`caveman full`, `coding-guidelines`, `massa-ai`, `persona-router`) fail THEN the bootstrap edit is wrong, not the test (RCS-11's WHILE clause is the contract).
- The orphaned standalone `~/.claude/skills/coding-guidelines` install is user-machine state; removal guidance goes in the PR body, never executed by the agent.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| RCS-01 | P1: Registry cleanup | Tasks | Pending |
| RCS-02 | P1: Registry cleanup | Tasks | Pending |
| RCS-03 | P1: Registry cleanup | Tasks | Pending |
| RCS-04 | P1: Registry cleanup | Tasks | Pending |
| RCS-05 | P1: Registry cleanup | Tasks | Pending |
| RCS-06 | P1: Registry cleanup | Tasks | Pending |
| RCS-07 | P1: Registry cleanup | Tasks | Pending |
| RCS-08 | P1: Registry cleanup | Tasks | Pending |
| RCS-09 | P1: Registry cleanup | Tasks | Pending |
| RCS-10 | P1: Registry cleanup | Tasks | Pending |
| RCS-11 | P1: Registry cleanup | Tasks | Pending |
| IMP-01 | P1: Skill imports | Tasks | Pending |
| IMP-02 | P1: Skill imports | Tasks | Pending |
| IMP-03 | P1: Skill imports | Tasks | Pending |
| IMP-04 | P1: Skill imports | Tasks | Pending |
| IMP-05 | P1: Skill imports | Tasks | Pending |
| IMP-06 | P1: Skill imports | Tasks | Pending |
| IMP-07 | P1: Skill imports | Tasks | Pending |
| IMP-08 | P1: Skill imports | Tasks | Pending |
| REG-01 | P1: Gates & delivery | Tasks | Pending |
| REG-02 | P1: Gates & delivery | Tasks | Pending |
| REG-03 | P1: Gates & delivery | Tasks | Pending |
| REG-04 | P1: Gates & delivery | Tasks | Pending |
| REG-05 | P1: Gates & delivery | Tasks | Pending |

**Coverage:** 24 total, 0 mapped to tasks (pending Tasks phase), 24 unmapped ⚠️

## Implicit-Requirement Sweep (Large)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | WMH gate bounds frontmatter (IMP-02); N/A beyond — doc/config edits only |
| Failure / partial-failure states | Python-absent fallback (IMP-06); generator `--check` catches partial regen (REG-02) |
| Idempotency / retry / duplicate handling | Generators are idempotent by design (`--check` diff); N/A beyond |
| Auth boundaries & rate limits | N/A because no runtime/auth surface is touched |
| Concurrency / ordering | N/A because edits are sequential single-writer file changes |
| Data lifecycle / expiry | N/A because no data stores are touched |
| Observability | Gate commands are the sensors; CHANGELOG records the change (REG-05) |
| External-dependency failure | Python absence (IMP-06); no other external deps |
| State-transition integrity | `.specs/` state files updated per spec-driven memory rules before PR |

## Success Criteria

- [ ] All 24 requirement IDs Verified in validation.md.
- [ ] `skills/AGENTS.md` shrinks (measured before/after line count reported).
- [ ] CI green on the PR.

## Verification Approach

Deterministic grep/test assertions per AC (see Tasks Test Coverage Matrix);
independent `massa-ai-verification-agent` as the final Execute gate;
source-repo non-mutation proven by `git status --porcelain` in the
Useful-Agent-Skills checkout.
