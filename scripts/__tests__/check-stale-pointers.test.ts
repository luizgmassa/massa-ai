import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  POINTER,
  PREFIX_STEMS,
  SUFFIX_STEMS,
  HISTORICAL_PINNED,
  candidateNames,
  categorise,
  scan,
  report,
  trackedFiles,
  EXCLUDED,
} from "../check-stale-pointers.ts";

/** A throwaway git repo, so history is real rather than stubbed. */
function repo(files: Record<string, string>, deleted: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "stale-ptr-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  const write = (p: string, c: string) => {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  };
  // First commit carries the files that will later be deleted, so they are
  // genuinely "known to history" rather than asserted to be.
  for (const [p, c] of Object.entries(deleted)) write(p, c);
  write(".keep", "");
  git("add", "-A");
  git("commit", "-qm", "base");
  for (const p of Object.keys(deleted)) rmSync(join(root, p));
  for (const [p, c] of Object.entries(files)) write(p, c);
  git("add", "-A");
  git("commit", "-qm", "second");
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("POINTER — what counts as a path-shaped reference", () => {
  const all = (s: string) => [...s.matchAll(POINTER)].map((m) => m[0]);

  test("matches a bare source and test pointer", () => {
    expect(all("see rlm-search.ts and rlm-admin.test.ts")).toEqual([
      "rlm-search.ts",
      "rlm-admin.test.ts",
    ]);
  });

  test("does NOT match inside contextual-search-rlm-coverage — the 14-false-positive bug", () => {
    // \b matches after the hyphen, so the original pattern extracted a phantom
    // `rlm-coverage.test.ts` from this name and reported it BROKEN 14 times.
    expect(all("contextual-search-rlm-coverage.test.ts")).toEqual([]);
    expect(all("./contextual-search-rlm-coverage.js")).toEqual([]);
  });

  test("does not match a glob, which names a set and cannot dangle", () => {
    expect(all("the five `rlm-*.ts` files")).toEqual([]);
  });

  test("does not match a bare stem with no extension", () => {
    expect(all("the rlm-admin delegate")).toEqual([]);
  });

  // The fourteenth defect, half 2: T15's own rename minted this population and an
  // `rlm`-only pattern was blind to it in both directions.
  test("matches the search-facade stem, whose tail carries a second hyphen", () => {
    expect(all("see search-facade-admin.test.ts and search-facade-matrix.ts")).toEqual([
      "search-facade-admin.test.ts",
      "search-facade-matrix.ts",
    ]);
  });

  test("a multi-word stem still anchors at a path boundary, not inside a longer name", () => {
    expect(all("legacy-search-facade-admin.test.ts")).toEqual([]);
    expect(all("./contextual-search-facade-admin.js")).toEqual([]);
  });

  test("PREFIX_STEMS is the documented two, and POINTER is derived from it", () => {
    expect([...PREFIX_STEMS]).toEqual(["rlm", "search-facade"]);
    for (const stem of PREFIX_STEMS) expect(POINTER.source).toContain(stem);
  });
});

// ── R-09: the suffix branch (PR-C T6) ───────────────────────────────────────
//
// The twenty-second plan defect was a gate that could not see the files it was
// aimed at: the stem was interpolated as a PREFIX and every controller file is
// suffix-shaped, so adding "controller" to the subject list produced a
// byte-identical report. A subject-list entry cannot fix a positional assumption
// baked into the pattern.
describe("POINTER — the suffix branch for controller-shaped names", () => {
  const all = (s: string) => [...s.matchAll(POINTER)].map((m) => m[0]);

  test("SUFFIX_STEMS is the documented one, and POINTER is derived from it", () => {
    expect([...SUFFIX_STEMS]).toEqual(["controller"]);
    for (const stem of SUFFIX_STEMS) expect(POINTER.source).toContain(stem);
  });

  test("matches suffix-shaped controller pointers, source and test", () => {
    expect(all("see memory-controller.ts and search-controller.test.ts")).toEqual([
      "memory-controller.ts",
      "search-controller.test.ts",
    ]);
  });

  test("matches the .js spelling a NodeNext specifier uses", () => {
    expect(all('from "../controllers/graph-controller.js"')).toEqual(["graph-controller.js"]);
  });

  test("the prefix shape it was originally aimed at does not exist and does not match", () => {
    // `controller-<rest>` files: 0 over git ls-files. The old remedy matched this
    // shape and nothing else, which is why it was a measured no-op.
    expect(all("controller-memory.ts")).toEqual([]);
  });

  test("does not match a bare controller name with no extension", () => {
    expect(all("the memory-controller module")).toEqual([]);
  });

  test("does not match a glob", () => {
    expect(all("the six `*-controller.ts` files")).toEqual([]);
  });

  test("anchors at a path boundary, so a longer name is not a phantom", () => {
    // The same class as the 14-false-positive bug on the prefix branch.
    expect(all("context-controller-coverage.test.ts")).toEqual([]);
  });

  test("the barrel carries no stem and is deliberately invisible here", () => {
    // §3.3: `controllers/index.ts` matches neither branch. It is covered by AC-6
    // (the exports subpath) and AC-2 (a TS `export *` from a deleted path is a
    // build failure), not by this gate. R-09 closes by three mechanisms, not one.
    expect(all('export * from "./controllers/index.js"')).toEqual([]);
  });

  test("the prefix branch is unchanged by the addition", () => {
    // §5.2's "strictly stricter" claim, asserted rather than assumed. The new
    // branch is a pure alternation addition; it can only add matches.
    expect(all("see rlm-search.ts and search-facade-admin.test.ts")).toEqual([
      "rlm-search.ts",
      "search-facade-admin.test.ts",
    ]);
  });

  // C18 — the twenty-fifth plan defect, which shipped a regex to `main` that
  // fails its own gate 0/0/28. This is the regression test for it.
  test("an untagged concatenated segment kills the WHOLE pattern, not just its branch", () => {
    const tagged = new RegExp(
      String.raw`(?<![\w-])(?:(?:${PREFIX_STEMS.join("|")})-[a-z0-9-]+?` +
        String.raw`|[a-z0-9-]+?-(?:${SUFFIX_STEMS.join("|")}))\.(?:test\.)?(?:ts|js)\b`,
      "g",
    );
    // design.md §5.2 as first published: second segment untagged.
    //
    // The cooking is applied explicitly rather than by typing a bare template
    // here, for a reason worth recording: oxlint's `no-useless-escape` flags
    // `\.` inside an untagged template as a correctness error — it *detects this
    // very defect*. So the literal form cannot sit in the tree without failing
    // `bun run lint`, which `lint-gate.test.ts` asserts on a clean tree. Applying
    // the transformation a template performs (`\.` -> `.`, `\b` -> U+0008) to the
    // same raw source text reproduces the identical string, and says out loud
    // what the defect actually is.
    const asUntaggedTemplate = (raw: string) =>
      raw.replace(/\\\./g, ".").replace(/\\b/g, "\u0008");
    const untagged = new RegExp(
      String.raw`(?<![\w-])(?:(?:${PREFIX_STEMS.join("|")})-[a-z0-9-]+?` +
        asUntaggedTemplate(
          String.raw`|[a-z0-9-]+?-(?:${SUFFIX_STEMS.join("|")}))\.(?:test\.)?(?:ts|js)\b`,
        ),
      "g",
    );
    expect(tagged.source).toBe(POINTER.source);

    const corpus = "rlm-search.ts and memory-controller.ts";
    expect([...corpus.matchAll(tagged)].map((m) => m[0])).toEqual([
      "rlm-search.ts",
      "memory-controller.ts",
    ]);
    // In an untagged template `\.` collapses to a wildcard and `\b` becomes the
    // backspace character U+0008. The alternation is one expression, so the
    // untouched PREFIX branch dies with it — the failure is total, not partial.
    expect([...corpus.matchAll(untagged)].map((m) => m[0])).toEqual([]);
    // The mechanism, named rather than inferred: in an untagged template the two
    // source characters backslash-b collapse to the control character U+0008.
    expect(untagged.source).toContain("\u0008");
    expect(tagged.source).not.toContain("\u0008");
  });
});

describe("candidateNames — NodeNext specifiers", () => {
  test("a .js pointer also resolves against the .ts on disk", () => {
    expect(candidateNames("rlm-search.js")).toEqual(["rlm-search.js", "rlm-search.ts"]);
  });

  test("a .ts pointer is taken literally", () => {
    expect(candidateNames("rlm-search.ts")).toEqual(["rlm-search.ts"]);
  });
});

describe("categorise", () => {
  const live = new Set(["hybrid-search.ts", "rlm-admin.test.ts"]);
  const ever = new Set(["hybrid-search.ts", "rlm-admin.test.ts", "rlm-search.ts"]);

  test("a live file RESOLVES", () => {
    expect(categorise("rlm-admin.test.ts", live, ever)).toBe("RESOLVES");
  });

  test("a deleted file is HISTORICAL, not BROKEN", () => {
    expect(categorise("rlm-search.ts", live, ever)).toBe("HISTORICAL");
  });

  test("a path that never existed is BROKEN", () => {
    expect(categorise("rlm-serch.ts", live, ever)).toBe("BROKEN");
  });
});

describe("scan and report over a real repo", () => {
  test("a pointer to a surviving file resolves and the gate passes at a pin of 0", () => {
    const { root, cleanup } = repo({
      "src/a.ts": "// see rlm-admin.test.ts\n",
      "src/rlm-admin.test.ts": "// I exist\n",
    });
    try {
      const found = scan(root);
      expect(found.map((p) => p.category)).toEqual(["RESOLVES"]);
      expect(report(found, 0).ok).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("RED: a typo that never existed fails the gate", () => {
    const { root, cleanup } = repo({ "src/a.ts": "// see rlm-serch.ts\n" });
    try {
      const r = report(scan(root), 0);
      expect(r.ok).toBe(false);
      expect(r.lines.join("\n")).toContain("BROKEN");
    } finally {
      cleanup();
    }
  });

  test("RED: a rename whose citation was not updated becomes HISTORICAL and trips the pin", () => {
    // The exact failure mode T15's own renames could introduce: the pointer used
    // to resolve, the file moved, and nothing else changed.
    const { root, cleanup } = repo(
      { "src/a.ts": "// see rlm-admin.test.ts\n", "src/index-admin.test.ts": "// renamed\n" },
      { "src/rlm-admin.test.ts": "// the old name\n" },
    );
    try {
      const found = scan(root);
      expect(found.map((p) => p.category)).toEqual(["HISTORICAL"]);
      expect(report(found, 0).ok).toBe(false);
    } finally {
      cleanup();
    }
  });

  // The fourteenth defect, half 1. `<=` passed both of the next two; only the
  // second is the one this gate was written to catch, and it was the one it missed.
  test("RED: the pin is exact — a historical count ABOVE it fails", () => {
    const { root, cleanup } = repo(
      { "src/a.ts": "// rlm-gone-one.ts and rlm-gone-two.ts\n" },
      { "src/rlm-gone-one.ts": "// x\n", "src/rlm-gone-two.ts": "// y\n" },
    );
    try {
      expect(report(scan(root), 1).ok).toBe(false);
    } finally {
      cleanup();
    }
  });

  test("RED: the pin is exact — a DELETED provenance comment drops below it and fails", () => {
    // A ceiling (`<=`) is green here, which is why this gate was one-directional:
    // the records it exists to protect could be deleted without it noticing.
    const { root, cleanup } = repo(
      { "src/a.ts": "// rlm-gone-one.ts\n" },
      { "src/rlm-gone-one.ts": "// x\n", "src/rlm-gone-two.ts": "// y\n" },
    );
    try {
      const found = scan(root);
      expect(found.map((p) => p.category)).toEqual(["HISTORICAL"]);
      expect(report(found, 2).ok).toBe(false);
      expect(report(found, 1).ok).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("the excluded paths are not scanned, and that is what makes the gate satisfiable", () => {
    const { root, cleanup } = repo({
      "CHANGELOG.md": "rlm-serch.ts\n",
      ".specs/notes.md": "rlm-serch.ts\n",
      ".ua/knowledge-graph.json": "rlm-serch.ts\n",
    });
    try {
      expect(trackedFiles(root).filter((f) => f !== ".keep")).toEqual([]);
      expect(report(scan(root), 0).ok).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("EXCLUDED matches CHANGELOG.md exactly, not as a prefix", () => {
    // `CHANGELOG.md` is an exact entry; a file merely starting with that name
    // must still be scanned, or the exclusion silently widens.
    const { root, cleanup } = repo({ "CHANGELOG.md.bak": "rlm-serch.ts\n" });
    try {
      expect(trackedFiles(root)).toContain("CHANGELOG.md.bak");
      expect(report(scan(root), 0).ok).toBe(false);
    } finally {
      cleanup();
    }
  });

  test("the shipped pin is the measured count, so the default gate is the real one", () => {
    expect(HISTORICAL_PINNED).toBe(28);
  });

  // §5.3 property 3 — both directions observed red, on the branch T6 adds. These
  // are the two shapes phase 3 can actually produce, and neither was reachable
  // before the reshape: the prefix-only pattern matched no controller filename at
  // all, so this gate would have reported PASS through the entire retirement.
  test("RED: a controller deleted without its citations repointed trips the pin", () => {
    const { root, cleanup } = repo(
      { "src/tools/search_project.ts": '// delegates to search-controller.ts\n' },
      { "src/controllers/search-controller.ts": "// the retired orchestrator\n" },
    );
    try {
      const found = scan(root);
      expect(found.map((p) => p.category)).toEqual(["HISTORICAL"]);
      expect(report(found, 0).ok).toBe(false);
    } finally {
      cleanup();
    }
  });

  test("RED: a citation naming a controller that never existed is BROKEN", () => {
    const { root, cleanup } = repo({
      "src/tools/search_project.ts": "// delegates to serch-controller.ts\n",
    });
    try {
      const r = report(scan(root), 0);
      expect(r.ok).toBe(false);
      expect(r.lines.join("\n")).toContain("BROKEN");
    } finally {
      cleanup();
    }
  });

  test("GREEN: a controller citation that still resolves passes", () => {
    // The discriminating control. A branch that flagged every controller-shaped
    // token would fail every test above and still be useless.
    const { root, cleanup } = repo({
      "src/tools/search_project.ts": "// delegates to search-controller.ts\n",
      "src/controllers/search-controller.ts": "// still here\n",
    });
    try {
      const found = scan(root);
      expect(found.map((p) => p.category)).toEqual(["RESOLVES"]);
      expect(report(found, 0).ok).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("EXCLUDED is the documented four and nothing else", () => {
    // The fourth is this very file. It holds fixture literals, not references —
    // and until it was staged the gate could not see itself at all, which took
    // the real reading from PASS 31/26/0 to FAIL 36/46/15.
    expect([...EXCLUDED]).toEqual([
      "CHANGELOG.md",
      ".specs/",
      ".ua/",
      "scripts/__tests__/check-stale-pointers.test.ts",
    ]);
  });
});
