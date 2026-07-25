/**
 * run-deterministic.ts — in-process unit tests.
 *
 * The script computes its discovery table at module load (top-level await over
 * packages/core/src/__tests__), so merely importing it exercises discovery.
 * We test the classifier (all branches), findTestFiles, the extracted pure
 * report/interpreter helpers, main() with an injected fake runTests, and
 * defaultRunTests via a throwaway passing probe so the real spawn happy-path
 * is covered without running the whole deterministic suite.
 */
import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

import {
  classify,
  findTestFiles,
  buildDiscoveryReport,
  interpretOutcome,
  main,
  defaultRunTests,
  type SuiteEntry,
  type RunOutcome,
} from "../run-deterministic";

const CORE_TESTS_ROOT = path.resolve(import.meta.dir, "../../packages/core/src/__tests__");

// ── classify (every branch) ─────────────────────────────────────────────────

describe("classify", () => {
  const f = (name: string) => path.join(CORE_TESTS_ROOT, name);

  test("module mock", () => {
    expect(classify(f("a.test.ts"), `mock.module("x", () => ({}));`)).toBe("module mock");
  });

  test("database/integration — DATABASE_URL token", () => {
    expect(classify(f("a.test.ts"), `const u = process.env.DATABASE_URL;`)).toBe(
      "database/integration",
    );
  });

  test("database/integration — integration/ relative path", () => {
    expect(classify(path.join(CORE_TESTS_ROOT, "integration", "x.test.ts"), `test("x");`)).toBe(
      "database/integration",
    );
  });

  test("database/integration — Prisma tokens", () => {
    expect(classify(f("a.test.ts"), `const c = getPrismaClient();`)).toBe("database/integration");
  });

  test("database/integration — repository tokens", () => {
    expect(classify(f("a.test.ts"), `const s = new PostgresVectorStore();`)).toBe(
      "database/integration",
    );
  });

  test("database/integration — pipeline tokens", () => {
    expect(classify(f("a.test.ts"), `const p = new EtlPipeline();`)).toBe("database/integration");
  });

  test("database/integration — store accessor tokens", () => {
    expect(classify(f("a.test.ts"), `const g = getGraphStore();`)).toBe("database/integration");
  });

  test("network — real fetch to localhost (no mock)", () => {
    const src = `fetch("http://localhost:3333");`;
    expect(classify(f("a.test.ts"), src)).toBe("network");
  });

  test("not network when fetch present but mocked", () => {
    const src = `mock.fetch(); fetch("http://localhost:3333");`;
    expect(classify(f("a.test.ts"), src)).not.toBe("network");
  });

  test("grammar — tree-sitter import", () => {
    const src = `import { Parser } from "tree-sitter";\nconst p = new Parser();`;
    expect(classify(f("a.test.ts"), src)).toBe("grammar");
  });

  test("process-global state — eventBus", () => {
    expect(classify(f("a.test.ts"), `eventBus.emit("x");`)).toBe("process-global state");
  });

  test("process-global state — _setForTesting helper", () => {
    expect(classify(f("a.test.ts"), `_setCacheForTesting(1);`)).toBe("process-global state");
  });

  test("process-global state — delete process.env", () => {
    expect(classify(f("a.test.ts"), `delete process.env.MY_VAR;`)).toBe("process-global state");
  });

  test("undefined for a pure unit test", () => {
    expect(classify(f("a.test.ts"), `test("pure", () => expect(1).toBe(1));`)).toBeUndefined();
  });
});

// ── findTestFiles ───────────────────────────────────────────────────────────

describe("findTestFiles", () => {
  test("walks recursively, returning only *.test.ts files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-det-"));
    try {
      await fs.mkdir(path.join(tmp, "nested"));
      await fs.writeFile(path.join(tmp, "a.test.ts"), "x");
      await fs.writeFile(path.join(tmp, "b.ts"), "x");
      await fs.writeFile(path.join(tmp, "nested", "c.test.ts"), "x");
      await fs.writeFile(path.join(tmp, "nested", "d.txt"), "x");

      const files = (await findTestFiles(tmp)).map((p) => path.relative(tmp, p)).sort();
      expect(files).toEqual(["a.test.ts", path.join("nested", "c.test.ts")]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── buildDiscoveryReport ────────────────────────────────────────────────────

describe("buildDiscoveryReport", () => {
  const entry = (over: Partial<SuiteEntry>): SuiteEntry => ({
    file: "/x.test.ts",
    relativePath: "x.test.ts",
    reason: undefined,
    skipped: false,
    skipReason: null,
    ...over,
  });

  test("omits the skipped-suites section when none are skipped", () => {
    const lines = buildDiscoveryReport([entry({})], ["/x.test.ts"], []);
    expect(lines.some((l) => l.endsWith("1 deterministic, 0 skipped"))).toBe(true);
    expect(lines.some((l) => l.includes("Skipped suites:"))).toBe(false);
  });

  test("includes a SKIP line per skipped suite with its reason", () => {
    const lines = buildDiscoveryReport(
      [entry({}), entry({ relativePath: "int/y.test.ts", skipped: true, skipReason: "requires live PostgreSQL database" })],
      ["/x.test.ts"],
      [entry({ relativePath: "int/y.test.ts", skipped: true, skipReason: "requires live PostgreSQL database" })],
    );
    expect(lines).toContain("\n[deterministic] Skipped suites:");
    expect(lines).toContain("  SKIP int/y.test.ts — requires live PostgreSQL database");
  });
});

// ── interpretOutcome ────────────────────────────────────────────────────────

describe("interpretOutcome", () => {
  test("signal death -> exit 1 with SIGNAL reason", () => {
    const r = interpretOutcome({ code: null, signal: "SIGSEGV" });
    expect(r.exitCode).toBe(1);
    expect(r.reason).toBe("[deterministic] SIGNAL SIGSEGV");
  });

  test("non-zero code -> that code with FAIL reason", () => {
    const r = interpretOutcome({ code: 3, signal: null });
    expect(r.exitCode).toBe(3);
    expect(r.reason).toBe("[deterministic] FAIL (exit 3)");
  });

  test("null code + no signal -> exit 1 (defensive)", () => {
    expect(interpretOutcome({ code: null, signal: null }).exitCode).toBe(1);
  });

  test("zero code -> pass (empty reason)", () => {
    expect(interpretOutcome({ code: 0, signal: null })).toEqual({ exitCode: 0, reason: "" });
  });
});

// ── main (injected fake runTests) ───────────────────────────────────────────

describe("main (injected runTests)", () => {
  test("returns 0 when the injected runTests reports code 0", async () => {
    const code = await main(async () => ({ code: 0, signal: null }));
    expect(code).toBe(0);
  });

  test("returns the child code on failure", async () => {
    const code = await main(async () => ({ code: 2, signal: null }));
    expect(code).toBe(2);
  });

  test("returns 1 on a signal death", async () => {
    const code = await main(async () => ({ code: null, signal: "SIGTERM" }));
    expect(code).toBe(1);
  });

  test("returns 1 when runTests throws", async () => {
    const code = await main(async () => {
      throw new Error("spawn ENOENT");
    });
    expect(code).toBe(1);
  });
});

// ── defaultRunTests (real spawn happy-path via a throwaway probe) ────────────

describe("defaultRunTests", () => {
  test("spawns `bun test` for a passing probe file and resolves code 0", async () => {
    const probe = path.join(CORE_TESTS_ROOT, "__zzz_det_probe.test.ts");
    await fs.writeFile(
      probe,
      [
        `// Auto-generated by run-deterministic-coverage.test.ts — do NOT commit.`,
        `import { test, expect } from "bun:test";`,
        `test("det probe", () => { expect(1 + 1).toBe(2); });`,
        ``,
      ].join("\n"),
    );
    try {
      const outcome: RunOutcome = await defaultRunTests([probe]);
      expect(outcome.code).toBe(0);
      expect(outcome.signal).toBeNull();
    } finally {
      await fs.rm(probe, { force: true });
    }
  }, 30000);
});
