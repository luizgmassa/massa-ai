# Spec — skills/ directive dedup

- projectId: `massa-ai`
- workflowSessionId: `spec-skills-directive-dedup`
- workflow: spec-driven (Large — Specify + Design + Tasks + Execute)
- branch: `refactor/skills-directive-dedup`, worktree `.claude/worktrees/skills-dedup`,
  cut from `origin/main` @ `6d5dc6b`

## 1. Request, and how measurement changed it

The request was to "remove unnecessary/duplicated agents/workflow/references directions
in `skills/`". Two of that sentence's three premises did not survive measurement.

**Premise: there are unnecessary files to remove.** There are not.
`scripts/skills-reference-graph.ts` resolves every `skills/` file against the whole repo
(`skills/`, `scripts/`, `apps/`, `packages/`, `docs/`, `.specs/`, and the five root docs)
and reports **0 orphans and 0 weakly-referenced files** across 151 files (148 `.md`,
2 `.json`, 1 `.py`; an earlier draft said 152, which counted `.DS_Store`). Nothing under
`skills/` is unreachable. "Removing a file" here would mean retiring a capability, not
deleting redundancy — and `workflow-harness-contract.test.ts:39` pins
`EXPECTED_WORKFLOW_COUNT = 36`, so it is a deliberate decision with a 600-file blast
radius across four checked-in plugin bundles. **Explicitly out of scope** (§7).

**Premise: duplication is the problem.** It is a small part of it. Measured by
`scripts/skills-duplication-metric.ts` over 148 Markdown files / 12,624 normalized lines:

| window | duplicatedLines | excessLines (removable) |
| --- | --- | --- |
| 3 | 757 (6.0%) | 421 (3.3%) |
| 4 | 535 (4.2%) | **313 (2.5%)** |
| 5 | 367 (2.9%) | 207 (1.6%) |

Of the 313 at window=4, ~77 lines are frontmatter that
`scripts/generate-subagent-artifacts.ts` parses and ~34 are charter `## Restrictions`
text that `skills-harness-integrity.test.ts` asserts byte-identical across all 17
charters. Both are **mandated**, not accidental. The literal-dedup ceiling is under 200
lines of 12,624 — around 1.5%.

**What measurement did surface**, and what this feature is actually for: the same audit
found four *correctness* defects hiding inside the duplication, each shipping today to
every user through four plugin bundles. Those, not the line count, are the deliverable.

The user selected scope tier B (single-source + fix drift + collapse the audit/fix
family scaffolding) and elected to ship the metric as a committed ceiling gate.

## 2. Requirements

### Correctness defects (the reason this feature is worth doing)

**SDD-01 — `skills/AGENTS.md` must stop naming models.**
`skills/model-profiles.json:$comment` states it is *"THE only hand-authored place that
names a model or an effort level for any host."* `skills/AGENTS.md:342-360` is a second
one: an Agent Table "Model hint" column hand-naming a model per agent, for an unstated
host. It is already wrong. Resolving each charter's `metadata.model_tier` against
`profiles.balanced.hosts.opencode`:

| role | tier | registry | `AGENTS.md:342-360` | |
| --- | --- | --- | --- | --- |
| planner | `deep` | `opencode-go/minimax-m3` | `GLM-5.2` | stale |
| requirements-analyst | `standard` | `opencode-go/glm-5.2` | `DeepSeek V4 Pro` | stale |
| judge | `deep` | `opencode-go/minimax-m3` | `deepseek-v4-pro` | no profile assigns it |
| meta-judge | `deep` | `opencode-go/minimax-m3` | `kimi-k3` | profile-ambiguous |
| other 13 | — | — | — | match |

`meta-judge`'s row is the worst of the four, not the mildest. `kimi-k3` is the
`deep` model under `heavy`, `home`, `open_models` and `local_models` — four of
the seven profiles — and is wrong under the shipped default `balanced`. Because
the column named a model without naming a profile or a host, that entry reads as
correct to anyone running `heavy` and is silently wrong for everyone on the
default. A plainly stale value announces itself; an unqualified one does not.

The two stale rows are exactly two of the three roles PR #51 renormalized
(`navigator`→light, `requirements-analyst`→standard, `planner`→deep); the column was
never updated with them. `navigator` matches only by luck — its old and new tiers happen
to resolve to the same OpenCode model. `judge`/`meta-judge` compound it: their own
charters (`skills/agents/judge/SKILL.md:85-91`,
`skills/agents/meta-judge/SKILL.md:76-81`) explicitly say
`workflows/judge-with-debate.md` is the single source for slot assignment "not this
file" — and `AGENTS.md` names models for them anyway, a third site.

No gate catches this. `subagent-parity.test.ts:455-542` scans `FEATURES.md` for leaked
model IDs and only `FEATURES.md`.

- **AC-1** The "Model hint" column is gone from the `skills/AGENTS.md` Agent Table, or
  carries `metadata.model_tier` values (`light`/`standard`/`deep`) — the fact the
  charter actually owns — and never a model display name.
- **AC-2** A scripted scan proves no model display name or model ID appears anywhere in
  `skills/AGENTS.md`. The scan runs over the file as committed, and is a test, not a
  one-off command.
- **AC-3** The scan fails if a model name is reintroduced. Demonstrated by mutation.

**SDD-02 — no shipped harness file may carry an absolute path from one developer's
machine.** `references/maestro.md:9`, `references/maestro/fact-ledger.md:10` and
`:42` cite `/Users/luizmassa/Downloads/questions.md` as a coverage checklist and as a
named tier of the fact ledger's evidence taxonomy. That path is outside the repository
and cannot resolve for any other developer, any CI runner, or any other session — and
these three files are copied verbatim into all four `apps/*-plugin/skills/` bundles and
published to npm. An agent told to quarantine an item as `excluded/unverified` unless it
appears in that file is following an unreachable rule.

- **AC-4** No file under `skills/` contains an absolute path under `/Users/` or
  `/home/`. Enforced by a test, mutation-demonstrated.
- **AC-5** The Maestro coverage-checklist rule still exists and is still followed —
  rewritten to name a repo-relative location or to drop the unreachable dependency.
  Deleting the rule silently is a failure of this requirement.

**SDD-03 — the Knowledge Verification Chain must have exactly one owner.**
It is stated in full twice (`workflows/spec-driven.md:147-164`,
`workflows/exploration.md:19-36`), named by two more files, and owned by none.
`references/spec-driven/design.md:44` points readers at `SKILL.md` for it —
**`SKILL.md` has never contained the string** (verified: 0 occurrences). The two full
copies have already drifted: `exploration.md:36` closes `"I don't know" beats
invention.`; `spec-driven.md:164` closes `Uncertainty is always preferable to
fabrication; invented APIs/patterns cause cascading failures across design → tasks →
implementation.` `design.md:44-52` then re-inlines a differently-worded third copy.

- **AC-6** Exactly one file under `skills/` states the chain's five steps and its guard
  bullets. Every other mention is a pointer to that file.
- **AC-7** The `design.md:44` pointer resolves to a file that contains the chain.
- **AC-8** Both drifted closing rules are reconciled into one agreed wording; the
  surviving text keeps the stronger of the two claims, not the shorter.

**SDD-04 — a duplicated Output Contract must not diverge.**
`references/debug-diagnosis-loop.md:126-131` and `workflows/debug.md:68-74` state the
same six-bullet Output Contract; `debug.md` carries a seventh bullet (`For mobile bugs:
device matrix, platform parity, …`) that the reference lacks. `debug.md:12` already
loads the reference.

- **AC-9** One file owns the debug Output Contract. The mobile bullet survives
  wherever it lands — reconciliation, not truncation.

### Duplication removal (scope tier B)

**SDD-05 — single-source restatements whose owning reference is already loaded.**
Each of these restates a rule another file owns, in a file that already carries a load
instruction for that owner, and none is asserted by any guard test (checked against
`skills-harness-integrity`, `workflow-harness-contract`, `validate-repository`,
`skill-artifact-parity`, `subagent-parity`):

| restatement | owner | loader present |
| --- | --- | --- |
| `workflows/exploration.md:7-17` Golden Rules | `references/codebase-investigation.md:5-13` | `exploration.md:40` |
| `workflows/the-fool.md:55-63` critique fields | `references/agent-orchestration.md:186-194` | `the-fool.md:49` |
| `references/spec-driven/sub-agents.md:135-143` chat template | `references/spec-driven/validate.md:240-248` | `sub-agents.md:119,121` |
| `SKILL.md:247-250` memory tags/types | `references/memory-policy.md:14,44-54` | `SKILL.md:75` |
| `SKILL.md:221-224` retrieval steps 7-10 | `references/mcp-tools.md:151-154` | `SKILL.md:44` |

- **AC-10** Each row's restatement is replaced by a pointer to its owner.
- **AC-11** `SKILL.md:60-62` is untouched — `validate-repository.test.ts:191-193`
  asserts it and it is a different sentence from the tags list.

**SDD-06 — collapse the `*-audit.md` / `*-fix.md` family scaffolding into
`references/audit-scope.md`.** All six `*-audit.md` files already load it at step 2.
Targets, all verified byte-identical or near-identical across six files:
commit-range resolution (5 bullets × 6), the scope packet restatement (1 × 6), the
staged/unstaged and generated-path exclusion bullets (2 × 6), the "ask for the target
area" bullet (1 × 6), the false-positive opening bullet (1 × 6), and the severity-rule
header (1 × 6).

- **AC-12** Every extracted rule is stated once in `references/audit-scope.md` and
  removed from all six workflow bodies.
- **AC-13** The per-lens content that makes each workflow distinct is untouched:
  lens definition, finding taxonomy, severity qualitative clauses, investigation
  sensors, and each `*-fix.md`'s remediation methods.
- **AC-14** The findings-only gate at each `*-audit.md:9` **stays inline**. It sits
  above step 1, before any reference load happens; moving it would trade a
  zero-dependency gate for a load-dependent one.

**SDD-07 — `judge` and `meta-judge` must appear in the orchestration Roles table.**
`references/agent-orchestration.md` names 15 of 17 charter paths; `judge` and
`meta-judge` appear nowhere in it (verified: 0 occurrences of either charter path).
`skills-harness-integrity.test.ts:174-204` only checks that mentioned paths resolve, so
an unmentioned charter is invisible to it.

- **AC-15** All 17 charter paths appear in `references/agent-orchestration.md`.
- **AC-16** A test asserts the Roles table covers every directory under
  `skills/agents/`, closing the gap rather than fixing the two instances.

**SDD-08 — `CLAUDE.md` says the registry holds "15 sub-agent specialists"; it holds 17.**
`workflow-harness-contract.test.ts:348-371` bans the string "16 specialists" and does
not ban 15.

- **AC-17** The count is correct, and the roster guard rejects any wrong count, not
  just the one wrong count it was written against.

### The gate

**SDD-09 — ship the duplication metric as a regression gate.**

- **AC-18** `scripts/skills-duplication-metric.ts` and
  `scripts/skills-reference-graph.ts` are committed with unit tests, and both are
  reached by `bun run test:scripts`.
- **AC-19** A ceiling on `excessLines` at window=4 fails when duplication grows and
  passes when it shrinks. A snapshot equality assertion is not acceptable — it would go
  red on any unrelated edit.
- **AC-20** The orphan count stays 0.

## 3. Negative requirements — duplication that must survive

Removing any of these is a regression, not a cleanup. Each is deliberate, and three are
mechanically enforced.

| Duplication | Why it stays | Enforced by |
| --- | --- | --- |
| The persona clause in all three Capability Packet definitions | each file is independently loadable; a pointer breaks when only one copy is in context | `skills-harness-integrity.test.ts:437-441,525-556` |
| The persona bullet in all 22 workflow `Dispatch:` blocks | `agent-orchestration.md:65-67`: dispatch must not depend on that file being loaded, and it is loaded conditionally | `skills-harness-integrity.test.ts:665-690` |
| The 4 fixed sentences in every charter `## Restrictions` | a subagent receives only its charter and is forbidden from loading routers | `skills-harness-integrity.test.ts:422-424,559-586` |
| Charter frontmatter (`description`, `metadata.model_tier`, `metadata.permission`) | parsed by `generate-subagent-artifacts.ts:198-231` | that generator + `:370-414` |
| The Graceful Degradation table in `SKILL.md` | router's stated scope includes runtime contract, not routing alone | `validate-repository.test.ts:1026-1029` |
| Charter Output/Memory-Boundary prose | same self-containment reason as Restrictions; no charter lists the shared references as something it may open | — (design intent) |
| Every workflow's `references/project-context.md` intake line | derived from disk so a new workflow cannot skip it | `workflow-harness-contract.test.ts:207-221` |
| The 3 mutation-reference loads in exactly the 16 implementation workflows | asserted in both directions | `workflow-harness-contract.test.ts:225-258` |

**SDD-10** — no change may alter `EXPECTED_WORKFLOW_COUNT`, the router table's 36 rows,
the read-only complement of 20, or the 17-charter roster.

## 4. Verification

- `bun run test:scripts` — the aggregate that reaches every guard above.
- `bun run test:plugins`.
- `bun scripts/generate-skill-artifacts.ts --check` → `No drift` (four bundles,
  ~580 files).
- `bun scripts/generate-subagent-artifacts.ts --check`.
- `bun run lint`.
- `bun scripts/skills-duplication-metric.ts skills --window=4` — excess below ceiling.
- `bun scripts/skills-reference-graph.ts` — orphans still 0.

Baseline must be measured in the worktree **after `bun install` and `bun run build`**.
An unbuilt worktree moves failures rather than reducing them (`model-profile-registry`
spec §8).

## 5. Out of scope

- Deleting or merging any workflow, reference, charter, or persona file. Nothing is
  orphaned; removal would retire capability. Changes `EXPECTED_WORKFLOW_COUNT`, the
  router table, and ~580 checked-in bundle files.
- Collapsing the six audit lenses into one parameterized workflow. Their investigation
  sensors, false-positive checklists, severity clauses, and remediation methods are
  irreducibly different.
- `references/tdd/` vs `references/rfc/`: the shared three-filename convention is a
  structural template over disjoint content (measured: ~100, ~223 and ~186 line diffs
  on the three pairs). Not duplication.
- `references/the-fool/`'s seven mode files: distinct techniques.
- `references/architecture-lenses.md`'s condensed lens summaries: a drift *risk*, not
  yet drifted (both copies currently agree on the four-category taxonomy). Recorded, not
  fixed.
- Editing `apps/*-plugin/` by hand. Those are generated.

## 6. Open questions

None. Scope tier and metric disposition were decided by the user; every other choice is
determined by a guard test or by measurement.

## 7. Corrections to claims made during discovery

Recorded so they are not re-derived, and because two of them were wrong in a direction
that would have caused damage.

1. **The metric's first implementation over-reported what was removable.** Its docblock
   claimed occurrences were counted "beyond the first" while the code counted every
   copy. `duplicatedLines` is the footprint; `excessLines` is the removable figure. Both
   are now reported and the difference is stated at every use.
2. **`architecture-specialist` does define a `lens` input.** A discovery pass reported
   `agent-orchestration.md:88-90` documenting a `lens` selector the charter lacks.
   Direct check: the charter matches on `lens`. Not a defect; dropped.
3. **The "identical 7-line frontmatter across 13 charters" figure was wrong.**
   `license`/`author`/`version` are identical across all 17, but `model_tier` and
   `permission` vary, so no 7-line contiguous span is shared by 13 files. The true
   shared span is 4 lines.
4. **`navigator`'s Model hint matching the registry is luck, not correctness.** It is
   one of the three roles PR #51 renormalized; its old and new tiers happen to resolve
   to the same OpenCode model. Independently confirmed by the plan critic against
   `git diff 45daaa1 6d5dc6b`: the same retier moved navigator's *Claude* pin from
   `sonnet` to `haiku` while its OpenCode value stayed put. It must not be read as
   evidence the column was maintained.

5. **The metric's own blind spot appeared inside this plan.** P5 was scoped to the four
   lines the window=4 shingle metric could prove identical between `SKILL.md` and
   `mcp-tools.md`. The plan critic found that items 1–6 and 11 of the same numbered
   retrieval procedure are paraphrase-duplicates between the same two files — invisible
   to shingling by construction, which is the limitation §1 states and the plan then
   failed to apply to itself. Extracting the visible four would have split one list
   across two files and left the larger duplicate. Recorded as amendment A6; P5 is
   re-scoped before T7 runs.

6. **Two defects in this feature's own instruments, both caught by writing a
   discriminating test rather than by reading output.** The duplication metric's
   docblock described counting occurrences "beyond the first" while the code counted
   every copy, so the figure quoted as a saving was roughly double; `duplicatedLines`
   and `excessLines` are now separate and the arithmetic has its own test. The
   reachability scan accepted a bare container directory as a reference form, so the
   string `references/` — present in nearly every workflow file — marked every reference
   reachable; the reported 0 orphans survived the fix, but the reason for it did not.
   Both outputs were stable and plausible throughout.
