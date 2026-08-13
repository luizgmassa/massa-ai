/**
 * Handoff Routes (Phase 6 — cross-session handoffs, G2; T7 — portal CRUD).
 *
 * POST   /api/v1/handoff/begin  - Begin a handoff (open row + dual-write memory)
 * POST   /api/v1/handoff/accept - Accept an open handoff (open→accepted + event)
 * POST   /api/v1/handoff/cancel - Cancel an open handoff (open→expired)
 * POST   /api/v1/handoff/list   - List pending (open) handoffs
 * PATCH  /api/v1/handoff/:id    - Edit targetAgent/summary/openQuestions/nextSteps/files
 * DELETE /api/v1/handoff/:id    - Hard-delete a handoff row
 *
 * Returns 423 when handoffs is disabled via config and 400 on missing required
 * fields. Canonical store failures flow to the global sanitized error envelope;
 * domain rejections surface as {ok:false, reason}.
 *
 * PATCH/DELETE (T7, HPC-01) use explicit status codes (400/404/200) rather
 * than the 200-carrying-{success:false} shape the other four routes above
 * use — AC-01.6/AC-01.7 specifically require a real 404, not a 200 body.
 * `projectId` scoping for PATCH/DELETE is a query parameter, never a body
 * field: AC-01.2 requires the PATCH body to reject `projectId` by name.
 */

import { getHandoffService, SearchServiceError } from "@massa-ai/core";
import { config, logger } from "@massa-ai/shared";
import { Elysia, t } from "elysia";

let cachedService: ReturnType<typeof getHandoffService> | null = null;
function service() {
  if (!cachedService) cachedService = getHandoffService();
  return cachedService;
}

function handoffsDisabled(): boolean {
  try {
    return (config.get("handoffs") as any)?.enabled === false;
  } catch {
    return false;
  }
}

/** Preserve canonical storage failures for the global HTTP/MCP envelope. */
export function rethrowCanonicalHandoffError(error: unknown): void {
  if (error instanceof SearchServiceError) throw error;
}

const EVENT_DETAIL = {
  tags: ["handoffs"],
};

/**
 * AC-01.2: allowlist, not denylist. Any body key outside this list —
 * including `status`, `acceptedAt`, `id`, `projectId`, `createdAt`,
 * `sourceSessionId`, and any field added to the model later — is rejected
 * by name. `status`/`acceptedAt` stay exclusively `setStatus`'s (AC-01.3).
 */
const HANDOFF_PATCH_ALLOWED_FIELDS = [
  "targetAgent",
  "summary",
  "openQuestions",
  "nextSteps",
  "files",
] as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export const handoffRoutes = new Elysia({ prefix: "/api/v1/handoff" })
  .post(
    "/begin",
    async ({ body, set }) => {
      if (handoffsDisabled()) {
        set.status = 423;
        return { status: 423, error: "handoffs disabled" };
      }
      const b = body as {
        projectId?: string;
        sourceSessionId?: string;
        targetAgent?: string;
        summary?: string;
        openQuestions?: string[];
        nextSteps?: string[];
        files?: string[];
      };
      if (!b.projectId || !String(b.projectId).trim()) {
        set.status = 400;
        return { status: 400, error: "projectId required" };
      }
      try {
        const result = await service().begin({
          projectId: b.projectId,
          sourceSessionId: b.sourceSessionId,
          targetAgent: b.targetAgent,
          summary: b.summary,
          openQuestions: b.openQuestions,
          nextSteps: b.nextSteps,
          files: b.files,
        });
        set.status = result.ok ? 200 : 400;
        return { success: result.ok, data: result };
      } catch (e) {
        rethrowCanonicalHandoffError(e);
        const err = e as Error;
        logger.error("handoff begin failed", err);
        set.status = 500;
        return { success: false, error: `handoff begin failed: ${err.message}` };
      }
    },
    {
      body: t.Object({
        projectId: t.String({ description: "Project identifier" }),
        sourceSessionId: t.Optional(t.String()),
        targetAgent: t.Optional(t.String()),
        summary: t.Optional(t.String()),
        openQuestions: t.Optional(t.Array(t.String())),
        nextSteps: t.Optional(t.Array(t.String())),
        files: t.Optional(t.Array(t.String())),
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "Begin a cross-session handoff",
        description:
          "Creates an open handoff row and a dual-write searchable memory. Optional LLM summary-polish is best-effort; canonical store failures use the typed error envelope.",
      },
    },
  )
  .post(
    "/accept",
    async ({ body, set }) => {
      if (handoffsDisabled()) {
        set.status = 423;
        return { status: 423, error: "handoffs disabled" };
      }
      const b = body as { id?: string; projectId?: string };
      if (!b.id || !String(b.id).trim()) {
        set.status = 400;
        return { status: 400, error: "id required" };
      }
      try {
        const result = await service().accept({ id: b.id, projectId: b.projectId });
        set.status = result.ok ? 200 : 400;
        return { success: result.ok, data: result };
      } catch (e) {
        rethrowCanonicalHandoffError(e);
        const err = e as Error;
        logger.error("handoff accept failed", err);
        set.status = 500;
        return { success: false, error: `handoff accept failed: ${err.message}` };
      }
    },
    {
      body: t.Object({
        id: t.String({ description: "Handoff id" }),
        projectId: t.Optional(t.String()),
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "Accept an open handoff",
        description:
          "Flips status open→accepted, sets accepted_at, emits handoff:accepted. Missing/non-open/project-mismatch → {ok:false, reason}.",
      },
    },
  )
  .post(
    "/cancel",
    async ({ body, set }) => {
      if (handoffsDisabled()) {
        set.status = 423;
        return { status: 423, error: "handoffs disabled" };
      }
      const b = body as { id?: string; projectId?: string };
      if (!b.id || !String(b.id).trim()) {
        set.status = 400;
        return { status: 400, error: "id required" };
      }
      try {
        const result = await service().cancel({ id: b.id, projectId: b.projectId });
        set.status = result.ok ? 200 : 400;
        return { success: result.ok, data: result };
      } catch (e) {
        rethrowCanonicalHandoffError(e);
        const err = e as Error;
        logger.error("handoff cancel failed", err);
        set.status = 500;
        return { success: false, error: `handoff cancel failed: ${err.message}` };
      }
    },
    {
      body: t.Object({
        id: t.String({ description: "Handoff id" }),
        projectId: t.Optional(t.String()),
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "Cancel (expire) an open handoff",
        description:
          "Flips status open→expired (no event). Same failure semantics as accept on missing/non-open/project-mismatch.",
      },
    },
  )
  .post(
    "/list",
    async ({ body, set }) => {
      if (handoffsDisabled()) {
        set.status = 423;
        return { status: 423, error: "handoffs disabled" };
      }
      const b = body as { projectId?: string; targetAgent?: string };
      if (!b.projectId || !String(b.projectId).trim()) {
        set.status = 400;
        return { status: 400, error: "projectId required" };
      }
      try {
        const pending = await service().listPending(b.projectId, b.targetAgent);
        set.status = 200;
        return {
          success: true,
          data: { pending, count: pending.length },
        };
      } catch (e) {
        rethrowCanonicalHandoffError(e);
        const err = e as Error;
        logger.error("handoff list failed", err);
        set.status = 500;
        return { success: false, error: `handoff list failed: ${err.message}` };
      }
    },
    {
      body: t.Object({
        projectId: t.String({ description: "Project identifier" }),
        targetAgent: t.Optional(t.String()),
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "List pending (open) handoffs",
        description:
          "Lists open handoffs for a project, optionally filtered by target agent, ordered oldest-first.",
      },
    },
  )
  .patch(
    "/:id",
    async ({ params, query, body, set }) => {
      if (handoffsDisabled()) {
        set.status = 423;
        return { status: 423, error: "handoffs disabled" };
      }

      const raw = (body ?? {}) as Record<string, unknown>;
      const keys = Object.keys(raw);
      const rejected = keys.filter(
        (k) => !(HANDOFF_PATCH_ALLOWED_FIELDS as readonly string[]).includes(k),
      );
      if (rejected.length > 0) {
        set.status = 400;
        return { status: 400, error: `field not allowed: ${rejected.join(", ")}` };
      }

      const patch: {
        targetAgent?: string | null;
        summary?: string;
        openQuestions?: string[];
        nextSteps?: string[];
        files?: string[];
      } = {};

      if ("targetAgent" in raw) {
        const v = raw.targetAgent;
        if (v !== null && typeof v !== "string") {
          set.status = 400;
          return { status: 400, error: "targetAgent must be a string or null" };
        }
        patch.targetAgent = v as string | null;
      }
      if ("summary" in raw) {
        if (typeof raw.summary !== "string") {
          set.status = 400;
          return { status: 400, error: "summary must be a string" };
        }
        patch.summary = raw.summary;
      }
      if ("openQuestions" in raw) {
        if (!isStringArray(raw.openQuestions)) {
          set.status = 400;
          return { status: 400, error: "openQuestions must be an array of strings" };
        }
        patch.openQuestions = raw.openQuestions;
      }
      if ("nextSteps" in raw) {
        if (!isStringArray(raw.nextSteps)) {
          set.status = 400;
          return { status: 400, error: "nextSteps must be an array of strings" };
        }
        patch.nextSteps = raw.nextSteps;
      }
      if ("files" in raw) {
        if (!isStringArray(raw.files)) {
          set.status = 400;
          return { status: 400, error: "files must be an array of strings" };
        }
        patch.files = raw.files;
      }

      if (Object.keys(patch).length === 0) {
        set.status = 400;
        return { status: 400, error: "no editable field provided" };
      }

      try {
        const result = await service().update({
          id: params.id,
          projectId: query.projectId,
          patch,
        });
        if (!result.ok) {
          set.status = result.reason === "not-found" || result.reason === "project-mismatch" ? 404 : 400;
          return { status: set.status, error: result.reason };
        }
        set.status = 200;
        return { success: true, data: result.handoff };
      } catch (e) {
        rethrowCanonicalHandoffError(e);
        const err = e as Error;
        logger.error("handoff update failed", err);
        set.status = 500;
        return { success: false, error: `handoff update failed: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String({ description: "Handoff id" }) }),
      query: t.Object({
        projectId: t.Optional(
          t.String({ description: "If supplied, must match the row's projectId or the request 404s" }),
        ),
      }),
      body: t.Record(t.String(), t.Unknown(), {
        description:
          "Only targetAgent/summary/openQuestions/nextSteps/files are accepted; any other key is a 400 naming it.",
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "Edit a handoff (targetAgent/summary/openQuestions/nextSteps/files only)",
        description:
          "Allowlist PATCH: status/acceptedAt/id/projectId/createdAt/sourceSessionId and any unknown key are rejected " +
          "by name with 400. Refreshes the dual-written memory's content when a content-feeding field changes.",
      },
    },
  )
  .delete(
    "/:id",
    async ({ params, query, set }) => {
      if (handoffsDisabled()) {
        set.status = 423;
        return { status: 423, error: "handoffs disabled" };
      }
      try {
        const result = await service().delete({ id: params.id, projectId: query.projectId });
        if (!result.ok) {
          set.status = 404;
          return { status: 404, error: result.reason };
        }
        set.status = 200;
        return { success: true, data: { id: result.id } };
      } catch (e) {
        rethrowCanonicalHandoffError(e);
        const err = e as Error;
        logger.error("handoff delete failed", err);
        set.status = 500;
        return { success: false, error: `handoff delete failed: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String({ description: "Handoff id" }) }),
      query: t.Object({
        projectId: t.Optional(
          t.String({ description: "If supplied, must match the row's projectId or the request 404s" }),
        ),
      }),
      detail: {
        ...EVENT_DETAIL,
        summary: "Hard-delete a handoff",
        description:
          "Permitted in any status, including open. The dual-written memory row is left intact (dangling metadata.handoffId is accepted).",
      },
    },
  );
