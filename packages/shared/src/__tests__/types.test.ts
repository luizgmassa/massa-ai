/**
 * Types runtime coverage.
 *
 * The type-only modules under src/types carry enums and frozen consts that
 * compile to runtime initializers. This file imports and asserts their values
 * so every enum/const initializer executes (100% line coverage) and the
 * canonical additive symbol taxonomy stays locked.
 */

import { describe, test, expect } from "bun:test";

import {
  MemoryLevel,
  MemoryType,
  CacheLevel,
  CompressionStrategy,
  SearchSource,
  Permission,
  MemoryRelationType,
  CheckpointType,
  TaskStatus,
} from "../types";
import {
  STRUCTURAL_SYMBOL_KINDS,
  STRUCTURAL_SYMBOL_KINDS_DESCRIPTION,
  STRUCTURAL_SYMBOL_KIND_SCHEMA,
  STRUCTURAL_FQN_DESCRIPTION,
} from "../types/structural-transport";

describe("MemoryLevel enum", () => {
  test("numeric levels match the hierarchy contract", () => {
    expect(MemoryLevel.PERSISTENT).toBe(0);
    expect(MemoryLevel.PROJECT).toBe(1);
    expect(MemoryLevel.USER).toBe(2);
    expect(MemoryLevel.SESSION).toBe(3);
    expect(MemoryLevel.WORKING).toBe(4);
  });
});

describe("MemoryType enum", () => {
  test("string values match the supported memory taxonomy", () => {
    expect(MemoryType.CRITICAL).toBe("critical");
    expect(MemoryType.CONVERSATION).toBe("conversation");
    expect(MemoryType.CODE).toBe("code");
    expect(MemoryType.DECISION).toBe("decision");
    expect(MemoryType.PATTERN).toBe("pattern");
  });
});

describe("CacheLevel + CompressionStrategy enums", () => {
  test("L1/L2 numeric ordering", () => {
    expect(CacheLevel.L1).toBe(1);
    expect(CacheLevel.L2).toBe(2);
    expect(CacheLevel.L1).toBeLessThan(CacheLevel.L2);
  });

  test("compression strategy string values", () => {
    expect(CompressionStrategy.CODE_STRUCTURE).toBe("code_structure");
    expect(CompressionStrategy.CONVERSATION_SUMMARY).toBe("conversation_summary");
    expect(CompressionStrategy.SEMANTIC_DEDUP).toBe("semantic_dedup");
    expect(CompressionStrategy.HIERARCHICAL).toBe("hierarchical");
  });
});

describe("SearchSource + Permission enums", () => {
  test("search source string values", () => {
    expect(SearchSource.VECTOR).toBe("vector");
    expect(SearchSource.KEYWORD).toBe("keyword");
    expect(SearchSource.HYBRID).toBe("hybrid");
    expect(SearchSource.CACHE).toBe("cache");
  });

  test("permission string values", () => {
    expect(Permission.READ).toBe("read");
    expect(Permission.WRITE).toBe("write");
    expect(Permission.DELETE).toBe("delete");
    expect(Permission.ADMIN).toBe("admin");
  });
});

describe("MemoryRelationType enum", () => {
  test("relation types are uppercase identifiers", () => {
    expect(MemoryRelationType.DERIVED_FROM).toBe("DERIVED_FROM");
    expect(MemoryRelationType.CONTRADICTS).toBe("CONTRADICTS");
    expect(MemoryRelationType.SUPPORTS).toBe("SUPPORTS");
    expect(MemoryRelationType.RELATES_TO).toBe("RELATES_TO");
    expect(MemoryRelationType.SUPERSEDES).toBe("SUPERSEDES");
    expect(MemoryRelationType.CAUSES).toBe("CAUSES");
    expect(MemoryRelationType.RESOLVES).toBe("RESOLVES");
  });
});

describe("Checkpoint + Task enums", () => {
  test("checkpoint type values", () => {
    expect(CheckpointType.AUTO).toBe("auto");
    expect(CheckpointType.MANUAL).toBe("manual");
    expect(CheckpointType.MILESTONE).toBe("milestone");
  });

  test("task status values", () => {
    expect(TaskStatus.PENDING).toBe("pending");
    expect(TaskStatus.IN_PROGRESS).toBe("in_progress");
    expect(TaskStatus.COMPLETED).toBe("completed");
    expect(TaskStatus.FAILED).toBe("failed");
    expect(TaskStatus.PAUSED).toBe("paused");
  });
});

describe("structural-transport consts", () => {
  test("STRUCTURAL_SYMBOL_KINDS is a non-empty tuple of canonical kinds", () => {
    expect(Array.isArray(STRUCTURAL_SYMBOL_KINDS)).toBe(true);
    expect(STRUCTURAL_SYMBOL_KINDS.length).toBeGreaterThan(0);
    // Representative canonical kinds present.
    expect(STRUCTURAL_SYMBOL_KINDS).toContain("function");
    expect(STRUCTURAL_SYMBOL_KINDS).toContain("class");
    expect(STRUCTURAL_SYMBOL_KINDS).toContain("interface");
    expect(STRUCTURAL_SYMBOL_KINDS).toContain("export");
  });

  test("DESCRIPTION lists every kind", () => {
    for (const kind of STRUCTURAL_SYMBOL_KINDS) {
      expect(STRUCTURAL_SYMBOL_KINDS_DESCRIPTION).toContain(kind);
    }
  });

  test("SCHEMA is a frozen string-enum JSON schema", () => {
    expect(Object.isFrozen(STRUCTURAL_SYMBOL_KIND_SCHEMA)).toBe(true);
    expect(STRUCTURAL_SYMBOL_KIND_SCHEMA.type).toBe("string");
    expect(STRUCTURAL_SYMBOL_KIND_SCHEMA.enum).toEqual(STRUCTURAL_SYMBOL_KINDS);
    expect(STRUCTURAL_SYMBOL_KIND_SCHEMA.description).toBe(
      STRUCTURAL_SYMBOL_KINDS_DESCRIPTION,
    );
  });

  test("FQN description explains legacy ambiguity handling", () => {
    expect(STRUCTURAL_FQN_DESCRIPTION).toContain("Modern structural FQNs");
    expect(STRUCTURAL_FQN_DESCRIPTION).toContain("ambiguity");
  });
});
