/**
 * @massa-ai/core - Lógica de negócio do massa-ai
 *
 * Contém tools, services, data, kernel e models
 * independente do protocolo de transporte (MCP, HTTP, etc.)
 *
 * Architecture (4 layers), enforced by directory — `scripts/check-core-layering.ts`:
 *   tools/     → Thin MCP handlers (schema + delegation, no logic)
 *   services/  → Domain logic AND orchestration (search, memory, graph, executor)
 *   data/      → Persistence (PostgreSQL, vector store, FTS, migrations)
 *   kernel/    → Cross-cutting leaves. Any tier may import kernel; kernel imports none.
 *
 * Imports run one way — tools → services → data — so `data → services` is a
 * violation rather than a shortcut, and `kernel/` is what a module joins instead
 * of becoming an allowlisted exception. There is no allowlist.
 *
 * `controllers/` was a fifth layer and is retired (PR-C): the five orchestrators
 * moved into the `services/` directory that already held their collaborators,
 * keeping their exported names, and are re-exported through `./services/index.js`.
 *
 * This header and `CLAUDE.md`'s Architecture section are the only two descriptions
 * of this contract. Do not add a third.
 */

// Tools
export * from "./tools/index.js";

// Services — the five orchestrators are re-exported from this barrel too (T13),
// so retiring `controllers/` changed no symbol on this surface.
export * from "./services/index.js";

// Data
export { MemoryRepositoryPg } from "./data/memory/memory-repository-pg.js";
export { getMemoryRepository } from "./data/memory/memory-repository-factory.js";
export type {
  MemoryRow,
  InsertMemoryInput,
  SearchFilters,
} from "./data/memory/memory-repository-contract.js";
export { getVectorStore, resetVectorStore } from "./services/vector/vector-store-factory.js";
export * from "./data/graph-generation/index.js";

// M8 — audit-log attribution for destructive operations (who/when/what/scope/result)
export { OperationLogRepositoryPg } from "./data/audit/operation-log-pg.js";
export { getOperationLogRepository } from "./data/audit/operation-log-factory.js";
export type {
  ActorContext,
  OperationResult,
  RecordOperationInput,
  OperationLogRow,
  OperationLogRepository,
} from "./data/audit/operation-log-contract.js";
export { UNKNOWN_ACTOR } from "./data/audit/operation-log-contract.js";

// Phase 3 — passive lifecycle capture (hook ingestion)
export {
  MemoryObservationStore,
  getObservationStore,
  resetObservationStore,
  newObservationId,
  LIFECYCLE_EVENTS,
  OBSERVATION_CATEGORIES,
  ATTRIBUTION_SOURCES,
} from "./data/memory/observation-repository.js";
export { PgObservationStore } from "./data/memory/observation-repository-pg.js";
export type { ObservationStore } from "./data/memory/observation-repository.js";
export type {
  Observation,
  ObservationRow,
  LifecycleEventKind,
  ObservationCategory,
  AttributionSource,
} from "./data/memory/observation-repository.js";
export {
  HookService,
  ValidationError,
  getHookService,
  resetHookService,
  validateEvent,
} from "./services/hooks/hook-service.js";
export type {
  IncomingEvent,
  NormalizedEvent,
  BridgeTrigger,
} from "./services/hooks/hook-service.js";
export {
  WriterQueue,
  QueueSaturatedError,
} from "./services/hooks/writer-queue.js";
// Phase 3 C1 — expanded taxonomy + compaction snapshot
export {
  extractCategory,
  CATEGORY_LABELS,
} from "./services/hooks/observation-extractor.js";
export { CompactionSnapshotService } from "./services/hooks/compaction-snapshot-service.js";
export type {
  SnapshotBuildOptions,
  SnapshotSection,
  CompactionSnapshot,
} from "./services/hooks/compaction-snapshot-service.js";

// Phase 4 — repo bootstrap (seed memories)
export {
  BootstrapService,
  getBootstrapService,
  resetBootstrapService,
  bootstrapService,
  SeedMemoriesSchema,
  scanSignals,
  summarizeWithLlm,
  ruleBasedSeed,
  storeSeeds,
  countSignals,
} from "./services/bootstrap/bootstrap-service.js";
export type {
  BootstrapSeed,
  BootstrapSignals,
  BootstrapResult,
  BootstrapOptions,
  BootstrapDeps,
  BootstrapSource,
  SeedType,
  MemoryRepoSeam,
  CentralitySource,
  GitRunner,
  SeedMemories,
} from "./services/bootstrap/bootstrap-service.js";

// Phase 6 — cross-session handoffs (G2)
export {
  MemoryHandoffStore,
  getHandoffStore,
  resetHandoffStore,
  newHandoffId,
  HANDOFF_STATUSES,
} from "./data/handoff/handoff-repository.js";
export type {
  HandoffStore,
  HandoffRecord,
  HandoffStatus,
} from "./data/handoff/handoff-repository.js";
export {
  HandoffService,
  getHandoffService,
  resetHandoffService,
  buildHandoffMemoryInput,
  formatMemoryContent,
} from "./services/handoff/handoff-service.js";
export type {
  BeginHandoffInput,
  BeginResult,
  AcceptCancelResult,
  HandoffMemorySeam,
  HandoffDeps,
} from "./services/handoff/handoff-service.js";
export { HandoffAutoInjector } from "./services/handoff/handoff-auto-injector.js";

// Phase 5 — auto-improvement loop (G7)
export {
  MemoryProposalStore,
  getProposalStore,
  resetProposalStore,
  newProposalId,
  PROPOSAL_STATUSES,
  PROPOSAL_KINDS,
} from "./data/proposal/proposal-repository.js";
// Exported so transports can identify a write-time payload rejection with
// `instanceof` rather than duck-typing `error.name`. `apps/tools-api`'s
// proposal routes need to map this to a 400, and without the class on the
// public surface the only available check was a string comparison against
// `name` — which a rename, a subclass, or a minifier breaks silently, turning
// a 400 into a 500 with no test able to see the difference.
export {
  ProposalPayloadValidationError,
  assertValidProposalPayload,
  isValidProposalPayload,
  PROPOSAL_PAYLOAD_RULES,
} from "./data/proposal/proposal-payload-validation.js";
export type {
  ProposalStore,
  ProposalRecord,
  ProposalStatus,
  ProposalKind,
  ProposalPayload,
  CreateMemoryPayload,
  UpdateMemoryPayload,
  TagMemoryPayload,
} from "./data/proposal/proposal-repository.js";
export {
  AutoImproveJob,
  getAutoImproveJob,
  resetAutoImproveJob,
  autoImproveJob,
  detectPatterns,
  enrichWithLlm,
  ProposalEnrichmentSchema,
} from "./services/jobs/auto-improve-job.js";
export type {
  AutoImproveJobOptions,
  AutoImproveResult,
  ApproveRejectResult,
  PatternThresholds,
  PatternCandidate,
  MemoryApplySeam,
  ProposalEnrichment,
} from "./services/jobs/auto-improve-job.js";

// Re-export types from shared for convenience
export type { ToolResponse, IToolHandler } from "@massa-ai/shared";
