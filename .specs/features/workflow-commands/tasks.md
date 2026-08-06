# Workflow Commands Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `massa-ai` skill: activate it by name and
follow its Execute flow and Critical Rules. Builders must load
`CONTRIBUTING.md`'s managed-harness protocol — this feature changes plugins,
installers, and generated surfaces (all managed-harness classes).

**Design**: `.specs/features/workflow-commands/design.md` (Approach A approved)
**Status**: Approved (user 2026-08-05: Execute through PR; 2 batch workers; tools NONE)

---

## Project Testing Guidelines Scan

Sources found and applied: `CLAUDE.md` (isolation runner rules, 5 s per-test
timeout, `test:scripts` reaches `scripts/__tests__` + shell suites,
`test:plugins` is the single runner for `apps/*-plugin/__tests__`, turbo
`passThroughEnv` rule — no new env vars in this feature), `CONTRIBUTING.md`
(managed-harness 7-step protocol, measurement discipline), existing samples:
`scripts/__tests__/skill-artifact-parity.test.ts` (generator contract style,
`beforeAll` loud-fail on absent bundles), `apps/codex-plugin/__tests__/manifest.test.ts`
(count-lock style), `apps/claude-plugin/__tests__/install.test.ts` (installer
behavior tests). Lesson L-001 applied: every guard path gets a discriminating
red. Confirmed lessons re: sensors (observed red before quotable) applied to
T3/T4/T5/T6.

## Test Coverage Matrix

> Generated from codebase + guidelines — confirm before Execute.
> Guidelines found: `CLAUDE.md`, `CONTRIBUTING.md`, existing test samples above.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Generator logic (scan/validate/render/prune/check) | unit | All fail-loud branches 1:1 to WFC-05 guards; idempotency; add/delete set-diff; stale+modified marker reds | `scripts/__tests__/*.test.ts` | `bun test scripts/__tests__/<file>.test.ts` |
| Cross-host artifact contract | unit (contract) | Count parity (scan-derived), byte-identity ×3, marker presence, quick-files tracked+marker-free, no shell placeholders | `scripts/__tests__/workflow-command-parity.test.ts` | `bun run test:scripts` |
| Host manifest count locks | unit | Widened lock red under mutation (drop a generated file → red; drop a quick file → red) | `apps/{codex,cursor}-plugin/__tests__/manifest.test.ts` | `bun run test:plugins` |
| Installer behavior (install/uninstall/skip) | unit (fs-level install tests) | Delivery of generated set, uninstall removes owned-only, quick files untouched, host-absent skip | `apps/<host>-plugin/__tests__/install.test.ts` | `bun run test:plugins` |
| Packaging inventory | unit | New roots present in published file set | `scripts/verify-package-contents.ts` + its test | `bun run test:scripts` |
| Docs / CHANGELOG / .specs state | none | — (build gate only) | — | build gate |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After a task with unit tests in one file | `bun test <that file>` |
| Full | After contract/installer tasks | `bun run test:scripts && bun run test:plugins` |
| Build | Phase completion / docs-only tasks | `bun run lint && bun scripts/generate-skill-artifacts.ts --check && bun scripts/generate-subagent-artifacts.ts --check && bun run test:scripts && bun run test:plugins` |

---

## Execution Plan

Phases ordered, sequential; tasks in order within a phase.
`4 Phases = 13 Tasks`.

### Phase 1: Generator (1 Phase = 3 Tasks)

T1 → T2 → T3

### Phase 2: Count Locks Then Contract (1 Phase = 3 Tasks)

T5 → T6 → T4

> Critic finding F2 (folded): the full gate that runs `test:plugins` is red
> between first emission and lock widening — so the locks widen first and
> the cross-host contract test lands after them; Phase 1 uses quick gates
> only. Rationale detail: design.md Risks table, lock-sequencing row.

### Phase 3: Delivery (1 Phase = 5 Tasks)

T7 → T8 → T9 → T10 → T11

### Phase 4: Docs And State (1 Phase = 2 Tasks)

T12 → T13

---

## Task Breakdown

### T1: Workflow-command entry collection and templates

**What**: `collectWorkflowCommandEntries()` — scan `skills/massa-ai/workflows/**/*.md`, extract stem + frontmatter `description:`, render shared template and OpenCode variant (design Component 2, marker line included), fail-loud guards: missing description, duplicate stem, name collision against `def|find|graph|index|map|status` AND the reserved bundle roots `massa-ai|persona-router|profile|agents` (critic F3 — a stem matching a reserved root would collide with directory-root prune on Cursor), charset `^[a-z0-9][a-z0-9-]*$`.
**Where**: `scripts/lib/workflow-commands.ts` (new; consumed by generator in T2)
**Depends on**: None
**Reuses**: frontmatter-parse idiom from existing generators; quick-command template shape (`apps/claude-plugin/commands/def.md`)
**Requirement**: WFC-01, WFC-04, WFC-05, WFC-13 · **ID**: TASK-001

**Tools**:

- MCP: NONE (local fs)
- Skill: NONE

**Done when**:

- [ ] Unit tests: each guard observed red via fixture (5 reds: description, duplicate, quick-name, reserved-root, charset), then green on live inventory; population count = live scan count (never hardcoded 38)
- [ ] Templates contain marker + `$ARGUMENTS`, no `` !` `` shell placeholder; OpenCode variant frontmatter = `description:` only
- [ ] Gate passes: `bun test scripts/__tests__/workflow-command-entries.test.ts`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(generator): workflow-command entry collection + templates`

---

### T2: Emit + marker-scoped prune in generate-skill-artifacts

**What**: Per-host emit branches (claude `commands/<stem>.md`, codex `skills/<stem>.md`, cursor `skills/<stem>/SKILL.md`, opencode `command/massa-ai-<stem>.md` via new `"command"` in opencode `extraManagedRoots`), marker-scoped prune for the three shared dirs before emit, per-host emitted-population print.
**Where**: `scripts/generate-skill-artifacts.ts` (+ one-line `scripts/lib/host-capabilities.ts` change)
**Depends on**: T1
**Reuses**: `includes("lib")` emit-branch precedent (:297-304); `pruneManagedRoots` (:251); `managedRootsFor` (:210)
**Requirement**: WFC-02, WFC-03, WFC-06 · **ID**: TASK-002

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Unit tests: double-run byte-idempotency; scratch-inventory add/delete → emitted set gains/loses exactly that stem; planted marker-bearing stale file pruned; hand-authored quick file (no marker) survives prune — each red-first where the assertion is new
- [ ] `bun run generate:artifacts` emits 38×3 shared + 38 opencode artifacts, prints per-host counts
- [ ] Gate passes: `bun test scripts/__tests__/workflow-command-emit.test.ts`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(generator): emit workflow commands per host with marker-scoped prune`

---

### T3: Marker-scoped `--check` extension

**What**: Extend `runCheck` with a marker-scoped inventory diff for the three shared dirs (missing/unexpected/modified vs fresh emission; marker-bearing-only candidates), beside the existing directory-root walk (opencode `command/` flows through `managedRootsFor` unchanged).
**Where**: `scripts/generate-skill-artifacts.ts`
**Depends on**: T2
**Reuses**: `diffManagedRoot` diff shape (:326-353); hook-binary side-check precedent (:386-405)
**Requirement**: WFC-07 · **ID**: TASK-003

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Red-first fixtures: planted stale marker file → `unexpected` red; byte-modified generated file → `modified` red; both observed before green
- [ ] `--check` exit 0 on clean fresh emission
- [ ] Gate passes: `bun test scripts/__tests__/workflow-command-check.test.ts`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(generator): marker-scoped --check for workflow commands`

---

### T4: Gitignore entries + cross-host contract test

**What**: `.gitignore` star + 6 static quick-file negations for `apps/claude-plugin/commands/`, `apps/codex-plugin/skills/`, `apps/cursor-plugin/skills/` (+ whole `apps/opencode-plugin/command/`), and the contract test: scan-derived count parity per host, byte-identity claude==codex==cursor per stem, marker presence, description sourced from workflow frontmatter, no shell placeholders, 6 quick files still `git ls-files`-tracked and marker-free.
**Where**: `scripts/__tests__/workflow-command-parity.test.ts` (new; plus `.gitignore` edit)
**Depends on**: T2
**Reuses**: `skill-artifact-parity.test.ts` style (`beforeAll` loud-fail naming `bun run generate:artifacts`); `.gitignore:68-76` idiom
**Requirement**: WFC-09, WFC-10 · **ID**: TASK-004

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each new assertion observed red via mutation (host dropped from emit → count red; template diverged → identity red; negation removed → tracked-quick-file red)
- [ ] `git status` clean of generated artifacts after `generate:artifacts`; 6×3 quick files still tracked
- [ ] Gate passes: `bun run test:scripts`

**Tests**: unit (contract)
**Gate**: full
**Commit**: `feat(commands): gitignore generated command surfaces + parity contract test`

---

### T5: Widen codex manifest count lock

**What**: `manifest.test.ts` "exactly 6 skills/*.md" → 6 hand-authored marker-free quick files + scan-count generated marker-bearing files; both classes asserted separately.
**Where**: `apps/codex-plugin/__tests__/manifest.test.ts`
**Depends on**: T2
**Reuses**: existing lock structure (:75-84)
**Requirement**: WFC-11 · **ID**: TASK-005

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Widened lock observed red twice: one generated file deleted → red; one quick file deleted → red
- [ ] Gate passes: `bun run test:plugins`

**Tests**: unit
**Gate**: full
**Commit**: `test(codex-plugin): widen skills count lock for generated workflow commands`

---

### T6: Widen cursor manifest count lock

**What**: Same widening for cursor "6 skills/<name>/SKILL.md" lock: 6 quick dirs + scan-count generated stem dirs, marker-discriminated.
**Where**: `apps/cursor-plugin/__tests__/manifest.test.ts`
**Depends on**: T2
**Reuses**: existing lock (:63-72,136-141)
**Requirement**: WFC-11 · **ID**: TASK-006

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Widened lock observed red twice (generated dir deleted; quick dir deleted)
- [ ] Gate passes: `bun run test:plugins`

**Tests**: unit
**Gate**: full
**Commit**: `test(cursor-plugin): widen skills count lock for generated workflow commands`

---

### T7: Claude installer uninstall hardening + install test

**What**: File-route uninstall switches from source-basename loop to owned-prefix glob (`rm $TARGET/commands/massa-ai-*.md`); install test asserts generated commands delivered on file route, uninstall removes owned-only with bundles deleted, user commands untouched.
**Where**: `apps/claude-plugin/install.sh` (test in `apps/claude-plugin/__tests__/install.test.ts`)
**Depends on**: T2
**Reuses**: existing loops (:583-589,:634-641); install.test.ts harness
**Requirement**: WFC-08, WFC-12 · **ID**: TASK-007

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Test red-first against pre-hardening behavior (uninstall with absent bundle leaves stale installed copy → red on old code, green on new)
- [ ] Marketplace route untouched (served in place — assert no copy)
- [ ] Gate passes: `bun run test:plugins`

**Tests**: unit (install)
**Gate**: full
**Commit**: `fix(claude-plugin): prefix-glob uninstall for generated commands`

---

### T8: Codex install test for generated delivery

**What**: Extend codex install tests: flat copy loop delivers generated `skills/<stem>.md`, uninstall removes owned set only, quick files and managed skill dirs untouched.
**Where**: `apps/codex-plugin/__tests__/install.test.ts`
**Depends on**: T2
**Reuses**: copy loop (:606-613) — no installer change expected; test-only task unless a gap is found (then stop and update design)
**Requirement**: WFC-08 · **ID**: TASK-008

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Delivery + uninstall assertions observed red via mutation (generated file excluded from fixture → red)
- [ ] Gate passes: `bun run test:plugins`

**Tests**: unit (install)
**Gate**: full
**Commit**: `test(codex-plugin): generated workflow-command delivery + uninstall coverage`

---

### T9: Cursor install test + exclusion-list audit

**What**: Extend cursor install tests for generated stem-dir delivery/uninstall; audit the copy-loop exclusion list (`massa-ai|persona-router|agents`, `profile` absent — pre-existing) and either fix inline (≤3 lines) or record as validation.md finding.
**Where**: `apps/cursor-plugin/__tests__/install.test.ts` (possible 1-line `apps/cursor-plugin/install.sh` exclusion fix)
**Depends on**: T2
**Reuses**: copy loop (:461-476)
**Requirement**: WFC-08 · **ID**: TASK-009

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Delivery + uninstall assertions observed red via mutation
- [ ] Exclusion-list disposition recorded (fixed or finding)
- [ ] Gate passes: `bun run test:plugins`

**Tests**: unit (install)
**Gate**: full
**Commit**: `test(cursor-plugin): generated workflow-command delivery coverage`

---

### T10: OpenCode command delivery

**What**: New installer section: copy `command/massa-ai-*.md` to `~/.config/opencode/command/`, uninstall removes exactly `massa-ai-*.md` there; host-absent → recorded skip; install tests for delivery/uninstall/skip. Dirname RESOLVED pre-Execute (critic F1): OpenCode 1.18.14 binary discovery glob is `{command,commands}/**/*.md` — both names read; `command/` chosen (docs-canonical). Evidence goes in validation.md.
**Where**: `apps/opencode-plugin/install.sh` (tests in `apps/opencode-plugin/__tests__/`)
**Depends on**: T2
**Reuses**: agents install section idiom (:545-586); host-absent skip idiom
**Requirement**: WFC-08, WFC-12 · **ID**: TASK-010

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Probe evidence (binary glob `{command,commands}/**/*.md`, 2026-08-05, v1.18.14) recorded in validation.md; delivery/uninstall/skip tests red-first via fixtures
- [ ] Quick-file concept N/A here (no hand-authored commands on this host) — asserted no other files touched
- [ ] Gate passes: `bun run test:plugins`

**Tests**: unit (install)
**Gate**: full
**Commit**: `feat(opencode-plugin): deliver generated workflow commands`

---

### T11: Packaging inventory

**What**: Ensure `command/` ships in the opencode package `files` and generated command surfaces are covered by `verify-package-contents.ts` expectations for all four plugins (claude `commands/`, codex/cursor `skills/` are already-published roots — assert generated members appear in a pack inventory when bundles are present).
**Where**: `scripts/verify-package-contents.ts` (+ `apps/opencode-plugin/package.json` `files` entry)
**Depends on**: T10
**Reuses**: existing per-package content expectations
**Requirement**: WFC-09 · **ID**: TASK-011

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Verifier red when `command/` removed from opencode `files` (observed), green after
- [ ] Gate passes: `bun run test:scripts`

**Tests**: unit
**Gate**: full
**Commit**: `chore(packaging): ship generated workflow-command surfaces`

---

### T12: Docs + CHANGELOG

**What**: Document the command surface once per docs layering: `README.md` (install/quick-start mention), `FEATURES.md` (reference section: naming per host, marketplace `/massa-ai:<stem>` vs file-route `/massa-ai-<stem>`), plugin READMEs (one line each), CHANGELOG `[Unreleased]` entry (merge gate).
**Where**: `FEATURES.md` (primary; others touched per layering)
**Depends on**: T2
**Reuses**: docs layering rules (CLAUDE.md)
**Requirement**: WFC-14 · **ID**: TASK-012

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] One canonical location; others link; no per-workflow restating
- [ ] CHANGELOG entry present under `[Unreleased]`
- [ ] Gate passes: `bun run lint` (build gate; docs layer = none)

**Tests**: none
**Gate**: build
**Commit**: `docs: workflow command surface reference + changelog`

---

### T13: Spec state finalization

**What**: Append AD-018 to `.specs/project/STATE.md` Decisions (canonical table), write Current section, rotate `.specs/HANDOFF.md` (rename-to-Previous first — rotation lesson), update `.specs/project/FEATURES.json`; run `check_specs_delivered.ts` before Propose.
**Where**: `.specs/project/STATE.md` (+ HANDOFF.md, FEATURES.json)
**Depends on**: T12
**Reuses**: `bun skills/massa-ai/scripts/check_specs_delivered.ts workflow-commands --root .`
**Requirement**: WFC (all — state record) · **ID**: TASK-013

**Tools**:

- MCP: massa-ai `remember` (durable decision record)
- Skill: NONE

**Done when**:

- [ ] `check_specs_delivered.ts` exit 0
- [ ] HANDOFF section count grew (rotation, not replacement)
- [ ] Gate passes: build gate (full command set green)

**Tests**: none
**Gate**: build
**Commit**: `docs(specs): workflow-commands state, handoff, decisions`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T5 ──→ T6 ──→ T4
Phase 3:  T7 ──→ T8 ──→ T9 ──→ T10 ──→ T11
Phase 4:  T12 ──→ T13
```

Batch packing (~7 tasks/worker, whole phases): Batch 1 = Phase 1 + Phase 2
(6 tasks), Batch 2 = Phase 3 + Phase 4 (7 tasks). Sub-agent offer fires
(13 > 3).

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 new lib module + its test | ✅ Granular |
| T2 | 1 generator file (+1-line capability entry) | ✅ Granular (cohesive) |
| T3 | 1 function family in generator | ✅ Granular |
| T4 | 1 contract test (+.gitignore block) | ✅ Granular (cohesive) |
| T5 | 1 test file | ✅ Granular |
| T6 | 1 test file | ✅ Granular |
| T7 | 1 installer + its test | ✅ Granular |
| T8 | 1 test file | ✅ Granular |
| T9 | 1 test file (+possible 1-line fix) | ✅ Granular |
| T10 | 1 installer section + tests | ✅ Granular (cohesive) |
| T11 | 1 verifier (+1 `files` entry) | ✅ Granular |
| T12 | docs set, one canonical location | ✅ Granular |
| T13 | .specs state files | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | phase start | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T2 | T2→T3 | ✅ Match |
| T5 | T2 | Phase 2 after Phase 1 | ✅ Match |
| T6 | T2 | T5→T6 (chain carries T2) | ✅ Match |
| T4 | T2 | T6→T4 (chain carries T2; after locks per F2) | ✅ Match |
| T7 | T2 | Phase 3 after Phase 1 | ✅ Match |
| T8 | T2 | T7→T8 (chain carries T2) | ✅ Match |
| T9 | T2 | T8→T9 (chain carries T2) | ✅ Match |
| T10 | T2 | T9→T10 (chain carries T2) | ✅ Match |
| T11 | T10 | T10→T11 | ✅ Match |
| T12 | T2 | Phase 4 after Phase 3 | ✅ Match |
| T13 | T12 | T12→T13 | ✅ Match |

No forward dependencies; all arrows point backward or within phase.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Generator logic | unit | unit | ✅ OK |
| T2 | Generator logic | unit | unit | ✅ OK |
| T3 | Generator logic | unit | unit | ✅ OK |
| T4 | Cross-host contract | unit (contract) | unit (contract) | ✅ OK |
| T5 | Manifest lock | unit | unit | ✅ OK |
| T6 | Manifest lock | unit | unit | ✅ OK |
| T7 | Installer | unit (install) | unit (install) | ✅ OK |
| T8 | Installer coverage | unit (install) | unit (install) | ✅ OK |
| T9 | Installer coverage | unit (install) | unit (install) | ✅ OK |
| T10 | Installer | unit (install) | unit (install) | ✅ OK |
| T11 | Packaging inventory | unit | unit | ✅ OK |
| T12 | Docs | none (build gate) | none | ✅ OK |
| T13 | .specs state | none (build gate) | none | ✅ OK |

No violations. Tests co-located in the task that creates each layer.
