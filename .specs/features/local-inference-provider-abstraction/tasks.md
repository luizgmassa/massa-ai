# Tasks — Local inference provider abstraction + LM Studio (LIP)

**Sizing:** 7 Phases = 18 Tasks. Phase groups are max 3 Tasks (ideal 2) with
disjoint write sets, so each Phase can be one worker.

Gate rule: one atomic commit per Task, after its gate passes. Never batch.

## Gate check commands

| Scope | Command |
|---|---|
| Core unit (isolated runner — `bun test` over a directory cross-contaminates) | `cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='<regex>'` |
| Single file | `bun test <path>` |
| Shared / opencode-plugin | `bun test` (plain) |
| Root-level suites (NOT covered by `bun run test`) | `bun run test:scripts` |
| Shell suites | `bash scripts/tests/<name>.sh` |
| Type check | `bun run type-check` (4 pkgs) + `bun run build` (core, shared) |
| Lint (real CI gate) | `bun run lint` — oxlint from repo root, once |
| Plugins | `bun run test:plugins` |
| Live LM Studio | `~/.lmstudio/bin/lms server start` then the task's curl/bun probe |

**Config contamination trap:** a 5001 ms failure usually means the test reached
a live provider through the developer's own `~/.config/massa-ai/config.json`.
Re-run with `XDG_CONFIG_HOME=$(mktemp -d) bun test <file>` before raising any
timeout.

---

## Phase 1 landed (`f5cb0956`, `4fca51e4`) — facts downstream tasks must not re-derive

- **The model-listing endpoint path is `inference-probe.ts`'s private concern.**
  `design.md` §2's 3-arg signature carries no endpoint-path field and neither does
  `InferenceProviderSpec`, so T02 kept the signature and added a module-local
  `LIST_MODELS_PATH: Record<InferenceProviderId, string>` (`ollama: "/api/tags"`,
  `lmstudio: "/v1/models"`). **T05 and T10 must call `probeProvider` rather than
  re-deriving either path** — a second copy of that map is a new divergence
  writer, which is the defect class this whole feature exists to close.
- **`probeProvider` resolves with `new URL(path, baseUrl)` and an absolute path**,
  so any path prefix on `baseUrl` is discarded. Correct for both measured
  defaults (`http://localhost:11434` and `http://localhost:1234/v1` both resolve
  right), wrong for a reverse-proxied provider under a path prefix. Unmeasured
  and out of scope; do not quote it as supported.
- **`bun run test:scripts` was not in Phase 1's gate list** and was run by the
  orchestrator afterwards. See the amendment under T07/T15 for what it showed.

---

## Phase 1 — The seam (2 Tasks) · everything depends on this

### T01 — `inference-providers.ts` + subpath export
**Requirements:** LIP-01 (data half), LIP-04 (tables), LIP-08 (spec record)
**Writes:** `packages/shared/src/config/inference-providers.ts` (new),
`packages/shared/package.json` (one `exports` entry),
`packages/shared/src/__tests__/inference-providers.test.ts` (new)
- Provider spec record for `ollama` + `lmstudio`: ids, default embedding/LLM
  base URLs, env names, `knownDimensions`, `supportsOllamaVersionProbe`,
  `injectsDisableThink`, and the **pure** `parseModelList` functions.
- Seed `knownDimensions` with the measured `text-embedding-nomic-embed-text-v1.5
  → 768`.
- **Must stay side-effect free** — web-ui value-imports it; a transitive reach
  into `config/index.ts` runs `loadConfigSafe()` at module scope (`:632`) and
  breaks the browser. Precedent to mirror: `embedding-dimensions.ts`.
**Gate:** `cd packages/shared && bun test` · `bun run build`
**Discriminating check:** a test imports the module and asserts
`Object.keys(require.cache)`-equivalent reach excludes `config/index.js` — i.e.
the side-effect-freedom is asserted, not assumed.

### T02 — `probeProvider` in `core/kernel`
**Requirements:** LIP-03 (TypeScript half)
**Writes:** `packages/core/src/kernel/inference-probe.ts` (new),
`packages/core/src/__tests__/inference-probe.test.ts` (new),
`packages/core/src/__tests__/fixtures/inference-probe-bodies.json` (new)
- Order: network error → `unreachable`; non-JSON → `non-json`;
  `parseModelList` → `null` → `wrong-shape` **even on HTTP 200**; else
  `reachable`.
- Fixtures are the **recorded** payloads: LM Studio `{"object":"list","data":[…]}`,
  LM Studio error `{"error":"Unexpected endpoint or method. (GET /api/tags)"}`,
  Ollama `{"models":[{"name":…}]}`.
**Gate:** `bun test packages/core/src/__tests__/inference-probe.test.ts`
**Discriminating check:** the LM Studio error body **at status 200** must yield
`reachable:false`. This is the whole point of the task; a test that only feeds
404s proves nothing.

---

## Phase 2 — Config plumbing (2 Tasks)

### T03 — derive the provider lists, close the `cohere` gap
**Requirements:** LIP-01
**Writes:** `packages/shared/src/config/massa-ai-config.ts`,
`packages/shared/src/config/config-writer.ts`,
`apps/web-ui/src/static/views/config-sections.ts` (enum only),
`packages/core/src/services/embeddings/config.ts` (`SELECTABLE_PROVIDERS`),
`scripts/__tests__/provider-list-parity.test.ts` (new)
- Three config lists ← `LOCAL_INFERENCE_IDS ∪ API_PROVIDER_IDS`.
  `SELECTABLE_PROVIDERS` ← that union ∪ internal ids — **this adds `cohere`**,
  which is writable today (`config-writer.ts:138`) but unselectable
  (`config.ts:154-164`).
- Sensor asserts **membership equality between derived consumers**, not the
  absence of array literals — an allowlist over literals cannot tell a fourth
  copy from the three sanctioned ones. Shape: `embedding-defaults-parity.test.ts:290`.
**Gate:** `bun run type-check` · `bun run test:scripts` · `bun run lint`
**Discriminating check:** mutate one derived list by hand and observe the
sensor go **red**; restore. A sensor never seen failing is not a sensor.

### T04 — `lmstudio` alias + env projection
**Requirements:** LIP-02, LIP-08
**Writes:** `packages/shared/src/config/config-loader.ts` (`getConfigForEnv`),
`packages/core/src/services/embeddings/config.ts` (registry entry),
`packages/core/src/services/embeddings/index.ts:54` (stale façade union),
`packages/core/src/services/embeddings/provider.ts:199,221` (cast union)
- `lmstudio` is a **thin alias over the `custom` path**
  (`provider.ts:271-277`), mirroring `local` → `transformers`
  (`config.ts:364-372`). **No new `getEmbeddingModel` case.**
- `getConfigForEnv` gains an `lmstudio` branch; a provider with no branch fails
  by name instead of exporting an empty block.
**Gate:** `cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='embeddings'`
**Discriminating check:** the AC asserts each emitted env name is **read by a
named consumer** — an `lmstudio` branch emitting `LMSTUDIO_*` names nobody
reads must fail. Asserting "a branch exists" is self-answering.

---

## Phase 3 — Runtime behaviours (3 Tasks)

### T05 — health + system route, provider-aware
**Requirements:** LIP-10
**Writes:** `packages/core/src/services/health/local-health-checker.ts`,
`apps/tools-api/src/routes/system.ts`, `apps/tools-api/src/routes/system.test.ts`
- `checkOllama` → `probeProvider`. Add neutral `services.inference` and
  `GET /api/v1/system/inference` **beside** the existing `services.ollama` and
  `/system/ollama` — public compatibility surfaces, never renamed in place.
**Gate:** `cd apps/tools-api && bun run test` · existing `system.test.ts:83`,
`:127-129` must stay green **unmodified**.

### T06 — gate the two Ollama-only LLM behaviours
**Requirements:** LIP-07, LIP-09
**Writes:** `packages/core/src/services/memory/llm-client.ts`,
`packages/core/src/__tests__/llm-client.test.ts`,
`packages/core/src/__tests__/llm-client-json-schema.test.ts`
- `_checkJsonSchemaSupport` `/api/version` probe (`:67-100`) runs only when
  `spec.supportsOllamaVersionProbe`; LM Studio returns `true` (native OpenAI
  `response_format`), **not** the current silent downgrade to `json_object`.
- `_wrapFetchDisableThink` (`:184-202`) applies only when
  `spec.injectsDisableThink`.
**Gate:** `cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='llm-client'`
**Discriminating check:** with provider `lmstudio`, assert **no** request to
`/api/version`, **no** `think` key in any body, and json-schema **enabled**.

### T07 — provider-aware dimension resolution
**Requirements:** LIP-04
**Writes:** `packages/shared/src/config/embedding-dimensions.ts`,
`packages/shared/src/__tests__/embedding-dimensions.test.ts`
- Merge each provider's `knownDimensions`. Unknown model + reachable endpoint →
  **probe one real embed and read `embedding.length`**. Unknown model +
  unreachable → **throw**, naming model and endpoint. The `2560` catch-all dies.
- **COLLAPSE, do not add (measured after Phase 1, 2026-09-19).** T01 shipped
  `INFERENCE_PROVIDERS.ollama.knownDimensions` as a byte-identical copy of
  `embedding-dimensions.ts`'s `KNOWN_EMBEDDING_DIMENSIONS` — a **fourth** writer
  of the model→width table, in the module whose own docblock states the defect
  class here "has always been divergence between writers". `embedding-dimensions.ts`
  must **derive** from `inference-providers.ts` and `KNOWN_EMBEDDING_DIMENSIONS`
  must be **deleted**, not left beside it. Leaving two agreeing tables is the
  failure mode, not the safe state.
**Paired baseline to re-measure after this task** (`bun test
scripts/__tests__/embedding-defaults-parity.test.ts`, scratch `XDG_CONFIG_HOME`):
main@d523f06f and branch@4fca51e4 both report **width-writer scan population: 4**
and **model→width entries — bash 4, TypeScript 4**, both 7 pass / 0 fail. The
completeness population moved 25 → 27; the width-writer population did **not**
move, which is the whole finding.
**Gate:** `cd packages/shared && bun test` · live check:
`resolve("text-embedding-nomic-embed-text-v1.5")` → **768**

---

## Phase 4 — Index invalidation (2 Tasks) · the correctness core

### T08 — `workspaces.embedding_fingerprint` + stamp
**Requirements:** LIP-15 (write side)
**Writes:** `packages/core/prisma/migrations/<ts>_add_embedding_fingerprint/migration.sql`
(new, becomes migration 25), `packages/core/prisma/schema.prisma`,
`packages/core/src/data/symbol/symbol-repo-workspace.ts`
- Column on **`workspaces`**, not `projects` — `projects` has **0** production
  writers (measured), `workspaces` has 6 and `projectId String @id` is exactly
  one row per project (`schema.prisma:126-131`).
- Stamp inside the existing upsert (`symbol-repo-workspace.ts:23`,
  `ON CONFLICT (project_id) DO UPDATE`), **only** from the clearing branch.
**Gate:** `cd packages/core && bunx prisma migrate deploy` then
`bun scripts/run-tests-isolated.ts --filter='workspace'`
**Discriminating check:** read the column back after a real index run and
assert it is **not NULL**. Observe the write; do not assume the table.

### T09 — read gate + write gate
**Requirements:** LIP-15 (both gates)
**Writes:** `packages/core/src/services/search/project-indexer.ts`,
the search entry path, `packages/core/src/__tests__/embedding-fingerprint.test.ts` (new)
- **Read gate:** fingerprint mismatch → `EmbeddingIndexStaleError` naming both
  fingerprints and the reindex command. Never returns rows.
- **Write gate:** mismatch added to `needsFullReindex` (`:406-409`), which today
  fires only on `no_index | path_mismatch | > maxSyncFiles` — **a model change
  is not in that list**, so without this a user obeying the reindex instruction
  takes the incremental branch (`:480`) and mixes two embedding spaces.
**Gate:** `cd packages/core && bun scripts/run-tests-isolated.ts --filter='fingerprint|project-indexer'`
**Discriminating check (two, both required):** (1) width-identical model change
→ search raises rather than returning rows; (2) same-width change followed by an
**incremental** reindex request → run was forced full, table holds no row older
than the stamp.

---

## Phase 5 — Installers (3 Tasks)

### T10 — bash probes stop trusting the status code
**Requirements:** LIP-03 (bash half)
**Writes:** `install.sh`, `scripts/setup-local-first.sh`,
`scripts/validate-vscode-integration.sh`, `scripts/ensure-ollama.sh`,
`scripts/__tests__/probe-dialect-parity.test.ts` (new)
- All **five** sites, including `validate-vscode-integration.sh:48` — the one
  the first sweep missed, and the weakest (`curl -s` with no `-f`).
- `install.sh` keeps `curl`: it runs under `curl | bash` with **no checkout**
  (`install_docker()` probes at `:911` after only `preflight_docker`), so no
  bun heredoc is possible. Body-key grep instead.
- Parity test feeds the **same recorded fixtures** to `probeProvider` and to the
  bash function via `bash -c`, asserting identical verdicts. Precedent:
  `embedding-defaults-parity.test.ts:319`.
**Gate:** `bun run test:scripts` · `bash -n` on each edited script

### T11 — detection, restricted menu, non-interactive
**Requirements:** LIP-12, LIP-13, LIP-16, LIP-05
**Writes:** `scripts/setup-local-first.sh`,
`scripts/lib/installer-feature-prompts.sh`,
`scripts/tests/test-lms-model-exists.sh` (new)
- Detect via `config.json` → `embedding.provider`. **Menu is symmetric** (user
  annotation): fresh → both; `ollama` → **LM Studio only** (migration);
  `lmstudio` → **Ollama only** (migration); API provider → untouched, no menu.
  Both directions go through one `migrate_provider <from> <to>`, so the body
  and its ACs are written once — not a second untested half.
- `MASSA_AI_INFERENCE_PROVIDER`, `die` on unknown value
  (`MASSA_AI_MODE`/`MASSA_AI_DB_BACKEND` pattern). Honour
  `installer_can_prompt()` (`:131-136`).
- **`ollama_model_exists` stays byte-identical** (`test-setup-ollama-model-exists.sh:26`
  extracts it by literal `sed`). Add sibling `lms_model_exists`; dispatch lives
  in a **third** function. **Do not rename `OLLAMA_URL` / `OLLAMA_HAS_CLI`** —
  the suite injects them itself (`:87-88`) while the installer supplies them
  (`setup-local-first.sh:131`,`:135`), so a rename breaks runtime while the
  suite stays green.
- Bash 3.2 only. Menu shape: `install.sh:147-166`.
**Gate:** `bash scripts/tests/test-setup-ollama-model-exists.sh` (**unmodified,
must stay green**) · `bash scripts/tests/test-lms-model-exists.sh`

### T12 — parameterised config write + LM Studio install
**Requirements:** LIP-06, LIP-14
**Writes:** `scripts/lib/installer-api-key.sh`, `scripts/setup-local-first.sh`
- `installer_write_config` (`:204+`) emits embedding/llm from provider
  variables, dropping the three hardcoded Ollama literals (`:220-229`).
- `installer_embedding_dimensions` (`:110-118`, `*) → 2560`) delegates to T07's
  resolver via a bun heredoc (available here — the wizard runs from a checkout).
- Install path: `curl -fsSL https://lmstudio.ai/install.sh | bash`,
  `lms daemon up`, `lms get -y <model>` (verified scriptable). **Check
  `~/.lmstudio/bin/lms` before `command -v lms`** — the CLI is not on PATH until
  bootstrapped; that exact false negative occurred during investigation.
**Gate:** `bash scripts/tests/test-setup-local-first-api-key.sh` (existing
contract must round-trip) · new case asserting an LM Studio write

---

## Phase 6 — Surfaces and gates (3 Tasks)

### T13 — both config CLIs
**Requirements:** LIP-11
**Writes:** `apps/mcp-client/src/config-cli.ts`,
`apps/opencode-plugin/src/config-cli.ts`, and both mirrored test files
- Copy-forks, not delegation. `use` allowlists widen from 3 to the writable set.
**Gate:** `cd apps/mcp-client && bun run test` · `cd apps/opencode-plugin && bun test`

### T14 — Web UI
**Requirements:** LIP-19
**Writes:** `apps/web-ui/src/static/views/config-sections.ts` (guide prose),
`apps/web-ui/src/__tests__/fixtures/render-golden.json`,
`apps/web-ui/src/__tests__/fixtures/config-get.json`,
`apps/web-ui/src/__tests__/config-forms.test.ts`,
`apps/tools-api/src/routes/config-section-coverage.test.ts`
- Golden is frozen at a commit deliberately (`render-golden.test.ts:11-14`).
  Regenerate with `MASSA_AI_WRITE_GOLDEN=1 bun test src/__tests__/render-golden.test.ts`
  and **review the diff** — a careless regeneration hides unrelated drift.
**Gate:** `cd apps/web-ui && bun run test` · `bun run type-check`

### T15 — parity gate generalisation
**Requirements:** LIP-18, LIP-19b, LIP-20
**Writes:** `scripts/__tests__/embedding-defaults-parity.test.ts`, `turbo.json`,
`.env.example`
- Re-key Tier-3 on `_EMBEDDING_(MODEL|DIMENSIONS)` with **any** prefix — today
  it skips files lacking the literal `OLLAMA_EMBEDDING_` (`:203`), so an
  `LMSTUDIO_*` pair is invisible and the gate goes **green** over an unchecked
  pair.
- Re-anchor `referencePair()` (`:47`) and rewrite its comment (`:43-46`) in the
  **same** commit — LIP-01 deletes the union it names as its discriminator.
- Any new `MASSA_AI_*` var → `turbo.json` `passThroughEnv` (AD-010).
- **The width-writer scan is blind to `inference-providers.ts` (measured, not
  predicted).** Paired runs on main@d523f06f and branch@4fca51e4 both print
  `width-writer scan population: 4 — apps/mcp-client/src/config-cli.ts,
  apps/opencode-plugin/src/config-cli.ts,
  packages/core/src/services/embeddings/config.ts,
  packages/shared/src/config/massa-ai-config.ts`. The new seam module is absent
  from that membership while carrying a model→width table. If T07 collapsed the
  duplicate as required, assert the membership **still equals its sanctioned
  set** after the collapse; if a table legitimately remains in the seam, add it
  to the membership and observe a red on it.
**Gate:** `bun run test:scripts`
**Discriminating check:** induce a deliberate red on the **LM Studio** pair
specifically and observe it. A gate never seen failing on its new subject is
unquotable as a sensor for that subject.

---

## Phase 7 — Docs, measurement, close-out (3 Tasks)

### T16 — README, FEATURES, CHEATSHEET
**Requirements:** LIP-17
**Writes:** `README.md`, `FEATURES.md`, `docs/CHEATSHEET.md`
- Surfaces are enumerated with line numbers in the spec. **`FEATURES.md:34` is
  a TOC anchor `#local-first-llm-ollama`** — heading and anchor move together
  or the link breaks.
- Every changed command is **executed once** before it is written down.
**Gate:** `bun run lint` · manual link check on the TOC anchor

### T17 — measurement (LIP-22)
**Requirements:** LIP-22
**Writes:** `.specs/features/local-inference-provider-abstraction/validation.md`
(inputs section)
- `bun run bench:needles` at 768 recorded **as a number** beside the 2560
  baseline. 768 leaves the binary-quantization path entirely
  (`postgres-vector-store.ts:267-270`, `:329`, `:363`) — a retrieval-algorithm
  change, not a width change. A promise to measure later is not acceptable.
**Gate:** the recorded figure exists in `validation.md`

### T18 — CHANGELOG + `.specs` close-out
**Requirements:** LIP-21
**Writes:** `CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`,
`.specs/project/FEATURES.json`
- CHANGELOG under `[Unreleased]` per `CONTRIBUTING.md` § CHANGELOG authoring —
  the heading drives the release bump. CI fails a PR that does not touch it.
- **Never write the skip-ci marker literally** in a commit message or PR body.
- Committed **before** the first push, so delivery stage 3.5 is a no-op.
**Gate:** `bun skills/massa-ai/scripts/check_specs_delivered.ts local-inference-provider-abstraction --root .`

---

## Test Coverage Matrix

| Requirement | Sensor | Task |
|---|---|---|
| LIP-01 | membership-equality parity test + observed red | T03 |
| LIP-02 | emitted-name-is-read assertion | T04 |
| LIP-03 | 200-with-error-body → `reachable:false`; TS↔bash dialect parity | T02, T10 |
| LIP-04 | `…nomic-embed-text-v1.5` → 768; unknown+unreachable throws | T07 |
| LIP-05 | existing shell suite green unmodified + sibling suite | T11 |
| LIP-06 | existing api-key contract round-trips + LM Studio write case | T12 |
| LIP-07 | no `/api/version` call, no `think` key, json-schema enabled | T06 |
| LIP-08 | live 768-length vector via the alias | T04 |
| LIP-09 | config round-trip | T04, T12 |
| LIP-10 | `system.test.ts` green unmodified + neutral siblings | T05 |
| LIP-11 | both CLI test files assert the new provider | T13 |
| LIP-12/13/16 | fixture-driven detection + menu + `die` on bad env | T11 |
| LIP-14 | detection succeeds with `lms` off PATH | T12 |
| LIP-15 | 4 cases: 2 read-gate, 2 write-gate | T08, T09 |
| LIP-17 | TOC anchor intact; commands executed before written | T16 |
| LIP-18/19b | observed red on the **LM Studio** pair | T15 |
| LIP-19 | golden regenerated + diff reviewed | T14 |
| LIP-20 | `turbo-passthrough-env.test.ts` | T15 |
| LIP-21 | `check_specs_delivered.ts` exit 0 | T18 |
| LIP-22 | recorded needles figure at 768 | T17 |

## Dependencies

```
T01 ──┬── T02 ── T05, T10
      ├── T03 ── T04 ── T06, T13, T14
      └── T07 ── T12
T08 ── T09                    (independent of the seam; can run in parallel)
T10, T11, T12                 (T11 after T10; T12 after T07)
T15 after T03                 (it re-anchors on what T03 changes)
T16, T17, T18 last            (T17 needs T04+T07+T08+T09 landed to measure)
```
