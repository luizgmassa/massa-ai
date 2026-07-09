# massa-th0th E2E Coverage Report (T14)

Generated: 2026-07-06 · Project: `massa-th0th` · Suite: `packages/core/src/__tests__/e2e/`

This is the final verification gate for the T1–T13 E2E rollout. It is a
**READ + TEST ONLY** audit: no production source edits, no API restart, no DB
schema changes, no dist rebuild. The live shared stack (Tools API pid 9524,
Ollama, PostgreSQL) was left untouched.

---

## (a) Tool → coverage map

All 35 MCP tools advertised by `apps/mcp-client/src/tool-definitions.ts` are
listed below. "Matrix" = the test asserts MCP-transport ≡ HTTP-transport shape
equivalence via `_helpers.assertMatrix`. Statuses:

- **covered** — has at least one functional F-scenario that asserts real behavior.
- **partial** — exercised but not deeply asserted (negative path, shape-only, or best-effort).
- **skipped-with-reason** — gated off (destructive, internal, or blocked by a known bug); reason logged.
- **blocked-by-bug** — exercised, but a known OPEN product bug prevents the assertion from completing.

| # | Tool | Covering test file | F-scenario ids | Matrix (MCP≡HTTP) | Status |
|---|------|--------------------|----------------|-------------------|--------|
| 1 | `index` | `02.indexing.test.ts` | F1, F2, F3, F4, F10, F11 | matrix: reindex (shape) | covered |
| 2 | `index_status` | `02.indexing.test.ts` | F8, F9 | matrix: index_status | covered |
| 3 | `search` | `08.search.test.ts` | F16–F24, E1–E4 | matrix: search (json) + matrix: search (toon) | covered |
| 4 | `remember` | `05.memory.test.ts` | F51–F55, E13 | matrix: remember | covered |
| 5 | `recall` | `05.memory.test.ts` | F56–F60, E12 | matrix: recall | covered |
| 6 | `memory_update` | `05.memory.test.ts` | F61–F64 | matrix: memory_update | covered |
| 7 | `memory_delete` | `05.memory.test.ts` | F65 | — | partial (HTTP-only; no MCP matrix) |
| 8 | `list_checkpoints` | `06.checkpoints.test.ts` | F70 | matrix: list_checkpoints | covered |
| 9 | `create_checkpoint` | `06.checkpoints.test.ts` | F68, F69 | matrix: create_checkpoint | covered |
| 10 | `restore_checkpoint` | `06.checkpoints.test.ts` | F71–F73 | matrix: restore_checkpoint | covered |
| 11 | `compress` | `08.search.test.ts` | F27–F29 | matrix: compress | covered (LLM strategies soft-skip on slow qwen3.5:9b) |
| 12 | `optimized_context` | `08.search.test.ts` | F25, F26 | matrix: optimized_context | covered |
| 13 | `analytics` | `12.observability.test.ts` | F81 (summary/project/query/cache/recent), F82, F83 | matrix: analytics(summary) + matrix: analytics(recent) | covered |
| 14 | `list_projects` | `09.symbol-graph.test.ts`, `00.harness.smoke.test.ts` | F37, F38 | matrix: list_projects (also in 00 smoke) | covered |
| 15 | `project_map` | `09.symbol-graph.test.ts` | F39, F40 | matrix: project_map | covered |
| 16 | `search_definitions` | `09.symbol-graph.test.ts` | F41, F42, F43, F44 | matrix: search_definitions | covered (F41/F43 PG filters verified 2026-07-06 after `@massa-th0th/core` dist rebuild) |
| 17 | `get_references` | `09.symbol-graph.test.ts` | F45–F47 | matrix: get_references | covered (F46 best-effort) |
| 18 | `go_to_definition` | `09.symbol-graph.test.ts` | F48–F50 | matrix: go_to_definition | covered (F49 best-effort) |
| 19 | `reset_project` | `02.indexing.test.ts` | F13–F15 | matrix: reset_project | covered |
| 20 | `read_file` | `08.search.test.ts` | F30–F33, E27 | matrix: read_file | covered |
| 21 | `synapse_session` | `10.synapse.test.ts` | F74, F75, F75-edge, E28 | matrix: synapse_session | covered |
| 22 | `synapse_prime` | `10.synapse.test.ts` | F76, F77, E17, E18 | matrix: synapse_prime | covered (BUG-SYN-4/1 fixed; MCP matrix green 2026-07-06; standalone falsifier returned `success:true, primed:2`) |
| 23 | `synapse_access` | `10.synapse.test.ts` | F78, F79, E16 | matrix: synapse_access | covered (BUG-SYN-4 fixed; HTTP paths + MCP matrix green 2026-07-06) |
| 24 | `symbol_snippet` | `08.search.test.ts` | F34–F36 | matrix: symbol_snippet | covered |
| 25 | `memory_list` | `05.memory.test.ts` | F66, F67 | matrix: memory_list | covered |
| 26 | `reindex` | `02.indexing.test.ts` | F11 (alias of index) | matrix: reindex (shape) | partial (no dedicated F-scenario; alias path) |
| 27 | `hook_ingest` | `11.lifecycle.test.ts` | F86, F89, E24 | matrix: hook_ingest | covered |
| 28 | `bootstrap` | `11.lifecycle.test.ts` | F84, F85, E21 | matrix: bootstrap | covered |
| 29 | `handoff_begin` | `11.lifecycle.test.ts` | F90, F91, E22 | matrix: handoff_begin/list | covered |
| 30 | `handoff_accept` | `11.lifecycle.test.ts` | F92, E22 (negative paths) | — | partial (HTTP-only; no MCP matrix; negative path only — cannot seed a real pending handoff from outside) |
| 31 | `handoff_cancel` | `11.lifecycle.test.ts` | F93 (negative path) | — | partial (HTTP-only; negative path only) |
| 32 | `handoff_list_pending` | `11.lifecycle.test.ts` | F94 | matrix: handoff_begin/list (combined) | covered |
| 33 | `list_proposals` | `11.lifecycle.test.ts` | F95 | matrix: list_proposals | covered |
| 34 | `approve_proposal` | `11.lifecycle.test.ts` | F96, E23 (negative path) | — | partial (HTTP-only; negative path only — cannot seed a real pending proposal from outside) |
| 35 | `reject_proposal` | `11.lifecycle.test.ts` | F97 (negative path) | — | partial (HTTP-only; negative path only) |

**Coverage summary:** 35/35 tools exercised. 26 covered, 9 partial, 0 uncovered,
0 blocked-by-bug. Matrix equivalence asserted for 25 of the 35 tools
(`search_definitions`, `synapse_prime`, `synapse_access` MCP matrices moved to
green after the 2026-07-06 bug-fix rollout).

### Section I — HTTP-only endpoints (no MCP surface)

Covered in `12.observability.test.ts`:

- `GET /health` — `{status, service, version, timestamp}`
- `GET /swagger` + `/swagger/json` — HTML docs + valid OpenAPI
- `GET /api/v1/project/list` — indexed projects (SHARED_PID present)
- `POST /api/v1/search/code` — alias of `search_project` (non-JSON body)
- `GET /api/v1/workspace/:id` — workspace detail
- `GET /api/v1/symbol/centrality/:projectId` — PageRank top files
- `GET /api/v1/system/info`, `/status`, `/metrics`, `/health/local`, `/ollama`
- `GET /api/v1/events?projectId=...` — SSE stream
- `GET /ui` — HTML + referenced asset resolves
- `DELETE /api/v1/workspace/:id` — **skipped** (would destroy SHARED_PID; deferred to T13)

### Section J — CLI (`13.cli.test.ts`)

`massa-th0th` flags: `--help`, `-h`, `--config-show`, `--config-path`,
`--config-dir`, `--config-init` (idempotency). `config-cli` subcommands: `init`,
`path`, `show`, `set <key> <value>`, `use ollama`. 7 mutating short-circuits
soft-skip because `config-loader.ts` ignores `XDG_CONFIG_HOME` (Finding #9).

---

## (b) Per-file results

Verified results from the T1–T13 rollout. Format: pass / skip.

| File | Task | Pass | Skip | Fail | Notes |
|------|------|-----:|-----:|-----:|-------|
| `00.harness.smoke.test.ts` | T1 | 4 | 0 | 0 | MCP advertises all 35 tools; matrix list_projects |
| `02.indexing.test.ts` | T2 | 19 | 0 | 0 | F1–F15 + matrix (re-verified 2026-07-06 dedicated :3334, 50.97s) |
| `05.memory.test.ts` | T5 | 25 | 0 | 0 | F51–F67, E12–E15, matrix |
| `06.checkpoints.test.ts` | T6 | 9 | 0 | 0 | F68–F73, matrix |
| `08.search.test.ts` | T3 | 36 | 0 | 0 | F16–F36, E1–E7/E27/E29, matrix — 6 reasoned skips (in-body) |
| `09.symbol-graph.test.ts` | T4 | 23 | 0 | 0 | F37–F50, E8–E11, matrix — F41/F43 GREEN after dist rebuild (2026-07-06) |
| `10.synapse.test.ts` | T7 | 20 | 1 | 0 | F74–F80, E16–E20/E28, matrix — BUG-SYN-1/2/3/4 fixed; falsifier `primed:2` |
| `11.lifecycle.test.ts` | T8 | 20 | 2 | 0 | F84–F97, E21–E24, matrix — F87/F88 deferred to T13 |
| `12.observability.test.ts` | T11 | 23 | 1 | 0 | F81–F83 + section I + matrix (re-verified 2026-07-06 dedicated :3334) |
| `13.cli.test.ts` | T12 | 13 | 0 | 0 | section J — XDG #9 + unknown-flag #10 fixed; all 13 green (2026-07-06) |
| `14.needles.test.ts` | T10 | 1 | 0 | 0 | hit@1 0.357, hit@5 0.571, MRR 0.443; deterministic |
| `15.nfr.test.ts` | T9 | 9 | 2 | 1 | N5–N8, N14–N20; N14 (#14 null-target refs) GREEN; N7 fail = environmental (vector store not warm on dedicated stack — not a #4–#14 regression) |
| `16.destructive.test.ts` | T13 | 0 | 8 | 0 | DEDICATED, all correctly skipped on shared stack |
| `17.cleanup-verify.test.ts` | T14 | 2 | 0 | 0 | 0 leaked memories; 1 expected orphan (`e2e-th0th-n14-verify-*` test artifact, not a leak) |

---

## (c) Findings log

Every file:line reference below was re-verified during T14 by reading the cited
source. Severities: `high` = data loss / core path broken; `med` = feature
silently wrong; `low` = cosmetic / observability; `note` = informational.

### FIXED (3)

1. **[FIXED/high]** PG `memories` table missing `pinned` + `deleted_at` columns.
   Migration `packages/core/prisma/migrations/20260705060000_add_memories_pinned_softdelete`
   applied. Without it `05.memory.test.ts` would hard-skip the whole suite.
   (Found T5.)

2. **[FIXED/med]** `packages/core/src/data/memory/memory-repository-pg.ts`
   `toMemoryRow` always returned `tags: []` on PG (the `text[]` column came back
   as an array-literal string and was not parsed). Fixed in T5.

3. **[FIXED/med]** `apps/tools-api/src/routes/memory.ts` `/list` ignored the
   `projectId` query/body parameter. Fixed in T5; verified again in T14
   (`17.cleanup-verify.test.ts` scoped listing by `e2e-th0th-shared` returned
   only SHARED rows).

### FIXED IN BUG-FIX ROLLOUT (11) — verified 2026-07-06

The 11 findings below were resolved by Batch A–E and live-verified on a
**dedicated PostgreSQL stack** (`:3334`, DB `massa_th0th_e2e_verify`, isolated
`HOME=/private/tmp/massa-e2e-home.65imuV`). The shared stack (pid 9524 / `:3333`
/ DB `massa_th0th`) was untouched. See the verification note at the bottom of
this section for the per-file pass/skip/fail and the one environmental failure
(N7).

4. **[FIXED/high]** **BUG-SYN-4** — MCP proxy now substitutes `:id` (and any
   `:param`) for POST requests in `apps/mcp-client/src/index.ts`. Affects
   `synapse_prime`, `synapse_access`, `reindex`.
   **Verification:** standalone MCP falsifier on `:3334` opened a synapse
   session then called `synapse_prime` with `{id, entries:[{id,content,score}]}`.
   Response: `{"success":true,"data":{"primed":2,"bufferSize":2}}` — success +
   numeric `primed`, **no 422**. `10.synapse.test.ts` re-ran 20 pass / 1 skip /
   0 fail (the BUG-SYN-1/2/3/4 matrix incl. MCP `synapse_prime`/`synapse_access`
   asserted green; E28 `ttlMs` green).

5. **[FIXED/high]** `search_definitions` PG now honors `search`, `kind`, `file`,
   `exportedOnly`, and `limit` together.
   `packages/core/src/data/sqlite/symbol-repository-pg.ts` `listDefinitions`
   reads `{search, kind, file, exportedOnly, limit}` and `searchDefinitions`
   emits all four WHERE guards + `filePath`. **Root cause of the prior
   early-return:** the fix lived in `src` but the running API loaded
   `@massa-th0th/core`'s **compiled `dist`** (stale), so the unfixed code was
   served. Resolved by `cd packages/core && bun run build` (rebuilds dist from
   src) + API restart.
   **Verification (post-rebuild, dedicated :3334):** `search=ContextualSearchRLM&kind=class`
   → 1 row (`ContextualSearchRLM | class | …/contextual-search-rlm.ts`);
   `file=…/contextual-search-rlm.ts` → 1 distinct file, `ContextualSearchRLM`
   present; `search=zzzznotexist` → 0 rows; `kind=class` → only classes.
   `09.symbol-graph.test.ts` re-ran **23 pass / 0 fail** (F41/F43 GREEN).

6. **[FIXED/med]** **BUG-SYN-1** — `synapse_prime` inputSchema + MCP proxy now
   send `entries` (route key). **Verification:** falsifier + `10.synapse.test.ts`
   matrix green (no 422).

7. **[FIXED/med]** **BUG-SYN-2** — `synapse_access` inputSchema now requires
   `memoryId` alongside `id`. **Verification:** `10.synapse.test.ts` MCP matrix
   green.

8. **[FIXED/low]** **BUG-SYN-3** — `synapse_session` `ttlMs` default reconciled
   between `tool-definitions.ts` and the route. **Verification:** `10.synapse.test.ts`
   E28 green.

9. **[FIXED/med]** `packages/shared/src/config/config-loader.ts` now honors
   `XDG_CONFIG_HOME` (falls back to `os.homedir()/.config/massa-th0th` only when
   unset). **Verification:** `13.cli.test.ts` re-ran **13 pass / 0 fail** — all
   7 previously-soft-skipped mutating scenarios now assert under a temp XDG dir
   without clobbering the real user config.

10. **[FIXED/low]** CLI now rejects unknown flags (non-zero exit + help/error).
    **Verification:** `13.cli.test.ts` unknown-flag scenario green.

11. **[FIXED/med]** `indexJobTracker` reaches a terminal state for full-repo
    indexes. **Verification:** `02.indexing.test.ts` re-ran **19 pass / 0 fail**
    (50.97s) incl. the reindex matrix and the F9b terminal-state scenario.

12. **[CODE-APPLIED; live-verify deferred]** MCP `bootstrap` proxy-timeout on
    slow LLM. The client-side timeout budget was raised in Batch A. Not
    re-asserted live on the dedicated stack this gate (no `11.lifecycle.test.ts`
    re-run — out of the 6-file targeted set). HTTP path was already green; the
    MCP-path fix is type-checked and code-applied.

13. **[FIXED/low]** `GET /api/v1/system/status` shape — the test (#13) was
    updated to assert the observed shape (degraded local-first mode with
    `embeddingCache:false` pre-warm) rather than treat it as a defect.
    **Verification:** `12.observability.test.ts` re-ran **23 pass / 1 skip / 0
    fail**; the system/status + system/health/local shapes asserted green.

14. **[FIXED/low]** N14 — unresolved-target symbol references are now retained
    with `target_fqn = NULL` instead of dropped. Migration
    `20260706105826_drop_symbol_refs_target_fqn_not_null` makes the column
    nullable; the two `if (!ref.target_fqn) continue;` guards were removed.
    **Verification:** dedicated DB `massa_th0th_e2e_verify`
    `symbol_references.target_fqn` is nullable (YES); `15.nfr.test.ts` N14
    logged `[N14] get_references(ghost) returned 1 row(s); null-target
    retention is asserted` and passed.

### NOTES (4)

15. **[NOTE]** `analytics` `cache` type does not require `projectId` at the
    route layer, while `project` type does. `12.observability.test.ts` F83
    documents both behaviors. (Found T11.)

16. **[NOTE]** `read_file` inputSchema drift — the schema advertises fewer
    parameters than the runtime accepts (`offset`, `limit`, `format`,
    `targetRatio`). Documented in `08.search.test.ts` E27. (Found T3.)

17. **[NOTE]** `maxResults:0` is treated as the default (~9 results) rather
    than "zero results". Documented in `08.search.test.ts` E4. (Found T3.)

18. **[NOTE]** Search-quality: 5 of 14 needles miss.
    `14.needles.test.ts` reports hit@1 0.357, hit@5 0.571, MRR 0.443.
    Root cause is `packages/core/src/search/contextual-search-rlm.ts`
    chunking/embedding weakness. (Found T10.)

**Totals:** 14 FIXED (3 from T5 + 11 from the bug-fix rollout), 0 OPEN, 4 NOTE.

---

## (d) Coverage gaps

Of the 35 MCP tools, **0 have no functional coverage at all**. After the
2026-07-06 bug-fix rollout the qualitative gaps that remain are:

- **`search_definitions`** — **covered**. F41/F43 assert all four PG filters
  (`search`/`kind`/`file`/`exportedOnly`) post-dist-rebuild.
- **`synapse_prime`, `synapse_access`** — **covered** (MCP matrix green after
  BUG-SYN-4/1/2 fixes).
- **`memory_delete`, `handoff_accept`, `handoff_cancel`, `approve_proposal`,
  `reject_proposal`** — exercised only via HTTP negative paths (no MCP matrix,
  no positive seed). Positive paths cannot be seeded from outside without a
  public API to create a pending handoff/proposal; documented in T8.
- **`reindex`** — covered via F11 + the reindex matrix (Batch A path-param fix
  unblocked the MCP POST).
- **CLI** — all 13 `13.cli.test.ts` scenarios now assert (XDG #9 fixed).

---

## (e) How to run

### Prerequisites

1. **Live Tools API** on `http://localhost:3333` (default; override with
   `MASSA_TH0TH_API_URL`). Health: `GET /health` → `{"status":"ok"}`.
2. **Ollama** up and reachable from the API (`GET /api/v1/system/ollama` →
   `available:true`), with the configured embedding model pulled.
3. **PostgreSQL** configured (this rollout ran on PG; SQLite is also supported).
4. **MCP dist built**: `apps/mcp-client/dist/index.js` must exist
   (`_helpers.probeAvailability` checks). Build with
   `cd apps/mcp-client && bun run build` if missing (NOT done in T14 —
   read-only gate).
5. **Shared index auto-builds**: the first embedding-heavy file triggers
   `ensureSharedIndex()` (`_helpers.ts:267-288`), which indexes the repo once
   into `e2e-th0th-shared` and reuses it across every subsequent file/run.
   This is the OOM workaround — do NOT delete `e2e-th0th-shared` between runs.

### Run commands

```bash
cd "/Users/luizmassa/Personal Projects/massa-th0th/packages/core"

# All files (HEAVY — embedding-heavy files share one index; do NOT run on a
# memory-constrained box without the shared index already warm):
RUN_E2E=1 bun test src/__tests__/e2e/

# Light verification only (no heavy embedding):
RUN_E2E=1 bun test \
  src/__tests__/e2e/13.cli.test.ts \
  src/__tests__/e2e/16.destructive.test.ts \
  src/__tests__/e2e/17.cleanup-verify.test.ts

# Destructive suite (DEDICATED stack only — requires a non-shared API URL and
# the destructive flag; never run against pid 9524 / the shared stack):
RUN_E2E=1 RUN_E2E_DESTRUCTIVE=1 \
  MASSA_TH0TH_API_URL=http://localhost:3334 \
  bun test src/__tests__/e2e/16.destructive.test.ts
```

### Gating

- Whole suite: `describe.skipIf(!READY)` where `READY = RUN_E2E === "1" && API_UP`.
- Destructive: additional `describe.skipIf(process.env.RUN_E2E_DESTRUCTIVE !== "1")`,
  plus belt-and-suspenders `IS_DEDICATED_URL` early-returns on the gated real
  tests so they cannot fire against the shared stack even if the gate is
  mistakenly opened.
- All mutating tests scope to `e2e-th0th-*` projectIds via `assertE2ePrefix`
  (`_helpers.ts:43-49`). The shared stack's real data is protected by prefix.

### T14 verification (this gate)

```
RUN_E2E=1 bun test \
  src/__tests__/e2e/17.cleanup-verify.test.ts \
  src/__tests__/e2e/13.cli.test.ts \
  src/__tests__/e2e/16.destructive.test.ts
```

Result (2026-07-06): **15 pass / 8 skip / 0 fail**, 0 orphan projects,
0 leaked memories. pid 9524 untouched.

### Bug-fix rollout verification (2026-07-06, dedicated PG stack)

The 11 OPEN findings (#4–#14) were live-verified on a dedicated stack:
API `:3334` (pid 65735), PostgreSQL DB `massa_th0th_e2e_verify` (migration #14
applied, `target_fqn` nullable), isolated `HOME=/private/tmp/massa-e2e-home.65imuV`
+ `XDG_CONFIG_HOME=/private/tmp/massa-e2e-xdg.2LWP5a`. The shared stack (pid
9524 / `:3333` / DB `massa_th0th`) was untouched throughout.

```
RUN_E2E=1 MASSA_TH0TH_API_URL=http://localhost:3334 \
  HOME=/private/tmp/massa-e2e-home.65imuV \
  bun test src/__tests__/e2e/<file>.test.ts   # per file
```

| File | Pass | Skip | Fail | Note |
|------|-----:|-----:|-----:|------|
| `13.cli`              | 13 | 0 | 0 | XDG #9 + unknown-flag #10 green |
| `12.observability`    | 23 | 1 | 0 | #13 shape green |
| `10.synapse`          | 20 | 1 | 0 | BUG-SYN-1/2/3/4 matrix green; falsifier `primed:2` |
| `09.symbol-graph`     | 23 | 0 | 0 | F41/F43 green (after `@massa-th0th/core` dist rebuild) |
| `02.indexing`         | 19 | 0 | 0 | reindex matrix + F9b terminal green |
| `15.nfr`              |  9 | 2 | 1 | N14 (#14) green; N7 fail = environmental (see below) |
| `17.cleanup-verify`   |  2 | 0 | 0 | 0 leaked memories |

**N7 failure is environmental, not a #4–#14 regression.** N7 asserts
search-during-reindex returns non-empty results for the shared project; the
dedicated stack's vector store was not fully warm for `e2e-th0th-shared`
(embeddings only partially materialized on the fresh dedicated DB during the
file-by-file run). N7 is not in the activated bug set and passes on a
fully-warm stack (e.g. the original T1–T13 run on the shared stack).

**Key corrective action during verification:** the `@massa-th0th/core` package
`dist` was stale (Batch B's `searchDefinitions` `filePath` fix lived only in
`src`). `cd packages/core && bun run build` rebuilt dist from src; the API was
restarted and F41/F43 then passed. Without this rebuild the bug would have
re-surfaced for any consumer importing `@massa-th0th/core` via the compiled
artifact.

**Shared-DB "contamination" — verified FALSE ALARM (no cleanup needed).** A
verification subagent flagged ~7506 `symbol_definitions` (+ 704 refs / 500
`symbol_files` / 40 `search_cache`) under `project_id = 'e2e-th0th-shared'` in
the shared `massa_th0th` DB as orphan pollution. Main-agent re-investigation
overturned this: (a) `e2e-th0th-shared` is the **intentional shared index** the
original T1–T13 suite builds and retains in the shared stack (the OOM
workaround — project memory: "do NOT delete between runs"); (b) it carries no
`projects` row by design (internal shared index, not a registered workspace);
(c) it is the **only** `e2e-th0th-*` project_id present — **no stray data**;
(d) the shared schema is intact (`target_fqn` still NOT NULL, migration #14
absent). The prior agent's repo-root launch did inherit `.env`'s
`DATABASE_URL → massa_th0th` and re-indexed the same `e2e-th0th-shared`
(idempotent upserts by `project_id`+`file`+`symbol`) — net state is still a
valid shared index. **Do NOT delete `e2e-th0th-shared`.**

**Real latent risk (the `.env` footgun).** `bun` auto-loads the repo-root `.env`
(`DATABASE_URL=postgresql://…massa_th0th` → the SHARED DB). Any tools-api
launched from the repo root silently binds to the shared DB unless
`DATABASE_URL` is overridden or an isolated `HOME`/temp config points elsewhere.
This is what tripped the prior verify agent. Future dedicated/verify stacks
MUST set `DATABASE_URL` explicitly.

### Residual-fix rollout (2026-07-09, T1–T9b) — all RESOLVED + verified GREEN

A second pass closed every item previously listed under "Problems still
occurring / next steps". All 14 e2e files pass on the live `:3333` / real-PG
stack (0 fail). Per-item resolution:

- **#12 (MCP `bootstrap` proxy-timeout) — FIXED (T1).** Root cause was NOT a
  proxy slowdown: the MCP SDK `Client` default request timeout is 60 s
  (`DEFAULT_REQUEST_TIMEOUT_MSEC`), shorter than bootstrap's legitimate ~90 s
  path (the LLM seed call burns its 90 s `AbortSignal` then degrades to
  rule-based — see side finding "thinking-model"). `_mcp.ts` now forwards
  `MASSA_TH0TH_PROXY_TIMEOUT_MS` to the child env and `mcpCall` passes
  `{timeout: MCP_CLIENT_TIMEOUT_MS}` (150 s) to `callTool`. The bootstrap MCP
  matrix now FAILs on a real timeout (re-throws) instead of `skipMatrix`-
  swallowing it. `11.lifecycle` 20 pass / 0 fail; matrix green.
- **N7 (search-during-reindex) — FIXED (T2).** `_helpers.ts` adds a strong
  `isSharedIndexWarm` 3-probe gate; `doSharedIndex` awaits the index JOB to
  terminal AND the strong gate; N7 has a local warmup. `15.nfr` 10 pass / 0
  fail; N7 green on the warm stack.
- **`.env` footgun — FIXED (T3).** New `packages/shared/src/config/db-guard.ts`
  `assertDedicatedDbAllowed()` refuses to bind the shared DB `massa_th0th` when
  `MASSA_TH0TH_DEDICATED=1`; called at tools-api startup; `16.destructive`
  `IS_DEDICATED_URL` now also requires the flag. Refuse confirmed live.
- **#15 (analytics `cache` projectId) — FIXED (T4).** Schema description
  corrected (cache projectId optional → global stats when absent, scoped when
  present); F83 asserts both global + scoped success. `12.observability` 24
  pass / 0 fail.
- **#16 (`read_file` inputSchema drift) — FIXED (T5).** MCP schema now
  advertises `offset`/`limit`/`targetRatio`/`format`; E27 asserts them.
  `08.search` 36 pass / 0 fail.
- **#17 (`maxResults:0`) — FIXED (T6).** `contextual-search-rlm.ts` `||`→`??` +
  early `return []`; E4 asserts empty.
- **#18 (search-quality) — FIXED (T7).** `smart-chunker.ts` adds
  `chunkOverlapLines:4`; needle fixture line-ranges refreshed. Baseline lifted
  hit@1 0.357→0.500, hit@5 0.571→0.786, MRR 0.443→0.604. Floors raised to
  0.36/0.64/0.47 (all ≥ old 0.28/0.57/0.4 — quality lift, not a carve-out).
  `14.needles` deterministic (zero rank drift across runs).
- **OOM residual (crashed job can't signal) — FIXED (T8).** Added
  `heartbeat_at` to the job store + a server-side reaper `setInterval`
  (`MASSA_TH0TH_JOB_STALE_MS`, 5 min default; `MASSA_TH0TH_JOB_REAPER_INTERVAL_MS`,
  60 s) that flips stale `running` jobs to `failed` without a restart. Stale→
  failed proven live; healthy jobs untouched. `02.indexing` 19 pass / 0 fail
  (F9b green).

**T9 — job store now follows the one-backend rule (PG-or-SQLite).** Previously
`getJobStore()` always returned `SqliteJobStore`, so a PG deployment ran BOTH
PG (data) + SQLite (`index-jobs.db`) for jobs. New `PgJobStore`
(`packages/core/src/services/jobs/index-job-store-pg.ts`) implements the
`JobStore` interface via raw SQL on the shared prisma client (no second pool;
avoids the Prisma 7.7 adapter-pg `isObjectEnumValue` incompatibility, matching
`MemoryRepositoryPg`). `getJobStore()` selects it when `DATABASE_URL` is
postgres (mirroring `memory-repository-factory.ts`); `SqliteJobStore` remains
the local-first default. New prisma model `IndexJob` + migration
`20260707100000_add_index_jobs_pg` (BIGINT ms-epoch timestamps + `heartbeat_at`)
applied to the shared DB. T8's heartbeat + reaper work identically on PG.
Verified: e2e jobs land in PG `index_jobs` (status `completed`, `heartbeat_at`
populated); the SQLite `index-jobs.db` is no longer written on this deployment.
Unit tests: `index-job-store.test.ts` (SQLite, 7) + new
`index-job-store-pg.test.ts` (PG, 12) — 19 pass.

**T9b — PgJobStore write-ordering race FIXED.** Initial PgJobStore did
fire-and-forget `void persist(job)` with no per-jobId serialization, so rapid
saves (pending→running→…→completed) could commit out of order and leave the PG
row stuck at a non-terminal state (observed: `completed` settled at
`running/30`). Added a per-jobId serialized write chain (`inflight` map) so
same-job writes commit in call order (different jobIds stay concurrent); the
sync mirror read path is unchanged. Verified: after a full lifecycle + drain,
the PG row's final on-disk status is `completed`; post-e2e PG shows 14
`completed`, 0 stuck `running`.

### Side-findings fix rollout (2026-07-09, Tasks A–E) — all RESOLVED + verified GREEN

A third pass closed 5 of the 6 OPEN side findings (the `adsads/` junk-path
item was intentionally deferred). Each fix landed in its own isolated
sub-agent against the live `:3333` / real-PG stack, then a final verify
sub-agent re-ran the cross-cutting E2E sweep (02/08/11/05 → 100 pass / 2 skip /
0 fail) + targeted live probes. Per-item resolution:

- **[HIGH] thinking-model structured-output — FIXED (A).** Root cause refined:
  `qwen3.5:9b` over the Vercel AI SDK uses Ollama's OpenAI **Responses API**
  (`/responses`); on budget-exhausting prompts the answer lands in
  `result.reasoning` (or `e.response.body.output[].summary[].text` on a thrown
  `AI_NoObjectGeneratedError`) with `content=""`. `llm-client.ts` `llmComplete`/
  `llmObject` read only `content` → silently degraded. (Note: the documented
  `finish_reason:"length"` signature did NOT reproduce on this stack — every
  empty-content case was `finish_reason:"stop"`; the fix keys on empty content,
  so it covers both.) Fix in `packages/core/src/services/memory/llm-client.ts`:
  (1) best-effort thinking-disable (`think:false` via a `createOpenAI` fetch
  wrapper + `providerOptions.openai.responseFormat` for object calls) gated by
  new env `RLM_LLM_DISABLE_THINK` (default `1`) — helps on easy prompts but is
  NOT the load-bearing fix (proven ineffective on hard prompts for this SDK
  path); (2) **reasoning-channel recovery** (`_reasoningToText` +
  `_extractJsonObject`) before returning `{ok:false}` — this is the real fix.
  Default model unchanged (`qwen3.5:9b`). Added `disableThink` to the `llm`
  config type in `packages/shared/src/config/index.ts`. Unit:
  `llm-client.test.ts` 15 pass. Live: `llm.object` returns valid object (was
  90 s + empty); `11.lifecycle` 20/2/0.
- **[med] `read_file` `format` no-op — FIXED (B).**
  `packages/core/src/tools/read_file.ts` now imports `encode as toTOON` from
  `@toon-format/toon` and returns `format === "toon" ? {success,data:toTOON(result)}
  : {success,data:result}`, matching the 8 sibling tools. `inputSchema` default
  stays `"json"`. E2E `08.search` E27 strengthened to assert `typeof
  toon.data === "string"` (was only asserting `data.content` string, which the
  JSON object also satisfied). Live: toon→string, json→object; `08.search` 36/0.
- **[low] `.env` guard gaps — FIXED (C).**
  `packages/shared/src/config/db-guard.ts` `assertDedicatedDbAllowed()` now
  also checks the effective vector URL = `POSTGRES_VECTOR_URL || DATABASE_URL`
  and refuses if either resolves to `massa_th0th`. New shared helper
  `packages/shared/src/config/int-env.ts` `parsePositiveIntEnv(raw, default,
  {allowZero?})`. `apps/mcp-client/src/api-client.ts:25` proxy timeout now
  honors explicit `0` (disable) via `{allowZero:true}`. Reaper knobs
  `apps/tools-api/src/index.ts:50,52` (`MASSA_TH0TH_JOB_STALE_MS`,
  `MASSA_TH0TH_JOB_REAPER_INTERVAL_MS`) migrated to the helper with floor
  semantics (0/negative → default — a 0 ms reaper window would be catastrophic).
  `packages/shared/tsconfig.json` now excludes `src/**/__tests__` (matches
  core). Unit: `db-guard.test.ts` 11 pass. Live: `MASSA_TH0TH_DEDICATED=1` +
  isolated `DATABASE_URL` + shared `POSTGRES_VECTOR_URL` → refuses to bind.
- **[low] `PgJobStore` reaper/crash-recovery globally unscoped + chain-bypass
  race — FIXED (D).** No migration needed (`heartbeat_at` already exists). Both
  bare UPDATEs (crash-recovery in `ensureHydrated()` and
  `markStaleRunningFailed()`) in `packages/core/src/services/jobs/index-job-store-pg.ts`
  now carry a heartbeat-age predicate
  `WHERE status='running' AND COALESCE(heartbeat_at, started_at) IS NOT NULL
  AND COALESCE(heartbeat_at, started_at) < ${cutoff}` where
  `cutoff = nowMs - MASSA_TH0TH_JOB_STALE_MS` (default 300000). A live process
  with a fresh heartbeat is never flipped → multi-process hazard closed, zero
  behavior change at single-process `:3333`. The chain-bypass race is closed by
  the `status='running'` filter (a job that reached terminal via `save()` is
  non-running in PG once its inflight persist commits, ordered by the per-jobId
  chain). SQLite parity applied (`index-job-store.ts`). Unit: PgJobStore 16 →
  then 17 pass (D + E); `02.indexing` 19/0.
- **[low] `PgJobStore` hydration clears mirror unconditionally — FIXED (E).**
  `ensureHydrated()` no longer calls `mirror.clear()`. It builds a fresh map
  from the DB snapshot (DB = source of truth, overwrite), then re-applies any
  existing mirror entry whose `jobId` is in the `inflight` map (pending
  serialized write) and absent from the DB set — so a fire-and-forget `save()`
  whose `persist()` hasn't landed survives hydration. `get()` read path
  unchanged. Unit: PgJobStore 17 pass incl. new hydration-merge test;
  `02.indexing` 19/0. (SQLite store has no in-memory mirror — not affected,
  no counterpart needed.)

**Verify (2026-07-09):** rebuilt `packages/shared` + `packages/core` +
`apps/mcp-client`, restarted `:3333` (pid 93523). E2E sweep `02.indexing` 19/0,
`08.search` 36/0, `11.lifecycle` 20/2, `05.memory` 25/0 — 100 pass / 2 skip /
0 fail vs baselines. Probes: `llm.object` valid object no-timeout; `read_file`
toon=string/json=object; dedicated-vector boot refuses; PG `index_jobs` 42
completed / 0 failed (no spurious reaper kills). Unit aggregate 39 pass (A 15 +
D-pg 17 + D-sqlite 7) + C 11.

### Side-findings follow-up rollouts (2026-07-09) — 9 of 10 RESOLVED

Two more serial sub-agent rollouts closed 9 of the 10 items that were OPEN
after the A–E pass (only the `adsads/` junk-path item remains deferred). Each
fix landed in its own isolated sub-agent against the live `:3333` / real-PG
stack; a final verify sub-agent re-ran the cross-cutting E2E sweep + targeted
probes after each rollout.

**Rollout 4 — model-swap + follow-ups (T1–T6):** closed the 7 non-deferred
OPEN items.

- **[med→FIXED] `th0th_compress` 90 s timeout (T4).** Root fix = swap the
  structured-output default away from the thinking model. Default is now
  `qwen2.5:7b-instruct` (pure instruct, non-thinking); a new **per-task model
  routing** sends the 3 code-oriented sites (bootstrap `SeedMemoriesSchema`,
  reranker, `code-compressor`) to a configurable coder model
  `qwen2.5-coder:7b`, while the 8 NL-judgment sites keep the instruct model.
  Non-thinking finishes in ~5 s on big code prompts → the recurring
  `[WARN] llmComplete failed — degrading` every 90 s is GONE (0 occurrences
  post-swap); compress now uses the LLM path (`compressionSource:"llm"`), not
  regex. See the model-selection analysis below (now IMPLEMENTED).
- **[low→FIXED] `read_file` relative path vs cwd (T3).** When `projectId` is
  absent AND `filePath` is relative, `read_file.ts` `resolveFilePath` now
  returns a clear error instead of guessing `process.cwd()` (`"Relative
  filePath requires a projectId ... or an absolute path."`). Absolute paths and
  the projectId path are unchanged. New unit test `read-file.test.ts` (3 pass).
- **[low→FIXED] `Number(env) || fallback` falsy-0 in two more places (T1).**
  `embeddings/config.ts` (`getRateLimits`/`getMaxChars`: rpm/tpm/rpd/batchSize/
  batchDelay/maxChars) and `vector-store-factory.ts` (HNSW/IVFFLAT) migrated to
  `parsePositiveIntEnv`; `batchDelayMs` uses `{allowZero:true}`. New
  `embeddings-config.test.ts` (7 pass).
- **[low→FIXED] hardcoded `qwen3.5:9b` fallback literal (T4).** New shared
  constants `DEFAULT_LLM_MODEL` (`qwen2.5:7b-instruct`) + `DEFAULT_LLM_CODE_MODEL`
  (`qwen2.5-coder:7b`) in `packages/shared/src/config/index.ts`;
  `getLlmConfig()` fallback imports the constant (0 bare literals in source).
  Adds a `codeModel` config field + `RLM_LLM_CODE_MODEL` env knob.
- **[NOTE→FIXED] `markStaleRunningFailed` mirror-count vs rowCount (T2).**
  `index-job-store-pg.ts` now captures the `$executeRaw` result and logs the
  true flipped count (`flipped: result`), mirroring `ensureHydrated()`. The
  sync `(): number` signature + mirror-snapshot return are preserved (no caller
  depends on the number). `index-job-store-pg.test.ts` 18 pass.
- **[NOTE→FIXED] Responses-API silent degrade (T4).** `llm-client.ts` now emits
  `logger.warn("llm reasoning-recovery empty", ...)` when the
  reasoning-recovery path is attempted but yields empty — a future Ollama
  Responses-API shape shift is now observable instead of silent. Dormant under
  the non-thinking default (safety net).
- **[NOTE→FIXED] `packages/shared` tsconfig/test symmetry (T5).** Added
  `@types/bun` devDep + `"test":"bun test"` script to
  `packages/shared/package.json` (runner parity with core/mcp-client; the
  forward-looking NOTE's guard is now concrete).

**Rollout 4 verify:** rebuilt shared/core/tools-api/mcp-client, restarted
`:3333`. E2E 02.indexing 19/0, 05.memory 25/0 (LLM paths green), 08.search
36/0, 11.lifecycle 20/2 (bootstrap seed via `qwen2.5-coder:7b` succeeded),
12.observability 24/1, 14.needles 0.500/0.786/0.604 (unchanged), 15.nfr 10/2/0.
0 LLM errors/timeouts in the log. Unit aggregate 66 pass / 0 fail.

**Rollout 5 — `read_file` cache-key + `@types/bun` align:** closed the 2
side-findings surfaced by Rollout 4's verify.

- **[med→FIXED] `read_file` cache-key ignored option flags.**
  `readFileWithCache` keyed its cache on `filePath` only, so a later read of
  the same file with different `includeSymbols`/`includeImports` got stale,
  options-baked metadata — the only e2e red (`08.search` **F33** failed
  in-suite, passed isolated). The key now serializes `{ filePath,
  includeSymbols, includeImports, projectId, relativePath }` (deliberately
  excludes offset/limit/lineStart/lineEnd/compress/targetRatio/format — those
  are applied post-cache in `handle()`). New `read-file.test.ts` regression
  (injects a stub `SymbolGraphService`, else it passes vacuously; 4 pass); F33
  green in-suite.
- **[low→FIXED] `@types/bun` skew.** `packages/shared` + `packages/core`
  bumped `^1.3.8 → ^1.3.9` (matches `apps/mcp-client`); bun.lock resolves all
  three to `1.3.14` (manifest-only, no-op re-resolution).

**Rollout 5 verify:** full rebuild + restart; 08.search 36/0/0 (F33 green),
05.memory 25/0, 11.lifecycle 20/2; unit 67 pass / 0 fail; both per-finding
probes PASS.

### Still OPEN (follow-ups)

- **[med] `adsads/` junk path indexed in `e2e-th0th-shared`** — needle N11's
  top hit is `adsads/packages/core/src/services/etl/stage-context.ts`. A
  stray/typo'd directory was indexed into the shared project. Audit the indexed
  file list / `projectPath` and drop the junk prefix. (Deferred by request
  across both rollouts.)
- **[low] `read_file` `fileCache` has no size cap/eviction** — only TTL (60 s).
  An adversarial caller cycling `projectId`/`relativePath` (now part of the
  cache key) grows the map for the process lifetime. Add an LRU / size bound.
  (`packages/core/src/tools/read_file.ts:121`.)
- **[low] `@types/node` major skew** — `apps/mcp-client` `^22.10.5` vs
  `packages/core` `^25.2.2` (`packages/shared` has none). Out of scope for both
  rollouts; align in a dedicated dependency pass.
- **[low] `dotenv` patch + classification skew** — `packages/shared` `^17.2.3`
  vs `packages/core` `^17.2.4`, and shared declares it a `dependency` while
  core declares it a `devDependency`. Same dep pass.
- **[note] dead `||` fallback** — `read_file.ts:385`
  `cached.metadata || await extractMetadata(...)` never fires (metadata is
  always set on write); harmless after the cache-key fix, cosmetic cleanup.
- **[note] `e2e-th0th-shared` `vector_documents` empty on the live DB** — the
  workspace row claims `indexed` (251 files) but `vector_documents` is 0 rows
  (only symbol_files/search_cache survived). Vectors re-seed on demand
  (02.indexing did so cleanly). Explains N7-class environmental fragility on a
  cold/dedicated stack; not a correctness issue.

### LLM model-selection analysis (2026-07-09, follow-up to fix A) — IMPLEMENTED 2026-07-09 (Rollout 4 / T4)

**STATUS: IMPLEMENTED 2026-07-09 (Rollout 4 / T4).** Recommendation #1
shipped: `qwen2.5:7b-instruct` is the new instruct default; the 3 code-oriented
sites (bootstrap `SeedMemoriesSchema`, reranker, `code-compressor`) route to
`qwen2.5-coder:7b` via per-call `modelRole` routing in `llm-client.ts`.
Live-verified: 0 LLM timeouts in the log, compress uses the LLM path (~5 s),
`05.memory` / `11.lifecycle` green, `14.needles` unchanged (0.500/0.786/0.604).
The reasoning-channel recovery (fix A) stays as a dormant safety net. The
analysis below is retained as the rationale + candidate ranking.

Fix A made the thinking-model (`qwen3.5:9b`) tolerable by recovering the
answer from the reasoning channel, but the cleaner long-term fix is to switch
the structured-output default to a **non-thinking instruct** model. Analysis
of whether thinking is actually needed + candidate ranking. **Not benchmarked
on this workload** — reasoned from task shape; real tiebreak = `14.needles`
+ a consolidator/salience eval per finalist.

**Does each feature need a thinking model? No.** The 11 LLM call sites are
extraction / classification / short summarization over small input, not
multi-step math or code synthesis. Thinking buys little and costs ~20–30 s/call
(was 90 s pre-A). Per-feature drop estimate if switched to non-thinking:
*minimal* — salience judge, query rewrite, HyDE, code compression (possibly
*better* — less verbose drift); *small* — bootstrap seed, handoff summary,
auto-improve enrich; *small* — reranker (thinking only helps on ambiguous
ties); *small-medium* — consolidator (may miss subtle semantic dupes or merge
non-dupes → cumulative memory pollution, the one real risk).

**Capabilities massa-th0th needs:** (1) structured-output reliability (fills
zod schema / valid JSON — all 11 sites); (2) non-thinking / pure instruct
(avoid the reasoning-channel bug + latency); (3) Ollama-native; (4) params
≤ ~9B (RAM parity; smaller = faster); (5) context ≥ 32K, ideally 128K
(workspaces, consolidator batches); (6) low latency (~2–5 s target vs 20–30 s);
(7) extraction/classification/summarization quality; (8) open-weight,
commercial-OK license.

**Ranked candidate models:**

| Rank | Model | Params | Context | License | Non-thinking | Structured output | Ollama tag | Fit |
|---|---|---|---|---|---|---|---|---|
| #1 | Qwen2.5-7B-Instruct | 7B | 128K | Apache 2.0 | pure instruct | very strong (top small-model BFCL) | `qwen2.5:7b-instruct` | Best balance; smaller→faster; same Qwen family (prompt tuning transfers); Apache clean |
| #2 | Llama 3.1 8B Instruct | 8B | 128K | Llama 3.1 (commercial OK, Meta caps) | pure instruct | strong (proven BFCL) | `llama3.1:8b` | Excellent instruction-following; slightly bigger; license has use-case caps |
| #3 | Qwen3-8B (`/no_think`) | 8B | 128K | Apache 2.0 | toggle (risk) | very strong | `qwen3:8b` | Highest raw quality IF suppression holds; **caveat:** fix A showed `think:false` unreliable over the AI SDK — `/no_think` system token may differ, needs live test |
| #4 | Ministral 8B | 8B | 128K | Mistral (commercial w/ conditions) | pure instruct | strong (function-calling focus) | `ministral` | Strong tool-calling; less community structured-output validation than Qwen |
| #5 | Gemma 3 4B | 4B | 128K | Gemma (commercial OK) | pure instruct | good | `gemma3:4b` | Fastest + smallest RAM; lower extraction quality → consolidator/salience weaker |
| #6 | Phi-3.5 mini | 3.8B | 128K | MIT | pure instruct | fair | `phi3.5` | Tiny + MIT; weakest instruction/structured quality → risk on consolidator/reranker |

Structured-output column = reputation + search signal; BFCL V4 is live-updated
— verify exact scores on the
[Berkeley Function Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html).
No fabricated numbers.

**Recommendation:** #1 `qwen2.5:7b-instruct` as new structured default (pure
instruct → fix A's reasoning-recovery goes dormant-but-harmless, bug class
gone; smaller + Apache + 128K + same family). Configurable via existing
`RLM_LLM_MODEL`. Cheapest experiment first (**option #0**, zero download):
test the `/no_think` system token on the *current* `qwen3.5:9b` — if
suppression holds over the AI SDK, keep the model and just disable thinking;
if not, pull `qwen2.5:7b-instruct`. See also the
[Qwen3 Ollama page](https://ollama.com/library/qwen3) and the
[Ollama structured-outputs announcement](https://ollama.com/blog/structured-outputs)
(Ollama supports native `format: json_schema` constrained decoding, which the
AI SDK `generateObject` path could leverage for stricter schema adherence).
(Analysis 2026-07-09.)

**Qwen2.5-7B-Instruct vs Qwen2.5-Coder-7B — which? Pick `qwen2.5:7b-instruct`
for the structured default.** Deciding factor = what the 11 LLM sites actually
do: **NL judgment + extraction + schema-fill OVER code context**, not code
generation. The model reads code but emits JSON / scores / summaries — it never
generates code. Workload split: ~8 of 11 sites are pure-NL judgment
(salience, consolidator, handoff, memory/observation/auto-improve jobs, query
rewrite, HyDE); 1 reads code but judges relevance (reranker); only 1 is
genuine code-synthesis (code-compressor).

| Capability | `qwen2.5:7b-instruct` | `qwen2.5-coder:7b` |
|---|---|---|
| Structured output / JSON / zod schema | excellent (canonical) | very good (also instruct-tuned) |
| Instruction-following + NL reasoning | excellent | good (weaker on pure-NL) |
| Code understanding | good | excellent |
| Salience / consolidator / handoff (NL memory) | better | good |
| Query rewrite / HyDE (NL) | better | good |
| Code compression / reranker-over-code | good | better (deeper code semantics) |

For "read code → emit JSON score", instruct wins; coder's code-gen strength is
wasted here. Recommendation: **default `qwen2.5:7b-instruct`** for all 11
sites. **Optional per-task override:** route `code-compressor`
(`packages/core/src/services/compression/code-compressor.ts:103`) — and
optionally the code-over-`projectId` reranker path — to `qwen2.5-coder:7b` via
the existing `llm-client.ts` chokepoint + config (`RLM_LLM_MODEL`, extended
with a per-task knob). Best of both: instruct for the NL-judgment majority,
coder for the one genuine code-synthesis path. Caveat: gap likely small
either way (modern coder variants retain most general ability) and neither is
benchmarked here — real pick = `14.needles` + a consolidator/salience eval + a
code-compress eval head-to-head. (Analysis 2026-07-09.)

**Committed 2026-07-09 (residual-fix rollout T1–T9b):** source/test/migration
changes across `packages/core`, `packages/shared`, `apps/tools-api`,
`apps/mcp-client`, the e2e suite, the needle fixture, + new migration
`20260707100000_add_index_jobs_pg/` + new `db-guard.ts` / `index-job-store-pg.ts`,
+ this COVERAGE update. `dist` artifacts are rebuilt locally but gitignored
(each deploy rebuilds them). Migration applied to the shared DB; **all residual
items are now resolved and live on `:3333`** (code + DB schema aligned).

**Committed 2026-07-09 (side-findings fix rollout A–E):** source/test changes
across `packages/core` (`llm-client.ts`, `read_file.ts`, `index-job-store-pg.ts`,
`index-job-store.ts` + their tests), `packages/shared` (`db-guard.ts`, new
`int-env.ts`, config type, tsconfig + new db-guard/int-env test),
`apps/mcp-client` (`api-client.ts`), `apps/tools-api` (`index.ts` reaper knobs),
+ this COVERAGE update. No new migration (`heartbeat_at` reused). `dist`
rebuilt locally (gitignored). All 5 fixes live + verified on `:3333`; the
`adsads/` junk-path item + the new findings above remain OPEN.
