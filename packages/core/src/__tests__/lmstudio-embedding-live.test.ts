/**
 * LIP-08 / G8 — the `lmstudio` embedding-provider entry, exercised end to end.
 *
 * LIP-08's acceptance criterion is "a live call returns a 768-length vector",
 * and the independent validation found no sensor and no recorded measurement
 * behind it: nothing in the repository embedded *through the alias*. The one
 * live 768 that existed was `embedding-dimensions.test.ts`'s raw `fetch`,
 * which bypasses all three things this requirement is about — the
 * `embeddingProviders.lmstudio` entry, its `provider: "custom"` dispatch, and
 * the `createOpenAI` SDK path underneath.
 *
 * So the assertion here is deliberately not "LM Studio returns 768 floats"
 * (already covered) but "`createEmbeddingProvider({ provider: 'lmstudio' })`
 * returns a provider whose declared width and whose *returned vector* are both
 * 768". A mismatch between those two is what `refuseOnDimensionMismatch`
 * exists to catch, so the shipped defaults are checked against the running
 * model rather than against each other.
 *
 * `XDG_CONFIG_HOME` is redirected to a scratch directory **before** the core
 * import, because `embeddings/config.ts` builds its provider table in
 * module-level IIFEs from `loadConfigSafe()` — on a developer machine whose
 * own `~/.config/massa-ai/config.json` selects LM Studio with a different
 * model, `fileFor("lmstudio")` would override exactly the defaults under test.
 * Static imports hoist above the assignment, hence the dynamic import (the
 * m25/m26 pattern CLAUDE.md records).
 *
 * Skips, visibly, when LM Studio is not listening — CI has no LM Studio and
 * this must not turn into a red there. The measured run is transcribed in
 * `.specs/features/local-inference-provider-abstraction/tasks.md` (T23).
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LMSTUDIO_URL = "http://localhost:1234/v1";
// Retargeted by per-provider-default-models (PDM-03/04 AC-4): the shipped
// lmstudio embedding default moved from text-embedding-nomic-embed-text-v1.5
// (768d) to text-embedding-qwen3-embedding-0.6b (1024d), the same model/width
// the Ollama default now uses.
const EXPECTED_DIMENSIONS = 1024;
const EXPECTED_MODEL = "text-embedding-qwen3-embedding-0.6b";

const scratchConfigHome = mkdtempSync(join(tmpdir(), "lip08-xdg-"));
process.env.XDG_CONFIG_HOME = scratchConfigHome;
delete process.env.EMBEDDING_PROVIDER;
delete process.env.LMSTUDIO_BASE_URL;
delete process.env.LMSTUDIO_EMBEDDING_MODEL;
delete process.env.LMSTUDIO_EMBEDDING_DIMENSIONS;

const lmStudioReachable = await fetch(`${LMSTUDIO_URL}/models`, {
  signal: AbortSignal.timeout(2000),
})
  .then((r) => r.ok)
  .catch(() => false);

const { createEmbeddingProvider } = await import("../services/embeddings/index.js");

afterAll(() => {
  rmSync(scratchConfigHome, { recursive: true, force: true });
});

describe("LIP-08 — embedding through the lmstudio alias", () => {
  test("the shipped lmstudio entry declares the measured model and width", async () => {
    // Runs with or without the server: the entry's own defaults are static,
    // and pinning them here is what keeps the live case below meaningful —
    // a live vector length against a table that had silently been
    // re-pointed at some other model would prove nothing about the default
    // install.
    const { embeddingProviders } = await import("../services/embeddings/config.js");
    const entry = embeddingProviders.lmstudio!;
    expect(entry.provider).toBe("custom");
    expect(entry.model).toBe(EXPECTED_MODEL);
    expect(entry.dimensions).toBe(EXPECTED_DIMENSIONS);
    expect(entry.baseURL).toBe(LMSTUDIO_URL);
  });

  test.skipIf(!lmStudioReachable)(
    "a live embed through createEmbeddingProvider returns a 1024-length vector",
    async () => {
      const provider = await createEmbeddingProvider({
        provider: "lmstudio",
        cache: false,
      });

      expect(provider.dimensions).toBe(EXPECTED_DIMENSIONS);
      expect(provider.model).toBe(EXPECTED_MODEL);

      const vector = await provider.embedQuery(
        "local inference provider abstraction — LIP-08 live width check",
      );

      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBe(EXPECTED_DIMENSIONS);
      // Not a zero-filled placeholder: a stub returning `new Array(1024).fill(0)`
      // would satisfy the length assertion alone.
      expect(vector.some((v) => v !== 0)).toBe(true);
    },
    60_000,
  );
});
