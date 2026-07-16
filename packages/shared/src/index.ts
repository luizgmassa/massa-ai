/**
 * @massa-th0th/shared - Tipos, utilitários e configuração compartilhados
 */

// Environment loader
export { ENV_LOADED } from "./env.js";

// Types
export * from "./types/index.js";
export * from "./types/interfaces.js";

// Utils
export * from "./utils/index.js";

// Config
export {
  Config,
  config,
  defaultConfig,
  type ServerConfig,
  type SynapseRuntimeConfig,
  type DecayParams,
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_CODE_MODEL,
  getGlobalDataDir,
  getConfigDir,
  getConfigPath,
  configExists,
  loadConfig,
  loadConfigSafe,
  saveConfig,
  initConfig,
  getConfigForEnv,
  migrateDataDirOnce,
  type MassaTh0thConfig,
  defaultMassaTh0thConfig,
} from "./config/index.js";
