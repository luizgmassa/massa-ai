import { describe, test, expect, afterEach, mock } from "bun:test";
import {
  detectRestartMode,
  shutdownAndRestart,
  gracefulShutdown,
  armRestart,
  consumeArmedRestart,
  setServerStopper,
  setJobsStopper,
  _setLifecycleSeamsForTesting,
  _setRestartModeForTesting,
  _getDefaultSeamsForTesting,
  type LifecycleSeams,
} from "./lifecycle.js";

// Registered before the module-under-test's dynamic `await
// import("@massa-ai/core/services")` resolves inside defaultSeams().disconnect —
// this file already forces isolation via `mock.module(` (see CLAUDE.md's runner
// table), so it cannot contaminate any sibling test file's real module.
const disconnectPrisma = mock(async () => {});
mock.module("@massa-ai/core/services", () => ({ disconnectPrisma }));

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
  setServerStopper(() => {}); // restore the module's own no-op defaults
  setJobsStopper(() => {});
  disconnectPrisma.mockClear();
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

describe("setServerStopper / setJobsStopper (index.ts registration)", () => {
  test("defaultSeams().stopServer delegates to the registered server stopper", () => {
    let called = false;
    setServerStopper(() => {
      called = true;
    });
    _getDefaultSeamsForTesting().stopServer();
    expect(called).toBe(true);
  });

  test("defaultSeams().stopJobs delegates to the registered jobs stopper", () => {
    let called = false;
    setJobsStopper(() => {
      called = true;
    });
    _getDefaultSeamsForTesting().stopJobs();
    expect(called).toBe(true);
  });
});

describe("defaultSeams (production closures, index.ts's real fallback)", () => {
  test("disconnect awaits @massa-ai/core/services' disconnectPrisma", async () => {
    await _getDefaultSeamsForTesting().disconnect();
    expect(disconnectPrisma).toHaveBeenCalledTimes(1);
  });

  test("spawn detaches via Bun.spawn with the given argv/cwd/env and unrefs the handle", () => {
    const originalSpawn = Bun.spawn;
    // `any`: TS otherwise narrows this to the `null` initializer literal at the
    // read below, since the only reassignment is inside a closure invoked
    // indirectly (through _getDefaultSeamsForTesting().spawn) rather than
    // called directly in this scope's visible control flow — same idiom as
    // routes/search.test.ts's `let json: any = null`.
    let capturedOpts: any = null;
    let unrefCalled = false;
    // Test-only override of the Bun global — the only way to observe this
    // closure without actually detaching a child process (see module docblock).
    // @ts-expect-error narrowing Bun.spawn's overloaded signature for a test stub
    Bun.spawn = (opts: Record<string, unknown>) => {
      capturedOpts = opts;
      return {
        unref: () => {
          unrefCalled = true;
        },
      };
    };
    try {
      _getDefaultSeamsForTesting().spawn(["node", "x.js"], { cwd: "/tmp", env: { FOO: "bar" } });
    } finally {
      Bun.spawn = originalSpawn;
    }
    expect(capturedOpts).toEqual({
      cmd: ["node", "x.js"],
      cwd: "/tmp",
      env: { FOO: "bar" },
      stdio: ["ignore", "inherit", "inherit"],
    });
    expect(unrefCalled).toBe(true);
  });

  test("exit delegates to process.exit with the given code", () => {
    const originalExit = process.exit;
    let capturedCode: number | undefined;
    // Test-only override of the process global — the only way to observe this
    // closure without actually ending the test runner (see module docblock).
    // @ts-expect-error stubbing process.exit's `never` return for a test spy
    process.exit = (code?: number) => {
      capturedCode = code;
    };
    try {
      _getDefaultSeamsForTesting().exit(0);
    } finally {
      process.exit = originalExit;
    }
    expect(capturedCode).toBe(0);
  });
});
