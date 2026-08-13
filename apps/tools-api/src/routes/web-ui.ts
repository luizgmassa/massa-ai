/**
 * Web UI Routes (Phase 8 — read-only memory/search browser, G5).
 *
 * GET /ui/         - Serve the index.html shell
 * GET /ui/<asset>  - Serve a static asset (styles.css, app.js, ...)
 * GET /ui/<path>   - Unknown paths fall back to index.html
 *
 * Reads files verbatim from apps/web-ui/dist/static/. Returns 404 for the whole
 * prefix when WEB_UI_ENABLED=false. Path traversal is guarded. No new core
 * logic; the UI consumes existing /api/v1/* read routes at runtime.
 */

import { Elysia } from "elysia";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getConfiguredApiKey } from "../middleware/auth.js";
import { isTrustedWebUiCaller } from "../web-ui-trust.js";

/**
 * Build the ordered static-dir candidate list.
 *
 * Resolution must not depend on process.cwd(): the API is launched from the
 * monorepo root (`bun run dev:api`), from the package dir (turbo), from a
 * container WORKDIR, and from arbitrary cwds by supervisors. So walk up from
 * the module's own directory first, then from cwd, checking both layouts at
 * every level:
 *   <root>/apps/web-ui/dist/static   (walking up from the monorepo root)
 *   <apps>/web-ui/dist/static        (sibling package, walking up from tools-api)
 * This covers the src layout (src/routes/), the dist layout (dist/), and a
 * cwd anywhere at or below the repo root. The web-ui bundle is now built
 * (`bun run --filter @massa-ai/web-ui build`), so the served files live under
 * its `dist/static`, not the hand-written `src/static` sources.
 *
 * Exported for tests: the route-level tests mock fs.stat, so only a direct
 * unit test on this pure function can catch a wrong candidate path.
 */
export function buildStaticDirCandidates(moduleDir: string, cwd: string): string[] {
  const candidates: string[] = [];
  for (const root of [moduleDir, cwd]) {
    let dir = root;
    for (let i = 0; i < 10; i++) {
      candidates.push(path.resolve(dir, "apps/web-ui/dist/static"));
      candidates.push(path.resolve(dir, "web-ui/dist/static"));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return [...new Set(candidates)];
}

const STATIC_DIR_CANDIDATES = buildStaticDirCandidates(
  path.dirname(fileURLToPath(import.meta.url)),
  process.cwd(),
);

async function resolveStaticDir(): Promise<string | null> {
  for (const dir of STATIC_DIR_CANDIDATES) {
    try {
      const st = await fs.stat(dir);
      if (st.isDirectory()) return dir;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function webUiDisabled(): boolean {
  const env = process.env.WEB_UI_ENABLED;
  if (env === "false" || env === "0") return true;
  return false;
}

/**
 * Resolve `/<sub>` against the static dir, rejecting traversal. Returns the
 * absolute file path or null if it escapes the static root / doesn't exist.
 */
async function resolveSafePath(
  staticDir: string,
  sub: string,
): Promise<{ abs: string; exists: boolean } | null> {
  const cleaned = sub.replace(/^\/+/, "");
  const abs = path.resolve(staticDir, cleaned);
  const rel = path.relative(staticDir, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null; // traversal attempt
  }
  try {
    await fs.stat(abs);
    return { abs, exists: true };
  } catch {
    return { abs, exists: false };
  }
}

/** `"` and `<` are the only characters that can break out of the attribute. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const API_KEY_META_NAME = "massa-ai-api-key";
export const ACCESS_META_NAME = "massa-ai-access";

const CONFIGURE_ACCESS_BANNER =
  `<div id="massa-ai-configure-access" role="status" ` +
  `style="margin:0;padding:12px 16px;background:#fff4e5;color:#663c00;` +
  `border-bottom:1px solid #ffcc80;font:14px/1.5 system-ui,sans-serif">` +
  `<strong>Dashboard access not configured.</strong> This request did not come ` +
  `from the local machine, so the API key was not sent to your browser and no ` +
  `data will load. Open the dashboard from the machine running massa-ai, or ` +
  `read <code>security.apiKey</code> from <code>~/.config/massa-ai/config.json</code> ` +
  `and call the API directly.</div>`;

/**
 * Stamp the shell with the API key for a trusted caller (SEC-05).
 *
 * A trusted caller's page carries `<meta name="massa-ai-api-key">`, which
 * `app.js` reads and sends as `x-api-key`. An untrusted caller gets no key, a
 * marker meta the client uses to skip its authenticated calls, and a visible
 * banner explaining what to do — the banner is server-rendered so it appears
 * even if the script never runs.
 *
 * Exported for tests: this is pure string work, and the route-level tests mock
 * `fs`, so only a direct unit test can catch a malformed injection.
 */
export function injectAccessMarkup(
  html: string,
  apiKey: string | undefined,
  trusted: boolean,
): string {
  const headTag =
    trusted && apiKey
      ? `<meta name="${API_KEY_META_NAME}" content="${escapeAttribute(apiKey)}" />`
      : `<meta name="${ACCESS_META_NAME}" content="configure" />`;

  let out = html.includes("</head>")
    ? html.replace("</head>", `    ${headTag}\n  </head>`)
    : `${headTag}${html}`;

  if (!(trusted && apiKey)) {
    out = out.includes("<body>")
      ? out.replace("<body>", `<body>\n    ${CONFIGURE_ACCESS_BANNER}`)
      : `${CONFIGURE_ACCESS_BANNER}${out}`;
  }

  return out;
}

/**
 * Read index.html and return it with the access markup applied.
 *
 * Returns a Buffer, not a string: a bare-string body makes the node adapter
 * override the manually-set content-type to text/plain on the wire, which
 * in-process tests do not reproduce.
 */
async function readShell(indexPath: string, remoteAddress: string | undefined): Promise<Buffer> {
  const raw = await fs.readFile(indexPath, "utf-8");
  const trusted = isTrustedWebUiCaller(remoteAddress);
  return Buffer.from(injectAccessMarkup(raw, getConfiguredApiKey(), trusted), "utf-8");
}

/** The peer address, per TASK-000: `request.ip` is the only source that works. */
function remoteAddressOf(request: Request): string | undefined {
  return (request as unknown as { ip?: string }).ip;
}

export const webUiRoutes = new Elysia()
  .get(
    "/ui",
    async ({ set, request }) => {
      if (webUiDisabled()) {
        set.status = 404;
        return { status: 404, error: "web ui disabled" };
      }
      const dir = await resolveStaticDir();
      if (!dir) {
        set.status = 500;
        return { status: 500, error: "web ui static dir not found" };
      }
      const indexPath = path.join(dir, "index.html");
      try {
        const body = await readShell(indexPath, remoteAddressOf(request));
        set.headers["content-type"] = contentTypeFor(indexPath);
        return body;
      } catch {
        set.status = 500;
        return { status: 500, error: "index.html missing" };
      }
    },
    {
      detail: {
        tags: ["webUi"],
        summary: "Web UI shell (read-only memory/search browser)",
        description:
          "Serves the massa-ai read-only web UI index.html. The UI consumes /api/v1/* read routes. Disable with WEB_UI_ENABLED=false.",
      },
    },
  )
  .get(
    "/ui/*",
    async ({ params, set, request }) => {
      if (webUiDisabled()) {
        set.status = 404;
        return { status: 404, error: "web ui disabled" };
      }
      const dir = await resolveStaticDir();
      if (!dir) {
        set.status = 500;
        return { status: 500, error: "web ui static dir not found" };
      }
      // Elysia `*` wildcard captures the rest of the path in params["*"].
      const sub = (params as { "*": string })["*"] ?? "";
      const resolved = await resolveSafePath(dir, sub);
      if (!resolved) {
        set.status = 400;
        return { status: 400, error: "invalid path" };
      }
      if (resolved.exists) {
        try {
          const body = await fs.readFile(resolved.abs);
          set.headers["content-type"] = contentTypeFor(resolved.abs);
          return body;
        } catch {
          set.status = 500;
          return { status: 500, error: "read failed" };
        }
      }
      // SPA-style fallback: unknown (non-traversal) path -> index.html. It gets
      // the same access markup as /ui, or a deep link would load the shell with
      // no key and silently fail every request.
      try {
        const body = await readShell(path.join(dir, "index.html"), remoteAddressOf(request));
        set.headers["content-type"] = "text/html; charset=utf-8";
        return body;
      } catch {
        set.status = 404;
        return { status: 404, error: "not found" };
      }
    },
    {
      detail: {
        tags: ["webUi"],
        summary: "Web UI static asset (or index.html fallback)",
        description:
          "Serves a static asset (styles.css, app.js, ...) from the web-ui bundle. Unknown non-traversal paths fall back to index.html.",
      },
    },
  );
