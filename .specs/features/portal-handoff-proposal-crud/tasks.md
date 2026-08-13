# Portal Handoff/Proposal CRUD — Tasks

Contract: `spec.md` · Design: `design.md`.
Sizing: **6 Phases = 14 Tasks.**

Phase 1 is independently valuable and independently revertable — if later
phases slip, the write gate still ships on its own.

---

## Phase 1 = 3 Tasks — the write gate

### T1 — route classification

- Requirements: HPC-03 (AC-03.2, AC-03.3, AC-03.3a, AC-03.3b)
- Write set: `apps/tools-api/src/middleware/write-mode-classification.ts` + its test
- Do: one exported table of read-only non-`GET` paths, each with its
  justification in source. Ten entries per AC-03.3. An entry may declare a body
  sanitizer; `/search/project` gets one forcing `autoReindex: false`.
- **Trace each of the ten to source before admitting it.** Do not classify by
  route name. `/search/project` was caught writing —
  `search-controller.ts:140,177-179,364-382` — after reading like a pure read.
  Four entries (`/context/optimized`, `/memory/list`, `/memory/search`,
  `/checkpoints/list`) have already been traced clean; the remaining five
  (`/search/code`, `/handoff/list`, `/proposal/list`, `/context/compress`,
  `/symbol/impact`) have **not**, and each needs its own trace recorded.
- Gate: `cd apps/tools-api && bun test src/middleware/write-mode-classification.test.ts`
- Done when: every entry carries its source trace, not a rationale; each of the
  ten has a test asserting the route performs no write under read-only mode
  **including every body flag its request schema exposes**; and the sanitizer is
  proved by asserting `autoReindex: true` does not reach `handleAutoReindex`.
  Prove RED by removing the sanitizer.

### T2 — the middleware

- Requirements: HPC-03 (AC-03.1, AC-03.5, AC-03.6, AC-03.7, AC-03.8, AC-03.9)
- Write set: `apps/tools-api/src/middleware/write-mode.ts` + its test,
  `apps/tools-api/src/index.ts`, `turbo.json`, `.env.example`
- Do: `.onBeforeHandle({ as: "global" })` mirroring `authMiddleware`, registered
  immediately after it. Default-deny per D1's five-step rule. Config knob, off
  by default. Add the knob to `turbo.json` → `tasks.test.passThroughEnv`
  (AD-010) — `scripts/__tests__/turbo-passthrough-env.test.ts` enforces this and
  will fail if it is missed.
- **The config read fails closed** (AC-03.8). Do not copy `handoffsDisabled`'s
  `try { … } catch { return false }` from `routes/handoff.ts:24-30`; that shape
  resolves a throw to "not read-only" and un-refuses every write. Four files in
  this tree use it, so copying it is the expected mistake, not a hypothetical.
- Normalise one trailing slash before the classification lookup (AC-03.9).
- Gate: `cd apps/tools-api && bun test src/middleware/write-mode.test.ts`
- Done when: read-only mode off changes nothing; on, a write route 403s and a
  read route and a public path both still pass; a **throwing config accessor
  still yields 403**; and `/api/v1/handoff/list/` is allowed exactly as `/list`
  is. **Prove RED twice**: delete the `index.ts` registration → red; flip
  default-deny to default-allow → red. A gate whose removal changes nothing is
  not a gate. Assert against a route mounted from a *different* plugin than the
  test's own, or `as: "global"` is untested —
  `apps/tools-api/src/middleware/auth-http.test.ts` already does exactly this
  for `authMiddleware` over a real socket; copy that harness rather than
  inventing one.

### T3 — the cardinality test

- Requirements: HPC-03 (AC-03.4, AC-03.10)
- Write set: `apps/tools-api/src/middleware/write-mode-population.test.ts`
- Do: enumerate every route from route-file source, subtract `GET`, subtract the
  classification, assert the remainder is exactly what the gate refuses, and
  **print any unclassified path by name**. Simulate the gate's decision over the
  enumerated population — do not sweep for dangerous-looking names.
- Also assert the enumeration's own assumptions (AC-03.10): every non-`GET` verb
  call takes a literal string first argument, and `.group(`, `.guard(`, `.all(`
  appear nowhere in `routes/`. Both hold today; both silently shorten the
  population if they stop holding.
- Gate: `cd apps/tools-api && bun test src/middleware/write-mode-population.test.ts`
- Done when: the population is **printed beside the verdict** and asserted as a
  floor (`>= 81` routes, `>= 50` non-`GET`) rather than pinned to today's exact
  figures — T7/T8 add 5 non-`GET` routes later in this same branch, and an
  equality assertion would redden on our own work. Adding a fake unclassified
  non-`GET` route to a route file turns it red. A test asserting over an
  accidentally-empty set passes vacuously, which is why the count is printed.

---

## Phase 2 = 3 Tasks — store and service layer

### T4 — handoff store `update` + `delete`

- Requirements: HPC-01 (AC-01.1, AC-01.3, AC-01.4, AC-01.5)
- Write set: `packages/core/src/data/handoff/handoff-contract.ts`,
  `handoff-repository-pg.ts`, the in-memory double, + tests
- Do: `update` writes only the five allowlisted columns; `delete` hard-deletes
  and **must `this.mirror.delete(id)`** after the DB write succeeds.
- Gate: `bun test packages/core/src/__tests__/handoff-proposal-pg.test.ts`
- Done when: delete-then-read returns undefined **through the same store
  instance** — a fresh store re-hydrates from the database and cannot detect a
  stale mirror. Prove RED by removing the `mirror.delete` line; the same-instance
  case must fail and a fresh-instance case must not.

### T5 — shared per-kind payload validation

- Requirements: HPC-02 (AC-02.2)
- Write set: `packages/core/src/data/proposal/` payload validation module + test
- Do: extract the per-kind allowed-key/type table `parsePayload` already applies
  on read so create and PATCH apply the identical rules on write. One table, two
  callers — never two tables.
- Gate: `bun test packages/core/src/__tests__/proposal-store-fail-loud.test.ts`
- Done when: a payload the reader would reject is refused at write time with a
  400-shaped error; each of the three `kind` values has a case. Prove RED by
  pointing the writer at a second, divergent copy of the key table.

### T6 — proposal store `create` / `update` / `delete`

- Requirements: HPC-02 (AC-02.1, AC-02.3, AC-02.4, AC-02.5)
- Write set: `packages/core/src/data/proposal/proposal-contract.ts`,
  `proposal-repository-pg.ts`, the double, + tests
- Do: as T4, plus manual create at `status: "pending"` with `decidedAt` null.
  Never write `status` / `decidedAt` outside `setStatus`.
- Gate: `bun test packages/core/src/__tests__/handoff-proposal-pg.test.ts`
- Done when: the mirror sensor from T4 passes here too, and a case proves
  `toRecord`'s paired-field guard still holds after every new write path — it
  throws when `(status === "pending") !== (decidedAt === null)`, and that is the
  invariant an ill-considered status write would break.

---

## Phase 3 = 3 Tasks — REST

### T7 — handoff `PATCH` / `DELETE` routes

- Requirements: HPC-01 (AC-01.1, AC-01.2, AC-01.6, AC-01.7, AC-01.8)
- Write set: `apps/tools-api/src/routes/handoff.ts`, `handoff.test.ts`,
  `packages/core/src/services/handoff/handoff-service.ts` + its test
- Do: `PATCH`/`DELETE /api/v1/handoff/:id`. Field allowlist, not denylist.
  Explicit status codes — 400 / 404 / 200 — rather than the 200-carrying-
  `{success:false}` shape two existing files use.
- **Refresh the dual-written memory on PATCH** (AC-01.8). `dualWrite`
  (`handoff-service.ts:164-169`) built that memory's content once at `begin` via
  `formatMemoryContent` (`:259-271`) and nothing has ever updated it. An edit
  that leaves it stale ships active, FTS-indexed, wrong content — worse than the
  inert dangling pointer AC-01.5 accepts.
- Gate: `cd apps/tools-api && bun test src/routes/handoff.test.ts` **and**
  `bun test packages/core/src/__tests__/handoff-service.test.ts`
- Done when: each rejected field has a case naming it; unknown id is a real 404;
  project mismatch is 404 not 403; a body with only unknown keys is 400. Assert
  the 423 `handoffsDisabled()` gate still precedes the new routes — note this
  ordering is already guaranteed by construction, since that check runs inline in
  the handler body and therefore after every `beforeHandle`, so the assertion
  documents the property rather than defending it. **The memory sensor asserts
  the memory row's content after a summary PATCH**, not that the handoff row
  changed; prove RED by removing the refresh call.

### T8 — proposal `create` / `PATCH` / `DELETE` routes

- Requirements: HPC-02 (all)
- Write set: `apps/tools-api/src/routes/proposals.ts`, `proposals.test.ts`
- Do: as T7, plus `POST /create`. Approved-row deletion states in its response
  that the applied memory edit is not reversed.
- Gate: `cd apps/tools-api && bun test src/routes/proposals.test.ts`
- Done when: a create whose payload the reader would reject is refused; `kind`
  and `targetMemoryId` PATCH attempts are 400.

### T9 — memory dead-path fix + URL contract sensor

- Requirements: HPC-04 (AC-04.1, AC-04.2, AC-04.3, AC-04.4)
- Write set: `apps/web-ui/src/static/views/memory.ts`,
  `apps/web-ui/src/__tests__/route-contract.test.ts`
- Do: **write the sensor first, observe it RED, then repoint.** The sensor is a
  source-level diff: extract every API URL literal called from
  `apps/web-ui/src/static/**`, extract the registered route population from
  `apps/tools-api/src/routes/**` the same way T3 does, fail naming any URL with
  no matching route. **Text scan on both sides** — `apps/web-ui` has no
  dependency on `apps/tools-api`, and `web-ui-contract.test.ts:17-19` documents
  that a cross-package import breaks `type-check` (`rootDir: ./src`, no
  `allowJs`) and hangs the run before Prisma initialises.
- Then repoint `handleMemoryEdit` / `handleMemoryDelete` at the existing
  `POST /api/v1/memory/update` and `POST /api/v1/memory/delete`.
- Gate: `cd apps/web-ui && bun test` + `cd apps/tools-api && bun test src/routes/memory.test.ts`
- Done when: **the pre-fix RED is recorded in `validation.md`** with its output.
  A sensor written after the fix has never failed and is unproven. Two specific
  traps: the existing tests assert against a mocked `ctx.api.request`, which is
  why this defect survived, so the sensor must not rely on that mock — and
  `route-contract.test.ts:65-94` already holds three describe blocks whose whole
  bodies are `expect(true).toBe(true)`, so there is checked-in precedent in this
  exact file for "adding a contract test" that asserts nothing.

---

## Phase 4 = 2 Tasks — MCP parity

### T10 — tool defs + embedded mappings

- Requirements: HPC-05 (AC-05.1)
- Write set: `apps/mcp-client/src/tool-defs/tool-defs-hooks-exec.ts`,
  `embedded-api-client.ts` + tests
- Do: five new tool defs following `synapse_update` / `synapse_end`. A regex
  block per path-parameter route in the embedded client, beside the existing
  synapse ones. `call-tool-proxy.ts` needs no change — confirm by reading it,
  do not assume.
- Gate: `cd apps/mcp-client && bun test src/__tests__/embedded-mode-parity.test.ts`
- Done when: each new tool resolves to the same endpoint+verb in both clients.

### T11 — close the parity-test gap

- Requirements: HPC-05 (AC-05.2)
- Write set: `apps/mcp-client/src/__tests__/embedded-mode-parity.test.ts`
- Do: assert `patch` and `delete` exist on both clients. The file's comment
  already claims this and the assertions only cover `get`/`post`.
- Gate: as T10
- Done when: red if either method is removed from either client.

---

## Phase 5 = 2 Tasks — Web UI

### T12 — handoff edit/delete UI

- Requirements: HPC-01, plus the 403 surfacing in spec Edge Cases
- Write set: `apps/web-ui/src/static/views/handoffs.ts`,
  `wire-view-handlers.ts`, + tests
- Do: per-row Edit and Delete, write-mode gated. The delete `confirm()` goes at
  the **wiring site**, not in the handler — the documented convention there.
  A 403 surfaces as a message.
- Gate: `cd apps/web-ui && bun test`
- Done when: the fake-DOM click test proves the confirm gates the call, and a
  declined confirm issues no request. Guard against the known vacuous-pass mode
  in this harness: a generic child with an empty dataset makes a guard-first
  handler exit before `confirm()` is ever reached, so the test passes without
  testing anything.

### T13 — proposal create/edit/delete UI

- Requirements: HPC-02
- Write set: `apps/web-ui/src/static/views/proposals.ts`,
  `wire-view-handlers.ts`, + tests
- Do: create form modelled on `handleHandoffCreate` + `collectFormData`; per-row
  Edit and Delete as T12.
- Gate: `cd apps/web-ui && bun test`
- Done when: create validates `kind` client-side against the three legal values,
  and the render path is asserted with 0 proposals — the user's actual state, and
  the one an empty-fixture test would otherwise never cover.

---

## Phase 6 = 1 Task — close-out

### T14 — close-out

- Write set: `.specs/` artifacts + `CHANGELOG.md`
- Do: `validation.md` (independent verification writes the verdict), STATE.md,
  HANDOFF.md, FEATURES.json, and `### Added` + `### Fixed` entries under
  `[Unreleased]` naming the user-visible symptoms.
- Gate: `bun skills/massa-ai/scripts/check_specs_delivered.ts portal-handoff-proposal-crud --root .`
- **Re-measure, do not quote.** The route population changes inside this feature
  (T7/T8 add 5 non-`GET` routes), so `validation.md` and the CHANGELOG must cite
  a count measured at close-out, not the 81/50 baseline from Phase 1.
- Done when: exit 0, committed before the first push. Note this checker verifies
  path existence and tracked status only, never content — it exits 0 on a
  close-out that says nothing.

---

## Test Coverage Matrix

| Requirement | Sensor | Task |
| --- | --- | --- |
| HPC-01 (AC-01.1-.7) | store update/delete + mirror; route field allowlist, 404, project mismatch; UI confirm | T4, T7, T12 |
| HPC-01 (AC-01.8) | memory content asserted after a summary PATCH; RED by removing the refresh | T7 |
| HPC-02 | shared payload validation; create/patch/delete routes; paired-field guard; UI create | T5, T6, T8, T13 |
| HPC-03 (AC-03.1,.5-.7) | middleware with 2 RED mutations, cross-plugin harness | T2 |
| HPC-03 (AC-03.2,.4,.10) | cardinality test over enumerated population + enumeration-shape assertions | T3 |
| HPC-03 (AC-03.3,.3a,.3b) | per-entry source trace; per-entry no-write test incl. body flags; sanitizer RED | T1 |
| HPC-03 (AC-03.8) | throwing config accessor still 403s | T2 |
| HPC-03 (AC-03.9) | `/list/` allowed exactly as `/list` | T2 |
| HPC-04 | source-level URL diff, **observed RED pre-fix and recorded** | T9 |
| HPC-05 | endpoint+verb parity both clients; patch/delete presence | T10, T11 |
| HPC-06, HPC-07 | out of scope — recorded in `validation.md`, not built | — |

## Gate Check Commands

```bash
bun run lint
bun run type-check
cd apps/tools-api && bun test src/middleware/write-mode.test.ts
cd apps/tools-api && bun test src/middleware/write-mode-population.test.ts
cd apps/tools-api && bun test src/routes/handoff.test.ts
cd apps/tools-api && bun test src/routes/proposals.test.ts
bun test packages/core/src/__tests__/handoff-proposal-pg.test.ts
cd apps/web-ui && bun test
cd apps/mcp-client && bun test src/__tests__/embedded-mode-parity.test.ts
bun run test:scripts
```

**One file per `bun test` invocation for `apps/tools-api`, `packages/core` and
`apps/mcp-client`.** All three run `bun scripts/run-tests-isolated.ts` as their
`test` script; `--filter` is **core-only** and is rejected by the other two
wrappers. Listing several files after `bun test` shares one process — a measured
false-failure source here (`logs` + `events` report 49/1 together, 51/0 and 8/0
apart).

`apps/web-ui` and `packages/shared` run plain `bun test` and take a whole
directory safely.

**A fresh worktree needs `bun run build`, not just `bun install`**, or every
tools-api suite fails identically with `Cannot find module '@massa-ai/core'`.

## Dependencies

T1 → T2 → T3. T5 → T6. **T4 → T6** (not merely T5 → T6). T4 → T7; T6 → T8.
T9 independent. T7, T8 → T10 → T11. T7 → T12 → T13. T14 last.

Two orderings above exist solely to prevent same-file write collisions, and both
were missed in the first draft:

- **T4 → T6**: both write `packages/core/src/__tests__/handoff-proposal-pg.test.ts`
  — one physical file holding `describe("PgHandoffStore")` (line 102) and
  `describe("PgProposalStore")` (line 231). Run in parallel, they clobber.
- **T12 → T13**: both write `apps/web-ui/src/static/wire-view-handlers.ts`
  (proposal wiring at 177-185, handoff wiring at 206-221).

Every other pair was checked and is genuinely disjoint, including T1/T2/T3
despite sharing a directory, and T7 vs T12 / T8 vs T13 despite pairing route
with UI.

Phase 1 (T1-T3) is independently shippable and does not depend on any other
phase.

## Merge sequencing

PR #107 lands first. Then merge `main` into this branch — never rebase; long
spec branches rebase badly here — and re-check `[Unreleased]` before T14
appends, since this branch's copy already carries #107's entries.
