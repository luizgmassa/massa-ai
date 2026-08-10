/**
 * logs.ts route tests — T12 (LOG-03, LOG-04, LOG-06, LOG-09..LOG-12).
 *
 * `config.get("logging")` is mocked (via `@massa-ai/shared`'s `config`
 * object) so each test controls the sink `file`/`maxFiles` without touching
 * the developer's real `~/.config/massa-ai/config.json`. `logBuffer` and
 * `sinkFiles` stay the REAL implementations — the file-backed tests write
 * real fixture lines to a real temp dir and let the real `sinkFiles` +
 * `fs` reads run, and the buffer-fallback tests push into the real
 * `logBuffer` singleton (reset in `beforeEach`/`afterEach`).
 */
import { describe, test, expect, mock, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

interface LoggingConfigFixture {
  level: string;
  enableMetrics: boolean;
  file: string;
  enableFileSink: boolean;
  bufferSize: number;
  maxFileSizeMb: number;
  maxFiles: number;
}

let loggingConfigFixture: LoggingConfigFixture = {
  level: "info",
  enableMetrics: false,
  file: "/nonexistent/massa-ai.log",
  enableFileSink: true,
  bufferSize: 2000,
  maxFileSizeMb: 32,
  maxFiles: 5,
};

const actualShared = require("@massa-ai/shared");

// T13: a subscriber-count wrapper around the REAL `logBuffer` singleton.
// `subscribe`/`push`/etc. all still delegate to the real implementation — the
// only addition is `liveSubscriberCount`, so the T13 SSE cancel-teardown test
// can assert "cancel() unsubscribed" behaviorally (subscriber count back to
// baseline) rather than by waiting on real heartbeat/close timers.
let liveSubscriberCount = 0;
const realLogBuffer = actualShared.logBuffer as typeof actualShared.logBuffer;
const instrumentedLogBuffer = {
  push: (entry: Parameters<typeof realLogBuffer.push>[0]) => realLogBuffer.push(entry),
  snapshot: (opts?: Parameters<typeof realLogBuffer.snapshot>[0]) => realLogBuffer.snapshot(opts),
  subscribe: (fn: Parameters<typeof realLogBuffer.subscribe>[0]) => {
    liveSubscriberCount++;
    const unsubscribe = realLogBuffer.subscribe(fn);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      liveSubscriberCount--;
      unsubscribe();
    };
  },
  setCapacity: (n: number) => realLogBuffer.setCapacity(n),
  size: () => realLogBuffer.size(),
  _resetForTesting: () => {
    realLogBuffer._resetForTesting();
    liveSubscriberCount = 0;
  },
};

mock.module("@massa-ai/shared", () => ({
  ...actualShared,
  config: {
    get: (key: string) => (key === "logging" ? loggingConfigFixture : actualShared.config.get(key)),
  },
  logBuffer: instrumentedLogBuffer,
}));

import { logsRoutes, __setLogsReaderForTests, realReadTail, type LogsFileReader } from "./logs.js";
import { logBuffer, type LogEntry } from "@massa-ai/shared";

const app = new Elysia().use(logsRoutes);

async function get(p: string) {
  const res = await app.handle(new Request(`http://localhost${p}`));
  return { status: res.status, json: (await res.json()) as any };
}

function formatLine(ts: string, level: string, message: string, meta?: Record<string, unknown>): string {
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${ts}] [${level}] ${message}${metaStr}`;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-logs-route-"));
  loggingConfigFixture = {
    level: "info",
    enableMetrics: false,
    file: path.join(tmpDir, "massa-ai.log"),
    enableFileSink: true,
    bufferSize: 2000,
    maxFileSizeMb: 32,
    maxFiles: 5,
  };
  logBuffer._resetForTesting();
  __setLogsReaderForTests(undefined);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  logBuffer._resetForTesting();
  __setLogsReaderForTests(undefined);
});

// ── Source guard (LOG-12): this module must never import a logger ──────────

describe("logs.ts — LOG-12: no logger import", () => {
  test("the source file's import statements never bind a `logger` identifier", () => {
    const src = fs.readFileSync(path.join(import.meta.dir, "logs.ts"), "utf8");
    const importLines = src
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    expect(importLines.length).toBeGreaterThan(0); // sanity: the file does have imports
    for (const line of importLines) {
      expect(line).not.toMatch(/\blogger\b/);
    }
  });
});

// ── GET /api/v1/logs — range/level/substring over the file sink (LOG-03) ───

describe("GET /api/v1/logs — file sink range/level/substring (LOG-03)", () => {
  test("returns entries within [from,to], newest first, with total + source:\"file\"", async () => {
    const lines = [
      formatLine("2026-01-01T00:00:00.000Z", "INFO", "server started"),
      formatLine("2026-01-01T00:05:00.000Z", "WARN", "slow query", { ms: 900 }),
      formatLine("2026-01-01T00:10:00.000Z", "ERROR", "db down"),
      formatLine("2026-02-01T00:00:00.000Z", "INFO", "out of range"),
    ];
    fs.writeFileSync(loggingConfigFixture.file, lines.join("\n") + "\n");

    const res = await get("/api/v1/logs?from=2026-01-01T00:00:00.000Z&to=2026-01-01T00:10:00.000Z");
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.source).toBe("file");
    expect(res.json.data.total).toBe(3);
    // Newest first.
    expect(res.json.data.entries.map((e: LogEntry) => e.message)).toEqual([
      "db down",
      "slow query",
      "server started",
    ]);
    expect(res.json.data.entries[1].meta).toEqual({ ms: 900 });
  });

  test("filters by level", async () => {
    const lines = [
      formatLine("2026-01-01T00:00:00.000Z", "INFO", "a"),
      formatLine("2026-01-01T00:01:00.000Z", "WARN", "b"),
      formatLine("2026-01-01T00:02:00.000Z", "WARN", "c"),
    ];
    fs.writeFileSync(loggingConfigFixture.file, lines.join("\n") + "\n");

    const res = await get("/api/v1/logs?level=warn");
    expect(res.status).toBe(200);
    expect(res.json.data.total).toBe(2);
    expect(res.json.data.entries.every((e: LogEntry) => e.level === "warn")).toBe(true);
  });

  test("filters by substring q, case-insensitively", async () => {
    const lines = [
      formatLine("2026-01-01T00:00:00.000Z", "INFO", "Connection Established"),
      formatLine("2026-01-01T00:01:00.000Z", "INFO", "nothing interesting"),
    ];
    fs.writeFileSync(loggingConfigFixture.file, lines.join("\n") + "\n");

    const res = await get("/api/v1/logs?q=connection");
    expect(res.status).toBe(200);
    expect(res.json.data.total).toBe(1);
    expect(res.json.data.entries[0].message).toBe("Connection Established");
  });

  test("an unparseable line becomes level:\"raw\", carrying the previous entry's timestamp", async () => {
    const lines = [
      formatLine("2026-01-01T00:00:00.000Z", "INFO", "before"),
      "this line does not match the format at all",
    ];
    fs.writeFileSync(loggingConfigFixture.file, lines.join("\n") + "\n");

    const res = await get("/api/v1/logs");
    expect(res.status).toBe(200);
    const raw = res.json.data.entries.find((e: LogEntry) => e.level === "raw");
    expect(raw).toBeDefined();
    expect(raw.message).toBe("this line does not match the format at all");
    expect(raw.ts).toBe("2026-01-01T00:00:00.000Z");
  });

  test("reads rotated files too when the range spans a rotation boundary", async () => {
    fs.writeFileSync(loggingConfigFixture.file, formatLine("2026-01-02T00:00:00.000Z", "INFO", "newer") + "\n");
    fs.writeFileSync(`${loggingConfigFixture.file}.1`, formatLine("2026-01-01T00:00:00.000Z", "INFO", "older") + "\n");

    const res = await get("/api/v1/logs?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z");
    expect(res.status).toBe(200);
    expect(res.json.data.total).toBe(2);
    expect(res.json.data.entries.map((e: LogEntry) => e.message)).toEqual(["newer", "older"]);
  });

  test("limit + offset paginate the filtered set", async () => {
    const lines = [0, 1, 2, 3, 4].map((i) => formatLine(`2026-01-01T00:0${i}:00.000Z`, "INFO", `line ${i}`));
    fs.writeFileSync(loggingConfigFixture.file, lines.join("\n") + "\n");

    const res = await get("/api/v1/logs?limit=2&offset=1");
    expect(res.status).toBe(200);
    expect(res.json.data.total).toBe(5);
    expect(res.json.data.entries.map((e: LogEntry) => e.message)).toEqual(["line 3", "line 2"]);
  });
});

// ── Trailing-JSON meta parsing edge cases (splitMessageAndMeta) ────────────

describe("GET /api/v1/logs — trailing-JSON meta parsing edge cases", () => {
  test("a boundary candidate that fails to parse falls back to the plain message (no meta)", async () => {
    // "{bad}" is not valid JSON (bare identifier as a value). No earlier
    // " {" boundary exists, so the scan exhausts and the whole rest becomes
    // the message.
    fs.writeFileSync(loggingConfigFixture.file, formatLine("2026-01-01T00:00:00.000Z", "INFO", "note {bad}") + "\n");

    const res = await get("/api/v1/logs");
    expect(res.status).toBe(200);
    expect(res.json.data.entries[0].message).toBe("note {bad}");
    expect(res.json.data.entries[0].meta).toBeUndefined();
  });

  test("the scan retries an earlier boundary after a later (nested-looking) one fails to parse", async () => {
    // Rightmost " {" boundary is the inner `{"b":2}` — `{"b":2}}` alone is
    // invalid JSON (an extra closing brace), so the scan backs up to the
    // outer boundary, where the whole `{"a": {"b":2}}` IS valid JSON.
    fs.writeFileSync(
      loggingConfigFixture.file,
      formatLine("2026-01-01T00:00:00.000Z", "INFO", 'note {"a": {"b":2}}') + "\n",
    );

    const res = await get("/api/v1/logs");
    expect(res.status).toBe(200);
    expect(res.json.data.entries[0].message).toBe("note");
    expect(res.json.data.entries[0].meta).toEqual({ a: { b: 2 } });
  });
});

// ── LOG-04: validation before any I/O ───────────────────────────────────────

describe("GET /api/v1/logs — validation before any read (LOG-04)", () => {
  function installSpyReader(): { listFilesCalls: () => number; readTailCalls: () => number } {
    let listFilesCalls = 0;
    let readTailCalls = 0;
    const reader: LogsFileReader = {
      listFiles: () => {
        listFilesCalls++;
        return [];
      },
      readTail: () => {
        readTailCalls++;
        return { content: "", truncated: false };
      },
    };
    __setLogsReaderForTests(reader);
    return { listFilesCalls: () => listFilesCalls, readTailCalls: () => readTailCalls };
  }

  test('unparseable "from" returns 400 naming "from", and never reads a file', async () => {
    const spy = installSpyReader();

    const res = await get("/api/v1/logs?from=not-a-date");
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain('"from"');
    expect(spy.listFilesCalls()).toBe(0);
    expect(spy.readTailCalls()).toBe(0);
  });

  test('unparseable "to" returns 400 naming "to", and never reads a file', async () => {
    const spy = installSpyReader();

    const res = await get("/api/v1/logs?to=garbage");
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('"to"');
    expect(spy.listFilesCalls()).toBe(0);
  });

  test('"from" after "to" returns 400, and never reads a file', async () => {
    const spy = installSpyReader();

    const res = await get("/api/v1/logs?from=2026-02-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z");
    expect(res.status).toBe(400);
    expect(spy.listFilesCalls()).toBe(0);
  });

  test('"limit" over 1000 returns 400 naming "limit", and never reads a file', async () => {
    const spy = installSpyReader();

    const res = await get("/api/v1/logs?limit=1001");
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('"limit"');
    expect(spy.listFilesCalls()).toBe(0);
    expect(spy.readTailCalls()).toBe(0);
  });

  test('non-numeric "limit" returns 400 naming "limit", and never reads a file', async () => {
    const spy = installSpyReader();

    const res = await get("/api/v1/logs?limit=abc");
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('"limit"');
    expect(spy.listFilesCalls()).toBe(0);
    expect(spy.readTailCalls()).toBe(0);
  });

  test('negative "limit" returns 400 naming "limit", and never reads a file', async () => {
    const spy = installSpyReader();

    const res = await get("/api/v1/logs?limit=-1");
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('"limit"');
    expect(spy.listFilesCalls()).toBe(0);
    expect(spy.readTailCalls()).toBe(0);
  });

  test('non-numeric "offset" returns 400 naming "offset", and never reads a file', async () => {
    const spy = installSpyReader();

    const res = await get("/api/v1/logs?offset=abc");
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('"offset"');
    expect(spy.listFilesCalls()).toBe(0);
    expect(spy.readTailCalls()).toBe(0);
  });

  test('negative "offset" returns 400 naming "offset", and never reads a file', async () => {
    const spy = installSpyReader();

    const res = await get("/api/v1/logs?offset=-1");
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('"offset"');
    expect(spy.listFilesCalls()).toBe(0);
    expect(spy.readTailCalls()).toBe(0);
  });

  test("the same validation applies to /export, and never reads a file", async () => {
    const spy = installSpyReader();

    const res = await get("/api/v1/logs/export?from=nope");
    expect(res.status).toBe(400);
    expect(spy.listFilesCalls()).toBe(0);
  });
});

// ── LOG-09: absent file serves the buffer ───────────────────────────────────

describe("GET /api/v1/logs — absent sink file serves the buffer (LOG-09)", () => {
  test("source:\"buffer\" when no sink file exists, entries come from logBuffer", async () => {
    // loggingConfigFixture.file points at a path under tmpDir that was never written.
    logBuffer.push({ ts: "2026-01-01T00:00:00.000Z", level: "info", message: "from buffer" });

    const res = await get("/api/v1/logs");
    expect(res.status).toBe(200);
    expect(res.json.data.source).toBe("buffer");
    expect(res.json.data.entries.map((e: LogEntry) => e.message)).toContain("from buffer");
  });

  test("an unreadable (permission-denied) sink file also falls back to the buffer", async () => {
    fs.writeFileSync(loggingConfigFixture.file, formatLine("2026-01-01T00:00:00.000Z", "INFO", "unreadable") + "\n");
    fs.chmodSync(loggingConfigFixture.file, 0o000);
    logBuffer.push({ ts: "2026-01-01T00:00:00.000Z", level: "info", message: "from buffer" });

    try {
      const res = await get("/api/v1/logs");
      expect(res.status).toBe(200);
      expect(res.json.data.source).toBe("buffer");
    } finally {
      fs.chmodSync(loggingConfigFixture.file, 0o644);
    }
  });
});

// ── realReadTail — direct unit coverage of the real reader's non-happy paths
// ── (unreachable through the route without a >64 MB fixture file) ──────────

describe("realReadTail — non-happy paths (direct call)", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-logs-realreadtail-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("statSync throwing (file does not exist) returns empty content, untruncated", () => {
    const result = realReadTail(path.join(dir, "does-not-exist.log"), 1024);
    expect(result).toEqual({ content: "", truncated: false });
  });

  test("readFileSync throwing on a stat-able but unreadable small file returns empty content, untruncated", () => {
    if (process.getuid?.() === 0) {
      // Root ignores the 0o000 mode bit — the read would succeed, making
      // this case vacuous. Skip under root (CI may run as root).
      return;
    }
    const file = path.join(dir, "unreadable-small.log");
    fs.writeFileSync(file, "short content\n");
    fs.chmodSync(file, 0o000);
    try {
      const result = realReadTail(file, 1024); // size <= maxBytes → non-tail branch
      expect(result).toEqual({ content: "", truncated: false });
    } finally {
      fs.chmodSync(file, 0o644);
    }
  });

  test("size > maxBytes reads the TAIL, discarding a partial leading line fragment", () => {
    const file = path.join(dir, "tail.log");
    fs.writeFileSync(file, "AAAA\nBBBB\nCCCC"); // 14 bytes, no trailing newline
    const result = realReadTail(file, 5);
    // start = 14-5=9 → raw 5 bytes "\nCCCC" → first newline at index 0 → "CCCC"
    expect(result).toEqual({ content: "CCCC", truncated: true });
  });

  test("openSync/readSync throwing on an unreadable file past the tail bound returns empty content, truncated:true", () => {
    if (process.getuid?.() === 0) {
      return;
    }
    const file = path.join(dir, "unreadable-large.log");
    fs.writeFileSync(file, "0123456789012345678901234567890123456789"); // 42 bytes
    fs.chmodSync(file, 0o000);
    try {
      const result = realReadTail(file, 5); // size(42) > maxBytes(5) → tail branch, open denied
      expect(result).toEqual({ content: "", truncated: true });
    } finally {
      fs.chmodSync(file, 0o644);
    }
  });
});

// ── LOG-10: a repeated query with no intervening writes is stable ──────────

describe("GET /api/v1/logs — repeated query is stable (LOG-10)", () => {
  test("two consecutive identical queries return the same entries in the same order", async () => {
    const lines = [
      formatLine("2026-01-01T00:00:00.000Z", "INFO", "a"),
      formatLine("2026-01-01T00:01:00.000Z", "WARN", "b"),
      formatLine("2026-01-01T00:02:00.000Z", "ERROR", "c"),
    ];
    fs.writeFileSync(loggingConfigFixture.file, lines.join("\n") + "\n");

    const first = await get("/api/v1/logs");
    const second = await get("/api/v1/logs");
    expect(first.json.data.entries).toEqual(second.json.data.entries);
    expect(first.json.data.total).toBe(second.json.data.total);
  });
});

// ── LOG-12: buffer size unchanged across a query and an export ─────────────

describe("LOG-12 — reading logs never writes back into the buffer", () => {
  test("logBuffer.size() is unchanged after a range query and an export", async () => {
    logBuffer.push({ ts: "2026-01-01T00:00:00.000Z", level: "info", message: "seed" });
    const sizeBefore = logBuffer.size();

    await get("/api/v1/logs");
    await get("/api/v1/logs/export");

    expect(logBuffer.size()).toBe(sizeBefore);
  });
});

// ── Scan-budget exhaustion sets truncated:true before a later file's own ───
// ── read ever happens ───────────────────────────────────────────────────────

describe("GET /api/v1/logs — scan-budget exhaustion across files", () => {
  test("a first file whose returned content alone consumes the whole 64 MB scan budget truncates before the second file is ever read", async () => {
    // MAX_SCAN_BYTES is a fixed 64 MiB module constant, so the "budget
    // already exhausted before this file" branch (distinct from "this
    // file's own read was truncated") needs a first file whose returned
    // content is itself >= the full budget.
    const BUDGET = 64 * 1024 * 1024;
    const bigContent = "x".repeat(BUDGET); // untruncated per the reader, but consumes the whole budget
    let readTailCalls = 0;
    const reader: LogsFileReader = {
      listFiles: () => ["/fake/one.log", "/fake/two.log"],
      readTail: (file: string) => {
        readTailCalls++;
        if (file === "/fake/one.log") return { content: bigContent, truncated: false };
        throw new Error("the second file must never be read once the budget is exhausted");
      },
    };
    __setLogsReaderForTests(reader);

    // limit=0 keeps the response body small — `total` still reflects the
    // full (huge single-entry) scan, but the giant entry itself is never
    // serialized into the JSON page.
    const res = await get("/api/v1/logs?limit=0");
    expect(res.status).toBe(200);
    expect(res.json.data.truncated).toBe(true);
    expect(res.json.data.total).toBe(1);
    expect(readTailCalls).toBe(1);
  }, 20_000);
});

// ── GET /api/v1/logs/stream — SSE tail (T13, LOG-05) ────────────────────────

describe("GET /api/v1/logs/stream — SSE tail", () => {
  test("a pushed entry reaches the stream as a data: frame", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/logs/stream"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("text/event-stream");
    expect(res.body).not.toBeNull();

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    try {
      // `start()` runs synchronously during Response construction (above),
      // so the subscription is already live by the time we push.
      logBuffer.push({ ts: "2026-01-01T00:00:00.000Z", level: "info", message: "live entry" });
      const { value } = await reader.read();
      const text = decoder.decode(value);
      expect(text.startsWith("data: ")).toBe(true);
      const parsed = JSON.parse(text.slice("data: ".length).trim());
      expect(parsed.message).toBe("live entry");
      expect(parsed.level).toBe("info");
    } finally {
      await reader.cancel().catch(() => {});
    }
  });

  test("cancel() unsubscribes — asserted by the buffer's live subscriber count, not by timing", async () => {
    const before = liveSubscriberCount;

    const res = await app.handle(new Request("http://localhost/api/v1/logs/stream"));
    expect(liveSubscriberCount).toBe(before + 1);

    const reader = res.body!.getReader();
    await reader.cancel();

    expect(liveSubscriberCount).toBe(before);
  });

  test("no logger import guard also covers the stream route (LOG-12)", () => {
    const src = fs.readFileSync(path.join(import.meta.dir, "logs.ts"), "utf8");
    expect(src).not.toMatch(/\blogger\.(debug|info|warn|error)\(/);
  });
});

// ── The live tail follows the SINK FILE, not just this process's buffer ─────
//
// The buffer holds only entries THIS process logged, while the sink is written
// by every massa-ai process — including the stdio MCP server, which is where
// most of an install's traffic comes from. Subscribing to the buffer alone
// made the tail correct and useless: an idle API server streamed nothing while
// the file grew, so a refresh (a range query over the file) was the only thing
// that ever showed the new lines.

describe("GET /api/v1/logs/stream — tails the sink file (cross-process entries)", () => {
  afterEach(() => {
    delete process.env.MASSA_AI_SSE_SINK_POLL_MS;
  });

  test("a line appended by ANOTHER writer reaches the stream, with nothing in this process's buffer", async () => {
    process.env.MASSA_AI_SSE_SINK_POLL_MS = "20";
    const sink = loggingConfigFixture.file as string;
    // The sink exists and has prior content, so the tail starts at its END:
    // history belongs to the range query, not to a live tail.
    fs.writeFileSync(sink, formatLine("2026-01-01T00:00:00.000Z", "INFO", "old line") + "\n");

    const res = await app.handle(new Request("http://localhost/api/v1/logs/stream"));
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    try {
      // Appended the way a different process would: the API server's own
      // logBuffer is never touched here.
      fs.appendFileSync(sink, formatLine("2026-01-01T00:00:01.000Z", "WARN", "from another process") + "\n");

      let text = "";
      // Read until a data: frame arrives (heartbeats and chunk boundaries
      // mean one read is not guaranteed to be the frame).
      for (let i = 0; i < 40 && !text.includes("data: "); i++) {
        const { value } = await reader.read();
        text += decoder.decode(value ?? new Uint8Array(), { stream: true });
      }
      const frame = text.split("\n\n").find((f) => f.startsWith("data: "));
      expect(frame).toBeDefined();
      const parsed = JSON.parse(frame!.slice("data: ".length).trim());
      expect(parsed.message).toBe("from another process");
      expect(parsed.level).toBe("warn");
      // Emphatically not from the buffer — the entry was never pushed there.
      expect(logBuffer.snapshot()).toEqual([]);
    } finally {
      await reader.cancel().catch(() => {});
    }
  }, 15_000);

  test("pre-existing content is not replayed into the tail", async () => {
    process.env.MASSA_AI_SSE_SINK_POLL_MS = "20";
    const sink = loggingConfigFixture.file as string;
    fs.writeFileSync(
      sink,
      formatLine("2026-01-01T00:00:00.000Z", "INFO", "history one") + "\n" +
        formatLine("2026-01-01T00:00:01.000Z", "INFO", "history two") + "\n",
    );

    const res = await app.handle(new Request("http://localhost/api/v1/logs/stream"));
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    try {
      fs.appendFileSync(sink, formatLine("2026-01-01T00:00:02.000Z", "INFO", "the new one") + "\n");
      let text = "";
      for (let i = 0; i < 40 && !text.includes("data: "); i++) {
        const { value } = await reader.read();
        text += decoder.decode(value ?? new Uint8Array(), { stream: true });
      }
      expect(text).toContain("the new one");
      expect(text).not.toContain("history one");
      expect(text).not.toContain("history two");
    } finally {
      await reader.cancel().catch(() => {});
    }
  }, 15_000);

  test("with a readable sink the buffer is NOT also subscribed — no entry arrives twice", async () => {
    // The file is a superset of the buffer (this process writes to it too), so
    // tailing both would double every locally-logged line.
    process.env.MASSA_AI_SSE_SINK_POLL_MS = "20";
    fs.writeFileSync(loggingConfigFixture.file as string, "");
    const before = liveSubscriberCount;

    const res = await app.handle(new Request("http://localhost/api/v1/logs/stream"));
    try {
      expect(liveSubscriberCount).toBe(before);
    } finally {
      await res.body!.getReader().cancel().catch(() => {});
    }
  });

  test("no readable sink falls back to the buffer subscription", async () => {
    // No file written in this test, mirroring LOG-09's own degradation.
    const before = liveSubscriberCount;
    const res = await app.handle(new Request("http://localhost/api/v1/logs/stream"));
    try {
      expect(liveSubscriberCount).toBe(before + 1);
    } finally {
      await res.body!.getReader().cancel().catch(() => {});
    }
  });
});

// ── SSE heartbeat + max-duration auto-close, driven by the per-request env ─
// ── overrides (mirrors events.test.ts's own approach) ───────────────────────

describe("GET /api/v1/logs/stream — heartbeat + auto-close via env overrides", () => {
  afterEach(() => {
    delete process.env.MASSA_AI_SSE_HEARTBEAT_MS;
    delete process.env.MASSA_AI_SSE_MAX_DURATION_MS;
  });

  // Mirrors events.test.ts's own `drain`: polling reads are issued on a
  // fixed interval without waiting for each to resolve first, so each
  // eventually-fulfilled read (in the FIFO order the stream enqueued them)
  // appends its chunk whenever it lands — matching the pattern already
  // proven to observe heartbeat frames in that file.
  async function drain(reader: any, ms: number): Promise<string> {
    const decoder = new TextDecoder();
    let raw = "";
    const timer = setInterval(() => {
      reader.read().then(
        ({ value, done }: any) => {
          if (done) return;
          if (value) raw += decoder.decode(value, { stream: true });
        },
        () => {},
      );
    }, 5);
    await new Promise((r) => setTimeout(r, ms));
    clearInterval(timer);
    return raw;
  }

  test("a heartbeat comment frame arrives, and the stream auto-closes at the overridden max duration", async () => {
    process.env.MASSA_AI_SSE_HEARTBEAT_MS = "10";
    process.env.MASSA_AI_SSE_MAX_DURATION_MS = "50";

    const res = await app.handle(new Request("http://localhost/api/v1/logs/stream"));
    const reader = res.body!.getReader();
    const raw = await drain(reader, 120);
    expect(raw).toContain(": heartbeat");

    // Past max-duration, the close timer has already called controller.close()
    // — a subsequent read resolves done rather than hanging.
    const after = await Promise.race([
      reader.read(),
      new Promise<{ done: boolean }>((resolve) => setTimeout(() => resolve({ done: true }), 300)),
    ]);
    expect(after.done).toBe(true);
    await reader.cancel().catch(() => {});
  }, 15_000);
});

// ── SSE enqueue-throw guards: `controller.enqueue` failing sets `closed` and
// ── stops any further frame from being pushed (both the data path and the
// ── heartbeat path share the same defensive shape) ──────────────────────────

describe("GET /api/v1/logs/stream — enqueue-throw guards close the stream", () => {
  test("a controller.enqueue throw on a pushed entry sets closed and guards further data frames", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/logs/stream"));
    const reader = res.body!.getReader();
    const originalEncode = TextEncoder.prototype.encode;
    try {
      (TextEncoder.prototype as any).encode = function (): never {
        throw new Error("simulated encode failure");
      };
      logBuffer.push({ ts: "2026-01-01T00:00:00.000Z", level: "info", message: "will fail to enqueue" });
    } finally {
      TextEncoder.prototype.encode = originalEncode;
    }

    // `closed` is now true (set inside `enqueue`'s catch) — a subsequent push
    // must never reach `controller.enqueue` at all (enqueue's own `if
    // (closed) return` guard), so no frame ever arrives.
    logBuffer.push({ ts: "2026-01-01T00:00:01.000Z", level: "info", message: "should never arrive" });
    const outcome = await Promise.race([
      reader.read().then(() => "frame-arrived"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 100)),
    ]);
    expect(outcome).toBe("timeout");
    await reader.cancel().catch(() => {});
  }, 15_000);

  test("a controller.enqueue throw during a heartbeat tick sets closed and clears the heartbeat interval", async () => {
    process.env.MASSA_AI_SSE_HEARTBEAT_MS = "10";
    process.env.MASSA_AI_SSE_MAX_DURATION_MS = "5000";
    try {
      const res = await app.handle(new Request("http://localhost/api/v1/logs/stream"));
      const reader = res.body!.getReader();
      const originalEncode = TextEncoder.prototype.encode;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (TextEncoder.prototype as any).encode = function (): never {
          throw new Error("simulated encode failure");
        };
        await new Promise((r) => setTimeout(r, 40)); // let >=1 heartbeat tick fire and throw
      } finally {
        TextEncoder.prototype.encode = originalEncode;
      }

      // The heartbeat's own catch set `closed = true` and cleared its
      // interval — a subsequent push must not produce a frame either.
      logBuffer.push({ ts: "2026-01-01T00:00:02.000Z", level: "info", message: "should never arrive" });
      const outcome = await Promise.race([
        reader.read().then(() => "frame-arrived"),
        new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 100)),
      ]);
      expect(outcome).toBe("timeout");
      await reader.cancel().catch(() => {});
    } finally {
      delete process.env.MASSA_AI_SSE_HEARTBEAT_MS;
      delete process.env.MASSA_AI_SSE_MAX_DURATION_MS;
    }
  }, 15_000);

  test("a heartbeat tick after `closed` was already set by a data-push throw self-clears its own interval", async () => {
    // A data-push throw (unlike the heartbeat's own throw) sets `closed`
    // WITHOUT clearing `heartbeatTimer` — only the heartbeat tick itself, or
    // the max-duration close, does that. So a short heartbeat interval here
    // reaches the heartbeat's `if (closed) { clearInterval(...); return; }`
    // guard on its very next tick.
    process.env.MASSA_AI_SSE_HEARTBEAT_MS = "10";
    process.env.MASSA_AI_SSE_MAX_DURATION_MS = "5000";
    try {
      const res = await app.handle(new Request("http://localhost/api/v1/logs/stream"));
      const reader = res.body!.getReader();
      const originalEncode = TextEncoder.prototype.encode;
      try {
        (TextEncoder.prototype as any).encode = function (): never {
          throw new Error("simulated encode failure");
        };
        logBuffer.push({ ts: "2026-01-01T00:00:00.000Z", level: "info", message: "will fail to enqueue" });
      } finally {
        TextEncoder.prototype.encode = originalEncode;
      }

      // `closed` is true, `heartbeatTimer` is still armed — wait past its
      // next tick, which self-clears on observing `closed`.
      await new Promise((r) => setTimeout(r, 40));

      logBuffer.push({ ts: "2026-01-01T00:00:01.000Z", level: "info", message: "should never arrive" });
      const outcome = await Promise.race([
        reader.read().then(() => "frame-arrived"),
        new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 100)),
      ]);
      expect(outcome).toBe("timeout");
      await reader.cancel().catch(() => {});
    } finally {
      delete process.env.MASSA_AI_SSE_HEARTBEAT_MS;
      delete process.env.MASSA_AI_SSE_MAX_DURATION_MS;
    }
  }, 15_000);
});

// ── Export (LOG-06): explicit Response, real HTTP only ─────────────────────

describe("GET /api/v1/logs/export — txt rendering (renderTxtLine)", () => {
  test("format=txt renders meta as trailing JSON for an entry with meta, and omits it for one without", async () => {
    const lines = [
      formatLine("2026-01-01T00:00:00.000Z", "WARN", "slow query", { ms: 900 }),
      formatLine("2026-01-01T00:01:00.000Z", "INFO", "plain entry"),
    ];
    fs.writeFileSync(loggingConfigFixture.file, lines.join("\n") + "\n");

    const res = await app.handle(new Request("http://localhost/api/v1/logs/export?format=txt"));
    expect(res.status).toBe(200);
    const text = await res.text();
    const textLines = text.split("\n");
    expect(textLines).toContain("[2026-01-01T00:01:00.000Z] [INFO] plain entry");
    expect(textLines).toContain('[2026-01-01T00:00:00.000Z] [WARN] slow query {"ms":900}');
  });
});

describe("GET /api/v1/logs/export — zero-match range still 200s with an empty body", () => {
  test("an export matching zero entries returns 200 with an empty body, never an error", async () => {
    fs.writeFileSync(loggingConfigFixture.file, formatLine("2026-01-01T00:00:00.000Z", "INFO", "only entry") + "\n");
    const res = await app.handle(
      new Request("http://localhost/api/v1/logs/export?from=2030-01-01T00:00:00.000Z&to=2030-01-02T00:00:00.000Z"),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("");
  });
});

// ── Real socket: Content-Type/Content-Disposition + auth gate (AD-011) ─────
// A bare object/string body from an Elysia handler flips the wire
// content-type to text/plain under the node adapter; an in-process
// `.handle()` call cannot observe it (documented trap). These assertions
// MUST run over a real HTTP request.

import { authMiddleware, __setAuthKeyForTests } from "../middleware/auth.js";

const API_KEY = "logs-route-test-key";

async function allocateTcpPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") {
        reservation.close(() => reject(new Error("failed to allocate a TCP port")));
        return;
      }
      reservation.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

const socketApp = new Elysia({ adapter: node() }).use(authMiddleware).use(logsRoutes);

let server: { stop?: () => void } | undefined;
let base = "";

beforeAll(async () => {
  __setAuthKeyForTests(API_KEY);
  const port = await allocateTcpPort();
  base = `http://127.0.0.1:${port}`;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server did not listen in time")), 5000);
    socketApp.listen(port, (srv: unknown) => {
      clearTimeout(timeout);
      server = srv as { stop?: () => void };
      resolve();
    });
  });
});

afterAll(() => {
  server?.stop?.();
  __setAuthKeyForTests(undefined);
});

describe("SEC — /api/v1/logs* over a real socket (LOG-11, AD-011)", () => {
  test("GET /api/v1/logs without a key returns 401 (route is registered, not 404)", async () => {
    const res = await fetch(`${base}/api/v1/logs`);
    expect(res.status).toBe(401);
  }, 15_000);

  test("GET /api/v1/logs/stream without a key returns 401 (route is registered, not 404)", async () => {
    const res = await fetch(`${base}/api/v1/logs/stream`);
    expect(res.status).toBe(401);
  }, 15_000);

  test("GET /api/v1/logs/export without a key returns 401", async () => {
    const res = await fetch(`${base}/api/v1/logs/export`);
    expect(res.status).toBe(401);
  }, 15_000);

  test("GET /api/v1/logs with the key returns 200", async () => {
    const res = await fetch(`${base}/api/v1/logs`, { headers: { "x-api-key": API_KEY } });
    expect(res.status).toBe(200);
  }, 15_000);
});

describe("GET /api/v1/logs/export — real HTTP Content-Type + Content-Disposition (LOG-06)", () => {
  test("format=jsonl (default): application/x-ndjson + attachment filename carrying the range", async () => {
    const res = await fetch(
      `${base}/api/v1/logs/export?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z`,
      { headers: { "x-api-key": API_KEY } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("application/x-ndjson");
    const disposition = res.headers.get("content-disposition") || "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("massa-ai-logs-");
    expect(disposition).toContain(".jsonl");
    await res.text();
  }, 15_000);

  test("format=txt: text/plain + .txt filename", async () => {
    const res = await fetch(`${base}/api/v1/logs/export?format=txt`, {
      headers: { "x-api-key": API_KEY },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("text/plain");
    expect(res.headers.get("content-disposition") || "").toContain(".txt");
    await res.text();
  }, 15_000);

  test("jsonl body is one JSON-parseable LogEntry per line", async () => {
    // Point the real (unmocked-by-reader) route at a real file via the
    // shared loggingConfigFixture — the socket app shares the same module
    // instance as `app`, so this fixture applies to both.
    fs.writeFileSync(loggingConfigFixture.file, formatLine("2026-01-01T00:00:00.000Z", "INFO", "exported line") + "\n");

    const res = await fetch(`${base}/api/v1/logs/export`, { headers: { "x-api-key": API_KEY } });
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(typeof parsed.ts).toBe("string");
      expect(typeof parsed.message).toBe("string");
    }
    expect(text).toContain("exported line");
  }, 15_000);
});
