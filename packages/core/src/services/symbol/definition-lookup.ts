import { getSymbolRepository } from "../../data/symbol/symbol-repository-factory.js";
import type {
  DefinitionFqnResolution,
  SymbolDefinition,
  SymbolRepositoryPg,
} from "../../data/symbol/symbol-repository-pg.js";
import { parseStructuralFqn } from "../structural/fqn-codec.js";

export type DefinitionLookupResult =
  | { readonly status: "resolved"; readonly definition: SymbolDefinition }
  | { readonly status: "ambiguous"; readonly legacyFqn: string; readonly candidates: Extract<DefinitionFqnResolution, { ambiguous: true }>['candidates'] }
  | { readonly status: "missing"; readonly query: string }
  | { readonly status: "bare"; readonly query: string; readonly definitions: readonly SymbolDefinition[] };

type LookupRepository = Pick<SymbolRepositoryPg, "resolveDefinitionFqn" | "findDefinitionsByName">;

/** One active-generation lookup contract shared by every graph consumer. */
export class DefinitionLookupService {
  constructor(private readonly repository: () => LookupRepository = getSymbolRepository) {}

  async lookup(projectId: string, query: string): Promise<DefinitionLookupResult> {
    const repo = this.repository();
    if (query.indexOf("#") <= 0) {
      const definitions = await repo.findDefinitionsByName(projectId, query);
      return definitions.length > 0
        ? Object.freeze({ status: "bare", query, definitions: Object.freeze(definitions) })
        : Object.freeze({ status: "missing", query });
    }
    try {
      parseStructuralFqn(query);
    } catch {
      return Object.freeze({ status: "missing", query });
    }
    const result: DefinitionFqnResolution = await repo.resolveDefinitionFqn(projectId, query);
    if (result.found) return Object.freeze({ status: "resolved", definition: result.definition });
    if (result.ambiguous) return Object.freeze({
      status: "ambiguous",
      legacyFqn: result.legacyFqn,
      candidates: result.candidates,
    });
    return Object.freeze({ status: "missing", query });
  }
}

export const definitionLookupService = new DefinitionLookupService();
