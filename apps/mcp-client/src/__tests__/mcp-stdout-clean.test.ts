/**
 * MCP stdout cleanliness regression test.
 *
 * Verifies that the MCP server's stdout remains pure JSON-RPC, with no
 * preambles or log output. This is critical for the stdio MCP protocol:
 * any non-JSON byte on stdout breaks the handshake.
 *
 * Background: Bug 3 was dotenv and logger output on stdout.
 * All logs (DEBUG, INFO, WARN, ERROR) must route to stderr.
 */

import { describe, test, expect } from "bun:test";
import { spawn } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const MCP_BIN = path.resolve(import.meta.dir, "../../dist/index.js");

/**
 * Spawn the server under a throwaway HOME.
 *
 * This is load-bearing, not hygiene. The startup path writes a default config
 * when none exists, and that first-run branch is exactly where stdout leaks
 * have hidden. Inheriting the developer's HOME means the branch never runs
 * locally, so the suite passed on every workstation while failing CI — which
 * boots with a fresh HOME. Isolating it makes the first-run path the path
 * under test everywhere.
 */
function spawnMcp(): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const home = mkdtempSync(path.join(tmpdir(), "massa-ai-mcp-stdout-"));
    const proc = spawn("bun", [MCP_BIN], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 3000,
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: path.join(home, ".config"),
      },
    });
    const cleanup = () => rmSync(home, { recursive: true, force: true });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));

    proc.on("error", (err) => {
      cleanup();
      reject(err);
    });
    proc.on("close", (code) => {
      cleanup();
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

describe("MCP stdout cleanliness (Bug 3 regression)", () => {
  test("MCP server stdout is empty (no preambles, no logs)", async () => {
    const { stdout } = await spawnMcp();

    // Stdout MUST be empty or contain only JSON-RPC (which we don't emit during startup).
    // Sending nothing and reading nothing is the correct behavior for a server
    // waiting on stdin.
    expect(stdout.length).toBe(0);
  });

  test("MCP server logs go to stderr, not stdout", async () => {
    const { stderr } = await spawnMcp();

    // Logs MUST appear on stderr (INFO, WARN, ERROR messages are fine there).
    // Common log indicators: timestamps, [INFO], [WARN], [ERROR], etc.
    expect(stderr.length).toBeGreaterThan(0);
    expect(stderr).toContain("[INFO]");
  });

  test("dotenv banner (if present) must not reach stdout", async () => {
    const { stdout } = await spawnMcp();

    // dotenvx used to print "◇ injected env" to stdout. After fix, this
    // should never appear on stdout (quiet: true silences it).
    expect(stdout).not.toContain("injected env");
  });
});
