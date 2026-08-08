import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";

import {
  CONFIG_TYPES,
  LOADER,
  makeIsolatedConfigHome,
  removeIsolatedConfigHome,
  runIsolated,
  type IsolatedConfigHome,
} from "./isolated-config";

const WRITER = path.join(import.meta.dir, "..", "config-writer.ts");

let home: IsolatedConfigHome;

beforeEach(() => {
  home = makeIsolatedConfigHome();
});

afterEach(() => {
  removeIsolatedConfigHome(home);
});

function runWriter(
  name: string,
  source: string,
  extraEnv: Record<string, string> = {},
) {
  return runIsolated(home, name, source, [], extraEnv);
}

describe("config-writer: maskSensitive", () => {
  test("replaces security.apiKey, llm.apiKey, embedding.apiKey, database.url with sentinel", () => {
    const { exitCode, stdout, stderr } = runWriter(
      "mask-basic",
      `
      import { maskSensitive } from ${JSON.stringify(WRITER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};

      const cfg = {
        ...JSON.parse(JSON.stringify(defaultMassaAiConfig)),
        security: { apiKey: "real-key-123", corsOrigins: [] },
        llm: { ...defaultMassaAiConfig.llm, apiKey: "llm-secret" },
        embedding: { ...defaultMassaAiConfig.embedding, apiKey: "emb-secret" },
        database: { url: "postgres://user:pass@host/db" },
      };
      const masked = maskSensitive(cfg);
      console.log(JSON.stringify({
        apiKey: masked.security?.apiKey,
        llmKey: masked.llm?.apiKey,
        embKey: masked.embedding?.apiKey,
        dbUrl: masked.database?.url,
      }));
      `,
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.apiKey).toBe("***");
    expect(out.llmKey).toBe("***");
    expect(out.embKey).toBe("***");
    expect(out.dbUrl).toBe("***");
  });

  test("does not mask fields that are absent", () => {
    const { exitCode, stdout, stderr } = runWriter(
      "mask-absent",
      `
      import { maskSensitive } from ${JSON.stringify(WRITER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};

      const cfg = JSON.parse(JSON.stringify(defaultMassaAiConfig));
      // security has no apiKey by default
      const masked = maskSensitive(cfg);
      console.log(JSON.stringify({ apiKey: masked.security?.apiKey ?? "absent" }));
      `,
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.apiKey).toBe("absent");
  });
});

describe("config-writer: restartNeededSections", () => {
  test("returns restart sections present in config", () => {
    const { exitCode, stdout, stderr } = runWriter(
      "restart-present",
      `
      import { restartNeededSections } from ${JSON.stringify(WRITER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};

      const sections = restartNeededSections(defaultMassaAiConfig);
      console.log(JSON.stringify(sections));
      `,
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const sections = JSON.parse(stdout);
    expect(sections).toContain("embedding");
    expect(sections).toContain("llm");
    expect(sections).toContain("security");
  });

  test("database section is included when present", () => {
    const { exitCode, stdout, stderr } = runWriter(
      "restart-db",
      `
      import { restartNeededSections } from ${JSON.stringify(WRITER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};

      const sections = restartNeededSections({ ...defaultMassaAiConfig, database: { url: "x" } });
      console.log(JSON.stringify(sections));
      `,
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const sections = JSON.parse(stdout);
    expect(sections).toContain("database");
  });
});

describe("config-writer: savePartialConfig validation", () => {
  test("rejects bad embedding provider enum", () => {
    const { exitCode, stdout } = runWriter(
      "bad-provider",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};

      const result = savePartialConfig({
        embedding: { provider: "invalid" as any, model: "test", baseURL: "http://x", dimensions: 100 },
      });
      console.log(JSON.stringify(result));
      `,
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.details.length).toBeGreaterThan(0);
    expect(result.details.some((d: string) => d.includes("embedding.provider"))).toBe(true);
  });

  test("rejects bad logging level enum", () => {
    const { exitCode, stdout } = runWriter(
      "bad-level",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};

      const result = savePartialConfig({
        logging: { level: "verbose" as any, enableMetrics: false },
      });
      console.log(JSON.stringify(result));
      `,
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.details.some((d: string) => d.includes("logging.level"))).toBe(true);
  });

  test("rejects out-of-range targetCompressionRatio", () => {
    const { exitCode, stdout } = runWriter(
      "bad-ratio",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};

      const result = savePartialConfig({
        compression: { defaultStrategy: "code_structure", minTokensForCompression: 100, targetCompressionRatio: 2.5 },
      });
      console.log(JSON.stringify(result));
      `,
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.details.some((d: string) => d.includes("targetCompressionRatio"))).toBe(true);
  });

  test("rejects wrong type for boolean field", () => {
    const { exitCode, stdout } = runWriter(
      "bad-bool",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};

      const result = savePartialConfig({
        cache: { enabled: "yes" as any, l1MaxSizeMB: 100, l2MaxSizeMB: 500, defaultTTLSeconds: 3600 },
      });
      console.log(JSON.stringify(result));
      `,
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.details.some((d: string) => d.includes("cache.enabled"))).toBe(true);
  });

  test("rejects negative number for minTokensForCompression", () => {
    const { exitCode, stdout } = runWriter(
      "bad-negative",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};

      const result = savePartialConfig({
        compression: { defaultStrategy: "code_structure", minTokensForCompression: -5, targetCompressionRatio: 0.7 },
      });
      console.log(JSON.stringify(result));
      `,
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.details.some((d: string) => d.includes("minTokensForCompression"))).toBe(true);
  });

  test("never throws on validation failure — returns details[]", () => {
    const { exitCode, stdout, stderr } = runWriter(
      "no-throw",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};

      let threw = false;
      try {
        savePartialConfig({
          llm: { enabled: "not-a-bool" as any, baseUrl: "", apiKey: "", model: "", codeModel: "", temperature: "x" as any, maxOutputTokens: 0, timeoutMs: 0, disableThink: "yes" as any },
        });
      } catch {
        threw = true;
      }
      console.log(JSON.stringify({ threw }));
      `,
    );
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const out = JSON.parse(stdout);
    expect(out.threw).toBe(false);
  });
});

describe("config-writer: savePartialConfig backup + atomic write", () => {
  test("creates a backup file before writing", () => {
    // First write a config so there is something to back up
    const { exitCode: initExit } = runWriter(
      "init-config",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig(defaultMassaAiConfig);
      `,
    );
    expect(initExit).toBe(0);

    const { exitCode, stdout, stderr } = runWriter(
      "backup-create",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({
        logging: { level: "debug", enableMetrics: true },
      });
      console.log(JSON.stringify({ success: result.success }));
      `,
    );
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const out = JSON.parse(stdout);
    expect(out.success).toBe(true);

    const entries = fs.readdirSync(home.configDir);
    const backups = entries.filter((e) => e.startsWith("config.json.bak."));
    expect(backups.length).toBe(1);
  });

  test("atomic write: config.json is valid JSON after save", () => {
    const { exitCode } = runWriter(
      "init-2",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig(defaultMassaAiConfig);
      `,
    );
    expect(exitCode).toBe(0);

    const { exitCode: saveExit, stdout } = runWriter(
      "atomic-save",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({
        logging: { level: "warn", enableMetrics: false },
      });
      console.log(JSON.stringify({ success: result.success, level: result.success ? result.config.logging.level : null }));
      `,
    );
    expect(saveExit).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.success).toBe(true);
    expect(out.level).toBe("warn");

    const onDisk = JSON.parse(fs.readFileSync(home.configPath, "utf-8"));
    expect(onDisk.logging.level).toBe("warn");
  });
});

describe("config-writer: masked sentinel preserves existing value", () => {
  test("security.apiKey = '***' preserves the existing key", () => {
    // Seed a config with a known API key
    const { exitCode: seedExit } = runWriter(
      "seed-key",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig({ ...defaultMassaAiConfig, security: { apiKey: "original-key-xyz", corsOrigins: [] } });
      `,
    );
    expect(seedExit).toBe(0);

    const { exitCode, stdout } = runWriter(
      "sentinel-preserve",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({
        security: { apiKey: "***", corsOrigins: ["http://localhost:3000"] },
      });
      if (result.success) {
        console.log(JSON.stringify({ success: true, apiKey: result.config.security?.apiKey }));
      } else {
        console.log(JSON.stringify({ success: false, details: result.details }));
      }
      `,
    );
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.success).toBe(true);
    expect(out.apiKey).toBe("original-key-xyz");
  });

  test("llm.apiKey = '***' preserves the existing key", () => {
    const { exitCode: seedExit } = runWriter(
      "seed-llm",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig({ ...defaultMassaAiConfig, llm: { ...defaultMassaAiConfig.llm, apiKey: "llm-orig" } });
      `,
    );
    expect(seedExit).toBe(0);

    const { exitCode, stdout } = runWriter(
      "sentinel-llm",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};

      const result = savePartialConfig({
        llm: { ...defaultMassaAiConfig.llm, apiKey: "***" },
      });
      if (result.success) {
        console.log(JSON.stringify({ success: true, apiKey: result.config.llm?.apiKey }));
      } else {
        console.log(JSON.stringify({ success: false, details: result.details }));
      }
      `,
    );
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.success).toBe(true);
    expect(out.apiKey).toBe("llm-orig");
  });
});

describe("config-writer: import-time safety", () => {
  test("module never reads or writes at import time", () => {
    const { exitCode, stdout, stderr } = runWriter(
      "import-safety",
      `
      // Import the module and check that no config.json was created
      import { savePartialConfig, maskSensitive, restartNeededSections } from ${JSON.stringify(WRITER)};

      // Just importing should not touch the filesystem
      console.log(JSON.stringify({
        hasSavePartial: typeof savePartialConfig === "function",
        hasMask: typeof maskSensitive === "function",
        hasRestart: typeof restartNeededSections === "function",
      }));
      `,
    );
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const out = JSON.parse(stdout);
    expect(out.hasSavePartial).toBe(true);
    expect(out.hasMask).toBe(true);
    expect(out.hasRestart).toBe(true);

    // No config.json should have been created just by importing
    // The config dir may not even exist if nothing wrote to it
    if (fs.existsSync(home.configDir)) {
      const entries = fs.readdirSync(home.configDir);
      expect(entries).not.toContain("config.json");
    }
  });
});

describe("config-writer: savePartialConfig returns restartNeededSections", () => {
  test("result includes restartNeededSections filtered to present keys", () => {
    const { exitCode: seedExit } = runWriter(
      "seed-restart",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig(defaultMassaAiConfig);
      `,
    );
    expect(seedExit).toBe(0);

    const { exitCode, stdout } = runWriter(
      "restart-result",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({
        logging: { level: "info", enableMetrics: false },
      });
      if (result.success) {
        console.log(JSON.stringify({ success: true, restart: result.restartNeededSections }));
      }
      `,
    );
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.success).toBe(true);
    expect(out.restart).toContain("embedding");
    expect(out.restart).toContain("llm");
    expect(out.restart).toContain("security");
  });
});