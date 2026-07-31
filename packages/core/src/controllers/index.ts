/**
 * @massa-ai/core - Controllers Export
 *
 * Orchestration layer between tools (thin MCP handlers) and
 * services/data (domain logic + persistence).
 */

export { MemoryController } from "../services/memory/memory-controller.js";
export type {
  StoreMemoryInput,
  StoreMemoryResult,
  SearchMemoryInput,
  SearchMemoryResult,
} from "../services/memory/memory-controller.js";

export { SearchController } from "../services/search/search-controller.js";
export type {
  ProjectSearchInput,
  ProjectSearchResult,
} from "../services/search/search-controller.js";

export { ContextController } from "../services/context/context-controller.js";
export type {
  GetOptimizedContextInput,
  OptimizedContextResult,
} from "../services/context/context-controller.js";

export { ExecutorController } from "../services/executor/executor-controller.js";

export { GraphController } from "./graph-controller.js";
export type { TracePathInput, TracePathOutput } from "./graph-controller.js";
export type { ImpactAnalysisInput, ImpactAnalysisOutput } from "./graph-controller.js";
