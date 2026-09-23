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
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

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

/** Every workflow .md under skills/massa-ai/workflows/, relative to the skill root. */
function listWorkflowFiles(): string[] {
  const root = resolve(REPO_ROOT, "skills", "massa-ai", "workflows");
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) {
        out.push(`workflows/${relative(root, full).split(sep).join("/")}`);
      }
    }
  };
  walk(root);
  return out.sort();
}

// ---------------------------------------------------------------------------
// AEH-01/02: the code quality lens (T3, T4)
//
// REPOINTED, not relaxed. These rules lived inline in code-quality-audit.md and
// code-quality-fix.md, in three different phrasings of one criterion, and this
// suite grepped each phrasing where it sat. They now live once in
// `references/code-quality-lens.md`, so the assertions follow the content to
// its new home rather than being deleted with the prose — repointed by content
// identity, phrase by phrase, not by line delta.
//
// Two properties are asserted that a straight relocation of the greps would
// lose, and they are the reason an extraction is not free:
//
//   1. Each workflow must still LOAD the lens. A rule extracted into a file
//      nobody reads is a rule that stopped applying, and every assertion below
//      would still pass.
//   2. Neither workflow may re-inline the criterion. Two copies of a split rule
//      that drift is the defect the extraction exists to prevent, and a
//      presence-only check on the reference cannot see it.
// ---------------------------------------------------------------------------

describe("code-quality-lens.md: the split criterion and file-shape rule (AEH-01, AEH-02)", () => {
  const content = readSkill("references/code-quality-lens.md");

  test("no remaining split-on-size-or-and-alone lead", () => {
    expect(content).not.toContain('if accurate description needs "and", recommend splitting');
  });

  test("the canonical split criterion carries both halves, including the negative one", () => {
    expect(norm(content)).toContain(
      "Split only when the result yields an externally-findable named unit (locatable by search or grep from outside the file) or measurably reduces change risk; never split on size or \"more than one thing\" alone.",
    );
  });

  test("the SRP row requires the same criterion, not concern-count or size alone", () => {
    expect(content).toContain("never on concern-count or size alone");
  });

  test("the file-shape rule flags multi-subject files and files over ~600 lines", () => {
    expect(content).toContain("Flag multi-subject files");
    expect(content).toContain("over ~600 lines");
  });

  test("the file-shape rule SHALL NOT flag a single-subject file below the line-count bound", () => {
    expect(norm(content)).toContain("Do NOT flag a single-subject file for line count alone below that bound.");
  });

  test("KISS lead is preserved verbatim and cross-references the criterion", () => {
    expect(norm(content)).toContain(
      "choose boring solutions unless complexity is justified (real variability, hard constraints, or measured bottlenecks).",
    );
    expect(norm(content)).toContain(
      "When weighing whether to split instead of inline, apply the Split Criterion above unchanged",
    );
  });

  test("the fix directions for SOLID and Clean Code keep the criterion in their own words", () => {
    // The fix side used to carry these two sentences in code-quality-fix.md.
    // They are directions ("separate", "split functions"), not detections, so
    // they survive as the lens's Fix-direction column rather than collapsing
    // into the detection sentence above.
    expect(content).toContain(
      "separate mixed responsibilities only when the split yields an externally-findable named unit (locatable by search or grep from outside the file) or reduces change risk",
    );
    expect(content).toContain(
      "split functions only when the result yields an externally-findable named unit (locatable by search or grep from outside the file) or measurably reduces change risk — never split on size or \"more than one thing\" alone",
    );
  });

  test("the architecture boundary survived the move", () => {
    expect(norm(content)).toContain(
      "Do not report, recommend, or introduce ports, adapters, bounded contexts, new service/module boundaries, or VSA-style folder migration from this lens.",
    );
  });
});

describe("code quality workflows: both load the lens and neither re-inlines it", () => {
  const WORKFLOWS = [
    "workflows/code-quality/code-quality-audit.md",
    "workflows/code-quality/code-quality-fix.md",
  ] as const;

  /**
   * The clause every phrasing of the split criterion shares. Asserting on this
   * fragment rather than a full sentence is deliberate: a re-inlined copy would
   * almost certainly be reworded, and a full-sentence check would miss exactly
   * the drift it exists to catch.
   */
  const CRITERION_FRAGMENT = "externally-findable named unit";

  for (const rel of WORKFLOWS) {
    test(`${rel} loads references/code-quality-lens.md`, () => {
      expect(readSkill(rel)).toContain("references/code-quality-lens.md");
    });

    test(`${rel} does not restate the split criterion inline`, () => {
      expect(readSkill(rel)).not.toContain(CRITERION_FRAGMENT);
    });
  }
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

  test("section exists with the ~500-line one-subject-file number", () => {
    expect(content).toContain("File Shape for Agent Readers");
    expect(content).toContain("~500 lines is fine");
  });

  test("section states the ~600-line split bound", () => {
    expect(content).toContain("over ~600 lines must be flagged for splitting");
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

describe("pr-review.md: coverage dimension uses the dedicated tests lens (AEH-08 reconciliation)", () => {
  const content = readSkill("workflows/pr-review.md");

  test("coverage dimension dispatches lens: tests, not coverage-under-performance", () => {
    expect(content).toContain("| 5 | Test coverage | `massa-ai-audit-specialist` | `lens: tests`");
    expect(content).not.toContain("the charter's lens set has no `tests` lens");
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
// AEH-06: massa-ai-reviewer dispatch block wired into the implementing/fix
// workflows (T15-T17; 12 since agent-roster-consolidation removed `general` and `maestro-fix`). Shared constants and target lists below are reused
// across the T15/T16/T17 describe blocks as each batch lands.
// ---------------------------------------------------------------------------

const REVIEWER_DISPATCH_HEADER =
  "> **Dispatch: `massa-ai-reviewer`** (role: `reviewer`) — charter `skills/agents/reviewer/SKILL.md`";
/**
 * The reviewer's `fallback` and the universal `persona` bullet used to be
 * asserted here, per file, because each block carried them verbatim. Both are
 * now Role Defaults in `references/agent-orchestration.md` — stated once,
 * applying to every dispatch — so asserting them per block would assert their
 * absence-by-design as a failure.
 *
 * They are not unguarded: `skills-harness-integrity.test.ts`'s role-defaults
 * group asserts that the reference states each default, that the section claims
 * universality, and that NO block restates one. What stays here is what is
 * genuinely per-file — the header and the file's own `scope` sentence — plus
 * the requirement that the defaults have actually moved rather than vanished.
 */
const REVIEWER_FALLBACK_CLAUSE =
  "`fallback`: if the subagent is unavailable, run a standalone fresh-eyes review against this output contract and record the skipped-delegation reason";

interface ReviewerDispatchTarget {
  file: string;
  scope: string;
}

/** Asserts one file carries its own half of the reviewer dispatch block: header and scope. */
function expectReviewerDispatchBlock({ file, scope }: ReviewerDispatchTarget): void {
  const content = readSkill(file);
  expect(content).toContain(REVIEWER_DISPATCH_HEADER);
  expect(content).toContain(`> - scope: ${scope}`);
}

/** The reviewer's fallback survived the move into the shared defaults. */
function expectReviewerFallbackDefault(): void {
  const body = readSkill("references/agent-orchestration.md");
  const start = body.indexOf("### Role Defaults");
  expect(start, "agent-orchestration.md has no Role Defaults section").toBeGreaterThan(-1);
  expect(body.slice(start)).toContain(REVIEWER_FALLBACK_CLAUSE);
}

const IMPLEMENTING_WORKFLOW_TARGETS: ReviewerDispatchTarget[] = [
  { file: "workflows/feature.md", scope: "the feature's diff surface and its task/AC context" },
  { file: "workflows/debug.md", scope: "the fix's diff surface and its task/AC context" },
  { file: "workflows/refactor.md", scope: "the change's diff surface and its task/AC context" },
  { file: "workflows/spec-driven.md", scope: "the task's diff surface and its task/AC context" },
];

describe("massa-ai-reviewer dispatch block: 4 implementing workflows (T15, AEH-06)", () => {
  test("the reviewer's fallback clause survived the move into the shared role defaults", () => {
    expectReviewerFallbackDefault();
  });

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

const FIX_WORKFLOW_BATCH_2_TARGETS: ReviewerDispatchTarget[] = [
  "workflows/tests/tests-fix.md",
  "workflows/implementation/implementation-fix.md",
  "workflows/mobile-figma/mobile-figma-fix.md",
].map((file) => ({ file, scope: "the fix's diff surface and its task/AC context" }));

describe("massa-ai-reviewer dispatch block: fix workflows batch 2 (T17, AEH-06)", () => {
  for (const target of FIX_WORKFLOW_BATCH_2_TARGETS) {
    test(`${target.file} carries the reviewer dispatch block with fallback and persona bullets`, () => {
      expectReviewerDispatchBlock(target);
    });
  }

  test("all 12 wired workflows carry the reviewer dispatch block (count sensor)", () => {
    const allTargets = [
      ...IMPLEMENTING_WORKFLOW_TARGETS,
      ...FIX_WORKFLOW_BATCH_1_TARGETS,
      ...FIX_WORKFLOW_BATCH_2_TARGETS,
    ];
    expect(allTargets.length).toBe(12);
    const withBlock = allTargets.filter(({ file }) => readSkill(file).includes(REVIEWER_DISPATCH_HEADER));
    expect(withBlock.length).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// The reviewer's trigger line, both directions.
//
// Written after a Plan Challenge pre-mortem found this line ungated in BOTH
// directions: AEH-06 pinned the reviewer block's header, scope, fallback and
// persona bullets verbatim in all 14 files and never touched `trigger:`, which
// is the bullet that states the dispatch is mandatory. A proposal to tier the
// reviewer by Verification Ladder size would therefore have landed silently in
// 14 source workflows and 48 generated bundle copies with every gate green.
//
// The proposal was dropped — it removes no line from any workflow (the
// `fallback:` bullet already covers an unavailable subagent, so tiering only
// widens entry into a path that already exists), and at Quick size it would
// leave zero dispatched independent readers, since
// `references/verification-ladder.md`'s Independent Verification Mandate
// already lets the VERIFIER skip its subagent hop there. The reviewer dispatch
// is what keeps "author ≠ verifier" true at Quick.
//
// The gap it exposed is real either way, so this is the sensor. Shaped after
// the designer group in workflow-harness-contract.test.ts (a byte-identical
// trigger across a known set), but split by what is actually uniform rather
// than asserting a uniformity that does not hold: 12 of the 14 share one
// generic lead-in, and 2 carry a finding-specific one that is more precise, not
// drifted. What ALL 14 share is the mandatory-ness claim, and that is the part
// worth a gate.
// ---------------------------------------------------------------------------

describe("reviewer dispatch trigger: mandatory in all 12, and not by accident", () => {
  const ALL_REVIEWER_TARGETS = [
    ...IMPLEMENTING_WORKFLOW_TARGETS,
    ...FIX_WORKFLOW_BATCH_1_TARGETS,
    ...FIX_WORKFLOW_BATCH_2_TARGETS,
  ];

  /** The generic lead-in, shared byte-identically by 10 of the 12. */
  const GENERIC_TRIGGER =
    "> - trigger: implementation complete, before the verification gate — never optional";

  /**
   * The two workflows whose trigger names the unit of work instead of "the
   * implementation", because they close one audit finding at a time rather than
   * a whole change. Enumerated, not pattern-matched: "is this divergence
   * deliberate?" is a judgment, and a regex permissive enough to accept these
   * two would accept a drifted third.
   */
  const FINDING_SCOPED_TRIGGERS: Record<string, string> = {
    "workflows/architecture/architecture-fix.md":
      "> - trigger: implementation of the architecture finding complete, before the verification gate — never optional",
    "workflows/code-quality/code-quality-fix.md":
      "> - trigger: implementation of the CQ finding complete, before the verification gate — never optional",
  };

  /** The reviewer block's own `trigger:` line in a file, or undefined. */
  function reviewerTrigger(file: string): string | undefined {
    const lines = readSkill(file).split(/\r?\n/);
    const headerIdx = lines.findIndex((l) => l.startsWith(REVIEWER_DISPATCH_HEADER));
    if (headerIdx === -1) return undefined;
    // Scan only this block: stop at the first non-blockquote line, so a later
    // dispatch block's trigger can never be mistaken for the reviewer's.
    for (let i = headerIdx + 1; i < lines.length && lines[i]!.startsWith(">"); i++) {
      if (lines[i]!.startsWith("> - trigger:")) return lines[i];
    }
    return undefined;
  }

  for (const { file } of ALL_REVIEWER_TARGETS) {
    test(`${file}'s reviewer trigger states the dispatch is never optional`, () => {
      const trigger = reviewerTrigger(file);
      expect(trigger, `${file} has no reviewer trigger line`).toBeDefined();
      expect(trigger).toContain("— never optional");
      // And it is one of the two sanctioned wordings, not a third.
      expect(trigger).toBe(FINDING_SCOPED_TRIGGERS[file] ?? GENERIC_TRIGGER);
    });
  }

  test("the 10 generic triggers are byte-identical to each other", () => {
    const generic = ALL_REVIEWER_TARGETS
      .map(({ file }) => file)
      .filter((file) => !(file in FINDING_SCOPED_TRIGGERS))
      .map((file) => reviewerTrigger(file));
    expect(generic.length).toBe(10); // guard the guard: the split must stay 10/2
    expect(new Set(generic).size).toBe(1);
  });

  test("pr-review.md's reviewer dispatch is deliberately NOT this trigger", () => {
    // Negative control. Without it, a mutation that pasted the mandatory trigger
    // into every reviewer block on disk would pass every assertion above, and
    // the group would be measuring nothing.
    const trigger = reviewerTrigger("workflows/pr-review.md");
    expect(trigger).toBeDefined();
    expect(trigger).not.toContain("never optional");
    expect(trigger).toContain("pr-review Step 2, dimension row 6");
  });

  test("no workflow outside the 12 claims a never-optional reviewer dispatch", () => {
    const sanctioned = new Set(ALL_REVIEWER_TARGETS.map(({ file }) => file));
    const offenders: string[] = [];
    for (const rel of listWorkflowFiles()) {
      if (sanctioned.has(rel)) continue;
      const trigger = reviewerTrigger(rel);
      if (trigger?.includes("never optional")) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
