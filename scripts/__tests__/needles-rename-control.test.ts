import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildChunks,
  cosine,
  deriveControlPaths,
  rankAll,
  verdictOf,
  type ChunkRec,
  type Report,
} from "../needles-rename-control.ts";

/**
 * Fixture names here are deliberately neutral (`alpha`, `beta`). This file is
 * inside `check-stale-pointers.ts`'s corpus and is NOT in its `EXCLUDED` list, so
 * a pointer-shaped literal naming a moved module would land in that gate's
 * `HISTORICAL` count and move a pin that is checked with `===`. The logic under
 * test is name-agnostic, so nothing is lost by saying so.
 */
const rep = (rows: Array<[string, number | null, string?]>): Report => ({
  results: rows.map(([needleId, rank, filePath]) => ({
    needleId,
    rank,
    expected: filePath ? { filePath, lineStart: 1, lineEnd: 2 } : undefined,
  })),
});

describe("deriveControlPaths", () => {
  test("maps only the corpus files whose path changed since the baseline", () => {
    const baseline = rep([
      ["N1", 1, "src/alpha-old.ts"],
      ["N2", 1, "src/steady.ts"],
    ]);
    const map = deriveControlPaths(baseline, [
      { id: "N1", filePath: "src/alpha-new.ts" },
      { id: "N2", filePath: "src/steady.ts" },
    ]);
    expect([...map]).toEqual([["src/alpha-new.ts", "src/alpha-old.ts"]]);
  });

  test("an unrenamed corpus yields an empty map, so the control pass is a no-op", () => {
    const baseline = rep([["N1", 1, "src/steady.ts"]]);
    expect(deriveControlPaths(baseline, [{ id: "N1", filePath: "src/steady.ts" }]).size).toBe(0);
  });

  test("a needle the baseline never recorded contributes no mapping", () => {
    const map = deriveControlPaths(rep([["N1", 1, "src/alpha-old.ts"]]), [
      { id: "N9", filePath: "src/brand-new.ts" },
    ]);
    expect(map.size).toBe(0);
  });

  test("a baseline row with no resolved span is skipped rather than mapping to undefined", () => {
    const map = deriveControlPaths(rep([["N1", 1, undefined]]), [
      { id: "N1", filePath: "src/alpha-new.ts" },
    ]);
    expect(map.size).toBe(0);
  });

  test("two files renamed independently both appear", () => {
    const map = deriveControlPaths(
      rep([
        ["N1", 1, "src/alpha-old.ts"],
        ["N2", 2, "src/beta-old.ts"],
      ]),
      [
        { id: "N1", filePath: "src/alpha-new.ts" },
        { id: "N2", filePath: "src/beta-new.ts" },
      ],
    );
    expect(map.size).toBe(2);
    expect(map.get("src/beta-new.ts")).toBe("src/beta-old.ts");
  });
});

describe("buildChunks — the substitution reaches embedded text and nothing else", () => {
  const scratch = () => {
    const root = mkdtempSync(join(tmpdir(), "rename-control-"));
    writeFileSync(
      join(root, "alpha-new.ts"),
      // Long enough to survive the chunker's minimum-size handling.
      Array.from({ length: 40 }, (_, i) => `export const v${i} = ${i}; // line ${i}`).join("\n"),
    );
    return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  };

  test("the control label replaces the `// File:` header the chunker embeds", () => {
    const { root, cleanup } = scratch();
    try {
      const real = buildChunks(root, ["alpha-new.ts"], new Map());
      const ctrl = buildChunks(root, ["alpha-new.ts"], new Map([["alpha-new.ts", "alpha-old.ts"]]));
      expect(real.length).toBeGreaterThan(0);
      expect(real.length).toBe(ctrl.length);
      expect(real[0]!.content.startsWith("// File: alpha-new.ts\n")).toBe(true);
      expect(ctrl[0]!.content.startsWith("// File: alpha-old.ts\n")).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("only the header line differs — bodies and spans are byte-identical", () => {
    const { root, cleanup } = scratch();
    try {
      const real = buildChunks(root, ["alpha-new.ts"], new Map());
      const ctrl = buildChunks(root, ["alpha-new.ts"], new Map([["alpha-new.ts", "alpha-old.ts"]]));
      const body = (c: ChunkRec) => c.content.slice(c.content.indexOf("\n") + 1);
      for (let i = 0; i < real.length; i++) {
        expect(body(ctrl[i]!)).toBe(body(real[i]!));
        expect(ctrl[i]!.lineStart).toBe(real[i]!.lineStart);
        expect(ctrl[i]!.lineEnd).toBe(real[i]!.lineEnd);
      }
    } finally {
      cleanup();
    }
  });

  test("`filePath` on the record stays the real path, so findRank still matches", () => {
    const { root, cleanup } = scratch();
    try {
      const ctrl = buildChunks(root, ["alpha-new.ts"], new Map([["alpha-new.ts", "alpha-old.ts"]]));
      expect([...new Set(ctrl.map((c) => c.filePath))]).toEqual(["alpha-new.ts"]);
    } finally {
      cleanup();
    }
  });
});

describe("cosine", () => {
  test("identical vectors score 1 and orthogonal ones score 0", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 10);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  test("a zero vector scores 0 rather than NaN", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("rankAll", () => {
  /** Similarity is decided by the chunk's own text, so ranking is deterministic. */
  const fakeEmbed = async (text: string): Promise<number[]> => [
    text.includes("TARGET") ? 1 : 0,
    text.includes("RIVAL") ? 1 : 0,
    0.01,
  ];

  const chunks: ChunkRec[] = [
    { filePath: "a.ts", lineStart: 1, lineEnd: 5, content: "TARGET" },
    { filePath: "a.ts", lineStart: 6, lineEnd: 9, content: "RIVAL" },
  ];

  test("the needle whose target chunk is most similar ranks 1", async () => {
    const ranks = await rankAll(
      chunks,
      [{ id: "N1", query: "TARGET" }],
      new Map([["N1", { filePath: "a.ts", lineStart: 1, lineEnd: 5 } as never]]),
      fakeEmbed,
      0,
      10,
    );
    expect(ranks.get("N1")).toBe(1);
  });

  test("a target no chunk covers ranks null rather than throwing", async () => {
    const ranks = await rankAll(
      chunks,
      [{ id: "N1", query: "RIVAL" }],
      new Map([["N1", { filePath: "zzz.ts", lineStart: 900, lineEnd: 901 } as never]]),
      fakeEmbed,
      0,
      10,
    );
    expect(ranks.get("N1")).toBeNull();
  });
});

describe("verdictOf — pass A is the anti-drift check", () => {
  const baseline = rep([
    ["N1", 5],
    ["N2", 1],
  ]);
  const shipped = rep([
    ["N1", 6],
    ["N2", 1],
  ]);

  test("aborts, and reports nothing else, when pass A disagrees with the shipped report", () => {
    const v = verdictOf(
      baseline,
      shipped,
      new Map([
        ["N1", 4],
        ["N2", 1],
      ]),
      new Map([
        ["N1", 5],
        ["N2", 1],
      ]),
    );
    expect(v.faithful).toBe(false);
    expect(v.ok).toBe(false);
    expect(v.disagreements).toHaveLength(1);
    expect(v.lines.join("\n")).toContain("ABORT");
    expect(v.lines.join("\n")).not.toContain("per-needle rank");
  });

  test("a shipped rank loss the path control restores is not an unexplained regression", () => {
    const v = verdictOf(
      baseline,
      shipped,
      new Map([
        ["N1", 6],
        ["N2", 1],
      ]),
      new Map([
        ["N1", 5],
        ["N2", 1],
      ]),
    );
    expect(v.faithful).toBe(true);
    expect(v.ok).toBe(true);
    expect(v.rows.find((r) => r.needleId === "N1")!.restoredByPathControl).toBe(true);
    expect(v.lines.join("\n")).toContain("PASS");
  });

  test("a regression that survives the control is UNEXPLAINED and fails", () => {
    const v = verdictOf(
      baseline,
      shipped,
      new Map([
        ["N1", 6],
        ["N2", 1],
      ]),
      new Map([
        ["N1", 6],
        ["N2", 1],
      ]),
    );
    expect(v.ok).toBe(false);
    expect(v.faithful).toBe(true);
    expect(v.rows.find((r) => r.needleId === "N1")!.unexplained).toBe(true);
    expect(v.lines.join("\n")).toContain("FAIL");
  });

  test("a needle that drops out of the list entirely counts as worse than any rank", () => {
    const v = verdictOf(
      rep([["N1", 9]]),
      rep([["N1", null]]),
      new Map([["N1", null]]),
      new Map([["N1", null]]),
      10,
    );
    expect(v.rows[0]!.unexplained).toBe(true);
    expect(v.ok).toBe(false);
  });

  test("an improvement is neither unexplained nor restored-by-path-control", () => {
    const v = verdictOf(
      rep([["N1", 3]]),
      rep([["N1", 2]]),
      new Map([["N1", 2]]),
      new Map([["N1", 3]]),
    );
    expect(v.ok).toBe(true);
    expect(v.rows[0]!.unexplained).toBe(false);
    expect(v.rows[0]!.restoredByPathControl).toBe(false);
  });
});
