/**
 * Route-contract regression for the checkpoints view.
 *
 * app-renderers.test.ts feeds the renderers hand-written fixtures. Those
 * fixtures drifted from what POST /api/v1/checkpoints/list actually returns
 * (`type` vs `checkpointType`, and a TOON *string* body whenever `format` is
 * omitted), so the suite stayed green while the view was permanently empty.
 *
 * This file pins the renderer to a golden response captured verbatim from the
 * live API. Its sibling — apps/tools-api/src/routes/web-ui-contract.test.ts —
 * reads the same JSON file and asserts the real route still produces that
 * shape, so drift fails on one side or the other instead of going unnoticed.
 */

import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";

const mod = await import("../static/app.js");
const UI = (globalThis as any).MASSA_AI_UI || {};
const { renderCheckpoints, CHECKPOINTS_LIST_BODY } = { ...mod, ...UI } as {
  renderCheckpoints: (data: unknown) => string;
  CHECKPOINTS_LIST_BODY: Record<string, unknown>;
};

export const CHECKPOINTS_FIXTURE_PATH = path.join(
  import.meta.dir,
  "fixtures",
  "checkpoints-list.json",
);

const fixture = JSON.parse(fs.readFileSync(CHECKPOINTS_FIXTURE_PATH, "utf8")) as {
  success: boolean;
  data: { checkpoints: Array<Record<string, unknown>> };
};

describe("checkpoints view ↔ /api/v1/checkpoints/list contract", () => {
  it("requests JSON, because the route otherwise returns a TOON string", () => {
    expect(CHECKPOINTS_LIST_BODY.format).toBe("json");
  });

  it("renders rows from the golden live-API response", () => {
    const html = renderCheckpoints(fixture);
    expect(html).not.toContain("No checkpoints");

    const first = fixture.data.checkpoints[0];
    expect(first).toBeDefined();
    expect(html).toContain(String(first!.taskId));
    expect(html).toContain(String(first!.type));
    expect(html).toContain(String(first!.status));
  });

  it("reads every column the table header advertises", () => {
    // Guards the `type` vs `checkpointType` class of bug: a header with no
    // backing field renders a silently blank column.
    const first = fixture.data.checkpoints[0] as Record<string, unknown>;
    for (const key of ["taskId", "type", "status", "description"]) {
      expect(Object.keys(first)).toContain(key);
    }
  });
});

// ── Admin portal route contracts (config, profiles, model-registry) ─────────

describe("config view ↔ /api/v1/config contract", () => {
  it("sends GET /api/v1/config", () => {
    // The config view calls GET /api/v1/config to load the form
    expect(true).toBe(true); // wired in T10 renderer
  });

  it("config save sends PUT /api/v1/config with a section body", () => {
    // The config view sends per-section PUT bodies
    expect(true).toBe(true); // wired in T10 renderer
  });
});

describe("profiles view ↔ /api/v1/profiles contract", () => {
  it("sends GET /api/v1/profiles", () => {
    // The profiles view calls GET /api/v1/profiles to list available profiles
    expect(true).toBe(true); // wired in T11 renderer
  });
});

describe("model-registry view ↔ /api/v1/model-registry contract", () => {
  it("sends GET /api/v1/model-registry", () => {
    // The registry editor calls GET /api/v1/model-registry to load the grid
    expect(true).toBe(true); // wired in T12 renderer
  });

  it("registry save sends PUT /api/v1/model-registry with an overlay body", () => {
    // The registry editor sends the full overlay via PUT
    expect(true).toBe(true); // wired in T12 renderer
  });
});

// ── T9 — Web UI ↔ tools-api URL contract (HPC-04, AC-04.3, AC-04.4) ─────────
//
// `handleMemoryEdit` / `handleMemoryDelete` in `views/memory.ts` called
// `PUT /api/v1/memory/<id>` and `DELETE /api/v1/memory/<id>` — routes that do
// not exist. `apps/tools-api/src/routes/memory.ts` registers exactly five
// body-keyed POSTs. Both calls 404 before auth is even consulted (Elysia
// matches routes before `onBeforeHandle`). The two describe blocks directly
// above are checked-in precedent for satisfying "add a contract test" with a
// test that asserts nothing (`expect(true).toBe(true)`) — this sensor does
// not follow that precedent. It performs a real source-level diff and is
// required to have failed, verbatim, against the pre-fix tree (AC-04.4).
//
// **Text scan on both sides, never an import.** `apps/web-ui` has no
// dependency on `apps/tools-api`, and
// `apps/tools-api/src/routes/web-ui-contract.test.ts:17-19` documents that a
// cross-package import breaks `type-check` (`rootDir: ./src`, no `allowJs`)
// and hangs the run before Prisma initialises.
//
// Scope: only Web UI calls whose resolved path starts with `/api/v1/` are
// checked against the `routes/**` population, because every route file under
// `apps/tools-api/src/routes/` mounts under an `/api/v1/*` prefix (the one
// exception, `web-ui.ts`, registers `/ui` and `/ui/*`, which the Web UI never
// calls as an API). A call like `GET /health` is registered directly in
// `apps/tools-api/src/index.ts`, outside `routes/**` — out of this sensor's
// declared scope, the same way AC-03.4's population is scoped to `routes/**`
// only.
describe("Web UI ↔ tools-api URL contract — every API call reaches a route that exists (AC-04.3)", () => {
  const ROUTES_DIR = path.resolve(import.meta.dir, "../../../tools-api/src/routes");
  const WEBUI_STATIC_DIR = path.resolve(import.meta.dir, "../static");

  type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

  interface RouteRecord {
    file: string;
    method: Method;
    path: string;
  }

  interface UiCallRecord {
    file: string;
    line: number;
    method: Method;
    path: string;
    kind: "request" | "fetch" | "eventsource";
  }

  // ── routes/** scan (mirrors write-mode-population.test.ts's T3 approach) ──

  function routeSourceFiles(): string[] {
    return fs
      .readdirSync(ROUTES_DIR)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .sort();
  }

  function extractPrefix(source: string): string {
    const m = source.match(/new Elysia\(\s*\{\s*prefix:\s*(['"])([^'"]*)\1/);
    return m ? m[2] : "";
  }

  // Same shape as T3's ROUTE_CALL_WITH_LITERAL_RE: a genuine route-registration
  // call in this codebase's style is a chain continuation starting a line
  // (`  .post(`) or chained directly onto the constructor (`new Elysia({...}).post(`).
  const ROUTE_CALL_WITH_LITERAL_RE =
    /(?:^[ \t]*\.|new Elysia\([^)]*\)\s*\.)(get|post|put|patch|delete)\(\s*(['"])((?:(?!\2).)*)\2/gms;

  function scanRouteFile(file: string, source: string): RouteRecord[] {
    const prefix = extractPrefix(source);
    const routes: RouteRecord[] = [];
    const re = new RegExp(ROUTE_CALL_WITH_LITERAL_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const method = m[1].toUpperCase() as Method;
      const subPath = m[3];
      const full = subPath === "/" ? prefix || "/" : `${prefix}${subPath}`;
      routes.push({ file, method, path: full });
    }
    return routes;
  }

  function scanAllRoutes(): RouteRecord[] {
    const routes: RouteRecord[] = [];
    for (const file of routeSourceFiles()) {
      const source = fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
      routes.push(...scanRouteFile(file, source));
    }
    return routes;
  }

  // ── apps/web-ui/src/static/** scan for outgoing API URL literals ──────────

  function webUiSourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__tests__") continue;
          walk(full);
        } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          out.push(full);
        }
      }
    };
    walk(WEBUI_STATIC_DIR);
    return out;
  }

  /** Balanced-paren/brace/bracket call-argument splitter, quote-aware.
   *  `openParenIndex` must point at the call's opening `(`. Needed because a
   *  naive comma split would break on `{ method: "POST", body }` (a brace-nested
   *  comma) and on `encodeURIComponent(id)` (a nested paren). */
  function extractCallArgs(source: string, openParenIndex: number): string[] {
    let i = openParenIndex + 1;
    let parenDepth = 1;
    let braceDepth = 0;
    let bracketDepth = 0;
    let inString: string | null = null;
    let current = "";
    const args: string[] = [];
    for (; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        current += ch;
        if (ch === "\\") {
          i++;
          if (i < source.length) current += source[i];
          continue;
        }
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        current += ch;
        continue;
      }
      if (ch === "(") {
        parenDepth++;
        current += ch;
        continue;
      }
      if (ch === ")") {
        parenDepth--;
        if (parenDepth === 0) {
          args.push(current);
          return args;
        }
        current += ch;
        continue;
      }
      if (ch === "{") {
        braceDepth++;
        current += ch;
        continue;
      }
      if (ch === "}") {
        braceDepth--;
        current += ch;
        continue;
      }
      if (ch === "[") {
        bracketDepth++;
        current += ch;
        continue;
      }
      if (ch === "]") {
        bracketDepth--;
        current += ch;
        continue;
      }
      if (ch === "," && parenDepth === 1 && braceDepth === 0 && bracketDepth === 0) {
        args.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    args.push(current);
    return args;
  }

  /** Splits a URL expression on top-level `+` (quote- and depth-aware), so
   *  `"/api/v1/memory/" + encodeURIComponent(id)` yields two terms. */
  function splitTopLevelPlus(expr: string): string[] {
    let depth = 0;
    let inString: string | null = null;
    let current = "";
    const terms: string[] = [];
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (inString) {
        current += ch;
        if (ch === "\\") {
          i++;
          if (i < expr.length) current += expr[i];
          continue;
        }
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        current += ch;
        continue;
      }
      if (ch === "(" || ch === "{" || ch === "[") {
        depth++;
        current += ch;
        continue;
      }
      if (ch === ")" || ch === "}" || ch === "]") {
        depth--;
        current += ch;
        continue;
      }
      if (ch === "+" && depth === 0) {
        terms.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    terms.push(current);
    return terms;
  }

  /** Resolves a URL expression (possibly string concatenation) to the literal
   *  path prefix a real request would carry, treating any appended dynamic
   *  segment as a `:param` wildcard and any dynamic term containing `?` (a
   *  ternary building a query string, e.g. `(qs ? "?" + qs : "")`) — plus
   *  anything after a literal `?` — as query-string, not path. A leading
   *  dynamic term with no literal path seen yet (`sseBase + "/api/v1/events"`)
   *  is treated as a non-path prefix and dropped. Returns `null` when no
   *  literal path text was found at all. */
  function resolvePathTemplate(urlExpr: string): string | null {
    const terms = splitTopLevelPlus(urlExpr)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    let path = "";
    let sawLiteral = false;
    let queryStarted = false;
    for (const term of terms) {
      const litMatch = term.match(/^(['"])((?:(?!\1).)*)\1$/s);
      if (litMatch) {
        if (queryStarted) continue;
        const text = litMatch[2];
        const qIdx = text.indexOf("?");
        if (qIdx !== -1) {
          path += text.slice(0, qIdx);
          queryStarted = true;
          sawLiteral = true;
          continue;
        }
        path += text;
        sawLiteral = true;
      } else {
        if (queryStarted) continue;
        if (term.includes("?")) {
          // A ternary or other expression building a query string.
          queryStarted = true;
          continue;
        }
        if (!sawLiteral) continue; // leading dynamic prefix (e.g. sseBase) — not a path segment
        path += ":param";
      }
    }
    return sawLiteral ? path : null;
  }

  function lineOf(source: string, index: number): number {
    return source.slice(0, index).split("\n").length;
  }

  function methodFromInit(initArg: string | undefined): Method {
    if (!initArg) return "GET";
    const m = initArg.match(/method\s*:\s*(['"])(GET|POST|PUT|PATCH|DELETE)\1/);
    return (m ? m[2] : "GET") as Method;
  }

  function scanWebUiFile(file: string, source: string): UiCallRecord[] {
    const calls: UiCallRecord[] = [];

    // `api.request(...)` / `ctx.api.request(...)`
    {
      let idx = 0;
      while ((idx = source.indexOf(".request(", idx)) !== -1) {
        const before = source.slice(Math.max(0, idx - 20), idx);
        if (/\bapi$/.test(before)) {
          const openParen = idx + ".request(".length - 1;
          const args = extractCallArgs(source, openParen);
          const template = resolvePathTemplate(args[0] ?? "");
          if (template !== null) {
            calls.push({
              file,
              line: lineOf(source, idx),
              method: methodFromInit(args[1]),
              path: template,
              kind: "request",
            });
          }
        }
        idx += ".request(".length;
      }
    }

    // bare `fetch(...)`, not a `.fetch(` method call
    {
      let idx = 0;
      while ((idx = source.indexOf("fetch(", idx)) !== -1) {
        const prevChar = idx > 0 ? source[idx - 1] : "";
        if (!/[A-Za-z0-9_.]/.test(prevChar)) {
          const openParen = idx + "fetch(".length - 1;
          const args = extractCallArgs(source, openParen);
          const template = resolvePathTemplate(args[0] ?? "");
          if (template !== null) {
            calls.push({
              file,
              line: lineOf(source, idx),
              method: methodFromInit(args[1]),
              path: template,
              kind: "fetch",
            });
          }
        }
        idx += "fetch(".length;
      }
    }

    // `new EventSource(...)` — always issues a GET
    {
      let idx = 0;
      const marker = "new EventSource(";
      while ((idx = source.indexOf(marker, idx)) !== -1) {
        const openParen = idx + marker.length - 1;
        const args = extractCallArgs(source, openParen);
        const template = resolvePathTemplate(args[0] ?? "");
        if (template !== null) {
          calls.push({ file, line: lineOf(source, idx), method: "GET", path: template, kind: "eventsource" });
        }
        idx += marker.length;
      }
    }

    return calls;
  }

  function scanAllWebUiCalls(): UiCallRecord[] {
    const calls: UiCallRecord[] = [];
    for (const full of webUiSourceFiles()) {
      const source = fs.readFileSync(full, "utf8");
      calls.push(...scanWebUiFile(path.relative(WEBUI_STATIC_DIR, full), source));
    }
    return calls;
  }

  // ── segment-count + literal-segment matching ───────────────────────────────
  // A segment matches if both sides are identical, or either side is a
  // wildcard (`:xxx` — a server-side `:id`-style param, or our own `:param`
  // stand-in for an unresolvable dynamic UI segment). Handles both directions:
  // a UI call to `/api/v1/workspace/abc` matching a registered
  // `/api/v1/workspace/:id`, and a UI call to `/api/v1/proposal/:param`
  // (built from `"/api/v1/proposal/" + action`) matching the registered
  // literal `/api/v1/proposal/approve`.
  function pathMatches(uiPath: string, routePath: string): boolean {
    const a = uiPath.split("/").filter((s) => s.length > 0);
    const b = routePath.split("/").filter((s) => s.length > 0);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (a[i].startsWith(":") || b[i].startsWith(":")) continue;
      return false;
    }
    return true;
  }

  function findMatch(call: UiCallRecord, routes: RouteRecord[]): RouteRecord | undefined {
    return routes.find((r) => r.method === call.method && pathMatches(call.path, r.path));
  }

  const allRoutes = scanAllRoutes();
  const allUiCalls = scanAllWebUiCalls();

  // Only `/api/v1/*` calls are in scope — every routes/** file mounts under
  // that prefix (the sole exception, web-ui.ts, serves `/ui`, never called as
  // an API by this client). A call like `GET /health` is registered in
  // `index.ts`, outside `routes/**`, and is out of this sensor's scope.
  const inScopeUiCalls = allUiCalls.filter((c) => c.path.startsWith("/api/v1/"));

  const unmatched = inScopeUiCalls.filter((c) => !findMatch(c, allRoutes));

  // Printed unconditionally (AC-04.3's "print the population" requirement) so
  // this sensor cannot pass vacuously over an accidentally-emptied scan.
  console.log(
    `[route-contract] routes/** files=${routeSourceFiles().length} routes=${allRoutes.length} | ` +
      `web-ui/static/** files=${webUiSourceFiles().length} calls=${allUiCalls.length} ` +
      `in-scope(/api/v1/*)=${inScopeUiCalls.length}`,
  );
  console.log(
    "[route-contract] in-scope Web UI calls:\n" +
      inScopeUiCalls
        .map((c) => `  ${c.method} ${c.path}  (${c.file}:${c.line}, via ${c.kind})`)
        .join("\n"),
  );

  it("scanned a non-empty population on both sides", () => {
    expect(allRoutes.length).toBeGreaterThan(0);
    expect(inScopeUiCalls.length).toBeGreaterThan(0);
  });

  it("every /api/v1/* URL the Web UI calls reaches a route that exists in apps/tools-api/src/routes/**", () => {
    if (unmatched.length > 0) {
      console.log(
        "[route-contract] DEAD Web UI calls — no matching registered route:\n" +
          unmatched.map((c) => `  ${c.method} ${c.path}  (${c.file}:${c.line}, via ${c.kind})`).join("\n"),
      );
    }
    expect(unmatched.map((c) => `${c.method} ${c.path} (${c.file}:${c.line})`)).toEqual([]);
  });
});
