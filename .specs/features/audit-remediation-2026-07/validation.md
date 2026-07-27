# Audit Remediation 2026-07 — PR1 Validation

**Scope**: PR1 only — SEC-01..06 and BUG-01..06 (12 of the feature's 17 requirements).
DEBT-01..05 are PR2 and are out of scope here.
**Branch**: `fix/audit-remediation-security-and-bugs` @ `9233946`, 17 commits ahead of
`origin/main` @ `3a25cc6`.
**Verifier**: `massa-ai-verification-agent`, dispatched read-only. **Author ≠ verifier** — the
verifier did not write any of this code and was instructed to treat the commit messages as
claims, not evidence.

---

## Verdict

**APPROVED WITH FINDINGS.**

No defect was found in any of the 12 requirements. Both of the judgement calls this PR rests on
— the T10/BUG-02 decision to *not* alias-resolve, and the T14/BUG-06 admitted residual — were
re-derived independently from source by the verifier and hold. Every gate that can run on this
machine is green. One item is genuinely unresolved and is disclosed rather than papered over:
SEC-06's Docker bridge-address measurement (see Residual Risk).

---

## Requirement coverage

| ID | Verdict | Evidence |
| --- | --- | --- |
| SEC-01 | PASS | `auth.ts:132` replaces the `if (!apiKey) return;` bypass with a real comparison; `initAuth()` is called only from `index.ts:149`, never at import. `packages/shared/src/config/api-key.ts` implements env > config.json > `provisionApiKey()` with an `fs.openSync(lockPath,"wx")` exclusive-create election and a typed `ApiKeyProvisioningError`. Booted-server test `auth-http.test.ts` (real TCP, executor routes mounted) green. `startup-config.test.ts:30` proves a provisioning failure exits non-zero **before** `listen`. |
| SEC-02 | PASS | `startup-config.ts:33` `buildCorsOptions` — empty ⇒ `{origin:false,credentials:false}`; `*` with credentials throws at startup. `cors-http.test.ts` against a booted server: foreign Origin gets no `Access-Control-Allow-Origin`, allow-listed Origin echoed exactly, near-miss origins rejected. |
| SEC-03 | PASS | `ExecResult.sandboxMode` (`executor.ts:62`) set on all `#spawn` branches **plus** the two refusal paths `tsc` surfaced during Execute. Three-place rule checked: controller copies it into every `data:{…}` including each `batchExecute` item, and both the REST route and `embedded-api-client.ts:483-489` are unmodified passthroughs. `executor-sandbox-passthrough.test.ts` asserts the field survives the embedded client — the one hand-written mirror. |
| SEC-04 | PASS | `admin-preservation.ts`, its wiring and **both** its test files removed (the second lived in a different directory than tasks.md named). `rg 'getUserCount\|adminPreservation'` returns only explanatory comments. The six former `ADMIN_ENDPOINTS` are covered by a parameterised 401 test. |
| SEC-05 | PASS | `isPublicPath` uses exact-or-child matching, so `/uixyz` and `/ui-admin` are **not** exempt (table-driven test). `web-ui-trust.ts` accepts all three loopback spellings (`::1`, `::ffff:127.0.0.1`, `127.0.0.0/8`). `web-ui.ts` returns a `Buffer`, sidestepping the documented bare-string content-type trap. |
| SEC-06 | PASS, one clause qualified | `scripts/lib/installer-api-key.sh` fixes the key-destroying `setup-local-first.sh` re-run; the compose `mcp` service gains the shared volume and both images set `XDG_CONFIG_HOME=/data`. T23's hook resolves the key from `config.json` directly; the Codex/Cursor copies are byte-identical. **The Docker bridge address itself is instrumented but unmeasured** — see Residual Risk. |
| BUG-01 | PASS | Both `!this.provider` branches throw unconditionally; the `NODE_ENV` check and `getDimensions()`'s 384 fallback are gone. `rg 'Math.random' packages/core/src/services/embeddings/` — no match. The three tests that pinned the defect are **rewritten to assert the throw**, not deleted. |
| BUG-02 | PASS | `rlm-synapse.ts:213` `if (projectId && row.project_id !== projectId) continue;`. Two-sided PG integration test against the dedicated DB: 3/3, including "filter removes every neighbor ⇒ empty stream, not a throw" and "no projectId ⇒ filter inert". See Adjudicated findings below. |
| BUG-03 | PASS | `pipeline.ts:347-354` tears the managed-run heartbeat down before the retry re-enters. Fake-timer tests assert no heartbeat after the outer run settles, and zero leaked loops after all 3 retries. |
| BUG-04 | PASS | `buildSymbolIndex` additionally returns `fqns: Set<string>`; `resolveEdgeTarget` checks `knownFqns.has(nsFqn)` before the project-wide index. Three tests: namespace-import beats a colliding global, global fallback still resolves, best-effort tail preserved. |
| BUG-05 | PASS | **Both** call sites fixed — `rlm-indexing.ts:179` and `:389` (`ensureFreshIndexImpl`, the path auto-reindex actually takes, which the original task text did not name). |
| BUG-06 | PASS, residual bounded | Mirror keyed on `resolveCached(obs.projectId)` when a live cache entry exists. `resolveCached()` confirmed genuinely cache-only — never queries, never writes. Both halves tested against the dedicated DB: 26/26. |

12/12 PR1 requirements PASS.

---

## Gate results

Every command below was re-run by the verifier; the author's reported numbers were not taken on
faith.

| Command | Result |
| --- | --- |
| `bun run type-check` | 6 successful, 6 total |
| `bun run build` | 5 successful, 5 total |
| `bun run test:scripts` | exit 0 — 574 pass / 0 fail, plus all `scripts/tests/*.sh` suites |
| `bun scripts/generate-subagent-artifacts.ts --check` | `No drift: generated files match checked-in files.` |
| `bun scripts/generate-skill-artifacts.ts --check` | `No drift: generated skill bundles match checked-in files.` |
| `diff` hook binary vs codex/cursor generated copies | byte-identical both ways |
| `MASSA_AI_DOCKER_PROBE=1 bash scripts/tests/test-docker-remote-address.sh` | `5 passed, 1 failed`, exit 1 — **fails rather than skips** with no runtime, as designed |
| same script, no flag | `5 passed, 0 failed`, prints `# NOT RUN`, exit 0 |
| `git log 3a25cc6..HEAD --format=%B \| grep -c 'skip ci'` | `0` |
| `apps/tools-api` isolated runner | PASS all 25 groups |
| `apps/mcp-client` isolated runner | 1 group failed under parallel load at 5001–5003 ms / 30002 ms; **95/95 pass standalone** — the flake CLAUDE.md documents |
| `packages/shared` | 204 pass / 0 fail (`api-key` + `config-loader-fs`: 21/21, no real `~/.config` pollution) |
| `packages/core` targeted 9-group filter | PASS all 9 groups |
| same, with `MASSA_AI_DEDICATED=1` against `:5433` | `graph-stream-project-scope-pg` 3/3; `observation-repository-pg-coverage` 26/26 |
| `apps/web-ui` | 113 pass / 0 fail |
| `bun run test:plugins` | 94 pass / 0 fail, incl. the real capture-server hook test |

Author-side full-suite run, per package standalone: `packages/core` **PASS all 133 groups**
(132 baseline + the new BUG-02 PG group) — the first fully green core run of this effort.

`bun run test` as a single **parallel** turbo invocation still does not go green on this
machine. Every failure observed in those runs was a **timeout** (5000–30000 ms), never an
assertion, and the implicated packages pass standalone. This matches the documented contention
behaviour and is not a PR1 regression.

---

## Adjudicated findings

**No defects.** Two judgement calls were re-derived independently rather than accepted:

1. **T10 / BUG-02 — the decision *not* to alias-resolve is correct.** The verifier traced the
   read path itself: `postgres-vector-store.ts:545` and `memory-repository-pg.ts:226,289` both
   filter on the caller-supplied id verbatim, and neither imports the resolver;
   `grep -rln getProjectIdentityAliasResolver packages/core/src` shows it only at write seams,
   never in `rlm-search.ts` / `rlm-synapse.ts` / `contextual-search-rlm.ts`. Because
   `memories.project_id` is written canonically while every read filters on the raw id, a
   retired alias already returns zero rows from the streams that seed the BFS, so
   `seedIds.size === 0` returns above the loop before the new filter is reached. The strict
   `!==` the design originally prescribed would have been the more dangerous choice.
2. **T14 / BUG-06 — the residual is bounded and disclosed, not a hidden hole.** `resolveCached()`
   reads only `this.cache`, gated on `expiresAt > now()`. The window is exactly "an id this
   process has never resolved, read in the same tick as its insert" — not a general race — and
   the cold-cache test proves the miss rather than hiding it.

**Verifier finding not applied (adjudicated by the author).** The verifier flagged
`.specs/project/FEATURES.json` → `"execute": false` as stale against STATE.md's "phases 0-4
complete". It is **not** stale. That flag is feature-level, and this feature spans two PRs:
Phase 6 (DEBT-01..05, PR2) has not started. STATE.md's phase list is PR1-scoped. Flipping the
flag would assert that PR2's work is done. Left as `false` deliberately; it becomes `true` at
TASK-022.

---

## Residual risk / not evidenced

- **SEC-06's Docker clause rests on the instrument, not an observation.** This machine has no
  container runtime (`docker`, `podman`, `colima`, `lima` all absent). The probe is wired into
  CI's `mcp` job behind `MASSA_AI_DOCKER_PROBE=1`, and the fail-not-skip semantics were verified
  in **both** directions, so a measurement that did not happen can never read as one that
  passed. Until an observed `ctx.request.ip` from that job log is pasted verbatim into
  `design.md` → "TASK-007 — the Docker path", the premise the entire
  `MASSA_AI_WEB_UI_TRUST_LOCAL` mitigation is built on — that a host browser through the
  bridge-mapped port presents a non-loopback address — is a plausible mechanism, not a fact.
  **SEC-06 must not be marked fully evidenced before then.**
- **CI itself was not observed.** The PG suites were run locally against the dedicated `:5433`
  database and the Docker probe's static and failure paths were run locally; the live bridge
  measurement was not.
- **PR1 proves nothing about PR2.** No DEBT-scope file (`bunfig.toml` coverage, `.oxlintrc.json`,
  the `turbo.json` lint task, any `RLM_` occurrence) was touched — confirmed.
- **Known pre-existing flake, not a regression:** `apps/mcp-client`
  `embedded-api-client-endpoints.test.ts` under parallel load. Passes 95/95 standalone.

---

## Test delta

`git diff 3a25cc6..HEAD --stat -- '*test*'` → **28 files, +3489 / −206**.

| Package | Delta |
| --- | --- |
| `packages/shared` | New `api-key.test.ts` (373), `config-loader-fs.test.ts` (164), `isolated-config.ts` helper (111); `config-loader.test.ts` +81/−0. 204 pass / 0 fail. |
| `apps/tools-api` | New `auth-http.test.ts` (231), `cors-http.test.ts` (127), `startup-config.test.ts` (142), `web-ui-key-http.test.ts` (163), `web-ui-trust.test.ts` (150); `auth.test.ts` +103/−10 (the two bypass assertions **inverted, not deleted**). All 25 groups pass. |
| `apps/mcp-client` | New `api-key-config-seeded.test.ts` (182), `executor-sandbox-passthrough.test.ts` (64). No removals. |
| `apps/web-ui` | New `api-key-header.test.ts` (128). 113 pass / 0 fail. |
| `apps/claude-plugin` | New `hook-api-key.test.ts` (213) — real capture server asserting endpoint **and** body, closing candidate lesson L-002. |
| `packages/core` | New `graph-stream-project-scope-pg.test.ts` (144), `executor-sandbox-mode.test.ts` (165), `embedding-failure-propagation.test.ts` (48). Expanded: `embedding-service.test.ts` +41/−17, `etl-pipeline-lease.test.ts` +136, `etl-stages-coverage.test.ts` +112, `rlm-indexing.test.ts` +90/−6, `rlm-synapse.test.ts` +65, `observation-repository-pg-coverage.test.ts` +61/−2, `contextual-search-rlm-coverage.test.ts` +14. **No removals.** |
| `scripts/tests` | New `test-docker-remote-address.sh` (171), `test-setup-local-first-api-key.sh` (206). |

**Removals — 2, both justified.** `admin-preservation.test.ts` (66) and
`middleware/admin-preservation.test.ts` (109), deleted with the module they tested under
SEC-04 and replaced by a parameterised 401 test covering the same six endpoints. No assertion
was loosened, no test skipped to go green, and no `.only` / `.skip` marker was introduced —
checked by reading every diffed test file, not by grep alone.

---

## Out-of-band change in PR1

`48d0f39` (test-only, approved by the user before it landed).
`contextual-search-rlm-coverage.test.ts` was failing **at HEAD** — 11 pass / 3 fail — verified
by stashing all PR1 work and reproducing it. `ensureInitializedImpl` falls back to the real
factory for any dependency the subject did not inject, and the file mocked four sibling
factories but not `vector-store-factory.js`, so the three `makeRlm({})` `warmupCache` tests
built a real `PostgresVectorStore` and ran live embedding-provider auto-selection — measured at
**13.4 s cold** against `bunfig.toml`'s 5 s budget. The missing mock was added. 14 tests before,
14 after; group runtime dropped from >15 s to 144 ms. This also reconciles the handoff's green
baseline with the observed red: the cost is provider latency, so the same tests pass on a warm
model cache and fail on a cold one.
