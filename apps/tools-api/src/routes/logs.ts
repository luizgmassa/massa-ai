/**
 * Log read routes (design § "3e. `apps/tools-api/src/routes/logs.ts` (new)").
 *
 *   GET /api/v1/logs         — range/level/substring query over the file sink,
 *                              falling back to the in-process ring buffer.
 *   GET /api/v1/logs/export  — the same range as a downloadable jsonl/txt file.
 *   GET /api/v1/logs/stream  — SSE tail of newly buffered entries (LOG-05,
 *                              T13). Reuses `events.ts`'s discipline exactly:
 *                              heartbeat interval, max-duration auto-close,
 *                              and teardown in the `ReadableStream` `cancel()`
 *                              hook — a function returned from `start` is
 *                              ignored by the ReadableStream contract and
 *                              would leak the subscription and both timers.
 *
 * LOG-12 — THIS MODULE IMPORTS NO LOGGER. Logging its own reads would push a
 * new entry into the very ring buffer / file sink it just read, which is the
 * feedback loop the requirement forbids. Do not add a `logger` import here.
 *
 * LOG-04 — every query is validated (parseable `from`/`to`, `from <= to`,
 * `limit <= 1000`) BEFORE any file I/O. The `LogsFileReader` seam below
 * (`__setLogsReaderForTests`) lets a test assert that no read happens on a
 * rejected request without mocking the whole `node:fs` module.
 */

import { Elysia } from "elysia";
import fs from "node:fs";
import { config, logBuffer, sinkFiles, type LogEntry } from "@massa-ai/shared";
import { resolveHeartbeatMs, resolveMaxDurationMs } from "./sse-keepalive.js";

const LOGS_DETAIL = { tags: ["logs"] };

/** Design § 3e: "at most 64 MB scanned; stopping early sets `truncated: true`
 *  rather than silently short-reading." */
const MAX_SCAN_BYTES = 64 * 1024 * 1024;
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

// ── Query validation (LOG-04) ───────────────────────────────────────────────

interface ParsedRangeQuery {
  fromMs: number;
  toMs: number;
  fromRaw?: string;
  toRaw?: string;
  level?: string;
  q?: string;
  limit: number;
  offset: number;
}

interface QueryValidationError {
  param: string;
  message: string;
}

function isQueryValidationError(v: ParsedRangeQuery | QueryValidationError): v is QueryValidationError {
  return "param" in v;
}

/**
 * Parses + validates the shared `from`/`to`/`level`/`q`/`limit`/`offset`
 * query surface. Pure — no I/O — so it can run to completion before either
 * route touches a file or the buffer (LOG-04).
 */
function parseRangeQuery(query: Record<string, string | undefined>): ParsedRangeQuery | QueryValidationError {
  const fromRaw = query.from;
  const toRaw = query.to;

  const fromMs = fromRaw !== undefined ? Date.parse(fromRaw) : -Infinity;
  if (fromRaw !== undefined && Number.isNaN(fromMs)) {
    return { param: "from", message: `"from" is not a parseable ISO-8601 timestamp: "${fromRaw}"` };
  }
  const toMs = toRaw !== undefined ? Date.parse(toRaw) : Infinity;
  if (toRaw !== undefined && Number.isNaN(toMs)) {
    return { param: "to", message: `"to" is not a parseable ISO-8601 timestamp: "${toRaw}"` };
  }
  if (fromMs > toMs) {
    return { param: "from", message: `"from" (${fromRaw}) is after "to" (${toRaw})` };
  }

  let limit = DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    const n = Number(query.limit);
    if (!Number.isFinite(n) || n < 0) {
      return { param: "limit", message: `"limit" must be a non-negative number: "${query.limit}"` };
    }
    if (n > MAX_LIMIT) {
      return { param: "limit", message: `"limit" exceeds the maximum of ${MAX_LIMIT}: "${query.limit}"` };
    }
    limit = Math.floor(n);
  }

  let offset = 0;
  if (query.offset !== undefined) {
    const n = Number(query.offset);
    if (!Number.isFinite(n) || n < 0) {
      return { param: "offset", message: `"offset" must be a non-negative number: "${query.offset}"` };
    }
    offset = Math.floor(n);
  }

  return { fromMs, toMs, fromRaw, toRaw, level: query.level, q: query.q, limit, offset };
}

// ── Line parsing (design § 3e "Parsing") ────────────────────────────────────

const LINE_RE = /^\[(?<ts>[^\]]+)\] \[(?<level>[A-Z]+)\] (?<rest>[\s\S]*)$/;

function normalizeLevel(raw: string): LogEntry["level"] {
  const lower = raw.toLowerCase();
  return lower === "debug" || lower === "info" || lower === "warn" || lower === "error" ? lower : "raw";
}

/**
 * A trailing `{...}` on `rest` is `JSON.parse`d into `meta` and stripped from
 * `message`. Scans candidate split points from the END of the string
 * backward (the meta blob `Logger.emit` appends is always the LAST segment)
 * so a message that itself happens to contain `" {"` earlier doesn't win over
 * the real boundary.
 */
function splitMessageAndMeta(rest: string): { message: string; meta?: Record<string, unknown> } {
  if (!rest.endsWith("}")) return { message: rest };
  let searchFrom = rest.length;
  for (;;) {
    const idx = rest.lastIndexOf(" {", searchFrom - 1);
    if (idx === -1) break;
    const candidate = rest.slice(idx + 1);
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { message: rest.slice(0, idx), meta: parsed as Record<string, unknown> };
      }
    } catch {
      // Not a valid boundary — try the next-earlier " {" candidate.
    }
    searchFrom = idx;
  }
  return { message: rest };
}

/**
 * Parses one sink line into a `LogEntry`. A line that doesn't match the
 * `[ts] [LEVEL] rest` shape becomes `{level:"raw", message:<line>}`, carrying
 * `prevTs` (the previous entry's timestamp, in output order) so ordering
 * still holds relative to its neighbors (design § 3e "Parsing", spec edge
 * case). `seq` is a placeholder — the caller assigns response-local,
 * newest-first sequence numbers once the full scan is known.
 */
function parseLine(line: string, prevTs: string): { entry: LogEntry; ts: string } {
  const match = LINE_RE.exec(line);
  if (!match || !match.groups) {
    return { entry: { seq: 0, ts: prevTs, level: "raw", message: line }, ts: prevTs };
  }
  const { ts, level, rest } = match.groups as { ts: string; level: string; rest: string };
  const { message, meta } = splitMessageAndMeta(rest);
  const entry: LogEntry = { seq: 0, ts, level: normalizeLevel(level), message, ...(meta ? { meta } : {}) };
  return { entry, ts };
}

// ── File I/O seam (LOG-04's "asserts no read" test hook) ───────────────────

export interface LogsFileReader {
  /** Existing, readable sink files, newest-first (wraps `sinkFiles` + a
   *  readability probe — LOG-09's "absent or unreadable" both degrade to
   *  the empty list, which the caller treats as "serve the buffer"). */
  listFiles(filePath: string, maxFiles: number): string[];
  /** Size + scan-bound-aware content read for one file. Reads the file's
   *  TAIL (most recent bytes) when it exceeds `maxBytes`, discarding a
   *  possibly-partial leading line fragment. */
  readTail(filePath: string, maxBytes: number): { content: string; truncated: boolean };
}

/**
 * Exported ONLY for `realReadTail`'s own non-happy-path unit coverage
 * (statSync/readFileSync/openSync-readSync failure branches): those branches
 * are unreachable through the route without a file that exceeds the fixed
 * 64 MB `MAX_SCAN_BYTES` scan bound, which a test cannot practically write.
 * Calling it directly with a small `maxBytes` reaches the same code with a
 * small fixture. Production code never imports this export directly —
 * `realReader.readTail` (below) is still the only production call site.
 */
export function realReadTail(filePath: string, maxBytes: number): { content: string; truncated: boolean } {
  let size: number;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return { content: "", truncated: false };
  }
  if (size === 0) return { content: "", truncated: false };
  if (size <= maxBytes) {
    try {
      return { content: fs.readFileSync(filePath, "utf8"), truncated: false };
    } catch {
      return { content: "", truncated: false };
    }
  }
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const start = size - maxBytes;
      const buf = Buffer.alloc(maxBytes);
      fs.readSync(fd, buf, 0, maxBytes, start);
      let text = buf.toString("utf8");
      const firstNewline = text.indexOf("\n");
      text = firstNewline !== -1 ? text.slice(firstNewline + 1) : "";
      return { content: text, truncated: true };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { content: "", truncated: true };
  }
}

const realReader: LogsFileReader = {
  listFiles(filePath, maxFiles) {
    return sinkFiles(filePath, maxFiles).filter((f) => {
      try {
        fs.accessSync(f, fs.constants.R_OK);
        return true;
      } catch {
        return false;
      }
    });
  },
  readTail: realReadTail,
};

let activeReader: LogsFileReader = realReader;

/** Test-only seam: mirrors `middleware/auth.ts`'s `__setAuthKeyForTests` —
 * inject a spy/stub reader so a test can assert file I/O never happens for a
 * rejected request (LOG-04), or serve fixture content, without mocking the
 * whole `node:fs` module. Production code never calls this. */
export function __setLogsReaderForTests(reader: LogsFileReader | undefined): void {
  activeReader = reader ?? realReader;
}

// ── Scan + filter ────────────────────────────────────────────────────────────

interface ScanResult {
  entries: LogEntry[];
  source: "file" | "buffer";
  truncated: boolean;
}

/**
 * Reads every discovered sink file newest-first, within the 64 MB scan
 * bound, emitting entries newest-first overall. Falls back to the ring
 * buffer (`source:"buffer"`) when no sink file is present or readable
 * (LOG-09).
 *
 * Two passes, deliberately not one: which BYTES get read is decided
 * newest-first (the scan bound must prefer the most recent content when it
 * can't read everything), but a raw/unparseable line's inherited timestamp
 * (design § 3e "Parsing") is "the previous entry" in true chronological
 * order — the line physically above it in the file, not merely whichever
 * line our scan direction happened to visit first. So pass 1 collects the
 * in-budget content newest-first; pass 2 walks that same content
 * oldest-to-newest to assign entries + inherited timestamps correctly, and
 * the result is reversed once at the end for the newest-first response.
 */
function scanEntries(): ScanResult {
  const loggingConfig = config.get("logging");
  const filePath = loggingConfig.file;
  const files = filePath ? activeReader.listFiles(filePath, loggingConfig.maxFiles) : [];

  if (files.length === 0) {
    // Newest-first already (LogBuffer.snapshot's own contract).
    return { entries: logBuffer.snapshot(), source: "buffer", truncated: false };
  }

  // Pass 1: newest-first, within the scan bound.
  const readFiles: string[] = []; // newest-first content, one entry per file read
  let budgetLeft = MAX_SCAN_BYTES;
  let truncated = false;
  for (const file of files) {
    if (budgetLeft <= 0) {
      truncated = true;
      break;
    }
    const { content, truncated: fileTruncated } = activeReader.readTail(file, budgetLeft);
    if (fileTruncated) truncated = true;
    readFiles.push(content);
    // Best-effort budget accounting: content length approximates bytes read
    // (utf8 line content, minus the newlines split() already consumed).
    budgetLeft -= Buffer.byteLength(content, "utf8");
    if (fileTruncated) break; // budget exhausted mid-file — never read further
  }

  // Pass 2: oldest-file-first, top-to-bottom within each file — true
  // chronological order, so `prevTs` threading is correct across both lines
  // and rotation boundaries.
  let prevTs = new Date().toISOString(); // only used if the very first line ever seen is unparseable
  const chronoEntries: LogEntry[] = [];
  for (let i = readFiles.length - 1; i >= 0; i--) {
    const lines = readFiles[i].split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      const { entry, ts } = parseLine(line, prevTs);
      prevTs = ts;
      chronoEntries.push(entry);
    }
  }

  // Pass 3: newest-first response order + response-local sequence numbers
  // (mirrors LogBuffer's "higher seq = newer" convention; not stable across
  // separate requests).
  const entries = chronoEntries.reverse();
  for (let i = 0; i < entries.length; i++) {
    entries[i].seq = entries.length - 1 - i;
  }

  return { entries, source: "file", truncated };
}

function matchesFilter(entry: LogEntry, parsed: ParsedRangeQuery): boolean {
  const tsMs = Date.parse(entry.ts);
  if (Number.isNaN(tsMs) || tsMs < parsed.fromMs || tsMs > parsed.toMs) return false;
  if (parsed.level !== undefined && entry.level !== parsed.level) return false;
  if (parsed.q !== undefined && !entry.message.toLowerCase().includes(parsed.q.toLowerCase())) return false;
  return true;
}

function filteredEntries(parsed: ParsedRangeQuery): ScanResult {
  const scan = scanEntries();
  return { ...scan, entries: scan.entries.filter((e) => matchesFilter(e, parsed)) };
}

// ── Export formatting (LOG-06) ──────────────────────────────────────────────

function sanitizeForFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "-");
}

function exportFilename(parsed: ParsedRangeQuery, ext: string): string {
  const fromPart = sanitizeForFilename(parsed.fromRaw ?? "all");
  const toPart = sanitizeForFilename(parsed.toRaw ?? "all");
  return `massa-ai-logs-${fromPart}_${toPart}.${ext}`;
}

function renderTxtLine(entry: LogEntry): string {
  const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : "";
  return `[${entry.ts}] [${entry.level.toUpperCase()}] ${entry.message}${metaStr}`;
}

// ── SSE tail (LOG-05) ───────────────────────────────────────────────────────
//
// Heartbeat interval + max-duration default now come from `sse-keepalive.ts`
// (spec SSE-01, design D1) — this file no longer declares its own literal.

/** How often the live tail checks the sink for appended bytes. A log tail is
 *  not a low-latency channel, and a shorter interval buys nothing but stat
 *  syscalls on an idle server. */
const SINK_POLL_MS_DEFAULT = 1_000;

/** Per-poll read ceiling. A burst larger than this is not dropped — the offset
 *  advances by what was read, so the next poll continues where this one
 *  stopped — it just cannot arrive as one unbounded allocation. */
const SINK_POLL_MAX_BYTES = 1024 * 1024;

/**
 * Tail the newest sink file, emitting each newly appended line as a
 * `LogEntry`. Returns an unsubscribe function, or `undefined` when no sink
 * file is readable — the caller falls back to the in-process ring buffer,
 * matching `scanEntries`' own `source: "buffer"` degradation.
 *
 * Starts at the CURRENT end of file, not at the beginning: the contract this
 * replaces is "entries pushed after you subscribed", and replaying history
 * into a live tail would duplicate whatever the range query already rendered.
 *
 * Rotation is handled by re-listing every poll rather than by holding a
 * descriptor. `sinkFiles` is newest-first, so a new newest path means the sink
 * rotated and the tail follows it from byte 0; a file that shrank underneath
 * us was truncated in place, which is the same thing without a rename.
 */
function startSinkTail(enqueue: (entry: LogEntry) => void): (() => void) | undefined {
  const loggingConfig = config.get("logging");
  const filePath = loggingConfig.file;
  if (!filePath) return undefined;

  const initial = activeReader.listFiles(filePath, loggingConfig.maxFiles);
  if (initial.length === 0) return undefined;

  let currentFile = initial[0] as string;
  let offset: number;
  try {
    offset = fs.statSync(currentFile).size;
  } catch {
    return undefined;
  }

  // A trailing partial line: the writer may append mid-line between polls, and
  // parsing half a line would emit a bogus `raw` entry AND lose the real one.
  let carry = "";
  let prevTs = new Date().toISOString();
  let seq = 0;

  const pollMs = Number(process.env.MASSA_AI_SSE_SINK_POLL_MS) || SINK_POLL_MS_DEFAULT;

  const timer = setInterval(() => {
    try {
      const newest = activeReader.listFiles(filePath, loggingConfig.maxFiles)[0];
      if (newest && newest !== currentFile) {
        currentFile = newest;
        offset = 0;
        carry = "";
      }
      const size = fs.statSync(currentFile).size;
      if (size < offset) {
        offset = 0;
        carry = "";
      }
      if (size === offset) return;

      const length = Math.min(size - offset, SINK_POLL_MAX_BYTES);
      const buf = Buffer.alloc(length);
      const fd = fs.openSync(currentFile, "r");
      try {
        fs.readSync(fd, buf, 0, length, offset);
      } finally {
        fs.closeSync(fd);
      }
      offset += length;

      const text = carry + buf.toString("utf8");
      const lines = text.split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim() === "") continue;
        const parsed = parseLine(line, prevTs);
        prevTs = parsed.ts;
        enqueue({ ...parsed.entry, seq: ++seq });
      }
    } catch {
      // A poll that cannot stat or read is not fatal to the stream: the sink
      // may be mid-rotation. The next poll re-lists and recovers.
    }
  }, pollMs);

  // `unref` where available so an open tail cannot hold the process alive.
  (timer as unknown as { unref?: () => void }).unref?.();

  return () => clearInterval(timer);
}

// ── Routes ───────────────────────────────────────────────────────────────────

export const logsRoutes = new Elysia({ prefix: "/api/v1/logs" })
  .get(
    "/",
    ({ query, set }) => {
      const parsed = parseRangeQuery(query as Record<string, string | undefined>);
      if (isQueryValidationError(parsed)) {
        set.status = 400;
        return { success: false as const, error: `invalid "${parsed.param}": ${parsed.message}` };
      }

      const { entries, source, truncated } = filteredEntries(parsed);
      const total = entries.length;
      const page = entries.slice(parsed.offset, parsed.offset + parsed.limit);

      set.status = 200;
      return { success: true as const, data: { entries: page, total, source, truncated } };
    },
    {
      detail: {
        ...LOGS_DETAIL,
        summary: "Range/level/substring query over the log sink (or the ring buffer)",
        description:
          "Query params: from, to (ISO-8601, closed interval), level, q (substring), limit (<=1000), offset. Reads the file sink newest-first within a 64 MB scan bound (truncated:true if the bound was hit); falls back to the in-process ring buffer (source:\"buffer\") when no sink file is present or readable. Validates from/to/limit before any read.",
      },
    },
  )
  .get(
    "/export",
    ({ query, set }) => {
      const parsed = parseRangeQuery(query as Record<string, string | undefined>);
      if (isQueryValidationError(parsed)) {
        set.status = 400;
        return { success: false as const, error: `invalid "${parsed.param}": ${parsed.message}` };
      }

      const { entries } = filteredEntries(parsed);
      const format = (query as Record<string, string | undefined>).format === "txt" ? "txt" : "jsonl";
      const ext = format === "txt" ? "txt" : "jsonl";
      const contentType = format === "txt" ? "text/plain" : "application/x-ndjson";
      const body = format === "txt"
        ? entries.map(renderTxtLine).join("\n")
        : entries.map((e) => JSON.stringify(e)).join("\n");
      const filename = exportFilename(parsed, ext);

      // Explicit Response — a bare string/object return from an Elysia
      // handler flips the wire content-type to text/plain under the node
      // adapter (documented trap; only a real-HTTP test can see it).
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    },
    {
      detail: {
        ...LOGS_DETAIL,
        summary: "Download the queried log range as jsonl or txt",
        description:
          "Same query surface as GET /api/v1/logs (minus limit/offset — the full matching range is returned) plus format=jsonl|txt. Responds with Content-Disposition: attachment and a filename carrying the range. A range matching zero entries still returns an empty (200) download.",
      },
    },
  )
  .get(
    "/stream",
    () => {
      // Read per-request, mirroring events.ts, so an env override is honored
      // even when this module was first imported under the default.
      const HEARTBEAT_MS = resolveHeartbeatMs();
      const MAX_DURATION_MS = resolveMaxDurationMs();

      const encoder = new TextEncoder();
      let closed = false;
      // Hoisted to handler scope so `cancel` (a sibling of `start`, not
      // nested in it) can tear them down; `start` populates them.
      let unsubscribe: (() => void) | undefined;
      let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
      let closeTimer: ReturnType<typeof setTimeout> | undefined;

      const stream = new ReadableStream({
        start(controller) {
          const enqueue = (data: unknown) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            } catch {
              closed = true;
            }
          };

          // Source selection, and the reason it is not "both". The ring
          // buffer holds only THIS process's entries, while the sink file is
          // appended by every massa-ai process — including the stdio MCP
          // server, which is where most of a working install's log traffic
          // comes from. Subscribing to the buffer alone made the live tail
          // correct and useless: an idle API server emitted nothing while the
          // file grew, so Live looked broken and a refresh (a range query over
          // the file) was the only thing that ever showed the new lines.
          //
          // The file is a superset of the buffer — this process writes to it
          // too — so tailing BOTH would double every local entry. Tail the
          // file when one is readable, and fall back to the buffer when none
          // is, exactly mirroring the range query's own `source` semantics.
          const tail = startSinkTail(enqueue);
          if (tail) {
            unsubscribe = tail;
          } else {
            unsubscribe = logBuffer.subscribe((entry: LogEntry) => {
              enqueue(entry);
            });
          }

          heartbeatTimer = setInterval(() => {
            if (closed) {
              clearInterval(heartbeatTimer);
              return;
            }
            try {
              controller.enqueue(encoder.encode(`: heartbeat\n\n`));
            } catch {
              closed = true;
              clearInterval(heartbeatTimer);
            }
          }, HEARTBEAT_MS);

          closeTimer = setTimeout(() => {
            closed = true;
            unsubscribe?.();
            clearInterval(heartbeatTimer);
            try {
              controller.close();
            } catch {
              // already closed
            }
          }, MAX_DURATION_MS);
        },
        // Cleanup on stream cancel (client disconnected). `cancel` is the
        // only reliable teardown seam: ReadableStream ignores a function
        // returned from `start` (it only awaits a returned promise), so a
        // start-return cleanup would silently leak the subscription + timers.
        cancel() {
          closed = true;
          unsubscribe?.();
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (closeTimer) clearTimeout(closeTimer);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    },
    {
      detail: {
        ...LOGS_DETAIL,
        summary: "SSE tail of newly appended log entries",
        description:
          "Server-Sent Events stream emitting `data: <LogEntry JSON>` for every entry subsequently appended, plus `: heartbeat` comments. Same heartbeat and max-duration auto-close behavior as GET /api/v1/events. Tails the shared file sink when one is readable — matching every massa-ai process, including the stdio MCP server, the same scope as GET /api/v1/logs — and falls back to the in-process ring buffer, scoped to this server process only, when no sink file is readable.",
      },
    },
  );
