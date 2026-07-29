# Validation — Skills / Workflows Updates

- feature: `skills-workflows-updates`
- verdict: **PASS** (static, spec-anchored + discrimination sensor)
- verifier: independent `massa-ai-verification-agent` (author ≠ verifier), read-only
- diff range: working tree on `feat/skills-workflows-updates` off `origin/main` @ `ce26f28` (changes uncommitted at validation time)

## Verdict

**PASS.** All 6 requirements (SWU-01..06) satisfy their acceptance criteria at the single source of truth. 10/10 discrimination probes killed. The 4 named harness describe blocks are green; the only `test:scripts` failures are pre-existing at baseline and environmental.

## Spec-anchored outcome check (24/24 ACs)

| Req | ACs | Evidence |
| --- | --- | --- |
| SWU-01 | AC-1..4 | `references/code-annotation.md` §3 "Exception — data and domain models are not unit-tested" enumerates ORM/persistence entities, schema-mapped classes, repository entities, behaviorless value objects; lists all 10 languages; redirects to repository/service/use-case/mapper seam; preserves the behavior-tested rule for models with invariants. The 16 impl-workflow bodies were NOT edited (single-source via line-7 load). |
| SWU-02 | AC-1..4 | `references/implementation-delivery.md` Stage 1 contains the literal phrase "Mandatory worktree creation is the rule, not a preference" + "no size exemption" + "before the first repository mutation"; the two legal skip reasons and "Read-only workflows never load this file" preserved verbatim. |
| SWU-03 | AC-1..5 | New `references/repo-rules-discovery.md` defines discovery (`.claude/`, `.cursor/`, module/unit-test/testing-area conventions), absence-is-valid, never-fabricate, never-create-dirs; listed in `SKILL.md` Shared References; wired into `workflows/spec-driven.md` line 7 + Execute step 6. `.claude/` and `.cursor/` confirmed absent from this repo. |
| SWU-04 | AC-1..5 | `workflows/ticket.md` step 8 + `references/ticket/templates-and-quality.md` "Phased Decomposition" + `references/ticket/intake-and-sources.md`: Phase/Wave → one Jira Task, Task → one sub-task; reuses `tickets-subtasks`; no new issue type; emits keys to commit.md + the delivery protocol. |
| SWU-05 | AC-1..4 | `workflows/commit.md`: each Task = one atomic commit, subject prefixed `[XXX-YYYY]` (example `[SA-142] feat(auth): reject expired tokens`); branch-key regex retained as fallback; explicit task key takes precedence; cross-links by name (no literal delivery path string). |
| SWU-06 | AC-1..4 | `references/implementation-delivery.md` Stage 1 (phase branch `feat/<PHASE-KEY>-<slug>`) + new Stage 4 prose (PR title/body carry phase key prefix, example `[SA-100] Phase 1: search facade split`); non-phased `<type>/<slug>` and degraded paths unchanged; cross-links ticket.md + commit.md. |

## Discrimination sensor (prose-edition)

10/10 killed. Load-bearing probes:

- SWU-01 enumerates excluded kinds — a generic "models" sentence would NOT pass. ✅
- SWU-02 literal "mandatory worktree" present; skip reasons + read-only exclusion preserved. ✅
- SWU-03 `rg "repo-rules-discovery" skills/massa-ai/workflows/` matches **only** `spec-driven.md` (F3 Out-of-scope contract honored). ✅
- SWU-03 F1: `> **Dispatch:` block in `spec-driven.md` (lines ~105-114) still contiguous; repo-rules clause inserted outside it. ✅
- SWU-04/05/06: no literal `references/implementation-delivery.md` path string inside `commit.md` or `ticket.md` (would trip the delivery-scope contract test). ✅
- Single-source: among impl workflows only `commit.md`, `spec-driven.md`, `ticket.md` changed; the other 13 bodies untouched. Confirmed via `git diff --stat -- skills/massa-ai/workflows/` = 3 files, 5 insertions, 2 deletions. ✅
- 4-host byte-copy parity: `repo-rules-discovery.md` + edited prose present in all of claude/codex/cursor/opencode bundles. ✅

## Gate result

`bun run test:scripts` (run by the author in a shell-capable context): **524 pass / 1 skip / 11 fail / 9 errors**.

- The 4 named describe blocks are green: `skills-harness-integrity` (dispatch resolution, no phantom roles, policy single-source, reference integrity, router<->disk, charter permission, persona boundary, dispatch persona emission), `skill-artifact-parity` (drift gate + byte identity + no symlinks), `workflow-harness-contract` (delivery scope, mutation references, read-only complement = 19, invariants), `subagent-parity`.
- All 11 fails + 9 errors are **pre-existing at baseline `ce26f28`**, verified by `git stash` + re-run on clean main: `topLevelEntries` (npm-pack tarball read — needs built artifact), the oxlint `lint gate` (resolution — worktree not fully provisioned), and the `__zzz_crash_*` probe suites (designed to crash the parallel runner). None are caused by this feature; none are in its surface.
- `bun run type-check` skipped: `turbo` not provisioned in this worktree (`tool-missing`). Zero `.ts` files changed, so the tsc surface is structurally unaffected.

## Divergences found and fixed during Execute

1. First draft cross-linked the delivery reference by literal path inside `commit.md` and `ticket.md`; the `workflow-harness-contract` "read-only workflows do NOT load the delivery reference" sensor went red. Fixed by rephrasing both cross-links to "the Implementation Delivery Protocol" (concept pointer, not the path string).
2. Editing any `skills/massa-ai/**` file drifts all 4 host bundles (the generator copies the whole tree byte-for-byte). Ran `bun run scripts/generate-skill-artifacts.ts` → 587 files re-emitted; both `--check`s report No drift.

## Ranked gap list

None feature-level. (Verifier's 3 infra gaps — write validation.md, re-run gate, git diff --stat — all closed by the orchestrator: this file, the gate run above, and the diff --stat in the sensor section.)

## Residual risk

Low. The behavioral gate green is corroborated by static-invariant spot checks that match what the gate enforces; the pre-existing fails are environmental and unrelated. Harness-text changes ship as a real release across the 4 plugin bundles; the `[Unreleased]` CHANGELOG entry should be added at merge.
