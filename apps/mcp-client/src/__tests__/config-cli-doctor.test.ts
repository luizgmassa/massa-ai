/**
 * `massa-ai-config doctor [--fix]` (agent-drift followup T2).
 *
 * `runtimeDriftReport` is mocked (same pattern as config-cli-profile.test.ts):
 * the real doctor reads the operator's real home, and a test must never touch
 * `~/.claude`, `~/.config/massa-ai`, or the installed variant trees. The
 * mocked report drives the three output branches (healthy, drift, override)
 * and the `--fix` flow (switch invoked with the RECORDED profile, re-report
 * afterwards, exit codes). The --fix path's mutation is `switchProfile`, which
 * is mocked here — its own behavior is covered by the engine suites.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

type Report = {
  host: string;
  route: string;
  liveRoot: string | null;
  sourceVersion: string | null;
  stateVersion: string | null;
  pinnedVersion: string | null;
  activeProfile: string | null;
  roles: { name: string; model: string | null; effort: string | null; staleVariant: boolean }[];
  envOverride: { name: string; value: string } | null;
  versionDrift: boolean;
  profileMaterialized: boolean;
};

function report(overrides: Partial<Report> = {}): Report {
  return {
    host: "claude",
    route: "directory-source",
    liveRoot: "/repo/apps/claude-plugin",
    sourceVersion: "1.60.1",
    stateVersion: "1.60.1",
    pinnedVersion: "1.60.1",
    activeProfile: "work",
    roles: [
      { name: "massa-ai-investigator.md", model: "glm-5.3-flash", effort: "max", staleVariant: false },
    ],
    envOverride: null,
    versionDrift: false,
    profileMaterialized: false,
    ...overrides,
  };
}

function defaultSwitchReport(): unknown {
  return {
    profile: "work",
    dryRun: false,
    hosts: [{ host: "claude", status: "switched", filesChanged: 2 }],
    restartRequired: true,
  };
}

const runtimeDriftReport = mock((_opts?: unknown): unknown => report());
const switchProfile = mock((_opts?: unknown): unknown => defaultSwitchReport());
const syncGeneratedVariants = mock((_opts?: unknown): unknown => []);

const actualShared = require("@massa-ai/shared");
mock.module("@massa-ai/shared", () => ({
  ...actualShared,
  runtimeDriftReport: (...args: unknown[]) => runtimeDriftReport(...(args as [])),
  switchProfile: (...args: unknown[]) => switchProfile(...(args as [])),
  syncGeneratedVariants: (...args: unknown[]) => syncGeneratedVariants(...(args as [])),
}));

const { runCli } = await import("../config-cli.js");

function captureConsole(fn: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const origLog = console.log;
  const origError = console.error;
  console.log = (...a: unknown[]) => {
    out += a.join(" ") + "\n";
  };
  console.error = (...a: unknown[]) => {
    err += a.join(" ") + "\n";
  };
  return fn().finally(() => {
    console.log = origLog;
    console.error = origError;
  }).then((code) => ({ code, out, err }));
}

beforeEach(() => {
  runtimeDriftReport.mockClear();
  switchProfile.mockClear();
  syncGeneratedVariants.mockClear();
  runtimeDriftReport.mockImplementation(() => report());
  switchProfile.mockImplementation(() => defaultSwitchReport());
});

afterEach(() => {
  runtimeDriftReport.mockImplementation(() => report());
});

describe("massa-ai-config doctor", () => {
  test("healthy report → exit 0 and the healthy line", async () => {
    const { code, out } = await captureConsole(() => runCli(["doctor"]));
    expect(code).toBe(0);
    expect(out).toContain("doctor (claude, route: directory-source)");
    expect(out).toContain("healthy: every recording agrees.");
  });

  test("materialization drift is reported with the --fix remedy, exit 0", async () => {
    runtimeDriftReport.mockImplementation(() =>
      report({ profileMaterialized: true, roles: [
        { name: "massa-ai-investigator.md", model: "opus", effort: "high", staleVariant: true },
      ] }),
    );
    const { code, out } = await captureConsole(() => runCli(["doctor"]));
    expect(code).toBe(0);
    expect(out).toContain("STALE vs the recorded profile's variant");
    expect(out).toContain("doctor --fix");
  });

  test("env override is reported as report-only advice", async () => {
    runtimeDriftReport.mockImplementation(() =>
      report({ envOverride: { name: "CLAUDE_CODE_SUBAGENT_MODEL", value: "minimax-m3" } }),
    );
    const { code, out } = await captureConsole(() => runCli(["doctor"]));
    expect(code).toBe(0);
    expect(out).toContain("CLAUDE_CODE_SUBAGENT_MODEL=minimax-m3");
    expect(out).toContain("remove it from the host env");
  });

  test("--fix re-runs the switch for the RECORDED profile, then re-reports", async () => {
    let calls = 0;
    runtimeDriftReport.mockImplementation(() => {
      calls += 1;
      return calls === 1
        ? report({ profileMaterialized: true, roles: [
            { name: "massa-ai-investigator.md", model: "opus", effort: "high", staleVariant: true },
          ] })
        : report();
    });
    const { code, out } = await captureConsole(() => runCli(["doctor", "--fix", "--target", "/tmp/fake-home"]));
    expect(code).toBe(0);
    expect(switchProfile).toHaveBeenCalledTimes(1);
    const arg = switchProfile.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.profile).toBe("work"); // the RECORDED profile, not a flag
    expect(arg.targetHome).toBe("/tmp/fake-home");
    expect(out).toContain("claude: switched");
    expect(out).toContain("healthy: every recording agrees.");
  });

  test("--fix without a recorded active profile fails loud and switches nothing", async () => {
    runtimeDriftReport.mockImplementation(() => report({ activeProfile: null }));
    const { code, err } = await captureConsole(() => runCli(["doctor", "--fix"]));
    expect(code).toBe(1);
    expect(err).toContain("no recorded active profile");
    expect(switchProfile).not.toHaveBeenCalled();
  });

  test("--fix with a failed switch exits non-zero", async () => {
    switchProfile.mockImplementation(() => ({
      profile: "work",
      dryRun: false,
      hosts: [{ host: "claude", status: "failed", reason: "boom" }],
      restartRequired: false,
    }));
    const { code } = await captureConsole(() => runCli(["doctor", "--fix"]));
    expect(code).toBe(1);
  });

  test("an unknown --host is refused before anything runs", async () => {
    const { code, err } = await captureConsole(() => runCli(["doctor", "--host", "nope"]));
    expect(code).toBe(1);
    expect(err).toContain('unknown host "nope"');
    expect(runtimeDriftReport).not.toHaveBeenCalled();
  });

  test("with no --host, defaults to claude instead of switching every host", async () => {
    const { code } = await captureConsole(() => runCli(["doctor", "--fix", "--target", "/tmp/fake-home"]));
    expect(code).toBe(0);
    const switchArg = switchProfile.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(switchArg.host).toBe("claude");
  });

  test("--host codex threads through to the report and the fix", async () => {
    const { code } = await captureConsole(() =>
      runCli(["doctor", "--host", "codex", "--fix", "--target", "/tmp/fake-home"]),
    );
    expect(code).toBe(0);
    const firstReportArg = runtimeDriftReport.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstReportArg.host).toBe("codex");
    const switchArg = switchProfile.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(switchArg.host).toBe("codex");
    const secondReportArg = runtimeDriftReport.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(secondReportArg.host).toBe("codex");
  });

  test("--fix threads --target into syncGeneratedVariants, not the real home", async () => {
    const { code } = await captureConsole(() => runCli(["doctor", "--fix", "--target", "/tmp/fake-home"]));
    expect(code).toBe(0);
    const syncArg = syncGeneratedVariants.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(syncArg.targetHome).toBe("/tmp/fake-home");
  });
});
