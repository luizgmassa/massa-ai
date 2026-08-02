/**
 * RFS-01 AC-4 and AC-5 — the thinness gate's own unit suite (PR-D T4b).
 *
 * The discipline, inherited from `check-core-layering.test.ts` and from this
 * feature's own record: **a gate is not quotable until it has been observed red on
 * purpose**, in both directions, and a check that resolved nothing reports zero
 * violations exactly like a clean tree — so every PASS assertion here is paired
 * with a RED one over the same shape, and every `scan()` assertion also asserts a
 * non-zero population.
 *
 * ## Synthetic fixtures only — never a live-tree count (design.md §6.6 property 5)
 *
 * `"test:scripts": "bun test scripts/__tests__ …"` **auto-discovers** every
 * `*.test.ts` under this directory with no registration step, and `ci.yml:200` runs
 * it inside the `build` job, which is in `main`'s live `required_status_checks`. So
 * this file executes in CI from the moment it lands. A `2 of 30` assertion written
 * here would go **red at Phase 3**, when `read_file.ts` becomes green, and would
 * make `tasks.md` §1.1's *"each phase is green on its own"* obligation false.
 * The frozen base reading is a record in `tasks.md` (T5), not a test.
 *
 * Every fixture below is a string. Nothing here reads `packages/core/src/tools/`.
 *
 * ## Fixture line counts are asserted, not assumed
 *
 * The ceiling clause compares with a **strict `>`**, so it differs from its
 * neighbour at exactly one value, and a fixture built by repeating a line does not
 * span the number of lines it repeats. **The offset is a property of the fixture's
 * own shape, not a constant**: the probe this file was drafted from closed its
 * `handle()` on the `return` line and measured `n + 2`; the helper below puts the
 * closing brace on its own line and measures `n + 3`. Carrying the first figure
 * into the second shape put all five boundary cases one line off, and they were
 * still *passing tests* — just not about the boundary.
 *
 * So the helper is named by the span it produces, that arithmetic is pinned by its
 * own test, and every boundary case re-asserts the achieved span **before**
 * asserting a verdict. T3 reached the same remedy from the other direction, pinning
 * `lineRange.actual.total` on every case. A fixture that drifts must fail as a
 * fixture rather than go quietly inert.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  HANDLE,
  HANDLE_MAX_LINES,
  HANDLER_INTERFACE,
  TOOLS_DIR,
  analyzeSource,
  isViolation,
  report,
  scan,
  trackedToolFiles,
  type FileReading,
} from "../check-tools-thin.ts";

/** The import line every handler fixture starts with. */
const IMPORT = `import { ${HANDLER_INTERFACE} } from "@massa-ai/shared";\n`;

/** Read one fixture. */
const read = (src: string): FileReading => analyzeSource("fixture.ts", src);

/** Read one fixture and return only its verdict. */
const red = (src: string): boolean => isViolation(read(src));

/** A class handler whose members are `body`, always carrying a legal `handle()`. */
const klass = (body: string): string =>
  `${IMPORT}export class T implements ${HANDLER_INTERFACE} {
${body}
  async ${HANDLE}(p: unknown) { return p; }
}
`;

/**
 * A handler whose `handle()` member spans exactly `span` lines.
 *
 * The filler is `span - 3`: the declaration line, the `return`, and the closing
 * brace are the three the caller does not supply. A fixture named by its filler
 * count rather than by its span is how a boundary case goes quietly inert — the
 * first draft of this file was off by one on every ceiling assertion, which is the
 * trap the header names. The arithmetic is pinned by its own test below, and every
 * caller re-asserts the achieved span before asserting a verdict.
 */
const withHandleSpan = (span: number): string =>
  `${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  async ${HANDLE}(p: unknown) {${"\n    void 0;".repeat(span - 3)}
    return p;
  }
}
`;

describe("the rule's constants are pinned — a silent change to one is a change to the rule", () => {
  test("the ceiling is 120, and design.md §6.2's band is why", () => {
    // Any value in [113, 128) flags exactly the two files the body clause already
    // flags. 120 sits inside it with 7 lines of margin below and 8 above; it is
    // deliberately not an endpoint. Moving this constant without moving that
    // derivation is the change this assertion exists to catch.
    expect(HANDLE_MAX_LINES).toBe(120);
  });

  test("the population, the interface and the exempt member are what the rule names", () => {
    expect(TOOLS_DIR).toBe("packages/core/src/tools/");
    expect(HANDLER_INTERFACE).toBe("IToolHandler");
    expect(HANDLE).toBe("handle");
  });

  test("TOOLS_DIR is a path prefix and not a git pathspec — `*` crosses `/`", () => {
    // `git ls-files '<dir>/*.ts'` and a prefix filter agree only while the
    // directory stays flat, and which one was used would stop being visible
    // exactly when it started to matter. Asserted structurally: no glob character.
    expect(TOOLS_DIR).not.toContain("*");
    expect(TOOLS_DIR.endsWith("/")).toBe(true);
  });
});

describe("clause 1 — RFS-01 AC-5's fail shapes, each observed RED", () => {
  // AC-5's own text: leaving one of these out would be C21's shape — a gate
  // reading PASS by not looking — aimed forward instead of back. Every shape is a
  // *future* regrowth path; all were measured absent from `tools/` today, which is
  // exactly why nothing but this suite can observe them.
  const shapes: [string, string][] = [
    ["private method", klass("  private helper() { return 1; }")],
    // C40/C41: `spec.md` AC-4 says a legal PUBLIC method must stay PASS. C32
    // replaced the predicate with "a declared body", under which visibility is
    // irrelevant — measured RED. AC-4's clause is struck and amended in place;
    // this assertion is the record of which reading won.
    ["public method", klass("  public helper() { return 1; }")],
    ["public method, no modifier", klass("  helper() { return 1; }")],
    ["getter", klass("  get thing() { return 1; }")],
    ["setter", klass("  set thing(v: number) { void v; }")],
    ["static member", klass("  static s() { return 1; }")],
    ["#private method", klass("  #hidden() { return 1; }")],
    ["arrow-function class property", klass("  private helper = async () => 1;")],
    [
      "generic method — one of the two shapes that truncated every regex detector",
      klass("  private evict<K, V>(cache: Map<K, V>, cap: number): void { void cache; void cap; }"),
    ],
    [
      "multi-line signature — the other one",
      klass(`  private evict(
    cache: unknown,
    cap: number,
  ): void { void cache; void cap; }`),
    ],
    [
      "module-level function — the file scope's whole point",
      `${IMPORT}function work() { return 1; }
export class T implements ${HANDLER_INTERFACE} { async ${HANDLE}(p: unknown) { return work(); } }
`,
    ],
    [
      "static {} block — body-bearing and matching none of the other predicates",
      klass('  static { console.log("init"); }'),
    ],
    [
      "C32's constructor-body closure — the shape a class-scoped rule cannot see",
      `${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  private run!: (p: unknown) => Promise<unknown>;
  constructor() {
    const cache = new Map<string, string>();
    this.run = async (p) => { cache.set("a", "b"); return p; };
  }
  async ${HANDLE}(p: unknown) { return this.run(p); }
}
`,
    ],
  ];

  for (const [name, src] of shapes) {
    test(`${name} is a violation`, () => {
      const reading = read(src);
      expect(reading.isHandler).toBe(true);
      expect(reading.bodies.length).toBeGreaterThan(0);
      expect(isViolation(reading)).toBe(true);
    });
  }

  test("all of AC-5's declared-body shapes are flagged, none silently dropped", () => {
    // The population print's own lesson one level down: a list that shrinks without
    // an error is indistinguishable from a list that was always short.
    expect(shapes.every(([, src]) => red(src))).toBe(true);
    expect(shapes.length).toBe(13);
  });
});

describe("clause 1 — what is legal, so the rule is discriminating and not merely strict", () => {
  test("the canonical thin handler passes — `private run:` declares no body", () => {
    // The 4-vs-6 feasibility cliff. `batch_execute`, `execute`, `execute_file` and
    // `fetch_and_index` all carry this shape; a rule reading "no private callable"
    // flags them, reads 6 of 30, and is unshippable without the allowlist AC-2
    // forbids.
    const reading = read(`${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  private run: (p: unknown) => Promise<unknown>;
  constructor(run: (p: unknown) => Promise<unknown>) { this.run = run; }
  async ${HANDLE}(p: unknown) { return this.run(p); }
}
`);
    expect(reading.isHandler).toBe(true);
    expect(reading.bodies).toEqual([]);
    expect(isViolation(reading)).toBe(false);
    // Still counted: the constructor and the field were read, not skipped.
    expect(reading.membersExamined).toBeGreaterThan(0);
  });

  test("arrows inside handle() are legal and do not inflate the maximal count", () => {
    const reading = read(`${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  async ${HANDLE}(p: unknown) { return [1, 2].map((x) => x * 2).filter((x) => x > 0); }
}
`);
    expect(reading.bodies).toEqual([]);
    expect(isViolation(reading)).toBe(false);
  });

  test("a file declaring no handler is not checked at all — the rule's scope", () => {
    const reading = read(`export function a() { const m = new Map<string, string>(); return m; }
export function b() { return new Set<string>(); }
`);
    expect(reading.isHandler).toBe(false);
    expect(isViolation(reading)).toBe(false);
    // Counted even so. This is `serialize.ts`'s shape: 438 lines, 11 bodies and
    // three function-local Map/Set constructions, every clause blind to it. The
    // gate is not what makes it green; `spec.md` §1 is.
    expect(reading.membersExamined).toBeGreaterThan(0);
  });
});

describe("maximal vs raw — the two counts are different numbers and both are reported", () => {
  test("recursion stops at a flagged body, so nested arrows are not siblings of their parent", () => {
    const reading = read(
      klass(`  private outer() {
    return [1, 2].map((x) => x * 2).filter((x) => x > 0);
  }`),
    );
    // One maximal body (`outer`), three raw (`outer` + two nested arrows).
    expect(reading.bodies.length).toBe(1);
    expect(reading.bodies[0]?.name).toBe("outer");
    expect(reading.rawBodies).toBe(3);
    expect(reading.rawBodies).toBeGreaterThan(reading.bodies.length);
  });

  test("a refactor that only re-nests existing arrows does not move the maximal count", () => {
    const flat = klass(`  private a() { return 1; }
  private b() { return 2; }`);
    const nested = klass(`  private a() { return [1].map((x) => x + 1); }
  private b() { return [2].map((x) => x + 1); }`);
    expect(read(flat).bodies.length).toBe(read(nested).bodies.length);
    expect(read(flat).rawBodies).toBeLessThan(read(nested).rawBodies);
  });

  test("the constructor is exempt by kind, so a body it contains is maximal", () => {
    // `read_file.ts`'s `eventBus.subscribe` arrow WAS exactly this until T9 moved
    // it into `services/file-read/project-root-cache.ts`: its container is exempt
    // and therefore never flagged, so the arrow is maximal rather than nested.
    // This is the asymmetry C39 was about. The fixture below is synthetic on
    // purpose — the live corpus no longer contains an instance, and a rule whose
    // only witness is one file stops being tested when that file changes.
    const reading = read(`${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  constructor() {
    subscribe(() => { void 0; });
  }
  async ${HANDLE}(p: unknown) { return p; }
}
declare function subscribe(fn: () => void): void;
`);
    expect(reading.bodies.length).toBe(1);
    expect(reading.bodies[0]?.kind).toBe("ArrowFunction");
    // The constructor itself is not among them.
    expect(reading.bodies.some((b) => b.kind === "Constructor")).toBe(false);
  });

  test("handle() is exempt by name and its own body is never reported", () => {
    expect(read(withHandleSpan(3)).bodies).toEqual([]);
  });
});

describe("member-kind classification — R-33, so a `typescript` bump fails here and not the gate", () => {
  /**
   * `design.md` §6.5's nine-case table is the truth table of `declaresBody(node)`
   * for the *member* node. It is **not** a table of `BodyFinding.kind`, and the two
   * diverge for any member whose body lives in a nested initializer: an
   * arrow-function class property is a `PropertyDeclaration` that declares no body
   * itself, and the node actually flagged is the nested `ArrowFunction`. Measured
   * against `typescript@5.9.3` rather than transcribed — C39 was the last figure in
   * this feature copied from that table without being re-run.
   */
  const kinds: [string, string, string][] = [
    ["private method", "  private m(a: number) { void a; }", "MethodDeclaration"],
    ["generic method", "  private g<K, V>(c: Map<K, V>) { void c; }", "MethodDeclaration"],
    ["multi-line signature", "  private multi(\n    a: number,\n  ) { void a; }", "MethodDeclaration"],
    ["getter", "  get thing() { return 1; }", "GetAccessor"],
    ["setter", "  set thing(v: number) { void v; }", "SetAccessor"],
    ["#private method", "  #hidden() { return 1; }", "MethodDeclaration"],
    ["static method", "  static s() { return 1; }", "MethodDeclaration"],
    ["arrow class property", "  private helper = async () => 1;", "ArrowFunction"],
    ["static block", '  static { console.log("i"); }', "ClassStaticBlockDeclaration"],
  ];

  for (const [name, member, kind] of kinds) {
    test(`${name} is flagged as ${kind}`, () => {
      const bodies = read(klass(member)).bodies;
      expect(bodies.length).toBe(1);
      expect(bodies[0]?.kind).toBe(kind);
    });
  }

  test("a module-level function declaration is flagged as FunctionDeclaration", () => {
    const reading = read(`${IMPORT}function work() { return 1; }
export class T implements ${HANDLER_INTERFACE} { async ${HANDLE}(p: unknown) { return work(); } }
`);
    expect(reading.bodies[0]?.kind).toBe("FunctionDeclaration");
  });

  test("the two exempt kinds are absent from every reading", () => {
    const reading = read(`${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  constructor() { void 0; }
  async ${HANDLE}(p: unknown) { return p; }
}
`);
    expect(reading.bodies).toEqual([]);
  });

  test("an arrow class property does NOT report its member name — a known reporting limit", () => {
    // The flagged node is the nested arrow, which has no `name`, so the reported
    // name falls back to the syntax kind. The line span still identifies the
    // member, which is what RFS-01 AC-3's per-member baseline needs. Pinned so the
    // limit is a decision on the record rather than a surprise at T5.
    const bodies = read(klass("  private helper = async () => 1;")).bodies;
    expect(bodies[0]?.name).toBe("ArrowFunction");
    expect(bodies[0]?.startLine).toBeGreaterThan(0);
  });

  test("every flagged body carries a line span whose length is self-consistent", () => {
    const bodies = read(
      klass(`  private multi() {
    void 0;
    void 0;
  }`),
    ).bodies;
    expect(bodies.length).toBe(1);
    const body = bodies[0]!;
    expect(body.lines).toBe(body.endLine - body.startLine + 1);
    expect(body.lines).toBe(4);
  });
});

describe("clause 2 — `Map`/`Set` state at all three sites", () => {
  const stateShapes: [string, string, "field" | "module" | "assignment"][] = [
    ["typed field with no initializer", klass("  private cache: Map<string, string>;"), "field"],
    ["field with a `new Map()` initializer", klass("  private cache = new Map<string, string>();"), "field"],
    [
      "literal-wrapped initializer — the subtree, not just the top node",
      klass("  private caches: unknown[] = [new Map()];"),
      "field",
    ],
    [
      "conditional initializer — same state under a different wrapper",
      klass("  private cache: unknown = true ? new Map() : null;"),
      "field",
    ],
    [
      "module-level const — the rule as `spec.md` §4.1 stated it could not see this",
      `${IMPORT}const cache = new Map<string, string>();
export class T implements ${HANDLER_INTERFACE} { async ${HANDLE}(p: unknown) { return cache; } }
`,
      "module",
    ],
    [
      "`this.x = new Map()` on an untyped field — clause 1 is blind, a two-site clause 2 too",
      `${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  private cache: unknown;
  constructor() { this.cache = new Map(); }
  async ${HANDLE}(p: unknown) { return this.cache; }
}
`,
      "assignment",
    ],
  ];

  for (const [name, src, where] of stateShapes) {
    test(`${name} is a violation, reported at site \`${where}\``, () => {
      const reading = read(src);
      expect(reading.state.length).toBe(1);
      expect(reading.state[0]?.where).toBe(where);
      expect(reading.state[0]?.line).toBeGreaterThan(0);
      expect(isViolation(reading)).toBe(true);
    });
  }

  for (const ctor of ["Map", "Set", "WeakMap", "WeakSet"]) {
    test(`${ctor} is state, not just Map`, () => {
      expect(red(klass(`  private cache = new ${ctor}();`))).toBe(true);
    });
  }

  test("a `Map` built and consumed inside handle() is legal", () => {
    // The clause is about state that outlives a call. A local is not state, and
    // flagging it would make the rule un-followable.
    const reading = read(`${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  async ${HANDLE}(p: unknown) {
    const seen = new Map<string, string>();
    seen.set("a", "b");
    return seen.get("a");
  }
}
`);
    expect(reading.state).toEqual([]);
    expect(isViolation(reading)).toBe(false);
  });

  test("a `readonly` lookup table is flagged too — an accepted false positive, named", () => {
    // Telling a constant from state needs a type-checker, which C32 avoided.
    // Clause 2's module-level half flags the same table hoisted out of the class,
    // so it has no legal home in a handler file. That is deliberate, and pinning it
    // is how the next reader learns it was a decision.
    expect(red(klass('  private readonly EXTS = new Set([".ts", ".js"]);'))).toBe(true);
  });
});

describe("clause 3 — the ceiling, pinned at its exact boundary", () => {
  // `>` and `>=` differ at precisely one value, so a fixture on either side of the
  // boundary is the only thing that can tell them apart. Every case measures its own
  // span first: a fixture that drifts must fail as a fixture, not go quietly inert.
  test("the fixture helper produces the span it is asked for", () => {
    // Pinned once, so the boundary cases below are about the gate rather than
    // about the arithmetic. If this fails, every span assertion in this file is
    // measuring the wrong thing.
    for (const span of [4, 50, 120, 121, 150]) {
      expect(read(withHandleSpan(span)).handleLines).toBe(span);
    }
  });

  for (const [span, expectRed] of [
    [118, false],
    [119, false],
    [120, false],
    [121, true],
    [122, true],
  ] as const) {
    test(`handle() spanning ${span} lines is ${expectRed ? "RED" : "PASS"}`, () => {
      const reading = read(withHandleSpan(span));
      expect(reading.handleLines).toBe(span); // the fixture, asserted before the verdict
      expect(reading.handleLines > HANDLE_MAX_LINES).toBe(expectRed);
      expect(isViolation(reading)).toBe(expectRed);
    });
  }

  test("the comparison is strict `>` — exactly at the ceiling is not over it", () => {
    // `>` and `>=` retain the same count everywhere except one value, so this pair
    // is the only thing in the suite that can tell them apart.
    const at = read(withHandleSpan(HANDLE_MAX_LINES));
    const over = read(withHandleSpan(HANDLE_MAX_LINES + 1));
    expect(at.handleLines).toBe(HANDLE_MAX_LINES);
    expect(over.handleLines).toBe(HANDLE_MAX_LINES + 1);
    expect(isViolation(at)).toBe(false);
    expect(isViolation(over)).toBe(true);
  });

  test("a handler declaring no handle() reports 0 and is caught by clause 1 instead", () => {
    const reading = read(`${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  private work() { return 1; }
}
`);
    expect(reading.handleLines).toBe(0);
    expect(reading.bodies.length).toBe(1);
    expect(isViolation(reading)).toBe(true);
  });

  test("clause 3 fires alone — a fat handle() with no other body is still RED", () => {
    // R-39: on today's corpus this clause flags no file the other two miss, so its
    // whole contribution is prospective. This is the fixture that measures it.
    const reading = read(withHandleSpan(150));
    expect(reading.bodies).toEqual([]);
    expect(reading.state).toEqual([]);
    expect(reading.handleLines).toBeGreaterThan(HANDLE_MAX_LINES);
    expect(isViolation(reading)).toBe(true);
  });
});

describe("clause 3's metric — the corpus cannot falsify it, so a fixture must", () => {
  /**
   * `design.md` §6.4 item 4's class, for the second metric. Every `handle()` in
   * `tools/` puts its opening brace on the declaration line, so the member's
   * **full span** and a **body-block-only** reading are numerically identical
   * across all 27 files — measured at T4a. The corpus therefore cannot tell the
   * two apart, and a reimplementation could switch metrics and stay green. These
   * fixtures are the only place the choice is observable.
   */
  const multiLineSignature = (fill: number): string =>
    `${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  async ${HANDLE}<
    P extends Record<string, unknown>,
    R,
  >(
    params: P,
  ): Promise<R> {${"\n    void 0;".repeat(fill)}
    return params as unknown as R;
  }
}
`;

  /** The body-block-only reading the gate deliberately does NOT use. */
  const bodyBlockLines = (src: string): number => {
    const lines = src.split("\n");
    const open = lines.findIndex((l) => /\)\s*(:[^;]*)?\{\s*$/.test(l) || /\basync handle\(/.test(l));
    let depth = 0;
    for (let i = open; i < lines.length; i++) {
      for (const ch of lines[i] ?? "") {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      if (depth === 0) return i - open + 1;
    }
    return 0;
  };

  test("a single-line signature makes the two metrics agree — today's corpus shape", () => {
    const src = withHandleSpan(HANDLE_MAX_LINES);
    expect(read(src).handleLines).toBe(HANDLE_MAX_LINES);
    expect(bodyBlockLines(src)).toBe(HANDLE_MAX_LINES);
  });

  test("a multi-line signature separates them by exactly the signature's own lines", () => {
    const src = multiLineSignature(112);
    const full = read(src).handleLines;
    const block = bodyBlockLines(src);
    expect(full - block).toBe(5);
    expect(block).toBeGreaterThan(0);
  });

  test("the gate measures the FULL SPAN — RED where a body-block reading would PASS", () => {
    // The discriminating window. `design.md` §6.2's band [113, 128) was derived
    // under the full-span reading; a body-block reimplementation would let this
    // handler through.
    const src = multiLineSignature(113);
    const reading = read(src);
    expect(reading.handleLines).toBe(121);
    expect(bodyBlockLines(src)).toBe(116);
    expect(bodyBlockLines(src)).toBeLessThanOrEqual(HANDLE_MAX_LINES);
    expect(isViolation(reading)).toBe(true);
  });

  test("both metrics still agree far from the boundary — the window is narrow, not universal", () => {
    const src = multiLineSignature(118);
    expect(read(src).handleLines).toBeGreaterThan(HANDLE_MAX_LINES);
    expect(bodyBlockLines(src)).toBeGreaterThan(HANDLE_MAX_LINES);
  });
});

describe("clause 3's implementation — an AST, so a naive brace counter must fail here", () => {
  /**
   * `design.md` §6.4 item 4: a brace counter that strips strings and one that
   * strips nothing produce byte-identical readings across all 27 `tools/` files,
   * because no file today has an unbalanced brace inside a string or comment.
   * *That is not evidence the metric is robust; it is evidence the corpus cannot
   * test it.* These two fixtures are what a regex reimplementation fails on.
   *
   * Measured: the two braces discriminate in opposite directions, and the `{` form
   * — the one `design.md` names — does so at **exactly one** span. Sized for it
   * deliberately; anywhere else it is inert.
   */
  const naiveHandleSpan = (src: string): number => {
    const lines = src.split("\n");
    const start = lines.findIndex((l) => new RegExp(`\\b${HANDLE}\\s*[(<]`).test(l));
    if (start === -1) return 0;
    let depth = 0;
    let opened = false;
    for (let i = start; i < lines.length; i++) {
      for (const ch of lines[i] ?? "") {
        if (ch === "{") {
          depth++;
          opened = true;
        } else if (ch === "}") depth--;
      }
      if (opened && depth <= 0) return i - start + 1;
    }
    return lines.length - start;
  };

  const withString = (literal: string, fill: number): string =>
    `${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  async ${HANDLE}(p: unknown) {
    const s = ${JSON.stringify(`unexpected token: ${literal}`)};${"\n    void 0;".repeat(fill)}
    return s;
  }
}
`;

  test('an unbalanced `}` in a string makes a naive counter close early and pass a RED handler', () => {
    const src = withString("}", 117);
    const reading = read(src);
    expect(reading.handleLines).toBe(121);
    expect(isViolation(reading)).toBe(true);
    // The naive counter sees the string's `}` and stops two lines in.
    expect(naiveHandleSpan(src)).toBe(2);
    expect(naiveHandleSpan(src) > HANDLE_MAX_LINES).toBe(false);
  });

  test('an unbalanced `{` in a string makes a naive counter overshoot and fail a PASS handler', () => {
    const src = withString("{", 116);
    const reading = read(src);
    expect(reading.handleLines).toBe(HANDLE_MAX_LINES);
    expect(isViolation(reading)).toBe(false);
    expect(naiveHandleSpan(src)).toBe(HANDLE_MAX_LINES + 1);
    expect(naiveHandleSpan(src) > HANDLE_MAX_LINES).toBe(true);
  });

  test("a brace inside a comment is invisible to the AST too", () => {
    const reading = read(
      klass("  // an opening brace in prose: {\n  private helper() { return 1; }"),
    );
    expect(reading.bodies.length).toBe(1);
    expect(reading.bodies[0]?.name).toBe("helper");
  });
});

describe("population detection — a population that shrinks without an error is the defect this gate replaces", () => {
  test("an aliased interface import is resolved, not dropped", () => {
    const reading = read(`import { ${HANDLER_INTERFACE} as Handler } from "@massa-ai/shared";
export class T implements Handler {
  private helper() { return 1; }
  async ${HANDLE}(p: unknown) { return this.helper(); }
}
`);
    expect(reading.isHandler).toBe(true);
    expect(reading.aliasedInterface).toBe(true);
    expect(isViolation(reading)).toBe(true);
  });

  test("an unaliased import is not reported as aliased", () => {
    expect(read(klass("  private helper() { return 1; }")).aliasedInterface).toBe(false);
  });

  test("`extends` carries the same claim as `implements`", () => {
    const reading = read(`${IMPORT}export class T extends ${HANDLER_INTERFACE} {
  private helper() { return 1; }
  async ${HANDLE}(p: unknown) { return this.helper(); }
}
`);
    expect(reading.isHandler).toBe(true);
    expect(isViolation(reading)).toBe(true);
  });

  test("a class implementing something else is not in the population", () => {
    const reading = read(`export class T implements SomethingElse {
  private helper() { return 1; }
  async ${HANDLE}(p: unknown) { return this.helper(); }
}
declare interface SomethingElse { handle(p: unknown): unknown }
`);
    expect(reading.isHandler).toBe(false);
    expect(isViolation(reading)).toBe(false);
  });
});

describe("C40 — an object literal that claims the interface is a handler too", () => {
  // AC-5 names "an object-literal handler that is not a class" among the fail
  // shapes, and says in the same sentence that leaving one out is C21's shape
  // aimed forward. A class-only population did exactly that.
  const objectHandler = (props: string, suffix = ""): string =>
    `${IMPORT}export const tool: ${HANDLER_INTERFACE} = {
${props}
  async ${HANDLE}(p: unknown) { return p; },
};
${suffix}`;

  test("an object-literal handler carrying a sibling body is RED", () => {
    const reading = read(objectHandler("", "function work() { return 1; }\n"));
    expect(reading.isHandler).toBe(true);
    expect(reading.bodies.length).toBe(1);
    expect(isViolation(reading)).toBe(true);
  });

  test("state on a sibling property is RED, reported as a field", () => {
    const reading = read(objectHandler("  cache: new Map<string, string>(),"));
    expect(reading.state.length).toBe(1);
    expect(reading.state[0]?.where).toBe("field");
    expect(isViolation(reading)).toBe(true);
  });

  test("a fat handle() on an object literal is RED", () => {
    const reading = read(`${IMPORT}export const tool: ${HANDLER_INTERFACE} = {
  async ${HANDLE}(p: unknown) {${"\n    void 0;".repeat(150)}
    return p;
  },
};
`);
    expect(reading.handleLines).toBeGreaterThan(HANDLE_MAX_LINES);
    expect(isViolation(reading)).toBe(true);
  });

  for (const [form, src] of [
    ["annotated", `export const tool: ${HANDLER_INTERFACE} = { async ${HANDLE}(p: unknown) { return work(p); } };`],
    ["satisfies", `export const tool = { async ${HANDLE}(p: unknown) { return work(p); } } satisfies ${HANDLER_INTERFACE};`],
    ["as", `export const tool = { async ${HANDLE}(p: unknown) { return work(p); } } as ${HANDLER_INTERFACE};`],
  ] as const) {
    test(`the \`${form}\` form is in the population — all three state the same claim`, () => {
      const reading = read(`${IMPORT}${src}
function work(p: unknown) { return p; }
`);
      expect(reading.isHandler).toBe(true);
      expect(isViolation(reading)).toBe(true);
    });
  }

  test("a `Map` built and consumed inside an object-literal handle() is legal", () => {
    // The regression this widening introduced and had to close: an object literal
    // puts handle()'s own body *inside* a module-level `VariableStatement`, so
    // clause 2's module walk flagged a local the class form correctly ignores.
    // When a population widens, every clause's exemption must be re-checked
    // against the new scope, not just the membership predicate.
    const objectForm = read(`${IMPORT}export const tool: ${HANDLER_INTERFACE} = {
  async ${HANDLE}(p: unknown) {
    const seen = new Map<string, string>();
    seen.set("a", "b");
    return seen.get("a");
  },
};
`);
    const classForm = read(`${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  async ${HANDLE}(p: unknown) {
    const seen = new Map<string, string>();
    seen.set("a", "b");
    return seen.get("a");
  }
}
`);
    expect(objectForm.state).toEqual([]);
    expect(isViolation(objectForm)).toBe(false);
    // The two forms must agree — that is the whole claim of the widening.
    expect(isViolation(objectForm)).toBe(isViolation(classForm));
  });

  test("a thin object-literal handler passes, and arrows inside its handle() are legal", () => {
    const reading = read(`${IMPORT}export const tool: ${HANDLER_INTERFACE} = {
  ${HANDLE}: async (p: unknown) => { return [1, 2].map((x) => x * 2); },
};
`);
    expect(reading.isHandler).toBe(true);
    expect(reading.bodies).toEqual([]);
    expect(isViolation(reading)).toBe(false);
  });

  test("a module-level `Map` beside an object-literal handler is still module state", () => {
    const reading = read(`${IMPORT}const cache = new Map<string, string>();
export const tool: ${HANDLER_INTERFACE} = { async ${HANDLE}(p: unknown) { return cache; } };
`);
    expect(reading.state.length).toBe(1);
    expect(reading.state[0]?.where).toBe("module");
    expect(isViolation(reading)).toBe(true);
  });

  test("an object literal claiming nothing is untouched — the scope, stated", () => {
    const reading = read(`export const cfg = {
  cache: new Map<string, string>(),
  run() { return 1; },
};
`);
    expect(reading.isHandler).toBe(false);
    expect(isViolation(reading)).toBe(false);
  });
});

/** A throwaway git repo, so `git ls-files` is real rather than stubbed. */
function repo(files: Record<string, string>): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "tools-thin-"));
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  git("add", "-A");
  git("commit", "-qm", "fixture");
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Scan a fixture tree through the real `git ls-files` path, always cleaning up. */
function scanRepo(files: Record<string, string>): ReturnType<typeof scan> {
  const { root, cleanup } = repo(files);
  try {
    return scan(root, trackedToolFiles(root));
  } finally {
    cleanup();
  }
}

const GREEN = `${TOOLS_DIR}green.ts`;
const greenHandler = `${IMPORT}export class GreenTool implements ${HANDLER_INTERFACE} {
  private run: (p: unknown) => Promise<unknown>;
  constructor(run: (p: unknown) => Promise<unknown>) { this.run = run; }
  async ${HANDLE}(p: unknown) { return this.run(p); }
}
`;

/** `serialize.ts`'s shape: a real helper, function-local state, no handler. */
const helperFile = `export function bucket(rows: string[]): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const row of rows) { seen.add(row); }
  return buckets;
}
export function widen(rows: string[]): Set<string> { return new Set(rows); }
`;

describe("RFS-01 AC-4 — both directions observed red, plus an inert control", () => {
  test("the clean tree is PASS, and its population is non-zero", () => {
    // Half of the criterion. A check that resolved nothing also reports zero
    // violations, so a PASS is only evidence when the population is asserted too.
    const result = scanRepo({ [GREEN]: greenHandler, [`${TOOLS_DIR}helper.ts`]: helperFile });
    expect(result.violations).toEqual([]);
    expect(result.filesScanned).toBe(2);
    expect(result.handlerFiles).toBe(1);
    expect(result.membersExamined).toBeGreaterThan(0);
  });

  test("direction 1 — a private method added to a green handler FAILS", () => {
    const result = scanRepo({
      [GREEN]: greenHandler.replace(
        `  async ${HANDLE}`,
        `  private helper() { return 1; }\n  async ${HANDLE}`,
      ),
    });
    expect(result.violations.length).toBe(1);
    expect(result.violations[0]?.bodies.length).toBe(1);
    expect(result.filesScanned).toBe(1);
  });

  test("direction 2 — a `Map` field added to a green handler FAILS", () => {
    const result = scanRepo({
      [GREEN]: greenHandler.replace(
        `  async ${HANDLE}`,
        `  private cache = new Map<string, string>();\n  async ${HANDLE}`,
      ),
    });
    expect(result.violations.length).toBe(1);
    expect(result.violations[0]?.state.length).toBe(1);
  });

  test("direction 3 — a handle() over the ceiling FAILS", () => {
    const result = scanRepo({ [GREEN]: withHandleSpan(150) });
    expect(result.violations.length).toBe(1);
    expect(result.violations[0]?.handleLines).toBeGreaterThan(HANDLE_MAX_LINES);
    expect(result.violations[0]?.bodies).toEqual([]);
  });

  test("the inert control stays PASS while still being counted", () => {
    // `design.md` §6.6 property 4 names this control. `spec.md` AC-4 named a
    // different one — "a legal public method added must stay PASS" — which C32
    // falsified: a public method declares a body. That clause is struck and
    // amended in place; this is the control that survives.
    const result = scanRepo({ [GREEN]: greenHandler, [`${TOOLS_DIR}serialize.ts`]: helperFile });
    const control = result.readings.find((r) => r.file.endsWith("serialize.ts"));
    expect(control?.isHandler).toBe(false);
    expect(control?.membersExamined).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
    expect(result.filesScanned).toBe(2);
  });

  test("an inert edit moves nothing — a comment-only change reads identically", () => {
    const before = scanRepo({ [GREEN]: greenHandler });
    const after = scanRepo({ [GREEN]: `// a comment that changes no structure\n${greenHandler}` });
    expect(after.violations).toEqual(before.violations);
    expect(after.filesScanned).toBe(before.filesScanned);
    expect(after.handlerFiles).toBe(before.handlerFiles);
    expect(after.membersExamined).toBe(before.membersExamined);
  });

  test("the three population counters fail independently — each can hit zero alone", () => {
    // The filter, the interface detection and the member walk each drive one
    // counter to zero on its own, which is why all three are printed.
    const noFiles = scanRepo({ "packages/core/src/services/x.ts": "export const x = 1;\n" });
    expect(noFiles.filesScanned).toBe(0);
    expect(noFiles.handlerFiles).toBe(0);
    expect(noFiles.violations).toEqual([]); // ...and reports PASS, which is the trap

    const noHandlers = scanRepo({ [`${TOOLS_DIR}helper.ts`]: helperFile });
    expect(noHandlers.filesScanned).toBe(1);
    expect(noHandlers.handlerFiles).toBe(0);
    expect(noHandlers.membersExamined).toBeGreaterThan(0);
  });
});

describe("trackedToolFiles — the population filter", () => {
  test("a nested subdirectory is included — a prefix, not a git pathspec", () => {
    // `git ls-files '<dir>/*.ts'` would also match this, because a pathspec `*`
    // crosses `/`. The two agree only while the directory stays flat; asserting the
    // nested case is what keeps the choice visible.
    const { root, cleanup } = repo({
      [GREEN]: greenHandler,
      [`${TOOLS_DIR}nested/deep.ts`]: greenHandler,
    });
    try {
      expect(trackedToolFiles(root).sort()).toEqual([
        `${TOOLS_DIR}green.ts`,
        `${TOOLS_DIR}nested/deep.ts`,
      ]);
    } finally {
      cleanup();
    }
  });

  test("non-`.ts` files and files outside the directory are excluded", () => {
    const { root, cleanup } = repo({
      [GREEN]: greenHandler,
      [`${TOOLS_DIR}legacy.js`]: "module.exports = {};\n",
      [`${TOOLS_DIR}fixture.json`]: "{}\n",
      "packages/core/src/services/search.ts": greenHandler,
      "packages/core/src/toolsmith/x.ts": greenHandler,
    });
    try {
      expect(trackedToolFiles(root)).toEqual([`${TOOLS_DIR}green.ts`]);
    } finally {
      cleanup();
    }
  });

  test("an untracked file is invisible — every reading must be taken after `git add`", () => {
    const { root, cleanup } = repo({ [GREEN]: greenHandler });
    try {
      mkdirSync(join(root, TOOLS_DIR), { recursive: true });
      writeFileSync(join(root, `${TOOLS_DIR}untracked.ts`), klass("  private h() { return 1; }"));
      expect(trackedToolFiles(root)).toEqual([`${TOOLS_DIR}green.ts`]);
      expect(scan(root, trackedToolFiles(root)).violations).toEqual([]);
    } finally {
      cleanup();
    }
  });

  test("scan skips a listed file it cannot read rather than throwing", () => {
    const { root, cleanup } = repo({ [GREEN]: greenHandler });
    try {
      const result = scan(root, [`${TOOLS_DIR}green.ts`, `${TOOLS_DIR}absent.ts`]);
      expect(result.filesScanned).toBe(1);
    } finally {
      cleanup();
    }
  });
});

describe("report — the population is printed on a PASS as well as a FAIL", () => {
  const capture = (result: ReturnType<typeof scan>): { ok: boolean; out: string } => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]): void => void lines.push(args.join(" "));
    try {
      return { ok: report(result), out: lines.join("\n") };
    } finally {
      console.log = original;
    }
  };

  test("a PASS prints the counts, so a check that resolved nothing does not read the same", () => {
    const { ok, out } = capture(scanRepo({ [GREEN]: greenHandler, [`${TOOLS_DIR}h.ts`]: helperFile }));
    expect(ok).toBe(true);
    expect(out).toContain("[tools-thin] PASS");
    expect(out).toContain("0 of 2 file(s)");
    expect(out).toContain(`1 declare an ${HANDLER_INTERFACE}, 1 do not`);
    expect(out).toMatch(/\d+ members examined/);
    expect(out).toContain(`handle() ceiling ${HANDLE_MAX_LINES}`);
  });

  test("an empty population prints zeros rather than an indistinguishable PASS", () => {
    const { ok, out } = capture(scanRepo({ "packages/core/src/services/x.ts": "export const x = 1;\n" }));
    expect(ok).toBe(true);
    expect(out).toContain("0 of 0 file(s)");
    expect(out).toContain("0 members examined");
  });

  test("a FAIL prints every body span and state site, which is what T5 transcribes", () => {
    const { ok, out } = capture(
      scanRepo({
        [GREEN]: `${IMPORT}export class T implements ${HANDLER_INTERFACE} {
  private cache = new Map<string, string>();
  private helper() { return 1; }
  async ${HANDLE}(p: unknown) { return this.helper(); }
}
`,
      }),
    );
    expect(ok).toBe(false);
    expect(out).toContain("VIOLATION  green.ts");
    expect(out).toMatch(/body\s+:4-4 \(1 lines\)\s+helper\s+\[MethodDeclaration]/);
    expect(out).toMatch(/state\s+:3\s+cache\s+\[field]/);
    expect(out).toContain("maximal bodies 1, raw 1, state 1");
    expect(out).toContain("[tools-thin] FAIL — 1 of 1 file(s)");
  });

  test("an aliased import is surfaced as a NOTE without being a violation", () => {
    const { ok, out } = capture(
      scanRepo({
        [GREEN]: `import { ${HANDLER_INTERFACE} as Handler } from "@massa-ai/shared";
export class T implements Handler {
  private run: (p: unknown) => Promise<unknown>;
  constructor(run: (p: unknown) => Promise<unknown>) { this.run = run; }
  async ${HANDLE}(p: unknown) { return this.run(p); }
}
`,
      }),
    );
    expect(ok).toBe(true);
    expect(out).toContain("under an alias; resolved and still checked");
  });
});

describe("there is no allowlist, and that is the point (RFS-01 AC-2)", () => {
  test("scan takes a file list and no exemption parameter", () => {
    // An allowlisted exception is indistinguishable from a new violation, so the
    // check stops discriminating the moment one exists. Asserted structurally:
    // `scan` is (root, files) and nothing else.
    expect(scan.length).toBeLessThanOrEqual(2);
  });

  test("isViolation is a pure function of the reading, with no suppression input", () => {
    expect(isViolation.length).toBe(1);
    const reading = read(klass("  private helper() { return 1; }"));
    expect(isViolation(reading)).toBe(true);
    expect(isViolation(reading)).toBe(true); // no state, no memo, no toggle
  });
});
