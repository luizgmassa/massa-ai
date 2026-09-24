# Debug Report — llm-defaults-mlx

- **projectId**: `massa-ai` · **workflowSessionId**: `debug-llm-defaults-mlx`
- **workflow**: debug · **fix size**: Standard+ (10 commits, 19 files, public installer surface)
- **branch**: `fix/llm-defaults-mlx-format` from `main` @ `cca0b66e` (v1.58.0)
- **worktree**: `/Users/luizmassa/Projects/massa-ai-fix-llm-defaults-mlx-format`
- **Isolation Gate**: satisfied — dedicated worktree + branch, recorded above. The main
  checkout was never switched; it was read-only throughout.
- **Predecessor**: `.specs/features/per-provider-default-models/` (merged PR #122). Two of
  the five items are defects introduced there; three are follow-on requests against it.

## Issue Summary

Five items reported against the just-merged per-provider-default-models feature, on a
developer machine running LM Studio as the local inference provider. Item 6 was found
while fixing 4/5 and predates this branch; item 7 was added by the user mid-fix.

| # | Symptom | Impact | Frequency | Environment |
|---|---|---|---|---|
| 1 | Admin Portal → Config → Embedding shows Context Window and Batch Size blank | 2 of 110 fields uneditable-by-default; reads as "no default exists" | Every load | macOS, local API on `:3333` |
| 2 | `llm.disableThink` renders off although the shipped default is on | Reported as cosmetic; **measured to disable json_schema constrained decoding** on LM Studio (see Root Cause 2) | Every LM Studio install | any |
| 3 | LM Studio embedding default should be the MLX build of Qwen3-Embedding | — (request, not a defect) | — | Apple Silicon |
| 4 | Installer should offer MLX first on macOS, GGUF first elsewhere | — (request) | — | any |
| 5 | Choosing MLX should verify and install the MLX engine | — (request) | — | Apple Silicon |
| 6 | **Found while fixing 4/5:** the GGUF path fetched by catalog id, which `lms get` cannot resolve in any format | A fresh LM Studio install cannot pull any of the three models | Every install without the models already on disk | any |
| 7 | Installer should evict models already resident before loading its own | Three more models added to a pool that may already be full | Every install on a machine mid-session | any |

## Feedback Loop

Every loop below ran before and after the fix.

| # | Loop | Before | After |
|---|---|---|---|
| 1 | `bun test apps/tools-api/src/routes/config.test.ts` + `apps/web-ui/.../config-forms.test.ts` | the two fields resolve `undefined`, 7 of 110 unresolved | 18/0 and 68/0; 5 of 110 unresolved against the route's payload |
| 2 | `bash scripts/tests/test-setup-local-first-api-key.sh` | asserted the written value was `false` | 43/0 with the assertion flipped to `true` |
| 3,4,5 | live LM Studio (`curl /v1/embeddings`, `lms ls`, `lms runtime get -l`, `lms get --mlx`) + `bash scripts/tests/test-model-format-select.sh` | no format concept existed | 59/0 |

Root-cause proof for items 1–2 is the code path, not a crash: both are wrong-value
defects, reproduced by reading the value the writer emits and the value the renderer
receives.

## Hypothesis Board

| # | Hypothesis | Evidence | Probe | Result |
|---|---|---|---|---|
| H1 | The portal renders the two embedding fields blank because the route never sends a default for them | `config-sections.ts:51-52` declares both; `apps/web-ui/.../config.ts:61-68` already names them in its own "no shipped default" list | Read `defaultMassaAiConfig.embedding` | **Confirmed.** `massa-ai-config.ts:401-409` omits both on purpose (PDM-12) and the route sent `maskSensitive(defaultMassaAiConfig)` unmodified |
| H2 | Adding the two fields to `defaultMassaAiConfig` is the fix | — | Check the loader contract | **Disproven.** `config-loader.test.ts:245` pins `embedding.batchSize` to `undefined` on an unset config; the shipped template is also the loader's middle merge layer, so filling it changes merge semantics, not just display. Fix moved to the route's display-only `defaults` block |
| H3 | `disableThink` defaults false somewhere in config resolution | `~/.config/massa-ai/config.json` holds `"disableThink": false` | Grep every writer | **Refuted for the defaults; confirmed for the writer.** `config/index.ts:779` is `?? true` and `massa-ai-config.ts:459` is `true`. The literal `false` comes from `installer-api-key.sh:211`, the LM Studio branch |
| H4 | Writing `false` there changes request behaviour | comment claims "think:false is an Ollama-only request-body key" | Read `llm-client.ts:365` | **Answered "no" — and the answer was wrong.** See the correction below. The probe read one call site of five; four are ungated and one of them decides constrained decoding |
| H4' | `disableThink` is read somewhere `injectsDisableThink` does not gate | H4's probe stopped at the first match | Enumerate **every** read of the flag, then measure the resolved value's effect | **Confirmed.** `llm.disableThink` is read at `llm-client.ts:365, 520, 570, 607, 633`. Only 365 is gated. Line 570 is `useJsonSchema = llm.disableThink && (await _checkJsonSchemaSupport())`, and `_checkJsonSchemaSupport()` (line 76) returns `true` unconditionally for a provider with no Ollama version probe — LM Studio, by design (LIP-07). Measured through `config.get("llm")`: env/file `false` → `useJsonSchema` false; unset → `true` |
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

### 2 — `llm.disableThink` (root cause corrected after independent verification)

`scripts/lib/installer-api-key.sh:211` wrote `false` on the LM Studio branch, justified by
the comment "think:false is an Ollama-only request-body key".

**The first diagnosis in this report was wrong, and it was wrong in an instructive way.**
H4 read `llm-client.ts:365` — `if (llm.disableThink && spec.injectsDisableThink)` — saw
`lmstudio.injectsDisableThink === false`, and concluded the field was inert on LM Studio
with only a cosmetic effect on the Admin Portal checkbox. That probe stopped at the call
site the comment named. **`llm.disableThink` is read at five sites — 365, 520, 570, 607,
633 — and only 365 is gated by the seam.**

The load-bearing one is line 570:

```ts
const useJsonSchema = llm.disableThink && (await _checkJsonSchemaSupport());
```

`_checkJsonSchemaSupport()` (line 76) short-circuits to `true` for any provider with no
Ollama version probe, LM Studio included and deliberately — the comment there says LM
Studio "implements the OpenAI-native `response_format:{type:"json_schema"}` path directly
— no version handshake exists to probe, and none is needed (LIP-07)".

Measured through `config.get("llm")`, the accessor `getLlmConfig` uses:

```
env/file disableThink=false  ->  false  ->  useJsonSchema = false   (main)
unset / true                 ->  true   ->  useJsonSchema = true    (branch)
_checkJsonSchemaSupport() on http://localhost:1234/v1  ->  true      (both)
```

So the literal **did** change the request. Every LM Studio install sent structured output
down the `json_object` + manual-validation fallback instead of the native constrained
decoding the seam exists to select, and three reasoning-channel recovery branches (520,
607, 633) stayed off. The defect was larger than reported, not cosmetic.

**Fix:** write the shipped default on both providers — same one-line change, now for the
right reason. The per-provider `think:false` injection still lives in the seam; what
changes is that LM Studio's own json_schema path stops being suppressed.

**Corollary worth recording:** `llm-client.ts:246`'s `cfg?.disableThink ?? spec.injectsDisableThink`
fallback is dead for any real config, because `packages/shared/src/config/index.ts:779`
resolves `fileConfig.llm?.disableThink ?? true` and therefore always defines the field.
Reading that line as "the seam decides" is what made the `false` look defensible. Not
changed here — it is reachable only from a hand-built config object in a test — but it is
the line that misleads.

**Sensor:** `packages/core/src/__tests__/llm-client-disable-think-json-schema.test.ts` pins
the coupling from the `false` side (the `true` side was already implicitly covered by
`llm-client-json-schema.test.ts`, which passes only because the shipped default is on).

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

- `lms get <catalog id>` → `Error: No staff picks found with the specified search
  criteria`. Catalog ids are not searchable terms. Re-measured with `--gguf`, with `--mlx`
  and with **no flag**: same error every time.
- `lms get --mlx <bare search term>` resolves to whichever staff pick ranks first —
  `--mlx qwen3-vl` picked the **4B**, `--mlx qwen2.5-coder` the **32B**. Neither is the
  configured model.
- Only a Hugging Face repo URL pins a build. Hence `mlxModels` carries a `{repo, model}`
  pair per role rather than an id alone.

### 6 — The GGUF fetch path (found while fixing 4/5, fixed in the same branch)

The first bullet above is not MLX-specific, and that is a defect older than this branch.
The GGUF branch handed `lms get` the three **catalog ids**, so on any machine that did not
already have the models the install died on `LM Studio could not fetch …`. It was never
visible on a developer box because `inference_model_exists` short-circuits every model
already on disk — the same blindness that let it ship in the first place.

Both formats now fetch by repo URL (`ggufRepos` on the seam, gated by the parity test).

**Retracted evidence.** An earlier revision of this report, of `mlxModels`'s docblock, of
the CHANGELOG and of the PR body all claimed:

> `lms get --mlx` against the instruct and coding repos answered `Model already downloaded.
> To use, run: lms load qwen3-vl-8b-instruct` — i.e. the **GGUF installs' own ids**.

The command and its output are real; the inference is not. `ls ~/.lmstudio/models/` shows
those two builds under `mlx-community/` — **they were already MLX**. `lms get --mlx`
matched the MLX build itself and observed nothing whatsoever about a GGUF sibling. No id in
this project was ever measured for a GGUF LLM build.

Rather than measure it (which means downloading ~10 GB to learn two strings), the fix makes
the question stop mattering: `installer_lmstudio_model_key` reads the id back from
`lms ls --json` after the fetch, matching the repo against the entry's `path` field, and
writes what LM Studio reports. The literals survive only as the pre-fetch existence check
and as a fallback.

The same command also produced the mechanism behind A-01, free: the MLX embedding build
reports `"type":"llm"` where the GGUF build of the same model reports `"type":"embedding"`.
That is why it never gets the `text-embedding-` prefix and why `/v1/embeddings` refuses it.

### 7 — Resident models were never evicted (user-reported, same branch)

The wizard loads three models with `lms load`. Nothing checked what was already resident,
so an install on a machine mid-session added three models to a pool that might already hold
a 32B. `installer_unload_loaded_models` now sweeps both runtimes first — `lms ps --json`
prints `[]` when idle (measured), which is what gates the unload; `ollama ps` has no
equivalent flag and no `stop --all`, so its table is parsed and each name stopped.

## Fix + Validation

| Commit | Item | Files |
|---|---|---|
| `2a8de422` | 1 | `routes/config.ts`, `routes/config.test.ts`, `views/config.ts`, `config-forms.test.ts` |
| `70b614fd` | 2 | `installer-api-key.sh`, `test-setup-local-first-api-key.sh` |
| `4768c3fb` | 3 | `inference-providers.ts`, `inference-providers.test.ts` |
| `4ef71e66` | 4, 5 | `installer-feature-prompts.sh`, `setup-local-first.sh`, `test-model-format-select.sh`, `mlx-model-parity.test.ts`, `.env.example`, `CHANGELOG.md` |
| `ef8f2894` | 6, 7 | `inference-providers.ts`, `inference-providers.test.ts`, `installer-feature-prompts.sh`, `setup-local-first.sh`, `test-model-format-select.sh`, `mlx-model-parity.test.ts`, `CHANGELOG.md` |

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
| `routes/config.test.ts` | drop `...shipped.embedding` from the `defaults` spread | 18 pass / **1 fail**, restored → 19/0 |
| `mlx-model-parity.test.ts` | resolver's MLX embedding id → `qwen3-embedding-0.6b-mlx` | 8 pass / **1 fail**, restored → 9/0 |
| `test-model-format-select.sh` | hoist `EMBEDDING_FETCH` out of its override guard | 40 pass / **2 fail**, restored → 42/0 |
| `embedding-defaults-parity.test.ts` | lmstudio instruct default → `qwen3-vl-4b-instruct` | 20 pass / **1 fail**, restored → 21/0 |
| `llm-client-disable-think-json-schema.test.ts` | env knob `0` → `1` | 1 pass / **2 fail**, restored → 3/0 |
| `test-model-format-select.sh` | `installer_lmstudio_model_key` forced to its fallback | 54 pass / **2 fail**, restored → 56/0 |
| `test-model-format-select.sh` | `[ "$loaded" != "[]" ]` unload gate → `true` | 54 pass / **2 fail**, restored → 56/0 |
| `test-model-format-select.sh` | ollama `awk 'NR > 1'` → `awk` with no header skip | 58 pass / **1 fail**, restored → 59/0 |
| `mlx-model-parity.test.ts` | seam GGUF instruct repo → `…/Qwen3-VL-4B-Instruct-GGUF` | 14 pass / **1 fail**, restored → 15/0 |
| `mlx-model-parity.test.ts` | delete the `LLM_MODEL` reconciliation call from the wizard | 14 pass / **1 fail**, restored → 15/0 |

The GGUF fetch fix needed no constructed mutation: the pre-fix suite asserted the defect as
the contract (`gguf: every fetch spec is the id itself`), so changing the code failed those
two assertions on the first run — 40 pass / **2 fail** — and the assertions were rewritten
against the measured behaviour.

**The third row was a surviving mutation until independent verification found it.** With
`defaultMassaAiConfig` mocked to `{}` at module scope, `{...shipped.embedding}` spread
nothing in every assertion in the file, so deleting that spread left both the route suite
and the web-ui sweep green — while taking the Config tab from 5 blank fields to **9**,
strictly worse than the 7-blank bug being fixed. The web-ui sweep could not see it either:
it builds the route's payload by hand rather than calling the route. Closed by handing the
`defaults` call a realistic shipped block and asserting the non-derived keys survive.

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

## Independent Verification

Two read-only agents ran against the committed branch; both findings sets were re-derived
in the main agent before being accepted, and both produced real changes.

### Round 1 — diff review

One blocking finding, confirmed by reading the trace rather than taken on report: on the
MLX path the three `*_FETCH` specs were assigned unconditionally while only the embedding
**id** was gated on its override. `MASSA_AI_LMSTUDIO_MODEL_FORMAT=mlx
LMSTUDIO_EMBEDDING_MODEL=<gguf id>` therefore wrote the user's id into `config.json` while
`lms get` pulled the MLX repo, and printed "Model `<id>` pulled" for a model never fetched.
That invocation is the recovery this very change documents — so the documented way out of
the MLX embedding defect was itself broken. Fixed in `94d8784b`, with the resolution
extracted into `installer_resolve_lmstudio_models` so the override matrix could be executed
instead of grepped. Five advisory findings were also acted on (an ungated shell↔TS literal,
an unreachable failure branch, three vacuous assertions, an inaccurate comment, and a
warning issued too early to be read).

### Round 2 — root-cause closure

Verdict: **closure confirmed** for all four divergence points, each re-derived rather than
trusted, with four mutation kills observed independently. Three hand-backs, all acted on:

1. **The report's Root Cause 2 was wrong.** Corrected above — `disableThink` is not inert on
   LM Studio, and the defect it caused was larger than reported. The correction added a
   sensor rather than only prose.
2. **A surviving mutation in the route fix.** Recorded in the discrimination table above and
   closed.
3. **A stale figure** — `test-model-format-select.sh` was 28/0 when this report was written
   and is 59/0 at HEAD — the override-matrix cases added by the round-1 fix, then the
   GGUF-fetch, id-reconciliation and unload cases of items 6-7. Refreshed.

The verifier could not drive the interactive menu itself (its sandbox has no `/dev/tty`);
it substituted an audit of this branch's pty harness for vacuous-pass modes and confirmed
the 9 menu-order assertions genuinely ran rather than skipping. It reported the tree
restored byte-identical after every mutation.

### Two lessons this produced

- **A gated read is not the only read.** H4 cleared a config literal as inert from the one
  call site its own comment named, while four ungated siblings changed request shape.
  Enumerate every read of a flag before calling it inert.
- **A hand-built payload fixture cannot sense its producer.** Restating a route's derived
  values in a consumer test leaves the producer's spread unguarded — and mocking the
  producer's own input to `{}` makes that spread structurally unobservable in its own suite.
