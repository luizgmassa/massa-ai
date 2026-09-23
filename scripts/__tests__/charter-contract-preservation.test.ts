/**
 * Charter output-contract preservation (agent-roster-consolidation ROS AC-9).
 *
 * The fixture freezes the role-specific output fields that the merged or
 * retired charters declared at f582b602. Before the roster swap every field
 * must still sit in its source charter; after it, every absorbed field must
 * sit inside the `Mode: \`<mode>\`` section of the charter that absorbed it,
 * so a merge that drops or relocates a former output contract turns red.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const AGENTS_DIR = path.join(REPO_ROOT, "skills/agents");
const FIXTURE = path.join(
  REPO_ROOT,
  ".specs/features/agent-roster-consolidation/fixtures/retired-charter-outputs.json",
);

const RETIRED = [
  "architecture-specialist",
  "audit-specialist",
  "context-curator",
  "documentation-agent",
  "furps-analyst",
  "investigator",
  "meta-judge",
  "mobile-specialist",
  "navigator",
  "plan-critic",
  "planner",
  "requirements-analyst",
  "reviewer",
  "verification-agent",
] as const;

const ROSTER = [
  "senior-engineer",
  "code-explorer",
  "code-reviewer",
  "designer",
  "judge",
  "product-manager",
  "test-engineer",
] as const;

type FixtureField = {
  source: string;
  field: string;
  absorbedBy: { agent: string; mode: string } | null;
  dropReason?: string;
};

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
  sourceRef: string;
  fields: FixtureField[];
};

const charterPath = (name: string) => path.join(AGENTS_DIR, name, "SKILL.md");
const readCharter = (name: string) => readFileSync(charterPath(name), "utf8");

function modeSection(text: string, mode: string): string | null {
  const lines = text.split("\n");
  const start = lines.findIndex((line) =>
    new RegExp(`^#{2,4} Mode: \`${mode}\`\\s*$`).test(line),
  );
  if (start === -1) return null;
  const level = lines[start].match(/^#+/)![0].length;
  const end = lines.findIndex(
    (line, index) => index > start && new RegExp(`^#{1,${level}} `).test(line),
  );
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

const AGENT_MODES_DIR = path.join(REPO_ROOT, "skills/massa-ai/references/agent-modes");

/**
 * agent-roster-revision LZY-02: a lazy charter's `Mode:` section is a stub
 * naming exactly its own contract file(s) under
 * `references/agent-modes/<agent>/<mode>.md` instead of holding the output
 * contract inline. Extracts the cited `<agent>/<file>.md` pairs, in source
 * order; an inline (non-stub) section yields no citations.
 */
function stubCitations(sectionBody: string): string[] {
  return [...sectionBody.matchAll(/`references\/agent-modes\/([a-z-]+\/[a-z0-9.-]+\.md)`/g)].map(
    (m) => m[1]!,
  );
}

/**
 * Reads and concatenates every file a stub cites, so a fixture-field
 * containment check can run against the real contract prose instead of the
 * stub text. A dangling citation resolves to "", which fails the caller's
 * containment check rather than silently passing.
 */
function resolveStubContent(citations: string[]): string {
  return citations
    .map((rel) => {
      const file = path.join(AGENT_MODES_DIR, rel);
      return existsSync(file) ? readFileSync(file, "utf8") : "";
    })
    .join("\n");
}

/**
 * Binding check: the exact filename(s) a mode's own stub may cite are
 * `<mode>.md`, or one or more `<mode>-<suffix>.md` files for a mode split by
 * an axis such as depth (judge `plan-critique` -> `plan-critique-lite.md` /
 * `plan-critique-full.md`, per A1). A stub with no citations, one citing a
 * sibling mode's file, or one citing another agent's file all fail.
 */
function citesOwnMode(agent: string, mode: string, citations: string[]): boolean {
  if (citations.length === 0) return false;
  const exact = `${agent}/${mode}.md`;
  const split = new RegExp(`^${agent}/${mode}-[a-z]+\\.md$`);
  return citations.every((c) => c === exact || split.test(c));
}

const retiredPresent = RETIRED.filter((name) => existsSync(charterPath(name)));
const swapped = retiredPresent.length === 0;

describe("retired-charter output fixture", () => {
  test("fixture is frozen at f582b602 and covers every retired charter plus judge", () => {
    expect(fixture.sourceRef).toBe("f582b602");
    const sources = new Set(fixture.fields.map((entry) => entry.source));
    expect([...sources].sort()).toEqual([...RETIRED, "judge"].sort());
  });

  test("every absorbing agent is a roster member; every drop carries a reason", () => {
    for (const entry of fixture.fields) {
      if (entry.absorbedBy === null) {
        expect(entry.dropReason?.trim().length ?? 0).toBeGreaterThan(0);
      } else {
        expect(ROSTER).toContain(entry.absorbedBy.agent as (typeof ROSTER)[number]);
      }
    }
  });

  test("the roster swap is all-or-nothing", () => {
    expect([0, RETIRED.length]).toContain(retiredPresent.length);
  });
});

describe(`output contracts (${swapped ? "after" : "before"} the roster swap)`, () => {
  for (const entry of fixture.fields) {
    const target = swapped
      ? entry.absorbedBy
        ? `${entry.absorbedBy.agent} Mode \`${entry.absorbedBy.mode}\``
        : "dropped"
      : entry.source;
    test(`${entry.source} → ${target}: ${entry.field}`, () => {
      if (!swapped) {
        expect(readCharter(entry.source)).toContain(entry.field);
        return;
      }
      if (entry.absorbedBy === null) {
        expect(existsSync(charterPath(entry.source))).toBe(false);
        return;
      }
      const section = modeSection(
        readCharter(entry.absorbedBy.agent),
        entry.absorbedBy.mode,
      );
      expect(section).not.toBeNull();
      // A lazy stub (agent-roster-revision LZY-02) holds no output contract
      // inline; the field must resolve inside the file(s) the stub cites.
      const citations = stubCitations(section!);
      const haystack = citations.length > 0 ? resolveStubContent(citations) : section!;
      expect(haystack).toContain(entry.field);
    });
  }
});

describe("lazy-mode stub binding (agent-roster-revision LZY-02, synthetic — no lazy charter exists yet on this branch)", () => {
  // Constructed `Mode:` section bodies, not real charter text: designer,
  // judge, and test-engineer have not been converted to lazy stubs yet
  // (T7/T8/T9). This exercises `stubCitations`/`citesOwnMode` against the
  // shapes those tasks will produce, so the binding check is proven before
  // any charter depends on it.
  const CASES: Array<{
    label: string;
    agent: string;
    mode: string;
    section: string;
    expectBinding: boolean;
  }> = [
    {
      label: "single-file stub cites its own mode file",
      agent: "designer",
      mode: "trace",
      section: "### Mode: `trace`\nSee `references/agent-modes/designer/trace.md`.",
      expectBinding: true,
    },
    {
      label: "depth-split stub cites both its own lite and full files",
      agent: "judge",
      mode: "plan-critique",
      section:
        "### Mode: `plan-critique`\nSee `references/agent-modes/judge/plan-critique-lite.md` " +
        "(lite) or `references/agent-modes/judge/plan-critique-full.md` (full), by `depth`.",
      expectBinding: true,
    },
    {
      label: "stub citing a sibling mode's file fails binding",
      agent: "designer",
      mode: "trace",
      section: "### Mode: `trace`\nSee `references/agent-modes/designer/audit.md`.",
      expectBinding: false,
    },
    {
      label: "stub citing another agent's file fails binding",
      agent: "test-engineer",
      mode: "audit",
      section: "### Mode: `audit`\nSee `references/agent-modes/judge/plan-critique-lite.md`.",
      expectBinding: false,
    },
    {
      label: "non-stub inline section has no citation and fails binding",
      agent: "designer",
      mode: "trace",
      section: "### Mode: `trace`\nFull inline output contract here, no citation.",
      expectBinding: false,
    },
  ];

  test(`binding checked across ${CASES.length} synthetic stub/file pairings`, () => {
    // Population print (SEN-04 class): visible in output, not just the verdict.
    console.log(
      `[charter-contract-preservation] lazy-mode binding population (${CASES.length}): ` +
        CASES.map((c) => c.label).join("; "),
    );
    for (const c of CASES) {
      const citations = stubCitations(c.section);
      expect(citesOwnMode(c.agent, c.mode, citations)).toBe(c.expectBinding);
    }
  });
});
