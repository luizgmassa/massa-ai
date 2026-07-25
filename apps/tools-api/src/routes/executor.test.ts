/**
 * Executor route coverage. /execute, /execute_file, /batch_execute delegate to
 * ExecutorController.getInstance().
 */

import { describe, test, expect, mock } from "bun:test";
import { Elysia } from "elysia";

const execute = mock((): unknown => ({ success: true, data: { stdout: "ok" } }));
const executeFile = mock((): unknown => ({ success: true, data: { stdout: "f" } }));
const batchExecute = mock((): unknown => ({ success: true, data: { results: [] } }));

mock.module("@massa-ai/core", () => {
  const actual = require("@massa-ai/core");
  return {
    ...actual,
    ExecutorController: Object.assign(
      class {
        static getInstance() {
          return { execute, executeFile, batchExecute };
        }
      },
      {},
    ),
  };
});

import { executorRoutes } from "./executor.js";
const app = new Elysia().use(executorRoutes);

async function post(path: string, body: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe("POST /api/v1/executor/execute", () => {
  test("delegates to controller.execute", async () => {
    execute.mockImplementationOnce(() => ({ success: true, data: { id: 1 } }));
    const res = await post("/api/v1/executor/execute", { language: "python", code: "print(1)" });
    expect(res.status).toBe(200);
    expect(res.json.data.id).toBe(1);
  });

  test("rejects unsupported language", async () => {
    const res = await post("/api/v1/executor/execute", { language: "brainfuck", code: "x" });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/v1/executor/execute_file", () => {
  test("delegates to controller.executeFile", async () => {
    executeFile.mockImplementationOnce(() => ({ success: true, data: { n: 7 } }));
    const res = await post("/api/v1/executor/execute_file", {
      path: "src/a.ts",
      language: "typescript",
      code: "FILE_CONTENT",
    });
    expect(res.status).toBe(200);
    expect(res.json.data.n).toBe(7);
  });
});

describe("POST /api/v1/executor/batch_execute", () => {
  test("delegates to controller.batchExecute", async () => {
    batchExecute.mockImplementationOnce(() => ({ success: true, data: { ran: 2 } }));
    const res = await post("/api/v1/executor/batch_execute", { commands: ["ls", "pwd"] });
    expect(res.status).toBe(200);
    expect(res.json.data.ran).toBe(2);
  });

  test("requires the commands array", async () => {
    const res = await post("/api/v1/executor/batch_execute", { concurrency: 2 });
    expect(res.status).toBe(422);
  });
});
