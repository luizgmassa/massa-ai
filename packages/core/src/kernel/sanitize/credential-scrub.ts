/**
 * Credential scrubber — kernel leaf (XP-02 / TASK-XP-003).
 *
 * Narrow, recognizable credential-shape redaction for hook-ingested payloads.
 * Consumed by `services/hooks` and `tools/` (the two production writers) and
 * by `data/memory/observation-contract.ts`'s insert seam (which is what
 * enforces the branded type below) — a cross-tier leaf, which is exactly
 * what `kernel/` exists for (CLAUDE.md "Architecture" section: membership is
 * the path prefix, there is no allowlist).
 *
 * v1 rule set is deliberately narrow (spec.md "XP-02 redaction v1 rule set"):
 * PEM private-key blocks, JWTs, AWS access-key ids, OpenAI-style `sk-` keys,
 * GitHub tokens, Slack tokens, and Bearer-scheme tokens. General PII/entropy
 * detection is explicitly out of scope — over-redaction of legitimate code
 * is the adjacent regression class this v1 deliberately avoids.
 *
 * No `assertSanitized` escape hatch: the branded `SanitizedPayloadJson` type
 * is only constructible by running the real scrubber below. An assertion
 * constructor would reopen the hole the brand exists to close.
 *
 * Non-growth invariant: scrubbing never makes the payload longer, keeping it
 * sound against the pre-scrub `HOOKS_MAX_PAYLOAD_BYTES` cap in
 * `hook-service.ts` (checked before this module ever runs). Each rule's
 * `[REDACTED:<id>]` marker is sized to be no longer than that shape's
 * minimum possible match. Two rules needed a small adjustment from
 * design.md C1's literal draft to hold that exactly:
 *   - `aws-key` (design: `aws-key-id`): a real AWS access-key id is FIXED at
 *     exactly 20 characters (4-char prefix + 16 alphanumeric), so the
 *     unabridged id's marker (21 chars) would have made every redaction grow
 *     the payload by one byte. Dropping the "-id" suffix brings the marker
 *     to 18 chars, comfortably under 20.
 *   - `slack-token`: the near-miss floor is `{18,}` here, not design's
 *     literal `{10,}` — at 10 the marker (22 chars) exceeds the minimum
 *     match (15 chars). Slack tokens are not format-fixed the way an AWS key
 *     id is, and real tokens run well past 18 characters past the prefix in
 *     practice, so this costs nothing against genuine matches while holding
 *     the invariant.
 * (SPEC_DEVIATION from design.md C1's literal id/floor for these two rules;
 * reasoned above — reported to the workflow.)
 */

declare const SanitizedBrand: unique symbol;

/**
 * JSON-serialized payload that has passed {@link scrubCredentials}. Only
 * constructible by calling that function.
 */
export type SanitizedPayloadJson = string & { readonly [SanitizedBrand]: true };

export interface ScrubResult {
  sanitized: SanitizedPayloadJson;
  /** Count of replacements, per rule id. 0 for every rule on clean input. */
  redactions: Record<string, number>;
  total: number;
}

interface Rule {
  id: string;
  replace(text: string): { text: string; count: number };
}

function markerFor(id: string): string {
  return `[REDACTED:${id}]`;
}

/** A rule whose whole match is replaced by its marker. */
function fullMatchRule(id: string, pattern: RegExp): Rule {
  const marker = markerFor(id);
  return {
    id,
    replace(text: string) {
      let count = 0;
      const replaced = text.replace(pattern, () => {
        count++;
        return marker;
      });
      return { text: replaced, count };
    },
  };
}

// PEM content is bounded to 8192 chars between BEGIN/END so a run of
// unterminated "-----BEGIN...-----" occurrences (adversarial input) cannot
// force each one to lazily scan the rest of a large payload looking for a
// match that never comes — real PEM bodies (even RSA-4096) are a few KiB at
// most, so this bound never clips a genuine key.
const PEM_PATTERN =
  /-----BEGIN [A-Z ]{0,32}PRIVATE KEY-----[\s\S]{0,8192}?-----END [A-Z ]{0,32}PRIVATE KEY-----/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const AWS_KEY_PATTERN = /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g;
const SK_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{20,}\b/g;
const GITHUB_TOKEN_PATTERN = /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/g;
const SLACK_TOKEN_PATTERN = /\bxox[baprs]-[A-Za-z0-9-]{18,}\b/g;
const BEARER_PATTERN = /(Bearer\s+)([A-Za-z0-9._~+/=-]{20,})/g;

const RULES: Rule[] = [
  // PEM first: fully consumes the block before any other rule can see
  // inside it, and the substituted marker cannot itself match another rule.
  fullMatchRule("pem", PEM_PATTERN),
  fullMatchRule("jwt", JWT_PATTERN),
  fullMatchRule("aws-key", AWS_KEY_PATTERN),
  fullMatchRule("sk-key", SK_KEY_PATTERN),
  fullMatchRule("github-token", GITHUB_TOKEN_PATTERN),
  fullMatchRule("slack-token", SLACK_TOKEN_PATTERN),
  // Runs last and keeps the `Bearer ` prefix literal, replacing only the
  // token — running it last means a more specific rule above (e.g. a JWT
  // used as a bearer token) already replaced its match with a marker whose
  // characters fall outside this rule's charset, so it is not re-matched.
  {
    id: "bearer",
    replace(text: string) {
      let count = 0;
      const replaced = text.replace(BEARER_PATTERN, (_m, prefix: string) => {
        count++;
        return `${prefix}${markerFor("bearer")}`;
      });
      return { text: replaced, count };
    },
  },
];

/** Every rule id, in the fixed order rules run — used to build the 0-map. */
export const RULE_IDS: readonly string[] = RULES.map((r) => r.id);

/**
 * Scrub every v1 credential shape from `payloadJson`. Pure — identical input
 * always produces identical output, with no IO or shared state.
 */
export function scrubCredentials(payloadJson: string): ScrubResult {
  const redactions: Record<string, number> = {};
  for (const id of RULE_IDS) redactions[id] = 0;

  let text = payloadJson;
  for (const rule of RULES) {
    const { text: next, count } = rule.replace(text);
    text = next;
    redactions[rule.id] += count;
  }

  const total = Object.values(redactions).reduce((sum, n) => sum + n, 0);

  return {
    sanitized: text as SanitizedPayloadJson,
    redactions,
    total,
  };
}
