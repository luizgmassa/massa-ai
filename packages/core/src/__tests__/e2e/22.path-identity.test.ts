import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cp, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  E2E_ENABLED,
  POLY_FIXTURE_PATH,
  PROJECT_PATH,
  SHARED_PID,
  SHARED_PROFILE_IDENTITY,
  ensureSharedIndex,
  httpGet,
  httpPost,
  indexAndAwait,
  isOwnedDedicatedE2eEnvironment,
  isSharedIndexWarm,
  probeAvailability,
} from "./_helpers.js";

const DEDICATED_FIXTURE = isOwnedDedicatedE2eEnvironment();
const READY = await (async () => {
  if (!E2E_ENABLED || !DEDICATED_FIXTURE || !process.env.DATABASE_URL) return false;
  const availability = await probeAvailability();
  return availability.API_UP && availability.OLLAMA_UP && availability.BACKEND === "postgres";
})();

describe.skipIf(!READY)("T15 dedicated shared-index identity and path hygiene", () => {
  let temporaryRoot = "";
  let wrongFixturePath = "";

  beforeAll(async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "massa-ai-wrong-root-"));
    wrongFixturePath = path.join(temporaryRoot, "fixture");
    await cp(POLY_FIXTURE_PATH, wrongFixturePath, { recursive: true });

    const seeded = await indexAndAwait(wrongFixturePath, SHARED_PID, {
      forceReindex: true,
      warmCache: false,
      timeoutMs: 420_000,
    });
    if (seeded.status !== "completed" && seeded.status !== "indexed") {
      throw new Error(`wrong-root seed failed: ${JSON.stringify(seeded.raw)}`);
    }
    expect(await isSharedIndexWarm(SHARED_PID)).toBe(true);
  }, 700_000);

  afterAll(async () => {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  });

  test("warm wrong-root data is reset and rebuilt at the canonical profile root", async () => {
    expect(SHARED_PROFILE_IDENTITY).toMatch(/^[a-f0-9]{16}$/);
    expect(SHARED_PID).toBe(`e2e-ai-shared-${SHARED_PROFILE_IDENTITY}`);

    expect(await ensureSharedIndex()).toBe(SHARED_PID);
    const response = await httpGet<any>("/api/v1/workspace/list");
    const workspace = (response?.data?.workspaces ?? []).find(
      (entry: any) => entry?.projectId === SHARED_PID,
    );
    expect(workspace).toBeDefined();
    expect(await realpath(workspace.projectPath)).toBe(await realpath(PROJECT_PATH));
  }, 700_000);

  test("non-force API reuse rejects a different canonical root without mutation", async () => {
    const refused = await httpPost<any>("/api/v1/project/index", {
      projectPath: wrongFixturePath,
      projectId: SHARED_PID,
      forceReindex: false,
    });
    expect(refused?.success).toBe(false);
    expect(String(refused?.error)).toContain("already indexes canonical root");

    const response = await httpGet<any>("/api/v1/workspace/list");
    const workspace = (response?.data?.workspaces ?? []).find(
      (entry: any) => entry?.projectId === SHARED_PID,
    );
    expect(await realpath(workspace.projectPath)).toBe(await realpath(PROJECT_PATH));
  });
});
