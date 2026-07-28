/**
 * Coverage gate (DEBT-02).
 *
 * `bunfig.toml` used to set `coverage = true`, so every `bun test` — including a
 * single-file run in a debug loop — paid to instrument and report coverage, and
 * nothing ever failed on the result. That is the worst of both: the cost of a
 * gate without the gate. Coverage is now off by default and enforced here.
 *
 * ## The floor and the exclusions live here, on purpose
 *
 * The 90% line floor and the nine exclusions below were established by the
 * `coverage-90pct` feature and were recorded only in `.specs/HANDOFF.md` — a file
 * whose entire purpose is to be rewritten at the start of the next feature.
 * A gate pinned to prose in a scratch file is a gate that silently loses its
 * definition. They are executable data here instead, each with the justification
 * that earned it, following the same reasoning that moved the installer's API-key
 * contract into `scripts/lib/installer-api-key.sh`.
 *
 * ## Why this reruns the suites
 *
 * Bun emits coverage only for files loaded by the run that measured it, and three
 * packages cannot run a plain `bun test` at all (their suites cross-contaminate
 * module and process state — see `scripts/lib/run-tests-isolated.ts`). Each unit
 * below therefore runs through whatever invocation is correct for that package,
 * with `--coverage` forwarded, and the resulting lcov files are merged here.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..");

/** Minimum line coverage, in percent, for every non-excluded source file. */
export const LINE_COVERAGE_FLOOR = 90;

/**
 * Files permitted below the floor. Each entry is a repo-relative path plus the
 * reason it cannot be meaningfully covered by unit tests. Adding an entry is a
 * deliberate act that shows up in review; it is not a threshold nudge.
 *
 * Carried forward verbatim from the `coverage-90pct` validation report.
 */
export const EXCLUSIONS: ReadonlyArray<{ file: string; reason: string }> = [
  {
    file: "packages/core/src/services/structural/query-pack-captures.ts",
    reason: "tree-sitter native parser internals — exercised through the grammar verifier, not unit tests",
  },
  {
    file: "packages/core/src/services/structural/grammar-loaders.ts",
    reason: "tree-sitter native parser internals — platform-gated native module loading",
  },
  {
    file: "packages/core/src/services/structural/native-node-helpers.ts",
    reason: "tree-sitter native parser internals — thin wrappers over the native addon",
  },
  {
    file: "packages/core/src/services/embeddings/providers/local-transformers.ts",
    reason: "ONNX runtime is platform-gated; the provider cannot load in the default test environment",
  },
  {
    file: "packages/core/src/services/embeddings/index.ts",
    reason: "barrel re-export — no logic to cover",
  },
  {
    file: "packages/core/src/services/health/local-health-checker.ts",
    reason: "e2e-gated — requires a live API server, covered by the e2e suite instead",
  },
  {
    file: "packages/core/src/services/query/prisma-client.ts",
    reason: "connection singleton and env boilerplate",
  },
  {
    file: "packages/core/src/__tests__/e2e/_helpers.ts",
    reason: "test infrastructure, not product source",
  },
  {
    file: "packages/core/src/__tests__/e2e/qwen-fixture.ts",
    reason: "test fixture, not product source",
  },
];

interface CoverageUnit {
  name: string;
  /** cwd for the command, relative to the repo root. */
  cwd: string;
  command: string[];
  /** Where this unit's lcov output lands, relative to its cwd. */
  coverageDir: string;
}

/**
 * `packages/core`, `apps/tools-api` and `apps/mcp-client` go through their
 * isolation runners, which forward `--coverage` and give each group its own
 * numbered subdirectory. The rest run a plain `bun test`.
 */
const UNITS: CoverageUnit[] = [
  {
    name: "packages/core",
    cwd: "packages/core",
    command: ["bun", "scripts/run-tests-isolated.ts", "--unit", "--coverage", "--coverage-dir=coverage"],
    coverageDir: "coverage",
  },
  {
    name: "apps/tools-api",
    cwd: "apps/tools-api",
    command: ["bun", "scripts/run-tests-isolated.ts", "--coverage", "--coverage-dir=coverage"],
    coverageDir: "coverage",
  },
  {
    name: "apps/mcp-client",
    cwd: "apps/mcp-client",
    command: ["bun", "scripts/run-tests-isolated.ts", "--coverage", "--coverage-dir=coverage"],
    coverageDir: "coverage",
  },
  {
    name: "packages/shared",
    cwd: "packages/shared",
    command: ["bun", "test", "--coverage", "--coverage-reporter=lcov", "--coverage-dir=coverage"],
    coverageDir: "coverage",
  },
  {
    name: "apps/web-ui",
    cwd: "apps/web-ui",
    command: ["bun", "test", "--coverage", "--coverage-reporter=lcov", "--coverage-dir=coverage"],
    coverageDir: "coverage",
  },
  {
    name: "apps/opencode-plugin",
    cwd: "apps/opencode-plugin",
    command: ["bun", "test", "--coverage", "--coverage-reporter=lcov", "--coverage-dir=coverage"],
    coverageDir: "coverage",
  },
];

/** line number -> times executed, merged across every group that loaded the file. */
type LineHits = Map<number, number>;

/** Parse one lcov file, resolving `SF:` records against `baseDir`. */
export function parseLcov(content: string, baseDir: string): Map<string, LineHits> {
  const perFile = new Map<string, LineHits>();
  let current: LineHits | undefined;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("SF:")) {
      const file = path.resolve(baseDir, line.slice(3));
      current = perFile.get(file);
      if (!current) {
        current = new Map();
        perFile.set(file, current);
      }
      continue;
    }

    if (line === "end_of_record") {
      current = undefined;
      continue;
    }

    if (current && line.startsWith("DA:")) {
      const [lineNumberText, hitsText] = line.slice(3).split(",");
      const lineNumber = Number(lineNumberText);
      const hits = Number(hitsText);
      if (!Number.isFinite(lineNumber) || !Number.isFinite(hits)) continue;
      // A line counts as covered if ANY group executed it. Groups are separate
      // processes over disjoint file sets, so summing is the correct merge.
      current.set(lineNumber, (current.get(lineNumber) ?? 0) + hits);
    }
  }

  return perFile;
}

function mergeInto(target: Map<string, LineHits>, source: Map<string, LineHits>): void {
  for (const [file, lines] of source) {
    const existing = target.get(file);
    if (!existing) {
      target.set(file, new Map(lines));
      continue;
    }
    for (const [lineNumber, hits] of lines) {
      existing.set(lineNumber, (existing.get(lineNumber) ?? 0) + hits);
    }
  }
}

/** Every `lcov.info` under `directory`, at any depth (groups get subdirectories). */
function findLcovFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...findLcovFiles(entryPath));
    else if (entry.name === "lcov.info") found.push(entryPath);
  }
  return found;
}

export function linePercent(lines: LineHits): number {
  if (lines.size === 0) return 100;
  let covered = 0;
  for (const hits of lines.values()) if (hits > 0) covered += 1;
  return (covered / lines.size) * 100;
}

/** Product source only — tests, fixtures, build output and deps are not the subject. */
export function isMeasuredSource(relativePath: string): boolean {
  if (!/\.(ts|tsx|js|mjs|cjs)$/.test(relativePath)) return false;
  if (relativePath.includes("node_modules/")) return false;
  if (relativePath.includes("/dist/") || relativePath.startsWith("dist/")) return false;
  if (relativePath.includes("/generated/")) return false;
  if (relativePath.endsWith(".test.ts") || relativePath.endsWith(".spec.ts")) return false;
  if (relativePath.includes("__tests__/") || relativePath.includes("/tests/")) return false;
  if (relativePath.startsWith("scripts/") || relativePath.startsWith("benchmarks/")) return false;
  return true;
}

/**
 * 50 of core's suites are wrapped in `describe.skipIf(!DEDICATED_DB)`, which
 * requires `MASSA_AI_DEDICATED=1` **and** a `DATABASE_URL` pointing at the
 * dedicated `127.0.0.1:5433/massa_ai_test` instance. Without both, those suites
 * report `0 pass / N skip` and their subjects measure near zero — `graph-queries.ts`
 * lands at 3.98% while its 19 dedicated tests sit right there, skipped.
 *
 * That is the difference between 132 files "below the floor" and the truth, so
 * this refuses to run rather than emit a report that looks like a coverage
 * catastrophe. A gate that silently measures a skipped suite is worse than no
 * gate: it trains people to ignore it.
 */
function assertDedicatedDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const dedicated =
    process.env.MASSA_AI_DEDICATED === "1" &&
    /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(databaseUrl);

  if (dedicated) return;

  console.error(
    [
      "[coverage] refusing to run: the dedicated test database is not configured.",
      "",
      "50 core suites are gated behind `describe.skipIf(!DEDICATED_DB)`. Without it they",
      "skip, and their subjects measure near-zero coverage that has nothing to do with how",
      "well they are tested. Required:",
      "",
      "  MASSA_AI_DEDICATED=1",
      "  DATABASE_URL=postgresql://<user>:<pass>@127.0.0.1:5433/massa_ai_test",
      "",
      `  currently: MASSA_AI_DEDICATED=${process.env.MASSA_AI_DEDICATED ?? "<unset>"}`,
      `             DATABASE_URL=${databaseUrl ? "<set, wrong host/db>" : "<unset>"}`,
    ].join("\n"),
  );
  process.exit(2);
}

async function main(): Promise<void> {
  assertDedicatedDatabase();
  const only = process.argv.slice(2).filter((argument) => !argument.startsWith("-"));
  const units = only.length > 0 ? UNITS.filter((unit) => only.includes(unit.name)) : UNITS;

  if (units.length === 0) {
    console.error(`No coverage unit matched: ${only.join(", ")}`);
    console.error(`Known units: ${UNITS.map((unit) => unit.name).join(", ")}`);
    process.exit(2);
  }

  const merged = new Map<string, LineHits>();
  const failedUnits: string[] = [];

  for (const unit of units) {
    const cwd = path.join(REPO_ROOT, unit.cwd);
    const coverageDir = path.join(cwd, unit.coverageDir);
    fs.rmSync(coverageDir, { recursive: true, force: true });

    console.log(`\n[coverage] ${unit.name}: ${unit.command.join(" ")}`);
    const result = spawnSync(unit.command[0]!, unit.command.slice(1), { cwd, stdio: "inherit" });

    // A unit whose suite failed is reported, but its coverage is still merged:
    // suppressing it would turn one red suite into a flood of phantom
    // below-floor failures and bury the real cause.
    if (result.status !== 0) {
      console.error(`[coverage] ${unit.name}: suite exited ${result.status}`);
      failedUnits.push(unit.name);
    }

    const lcovFiles = findLcovFiles(coverageDir);
    if (lcovFiles.length === 0) {
      console.error(`[coverage] ${unit.name}: no lcov.info produced under ${coverageDir}`);
      failedUnits.push(`${unit.name} (no coverage output)`);
      continue;
    }
    for (const lcovFile of lcovFiles) {
      mergeInto(merged, parseLcov(fs.readFileSync(lcovFile, "utf8"), cwd));
    }
    console.log(`[coverage] ${unit.name}: merged ${lcovFiles.length} lcov file(s)`);
  }

  const excluded = new Set(EXCLUSIONS.map((entry) => entry.file));
  const below: Array<{ file: string; percent: number }> = [];
  let measured = 0;

  for (const [absolutePath, lines] of merged) {
    const relativePath = path.relative(REPO_ROOT, absolutePath);
    if (!isMeasuredSource(relativePath)) continue;
    measured += 1;
    if (excluded.has(relativePath)) continue;

    const percent = linePercent(lines);
    if (percent < LINE_COVERAGE_FLOOR) below.push({ file: relativePath, percent });
  }

  console.log(
    `\n[coverage] floor ${LINE_COVERAGE_FLOOR}% line · ${measured} source files measured · ` +
      `${EXCLUSIONS.length} documented exclusions`,
  );

  if (below.length > 0) {
    below.sort((left, right) => left.percent - right.percent);
    console.error(`\n[coverage] ${below.length} file(s) below the ${LINE_COVERAGE_FLOOR}% floor:`);
    for (const entry of below) {
      console.error(`  ${entry.percent.toFixed(2).padStart(6)}%  ${entry.file}`);
    }
  }

  if (failedUnits.length > 0) {
    console.error(`\n[coverage] unit(s) did not complete cleanly: ${failedUnits.join(", ")}`);
  }

  if (below.length > 0 || failedUnits.length > 0) process.exit(1);

  console.log(`[coverage] PASS — every measured source file is at or above ${LINE_COVERAGE_FLOOR}%.`);
}

// Importable by tests without running the suites.
if (import.meta.main) await main();
