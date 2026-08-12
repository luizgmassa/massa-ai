/**
 * Authenticated API access and the write-mode gate.
 *
 * These three belong together because they share one input: the
 * `massa-ai-api-key` meta tag the server stamps into the shell for a caller it
 * trusts. That tag is the API credential AND the trust signal that turns write
 * mode on, so splitting them would duplicate `readInjectedApiKey` or invert the
 * dependency between two modules that always ship together.
 */

/** The subset of a meta element `readInjectedApiKey` reads. Structural, not
 *  `Element`, so a hostile or partial fake still satisfies the type. */
interface ApiKeyMetaElement {
  getAttribute?: (attr: string) => string | null;
}

/** The subset of a document root `readInjectedApiKey` needs. */
interface ApiKeyDocument {
  querySelector?: (selectors: string) => ApiKeyMetaElement | null;
}

// Every /api/v1/* route now requires a key (SEC-01). The dashboard has no
// login: the server stamps the key into this page's <head> when the request
// came from a caller it trusts, and we read it back here. When the tag is
// absent the caller was untrusted, requests go out without the header, and the
// server answers 401 — the server-rendered banner already explains why.
export function readInjectedApiKey(doc?: ApiKeyDocument | null): string | null {
  try {
    if (!doc || typeof doc.querySelector !== "function") return null;
    const el = doc.querySelector('meta[name="massa-ai-api-key"]');
    if (!el || typeof el.getAttribute !== "function") return null;
    const value = el.getAttribute("content");
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Check if write mode is enabled.
 *
 * Default is ON when the caller is trusted (the massa-ai-api-key meta tag is
 * present in the document, injected by the server for local callers). The
 * MASSA_AI_WEB_WRITE_MODE env flag and the localStorage massa-ai-write-mode
 * value remain as explicit opt-out escape hatches and are checked BEFORE the
 * trusted-caller default so an operator can force write-mode off even when the
 * tag is present.
 */
export function isWriteModeEnabled(): boolean {
  const forcedFlag = (globalThis as typeof globalThis & { MASSA_AI_WEB_WRITE_MODE?: boolean })
    .MASSA_AI_WEB_WRITE_MODE;
  if (typeof globalThis !== "undefined" && forcedFlag === false) return false;
  try {
    if (localStorage.getItem("massa-ai-write-mode") === "false") return false;
  } catch {
    // localStorage unavailable (test/Node without DOM) — fall through
  }
  if (readInjectedApiKey(typeof document !== "undefined" ? document : null)) return true;
  if (typeof globalThis !== "undefined" && forcedFlag === true) return true;
  try {
    return localStorage.getItem("massa-ai-write-mode") === "true";
  } catch {
    return false;
  }
}

interface ApiClientOptions {
  base?: string;
  fetch?: typeof fetch;
  document?: ApiKeyDocument | null;
  apiKey?: string | null;
}

interface ApiRequestInit {
  method?: string;
  body?: unknown;
}

export function createApiClient(opts?: ApiClientOptions): {
  request: (path: string, init?: ApiRequestInit) => Promise<unknown>;
  authHeaders: () => Record<string, string>;
} {
  opts = opts || {};
  const base = opts.base != null ? opts.base : "";
  const fetchImpl = opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
  const doc = opts.document || (typeof document !== "undefined" ? document : null);
  // opts.apiKey is the explicit seam tests use; otherwise read the meta tag.
  const apiKey = opts.apiKey !== undefined ? opts.apiKey : readInjectedApiKey(doc);
  async function request(path: string, init?: ApiRequestInit): Promise<unknown> {
    init = init || {};
    if (!fetchImpl) throw new Error("fetch unavailable");
    const url = base + path;
    const headers: Record<string, string> = {};
    if (init.body) headers["content-type"] = "application/json";
    if (apiKey) headers["x-api-key"] = apiKey;
    const res = await fetchImpl(url, {
      method: init.method || "GET",
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    return await res.text();
  }
  return {
    request,
    authHeaders: (): Record<string, string> => (apiKey ? { "x-api-key": apiKey } : {}),
  };
}
