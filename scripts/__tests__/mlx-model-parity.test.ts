/**
 * PDM-13. `scripts/setup-local-first.sh` carries a second copy of the MLX
 * model set that `INFERENCE_PROVIDERS.lmstudio.mlxModels` owns — a shell
 * installer cannot import a TypeScript module, so a gate is the available
 * mechanism, exactly as `installer-config-template.test.ts` does for the
 * capture-policy rules.
 *
 * The drift this closes is not cosmetic. The MLX embedding id is the one value
 * that differs between the two formats, and the repo URLs are the only way to
 * pin a build at all: measured 2026-09-21, `lms get --mlx` against a catalog id
 * answers "No staff picks found" and against a bare search term resolves to
 * whatever staff pick ranks first (`--mlx qwen3-vl` picked the 4B, not the 8B).
 * A stale literal here does not fail loudly — it installs the wrong model.
 *
 * Each pattern must match EXACTLY once. A rotted anchor reports as 0 matches
 * rather than passing vacuously.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INFERENCE_PROVIDERS } from "../../packages/shared/src/config/inference-providers.js";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const WIZARD = "scripts/setup-local-first.sh";

function read(file: string): string {
  return readFileSync(join(REPO_ROOT, file), "utf8");
}

function extractOne(file: string, body: string, pattern: RegExp): string {
  const matches = [...body.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"))];
  if (matches.length !== 1) {
    throw new Error(
      `${file}: expected exactly 1 match for ${pattern}, found ${matches.length}`,
    );
  }
  return matches[0][1]!;
}

const MLX = INFERENCE_PROVIDERS.lmstudio.mlxModels!;

describe("MLX model parity — setup-local-first.sh vs the seam (PDM-13)", () => {
  test("the seam still declares MLX variants for LM Studio", () => {
    expect(MLX).toBeDefined();
    expect(Object.keys(MLX).sort()).toEqual(["coding", "embedding", "instruct"]);
  });

  // The fetch specs. The wizard hands these to `lms get --mlx`, which is why
  // they are Hugging Face URLs and not catalog ids.
  const FETCH_SURFACES: Array<{ role: "embedding" | "instruct" | "coding"; pattern: RegExp }> = [
    { role: "embedding", pattern: /EMBEDDING_FETCH="https:\/\/huggingface\.co\/([^"]+)"/ },
    { role: "instruct", pattern: /LLM_FETCH="https:\/\/huggingface\.co\/([^"]+)"/ },
    { role: "coding", pattern: /CODE_FETCH="https:\/\/huggingface\.co\/([^"]+)"/ },
  ];

  for (const s of FETCH_SURFACES) {
    test(`${s.role}: the wizard fetches the repo the seam names`, () => {
      expect(`${s.role}=${extractOne(WIZARD, read(WIZARD), s.pattern)}`).toBe(
        `${s.role}=${MLX[s.role].repo}`,
      );
    });
  }

  // The one id that changes with the format. Anchored to its own assignment
  // inside the MLX branch, so a match cannot drift onto the GGUF default one
  // block up.
  test("the wizard's MLX embedding id matches the seam", () => {
    const pattern = /EMBEDDING_MODEL="(qwen3-embedding[^"]*)"/;
    expect(extractOne(WIZARD, read(WIZARD), pattern)).toBe(MLX.embedding.model);
  });

  // The two roles whose id does NOT change: the wizard must leave them on the
  // GGUF assignment rather than introducing a second, MLX-flavoured literal.
  // A regression here ships a config LM Studio cannot resolve.
  test("instruct and coding keep one id each in the wizard, not two", () => {
    const body = read(WIZARD);
    for (const role of ["instruct", "coding"] as const) {
      const id = MLX[role].model;
      expect(MLX[role].model).toBe(INFERENCE_PROVIDERS.lmstudio.defaultModels[role]);
      const hits = [...body.matchAll(new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))];
      expect(`${role} occurrences=${hits.length}`).toBe(`${role} occurrences=1`);
    }
  });

  test("the MLX embedding id resolves a width without a live probe", () => {
    expect(INFERENCE_PROVIDERS.lmstudio.knownDimensions[MLX.embedding.model]).toBe(1024);
  });

  // The format flag is what keeps a GGUF install from silently resolving MLX
  // weights on Apple Silicon (`lms get` with neither flag considers "only
  // options supported by your system").
  test("the wizard always passes an explicit format flag to lms get", () => {
    expect(read(WIZARD)).toContain('get -y "--${LMSTUDIO_MODEL_FORMAT:-gguf}"');
  });
});
