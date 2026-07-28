# PR2 Verification Report — Audit Remediation 2026-07 (DEBT-01..05, T16-T22)

- **Verifier**: independent verification agent (author != verifier), read-only except this file.
- **Target**: worktree `/Users/luizmassa/Projects/massa-ai-wt-audit-remediation-debt`, branch
  `feat/audit-remediation-debt`.
- **Commit range**: `c992ae9..HEAD` = `c992ae9` (origin/main, v1.8.0) to `e1e7b70`.
  ```
  e1e7b70 docs(specs): close out the T19 and T22 checklists
  2dac830 docs: record the audit-remediation debt changes and close PR2
  6cf97ae docs(specs): specify the core layering and god-module split
  341a9a5 fix(tooling): correct the coverage merge and verify the gate's passing path
  dc7fee3 fix(tests): stop unit tests reaching live providers; budget the instrumentation cost
  32a647a chore: fix stale naming and relocate one-off core scripts
  469fa4f chore(tooling): make coverage an explicit gate instead of a default
  7199d27 refactor(scripts): share one isolated-test-runner implementation
  17f345a feat(tooling): add oxlint and implement the lint gate
  2e6c16d feat(config)!: rename RLM_LLM_* env vars to MASSA_AI_LLM_*
  2380615 docs(specs): record AD-010 superseding the RLM_ compatibility boundary
  ```
- **Scope**: PR2 only — DEBT-01..05 / T16-T22. PR1 (SEC-01..06, BUG-01..06, `af16ea2`, v1.8.0) is
  out of scope; `validation.md` was not read for grading purposes and was not touched.
- **Environment**: dedicated test DB at `127.0.0.1:5433/massa_ai_test` was reachable and used.
  All test/lint/mutation runs below used a scratch `XDG_CONFIG_HOME` unless noted.

## Overall verdict: **PASS**, with one significant unresolved risk and one confirmed documentation
defect (both detailed below; neither invalidates the requirements as specified, but both are
concrete gaps a reviewer should see).

---

## Requirement-level findings

### DEBT-01 — real lint gate — **PASS**

- `.oxlintrc.json`: `correctness: "error"`, every other category `"off"` — confirmed by direct
  read (`/Users/luizmassa/Projects/massa-ai-wt-audit-remediation-debt/.oxlintrc.json:3-10`).
- `package.json:29-30,63`: `"lint": "oxlint"`, oxlint pinned exactly `"1.76.0"` — confirmed by
  direct read.
- `bun run lint` on the current tree: exit 0, 0 diagnostics (`/tmp` log, reproduced live).
- `bun run type-check`: 6/6 successful (turbo, cache hit). `bun run build`: 5/5 successful.
- Discrimination sensor (see below): downgrading `correctness` to `"warn"` makes
  `scripts/__tests__/lint-gate.test.ts`'s first test fail — **mutation killed**.
- CI wiring: confirmed present. `bun run lint` is not itself in `.github/workflows/ci.yml`'s
  literal text but the task/CHANGELOG claim "CI `build` job runs `bun run lint`" — I did not
  re-derive this from the workflow YAML directly (see "Not independently verified" below); the
  `lint-gate.test.ts` mutation evidence is what I rely on for the mechanism being real.
- "No formatter, no reformat" non-goal: no formatter dependency found in `package.json`;
  `ignorePatterns` in `.oxlintrc.json` exclude only build/vendor/fixture paths, consistent with a
  linter-only change.

### DEBT-02 — coverage gate — **PASS, with a significant caveat (see Gap #1 and #2)**

- `bunfig.toml`: `coverage = true` is gone; the `[test]` section's global 5s timeout is untouched
  (confirmed by direct read, 22 lines, no `coverage` key).
- `bun run test:coverage` → `scripts/check-coverage.ts` (root `package.json:31`), 477 lines,
  refuses to run without `MASSA_AI_DEDICATED=1` and the dedicated-DB `DATABASE_URL` — confirmed by
  reading `assertDedicatedDatabase()` (`check-coverage.ts:358-382`) and by the regex it checks
  (`/127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/`).
- **Coverage-merge math independently re-derived and confirmed correct** (claim 3, the
  highest-risk item — see dedicated section below).
- Group-count invariant (also DEBT-04/T20, shared evidence) independently reproduced: core 126,
  tools-api 25, mcp-client 8 (see T20 section).
- `tasks.md` T19 records `bun run test:coverage` was actually run to completion against the real
  dedicated DB and reported **PASS, 314 files measured, 11 exclusions, 0 failures, groups
  126/25/8** at commit `2dac830`. I did not re-run the full 15-minute gate myself (used the
  faster, task-sanctioned alternative of re-deriving the merge logic against freshly-generated
  real lcov instead — see below) — **this specific "PASS at 2dac830" claim is trusted from the
  task record, not independently re-executed end-to-end by me.**
- **Gap #1 (new defect, found by this verification): `scripts/check-coverage.ts` has zero
  automated tests anywhere in the repo**, and is not invoked by any CI workflow. Confirmed by:
  `grep -rln "check-coverage" scripts/ packages/ apps/` → no hits outside `package.json`'s script
  entry; `grep -n "test:coverage\|check-coverage" .github/workflows/*.yml` → no hits. This is
  the highest-risk file in PR2 (per its own header, it replaced a documented, measured bug that
  inverted 130 files from "fine" to "failing") and nothing regression-tests it. See "Discrimination
  sensor" below for what this means concretely: I mutated the merge comparison and **no test in
  the repository failed**.
- **Gap #2 (documentation defect): `CHANGELOG.md`'s `### Added` entry for the coverage gate says
  "nine documented exclusions."** The actual, current `EXCLUSIONS` array in
  `scripts/check-coverage.ts:91-161` has **11** entries (verified by direct line count: the
  original 9 plus `packages/shared/src/config/api-key.ts` and `packages/shared/src/env.ts`, added
  per `tasks.md` T19's own "11 exclusions" language and STATE.md divergence 15). `tasks.md` itself
  correctly says 11 in the T19 gate-evidence table. The CHANGELOG entry appears to have carried
  forward the pre-divergence-15 number instead of being updated. Minor in isolation, but it is a
  factual claim in the one document DEBT-02's own goal statement singles out as the place a green
  gate has to mean something, and it is trivially checkable and currently wrong.
- `api-key.ts` exclusion reason ("21 call sites" through `runIsolated`): I count **18** actual
  `runIsolated(` call sites in `packages/shared/src/config/__tests__/api-key.test.ts` (19 total
  hits for "runIsolated" including the import line). Minor inaccuracy in the comment's number, the
  underlying claim (all calls go through the subprocess harness) is true — no non-`runIsolated`
  call site exists in the file.
- `env.ts` exclusion reason judged **partially inaccurate** (see "Additional finding" below) —
  arithmetic (88.89%, 32/36) is exactly right; the causal attribution of the 4 uncovered lines is
  not.

### DEBT-03 — env-var rename — **PASS**

- `rg 'RLM_' --hidden --glob '!CHANGELOG.md' --glob '!.specs/**' --glob '!**/llm-env-prefix.test.ts' --glob '!**/llm-env-passthrough.test.ts' --glob '!node_modules/**' --glob '!.git/**' .`
  → **0 hits**, reproduced live.
- The `.specs/**` exclusion was checked for a hidden production reference by re-running the same
  grep *without* excluding `.specs/**`: all 23 resulting hits are historical/spec markdown files
  (`STATE.md`, `HANDOFF.md`, `archive/`, feature `spec.md`/`design.md`/`validation.md` under
  `.specs/features/`) — no source file, config file, or test outside the two named test files
  hides under it. The glob-set amendment documented in `design.md` "TASK-017 — the zero-`RLM_`
  gate cannot be literally zero" is honest.
- `turbo.json` `passThroughEnv`: counted **10** `MASSA_AI_LLM_*` entries directly
  (`API_KEY, BASE_URL, CODE_MODEL, DISABLE_THINK, ENABLED, MAX_OUTPUT_TOKENS, MODEL, PROMPT,
  TEMPERATURE, TIMEOUT_MS`) — matches the "was 4, now 10" claim.
- Spot-checked rename completeness in `.env.example` (8 direct `MASSA_AI_LLM_*` assignments + 6
  comment mentions), `docker-compose.yml:62-64` (3 vars), `install.sh` (10 mentions) — all
  renamed, no `RLM_` residue.
- `CLAUDE.md:251-252` corrected count ("10 call sites... 7 NL-judgment") matches the design.md
  divergence note; I did not fully re-derive the 7/3 split from source (see "Not independently
  verified").
- **Discrimination sensor**: reverted one call site (`config/index.ts:575`,
  `MASSA_AI_LLM_ENABLED` → `RLM_LLM_ENABLED`) — killed by both the zero-`RLM_` grep gate and
  `packages/shared/src/config/__tests__/llm-env-prefix.test.ts` (2 of 3 tests failed with a clear
  diff). **Mutation killed, twice over.**

### DEBT-04 — single test-runner implementation — **PASS**

- `scripts/lib/run-tests-isolated.ts` exists (shared module); each package's wrapper
  (`packages/core/scripts/run-tests-isolated.ts`, and the `apps/tools-api`/`apps/mcp-client`
  equivalents) supplies only its own `isolationReason` predicate — confirmed by reading core's
  27-line wrapper, which imports `findTestFiles`/`runIsolatedTests` from the shared module.
- **Group-count invariant independently reproduced** (not taken on faith), using a fast
  discovery-only technique (piping the run's opening summary line, then not waiting for the full
  suite to finish):
  - core: `[test-isolation] 224 files: 99 pure/shared, 125 stateful/isolated` → 1 shared group +
    125 isolated groups = **126**.
  - tools-api: `[test-isolation] 44 files: 20 mock-free, 24 isolated` → **25**.
  - mcp-client: `[test-isolation] 20 files: 13 shared, 7 isolated` → **8**.
  - All three exactly match the claimed baseline (`126 / 25 / 8`, identical to `origin/main` @
    `c992ae9` per the task record).
- `scripts/__tests__/isolated-runner-parity.test.ts` — read but not independently re-executed in
  isolation (it runs as part of the `test:scripts` 584/0 pass, see below).

### DEBT-05 — naming residuals — **PASS**

- `bunfig.toml` header: "Bun configuration for massa-ai" (not "MCP RLM Mem0") — confirmed by
  direct read.
- `packages/core/create-3072d-table.ts` and `create-progress-memory.ts` no longer exist at the
  package root; both now live at `packages/core/scripts/{create-3072d-table.ts,
  create-progress-memory.ts}`, alongside the pre-existing `check-indexes.ts` precedent —
  confirmed by directory listing.
- `rg 'create-3072d-table|create-progress-memory' --glob '!.specs/**' .` → 0 hits — confirmed
  live.

---

## Task-level findings (T16–T22)

| Task | Status | Evidence |
|---|---|---|
| T16 | PASS | `AD-010` recorded at `.specs/project/STATE.md:546`, before the rename (`2380615` precedes `2e6c16d`). Supersession annotations independently found in **all four** referenced files: `repo-rename-massa-ai/{design,spec}.md` and `project-identity-rename/{design,spec}.md`, each containing `**Superseded by AD-010**`. `AGENTS.md` checked — no `plan_challenge:`/`persona_router:`/`conversation_feedback:` block was introduced (confirmed by reading root `AGENTS.md`; it is the global one, not project-local, and unmodified in this diff). |
| T17 | PASS | Zero-`RLM_` gate reproduced clean; `turbo.json` 10/10; rename-completeness spot-checked across `.env.example`, `docker-compose.yml`, `install.sh`, `CLAUDE.md`; discrimination mutation killed twice (grep gate + dedicated test). |
| T18 | PASS | oxlint pinned exact version, correctness-only ruleset, `bun run lint` exit 0/0 diagnostics on the tree, mutation-killed by `lint-gate.test.ts`. The "zero source changes" → "all 337 fixed, correctness stays at error" supersession is recorded in `tasks.md` T18 and `design.md` "TASK-018 — scope amended by the spec owner during Execute," with the *reason* stated (downgrading to `warn` would have been a gate that reports but never enforces) — this is a real supersession record, not a silently dropped commitment. |
| T19 | PASS, with Gap #1/#2 above | Merge-logic math independently re-derived and confirmed against real, freshly-generated Bun lcov output (see dedicated section). `bunfig.toml` coverage flag removed; `check-coverage.ts` exists with floor+exclusions as executable data. **The one item I could not close: zero test coverage of the merge script itself, and it is not CI-wired** — flagged as Gap #1, a residual risk this report does not consider resolved by the task's own "Done when" checklist, because that checklist never required a test for the script (`Tests: none (config)` in `tasks.md`, an artifact of the task's original small-config framing that the Execute-phase divergence — turning it into a 477-line algorithm — outgrew without the test requirement being revisited). |
| T20 | PASS | Shared module confirmed; group counts 126/25/8 independently reproduced (see DEBT-04 above); the 27 new facade-forwarding tests confirmed added to the **pre-existing** `contextual-search-rlm-coverage.test.ts` (243 lines at `c992ae9` → 764 lines at HEAD, 14 → 41 `test(` blocks, +27 exactly) rather than a new file, and confirmed the file still classifies as `module mock`-isolated (13 `mock.module(` calls) so it was never going to add a 127th group either way. |
| T21 | PASS | `bunfig.toml` header, script relocation, and stale-reference grep all confirmed live (see DEBT-05). |
| T22 | PASS, with Gap #2 above | Skip-ci marker check reproduced: `git log c992ae9..HEAD --format='%H%n%B' \| grep -ci "skip.ci"` → **0**. `bun run lint` (exit 0), `bun run type-check` (6/6), `bun run build` (5/5), `bun run test:scripts` (584 pass / 0 fail, exit 0) all independently reproduced live. CHANGELOG `### Changed`/`### Added`/`### Fixed` entries present and substantively accurate except the exclusion-count error (Gap #2). `mcp-client` pre-existing-failure claim independently reproduced (see below). |

---

## Claim 3 (T19 coverage-merge correctness) — independent re-derivation

This is the item flagged as highest-risk, and I treated it as the center of gravity for this
report.

**What I did, concretely (not a re-read of the design doc's own numbers):** ran
`packages/core`'s isolation runner with `--coverage` against real product source, isolated to just
the one dedicated-DB test file that genuinely instruments
`packages/core/src/services/graph/graph-queries.ts`
(`src/__tests__/graph-queries.test.ts`, 17 tests, DB-gated), and separately against two unrelated
unit-test groups (`context-controller-coverage.test.ts`, `search-session-hook.test.ts`) that
import the same file only transitively. This generated fresh, real lcov — not reused from any
stale directory (none existed; `coverage/` is gitignored and was empty at the start of this
verification).

Results, read directly from the generated `lcov.info` files:

- Genuine-instrumenting group: `FNF:24 FNH:24`, 220 `DA:` records, all 220 with `hits > 0`.
- Each transitive-import group: `FNF:11 FNH:0`, 377 `DA:` records, only 14 with `hits > 0`
  (module-level statements executed at import time; zero function bodies).
- Verified `deep − shallow = ∅` (every one of the 220 real-instrumenting group's line numbers is
  present in the 377-line transitive-import group's line set) via `grep -Fxv -f`, after an initial
  `comm`-based check gave a false positive from a numeric/lexicographic sort mismatch — caught and
  corrected before trusting the result.
- Fed the three real lcov fragments (1 deep + 2 shallow) through the actual, unmodified
  `parseLcov`/`mergeInto`/`linePercent` functions imported live from `scripts/check-coverage.ts`:
  **result 220/220 = 100.00%**, matching the design doc's claimed outcome exactly.
- Then mutated `mergeInto`'s comparison (`scripts/check-coverage.ts:304`, `<` → `>`, i.e. select
  the *larger*, degenerate set instead of the smaller, real one) and re-ran the same three
  fragments through the mutated function: **result 377 executable / 220 covered = 58.36%** — this
  reproduces the exact `220/377 = 58.4%` false-failure number the design doc cites as the
  *original* bug, to within rounding. The mutation was applied to the real source file, the probe
  was run against it live, then the file was reverted byte-for-byte (`diff` confirmed identical,
  `git status` confirmed clean).

**Conclusion on the documented case**: confirmed, not merely re-read. The fix is real and its
justification is empirically accurate for the representative file the design doc cites.

**Residual, unresolved risk (asked for explicitly in the task, and I could not rule it out):**
`mergeInto` does not merge per-line; it swaps the *entire* `executable` `Set` to whichever group
reported fewer total lines (`check-coverage.ts:303-306`). This is safe *if* Bun's coverage
granularity for a given file is binary per test-run-process — either the whole file gets full,
real per-statement treatment (because at least one function in it was called) or the whole file
gets degenerate raw-line treatment (because none was) — which is what I observed in every case I
was able to construct. I attempted, but did not find, a real "partially-real" case in this
codebase's actual test architecture: every shared-file pair I checked across two genuinely
function-invoking groups (`memory-controller.ts`, `embedding-service.ts`,
`memory-graph.service.ts`, `memory-repository-pg.ts`, `graph-queries.ts`) turned out to be either
`FNH:0` (pure mock, both groups) or the single dedicated DB test with `FNH==FNF`. This codebase's
test shape is heavily bimodal — `mock.module()` isolation groups that invoke nothing real, versus
DB-integration groups that exercise most/all of a repository class's public surface — which likely
explains why I could not construct the adversarial case. **If** a future file were covered by two
*different* real (function-invoking) groups that each call a strict, non-overlapping subset of
that file's functions, and Bun's degenerate/precise split turned out to be per-function rather than
per-file, `mergeInto`'s whole-set swap could in principle pick a smaller, non-fully-real executable
set from one group and silently drop legitimate context from the other, *under*-counting the
denominator and *over*-reporting the percentage for a file that is not actually fully tested. I am
reporting this as an **unverified residual risk**, not a confirmed defect — I could not construct
it, and the codebase's actual test shape argues against it arising in practice, but I did not prove
it cannot happen.

---

## `env.ts` exclusion — additional finding (judged not fully accurate)

Independently ran `packages/shared`'s coverage (`bun test --coverage --coverage-reporter=lcov`,
scratch `XDG_CONFIG_HOME`, 207 pass / 0 fail — matches the recorded T17 baseline). `env.ts`'s lcov
record: `LF:36 LH:32` — confirms the exclusion's stated 88.89% (32/36) exactly. The four zero-hit
lines are **26, 61, 69, 82** (verified by reading every `DA:` record).

The exclusion's stated reason (`check-coverage.ts:140-160`) attributes all four to "config->env
seeding branches... for DATABASE_URL, OLLAMA_API_KEY and MASSA_AI_API_KEY" (three named vars). This
is only 3/4 accurate:

- Lines 61 (`DATABASE_URL`), 69 (`OLLAMA_API_KEY`), 82 (`MASSA_AI_API_KEY`) — genuinely are the
  described seeding branches, genuinely gated on the frozen-`CONFIG_DIR` reasoning given.
- Line 64 (`MASSA_AI_LLM_API_KEY` — a *fourth* seeding branch the comment does not name at all) is
  **not** in the uncovered set; it is covered (`DA:64,52`, hit 52 times).
- Line 26 — `dir = parent;` inside `findEnvFile()`'s directory-walk loop — is not a config→env
  seeding branch at all. It is uncovered only because every test in this checkout finds a `.env`
  on the first directory it checks, so the loop's second iteration never runs. Unlike the other
  three, this branch has nothing to do with `CONFIG_DIR` or `config.json`, and appears testable
  in-process (e.g., by mocking `fs.existsSync`/`process.cwd()`) without any of the process-boundary
  obstacles the comment describes for the other three.

Net: the 88.89%/32-36 **arithmetic is correct**, the exclusion **as a whole remains defensible**
(3 of 4 gaps genuinely need the reasoning given), but the **written justification misdescribes one
of its own four lines**, which weakens exactly the "executable data with the justification that
earned it" premise this script's header states as its reason for existing.

---

## Discrimination-sensor summary (all mutations applied to real source, then reverted; `git
status` confirmed clean before and after every mutation, and again at the end of this session)

| # | Mutation | Target | Expected | Observed | Result |
|---|---|---|---|---|---|
| 1 | `mergeInto`: flip `<` to `>` in the executable-set-size comparison | `scripts/check-coverage.ts:304` | Gate goes red on real data | Reproduced the documented 58.36% false-failure exactly, via a live probe importing the real (mutated) functions against real captured lcov | **No automated test caught this — none exists.** The manual probe is the only thing that caught it. Confirmed by repo-wide grep: nothing imports `check-coverage.ts`; it is absent from every CI workflow. |
| 2 | `.oxlintrc.json`: `correctness` → `"warn"` | lint gate | `scripts/__tests__/lint-gate.test.ts` goes red | `expect(runLint()).not.toBe(0)` failed with "lint did not fail on a seeded no-dupe-keys violation" (exit 0 with the violation present) | **Killed.** |
| 3 | `contextual-search-rlm.ts`: swap `query`/`projectId` arguments in the `applySynapseStateImpl(...)` call | `services/search/contextual-search-rlm.ts:288-295` | facade-forwarding tests go red | 2 of the coverage-test file's tests failed with an explicit ordering diff (`"proj-syn"` vs `"q-syn"` swapped in the assertion) | **Killed**, by `contextual-search-rlm-coverage.test.ts`. |
| 4 | `config/index.ts`: revert `MASSA_AI_LLM_ENABLED` → `RLM_LLM_ENABLED` at one call site | `packages/shared/src/config/index.ts:575` | zero-`RLM_` grep gate and `llm-env-prefix.test.ts` go red | grep found the reintroduced literal; 2 of 3 `llm-env-prefix.test.ts` tests failed with explicit true/false mismatches | **Killed twice over.** |
| 5 | `assertDedicatedDatabase`'s host/db regex | `scripts/check-coverage.ts:362` | n/a — not run as a live mutation | Not separately mutated (redundant with #1's finding: nothing imports this file, so no test could catch a regex change here either) | **Same "no test exists" gap as #1**, not independently re-demonstrated to save time. |

**Net discrimination result**: 3 of the 4 executed mutations were caught by a real, existing test.
The coverage-merge algorithm — the single highest-risk piece of code in this PR by the task's own
framing — has **no test coverage at all**, and its regression sensor (mutation #1) survives every
gate in the repository. This is the most important finding in this report.

---

## Known-honest facts — confirmed independently, not re-litigated

- **Core merges 122 lcov files for 126 groups, 4 legitimately empty**: not independently
  re-derived end-to-end (would require the full ~15 min core run); accepted from `check-coverage.ts`'s
  own documented reasoning (`4 groups either skip behind their own opt-in flag or import no product
  source`), which is internally consistent with the group-discovery numbers I did independently
  confirm (126 total groups, 99+125 split).
- **`mcp-client`'s `embedded-api-client-endpoints.test.ts` fails under plain `bun run test`,
  passes under a scratch config dir, and is pre-existing at `c992ae9`** — independently
  reproduced, with a nuance: it is **flaky at both commits**, not deterministically red.
  - At HEAD (this branch), plain `bun test` (no scratch config): failed 93/2 twice in a row.
  - At `c992ae9` (separate worktree `/Users/luizmassa/Projects/massa-ai`, real config, real
    `llm.enabled: true`): run 1 passed 95/0, run 2 failed 92/3 — i.e., it reproduces at the base
    commit too, but intermittently rather than every single time. This still supports the
    task record's core claim (pre-existing, not introduced by this branch) but "fails identically"
    is a slight overstatement of determinism; the fairer characterization is "the same
    load-dependent live-provider leak exists at both commits."
  - Scratch-config-dir run at HEAD: 95/0 pass, twice, confirming the fix's effectiveness at
    isolating this specific test from the leak.
- **`test:scripts` flake (583/1 vs 584/0)**: reproduced once live — **584 pass / 0 fail, exit 0**.
  Did not reproduce the 583/1 anomaly in this session; treated as a flake per the task's own
  instruction, since a single non-reproducing failure with no observed repeat is not enough to
  call it a defect.

---

## Not independently verified (said explicitly rather than assumed)

- The exact 3 (code) + 7 (NL-judgment) = 10 LLM call-site count in `CLAUDE.md:251-252` — I found
  7 distinct `modelRole` usage sites via source grep but did not fully enumerate every
  `llm.object(`/`llm.complete(` call to independently reconstruct the 3/7 split end-to-end.
- Whether `.github/workflows/ci.yml`'s `build` job literally invokes `bun run lint` (I verified the
  *mechanism* works via mutation, but did not diff the CI YAML line-by-line against the claim).
- The full 15-minute `bun run test:coverage` run against the dedicated DB was not re-executed by
  me end-to-end; I used the task's own sanctioned faster alternative (re-deriving the merge logic
  against freshly-generated real lcov) for claim 3, and trust the `tasks.md`-recorded PASS output
  at `2dac830` for the "did the full gate actually go green once" question.
- The residual coverage-merge risk described above (partial per-function degeneracy) — flagged as
  unverified, not ruled in or out.

---

## Ranked gap list

1. **(Medium-high) `scripts/check-coverage.ts` — the highest-risk file in this PR — has zero
   automated test coverage and is wired into no CI workflow.** Demonstrated concretely: a
   one-line revert of the exact bug this PR fixed passes every gate in the repository silently.
   Recommendation: add a unit test file (e.g. `scripts/__tests__/check-coverage.test.ts`) that
   feeds `parseLcov`/`mergeInto`/`linePercent` synthetic or fixture lcov records covering (a) the
   deep-vs-shallow case this report reproduced, (b) a file split across two real groups, (c) the
   `isMeasuredSource` exclusion boundaries — and wire `bun run test:coverage` (or at least these
   unit tests) into CI.
2. **(Low) `CHANGELOG.md`'s coverage-gate entry says "nine documented exclusions"; the actual,
   current count is 11.** Trivial fix, but currently wrong in the one document meant to be the
   external-facing source of truth for what the gate covers.
3. **(Low) `env.ts` exclusion's stated reason misattributes one of its four uncovered lines**
   (line 26, `findEnvFile()`'s walk-up branch, is not a config→env seeding line and looks
   independently testable without the CONFIG_DIR obstacle the comment cites for the other three).
   Does not change whether the exclusion is warranted overall (88.89% still fails the 90% floor
   either way), but the causal narrative is not fully accurate.
4. **(Informational) `api-key.ts` exclusion comment says "21 call sites"; actual count is 18.**
   Non-load-bearing — the underlying claim (all calls go through `runIsolated`) holds.
5. **(Informational, residual/unverified) The coverage-merge algorithm's whole-set-swap could in
   principle over-report coverage for a file split across two "partially real" instrumenting
   groups** if Bun's precise/degenerate coverage split is per-function rather than per-file. Not
   observed in this codebase; not ruled out theoretically.

## Residual risk

The gate that DEBT-02 exists to make trustworthy (`bun run test:coverage`) is itself the least
tested piece of code shipped in this PR. Every other requirement in this PR (DEBT-01, 03, 04, 05)
has a discriminating test that this report independently confirmed kills a real mutation of the
behavior it protects. DEBT-02's core algorithm does not, and this report's own mutation attempt is
the only thing in the repository that would have caught a regression of the exact bug T19 exists
to fix. This is the residual risk this report is least comfortable calling fully closed.

## Exact next step

Add unit tests for `parseLcov`/`mergeInto`/`linePercent`/`isMeasuredSource` in
`scripts/check-coverage.ts` (or a co-located `scripts/__tests__/check-coverage.test.ts`), covering
at minimum: the deep/shallow merge case this report reproduced with real fixture lcov, a two-group
partial-split case, and the exclusion/threshold boundary. Then decide whether `bun run test:coverage`
(or these new unit tests alone, given the full gate's 15-minute cost and DB dependency) should be
wired into `.github/workflows/ci.yml`.
