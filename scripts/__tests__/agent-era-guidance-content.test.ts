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

function readAgentCharter(agentName: string): string {
  return readFileSync(resolve(REPO_ROOT, "skills", "agents", agentName, "SKILL.md"), "utf-8");
}

/** Collapses whitespace runs (including line wraps) to a single space, for phrases that may span a hard-wrapped source line. */
function norm(text: string): string {
  return text.replace(/\s+/g, " ");
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

// ---------------------------------------------------------------------------
// AEH-02: coding-guidelines.md "File shape for agent readers" section (T6)
// ---------------------------------------------------------------------------

describe("coding-guidelines.md: file shape for agent readers (AEH-02)", () => {
  const content = readSkill("references/coding-guidelines.md");

  test("section exists with the ~1000-line one-subject-file number", () => {
    expect(content).toContain("File Shape for Agent Readers");
    expect(content).toContain("~1000 lines is fine");
  });

  test("section states the ~2000-line single-agent-read bound", () => {
    expect(content).toContain("over ~2000 lines exceeds a single agent read");
  });

  test("section states the per-hop navigation cost of splitting one subject across files", () => {
    expect(content).toContain("one subject spread over N files costs N reads");
  });

  test("section is framed as read mechanics, not a module-depth metric", () => {
    expect(content).toContain("This guidance derives from agent read mechanics, not from module depth.");
    expect(content).toContain("Do not phrase file-size guidance as a depth metric");
    expect(content).toContain("depth is NOT a lines-of-code ratio");
  });
});

// ---------------------------------------------------------------------------
// AEH-04/05/08/09: tests-audit.md gate table, variation/trend sensors, tests lens (T7)
// ---------------------------------------------------------------------------

describe("tests-audit.md: five-gate error-class model, variation and trend sensors, tests lens (AEH-04, AEH-05, AEH-08, AEH-09)", () => {
  const content = readSkill("workflows/tests/tests-audit.md");

  test("gate table maps all five gates to their error class", () => {
    expect(content).toContain("| Unit | Business-logic errors |");
    expect(content).toContain("| Coverage | Code no test touched |");
    expect(content).toContain("| Variation | Hardcoded-example brittleness |");
    expect(content).toContain("| Acceptance-criteria mapping | Built-the-wrong-thing |");
    expect(content).toContain("| Quality-metric trend | Drift over time |");
  });

  test("variation sensor flags tests exercising only the single fixture example", () => {
    expect(content).toContain(
      "Variation check: flag tests exercising only the single fixture example where input bounds or parameters can vary",
    );
  });

  test("trend sensor reads metrics trend and reports direction when snapshots exist", () => {
    expect(content).toContain("Trend check: read `bun skills/massa-ai/scripts/lessons.ts --root . metrics trend`");
    expect(content).toContain("report the direction (improving, stable, degrading) when two or more snapshots exist");
  });

  test("dispatch names the tests lens and no longer files coverage under performance", () => {
    expect(content).toContain("`lens: tests`");
    expect(content).not.toContain("lens: performance");
    expect(content).not.toContain("test coverage is under the performance lens");
  });
});

// ---------------------------------------------------------------------------
// AEH-04: tests-fix.md variation fix method (T8)
// ---------------------------------------------------------------------------

describe("tests-fix.md: variation finding fix method (AEH-04)", () => {
  const content = readSkill("workflows/tests/tests-fix.md");

  test("variation fix method adds varied-input cases, never a fixture-example copy", () => {
    expect(content).toContain(
      "Variation: add varied-input cases (bounds, parameter changes)",
    );
    expect(content).toContain("never add a second copy of the fixture example");
  });
});

// ---------------------------------------------------------------------------
// AEH-04/09: test-engineer/SKILL.md five error classes and variation design (T9)
// ---------------------------------------------------------------------------

describe("test-engineer/SKILL.md: five error classes and variation test design (AEH-04, AEH-09)", () => {
  const content = readAgentCharter("test-engineer");

  test("mission names the five error classes", () => {
    expect(content).toContain("business-logic errors, code no test touched, hardcoded-example brittleness, built-the-wrong-thing, and drift over time");
  });

  test("responsibilities include variation/property-style test design, library-neutral", () => {
    expect(content).toContain("Design variation/property-style test cases");
    expect(content).toContain("technique-level, library-neutral");
  });
});

// ---------------------------------------------------------------------------
// AEH-08: audit-specialist/SKILL.md tests lens (T10)
// ---------------------------------------------------------------------------

describe("audit-specialist/SKILL.md: tests lens row (AEH-08)", () => {
  const content = readAgentCharter("audit-specialist");

  test("lens table gains a tests row routing to tests-audit.md", () => {
    expect(content).toContain(
      "| `tests` | Coverage, regression protection, assertion quality, variation | `workflows/tests/tests-audit.md` |",
    );
  });
});

// ---------------------------------------------------------------------------
// AEH-07: feature.md AC capture and AC-anchored verification (T11)
// ---------------------------------------------------------------------------

describe("feature.md: AC capture precedes implementation, verification checks captured ACs (AEH-07)", () => {
  const content = readSkill("workflows/feature.md");

  test("AC-capture step present, capturing 1-5 testable ACs or referencing an existing spec artifact", () => {
    expect(content).toContain(
      "Capture 1-5 testable acceptance criteria in the conversation before implementation starts, or reference an existing spec artifact",
    );
  });

  test("AC-capture step precedes the implementation step", () => {
    const acCaptureIdx = content.indexOf("Capture 1-5 testable acceptance criteria");
    const implementIdx = content.indexOf("Implement the feature by PR group");
    expect(acCaptureIdx).toBeGreaterThan(-1);
    expect(implementIdx).toBeGreaterThan(-1);
    expect(acCaptureIdx).toBeLessThan(implementIdx);
  });

  test("verification step checks outcomes against the captured acceptance criteria", () => {
    expect(content).toContain("check outcomes against the captured acceptance criteria from step 11");
  });
});

// ---------------------------------------------------------------------------
// AEH-03: references/lessons.md trust-ramp and metrics policy (T12)
// ---------------------------------------------------------------------------

describe("references/lessons.md: trust-ramp and metrics policy (AEH-03)", () => {
  const content = readSkill("references/lessons.md");
  const flat = norm(content);

  test("categories are free-form kebab labels, same convention as --scope", () => {
    expect(content).toContain("free-form kebab-case label");
    expect(flat).toContain("same convention as the existing `--scope` flag");
  });

  test("feedback levels: none/minor extend streak, major resets and demotes", () => {
    expect(content).toContain("`none` — no reviewer feedback; extends the category's streak.");
    expect(content).toContain("`minor` — a small correction; also extends the streak.");
    expect(flat).toContain("`major` — resets the category's streak to 0 and demotes a trusted category");
  });

  test("trust_threshold default 30, comparison is >=", () => {
    expect(content).toContain("`trust_threshold` (default 30)");
    expect(flat).toContain("The comparison is `>=`: a streak sitting exactly at the threshold is trusted.");
  });

  test("advisory-only meaning: reading depth, never merge approval", () => {
    expect(content).toContain("Trust status governs reading depth only");
    expect(flat).toContain("never governs, gates, or substitutes for per-PR merge approval");
    expect(flat).toContain('"Approval for one PR does not carry to the next" clause');
  });

  test("the four commands are documented with the exact implemented CLI syntax", () => {
    expect(content).toContain(
      "bun skills/massa-ai/scripts/lessons.ts --root . review add --category <kebab> --feedback none|minor|major --source <ref>",
    );
    expect(content).toContain("bun skills/massa-ai/scripts/lessons.ts --root . trust status [--category <kebab>]");
    expect(content).toContain(
      "bun skills/massa-ai/scripts/lessons.ts --root . metrics add --feature <slug> --result PASS|FAIL --fix-iterations <n> --surviving-mutants <n> --acs-total <n> --acs-covered <n>",
    );
    expect(content).toContain("bun skills/massa-ai/scripts/lessons.ts --root . metrics trend");
  });

  test("derived-state note: no cached flags, demotion is emergent", () => {
    expect(content).toContain("Both are derived state");
    expect(flat).toContain("there is no cached `streak`/`trusted` flag anywhere in the store");
  });
});

// ---------------------------------------------------------------------------
// AEH-03: references/implementation-delivery.md advisory trust-status line (T13)
// ---------------------------------------------------------------------------

describe("references/implementation-delivery.md: advisory trust-status context (AEH-03)", () => {
  const content = readSkill("references/implementation-delivery.md");

  test("advisory trust-status line present at the human-review stage", () => {
    expect(content).toContain(
      "the change's category trust status (`bun skills/massa-ai/scripts/lessons.ts --root . trust status --category <kebab>`) as advisory reading-depth context",
    );
    expect(content).toContain("it never substitutes for the approval decision below");
  });

  test("the per-PR merge-approval clause stays byte-identical", () => {
    expect(content).toContain("Approval for one PR does not carry to the next.");
  });
});

// ---------------------------------------------------------------------------
// AEH-05: references/spec-driven/validate.md metric-snapshot recording (T14)
// ---------------------------------------------------------------------------

describe("references/spec-driven/validate.md: post-validation metric snapshot recording (AEH-05)", () => {
  const content = readSkill("references/spec-driven/validate.md");

  test("recording step present with the exact metrics add CLI", () => {
    expect(content).toContain("Record Metric Snapshot (MANDATORY)");
    expect(content).toContain(
      "bun skills/massa-ai/scripts/lessons.ts --root . metrics add --feature <slug> --result PASS|FAIL --fix-iterations <n> --surviving-mutants <n> --acs-total <n> --acs-covered <n>",
    );
  });
});

// ---------------------------------------------------------------------------
// AEH-06: massa-ai-reviewer dispatch block wired into the 14 implementing/fix
// workflows (T15-T17). Shared constants and target lists below are reused
// across the T15/T16/T17 describe blocks as each batch lands.
// ---------------------------------------------------------------------------

const REVIEWER_DISPATCH_HEADER =
  "> **Dispatch: `massa-ai-reviewer`** (role: `reviewer`) — charter `skills/agents/reviewer/SKILL.md`";
const REVIEWER_FALLBACK_CLAUSE =
  "> - fallback: if the subagent is unavailable, run a standalone fresh-eyes review against this output contract and record the skipped-delegation reason";
const REVIEWER_PERSONA_BULLET =
  "> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed";

interface ReviewerDispatchTarget {
  file: string;
  scope: string;
}

/** Asserts one file carries the full reviewer dispatch block: header, scope, fallback, and the mandatory persona bullet. */
function expectReviewerDispatchBlock({ file, scope }: ReviewerDispatchTarget): void {
  const content = readSkill(file);
  expect(content).toContain(REVIEWER_DISPATCH_HEADER);
  expect(content).toContain(`> - scope: ${scope}`);
  expect(content).toContain(REVIEWER_FALLBACK_CLAUSE);
  expect(content).toContain(REVIEWER_PERSONA_BULLET);
}

const IMPLEMENTING_WORKFLOW_TARGETS: ReviewerDispatchTarget[] = [
  { file: "workflows/feature.md", scope: "the feature's diff surface and its task/AC context" },
  { file: "workflows/general.md", scope: "the change's diff surface and its task/AC context" },
  { file: "workflows/debug.md", scope: "the fix's diff surface and its task/AC context" },
  { file: "workflows/refactor.md", scope: "the change's diff surface and its task/AC context" },
  { file: "workflows/spec-driven.md", scope: "the task's diff surface and its task/AC context" },
];

describe("massa-ai-reviewer dispatch block: 5 implementing workflows (T15, AEH-06)", () => {
  for (const target of IMPLEMENTING_WORKFLOW_TARGETS) {
    test(`${target.file} carries the reviewer dispatch block with fallback and persona bullets`, () => {
      expectReviewerDispatchBlock(target);
    });
  }

  test("spec-driven.md's existing verification-agent dispatch block stays intact", () => {
    const content = readSkill("workflows/spec-driven.md");
    expect(content).toContain(
      "> **Dispatch: `massa-ai-verification-agent`** (role: `verification-agent`) — charter `skills/agents/verification-agent/SKILL.md`",
    );
    expect(content).toContain("> - scope: the feature's git diff surface, test files, and spec ACs");
    expect(content).toContain(
      "the verification-agent always runs automatically and writes `.specs/features/<slug>/validation.md`",
    );
  });

  test("the reviewer dispatch block precedes the verification-agent dispatch block in spec-driven.md", () => {
    const content = readSkill("workflows/spec-driven.md");
    const reviewerIdx = content.indexOf(REVIEWER_DISPATCH_HEADER);
    const verificationIdx = content.indexOf("> **Dispatch: `massa-ai-verification-agent`**");
    expect(reviewerIdx).toBeGreaterThan(-1);
    expect(verificationIdx).toBeGreaterThan(-1);
    expect(reviewerIdx).toBeLessThan(verificationIdx);
  });
});

const FIX_WORKFLOW_BATCH_1_TARGETS: ReviewerDispatchTarget[] = [
  "workflows/bugs/bugs-fix.md",
  "workflows/code-quality/code-quality-fix.md",
  "workflows/architecture/architecture-fix.md",
  "workflows/security/security-fix.md",
  "workflows/requirements/requirements-fix.md",
].map((file) => ({ file, scope: "the fix's diff surface and its task/AC context" }));

describe("massa-ai-reviewer dispatch block: fix workflows batch 1 (T16, AEH-06)", () => {
  for (const target of FIX_WORKFLOW_BATCH_1_TARGETS) {
    test(`${target.file} carries the reviewer dispatch block with fallback and persona bullets`, () => {
      expectReviewerDispatchBlock(target);
    });
  }
});
