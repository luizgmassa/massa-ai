/**
 * Imported FIRST by config-cli.test.ts — static imports execute in
 * declaration order, and @massa-ai/shared/config freezes CONFIG_DIR as a
 * module-level const at first import (`config-loader.ts:8`,
 * `const CONFIG_DIR = configDir("massa-ai")`). Pointing XDG_CONFIG_HOME at a
 * scratch dir before ../config-cli.js loads is the only thing that keeps a
 * direct `bun test src/__tests__/config-cli.test.ts` off the developer's real
 * ~/.config/massa-ai/config.json: that suite's own `beforeEach` sets
 * XDG_CONFIG_HOME long after the freeze has already happened, so without this
 * file the CLI writes the ambient config dir and the suite still reports green.
 *
 * The isolation runner hides this — its `buildChildEnv` sets the child's
 * XDG_CONFIG_HOME before the child starts — which is why CI and `bun run test`
 * never saw it and only a direct single-file run bites.
 *
 * Mirrors apps/opencode-plugin/src/__tests__/env-setup.ts, minus that suite's
 * MASSA_AI_REINDEX_DEBOUNCE_MS knob, which has no reader here. TEST_CONFIG_HOME
 * is exported so the suite can assert the frozen path by exact equality instead
 * of inferring it from HOME or TMPDIR.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TEST_CONFIG_HOME = mkdtempSync(join(tmpdir(), "massa-ai-mcp-test-"));

process.env.XDG_CONFIG_HOME = TEST_CONFIG_HOME;
