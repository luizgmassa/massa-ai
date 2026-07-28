/**
 * tools-api isolated-test runner (DEBT-04 wrapper).
 *
 * Everything mechanical lives in `scripts/lib/run-tests-isolated.ts`. This file
 * supplies only what is specific to this package: where its tests live, and the
 * one condition that forces a file into its own process.
 */

import path from "node:path";
import { runIsolatedTests } from "../../../scripts/lib/run-tests-isolated.js";

const packageRoot = path.resolve(import.meta.dir, "..");

await runIsolatedTests({
  packageRoot,
  // Route tests sit beside their sources under src/, not in a __tests__ root.
  testsRoot: path.join(packageRoot, "src"),

  // This package's only stateful hazard is process-wide module mocking.
  isolationReason: (_file, source) =>
    /^\s*mock\s*\.\s*module\s*\(/m.test(source) ? "module mock" : undefined,

  labels: {
    // Historically this runner printed the reason-less form; kept so existing
    // CI logs and group labels are unchanged by the extraction.
    isolatedGroup: (_reason, relativePath) => `isolated: ${relativePath}`,
    discoverySummary: (total, shared, isolated) =>
      `${total} files: ${shared} mock-free, ${isolated} isolated`,
  },
});
