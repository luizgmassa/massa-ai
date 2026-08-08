/**
 * SSE streaming regenerate route (Component 4 — REGEN-01..08).
 *
 *   POST /api/v1/model-registry/regenerate-stream
 *
 * Spawns `bun scripts/generate-subagent-artifacts.ts` with child_process.spawn
 * (non-blocking), pipes stdout/stderr line-by-line to an SSE stream, and emits
 * a terminal `done` event with the exit code. The existing blocking
 * `/regenerate` route (spawnSync) is unchanged for API compatibility.
 *
 * Streaming pattern follows events.ts exactly: return
 * `new Response(new ReadableStream({ start, cancel }), { headers })`. Do NOT
 * use `set.headers` for streaming responses — returning a `Response` bypasses
 * Elysia's built-in serialization; `set` would buffer/JSON-wrap the stream.
 * The `cancel` hook kills the child so a client disconnect does not orphan the
 * spawn (F1 fold).
 */

import { Elysia } from "elysia";
import path from "path";
import { spawn } from "child_process";
import { configDir } from "@massa-ai/shared/config";

const GENERATE_SCRIPT = path.resolve(
  import.meta.dirname,
  "../../../../scripts/generate-subagent-artifacts.ts",
);
// configDir import is needed so mock.module can intercept @massa-ai/shared/config
// in tests (the route shares the mock surface with model-registry.ts).
void configDir;

const encoder = new TextEncoder();

function sseFrame(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export const modelRegistryStreamRoutes = new Elysia({ prefix: "/api/v1/model-registry" }).post(
  "/regenerate-stream",
  () => {
    let child: ReturnType<typeof spawn> | null = null;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        try {
          child = spawn("bun", [GENERATE_SCRIPT], {
            env: { ...process.env },
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch (e) {
          controller.enqueue(sseFrame({
            type: "done",
            exitCode: null,
            error: `spawn failed: ${(e as Error).message}`,
          }));
          controller.close();
          closed = true;
          return;
        }

        const emitLine = (streamName: "stdout" | "stderr", chunk: Buffer) => {
          if (closed) return;
          const text = chunk.toString();
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.length === 0) continue;
            try {
              controller.enqueue(sseFrame({ type: "line", stream: streamName, text: line }));
            } catch {
              closed = true;
              return;
            }
          }
        };

        child.stdout?.on("data", (chunk: Buffer) => emitLine("stdout", chunk));
        child.stderr?.on("data", (chunk: Buffer) => emitLine("stderr", chunk));

        child.on("error", (e: Error) => {
          if (closed) return;
          closed = true;
          try {
            controller.enqueue(sseFrame({ type: "done", exitCode: null, error: `spawn error: ${e.message}` }));
            controller.close();
          } catch {
            // already closed
          }
        });

        child.on("close", (code: number | null) => {
          if (closed) return;
          closed = true;
          try {
            controller.enqueue(sseFrame({ type: "done", exitCode: code }));
            controller.close();
          } catch {
            // already closed
          }
        });
      },
      cancel() {
        closed = true;
        try {
          child?.kill();
        } catch {
          // best effort
        }
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
      tags: ["model-registry"],
      summary: "Regenerate subagent artifacts (streaming SSE)",
      description:
        "Spawns `bun scripts/generate-subagent-artifacts.ts` with child_process.spawn (non-blocking). Pipes stdout/stderr line-by-line as SSE `data: {\"type\":\"line\",\"stream\":\"stdout|stderr\",\"text\":\"...\"}` events, then a terminal `data: {\"type\":\"done\",\"exitCode\":<n>}` event. On spawn failure emits `done` with `exitCode:null` + `error`. The existing blocking POST /regenerate route stays for API compatibility.",
    },
  },
);