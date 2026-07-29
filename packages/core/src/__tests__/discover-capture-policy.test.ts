/**
 * `capturePolicy` reaches discovery — the second half of AD-W5-015.
 *
 * `ignore-patterns.ts` has documented the composition as "a path is indexed iff
 * `!ig.ignores(path) && applyCapturePolicy(path) !== 'Drop'`" since the policy
 * was introduced, but nothing performed the second half: `applyCapturePolicy`
 * had no production caller. `capturePolicy` was validated at config load —
 * bounds, denyUnknownFields, the lot — and then never consulted. A policy in
 * `config.json` narrowed nothing.
 *
 * The discriminating test is "a Drop rule excludes a file from discovery"; it
 * is red without the wiring, because the file is discovered anyway. The
 * default-parity test is what stops the fix from changing every existing
 * install: with no policy configured the pure module's DEFAULT_POLICY applies,
 * and its Drop set mirrors DEFAULT_IGNORES, so discovery is unchanged.
 *
 * Ordering matters and is pinned here too. The `.gitignore` merge runs FIRST
 * and the policy second, so a `Keep` rule cannot resurrect an ignored path —
 * the composition is AND, not a precedence chain.
 */

import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { config } from "@massa-ai/shared";
import { DiscoverStage } from "../services/etl/stages/discover.js";
import { _resetCapturePolicyCacheForTesting } from "../services/search/ignore-patterns.js";
import type { EtlStageContext } from "../services/etl/stage-context.js";

mock.module("../data/symbol/symbol-repository-factory.js", () => ({
  getSymbolRepository: () => ({
    getCentrality: async () => new Map<string, number>(),
    getFile: async () => null,
    upsertFile: async () => {},
  }),
}));

const ORIGINAL_POLICY = config.get("capturePolicy");
const tempDirs: string[] = [];

afterEach(async () => {
  config.set("capturePolicy", ORIGINAL_POLICY);
  _resetCapturePolicyCacheForTesting();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

afterAll(() => {
  config.set("capturePolicy", ORIGINAL_POLICY);
  _resetCapturePolicyCacheForTesting();
});

async function makeProjectDir(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discover-policy-"));
  tempDirs.push(dir);
  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(dir, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return dir;
}

function makeCtx(projectPath: string): EtlStageContext {
  return {
    projectId: "discover-policy-test",
    projectPath,
    jobId: "discover-policy-job",
    emit: () => {},
  };
}

function usePolicy(rules: Array<{ pattern: string; disposition: "Keep" | "Drop" | "MetadataOnly" }>) {
  config.set("capturePolicy", { rules, maxMatchWork: 100_000, maxIgnorePatterns: 1_024 });
  _resetCapturePolicyCacheForTesting();
}

const FIXTURE = {
  "src/keep.ts": "export const keep = 1;\n",
  "src/notes.md": "# notes\n",
  "node_modules/dep/index.ts": "export const dep = 1;\n",
};

async function discover(dir: string): Promise<string[]> {
  const found = await new DiscoverStage().run(makeCtx(dir), {});
  return found.map((f) => f.relativePath).sort();
}

describe("DiscoverStage — capture policy composition", () => {
  test("no configured policy → discovery is unchanged", async () => {
    const dir = await makeProjectDir(FIXTURE);
    expect(await discover(dir)).toEqual(["src/keep.ts", "src/notes.md"]);
  }, 30_000);

  /**
   * The discriminating case. Without the wiring `src/notes.md` is discovered
   * regardless of what the policy says, because nothing consults it.
   */
  test("a Drop rule excludes a file the ignore layer would have kept", async () => {
    const dir = await makeProjectDir(FIXTURE);
    usePolicy([
      { pattern: "**/*.md", disposition: "Drop" },
      { pattern: "**", disposition: "Keep" },
    ]);
    expect(await discover(dir)).toEqual(["src/keep.ts"]);
  }, 30_000);

  test("a catch-all Drop with narrower Keeps bounds the corpus, first match winning", async () => {
    const dir = await makeProjectDir({
      ...FIXTURE,
      "src/other/skip.ts": "export const skip = 1;\n",
    });
    usePolicy([
      { pattern: "src/keep.ts", disposition: "Keep" },
      { pattern: "**", disposition: "Drop" },
    ]);
    expect(await discover(dir)).toEqual(["src/keep.ts"]);
  }, 30_000);

  /**
   * A configured policy replaces DEFAULT_POLICY entirely, so it carries no
   * `node_modules` rule. The path stays excluded anyway — proving the
   * `.gitignore`/DEFAULT_IGNORES layer still runs, and runs first.
   */
  test("a Keep rule cannot resurrect a path the ignore layer excludes", async () => {
    const dir = await makeProjectDir(FIXTURE);
    usePolicy([{ pattern: "**", disposition: "Keep" }]);
    const found = await discover(dir);
    expect(found).not.toContain("node_modules/dep/index.ts");
    expect(found).toEqual(["src/keep.ts", "src/notes.md"]);
  }, 30_000);

  /**
   * `includeTests` has to reach both layers or it reaches neither.
   * DEFAULT_POLICY carries the same test globs DEFAULT_IGNORES does, so the
   * first version of this wiring re-dropped every test file and silently
   * neutralized the option — caught by `etl-stages-coverage.test.ts`. Pinned
   * here as well, beside the policy behaviour it belongs to.
   */
  test("includeTests survives the policy layer, not just the ignore layer", async () => {
    const dir = await makeProjectDir({ ...FIXTURE, "src/thing.test.ts": "test('x', () => {});\n" });
    const stage = new DiscoverStage();
    const without = await stage.run(makeCtx(dir), { includeTests: false });
    expect(without.map((f) => f.relativePath)).not.toContain("src/thing.test.ts");
    const withTests = await stage.run(makeCtx(dir), { includeTests: true });
    expect(withTests.map((f) => f.relativePath)).toContain("src/thing.test.ts");
  }, 30_000);

  /**
   * The escape hatch is scoped: only `Drop` rules on a known test glob are
   * stripped. A user policy dropping something unrelated keeps dropping it in
   * a test-inclusive run.
   */
  test("includeTests does not disable unrelated Drop rules", async () => {
    const dir = await makeProjectDir({ ...FIXTURE, "src/thing.test.ts": "test('x', () => {});\n" });
    usePolicy([
      { pattern: "**/*.md", disposition: "Drop" },
      { pattern: "**", disposition: "Keep" },
    ]);
    const found = (await new DiscoverStage().run(makeCtx(dir), { includeTests: true })).map(
      (f) => f.relativePath,
    );
    expect(found).toContain("src/thing.test.ts");
    expect(found).not.toContain("src/notes.md");
  }, 30_000);

  /**
   * `MetadataOnly` is a third disposition the pure module defines. Only `Drop`
   * excludes, per the documented composition — pinned so a later reading of
   * "not Keep" cannot quietly start dropping these.
   */
  test("MetadataOnly is not Drop, so the file is still discovered", async () => {
    const dir = await makeProjectDir(FIXTURE);
    usePolicy([
      { pattern: "**/*.md", disposition: "MetadataOnly" },
      { pattern: "**", disposition: "Keep" },
    ]);
    expect(await discover(dir)).toContain("src/notes.md");
  }, 30_000);
});

/**
 * The other half of bounding discovery. `security.allowedExtensions` became
 * user-settable, which reached a latent trap in how the glob was built: a
 * brace expansion with one alternative is matched literally, so a
 * single-extension allow-list discovered nothing and the run reported success
 * over an empty corpus. Measured, not hypothesised — a real bounded index
 * completed in 181 ms over 0 files.
 */
describe("DiscoverStage — extension allow-list", () => {
  const ORIGINAL_SECURITY = config.get("security");

  afterEach(() => {
    config.set("security", ORIGINAL_SECURITY);
  });

  function useExtensions(allowedExtensions: string[]) {
    config.set("security", { ...ORIGINAL_SECURITY, allowedExtensions });
  }

  test("a single-extension allow-list still discovers matching files", async () => {
    const dir = await makeProjectDir(FIXTURE);
    useExtensions([".ts"]);
    expect(await discover(dir)).toEqual(["src/keep.ts"]);
  }, 30_000);

  test("a multi-extension allow-list keeps working", async () => {
    const dir = await makeProjectDir(FIXTURE);
    useExtensions([".ts", ".md"]);
    expect(await discover(dir)).toEqual(["src/keep.ts", "src/notes.md"]);
  }, 30_000);

  test("an extension outside the list is not discovered", async () => {
    const dir = await makeProjectDir(FIXTURE);
    useExtensions([".md"]);
    expect(await discover(dir)).toEqual(["src/notes.md"]);
  }, 30_000);
});
