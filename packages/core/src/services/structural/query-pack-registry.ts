import type {
  LanguageManifestEntry,
  StructuralCapability,
  StructuralCapabilityRequirement,
  StructuralSymbolKind,
} from "./types.js";
import {
  JAVASCRIPT_QUERY_PACK,
  TYPESCRIPT_QUERY_PACK,
} from "./query-packs/typescript.js";
import { SCRIPTING_QUERY_PACKS } from "./query-packs/scripting.js";
import { SYSTEMS_QUERY_PACKS } from "./query-packs/systems.js";
import { MANAGED_QUERY_PACKS } from "./query-packs/managed.js";
import { FUNCTIONAL_QUERY_PACKS } from "./query-packs/functional.js";
import { DATA_DOCUMENT_QUERY_PACKS } from "./query-packs/data-document.js";

export interface StructuralQueryPack {
  readonly version: string;
  readonly dialects: readonly string[];
  readonly querySources: readonly string[];
  readonly family?: "typescript" | "python" | "ruby" | "php" | "lua" | "c" | "cpp" | "go" | "rust" | "zig" |
    "java" | "kotlin" | "scala" | "csharp" | "swift" | "dart" |
    "elixir" | "erlang" | "clojure" | "ocaml" | "haskell" |
    "vue" | "markdown" | "json" | "yaml";
}

const QUERY_PACKS = new Map<string, StructuralQueryPack>(
  [...TYPESCRIPT_QUERY_PACK.dialects.map((dialect) => [dialect, TYPESCRIPT_QUERY_PACK] as const),
   ...JAVASCRIPT_QUERY_PACK.dialects.map((dialect) => [dialect, JAVASCRIPT_QUERY_PACK] as const),
   ...SCRIPTING_QUERY_PACKS.flatMap((pack) => pack.dialects.map((dialect) => [dialect, pack] as const)),
   ...SYSTEMS_QUERY_PACKS.flatMap((pack) => pack.dialects.map((dialect) => [dialect, pack] as const)),
   ...MANAGED_QUERY_PACKS.flatMap((pack) => pack.dialects.map((dialect) => [dialect, pack] as const)),
   ...FUNCTIONAL_QUERY_PACKS.flatMap((pack) => pack.dialects.map((dialect) => [dialect, pack] as const)),
   ...DATA_DOCUMENT_QUERY_PACKS.flatMap((pack) => pack.dialects.map((dialect) => [dialect, pack] as const))],
);

export const SYMBOL_KINDS = new Set<StructuralSymbolKind>([
  "class", "function", "method", "variable", "interface",
  "enum", "type", "namespace", "module", "property", "field", "type_parameter",
  "trait", "constructor", "constant", "export", "heading", "key",
]);

export type QueryCapabilityContract = Readonly<
  Record<StructuralCapability, StructuralCapabilityRequirement>
>;

export const ALL_REQUIRED_CAPABILITIES = Object.freeze({
  declarations: "required",
  documentation: "required",
  imports: "required",
  type_relations: "required",
  calls: "required",
  data_flow: "required",
  specialized_edges: "required",
} satisfies Record<StructuralCapability, StructuralCapabilityRequirement>);

export function enabled(capabilities: QueryCapabilityContract, capability: StructuralCapability): boolean {
  return capabilities[capability] === "required";
}

export function queryPackFor(language: LanguageManifestEntry): StructuralQueryPack {
  const pack = QUERY_PACKS.get(language.dialect);
  if (!pack || pack.version !== language.queryPackVersion) {
    throw new Error(`structural_query_pack_unavailable:${language.dialect}@${language.queryPackVersion}`);
  }
  return pack;
}

export function structuralQueryPackForDialect(dialect: string): StructuralQueryPack | undefined {
  return QUERY_PACKS.get(dialect);
}

export { QUERY_PACKS };
