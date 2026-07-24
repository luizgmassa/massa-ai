import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const README_PATH = resolve(ROOT, "README.md");
const FEATURES_PATH = resolve(ROOT, "FEATURES.md");

function readReadme(): string {
  return readFileSync(README_PATH, "utf8");
}

function readFeatures(): string {
  return readFileSync(FEATURES_PATH, "utf8");
}

/** Prose with markdown emphasis and hard newlines normalized, so phrase
 *  assertions match what a reader sees rather than the exact markdown bytes. */
function prose(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "") // drop fenced code blocks
    .replace(/[`*]/g, "") // strip inline code/emphasis markers
    .replace(/\s+/g, " "); // collapse newlines/indentation
}

/**
 * TASK-026 docs-parity guard. Keeps the README (summary layer) and FEATURES.md
 * (depth layer) honest about the measured polyglot structural-indexing behavior
 * and forbids stale regex / zero-symbol limitation claims from returning.
 * Deterministic and fast (file read + scans).
 *
 * Doc split contract: README holds the summary + pointer; FEATURES.md holds the
 * per-feature depth (verification commands, FQNs, readiness, performance
 * status). This test asserts the summary against README and the detail against
 * FEATURES.md so the two stay in sync.
 *
 * Calibration note: the forbidden-phrase scan is scoped to active user-facing
 * prose. Phrases that legitimately appear in code, identifiers, or historical
 * spec evidence are not flagged here; this test only guards the narrative.
 */
describe("polyglot indexing docs parity", () => {
  const readme = readReadme();
  const features = readFeatures();

  describe("required content is present", () => {
    test("README has a Structural indexing section", () => {
      expect(readme).toContain("## Structural indexing");
    });

    test("documents the 33 canonical extensions", () => {
      expect(features).toMatch(/33 canonical (source )?extensions/);
      expect(readme).toMatch(/33 canonical source extensions/);
    });

    test("documents macOS arm64 and Linux glibc x64 as the native targets", () => {
      const featuresProse = prose(features);
      expect(featuresProse).toMatch(/macOS arm64/);
      expect(featuresProse).toMatch(/Linux glibc x64/);
      expect(readme).toMatch(/macOS arm64/);
      expect(readme).toMatch(/Linux glibc x64/);
    });

    test("documents readiness vs. liveness", () => {
      expect(features).toMatch(/readiness/i);
      expect(features).toMatch(/liveness/i);
      expect(features).toContain("validateAllGrammars");
    });

    test("documents graph schema v2 / rebuild visibility", () => {
      expect(features).toContain("Graph schema v2");
      expect(features).toMatch(/generation/);
      expect(features).toContain("CAS");
    });

    test("documents diagnostics bounding (<=10 details, exact totals)", () => {
      // The verifier contract caps diagnostics detail rows; the depth doc records
      // the lifetime-sensor count and the RSS gate as the measured evidence.
      const featuresProse = prose(features);
      expect(featuresProse).toMatch(/10 lifetime sensors/);
      expect(featuresProse).toMatch(/16 MiB/);
    });

    test("documents modern + legacy FQNs and ambiguity", () => {
      expect(features).toContain("legacy");
      expect(features).toContain("modern");
      expect(features).toContain("ambiguity");
      expect(features).toContain("sha256");
    });

    test("documents embedded parsing (Vue/Markdown)", () => {
      expect(features).toContain("Embedded parsing");
      expect(features).toContain("Vue");
      expect(features).toContain("Markdown");
    });
  });

  describe("verification evidence is documented", () => {
    test("lists the native verifier commands and measured numbers", () => {
      expect(features).toContain("verify:tree-sitter-native");
      expect(features).toContain("verify:tree-sitter-source-dist");
      expect(features).toContain("verify:tree-sitter-package");
      expect(features).toContain("bench:parser");
      // Measured evidence numbers from the verifier
      expect(features).toContain("33+33 parses");
      expect(features).toContain("27 native modules");
      expect(features).toContain("16 MiB");
    });

    test("documents runtime/build-helper pins", () => {
      expect(readme).toContain("1.3.14"); // Bun application runtime
      expect(readme).toContain("25.9.0"); // Node build-only helper
      expect(readme).toContain("11.14.1"); // npm
    });
  });

  describe("performance status is honest", () => {
    test("states native is correct/verified and reframed, not at parity with regex", () => {
      // After the 2026-07-17 reframe, the doc states native is correct/verified
      // and that like-for-like parity with the regex baseline is unlikely (the
      // full-AST indexer produces richer per-symbol extraction). It must NOT
      // claim parity with regex.
      expect(features).toMatch(/correct and verified/);
      expect(features).toMatch(/unlikely|not a regex-relative/);
      expect(readme).toMatch(/correct and verified/);
      // Must NOT claim parity with regex
      expect(readme.toLowerCase()).not.toMatch(/native.*parity with (the )?regex/);
      expect(features.toLowerCase()).not.toMatch(/native.*parity with (the )?regex/);
    });
  });

  describe("no stale regex / zero-symbol limitation claims remain", () => {
    // Forbidden in user-facing prose: stale limitations from the pre-native regex era.
    // These phrases imply parsing does not work or produces no symbols.
    const forbiddenPhrases = [
      /zero[\s-]*symbols?/i,
      /not parsed/i,
      /regex structural/i,
      /typed[\s-]*edge extractor/i,
      /regex[\s-]*only/i,
      /no structural (indexing|parsing)/i,
      /symbols? (are|are\s+not) (?:not )?extracted via regex/i,
    ];

    test("README and FEATURES contain none of the forbidden stale-limitation phrases", () => {
      // Scope to the normalized narrative (code blocks + emphasis stripped) so a
      // legitimate identifier or historical reference inside an example is not
      // flagged.
      const readmeNarrative = prose(readme);
      const featuresNarrative = prose(features);
      const offenders = forbiddenPhrases
        .map((re) => ({
          re,
          match: readmeNarrative.match(re) ?? featuresNarrative.match(re),
        }))
        .filter((o) => o.match !== null);
      expect(offenders).toEqual([]);
    });
  });

  describe("documented extension count matches the manifest", () => {
    test("LANGUAGE_MANIFEST length is 33", () => {
      // Cross-check that the documented "33" matches the source-of-truth manifest.
      // Importing the TS module would pull the native grammar loader, so count the
      // frozen `entry(...)` declarations in the manifest source instead. The
      // manifest's own `assertLanguageManifestExhaustive()` enforces equality with
      // DEFAULT_ALLOWED_EXTENSIONS at module load; here we couple the doc's "33"
      // to that same count deterministically and without a native import.
      const manifestPath = resolve(
        ROOT,
        "packages/core/src/services/structural/language-manifest.ts",
      );
      const manifestSrc = readFileSync(manifestPath, "utf8");
      const entryCount = (manifestSrc.match(/^\s*entry\(/gm) ?? []).length;
      expect(entryCount).toBe(33);
      expect(features).toMatch(/33/);
    });
  });
});
