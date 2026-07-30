/**
 * judge-with-debate workflow prose-contract test (JD-01..JD-12).
 *
 * The workflow is a prose contract executed by agents, so its CI sensor is a
 * structural-marker test: every load-bearing rule named in the design's
 * Verification Design must appear verbatim in the workflow file. Deleting or
 * corrupting a marker (the discrimination sensor at validation) turns this red.
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const WORKFLOW = path.join(
  REPO_ROOT,
  "skills/massa-ai/workflows/judge-with-debate.md",
);

let text: string;

describe("judge-with-debate workflow contract markers", () => {
  test("workflow file exists and is non-trivial", async () => {
    text = await fs.readFile(WORKFLOW, "utf8");
    expect(text.length).toBeGreaterThan(4000);
  });

  const markers: Array<[string, string]> = [
    // JD-04: consensus thresholds
    ["overall consensus threshold 0.5", "≤ **0.5**"],
    ["per-criterion consensus threshold 1.0", "≤ **1.0**"],
    // JD-03: fixed protocol bounds
    ["max 3 debate rounds", "max 3"],
    ["rounds 1..3", "rounds 1..3"],
    // JD-04: explicit acceptance semantics
    ["agreement accept value", "accept-consensus"],
    // JD-08: diversity honesty + per-invocation reactivation probe
    ["DIVERSITY DEGRADED mark", "DIVERSITY DEGRADED"],
    ["capability probe every invocation", "every invocation"],
    ["per-slot model J1", "`deepseek-v4-pro`"],
    ["per-slot model J2", "`minimax-m3`"],
    ["per-slot model J3", "`GLM-5.2`"],
    ["meta model", "`kimi-k3`"],
    // JD-07 / design C5: two-stage meta-judge YAML validation
    ["stage 1 syntactic", "**Syntactic**"],
    ["stage 2 weights", "**Weights**"],
    ["stage 3 semantic shape", "**Semantic shape**"],
    ["first failed check named", "first failed check"],
    ["single retry then Blocked", "retry the meta-judge **once**"],
    // Reply-block schema fields (orchestrator's only input)
    ["reply status field", "status: Complete | Partial | Blocked"],
    ["reply judge field", "judge: 1 | 2 | 3"],
    ["reply round field", "round: 0 | 1 | 2 | 3"],
    ["reply scores", "scores:"],
    ["reply agreement", "agreement:"],
    ["reply revisions", "revisions:"],
    // A3: orchestrator never opens judge files
    ["orchestrator file firewall", "never opens `audits/judge/"],
    // JD-03: append-only debate sections
    ["append-only debate rule", "append-only"],
    ["debate section heading", "## Debate Round {R}"],
    // JD-06: honest no-consensus
    ["no forced verdict", "NO CONSENSUS — human review required"],
    // JD-09: report naming + collision suffix
    ["judge report family", "audits/judge/"],
    ["collision suffix rule", "`-2`, `-3`"],
    // JD-12: prefixed dispatch names inline
    ["meta-judge dispatch name", "`massa-ai-meta-judge`"],
    ["judge dispatch name", "`massa-ai-judge`"],
    // JD-01: specification verbatim across rounds
    ["specification verbatim", "verbatim"],
  ];

  for (const [label, marker] of markers) {
    test(`marker present: ${label}`, () => {
      expect(text).toContain(marker);
    });
  }

  test("multi-occurrence load-bearing markers survive partial deletion (validation gap #1)", () => {
    // Presence-only toContain cannot detect deleting ONE of N occurrences; pin the
    // load-bearing sites (Step 0.5 rule + Step 5 report line) with a floor count.
    const occurrences = text.match(/DIVERSITY DEGRADED/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  test("parallel dispatch for the panel (JD-02)", () => {
    const parallel = text.match(/in parallel/g) ?? [];
    expect(parallel.length).toBeGreaterThanOrEqual(2);
  });

  test("pitfalls section encodes the base-pattern failure modes (JD-01/03/04)", () => {
    const pitfalls = text.split("## Pitfalls")[1] ?? "";
    expect(pitfalls).toContain("Never skip the meta-judge");
    expect(pitfalls).toContain("verbatim");
    expect(pitfalls).toContain("append-only");
    expect(pitfalls).toContain("sycophancy");
    expect(pitfalls).toContain("Never exceed 3 debate rounds");
  });
});
