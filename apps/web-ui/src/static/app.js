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

export function renderProjects(data, opts) {
  const projects = (data && data.projects) || [];
  const writeMode = isWriteModeEnabled();
  const indexJobId = opts && opts.indexJobId;
  const indexJobStatus = opts && opts.indexJobStatus;
  const indexJobPhase = opts && opts.indexJobPhase;
  const indexJobFileCount = opts && opts.indexJobFileCount;

  const indexProgress = indexJobId
    ? '<div class="index-progress"><span>Index job: ' + escapeHtml(indexJobId) + '</span>' +
      '<span class="badge">' + escapeHtml(indexJobStatus || "pending") + '</span>' +
      (indexJobPhase ? '<span>phase: ' + escapeHtml(indexJobPhase) + '</span>' : "") +
      (indexJobFileCount != null ? '<span>' + escapeHtml(String(indexJobFileCount)) + ' files</span>' : "") +
      '</div>'
    : "";

  const indexForm = writeMode
    ? '<div class="create-form form-grid">' +
      "<h3>Index Project</h3>" +
      '<div class="form-field"><label>Project Path</label><input type="text" data-create="projectPath" data-form="project-index" /></div>' +
      '<div class="form-field"><label>Project ID (optional)</label><input type="text" data-create="projectId" data-form="project-index" /></div>' +
      '<div class="form-field"><label><input type="checkbox" data-create="forceReindex" data-form="project-index" /> Force Reindex</label></div>' +
      '<div class="form-field"><label><input type="checkbox" data-create="warmCache" data-form="project-index" /> Warm Cache</label></div>' +
      '<button type="button" class="btn btn-primary" data-action="project-index">Index</button>' +
      "</div>"
    : "";

  if (projects.length === 0 && !writeMode) {
    return '<section class="view"><h2>Projects</h2>' + indexProgress + '<p class="empty">No indexed projects.</p></section>';
  }

  const actionCol = writeMode ? "<th>Actions</th>" : "";
  const body =
    '<table class="grid"><thead><tr><th>Project</th><th>Files</th>' + actionCol + '</tr></thead><tbody>' +
    projects
      .map((p) => {
        const id = escapeHtml(p.projectId || p.id || "");
        const count = p.documentCount ?? p.docCount ?? "";
        const actions = writeMode
          ? '<td class="actions-cell">' +
            '<button type="button" class="btn-delete" data-action="project-reset" data-project="' + id + '">Delete</button>' +
            "</td>"
          : "";
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(id) +
          "</td>" +
          "<td>" +
          (count !== "" ? escapeHtml(String(count)) : "") +
          "</td>" +
          actions +
          "</tr>"
        );
      })
      .join("") +
    "</tbody></table>";

  return (
    '<section class="view"><h2>Projects</h2>' +
    indexProgress +
    body +
    indexForm +
    '<details class="help-card"><summary>About this tab</summary>' +
    '<div class="help-card-body">' +
    '<h4>What Indexing Does</h4>' +
    '<p>Indexing reads a project\'s source files and stores them as searchable vectors, keyword entries, and code symbols, so massa-ai\'s memory and search tools can find relevant code and context. Re-index after large changes to keep that view current.</p>' +
    '<h4>Index Project</h4>' +
    '<dl>' +
    '<dt>Project Path</dt><dd>Absolute path to the project directory to index. Must be a git repository or a directory with source files.</dd>' +
    '<dt>Project ID (optional)</dt><dd>Unique identifier for the project. Defaults to the directory basename. Used to scope all indexed data (memories, search, symbols).</dd>' +
    '<dt>Force Reindex</dt><dd>When checked, re-indexes all files even if they have not changed since the last index. Use after changing embedding models or when the index is corrupted.</dd>' +
    '<dt>Warm Cache</dt><dd>When checked, pre-warms the search cache after indexing. Speeds up the first search query but adds time to the indexing process.</dd>' +
    '</dl>' +
    '<h4>What Delete Removes</h4>' +
    '<p>Delete removes a project\'s indexed vectors, keyword entries, symbols, and memories, irreversibly. The project\'s files on disk are untouched — only massa-ai\'s record of it disappears from this list.</p>' +
    '<h4>Embedding Dimension Note</h4>' +
    '<p>If a project is missing from the list, the current embedding model\'s dimension may not match the dimension used when the project was indexed. Check the Embedding section in Config for the correct dimensions value, or reindex the project.</p>' +
    '</div>' +
    '</details>' +
    "</section>"
  );
}

/** Renders the bulk-delete control for the Memory tab (design "1. Memory bulk
 *  delete (MBD)", spec P1-Bulk ACs 1-4). Gated on write mode + a selected
 *  project (MBD-01); the inline confirmation form appears only when
 *  `state.memoryBulkForm` is open (MBD-02) — shape `null | { error?: string }`,
 *  mirroring `state.registryForm`'s open/closed convention. The confirm value
 *  is read from `[data-bulk="confirm-id"]` at submit time (T2), never from
 *  `btn.dataset` — the fake-DOM harness's synthetic clicks carry an empty
 *  dataset. */
function renderMemoryBulkDelete(state) {
  const writeMode = isWriteModeEnabled();
  if (!writeMode) return "";
  const project = state.project;
  if (!project) {
    return '<p class="muted">Select a project to enable bulk delete.</p>';
  }
  const trigger =
    '<button type="button" class="btn btn-danger" data-action="memory-delete-project">Delete all memories for ' +
    escapeHtml(project) +
    "</button>";
  const formState = state.memoryBulkForm;
  let form = "";
  if (formState) {
    const errorLine = formState.error
      ? '<p class="form-error">' + escapeHtml(formState.error) + "</p>"
      : "";
    form =
      '<div class="bulk-delete-inline-form form-field">' +
      errorLine +
      "<label>Retype &quot;" +
      escapeHtml(project) +
      '&quot; to confirm<input type="text" data-bulk="confirm-id" /></label>' +
      '<div class="button-row">' +
      '<button type="button" class="btn btn-danger" data-action="memory-delete-project-confirm">Confirm Delete</button>' +
      '<button type="button" class="btn btn-secondary" data-action="memory-delete-project-cancel">Cancel</button>' +
      "</div></div>";
  }
  return '<div class="bulk-delete">' + trigger + form + "</div>";
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

  const bulkDelete = renderMemoryBulkDelete(state);

  return (
    '<section class="view"><h2>Memory</h2>' +
    filterBar +
    bulkDelete +
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
    ? '<div class="create-form form-grid">' +
      "<h3>Create Checkpoint</h3>" +
      '<div class="form-field"><label>Task ID</label><input type="text" data-create="taskId" data-form="checkpoint-create" /></div>' +
      '<div class="form-field"><label>Description</label><input type="text" data-create="description" data-form="checkpoint-create" /></div>' +
      '<div class="form-field"><label>Status</label><select data-create="status" data-form="checkpoint-create"><option>pending</option><option>in_progress</option><option>completed</option><option>failed</option><option>paused</option></select></div>' +
      '<div class="form-field"><label>Progress Percent</label><input type="number" min="0" max="100" data-create="progressPercent" data-form="checkpoint-create" value="0" /></div>' +
      '<div class="form-field"><label>Current Step</label><input type="text" data-create="currentStep" data-form="checkpoint-create" /></div>' +
      '<div class="form-field"><label>Total Steps</label><input type="number" data-create="totalSteps" data-form="checkpoint-create" /></div>' +
      '<div class="form-field"><label>Completed Steps</label><input type="number" data-create="completedSteps" data-form="checkpoint-create" /></div>' +
      '<div class="form-field"><label>Checkpoint Type</label><select data-create="checkpointType" data-form="checkpoint-create"><option>manual</option><option>milestone</option></select></div>' +
      '<button type="button" class="btn btn-primary" data-action="checkpoint-create">Create</button>' +
      "</div>"
    : "";

  if (rows.length === 0 && !writeMode) {
    return '<section class="view"><h2>Checkpoints</h2><p class="empty">No checkpoints.</p></section>';
  }
  const actionCol = writeMode ? "<th>Actions</th>" : "";
  const body =
    '<table class="grid"><thead><tr><th>Task</th><th>Type</th><th>Status</th><th>Description</th>' + actionCol + '</tr></thead><tbody>' +
    rows
      .map((c) => {
        const id = escapeHtml(c.id || c.checkpointId || "");
        const actions = writeMode
          ? '<td class="actions-cell">' +
            '<button type="button" class="btn-edit" data-action="checkpoint-edit" data-id="' + id + '" data-task="' + escapeHtml(c.taskId || "") + '" data-status="' + escapeHtml(c.status || "") + '" data-type="' + escapeHtml(c.type || c.checkpointType || "") + '" data-description="' + escapeHtml(c.description || "") + '" data-progress="' + escapeHtml(String(c.progressPercent ?? "")) + '" data-step="' + escapeHtml(c.currentStep || "") + '" data-total="' + escapeHtml(String(c.totalSteps ?? "")) + '" data-completed="' + escapeHtml(String(c.completedSteps ?? "")) + '" data-checkpoint-type="' + escapeHtml(c.checkpointType || c.type || "") + '">edit</button> ' +
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
  const helpCard =
    '<details class="help-card"><summary>About this tab</summary>' +
    '<div class="help-card-body">' +
    '<h4>What A Checkpoint Is</h4>' +
    '<p>A checkpoint is a saved snapshot of an in-progress task — its status, current step, and progress percentage — so work can resume exactly where it left off, even across a session restart.</p>' +
    '<h4>Create And Edit</h4>' +
    '<p>Use the form below to create a checkpoint for a task you are tracking. Each row\'s <strong>edit</strong> button reopens that checkpoint\'s fields for updating status, progress, and step; <strong>delete</strong> removes it.</p>' +
    '</div>' +
    '</details>';
  return '<section class="view"><h2>Checkpoints</h2>' + body + createForm + helpCard + "</section>";
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
    fields: [{ name: "url", type: "text", label: "Database URL", sensitive: true, guide: "PostgreSQL connection string (e.g., `postgresql://user:pass@host:5432/db`). Changing this requires a server restart." }],
  },
  {
    key: "embedding",
    label: "Embedding",
    fields: [
      { name: "provider", type: "enum", label: "Provider", enum: ["ollama", "mistral", "openai", "google", "cohere"], guide: "Which embedding provider to use. Ollama runs locally; others are cloud APIs." },
      { name: "model", type: "text", label: "Model", guide: "The embedding model name (e.g., `qwen3-embedding:4b` for Ollama)." },
      { name: "baseURL", type: "text", label: "Base URL", guide: "Base URL for the embedding API. For Ollama, typically `http://localhost:11434`." },
      { name: "apiKey", type: "text", label: "API Key", sensitive: true, guide: "API key for cloud providers. Not needed for Ollama. Changing this requires a restart." },
      { name: "dimensions", type: "number", label: "Dimensions", guide: "Embedding vector dimension. Must match the model's output dimension (e.g., 2560 for `qwen3-embedding:4b`)." },
    ],
  },
  {
    key: "compression",
    label: "Compression",
    fields: [
      { name: "defaultStrategy", type: "text", label: "Default Strategy", guide: "Compression strategy: code_structure, conversation_summary, semantic_dedup, or hierarchical." },
      { name: "minTokensForCompression", type: "number", label: "Min Tokens", guide: "Minimum token count to trigger compression. Below this, content is kept verbatim." },
      { name: "targetCompressionRatio", type: "number", label: "Target Ratio (0-1)", guide: "Target compression ratio (0.7 = reduce to 70% of original)." },
      { name: "prompt", type: "text", label: "Prompt (optional)", guide: "Custom LLM prompt for compression. When empty, uses the built-in default." },
    ],
  },
  {
    key: "impact",
    label: "Impact Analysis",
    fields: [{ name: "bfsCteEnabled", type: "boolean", label: "BFS CTE Enabled", guide: "When checked, impact analysis uses a PostgreSQL recursive CTE for BFS traversal. Faster on large graphs but requires PostgreSQL 17+." }],
  },
  {
    key: "capturePolicy",
    label: "Capture Policy",
    fields: [
      { name: "maxMatchWork", type: "number", label: "Max Match Work", guide: "Maximum glob match operations before bailing. Default: 100000." },
      { name: "maxIgnorePatterns", type: "number", label: "Max Ignore Patterns", guide: "Maximum ignore patterns allowed. Default: 1024." },
      { name: "rules", type: "string[]", label: "Rules (JSON)", guide: "Capture rules as JSON array of {pattern, disposition: Keep|Drop|MetadataOnly}. When absent, the built-in `DEFAULT_POLICY` applies." },
    ],
  },
  {
    key: "cache",
    label: "Cache",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables the two-level cache (L1 in-memory, L2 disk)." },
      { name: "l1MaxSizeMB", type: "number", label: "L1 Max Size (MB)", guide: "Maximum L1 (in-memory) cache size in megabytes." },
      { name: "l2MaxSizeMB", type: "number", label: "L2 Max Size (MB)", guide: "Maximum L2 (disk) cache size in megabytes." },
      { name: "defaultTTLSeconds", type: "number", label: "Default TTL (s)", guide: "Default time-to-live for cache entries in seconds." },
    ],
  },
  {
    key: "dataDir",
    label: "Data Directory",
    fields: [{ name: "dataDir", type: "text", label: "Data Directory", guide: "Base directory for massa-ai data files (checkpoints, exports, etc.)." }],
  },
  {
    key: "logging",
    label: "Logging",
    fields: [
      { name: "level", type: "enum", label: "Level", enum: ["debug", "info", "warn", "error"], guide: "Log verbosity level. debug is most verbose; error is least." },
      { name: "enableMetrics", type: "boolean", label: "Enable Metrics", guide: "When checked, emits structured metrics events for monitoring." },
      { name: "file", type: "text", label: "Log File (optional)", guide: "Path to a log file. When empty, logs go to stdout only." },
    ],
  },
  {
    key: "search",
    label: "Search",
    fields: [
      { name: "autoReindexMaxFiles", type: "number", label: "Auto Reindex Max Files", guide: "Maximum file count to auto-reindex without prompting. Above this, manual reindex is required." },
      { name: "queryUnderstanding.enabled", type: "boolean", label: "Query Understanding Enabled", guide: "When checked, rewrites user queries using LLM for better retrieval." },
      { name: "queryUnderstanding.hydeEnabled", type: "boolean", label: "HyDE Enabled", guide: "When checked, generates hypothetical document embeddings (HyDE) to improve query matching." },
      { name: "queryUnderstanding.cacheTtlMs", type: "number", label: "QU Cache TTL (ms)", guide: "Time-to-live for query understanding cache entries in milliseconds." },
      { name: "queryUnderstanding.cacheMaxSize", type: "number", label: "QU Cache Max Size", guide: "Maximum number of cached query understanding results." },
      { name: "rerank.enabled", type: "boolean", label: "Rerank Enabled", guide: "When checked, applies a reranker to search results for improved relevance." },
      { name: "rerank.rerankWindow", type: "number", label: "Rerank Window", guide: "Number of top results to consider for reranking." },
    ],
  },
  {
    key: "llm",
    label: "LLM",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables LLM-powered features (consolidation, query understanding, compression)." },
      { name: "baseUrl", type: "text", label: "Base URL", guide: "Base URL for the LLM API (e.g., `http://localhost:11434/v1` for Ollama OpenAI-compatible endpoint)." },
      { name: "apiKey", type: "text", label: "API Key", sensitive: true, guide: "API key for the LLM provider. Not needed for local Ollama. Changing this requires a restart." },
      { name: "model", type: "text", label: "Model", guide: "Primary LLM model name (e.g., `qwen2.5:7b-instruct`)." },
      { name: "codeModel", type: "text", label: "Code Model", guide: "Model used for code-related tasks. When empty, falls back to the primary model." },
      { name: "temperature", type: "number", label: "Temperature", guide: "Sampling temperature (0 = deterministic, 1 = creative). Typically 0.2 for tasks." },
      { name: "maxOutputTokens", type: "number", label: "Max Output Tokens", guide: "Maximum tokens the LLM can generate in a single response." },
      { name: "timeoutMs", type: "number", label: "Timeout (ms)", guide: "Request timeout in milliseconds. Increase for slow models." },
      { name: "disableThink", type: "boolean", label: "Disable Think", guide: "When checked, disables thinking/reasoning mode in models that support it (faster, cheaper)." },
    ],
  },
  {
    key: "memory",
    label: "Memory",
    fields: [
      { name: "decay.lambda", type: "number", label: "Decay Lambda", guide: "Exponential decay rate for memory importance over time." },
      { name: "decay.sigma", type: "number", label: "Decay Sigma", guide: "Decay bandwidth — controls how quickly memories lose relevance." },
      { name: "decay.mu", type: "number", label: "Decay Mu", guide: "Decay midpoint — the time at which importance is halved." },
      { name: "decay.coldThreshold", type: "number", label: "Decay Cold Threshold", guide: "Importance score below which a memory is considered 'cold' and eligible for consolidation." },
      { name: "bootstrap.enabled", type: "boolean", label: "Bootstrap Enabled", guide: "When checked, seeds initial memories from the repo on first use." },
      { name: "bootstrap.maxSeedMemories", type: "number", label: "Bootstrap Max Seeds", guide: "Maximum number of memories to seed during bootstrap." },
      { name: "bootstrap.centralityLimit", type: "number", label: "Bootstrap Centrality Limit", guide: "Number of top central files to include in bootstrap." },
      { name: "bootstrap.gitLogLimit", type: "number", label: "Bootstrap Git Log Limit", guide: "Number of recent git commits to analyze during bootstrap." },
      { name: "bootstrap.refreshEnabled", type: "boolean", label: "Bootstrap Refresh", guide: "When checked, periodically re-runs bootstrap to capture new repo changes." },
      { name: "autoImprove.enabled", type: "boolean", label: "Auto Improve Enabled", guide: "When checked, the auto-improvement loop detects patterns and proposes memory optimizations." },
      { name: "autoImprove.reviewGate", type: "boolean", label: "Auto Improve Review Gate", guide: "When checked, auto-improvement proposals require human review before applying. When unchecked, eligible proposals auto-apply." },
      { name: "autoImprove.minObservations", type: "number", label: "Auto Improve Min Observations", guide: "Minimum observations required before a pattern is proposed." },
      { name: "autoImprove.minIntervalMs", type: "number", label: "Auto Improve Min Interval (ms)", guide: "Minimum time between auto-improvement runs in milliseconds." },
      { name: "autoImprove.maxWindow", type: "number", label: "Auto Improve Max Window", guide: "Maximum number of recent observations to consider per run." },
      { name: "autoImprove.minQueryHits", type: "number", label: "Auto Improve Min Query Hits", guide: "Minimum repeated query hits to trigger a pattern proposal." },
      { name: "autoImprove.minFileHits", type: "number", label: "Auto Improve Min File Hits", guide: "Minimum repeated file access hits to trigger a proposal." },
      { name: "autoImprove.minFixHits", type: "number", label: "Auto Improve Min Fix Hits", guide: "Minimum repeated fix patterns to trigger a proposal." },
      { name: "autoImportance.enabled", type: "boolean", label: "Auto Importance Enabled", guide: "When checked, automatically scores memory importance based on access patterns." },
    ],
  },
  {
    key: "hooks",
    label: "Hooks",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables passive lifecycle hook capture (session start/end, tool use events)." },
      { name: "maxPayloadBytes", type: "number", label: "Max Payload Bytes", guide: "Maximum payload size for hook events. Larger payloads are truncated." },
      { name: "queue.maxPending", type: "number", label: "Queue Max Pending", guide: "Maximum pending hook events in the processing queue." },
      { name: "bridge.enabled", type: "boolean", label: "Bridge Enabled", guide: "When checked, bridges captured observations into durable memories via consolidation." },
      { name: "bridge.minObservations", type: "number", label: "Bridge Min Observations", guide: "Minimum observations required before a bridge consolidation runs." },
      { name: "bridge.minIntervalMs", type: "number", label: "Bridge Min Interval (ms)", guide: "Minimum time between bridge consolidation runs in milliseconds." },
      { name: "bridge.maxWindow", type: "number", label: "Bridge Max Window", guide: "Maximum number of observations to consider per bridge run." },
    ],
  },
  {
    key: "synapse",
    label: "Synapse",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables the Synapse cognitive modulation layer (task alignment, working memory, inhibition)." },
      { name: "inhibition.diversityPenalty.enabled", type: "boolean", label: "Diversity Penalty", guide: "When checked, penalizes search results that are too similar to already-seen items." },
      { name: "inhibition.diversityPenalty.threshold", type: "number", label: "DP Threshold", guide: "Similarity threshold above which the diversity penalty applies." },
      { name: "inhibition.diversityPenalty.lambda", type: "number", label: "DP Lambda", guide: "Strength of the diversity penalty." },
      { name: "inhibition.temporalInhibition.enabled", type: "boolean", label: "Temporal Inhibition", guide: "When checked, suppresses recently-seen items from appearing again too soon." },
      { name: "inhibition.temporalInhibition.penaltyAgeMs", type: "number", label: "TI Penalty Age (ms)", guide: "Time window in milliseconds during which a recently-seen item is penalized." },
      { name: "inhibition.temporalInhibition.penalty", type: "number", label: "TI Penalty", guide: "Penalty score applied to recently-seen items." },
      { name: "inhibition.confidenceGate.enabled", type: "boolean", label: "Confidence Gate", guide: "When checked, filters search results by confidence thresholds." },
      { name: "inhibition.confidenceGate.thresholds.specific", type: "number", label: "CG Specific", guide: "Confidence threshold for specific (high-relevance) results." },
      { name: "inhibition.confidenceGate.thresholds.focused", type: "number", label: "CG Focused", guide: "Confidence threshold for focused (medium-relevance) results." },
      { name: "inhibition.confidenceGate.thresholds.broad", type: "number", label: "CG Broad", guide: "Confidence threshold for broad (low-relevance) results." },
      { name: "scoring.attention.enabled", type: "boolean", label: "Attention Scoring", guide: "When checked, applies attention-based scoring (recency, semantic, task alignment) to search results." },
      { name: "scoring.attention.rerankWindow", type: "number", label: "Attention Rerank Window", guide: "Number of top results to rerank using attention scoring." },
      { name: "scoring.attention.recencyHalfLifeMs", type: "number", label: "Recency Half Life (ms)", guide: "Half-life for recency decay in attention scoring." },
      { name: "scoring.attention.semanticScale", type: "number", label: "Semantic Scale", guide: "Scaling factor for the semantic similarity component in attention scoring." },
      { name: "metacognition.enabled", type: "boolean", label: "Metacognition", guide: "When checked, enables metacognitive monitoring (confidence assessment of search results)." },
      { name: "metacognition.lowConfidenceThreshold", type: "number", label: "Low Confidence Threshold", guide: "Score below which a result is flagged as low-confidence." },
      { name: "metacognition.definitiveTopScore", type: "number", label: "Definitive Top Score", guide: "Score above which a result is considered definitively relevant." },
      { name: "metacognition.definitiveGap", type: "number", label: "Definitive Gap", guide: "Minimum gap between top and second result to declare a definitive match." },
      { name: "buffer.enabled", type: "boolean", label: "Buffer Enabled", guide: "When checked, enables the working-memory buffer for cross-search continuity." },
      { name: "buffer.maxSize", type: "number", label: "Buffer Max Size", guide: "Maximum number of entries in the working-memory buffer." },
      { name: "buffer.ttlMs", type: "number", label: "Buffer TTL (ms)", guide: "Time-to-live for working-memory buffer entries in milliseconds." },
      { name: "buffer.hitBoost", type: "number", label: "Buffer Hit Boost", guide: "Score boost applied to results that hit the working-memory buffer." },
      { name: "buffer.matchThreshold", type: "number", label: "Buffer Match Threshold", guide: "Similarity threshold for a buffer hit." },
    ],
  },
  {
    key: "handoffs",
    label: "Handoffs",
    fields: [{ name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables cross-session handoffs (structured summaries left for a later agent to discover)." }],
  },
  {
    key: "security",
    label: "Security",
    fields: [
      { name: "apiKey", type: "text", label: "API Key", sensitive: true, guide: "API key required on every request except `/health`, `/swagger`, and `/ui`. Auto-provisioned on first start. Changing this requires a restart." },
      { name: "corsOrigins", type: "string[]", label: "CORS Origins", guide: "Comma-separated list of allowed CORS origins. Empty means no CORS." },
      { name: "allowedExtensions", type: "string[]", label: "Allowed Extensions", guide: "Comma-separated list of file extensions allowed for indexing." },
    ],
  },
  {
    // SCH-08. Job kinds mirror packages/shared/src/config/massa-ai-config.ts's
    // SCHEDULER_JOB_KINDS; app.js is plain browser JS with no build-time
    // import of @massa-ai/shared, so the five kinds are listed literally here.
    key: "scheduler",
    label: "Scheduler",
    fields: [
      { name: "enabled", type: "boolean", label: "Enabled", guide: "When checked, enables the background job scheduler (memory-consolidation, decay-sweep, auto-improve, observation-bridge, checkpoint-purge)." },
      { name: "tickMs", type: "number", label: "Tick Interval (ms)", guide: "How often the scheduler checks whether a job is due to run, in milliseconds. Minimum `1000`." },
      { name: "maxConcurrent", type: "number", label: "Max Concurrent Jobs", guide: "Maximum number of scheduled jobs allowed to run at the same time. Minimum `1`." },
      { name: "jobs.memory-consolidation.enabled", type: "boolean", label: "Memory Consolidation Enabled", guide: "When checked, the memory-consolidation job runs on its own schedule." },
      { name: "jobs.memory-consolidation.intervalMs", type: "number", label: "Memory Consolidation Interval (ms)", guide: "Interval between memory-consolidation runs, in milliseconds. Minimum `60000`." },
      { name: "jobs.decay-sweep.enabled", type: "boolean", label: "Decay Sweep Enabled", guide: "When checked, the decay-sweep job runs on its own schedule." },
      { name: "jobs.decay-sweep.intervalMs", type: "number", label: "Decay Sweep Interval (ms)", guide: "Interval between decay-sweep runs, in milliseconds. Minimum `60000`." },
      { name: "jobs.auto-improve.enabled", type: "boolean", label: "Auto Improve Enabled", guide: "When checked, the auto-improve job runs on its own schedule." },
      { name: "jobs.auto-improve.intervalMs", type: "number", label: "Auto Improve Interval (ms)", guide: "Interval between auto-improve runs, in milliseconds. Minimum `60000`." },
      { name: "jobs.observation-bridge.enabled", type: "boolean", label: "Observation Bridge Enabled", guide: "When checked, the observation-bridge job runs on its own schedule." },
      { name: "jobs.observation-bridge.intervalMs", type: "number", label: "Observation Bridge Interval (ms)", guide: "Interval between observation-bridge runs, in milliseconds. Minimum `60000`." },
      { name: "jobs.checkpoint-purge.enabled", type: "boolean", label: "Checkpoint Purge Enabled", guide: "When checked, the checkpoint-purge job runs on its own schedule." },
      { name: "jobs.checkpoint-purge.intervalMs", type: "number", label: "Checkpoint Purge Interval (ms)", guide: "Interval between checkpoint-purge runs, in milliseconds. Minimum `60000`." },
    ],
  },
];

/**
 * Renders a Field guide `dd` value (T12, APUX-09/APUX-11, design D-6): escapes
 * the whole string first, then turns any `` `backtick` `` span into `<code>`.
 * The guide strings themselves carry the backtick markers around their
 * machine tokens (env-style URLs, model ids, paths, identifiers) — chosen
 * over a token-matching regex because it is small and fully deterministic:
 * every wrapped span is one this function's own caller opted into, not a
 * pattern guess that could over- or under-match prose.
 */
function renderGuideText(s) {
  const escaped = escapeHtml(s);
  return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
}

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
    revealBtn = ' <button type="button" class="reveal-btn" data-action="config-reveal" data-target="' + fieldId + '" data-section="' + sectionKey + '" data-field="' + field.name + '">reveal</button>';
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
    const sectionConfig = section.key === "dataDir" ? config[section.key] : config[section.key];
    const notConfiguredNote = (section.key === "capturePolicy" && sectionConfig === undefined)
      ? '<div class="config-info-note">Not configured &mdash; using built-in defaults (DEFAULT_POLICY from the capture-policy pure module)</div>'
      : "";
    const fieldsHtml = section.fields.map((field) => {
      const value = getConfigFieldValue(config, section.key, field.name);
      return renderConfigField(section.key, field, value);
    }).join("");
    const saveBtn = writeMode
      ? '<button type="button" class="save-btn btn-primary" data-action="config-save" data-section="' + section.key + '">Save</button>'
      : "";
    const guideEntries = section.fields.filter((f) => f.guide).map((f) => {
      return "<dt>" + escapeHtml(f.label) + "</dt><dd>" + renderGuideText(f.guide) + "</dd>";
    }).join("");
    const fieldGuide = guideEntries
      ? '<details class="config-field-guide"><summary>Field guide</summary>' +
        '<div class="config-field-guide-body"><dl>' + guideEntries + "</dl></div></details>"
      : "";
    return (
      '<div class="config-section" data-section="' + section.key + '">' +
      '<h3 class="config-section-header">' + escapeHtml(section.label) + badge + "</h3>" +
      notConfiguredNote +
      '<div class="config-fields">' + fieldsHtml + "</div>" +
      saveBtn +
      fieldGuide +
      "</div>"
    );
  }).join("");

  const helpCard =
    '<details class="help-card"><summary>About this tab</summary>' +
    '<div class="help-card-body">' +
    '<h4>How Config Saves</h4>' +
    '<p>Each section below saves independently — editing a field and pressing that section\'s Save button writes only that section, leaving every other section untouched.</p>' +
    '<h4>Sections That Require A Restart</h4>' +
    '<p>A section badged as requiring one takes effect only after the massa-ai server process restarts; saving it does not change the behavior of the already-running process.</p>' +
    '<p>Each section\'s own "Field guide" toggle explains its individual fields, defaults, and examples.</p>' +
    '</div>' +
    '</details>';

  // Restart Server action (APR-04). One action surface: the save-flow's
  // restart proposal banner points here instead of embedding a second button.
  // Sibling of the heading, not inside it — a button has no place in an h2's
  // content model.
  const restartBtn = writeMode
    ? '<button type="button" class="restart-server-btn btn-danger" data-action="server-restart">Restart Server</button>'
    : "";

  return '<section class="view"><div class="view-header"><h2>Config</h2>' + restartBtn + "</div>" + helpCard + cards + "</section>";
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

    if (!installed) {
      return (
        '<div class="profile-host" data-host="' + escapeHtml(hostName) + '">' +
        "<h3>" + escapeHtml(hostName) + "</h3> <p class=\"muted\">Not installed.</p>" +
        "</div>"
      );
    }

    if (available.length === 0) {
      return (
        '<div class="profile-host" data-host="' + escapeHtml(hostName) + '">' +
        "<h3>" + escapeHtml(hostName) + "</h3>" +
        '<p class="muted">Installed via marketplace (no per-profile variant directories). To switch profiles, set <code>MASSA_AI_MODEL_PROFILE</code> and use Save &amp; Apply on the Model Catalog tab.</p>' +
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
  opencode: ["low", "medium", "high", "max"],
};

const REGISTRY_HOSTS = ["claude", "codex", "cursor", "opencode"];

/** Display labels for the Tool column (design D-4.1). Not a simple capitalize —
 *  "opencode" -> "OpenCode" needs its own casing. `data-*` attributes keep the
 *  raw lowercase host id; only this label is user-facing. */
const REGISTRY_HOST_LABELS = { claude: "Claude", codex: "Codex", cursor: "Cursor", opencode: "OpenCode" };

/** Capitalizes the first letter of a raw tier id ("light" -> "Light") for the
 *  Tier column and per-agent tier dropdown labels (design D-4.1, D-4.3). */
function capitalizeLabel(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Hints (placeholder + title) for the Provider/Model split fields (design D-4.2, APUX-05).
const REGISTRY_PROVIDER_HINT = "e.g. opencode-go, zai-coding-plan, local — leave blank for Claude/Codex";
const REGISTRY_MODEL_HINT = "e.g. sonnet · gpt-5.6-terra · glm-5.2";

/**
 * Splits a stored registry model string into its Provider + Model display parts
 * (design D-4.2, APUX-14). Splits on the FIRST "/" only, so a multi-segment
 * OpenCode id like "a/b/c" keeps its remainder intact as the Model part.
 * `null`/`""`/`undefined` (the "inherit" sentinel) render as two empty fields.
 *
 *   splitModelId("a/b/c") -> { provider: "a", model: "b/c" }
 *   splitModelId("m")     -> { provider: "", model: "m" }
 *   splitModelId(null)    -> { provider: "", model: "" }
 */
export function splitModelId(model) {
  if (!model) return { provider: "", model: "" };
  const idx = model.indexOf("/");
  if (idx === -1) return { provider: "", model };
  return { provider: model.slice(0, idx), model: model.slice(idx + 1) };
}

/**
 * Joins Provider + Model back into the single string the overlay stores
 * (design D-4.2, APUX-14, P1-B AC5). Both blank -> `null` (never `""` or the
 * string `"null"`), so a cleared cell round-trips to the "inherit" sentinel.
 *
 *   joinModelId("a", "b/c") -> "a/b/c"
 *   joinModelId("", "m")    -> "m"
 *   joinModelId("", "")     -> null
 */
export function joinModelId(provider, model) {
  const p = (provider || "").trim();
  const m = (model || "").trim();
  if (!p && !m) return null;
  if (!p) return m;
  return p + "/" + m;
}

/** Frontend copy of the live workflow inventory (basenames from
 *  skills/massa-ai/workflows/ - all .md files). Kept in sync manually; the
 *  frontend cannot import from scripts/lib. Used by the Workflow Tiers picker. */
const WORKFLOW_STEMS = [
  "adr", "architecture-audit", "architecture-fix", "bugs-audit", "bugs-fix",
  "code-quality-audit", "code-quality-fix", "commit", "debug", "design",
  "discovery", "exploration", "feature", "furps-refinement", "general",
  "implementation-audit", "implementation-fix", "judge-with-debate",
  "long-session", "maestro", "maestro-audit", "maestro-fix",
  "mobile-figma-audit", "mobile-figma-fix", "onboarding", "pr-review",
  "refactor", "requirements-audit", "requirements-fix", "rfc",
  "security-audit", "security-fix", "skill-architect", "spec-driven",
  "tdd", "tests-audit", "tests-fix", "the-fool", "ticket", "to-prd",
];

// ── Registry inline forms (design D-4.4, APUX-12, P2-D AC2-AC6) ────────────
// Replaces the old prompt()/alert() flows for Add Workflow Override, Duplicate
// Profile, Delete Profile and Add Profile. state.registryForm tracks which
// form (if any) is open: null | { kind, error }. The renderer emits the open
// form's markup under its trigger button row; wireViewHandlers reads the
// rendered field values on submit and dispatches to the same-named handler.

/** Renders the inline `.form-error` line when the current form carries a
 *  validation error (duplicate name, unknown workflow, etc.) — replaces
 *  `alert()` for these flows. */
function renderRegistryFormError(formState) {
  return formState && formState.error
    ? '<p class="form-error">' + escapeHtml(formState.error) + "</p>"
    : "";
}

function renderAddWorkflowForm(formState, existingWorkflows, tiers) {
  const available = WORKFLOW_STEMS.filter((s) => !existingWorkflows.includes(s));
  if (available.length === 0) {
    return (
      '<div class="registry-inline-form">' +
      '<p class="muted">Every known workflow already has a tier override. Remove one first to add another.</p>' +
      '<div class="button-row"><button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button></div>' +
      "</div>"
    );
  }
  const workflowOptions = available.map((s) => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + "</option>").join("");
  const tierOptions = tiers.map((t) => '<option value="' + escapeHtml(t) + '">' + escapeHtml(capitalizeLabel(t)) + "</option>").join("");
  return (
    '<div class="registry-inline-form form-field">' +
    renderRegistryFormError(formState) +
    '<label>Workflow<select data-action="registry-form-workflow" title="Pick a workflow that does not yet have a tier override">' + workflowOptions + "</select></label>" +
    '<label>Tier<select data-action="registry-form-tier" title="The tier to pin this workflow to">' + tierOptions + "</select></label>" +
    '<div class="button-row">' +
    '<button type="button" class="btn btn-primary" data-action="registry-form-submit">Add</button>' +
    '<button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button>' +
    "</div></div>"
  );
}

function renderDuplicateProfileForm(formState, profileNames) {
  if (profileNames.length === 0) {
    return (
      '<div class="registry-inline-form">' +
      '<p class="muted">No profiles available to duplicate. Add a profile first.</p>' +
      '<div class="button-row"><button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button></div>' +
      "</div>"
    );
  }
  const profileOptions = profileNames.map((p) => '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + "</option>").join("");
  return (
    '<div class="registry-inline-form form-field">' +
    renderRegistryFormError(formState) +
    '<label>Source Profile<select data-action="registry-form-source" title="The profile to copy">' + profileOptions + "</select></label>" +
    '<label>New Name<input type="text" data-action="registry-form-new-name" placeholder="e.g. work-variant" title="A new, unused profile name" /></label>' +
    '<div class="button-row">' +
    '<button type="button" class="btn btn-primary" data-action="registry-form-submit">Duplicate</button>' +
    '<button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button>' +
    "</div></div>"
  );
}

function renderDeleteProfileForm(formState, profileNames) {
  if (profileNames.length === 0) {
    return (
      '<div class="registry-inline-form">' +
      '<p class="muted">No profiles available to delete.</p>' +
      '<div class="button-row"><button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button></div>' +
      "</div>"
    );
  }
  const profileOptions = profileNames.map((p) => '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + "</option>").join("");
  return (
    '<div class="registry-inline-form form-field">' +
    renderRegistryFormError(formState) +
    '<label>Profile<select data-action="registry-form-profile" title="The profile to delete">' + profileOptions + "</select></label>" +
    '<div class="button-row">' +
    '<button type="button" class="btn btn-danger" data-action="registry-form-submit">Delete</button>' +
    '<button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button>' +
    "</div></div>"
  );
}

function renderAddProfileForm(formState) {
  return (
    '<div class="registry-inline-form form-field">' +
    renderRegistryFormError(formState) +
    '<label>Name<input type="text" data-action="registry-form-name" placeholder="e.g. work-variant" title="A new, unused profile name" /></label>' +
    '<label>Description<input type="text" data-action="registry-form-description" placeholder="optional — defaults to the name" title="Optional profile description" /></label>' +
    '<div class="button-row">' +
    '<button type="button" class="btn btn-primary" data-action="registry-form-submit">Add</button>' +
    '<button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button>' +
    "</div></div>"
  );
}

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
  const unsaved = opts && opts.unsaved ? ' <span class="badge" style="background:rgba(245,158,11,0.15);color:#92400e;">unsaved changes</span>' : "";
  const registryFormState = (opts && opts.registryForm) || null;

  const profiles = registry.profiles || {};
  const profileNames = Object.keys(profiles);
  const tiers = registry.tiers || [];
  const hostDefaults = registry.hostDefaults || {};
  const workflowTiers = registry.workflowTiers || {};
  const overlayProfiles = (source.overlay && source.overlay.profiles) || {};
  const tombstoned = source.tombstoned || [];

  if (profileNames.length === 0 && !overlayError && !payload._error) {
    return '<section class="view"><h2>Model Catalog</h2><p class="empty">No profiles in the catalog.</p></section>';
  }

  const registryError = payload._error
    ? '<div class="error">Catalog load error: ' + escapeHtml(typeof payload._error === "string" ? payload._error : JSON.stringify(payload._error)) + "</div>"
    : "";

  const overlayBanner = overlayError
    ? '<div class="error">Saved changes could not be loaded: ' + escapeHtml(overlayError) + " (showing builtin)</div>"
    : "";

  // APCR-01.10: the only available mitigation for the AC9 known limitation (a stale
  // full-copy overlay entry stays frozen on an old builtin value) is making the override
  // count visible. A compact, honest line — nothing rendered when there is nothing to
  // override, so an operator with no overlay sees no noise.
  const overlayOverrideCount = typeof payload.overlayOverrideCount === "number" ? payload.overlayOverrideCount : 0;
  const overlayOverrideLine = overlayOverrideCount > 0
    ? '<p class="registry-override-count muted">You have ' + overlayOverrideCount +
      " custom override" + (overlayOverrideCount === 1 ? "" : "s") + " of the built-in defaults.</p>"
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
    const overlayMark = isOverlay ? ' <span class="badge overlay-badge">override</span>' : "";
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
      // Provider input above Model input above Effort (design D-4.2, APUX-14):
      // the overlay still stores one joined model string per cell — split only
      // for display, joined back on change by the wireViewHandlers listener.
      const modelIdParts = splitModelId(model);
      const providerModelAttrs = ' data-profile="' + escapeHtml(profileName) + '" data-host="' + escapeHtml(row.host) + '" data-tier="' + escapeHtml(row.tier) + '"';
      const modelInput = writeMode
        ? '<input type="text" class="registry-provider-input" data-action="registry-provider"' + providerModelAttrs + ' value="' + escapeHtml(modelIdParts.provider) + '" placeholder="' + escapeHtml(REGISTRY_PROVIDER_HINT) + '" title="' + escapeHtml(REGISTRY_PROVIDER_HINT) + '" />' +
          '<input type="text" class="registry-model-input" data-action="registry-model"' + providerModelAttrs + ' value="' + escapeHtml(modelIdParts.model) + '" placeholder="' + escapeHtml(REGISTRY_MODEL_HINT) + '" title="' + escapeHtml(REGISTRY_MODEL_HINT) + '" />'
        : '<span>' + escapeHtml(model || "—") + "</span>";
      return '<td class="registry-cell' + overlayClass + '">' + modelInput + effortInput + "</td>";
    }).join("");
    // First tier row of each host carries the Tool cell (rowspan across every
    // tier row for that host); subsequent rows omit it (design D-4.1).
    const isFirstTierRowForHost = row.tier === tiers[0];
    const toolCell = isFirstTierRowForHost
      ? '<th class="tool-cell" rowspan="' + tiers.length + '">' + escapeHtml(REGISTRY_HOST_LABELS[row.host] || capitalizeLabel(row.host)) + "</th>"
      : "";
    const tierCell = '<th class="tier-cell">' + escapeHtml(capitalizeLabel(row.tier)) + "</th>";
    return "<tr>" + toolCell + tierCell + cells + "</tr>";
  }).join("");

  const grid =
    '<div class="grid-scroll"><table class="registry-grid"><thead><tr><th>Tool</th><th>Tier</th>' + headerCells + "</tr></thead><tbody>" + bodyRows + "</tbody></table></div>";

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
    const rmBtn = writeMode
      ? ' <button type="button" class="btn-delete" data-action="registry-workflowTier-remove" data-workflow="' + escapeHtml(wf) + '" style="padding:0.1rem 0.4rem;font-size:0.75rem;">Remove</button>'
      : "";
    return (
      '<div class="config-field"><label>' + escapeHtml(wf) + "</label>" +
      '<select data-action="registry-workflowTier" data-workflow="' + escapeHtml(wf) + '"' + (writeMode ? "" : " disabled") + ">" + tierOpts + "</select>" + rmBtn + "</div>"
    );
  }).join("");

  const addWorkflowTierBtn = writeMode
    ? '<div class="registry-actions"><button type="button" class="btn btn-secondary" data-action="registry-workflowTier-add">Add Workflow Tier</button></div>' +
      (registryFormState && registryFormState.kind === "add-workflow" ? renderAddWorkflowForm(registryFormState, workflowTierNames, tiers) : "")
    : "";

  // Per-Agent Tier Overrides table (design D-4.3, APUX-04, P1-A AC7-AC8). Data
  // is payload.agents (from GET, charter-derived) + the DISPLAY registry's
  // agentTiers (already merged with unsaved in-memory overlay edits by
  // mergeRegistryForDisplay, so an unsaved pick renders before save).
  const agents = payload.agents || [];
  const agentsError = payload.agentsError;
  const agentTiersDisplay = registry.agentTiers || {};
  let agentTierSection;
  if (agentsError) {
    agentTierSection =
      '<div class="registry-agentTiers"><h3>Per-Agent Tier Overrides</h3>' +
      '<p class="muted">Agent list unavailable: ' + escapeHtml(agentsError) + "</p></div>";
  } else if (agents.length === 0) {
    agentTierSection =
      '<div class="registry-agentTiers"><h3>Per-Agent Tier Overrides</h3>' +
      '<p class="muted">No agents found.</p></div>';
  } else {
    const agentHeaderCells = REGISTRY_HOSTS.map((h) => "<th>" + escapeHtml(REGISTRY_HOST_LABELS[h]) + "</th>").join("");
    const agentBodyRows = agents.map((agent) => {
      const perHost = agentTiersDisplay[agent.name] || {};
      const cells = REGISTRY_HOSTS.map((host) => {
        const effective = perHost[host] || "";
        const overriddenClass = effective ? ' class="overridden"' : "";
        const options =
          '<option value="">(default: ' + escapeHtml(agent.charterTier) + ")</option>" +
          tiers.map((t) => {
            const sel = t === effective ? " selected" : "";
            return '<option value="' + escapeHtml(t) + '"' + sel + ">" + escapeHtml(capitalizeLabel(t)) + "</option>";
          }).join("");
        return (
          "<td" + overriddenClass + '><select data-action="registry-agentTier" data-agent="' + escapeHtml(agent.name) + '" data-host="' + escapeHtml(host) + '"' + (writeMode ? "" : " disabled") + ">" + options + "</select></td>"
        );
      }).join("");
      return "<tr><th>" + escapeHtml(agent.name) + "</th>" + cells + "</tr>";
    }).join("");
    agentTierSection =
      '<div class="registry-agentTiers"><h3>Per-Agent Tier Overrides</h3>' +
      '<div class="grid-scroll"><table class="registry-grid"><thead><tr><th>Agent</th>' + agentHeaderCells + "</tr></thead><tbody>" + agentBodyRows + "</tbody></table></div></div>";
  }

  // Profile management: add / duplicate / delete / restore
  const profileActions = writeMode
    ? '<div class="registry-actions">' +
      '<button type="button" class="btn btn-secondary" data-action="registry-add-profile">Add Profile</button>' +
      '<button type="button" class="btn btn-secondary" data-action="registry-duplicate-profile">Duplicate Profile</button>' +
      '<button type="button" class="btn btn-secondary" data-action="registry-delete-profile">Delete Profile</button>' +
      "</div>" +
      (registryFormState && registryFormState.kind === "add-profile" ? renderAddProfileForm(registryFormState) : "") +
      (registryFormState && registryFormState.kind === "duplicate-profile" ? renderDuplicateProfileForm(registryFormState, profileNames) : "") +
      (registryFormState && registryFormState.kind === "delete-profile" ? renderDeleteProfileForm(registryFormState, profileNames) : "")
    : "";

  const tombstonedList = tombstoned.length
    ? '<div class="tombstoned"><h4>Removed Profiles (restorable)</h4>' +
      tombstoned.map((p) => {
        const restoreBtn = writeMode
          ? ' <button type="button" class="btn btn-secondary" data-action="registry-restore" data-profile="' + escapeHtml(p) + '">Restore</button>'
          : "";
        return '<div class="tombstoned-item" data-tombstoned="' + escapeHtml(p) + '">' + escapeHtml(p) + restoreBtn + "</div>";
      }).join("") +
      "</div>"
    : "";

  const actionButtons = writeMode
    ? '<div class="registry-action-buttons">' +
      '<button type="button" class="btn btn-primary" data-action="registry-save-apply">Save &amp; Apply</button>' +
      '<button type="button" class="btn btn-danger" data-action="registry-clear-overlay">Discard All Overrides</button>' +
      "</div>"
    : "";

  const helpSection = '<details class="help-card"><summary>About this tab</summary>' +
    '<div class="help-card-body">' +
    '<h4>What A Profile Is</h4>' +
    '<p>A profile is a named bundle of model choices — one model and effort setting per tool (Claude, Codex, Cursor, OpenCode) and per capability tier. Switching a tool to a different profile changes which model every agent on that tool runs.</p>' +
    '<h4>Capability Tiers</h4>' +
    '<p><strong>Light</strong>, <strong>Standard</strong>, and <strong>Deep</strong> are the three capability tiers a profile assigns a model to, from fastest/cheapest to most capable. An agent runs whichever tier its charter — or your Per-Agent Tier Override below — names.</p>' +
    '<h4>Managing Profiles</h4>' +
    '<dl>' +
    '<dt>Add Profile</dt><dd>Creates a new profile with a name you choose. The new profile starts with empty model/effort cells for every tool and tier.</dd>' +
    '<dt>Duplicate Profile</dt><dd>Copies an existing profile (you choose which) to a new name. Useful for creating a variant of an existing profile without re-entering all cells.</dd>' +
    '<dt>Delete Profile</dt><dd>Removes a profile. If it is one of the built-in profiles, it moves to the Removed Profiles list below (restorable). If you added it yourself, it is removed entirely.</dd>' +
    '</dl>' +
    '<h4>Default Profile per Tool</h4>' +
    '<dl>' +
    '<dt>Default Profile per Tool</dt><dd>The declared default profile per tool, used only the first time that tool is auto-installed (it has no recorded active profile yet). It is <strong>not</strong> the profile currently installed on this machine — a tool can be running any profile you switched it to, regardless of what Default Profile per Tool reads here. See the "Active Profile" tab to view each tool\'s actual active profile and to change it.</dd>' +
    '</dl>' +
    '<h4>Per-Workflow Tier Overrides</h4>' +
    '<p>Maps a workflow name to a tier, overriding the charter default for agents dispatched under that workflow. Add one (e.g., <code>spec-driven &rarr; deep</code>) to pin a heavier model tier for a specific workflow.</p>' +
    '<h4>Per-Agent Tier Overrides</h4>' +
    '<p>Maps one agent to a tier, per tool — the only way to run, for example, <code>builder</code> at Deep on OpenCode while it stays Standard everywhere else. Pick the <code>(default: ...)</code> option to remove the override and go back to inheriting the agent\'s charter tier.</p>' +
    '<h4>Save &amp; Apply</h4>' +
    '<p>Persists every unsaved change on this tab (profile cells, Default Profile per Tool, Per-Workflow Tier Overrides, Per-Agent Tier Overrides, add/duplicate/delete profile) to your local machine, then regenerates and installs the agent files for every tool. Asks for confirmation first. <strong>Restart your CLI sessions (Claude, Codex, Cursor, OpenCode) afterward</strong> — an already-running session keeps using the model it started with until you do.</p>' +
    '<h4>Discard All Overrides</h4>' +
    '<p>Deletes your saved changes, reverting every tool to the built-in defaults. Asks for confirmation. All profiles you added, cell overrides, default-profile changes, and Per-Workflow/Per-Agent overrides are lost. Removed profiles are restored.</p>' +
    '<h4>Removed Profiles</h4>' +
    '<p>A deleted built-in profile is not gone forever — it moves to the Removed Profiles list below, where Restore brings it back.</p>' +
    '</div>' +
    '</details>';

  return (
    '<section class="view"><h2>Model Catalog</h2>' + unsaved +
    registryError +
    overlayBanner +
    overlayOverrideLine +
    grid +
    '<div class="registry-hostDefaults"><h3>Default Profile per Tool</h3>' + hostDefaultsRows + "</div>" +
    '<div class="registry-workflowTiers"><h3>Per-Workflow Tier Overrides</h3>' + workflowTiersRows + addWorkflowTierBtn + "</div>" +
    agentTierSection +
    profileActions +
    tombstonedList +
    actionButtons +
    helpSection +
    "</section>"
  );
}

// ── Helpers used by renderers ──────────────────────────────────────────────

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function errorBlock(data) {
  const raw = (data && data.error) || "Request failed.";
  const msg = typeof raw === "string"
    ? raw
    : (raw && typeof raw === "object" && (raw.message || raw.code))
      ? [raw.code, raw.message].filter(Boolean).join(": ")
      : JSON.stringify(raw);
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
  return { request, authHeaders: () => (apiKey ? { "x-api-key": apiKey } : {}) };
}

// ── Admin portal enhancement handlers (exported, context-injected) ──────────
// These are module-level pure-ish functions taking a ctx { api, root, state,
// render, doc }. startApp() builds ctx and wires them in wireViewHandlers().
// Tests inject mock ctx. This avoids a startApp DOM harness for handler tests.

const BANNER_AUTOHIDE_MS = 6000;

/** @param {object} [opts] - `{ persist: true }` (T8, P1-C AC2) skips the 6 s
 *  auto-hide for a success banner — used for the Save & Apply completion
 *  banner, which must stay visible until the operator dismisses/navigates. */
export function showBanner(root, type, message, opts) {
  const persist = !!(opts && opts.persist);
  // Clear existing banner(s) — only one at a time.
  const existing = root.querySelectorAll ? root.querySelectorAll(".success, .error") : [];
  existing.forEach((b) => { if (b.remove) b.remove(); });
  const div = {
    className: (type === "success" ? "success" : "error") + (persist ? " banner-persist" : ""),
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
  if (type === "success" && !persist && typeof setTimeout !== "undefined") {
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
    const changed = (res && res.data && res.data.changedRestartSections) || [];
    if (changed.length > 0) {
      // Diff-based restart proposal (APR-05): only when a restart-relevant
      // value actually changed in THIS save. Persistent — the running
      // process will not pick the change up on its own.
      showBanner(
        ctx.root,
        "success",
        "Config section " + section + " saved. Restart required to apply: " + changed.join(", ") +
          " — use the Restart Server button to apply now.",
        { persist: true },
      );
    } else {
      showBanner(ctx.root, "success", "Config section " + section + " saved. Backup created.");
    }
    ctx.render();
  } catch (e) {
    showBanner(ctx.root, "error", "Save failed: " + String((e && e.message) || e));
  }
}

/** Restart the API server (APR-04): confirm, POST, then poll /health until
 *  the replacement answers. Poll knobs are injectable for tests. */
export async function handleServerRestart(ctx, opts) {
  opts = opts || {};
  const pollIntervalMs = opts.pollIntervalMs !== undefined ? opts.pollIntervalMs : 1000;
  const maxAttempts = opts.maxAttempts !== undefined ? opts.maxAttempts : 30;
  // Re-entrancy guard: a second click during the poll loop would interleave
  // two banner cycles. Scoped to the app instance's state, NOT the module —
  // a module-level flag latched by one harness's never-resolving request
  // would silently disable the handler for every later caller in the same
  // process. Server-side arm/consume is already one-shot.
  const state = ctx.state || (ctx.state = {});
  if (state.serverRestartInFlight) return;
  if (!confirm("Restart the massa-ai API server? In-flight requests will be dropped.")) return;
  state.serverRestartInFlight = true;
  try {
    await runServerRestart(ctx, pollIntervalMs, maxAttempts);
  } finally {
    state.serverRestartInFlight = false;
  }
}

async function runServerRestart(ctx, pollIntervalMs, maxAttempts) {
  let res;
  try {
    res = await ctx.api.request("/api/v1/system/restart", { method: "POST", body: {} });
  } catch (e) {
    showBanner(ctx.root, "error", "Restart request failed: " + String((e && e.message) || e));
    return;
  }
  if (!res || res.success === false) {
    // 409 dev-watch carries a specific reason — show it verbatim, never a
    // generic message (APUX fix-loop 1 lesson).
    const reason = (res && (res.reason || res.error)) || "restart refused";
    showBanner(ctx.root, "error", "Restart refused: " + reason);
    return;
  }
  showBanner(
    ctx.root,
    "success",
    "Restarting (" + res.mode + " mode)… waiting for the server to come back.",
    { persist: true },
  );
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    try {
      const health = await ctx.api.request("/health");
      if (health) {
        showBanner(ctx.root, "success", "Server is back up.");
        ctx.render();
        return;
      }
    } catch {
      // Expected while the listener is down — keep polling.
    }
  }
  showBanner(
    ctx.root,
    "error",
    "Server did not come back after " + Math.round((maxAttempts * pollIntervalMs) / 1000) +
      " s — check the server process (respawn mode cannot recover if the replacement failed to bind).",
  );
}

export async function handleConfigReveal(ctx, targetId, section, field) {
  const el = ctx.doc && ctx.doc.getElementById ? ctx.doc.getElementById(targetId) : null;
  if (!el) return;
  if (el.type === "text" && el.dataset.revealed === "true") {
    // Hide: mask the display only (type back to password). Do NOT overwrite
    // el.value with the literal "***" sentinel — on a field whose real
    // stored value is empty, that fabricates a submittable value that used
    // to be persisted verbatim as the real secret (F7/APCR-05). Leaving
    // el.value untouched also preserves an edit the operator made while the
    // field was revealed, instead of silently discarding it.
    el.type = "password";
    el.dataset.revealed = "";
    return;
  }
  if (!ctx.api || !section || !field) {
    if (el.type === "password") el.type = "text";
    return;
  }
  try {
    const res = await ctx.api.request("/api/v1/config/reveal?section=" + encodeURIComponent(section) + "&field=" + encodeURIComponent(field));
    if (res && res.success !== false && res.data) {
      el.value = res.data.value || "";
      el.type = "text";
      el.dataset.revealed = "true";
    }
  } catch {
    if (el.type === "password") el.type = "text";
  }
}

/** Opens the inline bulk-delete confirmation form (MBD-04): T1's
 *  `renderMemoryBulkDelete` renders the retype-to-confirm form only while
 *  `state.memoryBulkForm` is truthy. */
export function handleMemoryDeleteProjectOpen(ctx) {
  ctx.state.memoryBulkForm = { error: null };
  ctx.render();
}

/** Closes the inline bulk-delete confirmation form without issuing any
 *  request (MBD-04). */
export function handleMemoryDeleteProjectCancel(ctx) {
  ctx.state.memoryBulkForm = null;
  ctx.render();
}

/** Bulk-delete confirm handler (design "1. Memory bulk delete (MBD)",
 *  MBD-03..06). The typed confirmation value is read from
 *  `[data-bulk="confirm-id"]` — NEVER from `btn.dataset` — because the
 *  fake-DOM harness's synthetic `startApp` clicks fire every registered
 *  `data-action` handler against a generic child whose dataset carries none
 *  of this form's keys. Reading through the DOM lookup means a genuinely
 *  absent/mismatched value fails the exact-match guard instead of reading a
 *  stale or empty dataset property as a false confirmation.
 *
 *  The in-flight guard lives on `ctx.state`, never module scope —
 *  `handleServerRestart`'s recorded precedent (a module-level flag latched by
 *  one harness's never-resolving request would disable the handler for every
 *  later caller in the same process). */
export async function handleMemoryDeleteProject(ctx) {
  const state = ctx.state || (ctx.state = {});
  if (state.memoryBulkDeleteInFlight) return;

  const input = ctx.root && ctx.root.querySelector ? ctx.root.querySelector('[data-bulk="confirm-id"]') : null;
  if (!input) return;

  const typed = input.value;
  const project = state.project;
  if (typed !== project) {
    state.memoryBulkForm = { error: "Project id does not match." };
    ctx.render();
    return;
  }

  state.memoryBulkDeleteInFlight = true;
  try {
    const res = await ctx.api.request("/api/v1/project/reset", {
      method: "POST",
      body: { projectId: project, clearVectors: false, clearSymbols: false, clearMemories: true },
    });
    if (res && res.success === false) {
      const errors = Array.isArray(res.errors) ? res.errors : [];
      const message = errors.length > 0 ? errors.join("; ") : (res.error || "Bulk delete failed.");
      state.memoryBulkForm = { error: message };
      showBanner(ctx.root, "error", "Bulk delete failed: " + message);
      ctx.render();
      return;
    }
    const data = (res && res.data) || {};
    const deleted = data.memoriesDeleted != null ? data.memoriesDeleted : 0;
    state.memoryBulkForm = null;
    showBanner(ctx.root, "success", "Deleted " + String(deleted) + " memories for " + project + ".");
    ctx.render();
  } catch (e) {
    const message = String((e && e.message) || e);
    state.memoryBulkForm = { error: message };
    showBanner(ctx.root, "error", "Bulk delete failed: " + message);
    ctx.render();
  } finally {
    state.memoryBulkDeleteInFlight = false;
  }
}

// ── Profiles tab switcher + switch handler (Component 2) ─────────────────────

const PROFILES_TAB_STORAGE_KEY = "massa-ai-profiles-tab";

export function renderProfilesView(profilesData, registryData, opts) {
  opts = opts || {};
  const tab = opts.profilesTab || "switch";
  const writeMode = opts.writeMode !== undefined ? opts.writeMode : isWriteModeEnabled();

  const switcher =
    '<div class="tab-switcher">' +
    '<button type="button" class="tab' + (tab === "switch" ? " active" : "") + '" data-action="profiles-tab" data-tab="switch">Active Profile</button>' +
    '<button type="button" class="tab' + (tab === "registry" ? " active" : "") + '" data-action="profiles-tab" data-tab="registry">Model Catalog</button>' +
    "</div>";

  let body;
  if (tab === "registry") {
    body = renderModelRegistry(registryData, { writeMode, unsaved: opts.unsaved, registryForm: opts.registryForm });
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

// ── Registry in-memory overlay state + CRUD (Component 3) ───────────────────
// F2 fold: registryLoaded guard prevents re-init on every render. beforeunload
// guard when dirty (added in startApp).
//
// APCR-01 (design D-1): the server now deep-merges the overlay against the
// builtin as a real delta (absent key = inherit, null = delete). Seeding the
// in-memory overlay from the EFFECTIVE registry — as a prior fix here did —
// writes a full copy of the builtin back to the overlay file on every save,
// which freezes that operator against every future builtin addition (F1).
// Seed from source.overlay ONLY: an empty/absent overlay starts as an empty
// delta, and mergeRegistryForDisplay (below) is what makes add/duplicate/
// delete/edit visible before save without requiring a full-registry seed.

export function initRegistryOverlay(ctx, registry, source) {
  if (ctx.state.registryLoaded) return;
  const reg = registry || {};
  const src = source || {};
  const overlayData = src.overlay || null;

  const seed = overlayData ? JSON.parse(JSON.stringify(overlayData)) : {};

  ctx.state.registryOverlay = {
    profiles: seed.profiles || {},
    hostDefaults: seed.hostDefaults || {},
    workflowTiers: seed.workflowTiers || {},
    agentTiers: seed.agentTiers || {},
    tiers: seed.tiers || reg.tiers || ["light", "standard", "deep"],
  };
  ctx.state.registryDirty = false;
  ctx.state.registryLoaded = true;
}

/** Merge a flat `{key: value}` overlay delta over the server's map, per key —
 *  never a truthiness fallback (an empty-but-present overlay object must not
 *  blank the server's map, APCR-11.4). A `null` overlay value tombstones the
 *  key (design D-1). */
function mergeFlatMapForDisplay(serverMap, overlayMap) {
  const merged = { ...serverMap };
  for (const [key, value] of Object.entries(overlayMap || {})) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/** Per-agent, per-host merge of `agentTiers` (design D-1, D-4.3) — client twin of
 *  `mergeAgentTiers` in scripts/lib/model-profiles.ts (cross-boundary parity fixture
 *  `apps/web-ui/src/__tests__/fixtures/agent-tiers-parity.json` keeps the two provably
 *  identical). `overlay[agent] === null` deletes the whole agent entry; otherwise the
 *  agent's host map is merged against the base via `mergeFlatMapForDisplay` itself, so a
 *  host-level `null` tombstones just that key and an absent host key inherits. */
function mergeAgentTiersForDisplay(base, overlay) {
  const result = {};
  for (const [agent, hostMap] of Object.entries(base || {})) {
    result[agent] = { ...hostMap };
  }
  for (const [agent, value] of Object.entries(overlay || {})) {
    if (value === null) {
      delete result[agent];
      continue;
    }
    result[agent] = mergeFlatMapForDisplay((base && base[agent]) || {}, value);
  }
  return result;
}

/** Merge one overlay profile over its server-side counterpart, per host and per tier.
 *  Mirrors `mergeProfile` in scripts/lib/model-profiles.ts: the overlay is a DELTA, so a
 *  host or tier it does not mention is retained from the server's profile, and a profile
 *  the server does not have passes through as a genuinely new one.
 *
 *  Whole-object replace here is the client twin of the server bug APCR-01 fixed: the saved
 *  overlay for an operator who edited only one host is `{hosts: {opencode: {...}}}`, and
 *  assigning that over the server's profile erases claude/codex/cursor from the display —
 *  their cells render as "—" and become uneditable. */
function mergeProfileForDisplay(baseProfile, overlayProfile) {
  const { _delete: _unusedDelete, ...rest } = overlayProfile;
  void _unusedDelete;
  if (!baseProfile) return rest;
  const mergedHosts = { ...baseProfile.hosts };
  if (rest.hosts) {
    for (const [host, tierMap] of Object.entries(rest.hosts)) {
      const baseTierMap = mergedHosts[host];
      mergedHosts[host] = baseTierMap ? { ...baseTierMap, ...tierMap } : tierMap;
    }
  }
  return {
    description: rest.description !== undefined ? rest.description : baseProfile.description,
    hosts: mergedHosts,
  };
}

/** Build the display registry = server registry merged with in-memory overlay.
 *  This makes add/duplicate/delete/restore visible immediately (before save),
 *  instead of requiring a save+reload cycle. The renderer reads from this. */
export function mergeRegistryForDisplay(serverData, overlay) {
  const base = (serverData && serverData.registry) || {};
  if (!overlay || !overlay.profiles) return serverData || { registry: {}, source: {} };
  const merged = JSON.parse(JSON.stringify(base));
  merged.tiers = (overlay.tiers && overlay.tiers.length > 0) ? overlay.tiers : (merged.tiers || ["light", "standard", "deep"]);
  merged.hostDefaults = mergeFlatMapForDisplay(merged.hostDefaults, overlay.hostDefaults);
  merged.workflowTiers = mergeFlatMapForDisplay(merged.workflowTiers, overlay.workflowTiers);
  merged.agentTiers = mergeAgentTiersForDisplay(merged.agentTiers, overlay.agentTiers);
  // Merge profiles as a delta: skip _delete tombstones, deep-merge the rest per host/tier.
  merged.profiles = merged.profiles || {};
  for (const [key, val] of Object.entries(overlay.profiles)) {
    if (val && val._delete === true) {
      delete merged.profiles[key];
    } else if (val) {
      merged.profiles[key] = mergeProfileForDisplay(merged.profiles[key], val);
    }
  }
  // overlayOverrideCount (APCR-01.10) is server-computed from the saved overlay, not the
  // in-memory display merge — carry it through unchanged so the count stays visible while
  // add/duplicate/delete/edit are shown pre-save. `agents`/`agentsError` (T6, design D-4.3)
  // are likewise server-computed (charter-derived) and must survive this rebuild branch, or
  // the Per-Agent Tier Overrides table loses its row source the instant any other field is
  // edited in the same session.
  return {
    registry: merged,
    source: (serverData && serverData.source) || {},
    overlayOverrideCount: (serverData && serverData.overlayOverrideCount) || 0,
    agents: (serverData && serverData.agents) || [],
    agentsError: serverData && serverData.agentsError,
  };
}

export function handleRegistryCellEdit(ctx, profile, host, tier, field, value) {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] };
  if (!ctx.state.registryOverlay.profiles) ctx.state.registryOverlay.profiles = {};
  // Create-on-demand for the first edit of a profile the overlay has never touched. Leave
  // `description` absent rather than defaulting it to the profile key: the server's
  // mergeProfile() only inherits the builtin's description when the overlay's own is
  // `undefined` (APCR-11.6) - stamping the key here would overwrite a builtin profile's real
  // description with its own name on the very first cell edit.
  if (!ctx.state.registryOverlay.profiles[profile]) ctx.state.registryOverlay.profiles[profile] = { hosts: {} };
  if (!ctx.state.registryOverlay.profiles[profile].hosts) ctx.state.registryOverlay.profiles[profile].hosts = {};
  if (!ctx.state.registryOverlay.profiles[profile].hosts[host]) ctx.state.registryOverlay.profiles[profile].hosts[host] = {};
  if (!ctx.state.registryOverlay.profiles[profile].hosts[host][tier]) ctx.state.registryOverlay.profiles[profile].hosts[host][tier] = { model: null, effort: null };
  ctx.state.registryOverlay.profiles[profile].hosts[host][tier][field] = value || null;
  ctx.state.registryDirty = true;
}

export function handleRegistryHostDefaultEdit(ctx, host, value) {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {} };
  if (!ctx.state.registryOverlay.hostDefaults) ctx.state.registryOverlay.hostDefaults = {};
  ctx.state.registryOverlay.hostDefaults[host] = value;
  ctx.state.registryDirty = true;
}

/** Per-Agent Tier Overrides cell edit (design D-4.3, APUX-04, P1-A AC8). `value === ""`
 *  (the "(default: ...)" option) removes the override key entirely rather than writing a
 *  `null` tombstone — the spec's assumption row (P1-A) notes the builtin `agentTiers` ships
 *  `{}`, so there is nothing to tombstone; an absent key already inherits the charter tier.
 *  An emptied agent object is pruned so a fully-reset agent leaves no residue in the saved
 *  overlay. */
export function handleRegistryAgentTierEdit(ctx, agent, host, value) {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, agentTiers: {}, tiers: ["light", "standard", "deep"] };
  if (!ctx.state.registryOverlay.agentTiers) ctx.state.registryOverlay.agentTiers = {};
  if (value === "") {
    const agentEntry = ctx.state.registryOverlay.agentTiers[agent];
    if (agentEntry) {
      delete agentEntry[host];
      if (Object.keys(agentEntry).length === 0) delete ctx.state.registryOverlay.agentTiers[agent];
    }
  } else {
    if (!ctx.state.registryOverlay.agentTiers[agent]) ctx.state.registryOverlay.agentTiers[agent] = {};
    ctx.state.registryOverlay.agentTiers[agent][host] = value;
  }
  ctx.state.registryDirty = true;
}

export function handleRegistryWorkflowTierEdit(ctx, workflow, value) {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, workflowTiers: {} };
  if (!ctx.state.registryOverlay.workflowTiers) ctx.state.registryOverlay.workflowTiers = {};
  ctx.state.registryOverlay.workflowTiers[workflow] = value;
  ctx.state.registryDirty = true;
}

/** Opens/closes an inline registry form (design D-4.4). Clicking a trigger
 *  button whose form is already open closes it; clicking a different
 *  trigger switches forms. Replaces the old direct prompt()-driven handlers
 *  as the click target for Add Workflow Override / Add Profile / Duplicate
 *  Profile / Delete Profile. */
export function handleRegistryFormToggle(ctx, kind) {
  if (ctx.state.registryForm && ctx.state.registryForm.kind === kind) {
    ctx.state.registryForm = null;
  } else {
    ctx.state.registryForm = { kind, error: null };
  }
  ctx.render();
}

/** Closes the currently open inline registry form without applying it. */
export function handleRegistryFormCancel(ctx) {
  ctx.state.registryForm = null;
  ctx.render();
}

export function handleRegistryWorkflowTierAdd(ctx, workflow, tier) {
  const existing = (ctx.state.registryOverlay && ctx.state.registryOverlay.workflowTiers) || {};
  if (!workflow || !workflow.trim()) return;
  const wf = workflow.trim();
  if (Object.prototype.hasOwnProperty.call(existing, wf)) {
    ctx.state.registryForm = { kind: "add-workflow", error: 'Workflow "' + wf + '" already has a tier. Edit it instead.' };
    ctx.render();
    return;
  }
  const tiers = (ctx.state.registryOverlay && ctx.state.registryOverlay.tiers) || ["light", "standard", "deep"];
  const trimmedTier = (tier || "").trim();
  if (!trimmedTier || !tiers.includes(trimmedTier)) {
    ctx.state.registryForm = { kind: "add-workflow", error: 'Tier "' + trimmedTier + '" is not one of ' + tiers.join(", ") + "." };
    ctx.render();
    return;
  }
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, workflowTiers: {} };
  if (!ctx.state.registryOverlay.workflowTiers) ctx.state.registryOverlay.workflowTiers = {};
  ctx.state.registryOverlay.workflowTiers[wf] = trimmedTier;
  ctx.state.registryDirty = true;
  ctx.state.registryForm = null;
  ctx.render();
}

export function handleRegistryWorkflowTierRemove(ctx, workflow) {
  if (!ctx.state.registryOverlay) return;
  if (!ctx.state.registryOverlay.workflowTiers) return;
  // A `null` tombstone (design D-1), not a deleted key: under the server's deep merge, an
  // absent overlay key means "inherit the builtin's value" — deleting the key here would
  // make removal a silent no-op the next time the builtin still has this workflow tier.
  ctx.state.registryOverlay.workflowTiers[workflow] = null;
  ctx.state.registryDirty = true;
  ctx.render();
}

export function handleRegistryAddProfile(ctx, name, description) {
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  if (ctx.state.registryOverlay && ctx.state.registryOverlay.profiles && ctx.state.registryOverlay.profiles[trimmed]) {
    ctx.state.registryForm = { kind: "add-profile", error: 'Profile "' + trimmed + '" already exists.' };
    ctx.render();
    return;
  }
  const desc = (description && description.trim()) || trimmed;
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] };
  const tiers = ctx.state.registryOverlay.tiers || ["light", "standard", "deep"];
  const hosts = {};
  for (const h of REGISTRY_HOSTS) {
    hosts[h] = {};
    for (const t of tiers) hosts[h][t] = { model: null, effort: null };
  }
  ctx.state.registryOverlay.profiles[trimmed] = { description: desc, hosts };
  ctx.state.registryDirty = true;
  ctx.state.registryForm = null;
  ctx.render();
}

// Both Duplicate and Delete build their "Available: ..." list from the DISPLAY registry
// (server registry merged with the in-memory overlay via mergeRegistryForDisplay), not the
// raw overlay. The overlay-only seed (APCR-01.8) leaves ctx.state.registryOverlay.profiles
// empty for an operator who has not edited anything this session, so reading the raw overlay
// made both pickers report "no profiles available" even though every builtin profile is
// selectable (APCR-11.5). mergeRegistryForDisplay already drops `_delete`-tombstoned
// profiles from its result, so no separate filter is needed here.
export function handleRegistryDuplicateProfile(ctx, sourceName, newName) {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] };
  if (!ctx.state.registryOverlay.profiles) ctx.state.registryOverlay.profiles = {};
  const display = mergeRegistryForDisplay(ctx.state.registryServerData, ctx.state.registryOverlay);
  const available = (display && display.registry && display.registry.profiles) || {};
  if (!sourceName || !sourceName.trim()) return;
  const src = sourceName.trim();
  if (!available[src]) {
    ctx.state.registryForm = { kind: "duplicate-profile", error: 'Profile "' + src + '" not found.' };
    ctx.render();
    return;
  }
  if (!newName || !newName.trim()) return;
  const trimmedNew = newName.trim();
  if (Object.prototype.hasOwnProperty.call(available, trimmedNew)) {
    ctx.state.registryForm = { kind: "duplicate-profile", error: 'Profile "' + trimmedNew + '" already exists.' };
    ctx.render();
    return;
  }
  const copy = JSON.parse(JSON.stringify(available[src]));
  delete copy._delete;
  ctx.state.registryOverlay.profiles[trimmedNew] = copy;
  ctx.state.registryDirty = true;
  ctx.state.registryForm = null;
  ctx.render();
}

export function handleRegistryDeleteProfile(ctx, name) {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] };
  if (!ctx.state.registryOverlay.profiles) ctx.state.registryOverlay.profiles = {};
  const display = mergeRegistryForDisplay(ctx.state.registryServerData, ctx.state.registryOverlay);
  const available = (display && display.registry && display.registry.profiles) || {};
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  if (!available[trimmed]) {
    ctx.state.registryForm = { kind: "delete-profile", error: 'Profile "' + trimmed + '" not found.' };
    ctx.render();
    return;
  }
  // The tombstone must land on the OVERLAY (the thing that gets saved), not the computed
  // display copy - create a minimal overlay entry when deleting a profile the overlay has
  // never touched (e.g. a builtin-only profile). `_delete: true` alone is a valid tombstone
  // (scripts/lib/model-profiles.ts mergeOverlay only checks that flag).
  if (!ctx.state.registryOverlay.profiles[trimmed]) {
    ctx.state.registryOverlay.profiles[trimmed] = { _delete: true };
  } else {
    ctx.state.registryOverlay.profiles[trimmed]._delete = true;
  }
  ctx.state.registryDirty = true;
  ctx.state.registryForm = null;
  ctx.render();
}

export function handleRegistryRestore(ctx, profile) {
  if (!ctx.state.registryOverlay || !ctx.state.registryOverlay.profiles) return;
  const p = ctx.state.registryOverlay.profiles[profile];
  if (!p) return;
  delete p._delete;
  ctx.state.registryDirty = true;
  ctx.render();
}

export async function handleProjectIndexProgress(ctx, jobId) {
  ctx.state.indexJobId = jobId;
  ctx.state.indexJobStatus = "pending";
  ctx.state.indexJobPhase = null;
  ctx.state.indexJobFileCount = null;
  ctx.render();
}

/** SSE index_status event handler — exported so tests exercise the real
 *  matching logic, not a copy. Returns true if the event matched and updated
 *  state, false if ignored (jobId mismatch or no tracked job). */
export function handleIndexStatusEvent(ctx, payload) {
  if (!payload || !ctx.state.indexJobId) return false;
  if (payload.jobId !== ctx.state.indexJobId) return false;
  ctx.state.indexJobStatus = payload.status || ctx.state.indexJobStatus;
  ctx.state.indexJobPhase = payload.phase || ctx.state.indexJobPhase;
  ctx.state.indexJobFileCount = payload.fileCount != null ? payload.fileCount : ctx.state.indexJobFileCount;
  if (ctx.state.indexJobStatus === "completed" || ctx.state.indexJobStatus === "failed") {
    if (ctx.state.indexPollInterval) {
      clearInterval(ctx.state.indexPollInterval);
      ctx.state.indexPollInterval = null;
    }
  }
  return true;
}

export async function handleRegistryClearOverlay(ctx) {
  if (!confirm("Discard all your overrides? This deletes your saved changes and reverts every tool to the built-in defaults.")) return;
  try {
    const res = await ctx.api.request("/api/v1/model-registry/overlay", { method: "DELETE" });
    if (res && res.success === false) {
      showBanner(ctx.root, "error", "Clear failed: " + (res.error || "unknown"));
      return;
    }
    showBanner(ctx.root, "success", "Overrides discarded. Reverted to the built-in defaults.");
    ctx.state.registryLoaded = false;
    ctx.state.registryDirty = false;
    ctx.render();
  } catch (e) {
    showBanner(ctx.root, "error", "Clear failed: " + String((e && e.message) || e));
  }
}

// ── Registry regenerate streaming handler (design D-4.5, T8, fix-loop 1) ────
// runRegenerateStream is the SSE fetch + APCR-06 classification logic, called
// ONLY from handleRegistrySaveAndApply below (the standalone "Regenerate
// Artifacts" button + its own confirm() no longer exist — T8, APUX-13). It
// carries no confirm() of its own; the single Save & Apply confirm covers
// both the save and the apply step. Returns `{ ok, reason }`: `ok` is true
// only for a full, unqualified success (every host installed, no
// variant-sync failures); on any other outcome `reason` is the exact
// diagnostic text this function would otherwise have shown on its own —
// stream-closed sentence, exit-code line, per-host failed/unsupported
// detail, or the spawn/network error — so the caller can fold the specific
// reason into its own banner instead of discarding it (fix-loop 1: the
// unified Save & Apply flow overwrites this function's own banner with a
// generic retry message, and that message must not lose the diagnostic).

const RESTART_SENTENCE = "Restart your CLI sessions (Claude, Codex, Cursor, OpenCode) to pick up the changes.";

export async function runRegenerateStream(ctx) {
  if (ctx.state.regenerating) return { ok: false, reason: undefined };
  ctx.state.regenerating = true;
  ctx.render();
  let ok = false;
  let reason;

  try {
    const headers = (ctx.api && ctx.api.authHeaders) ? ctx.api.authHeaders() : {};
    const res = await fetch("/api/v1/model-registry/regenerate-and-install-stream", { method: "POST", headers });
    if (!res || !res.body || !res.body.getReader) {
      throw new Error("stream unavailable");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let gotDone = false;
    const installResults = { switched: [], skipped: [], unsupported: [], failed: [] };
    const variantSyncResults = { synced: [], failed: [] };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Split on \n\n (SSE frame delimiter)
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        let event;
        try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (event.type === "line") {
          // append to log panel — in a real browser this updates the DOM.
          // For the handler contract, we just consume the line.
        } else if (event.type === "install") {
          // Classify by the server-derived status (APCR-06), not merely by
          // the event's presence — a failed/unsupported host must never land
          // in the success bucket. "unsupported" is its own class, never
          // folded into "skipped" (APCR-06.7).
          if (event.status === "switched") installResults.switched.push(event.host + " → " + event.profile);
          else if (event.status === "skipped") installResults.skipped.push(event.host);
          else if (event.status === "unsupported") installResults.unsupported.push(event.unsupported || event.host);
          else if (event.status === "failed") installResults.failed.push(event.host + ": " + (event.error || event.failed || "unknown"));
        } else if (event.type === "variant-sync") {
          // Bridge-step frames (T3), emitted before the "install" frames —
          // one per host, copying the freshly regenerated agent-profiles
          // trees into that host's installed variant root. "skipped" is the
          // routine case (no source checkout, Cursor, or no variant tree
          // installed yet) and stays silent, matching how a "skipped"
          // install host needs no banner line on its own.
          if (event.status === "synced") variantSyncResults.synced.push(event.host);
          else if (event.status === "failed") variantSyncResults.failed.push(event.host + ": " + (event.error || "unknown"));
        } else if (event.type === "done") {
          gotDone = true;
          // APCR-06.6: the generator can exit 0 while at least one host's
          // install failed or was unsupported — that is not a success.
          var hadInstallProblems = installResults.failed.length > 0 || installResults.unsupported.length > 0 || variantSyncResults.failed.length > 0;
          if (event.exitCode === 0 && !hadInstallProblems) {
            ok = true;
            var parts = ["Regeneration complete."];
            if (variantSyncResults.synced.length > 0) parts.push("Synced: " + variantSyncResults.synced.join(", "));
            if (installResults.switched.length > 0) parts.push("Installed: " + installResults.switched.join(", "));
            if (installResults.skipped.length > 0) parts.push("Skipped: " + installResults.skipped.join(", "));
            parts.push(RESTART_SENTENCE);
            showBanner(ctx.root, "success", parts.join(" "), { persist: true });
          } else if (event.exitCode === null) {
            reason = "Regeneration failed: " + (event.error || "spawn error");
            showBanner(ctx.root, "error", reason);
          } else if (event.exitCode !== 0) {
            reason = "Regeneration failed (exit " + event.exitCode + ").";
            showBanner(ctx.root, "error", reason);
          } else {
            var errParts = ["Regeneration complete, but not every host installed."];
            if (variantSyncResults.failed.length > 0) errParts.push("Variant sync failed: " + variantSyncResults.failed.join("; "));
            if (installResults.switched.length > 0) errParts.push("Installed: " + installResults.switched.join(", "));
            if (installResults.skipped.length > 0) errParts.push("Skipped: " + installResults.skipped.join(", "));
            if (installResults.unsupported.length > 0) errParts.push("Unsupported: " + installResults.unsupported.join("; "));
            if (installResults.failed.length > 0) errParts.push("Failed: " + installResults.failed.join("; "));
            reason = errParts.join(" ");
            showBanner(ctx.root, "error", reason);
          }
          break;
        }
      }
    }
    if (!gotDone) {
      ok = false;
      reason = "Regeneration stream closed unexpectedly.";
      showBanner(ctx.root, "error", reason);
    }
  } catch (e) {
    ok = false;
    reason = "Regeneration failed: " + String((e && e.message) || e);
    showBanner(ctx.root, "error", reason);
  } finally {
    ctx.state.regenerating = false;
    ctx.render();
  }
  return { ok, reason };
}

/** Unified Save & Apply (design D-4.5, APUX-13, P1-C AC1-AC5). One confirm
 *  covering both steps: PUT the in-memory overlay, and — only on a successful
 *  save — run the existing regenerate-and-install stream (no second confirm).
 *  Replaces the separate "Save Overlay" + "Regenerate Artifacts" buttons. */
export async function handleRegistrySaveAndApply(ctx) {
  if (!confirm("Save changes and apply them to your installed agents? This overwrites installed variant directories, and you will need to restart your CLI sessions afterward.")) return;
  try {
    const res = await ctx.api.request("/api/v1/model-registry", { method: "PUT", body: ctx.state.registryOverlay });
    if (res && res.success === false) {
      const details = res.details ? res.details.join("; ") : (res.error || "Save failed.");
      showBanner(ctx.root, "error", "Save failed: " + details);
      return;
    }
  } catch (e) {
    showBanner(ctx.root, "error", "Save failed: " + String((e && e.message) || e));
    return;
  }
  // Reset the loaded/dirty guards so the next render re-inits from the newly
  // saved source.overlay (mirrors the old Save Overlay success path).
  ctx.state.registryDirty = false;
  ctx.state.registryLoaded = false;
  const { ok: applied, reason } = await runRegenerateStream(ctx);
  if (!applied) {
    // Overrides runRegenerateStream's own (more detailed) failure banner —
    // showBanner clears the prior banner, so this is what the operator sees
    // last. The leading sentence stays literal (P1-C AC4's safe-to-retry
    // contract); the specific reason (stream-closed, per-host failure,
    // exit-code line, spawn error) is folded in rather than discarded
    // (fix-loop 1).
    const detail = reason ? " Details: " + reason : "";
    showBanner(ctx.root, "error", "Changes saved, but applying them failed — press Save & Apply again to retry." + detail);
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
    registryForm: null,
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
    // F4 fold: clear index poll interval when navigating away from projects
    if (state.view !== "projects") clearIndexPoll();
    try {
      if (state.view === "projects") {
        const data = await api.request("/api/v1/project/list");
        root.innerHTML = renderProjects((data && data.data) || { projects: [] }, {
          indexJobId: state.indexJobId,
          indexJobStatus: state.indexJobStatus,
          indexJobPhase: state.indexJobPhase,
          indexJobFileCount: state.indexJobFileCount,
        });
        // If a job completed, refresh project list
        if (state.indexJobStatus === "completed" || state.indexJobStatus === "failed") {
          // Clear the completed job after a render so the progress line disappears on next nav
          // but keep it visible until then
        }
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
        root.innerHTML = renderMemoryBrowser(data, {
          filters: state.memoryFilters,
          project: state.project,
          memoryBulkForm: state.memoryBulkForm,
        });
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
        if (data && data.success === false) {
          root.innerHTML = '<section class="view"><h2>Config</h2>' + errorBlock(data) + "</section>";
        } else {
          root.innerHTML = renderConfig((data && data.data) || { config: {}, restartNeededSections: [] }, { writeMode: isWriteModeEnabled() });
        }
      } else if (state.view === "profiles") {
        const profilesRes = await api.request("/api/v1/profiles");
        const registryRes = await api.request("/api/v1/model-registry");
        const registryData = (registryRes && registryRes.success !== false && registryRes.data) || { registry: {}, source: {}, _error: registryRes && registryRes.error };
        const ctxObj = { api, root, state, render, doc };
        initRegistryOverlay(ctxObj, registryData.registry, registryData.source);
        // Cached so handleRegistryDuplicateProfile/handleRegistryDeleteProfile (Component 3,
        // triggered from wireViewHandlers' own `ctx`, not ctxObj) can read the same display
        // registry this render used, instead of only the raw overlay (APCR-11.5).
        state.registryServerData = registryData;
        const displayData = mergeRegistryForDisplay(registryData, state.registryOverlay);
        root.innerHTML = renderProfilesView(
          (profilesRes && profilesRes.data) || { hosts: [] },
          displayData,
          { profilesTab: state.profilesTab || "switch", writeMode: isWriteModeEnabled(), unsaved: state.registryDirty, registryForm: state.registryForm },
        );
      } else if (state.view === "model-registry") {
        const data = await api.request("/api/v1/model-registry");
        const ctxObj = { api, root, state, render, doc };
        const regData = (data && data.data) || { registry: {}, source: {} };
        initRegistryOverlay(ctxObj, regData.registry, regData.source);
        state.registryServerData = regData;
        const displayData = mergeRegistryForDisplay(regData, state.registryOverlay);
        root.innerHTML = renderModelRegistry(displayData, { writeMode: isWriteModeEnabled(), unsaved: state.registryDirty, registryForm: state.registryForm });
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
    // write mode: checkpoint create/edit/delete
    root.querySelector('[data-action="checkpoint-create"]')?.addEventListener("click", () => {
      handleCheckpointCreate();
    });
    root.querySelectorAll('[data-action="checkpoint-edit"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const taskId = btn.dataset.task || "";
        const status = btn.dataset.status || "pending";
        const checkpointType = btn.dataset.checkpointType || btn.dataset.type || "manual";
        const description = btn.dataset.description || "";
        const progress = btn.dataset.progress || "0";
        const step = btn.dataset.step || "";
        const total = btn.dataset.total || "";
        const completed = btn.dataset.completed || "";
        const form = root.querySelector('[data-form="checkpoint-create"]');
        if (!form) return;
        const setField = (name, value) => {
          const el = form.querySelector('[data-create="' + name + '"]');
          if (el) el.value = value;
        };
        setField("taskId", taskId);
        setField("status", status);
        setField("checkpointType", checkpointType);
        setField("description", description);
        setField("progressPercent", progress);
        setField("currentStep", step);
        setField("totalSteps", total);
        setField("completedSteps", completed);
        const header = form.querySelector("h3");
        if (header) header.textContent = "Edit Checkpoint (create new to save)";
      });
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
        if (confirm("Delete project " + project + "? This removes its indexed vectors, symbols and memories permanently. This cannot be undone.")) {
          handleProjectReset(project);
        }
      });
    });
    // admin-portal-enhancements: config save/reveal
    const ctx = { api, root, state, render, doc };
    // admin-portal-ops-suite (T2, MBD-03..06): memory bulk-delete open/confirm/cancel
    root.querySelectorAll('[data-action="memory-delete-project"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        handleMemoryDeleteProjectOpen(ctx);
      });
    });
    root.querySelectorAll('[data-action="memory-delete-project-confirm"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        handleMemoryDeleteProject(ctx);
      });
    });
    root.querySelectorAll('[data-action="memory-delete-project-cancel"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        handleMemoryDeleteProjectCancel(ctx);
      });
    });
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
        handleConfigReveal(ctx, target, btn.dataset.section, btn.dataset.field);
      });
    });
    // admin-portal-restart (APR-04): server restart button
    root.querySelectorAll('[data-action="server-restart"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        handleServerRestart(ctx);
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
    // admin-portal-enhancements: registry in-memory CRUD + save/clear
    root.querySelectorAll('[data-action="registry-effort"]').forEach((el) => {
      el.addEventListener("change", () => {
        handleRegistryCellEdit(ctx, el.dataset.profile, el.dataset.host, el.dataset.tier, "effort", el.value);
      });
    });
    // Provider + Model split fields (design D-4.2, APUX-14): either input's
    // change reads BOTH sibling fields from their shared .registry-cell and
    // joins them into the one string the overlay stores. `closest` is guarded
    // (absent/no-match in the test fake DOM) rather than assumed present.
    root.querySelectorAll('[data-action="registry-provider"], [data-action="registry-model"]').forEach((el) => {
      el.addEventListener("change", () => {
        const cell = typeof el.closest === "function" ? el.closest(".registry-cell") : null;
        const sibling = cell && cell.querySelectorAll
          ? cell.querySelectorAll('[data-action="' + (el.dataset.action === "registry-provider" ? "registry-model" : "registry-provider") + '"]')[0]
          : null;
        const providerVal = el.dataset.action === "registry-provider" ? el.value : (sibling ? sibling.value : "");
        const modelVal = el.dataset.action === "registry-model" ? el.value : (sibling ? sibling.value : "");
        handleRegistryCellEdit(ctx, el.dataset.profile, el.dataset.host, el.dataset.tier, "model", joinModelId(providerVal, modelVal));
      });
    });
    root.querySelectorAll('[data-action="registry-hostDefault"]').forEach((el) => {
      el.addEventListener("change", () => {
        handleRegistryHostDefaultEdit(ctx, el.dataset.host, el.value);
      });
    });
    root.querySelectorAll('[data-action="registry-agentTier"]').forEach((el) => {
      el.addEventListener("change", () => {
        handleRegistryAgentTierEdit(ctx, el.dataset.agent, el.dataset.host, el.value);
      });
    });
    root.querySelectorAll('[data-action="registry-workflowTier"]').forEach((el) => {
      el.addEventListener("change", () => {
        handleRegistryWorkflowTierEdit(ctx, el.dataset.workflow, el.value);
      });
    });
    // T7 (APUX-12, D-4.4): trigger buttons toggle the corresponding inline
    // form instead of invoking the prompt()-driven handler directly.
    root.querySelector('[data-action="registry-workflowTier-add"]')?.addEventListener("click", () => {
      handleRegistryFormToggle(ctx, "add-workflow");
    });
    root.querySelectorAll('[data-action="registry-workflowTier-remove"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        handleRegistryWorkflowTierRemove(ctx, btn.dataset.workflow);
      });
    });
    root.querySelector('[data-action="registry-add-profile"]')?.addEventListener("click", () => {
      handleRegistryFormToggle(ctx, "add-profile");
    });
    root.querySelector('[data-action="registry-duplicate-profile"]')?.addEventListener("click", () => {
      handleRegistryFormToggle(ctx, "duplicate-profile");
    });
    root.querySelector('[data-action="registry-delete-profile"]')?.addEventListener("click", () => {
      handleRegistryFormToggle(ctx, "delete-profile");
    });
    root.querySelector('[data-action="registry-form-cancel"]')?.addEventListener("click", () => {
      handleRegistryFormCancel(ctx);
    });
    root.querySelector('[data-action="registry-form-submit"]')?.addEventListener("click", () => {
      const kind = ctx.state.registryForm && ctx.state.registryForm.kind;
      if (kind === "add-workflow") {
        const workflow = root.querySelector('[data-action="registry-form-workflow"]')?.value;
        const tier = root.querySelector('[data-action="registry-form-tier"]')?.value;
        handleRegistryWorkflowTierAdd(ctx, workflow, tier);
      } else if (kind === "duplicate-profile") {
        const source = root.querySelector('[data-action="registry-form-source"]')?.value;
        const newName = root.querySelector('[data-action="registry-form-new-name"]')?.value;
        handleRegistryDuplicateProfile(ctx, source, newName);
      } else if (kind === "delete-profile") {
        const profile = root.querySelector('[data-action="registry-form-profile"]')?.value;
        handleRegistryDeleteProfile(ctx, profile);
      } else if (kind === "add-profile") {
        const name = root.querySelector('[data-action="registry-form-name"]')?.value;
        const description = root.querySelector('[data-action="registry-form-description"]')?.value;
        handleRegistryAddProfile(ctx, name, description);
      }
    });
    root.querySelectorAll('[data-action="registry-restore"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const profile = btn.dataset.profile;
        if (!profile) return;
        handleRegistryRestore(ctx, profile);
      });
    });
    root.querySelector('[data-action="registry-save-apply"]')?.addEventListener("click", () => {
      handleRegistrySaveAndApply(ctx);
    });
    root.querySelector('[data-action="registry-clear-overlay"]')?.addEventListener("click", () => {
      handleRegistryClearOverlay(ctx);
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
      if (res && res.data && res.data.jobId) {
        state.indexJobId = res.data.jobId;
        state.indexJobStatus = "pending";
        render();
      } else {
        render();
      }
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
    // Edge case (spec P1-Bulk): a project change while the bulk-delete
    // confirmation is open closes it without issuing a request — the typed
    // value belonged to the previous project.
    state.memoryBulkForm = null;
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

  // F2 fold: beforeunload guard when registry has unsaved changes.
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", (ev) => {
      // F4 fold: clear index poll on unload
      clearIndexPoll();
      if (state.registryDirty) {
        ev.preventDefault();
        ev.returnValue = "You have unsaved registry changes. Leave anyway?";
        return ev.returnValue;
      }
    });
  }

  // SSE: subscribe to /api/v1/events for real-time updates (Wave 7 T10)
  // T8: extend to track index_status for the tracked jobId (PRG-02) + poll fallback (PRG-03).
  function clearIndexPoll() {
    if (state.indexPollInterval) {
      clearInterval(state.indexPollInterval);
      state.indexPollInterval = null;
    }
  }

  function startIndexPoll(jobId) {
    clearIndexPoll();
    let polls = 0;
    const MAX_POLLS = 150; // 5 min at 2s interval
    state.indexPollInterval = setInterval(async () => {
      polls++;
      if (polls > MAX_POLLS) {
        state.indexJobStatus = "unknown";
        clearIndexPoll();
        if (state.view === "projects") render();
        return;
      }
      try {
        const res = await api.request("/api/v1/project/index/status/" + encodeURIComponent(jobId));
        if (res && res.data) {
          state.indexJobStatus = res.data.status || state.indexJobStatus;
          state.indexJobPhase = res.data.phase || state.indexJobPhase;
          state.indexJobFileCount = res.data.fileCount != null ? res.data.fileCount : state.indexJobFileCount;
          if (state.indexJobStatus === "completed" || state.indexJobStatus === "failed") {
            clearIndexPoll();
            if (state.view === "projects") render();
          }
        }
      } catch {
        // network error — keep polling until cap
      }
    }, 2000);
  }

  if (typeof EventSource !== "undefined") {
    try {
      const sseBase = opts.base || "";
      const es = new EventSource(sseBase + "/api/v1/events");
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          // PRG-02: update index progress when jobId matches
          if (data && (data.type === "index_status" || data.event === "index_status")) {
            const payload = data.payload || data;
            const ctxObj = { api, root, state, render, doc };
            if (handleIndexStatusEvent(ctxObj, payload)) {
              if (state.view === "projects") render();
            }
            return; // handled; don't double-render
          }
          // Refresh current view on observation events
          if (data && (data.type === "observation" || data.event === "observation")) {
            render();
          }
        } catch {
          // ignore parse errors
        }
      };
      es.onerror = () => {
        // PRG-03: start polling fallback when SSE errors + a job is tracked
        if (state.indexJobId && state.indexJobStatus !== "completed" && state.indexJobStatus !== "failed" && !state.indexPollInterval) {
          startIndexPoll(state.indexJobId);
        }
      };
    } catch {
      // EventSource unavailable — polling fallback starts when a job is tracked
    }
  }
  // PRG-03: if EventSource is unavailable and a job is tracked, poll immediately.
  // (startIndexPoll is called from handleProjectIndex when EventSource is absent.)
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
  collectConfigSectionFields,
  renderProfiles,
  renderModelRegistry,
  splitModelId,
  joinModelId,
  initTheme,
  toggleTheme,
  isWriteModeEnabled,
  createApiClient,
  readInjectedApiKey,
  startApp,
  showBanner,
  handleConfigSave,
  handleServerRestart,
  handleConfigReveal,
  handleMemoryDeleteProjectOpen,
  handleMemoryDeleteProjectCancel,
  handleMemoryDeleteProject,
  renderProfilesView,
  handleProfilesTabSwitch,
  handleProfileSwitch,
  initRegistryOverlay,
  mergeRegistryForDisplay,
  handleRegistryCellEdit,
  handleRegistryHostDefaultEdit,
  handleRegistryAgentTierEdit,
  handleRegistryWorkflowTierEdit,
  handleRegistryFormToggle,
  handleRegistryFormCancel,
  handleRegistryWorkflowTierAdd,
  handleRegistryWorkflowTierRemove,
  handleRegistryAddProfile,
  handleRegistryDuplicateProfile,
  handleRegistryDeleteProfile,
  handleRegistryRestore,
  handleRegistryClearOverlay,
  runRegenerateStream,
  handleRegistrySaveAndApply,
  handleProjectIndexProgress,
  handleIndexStatusEvent,
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
