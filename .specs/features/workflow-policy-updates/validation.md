# Workflow Policy Updates — Validation Report

- **Verifier:** verification-agent (author != verifier)
- **Date:** 2026-08-04
- **Diff range:** `origin/main` (07ffa7fd, v1.22.0) .. `HEAD` (bb3bfd92, T4), plus
  uncommitted T5 close-out working-tree state (`.specs/HANDOFF.md`,
  `.specs/features/workflow-policy-updates/tasks.md`, `.specs/project/FEATURES.json`,
  `.specs/project/STATE.md`, `CHANGELOG.md`) — expected per handoff, not yet committed.
- **Commits verified:** 5abb8278 (activation), f0701b93 (T1), 147e3209 (T2), c557997b (T3),
  bb3bfd92 (T4).

## Overall Status: **Partial**

All five requirements (WFP-01..05) are independently verified PASS on their own
acceptance criteria via commands re-run by this agent (not trusted from commit messages).
Cross-cutting bundle-sync and lint gates PASS. What keeps this Partial rather than
Complete:

1. `bun run test:scripts` was not run by this agent (owned by the main agent's background
   process per instruction) — its result is unverified here.
2. T5 close-out is uncommitted (expected/flagged in the brief); `check_specs_delivered.ts`
   correctly reports 4 errors for that reason — not a defect, a pending step.
3. One minor finding: the literal T4 sensor command as written in `tasks.md` does not
   match the actual protocol wording (see Finding 1 below) — cosmetic, not a functional
   gap in the delivered protocol text.

## Per-AC Findings

### WFP-01 — Compose Screen Previews (mobile-context.md normative, mobile-diagnosis.md pointer)

**PASS.**

```
$ /usr/bin/grep -n -i "preview" skills/massa-ai/references/mobile-context.md
79:## Compose Screen Previews
83:updated screen-level composable ships with `@Preview` composables ...
(+ 4 bullets: representative states, project conventions, previews-as-validation-assets, KMP source-set placement)

$ /usr/bin/grep -n -i "preview\|mobile-context" skills/massa-ai/references/mobile-diagnosis.md
7:...load `references/mobile-context.md` instead ... and always when a fix creates or
   updates a Compose screen, because its Compose Screen Previews rule (`@Preview`
   coverage) applies to debug-path edits too.

$ /usr/bin/grep -rln "@Preview" skills/massa-ai/
mobile-diagnosis.md   (pointer sentence only — names the rule, no bullet body)
mobile-context.md     (normative rule body)
```

Rule body (the bullet set) exists only in `mobile-context.md`; `mobile-diagnosis.md`
carries a pointer sentence that names the rule and composes with its existing routing
sentence (F5 fold verified — extended in place, not a free-standing duplicate).

### WFP-02 — PR-description currency (implementation-delivery.md)

**PASS.**

```
$ /usr/bin/grep -n "Stages 3–7 — the PR description stays current" ...delivery.md
93:### Stages 3–7 — the PR description stays current

$ /usr/bin/grep -n "older commit set" ...delivery.md
142:  older commit set — update it after each requested push, before merging.
   (Anti-Patterns bullet)

$ /usr/bin/grep -rln "reflects the branch's current commit set\|PR description stays current\|update it after each requested push" skills/massa-ai/references skills/massa-ai/workflows skills/massa-ai/SKILL.md
skills/massa-ai/references/implementation-delivery.md   (only file — single normative copy)
```

Rule text: "After every push requested while the PR exists ... update the PR description
with `gh pr edit <number> --body <b>` ... before returning to Watch. The description must
be current before the merge decision is requested". Anti-pattern: "Proposing or performing
a merge while the PR description still describes an older commit set". Both present, single
copy confirmed.

### WFP-03 — Figma pre-analysis + sequential retrieval protocol

**PASS**, with one cosmetic finding (see Finding 1).

`references/figma-pre-analysis.md` verified against design.md D3 and spec.md AC:
- Stage 1: "Dispatch one read-only subagent ... Its job is understanding, **not**
  extraction" — composition/context/features/flows summary + partition proposal by
  size/coupling/feature flow, explicit single-slice fallback for a small screen.
- Stage 2: "strictly sequentially — never in parallel", one slice at a time, folded into
  the Evidence Packet before the next dispatch.
- Fallback: inline both stages, same order, when subagent spawning is unavailable.

Wiring:
```
$ /usr/bin/grep -c "figma-pre-analysis" workflows/design.md workflows/mobile-figma/mobile-figma-audit.md workflows/mobile-figma/mobile-figma-fix.md workflows/spec-driven.md workflows/feature.md
design.md:1  mobile-figma-audit.md:1  mobile-figma-fix.md:1  spec-driven.md:1  feature.md:1

$ /usr/bin/grep -n "figma-pre-analysis" SKILL.md
286:- `references/figma-pre-analysis.md`   (Shared References list)

$ /usr/bin/grep -c "figma-pre-analysis" references/mobile-context.md
0   (F2 fold verified — rfc/adr/tdd correctly stay out of scope)
```

All 5 wirings are local load-pointer sentences inside each workflow's own design-source
gate line/block (verified by reading each match with context) — not a shared edit to
`mobile-context.md`'s common gate text, matching the F2 fold.

**Finding 1 (minor, cosmetic):** `tasks.md`'s literal T4 sensor —
`grep -rl "proposes a partition\|never parallel" skills/massa-ai/` → expected only
`references/figma-pre-analysis.md` — returns **zero files** when run verbatim. The
delivered file uses "**Partition proposal**" (heading-cased noun phrase) and "**never in
parallel**" (with "in"), not the exact strings the task's sensor command names. The
underlying single-copy protocol requirement is still true and verified above by a command
built on the actual wording (`never in parallel`, `Partition proposal` — each found only
in `figma-pre-analysis.md`); this is a drift between the sensor's literal string and the
author's final phrasing, not a duplicated-protocol defect. Confirmed via mutation (b)
below that a real duplication is still caught by the corrected sensor and by the bundle
`--check` gate independently. Recommend tasks.md's T4 sensor line be corrected to the
actual phrases (`Partition proposal`, `never in parallel`) so the literal command is
runnable evidence again.

### WFP-04 — Abbreviation expansion (SKILL.md Core Contract)

**PASS.**

```
$ /usr/bin/grep -c "1 Phase = X Tasks" SKILL.md  → 1
$ /usr/bin/grep -c "abbreviation" SKILL.md        → 1
```
Bullet (SKILL.md:63-64): "Expand every word abbreviation on first use in user-facing
output — e.g. \"PR (Pull Request)\", \"AC (Acceptance Criteria)\", \"KMP (Kotlin
Multiplatform)\""

### WFP-05 — Phase/Task vocabulary (SKILL.md Core Contract + spec-driven.md dealiasing)

**PASS.**

Bullet (SKILL.md:66-69): "a **Task** is the atomic unit; a **Phase** is an ordered group
of Tasks. Report a phase's size as `1 Phase = X Tasks` and a plan's total as
`Y Phases = Z Tasks`. Do not substitute synonyms such as batch, wave, stage, ..."

```
$ /usr/bin/grep -n "batch" skills/massa-ai/workflows/spec-driven.md
28:3. One atomic commit per task. Never batch tasks; never weaken, skip, or delete tests
   to make them pass.
```
Exactly the one expected residual (verb-form "batch tasks" on the atomic-commit line);
zero unit-noun "batch" for worker/task groups. Full population printed above — matches
tasks.md's expected residual exactly.

## Cross-Cutting Gates

| Gate | Command | Result |
|---|---|---|
| Bundle sync | `bun scripts/generate-skill-artifacts.ts --check` | **PASS** — exit 0, "No drift" |
| Bundle byte-identity spot-check | `diff` source vs. all 4 host bundle copies for `SKILL.md`, `figma-pre-analysis.md`, `mobile-context.md`, `mobile-diagnosis.md`, `implementation-delivery.md`, `spec-driven.md`, `design.md`, `feature.md`, `mobile-figma-audit.md`, `mobile-figma-fix.md` | **PASS** — every file identical across claude/codex/cursor/opencode |
| Lint | `bun run lint` (oxlint) | **PASS** — exit 0 |
| `test:scripts` | — | **PENDING** — running in a background process started by the main agent; not re-run here per instruction. Not independently verified by this agent. |
| `validate_spec.ts` | `bun skills/massa-ai/scripts/validate_spec.ts --root . workflow-policy-updates` | **FAIL** (3 errors: missing `## Assumptions & Open Questions`, `## User Stories`, `## Requirement Traceability` headings) — **pre-existing, repo-wide**: sampled ~35 other `.specs/features/*` dirs, every one fails this same validator identically (checked `audit-remediation-2026-07`, `god-files-refactor`, `core-layering-controller-retirement`, and 32 more — all exit 1). This spec.md's actual structure (Requirements table with per-row ACs, Assumptions table) covers the same information under different headings than the validator's hardcoded template expects. Not a regression introduced by this feature; out of this feature's scope to fix (Restrictions bar implementation changes, and the condition predates T1). |
| `validate_tasks.ts` | `bun skills/massa-ai/scripts/validate_tasks.ts --root . workflow-policy-updates` | **FAIL** (2 errors: missing `## Execution Plan`, `## Task Breakdown`; 1 warning: no `### T1: ...`-shaped tasks parsed) — same repo-wide template mismatch; spot-checked neighbors show mixed pass/fail (`audit-remediation-2026-07` passes with a warning only, `god-files-refactor` and `core-layering-controller-retirement` fail), confirming the validator's template drifted from the checklist-table format most features (including this one) actually use. Pre-existing, not caused by this feature. |
| `check_specs_delivered.ts` | `bun skills/massa-ai/scripts/check_specs_delivered.ts workflow-policy-updates --root .` | **FAIL as expected** (4 errors: uncommitted `.specs/HANDOFF.md`, `tasks.md`, `FEATURES.json`, `STATE.md`) — this is the T5 close-out commit not yet made, called out explicitly in this task's brief as expected uncommitted state. Will resolve once T5 commits. |

## Discrimination Sensors (mutate → confirm red → restore → confirm clean)

All three mutations used `cp`/file-write + `cp`-restore from a `/tmp` backup, never
`git checkout`/`restore` (repo lesson: git-restore in a mutation harness has previously
deleted uncommitted files — there are uncommitted T5 `.specs/`+`CHANGELOG.md` files in
this tree and they were never touched). `git status --short` before and after mutation
runs is identical (only the pre-existing T5 draft diffs).

**(a) Delete "never in parallel" from `figma-pre-analysis.md`:**
- `/usr/bin/grep -rln "never in parallel" skills/massa-ai/` → no matches (exit 1) — **sensor goes red**, correctly.
- `generate-skill-artifacts.ts --check` → drift detected on `references/figma-pre-analysis.md` for all 4 hosts — **bundle gate also catches it independently**.
- Restored via `cp` from backup; `diff` confirms byte-identical; `git status` clean.

**(b) Inject a duplicate paragraph containing "proposes a partition" / "never in parallel" into `workflows/design.md`:**
- `/usr/bin/grep -rln "proposes a partition" skills/massa-ai/` → now matches `workflows/design.md` (a second file) — confirms a corrected single-copy sensor (built on the actual phrase, not the tasks.md literal string) **goes red on real duplication**.
- `generate-skill-artifacts.ts --check` → drift detected on `workflows/design.md` for all 4 hosts — bundle gate independently catches it.
- Restored via `cp`; `diff` confirms byte-identical; `git status` clean.

**(c) Reintroduce unit-noun "batch" into `spec-driven.md`'s sub-agent offer** (`"One worker per Phase group"` → `"One worker per batch"`):
- `/usr/bin/grep -n "batch" skills/massa-ai/workflows/spec-driven.md` → 2 lines (the accepted verb-form residual at line 28, plus the reintroduced unit-noun at line 97) instead of the expected 1 — **WFP-05 population sensor goes red**, correctly.
- Restored via `cp`; `diff` confirms byte-identical; `git status` clean.

Final `git status --short` after all three mutations and restores: only the pre-existing
T5 draft files (`HANDOFF.md`, `tasks.md`, `FEATURES.json`, `STATE.md`, `CHANGELOG.md`);
`git diff --stat` on the three mutated source files shows empty diffs. No residue.

## Residual Risk / Ranked Gap List

1. **(Low)** T4's literal `tasks.md` sensor command uses phrases ("proposes a partition",
   "never parallel") that don't appear verbatim in the delivered
   `figma-pre-analysis.md` (which uses "Partition proposal" and "never in parallel").
   The protocol requirement itself is correctly and singularly implemented — verified
   independently with corrected phrase matching and by mutation testing — but the sensor
   as literally written in `tasks.md` is not runnable evidence. Fix: align the tasks.md
   sensor line to the actual wording (one-line edit, non-blocking for merge).
2. **(Low, informational)** `validate_spec.ts` / `validate_tasks.ts` fail against a
   template this feature's `spec.md`/`tasks.md` never targeted — and so do ~all other
   `.specs/features/*` entries sampled. This is a repo-wide tooling/template drift
   predating this feature; not a gap in WFP-01..05's delivery. Out of scope to fix here
   (Restrictions bar implementation edits by this agent).
3. **(Pending, not a gap)** T5 close-out (CHANGELOG/STATE/FEATURES/HANDOFF commit, PR
   creation, `check_specs_delivered.ts` green) is not yet done — expected per this task's
   brief, owned by the main agent's next step.
4. **(Pending, not verified here)** `bun run test:scripts` result is unknown to this
   agent — it is running in the main agent's background process per explicit
   instruction not to start a duplicate run. Recommend the main agent confirm its exit
   code (expect pass; `skill-artifact-parity.test.ts` should agree with the `--check`
   PASS already independently confirmed here) before merge.

## Skipped Checks (with reasons)

- `bun run test:scripts` — explicitly deferred to the main agent's already-running
  background process per this task's instructions; starting a second run risked
  interference/duplication.
- Behavioral/runtime execution of the workflows themselves (e.g., actually dispatching
  subagents per the Figma protocol) — out of scope for a docs/skills-policy feature with
  no executable code path; static + bundle + lint + mutation-sensor levels are the
  correct and sufficient ladder rungs here (file-integrity + behavioral-of-the-docs
  level, via mutation testing of the grep sensors themselves).

## Verification Ladder Level Reached

File-integrity (byte-identical bundle checks) + static (grep/lint/validator sensors) +
a behavioral layer over the sensors themselves (mutation testing: 3 mutations, each
confirmed to flip the relevant sensor red and confirmed cleanly reverted). No
higher-order (cross-service/runtime) level applies — this feature has no executable
runtime surface, only documentation/skill-prose changes and their generated bundles.
