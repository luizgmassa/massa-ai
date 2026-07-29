/**
 * rlm-synapse — Synapse session delegates for ContextualSearchRLM.
 *
 * Extracted (M14 Phase 3, T3.2) from contextual-search-rlm.ts. Behavior is
 * byte-preserved: bodies moved verbatim with `this` → `rlm`.
 *
 * PR-B T7 moved `buildGraphStream` out to graph-stream.ts. It was the one
 * function here that read zero facade members, so its departure leaves this
 * file's foreign reach unchanged at 2 (`injectedDeps`, `keywordSearch`) —
 * those go at T8 and T9, and only then does this module stop reading the root.
 */

import { SearchResult, logger } from "@massa-ai/shared";
import { getSessionRegistry } from "../synapse/session/index.js";
import { getSynapseManager } from "../synapse/index.js";
import { extractQueryTerms } from "./lexical-search.js";
import type { AgentSession } from "../synapse/types.js";
import type { ContextualSearchRLM } from "./contextual-search-rlm.js";
import type { SearchDegradationReporter } from "./search-diagnostics.js";

/**
 * Apply session state after the session-independent base result is cached.
 * Invalid and workspace-mismatched sessions return the exact base array.
 */
export async function applySynapseStateImpl(
  rlm: ContextualSearchRLM,
  baseResults: SearchResult[],
  query: string,
  projectId: string,
  sessionId?: string,
  reportDegradation?: SearchDegradationReporter,
): Promise<SearchResult[]> {
  if (!sessionId) return baseResults;

  const registry = rlm.injectedDeps?.sessionRegistry ?? getSessionRegistry();
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

  const synapseManager = rlm.injectedDeps?.synapseManager ?? getSynapseManager();
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

/**
 * Fuzzy-correct each non-stopword query term via the keyword store's
 * vocabulary. Returns the corrected query string (lowercased, space-joined),
 * or null when no term corrects to a different word or fuzzyCorrect is
 * unavailable. Only words of length >= 3 are considered (shorter tokens
 * can't be reliably corrected).
 */
export async function correctQueryImpl(
  rlm: ContextualSearchRLM,
  query: string,
): Promise<string | null> {
  if (typeof rlm.keywordSearch.fuzzyCorrect !== "function") return null;
  const terms = extractQueryTerms(query).filter((w) => w.length >= 3);
  // Vocabulary-nearest correction is reliable for identifier typo probes
  // ("useEffct") but unsafe for natural-language sentences: ordinary
  // Portuguese words were rewritten to unrelated English code tokens and
  // added as an entire extra RRF stream.
  if (terms.length !== 1) return null;
  const corrected: string[] = [];
  let changed = false;
  for (const term of terms) {
    const fix = await rlm.keywordSearch.fuzzyCorrect!(term);
    if (fix && fix !== term) {
      corrected.push(fix);
      changed = true;
    } else {
      corrected.push(term);
    }
  }
  return changed ? corrected.join(" ") : null;
}

