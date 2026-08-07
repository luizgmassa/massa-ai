/**
 * runtime.ts extra coverage — covers getRuntimeSummary (all branches),
 * buildCommand error paths (every unavailable language), getVersion edge
 * cases, commandExists real usage, and runnableExists rejection paths.
 *
 * Platform-gated tests (Windows getVersion, Windows shell escape) are
 * skipped on non-target platforms.
 */
import { describe, test, expect } from "bun:test";
import {
  detectRuntimes,
  getRuntimeSummary,
  getAvailableLanguages,
  buildCommand,
  commandExists,
  runnableExists,
  getVersion,
  type RuntimeMap,
  type DetectDeps,
} from "../services/executor/runtime.js";

const isWin = process.platform === "win32";

// A fully-populated runtime map for summary tests.
const FULL_RUNTIMES: RuntimeMap = {
  javascript: "node",
  typescript: "tsx",
  python: "python3",
  shell: "bash",
  ruby: "ruby",
  go: "go",
  rust: "rustc",
  php: "php",
  perl: "perl",
  r: "Rscript",
};

const EMPTY_RUNTIMES: RuntimeMap = {
  javascript: null,
  typescript: null,
  python: null,
  shell: "sh",
  ruby: null,
  go: null,
  rust: null,
  php: null,
  perl: null,
  r: null,
};

// The unit under test is the summary's formatting, so version probing is
// injected: without the seam every present runtime costs a live `--version`
// subprocess (10 with FULL_RUNTIMES), which breaches the 5 s budget on a
// loaded CI host — bun then kills the in-flight probe as a "dangling process".
const SUMMARY_DEPS: DetectDeps = { getVersion: () => "vX.test" };

describe("getRuntimeSummary", () => {
  test("includes all runtimes when present", () => {
    const summary = getRuntimeSummary(FULL_RUNTIMES, SUMMARY_DEPS);
    expect(summary).toContain("JavaScript:");
    expect(summary).toContain("node");
    expect(summary).toContain("TypeScript:");
    expect(summary).toContain("tsx");
    expect(summary).toContain("Python:");
    expect(summary).toContain("python3");
    expect(summary).toContain("Shell:");
    expect(summary).toContain("bash");
    expect(summary).toContain("Ruby:");
    expect(summary).toContain("Go:");
    expect(summary).toContain("Rust:");
    expect(summary).toContain("PHP:");
    expect(summary).toContain("Perl:");
    expect(summary).toContain("R:");
    // The injected seam is actually threaded through to getVersion.
    expect(summary).toContain("(vX.test)");
  });

  test("shows 'not available' for missing runtimes", () => {
    const summary = getRuntimeSummary(EMPTY_RUNTIMES, SUMMARY_DEPS);
    expect(summary).toContain("JavaScript:");
    expect(summary).toContain("not available");
    expect(summary).toContain("TypeScript:");
    expect(summary).toContain("Shell:");
    expect(summary).toContain("sh");
    // ruby/go/rust/php/perl/r are null → not shown (conditional lines).
    expect(summary).not.toContain("Ruby:");
  });
});

describe("getAvailableLanguages", () => {
  test("returns shell + all available languages", () => {
    const langs = getAvailableLanguages(FULL_RUNTIMES);
    expect(langs).toContain("shell");
    expect(langs).toContain("javascript");
    expect(langs).toContain("typescript");
    expect(langs).toContain("python");
    expect(langs).toContain("ruby");
    expect(langs).toContain("go");
    expect(langs).toContain("rust");
    expect(langs).toContain("php");
    expect(langs).toContain("perl");
    expect(langs).toContain("r");
  });

  test("returns only shell when nothing else is available", () => {
    const langs = getAvailableLanguages(EMPTY_RUNTIMES);
    expect(langs).toEqual(["shell"]);
  });
});

describe("buildCommand — error paths", () => {
  test("javascript unavailable throws clear error", () => {
    expect(() => buildCommand(EMPTY_RUNTIMES, "javascript", "/tmp/x.js")).toThrow(
      /No JavaScript runtime available/,
    );
  });

  test("typescript unavailable throws clear error", () => {
    expect(() => buildCommand(EMPTY_RUNTIMES, "typescript", "/tmp/x.ts")).toThrow(
      /No TypeScript runtime available/,
    );
  });

  test("python unavailable throws clear error", () => {
    expect(() => buildCommand(EMPTY_RUNTIMES, "python", "/tmp/x.py")).toThrow(
      /No Python runtime available/,
    );
  });

  test("ruby unavailable throws clear error", () => {
    expect(() => buildCommand(EMPTY_RUNTIMES, "ruby", "/tmp/x.rb")).toThrow(
      /Ruby not available/,
    );
  });

  test("go unavailable throws clear error", () => {
    expect(() => buildCommand(EMPTY_RUNTIMES, "go", "/tmp/x.go")).toThrow(
      /Go not available/,
    );
  });

  test("rust unavailable throws clear error", () => {
    expect(() => buildCommand(EMPTY_RUNTIMES, "rust", "/tmp/x.rs")).toThrow(
      /Rust not available/,
    );
  });

  test("php unavailable throws clear error", () => {
    expect(() => buildCommand(EMPTY_RUNTIMES, "php", "/tmp/x.php")).toThrow(
      /PHP not available/,
    );
  });

  test("perl unavailable throws clear error", () => {
    expect(() => buildCommand(EMPTY_RUNTIMES, "perl", "/tmp/x.pl")).toThrow(
      /Perl not available/,
    );
  });

  test("r unavailable throws clear error", () => {
    expect(() => buildCommand(EMPTY_RUNTIMES, "r", "/tmp/x.R")).toThrow(
      /R not available/,
    );
  });
});

describe("buildCommand — success paths", () => {
  test("javascript with node → [node, filePath]", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, javascript: "node" }, "javascript", "/tmp/x.js");
    expect(cmd).toEqual(["node", "/tmp/x.js"]);
  });

  test("javascript with bun → [bun, run, filePath]", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, javascript: "bun" }, "javascript", "/tmp/x.js");
    expect(cmd).toEqual(["bun", "run", "/tmp/x.js"]);
  });

  test("typescript with tsx → [tsx, filePath]", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, typescript: "tsx" }, "typescript", "/tmp/x.ts");
    expect(cmd).toEqual(["tsx", "/tmp/x.ts"]);
  });

  test("typescript with bun → [bun, run, filePath]", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, typescript: "bun" }, "typescript", "/tmp/x.ts");
    expect(cmd).toEqual(["bun", "run", "/tmp/x.ts"]);
  });

  test("python → [python3, filePath]", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, python: "python3" }, "python", "/tmp/x.py");
    expect(cmd).toEqual(["python3", "/tmp/x.py"]);
  });

  test("ruby → [ruby, filePath]", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, ruby: "ruby" }, "ruby", "/tmp/x.rb");
    expect(cmd).toEqual(["ruby", "/tmp/x.rb"]);
  });

  test("go → [go, run, filePath]", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, go: "go" }, "go", "/tmp/x.go");
    expect(cmd).toEqual(["go", "run", "/tmp/x.go"]);
  });

  test("rust → [__rust_compile_run__, filePath]", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, rust: "rustc" }, "rust", "/tmp/x.rs");
    expect(cmd).toEqual(["__rust_compile_run__", "/tmp/x.rs"]);
  });

  test("php → [php, filePath]", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, php: "php" }, "php", "/tmp/x.php");
    expect(cmd).toEqual(["php", "/tmp/x.php"]);
  });

  test("perl → [perl, filePath]", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, perl: "perl" }, "perl", "/tmp/x.pl");
    expect(cmd).toEqual(["perl", "/tmp/x.pl"]);
  });

  test("r → [Rscript, filePath]", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, r: "Rscript" }, "r", "/tmp/x.R");
    expect(cmd).toEqual(["Rscript", "/tmp/x.R"]);
  });
});

describe("buildCommand — shell (platform-gated)", () => {
  test.skipIf(isWin)("POSIX: shell → [sh, filePath]", () => {
    const cmd = buildCommand(EMPTY_RUNTIMES, "shell", "/tmp/x.sh");
    expect(cmd).toEqual(["sh", "/tmp/x.sh"]);
  });

  test.skipIf(!isWin)("Windows: shell → [bash, -c, source '...']", () => {
    const cmd = buildCommand({ ...EMPTY_RUNTIMES, shell: "cmd.exe" }, "shell", "C:\\tmp\\x.sh");
    expect(cmd[0]).toBe("cmd.exe");
    expect(cmd[1]).toBe("-c");
    expect(cmd[2]).toContain("source");
  });
});

describe("commandExists (real)", () => {
  test("returns true for a binary that exists (sh)", () => {
    expect(commandExists("sh")).toBe(true);
  });

  test("returns false for a binary that does not exist", () => {
    expect(commandExists("nonexistent-binary-xyz-123")).toBe(false);
  });
});

describe("runnableExists", () => {
  test("returns true for sh (exists + --version works)", () => {
    expect(runnableExists("sh")).toBe(true);
  });

  test("returns false when commandExists is false", () => {
    expect(runnableExists("nonexistent-binary-xyz-123")).toBe(false);
  });

  test("returns false when getVersion throws (injected)", () => {
    const deps: DetectDeps = {
      commandExists: () => true,
      getVersion: () => {
        throw new Error("version check failed");
      },
    };
    expect(runnableExists("fake", deps)).toBe(false);
  });
});

describe("getVersion", () => {
  test("returns a version string for sh", () => {
    const v = getVersion("sh", ["--version"]);
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });

  test("returns 'unknown' for a binary that doesn't exist", () => {
    expect(getVersion("nonexistent-binary-xyz-123")).toBe("unknown");
  });

  test("uses injected getVersion when provided", () => {
    const deps: DetectDeps = {
      getVersion: () => "injected-version",
    };
    expect(getVersion("anything", ["--version"], deps)).toBe("injected-version");
  });

  test.skipIf(isWin)("POSIX: returns first line of version output", () => {
    // sh --version on POSIX returns something; we just check it's the first line.
    const v = getVersion("sh", ["--version"]);
    expect(v).not.toContain("\n");
  });
});

describe("detectRuntimes — real host", () => {
  test("shell is always available (fallback to sh)", () => {
    const r = detectRuntimes();
    expect(r.shell).toBeTruthy();
  });

  test("injected deps control detection", () => {
    const deps: DetectDeps = {
      commandExists: (cmd) => cmd === "bun" || cmd === "bash",
      getVersion: () => "1.0.0",
    };
    const r = detectRuntimes(deps);
    expect(r.javascript).toBe("bun");
    expect(r.typescript).toBe("bun");
    expect(r.shell).toBe("bash");
  });

  test("python probe falls through to python when python3 not found", () => {
    const deps: DetectDeps = {
      commandExists: (cmd) => cmd === "python",
      getVersion: () => "3.10",
    };
    const r = detectRuntimes(deps);
    // python3 not found → falls to python.
    expect(r.python).toBe("python");
  });
});