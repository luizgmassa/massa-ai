# Validation — Local inference provider abstraction + LM Studio (LIP)

**Feature slug:** `local-inference-provider-abstraction`
**Commit range verified:** `d523f06f..c9232108` (44 commits, 8 Phases, 25 Tasks).
Phase 8 alone: `cf29d5d5..HEAD` — `9e26e119` (T20), `a59e7901`+`9407567d` (T19),
`87dacbc3` (T21), `1d5d3489` (T22), `4354f2ba` (T24), `a691cf0b` (T23),
`06ddadb1` (T19 literal + doc fix), `c9232108` (T25). G7 closed earlier in `e04e12d0`.
**Worktree:** `/Users/luizmassa/Projects/massa-ai-feat-local-inference-provider-abstraction`,
branch `feat/local-inference-provider-abstraction`.
**Verifier:** verification agent (author != verifier). This is the **second** independent
pass; it supersedes the Phase-7 report whose verdict was FAIL with gaps G1–G16.
Coverage re-derived from `spec.md`'s own requirement text. `tasks.md`'s Test Coverage
Matrix was treated as a claim to falsify, not a source. Evidence-or-zero.
**Date:** 2026-09-20.

---

## Summary

**Result: FAIL**

Phase 8 closed **13 of the 16** gaps, and closed the important ones properly — with code,
not with prose. `scripts/diagnose.ts` is genuinely provider-dispatched and was verified
**live in five configurations**; LIP-08 acquired a real sensor that kills the mutant no
runtime consumer could previously see; the three LM Studio mutants that survived the last
pass all die now; and assumption **A1** — which `spec.md:502-510` makes an explicit FAIL
condition if only stubbed — is satisfied for the first time with a real request transcript.

Two requirements are nevertheless unmet, and one new surface escaped every gate:

| | Requirement | Verdict |
|---|---|---|
| 1 | **LIP-22** | **FAIL** — T24 amended the AC to name `14.needles.test.ts`, then never ran it. That file is **byte-unchanged over the whole range** and is gated on `RUN_E2E + API + **Ollama** up` with no 768/LM Studio arm, so as written it cannot observe this requirement's subject either. The amendment's own sentence is "a promise to measure later is not an AC". **Phase 8 converted a PASS into a FAIL by strengthening a clause it did not execute.** |
| 2 | **LIP-19b** | **FAIL** (unchanged from the last pass) — G12 was listed in T24's heading and restated verbatim in its body, and then **nothing was done**. Neither branch of its own directive ("record as an accepted deviation, or amend the clause") exists anywhere in the repo. |
| 3 | **LIP-18** | **PASS on its AC**, but its body clause *"keep the exactly-one rule per provider per surface"* is violated on a surface **T19 itself created**: `scripts/diagnose.ts:127-130` now hand-copies **both** providers' default embedding models, in no surface table. Mutation **M14b survives every gate**. |

**One mutant survives** (M14b). **Nine of ten mutations were killed**, including all four the
last pass could not kill (M1a, M10, M13, M9).

---

## Scope and method

**(1) Spec-anchored outcome check.** For LIP-01..LIP-24 the sensor claimed to cover each AC
was located and read against `spec.md`'s own text, asking whether it asserts the
*spec-defined outcome* or merely the *implementation's behaviour*. An AC with no locatable
sensor is NOT COVERED.

**(2) Discrimination sensor.** 10 behaviour-level mutations, including the four the previous
pass recorded as survivors. **Every restore was from a file copy held outside the repository
(`/tmp/lip-p8-backup`). No `git checkout`, `git restore` or `git stash` was used at any
point.** A literal-string patcher that asserts its own match count and prints the population
beside the verdict was used throughout, because a `perl -pi -e` expression carrying `${...}`
is eaten by shell interpolation and can silently patch nothing.

**(3) Live measurement.** The environment of record was exercised directly rather than
attested: Ollama on `:11434` (`qwen3-embedding:4b`, 2560), LM Studio on `:1234`
(`text-embedding-nomic-embed-text-v1.5` 768, plus `qwen/qwen3-4b-2507`), PostgreSQL 17.10 +
pgvector 0.8.4.

**Provenance.** `[V]` = the verifier ran the command in this worktree. `[D]` = a delegated
reader ran it and the verifier re-derived the *conclusion*, not the *number*. Every FAIL row
above rests on at least one `[V]` measurement.

**Harness traps carried forward and respected.** `@massa-ai/shared/inference-providers`
resolves through the export map to `packages/shared/dist/config/inference-providers.js`, not
`src/` — M9 was applied to the resolved artifact and verified by sha256, since `dist/` is
gitignored and `git status` cannot see a mutation there. `DATABASE_URL` was exported for
every `apps/*` gate (this worktree has no `.env`; without it seven `apps/mcp-client`
isolation groups fail on provisioning, not on the feature).

---

## Gates run, with measured results

| Gate | Result | Provenance |
|---|---|---|
| `bun run lint` (oxlint) | clean, **exit 0** | [V] |
| `bun run type-check` | **6/6 successful, 0 cached**, exit 0 | [V] |
| `bun run test:scripts` | TS half **2050 pass / 0 fail across 89 files**; exit 1 on the documented pre-existing `install-skills CLI: 44 passed, 2 failed`. `scripts/install-skills.sh` and `scripts/tests/test-install-skills-cli.sh` both have an **empty diff** over `d523f06f..HEAD`. **Not this feature's.** Nothing else in the shell half fails. | [V] |
| `bun run diagnose` — LM Studio **up**, provider via env | **exit 0**; `[1/7] lmstudio found at ~/.lmstudio/bin/lms`, `[2/7] API reachable at http://localhost:1234/v1 (9ms)`, `[3/7] Model 'text-embedding-nomic-embed-text-v1.5' is available`, `[4/7] Embedding OK! dimensions=768 latency=68ms` | [V] |
| `bun run diagnose` — LM Studio **up**, provider from `config.json` only (scratch `XDG_CONFIG_HOME`, no env knob) | **exit 0**, `dimensions=768 latency=29ms` | [V] |
| `bun run diagnose` — LM Studio **down** (`LMSTUDIO_BASE_URL=:1235/v1`) | **exit 1**; `API not responding (tried: http://localhost:1235/v1, http://127.0.0.1:1235/v1, http://100.100.100.100:1235/v1)`, `Start with: lms daemon up` | [V] |
| `bun run diagnose` — **ollama** provider pointed at LM Studio's live `:1234` | **exit 1**, `API not responding` — the LIP-03 false positive, killed live | [V] |
| `bun run diagnose` — real developer config (ollama), no override | **exit 0**, `dimensions=2560` — no regression | [V] |
| **Live `llmObject` against LM Studio** (`qwen/qwen3-4b-2507`, real config path, fetch transcript captured) | `{"ok": true, "value": {"capital": "Paris"}}`; `/api/version` calls **0**, `/v1/responses` calls **0**, `/v1/chat/completions` calls **1**, any body carrying a `think` key **false**, request body carries `"response_format":{"type":"json_schema",…}` | [V] |
| `scripts/__tests__/embedding-defaults-parity.test.ts` | **9 pass / 0 fail**; pair surfaces 7, model-only 2, width-only 1, **LM Studio pair surfaces 6**, **LM Studio model-only 1**, completeness population **32**, width-writer population **5** | [V] |
| `scripts/__tests__/diagnose.test.ts` | **33 pass / 0 fail** (new file, +253 lines) | [V] |
| `scripts/__tests__/probe-dialect-parity.test.ts` | 14 pass / 0 fail; scanned 4 scripts, 0 offenders | [V] |
| `scripts/__tests__/provider-list-parity.test.ts` | **9 pass / 0 fail** (was 7 — both CLI copies now pinned) | [V] |
| `scripts/__tests__/turbo-passthrough-env.test.ts` | **4 pass / 0 fail** (was 3 — the LIP-20 sentinel is new) | [V] |
| `packages/core` isolated `--unit --filter='embedding\|inference\|llm-client\|health\|fingerprint\|lmstudio'` | **all 14 groups PASS** — incl. `health-checker-config` **3/0**, `embedding-fingerprint` **14/0**, `llm-client` **59/0**, `llm-client-json-schema` **13/0**, `lmstudio-embedding-live` **2/0**, `etl-embedding-fingerprint` **1/0** | [V] |
| `packages/core` `inference-probe.test.ts` | 9 pass / 0 fail | [V] |
| `packages/shared` `bun run test` | **921 pass / 0 fail across 37 files**; `inference-providers.test.ts` 16/0, `embedding-dimensions.test.ts` 20/0 (LM Studio live — the probe case really executed), `config-loader.test.ts` 40/0 | [V] |
| `apps/mcp-client` `bun run test` | **all 13 isolation groups PASS** | [V] |
| `apps/opencode-plugin` `bun run test` | **166 pass / 0 fail across 9 files** | [V] |
| `apps/web-ui` `bun test` | **784 pass / 0 fail** | [V] |
| `apps/tools-api` `system.test.ts` | 12 pass / 0 fail | [V] |
| `apps/tools-api` `config-section-coverage.test.ts` | 4 pass / 0 fail | [V] |
| `bash scripts/tests/test-lms-model-exists.sh` | **57 passed / 0 failed** | [V] |
| `bash scripts/tests/test-setup-local-first-api-key.sh` | 40 passed / 0 failed | [V] |
| `bash scripts/tests/test-setup-ollama-model-exists.sh` | 16 passed / 0 failed | [V] |
| `bun skills/massa-ai/scripts/check_specs_delivered.ts local-inference-provider-abstraction --root .` | `0 error(s)`, **exit 0** | [V] |

**One reading not to mistake for a finding.** `apps/opencode-plugin` came back **165 pass /
1 fail** on a run taken while a mutation was still on disk elsewhere in the tree, and **166 /
0** twice on a clean tree. Recorded because *a worker's "pre-existing" failures are usually
its own residue*; the clean readings are the ones that count.

---

## Per-AC evidence table — LIP-01 .. LIP-24

| Req | Verdict | Sensor / evidence (file:line) | Basis |
|---|---|---|---|
| **LIP-01** | **PASS** | `scripts/__tests__/provider-list-parity.test.ts:46-113` | Membership equality between derived consumers, as the AC demands. `cohere` asserted against the live `Set`. **Now also pins both CLI copies' `WRITABLE_PROVIDERS` (`:99-113`)** with a `matches.length !== 1` throw so it cannot pass vacuously — M16 and M16b each named the offending file. 9/0. |
| **LIP-02** | **PASS** | `packages/shared/src/config/__tests__/config-loader.test.ts:454-493` | **G9 closed.** The name list is no longer test-declared: `const emitted = Object.keys(getConfigForEnv()).filter(k => k.startsWith("LMSTUDIO_"))` with `expect(emitted.length).toBeGreaterThan(0)` as an anti-vacuity guard, then each derived name matched against real source for `process.env.<NAME>`. A fourth emitted-but-unread `LMSTUDIO_*` name now reddens. 40/0. [D + code read [V]] |
| **LIP-03** | **PASS** | seam `packages/core/src/kernel/inference-probe.ts`; `inference-probe.test.ts` 9/0; `probe-dialect-parity.test.ts:196-282` 14/0; **site 2** `scripts/diagnose.ts:204-213`, sensed by `scripts/__tests__/diagnose.test.ts:234-292` | **G1 closed — all five call sites delivered.** `diagnose.ts` now calls `probeProvider(spec, url)` and decides on `result.reachable`, never `response.ok`. Verified **live, not by inspection**: with the real LM Studio answering 200 + `{"error":…}` on `/api/tags`, the ollama arm reports `API not responding` and exits 1. `diagnose.test.ts:248` is the matching unit red ("a 200 response carrying an error body is reported unreachable — the old `response.ok` path could not do this"). Mutants M2, M3', M11', M12 remain killed from the previous pass. |
| **LIP-04** | **PASS** | `packages/shared/src/config/__tests__/embedding-dimensions.test.ts:127-165`, `:228-240` | 768 resolved through the merged LM Studio table with a fetch-poisoning stub; both unknown-model arms throw naming model and endpoint. **The previous pass's residual is closed:** M9 (`dist` lmstudio `knownDimensions` 768→1024) is now killed at **runtime** by LIP-08's new sensor, not only inside `packages/shared`. 20/0. |
| **LIP-05** | **PASS** | `scripts/tests/test-setup-ollama-model-exists.sh` (**empty diff over the range**, 16/0); `test-lms-model-exists.sh:165-169`, `:227-235` (57/0) | `ollama_model_exists` byte-identical; `OLLAMA_URL` / `OLLAMA_HAS_CLI` keep their names and the new suite greps the wizard for them — the caller-contract assertion the second AC demands. |
| **LIP-06** | **PASS** | `scripts/tests/test-setup-local-first-api-key.sh:203-220` | LM Studio write asserts `provider: "lmstudio"`, `:1234/v1`, `dimensions: 768`, and that `llm.apiKey` is no longer the hardcoded `"ollama"`. Pre-existing 40-assertion contract round-trips. 40/0. |
| **LIP-07** | **PASS — and now live, closing A1** | `packages/core/src/__tests__/llm-client.test.ts:786`, `:803`, `:810`, `:816` (59/0); **live transcript this session** | `spec.md:502-510` (A1) makes a stubbed-only result a **FAIL**. It is no longer stubbed-only. Against LM Studio with a real instruct model, through the real `config.json` path: **`/api/version` calls = 0**, **no request body carries a `think` key**, and the json-schema path is **enabled, not downgraded** (`json_schema: native support assumed (non-Ollama provider)`, then `json_schema: constrained decoding used`, request body `"response_format":{"type":"json_schema",…}`). `resolveInferenceSpec("http://localhost:1234/v1").id = lmstudio`, `supportsOllamaVersionProbe=false`, `injectsDisableThink=false`. Mutants M5', M6' remain killed. |
| **LIP-08** | **PASS** | **new** `packages/core/src/__tests__/lmstudio-embedding-live.test.ts:60-97` | **G5 closed with a real sensor, not a recorded anecdote.** It embeds *through the alias* — `createEmbeddingProvider({provider:"lmstudio"})` → `embeddingProviders.lmstudio` → `provider:"custom"` → `createOpenAI` — which is exactly what LIP-04's raw `fetch` bypasses. Ran **live**: 2 pass / 0 fail, 9 expect() calls, `[lmstudio] Provider ready (model: text-embedding-nomic-embed-text-v1.5, dimensions: 768)`, vector length 768, and a `vector.some(v => v !== 0)` guard so a zero-filled stub cannot satisfy it. **It discriminates twice over:** M9 → `expected: 1024, got: 768`; M10 → `expected: 1536, got: 768`, both raised by the real `DimensionMismatchError` against the running model. *Vacuity judged, not assumed:* `test.skipIf(!lmStudioReachable)` gates only the live case; the static declaration pin at `:61-72` always runs, so the file is never wholly vacuous on CI. *Isolation judged, not assumed:* `XDG_CONFIG_HOME` is redirected at `:41-42` before the **dynamic** import at `:54` (static imports at `:32-35` are node builtins and `bun:test` only), and the isolation runner classifies the file `process-global state` and forks it — verified by running it under `run-tests-isolated.ts`, 2/0. |
| **LIP-09** | **PASS** | `apps/mcp-client/src/config-cli.ts:210`, `:294`; `apps/opencode-plugin/src/config-cli.ts:214`, `:298`; tests `config-cli.test.ts:88`/`:155` and `:76`/`:121` | **G4 closed.** Both forks now write `config.llm.baseUrl` in **both** the `init --lmstudio` and `use lmstudio` branches, and the vacuous substring assertion is replaced by a **field** assertion. M15 (dropping both writes in one fork) gives **30 pass / 2 fail** with `Expected: "http://localhost:1234/v1"  Received: "http://localhost:11434/v1"` — the exact defect the old `show.out` substring check could not see. Gate run as `cd apps/<pkg> && bun run test`, never bare `bun test`. |
| **LIP-10** | **PASS** | `scripts/diagnose.ts` (+223/−75 over the range); `local-health-checker.ts:86`; `system.test.ts:52-57` 12/0 | **G1 closed. The AC is the whole AC and it was executed, not argued.** `bun run diagnose` **passes** against LM Studio up (exit 0, 768 dims) and **fails informatively** with it down (exit 1, naming `lms daemon up` and listing the candidates actually tried). **No Ollama literal survives that should not:** the 15 remaining `ollama` tokens are the docblock's env-name reference, the ollama half of `DEFAULT_MODEL`, `which ollama`, and the three ollama-branch install/start/pull hints — every one inside a provider-dispatched ternary or the ollama spec itself. `06ddadb1`'s fix is real and observable: the WSL2 last-resort candidate is now `http://100.100.100.100:**1235/v1**` under LM Studio — the provider's own port *and* path — where it used to be `:11434` unconditionally. Compatibility half intact: `services.ollama` survives with `inference` beside it; `/system/ollama` untouched. |
| **LIP-11** | **PASS** | `apps/mcp-client/src/__tests__/config-cli.test.ts:78`, `:140`; `apps/opencode-plugin/src/__tests__/config-cli.test.ts:67`, `:106`; `provider-list-parity.test.ts:99-113` | **G10 closed.** `WRITABLE_PROVIDERS` is now pinned in **both** copies against the derived writable union; dropping `lmstudio` from either one reddens naming that file (M16, M16b). |
| **LIP-12** | **PASS** | `scripts/tests/test-lms-model-exists.sh:260-272` | Six fixture cases; `:270` greps the function body to prove it does **not** read `install-state.json`, which LIP-12 forbids. |
| **LIP-13** | **PASS**, residual | menu: `test-lms-model-exists.sh:409-421` (real pty via `script(1)`, both directions), `:310-320` (token-swap symmetry); invalidation: `embedding-fingerprint.test.ts:157-178` | **G11 substantially closed, and closed more correctly than the gap asked.** Two new reverse-direction cases exist. The fix's own comment (`:148-156`) records why the gap's literal suggestion was wrong: the `lmstudio` alias routes through the OpenAI-compatible path whose **inner** provider field is `"custom"`, so a real LM Studio install never stamps a fingerprint starting `lmstudio:` — the fixture correctly uses `custom:text-embedding-nomic-embed-text-v1.5:768` vs live `ollama`. **Residual:** both new cases exercise `checkSearchAdmission` (the read gate's *detection* layer). No test drives an LM-Studio-flavoured fingerprint through to an actual `EmbeddingIndexStaleError` **throw** (`:298-316` is still generic `ollama:a`/`ollama:b`), and every `activeProvider` in the **write-gate** block (`:203`, `:236`, `:257`, `:276`) is still `provider: "ollama"`. [D, code re-read [V]] |
| **LIP-14** | **PASS** | `test-lms-model-exists.sh:206-208`, `:212-220` | **G15 closed.** The vacuous-skip guard is now an explicit `fail` running in the **main shell**, not inside `$( )`, so `FAIL=$((FAIL+1))` is no longer swallowed and the script's `[ "$FAIL" -eq 0 ]` exit really flips. Four `lms_cli_path` cases ran. [D, pattern re-read [V]] |
| **LIP-15** | **PASS** | read gate `search-controller.ts:194-199`; write gate `project-indexer.ts:490-500`; stamp `etl/pipeline.ts:553` | All four required cases exist; V1/V2/V3 were each killed in the previous pass and the suites are green here (14/0, 1/0). Author-disclosed residual stands: the `needsFullReindex` branch carrying the write gate has zero production callers; the reachable recovery is `index_project --forceReindex` → `EtlPipeline.run()`, which **is** where the stamp lives and **is** sensed. |
| **LIP-16** | **PASS** | `test-lms-model-exists.sh:288-308`, `:424-427`; production reader `scripts/lib/installer-feature-prompts.sh:229-243` | The `die` is a real process exit, asserted by the **absence** of a `REACHED:` marker. `MASSA_AI_INFERENCE_PROVIDER=llamacpp` dies naming the bad value. Unset → keeps current, covered non-interactively and via Enter. |
| **LIP-17** | **PASS** | `CHANGELOG.md:57-63`; unchanged sites `FEATURES.md:1277`, `docs/CHEATSHEET.md:30`, `:447` | **G7 closed and re-derived independently from `spec.md:344-357`'s own 23-surface inventory, not from the CHANGELOG.** 20 of 23 changed. The 3 that did not are `OLLAMA_EMBED_DELAY_MS` (a genuine Ollama-only knob), the `OLLAMA_BASE_URL` install.sh override row, and `run-deterministic.ts`'s gate-exclusion comment — each verified to be per-provider config or gate text, **none of them an exclusivity claim**, so the written reason is now TRUE for all three. `06ddadb1` fixed the three that were diagnose-bound. FEATURES.md TOC: 33 link occurrences, 31 unique, **31/31 resolve** to a matching heading. [D, spot-checked [V]] |
| **LIP-18** | **PASS on its AC; body clause violated on a new surface** | `embedding-defaults-parity.test.ts:92-114` (`referencePairLmStudio`), `:190-235` (`LMSTUDIO_PAIR_SURFACES` ×6, `LMSTUDIO_MODEL_ONLY_SURFACES` ×1), `:272-297` | **G3 closed on the AC, and the author's recorded reds were not accepted — all three were re-induced from scratch and all three now die:** M1a (`.env.example` 768→1024) → the LM Studio pair test names the surface; M10 (`embeddings/config.ts` model+width) → same, **and** the LIP-08 live sensor independently; M13 (`setup-local-first.sh` wizard model) → the LM Studio model-only test. The reference is derived from the seam's own `knownDimensions` literal, and the collect-then-assert shape means one red run names every violator. **But** `spec.md:379` also says *"Keep the exactly-one rule per provider per surface"*, and **T19 created a new violating surface**: `scripts/diagnose.ts:127-130` hand-copies **both** providers' default models into a `DEFAULT_MODEL` table that appears in **no** surface list and is invisible to the completeness scan (the literal is not keyed to a `*_EMBEDDING_MODEL` token). **M14b survives** — see below. |
| **LIP-19** | **PASS** | `config-sections.ts:46`, `:120-123`; `apps/tools-api/src/routes/config-section-coverage.test.ts` | `bun run type-check` 6/6, 0 cached — the mapped type over `keyof MassaAiConfig` is the real gate and it is exercised. `apps/web-ui` 784/0. `config-section-coverage.test.ts` 4/0 (**+22 lines** over the range). |
| **LIP-19b** | **FAIL** (narrow clause; end state correct) | `embedding-defaults-parity.test.ts:43-60` | Unchanged from the last pass. The extractor is re-anchored and green, but the AC says **"in the same commit"** and the union was deleted in `7987443d` (T03) while the extractor was re-anchored in `018e1529` (T15) — four phases apart. **G12 was not closed.** T24 names G12 in its heading and restates the directive verbatim in its body, but `git show 4354f2ba -- spec.md` touches **only** the LIP-22 section; the G12 bullet in `tasks.md:1184-1187` is unchanged context with no `+`/`−` lines; `grep -rn "accepted deviation" .specs/` finds nothing near LIP-19b; and T24's commit message names G14, G16, G13, G15 and **never mentions G12**. Neither branch of its own directive was executed. [D, spot-checked [V]] |
| **LIP-20** | **PASS** | `turbo.json:44`; `.env.example:229`; `scripts/__tests__/turbo-passthrough-env.test.ts:101+` | **G8 closed.** `MASSA_AI_INFERENCE_PROVIDER` is present in both files and pinned by name, and the sentinel **discriminates**: M17 (removing it from `turbo.json`) → `4 pass` becomes `3 pass / 1 fail` on "bash-only `MASSA_AI_*` knobs the derived scan cannot see are pinned by name (LIP-20)". **The stated reason for not widening the scan was re-measured, because if the number is wrong the design decision is wrong.** It is right where it is load-bearing: `scripts/` holds exactly **58** tracked `*.sh` files, and under "a name mentioned in a file that does not assign it there, unioned over files" they read **30** distinct `MASSA_AI_*` names of which **25 are absent** from `passThroughEnv` (`MASSA_AI_PG_ROLE`, `MASSA_AI_PLUGIN_SOURCE`, the six `MASSA_AI_INSTALLER_TEST_*` barriers, …). So a shell-wide scan really would redden on 25 pre-existing names while proving nothing, since turbo never dispatches the shell suites. **Citation defect, not a design defect:** the comment says "27 distinct"; the same definition that yields its correct 25 yields **30**. |
| **LIP-21** | **PASS** | `CHANGELOG.md` `## [Unreleased]` → `### Added` / `### Changed`; +32 lines in Phase 8 | Valid headings per `CONTRIBUTING.md`; no released section hand-edited. `check_specs_delivered.ts` → `0 error(s)`, exit 0. |
| **LIP-22** | **FAIL** | amended AC at `spec.md:445-460`; named sensor `packages/core/src/__tests__/e2e/14.needles.test.ts` | **The amendment is correct about `bench:needles` and wrong to stop there.** Its reasoning verifies: `benchmarks/needles/run.ts` contains **zero** references to `postgres-vector-store`/`VectorStore` and implements its own `cosine()` at `:156`, so neither the `>2000` binary-quantization path nor the ≤2000 plain-HNSW path runs on either arm. But the replacement AC is **unmet on three counts, measured**: (a) **no run of `14.needles.test.ts` at any width is recorded anywhere** — `grep -n '14.needles' .specs/features/local-inference-provider-abstraction/*.md CHANGELOG.md` returns only four *mentions of the plan*, no figures; (b) that file is **byte-unchanged over `d523f06f..HEAD`** (`git diff --stat` → empty); (c) as written it is gated `RUN_E2E + API up + **Ollama** up` (`:63`) with no LM Studio or 768 arm, so it **cannot observe the subject either** without work nobody did. The amendment's own sentence — *"a promise to measure later is not an AC"* — is the standard it fails. The `bench:needles` figures (2560: hit@1 0.5000, MRR 0.6423; 768: hit@1 0.2857, MRR 0.4650, n=14, one shared population) remain valid as a **chunk-embedding-quality** comparison and are kept as one. |
| **LIP-23** | **PASS — and now live, closing A1** | `packages/core/src/__tests__/llm-client.test.ts:832`, `:839` via `lastProviderEntrypoint` (`:32`, `:51-66`); matrix row `tasks.md:1327` | The AC demands the sensor record **which entrypoint `buildProvider` invoked**. It does, both directions, and M4' killed it in the previous pass. **The live half is now real:** against LM Studio, `/v1/responses` calls **0**, `/v1/chat/completions` calls **1**, and `llmObject` returned `{"ok":true,"value":{"capital":"Paris"}}` — a parsed object, which is the second sentence of the AC. **G13's technical finding was true and its framing was false, and T24's partial rejection is correct:** `llm-client-json-schema.test.ts` genuinely cannot sense the entrypoint (its `@ai-sdk/openai` mock has no `.chat` member), but it was never cited as LIP-23's sensor — at `e04e12d0` and `ee34213e` the matrix row read only "entrypoint-recording sensor + live parsed-object run", and the file's only appearance was in **T06's write set** (`tasks.md:186`). Vague, not misattributed. The row now names the file and lines. [D verified at three revisions] |
| **LIP-24** | **PASS** | `embedding-defaults-parity.test.ts:299-376` (accounting) → `packages/core/src/__tests__/health-checker-config.test.ts:51` | The accounting takes the **enumerate-and-show-covered** branch, not an allowlist silencing: one file (`local-health-checker.ts`) left the token-visible population and its named substitute is a behavioural sensor driving the runtime read through the seam. **G2 closed, and closed honestly:** that substitute file is now **3 pass / 0 fail** (it was 1/2 at the previous HEAD). The repair extends `mock.module` to the second specifier — `@massa-ai/shared/config`, which the export map resolves to `dist/config/index.js`, a genuinely different file from `@massa-ai/shared` → `dist/index.js` — and the diff hunks touch only the mock-setup block; **every `expect(...)` value is byte-identical to `d523f06f`**, so this is a repair and not a test rewritten to assert the defect. Completeness population independently measured at **32** at HEAD. **Residual:** the docblock's recorded population (`:309-310`, "25 → 27 → 26") is stale against that 32. [D for the diff, [V] for the runs] |

---

## Discrimination sensor — mutation results

**10 mutations. 9 killed, 1 survived.** All four of the previous pass's survivors were
re-induced from scratch rather than read from the author's record; all four now die.

### Killed

| # | Requirement | Mutation | Killed by |
|---|---|---|---|
| **M1a** | LIP-18 | `.env.example:221` `#LMSTUDIO_EMBEDDING_DIMENSIONS` 768 → **1024** (contradicting the 768 model two lines above) | parity **8/1** — "every LM Studio pair surface carries the reference pair text-embedding-nomic-embed-text-v1.5/768". **Previously survived.** |
| **M10** | LIP-18 / LIP-08 | `embeddings/config.ts:411` model → `"bogus-lmstudio-model"` **and** `:430` width fallback 768 → **1536** | parity **8/1**, **and** `lmstudio-embedding-live` **0 pass / 2 fail** with a live `DimensionMismatchError: configured dimensions 1536 but the model returned 768`. **Previously survived a 116-test core filter.** |
| **M13** | LIP-18 | `setup-local-first.sh:333` wizard LM Studio default model → `"bogus-wizard-model"` | parity **8/1** — "LM Studio model-only surfaces carry the reference model". **Previously survived.** |
| **M9** | LIP-04 / LIP-08 | **`dist`** `inference-providers.js:57` lmstudio `knownDimensions` 768 → **1024** (applied to the *resolved* artifact; sha256-verified, since `dist/` is gitignored) | `lmstudio-embedding-live` **0/2**, `expected: 1024, got: 768`. **Previously survived** — no runtime consumer could sense the width. |
| **M14** | LIP-18 | `diagnose.ts:129` `DEFAULT_MODEL.lmstudio` → `"bogus-diagnose-model"` | `diagnose.test.ts` **32/1** — but by its own hardcoded literal, **not** by any parity gate (see M14b). |
| **M15** | LIP-09 | `apps/mcp-client/src/config-cli.ts` — both `config.llm.baseUrl =` writes deleted (`init --lmstudio` and `use lmstudio`) | `cd apps/mcp-client && bun run test` → **30 pass / 2 fail**, `Expected: "http://localhost:1234/v1"  Received: "http://localhost:11434/v1"` on both branches. The old substring assertion could not have seen this. |
| **M16** | LIP-11 / LIP-01 | `apps/opencode-plugin/src/config-cli.ts:43` — `lmstudio` dropped from `WRITABLE_PROVIDERS` | `provider-list-parity` **8/1**, naming that file. |
| **M16b** | LIP-11 / LIP-01 | same drop in the `apps/mcp-client` copy | `provider-list-parity` **8/1**, naming that file. Both copies are pinned, not just one. |
| **M17** | LIP-20 | `turbo.json:44` — `MASSA_AI_INFERENCE_PROVIDER` removed from `tasks.test.passThroughEnv` | `turbo-passthrough-env` **3/1** on the LIP-20 sentinel. |

### Survived (this becomes the top fix task)

| # | Requirement | Mutation | Every gate stayed green |
|---|---|---|---|
| **M14b** | **LIP-18** (body clause) | `scripts/diagnose.ts:129` **and** `scripts/__tests__/diagnose.test.ts:176` drift **together** to `"drifted-model-v9"` — the way real drift happens, when someone edits a file and its own test | `diagnose` 33/0, `embedding-defaults-parity` **9/0**, `probe-dialect-parity` 14/0, `provider-list-parity` 9/0, `turbo-passthrough-env` 4/0. |

**Why M14b matters and is not pedantry.** `scripts/diagnose.ts:127-130` is a fourth
hand-written copy of the default embedding model for **both** providers. It is in no entry
of `PAIR_SURFACES`, `MODEL_ONLY_SURFACES`, `DIMS_ONLY_SURFACES`, `LMSTUDIO_PAIR_SURFACES` or
`LMSTUDIO_MODEL_ONLY_SURFACES`, and the Tier-3 completeness scan cannot reach it: the file
*is* in the scan's population of 32 (its docblock names `OLLAMA_EMBEDDING_MODEL` and
`LMSTUDIO_EMBEDDING_MODEL`), but the literals live in a `DEFAULT_MODEL` object keyed on the
provider id, not on a `*_EMBEDDING_MODEL` token, so the `TOKEN[=:]value` offender test never
fires. The only thing pinning them is `diagnose.test.ts`'s own hardcoded copy of the same
two strings — which is an agreement between two files, not an anchor to the canonical table.
The user-visible consequence of drift is `bun run diagnose` reporting
`Model '<canonical model>' not found` on a correct install, on the feature's own happy path,
with every gate green. This is **verbatim the EDC-06 defect that
`embedding-defaults-parity.test.ts:5-8` exists to prevent**, one surface further out — and
it was introduced by the very task that closed G1.

---

## Ranked gap list (what remains)

| # | Sev | Gap | Requirement | Fix |
|---|---|---|---|---|
| **H1** | **HIGH** | `scripts/diagnose.ts:127-130` `DEFAULT_MODEL` is an unguarded fourth copy of **both** providers' default embedding models, in no parity surface table and invisible to the completeness scan. **M14b survives every gate.** | **LIP-18** body clause ("exactly one rule per provider per surface"), introduced by T19 | Add `scripts/diagnose.ts` to `MODEL_ONLY_SURFACES` (anchor `ollama:\s*"([^"]+)"` inside `DEFAULT_MODEL`) and to `LMSTUDIO_MODEL_ONLY_SURFACES` (`lmstudio:\s*"([^"]+)"`), then re-induce **M14b** and observe the red. Or delete the table and derive both from the seam. |
| **H2** | **HIGH** | **LIP-22's amended AC is unmet.** `14.needles.test.ts` has no recorded run at any width, is byte-unchanged over the range, and is gated on Ollama with no 768/LM Studio arm — so the amendment swapped one mechanism that cannot observe the subject for another that also cannot, and then measured neither. | **LIP-22** | Either run it at both widths and transcribe the figures here, which requires giving it an LM Studio/768 arm first; **or** amend the AC again to name what was actually measured and mark the binary-quantization delta explicitly UNMEASURED with the reason. Do not leave a third un-executed mechanism in its place. |
| **M1** | **MED** | **G12 was never closed.** LIP-19b's "in the same commit" clause has neither an accepted-deviation record nor an amendment, while T24's heading and the close-out narrate G12–G16 as handled together. | **LIP-19b** | One paragraph. Either amend the clause with its reason, or record the deviation as `Resolved (verifier, 2026-09-20)` naming *why* the four-phase gap was harmless (the extractor never went vacuous in the window). No code change. |
| **M2** | **MED** | LIP-13's reverse direction is proven at the read gate's **detection** layer only. No test drives an LM-Studio-flavoured stored fingerprint through to an actual `EmbeddingIndexStaleError` **throw**, and every `activeProvider` in the write-gate block is still `provider: "ollama"`. | LIP-13 residual | One `custom:…:768` fixture in the `SearchController.searchProject` throw test and one in the `ensureFreshIndex` write-gate block. |
| **L1** | **LOW** | LIP-20's rationale comment says the bash corpus reads **27** distinct `MASSA_AI_*` names; the same definition that reproduces its correct **25 absent** yields **30**. The design decision is sound; the population figure is 3 low. | LIP-20 bookkeeping | Correct the number in `turbo-passthrough-env.test.ts:20-22`. |
| **L2** | **LOW** | LIP-24's docblock still records the completeness population as "25 → 27 → 26"; measured **32** at HEAD after the Tier-3 re-key. A stale figure in the comment that explains the mechanism. | LIP-24 bookkeeping | Update the three numbers. |
| **L3** | **LOW** | LIP-22's amendment (`spec.md:445`) records the phase and the gap id but **no author and no date**, unlike the `Resolved (reviewer, date)` shape the rest of these artifacts use. | LIP-22 bookkeeping | Add the attribution. |
| **L4** | **LOW** | `init --lmstudio`'s `knownDimensions[model] ?? 768` (`config-cli.ts:207` / `:211`) is an **unreachable** fallback — the model is a literal that is always in the table — so it is not a bounded degradation at all, but nothing records that. The `use` branches and `embeddings/config.ts` both carry explicit `ponytail: G6` comments naming their condition; this one carries none and needs a different sentence, not the same one. | LIP-04 / G6 residual | One line, or delete the `?? 768`. |
| **L5** | **LOW** | No completeness sensor would notice a **future TypeScript** probe site regressing to `response.ok`: `probe-dialect-parity`'s scan covers four shell files by construction. The five current sites are all correct and all sensed; this is about the next one. | LIP-03 hygiene | Add a TS arm to the dialect scan, or accept and record. |

**G6 is closed on both dialects** and is not listed above: `embeddings/config.ts:420-425`
and both CLI `use` branches carry explicit comments naming the condition and the upgrade
path, `refuseOnDimensionMismatch` really exists and really fires (M9/M10 proved it live),
and the bash `2560` arm was already documented as a bounded degradation with its condition
named at `scripts/lib/installer-api-key.sh:136-148`. Only the narrow L4 sub-case remains.

---

## Pre-existing failures (explicitly NOT this feature's)

- `bun run test:scripts` exits 1 on `scripts/tests/test-install-skills-cli.sh`
  (`no tools exits 2` → got `1`; `reason is reported`). `scripts/install-skills.sh` **and**
  `scripts/tests/test-install-skills-cli.sh` both have an **empty diff** over
  `d523f06f..HEAD`. Measured identically on `d523f06f` in the previous pass. Nothing else in
  `test:scripts` fails; the TypeScript half is 2050/0 across 89 files.
- `tasks.md` has never passed `validate_tasks.ts` ("no tasks parsed") because it writes
  `### T19 — ` against `/^#{2,4}\s+T\d+\s*:/m`. Pre-existing since Phase 1.

## Skipped checks, with reasons

- **`packages/core/src/__tests__/e2e/14.needles.test.ts` was not run.** It is `RUN_E2E`-gated,
  needs a real pgvector index built per width, and re-indexing at 768 would destroy the shared
  development index in this worktree. A verification gate does not get to mutate the subject's
  environment to manufacture the measurement the subject owes. This is **why LIP-22 is FAIL**,
  not a substitute for it: the requirement is that the figure be *recorded*, and it is not.
- **`bun run bench:needles` was not re-run** (slow, and it mutates the index). Its figures were
  checked for internal consistency in the previous pass and nothing in Phase 8 touched them.
- **The full `bun run test` turbo aggregate was not run.** Turbo cancels siblings on a failure
  and would have hidden reds; targeted per-package gates were used instead, and every package
  the feature touches was run to completion.
- **Docker/Swagger smoke and the 90 % coverage floor** were out of scope for this gate.
- **A `d523f06f` re-baseline of `health-checker-config.test.ts`** was not re-measured; the
  previous pass measured 3/0 there and the file is 3/0 here, so the regression is closed at
  both ends by the numbers already in hand.

## Restore verification

`git status --porcelain` in the worktree was **empty before the first mutation and is empty
after the last**, checked between every mutation. Eleven files were backed up to
`/tmp/lip-p8-backup` **before** any mutation and restored **from those copies**:
`.env.example`, `packages/core/src/services/embeddings/config.ts`,
`scripts/setup-local-first.sh`, `scripts/diagnose.ts`,
`scripts/__tests__/diagnose.test.ts`,
`packages/shared/src/config/inference-providers.ts`,
`packages/shared/dist/config/inference-providers.js`,
`apps/mcp-client/src/config-cli.ts`, `apps/opencode-plugin/src/config-cli.ts`,
`turbo.json`, `packages/core/src/__tests__/lmstudio-embedding-live.test.ts`.

A `diff` of the post-restore sha256 manifest against the pre-mutation manifest is **empty**
for all ten manifest entries, and `scripts/__tests__/diagnose.test.ts` matches its backup at
`affeb49bf7ffdd735f6e89424c623c89de33d13fab1cd4ff16e2072cb187a74f`. The `dist/` artifact —
which `git status` is structurally blind to, being gitignored — is back at
`4c8474f1b80b8685bff20c22fd0ec9c991284ca8feed13a8365a7defeb828ac9`, its recorded
pre-mutation value.

**No `git checkout`, `git restore` or `git stash` was used at any point.** The only file this
verification wrote inside the repository is this one.

## Exact next step

Land **H1** first — it is one entry in each of two existing arrays plus a re-induced M14b, and
it closes the only surviving mutant in the feature. Then decide **H2** deliberately: LIP-22 is
now the only requirement whose AC names a mechanism nobody has executed, and amending it a
second time without measuring anything would be the third iteration of the same move. **M1** is
a paragraph. `FEATURES.json` `status` must stay `in_progress` until H1 and H2 are resolved.
