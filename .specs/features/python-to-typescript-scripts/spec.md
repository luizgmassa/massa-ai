# Python → TypeScript Scripts Migration Specification

- **Slug:** `python-to-typescript-scripts`
- **Status:** active (Execute authorized 2026-08-04; Design + Tasks in `design.md`/`tasks.md`)
- **Workflow:** spec-driven (Large — CLI-contract migration across 8 scripts + full wiring ripple; Design and Tasks required)
- **Authored:** 2026-08-04 inside `tlc-330-harness-update` T21 (PYTS-01), at `4efa7013`
- **User direction:** "change all python scripts into typescript scripts (including old ones before this work e.g. lessons.py)"
- **Amendment (user, 2026-08-04):** "implement the removal of duplicated lessons flow (there're two lessons files -- lessons.json and lessons.md -- that duplicate information, there should be only one doing that)" — Group LSN below. `lessons.json` is the surviving store (user decision, this session, over a markdown-canonical alternative); combined into this feature (user decision over two sequential features).

## Problem Statement

The harness now runs 6 Python scripts under `skills/massa-ai/scripts/` (`lessons`, `validate_spec`, `validate_tasks`, `validate_state`, `check_commit`, `check_specs_delivered`) plus 2 repo dev scripts (`scripts/update-fixture-hashes.py`, wired at `package.json:42`; `scripts/synapse-bench-analyze-v2.py`, manual-only). The repo's runtime is Bun; Python is a second toolchain the harness must assume present on every host machine. Measured invocation surface (2026-08-04, `11747f27`, `/usr/bin/grep -rn 'python3' skills/ --include='*.md'` and companions): **41 `python3` lines across 25 skill source files** (36 lines / 23 files naming the 8 target scripts), **16 further `.py` references without a `python3` literal on the line** — including the `ln -sf … check_commit.py .git/hooks/commit-msg` hook recipe at `references/spec-driven/execute.md:311` that a `python3`-keyed sweep cannot see — plus 3 spawns in `scripts/__tests__/spec-driven-validators.test.ts` and `package.json:42`. An earlier draft of this spec claimed 24 sites/12 files from a narrower sweep; iteration-3 validation caught the undercount — Design re-runs the sweep commands above and treats their printed population, not this paragraph, as the work list. Migrating to TypeScript under Bun removes the second-toolchain assumption, brings the scripts under `bun run lint`/type-checking, and unifies test tooling.

## Out of Scope

- `packages/core/src/__tests__/e2e/fixtures/polyglot/indent-method.py` — parser test fixture, not a script; must remain Python.
- Rewriting git history or sealed `.specs` feature artifacts that mention `python3` as historical record.
- Installed-host refresh mechanics (`bun run install:skills` after merge covers it; no separate migration path).
- Any behavior change to the validators or lessons beyond language — **except LSN-01** (user amendment 2026-08-04): the lessons single-store change is in scope, lands *before* the lessons port, and the parity contract then binds to the post-LSN-01 behavior. Everywhere else the contract stands: byte-level output parity where tests assert output, exit-code parity everywhere.

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Bun is present on every machine running the skills | Invoke as `bun skills/massa-ai/scripts/<name>.ts` | Bun is the project runtime; hosts already execute the Bun hook binary; removes the python3 presence assumption entirely | Design re-verifies per host |
| Unicode dedup-key parity is achievable in JS | `String.prototype.normalize("NFD")` + combining-mark strip mirrors Python `unicodedata` | Same Unicode algorithms; divergence risk is why PTS-06 mandates dual-run characterization on the existing diacritic/Japanese fixtures | Execute proves via fixtures |
| Existing `.specs/lessons.json` data migrates untouched | `lessons.ts` reads/writes the current schema unchanged | Data files are user state; a language port must not invalidate dedup keys or history | Yes (contract) |
| Per-script atomic migration order | One script per task: port → dual-run diff → rewire → delete `.py` | Keeps every commit shippable; a half-migrated pair never ships both entry points silently | Yes (contract) |

Open questions: none — the migration is user-directed; remaining unknowns are Design-phase measurements, recorded above as assumptions with owners.

## User Stories

- As the repo owner, I want one toolchain (Bun/TS) for every script so lint, type-check, and tests cover the gate scripts too.
- As a skill user on a fresh machine, I want the harness to work without a `python3` present.
- As a future maintainer, I want the validators' logic under the same type system as the tests that exercise them.

## Requirements

**PTS-01 — Skill validator + gate scripts.** Port `validate_spec`, `validate_tasks`, `validate_state`, `check_commit`, `check_specs_delivered` to TypeScript at `skills/massa-ai/scripts/*.ts`, Bun builtins only (no new dependencies), preserving CLI surface exactly: argument names (`--root`, `--message`, positional feature), exit semantics 0/1/2, and output lines that any test or prose contract asserts.

**Acceptance Criteria**:
1. WHEN any ported script runs against the existing test fixtures, THEN it SHALL produce the same exit code and the same asserted output lines as the Python original. <!-- event-driven -->
2. IF an argument or fixture shape the Python version accepted is rejected, THEN the port SHALL be treated as a regression, not a cleanup. <!-- unwanted-behavior -->

**PTS-02 — lessons migration with data parity.** Port `lessons.py` (add/penalize/list/observe/export/import/prune/status/selftest, confidence scoring, context tags) to `lessons.ts`; existing `.specs/lessons.json` remains valid without any data migration. *(Amended 2026-08-04: the original clause "and LESSONS.md rendering remain valid" is superseded by LSN-01 — the render path is removed before the port, so `lessons.ts` never carries it; the losing clause is amended here with its reason rather than left contradicting the amendment.)*

**Acceptance Criteria**:
1. WHEN `lessons.ts` computes a dedup key for text whose Python key exists in `.specs/lessons.json`, THEN the keys SHALL be identical — proven by dual-run characterization over every existing lesson entry plus the diacritic and Japanese selftest fixtures. <!-- event-driven -->
2. The `selftest` subcommand SHALL exist and exit 0. <!-- ubiquitous -->

**PTS-03 — Repo dev scripts.** Port `scripts/update-fixture-hashes.py` (rewire `package.json:42`) and `scripts/synapse-bench-analyze-v2.py` (manual tool; document invocation in its header).

**Acceptance Criteria**:
1. WHEN `bun run update-fixture-hashes` runs, THEN it SHALL produce the same fixture-hash updates as the Python version on an identical tree. <!-- event-driven -->

**PTS-04 — Wiring ripple, sweep-verified.** Rewire every invocation site. The work list is derived at Design time by re-running the measured sweeps from the Problem Statement (41 `python3` lines / 25 skill source files at authoring; 16 non-literal `.py` reference lines including the commit-msg hook recipe; 3 test spawns; `package.json:42`) — never from a remembered count. Regenerate all four host bundles.

**Acceptance Criteria**:
1. WHEN the repo is swept after migration, THEN zero live `python3` invocations AND zero live references to the 8 scripts' `.py` basenames SHALL remain under `skills/` and `apps/*/skills/` (both sweep commands and their populations printed beside the verdict; sealed `.specs` history exempt). <!-- event-driven -->
2. WHEN Design derives the rewire work list, THEN it SHALL re-run the sweeps and record the fresh populations, superseding the figures quoted in this spec. <!-- event-driven -->

**PTS-05 — Deletion discipline.** Each script's `.py` is deleted only in the same commit that lands its `.ts`, its rewired call sites, and its passing dual-run characterization; no commit ships both entry points live or neither.

**Acceptance Criteria**:
1. WHILE the migration is in progress, every commit SHALL leave each script with exactly one live entry point, all call sites pointing at it. <!-- state-driven -->

**PTS-06 — Characterization gate.** Before each deletion, a dual-run harness executes Python and TypeScript versions against the same fixture set and diffs exit codes + asserted output; divergence blocks the task.

**Acceptance Criteria**:
1. WHEN the dual-run harness reports any divergence, THEN the task SHALL stop as a gate failure rather than adjust the fixture. <!-- unwanted-behavior -->

**LSN-01 — Lessons single-store (user amendment 2026-08-04).** `.specs/lessons.json` becomes the only lessons artifact. Remove the render path from `lessons.py` (`RENDER_REL` :42, `_render_path()` :76-77, `_save`'s render call :106, `_render()` :257-318, `cmd_init`'s dual-path message :326, header docstring :12), delete `.specs/LESSONS.md`, and repoint every live reference — population re-derived at `e932a673`: 14 `LESSONS.md` lines in sources outside bundles and sealed specs, 12 outside `lessons.py` itself (`AGENTS.md:53`, `CLAUDE.md:606`, `docs/massa-ai-spec-driven.md:27`, `scripts/__tests__/validate-repository.test.ts:655-663`, `references/lessons.md:8,72`, `references/project-context.md:26`, `references/spec-driven/artifact-store.md:31`, `references/spec-driven/specify.md:12`, `workflows/spec-driven.md:131`) — then regenerate all four host bundles. The on-demand human view is `lessons list` (`cmd_list`, kept). Sealed `.specs` feature history is exempt.

**Acceptance Criteria**:
1. WHEN any lessons command writes state, THEN it SHALL write only `.specs/lessons.json`, and no `.specs/LESSONS.md` SHALL exist in the tree. <!-- event-driven -->
2. WHEN the repo is swept after the change, THEN zero live `LESSONS.md` references SHALL remain outside sealed `.specs` history and this feature's own artifacts, with the sweep command and its population printed beside the verdict. <!-- event-driven -->
3. WHEN `lessons list` runs, THEN it SHALL present the status-grouped lessons from `lessons.json` as the on-demand replacement for the deleted rendered file. <!-- event-driven -->

## Requirement Traceability

| ID | Files touched |
|---|---|
| PTS-01 | `skills/massa-ai/scripts/{validate_spec,validate_tasks,validate_state,check_commit,check_specs_delivered}.{py→ts}` |
| PTS-02 | `skills/massa-ai/scripts/lessons.{py→ts}`, `.specs/lessons.json` (read-only contract) |
| PTS-03 | `scripts/update-fixture-hashes.{py→ts}`, `scripts/synapse-bench-analyze-v2.{py→ts}`, `package.json` |
| PTS-04 | sweep-derived: 25 skill source files (41 `python3` lines) + 16 non-literal `.py` reference lines at authoring — Design re-derives per AC2; `scripts/__tests__/spec-driven-validators.test.ts`, `package.json`, regenerated `apps/*-plugin/skills/**` |
| PTS-05 | per-task commit discipline (process requirement) |
| PTS-06 | new dual-run characterization harness (location decided in Design) |
| LSN-01 | `skills/massa-ai/scripts/lessons.py` (render path removed), `.specs/LESSONS.md` (deleted), `scripts/__tests__/validate-repository.test.ts`, 9 prose files repointed (population above), regenerated `apps/*-plugin/skills/**` |

## Edge Cases

- Python/JS regex dialect differences (e.g. `re.IGNORECASE` vs `/i`, `\b` behavior on Unicode) — characterization fixtures must include the boundary cases the validators' regexes rely on.
- `unicodedata` category `Mn` stripping vs JS: no direct `\p{Mn}` before ES2018 — Bun supports `\p{Mn}`; assert on the exact selftest fixtures.
- `check_commit` as a git `commit-msg` hook: hook invocation must not depend on repo-root cwd.
- Generated bundle copies: 24 `.py` files under `apps/*/skills/` disappear and 24 `.ts` files appear in the same regeneration; `--check` must be clean in the deletion commit itself.
- `lessons.json` writes must stay byte-stable across the port: the TS serializer must reproduce Python's `json.dump(indent=2, ensure_ascii=False)` + trailing-newline shape, or user state reformats on first write.
- LSN-01 AC2's sweep will match its own quotations: this feature's spec/design/tasks/validation quote `LESSONS.md` as text — the sweep exempts this feature's artifacts explicitly (a claim of absence can be the match).
