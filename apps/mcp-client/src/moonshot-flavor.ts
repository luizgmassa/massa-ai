/**
 * Moonshot flavor transport wrapper (Wave 5 FR-17 / AC-14).
 *
 * Pure, transport-only schema strip. When `flavor=moonshot`, root-level
 * JSON Schema combinators (`allOf`, `anyOf`, `oneOf`, and `$ref` that point
 * at a combinator-only fragment) are removed from each tool's `inputSchema`.
 * No schema is rewritten in storage; the wrapper mutates only the response
 * object sent over the wire. Today's schema has no combinators, so this is a
 * no-op until a combinator is introduced.
 *
 * The strip is deliberately shallow (root-level only): nested combinators
 * inside `properties` are preserved so the tool remains callable. Only the
 * top-level `allOf`/`anyOf`/`oneOf` keys (which some validators reject) are
 * dropped.
 */

/** JSON Schema combinators stripped at the root level by moonshot flavor. */
const ROOT_COMBINATORS = ["allOf", "anyOf", "oneOf"] as const;

/** A tool entry as returned by `tools/list`. */
export interface FlavorToolEntry {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** The shape returned by `pageToolDefinitions` / `tools/list`. */
export interface FlavorToolsListResult {
  tools: FlavorToolEntry[];
  nextCursor?: string;
}

/**
 * Determine whether a `$ref` points at a combinator-only fragment. A root
 * `$ref` is stripped only when it resolves to an object that is itself a
 * combinator (e.g. `{"$ref": "#/definitions/MyAnyOf"}` where `MyAnyOf` is
 * `{"anyOf": [...]}`). Since the transport wrapper does not resolve refs
 * (no schema registry on the client), a root-level `$ref` is conservatively
 * stripped under moonshot flavor because Moonshot's validator rejects
 * top-level refs it cannot inline.
 */
function isRootRefStrippable(ref: string | undefined): boolean {
  return typeof ref === "string" && ref.length > 0;
}

/**
 * Strip root-level JSON Schema combinators from a single tool's inputSchema.
 * Returns a shallow-cloned schema with `allOf`/`anyOf`/`oneOf` removed and
 * a root-level `$ref` dropped (Moonshot cannot resolve client-side refs at
 * the root). Nested keys (`properties`, `required`, etc.) are preserved.
 *
 * Mutates a clone, never the original (transport-only).
 */
export function stripMoonshotCombinators(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (ROOT_COMBINATORS.includes(key as (typeof ROOT_COMBINATORS)[number])) {
      continue; // drop root-level combinator
    }
    if (key === "$ref" && isRootRefStrippable(value as string | undefined)) {
      continue; // drop root-level $ref (Moonshot cannot inline client-side)
    }
    stripped[key] = value;
  }
  return stripped;
}

/**
 * Apply the moonshot flavor to a `tools/list` result. Returns a new result
 * object with each tool's `inputSchema` stripped of root-level combinators.
 * The input is not mutated.
 *
 * When `flavor` is falsy or not `"moonshot"`, the input is returned unchanged
 * (same reference — no clone, no work).
 */
export function applyMoonshotFlavor<T extends FlavorToolsListResult>(
  result: T,
  flavor: string | undefined,
): T {
  if (flavor !== "moonshot") return result;
  return {
    ...result,
    tools: result.tools.map((tool) => ({
      ...tool,
      inputSchema: stripMoonshotCombinators(tool.inputSchema),
    })),
  } as T;
}

/**
 * Resolve the flavor from a `tools/list` request. Per FR-17, the flavor may
 * arrive via `_meta.flavor` (MCP request metadata) or as a query-style param
 * `?flavor=moonshot`. The MCP SDK passes `_meta` under `request.params._meta`;
 * some transports also surface query params on the request object.
 */
export function resolveFlavor(request: {
  params?: { _meta?: Record<string, unknown> } & Record<string, unknown>;
}): string | undefined {
  const meta = request.params?._meta;
  if (meta && typeof meta.flavor === "string") return meta.flavor;
  const paramFlavor = request.params?.flavor;
  if (typeof paramFlavor === "string") return paramFlavor;
  return undefined;
}