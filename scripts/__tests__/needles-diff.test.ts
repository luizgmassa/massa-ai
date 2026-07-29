import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { diffReports, type Hit, type Report } from "../needles-diff.ts";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const CLI = join(REPO_ROOT, "scripts", "needles-diff.ts");

/**
 * Synthetic throughout, for the same reason `check-frozen-anchors.test.ts` is:
 * `resolve.ts` scans every `.ts` under the repo root, so quoting a real needle
 * anchor here would make it resolve twice and turn the real gate red.
 */
const hits = (n: number, top = 0.6): Hit[] =>
  Array.from({ length: n }, (_, i) => ({
    filePath: `src/file-${i}.ts`,
    lineStart: i * 10 + 1,
    lineEnd: i * 10 + 5,
    score: +(top - i * 0.01).toFixed(4),
  }));

const report = (entries: Array<[string, number | null]>): Report => ({
  results: entries.map(([needleId, rank]) => ({ needleId, hits: hits(10), rank })),
});

describe("diffReports", () => {
  test("identical runs are not a regression", () => {
    const r = diffReports(report([["N01", 1], ["N02", 3]]), report([["N01", 1], ["N02", 3]]));
    expect(r.ok).toBe(true);
    expect(r.regressions).toEqual([]);
  });

  // The sensor tasks.md specifies for this script, and the exact shape
  // GMS-05 AC-4 note 2 names: the floors do not move, so the gate passes,
  // and the needle is four times harder to find than it was.
  test("one needle slipping rank 1 → 4 is reported as a regression", () => {
    const r = diffReports(report([["N01", 1], ["N02", 2]]), report([["N01", 4], ["N02", 2]]));
    expect(r.ok).toBe(false);
    expect(r.regressions).toHaveLength(1);
    expect(r.regressions[0]!.needleId).toBe("N01");
    expect(r.regressions[0]!.drop).toBe(3);
  });

  test("three needles slipping 1 → 4 while hit@5 is untouched still fails", () => {
    const before = report([["N01", 1], ["N02", 1], ["N03", 1], ["N04", 5]]);
    const after = report([["N01", 4], ["N02", 4], ["N03", 4], ["N04", 5]]);
    const r = diffReports(before, after);
    expect(r.ok).toBe(false);
    expect(r.regressions.map((d) => d.needleId).sort()).toEqual(["N01", "N02", "N03"]);
    // Every needle is still within the top 5 both times — the aggregate hit@5
    // is 1.0 before and after, which is precisely why the aggregate cannot be
    // the sensor.
    expect(before.results.every((e) => e.rank !== null && e.rank <= 5)).toBe(true);
    expect(after.results.every((e) => e.rank !== null && e.rank <= 5)).toBe(true);
  });

  test("a rank that improves is reported, and is not a failure", () => {
    const r = diffReports(report([["N01", 4]]), report([["N01", 1]]));
    expect(r.ok).toBe(true);
    expect(r.improvements).toHaveLength(1);
    expect(r.improvements[0]!.drop).toBe(-3);
  });

  test("a hit becoming a miss is the largest regression, not an absent one", () => {
    const r = diffReports(report([["N01", 1]]), report([["N01", null]]));
    expect(r.ok).toBe(false);
    // null sorts beyond the list at topK + 1 = 11, so the drop is 10.
    expect(r.regressions[0]!.drop).toBe(10);
    expect(r.regressions[0]!.afterRank).toBeNull();
  });

  // Dropping a hard needle raises every aggregate. It has to be louder than
  // the metric it flatters, not quieter.
  test("a needle that disappears is a regression even though no rank got worse", () => {
    const r = diffReports(report([["N01", 1], ["N02", 9]]), report([["N01", 1]]));
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["N02"]);
    expect(r.regressions).toEqual([]);
  });

  test("a needle added later is noted and is not a failure", () => {
    const r = diffReports(report([["N01", 1]]), report([["N01", 1], ["N99", 7]]));
    expect(r.ok).toBe(true);
    expect(r.added).toEqual(["N99"]);
  });

  // Cosine scores move with chunk boundaries, and a rename changes boundaries
  // without changing retrieval quality. Rank is the invariant.
  test("score drift with identical ranks is not a regression", () => {
    const before: Report = { results: [{ needleId: "N01", hits: hits(10, 0.9), rank: 1 }] };
    const after: Report = { results: [{ needleId: "N01", hits: hits(10, 0.4), rank: 1 }] };
    const r = diffReports(before, after);
    expect(r.ok).toBe(true);
    expect(r.deltas[0]!.beforeTopScore).toBe(0.9);
    expect(r.deltas[0]!.afterTopScore).toBe(0.4);
  });

  test("recorded ranks are used verbatim, so no anchor resolution is needed", () => {
    const r = diffReports(report([["N01", 2]]), report([["N01", 2]]));
    expect(r.recomputed).toEqual([]);
  });
});

describe("the CLI contract", () => {
  let dir: string;
  const write = (name: string, value: unknown): string => {
    const p = join(dir, name);
    writeFileSync(p, JSON.stringify(value, null, 2));
    return p;
  };
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "needles-diff-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (args: string[]): { status: number; stdout: string; stderr: string } => {
    const r = spawnSync("bun", [CLI, ...args], { encoding: "utf8" });
    return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };

  test("a clean comparison exits 0", () => {
    const a = write("clean-before.json", report([["N01", 1]]));
    const b = write("clean-after.json", report([["N01", 1]]));
    const r = run([a, b]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("no regression");
  });

  test("a rank slip exits 1 and names the needle", () => {
    const a = write("slip-before.json", report([["N01", 1]]));
    const b = write("slip-after.json", report([["N01", 4]]));
    const r = run([a, b]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("REGRESSION");
    expect(r.stdout).toContain("N01");
  });

  test("--json still carries the exit code", () => {
    const a = write("json-before.json", report([["N01", 1]]));
    const b = write("json-after.json", report([["N01", 4]]));
    const r = run([a, b, "--json"]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).ok).toBe(false);
  });

  test("an unreadable report is a usage error, not a regression", () => {
    const a = write("missing-before.json", report([["N01", 1]]));
    const r = run([a, join(dir, "nope.json")]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("cannot read report");
  });
});

/**
 * The tracked before-baseline is T17's only referent.
 *
 * `benchmarks/needles/reports/` is gitignored, so the run artifact does not
 * survive a fresh checkout; the copy under the feature's `.specs/` directory
 * does. If it were ever committed without recorded ranks, T17 would fall back
 * to resolving anchors against a post-rename tree — the one case the fallback
 * cannot serve — and would report a total collapse. Cheaper to fail here.
 */
describe("the committed PR-B before-baseline", () => {
  const baseline = JSON.parse(
    readFileSync(join(REPO_ROOT, ".specs/features/core-layering-god-module-split/needles-before.json"), "utf8"),
  ) as Report;

  test("is self-describing: every needle carries its rank and resolved span", () => {
    expect(baseline.results).toHaveLength(14);
    for (const r of baseline.results) {
      expect(r.rank === null || typeof r.rank === "number").toBe(true);
      expect(r.expected?.filePath).toBeTruthy();
    }
  });

  test("diffs clean against itself without resolving a single anchor", () => {
    const r = diffReports(baseline, baseline);
    expect(r.ok).toBe(true);
    expect(r.recomputed).toEqual([]);
  });

  test("records the aggregate the gate reported", () => {
    expect(baseline.aggregate?.hitAt1).toBeCloseTo(0.6429, 4);
    expect(baseline.aggregate?.mrr).toBeCloseTo(0.7357, 4);
  });
});

/**
 * Reports captured before `run.ts` recorded rank carry only hits, so rank has
 * to be recomputed against a tree. That path is exercised against a scratch
 * repo rather than a real report: `benchmarks/needles/reports/` is gitignored,
 * so a test reading one would pass locally and fail on a fresh checkout.
 */
describe("the legacy report fallback", () => {
  let root: string;
  const ANCHOR = "const SYNTHETIC_GAMMA = blend(a, b);";

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "needles-diff-legacy-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "gamma.ts"), ["export function gamma(a: number, b: number): number {", `  ${ANCHOR}`, "  return SYNTHETIC_GAMMA;", "}", ""].join("\n"));
    writeFileSync(
      join(root, "fixture.json"),
      JSON.stringify({
        scoring: { lineTolerance: 5, staleNeedles: [] },
        needles: [{ id: "S01", expected: { anchor: ANCHOR, startOffset: 0, endOffset: 0 } }],
      }),
    );
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const legacy = (rankPosition: number): unknown => ({
    results: [
      {
        needleId: "S01",
        // The target sits at src/gamma.ts:2; everything before it is filler.
        hits: Array.from({ length: 5 }, (_, i) => ({
          filePath: i === rankPosition - 1 ? "src/gamma.ts" : "src/other.ts",
          lineStart: i === rankPosition - 1 ? 2 : 500 + i,
          lineEnd: i === rankPosition - 1 ? 2 : 505 + i,
          score: 0.5,
        })),
      },
    ],
  });

  test("rank is recomputed, the slip is caught, and the fallback announces itself", () => {
    const before = join(root, "legacy-before.json");
    const after = join(root, "legacy-after.json");
    writeFileSync(before, JSON.stringify(legacy(1)));
    writeFileSync(after, JSON.stringify(legacy(4)));
    const r = spawnSync("bun", [CLI, before, after, "--fixture", join(root, "fixture.json"), "--root", root], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("had no recorded rank");
    expect(r.stdout).toContain("REGRESSION");
  });
});
