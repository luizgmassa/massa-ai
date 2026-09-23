/**
 * Shared local-first LLM client (Phase 1, cross-cutting §1).
 *
 * Wraps the Vercel AI SDK (`generateText` / `generateObject`) over an
 * OpenAI-compatible provider configured from the top-level `config.llm` block.
 * Default backend is a local Ollama instance (http://localhost:11434/v1).
 *
 * Contract (cross-cutting §1):
 *   (a) respect `timeoutMs` (via AbortSignal.timeout),
 *   (b) degrade silently to a non-LLM path on any failure — never throw,
 *   (c) be config-gated default-off (`config.llm.enabled`, env MASSA_AI_LLM_ENABLED).
 *
 * Consumers (Phase 1: consolidator; Phase 2: query-understanding; Phase 4:
 * bootstrap; Phase 5: auto-improve; Phase 7: compression) MUST treat a
 * `{ ok: false }` result as "fall through to the non-LLM path".
 */

import { generateText, generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { config, logger } from "@massa-ai/shared";
import { loadConfigSafe } from "@massa-ai/shared/config";
import {
  INFERENCE_PROVIDERS,
  INFERENCE_ROLE_DEFAULTS,
  LOCAL_INFERENCE_IDS,
  inferenceProviderList,
  type InferenceProviderId,
  type InferenceProviderSpec,
} from "@massa-ai/shared/inference-providers";
import { z } from "zod";

/**
 * Which model role a call targets. `"instruct"` (default) selects the
 * NL/instruction model (`config.llm.model`); `"code"` selects the coder model
 * (`config.llm.codeModel`) for code-oriented sites (bootstrap, reranker,
 * compression). This is the per-task routing knob (COVERAGE #1/#5/#7).
 */
export type LlmModelRole = "instruct" | "code";

export interface LlmCompleteOptions {
  /** Caller identity for logs/streaks (e.g. "reranker", "hyde"). */
  label: string;
  /** Optional system prompt. */
  system?: string;
  /** Per-call timeout override (ms). Defaults to `config.llm.timeoutMs`. */
  timeoutMs?: number;
  /** Model role: `"instruct"` (default) or `"code"`. */
  modelRole?: LlmModelRole;
}

export interface LlmObjectOptions extends LlmCompleteOptions {
  // schema is a required positional arg of llmObject; no extra opts yet.
}

export interface LlmResult<T = string> {
  ok: boolean;
  value?: T;
  /** Present when ok === false. */
  error?: string;
}

// ── json_schema constrained decoding (W7-07) ─────────────────────────────

/**
 * Cached Ollama json_schema support flag. `null` = not yet checked.
 * Ollama >= 0.5.0 supports `format: { type: "json_schema", json_schema: {...} }`
 * for constrained decoding. Older versions only support `json_object`.
 */
let _jsonSchemaSupported: boolean | null = null;

/**
 * Check whether the configured Ollama instance supports `json_schema` format
 * (requires Ollama >= 0.5.0). Caches the result for the process lifetime.
 * On any error (Ollama down, unparseable version), returns `false` (safe
 * fallback to the current json_object path).
 * @internal
 */
export async function _checkJsonSchemaSupport(): Promise<boolean> {
  if (_jsonSchemaSupported !== null) return _jsonSchemaSupported;
  try {
    const llm = getLlmConfig();
    const spec = resolveInferenceSpec(llm.baseUrl);
    if (!spec.supportsOllamaVersionProbe) {
      // LM Studio (and any other non-Ollama local provider) implements the
      // OpenAI-native response_format:{type:"json_schema"} path directly —
      // no version handshake exists to probe, and none is needed (LIP-07).
      _jsonSchemaSupported = true;
      logger.info("json_schema: native support assumed (non-Ollama provider)", {
        provider: spec.id,
      });
      return true;
    }
    // Ollama's version endpoint is at /api/version (no /v1 prefix).
    const versionUrl = llm.baseUrl.replace(/\/v1\/?$/, "") + "/api/version";
    const res = await fetch(versionUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      _jsonSchemaSupported = false;
      logger.warn("json_schema: Ollama version check failed", { status: res.status });
      return false;
    }
    const body = (await res.json()) as { version?: string };
    const version = body.version ?? "";
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
      _jsonSchemaSupported = false;
      logger.warn("json_schema: could not parse Ollama version", { version });
      return false;
    }
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const supported = major > 0 || (major === 0 && minor >= 5);
    _jsonSchemaSupported = supported;
    logger.info("json_schema: Ollama version detected", { version, supported });
    return supported;
  } catch (e) {
    _jsonSchemaSupported = false;
    logger.warn("json_schema: version check error — falling back to json_object", {
      error: (e as Error).message,
    });
    return false;
  }
}

/**
 * Test seam: force the json_schema support flag without hitting Ollama.
 * Pass `null` to clear the cache.
 * @internal
 */
export function _setJsonSchemaSupportedForTesting(flag: boolean | null): void {
  _jsonSchemaSupported = flag;
}

// ── end json_schema section ──────────────────────────────────────────────

/** Whether the LLM is enabled at the current config. Cheap, side-effect-free. */
export function isLlmEnabled(): boolean {
  if (testEnabledOverride !== null) return testEnabledOverride;
  try {
    return config.get("llm").enabled === true;
  } catch {
    return false;
  }
}

/**
 * Test seam: force the enabled flag without touching config (avoids colliding
 * with other test files that mock `@massa-ai/shared`). Pass `null` to clear.
 * @internal
 */
let testEnabledOverride: boolean | null = null;
export function _setLlmEnabledForTesting(flag: boolean | null): void {
  testEnabledOverride = flag;
}

/**
 * qwen3 (and other "thinking" models) emit their answer on the **reasoning**
 * channel; the content channel can come back empty (`text === ""`) when
 * thinking consumes the token budget, leaving `finishReason === "length"` (and
 * sometimes `"stop"` with empty content too). Without recovery every
 * structured/free-text LLM call silently degrades to the non-LLM path.
 *
 * Two mitigations live here:
 *   (1) `disableThink` (default on) asks Ollama to stop thinking by injecting a
 *       top-level `think:false` into the OpenAI-compat request body, and requests
 *       `response_format: json_object` for structured calls. Both are
 *       best-effort — they help on easy prompts but the model may still think.
 *   (2) reasoning-channel fallback: when `result.text` / `result.object` is
 *       empty/invalid, recover the answer from the reasoning channel the SDK
 *       exposes (`result.reasoning`). This is the load-bearing protection.
 *
 * Config: `MASSA_AI_LLM_DISABLE_THINK` (default `"1"`). When disabled, behavior
 * regresses to today's (content-only) path exactly.
 */

/**
 * Test seam: force the resolved `llm.baseUrl` without touching config or
 * mocking `@massa-ai/shared` (this file's own test suite deliberately avoids
 * that mock — see llm-client.test.ts's docblock — since bun's mock.module is
 * process-wide and would collide with sibling test files). Pass `null` to
 * clear.
 * @internal
 */
let testBaseUrlOverride: string | null = null;
export function _setLlmBaseUrlForTesting(url: string | null): void {
  testBaseUrlOverride = url;
}

/**
 * Pure resolution of the effective LLM config for one call from the raw
 * `config.llm` block (possibly partial/undefined — defensive against a
 * partial or missing config) and the requested role. Every fallback reads
 * the resolved provider's own seam entry (`inference-providers.ts`), never a
 * bare Ollama-shaped literal: code role falls back to `defaultModels.coding`
 * — never to the instruct model, which after this feature is a
 * vision-language model (COVERAGE #5) — and `disableThink` follows the
 * resolved provider's `injectsDisableThink` (LIP-07) instead of a hardcoded
 * `true`.
 *
 * Exported so this fallback behavior can be unit-tested with a synthetic
 * config shape — this file's test suite deliberately does not
 * `mock.module("@massa-ai/shared")` (see llm-client.test.ts's docblock).
 * @internal
 */
export function _resolveLlmConfig(
  cfg:
    | Partial<{
        baseUrl: string;
        apiKey: string;
        model: string;
        codeModel: string;
        temperature: number;
        codeTemperature: number;
        contextWindow: number;
        codeContextWindow: number;
        maxOutputTokens: number;
        timeoutMs: number;
        disableThink: boolean;
      }>
    | undefined,
  role: LlmModelRole,
  baseUrlOverride: string | null,
) {
  const baseUrl = baseUrlOverride ?? cfg?.baseUrl ?? INFERENCE_PROVIDERS.ollama.defaultLlmBaseUrl;
  const spec = resolveInferenceSpec(baseUrl);
  const model =
    role === "code"
      ? cfg?.codeModel ?? spec.defaultModels.coding
      : cfg?.model ?? spec.defaultModels.instruct;
  const temperature =
    role === "code"
      ? cfg?.codeTemperature ?? INFERENCE_ROLE_DEFAULTS.coding.temperature
      : cfg?.temperature ?? INFERENCE_ROLE_DEFAULTS.instruct.temperature;
  // Context window per role (PDM-08/PDM-09); sent as `options.num_ctx` only
  // where `spec.appliesContextPerRequest` (buildProvider) — LM Studio applies
  // it at load time (spec A-07) and must never receive this field.
  const contextWindow =
    role === "code"
      ? cfg?.codeContextWindow ?? INFERENCE_ROLE_DEFAULTS.coding.contextWindow
      : cfg?.contextWindow ?? INFERENCE_ROLE_DEFAULTS.instruct.contextWindow;
  return {
    baseUrl,
    apiKey: cfg?.apiKey ?? spec.id,
    model,
    temperature,
    contextWindow,
    maxOutputTokens: cfg?.maxOutputTokens ?? 8000,
    timeoutMs: cfg?.timeoutMs ?? 90000,
    disableThink: cfg?.disableThink ?? spec.injectsDisableThink,
  };
}

/** Read the llm config block with safe defaults (defensive against partial/missing config). */
function getLlmConfig(opts?: { modelRole?: LlmModelRole }) {
  return _resolveLlmConfig(config.get("llm"), opts?.modelRole ?? "instruct", testBaseUrlOverride);
}

/** host:port for a URL, or `null` when it doesn't parse. */
function hostPort(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || (u.protocol === "https:" ? "443" : "80")}`;
  } catch {
    return null;
  }
}

/**
 * Resolve which local-inference provider `llm.baseUrl` targets (design.md
 * §4, LIP-07): the two Ollama-only behaviours below must not fire against
 * LM Studio. Primary signal is a host:port match against each provider's
 * `defaultLlmBaseUrl`; a baseUrl that matches none of them (custom host, or
 * a provider's default port overridden) falls back to `embedding.provider`
 * when it names a local-inference id, then to `ollama` — today's only
 * behaviour, so an unresolvable baseUrl regresses to nothing.
 * @internal
 */
export function resolveInferenceSpec(baseUrl: string): InferenceProviderSpec {
  const target = hostPort(baseUrl);
  if (target) {
    const match = inferenceProviderList().find(
      (spec) => hostPort(spec.defaultLlmBaseUrl) === target,
    );
    if (match) return match;
  }
  let embeddingProvider: string | undefined = process.env.EMBEDDING_PROVIDER;
  if (!embeddingProvider) {
    try {
      embeddingProvider = loadConfigSafe().embedding?.provider;
    } catch {
      embeddingProvider = undefined;
    }
  }
  if (embeddingProvider && (LOCAL_INFERENCE_IDS as readonly string[]).includes(embeddingProvider)) {
    return INFERENCE_PROVIDERS[embeddingProvider as InferenceProviderId];
  }
  return INFERENCE_PROVIDERS.ollama;
}

/**
 * Best-effort `think:false` injection. Ollama's OpenAI-compat layer honors a
 * top-level `think` field for qwen3. Wrapped fetch keeps the SDK contract
 * intact and only mutates the JSON body for chat/completion POSTs.
 *
 * Typed loosely (input/init as unknown) and cast on return so it satisfies the
 * SDK's `FetchFunction` (Bun's fetch type includes a `preconnect` method that a
 * plain wrapper does not carry) without forcing callers to replicate it.
 * @internal
 */
export function _wrapFetchDisableThink(
  baseFetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
  const wrapped = async (input: any, init?: any): Promise<Response> => {
    try {
      if (init?.body && typeof init.body === "string") {
        const parsed = JSON.parse(init.body);
        if (parsed && typeof parsed === "object" && !("think" in parsed)) {
          parsed.think = false;
          init = { ...init, body: JSON.stringify(parsed) };
        }
      }
    } catch {
      // Not JSON or unparseable — leave the request untouched.
    }
    return baseFetch(input as any, init as any);
  };
  return wrapped as unknown as typeof globalThis.fetch;
}

/**
 * Best-effort `options.num_ctx` injection (PDM-08/PDM-09). Ollama's
 * OpenAI-compat chat layer honors a top-level `options` object; LM Studio
 * has no per-request context-length field (spec A-07, `appliesContextPerRequest:
 * false`) and must never receive this — gated at the call site in
 * `buildProvider`. Merges into any existing `options` object rather than
 * overwriting it, mirroring `_wrapFetchDisableThink`'s shape.
 * @internal
 */
export function _wrapFetchContextWindow(
  baseFetch: typeof globalThis.fetch,
  contextWindow: number,
): typeof globalThis.fetch {
  const wrapped = async (input: any, init?: any): Promise<Response> => {
    try {
      if (init?.body && typeof init.body === "string") {
        const parsed = JSON.parse(init.body);
        if (parsed && typeof parsed === "object") {
          parsed.options = { ...parsed.options, num_ctx: contextWindow };
          init = { ...init, body: JSON.stringify(parsed) };
        }
      }
    } catch {
      // Not JSON or unparseable — leave the request untouched.
    }
    return baseFetch(input as any, init as any);
  };
  return wrapped as unknown as typeof globalThis.fetch;
}

function buildProvider(llm: ReturnType<typeof getLlmConfig>) {
  // Ollama exposes an OpenAI-compatible API at /v1; createOpenAI over baseURL
  // is sufficient (no special compatibility flag in @ai-sdk/openai v3).
  const spec = resolveInferenceSpec(llm.baseUrl);
  let fetchImpl: typeof globalThis.fetch | undefined;
  if (spec.appliesContextPerRequest) {
    fetchImpl = _wrapFetchContextWindow(fetchImpl ?? globalThis.fetch, llm.contextWindow);
  }
  if (llm.disableThink && spec.injectsDisableThink) {
    fetchImpl = _wrapFetchDisableThink(fetchImpl ?? globalThis.fetch);
  }
  const openai = createOpenAI({
    baseURL: llm.baseUrl,
    apiKey: llm.apiKey,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  // The default callable resolves to the Responses API, which LM Studio serves
  // while dropping `text.format` — gating json_schema on correctly still yields
  // prose there. `.chat()` is the endpoint that honours it. See
  // `requiresChatCompletionsApi`.
  return spec.requiresChatCompletionsApi ? openai.chat(llm.model) : openai(llm.model);
}

/**
 * Normalize the reasoning channel exposed by the AI SDK (v5+) into a single
 * string. Handles: array of `{type:"reasoning", text}` parts, a raw string,
 * `providerMetadata.openai.reasoningText`, and the Responses-API error shape
 * (`response.body.output[].summary[].text`). Returns "" when absent.
 *
 * Accepts either a successful `result` or a thrown `AI_NoObjectGeneratedError`
 * (which carries `response.body.output`).
 * @internal
 */
export function _reasoningToText(result: any): string {
  if (!result) return "";
  const rea = result.reasoning;
  if (Array.isArray(rea)) {
    return rea
      .map((x: any) => (x && typeof x.text === "string" ? x.text : ""))
      .join("\n")
      .trim();
  }
  if (typeof rea === "string") return rea.trim();
  const pm = result.providerMetadata?.openai;
  if (pm && typeof pm.reasoningText === "string") return pm.reasoningText.trim();
  // Responses-API shape (thrown AI_NoObjectGeneratedError carries this on
  // e.response.body.output): collect reasoning summaries + message content.
  const output = result?.response?.body?.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const part of output) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "reasoning" && Array.isArray(part.summary)) {
        for (const s of part.summary) {
          if (s && typeof s.text === "string") parts.push(s.text);
        }
      } else if (part.type === "message" && Array.isArray(part.content)) {
        for (const s of part.content) {
          if (s && typeof s.text === "string") parts.push(s.text);
        }
      }
    }
    if (parts.length > 0) return parts.join("\n").trim();
  }
  return "";
}

/**
 * Best-effort extraction of the first balanced JSON object from a free-text
 * (typically reasoning) string. Strips ```json fences first. Returns the
 * parsed object or `undefined` on any failure. Pure; safe to unit-test.
 * @internal
 */
export function _extractJsonObject(text: string): unknown | undefined {
  if (!text) return undefined;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return undefined;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  // AbortSignal.timeout is supported in Bun and Node >= 17.3.
  return AbortSignal.timeout(timeoutMs);
}

/**
 * True when `err` (or anything on its `cause` chain) is a client-side
 * abort/timeout: AbortSignal.timeout throws DOMException("TimeoutError",
 * "The operation timed out."), manual aborts throw "AbortError", and SDK
 * retry wrappers carry the same text in `message`. A timed-out call has no
 * model response, so reasoning-channel recovery has nothing to recover and
 * the "#7 safety net" warning (which exists to flag thinking-model shape
 * shifts) would fire as pure noise on every slow-backend timeout.
 * @internal
 */
export function _isAbortOrTimeoutError(err: unknown): boolean {
  let cur: any = err;
  for (let hops = 0; cur && hops < 5; hops++, cur = cur.cause) {
    const name = typeof cur.name === "string" ? cur.name : "";
    if (name === "TimeoutError" || name === "AbortError") return true;
    const message = typeof cur.message === "string" ? cur.message : "";
    if (/timed out|operation was aborted/i.test(message)) return true;
  }
  return false;
}

/**
 * Per-label consecutive-failure streak, reset to 0 on the next success.
 * Keyed by `opts.label` so unrelated LLM features never share a counter.
 * @internal
 */
const llmFailureStreaks = new Map<string, number>();

/**
 * Test seam: clear every label's failure streak.
 * @internal
 */
export function _resetLlmFailureStreaksForTesting(): void {
  llmFailureStreaks.clear();
}

/**
 * Record a failed LLM call: bumps the label's streak and logs the single
 * canonical failure WARN. `err` is passed through as the meta `error` value
 * (never a `.message` string) so the logger's Error serialization applies.
 * @internal
 */
function recordLlmFailure(
  label: string,
  role: LlmModelRole,
  model: string,
  provider: string,
  timeoutMs: number,
  elapsedMs: number,
  err: Error,
): number {
  const consecutiveFailures = (llmFailureStreaks.get(label) ?? 0) + 1;
  llmFailureStreaks.set(label, consecutiveFailures);
  logger.warn("LLM call failed — using non-LLM fallback", {
    label,
    role,
    model,
    provider,
    timeoutMs,
    elapsedMs,
    timedOut: _isAbortOrTimeoutError(err),
    error: err,
    consecutiveFailures,
  });
  return consecutiveFailures;
}

/**
 * Record a successful LLM call: resets the label's streak, and when the
 * streak being reset was non-zero, logs one INFO recovery line.
 * @internal
 */
function recordLlmSuccess(label: string, model: string): void {
  const priorFailures = llmFailureStreaks.get(label) ?? 0;
  if (priorFailures > 0) {
    logger.info("LLM call recovered", { label, model, afterFailures: priorFailures });
  }
  llmFailureStreaks.set(label, 0);
}

/**
 * Generate a free-form text completion. Returns `{ ok: false }` (never throws)
 * when the LLM is disabled, times out, or errors. When the content channel is
 * empty (qwen3 thinking-model failure mode), falls back to the reasoning
 * channel before degrading.
 */
export async function llmComplete(
  prompt: string,
  opts: LlmCompleteOptions,
): Promise<LlmResult<string>> {
  if (!isLlmEnabled()) {
    return { ok: false, error: "llm disabled" };
  }
  const llm = getLlmConfig({ modelRole: opts.modelRole });
  const provider = resolveInferenceSpec(llm.baseUrl).id;
  const role: LlmModelRole = opts.modelRole ?? "instruct";
  const timeoutMs = opts.timeoutMs ?? llm.timeoutMs;
  const startedAt = Date.now();
  try {
    const result = await generateText({
      model: buildProvider(llm),
      prompt,
      system: opts.system,
      temperature: llm.temperature,
      maxOutputTokens: llm.maxOutputTokens,
      abortSignal: timeoutSignal(timeoutMs),
    });
    const text = (result as any).text ?? "";
    if (text.length > 0) {
      recordLlmSuccess(opts.label, llm.model);
      return { ok: true, value: text };
    }
    // Empty content — try to recover from the reasoning channel.
    if (llm.disableThink) {
      const reasoning = _reasoningToText(result);
      if (reasoning.length > 0) {
        logger.warn("llmComplete: empty content — recovered from reasoning channel", {
          reasoningLen: reasoning.length,
        });
        recordLlmSuccess(opts.label, llm.model);
        return { ok: true, value: reasoning };
      }
      // #7 safety net: reasoning recovery yielded nothing. With the pure-instruct
      // default this branch should be dormant (no reasoning channel); a hit here
      // signals an Ollama shape shift or an env override back to a thinking model.
      logger.warn("llm reasoning-recovery empty", {
        hasReasoning: false,
        finishReason: (result as any)?.finishReason ?? null,
      });
    }
    const emptyErr = new Error("empty content (thinking model)");
    recordLlmFailure(opts.label, role, llm.model, provider, timeoutMs, Date.now() - startedAt, emptyErr);
    return { ok: false, error: emptyErr.message };
  } catch (e) {
    recordLlmFailure(opts.label, role, llm.model, provider, timeoutMs, Date.now() - startedAt, e as Error);
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Generate a structured object validated against a zod schema. Returns
 * `{ ok: false }` (never throws) when the LLM is disabled, times out, returns
 * an invalid object, or errors. When the content channel is empty or the
 * schema fails (qwen3 thinking-model failure mode), attempts to recover JSON
 * from the reasoning channel before degrading.
 */
export async function llmObject<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  opts: LlmObjectOptions,
): Promise<LlmResult<T>> {
  if (!isLlmEnabled()) {
    return { ok: false, error: "llm disabled" };
  }
  const llm = getLlmConfig({ modelRole: opts.modelRole });
  const provider = resolveInferenceSpec(llm.baseUrl).id;
  const role: LlmModelRole = opts.modelRole ?? "instruct";
  const timeoutMs = opts.timeoutMs ?? llm.timeoutMs;
  const startedAt = Date.now();
  let result: any = null;
  try {
    // json_schema constrained decoding (W7-07): when Ollama >= 0.5.0,
    // generateObject passes the Zod schema as json_schema to Ollama for
    // constrained decoding (the SDK maps responseFormat.type="json" + schema
    // to json_schema). When Ollama < 0.5.0 (or version check fails), fall
    // back to json_object (no schema) and validate manually afterward.
    const useJsonSchema = llm.disableThink && (await _checkJsonSchemaSupport());

    if (useJsonSchema) {
      // json_schema path: SDK sends format=json_schema with the compiled schema.
      // schemaName provides additional LLM guidance. No providerOptions needed.
      result = await generateObject({
        model: buildProvider(llm),
        prompt,
        system: opts.system,
        schema,
        schemaName: "response",
        temperature: llm.temperature,
        maxOutputTokens: llm.maxOutputTokens,
        abortSignal: timeoutSignal(timeoutMs),
      });
      logger.debug("json_schema: constrained decoding used", { label: opts.label, model: llm.model });
      recordLlmSuccess(opts.label, llm.model);
      return { ok: true, value: result.object };
    }

    // Fallback path (Ollama < 0.5.0 or disableThink off): use no-schema output
    // so the SDK sends json_object (no json_schema) to avoid version errors,
    // then validate the returned object against the Zod schema manually.
    result = await generateObject({
      model: buildProvider(llm),
      prompt,
      system: opts.system,
      output: "no-schema",
      temperature: llm.temperature,
      maxOutputTokens: llm.maxOutputTokens,
      abortSignal: timeoutSignal(timeoutMs),
    });
    const validated = schema.safeParse(result.object);
    if (validated.success) {
      logger.debug("json_schema: fallback to json_object — validated", { label: opts.label, model: llm.model });
      recordLlmSuccess(opts.label, llm.model);
      return { ok: true, value: validated.data };
    }
    // Manual validation failed — try reasoning-channel recovery before degrading.
    if (llm.disableThink) {
      const reasoning = _reasoningToText(result);
      if (reasoning.length > 0) {
        const parsed = _extractJsonObject(reasoning);
        if (parsed !== undefined) {
          const recovered = schema.safeParse(parsed);
          if (recovered.success) {
            logger.warn("llmObject: recovered object from reasoning channel (fallback path)", {
              reasoningLen: reasoning.length,
            });
            recordLlmSuccess(opts.label, llm.model);
            return { ok: true, value: recovered.data };
          }
        }
      }
    }
    const validationErr = new Error("schema validation failed (fallback path)");
    recordLlmFailure(opts.label, role, llm.model, provider, timeoutMs, Date.now() - startedAt, validationErr);
    return { ok: false, error: validationErr.message };
  } catch (e) {
    // generateObject throws AI_NoObjectGeneratedError on schema mismatch / empty
    // parse — the thrown error carries the raw response (with reasoning). The
    // successful-but-empty case is covered by `result` above; here recover from
    // the error itself before degrading. Aborts/timeouts carry no response at
    // all — skip recovery and the safety net for them, or every slow-backend
    // timeout logs a misleading "reasoning-recovery empty" pair.
    if (llm.disableThink && !_isAbortOrTimeoutError(e)) {
      const reasoning =
        _reasoningToText(result).length > 0 ? _reasoningToText(result) : _reasoningToText(e);
      if (reasoning.length > 0) {
        const parsed = _extractJsonObject(reasoning);
        if (parsed !== undefined) {
          const validated = schema.safeParse(parsed);
          if (validated.success) {
            logger.warn("llmObject: recovered object from reasoning channel", {
              reasoningLen: reasoning.length,
            });
            recordLlmSuccess(opts.label, llm.model);
            return { ok: true, value: validated.data };
          }
        }
      }
      // #7 safety net: reasoning recovery yielded nothing. Dormant with the
      // pure-instruct default; a hit signals a shape shift / thinking-model override.
      logger.warn("llm reasoning-recovery empty", {
        hasReasoning: false,
        finishReason: (e as any)?.finishReason ?? null,
      });
    }
    recordLlmFailure(opts.label, role, llm.model, provider, timeoutMs, Date.now() - startedAt, e as Error);
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Injectable handle bundling both calls, so callers (consolidator, etc.) can
 * be tested with a fake LLM without touching config or network.
 */
export const llm = {
  complete: llmComplete,
  object: llmObject,
  isEnabled: isLlmEnabled,
};
