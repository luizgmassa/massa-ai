/**
 * Real-HTTP idle-survival coverage for both SSE endpoints (spec SSE-02,
 * design D1/D2, tasks.md T4).
 *
 * AC-02.3 is the reason this test exists at all: an in-process
 * `app.handle(new Request(...))` call (the shape `events.test.ts` already
 * uses for its fast heartbeat-content coverage) never opens a real socket, so
 * it cannot observe Bun's transport idle timeout — it would pass vacuously
 * against the pre-fix, broken code. This test therefore binds a REAL
 * listening `Elysia({ adapter: node() })` app carrying the real `logsRoutes`
 * / `eventsRoutes` modules on a real ephemeral-range port, holds each stream
 * open over a real `fetch()` with ZERO application traffic, and counts real
 * `: heartbeat` frames arriving over the real socket.
 *
 * Measured basis (spec E1-E3): under the shipped-broken 15 000 ms heartbeat,
 * Bun's transport dropped idle SSE sockets at 8.5-12.0 s — well inside this
 * test's 30 s hold. This file deliberately never reads or sets
 * `MASSA_AI_SSE_HEARTBEAT_MS` itself, so the mandated RED-proof for T4 is a
 * plain env override at invocation:
 *
 *   MASSA_AI_SSE_HEARTBEAT_MS=15000 bun test src/routes/sse-idle-survival.test.ts
 *
 * Server lifecycle follows `restart-e2e.test.ts` / `port-exclusivity-e2e.test.ts`:
 * `reusePort: false` (the adapter defaults it to `true`, which lets a second
 * bind silently shadow the first — not applicable here with one server per
 * test, but kept for parity with the production listen call site), and the
 * server is stopped from the LISTEN CALLBACK's own handle —
 * `app.stop()` throws under `adapter: node()` ("Elysia isn't running";
 * measured, see `restart-e2e.test.ts`'s docblock).
 */

import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { logsRoutes } from "./logs.js";
import { eventsRoutes } from "./events.js";

interface RunningServer {
  port: number;
  stop: () => void;
}

/** Binds a real Elysia({ adapter: node() }) app carrying both SSE route
 *  modules on `port`, resolving once the real listen callback fires. */
function startServer(port: number): Promise<RunningServer> {
  return new Promise((resolve, reject) => {
    const app = new Elysia({ adapter: node() }).use(logsRoutes).use(eventsRoutes);
    try {
      app.listen({ port, reusePort: false }, (server) => {
        resolve({
          port,
          stop: () => void (server as unknown as { stop: () => unknown }).stop(),
        });
      });
    } catch (err) {
      reject(err as Error);
    }
  });
}

interface HoldResult {
  status: number;
  contentType: string | null;
  heartbeatCount: number;
  /** True only when the stream ended (reader `done`) WITHOUT our own
   *  timeout-driven abort having fired — i.e. the transport (or the route)
   *  dropped the connection on its own, which is exactly the pre-fix defect
   *  this test exists to catch. */
  disconnectedEarly: boolean;
  elapsedMs: number;
}

/**
 * Opens `url` over a real fetch, applies ZERO application traffic, and holds
 * the connection for `holdMs` (aborting via `AbortController` at the
 * deadline — the intended, expected termination). Counts `: heartbeat`
 * comment frames split on the SSE frame boundary (`\n\n`).
 */
async function holdIdleStream(url: string, holdMs: number): Promise<HoldResult> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const res = await fetch(url, { signal: controller.signal });
  if (!res.body) throw new Error(`no response body from ${url}`);

  // Armed only AFTER the initial fetch settled, so the deadline governs the
  // IDLE HOLD, never the connection's own setup latency.
  const timer = setTimeout(() => controller.abort(), holdMs);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let heartbeatCount = 0;
  let disconnectedEarly = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        disconnectedEarly = !controller.signal.aborted;
        break;
      }
      buffered += decoder.decode(value, { stream: true });
      const frames = buffered.split("\n\n");
      buffered = frames.pop() ?? "";
      for (const frame of frames) {
        if (frame.includes("heartbeat")) heartbeatCount++;
      }
    }
  } catch (err) {
    // An abort-induced rejection is the expected way this loop ends — any
    // other error (a real transport drop mid-read) must still fail the test.
    if (!controller.signal.aborted) throw err;
  } finally {
    clearTimeout(timer);
  }

  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    heartbeatCount,
    disconnectedEarly,
    elapsedMs: Date.now() - startedAt,
  };
}

describe("SSE idle-stream survival over real HTTP (spec SSE-02)", () => {
  test("GET /api/v1/logs/stream survives 30s fully idle with >= 3 heartbeats (AC-02.1, AC-02.3)", async () => {
    const port = 35200 + Math.floor(Math.random() * 300);
    const { stop } = await startServer(port);
    try {
      const result = await holdIdleStream(`http://localhost:${port}/api/v1/logs/stream`, 30_000);
      expect(result.status).toBe(200);
      expect(result.contentType ?? "").toContain("text/event-stream");
      expect(
        result.disconnectedEarly,
        `stream disconnected at ${result.elapsedMs}ms (before the 30s idle hold completed) — ` +
          `${result.heartbeatCount} heartbeat(s) had arrived. This is the exact pre-fix defect: the ` +
          `transport dropped the idle socket before the heartbeat could keep it alive (spec E1-E3).`,
      ).toBe(false);
      expect(
        result.heartbeatCount,
        `only ${result.heartbeatCount} heartbeat frame(s) arrived in ${result.elapsedMs}ms of idle hold`,
      ).toBeGreaterThanOrEqual(3);
    } finally {
      stop();
    }
  }, 60_000);

  test("GET /api/v1/events survives 30s fully idle with >= 3 heartbeats (AC-02.2, AC-02.3)", async () => {
    const port = 35600 + Math.floor(Math.random() * 300);
    const { stop } = await startServer(port);
    try {
      const result = await holdIdleStream(`http://localhost:${port}/api/v1/events`, 30_000);
      expect(result.status).toBe(200);
      expect(result.contentType ?? "").toContain("text/event-stream");
      expect(
        result.disconnectedEarly,
        `stream disconnected at ${result.elapsedMs}ms (before the 30s idle hold completed) — ` +
          `${result.heartbeatCount} heartbeat(s) had arrived. This is the exact pre-fix defect: the ` +
          `transport dropped the idle socket before the heartbeat could keep it alive (spec E1-E3).`,
      ).toBe(false);
      expect(
        result.heartbeatCount,
        `only ${result.heartbeatCount} heartbeat frame(s) arrived in ${result.elapsedMs}ms of idle hold`,
      ).toBeGreaterThanOrEqual(3);
    } finally {
      stop();
    }
  }, 60_000);
});
