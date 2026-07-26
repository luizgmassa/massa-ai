#!/usr/bin/env bun
/**
 * release-version.ts
 *
 * Derives the next release version from the `[Unreleased]` section of CHANGELOG.md,
 * applies it across the workspace, and promotes the changelog section.
 *
 * Bump rules (spec ARV-R1):
 *   ### Added | Changed | Removed | Deprecated  -> minor
 *   ### Fixed | Security                        -> patch
 *   nothing with content                        -> null (no release)
 *
 * The major component is never incremented (ARV-R2).
 *
 * Usage:
 *   bun scripts/release-version.ts --dry-run   # derive only, write nothing
 *   bun scripts/release-version.ts             # derive and write
 *
 * Emits a single JSON object on stdout; all diagnostics go to stderr, so callers can
 * pipe stdout straight into `jq` from a workflow step.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { syncVersions } from "./version-sync";

export type Bump = "minor" | "patch" | null;

/** Headings that mean "feature / improvement / refactor" — bump Y. */
const MINOR_HEADINGS = new Set(["added", "changed", "removed", "deprecated"]);
/** Headings that mean "bug / minor stuff" — bump Z. */
const PATCH_HEADINGS = new Set(["fixed", "security"]);

const UNRELEASED_RE = /^##\s+\[Unreleased\]/i;
const ANY_SECTION_RE = /^##\s+\[/;

/** UTC `YYYY-MM-DD`, matching the existing `## [1.2.1] - 2026-07-24` format. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Index of the `## [Unreleased]` line and of the next `## [` line (exclusive). */
function unreleasedBounds(lines: string[]): { start: number; end: number } {
  const start = lines.findIndex((line) => UNRELEASED_RE.test(line));
  if (start === -1) {
    throw new Error(
      "release-version: CHANGELOG.md has no `## [Unreleased]` heading — refusing to guess a version",
    );
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (ANY_SECTION_RE.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/**
 * Slice CHANGELOG.md from `## [Unreleased]` (exclusive) to the next `## [` (exclusive).
 * Legacy `## [Wave N]` blocks sit below `## [1.2.1]` and are therefore never read.
 */
export function extractUnreleased(changelog: string): string {
  const lines = changelog.split("\n");
  const { start, end } = unreleasedBounds(lines);
  return lines.slice(start + 1, end).join("\n");
}

/**
 * `### Heading` names (lowercased, deduped) that hold at least one non-blank content
 * line. An empty heading must not force a bump, so it is dropped here.
 */
export function unreleasedHeadings(section: string): string[] {
  const found = new Set<string>();
  let current: string | null = null;
  let hasContent = false;

  const flush = () => {
    if (current !== null && hasContent) found.add(current);
  };

  for (const line of section.split("\n")) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      current = heading[1].toLowerCase();
      hasContent = false;
      continue;
    }
    if (current !== null && line.trim() !== "") hasContent = true;
  }
  flush();

  return [...found];
}

/** minor-class wins over patch-class; no qualifying heading yields null. */
export function decideBump(headings: string[]): Bump {
  if (headings.some((h) => MINOR_HEADINGS.has(h))) return "minor";
  if (headings.some((h) => PATCH_HEADINGS.has(h))) return "patch";
  return null;
}

/** Never touches the major component (ARV-R2). Throws on a non-semver input. */
export function nextVersion(current: string, bump: Exclude<Bump, null>): string {
  const parsed = /^(\d+)\.(\d+)\.(\d+)$/.exec(current.trim());
  if (!parsed) {
    throw new Error(
      `release-version: root version is not X.Y.Z semver: ${JSON.stringify(current)}`,
    );
  }
  const [major, minor, patch] = parsed.slice(1, 4).map(Number);
  return bump === "minor"
    ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`;
}

/** The `[Unreleased]` body with surrounding blank lines stripped — the release notes. */
export function unreleasedNotes(changelog: string): string {
  return extractUnreleased(changelog).replace(/^\n+/, "").replace(/\n+$/, "");
}

/**
 * Insert a fresh empty `## [Unreleased]` and promote the previous body under
 * `## [version] - date`, leaving every other section untouched.
 */
export function promoteChangelog(
  changelog: string,
  version: string,
  isoDate: string,
): string {
  const lines = changelog.split("\n");
  const { start, end } = unreleasedBounds(lines);
  const body = lines
    .slice(start + 1, end)
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");

  return [
    ...lines.slice(0, start),
    "## [Unreleased]",
    "",
    `## [${version}] - ${isoDate}`,
    "",
    body,
    "",
    ...lines.slice(end),
  ].join("\n");
}

export interface ReleaseDerivation {
  /** Root version before the bump. */
  current: string;
  /** Root version after the bump, or null when no release is warranted. */
  next: string | null;
  bump: Bump;
  /** Promoted changelog body — the GitHub Release notes. Empty when bump is null. */
  notes: string;
}

/**
 * Derive and (unless `dryRun`) apply the release: root version, workspace sync,
 * changelog promotion.
 */
export function deriveRelease(
  rootDir: string,
  opts: { dryRun?: boolean; today?: string } = {},
): ReleaseDerivation {
  const rootPkgPath = join(rootDir, "package.json");
  const changelogPath = join(rootDir, "CHANGELOG.md");

  const rootPkgRaw = readFileSync(rootPkgPath, "utf8");
  const current: string = JSON.parse(rootPkgRaw).version;
  const changelog = readFileSync(changelogPath, "utf8");

  const bump = decideBump(unreleasedHeadings(extractUnreleased(changelog)));
  if (bump === null) {
    return { current, next: null, bump: null, notes: "" };
  }

  const next = nextVersion(current, bump);
  const notes = unreleasedNotes(changelog);
  if (opts.dryRun) return { current, next, bump, notes };

  // Replace only the first `"version": "..."` — the root manifest's own field — so the
  // diff stays one line regardless of how the file happens to be formatted.
  writeFileSync(
    rootPkgPath,
    rootPkgRaw.replace(/("version"\s*:\s*")[^"]*(")/, `$1${next}$2`),
  );

  // syncVersions logs progress on stdout; stdout here is reserved for the JSON result.
  const originalLog = console.log;
  console.log = (...args: unknown[]) => console.error(...args);
  try {
    syncVersions(rootDir);
  } finally {
    console.log = originalLog;
  }

  writeFileSync(changelogPath, promoteChangelog(changelog, next, opts.today ?? utcToday()));

  return { current, next, bump, notes };
}

if (import.meta.main) {
  const rootDir = join(import.meta.dir, "..");
  try {
    const result = deriveRelease(rootDir, {
      dryRun: process.argv.includes("--dry-run"),
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}
