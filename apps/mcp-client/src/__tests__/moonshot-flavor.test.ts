/**
 * Moonshot flavor transport wrapper — Wave 5 FR-17 / AC-14 (T25).
 *
 * Verifies:
 *  - `applyMoonshotFlavor` with flavor="moonshot" strips root-level
 *    `allOf`/`anyOf`/`oneOf`/`$ref` from each tool's inputSchema.
 *  - Without the flavor (or a non-moonshot flavor), schemas are unchanged.
 *  - Nested combinators inside `properties` are preserved (shallow strip).
 *  - The original input object is not mutated (transport-only).
 *  - `resolveFlavor` reads `_meta.flavor` and a `flavor` param.
 */

import { describe, expect, test } from "bun:test";
import {
  applyMoonshotFlavor,
  resolveFlavor,
  stripMoonshotCombinators,
  type FlavorToolsListResult,
} from "../moonshot-flavor.js";

function makeResult(schemas: Record<string, unknown>[]): FlavorToolsListResult {
  return {
    tools: schemas.map((schema, i) => ({
      name: `tool-${i}`,
      description: `desc-${i}`,
      inputSchema: schema,
    })),
  };
}

describe("stripMoonshotCombinators (root-level strip)", () => {
  test("strips root-level allOf", () => {
    const schema = {
      type: "object",
      allOf: [{ type: "object" }],
      properties: { foo: { type: "string" } },
    };
    const stripped = stripMoonshotCombinators(schema);
    expect(stripped.allOf).toBeUndefined();
    expect(stripped.type).toBe("object");
    expect(stripped.properties).toEqual({ foo: { type: "string" } });
  });

  test("strips root-level anyOf", () => {
    const schema = { anyOf: [{ type: "string" }, { type: "number" }] };
    const stripped = stripMoonshotCombinators(schema);
    expect(stripped.anyOf).toBeUndefined();
  });

  test("strips root-level oneOf", () => {
    const schema = { oneOf: [{ type: "string" }, { type: "number" }] };
    const stripped = stripMoonshotCombinators(schema);
    expect(stripped.oneOf).toBeUndefined();
  });

  test("strips root-level $ref", () => {
    const schema = { $ref: "#/definitions/MyType", type: "object" };
    const stripped = stripMoonshotCombinators(schema);
    expect(stripped.$ref).toBeUndefined();
    expect(stripped.type).toBe("object");
  });

  test("preserves nested combinators inside properties (shallow strip)", () => {
    const schema = {
      type: "object",
      anyOf: [{ type: "object" }],
      properties: {
        foo: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
      },
    };
    const stripped = stripMoonshotCombinators(schema);
    expect(stripped.anyOf).toBeUndefined(); // root stripped
    expect((stripped.properties as Record<string, unknown>).foo).toEqual({
      anyOf: [{ type: "string" }, { type: "null" }], // nested preserved
    });
  });

  test("does not mutate the original schema object", () => {
    const schema = { anyOf: [{ type: "string" }] };
    const snapshot = JSON.stringify(schema);
    stripMoonshotCombinators(schema);
    expect(JSON.stringify(schema)).toBe(snapshot);
  });

  test("no combinators present → schema unchanged (same keys)", () => {
    const schema = { type: "object", properties: { foo: { type: "string" } } };
    const stripped = stripMoonshotCombinators(schema);
    expect(stripped).toEqual(schema);
  });
});

describe("applyMoonshotFlavor (result-level)", () => {
  test("flavor=moonshot strips root combinators from all tools", () => {
    const result = makeResult([
      { type: "object", allOf: [{}] },
      { type: "string", anyOf: [{ type: "string" }] },
      { $ref: "#/definitions/X" },
    ]);
    const flavored = applyMoonshotFlavor(result, "moonshot");
    expect(flavored.tools[0]!.inputSchema.allOf).toBeUndefined();
    expect(flavored.tools[1]!.inputSchema.anyOf).toBeUndefined();
    expect(flavored.tools[2]!.inputSchema.$ref).toBeUndefined();
  });

  test("flavor=undefined returns the same reference (no work)", () => {
    const result = makeResult([{ anyOf: [{}] }]);
    const flavored = applyMoonshotFlavor(result, undefined);
    expect(flavored).toBe(result); // same reference
  });

  test("flavor not moonshot returns the same reference", () => {
    const result = makeResult([{ anyOf: [{}] }]);
    const flavored = applyMoonshotFlavor(result, "vanilla");
    expect(flavored).toBe(result);
  });

  test("does not mutate the original result's tools", () => {
    const result = makeResult([{ anyOf: [{ type: "string" }] }]);
    const snapshot = JSON.stringify(result.tools[0]!.inputSchema);
    applyMoonshotFlavor(result, "moonshot");
    expect(JSON.stringify(result.tools[0]!.inputSchema)).toBe(snapshot);
  });

  test("preserves nextCursor and tool names/descriptions", () => {
    const result: FlavorToolsListResult = {
      tools: [{ name: "t1", description: "d1", inputSchema: { anyOf: [{}] } }],
      nextCursor: "abc",
    };
    const flavored = applyMoonshotFlavor(result, "moonshot");
    expect(flavored.nextCursor).toBe("abc");
    expect(flavored.tools[0]!.name).toBe("t1");
    expect(flavored.tools[0]!.description).toBe("d1");
  });

  test("AC-14: schema with injected anyOf — stripped with flavor, unchanged without", () => {
    // Fixture: a tool schema that temporarily has a root-level anyOf
    const fixtureSchema = {
      type: "object",
      anyOf: [{ type: "object" }, { type: "string" }],
      properties: { q: { type: "string" } },
    };
    const result = makeResult([fixtureSchema]);

    // Without flavor: anyOf present (unchanged)
    const plain = applyMoonshotFlavor(result, undefined);
    expect(plain.tools[0]!.inputSchema.anyOf).toBeDefined();

    // With moonshot: anyOf stripped
    const moon = applyMoonshotFlavor(result, "moonshot");
    expect(moon.tools[0]!.inputSchema.anyOf).toBeUndefined();
    expect(moon.tools[0]!.inputSchema.type).toBe("object");
    expect(moon.tools[0]!.inputSchema.properties).toEqual({ q: { type: "string" } });
  });
});

describe("resolveFlavor (request param extraction)", () => {
  test("reads _meta.flavor from request params", () => {
    const req = { params: { _meta: { flavor: "moonshot" } } };
    expect(resolveFlavor(req)).toBe("moonshot");
  });

  test("reads flavor param directly when no _meta", () => {
    const req = { params: { flavor: "moonshot" } };
    expect(resolveFlavor(req)).toBe("moonshot");
  });

  test("returns undefined when no flavor present", () => {
    const req = { params: { cursor: "abc" } };
    expect(resolveFlavor(req)).toBeUndefined();
  });

  test("returns undefined when params is undefined", () => {
    const req = { params: undefined };
    expect(resolveFlavor(req)).toBeUndefined();
  });

  test("_meta.flavor takes precedence over param flavor", () => {
    const req = { params: { _meta: { flavor: "moonshot" }, flavor: "vanilla" } };
    expect(resolveFlavor(req)).toBe("moonshot");
  });

  test("non-string _meta.flavor is ignored", () => {
    const req = { params: { _meta: { flavor: 123 } } };
    expect(resolveFlavor(req)).toBeUndefined();
  });
});