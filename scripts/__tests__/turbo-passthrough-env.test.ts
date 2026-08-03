/**
 * XP-10 / AD-010 — every `MASSA_AI_*` var read anywhere under `packages/` or
 * `apps/` must survive Turbo's environment sandbox (`turbo.json` →
 * `tasks.test.passThroughEnv`), or it silently arrives `undefined` under
 * `bun run test` while working fine under a direct `bun test` — the exact
 * class of bug AD-010 records for the ten `MASSA_AI_LLM_*` knobs.
 *
 * The read-set is derived from tracked source, not hardcoded — a hardcoded
 * list stops catching drift the moment someone adds a knob and forgets the
 * allowlist (this is the mechanical drift guard AD-010's CLAUDE.md note now
 * names). Detection covers both accessor forms named in design.md C7:
 * `process.env.MASSA_AI_X` and `process.env["MASSA_AI_X"]` /
 * `process.env['MASSA_AI_X']`. Vars read only through a helper indirection
 * (e.g. `envBool("MASSA_AI_LLM_ENABLED", ...)`) are outside this literal
 * static scan by design — those ten are covered separately by
 * `llm-env-passthrough.test.ts`, which derives its own set from the config
 * resolver's literal occurrences of the name.
 */

import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");
const TURBO_JSON = path.join(REPO_ROOT, "turbo.json");

const ENV_ACCESSOR =
  /process\.env\.(MASSA_AI_[A-Z0-9_]+)|process\.env\[["'](MASSA_AI_[A-Z0-9_]+)["']\]/g;

/**
 * Tracked `.ts` files under `packages/` or `apps/`, excluding build output.
 *
 * `git ls-files -z` repo-wide and then a **prefix** filter, deliberately not
 * the pathspec `git ls-files 'packages/**\/*.ts'`: a `git` pathspec `*`
 * crosses `/`, so the two agree only while every directory stays flat, and
 * which one was used would stop being visible exactly when it started to
 * matter.
 */
function trackedSourceFiles(): string[] {
  return execSync("git ls-files -z", { cwd: REPO_ROOT, maxBuffer: 1 << 28 })
    .toString()
    .split("\0")
    .filter(
      (p) =>
        (p.startsWith("packages/") || p.startsWith("apps/")) &&
        p.endsWith(".ts") &&
        !p.includes("/dist/") &&
        !p.includes("/generated/") &&
        !p.includes("/node_modules/"),
    );
}

/** Every `MASSA_AI_*` name read via a literal `process.env` accessor. */
function readSet(files = trackedSourceFiles()): string[] {
  const found = new Set<string>();
  for (const file of files) {
    const text = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    for (const match of text.matchAll(ENV_ACCESSOR)) {
      const name = match[1] ?? match[2];
      if (name) found.add(name);
    }
  }
  return [...found].sort();
}

function passThroughEnv(): string[] {
  const turbo = JSON.parse(fs.readFileSync(TURBO_JSON, "utf8"));
  return turbo.tasks?.test?.passThroughEnv ?? [];
}

describe("turbo passThroughEnv covers every literally-accessed MASSA_AI_* var", () => {
  test("population sanity — the scan finds a non-trivial read-set", () => {
    // Zero here means the tree or the filter broke silently, not that the
    // codebase stopped reading env vars (lesson: a mutation that resolves to
    // nothing reads as a gate that catches nothing).
    expect(readSet().length).toBeGreaterThan(0);
  });

  test('every MASSA_AI_* var read via process.env.X or process.env["X"] is listed', () => {
    const listed = new Set(passThroughEnv());
    const missing = readSet().filter((k) => !listed.has(k));
    expect(
      missing,
      `not listed in turbo.json tasks.test.passThroughEnv: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  test("sentinel vars XP-04/XP-10 depend on are present", () => {
    const listed = new Set(passThroughEnv());
    for (const sentinel of ["RUN_POSTGRES_TESTS", "RUN_E2E", "RUN_E2E_DESTRUCTIVE", "DATABASE_URL"]) {
      expect(listed.has(sentinel), `${sentinel} missing from tasks.test.passThroughEnv`).toBe(true);
    }
  });
});
