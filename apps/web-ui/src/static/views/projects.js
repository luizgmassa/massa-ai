/**
 * Projects tab — the indexed-workspace list, the Index Project form, and the
 * index-job progress line.
 *
 * The job-progress handlers live here rather than with the shell because they
 * are the tab's own state machine: an SSE `index_status` frame, a polling
 * fallback when SSE dies, and the terminal transition that stops both.
 */

import { escapeHtml } from "../lib/html.js";
import { isWriteModeEnabled } from "../lib/api-client.js";
import { collectFormData } from "../lib/forms.js";

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

/** Submits the Index Project form. On a queued job the returned `jobId` becomes
 *  the tracked job, and the progress line appears on the next render. */
export async function handleProjectIndex(ctx) {
  const data = collectFormData(ctx.root, "project-index");
  if (!data.projectPath) { alert("Project path is required."); return; }
  const body = { projectPath: data.projectPath };
  if (data.projectId) body.projectId = data.projectId;
  if (data.forceReindex) body.forceReindex = true;
  if (data.warmCache) body.warmCache = true;
  try {
    const res = await ctx.api.request("/api/v1/project/index", { method: "POST", body });
    if (res && res.data && res.data.jobId) {
      ctx.state.indexJobId = res.data.jobId;
      ctx.state.indexJobStatus = "pending";
      ctx.render();
    } else {
      ctx.render();
    }
  } catch (e) {
    alert("Index failed: " + String(e.message || e));
  }
}

/** Full project delete — vectors, symbols and memories. The confirm() lives at
 *  the wiring site, not here, so a direct caller is never silently gated. */
export async function handleProjectReset(ctx, project) {
  try {
    await ctx.api.request("/api/v1/project/reset", {
      method: "POST",
      body: { projectId: project, clearVectors: true, clearSymbols: true, clearMemories: true },
    });
    ctx.render();
  } catch (e) {
    alert("Reset failed: " + String(e.message || e));
  }
}

/** Stops the index-status poll. Safe to call when no poll is running, which is
 *  why every teardown path can call it unconditionally. */
export function clearIndexPoll(ctx) {
  if (ctx.state.indexPollInterval) {
    clearInterval(ctx.state.indexPollInterval);
    ctx.state.indexPollInterval = null;
  }
}

/** PRG-03 polling fallback, started when the SSE stream errors while a job is
 *  still being tracked. Capped at 150 polls (5 min at 2 s) so a job that never
 *  reports a terminal status cannot leave an interval running forever. */
export function startIndexPoll(ctx, jobId) {
  clearIndexPoll(ctx);
  let polls = 0;
  const MAX_POLLS = 150; // 5 min at 2s interval
  ctx.state.indexPollInterval = setInterval(async () => {
    polls++;
    if (polls > MAX_POLLS) {
      ctx.state.indexJobStatus = "unknown";
      clearIndexPoll(ctx);
      if (ctx.state.view === "projects") ctx.render();
      return;
    }
    try {
      const res = await ctx.api.request("/api/v1/project/index/status/" + encodeURIComponent(jobId));
      if (res && res.data) {
        ctx.state.indexJobStatus = res.data.status || ctx.state.indexJobStatus;
        ctx.state.indexJobPhase = res.data.phase || ctx.state.indexJobPhase;
        ctx.state.indexJobFileCount = res.data.fileCount != null ? res.data.fileCount : ctx.state.indexJobFileCount;
        if (ctx.state.indexJobStatus === "completed" || ctx.state.indexJobStatus === "failed") {
          clearIndexPoll(ctx);
          if (ctx.state.view === "projects") ctx.render();
        }
      }
    } catch {
      // network error — keep polling until cap
    }
  }, 2000);
}
