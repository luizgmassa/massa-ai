# Validation — api-log-clarity

## Summary

**Result:** PASS. All 12 ACs (AC1–AC10, AC5b, AC6b) match. An independent verifier ran two iterations: the first found 3 surviving mutants, and the second killed all of them at `417c9c6b`.

- Verifier: `massa-ai-verification-agent`, working in a scratch worktree `/tmp/wt-verify`. Mutants were restored from saved bytes, never with git.
- Discrimination sensor: 14 mutants on the logging code (M1–M8, M20a–c, M21). Iteration 1 killed 11 and 3 survived: M7b/M7c (the `llmComplete` disabled path), M8 (`timedOut`) and M21 (hygiene population). All 14 are killed at `417c9c6b`.

## Validation

| AC | Verdict | Evidence |
|---|---|---|
| AC1 failure WARN with identity + streak | PASS | `packages/core/src/__tests__/llm-client.test.ts:1058`; `timedOut: true` at `llm-client.test.ts:1190`, `:1206` |
| AC2 one recovery INFO | PASS | `packages/core/src/__tests__/llm-client.test.ts:1091` |
| AC3 decode lines at DEBUG with label/model | PASS | `packages/core/src/__tests__/llm-client.test.ts:1112` |
| AC4 occurrences / firstSeenAgo, first line unchanged | PASS | `packages/shared/src/__tests__/logger.test.ts:313`, window reset `logger.test.ts:387` |
| AC5 code + cause serialized; Error in meta ≠ `{}` | PASS | `packages/shared/src/__tests__/logger.test.ts:426`, `logger.test.ts:446` |
| AC5b stack kept; order-independent | PASS | `packages/shared/src/__tests__/logger.test.ts:191`; whole `packages/shared` suite in one process: 994/0 |
| AC6 label required | PASS | Deleting the label at `packages/core/src/services/search/reranker.ts:93` makes core `tsc` fail (TS2345, seen failing on purpose) |
| AC6b disabled → zero WARN, streak untouched | PASS | `packages/core/src/__tests__/llm-client.test.ts:1130` (llmObject), `llm-client.test.ts:1160` (llmComplete) |
| AC7 gates + CHANGELOG Changed | PASS | build/type-check/lint 0, `test:plugins` 150/0, `test:scripts` 2082/1 (see Skipped); `CHANGELOG.md` `[Unreleased]` Changed |
| AC8 hygiene sensor red on origin/main, green on branch | PASS | `scripts/__tests__/log-call-hygiene.test.ts:193`; origin/main 143 offenders / 233 calls, branch 0; population guard `log-call-hygiene.test.ts:157` |
| AC9 `MASSA_AI_LOG_LEVEL` | PASS | `scripts/__tests__/turbo-passthrough-env.test.ts:99`; live probe: `MASSA_AI_LOG_LEVEL=debug` emits DEBUG and `LOG_LEVEL=debug` does not |
| AC10 real scheduler health | PASS | `packages/core/src/__tests__/scheduler.test.ts:317`, `apps/tools-api/src/routes/dashboard.test.ts:88` |

## Live evidence

Running `start:api` from the worktree against `massa_ai_test` printed:
`[WARN] PgScheduledJobStore mutation failed (best-effort) {"id":"scheduled-auto-improve","operation":"save","error":{"name":"PrismaClientKnownRequestError",...,"code":"P2010"},"occurrences":2,"firstSeenAgo":"0s"}`.
Across the five jobs, `occurrences` climbed from 2 to 5. That identifies the failure as systemic (a missing table) rather than a one-off.

## Skipped / environmental

- **Full `bun run test` locally.** Bun 1.3.14 on this macOS SIGTRAP-panics when an isolated child exits, and the isolation runner re-raises that signal. The same panic reproduces on `main`, e.g. with `etl-cache-invalidation.test.ts`. CI on Linux is the full-suite gate; locally, targeted suites were run.
- **`test:scripts` 1 fail.** It is a native tree-sitter RSS-growth measurement, and the host load average was 18. Run alone it passes on both the branch and `main`.

## Review

Two reviewer passes. Blocking findings, all fixed in `7217c5dd`:
- uncapped AI SDK `cause`, which embeds the model output;
- advisories: non-Error `logger.error`, a throwing stringify, the provider fallback, zod issues, and the sensor pathspec.
