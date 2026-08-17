# Portal Handoff/Proposal CRUD — Design

Contract: `.specs/features/portal-handoff-proposal-crud/spec.md`.

## Approach

Three independent changes that share one seam. The seam is a **route
classification** — a single source that says, for every non-`GET` route,
whether it reads or writes. The write gate consumes it to decide what to
refuse; a cardinality test consumes it to fail when the population grows
unclassified; and the audit log can consume it later without a second
enumeration being invented.

Everything else is ordinary CRUD following patterns already in the tree.

## D1 — the write gate

A new `writeModeMiddleware` registered in `index.ts` immediately after
`authMiddleware`, mirroring its exact form:

```ts
new Elysia({ name: "write-mode" })
  .onBeforeHandle({ as: "global" }, ({ request, path, set }) => { ... })
```

`{ as: "global" }` is load-bearing and is why this works at all. Elysia scopes
hooks to the plugin instance by default; `authMiddleware` uses the global form
to reach the 20+ route plugins `.use()`d after it, and this gate needs the same
reach. Registration order alone would not be sufficient, and a test that only
exercises routes registered in the same file would pass without proving it.

Decision rule, in order:

1. `GET` → allow. Reads are never gated.
2. `isPublicPath(path)` → allow, unchanged (AC-03.7).
3. Read-only mode inactive → allow. This is the default, so nothing about
   today's behaviour changes. **Resolving "inactive" must fail closed**: a config
   read that throws is treated as *active*, not inactive (AC-03.8).
4. Normalise one trailing slash, then: path classified read-only → allow,
   applying that entry's body sanitizer if it declares one (AC-03.3a, AC-03.9).
5. Otherwise → **403**.

Steps 3 and 4 each invert a local convention, and both inversions are the point.

**Step 3 inverts the house idiom.** Four existing gates resolve a throwing config
read to "not disabled" (`handoffsDisabled`, `autoImproveDisabled`,
`bootstrap.ts:21`, `hooks.ts:35`). That is defensible for a feature flag — a
broken config should not disable your product. It is indefensible for an
authorization gate, where the same shape means a config hiccup silently
un-refuses every write. The likely implementation failure here is *copying the
neighbouring file*, so the requirement is written to contradict it explicitly.

**Step 4 is not a name check.** A route's name is not evidence of what it does.
`POST /search/project` reads like a read and writes: `autoReindex` + `projectPath`
are in its own request schema, and the handler reaches
`SearchController.handleAutoReindex` → `ensureFreshIndex`
(`search-controller.ts:140,177-179,364-382`). Path-and-verb classification is
structurally blind to this, because the flag lives in the body. So each entry is
traced to source before admission, and an entry may carry a **sanitizer** that
neutralises its write-triggering fields while read-only mode is active —
`/search/project` gets one forcing `autoReindex: false`. Removing the route from
the allowlist instead would 403 project search on a read-only instance, which is
a real functional loss for no safety gain over the sanitizer.

Step 5 is the default-deny. Its value is entirely in what happens to a route
nobody thought about: it gets protected. The inverse design — a curated list of
destructive paths — was measured to fail on this exact codebase. A verb-and-
keyword sweep over all 50 non-`GET` routes flagged 14 and missed 9, including
all three `executor/*` arbitrary-code-execution routes, `profiles/switch`,
`checkpoints/restore`, `system/restart`, and all three `model-registry`
regenerate variants which prune managed roots before emitting. Several missed
routes are more dangerous than any it caught.

### The classification

A single exported table pairing each read-only non-`GET` path with the reason it
is read-only. Ten entries (AC-03.3). It is an allowlist of *reads*, which is the
narrow, stable, reviewable set; the alternative is an allowlist of *writes*,
which is the unbounded one.

This is a deliberate departure from the `kernel/` precedent in `CLAUDE.md`,
where an allowlist was rejected because "an allowlisted exception is
indistinguishable from a new violation." That reasoning holds when the
allowlist's members are exceptions. Here they are the *safe* set, and a missing
member fails closed — an unclassified route is refused in read-only mode, which
is visible immediately, not silently permissive.

### The cardinality test (AC-03.4)

Enumerates every route from route-file source, subtracts `GET`, subtracts the
classification, and asserts the remainder is exactly the set the gate refuses —
printing any unclassified path by name. Written as a *simulation* of the gate's
decision over the enumerated population, not as a textual sweep for dangerous-
looking route names, because the sweep is the thing already measured to be
wrong.

Both mutations in AC-03.5 must redden it: deleting the middleware registration,
and flipping default-deny to default-allow.

## D2 — route shape

The repo runs two conventions, and the memory defect was the two sides
disagreeing rather than either convention being wrong. So the rule is *agree and
test*, not *unify*:

| Surface | Shape | Why |
| --- | --- | --- |
| New handoff/proposal edit + delete | `PATCH`/`DELETE /api/v1/<res>/:id` | Matches the 6 existing non-`POST` routes (`workspace.ts`, `synapse.ts`, `model-registry.ts`); `call-tool-proxy.ts` already substitutes `:id` and already supports both verbs. |
| Proposal create | `POST /api/v1/proposal/create` | Sits beside `list`/`approve`/`reject`, matching `handoff/begin`. |
| Memory edit + delete fix | **change the client**, keep `POST /api/v1/memory/{update,delete}` | Those routes exist, are tested, and are what the MCP tools already call. Adding `PUT`/`DELETE` verbs would create a second way to do the same thing and leave the tested one unused. |

Adding REST verbs to `memory.ts` was rejected: it is more code, it duplicates a
working path, and it would leave two routes to keep in sync forever.

## D3 — store methods

`HandoffStore` and `ProposalStore` each gain `update(...)` and `delete(id)`, on
the contract, the Pg implementation, and the in-memory double.

The one non-obvious constraint: both Pg stores hold a `mirror: Map<string, Row>`
hydrated once by `ensureHydrated()` and updated by every existing write. A
`delete` that omits `this.mirror.delete(id)` leaves `getById`/`listPending`
serving the deleted row from memory for the life of the process — and a test
that constructs a fresh store per case cannot see it, because a fresh store
re-hydrates from the database. The sensor therefore has to delete and re-read
**through the same store instance**.

`update` writes only the allowlisted columns and never touches `status` /
`accepted_at` / `decided_at`, which stay exclusively `setStatus`'s (AC-01.3,
AC-02.4).

## D4 — proposal payload validation

`parsePayload` (`proposal-repository-pg.ts`) already enforces an exact allowed-
key set per `kind` on **read**, throwing `storeCorruption` on deviation. Create
and PATCH must apply that same validation on **write**, so a row cannot be
written that its own reader will reject — otherwise a malformed create returns
200 and then every subsequent `getById`, `listPending` and `approve` on that row
throws.

The validation is extracted and shared rather than reimplemented. Two
independent copies of a per-kind key table drift, and the drift only surfaces as
a corrupt row.

`toRecord`'s paired-field guard — it throws when `(status === "pending") !==
(decidedAt === null)` — is why `status` cannot be in the PATCH surface even as a
convenience. A status write that does not also write `decidedAt` corrupts every
future read of that row.

## D5 — Web UI

- Per-row Edit and Delete on handoff and proposal cards, both write-mode gated,
  matching the existing `writeMode` checks.
- Delete confirms live at the **wiring site** in `wire-view-handlers.ts`, not in
  the handler — a documented convention there, so "a handler called directly is
  never silently gated by a dialog a test cannot see." Edit is not confirm-gated;
  only irreversible actions are, consistent with `handoff-accept` and
  `proposal-approve` being unconfirmed today.
- A proposal create form modelled on `handleHandoffCreate` + `collectFormData`.
- 403 from the new gate surfaces as a message, not a silent failure.

## D6 — MCP, the three places

`tool-defs` gains five entries following `synapse_update` / `synapse_end`, which
are the existing proof that a `:id` PATCH/DELETE tool works end to end.
`call-tool-proxy.ts` needs **no change** — it already substitutes `:id` and
already routes `PATCH`/`DELETE`. `embedded-api-client.ts` matches literal
endpoint strings in a `switch`, so each path-parameter route needs a regex block
beside the existing synapse ones; that is the only genuinely new plumbing.

## D7 — what the Plan Challenge Gate changed

Two critics ran, deliberately on different lenses: `red_team` against HPC-03's
bypass surface, `pre_mortem` against everything else. Eleven findings, all
accepted. Listed so a reader can see which parts of this design survived scrutiny
and which were rewritten under it.

1. **An allowlisted "read" route writes.** `/search/project` reaches
   `ensureFreshIndex` via `autoReindex`. AC-03.3's original wording claimed the
   classification "covers exactly the non-`GET` routes that only read" — false as
   written, and the cardinality test could never have caught it, because it keys
   on path+verb while the defect lives in the body. Produced AC-03.3, AC-03.3a
   (sanitizers) and AC-03.3b (a per-entry no-write test).
2. **The gate would have failed open.** Copying the local config-read idiom would
   resolve a throw to "read-only inactive". AC-03.8 inverts it and adds the RED
   case.
3. **Trailing slash desyncs the classification.** Measured live against
   `elysia@1.4.29`: `/list/` matches the same route and the hook sees the raw
   string. Over-blocks rather than bypasses. AC-03.9.
4. **PATCH would have corrupted the dual-written memory.** The biggest miss in
   the original plan and the only finding rated critical by both lenses'
   standards: editing a handoff left its FTS-indexed memory row permanently
   wrong, with no AC, no task, and no sensor anywhere in the coverage matrix.
   AC-01.8.
5. **Two same-file write collisions in the decomposition** — T12/T13 on
   `wire-view-handlers.ts`, T4/T6 on `handoff-proposal-pg.test.ts`. Both would
   have clobbered under parallel dispatch. Fixed in Dependencies.
6. **AC-04.1 was unsatisfiable as written.** No test can drive the web-ui client
   against a live tools-api server; the cross-package import is documented as
   breaking `type-check` and hanging on Prisma. Reframed as an explicit pairing
   (AC-04.1) whose only real joint is the source-level diff (AC-04.3).
7. **The sensor's own home normalises vacuous tests.**
   `route-contract.test.ts:65-94` holds three `expect(true).toBe(true)` bodies.
   AC-04.4 now requires an observed RED against the pre-fix tree.
8. **`metadata.proposalId` dangles too**, and the baseline's "0" is an artifact of
   there being 0 proposals. Added to accepted risk.
9. **The #107 stacking had no plan.** Added as a Merge sequencing section.
10. **Cited population figures go stale inside this feature's own lifecycle** —
    T7/T8 add 5 non-`GET` routes. T3 asserts a floor and prints the actual; T14
    re-measures rather than quoting Phase 1.
11. **The enumeration's assumptions were unasserted.** No `.group(`, `.guard(` or
    `.all(` exists in `routes/` today and every verb call takes a literal string.
    Both true, both load-bearing, neither guarded. AC-03.10.

The gate also *strengthened* three things by failing to break them, which is worth
as much as the findings. `{ as: "global" }` propagation was reproduced live across
separately-`.use()`d nested instances rather than assumed. Every bypass axis I
would have worried about — double slashes, `%2F`, case variance, method-override
headers, `HEAD`, CORS preflight — was measured to 404 or be intercepted before any
hook runs. And an exception thrown inside `onBeforeHandle` was traced through
`elysia/dist/compose.js` to `errorHandler` → 500, so the hook fails closed on a
raw throw; only the *swallowing* idiom in finding 2 was dangerous.

The 423-vs-403 ordering the spec asks to assert turns out to be guaranteed by
construction: `handoffsDisabled()` runs inline in the handler body, necessarily
after every `beforeHandle`. Keep the assertion, but it documents a property rather
than defending one.

## Risks

| Risk | Mitigation |
| --- | --- |
| Default-deny breaks a caller nobody classified | Read-only mode is **off by default** (AC-03.6), so no current caller changes behaviour. The exposure is limited to operators who deliberately turn it on, and AC-03.4 names any unclassified path before they do. |
| The classification goes stale as routes are added | AC-03.4 fails the build naming the unclassified path. This is the whole reason it is a cardinality test over an enumerated population rather than a curated list. |
| `as: "global"` is wrong or silently scoped | Mutation AC-03.5: removing the registration must redden. A gate proved only by same-file routes proves nothing about the 20 plugins mounted after it. |
| A new store `delete` leaves the in-process mirror stale | The sensor deletes and re-reads through one store instance (D3). A fresh-store test cannot detect this and would pass. |
| PATCH writes a proposal its own reader rejects | Shared validation (D4), not a second copy of the per-kind key table. |
| Hard delete loses data with no undo | Decided by the user. Blast radius measured: exactly one row, no FK either direction, 3 dangling audit pointers repo-wide. Confirm dialog at the wiring site. |
| The 423 config gate and the 403 write gate interact confusingly | Ordering asserted explicitly rather than left emergent (spec Edge Cases). |
| Feature 3 grows past what one PR should carry | Real. Phase 1 (the gate) is independently valuable and independently revertable; if the CRUD phases slip, the gate still ships. |

## Reproduction

```bash
# the dead memory route (expect: no path-param memory route anywhere)
grep -nE '^\s*\.(get|post|put|patch|delete)\(' apps/tools-api/src/routes/memory.ts
grep -rn '"/api/v1/memory/:' apps/tools-api/src/routes/

# the write gate's true population
# (enumerates all 81 routes; 50 non-GET; keyword sweep flags 14, misses 9)
bun -e '...'   # recorded verbatim in validation.md

# blast radius of a hard delete
psql -tAc "SELECT conname FROM pg_constraint WHERE contype='f'
           AND (conrelid::regclass::text IN ('handoffs','proposals')
             OR confrelid::regclass::text IN ('handoffs','proposals'));"   # expect 0 rows
```
