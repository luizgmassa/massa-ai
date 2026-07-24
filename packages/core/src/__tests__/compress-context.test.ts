/**
 * Unit tests for CompressContextTool (tools/compress_context.ts).
 *
 * The tool wraps CodeCompressor.compress() and reports token metrics. We test
 * the real handler with the regex path (LLM disabled) so assertions are
 * deterministic and no network/LLM is required.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { CompressContextTool } from "../tools/compress_context.js";
import { _setLlmEnabledForTesting } from "../services/memory/llm-client.js";

describe("CompressContextTool", () => {
  beforeEach(() => {
    // LLM off so compress() uses the deterministic regex path.
    _setLlmEnabledForTesting(false);
  });

  afterEach(() => {
    _setLlmEnabledForTesting(null);
  });

  test("name and description are set", () => {
    const tool = new CompressContextTool();
    expect(tool.name).toBe("compress_context");
    expect(tool.description).toContain("semantic compression");
  });

  test("inputSchema declares required content + strategy enum", () => {
    const tool = new CompressContextTool();
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema.required).toEqual(["content"]);
    expect(tool.inputSchema.properties.content.type).toBe("string");
    expect(tool.inputSchema.properties.strategy.enum).toContain("code_structure");
    expect(tool.inputSchema.properties.strategy.enum).toContain("semantic_dedup");
  });

  test("compresses code_structure content and reports metrics", async () => {
    const tool = new CompressContextTool();
    const code = [
      "import { foo } from 'bar';",
      "interface Iface { x: number; }",
      "export class Cls { method() { return 1; } }",
      "export function fn() { return 2; }",
    ].join("\n");
    const out = await tool.handle({ content: code, strategy: "code_structure" });
    expect(out.success).toBe(true);
    expect(typeof out.data.compressed).toBe("string");
    expect(out.data.compressed.length).toBeGreaterThan(0);
    expect(out.data.originalLength).toBe(code.length);
    expect(out.data.strategy).toBe("code_structure");
    expect(out.data.originalTokens).toBeGreaterThan(0);
    expect(out.data.compressedTokens).toBeGreaterThanOrEqual(0);
    // tokensSaved can be negative for tiny inputs where the structure skeleton
    // is longer than the original; just assert it is a finite number.
    expect(Number.isFinite(out.metadata.tokensSaved)).toBe(true);
    expect(typeof out.metadata.compressionRatio).toBe("number");
  });

  test("default strategy is code_structure when omitted", async () => {
    const tool = new CompressContextTool();
    const out = await tool.handle({ content: "export function f() { return 1; }" });
    expect(out.success).toBe(true);
    expect(out.data.strategy).toBe("code_structure");
  });

  test("semantic_dedup strategy removes duplicate lines", async () => {
    const tool = new CompressContextTool();
    const code = "const a = 1;\nconst a = 1;\nconst b = 2;\n";
    const out = await tool.handle({ content: code, strategy: "semantic_dedup" });
    expect(out.success).toBe(true);
    expect(out.data.strategy).toBe("semantic_dedup");
    // the duplicate `const a = 1;` should appear once
    const occurrences = (out.data.compressed.match(/const a = 1;/g) || []).length;
    expect(occurrences).toBe(1);
  });

  test("language param is accepted and flows through", async () => {
    const tool = new CompressContextTool();
    const out = await tool.handle({
      content: "export function f() { return 1; }",
      language: "typescript",
    });
    expect(out.success).toBe(true);
  });

  test("targetRatio param is accepted", async () => {
    const tool = new CompressContextTool();
    const out = await tool.handle({
      content: "export function f() { return 1; }",
      targetRatio: 0.5,
    });
    expect(out.success).toBe(true);
  });

  test("invalid strategy throws a ToolError (validateEnum)", async () => {
    const tool = new CompressContextTool();
    await expect(
      tool.handle({ content: "x", strategy: "bogus_strategy" }),
    ).rejects.toThrow(/Invalid strategy value/);
  });

  test("empty content compresses to empty-ish output without error", async () => {
    const tool = new CompressContextTool();
    const out = await tool.handle({ content: "", strategy: "code_structure" });
    expect(out.success).toBe(true);
    expect(out.data.originalLength).toBe(0);
  });

  test("hierarchical strategy (unknown to CodeCompressor) falls through to default", async () => {
    // CodeCompressor.compress default case returns content unchanged for
    // strategies it doesn't implement. The tool should still succeed.
    const tool = new CompressContextTool();
    const out = await tool.handle({
      content: "some content here",
      strategy: "hierarchical",
    });
    expect(out.success).toBe(true);
    expect(out.data.strategy).toBe("hierarchical");
  });

  test("returns error shape on internal failure", async () => {
    const tool = new CompressContextTool();
    // null content triggers a TypeError inside compress() which is caught
    // by the tool's try/catch and surfaced as { success: false, error }.
    const out = await tool.handle({ content: null as unknown as string });
    expect(out.success).toBe(false);
    expect(typeof out.error).toBe("string");
    expect(out.error).toContain("Failed to compress context");
  });

  test("BUGFIX: catch block is null-safe (content.length no longer throws in catch)", async () => {
    // Regression: the catch block previously did `content.length` for logging,
    // which threw a second TypeError when content was null/undefined, masking
    // the original error and escaping the handler. The fix guards with
    // typeof === "string" so the catch always returns the error shape.
    const tool = new CompressContextTool();
    const out = await tool.handle({ content: null as unknown as string });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Failed to compress context/);
  });

  test("conversation_summary strategy falls through to default (unchanged)", async () => {
    const tool = new CompressContextTool();
    const content = "some conversation text";
    const out = await tool.handle({
      content,
      strategy: "conversation_summary",
    });
    expect(out.success).toBe(true);
    expect(out.data.strategy).toBe("conversation_summary");
  });
});