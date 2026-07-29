# Design — Skills / Workflows Updates

- feature: `skills-workflows-updates`
- sizing: Medium (6 requirements, all single-source prose edits, no code, no new tools)
- references read this session: `workflows/spec-driven.md`, `workflows/ticket.md`, `workflows/commit.md`, `workflows/tdd.md`, `references/implementation-delivery.md`, `references/code-annotation.md`, `references/ticket/{intake-and-sources,templates-and-quality}.md`, `scripts/__tests__/skills-harness-integrity.test.ts`

## Design approach

Every obligation lands at its single source of truth. The 16 implementation workflows already share an identical load line (line 7) that pulls in `references/implementation-delivery.md` and `references/code-annotation.md`, so the two impl-workflow obligations (SWU-01, SWU-02) ride those references with **zero edits to the 16 workflow bodies**. The remaining obligations touch spec-driven, ticket, commit, and implementation-delivery directly.

## Per-requirement design

### SWU-01 — no-tests-for-models → `references/code-annotation.md` §3

Add one exception block to §3 Tests (after the existing Rules list, before Completion Evidence). It must:

- Name the excluded kinds: data models, anemic domain models, persistence/ORM entities, DB-schema-mapped classes, repository entities, behaviorless value objects.
- State the redirection: test behavior at the repository / service / use-case seam, not the model's fields/accessors.
- List the languages covered (so it is clearly universal, not TS-specific).
- Preserve the "test every changed code path" rule for code that **has** behavior — the exception is scoped to behaviorless models only.

Single source = `code-annotation.md`. All 16 impl workflows inherit it through their existing line-7 load. No workflow body edited.

**Plan Challenge F2 — agent-charter read path:** `references/code-annotation.md` is also referenced by `skills/agents/test-engineer/SKILL.md:60` and `skills/agents/builder/SKILL.md:61`. The no-model-tests rule therefore reaches those sub-agents too. This is desirable (consistent guidance), but means the §3 enumeration must be explicit enough that a test-engineer/builder reading it cannot over-read it as "skip tests on anything named Model". Deterministic check after edit: §3 contains a non-empty excluded-kinds list naming persistence entities, ORM, schema-mapped classes, repository entities, and behaviorless value objects — not a generic "models" sentence.

### SWU-02 — mandatory worktree → `references/implementation-delivery.md` Stage 1

Stage 1 already mandates worktree isolation with no size exemption. Two wording bumps make the rule greppable and unmissable:

- Stage 1 heading already reads `### Stage 1 — worktree isolation is mandatory`. Add the explicit phrase **"mandatory worktree creation"** into the first paragraph so the exact user-requested term appears.
- Keep the two legal skip reasons and the "Read-only workflows never load this file" sentence verbatim (AC-2, AC-4, and the negative-control test depend on them).

No workflow body edited; the 16 inherit it.

### SWU-03 — repo-rules enforcement → new `references/repo-rules-discovery.md` + `workflows/spec-driven.md`

New reference `references/repo-rules-discovery.md` defines:

- **Discovery list:** `.claude/CLAUDE.md`, `.claude/rules/**`, `.cursor/rules/*.mdc`, `.cursorrules`, plus repo/module conventions (module-layout, unit-test location, testing-area conventions) discovered from the repo's own `AGENTS.md`, `CONTRIBUTING.md`, `README`, and test-runner config.
- **Loading order:** read each present source; summarize into a compact `repo-rules` record (paths + the rules that bind implementation).
- **Absence is valid:** if none are present, record `repo-rules: none present` and continue. Never fabricate rules; never create these directories.
- **Enforcement hook:** spec-driven, before the first repository mutation, loads this reference and adds a clause that implementation must conform to the discovered rules; deviations require an explicit recorded reason in the completion evidence.

`workflows/spec-driven.md` edit: extend the existing line-7 mutation preamble to also load `references/repo-rules-discovery.md`, and add one Workflow step clause under Execute (step 6) requiring conformance + recording `repo-rules: <list or none present>`.

**Plan Challenge F1 — dispatch-block geometry (critical edit constraint):** `spec-driven.md` lines 104-113 contain a `> **Dispatch:` blockquote (the verification-agent dispatch). The new repo-rules clause must **not** be inserted between lines 104-113, and must not break the contiguous `>`-prefixed run — otherwise `skills-harness-integrity` test 8 (dispatch persona emission) splits the block and the `> - persona:` bullet lands on the wrong side, flipping the gate red. Insertion rule: add the repo-rules conformance bullet as **plain (non-`>`) step text immediately before the `> **Dispatch:` block at line 104**, or after the block ends at line 113. After the edit, every line in the former 104-113 span must still start with `> `. Deterministic check: `bun run test:scripts` + `awk 'NR>=102 && NR<=117' spec-driven.md` confirms no plain line splits the block.

`skills/massa-ai/SKILL.md` edit: add `references/repo-rules-discovery.md` to the Shared References table so the router-table integrity test stays green and the file is discoverable.

### SWU-04 — phased Jira mapping → `workflows/ticket.md` + `references/ticket/templates-and-quality.md` (+ intake note)

- `workflows/ticket.md`: add a phased-decomposition clause. When the source is a phased plan, map Phase/Wave → one standard Jira **Task**, and each Task inside → one sub-task under that Task. Reuse the existing `tickets-subtasks` hierarchy mode; do not invent issue types.
- `references/ticket/templates-and-quality.md`: extend Decomposition Rules with the Phase→Task / Task→sub-task mapping and a note that branch naming follows the Phase/Wave key (cross-link `references/implementation-delivery.md`, do not restate the branch command).
- `references/ticket/intake-and-sources.md`: one line under Ordered Intake noting that a phased source (spec-driven `tasks.md` Phases/Waves, or a TDD PR-group table) selects the phased mapping.
- ticket.md must emit every created Jira key (phase Task keys + task sub-task keys) back to the caller so commit.md and implementation-delivery.md can consume them (AC-4).

### SWU-05 — per-task commit prefix → `workflows/commit.md`

- Add a clause: for phased work, each Task is exactly one atomic commit (never batched), subject prefixed with that Task's Jira sub-task key as `[XXX-YYYY]`.
- The existing branch-key extraction regex (`(?<![A-Z0-9])([A-Z][A-Z0-9]{1,9}-[0-9]+)(?![A-Z0-9])`) stays as the fallback; an explicit task key from ticket.md or the user takes precedence.
- Show the `[XXX-YYYY]` format by example, consistent with the existing `[<KEY>] ` rule.
- Cross-link `workflows/ticket.md` (key source) and `references/implementation-delivery.md` (one-commit-per-task cadence) without restating them.

### SWU-06 — phase branch + PR prefix → `references/implementation-delivery.md` Stages 1 & 4

- Stage 1 (Isolate): document that for phased work the branch is named per Phase/Wave and carries the phase's Jira key (e.g. `feat/<PHASE-KEY>-<slug>`), sourced from ticket.md or the user. Non-phased `<type>/<slug>` unchanged.
- Stage 4 (Propose): document that the PR/MR title and body include the Phase/Wave Jira key prefix (matching the branch naming), sourced from the branch. Existing degraded paths unchanged.
- Cross-link ticket.md (key source) and commit.md (per-task commit prefix).

## Assumptions (to be challenged)

- **A1:** All 16 write/code workflows already load both `implementation-delivery.md` and `code-annotation.md` at their identical line 7, so SWU-01/SWU-02 need zero body edits. (Verified this session by grep — 16 files, identical line.)
- **A2:** `tdd.md` is correctly excluded — it produces a design doc and routes implementation to spec-driven; it does not mutate source and does not load `implementation-delivery.md`. (Verified this session.)
- **A3:** The harness integrity test does not pin specific prose inside `code-annotation.md`, `implementation-delivery.md`, `ticket.md`, or `commit.md` — only reference-path resolution, router<->disk parity, dispatch blocks, charter permission, and policy single-source. So prose edits there are safe. (Verified by reading the test.)
- **A4:** Adding `references/repo-rules-discovery.md` and listing it in SKILL.md's Shared References keeps both the reference-integrity test (test 4) and the router-table test (test 5b) green, because 5b only checks that router-listed references exist, and 4 checks that every mentioned reference path resolves. (To be confirmed at the gate.)
- **A5:** No host-artifact regeneration is needed — these edits touch only `skills/` markdown consumed directly by hosts via symlink, not the generated `apps/*/agents/` or `apps/*/skills/agents/` artifacts. (To be confirmed at the gate via the parity tests in `test:scripts`.)

## Risks

- **R1 (low):** Over-broad "no model tests" wording could be read as "skip tests on anything named Model", weakening SWU-01 AC-3. Mitigation: enumerate excluded kinds explicitly and keep the behavior-tested rule intact.
- **R2 (low):** A new reference not listed in the router stays valid for test 4 but hurts discoverability. Mitigation: list it in SKILL.md Shared References (SWU-03 AC-3).
- **R3 (low):** Prose drift between commit.md's `[XXX-YYYY]` and implementation-delivery's branch key. Mitigation: cross-link, single example format.

## Test strategy

No new tests. The existing `scripts/__tests__/skills-harness-integrity.test.ts` is the regression net: it fails if a referenced file is missing, if the router table drifts from disk, if a policy block duplicates, or if a dispatch block breaks. `bun run test:scripts` is the gate. Verification is by reading the edited prose against each AC, plus the green gate.
