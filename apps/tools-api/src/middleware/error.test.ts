/**
 * Error middleware coverage: NOT_FOUND -> 404, PROJECT_NOT_INDEXED -> 404
 * (via SearchServiceError), and regressions for the existing 503/400/500
 * mappings. Real HTTP responses throughout — in-process assertions would not
 * catch a content-type or status regression (CLAUDE.md's tools-api gotcha).
 */

import { describe, expect, test } from "bun:test";
import { SearchServiceError, projectNotIndexed } from "@massa-ai/core";
import { Elysia, t } from "elysia";
import { errorHandler } from "./error.js";

function testApp() {
  return new Elysia()
    .use(errorHandler)
    .get("/typed", () => {
      throw new SearchServiceError("SEARCH_BACKEND_UNAVAILABLE", "keyword_search", {
        cause: new Error("postgres://user:secret@example.invalid/search"),
      });
    })
    .get("/not-indexed", () => {
      throw projectNotIndexed(
        "demo-project",
        "Project 'demo-project' is not indexed. Run index_project first, then retry.",
      );
    })
    .get("/generic", () => {
      throw new Error("internal password=secret");
    })
    .get("/bad-request", () => {
      throw new SearchServiceError("STORE_CORRUPTION", "handoff.open_questions_json", {
        cause: new Error("corrupt payload secret"),
        statusCode: 500,
      });
    });
}

describe("error middleware", () => {
  test("unmatched route -> 404 NOT_FOUND envelope", async () => {
    const response = await testApp().handle(
      new Request("http://localhost/does-not-exist"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  test("PROJECT_NOT_INDEXED -> 404 with the actionable message preserved", async () => {
    const response = await testApp().handle(new Request("http://localhost/not-indexed"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      success: false,
      error: {
        code: "PROJECT_NOT_INDEXED",
        message: "Project 'demo-project' is not indexed. Run index_project first, then retry.",
        component: "demo-project",
      },
    });
  });

  test("regression: typed SearchServiceError still maps to its own statusCode (503)", async () => {
    const response = await testApp().handle(new Request("http://localhost/typed"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: {
        code: "SEARCH_BACKEND_UNAVAILABLE",
        message: "A required search backend is unavailable",
        component: "keyword_search",
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  test("regression: typed SearchServiceError with an explicit statusCode (500)", async () => {
    const response = await testApp().handle(new Request("http://localhost/bad-request"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: {
        code: "STORE_CORRUPTION",
        message: "Stored data is invalid",
        component: "handoff.open_questions_json",
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  test("regression: untyped error -> sanitized 500 INTERNAL_ERROR envelope", async () => {
    const response = await testApp().handle(new Request("http://localhost/generic"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  test("regression: VALIDATION/PARSE errors -> 400 INVALID_REQUEST", async () => {
    const app = new Elysia()
      .use(errorHandler)
      .get("/validated", () => "ok", {
        query: t.Object({
          required: t.String(),
        }),
      });
    const response = await app.handle(new Request("http://localhost/validated"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: { code: "INVALID_REQUEST", message: "The request failed validation" },
    });
  });
});
