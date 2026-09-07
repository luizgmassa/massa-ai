/**
 * `generate:artifacts` must forward the caller's argv to EVERY generator.
 *
 * `CONTRIBUTING.md` Step 3: a harness component that delegates to other
 * commands "MUST NOT silently drop arguments the caller passed", and the
 * acceptance gate is "a test verifies that arguments passed by the caller reach
 * the underlying command". This file is that gate.
 *
 * The defect it closes: the script was `bun a.ts && bun b.ts`, and a package
 * script appends the caller's arguments to the end of the whole string, so
 * `bun run generate:artifacts --check` gave `--check` only to `b.ts` while
 * `a.ts` ran in write mode. A drift gate that regenerates half of its own
 * subject cannot fail on that half.
 *
 * Three levels, because each is blind to the others:
 *  - the wrapper forwards argv and aggregates exit codes (injected fakes);
 *  - the package script is a single command, not an `&&` chain (the call site —
 *    restoring the chain re-creates the defect with the wrapper still present);
 *  - a real `--check` run reaches both generators (end to end).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import path from "path";
import os from "os";
import fs from "fs";

import { main, GENERATORS } from "../generate-artifacts.ts";
import type { ArtifactGenerator } from "../generate-artifacts.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");

function recorder(name: string, code = 0): ArtifactGenerator & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    name,
    calls,
    run: async (argv: string[]) => {
      calls.push([...argv]);
      return code;
    },
  };
}

describe("generate-artifacts argv forwarding (CONTRIBUTING Step 3)", () => {
  test("every generator receives the caller's argv verbatim", async () => {
    const a = recorder("a");
    const b = recorder("b");

    await main(["--check"], [a, b]);

    expect(a.calls).toEqual([["--check"]]);
    expect(b.calls).toEqual([["--check"]]);
  });

  test("multi-argument invocations reach both, in order and unfiltered", async () => {
    const a = recorder("a");
    const b = recorder("b");

    await main(["--profile=work", "--check"], [a, b]);

    expect(a.calls[0]).toEqual(["--profile=work", "--check"]);
    expect(b.calls[0]).toEqual(["--profile=work", "--check"]);
  });

  test("an empty argv reaches both as an empty array, not as undefined", async () => {
    const a = recorder("a");
    const b = recorder("b");

    await main([], [a, b]);

    expect(a.calls).toEqual([[]]);
    expect(b.calls).toEqual([[]]);
  });

  test("a failing generator does not stop the ones after it", async () => {
    // The `&&` form stopped at the first non-zero, so drift in the skill
    // bundles hid any drift in the sub-agent artifacts. One --check must report
    // every drifted subtree.
    const a = recorder("a", 1);
    const b = recorder("b");

    const code = await main(["--check"], [a, b]);

    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
    expect(code).toBe(1);
  });

  test("the first non-zero code is the one returned", async () => {
    const code = await main(["--check"], [recorder("a", 3), recorder("b", 7)]);
    expect(code).toBe(3);
  });

  test("all-clean returns 0", async () => {
    const code = await main(["--check"], [recorder("a"), recorder("b")]);
    expect(code).toBe(0);
  });

  test("a throwing generator propagates rather than being folded into an exit code", async () => {
    // A fault is not a finding. --check's contract is 0 clean / non-zero drift;
    // swallowing an exception into "1" would report a crashed generator as
    // drift and send the reader to diff files that are fine.
    const boom: ArtifactGenerator = {
      name: "boom",
      run: async () => {
        throw new Error("generator crashed");
      },
    };
    await expect(main(["--check"], [boom])).rejects.toThrow("generator crashed");
  });

  test("the default generator set is both real generators, in the historical order", () => {
    expect(GENERATORS.map((g) => g.name)).toEqual([
      "generate-skill-artifacts",
      "generate-subagent-artifacts",
    ]);
  });
});

describe("generate:artifacts call site", () => {
  test("the package script is a single command, so argv cannot land on only the last one", () => {
    // This is the regression that matters. The wrapper can be present and
    // correct while package.json still chains two commands with `&&`, and then
    // `bun run generate:artifacts --check` drops the flag exactly as before.
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    const script: string = pkg.scripts["generate:artifacts"];

    expect(script).toBe("bun scripts/generate-artifacts.ts");
    expect(script).not.toContain("&&");
    expect(script).not.toContain(";");
  });
});

describe("generate:artifacts --check end to end", () => {
  test(
    "a real --check run reaches BOTH generators",
    async () => {
      // Each generator prints its own distinct clean-path line. Before this
      // change the skill-bundle line was absent from a `bun run
      // generate:artifacts --check`, because that half ran in write mode.
      //
      // XDG_CONFIG_HOME is scratched deliberately: the emit path reads the
      // developer's own profile overlay while --check is builtin-only, so a
      // local overlay manufactures drift that CI never sees.
      const scratchConfig = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-ga-cfg-"));
      try {
        const proc = Bun.spawnSync({
          cmd: ["bun", "scripts/generate-artifacts.ts", "--check"],
          cwd: REPO_ROOT,
          env: { ...process.env, XDG_CONFIG_HOME: scratchConfig },
          stdout: "pipe",
          stderr: "pipe",
        });
        const out = proc.stdout.toString() + proc.stderr.toString();

        expect(out).toContain("No drift: generated skill bundles match checked-in files.");
        expect(out).toContain("No drift: generated files match checked-in files.");
        expect(proc.exitCode).toBe(0);
      } finally {
        fs.rmSync(scratchConfig, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
