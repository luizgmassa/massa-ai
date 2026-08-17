# Portal Handoff/Proposal CRUD — Spec

Feature id: `portal-handoff-proposal-crud`
Branch: `feat/portal-handoff-proposal-crud`, stacked on `dbdceead` (PR #107).

## Problem

The Admin Portal can create a handoff and advance it through its state machine,
but it cannot edit or remove one. Proposals cannot even be created by hand. The
practical result on the user's own machine is 32 handoff rows, **30 of them
under `project_id = 'p'`** — a one-character id from a typo'd or test-harness
call — all still `open`, all displayed in the Handoffs tab, with no way to
remove any of them through the product. `proposals` holds **0 rows**, so the
Proposals tab has never had content to act on.

Two adjacent defects surfaced while measuring the above, and both are in scope
by explicit user decision:

- **Portal memory edit and delete are dead.** `views/memory.ts` issues
  `PUT /api/v1/memory/<id>` and `DELETE /api/v1/memory/<id>`. Neither route
  exists: `memory.ts` registers five body-keyed POSTs and nothing else, and no
  route anywhere in the app serves a path-parameter memory path. Both calls 404
  — and because Elysia matches routes before `onBeforeHandle`, they 404 ahead of
  auth. This is the exact failure mode the new endpoints must not reproduce.
- **"Write mode" is not a gate.** `isWriteModeEnabled()`
  (`apps/web-ui/src/static/lib/api-client.ts:49-65`) is client-side only; it
  decides whether buttons render. No route in `apps/tools-api` consults it.
  Every mutation in the product — memory delete, checkpoint delete, project
  reset, workspace delete, and all three `executor/*` arbitrary-code-execution
  routes — is protected by `x-api-key` alone.

## Measured baseline

Every figure below was measured on this branch at `dbdceead`; the command that
produced each is recorded in `validation.md`.

| Fact | Value | Source |
| --- | --- | --- |
| Routes in `apps/tools-api/src/routes/` | **86** | source enumeration |
| `GET` / non-`GET` | **32 / 54** | same |
| Route files | 28 | same |
| Route files calling `recordOperation` | **1** (`project.ts`) | source enumeration |
| FK constraints touching `handoffs`/`proposals` | **0**, both directions | live `pg_constraint` + all 23 migrations |
| `handoffs` rows / `proposals` rows | 32 / 0 | live database |
| `handoffs` by status | open 30, accepted 1, expired 1 | live database |
| `handoffs` by project | `p` 30, `massa-ai` 2 | live database |
| memories soft-referencing a handoff | 3 of 2 481 | live database |
| memories soft-referencing a proposal | 0 | live database |

**The route figures above are a correction.** The first enumeration reported
81 routes / 50 non-`GET`, and that number reached this spec, a commit message
and the Phase 1 task floors before it was caught. Its regex was newline-anchored
(`\n\s*\.`), so it silently missed every route chained onto its own
`new Elysia({ prefix })` call on the same line — five of them:
`POST /api/v1/analytics/`, `POST /api/v1/bootstrap/`, `POST /api/v1/file/read`,
`POST /api/v1/web/fetch_and_index`, and `GET /api/v1/events`.

That miss is the strongest available argument for D1's default-deny, and it was
not a hypothetical when it was made: four of the five are non-`GET`, one of them
fetches and indexes remote content, and **all four were protected anyway**,
because default-deny refuses what nobody classified. A denylist of "destructive
routes" — the design first reached for — can only ever contain what its author's
enumeration found, so those four would have shipped silently unguarded. The
enumeration error was absorbed rather than exploited.

Two consequences are recorded rather than assumed: the Phase 1 floors must be
raised from the wrong baseline to the measured one, and two of the newly-visible
non-`GET` routes (`POST /api/v1/analytics/`, `POST /api/v1/file/read`) are
semantic **reads** now over-blocked under read-only mode — see AC-03.3c.

Two independent measurements agree that a hard `DELETE` on either table
destroys exactly one row: there is no `FOREIGN KEY` in either direction, so no
cascade to trigger and no `RESTRICT` to reject. The only residue is
audit-trail metadata inside `memories` (`metadata.handoffId`, tag
`handoff:<id>`), which dangles but breaks nothing — nothing reads it by id.

## Goals

- **HPC-01** — Handoffs are editable and removable from the portal.
- **HPC-02** — Proposals are creatable, editable and removable from the portal.
- **HPC-03** — A real server-side write gate exists and is enforced by default
  on every non-`GET` route, with a classification that cannot silently go stale.
- **HPC-04** — Portal memory edit and delete work.
- **HPC-05** — The MCP tool surface stays at parity with REST.

## Non-goals

- Bulk delete (user decision: per-row only).
- Soft delete / undo / trash. Delete is hard, by decision.
- Retrofitting `recordOperation` onto the other 27 route files. The gate's
  classification is designed so audit can consume it later; wiring that is a
  follow-up, recorded in `validation.md`.
- Any change to the handoff or proposal **state machines**. `open →
  {accepted,expired}` and `pending → {approved,rejected}` stay exactly as they
  are, and `status` stays out of the PATCH surface (see HPC-01.3).
- Deleting the user's 30 junk rows. The feature gives them the control; using
  it is their call.

## Acceptance criteria

### HPC-01 — Handoff edit and delete

- **AC-01.1** `PATCH /api/v1/handoff/:id` updates only `targetAgent`,
  `summary`, `openQuestions`, `nextSteps`, `files`. Every field is optional;
  an absent field is left untouched, and a request that names no editable
  field is a 400, not a silent no-op.
- **AC-01.2** The route rejects `status`, `acceptedAt`, `id`, `projectId`,
  `createdAt` and `sourceSessionId` with a 400 naming the offending field.
  Rejection is by explicit allowlist of the five editable fields, not by
  denylist — a field added to the model later must be rejected until someone
  deliberately allows it.
- **AC-01.3** `status` and `acceptedAt` remain writable **only** through
  `setStatus` inside `HandoffService.terminate`. Justification: they are a
  paired write (`acceptedAt` is derived from the target status), and the
  proposal side already has a corruption guard that throws on the equivalent
  pair being inconsistent. Handoff has no such guard, which makes an
  independent `status` write worse here, not safer.
- **AC-01.4** `DELETE /api/v1/handoff/:id` hard-deletes the row and returns the
  deleted id. Deleting is permitted **in any status**, including `open` —
  restricting it to terminal statuses would leave all 30 of the user's junk
  rows unreachable, which is the case the feature exists to solve.
- **AC-01.5** Deleting a handoff leaves any `memories` row that references it
  intact. The dangling `metadata.handoffId` is accepted, documented behaviour,
  not an integrity break: no code path resolves that pointer.
- **AC-01.6** A `PATCH` or `DELETE` for an id that does not exist returns 404
  with an explicit status code — not a 200 carrying `{success:false}`.
- **AC-01.7** When `projectId` is supplied it must match the row's, exactly as
  `terminate` already enforces; a mismatch is a 404, not a 403, so the endpoint
  does not confirm the existence of another project's row.
- **AC-01.8** A `PATCH` that changes any field feeding the handoff's dual-written
  memory **refreshes that memory's content**. `HandoffService.dualWrite`
  (`services/handoff/handoff-service.ts:164-169`) inserts a memory row whose
  content `formatMemoryContent` (`:259-271`) builds once, at `begin`, from
  `summary` / `openQuestions` / `nextSteps` / `files` — and nothing ever updates
  it. Without this criterion, correcting a handoff would leave the memory row it
  spawned permanently wrong, still tagged `handoff:<id>`, still full-text
  searchable, still surfacing in recall. That is strictly worse than AC-01.5's
  accepted dangling pointer, which is inert: this would be active, indexed,
  wrong content. It is also the same failure class this project just fixed in
  PR #107 — a change the user applies that never reaches what reads it — so
  shipping an edit feature with that property is self-defeating. A test asserts
  the memory's content after a summary PATCH, not merely that the handoff row
  changed.

### HPC-02 — Proposal create, edit and delete

- **AC-02.1** `POST /api/v1/proposal/create` creates a `pending` proposal from
  `{projectId, kind, payload, rationale?, targetMemoryId?}`.
- **AC-02.2** `kind` must be one of `memory.create | memory.update |
  memory.tag`, and `payload` must satisfy the **same per-kind key and type
  validation** the store already applies on read. A payload accepted at write
  time but rejected by `parsePayload` on read would make every subsequent
  `getById`, `listPending` and `approve` on that row throw `storeCorruption` —
  the write must not be able to create a row the reader cannot read.
- **AC-02.3** `PATCH /api/v1/proposal/:id` updates `rationale` and `payload`
  only. A `payload` edit re-runs the full AC-02.2 validation against the row's
  existing `kind`.
- **AC-02.4** `kind`, `targetMemoryId`, `status`, `decidedAt`, `id`,
  `projectId` and `createdAt` are rejected with a 400 naming the field.
  `kind` and `targetMemoryId` are immutable because `applyProposal` branches
  its entire behaviour on them, and changing `kind` without simultaneously
  revalidating `payload` against the new kind corrupts the row on next read.
- **AC-02.5** `DELETE /api/v1/proposal/:id` hard-deletes in any status.
  Deleting an already-`approved` proposal does not reverse the memory edit it
  applied — that edit is already committed and is not this feature's to undo.
  The endpoint's response says so explicitly for approved rows.
- **AC-02.6** 404 and project-mismatch behaviour matches AC-01.6 / AC-01.7.

### HPC-03 — Server-side write gate

- **AC-03.1** A single middleware, registered immediately after
  `authMiddleware` in `index.ts` and using the same
  `.onBeforeHandle({ as: "global" })` form, rejects write requests with **403**
  when read-only mode is active. `as: "global"` is what carries a hook across
  plugin boundaries; registration order alone does not.
- **AC-03.2** The gate is **default-deny**: every non-`GET` route is a write
  unless it appears in an explicit read-only classification. A route nobody
  classifies is therefore over-protected rather than silently exposed.
- **AC-03.3** The read-only classification covers the non-`GET` routes that only
  read: `/search/project`, `/search/code`, `/memory/search`, `/memory/list`,
  `/checkpoints/list`, `/handoff/list`, `/proposal/list`, `/context/compress`,
  `/context/optimized`, `/symbol/impact`. **Each entry must be traced to source
  before it is added**, and carries that justification inline — the trace, not
  the route's name, is the evidence. A route named like a read is not a read:
  `POST /search/project` accepts `autoReindex` + `projectPath` in its own
  request schema and reaches `SearchController.handleAutoReindex` →
  `ensureFreshIndex`, which writes the index
  (`packages/core/src/services/search/search-controller.ts:140,177-179,364-382`).
- **AC-03.3a** A classification entry may declare a **body sanitizer** that
  neutralises write-triggering fields while read-only mode is active.
  `/search/project` gets one forcing `autoReindex` to `false`, so search keeps
  working under read-only mode without retaining its write path. Dropping the
  route from the allowlist instead was rejected: it would 403 project search
  entirely, and a read-only instance still needs to search.
- **AC-03.3c** `POST /api/v1/analytics/` and `POST /api/v1/file/read` are
  **deliberately left unclassified**, and therefore refused under read-only mode,
  pending a full trace. Both became visible only when the enumeration error above
  was corrected, and both look like reads: `get_analytics.ts:70-111` calls only
  getters (`getSummary`, `getProjectStats`, `getQueryStats`,
  `getCachePerformance`, `getRecentSearches`), and `read_file.ts:106` delegates
  to `ReadFileService.read` — but this repo documents a read-file cache, and that
  path has not been traced to a verdict. Over-blocking a read fails safe;
  allowlisting a write does not, which is the entire lesson of `/search/project`.
  Closing this requires the same standard as the other ten: a trace to source,
  a justification carrying `file:line`, and a behavioural no-write test. Until
  then read-only mode costs the portal its analytics and file-view panels, and
  that is the correct trade at this stage.
- **AC-03.3b** Every one of the ten entries has a test asserting the route
  performs no write with read-only mode active — including whatever body flags
  its schema exposes. Path-and-verb classification cannot see a body flag that
  flips a handler's semantics, so this criterion is what covers that layer.
- **AC-03.4** A test enumerates every route from source and fails when any
  non-`GET` route is neither classified read-only nor covered by the gate,
  **naming the unclassified paths**. This is the criterion that keeps AC-03.2
  true after we stop looking: the population grew by 9 routes that a
  verb-and-keyword sweep did not flag — `executor/execute`, `execute_file`,
  `batch_execute`, `profiles/switch`, `checkpoints/restore`,
  `model-registry/regenerate` and its two streaming variants, `system/restart` —
  several of them strictly more dangerous than the 6 it did flag. A curated
  list is wrong now and wrong again on the next route added.
- **AC-03.5** The gate must be proved by **mutation**, not by a green suite:
  removing the middleware registration, and separately flipping default-deny to
  default-allow, must each turn the suite red. A gate whose removal changes
  nothing is not a gate.
- **AC-03.6** Read-only mode is off by default, so existing behaviour is
  unchanged for every current caller. It is enabled by a config knob; adding it
  means adding it to `turbo.json` → `tasks.test.passThroughEnv` (AD-010), which
  `scripts/__tests__/turbo-passthrough-env.test.ts` already mechanizes.
- **AC-03.7** `PUBLIC_PATHS` behaviour is untouched. The gate runs after auth
  and never makes a currently-public path non-public, nor the reverse.
- **AC-03.8** The read-only-mode config read **fails closed**: if resolving the
  setting throws, the gate treats read-only mode as **active** and refuses the
  write. This inverts the established house idiom, and that is deliberate. Four
  existing gates — `handoffsDisabled` (`routes/handoff.ts:24-30`),
  `autoImproveDisabled` (`routes/proposals.ts:23-26`), `routes/bootstrap.ts:21`,
  `routes/hooks.ts:35` — all wrap the read in `try { … } catch { return false }`,
  resolving a throw to "not disabled". Copying that idiom here would let every
  write through at exactly the moment the operator's intent cannot be confirmed.
  A test asserts a throwing config accessor still yields 403.
- **AC-03.9** Path matching normalises **one** trailing slash before comparing
  against the classification. Measured against this worktree's `elysia@1.4.29`:
  `POST /api/v1/handoff/list/` matches the same route as `/list` and the global
  hook receives the raw, unnormalised string. Literal equality would therefore
  403 an allowlisted read. The defect direction is over-blocking, never a
  bypass — default-deny already protects the write side against every string
  variant — so this is correctness, not authorization. Double slashes, `%2F`
  encoding, and case variants were measured to 404 before any hook runs and need
  no handling.
- **AC-03.10** A test asserts the route enumeration's own assumption: every
  non-`GET` verb call in `apps/tools-api/src/routes/` passes a **literal string**
  as its first argument, and `.group(`, `.guard(` and `.all(` appear nowhere in
  that tree. Both hold today and both are load-bearing — if either stops being
  true, the enumeration silently undercounts and AC-03.4 passes vacuously over a
  short population.

### HPC-04 — Portal memory edit and delete

- **AC-04.1** Portal memory edit and delete reach a route that exists. This is
  satisfied by a **pairing**, not by one end-to-end test, and the pairing is
  stated because a single test is not structurally available: `apps/web-ui`
  declares no dependency on `apps/tools-api`, and
  `apps/tools-api/src/routes/web-ui-contract.test.ts:17-19` documents why a
  cross-package import cannot be added — `rootDir: ./src` with no `allowJs`
  breaks `type-check`, and importing two route modules into one file hangs the
  run before Prisma initialises. The pairing is: (a) the corrected client URL,
  asserted in the web-ui suite; (b) the tools-api route suite proving those
  routes work against a real server; (c) AC-04.3's source-level diff joining
  them. (c) is the only member that can fail when (a) and (b) disagree, which is
  the entire defect class.
- **AC-04.2** The fix aligns client and server on one shape. Both conventions
  exist in the repo — path-parameter (`workspace.ts`, `synapse.ts`) and
  body-keyed POST (`memory.ts`, `checkpoints.ts`) — and the bug was the two
  sides disagreeing, not the choice itself.
- **AC-04.3** A sensor extracts every API URL literal the Web UI calls from
  `apps/web-ui/src/static/**` source, extracts the registered route population
  from `apps/tools-api/src/routes/**` source the same way AC-03.4 does, and
  fails naming any URL with no matching route. **Text scan on both sides** — not
  imports, for the reasons in AC-04.1.
- **AC-04.4** The sensor is proved by observing it **RED against the pre-fix
  tree**, before the repoint is applied, and that run is recorded. This is
  non-negotiable here because the natural home for it,
  `apps/web-ui/src/__tests__/route-contract.test.ts:65-94`, already contains
  three describe blocks whose entire bodies are `expect(true).toBe(true)` with a
  "wired in T10" comment. There is checked-in precedent in that exact file for
  satisfying "add a contract test" with a test that asserts nothing — and a
  vacuous sensor here would let the very defect this feature exists to fix
  regress unnoticed.

### HPC-05 — MCP parity

- **AC-05.1** New tools for handoff PATCH/DELETE and proposal
  create/PATCH/DELETE exist in `tool-defs`, are reachable through
  `call-tool-proxy.ts`, and are mirrored in `embedded-api-client.ts`. The proxy
  already substitutes `:id` and already supports PATCH and DELETE; the embedded
  client matches literal endpoint strings in a `switch` and needs a new
  regex-matched block for any path-parameter route.
- **AC-05.2** `embedded-mode-parity.test.ts` asserts `patch` and `delete` are
  present on both clients. It currently claims to in a comment and does not —
  it checks only `get` and `post`.

## Edge cases

- A `PATCH` whose body is valid JSON but contains only unknown keys → 400
  naming them, not a 200 that silently changed nothing.
- Deleting a row that another request is concurrently transitioning: last write
  wins, and the loser gets a 404. No locking is introduced.
- Both Pg stores keep an in-process `mirror: Map` hydrated once and updated by
  every write. A new `delete` that does not `mirror.delete(id)` will keep
  serving the deleted row from memory for the life of the process — invisible
  to any test that constructs a fresh store.
- Read-only mode active + portal open: buttons still render (that is the
  client-side toggle's own state) but the call returns 403. The UI must surface
  that rather than fail silently.
- `handoffsDisabled()` / `autoImproveDisabled()` already return 423 ahead of
  the service. The new routes keep that gate, and 423-vs-403 ordering is
  asserted rather than left to chance.

## Out of scope / accepted risk

- **The 3 dangling `metadata.handoffId` pointers** after a delete. Accepted:
  audit-trail only, nothing resolves them.
- **Dangling `metadata.proposalId` after deleting an approved proposal.**
  `auto-improve-apply.ts:123-127` writes it on every `memory.create` apply, so
  HPC-02 creates this pointer class even though the baseline measures 0 today —
  that zero is an artifact of there being 0 proposals, not evidence the pointer
  does not exist. Accepted on the same grounds as the handoff one: nothing
  resolves it by id.
- **Approved-proposal deletion does not reverse its memory edit.** Accepted and
  surfaced in the response; reversal would require an inverse of
  `applyProposal`, which does not exist.
- **`op` in the audit log is a free-form string** with no enumeration, so this
  feature cannot align its classification to a pre-existing destructive-op
  vocabulary — there isn't one.
- **HPC-06 (follow-up, not built here):** `authMiddleware`'s docblock states
  "every destructive op already takes `ActorContext` from the request." Measured:
  1 of 28 route files calls `recordOperation`. The claim is aspirational. Either
  the audit reach or the docblock should change; recorded, not fixed here.
- **HPC-07 (follow-up, not built here):** the four existing config gates named in
  AC-03.8 all fail **open** on a config-read error. AC-03.8 fixes the direction
  for the new gate only; whether `handoffsDisabled` / `autoImproveDisabled` /
  `bootstrap` / `hooks` should also invert is a separate decision with its own
  blast radius, and changing four live gates is not this feature's to smuggle in.

## Merge sequencing

This branch is stacked on **unmerged** PR #107 at `dbdceead`, and `[Unreleased]`
here already carries #107's entries. #107 must land first; this branch then takes
`main` (merge, never rebase — long spec branches rebase badly here) and
`[Unreleased]` is re-checked before T14 appends. Getting this wrong is a recorded
failure mode in this repo: conflicting PRs produce no test-merge commit, so CI
stops running on them silently while each merge re-cuts a release and
re-conflicts its siblings' `CHANGELOG.md`.
