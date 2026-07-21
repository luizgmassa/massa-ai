export type SearchFailureCode =
  | "SEARCH_BACKEND_UNAVAILABLE"
  | "STORE_CORRUPTION";

export type SearchDegradationCode =
  | "QUERY_UNDERSTANDING_UNAVAILABLE"
  | "TRIGRAM_UNAVAILABLE"
  | "FUZZY_SEARCH_UNAVAILABLE"
  | "PROXIMITY_RERANK_UNAVAILABLE"
  | "GRAPH_AUGMENTATION_UNAVAILABLE"
  | "SYNAPSE_UNAVAILABLE"
  | "SEARCH_AUDIT_UNAVAILABLE"
  | "SEARCH_ANALYTICS_UNAVAILABLE";

export interface SearchDegradation {
  code: SearchDegradationCode;
  component: string;
  message: string;
}

export type SearchDegradationReporter = (
  code: SearchDegradationCode,
  component: string,
) => void;

export interface SearchDegradationDiagnostic extends SearchDegradation {
  kind: "degradation";
  projectId: string;
  timestamp: string;
}

export interface SearchFailureDiagnostic {
  kind: "failure";
  code: SearchFailureCode;
  component: string;
  message: string;
  projectId: string;
  timestamp: string;
}

export type SearchDiagnostic =
  | SearchDegradationDiagnostic
  | SearchFailureDiagnostic;

const MAX_DIAGNOSTICS = 100;
const diagnostics: SearchDiagnostic[] = [];
const recordedFailures = new WeakSet<SearchServiceError>();

const DEGRADATION_MESSAGES: Record<SearchDegradationCode, string> = {
  QUERY_UNDERSTANDING_UNAVAILABLE: "Query understanding was unavailable; original query used",
  TRIGRAM_UNAVAILABLE: "Trigram enrichment was unavailable",
  FUZZY_SEARCH_UNAVAILABLE: "Fuzzy enrichment was unavailable",
  PROXIMITY_RERANK_UNAVAILABLE: "Proximity reranking was unavailable; fused order preserved",
  GRAPH_AUGMENTATION_UNAVAILABLE: "Graph augmentation was unavailable",
  SYNAPSE_UNAVAILABLE: "Synapse enrichment was unavailable; stateless results used",
  SEARCH_AUDIT_UNAVAILABLE: "Search event auditing was unavailable",
  SEARCH_ANALYTICS_UNAVAILABLE: "Search analytics were unavailable",
};

export class SearchServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: SearchFailureCode,
    readonly component: string,
    options?: { cause?: unknown; statusCode?: number },
  ) {
    super(
      code === "STORE_CORRUPTION"
        ? "Stored data is invalid"
        : "A required search backend is unavailable",
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "SearchServiceError";
    this.statusCode = options?.statusCode ?? 503;
  }
}

export function searchBackendUnavailable(
  component: string,
  cause: unknown,
): SearchServiceError {
  return cause instanceof SearchServiceError
    ? cause
    : new SearchServiceError("SEARCH_BACKEND_UNAVAILABLE", component, { cause });
}

export function storeCorruption(
  component: string,
  cause: unknown,
): SearchServiceError {
  return cause instanceof SearchServiceError
    ? cause
    : new SearchServiceError("STORE_CORRUPTION", component, {
        cause,
        statusCode: 500,
      });
}

export function recordSearchDegradation(
  code: SearchDegradationCode,
  component: string,
  projectId: string,
): SearchDegradation {
  const degradation: SearchDegradation = {
    code,
    component,
    message: DEGRADATION_MESSAGES[code],
  };
  diagnostics.push({
    kind: "degradation",
    ...degradation,
    projectId,
    timestamp: new Date().toISOString(),
  });
  if (diagnostics.length > MAX_DIAGNOSTICS) {
    diagnostics.splice(0, diagnostics.length - MAX_DIAGNOSTICS);
  }
  return degradation;
}

export function recordSearchFailure(
  error: SearchServiceError,
  projectId: string,
): void {
  if (recordedFailures.has(error)) return;
  recordedFailures.add(error);
  diagnostics.push({
    kind: "failure",
    code: error.code,
    component: error.component,
    message: error.message,
    projectId,
    timestamp: new Date().toISOString(),
  });
  if (diagnostics.length > MAX_DIAGNOSTICS) {
    diagnostics.splice(0, diagnostics.length - MAX_DIAGNOSTICS);
  }
}

export function getSearchDiagnostics(): readonly SearchDiagnostic[] {
  return diagnostics.map((diagnostic) => ({ ...diagnostic }));
}

/** Test-only reset; production callers consume snapshots only. */
export function resetSearchDiagnosticsForTests(): void {
  diagnostics.length = 0;
}
