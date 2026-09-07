/**
 * T1.3 — Auth / Config / Cache (E2E, live stack).
 *
 * Spec: `.specs/features/e2e-feature-battery/tasks.md:25`
 * (`27.auth-config-cache.test.ts`, `EB-AUTH-1..6`, `EB-CFG-1..3`,
 * `EB-CACHE-1..4`, profile `auth`). This file is what closes the historical
 * declared skip at `15.nfr.test.ts:716` ("would require restarting tools-api
 * with a key") — Phase 0 already converted that skip into N18/N19; this suite
 * extends them rather than restating them.
 *
 * ── Required stack profile ────────────────────────────────────────────────
 *   bash scripts/e2e-stack.sh up --profile auth
 *   eval "$(bash scripts/e2e-stack.sh env)"
 *
 * The `auth` profile (`scripts/e2e-stack.sh:154-162`) generates a key and
 * exports it as MASSA_AI_API_KEY, so the accepted credential is *env-sourced*
 * here — that is the live half of the `env > config.json > generated` ladder.
 * Auth is mandatory under AD-011 under EVERY profile, so EB-AUTH-1/2/4/5 also
 * hold under `default`; only EB-AUTH-3's "the accepted key came from the
 * environment" reading is `auth`-specific.
 *
 * ── Gate variables ────────────────────────────────────────────────────────
 *   RUN_E2E=1                 (whole file; `_helpers.E2E_ENABLED`)
 *   MASSA_AI_DEDICATED=1 + MASSA_AI_E2E_PROJECT_PATH + MASSA_AI_API_URL
 *   + DATABASE_URL            (the four fail-closed pins `e2e-stack.sh env`
 *                              emits together; a subset makes
 *                              `assertSafeE2eEnvironment` throw before the
 *                              first HTTP call)
 *   MASSA_AI_API_KEY          (EB-AUTH-3 asserts it is non-empty)
 *   DATABASE_URL              (EB-CACHE-* read the L2 table directly with `pg`)
 *   Ollama up                 (EB-CACHE-* only — a search needs embeddings)
 *
 * ── Declared skips (AC-05: a skip is a declared, reasoned line) ───────────
 *  1. EB-AUTH-2b — "prefix-with-`/`, not `startsWith`" (`auth.ts:51-53`, which
 *     deliberately does NOT exempt `/uixyz`). NOT observable on the live API:
 *     Elysia runs `onBeforeHandle` AFTER route matching, and no route named
 *     `/healthz` / `/uixyz` / `/swaggerx` is registered, so such a path 404s
 *     before auth is consulted. A "must 401" assertion there would prove
 *     nothing. The positive half (exact + `<prefix>/child` are public) IS
 *     asserted. Owner of the negative half: `apps/tools-api/src/middleware/`
 *     unit tests over `isPublicPath`.
 *  2. EB-AUTH-6 — CLOSED (was a declared skip). `*` combined with credentials
 *     is refused at boot (`apps/tools-api/src/startup-config.ts:36-43`). The
 *     old reason said it needed `restart-api --env MASSA_AI_API_CORS_ORIGINS='*'`,
 *     a restart this suite must not perform. That premise was wrong about what
 *     the scenario needs: `buildCorsOptions` is called at
 *     `apps/tools-api/src/index.ts:84`, inside the module-level
 *     `new Elysia(...)` chain, which evaluates BEFORE `app.listen()` at :195.
 *     So the refusal reproduces in a throwaway child process on a scratch
 *     ephemeral port and the shared :3334 stack is never restarted or touched.
 *     Asserted: the exact refusal text, a non-zero exit with no signal, and —
 *     polled independently of the child's own logging — that the scratch port
 *     never accepted a connection. A control boots the same recipe with a real
 *     origin and an unwritable config home, and must instead die at
 *     `initAuthOrExit()` (index.ts:171) — past the CORS gate, short of
 *     `app.listen`; without that control the case would pass for any early
 *     spawn failure. The *default* (empty allowlist) half stays EB-AUTH-5.
 *     Observed red (2026-09-07): swapping the subject value from `*` to
 *     `https://legit.example` boots the child to completion
 *     (`everBound=true`, "massa-ai Tools API running at …") and the case fails
 *     at :668 with `Expected to contain: "Invalid CORS configuration"`.
 *  3. EB-CFG-2a — `--config-set` does not exist as a flag. The CLI surfaces
 *     tasks.md names are `massa-ai --config-show`
 *     (`apps/mcp-client/src/index.ts:39`) and `massa-ai-config set <k> <v>`
 *     (`apps/mcp-client/src/config-cli.ts:196`), and both are already covered
 *     by `13.cli.test.ts:127` and `13.cli.test.ts:253`. Not duplicated here;
 *     EB-CFG-2 covers the *server-side* config surface instead, which has no
 *     live-stack coverage today.
 *  4. EB-CFG-2b — `PUT /api/v1/config` (`routes/config.ts:95`) is deliberately
 *     NOT exercised. It rewrites the running stack's `config.json` (the file
 *     `e2e-stack.sh capture_api_key` reads back), so a write here would change
 *     the credential every sibling suite and every later `restart-api` uses.
 *     Read paths only.
 *  5. EB-CACHE-3b — actual L2 TTL *eviction*. The only eviction triggers are
 *     `SearchCachePg.cleanup()` (`search-cache-pg.ts:371-392`) and the
 *     `expires_at > NOW()` predicate inside `get`
 *     (`search-cache-pg.ts:152-156`); neither has a route, and the in-process
 *     L1 tier (a `Map`, TTL keyed on `createdAt`, `search-cache-pg.ts:135-147`)
 *     answers the same key first, so an out-of-band force-expire of the L2 row
 *     is invisible over HTTP. The TTL *stamp* contract IS asserted.
 *  6. EB-CACHE-4a — the caps. `L1_MAX_SIZE = 100` (`search-cache-pg.ts:48`) is
 *     an in-process `Map` with no cross-process surface at all;
 *     `L2_MAX_SIZE = 10000` (`search-cache-pg.ts:49`) would require 10 000
 *     distinct cached searches against a live embedding stack. The
 *     cross-process half of EB-CACHE-4 IS asserted.
 *
 * No mocks, no stubs, no `mock.module`. Every mutated projectId starts with
 * `e2e-ai-` and is cleaned up in `afterAll`. `SHARED_PID` is read, never reset.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import {
  API,
  API_KEY,
  E2E_ENABLED,
  RUN_STAMP,
  SHARED_PID,
  assertE2ePrefix,
  ensureSharedIndex,
  httpGet,
  httpPost,
  httpRaw,
  pollUntil,
  probeAvailability,
} from "./_helpers";

// ── Gating ──────────────────────────────────────────────────────────────────
let SKIP_REASON = "";
let OLLAMA_REASON = "";
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
  if (!a.OLLAMA_UP) {
    OLLAMA_REASON = "Ollama not up — EB-CACHE-* need embeddings for a real search";
  }
  return true;
})();

const HAS_DB = !!process.env.DATABASE_URL;
const CACHE_READY = READY && !OLLAMA_REASON && HAS_DB;

if (READY && !CACHE_READY) {
  console.log(
    "[EB-CACHE:SKIP] declared skip — EB-CACHE-1..4 need a live search plus a direct " +
      `DATABASE_URL for the L2 table. Reason: ${OLLAMA_REASON || "DATABASE_URL is unset"}.`,
  );
}
if (!READY) {
  console.log(`[27.auth-config-cache:SKIP] declared skip — ${SKIP_REASON}`);
}

// ── Constants ───────────────────────────────────────────────────────────────

/** A registered, non-public route. `/api/v1/config` really exists
 *  (`apps/tools-api/src/routes/config.ts:34`), which is what makes a 401
 *  assertion against it meaningful: an UNregistered path 404s before
 *  `onBeforeHandle` ever runs. */
const PROTECTED_GET = "/api/v1/config";

/** Deliberately unregistered — the control for the route-matching-first trap. */
const UNREGISTERED = `/api/v1/__eb-auth-no-such-route-${RUN_STAMP}`;

const UNAUTHORIZED_BODY = "Unauthorized: Invalid or missing API key";

/** `@massa-ai/shared/config`'s built entry — the exact module the running API
 *  resolves its key through (`apps/tools-api/src/middleware/auth.ts:30`). */
const SHARED_CONFIG_DIST = path.resolve(
  import.meta.dir,
  "../../../../../packages/shared/dist/config/index.js",
);

/** The Tools API's real entrypoint — the same file `e2e-stack.sh:start_api`
 *  launches (`scripts/e2e-stack.sh:369`). EB-AUTH-6 boots a THROWAWAY copy of
 *  it on a scratch port; it never touches the stack's own process. */
const TOOLS_API_ENTRY = path.resolve(
  import.meta.dir,
  "../../../../../apps/tools-api/src/index.ts",
);

const scratchDirs: string[] = [];
/** Raw query strings this file wrote into `search_cache` / `search_events`. */
const cacheQueries: string[] = [];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** A request with NO x-api-key at all. `httpGet`/`httpPost`/`httpRaw` always
 *  attach the configured key, so a bare `fetch` is the only way to observe the
 *  header's absence on the wire — the same reasoning `probeAvailability`'s own
 *  auth probe uses (`_helpers.ts:285-293`). */
function bareFetch(endpoint: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${endpoint}`, { signal: AbortSignal.timeout(30_000), ...init });
}

/** A request with an explicit `x-api-key` override (never the configured one). */
function keyedFetch(endpoint: string, key: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${endpoint}`, {
    signal: AbortSignal.timeout(30_000),
    ...init,
    headers: { "x-api-key": key, ...(init.headers as Record<string, string> | undefined) },
  });
}

async function readBody(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 400) };
  }
}

async function makeScratchConfigHome(label: string): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), `eb-cfg-${label}-`));
  scratchDirs.push(dir);
  return dir;
}

interface ResolvedKeyReport {
  key: string;
  provisioned: boolean;
  source: "env" | "config" | "generated";
}

/**
 * Run the real `resolveApiKey()` from the built `@massa-ai/shared/config` in a
 * fresh child process against a scratch config home.
 *
 * A child process is required, not a convenience: `CONFIG_DIR` is a
 * module-level const (`packages/shared/src/config/config-loader.ts:8`), frozen
 * at first import, so this test process — whose XDG_CONFIG_HOME points at the
 * running stack's config dir — cannot re-target it. The cross-process
 * single-writer election (`api-key.ts:112-162`) is also only observable across
 * real processes.
 */
const RESOLVE_SCRIPT = [
  "const mod = await import(process.env.__EB_SHARED_CONFIG_URL);",
  "const r = mod.resolveApiKey();",
  'process.stdout.write(JSON.stringify({ key: r.key, provisioned: r.provisioned, source: r.source }));',
].join("\n");

function runResolveApiKey(
  configHome: string,
  envApiKey?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "",
      HOME: configHome,
      XDG_CONFIG_HOME: configHome,
      __EB_SHARED_CONFIG_URL: pathToFileURL(SHARED_CONFIG_DIST).href,
    };
    if (envApiKey !== undefined) env.MASSA_AI_API_KEY = envApiKey;

    const child = spawn(process.execPath, ["-e", RESOLVE_SCRIPT], {
      cwd: configHome,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += String(c)));
    child.stderr.on("data", (c) => (stderr += String(c)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

function parseResolved(r: { code: number; stdout: string; stderr: string }): ResolvedKeyReport {
  if (r.code !== 0) {
    throw new Error(
      `resolveApiKey child exited ${r.code}. stderr: ${r.stderr.slice(0, 600)}\n` +
        `If the module is missing, build it: bun run build`,
    );
  }
  return JSON.parse(r.stdout) as ResolvedKeyReport;
}

async function readStoredKey(configHome: string): Promise<string | undefined> {
  const raw = await fsp.readFile(path.join(configHome, "massa-ai", "config.json"), "utf8");
  return (JSON.parse(raw) as { security?: { apiKey?: string } })?.security?.apiKey;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fsp.stat(target);
    return true;
  } catch {
    return false;
  }
}

function lockPathIn(configHome: string): string {
  // packages/shared/src/config/api-key.ts:83 — LOCK_FILENAME
  return path.join(configHome, "massa-ai", ".api-key.provision.lock");
}

function configPathIn(configHome: string): string {
  return path.join(configHome, "massa-ai", "config.json");
}

function newPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

afterAll(async () => {
  for (const dir of scratchDirs) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  // Remove ONLY the rows this file wrote. SHARED_PID itself is never reset —
  // it is the shared index every embedding-heavy suite reuses.
  if (READY && HAS_DB && cacheQueries.length > 0) {
    const pool = newPool();
    try {
      await pool.query("DELETE FROM search_cache WHERE query = ANY($1)", [cacheQueries]);
      await pool.query("DELETE FROM search_events WHERE query = ANY($1)", [cacheQueries]);
    } catch (e) {
      console.log(`[27] search_cache/search_events cleanup skipped: ${String((e as Error).message)}`);
    } finally {
      await pool.end().catch(() => {});
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-AUTH — AD-011: the key is mandatory and is not configurable.
// N18/N19 in 15.nfr.test.ts already assert the 401/200 pair and the blank key
// on /api/v1/workspace/list; this block extends to the error envelope, the
// three public prefixes, the route-matching-first trap, and CORS.
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!READY)("EB-AUTH-1 — a protected route with no key is 401 with the documented envelope", () => {
  test(
    // /api/v1/config — apps/tools-api/src/routes/config.ts:34
    "GET /api/v1/config without x-api-key → 401 + {success:false, error}",
    async () => {
      const res = await bareFetch(PROTECTED_GET);
      const body = await readBody(res);
      console.log(`[EB-AUTH-1] GET ${PROTECTED_GET} no key → ${res.status}`);
      expect(res.status).toBe(401);
      // apps/tools-api/src/middleware/auth.ts:115-118
      expect(body?.success).toBe(false);
      expect(body?.error).toBe(UNAUTHORIZED_BODY);
    },
    30_000,
  );

  test(
    "a wrong key of the right shape is 401, not 403 and not 200",
    async () => {
      const wrong = "f".repeat(64);
      expect(wrong).not.toBe(API_KEY);
      const res = await keyedFetch(PROTECTED_GET, wrong);
      const body = await readBody(res);
      console.log(`[EB-AUTH-1] GET ${PROTECTED_GET} wrong key → ${res.status}`);
      expect(res.status).toBe(401);
      expect(body?.error).toBe(UNAUTHORIZED_BODY);
    },
    30_000,
  );

  test(
    // The trap: Elysia runs onBeforeHandle AFTER route matching, so an
    // unregistered path 404s before auth is consulted. This is the control
    // that makes the two assertions above mean something.
    "an UNREGISTERED path answers 404, not 401 — proving route matching precedes auth",
    async () => {
      const res = await bareFetch(UNREGISTERED);
      console.log(`[EB-AUTH-1] GET ${UNREGISTERED} no key → ${res.status} (expect 404)`);
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(401);
    },
    30_000,
  );
});

describe.skipIf(!READY)("EB-AUTH-2 — the three public prefixes answer without a key", () => {
  // PUBLIC_PATHS = ["/health", "/swagger", "/ui"] — auth.ts:42
  // isPublicPath: exact match OR a child under `${p}/` — auth.ts:51-53
  const PUBLIC_CASES: Array<{ path: string; why: string; expect200?: boolean }> = [
    { path: "/health", why: "exact match, PUBLIC_PATHS[0]", expect200: true },
    { path: "/swagger", why: "exact match, PUBLIC_PATHS[1]", expect200: true },
    { path: "/swagger/json", why: "child of /swagger", expect200: true },
    { path: "/ui", why: "exact match, PUBLIC_PATHS[2]", expect200: true },
    // The `/ui/*` handler falls back to index.html for any unknown
    // non-traversal path (routes/web-ui.ts:253-263), so this is a live route
    // rather than a 404 that would make "not 401" pass vacuously.
    { path: `/ui/__eb-${RUN_STAMP}.txt`, why: "child of /ui (SPA fallback)", expect200: true },
  ];

  for (const { path: p, why, expect200 } of PUBLIC_CASES) {
    test(
      `${p} is served without a key (${why})`,
      async () => {
        const res = await bareFetch(p);
        console.log(`[EB-AUTH-2] GET ${p} no key → ${res.status}`);
        // The contract is "auth is not consulted". "Never 401" is its
        // wire-visible form; the 200 pins it to a route that really exists, so
        // the negative cannot pass vacuously on a 404.
        expect(res.status).not.toBe(401);
        if (expect200) expect(res.status).toBe(200);
      },
      30_000,
    );

    test(
      `${p} answers identically with a WRONG key — the key is not consulted at all`,
      async () => {
        const bare = await bareFetch(p);
        const wrong = await keyedFetch(p, "e".repeat(64));
        console.log(`[EB-AUTH-2] ${p} bare=${bare.status} wrongKey=${wrong.status}`);
        expect(wrong.status).toBe(bare.status);
        expect(wrong.status).not.toBe(401);
      },
      30_000,
    );
  }

  test(
    "GET /health is public but GET /api/v1/config is not — the exemption is a list, not a mode",
    async () => {
      const open = await bareFetch("/health");
      const closed = await bareFetch(PROTECTED_GET);
      expect(open.status).toBe(200);
      expect(closed.status).toBe(401);
    },
    30_000,
  );
});

describe.skipIf(!READY)("EB-AUTH-3 — the credential this environment declares is the only one accepted", () => {
  test(
    "MASSA_AI_API_KEY is non-empty and authenticates GET /api/v1/config",
    async () => {
      // The `auth` profile exports a generated key (e2e-stack.sh:154-162), and
      // `resolveApiKey` returns source "env" whenever it is set
      // (packages/shared/src/config/api-key.ts:171-172). So on this stack the
      // accepted credential is env-sourced by construction.
      expect(API_KEY.length).toBeGreaterThan(0);
      const res = await httpRaw(PROTECTED_GET, { method: "GET" });
      console.log(`[EB-AUTH-3] GET ${PROTECTED_GET} with the declared key → ${res.status}`);
      expect(res.status).toBe(200);
    },
    30_000,
  );

  test(
    "no other key of the same shape is accepted (three independent negatives)",
    async () => {
      for (const candidate of ["0".repeat(64), "a".repeat(32), `${API_KEY}x`]) {
        const res = await keyedFetch(PROTECTED_GET, candidate);
        console.log(`[EB-AUTH-3] candidate len=${candidate.length} → ${res.status}`);
        expect(res.status).toBe(401);
      }
    },
    30_000,
  );

  // The full env > config.json > generated ladder is asserted deterministically
  // against `resolveApiKey` itself in EB-CFG-1 — it needs three different
  // process startups, which this suite must not perform on the shared stack.
});

describe.skipIf(!READY)("EB-AUTH-4 — a whitespace-only key is absent, not a credential", () => {
  test(
    'x-api-key: "   " → 401 (HTTP strips header whitespace, so it arrives as "")',
    async () => {
      const res = await keyedFetch(PROTECTED_GET, "   ");
      const body = await readBody(res);
      console.log(`[EB-AUTH-4] blank key on ${PROTECTED_GET} → ${res.status} (observed)`);
      expect(res.status).toBe(401);
      expect(body?.error).toBe(UNAUTHORIZED_BODY);
    },
    30_000,
  );

  test(
    'x-api-key: "" → 401, the same rejection as the whitespace form',
    async () => {
      const res = await keyedFetch(PROTECTED_GET, "");
      console.log(`[EB-AUTH-4] empty key on ${PROTECTED_GET} → ${res.status} (observed)`);
      expect(res.status).toBe(401);
    },
    30_000,
  );

  test(
    "a key with INTERIOR whitespace is rejected — the guard compares verbatim, it does not normalise",
    async () => {
      // auth.ts:132 compares `providedKey !== configuredApiKey` with no trim
      // and no normalisation. Interior whitespace survives HTTP header
      // handling (only leading/trailing bytes are stripped on the wire), so
      // this is the deterministic half of the whitespace contract.
      expect(API_KEY.length).toBeGreaterThan(10);
      const interior = `${API_KEY.slice(0, 10)} ${API_KEY.slice(10)}`;
      expect(interior).not.toBe(API_KEY);
      const res = await keyedFetch(PROTECTED_GET, interior);
      console.log(`[EB-AUTH-4] key with interior whitespace → ${res.status}`);
      expect(res.status).toBe(401);

      // Observation only, not a coverage claim: leading/trailing header
      // whitespace is stripped by the client before it ever reaches the guard,
      // so a padded-but-correct key is indistinguishable from the correct one
      // on the wire. Recorded rather than asserted in either direction.
      const padded = await keyedFetch(PROTECTED_GET, ` ${API_KEY} `);
      console.log(
        `[EB-AUTH-4] observation — a padded correct key arrived as ${padded.status} ` +
          "(the client strips surrounding header whitespace; the guard never sees it)",
      );
      expect(padded.status).toBeLessThan(500);
    },
    30_000,
  );
});

describe.skipIf(!READY)("EB-AUTH-5 — CORS: the default empty allowlist permits nothing cross-origin", () => {
  const FOREIGN = "https://evil.test";

  test(
    "a foreign Origin gets no Access-Control-Allow-Origin",
    async () => {
      // SEC-02 — buildCorsOptions([]) => {origin:false, credentials:false}
      // (apps/tools-api/src/startup-config.ts:45), wired at index.ts:84.
      const res = await httpRaw(PROTECTED_GET, {
        method: "GET",
        headers: { "x-api-key": API_KEY, Origin: FOREIGN },
      });
      const allowOrigin = res.headers.get("access-control-allow-origin");
      console.log(`[EB-AUTH-5] GET with Origin ${FOREIGN} → ${res.status}, ACAO=${allowOrigin}`);
      expect(allowOrigin).not.toBe(FOREIGN);
      expect(allowOrigin).toBeNull();
    },
    30_000,
  );

  test(
    "no Access-Control-Allow-Credentials is emitted",
    async () => {
      const res = await httpRaw(PROTECTED_GET, {
        method: "GET",
        headers: { "x-api-key": API_KEY, Origin: FOREIGN },
      });
      expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    },
    30_000,
  );

  test(
    "a preflight for a foreign Origin is not granted",
    async () => {
      const res = await bareFetch(PROTECTED_GET, {
        method: "OPTIONS",
        headers: { Origin: FOREIGN, "access-control-request-method": "POST" },
      });
      console.log(`[EB-AUTH-5] OPTIONS preflight → ${res.status}, ACAO=${res.headers.get("access-control-allow-origin")}`);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    },
    30_000,
  );

  test(
    "same-origin requests are unaffected by the closed allowlist",
    async () => {
      const res = await httpRaw(PROTECTED_GET, { method: "GET" });
      expect(res.status).toBe(200);
    },
    30_000,
  );
});

// ── EB-AUTH-6 — `*` is refused at BOOT ──────────────────────────────────────
//
// Previously a declared skip whose stated blocker was "restarting the API is
// the runner's job, not this suite's". That blocker was real but the scenario
// did not need it: `buildCorsOptions` runs at apps/tools-api/src/index.ts:84,
// inside the module-level `new Elysia(...)` chain, which is evaluated BEFORE
// `app.listen()` at :195. So the refusal is observable in a THROWAWAY child
// process on a scratch port — the shared :3334 stack is never touched, never
// restarted, and never even read.
//
// Both cases below spawn `apps/tools-api/src/index.ts` under Bun with this
// process's own (stack-pinned) environment plus two overrides. Neither child
// can reach `registerDefaultJobs` (index.ts:288) — case A dies at :84 and case
// B dies in the EADDRINUSE branch at :214-221 — so neither can write a
// `scheduler_jobs` row and disturb 26.scheduler.test.ts.
describe.skipIf(!READY)("EB-AUTH-6 — a `*` CORS origin is refused before the port binds", () => {
  /** Ask the kernel for a free ephemeral port, then release it. */
  async function freePort(): Promise<number> {
    const srv = net.createServer();
    await new Promise<void>((res, rej) => {
      srv.once("error", rej);
      srv.listen(0, "127.0.0.1", () => res());
    });
    const port = (srv.address() as net.AddressInfo).port;
    await new Promise<void>((res) => srv.close(() => res()));
    return port;
  }

  interface BootAttempt {
    code: number | null;
    signal: NodeJS.Signals | null;
    output: string;
    elapsedMs: number;
    everBound: boolean;
  }

  /**
   * Boot a real Tools API child on `port` with the given CORS value and wait
   * for it to exit. `everBound` is polled independently of the child's own
   * logging so "the port never bound" is an observation, not an inference from
   * the absence of a log line.
   */
  function bootApi(
    port: number,
    corsOrigins: string | undefined,
    budgetMs: number,
    /** Extra overrides; `null` deletes the variable from the child's env. */
    extraEnv: Record<string, string | null> = {},
  ): Promise<BootAttempt> {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    env.MASSA_AI_API_PORT = String(port);
    if (corsOrigins === undefined) delete env.MASSA_AI_API_CORS_ORIGINS;
    else env.MASSA_AI_API_CORS_ORIGINS = corsOrigins;
    for (const [k, v] of Object.entries(extraEnv)) {
      if (v === null) delete env[k];
      else env[k] = v;
    }

    const started = Date.now();
    let everBound = false;
    const probe = setInterval(() => {
      const sock = net.connect({ port, host: "127.0.0.1" });
      sock.once("connect", () => {
        everBound = true;
        sock.destroy();
      });
      sock.once("error", () => sock.destroy());
    }, 100);

    return new Promise<BootAttempt>((resolve, reject) => {
      const child = spawn(process.execPath, [TOOLS_API_ENTRY], {
        cwd: path.dirname(TOOLS_API_ENTRY),
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      const kill = setTimeout(() => child.kill("SIGKILL"), budgetMs);
      child.stdout.on("data", (c) => (output += String(c)));
      child.stderr.on("data", (c) => (output += String(c)));
      child.on("error", (e) => {
        clearInterval(probe);
        clearTimeout(kill);
        reject(e);
      });
      child.on("close", (code, signal) => {
        clearInterval(probe);
        clearTimeout(kill);
        resolve({ code, signal, output, elapsedMs: Date.now() - started, everBound });
      });
    });
  }

  test(
    "EB-AUTH-6: `MASSA_AI_API_CORS_ORIGINS=*` kills the process at startup and no port is bound",
    async () => {
      const port = await freePort();
      const attempt = await bootApi(port, "*", 60_000);

      console.log(
        `[EB-AUTH-6] \`*\` boot on :${port} → code=${attempt.code} signal=${attempt.signal} ` +
          `after ${attempt.elapsedMs} ms, everBound=${attempt.everBound}`,
      );

      // The exact refusal, verbatim from startup-config.ts:37-42. Asserting the
      // MESSAGE and not merely a non-zero exit is what makes this case immune
      // to passing for an unrelated boot failure (a missing module, a bad
      // DATABASE_URL, an unbuilt dependency) — none of those produce this text.
      expect(attempt.output).toContain("Invalid CORS configuration");
      expect(attempt.output).toContain(`"*" is not an allowed origin`);
      expect(attempt.output).toContain("A wildcard cannot be combined with credentials");

      // Died, rather than degraded to a weaker policy.
      expect(attempt.signal).toBeNull();
      expect(attempt.code).not.toBe(0);

      // "…without binding" is the half a message assertion cannot carry.
      expect(attempt.everBound).toBe(false);
      const reachable = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(3_000),
      })
        .then((r) => r.status)
        .catch(() => null);
      expect(reachable).toBeNull();
    },
    180_000,
  );

  test(
    "EB-AUTH-6 control: the same boot recipe gets PAST the CORS gate for a real origin",
    async () => {
      // Without this control the case above would pass for ANY spawn that died
      // early — a missing module, an unbuilt dependency, a bad DATABASE_URL.
      // The control gives the child a VALID allowlist and makes it die at a
      // LATER, known boot stage instead: `initAuthOrExit()` at
      // apps/tools-api/src/index.ts:171, which is past buildCorsOptions (:84)
      // and still short of app.listen (:195) and registerDefaultJobs (:288).
      // So the control binds no port and persists no row.
      //
      // The trigger is a config home that cannot hold a config file: HOME and
      // XDG_CONFIG_HOME both point at a regular FILE, so the generate-and-write
      // branch of resolveApiKey (`api-key.ts`) cannot mkdir, and
      // initAuthOrExit's onFatal exits 1 (startup-config.ts:58-73).
      // MASSA_AI_API_KEY must be cleared or the env tier short-circuits before
      // any disk access.
      //
      // An earlier version of this control used an occupied port and expected
      // the EADDRINUSE branch (index.ts:214-221). It was WRONG and is recorded
      // here so it is not reintroduced: measured 2026-09-07, a `net` blocker on
      // 127.0.0.1:50841 did NOT stop the child from binding — it printed
      // "massa-ai Tools API running at http://localhost:50841" and ran to the
      // 60 s budget. `app.listen` binds the wildcard address, so a loopback-only
      // blocker is not the same socket and `reusePort:false` never sees a
      // conflict. That control also reached registerDefaultJobs, which is
      // exactly the shared-state write this suite must not perform.
      const notADir = path.join(await makeScratchConfigHome("auth6"), "definitely-a-file");
      await fsp.writeFile(notADir, "not a directory\n");
      const port = await freePort();

      const attempt = await bootApi(port, "https://eb-auth6.example", 90_000, {
        HOME: notADir,
        XDG_CONFIG_HOME: notADir,
        MASSA_AI_API_KEY: null,
      });
      console.log(
        `[EB-AUTH-6 control] valid-origin boot on :${port} → code=${attempt.code} ` +
          `signal=${attempt.signal} after ${attempt.elapsedMs} ms, everBound=${attempt.everBound}`,
      );

      // The discriminator this control exists for: boot got past :84.
      expect(attempt.output).not.toContain("Invalid CORS configuration");
      // …and reached :171, which nothing before the CORS gate can produce.
      expect(attempt.output).toContain("cannot start without an API key");
      expect(attempt.code).toBe(1);
      // Still short of :195 — this control must not bind anything either.
      expect(attempt.everBound).toBe(false);
    },
    180_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-CFG — configuration precedence and the server-side config surface.
// ═══════════════════════════════════════════════════════════════════════════

describe.skipIf(!READY)("EB-CFG-1 — key precedence is env > config.json > generated", () => {
  test(
    "env wins: MASSA_AI_API_KEY set → source 'env', nothing is written to disk",
    async () => {
      const home = await makeScratchConfigHome("env");
      const report = parseResolved(await runResolveApiKey(home, "env-declared-key-0123456789"));
      console.log(`[EB-CFG-1] env layer → source=${report.source} provisioned=${report.provisioned}`);
      // packages/shared/src/config/api-key.ts:171-172
      expect(report.source).toBe("env");
      expect(report.provisioned).toBe(false);
      expect(report.key).toBe("env-declared-key-0123456789");
      // Nothing was provisioned, so no config.json was written at all.
      expect(await exists(configPathIn(home))).toBe(false);
    },
    60_000,
  );

  test(
    "no env: a key is generated, persisted, and reported as 'generated'",
    async () => {
      const home = await makeScratchConfigHome("gen");
      const report = parseResolved(await runResolveApiKey(home));
      console.log(`[EB-CFG-1] generated layer → source=${report.source} provisioned=${report.provisioned}`);
      // packages/shared/src/config/api-key.ts:146-150
      expect(report.source).toBe("generated");
      expect(report.provisioned).toBe(true);
      expect(report.key).toMatch(/^[0-9a-f]{64}$/);
      expect(await readStoredKey(home)).toBe(report.key);
      // The exclusive-create lock is always released (api-key.ts:153-159).
      expect(await exists(lockPathIn(home))).toBe(false);
    },
    60_000,
  );

  test(
    "config.json wins over generation, and env still wins over config.json",
    async () => {
      const home = await makeScratchConfigHome("ladder");

      // 1. Cold: generate + persist.
      const first = parseResolved(await runResolveApiKey(home));
      expect(first.source).toBe("generated");

      // 2. Warm, no env: the stored key is reused, never regenerated.
      //
      // The load-bearing contract is the KEY, not the label: the persisted key
      // comes back unchanged and nothing is provisioned a second time.
      const second = parseResolved(await runResolveApiKey(home));
      console.log(`[EB-CFG-1] warm, no env → source=${second.source}`);
      expect(second.provisioned).toBe(false);
      expect(second.key).toBe(first.key);
      expect(await readStoredKey(home)).toBe(first.key);
      // `source` reads "env" here, and that is not a leak from this process —
      // the child is spawned with an explicit four-variable allowlist that does
      // not include MASSA_AI_API_KEY (see runResolveApiKey above). Importing
      // the shared config module SEEDS the variable from config.json, and
      // `resolveApiKey` reads env first (api-key.ts:171), so the "config" tier
      // can never be the reported source in any process that loaded the config
      // module — which is every real caller.
      //
      // Measured directly, same child shape, printing the variable on both
      // sides of the import:
      //   cold  {"beforeImport":null,"afterImport":null,      "source":"generated"}
      //   warm  {"beforeImport":null,"afterImport":"2998c9da…","source":"env"}
      // Same key both times. So the resolution is right and only the label is
      // unreachable — recorded rather than asserted as "config", which would be
      // asserting a state the product cannot produce.
      expect(second.source).toBe("env");

      // 3. Warm, WITH env: env overrides the persisted key without erasing it.
      const third = parseResolved(await runResolveApiKey(home, "override-from-the-environment"));
      console.log(`[EB-CFG-1] warm, with env → source=${third.source}`);
      expect(third.source).toBe("env");
      expect(third.key).toBe("override-from-the-environment");
      expect(third.key).not.toBe(first.key);
      // The file layer is untouched by the env override.
      expect(await readStoredKey(home)).toBe(first.key);
    },
    90_000,
  );
});

describe.skipIf(!READY)("EB-CFG-2 — the server-side config surface", () => {
  test(
    // GET /api/v1/config — apps/tools-api/src/routes/config.ts:34
    "GET /api/v1/config masks every sensitive field and reports restartNeededSections + defaults",
    async () => {
      const body = await httpGet<any>("/api/v1/config");
      expect(body?.success).toBe(true);
      const cfg = body?.data?.config;
      expect(cfg).toBeTruthy();

      // packages/shared/src/config/config-writer.ts:34-41 — MASK_SENTINEL "***"
      //
      // `database.url` is EMPTY on this stack, and that is correct rather than a
      // miss: the dedicated API takes its connection string from the DATABASE_URL
      // environment variable, and the config.json it materialises on boot records
      // `{"url":""}`. Asserting "***" there asserted a value the surface cannot
      // hold, so the claim is stated as what actually matters — the response
      // never carries a real connection string, and a non-empty value is masked.
      const dbUrl = cfg?.database?.url;
      expect(typeof dbUrl).toBe("string");
      expect(dbUrl === "" || dbUrl === "***").toBe(true);
      expect(dbUrl).not.toContain("postgres");
      expect(dbUrl).not.toContain("@");
      expect(JSON.stringify(body)).not.toContain("massa_ai_test");
      // The api key IS non-empty on every profile (AD-011), so it is the surface
      // that proves the mask really fires rather than merely passing through.
      expect(cfg?.security?.apiKey).toBe("***");
      expect(cfg?.security?.apiKey).not.toBe(API_KEY);
      expect(JSON.stringify(body)).not.toContain(API_KEY);
      for (const section of ["llm", "embedding"] as const) {
        if (cfg?.[section]?.apiKey !== undefined) expect(cfg[section].apiKey).toBe("***");
      }

      // restartNeededSections — config-writer.ts:43-52; loadConfig folds the
      // defaults in, so every restart-relevant section is present.
      const restart: string[] = body?.data?.restartNeededSections ?? [];
      console.log(`[EB-CFG-2] restartNeededSections = ${JSON.stringify(restart)}`);
      for (const section of ["database", "embedding", "llm", "security"]) {
        expect(restart).toContain(section);
      }

      // defaults — routes/config.ts:47, masked the same way.
      expect(body?.data?.defaults).toBeTruthy();
      expect(body?.data?.defaults?.security?.corsOrigins).toEqual([]);
    },
    30_000,
  );

  test(
    // GET /api/v1/config/reveal — apps/tools-api/src/routes/config.ts:63
    "reveal is an allowlist: a non-sensitive field is 400, a sensitive one is 200",
    async () => {
      const bad = await httpRaw("/api/v1/config/reveal?section=logging&field=level", { method: "GET" });
      const badBody = await readBody(bad);
      console.log(`[EB-CFG-2] reveal logging.level → ${bad.status}`);
      // routes/config.ts:72-76
      expect(bad.status).toBe(400);
      expect(String(badBody?.error)).toContain("is not a sensitive field");

      const missing = await httpRaw("/api/v1/config/reveal?section=security", { method: "GET" });
      console.log(`[EB-CFG-2] reveal with no field → ${missing.status}`);
      expect(missing.status).toBeGreaterThanOrEqual(400);
      expect(missing.status).toBeLessThan(500);

      const good = await httpRaw("/api/v1/config/reveal?section=security&field=apiKey", { method: "GET" });
      const goodBody = await readBody(good);
      console.log(`[EB-CFG-2] reveal security.apiKey → ${good.status}`);
      expect(good.status).toBe(200);
      expect(goodBody?.success).toBe(true);
      expect(goodBody?.data?.section).toBe("security");
      expect(goodBody?.data?.field).toBe("apiKey");
      expect(typeof goodBody?.data?.value).toBe("string");
      // Whatever it holds, it is NOT the mask — that is the whole point of the route.
      expect(goodBody?.data?.value).not.toBe("***");
    },
    30_000,
  );

  test(
    "the reveal route is itself protected — no key is 401, not a leaked secret",
    async () => {
      const res = await bareFetch("/api/v1/config/reveal?section=security&field=apiKey");
      const body = await readBody(res);
      console.log(`[EB-CFG-2] reveal without a key → ${res.status}`);
      expect(res.status).toBe(401);
      expect(JSON.stringify(body)).not.toContain(API_KEY);
    },
    30_000,
  );
});

describe.skipIf(!READY)("EB-CFG-3 — a concurrent cold start elects exactly one writer", () => {
  test(
    "5 concurrent first-start processes converge on ONE key, with ONE provisioner",
    async () => {
      const home = await makeScratchConfigHome("race");
      const N = 5;

      const reports = (
        await Promise.all(Array.from({ length: N }, () => runResolveApiKey(home)))
      ).map(parseResolved);

      const keys = new Set(reports.map((r) => r.key));
      const provisioners = reports.filter((r) => r.provisioned);
      const generated = reports.filter((r) => r.source === "generated");
      const fromConfig = reports.filter((r) => r.source === "config");

      console.log(
        `[EB-CFG-3] ${N} concurrent cold starts → distinctKeys=${keys.size} ` +
          `provisioned=${provisioners.length} generated=${generated.length} config=${fromConfig.length}`,
      );

      // api-key.ts:112-162 — `open(…, "wx")` is an atomic exclusive create, so
      // exactly one process becomes the provisioner and the losers take the
      // ordinary config.json path. Two winners is the corruption the lock
      // exists to prevent: operators are told to read the key out of
      // config.json, so a process holding a different one rejects every
      // request they then make.
      expect(keys.size).toBe(1);
      expect(provisioners).toHaveLength(1);
      expect(generated).toHaveLength(1);
      expect(fromConfig).toHaveLength(N - 1);

      // The one key everybody agreed on is the one on disk.
      expect(await readStoredKey(home)).toBe([...keys][0]);
      // And the mutex file is gone (api-key.ts:153-159).
      expect(await exists(lockPathIn(home))).toBe(false);
    },
    120_000,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EB-CACHE — the two-tier search cache (SearchCachePg), which has no live-stack
// coverage today. L2 is the `search_cache` table; L1 is a per-instance Map
// inside the API process (packages/core/src/services/search/search-cache-pg.ts).
// ═══════════════════════════════════════════════════════════════════════════

/** A query nothing else in the corpus or in a sibling run can collide with. */
const CACHE_QUERY = `EB-CACHE probe ${RUN_STAMP} unrepeatable phrase`;
/** Exactly the option set hybrid-search.ts:182-189 folds into the cache key. */
const CACHE_SEARCH_BODY = {
  query: CACHE_QUERY,
  projectId: SHARED_PID,
  maxResults: 3,
  minScore: 0.05,
  format: "json",
};

interface CacheRow {
  query: string;
  project_id: string;
  access_count: number;
  ttl_seconds: number;
}

async function readCacheRows(pool: Pool, query: string): Promise<CacheRow[]> {
  const { rows } = await pool.query<CacheRow>(
    `SELECT query,
            project_id,
            access_count,
            EXTRACT(EPOCH FROM (expires_at - created_at))::int AS ttl_seconds
       FROM search_cache
      WHERE query = $1`,
    [query],
  );
  return rows;
}

async function readEventRows(pool: Pool, query: string): Promise<Array<{ cache_hit: boolean }>> {
  const { rows } = await pool.query<{ cache_hit: boolean }>(
    "SELECT cache_hit FROM search_events WHERE query = $1 ORDER BY timestamp ASC",
    [query],
  );
  return rows;
}

describe.skipIf(!CACHE_READY)("EB-CACHE-1/2/3 — miss, then hit; L2 written before any hit; the TTL stamp", () => {
  test(
    "a cold query writes exactly one L2 row, and the repeat is served without touching L2",
    async () => {
      // The shared index is read, never reset (see _helpers.ts:411-421).
      const pid = await ensureSharedIndex();
      expect(pid).toBe(SHARED_PID);
      assertE2ePrefix(pid);
      cacheQueries.push(CACHE_QUERY);

      const pool = newPool();
      try {
        // Precondition: nothing cached for this query anywhere.
        expect(await readCacheRows(pool, CACHE_QUERY)).toHaveLength(0);

        // ── EB-CACHE-1a: the miss. POST /api/v1/search/project —
        //    apps/tools-api/src/routes/search.ts:48
        const first = await httpPost<any>("/api/v1/search/project", CACHE_SEARCH_BODY);
        expect(first?.success).toBe(true);

        // ── EB-CACHE-2: the write path populates L2 in the same `set` that
        //    populates L1 — the INSERT is at search-cache-pg.ts:212-220 and the
        //    L1 `Map.set` at :223, so L1 can never hold an entry L2 lacks. The
        //    observable shadow of that ordering is: the L2 row exists BEFORE
        //    any hit is possible.
        const afterMiss = await pollUntil(async () => (await readCacheRows(pool, CACHE_QUERY)).length === 1, {
          timeoutMs: 60_000,
          intervalMs: 1_000,
        });
        const cached = await readCacheRows(pool, CACHE_QUERY);
        console.log(`[EB-CACHE-2] after the cold search, search_cache rows = ${cached.length}`);
        expect(afterMiss).toBe(true);
        expect(cached).toHaveLength(1);
        expect(cached[0]!.project_id).toBe(SHARED_PID);
        expect(cached[0]!.access_count).toBe(1);

        // ── EB-CACHE-3a: the TTL stamp. search-cache-pg.ts:72 / :218 both
        //    stamp `NOW() + INTERVAL '1 hour'`, i.e. DEFAULT_TTL = 3600 s
        //    (search-cache-pg.ts:50).
        console.log(`[EB-CACHE-3] expires_at - created_at = ${cached[0]!.ttl_seconds}s`);
        expect(cached[0]!.ttl_seconds).toBe(3600);

        // ── EB-CACHE-1b: the hit. Identical body ⇒ identical cache key
        //    (search-cache-pg.ts:92-103 over the normalized option set).
        const second = await httpPost<any>("/api/v1/search/project", CACHE_SEARCH_BODY);
        expect(second?.success).toBe(true);
        expect(second?.data?.results?.length ?? 0).toBe(first?.data?.results?.length ?? 0);

        // Still exactly one row, and `access_count` is STILL 1 — an L2 hit
        // would have run the `access_count + 1` UPDATE at
        // search-cache-pg.ts:171-176. It did not, because L1 answered first
        // (search-cache-pg.ts:135-147). That is the discriminating evidence
        // that the two tiers are real and ordered, not one tier with two names.
        const afterHit = await readCacheRows(pool, CACHE_QUERY);
        console.log(
          `[EB-CACHE-1] after the repeat search, rows=${afterHit.length} access_count=${afterHit[0]?.access_count}`,
        );
        expect(afterHit).toHaveLength(1);
        expect(afterHit[0]!.access_count).toBe(1);

        // And the analytics ledger recorded the miss→hit pair. trackSearch is
        // fire-and-forget (search-analytics-pg.ts:98-103), so poll.
        const sawBoth = await pollUntil(
          async () => {
            const rows = await readEventRows(pool, CACHE_QUERY);
            return rows.some((r) => r.cache_hit === false) && rows.some((r) => r.cache_hit === true);
          },
          { timeoutMs: 60_000, intervalMs: 1_000 },
        );
        const events = await readEventRows(pool, CACHE_QUERY);
        console.log(
          `[EB-CACHE-1] search_events for the probe: ${JSON.stringify(events.map((e) => e.cache_hit))}`,
        );
        // hybrid-search.ts:527 (miss) then hybrid-search.ts:220 (hit).
        expect(sawBoth).toBe(true);
        expect(events[0]!.cache_hit).toBe(false);
        expect(events.some((e) => e.cache_hit === true)).toBe(true);
      } finally {
        await pool.end().catch(() => {});
      }
    },
    900_000,
  );
});

describe.skipIf(!CACHE_READY)("EB-CACHE-4 — L2 is shared across processes; L1 is not", () => {
  test(
    "this test process reads the row the API process wrote, and a differing option set is a different key",
    async () => {
      const pool = newPool();
      try {
        // Cross-process sharing: the row below was written by the Tools API
        // process (:3334), and is read here from a second process over a
        // separate connection. That is the whole of L2's sharing contract —
        // it lives in `search_cache` in PostgreSQL.
        const shared = await readCacheRows(pool, CACHE_QUERY);
        console.log(`[EB-CACHE-4] rows visible from this process: ${shared.length}`);
        expect(shared).toHaveLength(1);
        expect(shared[0]!.project_id).toBe(SHARED_PID);

        // L1 is a `Map` field on the SearchCachePg instance held by the
        // module-level singleton (search/cache-factory.ts:10, search-cache-pg.ts:37).
        // It has no cross-process surface at all, which is exactly why the
        // caps in note 6 of the header are a declared skip rather than a test.

        // Same query, DIFFERENT search-affecting option ⇒ a different key
        // (search-cache-pg.ts:105-126 lists maxResults among them), so a second
        // row appears rather than the first being reused.
        const variantQuery = `${CACHE_QUERY} variant`;
        cacheQueries.push(variantQuery);
        const variantBody = { ...CACHE_SEARCH_BODY, query: variantQuery, maxResults: 7 };
        const res = await httpPost<any>("/api/v1/search/project", variantBody);
        expect(res?.success).toBe(true);

        const materialised = await pollUntil(
          async () => (await readCacheRows(pool, variantQuery)).length === 1,
          { timeoutMs: 60_000, intervalMs: 1_000 },
        );
        const variantRows = await readCacheRows(pool, variantQuery);
        console.log(`[EB-CACHE-4] variant rows = ${variantRows.length}`);
        expect(materialised).toBe(true);
        expect(variantRows).toHaveLength(1);
        expect(variantRows[0]!.ttl_seconds).toBe(3600);
      } finally {
        await pool.end().catch(() => {});
      }
    },
    600_000,
  );
});
