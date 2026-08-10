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
 *  Tier 3 (complete)— any tracked file assigning OLLAMA_EMBEDDING_* not in
 *                     the known-surface/allowlist sets fails by name: a new
 *                     surface must be added here, not silently shipped.
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
  // Two `embedding:` blocks exist (interface at :11, defaults at :225). The
  // interface's provider is a type union (`"ollama" | "mistral" | …`), the
  // defaults block a literal — the trailing comma is the discriminator.
  const embeddingBlock = extractOne(
    "massa-ai-config.ts embedding defaults block",
    shared,
    /embedding:\s*(\{[^}]*provider:\s*"ollama",[^}]*\})/g,
  );
  const model = extractOne("massa-ai-config.ts model", embeddingBlock, /model:\s*"([^"]+)"/g);
  const dims = extractOne("massa-ai-config.ts dimensions", embeddingBlock, /dimensions:\s*(\d+)/g);

  // Second defining module must agree — a drift between the two reference
  // sources is itself a defect this test should catch.
  const core = read("packages/core/src/services/embeddings/config.ts");
  expect(core).toContain(`"${model}"`);
  expect(core).toContain(`?? ${dims}`);
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

describe("embedding defaults parity (EDC-06)", () => {
  const ref = referencePair();

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

  test("no unlisted tracked file assigns an OLLAMA_EMBEDDING_* default", () => {
    const ls = Bun.spawnSync(["git", "ls-files"], { cwd: ROOT });
    const tracked = ls.stdout.toString().trim().split("\n");
    // Assignment-shaped, not env READS (process.env.X) and not the
    // passthrough allowlist (turbo.json is a bare name list, no "=").
    const assignment = /OLLAMA_EMBEDDING_(MODEL|DIMENSIONS)\s*[=:]\s*["']?[\w.${:-]/;
    const known = new Set([
      ...PAIR_SURFACES.map((s) => s.file),
      ...MODEL_ONLY_SURFACES.map((s) => s.file),
      ...DIMS_ONLY_SURFACES.map((s) => s.file),
      "packages/shared/src/config/massa-ai-config.ts",
      "packages/core/src/services/embeddings/config.ts",
      "packages/shared/src/config/config-loader.ts", // seeds env FROM config.json
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
      if (!text.includes("OLLAMA_EMBEDDING_")) continue;
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
    console.log(`[parity] completeness scan population: ${scanned} tracked files mention OLLAMA_EMBEDDING_*`);
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
    const KNOWN_WIDTH_WRITERS = [
      "apps/mcp-client/src/config-cli.ts",
      "apps/opencode-plugin/src/config-cli.ts",
      "packages/core/src/services/embeddings/config.ts",
      "packages/shared/src/config/massa-ai-config.ts",
    ];
    const allowedPrefixes = [".specs/", "docs/", "CHANGELOG.md", "FEATURES.md", "README.md"];
    const isTestFile = (f: string) => /__tests__|\.test\.ts$/.test(f);
    const writesEmbeddingBlock = /embedding\s*[:=]|"embedding"\s*:|config\.embedding/;
    const literalWidth = /["']?dimensions["']?\s*[:=]\s*\d/;

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
      if (!writesEmbeddingBlock.test(text) || !literalWidth.test(text)) continue;
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
});
