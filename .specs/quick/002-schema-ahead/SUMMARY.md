# M9 — Schema-Ahead

Implemented.

## Changes

- `services/structural/schema-version.ts` (new): `SchemaAheadError`,
  `assertSchemaSupported(kind, stored, supported)`, in-tree semver-gt. Throws
  only on strictly-newer. Equal / older / missing / malformed pass.
- `services/structural/fqn-codec.ts`: `decodeCanonicalSignatureVersion`,
  `assertCanonicalSignatureSupported` exported. Extracts embedded version from
  persisted canonical signature JSON; legacy / placeholder / malformed -> empty
  string (no throw).
- `services/checkpoint/checkpoint-store-pg.ts`: guard in `rowToCheckpoint` vs
  `SUPPORTED_CHECKPOINT_STATE_SCHEMA_VERSION = "1.0.0"`. Bare int 1 normalized
  to "1.0.0"; null passes.
- Tests: schema-version, fqn-codec-schema-guard, checkpoint-schema-guard.

## Gate

- New + structural-identity regression: 52 pass / 0 fail.
- `tsc --noEmit`: clean.

## Out of scope

- load.ts grammar/query/resolver version writes (ETL write-path metadata).

## Residual risk

- FQN guard exported but no internal call-site yet (codec never re-reads
  persisted canonical signatures; ETL uses synthetic placeholder). Wire when a
  read-back path lands.
- Perf: guard runs off the per-symbol FQN parse hot path; checkpoint cost is one
  String + regex per hydrated row (negligible vs inflateSync + JSON.parse).
