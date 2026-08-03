/**
 * Unit tests for `services/project-identity/project-root-identity.ts` — the
 * two root-identity helpers out of `tools/index_project.ts` (PR-D, T14).
 *
 * WHAT THIS FILE PINS AND WHY THESE FOUR. Before T14 moved a line, an
 * 11-mutation measurement ran the union of every suite that reaches the
 * helpers; the four shapes below all SURVIVED it, because the pre-existing
 * cases pass only absolute, already-normalized fixture paths and assert the
 * rejection by the substring "already indexes canonical root" alone:
 *
 *  - the rejection message's OPERAND ORDER (stored root first, requested root
 *    second) — swapping them keeps the substring and changes which root the
 *    user is told to go verify;
 *  - `path.resolve` on the REQUEST path before canonicalize sees it;
 *  - `path.resolve` on the STORED path before canonicalize sees it;
 *  - `path.resolve` inside the fallback when canonicalize throws.
 *
 * The suites are complementary, not duplicates: `index-project-identity.
 * test.ts` characterizes the symlink/realpath behavior against a real
 * filesystem; this file pins the pure path algebra with injected canonicalize
 * doubles and needs no filesystem at all. The handler-side WIRING of these
 * helpers is pinned by `index-project-tool.test.ts`'s wiring describe, not
 * here — a method test is not a call-site test.
 */
import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  assertProjectRootReuse,
  canonicalizeProjectRoot,
} from "../services/project-identity/project-root-identity.js";

describe("project-root-identity", () => {
  test("the rejection names the STORED root first and the requested root second, verbatim", async () => {
    await expect(
      assertProjectRootReuse({
        projectId: "op-order",
        canonicalProjectPath: "/requested/root",
        storedProjectPath: "/stored/root",
        forceReindex: false,
        canonicalize: async (p) => p,
      }),
    ).rejects.toThrow(
      'Project ID "op-order" already indexes canonical root ' +
        '"/stored/root", not "/requested/root"; ' +
        "use forceReindex only after verifying ownership of the existing project",
    );
  });

  test("a relative request path is resolved against cwd before canonicalize sees it", async () => {
    const received: string[] = [];
    const result = await canonicalizeProjectRoot("some-relative-dir", async (p) => {
      received.push(p);
      return p;
    });
    expect(received).toEqual([path.resolve("some-relative-dir")]);
    expect(result).toBe(path.resolve("some-relative-dir"));
    expect(path.isAbsolute(result)).toBe(true);
  });

  test("the stored path is resolved before canonicalize receives it", async () => {
    const received: string[] = [];
    await expect(
      assertProjectRootReuse({
        projectId: "resolve-first",
        canonicalProjectPath: "/a/c",
        storedProjectPath: "/a/b/../c",
        forceReindex: false,
        canonicalize: async (p) => {
          received.push(p);
          return p;
        },
      }),
    ).resolves.toBeUndefined();
    expect(received).toEqual(["/a/c"]);
  });

  test("the fallback resolves a non-normalized stored path when canonicalize throws", async () => {
    await expect(
      assertProjectRootReuse({
        projectId: "fallback-resolve",
        canonicalProjectPath: "/x/z",
        storedProjectPath: "/x/y/../z",
        forceReindex: false,
        canonicalize: async () => {
          throw new Error("ENOENT");
        },
      }),
    ).resolves.toBeUndefined();
  });
});
