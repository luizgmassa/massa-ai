/**
 * BUG-01 AC 2 — a failed embedding surfaces as a degradation signal.
 *
 * Deleting the fabrication is only half the requirement. The other half is
 * that the resulting throw reaches the caller as an explicit failure instead
 * of a crash or, worse, a success carrying nothing. The memory tool handlers
 * convert a throw into a failed ToolResponse; that conversion is what turns
 * "no provider" into something a user can act on, and it is asserted here
 * rather than assumed from reading the catch block.
 *
 * The contrast with the old behavior is the point: before BUG-01 this same
 * call returned success with a memory whose vector was 384 random numbers.
 */

import { describe, expect, mock, test } from "bun:test";

// No provider, ever — the exact state BUG-01 is about. The rest of the barrel
// is spread through: other modules import EmbeddingService from here, and
// replacing the whole module would break them with a missing-export error that
// looks nothing like the behavior under test.
const actualEmbeddings = await import("../services/embeddings/index.js");
mock.module("../services/embeddings/index.js", () => ({
  ...actualEmbeddings,
  createEmbeddingProvider: async () => null,
}));

// The tool handler, not the controller: the controller rethrows, and it is
// StoreMemoryTool.handle that converts the throw into a failed ToolResponse.
// `store_memory` is also the surface the acceptance criterion names.
const { StoreMemoryTool } = await import("../tools/store_memory.js");

describe("embedding failure propagation (BUG-01)", () => {
  test("store_memory reports failure instead of storing a fabricated vector", async () => {
    const tool = new StoreMemoryTool();

    const response = await tool.handle({
      content: "a memory that cannot be embedded",
      type: "code",
      projectId: "bug-01-propagation",
    });

    expect(response.success).toBe(false);
    // The message has to name the actual cause. "Something went wrong" would
    // send an operator looking at the database instead of at their embedding
    // provider configuration.
    expect(String(response.error)).toMatch(/embedding provider/i);
  }, 30_000);
});
