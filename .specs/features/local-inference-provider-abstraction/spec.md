# Spec — Local inference provider abstraction + LM Studio (LIP)

**Feature slug:** `local-inference-provider-abstraction`
**Workflow:** spec-driven (Large) · session `spec-lm-studio-provider`
**Branch:** `feat/local-inference-provider-abstraction` off `main@d523f06f`
**Worktree:** `~/Projects/massa-ai-feat-local-inference-provider-abstraction`
**Status:** Execute — Specify closed, Design v2 approved (post Plan Challenge),
Tasks approved (7 Phases = 18 Tasks). Phase-group batch workers authorized by
the user 2026-09-19.

## Premise correction (measured 2026-09-19)

The brief asks to "make Ollama usage abstract across all of massa-ai". Three
read-only investigations plus live measurement against an installed LM Studio
show the premise is **half already true and half wrong in an unexpected way**.

**Already abstract.** `EmbeddingProvider`
(`packages/core/src/services/embeddings/provider.ts:45-78`) carries no Ollama
vocabulary; `LocalTransformersEmbeddingProvider` (`providers/local-transformers.ts:89`)
already satisfies it with a wholly different backend. `provider.ts:271-283`
already builds an OpenAI-compatible client via `createOpenAI({baseURL})` — the
exact shape LM Studio serves. `llm.baseUrl` is already a free-form
OpenAI-compatible URL (`llm-client.ts:204-213`). **No new SDK adapter is
needed, and no provider registry has to be invented.**

**Not abstract, and not where the brief implies.** Ollama coupling survives in
four places the embedding interface never covered:

1. **Three hand-maintained copies of a 5-member provider allowlist** —
   `packages/shared/src/config/massa-ai-config.ts:37` (type union),
   `packages/shared/src/config/config-writer.ts:14` (`VALID_EMBEDDING_PROVIDERS`,
   enforced `:138-139`), `apps/web-ui/src/static/views/config-sections.ts:46`
   (UI enum). Core's own union is already open (`embeddings/config.ts:12` ends
   in `| string`), so the *runtime* accepts LM Studio today while the
   *persisted config* cannot represent it. `massa-ai-config set embedding.provider
   lmstudio` writes an invalid member straight to disk (`config-cli.ts:215-237`,
   no validation), while `PUT /api/v1/config` rejects the same value — the two
   paths already disagree.
2. **`getConfigForEnv()`** (`config-loader.ts:458-479`) projects the config
   block into provider-specific env names and has branches only for
   `ollama`/`mistral`/`openai`. A provider with no branch **silently exports
   nothing** to child processes.
3. **Probes that trust the HTTP status code** — see the measured finding below.
4. **Dimension resolution, model-existence checks and installer config
   writing** — `embedding-dimensions.ts:31-36` (4 Ollama tags only),
   `setup-local-first.sh:125-157` / `install.sh:256-262` / `diagnose.ts:162-178`
   (four independent implementations of "is the model there"), and
   `scripts/lib/installer-api-key.sh:220-229` (hardcodes `"provider": "ollama"`,
   `"apiKey": "ollama"`, `"baseUrl": "http://localhost:11434/v1"`), whose
   `installer_embedding_dimensions` table (`:110-118`) falls back to **2560 for
   any unknown model name**.

### The measured finding that shapes the design

Live against LM Studio 0.3.x on this machine (`~/.lmstudio/bin/lms server start`):

| Probe | Result | Consequence |
|---|---|---|
| `GET /v1/models` | 200 `{"data":[{"id":"text-embedding-nomic-embed-text-v1.5",…}],"object":"list"}` | OpenAI shape confirmed |
| `POST /v1/embeddings` single | 200, `data[0].embedding.length` = **768** | width measured, not assumed |
| `POST /v1/embeddings` batch `["um","dois","tres"]` | 200, 3 vectors, `index` 0..2 | batch supported |
| `GET /v1/models` with bogus `Authorization` | **200** | any `apiKey` value works |
| `GET /api/version` | **200** `{"error":"Unexpected endpoint or method. (GET /api/version)"}` | — |
| `GET /api/tags` | **200** `{"error":…}` | — |
| `POST /api/embed` | **200** `{"error":…}` | — |

**LM Studio answers HTTP 200 with an error body for every unknown endpoint.**
Every Ollama probe in this repository decides on the status code, so each one
produces a *false positive* against a LM Studio server:

- `LocalHealthChecker.checkOllama` (`local-health-checker.ts:40-44`) —
  `response.ok` is true, `.models` is `undefined` → `|| []` →
  returns `available: true, modelsAvailable: 0`. Reports "Ollama healthy"
  against LM Studio.
- `check_ollama` / `detect_ollama_url` (`install.sh:243`, `:138`) — `curl -sf`
  only fails on HTTP ≥ 400, so a 200 passes and the installer prints
  "Ollama reachable".
- `_checkJsonSchemaSupport` (`llm-client.ts:67-100`) — `res.ok` is true, then
  `body.version` is `undefined` → `version = ""` → regex fails → logs
  `"could not parse Ollama version"` and returns `false`. This is **not** a
  silent break (an earlier investigation predicted a 404 and a silent failure —
  both wrong); it is a **quality regression**: LM Studio supports OpenAI
  `response_format: {type:"json_schema"}` natively, and this probe downgrades it
  to `json_object` for no reason.

Therefore the provider-neutral seam must **discriminate on response body shape,
never on status code**. This is a requirement (LIP-03), not an implementation
note.

### Live environment of record

- Ollama: installed, running, `embedding.provider=ollama`,
  `qwen3-embedding:4b`, `dimensions=2560` → table `vector_documents_2560d`.
- LM Studio: installed (`/Applications/LM Studio.app`, `~/.lmstudio/bin/lms`),
  server was OFF, **one** model — `text-embedding-nomic-embed-text-v1.5`
  (embedding, 768d). **No chat/instruct model.**
- **768 is not a pre-migrated width.** `packages/core/prisma/schema.prisma`
  defines 1024 (`:460`, `:500`), 1536 (`:473`), 2560 (`:533`), 3072 (`:486`),
  4096 (`:516`). A 2560 → 768 migration lands in
  `createFallbackTable()` (`postgres-vector-store.ts:232-250`).

  **Correction (Plan Challenge, verified).** An earlier draft of this spec said
  768 gets "no pre-created HNSW index". That is **wrong** — HNSW *is* created at
  768 (`postgres-vector-store.ts:287-296`). The real consequence is different
  and larger: `createVectorIndex` branches at `> 2000`
  (`:267-270`) and `bqEnabled` is set **only** inside that branch (`:329`,
  `:363`), where it then governs four search paths (`:382`, `:500`, `:556`,
  `:695`). At 2560 the store runs binary-quantization plus rerank; at 768 it
  runs none of them. **Switching to the measured LM Studio model changes the
  retrieval algorithm, not merely the vector width.** See LIP-22.

## Decisions taken by the user (2026-09-19)

| # | Question | Decision |
|---|---|---|
| D1 | Depth of "make it abstract" | **Provider-neutral seam across the 4 coupled surfaces.** Open the allowlists, add the `getConfigForEnv` branch, and extract one "local inference provider" seam covering health probe, model listing/existence, dimension resolution and installer config writing. Ollama's native embed fast path (`/api/embed` + mutex, `provider.ts:410-477`, `591-673`) stays intact. A third provider later is data, not code. |
| D2 | Provider switch vs. the vector index | **Invalidate and block.** Mark the index invalid, isolate the old table, make search fail loudly with a reindex instruction. Never auto-run a heavy reindex; never return 0 results; never mix vectors. Must cover the width-same case, which today's orphan detector misses. |
| D3 | Reversibility | **Installer restricts, CLI stays reversible.** The installer menu offers only LM Studio when it detects an Ollama config (the brief's rule). `massa-ai-config use ollama` and the Admin UI keep working, under the same D2 invalidation warning. **Known lossy (verified):** `savePartialConfig` replaces the whole `embedding` section (`config-writer.ts:432`) and there is no per-provider sub-object, so a user on a **non-default** Ollama model who switches to LM Studio and back lands on the CLI's literal default model, not their own — and pays a second reindex. Accepted; a per-provider config shape would reopen R1 (the `config-sections.ts` mapped type). |
| D4 | Verification | **Live.** LM Studio is installed; the final gate exercises real `/v1/embeddings` and `/v1/models`. |

## Requirements

### Group A — the provider-neutral seam (D1)

- **LIP-01 — derive the provider lists, and close the `cohere` gap.**
  `embedding.provider` must accept `"lmstudio"` end to end.

  **Correction (Plan Challenge, verified).** An earlier draft aimed this
  requirement at drift between `massa-ai-config.ts:37`, `config-writer.ts:14`
  and `config-sections.ts:46`. Those three are **byte-identical and have never
  drifted** — a sensor over them would certify agreement that already holds.
  The live divergence is against core: `SELECTABLE_PROVIDERS`
  (`embeddings/config.ts:154-164`) has **9** members and **omits `cohere`**,
  while `config-writer.ts:138` happily accepts `cohere` — and
  `config.ts:147-150` names that exact value as one that "would otherwise fall
  through to the ollama default silently". Both `config-cli.ts` `use`
  allowlists are a third membership, **3** (`:242-243`).

  The three config lists are derived as `LOCAL_INFERENCE_IDS ∪
  API_PROVIDER_IDS`; `SELECTABLE_PROVIDERS` as that union ∪ the internal ids
  (`vercel`, `litellm`, `custom`, `transformers`, `local`), which **adds
  `cohere` to the selectable set** and closes the shipped gap. The two
  `config-cli.ts` 3-member lists widen to the writable set.

  AC: the sensor asserts **membership equality between the derived consumers**
  — not the syntactic absence of array literals, which cannot distinguish a
  fourth copy from the three sanctioned ones (this repo's own `kernel/` rule:
  an allowlisted exception is indistinguishable from a new violation). Shape
  precedent: `embedding-defaults-parity.test.ts:290`. A second AC asserts
  `cohere` is selectable at runtime after the change.
- **LIP-02 — no silent-empty env projection.** `getConfigForEnv()`
  (`config-loader.ts:458-479`) gains an `lmstudio` branch. A provider reaching
  that function with no branch must **throw or warn by name**, never return a
  block that exports nothing.

  AC (**strengthened** — the earlier "assert every member has a branch" was
  self-answering: it senses that a branch exists, never that the names it emits
  are read). The test asserts each emitted env name is **consumed by a named
  reader**. Today's Ollama branch emits `OLLAMA_EMBEDDING_MODEL` /
  `OLLAMA_BASE_URL` / `OLLAMA_EMBEDDING_DIMENSIONS` (`config-loader.ts:463-466`),
  read at `embeddings/config.ts:232`, `:247`, `:261` and
  `local-health-checker.ts:23`, `:43`. An `lmstudio` branch emitting
  `LMSTUDIO_*` names that no consumer reads must **fail** this AC.
- **LIP-03 — probes discriminate by body shape, not status.** The
  reachability/model-listing seam must treat a 200 carrying
  `{"error": …}` and no expected payload key as *not available*. AC: a test
  feeds the measured LM Studio error body (`{"error":"Unexpected endpoint or
  method. (GET /api/tags)"}`) with status 200 to the Ollama probe and asserts
  `available: false`; the same test asserts the LM Studio probe accepts
  `{"data":[{"id":…}]}` and rejects `{"models":[…]}`.

  **Five call sites, not four.** The earlier enumeration missed
  `scripts/validate-vscode-integration.sh:48`, which is the weakest of them
  all: `curl -s --max-time 2 "${OLLAMA_URL}/api/tags"` with **no `-f`**, so it
  succeeds on any HTTP response whatsoever. It was found by review, not by my
  sweep — the enumeration was only as wide as the files already on screen.
- **LIP-04 — dimension resolution is provider-aware and probe-backed.**
  `embedding-dimensions.ts:31-36` must resolve widths for LM Studio model ids,
  and when a model is unknown it must **probe the live endpoint for the real
  width** rather than falling back to 2560. AC: resolving
  `text-embedding-nomic-embed-text-v1.5` yields **768** (measured), and an
  unknown model with an unreachable endpoint fails loudly instead of
  defaulting.
- **LIP-05 — installer model-existence check.** `ollama_model_exists`
  (`setup-local-first.sh:125-157`) stays **byte-intact** — its test extracts it
  by literal `sed -n '/^ollama_model_exists()/,/^}/p'`
  (`scripts/tests/test-setup-ollama-model-exists.sh:26`) and breaks if the
  function is renamed, moved or wrapped. Add a sibling `lms_model_exists` and
  a provider-dispatching caller. AC: the existing shell suite stays green
  unmodified; a new sibling suite covers `lms_model_exists`.

  **Gap the byte-identity AC does not close (Plan Challenge, verified).** The
  suite injects the function's globals itself — `OLLAMA_URL="http://stubbed"`
  and `OLLAMA_HAS_CLI` (`test-setup-ollama-model-exists.sh:87-88`) — while the
  real function reads them from installer scope
  (`setup-local-first.sh:131`, `:135`). So byte-identity is verified while the
  **caller contract is not**: renaming those globals for provider neutrality
  breaks the installer at runtime under `set -euo pipefail`
  (`setup-local-first.sh:2`) while the suite stays green. Second AC: do not
  rename `OLLAMA_URL` / `OLLAMA_HAS_CLI`; if neutrality forces it, add a
  caller-contract assertion in the same task.
- **LIP-06 — installer config writing is provider-parameterised.**
  `installer_write_config` (`scripts/lib/installer-api-key.sh:204+`) must emit
  the embedding and llm blocks from provider variables, not the three
  hardcoded Ollama literals at `:220-229`. AC: the existing
  `scripts/tests/test-setup-local-first-api-key.sh` contract still round-trips
  (it exports `OLLAMA_URL`/`EMBEDDING_MODEL`/`LLM_MODEL`/`CODE_MODEL` as
  globals, `:121-129`), and a new case asserts an LM Studio write produces
  `provider: "lmstudio"` with the `:1234/v1` base URL.
- **LIP-07 — Ollama-only LLM behaviours are gated on provider.**
  `_checkJsonSchemaSupport`'s `/api/version` probe (`llm-client.ts:67-100`) and
  `_wrapFetchDisableThink`'s `think:false` body injection (`:184-202`) must not
  run for a non-Ollama provider. For LM Studio, structured output uses the
  OpenAI-native `response_format` path instead of degrading to `json_object`.
  AC: with provider `lmstudio`, no request is made to `/api/version`, no
  `think` key appears in any request body, and the json-schema path is
  **enabled**, not downgraded.

### Group B — the LM Studio provider (D1)

- **LIP-08 — embedding provider entry.** An `lmstudio` entry in
  `embeddings/config.ts` modelled on the existing `custom` entry (`:317-331`),
  routed through the existing `createOpenAI` path (`provider.ts:271-283`) —
  **no new SDK adapter**. Added to `SELECTABLE_PROVIDERS` (`config.ts:155-164`)
  and to the façade union (`embeddings/index.ts:54`, currently stale — it also
  omits `custom`, `litellm`, `vercel`, `google`, `openai`). Defaults: baseURL
  `http://localhost:1234/v1`, apiKey not required. AC: a live call returns a
  768-length vector for the measured model.
- **LIP-09 — LLM defaults.** Selecting LM Studio sets `llm.baseUrl` to
  `http://localhost:1234/v1`. `llm.apiKey` is accepted at any value (measured:
  auth is not enforced). AC: config write + read round-trips.
- **LIP-10 — health and diagnose report the active provider.**
  `LocalHealthChecker`'s report key `services.ollama`
  (`local-health-checker.ts:16`) and `GET /api/v1/system/ollama`
  (`apps/tools-api/src/routes/system.ts:172-195`) must report whichever
  provider is configured. The `services.ollama` field and the
  `/system/ollama` route are a **public compatibility surface**: keep them
  responding, add the neutral name beside them rather than renaming in place.
  `scripts/diagnose.ts` steps 1–4 become provider-dispatched (its
  `POST /api/embed` + `data.embeddings[0] ?? data.embedding` read at `:187`,
  `:208-213` has a different request *and* response shape under OpenAI).
  AC: `bun run diagnose` passes against LM Studio with the server up and
  fails informatively with it down.
- **LIP-11 — config CLI.** `use lmstudio` and `init --lmstudio` in **both**
  forked CLIs — `apps/mcp-client/src/config-cli.ts` and
  `apps/opencode-plugin/src/config-cli.ts` are copy-forks, not delegation, and
  their `use` allowlist is a narrower 3 members (`["ollama","mistral","openai"]`,
  `:242-243`). Their two mirrored test files move together. AC: both CLIs
  accept the new provider and both test files assert it.

### Group C — installer choice and migration (D2, D3)

- **LIP-12 — detect an existing install.** No such detection exists today for
  provider purposes. Key on `~/.config/massa-ai/config.json` →
  `embedding.provider` (written literal at `installer-api-key.sh:221`),
  corroborated by `embedding.baseURL` and `llm.baseUrl`. **Not**
  `install-state.json` — it records agent-harness state and names no provider.
  AC: a fixture config with `provider: "ollama"` is detected; an absent file
  yields "fresh install".
- **LIP-13 — the restricted menu is symmetric** (user annotation, 2026-09-19).
  Fresh install → both providers offered. Existing install on Ollama → **only
  LM Studio selectable**, presented as a migration. Existing install on LM
  Studio → **only Ollama selectable**, likewise presented as a migration.

  The rule is uniform — *the installer always offers the provider you are not
  currently using, as a migration* — with no special case and no dead end. This
  supersedes an earlier draft in which the LM Studio side offered nothing;
  D3's "the CLI stays reversible" is unchanged and now reinforced rather than
  carrying the reversal alone. Both directions share one code path and one set
  of ACs, so the migration is written and tested once, not twice.

  AC: a fixture config with `provider: "lmstudio"` yields a menu whose only
  selectable entry is Ollama, and the resulting switch runs the same migration
  and the same LIP-15 invalidation as the opposite direction.

  There is no shared menu
  helper in this repo — every menu is inline `echo` + `read -rp … <>/dev/tty`
  + `case` (`install.sh:147-166` is the shape to copy). `installer_ask`
  (`installer-feature-prompts.sh:141-157`) is yes/no only. Bash 3.2
  compatibility is a contract (`installer-feature-prompts.sh:10-11`): no
  associative arrays, no `${var^^}`, no `readarray`.
- **LIP-14 — install LM Studio.** The wizard can install LM Studio where it
  installs Ollama today (`setup-local-first.sh:77-88`), via the documented
  headless path `curl -fsSL https://lmstudio.ai/install.sh | bash` +
  `lms daemon up`, and can pull a model with `lms get <model>`. Note
  `lms` lives at `~/.lmstudio/bin/lms` and is **not on PATH until bootstrapped**
  — detection must check that path, not only `command -v lms` (this exact
  false negative occurred during investigation). AC: detection succeeds on
  this machine, where `lms` is not on PATH.
- **LIP-15 — index invalidation on provider switch (D2). Two gates, not one.**
  A provider or embedding-model change must make search **fail loudly with a
  reindex instruction**. Two distinct cases:
  - *width differs* (here 2560 → 768): the new table is empty and today search
    returns 0 results with only a warning (`postgres-vector-store.ts:146-157`).
  - *width identical*: the old table is **reused** and vectors from two
    incompatible models are mixed with no warning at all — the orphan detector
    excludes the current table by construction
    (`postgres-vector-store.ts:187-190`), is `logger.warn`-only, and swallows
    its own errors (`:225-227`). No existing sensor catches this.

  **Correction (Plan Challenge, verified).** An earlier draft put the
  fingerprint on `projects` and stamped it "when an index run completes". Both
  halves were wrong:

  1. **`projects` has zero production writers.** Measured:
     `grep -rEn "(INSERT INTO|UPDATE) +\"?projects\"?|\.project\.(create|upsert|update)\(" --include='*.ts' packages apps scripts | grep -v __tests__`
     → **0 rows**. `workspaces` has 6. A column on `projects` stays `NULL`
     forever, leaving the mechanism permanently in its own "legacy, never
     block" branch — it would disable itself at 100% of installs. The
     fingerprint goes on **`workspaces`**, whose `projectId String @id`
     (`schema.prisma:126-131`) is exactly one row per project.
  2. **"A run completed" is the wrong assertion.** `needsFullReindex` fires
     only on `no_index | path_mismatch | filesToReindex.length > maxSyncFiles`
     (`project-indexer.ts:406-409`) — **a model change is not in that list**.
     So a user who obeys the reindex instruction can take the *incremental*
     branch (`:480`), write new-model vectors beside old-model rows in the same
     table, complete successfully, and get a fingerprint stamped that agrees
     with itself. The stamp asserted "a run happened", not "every row came from
     this model" — re-opening the very case D2 was chosen to close.

  Therefore **both** gates are required:
  - **Read gate:** search compares stored vs live fingerprint; mismatch raises
    `EmbeddingIndexStaleError` naming both and the reindex command. Never
    returns rows.
  - **Write gate:** a fingerprint mismatch is added to `needsFullReindex`, so a
    stale project **cannot** take the incremental branch. The stamp is written
    **only** from the clearing branch.

  AC: a test drives both the width-differs and width-identical cases and
  asserts search raises the error rather than returning results; a second test
  drives a same-width model change followed by an **incremental** reindex
  request and asserts the run was forced full and the resulting table holds no
  row older than the stamp. No heavy reindex is ever started without an
  explicit user action.
- **LIP-16 — non-interactive path.** Honour `installer_can_prompt()`
  (`installer-feature-prompts.sh:131-136`: `NO_START=1`,
  `MASSA_AI_NONINTERACTIVE=1`, or no `/dev/tty`). Add
  `MASSA_AI_INFERENCE_PROVIDER` following the established pattern
  (`MASSA_AI_MODE`, `MASSA_AI_DB_BACKEND`): **`die` on an unrecognised value**,
  never default silently. AC: unset → keeps current config; `ollama`/`lmstudio`
  → selects it; anything else → non-zero exit naming the bad value.

### Group D — documentation (explicit in the brief)

- **LIP-17 — README, FEATURES.md, docs/CHEATSHEET.md.** Exact surfaces, from
  the inventory:
  - `README.md:5` (positioning "runs on Ollama"), `:47`, `:49-53` (quick
    start), `:76`, **`:618-703`** (`## Local-first LLM (Ollama)`),
    `:963-964`, `:1000`, `:1031`.
  - `FEATURES.md:34` (**TOC anchor `#local-first-llm-ollama` — breaks if the
    heading is renamed; heading and anchor move together**), **`:907-929`**,
    `:1210`, `:1257`, **`:1279-1286`** (the Embedding Providers table LM Studio
    must join), `:1294`, `:1308`.
  - `docs/CHEATSHEET.md:30`, `:40`, `:56`, `:144`, `:161`, `:438`, `:494`,
    **`:502-506`** (the whole `### Embeddings` section is Ollama-only).

  AC: no surface above still claims Ollama is the only local option, and every
  changed command in those docs is executed once before it is written down.

### Group E — gates that this change will trip

- **LIP-18 — generalise the embedding-defaults parity gate. Its failure mode
  is going green, not going red.**

  **Correction (Plan Challenge, verified).** An earlier draft feared a second
  provider block would produce 2 matches and fail as "ambiguous". That is
  **inverted**. Every extractor is anchored on the literal token
  `OLLAMA_EMBEDDING_` (`embedding-defaults-parity.test.ts:77-100`) and the
  Tier-3 completeness scan skips any file not containing it (`:203`). Since
  `getConfigForEnv()` projects provider-prefixed names
  (`config-loader.ts:458-479`), an LM Studio pair is spelled
  `LMSTUDIO_EMBEDDING_MODEL` / `LMSTUDIO_EMBEDDING_DIMENSIONS` and is
  **invisible to every scan in the file**. The gate reports clean over a second
  unchecked model/width pair — verbatim the EDC-06 defect the file exists to
  prevent (`:5-8`).

  Re-key Tier-3 on the provider-neutral token `_EMBEDDING_(MODEL|DIMENSIONS)`
  with any prefix, and add the LM Studio pair to the width-writer membership
  set. Keep the exactly-one rule **per provider per surface**.

  AC: a deliberate red is induced on the **LM Studio** pair specifically — not
  only the Ollama one — and observed failing. A gate that has never failed on
  the new subject is unquotable as a sensor for it.
- **LIP-23 — structured output must reach an endpoint that honours it
  (found in Execute, Phase 3; measured 2026-09-19).** LIP-07 gates the Ollama
  version probe off for LM Studio, which *enables* the json_schema path.
  Enabling it is not delivering it.

  Measured against a live LM Studio 0.3.x serving `qwen/qwen3-4b-2507`:

  | Endpoint | Request | Response |
  |---|---|---|
  | `POST /v1/responses` | `text.format` = `json_schema`, `strict:true` | `"text":{"format":{"type":"text"}}`, body `"The capital of France is Paris."` |
  | `POST /v1/chat/completions` | `response_format` = `json_schema`, `strict:true` | `{ "capital": "Paris" }` |

  LM Studio **serves** the Responses endpoint and **silently drops** the
  requested format. `@ai-sdk/openai@3.0.80` resolves the default callable
  `openai(model)` to Responses (`.chat()` and `.responses()` are the explicit
  alternatives, `dist/index.d.ts:1105-1113`), and `buildProvider`
  (`llm-client.ts:278-290`) used the default — so `llmObject` returned
  `{ok:false, error:"No object generated: could not parse the response."}`
  against LM Studio with LIP-07's gating fully correct.

  **Ollama is not affected and this was checked, not assumed:** its
  `/v1/responses` answered **400** `"qwen3-embedding:4b" does not support chat`
  — a model error, so the endpoint is implemented there. The fix is therefore
  a per-provider flag, `requiresChatCompletionsApi`, true only for LM Studio.

  AC: the sensor records **which entrypoint `buildProvider` invoked**, not the
  flag's value — a boolean read back is not evidence of a call position.
  Flipping the flag must redden it. A live end-to-end `llmObject` run against
  LM Studio must return a parsed object.
- **LIP-24 — the seam makes env readers invisible to literal scanners
  (found in Execute, Phase 3).** T05 replaced
  `process.env.OLLAMA_BASE_URL` in `local-health-checker.ts` with
  `process.env[spec.envNames.baseUrl]`. The name is still read at runtime, and
  the dynamic form is the point of the seam — but the **literal token is gone**,
  so every text-scanning sensor stops seeing that file. Measured on the parity
  gate's completeness population: 25 on `main`, 27 after Phase 1 added the two
  seam files, **26** after Phase 3 dropped `local-health-checker.ts` out of it.

  This is LIP-18's failure shape one level deeper. LIP-18 is about a *new* pair
  being invisible; this is about an *existing reader* becoming invisible as call
  sites migrate to the seam. A scan that sees fewer files reports clean more
  easily. AC (T15): the completeness scan's shrinkage is accounted for
  explicitly — either the scan learns the `spec.envNames.*` indirection, or the
  set of files it no longer covers is enumerated and each is shown to be covered
  by a different sensor. "The gate is still green" is not an answer here.
- **LIP-19b — re-anchor `referencePair()` in the same edit.** LIP-01 **deletes**
  the type union that `referencePair()` relies on as its documented
  discriminator: `/embedding:\s*(\{[^}]*provider:\s*"ollama",[^}]*\})/g`
  (`embedding-defaults-parity.test.ts:47`), explained at `:43-46` as "the
  interface's provider is a type union …, the defaults block a literal — the
  trailing comma is the discriminator". After LIP-01 that union is derived and
  the stated mechanism no longer exists. AC: the extractor is re-anchored and
  its comment rewritten **in the same commit**; a comment describing a
  mechanism that no longer exists is the defect, not a cosmetic issue.
- **LIP-22 — measure the retrieval-algorithm change at 768 (accepted risk).**
  The measured LM Studio model moves the store off the binary-quantization
  path entirely (see the Premise correction). This is inherent to the model's
  width and not preventable — but it must not ship as an unmeasured claim.
  AC: one `bun run bench:needles` run at 768 is recorded in `validation.md` as
  a number beside the 2560 baseline. `needles-gate.yml` stays out of scope, so
  this runs manually; a promise to measure later is not an AC.
- **LIP-19 — Web UI fixtures.** `config-sections.ts` is a mapped type over
  `keyof MassaAiConfig` (`:19`, `:36`): a config key with no section, or a
  section with no key, **fails `bun run type-check`**. Regenerate
  `render-golden.json` (406 KB) deliberately with
  `MASSA_AI_WRITE_GOLDEN=1 bun test src/__tests__/render-golden.test.ts`; also
  `config-get.json`, `config-forms.test.ts`, `config-section-coverage.test.ts`.
- **LIP-20 — turbo env allowlist (AD-010).** Any new `MASSA_AI_*` variable is
  added to `turbo.json` → `tasks.test.passThroughEnv`, mechanised by
  `scripts/__tests__/turbo-passthrough-env.test.ts`.
- **LIP-21 — CHANGELOG.** Entries under `[Unreleased]` per
  `CONTRIBUTING.md` § "CHANGELOG authoring". The CI merge gate fails a PR that
  does not touch `CHANGELOG.md`.

## Out of scope (explicit)

- **`.github/workflows/needles-gate.yml`** stays Ollama-only. It is
  `workflow_dispatch`-only and `continue-on-error: true`, so it never blocks a
  merge, and its Ollama setup is not worth duplicating. (An earlier
  investigation claimed LM Studio has no headless installer for a CI runner;
  that is **false** — `lmstudio.ai/install.sh` + `llmster` exists. The
  exclusion stands on the workflow being non-blocking, not on that wrong
  premise.)
- **`apps/tools-api/setup-ollama-wsl.sh`** and **`OLLAMA_WSL_SETUP.md`** —
  WSL-specific; the `.md` is **orphaned** (zero inbound references). Left
  as-is; flagged as cleanup debt.
- **`docs/ONBOARDING.md`**, **`skills/massa-ai/references/installation.md`**,
  **`benchmarks/*/README.md`** — carry Ollama prose but are not named in the
  brief. Follow-up.
- Replacing Ollama's native embed fast path (`/api/embed`, `num_ctx`, the
  serialisation mutex) with the OpenAI path. D1 keeps it.
- A general provider-plugin registry (D1 rejected this as option 3).

## Open assumptions (accepted, not verified)

- **A1 — RESOLVED (user decision, 2026-09-19): pull an instruct model.** The
  installed LM Studio had only an embedding model, so LIP-07's json-schema path
  and LIP-09's `llm.model` could not be exercised live. The user chose to pull a
  small instruct model via `lms get -y <model>` rather than record a skipped
  sensor. **Consequence:** LIP-07 and LIP-09 carry a *live* sensor, not a stubbed
  one — `validation.md` must record the real request/response evidence (no
  `/api/version` call, no `think` key, `response_format: {type:"json_schema"}`
  accepted), and a stubbed-only result for either requirement is a FAIL, not a
  pass. Resolves design R7.
- **A2 — `text-embedding-nomic-embed-text-v1.5` at 768d is the migration
  target on this machine.** A different LM Studio embedding model changes the
  width and therefore which branch of LIP-15 the live test exercises.
- **A3 — LM Studio version.** Measurements come from the currently installed
  build (CLI commit `69d945a`). The 200-on-unknown-endpoint behaviour is
  treated as stable; if a future build returns 404, LIP-03's body-shape check
  remains correct — it is strictly safer than a status check either way.
- **A4 — the bias this spec was written under, named so the next reader can
  correct for it.** Every dimension figure here traces to **one** machine with
  **one** installed LM Studio model. The Plan Challenge's sharpest observation
  is that the plan's errors clustered exactly where nothing had been measured:
  `projects` was never grepped for a writer, `createVectorIndex`'s width branch
  was never read, and `detectOrphanedChunks` was analysed carefully *because it
  was already on screen*. The fifth probe site
  (`validate-vscode-integration.sh:48`) was likewise missed by a sweep that was
  only as wide as the files the investigation had opened — even though the
  parity test already names that file (`embedding-defaults-parity.test.ts:122`).
  Treat any figure below not carried by an explicit `file:line` or a recorded
  command as unmeasured.

## Verified non-issues (recorded so they are not re-litigated)

- **The embedding cache cannot feed stale vectors into a post-switch reindex.**
  `hashContent` prefixes a namespace of `sha256(provider\0model)`
  (`embedding-cache-pg.ts:46-62`), so the global `embedding_cache`
  (`schema.prisma:433-444`) is already provider+model scoped. Residual: it is
  **not** dimension-scoped, so the same provider+model at a changed
  `*_EMBEDDING_DIMENSIONS` collides. Pre-existing, out of scope, recorded.
- **`RETIRED_ROOTS` is not evidence that `projects` is deprecated.** The set at
  `project-identity/apply.ts:732` contains **both** `workspaces` and
  `projects`, and in context means "roots retired on the *source* side of an
  identity merge" — not "deprecated table". The decision to move the
  fingerprint rests on the writer count (0 vs 6), which was measured
  independently, not on this citation.
