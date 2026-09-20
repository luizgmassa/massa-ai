# Tasks — Local inference provider abstraction + LM Studio (LIP)

**Sizing:** 7 Phases = 18 Tasks. Phase groups are max 3 Tasks (ideal 2) with
disjoint write sets, so each Phase can be one worker.

Gate rule: one atomic commit per Task, after its gate passes. Never batch.

## Gate check commands

| Scope | Command |
|---|---|
| Core unit (isolated runner — `bun test` over a directory cross-contaminates) | `cd packages/core && bun scripts/run-tests-isolated.ts --unit --filter='<regex>'` |
| Single file | `bun test <path>` |
| Shared / opencode-plugin | `bun run test` — **not** bare `bun test` (see below) |
| Root-level suites (NOT covered by `bun run test`) | `bun run test:scripts` |
| Shell suites | `bash scripts/tests/<name>.sh` |
| Type check | `bun run type-check` (4 pkgs) + `bun run build` (core, shared) |
| Lint (real CI gate) | `bun run lint` — oxlint from repo root, once |
| Plugins | `bun run test:plugins` |
| Live LM Studio | `~/.lmstudio/bin/lms server start` then the task's curl/bun probe |

**`apps/opencode-plugin` must be run as `bun run test`, never as bare `bun test`.**
Its package script is scoped — `bun test __tests__ src/__tests__` — while a bare
`bun test` has no path argument and walks the whole package, including the
generated, gitignored `apps/opencode-plugin/skills/` bundle (AD-016 build
output). That pulls `skills/massa-ai/scripts/*` into the run and exits 2 with no
summary. Measured in this worktree at `018e1529`: bare `bun test` exit 2 on both
of 2 runs; `bun run test` **166 pass / 0 fail across 9 files**, 36.9 s and 36.8 s,
exit 0 on both. The failure is the command, not the package.

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
4. ~~**`install.sh` was not given the provider menu.** T11 put the three
   selection functions in the shared library so it can, but `install.sh` still
   installs Ollama unconditionally; only `setup-local-first.sh` dispatches.
   LIP-12/13 name no installer, and the wizard is the documented local-first
   path — recorded because a reader will expect both.~~

   **WRONG — corrected in Phase 7, after it had already reached a shipped doc.**
   `install.sh` does not install Ollama in any mode: its only Ollama handling is
   `check_ollama()` (`:265-276`), which *warns*, and the `ollama.com/install.sh`
   curl lives at `scripts/setup-local-first.sh:162`. And it reaches the menu on
   its **default** path — `MASSA_AI_MODE` defaults to `source` (`:10`, `:69`),
   and `install_source()` (`:1032`) runs
   `bash "${INSTALL_DIR}/scripts/setup-local-first.sh"` at `:1055`. So the
   one-liner already prompts for a provider. The real bound is narrower: only
   `install_docker()` (`:926`) and `install_build()` (`:980`) skip the wizard.
   Two independent readers caught this — the T16 worker while checking the claim
   before documenting it, and the Phase 7 reviewer — which is the argument for
   both passes existing. Left struck through rather than deleted, because the
   wrong text is what the Phase 7 docs were written against.

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

## Phase 6 landed (`55e90cb1`, `0e5d5250`, this commit) — what it cost

**T13.** Both `config-cli.ts` copy-forks widened `use <provider>` from 3
members to the full writable set — `ollama, lmstudio, mistral, openai,
google, cohere` — not just `lmstudio`, per design.md §6's "keeping them at 3
was not a decision, it is drift." The `lmstudio` branch (and the new
`init --lmstudio` flag) reuses `INFERENCE_PROVIDERS.lmstudio` from the shared
seam for its base URL and known-width default rather than a third copy of
those literals; `google`/`cohere` reuse the same default model/width literals
`embeddings/config.ts` already carries. **Gates, measured in this worktree**
(`DATABASE_URL` had to be exported by hand — this shell had none set,
unrelated to the diff): `cd apps/mcp-client && DATABASE_URL=… bun run test` →
**13/13 isolated groups pass**, `config-cli.test.ts` alone **32/0**.
`cd apps/opencode-plugin && bun test src/__tests__` → **132/0**;
`config-cli.test.ts` alone → **27/0**.

**T14.** `config-sections.ts`'s five Ollama-only guide sentences (embedding
model/baseURL/apiKey, llm baseUrl/apiKey) now name LM Studio too. This closes
the known red carried since Phase 2: `render-golden.json` was regenerated
once, after the prose, with `MASSA_AI_WRITE_GOLDEN=1`, and the diff is
confined to exactly the two known entries — `renderConfig/read` and
`renderConfig/write` (lines 23 and 54, 2 lines changed in the whole 406 KB
file) — nothing else moved. `config-forms.test.ts` gained an `lmstudio`
assertion on the rendered provider select;
`config-section-coverage.test.ts` gained a case that an LM Studio-shaped
installer config (T12's `installer_write_config` shape) still resolves every
portal section; `config-get.json`'s example fixture now shows an LM
Studio-configured install. **Gates:** `cd apps/web-ui && bun run test` →
**784/0** across 15 files; `bun run type-check` → 6/6 tasks green.

**T15.** Tier 3 of the parity gate re-keyed from the literal `OLLAMA_EMBEDDING_`
to the provider-neutral `*_EMBEDDING_(MODEL|DIMENSIONS)`; the new population
needed one addition to `known` (`embedding-dimensions.ts` — its
`KNOWN_EMBEDDING_DIMENSIONS: Readonly<...> =` and
`DEFAULT_EMBEDDING_DIMENSIONS = 2560` both read as a false
"TOKEN[=:]value" offender to the naive line scan once caught by the wider
token). `referencePair()`'s comment is rewritten to describe the current
discriminator (the defaults block's literal `provider: "ollama",`, absent
from the interface's now-derived `(typeof EMBEDDING_PROVIDER_IDS)[number]`
field) rather than the deleted union it used to cite; the regex itself needed
no change; it already only matched the literal block. The width-writer scan
gained a fifth member, `inference-providers.ts` — its `ollama` spec derives
`knownDimensions` from the shared table (no duplicate), but its `lmstudio`
spec carries its own literal `{ "text-embedding-nomic-embed-text-v1.5": 768
}` table, invisible to the old trigger (it writes no `embedding:` field) —
closed with a second, narrowly-scoped `knownDimensions: { … }` trigger.
`turbo.json`'s `passThroughEnv` gained `LMSTUDIO_BASE_URL`,
`LMSTUDIO_EMBEDDING_MODEL`, `LMSTUDIO_EMBEDDING_DIMENSIONS` beside
`OLLAMA_BASE_URL`; `.env.example` gained a documented `=== LM Studio (Local)
===` section mirroring the Ollama one.

**LIP-24 accounting (measured, not waved through).** Re-measured completeness
population in this worktree, scratch `XDG_CONFIG_HOME`: **26** before this
task's re-key (matches tasks.md's "after Phase 3" figure), **29** immediately
after re-keying Tier 3 to the provider-neutral token, **30** after `.env.example`'s
new LM Studio section (itself already `known`, so the population grows but
offenders stay `[]`). Took the **enumerate-and-show-covered-elsewhere**
branch for `local-health-checker.ts`: it left the token-visible population in
Phase 3 because T05 replaced the literal `process.env.OLLAMA_EMBEDDING_MODEL`
read with `process.env[spec.envNames.model]`, and re-keying Tier 3 to a wider
token does not restore visibility — the file names no provider prefix at all
anymore. Its env-precedence behavior (env wins over config.json, for the
literal name `OLLAMA_EMBEDDING_MODEL`) is covered by a different, behavioral
sensor instead of a text scan: `packages/core/src/__tests__/health-checker-config.test.ts`'s
"checkOllama prefers env OLLAMA_EMBEDDING_MODEL over config" — itself outside
this scan's population (`isTestFile`), so the two mechanisms never double-count.
This accounting, and the reason the regex itself needed no change, are both
recorded as comments in the test file, not only here.

**Discriminating checks, both performed and reverted in this worktree.**
(1) LIP-18/AC: appended `const LMSTUDIO_EMBEDDING_MODEL = "bogus-injected-model";`
to `scripts/diagnose.ts` (an unlisted, non-test tracked file) — observed red:
`offenders` = `["scripts/diagnose.ts: const LMSTUDIO_EMBEDDING_MODEL = ...bogus-injected-model...;"]`,
then reverted (`git status --porcelain` empty, re-run green). (2) Width-writer
scan: removed `inference-providers.ts` from `KNOWN_WIDTH_WRITERS` — observed
red: `matched` (5, including `inference-providers.ts`) ≠ expected (4) with the
scan's own diff naming the missing entry — then restored (green, 7/7).

**Gates re-measured by this worker in this worktree:** `bun run test:scripts` →
TypeScript half **2019 pass / 0 fail across 89 files**; shell half green
across every suite except `test-install-skills-cli.sh`'s two cases
(`no tools exits 2`, `reason is reported`) — the same pair Phase 5 baselined
as detecting the real `claude` CLI on this machine, unmodified by this Phase.
`bun run lint` exit 0.

### Orchestrator re-measurement at `018e1529` (every figure re-run, not accepted)

`apps/web-ui` plain `bun test` **784/0 across 15 files**, exit 0 — the two
Phase-2 goldens are closed and no other name failed. `bunx turbo run type-check
--force` **6/6, 0 cached**, 13.8 s (the first run was FULL TURBO and did not
count). `bun run lint` exit 0 and **proved live**: an injected duplicate
declaration in a scratch `scripts/__oxlint_probe__.ts` was reported
(`error: Identifier 'a' has already been declared`) and the probe removed —
oxlint emits nothing at all on a clean tree, so its silence needed a sensor.
`bun run test:scripts` TypeScript half **2019/0 across 89 files**; its shell
half aborts at suite 16 of 39 (`for f … || exit 1`), so the remaining **23
suites were run individually** and are green except the two environment reds
that match main's recorded figures exactly — `test-plugin-auto-install.sh`
194/16 and `test-plugin-registry-registration.sh` 43/4, beside
`test-install-skills-cli.sh` 44/2. `apps/mcp-client` `bun run test` **342/0
across 14 isolated groups**, exit 0. `bun run test:plugins` **142/0 across 10
files**, exit 0.

**LIP-18's discriminating red was re-induced by the orchestrator, not accepted
from the worker.** Appending `const LMSTUDIO_EMBEDDING_MODEL = "bogus-injected-model";`
to `scripts/diagnose.ts` (tracked, unlisted) produced
`(fail) … > no unlisted tracked file assigns a *_EMBEDDING_MODEL/DIMENSIONS
default`, 6 pass / 1 fail, naming the injected line as the offender. Restored
from a file copy (never `git checkout`), `git status --porcelain` empty, re-run
**7/0**. `turbo-passthrough-env.test.ts` **3/0** with all three `LMSTUDIO_*`
names present at `turbo.json:41-43`.

Both falsifiable claims the new comments make were checked against source:
`massa-ai-config.ts` holds the literal `provider: "ollama",` **exactly once**
(`:382`, the defaults block) while the interface field is
`(typeof EMBEDDING_PROVIDER_IDS)[number]` (`:51`), so `referencePair()`'s
re-anchoring holds; and LIP-24's substitute sensor exists at
`packages/core/src/__tests__/health-checker-config.test.ts:51`.

### Bounded residuals, recorded not fixed

1. **~~T13's opencode-plugin gate is unstable~~ — withdrawn by the orchestrator,
   it was the command and not the package.** The worker recorded a flake class
   here (intermittent exit 2, `killed 1 dangling process`, a stray
   `skills/massa-ai/scripts/validate_spec.ts` stderr fragment, a different
   5000 ms case each run) and attributed it to `__tests__/install.test.ts` +
   `__tests__/harness-skills-and-prune.test.ts` under the 5 s global budget.
   Re-measured: the package's `test` script is already scoped
   (`bun test __tests__ src/__tests__`), and `bun run test` is **166/0 across
   9 files**, exit 0, on both of 2 consecutive runs (36.9 s, 36.8 s) — those
   two installer suites are inside that scope and passed both times. What the
   worker ran was bare `bun test`, no path argument, which additionally walks
   the generated, gitignored `apps/opencode-plugin/skills/` bundle and exits 2
   with no summary. That stray `validate_spec.ts` line is the tell, and it is
   reproducible, not intermittent: bare `bun test` exited 2 on both of my 2
   runs. The proposed Phase 7 fix (splitting the package's `test` script) is a
   no-op — it is already split. The tasks.md gate line was the defect and is
   corrected above.
2. **LIP-24's `known` addition for `embedding-dimensions.ts` is a scan-level
   fix, not a design change.** The file is the canonical reference table
   `referencePair()` itself reads (`:74`); nothing about its content changed
   in this Phase. Recorded because a future reader diffing this task's
   changes against "what surface changed" would otherwise wonder why a table
   file appears in a parity-gate commit.

   **Orchestrator note on its cost.** `known` membership skips the file
   *entirely*, not just its colliding lines — so a genuinely new, unreviewed
   `*_EMBEDDING_(MODEL|DIMENSIONS)` default added to
   `embedding-dimensions.ts` would now be invisible to Tier 3. The bound is
   that `referencePair()` reads this exact file as its reference table, so a
   changed reference value reddens Tier 1 on every other surface instead. It
   is a real narrowing of one tier bought by a widening of another, and it is
   recorded as such rather than as a clean fix. Closing it properly means
   scanning the file line-wise with the table's own shape excluded, not
   skipping the file.

---

## Phase 7 — Docs, measurement, close-out (3 Tasks)

### T16 — README, FEATURES, CHEATSHEET
**Requirements:** LIP-17
**Writes:** `README.md`, `FEATURES.md`, `docs/CHEATSHEET.md`
- Surfaces are enumerated with line numbers in the spec. **`FEATURES.md:34` is
  a TOC anchor `#local-first-llm-ollama`** — heading and anchor move together
  or the link breaks. Measured at `c5a7f72c`: that slug has exactly **3**
  occurrences repo-wide — `FEATURES.md:34` (the one live inbound link),
  `spec.md:350` and `tasks.md:796` (both prose). `README.md:618` carries the
  same heading text but README has **no** TOC link to it.
- Every changed command is **executed once** before it is written down.

  ~~**AC amended, with its reason.** The exclusion is the LM Studio
  install/daemon lines — `curl … lmstudio.ai/install.sh | bash`,
  `lms daemon up`, `lms get -y` … on this host `lms` is not on `PATH`, so they
  are unexecutable here.~~

  **That exclusion was TOO WIDE, and Phase 8 narrowed it after actually looking
  for the binary.** `lms` is not on `PATH`, but it **is present and executable**
  at `~/.lmstudio/bin/lms` — the bundled path that `setup-local-first.sh`'s
  `lms_cli_path` checks and that T19's `diagnose.ts` now checks too. `which lms`
  returning nothing was taken as "absent" when it only ever meant "not on
  `PATH`", which is precisely the false negative LIP-14 exists to prevent — the
  exclusion reproduced the bug the requirement is about. Measured in Phase 8:
  `lms version` exit 0, `lms ls` exit 0 (3 models, the embedding model `LOADED`),
  `lms daemon up` exit 0 (idempotent — "LM Studio is already running"), and
  `lms get --help` exit 0 confirming the `-y, --yes` flag shape without
  downloading.

  **The surviving exclusion is one line, and for a different reason.**
  `curl -fsSL https://lmstudio.ai/install.sh | bash` is excluded because T12
  forbids running the vendor installer — a scope rule, not a reachability
  problem. Every other changed command is executed once and its exit code
  transcribed.
- ~~**`README.md:47` and `:49-53` are the `install.sh` quick start, and
  `install.sh` has no provider menu**~~ — **both halves withdrawn by the T16
  worker and the Phase 7 reviewer, independently, and Phase 5 bounded residual
  #4 (`:563-567`) is wrong with them.** Measured: (1) `README.md:47-53` is the
  *Manual setup (from source)* block and it invokes `./scripts/setup-local-first.sh`
  directly (`:48`) — the real one-line install sits at `README.md:13-29` and is
  not one of LIP-17's 23 sites at all; (2) `install.sh` carries no provider
  logic and installs no provider: its default `source` mode delegates to the
  wizard (`install.sh:1055`, inside `install_source()` at `:1032`), and the
  Ollama installer curl lives at `scripts/setup-local-first.sh:162`, not in
  `install.sh`. `install.sh`'s only Ollama handling is `check_ollama()`
  (`:265-276`), which warns. So the one-liner *does* reach the provider prompt.
  The true bound is narrower and is what the docs now say: `MASSA_AI_MODE=docker`
  (`:926`) and `=build` (`:980`) do not run the wizard. This claim reached a
  shipped user-facing doc before it was caught — see the Phase 7 review-fix
  commit.
- **Do not claim stale-index protection without its qualifier.** Phase 3
  residual #3 (`:338-341`): every existing install is legacy/NULL until its
  first full reindex, so LIP-15 protects no existing project until then.
**Gate:** `bun run lint` is a **structural no-op here** — it is `oxlint`
(`package.json:29`), which reads JS/TS and no markdown, so it is exit 0 before
and after any T16 edit, correct or not. Run it, but never quote it as the
sensor. The two discriminating checks are: (1) **TOC resolution** — extract
every `](#…)` in `FEATURES.md` and assert each resolves to a slugified heading
in that same file; zero new unresolved links before vs after. (2) **Claim
coverage** — the spec enumerates **23** sites (README 8, FEATURES 7,
CHEATSHEET 8, `spec.md:346-358`); each is either in the diff or carries a
written reason why it is not. "3 files changed" proves nothing about the 23.

### T17 — measurement (LIP-22)
**Requirements:** LIP-22
**Writes:** the **Phase 7 landed note in this file** — *not* `validation.md`.

  **Write target amended, with its reason (Plan Challenge, verified).**
  `validation.md` has exactly one writer, the verification-agent
  (`skills/massa-ai/workflows/spec-driven.md:117`, author ≠ verifier), and
  creating it early is actively harmful: `validate_state.ts:130`'s
  `appearsComplete()` returns `true` on **mere existence** of the file — and
  the other branch cannot save it, because `TASK_HEADING_RE` is
  `/^#{2,4}\s+T\d+\s*:/m` (`:45`) while this file writes `### T16 — …` (em
  dash, no colon), so existence is the *only* trigger. The feature then enters
  `checkFeature()` and an inputs-only file fails with "validation.md has no
  PASS/FAIL verdict (a prose-only report does not count)", exit 1. T17
  therefore records its figures here, where every other phase's measurements
  live, and hands them to the Verifier as an input; the Verifier transcribes
  them into `validation.md`, which is what LIP-22's AC sentence asks for.
- `bun run bench:needles` at 768 recorded **as a number** beside the 2560
  baseline. A promise to measure later is not acceptable.
- **How to get a 768 run (measured, not assumed).** The harness embeds **only**
  via Ollama `POST /api/embeddings` (`benchmarks/needles/run.ts:113-140`); it
  has no client for LM Studio's OpenAI-shaped `/v1/embeddings`, and no 768-dim
  model is installed in Ollama at `c5a7f72c` (`qwen3-embedding:4b`,
  `qwen2.5:7b-instruct`, `qwen2.5-coder:7b`, plus three `:cloud` chat models).
  Approved route: `ollama pull nomic-embed-text` — the same
  nomic-embed-text-v1.5 family LM Studio serves — then
  `NEEDLE_MODEL=nomic-embed-text bun run bench:needles`, with the default
  `qwen3-embedding:4b` run as the 2560 baseline. Both runs on the same tree,
  the same `benchmarks/needles/fixtures/massa-ai.json` revision (pin its sha),
  and `benchmarks/needles/reports/` is gitignored, so the transcribed numbers
  here are the only durable artifact.
- **Assert the width, do not infer it.** Nothing in the harness checks the
  returned vector length, so a tag that silently resolves elsewhere, or an
  Ollama fallback to the already-loaded model, yields a plausible number at the
  wrong width. Record the observed `embedding.length` (768 and 2560) beside
  each score.
- **The bound is two-part, and both parts get written down.** LIP-22's title
  says "measure the retrieval-algorithm change at 768"; this harness cannot.
  (a) **Not the shipped path** — the production LM Studio `/v1/embeddings`
  client is never exercised; only the same model family under a different
  server, with Ollama-only knobs applied (`run.ts:129-137` truncates at 8000
  chars and passes `options.num_ctx`, which has no `/v1/embeddings`
  counterpart). (b) **Not the algorithm change** — `run.ts:5-16` is a
  self-contained in-process **exact-cosine** ranker that never constructs
  `packages/core/src/data/vector/postgres-vector-store.ts`, so neither the
  `dimensions > 2000` two-phase binary-quantization branch (`:233`, `:267`) nor
  the ≤2000 plain-HNSW branch runs on **either** side. The delta it reports has
  the approximate-search component removed from both sides — biased in exactly
  the direction that hides the risk LIP-22 names. So the stated risk stays
  **UNMEASURED**, and the sensor that would settle it is named: a full-stack
  run against a real pgvector index at each width, i.e. `14.needles.test.ts`
  (`run.ts:14-16`). Note the spec cites this file under `services/vector/`; it
  is under `data/vector/` — a stale path cite, corrected here.
**Gate:** both figures, both observed vector lengths, the fixture sha, and both
halves of the bound appear in the Phase 7 landed note.

### T18 — CHANGELOG + `.specs` close-out
**Requirements:** LIP-21
**Writes:** `CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`,
`.specs/project/FEATURES.json`
- CHANGELOG under `[Unreleased]` per `CONTRIBUTING.md` § CHANGELOG authoring —
  the heading drives the release bump. CI fails a PR that does not touch it.
- **Never write the skip-ci marker literally** in a commit message or PR body.
- Committed **before** the first push, so delivery stage 3.5 is a no-op.
- **`.specs/HANDOFF.md` is rotated, never replaced — and this file breaks a
  naive rotation worse than the one that produced the rule.** The recorded
  failure (2026-08-04, model-profile-switching close-out) is that a regex
  prepend *consumed* the prior feature's active block instead of demoting it.
  Procedure: rename the old heading to `Previous handoff` **first**, prepend
  **second**. Two traps measured here: (1) the headings are **inconsistent** —
  `:1` `# Handoff — bootstrap-file-and-rule-toggles` (H1), `:83`
  `## Previous handoff — installer-prune-and-test-scoping` (H2), `:107` and
  `:160` `# Previous handoff — …` (**H1**), `:220` and `:311` H2 — so a
  rotation keyed on `^## Previous handoff` is blind to the H1 entries, and one
  keyed on `^# Handoff` through the next `^#` consumes through `:83` and
  destroys the installer-prune record; (2) the convention here is
  `# Handoff — <slug>` / `## Previous handoff — <slug>`, **not** the
  `## Active` / `## Previous` shape the rule is usually written with, so a
  rotation transcribed from that shape matches nothing and silently no-ops.
  Normalise the H1/H2 inconsistency while in there, or the next rotation
  inherits it.
**Gate:** `bun skills/massa-ai/scripts/check_specs_delivered.ts local-inference-provider-abstraction --root .`
is **necessary but vacuous on its own** — it proves only that `.specs/` is
porcelain-clean and that the named paths are tracked on HEAD (`:14-19`), and
all three state files are *already* tracked from the previous feature.
Measured at `c5a7f72c` with `.specs/` clean: it exits **0 before T18 edits
anything**. The four discriminating assertions:
1. `git diff --name-only main..HEAD -- .specs/project/STATE.md .specs/HANDOFF.md .specs/project/FEATURES.json` lists **all three**.
2. `FEATURES.json` contains `local-inference-provider-abstraction`, and `active_feature` is no longer `bootstrap-file-and-rule-toggles` (it is, at `:1469`).
3. `CHANGELOG.md`'s `[Unreleased]` holds a heading **with bullets** — `CONTRIBUTING.md` § CHANGELOG authoring: a heading with no bullets is ignored, and the heading derives the release bump. Confirm the intended bump before filing.
4. `grep -n "^#\{1,2\} " .specs/HANDOFF.md` before vs after: the count grows by exactly one, `bootstrap-file-and-rule-toggles` still appears and now reads `Previous handoff`, and all five existing Previous titles survive unchanged.

---

## Phase 7 landed — T17 (LIP-22): the measurement, and what it is not

Corpus pinned: head `bc2f2f82`, fixture
`benchmarks/needles/fixtures/massa-ai.json` sha256
`3028ced20b6642c77c791d317649da696f0b18ab7f656f6aefe16785129137bc`, **14**
needles (`N01`–`N14`), `scoring.staleNeedles` `[]`. The fixture carries no
static per-needle `filePath`; resolution is content-anchor-based (`resolve.ts`,
SEN-04) and hard-fails on an unresolvable anchor rather than warning, so
"14/14 resolved, zero `NeedleResolutionError`, zero `[warn]`" on both runs is
the only existence check this fixture supports — and it is the one that passed.

| metric | 2560 — `qwen3-embedding:4b` | 768 — `nomic-embed-text` |
|---|---|---|
| hit@1 | 0.5000 | 0.2857 |
| hit@3 | 0.7143 | 0.6429 |
| hit@5 | 0.7857 | 0.7143 |
| hit@10 | 1.0000 | 0.7857 |
| MRR | 0.6423 | 0.4650 |
| wall clock | 90.88 s | 20.23 s |

Misses at 768 and at neither width otherwise: **N08** (`chunker-post.ts:33-36`),
**N11** (`discover.ts:188-194`), **N12** (`postgres-vector-store.ts:74-77`) —
all outside top-10, each with a plausible-but-wrong top hit.

**Width asserted, not inferred — and re-probed by the orchestrator, not accepted
from the worker.** Independent `curl POST :11434/api/embeddings` with a trivial
prompt: `qwen3-embedding:4b` → `embedding.length` **2560**, `nomic-embed-text` →
**768**. Both exact. This check exists because nothing in the harness validates
the returned vector length, so a tag resolving elsewhere, or an Ollama fallback
to the already-loaded model, would have produced a plausible number at the wrong
width. Reports: `benchmarks/needles/reports/massa-ai-t17-2560-results.json` and
`…/massa-ai-lmstudio-width-768-results.json` — a **misleading filename**: that
run went entirely through Ollama, and nothing in it touched LM Studio. That
directory is gitignored, so durable copies live at
`/tmp/t17-needles-{2560,768}.json` and the table above is the record. Every
**score** here was re-read from those JSON files by the orchestrator rather than
transcribed from the worker's prose. The two exceptions, stated because the
claim would otherwise be wider than the artifact: the **wall clocks** and the
zero-retry observation are the worker's, not re-derivable from the durable
copies (which carry only `projectId, ranAt, model, config, aggregate, results`;
summing per-result `latencyMs` gives 22 ms and 12 ms, not seconds). The wall
clocks are consistent with the 45.6 s gap between the two `ranAt` stamps. No
eviction thrash observed: the 768 run was *faster*, its model being far
smaller.

**The two-part bound. Both halves are the point; neither is a caveat.**

(a) **Not the shipped path.** `run.ts:113-140` calls only
`POST {OLLAMA_HOST}/api/embeddings`, truncates at 8000 chars (`:134` —
`prompt: text.slice(0, 8000)`; an earlier draft of this note cited `:129`, which
is the `content-type` header) and passes `options.num_ctx` (`:135`) — an
Ollama-only knob with no counterpart on the
OpenAI-shaped `/v1/embeddings` this feature actually ships. LM Studio was live
on `:1234` serving `text-embedding-nomic-embed-text-v1.5` throughout and was
never called. Both numbers are the same model *family* through a different
server with different request shaping than production.

(b) **Not the algorithm change — and biased in the direction that hides it.**
`run.ts:5-16` is a self-contained in-process **exact-cosine** ranker; it never
imports or constructs `packages/core/src/data/vector/postgres-vector-store.ts`,
so neither the `dimensions > 2000` two-phase binary-quantization path nor the
≤2000 plain-HNSW path runs on **either** arm. Cite the search itself, not only
its setup: the two-phase search is `:616-621` (the `embedding_bq <~> $1::bit(N)`
hamming prefilter); `:233` (`const hasBq = dimensions > 2000`, table DDL) and
`:267` (index dispatch) are where the width decides the *schema*, which is why
they were cited first and why the pointer was off-subject. The delta above
therefore has the approximate-search component removed from both sides.

So LIP-22's stated risk — that 768 leaves the binary-quantization path — remains
**UNMEASURED**. The sensor that would settle it is a full-stack run against a
real pgvector index at each width: `packages/core/src/__tests__/e2e/14.needles.test.ts`
(the worker's report placed this file under `data/vector/`; corrected here from
`git ls-files`). What the table *does* measure is chunk-embedding quality at the
two widths, and on that narrower question the 768 model is materially worse on
this corpus — MRR 0.6423 → 0.4650, hit@1 0.5000 → 0.2857. Recorded as the
accepted risk LIP-22 declares it to be, not as a clean result.

---

## Phase 8 — Close the validation gaps (7 Tasks)

Source of truth is `validation.md`'s ranked gap list (G1–G16), not this prose.
The gate returned **FAIL** on 7 ACs with 4 surviving mutants; Phase 8 exists to
clear them and re-verify. **G7 is already closed** (`e04e12d0`).

Standing rule for this Phase, learned the hard way in Phase 7: a task is not
done because its gate is green. Three of the four surviving mutants survived
against green gates. **Every task below that adds or repairs a sensor must show
an observed red on its own new subject**, induced deliberately and then
reverted, with `git status --porcelain` empty afterward. Restore from a file
copy, never `git checkout` — the tree carries other workers' uncommitted work.

### T19 — `scripts/diagnose.ts` (G1)
**Requirements:** LIP-10 (whole AC), LIP-03 (site 2 of 5)
**Writes:** `scripts/diagnose.ts` and its test
- `design.md:140` promised this file `probeProvider` + exact model match. It is
  byte-unchanged over the whole feature range. Steps 1–4 still hardcode Ollama's
  endpoint, `/api/tags`, `response.ok`, `/api/embed` and a **substring** model
  match. Convert all four to `probeProvider` + a provider-dispatched embed shape
  + exact match.
- The site list was silently **re-membered**, not merely under-delivered: T10's
  write set dropped `diagnose.ts` and added `ensure-ollama.sh`, which neither
  spec nor design names, so LIP-03's count stayed 5 while membership changed.
  Restore the named site; do not re-argue the count.
- Bound worth knowing, measured: the wizard calls `bun run diagnose || echo "⚠ …"`,
  so today an LM Studio user gets a **false red plus a warning, not a failed
  install**. Still a broken claim on the feature's own happy path —
  `README.md:58` says this step validates the stack.
**Gate:** the test fails before the change and passes after; plus one run against
a live LM Studio on `:1234` with its exit code transcribed.
**Discriminating check:** point it at a wedged provider that returns `200` with
an error body and observe it report unreachable — the substring/`response.ok`
path cannot do this, which is why it is the discriminator.

### T20 — the feature-induced regression + two sensor-derivation gaps (G2, G9, G11)
**Requirements:** LIP-24's own failure shape; LIP-02 and LIP-13 residuals
**Writes:** `packages/core/src/__tests__/health-checker-config.test.ts`,
`packages/shared/src/config/__tests__/config-loader.test.ts`,
`packages/core/src/__tests__/embedding-fingerprint.test.ts`
- **G2 is a regression this feature caused on a file it never edited.** 3 pass /
  0 fail at `d523f06f`, **1 pass / 2 fail at HEAD**. The seam moved the model
  read from `config.getAll()` (`@massa-ai/shared`, which the test's
  `mock.module` covers) to `loadConfigSafe()` (`@massa-ai/shared/config`, a
  **different specifier** the mock does not cover), so both file-read cases now
  receive the real default. `mock.module` registers by **resolved path**;
  extend it to the second specifier. This is also the file LIP-24's accounting
  leans on as its substitute sensor, so LIP-24's closure depends on it.
- **G9:** LIP-02's sensor derives its consumers from real source but its *name
  list* from a literal the test declares (`config-loader.test.ts:468`). A fourth
  `LMSTUDIO_*` name emitted and unread escapes both tests. Derive the loop from
  `Object.keys(getConfigForEnv(...))`.
- **G11:** all 26 provider literals in `embedding-fingerprint.test.ts` are
  `ollama:`. Sound by construction, unmeasured in the `lmstudio → ollama`
  direction. One fixture with an `lmstudio:` stored fingerprint.
**Gate:** `health-checker-config.test.ts` 3/0; the other two suites green.

### T21 — LIP-18's missing LM Studio extractors (G3)
**Requirements:** LIP-18
**Writes:** `scripts/__tests__/embedding-defaults-parity.test.ts`
- **The re-key landed; the extractors never did.** `PAIR_SURFACES`,
  `MODEL_ONLY_SURFACES` and `DIMS_ONLY_SURFACES` contain **zero** LM Studio
  entries. The file's only two `lmstudio` mentions are comments — and `:213`
  asserts in prose that an `LMSTUDIO_EMBEDDING_MODEL/DIMENSIONS` pair "must be
  as visible as" the Ollama one while nothing implements it. That is verbatim
  the EDC-06 defect the file exists to prevent, on the second provider.
- Add LM Studio rows keyed on `LMSTUDIO_EMBEDDING_(MODEL|DIMENSIONS)` and the
  `text-embedding-nomic…` literal, with a second `referencePair()` for the LM
  Studio pair. Keep the exactly-one rule **per provider per surface**.
**Gate:** `bun run test:scripts`
**Discriminating check — mandatory, and it is the whole point of this task.**
Re-induce the three mutants that survived the verifier and observe each go red:
**M1a** `.env.example` LM Studio dims 768→1024 (contradicting the model two
lines above); **M10** `embeddings/config.ts` default model → bogus *and* width
768→1536; **M13** the wizard's default LM Studio model → bogus. All three
previously survived at parity 7/0, M10 additionally against a 116-test core
filter. A gate never seen failing on its new subject is unquotable as a sensor
for that subject.

### T22 — `config.llm` on the LM Studio path, and the resolver wiring (G4, G6)
**Requirements:** LIP-09; silently defeats LIP-07 and LIP-23 on this path
**Writes:** `apps/mcp-client/src/config-cli.ts`,
`apps/opencode-plugin/src/config-cli.ts`,
`packages/core/src/services/embeddings/config.ts`, and their tests
- **Both CLIs never write `config.llm` at all** — `grep -c llm` is **0** in
  each. So `llm.baseUrl` stays on `:11434`, and `resolveInferenceSpec` matches
  **host:port first**, returning the *ollama* spec — which re-enables the
  `/api/version` probe and the `think:false` injection the feature gated. Write
  `config.llm.baseUrl` in both forks' `use`/`init` LM Studio branches.
- **The guarding test passes vacuously.** It asserts `show.out` *contains*
  `http://localhost:1234/v1`, which `embedding.baseURL` alone already satisfies.
  Assert the `llm.baseUrl` **field**, not a substring of the whole `show` output.
- **G6:** `resolveModelDimensions` has **zero TypeScript production callers** —
  `embeddings/config.ts:424` and both CLI copies fall back to a silent literal
  `768`, and the bash degraded arm returns a literal `2560`. Either wire the
  resolver into the runtime `lmstudio` branch, or record the literal fallbacks
  as a deliberate bounded degradation **with the condition named**. Do not close
  it by observing the gate is green.
**Gate:** `cd apps/mcp-client && bun run test` · `cd apps/opencode-plugin && bun run test`
(never bare `bun test` there — it walks the generated skills bundle and exits 2)
**Discriminating check:** revert the `llm.baseUrl` write and observe the repaired
test go red. The old assertion could not.

### T23 — LIP-08's missing sensor, the env allowlist, and the unpinned list (G5, G8, G10)
**Requirements:** LIP-08 (NOT COVERED), LIP-20, LIP-11 residual
**Writes:** `turbo.json`, `.env.example`,
`scripts/__tests__/provider-list-parity.test.ts`, one new LIP-08 test
- **G5:** LIP-08 has no sensor and no recorded measurement — nothing embeds
  through the `lmstudio` alias. One live test, or one recorded manual run, that
  calls `createEmbeddingProvider` with `embedding.provider = "lmstudio"` and
  asserts `vector.length === 768`. LM Studio is live on `:1234` serving
  `text-embedding-nomic-embed-text-v1.5`, so this is runnable here.
- **G8:** `MASSA_AI_INFERENCE_PROVIDER` is absent from `turbo.json`'s
  `passThroughEnv` **and** from `.env.example` (AD-010). The mechanised guard is
  structurally **bash-blind**, so its green proves nothing about a var read only
  from shell — consider widening `turbo-passthrough-env.test.ts` to scan
  `scripts/**/*.sh` for `MASSA_AI_*` reads.
- **G10:** `WRITABLE_PROVIDERS` is a hand-edited literal in two CLI copies that
  `provider-list-parity.test.ts` does not pin, though it pins every other
  consumer of the same union. A seventh provider would leave both CLIs silently
  rejecting it, green. Add both copies to the membership-equality assertion.
**Gate:** `bun run test:scripts`
**Discriminating check:** drop one provider from one CLI's `WRITABLE_PROVIDERS`
and observe the membership assertion name it.

### T24 — the bookkeeping the gate found wrong (G12, G13, G14, G15, G16)
**Requirements:** LIP-19b, LIP-22, LIP-23, LIP-14 hygiene, LIP-19 spec defect
**Writes:** `spec.md`, `tasks.md`, `scripts/tests/test-lms-model-exists.sh`
- **G14 — the one spec amendment that matters.** LIP-22's AC names
  `bun run bench:needles`, which *structurally cannot* observe the
  binary-quantization branch the requirement exists to measure. Strike it as the
  sensor and name `packages/core/src/__tests__/e2e/14.needles.test.ts`. The
  measured figures stay; what changes is which mechanism the AC demands.
- **G13 — half right; the finding holds, the target does not.** Verified:
  `llm-client-json-schema.test.ts` genuinely **cannot** sense the entrypoint,
  because its mock is `createOpenAI: () => (model) => ({ model, __mock: true })`
  with no `.chat` member. But the two places that name that file are T06's
  **write set** (`:186`) and nothing else — the Test Coverage Matrix row for
  LIP-23 says only "entrypoint-recording sensor", which is vague rather than
  misattributed, so there is no wrong citation to correct. The real fix is to
  make the row **name** its sensor: `llm-client.test.ts:832` (`lmstudio →
  entrypoint "chat"`) and `:839` (`ollama → "responses"`), both confirmed
  present and asserting `lastProviderEntrypoint`.
- **G12:** LIP-19b's AC says "in the same commit"; the union was deleted in
  `7987443d` and the extractor re-anchored in `018e1529`, four phases apart. End
  state correct, gate never vacuous. Record as an accepted deviation or amend
  the clause — with the reason either way.
- **G16 — REJECTED, the gap is wrong and the spec is right.** It claims
  `config-section-coverage.test.ts` exists at neither HEAD nor `d523f06f`.
  Measured both ways: `git ls-files` and `git ls-tree -r d523f06f` each resolve
  it to `apps/tools-api/src/routes/config-section-coverage.test.ts`, and
  `git diff --stat d523f06f..HEAD` shows the feature **added 22 lines to it** —
  T14's LM Studio-shaped installer-config case, exactly as the Phase 6 landed
  note records. Striking the clause would have deleted a correct spec line on a
  false premise. The likely cause is a bare-filename search that missed the
  path; no action beyond this record.
- **G15:** two vacuous-skip guards at `test-lms-model-exists.sh:191` — reshaping
  `lms_cli_path` silently drops all four LIP-14 assertions with no failure.
  Contrast `:334-341`, where the same risk *is* handled with an explicit `fail`.
  Mirror that pattern.
**Gate:** `bash scripts/tests/test-lms-model-exists.sh`

### T25 — close-out and re-verify
**Requirements:** LIP-21
**Writes:** `CHANGELOG.md`, `.specs/project/STATE.md`, `.specs/HANDOFF.md`,
`.specs/project/FEATURES.json`
- Update the `[Unreleased]` entries for what Phase 8 changed. Once T19 lands,
  the CHANGELOG's doc-surface sentence needs revisiting again: 3 of the 6
  unchanged surfaces were diagnose-bound and stop needing an excuse.
- Flip `FEATURES.json` `status` to `complete` **only** when the re-verification
  passes — it is `in_progress` on purpose.
- Re-dispatch the verification-agent over the G1–G16 list. It is the only
  legitimate writer of `validation.md`.
**Gate:** `bun skills/massa-ai/scripts/check_specs_delivered.ts local-inference-provider-abstraction --root .`
plus the four discriminating assertions recorded under T18 — the script alone
proves tracked-and-clean, never content.

### Dependencies

```
T19 ── T25            (T19 removes 3 of LIP-17's doc exceptions)
T20, T21, T22, T23    (mutually independent; disjoint write sets)
T24                   (independent; spec/tasks/shell only)
T25                   last, then re-verification
```

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
| LIP-17 | FEATURES.md TOC links all resolve (before = after); 23-site coverage accounted for; commands executed before written, minus the written `lms` exclusion. **Not** `bun run lint` — oxlint reads no markdown | T16 |
| LIP-18/19b | observed red on the **LM Studio** pair | T15 |
| LIP-19 | golden regenerated + diff reviewed | T14 |
| LIP-20 | `turbo-passthrough-env.test.ts` | T15 |
| LIP-21 | `check_specs_delivered.ts` exit 0 | T18 |
| LIP-22 | both needles figures (768 + 2560) with both observed vector lengths, in the Phase 7 landed note, plus both halves of the recorded bound — the algorithm change itself stays UNMEASURED, sensor named | T17 |
| LIP-23 | `llm-client.test.ts:832` (`lmstudio` → entrypoint `"chat"`) and `:839` (`ollama` → `"responses"`), both asserting `lastProviderEntrypoint`; plus the live parsed-object run. **Not** `llm-client-json-schema.test.ts` — its `@ai-sdk/openai` mock has no `.chat` member and structurally cannot sense the entrypoint (G13) | done in Phase 3 (`c838837d`) |
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
