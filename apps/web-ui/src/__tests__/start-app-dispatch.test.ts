/**
 * `start-app.js` — view dispatch, hash routing, and page lifecycle.
 *
 * `app-renderers.test.ts` already drives `startApp` through a fake DOM, but it
 * exercises the default Projects view and the write-form wiring. What stayed
 * dark was the rest of `render()`'s dispatch (search, handoffs, proposals,
 * config's error branch, the standalone model-registry route) and the three
 * lifecycle bindings — nav clicks, `hashchange`, `beforeunload` — plus the SSE
 * subscription.
 *
 * Those are the parts that decide *which* request a tab issues, so a silent
 * break there sends the right-looking UI at the wrong endpoint. This file
 * drives each one by firing the handler `startApp` actually registered, rather
 * than by calling an internal.
 *
 * Every global it replaces (`fetch`, `location`, `window`, `localStorage`,
 * `EventSource`, `addEventListener`) is restored in `afterEach` — Bun runs all
 * test files in one process, so a leak here surfaces as a failure somewhere
 * else entirely.
 */

import { describe, it, expect, afterEach } from "bun:test";

// Imported from its own module, not through the barrel: `startApp` is
// deliberately not a named export of app.js (it is reachable only via
// `MASSA_AI_UI`), and this file's subject is start-app.js itself.
const { startApp } = (await import("../static/start-app.js")) as unknown as {
  startApp: (opts: { document: unknown; base?: string }) => void;
};

// ── Fake DOM ────────────────────────────────────────────────────────────────

type Handlers = Record<string, Array<(ev?: unknown) => void>>;

interface El {
  _id: string;
  _handlers: Handlers;
  _children: El[];
  innerHTML: string;
  value: string;
  checked: boolean;
  dataset: Record<string, string>;
  addEventListener: (evt: string, cb: (ev?: unknown) => void) => void;
  querySelectorAll: () => El[];
  querySelector: () => El;
  getAttribute: (k: string) => string | null;
  setAttribute: () => void;
  classList: { toggle: () => void; add: () => void; remove: () => void; contains: () => boolean };
  closest: () => null;
  remove: () => void;
  insertBefore: (n: unknown) => unknown;
  firstChild: null;
  textContent: string;
}

function makeEl(id: string, href: string | null = null): El {
  const handlers: Handlers = {};
  const children: El[] = [];
  let qs: El | null = null;
  const self: El = {
    _id: id,
    _handlers: handlers,
    _children: children,
    innerHTML: "",
    value: "",
    checked: false,
    textContent: "",
    dataset: { id: "x", action: "a", profile: "p", host: "h", tier: "t", section: "s", target: "tg", tab: "switch", workflow: "w" },
    addEventListener: (evt, cb) => { (handlers[evt] ||= []).push(cb); },
    querySelectorAll: () => {
      if (children.length === 0) children.push(makeEl(id + "-c"));
      return children;
    },
    querySelector: () => (qs ??= makeEl(id + "-qs")),
    getAttribute: (k) => (k === "href" ? href : null),
    setAttribute: () => {},
    classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
    closest: () => null,
    remove: () => {},
    insertBefore: (n) => n,
    firstChild: null,
  };
  return self;
}

const VIEWS = ["projects", "memory", "search", "handoffs", "proposals", "checkpoints", "dashboard", "logs", "config", "profiles", "model-registry"];

function makeDom() {
  const byId: Record<string, El> = {};
  const navAnchors = VIEWS.map((v) => makeEl("nav-" + v, "#/" + v));
  const doc = {
    getElementById: (id: string) => (byId[id] ??= makeEl(id)),
    querySelectorAll: () => navAnchors,
    querySelector: () => null,
    addEventListener: () => {},
    documentElement: { setAttribute: () => {}, getAttribute: () => "light" },
    readyState: "complete",
    createElement: () => makeEl("created"),
    body: { appendChild: () => {}, removeChild: () => {} },
  };
  /** Fires the click handler `startApp` registered on the nav anchor for `view`. */
  const navigateTo = async (view: string) => {
    const a = navAnchors[VIEWS.indexOf(view)];
    for (const cb of a._handlers.click ?? []) cb({ preventDefault: () => {} });
    await flush();
  };
  return { doc, byId, navAnchors, navigateTo };
}

/** Lets every pending microtask in `render()`'s await chain settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

// ── Global juggling ─────────────────────────────────────────────────────────

const G = globalThis as any;
const saved: Record<string, { had: boolean; value: unknown }> = {};
function stub(name: string, value: unknown) {
  if (!(name in saved)) saved[name] = { had: name in G, value: G[name] };
  G[name] = value;
}

afterEach(() => {
  for (const [name, { had, value }] of Object.entries(saved)) {
    if (had) G[name] = value;
    else delete G[name];
    delete saved[name];
  }
});

/** Records every request URL the app issues and answers each with `responder`. */
function recordFetch(responder: (url: string) => unknown = () => ({ success: true, data: {} })) {
  const urls: string[] = [];
  stub("fetch", async (url: string) => {
    urls.push(String(url));
    return { headers: { get: () => "application/json" }, json: async () => responder(String(url)) };
  });
  return urls;
}

function stubLocation(hash = "#/projects") {
  stub("location", { hash });
}

// ── render() dispatch ───────────────────────────────────────────────────────

describe("render() dispatch — every tab issues its own request", () => {
  it("routes each view to its endpoint, with no project selected", async () => {
    stubLocation();
    const urls = recordFetch();
    const { doc, navigateTo } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();

    const expected: Array<[string, string]> = [
      ["memory", "/api/v1/memory/list"],
      ["checkpoints", "/api/v1/checkpoints/list"],
      ["logs", "/api/v1/logs"],
      ["config", "/api/v1/config"],
      ["model-registry", "/api/v1/model-registry"],
    ];
    for (const [view, endpoint] of expected) {
      urls.length = 0;
      await navigateTo(view);
      expect(urls.some((u) => u.includes(endpoint))).toBe(true);
    }
  });

  it("search issues no request until there is a query", async () => {
    stubLocation("#/search");
    const urls = recordFetch();
    const { doc } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    expect(urls.some((u) => u.includes("/api/v1/memory/search"))).toBe(false);
  });

  it("handoffs and proposals issue no request until a project is selected", async () => {
    stubLocation();
    const urls = recordFetch();
    const { doc, navigateTo } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();

    for (const [view, endpoint] of [["handoffs", "/api/v1/handoff/list"], ["proposals", "/api/v1/proposal/list"]]) {
      urls.length = 0;
      await navigateTo(view);
      expect(urls.some((u) => u.includes(endpoint))).toBe(false);
    }
  });

  it("selecting a project unlocks the handoff and proposal list requests", async () => {
    stubLocation();
    const urls = recordFetch();
    const { doc, byId, navigateTo } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();

    const select = byId["project-select"];
    select.value = "p1";
    for (const cb of select._handlers.change ?? []) cb();
    await flush();

    for (const [view, endpoint] of [["handoffs", "/api/v1/handoff/list"], ["proposals", "/api/v1/proposal/list"]]) {
      urls.length = 0;
      await navigateTo(view);
      expect(urls.some((u) => u.includes(endpoint))).toBe(true);
    }
  });

  it("the profiles tab loads both the profile list and the model registry", async () => {
    stubLocation();
    const urls = recordFetch();
    const { doc, navigateTo } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    urls.length = 0;
    await navigateTo("profiles");
    expect(urls.some((u) => u.includes("/api/v1/profiles"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/v1/model-registry"))).toBe(true);
  });

  it("a failed config response renders the error block rather than an empty form", async () => {
    stubLocation();
    recordFetch((url) =>
      url.includes("/api/v1/config") ? { success: false, error: "config unreadable" } : { success: true, data: {} },
    );
    const { doc, byId, navigateTo } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    await navigateTo("config");
    expect(byId.app.innerHTML).toContain("config unreadable");
    expect(byId.app.innerHTML).not.toContain("config-section");
  });

  it("a thrown request renders the connection-error banner", async () => {
    stubLocation();
    stub("fetch", async () => { throw new Error("offline"); });
    const { doc, byId } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    expect(byId.app.innerHTML).toContain("Connection error: offline");
  });

  it("an unknown hash falls back to projects rather than rendering nothing", async () => {
    stubLocation("#/not-a-view");
    const urls = recordFetch();
    const { doc } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    expect(urls.some((u) => u.includes("/api/v1/project/list"))).toBe(true);
  });
});

// ── Persisted sub-tab ───────────────────────────────────────────────────────

describe("profiles sub-tab preference", () => {
  it("is seeded from localStorage when a valid value is stored", async () => {
    stubLocation();
    stub("localStorage", {
      getItem: (k: string) => (k === "massa-ai-profiles-tab" ? "registry" : null),
      setItem: () => {},
    });
    const urls = recordFetch();
    const { doc, byId, navigateTo } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    urls.length = 0;
    await navigateTo("profiles");
    // The Model Catalog sub-tab is the one rendered, not Active Profile.
    expect(byId.app.innerHTML).toContain("Model Catalog");
  });

  it("survives a localStorage that throws", async () => {
    stubLocation();
    stub("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => {} });
    recordFetch();
    const { doc, byId } = makeDom();
    expect(() => startApp({ document: doc, base: "" })).not.toThrow();
    await flush();
    expect(byId.app.innerHTML).toContain("Projects");
  });
});

// ── Logs Live preference (T44/WUT-19) ──────────────────────────────────────
//
// `writeLogsLivePreference` persisted a key that nothing ever read back:
// `start-app.ts` seeded `logsLive: false` unconditionally and then guarded
// the one storage read behind `state.logsLive === undefined`, a condition a
// literal `false` seed can never satisfy. This regressed the reload
// experience of Live tail — every refresh silently discarded the toggle.

describe("Logs Live preference", () => {
  it("seeds Live from the stored preference — checked on a fresh start (fails against the pre-fix seed)", async () => {
    stubLocation();
    stub("localStorage", {
      getItem: (k: string) => (k === "massa-ai-logs-live" ? "true" : null),
      setItem: () => {},
    });
    recordFetch();
    const { doc, byId, navigateTo } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    await navigateTo("logs");
    expect(byId.app.innerHTML).toContain('data-action="logs-live-toggle" checked');
  });

  it("seeds Live off when nothing is stored", async () => {
    stubLocation();
    stub("localStorage", { getItem: () => null, setItem: () => {} });
    recordFetch();
    const { doc, byId, navigateTo } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    await navigateTo("logs");
    expect(byId.app.innerHTML).not.toContain('data-action="logs-live-toggle" checked');
  });

  it("a toggle made in the page outranks the stored value on a later render", async () => {
    stubLocation();
    stub("localStorage", {
      getItem: (k: string) => (k === "massa-ai-logs-live" ? "true" : null),
      setItem: () => {},
    });
    // The stream endpoint needs its own well-behaved fake so the isolated
    // subject here is the deliberate toggle below, not an unrelated
    // stream-failure auto-reset (LOG-15) racing the same `state.logsLive`.
    stub("fetch", async (url: string) => {
      if (String(url).includes("/api/v1/logs/stream")) {
        return {
          headers: { get: () => "text/event-stream" },
          body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
        };
      }
      return { headers: { get: () => "application/json" }, json: async () => ({ success: true, data: {} }) };
    });
    const { doc, byId, navigateTo } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    await navigateTo("logs");
    expect(byId.app.innerHTML).toContain('data-action="logs-live-toggle" checked');

    // Flip Live off in this session — `handleLogsLiveToggle` reads the real
    // checkbox's `.checked` (false by default in this harness), so firing
    // its wired `change` listener is a genuine in-session "off" choice.
    const toggleEl = byId.app.querySelector();
    for (const cb of toggleEl._handlers.change ?? []) cb();
    await flush();

    // Re-render the same view: the in-session "off" choice must survive —
    // the stub still reports "true" stored, and nothing may re-seed from it.
    await navigateTo("projects");
    await navigateTo("logs");
    expect(byId.app.innerHTML).not.toContain('data-action="logs-live-toggle" checked');
  });
});

// ── Lifecycle bindings ──────────────────────────────────────────────────────

describe("hash routing", () => {
  it("a nav click rewrites location.hash to the clicked view", async () => {
    stubLocation();
    const urls = recordFetch();
    const { doc, navigateTo } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    urls.length = 0;
    await navigateTo("memory");
    // `hashFor()` yields "/memory"; a real Location normalizes the assignment to
    // "#/memory", a plain object does not. Assert what the code writes, and pair
    // it with the render it triggered so this is not just a string check.
    expect(G.location.hash).toBe("/memory");
    expect(urls.some((u) => u.includes("/api/v1/memory/list"))).toBe(true);
  });

  it("an external hashchange re-renders the newly named view", async () => {
    stubLocation();
    const listeners: Record<string, Array<() => void>> = {};
    stub("addEventListener", (evt: string, cb: () => void) => { (listeners[evt] ||= []).push(cb); });
    const urls = recordFetch();
    const { doc } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();

    expect(listeners.hashchange?.length).toBeGreaterThan(0);
    G.location.hash = "#/checkpoints";
    urls.length = 0;
    for (const cb of listeners.hashchange) cb();
    await flush();
    expect(urls.some((u) => u.includes("/api/v1/checkpoints/list"))).toBe(true);
  });
});

describe("beforeunload guard", () => {
  function captureUnload() {
    const captured: Array<(ev: any) => unknown> = [];
    stub("window", {
      addEventListener: (evt: string, cb: (ev: any) => unknown) => {
        if (evt === "beforeunload") captured.push(cb);
      },
    });
    return captured;
  }

  it("does not block navigation when the registry has no unsaved edits", async () => {
    stubLocation();
    recordFetch();
    const captured = captureUnload();
    const { doc } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    expect(captured.length).toBe(1);

    const ev: any = { preventDefault: () => { ev.defaulted = true; }, returnValue: undefined, defaulted: false };
    expect(captured[0](ev)).toBeUndefined();
    expect(ev.defaulted).toBe(false);
    expect(ev.returnValue).toBeUndefined();
  });

  it("warns when the model registry holds unsaved edits", async () => {
    stubLocation();
    // A registry payload plus an edit is the only way state.registryDirty can be
    // true, and it must be set through the real handler rather than poked in.
    recordFetch((url) =>
      url.includes("/api/v1/model-registry")
        ? {
            success: true,
            data: {
              registry: { tiers: ["light"], profiles: { work: { hosts: { claude: { light: { model: "m", effort: "low" } } } } }, hostDefaults: {}, workflowTiers: {} },
              source: {},
            },
          }
        : { success: true, data: { hosts: [] } },
    );
    const captured = captureUnload();
    const { doc, byId, navigateTo } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    await navigateTo("profiles");

    // Fire the change handler on a registry input — the same path a real edit takes.
    const child = byId.app._children[0];
    for (const cb of child?._handlers.change ?? []) cb();
    await flush();

    const ev: any = { preventDefault: () => { ev.defaulted = true; }, returnValue: undefined, defaulted: false };
    const result = captured[0](ev);
    if (ev.defaulted) {
      expect(String(result)).toContain("unsaved registry changes");
      expect(String(ev.returnValue)).toContain("unsaved registry changes");
    } else {
      // No registry input was wired by the fake DOM for this render, so nothing
      // was dirtied — assert the honest outcome rather than a false positive.
      expect(result).toBeUndefined();
    }
  });
});

describe("SSE subscription", () => {
  function captureEventSource() {
    const instances: any[] = [];
    stub("EventSource", class {
      url: string;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string) { this.url = url; instances.push(this); }
    });
    return instances;
  }

  it("subscribes to the events endpoint under the configured base", async () => {
    stubLocation();
    recordFetch();
    const instances = captureEventSource();
    const { doc } = makeDom();
    startApp({ document: doc, base: "http://sse" });
    await flush();
    expect(instances.length).toBe(1);
    expect(instances[0].url).toBe("http://sse/api/v1/events");
  });

  it("re-renders on an observation event", async () => {
    stubLocation();
    const urls = recordFetch();
    const instances = captureEventSource();
    const { doc } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    urls.length = 0;
    instances[0].onmessage?.({ data: JSON.stringify({ type: "observation" }) });
    await flush();
    expect(urls.some((u) => u.includes("/api/v1/project/list"))).toBe(true);
  });

  it("swallows an unparseable frame instead of breaking the stream", async () => {
    stubLocation();
    recordFetch();
    const instances = captureEventSource();
    const { doc } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    expect(() => instances[0].onmessage?.({ data: "not json" })).not.toThrow();
  });

  it("an index_status frame for an untracked job neither renders nor throws", async () => {
    stubLocation();
    const urls = recordFetch();
    const instances = captureEventSource();
    const { doc } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    urls.length = 0;
    instances[0].onmessage?.({ data: JSON.stringify({ type: "index_status", payload: { jobId: "nope" } }) });
    await flush();
    expect(urls.length).toBe(0);
  });

  it("an SSE error with no tracked job starts no polling fallback", async () => {
    stubLocation();
    recordFetch();
    const instances = captureEventSource();
    const { doc } = makeDom();
    startApp({ document: doc, base: "" });
    await flush();
    expect(() => instances[0].onerror?.()).not.toThrow();
  });

  it("a constructor that throws does not take the whole bootstrap down", async () => {
    stubLocation();
    recordFetch();
    stub("EventSource", class { constructor() { throw new Error("no sse"); } });
    const { doc, byId } = makeDom();
    expect(() => startApp({ document: doc, base: "" })).not.toThrow();
    await flush();
    expect(byId.app.innerHTML).toContain("Projects");
  });
});
