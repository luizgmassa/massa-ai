/**
 * config-loader unit tests.
 * Uses spyOn on the real `fs` module to control what the loader sees, so we
 * never touch the real ~/.config/massa-ai/config.json. The module-level
 * CONFIG_DIR/CONFIG_FILE constants freeze at eval to the real XDG path; we
 * intercept fs operations on that path via spies.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

import {
  getConfigDir,
  getConfigPath,
  configExists,
  loadConfig,
  loadConfigSafe,
  saveConfig,
  initConfig,
  getConfigForEnv,
  migrateDataDirOnce,
  __resetMigrationForTests,
} from "../config-loader";
import { defaultMassaAiConfig } from "../massa-ai-config";

const CONFIG_PATH = getConfigPath();
const CONFIG_DIR = getConfigDir();

let existsSpy: ReturnType<typeof spyOn>;
let readSpy: ReturnType<typeof spyOn>;
let writeSpy: ReturnType<typeof spyOn>;
let mkdirSpy: ReturnType<typeof spyOn>;
let renameSpy: ReturnType<typeof spyOn>;

// In-memory virtual file store keyed by absolute path.
let vfs: Map<string, string> = new Map();
// Set of paths that "exist" (files + dirs).
let existing: Set<string> = new Set();

function resetVfs() {
  vfs = new Map();
  existing = new Set();
}

beforeEach(() => {
  resetVfs();
  existsSpy = spyOn(fs, "existsSync").mockImplementation((p: any) => existing.has(String(p)));
  readSpy = spyOn(fs, "readFileSync").mockImplementation((p: any) => {
    const key = String(p);
    if (!existing.has(key)) { const e = new Error(`ENOENT: ${key}`); (e as any).code = "ENOENT"; throw e; }
    return vfs.get(key) ?? "";
  });
  writeSpy = spyOn(fs, "writeFileSync").mockImplementation((p: any, data: any) => {
    const key = String(p);
    vfs.set(key, String(data));
    existing.add(key);
  });
  mkdirSpy = spyOn(fs, "mkdirSync").mockImplementation((p: any) => {
    existing.add(String(p));
    return String(p);
  });
  renameSpy = spyOn(fs, "renameSync").mockImplementation((from: any, to: any) => {
    const fromKey = String(from);
    const toKey = String(to);
    if (!existing.has(fromKey)) { const e = new Error(`ENOENT: ${fromKey}`); (e as any).code = "ENOENT"; throw e; }
    // Move the dir marker and all child files (vfs entries under fromKey).
    existing.delete(fromKey);
    existing.add(toKey);
    const prefix = fromKey + path.sep;
    for (const [k, v] of vfs.entries()) {
      if (k === fromKey || k.startsWith(prefix)) {
        const moved = k === fromKey ? toKey : toKey + k.slice(fromKey.length);
        vfs.set(moved, v);
        existing.delete(k);
        existing.add(moved);
        vfs.delete(k);
      }
    }
  });

  // Reset the module-level one-shot guard so each migration scenario observes
  // a fresh first call. The import-time migrateDataDirOnce() (env.ts) pre-sets
  // it in the shared suite; this seam restores deterministic isolation without
  // weakening the production one-shot semantics.
  __resetMigrationForTests();
});

afterEach(() => {
  existsSpy.mockRestore();
  readSpy.mockRestore();
  writeSpy.mockRestore();
  mkdirSpy.mockRestore();
  renameSpy.mockRestore();
});

describe("config-loader path helpers", () => {
  test("getConfigDir returns a string ending in massa-ai", () => {
    expect(getConfigDir()).toBe(CONFIG_DIR);
    expect(CONFIG_DIR.endsWith("massa-ai")).toBe(true);
  });

  test("getConfigPath returns config.json inside config dir", () => {
    expect(getConfigPath()).toBe(path.join(CONFIG_DIR, "config.json"));
  });
});

describe("configExists / loadConfig (no file)", () => {
  test("configExists false when no config.json", () => {
    expect(configExists()).toBe(false);
  });

  test("loadConfig returns defaults when no file exists", () => {
    expect(loadConfig()).toEqual(defaultMassaAiConfig);
  });

  test("loadConfigSafe returns defaults when no file exists", () => {
    expect(loadConfigSafe()).toEqual(defaultMassaAiConfig);
  });
});

describe("saveConfig / loadConfig (with file)", () => {
  test("saveConfig writes file (creates dir), loadConfig reads it back", () => {
    const cfg = { ...defaultMassaAiConfig, dataDir: "/custom/data" };
    saveConfig(cfg);
    expect(configExists()).toBe(true);
    const loaded = loadConfig();
    expect(loaded.dataDir).toBe("/custom/data");
  });

  test("loadConfig merges nested blocks over defaults", () => {
    const partial: any = {
      logging: { level: "debug", enableMetrics: true },
      database: { url: "postgres://x" },
    };
    saveConfig(partial);
    const loaded = loadConfig();
    expect(loaded.logging.level).toBe("debug");
    expect(loaded.logging.enableMetrics).toBe(true);
    expect(loaded.database.url).toBe("postgres://x");
    expect(loaded.cache.enabled).toBe(defaultMassaAiConfig.cache.enabled);
  });

  test("loadConfig merges partial nested sub-fields (embedding)", () => {
    const partial: any = { embedding: { model: "custom-embed" } };
    saveConfig(partial);
    const loaded = loadConfig();
    expect(loaded.embedding.model).toBe("custom-embed");
    expect(loaded.embedding.provider).toBe(defaultMassaAiConfig.embedding.provider);
  });

  test("loadConfig returns defaults on JSON parse error", () => {
    vfs.set(CONFIG_PATH, "{ invalid json");
    existing.add(CONFIG_PATH);
    const cfg = loadConfig();
    expect(cfg).toEqual(defaultMassaAiConfig);
  });

  test("loadConfigSafe returns defaults on JSON parse error", () => {
    vfs.set(CONFIG_PATH, "not json");
    existing.add(CONFIG_PATH);
    expect(loadConfigSafe()).toEqual(defaultMassaAiConfig);
  });
});

describe("security section (SEC-01 storage)", () => {
  test("defaults carry an empty corsOrigins and no apiKey", () => {
    expect(defaultMassaAiConfig.security).toEqual({ corsOrigins: [] });
    expect(defaultMassaAiConfig.security?.apiKey).toBeUndefined();
  });

  test("a partial security block merges over the defaults instead of replacing it", () => {
    // Discriminating case. Without an explicit `security` merge line in
    // loadConfig, the top-level `...userConfig` spread replaces the whole
    // section and the default corsOrigins vanishes — which is how a
    // provisioned apiKey would later drop a co-resident setting on save.
    saveConfig({ security: { apiKey: "provisioned-key" } } as any);
    const loaded = loadConfig();
    expect(loaded.security?.apiKey).toBe("provisioned-key");
    expect(loaded.security?.corsOrigins).toEqual([]);
  });

  test("a stored corsOrigins list survives a load/save/reload round-trip", () => {
    saveConfig({ security: { corsOrigins: ["http://localhost:5173"] } } as any);
    const first = loadConfig();
    saveConfig(first);
    const second = loadConfig();
    expect(second.security?.corsOrigins).toEqual(["http://localhost:5173"]);
    expect(second.security?.apiKey).toBeUndefined();
  });

  test("a config.json with no security section still loads the default section", () => {
    saveConfig({ logging: { level: "debug", enableMetrics: false } } as any);
    const loaded = loadConfig();
    expect(loaded.security).toEqual({ corsOrigins: [] });
    expect(loaded.cache.enabled).toBe(defaultMassaAiConfig.cache.enabled);
  });
});

describe("saveConfig atomicity (SEC-01 concurrent provisioning)", () => {
  test("writes a temp file in the config dir and renames it over the target", () => {
    saveConfig(defaultMassaAiConfig);

    const written = writeSpy.mock.calls.map((c) => String(c[0]));
    expect(written).toHaveLength(1);
    const tmpPath = written[0]!;
    // rename(2) is only atomic within one filesystem, so the temp file must be
    // a sibling of the target, never in os.tmpdir().
    expect(tmpPath).not.toBe(CONFIG_PATH);
    expect(path.dirname(tmpPath)).toBe(CONFIG_DIR);

    const renames = renameSpy.mock.calls.map((c) => [String(c[0]), String(c[1])]);
    expect(renames).toEqual([[tmpPath, CONFIG_PATH]]);
  });

  test("the temp path differs between calls so concurrent writers cannot collide", () => {
    saveConfig(defaultMassaAiConfig);
    saveConfig(defaultMassaAiConfig);
    const [first, second] = writeSpy.mock.calls.map((c) => String(c[0]));
    expect(first).not.toBe(second);
  });

  test("a failed rename removes the temp file and rethrows", () => {
    const unlinkSpy = spyOn(fs, "unlinkSync").mockImplementation((p: any) => {
      existing.delete(String(p));
      vfs.delete(String(p));
    });
    renameSpy.mockImplementation(() => {
      const e = new Error("EACCES: permission denied");
      (e as any).code = "EACCES";
      throw e;
    });

    try {
      expect(() => saveConfig(defaultMassaAiConfig)).toThrow(/EACCES/);
      const tmpPath = String(writeSpy.mock.calls[0]![0]);
      expect(unlinkSpy.mock.calls.map((c) => String(c[0]))).toEqual([tmpPath]);
      expect(existing.has(tmpPath)).toBe(false);
      // The live config was never touched.
      expect(existing.has(CONFIG_PATH)).toBe(false);
    } finally {
      unlinkSpy.mockRestore();
    }
  });
});

describe("initConfig", () => {
  test("creates default config when none exists", () => {
    expect(configExists()).toBe(false);
    initConfig();
    expect(configExists()).toBe(true);
    const loaded = loadConfig();
    expect(loaded).toEqual(defaultMassaAiConfig);
  });

  test("does not overwrite an existing config", () => {
    const custom = { ...defaultMassaAiConfig, dataDir: "/keep-me" };
    saveConfig(custom);
    initConfig();
    const loaded = loadConfig();
    expect(loaded.dataDir).toBe("/keep-me");
  });
});

describe("getConfigForEnv", () => {
  test("ollama provider sets OLLAMA_* env vars (with dimensions)", () => {
    const cfg = { ...defaultMassaAiConfig };
    cfg.embedding = {
      provider: "ollama", model: "nomic-embed", baseURL: "http://ollama:11434", dimensions: 512,
    };
    saveConfig(cfg);
    const env = getConfigForEnv();
    expect(env.OLLAMA_EMBEDDING_MODEL).toBe("nomic-embed");
    expect(env.OLLAMA_BASE_URL).toBe("http://ollama:11434");
    expect(env.OLLAMA_EMBEDDING_DIMENSIONS).toBe("512");
  });

  test("ollama provider with dimensions=0 omits OLLAMA_EMBEDDING_DIMENSIONS (falsy)", () => {
    const cfg = { ...defaultMassaAiConfig };
    cfg.embedding = { provider: "ollama", model: "nomic-embed", baseURL: "http://ollama:11434", dimensions: 0 };
    saveConfig(cfg);
    const env = getConfigForEnv();
    expect(env.OLLAMA_EMBEDDING_DIMENSIONS).toBeUndefined();
  });

  test("ollama provider without baseURL defaults to localhost:11434", () => {
    const cfg = { ...defaultMassaAiConfig };
    cfg.embedding = { provider: "ollama", model: "x" };
    saveConfig(cfg);
    const env = getConfigForEnv();
    expect(env.OLLAMA_BASE_URL).toBe("http://localhost:11434");
  });

  test("mistral provider sets MISTRAL_* env vars (with apiKey)", () => {
    const cfg = { ...defaultMassaAiConfig };
    cfg.embedding = { provider: "mistral", model: "mistral-embed", apiKey: "mk" };
    saveConfig(cfg);
    const env = getConfigForEnv();
    expect(env.MISTRAL_API_KEY).toBe("mk");
    expect(env.MISTRAL_TEXT_EMBEDDING_MODEL).toBe("mistral-embed");
  });

  test("mistral provider without apiKey sets empty string", () => {
    const cfg = { ...defaultMassaAiConfig };
    cfg.embedding = { provider: "mistral", model: "mistral-embed" };
    saveConfig(cfg);
    const env = getConfigForEnv();
    expect(env.MISTRAL_API_KEY).toBe("");
  });

  test("openai provider sets OPENAI_* env vars (with apiKey)", () => {
    const cfg = { ...defaultMassaAiConfig };
    cfg.embedding = { provider: "openai", model: "text-embedding-3", apiKey: "sk" };
    saveConfig(cfg);
    const env = getConfigForEnv();
    expect(env.OPENAI_API_KEY).toBe("sk");
    expect(env.OPENAI_EMBEDDING_MODEL).toBe("text-embedding-3");
  });

  test("openai provider without apiKey sets empty string", () => {
    const cfg = { ...defaultMassaAiConfig };
    cfg.embedding = { provider: "openai", model: "text-embedding-3" };
    saveConfig(cfg);
    const env = getConfigForEnv();
    expect(env.OPENAI_API_KEY).toBe("");
  });

  test("always sets LOG_LEVEL and ENABLE_METRICS", () => {
    const cfg = { ...defaultMassaAiConfig, logging: { level: "warn", enableMetrics: true } };
    saveConfig(cfg);
    const env = getConfigForEnv();
    expect(env.LOG_LEVEL).toBe("warn");
    expect(env.ENABLE_METRICS).toBe("true");
  });
});

describe("migrateDataDirOnce", () => {
  // Each test gets a fresh one-shot guard via __resetMigrationForTests() in
  // beforeEach, so every scenario is self-contained and deterministic. All fs
  // access is intercepted by the spies (vfs), so no test touches the real user
  // home dir.

  const OLD_DIR = path.join(os.homedir(), ".massa-ai-data");
  const NEW_DIR = path.join(getConfigDir(), "data");

  test("first call migrates old dir -> new dir when old exists and new absent", () => {
    // set up old dir with a file
    existing.add(OLD_DIR);
    vfs.set(path.join(OLD_DIR, "f.txt"), "content");
    existing.add(path.join(OLD_DIR, "f.txt"));
    expect(existing.has(NEW_DIR)).toBe(false);

    migrateDataDirOnce();

    // renameSync spy moves it: new dir now exists, old gone
    expect(existing.has(NEW_DIR)).toBe(true);
    expect(existing.has(OLD_DIR)).toBe(false);
    expect(vfs.get(path.join(NEW_DIR, "f.txt"))).toBe("content");
  });

  test("idempotent: second call is a no-op (never throws, no changes)", () => {
    // Set up old dir so the first call performs a real migration.
    existing.add(OLD_DIR);
    existing.add(path.join(OLD_DIR, "f.txt"));
    vfs.set(path.join(OLD_DIR, "f.txt"), "content");

    migrateDataDirOnce();
    expect(existing.has(NEW_DIR)).toBe(true);

    // Second call: the one-shot guard is set -> no work, no throw.
    const before = new Map(vfs);
    expect(() => migrateDataDirOnce()).not.toThrow();
    expect(vfs).toEqual(before);
  });

  test("no-op when old dir absent (nothing to migrate)", () => {
    expect(existing.has(OLD_DIR)).toBe(false);
    const before = new Map(vfs);
    expect(() => migrateDataDirOnce()).not.toThrow();
    expect(vfs).toEqual(before);
    expect(existing.has(NEW_DIR)).toBe(false);
  });

  test("no-op when new dir already exists (already migrated / user-created)", () => {
    // Both old and new present -> target exists guard returns early, no rename.
    existing.add(OLD_DIR);
    existing.add(NEW_DIR);
    const before = new Map(vfs);
    expect(() => migrateDataDirOnce()).not.toThrow();
    expect(vfs).toEqual(before);
    expect(existing.has(OLD_DIR)).toBe(true);
  });

  test("rename failure (e.g. EXDEV) logs a manual-move instruction, never throws", () => {
    existing.add(OLD_DIR);
    // Force the atomic rename to fail with a cross-volume-style error.
    renameSpy.mockImplementation(() => {
      const e = new Error("cross-device link not permitted");
      (e as any).code = "EXDEV";
      throw e;
    });

    const warnSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => migrateDataDirOnce()).not.toThrow();
      // Manual-move instruction surfaced (old + new paths + mv hint).
      const messages = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(messages.some((m) => m.includes(OLD_DIR) && m.includes(NEW_DIR))).toBe(true);
      expect(messages.some((m) => m.includes("mv"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("outer catch never aborts startup when an unexpected error occurs (e.g. mkdir throws)", () => {
    existing.add(OLD_DIR);
    // mkdirSync (parent of new dir) throws -> the outer try/catch must swallow it.
    mkdirSpy.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const warnSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => migrateDataDirOnce()).not.toThrow();
      expect(
        warnSpy.mock.calls.some((c) => String(c[0]).includes("Data directory migration skipped")),
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });
});