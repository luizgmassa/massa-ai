/**
 * run-tests-parallel.ts — in-process unit tests for the pure helpers + runCli.
 *
 * The sibling run-tests-parallel.test.ts drives the CLI via subprocess (great
 * for end-to-end behavior but earns no in-process coverage credit). These tests
 * import the exported helpers and the argv-driven runCli() orchestrator directly
 * so the suite-table, filter, union-guard, summary, and execution paths are
 * covered in the test process. Crash probes (throwaway files dropped into the
 * runner's discovery root, then removed) exercise the parallel + serial tails.
 */
import { describe, test, expect } from "bun:test";
import { writeFileSync, rmSync, existsSync } from "fs";
import path from "path";

import {
  classifyIsolation,
  isDeadlineSensitive,
  parseArgs,
  filterSuites,
  unionGuardCheck,
  summarizeResults,
  statusOf,
  listSuitesTable,
  buildSuiteTable,
  runCli,
  type SuiteDef,
  type SuiteResult,
} from "../run-tests-parallel";

const CORE_TESTS_ROOT = path.resolve(import.meta.dir, "../../packages/core/src/__tests__");

// ── classifyIsolation ───────────────────────────────────────────────────────

describe("classifyIsolation", () => {
  const file = (name: string) => path.join(CORE_TESTS_ROOT, name);

  test("module mock", () => {
    expect(classifyIsolation(file("a.test.ts"), `mock.module("x", () => ({}));`)).toBe("module mock");
  });

  test("database/integration via DATABASE_URL token", () => {
    expect(classifyIsolation(file("a.test.ts"), `const u = process.env.DATABASE_URL;`)).toBe(
      "database/integration",
    );
  });

  test("database/integration via integration/ relative path", () => {
    const f = path.join(CORE_TESTS_ROOT, "integration", "x.test.ts");
    expect(classifyIsolation(f, `test("x", () => {});`)).toBe("database/integration");
  });

  test("database/integration via Prisma tokens", () => {
    expect(classifyIsolation(file("a.test.ts"), `const c = getPrismaClient();`)).toBe(
      "database/integration",
    );
  });

  test("process-global state via process.env assignment", () => {
    expect(classifyIsolation(file("a.test.ts"), `process.env.MY_VAR = "1";`)).toBe(
      "process-global state",
    );
  });

  test("process-global state via _setForTesting helper", () => {
    expect(classifyIsolation(file("a.test.ts"), `_setFooForTesting(1);`)).toBe(
      "process-global state",
    );
  });

  test("pure when nothing matches", () => {
    expect(classifyIsolation(file("a.test.ts"), `test("pure", () => expect(1).toBe(1));`)).toBe(
      "pure",
    );
  });
});

// ── isDeadlineSensitive ─────────────────────────────────────────────────────

describe("isDeadlineSensitive", () => {
  test("true for fake-timer / temporal tokens", () => {
    expect(isDeadlineSensitive(`useFakeTimers();`)).toBe(true);
    expect(isDeadlineSensitive(`setSystemTime(now);`)).toBe(true);
    expect(isDeadlineSensitive(`temporalInhibition = true;`)).toBe(true);
    expect(isDeadlineSensitive(`eventBus.emit();`)).toBe(true);
  });

  test("false otherwise", () => {
    expect(isDeadlineSensitive(`test("x", () => {});`)).toBe(false);
  });
});

// ── parseArgs ───────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  test("defaults: no list, no filter, no unknown", () => {
    const p = parseArgs([]);
    expect(p.listSuites).toBe(false);
    expect(p.filterRegex).toBeUndefined();
    expect(p.unknownArgs).toEqual([]);
  });

  test("--list-suites sets the flag", () => {
    expect(parseArgs(["--list-suites"]).listSuites).toBe(true);
  });

  test("--filter= compiles a regex", () => {
    const p = parseArgs(["--filter=foo\\.test"]);
    expect(p.filterRegex).toBeInstanceOf(RegExp);
    expect(p.filterRegex!.test("foo.test")).toBe(true);
  });

  test("--serial-tail= is recognized (not unknown)", () => {
    expect(parseArgs(["--serial-tail=2"]).unknownArgs).toEqual([]);
  });

  test("unrecognized --flag is collected as unknown", () => {
    expect(parseArgs(["--bogus"]).unknownArgs).toEqual(["--bogus"]);
  });
});

// ── filterSuites ────────────────────────────────────────────────────────────

describe("filterSuites", () => {
  const suites: SuiteDef[] = [
    { id: "pure-shared", description: "d", testFiles: ["/a/b.test.ts"], isolationReason: "pure", deadlineSensitive: false },
    { id: "process-global state:x/y.test.ts", description: "d", testFiles: ["/a/y.test.ts"], isolationReason: "process-global state", deadlineSensitive: true },
  ];

  test("passthrough when no regex", () => {
    expect(filterSuites(suites, undefined).length).toBe(2);
  });

  test("matches by id", () => {
    expect(filterSuites(suites, /^pure-shared$/).map((s) => s.id)).toEqual(["pure-shared"]);
  });

  test("matches by test file path", () => {
    expect(filterSuites(suites, /y\.test\.ts$/).map((s) => s.id)).toEqual([
      "process-global state:x/y.test.ts",
    ]);
  });
});

// ── unionGuardCheck ─────────────────────────────────────────────────────────

describe("unionGuardCheck", () => {
  const suites: SuiteDef[] = [
    { id: "a", description: "d", testFiles: [], isolationReason: "pure", deadlineSensitive: false },
    { id: "b", description: "d", testFiles: [], isolationReason: "pure", deadlineSensitive: false },
  ];
  const res = (id: string): SuiteResult => ({
    suiteId: id,
    exitCode: 0,
    signal: null,
    crashed: false,
    passed: true,
  });

  test("ok when result-set equals list", () => {
    expect(unionGuardCheck(suites, [res("a"), res("b")])).toEqual({ ok: true, missing: [], extra: [] });
  });

  test("reports missing (listed but no result)", () => {
    const g = unionGuardCheck(suites, [res("a")]);
    expect(g.ok).toBe(false);
    expect(g.missing).toEqual(["b"]);
    expect(g.extra).toEqual([]);
  });

  test("reports extra (phantom result)", () => {
    const g = unionGuardCheck([suites[0]!], [res("a"), res("phantom")]);
    expect(g.ok).toBe(false);
    expect(g.extra).toEqual(["phantom"]);
  });
});

// ── summarizeResults + statusOf ─────────────────────────────────────────────

describe("summarizeResults + statusOf", () => {
  const r = (over: Partial<SuiteResult>): SuiteResult => ({
    suiteId: "x",
    exitCode: 0,
    signal: null,
    crashed: false,
    passed: true,
    ...over,
  });

  test("counts passed/failed/crashed", () => {
    const s = summarizeResults([
      r({ suiteId: "p", passed: true }),
      r({ suiteId: "f", passed: false, exitCode: 1 }),
      r({ suiteId: "c", passed: false, crashed: true, signal: "SIGSEGV" }),
    ]);
    expect(s).toEqual({ passed: 1, failed: 2, crashed: 1 });
  });

  test("statusOf maps to PASS / FAIL / CRASH", () => {
    expect(statusOf(r({ passed: true }))).toBe("PASS");
    expect(statusOf(r({ passed: false, exitCode: 1 }))).toBe("FAIL");
    expect(statusOf(r({ passed: false, crashed: true, signal: "SIGSEGV" }))).toBe("CRASH");
  });
});

// ── listSuitesTable ─────────────────────────────────────────────────────────

describe("listSuitesTable", () => {
  test("renders header, fields, and the deadline tag", () => {
    const out = listSuitesTable([
      { id: "pure-shared", description: "desc", testFiles: ["/a.test.ts", "/b.test.ts"], isolationReason: "pure", deadlineSensitive: false },
      { id: "proc:x.test.ts", description: "desc2", testFiles: ["/x.test.ts"], isolationReason: "process-global state", deadlineSensitive: true },
    ]);
    expect(out).toContain("SUITE_TABLE (2 suites)");
    expect(out).toContain("pure-shared");
    expect(out).toContain("testFiles: 2");
    expect(out).toContain("isolationReason: process-global state");
    expect(out).toContain("[DEADLINE-SENSITIVE]");
  });
});

// ── buildSuiteTable (real discovery) ────────────────────────────────────────

describe("buildSuiteTable", () => {
  test("discovers core suites, excludes integration/, emits pure-shared", async () => {
    const suites = await buildSuiteTable();
    expect(suites.length).toBeGreaterThan(0);
    // integration/ directory must be excluded
    expect(suites.every((s) => !s.id.startsWith("integration"))).toBe(true);
    // pure-shared present when there are pure tests
    expect(suites.some((s) => s.id === "pure-shared")).toBe(true);
  });
});

// ── runCli (in-process orchestrator) ────────────────────────────────────────

const PARALLEL_CRASH = "__zzz_crash_parallel_probe.test.ts";
const SERIAL_CRASH = "__zzz_crash_serial_probe.test.ts";
const SIGNAL_CRASH = "__zzz_crash_signal_probe.test.ts";

function writeProbe(name: string, deadlineSensitive: boolean, viaSignal = false): void {
  const lines = [
    `// Auto-generated by run-tests-parallel-coverage.test.ts — do NOT commit.`,
    `process.env.__CRASH_PROBE = "1";`,
  ];
  if (deadlineSensitive) lines.push(`// uses useFakeTimers -> deadline-sensitive serial tail`);
  if (viaSignal) {
    lines.push(`process.kill(process.pid, "SIGKILL");`);
  } else {
    lines.push(`import { test } from "bun:test";`, `test("crash probe", () => { process.exit(1); });`);
  }
  lines.push(``);
  writeFileSync(path.join(CORE_TESTS_ROOT, name), lines.join("\n"));
}

function cleanupProbe(name: string): void {
  const p = path.join(CORE_TESTS_ROOT, name);
  try {
    if (existsSync(p)) rmSync(p, { force: true });
  } catch {
    // best-effort
  }
}

describe("runCli (in-process)", () => {
  test("--list-suites returns 0 and prints the table", async () => {
    const lines: string[] = [];
    const orig = console.log;
    let code: number;
    try {
      console.log = (...a: unknown[]) => lines.push(a.join(" "));
      code = await runCli(["--list-suites"]);
    } finally {
      console.log = orig;
    }
    expect(code!).toBe(0);
    expect(lines.some((l) => l.includes("SUITE_TABLE"))).toBe(true);
  });

  test("unknown flag returns 2", async () => {
    expect(await runCli(["--nope"])).toBe(2);
  });

  test("a filter matching no suite returns 0 (empty union guard)", async () => {
    expect(await runCli(["--filter=ZZZ_NEVER_MATCHES_xyz"])).toBe(0);
  });

  test("a crashing suite in the parallel tail returns 1 (UNION GUARD counts failures)", async () => {
    cleanupProbe(PARALLEL_CRASH);
    writeProbe(PARALLEL_CRASH, false);
    try {
      const code = await runCli([`--filter=${PARALLEL_CRASH}`]);
      expect(code).toBe(1);
    } finally {
      cleanupProbe(PARALLEL_CRASH);
    }
  });

  test("a crashing deadline-sensitive suite in the serial tail returns 1", async () => {
    cleanupProbe(SERIAL_CRASH);
    writeProbe(SERIAL_CRASH, true);
    try {
      const code = await runCli([`--filter=${SERIAL_CRASH}`]);
      expect(code).toBe(1);
    } finally {
      cleanupProbe(SERIAL_CRASH);
    }
  });

  test("a suite killed by signal sets crashed=true and returns 1 (ZERO-LOSS guard)", async () => {
    cleanupProbe(SIGNAL_CRASH);
    writeProbe(SIGNAL_CRASH, false, true);
    try {
      const code = await runCli([`--filter=${SIGNAL_CRASH}`]);
      expect(code).toBe(1);
    } finally {
      cleanupProbe(SIGNAL_CRASH);
    }
  });
});
