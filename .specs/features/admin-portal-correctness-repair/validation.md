# Admin Portal Correctness Repair — Validation Report

Verifier session (independent of the author sessions). **Re-verification, fix→re-verify
loop iteration 1 of 3**, following a FAIL from this same verifier's first pass. Worktree
`/Users/luizmassa/Projects/massa-ai-wt-admin-portal-correctness-repair`, branch
`fix/admin-portal-correctness-repair`, commit range `69c0632c..fdc55203` (18 commits, tree
clean apart from this file at validation time). Date: 2026-08-09.

## Summary

**Result**: PASS

**Spec-anchored check**: 39/39 individually-scoped ACs now match the spec's defined outcome
with direct evidence. The 6 APCR-01 ACs and 1 code-gap (APCR-01.10) that FAILed on the prior
pass are all confirmed fixed against source and re-killed by mutation this session, not
inferred from the fix commits' own tests.

**Gate**: 8 gates re-run, 8 matched the coordinator's target figures exactly (1 documented
live-provider flake in `postgres-vector-store.integration.test.ts` cleared on immediate
re-run, as expected).

**Sensor**: 3 previously-surviving mutations (#1-#3) re-run in a **fully provisioned**
scratch (see Methodology) — all 3 now **killed**. 2 fresh mutations against the newly added
`overlayOverrideCount` code — both **killed**. Total this session: 5 mutations, 5 killed, 0
survived, 0 equivalent.

---

## What changed since the FAIL verdict (fix commits, re-verified against source)

- **FG1 `6192212a`** — `scripts/__tests__/model-profiles.test.ts` gained a
  `mergeOverlay is a deep-merge delta, not a whole-object replace` describe block
  (`:703-835`) with 4 tests, including the spec's own APCR-01.3 Independent Test
  (`:733-776`, a builtin profile `B` added after the overlay was written survives the
  merge, profile A's untouched tiers are verbatim), and a
  `normalization drops byte-identical overlay entries and keeps genuine edits` describe
  block (`:842-914`) with the APCR-01.4/.5 collapse/preserve case and the APCR-01.9
  known-limitation pin. Confirmed by direct reading, not just diff stat.
- **FG2 `019f8da8`** — `overlayOverrideCount` now appears in both the `GET`
  (`apps/tools-api/src/routes/model-registry.ts:53`) and `PUT`
  (`apps/tools-api/src/routes/model-registry.ts:115`) response bodies, carried through
  `mergeRegistryForDisplay` in both its early-return and rebuild branches
  (`apps/web-ui/src/static/app.js:1619-1626`), and rendered as a compact, singular/plural-aware
  line in `renderModelRegistry` (`apps/web-ui/src/static/app.js:1130-1136`, wired into the
  output at `:1273`). Tests at both the route level (`model-registry.test.ts:145-169,
  191-207`) and the UI level (`admin-handlers.test.ts:636-685`) confirmed present and
  correctly targeted — read directly, not inferred.
- **FG3 `fdc55203`** — `tasks.md`'s 5 broken `--filter=` gate lines (T1, T2, T6, T7, T9)
  replaced with direct file invocations that actually run. Confirmed each corrected line
  executes: `bun test apps/tools-api/src/routes/project.test.ts` and the others below all
  ran clean this session.

---

## Methodology correction applied this pass

**A `git worktree add --detach HEAD` scratch has no `node_modules` and no generated
build output** (`bun run generate:artifacts`'s ~580 files are gitignored, AD-016). My first
pass's mutation-survival readings for pure functions (`mergeFlatMap`, `mergeProfile`,
`normalizeFlatMap`) were unaffected by this — they don't touch the filesystem — but
`scripts/__tests__/model-profiles.test.ts`'s one F3/shell-out test (`runCheck` diffing
generated output against checked-in state) genuinely fails on an unprovisioned scratch
regardless of mutation, which I had wrongly filed as "transient/environmental" rather than
"structurally guaranteed absent provisioning."

This session: symlinked `node_modules` (and `apps/opencode-plugin/node_modules`) from the
real worktree into the scratch, then ran `bun run generate:artifacts` inside the scratch
before any mutation. Confirmed baseline **54 pass / 0 fail** in
`scripts/__tests__/model-profiles.test.ts` before mutating (matching the coordinator's
independently-measured provisioned baseline exactly). All 5 mutations below were run against
this fully-provisioned scratch; none excluded the shell-out test from the population — it is
included, and it passed clean in every run (mutations #1-#3, A, B all touch code paths that
test does not exercise).

---

## Per-AC Findings — APCR-01 (the ACs that FAILed last pass)

| AC | Verdict | Evidence |
| --- | --- | --- |
| .1 (per-host/tier retention) | **PASS** | `scripts/__tests__/model-profiles.test.ts:813-834` ("mergeOverlay retains a profile's untouched tiers and hosts when the overlay edits only one tier of one host") directly calls the real `mergeOverlay` with an overlay touching one leaf and asserts the other tiers/hosts are verbatim from builtin. **Killed my Mutation #3** (whole-host-replace) this session. |
| .2 (hostDefaults/workflowTiers partial retention) | **PASS** | `model-profiles.test.ts:778-794` ("mergeOverlay retains builtin hostDefaults/workflowTiers keys the overlay does not mention") sets only one of four hostDefaults keys and one of two workflowTiers keys, asserts the rest survive. **Killed my Mutation #1** (whole-object replace) this session — 4 tests failed. |
| .3 (builtin addition reaches overlay user) | **PASS** | `model-profiles.test.ts:733-776` is the spec's own named Independent Test, verbatim in shape: builtin gains profile B after the overlay was written, overlay touches only one leaf of profile A — asserts B survives and A's untouched tiers are unchanged. **Killed my Mutation #3.** |
| .4/.5 (normalization collapse / preserve genuine edit) | **PASS** | `model-profiles.test.ts:857-885` writes a real overlay file with one hostDefaults key byte-identical to the real builtin (dropped) and one that differs (kept), asserted through the real `loadEffectiveRegistry`. **Killed my Mutation #2** (inverted equality) this session — reproduced the coordinator's independent finding. |
| .6 (`_delete:true` unchanged) | **PASS** (unchanged from last pass) | `model-profiles.test.ts:579-619`, pre-existing, unaffected by this fix loop. |
| .7 (one merge implementation) | **PASS** (unchanged) | Structural — twin deleted, route calls library `mergeOverlay`. |
| .8 (client seeds overlay-only) | **PASS** (unchanged) | `admin-handlers.test.ts:555-572`. |
| .9 (AC9 known-limitation pin) | **PASS** | `model-profiles.test.ts:887-913` — an overlay entry standing in for a stale full-copy (`opencode: "cheap"` vs. current builtin `"balanced"`) is asserted to survive normalization and win in the merged registry, with an explicit comment that a future provenance-aware change must edit this test, not silently change behavior under it. |
| .10 (surviving-override count reported to the operator) | **PASS — verified as a code fix, read directly, not inferred from tests** | `GET` handler: `apps/tools-api/src/routes/model-registry.ts:53` `overlayOverrideCount: result.overlayOverrideCount ?? 0` inside the `data` object. `PUT` handler: same field at `:115`. `apps/web-ui/src/static/app.js`: `mergeRegistryForDisplay` (`:1619-1626`) carries `overlayOverrideCount` through both its early-return branch (returns `serverData` as-is, which already has the field) and its rebuilt-object branch (explicit `overlayOverrideCount: (serverData && serverData.overlayOverrideCount) || 0`). `renderModelRegistry` (`:1130-1136`) reads `payload.overlayOverrideCount`, renders a singular/plural-aware line when `>0`, renders nothing when `0` or absent, and the line is spliced into the actual HTML output at `:1273`. **Killed my fresh Mutation A** (`countOverlayEntries` hardcoded to 0 — the computation) and **Mutation B** (PUT response silently drops the field — the wiring) this session. |

## Per-AC Findings — everything else (unchanged from last pass, re-confirmed clean)

APCR-02 through APCR-11 were PASS on the prior pass with direct mutation-confirmed evidence
(project.ts's narrowed catch, the pool-sharing gate, schema-qualified enumeration, the mask
sentinel's unconditional restore, install-status derivation + banner classification, the
501 deployment resolver, secret-file modes/retention, the SSE handler factory, HANDOFF
rotation + validate_state's failing-set bracket, and the carried-work contract including the
Duplicate/Delete pickers reading the display registry). Re-read `git diff a3432358..HEAD`
in full this session and confirmed none of the three fix commits touch any file in that
surface — no re-verification risk introduced. Not re-mutation-tested this pass (out of scope
for this iteration; nothing in the fix commits could have regressed them).

---

## Sensor Results — this session (5 mutations; packet required ≥2 fresh + re-confirm #1-#3)

All mutations run in a scratch `git worktree add --detach HEAD` at
`/tmp/apcr-reverify-1`, **provisioned** with symlinked `node_modules` and a
`bun run generate:artifacts` pass before any mutation (see Methodology). File-set parity
confirmed via `find ... | diff` before mutating. Real worktree's `git status --porcelain`
confirmed to show only the untracked `validation.md` after `git worktree remove --force`.

| # | Target | Mechanism | Result |
| --- | --- | --- | --- |
| 1 (re-run) | `mergeFlatMap` (`model-profiles.ts:582-595`) | Whole-object replace instead of per-key merge | **KILLED** — 4 tests fail (baseline 54/0 → 50/4), including the newly-added "retains builtin hostDefaults/workflowTiers keys the overlay does not mention" |
| 2 (re-run) | `normalizeFlatMap` (`model-profiles.ts:673`) | Inverted the byte-identical comparison | **KILLED** — 2 tests fail (54/0 → 52/2), including the newly-added normalization-collapse test and the AC9 pin |
| 3 (re-run) | `mergeProfile` (`model-profiles.ts:609-615`) | Whole-host replace instead of per-tier merge | **KILLED** — 2 tests fail (54/0 → 52/2), including the spec's own Independent Test by name |
| A (fresh) | `countOverlayEntries` (`model-profiles.ts:718-738`) | Hardcoded to always return 0 | **KILLED** — 1 test fails (54/0 → 53/1): the normalization test's `expect(result.overlayOverrideCount).toBe(1)` assertion |
| B (fresh) | `PUT` handler (`model-registry.ts:108-116`) | Response silently omits `overlayOverrideCount` | **KILLED** — `model-registry.test.ts`'s "200 with valid overlay" case fails: `expect(res.json.data.overlayOverrideCount).toBe(1)` — `Expected: 1, Received: undefined` |

**Equivalent mutations**: 0. All 5 mutations reached live, reachable code paths.

---

## Gate Results (re-run independently this session; targets are the coordinator's figures)

| Gate | Command | Target | Measured |
| --- | --- | --- | --- |
| web-ui | `bun test apps/web-ui/src/__tests__/` | 337/0 | 337 pass / 0 fail — match |
| shared | `cd packages/shared && bun test` | 327/0 | 327 pass / 0 fail — match |
| tools-api | `DATABASE_URL=... bun scripts/run-tests-isolated.ts` | 29 groups | 29 groups, all pass — match |
| core (filtered) | `DATABASE_URL=... bun scripts/run-tests-isolated.ts --unit --filter='vector\|postgres\|store'` | 16 groups | 1st run: `postgres-vector-store.integration.test.ts` failed (the documented live-provider flake class). Re-ran once immediately with an identical command: 16 groups, all pass — match, flake noted rather than hidden |
| type-check | `bun run type-check --force` | 6/6 | 6/6 successful — match |
| lint | `npx oxlint --quiet` | exit 0 | exit 0 — match |
| test:scripts | `bun run test:scripts` | exit 0 | exit 0 (1709 TS tests across 77 files + shell suites, e.g. WSL-IP detection 8/8) — match. Ran in background (exceeded the 120 s foreground timeout at ~130s wall time); confirmed the backgrounded process's own `exit:$?` line read `0` |
| artifacts | `bun run generate:artifacts --check` | exit 0 | no drift, exit 0 — match |

All 8 gates match. No divergence from the coordinator's target figures.

---

## Risks / Skipped checks (with reasons)

- **`postgres-vector-store.integration.test.ts` flaked once**, cleared on immediate re-run —
  exactly the documented live-Ollama/embedding-provider flake class both the coordinator and
  the implementer have independently hit. Not investigated further; explicitly re-run once
  before being counted, per the coordinator's instruction.
- **APCR-02 through APCR-11 were not re-mutation-tested this pass.** They were fully
  mutation-confirmed on the prior (FAIL) verification pass, and this session's `git diff
  a3432358..HEAD --stat` (re-read in full) shows the three fix commits touch only
  `scripts/__tests__/model-profiles.test.ts`, `scripts/lib/model-profiles.ts`'s call sites
  in the route/UI for `overlayOverrideCount`, and `tasks.md` — no file in the APCR-02..11
  surface. Re-running the same 6 mutations from the prior pass would exercise unchanged code
  and unchanged tests; skipped as low-value against the remaining iteration budget.
- **`bun run test:scripts` needed a background run** (>120s foreground timeout budget in
  this environment). Confirmed the actual exit code from the backgrounded process's own
  captured output rather than assuming success from a truncated tail.

---

## Spec-precision gaps

None. Every AC that failed last pass is now either a confirmed code fix (APCR-01.10) or a
confirmed direct sensor (APCR-01.1/.2/.3/.4/.5/.9), re-verified against source and by
mutation this session rather than inferred from the fix commits' own tests.

---

## Exact next step

None blocking — feature is done pending the orchestrator's own close-out (push/PR is a user
decision per `spec.md`'s Assumptions table, unchanged from prior sessions).
