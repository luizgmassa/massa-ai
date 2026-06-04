/**
 * Predictive Prefetch — anticipatory attention.
 *
 * Helpers for warming a session's working-memory buffer before the agent
 * asks. Strategy is intentionally simple here so the consumer (a tool
 * handler, an IDE plugin) controls scheduling and the actual DB calls:
 *
 *   1. extractTopics(filePath, symbols)
 *        Builds a topic phrase from a file path and (optionally) its symbol
 *        definitions. The phrase is used as a search query for related
 *        memories.
 *
 *   2. buildPrefetchPlan(input, config)
 *        Decides what to fetch (chains, minImportance, maxResults). The
 *        consumer executes the search and primes the buffer with whatever
 *        is returned.
 *
 * Default `enabled: false` — experimental until we have telemetry on
 * which patterns actually win.
 */

export interface PrefetchConfig {
  enabled: boolean;
  /** Maximum number of memories to warm-load per file open. */
  maxResults: number;
  /** Minimum importance of memories to consider for prefetch. */
  minImportance: number;
  /** Memory chains (Memory.type values) to query. */
  chains: string[];
}

export interface PrefetchInput {
  filePath: string;
  symbols?: Array<{ name: string }>;
}

export interface PrefetchPlan {
  enabled: boolean;
  query: string;
  chains: string[];
  minImportance: number;
  maxResults: number;
  /** Hint to the buffer layer: how much TTL to apply (shorter than query TTL). */
  ttlMs: number;
}

const SEGMENT_RE = /[A-Za-z0-9]+/g;
const STOP = new Set([
  "src",
  "lib",
  "test",
  "tests",
  "spec",
  "index",
  "main",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "rs",
  "go",
  "java",
  "dart",
]);

/**
 * Pull human-readable tokens out of a path + optional symbol names.
 * "src/auth/middleware.ts" + [{name: "verifyJwt"}] -> ["auth", "middleware", "verify", "jwt"]
 */
export function extractTopics(input: PrefetchInput): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const addToken = (raw: string) => {
    for (const part of raw.split(/(?=[A-Z])/)) {
      const lower = part.toLowerCase();
      const cleaned = lower.match(SEGMENT_RE)?.join("") ?? "";
      if (cleaned.length < 3 || STOP.has(cleaned) || seen.has(cleaned)) continue;
      seen.add(cleaned);
      out.push(cleaned);
    }
  };

  for (const match of input.filePath.matchAll(SEGMENT_RE)) {
    addToken(match[0]);
  }
  if (input.symbols) {
    for (const s of input.symbols) addToken(s.name);
  }
  return out;
}

export function buildPrefetchPlan(
  input: PrefetchInput,
  config: PrefetchConfig,
): PrefetchPlan {
  const topics = extractTopics(input);
  return {
    enabled: config.enabled && topics.length > 0,
    query: topics.join(" "),
    chains: config.chains,
    minImportance: config.minImportance,
    maxResults: config.maxResults,
    ttlMs: 5 * 60 * 1000,
  };
}

/**
 * Result entries the caller provides for priming. Same shape as
 * `WorkingMemoryBuffer.prime` consumes, kept loose so the consumer doesn't
 * need to depend on SearchResult in its own code path.
 */
export interface PrefetchEntry {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Plan + execute: given a session and a function that knows how to fetch
 * related memories, build the plan and prime the session's buffer with the
 * returned entries. Returns a summary the caller can log or return as the
 * API response. Errors are swallowed (fire-and-forget semantics).
 */
export async function executePrefetch(
  input: PrefetchInput,
  fetchEntries: (plan: PrefetchPlan) => Promise<PrefetchEntry[]>,
  primeFn: (entries: PrefetchEntry[]) => number,
  config: PrefetchConfig = DEFAULT_PREFETCH_CONFIG,
): Promise<{ enabled: boolean; query: string; primed: number; skippedReason?: string }> {
  const plan = buildPrefetchPlan(input, config);
  if (!plan.enabled) {
    return { enabled: false, query: plan.query, primed: 0, skippedReason: "no-topics-or-disabled" };
  }
  try {
    const entries = await fetchEntries(plan);
    if (entries.length === 0) {
      return { enabled: true, query: plan.query, primed: 0, skippedReason: "no-matches" };
    }
    const primed = primeFn(entries);
    return { enabled: true, query: plan.query, primed };
  } catch (err) {
    return {
      enabled: true,
      query: plan.query,
      primed: 0,
      skippedReason: `fetch-error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export const DEFAULT_PREFETCH_CONFIG: PrefetchConfig = {
  enabled: false, // experimental — opt-in
  maxResults: 10,
  minImportance: 0.5,
  chains: ["decision", "pattern", "code"],
};
