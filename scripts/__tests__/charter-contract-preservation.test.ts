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
  "builder",
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
      expect(section!).toContain(entry.field);
    });
  }
});
