# Spec — API log clarity (persistent vs punctual)

- projectId: `massa-ai` · workflowSessionId: `feature-model-catalog-revamp` (sibling feature)
- Workflow: feature, Standard tier
- Branch: `feat/model-catalog-revamp` (shared single PR with model-catalog-revamp — user, 2026-09-22)

## Problem

`bun run start:api` warnings cannot be told apart. Nothing says which feature failed,
against which model, or whether it is the first failure or the fiftieth. Examples:

- `[WARN] llmObject failed — degrading to non-LLM path {"error":"The operation timed out."}`
  comes from `packages/core/src/services/memory/llm-client.ts:655`. The twin at `:539`
  (`llmComplete`) has the same shape. The line carries no caller label; none of the 10
  callers passes one. It also omits model, provider, timeout, elapsed time, and a timeout
  flag, although `_isAbortOrTimeoutError` is computed at `:633`.
- `[INFO] json_schema: constrained decoding used {}` (`:585`, twin `:603`) fires at INFO on
  every successful structured call.
- The logger (`packages/shared/src/utils/logger.ts`) has no repeat accounting.
  `logger.error` drops `code`/`cause`. An `Error` inside `warn` meta serializes to `{}`.

## Design

1. **LLM call identity.** `LlmCompleteOptions` (`llm-client.ts:40`) and `LlmObjectOptions`
   (`:49`) gain a required `label` (e.g. `salience-judge`, `reranker`, `query-rewrite`,
   `hyde`), and the `opts = {}` defaults (`:501`, `:556`) are removed. Callers type against
   three structural surfaces, not the options types: `LlmSurface`
   (`consolidator.ts:70-76`), `QueryLlmSurface` (`query-understanding.ts:41-50`), and
   `CompressLlmComplete` (`code-compressor.ts:18-21`). Each declares `opts` required with
   `label: string`. The surfaces need the requirement too, because TypeScript checks
   interface methods bivariantly. `benchmarks/llm-judge/run.ts:140` passes a label by hand,
   since no tsconfig covers it.
2. **Failure line.** It reads `LLM call failed — using non-LLM fallback` with meta
   `{label, role, model, provider, timeoutMs, elapsedMs, timedOut, error:{name,message,code},
   consecutiveFailures}`. `consecutiveFailures` is per label and resets on success. A
   non-throw `ok:false` return at `:536` or `:622` counts as a failure. The `llm disabled`
   early returns (`:504`, `:559`) log nothing and leave the streak alone, because disabled
   is the default. The first success
   after one or more failures logs one INFO line: `LLM call recovered`
   `{label, model, afterFailures}`. `baseUrl` and `apiKey` are never logged. The streak map
   has a `_resetLlmFailureStreaksForTesting()` seam.
3. **Noise.** The `json_schema`/`json_object` decode-path lines move to DEBUG and carry
   `{label, model}`.
4. **Logger repeat accounting.** A WARN/ERROR whose `level + message` already appeared
   (plus `meta.label` when present, so different LLM features never share a counter)
   within the last 15 min gets `occurrences` (count in window) and `firstSeenAgo`
   (e.g. `"12m"`) added to its meta. The first occurrence is unchanged. The map is capped
   at 500 keys and cleared on overflow. It lives on the `Logger` instance, with a
   `_resetRepeatsForTesting()` seam: `packages/shared` runs plain `bun test`, so
   module-scope state would make results depend on test order. The line shape is
   unchanged, so the `/api/v1/logs` `LINE_RE` parser still works. A repeat of a meta-less
   line gains a meta blob; that is accepted.
5. **Error serialization.** `logger.error` keeps `stack` and adds `code?` and `cause?`,
   where `cause` is a one-level message. An `Error` value inside meta serializes to
   `{name, message, code?, cause?}`. Only those fields are picked; the Error is never
   spread, because the AI SDK's `APICallError` carries `requestBodyValues`, which holds the
   prompt. A thrown value that is not an Error becomes `String(v)`. Messages are not
   scrubbed, which is the same exposure `logger.error` already has for message and stack.
6. **Caller duplicates.** `reranker.ts:103` and `salience-judge.ts:89` log `{ok:false}` with
   no error. They now include `error`; otherwise the two lines cannot be matched up.
7. **Accepted risk.** `child()` builds a new `Logger` (`logger.ts:226`), so a child counts
   repeats separately. No production code calls `child(` today.
8. **Every warn/error site gets rewritten (user, 2026-09-22).** The 234 production
   `logger.warn`/`logger.error` calls in 92 files are counted with
   `git grep -nE "logger\.(warn|error)\("` over `apps/tools-api/src packages/core/src
   packages/shared/src apps/mcp-client/src`, tests excluded. Each call follows four rules:
   - **H1.** Pass the `Error` object itself (`{ error: e }`, or `logger.error(msg, e, meta)`),
     never `e.message`. The logger then serializes name, code and cause.
   - **H2.** The message is a constant string naming the component and the operation, for
     example `session-registry: save failed`. Error text is never interpolated into the
     message, so the repeat counter can group occurrences.
   - **H3.** Meta carries the identifiers in scope: projectId, sessionId, jobId, file path,
     label, attempt.
   - **H4.** No warn/error call is left without meta.

   Sensor: `scripts/__tests__/log-call-hygiene.test.ts` scans those source roots and fails
   on either of two shapes: a `.message` of a caught error inside the arguments of a
   `logger.(warn|error)(` call, or a `${…}` interpolation in that call's message. It must
   be seen failing on origin/main before the sweep.
9. **`LOG_LEVEL` becomes `MASSA_AI_LOG_LEVEL` (AD-010).** This is a hard rename, following
   AD-010's precedent of no dual-read. It covers:
   - the reader `packages/shared/src/config/index.ts:1005`;
   - the seed `config-loader.ts:509` and its test (`:461-501`);
   - `.env.example:47` and `install.sh:428`;
   - `skills/massa-ai/references/synapse-policy.md:47,106`;
   - `turbo.json` passThroughEnv, which `turbo-passthrough-env.test.ts` enforces.

   The CHANGELOG entry names the rename as breaking.
10. **Dashboard scheduler health.** `apps/tools-api/src/routes/dashboard.ts:40-41` stops
    hardcoding `consecutiveFailures: 0` and `lastSuccessAt: null`. `Scheduler.status()`
    exposes each job's real `consecutiveFailures`/`lastSuccessAt`
    (`scheduler.ts:490-495`, persisted at `scheduler-store-pg.ts:75-77`).

## Acceptance Criteria

- **AC1** A failed `llmObject`/`llmComplete` call logs one WARN whose meta has `label`,
  `role`, `model`, `provider`, `timeoutMs`, `elapsedMs`, `timedOut`, `error.name`, and
  `consecutiveFailures`. Two failures in a row give 1 and then 2.
- **AC2** The first success after N ≥ 1 failures logs exactly one INFO `LLM call recovered`
  with `afterFailures: N`. A later success logs nothing at INFO.
- **AC3** A successful structured call at the default INFO level emits no line. At DEBUG
  the decode-path line carries `label` and `model`.
- **AC4** The same WARN twice within 15 min: the second line's meta has `occurrences: 2`
  and a `firstSeenAgo`. The first line's meta is byte-identical to today's. Lines still
  match `LINE_RE`.
- **AC5** `logger.error(msg, err)` with `err.code = "ECONNREFUSED"` and
  `err.cause = new Error("x")` serializes both. `warn(msg, {error: err})` no longer
  serializes to `{}`.
- **AC6** Every `llmObject`/`llmComplete` production call passes a `label`. Seen
  failing on purpose: deleting the label at `reranker.ts:92` makes core `bun run build`
  fail.
- **AC5b** `logger.error` output still contains `stack` (`logger.test.ts:191-200` stays
  green). Repeat and streak tests pass whether they run alone or after a sibling file in
  the same `bun test` process.
- **AC6b** With the LLM disabled (the default), an `llmObject`/`llmComplete` call emits
  zero WARN lines and does not change the streak.
- **AC8** `log-call-hygiene.test.ts` is seen failing on origin/main and passes on the branch.
  No warn/error site is left without meta.
- **AC9** `MASSA_AI_LOG_LEVEL=debug` enables DEBUG. `LOG_LEVEL` is no longer read
  anywhere: `git grep -n "LOG_LEVEL"` finds only `MASSA_AI_LOG_LEVEL` and logger-internal
  constant names. `turbo-passthrough-env.test.ts` is green.
- **AC10** `GET /api/v1/scheduler/status` reports a job's real `consecutiveFailures` and
  `lastSuccessAt`. The test drives a job to 2 failures and reads back 2.
- **AC7** Gates: `bun run build`, `type-check`, `lint`, `test`. The CHANGELOG
  `[Unreleased]` entry is **Changed**.

## Out of scope

- None. The three items first listed here were brought into scope by the user on
  2026-09-22.
