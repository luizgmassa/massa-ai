import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const CLI = join(REPO_ROOT, "scripts", "check-frozen-anchors.ts");

/**
 * Every anchor in this file is synthetic, and that is a hard constraint rather
 * than a style choice. `resolve.ts` scans every `.ts` under the repo root, this
 * file included, so quoting one of the 14 real anchors here would make that
 * anchor resolve to two locations and turn the real needles gate red — the
 * exact failure this suite exists to detect. Real needles are referred to by
 * id and by resolved path only.
 */
const ANCHOR_ALPHA = "const SYNTHETIC_ALPHA = compute(seed) * 1.5;";
const ANCHOR_BETA = "return synthesize(rows, options);";

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): Run {
  const r = spawnSync("bun", [CLI, ...args], { encoding: "utf8" });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** A scratch repo: two sources and a fixture pointing into them. */
function makeScratch(): string {
  const root = mkdtempSync(join(tmpdir(), "frozen-anchors-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "alpha.ts"),
    ["export function alpha(seed: number): number {", `  ${ANCHOR_ALPHA}`, "  return SYNTHETIC_ALPHA;", "}", ""].join("\n"),
  );
  writeFileSync(
    join(root, "src", "beta.ts"),
    ["export function beta(rows: string[], options: object): string {", `  ${ANCHOR_BETA}`, "}", ""].join("\n"),
  );
  writeFileSync(
    join(root, "fixture.json"),
    JSON.stringify(
      {
        needles: [
          { id: "S01-alpha", expected: { anchor: ANCHOR_ALPHA, startOffset: -1, endOffset: 1 } },
          { id: "S02-beta", expected: { anchor: ANCHOR_BETA, startOffset: -1, endOffset: 0 } },
        ],
        scoring: { staleNeedles: [] },
      },
      null,
      2,
    ),
  );
  return root;
}

describe("the real repository", () => {
  const run = runCli(["--json"]);
  const parsed = run.status === 0 ? (JSON.parse(run.stdout) as { reports: Array<{ needleId: string; filePath: string }> }) : null;

  test("every needle anchor resolves to exactly one location — exit 0", () => {
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(parsed?.reports).toHaveLength(14);
  });

  // Not a restatement of the run above. If any file in this repository ever
  // quotes one of these anchors verbatim — a doc example, a fixture, a test
  // like this one — the anchor resolves twice and `bench:needles:gate` fails
  // for a reason that has nothing to do with retrieval. This is the cheap,
  // Ollama-free place that says so.
  test("PR-B's four frozen anchors are where tasks.md says they are", () => {
    const at = (id: string): string | undefined => parsed?.reports.find((r) => r.needleId === id)?.filePath;
    expect(at("N03-keyword-boost-code-query")).toBe("packages/core/src/services/search/rlm-fusion.ts");
    expect(at("N04-rrf-vector-blend")).toBe("packages/core/src/services/search/rlm-fusion.ts");
    expect(at("N05-centrality-rerank-bonus")).toBe("packages/core/src/services/search/rlm-fusion.ts");
    expect(at("N06-minscore-on-raw-vector")).toBe("packages/core/src/services/search/rlm-search.ts");
  });

  test("no needle is grandfathered as positional", () => {
    const fixture = JSON.parse(readFileSync(join(REPO_ROOT, "benchmarks/needles/fixtures/massa-ai.json"), "utf8")) as {
      scoring: { staleNeedles: string[] };
    };
    expect(fixture.scoring.staleNeedles).toEqual([]);
  });
});

describe("the sensor", () => {
  let root: string;
  beforeAll(() => {
    root = makeScratch();
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const check = (): Run => runCli(["--root", root, "--fixture", join(root, "fixture.json")]);

  test("an unmutated scratch repo passes", () => {
    const r = check();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("S01-alpha");
  });

  // The constraint is "moving them between files is safe; reformatting is not."
  // A sensor that only proves the failure direction cannot distinguish a real
  // gate from one that is red on everything, so both directions are asserted.
  test("moving an anchor verbatim to another file still passes", () => {
    const alpha = join(root, "src", "alpha.ts");
    const moved = join(root, "src", "alpha-moved.ts");
    const body = readFileSync(alpha, "utf8");
    writeFileSync(moved, body);
    writeFileSync(alpha, "export const nothing = 0;\n");
    try {
      const r = check();
      expect(r.status).toBe(0);
      expect(JSON.parse(runCli(["--root", root, "--fixture", join(root, "fixture.json"), "--json"]).stdout).reports[0].filePath).toBe(
        "src/alpha-moved.ts",
      );
    } finally {
      writeFileSync(alpha, body);
      rmSync(moved, { force: true });
    }
  });

  test("reformatting an anchor fails with NEEDLE_ANCHOR_UNRESOLVED", () => {
    const alpha = join(root, "src", "alpha.ts");
    const body = readFileSync(alpha, "utf8");
    // The real defect: a reflow. Not a deletion, not a rename — the thing a
    // refactor actually does to a line it is not thinking about.
    writeFileSync(alpha, body.replace(ANCHOR_ALPHA, "const SYNTHETIC_ALPHA =\n    compute(seed) * 1.5;"));
    try {
      const r = check();
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("NEEDLE_ANCHOR_UNRESOLVED");
      expect(r.stderr).toContain("S01-alpha");
    } finally {
      writeFileSync(alpha, body);
    }
  });

  test("duplicating an anchor fails with NEEDLE_ANCHOR_AMBIGUOUS", () => {
    const copy = join(root, "src", "alpha-copy.ts");
    writeFileSync(copy, readFileSync(join(root, "src", "alpha.ts"), "utf8"));
    try {
      const r = check();
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("NEEDLE_ANCHOR_AMBIGUOUS");
      expect(r.stderr).toContain("src/alpha-copy.ts");
    } finally {
      rmSync(copy, { force: true });
    }
  });

  test("a span pushed past EOF fails with NEEDLE_SPAN_OUT_OF_RANGE", () => {
    const fixture = join(root, "fixture.json");
    const body = readFileSync(fixture, "utf8");
    writeFileSync(fixture, body.replace('"endOffset": 1', '"endOffset": 400'));
    try {
      const r = check();
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("NEEDLE_SPAN_OUT_OF_RANGE");
    } finally {
      writeFileSync(fixture, body);
    }
  });

  test("an unreadable fixture is a usage error, not a gate failure", () => {
    const r = runCli(["--root", root, "--fixture", join(root, "does-not-exist.json")]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("cannot read fixture");
  });
});
