/**
 * massa-ai Web UI — app.js (admin portal).
 *
 * Single source for the pure helpers (markdownToHtml, view renderers, theme
 * helpers). The browser-init block is guarded by `typeof document !==
 * "undefined"` so the same file can be imported under bun:test without a DOM.
 *
 * Admin portal: write operations are gated by isWriteModeEnabled() (default ON
 * for trusted local callers with the massa-ai-api-key meta tag). Any
 * /api/v1/* route is callable with the injected key; trust is the gate, not a
 * path blocklist.
 */

// ── Constants ──────────────────────────────────────────────────────────────

import { renderDashboard, fetchDashboardData } from "./dashboard.js";

export const MEMORY_TYPES = ["critical", "conversation", "code", "decision", "pattern"];

export const MEMORY_LEVELS = [
  { value: 1, label: "1 — Project" },
  { value: 2, label: "2 — User" },
  { value: 3, label: "3 — Session" },
];

/**
 * Base request body for the checkpoints view.
 *
 * `format: "json"` is load-bearing. POST /api/v1/checkpoints/list defaults to
 * `format: "toon"`, whose `data` is a formatted *string*, not an object — the
 * renderer cannot read rows out of it and the view silently shows the empty
 * state no matter how many checkpoints exist.
 *
 * Exported so route-contract.test.ts posts the exact body the UI posts, which
 * is what keeps this bound to the real route response.
 */
export const CHECKPOINTS_LIST_BODY = { limit: 50, format: "json" };

const THEME_STORAGE_KEY = "massa-ai-ui-theme";

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
export function isWriteModeEnabled() {
  if (typeof globalThis !== "undefined" && globalThis.MASSA_AI_WEB_WRITE_MODE === false) return false;
  try {
    if (localStorage.getItem("massa-ai-write-mode") === "false") return false;
  } catch {
    // localStorage unavailable (test/Node without DOM) — fall through
  }
  if (readInjectedApiKey(typeof document !== "undefined" ? document : null)) return true;
  if (typeof globalThis !== "undefined" && globalThis.MASSA_AI_WEB_WRITE_MODE === true) return true;
  try {
    return localStorage.getItem("massa-ai-write-mode") === "true";
  } catch {
    return false;
  }
}

// ── HTML escaping ──────────────────────────────────────────────────────────

export function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Markdown renderer (marked + DOMPurify with XSS prevention) ──────────────

/**
 * Render markdown to safe HTML using marked + DOMPurify.
 * Falls back to the built-in minimal renderer when the CDN libraries are not
 * loaded (e.g., in test environments without a DOM).
 *
 * SECURITY: never use raw innerHTML with unsanitized markdown output.
 * DOMPurify.sanitize() strips XSS vectors (scripts, event handlers, etc.).
 * F4 mitigation: stored markdown cannot inject scripts.
 */
export function markdownToHtml(md) {
  if (!md) return "";
  const text = String(md);

  // Use marked + DOMPurify when available (browser with CDN scripts loaded)
  if (typeof globalThis !== "undefined") {
    const markedLib = globalThis.marked;
    const purifyLib = globalThis.DOMPurify;
    if (markedLib && purifyLib) {
      try {
        const rawHtml = markedLib.parse(text);
        return purifyLib.sanitize(rawHtml);
      } catch {
        // fall through to minimal renderer on parse error
      }
    }
  }

  // Fallback: minimal built-in renderer (no table support, but safe)
  return _minimalMarkdownToHtml(text);
}

/**
 * Minimal built-in markdown renderer — escapes all raw text first so injected
 * HTML/tags cannot execute. Used as fallback when marked/DOMPurify are not
 * available (tests, non-browser). Supported: headings, bold, italic, inline
 * code, fenced code blocks, lists, links, paragraphs.
 */
function _minimalMarkdownToHtml(md) {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let para = [];

  const flushLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };
  const flushPara = () => {
    if (para.length > 0) {
      out.push("<p>" + inline(para.join(" ")) + "</p>");
      para = [];
    }
  };

  function inline(text) {
    let t = escapeHtml(text);
    const codeStash = [];
    t = t.replace(/`([^`]+)`/g, (_m, c) => {
      codeStash.push(c);
      return "@@MASSA_AICODE" + (codeStash.length - 1) + "@@";
    });
    t = t.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      (_m, label, url) =>
        '<a href="' + url + '" rel="noopener noreferrer" target="_blank">' + label + "</a>",
    );
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    t = t.replace(/@@MASSA_AICODE(\d+)@@/g, (_m, idx) => "<code>" + codeStash[Number(idx)] + "</code>");
    return t;
  }

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushPara();
      flushLists();
      const lang = fence[1] || "";
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const cls = lang ? ' class="language-' + escapeHtml(lang) + '"' : "";
      out.push("<pre><code" + cls + ">" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      flushLists();
      const level = h[1].length;
      out.push("<h" + level + ">" + inline(h[2]) + "</h" + level + ">");
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push("<li>" + inline(line.replace(/^\s*[-*]\s+/, "")) + "</li>");
      i++;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push("<li>" + inline(line.replace(/^\s*\d+\.\s+/, "")) + "</li>");
      i++;
      continue;
    }

    if (line.trim() === "") {
      flushPara();
      flushLists();
      i++;
      continue;
    }

    flushLists();
    para.push(line);
    i++;
  }
  flushPara();
  flushLists();
  return out.join("\n");
}

// ── View renderers (pure: ({ data, state }) => htmlString) ─────────────────

export function renderProjects(data) {
  const projects = (data && data.projects) || [];
  const writeMode = isWriteModeEnabled();

  const rows = projects
    .map((p) => {
      const id = escapeHtml(p.projectId || p.id || "");
      const count = p.documentCount ?? p.docCount ?? "";
      const meta =
        count !== "" ? ' <span class="muted">(' + escapeHtml(String(count)) + " docs)</span>" : "";
      const resetBtn = writeMode
        ? ' <button type="button" class="btn-delete" data-action="project-reset" data-project="' + id + '">reset</button>'
        : "";
      return "<li>" + escapeHtml(id) + meta + resetBtn + "</li>";
    })
    .join("");

  const indexForm = writeMode
    ? '<div class="create-form">' +
      "<h3>Index Project</h3>" +
      '<div class="form-field"><label>projectPath</label><input type="text" data-create="projectPath" data-form="project-index" /></div>' +
      '<div class="form-field"><label>projectId (optional)</label><input type="text" data-create="projectId" data-form="project-index" /></div>' +
      '<div class="form-field"><label><input type="checkbox" data-create="forceReindex" data-form="project-index" /> forceReindex</label></div>' +
      '<div class="form-field"><label><input type="checkbox" data-create="warmCache" data-form="project-index" /> warmCache</label></div>' +
      '<button type="button" data-action="project-index">Index</button>' +
      "</div>"
    : "";

  if (projects.length === 0 && !writeMode) {
    return '<p class="empty">No indexed projects.</p>';
  }
  return (
    '<section class="view"><h2>Projects</h2><ul class="project-list">' +
    rows +
    "</ul>" +
    indexForm +
    "</section>"
  );
}

export function renderMemoryBrowser(data, state) {
  state = state || {};
  if (!data || data.success === false) {
    return errorBlock(data);
  }
  const payload = data.data || data;
  const memories = (payload && payload.memories) || [];
  const total = (payload && payload.total) || 0;
  const limit = (payload && payload.limit) || 50;
  const offset = (payload && payload.offset) || 0;
  const f = state.filters || {};
  const writeMode = isWriteModeEnabled();

  const typeOpts = MEMORY_TYPES.map(
    (t) =>
      '<option value="' +
      t +
      '"' +
      (f.type === t ? " selected" : "") +
      ">" +
      t +
      "</option>",
  ).join("");
  const levelOpts = MEMORY_LEVELS.map(
    (l) =>
      '<option value="' +
      l.value +
      '"' +
      (String(f.level) === String(l.value) ? " selected" : "") +
      ">" +
      l.label +
      "</option>",
  ).join("");

  const filterBar =
    '<div class="filters">' +
    '<label>type <select data-filter="type"><option value="">(any)</option>' +
    typeOpts +
    "</select></label>" +
    '<label>level <select data-filter="level"><option value="">(any)</option>' +
    levelOpts +
    "</select></label>" +
    '<label>min importance <input type="number" min="0" max="1" step="0.1" data-filter="minImportance" value="' +
    escapeHtml(f.minImportance != null ? String(f.minImportance) : "") +
    '"/></label>' +
    '<button type="button" data-action="memory-refresh">apply</button>' +
    "</div>";

  let body;
  if (memories.length === 0) {
    body = '<p class="empty">No memories match these filters.</p>';
  } else {
    const actionCol = writeMode ? "<th>actions</th>" : "";
    body =
      '<table class="grid"><thead><tr><th>type</th><th>level</th><th>imp.</th><th>content</th>' + actionCol + '</tr></thead><tbody>' +
      memories
        .map((m) => {
          const content = truncate(m.content || "", 200);
          const id = escapeHtml(m.id || "");
          const actions = writeMode
            ? '<td class="actions-cell">' +
              '<button type="button" class="btn-edit" data-action="memory-edit" data-id="' + id + '">edit</button> ' +
              '<button type="button" class="btn-delete" data-action="memory-delete" data-id="' + id + '">delete</button>' +
              "</td>"
            : "";
          return (
            "<tr>" +
            "<td>" +
            escapeHtml(m.type || "") +
            "</td>" +
            "<td>" +
            escapeHtml(String(m.level ?? "")) +
            "</td>" +
            "<td>" +
            escapeHtml(String(m.importance ?? "")) +
            "</td>" +
            '<td class="content-cell">' +
            markdownToHtml(content) +
            "</td>" +
            actions +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table>";
  }

  const pager =
    '<div class="pager muted">' +
    escapeHtml(String(offset + 1)) +
    "–" +
    escapeHtml(String(Math.min(offset + limit, total))) +
    " of " +
    escapeHtml(String(total)) +
    ' <button type="button" data-action="memory-prev"' +
    (offset === 0 ? " disabled" : "") +
    ">prev</button>" +
    '<button type="button" data-action="memory-next"' +
    (offset + limit >= total ? " disabled" : "") +
    ">next</button></div>";

  const createForm = writeMode
    ? '<div class="create-form">' +
      "<h3>Create Memory</h3>" +
      '<div class="form-field"><label>content</label><textarea data-create="content" data-form="memory-create"></textarea></div>' +
      '<div class="form-field"><label>type</label><select data-create="type" data-form="memory-create">' +
      MEMORY_TYPES.map((t) => '<option value="' + t + '">' + t + "</option>").join("") +
      "</select></div>" +
      '<div class="form-field"><label>importance (0-1)</label><input type="number" min="0" max="1" step="0.1" data-create="importance" data-form="memory-create" value="0.5" /></div>' +
      '<div class="form-field"><label>tags (comma-separated)</label><input type="text" data-create="tags" data-form="memory-create" /></div>' +
      '<div class="form-field"><label>projectId</label><input type="text" data-create="projectId" data-form="memory-create" /></div>' +
      '<button type="button" data-action="memory-create">Create</button>' +
      "</div>"
    : "";

  return (
    '<section class="view"><h2>Memory</h2>' +
    filterBar +
    body +
    pager +
    createForm +
    "</section>"
  );
}

export function renderSearch(data, state) {
  state = state || {};
  const query = (state.query || "").trim();
  const input =
    '<div class="filters"><input type="search" data-bind="query" placeholder="search memories…" value="' +
    escapeHtml(query) +
    '"/> <button type="button" data-action="search-run">search</button></div>';
  if (!query) {
    return (
      '<section class="view"><h2>Search</h2>' +
      input +
      '<p class="muted">Enter a query to search memories (FTS5 + semantic).</p></section>'
    );
  }
  if (!data || data.success === false) {
    return '<section class="view"><h2>Search</h2>' + input + errorBlock(data) + "</section>";
  }
  const results = extractSearchResults(data);
  let body;
  if (results.length === 0) {
    body = '<p class="empty">No results for "' + escapeHtml(query) + '".</p>';
  } else {
    body =
      '<ul class="result-list">' +
      results
        .map((r) => {
          const content = r.content || r.text || "";
          const score = r.score != null ? ' <span class="muted">(' + escapeHtml(String(r.score)) + ")</span>" : "";
          return (
            '<li><div class="result-content">' +
            markdownToHtml(content) +
            "</div>" +
            score +
            "</li>"
          );
        })
        .join("") +
      "</ul>";
  }
  return '<section class="view"><h2>Search</h2>' + input + body + "</section>";
}

export function renderHandoffs(data, state) {
  state = state || {};
  const project = state.project || "";
  const writeMode = isWriteModeEnabled();
  if (!project) {
    return (
      '<section class="view"><h2>Handoffs</h2>' +
      '<p class="muted">Select a project to list pending handoffs.</p></section>'
    );
  }
  if (!data || data.success === false) {
    return '<section class="view"><h2>Handoffs</h2>' + errorBlock(data) + "</section>";
  }
  const payload = data.data || data;
  const pending = (payload && payload.pending) || [];

  const createForm = writeMode
    ? '<div class="create-form">' +
      "<h3>Create Handoff</h3>" +
      '<div class="form-field"><label>projectId</label><input type="text" data-create="projectId" data-form="handoff-create" value="' + escapeHtml(project) + '" /></div>' +
      '<div class="form-field"><label>summary</label><input type="text" data-create="summary" data-form="handoff-create" /></div>' +
      '<div class="form-field"><label>targetAgent (optional)</label><input type="text" data-create="targetAgent" data-form="handoff-create" /></div>' +
      '<div class="form-field"><label>openQuestions (comma-separated)</label><input type="text" data-create="openQuestions" data-form="handoff-create" /></div>' +
      '<div class="form-field"><label>nextSteps (comma-separated)</label><input type="text" data-create="nextSteps" data-form="handoff-create" /></div>' +
      '<div class="form-field"><label>files (comma-separated)</label><input type="text" data-create="files" data-form="handoff-create" /></div>' +
      '<button type="button" data-action="handoff-create">Create</button>' +
      "</div>"
    : "";

  if (pending.length === 0 && !writeMode) {
    return '<section class="view"><h2>Handoffs</h2><p class="empty">No pending handoffs.</p></section>';
  }
  const rows = pending
    .map((h) => {
      const id = escapeHtml(h.id || "");
      const actions = writeMode
        ? '<div class="actions-cell">' +
          '<button type="button" class="btn-approve" data-action="handoff-accept" data-id="' + id + '">accept</button> ' +
          '<button type="button" class="btn-delete" data-action="handoff-cancel" data-id="' + id + '">cancel</button>' +
          "</div>"
        : "";
      return (
        '<div class="card">' +
        "<div><strong>" +
        escapeHtml(h.targetAgent || "(any agent)") +
        "</strong> <span class=\"muted\">" +
        escapeHtml(h.status || "") +
        "</span></div>" +
        '<div class="card-body">' +
        markdownToHtml(h.summary || "(no summary)") +
        "</div>" +
        "<div class=\"muted\">" +
        escapeHtml(h.id || "") +
        "</div>" +
        actions +
        "</div>"
      );
    })
    .join("");
  return '<section class="view"><h2>Handoffs</h2>' + rows + createForm + "</section>";
}

export function renderProposals(data, state) {
  state = state || {};
  const project = state.project || "";
  if (!project) {
    return (
      '<section class="view"><h2>Proposals</h2>' +
      '<p class="muted">Select a project to list pending auto-improvement proposals.</p></section>'
    );
  }
  if (!data || data.success === false) {
    return '<section class="view"><h2>Proposals</h2>' + errorBlock(data) + "</section>";
  }
  const payload = data.data || data;
  // The route returns `pending` (see apps/tools-api/src/routes/proposals.ts);
  // `proposals` is accepted only as a legacy alias.
  const proposals = (payload && (payload.pending || payload.proposals)) || [];
  if (proposals.length === 0) {
    return '<section class="view"><h2>Proposals</h2><p class="empty">No pending proposals.</p></section>';
  }
  const writeMode = isWriteModeEnabled();
  const rows = proposals
    .map((p) => {
      const id = escapeHtml(p.id || "");
      const actions = writeMode
        ? '<div class="actions-cell">' +
          '<button type="button" class="btn-approve" data-action="proposal-approve" data-id="' + id + '">approve</button> ' +
          '<button type="button" class="btn-reject" data-action="proposal-reject" data-id="' + id + '">reject</button>' +
          "</div>"
        : "";
      return (
        '<div class="card">' +
        "<div><strong>" +
        escapeHtml(p.type || "proposal") +
        "</strong> <span class=\"muted\">" +
        escapeHtml(p.status || "") +
        "</span></div>" +
        '<div class="card-body">' +
        markdownToHtml(p.description || p.summary || "(no description)") +
        "</div>" +
        "<div class=\"muted\">" +
        escapeHtml(p.id || "") +
        "</div>" +
        actions +
        "</div>"
      );
    })
    .join("");
  return '<section class="view"><h2>Proposals</h2>' + rows + "</section>";
}

export function renderCheckpoints(data) {
  const writeMode = isWriteModeEnabled();
  if (!data || data.success === false) {
    return '<section class="view"><h2>Checkpoints</h2>' + errorBlock(data) + "</section>";
  }
  const rows = extractCheckpointRows(data);
  if (rows === null) {
    return (
      '<section class="view"><h2>Checkpoints</h2>' +
      errorBlock({
        error:
          'Unreadable checkpoints response: expected JSON rows. The list route ' +
          'returns a TOON string unless the request sends format:"json".',
      }) +
      "</section>"
    );
  }

  const createForm = writeMode
    ? '<div class="create-form">' +
      "<h3>Create Checkpoint</h3>" +
      '<div class="form-field"><label>taskId</label><input type="text" data-create="taskId" data-form="checkpoint-create" /></div>' +
      '<div class="form-field"><label>description</label><input type="text" data-create="description" data-form="checkpoint-create" /></div>' +
      '<div class="form-field"><label>status</label><select data-create="status" data-form="checkpoint-create"><option>pending</option><option>in_progress</option><option>completed</option><option>failed</option><option>paused</option></select></div>' +
      '<div class="form-field"><label>progressPercent</label><input type="number" min="0" max="100" data-create="progressPercent" data-form="checkpoint-create" value="0" /></div>' +
      '<div class="form-field"><label>currentStep</label><input type="text" data-create="currentStep" data-form="checkpoint-create" /></div>' +
      '<div class="form-field"><label>totalSteps</label><input type="number" data-create="totalSteps" data-form="checkpoint-create" /></div>' +
      '<div class="form-field"><label>completedSteps</label><input type="number" data-create="completedSteps" data-form="checkpoint-create" /></div>' +
      '<div class="form-field"><label>checkpointType</label><select data-create="checkpointType" data-form="checkpoint-create"><option>manual</option><option>milestone</option></select></div>' +
      '<button type="button" data-action="checkpoint-create">Create</button>' +
      "</div>"
    : "";

  if (rows.length === 0 && !writeMode) {
    return '<section class="view"><h2>Checkpoints</h2><p class="empty">No checkpoints.</p></section>';
  }
  const actionCol = writeMode ? "<th>actions</th>" : "";
  const body =
    '<table class="grid"><thead><tr><th>task</th><th>type</th><th>status</th><th>description</th>' + actionCol + '</tr></thead><tbody>' +
    rows
      .map((c) => {
        const id = escapeHtml(c.id || c.checkpointId || "");
        const actions = writeMode
          ? '<td class="actions-cell">' +
            '<button type="button" class="btn-delete" data-action="checkpoint-delete" data-id="' + id + '" data-task="' + escapeHtml(c.taskId || "") + '">delete</button>' +
            "</td>"
          : "";
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(c.taskId || "") +
          "</td>" +
          "<td>" +
          escapeHtml(c.type || c.checkpointType || "") +
          "</td>" +
          "<td>" +
          escapeHtml(c.status || "") +
          "</td>" +
          '<td class="content-cell">' +
          escapeHtml(c.description || "") +
          "</td>" +
          actions +
          "</tr>"
        );
      })
      .join("") +
    "</tbody></table>";
  return '<section class="view"><h2>Checkpoints</h2>' + body + createForm + "</section>";
}

// ── Admin portal view stubs (renderers land in T10-T12) ────────────────────

/**
 * Config view renderer. Renders 15 collapsible section cards from the
 * GET /api/v1/config response. Each card generated from declarative field
 * definitions. Sensitive fields masked (type=password) with reveal toggle.
 * Sections in restartNeededSections show a badge. Per-section Save sends
 * only that section to PUT /api/v1/config.
 */

const SENSITIVE_FIELDS = new Set(["database.url", "embedding.apiKey", "llm.apiKey", "security.apiKey"]);

const CONFIG_SECTIONS = [
  {
    key: "database",
    label: "Database",
    fields: [{ name: "url", type: "text", label: "Database URL", sensitive: true }],
  },
  {
    key: "embedding",
    label: "Embedding",
    fields: [
      { name: "provider", type: "enum", label: "Provider", enum: ["ollama", "mistral", "openai", "google", "cohere"] },
      { name: "model", type: "text", label: "Model" },
      { name: "baseURL", type: "text", label: "Base URL" },
      { name: "apiKey", type: "text", label: "API Key", sensitive: true },
      { name: "dimensions", type: "number", label: "Dimensions" },
    ],
  },
  {
    key: "compression",
    label: "Compression",
    fields: [
      { name: "defaultStrategy", type: "text", label: "Default Strategy" },
      { name: "minTokensForCompression", type: "number", label: "Min Tokens" },
      { name: "targetCompressionRatio", type: "number", label: "Target Ratio (0-1)" },
      { name: "prompt", type: "text", label: "Prompt (optional)" },
    ],
  },
  {
    key: "impact",
    label: "Impact Analysis",
    fields: [{ name: "bfsCteEnabled", type: "boolean", label: "BFS CTE Enabled" }],
  },
  {
    key: "capturePolicy",
    label: "Capture Policy",
    fields: [
      { name: "maxMatchWork", type: "number", label: "Max Match Work" },
      { name: "maxIgnorePatterns", type: "number", label: "Max Ignore Patterns" },
      { name: "rules", type: "string[]", label: "Rules (JSON)" },
    ],
  },
  {
    key: "cache",
    label: "Cache",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled" },
      { name: "l1MaxSizeMB", type: "number", label: "L1 Max Size (MB)" },
      { name: "l2MaxSizeMB", type: "number", label: "L2 Max Size (MB)" },
      { name: "defaultTTLSeconds", type: "number", label: "Default TTL (s)" },
    ],
  },
  {
    key: "dataDir",
    label: "Data Directory",
    fields: [{ name: "dataDir", type: "text", label: "Data Directory" }],
  },
  {
    key: "logging",
    label: "Logging",
    fields: [
      { name: "level", type: "enum", label: "Level", enum: ["debug", "info", "warn", "error"] },
      { name: "enableMetrics", type: "boolean", label: "Enable Metrics" },
      { name: "file", type: "text", label: "Log File (optional)" },
    ],
  },
  {
    key: "search",
    label: "Search",
    fields: [
      { name: "autoReindexMaxFiles", type: "number", label: "Auto Reindex Max Files" },
      { name: "queryUnderstanding.enabled", type: "boolean", label: "Query Understanding Enabled" },
      { name: "queryUnderstanding.hydeEnabled", type: "boolean", label: "HyDE Enabled" },
      { name: "queryUnderstanding.cacheTtlMs", type: "number", label: "QU Cache TTL (ms)" },
      { name: "queryUnderstanding.cacheMaxSize", type: "number", label: "QU Cache Max Size" },
      { name: "rerank.enabled", type: "boolean", label: "Rerank Enabled" },
      { name: "rerank.rerankWindow", type: "number", label: "Rerank Window" },
    ],
  },
  {
    key: "llm",
    label: "LLM",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled" },
      { name: "baseUrl", type: "text", label: "Base URL" },
      { name: "apiKey", type: "text", label: "API Key", sensitive: true },
      { name: "model", type: "text", label: "Model" },
      { name: "codeModel", type: "text", label: "Code Model" },
      { name: "temperature", type: "number", label: "Temperature" },
      { name: "maxOutputTokens", type: "number", label: "Max Output Tokens" },
      { name: "timeoutMs", type: "number", label: "Timeout (ms)" },
      { name: "disableThink", type: "boolean", label: "Disable Think" },
    ],
  },
  {
    key: "memory",
    label: "Memory",
    fields: [
      { name: "decay.lambda", type: "number", label: "Decay Lambda" },
      { name: "decay.sigma", type: "number", label: "Decay Sigma" },
      { name: "decay.mu", type: "number", label: "Decay Mu" },
      { name: "decay.coldThreshold", type: "number", label: "Decay Cold Threshold" },
      { name: "bootstrap.enabled", type: "boolean", label: "Bootstrap Enabled" },
      { name: "bootstrap.maxSeedMemories", type: "number", label: "Bootstrap Max Seeds" },
      { name: "bootstrap.centralityLimit", type: "number", label: "Bootstrap Centrality Limit" },
      { name: "bootstrap.gitLogLimit", type: "number", label: "Bootstrap Git Log Limit" },
      { name: "bootstrap.refreshEnabled", type: "boolean", label: "Bootstrap Refresh" },
      { name: "autoImprove.enabled", type: "boolean", label: "Auto Improve Enabled" },
      { name: "autoImprove.reviewGate", type: "boolean", label: "Auto Improve Review Gate" },
      { name: "autoImprove.minObservations", type: "number", label: "Auto Improve Min Observations" },
      { name: "autoImprove.minIntervalMs", type: "number", label: "Auto Improve Min Interval (ms)" },
      { name: "autoImprove.maxWindow", type: "number", label: "Auto Improve Max Window" },
      { name: "autoImprove.minQueryHits", type: "number", label: "Auto Improve Min Query Hits" },
      { name: "autoImprove.minFileHits", type: "number", label: "Auto Improve Min File Hits" },
      { name: "autoImprove.minFixHits", type: "number", label: "Auto Improve Min Fix Hits" },
      { name: "autoImportance.enabled", type: "boolean", label: "Auto Importance Enabled" },
    ],
  },
  {
    key: "hooks",
    label: "Hooks",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled" },
      { name: "maxPayloadBytes", type: "number", label: "Max Payload Bytes" },
      { name: "queue.maxPending", type: "number", label: "Queue Max Pending" },
      { name: "bridge.enabled", type: "boolean", label: "Bridge Enabled" },
      { name: "bridge.minObservations", type: "number", label: "Bridge Min Observations" },
      { name: "bridge.minIntervalMs", type: "number", label: "Bridge Min Interval (ms)" },
      { name: "bridge.maxWindow", type: "number", label: "Bridge Max Window" },
    ],
  },
  {
    key: "synapse",
    label: "Synapse",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled" },
      { name: "inhibition.diversityPenalty.enabled", type: "boolean", label: "Diversity Penalty" },
      { name: "inhibition.diversityPenalty.threshold", type: "number", label: "DP Threshold" },
      { name: "inhibition.diversityPenalty.lambda", type: "number", label: "DP Lambda" },
      { name: "inhibition.temporalInhibition.enabled", type: "boolean", label: "Temporal Inhibition" },
      { name: "inhibition.temporalInhibition.penaltyAgeMs", type: "number", label: "TI Penalty Age (ms)" },
      { name: "inhibition.temporalInhibition.penalty", type: "number", label: "TI Penalty" },
      { name: "inhibition.confidenceGate.enabled", type: "boolean", label: "Confidence Gate" },
      { name: "inhibition.confidenceGate.thresholds.specific", type: "number", label: "CG Specific" },
      { name: "inhibition.confidenceGate.thresholds.focused", type: "number", label: "CG Focused" },
      { name: "inhibition.confidenceGate.thresholds.broad", type: "number", label: "CG Broad" },
      { name: "scoring.attention.enabled", type: "boolean", label: "Attention Scoring" },
      { name: "scoring.attention.rerankWindow", type: "number", label: "Attention Rerank Window" },
      { name: "scoring.attention.recencyHalfLifeMs", type: "number", label: "Recency Half Life (ms)" },
      { name: "scoring.attention.semanticScale", type: "number", label: "Semantic Scale" },
      { name: "metacognition.enabled", type: "boolean", label: "Metacognition" },
      { name: "metacognition.lowConfidenceThreshold", type: "number", label: "Low Confidence Threshold" },
      { name: "metacognition.definitiveTopScore", type: "number", label: "Definitive Top Score" },
      { name: "metacognition.definitiveGap", type: "number", label: "Definitive Gap" },
      { name: "buffer.enabled", type: "boolean", label: "Buffer Enabled" },
      { name: "buffer.maxSize", type: "number", label: "Buffer Max Size" },
      { name: "buffer.ttlMs", type: "number", label: "Buffer TTL (ms)" },
      { name: "buffer.hitBoost", type: "number", label: "Buffer Hit Boost" },
      { name: "buffer.matchThreshold", type: "number", label: "Buffer Match Threshold" },
    ],
  },
  {
    key: "handoffs",
    label: "Handoffs",
    fields: [{ name: "enabled", type: "boolean", label: "Enabled" }],
  },
  {
    key: "security",
    label: "Security",
    fields: [
      { name: "apiKey", type: "text", label: "API Key", sensitive: true },
      { name: "corsOrigins", type: "string[]", label: "CORS Origins" },
      { name: "allowedExtensions", type: "string[]", label: "Allowed Extensions" },
    ],
  },
];

function getConfigFieldValue(config, sectionKey, fieldName) {
  if (sectionKey === "dataDir") return config[sectionKey] || "";
  const section = config[sectionKey];
  if (!section) return undefined;
  const parts = fieldName.split(".");
  let val = section;
  for (const p of parts) {
    val = val && typeof val === "object" ? val[p] : undefined;
  }
  return val;
}

function renderConfigField(sectionKey, field, value) {
  const fieldId = "config-" + sectionKey + "-" + field.name.replace(/\./g, "-");
  const inputName = "config-" + sectionKey + "-" + field.name;
  const isSensitive = field.sensitive || SENSITIVE_FIELDS.has(sectionKey + "." + field.name);
  const displayValue = value === undefined || value === null ? "" : String(value);

  let inputHtml;
  if (field.type === "boolean") {
    const checked = value === true ? " checked" : "";
    inputHtml = '<input type="checkbox" id="' + fieldId + '" name="' + inputName + '"' + checked + ' data-section="' + sectionKey + '" data-field="' + field.name + '" data-type="boolean" />';
  } else if (field.type === "enum") {
    const options = (field.enum || []).map((opt) => {
      const sel = opt === value ? " selected" : "";
      return '<option value="' + escapeHtml(opt) + '"' + sel + ">" + escapeHtml(opt) + "</option>";
    }).join("");
    inputHtml = '<select id="' + fieldId + '" name="' + inputName + '" data-section="' + sectionKey + '" data-field="' + field.name + '" data-type="enum">' + options + "</select>";
  } else if (field.type === "number") {
    inputHtml = '<input type="number" id="' + fieldId + '" name="' + inputName + '" value="' + escapeHtml(displayValue) + '" data-section="' + sectionKey + '" data-field="' + field.name + '" data-type="number" step="any" />';
  } else if (field.type === "string[]") {
    const arrVal = Array.isArray(value) ? value.join(", ") : displayValue;
    inputHtml = '<input type="text" id="' + fieldId + '" name="' + inputName + '" value="' + escapeHtml(arrVal) + '" data-section="' + sectionKey + '" data-field="' + field.name + '" data-type="string[]" placeholder="comma-separated" />';
  } else {
    const inputType = isSensitive ? "password" : "text";
    inputHtml = '<input type="' + inputType + '" id="' + fieldId + '" name="' + inputName + '" value="' + escapeHtml(displayValue) + '" data-section="' + sectionKey + '" data-field="' + field.name + '" data-type="text" />';
  }

  let revealBtn = "";
  if (isSensitive) {
    revealBtn = ' <button type="button" class="reveal-btn" data-action="config-reveal" data-target="' + fieldId + '">reveal</button>';
  }

  return (
    '<div class="config-field">' +
    '<label for="' + fieldId + '">' + escapeHtml(field.label) + "</label>" +
    inputHtml + revealBtn +
    "</div>"
  );
}

export function renderConfig(data, opts) {
  const payload = data || {};
  const config = payload.config || {};
  const restart = payload.restartNeededSections || [];
  const writeMode = opts && opts.writeMode !== undefined ? opts.writeMode : isWriteModeEnabled();
  const restartSet = new Set(restart);

  const cards = CONFIG_SECTIONS.map((section) => {
    const isRestart = restartSet.has(section.key);
    const badge = isRestart ? ' <span class="badge restart-badge">restart needed</span>' : "";
    const fieldsHtml = section.fields.map((field) => {
      const value = getConfigFieldValue(config, section.key, field.name);
      return renderConfigField(section.key, field, value);
    }).join("");
    const saveBtn = writeMode
      ? '<button type="button" class="save-btn" data-action="config-save" data-section="' + section.key + '">Save</button>'
      : "";
    return (
      '<div class="config-section" data-section="' + section.key + '">' +
      '<h3 class="config-section-header">' + escapeHtml(section.label) + badge + "</h3>" +
      '<div class="config-fields">' + fieldsHtml + "</div>" +
      saveBtn +
      "</div>"
    );
  }).join("");

  return '<section class="view"><h2>Config</h2>' + cards + "</section>";
}

function setByPath(obj, dottedPath, value) {
  const parts = dottedPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

export function buildConfigSectionBody(sectionKey, fieldValues) {
  const sectionDef = CONFIG_SECTIONS.find((s) => s.key === sectionKey);
  if (!sectionDef) return {};

  if (sectionKey === "dataDir") {
    return { dataDir: fieldValues.dataDir || "" };
  }

  const nested = {};
  for (const field of sectionDef.fields) {
    const raw = fieldValues[field.name];
    let val = raw;
    if (field.type === "number") {
      val = raw === "" || raw === undefined ? undefined : Number(raw);
    } else if (field.type === "boolean") {
      val = raw === true || raw === "true" || raw === "on";
    } else if (field.type === "string[]") {
      val = raw && typeof raw === "string"
        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
        : Array.isArray(raw) ? raw : [];
    }
    if (val !== undefined) setByPath(nested, field.name, val);
  }
  return { [sectionKey]: nested };
}

/**
 * Profiles view renderer. Reads GET /api/v1/profiles → { hosts: HostProfileState[] }.
 * Renders profile cards grouped by host with active marked, plus a Switch button
 * per profile calling POST /api/v1/profiles/switch when write mode is on.
 */
export function renderProfiles(data, opts) {
  const payload = data || {};
  const hosts = payload.hosts || [];
  const writeMode = opts && opts.writeMode !== undefined ? opts.writeMode : isWriteModeEnabled();

  if (hosts.length === 0) {
    return '<section class="view"><h2>Profiles</h2><p class="empty">No profiles.</p></section>';
  }

  const cards = hosts.map((hostState) => {
    const hostName = hostState.host || "unknown";
    const installed = hostState.installed;
    const skipped = hostState.skipped;
    const activeProfile = hostState.activeProfile;
    const available = hostState.availableProfiles || [];
    const version = hostState.bundleVersion;

    if (skipped) {
      return (
        '<div class="profile-host" data-host="' + escapeHtml(hostName) + '">' +
        "<h3>" + escapeHtml(hostName) + ' <span class="badge muted">skipped</span></h3>' +
        '<p class="muted">' + escapeHtml(hostState.skipReason || "skipped") + "</p>" +
        "</div>"
      );
    }

    if (!installed || available.length === 0) {
      return (
        '<div class="profile-host" data-host="' + escapeHtml(hostName) + '">' +
        "<h3>" + escapeHtml(hostName) + "</h3> <p class=\"muted\">Not installed.</p>" +
        "</div>"
      );
    }

    const profileCards = available.map((profile) => {
      const isActive = profile === activeProfile;
      const switchBtn = writeMode && !isActive
        ? '<button type="button" class="switch-btn" data-action="profile-switch" data-profile="' + escapeHtml(profile) + '" data-host="' + escapeHtml(hostName) + '">Switch</button>'
        : isActive
          ? '<span class="badge active-badge">active</span>'
          : "";
      return (
        '<div class="profile-card' + (isActive ? " active" : "") + '" data-profile="' + escapeHtml(profile) + '">' +
        "<h4>" + escapeHtml(profile) + "</h4>" +
        switchBtn +
        "</div>"
      );
    }).join("");

    const versionBadge = version
      ? ' <span class="badge muted">v' + escapeHtml(version) + "</span>"
      : "";

    return (
      '<div class="profile-host" data-host="' + escapeHtml(hostName) + '">' +
      "<h3>" + escapeHtml(hostName) + versionBadge + "</h3>" +
      '<div class="profile-cards">' + profileCards + "</div>" +
      "</div>"
    );
  }).join("");

  return '<section class="view"><h2>Profiles</h2>' + cards + "</section>";
}

// ── Model-registry editor (T12 — REG-01..18 UI side) ────────────────────────

/** Frontend copy of HOST_EFFORT_ENUM (scripts/lib/model-profiles.ts:71).
 *  Kept in sync manually; the frontend cannot import from scripts/lib. */
const UI_HOST_EFFORT_ENUM = {
  claude: ["low", "medium", "high", "xhigh", "max"],
  codex: ["minimal", "low", "medium", "high", "xhigh"],
  cursor: [],
  opencode: null,
};

const REGISTRY_HOSTS = ["claude", "codex", "cursor", "opencode"];

/**
 * Model-registry editor renderer. Renders a grid (rows = {host, tier} pairs,
 * columns = profiles, cells = {model, effort}). Marks overlay-sourced cells.
 * Effort constrained to HOST_EFFORT_ENUM per host. Add/duplicate/delete/restore
 * profile flows, hostDefaults + workflowTiers editable, regenerate +
 * clear-overlay + save-overlay buttons.
 */
export function renderModelRegistry(data, opts) {
  const payload = data || {};
  const registry = payload.registry || {};
  const source = payload.source || {};
  const overlayError = payload.overlayError;
  const writeMode = opts && opts.writeMode !== undefined ? opts.writeMode : isWriteModeEnabled();

  const profiles = registry.profiles || {};
  const profileNames = Object.keys(profiles);
  const tiers = registry.tiers || [];
  const hostDefaults = registry.hostDefaults || {};
  const workflowTiers = registry.workflowTiers || {};
  const overlayProfiles = (source.overlay && source.overlay.profiles) || {};
  const tombstoned = source.tombstoned || [];

  if (profileNames.length === 0 && !overlayError) {
    return '<section class="view"><h2>Model Registry</h2><p class="empty">No profiles in registry.</p></section>';
  }

  const overlayBanner = overlayError
    ? '<div class="error">Overlay error: ' + escapeHtml(overlayError) + " (showing builtin)</div>"
    : "";

  // Build rows = {host, tier} pairs
  const rows = [];
  for (const host of REGISTRY_HOSTS) {
    for (const tier of tiers) {
      rows.push({ host, tier });
    }
  }

  // Grid header: profile names as columns
  const headerCells = profileNames.map((p) => {
    const isOverlay = Object.prototype.hasOwnProperty.call(overlayProfiles, p);
    const overlayMark = isOverlay ? ' <span class="badge overlay-badge">overlay</span>' : "";
    return "<th>" + escapeHtml(p) + overlayMark + "</th>";
  }).join("");

  // Grid body: rows = {host, tier}, cells = {model, effort}
  const bodyRows = rows.map((row) => {
    const cells = profileNames.map((profileName) => {
      const profile = profiles[profileName];
      if (!profile || !profile.hosts) return '<td class="cell-empty">—</td>';
      const hostMap = profile.hosts[row.host];
      if (!hostMap) return '<td class="cell-empty">—</td>';
      const cell = hostMap[row.tier];
      if (!cell) return '<td class="cell-empty">—</td>';
      const model = cell.model || "";
      const effort = cell.effort || "";
      const isOverlay = Object.prototype.hasOwnProperty.call(overlayProfiles, profileName);
      const overlayClass = isOverlay ? " overlay-sourced" : "";
      const effortOptions = UI_HOST_EFFORT_ENUM[row.host];
      let effortInput;
      if (effortOptions && effortOptions.length > 0) {
        const opts2 = effortOptions.map((e) => {
          const sel = e === effort ? " selected" : "";
          return '<option value="' + escapeHtml(e) + '"' + sel + ">" + escapeHtml(e) + "</option>";
        }).join("");
        effortInput = '<select data-action="registry-effort" data-profile="' + escapeHtml(profileName) + '" data-host="' + escapeHtml(row.host) + '" data-tier="' + escapeHtml(row.tier) + '" data-type="enum"' + (writeMode ? "" : " disabled") + ">" + opts2 + "</select>";
      } else if (effortOptions === null) {
        effortInput = '<input type="text" data-action="registry-effort" data-profile="' + escapeHtml(profileName) + '" data-host="' + escapeHtml(row.host) + '" data-tier="' + escapeHtml(row.tier) + '" value="' + escapeHtml(effort) + '" data-type="text"' + (writeMode ? "" : " disabled") + " />";
      } else {
        effortInput = '<span class="muted">n/a</span>';
      }
      const modelInput = writeMode
        ? '<input type="text" data-action="registry-model" data-profile="' + escapeHtml(profileName) + '" data-host="' + escapeHtml(row.host) + '" data-tier="' + escapeHtml(row.tier) + '" value="' + escapeHtml(model) + '" />'
        : '<span>' + escapeHtml(model || "—") + "</span>";
      return '<td class="registry-cell' + overlayClass + '">' + modelInput + effortInput + "</td>";
    }).join("");
    return "<tr><th>" + escapeHtml(row.host) + " / " + escapeHtml(row.tier) + "</th>" + cells + "</tr>";
  }).join("");

  const grid =
    '<table class="registry-grid"><thead><tr><th>host / tier</th>' + headerCells + "</tr></thead><tbody>" + bodyRows + "</tbody></table>";

  // hostDefaults editor
  const hostDefaultsRows = REGISTRY_HOSTS.map((host) => {
    const current = hostDefaults[host] || "";
    const opts2 = profileNames.map((p) => {
      const sel = p === current ? " selected" : "";
      return '<option value="' + escapeHtml(p) + '"' + sel + ">" + escapeHtml(p) + "</option>";
    }).join("");
    return (
      '<div class="config-field"><label>' + escapeHtml(host) + "</label>" +
      '<select data-action="registry-hostDefault" data-host="' + escapeHtml(host) + '"' + (writeMode ? "" : " disabled") + ">" + opts2 + "</select></div>"
    );
  }).join("");

  // workflowTiers editor
  const workflowTierNames = Object.keys(workflowTiers);
  const workflowTiersRows = workflowTierNames.map((wf) => {
    const current = workflowTiers[wf] || "";
    const tierOpts = tiers.map((t) => {
      const sel = t === current ? " selected" : "";
      return '<option value="' + escapeHtml(t) + '"' + sel + ">" + escapeHtml(t) + "</option>";
    }).join("");
    return (
      '<div class="config-field"><label>' + escapeHtml(wf) + "</label>" +
      '<select data-action="registry-workflowTier" data-workflow="' + escapeHtml(wf) + '"' + (writeMode ? "" : " disabled") + ">" + tierOpts + "</select></div>"
    );
  }).join("");

  // Profile management: add / duplicate / delete / restore
  const profileActions = writeMode
    ? '<div class="registry-actions">' +
      '<button type="button" data-action="registry-add-profile">Add Profile</button>' +
      '<button type="button" data-action="registry-duplicate-profile">Duplicate Profile</button>' +
      '<button type="button" data-action="registry-delete-profile">Delete Profile</button>' +
      "</div>"
    : "";

  const tombstonedList = tombstoned.length
    ? '<div class="tombstoned"><h4>Deleted (restorable)</h4>' +
      tombstoned.map((p) => {
        const restoreBtn = writeMode
          ? ' <button type="button" data-action="registry-restore" data-profile="' + escapeHtml(p) + '">Restore</button>'
          : "";
        return '<div class="tombstoned-item" data-tombstoned="' + escapeHtml(p) + '">' + escapeHtml(p) + restoreBtn + "</div>";
      }).join("") +
      "</div>"
    : "";

  const actionButtons = writeMode
    ? '<div class="registry-action-buttons">' +
      '<button type="button" data-action="registry-save-overlay">Save Overlay</button>' +
      '<button type="button" data-action="registry-regenerate">Regenerate Artifacts</button>' +
      '<button type="button" data-action="registry-clear-overlay">Reset to Built-in (clear overlay)</button>' +
      "</div>"
    : "";

  return (
    '<section class="view"><h2>Model Registry</h2>' +
    overlayBanner +
    grid +
    '<div class="registry-hostDefaults"><h3>Host Defaults</h3>' + hostDefaultsRows + "</div>" +
    '<div class="registry-workflowTiers"><h3>Workflow Tiers</h3>' + workflowTiersRows + "</div>" +
    profileActions +
    tombstonedList +
    actionButtons +
    "</section>"
  );
}

// ── Helpers used by renderers ──────────────────────────────────────────────

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function errorBlock(data) {
  const msg = (data && data.error) || "Request failed.";
  return '<div class="error">' + escapeHtml(msg) + "</div>";
}

/** Normalize the SearchMemoriesTool response shape into a flat result list. */
function extractSearchResults(data) {
  const payload = data && (data.data || data);
  if (Array.isArray(payload && payload.results)) return payload.results;
  if (Array.isArray(payload && payload.memories)) return payload.memories;
  if (Array.isArray(payload)) return payload;
  return [];
}

/**
 * Normalize the ListCheckpointsTool response shape into a flat row list.
 *
 * Returns `null` — not `[]` — when the payload carries no recognizable row
 * container. A TOON-formatted response (`format` omitted, so the route falls
 * back to its "toon" default) puts a *string* here; collapsing that to `[]`
 * renders "No checkpoints" and hides the real failure.
 */
function extractCheckpointRows(data) {
  const payload = data && (data.data || data);
  if (Array.isArray(payload && payload.checkpoints)) return payload.checkpoints;
  if (Array.isArray(payload && payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") return [];
  return null;
}

// ── Theme helpers ──────────────────────────────────────────────────────────

export function initTheme(doc, store) {
  doc = doc || (typeof document !== "undefined" ? document : null);
  store = store || (typeof localStorage !== "undefined" ? localStorage : null);
  let theme = "light";
  try {
    if (store) {
      const t = store.getItem(THEME_STORAGE_KEY);
      if (t === "dark" || t === "light") theme = t;
    }
  } catch {}
  if (doc && doc.documentElement) {
    doc.documentElement.setAttribute("data-theme", theme);
  }
  return theme;
}

export function toggleTheme(doc, store) {
  doc = doc || (typeof document !== "undefined" ? document : null);
  store = store || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!doc || !doc.documentElement) return "light";
  const current = doc.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  doc.documentElement.setAttribute("data-theme", next);
  try {
    if (store) store.setItem(THEME_STORAGE_KEY, next);
  } catch {}
  return next;
}

// ── Browser bootstrap (guarded; skipped under test/Node) ───────────────────

// Every /api/v1/* route now requires a key (SEC-01). The dashboard has no
// login: the server stamps the key into this page's <head> when the request
// came from a caller it trusts, and we read it back here. When the tag is
// absent the caller was untrusted, requests go out without the header, and the
// server answers 401 — the server-rendered banner already explains why.
function readInjectedApiKey(doc) {
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

function createApiClient(opts) {
  opts = opts || {};
  const base = opts.base != null ? opts.base : "";
  const fetchImpl = opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
  const doc = opts.document || (typeof document !== "undefined" ? document : null);
  // opts.apiKey is the explicit seam tests use; otherwise read the meta tag.
  const apiKey = opts.apiKey !== undefined ? opts.apiKey : readInjectedApiKey(doc);
  async function request(path, init) {
    init = init || {};
    if (!fetchImpl) throw new Error("fetch unavailable");
    const url = base + path;
    const headers = {};
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
  return { request };
}

// ── Admin portal enhancement handlers (exported, context-injected) ──────────
// These are module-level pure-ish functions taking a ctx { api, root, state,
// render, doc }. startApp() builds ctx and wires them in wireViewHandlers().
// Tests inject mock ctx. This avoids a startApp DOM harness for handler tests.

const BANNER_AUTOHIDE_MS = 6000;

export function showBanner(root, type, message) {
  // Clear existing banner(s) — only one at a time.
  const existing = root.querySelectorAll ? root.querySelectorAll(".success, .error") : [];
  existing.forEach((b) => { if (b.remove) b.remove(); });
  const div = {
    className: type === "success" ? "success" : "error",
    textContent: message,
    style: {},
    remove: () => {},
    addEventListener: () => {},
  };
  // Prepend to root (top of view). Use insertBefore if firstChild exists.
  try {
    if (root.insertBefore) root.insertBefore(div, root.firstChild || null);
    else if (root.children) root.children.unshift(div);
  } catch {
    // best effort
  }
  if (type === "success" && typeof setTimeout !== "undefined") {
    setTimeout(() => { if (div.remove) div.remove(); }, BANNER_AUTOHIDE_MS);
  }
  return div;
}

/** Collect field values for a config section from the rendered DOM. */
function collectConfigSectionFields(root, section) {
  const fieldValues = {};
  const els = root.querySelectorAll('[data-section="' + section + '"]');
  els.forEach((el) => {
    const field = el.dataset && el.dataset.field;
    if (!field) return;
    if (el.type === "checkbox") fieldValues[field] = !!el.checked;
    else fieldValues[field] = el.value;
  });
  return fieldValues;
}

export async function handleConfigSave(ctx, section) {
  const sectionDef = CONFIG_SECTIONS.find((s) => s.key === section);
  const label = sectionDef ? sectionDef.label : section;
  if (!confirm("Save " + label + " config? A backup will be created.")) return;
  const fieldValues = collectConfigSectionFields(ctx.root, section);
  const body = buildConfigSectionBody(section, fieldValues);
  try {
    const res = await ctx.api.request("/api/v1/config", { method: "PUT", body });
    if (res && res.success === false) {
      const details = res.details ? res.details.join("; ") : (res.error || "Save failed.");
      showBanner(ctx.root, "error", "Save failed: " + details);
      return;
    }
    showBanner(ctx.root, "success", "Config section " + section + " saved. Backup created.");
    ctx.render();
  } catch (e) {
    showBanner(ctx.root, "error", "Save failed: " + String((e && e.message) || e));
  }
}

export function handleConfigReveal(ctx, targetId) {
  const el = ctx.doc && ctx.doc.getElementById ? ctx.doc.getElementById(targetId) : null;
  if (!el) return;
  if (el.type === "password") el.type = "text";
  else if (el.type === "text") el.type = "password";
}

// ── Profiles tab switcher + switch handler (Component 2) ─────────────────────

const PROFILES_TAB_STORAGE_KEY = "massa-ai-profiles-tab";

export function renderProfilesView(profilesData, registryData, opts) {
  opts = opts || {};
  const tab = opts.profilesTab || "switch";
  const writeMode = opts.writeMode !== undefined ? opts.writeMode : isWriteModeEnabled();

  const switcher =
    '<div class="tab-switcher">' +
    '<button type="button" class="tab' + (tab === "switch" ? " active" : "") + '" data-action="profiles-tab" data-tab="switch">Switch Profile</button>' +
    '<button type="button" class="tab' + (tab === "registry" ? " active" : "") + '" data-action="profiles-tab" data-tab="registry">Edit Registry</button>' +
    "</div>";

  let body;
  if (tab === "registry") {
    body = renderModelRegistry(registryData, { writeMode });
  } else {
    body = renderProfiles(profilesData, { writeMode });
  }

  return '<section class="view"><h2>Profiles</h2>' + switcher + body + "</section>";
}

export function handleProfilesTabSwitch(ctx, tab) {
  ctx.state.profilesTab = tab;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(PROFILES_TAB_STORAGE_KEY, tab);
  } catch {
    // localStorage unavailable — non-fatal
  }
  ctx.render();
}

export async function handleProfileSwitch(ctx, profile, host) {
  if (!confirm("Switch " + host + " to profile " + profile + "? Replaces installed agent files. Session restart required.")) return;
  const body = { profile };
  if (host) body.host = host;
  try {
    const res = await ctx.api.request("/api/v1/profiles/switch", { method: "POST", body });
    if (res && res.success === false) {
      const errInfo = res.error || {};
      const code = (errInfo && errInfo.code) || "error";
      const message = (errInfo && errInfo.message) || "switch failed";
      showBanner(ctx.root, "error", "Switch failed (" + code + "): " + message);
      return;
    }
    const data = (res && res.data) || {};
    const switched = (data.switched || []).join(", ") || "none";
    const skipped = (data.skipped || []).join(", ") || "none";
    const failed = (data.failed || []).map((f) => f.host + ": " + (f.reason || "unknown")).join("; ") || "none";
    showBanner(ctx.root, "success", "Switched: " + switched + " | Skipped: " + skipped + " | Failed: " + failed);
    ctx.render();
  } catch (e) {
    showBanner(ctx.root, "error", "Switch failed: " + String((e && e.message) || e));
  }
}

function startApp(opts) {
  opts = opts || {};
  const doc = opts.document || (typeof document !== "undefined" ? document : null);
  if (!doc) return;
  const root = doc.getElementById("app");
  const projectSelect = doc.getElementById("project-select");
  const themeToggle = doc.getElementById("theme-toggle");
  const api = createApiClient({ base: opts.base });

  const state = {
    view: "projects",
    project: "",
    memoryFilters: { type: "", level: "", minImportance: "" },
    memoryOffset: 0,
    searchQuery: "",
    profilesTab: "switch",
    registryOverlay: null,
    registryDirty: false,
    registryLoaded: false,
    regenerating: false,
    indexJobId: null,
    indexJobStatus: null,
    indexJobPhase: null,
    indexJobFileCount: null,
    indexPollInterval: null,
  };
  try {
    if (typeof localStorage !== "undefined") {
      const t = localStorage.getItem(PROFILES_TAB_STORAGE_KEY);
      if (t === "switch" || t === "registry") state.profilesTab = t;
    }
  } catch {
    // localStorage unavailable — default switch tab
  }

  initTheme(doc);

  function setNavActive() {
    doc.querySelectorAll(".nav a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === "#" + hashFor(state.view));
    });
  }
  function hashFor(view) {
    return "/" + view;
  }
  function viewFromHash(h) {
    const name = (h || "").replace(/^#\/?/, "");
    return ["projects", "memory", "search", "handoffs", "proposals", "checkpoints", "dashboard", "config", "profiles", "model-registry"].includes(name)
      ? name
      : "projects";
  }

  async function refreshProjectsForSelect() {
    try {
      const data = await api.request("/api/v1/project/list");
      const projects = ((data && data.data) || {}).projects || [];
      projectSelect.innerHTML =
        '<option value="">(select)</option>' +
        projects
          .map((p) => {
            const id = p.projectId || p.id || "";
            return '<option value="' + escapeHtml(id) + '">' + escapeHtml(id) + "</option>";
          })
          .join("");
    } catch {}
  }

  async function render() {
    setNavActive();
    try {
      if (state.view === "projects") {
        const data = await api.request("/api/v1/project/list");
        root.innerHTML = renderProjects((data && data.data) || { projects: [] });
      } else if (state.view === "memory") {
        const body = {
          limit: 50,
          offset: state.memoryOffset,
        };
        if (state.memoryFilters.type) body.type = state.memoryFilters.type;
        if (state.memoryFilters.level) body.level = Number(state.memoryFilters.level);
        if (state.memoryFilters.minImportance !== "")
          body.minImportance = Number(state.memoryFilters.minImportance);
        if (state.project) body.projectId = state.project;
        const data = await api.request("/api/v1/memory/list", { method: "POST", body });
        root.innerHTML = renderMemoryBrowser(data, { filters: state.memoryFilters });
      } else if (state.view === "search") {
        let data = null;
        if (state.searchQuery.trim()) {
          const body = { query: state.searchQuery, format: "json", limit: 20 };
          if (state.project) body.projectId = state.project;
          data = await api.request("/api/v1/memory/search", { method: "POST", body });
        }
        root.innerHTML = renderSearch(data, { query: state.searchQuery });
      } else if (state.view === "handoffs") {
        let data = null;
        if (state.project) {
          data = await api.request("/api/v1/handoff/list", {
            method: "POST",
            body: { projectId: state.project },
          });
        }
        root.innerHTML = renderHandoffs(data, { project: state.project });
      } else if (state.view === "proposals") {
        let data = null;
        if (state.project) {
          data = await api.request("/api/v1/proposal/list", {
            method: "POST",
            body: { projectId: state.project },
          });
        }
        root.innerHTML = renderProposals(data, { project: state.project });
      } else if (state.view === "checkpoints") {
        const body = { ...CHECKPOINTS_LIST_BODY };
        if (state.project) body.projectId = state.project;
        const data = await api.request("/api/v1/checkpoints/list", { method: "POST", body });
        root.innerHTML = renderCheckpoints(data);
      } else if (state.view === "dashboard") {
        const data = await fetchDashboardData(api);
        root.innerHTML = renderDashboard(data);
      } else if (state.view === "config") {
        const data = await api.request("/api/v1/config");
        root.innerHTML = renderConfig((data && data.data) || { config: {}, restartNeededSections: [] }, { writeMode: isWriteModeEnabled() });
      } else if (state.view === "profiles") {
        const profilesRes = await api.request("/api/v1/profiles");
        const registryRes = await api.request("/api/v1/model-registry");
        root.innerHTML = renderProfilesView(
          (profilesRes && profilesRes.data) || { hosts: [] },
          (registryRes && registryRes.data) || { registry: {}, source: {} },
          { profilesTab: state.profilesTab || "switch", writeMode: isWriteModeEnabled() },
        );
      } else if (state.view === "model-registry") {
        const data = await api.request("/api/v1/model-registry");
        root.innerHTML = renderModelRegistry((data && data.data) || { registry: {}, source: {} }, { writeMode: isWriteModeEnabled() });
      }
    } catch (e) {
      root.innerHTML = '<div class="error">Connection error: ' + escapeHtml(String(e.message || e)) + "</div>";
    }
    wireViewHandlers();
  }

  function wireViewHandlers() {
    // memory filters
    root.querySelectorAll("[data-filter]").forEach((el) => {
      el.addEventListener("change", () => {
        state.memoryFilters[el.dataset.filter] = el.value;
      });
    });
    root.querySelector('[data-action="memory-refresh"]')?.addEventListener("click", () => {
      state.memoryOffset = 0;
      render();
    });
    root.querySelector('[data-action="memory-prev"]')?.addEventListener("click", () => {
      state.memoryOffset = Math.max(0, state.memoryOffset - 50);
      render();
    });
    root.querySelector('[data-action="memory-next"]')?.addEventListener("click", () => {
      state.memoryOffset += 50;
      render();
    });
    // write mode: memory edit/delete
    root.querySelectorAll('[data-action="memory-edit"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (!id) return;
        handleMemoryEdit(id);
      });
    });
    root.querySelectorAll('[data-action="memory-delete"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (!id) return;
        if (confirm("Delete this memory? This cannot be undone.")) {
          handleMemoryDelete(id);
        }
      });
    });
    // write mode: proposal approve/reject
    root.querySelectorAll('[data-action="proposal-approve"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (!id) return;
        handleProposalAction(id, "approve");
      });
    });
    root.querySelectorAll('[data-action="proposal-reject"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (!id) return;
        handleProposalAction(id, "reject");
      });
    });
    // search
    const q = root.querySelector('[data-bind="query"]');
    if (q) {
      q.addEventListener("input", () => {
        state.searchQuery = q.value;
      });
    }
    root.querySelector('[data-action="search-run"]')?.addEventListener("click", () => {
      render();
    });
    // write mode: memory create
    root.querySelector('[data-action="memory-create"]')?.addEventListener("click", () => {
      handleMemoryCreate();
    });
    // write mode: handoff create/accept/cancel
    root.querySelector('[data-action="handoff-create"]')?.addEventListener("click", () => {
      handleHandoffCreate();
    });
    root.querySelectorAll('[data-action="handoff-accept"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (!id) return;
        handleHandoffAction(id, "accept");
      });
    });
    root.querySelectorAll('[data-action="handoff-cancel"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (!id) return;
        if (confirm("Cancel handoff " + id + "? This cannot be undone.")) {
          handleHandoffAction(id, "cancel");
        }
      });
    });
    // write mode: checkpoint create/delete
    root.querySelector('[data-action="checkpoint-create"]')?.addEventListener("click", () => {
      handleCheckpointCreate();
    });
    root.querySelectorAll('[data-action="checkpoint-delete"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const task = btn.dataset.task || "";
        if (!id) return;
        if (confirm("Delete checkpoint " + id + " (task: " + task + ")? This cannot be undone.")) {
          handleCheckpointDelete(id);
        }
      });
    });
    // write mode: project index/reset
    root.querySelector('[data-action="project-index"]')?.addEventListener("click", () => {
      handleProjectIndex();
    });
    root.querySelectorAll('[data-action="project-reset"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const project = btn.dataset.project;
        if (!project) return;
        if (confirm("Reset project " + project + "? This deletes vectors/symbols/memories. This cannot be undone.")) {
          handleProjectReset(project);
        }
      });
    });
    // admin-portal-enhancements: config save/reveal
    const ctx = { api, root, state, render, doc };
    root.querySelectorAll('[data-action="config-save"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.dataset.section;
        if (!section) return;
        handleConfigSave(ctx, section);
      });
    });
    root.querySelectorAll('[data-action="config-reveal"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        if (!target) return;
        handleConfigReveal(ctx, target);
      });
    });
    // admin-portal-enhancements: profiles tab switcher + switch
    root.querySelectorAll('[data-action="profiles-tab"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        if (!tab) return;
        handleProfilesTabSwitch(ctx, tab);
      });
    });
    root.querySelectorAll('[data-action="profile-switch"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const profile = btn.dataset.profile;
        const host = btn.dataset.host;
        if (!profile) return;
        handleProfileSwitch(ctx, profile, host);
      });
    });
  }

  function collectFormData(formName) {
    const data = {};
    root.querySelectorAll('[data-form="' + formName + '"]').forEach((el) => {
      const key = el.dataset.create;
      if (!key) return;
      if (el.type === "checkbox") data[key] = el.checked;
      else if (el.type === "number") data[key] = el.value === "" ? undefined : Number(el.value);
      else data[key] = el.value;
    });
    return data;
  }

  async function handleMemoryEdit(id) {
    const newContent = prompt("Edit memory content:", "");
    if (newContent === null) return;
    try {
      await api.request("/api/v1/memory/" + encodeURIComponent(id), {
        method: "PUT",
        body: { content: newContent },
      });
      render();
    } catch (e) {
      alert("Edit failed: " + String(e.message || e));
    }
  }

  async function handleMemoryDelete(id) {
    try {
      await api.request("/api/v1/memory/" + encodeURIComponent(id), {
        method: "DELETE",
      });
      render();
    } catch (e) {
      alert("Delete failed: " + String(e.message || e));
    }
  }

  async function handleProposalAction(id, action) {
    try {
      await api.request("/api/v1/proposal/" + action, {
        method: "POST",
        body: { id },
      });
      render();
    } catch (e) {
      alert(action + " failed: " + String(e.message || e));
    }
  }

  async function handleMemoryCreate() {
    const data = collectFormData("memory-create");
    if (!data.content) { alert("Content is required."); return; }
    if (data.importance !== undefined && (data.importance < 0 || data.importance > 1)) {
      alert("Importance must be between 0 and 1.");
      return;
    }
    const body = {
      content: data.content,
      type: data.type || "conversation",
      importance: data.importance !== undefined ? data.importance : 0.5,
    };
    if (data.tags) body.tags = String(data.tags).split(",").map((s) => s.trim()).filter(Boolean);
    if (data.projectId) body.projectId = data.projectId;
    try {
      await api.request("/api/v1/memory/store", { method: "POST", body });
      render();
    } catch (e) {
      alert("Create failed: " + String(e.message || e));
    }
  }

  async function handleHandoffCreate() {
    const data = collectFormData("handoff-create");
    if (!data.projectId) { alert("Project ID is required."); return; }
    if (!data.summary) { alert("Summary is required."); return; }
    const body = { projectId: data.projectId, summary: data.summary };
    if (data.targetAgent) body.targetAgent = data.targetAgent;
    if (data.openQuestions) body.openQuestions = String(data.openQuestions).split(",").map((s) => s.trim()).filter(Boolean);
    if (data.nextSteps) body.nextSteps = String(data.nextSteps).split(",").map((s) => s.trim()).filter(Boolean);
    if (data.files) body.files = String(data.files).split(",").map((s) => s.trim()).filter(Boolean);
    try {
      await api.request("/api/v1/handoff/begin", { method: "POST", body });
      render();
    } catch (e) {
      alert("Create failed: " + String(e.message || e));
    }
  }

  async function handleHandoffAction(id, action) {
    try {
      await api.request("/api/v1/handoff/" + action, { method: "POST", body: { id } });
      render();
    } catch (e) {
      alert(action + " failed: " + String(e.message || e));
    }
  }

  async function handleCheckpointCreate() {
    const data = collectFormData("checkpoint-create");
    if (!data.taskId) { alert("Task ID is required."); return; }
    if (!data.description) { alert("Description is required."); return; }
    const body = {
      taskId: data.taskId,
      description: data.description,
      status: data.status || "pending",
      checkpointType: data.checkpointType || "manual",
    };
    if (data.progressPercent !== undefined) body.progressPercent = data.progressPercent;
    if (data.currentStep) body.currentStep = data.currentStep;
    if (data.totalSteps !== undefined) body.totalSteps = data.totalSteps;
    if (data.completedSteps !== undefined) body.completedSteps = data.completedSteps;
    try {
      await api.request("/api/v1/checkpoints/create", { method: "POST", body });
      render();
    } catch (e) {
      alert("Create failed: " + String(e.message || e));
    }
  }

  async function handleCheckpointDelete(id) {
    try {
      await api.request("/api/v1/checkpoints/delete", { method: "POST", body: { id } });
      render();
    } catch (e) {
      alert("Delete failed: " + String(e.message || e));
    }
  }

  async function handleProjectIndex() {
    const data = collectFormData("project-index");
    if (!data.projectPath) { alert("Project path is required."); return; }
    const body = { projectPath: data.projectPath };
    if (data.projectId) body.projectId = data.projectId;
    if (data.forceReindex) body.forceReindex = true;
    if (data.warmCache) body.warmCache = true;
    try {
      const res = await api.request("/api/v1/project/index", { method: "POST", body });
      if (res && res.data && res.data.jobId) alert("Indexing job started: " + res.data.jobId);
      render();
    } catch (e) {
      alert("Index failed: " + String(e.message || e));
    }
  }

  async function handleProjectReset(project) {
    try {
      await api.request("/api/v1/project/reset", {
        method: "POST",
        body: { projectId: project, clearVectors: true, clearSymbols: true, clearMemories: true },
      });
      render();
    } catch (e) {
      alert("Reset failed: " + String(e.message || e));
    }
  }

  // global controls
  themeToggle?.addEventListener("click", () => toggleTheme(doc));
  projectSelect?.addEventListener("change", () => {
    state.project = projectSelect.value;
    render();
  });
  doc.querySelectorAll(".nav a").forEach((a) => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      state.view = viewFromHash(a.getAttribute("href"));
      if (globalThis.location) globalThis.location.hash = hashFor(state.view);
      render();
    });
  });
  if (globalThis.location) {
    state.view = viewFromHash(globalThis.location.hash);
    globalThis.addEventListener?.("hashchange", () => {
      state.view = viewFromHash(globalThis.location.hash);
      render();
    });
  }

  refreshProjectsForSelect().finally(render);

  // SSE: subscribe to /api/v1/events for real-time updates (Wave 7 T10)
  if (typeof EventSource !== "undefined") {
    try {
      const sseBase = opts.base || "";
      const es = new EventSource(sseBase + "/api/v1/events");
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          // Refresh current view on index_status or observation events
          if (data && (data.type === "index_status" || data.type === "observation" || data.event === "index_status" || data.event === "observation")) {
            render();
          }
        } catch {
          // ignore parse errors
        }
      };
      es.onerror = () => {
        // SSE reconnection is handled by the browser automatically;
        // no action needed on error
      };
    } catch {
      // EventSource unavailable or connection failed — non-fatal
    }
  }
}

// Export pure helpers + bootstrap on globalThis for both browser and Node import.
const MASSA_AI_UI = {
  markdownToHtml,
  escapeHtml,
  renderProjects,
  renderMemoryBrowser,
  renderSearch,
  renderHandoffs,
  renderProposals,
  renderCheckpoints,
  renderDashboard,
  renderConfig,
  buildConfigSectionBody,
  renderProfiles,
  renderModelRegistry,
  initTheme,
  toggleTheme,
  isWriteModeEnabled,
  createApiClient,
  readInjectedApiKey,
  startApp,
  showBanner,
  handleConfigSave,
  handleConfigReveal,
  renderProfilesView,
  handleProfilesTabSwitch,
  handleProfileSwitch,
  MEMORY_TYPES,
  MEMORY_LEVELS,
  CHECKPOINTS_LIST_BODY,
};
if (typeof globalThis !== "undefined") {
  globalThis.MASSA_AI_UI = MASSA_AI_UI;
}

// Auto-start in a browser environment.
if (typeof document !== "undefined") {
  // defer until DOMContentLoaded if needed
  const ready = document.readyState;
  if (ready === "loading") {
    document.addEventListener("DOMContentLoaded", () => startApp());
  } else {
    startApp();
  }
}
