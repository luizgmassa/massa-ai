/**
 * T3 (WAVE4-N1): getActiveGeneration + assertGenerationNotStale helpers.
 *
 * Asserts spec AC 2-6 (N1) and edge cases:
 *   - `ifNoneMatch` omitted → no throw (opt-in) — AC 5
 *   - `ifNoneMatch` set, `current === null` → 412 "No active generation" — AC 2
 *   - `ifNoneMatch` mismatch → 412 "Stale generation" — AC 3
 *   - `ifNoneMatch` matches `current` → no throw — AC 4
 *   - empty-string `ifNoneMatch` → no throw (edge case)
 *   - `getActiveGeneration` returns the repo's `generationId` or `null`
 *
 * Discrimination:
 *   - drop the `if (!ifNoneMatch) return` guard → "omitted → no throw" fails.
 *   - swap the `current === null` branch order → "no active generation" fails.
 *   - drop the `ifNoneMatch !== current` check → "mismatch" fails.
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

// Stub the symbol repository factory BEFORE importing the helper so
// `getActiveGeneration` does not require a live DATABASE_URL.
let activeScope: { projectId: string; generationId: string } | null = null;
mock.module("../data/symbol/symbol-repository-factory.js", () => ({
  getSymbolRepository: () => ({
    getActiveGenerationScope: async (_projectId: string) => activeScope,
  }),
}));

import { getActiveGeneration, assertGenerationNotStale } from "../services/symbol/active-generation.js";
import { ToolError } from "../tools/enum-validation.js";

describe("assertGenerationNotStale", () => {
  test("no throw when ifNoneMatch is undefined (opt-in, omitted by client)", () => {
    expect(() => assertGenerationNotStale(undefined, "gen-abc")).not.toThrow();
  });

  test("no throw when ifNoneMatch is empty string (edge case — treat as omitted)", () => {
    expect(() => assertGenerationNotStale("", "gen-abc")).not.toThrow();
  });

  test("no throw when ifNoneMatch matches current", () => {
    expect(() =>
      assertGenerationNotStale("gen-abc", "gen-abc"),
    ).not.toThrow();
  });

  test("throws 412 'No active generation' when ifNoneMatch set and current is null", () => {
    expect(() => assertGenerationNotStale("gen-abc", null)).toThrow(ToolError);
    try {
      assertGenerationNotStale("gen-abc", null);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).statusCode).toBe(412);
      expect((e as Error).message).toContain("No active generation");
      expect((e as Error).message).toContain("index the project before querying");
    }
  });

  test("throws 412 'Stale generation' when ifNoneMatch mismatches current", () => {
    expect(() =>
      assertGenerationNotStale("gen-old", "gen-new"),
    ).toThrow(ToolError);
    try {
      assertGenerationNotStale("gen-old", "gen-new");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).statusCode).toBe(412);
      const msg = (e as Error).message;
      expect(msg).toContain("Stale generation");
      expect(msg).toContain("client held gen-old");
      expect(msg).toContain("current is gen-new");
      expect(msg).toContain("Re-read the project map before retrying");
    }
  });

  test("precedence: no-active-generation wins over stale when ifNoneMatch set and current null", () => {
    // Spec AC 2 takes precedence over AC 3 when no active generation exists.
    try {
      assertGenerationNotStale("any", null);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toContain("No active generation");
      expect((e as Error).message).not.toContain("Stale generation");
    }
  });
});

describe("getActiveGeneration", () => {
  beforeEach(() => {
    activeScope = null;
  });

  test("returns the repo's generationId when an active generation exists", async () => {
    activeScope = { projectId: "proj-1", generationId: "gen-active-123" };
    const g = await getActiveGeneration("proj-1");
    expect(g).toBe("gen-active-123");
  });

  test("returns null when the workspace has no active generation (never indexed / vector-only)", async () => {
    activeScope = null;
    const g = await getActiveGeneration("proj-2");
    expect(g).toBeNull();
  });

  test("integration: assertGenerationNotStale with getActiveGeneration null + ifNoneMatch → 412", async () => {
    activeScope = null;
    const current = await getActiveGeneration("proj-3");
    expect(current).toBeNull();
    expect(() =>
      assertGenerationNotStale("gen-stale", current),
    ).toThrow(ToolError);
  });

  test("integration: assertGenerationNotStale with getActiveGeneration match → no throw", async () => {
    activeScope = { projectId: "proj-4", generationId: "gen-match" };
    const current = await getActiveGeneration("proj-4");
    expect(() =>
      assertGenerationNotStale("gen-match", current),
    ).not.toThrow();
  });
});