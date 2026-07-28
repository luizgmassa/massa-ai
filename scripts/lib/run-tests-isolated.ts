/**
 * Shared isolated-test-runner (DEBT-04).
 *
 * `packages/core`, `apps/tools-api` and `apps/mcp-client` each shipped their own
 * copy of this runner — 236 / 124 / 141 lines that had drifted apart in their
 * classification rules, their group labels and their summary wording, while the
 * parts that actually matter (child-process spawning, signal forwarding, failure
 * reporting, exit codes) were duplicated three times. A fix to any of those had
 * to be made three times or it silently wasn't made at all.
 *
 * This module owns everything the three had in common. A wrapper supplies only
 * what genuinely differs: where its tests live, and how it decides a file needs
 * its own process. Labels and discovery are overridable because the three
 * packages print different wording, and preserving that keeps existing CI logs
 * and group counts byte-identical across the refactor.
 *
 * Not published: all three packages ship only `dist`, so this dev-only file
 * never enters a tarball.
 *
 * ## Why isolation exists at all
 *
 * Bun runs test files in one process and schedules suites from different files
 * concurrently. Files that mutate module state, process globals, or a shared
 * database corrupt each other when they share a process — the resulting failures
 * look like logic bugs and are not. Genuinely pure files stay in one fast group;
 * everything else gets a dedicated child.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** One unit of execution: a label for reporting and the files to run in it. */
export interface TestGroup {
  label: string;
  files: string[];
}

export interface DiscoveryResult {
  /** Files to run, already ordered. */
  files: string[];
  /**
   * When true, every file becomes its own sequential group and classification is
   * skipped entirely. Core's e2e mode needs this: those suites share a database
   * and must never be batched.
   */
  sequential?: boolean;
  /** Printed instead of the default discovery summary when provided. */
  summary?: string;
}

export interface RunnerLabels {
  /** Label for the single batched group of non-isolated files. */
  sharedGroup(count: number): string;
  /** Label for one isolated file. `reason` is the wrapper's classification. */
  isolatedGroup(reason: string, relativePath: string): string;
  /** The one-line census printed before anything runs. */
  discoverySummary(total: number, shared: number, isolated: number): string;
}

export interface RunnerOptions {
  /** Package root; children run with this as cwd. */
  packageRoot: string;
  /** Root directory scanned for `*.test.ts`. */
  testsRoot: string;
  /**
   * Return a reason string when `file` must get its own process, or `undefined`
   * to let it share. Reasons are free-form and appear verbatim in group labels.
   */
  isolationReason(file: string, source: string, testsRoot: string): string | undefined;
  /** Defaults to `process.argv.slice(2)`. */
  argv?: string[];
  /** Overrides for wording; each falls back to the shared default. */
  labels?: Partial<RunnerLabels>;
  /**
   * Replaces the default "every `*.test.ts` under testsRoot, sorted" discovery.
   * Core uses this for `--unit` / `--e2e` / `--filter`, its `integration/`
   * exclusion, and the forced-last cleanup finalizer.
   */
  discover?(context: { testsRoot: string; packageRoot: string; argv: string[] }): Promise<DiscoveryResult>;
  /**
   * Arguments the wrapper accepts and handles itself. Anything outside this set
   * (and the shared coverage flags) is rejected, preserving each runner's
   * existing "Unknown argument(s)" contract.
   */
  allowedArguments?: (argument: string) => boolean;
}

const DEFAULT_LABELS: RunnerLabels = {
  sharedGroup: (count) => `mock-free (${count} files)`,
  isolatedGroup: (reason, relativePath) => `isolated (${reason}): ${relativePath}`,
  discoverySummary: (total, shared, isolated) =>
    `${total} files: ${shared} pure/shared, ${isolated} stateful/isolated`,
};

/** Every `*.test.ts` under `directory`, recursively. */
export async function findTestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTestFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".test.ts") ? [entryPath] : [];
    }),
  );

  return files.flat();
}

/** `*.test.ts` directly in `directory`, without descending. */
export async function findTopLevelTestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => path.join(directory, entry.name));
}

/**
 * Coverage is opt-in per run (DEBT-02 removed the global `coverage = true`).
 *
 * Each group is a separate `bun test` process, and each would write `lcov.info`
 * into the same directory and clobber the previous one. Groups therefore get
 * numbered subdirectories, and the caller merges them.
 */
interface CoverageOptions {
  enabled: boolean;
  directory: string;
}

function parseCoverageOptions(argv: string[], packageRoot: string): CoverageOptions {
  const directoryArgument = argv.find((argument) => argument.startsWith("--coverage-dir="));
  return {
    enabled: argv.includes("--coverage"),
    directory: directoryArgument
      ? path.resolve(packageRoot, directoryArgument.slice("--coverage-dir=".length))
      : path.join(packageRoot, "coverage"),
  };
}

function isCoverageArgument(argument: string): boolean {
  return argument === "--coverage" || argument.startsWith("--coverage-dir=");
}

export async function runIsolatedTests(options: RunnerOptions): Promise<void> {
  const { packageRoot, testsRoot } = options;
  const argv = options.argv ?? process.argv.slice(2);
  const labels: RunnerLabels = { ...DEFAULT_LABELS, ...options.labels };
  const coverage = parseCoverageOptions(argv, packageRoot);

  const isAllowed = options.allowedArguments ?? (() => false);
  const unknownArguments = argv.filter(
    (argument) => !isCoverageArgument(argument) && !isAllowed(argument),
  );
  if (unknownArguments.length > 0) {
    console.error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
    process.exit(2);
  }

  const discovery = options.discover
    ? await options.discover({ testsRoot, packageRoot, argv })
    : {
        files: (await findTestFiles(testsRoot)).sort((left, right) => left.localeCompare(right)),
      };

  let groups: TestGroup[];

  if (discovery.sequential) {
    groups = discovery.files.map((file) => ({
      label: `e2e: ${path.relative(packageRoot, file)}`,
      files: [file],
    }));
  } else {
    const classified = await Promise.all(
      discovery.files.map(async (file) => ({
        file,
        reason: options.isolationReason(file, await readFile(file, "utf8"), testsRoot),
      })),
    );

    const sharedFiles = classified.filter((e) => e.reason === undefined).map((e) => e.file);
    const isolated = classified.filter(
      (entry): entry is { file: string; reason: string } => entry.reason !== undefined,
    );

    groups = [
      ...(sharedFiles.length > 0
        ? [{ label: labels.sharedGroup(sharedFiles.length), files: sharedFiles }]
        : []),
      ...isolated.map(({ file, reason }) => ({
        label: labels.isolatedGroup(reason, path.relative(packageRoot, file)),
        files: [file],
      })),
    ];

    discovery.summary ??= labels.discoverySummary(
      discovery.files.length,
      sharedFiles.length,
      isolated.length,
    );
  }

  console.log(`[test-isolation] ${discovery.summary}`);
  if (coverage.enabled) {
    console.log(`[test-isolation] coverage -> ${coverage.directory} (one subdir per group)`);
  }

  let activeChild: ChildProcess | undefined;
  let forwardedSignal: NodeJS.Signals | undefined;
  const handledSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  const signalHandlers = new Map<NodeJS.Signals, () => void>();

  for (const signal of handledSignals) {
    const handler = () => {
      forwardedSignal ??= signal;
      activeChild?.kill(signal);
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }

  function removeSignalHandlers(): void {
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
  }

  function runGroup(
    files: string[],
    groupIndex: number,
  ): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    const coverageArguments = coverage.enabled
      ? [
          "--coverage",
          "--coverage-reporter=lcov",
          `--coverage-dir=${path.join(coverage.directory, String(groupIndex))}`,
        ]
      : [];

    return new Promise((resolve, reject) => {
      activeChild = spawn(process.execPath, ["test", ...coverageArguments, ...files], {
        cwd: packageRoot,
        env: process.env,
        stdio: "inherit",
      });
      activeChild.once("error", reject);
      activeChild.once("close", (code, signal) => {
        activeChild = undefined;
        resolve({ code, signal });
      });
    });
  }

  const failures: string[] = [];

  for (const [groupIndex, group] of groups.entries()) {
    console.log(`\n[test-isolation] RUN ${group.label}`);
    try {
      const result = await runGroup(group.files, groupIndex);
      if (forwardedSignal) break;
      if (result.signal) {
        console.error(`[test-isolation] SIGNAL ${result.signal}: ${group.label}`);
        removeSignalHandlers();
        process.kill(process.pid, result.signal);
        break;
      }
      if (result.code !== 0) {
        console.error(`[test-isolation] FAIL (${result.code}): ${group.label}`);
        failures.push(group.label);
      } else {
        console.log(`[test-isolation] PASS: ${group.label}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[test-isolation] ERROR: ${group.label}: ${message}`);
      failures.push(group.label);
    }
  }

  removeSignalHandlers();

  if (forwardedSignal) {
    process.kill(process.pid, forwardedSignal);
  } else if (failures.length > 0) {
    console.error(`\n[test-isolation] ${failures.length} failed group(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`\n[test-isolation] PASS: all ${groups.length} group(s)`);
  }
}
