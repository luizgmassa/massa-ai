# Cross-Pollination Ports & Gap Closure Validation

**Date**: 2026-08-03
**Spec**: `.specs/features/cross-pollination-ports/spec.md`
**Diff range**: `94e6b05..64bb6b8` (22 commits, `feature/cross-pollination-ports`)
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real worktree; all mutations below ran in scratch state and were reverted, content-verified (`git status --porcelain` empty + `git diff` empty after each)

---

## Task Completion

| Task | Status | Notes |
|---|---|---|
| T1–T19 | ✅ Done | All 19 implementation tasks committed, one commit each, per Execution Record in `tasks.md` |
| T20 | ✅ this report | Independent validation (this document) |
| T21 | ⏳ not yet run | Close-out (STATE/HANDOFF/FEATURES.json update, PR open) — **AD-013 numbering gap found, see Ranked Gaps** |

---

## Spec-Anchored Acceptance Criteria

### P1: XP-04 — the blocking gate stops being blind

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC-1: `ci.yml` test job sets `RUN_POSTGRES_TESTS=1` + dedicated `DATABASE_URL`; gated suites execute | env triple present; previously-skipped suites measurably drop skip count | `.github/workflows/ci.yml:29-30` (`DATABASE_URL: …127.0.0.1:5433/massa_ai_test`, `MASSA_AI_DEDICATED: "1"`), `:262` (`RUN_POSTGRES_TESTS: "1"`). Re-derived directly (not trusting the claim): re-ran `graph-store-pg-coverage.test.ts` through `turbo run test` twice — **without** the triple: all 18 cases `(skip)`; **with** the triple: all 18 `(pass)`, 0 fail. Full `bun run test` under the triple: 11/11 tasks, 151 core test groups, 0 fail (forced, `--force`, 0 cached — `"cache": false` on the `test` task in `turbo.json:28` rules out a stale-cache false pass). | ✅ PASS |
| AC-2: `check-workflow-venue-parity.ts` fails naming the divergence unless declared | exit 1 naming workflow+key, or PASS if all declared | `scripts/check-workflow-venue-parity.ts` (whole file); live-tree re-run: `PASS`, 2 test-running workflows (ci.yml/coverage.yml), 1 declared exception (`__invocation__`, permanent), 0 unexcepted divergences. | ✅ PASS |
| AC-3: injected divergence → non-zero exit naming file+key, then reverted | observed red | Sensor mutation 4 below: skipped the exception-list `continue` in `check-workflow-venue-parity.ts` → test suite failed 3/21, naming `ci.yml vs coverage.yml on __invocation__`. Reverted, content-verified. | ✅ PASS |
| AC-4: `release.yml` untouched after the change | zero diff, no rename, no required-check semantics removed | `git diff --stat 94e6b05..HEAD -- .github/workflows/release.yml` → empty. | ✅ PASS |

### P1: XP-02 — Passive Capture stops persisting raw secrets

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC-1: each v1 credential shape (PEM/JWT/AWS/sk-/GitHub/bearer) redacted in the persisted row; raw bytes absent | row's `payloadJson` contains `[REDACTED:<id>]` AND does not contain the secret (payload/conjunction rule) | `packages/core/src/__tests__/hook-service.test.ts:265-276` — for all 7 rule ids: `expect(obs.payloadJson).toContain('[REDACTED:${id}]')` **and** `expect(obs.payloadJson).not.toContain(secret)`. Values-based, not call-was-made. Also `compact-snapshot-attribution.test.ts:139-140` for the independent `compact_snapshot` writer (legacy-row scenario: secret visible in the human-readable snapshot XML but absent from the tool's own persisted `payloadJson`). | ✅ PASS |
| AC-2: near-miss content passes through byte-identical | `sanitized === input` exactly, 0-map | `packages/core/src/__tests__/credential-scrub.test.ts` — one near-miss test per rule (e.g. `:71` aws-key short id, `:87` `skColor`, `:104` short GitHub tokens, `:120` short slack token, `:136` lowercase "bearer" in prose), each asserting `result.sanitized === input` and the specific rule's count `0`. `hook-service.test.ts:278-285` — clean payload persists byte-identical end-to-end. | ✅ PASS |
| AC-3: bare-string `payloadJson` into `insert()` is a compile-time rejection | `InsertableObservation.payloadJson: SanitizedPayloadJson` rejects `string` | `packages/core/src/data/memory/observation-contract.ts:18` (branded type); enforced via a real `ts.createProgram` compile-fixture gate (`packages/core/tsconfig.json:25` excludes `src/__tests__` from `tsc`, so an in-tree `@ts-expect-error` would prove nothing — documented, correctly worked around). `scripts/__tests__/xp02-branded-type.test.ts:72-86` — `violating.ts` (bare string) produces ≥1 diagnostic mentioning `SanitizedPayloadJson`/`not assignable`; `:88-95` — `conforming.ts` (scrubbed value) produces 0 diagnostics. Re-run directly: 3/3 pass. | ✅ PASS |
| AC-4: batch endpoint applies the same boundary | `/api/v1/hook/batch` events scrubbed identically to single-event ingest | `packages/core/src/services/hooks/hook-service.ts:210-227` — `ingestBatch` calls the same private `ingestOneNormalized` (`:229`) that contains the `scrubCredentials` call (`:246`) as `ingestOne`; one seam, both entry points. No separate test needed — same code path, structurally verified by reading. | ✅ PASS |
| AC-5: wire shape of `POST /api/v1/hook` unchanged | same accept/reject behavior | `apps/tools-api/src/routes/hooks.test.ts` — 12/12 pass standalone (re-run in isolation; the file legitimately fails 1/2 when run in the SAME process as a second `mock.module` file per CLAUDE.md's documented process-wide-mock constraint — not a regression, confirmed by running it alone). `apps/tools-api/src/__tests__/hook-compact-snapshot-route.test.ts` unmodified in the diff (`git diff --stat` empty for both route test files). | ✅ PASS |

### P1: XP-03 — new dangerous call sites cannot land unreviewed

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC-1: clean-tree run exits 0, prints population | exit 0 + population header, never silent | Re-ran live: `scripts/check-security-allowlist.ts` → `[security-allowlist] PASS — 0 violation(s)`, header prints `365 file(s) scanned … 381 skipped by pattern`, per-class totals (`child-process: 14`, `bun-spawn: 0`, `raw-sql-unsafe: 1`, `dynamic-eval: 0`) — matches `scripts/security-allowlist.txt`'s 6 entries (1+3+3+2+5=14 child-process, 1 raw-sql-unsafe). | ✅ PASS |
| AC-2: new unreviewed site → exit 1 naming file+line | observed red | Not separately re-mutated by hand (redundant with Sensor mutation 3, which exercises the same `check()` comparison logic); fixture unit tests `scripts/__tests__/check-security-allowlist.test.ts:237-238` assert this directly and pass. | ✅ PASS |
| AC-3: removed site (allowlist over-counts) → fail | stale-entry violation | `scripts/__tests__/check-security-allowlist.test.ts:247-252` — asserts `kind: "stale"`; Sensor mutation 3 below independently proves this branch is load-bearing (flipping the comparator broke exactly this fixture). | ✅ PASS |
| AC-4: AST-based, not regex — string literals/comments/`RegExp.exec` never match | TypeScript compiler API | `scripts/check-security-allowlist.ts:64,159-232` — uses `ts.createSourceFile`/`ts.isCallExpression`/`ts.isImportDeclaration`, no regex over source text anywhere in the matching logic. | ✅ PASS |
| AC-5: gate runs in CI `build` job + `test:scripts` | wired | `.github/workflows/ci.yml:145-146` (`Verify security allowlist (XP-03)` step, after oxlint per the design's DEBT-01 ordering); `scripts/__tests__/check-security-allowlist.test.ts` reached by `bun run test:scripts` (re-run: 1230 tests / 55 files, includes this suite). | ✅ PASS |

### P1: XP-01 — CI's Bun install cache is warmed

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC-1: every `bun install`-running job gets a preceding `actions/cache@v4` step, keyed on `hashFiles('bun.lock')` + os/arch + fallback restore-key | 5 sites | `.github/workflows/ci.yml:114-115` (build), `:415-416` (structural-native), `:469-470` (structural-native-linux); `coverage.yml:141-142`; `publish.yml:56-57`. All identical shape (`key: bun-install-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('bun.lock') }}`, `restore-keys` fallback). `needles-gate.yml` is the one named exception (`scripts/__tests__/workflow-bun-cache.test.ts:29-31`, `CACHE_WARMING_EXEMPT`). | ✅ PASS |
| AC-2: purge-and-retry fallback stays byte-identical | no deletions to those blocks | `git diff --stat 94e6b05..HEAD -- .github/workflows/ci.yml .github/workflows/coverage.yml .github/workflows/publish.yml` shows the T8 commit adding only insertion blocks around existing purge/retry text (T8 Execution Record: 33 insertions / 0 deletions across the 3 workflow files) — confirmed by reading the diff hunks directly, no `-` lines touch purge/retry step bodies. | ✅ PASS |
| AC-3: build output / `.node` addons never cached | cache path scoped to `~/.bun/install/cache` only | Every cache step's `with.path` is the literal `~/.bun/install/cache` — grepped across all 5 sites, no other path present. | ✅ PASS |
| AC-4: deterministic YAML-parse unit test | red on removed step, green shipped | `scripts/__tests__/workflow-bun-cache.test.ts` — re-run: 15/15 pass. Asserts every `bun install` step in every job is immediately preceded by a matching cache step, exception named. | ✅ PASS |

### P2: XP-05 — tripwire pattern becomes a rule

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC-1: `CONTRIBUTING.md` Step 6 contains the both-direction paragraph citing `llm-env-prefix.test.ts` | paragraph present, path resolves | `CONTRIBUTING.md` (Step 6 append, 9 lines) — cites `packages/shared/src/config/__tests__/llm-env-prefix.test.ts`; file exists (`ls -la` confirmed, 644 lines). | ✅ PASS |

### P2: XP-06 — 5th host slots in without reactive hardcoding

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC-1: generators byte-identical for 4 existing hosts post-refactor | `--check` no drift ×2 + parity suites unchanged | Re-ran live (not trusting the claim): `bun run scripts/generate-subagent-artifacts.ts --check` → "No drift"; `bun run scripts/generate-skill-artifacts.ts --check` → "No drift". `test:scripts` includes `subagent-parity.test.ts` + `skill-artifact-parity.test.ts`, both in the 1230/55 green run. | ✅ PASS |
| AC-2: fixture 5th host drives real emitter differences | discrimination proven | `scripts/__tests__/host-capabilities.test.ts` extends with a fixture host through the `emitAll(..., hosts)` seam. Independently re-proven via Sensor mutation 5 below (flipping `codex`'s real `artifactExtension` in the table, not the fixture, drove `--check` to detect 17-file drift) — the table is demonstrably load-bearing, not decorative. | ✅ PASS |
| AC-3: `docs/adding-a-host.md` names the capability contract incl. quirk classes | all `HostCapabilities` fields + SessionStart/UserPromptSubmit quirks documented | `docs/adding-a-host.md` — grepped for all 8 `HostCapabilities` field names (`artifactExtension`, `agentIdentity`, `ownershipMarker`, `forwardsUnknownFrontmatter`, `hookBinaryDelivery`, `extraManagedRoots`, `sessionStartStdoutDelivered`, `handoffInjectionPoint`) — all present. `bun scripts/check-stale-pointers.ts` re-run: PASS, 0 broken. | ✅ PASS |
| AC-4: 7-step protocol satisfied | contract/register/argv/read-only-export/deliver-before-ack/invariants/discriminating-tests all recorded | `design.md` §C5 "7-step protocol mapping" records all 7 (2 marked N/A with reason). `capabilitiesFor` returns frozen data (`scripts/lib/host-capabilities.ts:172` `deepFreeze`) — read-only export confirmed by inspection. | ✅ PASS |

### P2: XP-07 — RSS-delta idiom shared

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC-1: both call sites refactored, thresholds/semantics unchanged | same bounds, same pass/fail behavior | `packages/core/src/__tests__/helpers/rss-delta.ts:27-33` — `median()`'s even-length branch (`(sorted[mid-1] + sorted[mid])/2`, `mid = floor(len/2)`) is arithmetically identical to `structural-runtime.test.ts`'s deleted inline `(sorted[9]+sorted[10])/2` for its fixed 20-element slices. `cycle-detection.test.ts:195-202`, `:223-230` — diff shows pure call-site substitution (`rssDeltaOver(() => {...})`), no numeric literal touched; threshold assertions (`expect(growthMiB).toBeLessThan(...)`) unchanged in the diff. `structural-runtime.test.ts`'s `16 * 1024 * 1024` threshold literal unchanged. | ✅ PASS |
| AC-2: helper is test-only, not exported | `packages/core/src/index.ts` untouched | `git diff --stat 94e6b05..HEAD -- packages/core/src/index.ts` empty; helper lives under `packages/core/src/__tests__/helpers/`. | ✅ PASS |

### P2: XP-08/XP-09 — CLAUDE.md testing claims match reality

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC (XP-08): runner paragraph describes thin-wrapper architecture with HEAD-measured line counts | 121/30/46 over shared 373 | Re-measured independently: `wc -l packages/core/scripts/run-tests-isolated.ts apps/tools-api/scripts/run-tests-isolated.ts apps/mcp-client/scripts/run-tests-isolated.ts scripts/lib/run-tests-isolated.ts` → **121 / 30 / 46 / 373** — exact match to `CLAUDE.md`'s claimed figures. | ✅ PASS |
| AC (XP-09): `test:scripts` line reflects a fresh run + `ls scripts/tests/*.sh | wc -l` | 1230 tests / 55 files + 21 shell suites | Re-measured independently: `bun run test:scripts` → **1230 tests across 55 files**; shell suite: **21/21 passed**; `ls scripts/tests/*.sh | wc -l` → **21**. Exact match to `CLAUDE.md`'s claimed figures. | ✅ PASS |

### P2: XP-10 — env knobs survive turbo

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC-1: every `MASSA_AI_*` var read in `packages/`+`apps/` passed through | re-derived read-set at HEAD, 35 known at spec time | `turbo.json:49-78` — 27 new `MASSA_AI_*` entries + `RUN_POSTGRES_TESTS` added (counted directly: 27 `MASSA_AI_*` lines in the diff). `scripts/__tests__/turbo-passthrough-env.test.ts` scans tracked files for both accessor forms and asserts subset — re-run: passes. | ✅ PASS |
| AC-2: added-later var either wildcard-covered or drift-test fails | mechanical recurrence guard | No wildcard (explicit-list decision, design.md Tech Decisions — Turbo `passThroughEnv` is literal-names-only, confirmed against docs). Drift test is the guard. **Sensor mutation 6** (below): removed `RUN_POSTGRES_TESTS` from `turbo.json` → `turbo-passthrough-env.test.ts` failed naming the missing sentinel. Reverted, content-verified. | ✅ PASS |
| AC-3: CLAUDE.md's AD-010 note names the enforcing test | updated | `CLAUDE.md` "Running tests" section — cites `scripts/__tests__/turbo-passthrough-env.test.ts` as the mechanization of "editing that list too." | ✅ PASS |

### P2: XP-11 — registry spelling normalized

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC-1: `workflow-harness-overhaul` status `in_progress`, no hyphen variant anywhere | 0 hyphen hits | `grep -c '"status": "in-progress"' .specs/project/FEATURES.json` → **0**. `python3 -c "json.load(...)"` → valid JSON. All 5 `"status"` occurrences using underscore form confirmed at lines 321/477/573/734/742. | ✅ PASS |

### P2: XP-12 — lessons recorded through the pipeline

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC-1: L-DRAFT-A..E enter via `lessons.py add`, `LESSONS.md` regenerated, `lessons.json` never hand-edited | 5 new candidates, tool-owned | `.specs/lessons.json` — 5 entries (`L-009`..`L-013`) with `"features": ["cross-pollination-ports"]`, `"status": "candidate"`, correct signal mapping per design.md C8 (spec_deviation, spec_precision_gap, gate_fail×2, ac_gap). `.specs/LESSONS.md` diff (+35 lines) is tool-shaped prose consistent with `lessons.py`'s known output format. | ✅ PASS |

### Process: XP-13

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
|---|---|---|---|
| AC-1: CHANGELOG entry, no skip-ci marker, no `no-changelog` label | present, correctly categorized | `CHANGELOG.md` `[Unreleased]` — 6 `### Added` bullets + 4 `### Fixed` bullets. Spot-checked every bullet against the actual diff (T19 worker flagged this as unverified prose — now independently re-verified): all 10 bullets accurately describe shipped changes, no overclaim found. `git log 94e6b05..HEAD --format="%B" | grep -i skip-ci` → empty (no literal marker in any commit). | ✅ PASS |

**Status**: ✅ All 13 requirement groups (35 individual ACs) covered, spec-anchored, evidence-or-zero satisfied for every row. 0 spec-precision gaps found — every AC in this spec defines a precise, testable outcome and every test target matches it exactly.

---

## Discrimination Sensor

Tiering: P1 security surface → ≥5 mutations required. 6 run (exceeds minimum). All in scratch state on the real worktree; each mutated file was restored via `git checkout -- <file>` and content-verified (`git status --porcelain` empty, `git diff --stat` empty) before the next mutation. No mutation overlapped with another.

| # | File:line | Description | Killed? |
|---|---|---|---|
| 1 | `packages/core/src/kernel/sanitize/credential-scrub.ts:90` | Neutered `AWS_KEY_PATTERN` to an unmatchable regex | ✅ Killed — `credential-scrub.test.ts` 2/26 fail; `hook-service.test.ts` 1/37 fail (`aws-key` redaction test) |
| 2 | `packages/core/src/services/hooks/hook-service.ts:246` | Removed the `scrubCredentials` call, passed raw `JSON.stringify(ev.payload)` through with an `as unknown as SanitizedPayloadJson` cast | ✅ Killed — `hook-service.test.ts` 7/37 fail (all XP-02 redaction cases) |
| 3 | `scripts/check-security-allowlist.ts:350` | Flipped `actual > entry.expected` → `actual < entry.expected` | ✅ Killed — `check-security-allowlist.test.ts` 2/39 fail (unreviewed-site and stale-entry fixtures both invert) |
| 4 | `scripts/check-workflow-venue-parity.ts` (divergence-push loop) | Removed the `if (exceptionByPairKey.has(pk)) continue;` guard | ✅ Killed — `check-workflow-venue-parity.test.ts` 3/21 fail; live-tree fixture surfaces the exact `ci.yml vs coverage.yml __invocation__` divergence the exception file exists to suppress |
| 5 | `scripts/lib/host-capabilities.ts:109` | Flipped `codex.artifactExtension` from `"toml"` to `"md"` | ✅ Killed — `generate-subagent-artifacts.ts --check` exits 1, naming 17 codex-host `.md` files as drift |
| 6 | `turbo.json` (`tasks.test.passThroughEnv`) | Removed `"RUN_POSTGRES_TESTS"` from the array | ✅ Killed — `turbo-passthrough-env.test.ts` 1/3 fail, naming the missing sentinel var |

**Sensor depth**: P0/P1-full (6 mutations ≥ the 5-minimum for this feature's security surface)
**Result**: 6/6 killed — ✅ PASS

---

## Interactive UAT

`UAT: not applicable` — backend/harness/infrastructure work with no user-facing UI flow; automated checks (spec-anchored ACs + discrimination sensor + full gate battery) are the appropriate verification tier per the workflow's own guidance.

---

## Code Quality

| Principle | Status |
|---|---|
| No features beyond what was asked | ✅ — every new file/function maps to a named XP requirement |
| No abstractions for single-use code | ✅ — `HostCapabilities` table serves 2 generators + docs + fixture test; RSS helper serves 2 real call sites |
| No unnecessary "flexibility" added | ✅ — no `assertSanitized` escape hatch on the branded type (explicitly rejected, by design) |
| Only touched files required for task | ✅ — insert-sweep touches exactly the 5 test files that constructed bare-string `payloadJson`, enumerated in T4, confirmed by diff |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns/style | ✅ — TS compiler API reuse from `check-tools-thin.ts` precedent; `Bun.YAML` reuse; kernel-tier placement follows the documented layering rule |
| Tests map to acceptance criteria and are non-shallow | ✅ — spot-checked XP-02 (payload/conjunction, not call-was-made) and XP-04 (before/after skip-count sensor, re-derived independently) |
| Spec-anchored outcome check | ✅ — see AC table above; every assertion targets the spec-defined exact value |
| Per-layer Coverage Expectation met | ✅ — `credential-scrub.ts` measured 100% funcs/lines via `bun test --coverage` (re-run independently) |
| Every test in scope maps to a spec AC / edge case / Done-when | ✅ — no unclaimed test files found in the diff |
| Documented guidelines followed | `CLAUDE.md` §Running tests, `CONTRIBUTING.md` Step 7, `coverage.yml` 90%-floor (applies to `credential-scrub.ts`, measured 100%) |

---

## Edge Cases (from spec.md)

- [x] JSON-escaped PEM boundary (`\n` inside the string) — `credential-scrub.test.ts:197-224` explicitly asserts the escaped-`\\n` form is caught (production seam scrubs `JSON.stringify(ev.payload)`, so this is the real-world shape).
- [x] Payload exactly at `HOOKS_MAX_PAYLOAD_BYTES` — pre-scrub size check confirmed to run first (`hook-service.ts` design note + code read: `validateEvent`'s 413 check precedes `ingestOneNormalized`'s scrub call).
- [x] Redaction never grows the payload past the cap — `credential-scrub.test.ts:144-181` non-growth invariant asserted over every rule + a realistic multi-credential payload; independently re-derived the two SPEC_DEVIATIONs (`aws-key` id shortening, slack near-miss floor `{18,}`) by reading the module docblock's stated arithmetic (20-char match vs marker length) — checks out.
- [x] Security-allowlist gate parse failure → loud exit 1 naming file, never silent skip — `check-security-allowlist.ts:161-163`, `:311-314` (`throw` on parse-diagnostic count > 0 and on read failure).
- [x] Venue-parity gate with no test invocation → explicit classification, never silent empty comparison — `EXEMPT_WORKFLOWS` table + `unclassified` bucket in `check-workflow-venue-parity.ts:76-81,252-260`; re-run confirms 0 unclassified against the live 6-workflow tree.
- [x] `actions/cache` miss → install proceeds unaffected — additive-only step shape, no conditional gating on cache hit.
- [x] Dedicated DB not migrated before tests — `ci.yml`'s existing `prisma migrate deploy` step now targets the dedicated URL (re-ran directly: `23 migrations found … No pending migrations to apply`).
- [x] Fixture 5th host with a capability combo no real host has → emitters follow the predicate table — proven by Sensor mutation 5 (the table drives real `--check` drift, not just fixture-internal assertions).

---

## Gate Check

**Gate command**: Full battery per spec §Verification Approach (`bun run lint && bun run type-check && bun run build && bun run test && bun run test:scripts && bun run test:plugins`), plus `bun scripts/run-deterministic.ts`, both generators `--check`, `bun scripts/check-core-layering.ts`, and the two new gate scripts run standalone. All re-run independently by this verifier (not trusting the orchestrator's cached figures), with `type-check`/`build` forced via `--force` to rule out a stale-cache replay (per the project's "cached result is not a measurement" discipline) and `test` confirmed `"cache": false` in `turbo.json` so no forcing was needed there.

| Gate | Result |
|---|---|
| `bun run lint` (oxlint) | 0 violations, exit 0 |
| `bun run type-check` + `bun run build` (forced, 0 cached) | 9/9 tasks successful |
| `bun run test` under dedicated triple (forced, 0 cached — task has `cache: false`) | 11/11 tasks, 151 core groups (+ tools-api/mcp-client), 0 fail |
| `bun run test:scripts` | 1230 tests / 55 files pass, 21/21 shell suites pass |
| `bun run test:plugins` | 96/96 pass, 8 files |
| `bun scripts/run-deterministic.ts` | 2098 pass, 127 skip, 0 fail, 138 files |
| `bun run scripts/generate-subagent-artifacts.ts --check` | No drift |
| `bun run scripts/generate-skill-artifacts.ts --check` | No drift |
| `bun scripts/check-core-layering.ts` | 0 violations, 985 edges, 934 files |
| `bun scripts/check-security-allowlist.ts` | PASS, 0 violations, 365 files scanned |
| `bun scripts/check-workflow-venue-parity.ts` | PASS, 2 test-running workflows, 0 unexcepted divergences |
| `bun scripts/check-stale-pointers.ts` | PASS, 0 broken |
| Dedicated-DB local sensor (T7) | Before: 0 pass/18 skip; After: 18 pass/0 fail — re-derived directly |

**Test count before feature**: not independently re-measured against `94e6b05` (would require a separate checkout); accepted the orchestrator's before/after framing since every individual gate above was independently re-run at HEAD and passed, and the sensor table proves discrimination directly.
**Test count after feature**: 1230 (test:scripts) + 151 core groups + 25 tools-api + 8 mcp-client (via `bun run test`) + 96 (plugins) + 2098 (deterministic) — all independently re-run, matching every figure the Execution Record claimed.
**Delta**: net-positive across every suite (new: `credential-scrub.test.ts`, `xp02-branded-type.test.ts`, `check-security-allowlist.test.ts`, `check-workflow-venue-parity.test.ts`, `workflow-bun-cache.test.ts`, `host-capabilities.test.ts`, `turbo-passthrough-env.test.ts`, `helpers/rss-delta.ts` consumers unchanged in count).
**Skipped tests**: 127 in the deterministic gate — pre-existing, unrelated to this feature (PostgreSQL/native-dependent suites the deterministic runner explicitly excludes, per `_DETERMINISTIC_ONLY=1`'s documented contract).
**Failures**: none across any gate re-run by this verifier.

**Known deferred item**: real-CI confirmation of T7's dedicated-DB flip and T8's cache-warming behavior is explicitly deferred to the PR run (recorded in `tasks.md`'s Execution Record and spec.md's Verification Approach) — this is a scoped deferral, not a gap; the local sensor (before/after skip-count, re-derived independently above) is the strongest evidence obtainable pre-merge.

**Known cold-run flake, checked**: `apps/mcp-client/src/__tests__/embedded-api-client-endpoints.test.ts` was not touched by this feature's diff and was not re-run in isolation (out of this feature's diff surface; documented pre-existing flake class in `CLAUDE.md`).

---

## Fix Plans

None — no FAIL findings.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
|---|---|---|
| XP-01 | Design/Tasks Pending | ✅ Verified |
| XP-02 | Design Pending | ✅ Verified |
| XP-03 | Design Pending | ✅ Verified |
| XP-04 | Design Pending | ✅ Verified |
| XP-05 | Tasks Pending | ✅ Verified |
| XP-06 | Design Pending | ✅ Verified |
| XP-07 | Tasks Pending | ✅ Verified |
| XP-08 | Tasks Pending | ✅ Verified |
| XP-09 | Tasks Pending | ✅ Verified |
| XP-10 | Design Pending | ✅ Verified |
| XP-11 | Tasks Pending | ✅ Verified |
| XP-12 | Tasks Pending | ✅ Verified |
| XP-13 | Execute Pending | ✅ Verified |

(Update `.specs/features/cross-pollination-ports/spec.md`'s Requirement Traceability table and `.specs/project/FEATURES.json`'s `cross-pollination-ports` entry — the latter is currently `"status": "in_progress"`, awaiting T21 close-out, which is correct and expected at this point in the workflow.)

---

## Summary

**Overall**: ✅ Ready (PASS)

**Spec-anchored check**: 35/35 individual acceptance criteria across 13 requirement groups (XP-01..XP-13) matched their spec-defined outcome with `file:line` evidence. 0 spec-precision gaps.
**Sensor**: 6/6 mutations killed (P1-tier depth, exceeds the ≥5 minimum for this feature's security surface).
**Gate**: every battery command independently re-run by this verifier (not trusting cached/claimed figures) — all green, figures matched the Execution Record's claims exactly everywhere checked.

**What works**: Every XP-01..XP-13 requirement is implemented, tested at the correct value-level (payload/conjunction, not call-was-made), and independently re-derived rather than trusted. The two P1 security gates (`check-security-allowlist.ts`, `check-workflow-venue-parity.ts`) both demonstrably discriminate real regressions, confirmed by hand-injected faults on the live scripts, not just their own fixture suites. The XP-02 sanitization boundary closes both production writers (`HookService` and the independent `compact_snapshot` bypass) and is enforced by a real compiler diagnostic, working around the `tsconfig.json` exclusion that would have silently defeated an in-tree `@ts-expect-error`.

**Issues found**: One process-level gap, not a code defect (see Ranked Gaps below) — a documentation/registry-numbering collision that T21 (not yet run) must avoid.

**Next steps**: Route the one ranked gap below to T21 (close-out) before it executes; no fix task needed against T1–T19's shipped code.

---

## Ranked Gaps

1. **AD-013 identifier collision, not yet materialized.** `design.md` §C1 proposes "**Proposed project decision (AD-013, to append at Execute)**" for the XP-02 sanitization boundary, and T4's Execution Record confirms this was deliberately deferred to T21 ("worker forbidden from `.specs/**`"). But `.specs/project/STATE.md:2614` **already has an AD-013** — an unrelated, earlier decision about needle-resolution anchoring (`sensor-repair-2026-07 SEN-04`). The highest AD number currently in `STATE.md` is AD-013 itself, so the next available slot is **AD-014**. This is not yet a defect in the shipped implementation (T1–T19 are all correct and independently verified above) — it is a landmine for T21, which has not run yet. If T21 blindly follows the design doc's literal "AD-013" text without checking `STATE.md` first, it will either silently overwrite/duplicate the real AD-013 or create ambiguity between two entries with the same identifier. — **AC/criterion**: not a spec AC directly, but blocks XP-02's design.md decision-record commitment — `.specs/project/STATE.md:2614` (existing AD-013) vs `design.md:107` (proposed AD-013, same number). **Fix**: when T21 runs, append the new decision as **AD-014**, not AD-013, and update any cross-reference in `design.md`/commit messages that already say "AD-013" for this feature (currently: `design.md:107`, `observation-contract.ts:16` docblock comment "XP-02 / AD-013"). This is a small, mechanical fix scoped entirely to T21 and doc comments — does not require re-touching any test or production logic.
