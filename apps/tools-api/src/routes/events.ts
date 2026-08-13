/**
 * SSE Events Route
 *
 * GET /api/v1/events — Server-Sent Events stream for real-time indexing progress.
 *
 * Optional query params:
 *   ?projectId=<id>  — filter events for a specific project.
 *   ?jobId=<id>       — filter events whose payload carries that jobId (FR-16).
 * Both compose with AND (an event must match both to be enqueued).
 */

import { Elysia } from "elysia";
import { eventBus } from "@massa-ai/core";
import { resolveHeartbeatMs, resolveMaxDurationMs, applySseRequestTimeout } from "./sse-keepalive.js";

// Heartbeat interval + max-duration default come from `sse-keepalive.ts`
// (spec SSE-01, design D1) — this file no longer declares its own literal.

export const eventsRoutes = new Elysia({ prefix: "/api/v1" }).get(
  "/events",
  async ({ query, set, request }) => {
    // Read per-request so an env override (e.g. MASSA_AI_SSE_HEARTBEAT_MS) is
    // honored even when this module was first imported under the default.
    const HEARTBEAT_MS = resolveHeartbeatMs();
    const MAX_DURATION_MS = resolveMaxDurationMs();
    const projectIdFilter = query.projectId as string | undefined;
    // Wave 5 FR-16: ?jobId= filter on events whose payload carries that jobId.
    const jobIdFilter = query.jobId as string | undefined;

    // Configure SSE headers
    set.headers["Content-Type"] = "text/event-stream";
    set.headers["Cache-Control"] = "no-cache";
    set.headers["Connection"] = "keep-alive";
    set.headers["X-Accel-Buffering"] = "no"; // Disable nginx buffering

    const encoder = new TextEncoder();
    let closed = false;
    // Hoisted to the handler scope so the ReadableStream `cancel` hook (a
    // sibling of `start`, not nested in it) can tear them down. `start`
    // populates them; `cancel` clears them.
    let unsubscribers: (() => void)[] = [];
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    const stream = new ReadableStream({
      start(controller) {
        // SSE-07 / design D6: widen this request's own transport idle window
        // past the 10s default. No-ops silently when the native handle was
        // never captured (AC-07.3) — the heartbeat above is what covers that
        // case.
        applySseRequestTimeout(request);

        const enqueue = (data: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            closed = true;
          }
        };

        // Subscribe to all indexing + workspace events
        const events = [
          "indexing:started",
          "indexing:progress",
          "indexing:file",
          "indexing:completed",
          "indexing:failed",
          "workspace:updated",
        ] as const;

        unsubscribers = events.map((event) =>
          eventBus.subscribe(event, (payload: Record<string, unknown>) => {
            // Filter by projectId if specified (FR-16: AND composition).
            if (projectIdFilter && payload.projectId !== projectIdFilter) return;
            // Wave 5 FR-16: filter by jobId if specified. Events whose payload
            // carries a jobId that doesn't match are skipped. AND with projectId.
            if (jobIdFilter && payload.jobId !== jobIdFilter) return;
            enqueue({ event, payload, timestamp: new Date().toISOString() });
          }),
        );

        // Heartbeat to keep connection alive
        heartbeatTimer = setInterval(() => {
          if (closed) {
            clearInterval(heartbeatTimer);
            return;
          }
          try {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch {
            closed = true;
            clearInterval(heartbeatTimer);
          }
        }, HEARTBEAT_MS);

        // Auto-close after MAX_DURATION_MS
        closeTimer = setTimeout(() => {
          closed = true;
          unsubscribers.forEach((u) => u());
          clearInterval(heartbeatTimer);
          try {
            controller.close();
          } catch {
            // already closed
          }
        }, MAX_DURATION_MS);

        // Send initial connected event
        enqueue({
          event: "connected",
          payload: {
            projectIdFilter: projectIdFilter ?? null,
            jobIdFilter: jobIdFilter ?? null,
          },
          timestamp: new Date().toISOString(),
        });
      },
      // Cleanup on stream cancel (client disconnected). The `cancel` hook is
      // the only reliable teardown seam: ReadableStream ignores a function
      // returned from `start` (it only awaits a returned promise), so a
      // start-return cleanup would silently leak subscribers + timers.
      cancel() {
        closed = true;
        unsubscribers.forEach((u) => u());
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (closeTimer) clearTimeout(closeTimer);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  },
  {
    detail: {
      tags: ["events"],
      summary: "Real-time indexing progress via SSE",
      description:
        "Subscribe to Server-Sent Events for indexing progress and workspace status updates. Optional ?projectId= to filter to a specific project. Connection auto-closes after 10 minutes.",
    },
  },
);
