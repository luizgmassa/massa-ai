/**
 * Unit tests for SalienceJudge (Phase 7b).
 *
 * Mocks config + LLM surface. No DB, no network.
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import type { z } from "zod";

// ── Mock config ─────────────────────────────────────────────────────────────

let autoImportanceEnabled = false;

mock.module("@massa-ai/shared", () => ({
  config: {
    get: (key: string) => {
      if (key === "memory") {
        return { autoImportance: { enabled: autoImportanceEnabled } };
      }
      return {};
    },
  },
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
  MemoryType: {
    DECISION: "decision",
    PATTERN: "pattern",
    CODE: "code",
    CONVERSATION: "conversation",
    CRITICAL: "critical",
  },
}));

import { SalienceJudge, NEUTRAL_SALIENCE, SalienceSchema, _setSalienceJudgeForTesting } from "../services/memory/salience-judge.js";
import type { QueryLlmSurface } from "../services/search/query-understanding.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSurface(opts: {
  enabled?: boolean;
  ok?: boolean;
  value?: any;
  throwErr?: boolean;
  useDefault?: boolean;
}): QueryLlmSurface {
  return {
    isEnabled: () => opts.enabled ?? true,
    async complete() {
      return { ok: true, value: "ok" };
    },
    async object<T>(_prompt: string, _schema: z.ZodSchema<T>) {
      if (opts.throwErr) throw new Error("llm boom");
      if (opts.ok === false) return { ok: false, error: "boom" };
      const val = opts.useDefault ? { importance: 0.8 } : opts.value;
      return { ok: true, value: val as any as T };
    },
  };
}

describe("SalienceJudge", () => {
  beforeEach(() => {
    autoImportanceEnabled = false;
    _setSalienceJudgeForTesting(null);
  });

  // ── scoreSalience ─────────────────────────────────────────────────────────

  describe("scoreSalience", () => {
    test("returns neutral default when autoImportance disabled", async () => {
      const judge = new SalienceJudge(makeSurface({ enabled: true }));
      const result = await judge.scoreSalience("content", "decision" as any);
      expect(result.salience).toBe(NEUTRAL_SALIENCE);
      expect(result.source).toBe("default");
    });

    test("returns neutral default when LLM disabled", async () => {
      autoImportanceEnabled = true;
      const judge = new SalienceJudge(makeSurface({ enabled: false }));
      const result = await judge.scoreSalience("content", "decision" as any);
      expect(result.salience).toBe(NEUTRAL_SALIENCE);
      expect(result.source).toBe("default");
    });

    test("returns neutral default for empty content", async () => {
      autoImportanceEnabled = true;
      const judge = new SalienceJudge(makeSurface({ enabled: true }));
      const result = await judge.scoreSalience("", "decision" as any);
      expect(result.salience).toBe(NEUTRAL_SALIENCE);
      expect(result.source).toBe("default");
    });

    test("returns neutral default for whitespace-only content", async () => {
      autoImportanceEnabled = true;
      const judge = new SalienceJudge(makeSurface({ enabled: true }));
      const result = await judge.scoreSalience("   \n\t  ", "decision" as any);
      expect(result.salience).toBe(NEUTRAL_SALIENCE);
      expect(result.source).toBe("default");
    });

    test("returns LLM score when enabled and LLM succeeds", async () => {
      autoImportanceEnabled = true;
      const judge = new SalienceJudge(makeSurface({ enabled: true, value: { importance: 0.9 } }));
      const result = await judge.scoreSalience("important content", "decision" as any);
      expect(result.salience).toBe(0.9);
      expect(result.source).toBe("llm");
    });

    test("clamps LLM score to [0,1]", async () => {
      autoImportanceEnabled = true;
      const judge = new SalienceJudge(makeSurface({ enabled: true, value: { importance: 1.5 } }));
      const result = await judge.scoreSalience("content", "decision" as any);
      expect(result.salience).toBe(1);
    });

    test("clamps negative LLM score to 0", async () => {
      autoImportanceEnabled = true;
      const judge = new SalienceJudge(makeSurface({ enabled: true, value: { importance: -0.5 } }));
      const result = await judge.scoreSalience("content", "decision" as any);
      expect(result.salience).toBe(0);
    });

    test("returns neutral default when LLM returns {ok:false}", async () => {
      autoImportanceEnabled = true;
      const judge = new SalienceJudge(makeSurface({ enabled: true, ok: false }));
      const result = await judge.scoreSalience("content", "decision" as any);
      expect(result.salience).toBe(NEUTRAL_SALIENCE);
      expect(result.source).toBe("default");
    });

    test("returns neutral default when LLM throws", async () => {
      autoImportanceEnabled = true;
      const judge = new SalienceJudge(makeSurface({ enabled: true, throwErr: true }));
      const result = await judge.scoreSalience("content", "decision" as any);
      expect(result.salience).toBe(NEUTRAL_SALIENCE);
      expect(result.source).toBe("default");
    });

    test("returns neutral default when LLM returns null value", async () => {
      autoImportanceEnabled = true;
      const judge = new SalienceJudge(makeSurface({ enabled: true, value: null }));
      const result = await judge.scoreSalience("content", "decision" as any);
      expect(result.salience).toBe(NEUTRAL_SALIENCE);
      expect(result.source).toBe("default");
    });
  });

  // ── SalienceSchema ────────────────────────────────────────────────────────

  describe("SalienceSchema", () => {
    test("accepts valid importance in [0,1]", () => {
      expect(SalienceSchema.safeParse({ importance: 0.5 }).success).toBe(true);
      expect(SalienceSchema.safeParse({ importance: 0 }).success).toBe(true);
      expect(SalienceSchema.safeParse({ importance: 1 }).success).toBe(true);
    });

    test("rejects importance out of range", () => {
      expect(SalienceSchema.safeParse({ importance: -0.1 }).success).toBe(false);
      expect(SalienceSchema.safeParse({ importance: 1.1 }).success).toBe(false);
    });

    test("rejects non-number importance", () => {
      expect(SalienceSchema.safeParse({ importance: "high" }).success).toBe(false);
    });
  });

  // ── getSalienceJudge / _setSalienceJudgeForTesting ─────────────────────────

  describe("getSalienceJudge / _setSalienceJudgeForTesting", () => {
    test("getSalienceJudge returns a default instance", async () => {
      const { getSalienceJudge } = await import("../services/memory/salience-judge.js");
      const judge = getSalienceJudge();
      expect(judge).toBeDefined();
      _setSalienceJudgeForTesting(null);
    });

    test("_setSalienceJudgeForTesting overrides the module-level judge", async () => {
      const { getSalienceJudge } = await import("../services/memory/salience-judge.js");
      const fakeJudge = new SalienceJudge(makeSurface({ enabled: false }));
      _setSalienceJudgeForTesting(fakeJudge);
      expect(getSalienceJudge()).toBe(fakeJudge);
      _setSalienceJudgeForTesting(null);
    });
  });
});