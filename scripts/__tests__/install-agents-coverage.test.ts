/**
 * install-agents.ts — in-process coverage for the CLI shell (parseArgs, main,
 * printPlan) and the deepGet helper. The sibling install-agents.test.ts covers
 * the writer/orchestration logic in-process; these complement it by driving the
 * argv entrypoints directly so the process.exit-bearing shell earns coverage.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

import {
  parseArgs,
  main,
  printPlan,
  deepGet,
  type Plan,
  type PlanChange,
} from "../install-agents";

// ── parseArgs ───────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  test("parses every recognized flag", () => {
    const opts = parseArgs([
      "--dry-run",
      "--uninstall",
      "--yes",
      "--agent",
      "codex",
      "--target",
      "/tmp/h",
      "--api-base",
      "http://example:1",
    ]);
    expect(opts.dryRun).toBe(true);
    expect(opts.uninstall).toBe(true);
    expect(opts.yes).toBe(true);
    expect(opts.agent).toBe("codex");
    expect(opts.target).toBe("/tmp/h");
    expect(opts.apiBaseUrl).toBe("http://example:1");
  });

  test("-y is an alias for --yes", () => {
    expect(parseArgs(["-y"]).yes).toBe(true);
  });

  test("returns an empty options object for no args", () => {
    const opts = parseArgs([]);
    expect(opts.dryRun).toBeUndefined();
    expect(opts.agent).toBeUndefined();
  });

  test("exits 2 on an unrecognized --flag", () => {
    const origExit = process.exit;
    let captured: unknown;
    (process as { exit: unknown }).exit = ((code?: number) => {
      captured = code;
      throw new Error(`__EXIT__${code}`);
    }) as never;
    try {
      expect(() => parseArgs(["--bogus"])).toThrow(/__EXIT__2/);
      expect(captured).toBe(2);
    } finally {
      process.exit = origExit;
    }
  });

  test("exits 0 on --help/-h", () => {
    const origExit = process.exit;
    (process as { exit: unknown }).exit = ((code?: number) => {
      throw new Error(`__EXIT__${code ?? 0}`);
    }) as never;
    try {
      expect(() => parseArgs(["-h"])).toThrow(/__EXIT__0/);
    } finally {
      process.exit = origExit;
    }
  });

  test("ignores positional (non-dash) tokens without error", () => {
    expect(() => parseArgs(["positional"])).not.toThrow();
  });
});

// ── printPlan ───────────────────────────────────────────────────────────────

describe("printPlan", () => {
  function capture(fn: () => void): { out: string[]; err: string[] } {
    const out: string[] = [];
    const err: string[] = [];
    const oLog = console.log;
    const oErr = console.error;
    try {
      console.log = (...a: unknown[]) => out.push(a.join(" "));
      console.error = (...a: unknown[]) => err.push(a.join(" "));
      fn();
    } finally {
      console.log = oLog;
      console.error = oErr;
    }
    return { out, err };
  }

  test("up-to-date plan prints 'no change'", () => {
    const plan: Plan = {
      agent: "codex",
      configPath: "/x/config.toml",
      exists: true,
      changes: [],
    };
    const { out } = capture(() => printPlan(plan));
    expect(out.some((l) => l.includes("up to date (no change)"))).toBe(true);
  });

  test("a plan with add/replace/remove changes prints each kind", () => {
    const changes: PlanChange[] = [
      { path: "/mcpServers/massa-ai", kind: "add", after: { a: 1 } },
      { path: "/mcpServers/massa-ai", kind: "replace", before: { a: 0 }, after: { a: 1 } },
      { path: "/mcpServers/massa-ai", kind: "remove", before: { a: 1 } },
    ];
    const plan: Plan = { agent: "cursor", configPath: "/x/mcp.json", exists: false, changes };
    const { out } = capture(() => printPlan(plan));
    expect(out.some((l) => l.includes("(create)"))).toBe(true);
    expect(out.some((l) => l.includes("ADD"))).toBe(true);
    expect(out.some((l) => l.includes("REPLACE"))).toBe(true);
    expect(out.some((l) => l.includes("REMOVE"))).toBe(true);
  });

  test("an existing-file plan is tagged (merge)", () => {
    const plan: Plan = {
      agent: "codex",
      configPath: "/x/config.toml",
      exists: true,
      changes: [{ path: "/p", kind: "add", after: 1 }],
    };
    const { out } = capture(() => printPlan(plan));
    expect(out.some((l) => l.includes("(merge)"))).toBe(true);
  });
});

// ── main (argv entrypoint) ──────────────────────────────────────────────────

describe("main (argv entrypoint)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-agents-cli-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("dry-run against a temp home returns 0 and prints a plan header", async () => {
    const out: string[] = [];
    const oLog = console.log;
    try {
      console.log = (...a: unknown[]) => out.push(a.join(" "));
      const code = await main(["--dry-run", "--target", tmp]);
      expect(code).toBe(0);
    } finally {
      console.log = oLog;
    }
    expect(out.some((l) => l.includes("massa-ai dry-run plan:"))).toBe(true);
    expect(out.some((l) => l.includes("Dry run — wrote 0 files"))).toBe(true);
  });

  test("refuses real $HOME without consent -> exit 13", async () => {
    const oErr = console.error;
    try {
      console.error = () => {};
      const code = await main(["--target", os.homedir()]);
      expect(code).toBe(13);
    } finally {
      console.error = oErr;
    }
  });
});

// ── deepGet ─────────────────────────────────────────────────────────────────

describe("deepGet", () => {
  test("traverses a nested object path", () => {
    expect(deepGet({ a: { b: { c: 7 } } }, ["a", "b", "c"])).toBe(7);
  });

  test("returns undefined for a missing key", () => {
    expect(deepGet({ a: { b: 1 } }, ["a", "missing"])).toBeUndefined();
  });

  test("stops safely at a non-object leaf", () => {
    expect(deepGet({ a: 5 } as Record<string, unknown>, ["a", "b"])).toBeUndefined();
  });

  test("treats arrays as non-traversable", () => {
    expect(deepGet({ a: [1, 2] } as Record<string, unknown>, ["a", "0"])).toBeUndefined();
  });
});
