/**
 * Embedding Evolution — synaptic plasticity for retrieval space.
 *
 * Pure math. Given an original embedding and a small set of recent query
 * embeddings that produced this memory, returns a blended embedding that
 * "migrates" the memory toward the semantic space where it is actually
 * being looked up.
 *
 * Quality guard: if the centroid of recent queries diverges too far from
 * the original embedding (cosine < drift threshold), the blend is skipped
 * to avoid destabilizing memories that get used in genuinely different
 * contexts. The caller decides what to do in that case (split, tag, etc.).
 *
 * Default `enabled: false` — experimental.
 */

export interface EmbeddingEvolutionConfig {
  enabled: boolean;
  /** Minimum query embeddings required to compute a blend. */
  minSamples: number;
  /** Blend weight on the original embedding. */
  originalWeight: number;
  /** Blend weight on the centroid of recent queries. */
  centroidWeight: number;
  /** Skip the update if cosine(original, centroid) is below this. */
  driftThreshold: number;
}

export interface EvolutionInput {
  id: string;
  original: number[] | Float32Array;
  queryEmbeddings: Array<number[] | Float32Array>;
}

export interface EvolutionUpdate {
  id: string;
  blended: number[];
  driftCosine: number;
}

function cosine(a: number[] | Float32Array, b: number[] | Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function centroidOf(vectors: Array<number[] | Float32Array>): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

function blend(
  a: number[] | Float32Array,
  b: number[] | Float32Array,
  wa: number,
  wb: number,
): number[] {
  const dim = a.length;
  const out = new Array(dim);
  for (let i = 0; i < dim; i++) out[i] = wa * a[i] + wb * b[i];
  return out;
}

/**
 * Compute blended embeddings for a batch. Caller persists them.
 */
export function evolveEmbeddings(
  inputs: EvolutionInput[],
  config: EmbeddingEvolutionConfig,
): EvolutionUpdate[] {
  if (!config.enabled || inputs.length === 0) return [];
  const updates: EvolutionUpdate[] = [];

  for (const input of inputs) {
    if (input.queryEmbeddings.length < config.minSamples) continue;
    if (input.queryEmbeddings.some((q) => q.length !== input.original.length)) continue;

    const centroid = centroidOf(input.queryEmbeddings);
    const drift = cosine(input.original, centroid);
    if (drift < config.driftThreshold) continue;

    const blended = blend(
      input.original,
      centroid,
      config.originalWeight,
      config.centroidWeight,
    );
    updates.push({ id: input.id, blended, driftCosine: drift });
  }

  return updates;
}

export const DEFAULT_EMBEDDING_EVOLUTION_CONFIG: EmbeddingEvolutionConfig = {
  enabled: false, // experimental — opt-in
  minSamples: 5,
  originalWeight: 0.7,
  centroidWeight: 0.3,
  driftThreshold: 0.5,
};
