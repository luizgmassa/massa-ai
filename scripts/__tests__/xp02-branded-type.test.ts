/**
 * XP-02 / TASK-XP-004 — compile-fixture gate for the branded-type boundary.
 *
 * Plan-Challenge amendment (critic C1, critical): `packages/core/tsconfig.json`
 * excludes `src/__tests__` from EVERY type-check, so an in-tree
 * `@ts-expect-error` test proves nothing — `bun test` never runs `tsc`, and
 * `tsc` never reaches that directory anyway. This gate instead builds a real
 * in-process TypeScript program (`ts.createProgram`) over two small fixtures
 * that live OUTSIDE `src/__tests__` (`fixtures/xp02-branded-type/`), reusing
 * `packages/core`'s own compiler options, and asserts on the real compiler
 * diagnostics:
 *   - `violating.ts` constructs an `ObservationStore.insert()` call with a
 *     bare-string `payloadJson` — MUST produce a type diagnostic.
 *   - `conforming.ts` builds the same call through `scrubCredentials()` —
 *     MUST produce zero diagnostics.
 * The red fixture failing to compile IS the observed red for this task.
 */

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");
const CORE_ROOT = path.join(REPO_ROOT, "packages", "core");
const CORE_TSCONFIG = path.join(CORE_ROOT, "tsconfig.json");
const FIXTURES_DIR = path.join(import.meta.dir, "fixtures", "xp02-branded-type");
const VIOLATING = path.join(FIXTURES_DIR, "violating.ts");
const CONFORMING = path.join(FIXTURES_DIR, "conforming.ts");

/**
 * Reuse `packages/core`'s own compiler options (strict, module,
 * moduleResolution, lib, target) so this gate reflects the real project's
 * type-checking behavior rather than a hand-rolled approximation. Drops the
 * build-only options (`rootDir`, `composite`, `declaration*`, `outDir`) that
 * only make sense against the real `include`/`exclude` set — this program's
 * `rootNames` are the fixtures below, not `src/**\/*`.
 */
function coreCompilerOptions(): ts.CompilerOptions {
  const raw = ts.readConfigFile(CORE_TSCONFIG, ts.sys.readFile);
  if (raw.error) {
    throw new Error(
      `failed to read ${CORE_TSCONFIG}: ${ts.flattenDiagnosticMessageText(raw.error.messageText, "\n")}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, CORE_ROOT);
  const { rootDir: _rootDir, composite: _composite, declaration: _declaration, declarationMap: _declarationMap, outDir: _outDir, ...rest } =
    parsed.options;
  return rest;
}

function diagnosticsFor(fixturePath: string, program: ts.Program): readonly ts.Diagnostic[] {
  const sourceFile = program.getSourceFile(fixturePath);
  if (!sourceFile) {
    throw new Error(`fixture not found in program (resolution failed?): ${fixturePath}`);
  }
  return ts.getPreEmitDiagnostics(program, sourceFile);
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return diagnostics
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
    .join("\n---\n");
}

describe("XP-02 branded-type compile-fixture gate", () => {
  test("both fixtures exist on disk", () => {
    expect(fs.existsSync(VIOLATING)).toBe(true);
    expect(fs.existsSync(CONFORMING)).toBe(true);
  });

  test("violating.ts (bare-string payloadJson into insert) produces a type diagnostic", () => {
    const options = coreCompilerOptions();
    const program = ts.createProgram({ rootNames: [VIOLATING], options });
    const diagnostics = diagnosticsFor(VIOLATING, program);

    // Population printed via the assertion message, never silent (lesson: a
    // gate that resolves to nothing must not read as clean).
    expect(diagnostics.length, "expected at least one diagnostic on violating.ts, got none").toBeGreaterThan(0);

    const text = formatDiagnostics(diagnostics);
    expect(
      /payloadJson|SanitizedPayloadJson|not assignable/i.test(text),
      `diagnostics did not mention the branded-type mismatch:\n${text}`,
    ).toBe(true);
  });

  test("conforming.ts (scrubCredentials()-produced payloadJson) produces zero diagnostics", () => {
    const options = coreCompilerOptions();
    const program = ts.createProgram({ rootNames: [CONFORMING], options });
    const diagnostics = diagnosticsFor(CONFORMING, program);

    const text = formatDiagnostics(diagnostics);
    expect(diagnostics.length, `expected zero diagnostics on conforming.ts, got:\n${text}`).toBe(0);
  });
});
