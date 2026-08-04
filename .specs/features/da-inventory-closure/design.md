# DA Inventory Closure — Design

Scope: shapes for DI-01/02 (code), the DI-05 supersession record, and placement decisions for
the doc/registry tasks. Everything else in `spec.md` is Tasks-only.

## D0 — DI-05 is struck: the fix already shipped, at a different surface (spec amendment)

The spec's DA-15 row and DI-05 requirement were written from the report's "Open, explicitly
carried forward, not actioned" status. Measured after Specify:

- `scripts/lib/run-tests-isolated.ts` builds every child's env through `buildChildEnv`
  (`:79-109`): scratch `XDG_CONFIG_HOME` (`:85`, mkdtemp per invocation `:288`), strips all
  `MASSA_AI_LLM_*`, pins `MASSA_AI_LLM_ENABLED=false` (`:105`) unless
  `MASSA_AI_TEST_ALLOW_LLM=1`; explicit `MASSA_AI_TEST_CONFIG_HOME` escape for
  `check-coverage.ts`. There is **one** spawn site (`:323`) and it passes `childEnv` to every
  group — shared aggregate and isolated alike.
- It landed as **SEN-03**, commit `39afe59` "fix(tests): stop the isolated runner inheriting
  real developer config", first contained in **v1.10.0** — i.e. it predates the report
  (2026-07-29). The report inherited STATE's carried-forward note without re-measuring it —
  DA-15 and DA-14 are the same defect shape (a stale status field trusted).
- Unit coverage exists and is direction-complete: `scripts/__tests__/runner-child-env.test.ts`
  (SEN-03 suites: config-dir leak path, `.env` leak path incl. pin-not-delete, DATABASE_URL
  pass-through, non-LLM `MASSA_AI_*` untouched, explicit opt-in keeps everything).
- Re-measured live this session: `apps/mcp-client` full package through its wrapper under the
  real user config → **PASS all 8 groups**; the same suite run **directly** (`bun test <file>`)
  under the real config → 93/2 cold, 95/0 warm — the documented cold-model flake, which is
  DI-01's remaining half, not the runner's.

Consequence: DA-15 → **RESOLVED** (mechanism: hermetic child env, not the report's proposed
isolation-classification rule — check a guard's surface before concluding it is absent).
DI-05 is **withdrawn**; its STATE-note clause moves to DI-04. The spec table is amended in
place with this reason. Remaining un-hermetic surface is the **direct** `bun test <file>`
invocation, which is intentional (CLAUDE.md documents it) and is exactly what DI-01 pins.

## D1 — DI-01: seam export + suite pin

**Export surface.** `packages/core/src/services/index.ts` gains:

```ts
export {
  _setLlmEnabledForTesting,
  _setJsonSchemaSupportedForTesting,
} from "./memory/llm-client.js";
```

Both reach the root barrel through the existing `export * from "./services/index.js"`. The
underscore prefix is the package's established test-seam idiom (`_set*ForTesting`,
`__setAuthKeyForTests`); layering is untouched (services barrel re-exporting a services
module; `check-core-layering` sees no new edge class). Both symbols ship in the public npm
surface — accepted: the names state their contract, and `reset*()` factory seams already do.

**Suite fix — REVISED after the Plan Challenge (finding 1, critical).** The gate's call-graph
trace proved the original pin-only shape wrong before a line was written:
`_setLlmEnabledForTesting` feeds `isLlmEnabled()` (`llm-client.ts:114`), whose only callers
are the NL-judgment gates and the reranker — while `/search/project` and `/search/code` reach
`ContextualSearchRLM.ensureInitialized()` (`contextual-search-rlm.ts:209,244`), which calls
the real `getVectorStore()` (`vector-store-factory.ts:37`, live `embeddingProviderFactory`
`:56`) **unconditionally, before admission**. Two independent mechanisms; the seam gates one.
The prior CLAUDE.md triage named the wrong single cause for this file — trace the call graph
before trusting a prior triage's named mechanism.

The shape that closes **both** leak paths for direct runs, without mocking anything (the suite
stays deliberately-unmocked integration), mirrors SEN-03 at suite scope:

```ts
// Before ANY core import: scratch config home, exactly what the isolated
// runner gives every child (SEN-03). Static imports hoist, so the core
// import must be dynamic — the m25-m26 suite's established pattern.
process.env.XDG_CONFIG_HOME = mkdtempSync(path.join(tmpdir(), "embedded-endpoints-config-"));
const { EmbeddedApiClient } = await import("../embedded-api-client.js");
```

plus `_setLlmEnabledForTesting(false)` in `beforeAll` / restore-`null` in `afterAll` — not as
the fix but as the explicit second-gate pin the wrapper also applies (`buildChildEnv:105`),
keeping direct-run semantics identical to wrapper semantics. `DATABASE_URL` still arrives via
env, so the real-test-DB contract is unchanged (same as `buildChildEnv`'s pass-through).

**Sufficiency measurement (Execute, not assumed).** Baseline red observed this session: cold
direct run 93 pass / 2 fail (44.96 s; live ETL against the real data dir visible in the log),
warm 95/0 (21.57 s); empty-config baseline 3.96 s green (CLAUDE.md's own measurement). After
the fix: direct run green with duration in the empty-config band, wrapper run green, and the
falsifier is commenting out the env line — cold-model red cannot be forced on demand, so the
discrimination evidence is the duration band plus the two-mechanism trace above, recorded as
such. Both direct and wrapper counts are captured **separately** in the execution record
(gate finding 7).

**Seam export still ships (AC-1)** — it is the documented gap and the wrapper's second gate;
the CLAUDE.md rewrite names the true two-mechanism story: the seam alone was never sufficient
for this file, the config leak (embedding auto-selection included) was the other half.
Post-build, the shipped `.d.ts` is grepped for both seam names and the public exposure is
recorded as accepted (gate finding 6).

**CLAUDE.md rewrite (same task pair).** The "Known outstanding case" paragraph
(`CLAUDE.md:176` area) is replaced: seam now exported and pinned; the wrapper path has been
hermetic since SEN-03/v1.10.0; direct runs are deterministic; the `XDG_CONFIG_HOME` workaround
sentence is retired. DA-13's flake-list note elsewhere stays true (its other two members are
untouched).

## D2 — DI-02: UNION GUARD wiring sensor

**Seam.** In `scripts/run-tests-parallel.ts`, immediately before the guard
(`const guard = unionGuardCheck(filteredSuites, allResults)` at `:312`):

```ts
// DI-02 test seam: drop one assembled result pre-guard so the guard's
// call-site wiring (exit 1 + UNION GUARD FAIL naming) is testable
// end-to-end. Unset ⇒ zero-cost no-op. Unknown id ⇒ no-op (the control
// case asserts absence-behavior, so a typo cannot fake a pass).
const dropId = process.env._PARALLEL_DROP_RESULT;
if (dropId) {
  const dropIndex = allResults.findIndex((r) => r.suiteId === dropId);
  if (dropIndex >= 0) allResults.splice(dropIndex, 1);
}
```

`SuiteResult.suiteId` (`:141`) is the exact-match key; ids are deterministic
(`<classification reason>:<relative path>`, visible in every START line).

**Test** (in `scripts/__tests__/run-tests-parallel.test.ts`, reusing the T24 probe
helpers): drop a probe file that passes trivially, `--filter` to it, run once without the env
(control: exit 0), once with `_PARALLEL_DROP_RESULT=<its id>` — expect exit 1 and stderr
containing `UNION GUARD FAIL` and the id. The probe id is constructed from the same
classification the T24 tests already rely on.

**Observed red (recorded in tasks.md §execution):** with the new test green, mutate the
wiring — delete the `return 1` under `guard.missing` (`:315-318`) — the new test must go red
while every pre-existing test stays green (that is the discrimination claim: no existing test
senses this line). Restore byte-identical (SHA-verified), re-run green.

**Non-goals.** No `--drop` CLI flag (the seam is not an operator surface); no seam for the
`extra` branch (same wiring, same `return 1` shape, one line apart — the missing-branch sensor
covers the call-site class; recorded as the accepted asymmetry).

## D3 — Placement decisions (Tasks-only requirements)

- **DI-03**: `FEATURES.json` `subagent-skills-plugin-parity` → `status: "complete"`, phases all
  `true`, note: "Validated PASS 2026-07-23 (independent verifier, `bc57daa..80994eb`, T1–T12).
  Registry lagged reality until 2026-08-03 (DA-11); roster later grew 12 → 17 under the
  generator features." Edited via a python json round-trip (repo has no jq), diff checked
  additive-only.
- **DI-04**: `STATE.md:2308-2310` bullet: strike the two stale clauses in place, each with its
  resolution — `includePersistent` → honored since BEH-01/[1.9.1] (`memory-controller.ts:281,
  :305`; `memory-repository-pg.ts:236-238`); shared-barrel isolation → superseded by SEN-03
  `39afe59` (v1.10.0) hermetic child env (see D0). Annotation style follows the repo's
  strike-and-amend precedent (corrections stay visible with their reason).
- **DI-06**: CLAUDE.md "Running tests" section, after the runner-architecture paragraph: a
  worktree-provisioning paragraph with the exact failure signature
  (`No native build was found for platform=… runtime=node`), the silent-install trap
  (`bun install` exits 0 on macOS arm64 + Node 25 while node-gyp fails), the two repairs
  (copy `node_modules/tree-sitter*/build/` from a provisioned checkout; or install with a
  Node 22 helper), and the verify command
  (`bun test ./scripts/tests/verify-tree-sitter-grammars.test.ts` → 9 pass).
- **DI-07**: `CONTRIBUTING.md` gains `## Measurement discipline` (after the CHANGELOG-authoring
  section): tracked-state verification; pass/fail split over pass count; cached / turbo-replayed
  / pipe-wrapped results are not measurements; population beside verdict; corrections recomputed
  from inputs. Each rule cites one recorded instance (incl. this session's two). CLAUDE.md
  §Working conventions gains one link line — single source, link-not-restate.
- **DI-08**: read `lessons.py add`/`observe` argument contracts first; record L-001's subject
  closure from this feature via the tool (if its dedup treats same-key `add` from a new feature
  as recurrence, that is the record; else `observe`). No hand edits; `git diff` on
  `lessons.json` must be tool-output-shaped.
- **DI-09**: `.ua/` state lives in the **main checkout** working tree; copy the 4 modified
  tracked files + untracked `diff-overlay.json` into this worktree, commit. Token + trash
  excluded (spec §Assumptions).
- **DI-10 — REVISED after the Plan Challenge (findings 3+4).** The design's three named
  hit-classes undercounted the live population ~4×: `git grep -l "\.specs/reports/"` at gate
  time returned **13 tracked files**, including two other features' sealed validation artifacts
  and `docs/adding-a-host.md`. The sweep therefore runs with an explicit, written disposition
  rule, and prints the full population beside the per-file verdict:
  1. **Sealed historical artifacts** (other features' `spec/design/tasks/validation.md`,
     STATE/HANDOFF `Previous` blocks): **leave untouched.** They describe the tree at their
     own time; editing a sealed validation record to chase a deletion would damage the record.
     After removal these references resolve via git history, which is what historical prose is
     for. Counted, listed, dispositioned `historical — left`.
  2. **Living documents** (`docs/adding-a-host.md`, README/FEATURES if hit, STATE/HANDOFF
     `Active`/`Current` blocks, this feature's own `spec.md` §Source line): **annotate or
     repoint** — the reference gains "(removed at `da-inventory-closure` close-out; recover via
     git history)" or is rewritten to not depend on the path existing.
  3. **Tool-owned files** (`lessons.json`/`LESSONS.md` evidence strings): only via `lessons.py`;
     if the tool has no edit path for an evidence string, disposition `tool-owned — left` with
     the reason.
  T10's gate is: printed population count == `git grep -l` count at that HEAD, and **0 files
  without a recorded disposition** (not "0 hits" — self-references and sealed history are
  legitimate survivors). Then `git rm -r .specs/reports/` in the same commit as the class-2
  annotations, so the sweep and the removal cannot drift apart. The verifying run re-greps at
  the post-commit HEAD and checks survivors against the disposition list — the sweep's own
  repoints must not delete its subjects before that verification (the repoint-deletes-subject
  shape is why the verify step re-derives the population instead of diffing the proposal).

## Risks & Concerns

| Risk | Where | Consequence | Mitigation |
|---|---|---|---|
| Barrel export collides with an existing symbol | `services/index.ts` | build red | both names grepped — 0 existing exports; build gate per commit |
| Pin insufficient on a cold embedding model | DI-01 | AC-2 unmet | fallback pre-decided in D1 (same-task, suite-file-local); measured, not assumed |
| Seam env var leaks into normal runs | DI-02 | dropped results in production use | underscore-prefixed, read once, absent ⇒ no-op; control case asserts absence-behavior; not documented as CLI |
| `_PARALLEL_DROP_RESULT` name collides with turbo passthrough rules | DI-02 | var stripped under turbo | irrelevant — the parallel runner is invoked directly (`bun scripts/run-tests-parallel.ts`), not through turbo tasks; recorded so nobody adds it to `passThroughEnv` |
| STATE strike edits corrupt neighbor content | DI-04 | history damaged | surgical Edit with exact-match anchors; diff reviewed before commit |
| reports/ removal orphans a tracked pointer | DI-10 | dangling citation | content sweep is the task's own gate: 0 unannotated hits before `git rm` |
| (critic C3 carried) any `check-coverage.ts`-importing script wired into CI build job | ci.yml | latent CASCADE TRUNCATE | no CI edits in any write set; invariant restated here |
| AD-014 boundary | observation writers | sanitizer bypass | no DI touches `hook-service`/`compact_snapshot`/`ObservationStore` — asserted at validation via diff surface |

## Write sets (disjointness)

| Task group | Files |
|---|---|
| DI-01 | `packages/core/src/services/index.ts`, `apps/mcp-client/src/__tests__/embedded-api-client-endpoints.test.ts`, `CLAUDE.md` (known-outstanding paragraph) |
| DI-02 | `scripts/run-tests-parallel.ts`, `scripts/__tests__/run-tests-parallel.test.ts` |
| DI-03 | `.specs/project/FEATURES.json` |
| DI-04 | `.specs/project/STATE.md` |
| DI-06 | `CLAUDE.md` (Running tests provisioning paragraph — disjoint span from DI-01's) |
| DI-07 | `CONTRIBUTING.md`, `CLAUDE.md` (Working conventions line — third disjoint span) |
| DI-08 | `.specs/lessons.json` + `.specs/LESSONS.md` (tool-owned) |
| DI-09 | `.ua/*` |
| DI-10 | `.specs/reports/` (delete) + annotated citing sites |
| DI-11 | `CHANGELOG.md` |

CLAUDE.md is touched by three tasks in three disjoint spans; they land in DI-01 → DI-06 →
DI-07 order so each edit anchors against already-final text.
