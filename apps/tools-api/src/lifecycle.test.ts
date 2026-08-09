import { describe, test, expect, afterEach } from "bun:test";
import {
  detectRestartMode,
  shutdownAndRestart,
  gracefulShutdown,
  armRestart,
  consumeArmedRestart,
  _setLifecycleSeamsForTesting,
  _setRestartModeForTesting,
  type LifecycleSeams,
} from "./lifecycle.js";

/** Recording seams: every process-level effect becomes a log entry. A real
 *  exit/spawn here would truncate the shared test batch with a clean code —
 *  the exact failure the seam guard test exists to prevent. */
function recordingSeams(opts: { disconnectThrows?: boolean } = {}) {
  const calls: string[] = [];
  let spawnArgs: { argv: string[]; cwd: string } | null = null;
  let exitCode: number | null = null;
  const seams: LifecycleSeams = {
    stopServer: () => {
      calls.push("stopServer");
    },
    stopJobs: () => {
      calls.push("stopJobs");
    },
    disconnect: async () => {
      calls.push("disconnect");
      if (opts.disconnectThrows) throw new Error("boom");
    },
    spawn: (argv, o) => {
      calls.push("spawn");
      spawnArgs = { argv, cwd: o.cwd };
    },
    exit: (code) => {
      calls.push("exit");
      exitCode = code;
    },
  };
  return { seams, calls, spawnArgs: () => spawnArgs, exitCode: () => exitCode };
}

afterEach(() => {
  _setLifecycleSeamsForTesting(null);
  _setRestartModeForTesting(null);
  consumeArmedRestart(); // drain any armed state a failing test left behind
});

describe("detectRestartMode (APR-02, AC-2)", () => {
  const probe = (v: boolean) => () => v;

  test("dev watcher wins over everything", () => {
    expect(detectRestartMode({ MASSA_AI_DEV_WATCH: "1", MASSA_AI_SUPERVISED: "1" }, probe(true))).toBe("dev-watch");
  });

  test("explicit supervision env", () => {
    expect(detectRestartMode({ MASSA_AI_SUPERVISED: "1" }, probe(false))).toBe("supervised");
  });

  test("docker probe implies supervision", () => {
    expect(detectRestartMode({}, probe(true))).toBe("supervised");
  });

  test("bare process → respawn", () => {
    expect(detectRestartMode({}, probe(false))).toBe("respawn");
  });
});

describe("shutdownAndRestart (APR-01/03, AC-3)", () => {
  test("respawn: listener stops BEFORE spawn, exit is last, argv/cwd match this process", async () => {
    const r = recordingSeams();
    await shutdownAndRestart("respawn", r.seams);
    expect(r.calls).toEqual(["stopServer", "stopJobs", "disconnect", "spawn", "exit"]);
    expect(r.exitCode()).toBe(0);
    expect(r.spawnArgs()!.argv).toEqual([process.execPath, ...process.argv.slice(1)]);
    expect(r.spawnArgs()!.cwd).toBe(process.cwd());
  });

  test("supervised: drains and exits without spawning", async () => {
    const r = recordingSeams();
    await shutdownAndRestart("supervised", r.seams);
    expect(r.calls).toEqual(["stopServer", "stopJobs", "disconnect", "exit"]);
    expect(r.exitCode()).toBe(0);
  });

  test("a failed disconnect never blocks the restart", async () => {
    const r = recordingSeams({ disconnectThrows: true });
    await shutdownAndRestart("respawn", r.seams);
    expect(r.calls).toEqual(["stopServer", "stopJobs", "disconnect", "spawn", "exit"]);
  });
});

describe("gracefulShutdown (signal path)", () => {
  test("drains and exits, never spawns", async () => {
    const r = recordingSeams();
    await gracefulShutdown(r.seams);
    expect(r.calls).toEqual(["stopServer", "stopJobs", "disconnect", "exit"]);
    expect(r.exitCode()).toBe(0);
  });
});

describe("arm/consume handshake (deliver-before-ack)", () => {
  test("consume is one-shot", () => {
    armRestart("respawn");
    expect(consumeArmedRestart()).toBe("respawn");
    expect(consumeArmedRestart()).toBeNull();
  });
});
