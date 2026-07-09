# TODO — massa-th0th

Living task list for the next round of implementations, bug fixes, and open
findings. Source of truth for the OPEN items is
[`packages/core/src/__tests__/e2e/COVERAGE.md`](./packages/core/src/__tests__/e2e/COVERAGE.md)
(“Still OPEN” section). Severity: `high` = data loss / core path broken,
`med` = feature silently wrong, `low` = cosmetic / hardening, `note` = info.

Last updated: 2026-07-09.

---

## Recently completed (2026-07-09) — context only, do NOT redo

Three serial sub-agent rollouts landed on the live `:3333` / real-PG stack (all
verified GREEN):

- **Rollout 3 (A–E):** thinking-model reasoning-channel recovery, `read_file`
  `format` no-op, `.env`/db-guard vector-URL guard + `parsePositiveIntEnv`
  helper, `PgJobStore` reaper crash-recovery scoping + hydration-merge race.
- **Rollout 4 (T1–T6):** **LLM per-task model routing** — default swapped
  `qwen3.5:9b` → `qwen2.5:7b-instruct` (instruct) + `qwen2.5-coder:7b` (code
  sites: bootstrap/reranker/compress) via per-call `modelRole`; `DEFAULT_LLM_MODEL`
  constant dedup; `markStaleRunningFailed` real `rowCount`; Responses-API
  empty-recovery WARN; falsy-0 env-parse migration; `read_file` require-absolute;
  shared `@types/bun` + `test` script. Closed 7 OPEN findings.
- **Rollout 5:** `read_file` cache-key includes option flags (e2e F33 fix);
  `@types/bun` skew aligned.

See COVERAGE.md for full per-item detail. Both qwen2.5 models are pulled into
Ollama; `.env` pins `RLM_LLM_MODEL=qwen2.5:7b-instruct` +
`RLM_LLM_CODE_MODEL=qwen2.5-coder:7b`.

---

## OPEN findings (bug fixes)

### [med] `adsads/` junk path indexed in `e2e-th0th-shared`
- **Where:** shared index `e2e-th0th-shared`; surfaces as needle N11 top hit
  `adsads/packages/core/src/services/etl/stage-context.ts`.
- **What:** a stray/typo’d directory (`adsads/`) got indexed into the shared
  project at some point.
- **Fix:** audit the indexed file list / `projectPath` for the shared project;
  drop the `adsads/` prefix entries; re-index clean. Deferred across all three
  rollouts by request.
- **Note:** do NOT delete `e2e-th0th-shared` itself (it’s the OOM-workaround
  shared index). Selectively remove only the junk paths.

### [low] `read_file` `fileCache` unbounded growth
- **Where:** `packages/core/src/tools/read_file.ts:121` (`fileCache: Map`,
  `CACHE_TTL = 60000`).
- **What:** no size cap / eviction — only TTL freshness. After the cache-key
  fix each distinct `{filePath, includeSymbols, includeImports, projectId,
  relativePath}` combo is its own entry, so an adversarial caller cycling
  `projectId`/`relativePath` against many files grows the map for the process
  lifetime.
- **Fix:** add an LRU / max-size bound (evict oldest on insert). Keep TTL.

### [low] `@types/node` major-version skew
- **Where:** `apps/mcp-client` `^22.10.5` vs `packages/core` `^25.2.2`
  (`packages/shared` has none).
- **What:** 22 vs 25 across the monorepo.
- **Fix:** align in a dedicated dependency pass (bump mcp-client to `^25.x` if
  its Node target allows, or standardize on a shared floor). Check
  `apps/opencode-plugin` (`^22.10.5`) too.

### [low] `dotenv` patch + classification skew
- **Where:** `packages/shared` `^17.2.3` (declared a `dependency`) vs
  `packages/core` `^17.2.4` (declared a `devDependency`).
- **Fix:** align the version AND the dep/devDep classification (shared ships it
  as a runtime dep; core re-imports it — likely core should not declare it at
  all, or both should be consistent). Same dep pass as above.

### [note] dead `||` fallback in `read_file`
- **Where:** `packages/core/src/tools/read_file.ts:385`
  (`cached.metadata || await extractMetadata(...)`).
- **What:** never fires (metadata always set on cache write). Harmless after
  the cache-key fix; cosmetic dead code.
- **Fix:** delete the `||` branch or restructure. Trivial.

### [note] `e2e-th0th-shared` `vector_documents` empty on the live DB
- **Where:** live `massa_th0th` PG — workspace `e2e-th0th-shared` row claims
  `indexed` (251 files) but `vector_documents` is 0 rows (only `symbol_files` /
  `search_cache` survived).
- **What:** vectors re-seed on demand (02.indexing did so cleanly in ~95 s).
  Explains N7-class environmental fragility on a cold/dedicated stack. Not a
  correctness issue.
- **Fix:** none required; re-index to warm if a cold stack misbehaves. Worth a
  one-line note in the e2e README if it keeps recurring.

---

## LLM model-swap follow-ups (post-Rollout-4)

The swap to non-thinking qwen2.5 models is live and verified, but two quality
questions remain open (Rollout 4 measured `14.needles`, which is deterministic
and does NOT exercise the LLM judge — so LLM-judge quality is unmeasured):

- **[med] Benchmark the model swap on LLM-judge paths.** Run a consolidator +
  salience-judge + reranker eval head-to-head (`qwen2.5:7b-instruct` vs the old
  `qwen3.5:9b`). Real risk per the COVERAGE model-selection analysis: the
  consolidator may miss subtle semantic dupes or merge non-dupes → cumulative
  memory pollution. Build a small fixture (known-dup + known-distinct memory
  batches) and score merge precision/recall.
- **[low] Native `format: json_schema` constrained decoding.** Ollama supports
  native JSON-schema constrained decoding; the AI-SDK `generateObject` path
  could leverage it for stricter schema adherence on all 11 sites. Analysis in
  COVERAGE.md (“LLM model-selection analysis”). Optional hardening.

---

## Tech-debt / docs (lower priority)

- **Config-interface drift** (noted in README §Configuration): the typed
  `MassaTh0thConfig` TS interface doesn’t yet declare `llm`/`hooks`/`memory`/
  `search` even though the runtime loader reads them from env. The loader works
  correctly; the interface is stale. Tracked as a separate code follow-up.
- **`compression.llm` deprecated alias** still mirrored in
  `packages/shared/src/config/index.ts` (now also carries `codeModel` for shape
  parity). Schedule removal after one release.
- **E2e ops knobs undocumented in README:** `MASSA_TH0TH_DEDICATED` (db-guard),
  `MASSA_TH0TH_JOB_STALE_MS` / `MASSA_TH0TH_JOB_REAPER_INTERVAL_MS` (job reaper),
  `MASSA_TH0TH_PROXY_TIMEOUT_MS` (MCP proxy). All in `.env.example`; consider a
  short “Operational knobs” README subsection.

---

## E2E suite quick-reference (for anyone running the suite)

- Dir: `packages/core/src/__tests__/e2e/`. Run: `RUN_E2E=1 bun test src/__tests__/e2e/`
  (from `packages/core`). Override API: `MASSA_TH0TH_API_URL`.
- **PostgreSQL backend required** (not SQLite) for the full suite.
- **Shared index `e2e-th0th-shared`** is built once and reused (OOM workaround)
  — do NOT delete between runs.
- Full-repo index never completes; concurrent indexes OOM — rely on the shared
  index strategy in `_helpers.ts`.
- Baselines (post all rollouts): `02.indexing` 19/0, `05.memory` 25/0,
  `08.search` 36/0, `11.lifecycle` 20/2, `12.observability` 24/1, `14.needles`
  0.500/0.786/0.604, `15.nfr` ≥9/≤2/0.
- `.env` footgun: `bun` auto-loads repo-root `.env` (`DATABASE_URL → massa_th0th`,
  the shared DB). Dedicated/verify stacks MUST set `DATABASE_URL` explicitly
  (and `MASSA_TH0TH_DEDICATED=1` to engage the db-guard).
