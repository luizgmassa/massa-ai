/**
 * AD-010 — this project has exactly one environment-variable prefix.
 *
 * The ten LLM knobs are `MASSA_AI_LLM_*`. The former `RLM_LLM_*` spellings are
 * removed, not deprecated: there is no dual-read, so setting one has no effect
 * whatsoever. Both halves are asserted, because only the pair is discriminating
 * — a suite that checked the new names alone would still pass if the old ones
 * had been left wired up beside them, which is exactly the outcome AD-010
 * rejects.
 *
 * Resolution happens in a module-level object literal (`config/index.ts`
 * `defaultConfig`), so an in-process `process.env.X = …` lands after the value
 * is frozen. Each case therefore runs in a subprocess via the established
 * `isolated-config` harness, which additionally gives the child an empty
 * `XDG_CONFIG_HOME`: with no `config.json` to read, an unset var falls through
 * to the literal default rather than to whatever the developer's real
 * `~/.config/massa-ai/config.json` happens to hold.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import path from "path";
import {
  makeIsolatedConfigHome,
  removeIsolatedConfigHome,
  runIsolated,
  type IsolatedConfigHome,
} from "./isolated-config";

const CONFIG_INDEX = path.join(import.meta.dir, "..", "index.ts");

/** The ten knobs AD-010 renames, with a probe value distinct from every default. */
const KNOBS = [
  { suffix: "ENABLED", probe: "true", field: "enabled", expected: true, default: false },
  {
    suffix: "BASE_URL",
    probe: "http://probe.invalid:9/v1",
    field: "baseUrl",
    expected: "http://probe.invalid:9/v1",
    default: "http://localhost:11434/v1",
  },
  { suffix: "API_KEY", probe: "probe-key", field: "apiKey", expected: "probe-key", default: "ollama" },
  {
    suffix: "MODEL",
    probe: "probe-instruct-model",
    field: "model",
    expected: "probe-instruct-model",
    // Provider-derived (T03): the ollama seam entry's instruct default, not a
    // disconnected literal — see inference-providers.ts's `defaultModels`.
    default: "qwen3-vl:8b",
  },
  {
    suffix: "CODE_MODEL",
    probe: "probe-code-model",
    field: "codeModel",
    expected: "probe-code-model",
    default: "qwen2.5-coder:7b",
  },
  { suffix: "TEMPERATURE", probe: "0.77", field: "temperature", expected: 0.77, default: 0.2 },
  {
    // The 11th MASSA_AI_LLM_* knob (T04, AD-010/R-08). contextWindow and
    // codeContextWindow are also new PDM-12 fields but take no env var of
    // their own — codeTemperature is the only one this feature wires.
    suffix: "CODE_TEMPERATURE",
    probe: "0.55",
    field: "codeTemperature",
    expected: 0.55,
    default: 0.0,
  },
  {
    suffix: "MAX_OUTPUT_TOKENS",
    probe: "4242",
    field: "maxOutputTokens",
    expected: 4242,
    default: 8000,
  },
  { suffix: "TIMEOUT_MS", probe: "12345", field: "timeoutMs", expected: 12345, default: 90000 },
  { suffix: "DISABLE_THINK", probe: "0", field: "disableThink", expected: false, default: true },
  // PROMPT is the one knob that lands outside the `llm` block.
  { suffix: "PROMPT", probe: "probe-prompt", field: "prompt", expected: "probe-prompt", default: null },
] as const;

const NEW_PREFIX = "MASSA_AI_LLM_";
const OLD_PREFIX = "RLM_LLM_";

/**
 * Both spellings of all ten knobs, blanked. `envString`/`envNum`/`envBool` and
 * the `PROMPT` truthiness check all treat `""` as unset, so this is a reliable
 * "clear everything" that also survives a developer shell that happens to
 * export one of these names.
 */
function clearedEnv(): Record<string, string> {
  const cleared: Record<string, string> = {};
  for (const k of KNOBS) {
    cleared[`${NEW_PREFIX}${k.suffix}`] = "";
    cleared[`${OLD_PREFIX}${k.suffix}`] = "";
  }
  return cleared;
}

/** Set every knob at once using the given prefix. */
function probeEnv(prefix: string): Record<string, string> {
  const env = clearedEnv();
  for (const k of KNOBS) env[`${prefix}${k.suffix}`] = k.probe;
  return env;
}

const CHILD = `
import { config } from ${JSON.stringify(CONFIG_INDEX)};
const llm = config.get("llm");
const compression = config.get("compression");
console.log(JSON.stringify({ ...llm, prompt: compression.prompt ?? null }));
`;

/** Run the child and return the resolved LLM-facing config it observed. */
function resolveWith(
  home: IsolatedConfigHome,
  name: string,
  env: Record<string, string>,
): Record<string, unknown> {
  const res = runIsolated(home, name, CHILD, [], env);
  expect(res.exitCode, `child failed:\n${res.stderr}`).toBe(0);
  const lastLine = res.stdout.trim().split("\n").pop() ?? "";
  return JSON.parse(lastLine) as Record<string, unknown>;
}

describe("AD-010: MASSA_AI_LLM_* is the project's only LLM env prefix", () => {
  let home: IsolatedConfigHome;

  beforeEach(() => {
    home = makeIsolatedConfigHome("massa-ai-llm-env-");
  });

  afterEach(() => {
    removeIsolatedConfigHome(home);
  });

  test("every MASSA_AI_LLM_* var reaches its config field", () => {
    const resolved = resolveWith(home, "new-prefix", probeEnv(NEW_PREFIX));
    for (const k of KNOBS) {
      expect(resolved[k.field], `${NEW_PREFIX}${k.suffix} did not reach config.${k.field}`).toBe(
        k.expected,
      );
    }
  }, 30_000);

  test("no RLM_LLM_* var has any effect — the old prefix is removed, not deprecated", () => {
    const resolved = resolveWith(home, "old-prefix", probeEnv(OLD_PREFIX));
    for (const k of KNOBS) {
      expect(resolved[k.field], `${OLD_PREFIX}${k.suffix} still reached config.${k.field}`).toBe(
        k.default,
      );
    }
  }, 30_000);

  test("with neither prefix set, every knob resolves to its literal default", () => {
    const resolved = resolveWith(home, "no-prefix", clearedEnv());
    for (const k of KNOBS) {
      expect(resolved[k.field], `config.${k.field} is not its documented default`).toBe(k.default);
    }
  }, 30_000);
});

describe("T03: DEFAULT_LLM_MODEL / DEFAULT_LLM_CODE_MODEL are provider-derived", () => {
  let home: IsolatedConfigHome;

  beforeEach(() => {
    home = makeIsolatedConfigHome("massa-ai-default-model-");
  });

  afterEach(() => {
    removeIsolatedConfigHome(home);
  });

  /**
   * Asserts the exported constants directly, not through `config.get("llm")` —
   * `llm.model` is already resolved by `defaultMassaAiConfig.llm.model` before
   * this fallback is ever consulted, so testing only the resolved field would
   * leave `DEFAULT_LLM_MODEL`/`DEFAULT_LLM_CODE_MODEL` themselves unobserved
   * (T03's actual deliverable).
   */
  test("with no embedding.provider configured, both constants derive from ollama's seam entry", () => {
    const child = `
      import { DEFAULT_LLM_MODEL, DEFAULT_LLM_CODE_MODEL } from ${JSON.stringify(CONFIG_INDEX)};
      import { INFERENCE_PROVIDERS } from ${JSON.stringify(
        path.join(import.meta.dir, "..", "inference-providers.ts"),
      )};
      console.log(JSON.stringify({
        model: DEFAULT_LLM_MODEL,
        codeModel: DEFAULT_LLM_CODE_MODEL,
        expectedModel: INFERENCE_PROVIDERS.ollama.defaultModels.instruct,
        expectedCodeModel: INFERENCE_PROVIDERS.ollama.defaultModels.coding,
      }));
    `;
    const res = runIsolated(home, "default-model-ollama", child, [], clearedEnv());
    expect(res.exitCode, `child failed:\n${res.stderr}`).toBe(0);
    const out = JSON.parse(res.stdout.trim().split("\n").pop() ?? "");
    expect(out.model).toBe(out.expectedModel);
    expect(out.codeModel).toBe(out.expectedCodeModel);
  }, 30_000);

  test("with embedding.provider=lmstudio, both constants derive from lmstudio's seam entry", () => {
    const child = `
      import fs from "fs";
      import path from "path";
      import os from "os";
      const dir = path.join(${JSON.stringify(home.configDir)});
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "config.json"),
        JSON.stringify({ embedding: { provider: "lmstudio", model: "x" } }),
      );
      const { DEFAULT_LLM_MODEL, DEFAULT_LLM_CODE_MODEL } = await import(${JSON.stringify(CONFIG_INDEX)});
      const { INFERENCE_PROVIDERS } = await import(${JSON.stringify(
        path.join(import.meta.dir, "..", "inference-providers.ts"),
      )});
      console.log(JSON.stringify({
        model: DEFAULT_LLM_MODEL,
        codeModel: DEFAULT_LLM_CODE_MODEL,
        expectedModel: INFERENCE_PROVIDERS.lmstudio.defaultModels.instruct,
        expectedCodeModel: INFERENCE_PROVIDERS.lmstudio.defaultModels.coding,
      }));
    `;
    const res = runIsolated(home, "default-model-lmstudio", child, [], clearedEnv());
    expect(res.exitCode, `child failed:\n${res.stderr}`).toBe(0);
    const out = JSON.parse(res.stdout.trim().split("\n").pop() ?? "");
    expect(out.model).toBe(out.expectedModel);
    expect(out.codeModel).toBe(out.expectedCodeModel);
  }, 30_000);
});
