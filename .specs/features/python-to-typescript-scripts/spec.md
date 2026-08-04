# Python → TypeScript Scripts Migration Specification

- **Slug:** `python-to-typescript-scripts`
- **Status:** planned (Specify complete; Design + Tasks + Execute are future work)
- **Workflow:** spec-driven (Large — CLI-contract migration across 8 scripts + full wiring ripple; Design and Tasks required)
- **Authored:** 2026-08-04 inside `tlc-330-harness-update` T21 (PYTS-01), at `4efa7013`
- **User direction:** "change all python scripts into typescript scripts (including old ones before this work e.g. lessons.py)"

## Problem Statement

The harness now runs 6 Python scripts under `skills/massa-ai/scripts/` (`lessons`, `validate_spec`, `validate_tasks`, `validate_state`, `check_commit`, `check_specs_delivered`) plus 2 repo dev scripts (`scripts/update-fixture-hashes.py`, wired at `package.json:42`; `scripts/synapse-bench-analyze-v2.py`, manual-only). The repo's runtime is Bun; Python is a second toolchain the harness must assume present on every host machine (`python3` invoked at 24 prose sites across 12 skill files, in `scripts/__tests__/spec-driven-validators.test.ts`, and in one package.json script). Migrating to TypeScript under Bun removes the second-toolchain assumption, brings the scripts under `bun run lint`/type-checking, and unifies test tooling.

## Out of Scope

- `packages/core/src/__tests__/e2e/fixtures/polyglot/indent-method.py` — parser test fixture, not a script; must remain Python.
- Rewriting git history or sealed `.specs` feature artifacts that mention `python3` as historical record.
- Installed-host refresh mechanics (`bun run install:skills` after merge covers it; no separate migration path).
- Any behavior change to the validators or lessons beyond language: contract is byte-level output parity where tests assert output, exit-code parity everywhere.

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

**PTS-02 — lessons migration with data parity.** Port `lessons.py` (22.4K: add/penalize/list/observe/export/import/prune/status/selftest, confidence scoring, dual-write, context tags) to `lessons.ts`; existing `.specs/lessons.json` and `LESSONS.md` rendering remain valid without any data migration.

**Acceptance Criteria**:
1. WHEN `lessons.ts` computes a dedup key for text whose Python key exists in `.specs/lessons.json`, THEN the keys SHALL be identical — proven by dual-run characterization over every existing lesson entry plus the diacritic and Japanese selftest fixtures. <!-- event-driven -->
2. The `selftest` subcommand SHALL exist and exit 0. <!-- ubiquitous -->

**PTS-03 — Repo dev scripts.** Port `scripts/update-fixture-hashes.py` (rewire `package.json:42`) and `scripts/synapse-bench-analyze-v2.py` (manual tool; document invocation in its header).

**Acceptance Criteria**:
1. WHEN `bun run update-fixture-hashes` runs, THEN it SHALL produce the same fixture-hash updates as the Python version on an identical tree. <!-- event-driven -->

**PTS-04 — Wiring ripple, sweep-verified.** Rewire every invocation site: the 24 `python3` prose sites across 12 skill files, `scripts/__tests__/spec-driven-validators.test.ts` spawns, the commit-msg-hook prose, and `package.json`. Regenerate all four host bundles.

**Acceptance Criteria**:
1. WHEN the repo is swept after migration, THEN zero live `python3` invocations SHALL remain under `skills/` and `apps/*/skills/` (population printed beside the verdict; sealed `.specs` history exempt). <!-- event-driven -->

**PTS-05 — Deletion discipline.** Each script's `.py` is deleted only in the same commit that lands its `.ts`, its rewired call sites, and its passing dual-run characterization; no commit ships both entry points live or neither.

**Acceptance Criteria**:
1. WHILE the migration is in progress, every commit SHALL leave each script with exactly one live entry point, all call sites pointing at it. <!-- state-driven -->

**PTS-06 — Characterization gate.** Before each deletion, a dual-run harness executes Python and TypeScript versions against the same fixture set and diffs exit codes + asserted output; divergence blocks the task.

**Acceptance Criteria**:
1. WHEN the dual-run harness reports any divergence, THEN the task SHALL stop as a gate failure rather than adjust the fixture. <!-- unwanted-behavior -->

## Requirement Traceability

| ID | Files touched |
|---|---|
| PTS-01 | `skills/massa-ai/scripts/{validate_spec,validate_tasks,validate_state,check_commit,check_specs_delivered}.{py→ts}` |
| PTS-02 | `skills/massa-ai/scripts/lessons.{py→ts}`, `.specs/lessons.json` (read-only contract) |
| PTS-03 | `scripts/update-fixture-hashes.{py→ts}`, `scripts/synapse-bench-analyze-v2.{py→ts}`, `package.json` |
| PTS-04 | 12 skill prose files (24 sites), `scripts/__tests__/spec-driven-validators.test.ts`, regenerated `apps/*-plugin/skills/**` |
| PTS-05 | per-task commit discipline (process requirement) |
| PTS-06 | new dual-run characterization harness (location decided in Design) |

## Edge Cases

- Python/JS regex dialect differences (e.g. `re.IGNORECASE` vs `/i`, `\b` behavior on Unicode) — characterization fixtures must include the boundary cases the validators' regexes rely on.
- `unicodedata` category `Mn` stripping vs JS: no direct `\p{Mn}` before ES2018 — Bun supports `\p{Mn}`; assert on the exact selftest fixtures.
- `check_commit` as a git `commit-msg` hook: hook invocation must not depend on repo-root cwd.
- Generated bundle copies: 24 `.py` files under `apps/*/skills/` disappear and 24 `.ts` files appear in the same regeneration; `--check` must be clean in the deletion commit itself.
