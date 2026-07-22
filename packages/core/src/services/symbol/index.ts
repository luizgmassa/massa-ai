/**
 * Symbol Service Exports
 */

export { symbolGraphService, SymbolGraphService } from "./symbol-graph.service.js";
export {
  DefinitionLookupService,
  definitionLookupService,
  toSymbolIdentityResolution,
} from "./definition-lookup.js";
export type { DefinitionLookupResult } from "./definition-lookup.js";
export { computePageRank } from "./centrality.js";
export { runLouvain } from "./communities.js";
export type {
  Community,
  CommunityResult,
  CommunityOptions,
  WeightedEdge,
} from "./communities.js";
export {
  computeArchitectureMap,
  detectPackages,
  detectEntryPoints,
  detectRoutes,
  detectHotspots,
  labelCommunities,
  classifyLayers,
} from "./architecture.js";
export type {
  ArchitectureMap,
  ArchitectureInput,
  ArchitectureOptions,
  ArchitectureAspect,
  PackageInfo,
  EntryPoint,
  RouteInfo,
  HotspotInfo,
  LayerInfo,
  CommunityInfo,
  CycleInfo,
  InternalImport,
  SymbolDefLite,
  HttpEdgeLite,
  CallEdge,
} from "./architecture.js";
export { VALID_ARCHITECTURE_ASPECTS } from "./architecture.js";
export { detectCycles, DEFAULT_CYCLE_EDGE_BUDGET } from "./cycle-detection.js";
export type { SCC, DetectCyclesResult } from "./cycle-detection.js";
export { TracePathService, tracePathService } from "./trace-path.js";
export type {
  TracePathOptions,
  TracePathResult,
  TraceNode,
  TraceEdge,
  TraceDirection,
  TraceMode,
} from "./trace-path.js";
export { ImpactAnalysisService, impactAnalysisService, defaultDiffRunner } from "./impact-analysis.js";
export type {
  ImpactAnalysisOptions,
  ImpactAnalysisResult,
  ImpactScope,
  ChangedFile,
  ImpactedSymbol,
} from "./impact-analysis.js";
export type {
  DefinitionResult,
  ReferenceResult,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  ListDefinitionsOptions,
} from "./symbol-graph.service.js";
