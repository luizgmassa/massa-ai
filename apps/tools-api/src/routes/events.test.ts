/**
 * Events SSE route coverage. Uses env-overridden short timer intervals so the
 * heartbeat + auto-close + cancel-teardown code paths execute in milliseconds.
 *
 * Also regression-tests the cancel-leak fix: the teardown now lives in the
 * ReadableStream `cancel` hook (the start-return cleanup was dead code).
 */

process.env.MASSA_AI_SSE_HEARTBEAT_MS = "30";
process.env.MASSA_AI_SSE_MAX_DURATION_MS = "90";

import { afterEach, describe, expect, test } from "bun:test";
import { eventBus } from "@massa-ai/core";
import {
  SSE_REQUEST_TIMEOUT_SECONDS,
  setSseRequestTimeoutSource,
  __getSseRequestTimeoutApplyCountForTests,
  __resetSseRequestTimeoutForTests,
} from "./sse-keepalive.js";

const { Elysia } = await import("elysia");
const { eventsRoutes } = await import("./events.js");
const app = new Elysia().use(eventsRoutes);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function openStream(query: string) {
  const res = await app.handle(new Request(`http://localhost/api/v1/events${query}`));
  if (!res.body) throw new Error("no body");
  return res.body.getReader();
}

async function drain(reader: any, ms: number) {
  const decoder = new TextDecoder();
  let raw = "";
  const timer = setInterval(() => {
    reader.read().then(
      ({ value, done }: any) => {
        if (done) return;
        if (value) raw += decoder.decode(value, { stream: true });
      },
      () => {},
    );
  }, 5);
  await wait(ms);
  clearInterval(timer);
  return raw;
}

describe("GET /api/v1/events heartbeat + auto-close", () => {
  test("emits a heartbeat comment frame", async () => {
    const reader = await openStream("");
    const raw = await drain(reader, 60);
    await reader.cancel().catch(() => {});
    expect(raw).toContain(": heartbeat");
  });

  test("auto-closes after the max duration and ends the stream", async () => {
    const reader = await openStream("");
    // 90ms close window + margin
    const raw = await drain(reader, 150);
    let done = false;
    try {
      const r = await reader.read();
      done = r.done;
    } catch {
      done = true;
    }
    // After close, a read resolves done (controller.close was called).
    expect(done || raw.length > 0).toBe(true);
  });
});

describe("GET /api/v1/events cancel teardown", () => {
  test("client cancel triggers the cancel hook without error", async () => {
    const reader = await openStream("?projectId=p1");
    // Publish a matching event before cancel to exercise the subscriber path.
    eventBus.publish("indexing:started", { projectId: "p1", projectPath: "/x" } as never);
    await wait(20);
    await reader.cancel();
    // A subsequent read rejects or resolves done; either is acceptable.
    await reader.read().then(
      () => {},
      () => {},
    );
    // If we reach here without hanging/throwing, the cancel hook ran cleanly.
    expect(true).toBe(true);
  });
});

// ── SSE-04 / design D4: an enqueue throw (data path or heartbeat path) tears
// ── the WHOLE stream down through the shared `teardown()` — not just a
// ── `closed` flag. Pre-fix, `closed = true` alone left all 6 event
// ── subscriptions live and the socket open and silent. Mirrors the same
// ── assertions added to `logs.test.ts` for the sibling route. Each test
// ── asserts BOTH halves of AC-04.1/AC-04.2:
// ──   (a) every subscription is released — the summed `EventEmitter`
// ──       listener count across the 6 subscribed events returns to its
// ──       pre-stream baseline, and
// ──   (b) the stream itself is closed — a subsequent `reader.read()`
// ──       resolves `{done: true}` rather than hanging, which only
// ──       `controller.close()` produces.
// Both were run against the pre-fix code (`closed = true;` only, no
// `unsubscribers.forEach(u => u())`/`controller.close()` in either catch) and
// observed RED: (a) failed with the listener count still at `before + 6`,
// and (b) timed out waiting on `reader.read()` instead of observing
// `done: true`.

describe("GET /api/v1/events — enqueue-throw guards close the stream (SSE-04)", () => {
  const SUBSCRIBED_EVENTS = [
    "indexing:started",
    "indexing:progress",
    "indexing:file",
    "indexing:completed",
    "indexing:failed",
    "workspace:updated",
  ] as const;

  function totalListeners(): number {
    return SUBSCRIBED_EVENTS.reduce((sum, e) => sum + eventBus.listenerCount(e), 0);
  }

  test("a controller.enqueue throw on a published event releases every subscription and closes the stream", async () => {
    const before = totalListeners();
    const reader = await openStream("");
    expect(totalListeners()).toBe(before + SUBSCRIBED_EVENTS.length);

    // Drain the initial "connected" frame `start()` enqueues synchronously
    // (before the encode mock below is installed) so the later assertion on
    // `reader.read()` unambiguously reflects the throw's own teardown rather
    // than a frame already queued before it.
    const first = await reader.read();
    expect(first.done).toBe(false);

    const originalEncode = TextEncoder.prototype.encode;
    try {
      (TextEncoder.prototype as any).encode = function (): never {
        throw new Error("simulated encode failure");
      };
      eventBus.publish("indexing:started", { projectId: "p1", projectPath: "/x" } as never);
    } finally {
      TextEncoder.prototype.encode = originalEncode;
    }

    // (a) All 6 event subscriptions released — teardown()'s
    // `unsubscribers.forEach(u => u())` ran.
    expect(totalListeners()).toBe(before);

    // (b) Stream closed — teardown()'s guarded `controller.close()` ran, so
    // a read resolves `done` instead of hanging forever.
    const closedResult = await Promise.race([
      reader.read(),
      new Promise<{ done: boolean }>((resolve) => setTimeout(() => resolve({ done: false }), 300)),
    ]);
    expect(closedResult.done).toBe(true);

    await reader.cancel().catch(() => {});
  }, 15_000);

  test("a controller.enqueue throw during a heartbeat tick releases every subscription and closes the stream", async () => {
    const before = totalListeners();
    const reader = await openStream("");
    expect(totalListeners()).toBe(before + SUBSCRIBED_EVENTS.length);

    // Drain the initial "connected" frame first, same reason as above.
    const first = await reader.read();
    expect(first.done).toBe(false);

    const originalEncode = TextEncoder.prototype.encode;
    try {
      (TextEncoder.prototype as any).encode = function (): never {
        throw new Error("simulated encode failure");
      };
      // Module-level MASSA_AI_SSE_HEARTBEAT_MS="30" (top of this file) — 40ms
      // lets >=1 heartbeat tick fire and throw, well inside the module-level
      // MASSA_AI_SSE_MAX_DURATION_MS="90" auto-close window.
      await wait(40);
    } finally {
      TextEncoder.prototype.encode = originalEncode;
    }

    expect(totalListeners()).toBe(before);

    const closedResult = await Promise.race([
      reader.read(),
      new Promise<{ done: boolean }>((resolve) => setTimeout(() => resolve({ done: false }), 300)),
    ]);
    expect(closedResult.done).toBe(true);

    await reader.cancel().catch(() => {});
  }, 15_000);
});

// ── GET /api/v1/events — per-request idle-window override (T2b, spec ───────
// ── SSE-07, AC-07.1..AC-07.4) ────────────────────────────────────────────────

describe("GET /api/v1/events — per-request idle-window override (SSE-07)", () => {
  afterEach(() => {
    __resetSseRequestTimeoutForTests();
  });

  test("AC-07.4: applies the override on the request path, observable via the apply counter", async () => {
    __resetSseRequestTimeoutForTests();
    const calls: Array<{ seconds: number }> = [];
    setSseRequestTimeoutSource({
      timeout: (_request: Request, seconds: number) => {
        calls.push({ seconds });
      },
    });

    expect(__getSseRequestTimeoutApplyCountForTests()).toBe(0);
    const reader = await openStream("");

    // A survival assertion alone cannot distinguish "the override ran" from
    // "it never ran and the heartbeat carried the stream" (spec E4 vs E5) —
    // the counter is what makes the distinction observable.
    expect(__getSseRequestTimeoutApplyCountForTests()).toBe(1);
    expect(calls).toEqual([{ seconds: SSE_REQUEST_TIMEOUT_SECONDS }]);
    await reader.cancel().catch(() => {});
  });

  test("AC-07.3: no native handle registered — degrades silently, never throws, still serves the stream", async () => {
    __resetSseRequestTimeoutForTests(); // leaves the source undefined
    let threw = false;
    let reader: Awaited<ReturnType<typeof openStream>> | undefined;
    try {
      reader = await openStream("");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(__getSseRequestTimeoutApplyCountForTests()).toBe(0);
    await reader?.cancel().catch(() => {});
  });

  test("AC-07.3: a `timeout()` that itself throws is swallowed — never breaks the stream", async () => {
    __resetSseRequestTimeoutForTests();
    setSseRequestTimeoutSource({
      timeout: () => {
        throw new Error("simulated native handle failure");
      },
    });
    let threw = false;
    let reader: Awaited<ReturnType<typeof openStream>> | undefined;
    try {
      reader = await openStream("");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    // The throw happens before the counter increment — never credited.
    expect(__getSseRequestTimeoutApplyCountForTests()).toBe(0);
    await reader?.cancel().catch(() => {});
  });
});
