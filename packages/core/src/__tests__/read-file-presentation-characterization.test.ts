/**
 * R-31 / GMS-05 AC-1 — `handle()`'s presentation block characterized BEFORE
 * Phase 3's T12 moves `read_file.ts:252-337` into
 * `services/file-read/read-file.service.ts` and collapses `handle()` 175 → ~15.
 *
 * This is AUTHORSHIP, not verification (`tasks.md` §3.1, §11 item 4 as re-scoped
 * by Design's gate). The block has no assertions today, and R-26 says these are
 * exactly the tests that get written fast once `coverage` is red on nine new
 * source files. So they are written first, against the unmodified tree.
 *
 * Subject, per `design.md` §5.1 module 7:
 *   compression decision `:252-256` · result assembly `:258-284`
 *   token math + recommendation `:286-323` · usage tips `:325-337`
 *
 * ── C38, the forty-third plan defect ─────────────────────────────────────────
 * `design.md` R-31's per-key table states, for the token-math segment,
 * *"`tokens` ×1, `compressionRatio` ×1 — both only `e2e/08.search`"*.
 * **Both figures are wrong, and one reverses the segment's verdict.**
 *
 *  - `compressionRatio` is **0**, not 1. The only `compressionRatio` assertion in
 *    `e2e/08.search.test.ts` is `:556`, inside test **F28**, which calls
 *    `compressContext(...)` — a different tool — and reads
 *    `r.metadata.compressionRatio`. `ReadFileTool` assigns `compressionRatio` at
 *    the **top level** of `data` (`read_file.ts:304`) and never under `metadata`
 *    (`:276-281` carries only totalLines/language/symbols/imports). Different
 *    tool, different path: it can never observe this field.
 *  - `tokens` is **2**, not 1 — `e2e/08.search.test.ts:675` and `:676`, in F32 —
 *    and neither has `.tokens` as its literal receiver; the field is read two
 *    lines earlier into plain consts. Both also sit after a `try/catch` whose
 *    `catch` does `return` (`:652-668`), so an LLM timeout **skips them
 *    silently** rather than failing.
 *
 * So the unguarded set is larger than R-31 states: `recommendations`,
 * `savingsPercent` **and** `compressionRatio` all have **0** assertions anywhere
 * in the repo. Only `tokens` has any, only through a live-PostgreSQL e2e suite,
 * and only when the LLM path is fast enough to reach them.
 *
 * This is R-31's own defect class a second time. R-31 was rewritten because it
 * cited **a different tool's fixture** (`read-file-response.json`) as evidence;
 * its replacement table then credited **a different tool's assertion**. Sixth
 * time on this feature that a correction inherited the defect it was correcting.
 * Recorded at author level on the C34/C35/C37 precedent — it enlarges T3's
 * subject rather than changing it, and R-31 + GMS-05 AC-1 fix the answer.
 *
 * ── The population R-31 names is imprecise, and the conclusion survives it ────
 * R-31 says *"the only four suites that exercise `ReadFileTool`"*.
 * `apps/tools-api/src/routes/file.test.ts` also names it and predates `design.md`
 * (added `3acf3ae`, 2026-07-25) — but it does `mock.module("@massa-ai/core")`
 * with `ReadFileTool: class {…}` (`:11`, `:23`), replacing the class wholesale,
 * as does `workspace.test.ts:31`. Both exercise route delegation, never this
 * block. R-31's count is short; its conclusion is unaffected.
 *
 * ── What is deliberately NOT asserted, and why (C37's precedent) ──────────────
 * No assertion reaches a private member. T1's C34 measured that the one existing
 * suite touching `ReadFileTool`'s privates breaks in two different phases and
 * that only one break had an owner. Every seam below is public: the constructor's
 * `symbolGraph` parameter (T12 keeps its exact arity and type) and `handle()`.
 * `mock.module` keys on resolved module identity, not on the literal specifier,
 * so these registrations still bind after T12 moves the importer one directory
 * deeper — verified by scratch repro rather than assumed.
 *
 * ── Fixture rules ────────────────────────────────────────────────────────────
 * 1. EVERY CASE PINS `lineRange.actual.total` AND `lineRange.selected`. Branch
 *    selection here keys entirely on `selectedLineCount > 100`, and a fixture
 *    built with a trailing "\n" silently gains a line (`"a\nb\n".split("\n")`
 *    has length 3). Pinning the count makes a miscounted fixture fail loudly
 *    instead of quietly exercising the other branch.
 * 2. NO ENV DEPENDENCE. Containment is satisfied through the project root
 *    (workspace mock), never through `MASSA_AI_READ_FILE_ROOTS` — which is
 *    cleared and restored around the file, with a tripwire, so an ambient value
 *    cannot make a case pass for the wrong reason.
 * 3. THE COMPRESSOR IS MOCKED. `read_file.ts:160` builds a real `CodeCompressor`
 *    with no injection seam, and T2's gate measured that `CodeCompressor` is this
 *    repo's live-LLM edge (`llm.enabled:true` with local Ollama; 42 s cold).
 */

import { describe, test, expect, mock, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

const workspaceRoots = new Map<string, string>();

mock.module("../services/workspace/workspace-manager.js", () => ({
  workspaceManager: {
    getWorkspace: async (projectId: string) => {
      const root = workspaceRoots.get(projectId);
      return root ? { project_id: projectId, project_path: root } : null;
    },
    markIndexing: async () => {},
  },
}));

mock.module("../services/events/event-bus.js", () => ({
  eventBus: { subscribe: () => () => {}, publish: () => {} },
}));

/**
 * Deterministic stand-in for `CodeCompressor`. `compressBehaviour` is switched
 * per case; the reject arm exists to prove `handle()`'s `catch` (`:340-348`)
 * still wraps a throw from inside the moved span after T12.
 */
let compressBehaviour: "ok" | "reject" = "ok";

/**
 * 480 chars → `estimateTokens(_, "code")` = ceil(480/4) = 120 against the
 * 920-token selection, giving savingsPercent = round(86.9565) = **87** while
 * floor() gives **86**. Chosen so the `Math.round` at `:302` is observable:
 * at most fixture sizes round and floor coincide and the operator is untestable.
 */
const COMPRESSED_OUTPUT = "compressed:" + "x".repeat(469);

mock.module("../services/compression/code-compressor.js", () => ({
  CodeCompressor: class {
    async compress(_content: string, _strategy: unknown) {
      if (compressBehaviour === "reject") {
        throw new Error("compressor exploded");
      }
      return { compressed: COMPRESSED_OUTPUT };
    }
  },
}));

import { ReadFileTool } from "../tools/read_file.js";

const ENV = "MASSA_AI_READ_FILE_ROOTS";

/** N distinct lines, joined WITHOUT a trailing newline — see fixture rule 1. */
const makeLines = (n: number) =>
  Array.from({ length: n }, (_, i) => `const v${i} = ${i};`).join("\n");

const PROJECT_ID = "prd-t3-project";
const SYMBOL_PROJECT_ID = "prd-t3-symbols";

let container: string;
let root: string;
let smallFile: string;
let bigFile: string;
let symbolFile: string;
let noSymbolFile: string;
let envBeforeFile: string | undefined;

type ToolResult = {
  success: boolean;
  error?: string;
  data?: {
    filePath: string;
    absolutePath: string;
    lineRange: {
      requested: { start: number; end: number | null };
      actual: { start: number; end: number; total: number };
      selected: number;
    };
    source_clipped: boolean;
    metadata: { totalLines: number; language?: string; symbols?: { definitions: number; references: number }; imports?: string[] };
    compressed: boolean;
    recommendations: string[];
    content: string;
    tokens: { original: number; compressed: number; saved: number; savingsPercent: number };
    compressionRatio?: number;
  };
};

/** A `SymbolGraphService` stand-in supplying a fixed definition count. */
const symbolGraphWith = (definitions: number) =>
  ({
    listDefinitions: async () => ({
      definitions: Array.from({ length: definitions }, (_, i) => ({ name: `sym${i}` })),
    }),
  }) as unknown as ConstructorParameters<typeof ReadFileTool>[0];

beforeAll(() => {
  envBeforeFile = process.env[ENV];
  delete process.env[ENV];

  container = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-r31-"));
  root = path.join(container, "ws");
  fs.mkdirSync(root, { recursive: true });

  smallFile = path.join(root, "small.ts");
  bigFile = path.join(root, "big.ts");
  symbolFile = path.join(root, "symbols.ts");
  noSymbolFile = path.join(root, "no-symbols.ts");

  fs.writeFileSync(smallFile, makeLines(10));
  fs.writeFileSync(bigFile, makeLines(150));
  fs.writeFileSync(symbolFile, makeLines(10));
  fs.writeFileSync(noSymbolFile, makeLines(10));

  workspaceRoots.set(PROJECT_ID, root);
  workspaceRoots.set(SYMBOL_PROJECT_ID, root);
});

afterAll(() => {
  if (envBeforeFile === undefined) delete process.env[ENV];
  else process.env[ENV] = envBeforeFile;
  fs.rmSync(container, { recursive: true, force: true });
});

// ── The four literal strings the four `.push(` sites emit ────────────────────
// `read_file.ts:283` is the initializer `recommendations: []` — NOT a push site.
// The push sites are exactly `:305`, `:319`, `:327`, `:334` (`tasks.md` §3.4;
// `design.md` R-31 and `tasks.md` T3's own row still say five — see the record).
const TIP_LARGE_FILE = "💡 Content > 100 lines. Consider compress=true for token savings";
const TIP_LINE_RANGE =
  "💡 Use lineStart/lineEnd or offset/limit to read specific sections (60% token savings)";
const tipSymbols = (n: number) =>
  `💡 Use get_references() to find usages of ${n} symbols in this file`;
const tipCompressed = (lines: number, pct: number) =>
  `✓ Auto-compressed ${lines} lines (${pct}% reduction)`;

describe("R-31 — read_file handle() presentation block, characterized pre-extraction", () => {
  test("fixture tripwire: the env allowlist is empty, so containment resolves via the project root", () => {
    expect(process.env[ENV]).toBeUndefined();
    expect(COMPRESSED_OUTPUT.length).toBe(480);
  });

  test("no push site fires → recommendations is present and empty, and compressionRatio is ABSENT", async () => {
    const tool = new ReadFileTool();
    const res = (await tool.handle({
      filePath: smallFile,
      projectId: PROJECT_ID,
      lineStart: 2,
      lineEnd: 4,
    })) as ToolResult;

    expect(res.success).toBe(true);
    const d = res.data!;
    expect(d.lineRange.actual.total).toBe(10);
    expect(d.lineRange.selected).toBe(3);

    // `:283`'s initializer survives as an empty array — the key is always present.
    expect(d.recommendations).toEqual([]);

    // `:304` runs only inside `if (shouldAutoCompress)`, so on this branch the
    // key is never assigned at all. `toBeUndefined()` would also pass if the key
    // were present-and-undefined; `in` distinguishes them.
    expect("compressionRatio" in d).toBe(false);
    expect(d.compressed).toBe(false);

    // `:310-315`'s else-branch token block: original === compressed, saved 0.
    expect(d.tokens).toEqual({ original: 17, compressed: 17, saved: 0, savingsPercent: 0 });
  });

  test(":326 alone → the line-range tip, verbatim, when the whole file is read", async () => {
    const tool = new ReadFileTool();
    const res = (await tool.handle({
      filePath: smallFile,
      projectId: PROJECT_ID,
    })) as ToolResult;

    const d = res.data!;
    expect(d.lineRange.requested).toEqual({ start: 1, end: null });
    expect(d.lineRange.actual.total).toBe(10);
    expect(d.lineRange.selected).toBe(10);
    expect(d.recommendations).toEqual([TIP_LINE_RANGE]);
    expect(d.tokens).toEqual({ original: 55, compressed: 55, saved: 0, savingsPercent: 0 });
  });

  test(":318 then :326 → both fire on a >100-line whole-file read, IN THAT ORDER", async () => {
    const tool = new ReadFileTool();
    const res = (await tool.handle({
      filePath: bigFile,
      projectId: PROJECT_ID,
      compress: false,
    })) as ToolResult;

    const d = res.data!;
    expect(d.lineRange.actual.total).toBe(150);
    expect(d.lineRange.selected).toBe(150);
    expect(d.compressed).toBe(false);

    // Order is user-visible MCP output: `:319` is emitted inside the else branch
    // at `:317-322`, `:327` after it. An extraction that reorders them changes
    // what the caller reads first.
    expect(d.recommendations).toEqual([TIP_LARGE_FILE, TIP_LINE_RANGE]);
    expect(d.tokens).toEqual({ original: 920, compressed: 920, saved: 0, savingsPercent: 0 });
  });

  test("exactly 100 selected lines → NEITHER >100 branch fires (both `>` boundaries)", async () => {
    const tool = new ReadFileTool();
    const res = (await tool.handle({
      filePath: bigFile,
      projectId: PROJECT_ID,
      lineStart: 1,
      lineEnd: 100,
    })) as ToolResult;

    const d = res.data!;
    expect(d.lineRange.selected).toBe(100);

    // `:255` (`shouldAutoCompress`) and `:318` (the large-file tip) both read
    // `selectedLineCount > 100`. At exactly 100 neither fires; a `>=` in either
    // place is invisible at any other fixture size.
    expect(d.compressed).toBe(false);
    expect("compressionRatio" in d).toBe(false);
    expect(d.recommendations).toEqual([]);
  });

  test(":333 → the symbol tip interpolates the definition count, and does not fire at zero", async () => {
    const withSymbols = new ReadFileTool(symbolGraphWith(3));
    const res = (await withSymbols.handle({
      filePath: symbolFile,
      projectId: SYMBOL_PROJECT_ID,
      lineStart: 2,
      lineEnd: 4,
    })) as ToolResult;

    const d = res.data!;
    expect(d.metadata.symbols).toEqual({ definitions: 3, references: 0 });
    expect(d.recommendations).toEqual([tipSymbols(3)]);

    // `:333` guards on `definitions > 0`. A distinct file is used because
    // `readFileWithCache`'s key (`:542-548`) includes projectId + relativePath,
    // so re-reading the same path would serve the 3-definition metadata back.
    const withoutSymbols = new ReadFileTool(symbolGraphWith(0));
    const res0 = (await withoutSymbols.handle({
      filePath: noSymbolFile,
      projectId: SYMBOL_PROJECT_ID,
      lineStart: 2,
      lineEnd: 4,
    })) as ToolResult;

    expect(res0.data!.metadata.symbols).toEqual({ definitions: 0, references: 0 });
    expect(res0.data!.recommendations).toEqual([]);
  });

  test(":304 + the token math → exact tokens, exact ratio, exact interpolated message", async () => {
    compressBehaviour = "ok";
    const tool = new ReadFileTool();
    const res = (await tool.handle({
      filePath: bigFile,
      projectId: PROJECT_ID,
      compress: true,
      targetRatio: 0.3,
      lineStart: 1,
      lineEnd: 150,
    })) as ToolResult;

    const d = res.data!;
    expect(d.lineRange.selected).toBe(150);
    expect(d.compressed).toBe(true);
    expect(d.content).toBe(COMPRESSED_OUTPUT);

    // Characterized as literals, not as a re-implementation of the formula: a
    // test that recomputes `Math.ceil(len/4)` alongside the subject moves with it.
    // `original` is measured over the NUMBERED text `extractLines` emits
    // (`:645-649`), not the raw file — swapping `selectedContent` for `content`
    // at `:293` changes this number.
    expect(d.tokens.original).toBe(920);
    expect(d.tokens.compressed).toBe(120);
    expect(d.tokens.saved).toBe(800);
    expect(d.tokens.savingsPercent).toBe(87);
    expect(d.compressionRatio).toBe(120 / 920);

    // The relations, so a rewiring that keeps the literals plausible still fails.
    expect(d.tokens.saved).toBe(d.tokens.original - d.tokens.compressed);
    expect(d.tokens.savingsPercent).toBe(Math.round((1 - d.compressionRatio!) * 100));

    // `:306` interpolates `result.tokens.savingsPercent` — the message and the
    // field cannot disagree.
    expect(d.recommendations).toEqual([tipCompressed(150, 87)]);
  });

  test(":304 and :318 are mutually exclusive — three is the maximum, and it is not four", async () => {
    compressBehaviour = "ok";
    const tool = new ReadFileTool(symbolGraphWith(7));
    const res = (await tool.handle({
      filePath: bigFile,
      projectId: SYMBOL_PROJECT_ID,
      compress: true,
      targetRatio: 0.3,
    })) as ToolResult;

    const d = res.data!;
    expect(d.lineRange.selected).toBe(150);
    expect(d.compressed).toBe(true);

    // `:305` sits in the `if (shouldAutoCompress)` arm and `:319` in the `else`,
    // so no response can ever carry all four strings. Whole-file read → `:327`;
    // 7 definitions → `:334`.
    expect(d.recommendations).toEqual([tipCompressed(150, 87), TIP_LINE_RANGE, tipSymbols(7)]);
    expect(d.recommendations).toHaveLength(3);
    expect(d.recommendations).not.toContain(TIP_LARGE_FILE);
  });

  test("a throw inside the compressed branch is wrapped by handle()'s catch, not surfaced raw", async () => {
    compressBehaviour = "reject";
    try {
      const tool = new ReadFileTool();
      const res = (await tool.handle({
        filePath: bigFile,
        projectId: PROJECT_ID,
        compress: true,
        targetRatio: 0.3,
        lineStart: 1,
        lineEnd: 150,
      })) as ToolResult;

      // `:288`'s await is the only throwing call in the moved span. After T12 it
      // lives in module 7 while the catch stays in the handler, so this pins the
      // boundary rather than assuming it from T9's precedent.
      expect(res.success).toBe(false);
      expect(res.error).toBe("Failed to read file: compressor exploded");
      expect(res.data).toBeUndefined();
    } finally {
      compressBehaviour = "ok";
    }
  });
});
