# E2E Feature Battery — Tasks

**6 Phases = 21 Tasks.** Phase 0 is delivered; Phases 1–5 are not started.

## Phase 0 — bring-up, fixture and baseline (5 Tasks) — COMPLETE

| Task | Subject | Status |
| --- | --- | --- |
| T0.1 | `scripts/prepare-e2e-fixture.ts` — deterministic sparse git corpus, fixed commit identity | done (`256d58fb`) |
| T0.2 | `scripts/e2e-stack.sh` — three services, five profiles, PID/port attestation | done (`256d58fb`) |
| T0.3 | Prove the environment contract before spending a suite run on it | done (`256d58fb`) |
| T0.4 | Repair the stale anchors: `COVERAGE.md`, `turbo.json` `passThroughEnv`, `FEATURES.md` | done (`256d58fb`) |
| T0.5 | Measured baseline, then repair what it exposed | done (`b6990adb`) |

T0.5 produced six repairs across three files — `15.nfr.test.ts` (N5, N15, N18, N19),
`18.graph-phase4.test.ts` (D2, D4), `22.path-identity.test.ts` (T15). Their rationale is in
`design.md`; the measured figures are in `validation.md`.

## Phase 1 — Tier A, core gaps (6 Tasks) — NOT STARTED

| Task | New suite | Scenario IDs | Profile / gate |
| --- | --- | --- | --- |
| T1.1 | `25.observability.test.ts` | `EB-OBS-1..7` | `default` |
| T1.2 | `26.scheduler.test.ts` | `EB-SCH-1..6` | `scheduler-on`; `EB-SCH-6` uses `restart-api` to prove `nextRunAt` survives |
| T1.3 | `27.auth-config-cache.test.ts` | `EB-AUTH-1..6`, `EB-CFG-1..3`, `EB-CACHE-1..4` | `auth` |
| T1.4 | `28.hooks-handoffs-proposals.test.ts` | `EB-HOOK-1..3`, `EB-HO-1..3`, `EB-AI-1..3` | `hooks-off` for the 423 cases |
| T1.5 | `29.audit-repairs.test.ts` | `EB-SRCH-1..3`, `EB-MEM-1..2`, `EB-SYN-1`, `EB-EXEC-1..3`, `EB-MCP-1..3`, `EB-IDX-1`, `EB-TOOL-1` | `default` |
| T1.6 | `30.llm-features.test.ts` | `EB-LLM-1..6`, plus `EB-AUD-1..3` as a read step | `llm-on`, gated `RUN_E2E_LLM=1`, never in the default aggregate |

T1.3 is what closes the declared skip at `15.nfr.test.ts:716`.

## Phase 2 — Tier B, host harness (4 Tasks) — NOT STARTED

| Task | Subject | Scenario IDs |
| --- | --- | --- |
| T2.1 | `scripts/__tests__/harness-e2e.test.ts` — scratch `HOME`, `install-harness.sh --all`, oracle `verify-harness-install.ts --json`; assert per host, never on the exit code | `EB-HB-1..6` |
| T2.2 | Installed-destination inventories: commands and sub-agents per host, ownership marker preserved, `generate:artifacts --check` clean | `EB-HB-7..9` |
| T2.3 | Profile switch end to end with no mock of the switch engine: agent files change content, `install-state.json` records it, cursor returns `skipped`, the marketplace route refuses loudly | `EB-HB-10..13` |
| T2.4 | Root `install.sh` — zero executed coverage today; needs a pty because it reads from `/dev/tty` at six points | `EB-HB-14..16` |

## Phase 3 — Tier C, Admin Portal in a browser (3 Tasks) — NOT STARTED

| Task | Subject | Scenario IDs |
| --- | --- | --- |
| T3.1 | Add `@playwright/test` at the version whose chromium revision is already cached; `apps/web-ui/e2e/` + `test:portal` + a fixture that brings the stack up on `auth` and serves `/ui` | — |
| T3.2 | Load, injected key with a negative control, untrusted banner via a LAN bind, the 11 views, write-mode on/off pair | `EB-PB-1..16` |
| T3.3 | Real CRUD through dialogs, Config/Restart, Profiles/Registry, Dashboard degradation, XSS asserted against the renderer | `EB-PB-17..26` |

## Phase 4 — Tier D, Claude Code (2 Tasks) — NOT STARTED

| Task | Subject | Scenario IDs |
| --- | --- | --- |
| T4.1 | `apps/claude-plugin/__tests__/claude-cli-e2e.test.ts` — credential-free group runs whenever the binary is present; credentialed group behind `RUN_CLAUDE_E2E=1` with a preflight that fails by name without `ANTHROPIC_API_KEY`; scratch `CLAUDE_CONFIG_DIR` throughout | `EB-CB-1..6` |
| T4.2 | `apps/claude-plugin/evals/` minimal cases, `--ablation with-without`, `--json`, explicit `--max-cost-usd` | `EB-CB-7` |

## Phase 5 — execution and report (1 Task) — NOT STARTED

| Task | Subject |
| --- | --- |
| T5.1 | Run A → B → C → D. Tier A is a profile matrix (`default`, `auth`, `hooks-off`, `scheduler-on`, `llm-on`), not one execution. Report measured pass / fail / skip and duration per tier and per profile, plus an explicit list of what was left out and why |

## Gate check commands

```bash
# fixture identity — must print 788facbd87a568e4e3354cb541ef0d019fa5aaaf
git -C /tmp/massa-ai-e2e-fixture rev-parse HEAD

# stack, from THIS worktree (e2e-stack.sh resolves REPO_ROOT from its own path)
bash scripts/e2e-stack.sh up --profile default
eval "$(bash scripts/e2e-stack.sh env)"

# Tier A, from packages/core — the 16-file sequence, then cleanup-verify last
bun test --max-concurrency 1 src/__tests__/e2e/{00,02,05,06,08,09,10,11,13,14,15,18,19,20,22,24}.*.test.ts
bun test --max-concurrency 1 src/__tests__/e2e/17.cleanup-verify.test.ts

# provisioning sensor for a fresh worktree — 9 pass or the grammars/dist are missing
bun test ./scripts/tests/verify-tree-sitter-grammars.test.ts
```

No figure is accepted from a run that shared its checkout or its stack with another session.
