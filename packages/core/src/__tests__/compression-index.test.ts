/**
 * Tests for the compression barrel (services/compression/index.ts).
 *
 * Verifies the CodeCompressor re-export is reachable.
 */

import { describe, test, expect } from "bun:test";
import { CodeCompressor } from "../services/compression/index.js";
import { CompressionStrategy } from "@massa-ai/shared";

describe("compression/index — re-exports", () => {
  test("CodeCompressor class is exported", () => {
    expect(typeof CodeCompressor).toBe("function");
  });

  test("CodeCompressor is constructable and returns CODE_STRUCTURE strategy", () => {
    const c = new CodeCompressor();
    expect(c.getStrategy()).toBe(CompressionStrategy.CODE_STRUCTURE);
  });
});