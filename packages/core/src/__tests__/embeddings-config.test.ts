import { afterEach, describe, expect, test } from "bun:test";
import { getRateLimits, getMaxChars } from "../services/embeddings/config.js";

/**
 * Focused unit coverage for the falsy-`0` env-parsing migration (COVERAGE #4).
 *
 * The old `Number(env) || fallback` idiom silently dropped a legitimate explicit
 * `0`. These migrations route each raw env winner through `parsePositiveIntEnv`:
 *  - `batchDelayMs` opts into `{ allowZero: true }` (0 = no delay is valid).
 *  - `rpm`/`tpm`/`rpd`/`batchSize`/`maxChars` use the default floor (0 is
 *    nonsensical → treated as unset → falls to the default/heuristic).
 *
 * We assert both the honored-zero case (batchDelayMs) and the floor case
 * (batchSize), plus the prefix-wins / empty-falls-through resolution order, to
 * lock in the migration semantics without re-testing the helper itself.
 */

const ENV_KEYS = [
  "GOOGLE_EMBEDDING_RPM",
  "GOOGLE_EMBEDDING_TPM",
  "GOOGLE_EMBEDDING_RPD",
  "GOOGLE_EMBEDDING_BATCH_SIZE",
  "GOOGLE_EMBEDDING_BATCH_DELAY",
  "GOOGLE_EMBEDDING_MAX_CHARS",
  "EMBEDDING_RPM",
  "EMBEDDING_TPM",
  "EMBEDDING_RPD",
  "EMBEDDING_BATCH_SIZE",
  "EMBEDDING_BATCH_DELAY",
  "EMBEDDING_MAX_CHARS",
] as const;

const original: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) original[k] = process.env[k];

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

afterEach(() => {
  clearEnv();
  for (const k of ENV_KEYS) {
    if (original[k] !== undefined) process.env[k] = original[k];
  }
});

describe("embeddings config: falsy-0 env parsing (COVERAGE #4)", () => {
  test("explicit EMBEDDING_BATCH_DELAY=0 is honored, not silently dropped", () => {
    process.env.EMBEDDING_BATCH_DELAY = "0";
    const rl = getRateLimits("GOOGLE");
    // batchDelayMs=0 is a legitimate "no delay" intent → must surface as 0,
    // not be replaced by `undefined`.
    expect(rl).toBeDefined();
    expect(rl!.batchDelayMs).toBe(0);
  });

  test("provider-prefix EMBEDDING_BATCH_DELAY=0 wins over base var", () => {
    process.env.GOOGLE_EMBEDDING_BATCH_DELAY = "0";
    process.env.EMBEDDING_BATCH_DELAY = "500";
    const rl = getRateLimits("GOOGLE");
    expect(rl).toBeDefined();
    expect(rl!.batchDelayMs).toBe(0);
  });

  test("empty provider-prefix var falls through to base var", () => {
    process.env.GOOGLE_EMBEDDING_BATCH_DELAY = "";
    process.env.EMBEDDING_BATCH_DELAY = "250";
    const rl = getRateLimits("GOOGLE");
    expect(rl).toBeDefined();
    expect(rl!.batchDelayMs).toBe(250);
  });

  test("EMBEDDING_BATCH_SIZE=0 floors to unset (0 nonsensical), not carried as 0", () => {
    process.env.EMBEDDING_BATCH_SIZE = "0";
    const rl = getRateLimits("GOOGLE");
    // 0 is not a valid batch size → treated as unset → result undefined (no
    // other knobs set), and even when other knobs are set batchSize stays
    // undefined rather than 0.
    expect(rl).toBeUndefined();

    process.env.EMBEDDING_RPM = "60";
    const rl2 = getRateLimits("GOOGLE");
    expect(rl2).toBeDefined();
    expect(rl2!.batchSize).toBeUndefined();
    expect(rl2!.requestsPerMinute).toBe(60);
  });

  test("EMBEDDING_MAX_CHARS=0 floors to the model heuristic", () => {
    process.env.EMBEDDING_MAX_CHARS = "0";
    // qwen3-embedding-* heuristic → 8000; 0 must NOT short-circuit to 0.
    const chars = getMaxChars("OLLAMA", "qwen3-embedding:8b");
    expect(chars).toBe(8000);
  });

  test("valid positive EMBEDDING_MAX_CHARS still overrides the heuristic", () => {
    process.env.EMBEDDING_MAX_CHARS = "12345";
    expect(getMaxChars("OLLAMA", "qwen3-embedding:8b")).toBe(12345);
  });

  test("garbage env value floors to unset rather than NaN", () => {
    process.env.EMBEDDING_RPM = "not-a-number";
    const rl = getRateLimits("GOOGLE");
    expect(rl).toBeUndefined();
  });
});
