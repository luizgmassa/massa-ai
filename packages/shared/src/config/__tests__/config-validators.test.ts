/**
 * In-process unit tests for the two config-load-time validators.
 *
 * Why these exist separately from `allowed-extensions-config.test.ts`: that
 * suite drives the validators through a real `config.json` in a **subprocess**,
 * because the assembled config is a module-level object literal frozen at
 * import. That is the right shape for proving the end-to-end wiring, and it is
 * the wrong shape for coverage — the parent process's instrumentation cannot
 * see lines executed in a child, so both validators read as dead code.
 *
 * `validateCapturePolicyConfig` was already entirely uncovered for that reason
 * before `security.allowedExtensions` gained a validator beside it. Calling
 * them directly costs one export each and covers every branch, including the
 * error messages, which the subprocess suite can only assert as substrings of
 * stderr.
 */

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ALLOWED_EXTENSIONS,
  validateAllowedExtensionsConfig,
  validateCapturePolicyConfig,
} from "../index";

describe("validateAllowedExtensionsConfig", () => {
  test("returns a copy of a valid list", () => {
    const input = [".ts", ".kt"];
    const result = validateAllowedExtensionsConfig(input);
    expect(result).toEqual([".ts", ".kt"]);
    expect(result).not.toBe(input);
  });

  test("accepts the full default list", () => {
    expect(validateAllowedExtensionsConfig([...DEFAULT_ALLOWED_EXTENSIONS])).toEqual([
      ...DEFAULT_ALLOWED_EXTENSIONS,
    ]);
  });

  test.each([
    ["a string", ".ts"],
    ["null", null],
    ["undefined", undefined],
    ["an object", { ts: true }],
    ["a number", 3],
  ])("rejects %s", (_label, input) => {
    expect(() => validateAllowedExtensionsConfig(input)).toThrow(/must be an array/);
  });

  test("rejects an empty array rather than indexing nothing", () => {
    expect(() => validateAllowedExtensionsConfig([])).toThrow(/must not be empty/);
  });

  test.each([
    ["no leading dot", "ts"],
    ["a bare dot", "."],
    ["an empty string", ""],
    ["a non-string entry", 42],
    ["a null entry", null],
  ])("rejects %s as an entry", (_label, entry) => {
    expect(() => validateAllowedExtensionsConfig([".ts", entry])).toThrow(/dot-prefixed/);
  });
});

describe("validateCapturePolicyConfig", () => {
  const validRule = { pattern: "**/*.log", disposition: "Drop" as const };

  test("returns the rules for a minimal valid policy", () => {
    const result = validateCapturePolicyConfig({ rules: [validRule] });
    expect(result.rules).toEqual([validRule]);
    expect(result.maxMatchWork).toBeUndefined();
    expect(result.maxIgnorePatterns).toBeUndefined();
  });

  test("passes through the optional bounds when present", () => {
    const result = validateCapturePolicyConfig({
      rules: [validRule],
      maxMatchWork: 5,
      maxIgnorePatterns: 7,
    });
    expect(result.maxMatchWork).toBe(5);
    expect(result.maxIgnorePatterns).toBe(7);
  });

  test("accepts every disposition", () => {
    const rules = [
      { pattern: "a", disposition: "Keep" as const },
      { pattern: "b", disposition: "Drop" as const },
      { pattern: "c", disposition: "MetadataOnly" as const },
    ];
    expect(validateCapturePolicyConfig({ rules }).rules).toEqual(rules);
  });

  test.each([
    ["null", null],
    ["a string", "policy"],
  ])("rejects %s as the policy", (_label, input) => {
    expect(() => validateCapturePolicyConfig(input)).toThrow(/must be an object/);
  });

  test("rejects an unknown field — the schema is closed", () => {
    expect(() => validateCapturePolicyConfig({ rules: [], bogus: 1 })).toThrow(/unknown field/);
  });

  test("rejects a non-array rules field", () => {
    expect(() => validateCapturePolicyConfig({ rules: "all" })).toThrow(/rules must be an array/);
  });

  test.each([
    ["null", null],
    ["a string", "nope"],
  ])("rejects %s as a rule", (_label, rule) => {
    expect(() => validateCapturePolicyConfig({ rules: [rule] })).toThrow(/must be objects/);
  });

  test.each([
    ["a missing pattern", { disposition: "Drop" }],
    ["an empty pattern", { pattern: "", disposition: "Drop" }],
    ["a non-string pattern", { pattern: 5, disposition: "Drop" }],
  ])("rejects %s", (_label, rule) => {
    expect(() => validateCapturePolicyConfig({ rules: [rule] })).toThrow(
      /pattern must be a non-empty string/,
    );
  });

  test.each([
    ["an unknown disposition", { pattern: "a", disposition: "Ignore" }],
    ["a missing disposition", { pattern: "a" }],
  ])("rejects %s", (_label, rule) => {
    expect(() => validateCapturePolicyConfig({ rules: [rule] })).toThrow(
      /must be Keep\|Drop\|MetadataOnly/,
    );
  });

  test("rejects more Drop rules than maxIgnorePatterns allows", () => {
    expect(() =>
      validateCapturePolicyConfig({
        rules: [validRule, { pattern: "**/*.tmp", disposition: "Drop" }],
        maxIgnorePatterns: 1,
      }),
    ).toThrow(/exceed maxIgnorePatterns=1/);
  });

  test("counts only Drop rules against maxIgnorePatterns", () => {
    expect(() =>
      validateCapturePolicyConfig({
        rules: [validRule, { pattern: "**/*.ts", disposition: "Keep" }],
        maxIgnorePatterns: 1,
      }),
    ).not.toThrow();
  });

  test.each([
    ["a negative maxMatchWork", -1],
    ["a non-numeric maxMatchWork", "lots"],
  ])("rejects %s", (_label, maxMatchWork) => {
    expect(() => validateCapturePolicyConfig({ rules: [validRule], maxMatchWork })).toThrow(
      /maxMatchWork must be a non-negative number/,
    );
  });

  test("accepts a zero maxMatchWork — zero is not negative", () => {
    expect(validateCapturePolicyConfig({ rules: [validRule], maxMatchWork: 0 }).maxMatchWork).toBe(
      0,
    );
  });
});
