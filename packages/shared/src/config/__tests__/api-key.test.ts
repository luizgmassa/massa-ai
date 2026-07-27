/**
 * resolveApiKey tests (T2 / TASK-002, SEC-01).
 *
 * Every scenario runs in a subprocess with an isolated XDG_CONFIG_HOME — see
 * `isolated-config.ts`. That is not optional here: this module's whole job is
 * to WRITE a generated secret into `~/.config/massa-ai/config.json`, so an
 * in-process test would provision a key into the developer's and CI runner's
 * real config as a side effect of `bun test`.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";

import {
  API_KEY,
  CONFIG_TYPES,
  LOADER,
  makeIsolatedConfigHome,
  removeIsolatedConfigHome,
  runIsolated,
  spawnIsolated,
  type IsolatedConfigHome,
} from "./isolated-config";

let home: IsolatedConfigHome;

beforeEach(() => {
  home = makeIsolatedConfigHome("massa-ai-key-");
});

afterEach(() => {
  removeIsolatedConfigHome(home);
});

/** Child that resolves once and prints the result as JSON on stdout. */
const RESOLVE_ONCE = `
import { resolveApiKey } from ${JSON.stringify(API_KEY)};
console.log(JSON.stringify(resolveApiKey()));
`;

function seedConfig(security: Record<string, unknown>): void {
  fs.mkdirSync(home.configDir, { recursive: true });
  fs.writeFileSync(home.configPath, JSON.stringify({ security }, null, 2));
}

function readStoredKey(): string | undefined {
  return JSON.parse(fs.readFileSync(home.configPath, "utf-8")).security?.apiKey;
}

describe("resolveApiKey precedence", () => {
  test("env wins over a different key stored in config.json", () => {
    seedConfig({ apiKey: "from-config-file" });
    const { exitCode, stdout } = runIsolated(home, "env-wins", RESOLVE_ONCE, [], {
      MASSA_AI_API_KEY: "from-environment",
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      key: "from-environment",
      provisioned: false,
      source: "env",
    });
    // The env branch must not rewrite the file.
    expect(readStoredKey()).toBe("from-config-file");
  }, 15_000);

  test("config.json is used when no env var is set, and nothing is written", () => {
    seedConfig({ apiKey: "from-config-file" });
    const before = fs.statSync(home.configPath).mtimeMs;

    const { exitCode, stdout } = runIsolated(home, "config-branch", RESOLVE_ONCE);

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      key: "from-config-file",
      provisioned: false,
      source: "config",
    });
    expect(fs.statSync(home.configPath).mtimeMs).toBe(before);
  }, 15_000);

  test("an empty or whitespace-only env var is treated as unset, not as an empty key", () => {
    // A blank MASSA_AI_API_KEY="" in a .env would otherwise resolve to "" and
    // authenticate every request that sends an empty header.
    seedConfig({ apiKey: "from-config-file" });
    const { exitCode, stdout } = runIsolated(home, "blank-env", RESOLVE_ONCE, [], {
      MASSA_AI_API_KEY: "   ",
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).key).toBe("from-config-file");
    expect(JSON.parse(stdout).source).toBe("config");
  }, 15_000);

  test("a blank stored key falls through to generation instead of resolving to it", () => {
    seedConfig({ apiKey: "", corsOrigins: [] });
    const { exitCode, stdout } = runIsolated(home, "blank-config", RESOLVE_ONCE);

    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.source).toBe("generated");
    expect(result.key).toMatch(/^[0-9a-f]{64}$/);
  }, 15_000);

  test("a surrounding-whitespace key is trimmed", () => {
    // A key pasted into config.json with a trailing newline must still match
    // the exact header value the client sends.
    seedConfig({ apiKey: "  padded-key\n" });
    const { exitCode, stdout } = runIsolated(home, "trim", RESOLVE_ONCE);

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).key).toBe("padded-key");
  }, 15_000);
});

describe("resolveApiKey provisioning", () => {
  test("generates a 32-byte hex key, persists it, and reports provisioned", () => {
    const { exitCode, stdout } = runIsolated(home, "provision", RESOLVE_ONCE);

    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.source).toBe("generated");
    expect(result.provisioned).toBe(true);
    // crypto.randomBytes(32).toString("hex") — 64 hex chars, not 32.
    expect(result.key).toMatch(/^[0-9a-f]{64}$/);

    expect(readStoredKey()).toBe(result.key);
  }, 15_000);

  test("provisioning preserves the rest of an existing config.json", () => {
    fs.mkdirSync(home.configDir, { recursive: true });
    fs.writeFileSync(
      home.configPath,
      JSON.stringify({ logging: { level: "debug", enableMetrics: true } }, null, 2),
    );

    const { exitCode } = runIsolated(home, "provision-merge", RESOLVE_ONCE);
    expect(exitCode).toBe(0);

    const onDisk = JSON.parse(fs.readFileSync(home.configPath, "utf-8"));
    expect(onDisk.security.apiKey).toMatch(/^[0-9a-f]{64}$/);
    expect(onDisk.logging.level).toBe("debug");
    expect(onDisk.cache.enabled).toBe(true);
  }, 15_000);

  test("a second resolve in the same process reads the key back instead of regenerating", () => {
    const { exitCode, stdout } = runIsolated(
      home,
      "resolve-thrice",
      `
import { resolveApiKey } from ${JSON.stringify(API_KEY)};
console.log(JSON.stringify([resolveApiKey(), resolveApiKey(), resolveApiKey()]));
`,
    );

    expect(exitCode).toBe(0);
    const [first, second, third] = JSON.parse(stdout);
    expect(first.source).toBe("generated");
    expect(first.provisioned).toBe(true);
    expect(second).toEqual({ key: first.key, provisioned: false, source: "config" });
    expect(third).toEqual(second);
  }, 15_000);

  test("concurrent first starts converge on one persisted key", async () => {
    // The spec's concurrent-start edge case. Operators are told to read the key
    // out of config.json, so a process running with a different one rejects
    // every request they then make — every process must end up on the key that
    // actually survived on disk, not the one it generated.
    const procs = Array.from({ length: 4 }, (_, i) =>
      spawnIsolated(home, `race-${i}`, RESOLVE_ONCE),
    );
    const outs = await Promise.all(
      procs.map(async (p) => {
        const [text, err] = await Promise.all([
          new Response(p.stdout).text(),
          new Response(p.stderr).text(),
        ]);
        await p.exited;
        return { exitCode: p.exitCode, result: JSON.parse(text), stderr: err };
      }),
    );

    for (const o of outs) expect(o.exitCode).toBe(0);

    const stored = readStoredKey();
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    for (const o of outs) {
      expect(o.result.key).toMatch(/^[0-9a-f]{64}$/);
      expect(o.result.key).toBe(stored);
    }

    // Exactly one process provisions, so exactly one warns; the rest adopt the
    // stored key through the ordinary config path.
    expect(outs.filter((o) => o.result.provisioned)).toHaveLength(1);
    expect(outs.filter((o) => o.stderr.trim())).toHaveLength(1);

    // The provisioning lock is released, not leaked.
    expect(fs.readdirSync(home.configDir)).toEqual(["config.json"]);
  }, 60_000);

  test("two separate runs generate different keys", () => {
    const first = JSON.parse(runIsolated(home, "entropy-a", RESOLVE_ONCE).stdout).key;
    fs.rmSync(home.configPath);
    const second = JSON.parse(runIsolated(home, "entropy-b", RESOLVE_ONCE).stdout).key;
    expect(first).not.toBe(second);
  }, 30_000);
});

describe("resolveApiKey warning", () => {
  test("warns exactly once, names the config path, and never prints the key", () => {
    const { exitCode, stdout, stderr } = runIsolated(
      home,
      "warn-once",
      `
import { resolveApiKey } from ${JSON.stringify(API_KEY)};
const a = resolveApiKey();
resolveApiKey();
resolveApiKey();
console.log(JSON.stringify(a));
`,
    );

    expect(exitCode).toBe(0);
    const key = JSON.parse(stdout).key;

    // Warnings go to stderr: this package's stdout carries the MCP JSON-RPC
    // protocol, so a provisioning notice on stdout would break the handshake.
    const lines = stderr.split("\n").filter((l) => l.trim());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(home.configPath);
    // The whole point of the line is to say where the key is, not what it is.
    expect(stderr).not.toContain(key);
    expect(stdout.split("\n").filter((l) => l.trim())).toHaveLength(1);
  }, 15_000);

  test("no warning is emitted when the key came from env or config", () => {
    seedConfig({ apiKey: "already-present" });
    expect(runIsolated(home, "quiet-config", RESOLVE_ONCE).stderr).toBe("");
    expect(
      runIsolated(home, "quiet-env", RESOLVE_ONCE, [], { MASSA_AI_API_KEY: "e" }).stderr,
    ).toBe("");
  }, 30_000);
});

describe("resolveApiKey failure", () => {
  test("throws a typed error naming the path when the config dir is unwritable", () => {
    fs.mkdirSync(home.configDir, { recursive: true });
    fs.chmodSync(home.configDir, 0o500); // r-x: readable, not writable

    // Running as root defeats the permission bit; skip rather than assert a
    // false pass. (CI containers sometimes run as uid 0.)
    const canTest = (() => {
      try {
        fs.writeFileSync(path.join(home.configDir, ".probe"), "x");
        fs.rmSync(path.join(home.configDir, ".probe"));
        return false;
      } catch {
        return true;
      }
    })();
    if (!canTest) return;

    const { exitCode, stdout } = runIsolated(
      home,
      "unwritable",
      `
import { resolveApiKey, ApiKeyProvisioningError } from ${JSON.stringify(API_KEY)};
try {
  resolveApiKey();
  console.log(JSON.stringify({ threw: false }));
} catch (err: any) {
  console.log(JSON.stringify({
    threw: true,
    typed: err instanceof ApiKeyProvisioningError,
    name: err?.name,
    message: err?.message,
    configPath: err?.configPath,
    hasCause: err?.cause !== undefined,
  }));
}
`,
    );

    expect(exitCode).toBe(0);
    const observed = JSON.parse(stdout);
    expect(observed.threw).toBe(true);
    expect(observed.typed).toBe(true);
    expect(observed.name).toBe("ApiKeyProvisioningError");
    expect(observed.configPath).toBe(home.configPath);
    expect(observed.message).toContain(home.configPath);
    expect(observed.hasCause).toBe(true);
  }, 15_000);
});

describe("env.ts seeding", () => {
  test("seeds MASSA_AI_API_KEY from config.json when the env var is unset", () => {
    seedConfig({ apiKey: "seeded-from-config" });
    const { exitCode, stdout } = runIsolated(
      home,
      "seed",
      `
import ${JSON.stringify(path.join(import.meta.dir, "..", "..", "env.ts"))};
console.log(JSON.stringify({ key: process.env.MASSA_AI_API_KEY }));
`,
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).key).toBe("seeded-from-config");
  }, 15_000);

  test("an explicit env var is not overwritten by the config value", () => {
    seedConfig({ apiKey: "seeded-from-config" });
    const { exitCode, stdout } = runIsolated(
      home,
      "seed-noclobber",
      `
import ${JSON.stringify(path.join(import.meta.dir, "..", "..", "env.ts"))};
console.log(JSON.stringify({ key: process.env.MASSA_AI_API_KEY }));
`,
      [],
      { MASSA_AI_API_KEY: "explicit-env" },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).key).toBe("explicit-env");
  }, 15_000);

  test("importing env.ts never provisions a key on its own", () => {
    // env.ts is imported by every process that touches shared config. If it
    // provisioned, `bun test` anywhere would write a secret into the real
    // ~/.config — provisioning belongs to the explicit initAuth() call in T3.
    const { exitCode } = runIsolated(
      home,
      "seed-no-provision",
      `
import ${JSON.stringify(path.join(import.meta.dir, "..", "..", "env.ts"))};
console.log(JSON.stringify({ key: process.env.MASSA_AI_API_KEY ?? null }));
`,
    );

    expect(exitCode).toBe(0);
    expect(fs.existsSync(home.configPath)).toBe(false);
  }, 15_000);
});

/** Compile-time guard that the module is reachable from the package surface. */
describe("api-key export surface", () => {
  test("resolveApiKey is re-exported from @massa-ai/shared/config and the root", () => {
    const { exitCode, stdout } = runIsolated(
      home,
      "exports",
      `
import * as cfg from ${JSON.stringify(path.join(import.meta.dir, "..", "index.ts"))};
import * as root from ${JSON.stringify(path.join(import.meta.dir, "..", "..", "index.ts"))};
console.log(JSON.stringify({
  config: typeof cfg.resolveApiKey,
  configError: typeof cfg.ApiKeyProvisioningError,
  root: typeof root.resolveApiKey,
  rootError: typeof root.ApiKeyProvisioningError,
}));
`,
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      config: "function",
      configError: "function",
      root: "function",
      rootError: "function",
    });
  }, 15_000);
});
