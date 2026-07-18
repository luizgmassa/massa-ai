/**
 * Schema-ahead guard for persisted structural / checkpoint data.
 *
 * Structural identity and checkpoint state embed a schema version on write.
 * The read paths used to pattern-match (or ignore) the embedded version, which
 * silently decodes rows written by NEWER code than the running binary — risking
 * identity drift on the index and unreadable checkpoint state.
 *
 * This module centralizes the typed error + the strict-newer comparison so every
 * read-side guard funnels through one helper. It NEVER throws on equal, older,
 * missing, or malformed version stamps — those are valid (current row,
 * forward-compatible old row, legacy pre-version row, or corrupt-but-untouched
 * payload). Only a STRICTLY-NEWER stored version throws.
 */

/** Semantic kinds of versioned payloads that flow through this guard. */
export type SchemaVersionKind = "fqn" | "checkpoint" | string;

export interface SchemaAheadContext {
  readonly stored: string;
  readonly supported: string;
  readonly kind: SchemaVersionKind;
}

/**
 * Thrown when persisted data carries a schema version NEWER than the running
 * code understands. Carries enough context for callers to log / surface which
 * payload kind drifted and by how much.
 */
export class SchemaAheadError extends Error {
  readonly code = "schema_ahead" as const;
  readonly context: SchemaAheadContext;

  constructor(context: SchemaAheadContext) {
    super(
      `schema-ahead: ${context.kind} stored version ${context.stored} is newer than supported ${context.supported}`,
    );
    this.name = "SchemaAheadError";
    this.context = context;
  }
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/u;

/**
 * Parse a `major.minor.patch` (numeric, no pre-release) version into a tuple.
 * Returns `null` for anything that is not exactly three non-negative integer
 * components (legacy / unknown / malformed stamps). The caller treats `null` as
 * "do not gate" — never throw on unparseable input.
 */
function parseSemver(version: string): readonly [number, number, number] | null {
  const match = SEMVER_PATTERN.exec(version.trim());
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (
    !Number.isSafeInteger(major) ||
    !Number.isSafeInteger(minor) ||
    !Number.isSafeInteger(patch) ||
    major < 0 ||
    minor < 0 ||
    patch < 0
  ) {
    return null;
  }
  return [major, minor, patch] as const;
}

/**
 * Strict-greater-than semver compare. Returns `false` for any non-semver input
 * (equal/older/missing/malformed never count as "ahead").
 */
function isStrictlyNewer(stored: string, supported: string): boolean {
  const a = parseSemver(stored);
  const b = parseSemver(supported);
  if (!a || !b) return false;
  return (
    a[0] > b[0] ||
    (a[0] === b[0] && a[1] > b[1]) ||
    (a[0] === b[0] && a[1] === b[1] && a[2] > b[2])
  );
}

/**
 * Assert that `stored` is not strictly newer than `supported`. Throws
 * `SchemaAheadError` only when the stored version is ahead; passes through
 * unchanged for equal, older, missing (`""`), or malformed (`"abc"`) stamps.
 *
 * Pass `""` (or any non-semver string) for legacy payloads that carry no
 * version — the guard treats them as unknown and does NOT throw, preserving
 * forward-compat with pre-version rows.
 */
export function assertSchemaSupported(
  kind: SchemaVersionKind,
  stored: string,
  supported: string,
): void {
  if (!isStrictlyNewer(stored, supported)) return;
  throw new SchemaAheadError({ stored, supported, kind });
}
