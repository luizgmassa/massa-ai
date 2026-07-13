# Close Maintenance Next Steps Context

- Gathered: 2026-07-13
- Spec: `.specs/features/close-maintenance-next-steps-2026-07-13/spec.md`
- Status: Approved

## Feature Boundary

Close Synapse search, bounded filtering/outage transparency, deterministic qwen G10, destructive recovery automation, and stale shared-index identity/path gaps on isolated PostgreSQL resources.

## Locked Decisions

- Invalid or mismatched Synapse session: exact stateless fallback.
- Valid unscoped session: base-result modulation only; no buffer injection.
- Filter retrieval: one bounded pass per fixed stream; no retries.
- Qwen fixture: local commit-locked sparse clone, explicit manifest and hashes, five needles, 20 tracked-source distractors.
- Destructive stack: native owned PostgreSQL 17/pgvector, Ollama, and Tools API children under a guarded temporary run directory.
- Shared `:3333`: PID and `/health` only.
- Separate atomic commits after each cluster passes its focused gate; no push.

## Rejected Alternatives

- Timeout increases, weaker qwen thresholds, seeded embedding fixtures, shared-service mutation, SQLite acceptance, and unbounded/retry retrieval.

## Artifact Store Evidence

- Active key: `.specs/features/close-maintenance-next-steps-2026-07-13/context.md`
- Version: 1
- Checksum: recorded in `gate-manifest.md` after artifact freeze.
