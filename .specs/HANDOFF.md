# Handoff — workflow-reuse-naming-figma (VALIDATED PASS 2026-08-07 — 23/23 ACs, 7/7 mutations killed, iteration 2; push/PR authorized, merge = user decision)

Session `spec-workflow-reuse-naming-figma` · workflow spec-driven (Large) ·
branch `spec/workflow-reuse-naming-figma` from origin/main @ v1.39.0
(`64649e6e`) · worktree `/Users/luizmassa/Projects/massa-ai-wt-workflow-reuse-figma`.
Contract: `.specs/features/workflow-reuse-naming-figma/{spec,design,tasks,validation}.md`.

## Objective — workflow-reuse-naming-figma

Three user directives for the implementation-workflow class: mandatory
subagent reuse scan (all 16, post-Specify pre-Design/Tasks in spec-driven);
English-only naming conversion (any non-English → English); Figma node-id
wiring for spec-driven/feature on any platform (per-link figma files, 8-column
wiring table, 13 categories, tiered spec/task/design wiring, unused-Number stop
backed by validate_figma_wiring.ts, Figma-MCP execute retrieval), with the
design workflow's directions abstracted into design-implementation.md for
lazy reuse. AD-019 records the class-wide directive shape.

## State — workflow-reuse-naming-figma

17 commits `d79af5ed`..close-out: specs → T1–T6 (refs, naming rule, sensor
red 28 → green, 16-file insertion delta 0) → T7–T12 (enablement, hooks,
validator, CHANGELOG; test:scripts 1690/0) → f9da6703 ordering sensor →
59a4dcd1/68c7b840 validation gap fixes. Validation iteration 2 PASS. Gates:
harness-contract 109/0, duplication 474 ≤ 483 @ w4, parity 23/0,
validate_state exit 0. Open: PROC-01 design-workflow disposition (user call);
push/PR next.

# Previous — Handoff — worktree-isolation-gate (VALIDATED PASS 2026-08-06 — 6/6 ACs, 3/3 mutations killed, iteration 1; push/PR = user decision)

Session `spec-worktree-isolation-gate` · workflow spec-driven (Medium) · branch
`spec/worktree-isolation-gate` from origin/main @ v1.32.0 (`5c66e813`) ·
worktree `/Users/luizmassa/Projects/massa-ai-wt-worktree-isolation-step`
(isolated; main checkout untouched — it holds unrelated uncommitted work).
massa-ai MCP not used this session; `.specs/` files canonical. Contract:
`.specs/features/worktree-isolation-gate/{spec,design,tasks}.md`.

## Objective — worktree-isolation-gate

User asked for worktree+branch creation before edits in every implementation
workflow via a shared reference; measurement showed the contract already exists
(delivery clause + Stage 1, all 16 workflows, since `93c1ee1c`), user
redirected to strengthening enforcement. Delivered: one identical **Isolation
Gate** action line after the delivery clause in all 16 implementation
workflows; `implementation-delivery.md` Stage 1 record-evidence +
never-switch-branches-in-shared-checkout cross-session paragraph; per-file +
read-only-absence + uniformity sensor in `workflow-harness-contract.test.ts`
(observed red 17 before subject); CHANGELOG Added entry. Hook-level blocking
deferred with reason (design D2: hook binary is observation-only, no
PreToolUse registered); efficacy accepted-risk recorded in spec Assumptions
(Plan Challenge F1).

## State — worktree-isolation-gate

Commits: specs `11d93062` → T1 Stage 1 paragraph → T2 sensor (red-by-design
commit) → T3 gate lines (16 files, 67/0, duplication excess 483 ≤ 483 @ w4,
zero headroom untouched) → T4 CHANGELOG → T5 close-out → `a8360f18` AC4
Stage 1 sensor (validation iteration 1: verifier's scratch mutation proved the
coverage-matrix-claimed sensor was never written; fixed, observed red, killed
on re-injection) → validation.md PASS committed. Gates all green in worktree
incl. `generate:artifacts --check` no drift; validate_state exit 0. Next:
push/PR on user go-ahead.

# Previous — Handoff — workflow-commands (VALIDATED PASS; merged to main 2026-08-06)

Session `spec-workflow-commands` · workflow spec-driven (Large) · branch
`spec/workflow-commands` from main @ `1906a04e` (v1.29.0), worktree
`.claude/worktrees/workflow-commands`. Contract:
`.specs/features/workflow-commands/{spec,design,tasks,validation}.md`.

## Objective

Per-workflow slash commands on all four hosts (e.g. `/massa-ai:debug`): 38
generated commands per host from the workflow inventory, Approach A (flat
host-native files + body ownership marker `<!-- massa-ai:generated
workflow-command -->`), marker-scoped prune/`--check`, installer delivery
including the new OpenCode `command/` surface, AD-018.

## State

- Commits: `783878c0` specs → T1–T12 (`7397b77b`, `b627dfe1`, `341a1fb9`,
  `29012d02`, `1a27e86a`, `18f47381`, `2c6625c9`, `d43a944e`, `1b317cc3`,
  `c76cafc5`, `be589404`, `1169c8d9`) → `b6189483` validation fix → state files.
- Validation: PASS iteration 2 of 3 — 14/14 ACs, 8/8 mutations killed, gates
  green (test:scripts 1519/0 + 21 shell suites, test:plugins 120/0, lint 0,
  both generators `--check` clean). Iteration-1 gap: gitignore negation removal
  undetectable via `git check-ignore` on tracked paths → text-lock sensor +
  behavioral star representatives (`b6189483`).
- Parked sibling `spec/plugin-architecture-unification` (AD-017, validated,
  unpushed) touches the same generator/installers — conflicts expected at
  whichever merges second (user-accepted 2026-08-05).

## Next Step

PR #78 open; main (v1.32.0 — AD-017, pr-review, discovery, agent-era) merged
into the branch, conflicts resolved, workflow inventory 38 → 40 (pr-review +
discovery commands auto-generated by the scan). CI watch, then merge = user
decision. Post-merge on this machine: `bash scripts/install-harness.sh`
re-run delivers the 40 commands to installed hosts.

# Previous — Handoff — agent-era-harness-upgrades (VALIDATED PASS 2026-08-06 — 28/28 ACs, 8/8 mutants; merged, released v1.31.0–v1.32.0)

Previous handoffs closed: untracked-generated-bundles (PR #73 open at the time
of this handoff, CI 14/14 green; merge remains the user's decision — see
Previous section below).

Session `spec-agent-era-harness-upgrades` · workflow spec-driven (Large) ·
branch `spec/agent-era-harness-upgrades` from `main` @ `40ec631a` (post PR #73
merge). massa-ai MCP server not used this session; `.specs/` files canonical.
Contract files: `.specs/features/agent-era-harness-upgrades/{spec,design,tasks}.md`.

## Objective

Implement `agent-era-harness-upgrades` (AEH-01..10): `lessons.ts` trust-ramp
(`review add`/`trust status`) and metrics (`metrics add`/`metrics trend`)
commands; code-quality/refactor/coding-guidelines rewrites to an
agent-read-aware discoverability-or-change-risk split criterion and a file-shape
section; tests-audit five-gate error-class model + variation/trend sensors +
tests lens; feature-workflow AC capture/anchor; `massa-ai-reviewer` dispatch
wired into 14 workflows (5 implementing + 9 fix); gates and delivery artifacts.

## State

- `6 Phases = 19 Tasks`. Batches A+B (T1-T14, lessons.ts ramp engine, code-shape
  guidance, testing surfaces, spec anchor and policy prose) committed prior to
  this handoff.
- Batch C (this handoff, T15-T19): T15 `377b654a` (reviewer dispatch in 5
  implementing workflows, including spec-driven.md Execute step 6 placement
  immediately before the existing verification-agent block, which stays
  intact); T16 `2cf7d3fc` (reviewer dispatch in bugs-fix/code-quality-fix/
  architecture-fix/security-fix/requirements-fix); T17 `9f7a4718` (reviewer
  dispatch in tests-fix/implementation-fix/maestro-fix/mobile-figma-fix, plus
  the 14-file count sensor); T18 no commit — gates only (`bun install`,
  `generate:artifacts` + `--check`, parity suites, `bun run lint`, full gate
  all green, zero tracked-file drift); T19 this commit (CHANGELOG + FEATURES.json
  + STATE.md + HANDOFF.md).
- Every new sensor in `agent-era-guidance-content.test.ts` for T15-T17 was
  mutation-verified: apply -> observed red -> revert byte-identical (diff
  confirmed) -> green, before being trusted.
- `skills-harness-integrity.test.ts` held at 32 pass / 0 fail through T15,
  T16, and T17 (it asserts aggregate dispatch-block invariants — including
  the mandatory `persona:` bullet on every block — not a per-block count, so
  it does not grow with new blocks).
- SPEC_DEVIATION: T9/T10's literal Done-when reads `validate_skill.ts` exits
  0; re-baselined during Batches A+B to "no NEW failures" because
  `description_has_negative_scope` fails pre-existing on all 17 agent charters
  at the `origin/main` baseline (re-measured during this handoff: all 17
  charters under `skills/agents/*/SKILL.md` still fail `validate_skill.ts`
  with that same check, unrelated to this feature's edits).

## Next Step

Push the branch, open a PR, and run independent validation (verification-agent,
author != verifier) before merge. `check_specs_delivered.ts` result for this
feature is recorded in the T19 commit; merge remains the user's decision.

# Previous — Handoff — pr-review-workflow (VALIDATED PASS; merged as PR #75 @ `d2e7a43b`, released v1.30.0)
# Previous — Handoff — discovery-workflow (VALIDATED PASS; merged as PR #77 @ `eeef4f4e`)

Previous handoff: pr-review-workflow VALIDATED PASS (preserved below as
Previous). Cross-session incident: its T6 commit `c4b4d6cb` landed on THIS
feature's branch (shared checkout — the sibling committed while the checkout
was on `spec/discovery-workflow`), so `spec/pr-review-workflow`'s tip
(`975a020d`) lacks its own close-out. Suggested repair before any push:
`git branch -f spec/pr-review-workflow c4b4d6cb` (fast-forward, linear
ancestor), then discovery's PR targets `base=spec/pr-review-workflow`.

Session `spec-discovery-workflow` · workflow spec-driven · massa-ai MCP
unreachable this session (recall aborted at 120 s); `.specs/` files
canonical. Contract files:
`.specs/features/discovery-workflow/{spec,design,tasks}.md`
(+ `validation.md` at T6).

## Objective

New routed workflow `discovery`: product brainstorming / problem-space
thinking partner — four modes (problem exploration, solution ideation,
assumption testing, strategy exploration), seven frameworks-as-tools,
Frame → Diverge → Provoke → Converge → Capture rhythm, conduct contract with
six anti-patterns, massa-ai session/memory binding, and a mandatory Capture
offer to synthesize the conversation into a PRD (Product Requirements
Document) via the existing `to-prd` workflow (acceptance = the explicit
request to-prd requires). Adapted from the `product-brainstorming` skill in
`anthropics/knowledge-work-plugins` (Apache-2.0, attributed; provenance
established by web search + GitHub API per Plan Challenge F3).

## State

- Branch `spec/discovery-workflow` stacked on `spec/pr-review-workflow` @
  `975a020d`; history linear through `c4b4d6cb` (sibling's pr-review T6).
  Commits: `e67700d1` specs (Plan Challenge F1–F5 folded) → `f83fe38a` T1
  workflow file (12,497 B) → `231a9357` T2 router row + tier-4 clause
  (SKILL.md 20,293 B of 21,000) → `5330337f` T3 count locks 39→40 +
  complement 23→24 (observed red→green) → `01073577` T3 amendment WMH
  license allowlist +Apache-2.0 (observed red first) → `1e14716a` T4
  CHANGELOG → state commit (T6 partial).
- Gates green: `generate:artifacts` + `--check` no drift; integrity 32/0;
  size 6/0 (SKILL.md ceiling); duplication 20/0; parity 23/0; doc-paths
  1167 citations 0 misses; lint 0; count suites 50/0 at 40/24;
  `test:scripts` 1451/4 — the 4 are the documented `.claude/worktrees/`
  needle-anchor contamination class (3 sibling worktrees duplicate
  `const DAMPING = 0.85;`; CI authoritative).
- Plan Challenge (full pre_mortem, massa-ai-plan-critic): F1 merge path made
  explicit; F2 open-PR sweep (PR #74 no line collision); F3 provenance
  resolved by measurement (Apache-2.0 — was flagged user-decision, search
  settled it); F4 voice mitigation = T6 clause read; F5 size figure is an
  authoring target, no gate senses workflow file size.

## Next Step

Done through T6: check_specs_delivered exit 0; independent validation PASS
(15/15 ACs, 4/4 mutations killed, 0 gaps —
`.specs/features/discovery-workflow/validation.md`); FEATURES.json status
`complete`. Remaining (all user decisions, outward-facing, not taken
unattended): (1) incident repair `git branch -f spec/pr-review-workflow
c4b4d6cb`; (2) push both branches; (3) PR for pr-review-workflow → main,
then PR for discovery-workflow with `base=spec/pr-review-workflow` (or
retarget to main after the first merges). CHANGELOG entries present for
both, so the merge gate needs no `no-changelog` label. No installed-machine
actions — the workflow ships with the skills bundles on the next
release/install.

---

# Previous — Handoff — pr-review-workflow (VALIDATED PASS 2026-08-05 — 26/26 ACs, 5/5 mutations killed; push/PR = user decision)

Previous handoffs closed: untracked-generated-bundles merged as PR #73 @
`40ec631a`, released v1.29.0 (its full handoff is preserved below as Previous);
registry-cleanup-skill-imports merged as PR #72 @ `724ad02d` (main).

Session `spec-pr-review-workflow` · workflow spec-driven (Large) · massa-ai MCP
not used this session (no recall hits needed beyond CLAUDE.md/.specs context);
`.specs/` files canonical. Contract files:
`.specs/features/pr-review-workflow/{spec,design,tasks}.md` (+ `validation.md`
at T6).

### Objective

New routed workflow `pr-review`: six-dimension hosted PR (Pull Request) /
MR (Merge Request) review — security, requirements/DoD, test coverage,
architecture, regression/hallucination, performance — posting inline comments
plus one consolidated summary through `gh` (GitHub) or `glab` (GitLab).
Adapted from the TLC pr-review skill (CC-BY-4.0, github.com/augusto-dmh) with
massa-ai roster dispatches, orchestrator-posts channel discipline, `.specs/`
requirements Track B, and freshness-gated index retrieval. GitLab command
surface researched against official docs (citations in design.md D1); stable
`glab api` Discussions/Notes endpoints are the contract.

### State

- Branch `spec/pr-review-workflow` from origin/main @ `1906a04e` (v1.29.0).
  Commits: `55ed20e2` specs (Plan Challenge F1–F5 folded) → `18e0dbe6` T1
  workflow file (17,424 B) → T2 router registration (SKILL.md 20,091 B of
  21,000 ceiling) → T3 count locks 38→39 + complement 22→23 (observed
  red→green) → T4 CHANGELOG → this state commit (T6 partial).
- Gates green: `generate:artifacts` + `--check` no drift; integrity (6 new
  dispatch-block parses: audit-specialist + reviewer, persona clause present) +
  duplication + parity + size 81/0; doc-paths 0 misses; lint 0; both count
  suites 50/0; `test:scripts` 1451/4 — the 4 fails are the documented
  `.claude/worktrees/` needle-anchor contamination (3 sibling checkouts
  duplicate `const DAMPING = 0.85;`; CI authoritative, same class as the
  workflow-metadata-headers AC5 amendment).
- validate_state: 51 pre-existing errors on origin/main baseline (scratch
  worktree, measured 2026-08-05); this feature contributes 0; T6 gate amended
  accordingly in tasks.md.
- Plan Challenge (full pre_mortem, massa-ai-plan-critic subagent): F1
  consolidation check recorded as design D2b (six dispatches stand); F2 live
  read-only dry run executed on GitHub PR #73 (identity, metadata + head SHA,
  diff, changed files, comment inventory — all resolve), glab side
  skipped-with-reason (`glab` not installed on this machine); F3 numeric 80%
  confidence gate reworded qualitative; F4 accepted; F5 measured.

### Next Step

Done through T6: independent validation PASS (26/26 ACs, 5/5 mutations killed,
0 gaps — `.specs/features/pr-review-workflow/validation.md`); FEATURES.json
status `complete`. Remaining: push `spec/pr-review-workflow` + open the PR —
the user's decision (outward-facing; not taken unattended). CHANGELOG entry
present, so the merge gate is satisfied without the `no-changelog` label. No
installed-machine actions needed — the workflow ships with the skills bundles
on the next release/install.

---

# Previous — Handoff — plugin-architecture-unification (VALIDATED PASS; merged as PR #74 @ `46e7af97`)

Previous handoffs closed: untracked-generated-bundles merged as PR #73 @
`40ec631a` (main, released v1.29.0).

Session `spec-plugin-architecture-unification` · workflow spec-driven (Large) ·
branch `spec/plugin-architecture-unification` from `96ee1850` with origin/main
(v1.29.0) merged at `bb3e90bf`. Contract files:
`.specs/features/plugin-architecture-unification/{spec,design,tasks,context,validation}.md`.

## Objective

AD-017 — plugins deliver, MCP serves tools, hooks observe. Four coordinated
changes: OpenCode installer registers MCP alongside the plugin (54 tools; skip
rule removed; uninstall preserves the entry), harness skip-current gated on
per-host on-disk sentinels (wiped installs self-heal), Cursor prefers the
Claude-bridge load with local fallback (hooks fire exactly once,
installRoute bridge|local recorded), OpenCode plugin hooks-only (14 in-process
tools removed). Folded baseline: cursor flat agents, opencode real-copy
plugin, install-skills cursor warning.

## State

- Commits: `f0d84a7e` specs → `0a81f85d` T1 → `bb3e90bf` merge → T2–T6
  (`7efd1633`, `4f198e82`, `251621ec`, `3b1a5642`, `c9aee7c3`) → T7–T10
  (`fca8e995`, `3fb8c44c`, `dc18ed30`, `186bbd12`) → `8376dee6` validation fix.
- Validation: PASS (iteration 2 of 3) — 17/17 ACs, 6/6 mutations killed,
  gates green (single-writer 57/0, plugin-auto-install 201/0, cursor 25/0,
  opencode 27/0 + package 125/0, parity 88/0, lint 0, test:plugins 119/0,
  test:scripts 1455/0). Iteration-1 gap: PAU-14 "in-process `profile` tool"
  phrase outside the T9 sweep literals — class enumerated (pop 142), 2 live
  rows fixed; verifier re-derived independently (184-row superset, 0 live).
- ADR: `docs/adr/0002-plugins-deliver-mcp-serves-tools-hooks-observe.md` +
  AD-017 row in STATE.md Decisions (duplicate `## Decisions` heading noted,
  canonical = the AD-016 table).
- Lessons: L-021 recorded by verifier (sweep-literal class gap).

## Next Step

PR #74 open, CI 14/14 green (post-PR commits `c1334397` coverage floor +
`7aef1eba` config-pollution race; one infra rerun). Merge = user decision.
After merge, the user runs the staged machine repairs (this machine's
wiped `~/.cursor` artifacts + opencode plugin/MCP refresh):

```bash
bun run build                       # fresh opencode dist for the real-copy install
bash scripts/install-harness.sh     # sentinel probe now sees the wipe → reinstalls cursor; re-registers opencode MCP
# then verify: ls ~/.cursor/agents/massa-ai-*.md | wc -l   (expect 17)
#              /usr/bin/grep -c '"massa-ai"' ~/.config/opencode/opencode.json*  (MCP entry present)
```

Live once-only Cursor hook check (bridge route): restart Cursor, confirm one
massa-ai load line in the "Cursor Plugins" exthost log and single hook events.
