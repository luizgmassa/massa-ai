# Registry Cleanup And Skill Imports Design

Slug: `registry-cleanup-skill-imports` · Session: `spec-registry-cleanup-skill-imports`

## Design Summary

Surgical cleanup of `skills/AGENTS.md` (delete two mirror sections + two stale
sections, fix judge permission end-to-end, bootstrap stack/ignore edits) plus
conversion of three Useful-Agent-Skills skills into massa-ai-owned
workflows/references, with every affected gate updated in the same task that
moves its subject. No runtime code changes; the only behavioral change is
generated judge artifacts gaining write tools (a fix).

## Tech Decisions

### D1 — skills/AGENTS.md target shape

Registry half (post-bootstrap) after cleanup, section by section:

| Section | Action |
| --- | --- |
| `# Sub-Agent Registry` preamble | Keep. Fix path spelling `massa-ai/references/agent-orchestration.md` → `skills/massa-ai/references/agent-orchestration.md` (RCS-08). |
| `## Orchestration Model` | Delete whole section incl. diagram and trailing paragraph (kills one "symlinked") (RCS-01, RCS-05). |
| `## Capability Packet (dispatch contract)` | Replace body with 3-line pointer: canonical field list + dispatch gates live in `skills/massa-ai/references/agent-orchestration.md` §Capability Packet; agents inherit nothing from the parent session; persona-boundary rules in `skills/persona-router/SKILL.md`. No `- \`field\`:` bullets remain (RCS-02). |
| `## Output Contract (shared by all agents)` | Replace body with pointer to §Output Contract in the same canonical file (RCS-03). |
| `## Agent Table` | Keep. Delete the duplicated "Dispatch each agent as `massa-ai-<Name>`." line (RCS-04). Judge row Permission → `read-only (report-write, own file only)` (RCS-06). |
| `## Mapping — New Agents ↔ Existing Roles` | Keep. "The symlinked massa-ai skill defines" → "The massa-ai skill defines" (RCS-05). |
| `## How to Add an Agent` | Keep unchanged. |
| `## Future Integration` | Delete (RCS-07). |
| `## massa-ai Concepts` | Keep. |
| validator anchor comment | → `<!-- validator anchors: 17 agents | mapping table -->` (RCS-09). |

Bootstrap block changes (RCS-10, RCS-11):

- Stack: `1. caveman full / 2. massa-ai / 3. persona-router` (coding-guidelines
  removed, renumbered). Prose "activate this stack" paragraph unchanged
  otherwise.
- Skill Summary: drop the `coding-guidelines` bullet; extend the `massa-ai`
  bullet: "…load internal workflows or references only on demand, including
  `references/coding-guidelines.md` before implementation edits." This keeps
  the literal `coding-guidelines` in the block, so
  `validate-repository.test.ts:84` stays green with true content — the gate is
  not weakened, its subject moved.
- Ignore list: `!.env.example` inserted directly after `.env*`.

### D2 — Judge permission (RCS-06)

`metadata.permission` is binary at the generator
(`generate-subagent-artifacts.ts:239-241`: anything ≠ `write` → `read-only`).
test-engineer and documentation-agent already model "write tools, charter-bounded
scope": frontmatter `write`, table label nuanced. Judge follows the same
pattern:

- `skills/agents/judge/SKILL.md`: `permission: read-only` → `write`;
  description "Read-only debate-panel evaluator…" → "Debate-panel evaluator…";
  `metadata.version` `"1.1.0"` → `"1.2.0"`. Charter §Restrictions already
  bounds writes to the assigned judge-N file — unchanged.
- Consequence (intended fix, not side effect): generated judge artifacts gain
  write tools on all four hosts. Today's generated judge cannot write the
  report file its own charter mandates.

### D3 — Import shapes

### coding-guidelines → `skills/massa-ai/references/coding-guidelines.md`

Body of the source SKILL.md minus frontmatter (H1 + four sections, byte-close;
one added origin line "Source: Karpathy Guidelines (Useful-Agent-Skills)").
Wiring: one Core Contract bullet in `skills/massa-ai/SKILL.md` — "Before
writing or changing implementation code, load `references/coding-guidelines.md`
if not already loaded." One authoritative location; no per-workflow load-line
duplication across the 14+ mutating workflows. Tradeoff: relies on the Core
Contract being always-loaded (it is — SKILL.md is the router) versus stronger
per-workflow repetition; repetition rejected as the exact duplication class
this feature deletes elsewhere.

### to-prd → `skills/massa-ai/workflows/to-prd.md`

WMH frontmatter (name `to-prd`, source description reused — 273 chars, fits
20–1024 — `license: MIT`, `metadata.version: "1.0.0"`; source `metadata.origin`
dropped, `disable-model-invocation` dropped). Body: source body + one routing
line: "Route here only on explicit user request to convert the current
conversation into a PRD (Product Requirements Document); refining an existing
PRD stays `furps-refinement`." (IMP-08 — preserves `disable-model-invocation`
intent in router vocabulary.)

Router (`skills/massa-ai/SKILL.md`): table row
`| to-prd | turn the current conversation into a PRD without a new interview | workflows/to-prd.md |`;
precedence tier 2 (Requested artifact) gains "PRD synthesized from the current
conversation → `to-prd`".

### skill-architect → workflow + reference dir + script

- `skills/massa-ai/workflows/skill-architect.md`: WMH frontmatter with
  `license: CC-BY-4.0` and an attribution line (author Felipe Rodrigues,
  source Useful-Agent-Skills) — user decision 2026-08-05; description
  reused from source minus the trailing "massa-th0th" clause, reworded to "use
  the `tdd` workflow"; body = source body with reference paths rewritten
  `references/…` → `references/skill-architect/…` and script path
  `scripts/validate_skill.py` (relative to skill root, matching existing
  workflow convention), plus one graceful-degradation line: IF Python is
  unavailable THEN run `references/skill-architect/quality-checklist.md`
  manually (IMP-06).
- `skills/massa-ai/references/skill-architect/{examples,patterns,quality-checklist}.md`:
  byte copies (grep for residuals first; fix any `massa-th0th`).
- `skills/massa-ai/scripts/validate_skill.py`: byte copy. `__pycache__` never
  copied (generator skips it; we copy only the .py).
- Router row:
  `| skill-architect | design and build a new skill through structured conversation | workflows/skill-architect.md |`;
  precedence tier 2 gains "new SKILL.md / skill design → `skill-architect`".

### D4 — Gate updates (REG-01)

| Gate | Change |
| --- | --- |
| `scripts/__tests__/capability-packet-parity.test.ts` | Delete file. Its single purpose was mirror-drift guarding; the mirror is gone. |
| `scripts/__tests__/skills-harness-integrity.test.ts` | `PACKET_FILES` 3 → 2 (drop `AGENTS.md`); rename "all three Capability Packet copies" test to "both"; re-add `AGENTS.md` to `AUTHORITY_SCANNED_FILES` directly (line 539 spreads `PACKET_FILES` — shrinking it would silently drop the persona-authority prose scanner's coverage of the kept bootstrap Persona Router Policy; plan-critic C2); sweep the file for other AGENTS.md-section assertions in the same task (edge-case rule: clause and fix touch the same lines). |
| `scripts/__tests__/validate-repository.test.ts` | Untouched — bootstrap literals stay true (D1), registry agent names stay present. |
| `scripts/__tests__/workflow-metadata-headers.test.ts` | Two edits in T6's commit (the one that crosses the threshold): `EXPECTED_WORKFLOW_COUNT` 36 → 38 (line 30 population lock — plan-critic C1) and license assertion (line 110) → allowlist `["MIT", "CC-BY-4.0"]`. |
| Generators | Regen both; `generate-skill-artifacts.ts --check` exits 0; subagent parity test green. |

Design-decision reversal recorded: ORC-06/ORC-08 (three packet copies) is
reversed for the AGENTS.md copy because its rationale was factually wrong
(installer extracts only the bootstrap block — `install-skills.sh:213-228`;
the registry never reaches hosts). `subagent-design.md` remains the second
copy; its parity coverage inside skills-harness-integrity is kept.

### D5 — Delivery

Branch `spec/registry-cleanup-skill-imports` from `main` @ `394770fc`.
One atomic commit per task; CHANGELOG under `[Unreleased]` → `### Changed`
(registry cleanup, judge permission) + `### Added` (three imports ⇒ minor
bump). Post-merge user-run (never agent-run): `bash scripts/install-skills.sh
--apply` to refresh installed hosts; optional removal of the orphaned
standalone `~/.claude/skills/coding-guidelines`.

## Risks & Concerns

| Risk | Mitigation |
| --- | --- |
| `skills-harness-integrity.test.ts` holds AGENTS.md assertions beyond `PACKET_FILES` (700+ lines, section-scoped) | Sweep the whole test file in the same task as the section deletions; repoint with the subject, never after |
| Bootstrap edits reach hosts only via user-run `install-skills.sh --apply`; installed copies stale until then | Recorded in validation + PR body; consistent-but-stale is acceptable |
| Judge write-permission regen touches generated judge files on all four hosts (same files PR #71 compressed) | Base is merged main @ `394770fc`; no live conflict |
| Imported prose cites paths that do not resolve from the massa-ai skill root | `scripts/check-skill-doc-paths.ts` (exists since STO T1) is the deterministic sensor |
| ORC-06/ORC-08 reversal loses packet parity coverage | Reversal recorded in spec + design; `subagent-design.md` remains the second copy with its parity clause coverage intact |
