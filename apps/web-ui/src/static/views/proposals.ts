/**
 * Proposals tab — pending auto-improvement proposals, plus create/approve/
 * reject/edit/delete (T13, HPC-02).
 */

import { escapeHtml, errorBlock } from "../lib/html.js";
import { markdownToHtml } from "../lib/markdown.js";
import { isWriteModeEnabled } from "../lib/api-client.js";
import { collectFormData } from "../lib/forms.js";

interface ProposalsState {
  project?: string;
}

interface Proposal {
  id?: string;
  type?: string;
  status?: string;
  description?: string;
  summary?: string;
}

interface ProposalsPayload {
  pending?: Proposal[];
  proposals?: Proposal[];
}

interface ProposalsResponse {
  success?: boolean;
  data?: ProposalsPayload;
}

/** AC-02.1/AC-02.2: the exact three `kind` values
 *  `POST /api/v1/proposal/create` (`apps/tools-api/src/routes/proposals.ts`)
 *  accepts. Not imported from `@massa-ai/core` — `apps/web-ui`'s
 *  `package.json` declares no dependency on it, the same constraint
 *  `route-contract.test.ts` documents for why the URL contract sensor is a
 *  text scan rather than an import. This is a small, deliberate duplicate
 *  kept in sync by hand. */
export const PROPOSAL_KINDS = ["memory.create", "memory.update", "memory.tag"] as const;

type ProposalKind = (typeof PROPOSAL_KINDS)[number];

function isValidProposalKind(value: unknown): value is ProposalKind {
  return typeof value === "string" && (PROPOSAL_KINDS as readonly string[]).includes(value);
}

export function renderProposals(
  data: ProposalsResponse | null | undefined,
  state?: ProposalsState | null,
): string {
  state = state || {};
  const project = state.project || "";
  const writeMode = isWriteModeEnabled();
  if (!project) {
    return (
      '<section class="view"><h2>Proposals</h2>' +
      '<p class="muted">Select a project to list pending auto-improvement proposals.</p></section>'
    );
  }
  if (!data || data.success === false) {
    return '<section class="view"><h2>Proposals</h2>' + errorBlock(data) + "</section>";
  }
  const payload = data.data || (data as unknown as ProposalsPayload);
  // The route returns `pending` (see apps/tools-api/src/routes/proposals.ts);
  // `proposals` is accepted only as a legacy alias.
  const proposals = (payload && (payload.pending || payload.proposals)) || [];

  const createForm = writeMode
    ? '<div class="create-form">' +
      "<h3>Create Proposal</h3>" +
      '<div class="form-field"><label>projectId</label><input type="text" data-create="projectId" data-form="proposal-create" value="' + escapeHtml(project) + '" /></div>' +
      '<div class="form-field"><label>kind</label><select data-create="kind" data-form="proposal-create"><option value="">-- select --</option>' +
      PROPOSAL_KINDS.map((k) => '<option value="' + k + '">' + k + "</option>").join("") +
      "</select></div>" +
      '<div class="form-field"><label>payload (JSON)</label><textarea data-create="payload" data-form="proposal-create"></textarea></div>' +
      '<div class="form-field"><label>rationale (optional)</label><input type="text" data-create="rationale" data-form="proposal-create" /></div>' +
      '<div class="form-field"><label>targetMemoryId (optional)</label><input type="text" data-create="targetMemoryId" data-form="proposal-create" /></div>' +
      '<button type="button" data-action="proposal-create">Create</button>' +
      "</div>"
    : "";

  if (proposals.length === 0 && !writeMode) {
    return '<section class="view"><h2>Proposals</h2><p class="empty">No pending proposals.</p></section>';
  }
  const rows = proposals
    .map((p) => {
      const id = escapeHtml(p.id || "");
      const actions = writeMode
        ? '<div class="actions-cell">' +
          '<button type="button" class="btn-approve" data-action="proposal-approve" data-id="' + id + '">approve</button> ' +
          '<button type="button" class="btn-reject" data-action="proposal-reject" data-id="' + id + '">reject</button> ' +
          '<button type="button" class="btn-edit" data-action="proposal-edit" data-id="' + id + '">edit</button> ' +
          '<button type="button" class="btn-delete" data-action="proposal-delete" data-id="' + id + '">delete</button>' +
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
  return '<section class="view"><h2>Proposals</h2>' + rows + createForm + "</section>";
}

/** Structurally identical to `collectFormData`'s own (unexported) `FormDataRoot`
 *  parameter type, so `ctx.root` can be passed through without a cast. */
interface ProposalFormRoot {
  querySelectorAll(selectors: string): {
    forEach(
      cb: (el: { dataset: { create?: string; [key: string]: string | undefined }; type: string; checked?: boolean; value: string }) => void,
    ): void;
  };
}

interface ProposalCtx {
  root: ProposalFormRoot;
  api: { request: (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown> };
  render: () => void;
}

/** approve | reject — the action is the path segment. */
export async function handleProposalAction(ctx: ProposalCtx, id: string, action: string): Promise<void> {
  try {
    await ctx.api.request("/api/v1/proposal/" + action, {
      method: "POST",
      body: { id },
    });
    ctx.render();
  } catch (e) {
    alert(action + " failed: " + String((e as { message?: unknown }).message || e));
  }
}

/** Shape common to every proposal mutation route (`create`, `PATCH /:id`,
 *  `DELETE /:id`). Route failures — including the write-mode gate's 403
 *  (`{success:false, error:"Write refused: read-only mode is active"}`) and
 *  the route's own 400/404 domain rejections (`{status, error}`, no
 *  `success` key at all) — always carry `error`; a genuine success never
 *  does. `api.request()` resolves the parsed JSON body regardless of HTTP
 *  status (it only throws on a transport failure), so checking `res.error`
 *  is what turns a 403/400/404 into a visible message instead of a request
 *  that silently did nothing. Mirrors `HandoffMutationResponse`
 *  (`views/handoffs.ts`). */
interface ProposalMutationResponse {
  success?: boolean;
  error?: string;
  data?: unknown;
}

/** Submits the Create Proposal form (AC-02.1). `kind` is validated
 *  client-side against the exact three values the route accepts
 *  (AC-02.2) — the route itself 400s on anything else, but failing fast here
 *  means an invalid submission never reaches the network. `payload` is
 *  user-typed JSON, parsed the same way `buildConfigSectionBody`'s
 *  `json`-typed field parses `capturePolicy.rules` (`views/config.ts`):
 *  thrown, not coerced, on invalid JSON. */
export async function handleProposalCreate(ctx: ProposalCtx): Promise<void> {
  const data = collectFormData(ctx.root, "proposal-create");
  if (!data.projectId) { alert("Project ID is required."); return; }
  if (!isValidProposalKind(data.kind)) {
    alert("kind must be one of " + PROPOSAL_KINDS.join(", "));
    return;
  }
  const payloadText = typeof data.payload === "string" ? data.payload.trim() : "";
  if (!payloadText) { alert("Payload is required."); return; }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadText);
  } catch (e) {
    alert("Payload is not valid JSON: " + String((e as { message?: unknown }).message || e));
    return;
  }
  const body: Record<string, unknown> = { projectId: data.projectId, kind: data.kind, payload };
  if (data.rationale) body.rationale = data.rationale;
  if (data.targetMemoryId) body.targetMemoryId = data.targetMemoryId;
  try {
    const res = (await ctx.api.request("/api/v1/proposal/create", {
      method: "POST",
      body,
    })) as ProposalMutationResponse | null | undefined;
    if (res && res.error) {
      alert("Create failed: " + String(res.error));
      return;
    }
    ctx.render();
  } catch (e) {
    alert("Create failed: " + String((e as { message?: unknown }).message || e));
  }
}

/** Per-row edit (AC-02.3/AC-02.4, HPC-02). Not confirm-gated — only
 *  irreversible actions are (design.md §D5). Only `rationale` is offered
 *  here: the PATCH route also allows `payload`, but this keeps the prompt()
 *  flow to one field, mirroring `handleHandoffEdit`'s single-field shape
 *  (`views/handoffs.ts`). `null` from `prompt()` (Cancel) aborts before any
 *  request; the body sent is never more than `{ rationale }`, so it can
 *  never carry a rejected field like `kind` or `status` (AC-02.4). */
export async function handleProposalEdit(ctx: ProposalCtx, id: string): Promise<void> {
  const newRationale = prompt("Edit proposal rationale:", "");
  if (newRationale === null) return;
  try {
    const res = (await ctx.api.request("/api/v1/proposal/" + encodeURIComponent(id), {
      method: "PATCH",
      body: { rationale: newRationale },
    })) as ProposalMutationResponse | null | undefined;
    if (res && res.error) {
      alert("Edit failed: " + String(res.error));
      return;
    }
    ctx.render();
  } catch (e) {
    alert("Edit failed: " + String((e as { message?: unknown }).message || e));
  }
}

/** Single-proposal delete. The confirm() lives at the wiring site
 *  (`wire-view-handlers.ts`), not here — see that file's docblock. */
export async function handleProposalDelete(ctx: ProposalCtx, id: string): Promise<void> {
  try {
    const res = (await ctx.api.request("/api/v1/proposal/" + encodeURIComponent(id), {
      method: "DELETE",
    })) as ProposalMutationResponse | null | undefined;
    if (res && res.error) {
      alert("Delete failed: " + String(res.error));
      return;
    }
    ctx.render();
  } catch (e) {
    alert("Delete failed: " + String((e as { message?: unknown }).message || e));
  }
}
