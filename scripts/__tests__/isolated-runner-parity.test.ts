/**
 * DEBT-04 — the three isolated-test runners must stay one implementation.
 *
 * `packages/core`, `apps/tools-api` and `apps/mcp-client` each had their own
 * 236 / 124 / 141-line copy. They had already drifted: the shared group was
 * called "mock-free" in two and "shared" in the third, the summary line was
 * worded three ways, and core's classifier had grown five rules the others never
 * got. The duplication is the defect — a fix to signal forwarding or exit-code
 * handling had to be made three times or it silently wasn't made at all.
 *
 * These assertions are what stops a fourth copy appearing: each wrapper must
 * resolve the same shared module, and none may re-implement the mechanics it
 * owns.
 */

import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");
const SHARED_MODULE = path.join(REPO_ROOT, "scripts", "lib", "run-tests-isolated.ts");

const WRAPPERS = [
  path.join(REPO_ROOT, "packages", "core", "scripts", "run-tests-isolated.ts"),
  path.join(REPO_ROOT, "apps", "tools-api", "scripts", "run-tests-isolated.ts"),
  path.join(REPO_ROOT, "apps", "mcp-client", "scripts", "run-tests-isolated.ts"),
];

/** Resolve a wrapper's `run-tests-isolated` import to an absolute path. */
function resolveSharedImport(wrapper: string): string | undefined {
  const source = fs.readFileSync(wrapper, "utf8");
  const match = source.match(/from\s+"([^"]*run-tests-isolated\.js)"/);
  if (!match) return undefined;
  // The wrappers are ESM/NodeNext, so the specifier ends .js while the file on
  // disk is .ts.
  return path.resolve(path.dirname(wrapper), match[1]!).replace(/\.js$/, ".ts");
}

describe("the three isolated-test runners share one implementation", () => {
  test("the shared module exists and exports the runner entry point", () => {
    expect(fs.existsSync(SHARED_MODULE)).toBe(true);
    const source = fs.readFileSync(SHARED_MODULE, "utf8");
    expect(source).toContain("export async function runIsolatedTests");
    expect(source).toContain("export async function findTestFiles");
  });

  test("every wrapper resolves to that exact module", () => {
    for (const wrapper of WRAPPERS) {
      const resolved = resolveSharedImport(wrapper);
      expect(resolved, `${path.relative(REPO_ROOT, wrapper)} imports no shared runner`).toBe(
        SHARED_MODULE,
      );
      expect(fs.existsSync(resolved!)).toBe(true);
    }
  });

  test("no wrapper re-implements the mechanics the shared module owns", () => {
    // Spawning, signal forwarding and exit-code handling are exactly the parts
    // that were duplicated three ways. A wrapper containing them again means the
    // extraction has been partially reverted.
    for (const wrapper of WRAPPERS) {
      const source = fs.readFileSync(wrapper, "utf8");
      const relative = path.relative(REPO_ROOT, wrapper);
      expect(source, `${relative} spawns its own child process`).not.toMatch(/\bspawn\s*\(/);
      expect(source, `${relative} installs its own signal handlers`).not.toMatch(/SIGTERM/);
      expect(source, `${relative} sets its own exit code`).not.toMatch(/process\.exitCode/);
    }
  });

  test("each wrapper still supplies its own isolation predicate", () => {
    // The point of the split: mechanics shared, classification local. A wrapper
    // that stopped declaring one would silently inherit the wrong rules.
    for (const wrapper of WRAPPERS) {
      const source = fs.readFileSync(wrapper, "utf8");
      expect(source, `${path.relative(REPO_ROOT, wrapper)} declares no isolationReason`).toContain(
        "isolationReason",
      );
    }
  });

  test("core keeps the selection flags only it supports", () => {
    const source = fs.readFileSync(WRAPPERS[0]!, "utf8");
    expect(source).toContain("--unit");
    expect(source).toContain("--e2e");
    expect(source).toContain("--filter=");
    // The e2e cleanup finalizer is order-dependent: it verifies teardown, so it
    // is only meaningful once every other e2e suite has run.
    expect(source).toContain("17.cleanup-verify.test.ts");
  });
});
