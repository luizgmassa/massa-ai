/**
 * SEN-03 — the isolated runner must not hand a test child the developer's own
 * machine state.
 *
 * These assert `buildChildEnv` directly rather than observing a suite that
 * happens to pass. The leak this closes is invisible from a green run: it costs
 * 42030 ms cold and 690 ms warm against a 5 s per-test budget, so it passes on a
 * warm model and hangs on a cold one, and CI never sees it at all because CI has
 * neither a config file nor a `.env`. A test that only checks "the suite is
 * green" cannot distinguish a closed leak from a warm cache.
 *
 * Two independent paths reach the same symptom. Closing only the first is the
 * mistake this file exists to catch:
 *
 *   1. `config.json` under `CONFIG_DIR`, which derives from `XDG_CONFIG_HOME`.
 *   2. `.env`, which `packages/shared/src/env.ts` loads by walking up from cwd
 *      independently of `XDG_CONFIG_HOME`, and which wins over `config.json`
 *      in `packages/shared/src/config/index.ts`'s `envBool(...)` resolution.
 */

import { describe, expect, test } from "bun:test";

import { buildChildEnv } from "../lib/run-tests-isolated.js";

const SCRATCH = "/tmp/scratch-config-home";

describe("SEN-03: buildChildEnv — config-dir leak path", () => {
  test("points the child at the scratch config home", () => {
    const child = buildChildEnv({}, SCRATCH);
    expect(child.XDG_CONFIG_HOME).toBe(SCRATCH);
  });

  test("overrides an ambient XDG_CONFIG_HOME rather than trusting it", () => {
    // A Linux shell exporting the real ~/.config is the case that makes
    // "respect whatever is already set" the wrong rule.
    const child = buildChildEnv({ XDG_CONFIG_HOME: "/home/dev/.config" }, SCRATCH);
    expect(child.XDG_CONFIG_HOME).toBe(SCRATCH);
  });

  test("yields to an explicit MASSA_AI_TEST_CONFIG_HOME so check-coverage composes", () => {
    const child = buildChildEnv(
      { XDG_CONFIG_HOME: "/home/dev/.config", MASSA_AI_TEST_CONFIG_HOME: "/tmp/coverage-scratch" },
      SCRATCH,
    );
    expect(child.XDG_CONFIG_HOME).toBe("/tmp/coverage-scratch");
  });
});

describe("SEN-03: buildChildEnv — .env leak path", () => {
  /**
   * The gate is *assigned* `"false"`, never deleted, and that distinction is
   * the entire fix.
   *
   * Bun auto-loads `.env` in the child before any user code runs. An absent key
   * is precisely what that repopulates, so deleting `MASSA_AI_LLM_ENABLED` and
   * stopping there hands the child back the value it just removed. An
   * explicitly inherited value outranks Bun's `.env` load and survives.
   * Measured, not assumed: with the key absent `.env` won; with it set to
   * `"false"` the assignment won.
   */
  test("pins MASSA_AI_LLM_ENABLED to false rather than deleting it", () => {
    const child = buildChildEnv({ MASSA_AI_LLM_ENABLED: "true" }, SCRATCH);
    expect(child.MASSA_AI_LLM_ENABLED).toBe("false");
  });

  test("pins the gate even when the parent never set it — a repo .env could", () => {
    const child = buildChildEnv({}, SCRATCH);
    expect(child.MASSA_AI_LLM_ENABLED).toBe("false");
  });

  test("strips the other nine MASSA_AI_LLM_* knobs, which are inert once disabled", () => {
    const child = buildChildEnv(
      {
        MASSA_AI_LLM_ENABLED: "true",
        MASSA_AI_LLM_MODEL: "qwen3.5:9b",
        MASSA_AI_LLM_BASE_URL: "http://127.0.0.1:11434",
      },
      SCRATCH,
    );
    expect(child.MASSA_AI_LLM_MODEL).toBeUndefined();
    expect(child.MASSA_AI_LLM_BASE_URL).toBeUndefined();
  });

  test("keeps everything when a caller opts in explicitly", () => {
    const child = buildChildEnv(
      { MASSA_AI_LLM_ENABLED: "true", MASSA_AI_LLM_MODEL: "qwen3.5:9b", MASSA_AI_TEST_ALLOW_LLM: "1" },
      SCRATCH,
    );
    expect(child.MASSA_AI_LLM_ENABLED).toBe("true");
    expect(child.MASSA_AI_LLM_MODEL).toBe("qwen3.5:9b");
  });
});

describe("SEN-03: buildChildEnv — everything else passes through", () => {
  test("DATABASE_URL reaches the child unchanged", () => {
    const url = "postgresql://massa_ai:massa_ai_password@127.0.0.1:5433/massa_ai_test";
    const child = buildChildEnv({ DATABASE_URL: url }, SCRATCH);
    expect(child.DATABASE_URL).toBe(url);
  });

  test("unrelated MASSA_AI_* knobs are untouched — only the LLM prefix is stripped", () => {
    const child = buildChildEnv(
      { MASSA_AI_DEDICATED: "1", MASSA_AI_EMBEDDED: "true", MASSA_AI_EXECUTOR_SANDBOX: "none" },
      SCRATCH,
    );
    expect(child.MASSA_AI_DEDICATED).toBe("1");
    expect(child.MASSA_AI_EMBEDDED).toBe("true");
    expect(child.MASSA_AI_EXECUTOR_SANDBOX).toBe("none");
  });

  test("does not mutate the parent environment it was given", () => {
    const parent: NodeJS.ProcessEnv = { MASSA_AI_LLM_ENABLED: "true" };
    buildChildEnv(parent, SCRATCH);
    expect(parent.MASSA_AI_LLM_ENABLED).toBe("true");
  });
});
