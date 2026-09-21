# Per-Provider Default Models — Validation (Round 3, final)

**Date**: 2026-09-21
**Spec**: `.specs/features/per-provider-default-models/spec.md`
**Diff range**: `main..HEAD` — **49 commits**, HEAD `54298e10`, branch `feat/per-provider-default-models`, **67 files changed**
**Worktree**: `/Users/luizmassa/Projects/massa-ai-feat-per-provider-default-models`
**Verifier**: independent sub-agent, round 3 of max 3 (author ≠ verifier). Read-only against the real tree. Every mutation: `cp f f.bak` → mutate → run → `cp f.bak f` → `rm f.bak`. No `git checkout/restore/stash/reset/clean` at any point. `git status --porcelain` measured `[]` before every mutation, after every restore, and at the end of the run.

**Result**: ✅ **PASS** — **25/25 acceptance criteria met**, **all 6 round-2 gaps (N1–N6 / G1–G6) closed and independently re-derived by re-injecting the original defect**, **14 mutations injected / 11 killed / 3 survived** (all 3 survivors are documentation-prose values that are currently *correct*, in a gate tier whose membership-only scope is declared in its own source and is symmetric with the embedding coverage PDM-05 AC-1 calibrates against). No new defect in delivered behaviour was found.

---

## Rounds 1 and 2, for continuity

- **Round 1** (HEAD `bc7caa4b`, 28 commits) — **FAIL**. PDM-02 AC-2 not met (blocker G0: `use ollama` wrote none of the three `config.llm.*` fields while the `lmstudio` branch wrote all three), 2 spec-precision gaps, **16 injected / 12 killed / 4 survived**. Fix Pass 1 = F1–F9 + F2b.
- **Round 2** (HEAD `ac356ab5`, 41 commits) — **FAIL**. 9 of 10 round-1 gaps closed; **16 injected / 15 killed / 1 survived** (R-M18, `lms load -c`); 1 new **Major** defect (N1, inverted config-over-env precedence in `_resolveEmbedContextWindow`) plus N2–N6. Fix Pass 2 = G1–G6.
- **Nothing below is inherited from either report.** Every claim was re-derived from the tree, and two round-2 figures were found wrong and are corrected here (see *Arithmetic corrections*).

### Arithmetic corrections to round 2's own report

| Round-2 claim | Re-measured | Evidence |
| --- | --- | --- |
| "28/28 acceptance criteria met" | **25** ACs exist | Counted from `spec.md`'s six `**Acceptance Criteria**` numbered lists: 5 + 3 + 4 + 5 + 5 + 3 = **25**. The "28" is not derivable from the spec text. All 25 are met, so the verdict is unaffected — the count is not. |
| `test:plugins` "10 files" / `test:scripts` bun half "2058 pass across 89 files" | 10 files ✅ / **2064 pass across 89 files** | This run's own counts (below). |

---

## Gate Check

Run from a clean tree, `MASSA_AI_EXECUTOR_SANDBOX=none`. Turbo tasks re-run with `--force` because a cached replay is not a measurement.

| Gate | Exit | Counts | Judgement |
| --- | --- | --- | --- |
| `bun run lint` (oxlint) | **0** | no violations | clean |
| `bun run type-check` (`turbo … --force`) | **0** | 6 tasks, **0 cached** | clean |
| `bun run build` (`turbo … --force`) | **0** | 6 tasks, 0 cached, 5.4 s | clean |
| `bun run test` (`turbo … --force`, scratch `XDG_CONFIG_HOME`) | **0** | **12 successful / 12 total**, 0 cached, 1 m 16 s | clean |
| `bun run test` (`turbo … --force`, **real** `~/.config/massa-ai`) | **0** | **12 successful / 12 total**, **0 `(fail)` lines in the whole log** | clean — see *The reported environmental failure* |
| `bun run test:plugins` | **0** | **142 pass / 0 fail**, 937 expect(), 10 files, 134 s | clean |
| `bun run test:scripts` | **1** | bun half **2064 pass / 0 fail across 89 files**; shell half **all 39 suites ran**, 3 failed, named together | **not this feature's** — see below |
| `bun test scripts/__tests__/embedding-defaults-parity.test.ts` | **0** | **21 pass / 0 fail**, 41 expect(); **14 `[parity]` population lines** | clean |
| `bun skills/massa-ai/scripts/check_specs_delivered.ts per-provider-default-models --root .` | **0** | 7 paths checked, 0 errors | clean |

### The reported environmental failure — measured both ways, and it did not reproduce

The brief reported `bun run test` exiting **1** on `@massa-ai/mcp-client`'s `src/__tests__/embedded-api-client-endpoints.test.ts`. **It did not reproduce in either configuration this round**, and the diagnosis is *environmental*, on this run's own evidence:

1. **Scratch `XDG_CONFIG_HOME`**: `bunx turbo run test --force` → exit **0**, 12/12 tasks.
2. **The developer's real `~/.config/massa-ai`** (the configuration the failure was attributed to): `bunx turbo run test --force` → exit **0**, 12/12 tasks, `@massa-ai/mcp-client` `[test-isolation] PASS: all 13 group(s)`, and `grep -c "^@massa-ai/.*(fail)"` over the 13 386-line log = **0**.
3. **The named suite standalone, under the real config**: **122 pass / 0 fail in 8.95 s** — a slow *complete*, not a 5001 ms *bail*. The repository's own tell for this failure class (`EmbeddedApiClient phantom: wall clock, not load`) says a real occurrence bails at ~24 s; nothing here is near that.
4. **Source exclusion**: `git diff --stat fd56bfe1..HEAD -- packages/ apps/` is **empty** — the batch that first reported the failure changed no source at all.

**Judgement: environmental, not a regression this feature introduced.** Not a round-3 gap.

### `test:scripts` exit 1 — re-derived on this run's own evidence

`bash scripts/run-shell-suites.sh` (F6's runner) ran **all 39 suites to completion** and reported them together:

```
FAILED SHELL SUITES (3 of 39):
  - scripts/tests/test-install-skills-cli.sh
  - scripts/tests/test-plugin-auto-install.sh
  - scripts/tests/test-plugin-registry-registration.sh
```

**22 failing cases, full list, with my own ownership judgement:**

| Suite | Counts | Failing cases |
| --- | --- | --- |
| `test-install-skills-cli.sh` | 44 passed / **2 failed** (46) | `no tools exits 2 → got='1' want='2'`; `reason is reported → 'No requested agent tools are installed.' not found in output` |
| `test-plugin-auto-install.sh` | 194 passed / **16 failed** (210) | 13 of the shape `got='claude <host> ' want='<host> '` or `got='claude ' want=''` (codex/cursor/opencode dir-only, cursor binary-only, skip-current, downgrade, upgrade, install, 0-detected-hosts, wiped-sentinel, sentinel-present, partial×3); `absent hosts logged skips → 'skip claude: host not detected' not found`; `0 detected hosts → no marketplace dir → unexpected file: …/.config/massa-ai/marketplace` |
| `test-plugin-registry-registration.sh` | 43 passed / **4 failed** (47) | `loose commands installed → got='0' want='46'`; `prints the manual registration command → 'claude plugin marketplace add' not found in output`; `no registry written without the CLI → unexpected file: …/.claude/plugins/installed_plugins.json`; `seeded file-route commands → got='0' want='46'` |

**Not this feature's.** Three independent arguments, each measured here:

1. **Subject exclusion.** `git diff --name-only main..HEAD | grep -iE 'install-skills|install-harness|install-agents|host-capabilities|plugin|marketplace|registry'` returns exactly two paths — `apps/opencode-plugin/src/config-cli.ts` and its test. Neither the three suite files nor any of their subjects (`scripts/install-skills.sh`, `scripts/install-harness.sh`, `scripts/install-agents.sh`, the four plugin `install.sh` scripts, `scripts/lib/host-capabilities.ts`) is in the 67-file diff.
2. **Shared-file audit.** The only repo-wide files in the diff are `package.json` (**1 line**: the `test:scripts` script body) and `turbo.json` (**1 line**: `MASSA_AI_LLM_CODE_TEMPERATURE` added to `passThroughEnv`). Neither is read by these suites.
3. **Assertion content, and the host tell.** Not one of the 22 assertions names a model id, a provider, a config field, or a role. The dominant shape — `got='claude …' want='…'` — is a **real `~/.claude` on this developer machine leaking into the detected-host list**, and `'claude plugin marketplace add' not found in output` is a missing or older Claude CLI. Both are properties of the machine, not of the branch.

---

## Spec-Anchored Acceptance Criteria — 25 of 25

### PDM-01 / PDM-02 — One seam owns every default model (5 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — each `InferenceProviderSpec` exposes a default model id for embedding, instruct, coding | 3 role ids per provider | `packages/shared/src/config/inference-providers.ts:93-97` (ollama `qwen3-embedding:0.6b` / `qwen3-vl:8b` / `qwen2.5-coder:7b`) and `:118-122` (lmstudio `text-embedding-qwen3-embedding-0.6b` / `qwen3-vl-8b-instruct` / `qwen2.5-coder-7b-instruct`) — all **6 cells** read literally against `spec.md:53-57`, 6/6 match | ✅ PASS |
| AC-2 — a writer writes **that provider's three model ids**, never another's | after the write, all three ids belong to the named provider | **20 cells executed live** (matrix below), every cell internally consistent | ✅ PASS |
| AC-3 — with no env and no file value, instruct and coding resolve from the configured provider's seam entry | not a global constant | `packages/core/src/services/memory/llm-client.ts:225-227` — `role === "code" ? cfg?.codeModel ?? spec.defaultModels.coding : cfg?.model ?? spec.defaultModels.instruct`, where `spec = resolveInferenceSpec(baseUrl)`; `packages/shared/src/config/index.ts` `DEFAULT_LLM_MODEL`/`DEFAULT_LLM_CODE_MODEL` derive from `INFERENCE_PROVIDERS[activeInferenceProviderId()]`, asserted by `packages/shared/src/config/__tests__/llm-env-prefix.test.ts:164-230` for both providers | ✅ PASS |
| AC-4 — a provider id in `LOCAL_INFERENCE_IDS` missing any of the three fields fails TypeScript compilation | compile error | Round 2 re-derived twice (whole `defaultModels` block deleted → `TS2741: Property 'defaultModels' is missing`; **one role key** deleted → `TS2741: Property 'coding' is missing in type '{ embedding: string; instruct: string; }'`). Re-confirmed structurally this round: `inference-providers.ts:42` types the field as `Readonly<Record<InferenceRole, string>>` over `InferenceRole = "embedding" \| "instruct" \| "coding"` (`:28`), so the per-role subset case is a type error by construction, not by an allowlist | ✅ PASS |
| AC-5 — no explicit `codeModel` falls back to the provider's coding default, **never** the instruct model | `spec.defaultModels.coding` | `llm-client.ts:225` (expression above — the `?? spec.defaultModels.coding` branch has no `?? cfg?.model` fallback); Portal guide agrees at `config-sections.ts:128` | ✅ PASS |

#### AC-2 — Independent Test executed, **20 cells**, scratch `XDG_CONFIG_HOME` per cell

`spec.md:130-133`'s command, extended across provider × `--base-url` × CLI and both switch-away directions.

| CLI | Sequence | `embedding.baseURL` | `llm.baseUrl` | emb model / dims | `llm.model` | `llm.codeModel` | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mcp-client | `init` | `:11434` | `:11434/v1` | `qwen3-embedding:0.6b` / 1024 | `qwen3-vl:8b` | `qwen2.5-coder:7b` | ✅ |
| mcp-client | `init --lmstudio` | `:1234/v1` | `:1234/v1` | `text-embedding-qwen3-embedding-0.6b` / 1024 | `qwen3-vl-8b-instruct` | `qwen2.5-coder-7b-instruct` | ✅ |
| mcp-client | `init` → `use ollama` | `:11434` | `:11434/v1` | ollama / 1024 | `qwen3-vl:8b` | `qwen2.5-coder:7b` | ✅ |
| mcp-client | `init` → `use lmstudio` | `:1234/v1` | `:1234/v1` | lmstudio / 1024 | `qwen3-vl-8b-instruct` | `qwen2.5-coder-7b-instruct` | ✅ |
| mcp-client | **`init --lmstudio` → `use ollama`** (round-1 blocker G0) | `:11434` | **`:11434/v1`** | ollama / 1024 | **`qwen3-vl:8b`** | **`qwen2.5-coder:7b`** | ✅ |
| mcp-client | `init --lmstudio` → `use lmstudio` | `:1234/v1` | `:1234/v1` | lmstudio / 1024 | lmstudio | lmstudio | ✅ |
| mcp-client | `init` → `use lmstudio` → `use ollama` | `:11434` | `:11434/v1` | ollama / 1024 | ollama | ollama | ✅ |
| mcp-client | **`use ollama --base-url http://h.example:9999`** (round-2 N4) | `http://h.example:9999` | **`http://h.example:9999/v1`** | ollama / 1024 | ollama | ollama | ✅ **N4 closed** |
| mcp-client | **`use lmstudio --base-url http://h.example:9999`** | `http://h.example:9999` | **`http://h.example:9999`** (no suffix) | lmstudio / 1024 | lmstudio | lmstudio | ✅ |
| mcp-client | `init --base-url X` / `init --lmstudio --base-url X` | provider default | provider default | provider default | provider default | provider default | ✅ flag inert |
| opencode-plugin | **all ten** | **byte-identical to the mcp-client rows above, including both `--base-url` rows** | | | | | ✅ |

**`init` accepts no `--base-url` — verified structurally, not inferred from a passing test.** `apps/mcp-client/src/config-cli.ts:178-220` (`case "init"`) never reads `options["base-url"]`; the flag is documented only under `use` (`:85`, inside the `use <provider>` block of `help()`). Executing `init --base-url http://x.example:7777` and `init --lmstudio --base-url http://x.example:7777` produced the provider defaults on both CLIs — the flag is genuinely absent there, not silently honoured and not silently wrong.

**Installer writers, for completeness of "any installer":** `scripts/lib/installer-api-key.sh:212-213` (lmstudio) / `:221-222` (ollama) write the instruct+coding pair per provider as `${MASSA_AI_LLM_MODEL:-<literal>}` / `${MASSA_AI_LLM_CODE_MODEL:-<literal>}`; `:205-206`/`:217-218` derive the base-URL pair per provider (`LLM_BASE_URL="${OLLAMA_URL:-…}/v1"` for ollama, identical to `EMBEDDING_BASE_URL` for lmstudio). `scripts/setup-local-first.sh:332-341` branches the trio per provider before `installer_write_config`. `install.sh` writes `.env`, is genuinely Ollama-only, and probes **both** models (`:379-392`).

### PDM-05 — The parity gate covers all three roles (3 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — a tracked surface restating a stale instruct/coding default makes the gate fail, **naming surface and the differing value** | named red | **`spec.md:158-161`'s own Independent Test executed verbatim.** `install.sh:379` `local llm_model="qwen3-vl:8b"` → `"qwen2.5:7b-instruct"` ⇒ `install.sh (instruct) match #1: got qwen2.5:7b-instruct, want qwen3-vl:8b` (20 pass / **1 fail**). A **coding** literal in a **second file**, `scripts/lib/installer-api-key.sh:222` → `qwen2.5-coder:3b` ⇒ `installer-api-key.sh installer_provider_defaults (coding) match #2: got qwen2.5-coder:3b, want qwen2.5-coder:7b` (20 / **1**). Both restored by file copy, both green again | ✅ PASS |
| AC-2 — 0 or >1 extractor matches throws with the match count, never a silent pass | throw with count | `scripts/__tests__/embedding-defaults-parity.test.ts:61-82` `extractOne`, `:84-106` `checkStructural`, `:108-123` `checkMultiMatch`; the docblock at `:28-31` states the contract. Exercised live in round 2 by deleting a derived assignment (`got 0 — extractor rotted or surface removed`) | ✅ PASS |
| AC-3 — each checked-surface population count printed on a green run | counts visible without reading source | **14 `[parity]` lines** on the green run: reference pairs 2; pair 5; model-only 3; width-only 1; LM pair 1; LM model-only 2; **derived structural 26**; instruct/coding 8; Markdown 8; embedding completeness 33; instruct/coding completeness 20; width-writer 4 (named); model→width bash 4 / TypeScript 4. **Round 2's N2 (printed 28, distinct 26) is closed** — re-measured as **26 = 26**, and the self-check at `:542-556` throws by name on a reintroduced duplicate (mutation M7, below) | ✅ PASS — N2 closed |

### PDM-03 / PDM-04 — Both providers embed at 1024 (4 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — `ollama` defaults to `qwen3-embedding:0.6b` at 1024 | model+width pair | Seam `inference-providers.ts:94`; `embedding-dimensions.ts` width table (gate compares bash 4 ↔ TypeScript 4 entries); `packages/core/src/services/embeddings/config.ts:246` derives from `INFERENCE_PROVIDERS.ollama.defaultModels.embedding`; `apps/tools-api/src/routes/system.ts:28-34` resolves through the seam (the only `qwen3-embedding:4b` left in that file is `:25`, a docblock naming it **as retired**) | ✅ PASS |
| AC-2 — `lmstudio` defaults to `text-embedding-qwen3-embedding-0.6b` at 1024 | model+width pair | `inference-providers.ts:116,119`; `embeddings/config.ts:411`; `scripts/diagnose.ts:22` reads `text-embedding-qwen3-embedding-0.6b` (round-2 G3 closed) | ✅ PASS |
| AC-3 — a stale fingerprint refuses reads and writes with `EmbeddingIndexStaleError`, naming stored and current | both fingerprints in the message | `packages/core/src/__tests__/embedding-fingerprint.test.ts:181-189` — `new EmbeddingIndexStaleError("proj-1","ollama:a:2560","ollama:b:2560")`, `expect(err.name).toBe("EmbeddingIndexStaleError")` plus the two-fingerprint message assertions | ✅ PASS |
| AC-4 — a reachable LM Studio yields a 1024-length **non-zero** vector from `POST /v1/embeddings` | 1024, non-zero | **Observed live this run.** Port probe by `curl`: `:11434` **200**, `:1234` **200**, `:3333` **unreachable**. `bun test packages/core/src/__tests__/lmstudio-embedding-live.test.ts` → **2 pass / 0 fail, 9 expect()**, log `[lmstudio] Provider ready (model: text-embedding-qwen3-embedding-0.6b, dimensions: 1024)`. The live case (`:79-99`) asserts `vector.length === 1024` **and** `vector.some(v => v !== 0)`, so a zero-filled stub would not satisfy it | ✅ PASS |

### PDM-08 / PDM-09 / PDM-10 / PDM-11 — Runtime parameters per role (5 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — embedding 8192; instruct 16384 @ 0.2; coding 32768 @ 0.0 | exact table | `inference-providers.ts:30-34` `INFERENCE_ROLE_DEFAULTS`, read literally against `spec.md:65-69` — 3/3 rows, 5/5 values match; `packages/shared/src/__tests__/inference-providers.test.ts:93,97-99,104-106` assert each with `toEqual` | ✅ PASS |
| AC-2 — an Ollama chat call sends the role's context as `options.num_ctx` | 16384 instruct / 32768 code | `llm-client.ts:340-352` `_wrapFetchContextWindow` (merges into any existing `options`, does not overwrite), gated at `:362-364` on `spec.appliesContextPerRequest`; role resolution at `:234-237`. Tests: `llm-client.test.ts:946` `expect(parsed.options.num_ctx).toBe(16384)`, `:966` `…toBe(32768)`, `:899` `toEqual({ seed: 1, num_ctx: 32768 })`, `:972` LM Studio attaches no wrapper. **Chat-call-site set enumerated**: `buildProvider` has exactly 3 call sites (`:510`, `:576`, `:593`), each fed by a `getLlmConfig({ modelRole: opts.modelRole })`. The 4th `getLlmConfig()` (`:79`, no role) belongs to `_checkJsonSchemaSupport` and reads only `llm.baseUrl` for a `/api/version` probe — it issues no chat call and calls no `buildProvider`. `lmstudio.appliesContextPerRequest = false` (`:123`), so LM Studio never receives the field | ✅ PASS |
| AC-3 — on LM Studio the installer loads each model with `lms load -c <role context>` | 8192 / 16384 / 32768 | `scripts/setup-local-first.sh:369,370,372` (real commands) and `:376,377,379` (echo fallback). **Round-2's surviving mutant R-M18 is dead and the whole set is sensed**: `scripts/__tests__/embedding-defaults-parity.test.ts:898-926` asserts each role's value against `INFERENCE_ROLE_DEFAULTS[role].contextWindow` (imported at `:37`), **not** a copied literal, at **both** site classes. All **6 sites × 3 roles** mutated one at a time — **6/6 killed by name** (M1–M6) | ✅ **PASS — N5/R-M18 closed** |
| AC-4 — the vector store submits 64 texts per provider call, not 8 | 3 `embedBatch` calls for 130 docs | `postgres-vector-store.ts:72-81` `_resolveEmbedBatchSize`, called at `:453`; `packages/core/src/__tests__/vector-store-factory.test.ts:118-129` — real store, 130 documents, `expect(store.embedBatchCalls).toBe(3)`. **Store set enumerated**: `packages/core/src/data/vector/` holds exactly two files, `base-vector-store.ts` (abstract) and `postgres-vector-store.ts` — there is no second concrete store with an unfixed batch size | ✅ PASS |
| AC-5 — a failed batch embed falls back per document at the larger batch size | fail-open preserved | `postgres-vector-store.ts:461-470` — `try { embeddings = await this.embedBatch(...) } catch { logger.warn("falling back per-document") }` with the per-document loop unchanged below; `packages/core/src/__tests__/postgres-vector-store-extended.test.ts:315` | ✅ PASS |

### PDM-12 / PDM-13 / PDM-14 — Every model setting configurable, config wins (5 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — five fields exist in `config.json` | `llm.contextWindow`, `llm.codeContextWindow`, `llm.codeTemperature`, `embedding.contextWindow`, `embedding.batchSize` | `packages/shared/src/config/massa-ai-config.ts:61,65` (embedding, deliberately optional — `:406` states why), `:148,151,155` (llm, required), defaults `:460-462`; validated in `config-writer.ts:152-155,246-251` (all five, by name, with a message per field) | ✅ PASS |
| AC-2 — a value in `config.json` beats the role-table default, **for every one of those five** | file wins | `embedding.batchSize` → `postgres-vector-store.ts:80` `embeddingConfig?.batchSize ?? spec.embedBatchSize`. `embedding.contextWindow` → `provider.ts:43-47`. `llm.contextWindow` / `codeContextWindow` / `codeTemperature` → `packages/shared/src/config/index.ts:781-788`, sensed through the real `config.get("llm")` in a fresh subprocess by `llm-env-prefix.test.ts:273-284` | ✅ PASS |
| AC-3 — the Portal Config tab renders a field for every one of those keys | in `embedding` / `llm` sections | `apps/web-ui/src/static/views/config-sections.ts:51` (embedding `contextWindow`), `:52` (`batchSize`), `:133` (llm `contextWindow`), `:134` (`codeContextWindow`), `:135` (`codeTemperature`) — 5/5 | ✅ PASS |
| AC-4 — a schema field absent from the Portal section table fails a deterministic gate, naming that field | named red | `apps/tools-api/src/routes/config-section-coverage.test.ts` — "Admin Portal config sections cover every schema field (PDM-14)"; suite green | ✅ PASS |
| AC-5 — a Portal `guide` citing a default model or width cites the current one | current values only | All `guide:` strings re-read independently; the **10** that cite a model or a number are `:47` (`qwen3-embedding:0.6b` / `text-embedding-qwen3-embedding-0.6b`), `:50` (1024), `:51` (8192), `:52` (64), `:127` (`qwen3-vl:8b` / `qwen3-vl-8b-instruct`), `:128` (`qwen2.5-coder:7b` / `qwen2.5-coder-7b-instruct`, and the *correct* fallback direction), `:129` (0.2), `:133` (16384), `:134` (32768), `:135` (0.0). **10/10 match `INFERENCE_PROVIDERS` / `INFERENCE_ROLE_DEFAULTS` live values** | ✅ PASS |

### PDM-06 — Install surfaces pull the same trio (3 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC-1 — `setup-local-first.sh` pulls and writes the selected provider's trio | provider-matched trio | `scripts/setup-local-first.sh:332-341` (branch), `:343-347` (`ensure_inference_model` ×3), write via `installer_write_config`. `scripts/lib/installer-api-key.sh:212-213,221-222` read `${MASSA_AI_LLM_MODEL:-…}` / `${MASSA_AI_LLM_CODE_MODEL:-…}`, so an explicit override survives (round-1 G5) | ✅ PASS |
| AC-2 — `install.sh` probes for the new instruct id | `qwen3-vl:8b` | `install.sh:379` `local llm_model="qwen3-vl:8b"`, `:380` `local llm_code_model="qwen2.5-coder:7b"`, probed at `:382` and `:388` — **both** models, not just the instruct one; `.env` embedding pair at `:419-420` (`qwen3-embedding:0.6b` / `1024`) | ✅ PASS |
| AC-3 — an absent instruct model leaves LLM features disabled, stating the reason | `llm_enabled=false` + reason | `install.sh:381-387` — `llm_enabled=false` by default, set true only inside `if ollama_has_model`, with `info "LLM features off — pull the model to enable: ollama pull ${llm_model}"` on the else branch; the coding model gets its own reason line at `:389`. `scripts/setup-local-first.sh:535-540` gates `installer_feature_flow` on `LLM_MODEL_PRESENT`, provider-dispatched through `inference_model_exists` | ✅ PASS |

**Status**: ✅ **25 of 25 ACs met**, each traced to `file:line` with an assertion expression or an executed measurement.

---

## Round-2 Gap Closure — each re-derived, none accepted as "fixed"

| Round-2 gap | Fix | Independently re-derived this round | Status |
| --- | --- | --- | --- |
| **N1 (Major)** — `_resolveEmbedContextWindow` put `config.json` **over** the env var, contradicting `CLAUDE.md` (`env > config.json > literal defaults`) and `design.md:268` | G1 | **Shipped order is env-first**: `provider.ts:43-47` = `parsePositiveIntEnv(process.env.OLLAMA_EMBEDDING_NUM_CTX, embeddingConfig?.contextWindow ?? INFERENCE_ROLE_DEFAULTS.embedding.contextWindow)`. The docblock `:36-38` now states that order. `embeddings-provider.test.ts:456-487` carries **4** cases covering all three layers, and the inverted one is repointed with an explicit `SPEC_DEVIATION` note rather than edited quietly. `design.md:268` was **not** amended — the code moved to the design, not the reverse. Mutation **M8** re-injects the inversion → killed by name. **Class enumerated, not just the named site** (below) | ✅ **Closed** |
| **N2** — parity gate's printed structural population overstated by 2 | G3 | `CONFIG_TS_DERIVED_SURFACES` lifted out of `CONFIG_CLI_FILES.flatMap(...)` (`:263-276`) and concatenated once; printed count re-measured **26**, distinct labels **26**. Self-check at `:542-556` computes `new Set(DERIVED_SURFACES.map(s => s.label))` **before** checking the rows. Mutation **M7** duplicates the spread → `DERIVED_SURFACES has 28 rows but only 26 distinct labels — duplicated: …(lmstudio, embedding model), …(lmstudio, embedding dims by-key lookup)`. The self-check fires, by name | ✅ **Closed** |
| **N3** — `NEEDLE_MODEL` residual named 1 of its 2 files | G4 | **Both pins repointed**: `benchmarks/needles/run.ts:114` and `scripts/needles-rename-control.ts:118` both read `qwen3-embedding:0.6b`; `run.ts:27`'s usage line agrees; `benchmarks/needles/README.md:63` agrees and `:66-75` now names **both** files. **Searched with three dialects** (`git grep`, ugrep default, `/usr/bin/grep -rEn`), all agreeing: the only `NEEDLE_MODEL` sites outside `.specs/` are those two plus `.github/workflows/needles-gate.yml:106,108` (already `0.6b` / the deliberate `nomic-embed-text` arm) and the README's own retained-for-contrast override example | ✅ **Closed** |
| **N4** — `use ollama --base-url` wrote an LLM base URL missing `/v1` | G2 | Seam-level `deriveInferenceBaseUrls` (`inference-providers.ts:137-156`) derives the suffix from the provider's **own two declared defaults** (`defaultLlmBaseUrl.startsWith(defaultEmbeddingBaseUrl) ? slice(...) : ""`), so ollama gets `/v1` and lmstudio gets `""` with no hardcoding. **Full matrix executed** (`--base-url` supplied and omitted × 2 providers × 2 CLIs, plus `init` inertness): **20/20 cells correct**. Mutation **M9** kills on 3 suites | ✅ **Closed** |
| **N5 / R-M18** — PDM-10 AC-3's `lms load -c` values unsensed | G5 | New sensor at `embedding-defaults-parity.test.ts:898-926`, asserting against `INFERENCE_ROLE_DEFAULTS`. **All 3 roles at all 6 sites** mutated individually — **6/6 killed by name** (M1–M6) | ✅ **Closed** |
| **N6a/b/c** — informational gate-population notes | none needed | Re-measured, unchanged, each member still sensed elsewhere (`massa-ai-config.ts:454-455` by `llm-env-prefix.test.ts`; `setup-local-first.sh`'s third instruct literal by `test-lms-model-exists.sh`; `diagnose.ts` docblocks by its `known`-set membership). No live defect | ℹ️ Unchanged, recorded |
| **G6** — F2/F2b's stale "`system.test.ts` 13 pass / 1 fail" | G6 | **Re-measured by me on HEAD `54298e10`**: `XDG_CONFIG_HOME=$(mktemp -d) bun test apps/tools-api/src/routes/system.test.ts` → **14 pass / 0 fail, 36 expect() calls**. **4** `**Correction (G6, 2026-09-20/21)**` notes exist — `tasks.md` F2 and F2b, `STATE.md` F2 and F2b entries — and **every one carries the commit it was measured on** (`d556c6d9`, confirmed an ancestor of HEAD by `git merge-base --is-ancestor`). Originals kept, corrections appended | ✅ **Closed** |

**6 of 6 closed. Round 2's one surviving mutant is dead.**

### N1's class, enumerated rather than spot-fixed

Round 2's finding was that F2b fixed the one site the previous verifier named without enumerating the class. I enumerated it, and verified the "no env var exists" half by searching rather than assuming.

| PDM-12 field | Env knob | Resolver | Order | Inversion possible? |
| --- | --- | --- | --- | --- |
| `embedding.contextWindow` | `OLLAMA_EMBEDDING_NUM_CTX` (`.env.example:211`) | `provider.ts:43-47` | **env → config → role default** | ✅ correct |
| `embedding.batchSize` | **none** | `postgres-vector-store.ts:80` | config → seam | n/a |
| `llm.contextWindow` | **none** | `shared/config/index.ts:781` | file → role default | n/a |
| `llm.codeContextWindow` | **none** | `shared/config/index.ts:783` | file → role default | n/a |
| `llm.codeTemperature` | `MASSA_AI_LLM_CODE_TEMPERATURE` | `shared/config/index.ts:785-788` | `envNum(ENV, file ?? default)` = **env → config → default** | ✅ correct |

**The "no env var" claim is a searched result, not an absence of evidence**: `git grep -nE "MASSA_AI_LLM_(CONTEXT_WINDOW|CODE_CONTEXT_WINDOW)|MASSA_AI_EMBEDDING_(CONTEXT_WINDOW|BATCH_SIZE)"` over `packages apps scripts .env.example turbo.json` returns **zero** hits, and `turbo.json:45-55` lists exactly 11 `MASSA_AI_LLM_*` names, none of them a context-window knob.

**Sibling sweep re-derived**: every resolution site in `packages/core/src/services/embeddings/config.ts` was listed (`:142, 213, 218, 229, 233, 246, 275, 287, 291, 302, 316, 332, 358, 380, 411, 415, 417-418, 427-428, 448, 452, 468`). Every one that has both an env read and a file read puts **`process.env.X` first** (`:142, 213, 218, 246, 275, 287, 411, 415, 417, 427, 448, 452` — 12 sites). The handful of `file?.X ?? N` sites (`:219, 292, 453`) have no env layer at all, so no order exists to invert. This feature changed exactly **2 lines** in that file (`:246`, `:411`), both preserving `process.env.X || file?.model || <seam>`. The other resolver this feature introduced, `llm-client.ts:_resolveLlmConfig` (`:200-249`), receives `config.get("llm")` — already env-resolved upstream by `envString`/`envNum` — so its `cfg?.X ??` fallbacks sit *below* env by construction. **No second inverted resolver exists in this diff.**

---

## Discrimination Sensor

Strict isolation throughout: `cp f f.bak` → mutate → run → `cp f.bak f` → `rm f.bak`. Every mutation `diff`-checked against its backup before the gate ran; a no-op would have aborted rather than reported a verdict. `git status --porcelain` measured `[]` after every restore and at end of run. **No `git checkout`, `restore`, `stash`, `reset`, or `clean` at any point.**

### Population A — round-2's open items and the G-fixes' own assertions

| # | File:line | Mutation | Gate | Result |
| --- | --- | --- | --- | --- |
| **M1** | `scripts/setup-local-first.sh:370` | `load -c 16384 … "$LLM_MODEL"` → `-c 4096` (**round 2's surviving R-M18, verbatim**) | parity | ✅ **Killed** — `the real "$LMSTUDIO_CLI" load command for the instruct role matches INFERENCE_ROLE_DEFAULTS.instruct.contextWindow`, `Expected: 16384 / Received: 4096` (20/1) |
| M2 | `:369` | `-c 8192 … "$EMBEDDING_MODEL"` → `-c 2048` | parity | ✅ Killed — `…for the embedding role…` (20/1) |
| M3 | `:372` | `-c 32768 … "$CODE_MODEL"` → `-c 1024` | parity | ✅ Killed — `…for the coding role…` (20/1) |
| M4 | `:376` | echo fallback `-c 8192 … ${EMBEDDING_MODEL}` → `-c 2048` | parity | ✅ Killed — `the echo fallback for the embedding role…` (20/1) |
| M5 | `:377` | echo fallback `-c 16384 … ${LLM_MODEL}` → `-c 4096` | parity | ✅ Killed — `…echo fallback for the instruct role…` (20/1) |
| M6 | `:379` | echo fallback `-c 32768 … ${CODE_MODEL}` → `-c 1024` | parity | ✅ Killed — `…echo fallback for the coding role…` (20/1) |
| M7 | `embedding-defaults-parity.test.ts:279` | `...CONFIG_TS_DERIVED_SURFACES` spread a second time (reproduces the once-per-CLI duplication shape) | parity | ✅ Killed — `DERIVED_SURFACES has 28 rows but only 26 distinct labels — duplicated: …` naming both labels (20/1) |
| M8 | `packages/core/src/services/embeddings/provider.ts:43-47` | reorder to `embeddingConfig?.contextWindow ?? parsePositiveIntEnv(...)` (**round-2 N1's exact defect**) | `embeddings-provider.test.ts` | ✅ Killed — `an explicit env override wins over a config value` (40/1) |
| M9 | `packages/shared/src/config/inference-providers.ts:149-151` | `const suffix = ""` (drops the `/v1` derivation — **round-2 N4's defect**) | shared seam + both CLI suites | ✅ Killed ×3 — `deriveInferenceBaseUrls (G2) > an explicit --base-url re-applies ollama's declared /v1 suffix to the LLM URL` (28/1); `use ollama --base-url writes an ollama-shaped embedding/llm base pair (G2)` on mcp-client (37/1) **and** opencode-plugin (33/1) |

> **M9's first run was an invalid measurement and is reported as such.** The CLIs import `@massa-ai/shared/inference-providers`, which resolves to `packages/shared/dist/`. Mutating `src/` alone left the stale build in place and both CLI suites read green (38/0, 34/0) — a **false survivor**. Re-run with `cd packages/shared && bun run build` between the mutation and the gate, it kills on all three suites; `dist/` was rebuilt again after restore. This is a property of my measurement, not of the branch: turbo's `test` task depends topologically on `build`, so the shipped pipeline is not blind here.

### Population B — the spec's own Independent Test for PDM-05 (`spec.md:158-161`)

| # | File:line | Mutation | Result |
| --- | --- | --- | --- |
| M13 | `install.sh:379` | `local llm_model="qwen3-vl:8b"` → `"qwen2.5:7b-instruct"` | ✅ Killed — `install.sh (instruct) match #1: got qwen2.5:7b-instruct, want qwen3-vl:8b` (20/1) |
| M14 | `scripts/lib/installer-api-key.sh:222` | ollama coding literal → `qwen2.5-coder:3b` (**a coding literal in a second file**, as the spec's test requires) | ✅ Killed — `installer-api-key.sh installer_provider_defaults (coding) match #2: got qwen2.5-coder:3b, want qwen2.5-coder:7b` (20/1) |

### Population C — the set/subset hunt (new blind-spot probes)

| # | File:line | Mutation | Gate population run against | Result |
| --- | --- | --- | --- | --- |
| **M10** | `FEATURES.md:1231` | config-reference table row `\| llm.model \| MASSA_AI_LLM_MODEL \| qwen3-vl:8b \|` → `qwen2.5:7b-instruct` | parity gate (21 tests) **and the full bun half of `test:scripts`** (**2064 tests across 89 files**) | ❌ **Survived** — 21/0 and 2064/0 |
| **M11** | `.env.example:283` | comment `# … Default qwen3-vl:8b (non-thinking instruct).` → `qwen2.5:7b-instruct` | same two populations | ❌ **Survived** — 21/0 and 2064/0 |
| M12 | `scripts/needles-rename-control.ts:118` | `NEEDLE_MODEL ?? "qwen3-embedding:0.6b"` → `"qwen3-embedding:4b"` | parity gate | ❌ **Survived** — 21/0. **Declared**: G4's own result note states no unit sensor exists for this pair because `NEEDLE_MODEL` is outside every parity tier. Confirmed rather than discovered |

**Sensor result: 14 injected, 11 killed, 3 survived.**

---

## The set/subset hunt — the matrices I walked

This feature's dominant defect class (a requirement names a set; the work covers a subset) produced five instances across rounds 1–2, twice from task text. I walked every set `spec.md` names, **including cells that were already correct**, and applied the same test to the fix tasks G1–G6.

| Set named by the spec | Members | Every member checked? |
| --- | --- | --- |
| The trio table (`spec.md:53-57`) | 2 providers × 3 roles = **6** | ✅ 6/6 read literally against `inference-providers.ts:93-97,118-122` |
| Runtime parameters (`spec.md:65-69`) | 3 roles × {contextWindow, temperature, batch} = **5 declared values** | ✅ 5/5 against `INFERENCE_ROLE_DEFAULTS` + `embedBatchSize: 64` on **both** providers (`:99`, `:124`) |
| PDM-12's five config fields | **5** | ✅ 5/5 present in schema, `config-writer` validation, Portal sections, and a reader; precedence table above |
| PDM-02 AC-2's writers | mcp-client CLI, opencode CLI, `installer-api-key.sh`, `setup-local-first.sh`, `massa-ai-config.ts` template, `install.sh` (`.env`) = **6** | ✅ all 6 located and read; 20-cell live matrix over the two CLIs |
| PDM-09's chat call sites | `buildProvider` ×3, + 1 non-chat `getLlmConfig()` probe | ✅ 4/4 enumerated; the probe correctly excluded (reads only `baseUrl`) |
| PDM-11's vector stores | `packages/core/src/data/vector/` = **2 files, 1 concrete** | ✅ 1/1 |
| PDM-10 AC-3's `lms load -c` | 3 roles × 2 site classes (real command, echo fallback) = **6** | ✅ 6/6 sensed and 6/6 mutation-killed |
| PDM-06's probed models | instruct + coding in `install.sh` | ✅ 2/2 probed, each with its own reason line |
| `deriveInferenceBaseUrls` cells | 2 providers × {flag, no flag} × 2 CLIs + `init` inertness = **20** | ✅ 20/20 executed |
| N1's precedence class | 5 config fields + ~12 sibling env/file resolvers in `embeddings/config.ts` + `_resolveLlmConfig` | ✅ all enumerated; no second inversion |
| `NEEDLE_MODEL` pins | **2** code sites + 1 workflow + 1 README | ✅ all 4, three grep dialects |
| Fix tasks G1–G6, each as "did it name a subset of what its finding required?" | 6 | G1 ✅ class enumerated · G2 ✅ seam-level, both providers, both CLIs, `init` checked · G3 ✅ only one array constructs rows inside a loop; verified the other `.flatMap` (`INSTRUCT_CODING_SURFACES.flatMap(checkMultiMatch)`) maps rows to violation strings and adds no rows · G4 ✅ both pins · G5 ✅ 6 sites not 3 · G6 ✅ 4 correction sites, all carrying the commit |

### The sixth instance, and why it does not fail this round — **Recorded residual, not a gap**

**Finding (measured, M10 + M11).** The parity gate's Markdown tier (`embedding-defaults-parity.test.ts:428-447, 569-588`) is a **completeness scan only**: it asserts that no *unlisted* tracked `.md` mentions a model default, and never checks the **values** inside the 7 listed docs. Independently, `.env.example` has a gate row for instruct (`^MASSA_AI_LLM_MODEL=(\S+)$`, `:380-384`) while the same file restates the instruct default in **4** further prose lines (`:273, 276, 283, 364`) and the coding default in 2 (`:274, 286`), none of them gated. Mutating `FEATURES.md:1231` (a config-reference table stating `llm.model`'s default) and `.env.example:283` to the retired `qwen2.5:7b-instruct` left the parity gate at **21/0** and the entire bun half of `test:scripts` at **2064/0**.

**Why this is a residual and not an AC-1 failure.** PDM-05's User Story states the comparator explicitly: *"fail by name on any surface carrying a stale instruct or coding default, **exactly as it already does for embedding**."* The Markdown tier is membership-only for **embedding** too, and `.env.example`'s commented embedding alternative (`:200`, naming `qwen3-embedding:4b`) is likewise unchecked for value. **Instruct/coding coverage is exactly at parity with embedding coverage** — which is what AC-1 asks for — and the tier's scope is declared in its own docblock (`:424-431`), with a stated reason (widening the file filter would sweep in `.specs/` history, design R-06). Every value in those surfaces is **currently correct**: `FEATURES.md:920-921,1231-1232,1303-1304,1330-1331`, `.env.example:273-287,364`, `docs/CHEATSHEET.md:169-170,513-517`, `docs/ONBOARDING.md:36`, `apps/tools-api/OLLAMA_WSL_SETUP.md:55,90`, `README.md:728-744` all read the shipped trio. No shipped behaviour is wrong.

**What it costs, stated plainly:** the next model swap can still leave a stale value in Markdown prose or in an `.env.example` comment and ship green. That is the class the feature exists to close, closed for *assignments* and left open for *prose*. **Follow-up, not a blocker**: a value tier over the 7 known `.md` files and the comment lines in `.env.example`, keyed on the same `INFERENCE_PROVIDERS` / `INFERENCE_ROLE_DEFAULTS` imports the rest of the gate already uses. A future reader who disagrees with the comparator reasoning above has the mutation evidence to overturn this judgement.

---

## Edge Cases

- [x] A `config.json` already naming a model keeps it (A-05) — verified through the production reader in a fresh subprocess (`llm-env-prefix.test.ts:273-284`) and by the 20-cell CLI matrix.
- [x] The LM Studio MLX build's `/v1/embeddings` failure is surfaced unchanged (A-01) — no product code claims otherwise.
- [x] 2560 → 1024 flips `postgres-vector-store.ts` to the `≤ 2000` direct-HNSW-cosine branch — stated as a **retrieval algorithm change** in `CHANGELOG.md:11-23` and `README.md:728-744`, not merely a size change.
- [x] The needles floors are explicit `null` with a calibration note (`14.needles.test.ts:79-110`), never the 2560-derived numbers. A **deliberate gate weakening**, declared as such in the spec, the file, the CHANGELOG and `benchmarks/needles/README.md`; offset by the unconditional `anyHits` and determinism assertions, and by an unknown-arm guard that still throws for an id absent from the table.
- [x] `qwen3-embedding:0.6b` already at 1024 in `KNOWN_EMBEDDING_DIMENSIONS` — the gate's bash ↔ TypeScript comparison is green at 4 entries each side.

---

## Skipped Checks (with reasons)

| Check | Reason |
| --- | --- |
| `packages/core/src/__tests__/e2e/14.needles.test.ts` | **Genuinely unobservable, re-measured this run.** Port probe by `curl`: `:3333` **unreachable**, `:11434` **200**, `:1234` **200**. The file gates on `READY = AVAIL.API_UP && AVAIL.INFERENCE_UP` (`:69`), so an API-down host skips regardless of the providers. `XDG_CONFIG_HOME=$(mktemp -d) RUN_E2E=1 bun test …` → **0 pass / 2 skip / 0 fail**. Recorded as a **skipped sensor**, never as a pass. T14's claims about this file remain statically verified only — unobservable in all three rounds. |
| Retrieval quality at 1024 dimensions | **Out of scope by the user's explicit choice (A-03) — an accepted risk, not a closed question.** Re-confirmed that no artifact softens it: `spec.md:94` flags *"this **weakens a gate**. Re-calibration is the follow-up"*; `CHANGELOG.md:21-23` says *"**has not been re-measured** … ships as an accepted, unmeasured risk rather than a validated improvement"*; `README.md:742-744` repeats it verbatim; `14.needles.test.ts:79-110` explains the `null` at length. **No hedging found in any of the four.** |
| `bun run test:integration`, `test:coverage`, `bench:needles:gate` | Not in this feature's Gate Check Commands; `needles-gate.yml` is `workflow_dispatch`-only and `continue-on-error`. |
| Running the 3 failing shell suites against `main` | Not run: the subject-exclusion + shared-file + assertion-content argument above is conclusive on this branch's own evidence, and the two host tells (`got='claude …'` from a real `~/.claude`; a missing `claude plugin marketplace` CLI) are properties of the machine. Running the plugin installers additionally risks writing to the developer's real `~/.claude`. |

---

## Code Quality

| Check | Pass? |
| --- | --- |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ — `deriveInferenceBaseUrls` has two real call sites per CLI × two CLIs; `scripts/run-shell-suites.sh` replaces an inline loop that could not satisfy F6 |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ for both fix passes |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns/style | ✅ — **N1 resolved**: `_resolveEmbedContextWindow` is now env-first like all 12 of its env+file siblings |
| Would a senior engineer approve? | ✅ |
| Tests map to ACs and are non-shallow | ✅ — every G-pass sensor demonstrated failing on its own subject (M1–M9) |
| Spec-anchored outcome check | ✅ — 25/25; 1 recorded residual (Markdown/prose value coverage), not an AC shortfall on AC-1's own comparator |
| Per-layer coverage expectation met | ✅ |
| Every test maps to a spec requirement | ✅ |
| Validation assets not weakened | ⚠️ — `14.needles.test.ts` floors nulled. Deliberate, declared (A-03), argued from measurement, offset by unconditional assertions. A knowingly-weakened gate awaiting recalibration, not a silent relaxation. **Otherwise**: G1 inverted two assertion values, and the change is marked `SPEC_DEVIATION` in the test source with its reason — sanctioned, not quiet. |
| Documented guidelines followed | ✅ — `env > config.json > literal defaults` now holds at every resolver this feature touched |

**Process notes (not defects in delivered code).** F2's resolution text still records using `git stash` to baseline a failure, which `spec.md:327` forbids for this feature's verification; the tree is clean and no evidence depends on it, so it stays recorded rather than escalated. Round 2's "28/28 ACs" and "2058 pass" figures are corrected above.

---

## Interactive UAT

**Not applicable** — the change is configuration defaults, a seam, installers, and a gate. The one user-facing surface (Admin Portal Config tab) is covered by the field-level gate (PDM-14 AC-4), by `render-golden.test.ts`, and by the 10-of-10 guide-string re-read under PDM-13 AC-5.

---

## Requirement Traceability

| Requirement | Round 1 | Round 2 | Round 3 |
| --- | --- | --- | --- |
| PDM-01 | ✅ | ✅ | ✅ Verified |
| PDM-02 | ❌ AC-2 | ✅ | ✅ Verified — 20/20 cells |
| PDM-03 | ⚠️ G2 | ✅ | ✅ Verified |
| PDM-04 | ⚠️ G3 | ✅ | ✅ Verified — live 1024 observed |
| PDM-05 | ⚠️ G1 | ✅ (⚠️ N2) | ✅ Verified — N2 closed, spec's Independent Test executed |
| PDM-06 | ⚠️ G5 | ✅ | ✅ Verified |
| PDM-07 | ✅ | ✅ | ✅ Verified |
| PDM-08 | ✅ | ✅ | ✅ Verified |
| PDM-09 | ✅ | ✅ | ✅ Verified — call-site set enumerated |
| PDM-10 | ⚠️ spec-precision | ⚠️ **open** (R-M18) | ✅ **Verified** — 6/6 sites killed by name |
| PDM-11 | ✅ | ✅ | ✅ Verified |
| PDM-12 | ⚠️ 3 mutants | ⚠️ **N1** | ✅ **Verified** — precedence class enumerated |
| PDM-13 | ✅ | ✅ | ✅ Verified |
| PDM-14 | ✅ | ✅ | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready
**Result**: **PASS** (round 3 of max 3 — final)

**Spec-anchored check**: **25/25 ACs met** (round 2's "28" is an overcount; see *Arithmetic corrections*), each traced to `file:line` + assertion expression or an executed measurement. **0 AC shortfalls. 1 recorded residual** (Markdown/prose value coverage — measured, declared, at parity with the embedding coverage AC-1 calibrates against).
**Round-2 gaps**: **6 of 6 closed** (N1/G1, N2/G3, N3/G4, N4/G2, N5/G5, G6), each re-derived by re-injecting the original defect rather than by reading a report.
**Sensor**: **14 injected, 11 killed, 3 survived.** Survivors: M10 (`FEATURES.md` config-reference row) and M11 (`.env.example:283` comment) against a **2085-test** combined population (parity 21 + `test:scripts` bun half 2064), and M12 (`needles-rename-control.ts`), which G4's own result note already declares unsensed. All three are documentation-prose values that are **currently correct**.
**Gate**: lint 0 · type-check 0 (forced) · build 0 (forced) · test 0 **both under a scratch and the real config** (12/12 tasks, 0 `(fail)` lines) · test:plugins 0 (142/0, 937 expect(), 10 files) · parity 0 (21/0, 41 expect(), 14 population lines) · check_specs_delivered 0 (7 paths) · **test:scripts 1** — bun half 2064/0 across 89 files, shell half 39/39 suites ran with 3 failing (22 cases, all agent-tool/host-detection/Claude-marketplace, subjects absent from the 67-file diff).
**Environmental failure**: `embedded-api-client-endpoints.test.ts` **did not reproduce** in either configuration; standalone it is 122/0 in 8.95 s, and `git diff --stat fd56bfe1..HEAD -- packages/ apps/` is empty. Environmental, not a regression.

**What changed between round 2 and round 3.** Round 2 failed on one Major defect and one carried gap. Both are gone and both were re-derived, not accepted: `_resolveEmbedContextWindow` now resolves env-first with the inverted assertion repointed under an explicit `SPEC_DEVIATION` note, and the precedence **class** was enumerated across all five PDM-12 fields plus twelve sibling resolvers rather than spot-fixed; the `lms load -c` values gained a sensor that reads `INFERENCE_ROLE_DEFAULTS` directly and kills at **all six** sites, not the three the finding named. The three Minor items closed with them: the printed population is 26 = 26 with a self-check that names a reintroduced duplicate, both `NEEDLE_MODEL` pins are repointed, and `--base-url` derives a correct pair for both providers from the seam's own declarations across a 20-cell matrix.

**What I looked for and did not find.** A sixth instance of the set/subset class in delivered behaviour. The one I found is in **gate coverage of documentation prose**, where every current value is correct, the tier's scope is declared in its own source, and instruct/coding coverage sits exactly at parity with the embedding coverage PDM-05 AC-1 names as its comparator. I record it as a follow-up with its mutation evidence rather than as a gap, and I state the reasoning so it can be overturned on that evidence.

**What this verdict licenses.** `.specs/project/FEATURES.json` currently reads `status: "in_progress"`, `completed: null`, `validation` → this file. **This run supports moving it to `status: "complete"` with a `completed` date**, carrying two things forward into its residuals: (1) **accepted, not closed** — retrieval quality at 1024 dimensions is unmeasured by the user's explicit choice (A-03), and the `14.needles.test.ts` floors are a knowingly-weakened gate awaiting recalibration; (2) the Markdown/`.env.example`-comment value-coverage residual above, with M10/M11 as its evidence. The three host-specific shell-suite failures and the `lessons.ts list` hazard remain as previously recorded environment residuals.
