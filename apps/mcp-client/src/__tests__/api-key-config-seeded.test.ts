/**
 * T7 / SEC-06 AC 3 — the MCP client sends the key the API auto-provisioned.
 *
 * `api-client.ts:36` reads `process.env.MASSA_AI_API_KEY`, and nothing in
 * `apps/mcp-client` ever sets it. On a fresh install the key exists only in
 * `config.json` under `security.apiKey`, put there by SEC-01's provisioning.
 * The bridge between the two is a side effect: `@massa-ai/shared/config`
 * imports `env.ts`, which seeds the env var from the file. `api-client.ts`
 * imports that barrel for `parsePositiveIntEnv`, so the seeding happens to run
 * before the constructor reads the variable.
 *
 * That is an implicit, ordering-dependent chain across three modules, and the
 * design explicitly refused to assume it holds "by analogy with env.ts" — a
 * dropped import or a reordered read breaks it silently, and the symptom is a
 * 401 from every MCP tool call on a default install.
 *
 * These run the chain for real in a child process against a real HTTP server,
 * asserting on the header that actually goes out on the wire. A child process
 * is mandatory: `CONFIG_DIR` is a module-level const evaluated at first import
 * (`config-loader.ts:8`), so `XDG_CONFIG_HOME` has to be set before the child
 * loads anything, and `bun test` shares one process per package.
 */

import { describe, expect, test, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

const CLIENT_MODULE = path.resolve(import.meta.dir, "..", "api-client.ts");

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** An isolated XDG config home holding a config.json with the given security section. */
function seedConfigHome(security: Record<string, unknown> | undefined): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-mcp-key-"));
  tempDirs.push(root);
  const dir = path.join(root, "massa-ai");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "config.json"),
    JSON.stringify({ database: { url: "postgresql://localhost:5432/x" }, ...(security ? { security } : {}) }),
  );
  return root;
}

/**
 * Boot a real server, run an ApiClient GET against it in a child process with
 * the given environment, and return the `x-api-key` header the client sent.
 *
 * `null` means the header was absent — distinct from `""`, which would mean it
 * was sent empty. The difference matters: an empty header still fails auth, but
 * for a different reason than never resolving a key at all.
 */
async function capturedApiKeyHeader(env: Record<string, string>): Promise<string | null> {
  let seen: string | null = null;
  let sawRequest = false;

  const server = Bun.serve({
    port: 0,
    fetch(request) {
      sawRequest = true;
      seen = request.headers.get("x-api-key");
      return Response.json({ success: true });
    },
  });

  try {
    // Must be the async spawn, never spawnSync: spawnSync blocks this thread,
    // which is the same thread Bun.serve answers the child's request on, and
    // the two deadlock until the test times out.
    const child = Bun.spawn({
      cmd: [
        process.execPath,
        "-e",
        `const { ApiClient } = await import(${JSON.stringify(CLIENT_MODULE)});
         await new ApiClient().get("/health");`,
      ],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        MASSA_AI_API_URL: `http://127.0.0.1:${server.port}`,
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await child.exited;
    if (exitCode !== 0) {
      const [out, err] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      throw new Error(`client child exited ${exitCode}: ${err}${out}`);
    }
    if (!sawRequest) throw new Error("client never reached the test server");
    return seen;
  } finally {
    server.stop(true);
  }
}

describe("MCP client API key resolution (SEC-06)", () => {
  test("sends the key seeded from config.json when no env var is set", async () => {
    const configHome = seedConfigHome({ apiKey: "config-seeded-key-abc123" });

    const header = await capturedApiKeyHeader({ XDG_CONFIG_HOME: configHome });

    expect(header).toBe("config-seeded-key-abc123");
  }, 30_000);

  test("an explicit env key wins over the stored one", async () => {
    // Guards the documented env > config.json precedence at the transport
    // layer, not just inside resolveApiKey().
    const configHome = seedConfigHome({ apiKey: "config-seeded-key-abc123" });

    const header = await capturedApiKeyHeader({
      XDG_CONFIG_HOME: configHome,
      MASSA_AI_API_KEY: "explicit-env-key-xyz789",
    });

    expect(header).toBe("explicit-env-key-xyz789");
  }, 30_000);

  test("sends no key header when neither source has one", async () => {
    // The silent-degrade direction. It must stay observable: this is what a
    // 401 from every tool call looks like from the client side, and asserting
    // it keeps the two failure modes (no key vs wrong key) distinguishable.
    const configHome = seedConfigHome(undefined);

    const header = await capturedApiKeyHeader({ XDG_CONFIG_HOME: configHome });

    expect(header).toBeNull();
  }, 30_000);

  test("a whitespace-only stored key is treated as unset", async () => {
    // Matches usable() in packages/shared/src/config/api-key.ts. Observed red
    // before the fix: env.ts seeded "   " on a bare truthiness check and the
    // client sent it, so this returned "" instead of null while the API had
    // already classified the same value as unconfigured and provisioned a
    // different key.
    const configHome = seedConfigHome({ apiKey: "   " });

    const header = await capturedApiKeyHeader({ XDG_CONFIG_HOME: configHome });

    expect(header).toBeNull();
  }, 30_000);

  test("a whitespace-only env key is treated as unset", async () => {
    // The other half of the same invariant. env.ts refuses to let blanks
    // suppress the config value, and the client refuses to send them.
    const configHome = seedConfigHome(undefined);

    const header = await capturedApiKeyHeader({
      XDG_CONFIG_HOME: configHome,
      MASSA_AI_API_KEY: "   ",
    });

    expect(header).toBeNull();
  }, 30_000);

  test("a blank env key does not mask a usable stored key", async () => {
    // docker-compose passes `MASSA_AI_API_KEY=${MASSA_AI_API_KEY:-}`, so the
    // variable is *present and empty* on every default `docker compose up`.
    // If that counted as "set", the seeding would be skipped and the MCP
    // container would send no key at all against an API that now requires one.
    const configHome = seedConfigHome({ apiKey: "config-seeded-key-abc123" });

    const header = await capturedApiKeyHeader({
      XDG_CONFIG_HOME: configHome,
      MASSA_AI_API_KEY: "",
    });

    expect(header).toBe("config-seeded-key-abc123");
  }, 30_000);
});
