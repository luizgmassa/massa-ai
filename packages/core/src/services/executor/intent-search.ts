/**
 * Intent-driven progressive disclosure for execution output.
 *
 * When `execute` / `execute_file` output exceeds a threshold, returning it
 * verbatim floods the agent's context window. Instead, when the caller passes
 * an `intent` query, we:
 *   1. chunk the output into sections (reuse the existing smart-chunker),
 *   2. build a tiny IN-MEMORY keyword index (TF + title boost) over those
 *      sections,
 *   3. return ONLY the sections matching the intent query + a vocabulary-hint
 *      list (top distinctive terms).
 *
 * This mirrors context-mode `intentSearch` (server.ts:1982) in shape but is
 * self-contained — it does NOT touch the persistent FTS5/PG keyword store, so
 * it can never OOM the shared e2e index or trigger a full-repo index. If
 * `intent` is absent or output is below threshold, the output is returned
 * verbatim (no indexing at all).
 */

import { smartChunk, type Chunk } from "../search/smart-chunker.js";

/** Output ≥ this many bytes triggers intent search (when intent is set). */
export const INTENT_SEARCH_THRESHOLD = 5_000; // ~80-100 lines

export interface IntentSection {
  label: string;
  lineStart: number;
  lineEnd: number;
  preview: string;
}

export interface IntentSearchResult {
  /** Whether intent search actually ran (output large enough + intent set). */
  searched: boolean;
  /** Total output size (bytes). */
  totalBytes: number;
  /** Total output lines. */
  totalLines: number;
  /** Sections that matched the intent (only meaningful when searched). */
  matchedSections: IntentSection[];
  /** Distinctive vocabulary terms extracted from the output. */
  vocabularyHints: string[];
}

/** Stopwords excluded from both indexing and vocabulary hints. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "of",
  "to", "in", "on", "at", "by", "with", "from", "is", "are", "was", "were",
  "be", "been", "being", "this", "that", "these", "those", "it", "its",
  "as", "at", "use", "using", "used", "into", "not", "no", "yes", "true",
  "false", "null", "none", "undefined", "function", "return", "var", "let",
  "const", "import", "export", "class", "def", "func", "fn",
]);

/**
 * Return the first line of a chunk's content that is NOT a smart-chunker
 * metadata header (`// File:` / `// Section:`). Falls back to the first line
 * if every line is a header.
 */
function firstContentLine(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const t = line.trimStart();
    if (!t) continue;
    if (t.startsWith("// File:") || t.startsWith("// Section:")) continue;
    return line;
  }
  return lines[0] ?? "";
}

/** Tokenize for indexing/querying: lowercase alphanumeric words ≥3 chars. */
function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? [];
  return matches.filter((w) => !STOPWORDS.has(w));
}

interface IndexedSection {
  chunk: Chunk;
  /** term → count within this section */
  termFreq: Map<string, number>;
  /** number of distinct terms (for TF normalization) */
  maxFreq: number;
}

/**
 * Build an in-memory index over the chunked output and rank sections against
 * the intent query. Pure function — no side effects, no persistence.
 */
function searchSections(
  output: string,
  intent: string,
  maxResults: number,
): { sections: IndexedSection[]; results: IndexedSection[] } {
  // Chunk as if it were a .txt file → fixed-size fallback chunker.
  const chunks = smartChunk(output, "output.txt");
  const sections: IndexedSection[] = chunks.map((chunk) => {
    const tokens = tokenize(chunk.content);
    const termFreq = new Map<string, number>();
    let maxFreq = 0;
    for (const t of tokens) {
      const c = (termFreq.get(t) ?? 0) + 1;
      termFreq.set(t, c);
      if (c > maxFreq) maxFreq = c;
    }
    return { chunk, termFreq, maxFreq: Math.max(1, maxFreq) };
  });

  const queryTerms = tokenize(intent);
  if (queryTerms.length === 0) {
    return { sections, results: sections.slice(0, maxResults) };
  }

  // Score each section by sum of normalized term frequencies for query terms.
  // A title/label match adds a boost (labels carry high semantic signal).
  const scored = sections
    .map((s) => {
      let score = 0;
      for (const qt of queryTerms) {
        const tf = s.termFreq.get(qt);
        if (tf) score += tf / s.maxFreq;
      }
      if (s.chunk.label) {
        const labelTokens = new Set(tokenize(s.chunk.label));
        for (const qt of queryTerms) {
          if (labelTokens.has(qt)) score += 0.5;
        }
      }
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((x) => x.s);

  return { sections, results: scored };
}

/**
 * Extract the top distinctive terms across all sections (vocabulary hints for
 * the agent). A term is "distinctive" when it appears in few sections but is
 * frequent where it appears (high-ish IDF-like signal). Simple, bounded.
 */
function distinctiveTerms(sections: IndexedSection[], limit: number): string[] {
  const docFreq = new Map<string, number>(); // term → # sections containing it
  for (const s of sections) {
    for (const term of s.termFreq.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }
  const total = sections.length || 1;
  // Score = total occurrences / docFreq (terms concentrated in few docs rank
  // higher). Cap docFreq divisor at 1 so we never divide by zero.
  const scored: { term: string; score: number }[] = [];
  const termTotals = new Map<string, number>();
  for (const s of sections) {
    for (const [term, freq] of s.termFreq) {
      termTotals.set(term, (termTotals.get(term) ?? 0) + freq);
    }
  }
  for (const [term, total2] of termTotals) {
    const df = docFreq.get(term) ?? 1;
    scored.push({ term, score: total2 / Math.max(1, df) });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.term);
}

/**
 * Run intent search on `output` for `intent`. Returns the structured result;
 * the caller decides how to render it.
 *
 * Returns `searched: false` (and empty arrays) when the output is too small
 * or no intent was provided — in that case the caller returns output verbatim.
 */
export function intentSearch(
  output: string,
  intent: string | undefined,
  maxResults = 5,
): IntentSearchResult {
  const totalBytes = Buffer.byteLength(output);
  const totalLines = output.split("\n").length;

  if (!intent || intent.trim().length === 0 || totalBytes < INTENT_SEARCH_THRESHOLD) {
    return {
      searched: false,
      totalBytes,
      totalLines,
      matchedSections: [],
      vocabularyHints: [],
    };
  }

  const { sections, results } = searchSections(output, intent, maxResults);
  const matchedSections: IntentSection[] = results.map((s) => ({
    label: s.chunk.label ?? `lines ${s.chunk.lineStart}-${s.chunk.lineEnd}`,
    lineStart: s.chunk.lineStart,
    lineEnd: s.chunk.lineEnd,
    // smart-chunker prepends `// File:` / `// Section:` context lines to each
    // chunk's content; skip those so the preview shows real content, not the
    // chunker's own metadata header.
    preview: firstContentLine(s.chunk.content).slice(0, 120),
  }));
  const vocabularyHints = distinctiveTerms(sections, 10);

  return {
    searched: true,
    totalBytes,
    totalLines,
    matchedSections,
    vocabularyHints,
  };
}

/**
 * Render an IntentSearchResult as a human-readable summary string (the shape
 * agents consume when intent search fires). Mirrors the context-mode layout.
 */
export function renderIntentResult(
  result: IntentSearchResult,
  intent: string,
): string {
  if (!result.searched) return "";
  const lines: string[] = [];
  lines.push(
    `Output trimmed via intent "${intent}" (${result.totalLines} lines, ${(result.totalBytes / 1024).toFixed(1)}KB).`,
  );
  if (result.matchedSections.length === 0) {
    lines.push(`No sections matched intent "${intent}".`);
  } else {
    lines.push(`${result.matchedSections.length} sections matched:`);
    lines.push("");
    for (const m of result.matchedSections) {
      lines.push(`  - ${m.label} (L${m.lineStart}-${m.lineEnd}): ${m.preview}`);
    }
  }
  if (result.vocabularyHints.length > 0) {
    lines.push("");
    lines.push(`Searchable terms: ${result.vocabularyHints.join(", ")}`);
  }
  return lines.join("\n");
}
