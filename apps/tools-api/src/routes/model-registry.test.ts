import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { createServer } from "node:net";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

const builtinRegistry = {
  version: 1,
  tiers: ["light", "standard", "deep"],
  hostDefaults: { claude: "balanced", codex: "balanced", cursor: "balanced", opencode: "balanced" },
  workflowTiers: {},
  profiles: {
    balanced: {
      description: "builtin balanced",
      hosts: {
        claude: {
          light: { model: "m-light", effort: "high" },
          standard: { model: "m-std", effort: "high" },
          deep: { model: "m-deep", effort: "high" },
        },
        codex: {
          light: { model: "m-light", effort: "high" },
          standard: { model: "m-std", effort: "high" },
          deep: { model: "m-deep", effort: "high" },
        },
        cursor: {
          light: { model: null, effort: null },
          standard: { model: null, effort: null },
          deep: { model: null, effort: null },
        },
        opencode: {
          light: { model: "m-light", effort: "high" },
          standard: { model: "m-std", effort: "high" },
          deep: { model: "m-deep", effort: "high" },
        },
      },
    },
  },
};

const loadEffectiveRegistry = mock((..._args: unknown[]): unknown => ({
  registry: builtinRegistry,
  source: { builtin: builtinRegistry, overlay: null, tombstoned: [] },
}));
const loadRegistry = mock((..._args: unknown[]): unknown => builtinRegistry);
const validateRegistry = mock((..._args: unknown[]): unknown => builtinRegistry);
const RegistryValidationError = class extends Error {
  violations: string[];
  constructor(violations: string[]) {
    super("validation failed");
    this.name = "RegistryValidationError";
    this.violations = violations;
  }
};

const child_process = require("child_process");
const spawnSyncMock = mock((..._args: unknown[]): any => ({ exitCode: 0, stdout: "", stderr: "" }));
mock.module("child_process", () => ({
  ...child_process,
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

const actualProfilesLib = require("../../../../scripts/lib/model-profiles.ts");
mock.module("../../../../scripts/lib/model-profiles.ts", () => ({
  ...actualProfilesLib,
  loadEffectiveRegistry: (...args: unknown[]) => loadEffectiveRegistry(...args),
  loadRegistry: (...args: unknown[]) => loadRegistry(...args),
  validateRegistry: (...args: unknown[]) => validateRegistry(...args),
  RegistryValidationError,
  DEFAULT_REGISTRY_PATH: "/dev/null",
}));

const configDir = mock((..._args: unknown[]): string => "/tmp/massa-ai-test-overlay");
mock.module("@massa-ai/shared/config", () => {
  const actual = require("@massa-ai/shared/config");
  return {
    ...actual,
    configDir: (...args: unknown[]) => configDir(...args),
  };
});

import { modelRegistryRoutes } from "./model-registry.js";

const app = new Elysia().use(modelRegistryRoutes);

beforeEach(() => {
  loadEffectiveRegistry.mockClear();
  loadRegistry.mockClear();
  validateRegistry.mockClear();
  configDir.mockClear();
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

async function del(path: string) {
  const res = await app.handle(new Request(`http://localhost${path}`, { method: "DELETE" }));
  return { status: res.status, json: (await res.json()) as any };
}

async function post(path: string) {
  const res = await app.handle(new Request(`http://localhost${path}`, { method: "POST" }));
  return { status: res.status, json: (await res.json()) as any };
}

describe("GET /api/v1/model-registry", () => {
  test("200 + merged registry + source attribution", async () => {
    loadEffectiveRegistry.mockImplementationOnce(() => ({
      registry: builtinRegistry,
      source: {
        builtin: builtinRegistry,
        overlay: { profiles: { balanced: { description: "overlay" } } },
        tombstoned: [],
      },
    }));

    const res = await get("/api/v1/model-registry");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.registry.version).toBe(1);
    expect(res.json.data.source.overlay).not.toBeNull();
  });

  test("200 on overlay corruption with overlayError surfaced", async () => {
    loadEffectiveRegistry.mockImplementationOnce(() => ({
      registry: builtinRegistry,
      source: { builtin: builtinRegistry, overlay: null, tombstoned: [] },
      overlayError: "overlay parse failed: invalid JSON",
    }));

    const res = await get("/api/v1/model-registry");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.overlayError).toContain("parse failed");
    expect(res.json.data.source.overlay).toBeNull();
  });
});

describe("PUT /api/v1/model-registry", () => {
  test("200 with valid overlay → writes + returns updated effective registry", async () => {
    validateRegistry.mockImplementationOnce(() => builtinRegistry);
    loadEffectiveRegistry.mockImplementationOnce(() => ({
      registry: builtinRegistry,
      source: { builtin: builtinRegistry, overlay: { profiles: {} }, tombstoned: [] },
    }));

    const res = await put("/api/v1/model-registry", {
      profiles: {
        balanced: { description: "overlay modified" },
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.registry).toBeDefined();
  });

  test("400 with all violations on validation failure", async () => {
    validateRegistry.mockImplementationOnce(() => {
      throw new RegistryValidationError([
        "profiles.foo is missing tier 'standard'",
        "hostDefaults.bar names unknown profile",
      ]);
    });

    const res = await put("/api/v1/model-registry", {
      profiles: { foo: { description: "bad" } },
    });
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("validation failed");
    expect(res.json.details).toContain("profiles.foo is missing tier 'standard'");
    expect(res.json.details).toContain("hostDefaults.bar names unknown profile");
  });
});

describe("DELETE /api/v1/model-registry/overlay", () => {
  test("200 + returns builtin registry after overlay deleted", async () => {
    loadRegistry.mockImplementationOnce(() => builtinRegistry);

    const res = await del("/api/v1/model-registry/overlay");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.registry.version).toBe(1);
    expect(res.json.data.source.overlay).toBeNull();
  });
});

describe("POST /api/v1/model-registry/regenerate", () => {
  beforeEach(() => {
    spawnSyncMock.mockClear();
  });

  test("200 + regenerated:true on successful child process", async () => {
    spawnSyncMock.mockImplementationOnce(() => ({ exitCode: 0, stdout: "", stderr: "" }));

    const res = await post("/api/v1/model-registry/regenerate");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.regenerated).toBe(true);
  });

  test("500 on non-zero child process exit", async () => {
    spawnSyncMock.mockImplementationOnce(() => ({ exitCode: 1, stdout: "", stderr: "script error" }));

    const res = await post("/api/v1/model-registry/regenerate");
    expect(res.status).toBe(500);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("regeneration failed");
  });
});

// ── Real socket: auth gate (AD-011) ──────────────────────────────────────────

import { authMiddleware, __setAuthKeyForTests } from "../middleware/auth.js";

const API_KEY = "model-registry-route-test-key";

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

const socketApp = new Elysia({ adapter: node() }).use(authMiddleware).use(modelRegistryRoutes);

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

describe("SEC — /api/v1/model-registry over a real socket", () => {
  test("GET without a key returns 401", async () => {
    const res = await fetch(`${base}/api/v1/model-registry`);
    expect(res.status).toBe(401);
  }, 15_000);

  test("GET with the key returns 200", async () => {
    loadEffectiveRegistry.mockImplementationOnce(() => ({
      registry: builtinRegistry,
      source: { builtin: builtinRegistry, overlay: null, tombstoned: [] },
    }));
    const res = await fetch(`${base}/api/v1/model-registry`, { headers: { "x-api-key": API_KEY } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
  }, 15_000);
});