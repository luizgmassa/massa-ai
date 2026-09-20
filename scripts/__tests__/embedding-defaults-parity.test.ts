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

const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

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

// ── Reference pair: the runtime defaults, from both defining modules ────────
function referencePair(): { model: string; dims: string } {
  const shared = read("packages/shared/src/config/massa-ai-config.ts");
  // Two `embedding:` blocks exist (the `MassaAiConfig` interface, and
  // `defaultMassaAiConfig`'s literal defaults). LIP-01 changed the
  // interface's `provider` field from a hand-written string union to
  // `(typeof EMBEDDING_PROVIDER_IDS)[number]` — a derived type reference,
  // not a union of string literals — so the discriminator is no longer
  // "literal vs. union". It still works: the interface's `embedding:` block
  // never contains the literal substring `provider: "ollama",` (it names a
  // type, not a value), so only `defaultMassaAiConfig`'s block — which
  // assigns the literal default — can ever satisfy this pattern. Re-anchored
  // on that literal-value match rather than on the now-nonexistent union
  // (LIP-19b).
  const embeddingBlock = extractOne(
    "massa-ai-config.ts embedding defaults block",
    shared,
    /embedding:\s*(\{[^}]*provider:\s*"ollama",[^}]*\})/g,
  );
  const model = extractOne("massa-ai-config.ts model", embeddingBlock, /model:\s*"([^"]+)"/g);
  const dims = extractOne("massa-ai-config.ts dimensions", embeddingBlock, /dimensions:\s*(\d+)/g);

  // Second defining module must agree — a drift between the two reference
  // sources is itself a defect this test should catch.
  //
  // That module used to be `embeddings/config.ts`, keyed on its `?? <dims>`
  // literal. The literal is gone: the ollama width now resolves through
  // `resolveEmbeddingDimensions`, so config.ts names no width at all and the
  // canonical model→width statement moved to `embedding-dimensions.ts`. A
  // repoint rather than a relaxation — a sweep whose anchor its own subject
  // deleted reports a clean population it can no longer see, so this asserts
  // against the table that now holds the fact.
  const table = read("packages/shared/src/config/embedding-dimensions.ts");
  expect(table).toContain(`"${model}": ${dims}`);
  // config.ts must still name the model default even though it no longer
  // names a width, so a model change there cannot pass unnoticed.
  const core = read("packages/core/src/services/embeddings/config.ts");
  expect(core).toContain(`"${model}"`);
  return { model, dims };
}

// ── Reference pair, LM Studio (T21/G3/LIP-18) ───────────────────────────────
// LM Studio is opt-in, never the shipped default, so it has no counterpart to
// `massa-ai-config.ts`'s `defaultMassaAiConfig` block to anchor on. Its one
// canonical model/width fact lives in the seam's own literal table —
// `INFERENCE_PROVIDERS.lmstudio.knownDimensions` in `inference-providers.ts`
// — which every surface below is required to restate identically. That
// object literal is unique in the file (Ollama's `knownDimensions` is the
// imported `KNOWN_EMBEDDING_DIMENSIONS` identifier, not a literal `{`), so
// no further anchoring is needed to keep the match to exactly one.
function referencePairLmStudio(): { model: string; dims: string } {
  const seam = read("packages/shared/src/config/inference-providers.ts");
  const model = extractOne(
    "inference-providers.ts lmstudio reference model",
    seam,
    /knownDimensions:\s*\{\s*"([^"]+)":\s*\d+/g,
  );
  const dims = extractOne(
    "inference-providers.ts lmstudio reference dims",
    seam,
    /knownDimensions:\s*\{\s*"[^"]+":\s*(\d+)/g,
  );
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
  {
    // `massa-ai-config use ollama` writes a literal pair into config.json.
    // Three provider branches share the `options.model || "…"` shape; the
    // extractors anchor inside the ollama branch only.
    file: "apps/mcp-client/src/config-cli.ts",
    model: /provider === "ollama"\) \{[\s\S]*?model: \(options\.model as string\) \|\| "([^"]+)"/g,
    dims: /provider === "ollama"\) \{[\s\S]*?dimensions:\s*(\d+)/g,
  },
  {
    // The second config CLI. The 2026-08 sweep corrected the mcp-client copy
    // above and left this one on nomic-embed-text/768, so which model
    // `massa-ai-config use ollama` wrote depended on which CLI you ran.
    file: "apps/opencode-plugin/src/config-cli.ts",
    model: /provider === "ollama"\) \{[\s\S]*?model: \(options\.model as string\) \|\| "([^"]+)"/g,
    dims: /provider === "ollama"\) \{[\s\S]*?dimensions:\s*(\d+)/g,
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
    file: "packages/core/src/services/embeddings/config.ts",
    model: /process\.env\.LMSTUDIO_EMBEDDING_MODEL \|\| file\?\.model \|\| "([^"]+)"/g,
    dims: /LMSTUDIO_EMBEDDING_DIMENSIONS[\s\S]*?\|\|\s*(\d+),/g,
  },
  {
    file: "apps/mcp-client/src/config-cli.ts",
    label: "apps/mcp-client/src/config-cli.ts (init --lmstudio)",
    model: /options\.lmstudio\) \{[\s\S]*?const model = "([^"]+)"/g,
    dims: /options\.lmstudio\) \{[\s\S]*?knownDimensions\[model\] \?\? (\d+)/g,
  },
  {
    file: "apps/mcp-client/src/config-cli.ts",
    label: "apps/mcp-client/src/config-cli.ts (use lmstudio)",
    model: /provider === "lmstudio"\) \{[\s\S]*?model = \(options\.model as string\) \|\| "([^"]+)"/g,
    dims: /provider === "lmstudio"\) \{[\s\S]*?knownDimensions\[model\] \?\? (\d+)/g,
  },
  {
    file: "apps/opencode-plugin/src/config-cli.ts",
    label: "apps/opencode-plugin/src/config-cli.ts (init --lmstudio)",
    model: /options\.lmstudio\) \{[\s\S]*?const model = "([^"]+)"/g,
    dims: /options\.lmstudio\) \{[\s\S]*?knownDimensions\[model\] \?\? (\d+)/g,
  },
  {
    file: "apps/opencode-plugin/src/config-cli.ts",
    label: "apps/opencode-plugin/src/config-cli.ts (use lmstudio)",
    model: /provider === "lmstudio"\) \{[\s\S]*?model = \(options\.model as string\) \|\| "([^"]+)"/g,
    dims: /provider === "lmstudio"\) \{[\s\S]*?knownDimensions\[model\] \?\? (\d+)/g,
  },
];

/** `install.sh`/`Dockerfile`/`docker-compose.yml`/`setup-ollama-wsl.sh`/
 *  `validate-vscode-integration.sh` carry no LM Studio equivalent at all
 *  (measured: zero `lmstudio`/`LMSTUDIO` occurrences besides the bash probe
 *  dialect's dispatch key) — genuinely Ollama-only surfaces, not a gap. */
const LMSTUDIO_MODEL_ONLY_SURFACES: Array<{ file: string; model: RegExp }> = [
  { file: "scripts/setup-local-first.sh", model: /\$\{LMSTUDIO_EMBEDDING_MODEL:-([^}]+)\}/g },
  // The LM Studio half of `diagnose.ts`'s DEFAULT_MODEL table — see the note
  // on its Ollama sibling in MODEL_ONLY_SURFACES above.
  { file: "scripts/diagnose.ts", model: /^ {2}lmstudio: "([^"]+)",$/gm },
];

describe("embedding defaults parity (EDC-06)", () => {
  const ref = referencePair();
  const refLm = referencePairLmStudio();

  test(`every pair surface carries the reference pair ${ref.model}/${ref.dims}`, () => {
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
    for (const s of MODEL_ONLY_SURFACES) {
      expect(`${s.file} model=${extractOne(s.file, read(s.file), s.model)}`).toBe(`${s.file} model=${ref.model}`);
    }
    console.log(`[parity] model-only surfaces checked: ${MODEL_ONLY_SURFACES.length}`);
  });

  test("width-only surfaces carry the reference width", () => {
    for (const s of DIMS_ONLY_SURFACES) {
      expect(`${s.file} dims=${extractOne(s.file, read(s.file), s.dims)}`).toBe(
        `${s.file} dims=${ref.dims}`,
      );
    }
    console.log(`[parity] width-only surfaces checked: ${DIMS_ONLY_SURFACES.length}`);
  });

  test(`every LM Studio pair surface carries the reference pair ${refLm.model}/${refLm.dims}`, () => {
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
    for (const s of LMSTUDIO_MODEL_ONLY_SURFACES) {
      expect(`${s.file} model=${extractOne(s.file, read(s.file), s.model)}`).toBe(`${s.file} model=${refLm.model}`);
    }
    console.log(`[parity] LM Studio model-only surfaces checked: ${LMSTUDIO_MODEL_ONLY_SURFACES.length}`);
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
    const known = new Set([
      ...PAIR_SURFACES.map((s) => s.file),
      ...MODEL_ONLY_SURFACES.map((s) => s.file),
      ...DIMS_ONLY_SURFACES.map((s) => s.file),
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
    const isTestFile = (f: string) => /__tests__|\.test\.ts$/.test(f);

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
        if (line.includes("process.env")) continue;
        if (assignment.test(line)) {
          offenders.push(`${f}: ${line.trim()}`);
          break;
        }
      }
    }
    console.log(`[parity] completeness scan population: ${scanned} tracked files mention *_EMBEDDING_MODEL/DIMENSIONS`);
    expect(scanned).toBeGreaterThan(5); // the scan itself must see its subjects
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
    const KNOWN_WIDTH_WRITERS = [
      "apps/mcp-client/src/config-cli.ts",
      "apps/opencode-plugin/src/config-cli.ts",
      "packages/core/src/services/embeddings/config.ts",
      "packages/shared/src/config/inference-providers.ts",
      "packages/shared/src/config/massa-ai-config.ts",
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
    // The two config CLIs disagreed for a full release. Comparing them to the
    // reference individually is what the PAIR_SURFACES loop does; comparing
    // them to EACH OTHER is what says the surfaces are one decision.
    const ollamaWriters = [
      "apps/mcp-client/src/config-cli.ts",
      "apps/opencode-plugin/src/config-cli.ts",
    ];
    const pairs = ollamaWriters.map((f) => {
      const text = read(f);
      const model = /provider === "ollama"\) \{[\s\S]*?model: \(options\.model as string\) \|\| "([^"]+)"/.exec(text)?.[1];
      const dims = /provider === "ollama"\) \{[\s\S]*?dimensions:\s*(\d+)/.exec(text)?.[1];
      return `${f} → ${model}/${dims}`;
    });
    const distinct = new Set(pairs.map((p) => p.split(" → ")[1]));
    expect(`${[...distinct].join(" vs ")} across ${pairs.length} writers`).toBe(
      `${ref.model}/${ref.dims} across ${pairs.length} writers`,
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
