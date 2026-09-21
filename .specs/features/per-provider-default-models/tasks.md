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

### T16: Update the 7 non-history documentation surfaces — ✅ Complete

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

**Result (W8, 2026-09-20).** Read all seven docs plus the two named extra surfaces; updated
content in five of the seven (README.md, FEATURES.md, docs/CHEATSHEET.md, docs/ONBOARDING.md,
apps/tools-api/OLLAMA_WSL_SETUP.md) and left two unchanged after verifying their literals were
already correct or deliberately historical, not stale:

- **README.md** — setup-wizard comment block (Ollama/LM Studio model + dims), the manual
  `ollama pull`/`lms get` prerequisite commands, the `MASSA_AI_LLM_MODEL` env example
  (`qwen2.5:7b-instruct` → `qwen3-vl:8b`, matching `defaultMassaAiConfig.llm.model`'s new
  derivation from `INFERENCE_PROVIDERS.ollama.defaultModels.instruct`), the embeddings note
  paragraph (rewritten to name the new default, the breaking reindex requirement, and the
  unmeasured-retrieval-quality caveat), and the `massa-ai-config use`/`set` example.
- **FEATURES.md** — the Embedding Providers table, the `massa-ai-config` example block, the
  `MASSA_AI_LLM_ENABLED=true` example's `MASSA_AI_LLM_MODEL` line, and the config-reference
  table's `llm.model` default cell.
- **docs/CHEATSHEET.md** — the `massa-ai-config use` example and the Ollama/LM Studio embedding
  env-var defaults.
- **docs/ONBOARDING.md** — the one-line architecture table's Embeddings cell.
- **apps/tools-api/OLLAMA_WSL_SETUP.md** — both `ollama pull` command lines (doc is Portuguese;
  left the surrounding prose untouched, matching existing style, per coding-principles' "match
  existing style" and "don't touch what isn't in scope").

**Left unchanged, verified rather than assumed:**

- **`benchmarks/llm-judge/README.md`** — its `MASSA_AI_LLM_MODEL`/`qwen2.5:7b-instruct` and
  `MASSA_AI_LLM_CODE_MODEL`/`qwen2.5-coder:7b` defaults are `run.ts`'s own hardcoded literal
  fallbacks (`run.ts:257-258,278-280`), not reads of `defaultMassaAiConfig` — this standalone
  benchmark is deliberately pinned to the historical "qwen2.5 model swap" it measures (matching
  design.md's already-recorded "Must NOT change" fixtures), and the coding-role default
  (`qwen2.5-coder:7b`) did not change in this feature anyway. Verified by reading `run.ts`
  before deciding not to touch the README.
- **`benchmarks/needles/README.md`** — updated one factual claim (see below) but left
  `run.ts`'s own `NEEDLE_MODEL` default (`qwen3-embedding:4b`) undisturbed, because `run.ts` is
  a `.ts` file outside this doc-only task's write set and outside every other task's write set
  too (grepped; confirmed absent from `PAIR_SURFACES`/`MODEL_ONLY_SURFACES`/any parity-gate
  tier). **Fixed a now-false claim rather than leaving it:** the doc used to say `run.ts`'s
  default is "the same model as the E2E baseline" — true when both were written, false now that
  the E2E baseline (`14.needles.test.ts`) moved to `qwen3-embedding:0.6b`/1024d while `run.ts`
  stayed at `qwen3-embedding:4b`. Corrected the claim and added a "Known drift" note naming the
  gap, its cause, and the env override to run the harness against the current default — without
  touching the out-of-scope `.ts` literal itself. **SPEC_DEVIATION-adjacent finding, not a fix:**
  `benchmarks/needles/run.ts`'s own `NEEDLE_MODEL` default is stale and untouched by any task in
  this feature; recorded here and in `STATE.md` for T17's close-out.

**The two extra surfaces named in this task's scope addition:**

- `.github/workflows/needles-gate.yml:11` and `:36` — both rationale comments rewritten to name
  the ~60s/embed, ~90min-fixture figure as measured on the retired `qwen3-embedding:4b`, and to
  state plainly that `qwen3-embedding:0.6b` (a smaller model) has not been re-measured, so the
  figure is an upper bound. No fabricated number. Verified with `actionlint` (exit 0) — comment
  edits only, no structural YAML change.
- `benchmarks/llm-judge/reports/llm-judge-baseline.md` — read the report (dated
  `2026-07-12T15:47:09.981Z`, recording `qwen2.5:7b-instruct`/`qwen2.5-coder:7b` as the models in
  effect at that run). Added the one-line mention to `design.md`'s "Must NOT change" section,
  beside the two fixtures it was already grouped with in spirit but not in text.

Gate: `bun test scripts/__tests__/embedding-defaults-parity.test.ts` → **14 pass / 0 fail**
(unchanged from T13/T15b; Markdown tier population 8 tracked `.md` files, no offenders — the
membership check this tier runs cannot see the prose-value changes above, which is why this task
existed). `git status --porcelain` before commit: seven files
(`.github/workflows/needles-gate.yml`, `.specs/features/per-provider-default-models/design.md`,
`FEATURES.md`, `README.md`, `apps/tools-api/OLLAMA_WSL_SETUP.md`, `docs/CHEATSHEET.md`,
`docs/ONBOARDING.md`) plus `benchmarks/needles/README.md`, `tasks.md`, `STATE.md` — all within
this task's declared write set (the 7 docs + the two named extra surfaces + status updates).

### T17: Close out — ✅ Complete

`CHANGELOG.md` `### Changed` entry marked breaking, naming the required reindex; `.specs/project/STATE.md`;
`.specs/HANDOFF.md`; `.specs/project/FEATURES.json`. Then
`bun skills/massa-ai/scripts/check_specs_delivered.ts per-provider-default-models --root .`

Tests: none — close-out artifacts are checked by the delivery gate, not by a unit test
Gate: bun skills/massa-ai/scripts/check_specs_delivered.ts per-provider-default-models --root .
Depends on: T16.

**Result (W8, 2026-09-20).** `CHANGELOG.md` gained a `### Changed` entry under `[Unreleased]`
led with `**BREAKING —**` (matching the two existing precedents for that convention, `v1.9.0`'s
`RLM_LLM_*` rename and the random-vector-embedding entry, both read before writing this one),
naming the reindex requirement, the fingerprint fail-closed behavior, and that no migration is
built, plus two non-breaking bullets for the new per-provider instruct/coding defaults and the
5 new config fields with their field-level parity gate. No literal skip-ci marker anywhere in
this commit's message.

`.specs/project/STATE.md`'s `## Current` header updated to EXECUTE COMPLETE, and the T17
entry appended (never overwritten) with the honest Success Criteria breakdown, the two accepted
unmeasured risks, and every named residual.

`.specs/HANDOFF.md` **rotated, not replaced**: the prior "PLANNING COMPLETE" section's H1 was
renamed to `## Previous handoff` (its body left untouched beyond the heading and a one-clause
superseded-pointer), and a new `# Handoff` section was prepended with the finished model table,
the same honest Success Criteria breakdown, every named residual, and the carried-forward traps.

`.specs/project/FEATURES.json`'s row: `status: "complete"` (Execute complete — deliberately
distinct from independent-verification-complete), `phases.execute: true`, `validation: null`
(no `validation.md` exists — the Verifier has not run), `completed: "2026-09-20"`, `notes`
carrying the same honest breakdown as `STATE.md`/`HANDOFF.md`. Round-tripped the file through
`json.dumps(..., indent=2)` first and confirmed byte-identical to the original before editing,
to avoid a reformat-as-diff.

**Gate:** `bun skills/massa-ai/scripts/check_specs_delivered.ts per-provider-default-models
--root .` — run twice. Before this commit: **exit 1**, 2 errors (`HANDOFF.md`, `FEATURES.json`
uncommitted) — correct behavior, the gate catching artifacts written but not yet landed. After
this commit: **exit 0**, all 6 checked paths (`spec.md`, `design.md`, `tasks.md`, `STATE.md`,
`HANDOFF.md`, `FEATURES.json`) clean and tracked on HEAD.

**Reported honestly, per this task's own instruction — not a clean sweep:**
`bun run test:scripts` is red on this host (3 pre-existing, host-specific shell failures,
T15b); retrieval quality at the new 1024-dimension embedding width is unmeasured (accepted
risk, explicit user choice); T14's needles claims were verified statically, not by a live run
(no local inference stack in this environment — 0 pass / 2 skip / 0 fail, `READY=false`).
Independent verification (author ≠ verifier) has not run — that is the mandatory next step,
not part of this batch's scope per the orchestrator's own framing ("after you, an independent
verification agent runs").

**Named residuals recorded in `STATE.md`/`HANDOFF.md`/`FEATURES.json`:** the 3 host-specific
shell failures (T15b); `bun skills/massa-ai/scripts/lessons.ts list` destructively rewrites
`.specs/lessons.json` (measured 25→6 entries on a scratch copy this session, not re-run to
verify); T15's population discrepancy (design's "~16" estimate vs 2 behaviorally-confirmed true
positives); T13's SPEC_DEVIATION (6 pre-existing one-line production fixes outside its write
set); `benchmarks/needles/run.ts`'s stale `NEEDLE_MODEL` default, found during T16, outside
every task's write set and unscanned by the parity gate.

**Phase 8 closed. Execute closed. Feature status: EXECUTE COMPLETE, independent verification
pending.**

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

---

## Fix Pass 1 — from the independent verification (FAIL, 2026-09-20)

`validation.md` returned **FAIL**: 27/28 ACs traced, **PDM-02 AC-2 not met**, 2 spec-precision
gaps, and **16 mutations injected / 12 killed / 4 survived**. The verifier also found the fourth
instance of this feature's recurring defect class, which the Tasks header predicted and asked it
to look for. Nine fix tasks, in three batches. Iteration 1 of a maximum of 3 fix→re-verify rounds.

**The pattern held a fourth time, and this time in the gate as well as the code.** F1 is the
defect; F4 is why no sensor caught it. The parity gate's `DERIVED_SURFACES` table carries
`(use lmstudio, instruct/coding)` rows and **no `(use ollama, …)` counterparts** — the table was
enumerated from the implementation's subset rather than from the requirement's set, so it mirrors
the bug instead of catching it. Enumerate gate rows from the requirement.

### F1: `use ollama` must write the ollama instruct and coding ids — PDM-02 AC-2 — ✅ Complete

`apps/mcp-client/src/config-cli.ts:276-285` and `apps/opencode-plugin/src/config-cli.ts:280-289`.
The `lmstudio` branch assigns `config.llm.baseUrl`/`.model`/`.codeModel`; the `ollama` branch
assigns **none of the three**. Measured, both CLIs, scratch `XDG_CONFIG_HOME`: `init --lmstudio`
then `use ollama` yields `embedding.baseURL :11434` beside `llm.baseUrl :1234/v1`,
`llm.model qwen3-vl-8b-instruct`, `llm.codeModel qwen2.5-coder-7b-instruct`. Baselined on `main`:
the `baseUrl` leak pre-dates the feature, the **model leak is new**. The other three branches
(`init`, `init --lmstudio`, `use lmstudio`) are correct on both CLIs.

Tests: the Independent Test extended to the `use ollama` branch on both CLIs — all five values internally consistent for ollama after a provider switch away from lmstudio
Gate: bun test apps/mcp-client/src/__tests__/config-cli.test.ts && bun test apps/opencode-plugin/src/__tests__/config-cli.test.ts
Depends on: none.

**Resolution (2026-09-20).** Mirrored the lmstudio branch's three `config.llm.*` assignments
into the `ollama` branch of both CLIs (`config-cli.ts`), using
`INFERENCE_PROVIDERS.ollama.defaultLlmBaseUrl`/`.defaultModels.instruct`/`.defaultModels.coding`
— no hardcoded `baseUrl` literal. Added the switch-away regression test (`init --lmstudio` then
`use ollama`) to both `config-cli.test.ts` files, the case that exposed G0 (a fresh `use ollama`
on an already-ollama config can't observe the defect). Full provider × branch × CLI matrix
verified by direct CLI invocation under scratch `XDG_CONFIG_HOME`s (`init`, `init --lmstudio`,
`init --ollama`, `init`→`use ollama`, `init`→`use lmstudio`, `init --lmstudio`→`use ollama`) —
all six cells internally consistent on both CLIs. Gate: 36/0 (mcp-client), 32/0 (opencode-plugin).
Observed red: reverting `config.llm.codeModel` (mcp-client) and `config.llm.baseUrl`
(opencode-plugin) each failed the new switch-away test on the exact field removed; restored by
file copy, `git status` clean, re-run green.

Provisioning note (not part of this task's scope, but required before any gate in this worktree
could run): `packages/shared/dist/` was stale — missing `defaultModels` on the `lmstudio` entry
of `INFERENCE_PROVIDERS`, present only on `ollama` — causing every `config-cli.test.ts` run to
fail with `TypeError: undefined is not an object (evaluating
'INFERENCE_PROVIDERS.lmstudio.defaultModels...')` regardless of this task's fix. Ran
`cd packages/shared && bun run build` to regenerate `dist/` from current `src/`; no source file
was edited to fix this.

### F2: `/api/v1/system/ollama` must stop reporting the retired default — PDM-03 AC-1 — ✅ Complete

`apps/tools-api/src/routes/system.ts:185` reads `process.env.OLLAMA_EMBEDDING_MODEL ||
"qwen3-embedding:4b"` and **ignores `config.embedding.model` entirely**.
`apps/tools-api/src/routes/system.test.ts:148` asserts `toBe("qwen3-embedding:4b")`, which is why
`bun run test` is green over a wrong value — the test pins the defect as the contract. `git log -L
185,185` shows the line was last touched by `ceaa275d "chore(defaults): sweep qwen3-embedding:4b
across surfaces"`, so it is a **known member of the sweep population** that fell between T11 (bash
and env surfaces), T15 (scoped to `*.test.ts`) and T16 (7 docs). Resolve config first, then env,
then the seam; repoint the test to the spec-defined outcome, not to the current behaviour.

Tests: the route reports the configured model when config names one, and the seam default otherwise
Gate: bun test apps/tools-api/src/routes/system.test.ts
Depends on: none.

**Resolution (2026-09-20).** Added `resolveConfiguredOllamaEmbeddingModel()` in `system.ts`:
`loadRawUserConfig().embedding?.model` (the raw, no-defaults-folded-in file read — a merged
`loadConfigSafe()` read would always return a value and starve the env/seam fallbacks) ||
`process.env.OLLAMA_EMBEDDING_MODEL` || `INFERENCE_PROVIDERS.ollama.defaultModels.embedding`,
exactly the config → env → seam order this task specifies. The old test asserting
`toBe("qwen3-embedding:4b")` pinned the defect as the contract — repointed to assert the seam
value and added two new cases (config wins over both env and the seam; env wins over the seam
when config names nothing), per an explicit `SPEC_DEVIATION` note below. Test file gained a
`mock.module("@massa-ai/shared/config", …)` override for `loadRawUserConfig` (mirroring the
existing `@massa-ai/shared` mock) so the three cases are deterministic and never touch a real
`config.json`.

SPEC_DEVIATION: none in the fix itself — the test-assertion change is the one Execute-sanctioned
exception (a test that pins a known defect as the contract), called out per the Test Integrity
rule rather than changed quietly.

Gate: `bun test apps/tools-api/src/routes/system.test.ts` → 13 pass / 1 fail, 14 total (was 11
pass / 1 fail, 12 total before this task — the 3 new `/ollama` tests replace 1). **The 1 failure
is pre-existing and out of scope**: `LocalHealthChecker.checkOllama — provider-aware probe (LIP-10)
> a genuine Ollama /api/tags body is reported available with its models`, confirmed failing
identically on the pre-fix file via `git stash` (same assertion, same line, `available: false`
received instead of `true`) — a real-class probe/fetch-mock test unrelated to `configuredModel`
resolution, not named in this task's scope, not touched. Observed red: reverting
`resolveConfiguredOllamaEmbeddingModel()`'s call site to the old literal failed both new
config-precedence tests exactly as expected (seam-default test got `qwen3-embedding:4b`;
config-wins test got `from-env` instead of `from-config-json`); restored by file copy, `git
status` clean, re-run 13/14 green (same 1 pre-existing failure).
`apps/tools-api` `bun run type-check` clean.

### F3: `installer_provider_defaults` must not clobber an explicit `MASSA_AI_LLM_MODEL` — ✅ Complete

`scripts/lib/installer-api-key.sh:205-206,214-215`, called at `:312` from
`installer_write_config`, which `setup-local-first.sh:576` invokes **after** `:334-339` has already
honoured the user's override. The wizard pulls, loads and announces one model and then writes
another. **Not an AC failure — a silent regression this feature introduced**, so it does not get to
wait for a later feature.

Tests: an explicit MASSA_AI_LLM_MODEL survives installer_write_config; the default still applies when unset
Gate: bash scripts/tests/test-setup-local-first-api-key.sh && bun test scripts/__tests__/installer-config-template.test.ts
Depends on: none.

**Resolution (2026-09-20).** `installer_provider_defaults`'s `LLM_MODEL`/`CODE_MODEL`
assignments now read `${MASSA_AI_LLM_MODEL:-<provider literal>}` /
`${MASSA_AI_LLM_CODE_MODEL:-<provider literal>}` in both the `lmstudio` and default (`ollama`)
branches, instead of the unconditional literal. This targets the actual override signal
(the stable env var `setup-local-first.sh:334-339` already reads) rather than the mutable
`LLM_MODEL`/`CODE_MODEL` globals themselves — preserving the existing "no cross-call leak"
invariant the function's own docstring records (a second `installer_write_config` call in the
same shell, for a different provider, must not inherit the first call's derived model), since
neither branch reads the previous call's `LLM_MODEL`/`CODE_MODEL` value at all.

Found and fixed while implementing: `scripts/tests/test-setup-local-first-api-key.sh` pre-set
`LLM_MODEL="qwen3:8b"`/`CODE_MODEL="qwen3-coder:30b"` as globals, then asserted
`"$CODE_MODEL" == json_field(...)` **after** `installer_write_config` ran — but
`installer_provider_defaults` reassigns the same global `CODE_MODEL` as a side effect, so the
assertion compared the post-call value against itself and passed regardless of what the file
actually held (a default-shares-the-success-branch shape). This is exactly why G5 shipped
undetected. Removed the shallow assertion and the now-inert `LLM_MODEL`/`CODE_MODEL` presets
(orphaned by this fix — they are outputs of `installer_provider_defaults`, never inputs, per the
function's own pre-existing docstring); added a dedicated subshell-isolated block asserting both
the override-survives and default-still-applies cases for `llm.model` and `llm.codeModel`.

Gate: `bash scripts/tests/test-setup-local-first-api-key.sh` → 43/0 (was 40/0 — net +3: one
shallow assertion removed, four real ones added). `bun test
scripts/__tests__/installer-config-template.test.ts` → 34/0 (unchanged, already green).
Observed red: restoring the unconditional literal assignment failed exactly the two new
override-survives assertions (`expected 'custom-instruct-model', got 'qwen3-vl:8b'` and the
codeModel equivalent); restored by file copy, `git status` clean, re-run 43/0 and 34/0 green.

### F4: The parity gate must enumerate rows from the requirement, not the diff — PDM-05 AC-1 — ✅ Complete

Two population defects, one cause:

- `DERIVED_SURFACES` has no `(use ollama, instruct)` / `(use ollama, coding)` rows, so F1 was
  invisible to a gate whose whole purpose is to see it. Add the missing rows for **every**
  provider × branch × role × CLI combination the requirement names, and derive that list from
  PDM-02 AC-2 rather than from what the code currently assigns.
- There is **no instruct/coding completeness scan** outside the `.md` tier, and
  `process.env.X || "literal"` is excluded from the scan population (`:592`). M16 survived: a bogus
  default injected there left the gate at 14/0. A `process.env.X || "literal"` is **both a read and
  a default declaration**; excluding env reads carves a real writer out of the gate's own
  population. F2's defect lives in exactly that shape.

**Observed red required per new row and per new scan**, each on its own subject, naming the surface.

Tests: one induced red per added row and per the new completeness scan; a red proving the env-default shape is now in population
Gate: bun test scripts/__tests__/embedding-defaults-parity.test.ts
Depends on: F1, F2.

**Resolution (2026-09-20).** Row set derived from PDM-02 AC-2 ("any installer or config CLI
writes config.json for a provider ... SHALL write that provider's three model ids"): every
provider (ollama, lmstudio) × branch (`init --lmstudio`, `use ollama`, `use lmstudio`) × role
(embedding model, embedding dims, instruct, coding) × CLI (mcp-client, opencode-plugin) that
writes via property access rather than a config-cli literal. Added the two missing
`DERIVED_SURFACES` rows — `(use ollama, instruct)` and `(use ollama, coding)` — per CLI (4 new
entries; 24 → 28 structural rows), closing the exact gap G0 exploited.

Narrowed the Tier-3 completeness scan's `process.env` exclusion from a blanket
`line.includes("process.env")` skip to a bare-read check (`isBareEnvRead`/`envLiteralDefaultFor`):
a `process.env.TOKEN` mention with no `||`/`??` literal fallback stays invisible by design
(LIP-24), but the same mention followed by `||`/`??` and a quote/digit literal is now flagged as
a default declaration — exactly F2's original defect shape
(`process.env.OLLAMA_EMBEDDING_MODEL || "qwen3-embedding:4b"`). Scoped per-scan to its own token
(embedding vs instruct/coding) so an unrelated `process.env.X || "..."` on a neighbouring line
(e.g. `OLLAMA_BASE_URL`) is never misattributed.

Added a second completeness scan, "no unlisted tracked file assigns a `*_LLM_MODEL/CODE_MODEL`
default" — the instruct/coding half never had one outside the narrow Markdown tier. Population:
20 tracked files mention the token; known/reviewed set is `INSTRUCT_CODING_SURFACES`'s 4 files
plus `packages/shared/src/config/index.ts`/`index.ts` (the seam-derived production reader and its
barrel export), `docker-compose.yml` (empty passthrough), `turbo.json` (bare passthrough
allowlist), and `benchmarks/llm-judge/run.ts` (a deliberately provider-independent benchmark
judge-model default, reviewed, not a PDM-02 AC-2 writer).

Found and fixed while implementing (pre-existing, not this task's defect, in this task's own
gate file): F3 (Batch 1, already committed) changed `installer-api-key.sh`'s
`LLM_MODEL="literal"` shape to `LLM_MODEL="${MASSA_AI_LLM_MODEL:-literal}"`, which silently broke
`INSTRUCT_CODING_SURFACES`'s extractor regex (it started capturing the whole `${...}` expression
instead of the literal) — confirmed red at HEAD before this task's own edits. Re-anchored the
extractor on the new shape, mirroring `setup-local-first.sh`'s existing `${MASSA_AI_LLM_MODEL:-...}`
pattern; the expected values are unchanged.

Gate: `bun test scripts/__tests__/embedding-defaults-parity.test.ts` → 15/15 (was 14/14). `bun
run lint` clean.

Observed red, per subject:
- `(use ollama, instruct)`/`(use ollama, coding)` rows, both CLIs: reverting either
  `config.llm.model`/`config.llm.codeModel` assignment in the `ollama` branch to a bogus literal
  failed the "derived (structural) config-cli.ts surfaces" test, naming both offending rows by
  label (`... (use ollama, instruct)`/`(use ollama, coding)`) with "seam derivation missing,
  reverted to a literal, or extractor rotted".
- Embedding completeness scan (M16's class): reproducing F2's original defect shape in
  `system.ts` (`return process.env.OLLAMA_EMBEDDING_MODEL || "totally-bogus-model:99b";`) failed
  "no unlisted tracked file assigns a `*_EMBEDDING_MODEL/DIMENSIONS` default", naming
  `apps/tools-api/src/routes/system.ts` and the exact offending line.
- Instruct/coding completeness scan (new tier): injecting
  `const _F4_PROBE = process.env.MASSA_AI_LLM_MODEL || "totally-bogus-instruct:1b";` into
  `packages/core/src/services/memory/llm-client.ts` (a file with zero prior mentions of the
  token) failed "no unlisted tracked file assigns a `*_LLM_MODEL/CODE_MODEL` default", naming the
  file and the injected line.

All four mutations restored by file copy; `git status` clean before commit; re-run 15/15 green
each time.

SPEC_DEVIATION: none — the `installer-api-key.sh` extractor fix is a sensor-fidelity correction
in this task's own gate file (F3's syntax change broke the regex, not the assertion's target
value), not a deviation from F4's own scope.

### F5: Sense the production `llm.*` config reader — PDM-12 AC-2 — ✅ Complete

`packages/shared/src/config/index.ts:781,783,785`. Mutations M12a/b/c each survived **both**
`bun test packages/shared/src` (945/0) and `llm-client.test.ts` (74/0). Cause: `config.get("llm")`
always returns a populated `defaultConfig.llm`, so `_resolveLlmConfig`'s `cfg?.X ??` fallbacks —
which M10/M11 do kill — are dead in production. The three tests that look like coverage
(`config-loader.test.ts:248-265`) exercise `loadConfig()`, **a different function on a different
type**. Add a test against the production reader itself; a passing test on the loader is not a
test of the reader.

Tests: the three llm.* fields resolved through the production reader, each killing a mutation that M12a/b/c survived
Gate: bun test packages/shared/src/config/__tests__/ && bun test packages/core/src/__tests__/llm-client.test.ts

**Resolution (2026-09-20).** Added a new describe block to
`packages/shared/src/config/__tests__/llm-env-prefix.test.ts` (the file already exercising
`config.get("llm")` in an isolated subprocess) rather than `config-loader.test.ts` or
`llm-client.test.ts` — neither reaches the actual production call path. `contextWindow`/
`codeContextWindow`/`codeTemperature` take no env var of their own (per the existing `KNOBS`
comment), so `config.json` is the only way to reach `defaultConfig`'s
`fileConfig.llm?.X ?? INFERENCE_ROLE_DEFAULTS...` fallback at `index.ts:781,783,785`. The new
test writes a real `config.json` with probe values for all three fields, spawns a subprocess that
imports `config/index.ts` fresh and reads `config.get("llm")` (the exact call `getLlmConfig()`
makes in production), and asserts each field equals the probe — proving config wins over the
seam default through the real reader, not a synthetic `cfg` object. A second test asserts the
seam default applies when config.json sets none of them (negative control).

Gate: `bun test packages/shared/src/config/__tests__/` → 270/0 (was 268/0), `bun test
packages/core/src/__tests__/llm-client.test.ts` → 74/0. Both run with a scratch
`XDG_CONFIG_HOME` (a pre-existing, unrelated flake in a sibling file within the same directory —
observed 1/9 runs — and a pre-existing real-config read/write from a sibling file's own
defensive-fallback test were both confirmed present identically before this task's edit and out
of scope; the real `~/.config/massa-ai/config.json` mtime was confirmed unchanged before and
after). `packages/shared` `bun run build` (its `tsc` type-check) clean.

Observed red — M12a/b/c re-injected one at a time, each restored by file copy before the next:
- M12b (`index.ts:781`, dropped `fileConfig.llm?.contextWindow ??`): new test failed on
  `contextWindow` — expected `12000`, got `16384` (the seam default).
- M12a (`index.ts:783`, dropped `fileConfig.llm?.codeContextWindow ??`): failed on
  `codeContextWindow` — expected `40000`, got `32768`.
- M12c (`index.ts:785`, dropped `fileConfig.llm?.codeTemperature ??`): failed on
  `codeTemperature` — expected `0.66`, got `0` (`INFERENCE_ROLE_DEFAULTS.coding.temperature`, the
  seam default, confirming config.json is bypassed exactly as M12a/b were).

All three restored by file copy; `git status` clean before commit; re-run 7/7 (this file) and
74/74 green after each restore.

SPEC_DEVIATION: none.

Depends on: none.

### F6: `test:scripts` must report every failing shell suite, not the first — ✅ Complete

T15b fixed the `&&` between the halves; the intra-half `|| exit 1` remains, so the run aborts at
suite **16 of 39** and reports 1 failing suite. Running all 39 with no early exit gives **3 suites
/ 22 cases** failing (`install-skills-cli` 2, `plugin-auto-install` 16,
`plugin-registry-registration` 4). The "3 failing suites" figure in this feature's artifacts
therefore **could not have come from the gate as wired** — it came from a manual run. A gate that
reports one third of its failures is the same defect T15b was written to remove, one level down.
Collect every suite's result and report them together.

The three failures are **verified host-specific**: identical counts measured on `main` in the
primary checkout. Do not fix, skip or exclude them.

Tests: a run with two failing shell suites reports both
Gate: induce a second shell-suite failure by file copy, confirm both are reported and the exit code is non-zero, restore by file copy
Depends on: none.

**Resolution (2026-09-20).** Extracted the shell-suite loop out of `package.json`'s inline
`test:scripts` line into a new script, `scripts/run-shell-suites.sh`: it runs every
`scripts/tests/*.sh` suite unconditionally (no `|| exit 1` per iteration), collects the names of
every suite that failed, prints them together as one list, and exits non-zero only if that list
is non-empty. `package.json`'s `test:scripts` now delegates to it (`bash
scripts/run-shell-suites.sh`) instead of the inline for-loop, keeping T15b's own half-to-half
aggregation (`s1`/`s2`/`[ $s1 -eq 0 ] && [ $s2 -eq 0 ]`) unchanged — this task's fix is entirely
inside the shell half, per its own scope.

Gate (full 39-suite run, `bash scripts/run-shell-suites.sh` — the real `test:scripts` shell half):
**3 of 39 suites failed, exactly the named ones** — `test-install-skills-cli.sh` (44 passed / 2
failed), `test-plugin-auto-install.sh` (194 passed / 16 failed), and
`test-plugin-registry-registration.sh` (43 passed / 4 failed) — 22 failing cases total, matching
this feature's own artifacts exactly, and now **produced by the gate itself** rather than a manual
run. All 39 suites ran to completion (no early exit); aggregate exit code **1**.

Observed red (second failure, induced by file copy): backed up
`scripts/tests/test-setup-wizard-db-selection.sh` (a suite that was passing at 11/0), inserted one
`assert_contains` call for a token that does not exist in `setup-local-first.sh`
(`ZZZ_NONEXISTENT_TOKEN_F6_PROBE`), confirmed the mutated suite alone now fails (11 passed / 1
failed, exit 1), then re-ran the full 39-suite gate. Result: **4 of 39 suites failed** — the same
3 host-specific suites plus `test-setup-wizard-db-selection.sh`, all four named together in one
`FAILED SHELL SUITES` list — aggregate exit **1**. Restored the suite file by file copy; re-ran it
alone (11 passed / 0 failed, exit 0); `git status --porcelain` showed only this task's intended
changes (`package.json`, the new `scripts/run-shell-suites.sh`, plus this file).

SPEC_DEVIATION: none.

### F7: `scripts/diagnose.ts:22` docblock still names the retired LM Studio default — ✅ Complete

Lines 21 and 128-129 were repointed; `:22` still says
`text-embedding-nomic-embed-text-v1.5`. Invisible twice over: the extractor only reaches the
table, and the file sits in the Tier-3 `known` set.

Tests: covered by F4's widened scan if the docblock falls in its population; otherwise verified by reading
Gate: bun test scripts/__tests__/embedding-defaults-parity.test.ts && bun test scripts/__tests__/diagnose.test.ts
Depends on: F4.

**Resolution (2026-09-20).** Repointed `scripts/diagnose.ts:22` from
`text-embedding-nomic-embed-text-v1.5` to `text-embedding-qwen3-embedding-0.6b`, matching the
`DEFAULT_MODEL` table at `:129` and the docblock's own Ollama line at `:20`.

**F4's scan does not cover this shape — confirmed by evidence, not assumed.** `scripts/diagnose.ts`
is a member of `MODEL_ONLY_SURFACES` (line 22 lists it, via a note explaining it is hand-pinned
because it is keyed on the provider id rather than a `*_EMBEDDING_MODEL` token) and
`LMSTUDIO_MODEL_ONLY_SURFACES`, and both arrays feed the `known` set the
`*_EMBEDDING_MODEL/DIMENSIONS` completeness scan (F4's own widened tier) skips outright
(`if (known.has(f) || ...) continue;`). The completeness scan's own regex extractors
(`/^ {2}ollama: "([^"]+)",$/gm` / `/^ {2}lmstudio: "([^"]+)",$/gm`) only reach the `DEFAULT_MODEL`
table's two lines — the docblock's prose line 22 matches neither anchor. So `diagnose.ts` being
"known" means the file is excluded from the very scan whose job is to catch an unlisted stale
value, and the two by-value extractors that do reach the file never touch line 22 at all.

Whole-docblock check: read the full comment block (lines 2-24) against current behaviour. Line 22
was the only stale claim — no instruct/coding token or other retired model id appears anywhere
else in the file (`grep` for `nomic`, `qwen2.5-coder`, `qwen3-vl`, `instruct`, `coding`,
`codeModel`, `LLM_` returned only line 22's original text; `diagnose.ts` has no instruct/coding
surface at all, only embedding).

Gate: `bun test scripts/__tests__/embedding-defaults-parity.test.ts` → 15/15 (unchanged).
`bun test scripts/__tests__/diagnose.test.ts` → 33/33 (unchanged; its "nomic" mentions are an
unrelated mock model id for a probe test, not an assertion on the docblock).

Observed red: reverted line 22 only (by line number, not a global replace, so the real table's
line 129 was never touched) to `text-embedding-nomic-embed-text-v1.5` and re-ran both gates —
both stayed fully green (15/15 and 33/33), confirming neither sensor senses this line. Restored
by file copy; `git status --porcelain` showed only the intended one-line change.

SPEC_DEVIATION: none.

### F8: `config-sections.ts:128` documents behaviour PDM-01 AC-5 reversed — ✅ Complete

The `codeModel` Portal guide still reads "When empty, falls back to the primary model". PDM-01
AC-5 requires the fallback to be that provider's **coding** default, never the instruct model —
and the instruct default is now a vision-language model, so the guide advises the exact failure
T05 was written to close.

Tests: the golden render reflects the corrected guide string
Gate: bun test apps/web-ui/src/__tests__/
Depends on: none.

**Resolution (2026-09-20).** `apps/web-ui/src/static/views/config-sections.ts:128`'s `codeModel`
guide changed from "Model used for code-related tasks. When empty, falls back to the primary
model." to "Model used for code-related tasks. When empty, falls back to that provider's coding
default (e.g., `qwen2.5-coder:7b` for Ollama, `qwen2.5-coder-7b-instruct` for LM Studio), never
the primary model." — matching `INFERENCE_PROVIDERS.{ollama,lmstudio}.defaultModels.coding` and
the `model` field's own existing "e.g., ... for Ollama, ... for LM Studio" phrasing one row above.

**All-guide-strings scan.** Read every `guide:` string in the file (111 fields across 17
sections) against current behaviour. The `embedding.model` (line 47), `embedding.dimensions`
(line 50), and `llm.model` (line 127) examples were already corrected by T09 (PDM-13) and remain
current: `qwen3-embedding:0.6b`/`text-embedding-qwen3-embedding-0.6b`, `1024`, and
`qwen3-vl:8b`/`qwen3-vl-8b-instruct` all match `INFERENCE_PROVIDERS`' live values. `llm.contextWindow`
(16384), `llm.codeContextWindow` (32768), and `llm.codeTemperature` (0.0) match
`INFERENCE_ROLE_DEFAULTS.instruct.contextWindow`/`.coding.contextWindow`/`.coding.temperature`
exactly. `codeModel` (line 128) was the only offender.

**Golden regeneration — predicted before running, diffed after.** Predicted: only
`renderConfig/read` and `renderConfig/write` would change (the two cases that render the `llm`
section), by exactly the `codeModel` guide substitution, HTML-escaped (`'` to `&#39;`, backticks
to `<code>...</code>`, matching every other guide string's existing rendering) — no case added or
removed, no other byte touched.

Regenerated with `MASSA_AI_WRITE_GOLDEN=1 bun test src/__tests__/render-golden.test.ts` from
`apps/web-ui/`. Diffed the 88-case fixture programmatically: exactly 2 keys changed
(`renderConfig/read`, `renderConfig/write`; +145 bytes each), 0 added, 0 removed, 86 untouched.
Both changed cases are a pure insertion — old and new share an identical prefix ending at "falls
back to " and an identical suffix starting at "the primary model.</dd>..."; the only new bytes are
"that provider's coding default (e.g., `qwen2.5-coder:7b` for Ollama, `qwen2.5-coder-7b-instruct`
for LM Studio), never " (HTML-escaped in the rendered output). Every changed byte is accounted for
by the predicted change; no unexplained diff line. Logged as regeneration entry 4 in
`render-golden.test.ts`'s "Deliberate regenerations" header.

Gate: `bun test src/__tests__/` (from `apps/web-ui/`) → 784/0 (was 782/2 before the fix — the 2
failures were exactly `renderConfig/read` and `renderConfig/write`, naming the stale string).
`bun run type-check` (apps/web-ui) clean. `bun run lint` (root oxlint) clean.

Observed red: ran the gate with the guide-text fix applied but the golden fixture still frozen at
its pre-fix content — `renderConfig/read` and `renderConfig/write` failed with
`expect(received).toBe(expected)`, both naming the exact stale-vs-corrected byte span quoted above.
Regenerated the golden (the correct fix for a golden fixture, not a revert) rather than reverting
the source change; re-ran green at 784/0.

SPEC_DEVIATION: none.

### F9: Correct the feature's status claim and record the verification outcome — ✅ Complete

`.specs/project/FEATURES.json` records `status: "complete"` with `validation: null`, written
before the verifier ran. The run does not support it. Move it to `needs_fix` (or this registry's
equivalent), point `validation` at `validation.md`, and clear `completed` until a PASS exists.
Update `STATE.md` and `HANDOFF.md` with the FAIL verdict, the 4 surviving mutants, and the nine
fix tasks. **Run this task last**, after F1-F8, so it records the post-fix state.

Tests: none — the delivery gate is this task's check
Gate: bun skills/massa-ai/scripts/check_specs_delivered.ts per-provider-default-models --root .
Depends on: F1, F2, F3, F4, F5, F6, F7, F8.

### F2b: Correct F2's precedence — it was specified backwards — ✅ Complete

**This is an orchestrator error, not the implementer's.** F2's task text above says "Resolve
config first, then env, then the seam". That inverts this project's documented convention, and
FW1 implemented it exactly as written while flagging the divergence — the right call on their
side.

The convention is `env > config.json > literal defaults`, stated in `CLAUDE.md:321`, restated for
this feature in `design.md:51` and `design.md:268` ("resolution is already env > file > default,
so a written field wins by construction"), and again in T02's own text ("Resolution stays env >
file > role-table default"). `packages/core/src/services/embeddings/config.ts` and A-05 follow it.
Shipping one route with inverted precedence would make `/api/v1/system/ollama` the only surface in
the codebase where an env var loses to a config file.

`apps/tools-api/src/routes/system.ts` — reorder `resolveConfiguredOllamaEmbeddingModel()` to
`process.env.OLLAMA_EMBEDDING_MODEL` → `loadRawUserConfig().embedding?.model` → the seam default.
Keep everything else F2 delivered: the raw-config read (no defaults folded in), the
`mock.module` seam that keeps the tests off a real `config.json`, and the repointed assertion.
F2's second test currently asserts `'from-config-json'` beats `'from-env'`; that expected value is
wrong against the convention and must be inverted with it — the test encodes the spec, and the
spec here is the documented precedence.

Tests: env beats a config.json value; config.json beats the seam default when no env var is set; the seam default applies when neither is present
Gate: bun test apps/tools-api/src/routes/system.test.ts && bun run type-check
Depends on: F2.

**Resolution (2026-09-20).** Reordered `resolveConfiguredOllamaEmbeddingModel()` in
`apps/tools-api/src/routes/system.ts` to `process.env.OLLAMA_EMBEDDING_MODEL` →
`loadRawUserConfig().embedding?.model` → `INFERENCE_PROVIDERS.ollama.defaultModels.embedding`.
Inverted F2's second test (`'from-config-json'` beating `'from-env'`) to assert env wins,
per this task's explicit sanction — the test encoded the orchestrator's inverted spec, not a
genuinely-wrong assertion changed quietly. Added a third case (config.json beats the seam
default when no env var is set) so the three-tier precedence in "Tests" above is fully covered.

Gate: `bun test apps/tools-api/src/routes/system.test.ts` → 13 pass / 1 fail, 14 total — the 1
failure is the same pre-existing `LocalHealthChecker.checkOllama` real-class probe test named in
F2's own resolution note, confirmed unchanged. `bun run type-check` (apps/tools-api) clean.
Observed red: reverting to config-first order failed exactly the new "env wins" test
(`system.test.ts:181`, expected `from-env`, got `from-config-json`); restored by file copy,
`git status` clean, re-run 13/14 green (same 1 pre-existing failure).

SPEC_DEVIATION: none — the inverted test value is this task's own explicitly sanctioned
exception, not a deviation from it.

---

## Fix Pass 2 — from round-2 verification (FAIL, 2026-09-20)

Round 2 measured real progress: **28/28 ACs met and traced**, **9 of round 1's 10 gaps confirmed
closed** by re-injecting each original defect, and **16 mutations injected / 15 killed / 1
survived**. It also found four new defects. Six fix tasks. **This is iteration 3 of the bounded
fix→re-verify loop's maximum of 3** — if round 3 does not pass, the feature stops as `Blocked` and
goes to the user rather than looping again.

**G1 is the fifth instance of this feature's dominant defect class, and it is the orchestrator's
error twice over.** T06b's task text specified `config ?? env ?? default`, and F2's task text
specified the same inversion for a different file. F2b corrected one of them. The other shipped.
Its own rationale — "would make this the only surface where an env var loses to a config file" —
now describes `_resolveEmbedContextWindow`. Implementers followed both texts literally, which was
correct of them.

### G1: Restore env-over-config in `_resolveEmbedContextWindow` — design conformance ✅ Complete

`packages/core/src/services/embeddings/provider.ts:39-49` returns
`embeddingConfig?.contextWindow ?? parsePositiveIntEnv(process.env.OLLAMA_EMBEDDING_NUM_CTX, …)`
— config beats env. `CLAUDE.md:320-321` documents `env > config.json > literal defaults`, and
`design.md:268` says of this very feature "**No precedence machinery changes** — resolution is
already env > file > default", which is now false about its own code. Its ~10 sibling resolvers in
`services/embeddings/config.ts` are all env-first. `OLLAMA_EMBEDDING_NUM_CTX` is a shipped knob
(`.env.example:211`).

Three artifacts encode the inversion and all three move together: the resolver, the docblock at
`:36-37` that states it, and `packages/core/src/__tests__/embeddings-provider.test.ts:469-471`,
which asserts `_resolveEmbedContextWindow({contextWindow:12000})` is `12000` with
`OLLAMA_EMBEDDING_NUM_CTX="20000"` set — **a test asserting the divergence as the contract**, the
same shape as the retired-literal assertion F2 had to repoint. Changing it is sanctioned because it
encodes the wrong spec; say so explicitly rather than editing it quietly.

Tests: env beats a config value; config beats the role-table default when no env var is set; the role-table default applies when neither is present
Gate: bun test packages/core/src/__tests__/embeddings-provider.test.ts && bun run type-check
Depends on: none.

### G2: `use ollama --base-url` must not write an LLM base URL missing `/v1` ✅ Complete

`apps/mcp-client/src/config-cli.ts:288` and `apps/opencode-plugin/src/config-cli.ts:293` assign
`config.llm.baseUrl = (options["base-url"] as string) || INFERENCE_PROVIDERS.ollama.defaultLlmBaseUrl`.
For ollama the seam declares **two different** URLs — `defaultEmbeddingBaseUrl:
"http://localhost:11434"` and `defaultLlmBaseUrl: "http://localhost:11434/v1"` — so one
`--base-url` flag cannot serve both. Measured: `use ollama --base-url http://h:11434` writes
`llm.baseUrl: "http://h:11434"`, and `llm-client.ts:369` passes it straight through as `baseURL`.

**This is a regression F1 introduced, and it came from F1's own task text**, which said to mirror
the lmstudio branch. That branch is safe only because lmstudio's two URLs are byte-identical — a
coincidence, not a rule. Mirroring a case whose distinguishing property is absent is the same
subset error one more time.

Decide where the derivation belongs — the seam is the better home than either CLI, since both CLIs
would otherwise each carry a copy — and make an explicit `--base-url` produce a correct pair for
**both** providers. Do not special-case ollama with a hardcoded `/v1`; derive from what the seam
declares about each provider.

Tests: `use <provider> --base-url <url>` writes an embedding base and an LLM base that each match that provider's declared shape, for both providers, both CLIs
Gate: bun test apps/mcp-client/src/__tests__/config-cli.test.ts && bun test apps/opencode-plugin/src/__tests__/config-cli.test.ts && bun test scripts/__tests__/embedding-defaults-parity.test.ts
Depends on: none.

### G3: The parity gate's printed population count overstates by 2

`scripts/__tests__/embedding-defaults-parity.test.ts:258-341`. The two `embeddings/config.ts` rows
sit inside `CONFIG_CLI_FILES.flatMap(...)`, so they are emitted **once per CLI**: `length === 28`
while distinct labels `=== 26`. PDM-05 AC-3's printed count is a claim, and a duplicated row also
means one mutation can be reported twice. F4's "24 → 28" carries the same inflation; the true
distinct figures are 22 → 26. Detection is unaffected — this is an accounting defect, not a
coverage one, and the correction is to the count and the artifacts that quote it. Pre-existing from
T13, but F4 re-derived this population and did not catch it.

Tests: the printed population equals the distinct-label count; a duplicated row is rejected or deduplicated
Gate: bun test scripts/__tests__/embedding-defaults-parity.test.ts
Depends on: none.

### G4: The declared `NEEDLE_MODEL` residual names 1 of 2 files

`benchmarks/needles/README.md:66-73` honestly declares `benchmarks/needles/run.ts`'s retired
`qwen3-embedding:4b` pin — but `scripts/needles-rename-control.ts:118` carries the **byte-identical
default** and is named in no artifact. A residual that names one member of a two-member set is the
same defect class as the code ones, in prose. Separately, `benchmarks/needles/run.ts:9` still claims
"same model as the E2E baseline", which the README itself retracts at `:68-69` — a file contradicting
the doc that documents it.

Either repoint both pins or declare both, with the same reasoning applied to each; do not leave the
set half-declared.

Tests: covered by the parity gate's Markdown tier for the declaration; the code pins verified by reading
Gate: bun test scripts/__tests__/embedding-defaults-parity.test.ts && bun run test:scripts
Depends on: none.

### G5: PDM-10 AC-3's `lms load -c` values are unsensed — the surviving mutant ✅ Complete

Mutating `scripts/setup-local-first.sh:371`'s `-c 16384` to `-c 4096` left the parity gate at 15/0
and **five shell suites at 0 failures**. This is the one mutation of sixteen that survived round 2.
The per-role context values are a requirement (PDM-10 AC-3) with no sensor at all.

Add one. Its acceptance is the mutation above dying by name, not a green run.

Tests: each role's `lms load -c <context>` value asserted against `INFERENCE_ROLE_DEFAULTS`, so a changed literal fails by name
Gate: bash scripts/tests/test-lms-model-exists.sh && bun test scripts/__tests__/embedding-defaults-parity.test.ts
Depends on: none.

### G6: Correct a stale measurement in this feature's own artifacts

F2 and F2b both recorded a "pre-existing failure" in `apps/tools-api/src/routes/system.test.ts`
(`LocalHealthChecker.checkOllama` — 13 pass / 1 fail). Round 2 measured that file at **14 pass / 0
fail**. The claim is stale, and a stale "known failure" note is how a real failure later gets waved
through as expected. Re-measure, correct every place this feature's artifacts repeat it, and state
the figure with the commit it was measured on.

Tests: none — this is an artifact correction, verified by re-running the named file and quoting the result
Gate: bun test apps/tools-api/src/routes/system.test.ts && bun skills/massa-ai/scripts/check_specs_delivered.ts per-provider-default-models --root .
Depends on: G1, G2, G3, G4, G5.
