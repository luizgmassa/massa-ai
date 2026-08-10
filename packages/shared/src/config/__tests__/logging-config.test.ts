/**
 * `logging` config resolution — buffer/rotation fields (T8 — LOG-02, spec AC 2/2b).
 *
 * Mirrors `scheduler-config.test.ts`'s subprocess-isolation approach: `file`,
 * `enableFileSink`, `bufferSize`, `maxFileSizeMb`, and `maxFiles` are resolved
 * once into a module-level object literal (`config/index.ts` `defaultConfig`),
 * so an in-process `process.env.X = …` or file write lands after the value is
 * frozen. Every case runs in a subprocess via the `isolated-config` harness,
 * which also gives the child an isolated `XDG_CONFIG_HOME` so a developer's
 * real `~/.config/massa-ai/config.json` never leaks into the resolved value.
 *
 * BINDING (pre-mortem #1): an empty or absent `logging.file` must resolve to
 * the default path, never to "disabled" — `enableFileSink: false` is the only
 * way to disable the sink. That is the single most important case this file
 * proves.
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
console.log(JSON.stringify({ logging: config.get("logging"), dataDir: config.get("dataDir") }));
`;

/** Every `MASSA_AI_LOG_*` var this resolution reads, blanked — a developer's
 *  real shell exporting one of these would otherwise leak into the child via
 *  `childEnv`'s `...inherited` spread. */
function clearedEnv(): Record<string, string> {
  return {
    MASSA_AI_LOG_FILE: "",
    MASSA_AI_LOG_ENABLE_FILE_SINK: "",
    MASSA_AI_LOG_BUFFER_SIZE: "",
    MASSA_AI_LOG_MAX_FILE_SIZE_MB: "",
    MASSA_AI_LOG_MAX_FILES: "",
  };
}

function writeConfig(home: IsolatedConfigHome, logging: unknown): void {
  fs.mkdirSync(home.configDir, { recursive: true });
  fs.writeFileSync(home.configPath, JSON.stringify({ logging }, null, 2));
}

interface ResolvedLogging {
  level: string;
  enableMetrics: boolean;
  file: string;
  enableFileSink: boolean;
  bufferSize: number;
  maxFileSizeMb: number;
  maxFiles: number;
}

function resolve(
  home: IsolatedConfigHome,
  name: string,
  env: Record<string, string> = clearedEnv(),
): { logging: ResolvedLogging; dataDir: string } {
  const res = runIsolated(home, name, CHILD, [], env);
  expect(res.exitCode, `child failed:\n${res.stderr}`).toBe(0);
  return JSON.parse(res.stdout.trim().split("\n").pop() ?? "null");
}

describe("logging config resolution — buffer/rotation fields (LOG-02)", () => {
  let home: IsolatedConfigHome;
  const origLogEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    home = makeIsolatedConfigHome("massa-ai-logging-cfg-");
    for (const k of Object.keys(clearedEnv())) origLogEnv[k] = process.env[k];
  });

  afterEach(() => {
    removeIsolatedConfigHome(home);
    for (const [k, v] of Object.entries(origLogEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  describe("logging.file default path (pre-mortem #1)", () => {
    test("no logging.file at all resolves to <dataDir>/logs/massa-ai.log", () => {
      writeConfig(home, undefined);
      const { logging, dataDir } = resolve(home, "absent");
      expect(logging.file).toBe(path.join(dataDir, "logs", "massa-ai.log"));
      expect(logging.enableFileSink).toBe(true);
    }, 30_000);

    test("no config.json at all resolves to the default path", () => {
      const { logging, dataDir } = resolve(home, "no-file");
      expect(logging.file).toBe(path.join(dataDir, "logs", "massa-ai.log"));
    }, 30_000);

    test("an explicit empty logging.file still resolves to the default path — NOT disabled", () => {
      writeConfig(home, { file: "" });
      const { logging, dataDir } = resolve(home, "empty-file");
      expect(logging.file).toBe(path.join(dataDir, "logs", "massa-ai.log"));
      // The sink must still be enabled — an in-band "" sentinel must never
      // disable it (the exact regression pre-mortem #1 describes).
      expect(logging.enableFileSink).toBe(true);
    }, 30_000);

    test("a non-empty logging.file in config.json wins over the default", () => {
      const explicit = path.join(home.scriptDir, "custom.log");
      writeConfig(home, { file: explicit });
      const { logging } = resolve(home, "config-file");
      expect(logging.file).toBe(explicit);
    }, 30_000);

    test("MASSA_AI_LOG_FILE env wins over both config.json and the default", () => {
      const envPath = path.join(home.scriptDir, "env.log");
      const configPath = path.join(home.scriptDir, "config.log");
      writeConfig(home, { file: configPath });
      const { logging } = resolve(home, "env-wins", {
        ...clearedEnv(),
        MASSA_AI_LOG_FILE: envPath,
      });
      expect(logging.file).toBe(envPath);
    }, 30_000);
  });

  describe("logging.enableFileSink — the only disable", () => {
    test("explicit enableFileSink:false in config.json disables the sink", () => {
      writeConfig(home, { enableFileSink: false });
      const { logging } = resolve(home, "config-disabled");
      expect(logging.enableFileSink).toBe(false);
      // Disabling must not clear the resolved path — it's a separate flag.
      expect(logging.file.length).toBeGreaterThan(0);
    }, 30_000);

    test("env MASSA_AI_LOG_ENABLE_FILE_SINK=false wins over config.json true", () => {
      writeConfig(home, { enableFileSink: true });
      const { logging } = resolve(home, "env-disabled", {
        ...clearedEnv(),
        MASSA_AI_LOG_ENABLE_FILE_SINK: "false",
      });
      expect(logging.enableFileSink).toBe(false);
    }, 30_000);

    test("neither set: literal default is enabled (true)", () => {
      writeConfig(home, undefined);
      const { logging } = resolve(home, "neither-sink");
      expect(logging.enableFileSink).toBe(true);
    }, 30_000);
  });

  describe("logging.bufferSize", () => {
    test("config-only", () => {
      writeConfig(home, { bufferSize: 500 });
      expect(resolve(home, "config-only").logging.bufferSize).toBe(500);
    }, 30_000);

    test("env-only", () => {
      writeConfig(home, undefined);
      const { logging } = resolve(home, "env-only", {
        ...clearedEnv(),
        MASSA_AI_LOG_BUFFER_SIZE: "999",
      });
      expect(logging.bufferSize).toBe(999);
    }, 30_000);

    test("both set: env wins", () => {
      writeConfig(home, { bufferSize: 500 });
      const { logging } = resolve(home, "both", {
        ...clearedEnv(),
        MASSA_AI_LOG_BUFFER_SIZE: "999",
      });
      expect(logging.bufferSize).toBe(999);
    }, 30_000);

    test("neither set: literal default (2000)", () => {
      writeConfig(home, undefined);
      expect(resolve(home, "neither").logging.bufferSize).toBe(2000);
    }, 30_000);
  });

  describe("logging.maxFileSizeMb", () => {
    test("config-only", () => {
      writeConfig(home, { maxFileSizeMb: 16 });
      expect(resolve(home, "config-only").logging.maxFileSizeMb).toBe(16);
    }, 30_000);

    test("env-only", () => {
      writeConfig(home, undefined);
      const { logging } = resolve(home, "env-only", {
        ...clearedEnv(),
        MASSA_AI_LOG_MAX_FILE_SIZE_MB: "64",
      });
      expect(logging.maxFileSizeMb).toBe(64);
    }, 30_000);

    test("both set: env wins", () => {
      writeConfig(home, { maxFileSizeMb: 16 });
      const { logging } = resolve(home, "both", {
        ...clearedEnv(),
        MASSA_AI_LOG_MAX_FILE_SIZE_MB: "64",
      });
      expect(logging.maxFileSizeMb).toBe(64);
    }, 30_000);

    test("neither set: literal default (32)", () => {
      writeConfig(home, undefined);
      expect(resolve(home, "neither").logging.maxFileSizeMb).toBe(32);
    }, 30_000);
  });

  describe("logging.maxFiles", () => {
    test("config-only", () => {
      writeConfig(home, { maxFiles: 3 });
      expect(resolve(home, "config-only").logging.maxFiles).toBe(3);
    }, 30_000);

    test("env-only", () => {
      writeConfig(home, undefined);
      const { logging } = resolve(home, "env-only", {
        ...clearedEnv(),
        MASSA_AI_LOG_MAX_FILES: "9",
      });
      expect(logging.maxFiles).toBe(9);
    }, 30_000);

    test("both set: env wins", () => {
      writeConfig(home, { maxFiles: 3 });
      const { logging } = resolve(home, "both", {
        ...clearedEnv(),
        MASSA_AI_LOG_MAX_FILES: "9",
      });
      expect(logging.maxFiles).toBe(9);
    }, 30_000);

    test("neither set: literal default (5)", () => {
      writeConfig(home, undefined);
      expect(resolve(home, "neither").logging.maxFiles).toBe(5);
    }, 30_000);
  });
});
