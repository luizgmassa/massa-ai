/**
 * Proposal Routes (Phase 5 — auto-improvement loop, G7; T8 — portal CRUD).
 *
 * POST   /api/v1/proposal/list    - List pending proposals for a project
 * POST   /api/v1/proposal/approve - Approve a pending proposal (apply + flip + event)
 * POST   /api/v1/proposal/reject  - Reject a pending proposal (flip, no apply/event)
 * POST   /api/v1/proposal/create  - Create a pending proposal by hand
 * PATCH  /api/v1/proposal/:id     - Edit rationale/payload
 * DELETE /api/v1/proposal/:id     - Hard-delete a proposal row
 *
 * Returns 423 when auto-improve is disabled via config and 400 on missing
 * required fields. Canonical persistence failures flow to the global sanitized
 * error envelope; domain rejections surface as {ok:false, reason}.
 *
 * create/PATCH/DELETE (T8, HPC-02) use explicit status codes (400/404/200)
 * rather than the 200-carrying-{success:false} shape the three routes above
 * use — AC-02.6 mirrors AC-01.6/AC-01.7's real-404 requirement. `projectId`
 * scoping for PATCH/DELETE is a query parameter, never a body field: AC-02.4
 * requires the PATCH body to reject `projectId` by name.
 *
 * `ProposalStore` has no built-in projectId enforcement (unlike
 * `HandoffService`), so PATCH/DELETE fetch the row via `getById` first and
 * apply the not-found/project-mismatch check here, the same shape
 * `auto-improve-ops.ts`'s `approve`/`reject` already use.
 *
 * Per-kind payload validation (D4, `proposal-payload-validation.ts`) stays a
 * single table with two callers: the store's own `create`/`update` already
 * re-run it on write, and this route never re-derives a second copy — it only
 * validates `kind` itself (to avoid the validator throwing on an unknown key)
 * and maps the store's `ProposalPayloadValidationError` to a 400, matched with
 * `instanceof` against the class `@massa-ai/core` exports.
 */

import {
  getAutoImproveJob,
  getProposalStore,
  newProposalId,
  PROPOSAL_KINDS,
  ProposalPayloadValidationError,
  SearchServiceError,
  type ProposalKind,
  type ProposalPayload,
} from "@massa-ai/core";
import { config, logger } from "@massa-ai/shared";
import { Elysia, t } from "elysia";

let cachedJob: ReturnType<typeof getAutoImproveJob> | null = null;
function job() {
  if (!cachedJob) cachedJob = getAutoImproveJob();
  return cachedJob;
}

let cachedStore: ReturnType<typeof getProposalStore> | null = null;
function store() {
  if (!cachedStore) cachedStore = getProposalStore();
  return cachedStore;
}

function autoImproveDisabled(): boolean {
  try {
    return (config.get("memory") as any)?.autoImprove?.enabled === false;
  } catch {
    return false;
  }
}

const EVENT_DETAIL = {
  tags: ["proposals"],
};

/**
 * AC-02.4: allowlist, not denylist. Any body key outside this list —
 * including `kind`, `targetMemoryId`, `status`, `decidedAt`, `id`,
 * `projectId`, `createdAt`, and any field added to the model later — is
 * rejected by name. `kind`/`targetMemoryId` are immutable because
 * `applyProposal` branches its whole behaviour on them.
 */
const PROPOSAL_PATCH_ALLOWED_FIELDS = ["rationale", "payload"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProposalKind(value: unknown): value is ProposalKind {
  return typeof value === "string" && (PROPOSAL_KINDS as readonly string[]).includes(value);
}

/**
 * Maps the store's write-time payload rejection to its HTTP status
 * (AC-02.2/AC-02.3).
 *
 * This was briefly a duck-type check on `error.name === "Proposal…Error"`,
 * because the class was not on `@massa-ai/core`'s public surface. That form is
 * a string comparison standing in for a type check: a rename, a subclass, or a
 * minifier silently turns a 400 into a 500, and no test can see the difference
 * because both paths still return *an* error. The class is now exported and
 * `instanceof` is used instead.
 */
function proposalPayloadValidationStatus(error: unknown): number | null {
  return error instanceof ProposalPayloadValidationError ? error.statusCode : null;
}

export const proposalRoutes = new Elysia({ prefix: "/api/v1/proposal" })
  .post(
    "/list",
    async ({ body, set }) => {
      if (autoImproveDisabled()) {
        set.status = 423;
        return { status: 423, error: "auto-improve disabled" };
      }
      const b = body as { projectId?: string };
      if (!b.projectId || !String(b.projectId).trim()) {
        set.status = 400;
        return { status: 400, error: "projectId required" };
      }
      try {
        const pending = await job().listPending(b.projectId);
        set.status = 200;
        return {
          success: true,
          data: { pending, count: pending.length },
        };
      } catch (e) {
        if (e instanceof SearchServiceError) throw e;
        const err = e as Error;
        logger.error("proposal list failed", err);
        set.status = 500;
        return { success: false, error: `proposal list failed: ${err.message}` };
      }
    },
    {
      body: t.Object({
        projectId: t.String({ description: "Project identifier" }),
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "List pending auto-improvement proposals",
        description:
          "Lists pending proposals for a project, ordered newest-first. The surfacing primitive for the review-gate path.",
      },
    },
  )
  .post(
    "/approve",
    async ({ body, set }) => {
      if (autoImproveDisabled()) {
        set.status = 423;
        return { status: 423, error: "auto-improve disabled" };
      }
      const b = body as { id?: string; projectId?: string; source?: "llm" | "rule-based" };
      if (!b.id || !String(b.id).trim()) {
        set.status = 400;
        return { status: 400, error: "id required" };
      }
      try {
        const result = await job().approve(b.id, b.projectId, b.source ?? "rule-based");
        set.status = result.ok ? 200 : 400;
        return { success: result.ok, data: result };
      } catch (e) {
        if (e instanceof SearchServiceError) throw e;
        const err = e as Error;
        logger.error("proposal approve failed", err);
        set.status = 500;
        return { success: false, error: `proposal approve failed: ${err.message}` };
      }
    },
    {
      body: t.Object({
        id: t.String({ description: "Proposal id" }),
        projectId: t.Optional(t.String()),
        source: t.Optional(t.Union([t.Literal("llm"), t.Literal("rule-based")])),
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "Approve a pending proposal",
        description:
          "Applies the proposed memory edit, flips status pending→approved, emits memory:auto-improved. Missing/non-pending/project-mismatch/apply-failed → {ok:false, reason}.",
      },
    },
  )
  .post(
    "/reject",
    async ({ body, set }) => {
      if (autoImproveDisabled()) {
        set.status = 423;
        return { status: 423, error: "auto-improve disabled" };
      }
      const b = body as { id?: string; projectId?: string; reason?: string };
      if (!b.id || !String(b.id).trim()) {
        set.status = 400;
        return { status: 400, error: "id required" };
      }
      try {
        const result = await job().reject(b.id, b.projectId, b.reason);
        set.status = result.ok ? 200 : 400;
        return { success: result.ok, data: result };
      } catch (e) {
        if (e instanceof SearchServiceError) throw e;
        const err = e as Error;
        logger.error("proposal reject failed", err);
        set.status = 500;
        return { success: false, error: `proposal reject failed: ${err.message}` };
      }
    },
    {
      body: t.Object({
        id: t.String({ description: "Proposal id" }),
        projectId: t.Optional(t.String()),
        reason: t.Optional(t.String()),
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "Reject a pending proposal",
        description:
          "Flips status pending→rejected (no apply, no event). Same failure semantics as approve on missing/non-pending/project-mismatch.",
      },
    },
  )
  .post(
    "/create",
    async ({ body, set }) => {
      if (autoImproveDisabled()) {
        set.status = 423;
        return { status: 423, error: "auto-improve disabled" };
      }

      const raw = (body ?? {}) as Record<string, unknown>;

      if (typeof raw.projectId !== "string" || !raw.projectId.trim()) {
        set.status = 400;
        return { status: 400, error: "projectId required" };
      }
      if (!isProposalKind(raw.kind)) {
        set.status = 400;
        return { status: 400, error: `kind must be one of ${PROPOSAL_KINDS.join(", ")}` };
      }
      if (!isRecord(raw.payload)) {
        set.status = 400;
        return { status: 400, error: "payload must be an object" };
      }
      if (raw.rationale !== undefined && typeof raw.rationale !== "string") {
        set.status = 400;
        return { status: 400, error: "rationale must be a string" };
      }
      if (
        raw.targetMemoryId !== undefined &&
        raw.targetMemoryId !== null &&
        typeof raw.targetMemoryId !== "string"
      ) {
        set.status = 400;
        return { status: 400, error: "targetMemoryId must be a string or null" };
      }

      const projectId = raw.projectId;
      const kind = raw.kind;
      const payload = raw.payload;

      try {
        const record = await store().create({
          id: newProposalId(),
          projectId,
          kind,
          payload: payload as unknown as ProposalPayload,
          rationale: raw.rationale as string | undefined,
          targetMemoryId: raw.targetMemoryId as string | null | undefined,
        });
        set.status = 200;
        return { success: true, data: record };
      } catch (e) {
        if (e instanceof SearchServiceError) throw e;
        const validationStatus = proposalPayloadValidationStatus(e);
        if (validationStatus !== null) {
          set.status = validationStatus;
          return { status: validationStatus, error: (e as Error).message };
        }
        const err = e as Error;
        logger.error("proposal create failed", err);
        set.status = 500;
        return { success: false, error: `proposal create failed: ${err.message}` };
      }
    },
    {
      body: t.Record(t.String(), t.Unknown(), {
        description:
          "projectId, kind (memory.create|memory.update|memory.tag), payload, rationale?, targetMemoryId?",
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "Create a pending proposal",
        description:
          "kind must be memory.create/memory.update/memory.tag; payload is validated against the same per-kind " +
          "rules the store enforces on read (AC-02.2), so a write the reader would reject is refused here instead.",
      },
    },
  )
  .patch(
    "/:id",
    async ({ params, query, body, set }) => {
      if (autoImproveDisabled()) {
        set.status = 423;
        return { status: 423, error: "auto-improve disabled" };
      }

      const raw = (body ?? {}) as Record<string, unknown>;
      const keys = Object.keys(raw);
      const rejected = keys.filter(
        (k) => !(PROPOSAL_PATCH_ALLOWED_FIELDS as readonly string[]).includes(k),
      );
      if (rejected.length > 0) {
        set.status = 400;
        return { status: 400, error: `field not allowed: ${rejected.join(", ")}` };
      }

      const patch: { rationale?: string; payload?: Record<string, unknown> } = {};

      if ("rationale" in raw) {
        if (typeof raw.rationale !== "string") {
          set.status = 400;
          return { status: 400, error: "rationale must be a string" };
        }
        patch.rationale = raw.rationale;
      }
      if ("payload" in raw) {
        if (!isRecord(raw.payload)) {
          set.status = 400;
          return { status: 400, error: "payload must be an object" };
        }
        patch.payload = raw.payload;
      }

      if (Object.keys(patch).length === 0) {
        set.status = 400;
        return { status: 400, error: "no editable field provided" };
      }

      try {
        const current = await store().getById(params.id);
        if (!current) {
          set.status = 404;
          return { status: 404, error: "not-found" };
        }
        if (query.projectId && current.projectId !== query.projectId) {
          set.status = 404;
          return { status: 404, error: "project-mismatch" };
        }

        const updated = await store().update(params.id, {
          ...(patch.rationale !== undefined ? { rationale: patch.rationale } : {}),
          ...(patch.payload !== undefined
            ? { payload: patch.payload as unknown as ProposalPayload }
            : {}),
        });
        if (!updated) {
          set.status = 404;
          return { status: 404, error: "not-found" };
        }
        set.status = 200;
        return { success: true, data: updated };
      } catch (e) {
        if (e instanceof SearchServiceError) throw e;
        const validationStatus = proposalPayloadValidationStatus(e);
        if (validationStatus !== null) {
          set.status = validationStatus;
          return { status: validationStatus, error: (e as Error).message };
        }
        const err = e as Error;
        logger.error("proposal update failed", err);
        set.status = 500;
        return { success: false, error: `proposal update failed: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String({ description: "Proposal id" }) }),
      query: t.Object({
        projectId: t.Optional(
          t.String({ description: "If supplied, must match the row's projectId or the request 404s" }),
        ),
      }),
      body: t.Record(t.String(), t.Unknown(), {
        description: "Only rationale/payload are accepted; any other key is a 400 naming it.",
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "Edit a proposal (rationale/payload only)",
        description:
          "Allowlist PATCH: kind/targetMemoryId/status/decidedAt/id/projectId/createdAt and any unknown key are " +
          "rejected by name with 400. A payload edit re-validates against the row's existing kind (AC-02.3/AC-02.4).",
      },
    },
  )
  .delete(
    "/:id",
    async ({ params, query, set }) => {
      if (autoImproveDisabled()) {
        set.status = 423;
        return { status: 423, error: "auto-improve disabled" };
      }
      try {
        const current = await store().getById(params.id);
        if (!current) {
          set.status = 404;
          return { status: 404, error: "not-found" };
        }
        if (query.projectId && current.projectId !== query.projectId) {
          set.status = 404;
          return { status: 404, error: "project-mismatch" };
        }

        const deletedId = await store().delete(params.id);
        if (!deletedId) {
          set.status = 404;
          return { status: 404, error: "not-found" };
        }
        set.status = 200;
        return {
          success: true,
          data: {
            id: deletedId,
            ...(current.status === "approved"
              ? { note: "approved proposal's applied memory edit was not reversed" }
              : {}),
          },
        };
      } catch (e) {
        if (e instanceof SearchServiceError) throw e;
        const err = e as Error;
        logger.error("proposal delete failed", err);
        set.status = 500;
        return { success: false, error: `proposal delete failed: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String({ description: "Proposal id" }) }),
      query: t.Object({
        projectId: t.Optional(
          t.String({ description: "If supplied, must match the row's projectId or the request 404s" }),
        ),
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "Hard-delete a proposal",
        description:
          "Permitted in any status. Deleting an already-approved proposal does not reverse the memory edit it " +
          "already applied (AC-02.5) — the response says so explicitly via a `note` field.",
      },
    },
  );
