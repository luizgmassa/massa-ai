/**
 * Tests for scripts/search-hub-metric.ts.
 *
 * This file exists because the metric was wrong four separate times before it
 * was trusted, and two of those defects cancelled each other out — the reported
 * number was stable across runs and still incorrect. Every defect below has a
 * named regression test. A measurement script that silently mis-measures is the
 * defect class this repository keeps rediscovering; "the figure has not moved"
 * is not evidence that the figure is right.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { stripNonCode, measure, scan, readSources } from "../search-hub-metric.ts";

const srcMap = (files: Record<string, string>): Map<string, string> =>
  new Map(Object.entries(files));

const reading = (files: Record<string, string>, type: string) =>
  measure(srcMap(files)).find((t) => t.type === type);

describe("stripNonCode", () => {
  test("removes block comments, line comments and module specifiers", () => {
    const out = stripNonCode(
      [
        `import { A } from "./a.js";`,
        `/** doc */`,
        `const x = 1; // trailing`,
      ].join("\n"),
    );
    expect(out).not.toContain("doc");
    expect(out).not.toContain("trailing");
    expect(out).not.toContain("./a.js");
    expect(out).toContain("const x = 1;");
  });

  // Defect 4 — the worst one. Stripping string literals pairs quotes across
  // unrelated apostrophes and deletes the code between them. On the pre-M14
  // ContextualSearchRLM that discarded 11 real members and reported 15 for a
  // true count of 26, under-reporting by 42% on exactly one commit — so the
  // cross-commit comparison still looked coherent.
  test("does NOT delete code sitting between two apostrophes", () => {
    const out = stripNonCode(
      [
        `const a = "the file's name";`,
        `this.realMember = 1;`,
        `const b = "the queue's head";`,
      ].join("\n"),
    );
    expect(out).toContain("this.realMember");
  });

  // Defect 3 — an apostrophe inside a comment used to open a spurious string
  // that ran to the next apostrophe, swallowing everything between.
  test("apostrophes inside comments do not swallow following code", () => {
    const out = stripNonCode(
      [
        `// the test's lambda captures dispatch`,
        `this.swallowed = 2;`,
        `// the keyword store's vocabulary`,
      ].join("\n"),
    );
    expect(out).toContain("this.swallowed");
  });
});

describe("measure — member attribution", () => {
  test("counts this.x inside the declaring class", () => {
    const r = reading({ "hub.ts": `export class Hub {\n  run() { return this.a + this.b; }\n}` }, "Hub");
    expect(r?.memberList).toEqual(["a", "b"]);
    expect(r?.foreignModules).toBe(0);
    expect(r?.maxForeignReach).toBe(0);
  });

  test("counts p.x where a parameter is annotated with the type", () => {
    const r = reading(
      {
        "hub.ts": `export class Hub { a = 1; b = 2; c = 3; }`,
        "delegate.ts": `export function go(hub: Hub) { return hub.a + hub.b + hub.c; }`,
      },
      "Hub",
    );
    expect(r?.foreignModules).toBe(1);
    expect(r?.maxForeignReach).toBe(3);
    expect(r?.deepestReader).toBe("delegate.ts");
  });

  test("maxForeignReach is the deepest single module, not the total", () => {
    const r = reading(
      {
        "hub.ts": `export class Hub { a = 1; b = 2; c = 3; d = 4; }`,
        "deep.ts": `export function x(h: Hub) { return h.a + h.b + h.c; }`,
        "shallow.ts": `export function y(h: Hub) { return h.d; }`,
      },
      "Hub",
    );
    expect(r?.foreignModules).toBe(2);
    expect(r?.maxForeignReach).toBe(3);
    expect(r?.deepestReader).toBe("deep.ts");
    expect(r?.members).toBe(4);
  });

  // Defect 2 — a comment naming a module file beside a parameter of the same
  // first token produced a phantom member (`rlm.ts` -> member "ts").
  test("a comment naming <param>-something.ts yields no phantom member", () => {
    const r = reading(
      {
        "hub.ts": `export class Hub { real = 1; }`,
        "delegate.ts": [
          `/**`,
          ` * Extracted from contextual-search-hub.ts. Behavior preserved.`,
          ` */`,
          `export function go(hub: Hub) { return hub.real; }`,
        ].join("\n"),
      },
      "Hub",
    );
    expect(r?.memberList).toEqual(["real"]);
    expect(r?.memberList).not.toContain("ts");
    expect(r?.maxForeignReach).toBe(1);
  });
});

describe("measure — the two evasions the gate must survive", () => {
  // Evasion 1: move the same state onto a differently-named aggregate record.
  // A metric that audits one hardcoded type name reports a clean pass here.
  test("an aggregate holder under a different name is still measured", () => {
    const all = measure(
      srcMap({
        "hub.ts": `export class Hub {}\nexport interface Deps { a: string; b: string; c: string; d: string; }`,
        "delegate.ts": `export function go(deps: Deps) { return deps.a + deps.b + deps.c + deps.d; }`,
      }),
    );
    const hub = all.find((t) => t.type === "Hub");
    const deps = all.find((t) => t.type === "Deps");
    expect(hub?.maxForeignReach ?? 0).toBe(0); // the decoy looks clean
    expect(deps?.maxForeignReach).toBe(4); // ...and the real hub is caught
  });

  // Evasion 2: rename the class. A named-type metric returns a vacuous 0/0.
  test("renaming the class does not produce a vacuous pass", () => {
    const all = measure(
      srcMap({
        "hub.ts": `export class RenamedHub { a = 1; b = 2; }`,
        "delegate.ts": `export function go(h: RenamedHub) { return h.a + h.b; }`,
      }),
    );
    expect(all.some((t) => t.maxForeignReach === 2)).toBe(true);
  });

  test("per-module deps records declared in their own module score zero foreign reach", () => {
    const all = measure(
      srcMap({
        "capability.ts":
          `export interface CapDeps { a: string; b: string; }\n` +
          `export function run(deps: CapDeps) { return deps.a + deps.b; }`,
      }),
    );
    expect(all.find((t) => t.type === "CapDeps")?.maxForeignReach).toBe(0);
  });
});

describe("scan — directory-level readings", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "hub-metric-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "hub.ts"), `export class Hub { a = 1; b = 2; }\n`);
    writeFileSync(join(dir, "delegate.ts"), `export function go(h: Hub) { return h.a + h.b; }\n`);
    writeFileSync(join(dir, "ignored.d.ts"), `export declare class Hub2 { a: number }\n`);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("reads .ts files and skips .d.ts", () => {
    const files = readSources(dir);
    expect([...files.keys()].sort()).toEqual(["delegate.ts", "hub.ts"]);
  });

  test("reports the largest file and its line count", () => {
    const r = scan(dir);
    expect(r.files).toBe(2);
    expect(r.maxFileLoc).toBeGreaterThan(0);
    expect(r.largestFile).not.toBeNull();
  });

  test("orders types by descending foreign reach", () => {
    const r = scan(dir);
    expect(r.types[0].type).toBe("Hub");
    expect(r.types[0].maxForeignReach).toBe(2);
  });
});
