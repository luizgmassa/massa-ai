# massa-ai Spec State

## Current — Sensor Repair 2026-07

- projectId: `massa-ai`
- workflowSessionId: `spec-sensor-repair-2026-07`
- workflow: spec-driven (Medium — Specify + Tasks + Execute; Design inline)
- feature: `sensor-repair-2026-07` — **Executed 2026-07-28. All 9 planned tasks plus 6 unplanned
  ones are DONE; full gate green. Branch `fix/sensor-repair`, not pushed, no PR yet.**
- base: `origin/main` @ `a6216cd` (v1.9.0)
- Artifacts: `.specs/features/sensor-repair-2026-07/{spec.md,design.md,tasks.md,validation.md}`
- **Six unplanned repairs, each a blocker discovered by trying to use the previous fix.** T6a (a
  full index aborting on a same-name/different-kind declaration), T6b (`security.allowedExtensions`
  never propagated from user config), T6c (`capturePolicy` validated then never consulted), T6d (a
  one-element brace glob matching literally, so a single-extension allow-list indexed nothing), the
  e2e availability probe sending no API key under mandatory auth (every E2E suite silently
  skipping), and in-process coverage for two config validators only ever exercised in subprocesses.
  **None of the six failed loudly** — they aborted, skipped, or reported success over an empty
  result. That is the same defect class SEN-01..04 exist to remove, found inside the tooling that
  was supposed to measure it. Full mechanism in `design.md`, Fourth and Fifth forks.
- scope: 5 requirements — SEN-01 (reset the coverage gate's dedicated DB), SEN-02 (wire
  `test:coverage` into its own blocking CI workflow), SEN-03 (scratch `XDG_CONFIG_HOME` in the
  shared test runner), SEN-04 (content-anchor the needles fixture; make a stale needle a hard
  failure), BEH-01 (honour `includePersistent`). One PR.
- Why it exists and why it is first: it is the four sensors that
  `core-layering-god-module-split` will be judged by, and all four are currently unreliable. That
  refactor is behavior-preserving, so its only proof is the instruments.
- **Headline finding (new, not in the carried-forward list — nobody had looked).** The needles
  retrieval gate is not a sensor that might miss a regression; as built it is a sensor that
  manufactures one. `benchmarks/needles/scorer.ts:94-104` scores a hit only on
  `filePath` equality **and** line-range intersection, and `benchmarks/needles/run.ts:233-236`
  skips a missing target with a `[warn]` and scores it zero. 7 of the 14 needles sit in
  `services/search/`, 4 of them in the `rlm-*` files the refactor renames. Moving them caps
  `hit@1` at 7/14 = 0.50 against a 0.5 floor and `MRR` at 0.50 against a **0.65** floor — a
  guaranteed failure independent of retrieval quality. R-01 in the downstream spec had this
  exactly backwards.
- Spec-owner decisions closed 2026-07-28:
  - SEN-01: truncate tables at gate start, keep schema and migrations. Guarded by the *existing*
    `assertDedicatedDatabase()`, not a second condition — two conditions drift apart, one cannot.
  - SEN-02: its own `coverage.yml` on the `needles-gate.yml` precedent, **blocking** (no
    `continue-on-error`), deliberately outside `ci.yml` so it does not extend the `workflow_run`
    chain `release.yml` keys off.
  - SEN-03: scratch `XDG_CONFIG_HOME` in `scripts/lib/run-tests-isolated.ts`, mirroring what
    `check-coverage.ts:402` already does. **Not** 75 new isolation groups — that would take core
    from 126 forked processes to ~180 on a sequential runner and break T20's pinned invariant.
  - SEN-04: content-anchor the fixture, before any refactor commit. The loud-failure requirement
    matters more than the anchoring: the silent skip is what made the gate untrustworthy.
  - BEH-01: implement the option. Deliberately isolated here so neither PR-B nor PR-C — both
    behavior-preserving — carries a behavior change.
- Plan Challenge: **full gate**, mode `red_team`, `massa-ai-plan-critic`, `serious_findings:
  revise_plan`. Returned `escalate_to_full: true`. **4 findings, all independently verified
  against source by the main agent before incorporation, all folded into acceptance criteria.**
  The critic's own framing of the shared failure shape is worth keeping: *the author verified the
  mechanism that was named, not every mechanism that reaches the same symptom.*
  1. **SEN-03 does not close the leak it claims to.** `packages/shared/src/env.ts:33-34`
     dotenv-loads the nearest `.env` walking up from cwd, independently of `XDG_CONFIG_HOME`, and
     `config/index.ts:575` resolves `envBool("MASSA_AI_LLM_ENABLED", …)` with **env winning over
     `config.json`**. A repo-root `.env` setting it true bypasses the scratch config dir entirely.
     Latent in this checkout (no `.env` present), which is why it would have been found the hard
     way. → new **AC-6**: the runner also neutralizes `MASSA_AI_LLM_*` in the child env.
  2. **The needles fixture has three consumers, not two.**
     `packages/core/src/__tests__/e2e/14.needles.test.ts:119-133` replicates `intersects` and
     `findRank` verbatim against the same JSON. With the 7 `services/search/` targets moved its
     `hit@5` caps at 0.50 against its own **0.64** floor (`:302`). Gated behind
     `describe.skipIf(!READY)` (`:236`), so lower blast radius than graded, not exempt. → new
     **AC-7**.
  3. **SEN-01 would desync Prisma.** `_prisma_migrations` sits in the same `public` schema, so
     "truncate every table in the schema" empties the applied-migration bookkeeping while leaving
     all 24 migrations' DDL applied; the next `migrate deploy` replays non-idempotent
     `ALTER TABLE ADD COLUMN` and fails. → new **AC-2** (exclude it by name, enumerate tables) and
     **AC-2a** (`prisma migrate status` reports up-to-date).
  4. **`packages/core/package.json`'s `"./controllers"` exports subpath** is published npm surface
     that retiring the layer would strand. Zero consumers, so cheap to remove — but not to ignore.
     → new **GMS-01 AC-6** downstream.
  Also raised and accepted: anchor-resolution span drift and anchor uniqueness (→ **AC-8**,
  **AC-9**), and **R-08** — PR-C bundles a 3-4 file controllers move with a 12-file
  `data → services` cleanup under one label.
  Not accepted: nothing. The critic refuted no claim the main agent had verified; the needles
  arithmetic was independently confirmed by both.

## Previous — Audit Remediation 2026-07

- projectId: `massa-ai`
- workflowSessionId: `spec-audit-remediation-2026-07`
- workflow: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute)
- feature: `audit-remediation-2026-07` — **COMPLETE. PR1 merged as `af16ea2`, released v1.8.0;
  PR2 merged as `ac89d0f`, released v1.9.0. Both independently validated.**
- worktree (PR1): `/Users/luizmassa/Projects/massa-ai-wt-audit-remediation`; branch
  `fix/audit-remediation-security-and-bugs` off `origin/main` @ `3a25cc6` (v1.7.1)
- worktree (PR2): `/Users/luizmassa/Projects/massa-ai-wt-audit-remediation-debt`; branch
  `feat/audit-remediation-debt` off `origin/main` @ `c992ae9` (v1.8.0). **Merged as `ac89d0f`
  (PR #41) and released as v1.9.0; worktree and branch are gone.**
- scope: 17 requirements (SEC-01..06, BUG-01..06, DEBT-01..05) across 22 tasks and 2 PRs
- Artifacts: `.specs/features/audit-remediation-2026-07/{spec,design,tasks}.md`
- Origin: knowledge-graph analysis at `17ee708` (1847 nodes / 4226 edges) plus two verification
  passes. Every finding confirmed against current source, not inferred from the graph.
- Headline finding: the Tools API serves unauthenticated requests by default
  (`auth.ts:51` `if (!apiKey) return;`) and exposes three arbitrary-code-execution routes
  (`routes/executor.ts:38,72,94`); `.use(cors())` at `index.ts:73` reflects any Origin with
  credentials, making it reachable from a developer's browser.
- User decisions locked at Specify/Design:
  - Two PRs: PR1 correctness (SEC + BUG), PR2 debt (DEBT).
  - Bind address stays `0.0.0.0`; exposure is closed by auth, not by address.
  - API key auto-provisioned into `config.json` on first start; hard-refuse only when unwritable.
  - Web UI key injected server-side for loopback callers only.
  - `RLM_LLM_*` → `MASSA_AI_LLM_*` hard rename, no dual-read (requires AD-010 supersession).
  - BUG-02 closed by a read-side project filter; no 25th migration.
  - oxlint, correctness rules, **no formatter** — repo-wide reformat is its own later PR.
  - Layering refactor and `contextual-search-rlm.ts` god-module split deferred to their own specs.
- Conforms to: **AD-007** (executor sandbox default `auto` with best-effort fallback is unchanged;
  SEC-03 only makes the fallback observable) and **AD-008** (json_schema gating untouched;
  DEBT-03 renames env vars only).
- Pending decisions to append during Execute: `AD-010` (one env prefix, supersedes the
  `RLM_LLM_*` compatibility boundary recorded in `repo-rename-massa-ai` and
  `project-identity-rename`) and `AD-011` (the Tools API never serves an anonymous request).
- Plan Challenge: **full gate**, mode `red_team`, `massa-ai-plan-critic`. 2 critical, 1 high,
  1 medium/high — all four verified against source by the main agent, all incorporated before
  Execute (`serious_findings: revise_plan`).
  - C1a `/ui` would 401 after SEC-01: `authMiddleware` (`index.ts:121`) precedes `webUiRoutes`
    (`:140`) and `PUBLIC_PATHS.some(p => path.startsWith(p))` (`auth.ts:46`) lacks `/ui`. The
    whole SEC-05 injection mechanism was dead code. `/ui` + `/ui/` added, decoy-path test required.
  - C1b The loopback check has no supported implementation on `@elysiajs/node` (`index.ts:72`);
    `server.requestIP()` throws there. **TASK-000 spike added** with a
    `MASSA_AI_WEB_UI_TRUST_LOCAL` fallback so SEC-05 is implementable either way.
  - C2 `apps/claude-plugin/hooks/massa-ai-hook.ts:152` reads `process.env.MASSA_AI_API_KEY` only,
    never imports `@massa-ai/shared`, and silent-degrades — the auto-provisioned key never reaches
    it, so lifecycle capture would die invisibly. **TASK-023 added**; closes candidate lesson L-002.
  - H3 Docker may fail the trust check in the opposite direction from the documented risk
    (bridge mapping, not loopback). Explicit Docker assertion added to TASK-007.
  - M4 `CONFIG_DIR` is a module-level const (`config-loader.ts:7`) ⇒ resolve the key in an explicit
    `initAuth()`, never at import, or `bun test` writes to the real `~/.config`. `auth.test.ts:24-34`
    asserts the deleted bypass and is now named for rewrite.
  - Rejected as not-a-gap: CORS-as-theatre — the plan never overclaims CORS as the primary control.
- Task count: 24 across 6 phases, 2 PRs. Packs into 4 batches at the ~7-task budget.
- Execute: **PR1 in progress — 16 of 16 implementation tasks committed; T15 (PR1 close) in
  progress**, executed inline (the user declined sub-agents for PR1; the T15 verification agent is
  the one accepted exception).
  - Order: T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T23 → T8 → T9 → T10 → T11 → T12 → T13 → T14 →
    **T15 (in progress)**.
  - Committed: `30e710a` T1, `a081406` T0, `41b2f90` T2, `976370f` T3, `e17bd5d` T4, `079cc49` T5,
    `5908960` T6, `a646204` T7, `7ee6fa4` T23, `640fd3c` T8, `085e3e8` T9, `92912ce` T10,
    `81c6841` T11, `287df69` T12, `c3510d3` T13, `af008e0` T14.
    (`f26060b` corrected this section's own stale `Execute: not started` line; `18a992e` recorded
    progress through T9; `48d0f39` is the out-of-band test fix described below.)
  - **Phases 0-4 are complete. Only T15 remains.**
  - Three Execute-phase divergences, all written back into `spec.md` / `design.md`:
    1. **T2** — the specified "re-read after conflict" concurrency fix does not converge; proven by
       its own test. Replaced with an `open(…, "wx")` exclusive-create writer election in
       `packages/shared/src/config/api-key.ts`.
    2. **T0** — `ctx.request.ip` is the verified mechanism. `ctx.server` is *absent* under
       `adapter: node()`, so `server.requestIP()` is `undefined` rather than throwing. Loopback has
       three accepted spellings: `::1`, `::ffff:127.0.0.1`, `127.0.0.0/8`.
    3. **T5** — a second admin-preservation test file lived in a different directory. Do a
       repo-wide reference sweep after deleting a module.
  - New decision (T6): Docker gets an explicit `MASSA_AI_WEB_UI_TRUST_LOCAL=true` opt-in set in the
    `Dockerfile`. A bridge-mapped container can never satisfy the loopback check, so this is the
    only way `/ui` works in Docker. Exposure accepted knowingly by the user: with the `0.0.0.0`
    bind, anyone reaching `:3333` can read the key out of `/ui`'s HTML. It is off by default,
    accepts only the exact string `"true"`, warns once at startup, and is documented in
    `docs/web-ui-access.md`. Do not silently widen or narrow it.
  - Further divergences found in Phase 3/4, all written back into `design.md`:
    4. **T7** — `setup-local-first.sh` regenerated `config.json` wholesale, so a re-run destroyed
       the auto-provisioned key. Key resolution + the config writer moved to
       `scripts/lib/installer-api-key.sh` so the contract is executable, not grep-pinned.
    5. **T7** — `env.ts` seeded `MASSA_AI_API_KEY` on a bare truthiness check while `usable()`
       treats whitespace as unset, so a `"   "` stored key made the API provision a fresh key
       while clients sent blanks. Both sides now trim.
    6. **T7** — the compose `mcp` service had no volume and no key, so a default
       `docker compose up` could not authenticate. It now shares `massa-ai-data`, and both
       images set `XDG_CONFIG_HOME=/data` so `config.json` lands in the mounted volume.
    7. **T23** — the Codex/Cursor hook copies are owned by `generate-skill-artifacts.ts`, **not**
       `generate-subagent-artifacts.ts` as CLAUDE.md's hook paragraph implies. The subagent
       generator reported "No drift" against stale copies still shipping the broken hook. Run
       **both** `--check`s after touching any managed harness surface.
    8. **T8** — `tsc` found three `ExecResult` constructions the design did not name (two
       path-boundary refusals and the compile-failure return). They report the mode that would
       have applied rather than omitting the field.
    9. **T10** — the design prescribed a bare `row.project_id !== projectId`. Verified against
       source before implementing: `buildGraphStreamImpl` takes an *unresolved* `projectId?`, while
       `memories.project_id` holds canonical ids, so a strict `!==` against a retired alias would
       have dropped **every** neighbor. Two facts settle it — every read seam the search fuses is
       equally alias-unaware (`postgres-vector-store.ts:545`, `memory-repository-pg.ts:226,289`;
       the resolver appears only at write seams), and with a retired alias the seed set is empty so
       the function returns above the loop. Shipped as
       `projectId && row.project_id !== projectId`, matching those seams' `if (projectId)`
       semantics. Recorded in `design.md`.
    10. **T12** — BUG-04 needed one structure the plan did not anticipate, so it is wider than its
        "1 function" granularity row. `symbolIndex` is `Map<name, fqn>` with one entry per *name*
        and therefore cannot answer "does the namespace-imported module define this?" once another
        file wins the name — exactly the collision the bug is about. `buildSymbolIndex` now also
        returns `fqns: Set<string>`; one extra parameter each on `resolveFile` /
        `resolveEdgeTarget`, no extra pass.
    11. **T13** — tasks named one centrality call site (`rlm-indexing.ts:179`); there are **two**.
        `ensureFreshIndexImpl`'s incremental path (`:385`) carries the identical defect and is the
        path auto-reindex actually takes. Both fixed, both tested.
    12. **T14** — `insert` is synchronous and alias resolution is not, so the fix required a new
        cache-only `ProjectIdentityAliasResolver.resolveCached()`. It closes the window whenever
        the mapping is cached and **cannot** close it for an alias this process has never resolved
        — nothing can consult the database synchronously. That residual is documented at the call
        site and pinned by its own test; closing it would mean making `insert` async and changing
        the fire-and-forget contract the hook paths depend on.
  - **Out-of-band fix approved by the user (`48d0f39`, test-only).**
    `contextual-search-rlm-coverage.test.ts` was failing 11 pass / 3 fail **at HEAD**, verified by
    stashing all PR1 work and reproducing it. `ensureInitializedImpl` falls back to the real
    factory for any dependency the subject did not inject, and the file mocked four sibling
    factories but not `vector-store-factory.js` — so the three `makeRlm({})` warmupCache tests
    built a real `PostgresVectorStore` and ran live embedding-provider auto-selection, measured at
    **13.4 s cold** against `bunfig.toml`'s 5 s budget. The missing mock was added; no test was
    weakened, skipped or removed (14 before, 14 after) and the group now runs in 144 ms. This also
    explains why the recorded baseline and the observed red are both true: the cost is provider
    latency, so the same tests pass on a warm model cache and fail on a cold one.
  - **Owed measurement (T7): satisfied.** PR1's own CI run (`30317033460`, `mcp` job, "Measure
    the Docker bridge remote address" step) observed `ctx.request.ip = ::ffff:172.17.0.1` — a
    non-loopback bridge address, confirming the design premise. Recorded verbatim in
    `design.md` → "TASK-007 — the Docker path, instrumented rather than asserted", and SEC-06
    is now fully evidenced in `validation.md`.
  - Known load flakes seen repeatedly this session, green standalone every time, a different one
    each run: `apps/mcp-client` `embedded-api-client-endpoints.test.ts`, and `packages/core`'s
    `mock-free (113 files)` group and `trace-path.test.ts`. Do not chase them; re-run the package
    alone and say so rather than claiming a clean parallel aggregate.
  - PR1 shipped: merged as `af16ea2`, released as **v1.8.0**.
- **PR2 (DEBT-01..05, T16–T22) — execute complete** on `feat/audit-remediation-debt`.
  - Order: T16 → T17 → T18 → **T20 → T19** → T21 → T22. T20 precedes T19 deliberately: T19's
    gate needs the `--coverage` passthrough T20 added to the shared runner.
  - Committed: `2380615` T16, `2e6c16d` T17, `17f345a` T18, `7199d27` T20, `469fa4f` T19
    (implementation), `32a647a` T21, `dc7fee3` (scope addition), `341a9a5` T19 (verification),
    `6cf97ae` follow-on spec.
  - **AD-010** recorded before the rename it authorises (T16), superseding the `RLM_LLM_*`
    compatibility boundary held by `repo-rename-massa-ai` and `project-identity-rename`.
  - Two Execute-phase supersessions by the spec owner, both written into `tasks.md`/`design.md`:
    1. **T18** — the "zero source changes" non-goal was superseded. Adoption found **337**
       violations; honouring the non-goal literally meant downgrading 15 firing rules to `warn`,
       i.e. a gate that reports and never enforces. All 337 fixed instead; every correctness rule
       ships at `error`. The "no formatter, no reformat" non-goal is unchanged.
    2. **T18** — `turbo.json`'s `lint` task is not implementable per-package: turbo dispatches only
       to workspace packages, and `scripts/`/`benchmarks/` held 21 of the 337. Shipped as a root
       `oxlint` over the whole repo; the dead turbo task was removed.
  - PR2 Execute-phase divergences beyond those:
    13. **T19 — the gate's arithmetic was wrong, not the floor.** Run against the dedicated test
        database it reported **130 of 314** files below 90%, including files `coverage-90pct` had
        measured at 100%. Bun emits two shapes of lcov record for one file: an instrumenting group
        reports the real executable lines, a group that only imports the module transitively emits
        a degenerate record marking *every physical line* uncovered — blanks, braces and JSDoc
        included. On `graph-queries.ts` that was 220 lines covered 220/220 against seven shallow
        groups reporting 377 and covering 14, and the 157-line difference is entirely
        non-executable text. Unioning the denominators scored a fully covered file at 58.4%.
        `check-coverage.ts` now unions the **covered** set and takes the **minimum** executable
        set. 130 → 3, floor untouched at 90%.
    14. **T19 — the gate pins its own config environment.** Suites now run against a scratch
        `XDG_CONFIG_HOME`. Without it the numbers are a property of the machine, not the tree, and
        the developer's real `~/.config/massa-ai/` is writable by the run. This also closes the
        second open finding carried out of PR1.
    15. **T19 — 2 of the 3 remaining below-floor files are excluded as measurement blind spots**
        (`config/api-key.ts` 13.79%, `env.ts` 88.89%), taking the list from 9 to **11**. The third,
        `contextual-search-rlm.ts` at 63.55%, was a **real** gap and was closed to 100% with 27
        facade-forwarding tests rather than excluded — user decision. In-process coverage of
        `env.ts`'s four seeding lines was attempted and abandoned with evidence: `CONFIG_DIR`
        freezes at first import, `packages/shared` runs single-process so no test can guarantee it
        loads `env.ts` first, and `env.ts` dotenv-loads the nearest `.env` before consulting
        config.json.
    16. **Scope addition (user-approved): unit tests were reaching live providers.** The 2 Dart
        timeouts pre-existing at `c992ae9` were **not** a cold native compile. `CodeCompressor`
        reads `llm.enabled` from the developer's `~/.config/massa-ai/config.json`; with a local
        Ollama that is `true`, so the tests made a real network call — **42030 ms cold / 690 ms
        warm** against a 5 s budget. Passes warm, hangs cold, so it read as flakiness, and CI
        never saw it because CI has no config file. Fixed by pinning the seams the subjects
        already expose. The sweep found two siblings: `code-compressor.test.ts`'s first describe
        block, and `rlm-admin.test.ts`, which was missing the `vector-store-factory` mock — the
        identical omission `48d0f39` fixed in PR1 (2 fail / 10.15 s → 7 pass / 176 ms).
    17. **Instrumentation cost is a separate class from the leak, and is budgeted.**
        `etl-cache-invalidation` measured **66.42 s** standalone under `--coverage`; 30_000 passed
        one gate run and failed the next at 30001 ms, so it is 180_000. `etl-idempotent` is 670 ms
        instrumented — its 5 s failures were pure contention — so 30_000 is headroom, not cost.
        `architecture-map`'s three `getProjectMap` cases went 60_000 → 300_000, but for a
        different reason and only as a stopgap: their cost tracks accumulated shared test-database
        state (1213 ms fresh / 16.59 s post-gate / over 120 s mid-gate), and the isolation runner
        is sequential, so this is accumulation rather than contention.
        `bunfig.toml`'s global 5 s default is untouched throughout.
  - Core's isolated-group count is still exactly **126** (T20's pinned invariant): the 27 new
    facade tests extended the already-forked `contextual-search-rlm-coverage.test.ts` rather than
    adding a file, which would have made it 127.
  - `packages/core` merging **122** lcov files for **126** groups is explained and benign: Bun
    writes no lcov when a run's coverage record set is empty, and four groups either skip behind
    their own opt-in flags or import no product source. Not a collision — group indices are unique
    by construction.
- Follow-on registered: **`core-layering-god-module-split`**, Specify-only, `execute: false`. Owns
  the three items this feature deferred — the controllers-layer restructuring, the
  `contextual-search-rlm.ts` split, and the `rlm-*` filename rename. All six of its assumptions are
  open questions.
- Open findings carried forward, not actioned: `memory-controller.ts:274`'s inert
  `includePersistent` option (a behavior decision), and `packages/core`'s test runner having no
  isolation rule for `@massa-ai/shared` — 75 core test files import it and its barrel side-effects
  run against the real `CONFIG_DIR` under a plain `bun run test`.
- Skipped sensor: `recall` returned 0 memories for this workspace, so no durable memory informed
  this plan. Context7 MCP not registered — oxlint's rule catalogue is unverified against upstream
  docs and must be confirmed in TASK-018.

## Previous — Persona / Sub-Agent Boundary

- projectId: `massa-ai`
- workflowSessionId: `spec-persona-agent-boundary`
- workflow: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute)
- feature: `persona-agent-boundary` — **Execute complete, independently validated PASS**
- worktree: `../massa-ai-wt-persona-agent-boundary`; branch `feat/persona-agent-boundary`
  off `origin/main` @ `77dd144` (v1.6.0)
- scope: 10 requirements (PAB-01..10) closing five unstated boundaries between the persona
  layer and the 15 sub-agent charters
- Artifacts: `.specs/features/persona-agent-boundary/{spec,design,tasks,validation}.md`
- Key decisions:
  - D1 Persona propagates to sub-agents as an **optional advisory packet field** carrying
    the **id only, never the prompt**. User chose this over main-agent-only and over a
    read-only-roles allowlist (rejected as a new drift surface needing its own parity test).
  - D2 The Capability Packet's three definitions are **not** collapsed. They are three
    legitimate views (registry / runtime dispatch / role authoring). Instead the new field
    uses byte-identical clause text in all three, gated by a test asserting the clause
    appears in exactly those three files. Per-file paraphrase reads better and is
    untestable — a substring gate cannot tell a paraphrase from a weakening.
  - D3 Charter bodies feed **two** generators, not one. `generate-subagent-artifacts.ts`
    embeds the charter body verbatim (`:287`, `fm + c.body`) into
    `apps/*/agents/massa-ai-*.{md,toml}`, distinct from `generate-skill-artifacts.ts`'s
    raw copy into `apps/*/skills/agents/`. Naming only one was the plan's most serious
    defect; `subagent-parity.test.ts` would have gone red at the pre-PR aggregate, after
    six commits.
  - D4 A bare persona id is **not self-defining**, so "shapes emphasis" is an instruction
    a sub-agent cannot follow without knowing what the persona is. Banning `persona-router`
    does not ban reading `personas/<id>.md` — different paths. Both are banned now, or the
    outer-layer stance-vs-tool-scope conflict reappears inside a write-permitted agent.
  - D5 This takes a real release rather than the `no-changelog` label: harness contract
    text **is** the shipped product for the four plugin packages.
- Plan Challenge: full gate, mode `pre_mortem`, `massa-ai-plan-critic`. 2 critical, 1 high,
  2 medium — all incorporated before Execute began. D3 and D4 are findings 1 and 2.
- Evidence: integrity suite 24/24 (9 new cases observed red before the content commits);
  both generators `--check` no drift; `subagent-parity` + `skill-artifact-parity` 36/36;
  aggregate 567 pass / 4 fail where all 4 are the native tree-sitter suites failing only
  because the worktree was provisioned with `--ignore-scripts` (same suites 14/14 in the
  fully-installed checkout). Independent verifier PASS, 6 discrimination mutations killed.
- Residual risk: 5 test cases are presence-only by accepted design (no bounded absence
  fragment exists to assert against). The `persona` field is defined but no workflow emits
  it yet — runtime adoption is a tracked follow-up.
- Skipped sensor: massa-ai MCP server not registered this session, so `recall`/`remember`
  were unavailable; no durable memory was written for this feature.

## Superseded — Plugin Distribution Overhaul

- projectId: `massa-ai`
- workflowSessionId: `spec-plugin-distribution-overhaul`
- workflow: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute)
- feature: `plugin-distribution-overhaul` — **PR1 execute complete**, PR2 not started
- worktrees: `massa-ai-wt-pdo-a` (PR1 branch), `massa-ai-wt-pdo-b` (batch B, merged into A)
- branch: `feat/plugin-harness-gate-and-cleanup` (from `origin/main` @ `64b6feb`, v1.4.0)
- scope: 26 requirements (PDO-01..26) across 5 workstreams — OpenCode `.jsonc` resolution,
  skills bundled into all 4 plugins, all 4 plugins published, `qwen-profile.json` removal,
  CHANGELOG single-sourcing
- Spec: `.specs/features/plugin-distribution-overhaul/spec.md`
- Design: `.specs/features/plugin-distribution-overhaul/design.md`
- Tasks: `.specs/features/plugin-distribution-overhaul/tasks.md`
- Key decisions:
  - D1 `.jsonc` is **not** unconditionally correct — OpenCode core merges `opencode.json`
    *over* `opencode.jsonc`, so the installer probes for an existing file and only creates
    `.jsonc` when neither exists. Editing the losing file would be a silent no-op.
  - D2 `npm pack` **silently drops symlinks** (verified empirically: the linked file and its
    containing directory were both absent from the tarball, with no pack-time error). This is
    why skills are bundled as real checked-in files and why `codex`/`cursor`'s
    `hooks/massa-ai-hook` symlinks must become real files before those plugins can publish.
  - D3 The publish jobs have **no `actions/checkout`** — their entire filesystem is the
    `build-output` artifact. A `files` field cannot include what was never uploaded. This was
    already shipping broken: `@massa-ai/opencode-plugin@1.3.1` contained only `dist/` and
    `package.json` despite declaring `agents/*.md`.
  - D4 Two PRs, gate first (A10). The tarball gate landed in PR1 and was observed failing on
    the real defect before the fix existed — a gate never seen red is not evidence.
  - D5 `manifestHash` leaves the shared E2E identity; the commit SHA already encodes revision
    content. Provider/model/dimensions come from the embeddings config resolver, never raw
    `process.env` — a throw there nulls `SHARED_PID` and reintroduces a documented OOM.
  - D6 The Sub-Agent Registry stays **outside** the bootstrap markers. The boundary is
    host-portable policy vs repo-internal contribution machinery.
- Evidence: package-contents gate 5/5 pass (4/5 before the T2 fix, as designed); OpenCode
  helper 21 pass; install-agents shell suites 66/48/27/25 pass; `test-mcp-single-writer` 36
  pass; opencode-plugin 16 pass; `test:plugins` 73 pass; skills-harness-integrity 15 pass;
  `SHARED_PID` non-null with all three embedding env vars unset.
- Residual risk: PR2 (skills bundling + 4-plugin publishing) unstarted. The ~5 MB / 580-file
  bundle cost and the `hooks/massa-ai-hook` symlink replacement both land there.

## Previous — Workflow Harness Overhaul

- projectId: `massa-ai`
- workflowSessionId: `spec-workflow-harness-overhaul`
- workflow: spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute)
- feature: `workflow-harness-overhaul` — Execute complete, awaiting CI + merge approval
- worktree: `/Users/luizmassa/Projects/massa-ai-wt-harness`
- branch: `feat/workflow-harness-overhaul` (from `origin/main` @ `fd35379`, v1.3.1)
- scope: 24 requirements (WHO-R1..R24) — delete the `restart-save`, `restart-load`, and
  `agent-handoff` workflows plus the `handoff-writer` specialist and two references; add
  four cross-cutting references (project-context intake, implementation delivery protocol,
  code annotation, root-cause proof scripts); wire them across all 35 workflows
- Spec: `.specs/features/workflow-harness-overhaul/spec.md`
- Design: `.specs/features/workflow-harness-overhaul/design.md`
- Tasks: `.specs/features/workflow-harness-overhaul/tasks.md`
- Challenge: `.specs/features/workflow-harness-overhaul/fool.md` (full gate, pre-mortem)
- Report: `.specs/features/workflow-harness-overhaul/validation.md`
- Key decisions:
  - D1 Removal is harness-only. The MCP `handoff_*` tools and `workflows/long-session.md`
    survive — they are published product surface and compaction ownership respectively,
    not chat-restart routing. The contract suite asserts their survival as a negative
    control.
  - D2 Worktree isolation carries no size exemption. The exemption, not the ceremony, is
    what strands half-finished work on shared branches.
  - D3 Merge is never automatic. Green CI is the precondition for asking, not the approval
    — decisive in a repo where merging to `main` auto-cuts a release.
  - D4 Each new obligation is one reference plus one load line per workflow, never inlined
    prose, so a future edit stays a one-file change instead of a 35-file sweep.
  - D5 T1 and T2 merged into one removal commit: `skills-harness-integrity` rejects any
    dangling harness path, so splitting them would leave an intermediate commit where
    `agent-handoff.md` pointed at a deleted `restart-save.md`.
- Evidence: `test:scripts` 493 pass / 4 pre-existing env failures (no `packages/core/dist`
  in this worktree); `test:plugins` 66 pass / 0 fail; contract suite 46 pass / 0 fail,
  mutation-verified in both directions.


## Previous — Auto Release Versioning

- projectId: `massa-ai`
- workflowSessionId: `spec-auto-release-versioning`
- workflow: spec-driven (Large — Specify + Design + Tasks + Execute)
- feature: `auto-release-versioning` — COMPLETE + validated PASS
- branch: `feat/auto-release-versioning` (not pushed)
- scope: 13 requirements (ARV-R1..R13) — derive the version bump from the `[Unreleased]`
  section of `CHANGELOG.md` on every green CI run over `main`, tag it, publish a GitHub
  Release, publish to npmjs.org **and** GitHub Packages, remove the GitHub Deployment
  surface and the `next` prerelease channel
- Spec: `.specs/features/auto-release-versioning/spec.md`
- Design: `.specs/features/auto-release-versioning/design.md`
- Tasks: `.specs/features/auto-release-versioning/tasks.md` (T0-T8)
- Challenge: `.specs/features/auto-release-versioning/fool.md` (full gate, pre-mortem)
- Report: `.specs/features/auto-release-versioning/validation.md`
- Key decisions:
  - D1 GitHub Packages publishes as `@luizgmassa/*` — that registry resolves an npm scope
    to a GitHub owner, and `@massa-ai` is not one
  - D2 one `release.yml` calling `publish.yml` via `workflow_call`; **no PAT**, because a
    tag or release created with `GITHUB_TOKEN` raises no event
  - D3 the `next` prerelease channel is retired
  - D4 `Added`/`Changed`/`Removed`/`Deprecated` ⇒ minor; `Fixed`/`Security` ⇒ patch;
    empty `[Unreleased]` ⇒ no release; major never auto-incremented
  - D5 (user decision) CHANGELOG authoring rules are documented in **three** places by
    choice: full copies in both `CLAUDE.md` (§ Releasing and CHANGELOG authoring) and
    `CONTRIBUTING.md`, plus a quick-reference in the `skills/AGENTS.md` **bootstrap
    block**. `README.md` links to `CONTRIBUTING.md`. The bootstrap placement is
    deliberate: `install-skills.sh` copies that block to user-global
    `~/.claude|.codex|.cursor/AGENTS.md` and `~/.config/opencode/AGENTS.md`, so the rules
    load at session start in every project. Accepted trade-offs — this repo's versioning
    policy is visible outside this repo, and the two full copies can drift; keep them in
    sync when either is edited.
- Constraints: `qwen-profile.json` content-hash-pins the 5 `package.json` files the bump
  rewrites, so the release commit must carry a **selective** re-pin (ARV-R13) — never
  `bun run update-qwen-hashes` from the release path
- Validation: PASS — 13/13 requirements evidenced, 5/5 mutants killed, actionlint 0
  across all 5 workflows, `test:scripts` 0, `type-check` 6/6
- **Blocked on one operator action before merge:** `NPM_TOKEN` lived only inside the
  `DEPLOY` environment, and the repo-level secret list is empty. Removing
  `environment: DEPLOY` unbinds it. Re-create it at repository scope:
  `gh secret set NPM_TOKEN --repo luizgmassa/massa-ai`
- Open follow-up (out of scope here): **35 of 71** entries in `qwen-profile.json` are
  already stale on `main` — see `fool.md` F8. Needs its own `bench:needles:gate` evidence.
  Note `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` do not exist in any scope, so the Docker job
  has always failed silently behind `continue-on-error: true`.
- Expected first automated release: **v1.3.0** (minor, from `1.2.1`)

## Previous — Install Harness Migration

- projectId: `massa-ai`
- workflowSessionId: `spec-install-harness-migration`
- workflow: spec-driven (Large/Complex)
- feature: `install-harness-migration` — COMPLETE + validated PASS
- branch: `feat/install-harness-migration`
- scope: 7 requirements (IHM-R1..R7) — migrate `install-skills.ts` / `install-agents.ts` to
  bash following the plugin-installer heredoc pattern, make `install-agents.sh` the sole
  writer of host MCP config, add `scripts/install-harness.sh` and wire it into `install.sh`
  and `scripts/setup-local-first.sh`, replace the TypeScript installer suites with
  CI-gated bash suites, refresh README/FEATURES/CHANGELOG
- Spec: `.specs/features/install-harness-migration/spec.md`
- Design: `.specs/features/install-harness-migration/design.md`
- Tasks: `.specs/features/install-harness-migration/tasks.md` (T1-T20)
- Report: `.specs/features/install-harness-migration/validation.md`
- Key decisions:
  - D1 pure bash + inline `node`/`bun` heredoc (no `jq`, no `.ts` shim)
  - D2 `install-agents.sh` sole MCP writer; plugin installers delegate to it
  - D3 shared `install-harness.sh` orchestrator called from both entry points
- Constraints: `scripts/__tests__/root-install-menu.test.ts` grep-pins the `install.sh`
  menu strings, so the new option is additive (`k)`), never a rewrite of `c)`/`p)`
- Validation: PASS — test:scripts exit 0 (396 TS + 12 bash suites, 296 assertions), type-check 6/6, build 5/5, plugin tests 33/33
- Next step: none — feature complete.

## Previous — Coverage >90% Unit Tests

- projectId: `massa-ai`
- workflowSessionId: `spec-coverage-90pct`
- workflow: spec-driven (Large/Complex)
- feature: `coverage-90pct` — COMPLETE + validated PASS
- scope: 10 requirements (R1-R10), raise unit-test coverage across monorepo to >90% line per-file, 0 fail / 0 skip, fix bugs found
- Validation: PASS — 10/10 ACs verified, independent verifier confirmed all suites 0 fail, type-check 6/6, build 5/5, R10 disjoint, coverage >=90% for all in-scope source (9 documented exclusions)
- Report: `.specs/features/coverage-90pct/validation.md`
- Spec: `.specs/features/coverage-90pct/spec.md`
- Design: `.specs/features/coverage-90pct/design.md` (Batches A-L, disjoint write sets)
- Tasks: `.specs/features/coverage-90pct/tasks.md` (T1-T16)
- Commits (this session): `fb1a02c` (recover cancelled subagent work), `e3c11db` (Completion-1: search+context), `b19518e` (Completion-2: PG stores+symbol+apply)
- Prior commits: `a36a2a1`..`e28cb86` (Batches A-L, T1-T14)
- Key outcomes:
  - Core unit: 124 groups, 0 fail (up from 76 baseline)
  - All packages: 0 fail, 0 skip
  - 9 documented exclusions (tree-sitter native internals, ONNX, barrel re-export, e2e-gated health, env-boilerplate prisma-client)
  - R8 bugs fixed: graph-queries pinned cast, metadata double-encode, pagination determinism, SSE leak, migrateDataDirOnce isolation
- Next step: none — feature complete.

## Previous — Repository Rename Part 2

- projectId: `massa-ai`
- workflowSessionId: `spec-repo-rename-massa-ai-part2`
- workflow: spec-driven (Large/Complex)
- feature: `repo-rename-massa-ai-part2` — COMPLETE + validated PASS
- scope: 13 requirements (R1-R13), residual `th0th`/`massa-th0th` concept + identity references across bun.lock, CHANGELOG, .specs, skills, plugin agents, docs, source
- Validation: PASS — 13/13 ACs verified, discrimination sensor killed 1 mutation (observation-extractor `case "search":` → `th0th_search`), type-check 6/6, build 5/5, drift gate no-drift, 398+ tests green across affected suites
- Report: `.specs/features/repo-rename-massa-ai-part2/validation.md`
- Spec: `.specs/features/repo-rename-massa-ai-part2/spec.md`
- Key decisions (user gray-area resolutions):
  - D1: CHANGELOG historical `massa-th0th` refs rewritten to `massa-ai` (breaks append-only, accepted)
  - D2: observation-extractor `th0th_*` legacy case arms REMOVED (breaks DB backward-compat, accepted; no migration)
  - D3: .specs/features/** `th0th`/`Th0th` concept refs → `massa-ai`
  - D4: installation.md upstream corrected to `luizgmassa/massa-ai` (from stale `S1LV4/th0th`)
  - D5: README/FEATURES Credits `[th0th](S1LV4/th0th)` preserved
- Latent bugs found + fixed during lockfile regen:
  - web-ui type-check: added `@types/bun` devDep (was relying on accidental root hoisting)
  - subagent-parity test: added `toml` root devDep (was relying on transitive `effect` dep hoisting)
  - cursor+codex plugin hook symlinks: fixed stale `massa-th0th-hook.ts` target → `massa-ai-hook.ts`
- Next step: none — feature complete.

## Previous — Workflow Tools Adaptation

- projectId: `massa-ai`
- workflowSessionId: `spec-workflow-tools-adaptation`
- workflow: spec-driven (Large/Complex)
- feature: `workflow-tools-adaptation` — COMPLETE + validated PASS
- scope: 29 requirements (WTA-01..29), 9 user stories (4 P1, 4 P2, 1 P3)
- Validation: PASS — 29/29 ACs verified with grep-sensor evidence, 1/1 discrimination mutation killed, type-check 6/6, build 5/5. All 4 pre-mortem mitigations verified.
- Report: `.specs/features/workflow-tools-adaptation/validation.md`
- Commits: 12 commits (`e318fe9`..`5a1894d`)
- Spec: `.specs/features/workflow-tools-adaptation/spec.md`
- Design: `.specs/features/workflow-tools-adaptation/design.md` (Approach A: single-pass rename + selective adoption)
- Tasks: `.specs/features/workflow-tools-adaptation/tasks.md` (12 tasks across 4 phases)
- Plan Challenge: full The Fool pre-mortem mode; 5 failure narratives; 3 critical/high findings (F1 references not renamed, F2 graph tools lack freshness gate, F3 compact_snapshot session-id confusion) incorporated as plan revisions.
- Key decisions:
  - Canonical tool naming = un-prefixed (matching `tool-definitions.ts` CANONICAL_ORDER); all `th0th_*` references removed across 60 files.
  - `references/mcp-tools.md` expanded from ~20 to 52 tools (full MCP Capability Matrix).
  - Selective tool adoption: each workflow adopts only tools that materially benefit its flow.
  - Graph tools (`trace_path`, `impact_analysis`, `get_architecture`) include explicit freshness gates.
  - `compact_snapshot` uses lifecycle `sessionId`, NOT `workflowSessionId` (two-session-id rule).
  - `get_architecture` (architecture-specific) distinguished from `project_map` (general overview).
- Next step: none — feature complete.

## Previous — Subagent Skills Plugin Parity

- projectId: `massa-ai`
- workflowSessionId: `spec-subagent-skills-plugins-parity`
- workflow: spec-driven (Large/Complex)
- feature: `subagent-skills-plugin-parity` — COMPLETE + validated PASS
- scope: 44 requirements (CLA-01..10, CDX-01..10, CRS-01..08, OPC-01..10, DOC-01..07), 5 user stories, 4 host targets
- Validation: PASS — 42/44 ACs verified with file:line evidence, 3/3 discrimination mutations killed, 60 tests pass (818 assertions), type-check 6/6, build 5/5, drift gate exit 0. 2 non-blocking spec-precision gaps flagged (CRS-02/03 transitive, DOC-06 substring parity).
- Report: `.specs/features/subagent-skills-plugin-parity/validation.md`
- Commits: 14 commits on `spec-sub-agent-system` (bc57daa..851f29b)
- Spec: `.specs/features/subagent-skills-plugin-parity/spec.md` (checksum `e563bb80...`, v4 docs-parity amendment)
- Design: `.specs/features/subagent-skills-plugin-parity/design.md` (checksum `a7fa79c8...`, v1; Approach A chosen: one generator + four installer extensions)
- Tasks: `.specs/features/subagent-skills-plugin-parity/tasks.md` (checksum `59c28dab...`, v1; 12 tasks across 3 phases; pre-approval checks pass)
- Tasks plan: Phase 1 (T1-T4 generator foundation) → Phase 2 (T5-T8 installer extensions) → Phase 3 (T9-T12 docs + final gate). Single source of truth = `scripts/generate-subagent-artifacts.ts`; drift gate via `--check` + parity test.
- Design key decisions:
  - `scripts/generate-subagent-artifacts.ts` = single source of truth; reads `skills/*/SKILL.md`, emits per-host agent files into `apps/*/agents/`; outputs checked in; `--check` mode + parity test = drift gate (F1 mitigation).
  - Codex agents → `~/.codex/agents/*.toml` (OUTSIDE plugin dir; `# massa-ai-owned` top comment). OpenCode agents → `~/.config/opencode/agents/*.md` (OUTSIDE npm package; `metadata: { massa-ai-owned: true }`; shipped via `files` array update — R2).
  - Claude/Cursor agents → plugin's `agents/` dir (Claude uninstall excludes `massa-ai-navigator.md` by name — R1).
  - OpenCode: new `massa-ai-config agents install/uninstall` subcommand (extends `config-cli.ts`).
  - 10 risks R1-R10 documented with mitigations; no project-level AD (additive, no DB/binary).
- Docs parity (user follow-up): `README.md` = summary layer (12 names, pinned model+effort per host in compact form, link to FEATURES.md); `FEATURES.md` = depth layer (new "Subagent Skills (12 Specialists)" section: per-host names, file locations/formats, four model-pinning tables verbatim, effort pins, permission mappings, ownership markers, generator+parity contract). DOC-02/03/06/07 assert the split; DOC-06 asserts FEATURES.md ↔ spec table byte-parity (test).
- Model pinning (user follow-up): `model` PINNED per agent per host, NOT advisory. Claude aliases (haiku/sonnet/opus); Codex IDs (gpt-5.4-mini / gpt-5.6-terra / gpt-5.6-sol); Cursor + OpenCode use charter `metadata.model_hint` verbatim (DeepSeek V4 Pro / GLM-5.2 / MiniMax M3). Three model-pinning tables added to spec; AC CLA-10/CDX-10/CRS-08/OPC-10 assert exact pinning.
- Effort pinning (user follow-up): Claude `effort: high`; Codex `model_reasoning_effort = "high"`; Cursor `reasoningEffort: max` (field-name unverified — subagent docs 404; pass-through, harmless if ignored); OpenCode `reasoningEffort: max` (pass-through, provider-dependent honoring for DeepSeek/GLM/MiniMax). ACs CLA-10/CDX-10/CRS-08/OPC-10 updated.
- Plan Challenge: lite-escalation inline (subagent spawning unavailable — `cavecrew-reviewer` model not found). 8 findings F1-F8; F1 (drift), F2 (name collision), F4 (OpenCode bash ambiguity), F5 (out-of-plugin-dir ownership marker), F6 (Claude tools format) incorporated as assumptions + ACs. Escalate-to-full: false.
- Decisions (feature-local, no project-level AD):
  - Ship as host-native subagent definitions (Claude `agents/*.md`, Cursor `agents/*.md`, OpenCode `agents/<name>.md` mode: subagent, Codex `agents/<name>.toml`).
  - Full native frontmatter adaptation (tools/sandbox_mode/permission per host; model hint as advisory body comment, omitted from frontmatter).
  - No new lifecycle hooks (invocation-based specialists; existing 6 lifecycle hooks unchanged; shared binary untouched).
  - Codex/OpenCode agents live OUTSIDE the plugin dir (shared agent dirs) → in-file ownership marker (`# massa-ai-owned` comment / `metadata: { massa-ai-owned: true }`).
  - Single source of truth: `scripts/generate-subagent-artifacts.ts` emits shipped files from `skills/*/SKILL.md`; parity test asserts byte-identity (drift fails CI).
  - Existing `massa-ai-navigator.md` (Claude/Cursor) preserved; 12 specialists additive.
- Next step: Design phase (`references/spec-driven/design.md`) — architecture, components, per-host frontmatter mapping table, generator design, verification design.

## Previous — Codex + Cursor Plugin Parity

- projectId: `massa-ai`
- workflowSessionId: `spec-codex-cursor-plugin-parity`
- workflow: spec-driven (Large/Complex)
- feature: `codex-cursor-plugin-parity` — COMPLETE + validated PASS
- branch: `spec-codex-cursor-plugin-parity` (off `main`)
- scope: 28 requirements (CPX-01..08, CRS-01..08, INS-01..12), 20 tasks across 4 phases
- Phase 1 (T1-T6): COMPLETE — binary `pre-tool-use` + Codex plugin (manifest, skills, hooks.json, .mcp.json, install.sh, README, tests)
- Phase 2 (T7-T11): COMPLETE — Cursor plugin (manifest, skills, hooks.json with 7 events incl. sessionStart + preCompact, mcp.json, agents, install.sh, README, tests)
- Phase 3 (T12-T15): COMPLETE — root install.sh plugin menu (Codex/Cursor), install-agents.ts deconfliction hints, README, stale Cursor note removed
- Phase 4 (T16-T20): COMPLETE — Claude Code hooks auto-write into settings.json, root menu extended to 4 tools (Claude/Codex/Cursor/OpenCode), install-agents.ts Claude/OpenCode hints, README 4-plugin parity
- Validation: PASS — 28/28 ACs verified, 5/5 discrimination mutants killed, 112 tests pass, type-check 6/6, build 5/5
- Report: `.specs/features/codex-cursor-plugin-parity/validation.md`
- Commits: 17 commits on `spec-codex-cursor-plugin-parity` (1a59854..fcda808)

## Previous — Wave 7

- projectId: `massa-ai`
- workflowSessionId: `spec-wave-7-hygiene-ui-process`
- workflow: spec-driven (Large/Complex)
- feature: `wave-7-hygiene-ui-process` (Wave 7) — COMPLETE + validated PASS
- branch: `wave-7` (off `main`)
- scope: 13 requirements (W7-01..W7-13), 15 tasks across 3 phases
- Phase 1 (T1-T7): COMPLETE — hygiene (AGENTS.md, version pins, LLM defaults, CHANGELOG, D5 ADR, doc cleanup, removed-features)
- Phase 2 (T8-T12): COMPLETE — features (web UI markdown+write+SSE, json_schema, sandbox)
- Phase 3 (T13-T15): COMPLETE — cleanup (spec archive, wave-2 reconcile, hook breadcrumb)
- Validation: PASS — 13/13 ACs verified, 3/3 mutations killed, gates green
- Report: `.specs/features/wave-7-hygiene-ui-process/validation.md`

## Decisions

| ID | Status | Decision | Evidence |
| --- | --- | --- | --- |
| AD-007 | active (T12) | Executor sandbox default is `auto` (not `on`); uses platform tool if available, falls back to best-effort. F1 mitigation. | `sandbox.ts` getSandboxMode, `MASSA_AI_EXECUTOR_SANDBOX=auto\|on\|none` |
| AD-008 | active (T11) | json_schema constrained decoding for Ollama structured calls; version-gated (>= 0.5.0), graceful fallback to json_object. F3 mitigation. | `llm-client.ts` _checkJsonSchemaSupport, llmObject |
| AD-009 | active (T5) | D5 Cypher subset deferral formally removed — structural graph traversal covers use cases. | `docs/adr/0001-remove-d5-cypher-subset.md` |
| AD-010 | active (audit-remediation-2026-07 T16/T17) | **This project has exactly one environment-variable prefix: `MASSA_AI_`.** The ten `RLM_LLM_*` vars are hard-renamed to `MASSA_AI_LLM_*` with **no dual-read** — the old names are removed, not deprecated, and setting one has no effect. This **supersedes** the compatibility boundary recorded in `repo-rename-massa-ai` (spec R3.4 / design "explicitly excluded") and `project-identity-rename` ("retained subsystem names … are intentional compatibility boundaries"), both of which are annotated as superseded rather than rewritten. Rationale: `RLM_` names no subsystem that still exists under that name — it is a residual of the pre-rename project identity, so the "subsystem namespace" justification no longer describes anything. A second live prefix also costs a permanent tax on `turbo.json`'s `passThroughEnv`, which today lists only 4 of the 10 vars, so six of them already arrive `undefined` under `bun run test` — a silent bug that a rename without the passThroughEnv completion would have preserved under a new name. Rejected alternatives: (a) **dual-read with deprecation warning** — rejected because it doubles the resolution surface permanently and the repo has no released consumer contract on these vars (they are developer/runtime knobs documented in `.env.example`, not a published API); (b) **leave `RLM_LLM_*` alone** — rejected because it is the last identity residual and keeps two prefixes in every doc and config example; (c) **config.json key migration** — not needed: the config-file keys are already prefix-free, so no config migration ships. Breaking change: yes, announced in `CHANGELOG.md` under `### Changed` at T22. | `packages/shared/src/config/index.ts`, `packages/shared/src/env.ts`, `turbo.json` `passThroughEnv` (all 10 listed), `.env.example`, `packages/core/src/services/memory/llm-client.ts` |
| AD-011 | active (audit-remediation-2026-07 T3/T15) | **The Tools API never serves an anonymous request.** A key is always present — by `MASSA_AI_API_KEY`, by `security.apiKey` in `config.json`, or by first-start provisioning. The no-key pass-through is deleted, not made configurable: there is no supported way to run the API open. Startup fails non-zero only when no key exists *and* the config file is unwritable. The bind address stays `0.0.0.0` (AS-05) precisely because exposure is now closed by authentication rather than by address, so Docker port mapping keeps working unmodified. Public paths are a fixed, tested list (`/health`, `/swagger`, `/swagger/json`, `/ui`, `/ui/`) matched by prefix, with a decoy-path test proving `/uixyz` is not exempt. | `apps/tools-api/src/middleware/auth.ts` (`initAuth`, `isPublicPath`), `src/startup-config.ts` (`initAuthOrExit`), `packages/shared/src/config/api-key.ts` (`resolveApiKey`), commits `41b2f90` / `976370f` |
| AD-012 | proposed (core-layering-god-module-split AS-01, closed 2026-07-28; **not yet implemented**) | **The `controllers/` layer is retired. `packages/core` is `tools → services (some of which orchestrate) → data`, enforced by a CI import-direction check.** The four-layer contract stated in `src/index.ts` and `CLAUDE.md` was never adopted: 31 tools, 6 controllers, and `tools → services` 34× against `tools → controllers` 6×. Only **3 of the 6** controllers hold what the contract claims for them — `MemoryController.store` publishes a domain event and fires two background side-effects (`memory-controller.ts:164-171,184-186`), `SearchController.searchProject` emits `search:completed`/`search:reranked` (`search-controller.ts:239-250,282-295`), `ContextController` composes two controllers plus a graph service, compressor and metrics singleton (`context-controller.ts:120-171`). The other three do not: `GraphController` is a validate→call-one-service→reshape wrapper that `tools/trace_path.ts:161` duplicates, `ExecutorController.execute`/`executeFile` are 1:1 wraps whose only addition is error mapping, and `index.ts` is a barrel. Those 3 move into `services/` as named orchestrators, following the precedent **already in the tree**: `WebController` lives at `services/web/web-controller.ts` and both transports instantiate it. `ExecutorController` keeps its exported symbol name because `apps/tools-api/src/routes/executor.ts:13` and `apps/mcp-client/src/embedded-api-client.ts:43` import it directly from the root barrel — it is public surface despite its directory. Rejected alternatives: (a) **adopt controllers for all 31 tools** — rejected on evidence, it is ~7-9 genuinely new orchestration controllers plus ~11 pure pass-throughs written as ceremony, for 34 import rewrites; (b) **keep controllers optional and only fix import direction** — rejected because it leaves "controller" naming nothing precise while `WebController` already contradicts it. Note the layer contract's dominant violation is elsewhere entirely: **24 of the 36 backward imports are `data → services`**, mostly `getPrismaClient`, and are unrelated to this decision. Breaking change: no — the published MCP/REST surface binds to Tool classes, and the one directly-imported controller keeps its name. | `packages/core/src/{index.ts,controllers/,services/}`, `packages/core/package.json` `"./controllers"` exports subpath, `CLAUDE.md` Architecture section |
| AD-013 | active (sensor-repair-2026-07 SEN-04, implemented 2026-07-28, commits `27dda6c` / `5e018e5` / `d5b5813`) | **A retrieval-benchmark needle is identified by content, not by file position, and an unresolvable needle is a hard failure.** The needles gate scores a hit only on `filePath` equality **and** line-range intersection within `lineTolerance` (5) — `benchmarks/needles/scorer.ts:94-104`, replicated verbatim in `benchmarks/needles/run.ts:85-96` and again in `packages/core/src/__tests__/e2e/14.needles.test.ts:119-133`. `run.ts:233-236` skips a missing target with a `[warn]` and scores the needle **zero**, and `scorer.ts:111,124,135` average that zero over the full needle count rather than dropping it. The consequence is not a weak sensor but an inverted one: 7 of 14 needles sit in `services/search/`, so any refactor that moves them caps `MRR` at 0.50 against a **0.65** floor — a guaranteed failure independent of retrieval quality, indistinguishable from a real regression. Positional pinning is the root defect, not the filename: with `lineTolerance` at 5, a span that moves more than 5 lines inside a file of the same name breaks its needle too. Rejected alternatives: (a) **baseline then mechanically re-point the fixture after the refactor** — rejected because the sensor would be edited by the change it validates, and a re-point landing on subtly different code hides exactly the regression the gate exists to catch; (b) **drop the needles clause and rely on characterization tests** — rejected because it leaves retrieval quality with no sensor at all across the riskiest change in the backlog. The loud-failure half matters more than the anchoring half: a silent skip is what made the gate untrustworthy. **Implemented.** Needles carry a unique code `anchor` plus signed `startOffset`/`endOffset`; `{anchor, endAnchor}` was measured unbuildable (only 3 of 11 needles have both boundaries on a repo-wide-unique code line; N03 ends on a blank line and N13 starts on one) — see `design.md`, Second fork. Resolution runs before any embedding, so a stale fixture costs seconds, not a wrong number. Three consumers became one: `resolve.ts` owns `intersects`/`findRank`. The predicted failure was confirmed by measurement, not reasoning — the gate had been red since `56c84d1` because N07/N08/N09 pointed past EOF of an 81-line file, and repairing the *instrument* alone took MRR from 0.569 to 0.736 with no retrieval code, chunker parameter or floor touched. `scorer.ts` keeps a positional path for external corpora (`sicad`) whose sources are not in this repo; the pass/fail gate `run.ts` does not. | `benchmarks/needles/{resolve.ts,run.ts,scorer.ts,fixtures/massa-ai.json}`, `packages/core/src/__tests__/e2e/{14.needles.test.ts,_helpers.ts}`, `scripts/__tests__/needle-resolution.test.ts` |

---

## Wave 7 — Active

- projectId: `massa-ai`
- workflowSessionId: `spec-wave-7-hygiene-ui-process`
- workflow: spec-driven (Large/Complex)
- feature: `wave-7-hygiene-ui-process` (Wave 7) — IN PROGRESS
- branch: `wave-7` (off `main`)
- baseline: `56c84d1`
- scope: 13 requirements (W7-01..W7-13), 15 atomic tasks across 3 phases
- Phase 1 COMPLETE: T1-T7 committed (32b5ce4..815488f)
- Phase 2 COMPLETE: T8-T12 committed (f0b92cd..2a2aee9)
- Phase 3 IN PROGRESS: T13 done, T14-T15 remaining
- Pre-mortem: 5 findings (F1 sandbox auto, F2 realpathSync, F3 json_schema log, F4 XSS, F5 bot PR skip)
- Spec: `.specs/features/wave-7-hygiene-ui-process/spec.md`
- Design: `.specs/features/wave-7-hygiene-ui-process/design.md`
- Tasks: `.specs/features/wave-7-hygiene-ui-process/tasks.md`

---

## Wave 5 — Active

- projectId: `massa-ai`
- workflowSessionId: `spec-wave-5`
- workflow: spec-driven (Large/Complex)
- feature: `wave-5-cross-pollination` (Wave 5, P1) — COMPLETE + validated PASS
- branch: `wave-5` (off `main` post-`92b7fb4`)
- baseline: `92b7fb4`
- scope: 26 requirements (FR-01..FR-26), 29 acceptance criteria, 27 atomic tasks across 9 phases
- gray areas: all 8 resolved (see `.specs/features/wave-5-cross-pollination/context.md`)
- plan-critic revisions: FR-20..FR-26 / AD-W5-013..AD-W5-020 incorporated
- B1 (graph features) COMPLETE: T01-T08, 8 commits (9a73b4b..14744ce)
- B2 (grouped format + indexing) COMPLETE: T09-T16, 8 commits (a12f9f6..6740a3e) + 1 test-isolation fixup (a0c67d6)
- B3 (search/scheduler/synapse) COMPLETE: T17-T24, 8 commits (2c21db6..56e5c10)
- B4 (defense + validation) COMPLETE: T25-T27, 3 commits (1509732..38b04bb) + independent verifier PASS (7/7 ACs, 3/3 mutations killed)

---

## Wave 4 — Complete

- projectId: `massa-ai`
- workflowSessionId: `spec-wave-4-correctness-hygiene`
- workflow: spec-driven
- feature: `wave-4-correctness-hygiene` (Wave 4, P1) — COMPLETE + validated PASS
- status: complete (T1–T20 all done; independent verifier PASS: 13/13 ACs, 4/4 discrimination mutations killed, gates green, no gaps)
- branch: `main`
- baseline: `f3d8020`
- residual risk: pre-existing `qwen-e2e-fixture` failure (documented, owned by `sqlite-removal-followup` SQLRFU-002 — not Wave 4 task-owned)

---

## Wave 3 — Active

- projectId: `massa-ai`
- workflowSessionId: `spec-wave3-followup` (native-runtime-rebaseline follow-up); prior `spec-m21` (M21) COMPLETE.
- workflow: spec-driven
- feature: `native-runtime-rebaseline` (Wave 3 follow-up, P1) — T1–T6 COMPLETE + validated PASS. T1 merge `b6aa4a4`; T2 test rewrite `428d462`; spec artifacts `846ff29`; T3 classification `e866ea5` + `17eedfd`; T4 npm reconcile (no code change — Codespace npm 11.12.1 → 11.14.1 install); T5 cross-platform verify (Codespace Bun 1.3.14 install, ABI 137, both platforms `verify:tree-sitter-native` exit 0, 152/152 native-structural); T6 AD amendment + validation.md (this commit). Status: `complete`.
- prior: `linux-native-structural-runtime` (M21, P0) — COMPLETE + validated PASS.
- status: M19, M20+M54, M50, M16+M17, M45+M47, M21 complete. **native-runtime-rebaseline COMPLETE** (T1–T6: `b6aa4a4`/`428d462`/`846ff29`/`e866ea5`/`17eedfd` + T4/T5/T6). Phase A (T1–T2) PASS on macOS arm64; Phase B (T3) six-suite classification — 2 FIX (`e866ea5` auto-improve LLM-surface isolation defect, `17eedfd` qwen fixture re-lock after identity-guard drift) + 4 DOCUMENTED-ACCEPT (etl-cache-invalidation, etl-pipeline-queue, scheduler-store-pg, trace-path — shared-DB fixture gaps: `graph_generation_workspace_missing:*`, `scheduled-*` pollution) — **RESOLVED in Wave 6**: `clearProject` now deletes `graph_generations` rows (prevents orphaned generations), `architecture-map.test.ts` calls `markIndexing` before `EtlPipeline.run` (prevents workspace-missing race), qwen fixture hashes re-locked after N31 decomposition; Phase C (T4–T5) npm reconciled 11.14.1 both platforms, Bun 1.3.14 installed on Codespace (ABI 137), `verify:tree-sitter-native` PASS on macOS arm64 + Ubuntu Codespace (33+33 parses, 27+27 modules, 10 sensors, RSS -188 KB Codespace / +589 KB macOS < 16 MiB, packed package PASS, 152/152 native-structural both platforms). Phase D (T6) AD-004/005/006 amendment + validation.md.
- branch/worktree: `wave-3` / `massa-ai-wt-wave-3`
- sequence: M19 → M20+M54 → M50 → M16+M17 → M45+M47 ✅ → M21 ✅ → native-runtime-rebaseline ✅
- invariant: `sqlite-removal` complete; `sqlite-removal-followup` in_progress (M29); `multi-language-tree-sitter-breadth` reconciled to `complete` from its recorded PASS evidence.
- cleanup: temp branch `wave-3-codespace-sync` on origin (used to sync Codespace for T5) — delete after feature closure.

### Wave 3 Next Step

native-runtime-rebaseline complete. Wave 3 follow-up exhausted. Clean up: delete temp remote branch `wave-3-codespace-sync`. No push of `wave-3` (contract). Independent verifier (author ≠ verifier) to run full gate matrix + discrimination sensors and confirm PASS per spec-driven validate.md.

---

## Current

- projectId: `massa-ai`
- workflowSessionId: `spec-multi-language`
- workflow: spec-driven
- persona: AI Engineer
- feature: `multi-language-tree-sitter-breadth`
- status: EXECUTE + VALIDATE complete (feature verdict PASS). Native runtime re-baselined to Bun `1.3.11` + Node `25.9.0` (npm `11.14.1`); TASK-001 through TASK-026 PASS. MLTS-022 performance contract reframed on 2026-07-17 (spec-owner approved): the 16 MiB explicit-disposal/forced-GC stress is the hard native-safety gate (PASS, 82 KB median delta); candidate throughput/RSS (≈1.20 MB/s, ≈290 MB) recorded as an absolute self-baseline. Output-preserving optimizations committed: `490f302`, `13718af`, `4a26353`. Final independent verifier PASS.
- branch: `main`
- baseline: `5d43a96f4c0f1dfbd04ee7ae95f589f9b023bf03`
- push: not attempted

## Objective

Replace regex structural extraction with pinned native Tree-sitter grammars and versioned query/resolver contracts across all 33 canonical extensions while keeping semantic chunking, embeddings, ranking, and search behavior unchanged.

## Active Constraints

- TASK-001 is a no-fallback feasibility gate on exact Bun/macOS arm64. Every required grammar must install, load, and parse before production implementation.
- Native runtime downloads, WASM fallback, raw CST persistence, compiler/LSP resolution, and semantic-search changes are out of scope.
- Structural generations cover files, definitions, references, imports, centrality, diagnostics, and full counts; DB lease/snapshot/CAS activation must finish before terminal job state.
- Required-file hard failure blocks generation activation; incremental hard failure retains last-known-good active structure with stale diagnostics.
- TS/JS native-safety is bounded by the 16 MiB explicit-disposal/forced-GC stress gate (MLTS-022 reframed 2026-07-17, spec-owner approved); candidate throughput/RSS are an absolute self-baseline, not a regex-relative threshold, because the candidate is a full 33-language AST indexer vs the `5d43a96` single-regex baseline.
- One atomic commit per task. Sequential phase workers are authorized; independent verification is mandatory.

## Decisions

| ID | Status | Decision | Evidence |
| --- | --- | --- | --- |
| AD-001 | active after TASK-001/TASK-002 verification | Structural parsing uses pinned native Tree-sitter grammar artifacts plus repository-owned query/resolver packs; no runtime-download or WASM fallback. | TASK-001 matrix; TASK-002 frozen dependency/verifier gates |
| AD-002 | proposed; activate after migration/CAS tests | Graph schema upgrades build generation-scoped structure beside active data and activate through DB lease, immutable snapshot, completeness, and CAS. | `design.md`, full pre-mortem |
| AD-003 | active codec; transport parity pending T12/T20 | One versioned FQN codec owns modern IDs, legacy aliases, collision failure, and ambiguity payloads; later persistence/HTTP/MCP tasks must consume it without reimplementation. | TASK-006 canonical hash, collision, ambiguity, and independent review gates |
| AD-004 | active after TASK-004 PASS; re-baselined 2026-07-16 | Exact Bun `1.3.11` loads upstream native packages through one serialized compatibility loader that snapshots, removes, and restores the full `process.versions.bun` descriptor before parsing. Exact Node `25.9.0` is the build-only `node-gyp` helper (npm `11.14.1`). | TASK-001 native evidence; TASK-004 fault, readiness, startup, and direct-guard gates |
| AD-005 | active after TASK-002 PASS; re-baselined 2026-07-16 | The runtime identity combines upstream `tree-sitter@0.25.0` SRI with patch SHA-256 `e79aec7b96eb8114e85ebcb90f0a8b12076bcd8aa08c09bb88929621e1c1446d`, adding idempotent cursor/tree deletion, stale-object guards, immutable JS owner identity, same-tree cursor reset enforcement, generated-addon packaging, a C++20 `binding.gyp` (Node 25 headers), and an install-guard that no-ops when the prebuilt addon is present. Core bundles the patched dependency for packed consumers. | TASK-002 no-delete control, hardened prototype, independent crash reviews, fresh normal packed consumer, final independent PASS; re-baseline cold install + source/dist native verifier under Bun 1.3.11/Node 25.9.0 |
| AD-006 | active after TASK-005 PASS | Production uses one process-global FIFO parser pool: default capacity 4/hard max 32 and default acquisition timeout 5,000 ms/hard max 60,000 ms. Runtime owns cursor-before-tree cleanup and never returns empty success without a query executor. | TASK-005 overlap, timeout, retarget recovery, hard-outcome, native lifetime, RSS, and independent review gates |
| AD-004 (amendment 2026-07-21, native-runtime-rebaseline) | active; Bun pin moved 1.3.11 → 1.3.14 via merge of main (`e12c4e4`) into `wave-3` | Wave-3 absorbed main's Bun `1.3.14` bump + lock-contract `record.includes` fix via merge commit `b6aa4a4`. Node `25.9.0` unchanged; npm `11.14.1` unchanged (Codespace npm 11.12.1 → 11.14.1 install reconciled). ABI `137` unchanged (confirmed on both platforms). Native load still uses the masked-Bun Node-path (`withMaskedBunVersion` → `node-gyp-build` → `build/Release`). | `verify:tree-sitter-native` PASS on macOS arm64 + Ubuntu Codespace under Bun 1.3.14; `verify-tree-sitter-grammars.test.ts` 9/9; native-structural 152/152 both platforms |
| AD-005 (amendment 2026-07-21, native-runtime-rebaseline) | active; patch SHA `e79aec7b...` unchanged; only the Bun pin moves | Patch SHA `e79aec7b96eb8114e85ebcb90f0a8b12076bcd8aa08c09bb88929621e1c1446d` unchanged under Bun 1.3.14. Immutable owners, same-tree reset, install-guard, C++20 `binding.gyp`, 33-language manifest, versioned FQN codec, lazy grammar pool, embedded Vue/Markdown all unchanged (FROZEN contract). | 33+33 parses, 27+27 modules, 10 sensors, RSS -188 KB (Codespace) / +589 KB (macOS) < 16 MiB on both platforms under 1.3.14 |
| AD-006 (amendment 2026-07-21, native-runtime-rebaseline) | active; parser pool contract unchanged; only the Bun pin moves | Parser pool (capacity 4/max 32, timeout 5s/max 60s), cursor-before-tree cleanup, non-empty-success guarantee all unchanged under Bun 1.3.14. | 10 behavior sensors PASS on both platforms; RSS stress gate PASS (100 cycles, median delta well within 16 MiB) under 1.3.14 |

## Progress

- Required coding bootstrap, memory recall, persona routing, source investigation, and full Plan Challenge completed.
- Supplied plan revised until the Plan Critic reported no remaining critical/high contradiction.
- Canonical `spec.md`, `context.md`, `design.md`, `tasks.md`, `capability-matrix.md`, and initial `gate-manifest.md` created.
- 23 requirements, 12 acceptance criteria, 26 atomic tasks, seven phases, and independent verifier contract are frozen.
- Current source evidence: all 33 allowed extensions route through native structural extraction; the deterministic polyglot fixture proves 29 Flow-tier extensions and four Structure-tier extensions.
- TASK-001 target discovery measured macOS 26.5.2 arm64 with Bun 1.3.11. The user then narrowed platform scope to macOS arm64 only, reopening the grammar artifact loop. No production file changed yet.
- TASK-001 PASS: exact Bun 1.2.0 was rejected; exact Bun 1.3.0 passed a second frozen clean install, all 33 extension parses twice, 27 loaded native modules with Mach-O arm64/system-only linkage, and missing/incompatible negative sensors.
- Frozen selections include modern pinned Dart and Erlang Git commits, Clojure Orchard, and HTML as the Vue SFC host. No WASM or runtime download was used.
- TASK-002 initially pinned exact Bun 1.3.0, exact Node 22.22.2 build-helper contract, all 27 audited native dependencies/trust entries, and the frozen lockfile. Its first implementation passed fresh install, focused tests, type-check, and build, but independent review rejected the verifier as insufficient.
- TASK-002 remediation closed cold real source/dist consumers, queue release after setup/restoration faults, and exact resolved lock identities/integrities. The reference-only lifetime proposal was then falsified: stock binding parses retained about 1 MiB RSS per repeated 32 KiB parse under forced GC.
- A full native patch red-team rejected a root-only patch for packed consumers and required stale-object guards. The hardened source-and-packaging patch now adds idempotent cursor/tree deletion, live guards across Tree/Node/Query/oldTree/Cursor operations, and generated-addon delivery through core's bundled dependency.
- Independent review found a second critical native path: mutable public node/cursor `.tree` properties allowed a deleted owner to be replaced with a live tree and caused SIGSEGV. Patch v2 binds both owners as non-writable/non-configurable and adds cold substitution sensors.
- A follow-up review found cross-tree cursor reset/resetTo could bypass or desynchronize owner identity. Patch v3 marshals only same-tree reset nodes and rejects cross-tree cursor transfer in JS plus native code; the declaration marks both owners readonly.
- Authoritative patch v3 gates pass: empty-cache 770-package install; 9 focused tests/54 assertions; real cold source/dist 33+33 parses and 27+27 modules; ten behavior sensors; patched 100-cycle median below 1 MiB versus a roughly 125 MiB no-delete control; type-check 6/6; build 5/5.
- Fresh npm-packed shared/core installed into a normal consumer. Built core resolved only the nested runtime; immutable owners, same-tree reset, cross-tree reset/resetTo rejection, stale throw, and system-only Mach-O arm64 linkage passed.
- Exact Node 22.22.2/npm 10.9.7 packed shared/core after Bun 1.3.0 packing was proven to omit bundle payloads. A normal non-workspace Bun consumer imported built core, resolved the nested patched runtime, parsed/double-deleted, and loaded a system-only Mach-O arm64 addon.
- Clean build exposed pre-existing direct `zod` imports in core without a direct declaration; TASK-002 added `zod` as the minimal required dependency.
- TASK-003 froze the normalized structural contracts and exact ordered 33-extension manifest. Exact Bun 1.3.0 focused tests passed 6/6 with 451 assertions; uncached type-check/build passed; independent review's sole `parameterIndex` versus `paramIndex` mismatch was remediated and accepted.
- TASK-004 added literal lazy native grammar loading, exact serialized Bun-marker restoration, cached all-33 readiness, live-but-parser-failed health, startup validation ordering, and pre-side-effect guards for the tool, ETL, and legacy direct index paths. Focused/native/regression/type/build/dist gates and independent review passed.
- TASK-005 added the process-global bounded FIFO parser pool, structural runtime, bounded diagnostics with total counts, validated grammar-cache handoff, and native lifetime ownership. Review-driven fixes closed per-runtime cap multiplication, poisoned retarget-slot reuse, and public raw grammar access.
- TASK-006 added immutable UTF-8 byte/point indexing, embedded host-child span remapping, legacy line derivation, canonical full-SHA FQNs, legacy aliases, collision detection, and deterministic ambiguity payloads. Review-driven strict parsing prevents malformed modern-looking suffixes from masquerading as legacy names.
- TASK-007 added runtime-owned bounded native Query execution/cache identity and declarative TS/JS/TSX/JSX packs. Review-driven fixes completed typed signature/import material, exact exports/relations/calls/flow/specialized edges, capability filtering, private-name encoding, native dialect breadth, and AST-safe modifier identity.
- TASK-008 added an exact `(dialect, resolverVersion)` registry, generation-scoped identity session, and deterministic TS/JS resolver for lexical, import, re-export, namespace, default-owner, global, ambiguity, unresolved, and legacy outcomes. Review-driven direct probes closed nested-basename leakage, dynamic import namespaces, barrel forwarding, private export leakage, and default-owner member qualification.
- TASK-009 routed TS/JS/TSX/JSX ETL structural work through the native runtime, retained exact `smartChunk` output, persisted generation-scoped resolver results, froze executable pre-T9 parity evidence and approved additions, and removed the superseded TS/JS regex typed-edge path. Focused 105/105, native source/dist, type/build, diff, and independent review gates passed.
- TASK-010 added the locked transactional graph-generation migration, deterministic legacy backfill, generation-owned graph keys/metadata, active/pending/lease state, full counts, and an active-scoped T9 repository bridge. Owned PostgreSQL 17 passed 3/3 with 62 assertions; clean migration, migrated ETL, type/build, and independent review gates passed.
- TASK-011 added the PostgreSQL lifecycle repository for serialized begin, heartbeat, completion, CAS activation, abort, lease-expiry takeover, and superseded cleanup. The owned macOS arm64 PostgreSQL suite passed 11/11 with 67 assertions after review fixes made expired abort non-mutating and protected last-known-good generation pointers. T13 retains ownership of discovered-file snapshot membership and post-snapshot content-delta reconciliation.
- TASK-012 generation-scoped symbol storage now validates live pending leases, atomically replaces/deletes/stales per-file graph rows, removes stale inbound edges, captures one active generation for batch reads/writes, replaces centrality exactly, and resolves modern/legacy FQNs with deterministic ambiguity. Owned PostgreSQL passed 12/12 with 38 assertions after race and identity review remediation.
- TASK-013 integrates complete pending generations through real Discover/Parse/Resolve/Load stages, immutable input snapshots, deletion reconciliation, stale LKG recovery, cross-process owner refresh, interruption settlement, synchronous CAS activation, and durable terminal generation identity. Exact Bun 1.3.0 focused/owned PostgreSQL passed 38/38 with 147 assertions; type-check 6/6, build 5/5, diff, and independent review passed. The canonical semantic vector/keyword lifecycle remains unchanged by adjudication.
- TASK-014 preserves exact diagnostic totals independently from ten bounded details/spans for recovered and incremental hard/stale files, derives status/language summaries only from the activated generation, and durably round-trips the summary with its activated identity through nullable forward-compatible job columns. Exact Bun 1.3.0 focused/owned PostgreSQL and ETL passed 50/50 with 249 assertions; type 6/6, build 5/5, diff, and independent review passed.
- TASK-015 adds native Python/Ruby/PHP/Lua declarations, documentation, honest per-module/per-clause imports, applicable type relations, calls/data flow/HTTP/events, and dialect-scoped resolution without cross-language leakage. Exact Bun 1.3.0 focused query/resolver/ETL passed 67/67 with 333 assertions; core build/type compilation, diff, and independent review passed after four P1 remediations.
- TASK-016 adds native C/C++/Go/Rust/Zig declarations, documentation, honest AST-derived imports, applicable types/inheritance/traits, calls/data flow/HTTP/events, and dialect-isolated resolution. `.h` defaults to C and selects C++ only from unambiguous native importer or directory-aware compilation-database evidence, including cached importers; angle includes remain unresolved. Exact Bun 1.3.0 focused gates passed 95/95 with 1,010 assertions; core build, diff, and independent review passed after four remediation rounds.
- TASK-017 adds native Java/Kotlin/KTS/Scala/C#/Swift/Dart declarations, documentation, honest imports, overload/constructor/property/field identities, inheritance, calls/data flow/HTTP/events, and dialect-isolated resolution. Real Java provider/consumer tests prove nested and static named/wildcard imports with public/private visibility. Exact Bun 1.3.0 focused gates passed 91/91 with 480 assertions; type-check 6/6, build 5/5, diff, and independent review passed after five remediation rounds.
- TASK-018 adds native Elixir/EXS/Erlang/Clojure/OCaml/Haskell declarations, documentation/spec evidence, honest namespace/named/open/qualified/hiding imports, applicable relations, calls/data flow, module-owned identities, and dialect-isolated resolution. BEAM import arity selects exact overload identities; EX/EXS remain compatible. Exact Bun 1.3.0 focused gates passed 101/101 with 575 assertions; type-check 6/6, core build 2/2, diff, and independent review passed after two remediation rounds.
- TASK-019 adds Vue/Markdown embedded parsing plus Markdown heading and JSON/YAML qualified-key packs. Host resources release before sequential depth-two child parsing, native UTF-16 offsets are centrally adapted to exact UTF-8 bytes, Vue `lang` uses native attributes, stable ordinal scopes remap child spans, and fallback/hard-failure diagnostics retain exact totals. Exact Bun 1.3.0 passed 141/141 with 915 assertions; type-check 6/6, build 5/5, diff, and independent review passed after resolver, native-attribute, and acceptance-matrix remediation.
- TASK-020 routes definition, reference, trace, architecture, and impact consumers through one active-generation identity lookup; exact modern identities resolve, legacy ambiguity remains explicit and stable, overload impact analysis does not fall back to bare names, and search exposes all 18 canonical additive kinds. Exact Bun 1.3.0 focused tests passed 8/8 with 19 assertions; owned PostgreSQL passed 21/21 with 81 assertions; type-check 6/6, build 5/5, diff, and independent review passed. A supplemental broad trace/architecture run retained four pre-existing shared-database fixture failures outside the task-owned gate; no validation asset was weakened.
- TASK-021 exposes one shared parser-summary, active-generation, FQN-resolution, and canonical 18-kind transport contract through HTTP and the production MCP CallTool proxy. Project-map graph inputs are captured in one share-locked PostgreSQL transaction so concurrent activation cannot mix generations; extension counts remain distinct from parser language counts and raw diagnostics are never expanded. Exact Bun 1.3.0 focused transport/readiness/identity tests passed 19/19 with 92 assertions; owned PostgreSQL passed 21/21 with 93 assertions including the activation-lock/pending-poison sensor; type-check 6/6, build 5/5, diff, and independent re-review passed after both initial P1 findings were remediated.
- TASK-022 replaces the baseline-deleted indexing limitation suite with a PostgreSQL-native deterministic all-33 E2E contract. A 29-of-33 ParseStage integration escape—25/29 Flow tiers plus all four Structure tiers—was remediated by deriving routing from `LANGUAGE_MANIFEST`; the exact fixture now proves 29 Flow tiers, four Structure tiers, modern/legacy identity, HTTP/MCP parity, unresolved null targets, atomic activation, stale-failure preservation, deletion, and same/different-project concurrency. Owned sequential E2E passed 41 tests with 664 assertions plus one explained auth-on skip; focused indexing passed 7/7 with 249 assertions; static routing passed 20 tests with 278 assertions and seven expected E2E-off skips; type 6/6, build 5/5, qwen 69-entry hash validation, diff, and independent final review passed.
- TASK-023 implementation is complete but uncommitted. Focused 14/14, source/dist native 33+33 parses and 27+27 modules, ten lifetime sensors, RSS/linkage, type 6/6, build 5/5, tar semver/addon inspection, and an extracted packed-surface 33/27/10 run pass. Independent review requires the current tarballs' mandatory empty-cache install; it remains unexecuted because platform network escalation was rejected at the account approval limit and local caches lack 47 resolution manifests plus Dart/Erlang Git tarballs.

## Native Runtime Re-baseline (2026-07-16)

User directive switched the native runtime to Bun `1.3.11` and Node `25.9.0` (Node 25.2.2 was requested but is not a real release; the closest real, locally-installed Node 25.x — 25.9.0 — was selected and confirmed by the user). The network approval block cleared, so the TASK-023 empty-cache packed-consumer install now runs. Two real defects surfaced and were fixed: (1) Node 25 headers require C++20 while `tree-sitter@0.25.0` declared C++17, so the patch now sets the `binding.gyp` C++ standard to C++20; (2) the bundled tree-sitter `install` script (`node-gyp-build`) fell back to a missing `node-gyp` in consumers, so the patch adds an install-guard that no-ops when the prebuilt addon is present (falling back to the upstream command only for fresh source builds). The package verifier also materializes the hoisted patched runtime into `packages/core/node_modules` before `npm pack` so the core tarball bundles the exact nested patched runtime. Cold install, source/dist native verifier (33+33 parses, 27+27 modules, 10 sensors, RSS within bound), the package gate (33 parses, 27 modules/paths, 10 sensors), focused verifier tests (14/14), type-check (6/6), and build (5/5) pass under the new versions. Patch SHA moved from `b0f73d00…` to `e79aec7b96eb8114e85ebcb90f0a8b12076bcd8aa08c09bb88929621e1c1446d`.

## Next Step

Commit the native runtime re-baseline, then commit TASK-023 (`build(parser): verify macos native artifacts`) after its independent review passes. Continue TASK-024 (frozen macOS arm64 CI), TASK-025 (parser benchmark), and TASK-026 (docs) under Bun `1.3.11`/Node `25.9.0`.

## Previous Feature

`sqlite-removal` remains registry `in_progress` because its documented legacy-fixture follow-up is unresolved; its implementation/validation evidence remains under `.specs/features/sqlite-removal/`. This feature does not alter that status.

### SQLite Removal Final State

- Configuration, installer, core persistence, API/health, CI, docs, and active test/E2E paths were converted to PostgreSQL-only behavior.
- Workspace type-check/build, validator discrimination, bootstrap regression, installer tests, active-reference scan, and diff integrity passed.
- Isolated PostgreSQL 17 + pgvector completed 14 migrations, vector CRUD integration (16/16), CRUD/scheduler restart checks (44), smoke (4/4), CLI (13/13), and destructive E2E (4/4; 79 assertions). Owned `:5433`, `:3334`, and `:11435` resources were removed; shared `:3333` remained healthy.
- Residual follow-up: rerun a legacy migration smoke after its checked Prisma fixture repair, rebuild/re-run the frozen qwen fixture, and capture a concise aggregate root-test result.
- Canonical evidence: `.specs/features/sqlite-removal/validation.md`.

### Historical Plan Spec Capture

- Added 14 feature-named folders for supplied Claude Code plans, each with `spec.md`, `design.md`, `tasks.md`, and `validation.md`.
- Source plans remain machine-local under `/Users/luizmassa/.claude/plans`; each feature design captures commit-backed execution facts and explicit gaps.
- Historical source range: inclusive `c1d37b8120025a69e2de0e5fd054ca8177e205de^..81d33606fb6826e1759a073006b165419d0e3ba4` contains 133 reachable commits. Historical claims are not current-session runtime verification.

## Wave 2 (Improvement Plan v2) — COMPLETE

- Source plan: `~/Downloads/massa-ai-improvement-plan.md`. Wave 1 merged via PR #3 (`9fb32f3`).
- workflowSessionId: `spec-driven-wave2`; branch: `wave-2` (off `main`).
- Status: **COMPLETE** — 10/10 items done (M36, M7, M9, M40, M13, M11, M10, M8, M12, M14). All validated PASS. Local branch `wave-2` now tracks `origin/wave-2`.
- **M36 (TOON compact output) — DONE + validated PASS** (2026-07-18). Shared `serializeToolResponse` + `fields` projection; `format` added to 3 tools (get_optimized_context, trace_path, impact_analysis), `fields` to all 12, two-layer MCP parity. Commits `33fea92`, `23035ac`, `05d518b`, `1d30061` on `wave-2`. Independent verifier PASS, discrimination sensor 4/4. Artifacts: `.specs/features/toon-compact-output/`. Follow-ups (non-blocking): MCP `search` def lacks `format` (pre-existing, M32 scope); pre-existing PG-fixture failures in `trace-path.test.ts` (test-isolation task).
- **Small batch — DONE** (2026-07-18): M7 query deadline (`8cf69d2`, injectable clock), M9 schema-ahead (`1ef6d0a`, SchemaAheadError + canonical-signature/checkpoint guards), M40 pinned invariant (`164ed95`, pin guard + fail-closed proposal validation), M13 body-tokens gate (`969ae4f`, empty-region signature skip). Each DB-free tested + tsc clean. Quick specs under `.specs/quick/001..004`.
- **M11 (grammar load-time integrity) — DONE** (`4731cbd`). Shared `native-lock-identities.ts` + `grammar-integrity.ts` verifier (sha512 over package source, ABI-rebuild-safe), wired into `parser-readiness.ts` default-on/memoized. NOTE: prior partial's 27 `sourceIntegrity` pins were fabricated; re-derived from `bun.lock` + recomputed, round-trip-verified. Quick spec `.specs/quick/005`.
- Remaining: **M10** (search preflight — behavior change, two-tier recommended), **M8** (audit-log — DB migration + actor-identity gap), **M12** (agent installer — writes user HOME), **M14** (god-files refactor — Large/high-risk, own feature). Checkpoint before M8/M12/M14.
- **M10/M8/M12 — DONE** (2026-07-18, user approved safe-defaults proceed): M10 two-tier search preflight (`1f5374f`, hard-fail unindexed / warn stale); M8 audit-log (`6db3855`, additive reversible `operation_log` migration + `recordOperation` + api-key-only `ActorContext` seam, PG-verified); M12 agent installer (`d8bf093`, `scripts/install-agents.ts`, 5 agents wired — claude-code/desktop/codex/cursor/opencode — safe-merge+backup+`--dry-run`+`--uninstall`+home-write guard; Gemini/Grok/Devin deferred). Final regression: 67 pass across 6 core DB-free suites + 46 installer; repo type-check 6/6.
- **M14 (god-files refactor) — DONE** (2026-07-18, branch `m14-god-files` off `wave-2`, full spec-driven pass with plan-challenge gate): decomposed both god-files behind byte-identical facades. query-pack 1254→73 LOC across 5 modules (native-node-helpers/symbol-signature/query-pack-registry/query-pack-captures/query-pack-edges); ContextualSearchRLM 1668→463 LOC across 5 delegate modules (rlm-indexing/rlm-search/rlm-fusion/rlm-synapse/rlm-admin). No module >537 LOC. New characterization test (21 tests) pins RRF fusion + search() + mutex try/finally BEFORE the split. Plan-critic gate caught 3 critical/high issues (mutex try/finally preservation, `_indexProjectInternal`/`ensureInitialized` instance-delegate requirement, characterization seam-reachability) — all incorporated pre-execute. Static `indexingLocks` mutex preserved; barrel `services/index.ts` byte-identical. Independent verifier: PASS (88/88 targeted tests, 3 discrimination mutations killed). 9 commits. Validation at `.specs/features/god-files-refactor/validation.md`. **Wave 2 now 10/10 complete.** Branch NOT pushed.
