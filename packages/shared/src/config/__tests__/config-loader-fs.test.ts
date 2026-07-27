/**
 * Real-filesystem config persistence tests (T1 / TASK-001, SEC-01).
 *
 * `config-loader.test.ts` intercepts `fs` with spies over a virtual store, which
 * proves the *mechanism* (temp file + rename) but cannot prove the *property*
 * that mechanism exists for: a concurrent reader never observes a half-written
 * config.json. SEC-01 auto-provisions an API key on first start, so two
 * processes starting at once is the real case, not a hypothetical.
 *
 * `CONFIG_DIR` is a module-level const (`config-loader.ts:7`) frozen at module
 * evaluation, and `bun test` shares one process across every file in the
 * package — the sibling suite already imports `config-loader` statically, so
 * assigning `XDG_CONFIG_HOME` here would come too late and these tests would
 * write into the developer's real `~/.config/massa-ai/`. Every scenario below
 * therefore runs in a **subprocess** whose `XDG_CONFIG_HOME` is set before
 * `bun` ever loads the module. That is the "set XDG_CONFIG_HOME before
 * importing config-loader" contract, enforced by process boundary rather than
 * by ordering discipline.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

const LOADER = path.join(import.meta.dir, "..", "config-loader.ts");
const CONFIG_TYPES = path.join(import.meta.dir, "..", "massa-ai-config.ts");

let xdgHome: string;
let configDir: string;
let configPath: string;
let scriptDir: string;

beforeEach(() => {
  scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-cfg-"));
  xdgHome = path.join(scriptDir, "xdg");
  configDir = path.join(xdgHome, "massa-ai");
  configPath = path.join(configDir, "config.json");
});

afterEach(() => {
  fs.rmSync(scriptDir, { recursive: true, force: true });
});

/** Write a throwaway script and run it with an isolated XDG_CONFIG_HOME. */
function runIsolated(
  name: string,
  source: string,
  args: string[] = [],
): { exitCode: number; stdout: string; stderr: string } {
  const file = path.join(scriptDir, `${name}.ts`);
  fs.writeFileSync(file, source);
  const proc = Bun.spawnSync(["bun", file, ...args], {
    env: { ...process.env, XDG_CONFIG_HOME: xdgHome },
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

/** Same, but async so the parent can read the file while the child writes. */
function spawnIsolated(name: string, source: string, args: string[] = []) {
  const file = path.join(scriptDir, `${name}.ts`);
  fs.writeFileSync(file, source);
  return Bun.spawn(["bun", file, ...args], {
    env: { ...process.env, XDG_CONFIG_HOME: xdgHome },
    stdout: "pipe",
    stderr: "pipe",
  });
}

const WRITER = `
import { saveConfig } from ${JSON.stringify(LOADER)};
import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};

const tag = process.argv[2];
const rounds = Number(process.argv[3]);
for (let i = 0; i < rounds; i++) {
  saveConfig({
    ...defaultMassaAiConfig,
    security: { corsOrigins: [], apiKey: \`\${tag}-\${i}\` },
  });
}
`;

describe("config-loader real-filesystem persistence", () => {
  test("the subprocess resolves CONFIG_DIR under the isolated XDG_CONFIG_HOME", () => {
    // Guards the isolation contract itself: if this ever reports the real home
    // dir, every test below is silently writing to the developer's ~/.config.
    const { exitCode, stdout, stderr } = runIsolated(
      "probe",
      `
import { getConfigDir, getConfigPath } from ${JSON.stringify(LOADER)};
console.log(JSON.stringify({ dir: getConfigDir(), file: getConfigPath() }));
`,
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const observed = JSON.parse(stdout);
    expect(observed.dir).toBe(configDir);
    expect(observed.file).toBe(configPath);
    expect(observed.dir.startsWith(os.homedir() + path.sep + ".config")).toBe(false);
  }, 15_000);

  test("a partial config.json round-trips through save without losing other sections", () => {
    const { exitCode, stdout, stderr } = runIsolated(
      "roundtrip",
      `
import { saveConfig, loadConfig } from ${JSON.stringify(LOADER)};

// A hand-edited config.json holding only two sections, one of them a partial
// security block — the shape SEC-01 produces after provisioning a key into an
// existing thin config.
saveConfig({
  logging: { level: "debug", enableMetrics: true },
  security: { apiKey: "hand-written" },
} as any);

const loaded = loadConfig();
saveConfig(loaded);
const reloaded = loadConfig();
console.log(JSON.stringify(reloaded));
`,
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);

    const reloaded = JSON.parse(stdout);
    expect(reloaded.security.apiKey).toBe("hand-written");
    expect(reloaded.security.corsOrigins).toEqual([]);
    expect(reloaded.logging.level).toBe("debug");
    // Sections absent from the user's file are still populated from defaults.
    expect(reloaded.cache.enabled).toBe(true);
    expect(reloaded.embedding.provider).toBe("ollama");
    expect(reloaded.synapse.enabled).toBe(true);

    const onDisk = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(onDisk.security.apiKey).toBe("hand-written");
  }, 15_000);

  test("a concurrent reader never observes a truncated config.json", async () => {
    // Three writers rewriting the same ~5 KB file while this process reads it.
    // A bare writeFileSync truncates the live path before rewriting it, so a
    // reader lands inside that window and gets unparseable JSON. A temp file
    // published by rename(2) makes the window unreachable: the reader sees
    // either the whole old file or the whole new one.
    const rounds = 250;
    const procs = ["a", "b", "c"].map((tag) =>
      spawnIsolated(`writer-${tag}`, WRITER, [tag, String(rounds)]),
    );

    let reads = 0;
    const failures: string[] = [];

    while (procs.some((p) => p.exitCode === null)) {
      for (let i = 0; i < 40; i++) {
        let raw: string;
        try {
          raw = fs.readFileSync(configPath, "utf-8");
        } catch {
          continue; // not created yet
        }
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.security?.apiKey !== "string") {
            failures.push(`missing security.apiKey in a ${raw.length}-byte read`);
          }
          reads++;
        } catch (err) {
          failures.push(`${(err as Error).message} (${raw.length} bytes)`);
        }
      }
      await Bun.sleep(1);
    }

    await Promise.all(procs.map((p) => p.exited));
    for (const p of procs) expect(p.exitCode).toBe(0);

    expect(reads).toBeGreaterThan(0);
    expect(failures.slice(0, 3)).toEqual([]);
    expect(failures).toHaveLength(0);
  }, 60_000);

  test("no temp files are left behind in the config dir", async () => {
    const procs = ["a", "b"].map((tag) =>
      spawnIsolated(`leftover-${tag}`, WRITER, [tag, "60"]),
    );
    await Promise.all(procs.map((p) => p.exited));
    for (const p of procs) expect(p.exitCode).toBe(0);

    const entries = fs.readdirSync(configDir);
    expect(entries).toEqual(["config.json"]);
  }, 30_000);
});
