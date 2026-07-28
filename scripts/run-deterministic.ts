/**
 * N18 — Deterministic acceptance script.
 *
 * Runs the test suite in deterministic-only mode: `_DETERMINISTIC_ONLY=1`
 * skips all suites that require a live database, network, or grammar (native
 * tree-sitter) dependencies. Only pure-unit tests run.
 *
 * Completes without external dependencies (no PostgreSQL, no Ollama, no
 * tree-sitter native binding). Reports which suites were skipped and why.
 *
 * Reuses the `run-tests-isolated.ts` classifier logic to identify which tests
 * need isolation and which are pure.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dir, "..", "packages", "core");
const testsRoot = path.join(packageRoot, "src", "__tests__");

type IsolationReason =
  | "module mock"
  | "database/integration"
  | "process-global state"
  | "network"
  | "grammar";

type SuiteEntry = {
  file: string;
  relativePath: string;
  reason: IsolationReason | undefined;
  skipped: boolean;
  skipReason: string | null;
};

/**
 * Classifier — mirrors run-tests-isolated.ts but extends it with network and
 * grammar detection for the deterministic gate.
 */
export function classify(file: string, source: string): IsolationReason | undefined {
  if (/^\s*mock\s*\.\s*module\s*\(/m.test(source)) return "module mock";

  const relativePath = path.relative(testsRoot, file);
  if (
    relativePath.startsWith(`integration${path.sep}`) ||
    /(?:^|[.-])(?:e2e|integration)\.test\.ts$/.test(path.basename(file)) ||
    /\b(?:DATABASE_URL|DATABASE_URL)\b/.test(source) ||
    /\b(?:getPrismaClient|disconnectPrisma|PrismaClient)\s*\(/.test(source) ||
    /\b(?:PostgresVectorStore|PostgresGraphRepository|PostgresSymbolRepository)\b/.test(source) ||
    /\b(?:EtlPipeline|ContextualSearchRLM|WorkspaceManager)\b/.test(source) ||
    /\b(?:getGraphStore|getMemoryRepository|getVectorStore|getKeywordSearch|getJobStore|getSessionStore)\s*\(/.test(
      source,
    )
  ) {
    return "database/integration";
  }

  // Network: tests that make real HTTP/fetch calls to external services
  if (
    /\b(?:fetch|http\.request|https\.request)\s*\(/.test(source) &&
    !/mock/i.test(source)
  ) {
    // Only flag as network if it looks like a real call (not mocked)
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0|MASSA_AI_API/.test(source)) {
      return "network";
    }
  }

  // Grammar: tests that require tree-sitter native bindings
  if (
    /\b(?:tree-sitter|treeSitter|Parser|LANGUAGE|Grammar)\b/.test(source) &&
    /require\(|import\s+.*from\s+["']tree-sitter/.test(source)
  ) {
    return "grammar";
  }

  if (
    /\b(?:eventBus|useFakeTimers|setSystemTime)\b/.test(source) ||
    /\b_set[A-Za-z0-9]*ForTesting\s*\(/.test(source) ||
    /(?:delete\s+process\.env\b|process\.env(?:\.[A-Z0-9_]+|\[[^\]]+\])\s*=)/.test(source)
  ) {
    return "process-global state";
  }

  return undefined;
}

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

const discoveredFiles = (await findTestFiles(testsRoot)).sort((a, b) =>
  a.localeCompare(b),
);

const entries: SuiteEntry[] = await Promise.all(
  discoveredFiles.map(async (file) => {
    const source = await readFile(file, "utf8");
    const reason = classify(file, source);
    const relativePath = path.relative(testsRoot, file);
    const isDeterministic =
      reason === undefined || reason === "process-global state";
    return {
      file,
      relativePath,
      reason,
      skipped: !isDeterministic,
      skipReason: isDeterministic
        ? null
        : reason === "database/integration"
          ? "requires live PostgreSQL database"
          : reason === "network"
            ? "requires network access to external services"
            : reason === "grammar"
              ? "requires tree-sitter native grammar bindings"
              : reason === "module mock"
                ? "uses mock.module (process-global side effects)"
                : `skipped: ${reason}`,
    };
  }),
);

const deterministicFiles = entries
  .filter((e) => !e.skipped)
  .map((e) => e.file);

const skippedEntries = entries.filter((e) => e.skipped);

export type { SuiteEntry, IsolationReason };

export interface RunOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
}

/** Build the deterministic discovery report lines (pure, testable). */
export function buildDiscoveryReport(
  entries: SuiteEntry[],
  deterministicFiles: string[],
  skippedEntries: SuiteEntry[],
): string[] {
  const lines: string[] = [];
  lines.push(`[deterministic] _DETERMINISTIC_ONLY=1`);
  lines.push(
    `[deterministic] ${entries.length} test files discovered: ${deterministicFiles.length} deterministic, ${skippedEntries.length} skipped`,
  );
  if (skippedEntries.length > 0) {
    lines.push(`\n[deterministic] Skipped suites:`);
    for (const e of skippedEntries) {
      lines.push(`  SKIP ${e.relativePath} — ${e.skipReason}`);
    }
  }
  return lines;
}

/**
 * Map a child-process outcome to the script exit code (pure). A signal death
 * is a failure; a non-zero code is the child's failure code; otherwise pass.
 */
export function interpretOutcome(result: RunOutcome): { exitCode: number; reason: string } {
  if (result.signal) {
    return { exitCode: 1, reason: `[deterministic] SIGNAL ${result.signal}` };
  }
  if (result.code !== 0) {
    return { exitCode: result.code ?? 1, reason: `[deterministic] FAIL (exit ${result.code})` };
  }
  return { exitCode: 0, reason: "" };
}

const DETERMINISTIC_ENV = {
  ...process.env,
  _DETERMINISTIC_ONLY: "1",
  DATABASE_URL: "",
};

/**
 * Default runTests: spawn `bun test` for the given files under the core
 * package root, forwarding SIGINT/SIGTERM to the child and re-raising a
 * forwarded signal on the parent. Inject a fake in tests.
 */
export async function defaultRunTests(files: string[]): Promise<RunOutcome> {
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

  return new Promise<RunOutcome>((resolve, reject) => {
    activeChild = spawn(process.execPath, ["test", ...files], {
      cwd: packageRoot,
      env: DETERMINISTIC_ENV,
      stdio: "inherit",
    });
    activeChild.once("error", (err) => {
      removeSignalHandlers();
      reject(err);
    });
    activeChild.once("close", (code, signal) => {
      activeChild = undefined;
      removeSignalHandlers();
      if (forwardedSignal) {
        process.kill(process.pid, forwardedSignal);
      }
      resolve({ code, signal });
    });
  });
}

/**
 * Orchestrate the deterministic run. The report + outcome interpretation are
 * pure; only the child spawn (defaultRunTests) touches the process. Returns
 * the exit code instead of calling process.exit so it is unit-testable.
 */
export async function main(
  runTests: (files: string[]) => Promise<RunOutcome> = defaultRunTests,
): Promise<number> {
  for (const line of buildDiscoveryReport(entries, deterministicFiles, skippedEntries)) {
    console.log(line);
  }

  if (deterministicFiles.length === 0) {
    console.log(`\n[deterministic] No deterministic tests to run. Exiting.`);
    return 0;
  }

  console.log(`\n[deterministic] Running ${deterministicFiles.length} deterministic test files...`);

  try {
    const result = await runTests(deterministicFiles);
    const { exitCode, reason } = interpretOutcome(result);
    if (exitCode === 0) {
      console.log(
        `\n[deterministic] PASS: ${deterministicFiles.length} files, ${skippedEntries.length} skipped`,
      );
    } else {
      console.error(reason);
    }
    return exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[deterministic] ERROR: ${message}`);
    return 1;
  }
}

if (import.meta.main) {
  const code = await main();
  if (code !== 0) process.exit(code);
}