# E2E Feature Battery — Design

## Architecture — four tiers

| Tier | Subject | Transport | Runner |
| --- | --- | --- | --- |
| A | core product surfaces | HTTP `:3334` + MCP stdio | `bun test` over `packages/core/src/__tests__/e2e/` |
| B | host harness (installers, agents, commands, profiles) | shell into a scratch `HOME` | `scripts/__tests__/` |
| C | Admin Portal | real browser | `@playwright/test` under `apps/web-ui/e2e/` |
| D | Claude Code CLI + evals | CLI into a scratch `CLAUDE_CONFIG_DIR` | `apps/claude-plugin/__tests__/` |

Tier A is a **profile matrix**, not one run. `e2e-stack.sh`'s six profiles differ only in the
Tools API environment, so a suite that needs `hooks-off` or `scheduler-on` states that in its
own header rather than mutating global state at runtime.

The sixth profile, `scheduler-fast`, was added by `e652b914` and is the one design decision
Phase 1 added to this document. `EB-SCH-3` had been a permanent `describe.skipIf(true)` whose
stated reason was that no profile could configure an interval short enough for a job to fire
inside a suite. That reason was wrong about the product:
`MASSA_AI_SCHEDULER_<KIND>_INTERVAL_MS` sits at the **top** of the precedence chain
(`envNum(def.intervalEnvVar, …)`, `scheduler-defaults.ts:297-301`), outranking the ≥30 min
clamp in `applySafeDefaults`, which only supplies the fallback. The objection underneath it
was sound and is answered by choosing *which* kinds shorten rather than by shortening
everything: `checkpoint-purge` is a bounded DELETE of already-expired rows, and
`observation-bridge` returns `noop` at its first gate with the LLM off
(`observation-consolidation-job.ts:157-163`). Consolidation and decay stay off — both run the
full decay + prune + merge cycle over every memory in `massa_ai_test`.

## Decisions

**The stack is a script, not a runbook.** A suite attached to a process it did not start
cannot test a restart or an environment swap. That is not theoretical: `15.nfr.test.ts:716`
carried a skip reading "would require restarting tools-api with a key", and
`16.destructive.test.ts` printed runbooks instead of running them. Owning the three services
converts both into executable cases.

Three of `e2e-stack.sh`'s behaviours are load-bearing rather than defensive:

1. It refuses any port whose listener it does not own, so the developer's own
   `:3333` / `:5432` / `:11434` can never become a test target.
2. It re-runs database provisioning on every `up`. A run that created the cluster and died
   before `createdb` otherwise stays half-provisioned forever.
3. It asserts *after* startup that the dedicated API really reached `:11435` and
   `massa_ai_test` on `:5433`. Proven red by forcing `OLLAMA_BASE_URL` at the shared
   instance — without it, a misconfigured run silently tests the developer's stack.

**The fixture is content-addressed, and that is a hard requirement, not tidiness.**
`resolveSharedProfileIdentity` (`_helpers.ts:151-163`) runs `git rev-parse HEAD` in
`PROJECT_PATH` and mixes the SHA into the shared-index identity. Pointing at the repository
root would satisfy the pins and then index the whole repository, which `CLAUDE.md` records as
never completing. So the corpus is a sparse git repository built from a declared manifest and
committed with a fixed identity: same content, same SHA, same shared index.

**The embedding profile is a variable, not a constant.** The historical runbook pins
`qwen3-embedding:8b` at 4096 dimensions. That model is not installed on this machine, and a
dimension mismatch degrades *silently* to a different vector table rather than failing — so
the pin is corrected in the script to the installed `qwen3-embedding:4b` at 2560. Any test
that names a dimension table literally encodes a profile it does not own.

**LLM features never enter the default aggregate.** Tier A's `llm-on` suite sits behind its
own `RUN_E2E_LLM=1`, matching the repository rule that every LLM-driven feature defaults off.

## Phase 0 repairs — the shape of the six defects

The scripted stack moved the suite from 223 pass / 5 fail to green by exposing six tests that
asserted contracts the product no longer has. They fall into three classes, and the class
matters more than the count:

- **Asserted a deleted contract.** `N19` asserted `AUTH_REQUIRED === false` and `N18` was a
  static skip; AD-011 deleted the no-key pass-through and made auth non-configurable, so no
  supported configuration could satisfy `N19`. `N5` asserted that three concurrent `index()`
  calls on one `projectId` all complete, citing a queue mutex that a `managed_runs` lease
  replaced — the lease *refuses* the losers with `indexing_busy` (`EtlPipelineBusyError`,
  `services/etl/pipeline.ts:47-62`, FR-09 / AC-7).
- **Encoded a corpus rather than a contract.** `N15` named `vector_documents_4096d`
  literally. `D2` seeded `trace_path` on a class, but call edges are attributed to the symbol
  containing the call site, so a class resolves as a seed and walks to nothing.
- **Green for the opposite of its stated reason.** `T15` seeds the shared index at a
  deliberately wrong root, then asserted warmth using the canonical corpus's probe queries —
  symbols absent from the corpus it had just indexed. It could only pass when the reindex
  failed to clear the previous corpus.

Each replacement is at least as strict as what it removes. `N5` now requires exactly one
winner, every loser refused *for the documented reason*, every job terminal, and a searchable
final state — two winners, the corruption the lease exists to prevent, became the one outcome
the test cannot accept. `N15` discovers which dimension table holds the project and asserts
exactly one does, which also catches a project split across two profiles.

`D4`'s repair is the one that reads as a loosening and is not. It opened each of six additive
architecture fields with `expect(Array.isArray(map.X))` and then iterated `map.X ?? []`, the
`?? []` conceding what the line above denied. `symbol-graph.service.ts:521-527` sets all six to
`undefined` when empty and the type declares them optional, so the assertion contradicted the
product and passed only because the full repository filled all six.

## Phase 1b repairs — the shape of the three defects

All three are **product** defects, and all three were already asserted correctly by a live
sensor before any fix existed. That ordering is the design point: the battery found them, the
suites kept asserting the contract rather than the observed behaviour, and the repair happens
at the source. No KNOWN RED block is rewritten, and no `dropKeys` list grows —
`29.audit-repairs.test.ts:1002-1003` records in-file why widening that list would delete the
only sensor for its class.

They fall into two classes.

**Two projections that dropped what the layer beneath them already had.** `EB-SCH-3b` and
`EB-MCP-3` are the same defect twice, in two subsystems. `fireJob` maintains and persists
`lastSuccessAt`, `lastFailureAt`, `consecutiveFailures` and `lastError`
(`scheduler.ts:489-500`), and `Scheduler.status()` (`:519-536`) simply does not carry them
outward, so `dashboard.ts:39-40` had nothing to read and wrote `null` / `0` as literals. The
consequence is worse than a missing field: the scheduler's only black-box health surface
reports a job failing every tick identically to a healthy one. Measured at one instant with
both kinds having fired, HTTP said `"lastSuccessAt":null` while SQL said
`last_success_at=1788787737541`.

`EB-MCP-3` is the same shape across a transport boundary. `GET /api/v1/workspace/list`
hand-rolls its own projection (`workspace.ts:111-127`) beside the core tool's
(`list_projects.ts:44-64`), and the two drifted. The recorded divergence was one field; the
measured divergence is three — `filter`, per-workspace `createdAt`/`updatedAt`, and `status`
validation, which the route does not perform at all. Adding `filter` to the route would close
the sensor without closing the class, because a second hand-rolled projection would still be
there to drift again. **The route delegates to the tool**, leaving one projection where there
were two.

**One lifecycle defect.** `EB-SCH-6` is not a projection: `nextRunAt` is genuinely recomputed
as `now + intervalMs` across an API restart, because `PgScheduledJobStore.get()` answers from
an unhydrated mirror before `registerDefaultJobs` runs. The measured drift equalled the
restart duration — 20702 ms — which is the signature that distinguishes it from a schedule
that legitimately advanced.

Each fix carries a deterministic sensor that runs with **no live stack**: for the two
projection defects that is a test over object literals, whose red-verifying mutation is a
one-line literal swap. Deliberately narrow — a scheduler-behaviour test would exercise a path
that already works, and would pass with the defect present.

## Constraints

- The live-stack suite stays local and opt-in. CI has no Ollama, no dedicated cluster, and no
  API key, and is not a target of this feature.
- Tier C adds a dependency (`@playwright/test`). Its version must be chosen so the required
  chromium revision is the one already cached; otherwise the first execution downloads a
  browser and the offline constraint stops holding. Measured 2026-09-07: revisions 1208, 1217
  and 1228 are cached, mapping to `1.58.2`, `1.59.1` and `1.61.1`. All three cache owners live
  outside this repository, so the reuse premise is true today and unguaranteed tomorrow.
- **Tier C cannot be added without touching two shared gate surfaces**, and that is why it is
  deferred rather than squeezed in. `bunfig.toml:15` `testMatch` discovers `*.spec.ts`
  anywhere, and `apps/web-ui`'s `test` script is a plain `bun test`, so Playwright specs enter
  the `bun run test` gate under a 5000 ms timeout and die on their own import. The same
  collision reaches `scripts/check-coverage.ts:260-265`, which defines `apps/web-ui` as an
  unscoped coverage group feeding the blocking `coverage.yml`.
- Tier B cannot assert on `install-harness.sh`'s exit code. `installer_host_detected`
  (`scripts/lib/installer-shared.sh:225-241`) detects a host by config directory **or**
  binary on `PATH`, so on a machine without `cursor-agent` a clean `HOME` skips that host and
  the exit code turns 1 for a reason unrelated to the code under test. The expected host set
  is explicitly seeded input, and the assertion is per host, line by line.
- **Tier B's oracle cannot express the distinction the tier depends on.**
  `verify-harness-install.ts` emits 24 fixed rows (4 hosts × 6 artifacts,
  `:314-315`) with no detection field, so an undetected host and a broken install produce the
  same six `missing` rows. Under a scratch `HOME` detection collapses to `command -v` — four
  hosts here, zero in CI — so an assertion written against today's oracle inverts between the
  two environments. The oracle gains a detection field before it arbitrates anything, and it
  gains its first test at the same time: it has none today.
- **Tier B's installer writes into the repository, not only into the scratch `HOME`.**
  `install-harness.sh:197-204` runs both artifact generators against `$REPO_ROOT` on every
  non-dry run, regenerating ~5 MB of gitignored bundles in the worktree the test runs from. A
  scratch `HOME` isolates the install destination and nothing else — not the repository, not
  PostgreSQL, not the ports. Tier B therefore cannot overlap a live-stack measurement.
- Tier D spends no API credits in this delivery. `--max-cost-usd` exists only on
  `claude plugin eval`; the top-level equivalent is `--max-budget-usd` and it is print-mode
  only, so the credentialed group as originally specified had no ceiling at all. It is
  deferred until it does.
