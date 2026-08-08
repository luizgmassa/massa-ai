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
  if (projects.length === 0) {
    return '<p class="empty">No indexed projects.</p>';
  }
  const rows = projects
    .map((p) => {
      const id = escapeHtml(p.projectId || p.id || "");
      const count = p.documentCount ?? p.docCount ?? "";
      const meta =
        count !== "" ? ' <span class="muted">(' + escapeHtml(String(count)) + " docs)</span>" : "";
      return "<li>" + escapeHtml(id) + meta + "</li>";
    })
    .join("");
  return (
    '<section class="view"><h2>Projects</h2><ul class="project-list">' +
    rows +
    "</ul></section>"
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

  return (
    '<section class="view"><h2>Memory</h2>' +
    filterBar +
    body +
    pager +
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
  if (pending.length === 0) {
    return '<section class="view"><h2>Handoffs</h2><p class="empty">No pending handoffs.</p></section>';
  }
  const rows = pending
    .map((h) => {
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
        "</div>"
      );
    })
    .join("");
  return '<section class="view"><h2>Handoffs</h2>' + rows + "</section>";
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
  if (rows.length === 0) {
    return '<section class="view"><h2>Checkpoints</h2><p class="empty">No checkpoints.</p></section>';
  }
  const body =
    '<table class="grid"><thead><tr><th>task</th><th>type</th><th>status</th><th>description</th></tr></thead><tbody>' +
    rows
      .map((c) => {
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
          "</tr>"
        );
      })
      .join("") +
    "</tbody></table>";
  return '<section class="view"><h2>Checkpoints</h2>' + body + "</section>";
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
  };

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
    return ["projects", "memory", "search", "handoffs", "proposals", "checkpoints", "dashboard", "config", "profiles"].includes(name)
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
        const data = await api.request("/api/v1/profiles");
        root.innerHTML = renderProfiles((data && data.data) || { hosts: [] }, { writeMode: isWriteModeEnabled() });
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
  initTheme,
  toggleTheme,
  isWriteModeEnabled,
  createApiClient,
  readInjectedApiKey,
  startApp,
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
