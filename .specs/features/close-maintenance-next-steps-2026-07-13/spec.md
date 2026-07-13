# Close Maintenance Next Steps Specification

- Slug: `close-maintenance-next-steps-2026-07-13`
- Workflow session: `spec-close-maintenance-next-steps-2026-07-13`
- Status: Approved for execution
- Source: `/Users/luizmassa/Downloads/PLAN-final.md`

## Problem Statement

The prior PostgreSQL maintenance pass left four explicit follow-ups plus stale shared-index path contamination. This iteration closes those gaps without changing public wire formats, weakening qwen relevance gates, increasing timeouts, or touching the developer-owned API on `:3333` beyond PID/health probes.

## Requirements

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| CMT-01 | Synapse-aware project search | A valid project-matching session materially changes result identity or rank; missing, unknown, expired, mismatched, and valid-unscoped cases follow the approved exact fallback/injection rules; cross-project buffered results never enter. |
| CMT-02 | Bounded filtered retrieval | Include/exclude searches fill `maxResults` when enough eligible candidates survive within `C = min(5N, N + 200)` from each fixed stream, using one pass and session-independent base cache entries. |
| CMT-03 | Dependency-outage transparency | Required vector/embedding/backend failures return the existing structured `success:false` envelope; genuine zero-hit queries remain successful empty results; optional lexical/graph/query-understanding streams still degrade gracefully. |
| CMT-04 | Deterministic cold-qwen G10 | A commit-locked sparse local clone, explicit manifest/hashes, five needles, and 20 deterministic tracked-source distractors complete sequential standard G10 on a clean dedicated qwen/PostgreSQL stack within unchanged gates. |
| CMT-05 | Test-owned destructive recovery | N1, N3, E25, and F88 execute sequentially against ownership-verified dedicated children, assert failure and recovery, and never signal an unowned process. |
| CMT-06 | Shared-index identity and path hygiene | Canonical root/profile mismatch rejects or guardedly rebuilds dedicated E2E state; direct PostgreSQL sentinels find no `adsads/`, absolute, traversal, or out-of-manifest paths. |

## Five Acceptance Rows

| Row | Requirements | Required evidence |
| --- | --- | --- |
| Synapse search | CMT-01 | Unit matrix, upgraded F24, result-ID/rank comparison, cross-project injection sensor. |
| Filter underfill | CMT-02, CMT-03 | Old-window regression, include/exclude/combined/cap/single-call/cache tests, zero-hit/outage split, live PostgreSQL case. |
| Cold-qwen G10 | CMT-04 | Throughput sample, fixture manifest/hash, provider/model/dimension attestation, complete timed G10 log, killed negative fixture. |
| Destructive scenarios | CMT-05 | Ownership records, N1/N3/E25/F88 logs, recovery checks, clean reprovision. |
| `adsads/` prevention | CMT-06 | Wrong-root regression, canonical/profile checks, direct vector/symbol SQL sentinels, cleanup report. |

## Accepted Assumptions and Decisions

| Dimension | Decision |
| --- | --- |
| Input bounds | Filter over-fetch uses exactly `min(5N, N + 200)`; no retry loop. |
| Failure/partial failure | Required retrieval outages fail visibly; optional streams may degrade. |
| Idempotency/retry | Base RLM cache remains session-independent; fixture identity is content/profile derived. |
| Auth/rate limits | N/A: no auth or rate-limit contract changes. |
| Concurrency/ordering | All implementation and live gates run sequentially; at most one subagent is active. |
| Data lifecycle | Destructive mutation is limited to resources created and ownership-verified by this run. |
| Observability | Every gate records command, exit code, duration, counts, backend/model/dimension, ownership, and skips. |
| External dependencies | Dedicated PostgreSQL `:5433`, Tools API `:3334`, Ollama `:11435`; shared `:3333` receives only PID and `/health` probes. |
| State transitions | Each destructive case restores health; dedicated stack is fully reprovisioned before final G10. |

Open questions: none. User supplied a decision-complete approved plan.

## Edge Cases and Failure Modes

- Unknown, expired, workspace-mismatched, or absent Synapse sessions must be byte-for-byte equivalent to stateless result ordering.
- A valid unscoped session may modulate base results but must not inject buffer candidates.
- Candidate cap exhaustion may underfill only when fewer than `N` eligible results survive existing ranking constraints inside the bounded window.
- Root `.env` must never select a database or service for acceptance runs.
- Occupied dedicated ports, ownership drift, dimension mismatch, fixture hash drift, or an unexplained skip fails closed.
- Shared `:3333` illness or independently changed PID is reported and never repaired; a PID change alone is not evidence that this run mutated it.
- The cold-qwen throughput sample records at least 10 completed files or 180 seconds of active indexing, whichever occurs first, then discards its owned stack; rate calculations use completed files and measured active time only.
- The disposable negative fixture has its own valid profile/manifest with one needle intentionally absent; fixture validation must pass while the corresponding relevance sensor fails.

## Out of Scope

| Item | Reason |
| --- | --- |
| Public wire-format or database migration | Approved plan requires no public response/schema change. |
| Qwen threshold or timeout changes | Explicitly forbidden. |
| Provider-specific score calibration | Not selected; qwen remains acceptance. |
| Shared developer service/data mutation | Explicit hard boundary. |
| SQLite-only acceptance | Non-gating unless PostgreSQL has assertion-equivalent evidence. |
| Push | Explicitly forbidden. |

## Verification Approach

Use the frozen sequential gates in `gate-manifest.md`; focused tests follow each atomic cluster. Final validation requires independent diff/evidence review, direct PostgreSQL sentinels, complete qwen G10, skip audit, dedicated cleanup, and recorded shared `:3333` before/after identity and health.

TODO closure is evidence-driven: remove the four named follow-ups after their gates pass and remove the `adsads/` follow-up only after CMT-06 passes.

## Artifact Store Evidence

- Active key: `.specs/features/close-maintenance-next-steps-2026-07-13/spec.md`
- Version: 1
- Checksum: recorded in `gate-manifest.md` after artifact freeze.
