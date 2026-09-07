# E2E Feature Battery — Tasks

**7 Phases = 21 active Tasks, plus 4 Tasks deferred.** Phases 0 and 1 are delivered.
Phase 1b is new scope, added 2026-09-07. Phase 3 is deferred in full; Phase 4 is reduced
to its credential-free half.

Amended 2026-09-07 after a read-only feasibility sweep falsified several premises this
plan had recorded as fact. Every amendment below names the evidence that forced it.

## Phase 0 — bring-up, fixture and baseline (5 Tasks) — COMPLETE

| Task | Subject | Status |
| --- | --- | --- |
| T0.1 | `scripts/prepare-e2e-fixture.ts` — deterministic sparse git corpus, fixed commit identity | done (`256d58fb`) |
| T0.2 | `scripts/e2e-stack.sh` — three services, six profiles, PID/port attestation | done (`256d58fb`, `7d7973d5`, `e652b914`) |
| T0.3 | Prove the environment contract before spending a suite run on it | done (`256d58fb`) |
| T0.4 | Repair the stale anchors: `COVERAGE.md`, `turbo.json` `passThroughEnv`, `FEATURES.md` | done (`256d58fb`) |
| T0.5 | Measured baseline, then repair what it exposed | done (`b6990adb`) |

T0.5 produced six repairs across three files — `15.nfr.test.ts` (N5, N15, N18, N19),
`18.graph-phase4.test.ts` (D2, D4), `22.path-identity.test.ts` (T15). Their rationale is in
`design.md`; the measured figures are in `validation.md`.

T0.2 shipped with **five** profiles and now has **six**: `e652b914` added `scheduler-fast`
so a scheduler job actually fires inside a suite run. `e2e-stack.sh:146` is the definition.
Two later repairs to the same deliverable are recorded in `validation.md`: the unlisted
embedding surface (`3224c795`) and the postgres bring-up budget (`7d7973d5`).

## Phase 1 — Tier A, core gaps (6 Tasks) — COMPLETE

Delivered across `13d07927..8d54762c`, ten commits. Six new suites, ~6.2k lines.

| Task | New suite | Scenario IDs | Profile / gate | Status |
| --- | --- | --- | --- | --- |
| T1.1 | `25.observability.test.ts` | `EB-OBS-1..7` | `default` | done (`13d07927`) |
| T1.2 | `26.scheduler.test.ts` | `EB-SCH-1..6`, `3b` | `scheduler-on` + `scheduler-fast`; `EB-SCH-6` uses `restart-api` | done (`f95ec012`, `e652b914`, `8d54762c`) |
| T1.3 | `27.auth-config-cache.test.ts` | `EB-AUTH-1..6`, `EB-CFG-1..3`, `EB-CACHE-1..4` | `auth` | done (`abd157ad`, `8d54762c`) |
| T1.4 | `28.hooks-handoffs-proposals.test.ts` | `EB-HOOK-1..3`, `EB-HO-1..3`, `EB-AI-1..3` | `default` + `hooks-off` | done (`dd73e716`) |
| T1.5 | `29.audit-repairs.test.ts` | `EB-SRCH-1..3`, `EB-MEM-1..2`, `EB-SYN-1`, `EB-EXEC-1..3`, `EB-MCP-1..3`, `EB-IDX-1`, `EB-TOOL-1` | `default` | done (`aa7d1d49`) |
| T1.6 | `30.llm-features.test.ts` | `EB-LLM-1..6`, `3b` | `llm-on`, gated `RUN_E2E_LLM=1`, never in the default aggregate | done (`24a0ffa2`, `8d54762c`) |

T1.3 closed the declared skip at `15.nfr.test.ts:716`. `023d2aa0` made the stack fail closed
when the embedding provider is not at the pinned width.

**Phase 1 shipped without the mandatory independent validation** (author ≠ verifier). Its
only figures are self-reported in the `8d54762c` body. Task A1 supplies the missing gate.

### What Phase 1 found and did not fix

Three product defects, recorded as KNOWN RED blocks inside the suites. `git diff --name-only
13d07927~1..8d54762c` returns ten files — eight E2E suites, `scripts/e2e-stack.sh`, and
`audit-eb-aud.md`. Zero product source. These become Phase 1b.

## Phase 1b — the product defects the battery found (3 Tasks) — NEW 2026-09-07

New scope, outside the original 21. Added because the branch had recorded three real product
defects and fixed none of them.

| Task | Defect | Subject | Order |
| --- | --- | --- | --- |
| T1b.1 | `EB-MCP-3` | `GET /api/v1/workspace/list` hand-rolls a projection that diverges from `ListProjectsTool` on three axes. The route delegates to the tool instead. | first |
| T1b.2 | `EB-SCH-3b` | `Scheduler.status()` drops four fields `fireJob` maintains; `dashboard.ts` then writes `lastSuccessAt: null` / `consecutiveFailures: 0` as literals. Projection only. | second |
| T1b.3 | `EB-SCH-6` | `nextRunAt` is recomputed as `now + intervalMs` across an API restart, because `PgScheduledJobStore.get()` answers from an unhydrated mirror before `registerDefaultJobs` runs. | third, after T1b.2 |

**T1b.2 and T1b.3 cannot be parallelised.** They collide in the product
(`scheduler.ts:519-536` vs `:210-229`) and in the test (`26.scheduler.test.ts:768-795` vs
`:995-1027`) — the same two files. One atomic commit each is unreachable from two concurrent
workers.

**No task in this phase edits a KNOWN RED block into a passing shape.** All three assertions
are already live and already assert correct behaviour — `26.scheduler.test.ts:1024`,
`29.audit-repairs.test.ts:1004`. The product fix alone turns them green. `29.audit-repairs
.test.ts:1002-1003` warns in-file that widening its `dropKeys` would delete the only sensor
for the class; that warning holds.

`EB-MCP-3`'s recorded divergence is narrower than the real one. The suite compares with
`dropKeys: ["workspaces"]`, so it saw only the missing `filter`. Measured 2026-09-07, the two
projections differ on three axes:

| Axis | REST `workspace.ts:111-127` | Tool `list_projects.ts:44-64` |
| --- | --- | --- |
| `filter` | absent | present |
| per-workspace `createdAt` / `updatedAt` | absent | present |
| validation of `status` | `(query.status as string) \|\| "all"` — none | `validateEnum` over five values |

## Phase 2 — Tier B, host harness (4 Tasks) — NOT STARTED, re-specified 2026-09-07

| Task | Subject | Scenario IDs | Order |
| --- | --- | --- | --- |
| T2.0 | Make `bun run generate:artifacts --check` reach both generators. `package.json:31` is `bun a.ts && bun b.ts`, so the flag lands only on `generate-subagent-artifacts.ts`; the skill-artifacts half runs in write mode. | — | first |
| T2.1 | Give `scripts/verify-harness-install.ts` a host-detection field, and give it its first test. | `EB-HB-1..3` | second |
| T2.2 | `scripts/__tests__/harness-e2e.test.ts` — scratch `HOME`, `install-harness.sh --all`, oracle `verify-harness-install.ts --json`; assert per host, never on the exit code. | `EB-HB-4..9` | after T2.0 and T2.1 |
| T2.4 | Root `install.sh` — zero executed coverage today; needs a pty for the three menu reads that have no environment seam. | `EB-HB-14..16` | independent |

### T2.1 is new, and it is what makes T2.2 possible

The original plan named `verify-harness-install.ts --json` as T2.2's oracle. Measured
2026-09-07, that oracle cannot answer the question asked of it:

- It emits a flat array of exactly 24 rows — 4 hosts × 6 artifacts — with no top-level keys
  (`verify-harness-install.ts:314-315`, `:37`, `:39`). There is **no host-detection concept**.
  An absent host produces six `missing` rows, indistinguishable from a broken install.
- `install-harness.sh` installs only *detected* hosts (`:250-282` → `installer_host_detected`,
  `installer-shared.sh:225-241`), and under a scratch `HOME` the config-directory probe never
  fires, so detection collapses to `command -v`. That is four hosts on this machine and zero
  in CI. **The same assertion inverts between the two environments.**
- The oracle has zero test coverage and zero CI references. Phase 2 would otherwise make a
  never-exercised script the arbiter of six scenarios.

The two existing suites solved this explicitly and oppositely —
`test-install-harness-cli.sh:62-65` seeds all four config dirs;
`test-plugin-auto-install.sh:6-9` scrubs `PATH`. T2.2 must pick one and say which.

### T2.3 is cut, not deferred — the behaviour is already covered

The original T2.3 ("profile switch end to end with no mock of the switch engine: agent files
change content, `install-state.json` records it, cursor returns `skipped`, the marketplace
route refuses loudly") would rebuild existing sensors:

- cursor-`skipped` and `installRoute` recording are asserted end to end against the real
  installers in `scripts/tests/test-model-profile-installer-opencode-cursor.sh:5-17` and
  `test-model-profile-installer-reapply.sh:5-16`.
- Seven unit suites live in `packages/shared/src/profile-switch/__tests__/`.
- The clause is also wrong on one point: the marketplace route does not "refuse loudly" in the
  throwing sense. It returns a `status: "failed"` row (`engine.ts:393-400`). The only throw on
  that path is `NoHostsDetectedError()` (`engine.ts:419`).

### Traps T2.2 must handle

- **The consent gate exits 13 in a non-TTY** when the target equals the live `$HOME`
  (`installer_is_real_home`, `installer-shared.sh:86-91`; exit at `:574-575`). Setting both
  `HOME` and `--target` to the same scratch directory trips it.
- **Two flag names for one value.** `install-harness.sh` takes `--target <dir>`
  (`:74`, `:95`); `verify-harness-install.ts` takes `--home <dir>` (`:33`).
- **The installer writes into the repository, not only into `HOME`.**
  `install-harness.sh:197-204` runs both generators against `$REPO_ROOT` on every non-dry run,
  regenerating ~5 MB / 580 gitignored files in the worktree the test runs from. The oracle
  must read the **installed destination**, never the repo bundles — and T2.0 must land first,
  or a repaired `--check` reads output T2.2 itself just produced.
- Neither the installers nor the oracle read `XDG_CONFIG_HOME` or `CLAUDE_CONFIG_DIR`.
  Isolation here is `$HOME` / `--target` / `--home` only.

### T2.4's premise holds, and understates the surface

Six `/dev/tty` reads confirmed exact: `install.sh:160`, `:184`, `:209`, `:663`, `:709`,
`:750`. But three already have non-interactive seams — `:160` is skipped when `MASSA_AI_MODE`
is set (`:69`, `:1046-1048`), and `:184`/`:209` are inside `prompt_install_dir`, which returns
early when `MASSA_AI_DIR` is set (`:70`, `:180-186`). The pty is needed for the three
post-install menus only. "Zero executed coverage" is confirmed: `root-install-menu.test.ts:8`
and `test-installer-feature-prompts.sh:197,205` both read the file as text. Every mode reaches
the network (`git clone` at `:968`/`:1019`, `curl | bash` at `:230`), so the test must stop
before those.

## Phase 3 — Tier C, Admin Portal in a browser (3 Tasks) — DEFERRED 2026-09-07

**Specified, not built, and not in this delivery.** Recorded here so no artifact claims it as
in-scope. The user's decision of 2026-09-07 is to build it as originally specified — 26
`EB-PB` scenarios — in a later session, not to reduce it.

| Task | Subject | Scenario IDs |
| --- | --- | --- |
| T3.1 | `@playwright/test` pinned to a version whose chromium revision is already cached; `apps/web-ui/e2e/` + `test:portal` + a fixture that brings the stack up on `auth` and serves `/ui` | — |
| T3.2 | Load, injected key with a negative control, untrusted banner via a LAN bind, the views, write-mode on/off pair | `EB-PB-1..16` |
| T3.3 | Real CRUD through dialogs, Config/Restart, Profiles/Registry, Dashboard degradation, XSS asserted against the renderer | `EB-PB-17..26` |

What a later session must handle, measured 2026-09-07:

- **`bunfig.toml:15` `testMatch` swallows the Playwright specs.** `apps/web-ui`'s `test`
  script is plain `bun test`, so `apps/web-ui/e2e/*.spec.ts` is discovered by Bun's runner
  under `bun run test`, against the global 5000 ms timeout, and dies on
  `import { test } from "@playwright/test"`. This turns the whole `bun run test` gate red.
- **The same collision reaches the blocking coverage gate.** `scripts/check-coverage.ts:260-265`
  defines `apps/web-ui` as a coverage group with no path scoping — unlike
  `apps/opencode-plugin` at `:266-272`, which is scoped precisely because a bare walk picked
  up stray specs. `coverage.yml` has no `continue-on-error`.
- Cached chromium revisions are 1208 / 1217 / 1228 → `@playwright/test` `1.58.2`, `1.59.1`,
  `1.61.1`. Any other version downloads ~130 MB. All three cache owners live outside this
  repository, so the reuse premise is true today and not guaranteed.
- `dist/static/` must exist before any browser test: `web-ui.ts:31-33`, `:43` serve
  `apps/web-ui/dist/static` only.
- **The view count is 11, but the nav has 10.** `KNOWN_VIEWS` (`start-app.ts:55-67`) lists 11;
  `index.html:25-36` has 10 links. `model-registry` is reached as a Profiles sub-tab
  (`views/profiles.ts:141`, `start-app.ts:378`). A test written as "click each nav item,
  assert 11" fails on a correct product.
- The LAN-bind case is not hermetic. `isLoopbackAddress` (`web-ui-trust.ts:28-49`) rejects
  everything but loopback, and the only override forces the opposite direction. A runner with
  no usable LAN interface must skip it, which weakens the assertion to something
  `apps/tools-api/src/__tests__/web-ui-key-http.test.ts` already proves over real HTTP.
- 15 fake-DOM suites (~691 cases) already cover XSS escaping, CRUD dialogs, write-mode,
  Config/Restart, and Profiles/Registry. The browser-only delta is script *non-execution*,
  real `confirm()` semantics, and real navigation. T3.2 and T3.3 must say so per scenario, or
  they buy 26 slow tests for coverage that exists.

## Phase 4 — Tier D, Claude Code (1 Task active, 1 deferred) — NOT STARTED

| Task | Subject | Scenario IDs | Status |
| --- | --- | --- | --- |
| T4.1 | `claude-cli-e2e` credential-free group — runs whenever the binary is present; scratch `CLAUDE_CONFIG_DIR` **and** scratch `HOME` throughout | `EB-CB-1..4` | active |
| T4.2 | The credentialed group and `apps/claude-plugin/evals/` | `EB-CB-5..7` | **deferred 2026-09-07** |

Reduced by the user's decision of 2026-09-07 to the credential-free half. Measured on
`claude` 2.1.258:

- The credential-free surface is real and fast: `claude --version` 0.01 s,
  `claude plugin list` 0.28 s, `claude plugin validate apps/claude-plugin` 0.24 s.
- **`--max-cost-usd` is not a CLI-wide flag.** It exists only on `claude plugin eval`. The
  top-level equivalent for `-p` runs is `--max-budget-usd`, print-mode only. The original
  T4.1 therefore had no cost ceiling of any kind — which is why the credentialed group is
  deferred rather than built.
- `claude plugin eval` exists and `--ablation`, `--json`, `--max-cost-usd` are all real. Two
  defaults the deferred task must decide about: report publishing to claude.ai is **on** by
  default (`--no-publish` is opt-out), and `--mocks` defaults to `record`, which implies a
  live pass against real MCP servers.
- **`test:plugins` is the wrong runner for a credentialed group.** `package.json:40` is a
  plain `bun test` over four plugin directories in one process, under the global 5000 ms
  timeout, and `run-tests-isolated.ts` does not cover `apps/*-plugin`. A suite that spawns
  `claude` and mutates `CLAUDE_CONFIG_DIR`/`HOME` leaks process-global state into three
  sibling suites. The credential-free cases at 0.24–0.28 s are safe there; the credentialed
  ones are not.
- `CLAUDE_CONFIG_DIR` was observed to redirect both reads and writes of `.claude.json`. It was
  **not** falsified for `~/.claude/plugins/`. The repo's own precedent
  (`test-plugin-registry-registration.sh:127`, `:165`) pins `HOME` alongside it; treat scratch
  `HOME` as required.

## Phase 5 — execution and report (2 Tasks) — NOT STARTED

| Task | Subject |
| --- | --- |
| T5.0 | Independent Tier-A baseline before any fix. Contract is **gate vector + triple, per profile** — never a triple alone — plus a stability check running one suite twice against an unchanged stack. |
| T5.1 | Re-measure after Phases 1b and 2, per profile, with the skip populations held constant. Report measured pass / fail / skip and duration per tier and per profile, plus an explicit list of what was left out and why. |

**A bare pass/fail/skip triple is not a property of this branch.** Suites 25–30 decide what
executes from runtime probes over ambient machine state — `READY` is an async probe
(`26.scheduler.test.ts:219`, `29.audit-repairs.test.ts:118`), and the rest are conjunctions:
`SEARCH_READY = READY && OLLAMA_UP` (`29:135`), `MCP_READY = READY && !!MCP_BIN && CONFIG_OK`
(`29:146`), `RESTART_READY = READY && OWNED` (`29:143`), `SCHEDULER_ON` (`26:238`),
`PRESET_ON` / `SCHEDULER_FAST` keyed on `STACK_PROFILE` (`26:281,289`). There are 48 such
gated blocks across the six suites, and stack state lives at the machine-global path
`/tmp/massa-ai-e2e-stack`. A triple that differs from a recorded one therefore cannot separate
"the figure was wrong" from "the stack was provisioned differently" unless the gate vector is
reported beside it.

T5.1 must re-derive **per profile**, not once over the matrix. `EB-SCH-3b` is visible only
under `SCHEDULER_FAST` (`26.scheduler.test.ts:796`) and `EB-SCH-6` only under `RESTART_READY`
(`:898`); the `scheduler-on` and `scheduler-fast` triples each carry exactly one failure, so a
single aggregate cannot attribute either flip.

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

# Phase 1 suites — one file per invocation, each under its own profile
#   default        25, 28, 29, 10, 11
#   scheduler-on   26
#   scheduler-fast 26
#   auth           27
#   hooks-off      28
#   llm-on         30   (needs RUN_E2E_LLM=1 as well as RUN_E2E=1)

# provisioning sensor for a fresh worktree — 9 pass or the grammars/dist are missing
bun test ./scripts/tests/verify-tree-sitter-grammars.test.ts

# spec-delivery gate — must exit 0 before a PR is opened
bun skills/massa-ai/scripts/check_specs_delivered.ts e2e-feature-battery --root .
```

No figure is accepted from a run that shared its checkout or its stack with another session,
and none from a run on a host whose 1-minute load average was above 6.
