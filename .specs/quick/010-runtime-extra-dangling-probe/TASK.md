# Quick 010 — runtime-extra dangling-process flake: inject the version-probe seam

## Goal
Kill the recurring CI flake: `getRuntimeSummary > includes all runtimes when
present` failing at ~5045 ms with bun printing `killed 1 dangling process`
(~7 hits on 2026-08-06/07, e.g. Coverage run 31131408263 attempt 1). Constraint
from the brief: do NOT raise the test budget — the 5 s default is the sensor.

## Root cause (overturns the standing diagnosis)
The standing memory blamed "some earlier file in the mock-free batch leaks a
child process; bun's kill-wait lands on the next file's clock". Measured false:

- The failed attempt's log shows the 5 s gap opening at the START of
  `runtime-extra.test.ts`'s own group, then `killed 1 dangling process`, then
  the first test failing at 5048 ms with "timed out after 5000ms".
- The test is not pure: `getRuntimeSummary` (runtime.ts:186) calls
  `getVersion(cmd)` for every non-null runtime — a real
  `execFileSync(cmd, ["--version"], {timeout: 5000})` per probe. The
  fully-populated fixture (`FULL_RUNTIMES`) costs 10 serial live probes
  (node, tsx, python3, bash, ruby, go, rustc, php, perl, Rscript).
- Under Coverage instrumentation + runner load the probes sum past 5 s; bun
  times the test out and kills the in-flight probe child — that kill IS the
  "dangling process" line. No earlier-file leak: a sweep of all 76 preceding
  shared-batch files (and their one-hop imports) found zero un-awaited async
  spawns, and three local full-batch runs (plain + coverage) showed zero
  dangling kills.

## Fix
- `packages/core/src/services/executor/runtime.ts` — `getRuntimeSummary` gains
  the same optional `DetectDeps` seam `detectRuntimes` already has; threads it
  to `getVersion`. Production callers unchanged (omit it, still probe live).
- `packages/core/src/__tests__/runtime-extra.test.ts` — both summary tests
  inject `getVersion: () => "vX.test"`; the first also asserts `(vX.test)`
  appears, so un-threading the seam fails the test (mutation-killing).

## Gate (all measured in the fix worktree)
- Red: `PATH=/tmp/fake-runtimes:$PATH bun test src/__tests__/runtime-extra.test.ts
  -t "includes all runtimes when present"` with ten 1 s-sleep stub binaries →
  `killed 1 dangling process` + fail at 10629 ms "timed out after 5000ms"
  (exact CI signature, deterministic), exit 1.
- Green: same slow-PATH command after the fix → 1 pass / 0 fail, exit 0.
- Full file: 37 pass / 0 fail / 1 skip, 65 ms, exit 0.
- Shared 77-file batch prefix (replicated runner classification: 128 shared of
  283, runtime-extra at #77), coverage shape, RUN_POSTGRES_TESTS=1 +
  DATABASE_URL to the dedicated 5433 test DB: 1071 pass / 0 fail, zero
  "dangling" lines, exit 0.
- `packages/core` `bun run build` (real tsc emit) exit 0; `bun run lint` exit 0.
