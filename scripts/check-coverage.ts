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
 *
 * ## Why the suites run against a scratch config dir
 *
 * `CONFIG_DIR` derives from `XDG_CONFIG_HOME`, so without an override the suites
 * read the developer's real `~/.config/massa-ai/config.json`. That makes the
 * numbers a property of the machine rather than of the tree: a developer with
 * `llm.enabled: true` takes LLM branches that CI — which has no config file at
 * all — never reaches, and a floor calibrated there is not reproducible.
 *
 * It is also slow and non-deterministic. Measured on `dart-support.test.ts`:
 * with the real config, `CodeCompressor.compress()` made a live Ollama call and
 * took 42030 ms cold / 690 ms warm, blowing `bunfig.toml`'s 5 s per-test budget;
 * against a scratch dir the same file ran in 74 ms. A gate whose result depends
 * on whether a model happens to be warm is not a gate.
 *
 * The scratch dir is empty, which is exactly CI's state, so the floor this
 * enforces is the floor CI can reproduce. It is also the only writable config
 * dir the run can see, so a suite that provisions a key or migrates a data dir
 * does it there instead of in the developer's home. That second property is
 * load-bearing: `packages/shared/src/config/index.ts` bare-imports `../env.js`,
 * which runs `migrateDataDirOnce()` and `loadConfigSafe()` at module load
 * against a `CONFIG_DIR` frozen at first import, and 75 files under
 * `packages/core/src/__tests__` import `@massa-ai/shared`.
 *
 * ## `packages/core` merges 122 lcov files for 126 groups — expected
 *
 * Bun writes `lcov.info` only when a run's coverage record set is non-empty. A
 * `bun test` that skips every test, or that imports no product source at all,
 * exits 0 and writes nothing — no directory, no file, no error. Group indices
 * are unique by construction (`scripts/lib/run-tests-isolated.ts` names each
 * group's subdirectory by array index), so this is not a collision. Four groups
 * legitimately emit nothing:
 *
 *   - `context-controller.test.ts` — imports only `bun:test`; nothing to record.
 *   - `graph-generation-migration.test.ts` — runs, but asserts on raw file text
 *     read with `readFileSync`; imports no product module.
 *   - `graph-generation-lifecycle-pg.test.ts` — `import type` only, and the whole
 *     file sits behind `RUN_GRAPH_GENERATION_LIFECYCLE=1`.
 *   - `graph-generation-symbol-repository-pg.test.ts` — same shape, behind
 *     `RUN_GRAPH_GENERATION_SYMBOL_REPOSITORY=1`.
 *
 * `assertDedicatedDatabase` below covers the 50 `DEDICATED_DB` suites but has no
 * visibility into those two narrower opt-in flags, and the merge loop only fails
 * a unit that produced *zero* lcov files overall. So a future group that stops
 * emitting would also be silent. If that matters later, the fix is to have the
 * runner report its group count rather than to infer it here.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
  {
    // Added by DEBT-02 once the gate could actually be run. Not a coverage gap:
    // `api-key.test.ts` is 373 lines of dedicated tests, but all 21 of its call
    // sites go through the `runIsolated` subprocess harness, because `CONFIG_DIR`
    // is a module-level const frozen at first import and an in-process test
    // cannot re-point it. Bun's coverage does not cross a process boundary, so
    // the subject measures 13.79% while being one of the better-tested files in
    // the repo. Driving it in-process instead would defeat the isolation that
    // stops these tests writing into the developer's real `~/.config`.
    file: "packages/shared/src/config/api-key.ts",
    reason: "measurement blind spot — fully tested through the runIsolated subprocess harness, which Bun coverage cannot see",
  },
  {
    // 88.89%: 32 of 36 lines. The four uncovered ones are the config.json ->
    // process.env seeding branches for DATABASE_URL, OLLAMA_API_KEY and
    // MASSA_AI_API_KEY, each guarded by "only when the env var is unset".
    //
    // Reaching them in-process was attempted and does not work here, for three
    // compounding reasons: `CONFIG_DIR` is frozen at the config layer's first
    // import; `packages/shared` runs as a single `bun test` process, so a test
    // cannot guarantee it is the first file to load `env.ts`; and `env.ts`
    // dotenv-loads the nearest `.env` by walking up from cwd before it consults
    // config.json, so in any checkout with a `.env` the DATABASE_URL branch is
    // correctly skipped. Cache-busting the `env.ts` import re-evaluates it but
    // still reuses the cached loader, so the config dir cannot be re-pointed.
    //
    // The remaining routes are a production refactor of a startup-critical file,
    // or a test that writes into the developer's real `~/.config` — which is the
    // exact hazard the scratch config dir above exists to prevent. Neither is
    // worth four lines. The branches are covered in the subprocess suites.
    file: "packages/shared/src/env.ts",
    reason: "config->env seeding branches are only reachable once the config layer's frozen CONFIG_DIR is set from a parent process",
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

/** One file as reported by one group's lcov: which lines, and which of them ran. */
export interface CoverageRecord {
  /** Line numbers this group reported as executable. */
  executable: Set<number>;
  /** The subset this group actually executed. */
  covered: Set<number>;
}

/** A file accumulated across every group that reported it. */
export interface FileCoverage {
  /**
   * The SMALLEST executable-line set any group reported — not the union.
   *
   * Bun emits two different shapes of record for the same file. A group that
   * genuinely instruments the module reports only its real executable lines. A
   * group that merely pulls the module in as a transitive import emits a
   * degenerate record that marks *every physical line* uncovered — blank lines,
   * closing braces and JSDoc included.
   *
   * Measured on `packages/core/src/services/graph/graph-queries.ts` (440 lines):
   * the instrumenting group reported 220 executable lines and covered all 220;
   * seven shallow groups each reported 377 and covered 14. The 157-line
   * difference is entirely comments, blanks and braces, and the real set is a
   * strict subset of the degenerate one (`deep - shallow` is empty).
   *
   * Unioning the denominators therefore scored a fully covered file at
   * 220/377 = 58.4%, and did the same to every file the suite imports widely —
   * 130 of 314 files landed "below the floor" purely from this. Taking the
   * minimum keeps the denominator on Bun's real executable set.
   */
  executable: Set<number>;
  /** Union over all groups of lines observed executing at least once. */
  covered: Set<number>;
}

/** Parse one lcov file, resolving `SF:` records against `baseDir`. */
export function parseLcov(content: string, baseDir: string): Map<string, CoverageRecord> {
  const perFile = new Map<string, CoverageRecord>();
  let current: CoverageRecord | undefined;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("SF:")) {
      const file = path.resolve(baseDir, line.slice(3));
      current = perFile.get(file);
      if (!current) {
        current = { executable: new Set(), covered: new Set() };
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
      current.executable.add(lineNumber);
      if (hits > 0) current.covered.add(lineNumber);
    }
  }

  return perFile;
}

export function mergeInto(
  target: Map<string, FileCoverage>,
  source: Map<string, CoverageRecord>,
): void {
  for (const [file, record] of source) {
    const existing = target.get(file);
    if (!existing) {
      target.set(file, {
        executable: new Set(record.executable),
        covered: new Set(record.covered),
      });
      continue;
    }
    // Covered lines union across groups, so a file split across several test
    // files gets credit for all of them. The executable set does not: see the
    // note on `FileCoverage.executable`.
    for (const lineNumber of record.covered) existing.covered.add(lineNumber);
    if (record.executable.size < existing.executable.size) {
      existing.executable = new Set(record.executable);
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

export function linePercent(coverage: FileCoverage): number {
  if (coverage.executable.size === 0) return 100;
  let covered = 0;
  // Restricted to the executable set: a shallow group can report a hit on a line
  // the instrumenting group does not consider executable, and counting it would
  // let a file exceed 100%.
  for (const lineNumber of coverage.executable) {
    if (coverage.covered.has(lineNumber)) covered += 1;
  }
  return (covered / coverage.executable.size) * 100;
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

  const merged = new Map<string, FileCoverage>();
  const failedUnits: string[] = [];

  // See the header: an empty scratch config dir is CI's state, and it is what
  // makes these numbers a property of the tree rather than of this machine.
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-coverage-"));
  const childEnv = { ...process.env, XDG_CONFIG_HOME: configHome };
  console.log(`[coverage] XDG_CONFIG_HOME=${configHome} (scratch; the real user config is not read)`);

  for (const unit of units) {
    const cwd = path.join(REPO_ROOT, unit.cwd);
    const coverageDir = path.join(cwd, unit.coverageDir);
    fs.rmSync(coverageDir, { recursive: true, force: true });

    console.log(`\n[coverage] ${unit.name}: ${unit.command.join(" ")}`);
    const result = spawnSync(unit.command[0]!, unit.command.slice(1), {
      cwd,
      stdio: "inherit",
      env: childEnv,
    });

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

  // Removed here rather than in a `finally`: every child has exited by now, and
  // the reporting below can `process.exit`, which would skip a deferred cleanup.
  fs.rmSync(configHome, { recursive: true, force: true });

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
