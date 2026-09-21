/**
 * PDM-13. `llm.disableThink` is NOT an Ollama-only knob, and believing it was
 * is what let a wrong value ship.
 *
 * The comment on `llm-client.ts`'s `think:false` injection says the flag is an
 * Ollama request-body key, and line 365 does gate that one injection on the
 * provider seam's `injectsDisableThink`. But the flag is read at five sites and
 * only that one is gated. The load-bearing ungated read is:
 *
 *     const useJsonSchema = llm.disableThink && (await _checkJsonSchemaSupport());
 *
 * and `_checkJsonSchemaSupport()` short-circuits to `true` for any provider
 * with no Ollama version probe — LM Studio included, by design (LIP-07: it
 * implements OpenAI-native `response_format: {type: "json_schema"}` directly).
 *
 * So on LM Studio the flag selects constrained decoding. The installer used to
 * write `disableThink: false` there on the stated grounds that it was inert;
 * the measured effect was to suppress LM Studio's native json_schema path and
 * fall back to json_object with manual validation, on every install.
 *
 * The `true` half of the pair is already sensed — `llm-client-json-schema.test.ts`'s
 * "json_schema supported: passes schemaName" only passes because the shipped
 * default is on. This file supplies the `false` half, so the coupling is
 * asserted from both directions and the "it's inert" reading cannot come back.
 *
 * Its own file because the config layer freezes at first load: the env value
 * has to be set before anything reaches `loadConfigSafe`, which is why every
 * core import below is dynamic (static imports hoist above these assignments).
 */
import { describe, test, expect, beforeAll, mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Before any core-reaching import. The scratch config dir keeps the
// developer's own ~/.config/massa-ai out of the run; the env var is the knob
// under test.
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "massa-ai-dt-"));
process.env.MASSA_AI_LLM_DISABLE_THINK = "0";

let lastCall: any = null;

mock.module("ai", () => ({
  generateText: async () => ({ text: "mocked" }),
  generateObject: async (opts: any) => {
    lastCall = opts;
    return { object: { summary: "mocked" } };
  },
}));

// The callable AND its `.chat` member. LM Studio takes the
// `/v1/chat/completions` route (`requiresChatCompletionsApi`), so llm-client
// calls `openai.chat(model)` here where the Ollama path calls `openai(model)`.
// A callable-only double — which is what the Ollama-targeted sibling suite
// uses — throws "openai.chat is not a function" on this provider.
mock.module("@ai-sdk/openai", () => ({
  createOpenAI: () =>
    Object.assign((model: string) => ({ model, __mock: true }), {
      chat: (model: string) => ({ model, __mock: true }),
    }),
}));

type LlmClient = typeof import("../services/memory/llm-client.js");
let llm: LlmClient;
let z: typeof import("zod").z;

beforeAll(async () => {
  llm = await import("../services/memory/llm-client.js");
  ({ z } = await import("zod"));
});

const schemaOf = () => z.object({ summary: z.string() });

describe("disableThink gates json_schema on LM Studio (PDM-13)", () => {
  test("the env knob actually reached the resolved config", async () => {
    // Guards the whole file against passing vacuously: if the import order
    // ever regressed and the config froze before the assignment above, every
    // assertion below would silently measure the default instead of `false`.
    //
    // Read through `config.get`, the same accessor `llm-client`'s
    // `getLlmConfig` uses — NOT `loadConfig()`, which is the config.json file
    // layer alone and never sees an env override at all.
    const { config } = await import("@massa-ai/shared");
    expect((config.get("llm") as { disableThink: boolean }).disableThink).toBe(false);
  });

  test("disableThink=false takes the json_object fallback even where json_schema IS supported", async () => {
    llm._setLlmEnabledForTesting(true);
    llm._setLlmBaseUrlForTesting("http://localhost:1234/v1"); // LM Studio
    llm._setJsonSchemaSupportedForTesting(true);
    lastCall = null;

    const res = await llm.llmObject("prompt", schemaOf());

    expect(res.ok).toBe(true);
    // The fallback's signature: `output: "no-schema"` and no schemaName. With
    // disableThink on, this same call passes schemaName and a compiled schema
    // (asserted in llm-client-json-schema.test.ts).
    expect(lastCall.output).toBe("no-schema");
    expect(lastCall.schemaName).toBeUndefined();
  });

  test("the provider seam does not rescue it — LM Studio reports json_schema support", async () => {
    // Asserted separately so a failure names which half broke. This is the
    // term that stays true while disableThink is the one flipping the result,
    // i.e. the proof that the flag is what suppressed the path.
    llm._setJsonSchemaSupportedForTesting(null);
    llm._setLlmBaseUrlForTesting("http://localhost:1234/v1");
    expect(await llm._checkJsonSchemaSupport()).toBe(true);
  });
});
