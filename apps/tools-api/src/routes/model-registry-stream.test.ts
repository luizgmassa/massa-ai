import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { createServer } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

// ── Mocks: child_process.spawn + profilesLib + configDir ──────────────────
// Mirror model-registry.test.ts mock shape so the new route reuses the same
// lazy profilesLib() pattern and GENERATE_SCRIPT resolution.

const builtinRegistry = {
  version: 1,
  tiers: ["light", "standard", "deep"],
  hostDefaults: { claude: "balanced", codex: "balanced", cursor: "balanced", opencode: "balanced" },
  workflowTiers: {},
  profiles: {
    balanced: {
      description: "builtin balanced",
      hosts: {
        claude: { light: { model: "m-light", effort: "high" }, standard: { model: "m-std", effort: "high" }, deep: { model: "m-deep", effort: "high" } },
      },
    },
  },
};

const loadEffectiveRegistry = mock((..._args: unknown[]): unknown => ({
  registry: builtinRegistry,
  source: { builtin: builtinRegistry, overlay: null, tombstoned: [] },
}));
const loadRegistry = mock((..._args: unknown[]): unknown => builtinRegistry);
const validateRegistry = mock((..._args: unknown[]): unknown => builtinRegistry);
const RegistryValidationError = class extends Error {
  violations: string[];
  constructor(violations: string[]) {
    super("validation failed");
    this.name = "RegistryValidationError";
    this.violations = violations;
  }
};

const actualProfilesLib = require("../../../../scripts/lib/model-profiles.ts");
mock.module("../../../../scripts/lib/model-profiles.ts", () => ({
  ...actualProfilesLib,
  loadEffectiveRegistry: (...args: unknown[]) => loadEffectiveRegistry(...args),
  loadRegistry: (...args: unknown[]) => loadRegistry(...args),
  validateRegistry: (...args: unknown[]) => validateRegistry(...args),
  RegistryValidationError,
  DEFAULT_REGISTRY_PATH: "/dev/null",
}));

const configDir = mock((..._args: unknown[]): string => "/tmp/massa-ai-test-overlay-stream");
mock.module("@massa-ai/shared/config", () => {
  const actual = require("@massa-ai/shared/config");
  return { ...actual, configDir: (...args: unknown[]) => configDir(...args) };
});

// Real resolution by default (this test file runs from a real checkout). The
// real value is captured BEFORE mock.module registers — mock.module rebinds
// the namespace of anything already imported, so calling back into the
// module's own getDeploymentRoot() lazily from inside the mock would recurse.
// mockImplementationOnce(() => null) per-test simulates an unresolvable
// deployment (APCR-07).
const actualDeployment = require("./model-registry-deployment.ts");
const realDeploymentRoot: string | null = actualDeployment.getDeploymentRoot();
const getDeploymentRoot = mock((..._args: unknown[]): string | null => realDeploymentRoot);
mock.module("./model-registry-deployment.ts", () => ({
  ...actualDeployment,
  getDeploymentRoot: (...args: unknown[]) => getDeploymentRoot(...args),
}));

// ── Mock @massa-ai/shared listProfiles + switchProfile + syncGeneratedVariants
// for the auto-install step ── syncGeneratedVariants MUST be mocked: the real
// implementation would run against the real getDeploymentRoot() (this repo's
// own checkout, per the mock above) as sourceRoot and os.homedir() (the real
// developer machine) as the default targetHome — exactly the HARD RULE
// hazard the task brief calls out. Never let the real one run in this file.
const listProfilesMock = mock((..._args: unknown[]): unknown => ({
  hosts: [
    { host: "claude", installed: true, activeProfile: "balanced", bundleVersion: "1.0.0", availableProfiles: ["balanced"] },
    { host: "opencode", installed: true, activeProfile: "balanced", bundleVersion: "1.0.0", availableProfiles: ["balanced"] },
  ],
}));
const switchProfileMock = mock((..._args: unknown[]): unknown => ({
  profile: "balanced",
  dryRun: false,
  hosts: [{ host: "claude", status: "switched" }, { host: "opencode", status: "switched" }],
  restartRequired: true,
}));
const syncGeneratedVariantsMock = mock((..._args: unknown[]): unknown => [
  { host: "claude", status: "synced", profiles: ["balanced"], retained: [], files: 3 },
  { host: "opencode", status: "skipped", profiles: [], retained: [], files: 0, reason: "no generated variants for this host" },
]);
mock.module("@massa-ai/shared", () => {
  const actual = require("@massa-ai/shared");
  return {
    ...actual,
    listProfiles: (...args: unknown[]) => listProfilesMock(...args),
    switchProfile: (...args: unknown[]) => switchProfileMock(...args),
    syncGeneratedVariants: (...args: unknown[]) => syncGeneratedVariantsMock(...args),
  };
});

// ── Mock child_process: capture spawnSync (blocking route, REGEN-08) + spawn (stream) ──
const child_process = require("child_process");
const spawnSyncMock = mock((..._args: unknown[]): any => ({ exitCode: 0, stdout: "", stderr: "" }));

/** Builds a fake child process matching the EventEmitter shape the route expects:
 *  stdout/stderr are { on(data, cb) }, child emits "close" with an exit code.
 *  `errorEvent` fires the "error" listener with an Error (distinct from
 *  `spawnError` which throws at spawn time). */
function makeFakeChild(opts: {
  stdoutLines?: string[];
  stderrLines?: string[];
  exitCode: number | null;
  spawnError?: Error | null;
  errorEvent?: Error | null;
}): {
  stdout: { on: (ev: string, cb: (d: Buffer) => void) => void };
  stderr: { on: (ev: string, cb: (d: Buffer) => void) => void };
  on: (ev: string, cb: (code: number | null) => void) => void;
  kill: () => boolean;
} {
  const stream = (lines: string[] | undefined, _key: string) => ({
    on(event: string, cb: (d: Buffer) => void) {
      if (event !== "data") return;
      if (lines) for (const line of lines) cb(Buffer.from(line + "\n"));
    },
  });
  return {
    stdout: stream(opts.stdoutLines, "stdout"),
    stderr: stream(opts.stderrLines, "stderr"),
    on(event: string, cb: (code: number | null) => void) {
      if (event === "error" && opts.errorEvent) {
        queueMicrotask(() => cb(opts.errorEvent as unknown as number));
        return;
      }
      if (event === "close") {
        queueMicrotask(() => cb(opts.exitCode));
      }
    },
    kill() { return true; },
  };
}

// Named (not inline) so tests that temporarily override the mock's
// persistent implementation (see the T3 cancel-hook test below, which must
// give every spawn() call in the two-generator chain the same custom kill())
// can restore exactly this default afterward rather than reconstructing it.
function defaultSpawnImpl(..._args: unknown[]): any {
  const opts = (_args[2] || {}) as { stdoutLines?: string[]; stderrLines?: string[]; exitCode: number | null; spawnError?: Error | null };
  if (opts.spawnError) throw opts.spawnError;
  return makeFakeChild({
    stdoutLines: opts.stdoutLines,
    stderrLines: opts.stderrLines,
    exitCode: opts.exitCode ?? 0,
    spawnError: opts.spawnError ?? null,
  });
}

const spawnMock = mock(defaultSpawnImpl);

mock.module("child_process", () => ({
  ...child_process,
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

// Import both routes so REGEN-08 (blocking route unchanged) is testable in one file.
import { modelRegistryRoutes } from "./model-registry.js";
import { modelRegistryStreamRoutes } from "./model-registry-stream.js";

const app = new Elysia().use(modelRegistryStreamRoutes);

beforeEach(() => {
  spawnMock.mockClear();
  spawnSyncMock.mockClear();
  configDir.mockClear();
  getDeploymentRoot.mockClear();
  syncGeneratedVariantsMock.mockClear();
});

async function postStream(path: string): Promise<{ status: number; text: string; contentType: string }> {
  const res = await app.handle(new Request(`http://localhost${path}`, { method: "POST" }));
  const text = await res.text();
  return { status: res.status, text, contentType: res.headers.get("content-type") || "" };
}

/** Parse the SSE text into discrete data: payloads (split on \n\n). */
function parseSseEvents(text: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const chunk of text.split("\n\n")) {
    const line = chunk.trim();
    if (!line.startsWith("data:")) continue;
    const json = line.slice(5).trim();
    try { events.push(JSON.parse(json)); } catch { /* ignore non-JSON */ }
  }
  return events;
}

describe("POST /api/v1/model-registry/regenerate-stream — SSE line emission (REGEN-03)", () => {
  test("emits line events for stdout + done event with exitCode 0", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: ["Generating claude agents...", "Generating codex agents..."],
      stderrLines: ["Warning: minor issue"],
      exitCode: 0,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("text/event-stream");

    const events = parseSseEvents(res.text);
    const lineEvents = events.filter((e) => e.type === "line");
    const doneEvents = events.filter((e) => e.type === "done");

    expect(lineEvents.length).toBeGreaterThanOrEqual(3);
    expect(lineEvents.some((e) => e.stream === "stdout" && e.text === "Generating claude agents...")).toBe(true);
    expect(lineEvents.some((e) => e.stream === "stdout" && e.text === "Generating codex agents...")).toBe(true);
    expect(lineEvents.some((e) => e.stream === "stderr" && e.text === "Warning: minor issue")).toBe(true);
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0].exitCode).toBe(0);
  });

  test("emits done with non-zero exitCode on child failure", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: ["started..."],
      stderrLines: ["fatal: script error"],
      exitCode: 1,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    expect(done!.exitCode).toBe(1);
  });

  test("emits done with exitCode null + error on spawn failure (REGEN-07)", async () => {
    spawnMock.mockImplementationOnce(() => { throw new Error("spawn ENOENT"); });

    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    expect(done!.exitCode).toBeNull();
    expect(done!.error).toContain("ENOENT");
  });

  test("emits done with exitCode null + error on child error event (not spawn failure)", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: ["starting..."],
      exitCode: null,
      errorEvent: new Error("child process error: SIGSEGV"),
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    expect(done!.exitCode).toBeNull();
    expect(done!.error).toContain("spawn error");
    expect(done!.error).toContain("SIGSEGV");
  });

  test("cancel hook kills the child on client disconnect", async () => {
    // T3 spawns the generator chain sequentially (skill, then subagent), so
    // `child` may already have been reassigned to the second generator's
    // process by the time the test calls reader.cancel() (each fake child's
    // "close" event fires on a queued microtask that can race ahead of the
    // test's own `await`). A persistent mockImplementation — not
    // mockImplementationOnce — gives every spawn() call in the chain the same
    // custom kill(), so this test still proves the cancel hook reaches
    // whichever child is current, regardless of chain position. Restored to
    // the default implementation at the end so later tests are unaffected.
    let killed = false;
    spawnMock.mockImplementation(() => {
      const child = makeFakeChild({ stdoutLines: [], exitCode: 0 });
      return {
        ...child,
        kill() { killed = true; return true; },
      };
    });

    try {
      const res = await app.handle(new Request("http://localhost/api/v1/model-registry/regenerate-stream", { method: "POST" }));
      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
      // Cancel the stream reader — triggers the ReadableStream cancel hook
      const reader = res.body!.getReader();
      await reader.cancel();
      // The cancel hook should have called child.kill()
      expect(killed).toBe(true);
    } finally {
      spawnMock.mockImplementation(defaultSpawnImpl);
    }
  });

  test("emits done exit 0 with install line when stdout/stderr empty", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: [],
      stderrLines: [],
      exitCode: 0,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const doneEvents = events.filter((e) => e.type === "done");
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0].exitCode).toBe(0);
  });
});

describe("POST /api/v1/model-registry/regenerate-and-install-stream — auto-install after regenerate", () => {
  beforeEach(() => {
    listProfilesMock.mockClear();
    switchProfileMock.mockClear();
  });

  test("emits install events + calls switchProfile after successful regeneration", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: ["Generating..."],
      exitCode: 0,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const installEvents = events.filter((e) => e.type === "install");
    const doneEvents = events.filter((e) => e.type === "done");

    expect(installEvents.length).toBeGreaterThanOrEqual(1);
    expect(installEvents.some((e) => e.status === "switched")).toBe(true);
    expect(listProfilesMock).toHaveBeenCalled();
    expect(switchProfileMock).toHaveBeenCalled();
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0].exitCode).toBe(0);
  });

  test("does NOT install when generator fails (non-zero exit)", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: [],
      exitCode: 1,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const installEvents = events.filter((e) => e.type === "install");
    const done = events.find((e) => e.type === "done");

    expect(installEvents.length).toBe(0);
    expect(listProfilesMock).not.toHaveBeenCalled();
    expect(done!.exitCode).toBe(1);
  });

  test("install phase handles switchProfile errors gracefully", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: [],
      exitCode: 0,
    }));
    switchProfileMock.mockImplementation(() => {
      throw new Error("install failure");
    });

    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const installEvents = events.filter((e) => e.type === "install");
    const done = events.find((e) => e.type === "done");

    expect(installEvents.some((e) => e.status === "failed")).toBe(true);
    expect(done!.exitCode).toBe(0);
  });

  test("an all-failed report emits status:\"failed\", not \"switched\" (APCR-06.2)", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: [], exitCode: 0 }));
    listProfilesMock.mockImplementationOnce(() => ({
      hosts: [{ host: "claude", installed: true, activeProfile: "balanced", bundleVersion: "1.0.0", availableProfiles: ["balanced"] }],
    }));
    switchProfileMock.mockImplementationOnce(() => ({
      profile: "balanced",
      dryRun: false,
      hosts: [{ host: "claude", status: "failed", reason: "route refused" }],
      restartRequired: false,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    const events = parseSseEvents(res.text);
    const install = events.find((e) => e.type === "install");
    expect(install).toBeDefined();
    expect(install!.status).toBe("failed");
  });

  test("an all-skipped report emits status:\"skipped\" (APCR-06.3)", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: [], exitCode: 0 }));
    listProfilesMock.mockImplementationOnce(() => ({
      hosts: [{ host: "claude", installed: true, activeProfile: "balanced", bundleVersion: "1.0.0", availableProfiles: ["balanced"] }],
    }));
    switchProfileMock.mockImplementationOnce(() => ({
      profile: "balanced",
      dryRun: false,
      hosts: [{ host: "claude", status: "skipped", reason: "already current" }],
      restartRequired: false,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    const events = parseSseEvents(res.text);
    const install = events.find((e) => e.type === "install");
    expect(install).toBeDefined();
    expect(install!.status).toBe("skipped");
  });

  test("an all-unsupported report emits status:\"unsupported\" and it appears in the detail strings, never folded into \"skipped\" (APCR-06.7)", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: [], exitCode: 0 }));
    listProfilesMock.mockImplementationOnce(() => ({
      hosts: [{ host: "claude", installed: true, activeProfile: "balanced", bundleVersion: "1.0.0", availableProfiles: ["balanced"] }],
    }));
    switchProfileMock.mockImplementationOnce(() => ({
      profile: "balanced",
      dryRun: false,
      hosts: [{ host: "claude", status: "unsupported", reason: "bundle has no variants — upgrade plugin" }],
      restartRequired: false,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    const events = parseSseEvents(res.text);
    const install = events.find((e) => e.type === "install");
    expect(install).toBeDefined();
    expect(install!.status).toBe("unsupported");
    expect(install!.unsupported as string).toContain("claude");
    expect(install!.skipped).toBe("none");
  });

  test("a mixed report emits switched and retains every status bucket's detail string (APCR-06.1/.4)", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: [], exitCode: 0 }));
    listProfilesMock.mockImplementationOnce(() => ({
      hosts: [{ host: "claude", installed: true, activeProfile: "balanced", bundleVersion: "1.0.0", availableProfiles: ["balanced"] }],
    }));
    switchProfileMock.mockImplementationOnce(() => ({
      profile: "balanced",
      dryRun: false,
      hosts: [
        { host: "claude", status: "switched" },
        { host: "codex", status: "skipped", reason: "already current" },
        { host: "cursor", status: "unsupported", reason: "bundle has no variants" },
        { host: "opencode", status: "failed", reason: "locked" },
      ],
      restartRequired: true,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    const events = parseSseEvents(res.text);
    const install = events.find((e) => e.type === "install");
    expect(install).toBeDefined();
    expect(install!.status).toBe("switched");
    expect(install!.switched as string).toContain("claude");
    expect(install!.skipped as string).toContain("codex");
    expect(install!.unsupported as string).toContain("cursor");
    expect(install!.failed as string).toContain("opencode");
  });

  test("deprecated /regenerate-stream alias also auto-installs", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({
      stdoutLines: [],
      exitCode: 0,
    }));

    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const installEvents = events.filter((e) => e.type === "install");
    expect(installEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ── T3: the bridge step (syncGeneratedVariants) runs before the install loop ──

describe("POST /api/v1/model-registry/regenerate-and-install-stream — variant-sync bridge (T3)", () => {
  beforeEach(() => {
    listProfilesMock.mockClear();
    switchProfileMock.mockClear();
    syncGeneratedVariantsMock.mockClear();
  });

  test("emits one variant-sync SSE frame per host, before the install frames", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: [], exitCode: 0 }));

    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    const events = parseSseEvents(res.text);
    const syncEvents = events.filter((e) => e.type === "variant-sync");
    const firstInstallIdx = events.findIndex((e) => e.type === "install");

    expect(syncEvents.length).toBe(2); // claude + opencode, per the mock fixture
    expect(syncEvents.some((e) => e.host === "claude" && e.status === "synced" && e.files === 3)).toBe(true);
    expect(syncEvents.some((e) => e.host === "opencode" && e.status === "skipped" && e.reason)).toBe(true);
    // Every variant-sync frame precedes every install frame.
    const lastSyncIdx = events.map((e, i) => (e.type === "variant-sync" ? i : -1)).filter((i) => i >= 0).pop()!;
    expect(lastSyncIdx).toBeLessThan(firstInstallIdx);
  });

  test("calls syncGeneratedVariants with sourceRoot from getDeploymentRoot()", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: [], exitCode: 0 }));
    await postStream("/api/v1/model-registry/regenerate-and-install-stream");

    expect(syncGeneratedVariantsMock).toHaveBeenCalledTimes(1);
    const arg = (syncGeneratedVariantsMock.mock.calls[0] as any[])[0] as { sourceRoot: string | null };
    expect(arg.sourceRoot).toBe(realDeploymentRoot);
  });

  test("hostDefaults reaches listProfiles via getRegistryHostDefaults()", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: [], exitCode: 0 }));
    await postStream("/api/v1/model-registry/regenerate-and-install-stream");

    expect(listProfilesMock).toHaveBeenCalledTimes(1);
    const arg = (listProfilesMock.mock.calls[0] as any[])[0] as { hostDefaults?: Record<string, string> };
    // builtinRegistry (this file's fixture) declares hostDefaults for every host.
    expect(arg.hostDefaults).toMatchObject({ claude: "balanced", opencode: "balanced" });
  });

  test("a variant-sync failure does not block the install loop", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: [], exitCode: 0 }));
    syncGeneratedVariantsMock.mockImplementationOnce(() => [
      { host: "claude", status: "failed", profiles: [], retained: [], files: 0, error: "disk full" },
    ]);

    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    const events = parseSseEvents(res.text);
    const syncEvent = events.find((e) => e.type === "variant-sync");
    const installEvents = events.filter((e) => e.type === "install");
    const done = events.find((e) => e.type === "done");

    expect(syncEvent).toMatchObject({ host: "claude", status: "failed", error: "disk full" });
    expect(installEvents.length).toBeGreaterThanOrEqual(1); // install loop still ran
    expect(done!.exitCode).toBe(0);
  });
});

// ── T3: generator chain derived from package.json's generate:artifacts ──────
// (AC-03.1, AC-03.2, AC-03.4, AC-03.5, AC-03.6)

/** Independent, test-owned parse of the real package.json's generate:artifacts
 *  script — deliberately NOT calling into the route's own derivation. AC-03.5's
 *  whole point is that production and test must not share one parser: if both
 *  degrade the same way, they agree on a wrong list and this suite would pass
 *  green while Defect B (one generator spawned) was back. */
function independentlyDeriveExpectedGenerators(root: string): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as { scripts?: Record<string, string> };
  const command = pkg.scripts?.["generate:artifacts"];
  if (typeof command !== "string") throw new Error("test fixture assumption broken: no generate:artifacts script");
  return command
    .split("&&")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((segment) => {
      const match = /^bun\s+(\S+\.ts)$/.exec(segment);
      if (!match) throw new Error(`test fixture assumption broken: unexpected segment ${segment}`);
      return match[1] as string;
    });
}

describe("POST /regenerate-and-install-stream — generator chain derived from generate:artifacts (T3)", () => {
  beforeEach(() => {
    listProfilesMock.mockClear();
    switchProfileMock.mockClear();
  });

  test("spawns every generator package.json's generate:artifacts names, in its own order (AC-03.1, AC-03.4)", async () => {
    if (!realDeploymentRoot) throw new Error("this suite requires a real checkout — realDeploymentRoot resolved null");
    const expected = independentlyDeriveExpectedGenerators(realDeploymentRoot);
    expect(expected.length).toBeGreaterThanOrEqual(2);

    await postStream("/api/v1/model-registry/regenerate-and-install-stream");

    expect(spawnMock).toHaveBeenCalledTimes(expected.length);
    expected.forEach((relPath, i) => {
      const call = spawnMock.mock.calls[i] as unknown as [string, string[]];
      expect(call[0]).toBe("bun");
      expect(call[1][0]!.endsWith(relPath)).toBe(true);
    });
  });

  test("a failing first generator is reported by name; the chain stops and nothing downstream runs (AC-03.2)", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: [], stderrLines: ["boom"], exitCode: 7 }));

    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    const events = parseSseEvents(res.text);
    const done = events.find((e) => e.type === "done");

    expect(spawnMock).toHaveBeenCalledTimes(1); // the second generator never spawns
    expect(done).toBeDefined();
    expect(done!.exitCode).toBe(7);
    expect(done!.error as string).toContain("generate-skill-artifacts.ts");
    expect(done!.error as string).toContain("exit code 7");
    expect(events.some((e) => e.type === "skills")).toBe(false);
    expect(events.some((e) => e.type === "install")).toBe(false);
    expect(events.some((e) => e.type === "variant-sync")).toBe(false);
    expect(listProfilesMock).not.toHaveBeenCalled();
  });

  test("an unparseable generate:artifacts throws — a fixture missing the script key never spawns anything (AC-03.5)", async () => {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "mrs-fixture-missing-"));
    try {
      fs.writeFileSync(path.join(fixtureDir, "package.json"), JSON.stringify({ name: "fixture", scripts: {} }));
      getDeploymentRoot.mockImplementationOnce(() => fixtureDir);

      const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
      const events = parseSseEvents(res.text);
      const done = events.find((e) => e.type === "done");

      expect(done).toBeDefined();
      expect(done!.exitCode).toBeNull();
      expect(done!.error as string).toContain("could not derive the generator list");
      expect(spawnMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test("an unparseable generate:artifacts throws — a fixture with a shape that doesn't match 'bun <script.ts>' never spawns anything (AC-03.5)", async () => {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "mrs-fixture-shape-"));
    try {
      fs.writeFileSync(
        path.join(fixtureDir, "package.json"),
        JSON.stringify({ name: "fixture", scripts: { "generate:artifacts": "echo not-a-generator-invocation" } }),
      );
      getDeploymentRoot.mockImplementationOnce(() => fixtureDir);

      const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
      const events = parseSseEvents(res.text);
      const done = events.find((e) => e.type === "done");

      expect(done).toBeDefined();
      expect(done!.exitCode).toBeNull();
      expect(done!.error as string).toContain("could not derive the generator list");
      expect(spawnMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test("AC-03.6 hardcoded backstop — the actually-spawned list has >=2 entries and contains both known generator filenames, checked with literals owned by this test, not any shared parser", async () => {
    await postStream("/api/v1/model-registry/regenerate-and-install-stream");

    const spawnedPaths = spawnMock.mock.calls.map((call) => ((call as unknown as [string, string[]])[1])[0]!);
    expect(spawnedPaths.length).toBeGreaterThanOrEqual(2);
    expect(spawnedPaths.some((p) => p.endsWith("generate-skill-artifacts.ts"))).toBe(true);
    expect(spawnedPaths.some((p) => p.endsWith("generate-subagent-artifacts.ts"))).toBe(true);
  });
});

// ── T4: skills reach each host's location — per-host reporting frame ────────
// (AC-03.3)

describe("POST /regenerate-and-install-stream — skills frame per host (T4, AC-03.3)", () => {
  beforeEach(() => {
    listProfilesMock.mockClear();
    switchProfileMock.mockClear();
  });

  test("emits one skills frame per known host, after every generator succeeds and before variant-sync/install", async () => {
    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    const events = parseSseEvents(res.text);

    const skillsEvents = events.filter((e) => e.type === "skills");
    const firstSyncOrInstallIdx = events.findIndex((e) => e.type === "variant-sync" || e.type === "install");

    expect(skillsEvents.length).toBe(4);
    expect(skillsEvents.map((e) => e.host).sort()).toEqual(["claude", "codex", "cursor", "opencode"]);
    expect(skillsEvents.every((e) => e.status === "generated")).toBe(true);

    const lastSkillsIdx = events.map((e, i) => (e.type === "skills" ? i : -1)).filter((i) => i >= 0).pop()!;
    expect(lastSkillsIdx).toBeLessThan(firstSyncOrInstallIdx);
  });

  test("no skills frame is emitted when a generator fails", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: [], exitCode: 1 }));

    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    const events = parseSseEvents(res.text);
    expect(events.some((e) => e.type === "skills")).toBe(false);
  });
});

// ── APCR-09: both routes share one handler — identical frame sequences ──────

describe("POST /regenerate-and-install-stream vs /regenerate-stream — one shared handler (APCR-09)", () => {
  test("both routes emit an identical frame sequence for the same fixture", async () => {
    const fixture = { stdoutLines: ["Generating claude agents..."], stderrLines: ["a warning"], exitCode: 0 };

    spawnMock.mockImplementationOnce(() => makeFakeChild(fixture));
    const first = await postStream("/api/v1/model-registry/regenerate-and-install-stream");

    spawnMock.mockImplementationOnce(() => makeFakeChild(fixture));
    const second = await postStream("/api/v1/model-registry/regenerate-stream");

    expect(first.status).toBe(second.status);
    expect(parseSseEvents(first.text)).toEqual(parseSseEvents(second.text));
  });
});

// ── APCR-07: the SSE terminal frame carries the 501 reason, no spawn attempt ─

describe("SSE streams — terminal done frame carries the deployment-unavailable reason (APCR-07.5)", () => {
  test("regenerate-and-install-stream: no deployment root -> done frame with exitCode null + the shared message, never spawns", async () => {
    getDeploymentRoot.mockImplementationOnce(() => null);
    const res = await postStream("/api/v1/model-registry/regenerate-and-install-stream");
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    expect(events.length).toBe(1);
    const done = events[0];
    expect(done.type).toBe("done");
    expect(done.exitCode).toBeNull();
    expect(done.error as string).toContain("model-registry is unavailable in this deployment");
    expect(done.error as string).toContain("massa-ai source checkout");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test("regenerate-stream (deprecated alias): same 501 reason in the terminal frame", async () => {
    getDeploymentRoot.mockImplementationOnce(() => null);
    const res = await postStream("/api/v1/model-registry/regenerate-stream");
    const events = parseSseEvents(res.text);
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    expect(done!.exitCode).toBeNull();
    expect(done!.error as string).toContain("model-registry is unavailable in this deployment");
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

// ── REGEN-08: blocking /regenerate route unchanged ──────────────────────────
const blockingApp = new Elysia().use(modelRegistryRoutes);

async function post(path: string): Promise<{ status: number; json: any }> {
  const res = await blockingApp.handle(new Request(`http://localhost${path}`, { method: "POST" }));
  return { status: res.status, json: (await res.json()) as any };
}

describe("POST /api/v1/model-registry/regenerate — blocking route unchanged (REGEN-08)", () => {
  test("200 + regenerated:true on successful child process (uses spawnSync, not spawn)", async () => {
    spawnSyncMock.mockImplementationOnce(() => ({ exitCode: 0, stdout: "", stderr: "" }));
    const res = await post("/api/v1/model-registry/regenerate");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.regenerated).toBe(true);
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
  });

  test("500 on non-zero child process exit", async () => {
    spawnSyncMock.mockImplementationOnce(() => ({ exitCode: 1, stdout: "", stderr: "err" }));
    const res = await post("/api/v1/model-registry/regenerate");
    expect(res.status).toBe(500);
    expect(res.json.error).toContain("regeneration failed");
  });
});

// ── Real socket: auth gate (AD-011) ──────────────────────────────────────────
import { authMiddleware, __setAuthKeyForTests } from "../middleware/auth.js";

const API_KEY = "model-registry-stream-test-key";

async function allocateTcpPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") {
        reservation.close(() => reject(new Error("failed to allocate a TCP port")));
        return;
      }
      reservation.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

const socketApp = new Elysia({ adapter: node() }).use(authMiddleware).use(modelRegistryStreamRoutes);

let server: { stop?: () => void } | undefined;
let base = "";

beforeAll(async () => {
  __setAuthKeyForTests(API_KEY);
  const port = await allocateTcpPort();
  base = `http://127.0.0.1:${port}`;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server did not listen in time")), 5000);
    socketApp.listen(port, (srv: unknown) => {
      clearTimeout(timeout);
      server = srv as { stop?: () => void };
      resolve();
    });
  });
});

afterAll(() => {
  server?.stop?.();
  __setAuthKeyForTests(undefined);
});

describe("SEC — /api/v1/model-registry/regenerate-stream over a real socket", () => {
  test("POST without a key returns 401", async () => {
    const res = await fetch(`${base}/api/v1/model-registry/regenerate-stream`, { method: "POST" });
    expect(res.status).toBe(401);
  }, 15_000);

  test("POST with the key returns 200 + text/event-stream", async () => {
    spawnMock.mockImplementationOnce(() => makeFakeChild({ stdoutLines: ["line 1"], exitCode: 0 }));
    const res = await fetch(`${base}/api/v1/model-registry/regenerate-stream`, {
      method: "POST",
      headers: { "x-api-key": API_KEY },
    });
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") || "";
    expect(ct).toContain("text/event-stream");
    await res.text();
  }, 15_000);
});