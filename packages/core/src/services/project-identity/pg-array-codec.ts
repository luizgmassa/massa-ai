/**
 * pg-array-codec — canonical handling of PostgreSQL text-array identity
 * payloads. Production reality (pinned by the T6 owned-PG gate): the
 * `memories.tags` identity payload column is TEXT holding a PG array LITERAL
 * (`{alpha,beta}`), because the Prisma adapter does not map OID 1009 to a
 * native type (see memory-repository-pg.ts). A genuine text[] column arrives
 * from the driver as a JS array instead. Both representations must parse,
 * rewrite, and serialize round-trip — or the planner flags false
 * `malformed_payload` conflicts and apply silently skips the rewrite.
 */

/**
 * Parse a text-array value: JS array (text[] driver) or PG array literal
 * string (TEXT column). Returns undefined when the value is NEITHER — that is
 * the only malformed case; empty literal `{}` is a valid empty array.
 */
export function parsePgArrayLiteral(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "string") ? [...value] : undefined;
  }
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (s === "{}" || s === "") return [];
  if (!(s.startsWith("{") && s.endsWith("}"))) return undefined;

  const inner = s.slice(1, -1);
  if (inner === "") return [];
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  let escape = false;
  let tokenQuoted = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (escape) {
      cur += ch;
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      tokenQuoted = true;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(normalizeToken(cur, tokenQuoted));
      cur = "";
      tokenQuoted = false;
      continue;
    }
    cur += ch;
  }
  if (inQuotes) return undefined; // unterminated quoted element
  out.push(normalizeToken(cur, tokenQuoted));
  return out;
}

/** Unquoted `NULL` (case-insensitive) is the SQL null element → empty string. */
function normalizeToken(token: string, wasQuoted: boolean): string {
  return !wasQuoted && token.toUpperCase() === "NULL" ? "" : token;
}

/**
 * Serialize string items to a PG array literal for TEXT columns. Elements
 * that are empty, contain separators/quotes/braces/backslashes/whitespace, or
 * look like the NULL token are quoted (and escaped) so the literal round-
 * trips through the parser unchanged.
 */
export function toPgArrayLiteral(items: readonly string[]): string {
  const encode = (item: string): string => {
    const needsQuotes =
      item === "" ||
      /[",{}\\\s]/.test(item) ||
      item.toUpperCase() === "NULL";
    if (!needsQuotes) return item;
    return `"${item.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  };
  return `{${items.map(encode).join(",")}}`;
}
