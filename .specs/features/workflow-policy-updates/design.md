# Workflow Policy Updates — Design

Session `spec-workflow-policy-updates`, 2026-08-04. Decisions D1-D6; each cites the
evidence that selected it.

## D1 — WFP-02 lives in `references/implementation-delivery.md`, nowhere else

Loader sweep (this session): exactly 16 workflow files load `implementation-delivery`
— the full implementation set. The reference already owns the push→PR→CI→merge chain
(Stages 3-7), so "update the PR description after each requested push, before merging"
is a chain rule: new subsection after Stage 4 ("PR description stays current": after
every push while the PR exists, `gh pr edit --body` before returning to Watch; must
reflect the final commit set before merge) + one Anti-Patterns bullet (merging with a
stale description). Rejected: per-workflow copies (16 duplicates, violates
one-place doc layering).

## D2 — WFP-01 lives in `references/mobile-context.md`; `mobile-diagnosis.md` gets a pointer

Router contract: mobile is a context modifier; non-debug mobile work loads
`mobile-context.md`, debug loads `mobile-diagnosis.md`. Normative rule goes in
`mobile-context.md` (new "Compose Screen Previews" bullet set under Verification
Sensors): every created or updated screen-level composable on Android Jetpack Compose
or KMP Compose Multiplatform ships `@Preview` composables covering representative
states; previews are validation assets (already protected by existing anti-weakening
rules). `mobile-diagnosis.md` gets a one-line pointer so debug-path fixes to Compose
screens inherit the rule without a second normative copy. Rejected: placing it in
`mobile-figma-matcher/android-compose.md` (loaded only for Figma-classified surfaces,
missing plain Compose feature work).

## D3 — WFP-03 is a new shared reference `references/figma-pre-analysis.md`

The Figma Evidence Packet build step exists in `design.md` (step 6),
`mobile-figma-audit.md` (step 6), `mobile-figma-fix.md` (step 5 re-read), and the
design-source gates of `spec-driven.md` / `feature.md`. Protocol (two stages, both
read-only):

1. **Pre-analysis (1 subagent, always first):** given the user's Figma links/node
   IDs, summarize composition (pages, screens, components), product context, features,
   and flows. Explicitly NOT the extraction — no full Evidence Packet fields. Output:
   compact context summary + a partition proposal — how many retrieval subagents and
   which links/nodes/screen groups each reads, partitioned by size (context budget),
   coupling (shared tokens/components stay together), and feature flow (one flow per
   subagent when possible). Single small screen → proposal may be one retrieval pass.
2. **Sequential retrieval (N subagents, one at a time):** main agent dispatches each
   retrieval subagent in the proposed order, waits for completion, folds its output
   into the Figma Evidence Packet, then dispatches the next. **Sequential always —
   never parallel** (Figma MCP session/rate safety + each packet slice can inform the
   next dispatch prompt). Workers never spawn further subagents.

Fallback: subagent spawning unavailable → run both stages inline in order, record
the skipped delegation. Wiring: each of the 5 workflows loads the reference at its
Figma step; router Shared References list gains the file. Rejected: extending
`mobile-figma-matcher/core.md` (loaded only by the matcher family — spec-driven and
feature would then drag in the whole matcher contract just for orchestration).

## D4 — WFP-04/05 are Core Contract bullets in `skills/massa-ai/SKILL.md`

`SKILL.md` is the single always-loaded text ("keep this file small in context" — two
bullets respect that). Abbreviations: expand on first use in user-facing output.
Vocabulary: Task = atomic unit, Phase = ordered group of Tasks, sizes as
`1 Phase = X Tasks` / `Y Phases = Z Tasks`, no synonyms in agent prose.
`spec-driven.md`'s sub-agent offer re-phrases "batch" in Phase/Task terms (D6).
Rejected: `references/conversation-feedback.md` (only loaded when feedback detail is
needed; the rules must bind always).

## D5 — Bundle regeneration is same-commit, per task

`scripts/generate-skill-artifacts.ts` emits byte-identical copies into
`apps/<host>-plugin/skills/` for 4 hosts; CI runs `--check` and
`skill-artifact-parity.test.ts`. Prior-feature precedent: regen + `--check` in the
same commit as the source edit, per task.

## D6 — spec-driven "batch" prose aligns to Phase/Task vocabulary

`workflows/spec-driven.md` sub-agent offer currently says "batch-budgeted batch (>~8
tasks)… one worker per batch (~7 tasks, whole phases)". Reword to Phase/Task terms:
workers execute whole Phases (~7 Tasks each). Semantics unchanged — only vocabulary.
Jira "Phase/Wave" naming in `ticket.md`/`implementation-delivery.md` stays (spec Out
of Scope, external-structure name).

## Plan Challenge Record (pre_mortem, massa-ai-plan-critic, 2026-08-04 — all findings folded)

- **F1 (critical, folded):** WFP-03's "protocol lives once" acceptance criterion had no
  absence sensor. Fold: T4 gains literal grep sensors — protocol phrases ("proposes a
  partition", "never parallel") match only inside `figma-pre-analysis.md`; wired
  workflows carry a load-pointer sentence only.
- **F2 (critical, folded):** `spec-driven.md`'s design-source gate is a one-line pointer
  to shared gate text in `mobile-context.md` that also serves `rfc`/`adr`/`tdd` —
  workflows WFP-03 excludes. Fold: wiring goes into each workflow's **local** gate
  line/block (spec-driven step 3 gate line, feature.md inline gate block), never into
  `mobile-context.md`; sensor requires `grep -c figma-pre-analysis
  references/mobile-context.md` == 0.
- **F3 (high, folded):** D6 "batch" reword scope underspecified — `spec-driven.md` has
  multiple "batch" sites with different meanings. Fold: reword every unit-noun "batch"
  (worker/task-group meaning); verb form "never batch tasks" stays; sensor is a literal
  grep with the expected residual population printed.
- **F4 (medium, folded):** sensors were prose, not commands. Fold: tasks.md commits the
  literal grep commands.
- **F5 (medium, folded):** `mobile-diagnosis.md:7` already routes to `mobile-context.md`
  broadly; the pointer must compose with that sentence, not sit beside it as a narrower
  duplicate. Fold: extend the existing routing sentence's context rather than adding a
  free-standing rule.
- **F6 (low, folded):** PR body must name the generated-bundle blast radius (4 host
  bundles per source edit) — and WFP-02 self-applies to this feature's own PR.

## Risk surface

- Generated-bundle drift: covered by `--check` gate per task.
- WFP-03 wiring touching `spec-driven.md` (this very workflow's contract): edits are
  additive (one load + one gate sentence); validator anchors at file end untouched.
- `skills.yml` CI validates SKILL.md frontmatter only — frontmatter untouched.
