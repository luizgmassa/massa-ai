/**
 * Shared enum/finite-set validation for tool handlers.
 *
 * Replaces silent-fallback `default:` branches with a teaching error that
 * lists the valid values, so clients learn the contract instead of silently
 * receiving an empty or wrong-shaped response.
 *
 * Precedent: `get_analytics.ts:109-114` returned `{success:false, error}` on
 * an unknown `type`. This module extends that pattern to every tool handler
 * with an enum/finite-set param and standardizes the error shape as a throw
 * (not a return) so the MCP/HTTP transport can map it to a 400.
 */

/**
 * Error thrown by tool handlers when a user-supplied param is invalid.
 *
 * `statusCode` defaults to 400 (bad request). The MCP layer maps this to
 * `isError: true`; the HTTP layer maps it to the matching HTTP status.
 */
export class ToolError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = "ToolError";
    this.statusCode = statusCode;
  }
}

/**
 * Validate that `value` is a string member of the finite set `validValues`.
 *
 * On success, returns `value` narrowed to `T`. On failure, throws a
 * `ToolError` whose message lists every valid value, so the caller can surface
 * the teaching error to the agent/client without a separate lookup.
 *
 * @example
 *   const scope = validateEnum("scope", p.scope, ["unstaged","staged","committed","all"] as const);
 *
 * Throws `ToolError("Invalid <paramName> value: <received>. Valid values: <a, b, c>.")`
 * when `value` is not a string or not a member of `validValues`.
 */
export function validateEnum<T extends string>(
  paramName: string,
  value: unknown,
  validValues: readonly T[],
): T {
  if (typeof value !== "string" || !validValues.includes(value as T)) {
    throw new ToolError(
      `Invalid ${paramName} value: ${String(value)}. Valid values: ${validValues.join(", ")}.`,
    );
  }
  return value as T;
}