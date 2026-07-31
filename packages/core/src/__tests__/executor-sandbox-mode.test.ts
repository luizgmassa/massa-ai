/**
 * T8 / SEC-03 — the executor never runs unsandboxed without saying so.
 *
 * In the default `auto` mode `getSandboxMode()` returns "none" when
 * `sandbox-exec` (macOS) or `docker` (Linux) is missing, and `wrapSpawn` then
 * returns the command unchanged. Nothing told the caller: arbitrary code ran
 * with no OS isolation and the response looked identical to a sandboxed run.
 * A missing Docker install was a silent downgrade.
 *
 * AD-007 is unchanged by this: `auto` still falls back best-effort. SEC-03
 * only makes the fallback observable — one warn line per process, and the
 * effective mode on every executor result.
 *
 * The distinction that carries the requirement is `auto`-degraded-to-none
 * versus explicitly-configured none. The second is the operator's own choice
 * and must stay silent, or the warning becomes noise everyone filters out.
 */

import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { logger } from "@massa-ai/shared";
import {
  getSandboxMode,
  _resetSandboxAvailabilityCache,
  _setSandboxAvailabilityForTesting,
  _resetSandboxWarningForTesting,
} from "../services/executor/sandbox.js";
import { PolyglotExecutor } from "../services/executor/executor.js";
import { ExecutorController } from "../services/executor/executor-controller.js";

const ORIGINAL_MODE = process.env.MASSA_AI_EXECUTOR_SANDBOX;

let warnSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  _resetSandboxAvailabilityCache();
  _resetSandboxWarningForTesting();
  warnSpy = spyOn(logger, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  _resetSandboxAvailabilityCache();
  _resetSandboxWarningForTesting();
  if (ORIGINAL_MODE === undefined) {
    delete process.env.MASSA_AI_EXECUTOR_SANDBOX;
  } else {
    process.env.MASSA_AI_EXECUTOR_SANDBOX = ORIGINAL_MODE;
  }
});

/** Every warn message this test's spy saw, flattened to strings. */
function warnMessages(): string[] {
  return warnSpy.mock.calls.map((c) => String(c[0]));
}

describe("sandbox mode visibility (SEC-03)", () => {
  test("auto degrading to none warns once, naming the missing tool", () => {
    delete process.env.MASSA_AI_EXECUTOR_SANDBOX;
    _setSandboxAvailabilityForTesting({ docker: false, seatbelt: false });

    expect(getSandboxMode()).toBe("none");

    const messages = warnMessages();
    expect(messages).toHaveLength(1);
    // Naming the tool is the actionable half: "no sandbox" alone does not tell
    // an operator what to install.
    expect(messages[0]).toMatch(process.platform === "darwin" ? /sandbox-exec/ : /docker/);
  });

  test("the warning is once per process, not once per execution", () => {
    delete process.env.MASSA_AI_EXECUTOR_SANDBOX;
    _setSandboxAvailabilityForTesting({ docker: false, seatbelt: false });

    getSandboxMode();
    getSandboxMode();
    getSandboxMode();

    expect(warnMessages()).toHaveLength(1);
  });

  test("an explicitly configured none does NOT warn", () => {
    // The operator asked for it. Warning here would train them to ignore the
    // line that matters.
    process.env.MASSA_AI_EXECUTOR_SANDBOX = "none";
    _setSandboxAvailabilityForTesting({ docker: false, seatbelt: false });

    expect(getSandboxMode()).toBe("none");
    expect(warnMessages()).toHaveLength(0);
  });

  test("a resolved sandbox does not warn", () => {
    delete process.env.MASSA_AI_EXECUTOR_SANDBOX;
    _setSandboxAvailabilityForTesting({ docker: true, seatbelt: true });

    const mode = getSandboxMode();
    expect(mode === "seatbelt" || mode === "docker").toBe(true);
    expect(warnMessages()).toHaveLength(0);
  });
});

describe("sandbox mode on executor results (SEC-03 AC 2)", () => {
  test("execute() reports the effective mode", async () => {
    process.env.MASSA_AI_EXECUTOR_SANDBOX = "none";
    const executor = new PolyglotExecutor();

    const result = await executor.execute({ language: "shell", code: "echo hi" });

    expect(result.sandboxMode).toBe("none");
  }, 30_000);

  test("executeFile() reports the effective mode", async () => {
    process.env.MASSA_AI_EXECUTOR_SANDBOX = "none";
    const executor = new PolyglotExecutor();

    const result = await executor.executeFile({
      path: import.meta.path,
      language: "shell",
      code: "echo hi",
    });

    expect(result.sandboxMode).toBe("none");
  }, 30_000);

  test("the controller surfaces sandboxMode on execute", async () => {
    // The controller is the single serialization point for both transports, so
    // this is what proves the field reaches REST and MCP callers at all.
    process.env.MASSA_AI_EXECUTOR_SANDBOX = "none";
    const controller = new ExecutorController();

    const response = await controller.execute({ language: "shell", code: "echo hi" });

    expect(response.success).toBe(true);
    expect((response.data as Record<string, unknown>).sandboxMode).toBe("none");
  }, 30_000);

  test("the controller surfaces sandboxMode on executeFile", async () => {
    process.env.MASSA_AI_EXECUTOR_SANDBOX = "none";
    const controller = new ExecutorController();

    const response = await controller.executeFile({
      path: import.meta.path,
      language: "shell",
      code: "echo hi",
    });

    expect((response.data as Record<string, unknown>).sandboxMode).toBe("none");
  }, 30_000);

  test("every batchExecute result item carries sandboxMode", async () => {
    // Per-item, not per-batch: the spec says "every executor result", and a
    // batch is the easiest place to drop the field on the rejected branch.
    process.env.MASSA_AI_EXECUTOR_SANDBOX = "none";
    const controller = new ExecutorController();

    const response = await controller.batchExecute({
      commands: ["echo one", "echo two"],
    });

    const results = (response.data as { results: Record<string, unknown>[] }).results;
    expect(results).toHaveLength(2);
    for (const item of results) {
      expect(item.sandboxMode).toBe("none");
    }
  }, 60_000);
});
