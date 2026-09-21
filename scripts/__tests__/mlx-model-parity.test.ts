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
/** The model-resolution and warning copies both live in the prompt library —
 *  the wizard calls `installer_resolve_lmstudio_models` and holds no literal of
 *  its own beyond the repeated end-of-run warning asserted at the bottom. */
const LIB = "scripts/lib/installer-feature-prompts.sh";
const WIZARD = "scripts/setup-local-first.sh";
const API_KEY_LIB = "scripts/lib/installer-api-key.sh";
const SERVER = "scripts/mlx-embedding-server.py";

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
const GGUF = INFERENCE_PROVIDERS.lmstudio.ggufRepos!;

/**
 * The resolver's two format branches, separately.
 *
 * Both now assign all three `*_FETCH` variables, so a pattern applied to the
 * whole file matches twice and `extractOne` throws — which is the correct
 * failure for an ungated pattern, but useless as a parity assertion. Slicing
 * the function at its `= "mlx" ]; then` … `\n  fi\n` boundary lets each branch
 * be checked against its own format's repos. A shape change to either boundary
 * throws here rather than quietly matching the wrong branch.
 */
function resolverBranches(): { mlx: string; gguf: string } {
  const body = read(LIB);
  const start = body.indexOf("installer_resolve_lmstudio_models() {");
  const end = body.indexOf("\n}", start);
  if (start < 0 || end < 0) throw new Error(`${LIB}: installer_resolve_lmstudio_models not found`);
  const fn = body.slice(start, end);
  const open = fn.indexOf('= "mlx" ]; then');
  const close = fn.indexOf("\n  fi\n", open);
  if (open < 0 || close < 0) throw new Error(`${LIB}: the resolver's mlx branch is not delimited`);
  return { mlx: fn.slice(open, close), gguf: fn.slice(close) };
}

describe("MLX model parity — setup-local-first.sh vs the seam (PDM-13)", () => {
  test("the seam still declares MLX variants for LM Studio", () => {
    expect(MLX).toBeDefined();
    expect(Object.keys(MLX).sort()).toEqual(["coding", "embedding", "instruct"]);
  });

  test("the seam still declares GGUF repos for LM Studio", () => {
    expect(GGUF).toBeDefined();
    expect(Object.keys(GGUF).sort()).toEqual(["coding", "embedding", "instruct"]);
  });

  // The fetch specs. The wizard hands these to `lms get`, which is why they are
  // Hugging Face URLs and not catalog ids — in BOTH formats. The GGUF half of
  // this table is the fix for a path that could never have fetched anything on
  // a machine that did not already have the models.
  const FETCH_SURFACES: Array<{ role: "embedding" | "instruct" | "coding"; pattern: RegExp }> = [
    { role: "embedding", pattern: /EMBEDDING_FETCH="https:\/\/huggingface\.co\/([^"]+)"/ },
    { role: "instruct", pattern: /LLM_FETCH="https:\/\/huggingface\.co\/([^"]+)"/ },
    { role: "coding", pattern: /CODE_FETCH="https:\/\/huggingface\.co\/([^"]+)"/ },
  ];

  for (const s of FETCH_SURFACES) {
    test(`${s.role}: the MLX branch fetches the repo the seam names`, () => {
      expect(`${s.role}=${extractOne(LIB, resolverBranches().mlx, s.pattern)}`).toBe(
        `${s.role}=${MLX[s.role].repo}`,
      );
    });

    test(`${s.role}: the GGUF branch fetches the repo the seam names`, () => {
      expect(`${s.role}=${extractOne(LIB, resolverBranches().gguf, s.pattern)}`).toBe(
        `${s.role}=${GGUF[s.role]}`,
      );
    });
  }

  // Five of the six ids in the seam were never read off a live install, so the
  // wizard asks LM Studio for the real one after fetching. Losing this call
  // would restore the hardcoded guess for every role at once, silently.
  test("the wizard reconciles all three ids against LM Studio after the fetch", () => {
    const body = read(WIZARD);
    for (const v of ["EMBEDDING_MODEL", "LLM_MODEL", "CODE_MODEL"]) {
      expect(`${v} reconciled`).toBe(
        body.includes(`${v}="$(installer_lmstudio_model_key `) ? `${v} reconciled` : `${v} NOT reconciled`,
      );
    }
  });

  // Residency is finite: the wizard loads three models and must evict whatever
  // is already holding the same RAM first.
  test("the wizard unloads resident models before loading its own", () => {
    const body = read(WIZARD);
    const unload = body.indexOf("installer_unload_loaded_models");
    const load = body.indexOf('load -c 8192 --ttl');
    expect(unload).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(-1);
    expect(`unload before load=${unload < load}`).toBe("unload before load=true");
  });

  // The one id that changes with the format. Anchored to its own assignment
  // inside the MLX branch, so a match cannot drift onto the GGUF default a few
  // lines up.
  test("the resolver's MLX embedding id matches the seam", () => {
    const pattern = /EMBEDDING_MODEL="(qwen3-embedding[^"]*)"/;
    expect(extractOne(LIB, read(LIB), pattern)).toBe(MLX.embedding.model);
  });

  // The two roles whose id does NOT change: the resolver must leave them on the
  // GGUF assignment rather than introducing a second, MLX-flavoured literal.
  // A regression here ships a config LM Studio cannot resolve.
  test("instruct and coding keep one id each in the resolver, not two", () => {
    const body = read(LIB);
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

  // The MLX embedding sidecar's port is a hand copy in four places: the
  // `embedding.baseURL` default the installer writes, the notice shown at the
  // format prompt, the sidecar launcher's own default, and the server's. A
  // drift between the first two is silent and total — the config names a port
  // nothing listens on, and the only symptom is the HTTP 400 this whole branch
  // exists to remove.
  //
  // There is deliberately no seam entry to check these against: nothing in
  // TypeScript reads this URL (the runtime reads `embedding.baseURL` from the
  // written config), so a seam field would be a fifth copy, not a source.
  test("every installer copy of the MLX sidecar port agrees", () => {
    const PORT_SURFACES: Array<{ file: string; pattern: RegExp }> = [
      { file: API_KEY_LIB, pattern: /MASSA_AI_MLX_EMBED_URL:-http:\/\/127\.0\.0\.1:(\d+)\/v1/ },
      { file: LIB, pattern: /MASSA_AI_MLX_EMBED_URL:-http:\/\/127\.0\.0\.1:(\d+)\/v1/ },
      { file: LIB, pattern: /MASSA_AI_MLX_EMBED_PORT:-(\d+)/ },
      { file: SERVER, pattern: /MASSA_AI_MLX_EMBED_PORT"\) or "(\d+)"/ },
    ];
    const ports = PORT_SURFACES.map((s) => `${s.file}=${extractOne(s.file, read(s.file), s.pattern)}`);
    expect(ports).toEqual(PORT_SURFACES.map((s) => `${s.file}=1235`));
  });

  // The redirect and the sidecar setup must be gated on the SAME condition.
  // Either one alone is a broken install: the base URL without the sidecar
  // names a dead port, and the sidecar without the base URL runs a server
  // nothing talks to.
  test("the base-url redirect and the sidecar setup share one gate", () => {
    const gate = /\[ "\$\{LMSTUDIO_MODEL_FORMAT:-gguf\}" = "mlx" \] && \[ -z "\$\{LMSTUDIO_EMBEDDING_MODEL:-\}" \]/;
    expect(gate.test(read(API_KEY_LIB))).toBe(true);
    const setup = read(LIB).slice(read(LIB).indexOf("installer_setup_mlx_embedding_sidecar() {"));
    expect(setup).toContain('[ "${LMSTUDIO_MODEL_FORMAT:-gguf}" = "mlx" ] || return 0');
    expect(setup).toContain('[ -z "${LMSTUDIO_EMBEDDING_MODEL:-}" ] || return 0');
  });
});
