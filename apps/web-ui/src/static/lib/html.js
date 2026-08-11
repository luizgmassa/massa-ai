/**
 * HTML string primitives shared by every renderer.
 *
 * These are the leaves of the render graph: they import nothing from the app
 * and every view module depends on them. Kept together because `errorBlock` and
 * `renderGuideText` are both "escape, then wrap" — splitting them from
 * `escapeHtml` would spread one subject over three files for no read benefit.
 */

export function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

export function errorBlock(data) {
  const raw = (data && data.error) || "Request failed.";
  const msg = typeof raw === "string"
    ? raw
    : (raw && typeof raw === "object" && (raw.message || raw.code))
      ? [raw.code, raw.message].filter(Boolean).join(": ")
      : JSON.stringify(raw);
  return '<div class="error">' + escapeHtml(msg) + "</div>";
}

/**
 * Renders a Field guide `dd` value (T12, APUX-09/APUX-11, design D-6): escapes
 * the whole string first, then turns any `` `backtick` `` span into `<code>`.
 * The guide strings themselves carry the backtick markers around their
 * machine tokens (env-style URLs, model ids, paths, identifiers) — chosen
 * over a token-matching regex because it is small and fully deterministic:
 * every wrapped span is one this function's own caller opted into, not a
 * pattern guess that could over- or under-match prose.
 */
export function renderGuideText(s) {
  const escaped = escapeHtml(s);
  return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
}
