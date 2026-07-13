# AI Engineering Handoff

## Active Work

Feature `close-maintenance-next-steps-2026-07-13` is active under workflow session `spec-close-maintenance-next-steps-2026-07-13`. Approved source plan: `/Users/luizmassa/Downloads/PLAN-final.md`.

## Verified Baseline

- Clean `main` at `cc985905fae3495a31a16aaf0fbd75435a2e63df`, aligned with `origin/main` before spec activation.
- Bun 1.3.11, Node 25.9.0, Turbo 2.10.2, PostgreSQL 17.10, Ollama client 0.31.2.
- Shared `:3333`: PID 9754, healthy; probe-only boundary.
- Dedicated `:3334`, `:5433`, `:11435` were free.

## Execution Contract

Follow `.specs/features/close-maintenance-next-steps-2026-07-13/tasks.md` in order. Preserve `.specs/features/repository-maintenance-2026-07-12/` byte-for-byte. Use explicit dedicated PostgreSQL/API/Ollama environment. Commit each cluster only after focused verification. Do not push.

## Completed

- TASK-001 committed as `d42eb81`.
- TASK-002 committed as `1eb7aaa`: 82 unit/Synapse tests, live dedicated PG/qwen F24, and type-check 6/6.
- TASK-003 implemented and focused-verified: 25 filter/controller/cache tests, assertion-equivalent SQLite/PostgreSQL cache parity, live dedicated PG/qwen F18, and type-check 6/6.
- TASK-004 implemented and focused-verified: 52 zero-hit/outage/optional-stream/tool-envelope tests and type-check 6/6. Actual owned-service outage/recovery remains TASK-007 by design.
- TASK-005 implemented and focused-verified: bounded cold-qwen sample .193 files/s; commit-locked fixture/cache regressions 28/28; indexing 19/19; search 36/36; needle floors .643/.857/.732 twice; graph 9/9; negative sensor 1/1; type-check 6/6. Live-discovered prerequisite fixes are commits `e995ea6` and `66607d3`.
- TASK-006 implemented and focused-verified: canonical/profile units 10/10; warm wrong-root and direct PG path gate 3/3; search 36/36; symbol/workspace 23/23; type-check 6/6. Shared ID `e2e-th0th-shared-cf1a4754d3e50a0f` points at the canonical fixture root; 468 vectors/34 vector paths/34 symbol paths are manifest-contained with no `adsads/`, absolute, or traversal paths.
- Dedicated stack is active under `/tmp/massa-th0th-close-20260713-1424` with PG PID 23481, Ollama PID 24780, API PID 64524. It is owned by this run; do not signal without revalidating identity.

## Current Next Step

Execute TASK-007's test-owned destructive harness and N1/N3/E25/F88 recovery sequence. The current fixture index is disposable; final G10 still requires full dedicated-stack reprovision and a fresh fixture built from the final tested commit.
