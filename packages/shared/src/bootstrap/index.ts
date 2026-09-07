/**
 * Barrel for the bootstrap rule-toggle module (T12 / TASK-012, design.md:142).
 *
 * Until this file existed the module was unreachable from outside its own
 * directory: `packages/shared/src/index.ts` named no bootstrap symbol and
 * `packages/shared/package.json`'s `exports` map is closed to `.`, `./types`,
 * `./utils` and `./config`, so neither a root import nor a
 * `@massa-ai/shared/bootstrap` deep specifier resolved. Every suite written in
 * phases 2-5 imported relatively (`../engine`, `../render`, …) and the shell
 * suite imports the absolute source path, which is why 815 passing tests and a
 * green installer suite said nothing about the export surface.
 *
 * The re-export shape follows `profile-switch/`: a root re-export in
 * `packages/shared/src/index.ts`, and **no** new `exports` subpath. That is the
 * in-repo precedent, and it is what T17/T18's published CLIs import.
 *
 * `ConfigParseError` is re-exported here deliberately, and it is the one
 * symbol in this barrel that does not live under `bootstrap/`:
 * `setBootstrapRuleEnabled` throws it (`state.ts:176`, `:179`), so a consumer
 * that only imports this barrel still has to be able to name the error it must
 * catch. The root barrel already exports it from `./config/index.js` and must
 * not export it twice, so the root re-export below omits it.
 */

export {
  BOOTSTRAP_RULE_IDS,
  type BootstrapRuleId,
  isBootstrapRuleId,
  type BootstrapRuleDefinition,
  BOOTSTRAP_RULES,
  getBootstrapRuleDefinition,
  bootstrapRuleDefaults,
  BootstrapRuleError,
  UnknownRuleError,
  assertKnownRuleId,
  BootstrapRuleValidationError,
  validateRuleIds,
} from "./rules.js";

export {
  type BootstrapState,
  BOOTSTRAP_STATE_KEY,
  BOOTSTRAP_RULES_KEY,
  BOOTSTRAP_STATE_PATH,
  type ResolvedBootstrapState,
  resolveBootstrapState,
  type SetBootstrapRuleResult,
  setBootstrapRuleEnabled,
} from "./state.js";

export {
  BOOTSTRAP_BLOCK_START,
  BOOTSTRAP_BLOCK_END,
  CONTRACT_FILENAME,
  wrapBootstrapBlock,
  type RuleMarkerSuffix,
  ruleMarker,
  BootstrapRenderError,
  bootstrapContractPath,
  bootstrapStateFilePath,
  type RenderBootstrapOptions,
  type BootstrapRender,
  renderBootstrap,
} from "./render.js";

export {
  BOOTSTRAP_RENDER_STATUSES,
  type BootstrapRenderStatus,
  type BootstrapRenderResult,
  type BootstrapReport,
  bootstrapReportSucceeded,
  buildBootstrapReport,
} from "./report.js";

export {
  BootstrapEngineError,
  type BootstrapApplyOptions,
  applyBootstrapState,
} from "./engine.js";

export { formatBootstrapInventory, formatBootstrapReport } from "./format.js";

export { ConfigParseError } from "../config/config-loader.js";
