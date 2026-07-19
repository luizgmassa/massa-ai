import { describe, expect, test } from "bun:test";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { pageToolDefinitions } from "./tool-discovery.js";
import type { ToolDefinition } from "./tool-definitions.js";

function registry(size: number): ToolDefinition[] {
  return Array.from({ length: size }, (_, index) => ({
    name: `tool-${index.toString().padStart(3, "0")}`,
    description: `Tool ${index}`,
    inputSchema: { type: "object", properties: { value: { type: "string" } } },
    apiEndpoint: `/tools/${index}`,
    apiMethod: "GET",
  }));
}

function expectInvalid(cursor: string, tools = registry(201)): void {
  try {
    pageToolDefinitions(tools, cursor);
    throw new Error("cursor unexpectedly accepted");
  } catch (error) {
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
  }
}

describe("MCP tool discovery pagination", () => {
  test("returns exact one-shot pages for registries below or equal to 100", () => {
    for (const size of [0, 1, 99, 100]) {
      const result = pageToolDefinitions(registry(size));
      expect(result.tools).toHaveLength(size);
      expect(result.nextCursor).toBeUndefined();
    }
    expect(pageToolDefinitions([])).toEqual({ tools: [] });
  });

  test("walks 101 and 201 tools without gaps, duplicates, or reordering", () => {
    for (const size of [101, 201]) {
      const source = registry(size);
      const names: string[] = [];
      let cursor: string | undefined;
      do {
        const page = pageToolDefinitions(source, cursor);
        names.push(...page.tools.map((tool) => tool.name));
        cursor = page.nextCursor;
      } while (cursor);
      expect(names).toEqual(source.map((tool) => tool.name));
      expect(new Set(names).size).toBe(size);
    }
  });

  test("rejects malformed, unsupported, misaligned, and out-of-range cursors", () => {
    expectInvalid("not+base64");
    expectInvalid(Buffer.from("not-json").toString("base64url"));
    for (const payload of [
      { v: 2, fingerprint: "x", offset: 100 },
      { v: 1, fingerprint: "x", offset: 1 },
      { v: 1, fingerprint: "x", offset: 300 },
      { v: 1, fingerprint: "x", offset: 100, extra: true },
    ]) expectInvalid(Buffer.from(JSON.stringify(payload)).toString("base64url"));
  });

  test("rejects cursors after registry order or public definition changes", () => {
    const source = registry(101);
    const cursor = pageToolDefinitions(source).nextCursor!;
    expectInvalid(cursor, [...source].reverse());
    const changed = registry(101);
    changed[0] = { ...changed[0]!, description: "Changed" };
    expectInvalid(cursor, changed);
  });
});
