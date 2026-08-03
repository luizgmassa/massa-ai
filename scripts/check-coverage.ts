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
 * ## Why this truncates the dedicated database first (SEN-01)
 *
 * The scratch config dir above makes the numbers independent of the machine.
 * It does nothing about the database, which carries every previous run's rows
 * into the next one. `resetDedicatedDatabase` below empties the data tables
 * before the first suite starts, so each gate run begins where CI begins: an
 * empty database. It truncates rows only — schema and Prisma's migration
 * history survive, and the gate never re-runs migrations.
 *
 * What it buys, measured rather than assumed:
 *
 *   - A known starting state, which is the same argument as the scratch config
 *     dir: the floor this enforces should be the floor CI can reproduce, and CI
 *     always starts empty.
 *   - `postgres-vector-store.integration.test.ts` asserts on absolute row counts
 *     and goes from 8 failures to 6 across the same gate run when the database
 *     starts clean. (The remaining 6 are contamination from *other suites in the
 *     same run*, which a reset at gate start cannot reach.)
 *
 * What it does NOT buy, contrary to how SEN-01 was originally specified: it does
 * not stabilise `architecture-map.test.ts`'s timing. That was the stated reason
 * for the `300_000` stopgap those cases carried, and the diagnosis was wrong.
 * Measured across three full gate runs, with and without this reset:
 *
 *   | run          | provider init | whole file | file - provider |
 *   |--------------|---------------|------------|-----------------|
 *   | with reset   |      3.29 s   |    5.23 s  |        1.94 s   |
 *   | no reset     |      2.80 s   |    3.68 s  |        0.88 s   |
 *   | with reset   |    117.46 s   |  119.47 s  |        2.01 s   |
 *
 * The test's own cost is flat at 0.9-2.0 s. Every second of the variance is
 * Ollama reloading an evicted `qwen3-embedding:8b` during embedding-provider
 * auto-selection. The original evidence — "the isolation runner is strictly
 * sequential, so this is accumulation, not contention" — ruled out contention
 * and then asserted accumulation without testing the third option, which the
 * repo's own CLAUDE.md names as the commoner cause of exactly this symptom.
 *
 * The cost of this reset is roughly 38 s per gate run, because it also empties
 * the embedding cache. That is the right trade: a warm cache skips the provider
 * path entirely, which changes *which code paths execute* and therefore what
 * coverage measures. CI never has one.
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
import { Client } from "pg";

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
  // `packages/core/src/services/query/prisma-client.ts` was excluded here as
  // "connection singleton and env boilerplate" and deleted at PR-D's T21: the
  // file moved to `kernel/prisma-client.ts` at PR-C (9fe4545), `2ea4ebd` then
  // took it to 100% (26/26), so the entry was dangling AND dead weight under
  // either path. The existence pin in `check-coverage.test.ts` is what now
  // makes the next silent `git mv` fail instead of read as an active exemption.
  // `packages/core/src/__tests__/e2e/{_helpers,qwen-fixture}.ts` were carried
  // here from the `coverage-90pct` report and have been removed: `isMeasuredSource`
  // already drops everything under `__tests__/`, so both entries were inert.
  // A dead exclusion is worse than no exclusion — it reads as an active
  // exemption in review. `check-coverage.test.ts` now pins the invariant that
  // every entry here is a path the gate would otherwise measure.
  {
    // Added by DEBT-02 once the gate could actually be run. Not a coverage gap:
    // `api-key.test.ts` is 373 lines of dedicated tests, but all 18 of its call
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
    // 88.89%: 32 of 36 lines. Three of the four uncovered lines are the
    // config.json -> process.env seeding branches for DATABASE_URL,
    // OLLAMA_API_KEY and MASSA_AI_API_KEY, each guarded by "only when the env
    // var is unset". The fourth is unrelated: it is `findEnvFile()`'s loop exit,
    // reached only when the walk up from cwd hits the filesystem root without
    // finding a `.env` at all — which cannot happen in a checkout that has one.
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
   * Measured on `packages/core/src/services/memory-graph/graph-queries.ts` (440 lines):
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
 * The single definition of "this database is scratch".
 *
 * Two call sites need it: the run gate below, and `resetDedicatedDatabase`,
 * which truncates. Writing the reset its own condition would be the usual way
 * a destructive operation ends up pointed at a database nobody designated as
 * disposable — the two conditions agree on the day they are written and drift
 * apart on some later day. One predicate cannot drift from itself.
 *
 * It takes `env` explicitly so the refusal path is testable without mutating
 * the process environment out from under a parallel test file.
 */
export function isDedicatedDatabase(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    env.MASSA_AI_DEDICATED === "1" &&
    /127\.0\.0\.1:5433\/massa_ai_test(?:\?|$)/.test(env.DATABASE_URL ?? "")
  );
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

  if (isDedicatedDatabase()) return;

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

/**
 * Tables the reset must never empty, by name.
 *
 * `_prisma_migrations` is Prisma's applied-migration bookkeeping and it lives in
 * the same `public` schema as every data table. The obvious implementation —
 * truncate the schema — therefore empties it while leaving all 24 migrations'
 * DDL applied, and the next `prisma migrate deploy` replays non-idempotent
 * `ALTER TABLE ADD COLUMN` against columns that already exist and fails. The
 * database looks fine until the next migration, which is the worst time to find
 * out.
 */
export const TRUNCATION_EXCLUSIONS: ReadonlyArray<string> = ["_prisma_migrations"];

/**
 * Which of the schema's tables the reset truncates.
 *
 * The table list is read from the catalog at run time rather than hardcoded.
 * A hardcoded list goes stale the first time a migration adds a table, and a
 * reset that quietly stops resetting one table is the same defect as the
 * accumulated state this exists to remove — it would just take longer to
 * notice. The exclusion is the part that is hardcoded, because it is the part
 * that must not drift.
 */
export function selectTruncationTargets(tableNames: readonly string[]): string[] {
  return tableNames.filter((name) => !TRUNCATION_EXCLUSIONS.includes(name));
}

/** `-1` when the table is absent — a database that was never migrated. */
async function countMigrationRows(client: Client, present: readonly string[]): Promise<number> {
  if (!present.includes("_prisma_migrations")) return -1;
  const { rows } = await client.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM "public"."_prisma_migrations"',
  );
  return Number(rows[0]?.count ?? "0");
}

/**
 * Empty the dedicated database's data tables before any suite runs.
 *
 * Why it is safe here and nowhere else: it refuses unless `isDedicatedDatabase`
 * holds — the same predicate that already refuses to run the gate at all.
 * Requiring `MASSA_AI_DEDICATED=1` *and* the exact `127.0.0.1:5433/massa_ai_test`
 * URL means the developer has already designated that database as disposable.
 * The refusal is a throw rather than a `process.exit`, so a caller that reaches
 * it by mistake gets a stack trace instead of a silent status code.
 *
 * `CASCADE` follows foreign keys out of the listed set, so leaving
 * `_prisma_migrations` off the list is not on its own proof that it survived.
 * The row count is read before and after and compared, which turns the
 * exclusion into something checked on every run rather than something checked
 * once by hand with `prisma migrate status`.
 */
export async function resetDedicatedDatabase(
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (!isDedicatedDatabase(env)) {
    throw new Error(
      "[coverage] refusing to truncate: DATABASE_URL is not the dedicated test database. " +
        "Requires MASSA_AI_DEDICATED=1 and a DATABASE_URL on 127.0.0.1:5433/massa_ai_test.",
    );
  }

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const present = rows.map((row) => row.tablename);
    const targets = selectTruncationTargets(present);

    if (targets.length === 0) {
      console.log("[coverage] reset: no data tables in public — nothing to truncate");
      return;
    }

    const before = await countMigrationRows(client, present);
    const quoted = targets.map((name) => `"public"."${name.replace(/"/g, '""')}"`).join(", ");
    await client.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
    const after = await countMigrationRows(client, present);

    if (before !== after) {
      throw new Error(
        `[coverage] the reset emptied Prisma's migration history (${before} rows -> ${after}). ` +
          "The next `prisma migrate deploy` would replay non-idempotent DDL and fail. Aborting.",
      );
    }

    console.log(
      `[coverage] reset: truncated ${targets.length} data table(s); ` +
        `${TRUNCATION_EXCLUSIONS.join(", ")} intact at ${after} row(s)`,
    );
  } finally {
    await client.end();
  }
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

  // After the unit filter, so a mistyped unit name exits without having
  // truncated anything. Before the first suite, because the point is that every
  // suite below starts from the same database state.
  await resetDedicatedDatabase();

  const merged = new Map<string, FileCoverage>();
  const failedUnits: string[] = [];

  // See the header: an empty scratch config dir is CI's state, and it is what
  // makes these numbers a property of the tree rather than of this machine.
  //
  // `MASSA_AI_TEST_CONFIG_HOME` is how this composes with the isolated runner
  // rather than fighting it. That runner also mints a scratch config dir, and
  // it cannot tell a deliberate `XDG_CONFIG_HOME` from a Linux shell exporting
  // the real `~/.config` — so intent travels in its own variable, and this dir
  // wins for every child the runner spawns underneath us.
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-coverage-"));
  const childEnv = {
    ...process.env,
    XDG_CONFIG_HOME: configHome,
    MASSA_AI_TEST_CONFIG_HOME: configHome,
  };
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
