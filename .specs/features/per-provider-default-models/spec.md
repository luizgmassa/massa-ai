# Per-Provider Default Models Specification

**Slug:** `per-provider-default-models`
**Branch:** `feat/per-provider-default-models` (from `origin/main` @ `8ea21839`, v1.58.0)
**Worktree:** `~/Projects/massa-ai-feat-per-provider-default-models`

## Problem Statement

The `INFERENCE_PROVIDERS` seam (`packages/shared/src/config/inference-providers.ts`) carries
per-provider knowledge for base URLs, env-var names, and embedding widths — but **no model
field**. The three model roles the product actually uses are resolved elsewhere, and every one
of them is Ollama-shaped:

- Instruct and coding resolve through two **global** constants, `DEFAULT_LLM_MODEL =
  "qwen2.5:7b-instruct"` and `DEFAULT_LLM_CODE_MODEL = "qwen2.5-coder:7b"`
  (`packages/shared/src/config/index.ts:30,37`). There is no provider dimension at all.
- Embedding has per-provider defaults, but they are a different model at a different width on
  each side: Ollama `qwen3-embedding:4b`/2560, LM Studio
  `text-embedding-nomic-embed-text-v1.5`/768.

The consequence is a config that looks correct and silently fails. `scripts/setup-local-first.sh`
(lines 334-339) is the **only** surface in the repository that branches the LLM model on the
provider; every other path — `install.sh`, the two `config-cli.ts` copies, `.env.example`, the
runtime fallback in `llm-client.ts:193-194` — hands an Ollama tag to whatever provider is
configured. A user on LM Studio who enables LLM features outside that one wizard gets a model id
LM Studio cannot resolve.

The same global-vs-per-role shape repeats in the **runtime parameters**: `llm.temperature` is one
number applied to all ten call sites (`llm-client.ts:199,429,497,513`), and context length is set
only for Ollama embedding (`OLLAMA_EMBED_NUM_CTX`, `provider.ts:447,600`) — chat calls set no
context at all, on either provider.

**Measured population.** 12 distinct files are gated today by
`scripts/__tests__/embedding-defaults-parity.test.ts` (19 table entries; counted by extracting
every `file:` key from the surface tables). A further 8 Markdown files restate a default model and
are gated by nothing. Instruct and coding defaults have **no gate at all**.

## Goals

- [ ] One trio of roles — embedding, instruct, coding — with an **equivalent model per provider
      in that provider's native format**, all derived from a single seam field.
- [ ] Both providers embed at the **same width (1024)**, so a workspace is portable between them
      in width terms (the fingerprint still pins provider+model, by design).
- [ ] The existing defaults-parity gate extends from embedding-only to **all three roles**, so a
      future model swap cannot miss a surface by hand.

## The trio

Measured, not derived. Every LM Studio literal below was read from a running
`GET /v1/models` after downloading the model — see the Assumptions table for why that was
necessary.

| Role | Ollama (GGUF tag) | LM Studio (catalog id) | Width |
| --- | --- | --- | --- |
| Embedding | `qwen3-embedding:0.6b` | `text-embedding-qwen3-embedding-0.6b` | 1024 |
| Instruct | `qwen3-vl:8b` | `qwen3-vl-8b-instruct` | — |
| Coding | `qwen2.5-coder:7b` | `qwen2.5-coder-7b-instruct` | — |

Ollama's coding default is unchanged; it is already `qwen2.5-coder:7b`.

## Runtime parameters per role

Required equal across both providers (user annotation on this spec, 2026-09-20).

| Role | Context window | Other | Today |
| --- | --- | --- | --- |
| Embedding | 8192 | batch 64 texts per call | Ollama ctx already 8192; batch hardcoded 8 |
| Instruct | 16384 | temperature 0.2 | no ctx set; temperature global 0.2 |
| Coding | 32768 | temperature 0.0 | no ctx set; temperature global 0.2 |

**The two providers reach the same outcome by different mechanisms**, and this asymmetry is not
removable: Ollama accepts `options.num_ctx` per request, while LM Studio's context length is a
**load-time** setting (`lms load -c <n>`) with no per-request equivalent in its OpenAI-compatible
API. The requirement is stated as the outcome; the design picks the mechanism per provider.

## Out of Scope

| Item | Reason |
| --- | --- |
| Measuring retrieval quality at 1024 | The user explicitly chose "aceitar e trocar direto" over running the LIP-22 harness at the new width. Recorded as accepted risk A-03, not as a closed question. |
| Automatic re-embedding / index migration | The `embedding_fingerprint` read and write gates already fail loudly and instruct the user to reindex. Building a migration is a separate feature. |
| Providers other than `ollama` and `lmstudio` | `deepinfra`, `cohere`, and `openai` are remote providers outside the local-inference seam this feature extends. |
| Changing `modelRole` call-site routing | The 7 instruct / 3 code split in `llm-client.ts` is unchanged; only the values it resolves to change. |
| MLX build of Qwen3-Embedding as an embedding provider | Measured impossible — see A-01. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| A-01 — The requested `mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ` cannot be the LM Studio embedding default | Use the official GGUF build, catalog id `text-embedding-qwen3-embedding-0.6b` | **Measured.** LM Studio types a model by architecture. The MLX repo is `Qwen3ForCausalLM`, so LM Studio lists it under LLM: `lms ps` shows it loaded, `/v1/chat/completions` answers, and `/v1/embeddings` returns `"No models loaded"` while `nomic` succeeds on the same server in the same second. The GGUF build of the identical model is typed EMBEDDING and returns 1024. | y (user chose this option) |
| A-02 — LM Studio ids cannot be derived from the HuggingFace repo path | Pin the literal read from a live `GET /v1/models` after download | **Measured, 3 samples.** `mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ` → `qwen3-embedding-0.6b-dwq`; `mlx-community/Qwen3-VL-8B-Instruct-4bit` → `qwen3-vl-8b-instruct`; `lmstudio-community/Qwen3-4B-Instruct-2507-MLX-4bit` → `qwen/qwen3-4b-2507`. The publisher, the quantization token, and in the third case the whole name differ. A lowercased-path rule fits sample 1 and 2 but not 3. | y (user chose "baixar e medir") |
| A-03 — 1024 retrieval quality is unmeasured | Ship it anyway; set the needles floors to explicit `null` with a calibration note | The user chose to switch without measuring. The `ollama` floor row is documented as calibrated at **2560 on the binary-quantization path**; at 1024 the run takes the HNSW-cosine branch on a different model, so the existing numbers are a claim about a different algorithm. Asserting them would be a false claim; the file already supports a deliberate `null` meaning "recorded, awaiting calibration". | y — but flagged: this **weakens a gate**. Re-calibration is the follow-up. |
| A-04 — `qwen3-vl:8b` is a vision-language model used for text-only judgment | Accept | It is a non-thinking instruct model, which is the repository's stated hard requirement (`CLAUDE.md` § LLM behaviour). Its vision head is unused by all 7 NL-judgment call sites. | y |
| A-05 — Existing user `config.json` files are unaffected | No migration, no rewrite | Precedence is env > `config.json` > literal default. A user who already has `llm.model` set keeps it. Only fresh installs and unset fields move. | y |

| A-06 — Batch 64 contradicts a load-bearing comment | Ship 64 | `postgres-vector-store.ts:421` pins `EMBED_SUB_BATCH_SIZE = 8` with the comment *"Ollama bge-m3 crashes on large batches (50+)"*. That is **model-specific, and bge-m3 is neither the default nor present**. Measured at 64 on both providers on this host: LM Studio `text-embedding-qwen3-embedding-0.6b` returned 64/64 non-zero 1024-vectors in 2.6 s; Ollama `qwen3-embedding:4b` returned 64/64 non-zero 2560-vectors in 21.6 s. The per-document fail-open path (`:432-438`) still bounds the blast radius, now at 64 documents instead of 8. | y |
| A-07 — LM Studio context length is not settable per request | Installer sets it at load with `lms load -c` | Measured from `lms load --help`: `-c, --context-length <length>` is a load-time flag. The OpenAI-compatible API has no equivalent field. A user who loads a model through the LM Studio GUI instead of the installer gets LM Studio's own default; this is outside the product's reach and is documented rather than worked around. | y |

**Open questions:** none — all resolved with the user or logged above.

---

## User Stories

### P1: One seam owns every default model ⭐ MVP

**User Story**: As a maintainer, I want every default model literal to derive from one
per-provider seam field, so that swapping a model is one edit instead of a hand sweep across
sixteen surfaces.

**Why P1**: This is the defect. The v1.33.0 embedding swap was swept by hand, missed four
surfaces, and three of them shipped internally inconsistent model/width pairs — that history is
why `scripts/__tests__/embedding-defaults-parity.test.ts` exists. The LLM half has no such gate
at all.

**Acceptance Criteria**:

1. The system SHALL expose, on each `InferenceProviderSpec`, a default model id for each of the
   three roles: embedding, instruct, and coding.
2. WHEN any installer or config CLI writes `config.json` for a provider THEN it SHALL write that provider's three model ids as file values, never another provider's.
3. WHEN no env var and no `config.json` value is set THEN the system SHALL resolve the instruct and coding model from the configured provider's seam entry, not from a global constant.
4. IF a provider id is added to `LOCAL_INFERENCE_IDS` without all three fields THEN TypeScript compilation SHALL fail.
5. WHERE a role has no explicit `codeModel` in config the system SHALL fall back to that provider's coding default, never to the instruct model.

**Independent Test**: the written-config check, because the empty-config path is a state no real
user is in — every installer serializes a model into `config.json`, and file beats default:

```bash
D=$(mktemp -d) && XDG_CONFIG_HOME=$D bun apps/mcp-client/src/config-cli.ts init --lmstudio \
  && grep -E '"(model|codeModel|dimensions)"' "$D/massa-ai/config.json"
```

Measured on `8ea21839` **before** this feature: writes `"baseUrl": "http://localhost:1234/v1"`
next to `"model": "qwen2.5:7b-instruct"` and `"codeModel": "qwen2.5-coder:7b"` — an LM Studio
endpoint carrying Ollama tags. That is the live defect. The same check must be run against
`apps/opencode-plugin/src/config-cli.ts`, which is a second copy of the same branches.

---

### P1: The parity gate covers all three roles ⭐ MVP

**User Story**: As a maintainer, I want the defaults-parity gate to fail by name on any surface
carrying a stale instruct or coding model, exactly as it already does for embedding.

**Why P1**: Without it, this feature's own sweep is unverifiable and the next one repeats the
v1.33.0 miss.

**Acceptance Criteria**:

1. WHEN a tracked surface restates a stale instruct or coding default THEN the parity gate SHALL fail, naming that surface and the differing value.
2. WHEN a surface's extractor matches zero or more than one time THEN the gate SHALL throw with
   the match count, not silently pass.
3. The gate SHALL report each checked-surface population count on a green run, so a
   parse-zero-subjects regression is visible without reading the source.

**Independent Test**: Mutate one instruct literal in `install.sh`, run the gate, observe a red
naming `install.sh`; restore from a file copy and observe green. Repeat for a coding literal in a
second file.

---

### P1: Both providers embed at 1024 ⭐ MVP

**User Story**: As a user switching between Ollama and LM Studio, I want both to embed at the
same width with the same model, so the only thing separating my two indexes is the provider name.

**Why P1**: It is the literal request.

**Acceptance Criteria**:

1. The system SHALL default `ollama` embedding to `qwen3-embedding:0.6b` at 1024 dimensions.
2. The system SHALL default `lmstudio` embedding to `text-embedding-qwen3-embedding-0.6b` at
   1024 dimensions.
3. WHILE a workspace carries a fingerprint from the previous default the system SHALL refuse reads and writes with `EmbeddingIndexStaleError`, naming the stored and the current fingerprint.
4. WHERE LM Studio is reachable on the configured base URL, the live sensor SHALL assert a 1024
   -length non-zero vector from `POST /v1/embeddings`.

**Independent Test**: `bun test packages/core/src/__tests__/lmstudio-embedding-live.test.ts`
against a running LM Studio with the model loaded; the `skipIf` guard keeps it inert in CI.

---

### P1: Runtime parameters are per role, equal across providers ⭐ MVP

**User Story**: As a user, I want each role to run with the context window and sampling settings
that role needs, identically on Ollama and LM Studio, so switching providers does not silently
change how the model behaves.

**Why P1**: Requested directly on this spec. It is also the same defect as the model half — one
global `temperature` standing in for three roles — so fixing it separately would mean touching
the same seam twice.

**Acceptance Criteria**:

1. The system SHALL resolve context window and temperature per role: embedding 8192; instruct 16384 at temperature 0.2; coding 32768 at temperature 0.0.
2. WHEN an Ollama chat call is issued THEN the system SHALL send that role's context window as `options.num_ctx` on the request.
3. WHERE the provider is LM Studio the installer SHALL load each model with `lms load -c <role context>`, because LM Studio exposes no per-request context length.
4. WHEN embedding documents THEN the vector store SHALL submit 64 texts per provider call, not 8.
5. IF a batch embed call fails THEN the system SHALL fall back per document, preserving the existing fail-open behavior at the larger batch size.

**Independent Test**: Unit-assert the per-role resolution table; assert the Ollama chat request
body carries `options.num_ctx` matching the role; assert `addDocuments` slices at 64 by counting
`embedBatch` invocations for a 130-document input (expect 3 calls: 64/64/2).

---

### P1: Every model setting is configurable and the config wins ⭐ MVP

**User Story**: As an operator, I want each of the three models and all of its settings — context
window, temperature, batch size — present in `config.json` and in the Admin Portal Config tab,
showing the same information, and I want my configured value to beat the code default every time.

**Why P1**: Requested directly on the design. It also reverses a design decision that would have
made these values code-only.

**Acceptance Criteria**:

1. The system SHALL expose `llm.contextWindow`, `llm.codeContextWindow`, `llm.codeTemperature`, `embedding.contextWindow`, and `embedding.batchSize` as `config.json` fields.
2. WHEN a value is present in `config.json` THEN the system SHALL use it in preference to the role-table default, for every one of those fields.
3. The Admin Portal Config tab SHALL render a field for every one of those keys, in the `embedding` and `llm` sections respectively.
4. WHEN a config field exists in the schema but not in the Portal section table THEN a deterministic gate SHALL fail naming that field.
5. WHERE a Portal `guide` string cites a default model or width it SHALL cite the current one, not a retired one.

**Independent Test**: The existing `config-section-coverage.test.ts` checks **sections only** —
it extracts `key:` and never `name:`, so a schema field missing from the Portal passes today.
AC-4 requires a new field-level assertion; its observed red is a field added to the schema and
withheld from `config-sections.ts`.

---

### P2: Install surfaces pull the same trio

**User Story**: As someone running any installer, I want the models it pulls and the models it
writes into my config to be the same three.

**Acceptance Criteria**:

1. WHEN `scripts/setup-local-first.sh` runs with a provider selected THEN it SHALL pull and
   write that provider's trio.
2. WHEN `install.sh` auto-detects models THEN it SHALL probe for the new instruct id, not the
   retired `qwen2.5:7b-instruct`.
3. IF the instruct model is absent from the running server THEN the installer SHALL leave LLM features disabled, stating the reason in its output.

**Independent Test**: `bash scripts/tests/test-setup-local-first-api-key.sh` and the
`test-setup-ollama-model-exists.sh` / `test-lms-model-exists.sh` fixtures, updated to the new ids.

---

## Edge Cases

- IF a user's `config.json` already names a model THEN the system SHALL keep it — file beats
  default (A-05).
- IF the LM Studio MLX build of Qwen3-Embedding is configured as the embedding model THEN
  `/v1/embeddings` SHALL fail with `"No models loaded"`; this is LM Studio's behavior, not the
  product's, and the failure is surfaced unchanged (A-01).
- WHEN embedding width moves from 2560 to 1024 THEN `postgres-vector-store.ts` SHALL take the
  `≤ 2000` direct-HNSW-cosine branch rather than the two-phase binary-quantization branch
  (`:233`, `:267`) — a retrieval **algorithm** change, not only a size change.
- IF the needles E2E arm runs against the new default THEN its floors SHALL be an explicit
  `null` with a calibration note, never the 2560-derived numbers (A-03).
- WHEN `qwen3-embedding:0.6b` is already present in `KNOWN_EMBEDDING_DIMENSIONS` at 1024 THEN no
  width-table edit is required for the Ollama side — verified present at
  `embedding-dimensions.ts:40`.

---

## Implicit-Requirement Sweep

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | PDM-01 AC-3 — a provider missing any of the three fields fails type-check. |
| Failure / partial-failure states | PDM-03 AC-3 — fingerprint mismatch fails closed on read and write. |
| Idempotency / retry / duplicate handling | N/A because the change is a set of literal defaults with no runtime state transition. |
| Auth boundaries & rate limits | N/A because no route or permission surface changes. |
| Concurrency / ordering | N/A because defaults are resolved once at config load. |
| Data lifecycle / expiry | PDM-03 AC-3 — existing index data becomes unreadable by design and must be re-indexed; this is the breaking change. |
| Observability | PDM-05 AC-3 — the parity gate prints its population count per run. |
| External-dependency failure | PDM-06 AC-3 — an unreachable or model-less server leaves LLM features off rather than writing a config that degrades on every call. |
| State-transition integrity | PDM-03 AC-3 — the fingerprint gate is the guard between the two states. |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PDM-01 | P1: One seam owns every default model | Design | Pending |
| PDM-02 | P1: One seam owns every default model | Design | Pending |
| PDM-03 | P1: Both providers embed at 1024 | Design | Pending |
| PDM-04 | P1: Both providers embed at 1024 | Design | Pending |
| PDM-05 | P1: The parity gate covers all three roles | Design | Pending |
| PDM-06 | P2: Install surfaces pull the same trio | Design | Pending |
| PDM-07 | Pin every LM Studio id as a measured literal (A-02) | Design | Resolved — all three measured |
| PDM-08 | P1: Runtime parameters are per role | Design | Pending |
| PDM-09 | P1: Runtime parameters are per role (Ollama `num_ctx` on chat) | Design | Pending |
| PDM-10 | P1: Runtime parameters are per role (LM Studio load-time context) | Design | Pending |
| PDM-11 | P1: Runtime parameters are per role (embed batch 64) | Design | Pending |
| PDM-12 | P1: Every model setting is configurable, config wins | Design | Pending |
| PDM-13 | P1: Admin Portal renders every model setting | Design | Pending |
| PDM-14 | P1: Field-level config↔Portal parity gate | Design | Pending |

**Coverage:** 14 total, 0 mapped to tasks (Tasks phase pending), 0 unmapped.

---

## Success Criteria

- [ ] `bun test scripts/__tests__/embedding-defaults-parity.test.ts` green, covering all three
      roles on both providers, with the population counts printed.
- [ ] Each new or repaired sensor has an **observed red** on its own subject, induced and
      reverted by file copy, with `git status` clean afterwards.
- [ ] `bun run lint`, `bun run type-check`, `bun run build`, `bun run test`, and
      `bun run test:scripts` green in the worktree.
- [ ] A live LM Studio returns a 1024-length vector for the new embedding default (already
      measured once; re-asserted by the sensor).
- [ ] `CHANGELOG.md` carries a `### Changed` entry marked breaking, naming the required reindex.

---

## Verification Approach

Independent `massa-ai-verification-agent` (author ≠ verifier) at the end of Execute, writing
`validation.md`: spec-anchored outcome check per AC, plus the discrimination sensor over the
parity gate and the live embedding sensor. Mutations run in scratch state and are restored from
file copies — never `git checkout`, `git restore`, or `git stash`.
