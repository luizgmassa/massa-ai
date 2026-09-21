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
