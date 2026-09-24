# Feature: agent-runtime-drift

## Problem (measured 2026-09-21)

A directory-source marketplace install on Claude loads the plugin **live** from
the source directory (empirical: session skill base dir = `<repo>/apps/claude-plugin/skills/...`),
yet three product surfaces describe or report a stale world:

1. `agent-orchestration.md`'s per-host installed-agent path table teaches the
   **versioned cache** as the marketplace-route root — agents following it
   announce models from a stale snapshot (measured: announced glm-5.2/minimax-m3
   while the live root carried glm-5.3-flash).
2. `profile_list.bundleVersion` reads `install-state.json`'s
   `platforms.claude.plugin.version` (stale "1.56.0") instead of the live tree
   ("1.57.0").
3. `switchProfile` dry runs report `status: "switched"` — a dry run claiming the
   real run's terminal state.
4. No surface reports the host env override (`CLAUDE_CODE_SUBAGENT_MODEL`) that
   nullifies every per-agent model at runtime.
5. No one-shot drift report exists (version, profile materialization, env
   override), so every diagnosis re-derives the world by hand.

## Contract

**Components:** `packages/shared/src/profile-switch/doctor.ts` (new,
read-only report); `frontmatter.ts` (new, parser extracted from
`scripts/generate-subagent-artifacts.ts`); `engine.ts`/`report.ts`
(additive fields + `would-switch` status); `agent-orchestration.md` host table
+ S9 sensor; `apps/claude-plugin/hooks/massa-ai-hook.ts` session-start drift
line; MCP `profile_list` field passthrough.

**Inputs:** `targetHome`, injectable `env` map, `stateFilePath`, plugin key.
File reads only: `known_marketplaces.json`, `installed_plugins.json`,
`install-state.json`, live root `plugin.json` + `agents/massa-ai-*.md` +
`agent-profiles/<profile>/`.

**Outputs:** `AgentRuntimeReport` (typed, serializable); enriched
`HostProfileState` rows (`liveRoot`, `sourceVersion`, `envOverride` — additive);
`would-switch` dry-run rows; ≤2-line stdout drift line on session-start
(silent when healthy); MCP profile_list rows carrying the new fields.

## Invariants

- INV1 Doctor is read-only and offline (MPS-02) — never writes, never fetches.
- INV2 A real (non-dry) run NEVER emits `would-switch`; a dry run NEVER emits
  `switched`.
- INV3 Additive-only: existing `HostProfileState`/`SwitchReport` consumers
  compile and behave unchanged; `reportSucceeded` treats `would-switch` as
  success and `switched` exactly as before.
- INV4 Doc == resolver: the host-table example in `agent-orchestration.md`
  must equal what the resolver resolves for both routes (directory-source and
  registry-cache fallback).
- INV5 The session hook never blocks the agent (exit 0, bounded work, silent
  degrade) and never mutates anything (fix path = existing `profile_set`, not
  the hook).

## Bounds (frozen as green-on-a-hole cases)

- B1 The "directory-source loads live" premise is verified for directory
  sources on Claude only; github/git marketplaces are unverified — the doc
  states the fallback and a fixture test pins the cache fallback path
  (AC-01.1/AC-01.2 behavior), not a live-load claim for those routes.
- B2 The sensor proves doc↔resolver coherence, not Claude's own load semantics.
- B3 The hook's `model:` regex read is deliberately not the shared parser
  (hook dependency-freeze docblock); pinned by cross-side tests instead.

## Accepted risks

- R1 (T03) `HostSwitchStatus` grows one member; exhaustive `switch` consumers
  are greppable and internal (`@massa-ai/shared` is not published) — a
  negative test pins real-run behavior.
- R2 (T02) Frontmatter parser moves, generator imports it — byte-identical
  behavior pinned by existing generator tests plus new round-trip tests.

## Follow-ups (2026-09-21, same session — branch fix/agent-drift-followups)

### T1 — regeneration must respect the recorded active profile
- AC: `selectProfile` precedence = `--profile` > `MASSA_AI_MODEL_PROFILE` > install-state `modelProfile` > `hostDefaults`; an unknown name at ANY rank throws before any file is written.
- AC: `main()` threads `stateProfilesFromInstallState(state)` into `emitAll`; hosts without a recorded profile fall through to hostDefaults (fresh checkout/CI unchanged).
- Evidence (live): post-fix `generate:artifacts` emitted `claude profile: work (from install-state)` with glm-5.3-flash actives, against the operator's real state.
- AC: tests discriminate — state beats hostDefaults; flag and env beat state; unknown name throws; projection maps only hosts with a recorded profile.
- Amended (fix round, catalog-review builder, 2026-09-23): `hostDefaults` above is a stale
  name — registry v2 dropped that key, and the terminal rank is the literal `"balanced"`
  fallback. "An unknown name at ANY rank throws" is also stale as written: a follow-on fix
  (`fec25aa9`, same T1) made a stale RECORDED rank-3 profile (removed, renamed, or no longer
  supporting the host) degrade to `"balanced"` instead of throwing, since it reflects a
  historical switch this run did not request; `--profile`/`MASSA_AI_MODEL_PROFILE` still
  throw on an unknown name at their own ranks. See `validStateProfile` in
  `scripts/generate-subagent-artifacts.ts` and CLAUDE.md's model-profiles section.

### T1b — `generate:artifacts --check` must resolve state the same way a real run does
- AC: `main()` resolves `stateProfiles` from install-state ONCE, before deciding the
  `--check` branch, and threads the same value into both `runCheck` and the real emit path.
- Bug (fix round, catalog-review builder, 2026-09-23): `main()` previously read
  install-state only on the non-`--check` path, so `--check` always resolved every host to
  `"balanced"` regardless of what was actually recorded. On a machine with a recorded
  non-`"balanced"` profile, a real `generate:artifacts` run (which DOES thread state) followed
  immediately by `--check` (which did NOT) reported phantom drift comparing a state-aware
  tree against a state-blind expectation of it.
- Evidence: `scripts/__tests__/generate-subagent-artifacts.test.ts` — a structural regression
  test asserts `readStateProfiles(` is computed before the `if (check)` branch inside `main`'s
  source, plus unit coverage of `readStateProfiles` reading an arbitrary install-state path.

### T2 — `massa-ai-config doctor [--fix] [--host <h>] [--target <dir>]`
- AC: both CLIs print the doctor report (route, three versions, per-role models, staleness, env override); `--target` is the test/home seam (bootstrap convention).
- AC: `--fix` re-runs the profile switch for the RECORDED active profile (never a flag), then re-reports; no recorded profile → loud error, zero mutation; failed switch → non-zero exit.
- AC: version drift and env overrides are report-only — their remedies live outside this CLI's write scope. The session-start hook remains read-only (INV5 unchanged).
- Skipped check: the opencode-plugin suite crashes on origin/main WITHOUT this change-set (stash-verified baseline) — the mirrored CLI is import-smoked, not suite-tested; record as environmental, not a pass.
- Amended (fix round, catalog-review builder, 2026-09-23): `--host`, when omitted, defaulted
  to `undefined` rather than `"claude"`; `switchProfile`/`runtimeDriftReport` treat an absent
  host as "every host", so an unqualified `doctor --fix` reset codex/cursor/opencode to
  whatever profile happened to be recorded for claude, and `syncGeneratedVariants` never
  received `--target` so it still touched the real home even under the test seam. `--host`
  now defaults to `"claude"` and is threaded through both calls consistently; `--target` is
  threaded into `syncGeneratedVariants` too. `runtimeDriftReport` gained a `host` parameter
  (default `"claude"`) — since only claude has a marketplace/plugin-version concept, a
  non-claude host gets a lighter, honest report (real recorded profile, env override,
  `route: "unresolved"`) rather than silently reporting claude's data under the wrong label.
