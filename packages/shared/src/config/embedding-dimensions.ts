/**
 * The embedding width a known model actually produces.
 *
 * This is the TypeScript half of a table that also exists in bash
 * (`installer_embedding_dimensions` in `scripts/lib/installer-api-key.sh`).
 * A shell installer cannot import this module, so the duplication is forced;
 * `embedding-defaults-parity.test.ts` holds the two closed by comparing them
 * to each other, because the defect class here has always been divergence
 * between writers rather than a mistake inside one.
 *
 * Why a runtime copy is needed at all. Fixing the installer template only ever
 * fixes what a *new* install writes. An install created before that fix keeps
 * whatever `dimensions` it was given, and for a machine that had
 * `qwen3-embedding:4b` (2560) recorded beside `4096`, the effect is not
 * cosmetic: `createEmbeddingProvider` refuses to fall through on a dimension
 * mismatch — deliberately, so retrieval never silently degrades — so every
 * embedding path throws `DimensionMismatchError` until someone hand-edits
 * config.json. Deriving the width from the model turns that into a warning and
 * a correct value.
 *
 * Precedence, and the reason for it: an explicit env var still wins (an
 * operator override is a decision), and a model this table does not know keeps
 * whatever the file says (it may be a truncated or fine-tuned variant whose
 * width only the user knows). A *known* model's native width, though, is a
 * fact rather than a preference — 4096 can never be right for a model that
 * emits 2560 — so it wins over a file value that contradicts it.
 */

/** Native output width per model, mirroring `.env.example`'s documented
 *  alternatives. Keep in sync with `installer_embedding_dimensions`.
 *
 *  Exported so `inference-providers.ts` can derive its `ollama.knownDimensions`
 *  from this table rather than carrying a second copy (T07 collapse) —
 *  `embedding-defaults-parity.test.ts` extracts this exact declaration by
 *  regex, so the literal shape (identifier, `Record<string, number>`, closing
 *  `\n};`) must survive; adding `export` in front does not disturb that. */
export const KNOWN_EMBEDDING_DIMENSIONS: Readonly<Record<string, number>> = {
  "qwen3-embedding:8b": 4096,
  "qwen3-embedding:4b": 2560,
  "qwen3-embedding:0.6b": 1024,
  "bge-m3": 1024,
};

/** The reference default, used when nothing else resolves. Matches the shell
 *  table's own fallback. */
export const DEFAULT_EMBEDDING_DIMENSIONS = 2560;

/** The native width of `model`, or `undefined` when the model is not one this
 *  table knows. `undefined` is meaningful: it is what tells the caller to keep
 *  the user's configured value rather than overriding it. */
export function knownEmbeddingDimensions(model: string | undefined): number | undefined {
  if (!model) return undefined;
  return KNOWN_EMBEDDING_DIMENSIONS[model.trim()];
}

/** Every model this table knows — exported so the parity test can assert the
 *  exact set against the shell table rather than spot-checking a few pairs. */
export function knownEmbeddingModels(): string[] {
  return Object.keys(KNOWN_EMBEDDING_DIMENSIONS).sort();
}

export interface ResolvedEmbeddingDimensions {
  readonly dimensions: number;
  /** The file/config value that was overridden, when one was and it disagreed.
   *  `undefined` on every path where nothing was corrected — so a caller can
   *  warn exactly once, and only when there is something to warn about. */
  readonly correctedFrom?: number;
}

/**
 * Resolve the width to configure for `model`: `env > known width > configured
 * value > default`. See this file's header for why the known width outranks a
 * configured value that contradicts it.
 */
export function resolveEmbeddingDimensions(
  model: string | undefined,
  configured: number | undefined,
  envValue: number | undefined,
): ResolvedEmbeddingDimensions {
  if (envValue !== undefined) return { dimensions: envValue };

  const known = knownEmbeddingDimensions(model);
  if (known !== undefined) {
    // Only a *disagreeing* configured value is a correction. Reporting one
    // when the file already said 2560 would warn every correctly-configured
    // install, which is how a real warning gets tuned out.
    return configured !== undefined && configured !== known
      ? { dimensions: known, correctedFrom: configured }
      : { dimensions: known };
  }

  return { dimensions: configured ?? DEFAULT_EMBEDDING_DIMENSIONS };
}

// ── provider-aware, probe-backed resolution (LIP-04) ─────────────────────

export interface ResolveModelDimensionsOptions {
  /**
   * Additional known model→width entries to check before probing — e.g. a
   * second local-inference provider's `knownDimensions` (LIP-04's "merge
   * each provider's knownDimensions"). This file cannot import
   * `inference-providers.ts` directly (that module already imports this one
   * for its `ollama.knownDimensions` — importing back would be circular), so
   * the caller merges and passes whichever provider tables apply.
   */
  readonly knownDimensions?: Readonly<Record<string, number>>;
  /** Embedding endpoint base URL. Required to probe an unknown model; when
   *  absent, an unknown model throws immediately instead of guessing. */
  readonly baseUrl?: string;
  /** Path appended to `baseUrl` for the probe embed call (default
   *  `"/api/embed"`, Ollama's shape). Always joined by simple concatenation,
   *  never `new URL(path, baseUrl)` — an absolute path there silently drops
   *  any path prefix already on `baseUrl` (e.g. LM Studio's `/v1`). */
  readonly embedPath?: string;
  /** Injectable fetch, for tests. */
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

/** Read an embedding vector's length out of the handful of response shapes a
 *  local OpenAI-compatible/Ollama embed endpoint actually returns. `undefined`
 *  when none matches. */
function embeddingLengthFromBody(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.embedding)) return b.embedding.length;
  if (Array.isArray(b.embeddings) && Array.isArray(b.embeddings[0])) {
    return (b.embeddings[0] as unknown[]).length;
  }
  if (Array.isArray(b.data) && typeof b.data[0] === "object" && b.data[0] !== null) {
    const embedding = (b.data[0] as Record<string, unknown>).embedding;
    if (Array.isArray(embedding)) return embedding.length;
  }
  return undefined;
}

/**
 * Resolve the embedding width for `model`, provider-aware and probe-backed:
 * a known model (this file's Ollama table, merged with `opts.knownDimensions`
 * for any other local-inference provider) resolves instantly; an unknown
 * model probes one real embedding call at `opts.baseUrl` and reads the
 * response vector's length. There is no numeric fallback for the unknown
 * case — an unknown model behind a missing/unreachable endpoint **throws**,
 * naming both, rather than guessing a width that can silently corrupt
 * retrieval (the `2560` catch-all this replaces for provider-aware callers;
 * `resolveEmbeddingDimensions` above is untouched for its existing
 * synchronous, Ollama-only caller).
 */
export async function resolveModelDimensions(
  model: string,
  opts: ResolveModelDimensionsOptions = {},
): Promise<number> {
  const key = model.trim();
  const known = KNOWN_EMBEDDING_DIMENSIONS[key] ?? opts.knownDimensions?.[key];
  if (known !== undefined) return known;

  if (!opts.baseUrl) {
    throw new Error(
      `embedding dimensions unknown for model "${model}" and no endpoint was given to probe`,
    );
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const embedPath = opts.embedPath ?? "/api/embed";
  const url = `${opts.baseUrl.replace(/\/+$/, "")}${embedPath.startsWith("/") ? embedPath : `/${embedPath}`}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input: "dimension probe" }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
  } catch (e) {
    throw new Error(
      `embedding dimensions unknown for model "${model}" and ${url} is unreachable: ${(e as Error).message}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      `embedding dimensions unknown for model "${model}": ${url} returned a non-JSON response`,
    );
  }

  const length = embeddingLengthFromBody(body);
  if (length === undefined) {
    throw new Error(
      `embedding dimensions unknown for model "${model}": ${url} returned an unrecognized embedding response shape`,
    );
  }
  return length;
}
