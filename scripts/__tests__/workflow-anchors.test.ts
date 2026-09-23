/**
 * Validator-anchor fixture gate.
 *
 * Each workflow used to carry its own `<!-- validator anchors: ... -->` HTML
 * comment: a note to the next editor listing the phrases that must not be
 * reworded. Those comments were shipped inside the workflow body, so every
 * agent that loaded the workflow paid for them, and nothing ever read them —
 * the real greps live in `agent-era-guidance-content.test.ts` and
 * `workflow-harness-contract.test.ts`. A note nothing checks is a note that
 * goes stale silently: two of the anchors were already describing prose that
 * had been deleted.
 *
 * The anchors now live in `workflow-anchors.json`, outside the agent-loaded
 * tree, and this file is what makes them mean something. Each entry is split
 * by what can actually be verified:
 *
 *   `present` — a literal substring of the workflow as it stands. Asserted.
 *               Rewording the phrase in the workflow fails here, which is
 *               exactly what the original comment asked for and never got.
 *   `notes`   — a paraphrase, a structural description ("massa-ai-
 *               verification-agent dispatch block"), or a claim of ABSENCE
 *               ("no Isolation Gate"). Carried verbatim for the next editor,
 *               deliberately not asserted: a substring check cannot express
 *               any of them, and pretending otherwise would either go red on
 *               correct prose or pass on wrong prose.
 *
 * `bun run test:scripts` runs this file; CI runs that script.
 */

import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";

import anchors from "./workflow-anchors.json" with { type: "json" };

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const WORKFLOWS_DIR = path.join(REPO_ROOT, "skills", "massa-ai", "workflows");

type AnchorEntry = { present: string[]; notes: string[] };
const ENTRIES = Object.entries(anchors as Record<string, AnchorEntry>);

/** Every .md file under `skills/massa-ai/workflows/`, forward-slashed. */
async function listWorkflows(): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".md")) {
        out.push(path.relative(WORKFLOWS_DIR, full).split(path.sep).join("/"));
      }
    }
  }
  await walk(WORKFLOWS_DIR);
  return out.sort();
}

describe("validator anchors: the fixture describes real workflows", () => {
  test("the fixture is not empty and covers the files that carried anchors", () => {
    // Guard the guard: an empty fixture makes every assertion below vacuous.
    expect(ENTRIES.length).toBe(14);
    expect(ENTRIES.flatMap(([, e]) => e.present).length).toBeGreaterThanOrEqual(86);
  });

  test("every keyed path exists on disk", async () => {
    const onDisk = new Set(await listWorkflows());
    const phantom = ENTRIES.map(([rel]) => rel).filter((rel) => !onDisk.has(rel));
    expect(phantom).toEqual([]);
  });

  test("no workflow still carries an inline validator-anchor comment", async () => {
    // The move is one-way. A re-added comment would fork the anchor list back
    // into the agent-loaded tree, where nothing checks it.
    const leaked: string[] = [];
    for (const rel of await listWorkflows()) {
      const body = await fs.readFile(path.join(WORKFLOWS_DIR, rel), "utf8");
      if (body.includes("<!-- validator anchors:")) leaked.push(rel);
    }
    expect(leaked).toEqual([]);
  });
});

describe("validator anchors: every `present` anchor is still in its workflow", () => {
  for (const [rel, entry] of ENTRIES) {
    test(`${rel} keeps all ${entry.present.length} anchored phrases`, async () => {
      const body = await fs.readFile(path.join(WORKFLOWS_DIR, rel), "utf8");
      const missing = entry.present.filter((a) => !body.includes(a));
      expect(missing).toEqual([]);
    });
  }
});
