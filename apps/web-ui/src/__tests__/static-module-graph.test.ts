/**
 * The static bundle's import graph must be resolvable by a browser.
 *
 * `src/static/` is shipped verbatim — there is no bundler, no import map and no
 * build step. The browser resolves every specifier itself against `/ui/`, and
 * `apps/tools-api/src/routes/web-ui.ts` serves whatever file it finds there.
 *
 * The failure this guards is quiet and specific. That route falls back to
 * `index.html` for any unresolved non-traversal path (`web-ui.ts`, the SPA
 * fallback branch), so a wrong specifier does not 404 — it answers with the
 * HTML shell under `content-type: text/html`. The browser refuses that as a
 * module, the tab renders blank, and **every `bun test` still passes**, because
 * Bun resolves the same specifier off disk where the file may well exist under
 * a different path shape than the URL space allows.
 *
 * So this asserts the properties the URL space actually requires:
 *   - every specifier is relative (a browser has nothing to resolve a bare one)
 *   - it points at a real file
 *   - it carries an explicit extension (no directory or extensionless resolution)
 *   - it stays inside the served root
 *
 * It also pins that the graph is reachable from `app.js`, so a module that is
 * shipped but orphaned shows up as a fact rather than as dead weight nobody
 * notices.
 */

import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";

const STATIC_DIR = path.resolve(import.meta.dir, "..", "static");

function listJsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) return listJsFiles(abs);
    return e.isFile() && e.name.endsWith(".js") ? [abs] : [];
  });
}

const FILES = listJsFiles(STATIC_DIR);

/**
 * Static `import ... from "x"` / `export ... from "x"` specifiers.
 *
 * Comments are stripped first and the statement body is bounded by `;`. Without
 * both, an unbounded `[\s\S]*?` between `import` and `from` walks across
 * intervening prose: `views/logs.js`'s doc comment contains the phrase
 * `"explicitly off" from "never chosen"`, which matched as a specifier.
 */
function specifiersOf(file: string): string[] {
  const src = fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  return [...src.matchAll(/^\s*(?:import|export)\b[^;]*?\sfrom\s*["']([^"']+)["']/gm)].map((m) => m[1]);
}

describe("static bundle module graph", () => {
  it("finds the module set (a zero-file scan would pass every assertion below)", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(15);
    const rel = FILES.map((f) => path.relative(STATIC_DIR, f));
    expect(rel).toContain("app.js");
    expect(rel).toContain("start-app.js");
    expect(rel.filter((r) => r.startsWith("views/")).length).toBeGreaterThanOrEqual(9);
    expect(rel.filter((r) => r.startsWith("lib/")).length).toBeGreaterThanOrEqual(6);
  });

  it("every specifier is relative — a browser cannot resolve a bare one", () => {
    const bare: string[] = [];
    for (const f of FILES) {
      for (const s of specifiersOf(f)) {
        if (!s.startsWith("./") && !s.startsWith("../")) bare.push(`${path.relative(STATIC_DIR, f)} -> ${s}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it("every specifier carries an explicit .js extension", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      for (const s of specifiersOf(f)) {
        if (!s.endsWith(".js")) bad.push(`${path.relative(STATIC_DIR, f)} -> ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every specifier resolves to a file that exists", () => {
    const missing: string[] = [];
    for (const f of FILES) {
      for (const s of specifiersOf(f)) {
        const target = path.resolve(path.dirname(f), s);
        if (!fs.existsSync(target)) missing.push(`${path.relative(STATIC_DIR, f)} -> ${s}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("no specifier escapes the served root", () => {
    const escaping: string[] = [];
    for (const f of FILES) {
      for (const s of specifiersOf(f)) {
        const rel = path.relative(STATIC_DIR, path.resolve(path.dirname(f), s));
        if (rel.startsWith("..") || path.isAbsolute(rel)) escaping.push(`${path.relative(STATIC_DIR, f)} -> ${s}`);
      }
    }
    expect(escaping).toEqual([]);
  });

  it("every shipped module is reachable from app.js", () => {
    const seen = new Set<string>();
    const queue = [path.join(STATIC_DIR, "app.js")];
    while (queue.length > 0) {
      const f = queue.pop() as string;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const s of specifiersOf(f)) queue.push(path.resolve(path.dirname(f), s));
    }
    const orphans = FILES.filter((f) => !seen.has(f)).map((f) => path.relative(STATIC_DIR, f));
    expect(orphans).toEqual([]);
  });

  it("no module exceeds 600 lines — the split's own reason for existing", () => {
    // app.js was 3832 lines. This is the regression guard on the thing that was
    // fixed: without it, one tab quietly growing back into a god-file is
    // invisible. 600 is the repo's own coding-guidelines threshold ("a file over
    // ~600 lines must be flagged for splitting"), not a number chosen to fit
    // whatever this refactor happened to produce — it already forced
    // views/registry.js to be split again at 948.
    const oversized = FILES.map(
      (f) => [path.relative(STATIC_DIR, f), fs.readFileSync(f, "utf8").split("\n").length] as const,
    ).filter(([, n]) => n > 600);
    expect(oversized).toEqual([]);
  });
});
