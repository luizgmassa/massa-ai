/**
 * Tests for the coverage gate's merge arithmetic (DEBT-02).
 *
 * These exist because independent verification of PR2 found that
 * `scripts/check-coverage.ts` had no automated test anywhere in the repo: the
 * defect T19 fixed could be reintroduced by a one-character edit and nothing
 * would catch it. The gate itself needs the dedicated test database and takes
 * roughly 15 minutes, so it cannot be a CI check; its arithmetic can, and that
 * is what is pinned here. These run under `bun run test:scripts`, which CI runs.
 *
 * The fixtures below are the shape of the real defect, not invented numbers.
 * Measured on `packages/core/src/services/graph/graph-queries.ts` (440 lines):
 * the group that genuinely instruments it reported 220 executable lines and
 * covered all 220, while seven groups that only imported it transitively each
 * reported 377 and covered 14. The 157-line difference is entirely blank lines,
 * closing braces and JSDoc, and the real set is a strict subset of the
 * degenerate one. Unioning the denominators scored that fully covered file at
 * 220/377 = 58.4%.
 */

import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  EXCLUSIONS,
  LINE_COVERAGE_FLOOR,
  isMeasuredSource,
  linePercent,
  mergeInto,
  parseLcov,
  type FileCoverage,
} from "../check-coverage.ts";

const BASE = "/repo/packages/core";
const SUBJECT = path.resolve(BASE, "src/services/graph/graph-queries.ts");

/** An lcov record listing `lines`, of which `covered` ran. */
function lcov(file: string, lines: number[], covered: ReadonlySet<number>): string {
  const body = lines.map((n) => `DA:${n},${covered.has(n) ? 3 : 0}`).join("\n");
  return `SF:${file}\n${body}\nend_of_record\n`;
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The instrumenting group: 220 real executable lines, all of them executed. */
const DEEP_LINES = range(1, 220);
const DEEP = lcov("src/services/graph/graph-queries.ts", DEEP_LINES, new Set(DEEP_LINES));

/**
 * A transitive importer: Bun marks all 377 physical lines executable and only
 * the 14 module-level ones as run. A strict superset of the real set.
 */
const SHALLOW_LINES = range(1, 377);
const SHALLOW = lcov("src/services/graph/graph-queries.ts", SHALLOW_LINES, new Set(range(1, 14)));

function merge(...fragments: string[]): FileCoverage {
  const merged = new Map<string, FileCoverage>();
  for (const fragment of fragments) mergeInto(merged, parseLcov(fragment, BASE));
  return merged.get(SUBJECT)!;
}

describe("parseLcov", () => {
  test("splits DA records into executable and covered, resolving SF against baseDir", () => {
    const parsed = parseLcov(lcov("src/a.ts", [1, 2, 3], new Set([1, 3])), BASE);
    const record = parsed.get(path.resolve(BASE, "src/a.ts"))!;
    expect(record).toBeDefined();
    expect([...record.executable].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect([...record.covered].sort((a, b) => a - b)).toEqual([1, 3]);
  });

  test("a zero-hit line is executable but not covered", () => {
    const parsed = parseLcov(lcov("src/a.ts", [7], new Set()), BASE);
    const record = parsed.get(path.resolve(BASE, "src/a.ts"))!;
    expect(record.executable.has(7)).toBe(true);
    expect(record.covered.has(7)).toBe(false);
  });
});

describe("mergeInto — the degenerate-record defect", () => {
  test("a fully covered file stays at 100% however many groups merely import it", () => {
    // THE regression test. Before the fix this returned 220/377 = 58.36%, which
    // is what put 130 of 314 files below the floor without any of them having a
    // real coverage gap. Order is varied because taking the minimum has to hold
    // regardless of which record arrives first.
    expect(linePercent(merge(DEEP, SHALLOW))).toBe(100);
    expect(linePercent(merge(SHALLOW, DEEP))).toBe(100);
    expect(linePercent(merge(SHALLOW, SHALLOW, DEEP, SHALLOW))).toBe(100);
  });

  test("the merged denominator is the smallest executable set reported, not the union", () => {
    const merged = merge(SHALLOW, DEEP);
    expect(merged.executable.size).toBe(220);
    // Guards the specific mutation: union would be 377 and score 58.36%.
    expect(merged.executable.size).not.toBe(377);
    expect(Number(linePercent(merge(SHALLOW, DEEP)).toFixed(2))).not.toBe(58.36);
  });

  test("covered lines still union across groups, so split coverage gets full credit", () => {
    // Two test files each exercising a different half of the same subject must
    // add up. Taking the minimum executable set must not also narrow the
    // numerator to a single group.
    const firstHalf = lcov("src/services/graph/graph-queries.ts", DEEP_LINES, new Set(range(1, 110)));
    const secondHalf = lcov("src/services/graph/graph-queries.ts", DEEP_LINES, new Set(range(111, 220)));
    expect(linePercent(merge(firstHalf, secondHalf))).toBe(100);
    expect(linePercent(merge(firstHalf))).toBeCloseTo(50, 5);
  });

  test("a genuine gap is still reported as a gap", () => {
    // The fix must not make everything pass. 110 of 220 executable lines run,
    // and no number of shallow records may launder that into a passing score.
    const half = lcov("src/services/graph/graph-queries.ts", DEEP_LINES, new Set(range(1, 110)));
    expect(linePercent(merge(half, SHALLOW, SHALLOW))).toBeCloseTo(50, 5);
    expect(linePercent(merge(half, SHALLOW))).toBeLessThan(LINE_COVERAGE_FLOOR);
  });

  test("with only shallow records the file scores as poorly as it deserves", () => {
    // Nothing instrumented it, so there is no better measurement to fall back
    // to and the gate must not invent one.
    expect(linePercent(merge(SHALLOW))).toBeCloseTo((14 / 377) * 100, 5);
  });
});

describe("linePercent", () => {
  test("a hit on a line outside the executable set cannot push a file past 100%", () => {
    const coverage: FileCoverage = {
      executable: new Set([1, 2]),
      covered: new Set([1, 2, 900]),
    };
    expect(linePercent(coverage)).toBe(100);
  });

  test("a file with no executable lines is 100%, not a division by zero", () => {
    expect(linePercent({ executable: new Set(), covered: new Set() })).toBe(100);
  });
});

describe("isMeasuredSource", () => {
  test("product source is measured", () => {
    expect(isMeasuredSource("packages/core/src/services/graph/graph-queries.ts")).toBe(true);
    expect(isMeasuredSource("apps/tools-api/src/routes/project.ts")).toBe(true);
  });

  test("tests, build output, generated code, deps and dev tooling are not the subject", () => {
    for (const notSource of [
      "packages/core/src/__tests__/read-file.test.ts",
      "packages/core/src/services/a.spec.ts",
      "packages/core/dist/index.js",
      "packages/core/src/generated/client.ts",
      "node_modules/left-pad/index.js",
      "scripts/check-coverage.ts",
      "benchmarks/llm-judge/run.ts",
      "packages/core/src/services/a.md",
    ]) {
      expect(isMeasuredSource(notSource)).toBe(false);
    }
  });
});

describe("EXCLUSIONS", () => {
  test("every entry carries a non-trivial justification", () => {
    // An exclusion is meant to be a deliberate act that shows up in review. One
    // with an empty or throwaway reason is a threshold nudge wearing a costume.
    for (const entry of EXCLUSIONS) {
      expect(entry.file.length).toBeGreaterThan(0);
      expect(entry.reason.trim().length).toBeGreaterThan(20);
    }
  });

  test("no file is excluded twice", () => {
    const files = EXCLUSIONS.map((entry) => entry.file);
    expect(new Set(files).size).toBe(files.length);
  });

  test("every excluded path is one the gate would otherwise measure", () => {
    // A stale entry naming a deleted or never-measured path is dead weight that
    // reads as an active exemption.
    for (const entry of EXCLUSIONS) {
      expect(isMeasuredSource(entry.file)).toBe(true);
    }
  });
});

describe("LINE_COVERAGE_FLOOR", () => {
  test("is the 90% floor the coverage-90pct feature established", () => {
    expect(LINE_COVERAGE_FLOOR).toBe(90);
  });
});
