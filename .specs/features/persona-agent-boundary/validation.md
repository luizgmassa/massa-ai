# Validation — Persona / Sub-Agent Boundary

- Verdict: **PASS**
- Verifier: verification-agent (author != verifier)
- Worktree: `/Users/luizmassa/Projects/massa-ai-wt-persona-agent-boundary` (branch `feat/persona-agent-boundary`)
- Diff range: `77dd144..HEAD` (6 commits: d91f840, 02fb845, 999913d, 8197d85, dc0b890, abaf4ec)

## Scope: files changed by category

- **Test source (T1):** `scripts/__tests__/skills-harness-integrity.test.ts` (+140 lines, new
  `describe("persona / sub-agent boundary")` block, 9 cases, header comment entry 7).
- **Packet definitions (T2, PAB-01):** `skills/AGENTS.md`,
  `skills/massa-ai/references/agent-orchestration.md`,
  `skills/massa-ai/references/subagent-design.md` — each +1 line.
- **Charter sources (T3, PAB-02/PAB-06):** all 15 `skills/agents/*/SKILL.md`, each +3/-1.
- **Router prose (T4, PAB-03/04/05/07):** `skills/persona-router/SKILL.md`, +20/-1.
- **Registry doc (T5, PAB-01 Step 2):** `skills/AGENTS.md` § How to Add an Agent.
- **CHANGELOG (T7, PAB-10):** `CHANGELOG.md`, new `[Unreleased] ### Changed` entry.
- **Generated mirrors (PAB-08, both generators, no source logic):** 122 files under
  `apps/{claude,codex,cursor,opencode}-plugin/skills/agents/**` and
  `apps/{claude,codex,cursor,opencode}-plugin/agents/massa-ai-*.{md,toml}` (charter mirror),
  plus 4 files under `apps/*/skills/persona-router/SKILL.md` (router mirror).
- Total: 156 files changed, 1055 insertions, 141 deletions (`git diff --stat 77dd144..HEAD`).
- Confirmed **no** touch to `services/structural`, `prisma/migrations`, or
  `verify-tree-sitter*` (`git diff --stat` against those paths returns empty).

## Per-AC evidence

| Req | AC | Verdict | Evidence |
|---|---|---|---|
| PAB-01 | AC1 all 3 packet files list `persona` field | PASS | `skills/AGENTS.md:317`, `skills/massa-ai/references/agent-orchestration.md:115`, `skills/massa-ai/references/subagent-design.md:106` — grep confirms all three |
| PAB-01 | AC2 optional/advisory/never-overrides stated | PASS | All three lines read identically: "optional. The cataloged persona id ... passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions. Pass the id alone, never the persona prompt." — byte-identical past "permissions" per design A1 |
| PAB-01 | AC3 test fails if field dropped from one copy | PASS | Discrimination mutation 1 (deleted line from `skills/AGENTS.md`) → 2 tests failed, reverted clean |
| PAB-02 | AC1 all 15 charters carry the precedence line | PASS | Shell scan of all 15 `## Restrictions` spans: `shapes emphasis only; these Restrictions win on any conflict` present in all 15 |
| PAB-02 | AC2 line sits in `## Restrictions` | PASS | Same scan confirms location; `builder/SKILL.md:29` shown as representative |
| PAB-02 | AC3 disk-enumerated, not hardcoded | PASS | `charterNames()` reads `fs.readdir` on `skills/agents/`; discrimination mutation 6 (added 16th fake charter dir) was caught without any list edit |
| PAB-02 | AC4 section-scoped (not whole-file) | PASS | Discrimination mutation 3 (moved the precedence line from `## Restrictions` into `## Inputs` in `builder/SKILL.md`) → test failed, reverted clean |
| PAB-03 | AC1 persona passed into packet as advisory framing | PASS | `skills/persona-router/SKILL.md:50` |
| PAB-03 | AC2 persona never authority inside subagent | PASS | `skills/persona-router/SKILL.md:50` "Inside the sub-agent the persona is never authority; the charter's Restrictions win on any conflict." |
| PAB-04 | AC1 clause scopes the ban to persona routing | PASS | `skills/persona-router/SKILL.md:176` "Persona routing itself stays inline: do not invoke..." |
| PAB-04 | AC2 workflow-mandated dispatch unaffected | PASS | Same line: "This bounds the routing step only — workflow-mandated agent dispatch is unaffected by an active persona route." |
| PAB-04 | AC3 test fails if unscoped form returns | PASS | Discrimination mutation 5 (re-appended the old unscoped fragment) → `not.toContain` test failed, reverted clean |
| PAB-05 | AC1 rule reached during routing (not footnote) | PASS | Stated inside `## Persona And Sub-Agents`, inserted after `## Instruction Precedence` (SKILL.md:45-52), before `## Automatic Routing Workflow` — a routing-path read reaches it |
| PAB-05 | AC2 names the 4 shadowing pairs | PASS | `skills/persona-router/SKILL.md:56-61` — table lists all four pairs exactly as spec Gap #3 names them |
| PAB-05 | AC3 test fails if rule removed | PASS | Covered by presence test at line 527-530 of the integrity suite (not separately re-mutated beyond the suggested 4+; presence-only per design's accepted residual) |
| PAB-06 | AC1 line names both `massa-ai` and `persona-router` | PASS | All 15 charters: `never load the \`massa-ai\` or \`persona-router\` routers` |
| PAB-06 | AC2 receive-vs-select non-contradiction | PASS | C3 (ban, "never load...never open") ordered immediately before C2 (allowance, "shapes emphasis only") in every charter — verified in `builder/SKILL.md:28-29` |
| PAB-06 | AC3 disk-enumerated | PASS | Same `charterNames()` helper as PAB-02; confirmed by mutation 6 |
| PAB-06 | AC4 bans reading a `personas/` prompt file | PASS | All 15 charters: `never open a \`personas/\` prompt file` |
| PAB-06 | AC5 superseded `massa-ai`-only form asserted absent | PASS | Discrimination mutation 4 (re-added old line alongside new one in `reviewer/SKILL.md`) → absence test failed, reverted clean |
| PAB-07 | AC1 no tool/write/permission grant | PASS | `skills/persona-router/SKILL.md:49` "grants no tool access, no write scope, and no permission" |
| PAB-07 | AC2 never authorizes inline implementation | PASS | Same line: "never authorizes implementing inline in place of a workflow-mandated dispatch, and never widens a builder's disjoint write set" |
| PAB-07 | AC3 test fails if rule removed | PASS | Presence test at line 519-524; accepted residual, not separately mutated (design's own accepted-risk call) |
| PAB-08 | AC1 both generators run after charter edits | PASS | Commit `999913d` (T3) contains 15 charter sources + 120 mirror files from **both** `generate-skill-artifacts.ts` and `generate-subagent-artifacts.ts` in one atomic commit; commit `8197d85` (T4) contains the router source + its 4 skill-bundle mirrors |
| PAB-08 | AC2 `--check` exits 0, no drift, both | PASS | `bun scripts/generate-skill-artifacts.ts --check` → "No drift"; `bun scripts/generate-subagent-artifacts.ts --check` → "No drift" (both exit 0, re-run live in this worktree) |
| PAB-08 | AC3 both parity suites pass | PASS | `bun test scripts/__tests__/subagent-parity.test.ts scripts/__tests__/skill-artifact-parity.test.ts` → 36 pass / 0 fail |
| PAB-08 | AC4 regen inside the editing task, not deferred | PASS | Same evidence as AC1 — mirror counts inside the single commits confirm this, not a later T6 catch-up |
| PAB-09 | AC1 cases live in the named file | PASS | `scripts/__tests__/skills-harness-integrity.test.ts` lines 399-531 |
| PAB-09 | AC2 charter cases disk-enumerated | PASS | Same as PAB-02/06 AC3 |
| PAB-09 | AC3 each case mutation-checked | PASS | 6 mutations run live in this verification pass (see Discrimination sensor below), 5 of the 6 map directly onto suggested mutations 1-6; all killed exactly the intended test(s) |
| PAB-10 | AC1 entry under a minor-class heading with bullets | PASS | `CHANGELOG.md` `## [Unreleased]` → `### Changed`, 6 top-level bullets with nested detail |
| PAB-10 | AC2 release choice deliberate, stated rationale | PASS | Spec §PAB-10 states the rationale inline (harness contract text is the shipped product); CHANGELOG entry itself documents the same substance the spec commits to shipping |

No AC where the test and the stated outcome have drifted apart — every case above was verified
by reading the shipped artifact directly, not by trusting a green test alone.

## Discrimination sensor results

6 mutations run (4 required minimum; added the 16th-charter case). Each below states the
file mutated, the exact change, whether a test killed it, which test(s), and revert
confirmation.

| # | Mutation | File | Killed? | Test(s) | Reverted |
|---|---|---|---|---|---|
| 1 | Delete the `persona` field line | `skills/AGENTS.md` | Yes | "all three Capability Packet copies declare..." + "the canonical persona clause appears in exactly those three files" | Yes — restored from backup, `git status --short` clean |
| 2 | Paraphrase the packet clause (byte-identical requirement) | `skills/massa-ai/references/subagent-design.md` | Yes | Same 2 tests as #1 (clause substring no longer matches) | Yes — restored, clean |
| 3 | Move the C2 precedence line from `## Restrictions` to `## Inputs` | `skills/agents/builder/SKILL.md` | Yes | "every charter's Restrictions section carries the persona precedence line" (PAB-02/AC4 section-scoping proven) | Yes — restored, clean |
| 4 | Restore the old `massa-ai`-only ban alongside the new extended one | `skills/agents/reviewer/SKILL.md` | Yes | "no charter retains the superseded massa-ai-only restriction" (PAB-06/AC5 absence assertion proven) | Yes — restored, clean |
| 5 | Re-append the unscoped stop-condition fragment alongside the scoped one | `skills/persona-router/SKILL.md` | Yes | "persona-router no longer contains the unscoped prohibition" (PAB-04 absence assertion proven) | Yes — restored, clean |
| 6 | Add a 16th fake charter dir (`fake-agent-mutation-test/SKILL.md`) missing both persona-boundary lines | `skills/agents/fake-agent-mutation-test/` (new dir) | Yes | 6 tests failed, including both PAB-02/PAB-06 charter-scoped cases and pre-existing disk-enumerated registry/permission checks — none required a hardcoded-list edit to catch it | Yes — directory removed, clean |

All 6 mutations were caught by the intended test(s) with no false negatives. No mutation
required editing the test file itself to detect.

## Tree-clean confirmation

`git status --short` run immediately after the final revert (mutation 6) returned **no
output** — tree is clean except for this new `validation.md`, which is the one file this
agent is permitted to write.

## Command evidence (summarized, not raw logs)

- `bun test scripts/__tests__/skills-harness-integrity.test.ts` → 24 pass / 0 fail (153
  expect calls) on the clean tree.
- `bun scripts/generate-skill-artifacts.ts --check` → "No drift: generated skill bundles
  match checked-in files." (exit 0)
- `bun scripts/generate-subagent-artifacts.ts --check` → "No drift: generated files match
  checked-in files." (exit 0)
- `bun test scripts/__tests__/subagent-parity.test.ts scripts/__tests__/skill-artifact-parity.test.ts`
  → 36 pass / 0 fail (1337 expect calls).
- `bun run test:scripts` → 567 pass, 1 skip, 4 fail, across 572 tests / 27 files. The 4
  failures are confined to `scripts/tests/verify-tree-sitter-grammars.test.ts` and
  `scripts/tests/verify-tree-sitter-package-artifact.test.ts`, both failing with "dist
  consumer entry is missing: .../packages/core/dist/index.js" — consistent with the
  documented `bun install --ignore-scripts` provisioning of this worktree, not with any
  change in the commit range. Confirmed the diff range touches none of
  `services/structural`, `prisma/migrations`, or `verify-tree-sitter*`.

## Gaps found, ranked

None found that block PASS. Two pre-existing, already-documented residual risks are
reiterated here for visibility, not as new findings:

1. **(Low, pre-existing/accepted)** PAB-01/AC2, PAB-03, PAB-05/AC3, PAB-07/AC3 cases (test
   cases 1, 2, 6, 8, 9 in design.md's table) are presence-only. A future edit could add
   contradicting prose elsewhere in the same files while these stay green. `design.md` §
   Test design already records this as an accepted risk with a stated reason (no bounded
   absence fragment exists to assert against). Not a fix task against this feature; flag
   for a future feature if a bounded contradiction pattern emerges.
2. **(Info)** The generated-mirror diff (~1000 of the ~1055 inserted lines) is expected
   volume per `design.md` § Risks ("~580 mirrored plugin files inflate the diff"); a
   reviewer should not be alarmed by the line count without checking source vs. mirror
   proportion, which this report has already broken out above.

## Skipped checks and reasons

- **Full `bun run test` (workspace test suite):** Skipped. Out of this feature's blast
  radius — the change is prose-only inside `skills/` plus generated mirrors and
  `CHANGELOG.md`; no `packages/*` or `apps/*` runtime source was touched. `bun run
  test:scripts` is the correct and sufficient gate per `tasks.md` T6, and it ran.
- **Live-API integration / E2E suites:** Skipped. No database, embedding, or MCP-tool
  behavior is in scope; this is a doc-contract-plus-gates feature per spec.md D3.
- **Manual CI dry-run of the CHANGELOG merge gate:** Skipped (no CI dispatch available to
  the verifier). Confirmed by direct inspection instead that the entry sits under
  `[Unreleased] ### Changed` with bullets, satisfying PAB-10/AC1 structurally.

## Next step

None required — merge-ready from a verification standpoint. If the user wants the
low-priority residual (presence-only cases) hardened, that would be a new, separate
follow-up spec item, not a fix against this feature's closed requirements.
