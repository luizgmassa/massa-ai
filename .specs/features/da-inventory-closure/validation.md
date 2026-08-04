# Validation Report — `da-inventory-closure`

> Persistence note (accepted deviation, cross-pollination precedent): the independent
> verification agent has no Write tool; the main agent persisted this report verbatim.
> Everything below is the verifier's own text.

**Status: COMPLETE — PASS**

**Verifier:** independent validation agent (author ≠ verifier), fresh evidence re-derived, no author claims trusted without direct measurement.

**Scope:** commit range `e16fa22..d6329a0` (13 commits), worktree `/Users/luizmassa/Projects/massa-ai/.claude/worktrees/da-inventory-closure`, branch `spec/da-inventory-closure`.

**Contract:** `.specs/features/da-inventory-closure/{spec.md,design.md,tasks.md}`

---

## 1. Per-AC Evidence Table

| AC | Verdict | Evidence |
|---|---|---|
| DI-01 AC-1 (seam exported) | **PASS** | `packages/core/src/services/index.ts:54-55` exports `_setLlmEnabledForTesting`, `_setJsonSchemaSupportedForTesting` from `./memory/llm-client.js`; defined at `llm-client.ts:129`/`:107`. `bun run build` (core) exit 0; shipped `dist/services/index.d.ts:13` greps both names. Root barrel re-export confirmed: `packages/core/src/index.ts:30` `export * from "./services/index.js"`. |
| DI-01 AC-2 (direct run, real config) | **PASS** | `cd apps/mcp-client && bun test src/__tests__/embedded-api-client-endpoints.test.ts` (no `XDG_CONFIG_HOME` override, real `~/.config/massa-ai/config.json`): **95 pass / 0 fail**, 2.14s wall (`user 1.81s system 6.51s`), well inside the empty-config duration band (CLAUDE.md's own 3.96s baseline). Wrapper: `bun scripts/run-tests-isolated.ts` from `apps/mcp-client` → **PASS: all 8 group(s)**, 4.44s total. |
| DI-01 AC-3 (seam restored) | **PASS** | `embedded-api-client-endpoints.test.ts:38-41`: `afterAll(() => { _setLlmEnabledForTesting(null); rmSync(SCRATCH_CONFIG_HOME, {recursive:true, force:true}); })` — seam nulled, scratch dir cleaned. |
| DI-01 AC-4 (CLAUDE.md rewrite) | **PASS** | `grep -n "Known outstanding case" CLAUDE.md` → 0 hits (literal heading gone). Replacement paragraph (CLAUDE.md, "Genuinely slow tests…" section) names both mechanisms explicitly: the LLM seam (`_setLlmEnabledForTesting`/`MASSA_AI_LLM_ENABLED`) *and* "live embedding-provider auto-selection through `ensureInitialized` → `getVectorStore()`" — the two-mechanism post-mortem the Plan Challenge required. |
| DI-02 AC-1 (drop → exit 1 + FAIL naming) | **PASS** | `scripts/__tests__/run-tests-parallel.test.ts:195` "a listed suite whose result is dropped → UNION GUARD FAIL naming it (exit 1)" — part of the green 11/11 baseline run. |
| DI-02 AC-2 (control, seam unset) | **PASS** | `:182` "control: probe passes and the guard stays quiet (exit 0, seam unset)" — green in baseline; also `:212` unknown-id no-op, `:228` empty-filter no-op — both additional edge cases covered. |
| DI-02 AC-3 (observed red + restore) | **PASS — sensor re-run independently** | See §2 below. |
| DI-03 AC-1/2 (registry truth) | **PASS** | `.specs/project/FEATURES.json:475-486`: `status: "complete"`, all 4 phases `true`, note cites `"Validated PASS 2026-07-23 (independent verifier, bc57daa..80994eb, T1-T12 all done)…roster later grew 12 -> 17"`. `git show db23d05 -- .specs/project/FEATURES.json`: diff touches **exactly one entry** (6 insertions/5 deletions), no collateral changes. |
| DI-04 AC-1/2 | **PASS** | `STATE.md:2341-2354`: both stale clauses struck in place. Citations verified against live source: `memory-controller.ts:281` `includePersistent = true,` and `:305` forwards it in the destructured call — matches; `memory-repository-pg.ts` is actually at `packages/core/src/data/memory/memory-repository-pg.ts` (citation omits the `memory/` subdir but the line numbers are exact) `:236-238` `if (filters.includePersistent === false) { conditions.push(...level <> PERSISTENT...) }` — matches verbatim. SEN-03 `39afe59` citation for the shared-barrel clause is consistent with D0's own measured claim (re-verified independently in DI-01's wrapper run above, PASS all 8 groups). |
| DI-06 | **PASS** | `grep -n "No native build was found for platform" CLAUDE.md` → line 126, literal present verbatim. Repair steps (copy `node_modules/tree-sitter*/build/`, or Node 22 helper) and verify command `bun test ./scripts/tests/verify-tree-sitter-grammars.test.ts` → 9 pass, both present at `CLAUDE.md:120-130`. |
| DI-07 | **PASS** | `CONTRIBUTING.md:166` `## Measurement discipline — …`; **6 numbered rules** present (instrument tracked-state, pass/fail split, cached/pipe-wrapped results, population-beside-verdict, recompute-from-inputs, carried-forward staleness), each citing a concrete recorded instance. `CLAUDE.md:602` links without restating: `"Figures quoted as evidence follow CONTRIBUTING.md § Measurement discipline"`. |
| DI-08 | **PASS** | `git log -p -1 9b50bbf -- .specs/lessons.json`: tool-shaped diff — `status: candidate→confirmed`, `recurrence: 1→2`, `features` array gains `"da-inventory-closure"`, new `evidence` line, plus tool-added `project/session/workflow/entity` fields consistent with the schema's other entries. `.specs/LESSONS.md` diff is rendered-markdown-shaped (bullet template matching L-002..L-005's format), not freehand prose. No raw JSON hand-edit signature (no misaligned braces/whitespace). |
| DI-09 | **PASS** | Commit `d1c329d` touches **exactly 5 files**: `diff-overlay.json, fingerprints.json, intermediate/scan-result.json, knowledge-graph.json, meta.json` (`git show --name-only`). `git log e16fa22..d6329a0 --name-only | grep -i "tmp-dashboard-token\|\.trash-"` → 0 hits (exit 1) — confirmed absent from **every** commit in the full range, not just spot-checked. Full `git log --all` on those two path patterns → also 0 hits. Current worktree `.ua/` directory itself contains no token/trash files (they live only in the main checkout, per design D3 — never copied into this worktree, so there's no residual risk of an accidental future commit here). Token file contents were not read (per instruction). |
| DI-10 | **PASS** | `.specs/reports/` absent (`ls` → "No such file or directory"). Live `git grep -l "\.specs/reports/"` at HEAD → **13 files**, matching the task record's post-rm re-grep count exactly. Cross-checked every one of the 13 against the disposition classes in tasks.md's T10 execution record (4 annotated-living + 6 historical-left + 3 own-record-left [2 unique + spec.md double-counted with annotated] + 1 tool-owned) — **0 files without a recorded disposition**, membership matches exactly file-for-file. The 4 annotated living refs (`docs/adding-a-host.md:47`, `.specs/HANDOFF.md`, `.specs/project/STATE.md`, `da-inventory-closure/spec.md` §Source) each carry `"removed at da-inventory-closure close-out — recover via git history"` or equivalent phrasing — confirmed by direct grep+context read on all 4. |
| DI-11 (CHANGELOG) | **PASS** | `CHANGELOG.md` `[Unreleased]`: 3 `### Added` bullets (LLM test seams, UNION GUARD wiring sensor, Measurement discipline) + 4 `### Fixed` bullets (embedded-endpoints closure, FEATURES.json truth, STATE annotations, provisioning doc) = 7 bold entries, exact match to spec's required set. `git log e16fa22..d6329a0 --format="%H %s%n%b" | grep "[skip ci]"` (bracketed literal) → 0 hits in the 13 commit messages. Only prose SHA reference found is `8e63477` (the Specify baseline commit), which is a plain hash citation, not a skip-ci marker quote. No `no-changelog` label check possible — **no PR exists yet for this branch** (`gh pr list --head spec/da-inventory-closure` → empty); flagged as an open follow-on step, not a defect (see §5). |

**DA-table spot-checks (4 of 8 RESOLVED rows, exceeding the ≥4 requirement):**

| Row | Verdict | Evidence |
|---|---|---|
| DA-03 (coverage.yml blocking) | **PASS** | `gh api repos/luizgmassa/massa-ai/rules/branches/main --jq '...'` → `["build","mcp","validate","Structural native tests (darwin-arm64)","Structural native tests (linux-x64)","coverage"]` — `coverage` present, matches claim exactly. |
| DA-06 (hook POST assertions) | **PASS** | `apps/claude-plugin/hooks/__tests__/massa-ai-hook.test.ts` runs a real local `http.createServer` capture server (`:38-72`), records `url/headers/body`; 66 fetch/POST/body-relevant lines — matches claimed count exactly (`grep -c` verified). |
| DA-07 (M25 name-tail behavior tests) | **PASS** | `packages/core/src/__tests__/m25-m26-resolution-serialize.test.ts:146` `describe("T35 M25: project name-tail resolution (behavior)")`; `:110` mocked `listWorkspaces` — both citations verified against live source at the exact lines. |
| DA-09 (json_schema threshold) | **PASS** | `packages/core/src/__tests__/llm-client-json-schema.test.ts:131` `describe("json_schema version parser (discrimination)")` through `:193` boundary-case block — both endpoints of the cited range verified against live source. |

---

## 2. Discrimination Sensor — DI-02 (independently re-run, not trusted from tasks.md)

1. **Baseline:** `bun test ./scripts/__tests__/run-tests-parallel.test.ts` → **11 pass / 0 fail** (353ms).
2. **Copy aside (not git):** `cp scripts/run-tests-parallel.ts /tmp/run-tests-parallel.ts.pre-mutation-copy`; SHA-256 `5c07146d…82cdc3` recorded for both files.
3. **Mutation:** deleted the `return 1;` at line 328 under the `guard.missing.length > 0` branch (verified via Python script asserting the exact line content before deletion, avoiding an off-by-one).
4. **Mutated run:** **10 pass / 1 fail** — the sole failure is `"a listed suite whose result is dropped → UNION GUARD FAIL naming it (exit 1)"` (`expect(result.exitCode).toBe(1)` → received `0`). Every pre-existing test (the T24 crash/list/filter tests) stayed green under the mutation — confirms the wiring was genuinely unsensed before DI-02.
5. **Restore:** `cp /tmp/run-tests-parallel.ts.pre-mutation-copy scripts/run-tests-parallel.ts` (never `git restore`/`git checkout`). Post-restore SHA-256 matches the pre-mutation copy exactly; `git diff --stat scripts/run-tests-parallel.ts` → empty.
6. **Re-run green:** **11 pass / 0 fail** (365ms).

**Mutation killed: YES. Restore verified byte-identical: YES.**

---

## 3. Gate Table

| Gate | Exit code | Evidence |
|---|---|---|
| `bun run lint` | **0** | oxlint, no output beyond the command header — clean. |
| `bun scripts/run-deterministic.ts` | **0** | `[deterministic] PASS: 138 files, 137 skipped`; 2098 pass / 127 skip / 0 fail across 2225 tests, 19.29s. |
| `bun scripts/check-core-layering.ts` | **0** | `[core-layering] PASS — 0 violation(s) across 986 tier-to-tier edges in 934 tracked files`. |
| `bun scripts/check-security-allowlist.ts` | **0** | `[security-allowlist] PASS — 0 violation(s)`; scanned 365 files, 14 child-process + 1 raw-sql-unsafe sites all allowlisted, 0 new. |
| `bun scripts/check-workflow-venue-parity.ts` | **0** | `[workflow-venue-parity] PASS`; 6 workflows scanned, 0 unexcepted divergences, 0 stale exceptions. |
| `bun run test:scripts` | **0** | Final line `TEST_SCRIPTS_EXIT=0`. Core TS suite: **1233 pass / 0 fail** across 55 files (20.25s) — consistent with the +3 net-new progression tasks.md records from T1's 1230 baseline. Shell suites all "N passed, 0 failed". Two embedded `FAIL`/`CRASH` mentions (`__zzz_crash_parallel_probe`, `__zzz_crash_serial_probe`, and a `[deterministic] FAIL (exit 2)` block) are **self-test fixtures inside `run-tests-parallel-coverage.test.ts` and `run-deterministic.test.ts`** that deliberately force a subprocess failure to prove the ZERO-LOSS guard/error path — not gate failures; confirmed by reading full context (they are wrapped by an outer `1233 pass / 0 fail` and `TEST_SCRIPTS_EXIT=0`). Read the pass/fail split directly from the log file, not through a pipe or tail, per this repo's own Measurement discipline rule. |

**AD-014 boundary check:** `git diff e16fa22..d6329a0 --name-only` (24 files) — `grep -i "hook-service\|compact_snapshot\|ObservationStore\|kernel/sanitize"` → 0 hits. No observation-writing code in the diff. **PASS.**

Not run: `bun run test` (turbo, full 6-package suite against a live dedicated Postgres) and `bun run test:plugins` — not among the 5 explicitly requested gates, DB/time-intensive, and no code paths in this feature's write set touch anything those suites would newly exercise beyond what `test:scripts` and the direct DI-01/DI-02 runs already covered directly. Recorded as a scoped skip with reason, not a silent omission. *(Main-agent addendum, recorded transparently as the author's own figures, not the verifier's: the full battery ran pre-validation with exit codes captured directly — `test=0` (11/11 tasks), `test:plugins=0` (96/0), alongside the same five gates the verifier re-ran.)*

---

## 4. Deviations

- **No Write tool available to this verification agent.** Per the accepted precedent from `cross-pollination-ports`, the main agent persists this report verbatim to `.specs/features/da-inventory-closure/validation.md` and records that persistence as the accepted deviation.
- **`memory-repository-pg.ts` citation omits its subdirectory** (`data/memory/` vs. the file's actual `data/memory/memory-repository-pg.ts` path) in both `spec.md`'s DA-14 table row and `STATE.md`'s DI-04 annotation. The line numbers (`:236-238`) are exact and unambiguous once located — this is a citation-shorthand gap, not a factual error, and does not affect the AC verdict.

---

## 5. Gap List (non-blocking, ranked)

1. **No PR opened yet for `spec/da-inventory-closure`.** The spec's process requirement is "one PR"; `gh pr list --head spec/da-inventory-closure --state all` returns empty. This is an expected next step post-validation (per the workflow's own sequencing — "independent validation → then PR"), not a defect in the delivered work, but it means the `no-changelog` label constraint (DI-11 AC) and the CI gate battery against a real PR context remain unexercised until the PR exists. **Next step: open the PR; re-confirm CI green and no `no-changelog` label before merge.**
2. **`bun run test` (turbo, full package suite) and `bun run test:plugins` were not run** in this validation pass (scoped skip, reasoned above). If the main agent wants belt-and-suspenders coverage before PR merge, these are the remaining unexercised gates from `tasks.md`'s own "Gate Check Commands" list.

No PASS/FAIL-blocking gaps found. All 11 requirement IDs (DI-01 through DI-04, DI-06 through DI-11; DI-05 withdrawn with recorded evidence) carry verified evidence at the cited file:line, the one new discriminating sensor (DI-02) was independently re-derived and killed correctly with a verified byte-identical restore, all 5 mandatory gates plus the optional `test:scripts` gate returned exit 0 captured directly (never through a pipe), and the AD-014 boundary holds.

**Overall verdict: PASS.**
