/**
 * Process lifecycle: graceful drain + restart (APR-01..03,
 * .specs/features/admin-portal-restart/spec.md).
 *
 * One drain implementation serves both the SIGTERM/SIGINT handlers and the
 * restart route. Every process-level effect (server stop, job stop, prisma
 * disconnect, child spawn, exit) goes through injectable seams so route and
 * unit tests can assert mode + call order without ever exiting or spawning —
 * a real `process.exit(0)` inside the shared test batch would truncate it
 * with a clean code (see scripts/__tests__/tools-api-lifecycle-seam-guard).
 *
 * Restart modes (user decision, hybrid):
 *  - dev-watch:  `MASSA_AI_DEV_WATCH=1` (set by the `dev` script) — refuse:
 *                the watcher owns this process's lifecycle.
 *  - supervised: `MASSA_AI_SUPERVISED=1` or /.dockerenv present — drain and
 *                exit 0; the supervisor (docker compose `restart:
 *                unless-stopped`, systemd, launchd) respawns.
 *  - respawn:    no supervisor — spawn a detached replacement with the same
 *                argv/env/cwd AFTER the listener stopped (port is free before
 *                the child binds), then exit 0.
 */
import { existsSync } from "node:fs";

export type RestartMode = "supervised" | "respawn" | "dev-watch";

export interface LifecycleSeams {
  /** Stops the HTTP listener. Registered by index.ts after listen(). */
  stopServer: () => void | Promise<void>;
  /** Stops the job reaper interval + scheduler. Registered by index.ts. */
  stopJobs: () => void;
  /** Disconnects Prisma. */
  disconnect: () => Promise<void>;
  /** Spawns the detached replacement process (respawn mode only). */
  spawn: (argv: string[], opts: { cwd: string; env: Record<string, string | undefined> }) => void;
  /** Terminates this process. */
  exit: (code: number) => void;
}

let serverStopper: LifecycleSeams["stopServer"] = () => {};
let jobsStopper: LifecycleSeams["stopJobs"] = () => {};

export function setServerStopper(fn: LifecycleSeams["stopServer"]): void {
  serverStopper = fn;
}
export function setJobsStopper(fn: LifecycleSeams["stopJobs"]): void {
  jobsStopper = fn;
}

function defaultSeams(): LifecycleSeams {
  return {
    stopServer: () => serverStopper(),
    stopJobs: () => jobsStopper(),
    disconnect: async () => {
      const { disconnectPrisma } = await import("@massa-ai/core/services");
      await disconnectPrisma();
    },
    spawn: (argv, opts) => {
      Bun.spawn({
        cmd: argv,
        cwd: opts.cwd,
        env: opts.env as Record<string, string>,
        stdio: ["ignore", "inherit", "inherit"],
      }).unref();
    },
    exit: (code) => process.exit(code),
  };
}

let testSeams: LifecycleSeams | null = null;
/** Test-only override — the repo's usual getX/resetX seam pairing. */
export function _setLifecycleSeamsForTesting(seams: LifecycleSeams | null): void {
  testSeams = seams;
}

let testMode: RestartMode | null = null;
/** Test-only: pins detectRestartMode's result. The default docker probe reads
 *  the real /.dockerenv, which would flip route-test verdicts when the suite
 *  itself runs inside a container. */
export function _setRestartModeForTesting(mode: RestartMode | null): void {
  testMode = mode;
}

export function detectRestartMode(
  env: Record<string, string | undefined> = process.env,
  dockerProbe: () => boolean = () => existsSync("/.dockerenv"),
): RestartMode {
  if (testMode) return testMode;
  if (env.MASSA_AI_DEV_WATCH === "1") return "dev-watch";
  if (env.MASSA_AI_SUPERVISED === "1" || dockerProbe()) return "supervised";
  return "respawn";
}

// One-shot arm/consume handshake between the restart route handler (which
// must answer first — deliver-before-ack) and its onAfterResponse hook.
let armedMode: Exclude<RestartMode, "dev-watch"> | null = null;

export function armRestart(mode: Exclude<RestartMode, "dev-watch">): void {
  armedMode = mode;
}

export function consumeArmedRestart(): Exclude<RestartMode, "dev-watch"> | null {
  const mode = armedMode;
  armedMode = null;
  return mode;
}

/**
 * Drain, then exit — respawning first when unsupervised. Order is the
 * contract (AC-3): listener stops before the replacement spawns so the port
 * is free before the child binds; exit is always last.
 */
export async function shutdownAndRestart(
  mode: Exclude<RestartMode, "dev-watch">,
  seams: LifecycleSeams = testSeams ?? defaultSeams(),
): Promise<void> {
  await seams.stopServer();
  seams.stopJobs();
  try {
    await seams.disconnect();
  } catch {
    // A failed disconnect must not block the restart — the replacement (or
    // supervisor) re-establishes connections anyway.
  }
  if (mode === "respawn") {
    seams.spawn([process.execPath, ...process.argv.slice(1)], {
      cwd: process.cwd(),
      env: process.env,
    });
  }
  seams.exit(0);
}

/** Signal-path shutdown (SIGTERM/SIGINT): drain + exit, never respawn. */
export async function gracefulShutdown(
  seams: LifecycleSeams = testSeams ?? defaultSeams(),
): Promise<void> {
  await seams.stopServer();
  seams.stopJobs();
  try {
    await seams.disconnect();
  } catch {
    // best effort — exiting anyway
  }
  seams.exit(0);
}
