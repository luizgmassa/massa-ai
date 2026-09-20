# Per-Provider Default Models — Tasks

**8 Phases = 21 Tasks.** Max 3 Tasks per Phase. One atomic commit per Task.

Originally 17. Four Tasks were added during Execute on 2026-09-20 — three under the Tasks safety valve,
each closing a requirement the breakdown had left without an implementation site — none is new
behaviour:

- **T06b** (Phase 3, now 3 Tasks) — PDM-12 AC-2 names five fields and only four had a reader.
- **T07b** (Phase 4, now 3 Tasks) — PDM-02 AC-2 says "that provider's **three** model ids" and
  T07 wrote two of them, leaving the retired embedding id and width at the writer.
- **T03b** (Phase 6, now 3 Tasks) — PDM-03 AC-1 names the ollama embedding default and T03 derived
  only `defaultMassaAiConfig.llm`, leaving `.embedding` at `qwen3-embedding:4b`/2560. A Phase-2
  remainder by subject, placed in Phase 6 because Phase 2 is closed and at budget.

The fourth was added at the user's explicit decision rather than by the safety valve, and is the
only one that touches a shared gate rather than this feature's own surfaces:

- **T15b** (Phase 8, now 3 Tasks) — `bun run test:scripts` short-circuits on `&&` and never runs
  its 37 shell suites when the bun half fails, while still printing the bun half's counts. The
  feature's Success Criteria cite that command as evidence.

Every Phase stays inside the per-Phase budget. **The recurring shape of the first three is worth
naming, because it produced all three: a requirement named a set, and the task that was supposed
to implement it named a subset.** Each was found by reading the requirement against the task
rather than by a gate — the first two by inspection, the third only when the parity gate went red
for an unrelated reason. When auditing the remaining tasks, compare each against the full
requirement text, not against the task's own summary of it.

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

### T07b: Both config CLIs write the provider's **embedding** id and width too — ✅ Complete (parity clause closed by T13)

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

### T03b: Derive `defaultMassaAiConfig.embedding` from the seam — ✅ Complete

**Added during Execute 2026-09-20 (Tasks safety valve), after T07b measured the parity gate red.**
PDM-03 AC-1 says the system SHALL default `ollama` embedding to `qwen3-embedding:0.6b` at 1024
dimensions. T03's text named only `defaultMassaAiConfig.llm`, so the shipped config template at
`massa-ai-config.ts:400-404` still reads `model: "qwen3-embedding:4b"` / `dimensions: 2560` —
measured on `319c7cbc`. PDM-03 AC-1 is therefore still false for a plain `init` / `init --ollama`,
and `referencePair()` in the parity gate reads exactly this block as its ollama reference, which
is one of the three reasons that gate is red.

It sits in Phase 6 rather than Phase 2 only because Phase 2 is closed and already at the 3-Task
budget; it is a Phase-2 remainder by subject and **must land before T13**, whose ollama reference
pair it supplies. Its logical home is next to T03.

`packages/shared/src/config/massa-ai-config.ts` — `defaultMassaAiConfig.embedding.model` and
`.dimensions` derive from `INFERENCE_PROVIDERS.ollama.defaultModels.embedding` and a **by-key**
width lookup (`knownEmbeddingDimensions`), exactly as T03 did for `.llm`. Do not touch
`contextWindow`/`batchSize` — their deliberate absence from this block is T02's accepted
SPEC_DEVIATION and the comment recording it stays. `baseURL` and `provider` are unchanged.

Tests: the shipped default block derives rather than restates — asserted against the seam, not against a literal, so a future seam change cannot leave this block stale silently
Gate: bun test packages/shared/src/config/__tests__/ && bun run type-check
Depends on: T01.

### T11: Sweep the single-dialect surfaces — ✅ Complete

`.env.example`, `install.sh` (including the `  local llm_model="..."` dialect at `:379-380` and
the prose at `:432`, `:472`), `Dockerfile`, `docker-compose.yml`,
`apps/tools-api/setup-ollama-wsl.sh`, `scripts/validate-vscode-integration.sh`,
`scripts/diagnose.ts`. **Do not touch** `benchmarks/llm-judge/fixtures/known-{dup,distinct}.json`
or `run.ts:171` — historical memory content, not defaults (design § Must NOT change).

Tests: parity gate tiers covering each swept file; judge fixtures asserted unchanged
Gate: bun test scripts/__tests__/embedding-defaults-parity.test.ts && bun run test:scripts
Depends on: T01.

**Execution note (2026-09-20).** T03b's correct derivation of `defaultMassaAiConfig.embedding`
(non-literal `INFERENCE_PROVIDERS.ollama.defaultModels.embedding` expression, same shape T03
already used for `.llm`) makes `referencePair()`'s `/model:\s*"([^"]+)"/g` regex match 0 times.
Because that call sits in the `describe()` body (not inside a `test()`), it throws before any
test in the file runs: measured, `bun test scripts/__tests__/embedding-defaults-parity.test.ts`
now reports **0 pass / 0 fail / 1 error** (`massa-ai-config.ts model: expected exactly 1 match
... got 0 — extractor rotted or surface removed`), not the 6 pass / 3 fail this task's brief
was written against. This is the same defect class as failure #2 (`extractOne` "rotted"),
now also hitting the ollama reference anchor — expected, not a T11 regression: T11's own edits
never touch `massa-ai-config.ts`, and the crash is byte-identical before and after T11's sweep.
Verified correct independently of the crashed instrument: an ad-hoc script replicating every
`PAIR_SURFACES`/`MODEL_ONLY_SURFACES`/`LMSTUDIO_MODEL_ONLY_SURFACES` regex for T11's 7 files
confirmed all 8 checks pass against the `qwen3-embedding:0.6b`/1024 reference (and that
`scripts/diagnose.ts`'s lmstudio line correctly stays `text-embedding-nomic-embed-text-v1.5`,
the `knownDimensions` table's first entry, which `referencePairLmStudio()` anchors on — not the
new default). `bun run test:scripts` → 2043 pass / 0 fail / 1 error (the same crash; no other
suite regressed). **T13 must re-anchor `referencePair()` to tolerate a derived (non-literal)
`model:`/`dimensions:` expression** — this is squarely its "re-anchor" mandate, not a narrower
fix than its task text already implies.

### T12: Repair `setup-local-first.sh` — ✅ Complete

Three literal sites under two variable names (`:338`, `:339`, `:500` — the last decides whether
LLM features get enabled at all, PDM-06 AC-3). The `:344` dedup guard
(`[ "$CODE_MODEL" != "$LLM_MODEL" ]`) flips from skip to pull because the new LM Studio instruct
and coding ids differ; add `lms load -c <role context>` per model and address the residency
question in design R-09.

Tests: test-setup-local-first-api-key.sh and test-lms-model-exists.sh against the new ids, including the :500 enable decision
Gate: bash scripts/tests/test-setup-local-first-api-key.sh && bash scripts/tests/test-lms-model-exists.sh
Depends on: T01.

**Execution note (2026-09-20).** Fixed a fourth site the task text's line numbers did not name:
`:337`'s `EMBEDDING_MODEL="${OLLAMA_EMBEDDING_MODEL:-qwen3-embedding:4b}"` — same conditional
block as `:338`/`:339`, and the literal a plain `setup-local-first.sh` run actually pulls and
writes for the embedding role (`installer_write_config` reads `EMBEDDING_MODEL` as a
wizard-resolved global, unlike `LLM_MODEL`/`CODE_MODEL`, which `installer_provider_defaults`
re-derives independently). Left unfixed it would have silently violated PDM-03 AC-1/P2 AC-1 for
this installer's embedding pull. Also fixed the LM Studio branch's `:334`/`:335`
`LLM_MODEL`/`CODE_MODEL` (`qwen/qwen3-4b-2507` for both → `qwen3-vl-8b-instruct` /
`qwen2.5-coder-7b-instruct`) — required for the `:344` dedup-guard flip design R-09 describes to
actually occur; leaving them at the old shared literal would have kept the guard skipping the
second pull. `scripts/lib/installer-api-key.sh`'s `installer_provider_defaults` already carried
the correct new ids for both providers (T08) — confirmed unaffected, not touched.
Added `lms load -c <context> --ttl 600` per LM Studio model, reusing the already-resolved
`$LMSTUDIO_CLI` (not a bare `command -v lms`, which misses the `~/.lmstudio/bin` case
`lms_cli_path()` exists to handle). **Design R-09 resolved by staggering, not sizing:** a flat
600s `--ttl` evicts an idle model instead of holding all three loaded forever, so peak residency
tracks actual usage rather than the sum of embedding(0.6B) + instruct(8B) + coding(7B). Marked
`ponytail:` — the 600s figure is not sized per model footprint; upgrade path is measuring real
VRAM per model and picking a role-specific TTL (or explicit `lms unload`) if idle memory
pressure is reported. Not executed (`lms` is not on this host's PATH; verified through the test
harness only, per instruction).
Added test coverage `scripts/tests/test-lms-model-exists.sh` did not have before: (1) the `:500`
enable decision, extracted by content anchor (line numbers drift) and exercised behaviorally
with a stubbed `inference_model_exists` — 4 cases (present/absent × default/explicit id) plus a
literal-currency check on the `qwen3-vl:8b` fallback; (2) the `:344` dedup-guard flip, asserted
on the LM Studio branch's actual `LLM_MODEL`/`CODE_MODEL` literals being distinct (skip→pull).
`test-setup-local-first-api-key.sh` needed no edits — its `EMBEDDING_MODEL`/`LLM_MODEL`/
`CODE_MODEL` values are test-supplied env overrides for `installer_write_config` (T07b/T08's
writer), not the wizard's own default-resolution literals this task changed.
Gate: `bash scripts/tests/test-setup-local-first-api-key.sh` → 40 pass / 0 fail (unchanged).
`bash scripts/tests/test-lms-model-exists.sh` → 64 pass / 0 fail (up from 57 — 7 new tests).
`bash -n scripts/setup-local-first.sh` → syntax OK.
Observed red (file copy, restored, `git status --porcelain` clean before commit, both re-ran
green): (1) reverted `:500`'s fallback to `qwen2.5:7b-instruct` → "the enable decision does not
fall back to qwen3-vl:8b — retired literal or extractor rotted" (63 pass / 1 fail); (2) reverted
the LM Studio branch's `LLM_MODEL`/`CODE_MODEL` to the shared old literal
(`qwen/qwen3-4b-2507`/`qwen/qwen3-4b-2507`) → "the LM Studio dedup guard still skips the code
model (qwen/qwen3-4b-2507 = qwen/qwen3-4b-2507)" (63 pass / 1 fail).
**`bun run test:scripts` cannot currently prove any shell suite** — a compound finding beyond
what T11's execution note already flagged. `package.json`'s `test:scripts` is
`bun test scripts/__tests__ scripts/tests/*.test.ts && for f in scripts/tests/*.sh; do bash
"$f" || exit 1; done`: the `&&` short-circuits on the first half's non-zero exit (the T03b-caused
parity crash), so **none of the 37 shell suites run at all** through this composed command —
not a subset, zero. Measured directly: `bun run test:scripts`'s own output contains no
"LM Studio installer surface" or "setup-local-first.sh API key provisioning tests" banner line.
Both of this task's shell suites were therefore verified by direct invocation
(`bash scripts/tests/<file>.sh`), not through the composed script. Ran all 39 `scripts/tests/*.sh`
directly for a full sanity net: 36 pass, 3 fail — `test-install-skills-cli.sh`,
`test-plugin-auto-install.sh`, `test-plugin-registry-registration.sh` — all pre-existing,
unrelated to this feature (a plugin/skills-installer host-detection issue: this host's own
Claude install is detected where the fixtures expect it absent), none touched by this batch.
**T13, or whoever fixes the parity-gate crash, should re-verify `test:scripts` actually reaches
the shell suites afterward** — that repair restores more than the one crashed file's tests.

### Phase 7 — Gates

### T13: Re-anchor and extend the parity gate — ✅ Complete

Re-anchor `referencePairLmStudio()` on `defaultModels.embedding` with a **by-key** width lookup —
the current brace-anchored regex silently returns entry #1 and this feature is what makes the
table multi-entry (design § Parity-gate re-anchoring). Add instruct and coding tiers with an
explicit per-row `expectedMatches`, so the two-match `setup-local-first.sh` case is a declared
value rather than an `extractOne` throw. Add a **narrow named Markdown tier** for the 7
non-history doc files; `.specs/` and `CHANGELOG.md` stay excluded as append-only history.
**Observed red per tier**, each on its own subject.

**Scope widened during Execute 2026-09-20.** The task text above names one of the defects that
keep this gate red; all of them were measured, and all must close here, because they share one
extractor design:

0. **The gate no longer fails — it crashes the whole file.** Re-measured on `18cc67fa` after T03b
   landed: `bun test scripts/__tests__/embedding-defaults-parity.test.ts` reports
   **0 pass / 0 fail / 1 error**, not the 6 pass / 3 fail recorded below on `319c7cbc`.
   `referencePair()` is called from the `describe()` body (`:249`), outside any `test()`, so its
   `extractOne` throw aborts the file before a single test runs — `massa-ai-config.ts model:
   expected exactly 1 match for /model:\s*"([^"]+)"/g, got 0`. Two consequences worth separating:
   the gate cannot report the defects below because it never reaches them, and **an aborted file
   reads as "no failures" to anything that only counts `fail`**. Fix the anchoring *and* move
   every reference resolution inside a test, so a rotted extractor fails loudly with a count
   instead of silently taking the whole suite with it.

1. **The `config-cli.ts` extractors require a quoted literal at the model/width position.** T07b
   replaced those literals with seam-derived property access, which is the change this feature
   exists to make — so the extractor now fails on the surface it is meant to watch. It fails two
   ways, and the second is the dangerous one: `init --lmstudio` throws `extractOne: ... got 0 —
   extractor rotted or surface removed`, while the ollama width-writer scan **silently matched the
   next branch's literal** and reported `mistral-embed/1024 across 2 writers`. A silent wrong match
   is indistinguishable from a pass. Re-key both to resolve the seam reference rather than to
   scrape a literal, and make "no literal found where a derived value is expected" a *declared*
   outcome, not a throw and not a silent slide to the next match.
2. **`referencePairLmStudio()` is anchored on `knownDimensions` entry #1** — the defect the
   original task text names. Re-anchor by key.
3. **`referencePair()` (ollama) reads `defaultMassaAiConfig.embedding`**, which T03b now derives
   from the seam. T13 must therefore run *after* T03b, not merely after T11.

T13 is also what flips **T07b** from ⚠️ Partial to ✅ Complete — T07b's implementation is verified
by its config-cli suites, but the parity clause of its Gate line is this task's subject.

Tests: one induced red per new tier and per dialect, each on its own subject, restored by file copy; plus a red proving the derived-value extractor reports a mismatch instead of silently matching an adjacent branch
Gate: bun test scripts/__tests__/embedding-defaults-parity.test.ts
Depends on: T11, T03b.

**Execution note (2026-09-20).** All four numbered defects closed — see `.specs/project/STATE.md`
for the full account. Gate: 14 pass / 0 fail (was 0 pass / 0 fail / 1 error). Also fixed six
one-line production gaps the repaired gate exposed (T11/T12-era misses, all mirroring an
already-corrected sibling line in the same file): `.env.example` and `setup-local-first.sh`'s LM
Studio embedding fallback, `installer-api-key.sh`'s no-checkout dims fallback, both provider
branches of `embeddings/config.ts`'s literal fallback, and `scripts/diagnose.ts`'s lmstudio
`DEFAULT_MODEL` row (plus its mirror assertion in `diagnose.test.ts`). Two pre-existing test-file
gaps left for T15: `lmstudio-embedding-live.test.ts` and `embeddings-config-file-layer.test.ts`
still assert the retired nomic/768 and `qwen3-embedding:4b` pairs.

### T14: Repoint the needles surfaces — ✅ Complete

Both `FLOORS` rows to explicit `null` with a calibration note naming this feature — recording that
the `ollama` row was **already unsatisfiable** (`14.needles.test.ts:161`) and that F-NEEDLE-2 and
F-NEEDLE-3 still assert. Separately, `.github/workflows/needles-gate.yml:88-108` pins
`qwen3-embedding:4b` three ways **plus a cache key**; swap all four.

Tests: the unknown-arm guard still throws; a null row takes the console-log path and F-NEEDLE-2/3 still assert
Gate: bun test packages/core/src/__tests__/e2e/14.needles.test.ts
Depends on: T11.

**Execution note (2026-09-20).** Both `FLOORS` rows set to `null` with a calibration note citing
this feature and the specific facts that invalidated each (ollama: 2560d→1024d model+algorithm
change, plus the pre-existing hit@5-caps-at-0.50-vs-0.64-floor gap the file already documented;
lmstudio: 768d nomic→1024d qwen3-embedding change). `needles-gate.yml`: all four pins swapped
(`ollama pull` command, `NEEDLE_MODEL` env assignment, cache `key`/`restore-keys`, and their
comments) from `qwen3-embedding:4b` to `qwen3-embedding:0.6b`; verified with `actionlint`.
This environment has no live Ollama/LM Studio/API stack (`bun test
packages/core/src/__tests__/e2e/14.needles.test.ts` → 0 pass / 2 skip / 0 fail, `READY=false`),
so the unknown-arm-guard/no-assert-path claims were verified two ways instead of by a live run:
(1) direct reading — the guard (`if (!(profile.id in FLOORS))`) and the two F-NEEDLE-2/3
assertion blocks are unconditional and sit textually before the `if (!floors)` branch, unaffected
by the value change from an object to `null`; (2) a throwaway script reproducing the exact
`FLOORS`/guard/branch shape with the real `null` values, run under `bun`, confirming `"ollama"`
and `"lmstudio"` both take the no-assert path and an unmapped id still throws. `bun run
type-check` and `bun run build` both green (6/6).

### T15: Repoint the tests the parity gate is forbidden to see — ✅ Complete

`isTestFile` (`:361`, `:437`) excludes every `__tests__`/`*.test.ts` from both completeness scans,
so ~16 files hardcoding `ollama:qwen3-embedding:4b:2560` or the 9-key `llm` object are invisible
to it — notably `embedding-fingerprint.test.ts`. Enumerate and repoint by hand; do not widen the
gate to cover tests, which legitimately pin specific models.

Tests: the repointed fingerprint and dimension assertions
Gate: bun test packages/core/src/__tests__/embedding-fingerprint.test.ts && bun run test
Depends on: T11.

**Execution note (2026-09-20).** Enumerated by hand with a 3-dialect cross-check (this host's
default `grep` — ugrep, honours `.gitignore` — plus `git grep -E` and BSD `/usr/bin/grep -E`; all
three agreed on every population) over five retired-literal patterns: `qwen3-embedding:4b`,
`qwen2.5:7b-instruct`, `qwen/qwen3-4b-2507`, `text-embedding-nomic-embed-text-v1.5`, and a bare
`2560` sweep to catch a dims-only reference with no adjacent model name. Union: 23 candidate
`*.test.ts` files (after excluding `embedding-defaults-parity.test.ts` itself and the two files
T13 already fixed, `diagnose.test.ts` and `installer-config-template.test.ts`).

**Population was verified behaviorally, not just textually**: every candidate was run (isolation
runner for `packages/core`, plain `bun test` with a scratch `XDG_CONFIG_HOME` elsewhere) to
distinguish a true positive (asserts the retired value as the *current default* — breaks under
today's code) from a false positive (uses the same literal as arbitrary mock/fixture data, or
asserts a still-valid fact about a named non-default model, e.g. nomic's own 768d width, which
design TD-7 keeps in the table on purpose). Exactly **2 of the 23 were true positives** — the
"~16" figure in `spec.md` R-07 and this task's own text was the design phase's unverified raw
grep count, not a behaviorally-confirmed one; the gap is the same over/under-scoping pattern this
feature has hit three times already (T03b/T06b/T07b), just in the conservative direction this
time (a smaller real population than estimated, not a missed one).

Repointed: `packages/core/src/__tests__/embeddings-config-file-layer.test.ts` ("no config file →
literal defaults" — the file's own comment calls this the shared-default alignment sensor) from
`qwen3-embedding:4b`/2560 to `qwen3-embedding:0.6b`/1024; `packages/core/src/__tests__/
lmstudio-embedding-live.test.ts` (`EXPECTED_MODEL`/`EXPECTED_DIMENSIONS` plus the same-numbers
inline comments and the live test's own name) from nomic/768 to `text-embedding-qwen3-embedding-0.6b`/1024
— its historical docstring paragraph (LIP-08's original AC text, at 768d) was left untouched as a
record of what the requirement said at the time.

Not touched, with reason: `embedding-fingerprint.test.ts` (R-07's own named example) — its
`qwen3-embedding:4b`/2560 pair is an arbitrary mock `activeProvider` value used to test fingerprint
*format/comparison* logic, unrelated to which model is the real default; changing it would not
change what the test proves. `embedding-dimensions.test.ts`'s nomic/768 assertions — testing that
the by-key/probe resolver correctly handles a specific, still-valid, non-default model (design
TD-7). `embeddings-config-file-layer.test.ts`'s other two tests, which use `qwen3-embedding-4b-ctx8k`/2560
as an arbitrary custom file-supplied override, not a default claim.

Gate: `bun test packages/core/src/__tests__/embedding-fingerprint.test.ts` → 14 pass / 0 fail
(unchanged — this file needed no repoint). `bun run test` → **12/12 tasks successful** (turbo's
own count, per CLAUDE.md's own guidance on trusting that line over a scrollback tail).
`bun run test:plugins` → 142 pass / 0 fail. `bun run test:scripts`'s bun-half (`bun test
scripts/__tests__ scripts/tests/*.test.ts`) → **2057 pass / 0 fail** (up from 2043 pass / 0 fail /
1 error pre-T13 — the crash is gone and 14 more tests now run). The composed `test:scripts`
script still exits 1 on the pre-existing `&&`/`exit 1` shell-loop short-circuit (out of this
batch's write set, per instruction) — it now reaches the shell loop at all (T13's fix restored
that), and stops at the first pre-existing failure, `test-install-skills-cli.sh`. Ran all 39
`scripts/tests/*.sh` directly to see past the short-circuit: **36 pass, 3 fail** — the same three
pre-existing, host-specific failures W6 already identified (`test-install-skills-cli.sh`,
`test-plugin-auto-install.sh`, `test-plugin-registry-registration.sh`), unchanged, not touched.

---

### Phase 8 — Documentation and close-out

### T15b: Make `bun run test:scripts` reach the shell half — ✅ Complete

**Added during Execute 2026-09-20 at the user's explicit decision, after W6 measured it.** The
script is:

```
bun test scripts/__tests__ scripts/tests/*.test.ts && for f in scripts/tests/*.sh; do bash "$f" || exit 1; done
```

The `&&` means that when the bun-test half exits non-zero, **the 37 shell suites never execute** —
while the command still prints the bun half's counts, which reads like a full run. The feature's
own Success Criteria name `bun run test:scripts` as evidence, so that evidence was partly unearned
for every phase before this one. It is a pre-existing structural gap, not one this feature
introduced; it stayed invisible until T13 stopped the parity gate from aborting.

Run both halves unconditionally and aggregate the exit codes, so a failure in either half is
reported with the other half's result still visible. Keep it one npm-script line if that stays
readable; a small runner script is acceptable if it does not.

**Expect this to turn `test:scripts` red on this host, and that is the point.** W6 and W7 both
measured the shell half directly: **36 of 39 pass**, with 3 pre-existing failures
(`test-install-skills-cli.sh`, `test-plugin-auto-install.sh`, `test-plugin-registry-registration.sh`)
caused by this machine's own Claude install, unrelated to this feature. Do **not** fix, skip, or
exclude those three to make the gate green — that would reintroduce the exact dishonesty this task
removes. Record them in `STATE.md` as a named host-specific residual, and make sure T17 does not
claim `test:scripts` green in the close-out.

Tests: the composed command runs the shell half even when the bun half exits non-zero
Gate: induce a bun-half failure by file copy, confirm shell-suite output still appears and the aggregated exit code is non-zero, restore by file copy, re-run
Depends on: T13.

**Result (W8, 2026-09-20).** `package.json`'s `test:scripts` no longer joins the two halves with
`&&`. It runs the bun half, captures its exit code, runs the shell for-loop in a subshell (so the
loop's own pre-existing `|| exit 1` — first-failure-stops, unchanged and out of this task's scope
— only exits the subshell), captures that exit code, and the script's own exit is non-zero only
if either half was non-zero: `bun test scripts/__tests__ scripts/tests/*.test.ts; s1=$?; (for f in
scripts/tests/*.sh; do bash "$f" || exit 1; done); s2=$?; [ $s1 -eq 0 ] && [ $s2 -eq 0 ]`.

Observed red (file copy, restored): backed up `scripts/__tests__/skill-doc-paths.test.ts`,
changed one assertion (`expect(code).toBe(0)` → `expect(code).toBe(999)`) to force a bun-half
failure, ran `bun run test:scripts`. Bun half reported `1 fail` for the mutated test; the shell
half still ran afterward and its output appeared (`test-install-skills-cli.sh`'s own suite output,
44 passed / 2 failed); aggregate exit was 1. Restored the file by copy; `git status --porcelain`
showed only `package.json` before the commit.

Re-ran the real gate with the file restored: bun half **2057 pass / 0 fail** (unchanged from
T15); shell half ran through the suites in order and stopped at the first of the three named
host-specific failures, `test-install-skills-cli.sh` (44 passed / 2 failed) — confirming the fix
did not touch the pre-existing per-suite `|| exit 1` behavior, only the half-to-half gate.
Aggregate exit: **1**. This is the expected, honest result — `bun run test:scripts` is red on this
host because of `test-install-skills-cli.sh`, `test-plugin-auto-install.sh`,
`test-plugin-registry-registration.sh` (all three re-confirmed failing when run directly, same as
T15's measurement), each caused by this machine's own Claude install and unrelated to this
feature. Not fixed, skipped, or excluded, per this task's own instruction.

### T16: Update the 7 non-history documentation surfaces

`README.md`, `FEATURES.md`, `docs/CHEATSHEET.md`, `docs/ONBOARDING.md`,
`apps/tools-api/OLLAMA_WSL_SETUP.md`, `benchmarks/llm-judge/README.md`,
`benchmarks/needles/README.md`. `CHANGELOG.md` and `.specs/` are append-only history and are
excluded by design.

**Scope addition during Execute 2026-09-20.** T13's Markdown tier checks membership and
completeness, **not doc prose values** — it cannot tell an updated doc from a stale one, so T16
still needs a real content pass over all seven. Two surfaces W7 found that no task owned are also
in scope here:

- **`.github/workflows/needles-gate.yml:11` and `:36`** carry `qwen3-embedding:4b` inside a
  rationale — "~60s/embed on a 2-core free runner (~90min for the fixture)" — which is the stated
  reason the gate is manual-only. The model changed; the figure did not, and it **cannot be
  re-measured from this worktree**. Do not fabricate a replacement number and do not delete the
  rationale. Attribute it: name the figure as measured on `qwen3-embedding:4b`, the previous
  default, and state it has not been re-measured for `qwen3-embedding:0.6b` — a smaller model, so
  the stated cost is an upper bound rather than a current reading. Same treatment as the judge
  fixtures: the literal stays because it is history, and the prose now says so.
- **`benchmarks/llm-judge/reports/llm-judge-baseline.md`** is a dated historical report that T13's
  Markdown tier found and excluded. `design.md` never named it beside the two "Must NOT change"
  fixtures. Add the one-line mention so the exclusion is stated rather than implied.

Tests: the narrow Markdown tier added in T13 covers each updated doc for membership; the prose pass is verified by reading, and every changed claim is either re-measured or explicitly attributed to the retired model
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
| PDM-03, PDM-04 | T03, T03b, T05, T07b | config-resolution unit test per provider; the written-config check for `embedding.model` + `dimensions` at the writer | pinning the global constant back; restoring `qwen3-embedding:4b`/2560 in a `use` branch |
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
