/**
 * The installer's `config.json` template, executed rather than grepped.
 *
 * `installer_write_config` is where the 4096-dimension defect lived: the
 * template hardcoded a width beside a `qwen3-embedding:4b` model that produces
 * 2560. The 2026-08 parity sweep fixed install.sh, the Dockerfile,
 * setup-ollama-wsl.sh and the config CLI and never saw this file, because
 * `embedding-defaults-parity.test.ts`'s completeness scan keys on the literal
 * `OLLAMA_EMBEDDING_` and this template has never contained it. A scan whose
 * population cannot include a subject reports that subject clean.
 *
 * So every assertion here runs the real shell function and parses what it
 * actually wrote. A template that emits invalid JSON, drops a section, or
 * ignores a toggle fails on content, not on a pattern someone remembered to
 * add to a list.
 */

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_CAPTURE_POLICY } from "../../packages/shared/src/config/massa-ai-config";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const LIB = path.join(REPO_ROOT, "scripts/lib/installer-api-key.sh");
const APP_JS = path.join(REPO_ROOT, "apps/web-ui/src/static/app.js");

interface WrittenConfig {
  embedding: { model: string; dimensions: number };
  llm: { enabled: boolean };
  hooks: { enabled: boolean; bridge: { enabled: boolean } };
  handoffs: { enabled: boolean };
  impact: { bfsCteEnabled: boolean };
  synapse: { enabled: boolean };
  memory: {
    bootstrap: { enabled: boolean };
    autoImprove: { enabled: boolean };
    autoImportance: { enabled: boolean };
  };
  search: { queryUnderstanding: { enabled: boolean }; rerank: { enabled: boolean } };
  scheduler: {
    enabled: boolean;
    tickMs: number;
    maxConcurrent: number;
    jobs: Record<string, { enabled: boolean; intervalMs: number }>;
  };
  capturePolicy: {
    rules: Array<{ pattern: string; disposition: string }>;
    maxMatchWork: number;
    maxIgnorePatterns: number;
  };
  [key: string]: unknown;
}

/** Sources the library, calls `installer_write_config`, returns what landed. */
function writeConfig(env: Record<string, string> = {}): WrittenConfig {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-installer-tpl-"));
  try {
    const out = path.join(dir, "config.json");
    const script = [
      "set -euo pipefail",
      `. ${JSON.stringify(LIB)}`,
      `installer_write_config ${JSON.stringify(out)} "test-api-key"`,
    ].join("\n");

    const proc = Bun.spawnSync(["bash", "-c", script], {
      env: {
        PATH: process.env.PATH ?? "",
        HOME: dir,
        DATABASE_URL: "postgresql://massa_ai:massa_ai_password@localhost:5432/massa_ai",
        EMBEDDING_MODEL: "qwen3-embedding:4b",
        OLLAMA_URL: "http://localhost:11434",
        LLM_MODEL: "qwen2.5:7b-instruct",
        CODE_MODEL: "qwen2.5-coder:7b",
        DATA_DIR: path.join(dir, "data"),
        ...env,
      },
    });
    if (proc.exitCode !== 0) {
      throw new Error(`installer_write_config failed (${proc.exitCode}): ${proc.stderr.toString()}`);
    }
    // Parsing IS an assertion: an unquoted expansion or a stray comma in the
    // heredoc produces a file that looks plausible and loads as nothing.
    return JSON.parse(fs.readFileSync(out, "utf8")) as WrittenConfig;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("installer config template — embedding width", () => {
  test("the default model gets the width it actually produces", () => {
    const config = writeConfig();
    expect(config.embedding.model).toBe("qwen3-embedding:4b");
    expect(config.embedding.dimensions).toBe(2560);
  });

  test.each([
    ["qwen3-embedding:8b", 4096],
    ["qwen3-embedding:4b", 2560],
    ["qwen3-embedding:0.6b", 1024],
    ["bge-m3", 1024],
  ])("%s resolves to %i dimensions", (model, dimensions) => {
    const config = writeConfig({ EMBEDDING_MODEL: model });
    expect(config.embedding.dimensions).toBe(dimensions);
  });

  test("an unrecognized model falls back to the reference default, never 4096", () => {
    const config = writeConfig({ EMBEDDING_MODEL: "some-future-model" });
    expect(config.embedding.dimensions).toBe(2560);
  });

  test("the pair matches install.sh's own .env defaults", () => {
    // The two writers disagreeing is the original defect, restated.
    const installSh = fs.readFileSync(path.join(REPO_ROOT, "install.sh"), "utf8");
    const model = installSh.match(/^OLLAMA_EMBEDDING_MODEL=(\S+)$/m)?.[1];
    const dims = installSh.match(/^OLLAMA_EMBEDDING_DIMENSIONS=(\d+)$/m)?.[1];
    expect(model).toBeDefined();
    expect(dims).toBeDefined();

    const config = writeConfig({ EMBEDDING_MODEL: model as string });
    expect(config.embedding.dimensions).toBe(Number(dims));
  });
});

describe("installer config template — capture policy", () => {
  test("the emitted rules are DEFAULT_CAPTURE_POLICY, rule for rule and in order", () => {
    // A shell installer cannot import the TypeScript declaration, so this gate
    // is what stands in for sharing it. Order matters: the policy is
    // first-match-wins.
    const config = writeConfig();
    expect(config.capturePolicy.rules).toEqual(DEFAULT_CAPTURE_POLICY.rules);
    expect(config.capturePolicy.maxMatchWork).toBe(DEFAULT_CAPTURE_POLICY.maxMatchWork);
    expect(config.capturePolicy.maxIgnorePatterns).toBe(DEFAULT_CAPTURE_POLICY.maxIgnorePatterns);
  });

  test("the rule set is non-empty", () => {
    // Guards the comparison above from passing as [] === [].
    expect(DEFAULT_CAPTURE_POLICY.rules.length).toBeGreaterThanOrEqual(30);
  });
});

describe("installer config template — scheduler", () => {
  test("a fresh install writes the safe-defaults preset", () => {
    const config = writeConfig();
    expect(config.scheduler.enabled).toBe(true);
    expect(config.scheduler.tickMs).toBe(60_000);
    expect(config.scheduler.maxConcurrent).toBe(2);

    const on = Object.entries(config.scheduler.jobs)
      .filter(([, job]) => job.enabled)
      .map(([kind]) => kind)
      .sort();
    // Exactly the two `applySafeDefaults` turns on. auto-improve,
    // observation-bridge and checkpoint-purge stay off.
    expect(on).toEqual(["decay-sweep", "memory-consolidation"]);
  });

  test("the intervals match the preset's conservative floors", () => {
    const config = writeConfig();
    expect(config.scheduler.jobs["memory-consolidation"].intervalMs).toBe(30 * 60 * 1000);
    expect(config.scheduler.jobs["decay-sweep"].intervalMs).toBe(60 * 60 * 1000);
  });

  test("all five registered job kinds are written", () => {
    const config = writeConfig();
    expect(Object.keys(config.scheduler.jobs).sort()).toEqual([
      "auto-improve",
      "checkpoint-purge",
      "decay-sweep",
      "memory-consolidation",
      "observation-bridge",
    ]);
  });
});

describe("installer config template — section coverage", () => {
  test("every Admin Portal Config section is written", () => {
    // Population from app.js, the artifact being audited — a section added to
    // the portal that the installer never writes fails here.
    const source = fs.readFileSync(APP_JS, "utf8");
    const sections = [...new Set([...source.matchAll(/^\s*key:\s*"([^"]+)",/gm)].map((m) => m[1]))];
    expect(sections.length).toBeGreaterThanOrEqual(16);

    const config = writeConfig();
    const missing = sections.filter((key) => config[key] === undefined);
    expect(missing).toEqual([]);
  });
});

describe("installer config template — feature toggles", () => {
  /** Each row: the global the prompt sets, and where it has to land. */
  const TOGGLES: Array<{ env: string; read: (c: WrittenConfig) => boolean }> = [
    { env: "LLM_ENABLED", read: (c) => c.llm.enabled },
    { env: "SEARCH_QU_ENABLED", read: (c) => c.search.queryUnderstanding.enabled },
    { env: "SEARCH_RERANK_ENABLED", read: (c) => c.search.rerank.enabled },
    { env: "IMPACT_BFS_CTE_ENABLED", read: (c) => c.impact.bfsCteEnabled },
    { env: "SYNAPSE_ENABLED", read: (c) => c.synapse.enabled },
    { env: "MEMORY_BOOTSTRAP_ENABLED", read: (c) => c.memory.bootstrap.enabled },
    { env: "MEMORY_AUTO_IMPROVE_ENABLED", read: (c) => c.memory.autoImprove.enabled },
    { env: "MEMORY_AUTO_IMPORTANCE_ENABLED", read: (c) => c.memory.autoImportance.enabled },
    { env: "HOOKS_ENABLED", read: (c) => c.hooks.enabled },
    { env: "HOOKS_BRIDGE_ENABLED", read: (c) => c.hooks.bridge.enabled },
    { env: "HANDOFFS_ENABLED", read: (c) => c.handoffs.enabled },
    { env: "SCHEDULER_ENABLED", read: (c) => c.scheduler.enabled },
    { env: "SCHEDULER_CONSOLIDATION_ENABLED", read: (c) => c.scheduler.jobs["memory-consolidation"].enabled },
    { env: "SCHEDULER_DECAY_ENABLED", read: (c) => c.scheduler.jobs["decay-sweep"].enabled },
    { env: "SCHEDULER_AUTO_IMPROVE_ENABLED", read: (c) => c.scheduler.jobs["auto-improve"].enabled },
    {
      env: "SCHEDULER_OBSERVATION_BRIDGE_ENABLED",
      read: (c) => c.scheduler.jobs["observation-bridge"].enabled,
    },
    {
      env: "SCHEDULER_CHECKPOINT_PURGE_ENABLED",
      read: (c) => c.scheduler.jobs["checkpoint-purge"].enabled,
    },
  ];

  // Both directions per toggle: a template that ignores its variable and
  // hardcodes the answer passes a one-direction check half the time.
  test.each(TOGGLES)("$env reaches config.json in both directions", ({ env, read }) => {
    expect(read(writeConfig({ [env]: "true" }))).toBe(true);
    expect(read(writeConfig({ [env]: "false" }))).toBe(false);
  });

  test("a call setting no toggle writes the pre-existing literals", () => {
    // Backward compatibility for any caller that has not adopted the prompt.
    const config = writeConfig();
    expect(config.llm.enabled).toBe(true);
    expect(config.hooks.enabled).toBe(true);
    expect(config.hooks.bridge.enabled).toBe(true);
    expect(config.memory.bootstrap.enabled).toBe(true);
    expect(config.memory.autoImprove.enabled).toBe(true);
    expect(config.memory.autoImportance.enabled).toBe(true);
    expect(config.search.queryUnderstanding.enabled).toBe(false);
    expect(config.search.rerank.enabled).toBe(false);
  });
});
