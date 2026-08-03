# DA Inventory Closure Specification

- **Slug:** `da-inventory-closure`
- **workflowSessionId:** `spec-da-inventory-closure`
- **Workflow:** spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute + independent validation)
- **Source:** `.specs/reports/cross-pollination-portability-and-gaps.md` (folder removed at close-out per the user's instruction, T10 — recover via git history) §"massa-ai defect & gap inventory (a) already documented" (DA-01..DA-17) plus the DA-14 and STATE-coverage bullets in §"Ambiguities and residual risk". The report is dated 2026-07-29, written at `45daaa1`.
- **Spec baseline:** every DA row **re-measured at `8e63477`** (v1.19.0, `main`) on 2026-08-03, in the `spec/da-inventory-closure` worktree, via plain `/usr/bin/grep`/`sed`/`ls`/`gh api`/direct suite runs — never rtk-filtered output (rtk rewrites numbers and paths; anything cited as proof below was taken raw). The report is input, not authority; this spec's re-measured statuses win where they differ.
- **Process requirements from the user (this session):** commit the `.ua/` data files; verify the `.gitignore` premise; remove `.specs/reports/` as the final development step; one PR.

## Problem Statement

The cross-pollination report's DA table catalogued 17 already-documented defects and gaps. The
report is a week stale: several rows were fixed by features that merged since (`T24`/`T35`
test-strength work, BEH-01, the core-layering umbrella, subagent parity), several remain live
(the LLM seam core never exported to `apps/`, the shared-barrel eager config read with no
isolation rule, the absent measurement-discipline rule), and one registry entry contradicts the
tree outright. Each row needs exactly one evidenced disposition — fix here, already-resolved,
routed, or accepted — so the inventory stops being an open list, and the report itself can then
be deleted per the user's instruction.

## Re-verified status of DA rows (2026-08-03, `8e63477`)

Disposition legend: **FIX** = fix in this feature · **RESOLVED** = already fixed elsewhere, evidence recorded, no-op · **ROUTED** = owned by another in-flight feature · **ACCEPTED** = explicit trade-off, written down.

| Row | Status at `8e63477` (measured evidence) | Disposition |
|---|---|---|
| DA-01 (embedded test / LLM seam) | LIVE — `CLAUDE.md:176` "Known outstanding case" paragraph still present; `_setLlmEnabledForTesting` defined at `packages/core/src/services/memory/llm-client.ts:129` (and `_setJsonSchemaSupportedForTesting` at `:107`) but absent from `services/index.ts` (0 grep hits) and from `packages/core/src/index.ts` (0 "llm" hits), so `apps/` cannot reach it; `embedded-api-client-endpoints.test.ts` constructs `EmbeddedApiClient` directly with no config seam | **FIX — DI-01** |
| DA-02 (DEBT-02 coverage opt-in) | RESOLVED v1.9.0 — `package.json:22` `"test": "turbo run test"` carries no coverage; `:31` `"test:coverage": "bun scripts/check-coverage.ts"` is the separate gate | RESOLVED |
| DA-03 (coverage.yml not blocking) | RESOLVED — `gh api repos/luizgmassa/massa-ai/rules/branches/main` returns required checks `["build","mcp","validate","Structural native tests (darwin-arm64)","Structural native tests (linux-x64)","coverage"]`; `coverage` present | RESOLVED |
| DA-04 (L-006 CodeQL PR-gate behavior) | UNCHANGED and unfixable in-repo — CodeQL runs from GitHub default setup (no `codeql*.yml` among the 6 workflow files); the gate's moved-line behavior is the platform's. Lesson L-006 stays candidate (recurrence 1) by pipeline design | ACCEPTED (process gotcha; lessons pipeline owns promotion) |
| DA-05 (L-001 UNION GUARD missing-suite sensor) | PARTIAL — `unionGuardCheck` is now exported (`run-tests-parallel.ts:200`) and directly unit-tested for both `missing` (`run-tests-parallel-coverage.test.ts:164`) and `extra`/phantom (`:171`) branches, plus a T24 crash E2E test (crash → failed, ZERO-LOSS). What remains unsensed is the **call-site wiring**: deleting `return 1` under `guard.missing` at `run-tests-parallel.ts:315` is invisible to every existing test (a method test is not a call-site test) | **FIX — DI-02** |
| DA-06 (L-002 hook POST assertions) | RESOLVED — `apps/claude-plugin/hooks/__tests__/massa-ai-hook.test.ts` now runs a local HTTP capture server (`:38-72`) recording URL path, headers and parsed JSON body; asserts "pre-compact does TWO POSTs (observation + snapshot, different body shapes)" (header contract `:5-9`); 66 fetch/POST/body assertion-relevant hits | RESOLVED |
| DA-07 (L-003 M25 name-tail 0 behavior tests) | RESOLVED — T35 added `describe("T35 M25: project name-tail resolution (behavior)")` (`m25-m26-resolution-serialize.test.ts:146`) with a mocked `listWorkspaces` row set (`:110`) covering match-by-tail and match-by-id paths | RESOLVED |
| DA-08 (L-004 N20 false-premise crash test) | RESOLVED — the T24 rewrite documents the old false premise in its own header ("DB-dependent tests skip gracefully, so `DATABASE_URL=\"\"` does NOT make them fail", `run-tests-parallel.test.ts:20-21`) and injects a genuinely-failing probe (`process.exit(1)`, `:33`) instead | RESOLVED |
| DA-09 (L-005 json_schema threshold uncovered) | RESOLVED — direct `_checkJsonSchemaSupport` tests exist at `llm-client-json-schema.test.ts:131-193` covering 0.5.0 boundary, 0.4.9 below-threshold, and further version shapes; matches the report's own "confirmed independently fixed per the wave-7 digest" note | RESOLVED |
| DA-10 (SQLRFU-002 frozen fixture hash) | UNCHANGED by design — `sqlite-removal-followup` is `in_progress` in `FEATURES.json` with the deferral recorded as non-gating | ROUTED (that feature owns it) |
| DA-11 (subagent-skills-plugin-parity "Specify-only") | REGISTRY STALE — `FEATURES.json` says `in_progress` with design/tasks/execute `"pending"`, but `.specs/features/subagent-skills-plugin-parity/` holds all four artifacts; `validation.md` records an independent verifier PASS dated 2026-07-23 over `bc57daa..80994eb` (13 commits, T1–T12 all Done). The work shipped and later grew 12 → 17 specialists | **FIX — DI-03** (registry correction) |
| DA-12 (PR-B in progress / R-08 open) | RESOLVED — `core-layering-god-module-split` is `complete` in `FEATURES.json` ("Umbrella over four PRs… PR-B merged #53 v1.16.0; PR-C #59 v1.17.0; PR-D" #60 v1.18.0); R-08's "where do cross-cutting modules live" is answered in the shipped contract: the `kernel/` tier, 11 modules, no allowlist (`packages/core/src/index.ts` header + `CLAUDE.md` §Architecture) | RESOLVED |
| DA-13 (load-dependent flakes, do-not-chase) | ACCEPTED and already written — guidance verbatim at `STATE.md:2235-2238` ("Do not chase them; re-run the package alone and say so rather than claiming a clean parallel aggregate"); all three named members still exist. DI-01 removes the root cause of one member (`embedded-api-client-endpoints`) | ACCEPTED (already documented; DI-01 shrinks the set) |
| DA-14 (`includePersistent` "inert" vs CHANGELOG) | RESOLVED IN CODE, STALE IN STATE — the five-minute look was taken: `memory-controller.ts:281` defaults `includePersistent = true` and `:305` forwards it; `memory-repository-pg.ts:236-238` applies `level <> PERSISTENT` when `false` (its comment narrates the fix); `CHANGELOG.md:734-741` ([1.9.1], BEH-01) documents the behavior change. The "inert" note at `STATE.md:2308` is a carried-forward claim its own feature later fixed (STATE:2042 lists BEH-01 in the same feature's scope). Not two call sites: `context-controller.ts:376` merely passes constant `true` | **FIX — DI-04** (annotate the stale STATE note; docs-only) |
| DA-15 (no isolation rule for `@massa-ai/shared`) | ~~LIVE — 0 isolation-rule hits in either runner~~ **RESOLVED — struck at Design (D0): the fix shipped before the report was written, at a different surface than the report proposed.** `scripts/lib/run-tests-isolated.ts` `buildChildEnv` (`:79-109`) gives **every** spawned group (shared aggregate and isolated alike, single spawn site `:323`) a scratch `XDG_CONFIG_HOME`, strips `MASSA_AI_LLM_*`, and pins `MASSA_AI_LLM_ENABLED=false` — SEN-03, commit `39afe59`, contained in v1.10.0; direction-complete unit suite `scripts/__tests__/runner-child-env.test.ts`. Re-measured live: mcp-client wrapper under real config → PASS all 8 groups. The barrel's eager config read (probe: parse attempt at `dist/config/index.js:233` + module-level init; 94 importing files) is real but reaches only a scratch dir under every wrapper run; the un-hermetic surface is the **direct** `bun test <file>` invocation, which is intentional and is DI-01's subject. The report inherited STATE's stale carried-forward note without re-measuring — the same defect shape as DA-14 | RESOLVED (SEN-03; ~~DI-05~~ withdrawn — its STATE-note clause moved into DI-04) |
| DA-16 (three tree-sitter env failures) | REPRODUCED, DIAGNOSED, REPAIRED THIS SESSION — fresh worktree `bun install` under PATH Node 25.9.0 on macOS arm64 exits **0** while node-gyp silently fails (the documented clang break), leaving no `build/Release/*.node`; `test:scripts` then fails exactly 3 suites ("native Tree-sitter package contract", `No native build was found`) — 1227 pass / 3 fail. Copying the 4 built `build/` dirs from the provisioned main checkout turned the suite 9 pass / 0 fail. The class is a **worktree-provisioning gap with a silent install**, not a test defect | **FIX — DI-06** (document the provisioning rule + named repair; docs) |
| DA-17 (measurement-methodology recurrence) | LIVE — `CONTRIBUTING.md` has 0 hits for measurement/cached-result language; the class recurred ≥4 recorded times and twice again **during this session's own triage** (a `tail` pipe masked `test:scripts` exit 1 — the wrapper reported its own exit code; and a `tail -6` cut the pass/fail split off a suite summary) | **FIX — DI-07** (standing rule in CONTRIBUTING, linked from CLAUDE.md) |

**STATE-coverage bullet (report §Ambiguities):** the report never re-read `STATE.md` lines ~600-1106. This triage read the sections those lines feed (`Active — PR-D` block, `Audit Remediation`, Decisions) directly at HEAD; no DA-relevant claim was found to depend on the unread span beyond DA-14's note, which is measured above. Recorded as covered-by-measurement, not by re-reading the historical prose.

## Goals

- [ ] Every DA row carries exactly one disposition with evidence at `8e63477` (table above) — DONE at Specify.
- [ ] DI-01: core exports its LLM test seam; the embedded-endpoints suite pins it and passes under a real user config; CLAUDE.md's "Known outstanding case" paragraph replaced by the new state.
- [ ] DI-02: the UNION GUARD missing-path **wiring** has a discriminating test (observed red on the wiring mutation before close).
- [ ] DI-03: `FEATURES.json` reflects `subagent-skills-plugin-parity` reality (complete, phases done, note citing validation).
- [ ] DI-04: the stale `STATE.md:2308` "inert includePersistent" note is annotated resolved with the BEH-01 evidence chain.
- [x] ~~DI-05: hermetic config dir in the shared runner~~ — withdrawn at Design D0: already shipped as SEN-03 `39afe59` (v1.10.0), every group hermetic, unit-tested both directions; re-measured green this session. Goal closes as RESOLVED, not as work.
- [ ] DI-06: worktree-provisioning rule for native grammars documented (CLAUDE.md), with the silent-install trap and the named repair + verify command.
- [ ] DI-07: "Measurement discipline" section in CONTRIBUTING.md; CLAUDE.md links to it.
- [ ] DI-08: lessons pipeline updated **via `lessons.py` only** — recurrence/closure observations for L-001 (subject fixed here) and the subjects independently fixed (L-002..L-005), per the tool's own semantics; `lessons.json` never hand-edited.
- [ ] DI-09: `.ua/` data files committed (tracked modifications + `diff-overlay.json`); the `.gitignore` premise verified false and recorded; the credential-shaped `tmp-dashboard-token.txt` and `.trash-*` dirs left uncommitted with the reason written down.
- [ ] DI-10: `.specs/reports/` removed (`git rm -r`) as the final development step; every in-repo pointer to it repointed first (sweep by content, not memory).
- [ ] DI-11: CHANGELOG entry present; one PR; per-task commits.

## Out of Scope

| Item | Reason |
|---|---|
| `skills-directive-dedup` branch (T6–T12) | Parked at user instruction (T5/12); explicitly not this feature's to touch — route only |
| SQLRFU-002 fixture hash | Owned by `sqlite-removal-followup` (DA-10 ROUTED) |
| CodeQL gate behavior change | Platform-owned (DA-04 ACCEPTED) |
| Chasing DA-13's remaining flake members beyond DI-01's root-cause removal | The documented guidance is the accepted trade-off; re-litigating it is not closure |
| Making `bun install` fail loudly on native-build failure | Upstream bun/node-gyp behavior; DI-06 documents the trap instead (changing install semantics risks CI) |
| Lazy-loading the shared config singleton | Blast radius across every consumer; SEN-03's hermetic child env already closes the test-runner exposure (D0), and the barrel's design is not this feature's subject |
| Promoting lessons by hand | `lessons.py` owns state transitions; DI-08 records observations only |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| DI-01 seam surface | Export `_setLlmEnabledForTesting` (+ `_setJsonSchemaSupportedForTesting` for symmetry) through `services/index.ts` → core barrel | Precedent: `__setAuthKeyForTests` (tools-api), `reset*()` factory pairs are already public-for-tests; underscore prefix marks intent | assumption |
| DI-01 sufficiency | Pinning LLM-enabled false fixes the 5001 ms class for `/search/project` + `/search/code`; if a live embedding path remains, use the already-exported `resetVectorStore`/factory seam in the same suite | CLAUDE.md names the missing seam as *the* blocker; measured before close (observed green under real config) | assumption — measured in Execute |
| DI-02 mechanism | A test-only injection env var (e.g. `_PARALLEL_DROP_RESULT=<suite-id>`) read by `run-tests-parallel.ts` main path, dropping one result pre-guard; test drives the script end-to-end and asserts exit 1 + "UNION GUARD FAIL" naming the id | L-001's own ask is a mock-drop test of the wiring; repo idiom `_set*ForTesting`/`_DETERMINISTIC_ONLY` supports explicit test seams; an AC that names a mechanism demands that mechanism | assumption |
| ~~DI-05 shape / fallback~~ | Withdrawn at Design D0 — SEN-03 (`39afe59`, v1.10.0) already gives **every** group (not just non-DB children) the scratch config home plus the `.env`-leak pin, which is strictly stronger than the shape assumed here; `runner-child-env.test.ts` asserts both directions incl. `DATABASE_URL` pass-through | The assumption row is kept struck so the withdrawal has a visible reason at the site that carried it | superseded (D0) |
| DI-06 placement | CLAUDE.md "Running tests"/worktree context gains the provisioning paragraph; HANDOFF env facts updated for this session's worktree | CLAUDE.md already owns the Node-22 helper trap; this is its worktree corollary | assumption |
| DI-07 content | Distill the four recorded recurrences + this session's two: verify instruments in the tracked state they ship in; read the pass/fail split, never the pass count; a cached/turbo-replayed/wrapper-reported result is not a measurement; print population beside verdict; re-derive figures from inputs, never from the figure being amended | The rule must name the shapes that actually recurred here, not generic advice | assumption |
| DI-08 semantics | Use `lessons.py observe`/`add` per its CLI contract read at Execute; if the tool's dedup treats a same-key `add` from a new feature as recurrence, that is the recurrence record for L-001; otherwise record observations and leave promotion to the tool | Never hand-edit lessons.json; never fabricate recurrence the tool's rules don't support | assumption |
| DI-09 exclusions | `tmp-dashboard-token.txt` (33 B, credential-shaped; the permission classifier independently blocked even reading it) and `.ua/.trash-*` (30 MB transient deletion-staging; one is status-invisible because its contents match `.gitignore`'s `tmp/`) stay uncommitted | Publishing a live token to a public-releasing repo is the irreversible class that needs explicit user say-so; trash is not data | user attention flagged in PR + final report |
| DI-10 sweep | Before `git rm -r .specs/reports/`, sweep tracked files for references to `reports/` paths by content; repoint or annotate each (LESSONS evidence fields, feature specs, HANDOFF/STATE) so no tracked pointer dangles | A repoint can delete its own sweep's subject; sweep from the artifact, not memory | assumption |
| `.gitignore` premise | User asked to "remove .ua from .gitignore"; measured: `git check-ignore` exit 1 on `.ua/` paths — **nothing in `.gitignore` ignores `.ua/`**, so there is nothing to remove; recorded here rather than silently skipped | Measure the premise before acting on it | measured, y |

**Open questions:** none blocking.

## Acceptance Criteria (per fix requirement)

### DI-01 — LLM seam exported to apps/ (P1)
1. WHEN `apps/` code imports `@massa-ai/core` THEN `_setLlmEnabledForTesting` (and `_setJsonSchemaSupportedForTesting`) SHALL be importable from the package root barrel.
2. WHEN `embedded-api-client-endpoints.test.ts` runs under a **real** user config (`llm.enabled=true`, no `XDG_CONFIG_HOME` override) THEN the previously-failing "routes without 404" cases for `/search/project` and `/search/code` SHALL pass within the 5 s default budget (measured both configs; both green).
3. WHEN the suite finishes THEN the seam SHALL be restored (`null`) so no cross-suite state leaks (the runner isolation classes still apply).
4. CLAUDE.md's "Known outstanding case" paragraph SHALL be rewritten to the new state (seam exported, suite pinned), and DA-13's flake-set note left accurate.

### DI-02 — UNION GUARD wiring sensor (P1)
1. WHEN the drop seam is set to a suite id present in the filtered list THEN the runner SHALL exit 1 and print `UNION GUARD FAIL` naming that id (end-to-end child-process test).
2. WHEN the seam is unset THEN behavior SHALL be byte-identical to today (control case; seam read is a single guarded branch).
3. Observed red first: with the seam test written, the wiring mutation (delete the `missing` branch's `return 1`) SHALL flip it red; restore SHA-verified; recorded in tasks.md.

### DI-03 — registry truth (P2)
1. `FEATURES.json` `subagent-skills-plugin-parity` SHALL read `status: "complete"`, phases all `true`, with a note citing `validation.md` (2026-07-23, `bc57daa..80994eb`) and the later 12→17 growth.
2. No other entry SHALL change.

### DI-04 — STATE note annotated (P2)
1. The `STATE.md:2308` carried-forward bullet SHALL be annotated (strike + resolution) citing BEH-01/[1.9.1], `memory-controller.ts:281,:305`, `memory-repository-pg.ts:236-238` — the DA-14 disambiguation, written where the stale claim lives.
2. The companion carried-forward clause about the missing `@massa-ai/shared` isolation rule SHALL be annotated as superseded by SEN-03 `39afe59` (v1.10.0) with the D0 evidence.

### ~~DI-05 — hermetic runner config~~ (withdrawn at Design D0)
The requirement's outcome already holds on `main` via SEN-03 (`39afe59`, v1.10.0): every
spawned group receives the scratch config home and the LLM-env pin, asserted by
`scripts/__tests__/runner-child-env.test.ts` and re-measured green this session (mcp-client
wrapper PASS all 8 groups under a real user config). No work ships under this ID; DA-15's
closure evidence lives in the Re-verified table and D0.

### DI-06 — provisioning rule (P2)
1. CLAUDE.md SHALL document: fresh-worktree `bun install` on macOS arm64 under Node 25 exits 0 with **no native build** (silent node-gyp failure); the named repair (copy `node_modules/tree-sitter*/build/` from a provisioned checkout, or install with a Node 22 helper); and the verify command (`bun test ./scripts/tests/verify-tree-sitter-grammars.test.ts` → 9 pass).
2. The paragraph SHALL state the failure signature verbatim (`No native build was found for platform=… runtime=node`) so the next reader greps straight to it.

### DI-07 — measurement discipline (P2)
1. CONTRIBUTING.md SHALL gain a "Measurement discipline" section covering, at minimum: tracked-state verification of instruments; pass/fail-split reading; cached/turbo-replayed/pipe-wrapped results are not measurements; population printed beside verdict; corrections recomputed from inputs.
2. CLAUDE.md §Working conventions SHALL link to it (single source, link-not-restate).

### DI-08 — lessons via the tool (P2)
1. Every lessons mutation SHALL go through `lessons.py`; `git diff` on `lessons.json` SHALL be tool-shaped output only.

### DI-09 / DI-10 / DI-11 — process
1. `.ua/` tracked modifications + `diff-overlay.json` committed; token + trash excluded with the reason in the commit body and final report.
2. `.specs/reports/` removed in the last development commit; the pre-removal content sweep and its repoints recorded in tasks.md; LESSONS evidence strings referencing report paths (if any) handled via the tool or annotated at their citing sites.
3. CHANGELOG under `[Unreleased]`: `### Added` (UNION GUARD wiring sensor, hermetic runner config, measurement-discipline section) + `### Fixed` (LLM seam export/known-outstanding closure, registry truth, STATE annotations, provisioning doc) — minor wins. No skip-ci marker anywhere in prose. `no-changelog` label MUST NOT be applied.

## Edge Cases

- DI-01: pinning must survive the isolation runner's process model — the suite is isolation-classified; the pin lives inside the suite file (beforeAll), not the wrapper, so a direct `bun test <file>` behaves identically.
- DI-02: the seam must not be readable outside tests — gate it on the env var's presence only (absent ⇒ zero-cost branch); the control case asserts absence-behavior.
- DI-10: `.specs/reports/` deletion must not orphan the two sibling reports' own cross-references — they die together in the same `git rm`.
- DI-09: if any `.ua` tracked file changes again mid-feature (dashboard running), commit the state at task time; `.ua` is generated data, not a gate subject.

## Requirement Traceability

| ID | Subject | Phase | Status |
|---|---|---|---|
| DI-01 | LLM seam export + suite pin + CLAUDE.md | Design | Pending |
| DI-02 | UNION GUARD wiring sensor | Design | Pending |
| DI-03 | FEATURES.json registry truth | Tasks | Pending |
| DI-04 | STATE annotations (DA-14, DA-15 clause) | Tasks | Pending |
| ~~DI-05~~ | ~~Hermetic runner config dir~~ withdrawn (D0 — shipped as SEN-03) | — | Withdrawn |
| DI-06 | Provisioning rule doc | Tasks | Pending |
| DI-07 | Measurement discipline section | Tasks | Pending |
| DI-08 | Lessons via lessons.py | Tasks | Pending |
| DI-09 | .ua commit + exclusions | Tasks | Pending |
| DI-10 | reports/ removal + sweep | Tasks | Pending |
| DI-11 | CHANGELOG + PR | Execute | Pending |

**Coverage:** 10 live + 1 withdrawn (DI-05), 0 unmapped. RESOLVED/ROUTED/ACCEPTED rows (DA-02/03/04/06/07/08/09/10/12/13) close at Specify with the table's evidence — no implementation phase.

## Implicit-Requirement Dimensions (Large — resolved)

| Dimension | Resolution |
|---|---|
| Input validation & bounds | DI-02 seam: unknown id ⇒ no-op, control case asserts absence-behavior |
| Failure / partial-failure | DI-06 documents the silent-install failure it cannot fix; DI-01 fallback pre-decided in design D1 |
| Idempotency | DI-03/DI-04 edits idempotent (annotate once); addon copy idempotent |
| Auth boundaries | none touched — AD-011 surface untouched; AD-014 constrains observation writers and **no observation-writing code is in any DI write set** |
| Concurrency / ordering | runner semantics untouched (DI-05 withdrawn); DI-02 seam runs in the single main pass |
| Data lifecycle | `.ua` committed as-is (generated data); token never enters git |
| Observability | DI-02 documents the drop in the run log via the guard's own FAIL output; gates keep population-beside-verdict |
| External deps | gh api used read-only for DA-03 evidence; no network in new tests (capture-server pattern stays local) |
| State transitions | FEATURES.json via approved write (DI-03); lessons only via tool (DI-08) |

## Verification Approach

- Per-task gates from `tasks.md`; every new sensor shows an observed red before its task closes.
- Full battery per behavior-changing commit: `bun run lint`, `bun run type-check`, `bun run build`, `bun run test`, `bun run test:scripts`, `bun run test:plugins`, `bun scripts/run-deterministic.ts`, `bun scripts/check-core-layering.ts`; generators `--check` only if `skills/` or generator inputs move (none planned).
- Gates this feature must keep green (validation.md of cross-pollination-ports): `check-security-allowlist`, `check-workflow-venue-parity`, `turbo-passthrough-env` drift test, `workflow-bun-cache` test, `xp02-branded-type` compile fixture.
- Design's critic-C3 invariant honored: nothing wires any `check-coverage.ts`-importing script into CI's build job (no CI edits planned at all).
- Final: independent verification-agent (author ≠ verifier) writes `validation.md`; fix→re-verify loop capped at 3.

## Discuss Summary

User pre-decisions (this session's prompt): spec-driven workflow; expected four-way disposition; delivery = fresh worktree, per-task commits, one PR, CHANGELOG per CONTRIBUTING; `.ua` commit; reports removal at end; skills-directive-dedup untouchable. massa-ai MCP server not consulted for state (`.specs/` canonical per contract). The `.gitignore` premise was measured false and is recorded rather than silently dropped; the token/trash exclusion is the one deviation from "commit everything", taken deliberately and flagged for the user.
