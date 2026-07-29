import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { GUARDS, checkGuards, findBlocks, testFiles } from "../check-characterization.ts";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const CLI = join(REPO_ROOT, "scripts", "check-characterization.ts");
const CHARACTERIZATION = "packages/core/src/__tests__/contextual-search-rlm.characterization.test.ts";

const guardFor = (symbol: string) => GUARDS.filter((g) => g.symbol === symbol);

describe("the real repository", () => {
  const results = checkGuards(REPO_ROOT);

  test("all three behaviors pass their floors", () => {
    expect(results.flatMap((r) => r.failures)).toEqual([]);
  });

  test("each has exactly one behavioral block, and it is not a delegation test", () => {
    for (const r of results) {
      expect(r.behavioral).toHaveLength(1);
      expect(r.behavioral[0]!.delegation).toBe(false);
    }
  });

  // The floors are the measured values, so this is what makes "no test
  // weakened" mean something narrower than "the suite is still green".
  test("the floors are the observed counts, not padding", () => {
    const by = (s: string) => results.find((r) => r.symbol === s)!.behavioral[0]!;
    expect(by("extractPreview").assertions).toBe(4);
    expect(by("calculateAvgScore").assertions).toBe(4);
    expect(by("_indexProjectInternal").assertions).toBe(8);
  });

  // extractPreview and calculateAvgScore are each also named by a describe
  // block in the coverage suite. Those mock the impl and assert delegation, so
  // they survive an implementation whose body is gone — which is the whole
  // reason the behavioral block is a single point of truth worth guarding.
  test("the delegation blocks are recognised as delegation, not as coverage", () => {
    const preview = results.find((r) => r.symbol === "extractPreview")!;
    expect(preview.delegation).toHaveLength(1);
    expect(preview.delegation[0]!.file).toContain("contextual-search-rlm-coverage");
  });

  // Scope matters: this very file names all three symbols. If the enumeration
  // ever widened past packages/core's suite it would find them here and report
  // duplicate behavioral blocks — the T2 defect, where an instrument counted
  // itself.
  test("only packages/core's own test suite is enumerated", () => {
    const files = testFiles(REPO_ROOT);
    expect(files.every((f) => f.startsWith("packages/core/src/__tests__/"))).toBe(true);
    expect(files.some((f) => f.startsWith("scripts/"))).toBe(false);
  });
});

/**
 * The sensor. tasks.md requires this observed red before the guard is trusted,
 * and running it as a test keeps it observed red rather than red once.
 *
 * The mutation is the real defect: the block keeps its name, its `describe`,
 * and its position, and loses only its assertions. That is what a weakening
 * looks like in a diff that is trying not to look like one.
 */
describe("the sensor", () => {
  let root: string;
  const scratchFile = CHARACTERIZATION;
  const real = readFileSync(join(REPO_ROOT, CHARACTERIZATION), "utf8");

  const writeScratch = (source: string): string => {
    const p = join(root, scratchFile);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, source);
    return p;
  };

  /** Replace a describe block's body, keeping its name and its shape. */
  const hollow = (source: string, symbol: string): string => {
    const block = findBlocks(scratchFile, source, symbol)[0]!;
    const header = block.text.split("\n")[0]!;
    const indent = header.match(/^\s*/)![0];
    return source.replace(
      block.text,
      [header, `${indent}  test("still here", () => {`, `${indent}    expect(true).toBe(true);`, `${indent}  });`, `${indent}});`].join("\n"),
    );
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "characterization-"));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("the unmutated copy passes — the sensor is not red on everything", () => {
    writeScratch(real);
    const [r] = checkGuards(root, guardFor("extractPreview"), [scratchFile]);
    expect(r!.failures).toEqual([]);
    expect(r!.behavioral[0]!.assertions).toBe(4);
  });

  test("a hollowed block keeps its name and fails the floor", () => {
    writeScratch(hollow(real, "extractPreview"));
    const [r] = checkGuards(root, guardFor("extractPreview"), [scratchFile]);
    // The name survives the mutation. That is the point: name presence would
    // have passed here.
    expect(r!.behavioral).toHaveLength(1);
    expect(r!.behavioral[0]!.name).toContain("extractPreview");
    // Both floors trip: the hollowed body is one test carrying one assertion,
    // against 4 and 4. Either alone would have caught it; reporting both says
    // which dimension collapsed.
    expect(r!.failures).toHaveLength(2);
    expect(r!.failures[0]).toContain("1 non-trivial assertions");
    expect(r!.failures[0]).toContain("floor is 4");
    expect(r!.failures[1]).toContain("1 test cases");
  });

  test("removing a single assertion is enough to trip it", () => {
    const block = findBlocks(scratchFile, real, "calculateAvgScore")[0]!;
    const weakened = block.text.replace("expect(Number.isNaN(avg)).toBe(false);", "");
    writeScratch(real.replace(block.text, weakened));
    const [r] = checkGuards(root, guardFor("calculateAvgScore"), [scratchFile]);
    expect(r!.failures[0]).toContain("3 non-trivial assertions");
  });

  test("deleting the block entirely is a distinct, named failure", () => {
    const block = findBlocks(scratchFile, real, "extractPreview")[0]!;
    writeScratch(real.replace(block.text, ""));
    const [r] = checkGuards(root, guardFor("extractPreview"), [scratchFile]);
    expect(r!.failures[0]).toContain("no behavioral describe block found");
  });

  // Splitting the block in two would satisfy any per-block floor while halving
  // each half. "Exactly one" is part of the guarantee, not decoration.
  test("duplicating the block breaks the single-point-of-truth claim", () => {
    const block = findBlocks(scratchFile, real, "extractPreview")[0]!;
    writeScratch(real.replace(block.text, `${block.text}\n\n${block.text}`));
    const [r] = checkGuards(root, guardFor("extractPreview"), [scratchFile]);
    expect(r!.failures[0]).toContain("2 behavioral blocks");
  });

  // A weakening that swaps real assertions for mock-delegation ones would
  // otherwise pass the floor while testing nothing about behavior.
  test("converting the block to a delegation test removes it from the behavioral set", () => {
    const block = findBlocks(scratchFile, real, "extractPreview")[0]!;
    writeScratch(real.replace(block.text, block.text.replace(/\.toBe\(/g, ".toHaveBeenCalledWith(")));
    const [r] = checkGuards(root, guardFor("extractPreview"), [scratchFile]);
    expect(r!.failures[0]).toContain("no behavioral describe block found");
  });
});

describe("the CLI contract", () => {
  test("a clean tree exits 0", () => {
    const r = spawnSync("bun", [CLI], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("3 guarded behaviors");
  });

  test("--root without a value is a usage error", () => {
    const r = spawnSync("bun", [CLI, "--root"], { encoding: "utf8" });
    expect(r.status).toBe(2);
  });

  test("--json carries the same verdict", () => {
    const r = spawnSync("bun", [CLI, "--json"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as Array<{ symbol: string; failures: string[] }>;
    expect(parsed.map((p) => p.symbol)).toEqual(["extractPreview", "calculateAvgScore", "_indexProjectInternal"]);
    expect(parsed.flatMap((p) => p.failures)).toEqual([]);
  });
});
