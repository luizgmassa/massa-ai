# Debug Report — llm-defaults-mlx

- **projectId**: `massa-ai` · **workflowSessionId**: `debug-llm-defaults-mlx`
- **workflow**: debug · **fix size**: Standard+ (4 commits, 14 files, public installer surface)
- **branch**: `fix/llm-defaults-mlx-format` from `main` @ `cca0b66e` (v1.58.0)
- **worktree**: `/Users/luizmassa/Projects/massa-ai-fix-llm-defaults-mlx-format`
- **Isolation Gate**: satisfied — dedicated worktree + branch, recorded above. The main
  checkout was never switched; it was read-only throughout.
- **Predecessor**: `.specs/features/per-provider-default-models/` (merged PR #122). Two of
  the five items are defects introduced there; three are follow-on requests against it.

## Issue Summary

Five items reported against the just-merged per-provider-default-models feature, on a
developer machine running LM Studio as the local inference provider.

| # | Symptom | Impact | Frequency | Environment |
|---|---|---|---|---|
| 1 | Admin Portal → Config → Embedding shows Context Window and Batch Size blank | 2 of 110 fields uneditable-by-default; reads as "no default exists" | Every load | macOS, local API on `:3333` |
| 2 | `llm.disableThink` renders off although the shipped default is on | Reads as a deliberate opt-out nobody made | Every LM Studio install | any |
| 3 | LM Studio embedding default should be the MLX build of Qwen3-Embedding | — (request, not a defect) | — | Apple Silicon |
| 4 | Installer should offer MLX first on macOS, GGUF first elsewhere | — (request) | — | any |
| 5 | Choosing MLX should verify and install the MLX engine | — (request) | — | Apple Silicon |

## Feedback Loop

Every loop below ran before and after the fix.

| # | Loop | Before | After |
|---|---|---|---|
| 1 | `bun test apps/tools-api/src/routes/config.test.ts` + `apps/web-ui/.../config-forms.test.ts` | the two fields resolve `undefined`, 7 of 110 unresolved | 18/0 and 68/0; 5 of 110 unresolved against the route's payload |
| 2 | `bash scripts/tests/test-setup-local-first-api-key.sh` | asserted the written value was `false` | 43/0 with the assertion flipped to `true` |
| 3,4,5 | live LM Studio (`curl /v1/embeddings`, `lms ls`, `lms runtime get -l`, `lms get --mlx`) + `bash scripts/tests/test-model-format-select.sh` | no format concept existed | 28/0 |

Root-cause proof for items 1–2 is the code path, not a crash: both are wrong-value
defects, reproduced by reading the value the writer emits and the value the renderer
receives.

## Hypothesis Board

| # | Hypothesis | Evidence | Probe | Result |
|---|---|---|---|---|
| H1 | The portal renders the two embedding fields blank because the route never sends a default for them | `config-sections.ts:51-52` declares both; `apps/web-ui/.../config.ts:61-68` already names them in its own "no shipped default" list | Read `defaultMassaAiConfig.embedding` | **Confirmed.** `massa-ai-config.ts:401-409` omits both on purpose (PDM-12) and the route sent `maskSensitive(defaultMassaAiConfig)` unmodified |
| H2 | Adding the two fields to `defaultMassaAiConfig` is the fix | — | Check the loader contract | **Disproven.** `config-loader.test.ts:245` pins `embedding.batchSize` to `undefined` on an unset config; the shipped template is also the loader's middle merge layer, so filling it changes merge semantics, not just display. Fix moved to the route's display-only `defaults` block |
| H3 | `disableThink` defaults false somewhere in config resolution | `~/.config/massa-ai/config.json` holds `"disableThink": false` | Grep every writer | **Refuted for the defaults; confirmed for the writer.** `config/index.ts:779` is `?? true` and `massa-ai-config.ts:459` is `true`. The literal `false` comes from `installer-api-key.sh:211`, the LM Studio branch |
| H4 | Writing `false` there changes request behaviour | comment claims "think:false is an Ollama-only request-body key" | Read `llm-client.ts:365` | **Disproven.** The injection is `llm.disableThink && spec.injectsDisableThink`; `lmstudio.injectsDisableThink` is `false`, so the field is inert on that provider. The literal only affected what the portal displayed |
| H5 | A-01 (the MLX build cannot serve LM Studio embeddings) has become stale | the user asked for exactly the model A-01 ruled out | Re-measure against a live server | **A-01 holds.** See Root Cause |
| H6 | An MLX catalog id can be derived from its Hugging Face repo path | it would remove three pinned literals | Measure three repos | **Disproven** (A-02 already measured it; re-measured here). Instruct and coding resolve to the *GGUF* id; embedding resolves to a third shape |

## Root Cause

Four distinct causes, one per fixed item.

### 1 — Admin Portal embedding defaults

`apps/web-ui/src/static/views/config-sections.ts` declares `embedding.contextWindow` and
`embedding.batchSize` as fields. `packages/shared/src/config/massa-ai-config.ts:401-409`
deliberately omits both from `defaultMassaAiConfig.embedding`, because the role table
(`INFERENCE_ROLE_DEFAULTS.embedding.contextWindow`) and the provider seam
(`InferenceProviderSpec.embedBatchSize`) are their default source, applied at each
consumption site (`embeddings/provider.ts:46`, `postgres-vector-store.ts:80`).

**Divergence point:** `apps/tools-api/src/routes/config.ts`, which sent
`maskSensitive(defaultMassaAiConfig)` as the Config tab's entire `defaults` payload. The
two fields are the only declared fields whose default lives outside that object, so they
were the only two that could render blank while a real default was in force.

**Fix:** derive both into the response's `defaults` block. That block is display state and
is never merged back into a config, so PDM-12's loader contract and `defaultMassaAiConfig`
are untouched. `batchSize` reads the persisted `embedding.provider` and mirrors
`_resolveEmbedBatchSize`'s own fallback for an id outside the local-inference set.

### 2 — `llm.disableThink`

`scripts/lib/installer-api-key.sh:211` wrote `false` on the LM Studio branch. The comment
justifying it ("think:false is an Ollama-only request-body key") is true and irrelevant:
`packages/core/src/services/memory/llm-client.ts:365` already gates the injection on
`llm.disableThink && spec.injectsDisableThink`, and `lmstudio.injectsDisableThink` is
`false`. The literal changed no request. Its only effect was a persisted `false` that the
Admin Portal rendered as an unchecked box, against a shipped default of `true`.

**Fix:** write the shipped default on both providers. The per-provider behaviour stays in
the seam, where it already was.

### 3 — The MLX embedding model (measured impossible, shipped at the user's direction)

The prior spec recorded assumption A-01: the MLX build of Qwen3-Embedding cannot be LM
Studio's embedding default. Re-measured 2026-09-21 on a live server rather than trusted:

```
$ lms runtime get -l
llama.cpp-mac-arm64-apple-metal-advsimd   2.41.0   installed   GGUF
mlx-llm-mac-arm64-apple-metal-advsimd     1.11.0   installed   MLX     ← LLM only
                                                                        (no MLX embedding engine exists)

$ lms get -y --mlx https://huggingface.co/mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ
   ↓ To download: Qwen3 Embedding 0.6B DWQ 4bit [MLX] - 351.23 MB   → lands under LLM, id qwen3-embedding-0.6b-dwq

$ curl /v1/embeddings -d '{"model":"qwen3-embedding-0.6b-dwq","input":"hello"}'
{"error":"No models loaded. Please load a model in the developer page or use the 'lms load' command."}

$ curl /v1/embeddings -d '{"model":"mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ","input":"hello"}'
{"error":"No models loaded. ..."}                      ← the HF path is not an id either

$ curl /v1/embeddings -d '{"model":"text-embedding-qwen3-embedding-0.6b","input":"hello"}'
{"object":"list","data":[{"embedding":[-0.0185...    ← GGUF control, same server, same second
```

**Mechanism.** LM Studio types a model by architecture and prefixes `text-embedding-` onto
anything it types EMBEDDING. The MLX repo is `Qwen3ForCausalLM` (Hugging Face
`pipeline_tag: text-generation`), so it is typed LLM, never gets the prefix, and is not
routable on `/v1/embeddings`. The same typing explains the id difference and the refusal —
one cause, two observable effects.

**Decision.** The user was shown the runtime-list evidence, chose "gravar o id MLX mesmo
assim" over the two alternatives offered (keep GGUF; MLX for instruct/coding only), and the
request was implemented in full. The installer warns at the point of choice and names the
GGUF model to switch back to, rather than silently substituting it. This is a stated
accepted risk, not a closed question.

### 4/5 — The format choice

Not a defect. The installer had no format concept at all: `lms get -y "$model"` ran with no
format flag, which makes LM Studio consider "only options supported by your system" —
non-deterministic on Apple Silicon, where both engines are present.

**Measured constraints that shaped the design:**

- `lms get --mlx <catalog id>` → `Error: No staff picks found with the specified search
  criteria`. Catalog ids are not searchable terms.
- `lms get --mlx <bare search term>` resolves to whichever staff pick ranks first —
  `--mlx qwen3-vl` picked the **4B**, `--mlx qwen2.5-coder` the **32B**. Neither is the
  configured model.
- Only a Hugging Face repo URL pins a build. Hence `mlxModels` carries a `{repo, model}`
  pair per role rather than an id alone.
- `lms get --mlx` against the instruct and coding repos answered `Model already downloaded.
  To use, run: lms load qwen3-vl-8b-instruct` / `... qwen2.5-coder-7b-instruct` — i.e. **the
  GGUF installs' own ids**. For those two roles the format selects the weights, not the id.

## Fix + Validation

| Commit | Item | Files |
|---|---|---|
| `2a8de422` | 1 | `routes/config.ts`, `routes/config.test.ts`, `views/config.ts`, `config-forms.test.ts` |
| `70b614fd` | 2 | `installer-api-key.sh`, `test-setup-local-first-api-key.sh` |
| `4768c3fb` | 3 | `inference-providers.ts`, `inference-providers.test.ts` |
| `4ef71e66` | 4, 5 | `installer-feature-prompts.sh`, `setup-local-first.sh`, `test-model-format-select.sh`, `mlx-model-parity.test.ts`, `.env.example`, `CHANGELOG.md` |

### Verification recipe

```bash
cd /Users/luizmassa/Projects/massa-ai-fix-llm-defaults-mlx-format
bun run lint                                              # oxlint, exit 0
bun run type-check                                        # 6/6 tasks
bun run generate:artifacts                                # gitignored bundles — required first
XDG_CONFIG_HOME=$(mktemp -d) bun test \
  apps/tools-api/src/routes/config.test.ts \
  apps/web-ui/src/__tests__/config-forms.test.ts \
  packages/shared/src/__tests__/inference-providers.test.ts \
  scripts/__tests__/mlx-model-parity.test.ts \
  scripts/__tests__/embedding-defaults-parity.test.ts
bash scripts/run-shell-suites.sh                          # 40 of 40
bun run test:scripts
```

### Discrimination evidence

Both new sensors were observed red before being trusted, and restored by file copy rather
than `git checkout` (a checkout would restore to HEAD, not to the pre-mutation state).

| Sensor | Mutation | Observed |
|---|---|---|
| `routes/config.test.ts` | `contextWindow`/`batchSize` derivation → `undefined` | 14 pass / **4 fail**, restored → 18/0 |
| `mlx-model-parity.test.ts` | wizard's MLX embedding id → `qwen3-embedding-0.6b-mlx` | 7 pass / **1 fail**, restored → 8/0 |

**One branch is not discriminable and is recorded rather than papered over.** The
provider-dependent half of `defaultEmbedBatchSize` cannot be sensed today: `ollama` and
`lmstudio` both declare `embedBatchSize: 64`, so deleting the provider lookup is an
equivalent mutation. The assertions read the seam per provider instead of the literal `64`,
so they become discriminating the day the two widths diverge — but as of this commit they
prove the derivation exists, not that it reads the right provider.

**The format suite caught its own defect.** Its first draft reported 23 passed / 5 failed;
the macOS half of that 23 was passing for the wrong reason. `local shim="$1"
path="...$(basename "$shim")..."` expands a `local` command's whole word list *before*
performing any assignment, so `$shim` and `$os` read empty: both `uname` shims collapsed
into one directory named `shim-`, the second overwrote the first, and the probes' `PATH`
carried an empty shim entry — leaving the real `uname` to answer `Darwin` for every case.
Split into separate `local` lines, with the reason recorded in place. 28/0 after.

## Prevention

| Risk | Guard |
|---|---|
| The wizard's MLX literals drift from the seam | `scripts/__tests__/mlx-model-parity.test.ts` — exactly-one-match anchors, verified discriminating |
| The two embedding defaults silently disappear from the portal again | 3 new cases in `routes/config.test.ts` + the route-shaped sweep in `config-forms.test.ts` |
| `disableThink` is written `false` again | `test-setup-local-first-api-key.sh` asserts `true` |
| The format menu order regresses per platform | `test-model-format-select.sh` shims `uname` and drives the menu through a pty, both orders |
| `lms get` loses its explicit format flag | asserted by `mlx-model-parity.test.ts` |

**Not guarded, deliberately:** nothing in CI can observe the LM Studio measurements — CI
has no LM Studio, no Apple Silicon, and no models. Every MLX claim in this report is a
measurement with a date attached, re-verifiable by re-running the commands quoted above.

## Residual Risk

1. **The MLX embedding role is broken by design of the upstream tool.** A user who picks
   MLX on macOS and keeps its embedding default gets a workspace that cannot index. Warned
   at the point of choice; accepted by the user after being shown the measurement.
2. **The MLX embedding width (1024) is inherited, not measured.** It comes from
   `Qwen/Qwen3-Embedding-0.6B`; the build itself returns no vector to measure. It exists in
   `knownDimensions` only so the installer's width resolver does not fall through to the one
   live probe known to fail.
3. **`mlxModels.instruct` / `.coding` were verified by LM Studio reporting the model already
   downloaded**, against GGUF installs. That proves the *id*, which is what the config
   needs. It does not prove a fresh machine downloads MLX weights for those repos — the
   `--mlx` flag is what governs that, and it is asserted at the call site, not end to end.
4. **Measurement side effect on the developer machine:** `qwen3-embedding-0.6b-dwq`
   (351 MB) was downloaded to LM Studio to run the A-01 re-measurement and is still
   installed. Remove with `lms rm qwen3-embedding-0.6b-dwq` if unwanted.
5. **The reporting machine's own `~/.config/massa-ai/config.json` is unchanged** (user
   declined). It still carries `llm.disableThink: false` and no `embedding.contextWindow` /
   `batchSize`. The fixes apply to future installs and to the portal's rendering; that file
   is edited through the Config tab or by hand.
