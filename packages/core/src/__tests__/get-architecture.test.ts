/**
 * Get Architecture Tool — unit tests (Wave 5 FR-01 / FR-02 / FR-04 / AC-4).
 *
 * Covers the teaching-error path (unknown aspect → 400 with valid-values list)
 * and the param validation / shape contract. The full integration path (real
 * indexed fixture → cycles surfaced) is covered by `architecture-map.test.ts`
 * (pure) + the REST route test.
 */

import { describe, test, expect } from "bun:test";
import { GetArchitectureTool } from "../tools/get_architecture.js";
import { VALID_ARCHITECTURE_ASPECTS } from "../services/symbol/architecture.js";

async function teachingError(call: () => Promise<unknown>): Promise<string> {
  let maybeReturn: unknown;
  try {
    maybeReturn = await call();
  } catch (e) {
    if (e instanceof Error && e.name === "ToolError") return e.message;
    throw e;
  }
  const r = maybeReturn as { success: boolean; error?: string };
  if (r && r.success === false && typeof r.error === "string") return r.error;
  throw new Error(
    `expected teaching error; got: ${JSON.stringify(maybeReturn).slice(0, 200)}`,
  );
}

describe("GetArchitectureTool — param validation (FR-04 / AC-4)", () => {
  test("missing projectId → success:false with clear error", async () => {
    const tool = new GetArchitectureTool();
    const r = await tool.handle({ aspects: ["cycles"] });
    expect(r.success).toBe(false);
    expect((r as any).error).toContain("projectId is required");
  });

  test("unknown aspect → teaching error listing valid values (Wave 4 N6 parity)", async () => {
    const tool = new GetArchitectureTool();
    const err = await teachingError(() =>
      tool.handle({ projectId: "p", aspects: ["bogus"] } as any),
    );
    expect(err).toContain("Invalid aspects value: bogus.");
    expect(err).toContain("cycles");
  });

  test("unknown aspect among valid ones → teaching error still fires", async () => {
    const tool = new GetArchitectureTool();
    const err = await teachingError(() =>
      tool.handle({ projectId: "p", aspects: ["cycles", "nope"] } as any),
    );
    expect(err).toContain("Invalid aspects value: nope.");
    expect(err).toContain("cycles");
  });

  test("non-existent project → success:false (no crash, no teaching error)", async () => {
    const tool = new GetArchitectureTool();
    const r = await tool.handle({ projectId: "definitely-not-here", aspects: ["cycles"] });
    expect(r.success).toBe(false);
    // The error is a not-found message, NOT an aspect validation error.
    expect((r as any).error).not.toContain("Invalid aspects");
  });

  test("valid aspects pass validation (reaches service, returns not-found)", async () => {
    const tool = new GetArchitectureTool();
    const r = await tool.handle({ projectId: "definitely-not-here", aspects: ["cycles"] });
    // Reaching the service with a missing project returns a not-found error,
    // which proves the aspect validation passed (otherwise we'd see the
    // teaching-error message).
    expect((r as any).error).not.toContain("Invalid aspects");
  });

  test("inputSchema declares required projectId + aspects array", () => {
    const tool = new GetArchitectureTool();
    expect(tool.name).toBe("get_architecture");
    expect(tool.inputSchema.required).toEqual(["projectId"]);
    expect((tool.inputSchema.properties as any).aspects.type).toBe("array");
    expect((tool.inputSchema.properties as any).format.enum).toContain("json");
    expect((tool.inputSchema.properties as any).format.enum).toContain("toon");
  });

  test("VALID_ARCHITECTURE_ASPECTS contains cycles (the only opt-in today)", () => {
    expect(VALID_ARCHITECTURE_ASPECTS).toContain("cycles");
  });
});