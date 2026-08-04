# Python → TypeScript Scripts Migration + Lessons Single-Store — Tasks

- **Feature:** `python-to-typescript-scripts`. Spec: `spec.md`. Design: `design.md`.
- 12 tasks, 4 phases. One atomic commit per task; task status closed in this file **before** each commit, same commit (SYNC-04).

## Execution Plan

### Phase Execution Map

```
Phase 1: T1 ──→ T2
Phase 2: T3
Phase 3: T4 ──→ T5 ──→ T6 ──→ T7 ──→ T8 ──→ T9
Phase 4: T10 ──→ T11 ──→ T12
```

Phase 2 depends on Phase 1 (the harness characterizes the post-LSN-01 lessons.py, never the render path). Phase 3 depends on Phase 2 (every port runs the dual-run gate). Phase 4 depends on Phase 3 (the global sweep needs all skill ports landed).

## Test Coverage Matrix

| Task | Requirement | Test |
|---|---|---|
| T1 | LSN-01 AC1, AC3 | validate-repository existence test flipped to json-AND-NOT-md; `lessons.py list` still renders the status-grouped view |
| T2 | LSN-01 AC2 | repoint sweep: 0 live `LESSONS.md` refs outside exemptions, population printed |
| T3 | PTS-06 AC1 | harness self-test: seeded divergence reports non-zero; identity reports 0 |
| T4 | PTS-01 AC1-2 (check_commit) | suite green with spawns flipped to `bun`; dual-run diff empty; scratch-repo commit-msg hook smoke |
| T5 | PTS-01 AC1-2 (check_specs_delivered) | suite green; dual-run diff empty |
| T6 | PTS-01 AC1-2 (validate_state) | suite green; dual-run diff empty |
| T7 | PTS-01 AC1-2 (validate_spec) | suite green; dual-run diff empty |
| T8 | PTS-01 AC1-2 (validate_tasks) | suite green; dual-run diff empty |
| T9 | PTS-02 AC1-2 | key parity over all live lessons + selftest fixtures; `selftest` exit 0; write-parity byte-diff empty |
| T10 | PTS-03 AC1 | `bun run update-fixture-hashes` parity on identical tree; bench header documents invocation |
| T11 | PTS-04 AC1 + LSN-01 AC2 | global zero-sweeps with populations printed; dual-run harness removed |
| T12 | PTS-04 AC2 closure + delivery gate | CHANGELOG entry present; `check_specs_delivered.ts` exit 0; full `test:scripts` + `lint` exit 0 |

## Gate Check Commands

- Suite: `bun test scripts/__tests__/spec-driven-validators.test.ts` (single file, safe)
- Dual-run: `bun scripts/pyts-dual-run.ts --script <name>` (T4-T10; removed by T11)
- Regen: `bun run scripts/generate-skill-artifacts.ts --check` after any `skills/` change
- Sweeps: raw `/usr/bin/grep -rn` with populations printed beside verdicts (never rtk)
- Full: `bun run test:scripts`; `bun run lint`; validators + delivery gate dogfooded via their `.ts` selves post-port

## Task Breakdown

### Phase 1: Lessons single-store (LSN-01)

### T1: Remove the render path and the rendered file
**Where**: `skills/massa-ai/scripts/lessons.py`, `.specs/LESSONS.md` (deleted), `scripts/__tests__/validate-repository.test.ts` + regenerated bundles
**What**: Delete `RENDER_REL`/`_render_path()`/`_render()` and `_save`'s render call; update `cmd_init`'s dual-path message and the header docstring; delete `.specs/LESSONS.md`; flip validate-repository's existence test to assert `lessons.json` exists AND `LESSONS.md` absent (single-store invariant becomes the sensor); regenerate skill bundles (D1).
**Depends on**: none
**Tests**: flipped existence test green; `python3 -B skills/massa-ai/scripts/lessons.py list` renders the status view; selftest still exit 0
**Gate**: `bun test scripts/__tests__/validate-repository.test.ts` + `generate-skill-artifacts.ts --check` both exit 0
**Status**: [x]

### T2: Repoint every live LESSONS.md reference
**Where**: `AGENTS.md`, `CLAUDE.md`, `docs/massa-ai-spec-driven.md`, `skills/massa-ai/references/lessons.md`, `skills/massa-ai/references/project-context.md`, `skills/massa-ai/references/spec-driven/artifact-store.md`, `skills/massa-ai/references/spec-driven/specify.md`, `skills/massa-ai/workflows/spec-driven.md` + regenerated bundles
**What**: Rewrite the 9 prose files (12 lines, population in spec LSN-01) from "LESSONS.md is the rendered view" to "lessons.json is the single store; `lessons list` is the on-demand view"; sweep proves 0 live refs outside sealed `.specs` history and this feature's artifacts, population printed.
**Depends on**: T1
**Tests**: content sweep prints 0 + `skill-artifact-parity` green
**Gate**: sweep 0 + `--check` exit 0
**Status**: [x]

### Phase 2: Migration harness

### T3: Dual-run characterization harness
**Where**: `scripts/pyts-dual-run.ts` (new)
**What**: Executes a script's `.py` and `.ts` twins against the same fixture invocations (validator fixtures from the suite's corpus + live-`.specs` dogfood targets + lessons key/write fixtures), diffs exit code + full stdout, non-zero on any divergence (PTS-06, D3). Self-test seeds a divergence and must report non-zero (a new sensor needs an observed red).
**Depends on**: T1
**Tests**: `--selftest` red-on-divergence and green-on-identity
**Gate**: `bun scripts/pyts-dual-run.ts --selftest` exit 0
**Status**: [x]

### Phase 3: Script ports (one script, one commit, one live entry point)

### T4: Port check_commit
**Where**: `skills/massa-ai/scripts/check_commit.ts` (new), `check_commit.py` (deleted), its prose sites incl. `references/spec-driven/execute.md:311` hook recipe, suite spawns + regenerated bundles
**What**: Port (128 lines) with shebang + exec bit (git commit-msg hook usage, D2); flip this script's suite spawns to `bun`; dual-run before deletion; rewire its prose sites (the execute.md:311 recipe now symlinks the `.ts`); check this checkout's and its worktrees' `.git/hooks/commit-msg` for a symlink targeting the deleted `.py` and repoint it (Plan Challenge F2 — external installs get T12's CHANGELOG note instead; sweeps cannot reach them); regenerate (D7).
**Depends on**: T3
**Tests**: suite green; dual-run empty; scratch-repo hook smoke (R4)
**Gate**: suite + dual-run + `--check` all exit 0
**Status**: [x]

### T5: Port check_specs_delivered
**Where**: `skills/massa-ai/scripts/check_specs_delivered.ts` (new), `.py` (deleted), its prose sites (incl. `references/implementation-delivery.md:26`), suite spawns + regenerated bundles
**What**: Port (137 lines; `Bun.spawnSync` git calls, D2); suite rewire; dual-run incl. live dogfood against this feature; prose rewire; regenerate.
**Depends on**: T4
**Tests**: suite green; dual-run empty
**Gate**: suite + dual-run + `--check` all exit 0
**Status**: [x]

### T6: Port validate_state
**Where**: `skills/massa-ai/scripts/validate_state.ts` (new), `.py` (deleted), its prose sites, suite spawns + regenerated bundles
**What**: Port (183 lines) preserving the Summary-scoped `_verdict` semantics (FT2 behavior); suite rewire; dual-run; prose rewire; regenerate.
**Depends on**: T5
**Tests**: suite green (incl. diverging-verdict regression fixture); dual-run empty
**Gate**: suite + dual-run + `--check` all exit 0
**Status**: [x]

### T7: Port validate_spec
**Where**: `skills/massa-ai/scripts/validate_spec.ts` (new), `.py` (deleted), its prose sites, suite spawns + regenerated bundles
**What**: Port (272 lines) incl. EARS/SHALL scan and the `seen_item` blank-line fix; suite rewire; dual-run incl. this feature's own spec as live fixture; prose rewire; regenerate.
**Depends on**: T6
**Tests**: suite green (incl. C5 template-conformance); dual-run empty
**Gate**: suite + dual-run + `--check` all exit 0
**Status**: [x]

### T8: Port validate_tasks
**Where**: `skills/massa-ai/scripts/validate_tasks.ts` (new), `.py` (deleted), its prose sites, suite spawns + regenerated bundles
**What**: Port (302 lines) incl. letter-prefixed task ids (FT4) and phase-membership/diagram-order checks; suite rewire; dual-run incl. this file as live fixture; prose rewire; regenerate.
**Depends on**: T7
**Tests**: suite green; dual-run empty
**Gate**: suite + dual-run + `--check` all exit 0
**Status**: [x]

### T9: Port lessons
**Where**: `skills/massa-ai/scripts/lessons.ts` (new), `lessons.py` (deleted), its prose sites, suite spawns + regenerated bundles
**What**: Port the post-LSN-01 script (~568 lines: subcommands, confidence, observations, best-effort memory write) with D4 key parity (NFD + `\p{Mn}` strip) and byte-stable JSON writes; suite rewire; dual-run over all live lesson keys + selftest fixtures + write-parity diff; prose rewire; regenerate.
**Depends on**: T8
**Tests**: dual-run key/write parity empty incl. a 0.625-class confidence-boundary op (Plan Challenge F1); `bun skills/massa-ai/scripts/lessons.ts selftest` exit 0; suite green
**Gate**: suite + dual-run + `--check` all exit 0
**Status**: [x]

### Phase 4: Repo scripts, global sweep, close-out

### T10: Port repo dev scripts
**Where**: `scripts/update-fixture-hashes.ts` (new) + `scripts/update-fixture-hashes.py` (deleted), `scripts/synapse-bench-analyze-v2.ts` (new) + `.py` (deleted), `package.json`
**What**: Port both (D8); rewire `package.json:42` to `bun scripts/update-fixture-hashes.ts`; document the bench script's manual invocation in its header; dual-run parity for update-fixture-hashes on an identical tree.
**Depends on**: T9
**Tests**: `bun run update-fixture-hashes` parity; dual-run empty
**Gate**: dual-run + `bun run lint` exit 0
**Status**: [x]

### T11: Golden fixtures, global zero-sweeps, harness removal
**Where**: `scripts/__tests__/pyts-golden.test.ts` + `scripts/__tests__/fixtures/pyts-golden/` (new), any sweep-surfaced straggler prose, `scripts/pyts-dual-run.ts` (deleted)
**What**: Materialize the dual-run corpus's passing fixture invocations + captured stdout/exit pairs as permanent golden tests (Plan Challenge F3) — then re-run the D5 sweeps fresh: zero `python3` invocations and zero live 8-script `.py` basenames under `skills/` + `apps/*/skills/`; zero live `LESSONS.md` refs outside exemptions (PTS-04 AC1, LSN-01 AC2 — populations printed beside verdicts); fix any straggler found; delete the dual-run harness (its oracle role now lives in the golden suite).
**Depends on**: T10
**Tests**: golden suite green replaying all captured pairs; all three sweeps print 0; `test:scripts` green without the harness
**Gate**: sweeps 0 + suite exit 0
**Status**: [x]

### T12: CHANGELOG, close-out, delivery gate
**Where**: `CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`, `.specs/project/FEATURES.json`
**What**: CHANGELOG `[Unreleased]` entry (minor on merge) incl. the commit-msg-hook repoint note for operators with the old `.py` symlink installed (Plan Challenge F2); FEATURES.json `python-to-typescript-scripts` → validated state per registry convention; STATE/HANDOFF close-out with commit range + gate evidence; dogfood the four ported validators + `check_specs_delivered.ts` against this feature (exit 0); close-out lands before first push (tlc-330 C2 rule).
**Depends on**: T11
**Tests**: validators + delivery gate all exit 0; full `bun run test:scripts` + `bun run lint` exit 0
**Gate**: delivery gate 0 + full gates 0
**Status**: [ ]
