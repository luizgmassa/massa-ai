/**
 * Cross-CLI `profile` subcommand parity (T13 / TASK-013, MPS-06 AC4).
 *
 * `apps/mcp-client/src/config-cli.ts` and `apps/opencode-plugin/src/config-cli.ts`
 * are two independent implementations of the same `massa-ai-config` surface
 * (design Risk: "Two `config-cli.ts` implementations drift"). This asserts
 * both expose the identical `profile list|show|set` subcommand set with the
 * same validation behavior, delegating to the same `@massa-ai/shared` switch
 * engine rather than diverging. Only argument-validation paths are exercised
 * here (missing name, invalid host, unknown subcommand) — none reach the
 * real switch engine, which defaults to `os.homedir()` and must never be
 * invoked un-mocked from a test (would risk mutating installed host plugins
 * on the machine running the suite).
 */

import { describe, test, expect } from "bun:test";
import { runCli as mcpRunCli } from "../../apps/mcp-client/src/config-cli.js";
import { runCli as ocRunCli } from "../../apps/opencode-plugin/src/config-cli.js";

const CLIS = [
  ["mcp-client", mcpRunCli],
  ["opencode-plugin", ocRunCli],
] as const;

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

describe("profile subcommand — cross-CLI parity", () => {
  test.each(CLIS)("%s: --help advertises profile list|show|set", async (_name, runCli) => {
    const r = await captureConsole(() => runCli(["--help"]));
    expect(r.code).toBe(0);
    expect(r.out).toContain("profile list");
    expect(r.out).toContain("profile show");
    expect(r.out).toContain("profile set");
    expect(r.out).toMatch(/--host/);
    expect(r.out).toMatch(/--dry-run/);
  });

  test.each(CLIS)("%s: profile set with no name → exit 1, usage error", async (_name, runCli) => {
    const r = await captureConsole(() => runCli(["profile", "set"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("profile set <name>");
  });

  test.each(CLIS)("%s: profile set with an unknown host → exit 1, no engine call", async (_name, runCli) => {
    const r = await captureConsole(() => runCli(["profile", "set", "work", "--host", "nonesuch"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain('unknown host "nonesuch"');
  });

  test.each(CLIS)("%s: profile with an unknown subcommand → exit 1, usage error", async (_name, runCli) => {
    const r = await captureConsole(() => runCli(["profile", "bogus"]));
    expect(r.code).toBe(1);
    expect(r.err).toContain("profile <list|show|set>");
  });

  test("both CLIs produce byte-identical usage errors for the same invalid input (drift guard)", async () => {
    const [mcp, oc] = await Promise.all([
      captureConsole(() => mcpRunCli(["profile", "set", "work", "--host", "nonesuch"])),
      captureConsole(() => ocRunCli(["profile", "set", "work", "--host", "nonesuch"])),
    ]);
    expect(mcp.code).toBe(oc.code);
    expect(mcp.err).toBe(oc.err);
  });
});
