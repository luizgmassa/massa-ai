/**
 * Search tab — full-text + semantic memory search.
 */

import { escapeHtml, errorBlock } from "../lib/html.js";
import { markdownToHtml } from "../lib/markdown.js";

interface SearchState {
  query?: string;
}

interface SearchResultItem {
  content?: string;
  text?: string;
  score?: number | string | null;
}

interface SearchResponse {
  success?: boolean;
  data?: unknown;
  results?: unknown;
  memories?: unknown;
}

export function renderSearch(data: SearchResponse | null | undefined, state?: SearchState | null): string {
  state = state || {};
  const query = (state.query || "").trim();
  const input =
    '<div class="filters"><input type="search" data-bind="query" placeholder="search memories…" value="' +
    escapeHtml(query) +
    '"/> <button type="button" data-action="search-run">search</button></div>';
  if (!query) {
    return (
      '<section class="view"><h2>Search</h2>' +
      input +
      '<p class="muted">Enter a query to search memories (FTS5 + semantic).</p></section>'
    );
  }
  if (!data || data.success === false) {
    return '<section class="view"><h2>Search</h2>' + input + errorBlock(data) + "</section>";
  }
  const results = extractSearchResults(data);
  let body: string;
  if (results.length === 0) {
    body = '<p class="empty">No results for "' + escapeHtml(query) + '".</p>';
  } else {
    body =
      '<ul class="result-list">' +
      results
        .map((r) => {
          const content = r.content || r.text || "";
          const score = r.score != null ? ' <span class="muted">(' + escapeHtml(String(r.score)) + ")</span>" : "";
          return (
            '<li><div class="result-content">' +
            markdownToHtml(content) +
            "</div>" +
            score +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
  }
  return '<section class="view"><h2>Search</h2>' + input + body + "</section>";
}

/** Normalize the SearchMemoriesTool response shape into a flat result list. */
function extractSearchResults(data: SearchResponse): SearchResultItem[] {
  const payload = data && (data.data || data);
  if (Array.isArray((payload as { results?: unknown } | undefined)?.results)) {
    return (payload as { results: SearchResultItem[] }).results;
  }
  if (Array.isArray((payload as { memories?: unknown } | undefined)?.memories)) {
    return (payload as { memories: SearchResultItem[] }).memories;
  }
  if (Array.isArray(payload)) return payload as SearchResultItem[];
  return [];
}
