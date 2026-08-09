/**
 * Unmocked agentTiers PUT->GET round trip (design D-3, admin-portal-ux-overhaul,
 * plan-critic blocking finding #1).
 *
 * model-registry.test.ts registers mock.module("../../../../scripts/lib/model-profiles.ts",
 * ...) for every other route test — necessary there, but it also means Bun's mock.module
 * rebinds not only what that file imports but that real module's OWN internal
 * cross-references too. A "capture the real function before mock.module runs" escape hatch
 * (the pattern this repo already uses for getDeploymentRoot in that file) does not survive a
 * call chain that re-enters the same module: loadEffectiveRegistry's own internal calls to
 * its sibling exports (mergeOverlay, loadRegistry) still resolve through the rebound
 * (mocked) bindings one level deeper than getDeploymentRoot's single-hop precedent needs to
 * reach — confirmed by instrumenting mergeOverlay's own mock.calls/mock.results there, whose
 * second (internal) call silently fell back to the base mocked implementation instead of the
 * real merge. A genuine end-to-end real run therefore needs a file that registers NO
 * mock.module for scripts/lib/model-profiles.ts at all — this one.
 *
 * The only mock here is configDir("massa-ai") -> a scratch temp directory, so the overlay
 * this test writes never touches the developer's real ~/.config/massa-ai. That mock alone
 * is enough to route this file into the isolation runner's own process (its `mock.module(`
 * detector), keeping it independent of model-registry.test.ts's process-wide rebinding.
 */

import { describe, test, expect, mock } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { Elysia } from "elysia";

const scratchConfigDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "massa-ai-model-registry-round-trip-"),
);
const configDir = mock((..._args: unknown[]): string => scratchConfigDir);
mock.module("@massa-ai/shared/config", () => {
  const actual = require("@massa-ai/shared/config");
  return {
    ...actual,
    configDir: (...args: unknown[]) => configDir(...args),
  };
});

import { modelRegistryRoutes } from "./model-registry.js";

const app = new Elysia().use(modelRegistryRoutes);

async function put(requestPath: string, body: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${requestPath}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as any };
}

async function get(requestPath: string) {
  const res = await app.handle(new Request(`http://localhost${requestPath}`));
  return { status: res.status, json: (await res.json()) as any };
}

describe("PUT then GET — unmocked agentTiers round trip (design D-3, plan-critic blocking finding #1)", () => {
  test("PUT {agentTiers:{builder:{opencode:deep}}} survives the REAL mergeOverlay + validateRegistry + loadEffectiveRegistry, and GET reads it back", async () => {
    const putRes = await put("/api/v1/model-registry", {
      agentTiers: { builder: { opencode: "deep" } },
    });
    expect(putRes.status).toBe(200);
    expect(putRes.json.success).toBe(true);
    // The PUT response itself already reflects the real merge (loadEffectiveRegistry re-read
    // right after the atomic write), not just the subsequent GET.
    expect(putRes.json.data.registry.agentTiers.builder.opencode).toBe("deep");

    const getRes = await get("/api/v1/model-registry");
    expect(getRes.status).toBe(200);
    expect(getRes.json.success).toBe(true);
    expect(getRes.json.data.registry.agentTiers.builder.opencode).toBe("deep");
  });
});
