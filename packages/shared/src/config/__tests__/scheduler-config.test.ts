/**
 * `scheduler` config resolution (T3 — SCH-01, SCH-02, SCH-03, SCH-06).
 *
 * `config.json` previously could not carry a `scheduler` section at all — the
 * comment this reverses ("intentionally NOT a config key") is why. The new
 * resolution is `env > config.json > literal default`, one helper per value,
 * mirroring the existing `logging`/`llm` blocks (`config/index.ts`).
 *
 * Resolution happens in a module-level object literal (`config/index.ts`
 * `defaultConfig`), so an in-process `process.env.X = …` or file write lands
 * after the value is frozen. Every case therefore runs in a subprocess via the
 * established `isolated-config` harness (see that module for why), which also
 * gives the child an isolated `XDG_CONFIG_HOME` so a developer's real
 * `~/.config/massa-ai/config.json` never leaks into the resolved value.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import {
  makeIsolatedConfigHome,
  removeIsolatedConfigHome,
  runIsolated,
  type IsolatedConfigHome,
} from "./isolated-config";

const CONFIG_INDEX = path.join(import.meta.dir, "..", "index.ts");

const CHILD = `
import { config } from ${JSON.stringify(CONFIG_INDEX)};
console.log(JSON.stringify(config.get("scheduler")));
`;

/** Literal defaults this resolution must fall back to, mirroring
 *  `DEFAULT_SCHEDULED_JOBS` in `packages/core/src/services/scheduler/scheduler-defaults.ts`
 *  exactly (SCH-02). */
const LITERAL_DEFAULT = {
  enabled: false,
  tickMs: 60_000,
  maxConcurrent: 2,
  jobs: {
    "memory-consolidation": { enabled: false, intervalMs: 30 * 60 * 1000 },
    "decay-sweep": { enabled: false, intervalMs: 60 * 60 * 1000 },
    "auto-improve": { enabled: false, intervalMs: 30 * 60 * 1000 },
    "observation-bridge": { enabled: false, intervalMs: 30 * 60 * 1000 },
    "checkpoint-purge": { enabled: false, intervalMs: 60 * 60 * 1000 },
  },
};

/** Every `MASSA_AI_SCHEDULER_*` var this resolution reads, blanked — a
 *  developer's real shell exporting one of these would otherwise leak into
 *  the child via `childEnv`'s `...inherited` spread. */
function clearedEnv(): Record<string, string> {
  return {
    MASSA_AI_SCHEDULER_ENABLED: "",
    MASSA_AI_SCHEDULER_TICK_MS: "",
    MASSA_AI_SCHEDULER_MAX_CONCURRENT: "",
    MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED: "",
    MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_INTERVAL_MS: "",
  };
}

function writeConfig(home: IsolatedConfigHome, scheduler: unknown): void {
  fs.mkdirSync(home.configDir, { recursive: true });
  fs.writeFileSync(home.configPath, JSON.stringify({ scheduler }, null, 2));
}

function writeRawConfig(home: IsolatedConfigHome, content: string): void {
  fs.mkdirSync(home.configDir, { recursive: true });
  fs.writeFileSync(home.configPath, content);
}

function resolve(
  home: IsolatedConfigHome,
  name: string,
  env: Record<string, string> = clearedEnv(),
): Record<string, unknown> {
  const res = runIsolated(home, name, CHILD, [], env);
  expect(res.exitCode, `child failed:\n${res.stderr}`).toBe(0);
  return JSON.parse(res.stdout.trim().split("\n").pop() ?? "null") as Record<string, unknown>;
}

describe("scheduler config resolution (SCH-01, SCH-02, SCH-03, SCH-06)", () => {
  let home: IsolatedConfigHome;
  const origSchedulerEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    home = makeIsolatedConfigHome("massa-ai-scheduler-cfg-");
    for (const k of Object.keys(clearedEnv())) origSchedulerEnv[k] = process.env[k];
  });

  afterEach(() => {
    removeIsolatedConfigHome(home);
    // Restore MASSA_AI_* env vars — this suite never mutates this process's
    // env directly (every resolution runs in a subprocess), but the
    // restoration is kept as an explicit invariant so a future edit that adds
    // an in-process `process.env.X = …` cannot leak state into later tests.
    for (const [k, v] of Object.entries(origSchedulerEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test("no scheduler key at all resolves to the literal defaults (absent-key parity)", () => {
    writeConfig(home, undefined);
    expect(resolve(home, "absent")).toEqual(LITERAL_DEFAULT);
  }, 30_000);

  test("no config.json at all resolves to the literal defaults", () => {
    expect(resolve(home, "no-file")).toEqual(LITERAL_DEFAULT);
  }, 30_000);

  describe("scheduler.enabled", () => {
    test("config-only: config.json value wins over the literal default", () => {
      writeConfig(home, { enabled: true });
      const resolved = resolve(home, "config-only");
      expect(resolved.enabled).toBe(true);
    }, 30_000);

    test("env-only: env value wins over the literal default", () => {
      writeConfig(home, undefined);
      const resolved = resolve(home, "env-only", {
        ...clearedEnv(),
        MASSA_AI_SCHEDULER_ENABLED: "true",
      });
      expect(resolved.enabled).toBe(true);
    }, 30_000);

    test("both set: env wins over config.json", () => {
      writeConfig(home, { enabled: false });
      const resolved = resolve(home, "both", {
        ...clearedEnv(),
        MASSA_AI_SCHEDULER_ENABLED: "true",
      });
      expect(resolved.enabled).toBe(true);
    }, 30_000);

    test("neither set: literal default (false)", () => {
      writeConfig(home, undefined);
      const resolved = resolve(home, "neither");
      expect(resolved.enabled).toBe(false);
    }, 30_000);
  });

  describe("scheduler.tickMs", () => {
    test("config-only", () => {
      writeConfig(home, { tickMs: 5000 });
      expect(resolve(home, "config-only").tickMs).toBe(5000);
    }, 30_000);

    test("env-only", () => {
      writeConfig(home, undefined);
      const resolved = resolve(home, "env-only", {
        ...clearedEnv(),
        MASSA_AI_SCHEDULER_TICK_MS: "7000",
      });
      expect(resolved.tickMs).toBe(7000);
    }, 30_000);

    test("both set: env wins", () => {
      writeConfig(home, { tickMs: 5000 });
      const resolved = resolve(home, "both", {
        ...clearedEnv(),
        MASSA_AI_SCHEDULER_TICK_MS: "7000",
      });
      expect(resolved.tickMs).toBe(7000);
    }, 30_000);

    test("neither set: literal default (60000)", () => {
      writeConfig(home, undefined);
      expect(resolve(home, "neither").tickMs).toBe(60_000);
    }, 30_000);
  });

  describe("scheduler.maxConcurrent", () => {
    test("config-only", () => {
      writeConfig(home, { maxConcurrent: 5 });
      expect(resolve(home, "config-only").maxConcurrent).toBe(5);
    }, 30_000);

    test("env-only", () => {
      writeConfig(home, undefined);
      const resolved = resolve(home, "env-only", {
        ...clearedEnv(),
        MASSA_AI_SCHEDULER_MAX_CONCURRENT: "9",
      });
      expect(resolved.maxConcurrent).toBe(9);
    }, 30_000);

    test("both set: env wins", () => {
      writeConfig(home, { maxConcurrent: 5 });
      const resolved = resolve(home, "both", {
        ...clearedEnv(),
        MASSA_AI_SCHEDULER_MAX_CONCURRENT: "9",
      });
      expect(resolved.maxConcurrent).toBe(9);
    }, 30_000);

    test("neither set: literal default (2)", () => {
      writeConfig(home, undefined);
      expect(resolve(home, "neither").maxConcurrent).toBe(2);
    }, 30_000);
  });

  // The spec's own Independent Test names checkpoint-purge — used here too so
  // the per-job matrix exercises the exact case the spec documents.
  describe("scheduler.jobs['checkpoint-purge']", () => {
    test("config-only", () => {
      writeConfig(home, { jobs: { "checkpoint-purge": { enabled: true, intervalMs: 120_000 } } });
      const resolved = resolve(home, "config-only");
      expect((resolved.jobs as any)["checkpoint-purge"]).toEqual({
        enabled: true,
        intervalMs: 120_000,
      });
    }, 30_000);

    test("env-only", () => {
      writeConfig(home, undefined);
      const resolved = resolve(home, "env-only", {
        ...clearedEnv(),
        MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED: "true",
        MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_INTERVAL_MS: "90000",
      });
      expect((resolved.jobs as any)["checkpoint-purge"]).toEqual({
        enabled: true,
        intervalMs: 90_000,
      });
    }, 30_000);

    test("both set: env wins over config.json", () => {
      writeConfig(home, { jobs: { "checkpoint-purge": { enabled: false, intervalMs: 120_000 } } });
      const resolved = resolve(home, "both", {
        ...clearedEnv(),
        MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_ENABLED: "true",
        MASSA_AI_SCHEDULER_CHECKPOINT_PURGE_INTERVAL_MS: "90000",
      });
      expect((resolved.jobs as any)["checkpoint-purge"]).toEqual({
        enabled: true,
        intervalMs: 90_000,
      });
    }, 30_000);

    test("neither set: literal default (disabled, 60 min)", () => {
      writeConfig(home, undefined);
      const resolved = resolve(home, "neither");
      expect((resolved.jobs as any)["checkpoint-purge"]).toEqual({
        enabled: false,
        intervalMs: 60 * 60 * 1000,
      });
    }, 30_000);
  });

  test("scheduler.jobs present but empty: every job falls back to its literal default", () => {
    writeConfig(home, { jobs: {} });
    expect(resolve(home, "empty-jobs")).toEqual(LITERAL_DEFAULT);
  }, 30_000);

  test("an unreadable (corrupt) config.json falls back to the literal defaults without throwing (SCH-06)", () => {
    writeRawConfig(home, "{ this is not valid json");
    const res = runIsolated(home, "corrupt", CHILD, [], clearedEnv());
    expect(res.exitCode, `child threw:\n${res.stderr}`).toBe(0);
    const resolved = JSON.parse(res.stdout.trim().split("\n").pop() ?? "null");
    expect(resolved).toEqual(LITERAL_DEFAULT);
  }, 30_000);
});
