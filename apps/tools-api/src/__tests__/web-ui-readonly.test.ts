/**
 * Phase 8 — read-only guarantee (R8-READONLY-01) + discrimination sensor.
 *
 * The UI talks to the backend exclusively via the `api.request(path)` helper.
 * Read-only is enforced by asserting every request target is one of the 5 known
 * READ paths, and that none of the FORBIDDEN_MUTATING_PATHS is ever a request
 * target. A separate check confirms index.html has no mutating control.
 *
 * Discrimination sensor: build a mutant that calls request("/memory/store")
 * and confirm the assertion catches it.
 */

import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ui = require("../../../web-ui/src/static/app.js") as {
  FORBIDDEN_MUTATING_PATHS: string[];
};

const STATIC_DIR = path.resolve(__dirname, "../../../web-ui/src/static");
const APP_JS = fs.readFileSync(path.join(STATIC_DIR, "app.js"), "utf-8");
const INDEX_HTML = fs.readFileSync(path.join(STATIC_DIR, "index.html"), "utf-8");

const READ_PATHS = [
  "/api/v1/project/list",
  "/api/v1/memory/list",
  "/api/v1/memory/search",
  "/api/v1/handoff/list",
  "/api/v1/checkpoints/list",
];

/** Extract every `request("...")` / `request('...')` first-arg string literal. */
function extractRequestTargets(src: string): string[] {
  const targets: string[] = [];
  const re = /request\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    targets.push(m[1]);
  }
  return targets;
}

describe("web-ui read-only guarantee (R8-READONLY-01)", () => {
  test("FORBIDDEN_MUTATING_PATHS list is non-empty + covers known mutating routes", () => {
    expect(ui.FORBIDDEN_MUTATING_PATHS.length).toBeGreaterThan(0);
    expect(ui.FORBIDDEN_MUTATING_PATHS).toContain("/memory/store");
    expect(ui.FORBIDDEN_MUTATING_PATHS).toContain("/handoff/begin");
    expect(ui.FORBIDDEN_MUTATING_PATHS).toContain("/proposal/approve");
    expect(ui.FORBIDDEN_MUTATING_PATHS).toContain("/project/reset");
    expect(ui.FORBIDDEN_MUTATING_PATHS).toContain("/hook");
  });

  test("every request() target in app.js is one of the 5 read paths", () => {
    const targets = extractRequestTargets(APP_JS);
    expect(targets.length).toBeGreaterThanOrEqual(5);
    for (const t of targets) {
      expect(READ_PATHS).toContain(t);
    }
  });

  test("no forbidden mutating path is a request() target", () => {
    const targets = extractRequestTargets(APP_JS);
    for (const t of targets) {
      for (const f of ui.FORBIDDEN_MUTATING_PATHS) {
        expect(t.endsWith(f)).toBe(false);
      }
    }
  });

  test("discrimination sensor — a mutant request('/memory/store') would be caught", () => {
    // Inject a mutating request target (the mutant).
    const mutant = APP_JS + '\napi.request("/memory/store", { method: "POST" });\n';
    const targets = extractRequestTargets(mutant);
    const caught = targets.some((t) =>
      ui.FORBIDDEN_MUTATING_PATHS.some((f) => t.endsWith(f)),
    );
    expect(caught).toBe(true);
    // And the real source is clean.
    const realTargets = extractRequestTargets(APP_JS);
    const realCaught = realTargets.some((t) =>
      ui.FORBIDDEN_MUTATING_PATHS.some((f) => t.endsWith(f)),
    );
    expect(realCaught).toBe(false);
  });

  test("index.html has no mutating control (no submit form / no type=submit)", () => {
    expect(INDEX_HTML).not.toContain('type="submit"');
    // Nav contains only the 5 read-only view links.
    expect(INDEX_HTML).toContain("#/projects");
    expect(INDEX_HTML).toContain("#/memory");
    expect(INDEX_HTML).toContain("#/search");
    expect(INDEX_HTML).toContain("#/handoffs");
    expect(INDEX_HTML).toContain("#/checkpoints");
  });
});
