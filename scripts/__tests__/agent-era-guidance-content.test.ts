/**
 * Content-sensor suite for the agent-era-harness-upgrades prose surfaces
 * (AEH-01/02/04/06/07/08/09). Reads the DELIVERED file text and asserts
 * presence/absence of load-bearing phrases — deliberately authored AFTER the
 * prose lands, and each assertion observed red once via a deliberate source
 * mutation during Execute (sensor-before-subject drift is a recorded defect
 * class per `.specs/lessons.json` L015-adjacent guidance).
 *
 * Assertions are resilient to incidental whitespace but specific to the
 * requirement — no broad substring that would pass on unrelated prose.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

function readSkill(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, "skills", "massa-ai", relPath), "utf-8");
}

// ---------------------------------------------------------------------------
// AEH-01/02: code-quality-audit.md split/size leads (T3)
// ---------------------------------------------------------------------------

describe("code-quality-audit.md: agent-read-aware split and file-size leads (AEH-01, AEH-02)", () => {
  const content = readSkill("workflows/code-quality/code-quality-audit.md");

  test("no remaining split-on-size-or-and-alone lead", () => {
    expect(content).not.toContain('if accurate description needs "and", recommend splitting');
  });

  test("split lead cites the discoverability-or-change-risk criterion", () => {
    expect(content).toContain(
      "split only when the result yields an externally-findable named unit (locatable by search or grep from outside the file) or measurably reduces change risk; never split on size or \"more than one thing\" alone.",
    );
  });

  test("SRP lead requires the same criterion, not concern-count or size alone", () => {
    expect(content).toContain("never on concern-count or size alone");
  });

  test("static leads flag multi-subject files and files over ~2000 lines", () => {
    expect(content).toContain("flag multi-subject files");
    expect(content).toContain("over ~2000 lines");
  });

  test("static leads SHALL NOT flag a single-subject file below the line-count bound", () => {
    expect(content).toContain("Do NOT flag a single-subject file for line count alone below that bound.");
  });

  test("KISS lead is preserved verbatim and gains a cross-reference to the criterion", () => {
    expect(content).toContain(
      "choose boring solutions unless complexity is justified (real variability, hard constraints, or measured bottlenecks).",
    );
    expect(content).toContain(
      "When weighing whether to split instead of inline, apply the same discoverability-or-change-risk criterion used for the split lead above.",
    );
  });
});

// ---------------------------------------------------------------------------
// AEH-01: code-quality-fix.md split directive (T4)
// ---------------------------------------------------------------------------

describe("code-quality-fix.md: discoverability-or-change-risk split criterion (AEH-01)", () => {
  const content = readSkill("workflows/code-quality/code-quality-fix.md");

  test("Clean Code split directive cites the same discoverability-or-change-risk criterion", () => {
    expect(content).toContain(
      "split functions only when the result yields an externally-findable named unit (locatable by search or grep from outside the file) or measurably reduces change risk — never split on size or \"more than one thing\" alone",
    );
  });

  test("SOLID split directive cites the discoverability-or-change-risk criterion", () => {
    expect(content).toContain(
      "separate mixed responsibilities only when the split yields an externally-findable named unit (locatable by search or grep from outside the file) or reduces change risk",
    );
  });

  test("KISS fix direction cross-references the split criterion", () => {
    expect(content).toContain(
      "When choosing whether to split instead of inline, apply the same discoverability-or-change-risk criterion used for the Clean Code split direction above.",
    );
  });
});

// ---------------------------------------------------------------------------
// AEH-01: refactor.md extract-for-findability payoff (T5)
// ---------------------------------------------------------------------------

describe("refactor.md: extract-for-findability payoff (AEH-01)", () => {
  const content = readSkill("workflows/refactor.md");

  test("step 8 names extract-for-findability as the primary extraction payoff", () => {
    expect(content).toContain(
      "The primary payoff of extraction is extract-for-findability: create a named unit locatable by search or grep from outside the file",
    );
  });

  test("extract-for-findability is tied to the existing AI-navigable goal", () => {
    expect(content).toContain('Reduce "abstraction cost" to make code more AI-navigable');
    expect(content).toContain("that is what makes code AI-navigable, not extraction volume alone");
  });
});
