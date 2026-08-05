/**
 * Skill size-budget gate (persona-router-token-optimization, PRT-07).
 *
 * Persona routing once cost ~8k tokens per session because these artifacts
 * grew unwatched (SKILL.md 13,316 B, catalog.json 8,871 B, prompts up to
 * 8,308 B — measured 2026-08-04). The budgets below are the ceilings the
 * feature shipped under; regrowth past them re-creates the per-session tax.
 * Raising a budget is a deliberate decision that belongs in a PR touching
 * this file, never a side effect.
 *
 * Two structural rules (both from memory-lesson classes this repo has hit):
 * - The resolved file population is printed beside the verdict — a budget
 *   whose glob resolves to nothing would otherwise be indistinguishable from
 *   a passing one.
 * - An empty population FAILS. Every subject below must exist by the time
 *   this gate lands; a deleted or moved subject must be re-pointed here, not
 *   silently dropped.
 */

import { describe, test, expect } from "bun:test";
import { readdirSync, statSync } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");

type Budget = {
  /** Repo-relative file, or directory + pattern. */
  subject: string;
  /** Max bytes per matching file. */
  maxBytes: number;
  /** Filter within a directory subject; undefined = single file. */
  pattern?: RegExp;
};

const BUDGETS: Budget[] = [
  { subject: "skills/persona-router/SKILL.md", maxBytes: 5_500 },
  { subject: "skills/persona-router/references", pattern: /\.md$/, maxBytes: 8_000 },
  { subject: "skills/massa-ai/personas/catalog.json", maxBytes: 2_500 },
  { subject: "skills/massa-ai/personas", pattern: /\.md$/, maxBytes: 4_500 },
  { subject: "skills/massa-ai/personas/signals", pattern: /\.json$/, maxBytes: 2_500 },
  // Freeze ceiling only — slimming the router SKILL.md is a separate feature.
  { subject: "skills/massa-ai/SKILL.md", maxBytes: 21_000 },
];

function resolveFiles(b: Budget): string[] {
  const abs = path.join(REPO_ROOT, b.subject);
  if (!b.pattern) {
    try {
      statSync(abs);
      return [b.subject];
    } catch {
      return [];
    }
  }
  try {
    return readdirSync(abs)
      .filter((f) => b.pattern!.test(f))
      .map((f) => path.join(b.subject, f));
  } catch {
    return [];
  }
}

describe("skill size budgets (PRT-07)", () => {
  for (const budget of BUDGETS) {
    test(`${budget.subject}${budget.pattern ? ` (${budget.pattern})` : ""} ≤ ${budget.maxBytes} B per file`, () => {
      const files = resolveFiles(budget);
      // Dead-subject guard: an empty population is a failure, not a pass.
      expect(files.length).toBeGreaterThan(0);
      const rows = files.map((f) => {
        const bytes = statSync(path.join(REPO_ROOT, f)).size;
        return { f, bytes, over: bytes > budget.maxBytes };
      });
      // Population print: visible in failure output and via --verbose runs.
      console.log(
        `[skill-size-budgets] ${budget.subject}: ${rows.length} file(s) — ` +
          rows.map((r) => `${path.basename(r.f)}=${r.bytes}B`).join(", "),
      );
      const over = rows.filter((r) => r.over).map((r) => `${r.f}: ${r.bytes} B > ${budget.maxBytes} B`);
      expect(over).toEqual([]);
    });
  }
});
