import { describe, expect, test } from "bun:test";
import {
  buildHealthResponse,
  listenAfterParserValidation,
} from "../health.js";

describe("Tools API parser readiness", () => {
  test("keeps liveness ok while exposing failed parser readiness", () => {
    const response = buildHealthResponse(
      {
        status: "failed",
        requiredExtensions: 33,
        validatedExtensions: 0,
        errors: [{ code: "incompatible_native_abi", message: "ABI mismatch" }],
      },
      new Date("2026-07-14T00:00:00.000Z"),
    );
    expect(response.status).toBe("ok");
    expect(response.parser.status).toBe("failed");
    expect(response.timestamp).toBe("2026-07-14T00:00:00.000Z");
  });

  test("waits for validation before listening on success", async () => {
    const order: string[] = [];
    await listenAfterParserValidation({
      validate: async () => { order.push("validate:start"); order.push("validate:end"); },
      listen: () => { order.push("listen"); },
      onValidationFailure: () => { order.push("failure"); },
    });
    expect(order).toEqual(["validate:start", "validate:end", "listen"]);
  });

  test("records failed readiness before starting the live API", async () => {
    const order: string[] = [];
    await listenAfterParserValidation({
      validate: async () => { order.push("validate"); throw new Error("missing grammar"); },
      onValidationFailure: (error) => {
        expect((error as Error).message).toBe("missing grammar");
        order.push("failure");
      },
      listen: () => { order.push("listen"); },
    });
    expect(order).toEqual(["validate", "failure", "listen"]);
  });
});
