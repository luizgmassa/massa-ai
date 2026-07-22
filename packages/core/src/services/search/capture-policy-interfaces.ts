/**
 * Capture Policy Interfaces — Wave 5 FR-11 / FR-26 / AD-W5-005 / AD-W5-020.
 *
 * Public TypeScript contract for the capture-policy pure module. B3 imports
 * these interfaces verbatim — no re-implementation. Interface drift fails the
 * batch per FR-26 / AC-28.
 *
 * The policy module is pure (no I/O): it takes a file path + a policy and
 * returns a Disposition. The `.gitignore` merge (AD-W5-015) happens BEFORE
 * `applyPolicy` in the `ignore-patterns.ts` wrapper; `applyPolicy` consumes
 * the merged rule list, not the raw policy. This keeps gitignore semantics
 * (including negation rules like `!keep/me.js`) intact.
 */

/**
 * Disposition returned by {@link ApplyPolicyFn}.
 * - `Keep`: index the file's content + metadata.
 * - `Drop`: do not index the file at all (skip).
 * - `MetadataOnly`: index the file's path/metadata but not its content
 *   (future use; currently treated as `Keep` by the ETL).
 */
export type Disposition = "Keep" | "Drop" | "MetadataOnly";

/**
 * A capture policy rule. Patterns are gitignore-style globs (the `Ignore`
 * library syntax); negation rules (`!path`) un-ignore. The `disposition`
 * field is the result when a path matches this rule.
 */
export interface CapturePolicyRule {
  /** gitignore-style glob pattern (supports `**`, `*`, `!` negation). */
  pattern: string;
  /** Disposition when a path matches this rule. */
  disposition: Disposition;
}

/**
 * Bounded capture policy. Bounds are enforced at config-load time; the pure
 * `applyPolicy` function trusts its input (it does not re-validate bounds).
 */
export interface Policy {
  /**
   * Ordered list of rules. The first matching rule wins. If no rule matches,
   * the default disposition is `Keep`.
   */
  rules: CapturePolicyRule[];
  /**
   * Maximum files to scan before refusing (FR-11 `MAX_MATCH_WORK`).
   * Default 100_000. Enforced at config load, not in applyPolicy.
   */
  maxMatchWork?: number;
  /**
   * Maximum number of ignore (Drop) patterns allowed (FR-11
   * `MAX_IGNORE_PATTERNS`). Default 1024. Enforced at config load.
   */
  maxIgnorePatterns?: number;
}

/**
 * Function signature for the pure `applyPolicy` entrypoint. Exported so B3
 * can depend on the contract, not the concrete implementation.
 */
export type ApplyPolicyFn = (filePath: string, policy: Policy) => Disposition;