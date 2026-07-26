/**
 * Workspace dependency pinning gate.
 *
 * A cross-package `@massa-ai/*` dependency may be written two ways, and only two:
 *
 * - `workspace:*` — version-independent; `publish.yml` rewrites it to `^X.Y.Z`.
 * - the exact root version — what `packages/core` uses for `@massa-ai/shared`,
 *   asserted by `verifyStaticContract` in `scripts/verify-tree-sitter-grammars.ts`.
 *
 * An exact pin left at a *previous* version is the failure mode this file exists
 * to catch. `version:sync` used to rewrite `version` fields only, so the v1.3.0
 * bump left core pinning `@massa-ai/shared: 1.2.1`. The workspace copy no longer
 * satisfied that pin, bun resolved the package from the registry, and
 * `bun install --frozen-lockfile` failed with `lockfile had changes, but lockfile
 * is frozen` — which is what made the v1.3.0 publish job fail. Had it installed,
 * the published `@massa-ai/core@1.3.0` would have declared a hard dependency on
 * `@massa-ai/shared@1.2.1`, violating ARV-R7.
 *
 * Spec: .specs/features/auto-release-versioning/spec.md (amendment A2)
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = new URL("../..", import.meta.url).pathname;
const WORKSPACE_ROOTS = ["packages", "apps"] as const;
const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

interface Manifest {
  relPath: string;
  name?: string;
  [field: string]: unknown;
}

function readManifests(): Manifest[] {
  const manifests: Manifest[] = [];
  for (const root of WORKSPACE_ROOTS) {
    for (const dir of readdirSync(join(REPO_ROOT, root))) {
      const relPath = `${root}/${dir}/package.json`;
      let raw: string;
      try {
        raw = readFileSync(join(REPO_ROOT, relPath), "utf8");
      } catch {
        continue; // a workspace dir without a manifest (e.g. plugin bundles)
      }
      manifests.push({ ...JSON.parse(raw), relPath });
    }
  }
  return manifests;
}

describe("workspace dependency pinning", () => {
  const manifests = readManifests();
  const rootVersion: string = JSON.parse(
    readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
  ).version;

  test("discovers every workspace manifest", () => {
    // Guards the test itself: a silent discovery failure would make the
    // assertions below pass vacuously.
    expect(manifests.length).toBeGreaterThanOrEqual(6);
    expect(manifests.map((m) => m.name)).toContain("@massa-ai/core");
    expect(manifests.map((m) => m.name)).toContain("@massa-ai/shared");
  });

  test("every cross-package dependency is workspace:* or the current root version", () => {
    const offenders: string[] = [];
    const checked: string[] = [];

    for (const manifest of manifests) {
      for (const field of DEP_FIELDS) {
        const deps = manifest[field];
        if (!deps || typeof deps !== "object") continue;

        for (const [dep, spec] of Object.entries(deps as Record<string, string>)) {
          if (!dep.startsWith("@massa-ai/")) continue;
          checked.push(`${manifest.relPath} ${field}.${dep}`);
          if (spec !== "workspace:*" && spec !== rootVersion) {
            offenders.push(
              `${manifest.relPath} → ${field}.${dep} = "${spec}" ` +
                `(expected "workspace:*" or "${rootVersion}")`,
            );
          }
        }
      }
    }

    // Same vacuity guard: the repo has 7 cross-package edges today.
    expect(checked.length).toBeGreaterThanOrEqual(7);
    expect(offenders).toEqual([]);
  });

  test("bun.lock resolves every @massa-ai/* package to the workspace copy", () => {
    // The registry-resolution smell a drifted pin produces is a nested entry:
    //   "@massa-ai/core/@massa-ai/shared": ["@massa-ai/shared@1.2.1", ...]
    // A workspace resolution instead reads "@massa-ai/shared@workspace:...".
    // This assertion is version-agnostic, so it keeps holding across releases.
    const lock = readFileSync(join(REPO_ROOT, "bun.lock"), "utf8");
    const resolutions = [...lock.matchAll(/"(@massa-ai\/[^"]+)": \["(@massa-ai\/[^"]+)"/g)];

    expect(resolutions.length).toBeGreaterThanOrEqual(2);
    for (const [, key, resolved] of resolutions) {
      expect(resolved, `bun.lock resolves ${key} off-workspace: ${resolved}`)
        .toContain("@workspace:");
    }
  });
});
