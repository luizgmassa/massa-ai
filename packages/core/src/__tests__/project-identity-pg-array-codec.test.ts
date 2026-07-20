/**
 * T6 tests — PG array-literal codec + text-array identity payload handling.
 * Production pins: `memories.tags` is TEXT holding `{a,b}` literals (Prisma
 * adapter has no OID-1009 mapping); native text[] columns arrive as JS arrays.
 */

import { describe, expect, test } from "bun:test";

import { inspectIdentityPayload } from "../services/project-identity/index.js";
import {
  parsePgArrayLiteral,
  toPgArrayLiteral,
} from "../services/project-identity/index.js";

describe("pg array literal codec", () => {
  test("parses JS arrays, literals, quoted elements, escapes, and NULL tokens", () => {
    expect(parsePgArrayLiteral(["a", "b"])).toEqual(["a", "b"]);
    expect(parsePgArrayLiteral("{alpha,beta}")).toEqual(["alpha", "beta"]);
    expect(parsePgArrayLiteral('{"a,b","c"}')).toEqual(["a,b", "c"]);
    expect(parsePgArrayLiteral("{}")).toEqual([]);
    expect(parsePgArrayLiteral("")).toEqual([]);
    expect(parsePgArrayLiteral("{NULL}")).toEqual([""]);
    expect(parsePgArrayLiteral('{"NULL"}')).toEqual(["NULL"]);
    expect(parsePgArrayLiteral("{a\\,b,c}")).toEqual(["a,b", "c"]);
  });

  test("rejects non-array representations as malformed (undefined), never throws", () => {
    expect(parsePgArrayLiteral("not-an-array")).toBeUndefined();
    expect(parsePgArrayLiteral('["json","array"]')).toBeUndefined();
    expect(parsePgArrayLiteral(42)).toBeUndefined();
    expect(parsePgArrayLiteral(["a", 1])).toBeUndefined();
    expect(parsePgArrayLiteral('{"unterminated')).toBeUndefined();
    expect(parsePgArrayLiteral(null)).toBeUndefined();
    expect(parsePgArrayLiteral(undefined)).toBeUndefined();
  });

  test("serializes with quoting/escaping so literals round-trip", () => {
    expect(toPgArrayLiteral(["alpha", "beta"])).toBe("{alpha,beta}");
    expect(toPgArrayLiteral([])).toBe("{}");
    const items = ["a,b", 'quo"te', "back\\slash", "NULL", "", "has space"];
    expect(parsePgArrayLiteral(toPgArrayLiteral(items))).toEqual(items);
  });
});

describe("inspectIdentityPayload — text-array on TEXT columns (T6 finding)", () => {
  test("a PG array literal payload is inspected, not flagged malformed", () => {
    const inspected = inspectIdentityPayload(
      '{"project:t6-source","handoff:t6-source",other}',
      "text-array",
      "t6-source",
    );
    expect(inspected.malformed).toBe(false);
    expect(inspected.count).toBe(2);
    // Canonical form preserves array order (object keys are sorted, arrays are not).
    expect(inspected.canonical).toBe('["project:t6-source","handoff:t6-source","other"]');
  });

  test("a JS array payload (native text[]) keeps the old behavior", () => {
    const inspected = inspectIdentityPayload(
      ["project:t6-source", "other"],
      "text-array",
      "t6-source",
    );
    expect(inspected.malformed).toBe(false);
    expect(inspected.count).toBe(1);
  });

  test("genuinely malformed payloads are still flagged", () => {
    expect(inspectIdentityPayload("not-an-array", "text-array", "p").malformed).toBe(true);
    expect(inspectIdentityPayload(42, "text-array", "p").malformed).toBe(true);
  });
});
