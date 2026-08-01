#!/usr/bin/env bun
/**
 * RFS-01 — the `tools/` thinness rule, enforced rather than asserted.
 *
 * GMS-02's headline is *"no file under `tools/` contains orchestration or domain
 * logic"*. **C28** is the record of why `check-core-layering` cannot close it:
 * `FORBIDDEN.tools` is `[]` by the declared tier order, so that gate reads `PASS`
 * before, during and after this refactor. This file is its replacement, and it
 * checks a different property — shape, not direction.
 *
 * Three clauses, over a file declaring a handler — a class that implements
 * `IToolHandler`, or an object literal that claims the same contract (C40):
 *
 *   1. **No function body is declared anywhere except inside `handle()`'s own.**
 *   2. **No `Map`/`Set`/`WeakMap`/`WeakSet` state**, as a member of that handler or
 *      at module level.
 *   3. **`handle()` is at most `HANDLE_MAX_LINES` lines.**
 *
 * ## Why the scope is the FILE and not the class (C32)
 *
 * `spec.md` §4.1 fixed the rule as *"no private method"*. Measured, that is the
 * wrong predicate twice over. `private run: (params: XParams) => Promise<R>` is a
 * function-typed **field** — dependency injection, no body — and it is carried by
 * `batch_execute.ts`, `execute.ts`, `execute_file.ts` and `fetch_and_index.ts`,
 * the four thinnest handlers in the tree. A rule reading *"no private callable"*
 * flags those four as well as the two real offenders: **6 of 30**, which is
 * unshippable without the allowlist RFS-01 AC-2 forbids. The predicate is
 * therefore a **declared body**, which those four do not have.
 *
 * And a CLASS scope is defeated by a body declared one level out:
 *
 *     constructor() {
 *       const cache = new Map<string, string>();      // constructor-local
 *       this.run = async (p) => { ...490 lines... };  // closes over cache
 *     }
 *     async handle(p: unknown) { return this.run(p); } // 3 lines
 *
 * That passes a class-scoped reading of all three clauses and is none of the six
 * shapes RFS-01 AC-5 originally enumerated. So the constructor is exempt **by
 * kind** — its own body is not a violation — while the walk still **descends into
 * it**, which is what catches the arrow above. A module-level `function work(){}`
 * called from `handle()` is the same evasion one step further out, and the file
 * scope closes that too.
 *
 * ## Why an object literal is a handler too (C40)
 *
 * RFS-01 AC-5 lists *"an object-literal handler that is not a class"* among the
 * evasion shapes, and says in the same breath that leaving one out would be C21's
 * shape — a gate reading PASS by not looking — aimed forward instead of back. A
 * class-only population does exactly that: measured, an object literal carrying a
 * 200-line `handle()` **and** a module-level `Map` read PASS, because the walk
 * returned early with no class to check. The population is therefore a class that
 * implements the interface **or** an object literal that claims it.
 *
 * `satisfies` and `as` carry the same claim as an annotation and were measured to
 * escape an annotation-only predicate, so all three forms are unwrapped:
 *
 *     export const tool: IToolHandler = { ... };
 *     export const tool = { ... } satisfies IToolHandler;
 *     export const tool = { ... } as IToolHandler;
 *
 * **The widening does not generalise clause 2's exemption on its own, and that is
 * a live false positive rather than a theoretical one.** A class method's locals
 * are never module-level statements, so clause 2's module walk could scan a whole
 * `VariableStatement` subtree safely. An object literal puts the handler's own
 * `handle()` body *inside* such a statement, so the same unconditional walk flags a
 * `Map` constructed and consumed inside `handle()` — legal for a class, and it must
 * be legal here. A handler object's properties are therefore scanned like class
 * fields, and its declaration is not scanned as module state. *When a population
 * widens, re-check every clause's exemption against the new scope, not just the
 * membership predicate.*
 *
 * Measured on this tree: **0** object-literal handlers, and the widened reading is
 * byte-identical to the class-only one, so RFS-01 AC-3's frozen base is untouched.
 *
 * ## Why an AST and never a regex (C32)
 *
 * Three regex detectors were written while `design.md` §6.5 was being measured and
 * **all three were wrong, in three different ways, on the same tree** — one read
 * `private run:` as not a member (right verdict, wrong reason), one found 0 of the
 * 4 function-typed fields, and one found 8 of `read_file.ts`'s 11 methods and 0 of
 * `index_project.ts`'s, truncating on multi-line signatures and on the generic
 * `evictOldest<K, V>`. Every one of them got the per-FILE verdict right and not one
 * got the per-MEMBER count right — and RFS-01 AC-3's frozen base is a per-member
 * claim. *An instrument robust enough for a verdict is not thereby robust enough
 * for a baseline.* `check-core-layering.ts`'s hand-rolled `strip()` is not the
 * precedent to copy: that gate needs an in-a-string mask, this one needs member
 * kinds and bodies, which is what an AST is for.
 *
 * ## Name the metric
 *
 * Two counts are reported for clause 1 and they are different numbers:
 *
 *   - **maximal** — a body not contained in another **flagged** body. This is the
 *     frozen baseline's metric (RFS-01 AC-3). `read_file.ts` is **13**.
 *   - **raw** — every body, descending into flagged ones. `read_file.ts` is **17**.
 *     Reported alongside so a refactor that only re-nests existing arrows is
 *     visibly not a change in the thing the baseline measures.
 *
 * The difference for `read_file.ts` is four nested arrows: three one-line
 * `.map`/`.filter` callbacks inside `checkPathContainment` and one inside
 * `extractLines`. The constructor is exempt from both counts, so a fifth body —
 * the `eventBus.subscribe` arrow at `:167-171` — is *maximal* rather than nested,
 * because its container is exempt and therefore never flagged.
 *
 * Clause 3 measures the `handle` **member's full line span**, declaration line
 * through closing-brace line, inclusive. On today's corpus that is numerically
 * identical to a body-block-only reading, because every `handle()` in `tools/`
 * puts its opening brace on the declaration line — so the corpus cannot falsify
 * the choice, and a multi-line-signature fixture is owed to the unit suite.
 * `design.md` §6.2's band `[113, 128)` was derived under this reading.
 *
 * ## There is no allowlist, and that is the point (RFS-01 AC-2)
 *
 * `check-core-layering.ts` states the ground: an allowlisted exception is
 * indistinguishable from a new violation, so the check stops discriminating the
 * moment one exists. This file therefore has no exemption table, `scan()` takes no
 * exemption parameter, and there is no flag that suppresses a finding. An edge that
 * "has to" be legal is closed by moving the code, not by listing it. `--repo` and
 * `--json` select a tree and an output format; neither can excuse a violation.
 *
 * ## What this check does NOT certify (RFS-01 AC-6)
 *
 * This is a **structural** check. It carries no claim whatever about behaviour, and
 * naming the blind spots is the requirement rather than a courtesy —
 * `check-core-layering.ts`'s own practice of recording that `tools → data` is legal
 * is the precedent.
 *
 *   - **A delegating `handle()` reads identically whether its delegate is correct
 *     or subtly wrong.** This is C28 one level down: the gate proves the logic left
 *     `tools/`, never that it survived the move intact. That is what the extracted
 *     modules' own tests are for (RFS-02, RFS-06).
 *   - **A file under `tools/` that declares no handler is not checked at all.**
 *     That is the rule's scope, not an oversight — but the cost is concrete:
 *     `serialize.ts` is 438 lines and declares **11** function bodies and three
 *     `Map`/`Set` constructions, and every clause here is blind to it. `spec.md` §1
 *     rules it green on the merits as a shared helper; a future reader should know
 *     the gate is not what makes it so. C40 narrows this bullet without closing it:
 *     an object literal that *claims* `IToolHandler` is now in the population, but
 *     one that structurally quacks like a handler while claiming nothing is not.
 *     Deciding that needs a type-checker, which C32 deliberately avoided.
 *   - **`handle()`'s ceiling says nothing about what it delegates to.** A 10-line
 *     `handle()` may call a 500-line service function. Line count is not depth.
 *   - **A body built from a string — `new Function(...)`, `eval` — has no AST node
 *     to flag**, so clause 1 cannot see it. It also forfeits type-checking, which is
 *     the reason this is recorded rather than defended against.
 *   - **`readonly` is invisible.** A `private readonly EXTS = new Set([...])` lookup
 *     table is a constant, not state, and clause 2 flags it anyway — telling the two
 *     apart needs a type-checker, which C32 deliberately avoided. Clause 2's
 *     module-level half flags the same constant hoisted out of the class, so such a
 *     table belongs in `services/` or `kernel/`. Measured **0** on this tree today.
 *   - **The population print is a diffable record, not a self-check.** It reports
 *     what was examined; it does not assert what *should* have been. A reviewer
 *     comparing it against the frozen base is what closes that loop.
 *
 * ## Import direction is a different gate
 *
 * Nothing here checks imports. `scripts/check-core-layering.ts` owns that, and the
 * two are deliberately not merged: this gate would read `PASS` on a handler that
 * imports `data/` directly, and that gate reads `PASS` on a 707-line handler.
 *
 * Usage:
 *   bun scripts/check-tools-thin.ts [--repo <path>] [--json]
 * Exit code 0 when every handler file is thin, 1 on any violation.
 */
import ts from "typescript";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The population. A path prefix, never a `git` pathspec — `*` crosses `/`. */
export const TOOLS_DIR = "packages/core/src/tools/";

/** The interface a checked class must implement. */
export const HANDLER_INTERFACE = "IToolHandler";

/** The member exempt by name. Its body, and everything inside it, is legal. */
export const HANDLE = "handle";

/**
 * `design.md` §6.2: every integer ceiling from 90 to 130 was enumerated under
 * strict `>`, and any value in `[113, 128)` flags exactly the two files the body
 * clause already flags. 120 sits inside that band with 7 lines of margin below and
 * 8 above. It is not an endpoint, for the reason `N` is not one either — a value
 * sitting on its own edge fails on the next unrelated edit.
 */
export const HANDLE_MAX_LINES = 120;

const STATE_CTOR = /^(Map|Set|WeakMap|WeakSet)$/;
/** Matches a type annotation naming one of the above, including inside a union. */
const STATE_TYPE = /\b(Map|Set|WeakMap|WeakSet)\s*</;

/** One flagged function body, with the span the frozen baseline records. */
export interface BodyFinding {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  lines: number;
}

/** One piece of `Map`/`Set` state, and where it was declared. */
export interface StateFinding {
  name: string;
  /** `field` on the handler, `module` at file scope, `assignment` via `this.x = new Map()`. */
  where: "field" | "module" | "assignment";
  line: number;
}

export interface FileReading {
  file: string;
  /** `false` for a helper or barrel: no handler declared, so no clause applies. */
  isHandler: boolean;
  /** Maximal bodies outside `handle()` — the baseline's metric. */
  bodies: BodyFinding[];
  /** Every body, descending into flagged ones. `>= bodies.length` by construction. */
  rawBodies: number;
  state: StateFinding[];
  /** The `handle` member's full line span, or 0 when the class declares none. */
  handleLines: number;
  /**
   * True when `IToolHandler` was imported under a different local name. Not a
   * violation, but a population-detection hazard worth surfacing: a literal-string
   * match would have dropped the file out of the population silently, which is
   * C21's "reads PASS by not looking" wearing a different hat.
   */
  aliasedInterface: boolean;
  /** Class members plus top-level statements inspected. Zero means nothing was read. */
  membersExamined: number;
}

/** Does this node declare a function body? The nine kinds `design.md` §6.5 enumerates. */
function declaresBody(node: ts.Node): boolean {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isConstructorDeclaration(node) ||
      // A `static {}` block is body-bearing and matches none of the above. It cannot
      // host per-request logic, so this is completeness rather than a live evasion.
      ts.isClassStaticBlockDeclaration(node)) &&
    !!(node as { body?: unknown }).body
  );
}

/** Does this subtree construct `Map`/`Set`/`WeakMap`/`WeakSet` anywhere within it? */
function constructsState(node: ts.Node, sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    // The subtree, not just the top node: `= [new Map()]` and `= cond ? new Map() : x`
    // are the same state under a different wrapper.
    if (ts.isNewExpression(n) && STATE_CTOR.test(n.expression.getText(sf))) {
      found = true;
      return;
    }
    n.forEachChild(visit);
  };
  visit(node);
  return found;
}

/**
 * The local binding `IToolHandler` was imported under.
 *
 * A literal match on the identifier is defeated by `import { IToolHandler as H }`,
 * and the failure is silent — the file drops to `isHandler: false` and reads `n/a`
 * rather than failing. Measured 0 occurrences today; closed here rather than
 * documented, because a population that can shrink without an error is the exact
 * defect this gate exists to replace.
 */
function localInterfaceName(sf: ts.SourceFile): { name: string; aliased: boolean } {
  let name = HANDLER_INTERFACE;
  let aliased = false;
  sf.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return;
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.getText(sf) ?? element.name.getText(sf);
      if (imported !== HANDLER_INTERFACE) continue;
      name = element.name.getText(sf);
      aliased = !!element.propertyName;
    }
  });
  return { name, aliased };
}

/** Read one file. Pure: takes source text, touches no disk and no `git`. */
export function analyzeSource(file: string, text: string): FileReading {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lineOf = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const { name: interfaceName, aliased } = localInterfaceName(sf);

  const classes: ts.ClassLikeDeclaration[] = [];
  const collectClasses = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) classes.push(node);
    node.forEachChild(collectClasses);
  };
  sf.forEachChild(collectClasses);

  // `implements` in every file measured, but `extends` is the same claim about the
  // same contract and costs nothing to admit.
  const handlerClasses = classes.filter((cls) =>
    (cls.heritageClauses ?? []).some((clause) =>
      clause.types.some((t) => t.expression.getText(sf) === interfaceName),
    ),
  );

  // C40. An object literal that claims the interface is a handler too. `satisfies`
  // and `as` state the same claim as an annotation and were both measured to escape
  // an annotation-only predicate, so all three are unwrapped.
  const namesInterface = (type: ts.TypeNode | undefined): boolean =>
    !!type && new RegExp(`\\b${interfaceName}\\b`).test(type.getText(sf));
  const handlerObjectOf = (
    decl: ts.VariableDeclaration,
  ): ts.ObjectLiteralExpression | undefined => {
    if (!decl.initializer) return undefined;
    let expr: ts.Expression = decl.initializer;
    let claimed = namesInterface(decl.type);
    while (
      ts.isSatisfiesExpression(expr) ||
      ts.isAsExpression(expr) ||
      ts.isParenthesizedExpression(expr)
    ) {
      if (!ts.isParenthesizedExpression(expr) && namesInterface(expr.type)) claimed = true;
      expr = expr.expression;
    }
    return claimed && ts.isObjectLiteralExpression(expr) ? expr : undefined;
  };
  const handlerObjects: ts.ObjectLiteralExpression[] = [];
  const collectHandlerObjects = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      const obj = handlerObjectOf(node);
      if (obj) handlerObjects.push(obj);
    }
    node.forEachChild(collectHandlerObjects);
  };
  sf.forEachChild(collectHandlerObjects);

  let membersExamined = 0;
  sf.forEachChild(() => membersExamined++);
  for (const cls of handlerClasses) membersExamined += cls.members.length;
  for (const obj of handlerObjects) membersExamined += obj.properties.length;

  const empty: FileReading = {
    file,
    isHandler: false,
    bodies: [],
    rawBodies: 0,
    state: [],
    handleLines: 0,
    aliasedInterface: aliased,
    membersExamined,
  };
  if (handlerClasses.length === 0 && handlerObjects.length === 0) return empty;

  const handleNodes: ts.Node[] = [
    ...handlerClasses.flatMap((cls) => cls.members.filter((m) => m.name?.getText(sf) === HANDLE)),
    ...handlerObjects.flatMap((obj) =>
      obj.properties.filter((p) => p.name?.getText(sf) === HANDLE),
    ),
  ];
  const insideHandle = (node: ts.Node): boolean =>
    handleNodes.some((h) => node.getStart(sf) >= h.getStart(sf) && node.end <= h.end);

  // Clause 1. Recursion terminates at a flagged body, which is what makes the count
  // MAXIMAL rather than raw — descending unconditionally reports every nested arrow
  // as a sibling of its own parent and inflates `read_file.ts` from 13 to 17.
  const bodies: BodyFinding[] = [];
  let rawBodies = 0;
  const countRaw = (node: ts.Node): void => {
    if (declaresBody(node)) rawBodies++;
    node.forEachChild(countRaw);
  };
  const walk = (node: ts.Node): void => {
    if (declaresBody(node)) {
      // Exempt by name: `handle()`'s own body, and everything nested in it, is the
      // one legal home for a body. Do not descend.
      if (handleNodes.includes(node) || insideHandle(node)) return;
      // Exempt by kind: the constructor's own body is legal, but a body declared
      // INSIDE it is C32's evasion, so keep descending.
      if (ts.isConstructorDeclaration(node)) {
        node.forEachChild(walk);
        return;
      }
      const startLine = lineOf(node.getStart(sf));
      const endLine = lineOf(node.end);
      bodies.push({
        name: ts.isConstructorDeclaration(node)
          ? "constructor"
          : ((node as { name?: ts.Node }).name?.getText(sf) ?? ts.SyntaxKind[node.kind]),
        kind: ts.SyntaxKind[node.kind],
        startLine,
        endLine,
        lines: endLine - startLine + 1,
      });
      rawBodies++;
      node.forEachChild(countRaw);
      return;
    }
    node.forEachChild(walk);
  };
  sf.forEachChild(walk);

  // Clause 2, in three places. A field declaration alone is not enough: the natural
  // refactor when a cache needs constructor-supplied seed entries is
  // `private cache: Cache;` plus `this.cache = new Map(seed)`, which declares no
  // body (so clause 1 is blind, the constructor being exempt) and carries no
  // `Map` in its own declaration (so a field-only clause 2 is blind too).
  const state: StateFinding[] = [];
  for (const cls of handlerClasses) {
    for (const member of cls.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      const typeText = member.type ? member.type.getText(sf) : "";
      if (STATE_TYPE.test(typeText) || (member.initializer && constructsState(member.initializer, sf))) {
        state.push({
          name: member.name.getText(sf),
          where: "field",
          line: lineOf(member.getStart(sf)),
        });
      }
    }
  }
  // C40: a handler object's own properties are the analogue of class fields, so
  // they are scanned like fields — and `handle`'s own body is exempt, exactly as it
  // is for a class.
  for (const obj of handlerObjects) {
    for (const prop of obj.properties) {
      if (prop.name?.getText(sf) === HANDLE) continue;
      const init = ts.isPropertyAssignment(prop) ? prop.initializer : undefined;
      if (init && constructsState(init, sf)) {
        state.push({
          name: prop.name?.getText(sf) ?? ts.SyntaxKind[prop.kind],
          where: "field",
          line: lineOf(prop.getStart(sf)),
        });
      }
    }
  }
  sf.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      // A handler object's declaration is NOT module state: its subtree contains
      // `handle()`'s own body, and scanning it unconditionally flags a `Map` built
      // and consumed inside `handle()` — legal for a class, so legal here.
      if (handlerObjectOf(decl)) continue;
      const typeText = decl.type ? decl.type.getText(sf) : "";
      if (STATE_TYPE.test(typeText) || (decl.initializer && constructsState(decl.initializer, sf))) {
        state.push({ name: decl.name.getText(sf), where: "module", line: lineOf(decl.getStart(sf)) });
      }
    }
  });
  const collectAssignments = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
      ts.isNewExpression(node.right) &&
      STATE_CTOR.test(node.right.expression.getText(sf))
    ) {
      state.push({
        name: `this.${node.left.name.getText(sf)}`,
        where: "assignment",
        line: lineOf(node.getStart(sf)),
      });
    }
    node.forEachChild(collectAssignments);
  };
  sf.forEachChild(collectAssignments);

  // Clause 3. The member's full span. A handler with no `handle` reports 0 and is
  // caught by clause 1 instead, every body in it being outside a `handle()` that
  // does not exist.
  const handleNode = handleNodes[0];
  const handleLines = handleNode
    ? lineOf(handleNode.end) - lineOf(handleNode.getStart(sf)) + 1
    : 0;

  return {
    file,
    isHandler: true,
    bodies,
    rawBodies,
    state,
    handleLines,
    aliasedInterface: aliased,
    membersExamined,
  };
}

/** Is this reading a violation? A non-handler file can never be one. */
export function isViolation(reading: FileReading): boolean {
  return (
    reading.isHandler &&
    (reading.bodies.length > 0 ||
      reading.state.length > 0 ||
      reading.handleLines > HANDLE_MAX_LINES)
  );
}

/**
 * Tracked `.ts` files under `TOOLS_DIR`.
 *
 * `git ls-files -z` repo-wide and then a **prefix** filter, deliberately not the
 * pathspec `git ls-files '<dir>/*.ts'`: a `git` pathspec `*` crosses `/`, so the
 * two agree only while the directory stays flat, and which one was used would stop
 * being visible exactly when it started to matter.
 */
export function trackedToolFiles(root: string): string[] {
  return execSync("git ls-files -z", { cwd: root, maxBuffer: 1 << 28 })
    .toString()
    .split("\0")
    .filter((p) => p.startsWith(TOOLS_DIR) && p.endsWith(".ts"));
}

export interface ScanResult {
  readings: FileReading[];
  violations: FileReading[];
  /** Files in the population. Zero means the tree or the filter is wrong. */
  filesScanned: number;
  /** Of those, files declaring a handler. Zero means detection broke. */
  handlerFiles: number;
  /** Class members plus top-level statements read. Zero means the walk broke. */
  membersExamined: number;
}

export function scan(root: string, files = trackedToolFiles(root)): ScanResult {
  const readings: FileReading[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(`${root}/${file}`, "utf8");
    } catch {
      continue;
    }
    readings.push(analyzeSource(file, text));
  }
  return {
    readings,
    violations: readings.filter(isViolation),
    filesScanned: readings.length,
    handlerFiles: readings.filter((r) => r.isHandler).length,
    membersExamined: readings.reduce((sum, r) => sum + r.membersExamined, 0),
  };
}

export function report(result: ScanResult): boolean {
  const short = (f: string): string => f.slice(TOOLS_DIR.length);

  for (const reading of result.violations) {
    console.log(`VIOLATION  ${short(reading.file)}`);
    for (const body of reading.bodies) {
      console.log(
        `    body     :${body.startLine}-${body.endLine} (${body.lines} lines)  ` +
          `${body.name}  [${body.kind}]`,
      );
    }
    for (const item of reading.state) {
      console.log(`    state    :${item.line}  ${item.name}  [${item.where}]`);
    }
    if (reading.handleLines > HANDLE_MAX_LINES) {
      console.log(
        `    handle() ${reading.handleLines} lines  (ceiling ${HANDLE_MAX_LINES})`,
      );
    }
    console.log(
      `    -- maximal bodies ${reading.bodies.length}, raw ${reading.rawBodies}, ` +
        `state ${reading.state.length}, handle() ${reading.handleLines}`,
    );
  }

  for (const reading of result.readings) {
    if (reading.aliasedInterface) {
      console.log(
        `NOTE       ${short(reading.file)} imports ${HANDLER_INTERFACE} under an alias; ` +
          `resolved and still checked`,
      );
    }
  }

  const ok = result.violations.length === 0;
  // The population is printed on a PASS as well as a FAIL, on
  // `check-core-layering.ts`'s `edgesExamined` precedent: a check that resolved
  // nothing also reports zero violations, and the two must not read the same. The
  // three counts fail independently — the filter, the interface detection and the
  // member walk each drive one to zero on its own.
  console.log(
    `\n[tools-thin] ${ok ? "PASS" : "FAIL"} — ${result.violations.length} of ` +
      `${result.filesScanned} file(s) over the rule; ${result.handlerFiles} declare an ` +
      `${HANDLER_INTERFACE}, ${result.filesScanned - result.handlerFiles} do not; ` +
      `${result.membersExamined} members examined; handle() ceiling ${HANDLE_MAX_LINES}`,
  );
  return ok;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const argOf = (flag: string): string | undefined => {
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
