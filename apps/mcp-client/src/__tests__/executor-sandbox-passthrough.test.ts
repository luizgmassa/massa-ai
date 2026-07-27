/**
 * T8 / SEC-03 AC 2 — `sandboxMode` survives the embedded transport.
 *
 * The controller is the single serialization point, and both transports are
 * meant to be passthrough — but "meant to be" is the assumption this asserts.
 * `embedded-api-client.ts` mirrors the REST endpoint map by hand, and that
 * parity is a tested contract precisely because a hand-written mirror can drop
 * a field the REST route returns.
 *
 * A dropped `sandboxMode` degrades exactly the way the requirement exists to
 * prevent: the MCP caller gets a normal-looking result and cannot tell whether
 * the code it just ran had OS isolation.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { EmbeddedApiClient } from "../embedded-api-client.js";

const ORIGINAL_MODE = process.env.MASSA_AI_EXECUTOR_SANDBOX;

beforeEach(() => {
  // Pin the mode so the assertion is about passthrough, not about what this
  // machine happens to have installed.
  process.env.MASSA_AI_EXECUTOR_SANDBOX = "none";
});

afterEach(() => {
  if (ORIGINAL_MODE === undefined) {
    delete process.env.MASSA_AI_EXECUTOR_SANDBOX;
  } else {
    process.env.MASSA_AI_EXECUTOR_SANDBOX = ORIGINAL_MODE;
  }
});

/** Unwrap the `{ success, data }` envelope the tool endpoints return. */
function data(response: unknown): Record<string, unknown> {
  return (response as { data: Record<string, unknown> }).data;
}

describe("executor sandboxMode passthrough (SEC-03)", () => {
  test("execute carries sandboxMode through the embedded client", async () => {
    const client = new EmbeddedApiClient();

    const response = await client.post("/api/v1/executor/execute", {
      language: "shell",
      code: "echo hi",
    });

    expect(data(response).sandboxMode).toBe("none");
  }, 60_000);

  test("batch_execute carries sandboxMode on every result item", async () => {
    const client = new EmbeddedApiClient();

    const response = await client.post("/api/v1/executor/batch_execute", {
      commands: ["echo one", "echo two"],
    });

    const results = data(response).results as Record<string, unknown>[];
    expect(results).toHaveLength(2);
    for (const item of results) {
      expect(item.sandboxMode).toBe("none");
    }
  }, 60_000);
});
