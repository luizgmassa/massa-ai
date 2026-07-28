/**
 * mcp-client isolated-test runner (DEBT-04 wrapper).
 *
 * Everything mechanical lives in `scripts/lib/run-tests-isolated.ts`. This file
 * supplies only what is specific to this package: where its tests live, and the
 * conditions that force a file into its own process.
 */

import path from "node:path";
import { runIsolatedTests } from "../../../scripts/lib/run-tests-isolated.js";

const packageRoot = path.resolve(import.meta.dir, "..");
const testsRoot = path.join(packageRoot, "src");

await runIsolatedTests({
  packageRoot,
  testsRoot,

  isolationReason: (file, source, root) => {
    if (/^\s*mock\s*\.\s*module\s*\(/m.test(source)) return "module mock";

    // The embedded client calls core in-process, so these suites share core's
    // singletons and its database connection.
    const relativePath = path.relative(root, file);
    if (
      relativePath.startsWith(`__tests__${path.sep}`) &&
      /\b(?:embedded|EmbeddedApiClient|buildPrefetchPlan|core)\b/.test(source)
    ) {
      return "core singleton / DB";
    }

    if (/(?:delete\s+process\.env\b|process\.env(?:\.[A-Z0-9_]+|\[[^\]]+\])\s*=)/.test(source)) {
      return "process-global state";
    }

    return undefined;
  },

  labels: {
    // This runner said "shared", not "mock-free"; preserved so the extraction
    // changes no output.
    sharedGroup: (count) => `shared (${count} files)`,
    discoverySummary: (total, shared, isolated) =>
      `${total} files: ${shared} shared, ${isolated} isolated`,
  },
});
