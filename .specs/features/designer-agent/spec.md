# Designer Agent + ADR Plan-Challenge Gate Specification

- Feature slug: `designer-agent`
- workflowSessionId: `spec-designer-agent`
- projectId: `massa-ai`
- Base: `origin/main` @ `f8427283`, worktree `/Users/luizmassa/Projects/massa-ai-wt-designer-agent`, branch `feat/designer-agent`

## Problem Statement

Two coverage gaps were measured in this session against all 40 workflow files under
`skills/massa-ai/workflows/`.

**Gap 1 — `adr` is named in a policy it never invokes.** `skills/AGENTS.md` (the
`<!-- massa-ai:bootstrap -->` block, single source for the Plan Challenge Policy) names
`adr` in its full-gate set: "Load full `workflows/the-fool.md` when the workflow is
`spec-driven`, `feature`, `adr`, `rfc`, `tdd`, or `refactor`". `rfc.md:37` and `tdd.md:51`
each carry an explicit "Run the … Plan Challenge Gate" step. `workflows/adr.md` carries no
such step and no reference to The Fool, `plan-critic`, or the gate — grep over the file
returns only an ADR readiness gate (`adr.md:30`) and the Evidence Gate (`adr.md:41`). The
gate therefore reaches `adr` only if the orchestrator recalls the bootstrap list unaided,
which is precisely the failure mode the repo's "one authoritative location, workflows carry
their own dispatch inline" convention exists to prevent (`references/agent-orchestration.md`
lines 96-97: "Every dispatch block in a workflow carries the prefixed name inline so
dispatch never depends on this file being loaded").

**Gap 2 — screen implementation has no specialist.** Of the 17 shipped charters, none owns
user-facing screen/UI implementation or verification against a design source.
`mobile-figma-audit.md` is the only `*-audit` workflow with no agent dispatch at all — its
six siblings each carry a step-6 `audit-specialist` block. `design.md` and `maestro.md` reach
a subagent only indirectly, through the `investigator` dispatch inside
`references/code-reuse-scan.md`. Screen work is consequently done inline by the orchestrator
or by a generic `builder`, with no charter-level obligation to read the design source, and no
deterministic gate that a screen was checked against it.

Neither gap is caught by an existing guard. `scripts/__tests__/skills-harness-integrity.test.ts`
fails when a workflow dispatches an agent with **no shipped artifact** — the reverse direction
(a policy or capability with no dispatcher) is unguarded, which is why both gaps survived with
every gate green.

## Goals

- [ ] `workflows/adr.md` invokes the configured Plan Challenge Gate explicitly, matching the
      shape `rfc.md` and `tdd.md` already use, so the policy's named full-gate set and the
      workflow files agree.
- [ ] A deterministic sensor fails when any workflow named in the bootstrap full-gate set
      lacks a Plan Challenge Gate step, so the next entry added to that list cannot silently
      repeat Gap 1.
- [ ] A new `designer` charter owns screen verification and screen implementation, including
      reading Figma through MCP, at `model_tier: standard` with scoped write permission.
- [ ] `designer` is dispatched **mandatorily** — conditional on the task touching a screen —
      from 7 workflows: `design`, `mobile-figma-audit`, `mobile-figma-fix`, `feature`,
      `general`, `spec-driven`, `implementation-fix`.
- [ ] `designer` reaches full parity with the other specialists across all four hosts
      (Claude, Codex, Cursor, OpenCode): registry, generator, both parity/integrity gate
      rosters, every plugin install path, the admin portal's agent inventory, and every doc
      that states the roster or its count.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Dispatching `designer` from the other 6 write-capable workflows (`debug`, `refactor`, `bugs-fix`, `code-quality-fix`, `requirements-fix`, `security-fix`) | User decision (this session): 7-workflow set chosen over the 13-workflow set. Those workflows modify screens but their primary verb is not "implement" |
| A `designer` persona in `skills/massa-ai/personas/catalog.json` | Persona ≠ sub-agent (`skills/persona-router/SKILL.md`). No persona was requested; the four existing overlaps in `references/routing-details.md` are unchanged |
| Retiring or narrowing `mobile-specialist` | Different job: platform/lifecycle/build expertise, not screen-vs-design conformance. Both charters coexist; the designer charter states the boundary |
| New Figma MCP tooling, adapters, or REST fallbacks | The charter consumes the Figma MCP surface the repo already documents in `references/figma-pre-analysis.md` and `references/figma-wiring.md` |
| `maestro.md` | E2E flow authoring, not screen implementation. Reaches `investigator` via the reuse scan already |
| Adding `designer` to `references/agent-orchestration.md` | Forbidden by an existing guard: `skills-harness-integrity.test.ts` asserts that file carries **no** charter paths (`expect(charterPaths).toEqual([])`). The roster lives once, in `skills/AGENTS.md` |
| Changing `skills/model-profiles.json` | Verified empty `agentTiers: {}`; the registry holds no agent list. `standard` resolves for all 4 hosts across all 7 profiles |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| A1 Dispatch set | 7 workflows: `design`, `mobile-figma-audit`, `mobile-figma-fix`, `feature`, `general`, `spec-driven`, `implementation-fix` | User selected the recommended option over the 3-workflow and 13-workflow alternatives | y |
| A2 Permission | Scoped write — screen/view/component/style files only, disjoint write set; joins `WRITE_AGENTS` | User selected the recommended option. Mirrors `test-engineer` (test files) and `documentation-agent` (doc files), the repo's existing scoped-writer precedent | y |
| A3 `model_tier` | `standard` | User specified "tier standard" explicitly. Matches `builder` and `test-engineer`, the other implementing roles | y |
| A4 "Mandatory" means conditional-mandatory | The dispatch fires whenever the task creates or modifies a user-facing screen. It is not skippable by the ordinary delegation gates (file count, module count, explicit user delegation) once that condition holds — a third standing policy exception alongside Plan Challenge and Independent Verification | An unconditional dispatch in `feature`/`general`/`spec-driven` would fire on every non-UI task, which is waste, not rigor. The condition is the trigger; once true, the dispatch is not optional | n — recorded as an accepted assumption |
| A5 `mobile-figma-audit` stays findings-only | `designer` is dispatched there read-only (verification lens), not as a writer | That workflow's own contract is "does not edit code". A scoped-writer charter dispatched read-only is expressed in the packet's `permissions:` line, which is per-dispatch | y (structural: the packet field exists) |
| A6 Admin portal needs no code change | `apps/tools-api/src/routes/model-registry.ts:79-88` (`loadAgentsInventory`) enumerates `skills/agents/` charters at request time and returns `{name, charterTier}` | Read this session. **Must be proven by execution, not by reading** — AC DSG-08 | n — verify in Execute |
| A7 Baseline fixture needs no `designer` entry | `subagent-parity.test.ts` derives `BASELINE_NAMES` from the frozen fixture's own keys; the fixture is pinned to `45daaa1` and "must never be regenerated". `judge`/`meta-judge` set this precedent | Read this session at `subagent-parity.test.ts:791-797` | y |

| A8 `mobile-figma-audit` dispatching a write-permitted charter | Accepted risk. It is the first findings-only workflow to do so; no host enforces the packet's read-only line, so the constraint is prompt-level plus charter Restrictions | Raised by the Plan Challenge Gate. Same property already holds for `test-engineer` and `documentation-agent`; the user explicitly asked for `mobile-figma-*` coverage | n — accepted, recorded |
| A9 Roster-gate offender population | 58 offenders across 19 files at `ROSTER = 18`, measured by simulating the gate against `git ls-files` — not the 26 files the ad-hoc sweep found | Raised by the Plan Challenge Gate; `marketplace.json` ×2, root `install.sh`, and `.ua/knowledge-graph.json` were outside every sweep path filter | y (measured) |

Open questions: none blocking. A4 (conditional-mandatory semantics) and A6 (admin portal
needs no code change) are recorded as accepted assumptions; A6 is discharged by executing
DSG-08 rather than by reading source.

## User Stories

**US-1 — As a workflow author, I want `adr` to run the Plan Challenge Gate it is already
assigned,** so that an architecture decision record is stress-tested before it is recorded as
final, and so the policy list and the workflow files cannot disagree.

**US-2 — As an agent implementing a screen, I want a specialist that reads the design source
and owns screen conformance,** so that screen work is checked against Figma or the supplied
design evidence by a charter obligation, not by whether the orchestrator remembered to look.

**US-3 — As a user on any of the four hosts, I want `designer` available exactly like the
other specialists,** so that installing, switching profiles, listing agents in the admin
portal, or reading the docs shows one consistent roster.

## Requirements

### ADR gate

- **ADRG-01** `skills/massa-ai/workflows/adr.md` carries an explicit numbered step that runs
  the configured Plan Challenge Gate, referencing the canonical policy the same way `rfc.md`
  and `tdd.md` do. Acceptance: the step exists, names the gate, and precedes the Evidence Gate
  step.
- **ADRG-02** A deterministic sensor asserts that every workflow named in the bootstrap
  full-gate list carries a Plan Challenge Gate step. Acceptance: the sensor is red when the
  step is removed from any one of those workflows, and green on the delivered tree. The
  full-gate list is **parsed from `skills/AGENTS.md`**, not hardcoded, so a future addition to
  the policy is covered without a test edit.

### Designer charter

- **DSG-01** `skills/agents/designer/SKILL.md` exists with `metadata.model_tier: standard`,
  `metadata.permission: write`, and a `## Restrictions` section carrying both persona-boundary
  lines verbatim (self-routing ban + precedence line) as
  `skills-harness-integrity.test.ts` requires of every charter.
- **DSG-02** The charter states its scoped write set (screen/view/component/style files, no
  production logic outside the UI layer), its Figma MCP read path, and its boundary against
  `mobile-specialist` and `builder`.
- **DSG-03** `skills/AGENTS.md` gains one Agent Table row and one Mapping table row; the "17
  reusable sub-agent skills" count becomes 18; the tail validator anchor `17 agents` becomes
  `18 agents`.
- **DSG-04** `scripts/generate-subagent-artifacts.ts` lists `designer` in `SPECIALIST_NAMES`
  and in `WRITE_AGENTS`.

### Dispatch wiring

- **DSG-05** Each of the 7 workflows in A1 carries a `> **Dispatch: \`massa-ai-designer\`**`
  block with the 8 body fields the Capability Packet projection requires (`trigger`, `scope`,
  `permissions`, `inputs`, `sensors`, `output`, `firewall`, `memory`) plus the optional
  `persona` line, matching the shape of the blocks already in those files.
- **DSG-06** Each block's `trigger:` states the conditional-mandatory rule from A4, and each
  workflow's prose names the dispatch as mandatory-on-condition rather than discretionary.
- **DSG-07** `references/agent-orchestration.md` gains a third standing-exception section
  documenting the screen-implementation mandate, **without** naming a charter path (the
  `charterPaths).toEqual([])` guard).

### Parity and availability

- **DSG-08** All four host bundles emit `massa-ai-designer`; `bun run generate:artifacts
  --check` reports no drift; the admin portal's `GET` model-registry response includes
  `{name: "designer", charterTier: "standard"}` — proven by executing the route or its
  inventory function, not by reading the source.
- **DSG-09** Gate rosters and counts updated: `subagent-parity.test.ts` (`SPECIALIST_NAMES`,
  `WRITE_AGENTS`, every `17` → `18`), `generate-subagent-artifacts.test.ts` (`17` → `18`,
  `68` → `72`), and the four plugin install suites plus
  `apps/opencode-plugin/src/__tests__/agents-install.test.ts` (`"17 subagent specialists"` →
  `"18 subagent specialists"`, roster arrays).
- **DSG-10** Docs updated with no count left stale. The authority for "no count left stale" is
  the roster gate in `workflow-harness-contract.test.ts`, which sweeps `git ls-files` with no
  path filter; acceptance is **its offender list reaching zero**, not a hand-enumerated file
  list. The measured population at `ROSTER = 18` is 58 offenders across 19 files: `README.md`
  (7), `FEATURES.md` (5 count claims + the role→tier table row `designer | standard` + the
  section heading anchor `README.md` links to), root `AGENTS.md`, `CLAUDE.md`,
  `docs/ONBOARDING.md`, root `install.sh` (6), `scripts/install-agents.sh` (5), both
  `marketplace.json` files, `.ua/knowledge-graph.json` (1), the 4 plugin install suites, the two
  generator-side suites, and `apps/opencode-plugin/src/config-cli.ts`. Plus a `CHANGELOG.md`
  `[Unreleased]` entry (CI merge gate; that file is excluded from the gate's own scan).
- **DSG-11** `skills/massa-ai/references/spec-driven/sub-agents.md` classifies `designer`
  correctly in its permission/tier guidance rows (it is a scoped writer, not a read-only
  specialist).

## Edge Cases

| Case | Expected behavior |
| --- | --- |
| Task touches no screen | No `designer` dispatch. The conditional trigger is false; this is the common path in `feature`/`general`/`spec-driven` |
| No design source supplied (no Figma link, no screenshot) | `designer` still runs; it verifies against the repo's own existing screen conventions and reports "no design source" as a skipped sensor rather than blocking |
| Figma MCP unavailable | Graceful degradation per `references/graceful-degradation.md`: report the skipped sensor with its reason; never claim design conformance was checked |
| `massa-ai-designer` not registered on the host | `references/agent-orchestration.md` Name Resolution: run the scope locally against the same output contract, report the skipped delegation in the Evidence Gate. Never retry under another name |
| `designer` and `builder` both active on one task | Disjoint write sets are mandatory. `designer` owns the UI layer; `builder` owns everything else. Overlap is a consolidation signal per Cognitive Locality |
| `mobile-figma-audit` (findings-only) | Dispatched read-only; the packet's `permissions:` line says read-only and the workflow's no-edit contract is unchanged |

## Requirement Traceability

| Requirement ID | Summary | Story | Phase | Status |
| --- | --- | --- | --- | --- |
| ADRG-01 | adr.md runs the Plan Challenge Gate | US-1 | Design | Pending |
| ADRG-02 | sensor parses the full-gate list from skills/AGENTS.md | US-1 | Design | Pending |
| DSG-01 | charter exists, tier standard, write, persona-boundary lines | US-2 | Design | Pending |
| DSG-02 | charter states scoped write set, Figma path, role boundaries | US-2 | Design | Pending |
| DSG-03 | skills/AGENTS.md rows + count + anchor | US-3 | Design | Pending |
| DSG-04 | generator SPECIALIST_NAMES + WRITE_AGENTS | US-3 | Design | Pending |
| DSG-05 | 7 Dispatch blocks with full packet projection | US-2 | Design | Pending |
| DSG-06 | conditional-mandatory trigger stated in each | US-2 | Design | Pending |
| DSG-07 | agent-orchestration.md standing exception, no charter path | US-2 | Design | Pending |
| DSG-08 | 4 host bundles + --check clean + portal inventory proven | US-3 | Design | Pending |
| DSG-09 | parity/generate/install gate rosters and counts | US-3 | Design | Pending |
| DSG-10 | docs and CHANGELOG, no stale count | US-3 | Design | Pending |
| DSG-11 | sub-agents.md permission classification | US-3 | Design | Pending |
