/**
 * Provider-compatibility contract for every published tool schema.
 *
 * Vertex AI (and Moonshot, and OpenAI strict mode) require a function
 * declaration's `parameters` to be a plain OBJECT schema. A root-level
 * combinator (`anyOf` / `oneOf` / `allOf`) or `$ref` makes the schema a union
 * and the whole request fails — not just the offending tool:
 *
 *   Unable to submit request because `massa-ai_trace_path` functionDeclaration
 *   parameters schema should be of type OBJECT.
 *
 * That is a whole-server outage on any Gemini/Vertex-backed host, so it is
 * guarded for all tools rather than for the one that regressed (`trace_path`).
 * Nested combinators inside `properties` are fine and deliberately allowed —
 * `search_definitions.kind` uses one and is validated ahead of `trace_path`.
 */
import { describe, expect, test } from "bun:test";
import { TOOL_DEFINITIONS } from "../tool-definitions.js";

const ROOT_COMBINATORS = ["anyOf", "oneOf", "allOf", "$ref"] as const;

describe("tool schema provider compatibility", () => {
  test("every tool inputSchema is a root-level OBJECT schema", () => {
    const offenders = TOOL_DEFINITIONS.filter(
      (tool) => (tool.inputSchema as Record<string, unknown>)?.type !== "object",
    ).map((tool) => tool.name);
    expect(offenders).toEqual([]);
  });

  test("no tool inputSchema carries a root-level combinator or $ref", () => {
    const offenders: string[] = [];
    for (const tool of TOOL_DEFINITIONS) {
      const schema = tool.inputSchema as Record<string, unknown>;
      for (const key of ROOT_COMBINATORS) {
        if (schema && key in schema) offenders.push(`${tool.name}.${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the guard covers the full published tool surface", () => {
    expect(TOOL_DEFINITIONS.length).toBeGreaterThanOrEqual(59);
  });
});
