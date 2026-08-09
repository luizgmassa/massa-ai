/**
 * APR spec R2 — tools-api's isolated runner classifies only `mock.module(`
 * for process isolation. A test that reaches a real `process.exit(...)`
 * therefore runs inside the SHARED batch process and truncates the remaining
 * test population with a clean exit code — CI stays green while silently
 * under-counting. Lifecycle effects in tests must go through the injectable
 * seams (`_setLifecycleSeamsForTesting`, apps/tools-api/src/lifecycle.ts).
 *
 * `Bun.spawn` of a CHILD probe is a sanctioned pattern (a child can't
 * truncate the batch) — those suites are allowlisted by name; a new spawn
 * site must either use the seams or be added here deliberately.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");

const SPAWN_ALLOWLIST = new Set([
  "apps/tools-api/src/routes/web-ui-static-dir.test.ts",
  "apps/tools-api/src/routes/restart-e2e.test.ts",
]);

describe("tools-api test files never exit or spawn outside the lifecycle seams", () => {
  test("no process.exit( in any tools-api test; Bun.spawn( only in allowlisted child-probe suites", () => {
    const ls = Bun.spawnSync(["git", "ls-files", "apps/tools-api/src"], { cwd: ROOT });
    const testFiles = ls.stdout
      .toString()
      .trim()
      .split("\n")
      .filter((f) => f.endsWith(".test.ts"));
    expect(testFiles.length).toBeGreaterThan(5); // the scan must see its subjects

    const offenders: string[] = [];
    for (const f of testFiles) {
      const lines = readFileSync(join(ROOT, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        // Comments are source to a scanner (a prose mention of the literal
        // matched here first): judge only the code before a line comment.
        const code = line.split("//")[0];
        if (code.includes("process.exit(")) offenders.push(`${f}:${i + 1}: process.exit`);
        if (code.includes("Bun.spawn(") && !SPAWN_ALLOWLIST.has(f))
          offenders.push(`${f}:${i + 1}: Bun.spawn outside allowlist`);
      });
    }
    console.log(`[seam-guard] scanned ${testFiles.length} tools-api test files`);
    expect(offenders).toEqual([]);
  });
});
