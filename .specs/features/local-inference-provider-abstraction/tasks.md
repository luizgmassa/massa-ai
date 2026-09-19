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

## Known red carried from Phase 2 until T14 — report web-ui failures BY NAME, never by count

`cd apps/web-ui && bun run build && bun test` is **782 pass / 2 fail** from
`7987443d` onward. The two failures are exactly:

- `render golden fixture (pre-split behavior, frozen at 6a0b1c2d) > renderConfig/read renders byte-identically`
- `render golden fixture (pre-split behavior, frozen at 6a0b1c2d) > renderConfig/write renders byte-identically`

Cause: T03 added `lmstudio` to `config-sections.ts`'s enum, and the 406 KB
`render-golden.json` is frozen at a commit deliberately
(`render-golden.test.ts:11-14`). **T14 owns regenerating it**, and it is left
red on purpose rather than regenerated twice, because T14 also edits that file's
guide prose.

**The hazard this creates is the point of this note.** A worker that reports
"web-ui: 2 pre-existing failures" by count cannot tell this known pair from a
third failure it just introduced. Phase 1 already made exactly that mistake in
`packages/shared` — it reported a pre-existing 904/1 that did not exist, because
its baseline was measured in the same broken state as its subject. So: quote the
failing **test names**, and if any name outside the two above appears, it is
yours. The paired baselines that settle it are main@d523f06f and this branch, run
with a scratch `XDG_CONFIG_HOME`.

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
- **`config-sections.ts` cannot be a derived consumer** (measured; see
  `design.md` §1 "Correction"). `apps/web-ui` builds with plain `tsc`, no
  bundler, and `index.html:61` loads a raw `<script type="module">` with no
  import map — a value import would emit an unresolvable bare specifier and
  break `/ui` at load. Its enum **stays a literal**; the sensor pins it by
  **reading the file as text** and asserting membership equality against the
  derived set. Same technique the parity test already uses across the
  bash/TypeScript split. Do not add an import to that file, and do not add an
  import map or a bundler — both are out of scope.
- `turbo.json` has `OLLAMA_BASE_URL` in `tasks.test.passThroughEnv` (`:40`) and
  **no** `LMSTUDIO_*`. That file is **T15's** write set — do not edit it here;
  report the omission so T15 closes it.
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
  class here "has always been divergence between writers". The duplicate must go
  — but **in this direction, and not the other** (measured, orchestrator,
  2026-09-19):

  **`inference-providers.ts` derives FROM `embedding-dimensions.ts`.** Export
  `KNOWN_EMBEDDING_DIMENSIONS` and set
  `INFERENCE_PROVIDERS.ollama.knownDimensions` to it. Both modules are pure and
  in the same package, so this adds no I/O and no new edge.

  **Do NOT delete the literal and derive `embedding-dimensions.ts` from the
  seam.** `embedding-defaults-parity.test.ts:312-313` extracts that table by
  regex — `/KNOWN_EMBEDDING_DIMENSIONS[^=]*=\s*\{([\s\S]*?)\n\};/` over
  `packages/shared/src/config/embedding-dimensions.ts` — and compares it to the
  bash table. Deleting the literal makes that regex match nothing and reddens the
  gate, in a file **T15 owns**, three tasks away. Adding `export ` in front of
  the declaration does not disturb the regex, which anchors on the identifier.

  LM Studio's own width table stays a literal in the seam. It is invisible to
  this gate (it carries no `OLLAMA_EMBEDDING_` token) — that is LIP-18's subject
  and T15 closes it.
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

## Phase 4 landed (`27f0897d`, `6108843c`, `85a1ad07`) — two clauses amended, both with their reason

**T08's "stamp inside the existing upsert" clause is amended; the structural
requirement wins.** `upsertWorkspace`'s only production caller is
`workspace-manager.ts:42`, inside `markIndexing`, whose own docblock says
"called at the start of ETL" and which is reached from exactly one
fire-and-forget site (`:156`). It therefore runs *before* full-vs-incremental
is decided, so nothing passed there can honour "only from the clearing
branch". The two clauses contradict each other. Shipped instead: two narrow
single-column functions in the same file, `getEmbeddingFingerprint` and
`stampEmbeddingFingerprint`, called from the clearing path.

**The stamp's production site is `services/etl/pipeline.ts`'s `forceReindex`
branch, not `ensureFreshIndex`.** Measured: `ensureFreshIndex`'s only
production caller is `SearchController.handleAutoReindex`, which hardcodes
`allowFullReindex: false` (`search-controller.ts:407`); every `true` in the
repository is in a test. Its whole `needsFullReindex` branch — all four
reasons, including this feature's new fingerprint arm — therefore has **zero
production reachability**, and a stamp placed there is dead code. The
reachable recovery is the one `EmbeddingIndexStaleError`'s own message names:
`index_project` → `EtlPipeline.run({forceReindex: true})`, a wholly separate
full-reindex mechanism that clears via `deleteByProject` (`pipeline.ts:218-224`)
and never calls `ensureFreshIndex`. **Without this correction the gate was a
permanent lock**: a mismatch blocked search, and the command the error told the
user to run rebuilt every row without clearing the stale fingerprint. The
`ensureFreshIndex` stamp is kept, correct and unit-tested, with a comment
naming it presently unreachable; both sites call the identical primitive pair,
so they can never disagree on the value written.

**Ordering decision, stated rather than left half-wired.** Tier 1b (the read
gate throw, `search-controller.ts:176`) stays **before** `handleAutoReindex`
(`:193`). Reordering would change nothing — `allowFullReindex: false` defers
the forced full reindex either way — and LIP-15 asks for an explicit,
human-triggered recovery, not a silent rebuild racing a search call.

**Measured, so the gate is not silently self-disabling:**
`currentEmbeddingFingerprint()` resolves non-null — `ollama:qwen3-embedding:4b:2560`
— under both the real `~/.config/massa-ai/config.json` and a scratch
`XDG_CONFIG_HOME` on the development machine.

**Gates re-measured by the orchestrator, not accepted from the builder:**
`run-tests-isolated.ts --filter='fingerprint|project-indexer'` exit 0, 3
groups, **17 pass / 0 fail** (12 unit + 1 PG call-site + 4 late-bind);
`check-core-layering.ts` PASS, 0 violations across 1003 edges; `oxlint` exit 0.
The call-site sensor was independently mutated (the `stampEmbeddingFingerprint`
call neutralised in place) and observed RED — `Expected:
"ollama:qwen3-embedding:4b:2560"` / `Received: "ollama:some-retired-model:2560"`
— then restored by text edit with `git status --porcelain` empty and GREEN
re-confirmed. `DATABASE_URL` is already in `turbo.json` `passThroughEnv:30`, and
without it the PG suite reports **1 skip**, never a vacuous pass.

### Bounded residuals, recorded not fixed

1. **Three callers bypass the read gate entirely** by calling
   `contextualSearch.search(...)` without `checkSearchAdmission`:
   `search-warmup.ts:49`, `index-admin.ts:202`,
   `packages/core/src/scripts/beir-benchmark.ts:317`. None returns rows to an
   end user through a gated path, so they are judged out of scope for T09 — but
   LIP-15's "search must fail loudly" is narrower than "every search-facing
   caller fails loudly", and these are real uncovered exceptions.
2. **An incremental `EtlPipeline.run` (no `forceReindex`) after a switch** does
   not clear and does not stamp, so the table can hold two embedding spaces
   while search stays blocked by the unchanged stale fingerprint. Safe, but it
   is safety by refusal, not by repair.
3. **Every existing install is `NULL`/legacy until its first full reindex**, and
   the legacy branch warns without blocking (`design.md:225`). LIP-15 therefore
   protects no existing project until one full reindex has stamped it. This is
   the design's stated choice, not a defect — recorded because the feature's
   day-one value depends on it.

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

**Status: complete.** One `massa_ai_probe_provider`, byte-identical in all four
scripts (no shared lib: `install.sh` has no checkout to source one from, and a
new `scripts/lib/` file is outside this task's write set). It curls the
provider's list endpoint and greps the body for that provider's list key,
reading no status at all — `curl -s`, deliberately **without** `-f`, because
`probeProvider` ignores status too and a `-f` would disagree with it on a 500
carrying a valid body.

**Amendment — two of the enumerated sites are not probes.** `install.sh:260`
(`ollama_has_model`) and `setup-local-first.sh:135` (inside
`ollama_model_exists`) fetch a body and grep `"name":"<model>"` in it; they
already discriminate by body shape and were never status-trusting, and `:135`
is additionally under T11's byte-identity lock — editing it would break
`test-setup-ollama-model-exists.sh`, which stubs `curl` on `PATH` and would
find `massa_ai_probe_provider` undefined in the extracted function. Both left
unchanged. The five *reachability* probes the requirement names are eight call
lines, because two files run the same check more than once:
`install.sh:162`,`:267`; `setup-local-first.sh:91`,`:125`,`:477`;
`validate-vscode-integration.sh:72`; `ensure-ollama.sh:48`,`:71`.

**URL resolution had to be mirrored too, not just body shape.**
`probeProvider` resolves `new URL(<absolute path>, baseUrl)`, which **discards**
any path on `baseUrl`; a naive `"${base}${path}"` in bash turns the LM Studio
default `http://localhost:1234/v1` into `/v1/v1/models`. The bash copy keeps
scheme://authority only, and Tier 3 of the parity test observes the path each
half actually requests on one real server rather than comparing against a
second copy of the (unexported) `LIST_MODELS_PATH` map.

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

**Status: complete.** `installer_detect_provider`, `installer_select_provider`
and `migrate_provider` live in `installer-feature-prompts.sh` (so `install.sh`
can reuse them and the suite can execute them rather than grep them);
`lms_model_exists` and the third dispatch function `inference_model_exists`
live beside `ollama_model_exists` in the wizard. `ollama_model_exists` is
untouched and `test-setup-ollama-model-exists.sh` is unmodified and green at
**16 passed / 0 failed**. `OLLAMA_URL` / `OLLAMA_HAS_CLI` keep their names, and
the new suite adds the caller-contract assertion LIP-05's second AC asks for —
it reads the wizard, not the extracted function, so a rename that the
byte-identity check cannot see still fails.

**`installer_select_provider` sets globals instead of echoing.** A `die` inside
a `$(...)` capture kills only the subshell, which would turn LIP-16's fatal
unknown value into a silent empty string — the exact failure mode the
requirement exists to prevent.

**Amendment — `setup-local-first.sh:2` is `set -e`, not `set -euo pipefail`.**
LIP-05's caller-contract paragraph cites the stronger form. The conclusion
still holds (an unset `OLLAMA_URL` yields a `curl` to a bare `/api/tags` and a
silent "no", not a loud failure), but the mechanism named is not the one in the
file.

**`lms_model_exists` has no CLI branch, deliberately.** `ollama_model_exists`
prefers `ollama list`; the LM Studio equivalent would be `lms ls`, whose output
format was never measured for this feature, while `/v1/models` was. An
unverified parser in the branch that runs first is worse than one fallback
fewer.

**Residual, recorded not fixed.** `inference_model_exists` now fronts the three
model checks in Step 2, but Step 1 still checks and installs Ollama and Step 2
still pulls with `ollama pull` — T12 owns the LM Studio install and pull path
(LIP-14). Between these two commits an `lmstudio` selection resolves model
existence against LM Studio while the pull path is still Ollama's.

**The pty block nearly shipped as a silent skip.** Measured: with the harness's
own stdin inherited, `script -q /dev/null true` returns 1 on macOS, and the
first version of the suite reported **40 passed / 0 failed** — 13 interactive
menu assertions quietly not running and reading exactly like a green suite.
The probe now redirects `</dev/null` (deterministic 0), empty pty reads are
retried and then **fail**, and the skip branch is reserved for a box with no
`script(1)` at all. `scripts/tests/test-installer-feature-prompts.sh:129` has
the same one-shot probe and the same exposure; it is outside this task's write
set and left alone.

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

**Status: complete.** `installer_write_config` emits `embedding.provider`,
`embedding.baseURL`, `llm.baseUrl`, `llm.apiKey` and `llm.disableThink` from
globals seeded by a new `installer_provider_defaults`; the wizard gained
`lms_cli_path`, `setup_lmstudio`, a `setup_ollama`/`setup_lmstudio` dispatch at
Step 1, one provider-dispatched `ensure_inference_model`, and a
provider-dispatched Step 5 health check. The LM Studio installer was **not**
executed — only the code path was written and tested.

**Amendment — three tests had to be edited, and none of them is in this task's
write set.** T12 was scoped to two implementation files, but its own gate says
"new case asserting an LM Studio write", and a task cannot ship a sensor with
nowhere to put it. Edited: `scripts/tests/test-setup-local-first-api-key.sh`
(LIP-06's own AC names this file), `scripts/tests/test-lms-model-exists.sh`
(`lms_cli_path` cases — LIP-14's AC), and
`scripts/__tests__/installer-config-template.test.ts` (below). All three gained
cases; none lost one.

**`installer_embedding_dimensions` keeps its `case` table; only the `*)` arm
delegates.** The task says the function "delegates to T07's resolver", and a
wholesale replacement would have been the literal reading — but
`embedding-defaults-parity.test.ts:302-330` parses that table by
`^\s*(model)\)\s*echo\s+(\d+)\s*;;` and asserts exact set equality against the
TypeScript table plus `length > 2`. Replacing it would redden a gate **T15
owns**, three tasks away, for no requirement: LIP-04's subject is the `*) →
2560` catch-all, and that is what died. Same trap T07 recorded for
`embedding-dimensions.ts`'s own regex, on the other side of the same gate.

**One literal width survives in `installer-api-key.sh`, deliberately.** The
degraded paths (no bun, no checkout, explicit override) collapse into a single
`echo "${OLLAMA_EMBEDDING_DIMENSIONS:-2560}"`, because
`embedding-defaults-parity.test.ts:167` extracts exactly that `${VAR:-N}` shape
and requires **exactly one** match. The first draft removed it and the gate
failed with `expected exactly 1 match … got 0 — extractor rotted or surface
removed`, which is the extractor working as designed.

**`installer-config-template.test.ts:116` asserted the behaviour LIP-04
retires, and was repointed rather than deleted.** It read "an unrecognized
model falls back to the reference default, never 4096" — the silent 2560
catch-all. It now asserts the loud failure (`toThrow(/some-future-model/)`),
plus a second case that an explicit `OLLAMA_EMBEDDING_DIMENSIONS` still wins.
It also pointed at `http://localhost:11434`, so on a developer machine with a
live Ollama it reached that server: the first red was
`embedding dimensions unknown for model "some-future-model":
http://localhost:11434/api/embed returned an unrecognized embedding response
shape`. Both cases now point at a closed port.

**A second sticky-global bug, caught by the new case.**
`installer_provider_defaults` first derived its outputs with `${VAR:-…}`, so a
value left from an earlier `installer_write_config` in the same shell won: the
LM Studio case, which runs after an Ollama write, produced
`provider: "ollama"` / `baseURL: "http://localhost:11434"`. Every assignment is
unconditional now. The same fix corrected `llm.baseUrl`, which was the literal
`http://localhost:11434/v1` regardless of `OLLAMA_URL` — a remote or WSL Ollama
got a config pointing the LLM client at the local machine.

**The three pull blocks became one `ensure_inference_model`.** They were the
same twelve lines with the model variable and a parenthetical swapped, which is
how `ollama pull` survived into a provider-neutral wizard. Model **defaults**
are provider-specific too (an Ollama tag is not an LM Studio id), so they
branch; the env override names are unchanged.

---

## Phase 5 landed (`73e3dac7`, `2cfa426d`, this commit) — what it cost

**Gates, measured in this worktree.** `bun run test:scripts`: TypeScript half
**2019 pass / 0 fail across 89 files**, exit 0; shell half green for every
suite except three that are red at `HEAD` too, baselined by stashing:
`test-install-skills-cli.sh` (`no tools exits 2`, `reason is reported`),
`test-plugin-auto-install.sh` and `test-plugin-registry-registration.sh` (all
`got='claude …' want='…'` — they detect the real `claude` CLI on this machine).
`bun run lint` exit 0. `bash -n` exit 0 on all five edited shell files.
`test-setup-ollama-model-exists.sh` **16/0 unmodified**,
`test-setup-local-first-api-key.sh` **40/0**, `test-lms-model-exists.sh`
**57/0**, `probe-dialect-parity.test.ts` **14/0**.

### Bounded residuals, recorded not fixed

1. **`lms daemon up`, `lms get -y` and `curl … lmstudio.ai/install.sh | bash`
   were never executed.** The task forbids running the LM Studio installer, so
   those three lines are written and syntax-checked but unmeasured. Only
   `lms_cli_path` is behaviourally tested.
2. **`scripts/tests/test-installer-feature-prompts.sh:129` carries the same
   one-shot `script(1)` probe** that silently skipped 13 assertions here. It is
   outside every Phase 5 write set and was left alone; it will under-report the
   same way on a host where that probe returns 1.
3. **The unknown-model path now makes a network call during `installer_write_config`.**
   A known model never does (every provider's `knownDimensions` is consulted
   first), so the default install is unaffected — but an install with a custom
   embedding model now depends on the endpoint being up, and fails the install
   when it is not. That is LIP-04's stated intent, not a side effect.
4. **`install.sh` was not given the provider menu.** T11 put the three
   selection functions in the shared library so it can, but `install.sh` still
   installs Ollama unconditionally; only `setup-local-first.sh` dispatches.
   LIP-12/13 name no installer, and the wizard is the documented local-first
   path — recorded because a reader will expect both.

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
- Any new `MASSA_AI_*` var → `turbo.json` `passThroughEnv` (AD-010). **Measured
  gap:** `turbo.json:40` carries `OLLAMA_BASE_URL` and **no** `LMSTUDIO_*`,
  while T04 emits `LMSTUDIO_EMBEDDING_MODEL` / `LMSTUDIO_BASE_URL` /
  `LMSTUDIO_EMBEDDING_DIMENSIONS`. Under `bun run test` those arrive
  `undefined`. Close it here.
- **LIP-24 — account for the completeness scan's shrinkage.** Populations
  measured with a scratch `XDG_CONFIG_HOME`: `main@d523f06f` **25**, after
  Phase 1 **27**, after Phase 3 **26**. The drop is `local-health-checker.ts`
  leaving the scan because T05 correctly replaced `process.env.OLLAMA_BASE_URL`
  with `process.env[spec.envNames.baseUrl]` — the read still happens, the
  literal does not. Either teach the scan the `spec.envNames.*` indirection, or
  enumerate the files it no longer covers and show each is covered elsewhere.
  Do not close this by observing the gate is green; a shrinking scan goes green
  more easily, which is the defect.
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
| LIP-23 | entrypoint-recording sensor + live parsed-object run | done in Phase 3 (`c838837d`) |
| LIP-24 | completeness shrinkage accounted for, not waved through | T15 |

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
