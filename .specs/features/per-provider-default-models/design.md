# Per-Provider Default Models — Design

## Design Summary

> **Revised after the pre-mortem gate.** The first draft rested on a premise the codebase
> falsifies and on a write path that makes seam defaults unreachable. Both are corrected below;
> the superseded version is recorded in "Rejected first draft" at the end of this section so the
> reasoning is not lost.

Two tables plus a **write-path fix**, all on the existing seam.

### What varies by provider, and what does not

The first draft claimed "the model id varies by provider; the runtime parameters do not." The
file being extended falsifies that: `inference-providers.ts:34,35,47` already carries three
per-provider **behaviour** flags (`supportsOllamaVersionProbe`, `injectsDisableThink`,
`requiresChatCompletionsApi`). And the spec's own A-07 records that context length is applied by
a *different mechanism* per provider.

The correct split is **value vs mechanism**:

```ts
// provider-independent — the VALUES the user requires to be equal
export const INFERENCE_ROLE_DEFAULTS = {
  embedding: { contextWindow: 8192 },
  instruct:  { contextWindow: 16384, temperature: 0.2 },
  coding:    { contextWindow: 32768, temperature: 0.0 },
} as const;

// provider-specific — model ids AND the mechanism/​capacity facts, beside the
// three behaviour flags the spec already carries
InferenceProviderSpec {
  ...existing three flags...
  readonly defaultModels: Readonly<Record<InferenceRole, string>>;
  readonly appliesContextPerRequest: boolean;  // ollama true, lmstudio false (load-time)
  readonly embedBatchSize: number;             // measured per provider, see R-03
}
```

`defaultModels` is a **total** `Record<InferenceRole, string>`, so a provider id that omits a role
fails type-check (PDM-01 AC-4) with no runtime guard.

Batch size moves out of `INFERENCE_ROLE_DEFAULTS` because the measurement says it is not a
provider-independent fact: the same 64-text batch took **2.6 s on LM Studio and 21.6 s on Ollama**.
Keeping one number would have been the convention-not-contract failure that Approach B was
rejected for — committed by the draft that rejected it.

### The write path is the feature

The draft asserted "everything downstream derives from these two tables." It does not. Every
install path **serializes** models into `config.json`, and precedence is env > file > default — so
a file value written once beats the seam forever. Measured on `8ea21839`:

```
$ massa-ai-config init --lmstudio
  "baseUrl":   "http://localhost:1234/v1"     ← LM Studio
  "model":     "qwen2.5:7b-instruct"          ← Ollama tag
  "codeModel": "qwen2.5-coder:7b"             ← Ollama tag
```

`apps/mcp-client/src/config-cli.ts:200-212` and `:283-294` set `config.llm.baseUrl` from the seam
and then save, **never touching `llm.model`/`llm.codeModel`**;
`apps/opencode-plugin/src/config-cli.ts` is a second copy of the same branches. This is a live
defect today, not a consequence of this feature — and it means the feature's deliverable is the
**writers**, with the seam defaults as the source they write from.

### Rejected first draft

`batchSize` on the role table (falsified by the 2.6 s / 21.6 s measurement); context mechanism
implemented as a convention split across `llm-client.ts` and `setup-local-first.sh` (same failure
class as Approach B); and an acceptance criterion scoped to "when nothing is configured", which is
a state no user who ran an installer is ever in.

---

## Current codebase evidence

Files and symbols inspected in this session, with what each established:

| File | Evidence |
| --- | --- |
| `packages/shared/src/config/inference-providers.ts` | The seam. Carries `defaultEmbeddingBaseUrl`, `defaultLlmBaseUrl`, `envNames`, `knownDimensions`, three behavior flags, `parseModelList`. **No model field of any kind.** |
| `packages/shared/src/config/index.ts:30,37` | `DEFAULT_LLM_MODEL = "qwen2.5:7b-instruct"`, `DEFAULT_LLM_CODE_MODEL = "qwen2.5-coder:7b"` — global constants, no provider dimension. Consumed at `:724-727`. |
| `packages/shared/src/config/index.ts:729-731` | `temperature` resolved once, default `0.2`, for every role. |
| `packages/core/src/services/memory/llm-client.ts:193-194` | Role dispatch exists (`codeModel ?? model ?? DEFAULT_LLM_MODEL`) but resolves to the global constant. |
| `packages/core/src/services/memory/llm-client.ts:199,429,497,513` | Four call sites, all passing the single `llm.temperature`. |
| `packages/core/src/services/embeddings/provider.ts:37,447,600` | `OLLAMA_EMBED_NUM_CTX` (default 8192) sent as `options.num_ctx`. **Ollama embed only** — no chat equivalent, no LM Studio equivalent. |
| `packages/core/src/data/vector/postgres-vector-store.ts:421` | `EMBED_SUB_BATCH_SIZE = 8`, with the bge-m3 crash comment. Per-document fail-open at `:432-438`. |
| `packages/shared/src/config/embedding-dimensions.ts:40` | `"qwen3-embedding:0.6b": 1024` **already present** — no width-table edit needed for Ollama. |
| `scripts/__tests__/embedding-defaults-parity.test.ts` | 19 surface entries across 12 distinct files; three tiers (pair / model-only / dims-only) doubled per provider, plus a Tier-3 completeness scan. Embedding only. |
| `packages/core/src/__tests__/e2e/14.needles.test.ts:79-91` | `FLOORS.ollama` documented as calibrated at 2560 on the binary-quantization branch. |
| `packages/core/src/data/vector/postgres-vector-store.ts:233,267` | The `> 2000` branch. 2560 → binary quantization; 1024 → direct HNSW cosine. |

Live measurements taken this session (host: this machine, Ollama :11434, LM Studio :1234):

| Measurement | Result |
| --- | --- |
| MLX `Qwen3-Embedding-0.6B-4bit-DWQ` on `/v1/embeddings` | `"No models loaded"` — typed LLM, not embedding |
| GGUF `text-embedding-qwen3-embedding-0.6b` on `/v1/embeddings` | 1024 dims, non-zero |
| LM Studio batch of 64 | 64/64 vectors, 2.6 s |
| Ollama batch of 64 (`qwen3-embedding:4b`) | 64/64 vectors, 21.6 s |
| `lms load --help` | `-c, --context-length` is load-time; no API equivalent |

---

## Proposed structure and ownership

| Concern | Owner | Change |
| --- | --- | --- |
| Role value contract | `inference-providers.ts` → `INFERENCE_ROLE_DEFAULTS` | new |
| Per-provider model ids | `inference-providers.ts` → `InferenceProviderSpec.defaultModels` | new field, total record |
| Per-provider mechanism | `inference-providers.ts` → `appliesContextPerRequest`, `embedBatchSize` | new fields, beside the 3 existing behaviour flags |
| **Config writers (the defect)** | `apps/mcp-client/src/config-cli.ts`, `apps/opencode-plugin/src/config-cli.ts` | write `llm.model`/`llm.codeModel` from `defaultModels[provider]` in both the `init --<provider>` and `use <provider>` branches |
| Shipped config template | `massa-ai-config.ts:426-436` | `defaultMassaAiConfig.llm` derives from the ollama seam entry instead of literals |
| Wizard config template | `scripts/lib/installer-api-key.sh:331` | same, via the wizard's provider branch |
| Instruct/coding default resolution | `config/index.ts:30,37,724-727` | `DEFAULT_LLM_MODEL`/`DEFAULT_LLM_CODE_MODEL` become provider-derived |
| Coding-model fallback | `llm-client.ts:193` | code role falls back to `defaultModels.coding`, **not** to the instruct model (which is now vision-language) |
| `getLlmConfig` second defaults layer | `llm-client.ts:192-202` | reads the seam; drops **four** Ollama-shaped fallbacks, not three: `?? "http://localhost:11434/v1"` (`:199`), `?? "ollama"` (`:200`), `?? 0.2` (`:202`), and `disableThink: cfg?.disableThink ?? true` (`:206`) — that last one hardcodes `true` for every provider while the seam already carries `injectsDisableThink` per provider (`lmstudio: false`). The block contradicts the seam it sits beside. |
| Coding temperature | `config/index.ts`, `massa-ai-config.ts`, `config-writer.ts:232-235` | new `llm.codeTemperature`, mirroring `model`/`codeModel` |
| New env knob wiring | `turbo.json`, `llm-env-passthrough.test.ts`, `llm-env-prefix.test.ts` | the 11th `MASSA_AI_LLM_*` knob is four coordinated files, not one |
| Chat context window | `llm-client.ts` | send role `num_ctx` **where `appliesContextPerRequest`** |
| Embed batch size | `postgres-vector-store.ts:421` | reads `spec.embedBatchSize` |
| LM Studio load-time context | `scripts/setup-local-first.sh` | `lms load -c <role context>` per model |
| Parity gate | `embedding-defaults-parity.test.ts` | re-anchor the LM Studio reference (see below); add instruct/coding tiers with per-row `expectedMatches` |
| **Admin Portal config surface** | `config-sections.ts` `embedding` (`:43-52`, 5 fields) and `llm` (`:119-132`, 9 fields) | `embedding` gains `contextWindow` + `batchSize` → 7; `llm` gains `codeTemperature`, `contextWindow`, `codeContextWindow` → 12. Both sections' `guide` strings cite the retired defaults (`qwen3-embedding:4b`, `2560`, `qwen2.5:7b-instruct`) and must be updated. |
| Web UI snapshots | `fixtures/render-golden.json`, `config-forms.test.ts`, `fixtures/config-get.json` | the golden snapshot embeds the rendered field list as literal HTML; regenerate with `MASSA_AI_WRITE_GOLDEN=1` and log it in the test header's "Deliberate regenerations" |
| **Field-level portal parity gate** | new | `config-section-coverage.test.ts` extracts only `key:` (section names), never `name:` (fields) — a schema field absent from the portal passes silently today. The review requirement ("config file and Portal must reflect the same information") needs a field-level gate; it does not exist and is part of this feature. |
| Needles CI workflow | `.github/workflows/needles-gate.yml:88-108` | three `qwen3-embedding:4b` pins **plus the cache key** |

### Must NOT change

`benchmarks/llm-judge/fixtures/known-dup.json`, `known-distinct.json`, and
`benchmarks/llm-judge/run.ts:171` carry `qwen2.5:7b-instruct` inside **memory content describing a
past decision** ("Swapped the default LLM to … because the thinking model degraded structured
calls"). They are historical fixtures for the judge benchmark, not defaults. A literal sweep
would corrupt the benchmark's semantics. `CHANGELOG.md` is likewise append-only history.
`benchmarks/llm-judge/reports/llm-judge-baseline.md` is the same class: a dated run report
(`Ran at: 2026-07-12T15:47:09.981Z`) recording the instruct/coder models in effect at that run,
not a current-default declaration — added to T16's Execute-time doc scope as the same exclusion,
found by T13's Markdown tier.

### Parity-gate re-anchoring (the riskiest single item)

`referencePairLmStudio()` extracts the reference with
`/knownDimensions:\s*\{\s*"([^"]+)":\s*\d+/g`, anchored on the **opening brace**, and its
load-bearing comment (`:96-100`) argues uniqueness from the object literal being the only one in
the file. That argument is about the literal, not about entry count: with two entries the regex
still matches exactly once and silently returns **entry #1**. Since `knownDimensions` must be
**additive** (dropping nomic would write a wrong width for existing users — both CLIs resolve
`knownDimensions[model] ?? 768`), this feature is precisely what makes the table multi-entry.

Fix: anchor the reference on `defaultModels.embedding` inside the `lmstudio` spec and look its
width up **by key**, never by position.

**Layering.** `inference-providers.ts` lives in `packages/shared` and imports only
`embedding-dimensions.ts` — both zero-I/O, which `apps/web-ui` depends on (it value-imports the
subpath and must never reach `config/index.ts`, whose module-scope `loadConfigSafe()` breaks in a
browser). Adding two literal tables preserves that constraint; **no new import is introduced**.

---

## Interface, migration and compatibility decisions

### Temperature: a new field, not a repurposed one

`llm.temperature` today means "the temperature for everything". Making it mean "the instruct
temperature" and introducing coding=0.0 as a *default* would be defeated by any existing config
that sets it — including the author's own, which carries an explicit `"temperature": 0.2`. File
value beats default, so coding would silently stay at 0.2.

Decision: add `llm.codeTemperature` (default 0.0) beside `llm.temperature` (default 0.2). This is
the exact shape `model`/`codeModel` already uses, so it needs no new mental model, and an existing
config keeps working with its instruct temperature intact.

### Breaking change: the index

Moving the Ollama embedding default from `qwen3-embedding:4b`/2560 to `qwen3-embedding:0.6b`/1024
changes `embedding_fingerprint` for every workspace on the default. The read gate and write gate
already fail closed with `EmbeddingIndexStaleError` naming both fingerprints, so the behavior is
**a loud, actionable failure, not corruption**. No migration is built (out of scope); the
CHANGELOG entry states the required reindex.

The width change also flips `postgres-vector-store.ts` from the two-phase binary-quantization
branch to direct HNSW cosine. That is an algorithm change, and its retrieval quality at 1024 is
**unmeasured** (spec A-03).

### The needles floors

`FLOORS.ollama` is documented as measured at 2560 on the binary-quantization path. At 1024 it
describes a different model on a different algorithm. Asserting it would be a false claim; the
file already supports a deliberate `null` meaning "recorded, awaiting calibration". Both rows
become `null` with a note naming this feature and the commit that invalidated the calibration.

**This weakens a gate and is recorded as Risk R-01, not as a neutral edit.**

---

## Approach tradeoffs

| # | Approach | Verdict |
| --- | --- | --- |
| **A (recommended)** | Two tables: provider-independent role parameters + per-provider model ids, both on the existing seam. | **Chosen.** Makes "equal across providers" a type-level fact. One import-free addition to a module `web-ui` depends on. Smallest surface that closes both halves of the defect. |
| B | One per-provider table holding model **and** parameters. | Rejected. Duplicates the identical 8192/16384/32768/0.2/0.0 values per provider, so a future edit can make them diverge with nothing failing. That is the exact failure class this feature exists to remove. |
| C | Leave the seam alone; sweep the literals by hand and extend the parity gate only. | Rejected. It is what v1.33.0 did — the sweep missed four surfaces and three shipped inconsistent pairs. The gate would then pin values that no single module owns. |

---

## Reuse plan

- **Reuse** `KNOWN_EMBEDDING_DIMENSIONS` — `qwen3-embedding:0.6b`→1024 is already there.
- **Reuse** the parity gate's existing three-tier extractor machinery and its `extractOne`
  exactly-one-match discipline; add role tiers rather than a second file.
- **Reuse** `EmbeddingIndexStaleError` and both fingerprint gates unchanged.
- **Reuse** the existing per-document fail-open path in `addDocuments`; only the slice width moves.
- **Extend, do not replace**, `lmstudio-embedding-live.test.ts` — retarget 768 → 1024.

---

## Verification design

| Requirement | Proof |
| --- | --- |
| PDM-01, PDM-02 | Unit test over `INFERENCE_PROVIDERS`: each provider resolves all three roles; a scratch-`XDG_CONFIG_HOME` config load with each provider returns that provider's instruct id. |
| PDM-03, PDM-04 | Live sensor asserts 1024 non-zero from LM Studio (`skipIf` unreachable); unit test asserts the Ollama default pair is `qwen3-embedding:0.6b`/1024. |
| PDM-05 | Mutate one instruct literal and one coding literal in two different surfaces; observe the gate red naming each; restore by file copy; observe green. |
| PDM-06 | The bash fixtures `test-setup-local-first-api-key.sh`, `test-setup-ollama-model-exists.sh`, `test-lms-model-exists.sh`, updated to the new ids. |
| PDM-08..PDM-11 | Unit-assert the role table; assert the Ollama chat request body carries the role's `num_ctx`; assert `addDocuments` calls `embedBatch` 3 times for 130 documents (64/64/2). |

**Discipline (user's Phase rule, non-negotiable):** every new or repaired sensor gets an
**observed red on its own subject**, induced and reverted, with `git status` clean afterwards.
Restore is always from a **file copy** — never `git checkout`, `git restore`, or `git stash`.

---

## Risks & Concerns

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-01 | **Corrected.** The draft called nulling the needles floors "a deliberate weakening of a working gate". It is not: the `ollama` floor is **already unsatisfiable today**, by the file's own comment at `14.needles.test.ts:161` — *"With the 7 `services/search/` targets moved, its hit@5 caps at 7/14 = 0.50 against its own 0.64 floor below."* Nulling replaces a broken assertion with an honest one. | Two things still true and now stated: a `null` floor takes the bare `console.log` path (`:398-404`) and asserts **nothing**, and with both rows null F-NEEDLE-1 asserts nothing for any arm. What survives: F-NEEDLE-2 (`anyHits`, `:328`) and F-NEEDLE-3 (determinism, `:336-339`). Nothing forces re-calibration — the arm needs `RUN_E2E=1` + live provider + live API, and `needles-gate.yml` is `workflow_dispatch`-only with `continue-on-error: true`. |
| R-02 | **Narrowed.** The draft implied the 1024 path was untrodden. It is the historically-default one: `prisma/schema.prisma:458-468` defines `vector_documents_1024d`, created by the initial migration, and its HNSW cosine index is built lazily at runtime (`postgres-vector-store.ts:287-296`). **No migration is needed and there is no sequential-scan cliff.** What remains genuinely unmeasured is retrieval *quality* at 1024. | Accepted by the user over "measure first". Flagged in the CHANGELOG so a regression is attributable. |
| R-03 | Batch 8→64 makes each failure unit 8× larger, and the two providers are 8× apart in latency for the same batch. | Measured this session: LM Studio 64/64 in 2.6 s, Ollama 64/64 in 21.6 s. Batch size is therefore a **per-provider** field, not a shared constant. Caveat recorded: the Ollama figure was taken on `qwen3-embedding:4b`, the model this feature removes — it bounds the risk but is not a measurement of the shipped configuration. The per-document fail-open path (`:432-438`) still bounds loss to re-embed work. |
| R-04 | **Measured and closed as non-blocking, with the classification corrected.** The draft called the instruct model "non-thinking instruct". It is not, on Ollama. | Measured on both arms with a `json_schema` request on `/v1/chat/completions`. **Ollama `qwen3-vl:8b`**: a reasoning channel is returned **even with the seam's injected `think: false`** — that injection only halved latency (4.7 s → 2.7 s), it did not suppress the channel. **LM Studio `qwen3-vl-8b-instruct`**: no reasoning channel at all, 2.0 s, with no suppression sent (`injectsDisableThink: false`). Same model family, different builds. In both arms structured output landed correctly in `content`, so the `CLAUDE.md` failure mode — output routed into the reasoning channel, burning the 90 s timeout — **does not reproduce**. Two consequences stand: `config/index.ts:742-744` calls the reasoning-channel fallback "dormant" *because* the default is pure-instruct, and that comment is now invalidated; and `inference-providers.ts:38-45` records its `/v1/responses` finding against a **different** model, so that evidence does not transfer. |
| R-05 | A user loading LM Studio models via the GUI bypasses the installer's `lms load -c`. | Outside the product's reach. Documented rather than worked around. |
| R-06 | **Rewritten.** The draft proposed bringing the Markdown surfaces under the Tier-3 completeness scan. That is a trap: Tier 3's `allowedPrefixes` includes `.specs/`, and removing it would make every historical spec — files that must *not* change — a permanent offender. | Add a **narrow named Markdown tier** listing the 7 non-history doc files. `.specs/` and `CHANGELOG.md` stay excluded as append-only history; that exclusion is stated rather than implied. |
| R-07 | The parity gate is structurally blind to the tests that carry most of the blast radius: `isTestFile` (`:361`, `:437`) excludes every `__tests__`/`*.test.ts` from both completeness scans. | ~16 test files hardcode `ollama:qwen3-embedding:4b:2560` or the 9-key `llm` object — notably `embedding-fingerprint.test.ts`. They are found by hand in Tasks and listed explicitly; the gate is not widened to cover tests, because a test legitimately pins a specific model. |
| R-08 | The 11th `MASSA_AI_LLM_*` knob (`codeTemperature`) touches four coordinated files, and the obvious gate is the wrong one. | `turbo-passthrough-env.test.ts` only sees literal `process.env.X`; `config/index.ts` reads through `envNum(...)` helpers, so it is blind here. The gate that fires is `llm-env-passthrough.test.ts:36-48`, a `toEqual` against a hardcoded ten-name array, plus an 11th `KNOBS` row in `llm-env-prefix.test.ts:32-56`. |
| R-09 | Three models resident at once (8B@16k + 7B@32k + 0.6B@8k), and `setup-local-first.sh:344`'s dedup guard flips. | Today both LM Studio chat slots are `qwen/qwen3-4b-2507`, so `if [ "$CODE_MODEL" != "$LLM_MODEL" ]` skips the second pull. The new trio makes them differ, so the installer pulls and loads two chat models. Memory footprint is unsized; Tasks must either size it or stagger loading with `--ttl`. |

---

## Tech Decisions

1. **The split is value vs mechanism, not model vs parameter.** Values the user requires to be
   *equal* (context window, temperature) live once, provider-independently, so equality is a type
   fact rather than a convention. Facts that genuinely differ — the model id, whether context is
   applied per request, the safe embed batch size — live on `InferenceProviderSpec` beside the
   three behaviour flags it already carries. The draft's "parameters never vary per provider" was
   falsified by that file and by the 2.6 s / 21.6 s batch measurement.
2. **`defaultModels` is a total `Record<InferenceRole, string>`.** Completeness is enforced by
   the type system, so PDM-01 AC-3 needs no runtime guard.
3. **`llm.codeTemperature` is a new field, not a reinterpretation of `llm.temperature`.** An
   existing config setting `temperature` would otherwise silently defeat coding=0.0.
4. **REVERSED by review.** The draft said "no new config field for chat context window — the role
   table owns it." The user's decision is the opposite: **every one of the three models and all
   three of its settings (context window, temperature, batch size) is exposed in `config.json`
   and in the Admin Portal Config tab, and the configured value always beats the code default.**
   The role table becomes the *default source*, not the authority. No precedence machinery
   changes — resolution is already env > file > default, so a written field wins by construction.
   New fields: `llm.contextWindow`, `llm.codeContextWindow`, `llm.codeTemperature`,
   `embedding.contextWindow`, `embedding.batchSize`.
5. **The MLX embedding build is not used.** Measured: LM Studio types it as an LLM and
   `/v1/embeddings` cannot see it. The GGUF build of the same model is used instead.
6. **AD-010 applies, but through a different gate than the obvious one.** The new knob must be
   added to `turbo.json` → `tasks.test.passThroughEnv`. The test that will actually go red is
   `scripts/__tests__/llm-env-passthrough.test.ts:36-48` (a `toEqual` against a hardcoded
   ten-name array, fed by a regex scan of `config/index.ts`), **not**
   `turbo-passthrough-env.test.ts`, which only sees literal `process.env.X` accessors and is
   blind to the `envNum(...)` helper wrapping every LLM knob.
7. **`knownDimensions` is additive, never replaced.** Both config CLIs resolve
   `knownDimensions[model] ?? 768`. Dropping the nomic row would give a nomic user 1024, and
   moving the fallback literal without adding the row would give a qwen3 user 768 — either way an
   internally inconsistent model/width pair, the exact v1.33.0 defect class the gate exists for.
   Add the qwen3 row; move the `?? 768` fallback only after nomic has its own row.
8. **The historical judge fixtures are excluded from the sweep by name.** They carry the retired
   literal as memory *content* about a past decision, not as a default.
