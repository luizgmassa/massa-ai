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
