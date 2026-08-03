/**
 * @massa-ai/core - File metadata extraction
 *
 * Module 5 of the `tools/read_file.ts` extraction (PR-D, T10). Owns the three
 * private methods `ReadFileTool` used to carry for describing a file's content:
 * `extractMetadata` (the composer), `detectLanguage` (extension → language) and
 * `extractImports` (per-language import scan), together with the `FileMetadata`
 * shape they produce.
 *
 * ALL THREE BODIES ARE MOVED VERBATIM, and so is `interface FileMetadata`.
 *
 * IT NAMES SymbolGraphService AND MODULE 4 DOES NOT, WHICH IS THE WHOLE POINT
 * OF THE 4 → 5 EDGE. `design.md` §5.1 records that `readFileWithCache` calls
 * `extractMetadata` on two of three paths and that `extractMetadata` reaches
 * `symbolGraph.listDefinitions`, so a direct edge would make the file CONTENT
 * cache thread a database-backed collaborator through purely to satisfy this
 * module. `tasks.md` §4.1 decided the mechanism — module 4 takes a
 * `(content, filePath, options) => Promise<FileMetadata>` callback — and
 * rejected inverting the call order on measurement rather than on taste: module
 * 7 pre-computing metadata is eager on all three paths, so every cache HIT
 * would newly run a `listDefinitions` query. That is a behavior change inside a
 * behavior-preserving PR, and the callback keeps the laziness and the
 * legacy-entry write-back exactly where they were.
 *
 * INSTANTIATED PER ReadFileTool, on module 3's precedent. `symbolGraph` is the
 * tool's own optional constructor parameter, forwarded unchanged; a module
 * singleton would have to pick one graph for every tool ever constructed, and
 * the parameter is public surface (`design.md` §3.2, 41 construction sites).
 */
import { logger } from "@massa-ai/shared";
import path from "path";
import type { SymbolGraphService } from "../symbol/symbol-graph.service.js";

export interface FileMetadata {
  totalLines: number;
  language?: string;
  symbols?: {
    definitions: number;
    references: number;
  };
  imports?: string[];
}

export class FileMetadataExtractor {
  constructor(private readonly symbolGraph?: SymbolGraphService) {}

  async extractMetadata(
    content: string,
    filePath: string,
    options: {
      includeSymbols: boolean;
      includeImports: boolean;
      projectId?: string;
      relativePath?: string;
    }
  ): Promise<FileMetadata> {
    const lines = content.split("\n");
    const language = this.detectLanguage(filePath);

    const metadata: FileMetadata = {
      totalLines: lines.length,
      language,
    };

    // Extract imports if requested
    if (options.includeImports && language) {
      metadata.imports = this.extractImports(lines, language);
    }

    // Get symbol metadata if symbol graph available
    if (options.includeSymbols && this.symbolGraph && options.projectId) {
      try {
        // Symbol DB stores relative paths — use original relative path for queries
        const queryPath = options.relativePath || filePath;
        const { definitions } = await this.symbolGraph.listDefinitions(
          options.projectId,
          {
            file: queryPath,
            limit: 100,
          }
        );

        metadata.symbols = {
          definitions: definitions.length,
          references: 0, // Would need separate query
        };
      } catch (error) {
        logger.debug("Failed to get symbol metadata", { filePath, error });
      }
    }

    return metadata;
  }

  private detectLanguage(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      ".ts": "TypeScript",
      ".tsx": "TypeScript",
      ".js": "JavaScript",
      ".jsx": "JavaScript",
      ".vue": "Vue",
      ".py": "Python",
      ".go": "Go",
      ".rs": "Rust",
      ".java": "Java",
      ".cpp": "C++",
      ".c": "C",
      ".h": "C",
      ".hpp": "C++",
      ".cs": "C#",
      ".rb": "Ruby",
      ".php": "PHP",
      ".swift": "Swift",
      ".kt": "Kotlin",
      ".kts": "Kotlin",
      ".scala": "Scala",
      ".md": "Markdown",
      ".json": "JSON",
      ".yaml": "YAML",
      ".yml": "YAML",
      ".xml": "XML",
      ".html": "HTML",
      ".css": "CSS",
      ".scss": "SCSS",
      ".sql": "SQL",
      ".sh": "Shell",
      ".bash": "Shell",
    };
    return languageMap[ext];
  }

  private extractImports(lines: string[], language: string): string[] {
    const imports: string[] = [];

    const importPatterns: Record<string, RegExp> = {
      TypeScript: /^(import\s+.*?from\s+['"]|import\s+['"])/,
      JavaScript: /^(import\s+.*?from\s+['"]|import\s+['"]|require\s*\(\s*['"])/,
      Python: /^(import\s+|from\s+\S+\s+import)/,
      Go: /^import\s+/,
      Java: /^import\s+/,
      Rust: /^use\s+/,
    };

    const pattern = importPatterns[language];
    if (!pattern) return imports;

    for (const line of lines) {
      const trimmed = line.trim();
      if (pattern.test(trimmed)) {
        imports.push(trimmed);
      }
    }

    return imports;
  }
}
