/**
 * Shared serializer for tool success-path responses.
 *
 * Owns two concerns that were previously inlined per-tool:
 *   1. `fields` projection (shallow + dotted walk; arrays element-wise)
 *   2. `format` encoding (json raw object | toon string)
 *
 * Contract (plan-critic boundary): wrap ONLY the success-path return of a tool.
 * Error / catch / not-found branches — including any `data:{hint}` on the error
 * branch — are returned directly and MUST NOT pass through this helper. This
 * keeps the error wire-shape byte-identical and avoids projecting/throwing on
 * partial data.
 *
 * Defaults are resolved by the CALLING tool and passed in as literals; this
 * helper never picks a default. The helper only branches on the literal
 * "toon" — anything else (including "json" or undefined) returns the raw object.
 */

import { encode as toTOON } from "@toon-format/toon";
import type { ToolResponse } from "@massa-th0th/shared";

export interface SerializeOpts {
  format?: "json" | "toon";
  fields?: string[];
}

/**
 * Project (and optionally TOON-encode) a tool success-path result.
 *
 * Projection runs BEFORE encoding so `fields` composes with both formats.
 */
export function serializeToolResponse(
  result: unknown,
  opts: SerializeOpts = {},
): ToolResponse {
  const projected = projectFields(result, opts.fields);
  return {
    success: true,
    data: opts.format === "toon" ? toTOON(projected) : projected,
  };
}

/**
 * Field projection per spec AC P3 / design.md §2.
 *
 * - absent/empty `fields` → full data (no projection)
 * - array `data`          → element-wise map
 * - non-object `data`     → unchanged (scalar)
 * - object `data`         → pick present keys; dotted walks via projectPath
 * - unknown key / broken midpath → silently dropped (no throw)
 */
export function projectFields(data: unknown, fields?: string[]): unknown {
  if (!fields || fields.length === 0) return data;
  if (Array.isArray(data)) {
    return data.map((e) => projectFields(e, fields));
  }
  if (data === null || typeof data !== "object") return data;

  const out: Record<string, unknown> = {};
  const src = data as Record<string, unknown>;
  for (const f of fields) {
    const [head, ...rest] = f.split(".");
    if (!(head in src)) continue; // unknown key → silently dropped
    const v = src[head];
    if (rest.length === 0) {
      out[head] = v;
      continue;
    }
    const projected = projectPath(v, rest);
    if (projected === undefined) continue;
    // Merge when multiple dotted fields share a top-level head
    // (e.g. ["impacted.symbol","impacted.risk"] must yield both keys).
    out[head] = mergeProjection(out[head], projected);
  }
  return out;
}

/**
 * Walk the dotted remainder of a single field path and rebuild a nested
 * single-key projection. Per spec AC P3.2, projecting `["nodes.symbol"]` over
 * `nodes:[{symbol,kind,...}]` yields `{nodes:[{symbol},{symbol}]}` — each
 * element keeps ONLY the requested key, not the bare scalar.
 *
 * - arrays recurse element-wise
 * - missing midpoint / primitive midpoint → drop (return undefined, key absent)
 * - leaf returns the value; intermediate wraps under its head key
 * - merges with any prior projection sharing a segment (so
 *   `["impacted.symbol","impacted.risk"]` yields both keys per element)
 */
function projectPath(value: unknown, restKeys: string[]): unknown {
  if (restKeys.length === 0) return value;
  if (Array.isArray(value)) {
    return value.map((e) => projectPath(e, restKeys));
  }
  if (value === null || typeof value !== "object") return undefined;
  const [head, ...rest] = restKeys;
  const src = value as Record<string, unknown>;
  if (!(head in src)) return undefined;
  const child = src[head];
  if (rest.length === 0) {
    // leaf: wrap the value under its key so callers see {head: value}, not bare.
    return Array.isArray(child)
      ? child.map((e) => ({ [head]: e }))
      : { [head]: child };
  }
  const inner = projectPath(child, rest);
  if (inner === undefined) return undefined;
  return { [head]: inner };
}

/**
 * Merge two projections that share a top-level key. Two cases:
 *  - arrays → element-wise object merge (so ["impacted.symbol","impacted.risk"]
 *    yields each element with both symbol and risk)
 *  - plain objects → shallow key merge (later wins on conflict, but dotted
 *    projections target distinct sub-keys so conflicts are rare)
 *  - otherwise → later wins
 */
function mergeProjection(a: unknown, b: unknown): unknown {
  if (a === undefined) return b;
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    const out: unknown[] = [];
    for (let i = 0; i < len; i++) {
      out.push(mergeProjection(a[i], b[i]));
    }
    return out;
  }
  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    return { ...(a as Record<string, unknown>), ...(b as Record<string, unknown>) };
  }
  return b;
}
