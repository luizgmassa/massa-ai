/**
 * HandoffService — Phase 6 cross-session handoffs (G2).
 *
 * Lets an agent (session A) leave a structured handoff for a later agent
 * (session B). The handoff is persisted in the Handoff table AND
 * dual-written as a searchable `conversation` memory (FTS-discoverable
 * independently of the Handoff table).
 *
 * Contract (spec.md R1–R7, NF1–NF5):
 *  - State machine: open → accepted | expired (both terminal).
 *  - accept/cancel only valid on an `open` row; everything else is a
 *    clear `{ok:false, reason}` failure (never a silent no-op).
 *  - Optional LLM summary-polish and memory dual-write are best-effort.
 *    Canonical handoff-store failures propagate as sanitized typed errors.
 *  - Backend-polymorphic via the HandoffStore factory (no
 *    `isPostgresEnabled()` short-circuit).
 *
 * Test-isolation (mirrors Phase-4 BootstrapService): the ctor accepts
 * injectable `store`, `memoryRepo`, `llm`, and `idFactory` seams.
 * Defaults resolve lazily at run time so the closed-MemoryRepository
 * landmine (memory-crud.test.ts) does not poison handoff tests.
 */

import { z } from "zod";
import { MemoryLevel, MemoryType } from "@massa-ai/shared";
import {
  getHandoffStore,
  newHandoffId,
  type HandoffRecord,
  type HandoffStore,
  type HandoffUpdatePatch,
} from "../../data/handoff/handoff-repository.js";
import { getMemoryRepository } from "../../data/memory/memory-repository-factory.js";
import type { InsertMemoryInput, UpdateMemoryPatch } from "../../data/memory/memory-repository.js";
import { eventBus } from "../events/event-bus.js";
import { llm as defaultLlmSurface } from "../memory/llm-client.js";
import type { LlmSurface } from "../memory/consolidator.js";

// ── Public types ────────────────────────────────────────────────────────────

export interface BeginHandoffInput {
  projectId: string;
  sourceSessionId?: string;
  targetAgent?: string;
  summary?: string;
  openQuestions?: string[];
  nextSteps?: string[];
  files?: string[];
}

export interface BeginResult {
  ok: boolean;
  id?: string;
  status?: "open";
  memoryId?: string | null;
  reason?: string;
}

export interface AcceptCancelResult {
  ok: boolean;
  handoff?: HandoffRecord;
  reason?: string;
}

/** T7 — PATCH/DELETE results (AC-01.1..AC-01.8). */
export interface UpdateResult {
  ok: boolean;
  handoff?: HandoffRecord;
  reason?: string;
}

export interface DeleteResult {
  ok: boolean;
  id?: string;
  reason?: string;
}

/**
 * Injectable memory-repository seam. The default implementation resolves
 * getMemoryRepository() lazily inside each method (test-isolation).
 */
export interface HandoffMemorySeam {
  insert(input: InsertMemoryInput): void | Promise<void>;
  /** AC-01.8: refresh the dual-written memory's content after an edit. */
  update(id: string, patch: UpdateMemoryPatch): boolean | Promise<boolean>;
}

export interface HandoffDeps {
  store?: HandoffStore;
  memoryRepo?: HandoffMemorySeam;
  llm?: LlmSurface;
  idFactory?: () => string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_SUMMARY_CHARS = 1024;
const HANDOFF_IMPORTANCE = 0.7;

// ── LLM schema (R7 optional polish) ─────────────────────────────────────────

const HandoffSummarySchema = z.object({
  summary: z.string().min(1).max(MAX_SUMMARY_CHARS),
});

// ── Service ─────────────────────────────────────────────────────────────────

export class HandoffService {
  private readonly store: HandoffStore;
  private readonly memoryRepo: HandoffMemorySeam;
  private readonly llm: LlmSurface;
  private readonly idFactory: () => string;

  constructor(deps: HandoffDeps = {}) {
    this.store = deps.store ?? getHandoffStore();
    this.llm = deps.llm ?? defaultLlmSurface;
    this.idFactory = deps.idFactory ?? (() => newHandoffId());
    // Lazy resolver so the memory repo is touched at run time (not ctor
    // time) unless a test injects one. Mirrors bootstrap-service.ts.
    const injectedRepo = deps.memoryRepo;
    this.memoryRepo =
      injectedRepo ??
      ({
        insert: (i: InsertMemoryInput) => getMemoryRepository().insert(i),
        update: (id: string, p: UpdateMemoryPatch) => getMemoryRepository().update(id, p),
      } as HandoffMemorySeam);
  }

  // ── begin (R1, R2, R5, R7) ────────────────────────────────────────────────

  async begin(input: BeginHandoffInput): Promise<BeginResult> {
    if (!input || !input.projectId || !String(input.projectId).trim()) {
      return { ok: false, reason: "missing-project" };
    }

    let summary = truncate(input.summary ?? "", MAX_SUMMARY_CHARS);

    // R7 optional LLM polish: only when LLM is enabled AND summary is empty.
    // Best-effort; never blocks begin.
    if (!summary) {
      try {
        if (this.llm.isEnabled()) {
          const polished = await polishSummary(this.llm, input);
          if (polished) summary = truncate(polished, MAX_SUMMARY_CHARS);
        }
      } catch {
        /* fall through with empty/auto summary */
      }
    }

    const id = this.idFactory();
    const now = Date.now();
    const record: HandoffRecord = {
      id,
      projectId: input.projectId.trim(),
      sourceSessionId: input.sourceSessionId ?? null,
      targetAgent: input.targetAgent ?? null,
      summary,
      openQuestions: dedupStrings(input.openQuestions),
      nextSteps: dedupStrings(input.nextSteps),
      files: dedupStrings(input.files),
      status: "open",
      createdAt: now,
      acceptedAt: null,
    };

    await this.store.insert(record);

    // R5 dual-write: best-effort searchable memory.
    let memoryId: string | null = null;
    try {
      memoryId = await this.dualWrite(record);
    } catch {
      memoryId = null;
    }

    return { ok: true, id, status: "open", memoryId };
  }

  private async dualWrite(record: HandoffRecord): Promise<string | null> {
    const memId = dualWriteMemoryId(record.id);
    const input = buildHandoffMemoryInput(memId, record);
    await Promise.resolve(this.memoryRepo.insert(input));
    return memId;
  }

  // ── accept (R1, R2, R6) ───────────────────────────────────────────────────

  async accept(params: {
    id: string;
    projectId?: string;
  }): Promise<AcceptCancelResult> {
    return this.terminate(params, "accepted");
  }

  // ── cancel (R1, R2) ───────────────────────────────────────────────────────

  async cancel(params: {
    id: string;
    projectId?: string;
  }): Promise<AcceptCancelResult> {
    return this.terminate(params, "expired");
  }

  private async terminate(
    params: { id: string; projectId?: string },
    target: "accepted" | "expired",
  ): Promise<AcceptCancelResult> {
    if (!params || !params.id) {
      return { ok: false, reason: "missing-id" };
    }

    const row = await this.store.getById(params.id);
    if (!row) return { ok: false, reason: "not-found" };

    if (params.projectId && row.projectId !== params.projectId) {
      return { ok: false, reason: "project-mismatch" };
    }
    if (row.status !== "open") {
      return { ok: false, reason: "not-open" };
    }

    const acceptedAt = target === "accepted" ? Date.now() : undefined;
    const updated = await this.store.setStatus(params.id, target, acceptedAt);
    if (!updated) return { ok: false, reason: "store-failed" };
    if (updated.status !== target) return { ok: false, reason: "not-open" };

    // R6 emit (only on accept).
    if (target === "accepted") {
      eventBus.publish("handoff:accepted", {
        handoffId: updated.id,
        projectId: updated.projectId,
        sourceSessionId: updated.sourceSessionId ?? undefined,
        targetAgent: updated.targetAgent ?? undefined,
        acceptedAt: updated.acceptedAt ?? Date.now(),
      });
    }

    return { ok: true, handoff: updated };
  }

  // ── listPending (R3 surfacing) ────────────────────────────────────────────

  async listPending(projectId: string, targetAgent?: string | null): Promise<HandoffRecord[]> {
    return this.store.listPending(projectId, targetAgent ?? undefined);
  }

  // ── update (T7 — AC-01.1, AC-01.3, AC-01.7, AC-01.8) ─────────────────────

  /**
   * Applies an already-allowlisted patch (the route owns rejecting
   * disallowed/unknown fields by name — AC-01.2). `status`/`acceptedAt` are
   * not reachable through `HandoffUpdatePatch` at all, so they cannot be
   * written here even by mistake (AC-01.3).
   */
  async update(params: {
    id: string;
    projectId?: string;
    patch: HandoffUpdatePatch;
  }): Promise<UpdateResult> {
    if (!params || !params.id) {
      return { ok: false, reason: "missing-id" };
    }

    const row = await this.store.getById(params.id);
    if (!row) return { ok: false, reason: "not-found" };
    if (params.projectId && row.projectId !== params.projectId) {
      return { ok: false, reason: "project-mismatch" };
    }

    const updated = await this.store.update(params.id, params.patch);
    if (!updated) return { ok: false, reason: "not-found" };

    // AC-01.8: the dual-written memory's content was built once at `begin`
    // and nothing else ever refreshes it. Any patch field that feeds
    // `formatMemoryContent` must re-run it and push the new content into the
    // memory row, or an edit ships active, FTS-indexed, wrong content.
    const touchesMemoryContent =
      params.patch.summary !== undefined ||
      params.patch.openQuestions !== undefined ||
      params.patch.nextSteps !== undefined ||
      params.patch.files !== undefined;
    if (touchesMemoryContent) {
      await this.refreshDualWriteMemory(updated);
    }

    return { ok: true, handoff: updated };
  }

  private async refreshDualWriteMemory(record: HandoffRecord): Promise<void> {
    // Best-effort, mirroring dualWrite's own swallow in begin(): the memory
    // row may not exist (dualWrite is itself best-effort), and a refresh
    // failure must never fail the handoff edit that triggered it.
    try {
      const memId = dualWriteMemoryId(record.id);
      const content = formatMemoryContent(record);
      await Promise.resolve(this.memoryRepo.update(memId, { content }));
    } catch {
      /* best-effort */
    }
  }

  // ── delete (T7 — AC-01.4, AC-01.5, AC-01.6, AC-01.7) ─────────────────────

  /**
   * Hard-deletes in any status (AC-01.4). The dual-written memory row is
   * left untouched (AC-01.5) — its dangling `metadata.handoffId` is accepted,
   * documented behaviour, not an integrity break.
   */
  async delete(params: { id: string; projectId?: string }): Promise<DeleteResult> {
    if (!params || !params.id) {
      return { ok: false, reason: "missing-id" };
    }

    const row = await this.store.getById(params.id);
    if (!row) return { ok: false, reason: "not-found" };
    if (params.projectId && row.projectId !== params.projectId) {
      return { ok: false, reason: "project-mismatch" };
    }

    const deletedId = await this.store.delete(params.id);
    if (!deletedId) return { ok: false, reason: "not-found" };
    return { ok: true, id: deletedId };
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Deterministic by handoff id (no random suffix): a PATCH must be able to
 * recompute the id of the memory row `dualWrite` created at `begin` without
 * any new lookup primitive on the data layer (out of this task's write set),
 * so a PATCH that touches summary/openQuestions/nextSteps/files can refresh
 * that row's content directly (AC-01.8). Safe against collision because a
 * handoff id (`newHandoffId()`) is itself already unique per row and
 * `dualWrite` runs at most once per handoff id (inside `begin`).
 */
export function dualWriteMemoryId(handoffId: string): string {
  return `handoff-mem-${handoffId}`;
}

export function buildHandoffMemoryInput(
  memId: string,
  record: HandoffRecord,
): InsertMemoryInput {
  const content = formatMemoryContent(record);
  return {
    id: memId,
    content,
    type: MemoryType.CONVERSATION,
    level: MemoryLevel.PROJECT,
    projectId: record.projectId,
    importance: HANDOFF_IMPORTANCE,
    tags: ["handoff", `handoff:${record.id}`, `handoff:${record.projectId}`],
    embedding: [],
    metadata: {
      source: "handoff",
      handoffId: record.id,
      targetAgent: record.targetAgent,
      sourceSessionId: record.sourceSessionId,
    },
    pinned: false,
  };
}

export function formatMemoryContent(record: HandoffRecord): string {
  const parts: string[] = [`Handoff: ${record.summary || "(no summary)"}`];
  if (record.openQuestions.length > 0) {
    parts.push("Open questions: " + record.openQuestions.join("; "));
  }
  if (record.nextSteps.length > 0) {
    parts.push("Next steps: " + record.nextSteps.join("; "));
  }
  if (record.files.length > 0) {
    parts.push("Files: " + record.files.join(", "));
  }
  return truncate(parts.join("\n"), 2048);
}

async function polishSummary(
  surface: LlmSurface,
  input: BeginHandoffInput,
): Promise<string | null> {
  const prompt = buildPolishPrompt(input);
  const res = await surface.object(prompt, HandoffSummarySchema);
  if (!res.ok || !res.value || !res.value.summary) return null;
  return res.value.summary;
}

function buildPolishPrompt(input: BeginHandoffInput): string {
  const parts: string[] = [
    "You are drafting a cross-session handoff summary for a software agent.",
    "Synthesize a concise summary (max 1024 chars) from the open questions and",
    "next steps below. Return JSON: { summary: string }.",
  ];
  if (input.openQuestions && input.openQuestions.length > 0) {
    parts.push("Open questions:\n" + input.openQuestions.map((q) => "- " + q).join("\n"));
  }
  if (input.nextSteps && input.nextSteps.length > 0) {
    parts.push("Next steps:\n" + input.nextSteps.map((s) => "- " + s).join("\n"));
  }
  return parts.join("\n");
}

function dedupStrings(arr?: string[]): string[] {
  if (!arr || !Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const v = String(s).trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function truncate(s: string, max: number): string {
  if (!s) return s;
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

// ── Singleton ───────────────────────────────────────────────────────────────

let cachedService: HandoffService | null = null;

export function getHandoffService(): HandoffService {
  if (!cachedService) cachedService = new HandoffService();
  return cachedService;
}

export function resetHandoffService(): void {
  cachedService = null;
}
