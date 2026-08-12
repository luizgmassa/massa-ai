/**
 * Logs tab — the range query, the live tail, and the export download.
 *
 * The live tail cannot use EventSource: it cannot set request headers, and
 * every non-public route requires `x-api-key` (AD-011). Putting the key in the
 * query string would leak it into access logs and browser history, so this
 * mirrors the registry stream's fetch + ReadableStream + hand-rolled `data:`
 * frame parsing instead.
 */

import { escapeHtml, errorBlock } from "../lib/html.js";
import { showBanner } from "../lib/banner.js";

/** Converts a `datetime-local` input's value (no timezone, no seconds — e.g.
 *  "2026-08-10T10:00") into the ISO-8601 UTC string `GET /api/v1/logs`
 *  expects, interpreting it in the browser's local timezone. Returns
 *  `undefined` for an empty or unparseable value so the caller can omit the
 *  query param entirely rather than send an invalid range. */
export function logsDatetimeLocalToIso(value?: string | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Logs tab renderer (design "3f. Web UI `#/logs`", LOG-13). Renders the
 *  from/to/level/substring filter bar, the Live toggle, the Export control,
 *  and the entry table — all read from `state.logs*` so a re-render
 *  round-trips the operator's current filter selection. The Live toggle's
 *  fetch + ReadableStream tail and the Export button's download are wired in
 *  `wireViewHandlers` (T15, LOG-14, LOG-15) via `handleLogsLiveToggle` /
 *  `handleLogsExport`, defined near `runLogsLiveStream`. */
const LOGS_LEVEL_OPTIONS = ["debug", "info", "warn", "error", "raw"];

interface LogEntry {
  ts?: string;
  level?: string;
  message?: string;
  meta?: unknown;
}

function renderLogEntryRow(entry: LogEntry | null | undefined): string {
  const meta = entry && entry.meta ? " " + escapeHtml(JSON.stringify(entry.meta)) : "";
  return (
    "<tr>" +
    "<td>" + escapeHtml((entry && entry.ts) || "") + "</td>" +
    '<td><span class="log-level log-level-' + escapeHtml((entry && entry.level) || "") + '">' +
    escapeHtml((entry && entry.level) || "") +
    "</span></td>" +
    '<td class="content-cell">' + escapeHtml((entry && entry.message) || "") + meta + "</td>" +
    "</tr>"
  );
}

interface LogsListPayload {
  entries?: LogEntry[];
  total?: number;
  source?: string;
  truncated?: boolean;
}

interface LogsResponse extends LogsListPayload {
  success?: boolean;
  data?: LogsListPayload;
  error?: unknown;
}

interface LogsRenderState {
  logsLevel?: string;
  logsFrom?: string;
  logsTo?: string;
  logsQuery?: string;
  logsLive?: boolean;
}

export function renderLogs(data: LogsResponse | null | undefined, state?: LogsRenderState | null): string {
  state = state || {};
  if (!data || data.success === false) {
    return '<section class="view"><h2>Logs</h2>' + errorBlock(data) + "</section>";
  }
  const payload = data.data || data;
  const entries = (payload && payload.entries) || [];
  const total = (payload && payload.total) || 0;
  const source = (payload && payload.source) || "file";
  const truncated = !!(payload && payload.truncated);

  const levelOpts =
    '<option value=""' + (state.logsLevel ? "" : " selected") + ">(any)</option>" +
    LOGS_LEVEL_OPTIONS.map(
      (l) => '<option value="' + l + '"' + (state!.logsLevel === l ? " selected" : "") + ">" + l + "</option>",
    ).join("");

  const filterBar =
    '<div class="filters logs-filters">' +
    '<label>from <input type="datetime-local" data-logs="from" value="' +
    escapeHtml(state.logsFrom || "") +
    '"/></label>' +
    '<label>to <input type="datetime-local" data-logs="to" value="' +
    escapeHtml(state.logsTo || "") +
    '"/></label>' +
    '<label>level <select data-logs="level">' +
    levelOpts +
    "</select></label>" +
    '<label>contains <input type="text" data-logs="q" value="' +
    escapeHtml(state.logsQuery || "") +
    '"/></label>' +
    '<button type="button" data-action="logs-refresh">apply</button>' +
    '<label class="logs-live-toggle"><input type="checkbox" data-action="logs-live-toggle"' +
    (state.logsLive ? " checked" : "") +
    '/> Live</label>' +
    '<button type="button" data-action="logs-export">Export</button>' +
    "</div>";

  // Pre-mortem #5: the live region is scoped to THIS server process, while
  // the file sink is appended by every massa-ai process (including the
  // stdio MCP server) — a range query may legitimately contain entries Live
  // never showed. Always shown, not conditional on Live being on, so the
  // scope difference is disclosed before an operator ever notices it.
  const liveScopeDisclosure =
    '<p class="muted logs-live-disclosure">Live shows only this server process\'s entries. The file sink is written ' +
    "by every massa-ai process, including the stdio MCP server, so a range query below may include entries Live " +
    "never showed.</p>";

  const sourceNote =
    source === "buffer"
      ? '<p class="muted logs-source-note">Serving from the in-process ring buffer — no on-disk sink is currently ' +
        "readable, so history is limited to this process's recent lines.</p>"
      : "";

  const truncatedNote = truncated
    ? '<p class="muted logs-truncated-note">The 64 MB scan bound was reached — this range may be incomplete.</p>'
    : "";

  // With zero rows the table shell is rendered ONLY when Live is on, and that
  // is load-bearing rather than cosmetic: `appendLogsLiveEntry` patches into
  // `table.logs-table tbody` and does nothing when no such element exists, so
  // a range that matched nothing swallowed every live entry silently — Live
  // looked broken while the stream was in fact delivering, and the rows
  // appeared only after a refresh re-ran the range query. Scoped to Live
  // rather than rendered unconditionally so the ordinary empty state stays a
  // message and not a bare table (LOG-13's own decision, pinned by its test).
  // The empty message is a sibling of the table so the append path can remove
  // just it.
  const wantsLiveShell = entries.length === 0 && !!state.logsLive;
  let body: string;
  if (entries.length === 0) {
    body = '<p class="empty logs-empty">No log entries match this range.</p>';
  } else {
    body =
      '<p class="muted logs-total">' +
      escapeHtml(String(entries.length)) +
      " of " +
      escapeHtml(String(total)) +
      " entries</p>";
  }
  if (entries.length > 0 || wantsLiveShell) {
    body +=
      '<table class="grid logs-table"><thead><tr><th>time</th><th>level</th><th>message</th></tr></thead><tbody>' +
      entries.map(renderLogEntryRow).join("") +
      "</tbody></table>";
  }

  return (
    '<section class="view"><h2>Logs</h2>' +
    filterBar +
    liveScopeDisclosure +
    sourceNote +
    truncatedNote +
    body +
    "</section>"
  );
}

// ── Logs tab: live tail + export (design "3f. Web UI `#/logs`", T15,
// LOG-14, LOG-15) ────────────────────────────────────────────────────────
// EventSource is not usable for the live tail: it cannot set request
// headers, and every non-public route requires `x-api-key` (AD-011) —
// putting the key in the query string would leak it into access logs and
// browser history. So this mirrors `runRegenerateStream`'s own fetch +
// ReadableStream + hand-rolled `data:` frame parsing above.

interface LogsQueryElement {
  innerHTML: string;
  checked?: boolean;
  remove?: () => void;
}

/** Intersected with `showBanner`'s own root parameter type (rather than a
 *  freestanding interface) so `ctx.root` can be passed to both
 *  `root.querySelector(...)` here and `showBanner(ctx.root, ...)` below
 *  without a cast — mirroring `ProfileSwitchCtx`'s `Parameters<typeof
 *  showBanner>[0]` convention in `views/profiles.ts`. */
type LogsQueryRoot = Parameters<typeof showBanner>[0] & {
  querySelector?: (selectors: string) => LogsQueryElement | null;
};

interface LogsStreamState {
  logsLive?: boolean;
  logsStreamAbort?: AbortController | null;
  logsStreamInFlight?: boolean;
  logsEntries?: LogEntry[];
  logsFrom?: string;
  logsTo?: string;
  logsLevel?: string;
  logsQuery?: string;
  [key: string]: unknown;
}

interface LogsApi {
  request?: (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>;
  authHeaders?: () => Record<string, string>;
}

interface LogsAnchorElement {
  href?: string;
  download?: string;
  click?: () => void;
}

interface LogsDoc {
  createElement?: (tag: string) => LogsAnchorElement | null;
  body?: {
    appendChild?: (node: unknown) => unknown;
    removeChild?: (node: unknown) => unknown;
  };
}

interface LogsCtx {
  state?: LogsStreamState;
  root: LogsQueryRoot;
  api?: LogsApi;
  doc?: LogsDoc;
}

/** Aborts any in-flight Logs live-tail stream (LOG-14/15 teardown). Called
 *  both when the Live toggle switches off and from `render()`'s
 *  navigate-away guard — mirroring `clearIndexPoll()`'s discipline for the
 *  projects index poll. Exported so both call sites and tests share the
 *  exact same teardown, never a re-implemented copy. */
export function stopLogsLiveStream(ctx?: LogsCtx | null): void {
  const state: LogsStreamState = (ctx && ctx.state) || (ctx && (ctx.state = {})) || {};
  if (state.logsStreamAbort && typeof state.logsStreamAbort.abort === "function") {
    state.logsStreamAbort.abort();
  }
  state.logsStreamAbort = null;
}

/** Appends one streamed entry to `state.logsEntries` and, when the Logs
 *  table is currently on screen, prepends its row directly into
 *  `table.logs-table tbody` — LOG-14's "append without re-issuing the range
 *  query": no `ctx.api.request` call happens on this path at all. When no
 *  table is on screen yet (e.g. the range query rendered the empty state),
 *  the entry is still recorded in `state.logsEntries` but nothing is
 *  patched into the DOM until the next explicit "apply" — patching the
 *  empty-state markup into a table shell here would itself be a local
 *  re-render of the whole view, which is more than "append" and is not
 *  covered by an independent test. */
function appendLogsLiveEntry(ctx: LogsCtx, entry: LogEntry): void {
  const state = ctx.state || (ctx.state = {});
  state.logsEntries = state.logsEntries || [];
  state.logsEntries.push(entry);
  const root = ctx.root;
  const tbody = root && root.querySelector ? root.querySelector("table.logs-table tbody") : null;
  if (tbody) {
    tbody.innerHTML = renderLogEntryRow(entry) + tbody.innerHTML;
    // "No log entries match this range" is true of the range query and false
    // the moment a live row lands beneath it. Removing it here rather than
    // re-rendering keeps this path what LOG-14 requires: an append, with no
    // range query re-issued.
    const emptyNote = root && root.querySelector ? root.querySelector(".logs-empty") : null;
    if (emptyNote && emptyNote.remove) emptyNote.remove();
  }
}

/** Opens the `/api/v1/logs/stream` live tail and appends every frame it
 *  emits (LOG-14). No-op whenever `ctx.state.logsLive` is false — this is
 *  the load-bearing guard: the fake-DOM harness's synthetic `startApp`
 *  dispatch fires every wired `data-action`/`change` handler against a
 *  generic child, and `handleLogsLiveToggle` reading that child's `checked`
 *  (always falsy there) already keeps `logsLive` off in that case, but this
 *  second, independent check means a caller can never open a real,
 *  never-resolving fetch by invoking this function directly with `logsLive`
 *  unset either. LOG-15: any stream failure that is not our own teardown
 *  abort turns Live off, banners the error, and leaves every already
 *  rendered/appended row exactly where it was — this function never calls
 *  `ctx.render()`. */
export async function runLogsLiveStream(ctx: LogsCtx): Promise<void> {
  const state = ctx.state || (ctx.state = {});
  if (!state.logsLive) return;
  if (state.logsStreamInFlight) return; // in-flight guard, ctx.state-scoped
  state.logsStreamInFlight = true;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  state.logsStreamAbort = controller;
  try {
    const headers = ctx.api && ctx.api.authHeaders ? ctx.api.authHeaders() : {};
    const res = await fetch("/api/v1/logs/stream", {
      headers,
      signal: controller ? controller.signal : undefined,
    });
    if (!res || !res.body || !res.body.getReader) {
      throw new Error("stream unavailable");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (state.logsLive) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = frame.trim();
        if (!line.startsWith("data:")) continue; // heartbeat `:` comments and blanks
        let entry: LogEntry;
        try {
          entry = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        appendLogsLiveEntry(ctx, entry);
      }
    }
  } catch (e) {
    const aborted = !!(controller && controller.signal && controller.signal.aborted);
    if (!aborted) {
      // LOG-15: a genuine failure (never our own navigate-away/toggle-off
      // abort) turns Live off and banners the error, keeping prior rows.
      state.logsLive = false;
      showBanner(ctx.root, "error", "Live log stream failed: " + String((e as { message?: unknown })?.message || e));
    }
  } finally {
    state.logsStreamInFlight = false;
    if (state.logsStreamAbort === controller) state.logsStreamAbort = null;
  }
}

/** Live toggle change handler (LOG-14). Reads the checkbox's real `.checked`
 *  via `root.querySelector` — never the event target or a dataset value —
 *  matching this file's established rule (`handleMemoryDeleteProject`'s
 *  precedent) that a synthetic harness event must resolve through the real
 *  DOM lookup rather than being trusted at face value. */
export function handleLogsLiveToggle(ctx: LogsCtx): void {
  const state = ctx.state || (ctx.state = {});
  const el = ctx.root && ctx.root.querySelector ? ctx.root.querySelector('[data-action="logs-live-toggle"]') : null;
  const checked = !!(el && el.checked);
  state.logsLive = checked;
  writeLogsLivePreference(checked);
  if (checked) {
    runLogsLiveStream(ctx);
  } else {
    stopLogsLiveStream(ctx);
  }
}

/** Live is a per-tab preference, and it used to live only in `state`, which a
 *  reload discards — so every refresh silently turned the live tail off again
 *  while the operator believed it was still on. Persisted the same way the
 *  Profiles tab persists its selected sub-tab (`localStorage`, every access
 *  wrapped: it throws outright under some privacy modes, and is simply absent
 *  in the fake-DOM test harness). */
const LOGS_LIVE_STORAGE_KEY = "massa-ai-logs-live";

function writeLogsLivePreference(value: boolean): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LOGS_LIVE_STORAGE_KEY, value ? "true" : "false");
    }
  } catch {
    // localStorage unavailable — the toggle still works for this page's life.
  }
}

/** The stored preference, or `undefined` when nothing was ever stored — the
 *  caller must be able to tell "explicitly off" from "never chosen", so an
 *  absent key can keep the off-by-default behaviour without recording it. */
export function readLogsLivePreference(): boolean | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    const raw = localStorage.getItem(LOGS_LIVE_STORAGE_KEY);
    if (raw === null || raw === undefined) return undefined;
    return raw === "true";
  } catch {
    return undefined;
  }
}

/** Export handler (design § 3f "Export"). A normal `fetch` carrying the
 *  `x-api-key` header, then an object-URL anchor click — a plain `<a href>`
 *  would send no header and 401. */
export async function handleLogsExport(ctx: LogsCtx): Promise<void> {
  const state = ctx.state || (ctx.state = {});
  const params = new URLSearchParams();
  const fromIso = logsDatetimeLocalToIso(state.logsFrom);
  const toIso = logsDatetimeLocalToIso(state.logsTo);
  if (fromIso) params.set("from", fromIso);
  if (toIso) params.set("to", toIso);
  if (state.logsLevel) params.set("level", state.logsLevel);
  if (state.logsQuery) params.set("q", state.logsQuery);
  params.set("format", "jsonl");
  const qs = params.toString();
  try {
    const headers = ctx.api && ctx.api.authHeaders ? ctx.api.authHeaders() : {};
    const res = await fetch("/api/v1/logs/export" + (qs ? "?" + qs : ""), { headers });
    if (!res || res.ok === false) {
      const status = res && res.status ? " (" + res.status + ")" : "";
      showBanner(ctx.root, "error", "Export failed" + status + ".");
      return;
    }
    if (typeof res.blob !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      showBanner(ctx.root, "error", "Export failed: download unavailable in this environment.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const disposition = res.headers && typeof res.headers.get === "function" ? res.headers.get("content-disposition") : null;
    const match = disposition && /filename="([^"]+)"/.exec(disposition);
    const filename = (match && match[1]) || "massa-ai-logs.jsonl";
    const doc = ctx.doc;
    const a = doc && doc.createElement ? doc.createElement("a") : null;
    if (a) {
      a.href = url;
      a.download = filename;
      if (doc && doc.body && doc.body.appendChild) doc.body.appendChild(a);
      if (typeof a.click === "function") a.click();
      if (doc && doc.body && doc.body.removeChild) doc.body.removeChild(a);
    }
    if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
  } catch (e) {
    showBanner(ctx.root, "error", "Export failed: " + String((e as { message?: unknown })?.message || e));
  }
}
