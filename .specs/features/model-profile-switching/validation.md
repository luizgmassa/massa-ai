# Model Profile Switching Validation

**Date**: 2026-08-04
**Spec**: `.specs/features/model-profile-switching/spec.md`
**Diff range**: `d18e7764..5960839d` (branch `spec/model-profile-switching`, tree clean and fully committed)
**Verifier**: independent sub-agent (author ≠ verifier) — three batch-builder agents plus the main agent authored T1-T17; this session re-derived every finding from spec + code + fresh command runs, no author claim inherited.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 state module | Done | `packages/shared/src/profile-switch/state.ts` |
| T2 host table + route detection | Done | `hosts.ts` |
| T3 single-flight lock | Done | `lock.ts` |
| T4 switch engine + report | Done | `engine.ts`, `report.ts` |
| T5 generator variant emission | Done | `emitVariants` in `generate-subagent-artifacts.ts` |
| T6 `--check` full-inventory variant diff | Done | `staleVariantDirs`, `diffHost` extension |
| T7 regenerate bundles + parity/package guards | Done | 22 (host,profile) pairs × 17 files; `verify-package-contents.ts` `agent-profiles` entries |
| T8 claude/codex installer re-apply + route recording | Done | both `install.sh` |
| T9 opencode/cursor installer re-apply + F3 case | Done | both `install.sh` |
| T10 state round-trip guards | Done | `install-state-plugin-version.test.ts` extension |
| T11 tools-api profiles routes | Done | `routes/profiles.ts` + `profiles.test.ts` |
| T12 MCP tool-defs + embedded parity | Done | `tool-defs-project.ts`, tool count 52→54 (3 pin locations) |
| T13 CLI `profile` subcommand | Done | both `config-cli.ts`, `profile-cli-parity.test.ts` |
| T14 OpenCode in-process tool | Done | `apps/opencode-plugin/src/index.ts`, count 13→14 |
| T15 Claude skill | Done | `skills/profile/SKILL.md` |
| T16 registry-spec amendment + CHANGELOG | Done | `model-profile-registry/spec.md` amendment; `CHANGELOG.md [Unreleased]` |
| T17 close-out | Done | `AD-015` appended to STATE.md; FEATURES.json phases all `complete` |

Two additional delivery-repair commits found in history and independently verified: `4f534be4` (security-allowlist entry for `lock.ts`'s `execFileSync`, required by the managed-harness protocol) and `d96534b9` (tools-api `profiles.test.ts` type-check/mock-recursion hardening). Both are in-scope repairs, not scope creep.

---

## Spec-Anchored Acceptance Criteria

### P1: Switch profile conversationally from any host

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `profile_set{profile:"work"}` replaces active files, reports switched/skipped/failed per host | per-host status rows with reasons | `packages/shared/src/profile-switch/__tests__/engine.test.ts:98-118` — asserts `report.hosts` equals `[{host:"claude",status:"switched",filesChanged:1}]`, active file content becomes `"opus"`, non-owned file untouched | ✅ PASS |
| AC2: completed switch states restart required | `restartRequired: true` when ≥1 host switched | `engine.ts:293` `restartRequired = !dryRun && ordered.some(r=>r.status==="switched")`; `engine.test.ts:108` `expect(report.restartRequired).toBe(true)` | ✅ PASS |
| AC3: `host:"claude"` touches only that host | other hosts' active files unchanged | `engine.test.ts:120-138` — codex active file remains `"sonnet"` (untouched) when only claude requested | ✅ PASS |
| AC4: unknown profile fails named, lists available, no writes | named error + on-disk profile list + no file change | `engine.ts:36-40` `UnknownProfileError`; `engine.test.ts:174-192` asserts `err.name === "UnknownProfileError"`, message contains `"balanced"`, active file unchanged | ✅ PASS |
| AC5: host unsupported by profile → unsupported row, no changes | `status:"unsupported"`, reason names profile | `engine.test.ts:195-216` — codex row `status:"unsupported"`, reason contains `"open_models"`; mirrors registry fail-loud | ✅ PASS |
| AC6: Cursor always reported skipped, explicit reason | `status:"skipped"`, reason mentions inherit | `hosts.ts:59` `CURSOR_SKIP_REASON`; `engine.test.ts:242-247` `expect(report.hosts).toEqual([{host:"cursor",status:"skipped",reason: expect.stringContaining("inherit")}])` | ✅ PASS |
| AC7: `profile_list` returns shipped names, per-host active (default `balanced`), bundle version | exact default value `"balanced"` | `engine.ts:96` `activeProfile: platform?.modelProfile?.profile ?? "balanced"`; `engine.test.ts:65` `expect(claude.activeProfile).toBe("balanced")`; `engine.test.ts:75-94` recorded-state case returns `"home"` + `bundleVersion:"1.23.0"` from `plugin.version` | ✅ PASS |
| AC8: offline switch uses only on-disk files | no network call in switch path | `engine.ts` imports only `node:fs/path/os/crypto`; `listVariantProfiles`/`copyVariant` are pure fs; no fetch/http anywhere in `profile-switch/` (`grep -rn "fetch(\|http" packages/shared/src/profile-switch/*.ts` → 0 hits, verified this session) | ✅ PASS |

### P1: Variants ship in every plugin bundle

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: generator emits complete variant set per (host, profile), byte-identical to single-profile emission | byte-equality | `scripts/__tests__/generate-subagent-artifacts-variants.test.ts:73-133` — `expect(a.equals(b)).toBe(true)` for sampled (claude,work) and (opencode,open_models) pairs | ✅ PASS |
| AC2: `--check` diffs variants with full-inventory semantics (stale-entry detection) | red on deleted file AND stale extra dir | `scripts/generate-subagent-artifacts.ts:595-603` `staleVariantDirs`; `scripts/__tests__/generate-subagent-artifacts-variant-check.test.ts:66-84` (deleted file), `:138-162` (stale profile-removal directory) both observed red first | ✅ PASS |
| AC3: unsupported (host,profile) ships no variant dir; switch treats absence as unsupported | no directory created | `generate-subagent-artifacts-variants.test.ts:135-147` — no `agent-profiles/open_models` for claude; `engine.test.ts:218-239` codex reports "upgrade plugin" when variants root absent entirely, and `:195-216` reports "not supported" when the specific profile dir is absent | ✅ PASS |
| AC4: `npm pack` tarball contains variant tree | `agent-profiles` present in package inventory | `apps/{claude,codex,cursor,opencode}-plugin/package.json` `files` arrays include `"agent-profiles"` (verified this session, `grep -n agent-profiles apps/*-plugin/package.json`); `scripts/verify-package-contents.ts:88-111` `requiredTopLevel` includes `"agent-profiles"` for all 4 plugins; `scripts/__tests__/verify-package-contents.test.ts:308` mutation test: "a staged copy WITHOUT agent-profiles fails every one of the 4 plugin packages that require it" | ✅ PASS |
| AC5: active `agents/` byte-equals default variant | byte-for-byte | `generate-subagent-artifacts-variants.test.ts:163-209` (`emitAll`/`emitVariants` unit level); `scripts/__tests__/subagent-parity.test.ts:276-` "active agents/ byte-equals agent-profiles/<hostDefaults[host]>/ for every host" (checked-in-bundle level, re-measured population) | ✅ PASS |

### P1: Recorded profile survives upgrades

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 (amended C1): `{profile, switchedAt}` recorded, round-trips through every existing writer | shape exactly `{profile,switchedAt}`, no `bundleVersion` duplication | `packages/shared/src/profile-switch/state.ts:29-32` `ModelProfileRecord` interface; `scripts/__tests__/install-state-plugin-version.test.ts` (extended, T10) round-trip cases preserving `modelProfile` across `state_replace`/`record_plugin_version()` for all 4 hosts | ✅ PASS |
| AC2: installer re-applies recorded profile on install/upgrade | active set sourced from recorded variant | `apps/opencode-plugin/install.sh:518-524` `RECORDED_PROFILE=$(recorded_profile)`, `ACTIVE_AGENTS_SRC=$VARIANTS_DEST/$RECORDED_PROFILE`; identical pattern in claude/codex `install.sh`; `scripts/tests/test-model-profile-installer-reapply.sh`, `...-opencode-cursor.sh` scenario 2 "recorded profile honored" | ✅ PASS |
| AC3: recorded-but-removed profile → loud fallback to default | stderr fallback line, default variant applied | `install.sh:526-529` prints `"⚠ recorded model profile '$RECORDED_PROFILE' is not in this bundle — falling back to the default profile"`; shell suite scenario 3 "recorded-but-missing profile → loud fallback line + default symlink" | ✅ PASS |
| AC4: no profile record → today's default behavior | default variant, no write until first switch | `recorded_profile()` returns `""` on missing record → `ACTIVE_AGENTS_SRC` stays `$SCRIPT_DIR/agents` (default); installers never call `updatePlatform`/write `modelProfile` (grep confirms `modelProfile` write sites are only in `engine.ts`) | ✅ PASS |
| AC5 (amended F4): corrupt/unwritable state fails before any copy, globally (exempt from per-host atomicity) | global fail, zero copies | `engine.ts:213-215` `readInstallState` + `assertStateWritable` run before any host loop; `engine.test.ts:277-317` both corrupt-JSON and unwritable-dir cases assert `err.name` is `CorruptInstallStateError`/`UnwritableInstallStateError` and the active file is untouched | ✅ PASS |

### P2: CLI subcommand + OpenCode in-process tool

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `profile set <name> [--host][--dry-run]` invokes same engine; dry-run changes nothing | identical engine call, no mutation | `apps/mcp-client/src/config-cli.ts` imports `switchProfile` from `@massa-ai/shared` directly (no re-implementation); `engine.test.ts:140-156` dry-run asserts before/after byte-identity | ✅ PASS |
| AC2: `profile list`/`show` match `profile_list` data | same engine, same shape | both CLIs import `listProfiles` from `@massa-ai/shared` | ✅ PASS |
| AC3: OpenCode in-process tool delegates to same engine/endpoint | `profile` tool present, HTTP-backed | `apps/opencode-plugin/src/__tests__/index.test.ts:203-239` — `action:list` GETs `/api/v1/profiles`, `action:set` POSTs `/api/v1/profiles/switch` | ✅ PASS |
| AC4: switch logic exists once, shared, not pasted twice | one implementation | `scripts/__tests__/profile-cli-parity.test.ts` — both CLIs produce byte-identical usage errors (drift guard); both import from `@massa-ai/shared`, zero duplicated switch logic (verified by reading both `config-cli.ts` files: no local copy of `switchProfile`) | ✅ PASS |

### P3: Claude skill sugar

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: skill drives same engine via MCP/CLI, relays report incl. restart notice | skill text instructs relaying restart notice | `skills/profile/SKILL.md` "Relaying The Result" section: "Always relay the per-host outcome and the restart notice verbatim in substance"; `scripts/generate-skill-artifacts.ts --check` clean (verified this session, exit 0) — bundled identically into all 4 hosts | ✅ PASS |

**Status**: ✅ All ACs covered. No spec-precision gaps found among numbered ACs.

---

## Edge Cases

- [x] Concurrent switches: single-flight guard, fail loud — `lock.test.ts` live-owner contention < 1000ms, `engine.test.ts:319-340` LockHeldError with no files copied.
- [x] Bundle predates variants (upgrade skew): "bundle has no variants — upgrade plugin" — `engine.test.ts:218-239`.
- [x] No installed host anywhere: `NoHostsDetectedError`, non-zero — `engine.test.ts:374-382`.
- [x] Multi-host partial failure: completed hosts stand, per-host rows, non-zero (`reportSucceeded`) — `engine.test.ts:342-372`.
- [x] Marketplace-route Claude/Codex: refused, dev-path guidance — `hosts.test.ts:86-93`, `engine.test.ts:262-273`.
- [x] Massa-ai-owned-files-only overwrite, non-owned files never touched — `engine.test.ts:98-118` (`user-notes.md` preserved).
- [x] `profile_set` behind `x-api-key` (AD-011) — `apps/tools-api/src/routes/profiles.test.ts:204-216` real-socket 401 without key.
- [ ] ⚠️ Whitespace/case-exact-match on profile name: **not directly tested**, but correct by construction — `variantDir(profile)` (`hosts.ts:73`) does a literal `path.join`, no `.trim()`/`.toLowerCase()` exists anywhere on the profile-name path from CLI/MCP/route through to `switchProfile`, so a padded/miscased name resolves to a nonexistent directory and falls through to `UnknownProfileError` by the same code path AC4 already covers. Minor test-coverage gap, not a behavior gap — flagged as a residual risk below, not a FAIL.

---

## Discrimination Sensor

Scratch isolation: `git worktree add /tmp/mps-scratch HEAD` (preferred method per validate.md); confirmed clean (`git status --porcelain` empty) both before mutation work and immediately after `git worktree remove --force` + `git worktree prune`. Real worktree HEAD (`5960839d`) unchanged throughout. Every mutation: exact-copy backup taken before editing, tests run against the mutated scratch copy only, restored by `cp` from the saved backup (never `git checkout`/`git stash`), diffed against the backup to confirm byte-exact restoration before moving to the next mutation.

| # | Mutation | File:line (scratch) | Population shown | Killed by | Verdict |
| --- | --- | --- | --- | --- | --- |
| M1 | F1: `detectRoute` treats installRoute-absent as `proceed` instead of `refuse` (guess-from-absence regression) | `hosts.ts:135` | 30 tests run (`hosts.test.ts`+`engine.test.ts`) | `hosts.test.ts` "refuses when the platform record is undefined" + `engine.test.ts` "installRoute absent refuses loud" — 3 failed | ✅ Killed |
| M2 | F2: lock stale-owner reclaim disabled (`provenDead = false`) — one SIGKILL would deadlock forever | `lock.ts:167` | 7 tests run (`lock.test.ts`) | "a lock whose owner process no longer exists...is reclaimed" + PID-reuse case — 2 failed | ✅ Killed |
| M3 | F3: OpenCode `copyVariant` normalizes to a plain file copy instead of repointing the symlink | `engine.ts:197` | 20 tests run (`engine.test.ts`) | "the active OpenCode agent stays a symlink post-switch" + "a regular file...is never clobbered" — 2 failed | ✅ Killed |
| M4 | F4/AC5: corrupt JSON silently degrades to default state instead of throwing `CorruptInstallStateError` | `state.ts:119` | 29 tests run (`state.test.ts`+`engine.test.ts`) | "throws a named CorruptInstallStateError on invalid JSON" + engine's "corrupt state fails globally" — 2 failed | ✅ Killed |
| M5 | MPS-01 AC2: `staleVariantDirs` disabled (returns `[]` always) — a removed-profile leftover directory would ship undetected | `generate-subagent-artifacts.ts:599` | 7 tests run (`generate-subagent-artifacts-variant-check.test.ts`) | "a profile-removal leftover directory is flagged stale" — 1 failed | ✅ Killed |
| M6 | MPS-05: `profile_set` tool definition deleted from `tool-defs-project.ts` (tool-count pin regression) | `tool-defs-project.ts:326` | 9 tests run (both tool-count pin files) | `TOOL_DEFINITIONS.length` assertion + 5 cascading failures once the array shrank — 6 failed | ✅ Killed |
| M7 | MPS-09/10: Cursor's skip row silently dropped from the report entirely (not just skip-processed) | `engine.ts:218` | 20 tests run (`engine.test.ts`) | "cursor never touches files and is reported skipped even when requested explicitly" + "requesting only cursor never throws" — 2 failed | ✅ Killed |

**Sensor depth**: lightweight-to-full — 7 targeted behavior-level mutations (spec calls for 1-3 default; this session ran 7 to cover every named Plan Challenge finding F1-F4 plus MPS-01/05/09 directly, since the feature spans a switch engine, a generator, and an MCP surface).
**Result**: 7/7 killed — no survivors, no equivalent/dead mutants excluded.

---

## Gate Check

| Gate | Command | Exit | Notes |
| --- | --- | --- | --- |
| Lint | `bun run lint` | 0 | oxlint, no violations |
| test:scripts | `bun run test:scripts` | 0 | 1384 TS tests / 60 files pass, 0 fail; all shell suites (plugin registry registration 47/47, plugin-auto-install 174/174, WSL 8/8, setup-local-first 26/26, PostgreSQL wizard 11/11, plus the two new model-profile shell suites) pass |
| test:plugins | `bun run test:plugins` | 0 | 96 pass, 0 fail, 8 files |
| packages/shared | `cd packages/shared && bun test` | 0 | 291 pass, 0 fail, 19 files (includes all 4 profile-switch test files: 20+10+7+9 = 46 tests) |
| mcp-client isolated | `cd apps/mcp-client && bun scripts/run-tests-isolated.ts` | 0 on retry (1st run: 1 failed group — `embedded-api-client-endpoints.test.ts` `POST web/fetch_and_index`, the documented network-flake; isolated re-run of that one file passed 97/97; full re-run of the whole suite then passed all 10 groups clean) | Documented flake, not a code defect |
| tools-api isolated | `cd apps/tools-api && bun scripts/run-tests-isolated.ts` | 0 | all 26 groups pass, incl. `profiles.test.ts` real-socket 401/200 cases |
| generate-subagent-artifacts --check | `bun scripts/generate-subagent-artifacts.ts --check` | 0 | "No drift" — includes variant-tree full-inventory diff |
| generate-skill-artifacts --check | `bun scripts/generate-skill-artifacts.ts --check` | 0 | "No drift" |
| build | `bunx turbo run build --force` (cache bypassed to get a genuine measurement, not a cached replay) | 0 | 5 buildable packages, 0 cached, 4.0s |

**Test count before feature**: not independently re-derived from a pre-feature checkout (spec's independent test count baseline was not requested and the diff range is 26 commits deep); the delta below is what the diff itself shows.
**Delta**: +46 new profile-switch engine tests (`packages/shared`), + route tests (`profiles.test.ts`, 15 cases), + tool-def/embedded-parity extensions, + 2 new generator test files (variants + variant-check, 7+15 tests), + `profile-cli-parity.test.ts` (7 tests), + shell suites `test-model-profile-installer-reapply.sh` / `test-model-profile-installer-opencode-cursor.sh`, + subagent-parity extensions (22-pair variant table + byte-equals-default assertions).
**Skipped tests**: none project-specific to this feature; one pre-existing, unrelated skip in `plugin registry registration` scenario 10 ("SKIP set MASSA_AI_TEST_REAL_CLAUDE_MD5") — a standing opt-in real-config check, not introduced by this feature.
**Failures**: none persisted; the one transient `fetch_and_index` network-flake is documented project-wide (task brief) and reproduced then cleared on isolated re-run.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — engine, hosts, lock, state, report modules each single-purpose; installers gained read-only re-apply blocks, no new write paths |
| Surgical changes | ✅ — touched files map 1:1 to the 17-task breakdown; no unrelated refactors found in the diff |
| No scope creep | ✅ — Cursor/env/runtime-live-switching/custom-profiles explicitly out of scope per spec and honored (no env var added; Cursor always skips) |
| Matches patterns | ✅ — state read-modify-write mirrors `install-skills.sh` `state_replace`; lock ports M19 semantics explicitly, not silently reinvented |
| Spec-anchored outcome check (asserted values match spec) | ✅ — see AC table above, exact status/reason/field values asserted, not just "an assertion exists" |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — engine unit tests cover every Error Handling Strategy row; `profiles.test.ts` covers 200/400/404/409/500 + real-socket 401 + content-type trap |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — spot-checked; every new test file's docstring cites an MPS-xx/design-F-finding |
| Documented guidelines followed | CLAUDE.md (isolated-runner discipline, XDG scratch-config convention not needed here since no LLM path touched, red-first sensor lesson honored per commit messages), CONTRIBUTING.md 7-step managed-harness protocol (the security-allowlist repair commit `4f534be4` is direct evidence step 6/7 was enforced, not skipped) |

---

## Requirement Traceability Update

| Requirement ID | Previous Status | New Status |
| --- | --- | --- |
| MPS-01 | Pending | ✅ Verified |
| MPS-02 | Pending | ✅ Verified |
| MPS-03 | Pending | ✅ Verified |
| MPS-04 | Pending | ✅ Verified |
| MPS-05 | Pending | ✅ Verified |
| MPS-06 | Pending | ✅ Verified |
| MPS-07 | Pending | ✅ Verified |
| MPS-08 | Pending | ✅ Verified |
| MPS-09 | Pending | ✅ Verified |
| MPS-10 | Pending | ✅ Verified |
| MPS-11 | Pending | ✅ Verified |
| MPS-12 | Pending | ✅ Verified |

(`spec.md`'s own Requirement Traceability table and `FEATURES.json`'s `notes` field should be updated by the orchestrator/main agent to reflect this verified state; this report is the evidence source for that edit.)

---

## Interactive UAT

`UAT: not applicable` — this is a backend/harness feature (MCP tools, CLI, installer scripts, generator). No UI flow or visual design judgment is involved; automated checks (AC table + discrimination sensor + gate matrix above) are sufficient per validate.md §3.

---

## Verifier Independence Statement

This validation was produced by a Verifier sub-agent independent of the three batch-builder agents and the main agent that authored T1-T17 (author ≠ verifier). No author claim (commit messages, `.specs/features/model-profile-switching/tasks.md` "Done when" annotations, or `FEATURES.json` notes) was taken on faith: every AC-table row cites a file:line re-read this session, every gate command was re-run with its own exit code captured directly by this session, and the discrimination sensor mutations were designed by this Verifier (not the candidate list's exact wording, though 4 of 7 draw from the design doc's named F1-F4 findings) and executed in a freshly created, freshly destroyed scratch git worktree, never the real tree.

---

## Residual Risks

1. **Minor test-coverage gap**: profile-name whitespace/case-exact-match (spec Edge Cases) has no dedicated unit test, though the code path is exact-match by construction (no normalization function exists anywhere between CLI/MCP/route input and `switchProfile`'s directory lookup) — the same `UnknownProfileError` path already tested for AC4 would fire. Recommend one `engine.test.ts` case asserting `switchProfile({profile: " Work "})` throws `UnknownProfileError` for completeness, not correctness.
2. **`FEATURES.json`/`spec.md` traceability fields still say "Pending"/`status: "in_progress"`** — expected at this point in the workflow (execute complete, independent validation was the last gate); the main agent should apply the Requirement Traceability Update table above and flip `status` to `complete`/`shipped` per repo convention after reading this report.
3. **mcp-client's `fetch_and_index` network-flake** is a pre-existing, project-wide documented flake (not introduced by this feature) — noted per the task brief's own instruction, does not affect the verdict.

---

## Summary

**Overall**: ✅ Ready
**Result**: PASS

**Spec-anchored check**: 22/22 numbered ACs across all 5 stories (P1×3, P2, P3) matched their spec-defined outcome with file:line evidence; 0 spec-precision gaps; 1 edge-case (whitespace/case) flagged as a minor untested-but-correct-by-construction gap, not a spec-precision gap.
**Sensor**: 7/7 mutations killed (F1, F2, F3, F4/AC5, MPS-01 AC2, MPS-05, MPS-09/10 coverage), 0 survived, 0 excluded as equivalent.
**Gate**: 9/9 gate commands green on this session's own runs (lint, test:scripts, test:plugins, packages/shared, mcp-client isolated [network-flake retry noted], tools-api isolated, generate-subagent-artifacts --check, generate-skill-artifacts --check, build [forced, uncached]).

**What works**: The switch engine (state/hosts/lock/engine/report) is a single, well-isolated implementation in `packages/shared`; every consumer (tools-api routes, MCP tool-defs + embedded client, both config-CLIs, OpenCode in-process tool, Claude skill) delegates to it rather than re-implementing; every Plan Challenge finding (F1-F4) has both a production guard and a discrimination-sensor-confirmed test; the generator's variant emission is byte-identical to single-profile emission and its `--check` catches both changed and stale-but-orphaned files; all four installers write `installRoute` and read-but-never-write `modelProfile`, preserving the single-writer invariant.

**Issues found**: none blocking. One minor test-coverage suggestion (residual risk #1 above).

**Next steps**: Main agent applies the Requirement Traceability Update to `spec.md` and `FEATURES.json` (flip MPS-01..12 to Verified, feature status to complete), optionally add the one whitespace/case unit test noted in residual risk #1, then proceed to merge/PR per user's normal workflow.
