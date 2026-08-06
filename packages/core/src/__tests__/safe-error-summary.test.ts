/**
 * safe-error-summary — kernel leaf built on credential-scrub.
 * Covers: Error input, non-Error input, credential redaction, and that a
 * clean message passes through byte-identical (no over-redaction).
 */

import { describe, expect, test } from "bun:test";
import { safeErrorSummary } from "../kernel/sanitize/safe-error-summary.js";

describe("safeErrorSummary", () => {
  test("Error input: returns {name, message} unchanged when message is clean", () => {
    const error = new TypeError("connection refused");
    expect(safeErrorSummary(error)).toEqual({
      name: "TypeError",
      message: "connection refused",
    });
  });

  test("credential-shaped substrings in the message are scrubbed", () => {
    const error = new Error(
      "request failed with Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789",
    );
    const summary = safeErrorSummary(error);
    expect(summary.name).toBe("Error");
    expect(summary.message).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
    expect(summary.message).toContain("Bearer [REDACTED:bearer]");
  });

  test("non-Error input falls back to UnknownError with a scrubbed stringified message", () => {
    const summary = safeErrorSummary("plain string failure");
    expect(summary).toEqual({ name: "UnknownError", message: "plain string failure" });
  });

  test("non-Error input with an embedded credential is still scrubbed", () => {
    const summary = safeErrorSummary(
      "token leaked: sk-abcdefghijklmnopqrstuvwx",
    );
    expect(summary.name).toBe("UnknownError");
    expect(summary.message).not.toContain("sk-abcdefghijklmnopqrstuvwx");
    expect(summary.message).toContain("[REDACTED:sk-key]");
  });

  test("null/undefined input never throws", () => {
    expect(safeErrorSummary(null)).toEqual({ name: "UnknownError", message: "null" });
    expect(safeErrorSummary(undefined)).toEqual({ name: "UnknownError", message: "undefined" });
  });
});
