/**
 * Guards the skill-doc guard tooling (skill-token-optimization T1):
 *
 * 1. `check-skill-doc-paths.ts` runs green repo-wide and actually scans a
 *    population (a dead scan reporting 0 citations must fail, not pass).
 * 2. `skill-protected-literals.ts` inventories both literal classes —
 *    plain string anchors AND regex-literal-derived anchors (Plan Challenge
 *    F1: `workflow-harness-contract.test.ts` anchors prose with
 *    `.toMatch(/…/i)` patterns a string-only scan cannot see).
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");

async function run(cmd: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(cmd, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, out, err };
}

describe("skill doc guard tooling", () => {
  test("path resolver is green repo-wide over a real population", async () => {
    const { code, out } = await run(["bun", "scripts/check-skill-doc-paths.ts"]);
    expect(code).toBe(0);
    const m = /scanned (\d+) md files, (\d+) citations, (\d+) misses/.exec(out);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(100);
    expect(Number(m![2])).toBeGreaterThan(500);
    expect(Number(m![3])).toBe(0);
  }, 30_000);

  test("protected-literal inventory captures string and regex anchor classes", async () => {
    const { code, out, err } = await run(["bun", "scripts/skill-protected-literals.ts"]);
    expect(code).toBe(0);
    const summary = /inventory: (\d+) protected files, (\d+) spans/.exec(err);
    expect(summary).not.toBeNull();
    expect(Number(summary![1])).toBeGreaterThan(50);
    const inventory = JSON.parse(out) as Record<string, string[]>;
    const rootCause = inventory["skills/massa-ai/references/root-cause-scripts.md"] ?? [];
    expect(rootCause.some((s) => /two consecutive failed fix attempts/i.test(s))).toBe(true);
    const delivery = inventory["skills/massa-ai/references/implementation-delivery.md"] ?? [];
    expect(delivery.some((s) => /merge is never automatic/i.test(s))).toBe(true);
  }, 30_000);
});
