/**
 * hybrid-search — the hybrid retrieval capability (design.md §4.1).
 *
 * PR-B capability module. Created at T9 with `correctQuery` only; T13 moves
 * `search`, `addContextToResults`, `extractPreview`, `calculateAvgScore` and
 * `filterByPatterns` here from rlm-search.ts, at which point this file becomes
 * the module §4.1's row describes. The file has never heard of
 * ContextualSearchRLM, so it contributes nothing to the root's foreign reach
 * (G-HUB, design.md §3.4).
 *
 * `correctQuery` arrives from rlm-synapse.ts rather than rlm-search.ts because
 * fuzzy query correction has nothing to do with Synapse: it reads
 * `keywordSearch` — the collaborator this module already owns — and its only
 * caller is `searchImpl` (design.md §4.2). It sat in the synapse module by
 * accident of M14's extraction order. rlm-synapse.ts dies with this move.
 *
 * `extractQueryTerms` is *imported* from lexical-search.ts, not moved. That
 * module carries a `data/` importer and is PR-C's to place (design.md §5.4,
 * constraint PR-C-BOUNDARY); importing it alters no layer edge.
 *
 * LATE-BIND (design.md §4.3.1): the root assembles this record per call from
 * its current field values. Nothing here captures a collaborator.
 *
 * Behavior is byte-preserved from rlm-synapse.ts: the body moved verbatim.
 */

import { extractQueryTerms } from "./lexical-search.js";
import type { getKeywordSearch } from "../../data/keyword/keyword-search-factory.js";

/**
 * The narrow dependency record for this module (design.md §4.4) — exactly the
 * collaborators the surfaces living here read, and nothing else. At T9 that is
 * one: `correctQuery`'s `keywordSearch`. **T13 widens this to the five §4.1
 * lists** (`keywordSearch`, `vectorStore`, `searchCache`, `analytics`,
 * `queryUnderstanding`) when `searchImpl` moves in. Declaring the full five now
 * would put fields here that nothing reads, which is the shape §4.4 forbids.
 *
 * `keywordSearch` is **required**, and it is the root's own field type rather
 * than a `Pick<>` narrowing. Both differ from SessionBiasDeps deliberately:
 * that record's fields are optional because its original reads were
 * `rlm.injectedDeps?.x ?? getFactory()`, whereas this one's was a bare
 * `rlm.keywordSearch.fuzzyCorrect` off a definite-assigned field with no
 * fallback — so an absent store must keep throwing exactly where it did. The
 * full type, not `Pick<…, "fuzzyCorrect">`, is what T13's surfaces need; a
 * narrowing here would make T13 widen the member surface *and* the collaborator
 * set, two axes of churn instead of one.
 */
export interface HybridSearchDeps {
  keywordSearch: Awaited<ReturnType<typeof getKeywordSearch>>;
}

/**
 * Fuzzy-correct each non-stopword query term via the keyword store's
 * vocabulary. Returns the corrected query string (lowercased, space-joined),
 * or null when no term corrects to a different word or fuzzyCorrect is
 * unavailable. Only words of length >= 3 are considered (shorter tokens
 * can't be reliably corrected).
 */
export async function correctQuery(
  deps: HybridSearchDeps,
  query: string,
): Promise<string | null> {
  if (typeof deps.keywordSearch.fuzzyCorrect !== "function") return null;
  const terms = extractQueryTerms(query).filter((w) => w.length >= 3);
  // Vocabulary-nearest correction is reliable for identifier typo probes
  // ("useEffct") but unsafe for natural-language sentences: ordinary
  // Portuguese words were rewritten to unrelated English code tokens and
  // added as an entire extra RRF stream.
  if (terms.length !== 1) return null;
  const corrected: string[] = [];
  let changed = false;
  for (const term of terms) {
    const fix = await deps.keywordSearch.fuzzyCorrect!(term);
    if (fix && fix !== term) {
      corrected.push(fix);
      changed = true;
    } else {
      corrected.push(term);
    }
  }
  return changed ? corrected.join(" ") : null;
}
