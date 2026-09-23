/**
 * Workflow dispatch mapping (agent-roster-consolidation, Dispatch AC-1..8).
 *
 * Each workflow family must dispatch exactly the roster agents (and modes) the
 * spec maps it to, and must not name a retired agent anywhere in the file. The
 * expected sets are hand-written from the spec, not derived from the workflow
 * files, so a dispatch block moved to the wrong agent or mode turns this red.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
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

const FIX_TRIO = ["senior-engineer", "code-reviewer/review", "code-reviewer/verify"];

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
  // Dispatch AC-2: fixes → senior-engineer implements, code-reviewer reviews and verifies.
  "architecture/architecture-fix.md": FIX_TRIO,
  "bugs/bugs-fix.md": FIX_TRIO,
  "code-quality/code-quality-fix.md": FIX_TRIO,
  "security/security-fix.md": FIX_TRIO,
  "implementation/implementation-fix.md": [...FIX_TRIO, "designer/implement"],
  // A7: requirements-fix keeps senior-engineer.
  "requirements/requirements-fix.md": FIX_TRIO,
  // Dispatch AC-3: tests family → test-engineer audits and implements.
  "tests/tests-audit.md": ["test-engineer/audit"],
  // A production seam for deterministic testing is senior-engineer's; test-engineer writes test files only.
  "tests/tests-fix.md": [
    "senior-engineer",
    "code-reviewer/review",
    "code-reviewer/verify",
    "test-engineer/fix",
  ],
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

interface DispatchBlock {
  agent: string;
  mode: string | undefined;
  lenses: string[];
  header: string;
}

/** Each quoted dispatch block: its header plus the contiguous `>` lines under it. */
function dispatchBlocks(text: string): DispatchBlock[] {
  const blocks: DispatchBlock[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const m = line.match(/^> \*\*Dispatch: `([a-z-]+)`\*\* \(role: `[a-z-]+`(?:, mode: `([a-z-]+)`)?\)/);
    if (!m) return;
    let end = i + 1;
    while (end < lines.length && lines[end]!.startsWith(">")) end++;
    const body = lines.slice(i, end).join("\n");
    const lenses = [...new Set([...body.matchAll(/`lens: ([a-z-]+)`/g)].map((l) => l[1]!))].sort();
    blocks.push({ agent: m[1]!, mode: m[2], lenses, header: line });
  });
  return blocks;
}

// Dispatch AC-1: each audit family's lens values, per dispatched agent/mode.
const EXPECTED_LENSES: Record<string, Record<string, string[]>> = {
  "architecture/architecture-audit.md": { "code-reviewer/audit": ["architecture"] },
  "bugs/bugs-audit.md": { "code-reviewer/audit": ["bugs"] },
  "code-quality/code-quality-audit.md": { "code-reviewer/audit": ["code-quality"] },
  "security/security-audit.md": { "code-reviewer/audit": ["security"] },
  "implementation/implementation-audit.md": {
    "code-reviewer/audit": ["architecture", "bugs", "code-quality", "security"],
    "product-manager/audit": ["requirements"],
    "test-engineer/audit": ["tests"],
  },
};

describe("audit families pass the matching lens (Dispatch AC-1)", () => {
  for (const [rel, expected] of Object.entries(EXPECTED_LENSES)) {
    test(`${rel} dispatches lenses ${JSON.stringify(expected)}`, () => {
      const got: Record<string, string[]> = {};
      for (const b of dispatchBlocks(read(path.join(WORKFLOWS, rel)))) {
        if (b.mode !== "audit") continue;
        const key = `${b.agent}/${b.mode}`;
        got[key] = [...new Set([...(got[key] ?? []), ...b.lenses])].sort();
      }
      expect(got).toEqual(expected);
    });
  }
});

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

  test("mobile-figma-fix dispatches senior-engineer only for non-UI-layer wiring", () => {
    const text = read(path.join(WORKFLOWS, "mobile-figma/mobile-figma-fix.md"));
    const start = text.indexOf("> **Dispatch: `senior-engineer`**");
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

const ALL_SKILL_MD = execFileSync("git", ["ls-files", "skills/**/*.md", "skills/*.md"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
})
  .trim()
  .split("\n");

function charterOf(agent: string): string {
  return read(path.join(SKILLS, "agents", agent, "SKILL.md"));
}

describe("every dispatch packet names a real charter mode and lens (repo-wide)", () => {
  const blocks = ALL_SKILL_MD.flatMap((rel) =>
    dispatchBlocks(read(path.join(REPO_ROOT, rel))).map((b) => ({ rel, ...b })),
  );

  test("the scan reaches every dispatch header under skills/ (guard the guard)", () => {
    const headers = ALL_SKILL_MD.reduce(
      (n, rel) => n + (read(path.join(REPO_ROOT, rel)).match(/^> \*\*Dispatch: `/gm)?.length ?? 0),
      0,
    );
    expect(headers).toBeGreaterThanOrEqual(50);
    expect(blocks.length).toBe(headers);
  });

  test("mode is a `### Mode:` heading of the dispatched charter", () => {
    const bad: string[] = [];
    for (const b of blocks) {
      const modes = [...charterOf(b.agent).matchAll(/^### Mode: `([a-z-]+)`/gm)].map((m) => m[1]);
      if (b.mode === undefined ? modes.length > 0 : !modes.includes(b.mode)) {
        bad.push(`${b.rel}: ${b.agent} mode=${b.mode ?? "<none>"} (charter modes: ${modes.join(", ") || "none"})`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("every `lens:` value is in the dispatched charter's lens set", () => {
    const bad: string[] = [];
    for (const b of blocks) {
      if (b.lenses.length === 0) continue;
      const decl = charterOf(b.agent).match(/^- `lens`: [^\n]*?one of `([^`]+)`/m);
      const allowed = decl ? decl[1]!.split(/\s*\|\s*/) : [];
      for (const lens of b.lenses) {
        if (!allowed.includes(lens)) bad.push(`${b.rel}: ${b.agent} lens=${lens} (charter lenses: ${allowed.join(", ") || "none"})`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("no retired agent name in skills prose, backticked or not, any case, hyphenated or spaced, suffixed", () => {
  const RETIRED_WORD =
    /(?<![\w-])(?<!code[-\s])(planner|context[-\s_]curator|documentation[-\s_]agent|investigator|navigator|meta[-\s_]judge|plan[-\s_]critic|furps[-\s_]analyst|requirements[-\s_]analyst|verification[-\s_]agent|mobile[-\s_]specialist|architecture[-\s_]specialist|audit[-\s_]specialist|reviewer)(?!\w)/gi;

  // Sanctioned exceptions, each scoped to one file and one line shape.
  const SANCTIONED: Array<{ file: string; line: RegExp; why: string }> = [
    { file: "skills/AGENTS.md", line: /^\| [a-z-]+ \| (?:[a-z-]+ \| `|— \| Retired;)/, why: "the single old→new mapping table" },
    { file: "skills/massa-ai/references/agent-orchestration.md", line: /^\| `[a-z-]+` \| `[a-z-]+` \| /, why: "legacy role vocabulary table" },
    { file: "skills/massa-ai/references/mobile-diagnosis.md", line: /nested navigator state/, why: "navigation state, not an agent" },
    { file: "skills/massa-ai/references/lessons.md", line: /no reviewer feedback|reviewer-feedback records/, why: "a human reviewer, not an agent" },
    { file: "skills/massa-ai/workflows/pr-review.md", line: /write as a reviewer/, why: "a human reviewer voice, not an agent" },
  ];

  test("every hit is a sanctioned exception", () => {
    const bad: string[] = [];
    for (const rel of ALL_SKILL_MD) {
      read(path.join(REPO_ROOT, rel))
        .split("\n")
        .forEach((line, i) => {
          const hits = [...line.matchAll(RETIRED_WORD)].length;
          if (hits === 0) return;
          // A sanctioned line carries its one sanctioned word, never a second name.
          if (hits === 1 && SANCTIONED.some((s) => s.file === rel && s.line.test(line))) return;
          bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
    }
    expect(bad).toEqual([]);
  });

  test("no massa-ai-<retired> prefixed name in skills (a rename leftover dispatches a dead agent)", () => {
    const PREFIXED =
      /massa-ai[-_:](planner|context-curator|documentation-agent|investigator|navigator|meta-judge|plan-critic|furps-analyst|requirements-analyst|verification-agent|mobile-specialist|architecture-specialist|audit-specialist|reviewer)(?![\w-])/gi;
    const bad: string[] = [];
    for (const rel of ALL_SKILL_MD) {
      read(path.join(REPO_ROOT, rel))
        .split("\n")
        .forEach((line, i) => {
          if (PREFIXED.test(line)) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
          PREFIXED.lastIndex = 0;
        });
    }
    expect(bad).toEqual([]);
  });

  test("the sweep sees the mapping table (guard the guard)", () => {
    const text = read(path.join(SKILLS, "AGENTS.md"));
    expect([...text.matchAll(RETIRED_WORD)].length).toBeGreaterThanOrEqual(14);
  });
});
