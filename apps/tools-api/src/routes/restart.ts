import { Elysia } from "elysia";
import {
  armRestart,
  consumeArmedRestart,
  detectRestartMode,
  shutdownAndRestart,
} from "../lifecycle.js";

/**
 * POST /api/v1/system/restart (APR-01) — Web-UI-only; deliberately NOT in the
 * MCP tool-defs or the embedded endpoint map (APR-06: embedded mode has no
 * tools-api process; a restart tool would target the MCP host itself).
 *
 * Deliver-before-ack: the handler only ARMS the restart and answers; the
 * drain runs from onAfterResponse, which the framework fires after the
 * response is sent — the client holds the JSON body before the listener
 * stops. The e2e proof lives in restart-e2e.test.ts (a stubbed unit test
 * cannot exercise the flush-vs-stop race by construction).
 */
export const restartRoutes = new Elysia({ prefix: "/api/v1/system" })
  // Hook BEFORE the route — Elysia lifecycle hooks only apply to routes
  // registered after them on the instance.
  .onAfterResponse(() => {
    const mode = consumeArmedRestart();
    if (mode) void shutdownAndRestart(mode);
  })
  .post(
    "/restart",
    ({ set }) => {
      const mode = detectRestartMode();
      if (mode === "dev-watch") {
        set.status = 409;
        return {
          success: false as const,
          error: "restart refused",
          reason:
            "dev watcher active (bun --watch owns this process's lifecycle) — save a file to restart, or run without the dev script",
        };
      }
      armRestart(mode);
      set.status = 200;
      return { success: true as const, restarting: true as const, mode };
    },
    {
      detail: {
        tags: ["system"],
        summary: "Gracefully restart the API server",
        description:
          "Responds first, then drains (listener, job reaper, scheduler, Prisma) and exits. " +
          "Mode 'supervised' (MASSA_AI_SUPERVISED=1 or /.dockerenv): exit 0 and let the supervisor respawn. " +
          "Mode 'respawn' (no supervisor): a detached replacement with the same argv is spawned after the listener stops. " +
          "409 when the dev watcher owns the process (MASSA_AI_DEV_WATCH=1). " +
          "Poll GET /health to observe recovery.",
      },
    },
  );
