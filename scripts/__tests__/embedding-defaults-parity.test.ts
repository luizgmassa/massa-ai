/**
 * EDC-06 — embedding defaults parity
 * (.specs/features/embedding-dims-consistency/spec.md)
 *
 * The v1.33.0 default swap (qwen3-embedding:4b / 2560) was swept by hand and
 * missed four surfaces; three of them shipped internally inconsistent
 * model/dims pairs that refuseOnDimensionMismatch turns into a hard fail at
 * first embed. This sensor makes the sweep a gate:
 *
 *  Tier 1 (pairs)   — every surface that writes a model+dims default must
 *                     carry exactly the runtime reference pair.
 *  Tier 2 (models)  — model-only surfaces must carry the reference model.
 *  Tier 3 (complete)— any tracked file assigning a `*_EMBEDDING_MODEL` or
 *                     `*_EMBEDDING_DIMENSIONS` default (any provider prefix,
 *                     not just OLLAMA_ — LIP-18/LIP-19b) not in the
 *                     known-surface/allowlist sets fails by name: a new
 *                     surface must be added here, not silently shipped.
 *
 * Tiers 1 and 2 each run twice — once per provider (T21/G3). The re-key in
 * Tier 3 above made an `LMSTUDIO_*` pair *visible*; it never checked its
 * *value*, so `PAIR_SURFACES`/`MODEL_ONLY_SURFACES`/`DIMS_ONLY_SURFACES`
 * carried zero LM Studio rows and three mutants making the LM Studio
 * model/width pair self-contradictory (`.env.example`, `embeddings/config.ts`,
 * `setup-local-first.sh`) survived every gate. `LMSTUDIO_PAIR_SURFACES` /
 * `LMSTUDIO_MODEL_ONLY_SURFACES` below close that — exactly one rule per
 * provider per surface, not one rule shared across providers.
 *
 * Each extractor is per-dialect (ENV / bare KEY=VALUE / ${VAR:-default} /
 * TS object literal) and must match EXACTLY once — 0 matches is a rotted
 * extractor, >1 is an ambiguous surface; both fail loudly (the
 * parse-0-subjects trap this spec's plan-critic named).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultMassaAiConfig } from "../../packages/shared/src/config/massa-ai-config";
import { INFERENCE_PROVIDERS, INFERENCE_ROLE_DEFAULTS } from "../../packages/shared/src/config/inference-providers";

const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// F4/G1 — a `process.env.X` mention with no `||`/`??` literal fallback is a
// bare read through the seam (LIP-24) and stays invisible to a completeness
// scan by design. The same mention followed by `||`/`??` and a literal IS a
// default declaration: F2's original defect
// (`process.env.OLLAMA_EMBEDDING_MODEL || "qwen3-embedding:4b"`) was exactly
// this shape, and the old blanket `line.includes("process.env")` skip carved
// every env-guarded literal default out of the scan's population, including
// this one. The literal-default check is scoped to the scan's own token
// (embedding vs instruct/coding) so an unrelated `process.env.X || "..."`
// read on a neighbouring line (e.g. `OLLAMA_BASE_URL`) never gets flagged as
// this scan's offender — only requires a quote or digit immediately after
// the operator so a seam property-access fallback is never mistaken for one.
function envLiteralDefaultFor(tokenPattern: string): RegExp {
  return new RegExp(`process\\.env\\.${tokenPattern}\\s*(?:\\|\\||\\?\\?)\\s*["'\\d]`);
}
function isBareEnvRead(line: string, literalDefault: RegExp): boolean {
  return line.includes("process.env") && !literalDefault.test(line);
}

function extractOne(surface: string, text: string, re: RegExp): string {
  const matches = [...text.matchAll(re)].map((m) => m[1]);
  if (matches.length !== 1) {
    throw new Error(
      `${surface}: expected exactly 1 match for ${re}, got ${matches.length} — ` +
        (matches.length === 0 ? "extractor rotted or surface removed" : `ambiguous: ${matches.join(", ")}`),
    );
  }
  return matches[0];
}

/**
 * A structural surface asserts that a TS writer still delegates to the seam
 * expression named in `expected`, bounded to its own branch so a missing
 * derivation can never be reported as a match from a sibling branch.
 */
interface StructuralSurface {
  file: string;
  label: string;
  pattern: RegExp;
  expected: string;
}

function checkStructural(s: StructuralSurface): string | null {
  const text = read(s.file);
  const matches = [...text.matchAll(s.pattern)].map((m) => m[1]!);
  if (matches.length !== 1) {
    return (
      `${s.label}: expected exactly 1 structural match for ${s.pattern}, got ${matches.length} — ` +
      (matches.length === 0
        ? "seam derivation missing, reverted to a literal, or extractor rotted"
        : `ambiguous: ${matches.join(", ")}`)
    );
  }
  if (matches[0] !== s.expected) {
    return `${s.label}: derivation=${matches[0]} (want ${s.expected})`;
  }
  return null;
}

interface MultiMatchRow {
  file: string;
  label: string;
  pattern: RegExp;
  expected: string[];
}

function checkMultiMatch(row: MultiMatchRow): string[] {
  const text = read(row.file);
  const matches = [...text.matchAll(row.pattern)].map((m) => m[1]!);
  if (matches.length !== row.expected.length) {
    throw new Error(
      `${row.label}: expected exactly ${row.expected.length} match(es) for ${row.pattern}, got ${matches.length} — ` +
        (matches.length === 0 ? "extractor rotted or surface removed" : `got: ${matches.join(", ")}`),
    );
  }
  const violations: string[] = [];
  matches.forEach((val, i) => {
    if (val !== row.expected[i]) {
      violations.push(`${row.label} match #${i + 1}: got ${val}, want ${row.expected[i]}`);
    }
  });
  return violations;
}

// ── Reference pair: the runtime defaults, from both defining modules ────────
// Re-anchored (T13) on the real, resolved value from the seam-derived config
// template instead of scraping `model:`/`dimensions:` as quoted-literal text
// — T03b made that block a property-access expression with no literal at
// that position, which is what made the old text-based extractor throw.
function referencePair(): { model: string; dims: string } {
  const model = defaultMassaAiConfig.embedding.model;
  const dims = String(defaultMassaAiConfig.embedding.dimensions);
  return { model, dims };
}

// ── Reference pair, LM Studio (T21/G3/LIP-18) ───────────────────────────────
// Re-anchored (T13) on `defaultModels.embedding` with a by-key width lookup,
// replacing the brace-anchored regex that silently returned `knownDimensions`
// entry #1 once this feature made the table multi-entry.
function referencePairLmStudio(): { model: string; dims: string } {
  const model = INFERENCE_PROVIDERS.lmstudio.defaultModels.embedding;
  const dims = String(INFERENCE_PROVIDERS.lmstudio.knownDimensions[model]);
  return { model, dims };
}

// ── Surface table (dialect-specific extractors) ─────────────────────────────
const PAIR_SURFACES: Array<{ file: string; model: RegExp; dims: RegExp }> = [
  {
    file: "Dockerfile",
    model: /^ENV OLLAMA_EMBEDDING_MODEL=(\S+)$/gm,
    dims: /^ENV OLLAMA_EMBEDDING_DIMENSIONS=(\d+)$/gm,
  },
  {
    file: "install.sh",
    model: /^OLLAMA_EMBEDDING_MODEL=(\S+)$/gm,
    dims: /^OLLAMA_EMBEDDING_DIMENSIONS=(\d+)$/gm,
  },
  {
    file: "apps/tools-api/setup-ollama-wsl.sh",
    model: /^OLLAMA_EMBEDDING_MODEL=(\S+)$/gm,
    dims: /^OLLAMA_EMBEDDING_DIMENSIONS=(\d+)$/gm,
  },
  {
    // Commented alternatives (bge-m3, 0.6b) are deliberate and must NOT
    // match: the anchors require line start without "#".
    file: ".env.example",
    model: /^OLLAMA_EMBEDDING_MODEL=(\S+)$/gm,
    dims: /^OLLAMA_EMBEDDING_DIMENSIONS=(\d+)$/gm,
  },
  {
    file: "docker-compose.yml",
    model: /\$\{OLLAMA_EMBEDDING_MODEL:-([^}]+)\}/g,
    dims: /\$\{OLLAMA_EMBEDDING_DIMENSIONS:-(\d+)\}/g,
  },
  // `apps/mcp-client/src/config-cli.ts` and `apps/opencode-plugin/src/config-cli.ts`
  // used to carry a quoted literal here (`massa-ai-config use ollama`). T07b
  // replaced it with `INFERENCE_PROVIDERS.ollama.defaultModels.embedding` — a
  // property-access expression, not a literal — so those two surfaces moved
  // to the structural `DERIVED_SURFACES` tier below (T13).
  {
    // The dedicated E2E stack pins its own embedding profile, and a mismatch
    // here is invisible rather than loud: a wrong width does not fail, it
    // silently routes the run into a different `vector_documents_<n>d` table
    // (.specs/features/e2e-feature-battery/design.md). The two `${VAR:-…}`
    // defaults at the top of the script are the only literals; the
    // `OLLAMA_EMBEDDING_*` assignments further down expand these variables,
    // so the extractors anchor on the definitions, not the exports.
    file: "scripts/e2e-stack.sh",
    model: /^\s*ollama\)\n\s*EMBED_MODEL="\$\{MASSA_AI_E2E_EMBED_MODEL:-([^}]+)\}"/gm,
    dims: /^\s*ollama\)\n.*\n\s*EMBED_DIMS="\$\{MASSA_AI_E2E_EMBED_DIMS:-(\d+)\}"/gm,
  },
];

const MODEL_ONLY_SURFACES: Array<{ file: string; model: RegExp }> = [
  { file: "scripts/setup-local-first.sh", model: /\$\{OLLAMA_EMBEDDING_MODEL:-([^}]+)\}/g },
  { file: "scripts/validate-vscode-integration.sh", model: /\$\{OLLAMA_EMBEDDING_MODEL:-([^}]+)\}/g },
  // `diagnose.ts`'s DEFAULT_MODEL table, added when the script became
  // provider-dispatched. It is keyed on the provider id rather than on a
  // `*_EMBEDDING_MODEL` token, so the Tier-3 completeness scan below is
  // structurally blind to it — the same going-green shape this file exists to
  // prevent, and the reason it is listed by hand here. Its only other pin was
  // `diagnose.test.ts`'s own copy of the same two literals, which is an
  // agreement between two files, not an anchor to the canonical table.
  { file: "scripts/diagnose.ts", model: /^ {2}ollama: "([^"]+)",$/gm },
];

/** Surfaces carrying a width but no model literal — the width is what has to
 *  match the reference; the model arrives as a variable. */
const DIMS_ONLY_SURFACES: Array<{ file: string; dims: RegExp }> = [
  {
    // The wizard's config.json template. Its model comes from
    // `${EMBEDDING_MODEL}`, so there is no pair to extract here; the
    // model→width mapping itself is checked by executing the function in
    // scripts/__tests__/installer-config-template.test.ts. This entry pins
    // only the fallback an unrecognized model lands on — the literal whose
    // previous value, 4096, is the defect this whole file exists for.
    file: "scripts/lib/installer-api-key.sh",
    dims: /\$\{OLLAMA_EMBEDDING_DIMENSIONS:-(\d+)\}/g,
  },
];

// ── LM Studio surface table (T21/G3/LIP-18) ─────────────────────────────────
// `label` disambiguates the two files below that carry TWO independent
// LM Studio write sites (`init --lmstudio` and `use lmstudio`) — each site's
// regex is anchored to its own branch so `extractOne` still sees exactly one
// match per entry, and a violation names which branch, not just the file.
// Ollama has no equivalent second site in these files (`init` never writes an
// Ollama literal), so `PAIR_SURFACES` above needed no such split.
const LMSTUDIO_PAIR_SURFACES: Array<{ file: string; label?: string; model: RegExp; dims: RegExp }> = [
  {
    // LM Studio is opt-in, so its documented pair in .env.example is
    // deliberately commented — the anchor keeps the leading `#`.
    file: ".env.example",
    model: /^#LMSTUDIO_EMBEDDING_MODEL=(\S+)/gm,
    dims: /^#LMSTUDIO_EMBEDDING_DIMENSIONS=(\d+)/gm,
  },
  {
    file: "scripts/e2e-stack.sh",
    label: "scripts/e2e-stack.sh (lmstudio)",
    model: /^\s*lmstudio\)\n\s*EMBED_MODEL="\$\{MASSA_AI_E2E_EMBED_MODEL:-([^}]+)\}"/gm,
    dims: /^\s*lmstudio\)\n.*\n\s*EMBED_DIMS="\$\{MASSA_AI_E2E_EMBED_DIMS:-(\d+)\}"/gm,
  },
  // `packages/core/src/services/embeddings/config.ts`'s lmstudio branch used
  // to carry a quoted literal model and a `768` last-resort dims fallback
  // here too. The model now derives from the seam (T13, mirroring its ollama
  // sibling), and the dims fallback was never the reference width in the
  // first place — it fires only for a model the by-key table does not
  // recognize, so both moved to the structural `DERIVED_SURFACES` tier below.
];

/** `install.sh`/`Dockerfile`/`docker-compose.yml`/`setup-ollama-wsl.sh`/
 *  `validate-vscode-integration.sh` carry no LM Studio equivalent at all
 *  (measured: zero `lmstudio`/`LMSTUDIO` occurrences besides the bash probe
 *  dialect's dispatch key) — genuinely Ollama-only surfaces, not a gap. */
const LMSTUDIO_MODEL_ONLY_SURFACES: Array<{ file: string; model: RegExp }> = [
  // PDM-13 moved the wizard's LM Studio model resolution into
  // `installer_resolve_lmstudio_models`, so this literal lives in the prompt
  // library now. The wizard's LM Studio branch is a single call with no
  // literal left in it; its Ollama branch is untouched and still anchored in
  // MODEL_ONLY_SURFACES above.
  { file: "scripts/lib/installer-feature-prompts.sh", model: /\$\{LMSTUDIO_EMBEDDING_MODEL:-([^}]+)\}/g },
  // The LM Studio half of `diagnose.ts`'s DEFAULT_MODEL table — see the note
  // on its Ollama sibling in MODEL_ONLY_SURFACES above.
  { file: "scripts/diagnose.ts", model: /^ {2}lmstudio: "([^"]+)",$/gm },
];

// ── Derived (structural) surfaces (T13) ─────────────────────────────────────
// The four config-cli.ts embedding branches, plus their LM Studio
// instruct/coding assignments, no longer carry a quoted literal — T07b
// re-derived them from the seam. Each pattern is bounded to its own
// `if (...) { ... }`/`} else if (...) { ... }` branch with a `(?!\} else)`
// lookahead so a missing or reverted derivation is reported as a 0-match
// failure on its own branch, never a silent match against a sibling
// branch's unrelated literal (the `mistral-embed`/1024 defect this
// re-anchor closes).
const CONFIG_CLI_FILES = ["apps/mcp-client/src/config-cli.ts", "apps/opencode-plugin/src/config-cli.ts"];
const BOUND = "(?:(?!\\} else)[\\s\\S])*?";

// The two `embeddings/config.ts` rows below name a fixed file, not the loop
// variable `file` — pushing them inside `CONFIG_CLI_FILES.flatMap(...)` would
// re-emit both of them once per CLI file (G3: measured `length === 28` while
// distinct labels `=== 26`, because these two rows do not vary per iteration
// and were duplicated by the loop instead of being independent of it).
// Declared once, outside the flatMap, and concatenated below.
const CONFIG_TS_DERIVED_SURFACES: StructuralSurface[] = [
  {
    file: "packages/core/src/services/embeddings/config.ts",
    label: "packages/core/src/services/embeddings/config.ts (lmstudio, embedding model)",
    pattern: /LMSTUDIO_EMBEDDING_MODEL \|\| file\?\.model \|\| (INFERENCE_PROVIDERS\.lmstudio\.defaultModels\.embedding);/g,
    expected: "INFERENCE_PROVIDERS.lmstudio.defaultModels.embedding",
  },
  {
    file: "packages/core/src/services/embeddings/config.ts",
    label: "packages/core/src/services/embeddings/config.ts (lmstudio, embedding dims by-key lookup)",
    pattern: /file\?\.dimensions \|\|\s*\n\s*(INFERENCE_PROVIDERS\.lmstudio\.knownDimensions\[model\]) \|\|/g,
    expected: "INFERENCE_PROVIDERS.lmstudio.knownDimensions[model]",
  },
];

const DERIVED_SURFACES: StructuralSurface[] = [
  ...CONFIG_CLI_FILES.flatMap((file) => [
  {
    file,
    label: `${file} (init --lmstudio, embedding model)`,
    pattern: new RegExp(`options\\.lmstudio\\) \\{${BOUND}const model = (INFERENCE_PROVIDERS\\.lmstudio\\.defaultModels\\.embedding);`, "g"),
    expected: "INFERENCE_PROVIDERS.lmstudio.defaultModels.embedding",
  },
  {
    file,
    label: `${file} (init --lmstudio, embedding dims)`,
    pattern: new RegExp(`options\\.lmstudio\\) \\{${BOUND}dimensions:\\s*(INFERENCE_PROVIDERS\\.lmstudio\\.knownDimensions\\[model\\])\\s*\\?\\?\\s*\\d+,`, "g"),
    expected: "INFERENCE_PROVIDERS.lmstudio.knownDimensions[model]",
  },
  {
    file,
    label: `${file} (init --lmstudio, instruct)`,
    pattern: new RegExp(`options\\.lmstudio\\) \\{${BOUND}config\\.llm\\.model = (INFERENCE_PROVIDERS\\.lmstudio\\.defaultModels\\.instruct);`, "g"),
    expected: "INFERENCE_PROVIDERS.lmstudio.defaultModels.instruct",
  },
  {
    file,
    label: `${file} (init --lmstudio, coding)`,
    pattern: new RegExp(`options\\.lmstudio\\) \\{${BOUND}config\\.llm\\.codeModel = (INFERENCE_PROVIDERS\\.lmstudio\\.defaultModels\\.coding);`, "g"),
    expected: "INFERENCE_PROVIDERS.lmstudio.defaultModels.coding",
  },
  {
    file,
    label: `${file} (use ollama, embedding model)`,
    pattern: new RegExp(`provider === "ollama"\\) \\{${BOUND}const model = \\(options\\.model as string\\) \\|\\| (INFERENCE_PROVIDERS\\.ollama\\.defaultModels\\.embedding);`, "g"),
    expected: "INFERENCE_PROVIDERS.ollama.defaultModels.embedding",
  },
  {
    file,
    label: `${file} (use ollama, embedding dims)`,
    pattern: new RegExp(`provider === "ollama"\\) \\{${BOUND}dimensions:\\s*(knownEmbeddingDimensions\\(model\\))\\s*\\?\\?\\s*\\d+,`, "g"),
    expected: "knownEmbeddingDimensions(model)",
  },
  {
    // F4 — this row and its coding sibling were the gap that made F1 (the
    // "use ollama" branch never writing instruct/coding ids) invisible: the
    // table had the lmstudio counterparts (below) but no ollama ones.
    file,
    label: `${file} (use ollama, instruct)`,
    pattern: new RegExp(`provider === "ollama"\\) \\{${BOUND}config\\.llm\\.model = (INFERENCE_PROVIDERS\\.ollama\\.defaultModels\\.instruct);`, "g"),
    expected: "INFERENCE_PROVIDERS.ollama.defaultModels.instruct",
  },
  {
    file,
    label: `${file} (use ollama, coding)`,
    pattern: new RegExp(`provider === "ollama"\\) \\{${BOUND}config\\.llm\\.codeModel = (INFERENCE_PROVIDERS\\.ollama\\.defaultModels\\.coding);`, "g"),
    expected: "INFERENCE_PROVIDERS.ollama.defaultModels.coding",
  },
  {
    file,
    label: `${file} (use lmstudio, embedding model)`,
    pattern: new RegExp(`provider === "lmstudio"\\) \\{${BOUND}const model = \\(options\\.model as string\\) \\|\\| (INFERENCE_PROVIDERS\\.lmstudio\\.defaultModels\\.embedding);`, "g"),
    expected: "INFERENCE_PROVIDERS.lmstudio.defaultModels.embedding",
  },
  {
    file,
    label: `${file} (use lmstudio, embedding dims)`,
    pattern: new RegExp(`provider === "lmstudio"\\) \\{${BOUND}dimensions:\\s*(INFERENCE_PROVIDERS\\.lmstudio\\.knownDimensions\\[model\\])\\s*\\?\\?\\s*\\d+,`, "g"),
    expected: "INFERENCE_PROVIDERS.lmstudio.knownDimensions[model]",
  },
  {
    file,
    label: `${file} (use lmstudio, instruct)`,
    pattern: new RegExp(`provider === "lmstudio"\\) \\{${BOUND}config\\.llm\\.model = (INFERENCE_PROVIDERS\\.lmstudio\\.defaultModels\\.instruct);`, "g"),
    expected: "INFERENCE_PROVIDERS.lmstudio.defaultModels.instruct",
  },
  {
    file,
    label: `${file} (use lmstudio, coding)`,
    pattern: new RegExp(`provider === "lmstudio"\\) \\{${BOUND}config\\.llm\\.codeModel = (INFERENCE_PROVIDERS\\.lmstudio\\.defaultModels\\.coding);`, "g"),
    expected: "INFERENCE_PROVIDERS.lmstudio.defaultModels.coding",
  },
  ]),
  ...CONFIG_TS_DERIVED_SURFACES,
];

// ── Instruct/coding tiers (T13/P1 "the parity gate covers all three roles") ─
// Bash/env surfaces cannot import the seam, so instruct/coding stay literal
// there and are checked by value against the seam's real resolved defaults.
// `setup-local-first.sh` and `installer-api-key.sh` each state BOTH
// providers' literal in one file (LM Studio branch first in source order),
// so a naive single-occurrence extractor sees two matches — declared here as
// an explicit expected two-element array instead of an `extractOne` throw.
const INSTRUCT_CODING_SURFACES: MultiMatchRow[] = [
  {
    file: "scripts/e2e-stack.sh",
    label: "e2e-stack.sh (instruct)",
    pattern: /\$\{MASSA_AI_E2E_LLM_MODEL:-([^}]+)\}/g,
    expected: [INFERENCE_PROVIDERS.ollama.defaultModels.instruct, INFERENCE_PROVIDERS.lmstudio.defaultModels.instruct],
  },
  {
    file: "scripts/e2e-stack.sh",
    label: "e2e-stack.sh (coding)",
    pattern: /\$\{MASSA_AI_E2E_LLM_CODE_MODEL:-([^}]+)\}/g,
    expected: [INFERENCE_PROVIDERS.ollama.defaultModels.coding, INFERENCE_PROVIDERS.lmstudio.defaultModels.coding],
  },
  {
    file: "install.sh",
    label: "install.sh (instruct)",
    pattern: /local llm_model="([^"]+)"/g,
    expected: [INFERENCE_PROVIDERS.ollama.defaultModels.instruct],
  },
  {
    file: "install.sh",
    label: "install.sh (coding)",
    pattern: /local llm_code_model="([^"]+)"/g,
    expected: [INFERENCE_PROVIDERS.ollama.defaultModels.coding],
  },
  {
    file: ".env.example",
    label: ".env.example (instruct)",
    pattern: /^MASSA_AI_LLM_MODEL=(\S+)$/gm,
    expected: [INFERENCE_PROVIDERS.ollama.defaultModels.instruct],
  },
  {
    file: ".env.example",
    label: ".env.example (coding)",
    pattern: /^MASSA_AI_LLM_CODE_MODEL=(\S+)$/gm,
    expected: [INFERENCE_PROVIDERS.ollama.defaultModels.coding],
  },
  {
    // F3 (Fix Pass 1, Batch 1) changed this file's shape from a bare
    // `LLM_MODEL="<literal>"` to `LLM_MODEL="${MASSA_AI_LLM_MODEL:-<literal>}"`
    // (an explicit-override survives, per G5) — the old extractor captured
    // the whole `${...}` expression instead of the literal and this test
    // regressed silently until this gate ran again. Re-anchored on the new
    // shape, mirroring setup-local-first.sh's own `${MASSA_AI_LLM_MODEL:-...}`
    // extractor below.
    file: "scripts/lib/installer-api-key.sh",
    label: "installer-api-key.sh installer_provider_defaults (instruct)",
    pattern: /LLM_MODEL="\$\{MASSA_AI_LLM_MODEL:-([^}]+)\}"/g,
    expected: [INFERENCE_PROVIDERS.lmstudio.defaultModels.instruct, INFERENCE_PROVIDERS.ollama.defaultModels.instruct],
  },
  {
    file: "scripts/lib/installer-api-key.sh",
    label: "installer-api-key.sh installer_provider_defaults (coding)",
    pattern: /CODE_MODEL="\$\{MASSA_AI_LLM_CODE_MODEL:-([^}]+)\}"/g,
    expected: [INFERENCE_PROVIDERS.lmstudio.defaultModels.coding, INFERENCE_PROVIDERS.ollama.defaultModels.coding],
  },
  // PDM-13 split what used to be one two-branch block in the wizard: the LM
  // Studio half moved into `installer_resolve_lmstudio_models` (prompt
  // library), the Ollama half stayed. Each file now carries exactly ONE
  // literal per role, so each gets its own row with a one-element `expected`.
  // Left as two rows rather than one relaxed row: a single row expecting one
  // match "somewhere" would pass if one of the two branches lost its default
  // entirely.
  {
    file: "scripts/lib/installer-feature-prompts.sh",
    label: "installer_resolve_lmstudio_models (instruct)",
    pattern: /\$\{MASSA_AI_LLM_MODEL:-([^}]+)\}/g,
    expected: [INFERENCE_PROVIDERS.lmstudio.defaultModels.instruct],
  },
  {
    file: "scripts/lib/installer-feature-prompts.sh",
    label: "installer_resolve_lmstudio_models (coding)",
    pattern: /\$\{MASSA_AI_LLM_CODE_MODEL:-([^}]+)\}/g,
    expected: [INFERENCE_PROVIDERS.lmstudio.defaultModels.coding],
  },
  {
    file: "scripts/setup-local-first.sh",
    label: "setup-local-first.sh ollama branch (instruct)",
    pattern: /\$\{MASSA_AI_LLM_MODEL:-([^}]+)\}/g,
    expected: [INFERENCE_PROVIDERS.ollama.defaultModels.instruct],
  },
  {
    file: "scripts/setup-local-first.sh",
    label: "setup-local-first.sh ollama branch (coding)",
    pattern: /\$\{MASSA_AI_LLM_CODE_MODEL:-([^}]+)\}/g,
    expected: [INFERENCE_PROVIDERS.ollama.defaultModels.coding],
  },
];

// ── Narrow Markdown tier (T13/R-06) ─────────────────────────────────────────
// Tier 3's completeness scans never reach `.md` files at all (their file-type
// filter excludes them), and widening that filter would sweep in `.specs/`
// history the design explicitly must not touch (R-06). This tier is a
// separate, narrow completeness scan over Markdown only: any tracked `.md`
// file that mentions an embedding or instruct/coding model default must be
// one of the 7 named docs (T16's write set), `.specs/`, or `CHANGELOG.md`
// (append-only history, excluded by design), or a dated benchmark report
// recording a past run rather than stating a current default.
const KNOWN_MARKDOWN_SURFACES = [
  "README.md",
  "FEATURES.md",
  "docs/CHEATSHEET.md",
  "docs/ONBOARDING.md",
  "apps/tools-api/OLLAMA_WSL_SETUP.md",
  "benchmarks/llm-judge/README.md",
  "benchmarks/needles/README.md",
  "packages/core/src/__tests__/e2e/COVERAGE.md",
];
const MARKDOWN_ALLOWED_PREFIXES = [".specs/", "CHANGELOG.md"];
// Dated benchmark run outputs, not default declarations — same historical
// class as `benchmarks/llm-judge/fixtures/known-{dup,distinct}.json` (design
// § Must NOT change).
const MARKDOWN_HISTORICAL_REPORTS = ["benchmarks/llm-judge/reports/llm-judge-baseline.md"];
const MARKDOWN_MODEL_TOKEN = /qwen3-embedding|qwen3-vl|qwen2\.5-coder|text-embedding-qwen3-embedding/;

describe("embedding defaults parity (EDC-06)", () => {
  let ref: { model: string; dims: string } | undefined;
  let refLm: { model: string; dims: string } | undefined;

  test("reference pair resolves (ollama) and agrees across defining modules", () => {
    // Kept inside a test (T13) so a rotted or removed reference throws a
    // named, counted test failure instead of crashing the whole file from
    // the describe() body before any test runs.
    ref = referencePair();
    expect(ref.model.length).toBeGreaterThan(0);
    expect(Number(ref.dims)).toBeGreaterThan(0);
    const table = read("packages/shared/src/config/embedding-dimensions.ts");
    expect(table).toContain(`"${ref.model}": ${ref.dims}`);
    // `embeddings/config.ts` used to restate the model as a quoted literal
    // fallback; it now derives it from the same seam property `ref` itself
    // reads, so the check follows (T13) — a model change there still cannot
    // pass unnoticed, because reverting to any other literal or expression
    // makes this fail.
    const core = read("packages/core/src/services/embeddings/config.ts");
    expect(core).toContain(`INFERENCE_PROVIDERS.ollama.defaultModels.embedding`);
    console.log(`[parity] reference pair (ollama): ${ref.model}/${ref.dims}`);
  });

  test("reference pair resolves (lmstudio)", () => {
    refLm = referencePairLmStudio();
    expect(refLm.model.length).toBeGreaterThan(0);
    expect(Number(refLm.dims)).toBeGreaterThan(0);
    console.log(`[parity] reference pair (lmstudio): ${refLm.model}/${refLm.dims}`);
  });

  test("every pair surface carries the reference pair (ollama)", () => {
    if (!ref) throw new Error("reference pair (ollama) did not resolve — see the previous test's failure");
    // Collect-then-assert so ONE red run names EVERY violating surface
    // (spec AC-1), instead of stopping at the first.
    const violations: string[] = [];
    for (const s of PAIR_SURFACES) {
      const text = read(s.file);
      const model = extractOne(s.file, text, s.model);
      const dims = extractOne(s.file, text, s.dims);
      if (model !== ref.model) violations.push(`${s.file}: model=${model} (want ${ref.model})`);
      if (dims !== ref.dims) violations.push(`${s.file}: dims=${dims} (want ${ref.dims})`);
    }
    console.log(`[parity] pair surfaces checked: ${PAIR_SURFACES.length}, reference ${ref.model}/${ref.dims}`);
    expect(violations).toEqual([]);
  });

  test("model-only surfaces carry the reference model", () => {
    if (!ref) throw new Error("reference pair (ollama) did not resolve — see the previous test's failure");
    for (const s of MODEL_ONLY_SURFACES) {
      expect(`${s.file} model=${extractOne(s.file, read(s.file), s.model)}`).toBe(`${s.file} model=${ref.model}`);
    }
    console.log(`[parity] model-only surfaces checked: ${MODEL_ONLY_SURFACES.length}`);
  });

  test("width-only surfaces carry the reference width", () => {
    if (!ref) throw new Error("reference pair (ollama) did not resolve — see the previous test's failure");
    for (const s of DIMS_ONLY_SURFACES) {
      expect(`${s.file} dims=${extractOne(s.file, read(s.file), s.dims)}`).toBe(
        `${s.file} dims=${ref.dims}`,
      );
    }
    console.log(`[parity] width-only surfaces checked: ${DIMS_ONLY_SURFACES.length}`);
  });

  test("every LM Studio pair surface carries the reference pair", () => {
    if (!refLm) throw new Error("reference pair (lmstudio) did not resolve — see the previous test's failure");
    // Same collect-then-assert shape as the Ollama pair test above (T21/G3):
    // one red run names every violating LM Studio surface, not just the
    // first — which is exactly what let M1a/M10/M13 hide behind each other
    // had they landed together.
    const violations: string[] = [];
    for (const s of LMSTUDIO_PAIR_SURFACES) {
      const label = s.label ?? s.file;
      const text = read(s.file);
      const model = extractOne(label, text, s.model);
      const dims = extractOne(label, text, s.dims);
      if (model !== refLm.model) violations.push(`${label}: model=${model} (want ${refLm.model})`);
      if (dims !== refLm.dims) violations.push(`${label}: dims=${dims} (want ${refLm.dims})`);
    }
    console.log(
      `[parity] LM Studio pair surfaces checked: ${LMSTUDIO_PAIR_SURFACES.length}, reference ${refLm.model}/${refLm.dims}`,
    );
    expect(violations).toEqual([]);
  });

  test("LM Studio model-only surfaces carry the reference model", () => {
    if (!refLm) throw new Error("reference pair (lmstudio) did not resolve — see the previous test's failure");
    for (const s of LMSTUDIO_MODEL_ONLY_SURFACES) {
      expect(`${s.file} model=${extractOne(s.file, read(s.file), s.model)}`).toBe(`${s.file} model=${refLm.model}`);
    }
    console.log(`[parity] LM Studio model-only surfaces checked: ${LMSTUDIO_MODEL_ONLY_SURFACES.length}`);
  });

  test("derived (structural) config-cli.ts surfaces still delegate to the seam", () => {
    // G3 — the printed population is a claim (PDM-05 AC-3): a row appearing
    // twice (e.g. re-pushed inside a loop that does not vary it) would both
    // inflate this count and let a single mutation be reported twice. Assert
    // the printed length equals the distinct-label count BEFORE checking the
    // rows themselves, so a reintroduced duplicate fails by name here instead
    // of silently inflating "surfaces checked".
    const distinctLabels = new Set(DERIVED_SURFACES.map((s) => s.label));
    if (distinctLabels.size !== DERIVED_SURFACES.length) {
      const seen = new Set<string>();
      const dupes = DERIVED_SURFACES.map((s) => s.label).filter((l) => (seen.has(l) ? true : (seen.add(l), false)));
      throw new Error(
        `DERIVED_SURFACES has ${DERIVED_SURFACES.length} rows but only ${distinctLabels.size} distinct labels — ` +
          `duplicated: ${[...new Set(dupes)].join(", ")}`,
      );
    }
    const violations = DERIVED_SURFACES.map(checkStructural).filter((v): v is string => v !== null);
    console.log(`[parity] derived structural surfaces checked: ${DERIVED_SURFACES.length}`);
    expect(violations).toEqual([]);
  });

  test("instruct/coding surfaces carry the seam's per-provider defaults", () => {
    const violations = INSTRUCT_CODING_SURFACES.flatMap(checkMultiMatch);
    console.log(`[parity] instruct/coding surfaces checked: ${INSTRUCT_CODING_SURFACES.length}`);
    expect(violations).toEqual([]);
  });

  test("no unlisted Markdown file mentions an embedding/instruct/coding model default", () => {
    const ls = Bun.spawnSync(["git", "ls-files", "*.md"], { cwd: ROOT });
    const tracked = ls.stdout.toString().trim().split("\n").filter(Boolean);
    const known = new Set([...KNOWN_MARKDOWN_SURFACES, ...MARKDOWN_HISTORICAL_REPORTS]);

    let scanned = 0;
    const offenders: string[] = [];
    for (const f of tracked) {
      if (MARKDOWN_ALLOWED_PREFIXES.some((p) => f.startsWith(p))) continue;
      let text: string;
      try {
        text = read(f);
      } catch {
        continue;
      }
      if (!MARKDOWN_MODEL_TOKEN.test(text)) continue;
      scanned++;
      if (!known.has(f)) offenders.push(f);
    }
    console.log(`[parity] Markdown tier population: ${scanned} tracked .md files mention a model default`);
    expect(scanned).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  /**
   * LIP-24 — the seam makes env readers invisible to literal scanners.
   *
   * `packages/core/src/services/health/local-health-checker.ts` used to read
   * `process.env.OLLAMA_EMBEDDING_MODEL` directly, and this scan saw it. T05
   * (Phase 3) replaced that with `process.env[spec.envNames.model]` — a
   * dynamic lookup through the `inference-providers.ts` seam. The env var is
   * still read at runtime (`spec.envNames.model` resolves to the literal
   * `"OLLAMA_EMBEDDING_MODEL"` for the ollama spec), but the literal token no
   * longer appears as text in the file, so this grep-based scan cannot see it
   * — population measured at 25 on `main@d523f06f`, 27 after Phase 1 (the two
   * new seam files), 26 after Phase 3 (this file left the token-visible set).
   * Re-keying Tier 3 below to a provider-neutral token does not restore
   * visibility here either, because the file names no provider prefix at
   * all anymore.
   *
   * Not silently accepted: `resolveConfiguredEmbeddingModel`'s env-precedence
   * behavior (env var wins over config.json, for the literal name
   * `OLLAMA_EMBEDDING_MODEL`) is covered by a different, behavioral sensor —
   * `packages/core/src/__tests__/health-checker-config.test.ts`'s "checkOllama
   * prefers env OLLAMA_EMBEDDING_MODEL over config" — which exercises the
   * real runtime read through the seam rather than grepping for it. That test
   * file is itself excluded from this scan's population (`isTestFile`), which
   * is why the two mechanisms do not overlap or double-count.
   */
  test("no unlisted tracked file assigns a *_EMBEDDING_MODEL/DIMENSIONS default", () => {
    const ls = Bun.spawnSync(["git", "ls-files"], { cwd: ROOT });
    const tracked = ls.stdout.toString().trim().split("\n");
    // Provider-neutral token (LIP-18/LIP-19b): any prefix, not just OLLAMA_ —
    // an LMSTUDIO_EMBEDDING_MODEL/DIMENSIONS pair must be as visible as the
    // Ollama one. Assignment-shaped, not env READS (process.env.X) and not
    // the passthrough allowlist (turbo.json is a bare name list, no "=").
    const mentionsToken = /[A-Za-z][A-Za-z0-9]*_EMBEDDING_(MODEL|DIMENSIONS)/;
    const assignment = /[A-Za-z][A-Za-z0-9]*_EMBEDDING_(MODEL|DIMENSIONS)\s*[=:]\s*["']?[\w.${:-]/;
    const literalDefault = envLiteralDefaultFor("\\w*_EMBEDDING_(?:MODEL|DIMENSIONS)");
    const known = new Set([
      ...PAIR_SURFACES.map((s) => s.file),
      ...MODEL_ONLY_SURFACES.map((s) => s.file),
      ...DIMS_ONLY_SURFACES.map((s) => s.file),
      // PDM-13: this list was absent, which was invisible only because every
      // file it names also appeared in one of the three above. It stopped
      // being true when `installer_resolve_lmstudio_models` moved the LM
      // Studio default into a file with no Ollama sibling — a surface this
      // suite already gates, reported as ungated.
      ...LMSTUDIO_MODEL_ONLY_SURFACES.map((s) => s.file),
      "packages/shared/src/config/massa-ai-config.ts",
      "packages/core/src/services/embeddings/config.ts",
      "packages/shared/src/config/config-loader.ts", // seeds env FROM config.json
      "packages/shared/src/config/inference-providers.ts", // the seam's own envNames map — names the var, assigns nothing
      // The canonical model→width table (LIP-04). Under the re-keyed
      // provider-neutral token, `KNOWN_EMBEDDING_DIMENSIONS: Readonly<...> =`
      // and `DEFAULT_EMBEDDING_DIMENSIONS = 2560` both read as an
      // "TOKEN[=:]value" assignment to the naive line scan below — a false
      // offender, not a new surface. This file IS the reference table
      // `referencePair()` reads at :64; it is reviewed, not unlisted.
      "packages/shared/src/config/embedding-dimensions.ts",
    ]);
    const allowedPrefixes = [".specs/", "docs/", "CHANGELOG.md", "FEATURES.md", "README.md"];
    // `^scripts/tests/` matches the instruct/coding scan's own predicate
    // below — the shell suites there are sensors, not installed surfaces, and
    // a suite that DRIVES an override var necessarily writes it. This scan was
    // the only one of the three still missing that arm.
    const isTestFile = (f: string) => /__tests__|\.test\.ts$|^scripts\/tests\//.test(f);

    const offenders: string[] = [];
    let scanned = 0;
    for (const f of tracked) {
      if (!/\.(ts|js|sh|ya?ml|json)$|^Dockerfile$|^\.env/.test(f)) continue;
      let text: string;
      try {
        text = read(f);
      } catch {
        continue;
      }
      if (!mentionsToken.test(text)) continue;
      scanned++;
      if (known.has(f) || isTestFile(f) || allowedPrefixes.some((p) => f.startsWith(p))) continue;
      for (const line of text.split("\n")) {
        if (isBareEnvRead(line, literalDefault)) continue;
        if (assignment.test(line) || literalDefault.test(line)) {
          offenders.push(`${f}: ${line.trim()}`);
          break;
        }
      }
    }
    console.log(`[parity] completeness scan population: ${scanned} tracked files mention *_EMBEDDING_MODEL/DIMENSIONS`);
    expect(scanned).toBeGreaterThan(5); // the scan itself must see its subjects
    expect(offenders).toEqual([]);
  });

  /**
   * F4/G1 — the embedding half has two completeness scans (this file's
   * `*_EMBEDDING_MODEL/DIMENSIONS` tier above and the width-writer tier
   * below); the instruct/coding half had none outside the narrow Markdown
   * tier. `INSTRUCT_CODING_SURFACES` above only checks the 4 files it
   * already knows about *by value* — it cannot see a fifth, unlisted writer
   * appear. This tier makes that population a gate the same way the
   * embedding tier already is, keyed on the single `MASSA_AI_LLM_*` env
   * prefix (AD-010) rather than a provider prefix, since instruct/coding
   * never had per-provider env var names the way `OLLAMA_EMBEDDING_MODEL` /
   * `LMSTUDIO_EMBEDDING_MODEL` do.
   */
  test("no unlisted tracked file assigns a *_LLM_MODEL/CODE_MODEL default", () => {
    const ls = Bun.spawnSync(["git", "ls-files"], { cwd: ROOT });
    const tracked = ls.stdout.toString().trim().split("\n");
    const mentionsToken = /[A-Za-z][A-Za-z0-9]*_LLM_(MODEL|CODE_MODEL)/;
    const assignment = /[A-Za-z][A-Za-z0-9]*_LLM_(MODEL|CODE_MODEL)\s*[=:]\s*["']?[\w.${:-]/;
    const literalDefault = envLiteralDefaultFor("\\w*_LLM_(?:MODEL|CODE_MODEL)");
    const known = new Set([
      ...INSTRUCT_CODING_SURFACES.map((s) => s.file),
      // The production reader itself (F5's subject) and its barrel
      // re-export: both derive through `DEFAULT_LLM_MODEL`/
      // `DEFAULT_LLM_CODE_MODEL` (the seam), never a literal.
      "packages/shared/src/config/index.ts",
      "packages/shared/src/index.ts",
      // Pure env passthrough into the container, empty fallback — no literal
      // model default (`${MASSA_AI_LLM_MODEL:-}`).
      "docker-compose.yml",
      // Turbo's passthrough allowlist — a bare name list, no "=".
      "turbo.json",
      // The LLM-judge benchmark's own fixed comparison-baseline default
      // (`qwen2.5:7b-instruct`/`qwen2.5-coder:7b`) is a deliberately
      // provider-independent judge model, not a per-provider runtime
      // default — reviewed, not a PDM-02 AC-2 writer.
      "benchmarks/llm-judge/run.ts",
    ]);
    const allowedPrefixes = [".specs/", "docs/", "CHANGELOG.md", "FEATURES.md", "README.md"];
    const isTestFile = (f: string) => /__tests__|\.test\.ts$|^scripts\/tests\//.test(f);

    const offenders: string[] = [];
    let scanned = 0;
    for (const f of tracked) {
      if (!/\.(ts|js|sh|ya?ml|json)$|^Dockerfile$|^\.env/.test(f)) continue;
      let text: string;
      try {
        text = read(f);
      } catch {
        continue;
      }
      if (!mentionsToken.test(text)) continue;
      scanned++;
      if (known.has(f) || isTestFile(f) || allowedPrefixes.some((p) => f.startsWith(p))) continue;
      for (const line of text.split("\n")) {
        if (isBareEnvRead(line, literalDefault)) continue;
        if (assignment.test(line) || literalDefault.test(line)) {
          offenders.push(`${f}: ${line.trim()}`);
          break;
        }
      }
    }
    console.log(`[parity] instruct/coding completeness scan population: ${scanned} tracked files mention *_LLM_MODEL/CODE_MODEL`);
    expect(scanned).toBeGreaterThan(0); // the scan itself must see its subjects
    expect(offenders).toEqual([]);
  });

  test("no unlisted tracked file writes an embedding block with a literal width", () => {
    // A SECOND completeness scan, keyed on a different literal, because the
    // one above cannot see the file that shipped the defect it exists to
    // catch. `scripts/lib/installer-api-key.sh` wrote `"dimensions": 4096`
    // beside a 2560-d model and has never contained the string
    // `OLLAMA_EMBEDDING_`, so the scan skipped it and reported clean. A scan
    // whose population cannot include a subject is not evidence about that
    // subject.
    //
    // This one keys on the defect's shape instead of one spelling of it: a
    // file that writes an embedding config block AND pins a width. Every
    // member is a reviewed surface; a new writer fails until it is listed and
    // its pair checked.
    const ls = Bun.spawnSync(["git", "ls-files"], { cwd: ROOT });
    const tracked = ls.stdout.toString().trim().split("\n");

    // The exact membership, measured — not a lower bound. Asserting the set
    // rather than a count means a surface silently disappearing (a deleted
    // file, a regex that stopped matching) goes red the same way a new
    // unlisted one does.
    //
    // Two files people expect here are legitimately absent.
    // `monitoring/metrics.ts` carries `dimensions:` on Prometheus histogram
    // labels and writes no embedding block. `scripts/lib/installer-api-key.sh`
    // no longer pins a literal at all — it derives the width from the model,
    // which is what closed the original defect, and is covered by executing
    // the template in scripts/__tests__/installer-config-template.test.ts.
    //
    // `packages/shared/src/config/inference-providers.ts` (T07/LIP-01's seam)
    // is a FIFTH member, added here rather than collapsed away: its `ollama`
    // spec derives `knownDimensions` from `embedding-dimensions.ts` (no
    // second copy — the T07 collapse this scan originally asked to verify),
    // but its `lmstudio` spec carries its own literal
    // `{ "text-embedding-nomic-embed-text-v1.5": 768 }` table, because that
    // model has no entry in the Ollama-only reference table. That is a real,
    // reviewed width-writer the scan's original trigger could not see at all
    // (measured: `writesEmbeddingBlock` never matches this file — it writes
    // no `embedding:` field, only named `InferenceProviderSpec` objects), so
    // the trigger below gained a second, narrowly-scoped alternative for the
    // `knownDimensions: { "<model>": <n> }` shape.
    //
    // `packages/shared/src/config/massa-ai-config.ts` left this population
    // (T13): T03b's fix made `dimensions:` derive via `knownEmbeddingDimensions(...)
    // ?? 768` instead of a literal digit, so `literalWidth` no longer matches
    // that block, and no other block in the file writes a dimensions literal
    // either. Measured absence, not an oversight — removed with this note so
    // its disappearance is a reviewed fact, not a silent scope narrowing.
    const KNOWN_WIDTH_WRITERS = [
      "apps/mcp-client/src/config-cli.ts",
      "apps/opencode-plugin/src/config-cli.ts",
      "packages/core/src/services/embeddings/config.ts",
      "packages/shared/src/config/inference-providers.ts",
    ];
    const allowedPrefixes = [".specs/", "docs/", "CHANGELOG.md", "FEATURES.md", "README.md"];
    const isTestFile = (f: string) => /__tests__|\.test\.ts$/.test(f);
    const writesEmbeddingBlock = /embedding\s*[:=]|"embedding"\s*:|config\.embedding/;
    const literalWidth = /["']?dimensions["']?\s*[:=]\s*\d/;
    // A literal `"<model>": <width>` entry inside a `knownDimensions: { … }`
    // object — the shape `inference-providers.ts` uses instead of a
    // `dimensions:`/`embedding:` field. Scoped to one `{ … }` body
    // (`[^}]*`, no nested braces) so it cannot drift into matching an
    // unrelated later line in the same file.
    const knownDimensionsTable = /knownDimensions:\s*\{[^}]*:\s*\d+[^}]*\}/;

    const matched: string[] = [];
    for (const f of tracked) {
      if (!/\.(ts|js|sh|ya?ml|json)$|^Dockerfile$|^\.env/.test(f)) continue;
      if (isTestFile(f) || allowedPrefixes.some((p) => f.startsWith(p))) continue;
      let text: string;
      try {
        text = read(f);
      } catch {
        continue;
      }
      const isWidthWriter =
        (writesEmbeddingBlock.test(text) && literalWidth.test(text)) || knownDimensionsTable.test(text);
      if (!isWidthWriter) continue;
      matched.push(f);
    }

    console.log(`[parity] width-writer scan population: ${matched.length} — ${matched.join(", ")}`);
    expect(matched.sort()).toEqual([...KNOWN_WIDTH_WRITERS].sort());
  });

  test("the ollama default is one pair across every writer of it", () => {
    // The two config CLIs disagreed for a full release. Comparing them to
    // EACH OTHER (not just to the reference individually, which the
    // DERIVED_SURFACES tier already does) is what says the surfaces are one
    // decision. Bounded to the ollama branch with the same `(?!\} else)`
    // lookahead as DERIVED_SURFACES (T13) — the old unbounded `[\s\S]*?` here
    // is what let this exact test slide past an empty ollama branch into the
    // mistral branch's literal and report `mistral-embed/1024`.
    const ollamaWriters = CONFIG_CLI_FILES;
    const modelRe = new RegExp(
      `provider === "ollama"\\) \\{${BOUND}const model = \\(options\\.model as string\\) \\|\\| (INFERENCE_PROVIDERS\\.ollama\\.defaultModels\\.embedding);`,
    );
    const dimsRe = new RegExp(`provider === "ollama"\\) \\{${BOUND}dimensions:\\s*(knownEmbeddingDimensions\\(model\\))\\s*\\?\\?\\s*\\d+,`);
    const pairs = ollamaWriters.map((f) => {
      const text = read(f);
      const model = modelRe.exec(text)?.[1];
      const dims = dimsRe.exec(text)?.[1];
      return `${f} → ${model}/${dims}`;
    });
    const distinct = new Set(pairs.map((p) => p.split(" → ")[1]));
    expect(`${[...distinct].join(" vs ")} across ${pairs.length} writers`).toBe(
      `INFERENCE_PROVIDERS.ollama.defaultModels.embedding/knownEmbeddingDimensions(model) across ${pairs.length} writers`,
    );
  });

  /**
   * The model→width table exists twice — in bash for the installers, in
   * TypeScript for the runtime — because a shell installer cannot import a
   * module. That is the same duplication shape that produced the original
   * 4096/2560 defect, so the two are compared to EACH OTHER rather than each
   * being checked against the reference separately: two tables can both be
   * internally consistent while disagreeing, which is exactly how the two
   * config CLIs above drifted for a release.
   */
  test("the bash and TypeScript model→width tables are the same table", () => {
    if (!ref) throw new Error("reference pair (ollama) did not resolve — see the previous test's failure");
    const shellBody = /installer_embedding_dimensions\(\)\s*\{[\s\S]*?\n\}/.exec(
      read("scripts/lib/installer-api-key.sh"),
    )?.[0];
    expect(shellBody).toBeDefined();
    const shellPairs: Record<string, number> = {};
    for (const m of shellBody!.matchAll(/^\s*([A-Za-z0-9._:-]+)\)\s*echo\s+(\d+)\s*;;/gm)) {
      shellPairs[m[1]!] = Number(m[2]);
    }

    const tsBody = /KNOWN_EMBEDDING_DIMENSIONS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(
      read("packages/shared/src/config/embedding-dimensions.ts"),
    )?.[1];
    expect(tsBody).toBeDefined();
    const tsPairs: Record<string, number> = {};
    for (const m of tsBody!.matchAll(/"([^"]+)":\s*(\d+)/g)) {
      tsPairs[m[1]!] = Number(m[2]);
    }

    // Both populations printed beside the verdict: a regex that silently
    // matched nothing would otherwise read as two agreeing empty tables.
    console.log(
      `[parity] model→width entries — bash ${Object.keys(shellPairs).length}, ` +
        `TypeScript ${Object.keys(tsPairs).length}`,
    );
    expect(Object.keys(shellPairs).length).toBeGreaterThan(2);
    // Exact set equality, so a model added to one table and not the other is
    // as red as a changed width.
    expect(tsPairs).toEqual(shellPairs);
    expect(tsPairs[ref.model]).toBe(Number(ref.dims));
  });
});

/**
 * G5 (PDM-10 AC-3) — `scripts/setup-local-first.sh`'s three `lms load -c`
 * invocations hardcoded 8192/16384/32768 with no sensor: mutating one
 * (`-c 16384` → `-c 4096`) left the parity gate and every shell suite green.
 * Each role's context value is asserted against `INFERENCE_ROLE_DEFAULTS`
 * directly (imported above), never against a copied literal, so this test
 * cannot drift out of sync with the seam the same way the shell script did.
 */
describe("setup-local-first.sh lms load -c values (PDM-10 AC-3, G5)", () => {
  const SETUP_SCRIPT = read("scripts/setup-local-first.sh");

  const LMS_LOAD_ROLES: Array<{
    role: keyof typeof INFERENCE_ROLE_DEFAULTS;
    varName: string;
  }> = [
    { role: "embedding", varName: "EMBEDDING_MODEL" },
    { role: "instruct", varName: "LLM_MODEL" },
    { role: "coding", varName: "CODE_MODEL" },
  ];

  for (const { role, varName } of LMS_LOAD_ROLES) {
    test(`the real "$LMSTUDIO_CLI" load command for the ${role} role matches INFERENCE_ROLE_DEFAULTS.${role}.contextWindow`, () => {
      const match = SETUP_SCRIPT.match(
        new RegExp(`"\\$LMSTUDIO_CLI" load -c (\\d+) --ttl "\\$LMS_LOAD_TTL_SECONDS" "\\$${varName}"`),
      );
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBe(INFERENCE_ROLE_DEFAULTS[role].contextWindow);
    });

    test(`the echo fallback for the ${role} role matches INFERENCE_ROLE_DEFAULTS.${role}.contextWindow`, () => {
      const match = SETUP_SCRIPT.match(
        new RegExp(`lms load -c (\\d+) --ttl \\$\\{LMS_LOAD_TTL_SECONDS\\} \\$\\{${varName}\\}`),
      );
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBe(INFERENCE_ROLE_DEFAULTS[role].contextWindow);
    });
  }

  const DEFAULT_WRITE_ROLES = LMS_LOAD_ROLES.filter(({ role }) => role !== "embedding");

  for (const { role, varName } of DEFAULT_WRITE_ROLES) {
    test(`the LM Studio per-model default written for the ${role} role matches INFERENCE_ROLE_DEFAULTS.${role}.contextWindow`, () => {
      const match = SETUP_SCRIPT.match(
        new RegExp(`installer_set_lmstudio_context_default "\\$LMSTUDIO_CLI" "\\$${varName}" (\\d+)`),
      );
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBe(INFERENCE_ROLE_DEFAULTS[role].contextWindow);
    });
  }

  test("the manual hint names each chat role's INFERENCE_ROLE_DEFAULTS context", () => {
    const match = SETUP_SCRIPT.match(
      /set Context Length: \$\{LLM_MODEL\} (\d+), \$\{CODE_MODEL\} (\d+)/,
    );
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(INFERENCE_ROLE_DEFAULTS.instruct.contextWindow);
    expect(Number(match![2])).toBe(INFERENCE_ROLE_DEFAULTS.coding.contextWindow);
  });
});
