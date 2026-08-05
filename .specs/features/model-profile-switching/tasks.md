# Model Profile Switching — Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `massa-ai` skill: activate it by name and follow its Execute flow and Critical Rules. If the skill cannot be activated, STOP and tell the user.

**Design**: `.specs/features/model-profile-switching/design.md`
**Status**: Draft (pending user approval + batch-worker decision)

---

## Project Testing Guidelines Scan

Guidelines found (cited, current source): `CLAUDE.md` (isolated-runner rules, 5 s timeout, XDG scratch-config rule, red-first sensor lesson, coverage floor via `test:coverage`), `CONTRIBUTING.md` (7-step managed-harness protocol — this feature touches skills/plugins/installers, so it applies; measurement discipline), `scripts/__tests__/` + `scripts/tests/` conventions (TS + shell suites via `bun run test:scripts`), route tests beside `apps/tools-api/src/routes/*.ts`, mcp-client isolated runner, `.oxlintrc.json` (correctness-only lint gate). Existing-test floor sampled from: `scripts/__tests__/model-profiles.test.ts`, `install-state-plugin-version.test.ts`, `subagent-parity.test.ts`, `apps/mcp-client/src/__tests__/embedded-api-client-endpoints.test.ts`.

## Test Coverage Matrix

> Generated from codebase + guidelines. Guidelines found: `CLAUDE.md`, `CONTRIBUTING.md`, existing suites named above.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Switch engine (`packages/shared/src/profile-switch/`) | unit | All branches; 1:1 to MPS-02/03/09/10 ACs; every Edge Cases row incl. F1 route-absent, F2 stale lock, F3 symlink repoint | `packages/shared/src/**/__tests__/*.test.ts` (package convention) | `cd packages/shared && bun test` |
| Generator variant emission | unit (scripts) | Byte-equality round-trip per sampled (host, profile); `--check` red on deleted AND stale variant file; active-equals-default | `scripts/__tests__/*.test.ts` | `bun run test:scripts` |
| Parity/package guards | unit (scripts) | 17 files × (host, supported profile); `agent-profiles` in `requiredTopLevel`; state round-trip both new fields | `scripts/__tests__/*.test.ts` | `bun run test:scripts` |
| Installers (re-apply, installRoute, F3 upgrade case) | shell suite | Recorded profile honored; missing-profile loud fallback; switch→upgrade agent still updates; route recorded | `scripts/tests/*.sh` | `bun run test:scripts` |
| tools-api routes | route test (real HTTP assertions — text/plain trap) | Happy + auth-401 + every MPS-09 error surfaced via route | beside route: `apps/tools-api/src/routes/profiles.test.ts` | `cd apps/tools-api && bun scripts/run-tests-isolated.ts` |
| MCP tool-defs + embedded parity | unit (isolated runner) | Tool count pins re-measured then updated; both endpoints behavior-parity HTTP vs embedded | `apps/mcp-client/src/__tests__/` | `cd apps/mcp-client && bun scripts/run-tests-isolated.ts` |
| OpenCode in-process tool + config-clis | unit | Tool present + delegates; both CLIs expose identical subcommand surface | `apps/opencode-plugin/__tests__/`, package suites | `bun run test:plugins` |
| Skill + docs artifacts | generator check | `generate-skill-artifacts.ts --check` clean after regen | — | build gate |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Single-file task close | `bun test <file>` (or `XDG_CONFIG_HOME=$(mktemp -d) bun test <file>` where config-sensitive) |
| Full | Package-touching task close | package's isolated runner / `bun run test:plugins` / `bun run test:scripts` as per matrix row |
| Build | Phase close + close-out | `bun run build && bun run lint && bun run test:scripts && bun scripts/generate-subagent-artifacts.ts --check && bun scripts/generate-skill-artifacts.ts --check` |

New-sensor rule (every task adding an assertion): observe it red on a deliberate fault first; record the red in the commit message or task note.

---

## Execution Plan

Phases sequential; tasks sequential within a phase.

- **Phase 1 — Engine (shared)**: T1 → T2 → T3 → T4
- **Phase 2 — Generator + bundles**: T5 → T6 → T7
- **Phase 3 — Installers + state guards**: T8 → T9 → T10
- **Phase 4 — Surfaces (MCP/CLI/OpenCode)**: T11 → T12 → T13 → T14
- **Phase 5 — Skill, docs, close-out**: T15 → T16 → T17

17 tasks → packs into 3 batch-budgeted workers (P1 | P2+P3 | P4+P5) — batch offer required before Execute.

## Task Breakdown

### T1: install-state read/modify-write module
**Task ID**: TASK-001
**What**: `state.ts` — typed read/validate/merge-write of `install-state.json` preserving unknown fields; `modelProfile` + `installRoute` types; corrupt/unwritable → named errors.
**Where**: `packages/shared/src/profile-switch/state.ts` + `__tests__/state.test.ts`
**Depends on**: none
**Reuses**: `state_replace` semantics (`scripts/install-skills.sh`) as behavioral reference
**Requirement**: MPS-03, MPS-09
**Tests**: unit
**Gate**: quick
**Done when**: round-trip preserves every existing v2 field byte-for-byte; corrupt JSON → named error (observed red first); no writes on validation failure.
**Commit**: `feat(shared): profile-switch state module`

### T2: host path table + route detection
**Task ID**: TASK-002
**What**: `hosts.ts` — per-host active/variant path resolution (design table), project-local root overrides, Cursor always-skip row, route rule: `installRoute==="marketplace"` or absent → refuse (F1), `"file"` → proceed.
**Where**: `packages/shared/src/profile-switch/hosts.ts` + tests
**Depends on**: T1
**Requirement**: MPS-02, MPS-09, MPS-10
**Tests**: unit
**Gate**: quick
**Done when**: route-absent fixture refuses with named error (test written first, red); Cursor returns skip-with-reason; paths match design table exactly.
**Commit**: `feat(shared): profile-switch host table + route detection`

### T3: single-flight lock with stale-owner reclaim
**Task ID**: TASK-003
**What**: `lock.ts` — exclusive lock beside state file; owner PID + process start identity; proven-dead reclaim (F2, M19 semantics ported).
**Where**: `packages/shared/src/profile-switch/lock.ts` + tests
**Depends on**: T1
**Requirement**: MPS-02 (A10)
**Tests**: unit
**Gate**: quick
**Done when**: live-owner contention fails loud; dead-owner lock reclaimed (kill-mid-switch simulation red-first against a no-reclaim stub).
**Commit**: `feat(shared): profile-switch single-flight lock`

### T4: switch engine + report
**Task ID**: TASK-004
**What**: `engine.ts`/`report.ts` — `listProfiles`, `switchProfile` (dry-run, host filter, deterministic order, copies-first-state-last, opencode symlink **repoint**, massa-ai-owned-files-only overwrite, per-host atomicity, restart notice, idempotent re-run).
**Where**: `packages/shared/src/profile-switch/{engine,report}.ts` + tests; export from shared index
**Depends on**: T1, T2, T3
**Requirement**: MPS-02, MPS-09, MPS-10
**Tests**: unit (temp-dir fixtures)
**Gate**: full (`cd packages/shared && bun test`)
**Done when**: every Error Handling Strategy row has a test; state written only after copies; symlink stays symlink post-switch; unknown profile lists available; dry-run changes nothing.
**Commit**: `feat(shared): profile switch engine`

### T5: generator per-profile variant emission
**Task ID**: TASK-005
**What**: `emitAll` loop over `hostsSupportedBy` profiles → `apps/<host>-plugin/agent-profiles/<p>/`; active `agents/` byte-equals default variant.
**Where**: `scripts/generate-subagent-artifacts.ts` + `scripts/__tests__/` round-trip test
**Depends on**: none (parallel-safe after P1 but sequenced here)
**Requirement**: MPS-01
**Tests**: unit (scripts)
**Gate**: full (`bun run test:scripts`)
**Done when**: sampled (host, profile) variant byte-equals a single-profile emission; unsupported (host, profile) emits nothing.
**Commit**: `feat(scripts): emit per-profile agent variants`

### T6: `--check` full-inventory variant diff
**Task ID**: TASK-006
**What**: extend `runCheck`/`diffHost` over variant dirs, stale-entry detection included.
**Where**: `scripts/generate-subagent-artifacts.ts` + tests
**Depends on**: T5
**Requirement**: MPS-01, MPS-12
**Tests**: unit (scripts)
**Gate**: full
**Done when**: red observed on (a) deleted variant file, (b) stale extra variant file, then green on clean tree.
**Commit**: `feat(scripts): variant drift detection in --check`

### T7: regenerate bundles + extend parity/package guards
**Task ID**: TASK-007
**What**: regenerate all bundles (checked-in variant trees); re-measure then update exactly-17 assertions table-driven over (host, supported profile); add `agent-profiles` to `verify-package-contents.ts` `requiredTopLevel`.
**Where**: `apps/*-plugin/agent-profiles/**` (generated), `scripts/__tests__/subagent-parity.test.ts`, `scripts/verify-package-contents.ts`
**Depends on**: T5, T6
**Requirement**: MPS-01, MPS-12
**Tests**: unit (scripts)
**Gate**: build
**Done when**: `--check` clean; parity green; package-contents red-first (scratch removal) then green; figures in tests re-measured in-session, not taken from the packet.
**Commit**: `feat(plugins): ship per-profile agent variant bundles`

### T8: claude + codex installer re-apply + route recording
**Task ID**: TASK-008
**What**: both `install.sh`: write `installRoute` on every install; install variant tree to host variant path; copy active set from recorded profile's variant when present; loud fallback when recorded profile missing from bundle.
**Where**: `apps/claude-plugin/install.sh`, `apps/codex-plugin/install.sh`, shell suite case(s)
**Depends on**: T7
**Requirement**: MPS-04, design F1
**Tests**: shell suite (scratch `$TARGET_HOME`)
**Gate**: full (`bun run test:scripts`)
**Done when**: recorded-profile honored; fallback line printed; `installRoute` present post-install; never writes `modelProfile`.
**Commit**: `feat(installers): profile re-apply + install route recording (claude, codex)`

### T9: opencode installer re-apply + F3 upgrade case; cursor route recording
**Task ID**: TASK-009
**What**: opencode `install.sh` variant tree install + recorded-profile symlink targets; cursor `install.sh` records `installRoute` only (switch always skips cursor). Shell case: switch → re-run install.sh → agent file still updates (F3).
**Where**: `apps/opencode-plugin/install.sh`, `apps/cursor-plugin/install.sh`, shell suite
**Depends on**: T8
**Requirement**: MPS-04, design F3
**Tests**: shell suite
**Gate**: full
**Commit**: `feat(installers): profile re-apply (opencode) + route recording (cursor)`

### T10: state round-trip guards
**Task ID**: TASK-010
**What**: extend `install-state-plugin-version.test.ts` (+ sibling shell assertions if that's where the writer lives): `state_replace` and every `record_plugin_version()` preserve `modelProfile` and `installRoute`.
**Where**: `scripts/__tests__/install-state-plugin-version.test.ts`, possibly `scripts/tests/`
**Depends on**: T8, T9
**Requirement**: MPS-03
**Tests**: unit (scripts)
**Gate**: full
**Done when**: each preservation case observed red against a field-dropping mutation first.
**Commit**: `test(installers): install-state round-trip guards for profile fields`

### T11: tools-api profiles routes
**Task ID**: TASK-011
**What**: `routes/profiles.ts` — GET `/api/v1/profiles`, POST `/api/v1/profiles/switch`, delegating to shared engine; behind auth; JSON responses asserted over real HTTP.
**Where**: `apps/tools-api/src/routes/profiles.{ts,test.ts}`, `index.ts` registration
**Depends on**: T4
**Requirement**: MPS-05
**Tests**: route
**Gate**: full (tools-api isolated runner)
**Done when**: unauthenticated 401 on a registered route; MPS-09 errors surface as structured JSON; content-type is application/json.
**Commit**: `feat(tools-api): profile list/switch routes`

### T12: MCP tool-defs + proxy mapping + embedded parity
**Task ID**: TASK-012
**What**: `profile_list`/`profile_set` in `tool-defs-project.ts` (local trust note in description); proxy endpoint map; embedded client `case`s calling engine; re-measure tool-count pins (52 expected) then update both count tests; extend both parity suites.
**Where**: `apps/mcp-client/src/{tool-defs/tool-defs-project.ts,call-tool-proxy.ts,embedded-api-client.ts}`, `src/__tests__/`
**Depends on**: T11
**Requirement**: MPS-05
**Tests**: unit (isolated runner)
**Gate**: full
**Commit**: `feat(mcp-client): profile_list + profile_set tools`

### T13: `profile` subcommand in both config-CLIs
**Task ID**: TASK-013
**What**: `profile list|show|set <name> [--host h] [--dry-run]` in mcp-client and opencode-plugin `config-cli.ts`, both delegating to shared engine; cross-CLI surface-parity test.
**Where**: both `config-cli.ts` + their test files
**Depends on**: T4
**Requirement**: MPS-06
**Tests**: unit
**Gate**: full (`bun run test:plugins` + mcp-client runner)
**Commit**: `feat(cli): profile subcommand in both config CLIs`

### T14: OpenCode in-process profile tool
**Task ID**: TASK-014
**What**: one `profile` entry in the plugin `tool({...})` block; re-measure block count first and reconcile the 13-vs-14 CLAUDE.md figure in the same commit.
**Where**: `apps/opencode-plugin/src/index.ts`, `__tests__/`, `CLAUDE.md` (count line)
**Depends on**: T12, T13
**Requirement**: MPS-07
**Tests**: unit
**Gate**: full (`bun run test:plugins`)
**Commit**: `feat(opencode-plugin): in-process profile tool`

### T15: Claude profile skill + artifact regen
**Task ID**: TASK-015
**What**: hand-authored profile skill under `skills/`; regenerate skill bundles; `--check` clean.
**Where**: `skills/` + generated `apps/*-plugin/skills/**`
**Depends on**: T13
**Requirement**: MPS-08
**Tests**: generator check
**Gate**: build
**Commit**: `feat(skills): profile switch skill`

### T16: registry-spec amendment + docs + CHANGELOG
**Task ID**: TASK-016
**What**: amend `model-profile-registry/spec.md` non-goal clause in place (reason + pointer, MPS-11); CLAUDE.md agent-harness section note; `.env.example` untouched (no new env); CHANGELOG `[Unreleased]` `### Added`.
**Where**: `.specs/features/model-profile-registry/spec.md`, `CLAUDE.md`, `FEATURES.md`, `CHANGELOG.md`
**Depends on**: T14
**Requirement**: MPS-11
**Tests**: none (docs — build gate only)
**Gate**: build
**Commit**: `docs: amend registry non-goal for switch-time re-render + changelog`

### T17: close-out
**Task ID**: TASK-017
**What**: STATE.md Decisions append (proposed AD — re-check highest ID at append time), FEATURES.json phases, HANDOFF.md, full build gate, dispatch independent validation.
**Where**: `.specs/**`
**Depends on**: T16
**Requirement**: all
**Tests**: none (docs/state — build gate only)
**Gate**: build
**Commit**: `docs(specs): model-profile-switching Execute close-out`

---

## Phase Execution Map

```
Phase 1: T1 ──→ T2 ──→ T3 ──→ T4
Phase 2: T5 ──→ T6 ──→ T7
Phase 3: T8 ──→ T9 ──→ T10
Phase 4: T11 ──→ T12 ──→ T13 ──→ T14
Phase 5: T15 ──→ T16 ──→ T17
```

(T2/T3 both depend only on T1 and could reorder; sequenced for determinism. T5 has no P1 dependency; T11/T13 depend on T4.)

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1–T4 | one module each + its tests | ✅ |
| T5, T6 | one generator behavior each | ✅ |
| T7 | regen (generated output) + 2 guard files — cohesive: the guards exist to pin exactly this regen | ✅ (watched: if guard edits balloon, split) |
| T8, T9 | two installers each, same 5-line convention — cohesive per design Component 3 | ✅ |
| T10–T15 | one surface each | ✅ |
| T16, T17 | docs / close-out | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram | Status |
| --- | --- | --- | --- |
| T1 | none | phase head | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T1 | T2→T3 arrow is sequencing only; body dep T1 backward — allowed (deps point backward) | ✅ |
| T4 | T1,T2,T3 | chain | ✅ |
| T5 | none | phase head (after P1 by phase order) | ✅ |
| T6 | T5 | T5→T6 | ✅ |
| T7 | T5,T6 | chain | ✅ |
| T8 | T7 | phase order | ✅ |
| T9 | T8 | chain | ✅ |
| T10 | T8,T9 | chain | ✅ |
| T11 | T4 | backward cross-phase | ✅ |
| T12 | T11 | chain | ✅ |
| T13 | T4 | backward | ✅ |
| T14 | T12,T13 | chain | ✅ |
| T15 | T13 | backward | ✅ |
| T16 | T14 | phase order | ✅ |
| T17 | T16 | chain | ✅ |

No forward dependencies. ✅

## Test Co-location Validation

| Task | Layer | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1–T4 | engine | unit | unit | ✅ |
| T5, T6 | generator | unit (scripts) | unit (scripts) | ✅ |
| T7 | guards | unit (scripts) | unit (scripts) | ✅ |
| T8, T9 | installers | shell suite | shell suite | ✅ |
| T10 | guards | unit (scripts) | unit (scripts) | ✅ |
| T11 | route | route test | route test | ✅ |
| T12 | tool-defs/embedded | unit (isolated) | unit (isolated) | ✅ |
| T13, T14 | CLI/plugin | unit | unit | ✅ |
| T15 | skill | generator check | generator check | ✅ |
| T16, T17 | docs | none (build) | none (build) | ✅ |

No violations. ✅

## MCP And Skill Question

massa-ai MCP server unreachable this session (recorded); standard tools + `massa-ai` skill flow only. No other MCP materially changes implementation or verification. Awaiting user override if any.
