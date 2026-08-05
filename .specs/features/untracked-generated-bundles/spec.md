# Untracked Generated Bundles Specification

Slug: `untracked-generated-bundles` · workflowSessionId: `spec-untracked-generated-bundles` · Sizing: Large (public compatibility surfaces: installers, CI, publish chain, marketplace channel; >10 files)

## Problem Statement

Every change to `skills/` sources is replicated as checked-in generated copies into all four plugin bundles (~1,155 tracked files: 4× `skills/`, 4× `agents/`, 4× `agent-profiles/`, 2× `hooks/massa-ai-hook`, 1× `lib/opencode-config.cjs`). Each source edit produces 4x diffs, pollutes PR review, burns tokens, and risks drift caught only by CI `--check` gates. The bundles are pure build output; git should not track them.

## Goals

- [ ] Zero generated bundle files tracked in git (`git ls-files` count 0 for managed subtrees).
- [ ] Every existing install channel keeps working: npm tarball, repo-checkout installers, git-marketplace in-place (with documented generation prerequisite).
- [ ] All CI gates, parity tests, and the publish chain stay green with generation-on-demand.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Dropping the git-marketplace channel | User decision 2026-08-05: keep channel, add generation prerequisite |
| Auto-installing a git post-merge hook | Installer side effects are a known trap; hook is documented as opt-in snippet only |
| Changing bundle content or generator output format | Byte-identical output is the contract; this feature moves storage, not content |
| Shared runtime content package (`@massa-ai/skills-content`) | Rejected in analysis: version-skew matrix, breaks self-contained tarballs |
| `.gitattributes` linguist-generated tier | Superseded — untracked files need no review hiding |
| Profile-switch engine changes | `agent-profiles/` changes storage only; switch engine reads installed copies, not repo |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Marketplace channel handling | Untrack all 4; generation step before `marketplace add`; regenerate after pull | User selected 2026-08-05 over keep-2-tracked and drop-channel options | y |
| Publish-time generation location | `publish.yml` build job, before `Upload build artifacts` | Publish jobs have no checkout (only the uploaded artifact); a `prepack` script cannot see generator sources | y (structural fact) |
| Tarball installs never regenerate | `install.sh` detects repo-checkout context (generator sources present) and only then generates | Tarballs ship pre-generated files and lack `scripts/` + `skills/` sources | y (structural fact) |
| Post-merge hook | Documented snippet in README, never auto-installed | Memory: installer side effects reverse user decisions; opt-in only | y |
| Local test-time generation | Chained into `test:scripts` / `test:plugins` script definitions (mechanism decided in Design) | Fresh clone must pass gates without manual step; Bun pre/post script behavior verified in Design | y |

**Open questions:** none — all resolved or logged above.

## User Stories

### P1: Single-source skill edits ⭐ MVP

**User Story**: As the repo maintainer, I want skill/agent source edits to touch only `skills/` and `scripts/lib/` so that PRs show 1x diffs and drift is structurally impossible.

**Why P1**: The entire point of the feature.

**Acceptance Criteria**:

1. The repository SHALL track zero files under `apps/{claude,codex,cursor,opencode}-plugin/skills/`, `apps/*/agents/`, `apps/*/agent-profiles/`, `apps/{codex,cursor}-plugin/hooks/massa-ai-hook`, and `apps/opencode-plugin/lib/opencode-config.cjs` (verified by `git ls-files` count = 0 per path). <!-- ubiquitous · UGB-01 -->
2. WHEN `bun run generate:artifacts` runs from the repo root THEN the system SHALL emit every managed subtree for all four hosts (skill artifacts, subagent artifacts including all agent-profile variants, hook copies, opencode-config mirror) and exit 0. <!-- event-driven · UGB-02 -->
3. WHEN generation runs twice consecutively THEN the second run SHALL produce zero drift (both generators' `--check` exit 0 immediately after emit). <!-- event-driven · UGB-03 -->
4. WHEN a `skills/` source file is deleted and generation reruns THEN the managed roots SHALL contain no stale artifact from the deleted source. <!-- event-driven · UGB-04 -->

**Independent Test**: Fresh clone → `bun install` → `bun run generate:artifacts` → both generators `--check` clean; `git status` shows no tracked bundle changes; edit one skill source → only that source file appears in `git diff`.

### P1: Install channels preserved ⭐ MVP

**User Story**: As an end user on any channel (npm tarball, repo checkout, git marketplace), I want installs to behave as before so that the storage change is invisible.

**Why P1**: Installers, hooks, and generated config are public compatibility surfaces; breaking them is the feature's main risk.

**Acceptance Criteria**:

1. WHEN a plugin `install.sh` runs from a repo checkout (generator sources present) THEN it SHALL run generation before copying or registering any bundle file. <!-- event-driven · UGB-05 -->
2. WHEN a plugin `install.sh` runs from an unpacked npm tarball (generator sources absent) THEN it SHALL skip generation and install the shipped pre-generated files unchanged. <!-- event-driven · UGB-06 -->
3. IF bundles are absent and the installer cannot generate (no bun/node runtime, or generation fails) THEN the installer SHALL exit non-zero with a message naming the missing prerequisite, before mutating any host config. <!-- unwanted-behavior · UGB-07 -->
4. WHEN `scripts/install-harness.sh` runs from a checkout THEN each per-plugin `install.sh` it invokes SHALL find generated bundles present (generation ran at most once per harness invocation, not skipped). <!-- event-driven · UGB-08 -->
5. The published npm tarballs for all four plugins SHALL contain the same top-level entry set as before this feature (`verify-package-contents.ts` `EXPECTED_PACKAGES` unchanged and passing). <!-- ubiquitous · UGB-09 -->

**Independent Test**: `verify-package-contents.ts` green after staging from a generated tree; per-plugin install e2e tests (`test:plugins`) green from a fresh clone; simulated tarball dir (no `scripts/`) install run skips generation.

### P1: CI and publish chain green ⭐ MVP

**User Story**: As the release owner, I want CI and the automated release chain to generate bundles themselves so that no gate or published artifact depends on tracked copies.

**Why P1**: `publish.yml` publish jobs consume only the build job's uploaded artifact; without generation before upload, releases ship empty plugins.

**Acceptance Criteria**:

1. The `ci.yml` build job SHALL run generation before `verify-package-contents.ts`, the skill-artifact drift check, `test:scripts`, and `test:plugins` steps. <!-- ubiquitous · UGB-10 -->
2. The `publish.yml` build job SHALL run generation before the `Upload build artifacts` step, and the artifact path list SHALL continue to enumerate every bundle directory it enumerates today. <!-- ubiquitous · UGB-11 -->
3. WHEN `bun run test:scripts` or `bun run test:plugins` runs on a fresh clone after `bun install` THEN all suites SHALL pass without a manual generation step. <!-- event-driven · UGB-12 -->
4. IF generation has not run and a parity test executes THEN the test run SHALL fail with a message identifying missing generated artifacts, not pass vacuously. <!-- unwanted-behavior · UGB-13 -->
5. WHEN `bun run test:coverage` or turbo-dispatched `bun run test` runs on a fresh clone after `bun install` THEN generated bundles SHALL be present before any suite that reads them executes (coverage path and opencode-plugin package test path both chained). <!-- event-driven · UGB-17 -->

**Independent Test**: Fresh-clone simulation (scratch worktree, clean of untracked files) through `bun install` → full gate set green; grep `publish.yml` step order.

### P2: Documentation matches the new contract

**User Story**: As a marketplace-channel user or contributor, I want docs to state the generation prerequisite so that a stale checkout is a known, documented state.

**Why P2**: Only remaining manual path; doc-only.

**Acceptance Criteria**:

1. The README marketplace section SHALL document the generation prerequisite before `marketplace add` and the post-`git pull` regeneration requirement, and SHALL include an opt-in post-merge hook snippet. <!-- ubiquitous · UGB-14 -->
2. The docs SHALL state the generated-on-demand contract in `CLAUDE.md` and `CONTRIBUTING.md` wherever they currently describe checked-in generated bundles (file counts, "checked in", regenerate-and-commit instructions). <!-- ubiquitous · UGB-15 -->
3. The `CHANGELOG.md` `[Unreleased]` section SHALL carry an entry for this change (CI merge gate). <!-- ubiquitous · UGB-16 -->

**Independent Test**: Scripted grep for stale "checked in"/count claims over README/CLAUDE.md/CONTRIBUTING.md; CHANGELOG diff present.

## Edge Cases

- IF `install.sh` runs in a checkout where `bun install` was never run (no node_modules) THEN generation SHALL still work or fail loudly per UGB-07 (generators' import surface checked in Design).
- WHEN `git rm --cached` untracks bundles THEN working-tree copies remain (gitignored) — dev checkouts keep working immediately; stale leftovers are caught by UGB-03/04 determinism.
- IF a user runs `/plugin marketplace add` on an ungenerated checkout THEN Claude serves an empty/missing plugin — no code gate possible (Claude reads the dir directly); mitigated by UGB-14 docs + installer path UGB-05.
- WHEN `npm pack --ignore-scripts` runs (verify-package-contents) THEN no lifecycle script is relied on for correctness — generation happens before staging, never inside pack.
- IF the generators are non-deterministic on any file THEN UGB-03 fails — determinism is a hard precondition for untracking.

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| UGB-01 | P1: Single-source edits | Design | Pending |
| UGB-02 | P1: Single-source edits | Design | Pending |
| UGB-03 | P1: Single-source edits | Design | Pending |
| UGB-04 | P1: Single-source edits | Design | Pending |
| UGB-05 | P1: Install channels | Design | Pending |
| UGB-06 | P1: Install channels | Design | Pending |
| UGB-07 | P1: Install channels | Design | Pending |
| UGB-08 | P1: Install channels | Design | Pending |
| UGB-09 | P1: Install channels | Design | Pending |
| UGB-10 | P1: CI/publish | Design | Pending |
| UGB-11 | P1: CI/publish | Design | Pending |
| UGB-12 | P1: CI/publish | Design | Pending |
| UGB-13 | P1: CI/publish | Design | Pending |
| UGB-14 | P2: Documentation | Design | Pending |
| UGB-15 | P2: Documentation | Design | Pending |
| UGB-16 | P2: Documentation | Design | Pending |
| UGB-17 | P1: CI/publish | Design | Pending |

**Coverage:** 17 total, 0 mapped to tasks (Tasks phase pending), 0 unmapped after Tasks.

## Implicit-Requirement Sweep (Large — all dimensions)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | UGB-07 (installer prerequisite failure); generator inputs unchanged — N/A beyond that because generators' own validation is out of scope |
| Failure / partial-failure states | UGB-07 (fail before host-config mutation); UGB-13 (no vacuous pass) |
| Idempotency / retry / duplicate handling | UGB-03 (generation idempotent); UGB-08 (at-most-once per harness run) |
| Auth boundaries & rate limits | N/A because no auth surface is touched (file generation + git metadata only) |
| Concurrency / ordering | UGB-10/11 (generation strictly before consumers in CI/publish); local concurrent generation N/A because generators are single-invocation CLI tools, unchanged |
| Data lifecycle / expiry | UGB-04 (stale artifact pruning); working-tree leftovers edge case |
| Observability | Generators already print emit/drift summaries; installer failure message UGB-07. No new telemetry — N/A beyond existing output |
| External-dependency failure | N/A because no network or service dependency is added; bun runtime absence covered by UGB-07 |
| State-transition integrity | Install-state.json contract untouched (out of scope table); marketplace stale-state documented UGB-14 |

## Verification Approach

- Deterministic gates: `bun run lint`, `bun run test:scripts`, `bun run test:plugins`, both generators `--check`, `bun scripts/verify-package-contents.ts`.
- Fresh-clone cold-path simulation in a scratch worktree cleaned of untracked files (memory: scratch worktrees drop uncommitted sensors — verify sensor population present before reading verdicts).
- `git ls-files` zero-count checks per untracked subtree (UGB-01) — scripted, not eyeballed.
- Tarball-context simulation: staged dir without generator sources → install.sh skip-generation branch.
- Independent verification-agent (author ≠ verifier) with discrimination sensor at Execute end.

## Discuss Context Summary

Gray area (marketplace channel) surfaced from investigation: Claude + Codex serve `apps/<host>-plugin/` in place from the checkout (root `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`; README.md:181-187). User chose full untracking with generation prerequisite over keeping two hosts tracked or dropping the channel (2026-08-05).

## Sizing Signals

- **Design: required.** Public contract (installers, publish chain, marketplace), architecture decisions (generation entrypoint, checkout detection, CI step placement, parity-test conversion), tradeoffs.
- **Tasks: required.** >10 files, dependency ordering (gitignore/untrack must land with generation wiring atomically), multi-surface.
