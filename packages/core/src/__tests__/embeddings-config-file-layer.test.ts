import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

/**
 * config.json `embedding` block wiring (env > config.json > default).
 *
 * The provider map in services/embeddings/config.ts is built from
 * process.env + loadConfigSafe() at MODULE LOAD, so the file layer cannot be
 * varied in-process after import. Each case therefore spawns a fresh bun
 * child with a scratch XDG_CONFIG_HOME (the same isolation CLAUDE.md
 * prescribes for config-sensitive suites) and reads the resolved entries
 * back as JSON. No mock.module, no process-global mutation in this process.
 */

const CONFIG_MODULE = path.resolve(import.meta.dir, "../services/embeddings/config.ts");
const CORE_DIR = path.resolve(import.meta.dir, "../..");

// Env vars that feed the entries under test — cleared in every child so the
// developer's shell (or CI job) cannot leak into the resolution.
const CLEARED_ENV = [
  "EMBEDDING_PROVIDER",
  "OLLAMA_EMBEDDING_MODEL",
  "OLLAMA_EMBEDDING_DIMENSIONS",
  "OLLAMA_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_EMBEDDING_MODEL",
  "MISTRAL_API_KEY",
];

interface Resolved {
  first: string;
  ollama: { model: string; dimensions: number; priority: number; baseURL?: string };
  openai: { model: string; dimensions: number; priority: number; apiKey?: string };
}

function resolveWith(
  embedding: Record<string, unknown> | undefined,
  extraEnv: Record<string, string> = {},
): Resolved {
  const xdg = mkdtempSync(path.join(tmpdir(), "massa-embed-cfg-"));
  if (embedding !== undefined) {
    const dir = path.join(xdg, "massa-ai");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ embedding }));
  }
  const script = [
    `const { embeddingProviders, getProvidersByPriority } = await import(${JSON.stringify(CONFIG_MODULE)});`,
    `console.log("RESOLVED:" + JSON.stringify({`,
    `  first: getProvidersByPriority()[0][0],`,
    `  ollama: embeddingProviders.ollama,`,
    `  openai: embeddingProviders.openai,`,
    `}));`,
  ].join("\n");
  const env: Record<string, string | undefined> = {
    ...process.env,
    XDG_CONFIG_HOME: xdg,
    ...extraEnv,
  };
  for (const key of CLEARED_ENV) {
    if (!(key in extraEnv)) delete env[key];
  }
  const child = Bun.spawnSync([process.execPath, "-e", script], {
    cwd: CORE_DIR,
    env: env as Record<string, string>,
  });
  const stdout = child.stdout.toString();
  const line = stdout.split("\n").find((l) => l.startsWith("RESOLVED:"));
  if (!line) {
    throw new Error(
      `child produced no RESOLVED line.\nstdout: ${stdout}\nstderr: ${child.stderr.toString()}`,
    );
  }
  return JSON.parse(line.slice("RESOLVED:".length)) as Resolved;
}

describe("embeddings config: config.json file layer", () => {
  test("no config file → literal defaults, ollama first (also guards shared-default alignment)", () => {
    const r = resolveWith(undefined);
    expect(r.first).toBe("ollama");
    // These double as the alignment sensor: with no user file, loadConfigSafe
    // returns defaultMassaAiConfig, so a drifted shared embedding default
    // would surface here as a wrong model/dims.
    expect(r.ollama.model).toBe("qwen3-embedding:4b");
    expect(r.ollama.dimensions).toBe(2560);
    expect(r.ollama.priority).toBe(1);
  }, 30_000);

  test("file block (ollama) supplies model/dimensions when env is silent", () => {
    const r = resolveWith({
      provider: "ollama",
      model: "qwen3-embedding-4b-ctx8k",
      dimensions: 2560,
    });
    expect(r.ollama.model).toBe("qwen3-embedding-4b-ctx8k");
    expect(r.ollama.dimensions).toBe(2560);
    expect(r.first).toBe("ollama");
  }, 30_000);

  test("explicit env var still beats the file block per field", () => {
    const r = resolveWith(
      { provider: "ollama", model: "qwen3-embedding-4b-ctx8k", dimensions: 2560 },
      { OLLAMA_EMBEDDING_MODEL: "env-wins-model" },
    );
    expect(r.ollama.model).toBe("env-wins-model");
    // Fields the env did not set keep the file value.
    expect(r.ollama.dimensions).toBe(2560);
  }, 30_000);

  test("provider: openai in the file activates the openai entry (was a silent no-op)", () => {
    const r = resolveWith({
      provider: "openai",
      model: "text-embedding-3-small",
      apiKey: "test-key",
      dimensions: 1536,
    });
    expect(r.openai.priority).toBe(1);
    expect(r.openai.apiKey).toBe("test-key");
    expect(r.openai.model).toBe("text-embedding-3-small");
    expect(r.first).toBe("openai");
    // Ollama drops out of the priority-1 slot.
    expect(r.ollama.priority).toBeGreaterThan(1);
  }, 30_000);

  test("EMBEDDING_PROVIDER env overrides the file's provider selection", () => {
    const r = resolveWith(
      { provider: "openai", model: "text-embedding-3-small", apiKey: "test-key" },
      { EMBEDDING_PROVIDER: "ollama" },
    );
    expect(r.first).toBe("ollama");
    expect(r.ollama.priority).toBe(1);
    expect(r.openai.priority).toBeGreaterThan(1);
  }, 30_000);
});
