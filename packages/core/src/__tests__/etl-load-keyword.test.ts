import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ResolvedFile } from "../services/etl/stage-context.js";

const vectorBatches: unknown[][] = [];
const keywordBatches: unknown[][] = [];
const fingerprintWrites: unknown[] = [];

mock.module("../data/vector/vector-store-factory.js", () => ({
  getVectorStore: async () => ({
    addDocuments: async (documents: unknown[]) => {
      vectorBatches.push(documents);
    },
  }),
}));

mock.module("../data/keyword/keyword-search-factory.js", () => ({
  getKeywordSearch: () => ({
    addBatch: async (documents: unknown[]) => {
      keywordBatches.push(documents);
    },
    index: async () => {},
  }),
}));

mock.module("../data/symbol/symbol-repository-factory.js", () => ({
  getSymbolRepository: () => ({
    writeFileSymbols: async () => {},
    upsertFile: async (file: unknown) => {
      fingerprintWrites.push(file);
    },
  }),
}));

const { LoadStage } = await import("../services/etl/stages/load.js");

function resolvedFile(): ResolvedFile {
  return {
    file: {
      absolutePath: "/repo/src/needle.ts",
      relativePath: "src/needle.ts",
      mtime: 123,
      size: 42,
      contentHash: "hash",
      needsReparse: true,
    },
    chunks: [
      {
        content: "export function uniquelyNamedNeedle() { return 'found'; }",
        lineStart: 1,
        lineEnd: 1,
        type: "code_block",
        label: "uniquelyNamedNeedle",
      },
      {
        content: "const secondChunk = true;",
        lineStart: 2,
        lineEnd: 2,
        type: "code_block",
      },
    ],
    symbols: [],
    rawImports: [],
    rawEdges: [],
    resolvedImports: [],
    resolvedEdges: [],
  };
}

describe("ETL LoadStage lexical indexing", () => {
  beforeEach(() => {
    vectorBatches.length = 0;
    keywordBatches.length = 0;
    fingerprintWrites.length = 0;
  });

  test("writes the same project-scoped chunks to vector and keyword stores", async () => {
    const result = await new LoadStage().run(
      {
        projectId: "pg-project",
        projectPath: "/repo",
        jobId: "job-1",
        emit: () => {},
      },
      [resolvedFile()],
    );

    expect(result).toMatchObject({ filesLoaded: 1, chunksLoaded: 2, errors: 0 });
    expect(keywordBatches).toEqual(vectorBatches);
    expect(keywordBatches[0]).toEqual([
      expect.objectContaining({
        id: "pg-project:src/needle.ts:0",
        metadata: expect.objectContaining({
          projectId: "pg-project",
          filePath: "src/needle.ts",
          chunkIndex: 0,
          totalChunks: 2,
        }),
      }),
      expect.objectContaining({
        id: "pg-project:src/needle.ts:1",
        metadata: expect.objectContaining({ projectId: "pg-project", chunkIndex: 1 }),
      }),
    ]);
    expect(fingerprintWrites).toHaveLength(1);
  });
});
