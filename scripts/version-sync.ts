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
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      console.log(`  ✓ ${pkgPath.replace(root + "/", "")} → ${version}`);
      synced.push({ path: pkgPath, version, skipped: false });
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
