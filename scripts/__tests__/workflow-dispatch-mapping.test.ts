/**
 * Workflow dispatch mapping (agent-roster-consolidation, Dispatch AC-1..8).
 *
 * Each workflow family must dispatch exactly the roster agents (and modes) the
 * spec maps it to, and must not name a retired agent anywhere in the file. The
 * expected sets are hand-written from the spec, not derived from the workflow
 * files, so a dispatch block moved to the wrong agent or mode turns this red.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const SKILLS = path.join(REPO_ROOT, "skills");
const WORKFLOWS = path.join(SKILLS, "massa-ai", "workflows");

const read = (abs: string) => readFileSync(abs, "utf8");

const RETIRED =
  /`(planner|context-curator|documentation-agent|investigator|navigator|meta-judge|plan-critic|furps-analyst|requirements-analyst|verification-agent|mobile-specialist|architecture-specialist|audit-specialist|reviewer)`/g;

/** Every `agent` or `agent/mode` a file's dispatch-block headers name, sorted and deduplicated. */
function dispatchTargets(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(
    /^> \*\*Dispatch: `([a-z-]+)`\*\* \(role: `[a-z-]+`(?:, mode: `([a-z-]+)`)?\)/gm,
  )) {
    found.add(m[2] ? `${m[1]}/${m[2]}` : m[1]!);
  }
  return [...found].sort();
}

const FIX_TRIO = ["builder", "code-reviewer/review", "code-reviewer/verify"];

const EXPECTED: Record<string, string[]> = {
  // Dispatch AC-1: audits → code-reviewer with the matching lens; implementation-audit
  // also routes its Requirements lens to product-manager and its Tests lens to test-engineer.
  "architecture/architecture-audit.md": ["code-reviewer/audit", "code-reviewer/verify"],
  "bugs/bugs-audit.md": ["code-reviewer/audit"],
  "code-quality/code-quality-audit.md": ["code-reviewer/audit"],
  "security/security-audit.md": ["code-reviewer/audit"],
  "implementation/implementation-audit.md": [
    "code-reviewer/audit",
    "product-manager/audit",
    "test-engineer/audit",
  ],
  // Dispatch AC-2: fixes → builder implements, code-reviewer reviews and verifies.
  "architecture/architecture-fix.md": FIX_TRIO,
  "bugs/bugs-fix.md": FIX_TRIO,
  "code-quality/code-quality-fix.md": FIX_TRIO,
  "security/security-fix.md": FIX_TRIO,
  "implementation/implementation-fix.md": [...FIX_TRIO, "designer/implement"],
  // A7: requirements-fix keeps builder.
  "requirements/requirements-fix.md": FIX_TRIO,
  // Dispatch AC-3: tests family → test-engineer audits and implements.
  "tests/tests-audit.md": ["test-engineer/audit"],
  "tests/tests-fix.md": ["code-reviewer/review", "code-reviewer/verify", "test-engineer/fix"],
  // Dispatch AC-4.
  "refinement/furps-refinement.md": ["product-manager/furps"],
  "requirements/requirements-audit.md": ["product-manager/audit"],
  // Dispatch AC-5.
  "design.md": ["designer/implement"],
  "mobile-figma/mobile-figma-audit.md": ["designer/audit"],
  "mobile-figma/mobile-figma-fix.md": [...FIX_TRIO, "designer/implement"],
  // Dispatch AC-7.
  "judge-with-debate.md": ["judge/scorer", "judge/spec-author"],
};

describe("per-family dispatch set (Dispatch AC-1..5, AC-7)", () => {
  for (const [rel, expected] of Object.entries(EXPECTED)) {
    test(`${rel} dispatches exactly ${expected.join(", ")}`, () => {
      const text = read(path.join(WORKFLOWS, rel));
      expect(dispatchTargets(text)).toEqual([...expected].sort());
    });

    test(`${rel} names no retired agent`, () => {
      const text = read(path.join(WORKFLOWS, rel));
      expect([...text.matchAll(RETIRED)].map((m) => m[0])).toEqual([]);
    });
  }

  test("the parser reads real headers (guard the guard)", () => {
    const total = Object.keys(EXPECTED)
      .map((rel) => dispatchTargets(read(path.join(WORKFLOWS, rel))).length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(40);
  });
});

describe("designer is unconditional in the design family (Dispatch AC-5)", () => {
  const CONDITIONAL = "when this task creates or modifies a screen";
  for (const rel of [
    "design.md",
    "mobile-figma/mobile-figma-audit.md",
    "mobile-figma/mobile-figma-fix.md",
  ]) {
    test(`${rel} dispatches designer with no screen-work condition`, () => {
      const text = read(path.join(WORKFLOWS, rel));
      expect(text).toContain("**Screen work — unconditional in this workflow:**");
      expect(text).not.toContain(CONDITIONAL);
    });
  }

  test("screen-capable workflows outside the family keep the conditional block", () => {
    for (const rel of ["feature.md", "spec-driven.md", "implementation/implementation-fix.md"]) {
      expect(read(path.join(WORKFLOWS, rel))).toContain(CONDITIONAL);
    }
  });

  test("mobile-figma-fix dispatches builder only for non-UI-layer wiring", () => {
    const text = read(path.join(WORKFLOWS, "mobile-figma/mobile-figma-fix.md"));
    const start = text.indexOf("> **Dispatch: `builder`**");
    expect(start).toBeGreaterThan(-1);
    const block = text.slice(start, text.indexOf("\n\n", start));
    expect(block).toContain(
      "> - trigger: a selected `MFM-*` finding whose fix needs non-UI-layer changes",
    );
    expect(block).toContain("never for a UI-layer fix, which belongs to `designer`");
  });
});

describe("Plan Challenge dispatches judge in plan-critique mode (Dispatch AC-6)", () => {
  const sources: Array<[string, string]> = [
    ["router SKILL.md", path.join(SKILLS, "massa-ai", "SKILL.md")],
    ["the-fool.md", path.join(WORKFLOWS, "the-fool.md")],
  ];
  for (const [label, file] of sources) {
    test(`${label} names judge with plan-critique and no retired agent`, () => {
      const text = read(file);
      expect(text).toMatch(/`judge`[^\n]*`plan-critique`/);
      expect([...text.matchAll(RETIRED)].map((m) => m[0])).toEqual([]);
    });
  }

  test("skills/AGENTS.md Plan Challenge Policy names judge in plan-critique mode", () => {
    const text = read(path.join(SKILLS, "AGENTS.md"));
    const span = text.slice(
      text.indexOf("<!-- massa-ai:rule:plan-challenge:start -->"),
      text.indexOf("<!-- massa-ai:rule:plan-challenge:end -->"),
    );
    expect(span).toContain("dispatch the `judge` agent in `plan-critique` mode");
    expect([...span.matchAll(RETIRED)].map((m) => m[0])).toEqual([]);
  });
});

describe("Independent Verification dispatches code-reviewer in verify mode (Dispatch AC-8)", () => {
  test("the Verification Ladder mandate names code-reviewer verify", () => {
    const text = read(path.join(SKILLS, "massa-ai", "references", "verification-ladder.md"));
    expect(text).toContain("dispatching `code-reviewer` in `verify` mode is **mandatory**");
    expect([...text.matchAll(RETIRED)].map((m) => m[0])).toEqual([]);
  });

  test("agent-orchestration.md's Independent Verification Exception names code-reviewer verify", () => {
    const text = read(path.join(SKILLS, "massa-ai", "references", "agent-orchestration.md"));
    expect(text).toContain("always attempt the `code-reviewer` dispatch in `verify` mode");
  });
});
