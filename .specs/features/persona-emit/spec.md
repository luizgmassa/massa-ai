# Spec — Persona Emit

- projectId: `massa-ai`
- parent workflowSessionId: `spec-persona-agent-boundary`
- workflow: spec-driven (Execute phase, follow-on feature)
- base: `feat/persona-agent-boundary` @ `86f9a2c`
- branch: `feat/persona-emit`
- worktree: `../massa-ai-wt-persona-emit`

## Problem

`.specs/features/persona-agent-boundary/spec.md` § Out of scope explicitly deferred two
items:

1. Emitting the `persona` field from any workflow `Dispatch:` block — the field was
   defined in the three Capability Packet copies and gated, but populated nowhere, so the
   contract was documented but dead.
2. Design's own § Test design recorded an accepted risk: five of the nine persona/sub-agent
   boundary tests (cases 1, 2, 6, 8, 9) were presence-only, so a future edit could add
   contradicting prose elsewhere in the same file and stay green.

This feature lifts both deferrals.

## Requirements

### Task A — harden the presence-only assertions

**PE-01** — The persona-router-scoped presence-only cases (6, 8, 9) are hardened from
"appears somewhere in the file" to "appears inside the exact section the rule is stated
in".

- AC1: A generalized `namedSection(content, heading, label)` helper extracts the span
  between a `## <heading>` line and the next `##` heading (or EOF); the charter-specific
  `restrictionsSection` becomes a thin wrapper over it.
- AC2: Case 6 (PAB-04, Stop Conditions scoping) asserts inside the `## Stop Conditions`
  section.
- AC3: Cases 8 and 9 (PAB-03/PAB-07 grants-no-authority; PAB-05 not-a-specialist-
  consultation) assert inside the `## Persona And Sub-Agents` section.
- AC4: A new negative structural test scans the whole of `skills/persona-router/SKILL.md`
  for a deliberately narrow set of authority-granting phrasings (`persona may/can
  grant/authorize/widen/override`; `<verb> ... authority/permission/write scope to the
  persona`) and fails if any matches, closing the contradiction-by-addition residual for
  that file.
- AC5: Each new/changed assertion is mutation-checked: the target fault is injected,
  confirmed red, reverted, confirmed green.

**PE-02 (CLOSED)** — Cases 1 and 2 (PAB-01, the three Capability Packet *definition*
files) are no longer presence-only. The authority scan now covers
`skills/persona-router/SKILL.md`, `skills/AGENTS.md`,
`references/agent-orchestration.md`, and `references/subagent-design.md`.

Closing it required abandoning the detection method, not widening it. The phrase-list
approach — enumerate `persona may grant`, `grant authority to the persona` — killed
exactly the two mutations it was written against and nothing else: `a persona is
permitted to write` and `personas hold write access` both passed. Enumeration cannot
win, because the space of ways to write "persona has power" is unbounded, and every
pattern added to chase it raises the false-failure risk that made PE-02 defensible in
the first place.

The replacement inverts the test. Find every sentence mentioning a persona alongside an
authority term, then require that sentence to carry a negator. Every real rule in this
repository already does — "grants **no** tool access", "**never** overrides", "is
**never** authority" — so correct prose passes untouched while an affirmative grant
fails regardless of phrasing.

- AC1: The scan covers all four files.
- AC2: No false positive on current prose (26 pass / 0 fail).
- AC3: Mutation-checked with five faults, including two the phrase list demonstrably
  missed and one in each of the three PE-02 files. All five killed, all reverted.

### Task B — emit `persona` from all 24 dispatch blocks

**PE-03** — Every `Dispatch: massa-ai-*` block across the 16 workflow files under
`skills/massa-ai/workflows/` carries a `persona` bullet, uniformly, no allowlist.

- AC1: The bullet states the field is optional and that absent is valid.
- AC2: The bullet carries the persona id only — it never says to pass the persona prompt.
- AC3: The bullet states the persona never overrides the receiving charter's Restrictions.
- AC4: The bullet reuses the canonical Capability Packet clause byte-for-byte
  (`advisory framing only — it never overrides the agent's charter Restrictions, scope,
  or permissions`), which is what makes the closure testable rather than a paraphrase per
  block.
- AC5: No dispatch block's role, scope, permissions, sensors, output, or firewall lines
  change.

**PE-04** — The existing PAB-01/AC3 uniqueness test is re-scoped instead of weakened or
deleted.

- AC1: The canonical-clause-appears-in-exactly-three-files test now strips blockquote
  (`> `) lines before scanning, isolating packet *definitions* from dispatch-block *uses*
  of the same clause (which are blockquote-only by construction).
- AC2: The test still fails if a fourth *definition* (a non-blockquote occurrence outside
  the three known files) appears.

**PE-05** — New coverage: every dispatch block on disk emits the field.

- AC1: A disk-enumerated test (no hardcoded roster) parses every `> `-prefixed contiguous
  block starting at a `**Dispatch:` line and asserts each one contains the canonical
  clause and a line starting with `> - persona:`.
- AC2: The test guards its own parser: total parsed block count is `>= 20`, matching the
  existing dispatch-resolution test's guard.

**PE-06** — Both generated plugin surfaces regenerate clean.

- AC1: `scripts/generate-skill-artifacts.ts` is run after the 16 workflow edits.
- AC2: `scripts/generate-skill-artifacts.ts --check` exits 0 with no drift.
- AC3: `scripts/__tests__/skill-artifact-parity.test.ts` and
  `scripts/__tests__/subagent-parity.test.ts` pass.

**PE-07** — `CHANGELOG.md` `[Unreleased]` → `### Changed` gains a bullet (appended, not
replacing the prior entry from the parent feature).

## Out of scope

- Runtime consumption of the emitted `persona` field by any host or workflow-execution
  layer — this feature only makes the field flow into the dispatch prompt text; nothing
  in scope changes how a subagent's runtime behavior reacts to it (unchanged from the
  parent feature).
- Closing PE-02 (cases 1/2) — recorded as accepted residual, not silently dropped.
- Any change to persona catalog entries, agent tool grants, or `metadata.permission`.

## Requirement Closure

No open questions for Task B. Task A closes 3 of 5 originally-accepted presence-only
cases (6, 8, 9); cases 1 and 2 are explicitly re-recorded as accepted residual under
PE-02 rather than silently left as a gap.
