/**
 * NUL-byte stripper — kernel leaf.
 *
 * PostgreSQL `text`/`jsonb` reject NUL bytes (`22P05 unsupported Unicode
 * escape sequence` / `0x00 invalid byte`), so any file content that reaches a
 * text column with an embedded `\0` aborts that write. Applied at the single
 * ETL read site (discover's `processFile`, before content-hashing, so stored
 * hashes stay consistent with stored content).
 *
 * Deliberately NOT `shared/utils/sanitizer.ts` — that strips the whole
 * control-character range including newlines and tabs, which would corrupt
 * source content.
 */
export function stripNul(content: string): string {
  return content.includes("\0") ? content.replaceAll("\0", "") : content;
}
