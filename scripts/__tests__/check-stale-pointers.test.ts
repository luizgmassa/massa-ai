import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  POINTER,
  STEMS,
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

  test("STEMS is the documented two, and POINTER is derived from it", () => {
    expect([...STEMS]).toEqual(["rlm", "search-facade"]);
    for (const stem of STEMS) expect(POINTER.source).toContain(stem);
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
