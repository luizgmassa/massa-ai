/**
 * Capability-packet parity sensor (subagent-orchestration-io, ORC-06/ORC-08).
 *
 * `references/agent-orchestration.md` §Capability Packet is the sole canonical
 * field-list definition; `skills/AGENTS.md` carries a self-contained mirror
 * because the installer copies it to hosts where a relative link cannot resolve.
 * This test is the drift guard between the two: the ordered backticked packet
 * field lists must be identical, and the Output Contract field heads must be
 * identical. Empty extraction is a hard fail — a renamed heading or reshaped
 * bullet must never read as a pass on a vanished population.
 */

import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const CANONICAL = path.join(
  REPO_ROOT,
  "skills/massa-ai/references/agent-orchestration.md",
);
const MIRROR = path.join(REPO_ROOT, "skills/AGENTS.md");

/** Slice the markdown between a heading line and the next same-or-higher heading. */
function section(doc: string, headingPrefix: string): string {
  const lines = doc.split("\n");
  const start = lines.findIndex((l) => l.startsWith(headingPrefix));
  if (start === -1) return "";
  const level = headingPrefix.match(/^#+/)?.[0].length ?? 2;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#+\s/.test(l) && (l.match(/^#+/)?.[0].length ?? 99) <= level);
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

/** Extract ordered backticked field names from `- \`field\`: ...` bullets. */
function packetFields(sectionText: string): string[] {
  return [...sectionText.matchAll(/^- `(\w+)`:/gm)].map((m) => m[1]);
}

/** Extract ordered first-word field heads from output-contract bullets. */
function outputFields(sectionText: string): string[] {
  return [...sectionText.matchAll(/^- \*{0,2}([A-Z]\w+)/gm)].map((m) => m[1]);
}

describe("capability-packet parity (canonical vs skills/AGENTS.md mirror)", () => {
  test("packet field lists are identical and non-empty, in order", async () => {
    const canonical = packetFields(
      section(await fs.readFile(CANONICAL, "utf8"), "## Capability Packet"),
    );
    const mirror = packetFields(
      section(await fs.readFile(MIRROR, "utf8"), "## Capability Packet"),
    );
    console.log(`canonical packet fields (${canonical.length}): ${canonical.join(", ")}`);
    console.log(`mirror packet fields (${mirror.length}): ${mirror.join(", ")}`);
    expect(canonical.length).toBeGreaterThan(0);
    expect(mirror.length).toBeGreaterThan(0);
    expect(mirror).toEqual(canonical);
  });

  test("output-contract field heads are identical and non-empty, in order", async () => {
    const canonical = outputFields(
      section(await fs.readFile(CANONICAL, "utf8"), "## Output Contract"),
    );
    const mirror = outputFields(
      section(await fs.readFile(MIRROR, "utf8"), "## Output Contract"),
    );
    console.log(`canonical output fields (${canonical.length}): ${canonical.join(", ")}`);
    console.log(`mirror output fields (${mirror.length}): ${mirror.join(", ")}`);
    expect(canonical.length).toBeGreaterThan(0);
    expect(mirror.length).toBeGreaterThan(0);
    expect(mirror).toEqual(canonical);
  });
});
