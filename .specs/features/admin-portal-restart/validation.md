# Validation — admin-portal-restart (APR)

**Verdict: PASS**

Commit range: `main..HEAD` (6c438a98..7e29edfe, 9 commits), branch
`spec/installer-restart-embedding`. Verifier independent of author.

## Per-AC evidence

| AC | Requirement | Sensor | Result |
|----|---|---|---|
| AC-1 | POST without key → 401; with key → 200 `{restarting, mode}`, seam called once with that mode | `apps/tools-api/src/routes/restart.test.ts` "AC-1: 401 without key, and the drain never arms" + "AC-1/AC-2: supervised — 200..." | PASS — re-run direct: 13/13 across `lifecycle.test.ts` + `restart.test.ts` |
| AC-2 | mode matrix: `MASSA_AI_SUPERVISED=1` → supervised; `/.dockerenv` (stubbed) → supervised; neither → respawn; `MASSA_AI_DEV_WATCH=1` → 409, seam NOT called | `lifecycle.test.ts` `describe("detectRestartMode ...")` (4 cases) + `restart.test.ts` respawn/dev-watch cases | PASS |
| AC-3 | respawn seam gets argv/cwd == running process; spawn ordered after listener-stop in the call sequence | `lifecycle.test.ts` "respawn: listener stops BEFORE spawn, exit is last, argv/cwd match this process" (asserts exact call array `["stopServer","stopJobs","disconnect","spawn","exit"]` and argv/cwd equality) | PASS — also confirmed by the discrimination-sensor mutation below (order/presence is what the mutant broke) |
| AC-4 | PUT with changed `embedding.dimensions` → restart list contains `embedding`; identical re-send → empty; masked-placeholder-only → empty | `packages/shared/src/config/__tests__/config-writer.test.ts` `describe("changedRestartSections (APR-05)")` (3 tests: diff-sections, masked-echo, key-order) | PASS — re-run direct: 28/28 across the whole config-writer suite; also confirmed by the discrimination-sensor mutation below |
| AC-5 | UI: write-mode off → no button; on → button renders, confirm → POST → poll states render | `apps/web-ui/src/__tests__/restart-handlers.test.ts` `describe("renderConfig — Restart Server button gating")` + `describe("handleServerRestart")` (declined confirm, re-entrancy, 409, success-poll, gave-up) | PASS — re-run direct: 9/9 |
| AC-6 | UI: save response with `["embedding"]` → banner with section name + button; empty list → no banner | `restart-handlers.test.ts` `describe("handleConfigSave — restart proposal banner twins")` | PASS (part of the 9/9 above) |
| AC-7 | endpoint absent from tool-defs and embedded map; parity suite green | `apps/mcp-client/src/__tests__/web-ui-only-endpoints.test.ts` (explicit negative assertion, R3) + `embedded-mode-parity.test.ts` | PASS — web-ui-only-endpoints 2/2; embedded-mode-parity 14/14 |
| AC-8 | real-HTTP test asserts JSON content-type on the restart response | `apps/tools-api/src/routes/restart-e2e.test.ts` (real child process, real socket, 3 iterations under artificial event-loop load) | PASS — re-run direct: 1/1 (15 expect() calls across 3 iterations), asserts `content-type` contains `application/json` and the full JSON body parses without truncation |
| AC-9 | CHANGELOG `### Added` bullet | `git diff main..HEAD -- CHANGELOG.md` | PASS — "Restart Server button in the admin portal, with a diff-based restart proposal." under `[Unreleased] ### Added` |

## Plan-challenge revisions (R1-R4) — evidence

- **R1 (flush race, no blind timer):** `restart.ts` drains from
  `.onAfterResponse()`, not a timer — confirmed by source read
  (`apps/tools-api/src/routes/restart.ts`). The required real-process e2e test
  exists and passes (`restart-e2e.test.ts`, AC-8 row above): 3 iterations
  under artificial event-loop congestion (`setInterval` busy-loop), each
  asserting the client receives the complete JSON body before the child's
  supervised exit.
- **R2 (silent batch truncation guard):** `scripts/__tests__/tools-api-lifecycle-seam-guard.test.ts`
  greps all 54 tools-api test files for bare `process.exit(`/`Bun.spawn(`
  outside an allowlist of two child-probe suites — re-run direct: 14/14 pass,
  `[seam-guard] scanned 54 tools-api test files` printed (population beside
  verdict). Confirmed no offending lines in the current tree.
- **R3 (AC-7 strengthened to a negative assertion):** confirmed —
  `web-ui-only-endpoints.test.ts` explicitly filters `TOOL_DEFINITIONS` for
  anything restart-shaped (expects `[]`, population `TOOL_DEFINITIONS.length >
  40` printed) and greps all non-test mcp-client source for the literal
  `system/restart` string (expects `[]`, population `files.length > 10`
  printed) — this is a real negative-space check, not omission-as-evidence.
- **R4 (badge vs banner semantics):** `apps/tools-api/src/routes/config.ts`
  diff shows `restartNeededSections` (the existing presence-based badge field)
  is returned unchanged alongside the new `changedRestartSections` field — no
  badge logic was touched, confirmed by diff read of `config.ts` and
  `config-writer.ts`'s `restartNeededSections()` function (unmodified body).

## Discrimination sensor (mutation) — 2 of the 4 project-wide mutants land here

**Mutation A: drop the deep-compare in `changedRestartSections`.** In
`packages/shared/src/config/config-writer.ts`, replaced the `!deepEqual(...)`
filter with a presence check (`!== undefined`) — reproducing exactly the
pre-fix "presence-based" bug the spec's Problem section describes (submitting
an unchanged value still claims restart needed).

- Original file saved before mutation; restored by writing the saved bytes
  back (no `git checkout`).
- **Population: 28 tests** (`config-writer.test.ts`, full file). Before:
  28/28 pass. Under mutation: **25/28 pass, 3/28 fail** — killed, and the 3
  failures are exactly the 3 `changedRestartSections (APR-05)` tests (AC-4's
  own sensor: identical re-save, masked-sentinel echo, key-order).
- Restore verified: `md5` after restore == `99c3486a14d82ff7124c002b4bc5a2f3`
  (pre-mutation); re-run confirms 28/28, `git status --porcelain` clean.

**Mutation B: skip the spawn in respawn mode.** In
`apps/tools-api/src/lifecycle.ts`, `shutdownAndRestart` had its
`if (mode === "respawn") { seams.spawn(...); }` block deleted, so `exit(0)`
runs unconditionally without ever spawning the replacement — a silent
respawn-mode regression that would leave a dead process with nothing to take
over the port.

- Original file saved before mutation; restored by writing the saved bytes
  back (no `git checkout`).
- **Population: 13 tests** (`lifecycle.test.ts` + `restart.test.ts`). Before:
  13/13 pass. Under mutation: **10/13 pass, 3/13 fail** — killed:
  `lifecycle.test.ts`'s two respawn-path call-sequence assertions
  (`shutdownAndRestart`'s main respawn test and its
  disconnect-throws-still-spawns test) and `restart.test.ts`'s "AC-2: respawn
  — drain includes the spawn" all fail on the missing `"spawn"` entry in the
  recorded call array.
- Restore verified: `md5` after restore == `dbd50fd7a2dbf307648858692ffcc153`
  (pre-mutation); re-run confirms 13/13, `git status --porcelain` clean.

## Invariants / gotchas verified by source read

- Deliver-before-ack: `restart.ts` answers first (`set.status = 200; return
  {...}`), the drain runs from `onAfterResponse` — the arm/consume handshake
  (`armRestart`/`consumeArmedRestart`) in `lifecycle.ts` is one-shot, tested
  directly in `lifecycle.test.ts`.
- Bare-string/text-plain gotcha (CLAUDE.md): the restart route returns a real
  JSON object (`{ success, restarting, mode }`), not a bare string — confirmed
  by the real-HTTP e2e asserting `content-type` contains `application/json`
  (AC-8), which is the documented way this trap is caught (in-process tests
  cannot see it).
- Auth trap (CLAUDE.md): `restart.test.ts` composes a real `authMiddleware +
  restartRoutes` app rather than asserting 401 against an unregistered path.

## Residual risks / advisories (reviewer-accepted, per brief)

- **Respawn-rebind timing is unproven by e2e.** `restart-e2e.test.ts` proves
  the flush-before-stop race in **supervised** mode only (the probe sets
  `MASSA_AI_SUPERVISED=1`); the respawn path's "spawn ordered after
  listener-stop, then the replacement rebinds the freed port" sequence is
  proven at the seam-call-order level (`lifecycle.test.ts`,
  `restart.test.ts`) but never end-to-end with a real spawned child rebinding
  a real socket. Accepted risk per the reviewer.
- **Signal-path drain (`gracefulShutdown`, SIGTERM/SIGINT) has unit coverage
  only.** `lifecycle.test.ts`'s `describe("gracefulShutdown (signal path)")`
  exercises it against injected seams; there is no real-process e2e for the
  signal path analogous to `restart-e2e.test.ts`. Accepted risk per the
  reviewer.
- Edge case "respawn child dies instantly (port taken)" (spec Edge cases) is
  documented in button help text per the spec but not independently
  re-verified as UI copy in this pass (low risk, cosmetic).

## Command evidence (raw exit codes)

```
$ bun test apps/tools-api/src/lifecycle.test.ts apps/tools-api/src/routes/restart.test.ts scripts/__tests__/tools-api-lifecycle-seam-guard.test.ts
  13 pass (lifecycle+restart) / 14 pass (seam-guard) — 0 fail, EXIT:0
$ bun test apps/tools-api/src/routes/restart-e2e.test.ts
  1 pass, 0 fail, EXIT:0
$ bun test packages/shared/src/config/__tests__/config-writer.test.ts
  28 pass, 0 fail, EXIT:0
$ bun test apps/web-ui/src/__tests__/restart-handlers.test.ts
  9 pass, 0 fail, EXIT:0
$ bun test apps/mcp-client/src/__tests__/web-ui-only-endpoints.test.ts apps/mcp-client/src/__tests__/embedded-mode-parity.test.ts
  2 pass / 14 pass — 0 fail, EXIT:0
```
