# M9 — Schema-Ahead Error Handling

Intent: surface a clear `SchemaAheadError` when stored index/checkpoint data
is NEWER than the running code supports, instead of silently regex-decoding it
(which risks identity drift). All version stamps were previously write-only.

## Acceptance

- Typed `SchemaAheadError` + central `assertSchemaSupported(kind, stored, supported)`
  helper in a new module
  `packages/core/src/services/structural/schema-version.ts`. Uses a tiny
  in-tree semver-gt (major.minor.patch numeric compare; no deps).
- Throws ONLY when stored is strictly newer than supported. Equal / older /
  missing (`""`) / malformed (`"abc"`) never throw (forward-compat with old
  rows + corrupt-but-untouched payloads).
- FQN codec corruption-surface guard: `decodeCanonicalSignatureVersion` +
  `assertCanonicalSignatureSupported` exported from `fqn-codec.ts`; the helper
  extracts the embedded `version` from a persisted canonical signature and
  asserts it. Legacy / missing / malformed versions pass through.
- Checkpoint read guard: `rowToCheckpoint` (the DB-row → `TaskCheckpoint`
  decode path) calls `assertSchemaSupported("checkpoint", …)` against
  `state_schema_version`. Supported version pinned as
  `SUPPORTED_CHECKPOINT_STATE_SCHEMA_VERSION = "1.0.0"` next to the guard.
  Bare integer stamps (current `1`) normalized to `1.0.0` before compare.
- DB-free deterministic tests for all three surfaces.
- Behavior-preserving for all current data (everything is `1.0.0` / `1`).

## Out of scope (explicit)

- `load.ts` grammar_version / query_pack_version / resolver_version writes
  (ETL write-path metadata; gating them is a larger behavior change).
