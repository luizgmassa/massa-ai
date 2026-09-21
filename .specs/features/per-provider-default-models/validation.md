# Per-Provider Default Models — Validation

**Date**: 2026-09-20
**Spec**: `.specs/features/per-provider-default-models/spec.md`
**Diff range**: `main..HEAD` — 28 commits, HEAD `bc7caa4b`, branch `feat/per-provider-default-models`
**Worktree**: `/Users/luizmassa/Projects/massa-ai-feat-per-provider-default-models`
**Verifier**: independent sub-agent (author ≠ verifier). Read-only against the real tree; every mutation took a `cp` backup and was restored by `cp`, never by git. Porcelain baseline `[]` before and after every sensor batch.

**Result**: ❌ **FAIL** — 1 acceptance criterion not met (PDM-02 AC-2), 3 surviving mutants, 4 uncaught stale/regressed surfaces.

---

## Task Completion

All 21 tasks in `tasks.md` (T01–T17 plus the four Execute-time additions T03b, T06b, T07b, T15b) carry `— ✅ Complete` in their headings; zero unchecked boxes. No task is Blocked or Partial.

---

## Gate Check

| Gate | Exit | Counts | Judgement |
| --- | --- | --- | --- |
| `bun run lint` (oxlint) | **0** | no violations | clean |
| `bun run type-check` | **0** | 4 packages | clean |
| `bun run build` | **0** | 6/6 tasks (6 cached, FULL TURBO) | replayed from cache on this input hash; re-derived by M15, which produced a real `tsc` error through `@massa-ai/shared:build` |
| `bun run test` | **0** | 12/12 turbo tasks; core isolation runner `PASS: all 161 group(s)` | clean |
| `bun run test:plugins` | **0** | 142 pass / 0 fail across 10 files (105 s) | clean |
| `bun run test:scripts` | **1** | bun half **2057 pass / 0 fail** across 89 files; shell half stopped at suite 16/39 with `install-skills CLI: 44 passed, 2 failed` | **not this feature's** — see below |
| `bun test scripts/__tests__/embedding-defaults-parity.test.ts` | **0** | **14 pass / 0 fail**, 27 expect() calls | clean; populations printed |
| `bun skills/massa-ai/scripts/check_specs_delivered.ts per-provider-default-models --root .` | **0** | 6 paths checked, 0 errors | clean |

### `test:scripts` exit 1 — re-derived, not accepted

T15b's fix **does** run both halves (`bun test …; s1=$?; (for f in scripts/tests/*.sh; do bash "$f" || exit 1; done); s2=$?; [ $s1 -eq 0 ] && [ $s2 -eq 0 ]`) — verified in `package.json`'s script body and in the run log, where the bun half completed 2057/0 and the shell half then started.

**The intra-half `|| exit 1` still leaves the gate under-reporting.** The shell half aborted at suite 16 of 39 and reported 1 failing suite. Running every suite with no early exit (39 suites; `ls scripts/tests/*.sh | wc -l` = 39, not the 37 the artifacts state) gives the true population:

| Suite | Result |
| --- | --- |
| `test-install-skills-cli.sh` | 44 passed, **2 failed** |
| `test-plugin-auto-install.sh` | 194 passed, **16 failed** |
| `test-plugin-registry-registration.sh` | 43 passed, **4 failed** |
| other 36 suites | 0 failed |

So 3 suites / 22 cases fail, of which `bun run test:scripts` surfaces only 1 suite / 2 cases. The "3 failing suites" figure in the artifacts is correct, but it could not have come from the gate as wired — it under-reports by two thirds.

**The "host-specific, unrelated to this feature" claim is verified, not accepted.** The same three suites were run on the primary checkout at `main` (`8ea21839`): identical results — 2, 16, and 4 failures respectively. Pre-existing on `main`, unchanged by this branch. The two `install-skills CLI` cases (`no tools exits 2 → got='1' want='2'`, `reason is reported`) concern agent-tool detection, name no model, and touch no file in this feature's diff.

---

## Spec-Anchored Acceptance Criteria

### PDM-01/PDM-02 — One seam owns every default model

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — each `InferenceProviderSpec` exposes a default model id for embedding, instruct, coding | 3 role ids per provider | `packages/shared/src/config/inference-providers.ts:93-97` (ollama) and `:117-121` (lmstudio); `packages/shared/src/__tests__/inference-providers.test.ts` asserts the trio per provider | ✅ PASS |
| AC-2 — an installer or config CLI writing `config.json` for a provider SHALL write **that provider's three model ids**, never another's | after the write, all three ids belong to the named provider | Independent Test executed for both CLIs × 4 branches under scratch `XDG_CONFIG_HOME` — see the table below. `use ollama` writes **1 of 3** | ❌ **GAP** |
| AC-3 — with no env and no file value, instruct and coding resolve from the configured provider's seam entry | not a global constant | `packages/shared/src/config/index.ts:656,663` — `DEFAULT_LLM_MODEL = INFERENCE_PROVIDERS[activeInferenceProviderId()].defaultModels.instruct`; `packages/core/src/services/memory/llm-client.ts` `_resolveLlmConfig` — `cfg?.model ?? spec.defaultModels.instruct`; `packages/core/src/__tests__/llm-client.test.ts:841-843` | ✅ PASS |
| AC-4 — a provider id in `LOCAL_INFERENCE_IDS` missing any of the three fields fails TypeScript compilation | compile error | Mutation M15 deleted `defaultModels` from the `lmstudio` spec → `src/config/inference-providers.ts(105,3): error TS2741: Property 'defaultModels' is missing in type … but required in type 'InferenceProviderSpec'` | ✅ PASS |
| AC-5 — no explicit `codeModel` falls back to the provider's coding default, **never** the instruct model | `spec.defaultModels.coding` | `packages/core/src/services/memory/llm-client.ts` `_resolveLlmConfig` — `role === "code" ? cfg?.codeModel ?? spec.defaultModels.coding : …`; sensed by M13 (killed, 2 named failures) | ✅ PASS (⚠️ see G4) |

#### AC-2 — Independent Test, executed (scratch `XDG_CONFIG_HOME` per run, both CLIs)

| CLI | Branch | `embedding.model` / `dimensions` / `baseURL` | `llm.baseUrl` | `llm.model` | `llm.codeModel` |
| --- | --- | --- | --- | --- | --- |
| mcp-client | `init --lmstudio` | `text-embedding-qwen3-embedding-0.6b` / 1024 / `:1234/v1` | `:1234/v1` | `qwen3-vl-8b-instruct` | `qwen2.5-coder-7b-instruct` ✅ |
| mcp-client | `init` | `qwen3-embedding:0.6b` / 1024 / `:11434` | `:11434/v1` | `qwen3-vl:8b` | `qwen2.5-coder:7b` ✅ |
| mcp-client | `init` → `use lmstudio` | `text-embedding-qwen3-embedding-0.6b` / 1024 / `:1234/v1` | `:1234/v1` | `qwen3-vl-8b-instruct` | `qwen2.5-coder-7b-instruct` ✅ |
| mcp-client | `init --lmstudio` → `use ollama` | `qwen3-embedding:0.6b` / 1024 / `:11434` | **`:1234/v1`** | **`qwen3-vl-8b-instruct`** | **`qwen2.5-coder-7b-instruct`** ❌ |
| opencode-plugin | all four | byte-identical to the mcp-client rows above, including the `use ollama` failure | | | |

**Baselined against `main`** (primary checkout, `8ea21839`): the same sequence produced `llm.baseUrl :1234/v1`, `llm.model qwen2.5:7b-instruct`, `llm.codeModel qwen2.5-coder:7b`. The `baseUrl` leak pre-dates the feature; the feature **added** the LM Studio model ids without adding the symmetric Ollama assignments, so the leak now carries model ids too. AC-2 exists to close exactly this and is open on the `ollama` branch.

### PDM-05 — The parity gate covers all three roles

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — a tracked surface restating a stale instruct/coding default makes the gate fail, naming surface and differing value | named red | M1 (`install.sh` instruct) → `"install.sh (instruct) match #1: got qwen2.5:7b-instruct, want qwen3-vl:8b"`; M2 (`.env.example` coding) → `".env.example (coding) match #1: got qwen2.5-coder:3b, want qwen2.5-coder:7b"` | ✅ PASS (⚠️ population gap G1) |
| AC-2 — 0 or >1 extractor matches throws with the match count, never a silent pass | throw with count | `scripts/__tests__/embedding-defaults-parity.test.ts:44-49` `extractOne`, `:92-96` `checkMultiMatch`, `:68-74` `checkStructural`. M7 deleted the `local llm_code_model=` line → `error: install.sh (coding): expected exactly 1 match(es) for /local llm_code_model="([^"]+)"/g, got 0 — extractor rotted or surface removed` | ✅ PASS |
| AC-3 — each checked-surface population count printed on a green run | counts visible without reading source | 13 `[parity] …` lines on the green run: pair 5, model-only 3, width-only 1, LM pair 1, LM model-only 2, derived structural 24, instruct/coding 8, Markdown 8, completeness scan 32, width-writer 4, bash/TS width entries 4/4 | ✅ PASS |

### PDM-03/PDM-04 — Both providers embed at 1024

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — `ollama` defaults to `qwen3-embedding:0.6b` at 1024 | model+width pair | Seam `inference-providers.ts:94`; template `massa-ai-config.ts:403-404` (`knownEmbeddingDimensions(...) ?? 768` → 1024); runtime `embeddings/config.ts:246`; both CLIs `config-cli.ts:277,284`; `install.sh:419-420`; `Dockerfile`, `docker-compose.yml`, `setup-ollama-wsl.sh`, `.env.example`, `setup-local-first.sh:338`, `diagnose.ts:128`, `installer-api-key.sh:153`. Executed end-to-end: `init` writes `qwen3-embedding:0.6b`/1024 | ⚠️ **PASS with gap G2** — `apps/tools-api/src/routes/system.ts:185` still reports `qwen3-embedding:4b` |
| AC-2 — `lmstudio` defaults to `text-embedding-qwen3-embedding-0.6b` at 1024 | model+width pair | `inference-providers.ts:118`, `knownDimensions` entry `:116`; both CLIs; `setup-local-first.sh:334`; `diagnose.ts:129`. Executed: `init --lmstudio` writes the pair at 1024 | ⚠️ **PASS with gap G3** — `scripts/diagnose.ts:22` docblock still names the retired `text-embedding-nomic-embed-text-v1.5` as the default |
| AC-3 — a stale fingerprint refuses reads and writes with `EmbeddingIndexStaleError`, naming stored and current | both fingerprints in the message | `packages/core/src/__tests__/embedding-fingerprint.test.ts:181-189` — `expect(err.message).toContain("ollama:a:2560")` and `…toContain("ollama:b:2560")`, plus the remediation command | ✅ PASS |
| AC-4 — a reachable LM Studio yields a 1024-length non-zero vector from `POST /v1/embeddings` | 1024, non-zero | **Observed live this run** (LM Studio up on :1234): `bun test packages/core/src/__tests__/lmstudio-embedding-live.test.ts` → **2 pass / 0 fail**, 9 expect() calls, log line `[lmstudio] Provider ready (model: text-embedding-qwen3-embedding-0.6b, dimensions: 1024)` | ✅ PASS |

### PDM-08/PDM-09/PDM-10/PDM-11 — Runtime parameters per role

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — embedding 8192; instruct 16384 @ 0.2; coding 32768 @ 0.0 | exact table | `inference-providers.ts:30-34`; `packages/shared/src/__tests__/inference-providers.test.ts:92` `expect(INFERENCE_ROLE_DEFAULTS.embedding).toEqual({ contextWindow: 8192 })`, `:96-99` instruct `{16384, 0.2}`, `:103-106` coding `{32768, 0.0}` | ✅ PASS |
| AC-2 — an Ollama chat call sends the role's context as `options.num_ctx` | 16384 instruct / 32768 code | `llm-client.ts` `_wrapFetchContextWindow` + `buildProvider` gate on `spec.appliesContextPerRequest`; `packages/core/src/__tests__/llm-client.test.ts:946` `expect(parsed.options.num_ctx).toBe(16384)`, `:966` `…toBe(32768)`, `:899` `expect(parsed.options).toEqual({ seed: 1, num_ctx: 32768 })` (merge, not overwrite), `:972` LM Studio attaches no wrapper at all | ✅ PASS |
| AC-3 — on LM Studio the installer loads each model with `lms load -c <role context>` | 8192 / 16384 / 32768 | `scripts/setup-local-first.sh:369-372` — `"$LMSTUDIO_CLI" load -c 8192 … -c 16384 … -c 32768 …`, with an echo-the-commands fallback `:375-380` | ⚠️ **Spec-precision gap** — structural only; no executable sensor asserts the three `-c` values (they are not in any parity tier and `test-setup-local-first-api-key.sh` does not reach this block) |
| AC-4 — the vector store submits 64 texts per provider call, not 8 | 3 `embedBatch` calls for 130 docs (64/64/2) | `postgres-vector-store.ts:453` `_resolveEmbedBatchSize(loadConfigSafe().embedding)`; `packages/core/src/__tests__/vector-store-factory.test.ts:118-130` — real store, 130 documents, `expect(store.embedBatchCalls).toBe(3)` | ✅ PASS |
| AC-5 — a failed batch embed falls back per document at the larger batch size | fail-open preserved | `postgres-vector-store.ts:486-499` unchanged per-document loop; `packages/core/src/__tests__/postgres-vector-store-extended.test.ts:315` "addDocuments falls back per-document when sub-batch insert fails (dim mismatch)" | ✅ PASS |

### PDM-12/PDM-13/PDM-14 — Every model setting configurable, config wins

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — five fields exist in `config.json` | `llm.contextWindow`, `llm.codeContextWindow`, `llm.codeTemperature`, `embedding.contextWindow`, `embedding.batchSize` | `massa-ai-config.ts:57-65` (embedding, optional) and `:146-155` (llm, required); validation `config-writer.ts:152-155,246-251`; `config-writer.test.ts:217-271` | ✅ PASS |
| AC-2 — a value in `config.json` beats the role-table default, **for every one of those five** | file wins | `embedding.batchSize` → reader `postgres-vector-store.ts:78` (`_resolveEmbedBatchSize`), sensed `vector-store-factory.test.ts:80-83` (M8 killed). `embedding.contextWindow` → reader `embeddings/provider.ts:41-50` (`_resolveEmbedContextWindow`), sensed `embeddings-provider.test.ts:466` and end-to-end in the request body `:492-506` (M9 killed, 3 named failures). `llm.contextWindow` / `codeContextWindow` / `codeTemperature` → readers `llm-client.ts` `_resolveLlmConfig` **and** `packages/shared/src/config/index.ts:781,783,785`; `_resolveLlmConfig`'s layer sensed `llm-client.test.ts:857,865` (M10, M11 killed) | ⚠️ **PASS behaviourally, but the production reader is unsensed** — see surviving mutants M12a/b/c |
| AC-3 — the Portal Config tab renders a field for every one of those keys | in `embedding` / `llm` sections | `apps/web-ui/src/static/views/config-sections.ts:50-51` (embedding `contextWindow`, `batchSize`) and `:133-135` (llm `contextWindow`, `codeContextWindow`, `codeTemperature`) | ✅ PASS |
| AC-4 — a schema field absent from the Portal section table fails a deterministic gate, naming that field | named red | `apps/tools-api/src/routes/config-section-coverage.test.ts:156+` "Admin Portal config sections cover every schema field (PDM-14)". M14 deleted the Portal `batchSize` field → red naming `"batchSize"` | ✅ PASS |
| AC-5 — a Portal `guide` citing a default model or width cites the current one | `qwen3-embedding:0.6b`, 1024, `qwen3-vl:8b` | `config-sections.ts:47` (model), `:51` (dimensions, 1024), `:127` (llm model, both providers) | ⚠️ **PASS on the letter, gap G4 on the intent** — `config-sections.ts:128` `codeModel` guide still says *"When empty, falls back to the primary model"*, which PDM-01 AC-5 reversed this release |

### PDM-06 — Install surfaces pull the same trio

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — `setup-local-first.sh` pulls and writes the selected provider's trio | provider-matched trio | `scripts/setup-local-first.sh:333-340` branch; pulls at `:343-345`; writes via `installer_write_config` `:576`. `bash scripts/tests/test-setup-local-first-api-key.sh` → **40 passed, 0 failed** | ⚠️ **PASS with gap G5** — `installer_provider_defaults` clobbers a `MASSA_AI_LLM_MODEL` override before the write |
| AC-2 — `install.sh` probes for the new instruct id | `qwen3-vl:8b`, not `qwen2.5:7b-instruct` | `install.sh:379` `local llm_model="qwen3-vl:8b"`, probed `:382` `ollama_has_model "$llm_model"`; comments `:432`,`:472` repointed | ✅ PASS |
| AC-3 — an absent instruct model leaves LLM features disabled, stating the reason | `MASSA_AI_LLM_ENABLED=false` + reason | `install.sh:381-383` (`llm_enabled=false` unless probed present), emitted `:433`,`:473`; `setup-local-first.sh:535-540` `LLM_MODEL_PRESENT` gates `installer_feature_flow`. `bash scripts/tests/test-installer-feature-prompts.sh` → 20 passed, 0 failed; `test-setup-ollama-model-exists.sh` → 16 passed, 0 failed; new `test-lms-model-exists.sh` → **64 passed, 0 failed** | ✅ PASS |

**Status**: ❌ 1 AC not met (PDM-02 AC-2). 27 of 28 ACs traced to `file:line`; 2 spec-precision gaps flagged (PDM-10 AC-3 structural-only, PDM-12 AC-5 intent).

---

## Discrimination Sensor

Every mutation: `cp f f.bak` → `perl -0pi` → run gate → `cp f.bak f` → `rm f.bak`. A no-op mutation aborts the run rather than reporting a verdict. `git status --porcelain` measured `[]` before and after every batch, and `[]` at the end of the run.

**Population A — the parity gate**, drawn from its 44 declared surface rows (5 pair + 3 model-only + 1 width-only + 1 LM pair + 2 LM model-only + 24 derived structural + 8 instruct/coding), across all 6 tiers plus the seam and the removal case:

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| M1 | `install.sh:379` | instruct literal `qwen3-vl:8b` → `qwen2.5:7b-instruct` | ✅ Killed — `install.sh (instruct) match #1: got qwen2.5:7b-instruct, want qwen3-vl:8b` |
| M2 | `.env.example` `MASSA_AI_LLM_CODE_MODEL` | coding literal → `qwen2.5-coder:3b` | ✅ Killed — named `.env.example (coding)` |
| M3 | `Dockerfile` `ENV OLLAMA_EMBEDDING_MODEL` | `0.6b` → `4b` (pair tier) | ✅ Killed — `Dockerfile: model=qwen3-embedding:4b (want qwen3-embedding:0.6b)` |
| M4 | `apps/mcp-client/src/config-cli.ts` | `defaultModels.coding` → `defaultModels.instruct` (derived structural) | ✅ Killed — 2 named 0-match failures, on their own branches |
| M5 | `scripts/diagnose.ts:129` | lmstudio table entry → retired nomic id | ✅ Killed — LM Studio model-only tier |
| M6 | `inference-providers.ts:95` | seam `instruct: "qwen3-vl:8b"` → `"qwen3-vl:32b"` | ✅ Killed — 6 surfaces named at once; proves value-anchoring to the seam, not to a literal |
| M7 | `install.sh` | **deleted** the `local llm_code_model=` line | ✅ Killed — `expected exactly 1 match(es) …, got 0 — extractor rotted or surface removed` (no silent slide) |

**Population B — PDM-12 AC-2's five fields**, one mutation per config-over-default reader:

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| M8 | `postgres-vector-store.ts:78` | `embeddingConfig?.batchSize ?? spec.embedBatchSize` → `spec.embedBatchSize` | ✅ Killed |
| M9 | `embeddings/provider.ts:44` | dropped `embeddingConfig?.contextWindow ??` | ✅ Killed — 3 named failures incl. the request-body test |
| M10 | `llm-client.ts` `_resolveLlmConfig` | dropped `cfg?.contextWindow ??` | ✅ Killed |
| M11 | `llm-client.ts` `_resolveLlmConfig` | dropped `cfg?.codeTemperature ??` | ✅ Killed |
| M13 | `llm-client.ts` `_resolveLlmConfig` | `spec.defaultModels.coding` → `.instruct` (PDM-01 AC-5) | ✅ Killed — 2 named failures |
| **M12a** | `packages/shared/src/config/index.ts:783` | dropped `fileConfig.llm?.codeContextWindow ??` | ❌ **Survived** |
| **M12b** | `packages/shared/src/config/index.ts:781` | dropped `fileConfig.llm?.contextWindow ??` | ❌ **Survived** |
| **M12c** | `packages/shared/src/config/index.ts:785` | dropped `fileConfig.llm?.codeTemperature ??` | ❌ **Survived** |

M12a/b/c were each run against `bun test packages/shared/src` (**945 pass / 0 fail**) *and* `bun test packages/core/src/__tests__/llm-client.test.ts` (**74 pass / 0 fail**) — both stayed fully green with the config-over-default read deleted.

**Population C — the remaining ACs:**

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| M14 | `config-sections.ts:51` | deleted the Portal `batchSize` field | ✅ Killed — PDM-14 gate red naming `"batchSize"` |
| M15 | `inference-providers.ts:117-121` | deleted `defaultModels` from the lmstudio spec | ✅ Killed — `error TS2741: Property 'defaultModels' is missing … but required in type 'InferenceProviderSpec'` |
| **M16** | `apps/tools-api/src/routes/system.ts:185` | `"qwen3-embedding:4b"` → `"totally-bogus-model:99b"` | ❌ **Survived** the parity gate (14 pass / 0 fail) |

**Sensor depth**: P0-full (6 gate tiers + 5 config readers + type-check + Portal gate + one deliberate blind-spot probe).
**Result**: **12 of 16 killed, 4 survived** — ❌ FAIL.

---

## Ranked Gaps

### G0 — `use ollama` writes LM Studio's instruct and coding ids (PDM-02 AC-2) — **Blocker**

- **Where**: `apps/mcp-client/src/config-cli.ts:276-285` and `apps/opencode-plugin/src/config-cli.ts:280-289`.
- **Root cause**: the `provider === "lmstudio"` branch assigns `config.llm.baseUrl`, `config.llm.model` and `config.llm.codeModel`; the `provider === "ollama"` branch assigns **none** of the three. The requirement names a set (three ids, both directions); the task implemented a subset (three ids, one direction). Same shape as the three gaps T03b/T06b/T07b closed during Execute — this is the fourth instance.
- **Observed**: `init --lmstudio` → `use ollama` yields `embedding.baseURL :11434` beside `llm.baseUrl :1234/v1`, `llm.model qwen3-vl-8b-instruct`, `llm.codeModel qwen2.5-coder-7b-instruct`. Reproduced on both CLIs. Runtime consequence: `_resolveLlmConfig` resolves the spec from `llm.baseUrl` (:1234 → lmstudio), so a user who has switched *to* Ollama still routes LLM calls to LM Studio — and if LM Studio is down, Ollama would be asked for a model id it cannot resolve.
- **Why the gate missed it**: `DERIVED_SURFACES` carries `(use lmstudio, instruct)` and `(use lmstudio, coding)` rows but no `(use ollama, instruct)` / `(use ollama, coding)` rows. The gate's table mirrors the implementation's subset, not the requirement's set.
- **Fix task**: mirror the three `config.llm.*` assignments into the `ollama` branch of both CLIs (and the `init` / `init --ollama` path), then add the two missing `DERIVED_SURFACES` rows so the symmetry is gated.

### G1 — the instruct/coding half has no completeness scan; `process.env.X || "literal"` is a blind spot — **Major**

- **Where**: `scripts/__tests__/embedding-defaults-parity.test.ts:592` — `if (line.includes("process.env")) continue;` inside the Tier-3 completeness scan; and the absence of any non-Markdown completeness scan keyed on an instruct/coding token.
- **Evidence**: M16 survived. `apps/tools-api/src/routes/system.ts` **is** inside the scan's population (32 tracked files mention `*_EMBEDDING_MODEL/DIMENSIONS`) but its only matching line is excluded as an "env read" — even though `process.env.X || "<literal>"` is an env read *and* a default declaration. The embedding half has two completeness scans; the instruct/coding half has none outside `.md` files.
- **Fix task**: narrow the exclusion to bare reads (`process.env.X` with no `||`/`??` literal fallback), and add an instruct/coding completeness tier over tracked non-Markdown files.

### G2 — `/api/v1/system/ollama` reports the retired embedding default, and a test pins it — **Major**

- **Where**: `apps/tools-api/src/routes/system.ts:185` — `configuredModel: process.env.OLLAMA_EMBEDDING_MODEL || "qwen3-embedding:4b"`.
- **Impact**: PDM-03 AC-1 says the system SHALL default `ollama` embedding to `qwen3-embedding:0.6b`. After this feature, a fresh install carries the model in `config.json`, not in `OLLAMA_EMBEDDING_MODEL`, so this route reports `qwen3-embedding:4b` on every such install — a model the system will not use, on the endpoint whose job is to report the configured model. It also ignores `config.embedding.model` entirely.
- **`apps/tools-api/src/routes/system.test.ts:148` asserts the defect as the contract**: `expect(res.json.configuredModel).toBe("qwen3-embedding:4b")`. That is why `bun run test` is green.
- **`git log -L 185,185`** shows this line was last touched by `ceaa275d "chore(defaults): sweep qwen3-embedding:4b across surfaces"` — i.e. it is a known member of the sweep population that the parity gate was built to own, and this feature's sweep missed it. T15's own execution note scopes its 3-dialect sweep to "23 candidate `*.test.ts` files"; T11 swept single-dialect bash/env surfaces; T16 swept the 7 docs. A production `.ts` route fell between all three.
- **Fix task**: resolve `configuredModel` through the seam (`resolveConfiguredEmbeddingModel` / `INFERENCE_PROVIDERS[...].defaultModels.embedding`) and repoint the test to assert the seam value, not a literal.

### G3 — `scripts/diagnose.ts:22` docblock names the retired LM Studio default — **Minor**

- The same file's Ollama line (`:21`) and its `DEFAULT_MODEL` table (`:128-129`) were both repointed; line 22 was not, and still reads *"LMSTUDIO_EMBEDDING_MODEL - LM Studio model to test (default: `text-embedding-nomic-embed-text-v1.5`)"*.
- Invisible to the gate twice over: `LMSTUDIO_MODEL_ONLY_SURFACES`' extractor `/^ {2}lmstudio: "([^"]+)",$/gm` only reaches the table, and `diagnose.ts` is in the Tier-3 `known` set so the completeness scan skips the file entirely.

### G4 — the Portal `codeModel` guide states behaviour this release reversed — **Minor**

- `apps/web-ui/src/static/views/config-sections.ts:128` — *"Model used for code-related tasks. When empty, falls back to the primary model."* PDM-01 AC-5 now requires the opposite (fall back to the provider's coding default, **never** the instruct model), and the instruct default is a vision-language model (A-04). The guide instructs the operator toward the exact behaviour the feature removed.

### G5 — `installer_provider_defaults` clobbers a user's `MASSA_AI_LLM_MODEL` override — **Minor (regression)**

- `scripts/lib/installer-api-key.sh:205-206,214-215` now assign `LLM_MODEL` / `CODE_MODEL` unconditionally, and `installer_write_config` calls `installer_provider_defaults` first (`:312`).
- `scripts/setup-local-first.sh:334-339` honours `MASSA_AI_LLM_MODEL` / `MASSA_AI_LLM_CODE_MODEL`, pulls those models (`:343-345`), loads them into LM Studio (`:370-372`) and prints them in the summary (`:717`) — but the write at `:576` overwrites them with the seam literal. Before this feature `installer_provider_defaults` did not touch these two globals, so the override survived.
- Not an AC failure (AC-2's letter is still satisfied — the written ids do belong to the named provider), but the wizard now pulls one model and writes another, silently.

### G6 — three surviving mutants: the production `llm.*` config reader has no sensor — **Major (verification gap, not a behaviour defect)**

- `packages/shared/src/config/index.ts:781,783,785` is the **only live** config-over-default read for `llm.contextWindow`, `llm.codeContextWindow` and `llm.codeTemperature`: `config.get("llm")` always returns a fully-populated `defaultConfig.llm`, so `_resolveLlmConfig`'s own `cfg?.X ??` fallbacks — the ones M10/M11 kill — are dead in production.
- The three tests that look like they cover this (`config-loader.test.ts:248-265`) exercise `loadConfig()`, a different function on a different type (`MassaAiConfig`, not `ServerConfig`). Correct check, wrong subject.
- **Fix task**: add three assertions against `config.get("llm")` (or the exported `defaultConfig`) under a scratch `XDG_CONFIG_HOME` seeded with a `config.json` carrying non-default values, sequenced before any core-reaching import.

---

## Edge Cases

- [x] A `config.json` already naming a model keeps it (A-05) — precedence `env > config.json > default` verified at `index.ts:781-788` and `_resolveLlmConfig`; `config-loader.test.ts:248-265`.
- [x] LM Studio MLX build fails `/v1/embeddings` with `"No models loaded"` — surfaced unchanged; documented as provider behaviour (A-01). No product code claims otherwise.
- [x] Width 2560 → 1024 flips `postgres-vector-store.ts` to the `≤ 2000` direct-HNSW-cosine branch — stated in `CHANGELOG.md` and `README.md:729-742` as a **retrieval algorithm change**, not only a size change.
- [x] The needles floors are explicit `null` with a calibration note, never the 2560-derived numbers — `packages/core/src/__tests__/e2e/14.needles.test.ts:79-108`. This is a **deliberate gate weakening** (A-03), and the artifacts state it honestly in the spec, the file, the CHANGELOG, and `benchmarks/needles/README.md:66-70`.
- [x] `qwen3-embedding:0.6b` already present at 1024 in `KNOWN_EMBEDDING_DIMENSIONS` — confirmed; the gate's bash↔TypeScript table comparison is green with 4 entries on each side.

---

## Skipped Checks (with reasons)

| Check | Reason |
| --- | --- |
| `packages/core/src/__tests__/e2e/14.needles.test.ts` | **Genuinely unobservable on this host, verified not assumed.** Ran `RUN_E2E=1 bun test …` under a scratch `XDG_CONFIG_HOME`: **0 pass / 2 skip / 0 fail**. `READY = AVAIL?.API_UP && AVAIL?.INFERENCE_UP`; `nc -z localhost 3333` → **DOWN** (no tools-api REST server), so `API_UP=false`. Ollama (:11434) and LM Studio (:1234) *are* up, so the gate is failing on the API arm, not the inference arm. Recorded as a **skipped sensor**, never as a pass. T14's claims about this file remain statically verified only. |
| `bun run test:integration`, `test:coverage`, `bench:needles:gate` | Not in `tasks.md`'s Gate Check Commands; `needles-gate.yml` is `workflow_dispatch`-only and `continue-on-error`. |
| Retrieval quality at 1024 dimensions | Out of scope by the user's explicit choice (A-03). **Not treated as a defect.** Confirmed the artifacts state it honestly rather than softening it: `spec.md` A-03 flags "this **weakens a gate**"; `CHANGELOG.md` says "**has not been re-measured** … ships as an accepted, unmeasured risk rather than a validated improvement"; `README.md:741-742` repeats it. No artifact claims a measurement that was not taken. |

---

## Code Quality

| Check | Pass? |
| --- | --- |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ — the two `_resolve*` helpers exist to make PDM-12 AC-2 unit-testable and are each used at a real call site |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ⚠️ — T13's recorded `SPEC_DEVIATION` (6 one-line production fixes outside its write set) is each a genuine, reviewed, parity-gate-forced repoint; judged legitimate |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns/style | ✅ — layering respected: `_resolveEmbedBatchSize` duplicates the provider-id fallback in `data/` rather than importing from `services/` (CLAUDE.md one-way `tools → services → data`) |
| Would a senior engineer approve? | ❌ — G0 blocks |
| Tests map to ACs and are non-shallow | ✅ — spot-checked PDM-08: `vector-store-factory.test.ts:118` drives a real `PostgresVectorStore` over 130 documents rather than asserting a constant |
| Spec-anchored outcome check | ⚠️ — 2 spec-precision gaps (PDM-10 AC-3, PDM-12 AC-5) |
| Per-layer coverage expectation met | ⚠️ — `apps/tools-api/src/routes/system.ts` is in the diff surface's blast radius and is covered only by a test pinning the retired value (G2) |
| Every test maps to a spec requirement | ✅ |
| Validation assets not weakened | ⚠️ — `14.needles.test.ts` floors nulled. Deliberate, declared (A-03), argued from measurement (the Ollama floor was already unsatisfiable), and offset by the unconditional `anyHits` + determinism assertions. Recorded as a knowingly-weakened gate awaiting recalibration, not as a silent relaxation. |
| Documented guidelines followed | ✅ — `CLAUDE.md`, `CONTRIBUTING.md` measurement discipline |

---

## Interactive UAT

**Not applicable** — the change is configuration defaults, a seam, installers, and a gate. The one user-facing surface (Admin Portal Config tab) is covered by the deterministic field-level gate (PDM-14 AC-4, M14 killed) and `render-golden.test.ts`.

---

## Requirement Traceability Update

| Requirement | Previous | New |
| --- | --- | --- |
| PDM-01 | Design | ✅ Verified |
| PDM-02 | Design | ❌ **Needs Fix** (AC-2, `use ollama`) |
| PDM-03 | Design | ⚠️ Verified with gap (G2) |
| PDM-04 | Design | ⚠️ Verified with gap (G3) |
| PDM-05 | Design | ⚠️ Verified with gap (G1) |
| PDM-06 | Design | ⚠️ Verified with gap (G5) |
| PDM-07 | Resolved | ✅ Verified (live LM Studio, 1024) |
| PDM-08 | Design | ✅ Verified |
| PDM-09 | Design | ✅ Verified |
| PDM-10 | Design | ⚠️ Spec-precision gap (structural only) |
| PDM-11 | Design | ✅ Verified |
| PDM-12 | Design | ⚠️ Verified with 3 surviving mutants (G6) |
| PDM-13 | Design | ✅ Verified |
| PDM-14 | Design | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready
**Result**: **FAIL**

**Spec-anchored check**: 27/28 ACs traced to `file:line`; **1 AC not met** (PDM-02 AC-2); 2 spec-precision gaps flagged.
**Sensor**: 16 mutations injected, **12 killed, 4 survived**.
**Gate**: lint 0, type-check 0, build 0, test 0 (161 isolation groups), test:plugins 0 (142/0), parity 0 (14/0), check_specs_delivered 0; `test:scripts` 1 — 3 pre-existing host-specific shell suites, identical on `main`.

**What works**: the seam and its type-level completeness guard; instruct/coding defaults derived per provider; the per-role context/temperature table and its Ollama `num_ctx` delivery with the LM Studio negative; batch 64 with a real 130-document call-count test; all five config fields with working readers and Portal fields; the field-level Portal gate; the parity gate's six tiers, which killed every mutation aimed at them including a deletion and a seam-value change; a live LM Studio 1024-dimension vector, observed this run.

**Issues found**: G0 `use ollama` writes another provider's instruct/coding ids (blocker); G1 the gate has no instruct/coding completeness scan and excludes `process.env.X || "literal"`; G2 `/api/v1/system/ollama` reports the retired default with a test pinning it; G3 a stale docblock; G4 a Portal guide describing reversed behaviour; G5 the installer clobbers a user's model override; G6 three surviving mutants at the production `llm.*` config reader.

**Next steps**: route G0 and G1/G2/G6 to fix tasks, re-run the Independent Test for PDM-02 AC-2 on both CLIs in both directions, and re-run the discrimination sensor on the three surviving `index.ts` readers before re-verification.
