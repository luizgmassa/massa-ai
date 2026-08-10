/**
 * @massa-ai/shared - Tipos, utilitários e configuração compartilhados
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
  type MassaAiConfig,
  defaultMassaAiConfig,
  DEFAULT_CAPTURE_POLICY,
  DEFAULT_SCHEDULER_CONFIG,
  MAX_MATCH_WORK,
  MAX_IGNORE_PATTERNS,
  resolveApiKey,
  ApiKeyProvisioningError,
  type ResolvedApiKey,
  type ApiKeySource,
  savePartialConfig,
  maskSensitive,
  restartNeededSections,
  changedRestartSections,
  type SavePartialConfigResult,
} from "./config/index.js";

// Model-profile switch engine
export {
  HOSTS,
  isHost,
  type Host,
  resolveHostLayout,
  detectRoute,
  type HostFileLayout,
  type HostSkipLayout,
  type HostLayout,
  type ResolveHostLayoutOpts,
  type RouteDecision,
} from "./profile-switch/hosts.js";
export {
  readInstallState,
  writeInstallState,
  updatePlatform,
  InstallStateError,
  CorruptInstallStateError,
  UnwritableInstallStateError,
  type InstallState,
  type PlatformRecord,
  type PluginRecord,
  type InstallRoute,
  type ModelProfileRecord,
} from "./profile-switch/state.js";
export {
  acquireLock,
  LockError,
  LockHeldError,
  LockAcquireError,
  type AcquiredLock,
  type AcquireLockOptions,
  type LockIdentity,
  type LockClock,
} from "./profile-switch/lock.js";
export {
  listProfiles,
  switchProfile,
  SwitchEngineError,
  UnknownProfileError,
  NoHostsDetectedError,
  type ListProfilesOptions,
  type SwitchProfileOptions,
} from "./profile-switch/engine.js";
export {
  reportSucceeded,
  type HostProfileState,
  type ProfileInventory,
  type HostSwitchStatus,
  type HostSwitchResult,
  type SwitchReport,
} from "./profile-switch/report.js";
export { syncGeneratedVariants, type VariantSyncHostResult, type VariantSyncOptions } from "./profile-switch/variant-sync.js";
export { findRepoRootWithMarker } from "./profile-switch/repo-root.js";
