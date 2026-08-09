/**
 * APR spec R3 / AC-7 — explicit negative-space assertion. The embedded-mode
 * parity suite forward-enumerates TOOL_DEFINITIONS only, so "parity green"
 * would stay green whether or not a Web-UI-only route leaked into the tool
 * surface — omission is not evidence. This asserts the omission directly:
 * `/api/v1/system/restart` restarts the tools-api process; in embedded mode
 * that process IS the MCP host, so a restart tool would kill the host
 * mid-session (APR-06). It must never appear anywhere in mcp-client source.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOL_DEFINITIONS } from "../tool-definitions.js";

const PKG_ROOT = join(import.meta.dir, "..", "..");

describe("web-ui-only tools-api routes stay off the MCP tool surface", () => {
  test("no tool definition is restart-shaped", () => {
    const restartish = TOOL_DEFINITIONS.filter((t) => /restart/i.test(t.name));
    expect(restartish).toEqual([]);
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(40); // population beside verdict
  });

  test("no mcp-client source references /api/v1/system/restart", () => {
    const ls = Bun.spawnSync(["git", "ls-files", "src"], { cwd: PKG_ROOT });
    const files = ls.stdout
      .toString()
      .trim()
      .split("\n")
      .filter((f) => f.endsWith(".ts") && !f.includes("__tests__") && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(10);

    const offenders = files.filter((f) =>
      readFileSync(join(PKG_ROOT, f), "utf8").includes("system/restart"),
    );
    expect(offenders).toEqual([]);
  });
});
