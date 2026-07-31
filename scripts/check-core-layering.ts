#!/usr/bin/env bun
/**
 * GMS-01 AC-1 — the core layer contract, enforced rather than asserted.
 *
 * PR-C, T5. This ships the **kernel rule**. T15 adds the controllers rule to the
 * same table once phase 3 has retired `controllers/`.
 *
 *     tools → services → data
 *              ↖      ↗
 *               kernel/
 *
 * Two clauses, both from design.md §1:
 *
 *   1. **Kernel leaf-ness.** A file under `kernel/` may not import from `tools/`,
 *      `controllers/`, `services/` or `data/`. design.md §1 names the first three;
 *      `controllers/` is included because it is a tier until phase 3 and a
 *      `kernel → controllers` edge is the same defect. Measured at adoption: 0
 *      such edges either way, so the addition changes no reading — recorded so
 *      the widening is not mistaken for coverage it did not add.
 *   2. **`data → services` is illegal**, while `data → kernel` is legal. This is
 *      the rule the tier exists to make checkable, and the one AC-4's 26 edges
 *      were closed to satisfy.
 *
 * **There is no allowlist, and that is the point.** design.md §1 chose a tier
 * over an allowlist because an allowlist stops the check discriminating: once
 * `data/** → services/structural/fqn-codec.js` is an accepted exception, a *new*
 * `data → fqn-codec` edge is indistinguishable from the recorded ones and passes
 * silently. So this file has no exemption table, `scan()` takes no exemption
 * parameter, and there is no flag that suppresses a violation. A future edge that
 * "has to" be legal is closed by moving the module, not by listing it.
 *
 * **Membership is a path prefix, never a maintained list.** A module is in the
 * kernel because its path starts with `packages/core/src/kernel/` — `git mv` is
 * what grants membership. Keying off a list of module specifiers would be the
 * allowlist this design rejects, renamed.
 *
 * **The tier set is exactly `{kernel, tools, controllers, services, data}`.**
 * Everything else under `packages/core/src/` is **untiered and unconstrained**,
 * the same way `@massa-ai/shared` and `pg` are: `generated/` (Prisma output),
 * `models/`, `scripts/`, `__tests__/`, `index.ts`. This is load-bearing, not
 * tidiness — `kernel/prisma-client.ts` imports `../generated/prisma/index.js`,
 * and a check that treated every non-tier path as foreign would reject a legal
 * tree, failing the one module that closes 12 of AC-4's 26 edges.
 *
 * Usage:
 *   bun scripts/check-core-layering.ts [--repo <path>] [--json]
 * Exit code 0 when clean, 1 on any violation.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

export const CORE_SRC = "packages/core/src/";

/** The tier set. `controllers` leaves this list when phase 3 retires it (T15). */
export const TIERS = ["kernel", "tools", "controllers", "services", "data"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * importer tier → tiers it may not import from.
 *
 * T15 fills `tools`/`controllers`/`services` with the controllers rule. They are
 * present and empty rather than absent so that the growth is a data edit, not a
 * logic edit.
 */
export const FORBIDDEN: Readonly<Record<Tier, readonly Tier[]>> = {
  kernel: ["tools", "controllers", "services", "data"],
  data: ["services"],
  tools: [],
  controllers: [],
  services: [],
};

const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/**
 * Which tier a repo-relative path belongs to, or `null` for untiered.
 *
 * `null` means unconstrained in both directions: an untiered file may import
 * anything, and anything may import it.
 */
export function tierOf(repoRelPath: string): Tier | null {
  if (!repoRelPath.startsWith(CORE_SRC)) return null;
  const rest = repoRelPath.slice(CORE_SRC.length);
  const head = rest.split("/")[0];
  // A bare file directly under src/ (index.ts) has no directory segment.
  if (!rest.includes("/")) return null;
  return (TIERS as readonly string[]).includes(head) ? (head as Tier) : null;
}

/**
 * Comment-stripped source plus a per-offset "inside a string literal" mask.
 *
 * Both are needed, for opposite reasons: an import SPECIFIER is a string literal
 * so its text must survive, while an import STATEMENT written inside a string
 * literal is fixture text rather than an edge — several `scripts/__tests__`
 * suites feed exactly that to metric scripts as input (C17).
 */
export function strip(src: string): { code: string; inString: Uint8Array } {
  let out = "";
  const mask: number[] = [];
  let i = 0;
  const n = src.length;
  const push = (ch: string, masked: boolean) => { out += ch; mask.push(masked ? 1 : 0); };
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === "/" && c2 === "/") { while (i < n && src[i] !== "\n") { push(" ", false); i++; } continue; }
    if (c === "/" && c2 === "*") {
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { push(src[i] === "\n" ? "\n" : " ", false); i++; }
      if (i < n) { push(" ", false); push(" ", false); i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      push(c, false);
      i++;
      while (i < n) {
        if (src[i] === "\\") { push(src[i], true); push(src[i + 1] ?? " ", true); i += 2; continue; }
        if (src[i] === q) { push(q, false); i++; break; }
        push(src[i], true);
        i++;
      }
      continue;
    }
    push(c, false); i++;
  }
  return { code: out, inString: Uint8Array.from(mask) };
}

/**
 * Static edges. **Quote-agnostic by construction** (C15): the delimiter is a
 * capture group accepting `'` or `"` alike, so the reading is a property of the
 * tree rather than of a double-quote-anchored pattern.
 *
 * `mock.module()` counts, because Bun resolves it at runtime and it is a real
 * import-graph edge every other static tool ignores.
 */
export const STATIC =
  /(?:^|[^\w$])(?:import|export)\s[^;]*?from\s*(['"])([^'"]+)\1|(?:^|[^\w$])import\s*\(\s*(['"])([^'"]+)\3|(?:^|[^\w$])require\s*\(\s*(['"])([^'"]+)\5|(?:^|[^\w$])import\s*(['"])([^'"]+)\7/g;
export const MOCK = /mock\.module\s*\(\s*(['"])([^'"]+)\1/g;

/** Resolve a relative specifier to a repo-relative source path, or null. */
export function resolveSpecifier(root: string, fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // bare specifiers are the package manager's problem
  const base = resolve(dirname(`${root}/${fromFile}`), spec);
  const candidates = [base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"), base];
  if (!/\.[a-z]+$/i.test(base)) candidates.push(`${base}.ts`, `${base}.tsx`, `${base}.js`);
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return relative(root, c);
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const idx of ["index.ts", "index.tsx", "index.js"]) {
      if (existsSync(`${base}/${idx}`)) return relative(root, `${base}/${idx}`);
    }
  }
  // Unresolvable (build output, or a genuinely broken specifier). Not this
  // gate's job — `check-stale-pointers` and the build own that.
  return null;
}

export function trackedFiles(root: string): string[] {
  return execSync("git ls-files -z", { cwd: root, maxBuffer: 1 << 28 })
    .toString()
    .split("\0")
    .filter((p) => CODE.test(p));
}

export interface Violation {
  file: string;
  line: number;
  spec: string;
  target: string;
  from: Tier;
  to: Tier;
}

export interface ScanResult {
  violations: Violation[];
  /** Tier→tier edges examined, so a PASS can be told apart from a blind check. */
  edgesExamined: number;
  filesScanned: number;
}

export function scan(root: string, files = trackedFiles(root)): ScanResult {
  const violations: Violation[] = [];
  let edgesExamined = 0;

  for (const file of files) {
    const from = tierOf(file);
    if (from === null) continue; // untiered importer — unconstrained
    const forbidden = FORBIDDEN[from];

    let raw: string;
    try { raw = readFileSync(`${root}/${file}`, "utf8"); } catch { continue; }
    const { code, inString } = strip(raw);

    const found: { spec: string; idx: number }[] = [];
    let m: RegExpExecArray | null;
    STATIC.lastIndex = 0;
    while ((m = STATIC.exec(code)) !== null) {
      const spec = m[2] ?? m[4] ?? m[6] ?? m[8];
      if (!spec) continue;
      // The specifier sits inside a string literal: fixture text, not an edge.
      //
      // The discriminator is the specifier's OPENING QUOTE, not the keyword.
      // Testing the keyword is the obvious thing and it is wrong: in
      //     export const fixture = `import { x } from "../services/s.js";`;
      // the match begins at the outer, genuine `export` at offset 0 — real code,
      // unmasked — and `[^;]*?` then sails through the backtick into the template.
      // No mask reading taken at the keyword can see that.
      //
      // `strip` records a quote that DELIMITS a literal as code (mask 0) and every
      // character INSIDE one as content (mask 1). So for a real import the opening
      // quote is unmasked, while for a quote that is itself template content it is
      // masked — which separates the two cases exactly. Caught by
      // check-core-layering.test.ts's C17 case.
      if (inString[m.index + m[0].lastIndexOf(spec) - 1] === 1) continue;
      found.push({ spec, idx: m.index });
    }
    MOCK.lastIndex = 0;
    while ((m = MOCK.exec(code)) !== null) {
      if (inString[m.index] === 1) continue;
      found.push({ spec: m[2], idx: m.index });
    }

    for (const f of found) {
      const target = resolveSpecifier(root, file, f.spec);
      if (target === null) continue;
      const to = tierOf(target);
      if (to === null) continue; // untiered target — unconstrained
      edgesExamined++;
      if (forbidden.includes(to)) {
        violations.push({
          file,
          line: code.slice(0, f.idx).split("\n").length,
          spec: f.spec,
          target,
          from,
          to,
        });
      }
    }
  }

  return { violations, edgesExamined, filesScanned: files.length };
}

export function report(result: ScanResult): boolean {
  for (const v of result.violations) {
    console.log(`VIOLATION  ${v.file}:${v.line}  ${v.from} -> ${v.to}  "${v.spec}"  (${v.target})`);
  }
  const ok = result.violations.length === 0;
  // `edgesExamined` is printed on a PASS too: a check that resolved nothing also
  // reports zero violations, and the two must not read the same.
  console.log(
    `\n[core-layering] ${ok ? "PASS" : "FAIL"} — ${result.violations.length} violation(s) ` +
      `across ${result.edgesExamined} tier-to-tier edges in ${result.filesScanned} tracked files`,
  );
  return ok;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const argOf = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const root = argOf("--repo") ?? process.cwd();
  const result = scan(root);
  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.violations.length === 0 ? 0 : 1);
  }
  process.exit(report(result) ? 0 : 1);
}
