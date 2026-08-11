# Designer Agent + ADR Plan-Challenge Gate Design

- Feature slug: `designer-agent`
- Spec: `.specs/features/designer-agent/spec.md`

## Design Summary

Two independent deliverables share one branch because both close the same class of defect —
a contract that exists in one place and is unreachable from the place that must honor it.

**Deliverable A (ADRG-01/02) — one step plus one filesystem-derived sensor.** `adr.md` gains a
numbered "Run the configured Plan Challenge Gate" step in the same shape `rfc.md:37` and
`tdd.md:51` already carry, placed before the Evidence Gate step. The recurrence guard lives in
`scripts/__tests__/workflow-harness-contract.test.ts` — the existing home for
"derive the workflow set from disk and assert both directions". The sensor **parses the
full-gate list out of `skills/AGENTS.md`** rather than hardcoding it, so the next workflow name
added to that policy line is covered with no test edit. That parse direction is the load-bearing
choice: a hardcoded list would have to be edited by the same person who forgets the workflow
step, which is the failure being fixed.

**Deliverable B (DSG-01..11) — one charter, seven dispatch blocks, one standing exception, and
the parity tail.** The charter `skills/agents/designer/SKILL.md` is authored from the
`test-engineer` template (the repo's scoped-writer precedent: `permission: write` in frontmatter,
the write scope narrowed in prose under `## Restrictions`), at `model_tier: standard`. Adding the
directory is what makes the agent real: the generator enumerates `skills/agents/*/SKILL.md`, the
admin portal's `loadAgentsInventory` enumerates the same directory at request time, and both
installers derive their printed count from the emitted file set. Everything else in the tail is
either a hardcoded roster in a gate (which must be edited) or a hardcoded count in a doc (which
must be edited).

The dispatch is **conditional-mandatory**: the condition is "the task creates or modifies a
user-facing screen"; once true, the dispatch is not subject to the ordinary delegation gates.
That is expressed exactly like the two exceptions already in
`references/agent-orchestration.md` — a named `## … Exception` section in that file, plus an
inline `> **Dispatch:**` block in each of the 7 workflows carrying the condition on its
`trigger:` line. The inline copy is not redundancy: `agent-orchestration.md` states the
convention (lines 96-97) that a dispatch block must never depend on that file being loaded, and
`skills-harness-integrity.test.ts` parses those inline blocks as its dispatch-resolution
population.

### Ordered change surface

| # | File | Change | Requirement |
| --- | --- | --- | --- |
| 1 | `skills/agents/designer/SKILL.md` | new charter, `model_tier: standard`, `permission: write` | DSG-01, DSG-02 |
| 2 | `scripts/generate-subagent-artifacts.ts` | `SPECIALIST_NAMES` + `WRITE_AGENTS` | DSG-04 |
| 3 | `skills/AGENTS.md` | Agent Table row, Mapping row, `17`→`18`, anchor `17 agents`→`18 agents` | DSG-03 |
| 4 | `skills/massa-ai/references/agent-orchestration.md` | Screen Implementation Exception section (no charter path) | DSG-07 |
| 5 | `skills/massa-ai/workflows/design.md` | Dispatch block | DSG-05, DSG-06 |
| 6 | `skills/massa-ai/workflows/mobile-figma/mobile-figma-audit.md` | Dispatch block, read-only packet | DSG-05, DSG-06 |
| 7 | `skills/massa-ai/workflows/mobile-figma/mobile-figma-fix.md` | Dispatch block | DSG-05, DSG-06 |
| 8 | `skills/massa-ai/workflows/feature.md` | Dispatch block | DSG-05, DSG-06 |
| 9 | `skills/massa-ai/workflows/general.md` | Dispatch block | DSG-05, DSG-06 |
| 10 | `skills/massa-ai/workflows/spec-driven.md` | Dispatch block | DSG-05, DSG-06 |
| 11 | `skills/massa-ai/workflows/implementation/implementation-fix.md` | Dispatch block | DSG-05, DSG-06 |
| 12 | `skills/massa-ai/workflows/adr.md` | Plan Challenge Gate step | ADRG-01 |
| 13 | `scripts/__tests__/workflow-harness-contract.test.ts` | full-gate sensor (ADRG-02) **and** `ROSTER = 17`→`18`, correct-spelling fixtures, installer-advertises assertion | ADRG-02, DSG-09 |
| 14 | `scripts/__tests__/subagent-parity.test.ts` | roster array + `WRITE_AGENTS` + 14 count sites | DSG-09 |
| 15 | `scripts/__tests__/generate-subagent-artifacts.test.ts` | 7 sites: `17`→`18`, `68`→`72` | DSG-09 |
| 16 | `scripts/__tests__/generate-subagent-artifacts-prune.test.ts` | 2 sites | DSG-09 |
| 17 | `scripts/__tests__/validate-repository.test.ts` | 2 sites (`registry preserved (17 agents)`, `one subdir per agent (17)`) | DSG-09 |
| 18 | `scripts/__tests__/verify-model-tokens.test.ts` | `68`→`72` assertion + comment arithmetic | DSG-09 |
| 19 | `scripts/__tests__/verify-package-contents.test.ts`, `scripts/__tests__/skills-duplication-metric.test.ts` | comment counts (`14/17 deep` → `14/18`; designer is `standard`, so the deep count is unchanged) | DSG-09 |
| 20 | `apps/{claude,codex,cursor}-plugin/__tests__/install.test.ts` | roster arrays + `"17 subagent specialists"` | DSG-09 |
| 21 | `apps/opencode-plugin/src/__tests__/agents-install.test.ts` | roster array + count strings | DSG-09 |
| 22 | `apps/opencode-plugin/src/config-cli.ts` | help text ×2 (`Manage the 17 …`, `Write 17 agent .md files`) | DSG-09 |
| 23 | `scripts/install-agents.sh` (5 advisory lines), root `install.sh` | `"17 subagent specialists"` | DSG-09 |
| 24 | `scripts/generate-subagent-artifacts.ts` header comment | `68 files (17 x 4 hosts)` | DSG-09 |
| 25 | `skills/massa-ai/references/spec-driven/sub-agents.md` | permission classification row | DSG-11 |
| 26 | `FEATURES.md` (10), `README.md` (7), `AGENTS.md`, `CLAUDE.md`, `docs/ONBOARDING.md` | counts, roster lists, tier table row `designer \| standard` | DSG-10 |
| 27 | `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json` | marketplace `description` copy | DSG-10 |
| 28 | `.ua/knowledge-graph.json` | one targeted string replacement (D-9) | DSG-10 |
| 29 | `scripts/__tests__/workflow-harness-contract.test.ts` `HISTORICAL` | 2 new allowlist entries covering the 5 pyts-golden fixture lines (D-8) | DSG-09 |
| 30 | `CHANGELOG.md` | `[Unreleased]` entry | DSG-10 |

**Rows 27-29 came from the Plan Challenge Gate, not from the sweep.** Simulating the roster
gate at `ROSTER = 18` against the real `git ls-files` population returned **58 offenders across
19 files** where the ad-hoc sweep had found 26 files, and three of the offender classes —
both `marketplace.json` files, root `install.sh` (6 lines), and `.ua/knowledge-graph.json` —
were in none of the sweep's path filters. This is the evidence for making the gate, not the
script, the authority for DSG-10: the gate reads `git ls-files` with no path filter at all.

Rows 13-24 were **not** in the first draft of this table. They come from a scripted sweep
(`scripts/tmp-count-sweep.sh`, deleted at close-out) whose first two runs returned `0` matches on
a subject that demonstrably has 9 — this git build's ERE engine does not honour `\b`, so
`git grep -E '\b(17|68)\b'` matches nothing while BRE and `-P` both match. The corrected sweep
returned **182 raw / 92 roster-count hits across 26 files**, plus a second numeric-assertion pass
returning **14 hits** (one a false positive: `compressed-content.test.ts:177`
`tokensSaved).toBe(17)`, unrelated). Two files the sweep's own path filter would still have
missed — root `install.sh` and `CLAUDE.md` — are caught by row 13's gate, which is why that gate,
not the ad-hoc script, is the authority for DSG-10.

Order matters at exactly two points: (1) and (2) must land before any regeneration, or
`--check` compares against a bundle the generator cannot produce; (13)-(24) must land in the same
commit as the regeneration that changes the file counts, or the gate is red between commits.

### Charter outline (DSG-01, DSG-02)

Sections follow the `test-engineer` template verbatim in structure: Mission, Responsibilities,
Restrictions, Inputs, Outputs, Invocation (Use when / Do not use when), massa-ai Integration,
Validation Sensors, Memory Boundary.

- **Mission** — verify and implement user-facing screens against their design source.
- **Write scope** — screen, view, component, layout, style, and design-token files. No
  production logic outside the UI layer; no navigation graph, data layer, or build config.
  Same disjoint-write-set constraint as `builder`.
- **Figma path** — reads Figma through the MCP surface the repo already documents; loads
  `references/figma-pre-analysis.md` and `references/figma-wiring.md` on demand. A missing or
  unavailable design source is a reported skipped sensor, never a silent pass.
- **Boundary against `mobile-specialist`** — that charter owns platform, lifecycle, build, and
  offline-sync behavior; this one owns screen-vs-design conformance. A mobile screen task can
  legitimately dispatch both, with disjoint scopes.
- **Boundary against `builder`** — `builder` owns everything outside the UI layer. Overlapping
  write sets are a consolidation signal under Cognitive Locality, not a parallel dispatch.
- **Restrictions** — both persona-boundary lines verbatim, as
  `skills-harness-integrity.test.ts` requires section-scoped of every charter.

## Tech Decisions

| # | Decision | Alternatives rejected | Why |
| --- | --- | --- | --- |
| D-1 | Conditional-mandatory trigger, expressed as a third standing exception in `agent-orchestration.md` + inline blocks | (a) unconditional dispatch in all 7; (b) mandatory only in the 3 UI/Figma workflows | (a) fires `designer` on every non-UI `feature`/`general`/`spec-driven` task — waste that trains orchestrators to skip it. (b) leaves `feature`/`general`/`spec-driven` able to build a screen ungated, which is Gap 2 restated |
| D-2 | ADRG-02 sensor parses the full-gate list from `skills/AGENTS.md` | Hardcode `[spec-driven, feature, adr, rfc, tdd, refactor]` in the test | A hardcoded list needs the same edit the workflow needs; it cannot catch the next omission. Parsing makes the policy line itself the population |
| D-3 | Charter at `model_tier: standard` | `deep` (every read-only specialist's tier) | User specified `standard`. Consistent with the other implementing roles: `builder` and `test-engineer` are both `standard` |
| D-4 | `permission: write`, scope narrowed in `## Restrictions` prose | A new frontmatter field, e.g. `write_scope:` | The generator emits only documented per-host keys and a per-host allowed-key test fails on an undocumented one. `test-engineer`/`documentation-agent` already encode their narrower scope in prose; a third mechanism would be a new contract for no new capability |
| D-5 | No entry in the frozen parity baseline fixture | Regenerate the fixture to include `designer` | The fixture is pinned to `45daaa1` and documented "must never be regenerated". `judge`/`meta-judge` set the precedent: a role with no "before" is covered by the registry-derived assertions instead |
| D-6 | `designer` absent from `references/agent-orchestration.md`'s roster/legacy tables | Add it for discoverability | `skills-harness-integrity.test.ts` asserts `charterPaths).toEqual([])` there, and the legacy table is for renamed roles only. `designer` is new and has no legacy name |
| D-7 | Portal parity proven by executing `loadAgentsInventory`, not by reading it | Assert from source reading | A6 is an assumption until run. The repo's own recorded lesson is that a dynamic enumeration can be blocked by a filter the reader did not notice |
| D-8 | The 5 `scripts/__tests__/fixtures/pyts-golden/lessons*.json` lines go into the roster gate's `HISTORICAL` allowlist, not edited | (a) edit the fixtures; (b) exclude `fixtures/` from the scan | (a) breaks `pyts-golden.test.ts`, which imports both files as frozen inputs (`with { type: "json" }` / `{ type: "text" }`) and writes them into a temp root — the text *is* the fixture. (b) excludes a whole directory to fix five historical sentences. The allowlist is the mechanism the gate's own docstring designs for this: "Statements that narrate a PAST roster size and are correct as written". The text — "A registry-count change (15→17 specialists) shipped green under test:scripts but CI went red" — is exactly that |
| D-9 | `.ua/knowledge-graph.json` gets a targeted single-string replacement | (a) exclude `.ua/` from the scan; (b) regenerate the knowledge graph | It is tracked, 2.0 MB, and carries **one** occurrence (`17 subagent specialist`, singular). (a) is a gap-exclusion, not a gap-closure. (b) is an unrelated skill run whose output would churn the whole file |

## Risks & Concerns

| Risk | Impact | Mitigation |
| --- | --- | --- |
| The 7 inline Dispatch blocks drift apart in wording, so "mandatory" reads as advisory in some | Orchestrators skip the dispatch where the wording is weakest — Gap 2 partially reopens | One block text authored once and adapted per workflow only in `scope`/`permissions`; a Tasks-phase check greps all 7 for the shared trigger sentence |
| `bun run generate:artifacts` reads the local profile overlay, so a cited `--check` run can reflect a developer's `~/.config` rather than the built-in registry | A green `--check` that would be red in CI | Run every cited generation/`--check` under a scratch `XDG_CONFIG_HOME` (recorded repo lesson) |
| Count edits are mechanical and easy to under-sweep — a stale `17` or `68` survives in a file the sweep did not enumerate | A doc or gate contradicts the shipped roster | Enumerate the population from `git grep` over tracked files (excluding `.claude/worktrees`, a sibling worktree that duplicates every path) and print the total before the rows |
| `skills-harness-integrity.test.ts` counts Dispatch blocks (`>= 20`) and requires every target to exist in all 4 host dirs; bundles are gitignored and generated on demand | The suite fails on a fresh checkout in a way that reads as a code defect | Regenerate before running; the suite's own `beforeAll` names `bun run generate:artifacts` on absence |
| `mobile-figma-audit` is findings-only; dispatching a write-permitted charter there could be read as authorizing edits | An audit workflow starts editing | The packet's `permissions:` line says read-only, and the workflow's no-edit contract is untouched. Charter Restrictions win over the packet on conflict, and the charter permits writes only when explicitly scoped |
| Two deliverables on one branch | A revert of one reverts the other | Separate atomic commits per task; the ADR work is tasks T1-T2, entirely disjoint from the designer files |
| `mobile-figma-audit` becomes the **first** findings-only workflow to dispatch a write-permitted charter. On Cursor a write agent ships without `readonly: true`, so the host grants write while only the packet says read-only | An audit run edits code | Accepted risk, recorded in `spec.md` A8. Three layers hold it: the packet's `permissions: read-only`, the charter's `## Restrictions` ("write only when explicitly scoped with a disjoint write set", and Restrictions win over the packet on conflict), and the workflow's own unchanged no-edit contract. Host-level enforcement is not available for any scoped writer today — `test-engineer` and `documentation-agent` have the same property |
| A gate asserting a hardcoded **name array** with no count literal would be invisible to both sweeps | A suite goes red after the roster changes, discovered only in CI | T9's gate is the full `bun run test:scripts`, not the named files, and its result is diffed against the T0 baseline (259 pass / 0 fail on the 4 touched suites; full-suite baseline captured at T9) |
| The `[Unreleased]` CHANGELOG heading choice drives the release bump | A wrong heading cuts a wrong version | `CONTRIBUTING.md` § CHANGELOG authoring owns the heading→bump table; a new agent + new gate is `### Added` |

## Verification Plan

| Requirement | Deterministic sensor |
| --- | --- |
| ADRG-01 | `grep` the gate step in `adr.md`; the new sensor in (13) passes |
| ADRG-02 | Remove the step from `adr.md` in scratch → sensor RED; restore → GREEN. Repeat for one other full-gate workflow to prove the parse covers the whole list, not just `adr` |
| DSG-01/02 | `bun test scripts/__tests__/skills-harness-integrity.test.ts` (charter registration, permission agreement, persona-boundary lines) |
| DSG-03/04 | same suite: "every charter is registered in `skills/AGENTS.md` and in the generator" |
| DSG-05/06 | `bun test scripts/__tests__/skills-harness-integrity.test.ts` (dispatch resolution, all 4 host dirs); grep all 7 for the shared trigger sentence |
| DSG-07 | same suite: `charterPaths).toEqual([])` still green with the new section present |
| DSG-08 | `bun run generate:artifacts --check` under scratch `XDG_CONFIG_HOME`; execute `loadAgentsInventory` and assert the `designer` row |
| DSG-09 | `bun test scripts/__tests__/subagent-parity.test.ts scripts/__tests__/generate-subagent-artifacts.test.ts`; `bun run test:plugins` |
| DSG-10/11 | `bun run test:scripts`; a scripted stale-count sweep over tracked files printing its total before its rows |
