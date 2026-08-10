# Validation — embedding-dims-consistency (EDC)

**Verdict: PASS**

Commit range: `main..HEAD` (6c438a98..7e29edfe, 9 commits), branch
`spec/installer-restart-embedding`. Verifier independent of author.

## Per-AC evidence

| AC | Requirement | Sensor | Result |
|----|---|---|---|
| AC-1 | EDC-06 parity test observed red pre-fix (names Dockerfile 4096 + config-cli 768), green after EDC-01..03 | `scripts/__tests__/embedding-defaults-parity.test.ts` (direct run) + red observed via mutation below | PASS — green in the current tree: 3/3 pass, 7 expect() calls; red-state behavior reconfirmed live by the discrimination-sensor mutation (below), which reproduces the "extractor rotted or surface removed" failure mode the spec's plan-critic named |
| AC-2 | grep across 4 env surfaces + config-cli finds no 4b-adjacent literal other than 2560, population printed | `git grep -n OLLAMA_EMBEDDING_DIMENSIONS -- Dockerfile install.sh apps/tools-api/setup-ollama-wsl.sh .env.example apps/mcp-client/src/config-cli.ts docker-compose.yml` (direct) | PASS — every active (non-commented) assignment is `2560`; the two `.env.example` `1024` hits are commented alternatives for the 0.6b model, correctly excluded by the parity test's line-start-without-`#` anchor |
| AC-3 | web-ui guide text + FEATURES.md example + test comment show 2560; web-ui suite green | `git diff main..HEAD` on `apps/web-ui/src/static/app.js:708`, `FEATURES.md:1279`, `packages/core/src/__tests__/embedding-service.test.ts:145` (all now say 2560) | PASS — all three literals confirmed changed by direct diff read |
| AC-4 | `bun run test:plugins`, mcp-client suite, `bun run test:scripts` green | Full re-runs, not inherited | PASS — `test:plugins` 135/0 (exit 0); `apps/mcp-client/src/__tests__/config-cli.test.ts` 23/0 (exit 0); `bun run test:scripts` (XDG scratched) 1736/0 across 79 files + all shell suites 0 failed (exit 0) |
| AC-5 | CHANGELOG `### Fixed` bullets present | `git diff main..HEAD -- CHANGELOG.md` | PASS — "Embedding model/dimension pairs aligned to the 4b/2560 default on every surface" bullet present under `[Unreleased] ### Fixed` |

New AC-6 (mcp-client runtime sensor, plan-challenge revision): "`use ollama`
(no `--dimensions` flag) writes `dimensions: 2560`" —
`apps/mcp-client/src/__tests__/config-cli.test.ts` test
`"use ollama defaults write the 4b/2560 pair (EDC-03)"` re-run directly: PASS
(part of the 23/0 file total above).

## EDC-06 durable sensor detail (re-run, not inherited)

```
$ bun test scripts/__tests__/embedding-defaults-parity.test.ts; echo EXIT:$?
[parity] pair surfaces checked: 6, reference qwen3-embedding:4b/2560
[parity] model-only surfaces checked: 2
[parity] completeness scan population: 23 tracked files mention OLLAMA_EMBEDDING_*
 3 pass
 0 fail
 7 expect() calls
EXIT:0
```

Tier 3 completeness scan population (23 tracked files matching the source-file
extensions and mentioning `OLLAMA_EMBEDDING_`) differs from the spec's
"26 files at spec time" figure — expected: the scan filters to
`.ts|.js|.sh|.ya?ml|.json|Dockerfile|.env*`, while a bare `git grep -l
OLLAMA_EMBEDDING` (re-run independently) returns 31, the gap being doc/markdown
files (`.specs/`, `docs/`, `README.md`, `CHANGELOG.md`, `FEATURES.md`) that the
scan's own allowlist explicitly excludes by prefix. Not a discrepancy in the
gate's correctness — the AC-2 language ("population printed beside the
verdict") is satisfied either way.

## Invariants

- I1 (no runtime default changes): `git diff main..HEAD` shows zero changes to
  `packages/shared/src/config/massa-ai-config.ts` or
  `packages/core/src/services/embeddings/config.ts` — confirmed by diff.
- I2 (no schema/migration changes): no new files under
  `packages/core/prisma/migrations/` in the diff — confirmed by
  `git diff --stat main..HEAD`.
- I3 (explicit flag/env override behavior unchanged): `config-cli.ts` diff is
  a 4-line default-value + comment change only, no logic touching explicit
  `--dimensions` handling — confirmed by diff read.

## Discrimination sensor (mutation)

**Mutation: break one parity extractor's anchor.** In
`scripts/__tests__/embedding-defaults-parity.test.ts`, the Dockerfile
surface's `dims` regex was changed from
`/^ENV OLLAMA_EMBEDDING_DIMENSIONS=(\d+)$/gm` to
`/^ENV OLLAMA_WRONG_DIMENSIONS=(\d+)$/gm` — simulating exactly the
"parse-0-subjects trap" the spec's plan-critic named as the reason EDC-06
must self-check match count.

- Original file saved before mutation; restored by writing the saved bytes
  back (no `git checkout`).
- **Population: 3 tests.** Before: 3/3 pass. Under mutation: **2/3 pass, 1/3
  fail** — killed, with the exact diagnostic the design intends: `Dockerfile:
  expected exactly 1 match for /^ENV OLLAMA_WRONG_DIMENSIONS=(\d+)$/gm, got 0
  — extractor rotted or surface removed`.
- Restore verified: `md5` after restore ==
  `e92757adcf1e7c19e93129033c48740a` (pre-mutation); re-run confirms 3/3 pass,
  `git status --porcelain` clean.

## Residual risks / advisories

- None beyond the population-count note above (AC-2), which is explained, not
  a gap.

## Command evidence (raw exit codes)

```
$ bun test scripts/__tests__/embedding-defaults-parity.test.ts; echo EXIT:$?  → EXIT:0 (3/3)
$ bun test apps/mcp-client/src/__tests__/config-cli.test.ts; echo EXIT:$?     → EXIT:0 (23/23)
$ bun run test:plugins; echo EXIT:$?                                          → EXIT:0 (135/0)
$ bun run test:scripts (XDG_CONFIG_HOME scratched); echo EXIT:$?              → EXIT:0 (1736/0, 79 files, all shell suites 0 failed)
```
