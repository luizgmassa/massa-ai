/**
 * `parseFrontmatter`/`parseSimpleYaml`/`unquoteScalar` direct unit tests.
 *
 * doctor.test.ts only ever exercises this parser through ONE flat fixture
 * (`AGENT_FILE`), so the nested `metadata:` block, blank/comment lines,
 * non-matching lines, the missing-frontmatter error, and the quote-stripping
 * branches of `unquoteScalar` were never reached in-suite. These tests call
 * the parser directly to close that gap.
 */
import { describe, test, expect } from "bun:test";
import { parseFrontmatter, parseSimpleYaml, unquoteScalar } from "../frontmatter.js";

describe("parseFrontmatter", () => {
  test("parses flat scalars and returns the body", () => {
    const { frontmatter, body } = parseFrontmatter("---\nname: x\nmodel: opus\n---\nbody text\n");
    expect(frontmatter).toEqual({ name: "x", model: "opus" });
    expect(body).toBe("body text\n");
  });

  test("throws when there is no --- ... --- block", () => {
    expect(() => parseFrontmatter("no frontmatter here")).toThrow(
      /charter missing YAML frontmatter/,
    );
  });

  test("handles CRLF line endings in both the fence and the body", () => {
    const { frontmatter, body } = parseFrontmatter("---\r\nname: x\r\n---\r\nbody\r\n");
    expect(frontmatter).toEqual({ name: "x" });
    expect(body).toBe("body\r\n");
  });

  test("strips a leading blank line from the body but keeps the rest", () => {
    const { body } = parseFrontmatter("---\nname: x\n---\n\nfirst real line\n");
    expect(body).toBe("first real line\n");
  });
});

describe("parseSimpleYaml", () => {
  test("skips blank lines and comment lines", () => {
    const result = parseSimpleYaml("\n# a comment\nname: x\n  # indented comment\nmodel: opus\n");
    expect(result).toEqual({ name: "x", model: "opus" });
  });

  test("skips a line that does not match key: value at all", () => {
    const result = parseSimpleYaml("not a key line\nname: x\n");
    expect(result).toEqual({ name: "x" });
  });

  test("parses a one-level nested metadata: mapping", () => {
    const result = parseSimpleYaml("name: x\nmetadata:\n  permission: readonly\n  tier: high\nmodel: opus\n");
    expect(result).toEqual({
      name: "x",
      metadata: { permission: "readonly", tier: "high" },
      model: "opus",
    });
  });

  test("a nested block stops at the first line indented less than 2 spaces", () => {
    const result = parseSimpleYaml("metadata:\n  permission: readonly\nname: x\n");
    expect(result).toEqual({ metadata: { permission: "readonly" }, name: "x" });
  });

  test("a nested block stops at a malformed nested line", () => {
    const result = parseSimpleYaml("metadata:\n  permission: readonly\n  not a nested key\n  tier: high\n");
    // The malformed line breaks the nested loop before it is consumed, so
    // it is left for the outer loop, which also does not match it — dropped.
    expect(result).toEqual({ metadata: { permission: "readonly" } });
  });

  test("an empty value produces an empty nested mapping when nothing indented follows", () => {
    const result = parseSimpleYaml("metadata:\nname: x\n");
    expect(result).toEqual({ metadata: {}, name: "x" });
  });
});

describe("unquoteScalar", () => {
  test("strips matching double quotes", () => {
    expect(unquoteScalar('"hello"')).toBe("hello");
  });

  test("strips matching single quotes", () => {
    expect(unquoteScalar("'hello'")).toBe("hello");
  });

  test("leaves an unquoted scalar untouched", () => {
    expect(unquoteScalar("hello")).toBe("hello");
  });

  test("leaves mismatched quote characters untouched", () => {
    expect(unquoteScalar("'hello\"")).toBe("'hello\"");
  });
});
