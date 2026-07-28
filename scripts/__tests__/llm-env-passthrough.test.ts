/**
 * DEBT-03 / AD-010 — every LLM env knob the config resolver reads must survive
 * Turbo's environment sandbox.
 *
 * `turbo.json` → `tasks.test.passThroughEnv` is an allowlist: a var absent from
 * it arrives `undefined` under `bun run test` while working perfectly under a
 * direct `bun test`. Before AD-010 only four of the ten LLM vars were listed,
 * so six of them were silently dead in the aggregate suite — a bug a rename
 * alone would have carried forward under new names.
 *
 * The expected set is derived from `config/index.ts` rather than hardcoded here.
 * A hardcoded list would pass forever after someone adds an eleventh knob and
 * forgets the allowlist, which is precisely the failure being guarded.
 */

import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");
const TURBO_JSON = path.join(REPO_ROOT, "turbo.json");
const CONFIG_INDEX = path.join(REPO_ROOT, "packages", "shared", "src", "config", "index.ts");

function passThroughEnv(): string[] {
  const turbo = JSON.parse(fs.readFileSync(TURBO_JSON, "utf8"));
  return turbo.tasks?.test?.passThroughEnv ?? [];
}

/** Every `MASSA_AI_LLM_*` name the config resolver actually reads. */
function knobsReadBySource(): string[] {
  const source = fs.readFileSync(CONFIG_INDEX, "utf8");
  return [...new Set(source.match(/MASSA_AI_LLM_[A-Z_]+/g) ?? [])].sort();
}

describe("turbo passThroughEnv covers every LLM env knob", () => {
  test("config/index.ts reads exactly the ten AD-010 knobs", () => {
    expect(knobsReadBySource()).toEqual([
      "MASSA_AI_LLM_API_KEY",
      "MASSA_AI_LLM_BASE_URL",
      "MASSA_AI_LLM_CODE_MODEL",
      "MASSA_AI_LLM_DISABLE_THINK",
      "MASSA_AI_LLM_ENABLED",
      "MASSA_AI_LLM_MAX_OUTPUT_TOKENS",
      "MASSA_AI_LLM_MODEL",
      "MASSA_AI_LLM_PROMPT",
      "MASSA_AI_LLM_TEMPERATURE",
      "MASSA_AI_LLM_TIMEOUT_MS",
    ]);
  });

  test("every knob the resolver reads is listed in passThroughEnv", () => {
    const listed = new Set(passThroughEnv());
    const missing = knobsReadBySource().filter((k) => !listed.has(k));
    expect(missing, `not listed in turbo.json tasks.test.passThroughEnv: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  test("no retired RLM_ name survives in turbo.json", () => {
    expect(fs.readFileSync(TURBO_JSON, "utf8")).not.toMatch(/RLM_/);
  });
});
