/** Canonical additive symbol taxonomy exposed by HTTP and MCP transports. */
export const STRUCTURAL_SYMBOL_KINDS = [
  "module",
  "namespace",
  "class",
  "interface",
  "trait",
  "enum",
  "function",
  "method",
  "constructor",
  "property",
  "field",
  "variable",
  "constant",
  "type",
  "type_parameter",
  "export",
  "heading",
  "key",
] as const;

export type StructuralSymbolKind = (typeof STRUCTURAL_SYMBOL_KINDS)[number];

export const STRUCTURAL_SYMBOL_KINDS_DESCRIPTION =
  `Canonical graph schema v2 symbol kind. One of: ${STRUCTURAL_SYMBOL_KINDS.join(", ")}.`;

export const STRUCTURAL_SYMBOL_KIND_SCHEMA = Object.freeze({
  type: "string",
  enum: STRUCTURAL_SYMBOL_KINDS,
  description: STRUCTURAL_SYMBOL_KINDS_DESCRIPTION,
});

/** Exact active-generation parser aggregate; never expands per-file diagnostics. */
export interface ParserDiagnosticsSummary {
  diagnosticsCount: number;
  recoveredFiles: number;
  hardFailureFiles: number;
  staleFiles: number;
  languages: Record<string, number>;
}

/** Shared durable-job and project-map parser transport contract. */
export interface ActiveGraphDiagnostics<GenerationId extends string | null = string | null> {
  activatedGraphGenerationId: GenerationId;
  parserDiagnostics: ParserDiagnosticsSummary;
}

/** Stable candidate returned when a legacy structural FQN is ambiguous. */
export interface StructuralFqnCandidate {
  fqn: string;
  file: string;
  name: string;
  displayName: string;
  qualifiedName: string;
  kind: StructuralSymbolKind;
  signatureHash: string;
}

/** One transport shape shared by definition, reference, and trace surfaces. */
export type SymbolIdentityResolution =
  | { readonly status: "resolved"; readonly fqn: string }
  | {
      readonly status: "ambiguous";
      readonly legacyFqn: string;
      readonly candidates: readonly StructuralFqnCandidate[];
    }
  | { readonly status: "missing"; readonly query: string }
  | { readonly status: "bare"; readonly query: string };

export const STRUCTURAL_FQN_DESCRIPTION =
  "Modern structural FQNs resolve exactly. Legacy FQNs return either one exact result or explicit stable ambiguity candidates; ambiguity is never collapsed to not-found or a first match.";
