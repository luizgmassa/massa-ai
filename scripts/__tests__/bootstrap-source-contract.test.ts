/**
 * Bootstrap source contract gate (TASK-001, BST-06 / BST-09).
 *
 * `skills/AGENTS.md` is the single source `renderBootstrap` reads. This suite
 * guards its raw markup, independent of the renderer that does not exist yet:
 * exactly the 9 registry rule ids, each wrapped in a well-formed
 * `<!-- massa-ai:rule:<id>:start|end -->` pair nested inside the existing
 * `<!-- massa-ai:bootstrap:start|end -->` pair, in registry render order; the
 * `code-comments` rule additionally carries a nested
 * `<!-- massa-ai:rule:code-comments:off -->` / `:off-end -->` span; and the
 * file contains no occurrence of `rtk` in any form (case-insensitive), which
 * is also how the deleted `### Conditional RTK Rules` section is guarded.
 *
 * Every assertion reads the file once as a single string and scans that
 * string directly (`matchAll` / `indexOf`), never by splitting into lines
 * first — a line-oriented scan cannot see a claim spanning a newline, and
 * that exact blind spot has shipped silently in this repository before.
 *
 * `bun run test:scripts` runs this file; CI runs that script.
 */

import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const AGENTS_MD = path.join(REPO_ROOT, "skills", "AGENTS.md");

/** The 9 registry rule ids, in fixed render order (design.md § Rule registry). */
const RULE_IDS = [
  "caveman",
  "massa-ai-router",
  "persona-router",
  "dedupe-guardrails",
  "plan-challenge",
  "conversation-feedback",
  "indexing-hygiene",
  "english-code",
  "code-comments",
] as const;

const BOOTSTRAP_START = "<!-- massa-ai:bootstrap:start -->";
const BOOTSTRAP_END = "<!-- massa-ai:bootstrap:end -->";

async function read(p: string): Promise<string> {
  return fs.readFile(p, "utf8");
}

interface MarkerInfo {
  starts: number[];
  ends: number[];
}

/**
 * Scans the whole source string for `<!-- massa-ai:rule:<id>:start|end -->`
 * markers and returns every occurrence's character offset, keyed by id. A
 * single pass over the full string, not a per-line search.
 */
function collectRuleMarkers(content: string): Map<string, MarkerInfo> {
  const map = new Map<string, MarkerInfo>();
  const re = /<!--\s*massa-ai:rule:([a-z0-9-]+):(start|end)\s*-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const [, id, kind] = m;
    if (!map.has(id)) map.set(id, { starts: [], ends: [] });
    const info = map.get(id)!;
    if (kind === "start") info.starts.push(m.index);
    else info.ends.push(m.index);
  }
  return map;
}

describe("bootstrap source contract: skills/AGENTS.md rule markers", () => {
  test("declares exactly the 9 registry rule ids, each with a well-formed marker pair", async () => {
    const content = await read(AGENTS_MD);
    const markers = collectRuleMarkers(content);

    const missing = RULE_IDS.filter((id) => !markers.has(id));
    expect(missing).toEqual([]);

    const malformed = RULE_IDS.filter((id) => {
      const info = markers.get(id);
      return !info || info.starts.length !== 1 || info.ends.length !== 1;
    }).map((id) => {
      const info = markers.get(id);
      return `${id}: starts=${info?.starts.length ?? 0} ends=${info?.ends.length ?? 0}`;
    });
    expect(malformed).toEqual([]);

    const unknownIds = [...markers.keys()].filter(
      (id) => !(RULE_IDS as readonly string[]).includes(id),
    );
    expect(unknownIds).toEqual([]);
  });

  test("rule markers render in registry order and sit inside the bootstrap block", async () => {
    const content = await read(AGENTS_MD);
    const bootstrapStart = content.indexOf(BOOTSTRAP_START);
    const bootstrapEnd = content.indexOf(BOOTSTRAP_END);
    expect(bootstrapStart).toBeGreaterThanOrEqual(0);
    expect(bootstrapEnd).toBeGreaterThan(bootstrapStart);

    const markers = collectRuleMarkers(content);
    const present = RULE_IDS.filter((id) => markers.has(id));
    expect(present).toEqual([...RULE_IDS]);

    const starts = present.map((id) => markers.get(id)!.starts[0]);
    const sortedStarts = [...starts].sort((a, b) => a - b);
    expect(starts).toEqual(sortedStarts);

    const outOfOrder: string[] = [];
    for (const id of present) {
      const info = markers.get(id)!;
      const start = info.starts[0];
      const end = info.ends[0];
      if (!(start < end)) outOfOrder.push(id);
      expect(start).toBeGreaterThan(bootstrapStart);
      expect(end).toBeLessThan(bootstrapEnd);
    }
    expect(outOfOrder).toEqual([]);
  });

  test("code-comments carries an off-span nested inside its own rule span", async () => {
    const content = await read(AGENTS_MD);
    const markers = collectRuleMarkers(content);
    const codeComments = markers.get("code-comments");
    expect(codeComments).toBeDefined();

    const offStarts = [
      ...content.matchAll(/<!--\s*massa-ai:rule:code-comments:off\s*-->/g),
    ];
    const offEnds = [
      ...content.matchAll(/<!--\s*massa-ai:rule:code-comments:off-end\s*-->/g),
    ];
    expect(offStarts.length).toBe(1);
    expect(offEnds.length).toBe(1);

    const offStart = offStarts[0].index ?? -1;
    const offEnd = offEnds[0].index ?? -1;
    expect(offStart).toBeGreaterThanOrEqual(0);
    expect(offEnd).toBeGreaterThan(offStart);

    if (codeComments) {
      expect(offStart).toBeGreaterThan(codeComments.starts[0]);
      expect(offEnd).toBeLessThan(codeComments.ends[0]);
    }
  });

  test("contains no occurrence of rtk, in any case, anywhere in the file", async () => {
    const content = await read(AGENTS_MD);
    const matches = [...content.matchAll(/rtk/gi)];
    const contexts = matches.map((m) => {
      const idx = m.index ?? 0;
      return content.slice(Math.max(0, idx - 24), idx + 24).replace(/\s+/g, " ");
    });
    expect(contexts).toEqual([]);
  });
});

/**
 * Removes every rule's own span (start marker through end marker, inclusive)
 * from the bootstrap block, in one pass over the whole string. What remains
 * is prose no toggle state can ever hide — the always-rendered residue. A
 * rule that reasserts itself there (an activation instruction outside every
 * span) survives being disabled: the same defect class the design already
 * solved for `code-comments` with an explicit off-text, but never
 * generalized to the activation stack.
 */
function stripAllRuleSpans(content: string): string {
  const startRe = /<!--\s*massa-ai:rule:([a-z0-9-]+):start\s*-->/g;
  let out = "";
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(content)) !== null) {
    if (m.index < cursor) continue; // already consumed by a prior span
    const id = m[1];
    const endTag = `<!-- massa-ai:rule:${id}:end -->`;
    const endIdx = content.indexOf(endTag, m.index);
    if (endIdx === -1) continue; // malformed pair; the marker-pair test above already fails this
    out += content.slice(cursor, m.index);
    cursor = endIdx + endTag.length;
  }
  out += content.slice(cursor);
  return out;
}

describe("bootstrap source contract: no rule leaks outside every span", () => {
  // Scope note: this checks the always-rendered residue — content outside
  // EVERY rule span — for the 9 registry ids and the 3 literal
  // activation-stack names. It deliberately does not flag a rule's name
  // appearing inside a *different* rule's own span (e.g. dedupe-guardrails
  // or conversation-feedback prose mentioning `massa-ai` while describing
  // their own, unrelated behavior): that is a same-domain cross-reference
  // inside content that is itself already toggleable, not an instruction
  // that survives the referenced rule being disabled. A fully precise
  // "outside its own span specifically" check would also have to model
  // which cross-span mentions are load-bearing instructions versus
  // incidental prose, which is not mechanically expressible from the
  // markup alone; this narrower, defensible check is what is asserted here.
  test("the always-rendered residue names no rule id and no activation-stack name", async () => {
    const content = await read(AGENTS_MD);
    const bootstrapStart = content.indexOf(BOOTSTRAP_START);
    const bootstrapEnd = content.indexOf(BOOTSTRAP_END);
    expect(bootstrapStart).toBeGreaterThanOrEqual(0);
    expect(bootstrapEnd).toBeGreaterThan(bootstrapStart);

    const block = content.slice(bootstrapStart, bootstrapEnd + BOOTSTRAP_END.length);
    const residue = stripAllRuleSpans(block);

    const idLeaks = RULE_IDS.filter((id) => residue.includes(id));
    expect(idLeaks).toEqual([]);

    // Backtick-delimited so a path (`skills/massa-ai/SKILL.md`) or a
    // compound CLI token (`massa-ai-config bootstrap`) cannot match — only
    // the bare, standalone activation-stack name counts as a leak.
    const ACTIVATION_NAMES = ["`caveman full`", "`massa-ai`", "`persona-router`"];
    const nameLeaks = ACTIVATION_NAMES.filter((name) => residue.includes(name));
    expect(nameLeaks).toEqual([]);
  });
});
