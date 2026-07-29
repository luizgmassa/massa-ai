import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  DEFAULT_FACADE,
  delegateScope,
  facadeParamOf,
  findFunctions,
  measureSource,
  membersRead,
  scan,
  stripNonCode,
} from "../search-facade-matrix.ts";

const SEARCH_DIR = join(import.meta.dir, "../../packages/core/src/services/search");

describe("findFunctions — body boundaries", () => {
  // Defect 1, and the reason this file exists. A brace-matching first draft
  // saw the `{}` in `options: SearchOptions = {}` as an open/close pair at
  // depth 0, closed the body before it started, and reported searchImpl as
  // 5 LOC with 0 members instead of 455 with 13. A matrix built on that would
  // have shown the facade as almost uncoupled and inverted the whole design.
  test("regression: a `= {}` parameter default does not truncate the body", () => {
    const src = `
export async function searchImpl(
  rlm: ContextualSearchRLM,
  options: SearchOptions = {},
): Promise<void> {
  await rlm.ensureInitialized();
  rlm.keywordSearch.query();
  rlm.vectorStore.search();
}
`;
    const [fn] = findFunctions(src);
    expect(fn.name).toBe("searchImpl");
    expect(membersRead(fn.body, "rlm")).toEqual(["ensureInitialized", "keywordSearch", "vectorStore"]);
  });

  test("regression: nested object and array literals in the body do not truncate it", () => {
    const src = `
export function f(rlm: ContextualSearchRLM) {
  const shape = { a: { b: [1, 2] }, c: {} };
  rlm.late.read();
}
`;
    const [fn] = findFunctions(src);
    expect(membersRead(fn.body, "rlm")).toEqual(["late"]);
  });

  test("a generic type parameter in the signature is skipped", () => {
    const src = `
export async function runWithIndexLock<T>(
  lockMap: Map<string, Promise<void>>,
  work: () => Promise<T>,
): Promise<T> {
  return work();
}
`;
    expect(findFunctions(src).map((f) => f.name)).toEqual(["runWithIndexLock"]);
  });

  test("a single-line signature with a default is parsed", () => {
    const src = `export function extractPreviewImpl(content: string, maxLines: number = 5): string {\n  return content;\n}\n`;
    const [fn] = findFunctions(src);
    expect(fn.name).toBe("extractPreviewImpl");
    expect(fn.loc).toBe(3);
  });
});

describe("stripNonCode", () => {
  // Defect 2. A JSDoc line reading `… from contextual-search-rlm.ts` beside a
  // parameter named `rlm` matched as `rlm.ts` and invented a member called
  // `ts`, inflating every count by one.
  test("regression: a comment mentioning `rlm.ts` does not invent a member", () => {
    const src = `
/** Extracted from contextual-search-rlm.ts — see the facade. */
export function f(rlm: ContextualSearchRLM) {
  rlm.real.use();
}
`;
    const [fn] = findFunctions(stripNonCode(src));
    expect(membersRead(fn.body, "rlm")).toEqual(["real"]);
  });

  test("line comments are stripped too", () => {
    expect(stripNonCode("const a = 1; // rlm.phantom\n")).not.toContain("phantom");
  });

  // Defects 3 and 4, the pair that mattered most. Quote-pairing across a real
  // file joins two unrelated apostrophes and deletes every line between them:
  // on the pre-M14 facade that discarded 11 genuine members and reported 15
  // where the truth is 26 — a 42% under-count on one commit and 0% on the
  // others, so cross-commit comparisons stayed coherent and stayed wrong.
  test("regression: string literals are NOT stripped, so apostrophes cannot delete code", () => {
    const src = `
export function f(rlm: ContextualSearchRLM) {
  const a = "the test's own value";
  rlm.survives.read();
  const b = "the store's other value";
}
`;
    const [fn] = findFunctions(stripNonCode(src));
    expect(membersRead(fn.body, "rlm")).toEqual(["survives"]);
  });
});

describe("facadeParamOf", () => {
  test("finds the annotated parameter under any name", () => {
    expect(facadeParamOf("rlm: ContextualSearchRLM, q: string", DEFAULT_FACADE)).toBe("rlm");
    expect(facadeParamOf("_rlm: ContextualSearchRLM", DEFAULT_FACADE)).toBe("_rlm");
  });

  test("returns null when no parameter carries the type", () => {
    expect(facadeParamOf("content: string, maxLines: number", DEFAULT_FACADE)).toBeNull();
  });

  test("does not match a type that merely shares a prefix", () => {
    expect(facadeParamOf("x: ContextualSearchRLMBuilder", DEFAULT_FACADE)).toBeNull();
  });
});

describe("measureSource", () => {
  // buildGraphStreamImpl takes the facade and deliberately never reads it —
  // its parameter is named `_rlm`. Scoring it anything but 0 would mean the
  // matrix counts signatures rather than reads, which is the distinction the
  // whole design turns on.
  test("a facade parameter that is never read scores 0, not null", () => {
    const src = `
export async function buildGraphStreamImpl(_rlm: ContextualSearchRLM, sets: T[][]) {
  return sets.flat();
}
`;
    const [r] = measureSource("graph.ts", src, DEFAULT_FACADE);
    expect(r.facadeParam).toBe("_rlm");
    expect(r.members).toEqual([]);
  });
});

describe("delegateScope", () => {
  test("keeps every function in a file that declares a facade-taking one", () => {
    const readings = [
      { name: "a", file: "d.ts", loc: 1, facadeParam: "rlm", members: ["x"] },
      { name: "b", file: "d.ts", loc: 1, facadeParam: null, members: [] },
      { name: "c", file: "other.ts", loc: 1, facadeParam: null, members: [] },
    ];
    expect(delegateScope(readings).map((r) => r.name)).toEqual(["a", "b"]);
  });

  // This is the post-PR-B assertion. When no module takes the facade any more
  // the scope is empty — the tool reports the split is done rather than
  // needing to be told the file names changed.
  test("is empty when nothing takes the facade — the target state", () => {
    const readings = [{ name: "a", file: "hybrid-search.ts", loc: 1, facadeParam: null, members: [] }];
    expect(delegateScope(readings)).toEqual([]);
  });
});

describe("the real search directory at PR-B's base commit", () => {
  const scoped = delegateScope(scan(SEARCH_DIR, DEFAULT_FACADE));

  test("reproduces design.md §2.1's totals exactly", () => {
    expect(scoped).toHaveLength(21);
    expect(scoped.filter((r) => r.facadeParam !== null)).toHaveLength(15);
    expect(scoped.filter((r) => r.facadeParam === null)).toHaveLength(6);
    expect(scoped.reduce((s, r) => s + r.loc, 0)).toBe(1550);
    expect(new Set(scoped.flatMap((r) => r.members)).size).toBe(23);
  });

  test("searchImpl is the god function: 455 LOC, 13 members", () => {
    const s = scoped.find((r) => r.name === "searchImpl")!;
    expect(s.loc).toBe(455);
    expect(s.members).toHaveLength(13);
  });

  test("fuseResultsImpl reads exactly one member, and it is a constant", () => {
    expect(scoped.find((r) => r.name === "fuseResultsImpl")!.members).toEqual(["RRF_K"]);
  });

  test("buildGraphStreamImpl is 124 lines reading zero members", () => {
    const b = scoped.find((r) => r.name === "buildGraphStreamImpl")!;
    expect(b.loc).toBe(124);
    expect(b.members).toEqual([]);
  });

  // The member→consumer direction. ensureInitialized being the single most-read
  // member is finding F1: the facade is passed for the construction sequence,
  // not for the state.
  test("ensureInitialized is read by 7 delegates — design.md §2.2's F1", () => {
    const consumers = scoped.filter((r) => r.members.includes("ensureInitialized"));
    expect(consumers).toHaveLength(7);
  });

  test("RRF_K, fileFilterCache and queryUnderstanding are each read by exactly one", () => {
    for (const m of ["RRF_K", "fileFilterCache", "queryUnderstanding"]) {
      expect(scoped.filter((r) => r.members.includes(m))).toHaveLength(1);
    }
  });

  // ensureInitializedImpl is the export design.md §4.1's module table omitted.
  // Pinned here so its 8-member reach is a measured fact rather than a note:
  // 8 > G-HUB's ceiling of 3, so it can only live in the root.
  test("ensureInitializedImpl reads 8 members — it can only live in the root", () => {
    expect(scoped.find((r) => r.name === "ensureInitializedImpl")!.members).toHaveLength(8);
  });
});
