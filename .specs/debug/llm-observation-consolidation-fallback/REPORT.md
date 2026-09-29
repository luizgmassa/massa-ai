# Debug Report — llm-observation-consolidation-fallback

- **projectId**: `massa-ai` · **workflowSessionId**: `debug-llm-fallback`
- **workflow**: debug · **fix size**: Standard (2 source files, 2 test files, core only)
- **branch**: `fix/llm-observation-consolidation` from `origin/main` @ `03b61fa3` (v1.66.1)
- **worktree**: `/Users/luizmassa/Projects/massa-ai-fix-llm-observation-consolidation`
- **Companion**: `feat/lmstudio-server-autostart` (separate PR) closes the operational half —
  the LM Studio server not coming back after a reboot.

## Issue Summary

| Symptom | Impact | Frequency | Environment |
|---|---|---|---|
| LLM calls fall back to the non-LLM path, mostly on timeout | Observation consolidation never produces a memory; the saturated model slows every other LLM site | 1411 timeouts 2026-09-23 → 2026-09-29 | tools-api, LM Studio `:1234`, `qwen3-vl-8b-instruct`, 90 s timeout |
| Same, `AI_APICallError: Bad Request` | same | 122 | same |
| Same, `Cannot connect to API` | Every LLM call degrades | 492 consecutive, from 03:00Z 2026-09-29 | LM Studio server down after a reboot |

Every failure but two carried `label: observation-consolidation`
(source: `~/.config/massa-ai/data/logs/massa-ai.log`).

## Feedback Loop

- **Log census** — failures grouped by label, error name and `timedOut` from the massa-ai log;
  LM Studio's own log (`~/.lmstudio/server-logs/2026-09/`, 3044 requests over 8 days):
  1960 `Client disconnected` (our 90 s abort), 158 `tokens to keep … greater than the context
  length` (the Bad Request), prompt tokens median 11 619 / p90 23 045 / max 35 326.
- **Payload census** — `observations.payload_json` over 7 days: `post-tool-use` 23 110 rows,
  avg 6916 chars, p90 17 197, max 64 951; `tool_response` is ~76 % of it.
- **Real-data replay** — `buildObservationPrompt` over 50 real windows of 8:
  before median 38 264 chars (max 128 347); after median 7 367 (max 9 175).
- **Concurrency** — overlap of timed-out call intervals: up to 14 simultaneous, median 3.
- **Server state** — `lms server status` → "The server is not running"; `lms server start`
  exit 0 (started and already-running alike), endpoint back on `:1234`.

## Hypothesis Board

| # | Hypothesis | Probe | Result |
|---|---|---|---|
| H1 | MLX grammar stall on nested string bounds (prior memory) | read `ConsolidatedBatchSchema` | **DISPROVEN** — no `maxLength` in a `maxItems` array |
| H2 | Prompt size exceeds the model's 90 s budget and context | LM Studio `usage.prompt_tokens`; payload census | **CONFIRMED** — median 11.6k tokens; 9.1k took 62 s; 158 context overflows |
| H3 | Concurrent runs queue on one local model | interval overlap of timed-out calls | **CONFIRMED** — up to 14 in flight; `maybeRun` had no in-flight guard |
| H4 | Server down, not model failure, for the connect errors | `lms server status`, process ages | **CONFIRMED** — machine rebooted ~02:55Z, app restored, server not |
| H5 | Embed/chat eviction thrash (prior Ollama incident) | LM Studio load/unload lines | **NOT PRIMARY** — 21 TTL unloads in 8 days against 1960 aborts |

## Root Cause

1. `buildObservationPrompt` (`observation-consolidation-job.ts`) concatenated each observation's
   raw hook `payloadJson` with no cap — full tool responses plus ids and paths.
2. `maybeRun` fired `runOnce` fire-and-forget every 8 observations (~5.3k/day) with no
   in-flight guard, so calls queued behind one another past their own timeout.
3. With the endpoint down, `llm-client` retried each call (~6 s of SDK retries) and logged a
   misleading `llm reasoning-recovery empty` warning; nothing paused the calls.

## Fix + Validation

- Compact per-observation digest: bookkeeping keys dropped, string fields cut to 400 chars,
  ~300 tokens per observation inside a 2400-token window budget.
- `runOnce` single-flight (`running` flag, released in `finally`); a skipped run logs at debug.
- Endpoint circuit breaker keyed by `llm.baseUrl`: 3 consecutive connection errors → 60 s pause,
  one probe after the pause, one warning per opening. `_isConnectionError` matches error codes
  and the SDK's `Cannot connect to API` prefix only, never model output.
- Gates: `observation-consolidation-job.test.ts` 13/0, `llm-client.test.ts` 97/0; isolated runner
  `--unit --filter='llm|consolidat|observation|hook-service|bootstrap|rerank|query-understanding|compress'`
  15/15 groups; `tsc --noEmit` clean; `bun run lint` clean.

## Prevention

- Regression tests at each divergence point; discrimination sensor 15 mutants, 15 killed
  (10 by the independent verifier, 5 on the review fixes).
- Independent diff audit: 1 blocking finding (classifier matched model output) fixed, 3 advisory
  fixed, 1 declined — the guard stays global on purpose, since it protects a single local model.
- Memory: root cause stored as `dec_1790711333083_4b619f`.
