# Spec — Persona / Sub-Agent Boundary

- projectId: `massa-ai`
- workflowSessionId: `spec-persona-agent-boundary`
- workflow: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute)
- base: `origin/main` @ `77dd144` (v1.6.0)
- branch: `feat/persona-agent-boundary`
- worktree: `../massa-ai-wt-persona-agent-boundary`

## Problem

An audit of `skills/persona-router/SKILL.md` against the 15 charters in
`skills/agents/*/SKILL.md` found five unstated boundaries between the persona layer
(main-agent stance) and the sub-agent layer (delegated executors). None is a runtime
bug today; each is a contract gap that lets a future reader — human or model — draw a
wrong conclusion with no gate to catch it.

| # | Gap | Evidence |
| --- | --- | --- |
| 1 | Persona is never mentioned in any Capability Packet definition, so whether it reaches a subagent is undefined. | `skills/AGENTS.md:303`, `references/agent-orchestration.md:104`, `references/subagent-design.md:94` — three packet copies, zero persona field. `agent-orchestration.md:172` says subagents "never receive full conversation context". |
| 2 | The persona-router Stop Conditions clause reads as an absolute ban on subagents. | `persona-router/SKILL.md:158` — "Do not invoke a separate model router, launch subagents, create subprocess orchestration, or persist a route database." Intent is persona-routing scope; wording is unscoped. |
| 3 | Four personas shadow an agent with no stated ownership rule. | `senior-mobile-engineer`↔`mobile-specialist`, `senior-mobile-qa-automation-engineer`↔`test-engineer`, `context-skill-harness-engineer-architect`↔`architecture-specialist`, `product-manager`↔`requirements-analyst`. |
| 4 | No charter forbids loading `persona-router`. | All 15 charters carry "Never spawn subagents and never load the `massa-ai` router" — `massa-ai` only. A subagent could self-route a persona inside a delegated task. |
| 5 | Personas claim implementation ownership while granting no tools. | `personas/ai-native-nodejs-cli-architect.md`, `personas/senior-mobile-engineer.md` claim to "own implementation"; the main agent has write tools, so persona stance can pull toward inline edits instead of a `massa-ai-builder` dispatch. Covered only by the prose precedence rule at `persona-router/SKILL.md:43`. |

## Decisions

- **D1 — Persona propagates as an optional advisory packet field.** The Capability Packet
  gains an optional `persona` field carrying a cataloged persona id for output framing
  only. Every charter states that a supplied persona shapes emphasis and that the
  charter's own Restrictions win on any conflict. *(User-selected over "main-agent-only"
  and over a read-only-roles allowlist. The allowlist was rejected as a new drift surface
  needing its own parity test.)*
- **D2 — Feature branch + PR.** Worktree isolation, one atomic commit per task, push,
  `gh pr create`, watch CI, stop before merge.
- **D3 — Doc-contract change only.** No tool grant, no permission, and no persona-catalog
  entry changes. The five gaps are contract gaps; the fix is contract text plus gates that
  make the text load-bearing.

## Requirements

### Item 1 — persona propagation

**PAB-01** — All three Capability Packet definitions declare an optional `persona` field
with identical semantics.

- AC1: `skills/AGENTS.md`, `skills/massa-ai/references/agent-orchestration.md`, and
  `skills/massa-ai/references/subagent-design.md` each list a `persona` field in their
  packet section.
- AC2: Each states the field is optional, carries a cataloged persona id, is advisory
  framing only, and never overrides charter Restrictions, scope, or permissions.
- AC3: A test fails if any one of the three copies loses the field.

**PAB-02** — Each of the 15 charters carries a persona-precedence line.

- AC1: Every `skills/agents/<n>/SKILL.md` contains a line stating a supplied `persona`
  shapes emphasis only and that this charter's Restrictions win on conflict.
- AC2: The line sits in the charter's `## Restrictions` section.
- AC3: A test enumerates `skills/agents/*/` from disk and fails if any charter lacks it —
  so a charter added later cannot silently skip it.
- AC4: That test is **section-scoped** — it searches only the span between the
  `## Restrictions` heading and the next `##`, so AC2 is actually enforced rather than
  assumed. *(Added after the Plan Challenge gate — finding 3: a whole-file search would
  pass a charter whose line landed under `## Inputs`.)*

**PAB-03** — `persona-router/SKILL.md` documents the dispatch direction.

- AC1: It states a persona may be passed into a dispatch capability packet as advisory
  framing.
- AC2: It states the persona is never authority inside the subagent, and that the
  subagent's charter Restrictions win.

### Item 2 — stop-condition scope

**PAB-04** — The Stop Conditions prohibition is scoped to persona routing.

- AC1: The clause explicitly limits "do not launch subagents" to the act of persona
  routing.
- AC2: It states that workflow-mandated agent dispatch is unaffected by a persona route.
- AC3: A test fails if the unscoped form of the sentence returns.

### Item 3 — persona is not specialist consultation

**PAB-05** — `persona-router/SKILL.md` states a persona route neither substitutes for nor
satisfies an agent dispatch.

- AC1: The rule is stated in a section reached during routing, not a footnote.
- AC2: It names the four shadowing persona↔agent pairs so the overlap is explicit rather
  than inferred.
- AC3: A test fails if the rule is removed.

### Item 4 — no subagent self-routing

**PAB-06** — Each of the 15 charters forbids self-selecting or self-reading a persona.

- AC1: The existing restriction line names both the `massa-ai` router and `persona-router`.
- AC2: PAB-06 and PAB-02 are non-contradictory in the charter text: an agent may *receive*
  a persona in its packet and may never *select* one itself.
- AC3: A test enumerates charters from disk and fails if any lacks the extended form.
- AC4: The same line forbids reading a `personas/` prompt file directly. *(Added after the
  Plan Challenge gate — finding 2. A packet carries a bare persona id, which is not
  self-defining; without this clause a sub-agent handed `persona: senior-mobile-engineer`
  has an unblocked path to open that persona's prompt and self-amplify a stance that claims
  implementation ownership, reproducing gap #5 one layer down inside a write-permitted
  agent. Banning the router alone does not close it.)*
- AC5: A test asserts the superseded `massa-ai`-only form of the line is **absent**, so
  re-adding the old sentence alongside the new one fails.

### Item 5 — persona grants no authority

**PAB-07** — `persona-router/SKILL.md` states persona grants no tool and no write scope.

- AC1: It states a persona grants no tool access, no write scope, and no permission.
- AC2: It states a persona never authorizes implementing inline in place of a
  workflow-mandated dispatch.
- AC3: A test fails if the rule is removed.

### Repo protocol (CONTRIBUTING 7-step + CI gates)

**PAB-08** — **Both** generated plugin surfaces stay in sync.

Editing a charter body feeds **two independent generators writing two different mirrors**.
Naming only one was the plan's most serious defect before the Plan Challenge gate
(finding 1, confirmed live: `scripts/generate-subagent-artifacts.ts:287` returns
`fm + c.body`, so the charter body is embedded verbatim in the agent artifacts).

| Generator | Mirror it owns | Parity test |
| --- | --- | --- |
| `scripts/generate-skill-artifacts.ts` | `apps/<host>-plugin/skills/agents/<n>/SKILL.md` (raw charter copy) | `scripts/__tests__/skill-artifact-parity.test.ts` |
| `scripts/generate-subagent-artifacts.ts` | `apps/<host>-plugin/agents/massa-ai-<n>.{md,toml}` (frontmatter + charter body) | `scripts/__tests__/subagent-parity.test.ts` |

- AC1: Both generators are run after the charter edits.
- AC2: `--check` exits 0 with no drift for **both**.
- AC3: `skill-artifact-parity.test.ts` **and** `subagent-parity.test.ts` pass.
- AC4: The regeneration gate runs as part of the task that edits charters' downstream
  mirrors, not only at the pre-PR aggregate — a drift discovered after six commits costs an
  amend.

**PAB-09** — Discriminating tests exist for PAB-01..07.

- AC1: New cases live in `scripts/__tests__/skills-harness-integrity.test.ts`.
- AC2: Charter-scoped cases enumerate `skills/agents/*/` from disk, never a hardcoded list.
- AC3: Each case is mutation-checked: deleting or weakening the target clause turns it red.

**PAB-10** — `CHANGELOG.md` `[Unreleased]` carries an entry under `### Changed`.

- AC1: The entry sits under a minor-class heading with at least one bullet.
- AC2: The release choice is deliberate, not default. `CONTRIBUTING.md:134,147-149` offers a
  `no-changelog` label for docs/chore-only work, and merging cuts a real npm + GitHub
  Packages release. This change takes the release anyway because the harness contract text
  **is** the shipped product for the four plugin packages: the charters, packet definitions,
  and router prose are what installs onto a host, so a consumer on the previous version
  genuinely has different agent behavior. *(Rationale added after the Plan Challenge gate —
  finding 5. The heading itself is immaterial to the bump; `### Added` and `### Changed` are
  both minor. `### Changed` is correct because existing contracts change, none is new.)*

## Out of scope

- Emitting `persona` from any workflow file. No `workflows/*.md` dispatch block sets the
  field in this pass; runtime adoption is a separate feature. The field is defined and
  gated here, populated later.
- Adding, removing, or editing persona catalog entries or persona prompt bodies.
- Any change to agent tool grants, `metadata.permission`, or model hints.
- The read-only-roles allowlist propagation model (rejected in D1).
- Host-installed copies under `~/.claude/skills/` — owned by `scripts/install-skills.sh`,
  refreshed by the user's next `--apply`, not by this feature.
- Reconciling `.specs/project/STATE.md`'s stale `active_feature`.

## Requirement Closure

**No open questions.** The one gray area — whether persona reaches subagents at all — was
resolved by the user as D1 before Specify closed.

That is a narrower claim than "no accepted risk". Four assumptions ride into Execute,
enumerated and accepted in `design.md` § Risks; two more were added there by the Plan
Challenge gate. *(This distinction was corrected after the gate — finding 4: the original
wording claimed zero accepted assumptions while the design's own Risks table listed four.)*
