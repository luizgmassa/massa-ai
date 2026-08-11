/**
 * Memory tab — the filtered memory browser, the create form, per-row edit and
 * delete, and the retype-to-confirm bulk delete.
 */

import { escapeHtml, truncate, errorBlock } from "../lib/html.js";
import { markdownToHtml } from "../lib/markdown.js";
import { isWriteModeEnabled } from "../lib/api-client.js";
import { showBanner } from "../lib/banner.js";
import { collectFormData } from "../lib/forms.js";

export const MEMORY_TYPES = ["critical", "conversation", "code", "decision", "pattern"];

export const MEMORY_LEVELS = [
  { value: 1, label: "1 — Project" },
  { value: 2, label: "2 — User" },
  { value: 3, label: "3 — Session" },
];

/** Renders the bulk-delete control for the Memory tab (design "1. Memory bulk
 *  delete (MBD)", spec P1-Bulk ACs 1-4). Gated on write mode + a selected
 *  project (MBD-01); the inline confirmation form appears only when
 *  `state.memoryBulkForm` is open (MBD-02) — shape `null | { error?: string }`,
 *  mirroring `state.registryForm`'s open/closed convention. The confirm value
 *  is read from `[data-bulk="confirm-id"]` at submit time (T2), never from
 *  `btn.dataset` — the fake-DOM harness's synthetic clicks carry an empty
 *  dataset. */
export function renderMemoryBulkDelete(state) {
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
    // Pre-mortem #6: `deleteByProject` deletes on the CANONICAL project id with
    // no `deleted_at` predicate, while this tab's list filters
    // `deleted_at IS NULL` and matches the id literally. The reported count can
    // therefore legitimately exceed the rows on screen — saying so here makes
    // that a specified outcome instead of something that reads as a bug.
    const scopeNote =
      '<p class="muted bulk-delete-scope">Permanently deletes every memory for ' +
      escapeHtml(project) +
      ", including already-deleted rows still held as tombstones — so the reported " +
      "count may exceed the rows listed above. Vectors, keyword rows and the symbol " +
      "graph are left untouched. This cannot be undone.</p>";
    form =
      '<div class="bulk-delete-inline-form form-field">' +
      errorLine +
      scopeNote +
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

/** Per-row edit. Still a prompt(): the Memory tab's inline-form conversion is
 *  scoped to the Models catalog (P2-D), and registry-editor.test.ts asserts this
 *  literal survives precisely to prove that sensor is span-scoped rather than a
 *  whole-file scan. */
export async function handleMemoryEdit(ctx, id) {
  const newContent = prompt("Edit memory content:", "");
  if (newContent === null) return;
  try {
    await ctx.api.request("/api/v1/memory/" + encodeURIComponent(id), {
      method: "PUT",
      body: { content: newContent },
    });
    ctx.render();
  } catch (e) {
    alert("Edit failed: " + String(e.message || e));
  }
}

/** Single-memory delete. The confirm() lives at the wiring site. */
export async function handleMemoryDelete(ctx, id) {
  try {
    await ctx.api.request("/api/v1/memory/" + encodeURIComponent(id), {
      method: "DELETE",
    });
    ctx.render();
  } catch (e) {
    alert("Delete failed: " + String(e.message || e));
  }
}

/** Submits the Create Memory form. Importance is range-checked client-side so
 *  an out-of-range value is refused before it reaches the route. */
export async function handleMemoryCreate(ctx) {
  const data = collectFormData(ctx.root, "memory-create");
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
    await ctx.api.request("/api/v1/memory/store", { method: "POST", body });
    ctx.render();
  } catch (e) {
    alert("Create failed: " + String(e.message || e));
  }
}
