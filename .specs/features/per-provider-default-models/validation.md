# Per-Provider Default Models — Validation (Round 2)

**Date**: 2026-09-20
**Spec**: `.specs/features/per-provider-default-models/spec.md`
**Diff range**: `main..HEAD` — **41 commits**, HEAD `ac356ab5`, branch `feat/per-provider-default-models`, 65 files changed
**Worktree**: `/Users/luizmassa/Projects/massa-ai-feat-per-provider-default-models`
**Verifier**: independent sub-agent, round 2 of max 3 (author ≠ verifier). Read-only against the real tree. Every mutation: `cp f f.bak` → mutate → run → `cp f.bak f` → `rm f.bak`. No `git checkout/restore/stash/reset/clean` at any point. `git status --porcelain` measured `[]` before and after every mutation and at the end of the run.

**Result**: ❌ **FAIL** — 28/28 acceptance criteria met, **all 9 round-1 gaps closed and independently re-verified**, but **1 new Major defect** (an inverted config-over-env precedence introduced by this feature, in the same class F2b was written to correct) and **1 surviving mutant** on a spec-precision gap carried unaddressed from round 1.

---

## Round 1, for continuity

Round 1 (HEAD `bc7caa4b`, 28 commits) returned **FAIL**: 27/28 ACs traced, **PDM-02 AC-2 not met** (G0 — `use ollama` wrote none of the three `config.llm.*` fields while the `lmstudio` branch wrote all three), 2 spec-precision gaps (PDM-10 AC-3 structural-only; PDM-12 AC-5 intent), and **16 mutations injected / 12 killed / 4 survived** (M12a/b/c at the production `llm.*` reader, M16 at `system.ts`). Six ranked gaps G1–G6 plus the blocker G0. Nine fix tasks F1–F9 plus F2b were applied. **Nothing below is inherited from that report**: every claim was re-derived.

---

## Gate Check

Run from a clean tree with a scratch `XDG_CONFIG_HOME` and `MASSA_AI_EXECUTOR_SANDBOX=none`.

| Gate | Exit | Counts | Judgement |
| --- | --- | --- | --- |
| `bun run lint` (oxlint) | **0** | no violations | clean |
| `bun run type-check` | **0** | 4 packages | clean |
| `bun run build` | **0** | 6 packages | clean |
| `bun run test` | **0** | 12/12 turbo tasks | clean |
| `bun run test:plugins` | **0** | **142 pass / 0 fail**, 937 expect(), 10 files, 117 s | clean |
| `bun run test:scripts` | **1** | bun half **2058 pass / 0 fail** across 89 files; shell half **all 39 suites ran**, 3 failed, named together | **not this feature's** — see below |
| `bun test scripts/__tests__/embedding-defaults-parity.test.ts` | **0** | **15 pass / 0 fail**, 29 expect(); 14 `[parity]` population lines | clean |
| `bun skills/massa-ai/scripts/check_specs_delivered.ts per-provider-default-models --root .` | **0** | 7 paths checked, 0 errors | clean |

### `test:scripts` exit 1 — re-derived, and the host-specific claim tested

`bash scripts/run-shell-suites.sh` (F6's new runner) ran **all 39 suites to completion** and reported them in one list:

```
FAILED SHELL SUITES (3 of 39):
  - scripts/tests/test-install-skills-cli.sh          (44 passed, 2 failed)
  - scripts/tests/test-plugin-auto-install.sh         (194 passed, 16 failed)
  - scripts/tests/test-plugin-registry-registration.sh (43 passed, 4 failed)
```

22 failing cases. **Judged not this feature's, on this round's own evidence rather than round 1's baseline.** Three independent arguments:

1. **Subject exclusion.** Neither the three suite files nor their subjects (`scripts/install-skills.sh`, `scripts/install-harness.sh`, the four plugin `install.sh` scripts, `scripts/lib/host-capabilities.ts`) appear anywhere in the 65-file `main...HEAD` diff. The branch cannot have changed code it did not touch.
2. **Shared-file audit.** The only two repo-wide files in the diff are `package.json` (one line: the `test:scripts` script body) and `turbo.json` (one line: `MASSA_AI_LLM_CODE_TEMPERATURE` added to `passThroughEnv`). Neither is read by the failing suites.
3. **Assertion content.** Every one of the 22 failing assertions concerns agent-tool detection (`no tools exits 2 → got='1' want='2'`), plugin host detection (`got='claude codex ' want='codex '` — a real `~/.claude` on this host leaking into the detected-host list), or Claude marketplace/registry commands. None names a model id, a provider, a config field, or a role.

---

## Spec-Anchored Acceptance Criteria

### PDM-01 / PDM-02 — One seam owns every default model

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — each `InferenceProviderSpec` exposes a default model id for embedding, instruct, coding | 3 role ids per provider | `packages/shared/src/config/inference-providers.ts:92-96` (ollama: `qwen3-embedding:0.6b` / `qwen3-vl:8b` / `qwen2.5-coder:7b`) and `:121-125` (lmstudio: `text-embedding-qwen3-embedding-0.6b` / `qwen3-vl-8b-instruct` / `qwen2.5-coder-7b-instruct`) — all 6 read against the spec's own trio table (`spec.md:53-57`), 6/6 match | ✅ PASS |
| AC-2 — an installer or config CLI writing `config.json` for a provider SHALL write **that provider's three model ids**, never another's | after the write, all three ids belong to the named provider | **16 cells executed** (below) | ✅ **PASS — G0 closed** |
| AC-3 — with no env and no file value, instruct and coding resolve from the configured provider's seam entry | not a global constant | `packages/shared/src/config/index.ts` `DEFAULT_LLM_MODEL`/`DEFAULT_LLM_CODE_MODEL` derive from `INFERENCE_PROVIDERS[activeInferenceProviderId()]`; asserted by `packages/shared/src/config/__tests__/llm-env-prefix.test.ts:164-230` ("T03: DEFAULT_LLM_MODEL / DEFAULT_LLM_CODE_MODEL are provider-derived", both providers). Runtime: `packages/core/src/services/memory/llm-client.ts:225-226` `role === "code" ? cfg?.codeModel ?? spec.defaultModels.coding : cfg?.model ?? spec.defaultModels.instruct` | ✅ PASS |
| AC-4 — a provider id in `LOCAL_INFERENCE_IDS` missing any of the three fields fails TypeScript compilation | compile error | Re-derived twice. Deleting the whole `defaultModels` block → `src/config/inference-providers.ts(105,3): error TS2741: Property 'defaultModels' is missing … but required in type 'InferenceProviderSpec'`. Deleting **one role key** (`coding`) → `(118,5): error TS2741: Property 'coding' is missing in type '{ embedding: string; instruct: string; }' but required in type 'Readonly<Record<InferenceRole, string>>'` — the per-role subset case is covered, not only the whole-field case | ✅ PASS |
| AC-5 — no explicit `codeModel` falls back to the provider's coding default, **never** the instruct model | `spec.defaultModels.coding` | `packages/core/src/services/memory/llm-client.ts:225` (expression above); Portal guide now states the same (`config-sections.ts:128`) | ✅ PASS |

#### AC-2 — Independent Test executed, full matrix (16 cells, scratch `XDG_CONFIG_HOME` per cell, config file absent at the start of every cell)

`spec.md:130-133`'s command, extended across every provider × branch × CLI cell including both switch-away directions.

| CLI | Sequence | `embedding` model / dims / baseURL | `llm.baseUrl` | `llm.model` | `llm.codeModel` | |
| --- | --- | --- | --- | --- | --- | --- |
| mcp-client | `init` | `qwen3-embedding:0.6b` / 1024 / `:11434` | `:11434/v1` | `qwen3-vl:8b` | `qwen2.5-coder:7b` | ✅ |
| mcp-client | `init --lmstudio` | `text-embedding-qwen3-embedding-0.6b` / 1024 / `:1234/v1` | `:1234/v1` | `qwen3-vl-8b-instruct` | `qwen2.5-coder-7b-instruct` | ✅ |
| mcp-client | `init` → `use ollama` | `qwen3-embedding:0.6b` / 1024 / `:11434` | `:11434/v1` | `qwen3-vl:8b` | `qwen2.5-coder:7b` | ✅ |
| mcp-client | `init` → `use lmstudio` | lmstudio trio / 1024 / `:1234/v1` | `:1234/v1` | `qwen3-vl-8b-instruct` | `qwen2.5-coder-7b-instruct` | ✅ |
| mcp-client | **`init --lmstudio` → `use ollama`** (G0's case) | `qwen3-embedding:0.6b` / 1024 / `:11434` | **`:11434/v1`** | **`qwen3-vl:8b`** | **`qwen2.5-coder:7b`** | ✅ |
| mcp-client | `init --lmstudio` → `use lmstudio` | lmstudio trio / 1024 / `:1234/v1` | `:1234/v1` | `qwen3-vl-8b-instruct` | `qwen2.5-coder-7b-instruct` | ✅ |
| mcp-client | `init` → `use lmstudio` → `use ollama` | ollama trio / 1024 / `:11434` | `:11434/v1` | `qwen3-vl:8b` | `qwen2.5-coder:7b` | ✅ |
| mcp-client | `init` → `use ollama --base-url http://h:11434` | ollama trio / 1024 / `http://h:11434` | **`http://h:11434`** | `qwen3-vl:8b` | `qwen2.5-coder:7b` | ⚠️ N4 |
| opencode-plugin | all eight | **byte-identical to the mcp-client rows above, including the N4 row** | | | | |

Model ids: **16 of 16 cells internally consistent**. G0 is closed on both CLIs in both directions. The one anomaly (N4) is a `baseUrl`, not a model id, so AC-2's letter and intent are both met; it is ranked separately below.

Installer writers, for completeness of the AC's "any installer" set: `scripts/lib/installer-api-key.sh:212-213` (lmstudio) / `:221-222` (ollama) write the instruct+coding pair per provider; `scripts/setup-local-first.sh:333-340` writes the embedding id per provider before calling `installer_write_config` (`:576`). `install.sh` writes `.env`, not `config.json`, and is genuinely Ollama-only (measured: **1** `lmstudio` occurrence in the whole file, `:119`, a probe-path dispatch key).

### PDM-05 — The parity gate covers all three roles

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — a tracked surface restating a stale instruct/coding default makes the gate fail, naming surface and differing value | named red | Re-derived by re-injecting round 1's own defects. **F1's defect, mcp-client**: deleting `config.llm.model = INFERENCE_PROVIDERS.ollama.defaultModels.instruct` → `apps/mcp-client/src/config-cli.ts (use ollama, instruct): expected exactly 1 structural match … got 0 — seam derivation missing, reverted to a literal, or extractor rotted`. **F1's cross-provider leak, opencode-plugin**: `config.llm.codeModel = "qwen2.5-coder-7b-instruct"` in the ollama branch → `apps/opencode-plugin/src/config-cli.ts (use ollama, coding)` named. **M16**: `return process.env.OLLAMA_EMBEDDING_MODEL \|\| "totally-bogus-model:99b"` in `system.ts` → `no unlisted tracked file assigns a *_EMBEDDING_MODEL/DIMENSIONS default` red, naming `apps/tools-api/src/routes/system.ts` **and the exact offending line**. All three killed by name | ✅ PASS (⚠️ population notes N2/N6) |
| AC-2 — 0 or >1 extractor matches throws with the match count, never a silent pass | throw with count | `scripts/__tests__/embedding-defaults-parity.test.ts:61-82` `extractOne`, `:84-106` `checkStructural`, `:108-123` `checkMultiMatch` — the 0-match case is what fired on the F1 re-injection above, with the literal text `got 0 — extractor rotted or surface removed` | ✅ PASS |
| AC-3 — each checked-surface population count printed on a green run | counts visible without reading source | **14 `[parity]` lines** on the green run: reference pairs 2; pair surfaces 5; model-only 3; width-only 1; LM pair 1; LM model-only 2; derived structural **28**; instruct/coding 8; Markdown 8; embedding completeness scan 33; instruct/coding completeness scan 20; width-writer 4 (named); model→width entries bash 4 / TypeScript 4 | ⚠️ **PASS with N2** — the "28" is 28 array entries but **26 distinct** surfaces |

**Population verified against PDM-02 AC-2's own text, not against the table.** The AC names {installers ∪ config CLIs} × {ollama, lmstudio} × {embedding, instruct, coding}. Enumerated members and their coverage:

| Writer | ollama emb | ollama instr | ollama code | lms emb | lms instr | lms code |
| --- | --- | --- | --- | --- | --- | --- |
| `apps/mcp-client/src/config-cli.ts` | ✅ derived row | ✅ **new (F4)** | ✅ **new (F4)** | ✅ derived row ×2 branches | ✅ derived row ×2 | ✅ derived row ×2 |
| `apps/opencode-plugin/src/config-cli.ts` | ✅ | ✅ **new (F4)** | ✅ **new (F4)** | ✅ ×2 | ✅ ×2 | ✅ ×2 |
| `scripts/lib/installer-api-key.sh` | ✅ dims row + var | ✅ multi-match [1] | ✅ multi-match [1] | n/a (var) | ✅ multi-match [0] | ✅ multi-match [0] |
| `scripts/setup-local-first.sh` | ✅ model-only | ✅ multi-match [1] | ✅ multi-match [1] | ✅ LM model-only | ✅ multi-match [0] | ✅ multi-match [0] |
| `packages/shared/src/config/massa-ai-config.ts` (fresh-`init` template) | ✅ via `referencePair()` | ❌ no gate row (N6a) | ❌ no gate row (N6a) | n/a | n/a | n/a |

Every cell the AC names is now gated except the last row's instruct/coding pair — which **is** sensed, just not by the parity gate (measured: see mutation R-M17).

### PDM-03 / PDM-04 — Both providers embed at 1024

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — `ollama` defaults to `qwen3-embedding:0.6b` at 1024 | model+width pair | Seam `inference-providers.ts:93`; width table `embedding-dimensions.ts`; template `massa-ai-config.ts:403-405`; gate green over 5 pair surfaces + 3 model-only + 1 width-only, all against the live reference `qwen3-embedding:0.6b/1024`. **G2 closed**: `apps/tools-api/src/routes/system.ts:28-34` now resolves through `INFERENCE_PROVIDERS.ollama.defaultModels.embedding`; the only remaining `qwen3-embedding:4b` in the file is `:25`, a docblock naming the literal as retired. `system.test.ts:169-170` asserts `toBe(INFERENCE_PROVIDERS.ollama.defaultModels.embedding)` **and** `.not.toBe("qwen3-embedding:4b")` | ✅ PASS |
| AC-2 — `lmstudio` defaults to `text-embedding-qwen3-embedding-0.6b` at 1024 | model+width pair | `inference-providers.ts:114-116,122`; `scripts/diagnose.ts:129`. **G3 closed**: `scripts/diagnose.ts:22` now reads `text-embedding-qwen3-embedding-0.6b`, matching `:20`'s Ollama sibling and the `DEFAULT_MODEL` table at `:128-129` | ✅ PASS |
| AC-3 — a stale fingerprint refuses reads and writes with `EmbeddingIndexStaleError`, naming stored and current | both fingerprints in the message | `packages/core/src/__tests__/embedding-fingerprint.test.ts:181-189` — `new EmbeddingIndexStaleError("proj-1", "ollama:a:2560", "ollama:b:2560")`, `expect(err.name).toBe("EmbeddingIndexStaleError")` plus the two-fingerprint message assertions | ✅ PASS |
| AC-4 — a reachable LM Studio yields a 1024-length non-zero vector from `POST /v1/embeddings` | 1024, non-zero | **Observed live this run.** `bun test packages/core/src/__tests__/lmstudio-embedding-live.test.ts` → **2 pass / 0 fail**, log line `[lmstudio] Provider ready (model: text-embedding-qwen3-embedding-0.6b, dimensions: 1024)` | ✅ PASS |

### PDM-08 / PDM-09 / PDM-10 / PDM-11 — Runtime parameters per role

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — embedding 8192; instruct 16384 @ 0.2; coding 32768 @ 0.0 | exact table | `inference-providers.ts:30-34` `INFERENCE_ROLE_DEFAULTS`, read literally against `spec.md:65-69`, 3/3 rows match; `packages/shared/src/__tests__/inference-providers.test.ts:92,96-99,103-106` | ✅ PASS |
| AC-2 — an Ollama chat call sends the role's context as `options.num_ctx` | 16384 instruct / 32768 code | `llm-client.ts:328-346` `_wrapFetchContextWindow`, gated at `:362-363` on `spec.appliesContextPerRequest`; role resolution at `:234-237`. `packages/core/src/__tests__/llm-client.test.ts:946` `expect(parsed.options.num_ctx).toBe(16384)`, `:966` `…toBe(32768)`, `:899` `expect(parsed.options).toEqual({ seed: 1, num_ctx: 32768 })` (merge, not overwrite), `:972` LM Studio attaches no wrapper. All three `getLlmConfig` call sites (`:506`, `:561`, `:593`) forward `opts.modelRole`, so all 10 LLM call sites are role-resolved | ✅ PASS |
| AC-3 — on LM Studio the installer loads each model with `lms load -c <role context>` | 8192 / 16384 / 32768 | `scripts/setup-local-first.sh:370-373` — `"$LMSTUDIO_CLI" load -c 8192 … -c 16384 … -c 32768 …`, with an echo-the-commands fallback `:376-381`. Values match `INFERENCE_ROLE_DEFAULTS` exactly | ⚠️ **PASS on the code, spec-precision gap OPEN** — mutating `-c 16384` → `-c 4096` left the parity gate at 15/0 and five relevant shell suites at 0 failures. **Surviving mutant R-M18.** Carried from round 1; no fix task addressed it |
| AC-4 — the vector store submits 64 texts per provider call, not 8 | 3 `embedBatch` calls for 130 docs | `postgres-vector-store.ts:453` `_resolveEmbedBatchSize(loadConfigSafe().embedding)`; `packages/core/src/__tests__/vector-store-factory.test.ts:118-129` — real store, 130 documents, `expect(store.embedBatchCalls).toBe(3)` | ✅ PASS |
| AC-5 — a failed batch embed falls back per document at the larger batch size | fail-open preserved | `postgres-vector-store.ts` per-document loop unchanged; `packages/core/src/__tests__/postgres-vector-store-extended.test.ts:315` | ✅ PASS |

### PDM-12 / PDM-13 / PDM-14 — Every model setting configurable, config wins

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — five fields exist in `config.json` | `llm.contextWindow`, `llm.codeContextWindow`, `llm.codeTemperature`, `embedding.contextWindow`, `embedding.batchSize` | `packages/shared/src/config/massa-ai-config.ts:61,65` (embedding, deliberately optional — `:406` states why) and `:148,150,152` (llm, required, defaults at `:460-461`); validation in `config-writer.ts` | ✅ PASS |
| AC-2 — a value in `config.json` beats the role-table default, **for every one of those five** | file wins | **All five re-derived by mutation this round.** `embedding.batchSize` → `postgres-vector-store.ts:80`. `embedding.contextWindow` → `provider.ts:42-48`. `llm.contextWindow` / `codeContextWindow` / `codeTemperature` → `packages/shared/src/config/index.ts:781-787`, now sensed by `packages/shared/src/config/__tests__/llm-env-prefix.test.ts:273-284` — a real `config.json` written to a scratch `XDG_CONFIG_HOME`, read back through `config.get("llm")` in a fresh subprocess. **M12a/b/c re-injected one at a time and all three killed**, each on its own field (12000/16384, 40000/32768, 0.66/0) | ✅ **PASS — G6 closed** |
| AC-3 — the Portal Config tab renders a field for every one of those keys | in `embedding` / `llm` sections | `apps/web-ui/src/static/views/config-sections.ts:51` (embedding `contextWindow`), `:52` (`batchSize`), `:133` (llm `contextWindow`), `:134` (`codeContextWindow`), `:135` (`codeTemperature`) | ✅ PASS |
| AC-4 — a schema field absent from the Portal section table fails a deterministic gate, naming that field | named red | `apps/tools-api/src/routes/config-section-coverage.test.ts:156+` "Admin Portal config sections cover every schema field (PDM-14)"; the file's whole suite is green at 14/0 | ✅ PASS |
| AC-5 — a Portal `guide` citing a default model or width cites the current one | current values only | **G4 closed.** `config-sections.ts:128` now reads *"…falls back to that provider's coding default (e.g., `qwen2.5-coder:7b` for Ollama, `qwen2.5-coder-7b-instruct` for LM Studio), never the primary model."* **All 111 `guide:` strings in the file re-read independently**: the only model/width citations are `:47` (`qwen3-embedding:0.6b` / `text-embedding-qwen3-embedding-0.6b`), `:50` (1024), `:51` (8192), `:52` (64), `:127` (`qwen3-vl:8b` / `qwen3-vl-8b-instruct`), `:128`, `:129` (0.2), `:133` (16384), `:134` (32768), `:135` (0.0) — 10 of 10 match `INFERENCE_PROVIDERS` / `INFERENCE_ROLE_DEFAULTS` live values | ✅ PASS |

### PDM-06 — Install surfaces pull the same trio

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — `setup-local-first.sh` pulls and writes the selected provider's trio | provider-matched trio | `scripts/setup-local-first.sh:333-340` branch; pulls `:342-346`; writes `:576`. **G5 closed**: `scripts/lib/installer-api-key.sh:212-213,221-222` now read `${MASSA_AI_LLM_MODEL:-<literal>}` / `${MASSA_AI_LLM_CODE_MODEL:-<literal>}`, and the old self-referential assertion is gone. `bash scripts/tests/test-setup-local-first-api-key.sh` → **43 passed, 0 failed** | ✅ PASS |
| AC-2 — `install.sh` probes for the new instruct id | `qwen3-vl:8b` | `install.sh:379` `local llm_model="qwen3-vl:8b"`, `:380` `local llm_code_model="qwen2.5-coder:7b"`, probed `:382`; `.env` pair at `:419-420` (`qwen3-embedding:0.6b` / `1024`) | ✅ PASS |
| AC-3 — an absent instruct model leaves LLM features disabled, stating the reason | `MASSA_AI_LLM_ENABLED=false` + reason | `install.sh:381-383`; `scripts/setup-local-first.sh:535-540` `LLM_MODEL_PRESENT` gates `installer_feature_flow`, provider-dispatched through `inference_model_exists`. `test-installer-feature-prompts.sh` → 20/0; `test-lms-model-exists.sh` → 64/0; `test-setup-ollama-model-exists.sh` → 16/0 | ✅ PASS (⚠️ N6b) |

**Status**: ✅ **28 of 28 ACs met**, each traced to `file:line` with an assertion expression. **1 spec-precision gap remains open** (PDM-10 AC-3, unsensed — round 1's, unaddressed by any fix task); round 1's second spec-precision gap (PDM-12 AC-5) is closed.

---

## Discrimination Sensor

Strict isolation throughout. A no-op mutation aborts rather than reporting a verdict (`diff` checked after every `perl -0pi`). `git status --porcelain` measured `[]` after every restore.

### Population A — the round-1 defects and surviving mutants, re-injected verbatim

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| R-M16 | `apps/tools-api/src/routes/system.ts:28-34` | → `return process.env.OLLAMA_EMBEDDING_MODEL \|\| "totally-bogus-model:99b";` | ✅ **Killed** — parity gate red on the `*_EMBEDDING_MODEL/DIMENSIONS` completeness scan, naming the file **and the exact line**. Round 1's survivor is closed |
| R-F1a | `apps/mcp-client/src/config-cli.ts:289` | deleted `config.llm.model = INFERENCE_PROVIDERS.ollama.defaultModels.instruct;` | ✅ Killed — `(use ollama, instruct)` row named |
| R-F1b | `apps/opencode-plugin/src/config-cli.ts:294` | `defaultModels.coding` → literal `"qwen2.5-coder-7b-instruct"` (the cross-provider leak shape) | ✅ Killed — `(use ollama, coding)` row named |
| R-F2 | `apps/tools-api/src/routes/system.ts:29-33` | → `process.env.OLLAMA_EMBEDDING_MODEL \|\| "qwen3-embedding:4b"` (G2's original defect) | ✅ Killed — `system.test.ts` 12 pass / **2 fail**, both named |
| R-F2b | `apps/tools-api/src/routes/system.ts:30-31` | swapped to config-first (F2's inverted order) | ✅ Killed — 13 pass / **1 fail**, `OLLAMA_EMBEDDING_MODEL wins over config.json's embedding.model` |
| R-M12b | `packages/shared/src/config/index.ts:781` | dropped `fileConfig.llm?.contextWindow ??` | ✅ **Killed** — expected 12000, got 16384 |
| R-M12a | `packages/shared/src/config/index.ts:783` | dropped `fileConfig.llm?.codeContextWindow ??` | ✅ **Killed** — expected 40000, got 32768 |
| R-M12c | `packages/shared/src/config/index.ts:786` | dropped `fileConfig.llm?.codeTemperature ??` | ✅ **Killed** — expected 0.66, got 0 |

All four of round 1's survivors are dead.

### Population B — the fix tasks' own assertions (can they actually fail?)

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| R-F3a | `scripts/lib/installer-api-key.sh:212-213,221-222` | `${MASSA_AI_LLM_MODEL:-X}` → unconditional `"X"` (G5's defect) | ✅ Killed — `test-setup-local-first-api-key.sh` 41 passed / **2 failed** (both override-survives cases). The round-1 self-referential assertion is gone |
| R-F3b | `scripts/lib/installer-api-key.sh:222` | ollama coding literal → `qwen2.5-coder:3b` | ✅ Killed — 42 passed / **1 failed** (default-still-applies case) |
| R-F6 | `scripts/tests/test-setup-wizard-db-selection.sh` **and** `test-lms-model-exists.sh` | appended a failing exit to **two** passing suites | ✅ Killed — one run, `FAILED SHELL SUITES (5 of 39)` listing both induced suites beside the 3 host ones, aggregate exit 1, **all 39 suites ran** |
| R-M15 | `packages/shared/src/config/inference-providers.ts:121-125` | deleted `defaultModels` from the lmstudio spec | ✅ Killed — `error TS2741` |
| R-M15b | `packages/shared/src/config/inference-providers.ts:124` | deleted **one** role key (`coding`) | ✅ Killed — `error TS2741: Property 'coding' is missing` |

### Population C — the set-vs-subset hunt (new subjects this round)

Every set the spec names was enumerated and each member checked. These are the members that were **not** obviously covered, mutated to find out.

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| R-M17 | `packages/shared/src/config/massa-ai-config.ts:454-455` | `llm.model`/`codeModel` → retired literals `"qwen2.5:7b-instruct"`/`"qwen2.5-coder:3b"` (the fresh-`init` config template — a config.json writer with no parity-gate row) | ✅ Killed — **but not by the parity gate** (15/0, unchanged) nor by `massa-ai-config-defaults.test.ts` (2/0, which asserts only the *embedding* model and width). Killed by `packages/shared/src/config/__tests__/llm-env-prefix.test.ts` AD-010, 2 named failures. Baseline re-measured clean at 270/0 |
| R-M19 | `scripts/setup-local-first.sh:536` | `${LLM_MODEL:-qwen3-vl:8b}` → bogus (the file's **third** instruct literal, outside the gate's 2-match extractor) | ✅ Killed — **not by the parity gate** (15/0), by `test-lms-model-exists.sh` (63 passed / 1 failed) |
| **R-M18** | `scripts/setup-local-first.sh:371` | `lms load -c 16384` → `-c 4096` (PDM-10 AC-3's role context values) | ❌ **Survived** — parity gate 15/0; `test-setup-local-first-api-key.sh` 43/0; `test-installer-feature-prompts.sh` 20/0; `test-setup-wizard-db-selection.sh` 11/0; `test-lms-model-exists.sh` 64/0; `test-setup-ollama-model-exists.sh` 16/0 |

### Non-mutation verification

- **F8's regenerated golden re-diffed independently** (`git show 27e7f2e6^:…render-golden.json` vs HEAD, compared key-by-key): **88 keys before, 88 after; 0 added, 0 removed, 2 changed** (`renderConfig/read`, `renderConfig/write`), each a **pure insertion** of exactly `at provider&#39;s coding default (e.g., <code>qwen2.5-coder:7b</code> for Ollama, <code>qwen2.5-coder-7b-instruct</code> for LM Studio), never th` (+145 bytes). Every changed byte is explained by the stated change; 86 cases byte-identical.
- **`DERIVED_SURFACES` population re-counted at runtime**: 28 entries, **26 distinct labels** (N2).
- **Retired-literal sweep** across all tracked non-`.specs/` files for `qwen2.5:7b-instruct`, `qwen3-embedding:4b`, `text-embedding-nomic-embed-text-v1.5`, `qwen3-embedding:8b`. Every production hit resolved: width-table entries (legitimate), docblocks naming a literal *as retired*, commented `.env.example` alternatives, the deliberately provider-independent `benchmarks/llm-judge/run.ts` judge default (declared in the gate's `known` set), and the two `NEEDLE_MODEL` sites (N3).

**Sensor depth**: P0-full — 16 mutations across the gate's 6 tiers, the type system, all 5 PDM-12 readers, both CLIs, the installer lib, the shell-suite runner, the Portal golden, and 3 deliberately-chosen blind-spot probes.
**Result**: **16 injected, 15 killed, 1 survived.**

---

## Round-1 Gap Closure

| Round-1 gap | Fix task | Independently re-verified this round | Status |
| --- | --- | --- | --- |
| **G0** — `use ollama` writes LM Studio's instruct/coding ids (blocker) | F1 | 16-cell matrix executed; R-F1a/R-F1b killed by name | ✅ **Closed** |
| **G1** — no instruct/coding completeness scan; `process.env.X \|\| "literal"` blind spot | F4 | R-M16 killed naming file+line; new instruct/coding scan population 20; 4 new `(use ollama, …)` rows kill by label | ✅ **Closed** (⚠️ N2) |
| **G2** — `/api/v1/system/ollama` reports the retired default, test pins it | F2 | `system.ts:28-34` seam-resolved; `system.test.ts:169-170` asserts the seam **and** `.not.toBe("qwen3-embedding:4b")`; R-F2 killed | ✅ **Closed** |
| — precedence specified backwards by the orchestrator | F2b | Shipped order is **env → config.json → seam** (`system.ts:30-32`), matching `CLAUDE.md:320-321` and `design.md:51,268`; test values inverted with it (`system.test.ts:177-187`); R-F2b killed. **No other *route* in the diff carries an inverted precedence** (only `system.ts` changed under `routes/`) | ✅ **Closed** — but see **N1**, a non-route resolver in the same diff that does |
| **G3** — `diagnose.ts:22` stale LM Studio default | F7 | `scripts/diagnose.ts:22` now `text-embedding-qwen3-embedding-0.6b` | ✅ **Closed** |
| **G4** — Portal `codeModel` guide describes reversed behaviour | F8 | `config-sections.ts:128` corrected; golden diff fully explained; all 111 guide strings re-read | ✅ **Closed** |
| **G5** — installer clobbers `MASSA_AI_LLM_MODEL` | F3 | R-F3a/R-F3b both kill; the self-referential assertion is gone | ✅ **Closed** |
| **G6** — three surviving mutants at the production `llm.*` reader | F5 | M12a/b/c all killed, each on its own field, through `config.get("llm")` in a fresh subprocess | ✅ **Closed** |
| `test:scripts` under-reports (aborts at suite 16/39) | F6 | Two induced failures reported together with the 3 host ones; 39/39 suites ran; exit 1 | ✅ **Closed** |
| PDM-10 AC-3 structural-only (spec-precision gap) | *none* | R-M18 **survived** across 6 sensors | ❌ **Still open** |
| PDM-12 AC-5 intent (spec-precision gap) | F8 | closed with G4 | ✅ **Closed** |

**9 of 10 closed.**

---

## Ranked Gaps

### N1 — `_resolveEmbedContextWindow` resolves `config.json` **over** the env var, inverting the project's documented precedence — **Major**

- **Where**: `packages/core/src/services/embeddings/provider.ts:42-48`
  ```ts
  return (
    embeddingConfig?.contextWindow ??
    parsePositiveIntEnv(process.env.OLLAMA_EMBEDDING_NUM_CTX, INFERENCE_ROLE_DEFAULTS.embedding.contextWindow)
  );
  ```
- **The convention it breaks**: `CLAUDE.md:320-321` — *"precedence is env > `config.json` > literal defaults"*. `design.md:268` states it for this feature in the strongest available terms: *"**No precedence machinery changes** — resolution is already env > file > default, so a written field wins by construction."* That sentence is now false about the code this feature shipped.
- **Introduced by this feature.** `git show main:packages/core/src/services/embeddings/provider.ts:38` reads `parsePositiveIntEnv(process.env.OLLAMA_EMBEDDING_NUM_CTX, <default>)` — env over default, no config layer. Commit `a737c847` ("feat(embeddings): give embedding.contextWindow a reader", T06b) inserted `embeddingConfig?.contextWindow ??` **above** the env read.
- **Deliberate and pinned**: the docblock at `provider.ts:36-37` states *"`config.embedding.contextWindow` wins over `OLLAMA_EMBEDDING_NUM_CTX`"*, and `packages/core/src/__tests__/embeddings-provider.test.ts:469-471` asserts it — `test("config value wins over an explicit env override")`, `process.env.OLLAMA_EMBEDDING_NUM_CTX = "20000"`, `expect(_resolveEmbedContextWindow({ contextWindow: 12000 })).toBe(12000)`. **A test encoding the divergence as the contract** — structurally identical to G2, which forced F2b.
- **User-visible**: `OLLAMA_EMBEDDING_NUM_CTX` is a shipped knob (`.env.example:211`, `CHANGELOG.md:1739`). A container or CI run that sets it is silently overridden by any `config.json` carrying `embedding.contextWindow`. Blast radius is bounded — `massa-ai-config.ts:406` deliberately leaves the field unset in the shipped template, so only a user who set it explicitly is affected.
- **Its immediate sibling disagrees**: `packages/core/src/services/embeddings/config.ts` uses `process.env.X || file?.Y || default` at **every** one of its ~10 resolution sites (`:142`, `:213`, `:246`, `:275`, `:287`, `:291`). This one function is the exception in its own directory.
- **Why it matters beyond the one field**: F2b's own justification was *"Shipping one route with inverted precedence would make `/api/v1/system/ollama` the only surface in the codebase where an env var loses to a config file."* That sentence now describes `_resolveEmbedContextWindow`. The fix swept the one site the round-1 verifier named and did not enumerate the class — **the fifth instance of this feature's dominant defect class, this time in a fix task**.
- **Not an AC failure**: PDM-12 AC-2's text is *"in preference to the role-table default"*, and it is satisfied. The violation is against `design.md:268` and `CLAUDE.md:320-321`.
- **Two legitimate resolutions**, both one-line: reorder the resolver and invert `embeddings-provider.test.ts:469-471` (mirroring F2b exactly), **or** ratify the inversion by amending `design.md:268` and recording it as a deliberate exception. Either is fine; shipping the contradiction silently is not.

### N2 — the parity gate's structural population count overstates by 2, and two surfaces are checked twice — **Minor**

- **Where**: `scripts/__tests__/embedding-defaults-parity.test.ts:258-341`. The two `packages/core/src/services/embeddings/config.ts` rows sit **inside** the `CONFIG_CLI_FILES.flatMap((file) => [ … ])` array literal, so they are emitted once per CLI.
- **Measured**: `DERIVED_SURFACES.length === 28`; distinct labels `=== 26`. The gate prints `[parity] derived structural surfaces checked: 28`.
- **Why it matters**: PDM-05 AC-3 exists so *"a parse-zero-subjects regression is visible without reading the source"* — the printed number is a claim, and it is wrong by 2. F4's own task text carries the same inflated arithmetic (`24 → 28 structural rows`; the true distinct counts are 22 → 26, and 4 rows were genuinely added). Detection is unaffected. Pre-existing from T13, not introduced by F4 — but F4 re-derived this population from the requirement and did not catch it.

### N3 — the declared `NEEDLE_MODEL` residual names 1 of its 2 files, and `run.ts`'s own docblock still makes the claim the README retracted — **Minor**

- `benchmarks/needles/README.md:66-73` declares, honestly and deliberately, that `benchmarks/needles/run.ts`'s `NEEDLE_MODEL` default still pins the retired `qwen3-embedding:4b` and that this was in no task's write set.
- **The set has two members.** `scripts/needles-rename-control.ts:118` carries the byte-identical `const DEFAULT_MODEL = process.env.NEEDLE_MODEL ?? "qwen3-embedding:4b";` and is named in **no** artifact — not the README note, not `FEATURES.json`'s residuals list, not `STATE.md`.
- `benchmarks/needles/run.ts:9` still reads *"qwen3-embedding:4b by default — **same model as the E2E baseline**"*. The README (`:68-69`) explicitly says that is no longer true: the E2E baseline moved to `qwen3-embedding:0.6b`/1024d. The doc describing the file was corrected; the file was not.
- Neither file is reachable by any parity tier: both scans key on `*_EMBEDDING_MODEL` / `*_LLM_MODEL`, and the token here is `NEEDLE_MODEL`.

### N4 — `use ollama --base-url <url>` now writes an Ollama LLM base URL without the required `/v1` — **Minor (regression introduced by F1)**

- **Where**: `apps/mcp-client/src/config-cli.ts:288` and `apps/opencode-plugin/src/config-cli.ts:293` — `config.llm.baseUrl = (options["base-url"] as string) || INFERENCE_PROVIDERS.ollama.defaultLlmBaseUrl;`
- `--base-url` is documented as the **embedding** endpoint (`config-cli.ts:85`), and Ollama's embedding and LLM base URLs differ by the `/v1` suffix (`inference-providers.ts:85-86`: `http://localhost:11434` vs `http://localhost:11434/v1`). **Measured**: `init` → `use ollama --base-url http://h:11434` writes `llm.baseUrl: "http://h:11434"`. `llm-client.ts:369` passes `llm.baseUrl` straight to the OpenAI-compatible provider as `baseURL`, so every LLM call from that config hits a path without `/v1`.
- Pre-F1 the ollama branch never assigned `llm.baseUrl`, so the value stayed at the correct default. The lmstudio branch is unaffected (its two base URLs are identical). Reproduced identically on both CLIs. Not an AC-2 failure (a baseUrl is not a model id); the equivalent fix is `installer_provider_defaults`' own `LLM_BASE_URL="${OLLAMA_URL:-…}/v1"` (`installer-api-key.sh:218`).

### N5 — PDM-10 AC-3's three `lms load -c` values have no sensor — **Minor (carried from round 1, unaddressed)**

- `scripts/setup-local-first.sh:370-373` hardcodes `8192`/`16384`/`32768` rather than deriving them from `INFERENCE_ROLE_DEFAULTS`, and mutating one leaves every gate green (R-M18). Round 1 flagged this as a spec-precision gap; no fix task was written for it. Recorded here as a **measured** surviving mutant, not an inference.

### N6 — gate-population notes (no live defect; each member is sensed elsewhere) — **Informational**

- **N6a** — `packages/shared/src/config/massa-ai-config.ts:454-455` writes the instruct and coding ids into every fresh `config.json` and has **no** parity-gate row; its own `massa-ai-config-defaults.test.ts` asserts only the embedding model and width. R-M17 is killed, but by `llm-env-prefix.test.ts` (AD-010) — a test whose subject is the env prefix, not the template.
- **N6b** — `scripts/setup-local-first.sh:536` carries a **third** instruct literal, `${LLM_MODEL:-qwen3-vl:8b}`, outside the gate's `expected.length === 2` extractor, and it is provider-blind (an Ollama tag on a provider-neutral code path). Dead in practice — `:334-339` always sets `LLM_MODEL` first. R-M19 is killed by `test-lms-model-exists.sh`.
- **N6c** — `scripts/diagnose.ts:20,22`'s docblock defaults remain unreachable by every tier (the extractors anchor on the `DEFAULT_MODEL` table; the file is in the completeness scan's `known` set). F7 fixed the value and documented the blind spot; the blind spot itself is unchanged.

---

## Edge Cases

- [x] A `config.json` already naming a model keeps it (A-05) — verified through the production reader in a fresh subprocess (`llm-env-prefix.test.ts:273-284`) and by the 16-cell CLI matrix.
- [x] The LM Studio MLX build's `/v1/embeddings` failure is surfaced unchanged (A-01) — no product code claims otherwise.
- [x] 2560 → 1024 flips `postgres-vector-store.ts` to the `≤ 2000` direct-HNSW-cosine branch — stated as a **retrieval algorithm change** in `CHANGELOG.md:12-18` and `README.md:728-744`, not merely a size change.
- [x] The needles floors are explicit `null` with a calibration note (`14.needles.test.ts:79-109`), never the 2560-derived numbers. A **deliberate gate weakening**, declared as such in the spec, the file, the CHANGELOG and `benchmarks/needles/README.md`.
- [x] `qwen3-embedding:0.6b` already at 1024 in `KNOWN_EMBEDDING_DIMENSIONS` — the gate's bash↔TypeScript comparison is green at 4 entries each side.

---

## Skipped Checks (with reasons)

| Check | Reason |
| --- | --- |
| `packages/core/src/__tests__/e2e/14.needles.test.ts` | **Genuinely unobservable, re-measured this run, not assumed.** Port probe: `:3333` **DOWN**, `:11434` **UP**, `:1234` **UP** — so `AVAIL.API_UP` is false while both inference arms are up. `RUN_E2E=1 bun test …` under a scratch `XDG_CONFIG_HOME` → **0 pass / 2 skip / 0 fail**. Recorded as a **skipped sensor**, never as a pass. T14's claims about this file remain statically verified only. |
| Retrieval quality at 1024 dimensions | **Out of scope by the user's explicit choice (A-03) — an accepted risk, not a closed question.** Confirmed this round that no artifact softens it: `spec.md:94` flags *"this **weakens a gate**. Re-calibration is the follow-up"*; `CHANGELOG.md:22-23` says *"**has not been re-measured** … ships as an accepted, unmeasured risk rather than a validated improvement"*; `README.md:742` repeats it verbatim. No hedging found. |
| `bun run test:integration`, `test:coverage`, `bench:needles:gate` | Not in this feature's Gate Check Commands; `needles-gate.yml` is `workflow_dispatch`-only and `continue-on-error`. |
| Running the 3 failing shell suites against `main` | Not needed and not run: the subject-exclusion + shared-file + assertion-content argument above is conclusive on this branch's own evidence, and running the plugin installers risks writing to the developer's real `~/.claude`. |

---

## Code Quality

| Check | Pass? |
| --- | --- |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ — `scripts/run-shell-suites.sh` replaces an inline loop that could not satisfy F6; the `_resolve*` helpers each have a real call site |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ for the fix pass |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns/style | ⚠️ — **N1**: `_resolveEmbedContextWindow` is the only resolver in `services/embeddings/` that puts config ahead of env |
| Would a senior engineer approve? | ❌ — N1 contradicts `design.md:268` in the same diff that wrote it |
| Tests map to ACs and are non-shallow | ✅ — F3's replacement assertions and F5's subprocess reader both demonstrated failing on their own subject |
| Spec-anchored outcome check | ⚠️ — 1 spec-precision gap open (PDM-10 AC-3) |
| Per-layer coverage expectation met | ✅ |
| Every test maps to a spec requirement | ✅ |
| Validation assets not weakened | ⚠️ — `14.needles.test.ts` floors nulled. Deliberate, declared (A-03), argued from measurement, offset by unconditional `anyHits` + determinism assertions. A knowingly-weakened gate awaiting recalibration, not a silent relaxation. |
| Documented guidelines followed | ⚠️ — **N1** diverges from `CLAUDE.md:320-321` |

**Process note (not a defect in the delivered code)**: F2's own resolution text records using `git stash` to baseline a failure. `spec.md:327` forbids `git stash` for this feature's verification. The tree is clean and no evidence depends on it, so it is recorded rather than escalated. Separately, F2/F2b both claim a *pre-existing* `LocalHealthChecker.checkOllama` failure in `system.test.ts` (13 pass / 1 fail); this run measures **14 pass / 0 fail** on that file. The claim is stale — the file is fully green.

---

## Interactive UAT

**Not applicable** — the change is configuration defaults, a seam, installers, and a gate. The one user-facing surface (Admin Portal Config tab) is covered by the field-level gate (PDM-14 AC-4) and by `render-golden.test.ts`, whose regenerated fixture was re-diffed byte-for-byte here.

---

## Requirement Traceability Update

| Requirement | Round 1 | Round 2 |
| --- | --- | --- |
| PDM-01 | ✅ Verified | ✅ Verified |
| PDM-02 | ❌ Needs Fix (AC-2) | ✅ **Verified** — 16/16 cells |
| PDM-03 | ⚠️ gap G2 | ✅ **Verified** |
| PDM-04 | ⚠️ gap G3 | ✅ **Verified** |
| PDM-05 | ⚠️ gap G1 | ✅ Verified (⚠️ N2 count) |
| PDM-06 | ⚠️ gap G5 | ✅ **Verified** |
| PDM-07 | ✅ Verified | ✅ Verified (live LM Studio, 1024, observed) |
| PDM-08 | ✅ Verified | ✅ Verified |
| PDM-09 | ✅ Verified | ✅ Verified |
| PDM-10 | ⚠️ spec-precision gap | ⚠️ **Still open** — R-M18 survived |
| PDM-11 | ✅ Verified | ✅ Verified |
| PDM-12 | ⚠️ 3 surviving mutants | ⚠️ AC-2 **Verified** (M12a/b/c killed); **N1** on `embedding.contextWindow`'s precedence |
| PDM-13 | ✅ Verified | ✅ Verified |
| PDM-14 | ✅ Verified | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready
**Result**: **FAIL** (round 2 of max 3)

**Spec-anchored check**: **28/28 ACs met**, all traced to `file:line` + assertion expression. **1 spec-precision gap open** (PDM-10 AC-3).
**Round-1 gaps**: **9 of 10 closed**, each independently re-derived by re-injecting the original defect; PDM-10 AC-3 still open.
**Sensor**: **16 injected, 15 killed, 1 survived** (R-M18, `lms load -c`).
**Gate**: lint 0, type-check 0, build 0, test 0, test:plugins 0 (142/0), parity 0 (15/0, 14 population lines), check_specs_delivered 0 (7 paths); `test:scripts` 1 — 3 host-specific shell suites (22 cases), whose subjects are absent from the 65-file diff.

**What the fix pass genuinely closed**: the `use ollama` blocker, on both CLIs in both switch directions, measured across 16 cells; the gate's blindness to its own bug, proven by killing F1's and F2's original defects **by name**; the three production `llm.*` reader mutants, each on its own field through the real `config.get("llm")` path; the env-over-config precedence on `/api/v1/system/ollama`, with the test values inverted alongside; the installer's silent model clobber, with a replacement assertion that demonstrably fails; `test:scripts` reporting every failing suite; and a golden fixture whose every changed byte is accounted for.

**Why it still fails**: one new Major defect and one carried gap. `_resolveEmbedContextWindow` ships the exact inverted precedence F2b was written to eliminate — documented in its own docblock, pinned by a test, and contradicting `design.md:268`'s explicit "No precedence machinery changes". F2b fixed the one site the previous verifier named; the class was not enumerated. That is the **fifth** instance of this feature's dominant defect class — a requirement (or a fix) naming a set, and the work naming a subset — and this time it is inside the fix pass itself.

**Next steps**: resolve N1 (reorder and invert the two test values, mirroring F2b — or ratify the inversion by amending `design.md:268`); decide N5 (derive the three `lms load -c` values from `INFERENCE_ROLE_DEFAULTS` and add a sensor, or record the gap as accepted); N2/N3/N4 are one-line repairs. `.specs/project/FEATURES.json`'s current `status: in_progress`, `completed: null`, `validation: validation.md` are **supported by this run** and should stay until a PASS exists.
