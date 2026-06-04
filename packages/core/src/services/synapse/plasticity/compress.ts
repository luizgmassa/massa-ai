/**
 * Compress — selective compression of mid-importance, aging memories.
 *
 * Pure orchestration. The LLM call itself is injected as a callback so this
 * module has zero IO dependencies and is easy to unit-test. Marked experimental:
 * default `enabled: false` in config.
 *
 * Algorithm:
 *   1. Filter candidates by importance band and age (memories worth keeping
 *      but not worth storing in full).
 *   2. Call `summarize` (callback) to produce a condensed string. The caller
 *      can plug in any LLM provider (Ollama, OpenAI, etc.).
 *   3. Return a CompressUpdate per memory describing the payload that the
 *      caller should persist (originalHash, parentId, new content, etc.).
 *
 * Compression preserves the original via parentId, so it is reversible at
 * the data layer. Synapse itself never mutates the DB.
 */

export interface CompressionCandidate {
  id: string;
  content: string;
  importance: number;
  /** ms since epoch */
  createdAt: number;
}

export interface CompressConfig {
  enabled: boolean;
  /** Min importance for a candidate to be considered (must exceed). */
  minImportance: number;
  /** Max importance — strongest memories are left intact. */
  maxImportance: number;
  /** Min age in ms for compression to apply. */
  minAgeMs: number;
  /** Skip candidates whose content is already short. */
  minContentLength: number;
  /** Batch limit per cycle to avoid hot-pathing the LLM. */
  maxBatchSize: number;
}

export interface CompressUpdate {
  id: string;
  newContent: string;
  parentId: string;
  originalHash: string;
  /** Token reduction estimate (chars proxy if no tokenizer available). */
  charsBefore: number;
  charsAfter: number;
}

export type SummarizeFn = (input: {
  id: string;
  content: string;
}) => Promise<string>;

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

/**
 * Filter candidates that match the compression criteria. Pure, no IO.
 */
export function selectCompressionCandidates(
  memories: CompressionCandidate[],
  config: CompressConfig,
  now: number = Date.now(),
): CompressionCandidate[] {
  if (!config.enabled) return [];
  return memories
    .filter(
      (m) =>
        m.importance > config.minImportance &&
        m.importance < config.maxImportance &&
        now - m.createdAt >= config.minAgeMs &&
        m.content.length >= config.minContentLength,
    )
    .slice(0, config.maxBatchSize);
}

/**
 * Compress a batch using the provided summarize callback. Returns the
 * updates that should be persisted by the caller. Summaries shorter than
 * 50% of the original are kept as a basic quality gate; longer summaries
 * are dropped because they would not produce token savings.
 */
export async function compressBatch(
  candidates: CompressionCandidate[],
  summarize: SummarizeFn,
  config: CompressConfig,
): Promise<CompressUpdate[]> {
  if (!config.enabled || candidates.length === 0) return [];
  const updates: CompressUpdate[] = [];

  for (const c of candidates) {
    try {
      const newContent = await summarize({ id: c.id, content: c.content });
      if (!newContent || newContent.length === 0) continue;
      if (newContent.length >= c.content.length * 0.5) continue; // quality gate
      updates.push({
        id: c.id,
        newContent,
        parentId: c.id,
        originalHash: fnv1a(c.content),
        charsBefore: c.content.length,
        charsAfter: newContent.length,
      });
    } catch {
      // Skip individual failures; never let a single summarize call abort
      // the rest of the batch.
      continue;
    }
  }

  return updates;
}

export const DEFAULT_COMPRESS_CONFIG: CompressConfig = {
  enabled: false, // experimental — opt-in
  minImportance: 0.3,
  maxImportance: 0.5,
  minAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  minContentLength: 200,
  maxBatchSize: 50,
};
