/**
 * Imported FIRST by index.test.ts — static imports execute in declaration
 * order, and @massa-ai/shared/config freezes CONFIG_DIR as a module-level
 * const at first import. Pointing XDG_CONFIG_HOME at a scratch dir before
 * ../index loads makes the whole suite hermetic (no developer config.json
 * leaks in) and makes ensureConfig()'s first-run init branch run
 * deterministically in every environment.
 *
 * MASSA_AI_REINDEX_DEBOUNCE_MS is read once at ../index module load; 10 ms
 * lets the debounced-reindex tests observe the timer body without fake
 * timers (global 5 s per-test budget stays untouched).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "massa-ai-oc-test-"));
process.env.MASSA_AI_REINDEX_DEBOUNCE_MS = "10";
