/**
 * Memory consolidation window (Phase 1, P1-CONSOLIDATE, borrowed from
 * ai-memory ConsolidatedBatch).
 *
 * Two-stage:
 *   1. Rule-based prefilter: cluster a candidate set by `project_id` and
 *      pairwise embedding cosine >= 0.65, bounding the window to top-N (8)
 *      most recent. No LLM. Returns null if no cluster of >= 2 exists.
 *   2. LLM merge: produce a `ConsolidatedBatch` via `generateObject` + a zod
 *      schema enforcing type/level enums. Returns null if the LLM is disabled
 *      or fails (caller's rule-based path proceeds).
 *
 * Pure over its inputs + the injected `llm` handle — no DB, no global state.
 */

import { z } from "zod";
import type { MemoryRow } from "../../data/memory/memory-repository.js";
import type { llm as LlmHandle } from "./llm-client.js";

/** Tunable prefilter constants. */
export const CONSOLIDATE_COSINE_THRESHOLD = 0.65;
export const CONSOLIDATE_MAX_WINDOW = 8;

const MEMORY_TYPE_VALUES = [
  "critical",
  "conversation",
  "code",
  "decision",
  "pattern",
] as const;

const MEMORY_LEVEL_VALUES = [0, 1, 2, 3, 4] as const;

/** Zod schema enforcing type/level enums — rejects malformed LLM output. */
export const ConsolidatedBatchSchema = z.object({
  summary: z.string().min(1),
  type: z.enum(MEMORY_TYPE_VALUES),
  level: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  rationale: z.string().min(1),
  sourceIds: z.array(z.string()).min(2),
});

export type ConsolidatedBatchInput = z.infer<typeof ConsolidatedBatchSchema>;

export interface ConsolidatedBatch {
  id: string;
  sourceIds: string[];
  summary: string;
  type: (typeof MEMORY_TYPE_VALUES)[number];
  level: (typeof MEMORY_LEVEL_VALUES)[number];
  rationale: string;
}

/** Candidate memory shape needed by the prefilter. */
export interface ConsolidateCandidate {
  id: string;
  projectId?: string | null;
  importance: number;
  /** Embedding as stored: Buffer/Uint8Array (DB BLOB), Float32Array, or number[]. */
  embedding?: Buffer | Uint8Array | number[] | Float32Array | null;
  createdAt?: number;
}

/** Injectable LLM surface (matches the `llm` export from llm-client.ts). */
export interface LlmSurface {
  object<T>(prompt: string, schema: z.ZodSchema<T>, opts?: { timeoutMs?: number }): Promise<
    { ok: boolean; value?: T; error?: string }
  >;
  isEnabled(): boolean;
}

function vecFrom(raw: ConsolidateCandidate["embedding"]): number[] | null {
  if (!raw) return null;
  // Buffer, Uint8Array, and Float32Array are all ArrayBufferView-backed.
  // bun:sqlite returns BLOB columns as Uint8Array (not always a Buffer), so
  // duck-type on the byte-length rather than `instanceof Buffer`.
  if (Array.isArray(raw)) return raw.length > 0 ? raw : null;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(raw as any)) {
    const view = raw as ArrayBufferView;
    const byteLen = (view as Uint8Array).byteLength ?? (view as any).length ?? 0;
    if (byteLen === 0) return null;
    const buf = (view as Uint8Array).buffer as ArrayBuffer;
    const byteOffset = (view as Uint8Array).byteOffset ?? 0;
    const floatLen = Math.floor(byteLen / 4);
    if (floatLen === 0) return null;
    return Array.from(new Float32Array(buf, byteOffset, floatLen));
  }
  if (raw && typeof (raw as Float32Array).length === "number") {
    return Array.from(raw as Float32Array);
  }
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

/**
 * Prefilter: pick the best cluster of >= 2 near-duplicate memories.
 * Returns the window (source candidates) or null if none qualifies.
 */
export function pickConsolidationWindow(
  candidates: ConsolidateCandidate[],
  opts: { threshold?: number; maxWindow?: number } = {},
): ConsolidateCandidate[] | null {
  const threshold = opts.threshold ?? CONSOLIDATE_COSINE_THRESHOLD;
  const maxWindow = opts.maxWindow ?? CONSOLIDATE_MAX_WINDOW;
  if (candidates.length < 2) return null;

  // Group by project_id (null grouped together). Within a group, find the
  // largest clique where every pair is >= threshold (greedy: seed with the
  // most-recent, grow by mutual similarity to all current members).
  const byProject = new Map<string, ConsolidateCandidate[]>();
  for (const c of candidates) {
    const key = c.projectId ?? "__null__";
    const arr = byProject.get(key) ?? [];
    arr.push(c);
    byProject.set(key, arr);
  }

  let best: ConsolidateCandidate[] = [];
  for (const group of byProject.values()) {
    if (group.length < 2) continue;
    // Sort by recency desc (createdAt) — most recent first.
    const sorted = [...group].sort(
      (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );
    // Seed with the most recent that has an embedding.
    const seedIdx = sorted.findIndex((c) => vecFrom(c.embedding) !== null);
    if (seedIdx === -1) continue;
    const seed = sorted[seedIdx];
    const seedVec = vecFrom(seed.embedding)!;
    const clique: ConsolidateCandidate[] = [seed];
    for (let i = 0; i < sorted.length && clique.length < maxWindow; i++) {
      if (i === seedIdx) continue;
      const cand = sorted[i];
      const candVec = vecFrom(cand.embedding);
      if (!candVec) continue;
      // Must be similar to ALL current clique members.
      if (clique.every((m) => cosineSimilarity(vecFrom(m.embedding)!, candVec) >= threshold)) {
        clique.push(cand);
      }
    }
    if (clique.length >= 2 && clique.length > best.length) {
      best = clique;
    }
  }

  return best.length >= 2 ? best : null;
}

function buildPrompt(window: ConsolidateCandidate[]): string {
  const items = window
    .map(
      (c, i) =>
        `[${i}] id=${c.id} importance=${c.importance.toFixed(2)}\n${"(content not available at prefilter stage)"}`,
    )
    .join("\n");
  return [
    "You are consolidating a cluster of near-duplicate agent memories into one summary memory.",
    "Produce a single consolidated memory that subsumes the sources. The new memory's type and level must be one of the allowed enum values.",
    "sourceIds MUST be exactly the provided ids.",
    "",
    "Sources:",
    items,
    "",
    "Return JSON: { summary, type, level, rationale, sourceIds }.",
  ].join("\n");
}

/**
 * Run the full two-stage consolidation over a candidate set. Returns a
 * ConsolidatedBatch on success, or null when:
 *   - no qualifying cluster exists (prefilter),
 *   - the LLM is disabled,
 *   - the LLM fails or returns an invalid object.
 *
 * `idFactory` is injected so callers/tests can control the batch id.
 */
export async function consolidateWindow(
  candidates: ConsolidateCandidate[],
  llm: LlmSurface,
  opts: {
    threshold?: number;
    maxWindow?: number;
    idFactory?: () => string;
  } = {},
): Promise<ConsolidatedBatch | null> {
  const window = pickConsolidationWindow(candidates, opts);
  if (!window) return null;

  if (!llm.isEnabled()) return null;

  const prompt = buildPrompt(window);
  const result = await llm.object(prompt, ConsolidatedBatchSchema);
  if (!result.ok || !result.value) return null;

  const batch: ConsolidatedBatch = {
    id: opts.idFactory ? opts.idFactory() : `batch-${Date.now()}`,
    sourceIds: result.value.sourceIds,
    summary: result.value.summary,
    type: result.value.type,
    level: result.value.level,
    rationale: result.value.rationale,
  };
  return batch;
}

/** Convenience: convert MemoryRow[] to candidates (embedding preserved as Buffer). */
export function rowsToCandidates(rows: MemoryRow[]): ConsolidateCandidate[] {
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    importance: r.importance,
    embedding: r.embedding,
    createdAt: r.created_at,
  }));
}
