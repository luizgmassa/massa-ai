# Untracked Generated Bundles Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. If the skill cannot be activated, STOP and tell the user.

---

**Design**: `.specs/features/untracked-generated-bundles/design.md`
**Status**: Done — T1-T14 complete (validation pending)

**Results (2026-08-05, 3 batch workers):** T1 `af907544` · T2 `f73da43e` · T3 `1ca1b058` · T4 `9d00ab08` · T5 `a55b5866` · T6 `c83b8749` · T7 `94dd6757` · T8 `a3d6efd1` · T9 `fd9c9d17` · T10 `5749cc16` · T11 `783708a2` · T12 `8b59bd60` · T13 `d9554c42` · T14 `0fe89367`. All observed-red sensors recorded in batch summaries. Untrack census 1141 exact. Accepted interpretations: (1) checkout detection uses `$REPO_ROOT`, not `PLUGIN_SOURCE_ROOT` (copy-mode would misreport tarball); (2) T10/T11 sensor split (ci.yml assertion in T10, publish.yml assertion red-first in T11) keeping every commit green; (3) four pre-existing shell suites scoped with `MASSA_AI_SKIP_ARTIFACT_GENERATION=1` to preserve their discrimination against the new unconditional regeneration.

---

## Project Testing Guidelines Scan

Guidelines found: `CLAUDE.md` (isolation runner, 5 s timeout policy, test:scripts vs turbo split, coverage 90%-per-file floor), `CONTRIBUTING.md` (7-step managed-harness protocol, measurement discipline), `.github/workflows/{ci,coverage}.yml` (gate commands), existing `scripts/__tests__/*.test.ts` (generator/parity test conventions), `scripts/tests/*.sh` (installer shell-suite conventions), `apps/*-plugin/__tests__/install.test.ts` (installer e2e conventions).

## Test Coverage Matrix

> Generated from codebase and guidelines above — confirm before Execute.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Generators (`scripts/generate-*.ts`) | unit | Prune behavior: stale-file removal, hand-authored-file survival, determinism (emit→`--check` clean) — 1:1 to UGB-03/04 | `scripts/__tests__/*.test.ts` | `bun run test:scripts` (or `bun test scripts/__tests__/<file>`) |
| Root/package scripts wiring | unit | Pre-script chain observed (generation runs before suites); turbo passthrough unaffected | `scripts/__tests__/*.test.ts` | `bun run test:scripts` |
| Parity guards | unit | Observed red on missing bundle (new-sensor rule), actionable message | `scripts/__tests__/{skill-artifact,subagent}-parity.test.ts` | `bun run test:scripts` |
| Installers (`apps/*/install.sh`, harness) | integration (shell + e2e) | Checkout mode generates; tarball-shaped dir skips; missing-runtime loud failure before host-config mutation; harness once-only | `apps/*-plugin/__tests__/install.test.ts`, `scripts/tests/*.sh` | `bun run test:plugins`, `bun run test:scripts` |
| Workflow YAML (`ci.yml`, `publish.yml`) | unit (order sensor) | Generation step precedes verify-package-contents / Upload build artifacts | `scripts/__tests__/workflow-generation-order.test.ts` (new) | `bun run test:scripts` |
| Git metadata (`.gitignore`, untrack) | none — scripted artifact check | `git ls-files` count = 0 per managed subtree, printed population beside verdict | — | inline script in T12 gate |
| Docs (README, CLAUDE.md, CONTRIBUTING.md, CHANGELOG) | none — scripted artifact check | Stale-claim sweep zero hits; CHANGELOG `[Unreleased]` entry present | — | inline script in T13 gate |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Single-file generator/test tasks | `bun test scripts/__tests__/<touched>.test.ts` + `bun scripts/generate-skill-artifacts.ts --check` + `bun scripts/generate-subagent-artifacts.ts --check` |
| Full | Installer / wiring tasks | `bun run test:scripts` + `bun run test:plugins` |
| Build | Phase completion, cutover, docs | `bun run lint` + `bun run test:scripts` + `bun run test:plugins` + both `--check` + `bun scripts/verify-package-contents.ts` |

## MCP And Skill Question

massa-ai MCP server not used this session (`.specs/` files canonical; plain Read/Grep/Bash sufficient — repo is small-file-count for this surface and index freshness is unverified). Skills: `massa-ai` router active. No other MCP/skill materially changes implementation or verification. Confirmed with user at Execute go-ahead.

---

## Execution Plan

Phases are ordered and sequential; tasks within a phase execute in order.

### Phase 1: Generation contract (repo stays green; bundles still tracked)

T1 → T2 → T3 → T4

### Phase 2: Consumer wiring (installers, harness, CI, publish)

T5 → T6 → T7 → T8 → T9 → T10 → T11

### Phase 3: Cutover, docs, evidence

T12 → T13 → T14

---

## Task Breakdown

### T1: Add prune-before-emit to skill-artifact generator

**What**: `emitAll` removes each managed root (and hook-binary file / `lib` per capability) before copying, derived from `managedRootsFor`/capability tables; unit tests prove stale-file removal and hand-authored quick-skill survival (`apps/codex-plugin/skills/def.md` class).
**Where**: `scripts/generate-skill-artifacts.ts`
**Depends on**: None
**Reuses**: `managedRootsFor`, `capabilitiesFor` tables; existing `--check` temp-dir emit path (must remain prune-safe)
**Requirement**: UGB-03, UGB-04 (TASK-001)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Stale file planted in a managed root vanishes after emit; quick skills and `hooks.json` survive (both asserted red-first)
- [ ] `--check` clean immediately after emit
- [ ] Gate check passes: quick gate

**Tests**: unit
**Gate**: quick
**Commit**: `feat(generators): prune managed roots before skill-artifact emit`

---

### T2: Add prune-before-emit to subagent generator

**What**: `emitAll`/`emitVariants` remove `agents/` and `agent-profiles/` per host before copying, including stale variant dirs for dropped profiles; unit tests prove removal + determinism.
**Where**: `scripts/generate-subagent-artifacts.ts`
**Depends on**: None
**Reuses**: `HOST_DIRS`, `staleVariantDirs` logic; frozen-baseline fixture unchanged
**Requirement**: UGB-03, UGB-04 (TASK-002)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Planted stale agent file and stale variant dir vanish after emit (red-first)
- [ ] `--check` clean immediately after emit; baseline regression test still green
- [ ] Gate check passes: quick gate

**Tests**: unit
**Gate**: quick
**Commit**: `feat(generators): prune agents and agent-profiles before subagent emit`

---

### T3: Root generate:artifacts entrypoint + pre-script chaining

**What**: Root `package.json` gains `generate:artifacts`, `pretest:scripts`, `pretest:plugins`, `pretest:coverage`; `apps/opencode-plugin/package.json` gains package-level `pretest` chaining both generators (turbo-dispatched `test` safety, pre-mortem finding 2).
**Where**: `package.json` (root; plus the opencode manifest edit it names)
**Depends on**: T1, T2
**Reuses**: measured Bun pre-script behavior (1.3.14)
**Requirement**: UGB-02, UGB-12, UGB-17 (TASK-003)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `bun run test:scripts`/`test:plugins`/`test:coverage` each emit the generator summary line before suites (observed)
- [ ] `turbo-passthrough-env.test.ts` green (no new env read in TS)
- [ ] Gate check passes: quick gate

**Tests**: unit
**Gate**: quick
**Commit**: `feat(build): chain artifact generation ahead of every test entry point`

---

### T4: Parity-test presence guards

**What**: `beforeAll` sentinel checks in both parity suites failing with `run 'bun run generate:artifacts' first` when bundles absent; red observed by deleting one generated dir in scratch state.
**Where**: `scripts/__tests__/skill-artifact-parity.test.ts` (and its subagent sibling it names)
**Depends on**: T3
**Reuses**: existing suite structure
**Requirement**: UGB-13 (TASK-004)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Guard red observed with actionable message; green after regeneration
- [ ] Gate check passes: quick gate

**Tests**: unit
**Gate**: quick
**Commit**: `test(parity): fail loudly when generated bundles are absent`

---

### T5: Claude installer generation step

**What**: Checkout-detected generation (sources present + skip-env unset → run both generators via bun; bun missing → loud exit before host mutation; tarball → skip) + bundle sentinel check, before `install_bundled_skills`/marketplace registration.
**Where**: `apps/claude-plugin/install.sh`
**Depends on**: T3
**Reuses**: `PLUGIN_SOURCE_ROOT` resolution; existing exit-code conventions (`exit 3` runtime-missing)
**Requirement**: UGB-05, UGB-06, UGB-07 (TASK-005)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `apps/claude-plugin/__tests__/install.test.ts` green incl. new skip-branch + loud-failure cases
- [ ] Gate check passes: full gate (plugins subset)

**Tests**: integration
**Gate**: full
**Commit**: `feat(claude-plugin): generate bundles before install in checkout context`

---

### T6: Codex installer generation step

**What**: Same contract as T5 for codex.
**Where**: `apps/codex-plugin/install.sh`
**Depends on**: T3
**Reuses**: T5 block shape
**Requirement**: UGB-05, UGB-06, UGB-07 (TASK-006)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Codex install e2e green incl. new cases
- [ ] Gate check passes: full gate (plugins subset)

**Tests**: integration
**Gate**: full
**Commit**: `feat(codex-plugin): generate bundles before install in checkout context`

---

### T7: Cursor installer generation step

**What**: Same contract as T5 for cursor.
**Where**: `apps/cursor-plugin/install.sh`
**Depends on**: T3
**Reuses**: T5 block shape
**Requirement**: UGB-05, UGB-06, UGB-07 (TASK-007)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Cursor install e2e green incl. new cases
- [ ] Gate check passes: full gate (plugins subset)

**Tests**: integration
**Gate**: full
**Commit**: `feat(cursor-plugin): generate bundles before install in checkout context`

---

### T8: OpenCode installer generation step

**What**: Same contract as T5 for opencode (also covers `lib/opencode-config.cjs` presence sentinel).
**Where**: `apps/opencode-plugin/install.sh`
**Depends on**: T3
**Reuses**: T5 block shape
**Requirement**: UGB-05, UGB-06, UGB-07 (TASK-008)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] OpenCode install e2e green incl. new cases
- [ ] Gate check passes: full gate (plugins subset)

**Tests**: integration
**Gate**: full
**Commit**: `feat(opencode-plugin): generate bundles before install in checkout context`

---

### T9: Harness once-only generation

**What**: `install-harness.sh` runs `generate:artifacts` once up front and exports `MASSA_AI_SKIP_ARTIFACT_GENERATION=1` for the plugin phase; shell suite proves single generation (count generator summary lines).
**Where**: `scripts/install-harness.sh`
**Depends on**: T5, T6, T7, T8
**Reuses**: existing harness host-detection flow
**Requirement**: UGB-08 (TASK-009)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Shell suite asserts exactly one generation per harness run (red-first by asserting >1 without env)
- [ ] Gate check passes: full gate

**Tests**: integration
**Gate**: full
**Commit**: `feat(installers): generate once per harness run via skip env`

---

### T10: CI build-job generation step + workflow order sensor

**What**: `ci.yml` build job gains `bun run generate:artifacts` after install, before build/verify-package-contents; new `workflow-generation-order.test.ts` asserts generation precedes `verify-package-contents` in `ci.yml` and `Upload build artifacts` in `publish.yml` (sensor red-first against unedited `publish.yml`).
**Where**: `.github/workflows/ci.yml` (plus the new sensor test it names)
**Depends on**: T3
**Reuses**: existing build-job step layout
**Requirement**: UGB-10 (TASK-010)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Sensor red observed against unedited `publish.yml`, green for `ci.yml` half
- [ ] Gate check passes: quick gate

**Tests**: unit
**Gate**: quick
**Commit**: `ci: generate plugin bundles in build job before packaging gates`

---

### T11: Publish build-job generation step

**What**: `publish.yml` build job gains the generation step before `Upload build artifacts`; artifact path list untouched; T10 sensor goes fully green.
**Where**: `.github/workflows/publish.yml`
**Depends on**: T10
**Reuses**: T10 sensor
**Requirement**: UGB-11 (TASK-011)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `workflow-generation-order.test.ts` fully green
- [ ] `bun scripts/verify-package-contents.ts` green after fresh emit
- [ ] Gate check passes: quick gate

**Tests**: unit
**Gate**: quick
**Commit**: `ci(publish): generate bundles before artifact upload`

---

### T12: Gitignore + untrack cutover

**What**: Nine root-precise `.gitignore` entries; scripted `git rm -r --cached` enumerated from `git ls-files` with count printed and diffed against census before commit (memory: pathspec `*` crosses `/`; truncated output becomes a hardcoded population).
**Where**: `.gitignore`
**Depends on**: T4, T9, T11
**Reuses**: census figures from design (1,150 + hooks + lib)
**Requirement**: UGB-01 (TASK-012)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `git ls-files` count = 0 per managed subtree, population printed beside verdict; quick skills/`hooks.json`/claude hook source still tracked
- [ ] Gate check passes: build gate (full suite post-cutover)

**Tests**: none — scripted artifact check (matrix: git metadata layer)
**Gate**: build
**Commit**: `build!: stop tracking generated plugin bundles`

---

### T13: Documentation updates

**What**: README marketplace prerequisite + post-pull regeneration + opt-in post-merge hook snippet + `massa-ai-config` ungenerated-checkout note; CLAUDE.md generated-on-demand contract (5 MB/580-file claims, regenerate guidance); CONTRIBUTING.md sweep; CHANGELOG `[Unreleased]` entry.
**Where**: `README.md` (plus CLAUDE.md/CONTRIBUTING.md/CHANGELOG.md rows it names)
**Depends on**: T12
**Reuses**: docs-layering rule (one place per rule)
**Requirement**: UGB-14, UGB-15, UGB-16 (TASK-013)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Scripted stale-claim sweep zero hits (population printed); CHANGELOG entry present
- [ ] Gate check passes: quick gate (docs have no runtime surface; lint unaffected)

**Tests**: none — scripted artifact check (matrix: docs layer)
**Gate**: quick
**Commit**: `docs: generated-on-demand bundle contract and marketplace prerequisite`

---

### T14: Fresh-clone cold-path evidence + project decision

**What**: Scratch-worktree fresh-clone simulation (sensor-presence check first): `bun install` → `test:scripts`, `test:plugins`, `test:coverage` opencode unit, turbo `bun run test` all green; deliberate red (delete one generated dir) observed; append AD-016 generated-bundles decision to `.specs/project/STATE.md`.
**Where**: `.specs/project/STATE.md`
**Depends on**: T12, T13
**Reuses**: scratch-worktree discipline from memory
**Requirement**: UGB-03, UGB-09, UGB-12, UGB-17 evidence (TASK-014)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All four entry points green in scratch worktree; observed red recorded
- [ ] AD-016 appended
- [ ] Gate check passes: build gate

**Tests**: none — evidence task over prior layers' suites
**Gate**: build
**Commit**: `docs(specs): cold-path evidence and AD-016 generated-bundles decision`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4
Phase 2:  T5 ──→ T6 ──→ T7 ──→ T8 ──→ T9 ──→ T10 ──→ T11
Phase 3:  T12 ──→ T13 ──→ T14
```

Execution is strictly sequential. Packing at Execute: `3 Phases = 14 Tasks` → Batch 1 = Phase 1 (4 Tasks), Batch 2 = Phase 2 (7 Tasks), Batch 3 = Phase 3 (3 Tasks).

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 file (generator) + its tests | ✅ Granular |
| T2 | 1 file (generator) + its tests | ✅ Granular |
| T3 | root manifest + named opencode manifest (cohesive wiring pair) | ✅ OK — cohesive |
| T4 | 2 sibling test files, same guard | ✅ OK — cohesive |
| T5–T8 | 1 installer each | ✅ Granular |
| T9 | 1 script + its shell suite | ✅ Granular |
| T10 | 1 workflow + its named sensor | ✅ OK — cohesive |
| T11 | 1 workflow | ✅ Granular |
| T12 | 1 file + scripted git mutation | ✅ Granular |
| T13 | 4 doc files, one contract | ✅ OK — cohesive |
| T14 | evidence + 1 state append | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | phase start | ✅ Match |
| T2 | None | after T1 (order only) | ✅ Match |
| T3 | T1, T2 | after T2 | ✅ Match |
| T4 | T3 | after T3 | ✅ Match |
| T5 | T3 | phase 2 start | ✅ Match |
| T6 | T3 | after T5 (order only) | ✅ Match |
| T7 | T3 | after T6 (order only) | ✅ Match |
| T8 | T3 | after T7 (order only) | ✅ Match |
| T9 | T5, T6, T7, T8 | after T8 | ✅ Match |
| T10 | T3 | after T9 (order only) | ✅ Match |
| T11 | T10 | after T10 | ✅ Match |
| T12 | T4, T9, T11 | phase 3 start | ✅ Match |
| T13 | T12 | after T12 | ✅ Match |
| T14 | T12, T13 | after T13 | ✅ Match |

No forward dependencies; all arrows point backward or within phase.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Generators | unit | unit | ✅ OK |
| T2 | Generators | unit | unit | ✅ OK |
| T3 | Scripts wiring | unit | unit | ✅ OK |
| T4 | Parity guards | unit | unit | ✅ OK |
| T5–T8 | Installers | integration | integration | ✅ OK |
| T9 | Installers | integration | integration | ✅ OK |
| T10 | Workflow YAML | unit (sensor) | unit | ✅ OK |
| T11 | Workflow YAML | unit (sensor) | unit | ✅ OK |
| T12 | Git metadata | none — scripted check | none (scripted) | ✅ OK |
| T13 | Docs | none — scripted check | none (scripted) | ✅ OK |
| T14 | Evidence | none — prior suites | none (evidence) | ✅ OK |

## Requirement Coverage

UGB-01→T12 · UGB-02→T3 · UGB-03→T1,T2,T14 · UGB-04→T1,T2 · UGB-05/06/07→T5–T8 · UGB-08→T9 · UGB-09→T11,T14 · UGB-10→T10 · UGB-11→T11 · UGB-12→T3,T14 · UGB-13→T4 · UGB-14/15/16→T13 · UGB-17→T3,T14. **17 of 17 mapped, 0 unmapped.**
