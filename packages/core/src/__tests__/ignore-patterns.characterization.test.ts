/**
 * Ignore-patterns characterization test (Wave 5 T15 / FR-21 / AD-W5-015 / AC-23).
 *
 * Pins the pre-Wave-5 `loadProjectIgnore` outcomes on a fixture project with
 * a `.gitignore` containing a negation rule (`!keep/me.js`). The Wave 5 T16
 * refactor delegates to `applyPolicy` but MUST preserve the merged
 * `.gitignore` + `DEFAULT_IGNORES` semantics — negation rules still
 * un-ignore, and the merged rule list is what `applyPolicy` consumes.
 *
 * This test runs against the CURRENT `loadProjectIgnore` (pre-refactor) so
 * T16's post-refactor run must produce identical outcomes on the same
 * fixture paths. Per FR-21: "pre-Wave-5 `loadProjectIgnore` honors the
 * negation; post-Wave-5 `loadProjectIgnore` (delegating to capture-policy)
 * honors it identically (same outcome on 5+ sample paths)."
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadProjectIgnore, DEFAULT_IGNORES } from "../services/search/ignore-patterns.js";

let fixtureDir: string;

beforeAll(async () => {
  fixtureDir = await mkdtemp(path.join(tmpdir(), "wave5-ignore-"));
  // A .gitignore with:
  //  - a broad ignore (`*.js` — ignore all JS files)
  //  - a negation that un-ignores `keep/me.js` (FR-21 / AC-23)
  //  - the standard `node_modules/` ignore (overlaps with DEFAULT_IGNORES)
  //
  // Per gitignore semantics: a directory-level ignore (`keep/`) cannot be
  // re-entered by a file-level negation, so we use a glob (`*.js`) instead,
  // which the negation CAN un-ignore. This is the valid pattern that both
  // real git and the `Ignore` library honor.
  await writeFile(
    path.join(fixtureDir, ".gitignore"),
    ["*.js", "!keep/me.js", "node_modules/", "# a comment", ""].join("\n"),
  );
  // Create the fixture directories so the paths exist (the Ignore library
  // doesn't require them, but a real scan would).
  await mkdir(path.join(fixtureDir, "keep"), { recursive: true });
  await mkdir(path.join(fixtureDir, "node_modules", "foo"), { recursive: true });
  await mkdir(path.join(fixtureDir, "src"), { recursive: true });
  await writeFile(path.join(fixtureDir, "keep", "me.js"), "// keep me");
  await writeFile(path.join(fixtureDir, "keep", "drop.js"), "// drop me");
  await writeFile(path.join(fixtureDir, "src", "index.ts"), "// index");
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

describe("loadProjectIgnore characterization (FR-21 / AD-W5-015 / AC-23)", () => {
  test("negation rule !keep/me.js un-ignores a path that the broad *.js ignore would drop", async () => {
    const ig = await loadProjectIgnore(fixtureDir);
    // `keep/me.js` is un-ignored by the negation rule → NOT ignored.
    expect(ig.ignores("keep/me.js")).toBe(false);
    // `keep/drop.js` is ignored by the broad `*.js` rule (no negation).
    expect(ig.ignores("keep/drop.js")).toBe(true);
  });

  test("DEFAULT_IGNORES + .gitignore merge: node_modules still ignored", async () => {
    const ig = await loadProjectIgnore(fixtureDir);
    expect(ig.ignores("node_modules/foo/index.js")).toBe(true);
    expect(ig.ignores("node_modules/foo")).toBe(true);
  });

  test("DEFAULT_IGNORES still applies to paths not mentioned in .gitignore", async () => {
    const ig = await loadProjectIgnore(fixtureDir);
    // dist/ is in DEFAULT_IGNORES but not in the fixture .gitignore.
    expect(ig.ignores("dist/bundle.js")).toBe(true);
    expect(ig.ignores("build/out.js")).toBe(true);
    expect(ig.ignores(".env")).toBe(true);
    expect(ig.ignores(".env.local")).toBe(true);
  });

  test("source files outside the ignored globs are NOT ignored (5+ paths)", async () => {
    const ig = await loadProjectIgnore(fixtureDir);
    // FR-21: "same outcome on 5+ sample paths". These 5 paths exercise:
    //  - negation un-ignore (keep/me.js)
    //  - broad ignore (keep/drop.js)
    //  - DEFAULT_IGNORES (node_modules/foo/index.js, dist/bundle.js)
    //  - un-ignored source (src/index.ts)
    //  - un-ignored docs (docs/README.md)
    const cases: Array<[string, boolean]> = [
      ["keep/me.js", false], // negation un-ignores
      ["keep/drop.js", true], // broad ignore
      ["node_modules/foo/index.js", true], // DEFAULT_IGNORES + .gitignore
      ["dist/bundle.js", true], // DEFAULT_IGNORES only
      ["src/index.ts", false], // un-ignored source
      ["docs/README.md", false], // un-ignored docs
    ];
    for (const [p, expected] of cases) {
      expect(ig.ignores(p)).toBe(expected);
    }
  });

  test("DEFAULT_IGNORES is non-empty and contains node_modules + dist", () => {
    expect(DEFAULT_IGNORES.length).toBeGreaterThan(0);
    expect(DEFAULT_IGNORES).toContain("**/node_modules/**");
    expect(DEFAULT_IGNORES).toContain("**/dist/**");
  });
});