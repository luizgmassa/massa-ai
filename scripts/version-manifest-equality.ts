#!/usr/bin/env bun
/**
 * version-manifest-equality.ts (PDO-24)
 *
 * `version-sync.ts`'s `syncVersions` targets `packages/*` + `apps/*` package.json
 * files plus a hardcoded `EXTRA_VERSIONED_MANIFESTS` list for dotdir host-plugin
 * manifests. That hardcoded list is exactly how `apps/cursor-plugin/.cursor-plugin/
 * plugin.json` drifted to `1.0.0` against a root of `1.4.0`: `syncVersions` treats an
 * unlisted path the same as a missing one, so a future manifest nobody remembers to
 * register is silent drift forever, not a one-time bug.
 *
 * This module is independent of that list. It DISCOVERS every versioned manifest by
 * globbing the actual tree (`package.json`, `packages/*<``/package.json`,
 * `apps/*``/package.json`, and `apps/*``/.*-plugin/plugin.json`) and asserts each one's
 * `version` equals the root's — so a manifest nobody wired into `syncVersions` still
 * gets caught, instead of only re-verifying a list that could suffer the same omission
 * again.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

export interface VersionMismatch {
  path: string;
  version: unknown;
}

interface Manifest {
  version?: unknown;
}

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Every manifest this repo's release chain must keep version-aligned, discovered by
 * walking the tree rather than reading a maintained list. Returns absolute paths.
 */
export function discoverVersionedManifests(root: string): string[] {
  const found: string[] = [];

  const rootPkg = join(root, "package.json");
  if (existsSync(rootPkg)) found.push(rootPkg);

  for (const group of ["packages", "apps"] as const) {
    const groupDir = join(root, group);
    for (const name of subdirs(groupDir)) {
      const memberDir = join(groupDir, name);
      const pkgJson = join(memberDir, "package.json");
      if (existsSync(pkgJson)) found.push(pkgJson);

      // Dotdir host-plugin manifests (e.g. .claude-plugin/plugin.json) — a plain
      // packages/*|apps/* package.json walk cannot reach a dotdir, and the manifest
      // name is host-specific, so this globs any `.*-plugin/plugin.json` under an
      // apps/* member rather than naming each host.
      if (group === "apps") {
        for (const sub of subdirs(memberDir)) {
          if (!sub.startsWith(".") || !sub.endsWith("-plugin")) continue;
          const dotManifest = join(memberDir, sub, "plugin.json");
          if (existsSync(dotManifest)) found.push(dotManifest);
        }
      }
    }
  }

  return found.sort();
}

/**
 * Discovers every versioned manifest under `root` and returns the ones whose
 * `version` does not equal the root `package.json`'s version. A manifest with no
 * `version` field at all is not this gate's concern (matches `syncVersions`'
 * skip-on-no-version behavior) — empty array means every manifest is aligned.
 */
export function findVersionMismatches(root: string): VersionMismatch[] {
  const rootVersion = readManifest(join(root, "package.json")).version;
  const mismatches: VersionMismatch[] = [];

  for (const manifestPath of discoverVersionedManifests(root)) {
    if (manifestPath === join(root, "package.json")) continue;
    const manifest = readManifest(manifestPath);
    if (manifest.version === undefined) continue;
    if (manifest.version !== rootVersion) {
      mismatches.push({ path: manifestPath, version: manifest.version });
    }
  }

  return mismatches;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const mismatches = findVersionMismatches(root);
  const manifests = discoverVersionedManifests(root);
  console.log(`Checked ${manifests.length} versioned manifest(s) against the root version.`);
  if (mismatches.length > 0) {
    console.error(`${mismatches.length} manifest(s) do not match the root version:`);
    for (const m of mismatches) {
      console.error(`  ${m.path} -> ${JSON.stringify(m.version)}`);
    }
    process.exitCode = 1;
  } else {
    console.log("All manifests aligned.");
  }
}
