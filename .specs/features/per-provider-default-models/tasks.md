# Per-Provider Default Models — Tasks

**8 Phases = 19 Tasks.** Max 3 Tasks per Phase. One atomic commit per Task.

Originally 17. Two Tasks were added during Execute on 2026-09-20 under the Tasks safety valve,
both closing a requirement the breakdown had left without an implementation site — neither is new
behaviour:

- **T06b** (Phase 3, now 3 Tasks) — PDM-12 AC-2 names five fields and only four had a reader.
- **T07b** (Phase 4, now 3 Tasks) — PDM-02 AC-2 says "that provider's **three** model ids" and
  T07 wrote two of them, leaving the retired embedding id and width at the writer.

Both Phases stay inside the per-Phase budget. The recurring shape is worth naming: each gap sat
between a requirement that named a set and a task that named a subset of it.

## Execution Plan

Phases are strictly ordered: everything derives from the seam, so Phase 1 lands first and the
gates land last, after the surfaces they measure exist.

Written as machine-checkable edges so the validator's diagram/definition cross-check actually
runs — a box diagram parses as "not confidently" and silently skips that sensor.

```
T01 -> T02
T01 -> T03
T02 -> T04
T01 -> T05
T01 -> T06
T01 -> T07
T01 -> T08
T02 -> T09
T09 -> T10
T01 -> T11
T01 -> T12
T11 -> T13
T11 -> T14
T11 -> T15
T13 -> T16
T16 -> T17
```

Phase order: 1 seam → 2 config schema and resolution → 3 runtime consumers → 4 config writers →
5 Admin Portal → 6 install surfaces → 7 gates → 8 docs and close-out. The gates land last, after
the surfaces they measure exist.

**Non-negotiable discipline (user's Phase rule).** A green gate is not proof. Every new or
repaired sensor needs an **observed red on its own subject**, induced and reverted, with
`git status` clean afterwards. Restore is **always from a file copy** — never `git checkout`,
`git restore`, or `git stash`.

---

## Task Breakdown

### Phase 1 — The seam

### T01: Extend `inference-providers.ts` with roles, per-provider models and mechanism — ✅ Complete

- Add `InferenceRole = "embedding" | "instruct" | "coding"`.
- Add `INFERENCE_ROLE_DEFAULTS` — embedding 8192; instruct 16384 @ 0.2; coding 32768 @ 0.0.
- Add to `InferenceProviderSpec`: `defaultModels` (total `Record<InferenceRole, string>`),
  `appliesContextPerRequest` (ollama `true`, lmstudio `false`), `embedBatchSize`.
- Fill both providers with the measured trio (spec § The trio).
- **Additively** add `"text-embedding-qwen3-embedding-0.6b": 1024` to `lmstudio.knownDimensions`;
  keep the nomic row (design TD-7 — four `?? 768` call sites depend on it).
- Preserve the zero-I/O constraint: no new import (`apps/web-ui` value-imports this subpath).

Tests: packages/shared/src/__tests__/inference-providers.test.ts — trio per provider, total-record type check, nomic row still present
Gate: bun test packages/shared/src/__tests__/inference-providers.test.ts && bun run type-check
Depends on: none.

---

### Phase 2 — Config schema and resolution

### T02: Add the five new config fields — ✅ Complete

`llm.contextWindow`, `llm.codeContextWindow`, `llm.codeTemperature`, `embedding.contextWindow`,
`embedding.batchSize` — in **both** `ServerConfig.llm` (`config/index.ts:96-107`) and
`MassaAiConfig` (`massa-ai-config.ts:126-136`), their default blocks, and
`config-writer.ts:232-235` validation. Resolution stays env > file > role-table default, so a
configured value wins by construction (PDM-12 AC-2).

Tests: new config-resolution cases: a file value beats the role-table default for all five fields
Gate: bun test packages/shared/src/config/__tests__/config-loader.test.ts packages/shared/src/config/__tests__/config-writer.test.ts
Depends on: T01.

### T03: Make the instruct/coding defaults provider-derived — ✅ Complete

`DEFAULT_LLM_MODEL` / `DEFAULT_LLM_CODE_MODEL` (`config/index.ts:30,37`) resolve from the active
provider's `defaultModels`; `defaultMassaAiConfig.llm` (`massa-ai-config.ts:426-436`) derives
from the ollama seam entry instead of literals.

Tests: config-loader cases per provider id; massa-ai-config default block derives, not restates
Gate: bun test packages/shared/src/config/__tests__/
Depends on: T01.

### T04: Wire the 11th `MASSA_AI_LLM_*` knob — ✅ Complete

`turbo.json` → `tasks.test.passThroughEnv`, **plus** the hardcoded ten-name array in
`scripts/__tests__/llm-env-passthrough.test.ts:36-48` and an 11th `KNOBS` row in
`packages/shared/src/config/__tests__/llm-env-prefix.test.ts:32-56`. `turbo-passthrough-env.test.ts`
is blind here — it sees only literal `process.env.X`, and these are read through `envNum(...)`.

Tests: llm-env-passthrough eleven-name array; llm-env-prefix KNOBS round-trip
Gate: bun test scripts/__tests__/llm-env-passthrough.test.ts packages/shared/src/config/__tests__/llm-env-prefix.test.ts
Depends on: T02.

---

### Phase 3 — Runtime consumers

### T05: Repair `getLlmConfig` and the code-role fallback — ✅ Complete

`llm-client.ts:192-206` — read the seam instead of four Ollama-shaped fallbacks
(`?? "http://localhost:11434/v1"`, `?? "ollama"`, `?? 0.2`, `disableThink ?? true`, the last
contradicting the seam's per-provider `injectsDisableThink`). Code role falls back to
`defaultModels.coding`, **not** to the instruct model (`:193`) — which after this feature is a
vision-language model. Apply per-role temperature.

Tests: llm-client cases: code role falls back to defaultModels.coding; no Ollama literal survives in getLlmConfig; disableThink follows injectsDisableThink
Gate: bun test packages/core/src/__tests__/llm-client.test.ts
Depends on: T01.

### T06: Send per-role context and read the per-provider batch size — ✅ Complete

Send the role's context window as `options.num_ctx` **where `appliesContextPerRequest`**; leave it
off for LM Studio (load-time only, spec A-07). `postgres-vector-store.ts:421` reads
`spec.embedBatchSize` instead of the literal `8`, keeping the per-document fail-open path.

Tests: request-body assertion for options.num_ctx per role and its absence on LM Studio; embedBatch call count 3 for 130 documents
Gate: bun test packages/core/src/__tests__/llm-client.test.ts && bun test packages/core/src/__tests__/vector-store-factory.test.ts
Depends on: T01.

### T06b: Give `embedding.contextWindow` a consumption site — ✅ Complete

**Added during Execute 2026-09-20 (Tasks safety valve), after T06 closed.** PDM-12 AC-2 requires a
configured value to beat the role-table default **for every one of the five fields**, and design
decision 4 restates it. The original breakdown gave four of the five a reader — `llm.contextWindow`,
`llm.codeContextWindow` and `llm.codeTemperature` through `llm-client.ts` (T05/T06),
`embedding.batchSize` through `postgres-vector-store.ts` (T06) — and left `embedding.contextWindow`
schema-only. Nothing reads it, so AC-2 is vacuously false for that field and the field-level Portal
gate (T10) would pass on a setting that changes nothing. This is a Tasks-authoring gap, not new
behaviour: the requirement was already written.

`packages/core/src/services/embeddings/provider.ts` — `OLLAMA_EMBED_NUM_CTX` (`:37`) is a
module-level const frozen at import, consumed at `:447` and `:600`. Resolve the value per call as
`config.embedding?.contextWindow ?? <the existing env knob> ?? INFERENCE_ROLE_DEFAULTS.embedding.contextWindow`,
preserving the existing env override's precedence over the role-table default. Do not widen the
change beyond those sites; the Ollama-embed-only scope recorded in design.md:87 stands.

Tests: a config-file `embedding.contextWindow` reaches the Ollama embed request body as `options.num_ctx`, beating the role-table default; absent the field, the role-table default is sent
Gate: bun test packages/core/src/__tests__/embedding-provider.test.ts (or the suite that covers `services/embeddings/provider.ts`) && bun run type-check
Depends on: T01, T02.

---

### Phase 4 — Config writers (the live defect)

### T07: Both config CLIs write the provider's trio — ✅ Complete

`apps/mcp-client/src/config-cli.ts` `init --lmstudio` (`:200-212`) and `use <provider>`
(`:283-294`), and the same two branches in `apps/opencode-plugin/src/config-cli.ts`. Each sets
`llm.model` / `llm.codeModel` from `defaultModels[provider]` beside the `llm.baseUrl` line that
is already there. This is the feature's core defect: measured on `8ea21839`,
`init --lmstudio` writes an LM Studio base URL next to Ollama model tags.

Tests: both CLIs, both branches, written-config assertion under a scratch XDG_CONFIG_HOME
Gate: bun test apps/mcp-client/src/__tests__/config-cli.test.ts apps/opencode-plugin/src/__tests__/config-cli.test.ts
Depends on: T01.

### T08: Wizard config template writes the trio — ✅ Complete

`scripts/lib/installer-api-key.sh:331` and its provider branch.

Tests: installer-config-template executes the template function per provider branch
Gate: bun test scripts/__tests__/installer-config-template.test.ts
Depends on: T01.

### T07b: Both config CLIs write the provider's **embedding** id and width too — ⚠️ Partial

**Writer fix delivered and verified**: both CLIs now derive `embedding.model` from
`INFERENCE_PROVIDERS[provider].defaultModels.embedding` and `embedding.dimensions` by key lookup
(`knownDimensions[model]` for lmstudio, `knownEmbeddingDimensions(model)` for ollama) in every
local-provider branch of `init --<provider>` and `use <provider>`, plus the `usage` help text.
`config-cli.test.ts` in both apps is green (35/35, 31/31) and the P1 Independent Test confirms an
internally-consistent trio+embedding pair per provider, per branch, per CLI.

**`bun test scripts/__tests__/embedding-defaults-parity.test.ts` is red — pre-existing, out of this
task's write set.** Three independent, confirmed defects, none introduced by this task's diff:
1. `PAIR_SURFACES`/`LMSTUDIO_PAIR_SURFACES`'s config-cli.ts regexes require a quoted string literal
   at the exact model/dims position (`"([^"]+)"` / `(\d+)`); a seam derivation (property access) has
   no literal there, so `extractOne` either throws ("extractor rotted") or — worse — the lazy
   `[\s\S]*?` skips ahead and silently matches the next branch's literal (observed: ollama's
   `PAIR_SURFACES` entry matched `mistral-embed` instead of throwing).
2. `referencePairLmStudio()` reads `inference-providers.ts`'s `knownDimensions` object and always
   returns entry #1 via `/knownDimensions:\s*\{\s*"([^"]+)":\s*\d+/` — now stale by construction
   since this feature made the table multi-entry. This is the exact defect T13's own task text
   names for re-anchoring.
3. `referencePair()` (ollama) reads `massa-ai-config.ts`'s `defaultMassaAiConfig.embedding` block,
   which was never assigned to any task — T03 derived only `defaultMassaAiConfig.llm`, leaving
   `embedding.model`/`.dimensions` at the retired `qwen3-embedding:4b`/2560 literal. PDM-03 AC-1 is
   therefore still false for a plain `init`/`init --ollama` with no explicit CLI-writer branch.

All three require touching `scripts/__tests__/embedding-defaults-parity.test.ts` and/or
`packages/shared/src/config/massa-ai-config.ts` — both outside T07b's write set and explicitly
named as belonging to a later batch (T13's "re-anchor and extend the parity gate"). Recommend
folding items 2 and 3 into T13 explicitly; T13's current text only names item 2. Evidence in
`.specs/project/STATE.md`.

**Added during Execute 2026-09-20 (Tasks safety valve), after T07 closed.** PDM-02 AC-2 reads
"SHALL write that provider's **three** model ids as file values". T07's text, and design.md's
surface-inventory row (`:113`), scoped the writers to `llm.model`/`llm.codeModel` only — so after
T07 the `init --lmstudio` written-config check returns `"model": "text-embedding-nomic-embed-text-v1.5"`
at `"dimensions": 768`, and the `use ollama` branch writes `qwen3-embedding:4b` at a literal `2560`.
Both are the **retired** defaults this feature replaces, which also makes PDM-03/PDM-04 AC-1 and
AC-2 ("both providers embed at 1024") false at the writer — the one surface PDM-02's own Independent
Test says matters, because file beats default. This is a Tasks/Design-authoring gap, not new
behaviour: the requirement was already written.

Both CLIs (`apps/mcp-client/src/config-cli.ts`, `apps/opencode-plugin/src/config-cli.ts`), every
local-provider branch of both `init --<provider>` and `use <provider>`: derive the embedding model
from `INFERENCE_PROVIDERS[provider].defaultModels.embedding` and the width by **key lookup**, never
a literal — `knownDimensions[model]` for lmstudio, `knownEmbeddingDimensions(model)` for ollama.
Both widths already exist (`embedding-dimensions.ts:40` → `qwen3-embedding:0.6b: 1024`;
`inference-providers.ts:116` → `text-embedding-qwen3-embedding-0.6b: 1024`), so this is a derivation
swap, not a new value. Keep the `?? 768` fallback and the nomic row intact (design TD-7). Enumerate
the branches rather than trusting a count — the `--model` override path and the `usage` help text
carry the retired literal too. Non-local providers (mistral, openai, voyage, cohere) are out of
scope; do not touch their blocks.

Tests: the written-config assertion extended to `embedding.model` + `embedding.dimensions`, per provider, per branch, per CLI, under a scratch `XDG_CONFIG_HOME`
Gate: bun test apps/mcp-client/src/__tests__/config-cli.test.ts && bun test apps/opencode-plugin/src/__tests__/config-cli.test.ts && bun test scripts/__tests__/embedding-defaults-parity.test.ts
Depends on: T01, T07.

---

### Phase 5 — Admin Portal

### T09: Add the new fields to the Portal config sections — ✅ Complete

`config-sections.ts` — `embedding` (`:43-52`) gains `contextWindow` + `batchSize`; `llm`
(`:119-132`) gains `codeTemperature`, `contextWindow`, `codeContextWindow`. Update every `guide`
string citing a retired default (`qwen3-embedding:4b`, `2560`, `qwen2.5:7b-instruct`). Regenerate
`fixtures/render-golden.json` with `MASSA_AI_WRITE_GOLDEN=1` and log it in the test header's
"Deliberate regenerations"; update `config-forms.test.ts` and `fixtures/config-get.json`.

Tests: render-golden regenerated and diffed; config-forms field list; config-get fixture
Gate: bun test apps/web-ui/src/__tests__/
Depends on: T02.

### T10: Add a field-level config↔Portal parity gate — ✅ Complete

`config-section-coverage.test.ts` extracts only `key:` (sections), never `name:` (fields), so a
schema field absent from the Portal passes today. Add the field-level assertion (PDM-14).
**Observed red:** add a field to the schema, withhold it from `config-sections.ts`, watch the gate
name it, restore by file copy.

**Scoped to `embedding` and `llm`, not all 17 sections.** A schema-vs-Portal walk over every
section immediately reds on a pre-existing, unrelated gap this task's write set cannot fix:
`logging` in `massa-ai-config.ts` carries 4 fields (`enableFileSink`, `bufferSize`,
`maxFileSizeMb`, `maxFiles`) absent from `config-sections.ts`. Fixing that means touching
`config-sections.ts`'s `logging` block and/or `massa-ai-config.ts` — outside T10's named write set
(`config-section-coverage.test.ts` only) and unrelated to PDM-12/13/14, which name only the
`embedding`/`llm` fields this feature added. The new assertion is scoped to those two sections;
the `logging` gap is named here as a separate, pre-existing finding for a future task, not folded
into T10 silently.

Tests: the new field-level assertion, red on a schema field withheld from config-sections.ts
Gate: bun test apps/tools-api/src/routes/config-section-coverage.test.ts
Depends on: T09.

---

### Phase 6 — Install and diagnostic surfaces

### T11: Sweep the single-dialect surfaces

`.env.example`, `install.sh` (including the `  local llm_model="..."` dialect at `:379-380` and
the prose at `:432`, `:472`), `Dockerfile`, `docker-compose.yml`,
`apps/tools-api/setup-ollama-wsl.sh`, `scripts/validate-vscode-integration.sh`,
`scripts/diagnose.ts`. **Do not touch** `benchmarks/llm-judge/fixtures/known-{dup,distinct}.json`
or `run.ts:171` — historical memory content, not defaults (design § Must NOT change).

Tests: parity gate tiers covering each swept file; judge fixtures asserted unchanged
Gate: bun test scripts/__tests__/embedding-defaults-parity.test.ts && bun run test:scripts
Depends on: T01.

### T12: Repair `setup-local-first.sh`

Three literal sites under two variable names (`:338`, `:339`, `:500` — the last decides whether
LLM features get enabled at all, PDM-06 AC-3). The `:344` dedup guard
(`[ "$CODE_MODEL" != "$LLM_MODEL" ]`) flips from skip to pull because the new LM Studio instruct
and coding ids differ; add `lms load -c <role context>` per model and address the residency
question in design R-09.

Tests: test-setup-local-first-api-key.sh and test-lms-model-exists.sh against the new ids, including the :500 enable decision
Gate: bash scripts/tests/test-setup-local-first-api-key.sh && bash scripts/tests/test-lms-model-exists.sh
Depends on: T01.

---

### Phase 7 — Gates

### T13: Re-anchor and extend the parity gate

Re-anchor `referencePairLmStudio()` on `defaultModels.embedding` with a **by-key** width lookup —
the current brace-anchored regex silently returns entry #1 and this feature is what makes the
table multi-entry (design § Parity-gate re-anchoring). Add instruct and coding tiers with an
explicit per-row `expectedMatches`, so the two-match `setup-local-first.sh` case is a declared
value rather than an `extractOne` throw. Add a **narrow named Markdown tier** for the 7
non-history doc files; `.specs/` and `CHANGELOG.md` stay excluded as append-only history.
**Observed red per tier**, each on its own subject.

Tests: one induced red per new tier and per dialect, each on its own subject, restored by file copy
Gate: bun test scripts/__tests__/embedding-defaults-parity.test.ts
Depends on: T11.

### T14: Repoint the needles surfaces

Both `FLOORS` rows to explicit `null` with a calibration note naming this feature — recording that
the `ollama` row was **already unsatisfiable** (`14.needles.test.ts:161`) and that F-NEEDLE-2 and
F-NEEDLE-3 still assert. Separately, `.github/workflows/needles-gate.yml:88-108` pins
`qwen3-embedding:4b` three ways **plus a cache key**; swap all four.

Tests: the unknown-arm guard still throws; a null row takes the console-log path and F-NEEDLE-2/3 still assert
Gate: bun test packages/core/src/__tests__/e2e/14.needles.test.ts
Depends on: T11.

### T15: Repoint the tests the parity gate is forbidden to see

`isTestFile` (`:361`, `:437`) excludes every `__tests__`/`*.test.ts` from both completeness scans,
so ~16 files hardcoding `ollama:qwen3-embedding:4b:2560` or the 9-key `llm` object are invisible
to it — notably `embedding-fingerprint.test.ts`. Enumerate and repoint by hand; do not widen the
gate to cover tests, which legitimately pin specific models.

Tests: the repointed fingerprint and dimension assertions
Gate: bun test packages/core/src/__tests__/embedding-fingerprint.test.ts && bun run test
Depends on: T11.

---

### Phase 8 — Documentation and close-out

### T16: Update the 7 non-history documentation surfaces

`README.md`, `FEATURES.md`, `docs/CHEATSHEET.md`, `docs/ONBOARDING.md`,
`apps/tools-api/OLLAMA_WSL_SETUP.md`, `benchmarks/llm-judge/README.md`,
`benchmarks/needles/README.md`. `CHANGELOG.md` and `.specs/` are append-only history and are
excluded by design.

Tests: the narrow Markdown tier added in T13 covers each updated doc
Gate: bun test scripts/__tests__/embedding-defaults-parity.test.ts
Depends on: T13.

### T17: Close out

`CHANGELOG.md` `### Changed` entry marked breaking, naming the required reindex; `.specs/project/STATE.md`;
`.specs/HANDOFF.md`; `.specs/project/FEATURES.json`. Then
`bun skills/massa-ai/scripts/check_specs_delivered.ts per-provider-default-models --root .`

Tests: none — close-out artifacts are checked by the delivery gate, not by a unit test
Gate: bun skills/massa-ai/scripts/check_specs_delivered.ts per-provider-default-models --root .
Depends on: T16.

---

## Test Coverage Matrix

| Requirement | Task | Sensor | Observed red on |
| --- | --- | --- | --- |
| PDM-01, PDM-04 | T01 | seam unit test; type-check | removing a role from one provider's `defaultModels` |
| PDM-02 | T07, T07b, T08 | the written-config check (spec P1 Independent Test) — T07 covers the instruct/coding pair, T07b the embedding id and width, T08 the wizard template | reverting one CLI branch; restoring one retired embedding literal |
| PDM-03, PDM-04 | T03, T05, T07b | config-resolution unit test per provider; the written-config check for `embedding.model` + `dimensions` at the writer | pinning the global constant back; restoring `qwen3-embedding:4b`/2560 in a `use` branch |
| PDM-05 | T05 | code-role fallback unit test | restoring `?? cfg?.model` |
| PDM-06 | T12 | `test-setup-local-first-api-key.sh` | mutating `:500`'s literal |
| PDM-08..PDM-11 | T06 | `num_ctx` request-body assertion; `embedBatch` call-count for 130 docs | reverting the batch constant |
| PDM-12 | T02, T06, T06b | config-file-beats-default test per field — the schema half is T02; the reader half is T06 (`_resolveEmbedBatchSize`) and T06b (`embedding.contextWindow`) | removing one field from the resolver; inverting the `config ?? role-table` fallback |
| PDM-13 | T09 | golden render snapshot | withholding one field |
| PDM-14 | T10 | field-level parity gate | schema field withheld from the Portal |
| Sweep completeness | T13 | parity gate, all tiers | one literal per tier, per dialect |
| Docs currency | T16 | the narrow Markdown tier from T13 | one stale doc literal |
| Close-out | T17 | **none** — by design. The close-out artifacts carry no behavior; `check_specs_delivered.ts` is their deterministic gate, and a unit test over prose would assert its own fixture. | n/a |

## Gate Check Commands

```bash
cd ~/Projects/massa-ai-feat-per-provider-default-models

bun run lint
bun run type-check
bun run build
bun run test
bun run test:scripts
bun run test:plugins

# feature-specific
bun test scripts/__tests__/embedding-defaults-parity.test.ts
bun test scripts/__tests__/llm-env-passthrough.test.ts
bun test packages/shared/src/config/__tests__/llm-env-prefix.test.ts
bun test apps/tools-api/src/routes/config-section-coverage.test.ts
bun test packages/core/src/__tests__/lmstudio-embedding-live.test.ts

# the written-config check — the defect this feature exists for
D=$(mktemp -d) && XDG_CONFIG_HOME=$D bun apps/mcp-client/src/config-cli.ts init --lmstudio \
  && grep -E '"(model|codeModel|dimensions)"' "$D/massa-ai/config.json"

bun skills/massa-ai/scripts/check_specs_delivered.ts per-provider-default-models --root .
```

`bun run test:plugins` is a second runner `bun run test` never reaches; `bun run test:scripts`
covers `scripts/__tests__` and is where the parity gate lives.
