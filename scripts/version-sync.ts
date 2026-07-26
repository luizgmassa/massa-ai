#!/usr/bin/env bun
/**
 * version-sync.ts
 * Syncs all package/app versions to match the root package.json version.
 * Usage: bun run version:sync
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface SyncedPackage {
  path: string;
  version: string | null;
  skipped: boolean;
  /** Cross-package `@massa-ai/*` dependency specs realigned to the root version. */
  repinned?: string[];
}

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/**
 * Realign every pinned cross-package `@massa-ai/*` dependency to `version`.
 *
 * A spec of `workspace:*` is already version-independent and is left alone —
 * `publish.yml` rewrites those to `^X.Y.Z` at publish time. An *exact* pin is
 * not: `packages/core` deliberately pins `@massa-ai/shared` to the root version
 * (asserted by `verify-tree-sitter-grammars.ts`), and bumping `version` fields
 * without moving that pin leaves it naming the previous release. The workspace
 * copy then no longer satisfies it, so bun resolves the dependency from the
 * registry, `bun install --frozen-lockfile` fails with `lockfile had changes,
 * but lockfile is frozen`, and the published manifest would depend on the old
 * version. That is exactly how the v1.3.0 publish broke.
 *
 * Mutates `pkg` in place and returns the dependency keys it changed.
 */
export function repinWorkspaceDependencies(
  pkg: Record<string, unknown>,
  version: string,
): string[] {
  const repinned: string[] = [];
  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object") continue;

    for (const [dep, spec] of Object.entries(deps as Record<string, string>)) {
      if (!dep.startsWith("@massa-ai/")) continue;
      if (typeof spec !== "string" || spec.startsWith("workspace:")) continue;
      if (spec === version) continue;
      (deps as Record<string, string>)[dep] = version;
      repinned.push(`${field}.${dep}`);
    }
  }
  return repinned;
}

/**
 * Host plugin manifests that carry a `version` but live in a dotdir, so the
 * `packages/*` + `apps/*` package.json discovery below cannot reach them. Both
 * are public compatibility surfaces (a marketplace shows the manifest version),
 * so they must not drift from the root version.
 */
const EXTRA_VERSIONED_MANIFESTS = [
  "apps/claude-plugin/.claude-plugin/plugin.json",
  "apps/codex-plugin/.codex-plugin/plugin.json",
  "apps/cursor-plugin/.cursor-plugin/plugin.json",
];

/**
 * Sync every package/app version under `rootDir` to the root package.json
 * version. Returns one entry per discovered package.json so callers (tests)
 * can assert which files changed without parsing console output.
 */
export function syncVersions(rootDir: string): SyncedPackage[] {
  const root = rootDir;
  const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const version: string = rootPkg.version;

  const packageDirs = join(root, "packages");
  const appsDirs = join(root, "apps");
  const targets: string[] = [];
  try {
    targets.push(
      ...readdirSync(packageDirs).map((d) => join(packageDirs, d, "package.json")),
    );
  } catch {
    // no packages dir
  }
  try {
    targets.push(
      ...readdirSync(appsDirs).map((d) => join(appsDirs, d, "package.json")),
    );
  } catch {
    // no apps dir
  }
  targets.push(...EXTRA_VERSIONED_MANIFESTS.map((rel) => join(root, rel)));

  const synced: SyncedPackage[] = [];
  for (const pkgPath of targets) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (pkg.version === undefined) {
        synced.push({ path: pkgPath, version: null, skipped: true });
        continue;
      }
      pkg.version = version;
      const repinned = repinWorkspaceDependencies(pkg, version);
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      const suffix = repinned.length > 0 ? ` (repinned ${repinned.join(", ")})` : "";
      console.log(`  ✓ ${pkgPath.replace(root + "/", "")} → ${version}${suffix}`);
      synced.push({ path: pkgPath, version, skipped: false, repinned });
    } catch {
      // skip missing/unreadable paths
      synced.push({ path: pkgPath, version: null, skipped: true });
    }
  }

  console.log(`\nAll packages synced to ${version}`);
  return synced;
}

if (import.meta.main) {
  syncVersions(join(import.meta.dir, ".."));
}
