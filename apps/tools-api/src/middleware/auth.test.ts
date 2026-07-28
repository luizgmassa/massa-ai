import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Elysia } from "elysia";
import { authMiddleware, isPublicPath, initAuth, __setAuthKeyForTests } from "./auth.js";

function buildApp() {
  return new Elysia()
    .use(authMiddleware)
    .get("/health", () => ({ status: "ok" }))
    .get("/api/v1/protected", () => ({ data: "secret" }));
}

describe("authMiddleware", () => {
  const saved = process.env.MASSA_AI_API_KEY;

  afterEach(() => {
    if (saved === undefined) delete process.env.MASSA_AI_API_KEY;
    else process.env.MASSA_AI_API_KEY = saved;
    __setAuthKeyForTests(undefined);
  });

  // ── no key resolved (SEC-01) ─────────────────────────────────
  //
  // These two replace the former "dev mode — allows requests without header"
  // pair. They asserted the exact bypass SEC-01 deletes: with no
  // MASSA_AI_API_KEY set, any request to any route was served. The scenario is
  // still worth covering — it is the default state of a fresh install — so the
  // assertions are inverted rather than the tests removed.
  describe("no key resolved — initAuth() has not run", () => {
    beforeEach(() => {
      delete process.env.MASSA_AI_API_KEY;
      __setAuthKeyForTests(undefined);
    });

    test("rejects requests without a header instead of allowing them", async () => {
      const app = buildApp();
      const res = await app.handle(new Request("http://localhost/api/v1/protected"));
      expect(res.status).toBe(401);
      const body = (await res.json()) as { success: boolean };
      expect(body.success).toBe(false);
    });

    test("rejects a request even when it carries some key — auth fails closed", async () => {
      const app = buildApp();
      const res = await app.handle(
        new Request("http://localhost/api/v1/protected", {
          headers: { "x-api-key": "anything" },
        }),
      );
      expect(res.status).toBe(401);
    });

    test("still allows /health without a header", async () => {
      const app = buildApp();
      const res = await app.handle(new Request("http://localhost/health"));
      expect(res.status).toBe(200);
    });
  });

  // ── key resolved ─────────────────────────────────────────────
  describe("key resolved", () => {
    beforeEach(() => { __setAuthKeyForTests("test-key"); });

    test("returns 401 with no header", async () => {
      const app = buildApp();
      const res = await app.handle(new Request("http://localhost/api/v1/protected"));
      expect(res.status).toBe(401);
      const body = (await res.json()) as { success: boolean };
      expect(body.success).toBe(false);
    });

    test("returns 401 with wrong key", async () => {
      const app = buildApp();
      const res = await app.handle(
        new Request("http://localhost/api/v1/protected", {
          headers: { "x-api-key": "wrong-key" },
        }),
      );
      expect(res.status).toBe(401);
    });

    test("returns 200 with correct key", async () => {
      const app = buildApp();
      const res = await app.handle(
        new Request("http://localhost/api/v1/protected", {
          headers: { "x-api-key": "test-key" },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: string };
      expect(body.data).toBe("secret");
    });

    test("/health is public — no key needed", async () => {
      const app = buildApp();
      const res = await app.handle(new Request("http://localhost/health"));
      expect(res.status).toBe(200);
    });

    test("/swagger is public — no key needed", async () => {
      const app = buildApp().get("/swagger", () => "docs");
      const res = await app.handle(new Request("http://localhost/swagger"));
      expect(res.status).toBe(200);
    });
  });

  // ── initAuth wiring ──────────────────────────────────────────
  describe("initAuth", () => {
    test("adopts the key from the environment and the middleware then accepts it", () => {
      // The env branch of resolveApiKey never writes, so this touches no
      // filesystem state.
      process.env.MASSA_AI_API_KEY = "env-provided-key";
      const resolved = initAuth();
      expect(resolved).toEqual({
        key: "env-provided-key",
        provisioned: false,
        source: "env",
      });
    });

    test("the middleware uses the key initAuth resolved, not process.env at request time", async () => {
      process.env.MASSA_AI_API_KEY = "first-key";
      initAuth();
      // A later env mutation must not change what the running server accepts.
      process.env.MASSA_AI_API_KEY = "second-key";

      const app = buildApp();
      const accepted = await app.handle(
        new Request("http://localhost/api/v1/protected", {
          headers: { "x-api-key": "first-key" },
        }),
      );
      expect(accepted.status).toBe(200);

      const rejected = await app.handle(
        new Request("http://localhost/api/v1/protected", {
          headers: { "x-api-key": "second-key" },
        }),
      );
      expect(rejected.status).toBe(401);
    });
  });
});

// ── public-path matching ───────────────────────────────────────
//
// The matcher was `PUBLIC_PATHS.some((p) => path.startsWith(p))`. Adding "/ui"
// to that list would have exempted every path merely beginning with those
// characters, so the matcher is exact-or-child-path now.
describe("isPublicPath", () => {
  test.each([
    ["/health", true],
    ["/swagger", true],
    ["/swagger/json", true],
    ["/swagger/static/index.css", true],
    ["/ui", true],
    ["/ui/", true],
    ["/ui/app.js", true],
    ["/ui/some/spa/route", true],
  ])("%s is public", (path, expected) => {
    expect(isPublicPath(path)).toBe(expected);
  });

  test.each([
    ["/uixyz"],
    ["/ui-admin"],
    ["/uix/app.js"],
    ["/healthz"],
    ["/health-check"],
    ["/swaggerui"],
    ["/api/v1/search"],
    ["/api/v1/executor/execute"],
    ["/"],
  ])("%s is NOT public", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
