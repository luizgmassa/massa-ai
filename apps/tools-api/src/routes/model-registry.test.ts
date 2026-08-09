import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { createServer } from "node:net";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

const builtinRegistry = {
  version: 1,
  tiers: ["light", "standard", "deep"],
  hostDefaults: { claude: "balanced", codex: "balanced", cursor: "balanced", opencode: "balanced" },
  workflowTiers: {},
  agentTiers: {},
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
  overlayOverrideCount: 0,
}));
const loadRegistry = mock((..._args: unknown[]): unknown => builtinRegistry);
const validateRegistry = mock((..._args: unknown[]): unknown => builtinRegistry);
const mergeOverlay = mock((..._args: unknown[]): unknown => builtinRegistry);
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
  mergeOverlay: (...args: unknown[]) => mergeOverlay(...args),
  RegistryValidationError,
  DEFAULT_REGISTRY_PATH: "/dev/null",
}));

// design D-3 (APUX-03): agents inventory — mirrors the profilesLib() mock above exactly,
// including the non-literal require path pattern the route itself uses.
const DEFAULT_MOCK_CHARTERS = [
  { name: "builder", modelTier: "standard" },
  { name: "investigator", modelTier: "deep" },
];
const loadAllCharters = mock((..._args: unknown[]): unknown => DEFAULT_MOCK_CHARTERS);
const actualGeneratorLib = require("../../../../scripts/generate-subagent-artifacts.ts");
mock.module("../../../../scripts/generate-subagent-artifacts.ts", () => ({
  ...actualGeneratorLib,
  loadAllCharters: (...args: unknown[]) => loadAllCharters(...args),
}));

const configDir = mock((..._args: unknown[]): string => "/tmp/massa-ai-test-overlay");
mock.module("@massa-ai/shared/config", () => {
  const actual = require("@massa-ai/shared/config");
  return {
    ...actual,
    configDir: (...args: unknown[]) => configDir(...args),
  };
});

// Real resolution by default (this test file runs from a real checkout, so the
// bounded upward walk finds the repo root exactly as production does). The
// real value is captured BEFORE mock.module registers — mock.module rebinds
// the namespace of anything already imported, so calling back into
// actualDeployment.getDeploymentRoot() lazily from inside the mock would
// recurse into the mock itself.
// mockImplementationOnce(() => null) per-test simulates an unresolvable
// deployment (APCR-07).
const actualDeployment = require("./model-registry-deployment.ts");
const realDeploymentRoot: string | null = actualDeployment.getDeploymentRoot();
const getDeploymentRoot = mock((..._args: unknown[]): string | null => realDeploymentRoot);
mock.module("./model-registry-deployment.ts", () => ({
  ...actualDeployment,
  getDeploymentRoot: (...args: unknown[]) => getDeploymentRoot(...args),
}));

import { modelRegistryRoutes } from "./model-registry.js";

const app = new Elysia().use(modelRegistryRoutes);

beforeEach(() => {
  loadEffectiveRegistry.mockClear();
  loadRegistry.mockClear();
  validateRegistry.mockClear();
  mergeOverlay.mockClear();
  configDir.mockClear();
  getDeploymentRoot.mockClear();
  loadAllCharters.mockClear();
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
      overlayOverrideCount: 3,
    }));

    const res = await get("/api/v1/model-registry");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.registry.version).toBe(1);
    expect(res.json.data.source.overlay).not.toBeNull();
    // APCR-01.10: the count of overlay entries surviving normalization is surfaced to the
    // operator through the read path, not just computed internally.
    expect(res.json.data.overlayOverrideCount).toBe(3);
  });

  test("200 with no overlay reports overlayOverrideCount:0 (APCR-01.10)", async () => {
    loadEffectiveRegistry.mockImplementationOnce(() => ({
      registry: builtinRegistry,
      source: { builtin: builtinRegistry, overlay: null, tombstoned: [] },
      overlayOverrideCount: 0,
    }));

    const res = await get("/api/v1/model-registry");
    expect(res.status).toBe(200);
    expect(res.json.data.overlayOverrideCount).toBe(0);
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

// ── design D-3 / APUX-03: agents inventory ───────────────────────────────────

describe("GET /api/v1/model-registry — agents inventory (design D-3, APUX-03, P1-A AC6)", () => {
  test("200 + agents array shaped {name, charterTier} derived from loadAllCharters()", async () => {
    loadAllCharters.mockImplementationOnce(() => [
      { name: "builder", modelTier: "standard" },
      { name: "investigator", modelTier: "deep" },
    ]);

    const res = await get("/api/v1/model-registry");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.agents).toEqual([
      { name: "builder", charterTier: "standard" },
      { name: "investigator", charterTier: "deep" },
    ]);
    expect(res.json.data.agentsError).toBeUndefined();
  });

  test("a loadAllCharters() throw degrades to agents:[] + agentsError, GET stays 200 (best-effort)", async () => {
    loadAllCharters.mockImplementationOnce(() => {
      throw new Error("charter parse failure: skills/agents/ghost/SKILL.md missing description");
    });

    const res = await get("/api/v1/model-registry");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.agents).toEqual([]);
    expect(res.json.data.agentsError).toContain("charter parse failure");
  });

  test("a rejected loadAllCharters() promise degrades the same way — the async path is caught too", async () => {
    loadAllCharters.mockImplementationOnce(() => Promise.reject(new Error("ENOENT skills/agents")));

    const res = await get("/api/v1/model-registry");
    expect(res.status).toBe(200);
    expect(res.json.data.agents).toEqual([]);
    expect(res.json.data.agentsError).toContain("ENOENT");
  });

  test("the existing off-checkout 501 gate runs first — unaffected by the new agents field", async () => {
    getDeploymentRoot.mockImplementationOnce(() => null);
    const res = await get("/api/v1/model-registry");
    expect(res.status).toBe(501);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("model-registry is unavailable in this deployment");
    // The 501 gate returns before loadAllCharters() is ever reached.
    expect(loadAllCharters).not.toHaveBeenCalled();
  });
});

describe("PUT /api/v1/model-registry", () => {
  test("200 with valid overlay → writes + returns updated effective registry", async () => {
    validateRegistry.mockImplementationOnce(() => builtinRegistry);
    loadEffectiveRegistry.mockImplementationOnce(() => ({
      registry: builtinRegistry,
      source: { builtin: builtinRegistry, overlay: { profiles: {} }, tombstoned: [] },
      overlayOverrideCount: 1,
    }));

    const res = await put("/api/v1/model-registry", {
      profiles: {
        balanced: { description: "overlay modified" },
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.registry).toBeDefined();
    // APCR-01.10: the write path's response also reports the post-save override count, not
    // just the read path — the operator sees it immediately after Save Overlay.
    expect(res.json.data.overlayOverrideCount).toBe(1);
  });

  test("uses the shared library merge, not a hand-copied twin (APCR-01.7)", async () => {
    validateRegistry.mockImplementationOnce(() => builtinRegistry);
    loadEffectiveRegistry.mockImplementationOnce(() => ({
      registry: builtinRegistry,
      source: { builtin: builtinRegistry, overlay: { profiles: {} }, tombstoned: [] },
      overlayOverrideCount: 0,
    }));

    const overlay = { profiles: { balanced: { description: "overlay modified" } } };
    await put("/api/v1/model-registry", overlay);
    expect(mergeOverlay).toHaveBeenCalledTimes(1);
    const call = mergeOverlay.mock.calls[0] as unknown[];
    expect(call[0]).toEqual(builtinRegistry);
    expect(call[1]).toEqual(overlay);
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

// design D-3 / plan-critic blocking finding #1's unmocked PUT->GET round-trip sensor lives
// in its own file, model-registry-round-trip.test.ts, sibling of this one. This file's
// blanket mock.module("../../../../scripts/lib/model-profiles.ts", ...) rebinds not only
// what this file imports but that real module's OWN internal cross-references too (a
// captured-before-mock.module function reference still has ITS internal calls to sibling
// exports — e.g. loadEffectiveRegistry calling mergeOverlay — rerouted through the mock, one
// level deeper than the existing getDeploymentRoot precedent needs to reach); confirmed by
// instrumenting mergeOverlay's own mock.calls/mock.results, whose second (internal) call
// silently fell back to the base mocked implementation instead of the real merge. A genuine
// end-to-end real run therefore needs a file that registers no mock.module for that
// specifier at all.

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

  test("500 when spawnSync throws (regenerate exception branch)", async () => {
    spawnSyncMock.mockImplementationOnce(() => {
      throw new Error("spawn EACCES");
    });

    const res = await post("/api/v1/model-registry/regenerate");
    expect(res.status).toBe(500);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("regeneration error");
  });
});

// ── APCR-07: 501, not a stack trace, when this deployment has no checkout ──

describe("model-registry routes — 501 when the deployment root cannot be resolved (APCR-07)", () => {
  test("GET / returns 501 with the shared message and never throws", async () => {
    getDeploymentRoot.mockImplementationOnce(() => null);
    const res = await get("/api/v1/model-registry");
    expect(res.status).toBe(501);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("model-registry is unavailable in this deployment");
    expect(res.json.error).toContain("massa-ai source checkout");
  });

  test("PUT / returns 501 with the shared message", async () => {
    getDeploymentRoot.mockImplementationOnce(() => null);
    const res = await put("/api/v1/model-registry", { profiles: {} });
    expect(res.status).toBe(501);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("model-registry is unavailable in this deployment");
  });

  test("DELETE /overlay returns 501 with the shared message", async () => {
    getDeploymentRoot.mockImplementationOnce(() => null);
    const res = await del("/api/v1/model-registry/overlay");
    expect(res.status).toBe(501);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("model-registry is unavailable in this deployment");
  });

  test("POST /regenerate returns 501 naming the generator script, not a spawn failure", async () => {
    spawnSyncMock.mockClear();
    getDeploymentRoot.mockImplementationOnce(() => null);
    const res = await post("/api/v1/model-registry/regenerate");
    expect(res.status).toBe(501);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("model-registry is unavailable in this deployment");
    expect(res.json.error).toContain("generate-subagent-artifacts.ts");
    // The spawnSync path was never reached.
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  test("the 501 message shape is identical across every affected route", async () => {
    getDeploymentRoot.mockImplementation(() => null);
    const [getRes, delRes, postRes] = await Promise.all([
      get("/api/v1/model-registry"),
      del("/api/v1/model-registry/overlay"),
      post("/api/v1/model-registry/regenerate"),
    ]);
    getDeploymentRoot.mockImplementation(() => realDeploymentRoot);
    expect(getRes.status).toBe(501);
    expect(delRes.status).toBe(501);
    expect(postRes.status).toBe(501);
    expect(getRes.json.error).toContain("model-registry is unavailable in this deployment");
    expect(delRes.json.error).toContain("model-registry is unavailable in this deployment");
    expect(postRes.json.error).toContain("model-registry is unavailable in this deployment");
  });
});

describe("PUT /api/v1/model-registry — non-validation error re-throw", () => {
  test("500 when a non-RegistryValidationError is thrown by validateRegistry", async () => {
    validateRegistry.mockImplementationOnce(() => {
      throw new TypeError("unexpected");
    });

    const res = await app.handle(
      new Request("http://localhost/api/v1/model-registry", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profiles: {} }),
      }),
    );
    expect(res.status).toBe(500);
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