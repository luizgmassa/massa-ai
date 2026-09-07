/**
 * T1.1 — Observability surfaces (E2E, live stack).
 *
 * Recovers the scope of `12.observability.test.ts`, deleted in `5d43a96f`.
 *
 * ── Scenario IDs covered ────────────────────────────────────────────────────
 *   EB-OBS-1  GET /health, including the additive `parser` readiness block.
 *   EB-OBS-2  GET /api/v1/system/metrics.
 *   EB-OBS-3  POST /api/v1/analytics/ — the analytics surface (summary, cache,
 *             recent, and the tool-level negative path).
 *   EB-OBS-4  GET /api/v1/events — the SSE stream opens and an actually
 *             OBSERVED keep-alive heartbeat frame arrives inside a real budget.
 *   EB-OBS-5  GET /swagger and GET /swagger/json are served with NO x-api-key.
 *   EB-OBS-6  GET /ui is served and is public.
 *   EB-OBS-7  Typed error envelope: a schema-invalid body returns a 4xx typed
 *             envelope, never INTERNAL_ERROR; an unmatched route returns the
 *             typed 404 envelope.
 *
 * ── Stack profile required ──────────────────────────────────────────────────
 *   `bash scripts/e2e-stack.sh up --profile default`
 *   Nothing here depends on the profile's extra environment; `default` is the
 *   cheapest profile that satisfies the four fail-closed pins. Every case also
 *   passes unchanged under `auth`, `hooks-off`, `scheduler-on` and `llm-on`.
 *
 * ── Gate variables ──────────────────────────────────────────────────────────
 *   RUN_E2E=1                    (E2E_ENABLED — the whole file self-skips otherwise)
 *   MASSA_AI_API_URL / MASSA_AI_DEDICATED / MASSA_AI_E2E_PROJECT_PATH / DATABASE_URL
 *                                (the four pins `e2e-stack.sh env` emits together)
 *   MASSA_AI_API_KEY             (auth is mandatory under AD-011; `env` always exports one)
 *   MASSA_AI_SSE_HEARTBEAT_MS    (read only to SIZE the EB-OBS-4 budget, never asserted)
 *
 * ── Declared skips (AC-05: a skip is a declared, reasoned line) ─────────────
 *   1. WHOLE FILE — skipped with a printed reason when RUN_E2E != 1 or the
 *      Tools API is not answering /health at MASSA_AI_API_URL.
 *   2. EB-OBS-6b ("/ui serves the HTML shell") — skipped with a printed reason
 *      when `apps/web-ui/dist/static` does not exist in this checkout. The
 *      route reads that directory verbatim (`web-ui.ts:38-51`, :58-68) and
 *      `e2e-stack.sh` does not build the bundle, so on a fresh worktree /ui
 *      answers 500 "web ui static dir not found". The PUBLIC half of EB-OBS-6
 *      (EB-OBS-6a) is NOT skipped — it holds in both states and is the
 *      load-bearing security claim.
 *   3. NOT COVERED HERE, and deliberately: the `/api/v1/logs` read surface and
 *      its live SSE tail. It is its own feature area with its own suite
 *      (`apps/tools-api/src/routes/logs.test.ts`, 44 KB) and is not part of the
 *      `EB-OBS-1..7` scenario set this task owns.
 *   4. NOT ASSERTED: `parser.requiredExtensions === 33` as a literal. The
 *      count is read from `LANGUAGE_MANIFEST` in THIS checkout and compared
 *      against the live server's own reported number — a cross-process build
 *      identity check rather than a hardcoded example. (Today that value is 33;
 *      the assertion tracks the manifest instead of freezing the figure.)
 *
 * ── Known trap respected ────────────────────────────────────────────────────
 *   Returning a bare string body from an Elysia handler overrides the wire
 *   content-type to `text/plain`. Every assertion below is made against a real
 *   HTTP response object (status + `content-type` header + body), never against
 *   a body someone already parsed for us.
 *
 * Read-only: no production source, schema or dist changes. No mocks, no stubs,
 * no `mock.module` — this is the live-stack tier.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  API,
  API_KEY,
  E2E_ENABLED,
  PREFIX,
  RUN_STAMP,
  assertE2ePrefix,
  httpRaw,
  probeAvailability,
  resetProject,
} from "./_helpers";
// The manifest the server validates against. Imported so EB-OBS-1 compares the
// LIVE server's `requiredExtensions` against this checkout's manifest length
// instead of freezing a literal (`parser-readiness.ts:86-91`, :178-184).
import { LANGUAGE_MANIFEST } from "../../services/structural/language-manifest.js";

// ── Gating ──────────────────────────────────────────────────────────────────
let SKIP_REASON = "";
const READY = await (async () => {
  if (!E2E_ENABLED) {
    SKIP_REASON = "RUN_E2E != 1";
    return false;
  }
  const a = await probeAvailability();
  if (!a.API_UP) {
    SKIP_REASON = `Tools API not up at ${API}`;
    return false;
  }
  return true;
})();

/** Repo root, resolved from this module — never from `process.cwd()`. */
const REPO_ROOT = path.resolve(import.meta.dir, "../../../../../");
/** `web-ui.ts:43` builds exactly this candidate; the route 500s without it. */
const WEB_UI_STATIC_DIR = path.join(REPO_ROOT, "apps/web-ui/dist/static");
const WEB_UI_BUILT = existsSync(WEB_UI_STATIC_DIR);

// Read-only analytics probe id. Nothing is written under it, but it still
// carries the e2e prefix and is reset in afterAll like every other id here.
const PID = `${PREFIX}obs-${RUN_STAMP}`;
assertE2ePrefix(PID);

/**
 * The server's own heartbeat interval default (`sse-keepalive.ts:37`,
 * resolved per request at `:71-73`). Read here ONLY to size EB-OBS-4's budget
 * — the value itself is never asserted, because it belongs to the server's
 * environment and this process may not share it.
 */
const HEARTBEAT_MS = Number(process.env.MASSA_AI_SSE_HEARTBEAT_MS) || 5_000;

// ── Local SSE reader (no shared-helper edits; `_helpers.ts` has no SSE seam) ──

interface SseRead {
  status: number;
  contentType: string | null;
  text: string;
  matched: boolean;
  elapsedMs: number;
}

/**
 * Open an SSE endpoint and read frames until `predicate(accumulated)` is true
 * or `budgetMs` elapses. Returns what was actually received — never a sleep
 * followed by an assumption. The reader is cancelled on the way out so the
 * server-side `cancel()` teardown (`events.ts:144-149`) releases its
 * subscriptions and timers.
 */
async function readSseUntil(
  endpoint: string,
  predicate: (accumulated: string) => boolean,
  budgetMs: number,
): Promise<SseRead> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  let text = "";
  let matched = false;
  let status = 0;
  let contentType: string | null = null;
  try {
    const res = await fetch(`${API}${endpoint}`, {
      headers: API_KEY ? { "x-api-key": API_KEY } : {},
      signal: controller.signal,
    });
    status = res.status;
    contentType = res.headers.get("content-type");
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      try {
        while (!matched) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          matched = predicate(text);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    }
  } catch {
    // Budget exhausted (AbortError) or the socket dropped. `matched` stays
    // false and the caller asserts on that — the failure message then carries
    // the frames that DID arrive.
  } finally {
    clearTimeout(timer);
  }
  return { status, contentType, text, matched, elapsedMs: Date.now() - started };
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

beforeAll(() => {
  if (!READY) {
    console.log(`[EB-OBS:SKIP] whole file skipped — ${SKIP_REASON}`);
    return;
  }
  if (!WEB_UI_BUILT) {
    console.log(
      `[EB-OBS-6b:SKIP] ${WEB_UI_STATIC_DIR} is absent — the Web UI bundle is ` +
        `not built in this checkout (build it with ` +
        `\`bun run --filter @massa-ai/web-ui build\`). EB-OBS-6a (public, no key) still runs.`,
    );
  }
});

afterAll(async () => {
  if (!READY) return;
  try {
    await resetProject(PID);
  } catch {
    /* the probe id was never written to; a failed reset is not a test failure */
  }
});

// ── EB-OBS-1 — /health, including the parser readiness block ────────────────
describe.skipIf(!READY)("EB-OBS-1 /health + parser readiness", () => {
  test(
    "EB-OBS-1: /health is public, typed, and reports a coherent parser snapshot",
    async () => {
      // /health — apps/tools-api/src/index.ts:166
      // Public path — apps/tools-api/src/middleware/auth.ts:42
      // Deliberately keyless: /health being reachable with no credential is
      // half of what this scenario asserts.
      const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(15_000) });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");

      const body = (await res.json()) as any;

      // buildHealthResponse — apps/tools-api/src/health.ts:12-23
      expect(body.status).toBe("ok");
      expect(body.service).toBe("massa-ai-tools-api");
      expect(body.version).toBe("1.0.0");
      expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);

      // ParserReadinessSnapshot — packages/core/src/services/structural/parser-readiness.ts:21-27
      const parser = body.parser;
      expect(parser).toBeDefined();
      expect(["pending", "validating", "ready", "failed"]).toContain(parser.status);
      expect(Number.isInteger(parser.requiredExtensions)).toBe(true);
      expect(Number.isInteger(parser.validatedExtensions)).toBe(true);
      expect(Array.isArray(parser.errors)).toBe(true);

      // Cross-process build identity: the live server counts the same manifest
      // this checkout holds (33 entries today). Asserting the manifest rather
      // than the number keeps this from becoming a hardcoded example.
      expect(parser.requiredExtensions).toBe(LANGUAGE_MANIFEST.length);
      expect(parser.requiredExtensions).toBeGreaterThan(0);

      // The two invariants runValidation establishes by construction
      // (parser-readiness.ts:178-184 for ready, :190-196 for failed).
      if (parser.status === "ready") {
        expect(parser.validatedExtensions).toBe(parser.requiredExtensions);
        expect(parser.errors.length).toBe(0);
        expect(Number.isNaN(Date.parse(parser.checkedAt))).toBe(false);
      }
      if (parser.status === "failed") {
        expect(parser.validatedExtensions).toBe(0);
        expect(parser.errors.length).toBeGreaterThan(0);
        for (const diagnostic of parser.errors) {
          expect(typeof diagnostic.code).toBe("string");
          expect(diagnostic.code.length).toBeGreaterThan(0);
          expect(typeof diagnostic.message).toBe("string");
          // boundedDiagnostic truncates to 240 chars (parser-readiness.ts:40, :106).
          expect(diagnostic.message.length).toBeLessThanOrEqual(240);
        }
      }

      // A live indexing stack must have a READY parser; anything else means
      // the grammars did not validate and indexing is unavailable
      // (index.ts:226-231). Reported here rather than tolerated.
      expect(parser.status).toBe("ready");
    },
    30_000,
  );
});

// ── EB-OBS-2 — /api/v1/system/metrics ───────────────────────────────────────
describe.skipIf(!READY)("EB-OBS-2 system metrics", () => {
  test(
    "EB-OBS-2: /api/v1/system/metrics returns a typed aggregate snapshot",
    async () => {
      // /api/v1/system/metrics — apps/tools-api/src/routes/system.ts:121
      const res = await httpRaw("/api/v1/system/metrics");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");

      const body = (await res.json()) as any;
      expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);

      const system = body.system;
      expect(system).toBeDefined();

      // uptime is process.uptime() in seconds (system.ts:142).
      expect(typeof system.uptime).toBe("number");
      expect(system.uptime).toBeGreaterThan(0);

      // formatBytes() output — three human strings (system.ts:143-147).
      for (const key of ["heapUsed", "heapTotal", "rss"] as const) {
        expect(typeof system.memory[key]).toBe("string");
        expect(system.memory[key]).toMatch(/^[\d.]+ (Bytes|KB|MB|GB)$/);
      }

      // getDatabaseInfo() yields `sizeBytes: number | null` (system.ts:39-47),
      // and the route derives the formatted string from exactly that value
      // (system.ts:140-141). Assert they agree — a formatted string beside a
      // null size, or vice versa, is the defect this pair catches.
      const bytes = system.databaseSizeBytes;
      const formatted = system.databaseSize;
      expect(bytes === null || typeof bytes === "number").toBe(true);
      if (bytes === null) {
        expect(formatted).toBeNull();
      } else {
        expect(bytes).toBeGreaterThan(0);
        expect(typeof formatted).toBe("string");
        expect(formatted).toMatch(/^[\d.]+ (Bytes|KB|MB|GB)$/);
      }
    },
    30_000,
  );

  test(
    "EB-OBS-2: /api/v1/system/metrics requires the API key",
    async () => {
      // Negative control for the same path — AD-011: metrics is not a public
      // path (apps/tools-api/src/middleware/auth.ts:42), so a keyless call is
      // rejected before the handler runs.
      const res = await fetch(`${API}/api/v1/system/metrics`, {
        signal: AbortSignal.timeout(15_000),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
      expect(String(body.error)).toContain("Unauthorized");
      expect(body.system).toBeUndefined();
    },
    30_000,
  );
});

// ── EB-OBS-3 — the analytics surface ────────────────────────────────────────
describe.skipIf(!READY)("EB-OBS-3 analytics", () => {
  /** POST /api/v1/analytics/ — apps/tools-api/src/routes/analytics.ts:19-20 */
  async function analytics(body: unknown): Promise<{ status: number; contentType: string | null; json: any }> {
    const res = await httpRaw("/api/v1/analytics/", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      contentType: res.headers.get("content-type"),
      json: (await res.json()) as any,
    };
  }

  test(
    "EB-OBS-3: type=summary returns the tool's typed summary payload",
    async () => {
      const res = await analytics({ type: "summary" });
      expect(res.status).toBe(200);
      expect(res.contentType).toContain("application/json");
      // GetAnalyticsTool.handle envelope — packages/core/src/tools/get_analytics.ts:121-129
      expect(res.json.success).toBe(true);
      expect(res.json.data.type).toBe("summary");
      // getSummary — packages/core/src/services/search/search-analytics-pg.ts:236-256
      expect(typeof res.json.data.result.totalSearches).toBe("number");
      expect(res.json.data.result.totalSearches).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(res.json.data.result.topQueries)).toBe(true);
    },
    60_000,
  );

  test(
    "EB-OBS-3: type=cache returns the four cache-performance numbers",
    async () => {
      const res = await analytics({ type: "cache" });
      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
      expect(res.json.data.type).toBe("cache");
      // getCachePerformance — search-analytics-pg.ts:296-328
      for (const key of [
        "hitRate",
        "avgCacheHitDuration",
        "avgCacheMissDuration",
        "speedup",
      ] as const) {
        expect(typeof res.json.data.result[key]).toBe("number");
        expect(Number.isFinite(res.json.data.result[key])).toBe(true);
      }
    },
    60_000,
  );

  test(
    "EB-OBS-3: type=recent echoes the scoping projectId and returns a list",
    async () => {
      const res = await analytics({ type: "recent", projectId: PID, limit: 5 });
      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
      expect(res.json.data.type).toBe("recent");
      // The echo is conditional on the caller supplying it (get_analytics.ts:125).
      expect(res.json.data.projectId).toBe(PID);
      // getRecentSearches — search-analytics-pg.ts:330+ returns SearchEvent[].
      expect(Array.isArray(res.json.data.result)).toBe(true);
    },
    60_000,
  );

  test(
    "EB-OBS-3: type=query without `query` is refused by the tool, not by a 500",
    async () => {
      // The route schema marks `query` optional (analytics.ts:37), so this body
      // passes validation and the TOOL performs the refusal
      // (get_analytics.ts:89-95). A 200 carrying success:false is the contract.
      const res = await analytics({ type: "query" });
      expect(res.status).toBe(200);
      expect(res.json.success).toBe(false);
      expect(res.json.error).toBe("query is required for type='query'");
    },
    60_000,
  );
});

// ── EB-OBS-4 — SSE stream opens and a heartbeat is OBSERVED ─────────────────
describe.skipIf(!READY)("EB-OBS-4 SSE keep-alive", () => {
  test(
    "EB-OBS-4: /api/v1/events opens as text/event-stream and delivers connected + heartbeat",
    async () => {
      // /api/v1/events — apps/tools-api/src/routes/events.ts:19-20
      //
      // Both numbers here are load-bearing and both come from the product:
      //   TRANSPORT_IDLE_WINDOW_MS = 10_000  (sse-keepalive.ts:28)
      //   SSE_HEARTBEAT_MS_DEFAULT =  5_000  (sse-keepalive.ts:37)
      // The heartbeat MUST arrive before the transport's idle window drops the
      // socket. This asserts an actually-received `: heartbeat` frame — a sleep
      // followed by "the request did not error" would pass even if the frame
      // never came, which is precisely the defect sse-keepalive.ts exists for.
      const budgetMs = Math.min(60_000, HEARTBEAT_MS * 4 + 10_000);
      const read = await readSseUntil(
        "/api/v1/events",
        (text) => text.includes(": heartbeat"),
        budgetMs,
      );

      expect(read.status).toBe(200);
      expect(read.contentType).toContain("text/event-stream");

      // The initial frame the handler enqueues at stream start (events.ts:131-138).
      expect(read.text).toContain('"event":"connected"');

      if (!read.matched) {
        throw new Error(
          `EB-OBS-4: no ": heartbeat" frame within ${budgetMs} ms ` +
            `(waited ${read.elapsedMs} ms). Frames received: ` +
            JSON.stringify(read.text.slice(0, 500)),
        );
      }
      expect(read.matched).toBe(true);

      // A heartbeat that arrives instantly would mean the interval is not the
      // one under test; one that arrives after the un-widened transport window
      // would mean the socket should already have dropped.
      expect(read.elapsedMs).toBeGreaterThanOrEqual(HEARTBEAT_MS * 0.5);
    },
    120_000,
  );

  test(
    "EB-OBS-4: /api/v1/events requires the API key",
    async () => {
      // Negative control: the SSE route is not a public path
      // (apps/tools-api/src/middleware/auth.ts:42).
      const res = await fetch(`${API}/api/v1/events`, {
        signal: AbortSignal.timeout(15_000),
      });
      expect(res.status).toBe(401);
      expect(res.headers.get("content-type")).not.toContain("text/event-stream");
      await res.body?.cancel().catch(() => undefined);
    },
    30_000,
  );
});

// ── EB-OBS-5 — /swagger and /swagger/json are public ────────────────────────
describe.skipIf(!READY)("EB-OBS-5 swagger", () => {
  test(
    "EB-OBS-5: GET /swagger is served with no x-api-key, as HTML",
    async () => {
      // /swagger — apps/tools-api/src/index.ts:86 (the @elysiajs/swagger plugin,
      // default `path: "/swagger"`); public path — middleware/auth.ts:42.
      // Keyless on purpose: publicness IS the assertion.
      const res = await fetch(`${API}/swagger`, { signal: AbortSignal.timeout(20_000) });
      expect(res.status).not.toBe(401);
      expect(res.status).toBe(200);
      // Asserted on the wire, not on a parsed body — a bare-string handler body
      // would arrive as text/plain here while looking right in-process.
      expect(res.headers.get("content-type")).toContain("text/html");
      const text = await res.text();
      expect(text.length).toBeGreaterThan(0);
    },
    30_000,
  );

  test(
    "EB-OBS-5: GET /swagger/json is served with no x-api-key, as the OpenAPI doc",
    async () => {
      // /swagger/json — the plugin's `specPath` defaults to `${path}/json`;
      // it is public via the `/swagger` prefix rule in isPublicPath
      // (apps/tools-api/src/middleware/auth.ts:51-53).
      const res = await fetch(`${API}/swagger/json`, { signal: AbortSignal.timeout(20_000) });
      expect(res.status).not.toBe(401);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");

      const doc = (await res.json()) as any;
      // The documentation block index.ts:87-93 hands the plugin.
      expect(doc.info.title).toBe("massa-ai Tools API");
      expect(doc.info.version).toBe("1.0.0");
      expect(typeof doc.paths).toBe("object");
      // The security scheme AD-011 documents (index.ts:119-129).
      expect(doc.components.securitySchemes.ApiKeyAuth.type).toBe("apiKey");
      expect(doc.components.securitySchemes.ApiKeyAuth.name).toBe("x-api-key");
      expect(doc.components.securitySchemes.ApiKeyAuth.in).toBe("header");
    },
    30_000,
  );

  test(
    "EB-OBS-5: the /swagger prefix does not exempt a decoy sibling path",
    async () => {
      // isPublicPath matches `p` exactly or `${p}/` — never a bare startsWith
      // (apps/tools-api/src/middleware/auth.ts:51-53). `/swaggerui` is not a
      // registered route on the live server, so the discriminating claim here
      // is only that it is NOT served as if it were the docs.
      const res = await fetch(`${API}/swaggerui`, { signal: AbortSignal.timeout(15_000) });
      expect(res.status).not.toBe(200);
      await res.body?.cancel().catch(() => undefined);
    },
    30_000,
  );
});

// ── EB-OBS-6 — /ui is served and public ─────────────────────────────────────
describe.skipIf(!READY)("EB-OBS-6 web UI shell", () => {
  test(
    "EB-OBS-6a: GET /ui is public — it is never answered with 401",
    async () => {
      // /ui — apps/tools-api/src/routes/web-ui.ts:193-194
      // Public path — apps/tools-api/src/middleware/auth.ts:42, and the reason
      // is stated at :36-41: authMiddleware is registered BEFORE webUiRoutes,
      // so without the exemption the key-injecting handler could never run.
      //
      // This half holds whether or not the bundle is built, which is why it is
      // not behind the EB-OBS-6b gate.
      const res = await fetch(`${API}/ui`, { signal: AbortSignal.timeout(20_000) });
      expect(res.status).not.toBe(401);
      await res.body?.cancel().catch(() => undefined);
    },
    30_000,
  );
});

describe.skipIf(!READY || !WEB_UI_BUILT)("EB-OBS-6b web UI shell is served", () => {
  test(
    "EB-OBS-6b: GET /ui returns the HTML shell with a text/html wire content-type",
    async () => {
      // /ui — apps/tools-api/src/routes/web-ui.ts:193-194; the handler sets
      // `content-type` from contentTypeFor() at :208. Asserted over a real
      // socket because the node adapter is where a bare-string body would be
      // rewritten to text/plain (auth-http.test.ts:212-217 guards the same
      // property at the unit tier).
      const res = await fetch(`${API}/ui`, { signal: AbortSignal.timeout(20_000) });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const html = await res.text();
      expect(html.length).toBeGreaterThan(0);
      expect(html.toLowerCase()).toContain("<html");
    },
    30_000,
  );
});

// ── EB-OBS-7 — the typed error envelope ─────────────────────────────────────
describe.skipIf(!READY)("EB-OBS-7 typed error envelope", () => {
  test(
    "EB-OBS-7: a schema-invalid body returns 400 INVALID_REQUEST, never INTERNAL_ERROR",
    async () => {
      // POST /api/v1/analytics/ — apps/tools-api/src/routes/analytics.ts:19-20.
      // `type` is a closed union (analytics.ts:26-35), so "nope" is a VALIDATION
      // failure. errorHandler maps VALIDATION/PARSE to a typed 400
      // (apps/tools-api/src/middleware/error.ts:39-48).
      //
      // The unit-tier contract with this exact shape is
      // `apps/tools-api/src/middleware/error.test.ts:111-127`. This assertion is
      // strictly stricter: same exact envelope, PLUS the wire status, PLUS the
      // wire content-type, PLUS a leak check that no TypeBox internals escaped.
      const res = await httpRaw("/api/v1/analytics/", {
        method: "POST",
        body: JSON.stringify({ type: "nope" }),
      });

      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain("application/json");

      const body = (await res.json()) as any;
      expect(body).toEqual({
        success: false,
        error: { code: "INVALID_REQUEST", message: "The request failed validation" },
      });

      // The load-bearing negative: a client mistake must never be reported as
      // a server fault.
      expect(body.error.code).not.toBe("INTERNAL_ERROR");
      expect(res.status).toBeLessThan(500);

      // No TypeBox / framework internals in the payload.
      const serialized = JSON.stringify(body);
      for (const leak of ["expected", "Expected", "schema", "anyOf", "/type", "elysia"]) {
        expect(serialized).not.toContain(leak);
      }
    },
    30_000,
  );

  test(
    "EB-OBS-7: a malformed JSON body also returns the typed 4xx envelope",
    async () => {
      // PARSE shares the VALIDATION branch (middleware/error.ts:39).
      const res = await httpRaw("/api/v1/analytics/", {
        method: "POST",
        body: "{ this is not json",
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(res.headers.get("content-type")).toContain("application/json");

      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
      expect(typeof body.error.code).toBe("string");
      expect(body.error.code).not.toBe("INTERNAL_ERROR");
    },
    30_000,
  );

  test(
    "EB-OBS-7: an unmatched route returns the typed 404 envelope",
    async () => {
      // NOT_FOUND branch — apps/tools-api/src/middleware/error.ts:52-61.
      // Unit-tier twin: error.test.ts:39-50. The stamp keeps the path unique
      // per run so no future route can silently start matching it.
      const res = await httpRaw(`/api/v1/no-such-route-${RUN_STAMP}`);

      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");

      const body = (await res.json()) as any;
      expect(body).toEqual({
        success: false,
        error: { code: "NOT_FOUND", message: "Route not found" },
      });
    },
    30_000,
  );
});
