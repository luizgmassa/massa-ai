/**
 * ObservationConsolidationJob tests (Phase 3 bridge).
 *
 * Test-isolation rule (Phase 1/2): do NOT `mock.module("@massa-ai/shared")`.
 * Inject a fake LlmSurface, a fake store, and a fake memory repo that captures
 * inserts. Use ctor overrides (minObservations etc.) so no shared config is
 * relied upon.
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { setTimeout as sleep } from "timers/promises";
import {
  ObservationConsolidationJob,
  buildObservationPrompt,
} from "../services/jobs/observation-consolidation-job.js";
import {
  MemoryObservationStore,
  type InsertableObservation,
} from "../data/memory/observation-repository.js";
import { eventBus } from "../services/events/event-bus.js";
import type { LlmSurface } from "../services/memory/consolidator.js";
import type { z } from "zod";
import { scrubCredentials } from "../kernel/sanitize/credential-scrub.js";

// ── Fakes ───────────────────────────────────────────────────────────────────

interface CapturedInsert {
  id: string;
  content: string;
  type: string;
  metadata: Record<string, unknown>;
}

function makeFakeMemoryRepo() {
  const inserted: CapturedInsert[] = [];
  const repo = {
    inserted,
    insert(input: any): void {
      inserted.push({
        id: input.id,
        content: input.content,
        type: input.type,
        metadata: input.metadata ?? {},
      });
    },
  };
  return repo;
}

/** A fake LlmSurface that returns a fixed valid batch when enabled. */
function enabledSurface(): LlmSurface & { calls: number } {
  const surface = {
    calls: 0,
    isEnabled: () => true,
    async object<T>(_prompt: string, _schema: z.ZodSchema<T>): Promise<{
      ok: boolean;
      value?: T;
      error?: string;
    }> {
      // Return a valid ConsolidatedBatch-compatible value.
      return {
        ok: true,
        value: {
          summary: "Consolidated observation summary",
          type: "pattern",
          level: 2,
          rationale: "themes overlap",
          sourceIds: ["obs-1", "obs-2"],
        } as any as T,
      };
    },
  };
  return surface as LlmSurface & { calls: number };
}

function disabledSurface(): LlmSurface {
  return {
    isEnabled: () => false,
    async object() {
      return { ok: false, error: "disabled" };
    },
  };
}

function failingSurface(): LlmSurface {
  return {
    isEnabled: () => true,
    async object() {
      return { ok: false, error: "boom" };
    },
  };
}

function makeStoreWith(n: number): MemoryObservationStore {
  const s = new MemoryObservationStore();
  for (let i = 0; i < n; i++) {
    // XP-02: routed through scrubCredentials — s.insert() requires
    // InsertableObservation (branded payloadJson).
    const obs: InsertableObservation = {
      id: `obs-${i + 1}`,
      projectId: "p",
      sessionId: null,
      source: "user-prompt",
      payloadJson: scrubCredentials(JSON.stringify({ prompt: `q${i}` })).sanitized,
      importance: 0.5,
      createdAt: Date.now() - (n - i) * 1000,
    };
    s.insert(obs);
  }
  return s;
}

// Patch getMemoryRepository to return our fake. We import the module and
// override the function binding via a module-level mock only for THIS file is
// not allowed (process-wide). Instead, the job calls getMemoryRepository() at
// run-time; we cannot easily intercept it. So we verify via the EventBus event
// (memory:consolidated) which carries newMemoryId, and we accept that the real
// repository.insert is also invoked (it writes to the real PostgreSQL store; this
// is fine — it's additive and isolated by projectId). The captured-insert
// assertion is replaced by event-shape + runOnce return assertions.

describe("ObservationConsolidationJob", () => {
  let store: MemoryObservationStore;

  beforeEach(() => {
    store = makeStoreWith(4);
  });

  it("P3-CONSOLIDATE-01: with LLM on, turns observations into a memory and emits memory:consolidated", async () => {
    const surface = enabledSurface();
    const memRepo = makeFakeMemoryRepo();
    const job = new ObservationConsolidationJob({
      llm: surface,
      store,
      memoryRepo: memRepo,
      maxWindow: 8,
      minObservations: 1,
      minIntervalMs: 0,
    });

    let captured: any = null;
    const unsub = eventBus.subscribe("memory:consolidated", (p) => {
      captured = p;
    });

    try {
      const res = await job.runOnce("p");
      expect(res.consolidated).toBe(true);
      expect(res.batchesCreated).toBe(1);
      await sleep(5);
      expect(captured).not.toBeNull();
      expect(captured.projectId).toBe("p");
      expect(captured.newMemoryId).toMatch(/^mem-/);
      expect(captured.sourceIds).toEqual(["obs-1", "obs-2"]);
      expect(captured.stats.batchesCreated).toBe(1);
      // The summary memory was inserted via the injected repo.
      expect(memRepo.inserted.length).toBe(1);
      expect(memRepo.inserted[0].content).toBe("Consolidated observation summary");
      expect(memRepo.inserted[0].type).toBe("pattern");
      expect(memRepo.inserted[0].metadata).toMatchObject({ source: "observations" });
    } finally {
      unsub();
    }
  });

  it("P3-CONSOLIDATE-02: with LLM off (isEnabled=false), is a no-op (no memory, no throw)", async () => {
    const surface = disabledSurface();
    const memRepo = makeFakeMemoryRepo();
    const job = new ObservationConsolidationJob({
      llm: surface,
      store,
      memoryRepo: memRepo,
      maxWindow: 8,
      minObservations: 1,
      minIntervalMs: 0,
    });

    let sawEvent = false;
    const unsub = eventBus.subscribe("memory:consolidated", () => {
      sawEvent = true;
    });

    try {
      const res = await job.runOnce("p");
      expect(res.consolidated).toBe(false);
      expect(res.batchesCreated).toBe(0);
      await sleep(5);
      expect(sawEvent).toBe(false);
      expect(memRepo.inserted.length).toBe(0);
    } finally {
      unsub();
    }
  });

  it("P3-CONSOLIDATE-03: with LLM on but {ok:false}, is a no-op (no memory, no throw)", async () => {
    const surface = failingSurface();
    const memRepo = makeFakeMemoryRepo();
    const job = new ObservationConsolidationJob({
      llm: surface,
      store,
      memoryRepo: memRepo,
      maxWindow: 8,
      minObservations: 1,
      minIntervalMs: 0,
    });

    let sawEvent = false;
    const unsub = eventBus.subscribe("memory:consolidated", () => {
      sawEvent = true;
    });

    try {
      const res = await job.runOnce("p");
      expect(res.consolidated).toBe(false);
      expect(res.batchesCreated).toBe(0);
      await sleep(5);
      expect(sawEvent).toBe(false);
      expect(memRepo.inserted.length).toBe(0);
    } finally {
      unsub();
    }
  });

  it("is a no-op when fewer than 2 observations exist", async () => {
    const tiny = makeStoreWith(1);
    const surface = enabledSurface();
    const job = new ObservationConsolidationJob({
      llm: surface,
      store: tiny,
      maxWindow: 8,
      minObservations: 1,
      minIntervalMs: 0,
    });
    const res = await job.runOnce("p");
    expect(res.consolidated).toBe(false);
  });

  it("maybeRun is debounce-gated and fire-and-forget (never throws)", async () => {
    const surface = disabledSurface(); // ensures runOnce is a cheap no-op
    const job = new ObservationConsolidationJob({
      llm: surface,
      store,
      maxWindow: 8,
      minObservations: 100, // high so maybeRun should NOT fire runOnce
      minIntervalMs: 60_000,
    });
    const before = job.runCalls;
    job.maybeRun("p");
    job.maybeRun("p");
    expect(job.runCalls).toBe(before); // did not fire
    expect(() => job.maybeRun("p")).not.toThrow();
  });

  it("maybeRun fires runOnce once thresholds are crossed", async () => {
    const surface = enabledSurface();
    const job = new ObservationConsolidationJob({
      llm: surface,
      store,
      maxWindow: 8,
      minObservations: 2,
      minIntervalMs: 0,
    });
    const before = job.runCalls;
    job.maybeRun("p");
    job.maybeRun("p"); // second call crosses minObservations=2
    await sleep(20);
    expect(job.runCalls).toBeGreaterThan(before);
  });

  it("runOnce is single-flight: a run started while one is in flight makes no LLM call", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const surface = enabledSurface();
    const slowSurface: LlmSurface = {
      isEnabled: () => true,
      async object<T>(prompt: string, schema: z.ZodSchema<T>) {
        surface.calls++;
        await gate;
        return surface.object(prompt, schema);
      },
    };
    const job = new ObservationConsolidationJob({
      llm: slowSurface,
      store,
      memoryRepo: makeFakeMemoryRepo(),
      maxWindow: 8,
      minObservations: 1,
      minIntervalMs: 0,
    });

    const first = job.runOnce("p");
    const second = await job.runOnce("p");
    expect(second.consolidated).toBe(false);
    expect(surface.calls).toBe(1);

    release();
    expect((await first).consolidated).toBe(true);

    const third = await job.runOnce("p");
    expect(third.consolidated).toBe(true);
    expect(surface.calls).toBe(2);
  });
});

describe("ObservationConsolidationJob single-flight release", () => {
  it("releases the guard when a run throws", async () => {
    let calls = 0;
    const good = makeStoreWith(4);
    const flakyStore = {
      listRecent(projectId: string, limit: number) {
        calls++;
        if (calls === 1) return [{ id: "bad-1" }, { id: "bad-2" }] as any;
        return good.listRecent(projectId, limit);
      },
    } as any;
    const job = new ObservationConsolidationJob({
      llm: enabledSurface(),
      store: flakyStore,
      memoryRepo: makeFakeMemoryRepo(),
      maxWindow: 8,
      minObservations: 1,
      minIntervalMs: 0,
    });
    await expect(job.runOnce("p")).rejects.toThrow();
    expect((await job.runOnce("p")).consolidated).toBe(true);
  });
});

describe("buildObservationPrompt", () => {
  function observation(id: string, payload: Record<string, unknown>) {
    return {
      id,
      projectId: "p",
      sessionId: null,
      source: "post-tool-use",
      payloadJson: JSON.stringify(payload),
      importance: 0.5,
      createdAt: Date.now(),
    } as any;
  }

  const hookPayload = (i: number) => ({
    session_id: `3adaa66f-8d51-4644-a838-db58b4200a4${i}`,
    transcript_path: `/Users/someone/.claude/projects/x/transcript-${i}.jsonl`,
    cwd: "/Users/someone/Projects/app",
    prompt_id: "29e16dea-b076-4d8d-9e39-b0702e347218",
    tool_use_id: "toolu_0187jKeyXduTSrdZqtzs6jpJ",
    hook_event_name: "PostToolUse",
    permission_mode: "auto",
    tool_name: "Bash",
    tool_input: { command: `bun test packages/core/src/__tests__/file-${i}.test.ts` },
    tool_response: { stdout: `START-${i} ` + "x".repeat(60_000), stderr: "" },
  });

  it("caps the prompt for a full window of oversized hook payloads", () => {
    const window = Array.from({ length: 8 }, (_, i) => observation(`obs-${i}`, hookPayload(i)));
    const prompt = buildObservationPrompt(window);
    expect(prompt.length).toBeLessThan(12_000);
  });

  it("keeps the content signal and every source id", () => {
    const window = Array.from({ length: 8 }, (_, i) => observation(`obs-${i}`, hookPayload(i)));
    const prompt = buildObservationPrompt(window);
    for (let i = 0; i < 8; i++) {
      expect(prompt).toContain(`id=obs-${i}`);
      expect(prompt).toContain(`file-${i}.test.ts`);
      expect(prompt).toContain(`START-${i}`);
    }
    expect(prompt).toContain('"tool_name":"Bash"');
  });

  it("drops hook bookkeeping fields that carry no content", () => {
    const prompt = buildObservationPrompt([observation("obs-a", hookPayload(1)), observation("obs-b", hookPayload(2))]);
    for (const key of ["session_id", "transcript_path", "cwd", "prompt_id", "tool_use_id", "hook_event_name", "permission_mode"]) {
      expect(prompt).not.toContain(`"${key}"`);
    }
  });

  it("keeps a large window inside the same total budget", () => {
    const window = Array.from({ length: 50 }, (_, i) => observation(`obs-${i}`, hookPayload(i)));
    const prompt = buildObservationPrompt(window);
    expect(prompt.length).toBeLessThan(16_000);
    expect(prompt).toContain("id=obs-49");
  });

  it("falls back to a capped raw payload when payloadJson is not JSON", () => {
    const raw = { ...observation("obs-raw", {}), payloadJson: "not json " + "y".repeat(50_000) };
    const prompt = buildObservationPrompt([raw, observation("obs-b", { prompt: "hello" })]);
    expect(prompt).toContain("not json");
    expect(prompt.length).toBeLessThan(3_000);
  });
});
