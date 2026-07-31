/**
 * session-bias — Synapse session state applied over a cached base result.
 *
 * PR-B capability module (design.md §4.1). Takes `SessionBiasDeps` — exactly
 * the two collaborators §2.1 shows this surface reads — in place of the facade
 * instance it used to receive as `rlm` (GMS-03 AC-1). The file has never heard
 * of ContextualSearchRLM, so it contributes nothing to the root's foreign reach
 * (G-HUB, design.md §3.4).
 *
 * Both fields are optional and the process factories stay the fallback, exactly
 * as `rlm.injectedDeps?.sessionRegistry ?? getSessionRegistry()` was. That is
 * not a convenience: the fallbacks resolve *after* the `!sessionId` early
 * return, so a no-session call still touches neither factory. Hoisting them
 * into the root's deps assembly would call both on every search and is the one
 * way this extraction could stop being behavior-preserving.
 *
 * LATE-BIND (design.md §4.3.1): the root assembles this record per call from
 * its current field values. Nothing here captures a collaborator.
 *
 * Behavior is byte-preserved from rlm-synapse.ts: the body moved verbatim.
 */

import { SearchResult, logger } from "@massa-ai/shared";
import { getSessionRegistry } from "../synapse/session/index.js";
import { getSynapseManager } from "../synapse/index.js";
import type { AgentSession } from "../synapse/types.js";
import type { SessionRegistry } from "../synapse/session/session-registry.js";
import type { SynapseManager } from "../synapse/synapse-manager.js";
import type { SearchDegradationReporter } from "./search-diagnostics.js";

/**
 * The narrow dependency record for this module (design.md §4.4) — the two
 * collaborators `applySynapseState` reads, and nothing else. Both are the same
 * structural subsets the root's constructor seam already accepts, so an
 * object literal is a complete stand-in (GMS-03 AC-2).
 */
export interface SessionBiasDeps {
  sessionRegistry?: Pick<SessionRegistry, "getAsync">;
  synapseManager?: Pick<SynapseManager, "process">;
}

/**
 * Apply session state after the session-independent base result is cached.
 * Invalid and workspace-mismatched sessions return the exact base array.
 */
export async function applySynapseState(
  deps: SessionBiasDeps,
  baseResults: SearchResult[],
  query: string,
  projectId: string,
  sessionId?: string,
  reportDegradation?: SearchDegradationReporter,
): Promise<SearchResult[]> {
  if (!sessionId) return baseResults;

  const registry = deps.sessionRegistry ?? getSessionRegistry();
  let session: AgentSession | null;
  try {
    session = await registry.getAsync(sessionId);
  } catch (error) {
    reportDegradation?.("SYNAPSE_UNAVAILABLE", "synapse_session_lookup");
    logger.warn("Synapse session lookup failed — using stateless search", {
      sessionId,
      projectId,
      error: (error as Error).message,
    });
    return baseResults;
  }

  if (!session || (session.workspaceId && session.workspaceId !== projectId)) {
    return baseResults;
  }

  const synapseManager = deps.synapseManager ?? getSynapseManager();
  const allowBufferInjection = session.workspaceId === projectId;
  let processed;
  try {
    processed = synapseManager.process(baseResults, query, {
      session,
      projectId,
      allowBufferInjection,
    });
  } catch (error) {
    reportDegradation?.("SYNAPSE_UNAVAILABLE", "synapse_processing");
    logger.warn("Synapse processing failed — using stateless search", {
      sessionId,
      projectId,
      error: (error as Error).message,
    });
    return baseResults;
  }
  const baseIds = new Set(baseResults.map((result) => result.id));

  return processed.results.filter((result) => {
    if (baseIds.has(result.id)) return true;
    const metadata = result.metadata as Record<string, unknown> | undefined;
    return allowBufferInjection && metadata?.projectId === projectId;
  });
}
