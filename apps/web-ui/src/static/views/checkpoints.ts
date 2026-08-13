/**
 * Checkpoints tab — saved task snapshots, plus create/edit/delete.
 */

import { escapeHtml, errorBlock } from "../lib/html.js";
import { isWriteModeEnabled } from "../lib/api-client.js";
import { collectFormData } from "../lib/forms.js";

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

interface CheckpointRow {
  id?: string;
  checkpointId?: string;
  taskId?: string;
  status?: string;
  description?: string;
  type?: string;
  checkpointType?: string;
  progressPercent?: number;
  currentStep?: string;
  totalSteps?: number;
  completedSteps?: number;
}

interface CheckpointsResponse {
  success?: boolean;
  data?: unknown;
  error?: unknown;
}

export function renderCheckpoints(data: CheckpointsResponse | null | undefined): string {
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
/**
 * Normalize the ListCheckpointsTool response shape into a flat row list.
 *
 * Returns `null` — not `[]` — when the payload carries no recognizable row
 * container. A TOON-formatted response (`format` omitted, so the route falls
 * back to its "toon" default) puts a *string* here; collapsing that to `[]`
 * renders "No checkpoints" and hides the real failure.
 */
export function extractCheckpointRows(data: CheckpointsResponse): CheckpointRow[] | null {
  const payload: unknown = data && (data.data || data);
  if (Array.isArray((payload as { checkpoints?: unknown } | undefined)?.checkpoints)) {
    return (payload as { checkpoints: CheckpointRow[] }).checkpoints;
  }
  if (Array.isArray((payload as { data?: unknown } | undefined)?.data)) {
    return (payload as { data: CheckpointRow[] }).data;
  }
  if (Array.isArray(payload)) return payload as CheckpointRow[];
  if (payload && typeof payload === "object") return [];
  return null;
}

/** The subset of an input element `collectFormData` reads, and the DOM root
 *  shape it needs — structurally identical to `lib/forms.ts`'s own unexported
 *  parameter types, so `ctx.root` can be passed through without a cast. */
interface CheckpointFormRoot {
  querySelectorAll(selectors: string): {
    forEach(
      cb: (el: { dataset: { create?: string; [key: string]: string | undefined }; type: string; checked?: boolean; value: string }) => void,
    ): void;
  };
}

interface CheckpointCtx {
  root: CheckpointFormRoot;
  api: { request: (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown> };
  render: () => void;
}

/** Submits the Create Checkpoint form. The numeric fields are forwarded only
 *  when present, so an untouched field stays absent rather than becoming 0. */
export async function handleCheckpointCreate(ctx: CheckpointCtx): Promise<void> {
  const data = collectFormData(ctx.root, "checkpoint-create");
  if (!data.taskId) { alert("Task ID is required."); return; }
  if (!data.description) { alert("Description is required."); return; }
  const body: Record<string, unknown> = {
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
    await ctx.api.request("/api/v1/checkpoints/create", { method: "POST", body });
    ctx.render();
  } catch (e) {
    alert("Create failed: " + String((e as { message?: unknown }).message || e));
  }
}

/** Deletes one checkpoint. The confirm() lives at the wiring site. */
export async function handleCheckpointDelete(ctx: CheckpointCtx, id: string): Promise<void> {
  try {
    await ctx.api.request("/api/v1/checkpoints/delete", { method: "POST", body: { id } });
    ctx.render();
  } catch (e) {
    alert("Delete failed: " + String((e as { message?: unknown }).message || e));
  }
}
