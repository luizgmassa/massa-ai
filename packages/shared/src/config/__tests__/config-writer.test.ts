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

describe("config-writer: changedRestartSections (APR-05)", () => {
  test("identical re-save reports no changed sections; a real change reports its section", () => {
    const { exitCode, stdout, stderr } = runWriter(
      "diff-sections",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};

      // loadConfig() materializes full defaults, so the meaningful diff is
      // against the EFFECTIVE config: saving default-equal values is not a
      // change; only a real value edit is.
      const embedding = { provider: "ollama", model: "qwen3-embedding:4b", baseURL: "http://localhost:11434", dimensions: 1024 };
      const first = savePartialConfig({ embedding });               // 2560 (default) → 1024
      const resave = savePartialConfig({ embedding: { ...embedding } });
      const changed = savePartialConfig({ embedding: { ...embedding, dimensions: 2560 } });
      console.log(JSON.stringify({
        first: first.success && first.changedRestartSections,
        resave: resave.success && resave.changedRestartSections,
        changed: changed.success && changed.changedRestartSections,
      }));
      `,
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.first).toEqual(["embedding"]);   // default → non-default IS a change
    expect(out.resave).toEqual([]);             // byte-identical re-save: no restart proposal
    expect(out.changed).toEqual(["embedding"]);
  });

  test("a masked-sentinel echo is not a change (unmask runs before the diff)", () => {
    const { exitCode, stdout, stderr } = runWriter(
      "diff-masked-echo",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};

      // validatePartial requires the full llm field set — extend the default.
      const llm = { ...defaultMassaAiConfig.llm, apiKey: "real-secret" };
      savePartialConfig({ llm });
      // The UI round-trips the masked value verbatim — must diff as unchanged.
      const echo = savePartialConfig({ llm: { ...llm, apiKey: "***" } });
      const real = savePartialConfig({ llm: { ...llm, apiKey: "rotated" } });
      console.log(JSON.stringify({
        echo: echo.success && echo.changedRestartSections,
        real: real.success && real.changedRestartSections,
      }));
      `,
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.echo).toEqual([]);
    expect(out.real).toEqual(["llm"]);
  });

  test("key order alone is not a change (structural compare, not serialized)", () => {
    const { exitCode, stdout, stderr } = runWriter(
      "diff-key-order",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};

      savePartialConfig({ database: { url: "postgres://h/db" } });
      const reordered = savePartialConfig({ database: JSON.parse('{"url":"postgres://h/db"}') });
      console.log(JSON.stringify({ reordered: reordered.success && reordered.changedRestartSections }));
      `,
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).reordered).toEqual([]);
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

describe("config-writer: masked sentinel against an empty stored value (APCR-05, F7)", () => {
  test("security.apiKey = '***' against an absent stored key does not persist the literal sentinel", () => {
    // defaultMassaAiConfig.security carries no apiKey at all.
    const { exitCode: seedExit } = runWriter(
      "seed-empty-security",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig(defaultMassaAiConfig);
      `,
    );
    expect(seedExit).toBe(0);

    const { exitCode, stdout } = runWriter(
      "sentinel-empty-security",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({
        security: { apiKey: "***", corsOrigins: [] },
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
    expect(out.apiKey).not.toBe("***");
  });

  test("llm.apiKey = '***' against an empty stored key does not persist the literal sentinel", () => {
    const { exitCode: seedExit } = runWriter(
      "seed-empty-llm",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig({ ...defaultMassaAiConfig, llm: { ...defaultMassaAiConfig.llm, apiKey: "" } });
      `,
    );
    expect(seedExit).toBe(0);

    const { exitCode, stdout } = runWriter(
      "sentinel-empty-llm",
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
    expect(out.apiKey).not.toBe("***");
  });

  test("embedding.apiKey = '***' against an absent stored key does not persist the literal sentinel", () => {
    // defaultMassaAiConfig.embedding carries no apiKey at all.
    const { exitCode: seedExit } = runWriter(
      "seed-empty-embedding",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig(defaultMassaAiConfig);
      `,
    );
    expect(seedExit).toBe(0);

    const { exitCode, stdout } = runWriter(
      "sentinel-empty-embedding",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};

      const result = savePartialConfig({
        embedding: { ...defaultMassaAiConfig.embedding, apiKey: "***" },
      });
      if (result.success) {
        console.log(JSON.stringify({ success: true, apiKey: result.config.embedding?.apiKey }));
      } else {
        console.log(JSON.stringify({ success: false, details: result.details }));
      }
      `,
    );
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.success).toBe(true);
    expect(out.apiKey).not.toBe("***");
  });

  test("database.url = '***' against the empty default url does not persist the literal sentinel", () => {
    // defaultMassaAiConfig.database.url defaults to "" — the exact shape the audit
    // named: a save with security.apiKey = "***" against a current value of "" is the
    // Independent Test's fixture.
    const { exitCode: seedExit } = runWriter(
      "seed-empty-database",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig(defaultMassaAiConfig);
      `,
    );
    expect(seedExit).toBe(0);

    const { exitCode, stdout } = runWriter(
      "sentinel-empty-database",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({
        database: { url: "***" },
      });
      if (result.success) {
        console.log(JSON.stringify({ success: true, url: result.config.database?.url }));
      } else {
        console.log(JSON.stringify({ success: false, details: result.details }));
      }
      `,
    );
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.success).toBe(true);
    expect(out.url).not.toBe("***");
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

// ── T4: scheduler save validation and restart section (SCH-04, SCH-05, SCH-07) ──

describe("config-writer: scheduler validation bounds (SCH-04)", () => {
  test("rejects tickMs below 1000, naming scheduler.tickMs", () => {
    const { exitCode, stdout } = runWriter(
      "scheduler-bad-tickms",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({ scheduler: { tickMs: 999 } });
      console.log(JSON.stringify(result));
      `,
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.details.some((d: string) => d.includes("scheduler.tickMs"))).toBe(true);
  });

  test("rejects maxConcurrent below 1, naming scheduler.maxConcurrent", () => {
    const { exitCode, stdout } = runWriter(
      "scheduler-bad-maxconcurrent",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({ scheduler: { maxConcurrent: 0 } });
      console.log(JSON.stringify(result));
      `,
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.details.some((d: string) => d.includes("scheduler.maxConcurrent"))).toBe(true);
  });

  test("rejects an intervalMs below 60000, naming the offending job path", () => {
    const { exitCode, stdout } = runWriter(
      "scheduler-bad-interval",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({
        scheduler: { jobs: { "decay-sweep": { intervalMs: 59999 } } },
      });
      console.log(JSON.stringify(result));
      `,
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.details.some((d: string) => d.includes("scheduler.jobs.decay-sweep.intervalMs"))).toBe(true);
  });

  test("rejects an unknown scheduler.jobs key, naming that key", () => {
    const { exitCode, stdout } = runWriter(
      "scheduler-bad-job-key",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({
        scheduler: { jobs: { "not-a-real-kind": { enabled: true } } },
      });
      console.log(JSON.stringify(result));
      `,
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.details.some((d: string) => d.includes("scheduler.jobs.not-a-real-kind"))).toBe(true);
  });

  test("accepts values at the exact bounds (1000, 1, 60000)", () => {
    const { exitCode, stdout } = runWriter(
      "scheduler-boundary-ok",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({
        scheduler: {
          enabled: true,
          tickMs: 1000,
          maxConcurrent: 1,
          jobs: { "checkpoint-purge": { enabled: true, intervalMs: 60000 } },
        },
      });
      console.log(JSON.stringify({ success: result.success }));
      `,
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).success).toBe(true);
  });

  test("a rejected scheduler save leaves config.json byte-unchanged", () => {
    const { exitCode: seedExit } = runWriter(
      "scheduler-reject-seed",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig(defaultMassaAiConfig);
      `,
    );
    expect(seedExit).toBe(0);

    const before = fs.readFileSync(home.configPath, "utf-8");

    const { exitCode, stdout } = runWriter(
      "scheduler-reject-save",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({ scheduler: { tickMs: 1 } });
      console.log(JSON.stringify({ success: result.success }));
      `,
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).success).toBe(false);

    const after = fs.readFileSync(home.configPath, "utf-8");
    expect(after).toBe(before);

    // No backup should have been created for a rejected save either.
    const entries = fs.readdirSync(home.configDir);
    expect(entries.filter((e) => e.startsWith("config.json.bak."))).toEqual([]);
  });
});

describe("config-writer: scheduler restart section (SCH-07)", () => {
  test("restartNeededSections includes scheduler whenever the key is present", () => {
    const { exitCode, stdout } = runWriter(
      "scheduler-restart-present",
      `
      import { restartNeededSections } from ${JSON.stringify(WRITER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      const sections = restartNeededSections({ ...defaultMassaAiConfig, scheduler: { enabled: true } });
      console.log(JSON.stringify(sections));
      `,
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toContain("scheduler");
  });

  test("changedRestartSections includes scheduler on a real change and excludes it on an unchanged re-save", () => {
    const { exitCode, stdout, stderr } = runWriter(
      "scheduler-changed-sections",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};

      const scheduler = { enabled: true, tickMs: 30000 };
      const first = savePartialConfig({ scheduler });
      const resave = savePartialConfig({ scheduler: { ...scheduler } });
      const changed = savePartialConfig({ scheduler: { ...scheduler, tickMs: 45000 } });
      console.log(JSON.stringify({
        first: first.success && first.changedRestartSections,
        resave: resave.success && resave.changedRestartSections,
        changed: changed.success && changed.changedRestartSections,
      }));
      `,
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.first).toContain("scheduler");
    expect(out.resave).toEqual([]);
    expect(out.changed).toContain("scheduler");
  });
});

// ── APCR-08: secret files are owner-only, backups bounded ────────────────

/** POSIX file mode bits, ignoring the file-type bits `fs.Stats.mode` also carries. */
function modeOf(p: string): number {
  return fs.statSync(p).mode & 0o777;
}

describe("config-writer: secret file modes (APCR-08.1, 08.5)", () => {
  test("config.json is 0600 after a save", () => {
    const { exitCode, stdout } = runWriter(
      "mode-config",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      const result = savePartialConfig({ logging: { level: "debug", enableMetrics: true } });
      console.log(JSON.stringify({ success: result.success }));
      `,
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).success).toBe(true);
    expect(modeOf(home.configPath)).toBe(0o600);
  });

  test("every backup created by a save is 0600", () => {
    const { exitCode: seedExit } = runWriter(
      "mode-backup-seed",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig(defaultMassaAiConfig);
      `,
    );
    expect(seedExit).toBe(0);

    const { exitCode } = runWriter(
      "mode-backup-save",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      savePartialConfig({ logging: { level: "warn", enableMetrics: false } });
      `,
    );
    expect(exitCode).toBe(0);

    const entries = fs.readdirSync(home.configDir);
    const backups = entries.filter((e) => e.startsWith("config.json.bak."));
    expect(backups.length).toBeGreaterThan(0);
    for (const b of backups) {
      expect(modeOf(path.join(home.configDir, b))).toBe(0o600);
    }
  });
});

describe("config-writer: existing over-permissive files are repaired on the next save (APCR-08.3)", () => {
  test("a pre-existing 644 config.json is tightened to 0600 by the next save", () => {
    const { exitCode: seedExit } = runWriter(
      "repair-config-seed",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig(defaultMassaAiConfig);
      `,
    );
    expect(seedExit).toBe(0);

    fs.chmodSync(home.configPath, 0o644);
    expect(modeOf(home.configPath)).toBe(0o644);

    const { exitCode } = runWriter(
      "repair-config-save",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      savePartialConfig({ logging: { level: "info", enableMetrics: true } });
      `,
    );
    expect(exitCode).toBe(0);
    expect(modeOf(home.configPath)).toBe(0o600);
  });

  test("a planted 644 legacy config.json.bak is tightened to 0600 and survives (never deleted)", () => {
    const { exitCode: seedExit } = runWriter(
      "repair-legacy-seed",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig(defaultMassaAiConfig);
      `,
    );
    expect(seedExit).toBe(0);

    const legacyBackupPath = `${home.configPath}.bak`;
    fs.copyFileSync(home.configPath, legacyBackupPath);
    fs.chmodSync(legacyBackupPath, 0o644);
    expect(modeOf(legacyBackupPath)).toBe(0o644);

    const { exitCode } = runWriter(
      "repair-legacy-save",
      `
      import { savePartialConfig } from ${JSON.stringify(WRITER)};
      savePartialConfig({ logging: { level: "debug", enableMetrics: false } });
      `,
    );
    expect(exitCode).toBe(0);
    expect(fs.existsSync(legacyBackupPath)).toBe(true);
    expect(modeOf(legacyBackupPath)).toBe(0o600);
  });
});

describe("config-writer: backup retention caps at 10, the legacy .bak is exempt (APCR-08.4)", () => {
  test("an 11th save leaves exactly 10 timestamped backups; the legacy .bak (if present) survives untouched by the cap", () => {
    const { exitCode: seedExit } = runWriter(
      "retention-seed",
      `
      import { saveConfig } from ${JSON.stringify(LOADER)};
      import { defaultMassaAiConfig } from ${JSON.stringify(CONFIG_TYPES)};
      saveConfig(defaultMassaAiConfig);
      `,
    );
    expect(seedExit).toBe(0);

    const legacyBackupPath = `${home.configPath}.bak`;
    fs.writeFileSync(legacyBackupPath, "{}");

    // 11 separate subprocess saves — each a real process invocation, so the
    // ISO-millisecond backup filenames cannot collide the way 11 saves in a
    // tight in-process loop could.
    for (let i = 0; i < 11; i++) {
      const { exitCode } = runWriter(
        `retention-save-${i}`,
        `
        import { savePartialConfig } from ${JSON.stringify(WRITER)};
        const result = savePartialConfig({ logging: { level: "info", enableMetrics: ${i % 2 === 0} } });
        if (!result.success) { console.error(JSON.stringify(result.details)); process.exit(1); }
        `,
      );
      expect(exitCode).toBe(0);
    }

    const entries = fs.readdirSync(home.configDir);
    const timestamped = entries.filter((e) => e.startsWith("config.json.bak."));
    expect(timestamped.length).toBe(10);
    expect(fs.existsSync(legacyBackupPath)).toBe(true);
  });
});