import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  POINTER,
  PATH_PREFIX,
  PREFIX_STEMS,
  SUFFIX_STEMS,
  HISTORICAL_PINNED,
  candidateNames,
  categorise,
  categorisePath,
  pathCandidates,
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

// ── C26: the path branch (PR-C T10b) ────────────────────────────────────────
//
// The T6 reshape made a controller citation VISIBLE. It could not make it
// CORRECT: `POINTER` captures no directory, `categorise` resolves a basename,
// and a move keeps both. Measured at T10 — 31 citations wrong, gate green.
describe("PATH_PREFIX — the directory segment beside a match", () => {
  const pfx = (line: string, token: string) =>
    line.slice(0, line.indexOf(token)).match(PATH_PREFIX)?.[0] ?? "";

  test("captures a repo-anchored directory", () => {
    expect(pfx("see controllers/memory-controller.ts", "memory-controller.ts")).toBe("controllers/");
  });

  test("captures a dot-relative specifier", () => {
    expect(pfx('from "../controllers/graph-controller.js"', "graph-controller.js")).toBe(
      "../controllers/",
    );
  });

  test("a bare citation has no prefix, and that is not a failure", () => {
    // Bare mentions are the majority of the corpus and stay on the basename
    // branch. Requiring a directory would make this a banned-word list.
    expect(pfx("see memory-controller.ts", "memory-controller.ts")).toBe("");
  });

  test("anchored at the end, so an earlier path on the line is not stolen", () => {
    // Without the `$` this would capture `src/tools/`, judge the wrong path and
    // report a fact about the regex as a fact about the tree.
    expect(pfx("src/tools/x.ts delegates to memory-controller.ts", "memory-controller.ts")).toBe("");
  });
});

describe("pathCandidates — the four resolution roots", () => {
  test("all four roots are offered, in both NodeNext spellings", () => {
    const c = pathCandidates("docs/ONBOARDING.md", "controllers/", "memory-controller.ts");
    expect(c).toContain("controllers/memory-controller.ts");
    expect(c).toContain("docs/controllers/memory-controller.ts");
    expect(c).toContain("packages/core/src/controllers/memory-controller.ts");
    expect(c).toContain("packages/core/controllers/memory-controller.ts");
  });

  test("a .js citation also offers the .ts on disk, at every root", () => {
    const c = pathCandidates("a/b.md", "x/", "memory-controller.js");
    expect(c).toContain("x/memory-controller.ts");
    expect(c).toContain("packages/core/src/x/memory-controller.ts");
  });

  test("a dot-relative citation is normalised, and only the importer root reaches the real file", () => {
    // The prediction that did not hold while writing this branch, kept as a
    // test because reasoning about it produced the wrong answer twice. For a
    // `../` citation the three repo-anchored roots do NOT converge on the
    // importer's answer — each cancels one segment of its own base instead:
    const c = pathCandidates("packages/core/src/tools/a.ts", "../controllers/", "x-controller.js");
    expect(c).toEqual([
      // repo-root: cannot rise above the root, so the `../` survives
      "../controllers/x-controller.js",
      "../controllers/x-controller.ts",
      // importer-relative: the only root that lands on the real neighbour
      "packages/core/src/controllers/x-controller.js",
      "packages/core/src/controllers/x-controller.ts",
      // core-src: `packages/core/src/` + `../` -> `packages/core/`
      "packages/core/controllers/x-controller.js",
      "packages/core/controllers/x-controller.ts",
      // core-package: `packages/core/` + `../` -> `packages/`
      "packages/controllers/x-controller.js",
      "packages/controllers/x-controller.ts",
    ]);
    // Every candidate is normalised — a raw `..` segment would never match a
    // `git ls-files` entry and the branch would silently resolve nothing.
    expect(c.some((p) => p.includes("/../"))).toBe(false);
  });
});

describe("categorisePath", () => {
  const live = new Set(["packages/core/src/services/search/search-controller.ts"]);
  const ever = new Set([
    "packages/core/src/services/search/search-controller.ts",
    "packages/core/src/controllers/search-controller.ts",
  ]);

  test("a citation of the new home RESOLVES", () => {
    expect(
      categorisePath("docs/x.md", "services/search/", "search-controller.ts", live, ever),
    ).toBe("RESOLVES");
  });

  // The C26 case itself. Under `categorise` this same token is RESOLVES,
  // because the basename is live at its new address.
  test("a citation of the OLD home is HISTORICAL, where the basename check says RESOLVES", () => {
    expect(categorisePath("docs/x.md", "controllers/", "search-controller.ts", live, ever)).toBe(
      "HISTORICAL",
    );
    const liveBase = new Set(["search-controller.ts"]);
    expect(categorise("search-controller.ts", liveBase, liveBase)).toBe("RESOLVES");
  });

  test("a directory that never existed is BROKEN", () => {
    expect(categorisePath("docs/x.md", "orchestrators/", "search-controller.ts", live, ever)).toBe(
      "BROKEN",
    );
  });

  test("path resolution is a SUBSET of basename resolution, which is what makes this strictly stricter", () => {
    // If a full path is tracked its basename necessarily is, so the branch can
    // only ever move a token toward failure — it cannot manufacture a PASS.
    // Asserted rather than assumed: "strictly stricter" says nothing about
    // whether the new subject can match, and the first remedy for R-09 was
    // strictly stricter and matched nothing at all.
    const liveBase = new Set([...live].map((p) => p.slice(p.lastIndexOf("/") + 1)));
    for (const prefix of ["services/search/", "controllers/", "orchestrators/"]) {
      const byPath = categorisePath("docs/x.md", prefix, "search-controller.ts", live, ever);
      const byBase = categorise("search-controller.ts", liveBase, liveBase);
      expect(byBase).toBe("RESOLVES");
      if (byPath === "RESOLVES") expect(byBase).toBe("RESOLVES");
    }
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

  test("EXCLUDED is the documented five and nothing else", () => {
    // The fourth is this very file. It holds fixture literals, not references —
    // and until it was staged the gate could not see itself at all, which took
    // the real reading from PASS 31/26/0 to FAIL 36/46/15. The fifth is the same
    // class one directory over: recorded API responses whose string content is
    // data. One of them carries a relative specifier written from the point of
    // view of a file that does not exist, so no resolution root can be right
    // about it and it is not repointable — see EXCLUDED's docblock.
    expect([...EXCLUDED]).toEqual([
      "CHANGELOG.md",
      ".specs/",
      ".ua/",
      "scripts/__tests__/check-stale-pointers.test.ts",
      "packages/core/src/__tests__/test-seam/fixtures/",
    ]);
  });

  // ── C26, the shape the basename branch is structurally blind to ───────────
  //
  // Every RED above is a DELETION. Phase 3 of PR-C is a MOVE, and the two are
  // not the same failure: after a move the basename is still live, so the token
  // resolves and the gate passes while every citation of it is wrong. Measured
  // on the real corpus at T10 — 31 wrong, `PASS — 0 broken`.
  test("RED: a controller MOVED with its citation unrepointed — the basename branch calls this RESOLVES", () => {
    const { root, cleanup } = repo(
      {
        "src/services/search/search-controller.ts": "// the new home\n",
        "src/tools/search_project.ts": "// delegates to src/controllers/search-controller.ts\n",
      },
      { "src/controllers/search-controller.ts": "// the old home\n" },
    );
    try {
      const found = scan(root);
      expect(found.map((p) => p.category)).toEqual(["HISTORICAL"]);
      expect(report(found, 0).ok).toBe(false);
      // The half of the pair that makes this discriminating: judged as a bare
      // basename against the same tree, this token is fine. The file it names
      // really is there — at an address the citation does not give.
      const liveBase = new Set(["search-controller.ts"]);
      expect(categorise("search-controller.ts", liveBase, liveBase)).toBe("RESOLVES");
    } finally {
      cleanup();
    }
  });

  test("RED: the same, written as a dot-relative specifier", () => {
    // The commoner form in source: a NodeNext import whose importer did not move
    // but whose target did. `.js` on the wire, `.ts` on disk, resolved relative
    // to the citing file rather than to the repo root.
    const { root, cleanup } = repo(
      {
        "src/services/search/search-controller.ts": "// the new home\n",
        "src/tools/search_project.ts": 'import { X } from "../controllers/search-controller.js";\n',
      },
      { "src/controllers/search-controller.ts": "// the old home\n" },
    );
    try {
      const found = scan(root);
      expect(found.map((p) => p.category)).toEqual(["HISTORICAL"]);
      expect(report(found, 0).ok).toBe(false);
    } finally {
      cleanup();
    }
  });

  test("GREEN: the same move with the citation repointed passes", () => {
    // The control, and it carries as much weight as the reds. A branch that
    // failed every directory-carrying citation would pass both tests above and
    // make the gate unsatisfiable the moment anything moved.
    const { root, cleanup } = repo(
      {
        "src/services/search/search-controller.ts": "// the new home\n",
        "src/tools/search_project.ts":
          "// delegates to src/services/search/search-controller.ts\n",
      },
      { "src/controllers/search-controller.ts": "// the old home\n" },
    );
    try {
      const found = scan(root);
      expect(found.map((p) => p.category)).toEqual(["RESOLVES"]);
      expect(report(found, 0).ok).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("GREEN: a bare citation of a moved file still passes, and that is deliberate", () => {
    // A citation with no directory makes no claim about location, so a move
    // cannot falsify it. Failing it would be a banned-word list, which this
    // gate's header rules out by name.
    const { root, cleanup } = repo(
      {
        "src/services/search/search-controller.ts": "// the new home\n",
        "src/tools/search_project.ts": "// delegates to search-controller.ts\n",
      },
      { "src/controllers/search-controller.ts": "// the old home\n" },
    );
    try {
      expect(scan(root).map((p) => p.category)).toEqual(["RESOLVES"]);
      expect(report(scan(root), 0).ok).toBe(true);
    } finally {
      cleanup();
    }
  });
});
