import type {
  ParseDiagnostic,
  StructuralFailureKind,
} from "./types.js";

export const MAX_STRUCTURAL_DIAGNOSTIC_DETAILS = 10;
const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 500;

export function diagnostic(
  code: string,
  severity: ParseDiagnostic["severity"],
  error: unknown,
): ParseDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return Object.freeze({
    code,
    severity,
    message: message.slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH),
  });
}

export function boundDiagnostics(
  diagnostics: readonly ParseDiagnostic[],
): readonly ParseDiagnostic[] {
  return Object.freeze(diagnostics.slice(0, MAX_STRUCTURAL_DIAGNOSTIC_DETAILS));
}

export function classifyNativeFailure(error: unknown): StructuralFailureKind {
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return text.includes("abi") ||
    text.includes("module version") ||
    text.includes("dlopen")
    ? "abi"
    : "grammar";
}
