/**
 * Sanitizer unit tests.
 * Mocks ../config/index to control security.sanitizeInputs / maxInputLength.
 * Covers: sanitizeInput (on/off, HTML/control chars, length), FTS5 query,
 * userId validation, file-path traversal, JSON validation.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";

// ── Config mock (resilient: handles all keys any utils module may call,
//    so cross-file mock contamination cannot throw) ──
let securityState: { sanitizeInputs: boolean; maxInputLength: number } = {
  sanitizeInputs: true,
  maxInputLength: 100000,
};
let loggingState: { level: string; enableMetrics: boolean } = { level: "info", enableMetrics: false };
let rateLimitState = { requestsPerMinute: 60, tokensPerMinute: 100000 };

mock.module("../config/index.js", () => ({
  config: {
    get: (key: string) => {
      if (key === "security") return securityState;
      if (key === "logging") return loggingState;
      if (key === "rateLimit") return rateLimitState;
      return undefined;
    },
  },
}));

import {
  sanitizeInput,
  sanitizeFTS5Query,
  isValidUserId,
  sanitizeFilePath,
  isValidJSON,
} from "../utils/sanitizer";

describe("sanitizeInput", () => {
  beforeEach(() => {
    securityState = { sanitizeInputs: true, maxInputLength: 100000 };
  });

  test("returns input unchanged when sanitizeInputs=false", () => {
    securityState = { sanitizeInputs: false, maxInputLength: 100 };
    expect(sanitizeInput("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
  });

  test("strips < and > characters", () => {
    expect(sanitizeInput("<b>hi</b>")).toBe("bhi/b");
    expect(sanitizeInput("<script>")).toBe("script");
  });

  test("strips control characters (0x00-0x1F and 0x7F)", () => {
    expect(sanitizeInput("a\x00b")).toBe("ab");
    expect(sanitizeInput("a\x07b")).toBe("ab");
    expect(sanitizeInput("a\x1Fb")).toBe("ab");
    expect(sanitizeInput("a\x7Fb")).toBe("ab");
  });

  test("keeps printable whitespace (0x20 space, 0x09 tab, 0x0A newline are <=0x1F — tab/newline stripped)", () => {
    // 0x09 (tab) and 0x0A (newline) are in 0x00-0x1F -> stripped
    expect(sanitizeInput("a\tb\n")).toBe("ab");
    // 0x20 (space) is outside the range -> kept
    expect(sanitizeInput("a b")).toBe("a b");
  });

  test("enforces maxInputLength by slicing", () => {
    securityState = { sanitizeInputs: true, maxInputLength: 5 };
    expect(sanitizeInput("abcdefg")).toBe("abcde");
    expect(sanitizeInput("ab")).toBe("ab");
  });

  test("combines all sanitizations (strip + length)", () => {
    securityState = { sanitizeInputs: true, maxInputLength: 4 };
    expect(sanitizeInput("<a>bcdef")).toBe("abcd"); // strip tags -> "abcdef" then slice 4
  });
});

describe("sanitizeFTS5Query", () => {
  test("empty/whitespace-only -> '*'", () => {
    expect(sanitizeFTS5Query("")).toBe("*");
    expect(sanitizeFTS5Query("   ")).toBe("*");
    expect(sanitizeFTS5Query("()")).toBe("*"); // parens removed -> empty
  });

  test("single term -> quoted", () => {
    expect(sanitizeFTS5Query("tailwind")).toBe('"tailwind"');
    expect(sanitizeFTS5Query("  spaced  ")).toBe('"spaced"');
  });

  test("multiple terms -> quoted joined with OR", () => {
    expect(sanitizeFTS5Query("cn tailwind merge")).toBe('"cn" OR "tailwind" OR "merge"');
  });

  test("removes parentheses before splitting", () => {
    expect(sanitizeFTS5Query("cn() tailwind")).toBe('"cn" OR "tailwind"');
  });

  test("escapes internal double-quotes by doubling", () => {
    expect(sanitizeFTS5Query('a"b')).toBe('"a""b"');
  });

  test("escapes internal double-quotes within multi-term", () => {
    expect(sanitizeFTS5Query('he"llo wor"ld')).toBe('"he""llo" OR "wor""ld"');
  });
});

describe("isValidUserId", () => {
  test("valid user IDs", () => {
    expect(isValidUserId("abc123")).toBe(true);
    expect(isValidUserId("user_name")).toBe(true);
    expect(isValidUserId("user-name")).toBe(true);
    expect(isValidUserId("ABC_DEF-123")).toBe(true);
  });

  test("invalid user IDs", () => {
    expect(isValidUserId("")).toBe(false);
    expect(isValidUserId("a b")).toBe(false); // space
    expect(isValidUserId("a.b")).toBe(false); // dot
    expect(isValidUserId("a@b")).toBe(false); // @
    expect(isValidUserId("a/b")).toBe(false); // slash
  });

  test("rejects IDs longer than 64 chars", () => {
    expect(isValidUserId("a".repeat(64))).toBe(true);
    expect(isValidUserId("a".repeat(65))).toBe(false);
  });
});

describe("sanitizeFilePath", () => {
  test("removes ../ traversals", () => {
    expect(sanitizeFilePath("../etc/passwd")).toBe("etc/passwd");
    expect(sanitizeFilePath("../../etc/passwd")).toBe("etc/passwd");
    expect(sanitizeFilePath("a/../../b")).toBe("a/b");
  });

  test("removes ..\\ traversals and normalizes separators", () => {
    expect(sanitizeFilePath("..\\etc\\passwd")).toBe("etc/passwd");
  });

  test("removes leading slashes", () => {
    expect(sanitizeFilePath("/etc/passwd")).toBe("etc/passwd");
    expect(sanitizeFilePath("///etc/passwd")).toBe("etc/passwd");
  });

  test("preserves normal relative paths", () => {
    expect(sanitizeFilePath("foo/bar/baz.ts")).toBe("foo/bar/baz.ts");
  });

  // SEC-4 regression (CodeQL js/incomplete-multi-character-sanitization,
  // alert #21): replacement-based sanitizing was bypassable by overlapping
  // tokens. Segment filtering drops every literal ".." segment; multi-dot
  // groups like "...." are benign literal names, not parent references.
  test("drops every parent-reference segment", () => {
    expect(sanitizeFilePath("....//etc/passwd")).toBe("..../etc/passwd");
    expect(sanitizeFilePath("....//....//etc/passwd")).toBe("..../..../etc/passwd");
    expect(sanitizeFilePath("..../..../etc/passwd")).toBe("..../..../etc/passwd");
    expect(sanitizeFilePath("....\\\\etc\\\\passwd")).toBe("..../etc/passwd");
    expect(sanitizeFilePath("foo/..")).toBe("foo");
  });

  test("never returns a parent-reference segment", () => {
    for (const crafted of ["....//", "..../", "....\\\\", "..\\/..\\/", "x/....//y", "foo/.."]) {
      const segments = sanitizeFilePath(crafted).split("/");
      expect(segments).not.toContain("..");
    }
  });
});

describe("isValidJSON", () => {
  test("valid JSON strings", () => {
    expect(isValidJSON('{"a":1}')).toBe(true);
    expect(isValidJSON('[1,2,3]')).toBe(true);
    expect(isValidJSON('"str"')).toBe(true);
    expect(isValidJSON("42")).toBe(true);
    expect(isValidJSON("null")).toBe(true);
    expect(isValidJSON("true")).toBe(true);
  });

  test("invalid JSON strings", () => {
    expect(isValidJSON("")).toBe(false);
    expect(isValidJSON("{")).toBe(false);
    expect(isValidJSON('{"a":}')).toBe(false);
    expect(isValidJSON("not json")).toBe(false);
    expect(isValidJSON("[1,2,")).toBe(false);
  });
});