/**
 * Unit tests for `services/file-read/file-metadata.ts` — module 5 of the
 * `tools/read_file.ts` extraction (PR-D, T10).
 *
 * WHAT THE PRE-EXISTING SUITES ALREADY REACH, so that what this file adds is
 * stated rather than assumed. `read-file.test.ts` drives `extractMetadata`
 * through `handle()` with and without a symbol graph, and its writeback case
 * counts the calls; `read-file-presentation-characterization.test.ts` asserts
 * the `metadata` block the handler emits. Both go through the handler, and the
 * handler only ever asks for ONE language (`.ts`) and one import dialect.
 *
 * So the branches this file adds are the ones a caller cannot reach: the
 * language map's non-TypeScript entries, the unknown-extension exit, the
 * import-pattern table's five other dialects, the no-pattern early return, and
 * the `listDefinitions` rejection that `logger.debug`s and falls through. The
 * last is the important one — it is the module's only failure branch, every
 * pre-existing suite stubs `listDefinitions` to resolve, and a mechanical move
 * that dropped the try/catch would be invisible to all of them.
 *
 * DEBT-02's coverage floor is per file and applies to this module on its own
 * (R-36), so every branch is exercised here rather than through the handler.
 */

import { describe, test, expect } from "bun:test";

import { FileMetadataExtractor, type FileMetadata } from "../services/file-read/file-metadata.js";
import type { SymbolGraphService } from "../services/symbol/symbol-graph.service.js";

const OPTS = { includeSymbols: false, includeImports: false };

/** Duck-typed stub for the one method the module calls. */
const graphReturning = (n: number): SymbolGraphService =>
  ({
    listDefinitions: async () => ({
      definitions: Array.from({ length: n }, (_, i) => ({ name: `s${i}` })),
      total: n,
      total_exact: true,
    }),
  }) as unknown as SymbolGraphService;

const graphThrowing = (): SymbolGraphService =>
  ({
    listDefinitions: async () => {
      throw new Error("symbol graph unavailable");
    },
  }) as unknown as SymbolGraphService;

describe("FileMetadataExtractor — totalLines and language", () => {
  test("totalLines counts newline-separated lines, including a trailing empty one", async () => {
    const m = await new FileMetadataExtractor().extractMetadata("a\nb\nc\n", "/x/f.ts", OPTS);
    // "a\nb\nc\n".split("\n") is ["a","b","c",""] — 4, not 3. Pinned because the
    // handler re-derives its own totalLines the same way and the two must agree.
    expect(m.totalLines).toBe(4);
  });

  test("an empty file is one line, not zero", async () => {
    const m = await new FileMetadataExtractor().extractMetadata("", "/x/f.ts", OPTS);
    expect(m.totalLines).toBe(1);
  });

  // The map has 31 entries collapsing to 21 distinct languages. Sampled across
  // every collapsing group plus the singletons, so a dropped alias is caught:
  // .ts/.tsx, .js/.jsx, .c/.h, .cpp/.hpp, .kt/.kts, .yaml/.yml, .sh/.bash.
  test.each([
    [".ts", "TypeScript"],
    [".tsx", "TypeScript"],
    [".js", "JavaScript"],
    [".jsx", "JavaScript"],
    [".vue", "Vue"],
    [".py", "Python"],
    [".go", "Go"],
    [".rs", "Rust"],
    [".java", "Java"],
    [".cpp", "C++"],
    [".hpp", "C++"],
    [".c", "C"],
    [".h", "C"],
    [".cs", "C#"],
    [".rb", "Ruby"],
    [".php", "PHP"],
    [".swift", "Swift"],
    [".kt", "Kotlin"],
    [".kts", "Kotlin"],
    [".scala", "Scala"],
    [".md", "Markdown"],
    [".json", "JSON"],
    [".yaml", "YAML"],
    [".yml", "YAML"],
    [".xml", "XML"],
    [".html", "HTML"],
    [".css", "CSS"],
    [".scss", "SCSS"],
    [".sql", "SQL"],
    [".sh", "Shell"],
    [".bash", "Shell"],
  ])("%s maps to %s", async (ext, language) => {
    const m = await new FileMetadataExtractor().extractMetadata("x\n", `/x/f${ext}`, OPTS);
    expect(m.language).toBe(language);
  });

  test("the extension match is case-insensitive", async () => {
    const m = await new FileMetadataExtractor().extractMetadata("x\n", "/x/F.TS", OPTS);
    expect(m.language).toBe("TypeScript");
  });

  test("an unmapped extension leaves language undefined rather than guessing", async () => {
    const m = await new FileMetadataExtractor().extractMetadata("x\n", "/x/f.zzz", OPTS);
    expect(m.language).toBeUndefined();
  });

  test("a file with no extension leaves language undefined", async () => {
    const m = await new FileMetadataExtractor().extractMetadata("x\n", "/x/Makefile", OPTS);
    expect(m.language).toBeUndefined();
  });
});

describe("FileMetadataExtractor — imports", () => {
  test("includeImports:false omits the key entirely rather than emitting []", async () => {
    const m = await new FileMetadataExtractor().extractMetadata(
      "import { a } from 'b';\n",
      "/x/f.ts",
      { includeSymbols: false, includeImports: false },
    );
    // Absent, not empty: handle() spreads `...(metadata.imports && {imports})`,
    // so [] and undefined are NOT interchangeable at the response boundary.
    expect(m.imports).toBeUndefined();
    expect("imports" in m).toBe(false);
  });

  test("an unknown language never runs a pattern, so imports stays absent", async () => {
    const m = await new FileMetadataExtractor().extractMetadata("import x\n", "/x/f.zzz", {
      includeSymbols: false,
      includeImports: true,
    });
    expect(m.imports).toBeUndefined();
  });

  test("a mapped language with NO import pattern returns [] — the early return", async () => {
    // Markdown is in languageMap and absent from importPatterns. This is the
    // `if (!pattern) return imports;` exit, and it is the one place the two
    // tables disagree; 21 languages are mapped and 6 have patterns.
    const m = await new FileMetadataExtractor().extractMetadata("import x\n", "/x/f.md", {
      includeSymbols: false,
      includeImports: true,
    });
    expect(m.imports).toEqual([]);
  });

  test.each([
    ["TypeScript", ".ts", "import { a } from 'b';\nconst x = 1;\nimport 'side-effect';\n", ["import { a } from 'b';", "import 'side-effect';"]],
    ["JavaScript", ".js", "const y = require('z');\nrequire('w');\nlet q;\n", ["require('w');"]],
    ["Python", ".py", "import os\nfrom sys import path\nx = 1\n", ["import os", "from sys import path"]],
    ["Go", ".go", 'import "fmt"\nfunc main() {}\n', ['import "fmt"']],
    ["Java", ".java", "import java.util.List;\nclass A {}\n", ["import java.util.List;"]],
    ["Rust", ".rs", "use std::fmt;\nfn main() {}\n", ["use std::fmt;"]],
  ])("%s extracts its own import shapes and nothing else", async (_lang, ext, src, expected) => {
    const m = await new FileMetadataExtractor().extractMetadata(src, `/x/f${ext}`, {
      includeSymbols: false,
      includeImports: true,
    });
    expect(m.imports).toEqual(expected);
  });

  test("patterns are anchored, so an indented import is matched on its TRIMMED text", async () => {
    // The loop trims before testing and pushes the trimmed form. A caller
    // reading these back must not expect original indentation.
    const m = await new FileMetadataExtractor().extractMetadata(
      "    import { a } from 'b';\n",
      "/x/f.ts",
      { includeSymbols: false, includeImports: true },
    );
    expect(m.imports).toEqual(["import { a } from 'b';"]);
  });

  test("a mid-line import is NOT matched — the anchor is load-bearing", async () => {
    const m = await new FileMetadataExtractor().extractMetadata(
      "const s = \"import { a } from 'b';\";\n",
      "/x/f.ts",
      { includeSymbols: false, includeImports: true },
    );
    expect(m.imports).toEqual([]);
  });
});

describe("FileMetadataExtractor — symbols", () => {
  test("all three preconditions are required: graph, includeSymbols and projectId", async () => {
    const withGraph = new FileMetadataExtractor(graphReturning(3));
    const noGraph = new FileMetadataExtractor();

    // graph present, flag on, projectId present → populated.
    const yes = await withGraph.extractMetadata("x\n", "/x/f.ts", {
      includeSymbols: true,
      includeImports: false,
      projectId: "p",
    });
    expect(yes.symbols).toEqual({ definitions: 3, references: 0 });

    // Each precondition removed on its own must leave symbols absent.
    const noFlag = await withGraph.extractMetadata("x\n", "/x/f.ts", {
      includeSymbols: false,
      includeImports: false,
      projectId: "p",
    });
    const noProject = await withGraph.extractMetadata("x\n", "/x/f.ts", {
      includeSymbols: true,
      includeImports: false,
    });
    const noService = await noGraph.extractMetadata("x\n", "/x/f.ts", {
      includeSymbols: true,
      includeImports: false,
      projectId: "p",
    });
    expect(noFlag.symbols).toBeUndefined();
    expect(noProject.symbols).toBeUndefined();
    expect(noService.symbols).toBeUndefined();
  });

  test("references is hardcoded 0 — a documented gap, characterized not corrected", async () => {
    const m = await new FileMetadataExtractor(graphReturning(7)).extractMetadata("x\n", "/x/f.ts", {
      includeSymbols: true,
      includeImports: false,
      projectId: "p",
    });
    expect(m.symbols).toEqual({ definitions: 7, references: 0 });
  });

  test("zero definitions still populates the block rather than omitting it", async () => {
    const m = await new FileMetadataExtractor(graphReturning(0)).extractMetadata("x\n", "/x/f.ts", {
      includeSymbols: true,
      includeImports: false,
      projectId: "p",
    });
    // handle() guards its "get_references" tip on `definitions > 0`, so the
    // difference between {definitions:0} and undefined is observable.
    expect(m.symbols).toEqual({ definitions: 0, references: 0 });
  });

  test("relativePath wins over filePath as the query path, because the symbol DB stores relative paths", async () => {
    const seen: { projectId?: string; file?: string; limit?: number } = {};
    const spy = {
      listDefinitions: async (projectId: string, opts: { file: string; limit: number }) => {
        seen.projectId = projectId;
        seen.file = opts.file;
        seen.limit = opts.limit;
        return { definitions: [], total: 0, total_exact: true };
      },
    } as unknown as SymbolGraphService;

    await new FileMetadataExtractor(spy).extractMetadata("x\n", "/abs/root/src/f.ts", {
      includeSymbols: true,
      includeImports: false,
      projectId: "proj",
      relativePath: "src/f.ts",
    });
    expect(seen).toEqual({ projectId: "proj", file: "src/f.ts", limit: 100 });
  });

  test("without relativePath the absolute path is queried — the documented fallback", async () => {
    let asked = "";
    const spy = {
      listDefinitions: async (_p: string, opts: { file: string }) => {
        asked = opts.file;
        return { definitions: [], total: 0, total_exact: true };
      },
    } as unknown as SymbolGraphService;

    await new FileMetadataExtractor(spy).extractMetadata("x\n", "/abs/root/src/f.ts", {
      includeSymbols: true,
      includeImports: false,
      projectId: "proj",
    });
    expect(asked).toBe("/abs/root/src/f.ts");
  });

  // THE BRANCH NO CALLER CAN REACH. Every pre-existing suite stubs
  // listDefinitions to resolve, so a mechanical move that dropped this try/catch
  // would be invisible to all of them while turning a degraded read into a
  // failed one.
  test("a rejecting listDefinitions is swallowed: metadata still returns, symbols absent", async () => {
    const m = await new FileMetadataExtractor(graphThrowing()).extractMetadata(
      "import { a } from 'b';\n",
      "/x/f.ts",
      { includeSymbols: true, includeImports: true, projectId: "p" },
    );
    expect(m.symbols).toBeUndefined();
    // Everything computed BEFORE the failed call must survive it.
    expect(m.language).toBe("TypeScript");
    expect(m.totalLines).toBe(2);
    expect(m.imports).toEqual(["import { a } from 'b';"]);
  });
});

describe("FileMetadataExtractor — the shape the handler spreads", () => {
  test("the minimal result carries exactly totalLines and language", async () => {
    const m: FileMetadata = await new FileMetadataExtractor().extractMetadata("x\n", "/x/f.ts", OPTS);
    // handle() spreads symbols and imports conditionally, so a module that
    // eagerly emitted them as undefined keys would change the response's key
    // set. Asserted as an exact key list rather than key-by-key.
    expect(Object.keys(m).sort()).toEqual(["language", "totalLines"]);
  });
});
