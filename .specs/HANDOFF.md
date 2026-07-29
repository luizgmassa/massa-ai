# Sensor Repair 2026-07 — Handoff

**Active Feature**: `sensor-repair-2026-07` — **Execute COMPLETE. All 9 planned tasks plus 6
unplanned repairs are DONE. Full gate green.**
**Branch**: `fix/sensor-repair` off `origin/main` @ `a6216cd` (v1.9.0). **Not pushed; no PR open.**
Working in place, no worktree.
**Spec**: `.specs/features/sensor-repair-2026-07/spec.md` — SEN-01 AC-3 and SEN-04 AC-2/AC-6/AC-8
carry recorded divergences; BEH-01 carries the corrected behaviour-change count (four, not one).
**Design**: `.specs/features/sensor-repair-2026-07/design.md` — **written mid-Execute** under the
tasks.md safety valve, now five forks. Read the Fourth and Fifth before touching indexing.
**Tasks**: `.specs/features/sensor-repair-2026-07/tasks.md` — **authoritative for task state.**
**Validation**: `.specs/features/sensor-repair-2026-07/validation.md` — written by an independent
verification agent (author ≠ verifier).
**Downstream**: `.specs/features/core-layering-god-module-split/spec.md` — PR-B, blocked on this.

## The next action is to open the PR

Nothing is left to build. `git push -u origin fix/sensor-repair` and open PR-A against `main`.
Two things to confirm on the PR itself, neither verifiable locally:

- SEN-02 AC-1: the new `Coverage` workflow runs green on the PR.
- The CHANGELOG merge gate passes — `[Unreleased]` is populated, so it should.

**Never write the skip-ci marker literally in the PR body.** GitHub scans the entire merge commit
message, and a squash merge concatenates every commit body into it. That is what killed v1.3.0.
The in-range check is clean today (**0** matches):

```bash
git log --format=%B origin/main..HEAD | grep -ciE '\[(skip ci|ci skip|no ci|skip actions|actions skip)\]'
```

Run it through `rtk proxy` — under rtk's filter the same `grep -c` returned `11` and then `0`,
either of which would have recorded a false result.

## Progress — all tasks

| Task | Req | State |
| --- | --- | --- |
| T1 | SEN-03 scratch `XDG_CONFIG_HOME` | **DONE** `39afe59` |
| T2 | SEN-01 truncation | **DONE** `85ff20a` — 36 tables, `_prisma_migrations` intact at 23 rows |
| T3 | SEN-01 `architecture-map` budgets | **DONE** `ad9a2c6` — seam added; `300_000` → `30_000`; 119.47 s → 895 ms |
| T4 | SEN-02 `coverage.yml` | **DONE** `1a8b824` — blocking, outside `ci.yml`. AC-1 pending on the PR |
| T5a | SEN-04 anchor the 11 valid needles | **DONE** `27dda6c` — zero span diff across all 11 |
| T5b | SEN-04 recover N07/N08/N09 | **DONE** `5e018e5` — `staleNeedles` now empty |
| T6a | SEN-04 prereq — index abort | **DONE** `57a75f8` — unplanned |
| T6b | corpus bound — `allowedExtensions` | **DONE** `ee07326` — unplanned |
| T6c | corpus bound — `capturePolicy` | **DONE** `8ea1a4d` — unplanned |
| T6d | corpus bound — one-element brace glob | **DONE** `c3f10ec` — unplanned |
| — | e2e availability probe sends no API key | **DONE** `fedc202` — unplanned |
| T6 | SEN-04 third consumer `14.needles.test.ts` | **DONE** `d5b5813` — gate PASSES |
| T7 | SEN-04 equivalence baseline | **DONE** — MRR 0.569 → 0.736 by repairing the instrument alone |
| T8 | BEH-01 `includePersistent` | **DONE** `f48a309` |
| — | coverage for two config validators | **DONE** `fcf5a02` — unplanned |
| T9 | PR close + validation | **DONE** — this file, `STATE.md` AD-013 → active, validation.md |

## Full gate — measured this session, in this order

| Gate | Result |
| --- | --- |
| `bun run lint` | **0** (oxlint, exit 0) |
| `bun run type-check` | **6 / 6 successful** |
| `bun run build` | **5 / 5 successful** |
| `bun run test` | **11 / 11 tasks**, core `PASS: all 134 group(s)` |
| `bun run test:scripts` | **634 pass / 0 fail** (33 files) + shell suites 5 / 22 / 26 / 11 / 8 |
| `bun run test:plugins` | **94 pass / 0 fail** (8 files) |
| `bun run test:coverage` | **PASS** — 314 files measured, **9** documented exclusions, none added |
| `RUN_E2E=1 … 14.needles.test.ts` | **1 pass / 0 fail** — hit@1 0.500, hit@5 0.786, MRR 0.610 |
| release-marker check | **0** |

**`bun run test` was run 6 times and passed 3.** The tally is stated rather than the best run.
Both failure modes are attributed and neither is the diff — attribute before you debug:

1. **A running tools-api on :3333 poisons `apps/mcp-client`.** `embedded-api-client-endpoints.test.ts`
   gave 2 fail at 5001 ms with the API up, **6 fail** with the API up *and* a scratch
   `XDG_CONFIG_HOME`, and **95 pass / 0 fail in 4.34 s** with the API stopped. `CLAUDE.md` attributes
   this suite to a real developer config; measured here the config made it **worse** and the live API
   was the whole variable — it shares the Postgres pool (size 10) and Ollama. **Avoidable: stop the
   API first.**
2. **Cross-package concurrency against one database — pre-existing, and CI is exposed too.**
   `turbo.json`'s `test` task sets no concurrency limit and no cross-package ordering, so
   `@massa-ai/core#test`, `@massa-ai/tools-api#test` and `@massa-ai/mcp-client#test` run *at the same
   time against the same `DATABASE_URL`*, while `apps/mcp-client`'s deliberately-unmocked
   `embedded-api-client-endpoints.test.ts` performs project resets there. Two runs died on the same
   signature, `graph_generation_workspace_missing`, on different projects
   (`p4d2-trace-path`, `p4d4-arch-map`); each suite passes alone (**18 / 0** and **24 / 0** in
   857 ms). Every file involved is untouched by this branch, including the two that
   `TRUNCATE TABLE workspaces CASCADE`. **Worth its own task** — it is not a local-only artefact,
   since CI likewise runs one service database for all packages.

Group counts moved 133 → **134** by default and 126 → **127** under `--unit`, entirely from
`discover-capture-policy.test.ts`.

## Traps that cost real time this session

- **"The API is down" is a claim to verify, not inherit.** A tools-api orphaned to PPID 1 had been
  indexing for 48 minutes while the previous handoff said it was stopped. It held the `managed_runs`
  indexing lease, so every new index returned `indexing_busy`, and it still held :3333 — a second API
  bound the same port and requests were **split between two instances with different configs**.
  `pgrep -fl "tools-api"` cannot match it; the command line is `bun src/index.ts`. Check the port:
  `lsof -nP -iTCP:3333 -sTCP:LISTEN`. **Two LISTEN rows is the signal.**
- **The API resolves `@massa-ai/core` and `@massa-ai/shared` from `dist/`, not `src/`.** A core or
  shared change needs `bun run build` **and** an API restart. It runs under `start`, not `dev` — no
  hot reload. Verify with `grep -c <new-symbol> packages/*/dist/...`, not by assuming turbo rebuilt.
- **`rtk` rewrites numbers and paths.** It truncated a gate log to "69 matches in 1 files" and
  mangled `find`. Use `rtk proxy` for anything you will cite as evidence.
- **The index job counter is not the progress signal.** It sat at `current: 100/382` for minutes
  while vectors climbed steadily. Watch row growth in `vector_documents_4096d` instead, as
  `CLAUDE.md` says.
- **`timeout` does not exist on macOS**, and there is no Grep tool — use bash `grep` with quoted
  globs (`--include='*.ts'`) or zsh fails with "no matches found". Long waits work as
  `for i in 1 2 3; do sleep 118; done` with an explicit tool timeout.

## State of the machine, if you continue on this host

- **API is STOPPED.** It must be stopped before `bun run test` (see above).
- `e2e-ai-shared` holds a **complete** bounded index: **382 files, 4413 chunks, 4414 vectors**,
  `.ts` only, built in ~42 min. All three `SHARED_PROBE_QUERIES` hit, and the stored canonical root
  matches, so `ensureSharedIndex` takes the **reuse** path and will not re-index.
- To reproduce the T6 gate: start the API with
  `XDG_CONFIG_HOME=/tmp/sensor-repair/xdg` (a copy of the real config with
  `security.allowedExtensions: [".ts"]`, no `capturePolicy`), then
  `MASSA_AI_API_KEY=<security.apiKey from config.json> RUN_E2E=1 bun test …/e2e/14.needles.test.ts`.
  **Never write `allowedExtensions` into the real `~/.config/massa-ai/config.json`.**
- Dedicated coverage DB is up on **127.0.0.1:5433** (`massa_ai_test`) — it is a different database
  from the dev one on 5432. Do not conflate them.

## What a reader must not overclaim

The T6 gate ran against a **bounded 382-file corpus**, not the full warm shared index the
`hit@1 ≥ 0.36` / `hit@5 ≥ 0.64` floors were calibrated on. Fewer competing chunks makes retrieval
strictly easier, so **a pass here is weaker evidence than a pass on the full corpus, and the two
numbers are not comparable.** What the run proves is T6's actual subject: the sweep, the shared
resolver, `findRank` and the determinism assertions all execute end to end against a live API and a
real index. Recorded the same way in `tasks.md` and `design.md`.

No floor, needle query or needle content was edited to make anything pass. The `bge-m3` /
`qwen3-embedding:4b` option was considered and **not taken**: changing the embedding model changes
what the floors mean, and SEN-04's Out of Scope forbids touching floors in this PR.

## Open items for whoever picks this up

- **Push and open PR-A.** Confirm the `Coverage` workflow goes green on the PR (SEN-02 AC-1).
- **PR-B (`core-layering-god-module-split`) is unblocked once PR-A lands and releases.** Its whole
  thesis is that the sensors are trustworthy; they now are, with the caveat above.
- **A full-corpus needles baseline is still owed** if anyone wants a number comparable to the
  floors. ~3.2 h at `qwen3-embedding:8b` on this host, and it cannot overlap `bun run test`.
- **PR-A carries four behaviour changes, not the one the spec planned.** BEH-01, T6a, T6b, T6c —
  tabulated in `spec.md` under BEH-01. The last three cannot have been depended on, because the
  broken behaviour was "your configuration is ignored", and each has a default-parity test. PR-B and
  PR-C remain behaviour-preserving, which is what the isolation was protecting.
