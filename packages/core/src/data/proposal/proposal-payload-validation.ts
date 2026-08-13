/**
 * Per-kind proposal payload validation — one table, two callers (D4).
 *
 * `proposal-repository-pg.ts`'s `parsePayload` already enforces this exact
 * allowed-key/type set on **read**, throwing `storeCorruption` on deviation.
 * `create`/`update` apply the identical rules on **write**, so a row cannot
 * be written that its own reader will reject: a payload accepted at write
 * time but rejected here on the next read would make every subsequent
 * `getById`, `listPending` and `approve` on that row throw `storeCorruption`
 * (AC-02.2). Two independent copies of this table drift, and the drift only
 * ever surfaces as a corrupt row — so this module is the only place either
 * caller may define it.
 */

import type { ProposalKind, ProposalPayload } from "./proposal-contract.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

interface ProposalPayloadFieldRule {
  optional: boolean;
  validate: (value: unknown) => boolean;
}

interface ProposalPayloadRule {
  allowedKeys: readonly string[];
  /** memory.update has no columns of its own; an empty patch is refused. */
  requireNonEmpty?: boolean;
  fields: Record<string, ProposalPayloadFieldRule>;
}

/**
 * The single per-kind key/type table. Traced 1:1 against the validation
 * `parsePayload` applied inline before extraction — see
 * `proposal-repository-pg.ts`'s `parsePayload`, which now delegates here.
 */
export const PROPOSAL_PAYLOAD_RULES: Readonly<Record<ProposalKind, ProposalPayloadRule>> = {
  "memory.create": {
    allowedKeys: ["content", "type", "level", "importance", "tags"],
    fields: {
      content: { optional: false, validate: isString },
      type: { optional: true, validate: isString },
      level: { optional: true, validate: isNumber },
      importance: { optional: true, validate: isNumber },
      tags: { optional: true, validate: isStringArray },
    },
  },
  "memory.update": {
    allowedKeys: ["content", "importance", "tags"],
    requireNonEmpty: true,
    fields: {
      content: { optional: true, validate: isString },
      importance: { optional: true, validate: isNumber },
      tags: { optional: true, validate: isStringArray },
    },
  },
  "memory.tag": {
    allowedKeys: ["tags"],
    fields: {
      tags: { optional: false, validate: isStringArray },
    },
  },
};

/**
 * Applies `PROPOSAL_PAYLOAD_RULES` for `kind` against an already-parsed
 * object. Pure predicate — no throwing — so both the read path (which wraps
 * a `false` result in `storeCorruption`) and the write path (which wraps it
 * in `ProposalPayloadValidationError`) can each apply their own error shape.
 */
export function isValidProposalPayload(
  kind: ProposalKind,
  value: Record<string, unknown>,
): boolean {
  const rule = PROPOSAL_PAYLOAD_RULES[kind];
  if (!Object.keys(value).every((key) => rule.allowedKeys.includes(key))) return false;
  if (rule.requireNonEmpty && Object.keys(value).length === 0) return false;
  for (const [field, fieldRule] of Object.entries(rule.fields)) {
    const present = value[field] !== undefined;
    if (!present) {
      if (!fieldRule.optional) return false;
      continue;
    }
    if (!fieldRule.validate(value[field])) return false;
  }
  return true;
}

/** Write-side 400-shaped error — deliberately not `SearchServiceError`: the
 * `data/` layer must not import from `services/`, and this is a client
 * input-validation failure, not a backend or corruption failure. */
export class ProposalPayloadValidationError extends Error {
  readonly statusCode = 400;
  constructor(
    public readonly kind: ProposalKind,
    message: string,
  ) {
    super(message);
    this.name = "ProposalPayloadValidationError";
  }
}

/**
 * Write-time gate (AC-02.2, AC-02.3): throws `ProposalPayloadValidationError`
 * for exactly the payloads `parsePayload` would refuse on the next read.
 */
export function assertValidProposalPayload(
  kind: ProposalKind,
  value: unknown,
): asserts value is ProposalPayload {
  if (!isRecord(value)) {
    throw new ProposalPayloadValidationError(
      kind,
      `proposal payload must be an object for kind "${kind}"`,
    );
  }
  if (!isValidProposalPayload(kind, value)) {
    throw new ProposalPayloadValidationError(
      kind,
      `proposal payload is invalid for kind "${kind}"`,
    );
  }
}
