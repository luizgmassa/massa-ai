/**
 * core isolated-test runner (DEBT-04 wrapper).
 *
 * Everything mechanical lives in `scripts/lib/run-tests-isolated.ts`. This file
 * supplies what is specific to core: its `--unit` / `--e2e` / `--filter`
 * selection, the `integration/` exclusion, the forced-last e2e cleanup
 * finalizer, and the classification rules that decide when a file needs its own
 * process.
 */

import path from "node:path";
import {
  findTestFiles,
  findTopLevelTestFiles,
  runIsolatedTests,
  type DiscoveryResult,
} from "../../../scripts/lib/run-tests-isolated.js";

const packageRoot = path.resolve(import.meta.dir, "..");
const testsRoot = path.join(packageRoot, "src", "__tests__");

/**
 * These rules intentionally inspect the test contract instead of maintaining a
 * filename allow-list: a newly added PG integration or global testing seam is
 * isolated automatically. The expressions only match stateful API usage in test
 * source; ordinary mentions in fixture strings do not opt a file in.
 */
function isolationReason(file: string, source: string, root: string): string | undefined {
  if (/^\s*mock\s*\.\s*module\s*\(/m.test(source)) return "module mock";

  const relativePath = path.relative(root, file);
  if (
    relativePath.startsWith(`integration${path.sep}`) ||
    /(?:^|[.-])(?:e2e|integration)\.test\.ts$/.test(path.basename(file)) ||
    /\bDATABASE_URL\b/.test(source) ||
    /\b(?:getPrismaClient|disconnectPrisma|PrismaClient)\s*\(/.test(source) ||
    /\b(?:PostgresVectorStore|PostgresGraphRepository|PostgresSymbolRepository)\b/.test(source) ||
    /\b(?:EtlPipeline|ContextualSearchRLM|WorkspaceManager)\b/.test(source) ||
    /\b(?:getGraphStore|getMemoryRepository|getVectorStore|getKeywordSearch|getJobStore|getSessionStore)\s*\(/.test(
      source,
    )
  ) {
    return "database/integration";
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

async function discover({ argv }: { argv: string[] }): Promise<DiscoveryResult> {
  const unitOnly = argv.includes("--unit");
  const e2eOnly = argv.includes("--e2e");

  if (unitOnly && e2eOnly) {
    console.error("Incompatible arguments: --unit and --e2e");
    process.exit(2);
  }

  const filterArgument = argv.find((argument) => argument.startsWith("--filter="));
  const filterRegex = filterArgument
    ? new RegExp(filterArgument.slice("--filter=".length))
    : undefined;

  const discoveryRoot = e2eOnly ? path.join(testsRoot, "e2e") : testsRoot;
  let files = (
    e2eOnly
      ? await findTopLevelTestFiles(discoveryRoot)
      : (await findTestFiles(discoveryRoot)).filter((file) => {
          const relativePath = path.relative(testsRoot, file);

          // Live API tests have their own explicit `test:integration` gate. Never
          // let the default package/root aggregate contact a running developer API.
          if (relativePath.startsWith(`integration${path.sep}`)) return false;

          return !unitOnly || path.dirname(file) === testsRoot;
        })
  ).sort((left, right) => left.localeCompare(right));

  // `--filter=<regex>` narrows the selected files by path (relative to the tests
  // root). Used by the macOS arm64 CI gate to run only the native-structural
  // suites (which need darwin/arm64) without pulling in database/integration tests.
  if (filterRegex) {
    const before = files.length;
    files = files.filter((file) => filterRegex.test(path.relative(testsRoot, file)));
    console.log(`[test-isolation] --filter retained ${files.length}/${before} files`);
  }

  if (e2eOnly) {
    // The cleanup finalizer verifies teardown, so it can only be meaningful last.
    const cleanupFinalizer = files.find(
      (file) => path.basename(file) === "17.cleanup-verify.test.ts",
    );
    if (cleanupFinalizer) {
      files = [...files.filter((file) => file !== cleanupFinalizer), cleanupFinalizer];
    }

    return {
      files,
      sequential: true,
      summary: `${files.length} e2e files: sequential, cleanup finalizer last`,
    };
  }

  return { files };
}

await runIsolatedTests({
  packageRoot,
  testsRoot,
  isolationReason,
  discover,
  allowedArguments: (argument) =>
    argument === "--unit" || argument === "--e2e" || argument.startsWith("--filter="),
});
