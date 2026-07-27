/**
 * Startup fail-fast for the API key (T3 / TASK-003, SEC-01 AC2).
 *
 * "Exit non-zero before binding the port" is two claims. `initAuthOrExit`'s own
 * behavior covers the first; a source-level assertion on `index.ts` covers the
 * ordering, because the alternative — booting the real API — needs PostgreSQL,
 * Ollama and compiled grammars, and would prove the ordering only incidentally.
 */

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { initAuthOrExit } from "./startup-config.js";
import { ApiKeyProvisioningError } from "@massa-ai/shared/config";

const INDEX_SOURCE = fs.readFileSync(path.join(import.meta.dir, "index.ts"), "utf-8");

describe("initAuthOrExit", () => {
  test("returns the resolved key when resolution succeeds", () => {
    const resolved = { key: "k", provisioned: false, source: "env" as const };
    const result = initAuthOrExit(
      () => resolved,
      () => {
        throw new Error("onFatal must not run on the success path");
      },
    );
    expect(result).toBe(resolved);
  });

  test("routes a provisioning failure to the fatal handler with the config path", () => {
    const seen: string[] = [];
    const thrown = new ApiKeyProvisioningError("/nowhere/config.json", new Error("EACCES"));

    expect(() =>
      initAuthOrExit(
        () => {
          throw thrown;
        },
        (message) => {
          seen.push(message);
          // Stand in for process.exit(1): never returns.
          throw new Error("EXITED");
        },
      ),
    ).toThrow("EXITED");

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("/nowhere/config.json");
    expect(seen[0]).toContain("cannot start without an API key");
  });

  test("a non-Error throw still produces a message rather than [object Object]", () => {
    const seen: string[] = [];
    expect(() =>
      initAuthOrExit(
        () => {
          throw "plain string failure";
        },
        (message) => {
          seen.push(message);
          throw new Error("EXITED");
        },
      ),
    ).toThrow("EXITED");
    expect(seen[0]).toContain("plain string failure");
  });
});

describe("index.ts startup ordering (SEC-01 AC2)", () => {
  test("initAuthOrExit is called", () => {
    expect(INDEX_SOURCE).toContain("initAuthOrExit()");
  });

  test("the key is resolved before the port binds", () => {
    // If this ever inverts, an unwritable config would bind an unauthenticated
    // listener and only then fail — the exact exposure SEC-01 closes.
    const authAt = INDEX_SOURCE.indexOf("initAuthOrExit()");
    const listenAt = INDEX_SOURCE.indexOf("app.listen(PORT)");
    expect(authAt).toBeGreaterThan(-1);
    expect(listenAt).toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(listenAt);
  });

  test("authMiddleware is registered before every route it guards", () => {
    // Elysia applies onBeforeHandle in registration order, so a route mounted
    // before the middleware is served without a key.
    const authAt = INDEX_SOURCE.indexOf(".use(authMiddleware)");
    expect(authAt).toBeGreaterThan(-1);
    for (const route of [
      ".use(executorRoutes)",
      ".use(searchRoutes)",
      ".use(memoryRoutes)",
      ".use(projectRoutes)",
      ".use(bootstrapRoutes)",
      ".use(webUiRoutes)",
    ]) {
      const routeAt = INDEX_SOURCE.indexOf(route);
      expect(routeAt).toBeGreaterThan(-1);
      expect(authAt).toBeLessThan(routeAt);
    }
  });
});
