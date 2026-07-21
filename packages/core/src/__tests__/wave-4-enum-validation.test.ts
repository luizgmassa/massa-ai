/**
 * T1 (WAVE4-N6): ToolError + validateEnum helper.
 *
 * Asserts the teaching-error contract from spec.md AC 6:
 *   - invalid enum params throw ToolError with the valid-values list
 *   - valid values pass through unchanged
 *   - empty string / undefined / null all throw (not silently coerced)
 *
 * Discrimination sensor (run by the independent verifier):
 *   - remove the `!validValues.includes` check → the "invalid value rejected"
 *     test fails (validateEnum would return the bad value).
 *   - drop the `typeof value !== "string"` guard → the "undefined throws"
 *     test fails (validateEnum would return undefined as T).
 */
import { describe, test, expect } from "bun:test";
import { ToolError, validateEnum } from "../tools/enum-validation.js";
import { validateGitRef } from "../services/symbol/git-ref-validation.js";

describe("ToolError", () => {
  test("defaults statusCode to 400", () => {
    const e = new ToolError("bad");
    expect(e.statusCode).toBe(400);
    expect(e.message).toBe("bad");
    expect(e.name).toBe("ToolError");
    expect(e).toBeInstanceOf(Error);
  });

  test("honors an explicit statusCode (e.g. 412 for N1 stale generation)", () => {
    const e = new ToolError("stale", 412);
    expect(e.statusCode).toBe(412);
    expect(e.message).toBe("stale");
  });
});

describe("validateEnum", () => {
  const SCOPES = ["unstaged", "staged", "committed", "all"] as const;
  type Scope = (typeof SCOPES)[number];

  test("returns a valid value narrowed to T", () => {
    const v = validateEnum<Scope>("scope", "unstaged", SCOPES);
    expect(v).toBe("unstaged");
    // Type narrowing: assign to a Scope-typed slot to prove the narrow.
    const narrowed: Scope = v;
    expect(narrowed).toBe("unstaged");
  });

  test("throws ToolError listing valid values when the value is not a member", () => {
    expect(() => validateEnum<Scope>("scope", "bogus", SCOPES)).toThrow(
      ToolError,
    );
    try {
      validateEnum<Scope>("scope", "bogus", SCOPES);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).statusCode).toBe(400);
      // Teaching message must name the param, the received value, and every valid value.
      const msg = (e as Error).message;
      expect(msg).toContain("Invalid scope value: bogus.");
      expect(msg).toContain("unstaged, staged, committed, all");
    }
  });

  test("empty string throws (not silently coerced to a default)", () => {
    expect(() => validateEnum<Scope>("scope", "", SCOPES)).toThrow(ToolError);
    try {
      validateEnum<Scope>("scope", "", SCOPES);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("Invalid scope value:");
      expect((e as Error).message).toContain("unstaged, staged, committed, all");
    }
  });

  test("undefined throws (param omitted by the caller)", () => {
    expect(() =>
      validateEnum<Scope>("scope", undefined, SCOPES),
    ).toThrow(ToolError);
    try {
      validateEnum<Scope>("scope", undefined, SCOPES);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("Invalid scope value: undefined.");
    }
  });

  test("null throws", () => {
    expect(() => validateEnum<Scope>("scope", null, SCOPES)).toThrow(ToolError);
    try {
      validateEnum<Scope>("scope", null, SCOPES);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("Invalid scope value: null.");
    }
  });

  test("non-string throws (number, not coerced to a string match)", () => {
    expect(() =>
      // @ts-expect-error — deliberately feeding a non-string to prove the guard
      validateEnum<Scope>("scope", 42, SCOPES),
    ).toThrow(ToolError);
  });

  test("works for a singleton set (degenerate but legal)", () => {
    const v = validateEnum<"only">("mode", "only", ["only"] as const);
    expect(v).toBe("only");
    expect(() =>
      validateEnum<"only">("mode", "other", ["only"] as const),
    ).toThrow(ToolError);
  });
});

/**
 * T2 (WAVE4-N8): validateGitRef shell-arg guard.
 *
 * Asserts spec AC 10: `base_branch`/`since` starting with `--` or containing
 * shell metacharacters / failing the accepted pattern throw ToolError BEFORE
 * any `execFileSync("git", [...])` call.
 *
 * Discrimination: drop the `value.startsWith("--")` guard → the
 * `--upload-pack=...` test fails. Drop the pattern test → the `main;rm -rf /`
 * and `$(whoami)` tests fail. Empty string MUST NOT throw (caller falls back
 * to `main`).
 */
describe("validateGitRef", () => {
  test("valid refs pass: main, feature/foo-bar, v1.0.0, abc123", () => {
    const valid = ["main", "feature/foo-bar", "v1.0.0", "abc123", "origin/main", "2026-07-01"];
    for (const v of valid) {
      expect(() => validateGitRef("base_branch", v)).not.toThrow();
    }
  });

  test("empty string passes (caller falls back to default main)", () => {
    expect(() => validateGitRef("base_branch", "")).not.toThrow();
  });

  test("rejects `--upload-pack=evil` (git arg-injection)", () => {
    expect(() => validateGitRef("base_branch", "--upload-pack=evil")).toThrow(
      ToolError,
    );
    try {
      validateGitRef("base_branch", "--upload-pack=evil");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).statusCode).toBe(400);
      expect((e as Error).message).toContain("Invalid base_branch value:");
      expect((e as Error).message).toContain("Valid pattern:");
    }
  });

  test("rejects `main;rm -rf /` (shell metacharacter `;`)", () => {
    expect(() => validateGitRef("base_branch", "main;rm -rf /")).toThrow(
      ToolError,
    );
  });

  test("rejects `$(whoami)` (command substitution)", () => {
    expect(() => validateGitRef("since", "$(whoami)")).toThrow(ToolError);
  });

  test("rejects `--exec=...` (git option-as-arg)", () => {
    expect(() => validateGitRef("base_branch", "--exec=/tmp/evil")).toThrow(
      ToolError,
    );
  });

  test("rejects empty-with-newline `\\n` (newline injection)", () => {
    expect(() => validateGitRef("base_branch", "\n")).toThrow(ToolError);
  });

  test("rejects a ref containing a space (not in the accepted pattern)", () => {
    expect(() => validateGitRef("base_branch", "main with space")).toThrow(
      ToolError,
    );
  });

  test("rejects backtick command substitution", () => {
    expect(() => validateGitRef("base_branch", "`whoami`")).toThrow(ToolError);
  });
});