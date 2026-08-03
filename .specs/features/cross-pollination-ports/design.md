# Cross-Pollination Ports & Gap Closure — Design

**Spec**: `.specs/features/cross-pollination-ports/spec.md` (sha256 `63c88cd…5836c`)
**Status**: Approved (user-locked choices: XP-04 enforce+parity, XP-06 full prep refactor, one branch/PR)
**Evidence base**: three read-only investigator digests (hook path, CI workflows, generators) + inline measurements, all at `94e6b05`. Every figure below was measured this session unless marked otherwise.

---

## Design-time corrections to the spec's premises

1. **The "~50 gated suites" figure is wrong in the source itself.** `scripts/check-coverage.ts:414` (and `:434`) claim "50 of core's suites are wrapped in `describe.skipIf(!DEDICATED_DB)`". Measured: `DEDICATED_DB` predicate = **13** files (12 exact-literal + 1 compound `skipIf(!(DEDICATED_DB && RUN_PG))` in `synapse-session-store-pg.test.ts:55`); `RUN_POSTGRES_TESTS`-gated = **11** files (1 overlaps). ci.yml's blind spot is the union ≈ **23 files**, not 50 — the 50 likely miscounted the unrelated `skipIf(!READY)` ×51 population. Consequence: XP-04 gains a sub-item — correct that comment with the measured population; the venue-parity motivation is unchanged.
2. **`RUN_POSTGRES_TESTS` is absent from `turbo.json` `passThroughEnv`** (`MASSA_AI_DEDICATED` is present). `ci.yml`'s test step is `bun run test` = `turbo run test`, so setting the var in the job without the passthrough addition is a silent no-op — the exact AD-010 failure mode. coverage.yml only works because `test:coverage` = `bun scripts/check-coverage.ts`, bypassing turbo. **XP-04 hard-depends on this one-line passthrough addition.**
3. **`ObservationStore.insert` has 2 production call sites, not 1**: `hook-service.ts:253` and `tools/compact_snapshot.ts:111` — the latter bypasses `HookService` entirely (route `/api/v1/hook/compact-snapshot`). A boundary placed only inside HookService misses a real writer; the type-enforced seam at `insert` is what closes both.
4. **`Bun.YAML.parse` exists on pinned Bun 1.3.14** (probed: parses). Both new gate scripts use it — zero new dependencies.
5. **The two RSS sites use two different idioms**: `cycle-detection.test.ts:195-235` is baseline/after delta (×2 tests); `structural-runtime.test.ts:397-409` is a sampled series with `median(slice)` comparison. The helper must serve both shapes without changing either semantics.

---

## Architecture Overview

Eight independent work streams, one branch. Only XP-02 touches product runtime; XP-01/04 touch CI YAML; XP-03/04/10 add root-level gate scripts + tests; XP-06 refactors build-time generators; the rest are docs/registry/lessons.

```mermaid
graph TD
    subgraph runtime [XP-02 core runtime]
      K[kernel/sanitize/credential-scrub.ts] --> HS[services/hooks/hook-service.ts:246]
      K --> CS[tools/compact_snapshot.ts:111]
      K --> OC[data/memory/observation-contract.ts insert seam]
    end
    subgraph gates [new root gates]
      SA[scripts/check-security-allowlist.ts] --> CI[ci.yml build job]
      VP[scripts/check-workflow-venue-parity.ts] --> CI
    end
    subgraph ciyaml [CI YAML]
      C1[actions/cache bun install x5 steps] --> CI2[ci.yml + coverage.yml + publish.yml]
      PG[dedicated-DB triple in build job] --> CI2
    end
    subgraph gen [XP-06 generators]
      HC[scripts/lib/host-capabilities.ts] --> G1[generate-subagent-artifacts.ts]
      HC --> G2[generate-skill-artifacts.ts]
    end
```

## Requirements traceability

| Req | Component(s) | Verification |
|---|---|---|
| XP-01 | cache steps in `ci.yml` (3 jobs), `coverage.yml`, `publish.yml`; YAML unit test | `workflow-bun-cache.test.ts` + real CI run |
| XP-02 | `kernel/sanitize/credential-scrub.ts`; `observation-contract.ts` insert seam; 2 call sites | both-direction unit tests, `@ts-expect-error` type test, route tests green |
| XP-03 | `check-security-allowlist.ts` + `security-allowlist.txt` | fixture unit tests + observed red + live-tree exit 0 |
| XP-04 | `ci.yml` build-job env flip; `turbo.json` +`RUN_POSTGRES_TESTS`; `check-coverage.ts` comment fix; `check-workflow-venue-parity.ts` | parity unit tests + observed red + real CI run showing gated suites executing |
| XP-05 | CONTRIBUTING.md Step 6 paragraph | prose review |
| XP-06 | `scripts/lib/host-capabilities.ts`; both generators refactored; `docs/adding-a-host.md` | both `--check` no-drift, parity suites unchanged, fixture-host test |
| XP-07 | `packages/core/src/__tests__/helpers/rss-delta.ts` | both call-site files green, thresholds unchanged |
| XP-08/09 | CLAUDE.md §Running tests | fresh measurements cited in the diff |
| XP-10 | `turbo.json` explicit additions; `turbo-passthrough-env.test.ts` drift guard; CLAUDE.md AD-010 note | drift test red-then-green |
| XP-11 | FEATURES.json one-line | grep |
| XP-12 | `lessons.py add` ×5 | `lessons.json` diff via tool only |
| XP-13 | CHANGELOG | CI merge gate |

---

## Components

### C1 — Credential scrubber + branded type (XP-02)

- **Location**: `packages/core/src/kernel/sanitize/credential-scrub.ts` (+ `index.ts` barrel if kernel convention has one).
- **Why kernel**: the branded type is consumed by `data/memory/observation-contract.ts` (insert seam) and produced by `services/hooks` + `tools/` — a cross-tier leaf. Placing it in `services/` (report's suggestion) would create a `data → services` import, which `check-core-layering` fails by design. Kernel membership is the path prefix; no allowlist exists (CLAUDE.md).
- **Interface**:

```ts
declare const SanitizedBrand: unique symbol;
/** JSON-serialized payload that has passed credential scrubbing. Only
 * constructible via scrubCredentials(). */
export type SanitizedPayloadJson = string & { readonly [SanitizedBrand]: true };

export interface ScrubResult {
  sanitized: SanitizedPayloadJson;
  /** count of replacements, per rule id — 0-map on clean input */
  redactions: Record<string, number>;
  total: number;
}
export function scrubCredentials(payloadJson: string): ScrubResult;
```

- **No `assertSanitized` escape hatch.** Tests build values through `scrubCredentials` like production does; an assertion constructor would be the hole the brand exists to close.
- **v1 rule set** (each rule: id, regex, marker `"[REDACTED:<id>]"`; each ships a redacts-case AND a passes-through near-miss case):

| id | shape | notes |
|---|---|---|
| `pem` | `-----BEGIN [A-Z ]{0,32}PRIVATE KEY-----` … `-----END … KEY-----` incl. **escaped `\n`** (`\\n`) form | input is a JSON string — PEM newlines arrive escaped; match both raw and escaped |
| `jwt` | `eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}` | `eyJ` = base64url `{"` |
| `aws-key-id` | `\b(AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b` | fixed 20-char ids |
| `sk-key` | `\bsk-[A-Za-z0-9_-]{20,}\b` | ≥20 tail; `sk-abc` / `skColor` pass |
| `github-token` | `\bgh[pousr]_[A-Za-z0-9]{36,}\b` and `\bgithub_pat_[A-Za-z0-9_]{22,}\b` | |
| `slack-token` | `\bxox[baprs]-[A-Za-z0-9-]{10,}\b` | |
| `bearer` | `(Bearer\s+)[A-Za-z0-9._~+/=-]{20,}` → keep `Bearer `, redact token | word "bearer" in prose passes |

- **Non-growth invariant**: every rule's minimum match length exceeds its marker length → scrubbed output ≤ input length; asserted as a unit test over all rules (keeps the pre-scrub 413 size cap sound).
- **Seam changes**:
  - `observation-contract.ts`: `insert(obs: InsertableObservation): void` where `InsertableObservation = Omit<Observation, "payloadJson"> & { payloadJson: SanitizedPayloadJson }`. Read shapes (`Observation`, `ObservationRow`, `listRecent` etc.) keep plain `string` — rows read back are not re-branded.
  - `hook-service.ts:246`: `payloadJson: scrubCredentials(JSON.stringify(ev.payload)).sanitized` (+ `logger.debug` when `total > 0` — stderr per stdout-protocol rule).
  - `compact_snapshot.ts:111`: same wrap around its own `JSON.stringify`.
  - `MemoryObservationStore` + `PgObservationStore` signatures follow the contract; internals unchanged (both treat it as a string at runtime — brand is compile-time only).
- **Ordering**: `validateEvent`'s 413 size check stays first (pre-scrub); scrub happens at the serialization site. Wire shape of `POST /api/v1/hook` unchanged (AC-5): same accept/reject behavior, only stored bytes differ.
- **Pre-existing rows stay unsanitized** — accepted limitation, recorded here (retrofit migration out of scope; L-DRAFT-E is the lesson about exactly this cost).
- **Proposed project decision (AD-013, to append at Execute)**: *every durable Observation write passes the kernel credential-scrub boundary; new observation-writing code must construct `InsertableObservation` via `scrubCredentials` — the type makes violation a compile error.*

### C2 — Security allowlist gate (XP-03)

- **Location**: `scripts/check-security-allowlist.ts` + `scripts/security-allowlist.txt`; unit tests `scripts/__tests__/check-security-allowlist.test.ts`.
- **Engine**: TypeScript compiler API (`import ts from "typescript"`), per `check-tools-thin.ts` precedent — string literals, comments, and `regex.exec(` cannot match (spec AC-4; two recorded lessons about phantom text matches).
- **Population**: `git ls-files` filtered to `packages/{core,shared}/src/**/*.ts` + `apps/{tools-api,mcp-client,web-ui}/src/**/*.ts`, minus `__tests__/`, `*.test.ts`, `src/generated/`. `scripts/` deliberately excluded: dev-time gates legitimately shell out (`check-tools-thin.ts` itself calls `execSync`), and the trust boundary this gate protects is the shipped product surface. Exclusion is printed in the gate's output header, not silent.
- **Classes**:
  1. `child-process` — call of any binding imported from `child_process`/`node:child_process` (track import specifiers incl. renames + namespace imports, the `IToolHandler as H` lesson from check-tools-thin).
  2. `bun-spawn` — `Bun.spawn`/`Bun.spawnSync`/`` Bun.$`` `` member access.
  3. `raw-sql-unsafe` — `.$queryRawUnsafe(`/`.$executeRawUnsafe(` member calls (tagged-template `$queryRaw` is parameterized — deliberately NOT counted; the docblock states why).
  4. `dynamic-eval` — `eval(...)` identifier call + `new Function(` — expected 0, no allowlist entries permitted for this class (a stricter rule than count-matching).
- **Allowlist format** (`security-allowlist.txt`): `class|path|expected-count|justification`, `#` comments. Gate fails on: actual > expected (new unreviewed site), actual < expected (stale entry), file present in allowlist but absent from tree, and any `dynamic-eval` hit.
- **Output**: population header (`N files scanned, M skipped by pattern`) + per-class totals + per-entry actual/expected — population always printed (lesson: a gate that resolves to nothing must not read as clean).
- **Known expected sites** (import-anchored measurement; exact call counts derived by running the gate at Execute and reviewing each site — the review is the audit): `services/bootstrap/bootstrap-service.ts` (spawn), `services/symbol/impact-analysis.ts` (execFileSync), `services/executor/{executor,sandbox,runtime}.ts` (spawn/execSync/execFileSync — the documented sandbox), `data/symbol/symbol-repo-graph.ts` (raw-unsafe SQL).
- **Failure loudness**: a file that fails to parse → exit 1 naming the file (never skip-and-continue).
- **CI wiring**: `build` job, immediately after oxlint (`ci.yml` DEBT-01 block); also a `test:scripts` unit suite with in-memory `ts.createSourceFile` fixtures (rename evasion, string-literal non-match, comment non-match, namespace import, each class red/green) + one live-tree smoke test asserting exit 0.

### C3 — Bun install cache (XP-01)

- **Step shape**, inserted immediately before each install step:

```yaml
- name: Restore Bun install cache
  uses: actions/cache@v4
  with:
    path: ~/.bun/install/cache
    key: bun-install-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('bun.lock') }}
    restore-keys: |
      bun-install-${{ runner.os }}-${{ runner.arch }}-
```

- **Sites (5)**: `ci.yml` `build:98`, `structural-native:365`, `structural-native-linux:409`; `coverage.yml:143`; `publish.yml:57` — publish is included because the v1.4.0 incident *was* a publish-run failure, and `actions/cache@v4` is a marketplace action, so it resolves fine when `publish.yml` runs against an old tag (the local-composite prohibition in CLAUDE.md does not apply to marketplace actions). `needles-gate.yml` excluded (`--ignore-scripts`, dispatch-only) — named in the parity exception list, not silently skipped.
- **Purge-and-retry blocks stay byte-identical** (L-DRAFT-C: warming + fallback, not either/or). On the purge path, `rm -rf ~/.bun/install/cache` also invalidates what the post-job cache save would persist — acceptable: the save then uploads the freshly rebuilt cache.
- **Never cached**: `node_modules`, build output, compiled `.node` addons (spec out-of-scope row).
- **Unit test** `scripts/__tests__/workflow-bun-cache.test.ts`: `Bun.YAML.parse` each workflow; for every job step running `bun install` (except the named exception), assert a preceding step in the same job uses `actions/cache@v4` with exactly the `~/.bun/install/cache` path. Red on removal, green as shipped.

### C4 — Dedicated-DB gate in ci.yml + venue parity (XP-04)

- **`ci.yml` `build` job env flip** (making its test venue ≡ coverage.yml's):
  - service: ports `5433:5432`, `POSTGRES_DB: massa_ai_test` (image/user/password/health unchanged);
  - job env: `DATABASE_URL: postgresql://massa_ai:massa_ai_password@127.0.0.1:5433/massa_ai_test`, `MASSA_AI_DEDICATED: "1"`;
  - test step env: `RUN_POSTGRES_TESTS: "1"` (+ existing `MASSA_AI_EXECUTOR_SANDBOX: none`).
  - The existing `bunx prisma migrate deploy` step now migrates the dedicated DB — same sequence coverage.yml already proves out. A second service was rejected: `DEDICATED_DB` requires `DATABASE_URL` *itself* to match the 5433 literal, so a side service can never satisfy the predicate.
  - `mcp` job service untouched (Docker smoke, separate concern).
- **`turbo.json`**: `test.passThroughEnv` += `RUN_POSTGRES_TESTS` (hard dependency — without it the flip is a silent no-op; see correction 2).
- **`check-coverage.ts:414/:434` comment**: replace "50" with the measured populations (13 `DEDICATED_DB` files / 11 `RUN_POSTGRES_TESTS` files, 1 overlap) — measured again at Execute before writing.
- **Sensor for AC-1** (suites actually run): compare the CI test-step log's pass/skip counts for one named gated suite (e.g. `graph-store-pg-coverage.test.ts`) before/after — before: all-skip; after: executing. Locally reproducible with the env triple set against `docker compose` on 5433 or the dedicated service.
- **`scripts/check-workflow-venue-parity.ts`**: parses all `.github/workflows/*.yml` with `Bun.YAML`; classifies each workflow: test-running (invokes `bun run test|test:coverage|test:scripts|test:plugins|bun test`) vs non-test (must appear in the script's `EXEMPT` table with a reason — empty comparison never silently passes). For each test-running venue, extracts the effective env for the test invocation (workflow env ∪ job env ∪ step env, later wins) projected onto a declared semantic key set: `DATABASE_URL`, `MASSA_AI_DEDICATED`, `RUN_POSTGRES_TESTS`, `MASSA_AI_EXECUTOR_SANDBOX`, `RUN_E2E`, `RUN_E2E_DESTRUCTIVE` + runner OS + invocation string. Any pairwise divergence must be named in an explicit exception list (`class|workflowA|workflowB|key|justification`) or the gate exits 1 naming workflow+key. Wired into `build` job beside the security gate; unit tests with fixture YAML strings (injected divergence red / declared exception green / unknown workflow red).

### C5 — Host capability table + generator refactor (XP-06)

- **New**: `scripts/lib/host-capabilities.ts`. Imports and re-exports `HOSTS`/`Host` from `scripts/lib/model-profiles.ts` (which is already array-first and canonical) — kills the second `HOSTS` copy in `generate-skill-artifacts.ts:55-56` and the bare-union `Host` in `generate-subagent-artifacts.ts:111` (and its `RegistryHost` casts at `:404,:425`).
- **Capability record** (consumed where mechanical today; documentation-bearing fields consumed by docs + fixture test):

```ts
export interface HostCapabilities {
  artifactExtension: "md" | "toml";              // replaces 3 ternaries (:426, :450 + runCheck)
  agentIdentity: "frontmatter-name" | "filename"; // opencode has no name key
  ownershipMarker: "frontmatter" | "body";        // opencode forwards unknown fm keys to provider
  forwardsUnknownFrontmatter: boolean;            // the WHY of the above — documented
  hookBinaryDelivery: "source" | "real-copy" | "none"; // claude=source, codex/cursor=real-copy, opencode=none (in-process)
  extraManagedRoots: readonly string[];           // opencode: ["lib"]
  // Future-host contract fields (ai-memory evidence: hosts differ in lifecycle-hook
  // delivery); consumed by docs/adding-a-host.md + the fixture-host test today:
  sessionStartStdoutDelivered: boolean | null;    // null = unverified for that host
  handoffInjectionPoint: "session-start" | "user-prompt-submit" | null;
}
export const HOST_CAPABILITIES: Record<Host, HostCapabilities>;
export function capabilitiesFor(host: Host): HostCapabilities; // read-only export (7-step Step 4)
```

- **Refactor moves, byte-identity-constrained**:
  - `generate-subagent-artifacts.ts`: emitter dispatch nested-ternary (`:430-436`) → `Record<Host, EmitFn>` map; `ext` ternaries (`:426`, `:450`) → `capabilitiesFor(host).artifactExtension`; `emitAll`/`runCheck` host lists → `HOSTS` (with an `emitAll(opts, hosts = HOSTS)` param so the fixture test can inject a 5th entry without shipping one).
  - `generate-skill-artifacts.ts`: local `HOSTS`/`Host` → import; `HOOK_BINARY_HOSTS` (`:52`) → derived `HOSTS.filter(h => capabilitiesFor(h).hookBinaryDelivery === "real-copy")`; `managedRootsFor`'s opencode branch (`:184`) → `extraManagedRoots`.
  - **Not moved**: per-host emitter string rendering (the frontmatter/TOML bodies — byte-identity is the bar and key ORDER is asserted by parity tests); `model-profiles.ts` internals (`HOST_EFFORT_ENUM`, `effortViolation` stay — capabilities module references, never duplicates, per the "one hand-authored model registry" invariant); bash installer tables (`installer-shared.sh` sibling surface — untouched, noted in docs).
- **Fixture host**: test-only capabilities entry in `scripts/__tests__/host-capabilities.test.ts` driving `emitAll` through the injected-hosts seam; asserts extension choice, marker placement, and hook-binary set follow the table (proves the table is load-bearing — spec edge case).
- **`docs/adding-a-host.md`**: capability contract checklist (each `HostCapabilities` field + how to determine it, incl. the SessionStart-stdout / UserPromptSubmit quirk classes), the surfaces a real host must touch beyond the TS generators (installer bash tables, parity tests, model-profiles registry `hostDefaults`), and the rule that a new host lands table-first.
- **7-step protocol mapping** (this is a harness-component change): 1 Contract = this section; 2 Register = `HOST_CAPABILITIES` record (discoverable by name); 3 Preserve argv = N/A, no command wrapping — recorded; 4 Read-only export = `capabilitiesFor` returns frozen data, test asserts no mutation; 5 Deliver-before-ack = N/A, synchronous build-time — recorded; 6 Invariants = 4-host byte-identity (`--check` ×2 + parity suites); 7 Discriminating tests = fixture host + table-mutation red (change `artifactExtension` for codex in a scratch copy → `--check` drift).

### C6 — RSS helper (XP-07)

- **Location**: `packages/core/src/__tests__/helpers/rss-delta.ts` (test-only; not exported from the package).
- **API**: `rssNow(): number`; `rssDeltaOver(fn: () => void): number` (baseline → run → after − baseline); `median(xs: number[]): number`.
- `cycle-detection.test.ts` (2 tests) → `rssDeltaOver`; `structural-runtime.test.ts` keeps its sampling loop, adopts `rssNow` + shared `median`. Thresholds and comparison semantics byte-for-byte unchanged — this is DRY, not behavior change. (Note `process.memoryUsage().rss` vs `process.memoryUsage.rss()` — the two files use different accessors; `rssNow` standardizes on `process.memoryUsage.rss()`, the cheaper accessor, identical value.)

### C7 — passThroughEnv completeness (XP-10)

- **Explicit list, not wildcard**: Turbo docs (fetched 2026-08-03) document wildcard patterns for `env` only; `passThroughEnv` takes literal names. Additions: the 27 measured missing `MASSA_AI_*` vars (re-derived at Execute from tracked files) + `RUN_POSTGRES_TESTS` (C4). Over-listing is harmless — `passThroughEnv` never contributes to cache keys.
- **Drift guard** `scripts/__tests__/turbo-passthrough-env.test.ts`: derive read-set by scanning tracked `packages/`+`apps/` `*.ts` for `process.env.MASSA_AI_[A-Z_]+` and `process.env["MASSA_AI_…"]` (both accessor forms); assert read-set ⊆ `passThroughEnv`, and `RUN_POSTGRES_TESTS`/`RUN_E2E`/`RUN_E2E_DESTRUCTIVE`/`DATABASE_URL` present. This mechanizes AD-010's "editing that list too" rule; CLAUDE.md's note is updated to say the test enforces it (XP-10 AC-3).

### C8 — Docs, registry, lessons (XP-05/08/09/11/12/13)

- **XP-05**: one paragraph appended to CONTRIBUTING.md Step 6 (spec AC text), citing `packages/shared/src/config/__tests__/llm-env-prefix.test.ts`.
- **XP-08/09**: rewrite `CLAUDE.md:100-104` (runner architecture: thin wrappers 121/30/46 over `scripts/lib/run-tests-isolated.ts` 373 — re-measure) and `:125` (fresh `bun run test:scripts` pass/file counts + 21 shell suites — re-measure; note count will change because this feature *adds* suites: state the at-merge numbers).
- **XP-11**: `FEATURES.json:573` `"in-progress"` → `"in_progress"` via python read-modify-write.
- **XP-12** signal mapping (enum is fixed — best-fit): A→`spec_deviation` (self-updater shape, source cbm PRs), B→`spec_precision_gap` (tripwire, source `llm-env-prefix.test.ts`), C→`gate_fail` (cache race, source `ci.yml:75`), D→`gate_fail` (venue divergence, source `ci.yml`/`coverage.yml`), E→`ac_gap` (sanitization retrofit, source `hook-service.ts:246`). All via `lessons.py add --feature cross-pollination-ports --project massa-ai --session spec-cross-pollination-ports --workflow spec-driven --entity cross-pollination-ports`.
- **XP-13**: `### Added` (sanitization boundary, security gate, venue-parity gate, CI cache warming, host-capability table, RSS helper) + `### Fixed` (CLAUDE.md claims, check-coverage comment, FEATURES.json spelling, passThroughEnv gaps). Minor bump expected.

---

## Approach tradeoffs (Large — the three that had real alternatives)

1. **XP-02 boundary placement** — chosen: kernel branded type + insert-seam enforcement. Alternatives: (a) scrub inside `PgObservationStore.insert` (runtime-complete but type-invisible: new writers get scrubbed silently, nothing forces awareness, and the in-memory store diverges); (b) scrub in tools-api routes (misses embedded MCP client path and compact_snapshot; transport-N problem). Rejected both: the compile-time seam is the only shape that makes the *third* future writer fail loudly at authoring time.
2. **XP-04 venue wiring** — chosen: flip `build` job to the dedicated shape. Alternatives: (a) second postgres service — structurally impossible (predicate reads `DATABASE_URL` itself); (b) new separate workflow — recreates the exact two-venue divergence class this port exists to close. 
3. **XP-10 wildcard vs list** — chosen: explicit list + drift test (docs say wildcards are `env`-only; a drift test also covers non-`MASSA_AI_` vars like `RUN_POSTGRES_TESTS`, which no prefix wildcard ever would).

## Error Handling Strategy

| Scenario | Handling | Surface |
|---|---|---|
| Scrubber regex catastrophic input | rules are linear-scan safe (no nested quantifiers over the same class); unit test with 64 KiB adversarial input under the 5 s budget | test |
| Gate script parse failure (TS or YAML) | exit 1 naming file — never skip | CI log |
| Allowlist entry for deleted file | exit 1 "stale entry" | CI log |
| Cache restore miss/failure | actions/cache no-op → install proceeds; purge-retry unchanged | CI |
| Dedicated DB not migrated | migrate-deploy step precedes tests (coverage.yml-proven sequence) | CI |
| lessons.py unavailable | record skipped reason in validation.md (workflow contract) | validation.md |

## Risks & Concerns

| Concern | Location | Impact | Mitigation |
|---|---|---|---|
| Unknown suite hardcodes `localhost:5432` and breaks under the flipped build job | `packages/core/src/__tests__/**` | red CI on the PR | coverage.yml already runs the whole suite under the dedicated shape via `check-coverage` — strong prior; if a suite still breaks, fix the suite (never re-hide the gate) |
| Over-redaction mangles legitimate payload content | `credential-scrub.ts` | corrupted observations | narrow shapes + mandatory near-miss pass-through tests per rule (spec AC-2); v1 set errs toward under-redaction |
| Parity tests assert frontmatter key ORDER | `subagent-parity.test.ts:694` | extraction that reorders emit lines breaks parity | emitters' string rendering not moved; byte-identity gate run per generator commit |
| `--check` in subagent generator round-trips via `spawnSync` on the working tree | `subagent-parity.test.ts:175-183` | refactor bugs surface only at test time | run both generators `--check` locally in the task gate before commit |
| `structural-runtime.test.ts` uses `process.memoryUsage.rss()` accessor | `:402` | helper must not change measured values | `rssNow` uses the same accessor; refactor is call-site substitution only |
| Untracked `.specs/reports/` (source report) not in git | repo root | PR reviewers can't see the source | commit the report with the feature branch (it is the feature's requirement source) |
| turbo `passThroughEnv` addition interacts with nothing else | `turbo.json` | — | passThroughEnv is non-hashing by contract (docs verified) |
| **(critic C1)** `packages/core/tsconfig.json:25` excludes `src/__tests__` from every type-check — an in-tree `@ts-expect-error` is never verified, and 6 existing test files insert bare-string `payloadJson` | `packages/core/tsconfig.json:25` | branded type silently unenforced on the test surface | T4 amended: compile-fixture gate via in-process `ts.createProgram` in `scripts/__tests__/` (which IS reached by test:scripts) + route existing test insert sites through the scrubber |
| **(critic C3)** post-T7, ci.yml `build`'s env satisfies `isDedicatedDatabase()` — the same single predicate gating `resetDedicatedDatabase()`'s CASCADE TRUNCATE (`check-coverage.ts:404-411,:500-520`; sole call site `main():559`, only reached via `test:coverage`, which the build job never runs) | `.github/workflows/ci.yml` | latent: adding any script importing that reset to the build job becomes destructive with no second guard | recorded invariant: never wire `check-coverage.ts`-importing scripts into the build job without an explicit second guard |
| **(critic C5)** XP-10 measures its 27-var set early (T2) while XP-08/09 measure late (T15) | tasks.md | apparent inconsistency | safe asymmetry: T2 ships a standing drift TEST that re-derives the read-set on every `test:scripts` run; T15's figures have no standing guard, hence measured last |

## Tech Decisions (non-obvious)

| Decision | Choice | Rationale |
|---|---|---|
| Branded-type location | `kernel/sanitize/` | layering: consumed by data+services+tools; kernel is the sanctioned cross-tier leaf |
| No assert/unsafe constructor on the brand | tests go through the real scrubber | an escape hatch is the vulnerability re-introduced |
| `$queryRaw` tagged-template not counted by XP-03 | only `*Unsafe` variants | parameterized-by-construction; counting all raw SQL would drown signal (258 hits, mostly generated types) |
| `dynamic-eval` class has no allowlist | expected 0, hard-fail | an allowlisted eval is an eval |
| YAML parsing via `Bun.YAML` | no new dependency | probed working on pinned 1.3.14 |
| Venue-parity key set is declared, not "all env" | 6 semantic keys + runner + invocation | comparing all env produces permanent noise (job-specific tokens); declared set + exceptions is auditable |
| publish.yml gets the cache step | included | the named incident was a publish run; marketplace action is retro-safe on old tags |

## Reuse plan

`check-tools-thin.ts` (AST walking, docblock discipline, population printing) → XP-03/XP-04 scripts; `model-profiles.ts` (HOSTS array, registry validation style) → XP-06; existing purge/retry blocks (unchanged fallback) → XP-01; `llm-env-prefix.test.ts` (two-direction tripwire shape) → XP-02 near-miss tests + XP-05 citation; coverage.yml's service/migrate sequence → XP-04; `sanitizeFilePath`'s documented-rationale style → scrubber docblocks.

## Verification design

Every new gate: fixture unit tests (red and green cases) + one observed-red against the live tree via injected violation on scratch state, reverted content-verified. XP-02: both-direction per rule + `@ts-expect-error` type test + existing hook/route/observation suites green. XP-04: real CI run on the PR is the final sensor (gated suites executing). XP-06: byte-identity (two `--check`s + parity suites) is the whole acceptance. Full battery per behavior commit (spec §Verification).

## Artifact-store evidence

Active artifact: `.specs/features/cross-pollination-ports/design.md` v1 (checksum in STATE at next update).
