/**
 * XP-03 / TASK-XP-005 — the security-allowlist gate's own unit suite.
 *
 * Same discipline as `check-tools-thin.test.ts`: every AST class gets a RED
 * case (a real call) and a GREEN case (an evasion shape a regex would have
 * been fooled by — string literal, comment, rename, `RegExp.prototype.exec`)
 * over the same shape, and every population-level assertion is paired with a
 * non-zero-population sanity check.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ALLOWLIST_PATH,
  CLASSES,
  REPO_ROOT,
  analyzeSource,
  check,
  parseAllowlist,
  report,
  trackedPopulationFiles,
} from "../check-security-allowlist.ts";
import { readFileSync } from "node:fs";

// ── analyzeSource — AST correctness, red/green per class ────────────────────

describe("analyzeSource — child-process class", () => {
  test("RED: a direct named-import call is a hit", () => {
    const hits = analyzeSource("f.ts", `import { exec } from "child_process";\nexec("ls");\n`);
    expect(hits.map((h) => h.cls)).toEqual(["child-process"]);
  });

  test("RED: a renamed import is still tracked by its local binding", () => {
    const hits = analyzeSource(
      "f.ts",
      `import { exec as run } from "node:child_process";\nrun("ls");\n`,
    );
    expect(hits.map((h) => h.cls)).toEqual(["child-process"]);
  });

  test("RED: a namespace import's member call is a hit", () => {
    const hits = analyzeSource(
      "f.ts",
      `import * as cp from "node:child_process";\ncp.execSync("ls");\n`,
    );
    expect(hits.map((h) => h.cls)).toEqual(["child-process"]);
  });

  test("GREEN: a string literal mentioning exec( is not a call", () => {
    const hits = analyzeSource("f.ts", `const warning = "never call exec(cmd) directly";\n`);
    expect(hits).toEqual([]);
  });

  test("GREEN: a comment mentioning exec( is not a call", () => {
    const hits = analyzeSource("f.ts", `// TODO: consider exec("ls") here someday\nconst x = 1;\n`);
    expect(hits).toEqual([]);
  });

  test("GREEN: RegExp.prototype.exec is unrelated and never tracked", () => {
    const hits = analyzeSource("f.ts", `const m = /abc/.exec("abcdef");\n`);
    expect(hits).toEqual([]);
  });

  test("GREEN: exec called without importing it from child_process is not a hit", () => {
    const hits = analyzeSource("f.ts", `function exec(x: string) { return x; }\nexec("ls");\n`);
    expect(hits).toEqual([]);
  });
});

describe("analyzeSource — bun-spawn class", () => {
  test("RED: Bun.spawn(...) is a hit", () => {
    const hits = analyzeSource("f.ts", `Bun.spawn(["ls"]);\n`);
    expect(hits.map((h) => h.cls)).toEqual(["bun-spawn"]);
  });

  test("RED: Bun.spawnSync(...) is a hit", () => {
    const hits = analyzeSource("f.ts", `Bun.spawnSync(["ls"]);\n`);
    expect(hits.map((h) => h.cls)).toEqual(["bun-spawn"]);
  });

  test("RED: a Bun.$ tagged template is a hit", () => {
    const hits = analyzeSource("f.ts", "Bun.$`ls -la`;\n");
    expect(hits.map((h) => h.cls)).toEqual(["bun-spawn"]);
  });

  test("GREEN: a string literal mentioning Bun.spawn is not a call", () => {
    const hits = analyzeSource("f.ts", `const s = "call Bun.spawn(cmd) to run it";\n`);
    expect(hits).toEqual([]);
  });

  test("GREEN: a differently-named .spawn on another object is not Bun", () => {
    const hits = analyzeSource("f.ts", `myProcessManager.spawn(["ls"]);\n`);
    expect(hits).toEqual([]);
  });
});

describe("analyzeSource — raw-sql-unsafe class", () => {
  test("RED: .$queryRawUnsafe( is a hit", () => {
    const hits = analyzeSource("f.ts", `await prisma.$queryRawUnsafe(sql, ...params);\n`);
    expect(hits.map((h) => h.cls)).toEqual(["raw-sql-unsafe"]);
  });

  test("RED: .$executeRawUnsafe( is a hit", () => {
    const hits = analyzeSource("f.ts", `await prisma.$executeRawUnsafe(sql);\n`);
    expect(hits.map((h) => h.cls)).toEqual(["raw-sql-unsafe"]);
  });

  test("GREEN: the parameterized tagged-template $queryRaw is deliberately not counted", () => {
    const hits = analyzeSource("f.ts", "await prisma.$queryRaw`SELECT 1`;\n");
    expect(hits).toEqual([]);
  });

  test("GREEN: a comment mentioning $queryRawUnsafe is not a call", () => {
    const hits = analyzeSource("f.ts", `// avoid $queryRawUnsafe here\nconst x = 1;\n`);
    expect(hits).toEqual([]);
  });
});

describe("analyzeSource — dynamic-eval class", () => {
  test("RED: a bare eval(...) call is a hit", () => {
    const hits = analyzeSource("f.ts", `eval("2+2");\n`);
    expect(hits.map((h) => h.cls)).toEqual(["dynamic-eval"]);
  });

  test("RED: new Function(...) is a hit", () => {
    const hits = analyzeSource("f.ts", `const f = new Function("a", "return a;");\n`);
    expect(hits.map((h) => h.cls)).toEqual(["dynamic-eval"]);
  });

  test("GREEN: a member call named eval on another object is unrelated", () => {
    const hits = analyzeSource("f.ts", `const r = someParser.eval("2+2");\n`);
    expect(hits).toEqual([]);
  });

  test("GREEN: a string literal mentioning eval( is not a call", () => {
    const hits = analyzeSource("f.ts", `const warning = "never eval(userInput)";\n`);
    expect(hits).toEqual([]);
  });
});

describe("analyzeSource — population sanity", () => {
  test("a file with all four shapes reports all four classes with a non-zero population", () => {
    const src = [
      `import { exec } from "child_process";`,
      `exec("ls");`,
      `Bun.spawn(["ls"]);`,
      `await prisma.$queryRawUnsafe(sql);`,
      `eval("1");`,
    ].join("\n");
    const hits = analyzeSource("f.ts", src);
    expect(hits.length).toBeGreaterThan(0);
    expect(new Set(hits.map((h) => h.cls))).toEqual(new Set(CLASSES));
  });
});

// ── parseAllowlist ────────────────────────────────────────────────────────

describe("parseAllowlist", () => {
  test("parses a well-formed file, ignoring comments and blank lines", () => {
    const text = [
      "# a comment",
      "",
      "child-process|a/b.ts|2|reviewed",
      "raw-sql-unsafe|c/d.ts|1|reviewed too",
    ].join("\n");
    const entries = parseAllowlist(text);
    expect(entries).toEqual([
      { cls: "child-process", file: "a/b.ts", expected: 2, justification: "reviewed", lineNo: 3 },
      { cls: "raw-sql-unsafe", file: "c/d.ts", expected: 1, justification: "reviewed too", lineNo: 4 },
    ]);
  });

  test("throws naming the line on a malformed field count", () => {
    expect(() => parseAllowlist("child-process|a/b.ts|2\n")).toThrow(/line 1|:1:/);
  });

  test("throws on an unknown class", () => {
    expect(() => parseAllowlist("not-a-class|a/b.ts|1|x\n")).toThrow(/unknown class/);
  });

  test("throws on a non-integer expected-count", () => {
    expect(() => parseAllowlist("child-process|a/b.ts|two|x\n")).toThrow(/non-negative integer/);
  });
});

// ── check() — violation logic over a real throwaway git repo ────────────────

/** A throwaway git repo, so `git ls-files` is real rather than stubbed. */
function repo(files: Record<string, string>): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "security-allowlist-"));
  const git = (...args: string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  git("add", "-A");
  git("commit", "-qm", "fixture");
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const EXEC_FILE = "packages/core/src/x.ts";
const execSite = `import { exec } from "child_process";\nexec("ls");\n`;

describe("check — violation logic", () => {
  test("a clean tree with a matching allowlist entry passes with zero violations", () => {
    const { root, cleanup } = repo({ [EXEC_FILE]: execSite });
    try {
      const result = check(root, `child-process|${EXEC_FILE}|1|reviewed\n`);
      expect(result.violations).toEqual([]);
      expect(result.filesScanned).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  test("an unreviewed new site (no allowlist entry at all) fails", () => {
    const { root, cleanup } = repo({ [EXEC_FILE]: execSite });
    try {
      const result = check(root, "");
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]!.kind).toBe("unreviewed");
      expect(result.violations[0]!.file).toBe(EXEC_FILE);
    } finally {
      cleanup();
    }
  });

  test("an unreviewed site beyond the allowlisted count fails", () => {
    const twoSites = `import { exec, execSync } from "child_process";\nexec("a");\nexecSync("b");\n`;
    const { root, cleanup } = repo({ [EXEC_FILE]: twoSites });
    try {
      const result = check(root, `child-process|${EXEC_FILE}|1|reviewed\n`);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]!.kind).toBe("unreviewed");
      expect(result.violations[0]!.actual).toBe(2);
      expect(result.violations[0]!.expected).toBe(1);
    } finally {
      cleanup();
    }
  });

  test("a stale entry (allowlist over-counts what remains) fails", () => {
    const { root, cleanup } = repo({ [EXEC_FILE]: execSite });
    try {
      const result = check(root, `child-process|${EXEC_FILE}|2|reviewed\n`);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]!.kind).toBe("stale");
      expect(result.violations[0]!.actual).toBe(1);
      expect(result.violations[0]!.expected).toBe(2);
    } finally {
      cleanup();
    }
  });

  test("an allowlist entry naming a file outside the tracked population fails", () => {
    const { root, cleanup } = repo({ [EXEC_FILE]: execSite });
    try {
      const result = check(
        root,
        `child-process|${EXEC_FILE}|1|reviewed\nchild-process|packages/core/src/ghost.ts|1|stale file\n`,
      );
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]!.kind).toBe("missing-file");
    } finally {
      cleanup();
    }
  });

  test("dynamic-eval always fails, even with a matching allowlist entry (no entries permitted)", () => {
    const evalFile = "packages/core/src/y.ts";
    const { root, cleanup } = repo({ [evalFile]: `eval("1+1");\n` });
    try {
      const result = check(root, `dynamic-eval|${evalFile}|1|attempted rubber stamp\n`);
      expect(result.violations.some((v) => v.kind === "dynamic-eval")).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("an untracked file is invisible — every reading is taken after git add", () => {
    const { root, cleanup } = repo({ [EXEC_FILE]: execSite });
    try {
      mkdirSync(join(root, "packages/core/src"), { recursive: true });
      writeFileSync(join(root, "packages/core/src/untracked.ts"), execSite);
      const result = check(root, `child-process|${EXEC_FILE}|1|reviewed\n`);
      expect(result.violations).toEqual([]);
    } finally {
      cleanup();
    }
  });

  test("scripts/ is excluded from the population entirely", () => {
    const { root, cleanup } = repo({
      [EXEC_FILE]: execSite,
      "scripts/dev-tool.ts": execSite,
    });
    try {
      const result = check(root, `child-process|${EXEC_FILE}|1|reviewed\n`);
      expect(result.violations).toEqual([]);
      expect(result.filesScanned).toBe(1);
    } finally {
      cleanup();
    }
  });

  test("a test file and a generated file are excluded (population filter)", () => {
    const { root, cleanup } = repo({
      [EXEC_FILE]: execSite,
      "packages/core/src/__tests__/x.test.ts": execSite,
      "packages/core/src/generated/x.ts": execSite,
    });
    try {
      const result = check(root, `child-process|${EXEC_FILE}|1|reviewed\n`);
      expect(result.violations).toEqual([]);
      expect(result.filesScanned).toBe(1);
    } finally {
      cleanup();
    }
  });

  test("a file that fails to parse fails loudly, naming the file", () => {
    const { root, cleanup } = repo({ [EXEC_FILE]: "class {{{ this is not valid typescript\n" });
    try {
      expect(() => check(root, "")).toThrow(new RegExp(EXEC_FILE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    } finally {
      cleanup();
    }
  });
});

describe("trackedPopulationFiles", () => {
  test("a nested subdirectory is included — a prefix, not a git pathspec", () => {
    const nested = "packages/core/src/deep/nested/x.ts";
    const { root, cleanup } = repo({ [EXEC_FILE]: execSite, [nested]: execSite });
    try {
      expect(trackedPopulationFiles(root).sort()).toEqual([EXEC_FILE, nested].sort());
    } finally {
      cleanup();
    }
  });
});

describe("report", () => {
  test("prints the population header even on a clean (empty-hit) result", () => {
    const { root, cleanup } = repo({ "packages/core/src/clean.ts": `const x = 1;\n` });
    try {
      const result = check(root, "");
      const lines: string[] = [];
      const orig = console.log;
      console.log = (...args: unknown[]) => lines.push(args.join(" "));
      try {
        const ok = report(result);
        expect(ok).toBe(true);
      } finally {
        console.log = orig;
      }
      expect(lines.some((l) => l.includes("scanned") && l.includes("file"))).toBe(true);
      expect(lines.some((l) => l.includes("PASS"))).toBe(true);
    } finally {
      cleanup();
    }
  });
});

// ── live-tree smoke test ─────────────────────────────────────────────────────

describe("live tree", () => {
  test("the real repo passes with zero violations through the shipped allowlist", () => {
    const result = check(REPO_ROOT);
    if (result.violations.length > 0) {
      // eslint-disable-next-line no-console
      console.error(result.violations.map((v) => v.detail).join("\n"));
    }
    expect(result.violations).toEqual([]);
    expect(result.filesScanned).toBeGreaterThan(0);
  });

  test("scripts/security-allowlist.txt on disk parses and matches ALLOWLIST_PATH", () => {
    expect(ALLOWLIST_PATH.endsWith("security-allowlist.txt")).toBe(true);
    const text = readFileSync(ALLOWLIST_PATH, "utf8");
    const entries = parseAllowlist(text);
    expect(entries.length).toBeGreaterThan(0);
  });
});
