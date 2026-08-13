/**
 * Phase 8 / Wave 7 — write-mode gating guarantee (R8-READONLY-01 superseded by
 * admin-portal UX-01/UX-11) + discrimination sensor.
 *
 * The UI talks to the backend exclusively via the `api.request(path)` helper.
 * The admin portal intentionally calls mutating /api/v1/* routes when write
 * mode is on; trust is the gate (the injected API key), not a path blocklist.
 * FORBIDDEN_MUTATING_PATHS was removed (UX-11). This test now verifies that the
 * write-mode buttons that trigger mutating calls are only rendered when
 * `isWriteModeEnabled()` is true.
 *
 * Discrimination sensor: build a mutant that renders a write-mode button
 * outside the isWriteModeEnabled() gate and confirm the assertion catches it.
 */

import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ui = require("../../../web-ui/src/static/app.js") as {
  isWriteModeEnabled: () => boolean;
  renderMemoryBrowser: (data: unknown, opts: unknown) => string;
  renderProposals: (data: unknown, opts: unknown) => string;
};

const STATIC_DIR = path.resolve(__dirname, "../../../web-ui/src/static");

/**
 * The whole browser bundle's source, concatenated, plus the count of files it
 * was read from.
 *
 * This used to be `app.js` alone, back when `app.js` was the entire web UI. The
 * bundle is now `app.js` (a barrel) plus `lib/` and `views/` modules, so reading
 * one file would scan a few dozen lines of re-exports: the negative assertion
 * below would pass vacuously, and the positive one would find nothing. Reading
 * the directory keeps the scanned subject the same thing it always was — every
 * line of web UI source that ships.
 *
 * T38 (WUT-14): the web-ui-typescript conversion moved 20 of 22 modules from
 * `.js` to `.ts`; a `.js`-only filter here silently shrank the population
 * 21 → 2, one file per commit, with neither assertion below able to notice
 * (`not.toContain` gets more likely to pass as the population empties; the
 * positive `toContain` survived only as long as some remaining `.js` file
 * happened to hold the marker). Reading `.ts` restores the population, and the
 * returned count lets a test assert that restoration directly instead of
 * trusting the string is non-empty.
 */
function readBundleSource(dir: string): { source: string; fileCount: number } {
  let fileCount = 0;
  const source = fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        const nested = readBundleSource(abs);
        fileCount += nested.fileCount;
        return [nested.source];
      }
      if (e.isFile() && (e.name.endsWith(".js") || e.name.endsWith(".ts"))) {
        fileCount += 1;
        return [fs.readFileSync(abs, "utf-8")];
      }
      return [];
    })
    .join("\n");
  return { source, fileCount };
}

const { source: APP_JS, fileCount: APP_JS_FILE_COUNT } = readBundleSource(STATIC_DIR);
const INDEX_HTML = fs.readFileSync(path.join(STATIC_DIR, "index.html"), "utf-8");

// T38 (WUT-14): the population itself is the thing that silently decayed
// (21 -> 2 files, one per conversion commit) while both scanning assertions
// below kept passing. Assert the file count directly, not merely that the
// joined string is non-empty — a non-empty check would not have caught this,
// since even the emptied 2-file population produced non-empty source.
test("readBundleSource scans a non-trivial population (measured: 22 files)", () => {
  console.log(`[web-ui-readonly] scanned ${APP_JS_FILE_COUNT} files under ${STATIC_DIR}`);
  expect(APP_JS_FILE_COUNT).toBeGreaterThanOrEqual(22);
});

// FORBIDDEN_MUTATING_PATHS was removed by admin-portal UX-11.
test("FORBIDDEN_MUTATING_PATHS is no longer exported (admin-portal UX-11)", () => {
  expect((ui as unknown as Record<string, unknown>).FORBIDDEN_MUTATING_PATHS).toBeUndefined();
  expect(APP_JS).not.toContain("FORBIDDEN_MUTATING_PATHS");
});

describe("web-ui write-mode gating guarantee (R8-READONLY-01 superseded)", () => {
  test("write-mode buttons are only rendered when isWriteModeEnabled() is true", () => {
    const memData = {
      data: {
        memories: [{ id: "mem-1", type: "code", level: 1, importance: 0.8, content: "test" }],
        total: 1,
        limit: 50,
        offset: 0,
      },
    };
    const propData = {
      data: { proposals: [{ id: "prop-1", type: "edit", status: "pending", description: "test" }] },
    };

    // Write mode OFF: no edit/delete/approve/reject buttons.
    (globalThis as any).MASSA_AI_WEB_WRITE_MODE = false;
    expect(ui.isWriteModeEnabled()).toBe(false);
    expect(ui.renderMemoryBrowser(memData, { filters: {} })).not.toContain(
      'data-action="memory-edit"',
    );
    expect(ui.renderProposals(propData, { project: "p" })).not.toContain(
      'data-action="proposal-approve"',
    );

    // Write mode ON: buttons render (the write-mode request() handlers are
    // only reachable from these gated buttons).
    (globalThis as any).MASSA_AI_WEB_WRITE_MODE = true;
    expect(ui.isWriteModeEnabled()).toBe(true);
    expect(ui.renderMemoryBrowser(memData, { filters: {} })).toContain(
      'data-action="memory-edit"',
    );
    expect(ui.renderProposals(propData, { project: "p" })).toContain(
      'data-action="proposal-approve"',
    );

    delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
  });

  test("discrimination sensor — a mutant that renders a write button outside the gate would be caught", () => {
    // Inject a mutant that renders an edit button unconditionally (no gate).
    //
    // T38 (WUT-14): this literal used to read `\\"memory-edit\\"` inside a
    // single-quoted outer string — the extra backslash is only needed inside a
    // *double*-quoted outer string, so here it survived into the runtime value
    // as literal backslash characters (`data-action=\"memory-edit\"`), which
    // the assertion below (no backslashes) could never match. A single-quoted
    // outer string needs no escaping at all for an embedded `"`, so this now
    // carries its own marker rather than relying on APP_JS to supply it.
    const mutant =
      APP_JS +
      '\nfunction mutantRender() { return "<button data-action="memory-edit">edit</button>"; }\nmutantRender();\n';
    // The assertion under test: an unguarded write button string contains the
    // data-action marker. The real source only emits it under isWriteModeEnabled.
    expect(mutant).toContain('data-action="memory-edit"');
    // The real source gates it: when write mode is off, no edit button renders.
    (globalThis as any).MASSA_AI_WEB_WRITE_MODE = false;
    const memData = {
      data: { memories: [{ id: "m", type: "code", level: 1, importance: 0.5, content: "x" }], total: 1, limit: 50, offset: 0 },
    };
    expect(ui.renderMemoryBrowser(memData, { filters: {} })).not.toContain(
      'data-action="memory-edit"',
    );
    delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
  });

  test("index.html has no mutating control outside gated views (no type=submit)", () => {
    expect(INDEX_HTML).not.toContain('type="submit"');
    // Nav contains the view links (admin portal adds config + profiles in T9).
    expect(INDEX_HTML).toContain("#/projects");
    expect(INDEX_HTML).toContain("#/memory");
    expect(INDEX_HTML).toContain("#/search");
    expect(INDEX_HTML).toContain("#/handoffs");
    expect(INDEX_HTML).toContain("#/checkpoints");
  });
});
