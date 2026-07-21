/**
 * Active-graph-generation lookup + stale-generation precondition (N1).
 *
 * Two helpers consumed by the graph-reader tool handlers in T11
 * (`impact_analysis`, `trace_path`, `get_references`, `search_definitions`):
 *
 *   1. `getActiveGeneration(projectId)` — returns the workspace's current
 *      `active_graph_generation_id` or `null` (never-indexed / vector-only
 *      workspace). Surfaces the token clients cache and send back as
 *      `ifNoneMatch`.
 *   2. `assertGenerationNotStale(ifNoneMatch, current)` — opt-in precondition.
 *      Throws a 412 `ToolError` when the client's cached generation is stale
 *      or when no active generation exists at all. No-op when `ifNoneMatch`
 *      is omitted/empty (opt-in).
 *
 * `search_code` is EXCLUDED from this contract: vector + keyword search is
 *      graph-independent, so it neither calls these helpers nor accepts
 *      `ifNoneMatch`.
 *
 * Precedent: `symbol-graph.service.ts:455` already surfaces
 * `activatedGraphGenerationId` on `project_map`; this module is the reusable
 * form for the other graph readers.
 */

import { ToolError } from "../../tools/enum-validation.js";
import { getSymbolRepository } from "../../data/symbol/symbol-repository-factory.js";

/**
 * Look up the current active graph generation id for a workspace.
 *
 * @returns The active `generationId`, or `null` when the workspace has no
 *   active generation (never indexed, or vector-only workspace).
 */
export async function getActiveGeneration(projectId: string): Promise<string | null> {
  const scope = await getSymbolRepository().getActiveGenerationScope(projectId);
  return scope?.generationId ?? null;
}

/**
 * Opt-in precondition: throw a 412 teaching error when the client's cached
 * generation id (`ifNoneMatch`) does not match the workspace's current active
 * generation. No-op when `ifNoneMatch` is omitted or empty (opt-in).
 *
 * @throws ToolError("No active generation: index the project before querying.", 412)
 *   when `ifNoneMatch` is set and `current === null`.
 * @throws ToolError("Stale generation: client held <ifNoneMatch>, current is <current>. Re-read the project map before retrying.", 412)
 *   when `ifNoneMatch` is set, `current` is set, and they differ.
 */
export function assertGenerationNotStale(
  ifNoneMatch: string | undefined,
  current: string | null,
): void {
  if (!ifNoneMatch) return; // opt-in: omitted or empty string → no precondition
  if (current === null) {
    throw new ToolError(
      "No active generation: index the project before querying.",
      412,
    );
  }
  if (ifNoneMatch !== current) {
    throw new ToolError(
      `Stale generation: client held ${ifNoneMatch}, current is ${current}. Re-read the project map before retrying.`,
      412,
    );
  }
}