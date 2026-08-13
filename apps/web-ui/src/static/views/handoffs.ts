/**
 * Handoffs tab — pending cross-session handoffs, plus create/accept/cancel.
 */

import { escapeHtml, errorBlock } from "../lib/html.js";
import { markdownToHtml } from "../lib/markdown.js";
import { isWriteModeEnabled } from "../lib/api-client.js";
import { collectFormData } from "../lib/forms.js";

interface HandoffsState {
  project?: string;
}

interface Handoff {
  id?: string;
  targetAgent?: string;
  status?: string;
  summary?: string;
}

interface HandoffsPayload {
  pending?: Handoff[];
}

interface HandoffsResponse {
  success?: boolean;
  data?: HandoffsPayload;
}

export function renderHandoffs(
  data: HandoffsResponse | null | undefined,
  state?: HandoffsState | null,
): string {
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
  const payload = data.data || (data as unknown as HandoffsPayload);
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
          '<button type="button" class="btn-delete" data-action="handoff-cancel" data-id="' + id + '">cancel</button> ' +
          '<button type="button" class="btn-edit" data-action="handoff-edit" data-id="' + id + '">edit</button> ' +
          '<button type="button" class="btn-delete" data-action="handoff-delete" data-id="' + id + '">delete</button>' +
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

/** Structurally identical to `collectFormData`'s own (unexported) `FormDataRoot`
 *  parameter type, so `ctx.root` can be passed through without a cast. */
interface HandoffFormRoot {
  querySelectorAll(selectors: string): {
    forEach(
      cb: (el: { dataset: { create?: string; [key: string]: string | undefined }; type: string; checked?: boolean; value: string }) => void,
    ): void;
  };
}

interface HandoffCtx {
  root: HandoffFormRoot;
  api: { request: (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown> };
  render: () => void;
}

/** Submits the Create Handoff form. projectId and summary are the route's two
 *  required fields; the three list fields are comma-split and blank-filtered. */
export async function handleHandoffCreate(ctx: HandoffCtx): Promise<void> {
  const data = collectFormData(ctx.root, "handoff-create");
  if (!data.projectId) { alert("Project ID is required."); return; }
  if (!data.summary) { alert("Summary is required."); return; }
  const body: Record<string, unknown> = { projectId: data.projectId, summary: data.summary };
  if (data.targetAgent) body.targetAgent = data.targetAgent;
  if (data.openQuestions) body.openQuestions = String(data.openQuestions).split(",").map((s) => s.trim()).filter(Boolean);
  if (data.nextSteps) body.nextSteps = String(data.nextSteps).split(",").map((s) => s.trim()).filter(Boolean);
  if (data.files) body.files = String(data.files).split(",").map((s) => s.trim()).filter(Boolean);
  try {
    await ctx.api.request("/api/v1/handoff/begin", { method: "POST", body });
    ctx.render();
  } catch (e) {
    alert("Create failed: " + String((e as { message?: unknown }).message || e));
  }
}

/** accept | cancel — the action is the path segment. */
export async function handleHandoffAction(ctx: HandoffCtx, id: string, action: string): Promise<void> {
  try {
    await ctx.api.request("/api/v1/handoff/" + action, { method: "POST", body: { id } });
    ctx.render();
  } catch (e) {
    alert(action + " failed: " + String((e as { message?: unknown }).message || e));
  }
}

/** Shape common to both `PATCH /api/v1/handoff/:id` and `DELETE
 *  /api/v1/handoff/:id`. Route failures — including the write-mode gate's
 *  403 (`{success:false, error:"Write refused: read-only mode is active"}`)
 *  and the route's own 400/404 domain rejections (`{status, error}`, no
 *  `success` key at all) — always carry `error`; a genuine success never
 *  does. `api.request()` resolves the parsed JSON body regardless of HTTP
 *  status (it only throws on a transport failure), so checking `res.error`
 *  is what turns a 403/400/404 into a visible message instead of a request
 *  that silently did nothing. */
interface HandoffMutationResponse {
  success?: boolean;
  error?: string;
  data?: unknown;
}

/** Per-row edit (AC-01.1/.2, HPC-01, spec Edge Cases). Not confirm-gated —
 *  only irreversible actions are (design.md §D5). Only `summary` is offered
 *  here: the PATCH route allows `targetAgent`/`openQuestions`/`nextSteps`/
 *  `files` too, but this keeps the prompt() flow to one field, mirroring
 *  `handleMemoryEdit`'s single-field shape. `null` from `prompt()` (Cancel)
 *  aborts before any request; every other field is left untouched by
 *  omitting it from the PATCH body (AC-01.1), so the body sent is never
 *  more than `{ summary }` and can never carry a rejected field like
 *  `status` (AC-01.2). */
export async function handleHandoffEdit(ctx: HandoffCtx, id: string): Promise<void> {
  const newSummary = prompt("Edit handoff summary:", "");
  if (newSummary === null) return;
  try {
    const res = (await ctx.api.request("/api/v1/handoff/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { summary: newSummary },
    })) as HandoffMutationResponse | null | undefined;
    if (res && res.error) {
      alert("Edit failed: " + String(res.error));
      return;
    }
    ctx.render();
  } catch (e) {
    alert("Edit failed: " + String((e as { message?: unknown }).message || e));
  }
}

/** Single-handoff delete. The confirm() lives at the wiring site
 *  (`wire-view-handlers.ts`), not here — see that file's docblock. */
export async function handleHandoffDelete(ctx: HandoffCtx, id: string): Promise<void> {
  try {
    const res = (await ctx.api.request("/api/v1/handoff/" + encodeURIComponent(id), {
      method: "DELETE",
    })) as HandoffMutationResponse | null | undefined;
    if (res && res.error) {
      alert("Delete failed: " + String(res.error));
      return;
    }
    ctx.render();
  } catch (e) {
    alert("Delete failed: " + String((e as { message?: unknown }).message || e));
  }
}
