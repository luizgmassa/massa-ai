/**
 * `massa-ai-config profile list|show|set` (T13 / TASK-013).
 *
 * Mocks `@massa-ai/shared`'s `listProfiles`/`switchProfile` — the real
 * engine defaults `targetHome` to `os.homedir()`, and the CLI's argument
 * surface has no way to inject a fixture root, so a real call from a test
 * would risk mutating whatever host plugins happen to be installed on the
 * machine running the suite. Invalid-host / missing-name validation (which
 * never reaches the engine) is covered safely, without mocking, in
 * `scripts/__tests__/profile-cli-parity.test.ts`.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const listProfiles = mock((..._args: unknown[]): unknown => ({ hosts: [] }));
const switchProfile = mock((..._args: unknown[]): unknown => ({
  profile: "work",
  dryRun: false,
  hosts: [],
  restartRequired: false,
}));

// Pre-resolved BEFORE registering the mock — see embedded-profiles.test.ts's
// comment for why a `require()` inside the factory recurses and silently
// drops exports.
const actualShared = require("@massa-ai/shared");
mock.module("@massa-ai/shared", () => ({
  ...actualShared,
  listProfiles: (...args: unknown[]) => listProfiles(...args),
  switchProfile: (...args: unknown[]) => switchProfile(...args),
}));

const { runCli } = await import("../config-cli.js");

function captureConsole(fn: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => { out += a.join(" ") + "\n"; };
  console.error = (...a: unknown[]) => { err += a.join(" ") + "\n"; };
  return fn().then(
    (code) => { console.log = origLog; console.error = origErr; return { code, out, err }; },
    (e) => { console.log = origLog; console.error = origErr; throw e; },
  );
}

beforeEach(() => {
  listProfiles.mockClear();
  switchProfile.mockClear();
});

describe("profile list / profile show", () => {
  test("prints per-host active profile + bundle version (P2 AC2)", async () => {
    listProfiles.mockImplementationOnce(() => ({
      hosts: [
        { host: "claude", installed: true, skipped: false, skipReason: null, activeProfile: "work", bundleVersion: "1.2.0", availableProfiles: ["balanced", "work"] },
        { host: "cursor", installed: false, skipped: true, skipReason: "all tiers inherit", activeProfile: null, bundleVersion: null, availableProfiles: [] },
      ],
    }));
    const r = await captureConsole(() => runCli(["profile", "list"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("claude");
    expect(r.out).toContain("active=work");
    expect(r.out).toContain("bundle=1.2.0");
    expect(r.out).toContain("cursor: skipped");
  });

  test("profile show is an alias for profile list (same data)", async () => {
    listProfiles.mockImplementationOnce(() => ({ hosts: [] }));
    const r = await captureConsole(() => runCli(["profile", "show"]));
    expect(r.code).toBe(0);
    expect(listProfiles).toHaveBeenCalledTimes(1);
  });

  test("engine failure → exit 1", async () => {
    listProfiles.mockImplementationOnce(() => {
      throw new Error("state corrupt");
    });
    const r = await captureConsole(() => runCli(["profile", "list"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("state corrupt");
  });
});

describe("profile set", () => {
  test("switches and reports the restart notice (P1 AC2)", async () => {
    switchProfile.mockImplementationOnce(() => ({
      profile: "work",
      dryRun: false,
      hosts: [{ host: "claude", status: "switched", filesChanged: 12 }],
      restartRequired: true,
    }));
    const r = await captureConsole(() => runCli(["profile", "set", "work"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("claude: switched (12 files changed)");
    expect(r.out).toContain("restart is required");
    expect((switchProfile.mock.calls.at(-1) as any[] | undefined)?.[0]).toMatchObject({ profile: "work", dryRun: false });
  });

  test("--dry-run passes through and prints the plan without a restart notice", async () => {
    switchProfile.mockImplementationOnce(() => ({
      profile: "work",
      dryRun: true,
      hosts: [{ host: "claude", status: "switched" }],
      restartRequired: false,
    }));
    const r = await captureConsole(() => runCli(["profile", "set", "work", "--dry-run"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("dry run — no files changed");
    expect(r.out).not.toContain("restart is required");
    expect((switchProfile.mock.calls.at(-1) as any[] | undefined)?.[0]).toMatchObject({ dryRun: true });
  });

  test("--host <h> passes through", async () => {
    switchProfile.mockImplementationOnce(() => ({ profile: "work", dryRun: false, hosts: [], restartRequired: false }));
    await captureConsole(() => runCli(["profile", "set", "work", "--host", "codex"]));
    expect((switchProfile.mock.calls.at(-1) as any[] | undefined)?.[0]).toMatchObject({ host: "codex" });
  });

  test("a partial failure (mixed report) exits 1", async () => {
    switchProfile.mockImplementationOnce(() => ({
      profile: "work",
      dryRun: false,
      hosts: [
        { host: "claude", status: "switched", filesChanged: 3 },
        { host: "codex", status: "failed", reason: "no install route recorded" },
      ],
      restartRequired: true,
    }));
    const r = await captureConsole(() => runCli(["profile", "set", "work"]));
    expect(r.code).toBe(1);
    expect(r.out).toContain("codex: failed: no install route recorded");
  });

  test("engine failure (e.g. UnknownProfileError) → exit 1, message relayed", async () => {
    switchProfile.mockImplementationOnce(() => {
      throw new Error('unknown profile "nope" — installed: balanced, work');
    });
    const r = await captureConsole(() => runCli(["profile", "set", "nope"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("unknown profile");
  });
});
