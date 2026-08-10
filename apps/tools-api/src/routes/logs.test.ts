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

import { logsRoutes, __setLogsReaderForTests, type LogsFileReader } from "./logs.js";
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

// ── Export (LOG-06): explicit Response, real HTTP only ─────────────────────

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
