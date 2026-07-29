import { describe, expect, test } from "bun:test";
import {
  importSpecifiers,
  measure,
  measureDirectory,
  specifierMatches,
  stripComments,
  trackedFiles,
} from "../search-facade-metrics.ts";

const FACADE = "packages/core/src/services/search/contextual-search-rlm.ts";
const SELF = "scripts/__tests__/search-facade-metrics.test.ts";

describe("importSpecifiers — static forms", () => {
  test("named, default, namespace, type-only and bare imports", () => {
    const src = `
import { a } from "./named.js";
import d from "./default.js";
import * as ns from "./namespace.js";
import type { T } from "./type-only.js";
import "./side-effect.js";
`;
    expect(importSpecifiers(src).static.sort()).toEqual([
      "./default.js",
      "./named.js",
      "./namespace.js",
      "./side-effect.js",
      "./type-only.js",
    ]);
  });

  test("a braced specifier list spanning lines is one import", () => {
    const src = `
import {
  alpha,
  beta,
} from "./multiline.js";
`;
    expect(importSpecifiers(src).static).toEqual(["./multiline.js"]);
  });

  test("re-exports count as imports", () => {
    expect(importSpecifiers(`export { x } from "./re-export.js";`).static).toEqual(["./re-export.js"]);
  });

  // The over-greedy first draft let the gap before `from` cross anything at
  // all, so a match starting at an unrelated `export` line ran on and grabbed
  // the next string literal it met. On the real facade that was
  // `Pick<SessionRegistry, "getAsync">` at :109 — a type-level literal counted
  // as a module, reporting fan-out 20 where it is 19.
  test("regression: a string literal in a type position is not a module specifier", () => {
    const src = `
export interface Injected {
  sessionRegistry?: Pick<SessionRegistry, "getAsync">;
}
`;
    expect(importSpecifiers(src).static).toEqual([]);
  });

  test("regression: an export declaration does not absorb a later import's specifier", () => {
    const src = `
export class Thing {
  kind: Pick<X, "phantom">;
}
import { real } from "./real.js";
`;
    expect(importSpecifiers(src).static).toEqual(["./real.js"]);
  });
});

describe("importSpecifiers — dynamic and mocked", () => {
  // Both of this repo's dynamic importers of the search facade wrap the
  // specifier onto its own line. A line-oriented scan sees `import(` and the
  // string on different lines and matches neither, silently reporting fan-in
  // 24 where it is 26 — the count looks plausible, which is why it survives.
  //
  // The specifier here is deliberately a placeholder, not the facade's real
  // path. Pasting the real one makes this file a genuine match for the tool
  // measuring it: the fixture is verbatim code, and the tool does not parse
  // template literals. See the corpus test below that pins this.
  test("regression: a dynamic import with the specifier on the next line is found", () => {
    const src = `
  const { Thing } = await import(
    "./deep/placeholder-module.js"
  );
`;
    expect(importSpecifiers(src).dynamic).toEqual(["./deep/placeholder-module.js"]);
  });

  test("a single-line dynamic import is found too", () => {
    expect(importSpecifiers(`const m = await import("./x.js");`).dynamic).toEqual(["./x.js"]);
  });

  // mock.module replaces a module wholesale. A file that mocks something does
  // not depend on it — counting these is most of why a plain string search
  // reports 39 files where 26 import.
  test("mock.module targets are separated from real imports", () => {
    const refs = importSpecifiers(`mock.module("./mocked.js", () => ({}));\nimport { a } from "./real.js";`);
    expect(refs.mocked).toEqual(["./mocked.js"]);
    expect(refs.static).toEqual(["./real.js"]);
  });

  test("a commented-out import does not count", () => {
    expect(importSpecifiers(`// import { x } from "./dead.js";\nimport { y } from "./live.js";`).static).toEqual([
      "./live.js",
    ]);
    expect(importSpecifiers(`/* import { x } from "./dead.js"; */`).static).toEqual([]);
  });

  test("stripComments leaves string literals intact", () => {
    expect(stripComments(`const a = "the test's own value";`)).toContain("test's");
  });
});

describe("specifierMatches", () => {
  test("resolves across extension and relative depth", () => {
    expect(specifierMatches("../services/search/contextual-search-rlm.js", FACADE)).toBe(true);
    expect(specifierMatches("./contextual-search-rlm", FACADE)).toBe(true);
  });

  test("does not match a different module with a shared prefix", () => {
    expect(specifierMatches("./contextual-search-rlm-coverage.js", FACADE)).toBe(false);
  });
});

describe("the real repository at PR-B's base commit", () => {
  const files = trackedFiles();
  const r = measure(FACADE, files);

  test("reproduces design.md §7 exactly", () => {
    expect(r.fanInStatic).toHaveLength(24);
    expect(r.fanInStatic.length + r.fanInDynamic.length).toBe(26);
    expect(r.fanOut).toHaveLength(19);
  });

  // design.md §7 and spec.md both cite `scripts/beir-benchmark.ts:258` and
  // `scripts/symbol-benchmark.ts:213`, and the design records them as "both,
  // confirmed". Neither path exists: the files live under
  // packages/core/src/scripts/ and the import sites are at :259 and :214. The
  // count was right and its provenance was never checked against the tree.
  test("both dynamic importers are found, at their real paths", () => {
    expect(r.fanInDynamic).toEqual([
      "packages/core/src/scripts/beir-benchmark.ts",
      "packages/core/src/scripts/symbol-benchmark.ts",
    ]);
  });

  // A floor, not a pin, and the third revision of this number in one session:
  // 13 when D3 was written, 15 once its own two files were tracked, 17 once the
  // frozen-anchor and characterization tooling landed. Every one of those
  // movements was a new file *about* the facade, not a change to the facade.
  // The mention count measures how many things discuss the subject, which grows
  // monotonically during a refactor whose whole activity is discussing it.
  // Pinning it exactly makes every unrelated tool a test failure. The buckets
  // partitioning correctly is the real invariant; fan-in is the real figure.
  test("mentioning is not importing: the three buckets partition the mentions", () => {
    expect(r.mentionsOnly.length).toBeGreaterThanOrEqual(13);
    const total = r.fanInStatic.length + r.fanInDynamic.length + r.mentionsOnly.length;
    expect(total).toBe(new Set([...r.fanInStatic, ...r.fanInDynamic, ...r.mentionsOnly]).size);
    // What actually matters: tooling that names the facade must land in the
    // mention-only bucket, never in fan-in. An instrument counted as a consumer
    // of its own subject is the defect this suite was fixed for.
    for (const f of r.mentionsOnly.filter((m) => m.startsWith("scripts/"))) {
      expect(r.fanInStatic).not.toContain(f);
      expect(r.fanInDynamic).not.toContain(f);
    }
    expect(r.mentionsOnly).toContain("scripts/search-facade-metrics.ts");
    expect(r.mentionsOnly).toContain(SELF);
  });

  // Observed red. The suite was first verified at 17 pass / 0 fail while this
  // file was untracked, so `git ls-files` could not see it and the corpus tests
  // were blind to their own source. Staging it moved fan-in to 27: the
  // multi-line dynamic-import fixture above originally pasted the facade's real
  // specifier, and a template literal is not something this tool can see
  // through. 26 is the figure design.md §7 rests on, so an instrument that
  // counts itself is a corrupted reading, not a rounding error.
  test("the metric's own test file is not counted as an importer", () => {
    expect(r.fanInStatic).not.toContain(SELF);
    expect(r.fanInDynamic).not.toContain(SELF);
  });

  // design.md §5.1 calls its own controllers importer count an
  // order-of-magnitude statement pending this script, and puts it "between 22
  // and 30" against spec.md's "3-4 files". Measured, the spread is entirely
  // definitional and small.
  test("settles §5.1: controllers has 6 members and 24 outside importers", () => {
    const c = measureDirectory("packages/core/src/controllers", files);
    expect(c.members).toHaveLength(6);
    expect(c.deep).toHaveLength(22);
    expect(c.barrel).toEqual(["packages/core/src/index.ts"]);
    expect(c.dynamic).toEqual(["packages/core/src/services/project-identity/production-wiring.ts"]);
    expect(c.deep.length + c.barrel.length + c.dynamic.length).toBe(24);
  });

  // design.md §5.1 names two dynamic controllers importers. There is one:
  // search-session-hook.ts:21 is a plain static import.
  test("there is exactly one dynamic controllers importer, not two", () => {
    expect(measureDirectory("packages/core/src/controllers", files).dynamic).toHaveLength(1);
  });
});
