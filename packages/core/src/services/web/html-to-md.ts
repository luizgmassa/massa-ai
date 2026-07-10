/**
 * HTML → Markdown conversion + JSON key-path chunking for `fetch_and_index`.
 *
 * - `htmlToMarkdown(html)` strips scripts/styles/nav/etc. and converts the rest
 *   to GitHub-Flavored Markdown (tables, strikethrough, fenced code) via
 *   `turndown` + `turndown-plugin-gfm`. Turndown 7.x bundles `@mixmark-io/domino`
 *   as a DOM implementation, so it works in Bun without a global DOM.
 *
 * - `jsonToKeyPathChunks(json, label?)` walks a parsed JSON value and emits one
 *   markdown chunk per leaf path (e.g. `user.address.city → "Lyon"`). Arrays of
 *   primitives become a bulleted list under their path; arrays of objects fan
 *   out one entry per element. This gives each value a searchable key-path
 *   anchor instead of dumping pretty-printed JSON into one undifferentiated blob.
 */

import TurndownService from "turndown";

/**
 * `turndown-plugin-gfm` ships no TypeScript types and there is no
 * `@types/turndown-plugin-gfm`. An ambient `declare module` declaration file
 * breaks `tsc` emit under this project's `composite: true` setting (TS build
 * info anomaly), so we import the named `gfm` export untyped via a CJS require
 * shim and cast it to the minimal shape we use: a function that registers GFM
 * rules (tables/strikethrough/task-lists) on a TurndownService.
 */
type GfmPlugin = (service: TurndownService) => TurndownService;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const gfm = require("turndown-plugin-gfm").gfm as GfmPlugin;

const STRIP_SELECTORS = ["script", "style", "nav", "header", "footer", "noscript", "iframe"];

/** Lazy singleton TurndownService — built once, reused across calls. */
let tdCache: TurndownService | null = null;
function getTurndown(): TurndownService {
  if (tdCache) return tdCache;
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });
  td.use(gfm);
  // `remove()` drops the matched elements entirely (contents included) before
  // conversion — so inline scripts/styles never reach the markdown output.
  td.remove(STRIP_SELECTORS);
  tdCache = td;
  return td;
}

/**
 * Convert an HTML string to GitHub-Flavored Markdown. Scripts, styles, nav,
 * header, footer, noscript, and iframes are stripped before conversion.
 * Returns the empty string for falsy / whitespace-only input so the caller can
 * treat it as "nothing to index".
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "";
  const md = getTurndown().turndown(html);
  // Collapse runs of blank lines turndown sometimes leaves (3+ → 2) and trim.
  return md.replace(/\n{3,}/g, "\n\n").trim();
}

export interface JsonChunk {
  /** The leaf path, e.g. `items[0].name`. */
  path: string;
  /** Rendered as markdown: `**items[0].name** = \`Lyon\``. */
  content: string;
}

/**
 * Walk a parsed JSON value and emit one chunk per leaf. Object properties
 * descend by key; arrays of objects fan out one entry per element (indexed);
 * arrays of primitives collapse to a single bulleted-list chunk under their
 * path. `null`/`undefined` leaves are skipped (no value to search).
 *
 * Each chunk's `content` is a small markdown snippet with the path bolded as a
 * key anchor so both vector and keyword search can match on the path name.
 */
export function jsonToKeyPathChunks(value: unknown, label = "$"): JsonChunk[] {
  const out: JsonChunk[] = [];
  walk(value, label, out);
  return out;
}

function walk(val: unknown, path: string, out: JsonChunk[]): void {
  if (val === null || val === undefined) return;

  if (Array.isArray(val)) {
    if (val.length === 0) {
      out.push({ path, content: `**${path}** = _[]_` });
      return;
    }
    // Array of objects → fan out one entry per element (keeps each object's
    // fields independently searchable under a stable indexed path).
    if (val.every((v) => v !== null && typeof v === "object")) {
      val.forEach((v, i) => walk(v, `${path}[${i}]`, out));
      return;
    }
    // Array of primitives → one bulleted list chunk under the array path.
    const items = val.map((v) => `- \`${String(v)}\``).join("\n");
    out.push({ path, content: `**${path}**\n\n${items}` });
    return;
  }

  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) {
      out.push({ path, content: `**${path}** = _{}_` });
      return;
    }
    for (const [k, v] of entries) {
      const safeKey = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
      walk(v, `${path}.${safeKey}`, out);
    }
    return;
  }

  // Leaf primitive.
  out.push({ path, content: `**${path}** = \`${String(val)}\`` });
}
