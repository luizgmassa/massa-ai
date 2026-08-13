/**
 * Proposals tab — pending auto-improvement proposals, plus approve/reject.
 */

import { escapeHtml, errorBlock } from "../lib/html.js";
import { markdownToHtml } from "../lib/markdown.js";
import { isWriteModeEnabled } from "../lib/api-client.js";

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

export function renderProposals(
  data: ProposalsResponse | null | undefined,
  state?: ProposalsState | null,
): string {
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
  const payload = data.data || (data as unknown as ProposalsPayload);
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

interface ProposalCtx {
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
