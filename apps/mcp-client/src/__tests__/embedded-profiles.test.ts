/**
 * EmbeddedApiClient profile-switch routing (T12 / TASK-012).
 *
 * Mocks `@massa-ai/shared`'s `listProfiles`/`switchProfile` so this suite
 * never reaches the real switch engine — the engine defaults `targetHome` to
 * `os.homedir()`, and a real call from a test would risk mutating whatever
 * host plugins happen to be installed on the machine running the suite.
 * `embedded-api-client-endpoints.test.ts` covers the invalid-host guard
 * (safe: it returns before the engine is called) against the real client.
 *
 * Asserts the embedded transport produces the same `{success,data}` /
 * `{success:false,error:{code,message}}` shape and MPS-09 status mapping as
 * `apps/tools-api/src/routes/profiles.ts` — the embedded/HTTP parity
 * contract (design "Component 4 — MCP surface").
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const listProfiles = mock((..._args: unknown[]): unknown => ({ hosts: [] }));
const switchProfile = mock((..._args: unknown[]): unknown => ({
  profile: "work",
  dryRun: false,
  hosts: [],
  restartRequired: false,
}));

// Resolved BEFORE registering the mock (not inside the factory): a
// `require()` of the same specifier from inside a `mock.module` factory
// recurses into the not-yet-fully-registered mock and silently drops
// exports (lesson: "mock-module registers by resolved path" — a delegating
// mock recurses). Pre-capturing `actualShared` here avoided a
// `SyntaxError: Export named 'config' not found` from the spread below.
const actualShared = require("@massa-ai/shared");
mock.module("@massa-ai/shared", () => ({
  ...actualShared,
  listProfiles: (...args: unknown[]) => listProfiles(...args),
  switchProfile: (...args: unknown[]) => switchProfile(...args),
}));

const { EmbeddedApiClient } = await import("../embedded-api-client.js");
const { UnknownProfileError, NoHostsDetectedError, LockHeldError, CorruptInstallStateError } = await import(
  "@massa-ai/shared"
);

const client = new EmbeddedApiClient();

beforeEach(() => {
  listProfiles.mockClear();
  switchProfile.mockClear();
});

describe("EmbeddedApiClient GET /api/v1/profiles", () => {
  test("returns {success:true, data} on success", async () => {
    listProfiles.mockImplementationOnce(() => ({
      hosts: [{ host: "claude", installed: true, skipped: false, skipReason: null, activeProfile: "balanced", bundleVersion: "1.0.0", availableProfiles: ["balanced", "work"] }],
    }));
    const result = (await client.get("/api/v1/profiles")) as any;
    expect(result.success).toBe(true);
    expect(result.data.hosts[0].host).toBe("claude");
  });

  test("scopes to the requested host", async () => {
    listProfiles.mockImplementationOnce(() => ({ hosts: [] }));
    await client.get("/api/v1/profiles", { host: "codex" });
    expect((listProfiles.mock.calls.at(-1) as any[] | undefined)?.[0]).toMatchObject({ hosts: ["codex"] });
  });
});

describe("EmbeddedApiClient POST /api/v1/profiles/switch — MPS-09 error surfacing", () => {
  test("returns {success:true, data} on success", async () => {
    switchProfile.mockImplementationOnce(() => ({
      profile: "work",
      dryRun: false,
      hosts: [{ host: "claude", status: "switched", filesChanged: 12 }],
      restartRequired: true,
    }));
    const result = (await client.post("/api/v1/profiles/switch", { profile: "work" })) as any;
    expect(result.success).toBe(true);
    expect(result.data.restartRequired).toBe(true);
  });

  test("400 (ApiHttpError) on UnknownProfileError", async () => {
    switchProfile.mockImplementationOnce(() => {
      throw UnknownProfileError("nope", ["balanced", "work"]);
    });
    await expect(client.post("/api/v1/profiles/switch", { profile: "nope" })).rejects.toMatchObject({
      status: 400,
      body: { success: false, error: { code: "UnknownProfileError" } },
    });
  });

  test("404 (ApiHttpError) on NoHostsDetectedError", async () => {
    switchProfile.mockImplementationOnce(() => {
      throw NoHostsDetectedError();
    });
    await expect(client.post("/api/v1/profiles/switch", { profile: "work" })).rejects.toMatchObject({
      status: 404,
      body: { success: false, error: { code: "NoHostsDetectedError" } },
    });
  });

  test("409 (ApiHttpError) on LockHeldError", async () => {
    switchProfile.mockImplementationOnce(() => {
      throw LockHeldError("/tmp/install-state.json.switch.lock");
    });
    await expect(client.post("/api/v1/profiles/switch", { profile: "work" })).rejects.toMatchObject({
      status: 409,
      body: { success: false, error: { code: "LockHeldError" } },
    });
  });

  test("500 (ApiHttpError) on CorruptInstallStateError", async () => {
    switchProfile.mockImplementationOnce(() => {
      throw CorruptInstallStateError("/tmp/install-state.json", "invalid JSON");
    });
    await expect(client.post("/api/v1/profiles/switch", { profile: "work" })).rejects.toMatchObject({
      status: 500,
      body: { success: false, error: { code: "CorruptInstallStateError" } },
    });
  });

  test("passes dryRun through", async () => {
    switchProfile.mockImplementationOnce(() => ({ profile: "work", dryRun: true, hosts: [], restartRequired: false }));
    await client.post("/api/v1/profiles/switch", { profile: "work", dryRun: true });
    expect((switchProfile.mock.calls.at(-1) as any[] | undefined)?.[0]).toMatchObject({ profile: "work", dryRun: true });
  });
});
