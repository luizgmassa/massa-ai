import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Elysia } from "elysia";
import { restartRoutes } from "./restart.js";
import { authMiddleware, __setAuthKeyForTests } from "../middleware/auth.js";
import {
  _setLifecycleSeamsForTesting,
  _setRestartModeForTesting,
  consumeArmedRestart,
  type LifecycleSeams,
} from "../lifecycle.js";

const KEY = "restart-test-key";

// Auth composed in — an unregistered path 404s before auth runs, so a 401
// assertion only proves anything against a real registered route (CLAUDE.md
// auth trap). The seams record instead of exiting: a leaked process.exit
// would truncate the shared test batch cleanly.
const app = new Elysia().use(authMiddleware).use(restartRoutes);

let seamCalls: string[];
const seams: LifecycleSeams = {
  stopServer: () => {
    seamCalls.push("stopServer");
  },
  stopJobs: () => {
    seamCalls.push("stopJobs");
  },
  disconnect: async () => {
    seamCalls.push("disconnect");
  },
  spawn: () => {
    seamCalls.push("spawn");
  },
  exit: (code) => {
    seamCalls.push(`exit:${code}`);
  },
};

beforeEach(() => {
  seamCalls = [];
  __setAuthKeyForTests(KEY);
  _setLifecycleSeamsForTesting(seams);
});

afterEach(() => {
  _setLifecycleSeamsForTesting(null);
  _setRestartModeForTesting(null);
  consumeArmedRestart();
  __setAuthKeyForTests(null);
});

async function post(headers: Record<string, string> = {}) {
  const res = await app.handle(
    new Request("http://localhost/api/v1/system/restart", { method: "POST", headers }),
  );
  // onAfterResponse work is scheduled around response completion — settle it.
  await new Promise((r) => setTimeout(r, 20));
  return { status: res.status, json: (await res.json()) as any };
}

describe("POST /api/v1/system/restart", () => {
  test("AC-1: 401 without key, and the drain never arms", async () => {
    const res = await post();
    expect(res.status).toBe(401);
    expect(seamCalls).toEqual([]);
  });

  test("AC-1/AC-2: supervised — 200, mode reported, drain runs once without spawn", async () => {
    _setRestartModeForTesting("supervised");
    const res = await post({ "x-api-key": KEY });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ success: true, restarting: true, mode: "supervised" });
    expect(seamCalls).toEqual(["stopServer", "stopJobs", "disconnect", "exit:0"]);
  });

  test("AC-2: respawn — drain includes the spawn, ordered after listener stop", async () => {
    _setRestartModeForTesting("respawn");
    const res = await post({ "x-api-key": KEY });
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe("respawn");
    expect(seamCalls).toEqual(["stopServer", "stopJobs", "disconnect", "spawn", "exit:0"]);
  });

  test("AC-2: dev-watch — 409 with reason, no drain", async () => {
    _setRestartModeForTesting("dev-watch");
    const res = await post({ "x-api-key": KEY });
    expect(res.status).toBe(409);
    expect(res.json.reason).toContain("dev watcher");
    expect(seamCalls).toEqual([]);
  });
});
