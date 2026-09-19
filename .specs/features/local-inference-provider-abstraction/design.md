# Design — Local inference provider abstraction + LM Studio (LIP)

**Feature slug:** `local-inference-provider-abstraction`
**Spec:** `.specs/features/local-inference-provider-abstraction/spec.md`
**Status:** Design v2 — revised after the Plan Challenge gate (`pre_mortem`) and
an architecture review. **v1 is superseded; five of its load-bearing premises
were falsified against source.** The corrections are recorded in §0 rather than
deleted, because each one is a trap the next reader would otherwise re-enter.

## 0. What v1 got wrong (measured, 2026-09-19)

| v1 claim | Reality | Where it was wrong |
|---|---|---|
| Fingerprint on `projects` | `projects` has **zero** production writers — `grep -rEn "(INSERT INTO\|UPDATE) +\"?projects\"?\|\.project\.(create\|upsert\|update)\(" --include='*.ts' packages apps scripts \| grep -v __tests__` → **0 rows**. `workspaces` has 6 (`symbol-repo-workspace.ts:23,71,109,155`, `graph-generation-repository-pg.ts:208,226`). A column there is `NULL` forever, i.e. permanently in the "legacy, never block" branch — the mechanism disables itself | §5 |
| Stamp in the `IndexJob` transaction | `IndexJob` is `@id jobId` with `projectId` only a plain `@@index` (`schema.prisma:575`) — per-job, not per-project. It cannot carry a per-project fingerprint | §5 |
| "A successful index run" is the write barrier | `needsFullReindex` fires only on `no_index \| path_mismatch \| filesToReindex.length > maxSyncFiles` (`project-indexer.ts:406-409`). **A model change is not in that list**, so the incremental branch (`:480`) writes new-model vectors beside old-model rows in the same table and then stamps a fingerprint that agrees with itself | §5 |
| "Nothing else reaches all three tiers", so the seam goes in `shared` | False: `scripts/verify-tree-sitter-grammars.ts:18` and `scripts/needles-rename-control.ts:113` already import `../packages/core/src/services/…` by relative path. And `shared` has **zero** network calls today, while web-ui's `config-sections.ts:11-17` uses `import type` *deliberately* so "the browser never loads the server config module" (`config/index.ts:632` runs `loadConfigSafe()` at module scope) | §1 |
| Bash reads the seam via a `bun` heredoc | Not on the Docker path: `install.sh` is `curl \| bash` with **no checkout**, and `install_docker()` calls `detect_ollama_url` at `:911` after only `preflight_docker`/`resolve_ports`/`mkdir` (`:902-911`). No repo, no guaranteed bun | §1 |
| R3: the parity gate will fail as "ambiguous" | Inverted. Every extractor is anchored on the literal token `OLLAMA_EMBEDDING_` (`embedding-defaults-parity.test.ts:77-100`) and Tier-3 skips any file lacking it (`:203`). A `LMSTUDIO_EMBEDDING_*` pair is **invisible** — the gate goes **green** over an unchecked second model/width pair | §7 |
| Spec: "768 has no pre-created HNSW index" | HNSW *is* created at 768 (`postgres-vector-store.ts:287-296`). The real consequence is different and unnamed — see §7 R8 | spec |

Two further sites the v1 enumeration missed, both found by review rather than by
my own sweep:

- `scripts/validate-vscode-integration.sh:48` — a **fifth** status-trusting
  probe, and the weakest: `curl -s --max-time 2 "${OLLAMA_URL}/api/tags"` with
  **no `-f`**, so it succeeds on any HTTP response at all.
- `cohere` is in all three config allowlists but **absent** from core's
  `SELECTABLE_PROVIDERS` (`embeddings/config.ts:154-164`, 9 members). So
  `config-writer.ts:138` accepts a value core cannot select, and
  `config.ts:147-150` names `cohere` as exactly the case that "would otherwise
  fall through to the ollama default silently". A shipped inconsistency.

## 1. Where the seam lives — split by I/O, not by tier

v1 put everything in `packages/shared`. Two constraints forbid that:

1. **The browser.** `config-sections.ts` must be able to *value*-import the
   provider id list for its enum (`:46`). Today it imports `MassaAiConfig` as
   `import type` on purpose (`:11-17`), because a value import resolves to
   `@massa-ai/shared` → `config/index.ts`, which runs `loadConfigSafe()` at
   module scope (`:632`) — an fs read in a browser with no bundler
   (`index.html:61` loads raw `<script type="module">`).
2. **Network I/O.** `packages/shared/src/` holds `config/`, `bootstrap/`,
   `profile-switch/`, `types/`, `utils/` and makes **zero** network calls.
   `probeProvider` would be the first.

Therefore:

| Piece | Home | Why |
|---|---|---|
| Provider ids, default URLs, env names, dimension tables, **pure** `parseModelList` functions | `packages/shared/src/config/inference-providers.ts`, exposed through a **new `"./inference-providers"` subpath export** | Side-effect-free, so web-ui can value-import it without dragging `config/index.ts`. Exact precedent: `embedding-dimensions.ts` — a pure table plus pure functions, zero I/O |
| `probeProvider` (network) | `packages/core/src/kernel/` | `kernel/` is the repo's declared home for cross-tier leaves (`packages/core/src/index.ts`); any tier may import it, it imports no tier. Reachable from scripts the same way `verify-tree-sitter-grammars.ts:18` already reaches core |

`packages/shared/package.json` gains one `exports` entry. That is the whole
packaging cost.

### Bash cannot share the module — so bash gets a parity gate instead

`install.sh` runs under `curl | bash` with no checkout, so the TypeScript seam
is unreachable there. The honest design is **two implementations with a test
that pins them together**, not a pretend single source:

- Bash keeps `curl`, but stops trusting the status code. The body check is a
  literal-key grep, which is all bash needs to discriminate the two measured
  shapes: Ollama `{"models":[…]}` vs LM Studio `{"data":[…]}`, and
  `{"error":…}` matches neither.
- `scripts/__tests__/` gains a test that feeds the **same recorded fixture
  bodies** to the TypeScript `probeProvider` and to the bash function
  (via `bash -c`), asserting identical verdicts. Fixtures are the payloads
  measured in the spec, checked in.

This is the same shape as the existing cross-dialect assertion in
`embedding-defaults-parity.test.ts:319` (`expect(tsPairs).toEqual(shellPairs)`)
— a proven in-repo pattern, not an invention.

## 2. Probing by body shape, not status (LIP-03)

Measured: LM Studio answers **200 with `{"error":"Unexpected endpoint or
method. …"}`** for `/api/version`, `/api/tags` and `/api/embed`. `res.ok`
therefore carries no information.

```ts
// packages/core/src/kernel/inference-probe.ts
export async function probeProvider(
  spec: InferenceProviderSpec, baseUrl: string, timeoutMs = 3000,
): Promise<{ reachable: boolean; models: string[]; reason?: string }>
```

Order: network error/timeout → `unreachable`; non-JSON → `non-json`;
`spec.parseModelList(body)` returns `null` → `wrong-shape` **even on 200**;
else `{reachable:true, models}`.

Pure parsers (in `shared`, so both the probe and the tests import them):

- Ollama: `body.models` must be an **array**; map `.name`. Else `null`.
- LM Studio: `body.data` must be an **array**; map `.id`. Else `null`.

`{"error": …}` fails both by construction.

### All five call sites (v1 listed four)

| Site | Today | After |
|---|---|---|
| `local-health-checker.ts:40-44` | trusts `response.ok`, `.models \|\| []` | `probeProvider` |
| `scripts/diagnose.ts:138-178` | `/api/tags` + **substring** model match (`:165`) | `probeProvider` + exact match |
| `install.sh:138`, `:243` | `curl -sf …/api/tags` | `curl` + body-key grep (§1) |
| `setup-local-first.sh:67`, `:453` | `curl /api/tags` | same |
| **`scripts/validate-vscode-integration.sh:48`** | `curl -s` with **no `-f`** — succeeds on any response | same |

`provider.ts:712-733` (`isAvailable` pre-check) is **unchanged**: it is inside
the Ollama-native branch, which LM Studio never enters.

### Compatibility (LIP-10)

`services.ollama` (`local-health-checker.ts:16`) and `GET /api/v1/system/ollama`
(`system.ts:172-195`) are public surfaces. They keep answering; neutral
`services.inference` / `GET /api/v1/system/inference` are added **beside**
them. `system.test.ts:83`, `:127-129` stay untouched and gain siblings.

## 3. `lmstudio` is an alias, not an implementation (LIP-08)

`custom` already does the job: `provider.ts:271-277` is
`createOpenAI({baseURL, apiKey: apiKey ?? "none"}).embedding(model)`, and
`.env.example:238-241` **already documents LM Studio as the `custom` provider**
with `CUSTOM_EMBEDDING_BASE_URL=http://localhost:1234/v1`.

Documenting `custom` instead of adding an id saves nothing, because `custom` is
itself unwritable to `config.json` (`massa-ai-config.ts:37`,
`config-writer.ts:138`, `config-sections.ts:46`) — the same three-list widening
is due either way.

The real discriminator is the **LLM side**: §4 gates two behaviours on provider
identity, and `custom` has no identity to gate on. The installer menu needs a
name too.

So `lmstudio` is a thin registry entry pointing at the `custom` code path,
mirroring the `local` → `transformers` alias that already exists at
`embeddings/config.ts:364-372` — including its docblock's reason for being a
separate entry rather than a self-reference. **No new SDK adapter, no new
`getEmbeddingModel` case.**

## 4. Gating the two Ollama-only LLM behaviours (LIP-07)

| Behaviour | Today, against LM Studio | After |
|---|---|---|
| `_checkJsonSchemaSupport` `/api/version` (`llm-client.ts:67-100`) | 200, `body.version` undefined → `version=""` → regex fails → warns, returns `false` → **downgrades LM Studio to `json_object`** | Runs only when `spec.supportsOllamaVersionProbe`. LM Studio returns `true` — it implements OpenAI `response_format: {type:"json_schema"}` natively |
| `_wrapFetchDisableThink` (`:184-202`) | injects top-level `think:false` into every body | Applied only when `spec.injectsDisableThink` |

Provider identity for the LLM side comes from `llm.baseUrl`'s host:port matched
against the specs, with `embedding.provider` as tiebreaker. Both keys already
exist; no new config key (preserves R1).

## 5. Index invalidation (LIP-15) — corrected mechanism

### Grain is right, table and barrier were both wrong

Per-project grain is correct: one `vector_documents_<N>d` table holds **many**
projects, scoped by a bare `project_id` column with no FK (inserts
`postgres-vector-store.ts:385-398`, search `:574-576`). So the fingerprint
cannot live on the table, and must live on a per-project row.

`workspaces` is that row: `projectId String @id @map("project_id")`
(`schema.prisma:126-131`) — a primary key, one row per project — carrying
`status` and `lastIndexedAt`, upserted on every index run
(`symbol-repo-workspace.ts:23`, `ON CONFLICT (project_id) DO UPDATE`).

```
ALTER TABLE workspaces ADD COLUMN embedding_fingerprint TEXT;
```

Fingerprint = `${provider}:${model}:${dimensions}`.

### The write barrier is the real fix

Stamping "when an index run finished" asserts the wrong thing — it asserts a
run happened, not that every row in the table came from this model. With
`needsFullReindex` blind to model changes (`project-indexer.ts:406-409`), an
incremental reindex after a model switch mixes two embedding spaces and then
stamps a fingerprint that agrees with itself. Both halves are required:

1. **Read gate.** Search compares the stored fingerprint to the live one;
   mismatch → `EmbeddingIndexStaleError` naming both fingerprints and the
   reindex command. Never returns rows.
2. **Write gate.** A fingerprint mismatch is added to `needsFullReindex`
   (`project-indexer.ts:406-409`), so a stale project **cannot** take the
   incremental branch. The stamp is written **only** from the clearing branch.

| Stored value | Meaning | Behaviour |
|---|---|---|
| `NULL` / no row | Legacy, or never indexed | Warn once, do not block; stamped by the next full reindex |
| equals current | Consistent | Normal |
| differs | Provider and/or model changed | Read gate blocks; write gate forces full reindex |

**Verified non-issue, recorded because it is the obvious objection:** the global
`embedding_cache` (`schema.prisma:433-444`) cannot feed stale vectors into a
post-switch reindex — `hashContent` prefixes a namespace of
`sha256(provider\0model)` (`embedding-cache-pg.ts:46-62`), so it is already
provider+model scoped. Residual: it is **not** dimension-scoped, so the same
provider+model at a changed `*_EMBEDDING_DIMENSIONS` collides. Pre-existing,
out of scope, recorded.

## 6. The provider lists (LIP-01) — corrected target

v1 aimed at drift between `massa-ai-config.ts:37`, `config-writer.ts:14` and
`config-sections.ts:46`. Measured: those three are **byte-identical** and have
never drifted. A sensor over them would certify agreement that already holds —
the exact "widening a gate's subject list can be a no-op" failure.

The live divergence is against core:

| Population | Members |
|---|---|
| the three config lists | ollama, mistral, openai, google, cohere (**5**) |
| `SELECTABLE_PROVIDERS` (`embeddings/config.ts:154-164`) | ollama, mistral, google, openai, vercel, litellm, custom, transformers, local (**9, no `cohere`**) |
| both `config-cli.ts` `use` allowlists (`:242-243`) | ollama, mistral, openai (**3**) |

Three memberships, and `cohere` is writable-but-unselectable today.

**Design decision:** the seam owns the **local-inference** ids (`ollama`,
`lmstudio`). The three config lists are derived as `LOCAL_INFERENCE_IDS ∪
API_PROVIDER_IDS`. `SELECTABLE_PROVIDERS` is derived as that union ∪ the
internal ids (`vercel`, `litellm`, `custom`, `transformers`, `local`) — which
**adds `cohere` to the selectable set**, closing the shipped gap rather than
freezing it behind a green test. The `config-cli.ts` 3-member lists are widened
to the same writable set; keeping them at 3 was not a decision, it is drift.

**The sensor** asserts **membership equality between the derived consumers**,
not the syntactic absence of array literals — an allowlist-based literal scan
cannot distinguish a fourth copy from the three sanctioned ones, and this
repo's own rule says an allowlisted exception is indistinguishable from a new
violation (`CLAUDE.md`, `kernel/`). Shape precedent in-repo:
`embedding-defaults-parity.test.ts:290`
(`expect(matched.sort()).toEqual([...KNOWN_WIDTH_WRITERS].sort())`).

## 6b. Installer flow (LIP-12 → LIP-16)

*(This section was dropped in the v2 rewrite by mistake and is restored here,
already carrying the user's symmetry annotation.)*

Detection and menu are inserted in `setup-local-first.sh` phase [1/6]
(`:53-113`), which today checks Ollama unconditionally.

```
read config.json → embedding.provider        (bun heredoc; LIP-12)
   absent                  → fresh install    → menu: Ollama | LM Studio
   "ollama"                → existing/ollama  → menu: LM Studio only  (migration)
   "lmstudio"              → existing/lmstudio→ menu: Ollama only     (migration)
   other (mistral/openai…) → API provider     → untouched, no menu
```

**The menu is symmetric** (user annotation, 2026-09-19): the installer always
offers the provider you are *not* using, presented as a migration. One rule, no
special case, no dead end. Both directions share **one** code path —
`migrate_provider <from> <to>` — so the migration body, the LIP-15
invalidation and the acceptance criteria are written and tested once. An
earlier draft let the LM Studio side offer nothing, which would have shipped a
second, untested half.

Non-interactive (`installer_can_prompt()` false, `:131-136`) or
`MASSA_AI_INFERENCE_PROVIDER` set → no menu; an unrecognised value calls `die`,
following `MASSA_AI_MODE` / `MASSA_AI_DB_BACKEND` (LIP-16). Menu shape copies
`select_mode()` (`install.sh:147-166`); bash 3.2 only
(`installer-feature-prompts.sh:10-11`).

`migrate_provider` body:

1. Ensure the target runtime. For LM Studio, check **`~/.lmstudio/bin/lms`
   before `command -v lms`** — the CLI is not on PATH until bootstrapped, the
   exact false negative hit during investigation. Install via
   `curl -fsSL https://lmstudio.ai/install.sh | bash` when absent; `lms daemon up`.
2. Start/confirm the server with the §2 body-shape probe.
3. Pick the embedding model (`lms ls` / `ollama list`); resolve its width by §3,
   live-probing when unknown.
4. Write `embedding` and `llm` through the parameterised `installer_write_config`
   (LIP-06). `savePartialConfig` replaces a whole top-level section
   (`config-writer.ts:432`), so no stale field of the old provider survives —
   that is the clean hook, not a field-by-field edit.
5. Nothing heavy runs here. The fingerprint now differs, so §5's read gate
   blocks search and prints the reindex command, and §5's write gate forces
   that reindex to be a full one.
6. The old runtime is left installed and untouched; D3's CLI reversal still
   applies on top of the symmetric menu.

**`ollama_model_exists` stays byte-identical** (LIP-05): its suite extracts it
with `sed -n '/^ollama_model_exists()/,/^}/p'`
(`test-setup-ollama-model-exists.sh:26`) and `bash -n`-parses the result
(`:35`). A sibling `lms_model_exists` is added and the provider dispatch lives
in a **third** function — no existing line moves, and `OLLAMA_URL` /
`OLLAMA_HAS_CLI` are **not** renamed (R6).

## 7. Risks

| # | Risk | Mitigation | Residual |
|---|---|---|---|
| R1 | `config-sections.ts` mapped type over `keyof MassaAiConfig` (`:19`,`:36`) — a new config key with no section fails `type-check` | No new top-level config key; the spec record is code, not config | Low |
| R2 | 406 KB `render-golden.json` is frozen at a commit on purpose (`render-golden.test.ts:11-14`) | Regenerate via the documented `MASSA_AI_WRITE_GOLDEN=1` path; review the diff | Medium |
| **R3 (rewritten)** | The parity gate goes **green** over a `LMSTUDIO_EMBEDDING_*` pair, because every extractor and the Tier-3 filter key on the literal `OLLAMA_EMBEDDING_` (`:77-100`, `:203`) | Re-key Tier-3 on the provider-neutral token `_EMBEDDING_(MODEL\|DIMENSIONS)` with any prefix; add the LM Studio pair to the width-writer membership set | Medium |
| **R4 (new)** | LIP-01 **deletes** the type union that `referencePair()` uses as its documented discriminator — `/embedding:\s*(\{[^}]*provider:\s*"ollama",[^}]*\})/g` (`:47`), explained at `:43-46` | Re-anchor the extractor and rewrite its comment **in the same edit**; never leave a comment describing a mechanism that no longer exists | Medium |
| R5 | Two forked `config-cli.ts` files drift | Change both in one task; both mirrored tests assert it | Low |
| **R6 (rewritten)** | `ollama_model_exists` byte-identity is verified by `sed` extraction (`test-setup-ollama-model-exists.sh:26`) + `bash -n` (`:35`) — but the suite **injects the globals itself** (`OLLAMA_URL`, `OLLAMA_HAS_CLI`, `:87-88`) while the real function reads them from installer scope (`setup-local-first.sh:131`,`:135`). Renaming those globals for provider neutrality breaks runtime under `set -euo pipefail` while the suite stays **green** | Do not rename those globals. If neutrality requires it, add a caller-contract assertion in the same task | Medium |
| R7 | No chat model in LM Studio → LIP-07/LIP-09 unverifiable live | **Closed 2026-09-19:** user chose to pull a small instruct model via `lms get -y <model>`. LIP-07/LIP-09 now carry a live sensor; a stubbed-only result for either is a FAIL | **Closed** |
| **R8 (new)** | 768 silently leaves the binary-quantization search path. `createVectorIndex` branches at `>2000` (`postgres-vector-store.ts:267-270`); `bqEnabled` is set only inside that branch (`:329`,`:363`) and governs `:382`, `:500`, `:556`, `:695`. At 2560 the store runs BQ+rerank; at 768 it runs none. **A different retrieval algorithm, not a different width** | Not preventable — it is inherent to the model's width. Measure it: one `bun run bench:needles` run at 768 recorded in `validation.md` as a number | **Accepted, unmeasured until Execute** |
| **R9 (new)** | D3's "reversible" round trip is **lossy**: `savePartialConfig` replaces the whole `embedding` section (`config-writer.ts:432`) and there is no per-provider sub-object, so a user on a non-default Ollama model who switches away and back lands on the CLI's literal default and pays a second reindex | Document in D3; do not add a per-provider config shape (that reopens R1) | Accepted |
| **R10 (new)** | LIP-02's AC is self-answering — asserting "a branch exists" never asserts the emitted names are **read**. `getConfigForEnv` emits `OLLAMA_EMBEDDING_MODEL`/`OLLAMA_BASE_URL`/`OLLAMA_EMBEDDING_DIMENSIONS` (`config-loader.ts:463-466`) consumed at `embeddings/config.ts:232`,`:247`,`:261` and `local-health-checker.ts:23`,`:43`. An `lmstudio` branch emitting names nobody reads passes the AC and exports nothing | The AC asserts the emitted names are read by a named consumer, not that a branch exists | Medium |

## 8. Out of design scope

`needles-gate.yml` (non-blocking, `workflow_dispatch`-only — **but it is the
only instrument for R8, so R8's measurement is run manually, not via the
workflow**), `setup-ollama-wsl.sh` + its orphaned `.md`, `docs/ONBOARDING.md`,
`skills/massa-ai/references/installation.md`, Ollama's native embed fast path,
a general provider-plugin registry, and the `embedding_cache` dimension-scoping
residual noted in §5.
