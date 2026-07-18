import { SourceIndex } from "./source-span.js";
import { buildSymbols } from "./symbol-signature.js";
import {
  StructuralQueryPack,
  QueryCapabilityContract,
  ALL_REQUIRED_CAPABILITIES,
  enabled,
  queryPackFor,
} from "./query-pack-registry.js";
import type {
  NormalizedStructuralEdge,
  NormalizedStructure,
} from "./types.js";
import type {
  StructuralQueryContext,
  StructuralQueryExecutor,
  StructuralQueryTree,
} from "./structural-runtime.js";
import {
  normalizeQueryCaptures,
  buildImports,
  buildCallEdges,
  buildSyntaxEdges,
  dedupeEdges,
  functionalCaptures,
  collectEmbeddedChildren,
  unresolved,
} from "./query-pack-captures.js";

export type { StructuralQueryPack, QueryCapabilityContract } from "./query-pack-registry.js";
export { structuralQueryPackForDialect } from "./query-pack-registry.js";
export { normalizeQueryCaptures };

export function executeQueryPack(
  pack: StructuralQueryPack,
  tree: StructuralQueryTree,
  source: Buffer,
  context: StructuralQueryContext,
  capabilities: QueryCapabilityContract = ALL_REQUIRED_CAPABILITIES,
): NormalizedStructure {
  collectEmbeddedChildren(pack, tree, source, context);
  const captures = functionalCaptures(normalizeQueryCaptures(pack.querySources.flatMap((querySource) =>
    context.query(querySource, tree.rootNode),
  )), source, pack.family);
  const index = new SourceIndex(source);
  const imports = enabled(capabilities, "imports") ? buildImports(captures, source, index, pack.family) : Object.freeze([]);
  const importEdges: NormalizedStructuralEdge[] = imports.map((item) => ({
    kind: "import",
    span: item.span,
    target: unresolved(item.specifier),
    metadata: Object.freeze({ bindings: item.bindings, names: item.names, typeOnly: item.typeOnly }),
  }));
  return Object.freeze({
    symbols: enabled(capabilities, "declarations")
      ? buildSymbols(captures, source, index, enabled(capabilities, "documentation"), pack.family)
      : Object.freeze([]),
    edges: dedupeEdges([
      ...buildCallEdges(captures, source, index, capabilities),
      ...(enabled(capabilities, "type_relations") ? buildSyntaxEdges(captures, source, index) : []),
      ...importEdges,
    ]),
    imports,
  });
}

export const executeStructuralQueryPack: StructuralQueryExecutor = (
  tree,
  source,
  language,
  context,
) => executeQueryPack(queryPackFor(language), tree, source, context, language.capabilities);
