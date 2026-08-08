import { describe, it, expect, afterEach } from "bun:test";
import fs from "fs";
import path from "path";

const mod = await import("../static/app.js");
const UI = (globalThis as any).MASSA_AI_UI || {};
const {
  markdownToHtml,
  renderProjects,
  renderSearch,
  renderHandoffs,
  renderCheckpoints,
  renderMemoryBrowser,
  renderProposals,
  renderConfig,
  renderProfiles,
  initTheme,
  toggleTheme,
  createApiClient,
  startApp,
} = { ...mod, ...UI };

const STATIC_DIR = path.resolve(import.meta.dir, "../static");
const INDEX_HTML = fs.readFileSync(path.join(STATIC_DIR, "index.html"), "utf8");

describe("markdown fallback renderer edge cases", () => {
  it("transitions from ordered list to unordered list", () => {
    const html = markdownToHtml("1. first\n2. second\n- bullet\n- bullet2");
    expect(html).toContain("<ol>");
    expect(html).toContain("<ul>");
    expect(html).toContain("first");
    expect(html).toContain("bullet");
  });

  it("transitions from unordered list to ordered list", () => {
    const html = markdownToHtml("- a\n- b\n1. one\n2. two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("one");
  });

  it("flushes paragraphs and lists on blank lines", () => {
    const html = markdownToHtml("para one\n\n- list item\n\npara two");
    expect(html).toContain("<p>");
    expect(html).toContain("para one");
    expect(html).toContain("para two");
    expect(html).toContain("<li>list item</li>");
  });

  it("renders fenced code with language class", () => {
    const html = markdownToHtml("```ts\nconst x = 1;\n```");
    expect(html).toContain('class="language-ts"');
  });

  it("renders heading levels 1-6", () => {
    expect(markdownToHtml("## H2")).toContain("<h2>");
    expect(markdownToHtml("### H3")).toContain("<h3>");
  });

  it("renders inline link with target blank", () => {
    const html = markdownToHtml("[label](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe("renderProjects", () => {
  it("shows empty state when no projects", () => {
    expect(renderProjects({ projects: [] })).toContain("No indexed projects");
    expect(renderProjects({})).toContain("No indexed projects");
    expect(renderProjects(null)).toContain("No indexed projects");
  });

  it("renders project rows in a grid table with doc counts", () => {
    const html = renderProjects({ projects: [{ projectId: "p1", documentCount: 5 }, { id: "p2", docCount: 3 }] });
    expect(html).toContain("grid");
    expect(html).toContain("p1");
    expect(html).toContain("5");
    expect(html).toContain("p2");
    expect(html).toContain("3");
  });

  it("omits doc count when absent", () => {
    const html = renderProjects({ projects: [{ projectId: "p3" }] });
    expect(html).toContain("p3");
  });
});

describe("renderSearch", () => {
  it("prompts for query when empty", () => {
    const html = renderSearch(null, { query: "" });
    expect(html).toContain("Enter a query");
  });

  it("shows error block on failed data", () => {
    const html = renderSearch({ success: false, error: "boom" }, { query: "q" });
    expect(html).toContain("boom");
  });

  it("shows no-results message", () => {
    const html = renderSearch({ data: { results: [] } }, { query: "q" });
    expect(html).toContain("No results");
  });

  it("renders results with scores", () => {
    const html = renderSearch({ data: { results: [{ content: "**x**", score: 0.9 }] } }, { query: "q" });
    expect(html).toContain("<strong>x</strong>");
    expect(html).toContain("0.9");
  });

  it("returns empty array fallback in extractSearchResults (no matching shape)", () => {
    // data with no results/memories/array → extractSearchResults returns []
    const html = renderSearch({ data: { weird: true } }, { query: "q" });
    expect(html).toContain("No results");
  });

  it("handles memories-shaped results + text fallback", () => {
    const html = renderSearch({ data: { memories: [{ text: "hello" }] } }, { query: "q" });
    expect(html).toContain("hello");
  });

  it("handles array payload", () => {
    const html = renderSearch({ data: [{ content: "arr" }] }, { query: "q" });
    expect(html).toContain("arr");
  });
});

describe("renderHandoffs", () => {
  it("prompts to select project when none chosen", () => {
    expect(renderHandoffs(null, { project: "" })).toContain("Select a project");
  });

  it("shows error on failed data", () => {
    expect(renderHandoffs({ success: false, error: "x" }, { project: "p" })).toContain("x");
  });

  it("shows empty state", () => {
    expect(renderHandoffs({ data: { pending: [] } }, { project: "p" })).toContain("No pending handoffs");
  });

  it("renders handoff cards", () => {
    const html = renderHandoffs({ data: { pending: [{ id: "h1", targetAgent: "builder", status: "queued", summary: "# do work" }] } }, { project: "p" });
    expect(html).toContain("builder");
    expect(html).toContain("queued");
    expect(html).toContain("h1");
    expect(html).toContain("<h1>");
  });

  it("shows error when data is null with project set", () => {
    expect(renderHandoffs(null, { project: "p" })).toContain("Request failed");
  });
});

describe("renderCheckpoints", () => {
  it("shows error on failed/null data", () => {
    expect(renderCheckpoints(null)).toContain("Request failed");
    expect(renderCheckpoints({ success: false, error: "nope" })).toContain("nope");
  });

  it("shows empty state", () => {
    expect(renderCheckpoints({ data: { checkpoints: [] } })).toContain("No checkpoints");
  });

  it("renders checkpoint rows", () => {
    const html = renderCheckpoints({ data: { checkpoints: [{ taskId: "t1", checkpointType: "phase", status: "active", description: "desc" }] } });
    expect(html).toContain("t1");
    expect(html).toContain("phase");
    expect(html).toContain("active");
  });

  it("handles array payload + data.data shape", () => {
    expect(renderCheckpoints({ data: [{ taskId: "t2" }] })).toContain("t2");
    expect(renderCheckpoints({ data: { data: [{ taskId: "t3" }] } })).toContain("t3");
  });

  // The list route emits `type`, not `checkpointType` (list_checkpoints.ts maps
  // `type: cp.checkpointType`). Assert the real field name renders without
  // leaning on the legacy fallback.
  it("renders the API field name `type` for the type column", () => {
    const html = renderCheckpoints({
      data: { checkpoints: [{ taskId: "t4", type: "milestone", status: "in_progress" }] },
    });
    expect(html).toContain("t4");
    expect(html).toContain("milestone");
  });

  // Regression: format omitted -> route falls back to "toon" -> data is a
  // *string* while success stays true. This must not read as "no checkpoints".
  it("surfaces a TOON string payload instead of faking the empty state", () => {
    const html = renderCheckpoints({
      success: true,
      data: "checkpoints: []\ntotal: 458\nstats:\n  byType:\n    manual: 339",
    });
    expect(html).not.toContain("No checkpoints");
    expect(html).toContain("TOON");
    expect(html).toContain('class="error"');
  });
});

describe("renderProposals response shape", () => {
  // POST /api/v1/proposal/list returns `{ pending, count }` (proposals.ts).
  // Reading only `proposals` here is what made the view permanently empty.
  it("reads the `pending` key the route actually returns", () => {
    const html = renderProposals(
      { success: true, data: { pending: [{ id: "prop-1", type: "edit", status: "pending", description: "tighten recall" }], count: 1 } },
      { project: "massa-ai" },
    );
    expect(html).not.toContain("No pending proposals");
    expect(html).toContain("tighten recall");
    expect(html).toContain("prop-1");
  });

  it("still accepts the legacy `proposals` key", () => {
    const html = renderProposals(
      { success: true, data: { proposals: [{ id: "prop-2", description: "legacy shape" }] } },
      { project: "massa-ai" },
    );
    expect(html).toContain("legacy shape");
  });
});

describe("renderMemoryBrowser edge cases", () => {
  it("shows error block on failed data", () => {
    const html = renderMemoryBrowser({ success: false, error: "denied" }, {});
    expect(html).toContain("denied");
  });

  it("shows empty memories message", () => {
    const html = renderMemoryBrowser({ data: { memories: [], total: 0, limit: 50, offset: 0 } }, { filters: {} });
    expect(html).toContain("No memories match");
  });

  it("renders filter bar with selected type/level", () => {
    const html = renderMemoryBrowser({ data: { memories: [], total: 0, limit: 50, offset: 0 } }, { filters: { type: "code", level: 1, minImportance: 0.5 } });
    expect(html).toContain('value="code" selected');
    expect(html).toContain('value="1" selected');
    expect(html).toContain('value="0.5"');
  });

  it("pager prev/next disabled states", () => {
    const html = renderMemoryBrowser({ data: { memories: [{ id: "m1", type: "code", level: 1, importance: 0.5, content: "x" }], total: 100, limit: 50, offset: 50 } }, { filters: {} });
    // offset=50 → prev enabled, next enabled (50+50 < 100? equal → disabled)
    expect(html).toContain("memory-prev"); // not disabled
    expect(html).toContain("memory-next");
  });

  it("renders memory content truncated + markdown", () => {
    const long = "a".repeat(300);
    const html = renderMemoryBrowser({ data: { memories: [{ id: "m1", type: "pattern", level: 2, importance: 0.9, content: long }], total: 1, limit: 50, offset: 0 } }, { filters: {} });
    expect(html).toContain("…");
  });
});

describe("initTheme / toggleTheme", () => {
  it("initTheme defaults to light, reads from store", () => {
    const doc = { documentElement: { setAttribute: () => {}, getAttribute: () => null } };
    let stored = "dark";
    const store = { getItem: () => stored, setItem: (k: string, v: string) => { stored = v; } };
    expect(initTheme(doc, store)).toBe("dark");
    expect(initTheme(doc, null)).toBe("light");
    // invalid store value → light
    stored = "purple";
    expect(initTheme(doc, store)).toBe("light");
  });

  it("initTheme tolerates store throw + missing doc", () => {
    const throwingStore = { getItem: () => { throw new Error("x"); } };
    expect(initTheme(null, throwingStore)).toBe("light");
  });

  it("toggleTheme flips dark↔light and persists", () => {
    const elem: any = { getAttribute: () => "dark", setAttribute: () => {}, };
    const doc = { documentElement: elem };
    let saved = "";
    const store = { getItem: () => "dark", setItem: (_k: string, v: string) => { saved = v; } };
    expect(toggleTheme(doc, store)).toBe("light");
    expect(saved).toBe("light");
  });

  it("toggleTheme returns light when no doc", () => {
    expect(toggleTheme(null, null)).toBe("light");
  });

  it("toggleTheme tolerates store throw", () => {
    const elem: any = { getAttribute: () => "light", setAttribute: () => {} };
    const doc = { documentElement: elem };
    const throwingStore = { getItem: () => "light", setItem: () => { throw new Error("x"); } };
    expect(toggleTheme(doc, throwingStore)).toBe("dark");
  });
});

describe("createApiClient", () => {
  it("GET request returns JSON when content-type is json", async () => {
    const calls: any[] = [];
    const fakeFetch = async (url: string, init: any) => {
      calls.push({ url, init });
      return { headers: { get: () => "application/json" }, json: async () => ({ ok: true }) };
    };
    const api = createApiClient({ base: "http://x", fetch: fakeFetch });
    const result = await api.request("/path");
    expect(calls[0].url).toBe("http://x/path");
    expect(calls[0].init.method).toBe("GET");
    expect(result).toEqual({ ok: true });
  });

  it("POST request sends JSON body + content-type header", async () => {
    const calls: any[] = [];
    const fakeFetch = async (url: string, init: any) => {
      calls.push({ url, init });
      return { headers: { get: () => "application/json" }, json: async () => ({ ok: true }) };
    };
    const api = createApiClient({ base: "", fetch: fakeFetch });
    await api.request("/p", { method: "POST", body: { a: 1 } });
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(calls[0].init.body)).toEqual({ a: 1 });
  });

  it("returns text when content-type is not json", async () => {
    const fakeFetch = async () => ({ headers: { get: () => "text/plain" }, text: async () => "hello" });
    const api = createApiClient({ fetch: fakeFetch });
    expect(await api.request("/x")).toBe("hello");
  });

  it("throws when fetch is unavailable", async () => {
    const orig = globalThis.fetch;
    // @ts-expect-error: temporarily remove fetch
    delete globalThis.fetch;
    try {
      const api = createApiClient({ fetch: null });
      await expect(api.request("/x")).rejects.toThrow("fetch unavailable");
    } finally {
      globalThis.fetch = orig;
    }
  });
});

// ── startApp with a fake DOM ─────────────────────────────────────────────────

function makeFakeDom() {
  const elements: Record<string, any> = {};
  // A richer fake element whose querySelectorAll/querySelector return stubs
  // so startApp's wireViewHandlers forEach bodies + addEventListener calls run.
  function makeRichElement(id: string): any {
    const handlers: Record<string, Array<(ev?: unknown) => void>> = {};
    const childCache: any[] = [];
    const qsCache: any = {};
    const self: any = {
      _id: id,
      innerHTML: "",
      value: "",
      textContent: "",
      dataset: { filter: "type", id: "fake-id" },
      classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
      setAttribute: () => {},
      getAttribute: (k: string) => (k === "href" ? "#/projects" : null),
      addEventListener: (evt: string, cb: (ev?: unknown) => void) => {
        (handlers[evt] ||= []).push(cb);
      },
      removeEventListener: () => {},
      appendChild: () => {},
      // Stable children so handlers registered during wireViewHandlers persist
      querySelectorAll: () => {
        if (childCache.length === 0) childCache.push(makeRichElement(id + "-child0"));
        return childCache;
      },
      querySelector: () => {
        if (!qsCache.qs) qsCache.qs = makeRichElement(id + "-qs");
        return qsCache.qs;
      },
      closest: () => null,
      _handlers: handlers,
      _children: childCache,
    };
    return self;
  }
  function el(id: string) {
    if (!elements[id]) elements[id] = makeRichElement(id);
    return elements[id];
  }
  const doc = {
    getElementById: el,
    querySelectorAll: (_selector: string) => [makeRichElement("nav-a")],
    querySelector: (_selector: string) => null,
    addEventListener: () => {},
    documentElement: { setAttribute: () => {}, getAttribute: () => "light" },
    readyState: "complete",
    createElement: () => makeRichElement("created"),
    body: { appendChild: () => {} },
  };
  return { doc, el, elements };
}

describe("startApp", () => {
  const origFetch = globalThis.fetch;
  const origLocation = (globalThis as any).location;
  const origPrompt = (globalThis as any).prompt;
  const origConfirm = (globalThis as any).confirm;
  const origAlert = (globalThis as any).alert;
  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origLocation) (globalThis as any).location = origLocation;
    else delete (globalThis as any).location;
    (globalThis as any).prompt = origPrompt;
    (globalThis as any).confirm = origConfirm;
    (globalThis as any).alert = origAlert;
  });

  function fakeJsonFetch(responder: (url: string) => unknown) {
    globalThis.fetch = (async (url: string) => ({
      headers: { get: () => "application/json" },
      json: async () => responder(String(url)),
    })) as unknown as typeof fetch;
  }

  /** Same as `fakeJsonFetch`, but records every (url, method, body) it is handed. */
  function recordingJsonFetch(responder: (url: string) => unknown) {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    globalThis.fetch = (async (url: string, init?: any) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body });
      return {
        headers: { get: () => "application/json" },
        json: async () => responder(String(url)),
      };
    }) as unknown as typeof fetch;
    return calls;
  }

  /**
   * Replace the three blocking dialog globals, and record what they were asked.
   *
   * `app.js`'s write-mode handlers call `prompt()` (memory edit), `confirm()`
   * (memory delete) and `alert()` (every failure path). Bun implements all three
   * as **stdin readers**, and `makeFakeDom`'s `querySelectorAll` returns its
   * stable child for *any* selector — so `bindEvents` registers the
   * `memory-edit` / `memory-delete` click handlers on it and any test that fires
   * that child's click handlers reaches them.
   *
   * Measured, both directions, on this file: with stdin an open pipe that never
   * delivers, the suite prints `Edit memory content: []` and hangs (still
   * running when killed at 46 s); with stdin closed it is 113 pass / 0 fail in
   * ~2 s. That is why `bun run test:coverage` never terminated under an
   * automated runner that inherits a live stdin — one hung web-ui suite blocks
   * the whole gate, and no per-test timeout applies because the block is inside
   * a handler the test invoked synchronously.
   *
   * CI never saw it: with stdin at EOF `prompt()` returns `null`, so
   * `handleMemoryEdit` early-returns and the suite passes. That is also why
   * `app.js:840-848` was never covered — the PUT after the prompt was
   * unreachable in every environment. Stubbing here removes the stdin
   * dependency *and* makes that branch executable.
   */
  function fakeDialogs(promptAnswer: string | null = "edited content") {
    const dialogs = {
      prompts: [] as string[],
      confirms: [] as string[],
      alerts: [] as string[],
    };
    (globalThis as any).prompt = (message?: string) => {
      dialogs.prompts.push(String(message ?? ""));
      return promptAnswer;
    };
    (globalThis as any).confirm = (message?: string) => {
      dialogs.confirms.push(String(message ?? ""));
      return true;
    };
    (globalThis as any).alert = (message?: string) => {
      dialogs.alerts.push(String(message ?? ""));
    };
    return dialogs;
  }

  it("returns early when no document", () => {
    expect(startApp({ document: null, base: "" })).toBeUndefined();
  });

  it("initializes and renders projects view (default)", async () => {
    const { doc } = makeFakeDom();
    fakeJsonFetch(() => ({ data: { projects: [{ projectId: "p1" }] } }));
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));
    expect(doc.getElementById("app").innerHTML).toContain("p1");
  });

  it("renders connection error when fetch throws", async () => {
    const { doc } = makeFakeDom();
    globalThis.fetch = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));
    expect(doc.getElementById("app").innerHTML).toContain("Connection error");
  });

  it("renders memory view when location.hash is #/memory", async () => {
    const { doc } = makeFakeDom();
    (globalThis as any).location = { hash: "#/memory" };
    fakeJsonFetch((url) => {
      if (url.includes("/memory/list")) return { data: { memories: [{ id: "m1", type: "code", level: 1, importance: 0.5, content: "hello" }], total: 1, limit: 50, offset: 0 } };
      if (url.includes("/project/list")) return { data: { projects: [] } };
      return { data: {} };
    });
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));
    expect(doc.getElementById("app").innerHTML).toContain("Memory");
  });

  it("renders search view when location.hash is #/search", async () => {
    const { doc } = makeFakeDom();
    (globalThis as any).location = { hash: "#/search" };
    fakeJsonFetch(() => ({ data: { results: [{ content: "found", score: 0.9 }] } }));
    // Need to trigger a search query — set state via nav; but initial render with no query shows prompt
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));
    expect(doc.getElementById("app").innerHTML).toContain("Search");
  });

  it("renders handoffs view with pending handoffs", async () => {
    const { doc } = makeFakeDom();
    (globalThis as any).location = { hash: "#/handoffs" };
    fakeJsonFetch((url) => {
      if (url.includes("/handoff/list")) return { data: { pending: [{ id: "h1", targetAgent: "builder", status: "queued", summary: "do work" }] } };
      if (url.includes("/project/list")) return { data: { projects: [{ projectId: "p1" }] } };
      return {};
    });
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 80));
    // handoffs view requires a project selected; without one it shows prompt
    expect(doc.getElementById("app").innerHTML).toContain("Handoffs");
  });

  it("renders proposals view", async () => {
    const { doc } = makeFakeDom();
    (globalThis as any).location = { hash: "#/proposals" };
    fakeJsonFetch(() => ({}));
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));
    expect(doc.getElementById("app").innerHTML).toContain("Proposals");
  });

  it("renders checkpoints view", async () => {
    const { doc } = makeFakeDom();
    (globalThis as any).location = { hash: "#/checkpoints" };
    fakeJsonFetch((url) => {
      if (url.includes("/checkpoints/list")) return { data: { checkpoints: [{ taskId: "t1", checkpointType: "phase", status: "active", description: "d" }] } };
      return {};
    });
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));
    expect(doc.getElementById("app").innerHTML).toContain("Checkpoints");
  });

  it("renders dashboard view", async () => {
    const { doc } = makeFakeDom();
    (globalThis as any).location = { hash: "#/dashboard" };
    fakeJsonFetch(() => ({ running: true, jobs: [], system: { uptime: 5 } }));
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));
    expect(doc.getElementById("app").innerHTML).toContain("Scheduler");
  });

  it("falls back to projects for unknown hash", async () => {
    const { doc } = makeFakeDom();
    (globalThis as any).location = { hash: "#/bogus" };
    fakeJsonFetch(() => ({ data: { projects: [{ projectId: "px" }] } }));
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));
    expect(doc.getElementById("app").innerHTML).toContain("Projects");
  });

  it("fires captured event handlers (nav, theme, project, filters) to cover callbacks", async () => {
    const { doc, elements } = makeFakeDom();
    // Not optional: the click handlers fired below include `memory-edit` and
    // `memory-delete`, which call the stdin-reading `prompt()` / `confirm()`.
    // Without this the suite blocks forever on any live stdin. See `fakeDialogs`.
    fakeDialogs();
    (globalThis as any).location = { hash: "#/memory" };
    fakeJsonFetch((url) => {
      if (url.includes("/memory/list")) return { data: { memories: [{ id: "m1", type: "code", level: 1, importance: 0.5, content: "hi" }], total: 1, limit: 50, offset: 0 } };
      if (url.includes("/memory/search")) return { data: { results: [{ content: "r", score: 0.5 }] } };
      if (url.includes("/handoff/list")) return { data: { pending: [{ id: "h1", targetAgent: "x", status: "q", summary: "s" }] } };
      if (url.includes("/proposal/list")) return { data: { proposals: [{ id: "p1", type: "edit", status: "pending", description: "d" }] } };
      if (url.includes("/checkpoints/list")) return { data: { checkpoints: [] } };
      if (url.includes("/project/list")) return { data: { projects: [{ projectId: "p1" }] } };
      return { data: {} };
    });
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));

    // Fire theme toggle handler
    const themeEl = elements["theme-toggle"];
    if (themeEl?._handlers?.click) for (const h of themeEl._handlers.click) h();

    // Fire project-select change handler (sets state.project → enables handoffs/proposals)
    const projEl = elements["project-select"];
    projEl.value = "p1";
    if (projEl?._handlers?.change) for (const h of projEl._handlers.change) h();

    await new Promise((r) => setTimeout(r, 60));

    // Fire memory filter change + action handlers from root's stable children
    const root = elements["app"];
    const child = root.querySelectorAll("x")[0];
    if (child?._handlers?.change) for (const h of child._handlers.change) h();
    if (child?._handlers?.click) for (const h of child._handlers.click) h();
    const qs = root.querySelector("x");
    if (qs?._handlers?.input) for (const h of qs._handlers.input) h();
    if (qs?._handlers?.click) for (const h of qs._handlers.click) h();

    // Fire nav click handlers (doc.querySelectorAll(".nav a"))
    const navA = doc.querySelectorAll(".nav a")[0];
    if (navA?._handlers?.click) for (const h of navA._handlers.click) { h({ preventDefault: () => {} }); }

    await new Promise((r) => setTimeout(r, 80));
    expect(doc.getElementById("app")).toBeDefined();
  });

  /**
   * The sensor for the dialog stubs, and it discriminates in the direction that
   * matters. The test above fires the same handlers but asserts only that the
   * app root still exists — it passed just as happily when `prompt()` returned
   * `null` at stdin EOF and `handleMemoryEdit` bailed out one line later. This
   * one asserts the request each handler is supposed to issue *after* its
   * dialog, so it goes red if the write-mode round trip stops happening,
   * including if someone restores the un-stubbed `prompt` and the answer
   * becomes `null` again.
   */
  it("drives the write-mode dialog handlers through to their requests", async () => {
    const { doc, elements } = makeFakeDom();
    const dialogs = fakeDialogs("edited content");
    (globalThis as any).location = { hash: "#/memory" };
    const calls = recordingJsonFetch((url) => {
      if (url.includes("/memory/list")) return { data: { memories: [{ id: "m1", type: "code", level: 1, importance: 0.5, content: "hi" }], total: 1, limit: 50, offset: 0 } };
      if (url.includes("/project/list")) return { data: { projects: [{ projectId: "p1" }] } };
      return { data: {} };
    });
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));

    const child = elements["app"].querySelectorAll("x")[0];
    for (const h of child._handlers.click ?? []) h();
    await new Promise((r) => setTimeout(r, 80));

    expect(dialogs.prompts).toContain("Edit memory content:");
    expect(dialogs.confirms.some((m) => m.includes("Delete this memory?"))).toBe(true);

    const put = calls.find((c) => c.method === "PUT" && c.url.includes("/api/v1/memory/fake-id"));
    expect(put).toBeDefined();
    expect(put?.body).toContain("edited content");

    const del = calls.find((c) => c.method === "DELETE" && c.url.includes("/api/v1/memory/fake-id"));
    expect(del).toBeDefined();

    // Nothing failed, so no failure path ran.
    expect(dialogs.alerts).toEqual([]);
  });

  it("SSE subscribes to /api/v1/events when EventSource is available", async () => {
    const { doc } = makeFakeDom();
    const sseInstances: any[] = [];
    (globalThis as any).EventSource = class {
      constructor(url: string) {
        sseInstances.push({ url, onmessage: null as any, onerror: null as any });
      }
    };
    fakeJsonFetch(() => ({ data: { projects: [] } }));
    startApp({ document: doc, base: "http://sse" });
    await new Promise((r) => setTimeout(r, 60));
    expect(sseInstances.length).toBe(1);
    expect(sseInstances[0].url).toContain("/api/v1/events");
    delete (globalThis as any).EventSource;
  });
});

// ── Admin portal nav + footer + viewFromHash + dispatch stubs (T9) ──────────

describe("admin portal nav + footer + routing (T9)", () => {
  it("index.html has Config and Profiles nav items after Dashboard", () => {
    const navMatch = INDEX_HTML.match(/<nav class="nav">([\s\S]*?)<\/nav>/);
    expect(navMatch).not.toBeNull();
    const nav = navMatch![1];
    const dashboardIdx = nav.indexOf("#/dashboard");
    const configIdx = nav.indexOf("#/config");
    const profilesIdx = nav.indexOf("#/profiles");
    expect(dashboardIdx).toBeGreaterThan(-1);
    expect(configIdx).toBeGreaterThan(dashboardIdx);
    expect(profilesIdx).toBeGreaterThan(configIdx);
  });

  it("index.html footer text is 'Admin portal · served by the massa-ai Tools API'", () => {
    expect(INDEX_HTML).toContain("Admin portal");
    expect(INDEX_HTML).toContain("served by the massa-ai Tools API");
    expect(INDEX_HTML).not.toContain("Read-only");
  });

  it("index.html brand says admin portal, not memory browser", () => {
    expect(INDEX_HTML).toContain("admin portal");
    expect(INDEX_HTML).not.toContain("memory browser");
  });

  it("renderConfig stub renders without error and shows restart badge when present", () => {
    const html = renderConfig({ config: { logging: { level: "info" } }, restartNeededSections: ["llm"] });
    expect(html).toContain("Config");
    expect(html).toContain("restart needed");
    expect(html).toContain("llm");
  });

  it("renderConfig stub renders empty restart badge when no restart sections", () => {
    const html = renderConfig({ config: {}, restartNeededSections: [] });
    expect(html).toContain("Config");
    expect(html).not.toContain("restart needed");
  });

  it("renderProfiles stub renders profile cards with active marked", () => {
    const html = renderProfiles({ hosts: [{ host: "claude", installed: true, skipped: false, skipReason: null, activeProfile: "balanced", bundleVersion: "1.0.0", availableProfiles: ["balanced", "work"] }] }, { writeMode: false });
    expect(html).toContain("balanced");
    expect(html).toContain("work");
    expect(html).toContain("active");
  });

  it("renderProfiles shows installed with marketplace message when no variant profiles (UIC-05)", () => {
    const html = renderProfiles({ hosts: [{ host: "claude", installed: true, skipped: false, skipReason: null, activeProfile: "balanced", bundleVersion: "1.41.0", availableProfiles: [] }] }, { writeMode: false });
    expect(html).toContain("claude");
    expect(html).not.toContain("Not installed");
    expect(html).toContain("marketplace");
  });

  it("renderProfiles shows Not installed when installed is false", () => {
    const html = renderProfiles({ hosts: [{ host: "cursor", installed: false, skipped: true, skipReason: "skipped", activeProfile: null, bundleVersion: null, availableProfiles: [] }] }, { writeMode: false });
    expect(html).toContain("cursor");
    expect(html).toContain("skipped");
  });

  it("renderProfiles stub renders empty state when no profiles", () => {
    const html = renderProfiles({ hosts: [] }, { writeMode: false });
    expect(html).toContain("No profiles");
  });

  it("viewFromHash allow-list includes config and profiles (dispatch stubs route without error)", async () => {
    // Drive startApp with a hash pointing at config; the dispatch stub must
    // call GET /api/v1/config and render renderConfig output without throwing.
    const { doc } = makeFakeDom();
    (globalThis as any).location = { hash: "#/config" };
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return {
        headers: { get: () => "application/json" },
        json: async () => ({ success: true, data: { config: { logging: { level: "info" } }, restartNeededSections: [] } }),
      };
    }) as unknown as typeof fetch;
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));
    expect(calls.some((u) => u.includes("/api/v1/config"))).toBe(true);
    expect(doc.getElementById("app").innerHTML).toContain("Config");
    delete (globalThis as any).location;
  });

  it("viewFromHash allow-list includes profiles (dispatch stub routes without error)", async () => {
    const { doc } = makeFakeDom();
    (globalThis as any).location = { hash: "#/profiles" };
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return {
        headers: { get: () => "application/json" },
        json: async () => ({ success: true, data: { hosts: [{ host: "claude", installed: true, skipped: false, skipReason: null, activeProfile: "balanced", bundleVersion: "1.0.0", availableProfiles: ["balanced"] }] } }),
      };
    }) as unknown as typeof fetch;
    startApp({ document: doc, base: "" });
    await new Promise((r) => setTimeout(r, 60));
    expect(calls.some((u) => u.includes("/api/v1/profiles"))).toBe(true);
    expect(doc.getElementById("app").innerHTML).toContain("Profiles");
    delete (globalThis as any).location;
  });
});

// ── Profiles view renderer (T11 — PROF-01, PROF-02) ────────────────────────

describe("renderProfiles — profile switcher (PROF-01, PROF-02)", () => {
  const SAMPLE_PROFILES = {
    hosts: [
      { host: "claude", installed: true, skipped: false, skipReason: null, activeProfile: "balanced", bundleVersion: "1.40.1", availableProfiles: ["balanced", "work", "cheap"] },
      { host: "codex", installed: true, skipped: false, skipReason: null, activeProfile: "work", bundleVersion: "1.40.1", availableProfiles: ["balanced", "work"] },
      { host: "cursor", installed: false, skipped: true, skipReason: "no variant dir", activeProfile: null, bundleVersion: null, availableProfiles: [] },
    ],
  };

  it("renders profile cards per host with active marked (PROF-01)", () => {
    const html = renderProfiles(SAMPLE_PROFILES, { writeMode: true });
    expect(html).toContain("claude");
    expect(html).toContain("codex");
    expect(html).toContain("balanced");
    expect(html).toContain("work");
    expect(html).toContain("active");
  });

  it("marks active profile with active badge, no Switch button on active", () => {
    const html = renderProfiles(SAMPLE_PROFILES, { writeMode: true });
    expect(html).toContain("active-badge");
    const claudeSection = html.split('data-host="claude"')[1] || "";
    expect(claudeSection).toContain("active-badge");
  });

  it("renders Switch button for non-active profiles when write mode on (PROF-02)", () => {
    const html = renderProfiles(SAMPLE_PROFILES, { writeMode: true });
    expect(html).toContain('data-action="profile-switch"');
    expect(html).toContain('data-profile="work"');
    expect(html).toContain('data-profile="cheap"');
    expect(html).toContain('data-host="claude"');
  });

  it("hides Switch buttons when write mode off", () => {
    const html = renderProfiles(SAMPLE_PROFILES, { writeMode: false });
    expect(html).not.toContain('data-action="profile-switch"');
  });

  it("shows skipped badge for skipped hosts", () => {
    const html = renderProfiles(SAMPLE_PROFILES, { writeMode: true });
    expect(html).toContain("cursor");
    expect(html).toContain("skipped");
    expect(html).toContain("no variant dir");
  });

  it("shows bundle version badge when present", () => {
    const html = renderProfiles(SAMPLE_PROFILES, { writeMode: false });
    expect(html).toContain("1.40.1");
  });

  it("renders empty state when no hosts", () => {
    const html = renderProfiles({ hosts: [] }, { writeMode: true });
    expect(html).toContain("No profiles");
  });

  it("defaults writeMode to isWriteModeEnabled() when not passed", () => {
    delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
    const html = renderProfiles(SAMPLE_PROFILES);
    expect(html).not.toContain('data-action="profile-switch"');
  });

  it("renders only active badge (no Switch) for active profile", () => {
    const html = renderProfiles(SAMPLE_PROFILES, { writeMode: true });
    const claudeIdx = html.indexOf('data-host="claude"');
    const balancedIdx = html.indexOf("balanced", claudeIdx);
    const cardEnd = html.indexOf("</div>", balancedIdx);
    const card = html.slice(balancedIdx - 50, cardEnd);
    expect(card).toContain("active-badge");
    expect(card).not.toContain('data-action="profile-switch"');
  });
});

// ── Create/delete forms for existing CRUD APIs (T13) ────────────────────────

describe("create/delete forms (T13 — MEM-02, HAND-02, CHKP-02, PROJ-02/04)", () => {
  const origWriteMode = (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
  const origDocument = (globalThis as any).document;
  const origLocalStorage = (globalThis as any).localStorage;

  afterEach(() => {
    if (origWriteMode !== undefined) (globalThis as any).MASSA_AI_WEB_WRITE_MODE = origWriteMode;
    else delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    if (origDocument !== undefined) (globalThis as any).document = origDocument;
    else delete (globalThis as any).document;
    if (origLocalStorage !== undefined) (globalThis as any).localStorage = origLocalStorage;
    else delete (globalThis as any).localStorage;
  });

  function enableWrite() {
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
    (globalThis as any).MASSA_AI_WEB_WRITE_MODE = true;
  }
  function disableWrite() {
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
    (globalThis as any).MASSA_AI_WEB_WRITE_MODE = false;
  }

  describe("memory create form (MEM-02)", () => {
    it("renders create-memory form when write mode on", () => {
      enableWrite();
      const data = { data: { memories: [{ id: "m1", type: "code", level: 1, importance: 0.8, content: "x" }], total: 1, limit: 50, offset: 0 } };
      const html = renderMemoryBrowser(data, { filters: {} });
      expect(html).toContain("Create Memory");
      expect(html).toContain('data-action="memory-create"');
      expect(html).toContain('data-form="memory-create"');
      expect(html).toContain('data-create="content"');
      expect(html).toContain('data-create="type"');
      expect(html).toContain('data-create="importance"');
      expect(html).toContain('data-create="tags"');
      expect(html).toContain('data-create="projectId"');
    });

    it("hides create-memory form when write mode off", () => {
      disableWrite();
      const data = { data: { memories: [{ id: "m1", type: "code", level: 1, importance: 0.8, content: "x" }], total: 1, limit: 50, offset: 0 } };
      const html = renderMemoryBrowser(data, { filters: {} });
      expect(html).not.toContain("Create Memory");
      expect(html).not.toContain('data-action="memory-create"');
    });
  });

  describe("handoff create + cancel (HAND-02, HAND-04)", () => {
    it("renders create-handoff form when write mode on + project selected", () => {
      enableWrite();
      const data = { data: { pending: [] } };
      const html = renderHandoffs(data, { project: "proj-1" });
      expect(html).toContain("Create Handoff");
      expect(html).toContain('data-action="handoff-create"');
      expect(html).toContain('data-create="projectId"');
      expect(html).toContain('data-create="summary"');
      expect(html).toContain('data-create="targetAgent"');
      expect(html).toContain('data-create="openQuestions"');
      expect(html).toContain('data-create="nextSteps"');
      expect(html).toContain('data-create="files"');
    });

    it("renders accept + cancel buttons on pending handoffs when write mode on", () => {
      enableWrite();
      const data = { data: { pending: [{ id: "h1", targetAgent: "orchestrator", status: "open", summary: "test" }] } };
      const html = renderHandoffs(data, { project: "proj-1" });
      expect(html).toContain('data-action="handoff-accept"');
      expect(html).toContain('data-action="handoff-cancel"');
      expect(html).toContain('data-id="h1"');
    });

    it("hides create + accept/cancel when write mode off", () => {
      disableWrite();
      const data = { data: { pending: [{ id: "h1", targetAgent: "x", status: "open", summary: "y" }] } };
      const html = renderHandoffs(data, { project: "proj-1" });
      expect(html).not.toContain("Create Handoff");
      expect(html).not.toContain('data-action="handoff-accept"');
      expect(html).not.toContain('data-action="handoff-cancel"');
    });
  });

  describe("checkpoint create + delete (CHKP-02, CHKP-04)", () => {
    it("renders create-checkpoint form when write mode on", () => {
      enableWrite();
      const data = { success: true, data: { checkpoints: [{ id: "c1", taskId: "t1", type: "manual", status: "completed", description: "d" }] } };
      const html = renderCheckpoints(data);
      expect(html).toContain("Create Checkpoint");
      expect(html).toContain('data-action="checkpoint-create"');
      expect(html).toContain('data-create="taskId"');
      expect(html).toContain('data-create="description"');
      expect(html).toContain('data-create="status"');
      expect(html).toContain('data-create="progressPercent"');
      expect(html).toContain('data-create="checkpointType"');
    });

    it("renders delete button on checkpoint rows when write mode on", () => {
      enableWrite();
      const data = { success: true, data: { checkpoints: [{ id: "c1", taskId: "t1", type: "manual", status: "completed", description: "d" }] } };
      const html = renderCheckpoints(data);
      expect(html).toContain('data-action="checkpoint-delete"');
      expect(html).toContain('data-id="c1"');
    });

    it("hides create + delete when write mode off", () => {
      disableWrite();
      const data = { success: true, data: { checkpoints: [{ id: "c1", taskId: "t1", type: "manual", status: "completed", description: "d" }] } };
      const html = renderCheckpoints(data);
      expect(html).not.toContain("Create Checkpoint");
      expect(html).not.toContain('data-action="checkpoint-delete"');
    });
  });

  describe("project index + reset (PROJ-02, PROJ-04)", () => {
    it("renders index-project form when write mode on", () => {
      enableWrite();
      const data = { projects: [{ projectId: "p1", documentCount: 10 }] };
      const html = renderProjects(data);
      expect(html).toContain("Index Project");
      expect(html).toContain('data-action="project-index"');
      expect(html).toContain('data-create="projectPath"');
      expect(html).toContain('data-create="projectId"');
      expect(html).toContain('data-create="forceReindex"');
      expect(html).toContain('data-create="warmCache"');
    });

    it("renders reset button on project rows when write mode on", () => {
      enableWrite();
      const data = { projects: [{ projectId: "p1", documentCount: 10 }] };
      const html = renderProjects(data);
      expect(html).toContain('data-action="project-reset"');
      expect(html).toContain('data-project="p1"');
    });

    it("hides index form + reset button when write mode off", () => {
      disableWrite();
      const data = { projects: [{ projectId: "p1", documentCount: 10 }] };
      const html = renderProjects(data);
      expect(html).not.toContain("Index Project");
      expect(html).not.toContain('data-action="project-reset"');
    });
  });
});
