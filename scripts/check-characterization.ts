#!/usr/bin/env bun
/**
 * check-characterization — the three behaviors with exactly one test each.
 *
 * ## Why these three
 *
 * `extractPreview`, `calculateAvgScore` and `_indexProjectInternal` are each
 * pinned behaviorally in exactly one `describe` block repo-wide. Everywhere
 * else they appear, they are mocked or monkey-patched:
 * `contextual-search-rlm-coverage.test.ts` replaces the impls and asserts the
 * facade *delegates* to them, and `concurrent-indexing.test.ts` assigns over
 * `_indexProjectInternal` to drive the lock. A delegation test passes just as
 * happily against an implementation whose body has been deleted, so if the one
 * behavioral block is weakened the loss is invisible: the suite stays green,
 * the count stays plausible, and nothing in PR-B's diff looks wrong.
 *
 * ## Why name presence is not the check
 *
 * A `describe("extractPreview", …)` whose body is reduced to
 * `expect(true).toBe(true)` keeps its name and every bit of its apparent
 * coverage. So the floor is the number of *non-trivial assertions* inside the
 * block. The floors below are measured, not chosen, and are exact: adding
 * assertions is fine, removing one is a failure.
 *
 * ## Why blocks are found by symbol, not by path
 *
 * PR-B renames the files these blocks live in. A guard pinned to
 * `rlm-indexing.test.ts` would go red on the rename itself and would then be
 * "fixed" by editing the guard — which is the same motion as weakening it, and
 * indistinguishable from it in a diff. Locating the block by the symbol it
 * characterizes survives a rename and a move, and fails only on the thing that
 * matters. That is the same trade PR-A made when it content-anchored the
 * needles fixture.
 *
 * Usage:
 *   bun scripts/check-characterization.ts [--root <dir>] [--json]
 *
 * Exit codes:
 *   0  every guarded behavior has exactly one behavioral block, at or above floor
 *   1  a block is missing, duplicated, or below floor
 *   2  usage error
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const TEST_DIR = "packages/core/src/__tests__";

/**
 * Assertions that can actually fail on a value. `expect(...)` alone is not
 * counted: `expect(x)` with no matcher asserts nothing, and counting it would
 * let a hollowed block reach any floor.
 */
const ASSERTION =
  /\.(toBe|toEqual|toStrictEqual|toThrow|toThrowError|toContain|toContainEqual|toHaveLength|toBeCloseTo|toBeNull|toBeTruthy|toBeFalsy|toBeUndefined|toBeDefined|toBeGreaterThan|toBeGreaterThanOrEqual|toBeLessThan|toBeLessThanOrEqual|toHaveBeenCalled|toHaveBeenCalledWith|toHaveBeenCalledTimes|toMatchObject|toHaveProperty|toBeInstanceOf)\b/g;

/** A block that replaces the subject and checks it was called, not what it does. */
const DELEGATION = /toHaveBeenCalled|Mock\b/;

export interface Guard {
  /** Symbol whose behavior is pinned. Also the substring matched in the block name. */
  symbol: string;
  /** Measured non-trivial assertions in the behavioral block. Exact, not padded. */
  minAssertions: number;
  /** Measured `test(` cases in the behavioral block. */
  minTests: number;
}

/**
 * Floors measured at `0129207`. Each is the observed count, so any removal
 * trips the guard.
 */
export const GUARDS: Guard[] = [
  { symbol: "extractPreview", minAssertions: 4, minTests: 4 },
  { symbol: "calculateAvgScore", minAssertions: 4, minTests: 3 },
  { symbol: "_indexProjectInternal", minAssertions: 8, minTests: 3 },
];

export interface Block {
  file: string;
  name: string;
  startLine: number;
  text: string;
  assertions: number;
  tests: number;
  delegation: boolean;
}

/**
 * Every `describe` block in `source` whose title contains `symbol`.
 *
 * Bounded by indentation, never by matching braces. A brace-matched draft of
 * the sibling matrix script read `options: SearchOptions = {}` in a parameter
 * list as an open/close pair and closed a 455-line body before it began; the
 * same failure here would report a full block as empty and a hollowed one as
 * fine. A block runs to the next `describe(` at the same or lower indent.
 */
export function findBlocks(file: string, source: string, symbol: string): Block[] {
  const lines = source.split("\n");
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.includes("describe(") || !line.includes(symbol)) continue;
    const indent = line.match(/^\s*/)![0].length;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j]!;
      if (!candidate.trim() || !candidate.includes("describe(")) continue;
      if (candidate.match(/^\s*/)![0].length <= indent) {
        end = j;
        break;
      }
    }
    const text = lines.slice(i, end).join("\n");
    blocks.push({
      file,
      name: line.trim(),
      startLine: i + 1,
      text,
      assertions: (text.match(ASSERTION) ?? []).length,
      tests: (text.match(/\b(?:test|it)\(/g) ?? []).length,
      delegation: DELEGATION.test(text),
    });
  }
  return blocks;
}

export function testFiles(root: string): string[] {
  return execFileSync("git", ["ls-files", TEST_DIR], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((f) => f.endsWith(".test.ts"));
}

export interface GuardResult {
  symbol: string;
  behavioral: Block[];
  delegation: Block[];
  failures: string[];
}

export function checkGuards(root: string, guards: Guard[] = GUARDS, files = testFiles(root)): GuardResult[] {
  const sources = files.map((f) => {
    try {
      return [f, readFileSync(resolve(root, f), "utf8")] as const;
    } catch {
      return [f, ""] as const;
    }
  });

  return guards.map((guard) => {
    const found = sources.flatMap(([file, source]) => findBlocks(file, source, guard.symbol));
    const behavioral = found.filter((b) => !b.delegation);
    const delegation = found.filter((b) => b.delegation);
    const failures: string[] = [];

    if (behavioral.length === 0) {
      failures.push(
        `${guard.symbol}: no behavioral describe block found. Every remaining reference mocks or ` +
          `monkey-patches it, which cannot fail on a behavior change.`,
      );
    } else if (behavioral.length > 1) {
      failures.push(
        `${guard.symbol}: ${behavioral.length} behavioral blocks — it is no longer a single point of ` +
          `truth, so this floor no longer describes the protection.\n` +
          behavioral.map((b) => `    ${b.file}:${b.startLine}`).join("\n"),
      );
    } else {
      const block = behavioral[0]!;
      if (block.assertions < guard.minAssertions) {
        failures.push(
          `${guard.symbol}: ${block.assertions} non-trivial assertions at ${block.file}:${block.startLine}, ` +
            `floor is ${guard.minAssertions}. The block still has its name; it has stopped having its teeth.`,
        );
      }
      if (block.tests < guard.minTests) {
        failures.push(
          `${guard.symbol}: ${block.tests} test cases at ${block.file}:${block.startLine}, floor is ${guard.minTests}.`,
        );
      }
    }
    return { symbol: guard.symbol, behavioral, delegation, failures };
  });
}

function main(argv: string[]): number {
  const json = argv.includes("--json");
  const rootIndex = argv.indexOf("--root");
  if (rootIndex >= 0 && (!argv[rootIndex + 1] || argv[rootIndex + 1]!.startsWith("--"))) {
    console.error("usage: bun scripts/check-characterization.ts [--root <dir>] [--json]");
    return 2;
  }
  const root = resolve(rootIndex >= 0 ? argv[rootIndex + 1]! : REPO_ROOT);

  const results = checkGuards(root);
  if (json) {
    // Block text is dropped: it is the whole file body and would bury the verdict.
    const brief = (b: Block): Omit<Block, "text"> => ({
      file: b.file,
      name: b.name,
      startLine: b.startLine,
      assertions: b.assertions,
      tests: b.tests,
      delegation: b.delegation,
    });
    console.log(
      JSON.stringify(
        results.map((r) => ({ ...r, behavioral: r.behavioral.map(brief), delegation: r.delegation.map(brief) })),
        null,
        2,
      ),
    );
    return results.some((r) => r.failures.length > 0) ? 1 : 0;
  }

  for (const r of results) {
    const block = r.behavioral[0];
    const where = block ? `${block.file}:${block.startLine}` : "(none)";
    console.log(`  ${r.symbol.padEnd(23)} ${String(block?.assertions ?? 0).padStart(3)} assertions · ${String(block?.tests ?? 0).padStart(2)} tests  ${where}`);
    if (r.delegation.length) {
      for (const d of r.delegation) console.log(`      delegation-only: ${d.file}:${d.startLine}`);
    }
  }

  const failures = results.flatMap((r) => r.failures);
  if (failures.length === 0) {
    console.log(`\n${results.length} guarded behaviors, each with exactly one behavioral block at or above floor.`);
    return 0;
  }
  console.error(`\nCHARACTERIZATION guard failure:`);
  for (const f of failures) console.error(`  ${f}`);
  return 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
