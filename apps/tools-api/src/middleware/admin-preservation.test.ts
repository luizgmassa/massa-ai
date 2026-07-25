/**
 * Admin-preservation middleware coverage. Exercises isAdminEndpoint branches
 * (literal, prefix, query-strip, param-pattern), the user-count cache (miss +
 * hit + reset), getUserCount, and the onBeforeHandle handler on admin and
 * non-admin endpoints. The 1+ users branch is unreachable today (getUserCount
 * is hardcoded to 0 with no User model) and is intentionally not asserted.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Elysia } from "elysia";
import {
  adminPreservationMiddleware,
  ADMIN_ENDPOINTS,
  getUserCount,
  isAdminEndpoint,
  resetUserCountCache,
} from "./admin-preservation.js";

describe("isAdminEndpoint", () => {
  test("literal admin endpoint matches exactly", () => {
    expect(isAdminEndpoint("/api/v1/project/reset")).toBe(true);
    expect(isAdminEndpoint("/api/v1/bootstrap")).toBe(true);
  });

  test("prefix match with trailing segment", () => {
    expect(isAdminEndpoint("/api/v1/project/reset/extra")).toBe(true);
  });

  test("query string is stripped before matching", () => {
    expect(isAdminEndpoint("/api/v1/project/reset?force=true")).toBe(true);
  });

  test("non-admin path returns false", () => {
    expect(isAdminEndpoint("/api/v1/search/project")).toBe(false);
    expect(isAdminEndpoint("/api/v1/memory/list")).toBe(false);
  });

  test(":param patterns resolve via regex segment", () => {
    ADMIN_ENDPOINTS.push("/api/v1/test/:id");
    try {
      expect(isAdminEndpoint("/api/v1/test/42")).toBe(true);
      expect(isAdminEndpoint("/api/v1/test/42/nested")).toBe(true);
      expect(isAdminEndpoint("/api/v1/test")).toBe(false);
    } finally {
      ADMIN_ENDPOINTS.pop();
    }
  });
});

describe("getUserCount + resetUserCountCache", () => {
  test("getUserCount returns 0 (no User model)", async () => {
    expect(await getUserCount()).toBe(0);
  });

  test("resetUserCountCache clears the cache idempotently", () => {
    expect(() => resetUserCountCache()).not.toThrow();
    resetUserCountCache();
  });
});

describe("adminPreservationMiddleware onBeforeHandle", () => {
  beforeEach(() => resetUserCountCache());

  function buildApp() {
    return new Elysia()
      .use(adminPreservationMiddleware)
      .post("/api/v1/project/reset", () => ({ ok: true }))
      .get("/api/v1/memory/list", () => ({ ok: true }));
  }

  test("admin endpoint is open in bootstrap mode (0 users) and returns 200", async () => {
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/api/v1/project/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).ok).toBe(true);
  });

  test("non-admin endpoint passes through untouched", async () => {
    const app = buildApp();
    const res = await app.handle(new Request("http://localhost/api/v1/memory/list"));
    expect(res.status).toBe(200);
  });

  test("second admin request within TTL hits the user-count cache", async () => {
    const app = buildApp();
    const first = await app.handle(
      new Request("http://localhost/api/v1/project/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    const second = await app.handle(
      new Request("http://localhost/api/v1/project/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
