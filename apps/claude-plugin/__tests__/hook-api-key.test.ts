/**
 * T23 / SEC-06 AC 6 — the lifecycle hook survives mandatory auth.
 *
 * `massa-ai-hook.ts` read `process.env.MASSA_AI_API_KEY` and attached
 * `x-api-key` only `if (apiKey)`. It imports nothing from `@massa-ai/shared`,
 * so it never ran the `env.ts` config→env seeding the rest of the system
 * relies on — on a fresh install the key exists only in `config.json` and the
 * hook could not see it.
 *
 * The hook is fire-and-forget and silent-degrades by contract, so once SEC-01
 * made auth mandatory the failure mode was invisible: every POST would 401,
 * every hook would still exit 0, and passive observation capture would simply
 * stop with no error anywhere. That is candidate lesson L-002, and it is why
 * these assert against a real capture server — endpoint, header and body — and
 * not merely `exit 0`. An exit-code test passes just as happily when every
 * observation is being rejected.
 *
 * The binary is spawned as a child process on purpose: the key resolution
 * reads XDG_CONFIG_HOME, and the point is to exercise the shipped entrypoint
 * end to end rather than an imported function.
 */

import { describe, expect, test, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

const HOOK = path.resolve(import.meta.dir, "..", "hooks", "massa-ai-hook.ts");

interface Captured {
  method: string;
  pathname: string;
  apiKey: string | null;
  body: Record<string, unknown>;
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** An isolated XDG config home, optionally holding a config.json. */
function seedConfigHome(contents?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-hook-key-"));
  tempDirs.push(root);
  if (contents !== undefined) {
    const dir = path.join(root, "massa-ai");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.json"), contents);
  }
  return root;
}

function configWithKey(apiKey: string): string {
  return JSON.stringify({ database: { url: "postgresql://localhost/x" }, security: { apiKey } });
}

/**
 * Run the shipped hook binary against a real capture server and return every
 * request it made, plus its exit code.
 */
async function runHook(
  subcommand: string,
  env: Record<string, string>,
  stdin = JSON.stringify({ session_id: "sess-t23", tool_name: "Read" }),
): Promise<{ exitCode: number; requests: Captured[]; stderr: string }> {
  const requests: Captured[] = [];

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        // A malformed body is itself an observation worth keeping.
      }
      requests.push({
        method: request.method,
        pathname: url.pathname,
        apiKey: request.headers.get("x-api-key"),
        body,
      });
      return Response.json({ success: true });
    },
  });

  try {
    // Async spawn, never spawnSync: spawnSync blocks the thread Bun.serve
    // answers the hook's POST on, and the two deadlock.
    const child = Bun.spawn({
      cmd: [process.execPath, HOOK, subcommand],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        TMPDIR: os.tmpdir(),
        MASSA_AI_API_BASE: `http://127.0.0.1:${server.port}`,
        // Pin the project id so the assertions do not depend on the git
        // toplevel of whatever checkout the suite runs in.
        MASSA_AI_PROJECT_ID: "massa-ai-t23",
        ...env,
      },
      stdin: new TextEncoder().encode(stdin),
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await child.exited;
    const stderr = await new Response(child.stderr).text();
    return { exitCode, requests, stderr };
  } finally {
    server.stop(true);
  }
}

describe("lifecycle hook API key resolution (SEC-06)", () => {
  test("posts with the key from config.json when no env var is set", async () => {
    const configHome = seedConfigHome(configWithKey("hook-config-key-abc123"));

    const { exitCode, requests } = await runHook("post-tool-use", {
      XDG_CONFIG_HOME: configHome,
    });

    expect(exitCode).toBe(0);
    expect(requests).toHaveLength(1);

    const [req] = requests;
    // Endpoint and body, not just the header: a hook that authenticates
    // correctly but posts the wrong shape captures nothing either.
    expect(req!.method).toBe("POST");
    expect(req!.pathname).toBe("/api/v1/hook");
    expect(req!.apiKey).toBe("hook-config-key-abc123");
    expect(req!.body.event).toBe("post-tool-use");
    expect(req!.body.projectId).toBe("massa-ai-t23");
    expect(req!.body.sessionId).toBe("sess-t23");
    expect(req!.body.payload).toMatchObject({ tool_name: "Read" });
  }, 30_000);

  test("an explicit env key wins over the stored one", async () => {
    const configHome = seedConfigHome(configWithKey("hook-config-key-abc123"));

    const { exitCode, requests } = await runHook("post-tool-use", {
      XDG_CONFIG_HOME: configHome,
      MASSA_AI_API_KEY: "hook-env-key-xyz789",
    });

    expect(exitCode).toBe(0);
    expect(requests[0]!.apiKey).toBe("hook-env-key-xyz789");
  }, 30_000);

  test("still exits 0 and still posts when no key exists anywhere", async () => {
    // The silent-degrade contract. The hook must never block the agent, so a
    // missing key downgrades to an unauthenticated POST (which the API will
    // reject) rather than an error or a non-zero exit.
    const configHome = seedConfigHome(undefined);

    const { exitCode, requests } = await runHook("post-tool-use", {
      XDG_CONFIG_HOME: configHome,
    });

    expect(exitCode).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.apiKey).toBeNull();
  }, 30_000);

  test("a malformed config.json degrades to no key without crashing", async () => {
    const configHome = seedConfigHome("{ not json at all");

    const { exitCode, requests } = await runHook("post-tool-use", {
      XDG_CONFIG_HOME: configHome,
    });

    expect(exitCode).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.apiKey).toBeNull();
  }, 30_000);

  test("a whitespace-only stored key is treated as unset", async () => {
    // Same invariant as usable() in packages/shared/src/config/api-key.ts.
    const configHome = seedConfigHome(configWithKey("   "));

    const { exitCode, requests } = await runHook("post-tool-use", {
      XDG_CONFIG_HOME: configHome,
    });

    expect(exitCode).toBe(0);
    expect(requests[0]!.apiKey).toBeNull();
  }, 30_000);

  test("pre-compact authenticates both of its POSTs", async () => {
    // pre-compact is the one subcommand that posts twice, to two different
    // endpoints. The snapshot POST is the easiest one to leave unauthenticated
    // by accident, and losing it silently loses compaction snapshots.
    const configHome = seedConfigHome(configWithKey("hook-config-key-abc123"));

    const { exitCode, requests } = await runHook("pre-compact", {
      XDG_CONFIG_HOME: configHome,
    });

    expect(exitCode).toBe(0);
    expect(requests).toHaveLength(2);

    const paths = requests.map((r) => r.pathname).sort();
    expect(paths).toEqual(["/api/v1/hook", "/api/v1/hook/compact-snapshot"]);
    for (const req of requests) {
      expect(req.apiKey).toBe("hook-config-key-abc123");
    }
  }, 30_000);
});
