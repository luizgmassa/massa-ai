# EB-AUD-1..3 — audit of three rows marked "covered" but never audited

Task T1.6 carries `EB-AUD-1..3` as a **reading** step, not an execution step. Three feature
rows were marked covered in the coverage matrix and no one ever checked what the suites
behind them actually assert. This note is that check. It writes no tests.

Method: read each named suite in full, read the product source it drives, and classify what
is asserted against the five scenario classes this repository applies to an E2E row —
**(a) happy path, (b) parity (MCP stdio ≡ HTTP via `assertMatrix`, `_helpers.ts:673-686`),
(c) degradation, (d) negative, (e) persistence / restart**. Every claim below carries a
`file:line`. A row found genuinely complete is recorded as complete.

Scope note: all three rows were audited against the worktree
`test/e2e-feature-battery`. Nothing here is taken from `COVERAGE.md` or from a prior
`.specs/` claim — both are already proven stale (`spec.md:20-22`).

---

## EB-AUD-1 — symbol graph

Suites read: `09.symbol-graph.test.ts`, `18.graph-phase4.test.ts`,
`24.dashboard-architecture.test.ts` (AR1–AR5). Source read:
`apps/tools-api/src/routes/workspace.ts` (which owns `search_definitions`,
`get_references`, `go_to_definition`, `project_map`), `routes/architecture.ts`,
`packages/core/src/services/symbol/`.

### Asserted

| Class | Evidence |
| --- | --- |
| (a) happy path | `09.symbol-graph.test.ts:78-397` (F37–F50: list_projects, project_map, search_definitions, get_references, go_to_definition); `:401-611` (all-33 polyglot fixture, FQN resolution); `18.graph-phase4.test.ts:117-585` (D1 edges, D2 trace_path, D3 impact_analysis, D4 architecture map); `24.dashboard-architecture.test.ts:246-267` (AR1 get_architecture) |
| (b) parity | `09.symbol-graph.test.ts:620-755` — five `assertMatrix` blocks; `:550-610` polyglot project_map/identity parity; `18.graph-phase4.test.ts:156-164`, `:336-361`, `:448-467`, `:587-615`; `24.dashboard-architecture.test.ts:269-297` (AR2 key-set parity) |
| (c) degradation | `18.graph-phase4.test.ts:270-296` (class seed resolves, walks to zero — the documented contract, not a failure); `:298-333` (inbound BFS under 2 nodes); `:398-410` (impact_analysis with 0 changed files); `:491-499`, `:568-583` (`expectOptionalArray`, the documented empty-analyzer case, citing `symbol-graph.service.ts:521-527`); `09.symbol-graph.test.ts:452-458` (structure-only tier files yield zero flow references) |
| (d) negative | `09.symbol-graph.test.ts:383-397` (F50: unknown **symbolName** → `{found:false}`); `24.dashboard-architecture.test.ts:322-336` (AR4: unknown `aspects` value → `{success:false}` with a teaching error) |

Parity and happy path are genuinely excellent here. This is the strongest-covered of the
three rows and no gap should be manufactured against those two classes.

### Not asserted

1. **Missing / nonexistent `projectId` on the six symbol routes.** The error contracts
   exist and are explicit: `"projectId is required"` at `routes/workspace.ts:226`, `:299`,
   `:386`, `:436`, `:567`, `:713`, `:755`, and `` `Workspace '${projectId}' not found` `` at
   `:152`, `:597`, `:689`, `:762`. Nothing in `09.symbol-graph.test.ts` or
   `18.graph-phase4.test.ts` exercises either. Evidence of absence: a case-insensitive scan
   for `nonexistent|bogus|not-a-real|does-not-exist` returns **0** in both files (the 5 hits
   in `24.dashboard-architecture.test.ts` are AR4's unknown-`aspects` case, which targets a
   different parameter). F50 is the only "unknown X" test in the row and it targets
   `symbolName`, not `projectId`.
2. **`impact_analysis` projectPath-boundary rejection.** `18.graph-phase4.test.ts:369-371`
   *documents in prose* that the route "enforce[s] this boundary", but no test sends a
   mismatched `projectPath` to observe the refusal. A guard described but never provoked is
   an unverified guard.
3. **(e) persistence / restart — absent entirely.** Zero occurrences of `restart` in
   `09.symbol-graph.test.ts`, `18.graph-phase4.test.ts` or `24.dashboard-architecture.test.ts`
   (verified by `grep -ci`, all three return 0). The graph is PostgreSQL-durable — the
   suites themselves lean on that with their repeated `activatedGraphGenerationId` /
   `parserDiagnostics` assertions — and a working restart pattern already exists in the
   harness at `23.owned-destructive.test.ts:437-510` (E25). It is simply never applied to
   this row.

### Vacuous / declared passes

None in `09.symbol-graph.test.ts` or `18.graph-phase4.test.ts` — `expect(true).toBe(true)`
returns **0** in both. `24.dashboard-architecture.test.ts` has three, all defensible:
`:212` (DB5, fires only when the MCP subprocess failed to start), `:440` (RN3, fires when
the merge-preview fixture failed to index), `:513` (the deliberate "RUN_E2E gating is
reported" sanity test).

### Verdict

**Partially complete.** Two gaps worth a new scenario, one not.

- Worth it: the missing-param / nonexistent-project negatives. Cheap, deterministic, no
  restart, and twelve declared error literals already exist to assert against. The right
  home is a small negative block, not a new file.
- Worth it: one restart case. It is the row's only unverified durability claim, and the
  harness pattern already exists.
- Not worth a scenario on its own: (c) degradation. It is genuinely covered — these routes
  are structural/DB-driven with no LLM or config gate, so "sparse data → empty, not error"
  is the correct analogue of degradation for this row and it is asserted five times.

---

## EB-AUD-2 — checkpoints

Suite read: `06.checkpoints.test.ts` in full. Source read:
`apps/tools-api/src/routes/checkpoints.ts`,
`packages/core/src/services/checkpoint/checkpoint-manager.ts`,
`services/checkpoint/checkpoint-store-pg.ts`,
`packages/core/src/tools/restore_checkpoint.ts`.

### Asserted

| Class | Evidence |
| --- | --- |
| (a) happy path | F68 create `06.checkpoints.test.ts:67-99`; F69 checkpointType manual/milestone `:102-129`; F70 list filters `:132-210`; F71 restore by checkpointId `:213-249`; F72 restore by taskId/latest `:252-284` |
| (b) parity | `:305-337` (create), `:339-376` (list), `:378-411` (restore) — all three via `assertMatrix`, both legs forced to `format:"json"` for the reason stated at the file header `:7-10` |
| (d) negative | F73, unknown `checkpointId` → clean `{success:false}`, `:287-301` |

### Not asserted

1. **Two of the three declared restore-error branches.** `restore_checkpoint.ts:75-80`
   returns `"Either checkpointId or taskId must be provided"` and `:86-92` returns
   `` `No checkpoints found for task: ${taskId}` ``. Neither is exercised; F73 (`:287-301`)
   is the only restore-failure test in the file and it covers the third branch.
2. **`POST /api/v1/checkpoints/delete` is absent from the E2E row entirely.** The route is
   `routes/checkpoints.ts:182-223`; the literal string `delete` appears **0** times in
   `06.checkpoints.test.ts`. It is not a total blind spot for the codebase — the in-process
   route test `apps/tools-api/src/routes/checkpoints.test.ts:86-149` covers 404-on-missing,
   200-on-hit and 404-on-second-delete — but it is a real absence from the *live-stack*
   matrix.
3. **(c) degradation has no feature-off form here, but it does have a dependency form, and
   that form is untested.** Checkpoints are unconditionally PostgreSQL-backed
   (`checkpoint-manager.ts` calls `requirePostgresDatabaseUrl()`), so there is no toggle to
   turn off — that half is legitimately N/A. What is NOT N/A: `checkpoint-store-pg.ts:16-17`
   states writes are "fire-and-forget (best-effort, logged on failure)". A
   `create_checkpoint` during a PostgreSQL outage therefore returns `{success:true}` with a
   real id while the durable write silently fails. Nothing tests it.
4. **(e) persistence / restart — absent, and this is the row's own headline claim.**
   `checkpoint-store-pg.ts:17-23` states the contract in prose: "a new process hydrates its
   mirror from the persisted rows, so a checkpoint created before a restart is visible after
   it once hydration settles." `ensureReady()` at `:462-469` exists *specifically* for this,
   and its docblock names the defect it fixes ("hydration race fix, #16"). Separately,
   `routes/checkpoints.ts:186-191` and `:220` record an accepted V1 limitation by name
   ("Plan Challenge F4 — a restart before the durable delete completes could re-show the
   row"). None of it is tested: `restart` occurs **0** times in `06.checkpoints.test.ts`.

### Vacuous / declared passes

**None.** `expect(true).toBe(true)` returns **0** and there are no `.skip(` calls. Every
test in this file that runs asserts something real — which is more than most files in this
suite can say.

### Verdict

**Incomplete on its own stated contract.** One gap is worth a scenario more than any other
finding in this note: the **hydration-on-restart** case. It is not a hypothetical — the
source names the race, ships an API to work around it, and documents a second restart-order
limitation beside it, and the row's persistence claim rests entirely on prose. The two
missing restore-error branches are cheap and deterministic and should ride along. The
delete route and the PG-outage write path are lower priority: the first has in-process
coverage, the second needs a destructive stack and belongs with `16.destructive.test.ts`.

---

## EB-AUD-3 — fetch-and-index

Suite read: `19.web-exec.test.ts` (WF1–WF5 plus the fetch matrix). Source read:
`apps/tools-api/src/routes/web.ts`, `packages/core/src/tools/fetch_and_index.ts`,
`packages/core/src/services/web/web-controller.ts`, `services/web/fetcher.ts`,
`services/web/ssrf.ts`, `apps/mcp-client/src/embedded-api-client.ts`.

### Asserted

| Class | Evidence |
| --- | --- |
| (a) happy path | WF1, fetch a public URL → indexed, `19.web-exec.test.ts:144-169` |
| (d) negative | WF2 loopback `:171-214`; WF3 RFC1918 private `:216-248`; WF4 IMDS link-local `:250-284`. All three assert a declared, non-throwing per-URL error contract |
| (b) parity | `:349-384` — but **only for the SSRF-rejection branch**. There is no matrix test comparing a *successful* fetch across MCP and HTTP |

SSRF negative coverage is genuinely strong and should not be second-guessed.

### Not asserted

1. **Happy-path parity.** The only `fetch_and_index` matrix test targets the rejection
   branch (`:349-384`).
2. **The empty-input negative.** `web-controller.ts:159-161` declares
   `{success:false, results:[], concurrency:0, capped:false}` for a request carrying neither
   `url` nor `requests`. No test sends that body.
3. **Non-IP SSRF vectors.** `ssrf.ts:209-214` blocks non-`http(s)` schemes as a *separate*
   guard from the IP classifier that WF2–WF4 exercise. No test sends a `file://` or `data:`
   URL.
4. **(c) degradation and (e) persistence / restart — both absent.**

### The finding that matters: WF5 is a vacuous pass, and it may be masking a live defect

`19.web-exec.test.ts:286-346` is titled "WF5: fetch→search round-trip (indexed content is
searchable)". Its **only** assertion on the round-trip path is:

```ts
// 19.web-exec.test.ts:343
expect(true).toBe(true);
```

The `await fetchAndIndex(...)` result at `:311-316` is discarded without assertion, and the
`found` flag from the 90-second search poll is consumed by a `console.log` at `:332-338`
("reported as a latency caveat, not a hard failure"). The test cannot fail whatever the
round-trip does. That is the definition AC-05 rules out.

What it may be hiding is more consequential than the vacuous assertion itself. WF5 sends
`projectId: WEB_PID` at `:311`. The route's declared body schema —
`apps/tools-api/src/routes/web.ts:51-73` — declares `url`, `source`, `requests`,
`concurrency`, `force`, `ttl` and **no `projectId`**. The controller on the other side
*does* read it: `web-controller.ts:52-53` declares `projectId?: string` ("Defaults to
`web`") and `:167` resolves `const projectId = params.projectId ?? "web"`. Meanwhile the
embedded transport bypasses the HTTP schema entirely —
`apps/mcp-client/src/embedded-api-client.ts:211` constructs
`new FetchAndIndexTool((params) => controller.fetchAndIndex(params))`, handing the body
straight to the controller.

So the two transports do not agree on the parameter set for this one tool, and the tool in
question is the only project-scoped one in the row. `apps/tools-api/src/index.ts:81`
constructs the app as `new Elysia({ adapter: node() })` and sets **no explicit `normalize`
option**, so whether the undeclared `projectId` is stripped or forwarded on the HTTP path is
decided by the framework default rather than by anything in this repository.

**This audit does not claim the strip as fact.** The verified facts are: the field is
undeclared on the route, it is read by the controller, and the embedded path reaches the
controller without the schema. The remaining step is one empirical check on the live stack —
POST `/api/v1/web/fetch_and_index` with `projectId: <e2e-prefixed>` and then read back which
scope the chunks landed in. That check is the scenario worth writing, and WF5 is exactly
where it belongs.

### Other declared skips in the file

`:297` (WF5's Ollama-down sub-skip), `:354` and `:376` (MCP-subprocess start/call failure in
the SSRF matrix), `:544` and `:560` (same pattern in the executor matrix). All five are
legitimate infra gates with a stated reason — they are a different class from `:343`, which
gates on nothing.

### Verdict

**Incomplete, and the least trustworthy of the three rows** — not because it covers little
(the SSRF work is good) but because its one round-trip case is unfalsifiable and sits
directly on top of a transport divergence. Worth a new scenario immediately: replace WF5's
unconditional assertion with a real scope assertion, and settle the `projectId` question
empirically while doing it. Expect it to go red; that is the point.

---

## Summary

| Row | Complete? | Highest-value gap | Worth a new scenario |
| --- | --- | --- | --- |
| EB-AUD-1 symbol graph | Partially — (a) and (b) are excellent, (c) is genuinely covered | No restart coverage despite a durable graph and an existing harness pattern (`23.owned-destructive.test.ts:437-510`); no `projectId` negatives against 12 declared error literals | Yes — a small negative block plus one restart case |
| EB-AUD-2 checkpoints | No — and the missing class is the row's own documented claim | Hydration-on-restart (`checkpoint-store-pg.ts:17-23`, `:462-469`), asserted in prose and nowhere else | Yes — highest confidence of the three |
| EB-AUD-3 fetch-and-index | No | WF5 (`19.web-exec.test.ts:343`) is a vacuous pass sitting on a `projectId` transport divergence between `routes/web.ts:51-73` and `web-controller.ts:167` | Yes — and it needs one empirical check, not more reading |

Three shared observations across the rows:

- **Persistence / restart is missing from all three**, and the harness has had a working
  restart mechanism since `23.owned-destructive.test.ts:437-510`. `e2e-stack.sh restart-api`
  (`scripts/e2e-stack.sh:464-481`) makes it cheap now. This is the single largest structural
  gap the audit found.
- **Negative coverage is thin wherever the error literal is a plain `{success:false}` string
  rather than an HTTP status.** Twelve such literals in `routes/workspace.ts` alone have no
  E2E assertion.
- **A `console.log` is not an assertion.** Two of the three rows contain a test whose stated
  subject is reported to stdout and asserted nowhere. Those read as covered in any
  count-based matrix, which is how all three rows came to be marked covered in the first
  place.
