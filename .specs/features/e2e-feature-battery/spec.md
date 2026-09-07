# E2E Feature Battery — Specification

Slug: `e2e-feature-battery`. Branch: `test/e2e-feature-battery`.
Source: plan-mode plan `~/.claude/plans/quais-seriam-os-cen-rios-parsed-magpie.md`
("Bateria E2E por feature — massa-ai", originally 6 Phases = 21 Tasks).

Re-specified 2026-09-07 to **7 Phases = 21 active Tasks plus 4 deferred**, after a read-only
feasibility sweep falsified premises this document had recorded as fact. Every amendment
below is dated and names the evidence that forced it. Phases 0 and 1 are delivered.

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
  six profiles `default`, `auth`, `hooks-off`, `scheduler-on`, `scheduler-fast`, `llm-on`.
  It never touches the developer's own `:3333` / `:5432` / `:11434`. Amended 2026-09-07:
  shipped with five; `e652b914` added `scheduler-fast` so a scheduler job fires inside a
  suite run. Definition at `e2e-stack.sh:146`.
- **FR-03** `env` emits all four fail-closed pins together. Emitting a subset makes every
  guarded suite throw before its first HTTP call.
- **FR-04** Stale documentation anchors are repaired: `COVERAGE.md`'s command block and
  deleted-file rows, `turbo.json` `passThroughEnv`, `FEATURES.md`.
- **FR-05** A measured baseline of the existing suite is recorded. No figure in this feature
  is taken from `COVERAGE.md` or `.specs/`; both are already proven stale.

### Phase 1 — Tier A coverage expansion (delivered)

- **FR-06** Tier A closes the core gaps in six new suites: observability (recovering the
  scope of the deleted `12.observability.test.ts`), scheduler under `scheduler-on` and
  `scheduler-fast`, auth / config / cache under `auth`, hooks / handoffs / proposals under
  `default` and `hooks-off`, the scenarios an audit found missing behind rows marked OK, and
  LLM features under `llm-on` behind its own `RUN_E2E_LLM=1` gate, never in the default
  aggregate. Delivered across `13d07927..8d54762c`.

### Phase 1b — the product defects the battery found (added 2026-09-07)

- **FR-11** A defect the battery exposes is fixed in the product, not absorbed by the
  sensor. Each of the three below is repaired at its source, and no KNOWN RED block is
  rewritten to accommodate a fix — all three already assert correct behaviour, so the
  product change alone turns them green.
  - `EB-MCP-3`: `GET /api/v1/workspace/list` hand-rolls a projection
    (`workspace.ts:111-127`) that diverges from `ListProjectsTool` (`list_projects.ts:44-64`)
    on `filter`, on per-workspace `createdAt`/`updatedAt`, and on `status` validation. This
    contradicts the parity contract stated at `embedded-api-client.ts:10-16`.
  - `EB-SCH-3b`: `Scheduler.status()` (`scheduler.ts:519-536`) drops four fields that
    `fireJob` (`:489-500`) maintains and persists, and `dashboard.ts:39-40` then writes
    `lastSuccessAt: null` / `consecutiveFailures: 0` as literals. A job failing every tick is
    indistinguishable over HTTP from a healthy one.
  - `EB-SCH-6`: `nextRunAt` is recomputed as `now + intervalMs` across an API restart.

### Phases 2–5 — remaining tiers (re-specified 2026-09-07)

- **FR-07** Tier B covers the host harness: `install-harness.sh` into a scratch `HOME`, the
  installed command and sub-agent inventories per host, and the root `install.sh`, which has
  zero executed coverage today. **Amended:** the oracle
  (`scripts/verify-harness-install.ts`) must first gain a host-detection field, because it
  emits 24 fixed rows with no detection concept and an absent host is therefore
  indistinguishable from a broken install. Profile switching is **cut** from this tier: it is
  already asserted end to end against the real installers in
  `test-model-profile-installer-opencode-cursor.sh:5-17` and `-reapply.sh:5-16`, plus seven
  unit suites in `packages/shared/src/profile-switch/__tests__/`.
- **FR-08** Tier C covers the Admin Portal in a real browser via `@playwright/test`.
  **Deferred 2026-09-07**, specified and not built, to be delivered as originally scoped.
- **FR-09** Tier D covers the Claude Code CLI surface. **Reduced 2026-09-07** to the
  credential-free group; the credentialed group and the eval harness are deferred. The
  original wording assumed a `--max-cost-usd` ceiling that does not exist outside
  `claude plugin eval`, leaving the credentialed group with no cost bound at all.
- **FR-10** Tier A is executed as a **profile matrix**, not a single run. The report is per
  tier and per profile: measured pass / fail / skip and duration, plus an explicit list of
  what was left out and why.
- **FR-12** A reported pass / fail / skip triple carries the **gate vector** that produced
  it. Suites 25–30 decide what executes from 48 runtime probes over ambient machine state,
  and stack state lives at the machine-global path `/tmp/massa-ai-e2e-stack`. Without the
  vector, a differing triple cannot separate a wrong figure from a differently provisioned
  stack.

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
- **AC-06** (Phase 1b) Each of the three defects is fixed at its source and carries a
  deterministic sensor that runs without the live stack, verified red against a deliberate
  mutation before it is trusted. No KNOWN RED block is widened, and no `dropKeys` list grows
  to absorb a divergence.
- **AC-07** (Phases 1b, 2, 5) Every quoted pass / fail / skip triple is accompanied by the
  gate vector of the run that produced it, and the after-fix figure is re-derived **per
  profile** with the skip population held constant. `EB-SCH-3b` is visible only under
  `SCHEDULER_FAST` and `EB-SCH-6` only under `RESTART_READY`, so a single aggregate cannot
  attribute either flip.
- **AC-08** (Phase 2) Tier B's assertions do not invert between this machine and CI. Under a
  scratch `HOME` the installer's host detection collapses to `command -v`, which yields four
  hosts here and zero in CI; the suite states which of the two existing strategies it uses —
  seeding the config dirs (`test-install-harness-cli.sh:62-65`) or scrubbing `PATH`
  (`test-plugin-auto-install.sh:6-9`).

## Out of Scope

- Quoting a suite result measured while another session shared the checkout or the stack, or
  measured on a host whose 1-minute load average was above 6.
- Quoting a pass / fail / skip triple without the gate vector that produced it.
- Any figure sourced from `COVERAGE.md` or `.specs/` rather than from a run in this feature.
- CI execution of the live-stack suite. It stays a local, opt-in gate.
- Tier C in this delivery (deferred 2026-09-07, specified in `tasks.md` Phase 3).
- Tier D's credentialed group and eval harness (deferred 2026-09-07). No task in this
  delivery spends API credits.
- Rebuilding profile-switch coverage that `test-model-profile-installer-*.sh` and the seven
  `profile-switch/__tests__/` suites already provide.
- The two uncommitted working-tree changes that predate every session on this branch —
  `.gitignore` adding `.ralphy/` and `.specs/lessons.json` removing L-002 through L-005.
  They are the user's to decide and are declared in the measured state rather than touched.

## Verification Approach

Deterministic, in the state it ships in: the 16-file sequence plus `17.cleanup-verify` from
the feature's own worktree, against a stack started by `e2e-stack.sh` from that same
worktree, with the fixture verified at its expected commit SHA first.

The Phase-1 suites are verified separately, one file per invocation and one profile per
invocation, per the matrix in `tasks.md`. Each figure carries its gate vector (AC-07). The
Phase-1b sensors are verified without the live stack at all: each is a deterministic unit
test, observed red against a deliberate mutation before it is trusted, so the fixes remain
falsifiable on a machine with no PostgreSQL, no Ollama and no dedicated API.

Phase 1 was delivered without the mandatory independent validation (author ≠ verifier); T5.0
supplies the missing gate retroactively, and every figure in `validation.md` for Phases 1 and
1b comes from an agent that authored none of the code it measured.
