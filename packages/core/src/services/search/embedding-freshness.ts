/**
 * LIP-15 — the embedding-fingerprint vocabulary, extracted from
 * `project-indexer.ts`.
 *
 * A workspace is indexed under one `${provider}:${model}:${dimensions}`
 * triple. Querying or appending to it under a different one mixes two vector
 * spaces in one table, which degrades silently rather than failing — so both
 * the read gate (`checkSearchAdmission`) and the write gate
 * (`ensureFreshIndex`'s `needsFullReindex`) compare the stored fingerprint
 * against the live one.
 *
 * It lives here rather than in `project-indexer.ts` for two reasons, and the
 * first is the one that forced it: adding this gate took that file from 640 to
 * 761 LOC, past the 700-LOC hub ceiling `scripts/search-hub-metric.ts`
 * enforces (G-HUB) — caught by CI, not locally, because that gate runs only
 * from `ci.yml` and is not wired into `bun run test:scripts`.
 *
 * **`project-indexer.ts` now sits at exactly 700, with zero headroom.** The
 * next line added to it reddens G-HUB. That is the gate working as intended —
 * it wants the hub decomposed further, and the honest reading is that this
 * extraction paid the immediate debt without finishing the job. Take the next
 * cohesive unit out (the result types, or `indexProjectInternal`) rather than
 * shaving comments to buy a line. The second is that both gates were restating the same
 * three-clause predicate independently, which is exactly the drift this
 * module's `embeddingFingerprintMismatch` now makes impossible.
 *
 * `project-indexer.ts` re-exports `EmbeddingIndexStaleError` and
 * `currentEmbeddingFingerprint` so no importer had to change.
 *
 * ## Which gate actually runs in production (post-review, 2026-09-19)
 *
 * `ensureFreshIndex`'s `needsFullReindex` branch — not just its fingerprint
 * arm — has **zero production callers**. Its only caller is
 * `SearchController.handleAutoReindex`, which hardcodes
 * `allowFullReindex: false`, so every `needsFullReindex === true` outcome is
 * deferred and never reaches `deps.indexProject` or the stamp beside it.
 *
 * The reachable production recovery for a stale fingerprint is `index_project`
 * with `forceReindex: true`, which runs `EtlPipeline.run()`
 * (`services/etl/pipeline.ts`) — a separate full-reindex mechanism that never
 * calls `ensureFreshIndex`, and where the fingerprint is actually stamped.
 * Both sites use the same `stampEmbeddingFingerprint` /
 * `currentEmbeddingFingerprint` pair, so they cannot disagree on the *value*,
 * only on whether they currently run.
 *
 * That branch is kept, tested and correct for the day a caller passes
 * `allowFullReindex: true` — deleting documented, correct behaviour to chase
 * "no dead code" would be the wrong trade — but it must not be read as *the*
 * write gate. See `search-controller.ts`'s Tier 1b comment for why the read
 * gate stays unconditional instead of giving this branch a reachable caller.
 */

import { getProvidersByPriority } from "../embeddings/config.js";

/**
 * Raised by the search entry path when the workspace's stored embedding
 * fingerprint (`${provider}:${model}:${dimensions}`, stamped by the last full
 * reindex) disagrees with the currently configured embedding. Search must
 * never fall through to a table holding two mixed embedding spaces — the
 * caller throws this instead of returning rows.
 */
export class EmbeddingIndexStaleError extends Error {
  constructor(
    readonly projectId: string,
    readonly storedFingerprint: string,
    readonly currentFingerprint: string,
  ) {
    super(
      `Project '${projectId}' was indexed with embedding fingerprint ` +
        `'${storedFingerprint}', but the configured embedding is now ` +
        `'${currentFingerprint}'. Run index_project with forceReindex: true ` +
        `to rebuild the index for the new embedding.`,
    );
    this.name = "EmbeddingIndexStaleError";
  }
}

/**
 * The live embedding fingerprint (design.md §5): `${provider}:${model}:${dimensions}`
 * for the currently *selected* provider — `getProvidersByPriority()[0]`, the
 * priority-1 entry `services/embeddings/config.ts` resolves synchronously
 * from env + config.json at module load (no network probe, no fallback
 * chain walk — that is `createEmbeddingProvider`'s job, not this gate's).
 * `null` when any component is not resolvable — every caller here treats
 * "unknown" the same as "no mismatch": warn or skip, never block on a value
 * we can't compute.
 */
export function currentEmbeddingFingerprint(): string | null {
  const [, active] = getProvidersByPriority()[0] ?? [];
  if (!active?.provider || !active?.model || active.dimensions === undefined) {
    return null;
  }
  return `${active.provider}:${active.model}:${active.dimensions}`;
}

/**
 * The mismatch pair, or `null` when there is nothing to act on.
 *
 * The three clauses are the whole gate, and the two `null` cases are
 * deliberate rather than defensive: a stored `null` is a legacy or
 * never-stamped workspace (the next full reindex stamps it), and a live
 * `null` means the configured embedding is not resolvable. Neither is
 * evidence of a *disagreement*, so neither blocks — only a stored value that
 * actively contradicts a resolvable live one does.
 *
 * Both gates previously spelled this out separately, in the two shapes the
 * call sites happened to want (a boolean, and an object). One predicate, two
 * readings of its result, so they cannot drift into two different rules.
 */
export function embeddingFingerprintMismatch(
  storedFingerprint: string | null,
  liveFingerprint: string | null = currentEmbeddingFingerprint(),
): { stored: string; current: string } | null {
  if (
    storedFingerprint === null ||
    liveFingerprint === null ||
    storedFingerprint === liveFingerprint
  ) {
    return null;
  }
  return { stored: storedFingerprint, current: liveFingerprint };
}
