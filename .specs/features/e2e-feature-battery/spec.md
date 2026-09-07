# E2E Feature Battery — Specification

Slug: `e2e-feature-battery`. Branch: `test/e2e-feature-battery`.
Source: plan-mode plan `~/.claude/plans/quais-seriam-os-cen-rios-parsed-magpie.md`
("Bateria E2E por feature — massa-ai", 6 Phases = 21 Tasks).

## Problem

The live-stack E2E suite could not be started from anything in this repository, and had
only ever been executed in one configuration: a single embedding profile, auth off, the
whole repository as its corpus. Three consequences, all measured rather than inferred:

1. **No reproducible bring-up.** The four environment pins `_helpers.ts` requires together
   are enforced by a fail-closed guard that throws before the first HTTP call. The only
   automated provisioning of PostgreSQL / Ollama / Tools API lived inside
   `packages/core/src/__tests__/e2e/23.owned-destructive.test.ts`, reachable only by running
   that one suite. Every other file assumed a stack somebody had started by hand.
2. **No reproducible corpus.** The commit-locked fixture the runbook depends on was built by
   `scripts/prepare-qwen-e2e-fixture.ts`, a file with no history in any revision.
3. **Untested surfaces read as covered.** `COVERAGE.md`'s command block named two files
   deleted in `5d43a96f`, so the documented standard sequence could not execute as written.

## Requirements

### Phase 0 — bring-up, fixture, baseline (delivered)

- **FR-01** A committed generator builds the sparse E2E corpus deterministically, as a git
  repository with a fixed commit identity, so its SHA is a pure function of content.
  `resolveSharedProfileIdentity` (`_helpers.ts:151-163`) runs `git rev-parse HEAD` in
  `PROJECT_PATH` and mixes the result into the shared-index identity; a drifting fixture
  therefore silently re-indexes.
- **FR-02** A committed script owns the three dedicated services (PostgreSQL `:5433`,
  Ollama `:11435`, Tools API `:3334`) with `up`/`down`/`status`/`restart-api`/`env` and the
  five profiles `default`, `auth`, `hooks-off`, `scheduler-on`, `llm-on`. It never touches
  the developer's own `:3333` / `:5432` / `:11434`.
- **FR-03** `env` emits all four fail-closed pins together. Emitting a subset makes every
  guarded suite throw before its first HTTP call.
- **FR-04** Stale documentation anchors are repaired: `COVERAGE.md`'s command block and
  deleted-file rows, `turbo.json` `passThroughEnv`, `FEATURES.md`.
- **FR-05** A measured baseline of the existing suite is recorded. No figure in this feature
  is taken from `COVERAGE.md` or `.specs/`; both are already proven stale.

### Phases 1–5 — coverage expansion (not started)

- **FR-06** Tier A closes the core gaps in six new suites: observability (recovering the
  scope of the deleted `12.observability.test.ts`), scheduler under `scheduler-on`, auth /
  config / cache under `auth`, hooks / handoffs / proposals under `hooks-off`, the scenarios
  an audit found missing behind rows marked OK, and LLM features under `llm-on` behind its
  own `RUN_E2E_LLM=1` gate, never in the default aggregate.
- **FR-07** Tier B covers the host harness: `install-harness.sh` into a scratch `HOME`,
  the installed command and sub-agent inventories per host, profile switching end to end
  with no mock of the switch engine, and the root `install.sh`, which has zero executed
  coverage today.
- **FR-08** Tier C covers the Admin Portal in a real browser via `@playwright/test`.
- **FR-09** Tier D covers the Claude Code CLI surface, splitting credential-free cases from
  credentialed ones behind `RUN_CLAUDE_E2E=1`.
- **FR-10** Tier A is executed as a **profile matrix**, not a single run. The report is per
  tier and per profile: measured pass / fail / skip and duration, plus an explicit list of
  what was left out and why.

## Acceptance Criteria

- **AC-01** `bun scripts/prepare-e2e-fixture.ts` fails closed on two self-checks: every path
  a suite addresses by name exists, and every needle anchor resolves to exactly one location
  (the resolver throws on zero and on two-or-more alike). Both observed red before trusted.
- **AC-02** `e2e-stack.sh` refuses any port whose listener it does not own, re-runs database
  provisioning on every `up`, and asserts after startup that the dedicated API reached
  `:11435` and `massa_ai_test` on `:5433`. That last assertion was proven red by forcing
  `OLLAMA_BASE_URL` at the shared instance.
- **AC-03** The full 16-file sequence plus `17.cleanup-verify.test.ts` runs green against a
  stack brought up only by `e2e-stack.sh`, measured with no concurrent session holding the
  same checkout or the same stack.
- **AC-04** Every test repaired in Phase 0 asserts a contract the product actually has, and
  each repair is at least as strict as what it replaces.
- **AC-05** (Phases 1–5) Each new suite declares its profile, its gate variable, and its
  skips. A skip is a declared, reasoned line — never a silent pass.

## Out of Scope

- Quoting a suite result measured while another session shared the checkout or the stack.
- Any figure sourced from `COVERAGE.md` or `.specs/` rather than from a run in this feature.
- CI execution of the live-stack suite. It stays a local, opt-in gate.

## Verification Approach

Deterministic, in the state it ships in: the 16-file sequence plus `17.cleanup-verify` from
the feature's own worktree, against a stack started by `e2e-stack.sh` from that same
worktree, with the fixture verified at its expected commit SHA first.
