/**
 * Search Definitions Tool (search_definitions)
 *
 * Browse symbols (functions, classes, types, etc.) in a project.
 * Uses the Symbol Graph's PostgreSQL index for fast, exact results.
 */

import {
  IToolHandler,
  STRUCTURAL_SYMBOL_KINDS,
  STRUCTURAL_SYMBOL_KIND_SCHEMA,
  ToolResponse,
} from "@massa-th0th/shared";
import { symbolGraphService } from "../services/symbol/symbol-graph.service.js";
import { validateEnum } from "./enum-validation.js";

interface SearchDefinitionsParams {
  projectId: string;
  query?: string;
  kind?: string[];
  file?: string;
  exportedOnly?: boolean;
  maxResults?: number;
}

export class SearchDefinitionsTool implements IToolHandler {
  name = "search_definitions";
  description =
    "Search for symbol definitions (functions, classes, variables, types, interfaces) in an indexed project. Returns name, kind, file location, and doc comments.";

  inputSchema = {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "The project ID to search in",
      },
      query: {
        type: "string",
        description: "Substring search on symbol name (case-insensitive)",
      },
      kind: {
        type: "array",
        items: STRUCTURAL_SYMBOL_KIND_SCHEMA,
        description: "Filter by symbol kind",
      },
      file: {
        type: "string",
        description: "Filter by file path (relative to project root)",
      },
      exportedOnly: {
        type: "boolean",
        description: "Return only exported symbols",
        default: false,
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (default: 20)",
        default: 20,
      },
    },
    required: ["projectId"],
  };

  async handle(params: unknown): Promise<ToolResponse> {
    const {
      projectId,
      query,
      kind,
      file,
      exportedOnly = false,
      maxResults = 20,
    } = params as SearchDefinitionsParams;

    // Validate each kind entry against the 18 canonical structural kinds.
    // Empty/missing kind is allowed (no filter); an invalid kind string
    // teaching-errors immediately with the full valid-values list.
    const validatedKind = kind
      ? kind.map((k) =>
          validateEnum<typeof STRUCTURAL_SYMBOL_KINDS[number]>(
            "kind",
            k,
            STRUCTURAL_SYMBOL_KINDS,
          ),
        )
      : undefined;

    try {
      const definitions = await symbolGraphService.listDefinitions(projectId, {
        search: query,
        kind: validatedKind,
        file,
        exportedOnly,
        limit: maxResults,
      });

      return {
        success: true,
        data: {
          definitions: definitions.map((d) => ({
            fqn: d.fqn,
            name: d.name,
            kind: d.kind,
            file: d.file,
            lineStart: d.lineStart,
            lineEnd: d.lineEnd,
            exported: d.exported,
            docComment: d.docComment,
            centralityScore: d.centralityScore,
          })),
          total: definitions.length,
          projectId,
          query: query ?? null,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to search definitions: ${(error as Error).message}`,
      };
    }
  }
}
