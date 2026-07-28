/**
 * DEBT-01 — `bun run lint` must be a gate that can actually fail.
 *
 * A lint command that always exits 0 is indistinguishable from no linter at all,
 * which is exactly the state this task replaced (`turbo.json` declared a `lint`
 * task no package implemented, so `bun run lint` printed "No tasks were
 * executed" and exited 0 forever).
 *
 * Proving the gate works needs both directions: a seeded violation must make it
 * exit non-zero, and removing that violation must bring it back to 0. The second
 * half is not ceremony — without it, a command that exits non-zero
 * unconditionally would pass the first assertion.
 *
 * The clean-run assertion doubles as a whole-repo cleanliness check, since the
 * command under test lints the entire tree. If this fails with no probe file
 * present, the repo itself has a lint violation.
 */

import { describe, expect, test, afterEach } from "bun:test";
import fs from "fs";
import path from "path";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");
const PROBE_DIR = path.join(REPO_ROOT, "scripts", "__lint_probe__");
const PROBE_FILE = path.join(PROBE_DIR, "seeded-violation.ts");

/**
 * `no-dupe-keys` is a `correctness` rule that is clean across the current tree,
 * so a failure here is unambiguously the seeded file and not pre-existing debt.
 * It is also not auto-fixable, so `--fix` cannot silently erase the probe.
 */
const SEEDED_VIOLATION = `export const duplicated = { a: 1, a: 2 };\n`;

function runLint(): number {
  const proc = Bun.spawnSync(["bun", "run", "lint"], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return proc.exitCode;
}

function removeProbe(): void {
  fs.rmSync(PROBE_DIR, { recursive: true, force: true });
}

describe("the lint gate can fail", () => {
  // Always runs, including when an assertion throws mid-test. A leaked probe
  // file would break every subsequent lint run in this checkout and in CI.
  afterEach(removeProbe);

  test("a seeded correctness violation makes `bun run lint` exit non-zero", () => {
    fs.mkdirSync(PROBE_DIR, { recursive: true });
    fs.writeFileSync(PROBE_FILE, SEEDED_VIOLATION);

    expect(runLint(), "lint did not fail on a seeded no-dupe-keys violation").not.toBe(0);
  }, 120_000);

  test("with the violation removed, `bun run lint` exits 0", () => {
    removeProbe();
    expect(fs.existsSync(PROBE_FILE)).toBe(false);

    expect(
      runLint(),
      "lint failed on a clean tree — the repo itself has a correctness violation",
    ).toBe(0);
  }, 120_000);
});
