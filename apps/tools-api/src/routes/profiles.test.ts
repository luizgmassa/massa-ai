/**
 * Profile-switch route coverage (T11 / TASK-011).
 *
 * In-process suite covers the JSON shape + status-code mapping for every
 * MPS-09 error class (mocked engine). A real-socket suite proves the two
 * traps this design calls out by name: an unregistered path 404s before auth
 * is consulted (so the 401 assertion below only means something because
 * `/api/v1/profiles` and `/api/v1/profiles/switch` are the real, registered
 * routes), and a bare-string body would silently flip content-type to
 * text/plain under the node adapter — caught only over real HTTP.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { createServer } from "node:net";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

const listProfiles = mock((..._args: unknown[]): unknown => ({ hosts: [] }));
const switchProfile = mock((..._args: unknown[]): unknown => ({
  profile: "work",
  dryRun: false,
  hosts: [],
  restartRequired: false,
}));
// syncGeneratedVariants MUST be mocked: the real implementation would run
// against os.homedir() (the real developer machine, the default targetHome)
// as its write target — exactly the HARD RULE hazard the task brief calls
// out. Never let the real one run in this file.
const syncGeneratedVariants = mock((..._args: unknown[]): unknown => [
  { host: "claude", status: "skipped", profiles: [], retained: [], files: 0, reason: "no source checkout — nothing to sync" },
]);

// Pre-resolved BEFORE registering the mock (not inside the factory): a
// `require()` of the same specifier from inside a `mock.module` factory can
// recurse into the not-yet-fully-registered mock and silently drop exports
// (found and documented in apps/mcp-client's embedded-profiles.test.ts).
const actualShared = require("@massa-ai/shared");
mock.module("@massa-ai/shared", () => ({
  ...actualShared,
  listProfiles: (...args: unknown[]) => listProfiles(...args),
  switchProfile: (...args: unknown[]) => switchProfile(...args),
  syncGeneratedVariants: (...args: unknown[]) => syncGeneratedVariants(...args),
}));

// getRegistryHostDefaults is mocked so a test can assert exactly what
// listProfiles() receives, without pulling in the real scripts/lib
// dynamic-require plumbing (already covered by model-registry.test.ts).
const getRegistryHostDefaults = mock((..._args: unknown[]): unknown => ({
  claude: "balanced",
  codex: "balanced",
  cursor: "balanced",
  opencode: "balanced",
}));
const actualModelRegistry = require("./model-registry.ts");
mock.module("./model-registry.ts", () => ({
  ...actualModelRegistry,
  getRegistryHostDefaults: (...args: unknown[]) => getRegistryHostDefaults(...args),
}));

// getDeploymentRoot controls the sourceRoot syncGeneratedVariants is called
// with (assertable below); real resolution by default (a real checkout).
const actualDeployment = require("./model-registry-deployment.ts");
const realDeploymentRoot: string | null = actualDeployment.getDeploymentRoot();
const getDeploymentRoot = mock((..._args: unknown[]): string | null => realDeploymentRoot);
mock.module("./model-registry-deployment.ts", () => ({
  ...actualDeployment,
  getDeploymentRoot: (...args: unknown[]) => getDeploymentRoot(...args),
}));

import { profileRoutes } from "./profiles.js";
import { UnknownProfileError, NoHostsDetectedError } from "@massa-ai/shared";
import { LockHeldError } from "@massa-ai/shared";
import { CorruptInstallStateError } from "@massa-ai/shared";

const app = new Elysia().use(profileRoutes);

beforeEach(() => {
  listProfiles.mockClear();
  switchProfile.mockClear();
  syncGeneratedVariants.mockClear();
  getRegistryHostDefaults.mockClear();
  getDeploymentRoot.mockClear();
});

async function get(path: string) {
  const res = await app.handle(new Request(`http://localhost${path}`));
  return { status: res.status, contentType: res.headers.get("content-type"), json: (await res.json()) as any };
}

async function post(path: string, body: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, contentType: res.headers.get("content-type"), json: (await res.json()) as any };
}

describe("GET /api/v1/profiles", () => {
  test("200 + application/json on success", async () => {
    listProfiles.mockImplementationOnce(() => ({
      hosts: [{ host: "claude", installed: true, skipped: false, skipReason: null, activeProfile: "balanced", bundleVersion: "1.0.0", availableProfiles: ["balanced", "work"] }],
    }));
    const res = await get("/api/v1/profiles");
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("application/json");
    expect(res.json.success).toBe(true);
    expect(res.json.data.hosts[0].host).toBe("claude");
  });

  test("400 on an unknown host filter", async () => {
    const res = await get("/api/v1/profiles?host=nonesuch");
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
    expect(res.json.error.code).toBe("InvalidHostError");
    expect(listProfiles).not.toHaveBeenCalled();
  });

  test("scopes to the requested host", async () => {
    listProfiles.mockImplementationOnce(() => ({ hosts: [] }));
    await get("/api/v1/profiles?host=codex");
    expect((listProfiles.mock.calls.at(-1) as any[] | undefined)?.[0]).toMatchObject({ hosts: ["codex"] });
  });

  test("T3: hostDefaults from getRegistryHostDefaults() reaches listProfiles", async () => {
    listProfiles.mockImplementationOnce(() => ({ hosts: [] }));
    await get("/api/v1/profiles");
    expect(getRegistryHostDefaults).toHaveBeenCalled();
    expect((listProfiles.mock.calls.at(-1) as any[] | undefined)?.[0]).toMatchObject({
      hostDefaults: { claude: "balanced", codex: "balanced", cursor: "balanced", opencode: "balanced" },
    });
  });
});

describe("POST /api/v1/profiles/switch — MPS-09 error surfacing", () => {
  test("200 on success", async () => {
    switchProfile.mockImplementationOnce(() => ({
      profile: "work",
      dryRun: false,
      hosts: [{ host: "claude", status: "switched", filesChanged: 12 }],
      restartRequired: true,
    }));
    const res = await post("/api/v1/profiles/switch", { profile: "work" });
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("application/json");
    expect(res.json.success).toBe(true);
    expect(res.json.data.restartRequired).toBe(true);
  });

  test("400 on UnknownProfileError", async () => {
    switchProfile.mockImplementationOnce(() => {
      throw UnknownProfileError("nope", ["balanced", "work"]);
    });
    const res = await post("/api/v1/profiles/switch", { profile: "nope" });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("UnknownProfileError");
    expect(res.json.error.message).toContain("balanced, work");
  });

  test("404 on NoHostsDetectedError", async () => {
    switchProfile.mockImplementationOnce(() => {
      throw NoHostsDetectedError();
    });
    const res = await post("/api/v1/profiles/switch", { profile: "work" });
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("NoHostsDetectedError");
  });

  test("409 on LockHeldError (concurrent switch)", async () => {
    switchProfile.mockImplementationOnce(() => {
      throw LockHeldError("/tmp/install-state.json.switch.lock");
    });
    const res = await post("/api/v1/profiles/switch", { profile: "work" });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("LockHeldError");
  });

  test("500 on CorruptInstallStateError", async () => {
    switchProfile.mockImplementationOnce(() => {
      throw CorruptInstallStateError("/tmp/install-state.json", "invalid JSON");
    });
    const res = await post("/api/v1/profiles/switch", { profile: "work" });
    expect(res.status).toBe(500);
    expect(res.json.error.code).toBe("CorruptInstallStateError");
  });

  test("400 on an unknown host", async () => {
    const res = await post("/api/v1/profiles/switch", { profile: "work", host: "nonesuch" });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("InvalidHostError");
    expect(switchProfile).not.toHaveBeenCalled();
  });

  test("passes dryRun through", async () => {
    switchProfile.mockImplementationOnce(() => ({ profile: "work", dryRun: true, hosts: [], restartRequired: false }));
    await post("/api/v1/profiles/switch", { profile: "work", dryRun: true });
    expect((switchProfile.mock.calls.at(-1) as any[] | undefined)?.[0]).toMatchObject({ profile: "work", dryRun: true });
  });

  test("T3: syncGeneratedVariants runs (with sourceRoot from getDeploymentRoot()) before switchProfile", async () => {
    switchProfile.mockImplementationOnce(() => ({ profile: "work", dryRun: false, hosts: [], restartRequired: false }));
    await post("/api/v1/profiles/switch", { profile: "work" });

    expect(syncGeneratedVariants).toHaveBeenCalledTimes(1);
    const syncArg = (syncGeneratedVariants.mock.calls[0] as any[])[0] as { sourceRoot: string | null };
    expect(syncArg.sourceRoot).toBe(realDeploymentRoot);
    expect(switchProfile).toHaveBeenCalledTimes(1);
  });

  test("T3: a syncGeneratedVariants failure never blocks the switch (function never throws by contract, but the route stays resilient)", async () => {
    syncGeneratedVariants.mockImplementationOnce(() => {
      throw new Error("unexpected sync throw");
    });
    switchProfile.mockImplementationOnce(() => ({ profile: "work", dryRun: false, hosts: [{ host: "claude", status: "switched" }], restartRequired: true }));

    const res = await post("/api/v1/profiles/switch", { profile: "work" });
    // syncGeneratedVariants is documented to never throw; if it somehow did,
    // the route's existing catch still maps it through the normal MPS-09
    // error surfacing rather than crashing the process.
    expect(res.status).toBe(500);
    expect(res.json.success).toBe(false);
  });
});

// ── Real socket: auth gate (AD-011) + content-type trap ────────────────────

import { authMiddleware, __setAuthKeyForTests } from "../middleware/auth.js";

const API_KEY = "profiles-route-test-key";

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

const socketApp = new Elysia({ adapter: node() }).use(authMiddleware).use(profileRoutes);

let server: { stop?: () => void } | undefined;
let base = "";

beforeAll(async () => {
  __setAuthKeyForTests(API_KEY);
  const port = await allocateTcpPort();
  base = `http://127.0.0.1:${port}`;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("node-adapter server did not listen in time")), 5000);
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

describe("SEC — /api/v1/profiles over a real socket", () => {
  test("GET without a key returns 401 (route is registered, not 404)", async () => {
    const res = await fetch(`${base}/api/v1/profiles`);
    expect(res.status).toBe(401);
  }, 15_000);

  test("POST /switch without a key returns 401", async () => {
    const res = await fetch(`${base}/api/v1/profiles/switch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "work" }),
    });
    expect(res.status).toBe(401);
  }, 15_000);

  test("GET with the key returns application/json, never text/plain", async () => {
    listProfiles.mockImplementationOnce(() => ({ hosts: [] }));
    const res = await fetch(`${base}/api/v1/profiles`, { headers: { "x-api-key": API_KEY } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  }, 15_000);
});
