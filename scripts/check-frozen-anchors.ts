#!/usr/bin/env bun
/**
 * check-frozen-anchors — every needle anchor still resolves to exactly one place.
 *
 * ## What this is for
 *
 * PR-B rewrites `services/search/`. PR-A content-anchored all 14 needles and
 * removed every `filePath`, so a *move* is invisible to the fixture — but 4 of
 * the 14 anchors are code *inside* files PR-B rewrites (3 in `rlm-fusion.ts`,
 * 1 in `rlm-search.ts`). Moving those lines between files is safe. Reflowing,
 * reformatting or editing them is a hard gate failure, and the failure only
 * surfaces at `bench:needles:gate`, which needs a local Ollama and takes
 * minutes. This runs the same check in well under a second, so it can go on
 * every commit of the refactor instead of once at the end.
 *
 * ## Why it does not implement the check
 *
 * `benchmarks/needles/resolve.ts` already resolves anchors and already treats
 * zero matches and two-or-more matches as hard failures — that is SEN-04's
 * AC-8/AC-9. This imports that module and adds nothing but argv, output and an
 * exit code. A second implementation is the failure mode this repository keeps
 * paying for: two runners, two writers, two copies of one predicate that drift
 * until the cheap one says green and the real one says red. The whole point of
 * a pre-flight gate is that it cannot disagree with the gate it stands in for.
 *
 * ## Why the anchors are read, never listed
 *
 * `resolve.ts` scans every `.ts`/`.tsx` under the repo root. A file that quotes
 * an anchor verbatim *is* a second occurrence of it, so a checker carrying its
 * own hardcoded copy of the four strings would make all four ambiguous and fail
 * on its own existence. Reading them from the fixture is not merely tidier: it
 * is the only version that can run. The same rule binds this file's test — it
 * uses synthetic anchors throughout and never quotes a real one.
 *
 * Checking all 14 rather than PR-B's 4 is free, and the 4 are not special to
 * the fixture — they are just the ones this PR can break.
 *
 * Usage:
 *   bun scripts/check-frozen-anchors.ts [--fixture <path>] [--root <dir>] [--json]
 *
 * Exit codes:
 *   0  every needle resolved to exactly one location
 *   1  a needle failed to resolve — stale, ambiguous, or span out of range
 *   2  usage error, or the fixture could not be read
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  NeedleResolutionError,
  resolveNeedles,
  type NeedleExpected,
} from "../benchmarks/needles/resolve.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");
const DEFAULT_FIXTURE = "benchmarks/needles/fixtures/massa-ai.json";

interface Needle {
  id: string;
  expected: NeedleExpected;
}

interface Dataset {
  needles: Needle[];
  scoring?: { staleNeedles?: string[] };
}

export interface AnchorReport {
  needleId: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  /** A grandfathered positional target, which is not anchor-protected. */
  positional: boolean;
}

export function loadDataset(fixturePath: string): Dataset {
  const parsed = JSON.parse(readFileSync(fixturePath, "utf8")) as Dataset;
  if (!Array.isArray(parsed.needles)) {
    throw new Error(`${fixturePath}: no "needles" array`);
  }
  return parsed;
}

/**
 * Resolve every needle, or throw the first `NeedleResolutionError`.
 *
 * Deliberately not caught here: the caller decides how a failure is presented,
 * and the error message `resolve.ts` builds already names the needle, the
 * anchor and every location it matched.
 */
export function checkAnchors(dataset: Dataset, repoRoot: string): AnchorReport[] {
  return resolveNeedles(dataset.needles, repoRoot, {
    staleNeedles: dataset.scoring?.staleNeedles,
  }).map(({ needle, resolved, positional }) => ({
    needleId: needle.id,
    filePath: resolved.filePath,
    lineStart: resolved.lineStart,
    lineEnd: resolved.lineEnd,
    positional,
  }));
}

function main(argv: string[]): number {
  const json = argv.includes("--json");
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    if (i < 0) return undefined;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
    return value;
  };

  let root: string;
  let fixturePath: string;
  try {
    root = resolve(flag("--root") ?? REPO_ROOT);
    fixturePath = resolve(flag("--fixture") ?? resolve(REPO_ROOT, DEFAULT_FIXTURE));
  } catch (error) {
    console.error(`usage: bun scripts/check-frozen-anchors.ts [--fixture <path>] [--root <dir>] [--json]`);
    console.error(String(error instanceof Error ? error.message : error));
    return 2;
  }

  let dataset: Dataset;
  try {
    dataset = loadDataset(fixturePath);
  } catch (error) {
    console.error(`cannot read fixture ${fixturePath}: ${error instanceof Error ? error.message : error}`);
    return 2;
  }

  let reports: AnchorReport[];
  try {
    reports = checkAnchors(dataset, root);
  } catch (error) {
    if (error instanceof NeedleResolutionError) {
      // stderr, and the resolver's own message: it already names the needle,
      // the anchor and every location, which is what makes the failure
      // actionable rather than just red.
      console.error(`FROZEN-ANCHOR failure [${error.code}]\n${error.message}`);
      return 1;
    }
    throw error;
  }

  if (json) {
    console.log(JSON.stringify({ fixture: fixturePath, root, reports }, null, 2));
    return 0;
  }

  const width = Math.max(...reports.map((r) => r.needleId.length));
  for (const r of reports) {
    const span = r.lineStart === r.lineEnd ? `${r.lineStart}` : `${r.lineStart}-${r.lineEnd}`;
    console.log(`  ${r.needleId.padEnd(width)}  ${r.filePath}:${span}${r.positional ? "  (positional)" : ""}`);
  }
  console.log(`\n${reports.length} anchors, each resolving to exactly one location.`);
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
