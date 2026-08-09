# Admin Portal Correctness Repair — Tasks

`3 Phases = 11 Tasks`. One atomic commit per task, on `fix/admin-portal-correctness-repair`
(single-branch deviation from the per-Phase rule — user decision, recorded in `spec.md`).

## Execution Plan

Dependencies point backwards only. Two hard edges; everything else is independent and is
ordered only to keep commits atomic on shared files.

Execution order (the diagram is the order tasks run in, not the dependency set):

```
T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T9 -> T10 -> T11
```

Dependency edges, and why each exists:

- `T6 → T9` — dedupe the SSE handler after the status fix, so it is written once.
- `T1 → T11` — the CHANGELOG and spec close-out must describe T1's final shape.
- `T2 → T3` — both touch the vector-store/route pair; T3 must preserve T2's loud DB-down path.
- `T3 → T4` — both edit `postgres-vector-store.ts`.
- `T5 → T8` — both edit the config writer; T8 builds on T5's sentinel handling.
- `T10 → T11` — the close-out commits state files T10 has already corrected.

Everything else is independent; its position in the chain is ordering, not dependency.

Shared-file map — the reason for the ordering above:

| File | Tasks |
| --- | --- |
| `packages/core/src/data/vector/postgres-vector-store.ts` | T2 (interface), T3, T4 |
| `apps/tools-api/src/routes/model-registry-stream.ts` | T6, T7, T9 |
| `apps/tools-api/src/routes/model-registry.ts` | T1, T7 |
| `apps/web-ui/src/static/app.js` | T1, T5, T6, T11 |
| `scripts/lib/model-profiles.ts` | T1 |
| `packages/shared/src/config/config-writer.ts` | T5, T8 |

## Task Breakdown

## Phase 1 — Correctness (P0)

### T1: Overlay becomes a deep-merged delta with nested tombstones

Covers APCR-01. Export `mergeOverlay` from `scripts/lib/model-profiles.ts` and make it
deep-merge per profile/host/tier and per key for `hostDefaults`/`workflowTiers`, with `null`
as the nested-deletion tombstone (design D-1). Delete the hand-copied
`mergeOverlayForValidation` twin in the route and call the library's merge through the
existing `profilesLib()` handle. Add read-path normalization in `loadEffectiveRegistry`
(drop overlay entries byte-identical to builtin; drop `null` tombstones the builtin lacks).
Revert `initRegistryOverlay` to seed from `source.overlay` only, fix
`mergeRegistryForDisplay`'s truthiness fallbacks to per-key merges, and make
`handleRegistryWorkflowTierRemove` write `null` instead of deleting the key.

**Depends on**: none
**Where**: `scripts/lib/model-profiles.ts` (+ `apps/tools-api/src/routes/model-registry.ts`, `apps/web-ui/src/static/app.js`)
**Tests**: `scripts/__tests__/model-profiles*.test.ts` — builtin-bump-reaches-overlay-user regression (APCR-01.3), partial `hostDefaults`/`workflowTiers` retention, `null` tombstone deletes, normalization collapses a full-copy overlay and preserves a genuine edit, the AC9 limitation pinned (overlay copied from builtin v1, read against v2 whose value changed, still returns v1 — asserted as known behavior so a future change is visible), the AC10 surviving-entry count, `_delete` unchanged; `apps/tools-api/src/routes/model-registry.test.ts` — route uses the shared merge; `apps/web-ui/src/__tests__/admin-handlers.test.ts` — overlay-only seed, display merge does not blank the flat maps, remove writes `null`
**Gate**: `bun test scripts/__tests__/ -t 'model-profiles'` && `bun test apps/tools-api/src/routes/model-registry.test.ts` && `bun test apps/web-ui/src/__tests__/` && `bun run type-check`

### T2: Project list rethrows every error it cannot diagnose

Covers APCR-02. Narrow the bare `catch` at `apps/tools-api/src/routes/project.ts:127-135` to
the embedding-dimension-mismatch class and rethrow everything else. Declare
`listAllProjectsAcrossDimensions` on the vector-store interface so the `(vectorStore as any)`
cast and the `?.() ?? []` silent-empty default both disappear.

**Depends on**: none
**Where**: `apps/tools-api/src/routes/project.ts`
**Tests**: `apps/tools-api/src/routes/project.test.ts` — a non-dimension error returns `success:false` carrying its message and never calls the fallback; the existing dimension-mismatch fallback case at line 90 still passes unchanged
**Gate**: `bun test apps/tools-api/src/routes/project.test.ts` && `bun run type-check`

### T3: One connection pool per store instance

Covers APCR-03. `getPool()` and `ensureInitialized()` share one pool-construction path so a
`getPool()` call cannot be followed by a second `new Pool` that orphans the first. Preserve
the assign-before-connect ordering that makes a DB-down `listProjects()` throw rather than
return empty (Amendment A3) — or replace it with something that throws for the same reason.
`close()` ends whatever was constructed.

**Depends on**: T2
**Where**: `packages/core/src/data/vector/postgres-vector-store.ts`
**Tests**: `packages/core/src/__tests__/postgres-vector-store-pool.test.ts` (new) — inject a Pool-constructor counter, call `getPool()` then `ensureInitialized()`, assert exactly one construction; assert `tableName`/`schemaDimensions` are still populated by that later `ensureInitialized()` (APCR-03.5 — sharing the pool path must not let `getPool` satisfy the `initialized` gate and skip the dimension setup); assert a throwing `ensureInitialized` does not leak; assert DB-down still throws
**Gate**: `cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='postgres-vector-store'` && `bun run type-check`

### T4: Schema-qualified dimension-table enumeration

Covers APCR-04. Add `schemaname = current_schema()` to the `pg_tables` scan in
`listAllProjectsAcrossDimensions` and emit quoted, schema-qualified identifiers in the
generated `UNION ALL` so enumeration and execution cannot resolve different tables.

**Depends on**: T3
**Where**: `packages/core/src/data/vector/postgres-vector-store.ts`
**Tests**: `packages/core/src/__tests__/postgres-vector-store-pool.test.ts` — captured SQL contains `schemaname` and quoted qualified identifiers; a two-schema fixture is not double-counted
**Gate**: `cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='postgres-vector-store'` && `bun run type-check`

### T5: The mask sentinel can never be persisted

Covers APCR-05. `applyMaskedSentinel` must drop or restore a `"***"` submission regardless of
whether the currently stored value is truthy, for all four sensitive fields. Stop
`handleConfigReveal` from leaving a literal `"***"` in the input on hide.

**Depends on**: none
**Where**: `packages/shared/src/config/config-writer.ts` (+ `apps/web-ui/src/static/app.js`)
**Tests**: `packages/shared/src/__tests__/config-writer*.test.ts` — `"***"` against an empty stored value does not persist `"***"`, for each of the four fields; `"***"` against a populated value still restores it; `apps/web-ui/src/__tests__/admin-handlers.test.ts` — hide does not leave a submittable sentinel
**Gate**: `cd packages/shared && bun test` && `bun test apps/web-ui/src/__tests__/` && `bun run type-check`

### T6: Install status derives from the switch report

Covers APCR-06. `installActiveProfiles` computes the emitted `status` from the report's host
outcomes — `switched` if any host switched, else `failed` if any failed, else `unsupported`
if any is unsupported, else `skipped` — reusing `reportSucceeded` (`report.ts:51-53`) for the
success boundary rather than re-deriving it, and adding `unsupported` as a fourth detail
bucket alongside the existing three (`model-registry-stream.ts:59-61` drops it today). The UI
banner classifies by that status: `app.js:1854-1859` currently renders `success` from
`exitCode === 0` alone, so a run where every install failed shows green with `"Failed: …"`
inside the message — that branch is part of this task, not a follow-up.

**Depends on**: none
**Where**: `apps/tools-api/src/routes/model-registry-stream.ts` (+ `apps/web-ui/src/static/app.js`)
**Tests**: `apps/tools-api/src/routes/model-registry-stream.test.ts` — an all-failed report emits `status:"failed"`; an all-skipped report emits `status:"skipped"`; an all-unsupported report emits `status:"unsupported"` and appears in the detail strings; a mixed report emits `switched` and retains every bucket; `apps/web-ui/src/__tests__/admin-handlers.test.ts` — a failed install event does not land in the success list, and the terminal banner for an exit-0-with-failed-installs stream is **not** `success` (APCR-06.6)
**Gate**: `bun test apps/tools-api/src/routes/model-registry-stream.test.ts` && `bun test apps/web-ui/src/__tests__/` && `bun run type-check`

## Phase 2 — Deployment + security (P1)

### T7: Registry routes resolve their generator or return 501

Covers APCR-07. Replace both fixed `../../../../` anchors and the `profilesLib()` require
path with a bounded upward search for a directory containing
`scripts/generate-subagent-artifacts.ts`, memoized. When the search fails, the three JSON
routes return the shared 501 body and the two SSE routes emit it as the terminal `done`
frame's `error`, instead of `MODULE_NOT_FOUND` or a spawn failure.

**Depends on**: none
**Where**: `apps/tools-api/src/routes/model-registry.ts` (+ `apps/tools-api/src/routes/model-registry-stream.ts`)
**Tests**: `apps/tools-api/src/routes/model-registry.test.ts` and `model-registry-stream.test.ts` — resolver finds the script from the source-tree position and from a simulated `dist` position; an unresolvable root yields 501 with the shared message and throws nothing; the SSE terminal frame carries the same reason
**Gate**: `bun test apps/tools-api/src/routes/model-registry.test.ts` && `bun test apps/tools-api/src/routes/model-registry-stream.test.ts` && `bun run build` && `bun run type-check`

### T8: Secret files are owner-only, backups bounded, exposure documented

Covers APCR-08. Temp file created `0600`; explicit `chmodSync` on `config.json` after rename
(repairs the existing 644). Backups are written through the **same** temp-file-plus-rename
path — not `copyFileSync` + `chmodSync`, which leaves the new backup at the source's mode
until the chmod lands and cannot revoke a descriptor a watcher already opened (APCR-08.2).
Retention keeps the 10 newest `config.json.bak.<ISO>` files; the legacy untimestamped
`config.json.bak` is **chmod'd to 0600 on every save and never deleted** (matches
`design.md` D-3; it is not exempt from the mode repair). Update `docs/web-ui-access.md` for
the `/config/reveal` escalation, the no-purge-on-rotation behavior, and the fact that
`/config/reveal` carries no protection beyond the accepted `/ui` chain. Per Amendment A5 the
startup warning already exists and is already covered — add only the missing assertion that
`index.ts:161` is reached.

**Depends on**: T5
**Where**: `packages/shared/src/config/config-loader.ts` (+ `packages/shared/src/config/config-writer.ts`, `docs/web-ui-access.md`)
**Tests**: `packages/shared/src/__tests__/config-writer*.test.ts` under a scratch `XDG_CONFIG_HOME` — `stat` asserts `0600` on config, temp file and every backup; an existing 644 config is tightened on the next save; a planted 644 legacy `config.json.bak` is tightened and survives; the 11th save leaves 10 timestamped backups; a tools-api test asserts `index.ts` reaches `warnIfTrustOverrideEnabled()`
**Gate**: `cd packages/shared && bun test` && `cd apps/tools-api && bun scripts/run-tests-isolated.ts` && `bun run type-check`

## Phase 3 — Hygiene + state truth (P2)

### T9: One SSE handler behind two routes

Covers APCR-09. Extract the byte-equivalent bodies of `/regenerate-and-install-stream` and
`/regenerate-stream` into one factory called twice, differing only in `detail` metadata.
Behavior-preserving; the deprecated alias stays registered.

**Depends on**: T6
**Where**: `apps/tools-api/src/routes/model-registry-stream.ts`
**Tests**: `apps/tools-api/src/routes/model-registry-stream.test.ts` — the existing suite passes unchanged; both routes produce identical frame sequences for the same fixture
**Gate**: `bun test apps/tools-api/src/routes/model-registry-stream.test.ts` && `npx oxlint --quiet` && `bun run type-check`

### T10: State files describe the repository

Covers APCR-10. Rotate `.specs/HANDOFF.md` (rename the Active block to Previous, then
prepend; assert the `##` section count grew). Set `admin-portal-enhancements` to `complete`
in `FEATURES.json` and correct its notes. Correct `STATE.md`'s "tools-api 25 fails
pre-existing on base" to the measured 0 fails / 29 groups. Change
`validate_state.ts:270` to print the failing feature set, with no empty bracket at zero
errors, then `bun run generate:artifacts` for the 4 plugin copies.

**Depends on**: none
**Where**: `skills/massa-ai/scripts/validate_state.ts` (+ `.specs/HANDOFF.md`, `.specs/project/FEATURES.json`, `.specs/project/STATE.md`)
**Tests**: `scripts/__tests__/` — a fixture with 2 failing features out of N prints only those 2; zero errors prints no bracket; `bun run generate:artifacts --check` exit 0; a shell assertion that HANDOFF's section count grew
**Gate**: `bun skills/massa-ai/scripts/validate_state.ts --root .` (exit 1, 52 legacy errors, bracket lists only failing features) && `bun run generate:artifacts --check` && `bun run test:scripts`

### T11: Close out — spec coverage for the carried work, CHANGELOG, state

Covers APCR-11. Confirm every behavior in the 4 carried files is covered by an AC or a
passing test; add tests for any gap (notably `handleRegistryRegenerate` sending the API key).
Write the `[Unreleased]` CHANGELOG entries under the headings `CONTRIBUTING.md` maps to the
intended bump. Commit `.specs/` state for this feature before the first push.

**Depends on**: T1, T10
**Where**: `CHANGELOG.md` (+ `.specs/features/admin-portal-correctness-repair/`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`, `.specs/project/FEATURES.json`)
**Tests**: `apps/web-ui/src/__tests__/admin-handlers.test.ts` — regenerate sends `x-api-key`; `bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal-correctness-repair --root .` exit 0
**Gate**: full baseline set (below) && `bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal-correctness-repair --root .`

## Test Coverage Matrix

| Requirement | AC | Sensor | Task |
| --- | --- | --- | --- |
| APCR-01 | 1,2 | partial-overlay retention cases in `model-profiles` tests | T1 |
| APCR-01 | 3 | builtin-bump-reaches-overlay-user regression | T1 |
| APCR-01 | 4,5 | normalization collapse / preserve-genuine-edit cases | T1 |
| APCR-01 | 6 | existing `_delete` tombstone cases, unchanged | T1 |
| APCR-01 | 7 | structural — the twin is deleted, one implementation remains | T1 |
| APCR-01 | 8 | `initRegistryOverlay` seeds from `source.overlay` only | T1 |
| APCR-01 | 9 | stale-copy-vs-changed-builtin pinned as a known limitation | T1 |
| APCR-01 | 10 | surviving-overlay-entry count returned by the read path | T1 |
| APCR-02 | 1 | existing `project.test.ts:90` fallback case | T2 |
| APCR-02 | 2 | non-dimension error → `success:false`, fallback not called | T2 |
| APCR-02 | 3,4 | type-check with the cast removed and the interface declared | T2 |
| APCR-03 | 1 | Pool-constructor counter === 1 across `getPool` + `ensureInitialized` | T3 |
| APCR-03 | 2 | throwing `ensureInitialized` retry does not leak | T3 |
| APCR-03 | 3 | `close()` ends every constructed pool | T3 |
| APCR-03 | 4 | DB-down `listProjects` throws | T3 |
| APCR-03 | 5 | `tableName`/`schemaDimensions` set when `ensureInitialized` follows `getPool` | T3 |
| APCR-04 | 1,2 | captured SQL contains `schemaname` + quoted qualified identifiers | T4 |
| APCR-04 | 3 | two-schema fixture not double-counted | T4 |
| APCR-05 | 1,2,3 | `"***"` vs empty and vs populated stored value, ×4 fields | T5 |
| APCR-05 | 4 | hide leaves no submittable sentinel | T5 |
| APCR-06 | 1,2,3 | all-switched / all-failed / all-skipped report fixtures | T6 |
| APCR-06 | 4 | detail strings retained in the emitted frame | T6 |
| APCR-06 | 5 | UI classifies a failed event out of the success list | T6 |
| APCR-06 | 6 | exit-0 + failed installs does not render a `success` banner | T6 |
| APCR-06 | 7 | `unsupported` is its own class in derivation and detail strings | T6 |
| APCR-07 | 1,2 | resolver from source position and from simulated `dist` | T7 |
| APCR-07 | 3,4,6 | unresolvable root → 501, shared message, nothing thrown | T7 |
| APCR-07 | 5 | SSE terminal `done` frame carries the reason | T7 |
| APCR-08 | 1,2,5 | `stat` on config, temp file and backups === `0600`; backup goes through temp+rename | T8 |
| APCR-08 | 3 | pre-existing 644 config and planted 644 legacy `.bak` both tightened | T8 |
| APCR-08 | 4 | 11th save leaves 10 timestamped backups; legacy `.bak` survives | T8 |
| APCR-08 | 6 | `model-profiles.json` mode unchanged | T8 |
| APCR-08 | 7,9,10 | `docs/web-ui-access.md` states escalation, no-purge-on-rotation, no extra protection | T8 |
| APCR-08 | 8 | `index.ts` reaches `warnIfTrustOverrideEnabled()` | T8 |
| APCR-09 | 1,2,3 | both routes emit identical frame sequences; suite unchanged | T9 |
| APCR-10 | 1,2 | HANDOFF `##` section count grew | T10 |
| APCR-10 | 3 | no `execute-complete` remains in `FEATURES.json` | T10 |
| APCR-10 | 4 | `STATE.md` figure matches the measured baseline | T10 |
| APCR-10 | 5,6 | failing-set fixture; zero-error prints no bracket | T10 |
| APCR-10 | 7 | `generate:artifacts --check` exit 0 | T10 |
| APCR-11 | 1 | every carried behavior has an AC or a passing test | T11 |
| APCR-11 | 2 | `[Unreleased]` non-empty with mapped headings | T11 |
| APCR-11 | 3 | regenerate `fetch` sends `x-api-key` | T11 |
| APCR-11 | 4 | display merge does not blank the flat maps | T1, T11 |
| APCR-11 | 5 | Duplicate/Delete pickers list effective-registry profiles with an empty overlay | T11 |
| APCR-11 | 6 | first cell edit of a builtin-only profile does not stamp its key as the description | T11 |

## Gate Check Commands

Per-task gates are listed with each task. The full baseline set runs before the close-out
commit and again at validation; every figure is the `spec.md` Verified Baselines table.

```bash
bun test apps/web-ui/src/__tests__/                       # 320 pass / 0 fail baseline
cd apps/tools-api && bun scripts/run-tests-isolated.ts    # 29 groups, all pass
cd packages/shared && bun test
cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='postgres-vector-store'
bun run type-check                                        # 6/6 (use --force: turbo caches)
npx oxlint --quiet                                        # exit 0
bun run test:scripts
bun run generate:artifacts --check
bun skills/massa-ai/scripts/validate_state.ts --root .     # exit 1, 52 legacy errors
bun skills/massa-ai/scripts/check_specs_delivered.ts admin-portal-correctness-repair --root .
```

**Known validator warnings.** `validate_tasks.ts` WARNs when a task's `Where` names more
than one file. T1, T5, T6, T7, T8 and T11 each legitimately span a contract and its call
site (a server merge and the client that seeds from it; a config writer and the UI that
submits to it). Splitting them would produce commits that leave the tree in a
known-inconsistent state between the two halves, which is worse than the warning. Recorded
rather than silenced.
