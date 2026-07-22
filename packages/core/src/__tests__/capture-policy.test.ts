/**
 * Capture Policy unit tests (Wave 5 T15 / FR-11 / AC-9 / AC-28).
 *
 * Validates:
 *  - applyPolicy returns the first matching rule's disposition, else Keep.
 *  - DEFAULT_POLICY migration: node_modules/foo.js → Drop; a markdown docs
 *    file → Keep.
 *  - validatePolicy enforces MAX_IGNORE_PATTERNS + denyUnknownFields.
 *  - The exported interfaces (Policy, Disposition, ApplyPolicyFn) are
 *    importable from capture-policy-interfaces (FR-26 / AC-28 interface
 *    contract).
 */

import { describe, expect, test } from "bun:test";
import {
  applyPolicy,
  DEFAULT_POLICY,
  MAX_IGNORE_PATTERNS,
  MAX_MATCH_WORK,
  validatePolicy,
} from "../services/search/capture-policy.js";
import type { ApplyPolicyFn, Disposition, Policy } from "../services/search/capture-policy-interfaces.js";

describe("capture-policy (FR-11 / AC-9)", () => {
  test("applyPolicy(node_modules/foo.js, DEFAULT_POLICY) returns Drop", () => {
    expect(applyPolicy("node_modules/foo/bar.js", DEFAULT_POLICY)).toBe("Drop");
    expect(applyPolicy("node_modules/foo.js", DEFAULT_POLICY)).toBe("Drop");
  });

  test("applyPolicy(markdown docs file, DEFAULT_POLICY) returns Keep", () => {
    expect(applyPolicy("docs/README.md", DEFAULT_POLICY)).toBe("Keep");
    expect(applyPolicy("src/index.ts", DEFAULT_POLICY)).toBe("Keep");
  });

  test("applyPolicy returns the first matching rule, then stops", () => {
    const policy: Policy = {
      rules: [
        { pattern: "src/**", disposition: "Keep" },
        { pattern: "src/legacy/**", disposition: "Drop" },
      ],
    };
    // src/index.ts matches the first rule (Keep) and the second is never
    // consulted — first-match-wins semantics.
    expect(applyPolicy("src/index.ts", policy)).toBe("Keep");
    // src/legacy/old.ts also matches the first rule (src/**) → Keep, NOT
    // the more-specific second rule. Callers must order rules from most
    // specific to least specific.
    expect(applyPolicy("src/legacy/old.ts", policy)).toBe("Keep");
  });

  test("applyPolicy returns Keep when no rule matches", () => {
    const policy: Policy = { rules: [{ pattern: "*.log", disposition: "Drop" }] };
    expect(applyPolicy("src/index.ts", policy)).toBe("Keep");
  });

  test("DEFAULT_POLICY drops .env and .env.local", () => {
    expect(applyPolicy(".env", DEFAULT_POLICY)).toBe("Drop");
    expect(applyPolicy(".env.local", DEFAULT_POLICY)).toBe("Drop");
  });

  test("DEFAULT_POLICY drops test files", () => {
    expect(applyPolicy("src/foo.test.ts", DEFAULT_POLICY)).toBe("Drop");
    expect(applyPolicy("src/__tests__/foo.test.ts", DEFAULT_POLICY)).toBe("Drop");
  });

  test("DEFAULT_POLICY keeps .ts source", () => {
    expect(applyPolicy("src/services/search/capture-policy.ts", DEFAULT_POLICY)).toBe("Keep");
  });

  test("validatePolicy rejects too many Drop rules (MAX_IGNORE_PATTERNS)", () => {
    const tooMany: Policy = {
      rules: Array.from({ length: 3 }, (_, i) => ({
        pattern: `drop${i}`,
        disposition: "Drop" as const,
      })),
      maxIgnorePatterns: 2,
    };
    expect(() => validatePolicy(tooMany)).toThrow(/exceed maxIgnorePatterns=2/);
  });

  test("validatePolicy rejects unknown fields when denyUnknownFields=true", () => {
    const withUnknown = {
      rules: [],
      bogusField: true,
    };
    expect(() => validatePolicy(withUnknown, { denyUnknownFields: true })).toThrow(
      /unknown field "bogusField"/,
    );
  });

  test("validatePolicy accepts a valid policy", () => {
    const valid: Policy = { rules: [], maxMatchWork: 100_000, maxIgnorePatterns: 1_024 };
    expect(() => validatePolicy(valid)).not.toThrow();
  });

  test("validatePolicy rejects negative maxMatchWork", () => {
    expect(() => validatePolicy({ rules: [], maxMatchWork: -1 })).toThrow(
      /maxMatchWork must be a non-negative number/,
    );
  });

  test("bounds constants are exported and match FR-11", () => {
    expect(MAX_MATCH_WORK).toBe(100_000);
    expect(MAX_IGNORE_PATTERNS).toBe(1_024);
  });
});

describe("capture-policy interface contract (FR-26 / AC-28)", () => {
  test("Policy, Disposition, ApplyPolicyFn are importable from capture-policy-interfaces", () => {
    // Type-level check: if the imports above compiled, the interfaces are
    // exported. Runtime check: applyPolicy has the ApplyPolicyFn shape.
    const fn: ApplyPolicyFn = applyPolicy;
    const disp: Disposition = "Keep";
    const pol: Policy = { rules: [] };
    expect(typeof fn).toBe("function");
    expect(["Keep", "Drop", "MetadataOnly"]).toContain(disp);
    expect(Array.isArray(pol.rules)).toBe(true);
  });
});