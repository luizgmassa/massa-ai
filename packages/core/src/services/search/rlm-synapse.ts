/**
 * rlm-synapse — Synapse session delegates for ContextualSearchRLM.
 *
 * Extracted (M14 Phase 3, T3.2) from contextual-search-rlm.ts. Behavior is
 * byte-preserved: bodies moved verbatim with `this` → `rlm`.
 *
 * PR-B T7 moved `buildGraphStream` out to graph-stream.ts and T8 moved
 * `applySynapseState` out to session-bias.ts. `correctQuery` is the last
 * survivor and the only remaining reader of the root here — one member,
 * `keywordSearch`. It leaves for hybrid-search.ts at T9, and that is the commit
 * this file dies in; it is not the Synapse module the name still claims, since
 * fuzzy query correction has nothing to do with Synapse (design.md §4.2).
 */

import { extractQueryTerms } from "./lexical-search.js";
import type { ContextualSearchRLM } from "./contextual-search-rlm.js";

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

