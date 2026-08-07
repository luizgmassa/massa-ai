/**
 * NUL sanitization at the ETL read boundary (Track 2).
 *
 * PostgreSQL text/jsonb columns reject 0x00, so DiscoverStage strips NULs at
 * its single read site — before content-hashing, so the stored hash matches
 * the stored (NUL-free) content. Also covers the stripNul kernel leaf and the
 * LoadStage fileErrors cap.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stripNul } from "../kernel/sanitize/strip-nul.js";
import { DiscoverStage } from "../services/etl/stages/discover.js";
import { LoadStage, MAX_FILE_ERRORS } from "../services/etl/stages/load.js";
import type { EtlStageContext, ResolvedFile } from "../services/etl/stage-context.js";

describe("stripNul kernel leaf", () => {
  test("removes every NUL byte and only NUL bytes", () => {
    expect(stripNul("a\0b\0\0c")).toBe("abc");
    expect(stripNul("\0")).toBe("");
  });

  test("returns the same string when no NUL is present (tabs/newlines untouched)", () => {
    const clean = "line1\n\tline2\r\n";
    expect(stripNul(clean)).toBe(clean);
  });
});

describe("DiscoverStage NUL-bearing fixture", () => {
  let projectPath: string;

  beforeAll(async () => {
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "etl-nul-"));
    await fs.writeFile(path.join(projectPath, "nul-file.ts"), "const a = 1;\0\0\nconst b = 2;\n");
    await fs.writeFile(path.join(projectPath, "clean.ts"), "export const c = 3;\n");
  });

  afterAll(async () => {
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  test("discovered content is NUL-free and the hash matches the stripped content", async () => {
    const ctx = {
      projectId: `nul-${randomUUID()}`,
      projectPath,
      jobId: "job-nul",
      emit: () => {},
    } as unknown as EtlStageContext;

    const discovered = await new DiscoverStage().run(ctx, { forceReindex: true });
    const nulFile = discovered.find((file) => file.relativePath === "nul-file.ts");
    expect(nulFile).toBeDefined();
    expect(nulFile!.snapshotContent.includes("\0")).toBe(false);
    expect(nulFile!.snapshotContent).toBe("const a = 1;\nconst b = 2;\n");
    expect(nulFile!.contentHash).toBe(
      createHash("sha256").update(nulFile!.snapshotContent).digest("hex"),
    );
  });
});

describe("LoadStage fileErrors cap", () => {
  test(`records at most ${MAX_FILE_ERRORS} per-file errors while counting every failure`, async () => {
    const load = new LoadStage() as any;
    load.vectorStore = {
      addDocuments: async () => {
        throw new Error("vector store down");
      },
    };
    load.keywordSearch = { addBatch: async () => {} };

    const total = MAX_FILE_ERRORS + 5;
    const files: ResolvedFile[] = Array.from({ length: total }, (_, index) => ({
      file: {
        absolutePath: `/tmp/f${index}.ts`,
        relativePath: `src/f${index}.ts`,
        mtime: 1,
        size: 10,
        contentHash: `hash-${index}`,
        snapshotContent: "const x = 1;",
        needsReparse: true,
      },
      chunks: [{ content: "const x = 1;", type: "code", lineStart: 1, lineEnd: 1, label: "" }],
      symbols: [],
      edges: [],
      imports: [],
      diagnostics: [],
      resolvedImports: [],
      resolvedEdges: [],
    }) as unknown as ResolvedFile);

    const ctx = {
      projectId: "cap-project",
      projectPath: "/tmp",
      jobId: "job-cap",
      emit: () => {},
    } as unknown as EtlStageContext;

    // "semantic" mode: symbol-DB writes are skipped, so the only per-file work
    // is the (failing) search-store load — no database required.
    const result = await load.run(ctx, files, "semantic", false);
    expect(result.errors).toBe(total);
    expect(result.fileErrors).toHaveLength(MAX_FILE_ERRORS);
    expect(result.fileErrors[0]).toEqual({ filePath: "src/f0.ts", error: "vector store down" });
    expect(result.filesLoaded).toBe(0);
  });
});
