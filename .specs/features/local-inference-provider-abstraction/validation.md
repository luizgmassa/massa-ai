# Validation — Local inference provider abstraction + LM Studio (LIP)

**Feature slug:** `local-inference-provider-abstraction`
**Commit range verified:** `d523f06f..ee34213e` (35 commits, 7 Phases, 18 Tasks).
Phase 7 alone: `c5a7f72c..ee34213e` (`bc2f2f82`, `ea28559d`, `34f92ebe`, `4422341d`, `ee34213e`).
**Worktree:** `/Users/luizmassa/Projects/massa-ai-feat-local-inference-provider-abstraction`, branch `feat/local-inference-provider-abstraction`.
**Verifier:** verification agent (author != verifier). Coverage re-derived from `spec.md`'s
requirement text, not from `tasks.md`'s Test Coverage Matrix — that matrix was treated as a
claim to falsify, and three of its rows did not survive.
**Date:** 2026-09-20.

---

## Summary

**Result**: FAIL

Seven requirements do not meet their acceptance criteria as `spec.md` states them: LIP-03,
LIP-08, LIP-09, LIP-10, LIP-17, LIP-18, LIP-20 — plus a feature-induced regression in
`packages/core/src/__tests__/health-checker-config.test.ts` and a narrow clause miss on
LIP-19b. Full per-AC evidence, the 17-mutation discrimination sensor, and the ranked gap
list follow.

## Verdict detail

Seven requirements do not meet their acceptance criteria as the spec states them:

| | Requirement | Verdict |
|---|---|---|
| 1 | **LIP-10** | **FAIL** — its entire AC is `bun run diagnose` against LM Studio; `scripts/diagnose.ts` is byte-unchanged over the whole range |
| 2 | **LIP-03** | **FAIL** — 4 of the requirement's own 5 probe call sites converted; site 2 is `scripts/diagnose.ts` |
| 3 | **LIP-18** | **FAIL** — 3 surviving mutants: the LM Studio model/width pair is value-unchecked on every surface |
| 4 | **LIP-09** | **FAIL** — both config CLIs never write `config.llm` at all; `llm.baseUrl` stays on Ollama after selecting LM Studio |
| 5 | **LIP-08** | **NOT COVERED** — no sensor and no recorded live measurement exist |
| 6 | **LIP-17** | **FAIL** — 6 of 23 doc surfaces unchanged; the written reason is false for 3 of them |
| 7 | **LIP-20** | **FAIL** — `MASSA_AI_INFERENCE_PROVIDER` absent from `turbo.json` → `tasks.test.passThroughEnv` (AD-010) |

Plus one **feature-induced regression** on a file the feature never edited
(`health-checker-config.test.ts`, 3/0 green on `main` → 1 pass / 2 fail at HEAD), and one
**narrow clause failure** (LIP-19b's "in the same commit").

The feature's *core* is sound and was proven so by mutation, not by assertion: the
provider-neutral seam, the body-shape probe in both dialects, the provider-aware width
resolver, the LIP-07/LIP-23 behaviour gates, and both halves of the LIP-15 index-invalidation
gate all killed every mutant aimed at them. The failures cluster in a different place: **one
file that was promised and never written (`scripts/diagnose.ts`), one parity gate that was
re-keyed but not extended, and one config surface that writes half a config block.**

---

## Scope and method

Two independent sensors were run, as commissioned.

**(1) Spec-anchored outcome check.** For each of LIP-01..LIP-24, the sensor claimed to cover
it was located and read against the spec's own AC text, asking whether it asserts the
*spec-defined outcome* or merely the *implementation's behaviour*. Evidence-or-zero: an AC
with no locatable sensor is recorded NOT COVERED.

**(2) Discrimination sensor.** 17 behaviour-level mutations were injected into scratch state
and the claimed sensors run against them. **Restore was from file copies held outside the
repository (`/tmp/lip-mutation-backup`), never `git checkout`.** `git status --porcelain` was
empty before the first mutation and is empty after the last; every mutated file's sha256 was
compared against its backup and matches. Nothing of this verification is on disk except this
file.

**Provenance discipline.** Figures below are marked `[V]` where the verifier ran the command
in this worktree, and `[D]` where a delegated reader ran it and the verifier re-derived the
*conclusion* but not the *number*. Every verdict in the FAIL list above rests on at least one
`[V]` measurement.

---

## Gates run, with measured results

| Gate | Result | Provenance |
|---|---|---|
| `bun run lint` (oxlint) | clean, exit 0 | [V] |
| `bun run test:scripts` | **exit 1** — `install-skills CLI: 44 passed, 2 failed`. Re-run on `d523f06f`: **same 2 failures**. **Pre-existing on `main`, not this feature.** | [V] both arms |
| `bun run type-check -- --force` | 6/6 successful, 0 cached, exit 0 | [D] |
| `apps/web-ui` `bun test` | 784 pass / 0 fail — the Phase-2 known red (782/2) is **cleared** | [D] |
| `scripts/__tests__/embedding-defaults-parity.test.ts` | 7 pass / 0 fail; completeness population **30** | [V] |
| `scripts/__tests__/probe-dialect-parity.test.ts` | 14 pass / 0 fail | [V] |
| `scripts/__tests__/provider-list-parity.test.ts` | 7 pass / 0 fail | [D] |
| `scripts/__tests__/turbo-passthrough-env.test.ts` | 3 pass / 0 fail — **vacuous for `MASSA_AI_INFERENCE_PROVIDER`**, see LIP-20 | [D] |
| `packages/core` `inference-probe.test.ts` | 9 pass / 0 fail | [V] |
| `packages/core` `llm-client.test.ts` | 59 pass / 0 fail | [V] |
| `packages/core` `llm-client-json-schema.test.ts` | 13 pass / 0 fail | [V] |
| `packages/core` `health-checker-config.test.ts` @ HEAD | **1 pass / 2 fail** | [V] |
| `packages/core` `health-checker-config.test.ts` @ `d523f06f` | **3 pass / 0 fail** | [V] |
| `packages/core` isolated `--filter='fingerprint\|search-facade-indexing'` | 12/0, 1/0, 25/0 | [V] |
| `packages/core` isolated `--filter='embedding\|inference\|llm-client\|health'` | 75/0, 15/0, 1/0, 12/0, 13/0 | [V] |
| `packages/shared` `embedding-dimensions.test.ts` | 20 pass / 0 fail (LM Studio live on :1234; the probe case really executed) | [V] |
| `packages/shared` `inference-providers.test.ts` | 16 pass / 0 fail | [V] |
| `packages/shared` `config-loader.test.ts` | 40 pass / 0 fail | [D] |
| `bash scripts/tests/test-lms-model-exists.sh` | 57 passed / 0 failed | [V] |
| `bash scripts/tests/test-setup-local-first-api-key.sh` | 40 passed / 0 failed | [V] |
| `bash scripts/tests/test-setup-ollama-model-exists.sh` | 16 passed / 0 failed; file has an **empty diff** over the range | [D] |
| `apps/mcp-client` `config-cli.test.ts` | 32 pass / 0 fail | [D] |
| `apps/opencode-plugin` `config-cli.test.ts` | 27 pass / 0 fail | [D] |
| `apps/tools-api` `system.test.ts` | 12 pass / 0 fail | [D] |
| `bun skills/massa-ai/scripts/check_specs_delivered.ts local-inference-provider-abstraction --root .` | `0 error(s)`, exit 0 | [V] |
| `bun skills/massa-ai/scripts/validate_state.ts --root .` | see "Closing gate" below | [V] |

**A harness defect found and corrected mid-run, recorded because it inverted four verdicts.**
`@massa-ai/shared/inference-providers` resolves through `packages/shared/package.json`'s
export map to `packages/shared/dist/config/inference-providers.js`, **not** to `src/`. Four
mutations applied to the source file therefore reached nothing and read as four surviving
mutants. Re-applied to the resolved artifact, all four were killed. *A mutation resolving to
nothing reads as a gate catching nothing* — the four `M#'` rows below are the valid readings;
the source-only attempts are discarded.

---

## Per-AC evidence table — LIP-01 .. LIP-24

| Req | Verdict | Sensor / evidence (file:line) | Basis |
|---|---|---|---|
| **LIP-01** | **PASS** | `scripts/__tests__/provider-list-parity.test.ts:46-97`; `cohere` at `:84-89` | Asserts **membership equality between derived consumers**, which is what the AC demands — not the syntactic absence of array literals the AC rejects. Three consumers compared as imported values; the fourth (`config-sections.ts`, browser-constrained) text-extracted with a `matches.length !== 1` throw so it cannot pass vacuously. `cohere` asserted against the live `Set`. 7/0. |
| **LIP-02** | **PASS**, weakened sensor | `packages/shared/src/config/__tests__/config-loader.test.ts:461-476`; no-branch half `:438-451` | Consumers are **resolved against real source** (re-reads `embeddings/config.ts` and matches `process\.env\.<NAME>\b`), so the AC's "emitted name is consumed by a named reader" is genuinely tested, not self-answered. Warn-by-name asserted. **Weakness (G8):** the *name list* at `:468` is declared by the test, not derived from `getConfigForEnv()`'s output, so a **fourth** unread `LMSTUDIO_*` name would escape both this test and the emission test. |
| **LIP-03** | **FAIL** | seam: `packages/core/src/kernel/inference-probe.ts`; tests `inference-probe.test.ts:20,42,54`, `probe-dialect-parity.test.ts:196-282` | All three AC assertions exist and **discriminate** (mutants M2, M3′, M11′, M12 all killed — see below). But the requirement enumerates **five** call sites and `design.md:135` names site 2 as `scripts/diagnose.ts:138-178`. `git diff d523f06f..HEAD -- scripts/diagnose.ts` → **0 lines**; `diagnose.ts:105` still `if (response.ok)` after `fetch(${url}/api/tags)`, `:165` still a substring model match. 4 of 5 delivered. No sensor can see it: the dialect test's completeness scan iterates four **shell** files and its regex cannot match TypeScript. |
| **LIP-04** | **PASS** (AC as written) | `packages/shared/src/config/__tests__/embedding-dimensions.test.ts:127-141`, `:143-165`, `:228-240` | AC1 `text-embedding-nomic-embed-text-v1.5 → 768` via the merged LM Studio table, with a fetch-poisoning stub proving no network. AC2 unknown+no-endpoint and unknown+unreachable both **throw**, naming model and endpoint. `resolveModelDimensions` read in full: no numeric fallback survives on that path. Mutants M7, M8, M1c all killed. **Residual (G5):** the function has **zero TypeScript production callers** — `packages/core/src/services/embeddings/config.ts:424` and both `config-cli.ts` copies still fall back to a silent literal `768`, and the bash degraded arm returns a literal `2560`. The AC is about the resolver; the runtime does not use it. |
| **LIP-05** | **PASS** | `scripts/tests/test-lms-model-exists.sh:165-169`, `:227-235`; `test-setup-ollama-model-exists.sh` unmodified | `ollama_model_exists` is **byte-identical** to `d523f06f`; the existing suite has an empty diff and is 16/0. `OLLAMA_URL` / `OLLAMA_HAS_CLI` keep their names (`setup-local-first.sh:92-93`) and the new suite greps the *wizard* for `^OLLAMA_URL=` / `^OLLAMA_HAS_CLI=` — the caller-contract assertion the second AC demands, in the same task. |
| **LIP-06** | **PASS** | `scripts/tests/test-setup-local-first-api-key.sh:203-220` | `installer_write_config` emits provider/baseURL/baseUrl from variables. LM Studio case asserts `provider: "lmstudio"`, `:1234/v1` base URL, `dimensions: 768`, and that `llm.apiKey` is no longer the hardcoded `"ollama"`. The pre-existing 40-assertion contract round-trips unchanged (+61/−0). 40/0. |
| **LIP-07** | **PASS** | `packages/core/src/__tests__/llm-client.test.ts:786` (no `/api/version`), `:803` + `:810` (no `think`, two-sided), `:816` (json-schema enabled, not downgraded) | All three AC assertions present **and discriminating**: mutants M5′ (`supportsOllamaVersionProbe` → true) and M6′ (`injectsDisableThink` → true) each killed the matching LM Studio-specific case. A1 required live evidence; it exists as a narrative attestation in commit `7931fa02`, not as a transcript — recorded here, not re-run. (b) is asserted as "no wrapped `fetch` attached", a sound mechanism proxy since `llm-client.ts:266` is the only `think` writer. |
| **LIP-08** | **NOT COVERED** | none found | The AC demands "a **live call** returns a 768-length vector" through the `lmstudio` entry (`embeddingProviders.lmstudio` → `provider: "custom"` → `createOpenAI`). No test anywhere embeds through the alias, and no manual measurement is recorded in any artifact. The only live 768 in the repo is LIP-04's raw `fetch`, which bypasses the alias, the `custom` dispatch and the SDK. The matrix row `tasks.md:1039` is an unbacked claim. |
| **LIP-09** | **FAIL** | installer half PASSES at `scripts/tests/test-setup-local-first-api-key.sh:211`; CLI half fails | The requirement is "**Selecting LM Studio** sets `llm.baseUrl` to `http://localhost:1234/v1`". The installer does. **Neither config CLI does**: `grep -n "llm" apps/mcp-client/src/config-cli.ts` → **zero matches**; `init --lmstudio` (`:200-211`) and `use lmstudio` (`:281-288`) write only `config.embedding`, in both copy-forks. `llm.baseUrl` stays at `http://localhost:11434/v1`. **The guarding test asserts `show.out` *contains* `http://localhost:1234/v1`** (`config-cli.test.ts:140-148`) — which `embedding.baseURL` alone already satisfies, so it passes with `llm.baseUrl` still on Ollama. That is a test asserting what the code does, not what the spec requires. **Consequence, traced:** `resolveInferenceSpec` (`llm-client.ts:226-233`) matches host:port against `spec.defaultLlmBaseUrl` **first** and returns on a hit, so it never reaches the `embedding.provider` fallback — after `use lmstudio` the LLM client resolves to the **ollama** spec, re-enabling the `/api/version` probe and the `think:false` injection that LIP-07 exists to suppress. |
| **LIP-10** | **FAIL** | compat half: `local-health-checker.ts:86`, `system.test.ts:52-57` (PASS) | LIP-10's AC, in full, is: *"`bun run diagnose` passes against LM Studio with the server up and fails informatively with it down."* That is the **entire** AC — the health/route half appears only in the requirement body and carries no AC of its own, so the diagnose clause is **not severable**. `scripts/diagnose.ts` has an empty diff over `d523f06f..HEAD` and **zero** `lmstudio` mentions; `:117` still `OLLAMA_BASE_URL \|\| "http://localhost:11434"`, `:103` `${url}/api/tags`, `:187` `POST ${url}/api/embed`. Against LM Studio it probes :11434 and reports Ollama unreachable. `tasks.md:1042` restates LIP-10 as "`system.test.ts` green unmodified + neutral siblings" — the AC was **replaced, not satisfied**. Compatibility half is correct: `services.ollama` survives with `inference` added **beside** it, `/system/ollama` untouched (+28/−0), `/system/inference` added. |
| **LIP-11** | **PASS**, residual | `apps/mcp-client/src/__tests__/config-cli.test.ts:78,:140`; `apps/opencode-plugin/src/__tests__/config-cli.test.ts:67,:106` | Both copy-forks got `use lmstudio` and `init --lmstudio`; **both** mirrored test files assert it. The `use` allowlist widened 3 → 6 and **equals** the derived writable set (`LOCAL_INFERENCE_IDS ∪ API_PROVIDER_IDS`). **Residual (G7):** `WRITABLE_PROVIDERS` is a hand-edited literal in two copies that `provider-list-parity.test.ts` does **not** pin, though it pins every other consumer of that union. |
| **LIP-12** | **PASS** | `scripts/tests/test-lms-model-exists.sh:260-272` | `installer_detect_provider` keys on `config.json` → `embedding.provider`. Six fixture cases (ollama / lmstudio / API→other / absent→fresh / malformed→fresh / no-embedding-block→fresh). `:270` additionally greps the function body to prove it does **not** read `install-state.json`, which LIP-12 forbids. |
| **LIP-13** | **PASS**, gap | `scripts/tests/test-lms-model-exists.sh:409-421` (real pty via `script(1)`, both directions), `:310-320` (symmetry) | `on lmstudio` → only "Migrate to ollama" offered, mirror asserted for the ollama side. Symmetry proven structurally: both direction outputs are token-swapped and compared for equality, so the two halves cannot drift into two bodies. **Gap (G9):** the AC's "**the same LIP-15 invalidation** as the opposite direction" has no direct sensor. The gate is `storedFingerprint !== liveFingerprint` — direction-agnostic by construction — but every one of the 26 provider literals in `embedding-fingerprint.test.ts` is `ollama:`. The claim is argued from code shape, not measured. |
| **LIP-14** | **PASS** | `scripts/tests/test-lms-model-exists.sh:212-220` | `lms_cli_path` (`setup-local-first.sh:107-114`) checks `-x "${HOME}/.lmstudio/bin/lms"` **before** `command -v lms`. Four cases ran: off-PATH found, on-PATH found, `~/.lmstudio` preferred over PATH, neither → empty. |
| **LIP-15** | **PASS** | read gate `search-controller.ts:194-199`; write gate `project-indexer.ts:490-500`; stamp `etl/pipeline.ts:553` | All four required cases exist and **all three mutants were killed** (V1/V2/V3 below). Read-gate reach checked independently: `ContextController` routes through `SearchController.searchProject` (`context-controller.ts:155`), so the optimized-context path is covered; `search_code` is an alias of `search_project`. Both the width-differs and the **width-identical** cases are driven with real assertions that the search **raises** rather than warns. **Residual, author-disclosed and confirmed (G6):** the `needsFullReindex` branch carrying the write gate has **zero production callers** (`ensureFreshIndex`'s only caller hardcodes `allowFullReindex: false`); the reachable production recovery is `index_project --forceReindex` → `EtlPipeline.run()`, which **is** where the stamp lives and **is** sensed (V3 killed it). The gate therefore holds in production through a different path than the one the AC names. |
| **LIP-16** | **PASS** | `scripts/tests/test-lms-model-exists.sh:288-296`, `:299-305`, `:424-427` | The `die` is a **real process exit**, not swallowed: `installer_select_provider` sets globals instead of echoing, precisely to avoid the `$(...)` subshell trap; the production call site (`setup-local-first.sh:97`) is a bare statement. The test asserts a `REACHED:` marker is **absent**, i.e. execution really stopped. Unset→keeps-current covered non-interactively and via Enter. |
| **LIP-17** | **FAIL** | `CHANGELOG.md:48-51`; unchanged sites `README.md:81`, `:1047`, `FEATURES.md:1277`, `docs/CHEATSHEET.md:30`, `:63`, `:447` | 17 of 23 enumerated surfaces changed; FEATURES.md TOC anchors all resolve (33 links, 0 unresolved, before = after — the `#local-first-llm-ollama` → `#local-first-llm-ollama-or-lm-studio` rename moved heading and anchor together). `tasks.md:850-854` requires each unchanged site to carry a **written reason**; the only written accounting is `CHANGELOG.md:49-51`, which says all 6 "describe `bun run diagnose`". **Verified false for 3 of the 6:** `FEATURES.md:1277` is `OLLAMA_EMBED_DELAY_MS` (a genuine Ollama-only knob, `provider.ts:212`), `CHEATSHEET.md:30` is `OLLAMA_BASE_URL` in the install.sh override table, `CHEATSHEET.md:447` is `run-deterministic.ts`. None mentions diagnose. The commit that *corrected* four false claims introduced a fifth of the same class. |
| **LIP-18** | **FAIL** | `scripts/__tests__/embedding-defaults-parity.test.ts:209-261` (Tier 3, re-keyed); `:303-309` (width writers) | The Tier-3 re-key **is** load-bearing (M1b killed it). But the AC also says *"Keep the exactly-one rule **per provider per surface**"*, and there are **zero** LM Studio extractors in `PAIR_SURFACES`, `MODEL_ONLY_SURFACES` or `DIMS_ONLY_SURFACES`. Three mutations confirm the consequence: **M1a**, **M10** and **M13** each made the LM Studio model/width pair self-contradictory on a real surface and **all three survived every gate**. That is verbatim the EDC-06 defect the file exists to prevent (`:5-8`), now on the second provider. |
| **LIP-19** | **PASS** | `config-sections.ts:46`, `:120-123` | `bun run type-check -- --force` → 6/6, 0 cached, exit 0 (the mapped type over `keyof MassaAiConfig` is the real gate and it is exercised). `apps/web-ui` 784/0; the documented Phase-2 red (782 pass / 2 fail on the golden-fixture cases) is cleared, and 782 + 2 = 784 confirms the two cases now pass rather than having disappeared. |
| **LIP-19b** | **FAIL** (narrow clause; end state correct) | `embedding-defaults-parity.test.ts:43-60` | The extractor **is** re-anchored and its comment rewritten, and the extractor is exercised green with a real anti-vacuity throw. But the AC says "**in the same commit**": the union was deleted in `7987443d` (T03, Phase 2) and the extractor re-anchored in `018e1529` (T15, Phase 6) — four commits and four phases apart. The gate did not go vacuous in the window (the interface block never contains the literal `provider: "ollama",`, so the extractor still matched exactly once), but for four phases its documented discriminator described a mechanism that no longer existed — which is precisely the defect LIP-19b names. |
| **LIP-20** | **FAIL** | `turbo.json` — `grep -c MASSA_AI_INFERENCE_PROVIDER` → **0** | The three `LMSTUDIO_*` names **are** present. `MASSA_AI_INFERENCE_PROVIDER` is a new `MASSA_AI_*` variable (read at `scripts/lib/installer-feature-prompts.sh`) and is absent from `tasks.test.passThroughEnv`. The mechanised guard is structurally blind to it — it scans literal `process.env` accessors in `packages/`+`apps/`, and this variable is read only in bash — so `turbo-passthrough-env.test.ts`'s 3/0 green says nothing about it. Zero functional impact today (the shell suite runs under `test:scripts`, which turbo never dispatches); the AD-010 clause is nonetheless literally unmet. Also absent from `.env.example`. |
| **LIP-21** | **PASS** | `CHANGELOG.md:8-10` `## [Unreleased]` → `### Added`, `:53` `### Changed`; +56 lines over the range | Valid headings per `CONTRIBUTING.md` § "CHANGELOG authoring"; no released section hand-edited. `check_specs_delivered.ts` → `0 error(s)`, exit 0. |
| **LIP-22** | **PASS** on its literal AC; **the requirement's stated subject remains UNMEASURED** | `tasks.md:949-1027`; figures transcribed below | See "Independent call 1". |
| **LIP-23** | **PASS**, mis-attributed sensor | **real sensor:** `packages/core/src/__tests__/llm-client.test.ts:832`, `:839` via `lastProviderEntrypoint` (`:32`, `:51-66`) | The AC demands the sensor record **which entrypoint `buildProvider` invoked**, not the flag's value, and that flipping the flag redden it. It does: the mock's default callable records `"responses"` and `.chat` records `"chat"`, both directions asserted. **Mutant M4′ killed it** — `Expected: "chat"  Received: "responses"`. **Defect (G10):** the matrix attributes this to `llm-client-json-schema.test.ts`, whose entire +21-line diff is a LIP-07 test and whose `@ai-sdk/openai` mock has **no `.chat` member at all**, so that file structurally *cannot* sense the entrypoint. A reader auditing the named file would conclude LIP-23 is uncovered. Live end-to-end evidence is commit prose in `c838837d`, not a transcript. |
| **LIP-24** | **PASS** on the AC; its substitute sensor's file is red | `embedding-defaults-parity.test.ts:184-208` (accounting) → `packages/core/src/__tests__/health-checker-config.test.ts:51` | The accounting took the **enumerate-and-show-covered** branch, not an allowlist silencing: exactly one file (`local-health-checker.ts`) left the token-visible population, and its named substitute is a real behavioural sensor that drives the runtime read through the seam. Completeness population independently measured at **30** at HEAD, matching the author's own final figure. **But (G2):** the substitute file is **1 pass / 2 fail at HEAD and was 3 pass / 0 fail at `d523f06f`** — a regression this feature caused on a file it never edited. The specific cited test still passes, so the AC holds; the file does not. |

---

## Discrimination sensor — mutation results

17 mutations. **13 killed, 4 survived** (plus 2 invalid attempts, recorded and discarded).
Restore was from file copies; `git status --porcelain` empty afterwards, all sha256s matched.

### Killed (sensor proven to discriminate)

| # | Requirement | Mutation | Killed by |
|---|---|---|---|
| M1b | LIP-18 | Injected `const LMSTUDIO_EMBEDDING_DIMENSIONS = 1024;` into an **unlisted tracked file** (`etl/pipeline.ts`) | parity Tier 3 → 6/1. Independently re-induced (different file, DIMENSIONS half) from the author's recorded red. |
| M1c | LIP-04/18 | `inference-providers.ts` lmstudio `knownDimensions` 768 → 1024 | `embedding-dimensions.test.ts` 19/1 (`Expected: 768  Received: 1024`) **and** `inference-providers.test.ts` 15/1. Parity gate stayed green. |
| M2 | LIP-03 (TS) | `probeProvider` decides on `response.ok` instead of body shape | `inference-probe.test.ts` 6/3 — all three AC cases red; `probe-dialect-parity.test.ts` red on 4 Tier-2 fixtures (`ts=true bash=false`). |
| M3′ | LIP-03 (TS) | `parseLmStudioModelList` also accepts `{models:[…]}` | `inference-probe.test.ts` 8/1 ("the LM Studio probe rejects the ollama `{models:[...]}` shape even at 200"); dialect 13/1. |
| M4′ | LIP-23 | lmstudio `requiresChatCompletionsApi` true → false | `llm-client.test.ts` 58/1 — `Expected: "chat"  Received: "responses"`. **The AC's own demand — "flipping the flag must redden it" — verified.** |
| M5′ | LIP-07 | lmstudio `supportsOllamaVersionProbe` false → true | `llm-client.test.ts` 57/2 — the no-`/api/version` case and the json-schema-stays-enabled case both red. |
| M6′ | LIP-07 | lmstudio `injectsDisableThink` false → true | `llm-client.test.ts` 58/1 — "buildProvider does NOT attach a wrapped fetch". |
| M7 | LIP-04 | `resolveModelDimensions`: no-baseUrl `throw` → `return DEFAULT_EMBEDDING_DIMENSIONS` | `embedding-dimensions.test.ts` 19/1. |
| M8 | LIP-04 | unreachable-endpoint `throw` → silent default | `embedding-dimensions.test.ts` 19/1 (the case labelled "discriminating check"). |
| M11′ | LIP-03 (bash) | **all four** copies of `massa_ai_probe_provider` accept any non-empty body | `probe-dialect-parity.test.ts` red on 3+ Tier-2 fixtures (`ts=false bash=true`). **The 200-with-error-body verdict discriminates in the bash dialect too.** |
| M12 | LIP-03 (bash) | **one** copy drifts (`validate-vscode-integration.sh`, key `models`→`data`) | dialect Tier 1 byte-identity 13/1. |
| V1 | LIP-15 read gate | Deleted the `EmbeddingIndexStaleError` throw in `SearchController.searchProject` | `embedding-fingerprint.test.ts` 11/1 — "throws … and never calls search()". |
| V2 | LIP-15 write gate | Dropped `fingerprintMismatch` from `needsFullReindex` | 9/3 — including `Expected: "full_reindex"  Received: "incremental_reindex"` on the **width-identical** case, which is exactly the spec's correction #2. |
| V3 | LIP-15 stamp | Disabled `stampEmbeddingFingerprint` at the **production** site (`etl/pipeline.ts:553`) | `etl-embedding-fingerprint.test.ts` 0/1 — the forceReindex recovery case. |

### Survived (these become fix tasks)

| # | Requirement | Mutation | Every gate stayed green |
|---|---|---|---|
| **M1a** | **LIP-18** | `.env.example:221` `#LMSTUDIO_EMBEDDING_DIMENSIONS` 768 → **1024**, contradicting the 768 model two lines above | parity 7/0 |
| **M10** | **LIP-18** | `packages/core/src/services/embeddings/config.ts:411` default LM Studio model → `"bogus-lmstudio-model"` **and** `:424` width fallback 768 → **1536** | parity 7/0 **and** core isolated `--filter='embedding\|inference\|llm-client\|health'` **116 pass / 0 fail** |
| **M13** | **LIP-18** | `scripts/setup-local-first.sh:333` wizard LM Studio default model → `"bogus-wizard-model"` | parity 7/0, `test-lms-model-exists.sh` 57/0, `test-setup-local-first-api-key.sh` 40/0 |
| **M9** | LIP-04 (runtime) | `dist` lmstudio `knownDimensions` 768 → 1024 | `inference-probe.test.ts` 9/0, `llm-client.test.ts` 59/0 — no *runtime* consumer senses the width; only `packages/shared`'s own tests do (M1c). Low severity: the width is checked, just not where it is consumed. |

**Invalid attempts, recorded so they are not mistaken for evidence.** M3–M6 applied to
`packages/shared/src/config/inference-providers.ts` read as surviving; the export map resolves
that specifier to `dist/`, so they reached nothing. Re-run as M3′–M6′ against the resolved
artifact, all four were killed. M11's first `perl` expression silently matched nothing (`grep`
confirmed zero patched lines); re-run as M11′ via a literal-string patcher that asserts the
match, it killed. Both are verifier-side harness defects, not findings about the subject.

---

## Independent calls requested

### 1. Does the recorded LIP-22 bound satisfy its AC?

**My call: PASS on the literal AC, and the requirement's own stated subject is UNMEASURED.
Not a FAIL — a spec sensor-choice defect, not an execution failure.**

The figures, transcribed here as the AC requires (`bun run bench:needles`, corpus head
`bc2f2f82`, fixture `benchmarks/needles/fixtures/massa-ai.json` sha256 `3028ced2…`, **14**
needles N01–N14, `scoring.staleNeedles []`, identical population on both arms):

| metric | 2560 — `qwen3-embedding:4b` | 768 — `nomic-embed-text` |
|---|---|---|
| hit@1 | **0.5000** (7/14) | **0.2857** (4/14) |
| hit@3 | 0.7143 (10/14) | 0.6429 (9/14) |
| hit@5 | 0.7857 (11/14) | 0.7143 (10/14) |
| hit@10 | 1.0000 (14/14) | 0.7857 (11/14) |
| MRR | **0.6423** | **0.4650** |
| wall clock | 90.88 s | 20.23 s |

768-only misses: **N08** (`chunker-post.ts:33-36`), **N11** (`discover.ts:188-194`),
**N12** (`postgres-vector-store.ts:74-77`) — exactly `14 − 11` outside top-10, and all three
inside top-10 at 2560. Widths asserted by independent `curl`, not inferred.

I re-read both aggregates directly from the durable copies rather than from the prose:
`/tmp/t17-needles-2560.json` → `{"model":"qwen3-embedding:4b","aggregate":{"hitAt1":0.5,"hitAt3":0.7143,"hitAt5":0.7857,"hitAt10":1,"mrr":0.6423},"n":14}`;
`/tmp/t17-needles-768.json` → `{"model":"nomic-embed-text","aggregate":{"hitAt1":0.2857,"hitAt3":0.6429,"hitAt5":0.7143,"hitAt10":0.7857,"mrr":0.465},"n":14}`.
Every figure is an exact `n/14`, both arms share one population, and both MRRs fall inside the
bounds their own hit@k ladders imply. **The comparison is a comparison.**

Why it is nevertheless not a measurement of what LIP-22 names. The AC's mechanism,
`bun run bench:needles`, is structurally incapable of observing the subject:
`benchmarks/needles/run.ts` is a self-contained in-process **exact-cosine** ranker that never
constructs `postgres-vector-store.ts`, so neither the `>2000` binary-quantization path nor the
≤2000 plain-HNSW path runs on **either** arm — the algorithm delta is removed from both sides.
And it embeds only via Ollama `POST /api/embeddings` with `options.num_ctx`, so the 768 arm ran
`nomic-embed-text` **through Ollama**, never LM Studio and never A2's
`text-embedding-nomic-embed-text-v1.5`.

I grade this PASS rather than FAIL for three reasons, and I would not defend a fourth. The
requirement is self-labelled "(accepted risk)", so its purpose is to convert an unknown into a
*recorded* one. Its AC is narrow and explicit, and the author ran exactly the mechanism it
names. And the gap was not papered over — it was measured, cited to source, and written down
as UNMEASURED. Grading that FAIL would punish the most rigorous work in the feature without
changing a line of code. **But the requirement's title still asserts a measurement that does not
exist**, so G4 below is a *spec amendment*, not a code fix: strike `bench:needles` as LIP-22's
sensor and name `packages/core/src/__tests__/e2e/14.needles.test.ts`, which can settle it.

### 2. Does any LIP require the `scripts/diagnose.ts` change?

**My call: yes — two, independently. This is a FAIL, not a residual.**

**LIP-10.** Its acceptance criterion, in full, is: *"AC: `bun run diagnose` passes against LM
Studio with the server up and fails informatively with it down."* That is the requirement's
**only** AC sentence. The health-checker and route work appears in the requirement *body* and
carries no AC of its own. There is nothing to sever: the AC names one command, that command is
unchanged, and it cannot pass. `tasks.md:1042` restates LIP-10 as "`system.test.ts` green
unmodified + neutral siblings", which is the body's half re-labelled as the whole — *an AC that
names a mechanism demands that mechanism.*

**LIP-03.** The requirement enumerates five probe call sites and is emphatic about the count
("**Five call sites, not four**" — the fifth was found by review, not by sweep).
`design.md:135` names site 2 as `scripts/diagnose.ts:138-178` → `probeProvider` + exact match.
Four converted, one not. The site list was also silently re-membered rather than merely
under-delivered: T10's write set drops `diagnose.ts` and adds `scripts/ensure-ollama.sh`, which
neither spec nor design names — the count stayed five while the membership changed, and no
artifact records the substitution as a deviation.

**And it is not cosmetic.** `scripts/setup-local-first.sh:703-707` runs `bun run diagnose` at
the end of the wizard, and `diagnose.ts:389-390` is
`const allOk = ollamaOk && pgOk; process.exit(allOk ? 0 : 1)`. An LM Studio-only user therefore
finishes the documented install watching the stack-validation step report Ollama missing and
fail. (Measured precisely, against my own first instinct: the call site is
`bun run diagnose || echo "⚠ Some checks failed…"`, so the **wizard itself does not abort** — the
user gets a red diagnose plus a yellow warning, not a non-zero install. The defect is a false
failure report on the feature's own happy path, not a broken installer.) `README.md:58`, three
lines below the new LM Studio block, tells that user this step "validates the stack".

This one file is the root cause of three separate FAIL rows (LIP-03, LIP-10, and six of
LIP-17's unchanged doc surfaces). It is the single highest-value fix in the list.

---

## Ranked gap list (fix tasks)

| # | Sev | Gap | Requirement | Fix |
|---|---|---|---|---|
| **G1** | **HIGH** | `scripts/diagnose.ts` never received the change `design.md:140` promised — zero diff over the range, zero `lmstudio` mentions. Steps 1–4 still hardcode Ollama's endpoint, `/api/tags`, `response.ok`, `/api/embed` and a substring model match. | **LIP-10** (whole AC), **LIP-03** (site 2 of 5) | Convert steps 1–4 to `probeProvider` + provider-dispatched embed shape + exact model match. Then 6 of LIP-17's unchanged doc surfaces stop needing an excuse. |
| **G2** | **HIGH** | Feature-induced regression: `packages/core/src/__tests__/health-checker-config.test.ts` is **3/0 on `d523f06f`** and **1 pass / 2 fail at HEAD**, on a file the feature never edited. Cause: the seam migration moved the model read from `config.getAll()` (`@massa-ai/shared`, which the test's `mock.module` covers) to `loadConfigSafe()` (`@massa-ai/shared/config`, a different specifier the mock does not cover), so both file-read cases now receive the real default. | LIP-24's own failure shape; not caught by any gate | Extend the `mock.module` to the `@massa-ai/shared/config` specifier. This is also the file LIP-24's accounting leans on as its substitute sensor. |
| **G3** | **HIGH** | LIP-18's "exactly-one rule **per provider per surface**" is undelivered: zero LM Studio extractors exist in `PAIR_SURFACES` / `MODEL_ONLY_SURFACES` / `DIMS_ONLY_SURFACES`. Three mutants (M1a, M10, M13) made the LM Studio model/width pair self-contradictory on `.env.example`, `embeddings/config.ts` and `setup-local-first.sh` and **all survived**, including a 116-test core filter. | **LIP-18** | Add LM Studio rows to the surface tables, keyed on `LMSTUDIO_EMBEDDING_(MODEL\|DIMENSIONS)` and the `text-embedding-nomic…` literal, with a second `referencePair()` for the LM Studio pair. Re-induce M1a and M10 as the observed reds. |
| **G4** | **HIGH** | Both config CLIs write only `config.embedding` on LM Studio selection — `grep -n "llm" apps/mcp-client/src/config-cli.ts` → zero matches — so `llm.baseUrl` stays on `:11434` and `resolveInferenceSpec` returns the **ollama** spec, re-enabling the `/api/version` probe and `think:false` injection. The guarding test passes vacuously (`show.out` *contains* the 1234 URL, which `embedding.baseURL` already satisfies). | **LIP-09**, and it silently defeats **LIP-07**/**LIP-23** on this path | Write `config.llm.baseUrl` in both forks' `use`/`init` LM Studio branches; change the test to assert the `llm.baseUrl` field, not a substring of the whole `show` output. |
| **G5** | **MED** | LIP-08 has **no sensor and no recorded measurement**. Nothing embeds through the `lmstudio` alias. | **LIP-08** (NOT COVERED) | One live test (or one recorded manual run) that calls `createEmbeddingProvider` with `embedding.provider = "lmstudio"` and asserts `vector.length === 768`. |
| **G6** | **MED** | `resolveModelDimensions` has **zero TypeScript production callers**. `embeddings/config.ts:424` and both `config-cli.ts` copies still fall back to a silent literal `768`; the bash degraded arm (no bun / no checkout — the `npx` install path) returns a literal `2560`. LIP-04's AC is about the resolver, which is correct; the runtime does not use it. | LIP-04 residual | Wire the resolver into the runtime lmstudio branch, or record the literal fallbacks as a deliberate, bounded degradation with the condition named. |
| **G7** | **MED** | `CHANGELOG.md:49-51` states all 6 unchanged doc surfaces "describe `bun run diagnose`". **False for 3**: `FEATURES.md:1277` (`OLLAMA_EMBED_DELAY_MS`), `CHEATSHEET.md:30` (`OLLAMA_BASE_URL` override table), `CHEATSHEET.md:447` (`run-deterministic.ts`). The commit that corrected four false claims introduced a fifth of the same class. | **LIP-17** | Split the sentence: 3 diagnose-bound, 3 genuinely Ollama-specific. (Largely moot once G1 lands.) |
| **G8** | **MED** | `MASSA_AI_INFERENCE_PROVIDER` absent from `turbo.json` → `tasks.test.passThroughEnv`; also absent from `.env.example`. The mechanised guard is structurally blind (bash-only read), so its green is vacuous here. | **LIP-20** (AD-010) | One-line addition to both files. Consider widening `turbo-passthrough-env.test.ts` to scan `scripts/**/*.sh` for `MASSA_AI_*` reads. |
| **G9** | **LOW-MED** | LIP-02's sensor derives its *consumers* from real source but its *name list* from a literal the test declares (`config-loader.test.ts:468`). A fourth `LMSTUDIO_*` name emitted and unread escapes both this test and the emission test. | LIP-02 residual | Derive the loop from `Object.keys(getConfigForEnv(...))`. |
| **G10** | **LOW-MED** | `WRITABLE_PROVIDERS` is a hand-edited literal in two CLI copies that `provider-list-parity.test.ts` does not pin, though it pins every other consumer of the same union. A seventh provider would leave both CLIs silently rejecting it, green. | LIP-11 residual | Add both copies to the membership-equality assertion. |
| **G11** | **LOW-MED** | LIP-13's "the same LIP-15 invalidation" half has no direction-specific sensor: all 26 provider literals in `embedding-fingerprint.test.ts` are `ollama:`. Sound by construction (string inequality), unmeasured in the `lmstudio → ollama` direction. | LIP-13 gap | One fixture with an `lmstudio:` stored fingerprint. |
| **G12** | **LOW** | LIP-19b's AC says "in the same commit"; the union was deleted in `7987443d` and the extractor re-anchored in `018e1529`, four phases apart. End state correct and the gate never went vacuous. | **LIP-19b** | Record as an accepted deviation, or amend the clause. No code change. |
| **G13** | **LOW** | LIP-23's sensor is attributed in the matrix to `llm-client-json-schema.test.ts`, which cannot sense the entrypoint (its `@ai-sdk/openai` mock has no `.chat` member). The real sensor is `llm-client.test.ts:832`/`:839`. | LIP-23 bookkeeping | Correct `tasks.md:1052`. |
| **G14** | **LOW** | Spec amendment, not a code fix: LIP-22's AC names `bun run bench:needles`, which cannot observe the binary-quantization branch it exists to measure. | **LIP-22** | Strike `bench:needles` as the sensor; name `packages/core/src/__tests__/e2e/14.needles.test.ts`. |
| **G15** | **LOW** | Two vacuous-skip guards in `test-lms-model-exists.sh:191` — reshaping `lms_cli_path` silently drops all four LIP-14 assertions with no failure (contrast `:334-341`, where the same risk *is* handled with an explicit `fail`). All four did execute here; the guard is the latent risk. | LIP-14 hygiene | Mirror the `:334-341` pattern. |
| **G16** | **LOW** | `spec.md:450` lists `config-section-coverage.test.ts` among the fixtures to update. No such file exists at HEAD or at `d523f06f`. | LIP-19 spec defect | Strike it from the spec. |

---

## Pre-existing failures (explicitly NOT this feature's)

- `bun run test:scripts` exits 1 on `scripts/tests/test-install-skills-cli.sh`
  (`no tools exits 2` → got `1`; `reason is reported`). **Measured identically on `d523f06f`.**
  `install-skills.sh` has an empty diff over the range. Not a LIP gap.
- `tasks.md` has never passed `validate_tasks.ts` ("no tasks parsed") because it writes
  `### T16 — ` against `/^#{2,4}\s+T\d+\s*:/m`. Pre-existing since Phase 1; confirmed at
  `validate_state.ts:45`. It is also what makes this file's mere existence the
  completeness trigger (`validate_state.ts:129-131`).

## Skipped checks, with reasons

- **Live LM Studio end-to-end runs for LIP-07, LIP-09 and LIP-23** were not re-executed. The
  server is up (`GET :1234/v1/models` → 200, confirmed while LIP-04's probe case ran), but A1's
  required evidence exists only as commit prose (`7931fa02`, `c838837d`) and re-running it
  would produce a fresh attestation, not the missing transcript. Recorded as attested, not
  verified.
- **`bun run bench:needles`** was not re-run (slow, and it mutates the index). The recorded
  figures were instead re-read from the durable JSON copies and checked for internal
  consistency, which is the stronger check for the defect class at issue.
- **The full `bun run test` turbo aggregate** was not run; targeted per-package suites were used
  instead, because turbo cancels siblings on a failure and would have hidden reds.
- **Docker/Swagger smoke and the coverage floor** were out of scope for this gate.

## Restore verification

`git status --porcelain` in the worktree: **empty**, before the first mutation and after the
last. Every mutated file's sha256 matches its pre-mutation copy in `/tmp/lip-mutation-backup`
(`inference-providers.ts`, `inference-providers.js` (dist), `inference-probe.ts`,
`embedding-dimensions.ts`, `.env.example`, `embeddings/config.ts`, `setup-local-first.sh`,
`install.sh`, `validate-vscode-integration.sh`, `ensure-ollama.sh`, `search-controller.ts`,
`project-indexer.ts`, `etl/pipeline.ts`, `embedding-defaults-parity.test.ts`). **No `git
checkout`, `git stash` or `git restore` was used at any point.** The only file this
verification wrote is this one.

## Exact next step

Land **G1** (`scripts/diagnose.ts`) first: it alone clears LIP-10, completes LIP-03's fifth
site, and removes the need for six of LIP-17's written exceptions. Then **G2**, **G3**, **G4**
— the two that are silently green (G3's surviving mutants, G4's vacuous assertion) before the
two that are merely absent. Re-run this gate afterwards; LIP-08 (G5) still needs a sensor
before the feature can pass.
