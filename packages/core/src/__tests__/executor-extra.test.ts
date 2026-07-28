/**
 * Executor extra coverage tests — covers the getter paths, the error handler
 * (ENOENT on spawn), and the background-mode timeout path. Rust compile+run
 * is platform-gated (requires rustc); the error handler + getters are
 * non-platform-gated.
 */
process.env.MASSA_AI_EXECUTOR_SANDBOX = "none";

import { describe, test, expect } from "bun:test";
import { PolyglotExecutor, detectRuntimes } from "../services/executor/index.js";

const RUNTIMES = detectRuntimes();
const HAS_NODE = RUNTIMES.javascript === "node" || RUNTIMES.javascript === "bun";
const HAS_RUST = !!RUNTIMES.rust;

describe("PolyglotExecutor getters", () => {
  test("runtimes getter returns a copy (not the internal map)", () => {
    const exec = new PolyglotExecutor({ projectRoot: "/tmp" });
    const r1 = exec.runtimes;
    const r2 = exec.runtimes;
    expect(r1).not.toBe(r2);
    expect(r1).toEqual(r2);
  });

  test("projectRoot getter returns the configured string", () => {
    const exec = new PolyglotExecutor({ projectRoot: "/some/path" });
    expect(exec.projectRoot).toBe("/some/path");
  });

  test("projectRoot getter calls a function resolver", () => {
    const exec = new PolyglotExecutor({ projectRoot: () => "/dynamic/path" });
    expect(exec.projectRoot).toBe("/dynamic/path");
  });

  test("projectRoot defaults to process.cwd() when not configured", () => {
    const exec = new PolyglotExecutor();
    expect(exec.projectRoot).toBe(process.cwd());
  });
});

describe("PolyglotExecutor error handling", () => {
  test("spawn ENOENT: returns error result with stderr message", async () => {
    new PolyglotExecutor({ projectRoot: "/tmp" });
    // Use a language that is available but craft a code that spawns a
    // non-existent binary via shell. Actually the executor spawns the runtime
    // itself, so to get ENOENT we need a runtime that doesn't exist.
    // Instead, use runtimes override with a fake runtime.
    const exec2 = new PolyglotExecutor({
      projectRoot: "/tmp",
      runtimes: {
        javascript: "nonexistent-runtime-binary-xyz" as any,
        typescript: null,
        python: null,
        shell: "sh",
        ruby: null,
        go: null,
        rust: null,
        php: null,
        perl: null,
        r: null,
      },
    });
    const result = await exec2.execute({
      language: "javascript",
      code: `console.log("hi")`,
      timeout: 5_000,
    });
    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain("nonexistent-runtime-binary-xyz");
    expect(result.timedOut).toBe(false);
  });
});

describe("PolyglotExecutor background timeout", () => {
  (HAS_NODE ? test : test.skip)("background=true: timeout detaches process and returns partial output", async () => {
    const exec = new PolyglotExecutor({ projectRoot: "/tmp" });
    const result = await exec.execute({
      language: "javascript",
      code: `console.log("started"); setInterval(() => {}, 1);`,
      timeout: 200,
      background: true,
    });
    expect(result.timedOut).toBe(true);
    expect(result.backgrounded).toBe(true);
    expect(result.exitCode).toBe(0); // detached returns 0
    expect(result.stdout).toContain("started");
    // Cleanup the backgrounded process.
    exec.cleanupBackgrounded();
  });
});

describe("PolyglotExecutor cleanupBackgrounded", () => {
  test("clears the backgrounded set without throwing", () => {
    const exec = new PolyglotExecutor({ projectRoot: "/tmp" });
    // No backgrounded processes — should be a no-op.
    exec.cleanupBackgrounded();
    // After cleanup, calling again is still safe.
    exec.cleanupBackgrounded();
  });
});

// Rust compile+run — platform-gated (requires rustc).
describe.skipIf(!HAS_RUST)("PolyglotExecutor Rust compile+run", () => {
  test("compiles and runs a simple Rust program", async () => {
    const exec = new PolyglotExecutor({ projectRoot: "/tmp" });
    const result = await exec.execute({
      language: "rust",
      // The `execute` path writes the code verbatim to script.rs; it does not
      // wrap in `fn main()` (unlike `execute_file`). Provide a complete Rust
      // program so rustc produces a runnable binary.
      code: `fn main() { println!("rust-ok"); }`,
      timeout: 30_000,
    });
    expect(result.stdout.trim()).toBe("rust-ok");
    expect(result.exitCode).toBe(0);
    // bunfig.toml sets a global 5s per-test timeout. A cold rustc compile takes
    // ~6s on CI, and the executor is handed a 30s budget above, so the test
    // budget has to clear both.
  }, 60_000);

  test("compile failure returns stderr with 'Compilation failed'", async () => {
    const exec = new PolyglotExecutor({ projectRoot: "/tmp" });
    const result = await exec.execute({
      language: "rust",
      code: `this is not valid rust`,
      timeout: 30_000,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Compilation failed");
  }, 60_000);
});

// Rust path with injected fake runtimes (covers compile-failure + finally
// cleanup even when rustc is not installed).
describe("PolyglotExecutor Rust path (injected runtimes, no rustc)", () => {
  test("injects rust=rustc → compile fails with 'Compilation failed' and cleanup runs", async () => {
    const exec = new PolyglotExecutor({
      projectRoot: "/tmp",
      runtimes: {
        javascript: null,
        typescript: null,
        python: null,
        shell: "sh",
        ruby: null,
        go: null,
        rust: "rustc", // pretend rustc is available so buildCommand returns __rust_compile_run__
        php: null,
        perl: null,
        r: null,
      },
    });
    const result = await exec.execute({
      language: "rust",
      code: `this is not valid rust`,
      timeout: 10_000,
    });
    // rustc is not installed → execFileSync throws → "Compilation failed".
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Compilation failed");
  });
});