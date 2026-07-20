export {
  PROJECT_IDENTITY_MAX_PROJECT_ID_LENGTH,
  PROJECT_IDENTITY_PLAN_VERSION,
  ProjectIdentityApplyRequestSchema,
  ProjectIdentityModeSchema,
  ProjectIdentityPreviewRequestSchema,
  parseProjectIdentityApplyRequest,
  parseProjectIdentityPreviewRequest,
} from "./contracts.js";
export type {
  ProjectIdentityApplyInput,
  ProjectIdentityApplyRequest,
  ProjectIdentityApplyResult,
  ProjectIdentityConflict,
  ProjectIdentityMode,
  ProjectIdentityPlanMaterial,
  ProjectIdentityPreview,
  ProjectIdentityPreviewInput,
  ProjectIdentityPreviewRequest,
  ProjectIdentityService,
  ProjectIdentityStoreCount,
  ProjectIdentityTransactionClient,
} from "./contracts.js";
export {
  canonicalProjectIdentityJson,
  hashProjectIdentityPlan,
  hashProjectIdentityRequest,
} from "./hash.js";
export { ProjectIdentityError } from "./errors.js";
export type { ProjectIdentityErrorCode } from "./errors.js";
export {
  discoverProjectIdentityStorage,
  fingerprintProjectIdentityRows,
  inspectIdentityPayload,
  quoteDiscoveredIdentifier,
} from "./discovery.js";
export type {
  DiscoveredDirectStore,
  DiscoveredPayloadStore,
  ProjectIdentityInventory,
  ProjectIdentityQueryClient,
  ProjectIdentityQueryResult,
} from "./discovery.js";
export { ProjectIdentityPreviewPlanner, computeIdentityPlan } from "./planner.js";
export type { ProjectIdentityPlan } from "./planner.js";
export {
  ProjectIdentityApplyService,
  createProjectIdentityApplyService,
} from "./apply.js";
export type {
  ProjectIdentityChangedPayload,
  ProjectIdentityChangedPublisher,
  ProjectIdentityTransactionRunner,
} from "./apply.js";
export {
  PROJECT_IDENTITY_REGISTRY_VERSION,
  STATIC_DIRECT_STORES,
  directStorePolicy,
  isKnownRegistryTable,
  payloadStorePolicies,
} from "./registry.js";
export type { DirectStorePolicy, IdentityColumn, PayloadStorePolicy } from "./registry.js";
export {
  installGuardOnTable,
  installProjectIdentityGuards,
  installProjectIdentityGuardsFromPool,
} from "./identity-guard-installer.js";
export type {
  IdentityGuardInstallerClient,
  ProjectIdentityGuardInstallReport,
} from "./identity-guard-installer.js";
export {
  EMPTY_INVALIDATION_REPORT,
  ProjectIdentityInvalidatorRegistry,
} from "./invalidator-registry.js";
export type {
  ProjectIdentityInvalidationReport,
  ProjectIdentityInvalidator,
} from "./invalidator-registry.js";
export {
  createEventBusProjectIdentityChangedPublisher,
  createProductionProjectIdentityInvalidatorRegistry,
} from "./production-wiring.js";
export type {
  ProductionInvalidatorTargetResolver,
  ProductionInvalidatorTargets,
} from "./production-wiring.js";
export {
  ProjectIdentityAliasResolver,
  getProjectIdentityAliasResolver,
  setProjectIdentityAliasResolverForTests,
} from "./alias-resolver.js";
export type {
  AliasResolverQuerier,
  ProjectIdentityAliasResolverOptions,
} from "./alias-resolver.js";
