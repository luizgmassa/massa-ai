/**
 * SSE streaming regenerate route (Component 4 — REGEN-01..08).
 *
 *   POST /api/v1/model-registry/regenerate-and-install-stream
 *   POST /api/v1/model-registry/regenerate-stream   (deprecated alias, same behavior)
 *
 * Spawns `bun scripts/generate-subagent-artifacts.ts` with child_process.spawn
 * (non-blocking), pipes stdout/stderr line-by-line to an SSE stream. After
 * the generator succeeds (exit 0), automatically calls `switchProfile` for
 * every detected host to reinstall the active profile's agents from the
 * freshly generated variant dirs. Emits install events as SSE
 * `data: {"type":"install","host":"...","status":"switched|skipped|failed",...}`
 * frames, then a terminal `done` event with the exit code.
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
import {
  listProfiles,
  switchProfile,
  reportSucceeded,
  type Host,
  type HostSwitchStatus,
  type SwitchReport,
} from "@massa-ai/shared";

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

/**
 * Derive the emitted install status from the switch report's actual host
 * outcomes (APCR-06), instead of the report merely *returning* — a report in
 * which every host failed used to still emit `status:"switched"`. Reuses
 * `reportSucceeded` for the switched/skipped success boundary rather than
 * re-deriving it (design D-4): switched if any host switched, else failed if
 * any host failed, else unsupported if any host is unsupported, else skipped.
 */
function deriveInstallStatus(report: SwitchReport): HostSwitchStatus {
  if (report.hosts.some((h) => h.status === "switched")) return "switched";
  // No host switched. `reportSucceeded` is true here exactly when every remaining host is
  // "skipped" (it would be false if any were "failed" or "unsupported") — reused rather than
  // hand-rolling the same every-host check.
  if (reportSucceeded(report)) return "skipped";
  return report.hosts.some((h) => h.status === "failed") ? "failed" : "unsupported";
}

/** Install the active profile's agents for every detected host after
 *  regeneration. Emits one `install` SSE event per host, then returns. */
function installActiveProfiles(controller: ReadableStreamDefaultController<Uint8Array>, closedRef: { closed: boolean }): void {
  try {
    const inventory = listProfiles();
    for (const hostEntry of inventory.hosts) {
      if (closedRef.closed) return;
      const host = hostEntry.host as Host;
      if (!hostEntry.installed || !hostEntry.activeProfile) {
        if (!closedRef.closed) {
          controller.enqueue(sseFrame({ type: "install", host, status: "skipped", reason: "not installed or no active profile" }));
        }
        continue;
      }
      try {
        const report = switchProfile({ profile: hostEntry.activeProfile, host });
        const status = deriveInstallStatus(report);
        const switched = (report.hosts || []).filter((h: any) => h.status === "switched").map((h: any) => h.host).join(", ") || "none";
        const skipped = (report.hosts || []).filter((h: any) => h.status === "skipped").map((h: any) => `${h.host} (${h.reason || "unknown"})`).join(", ") || "none";
        const unsupported = (report.hosts || []).filter((h: any) => h.status === "unsupported").map((h: any) => `${h.host} (${h.reason || "unknown"})`).join(", ") || "none";
        const failed = (report.hosts || []).filter((h: any) => h.status === "failed").map((h: any) => `${h.host} (${h.reason || "unknown"})`).join(", ") || "none";
        if (!closedRef.closed) {
          controller.enqueue(sseFrame({ type: "install", host, status, profile: hostEntry.activeProfile, switched, skipped, unsupported, failed }));
        }
      } catch (e) {
        if (!closedRef.closed) {
          controller.enqueue(sseFrame({ type: "install", host, status: "failed", error: (e as Error).message }));
        }
      }
    }
  } catch (e) {
    if (!closedRef.closed) {
      controller.enqueue(sseFrame({ type: "install", status: "error", error: `install phase failed: ${(e as Error).message}` }));
    }
  }
}

export const modelRegistryStreamRoutes = new Elysia({ prefix: "/api/v1/model-registry" }).post(
  "/regenerate-and-install-stream",
  () => {
    let child: ReturnType<typeof spawn> | null = null;
    const closedRef = { closed: false };

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
          closedRef.closed = true;
          return;
        }

        const emitLine = (streamName: "stdout" | "stderr", chunk: Buffer) => {
          if (closedRef.closed) return;
          const text = chunk.toString();
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.length === 0) continue;
            try {
              controller.enqueue(sseFrame({ type: "line", stream: streamName, text: line }));
            } catch {
              closedRef.closed = true;
              return;
            }
          }
        };

        child.stdout?.on("data", (chunk: Buffer) => emitLine("stdout", chunk));
        child.stderr?.on("data", (chunk: Buffer) => emitLine("stderr", chunk));

        child.on("error", (e: Error) => {
          if (closedRef.closed) return;
          closedRef.closed = true;
          try {
            controller.enqueue(sseFrame({ type: "done", exitCode: null, error: `spawn error: ${e.message}` }));
            controller.close();
          } catch {
            // already closed
          }
        });

        child.on("close", (code: number | null) => {
          if (closedRef.closed) return;
          // After successful generation, auto-install agents to active dirs.
          if (code === 0) {
            try {
              controller.enqueue(sseFrame({ type: "line", stream: "stdout", text: "Installing regenerated agents to active directories..." }));
            } catch {
              closedRef.closed = true;
              return;
            }
            installActiveProfiles(controller, closedRef);
          }
          closedRef.closed = true;
          try {
            controller.enqueue(sseFrame({ type: "done", exitCode: code }));
            controller.close();
          } catch {
            // already closed
          }
        });
      },
      cancel() {
        closedRef.closed = true;
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
      summary: "Regenerate subagent artifacts + auto-install to active dirs (streaming SSE)",
      description:
        "Spawns `bun scripts/generate-subagent-artifacts.ts` with child_process.spawn (non-blocking). Pipes stdout/stderr line-by-line as SSE. After the generator succeeds (exit 0), calls switchProfile for every detected host to reinstall the active profile's agents from the freshly generated variant dirs. Emits `install` events per host, then a terminal `done` event with the exit code.",
    },
  },
)
// Deprecated alias — same behavior, kept for backward compat with older UI.
.post(
  "/regenerate-stream",
  () => {
    let child: ReturnType<typeof spawn> | null = null;
    const closedRef = { closed: false };

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
          closedRef.closed = true;
          return;
        }

        const emitLine = (streamName: "stdout" | "stderr", chunk: Buffer) => {
          if (closedRef.closed) return;
          const text = chunk.toString();
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.length === 0) continue;
            try {
              controller.enqueue(sseFrame({ type: "line", stream: streamName, text: line }));
            } catch {
              closedRef.closed = true;
              return;
            }
          }
        };

        child.stdout?.on("data", (chunk: Buffer) => emitLine("stdout", chunk));
        child.stderr?.on("data", (chunk: Buffer) => emitLine("stderr", chunk));

        child.on("error", (e: Error) => {
          if (closedRef.closed) return;
          closedRef.closed = true;
          try {
            controller.enqueue(sseFrame({ type: "done", exitCode: null, error: `spawn error: ${e.message}` }));
            controller.close();
          } catch {
            // already closed
          }
        });

        child.on("close", (code: number | null) => {
          if (closedRef.closed) return;
          if (code === 0) {
            try {
              controller.enqueue(sseFrame({ type: "line", stream: "stdout", text: "Installing regenerated agents to active directories..." }));
            } catch {
              closedRef.closed = true;
              return;
            }
            installActiveProfiles(controller, closedRef);
          }
          closedRef.closed = true;
          try {
            controller.enqueue(sseFrame({ type: "done", exitCode: code }));
            controller.close();
          } catch {
            // already closed
          }
        });
      },
      cancel() {
        closedRef.closed = true;
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
      summary: "Regenerate subagent artifacts + auto-install (streaming SSE, deprecated alias)",
      description:
        "Alias for POST /regenerate-and-install-stream. Kept for backward compat with older UI versions.",
    },
  },
);