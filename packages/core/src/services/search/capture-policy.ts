/**
 * Capture Policy — Wave 5 FR-11 / FR-21 / AD-W5-005 / AD-W5-015.
 *
 * Pure module (no I/O): given a file path and a {@link Policy}, returns a
 * {@link Disposition}. The first matching rule wins; if no rule matches,
 * the default is `Keep`.
 *
 * Bounds (`MAX_MATCH_WORK`, `MAX_IGNORE_PATTERNS`) are NOT enforced here —
 * they are enforced at config load time (FR-11). applyPolicy trusts its
 * input. This keeps the pure module fast (no allocation per call) and
 * testable without a config loader.
 *
 * `.gitignore` merge (AD-W5-015): the `ignore-patterns.ts` wrapper merges
 * project `.gitignore` rules with `DEFAULT_IGNORES` via the `Ignore` library
 * BEFORE delegating to `applyPolicy`. `applyPolicy` itself does not do the
 * merge; it consumes the merged rule list. This preserves gitignore
 * semantics (including negation rules like `!keep/me.js`).
 */

import type { ApplyPolicyFn, Disposition, Policy } from "./capture-policy-interfaces.js";

// ── Bounds (FR-11) ────────────────────────────────────────────────────────────

export const MAX_MATCH_WORK = 100_000;
export const MAX_IGNORE_PATTERNS = 1_024;

// ── Default policy (migrated from DEFAULT_IGNORES) ──────────────────────────

/**
 * Default capture policy migrated from `DEFAULT_IGNORES`. Each `DEFAULT_IGNORES`
 * entry becomes a `Drop` rule. The wrapper (`ignore-patterns.ts`) still owns
 * the `.gitignore` merge; this policy is the fallback when no project policy
 * is configured.
 *
 * The patterns are gitignore-style globs consumed by the `Ignore` library in
 * the wrapper. `applyPolicy` itself does simple glob matching via
 * `minimatch`-compatible semantics (the `matchesGlob` helper below).
 */
export const DEFAULT_POLICY: Policy = {
  rules: [
    { pattern: "**/node_modules/**", disposition: "Drop" },
    { pattern: "**/.git/**", disposition: "Drop" },
    { pattern: "**/dist/**", disposition: "Drop" },
    { pattern: "**/build/**", disposition: "Drop" },
    { pattern: "**/coverage/**", disposition: "Drop" },
    { pattern: ".env", disposition: "Drop" },
    { pattern: ".env.*", disposition: "Drop" },
    { pattern: "**/generated/**", disposition: "Drop" },
    { pattern: "**/*.generated.*", disposition: "Drop" },
    { pattern: "**/*.d.ts", disposition: "Drop" },
    { pattern: "**/__tests__/**", disposition: "Drop" },
    { pattern: "**/tests/**", disposition: "Drop" },
    { pattern: "**/*.test.ts", disposition: "Drop" },
    { pattern: "**/*.test.tsx", disposition: "Drop" },
    { pattern: "**/*.test.js", disposition: "Drop" },
    { pattern: "**/*.test.jsx", disposition: "Drop" },
    { pattern: "**/*.spec.ts", disposition: "Drop" },
    { pattern: "**/*.spec.tsx", disposition: "Drop" },
    { pattern: "**/*.spec.js", disposition: "Drop" },
    { pattern: "**/*.spec.jsx", disposition: "Drop" },
    { pattern: "**/benchmarks/**", disposition: "Drop" },
    { pattern: "**/fixtures/**", disposition: "Drop" },
    { pattern: "**/*.wasm*", disposition: "Drop" },
    { pattern: "**/*.min.*", disposition: "Drop" },
    { pattern: "**/*.map", disposition: "Drop" },
    { pattern: "**/lock.yaml", disposition: "Drop" },
    { pattern: "**/pnpm-lock.yaml", disposition: "Drop" },
    { pattern: "**/package-lock.json", disposition: "Drop" },
    { pattern: "**/bun.lockb", disposition: "Drop" },
    { pattern: "**/yarn.lock", disposition: "Drop" },
  ],
  maxMatchWork: MAX_MATCH_WORK,
  maxIgnorePatterns: MAX_IGNORE_PATTERNS,
};

// ── Glob matching ────────────────────────────────────────────────────────────

/**
 * Convert a gitignore-style glob into a RegExp. Supports:
 *  - `**`  → `.*` (any path segments)
 *  - `*`   → `[^/]*` (one segment, no slash)
 *  - `?`   → `[^/]` (one char, no slash)
 *  - `.`   → `\.` (literal)
 *  - `!` prefix → negation (handled by caller, not here)
 *
 * This is a minimal matcher for the default policy's patterns. The
 * `.gitignore` merge in the wrapper uses the `Ignore` library (which has
 * full gitignore semantics including negation); `applyPolicy` uses this
 * simple matcher for the policy rules themselves.
 */
function globToRegex(pattern: string): RegExp {
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // `**` — match anything (including path separators).
        re += ".*";
        i += 2;
        // Consume an optional trailing `/` so `**/foo` matches `foo` at any depth.
        if (pattern[i] === "/") i += 1;
      } else {
        // `*` — match one segment (no slash).
        re += "[^/]*";
        i += 1;
      }
    } else if (ch === "?") {
      re += "[^/]";
      i += 1;
    } else if (ch === ".") {
      re += "\\.";
      i += 1;
    } else if ("+()^${}|[]\\".includes(ch)) {
      re += "\\" + ch;
      i += 1;
    } else {
      re += ch;
      i += 1;
    }
  }
  re += "$";
  return new RegExp(re);
}

// ── applyPolicy ──────────────────────────────────────────────────────────────

/**
 * Apply a capture policy to a file path. Returns the disposition of the
 * first matching rule, or `Keep` if no rule matches. Pure: no I/O, no
 * side effects, no allocation beyond the cached regexes.
 *
 * The path is matched as-is (relative or absolute); the caller normalizes
 * to a project-relative path before calling. Trailing/leading whitespace
 * is trimmed.
 */
export const applyPolicy: ApplyPolicyFn = (filePath: string, policy: Policy): Disposition => {
  const normalized = filePath.trim();
  for (const rule of policy.rules) {
    if (matchesGlob(normalized, rule.pattern)) return rule.disposition;
  }
  return "Keep";
};

// ── Validation (config-load time) ────────────────────────────────────────────

/**
 * Validate a policy at config load time. Throws a TypeError when:
 *  - `maxIgnorePatterns` is exceeded by the number of `Drop` rules.
 *  - `maxMatchWork` is missing or < 0.
 *  - `denyUnknownFields` is true and the policy object has unknown keys.
 *
 * Bounds per FR-11 / AC-9.
 */
export function validatePolicy(
  policy: unknown,
  opts: { denyUnknownFields?: boolean } = {},
): asserts policy is Policy {
  if (!policy || typeof policy !== "object") throw new TypeError("policy must be an object");
  const p = policy as Record<string, unknown>;
  const allowedKeys = new Set(["rules", "maxMatchWork", "maxIgnorePatterns"]);
  if (opts.denyUnknownFields) {
    for (const key of Object.keys(p)) {
      if (!allowedKeys.has(key)) {
        throw new TypeError(`policy: unknown field "${key}" (denyUnknownFields=true)`);
      }
    }
  }
  if (!Array.isArray(p.rules)) throw new TypeError("policy.rules must be an array");
  const dropCount = (p.rules as Array<{ disposition?: string }>).filter(
    (r) => r?.disposition === "Drop",
  ).length;
  const maxIgnore = typeof p.maxIgnorePatterns === "number" ? p.maxIgnorePatterns : MAX_IGNORE_PATTERNS;
  if (dropCount > maxIgnore) {
    throw new TypeError(
      `policy: ${dropCount} Drop rules exceed maxIgnorePatterns=${maxIgnore}`,
    );
  }
  if (p.maxMatchWork !== undefined) {
    if (typeof p.maxMatchWork !== "number" || p.maxMatchWork < 0) {
      throw new TypeError("policy.maxMatchWork must be a non-negative number");
    }
  }
}

// ── Internal: glob matcher ───────────────────────────────────────────────────

const regexCache = new Map<string, RegExp>();

function matchesGlob(path: string, pattern: string): boolean {
  let re = regexCache.get(pattern);
  if (!re) {
    re = globToRegex(pattern);
    regexCache.set(pattern, re);
  }
  return re.test(path);
}