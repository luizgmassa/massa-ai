/**
 * Minimal charter-shaped YAML frontmatter parser, extracted verbatim from
 * `scripts/generate-subagent-artifacts.ts` (AD: agent-runtime-drift T02).
 *
 * One parser, two consumers: the artifact generator (writes variants) and the
 * profile-switch doctor (reads installed variants/actives). A second parser
 * would let the writer and the reader disagree about what `model:` means —
 * the exact drift class this feature exists to expose.
 *
 * Scope is deliberately narrow: flat keys plus ONE level of nesting
 * (`metadata:`), string scalars, no lists, no anchors. The charters and the
 * generated agent files are the only inputs; anything richer is refused by
 * being ignored, and the doctor treats a missing key as null rather than
 * guessing.
 */

export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) {
    throw new Error("charter missing YAML frontmatter (--- ... ---) block");
  }
  const yamlText = match[1] ?? "";
  const body = (match[2] ?? "").replace(/^\r?\n/, "");
  const frontmatter = parseSimpleYaml(yamlText);
  return { frontmatter, body };
}

export function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1] as string;
    const rest = (m[2] ?? "").trim();
    if (rest !== "") {
      result[key] = unquoteScalar(rest);
      i++;
      continue;
    }
    // Nested mapping (e.g. metadata: block). Only one level of nesting is
    // used by the charters (metadata.permission).
    const nested: Record<string, unknown> = {};
    i++;
    while (i < lines.length) {
      const nestedLine = lines[i] ?? "";
      if (/^\s{2,}\S/.test(nestedLine) === false) break;
      const nm = /^\s{2,}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(nestedLine);
      if (!nm) break;
      nested[nm[1] as string] = unquoteScalar((nm[2] ?? "").trim());
      i++;
    }
    result[key] = nested;
  }
  return result;
}

export function unquoteScalar(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}
