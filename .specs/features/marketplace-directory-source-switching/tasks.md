# Marketplace Directory-Source Switching — Tasks

Contract: `spec.md` · Design: `design.md`.
Sizing: **3 Phases = 6 Tasks.**

---

## Phase 1 = 2 Tasks — resolution

### T1 — directory-source resolution in `claude-marketplace.ts`

- Requirements: MDS-01 (AC-01.1 … AC-01.5)
- Write set: `packages/shared/src/profile-switch/claude-marketplace.ts`,
  `packages/shared/src/profile-switch/__tests__/claude-marketplace.test.ts`
- Do: add the directory branch per design D1, ahead of the existing
  `installed_plugins.json` path. Marketplace name from the plugin key's
  right-hand side. Every failure resolves `null`, never a throw, and never a
  silent demotion to the cache branch.
- Gate: `bun test packages/shared/src/profile-switch/__tests__/claude-marketplace.test.ts`
- Done when: a staged fixture with a directory source resolves to the composed
  live root; a remote source still resolves to `installPath`; and each of the
  five failure modes in AC-01.3 has its own case. Prove RED by reverting the
  branch — the directory case must fail, the remote case must not.

### T2 — retire the stale codex refusal

- Requirements: MDS-02 (AC-02.1 … AC-02.3)
- Write set: `packages/shared/src/profile-switch/hosts.ts`,
  `packages/shared/src/profile-switch/__tests__/hosts.test.ts`
- Do: delete the codex marketplace refusal branch; keep the absent-route
  refusal untouched. Add the source-level assertion that no refusal reason in
  the module cites checkout dirtiness.
- Gate: `bun test packages/shared/src/profile-switch/__tests__/hosts.test.ts`
- Done when: codex marketplace proceeds, absent route still refuses with the
  installer guidance, and the phrase sensor is mutation-proved by restoring the
  old reason string.

---

## Phase 2 = 2 Tasks — the regenerate path

### T3 — run every generator `generate:artifacts` names

- Requirements: MDS-03 (AC-03.1, AC-03.2, AC-03.4)
- Write set: `apps/tools-api/src/routes/model-registry-stream.ts`,
  `apps/tools-api/src/routes/model-registry-stream.test.ts`
- Do: derive the generator list from `package.json`'s `generate:artifacts`
  script and spawn each in order; the terminal `done` carries the first
  non-zero exit and names the failing generator.
- Gate: `cd apps/tools-api && bun test src/routes/model-registry-stream.test.ts`
  (one file per invocation — see the gate note below)
- Done when: a test derives the expected generator set from `package.json` and
  asserts both are spawned; a failing first generator is reported by name and
  does not report success.

### T4 — skills reach each host's installed location

- Requirements: MDS-03 (AC-03.3)
- Write set: `apps/tools-api/src/routes/model-registry-stream.ts` + its test
- Do: emit a per-host frame for the skills step in the existing frame
  vocabulary. Do not invent a new reporting shape.
- Gate: as T3
- Done when: the frame is asserted per host, and the Web UI's existing stream
  consumer is checked to tolerate the new frame type rather than assumed to —
  `runRegenerateStream` ignores unknown `event.type` values, and that must be
  confirmed by reading it, not by hoping.

---

## Phase 3 = 2 Tasks — measurement and close-out

### T5 — measure the other three hosts

- Requirements: MDS-04 (AC-04.1, AC-04.2)
- Write set: `.specs/features/marketplace-directory-source-switching/validation.md`
- Do: for codex, cursor and opencode, determine what the host actually loads
  and what the engine writes, and record both with the command that produced
  each. "No defect" is a finding and needs its evidence like any other.
- Gate: the measurements are commands with recorded output, not assertions.
- Done when: each host has a row, and any host with the same defect class is
  either fixed here or recorded as out-of-scope with its reason.

### T6 — close-out

- Write set: `.specs/` artifacts + `CHANGELOG.md`
- Do: `validation.md` (independent verification writes the verdict), STATE.md,
  HANDOFF.md, FEATURES.json, and a `### Fixed` entry under `[Unreleased]`
  naming the user-visible symptom.
- Gate: `bun skills/massa-ai/scripts/check_specs_delivered.ts marketplace-directory-source-switching --root .`
- Done when: exit 0, committed before the first push.

---

## Test Coverage Matrix

| Requirement | Sensor | Task |
| --- | --- | --- |
| MDS-01 | directory / remote / 5 failure modes | T1 |
| MDS-02 | codex proceeds; absent route refuses; phrase sensor | T2 |
| MDS-03 | generator set derived from `package.json`; per-host skills frame | T3, T4 |
| MDS-04 | recorded per-host measurement | T5 |

## Gate Check Commands

```bash
bun run lint
bun run type-check
bun test packages/shared/src/profile-switch/__tests__/claude-marketplace.test.ts
bun test packages/shared/src/profile-switch/__tests__/hosts.test.ts
cd apps/tools-api && bun test src/routes/model-registry-stream.test.ts
bun run test:scripts
```

**One file per `bun test` invocation for `apps/tools-api`.** `--filter` is
core-only and rejected by that package's wrapper, and listing several files
after `bun test` shares a process — a measured false-failure source in this
repo (`logs` + `events` report 49/1 together, 51/0 and 8/0 apart).

**A fresh worktree needs `bun run build`, not just `bun install`**, or every
tools-api suite fails identically with `Cannot find module '@massa-ai/core'`.

**`packages/shared` runs plain `bun test`** — it is not on the isolation runner.

## Dependencies

T1 → T2 (independent, but both land before T5's measurement); T3 → T4;
T5 after T1-T4; T6 last.
