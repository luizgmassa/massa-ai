import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { createServer } from "node:net";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

const loadConfig = mock((..._args: unknown[]): unknown => ({}));
const savePartialConfig = mock((..._args: unknown[]): unknown => ({ success: true }));
const maskSensitive = mock((..._args: unknown[]): unknown => _args[0]);
const restartNeededSections = mock((..._args: unknown[]): string[] => []);
const defaultMassaAiConfig = {};

const actualShared = require("@massa-ai/shared");
mock.module("@massa-ai/shared", () => ({
  ...actualShared,
  loadConfig: (...args: unknown[]) => loadConfig(...args),
  savePartialConfig: (...args: unknown[]) => savePartialConfig(...args),
  maskSensitive: (...args: unknown[]) => maskSensitive(...args),
  restartNeededSections: (...args: unknown[]) => restartNeededSections(...args),
  defaultMassaAiConfig,
}));

import { configRoutes } from "./config.js";

const app = new Elysia().use(configRoutes);

beforeEach(() => {
  loadConfig.mockClear();
  savePartialConfig.mockClear();
  maskSensitive.mockClear();
  restartNeededSections.mockClear();
});

async function get(path: string) {
  const res = await app.handle(new Request(`http://localhost${path}`));
  return { status: res.status, json: (await res.json()) as any };
}

async function put(path: string, body: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe("GET /api/v1/config", () => {
  test("200 + masked config + restartNeededSections", async () => {
    const testConfig = {
      logging: { level: "info", enableMetrics: false },
      llm: { apiKey: "secret" },
    };
    loadConfig.mockImplementationOnce(() => testConfig);
    maskSensitive.mockImplementationOnce((cfg: unknown) => ({
      ...(cfg as object),
      llm: { apiKey: "***" },
    }));
    restartNeededSections.mockImplementationOnce(() => ["llm"]);

    const res = await get("/api/v1/config");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.config.llm.apiKey).toBe("***");
    expect(res.json.data.restartNeededSections).toEqual(["llm"]);
  });

  test("masks all four sensitive fields", async () => {
    const testConfig = {
      security: { apiKey: "sec-key" },
      llm: { apiKey: "llm-key" },
      embedding: { apiKey: "emb-key" },
      database: { url: "postgres://localhost/db" },
    };
    loadConfig.mockImplementationOnce(() => testConfig);
    maskSensitive.mockImplementationOnce((cfg: unknown) => {
      const c = cfg as any;
      return {
        ...c,
        security: { apiKey: "***" },
        llm: { apiKey: "***" },
        embedding: { apiKey: "***" },
        database: { url: "***" },
      };
    });
    restartNeededSections.mockImplementationOnce(() => ["security", "llm", "embedding", "database"]);

    const res = await get("/api/v1/config");
    expect(res.status).toBe(200);
    expect(res.json.data.config.security.apiKey).toBe("***");
    expect(res.json.data.config.llm.apiKey).toBe("***");
    expect(res.json.data.config.embedding.apiKey).toBe("***");
    expect(res.json.data.config.database.url).toBe("***");
  });
});

describe("PUT /api/v1/config", () => {
  test("200 with valid section + returns updated masked config", async () => {
    savePartialConfig.mockImplementationOnce(() => ({
      success: true as const,
      config: { logging: { level: "debug", enableMetrics: true } },
      restartNeededSections: ["embedding", "llm", "security"],
    }));
    maskSensitive.mockImplementationOnce((cfg: unknown) => cfg);

    const res = await put("/api/v1/config", {
      logging: { level: "debug", enableMetrics: true },
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.config.logging.level).toBe("debug");
    expect(res.json.data.restartNeededSections).toContain("embedding");
  });

  test("400 with details on validation failure", async () => {
    savePartialConfig.mockImplementationOnce(() => ({
      success: false as const,
      details: ["logging.level must be one of: debug, info, warn, error"],
    }));

    const res = await put("/api/v1/config", {
      logging: { level: "invalid", enableMetrics: false },
    });
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("validation failed");
    expect(res.json.details).toContain("logging.level must be one of: debug, info, warn, error");
  });

  test("masked sentinel '***' preserves existing value (verified via savePartialConfig call arg)", async () => {
    savePartialConfig.mockImplementationOnce(() => ({
      success: true as const,
      config: { security: { apiKey: "original-key" } },
      restartNeededSections: ["security"],
    }));
    maskSensitive.mockImplementationOnce((cfg: unknown) => ({
      ...(cfg as object),
      security: { apiKey: "***" },
    }));

    const res = await put("/api/v1/config", {
      security: { apiKey: "***" },
    });
    expect(res.status).toBe(200);
    expect(res.json.data.config.security.apiKey).toBe("***");

    // Verify savePartialConfig received the sentinel — the writer handles preservation
    const callArg = (savePartialConfig.mock.calls.at(-1) as any[])?.[0];
    expect(callArg.security.apiKey).toBe("***");
  });

  test("passes partial body to savePartialConfig", async () => {
    savePartialConfig.mockImplementationOnce(() => ({
      success: true as const,
      config: {},
      restartNeededSections: [],
    }));
    maskSensitive.mockImplementationOnce((cfg: unknown) => cfg);

    await put("/api/v1/config", { cache: { enabled: false, l1MaxSizeMB: 50, l2MaxSizeMB: 100, defaultTTLSeconds: 60 } });

    const callArg = (savePartialConfig.mock.calls.at(-1) as any[])?.[0];
    expect(callArg.cache).toBeDefined();
    expect(callArg.cache.enabled).toBe(false);
  });
});

describe("GET /api/v1/config/reveal", () => {
  test("200 + unmasked value for database.url", async () => {
    loadConfig.mockImplementationOnce(() => ({
      database: { url: "postgres://real-url" },
    }));
    const res = await get("/api/v1/config/reveal?section=database&field=url");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.section).toBe("database");
    expect(res.json.data.field).toBe("url");
    expect(res.json.data.value).toBe("postgres://real-url");
  });

  test("200 + unmasked value for llm.apiKey", async () => {
    loadConfig.mockImplementationOnce(() => ({
      llm: { apiKey: "real-llm-key" },
    }));
    const res = await get("/api/v1/config/reveal?section=llm&field=apiKey");
    expect(res.status).toBe(200);
    expect(res.json.data.value).toBe("real-llm-key");
  });

  test("400 when section/field is not sensitive", async () => {
    const res = await get("/api/v1/config/reveal?section=logging&field=level");
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("not a sensitive field");
  });

  test("422 when section or field missing (Elysia validation)", async () => {
    const res = await get("/api/v1/config/reveal?section=database");
    expect(res.status).toBe(422);
  });

  test("returns empty string when field is absent in config", async () => {
    loadConfig.mockImplementationOnce(() => ({ database: {} }));
    const res = await get("/api/v1/config/reveal?section=database&field=url");
    expect(res.status).toBe(200);
    expect(res.json.data.value).toBe("");
  });
});

// ── Real socket: auth gate (AD-011) ──────────────────────────────────────────

import { authMiddleware, __setAuthKeyForTests } from "../middleware/auth.js";

const API_KEY = "config-route-test-key";

async function allocateTcpPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") {
        reservation.close(() => reject(new Error("failed to allocate a TCP port")));
        return;
      }
      reservation.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

const socketApp = new Elysia({ adapter: node() }).use(authMiddleware).use(configRoutes);

let server: { stop?: () => void } | undefined;
let base = "";

beforeAll(async () => {
  __setAuthKeyForTests(API_KEY);
  const port = await allocateTcpPort();
  base = `http://127.0.0.1:${port}`;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server did not listen in time")), 5000);
    socketApp.listen(port, (srv: unknown) => {
      clearTimeout(timeout);
      server = srv as { stop?: () => void };
      resolve();
    });
  });
});

afterAll(() => {
  server?.stop?.();
  __setAuthKeyForTests(undefined);
});

describe("SEC — /api/v1/config over a real socket", () => {
  test("GET without a key returns 401 (route is registered, not 404)", async () => {
    const res = await fetch(`${base}/api/v1/config`);
    expect(res.status).toBe(401);
  }, 15_000);

  test("PUT without a key returns 401", async () => {
    const res = await fetch(`${base}/api/v1/config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ logging: { level: "debug", enableMetrics: false } }),
    });
    expect(res.status).toBe(401);
  }, 15_000);

  test("GET with the key returns 200", async () => {
    loadConfig.mockImplementationOnce(() => ({ logging: { level: "info", enableMetrics: false } }));
    maskSensitive.mockImplementationOnce((cfg: unknown) => cfg);
    restartNeededSections.mockImplementationOnce(() => []);
    const res = await fetch(`${base}/api/v1/config`, { headers: { "x-api-key": API_KEY } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
  }, 15_000);
});