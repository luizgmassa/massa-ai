# massa-th0th Spec State

## Current

- projectId: `massa-th0th`
- workflowSessionId: `spec-repository-maintenance`
- workflow: spec-driven
- feature: `repository-maintenance-2026-07-12`
- status: COMPLETE WITH DOCUMENTED G10 PERFORMANCE EXCEPTION
- branch: `main`
- commits/pushes: none authorized or created

## Outcome

- PostgreSQL/pgvector is the verified acceptance backend.
- Build 5/5, type-check 6/6, final uncached aggregate 10/10; core 74/74
  isolated groups.
- All SQLite behavior groups PAR-01–PAR-11 have assertion-equivalent PG evidence.
- Fourteen migrations apply from scratch. Handoffs/proposals now use PG stores under PG
  configuration; SQLite remains available and was not removed.
- Executable destructive cases N9/N12/N13/F87 passed; static N1/N3/E25/F88 remain
  documented external-orchestration skips.
- G10 exception: cold qwen self-index exceeds the 420-second test deadline on the isolated
  M4 Pro stack. A full qwen run passed before the parity amendments; bge-m3 completed the
  post-amendment suite but was rejected for two qwen-calibrated relevance gates.

## Protected State

- Shared API `localhost:3333` was never restarted.
- User-owned `medium-findings.test.ts` and `_bun-mock-guard.ts` remain byte-identical.
- User hunks in `impact-analysis.ts` were preserved; an approved disjoint Git date/ref fix
  was added.

## Resume

No implementation work is required for this feature. If eliminating the G10 exception,
design a deterministic warm-cache fixture or provider-specific relevance calibration; do
not lower the existing qwen thresholds. Exact evidence and commands are in the feature's
`gate-manifest.md`, `failure-ledger.md`, `parity-matrix.md`, and `validation.md`.
