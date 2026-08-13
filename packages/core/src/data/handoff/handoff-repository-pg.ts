/** PostgreSQL implementation of the durable asynchronous HandoffStore contract. */

import type { PrismaClient } from "../../generated/prisma/index.js";
import { getPrismaClient } from "../../kernel/prisma-client.js";
import { getProjectIdentityAliasResolver } from "../../kernel/alias-resolver.js";
import {
  searchBackendUnavailable,
  storeCorruption,
} from "../../kernel/search-diagnostics.js";
import {
  HANDOFF_STATUSES,
  type HandoffRecord,
  type HandoffStatus,
  type HandoffStore,
  type HandoffUpdatePatch,
} from "./handoff-contract.js";

interface PgHandoffRow {
  id: string;
  project_id: string;
  source_session_id: string | null;
  target_agent: string | null;
  summary: string;
  open_questions_json: string;
  next_steps_json: string;
  files_json: string;
  status: string;
  created_at: Date;
  accepted_at: Date | null;
}

function jsonArray(raw: string, field: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw storeCorruption(`handoff.${field}`, error);
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw storeCorruption(`handoff.${field}`, new TypeError("expected string array"));
  }
  return value;
}

function timestamp(value: unknown, field: string, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw storeCorruption(`handoff.${field}`, new TypeError("expected valid date"));
  }
  return value.getTime();
}

function toRecord(row: PgHandoffRow): HandoffRecord {
  if (!(HANDOFF_STATUSES as readonly string[]).includes(row.status)) {
    throw storeCorruption("handoff.status", new TypeError("invalid status"));
  }
  return {
    id: row.id,
    projectId: row.project_id,
    sourceSessionId: row.source_session_id,
    targetAgent: row.target_agent,
    summary: row.summary,
    openQuestions: jsonArray(row.open_questions_json, "open_questions_json"),
    nextSteps: jsonArray(row.next_steps_json, "next_steps_json"),
    files: jsonArray(row.files_json, "files_json"),
    status: row.status as HandoffStatus,
    createdAt: timestamp(row.created_at, "created_at")!,
    acceptedAt: timestamp(row.accepted_at, "accepted_at", true),
  };
}

export class PgHandoffStore implements HandoffStore {
  private prisma!: PrismaClient;
  private mirror = new Map<string, HandoffRecord>();
  private hydrated = false;
  private hydrating: Promise<void> | null = null;

  constructor(client?: PrismaClient) {
    if (client) this.prisma = client;
  }

  private getClient(): PrismaClient {
    if (!this.prisma) this.prisma = getPrismaClient();
    return this.prisma;
  }

  private ensureHydrated(): Promise<void> {
    if (this.hydrated) return Promise.resolve();
    if (this.hydrating) return this.hydrating;
    this.hydrating = (async () => {
      try {
        let rows: PgHandoffRow[];
        try {
          rows = await this.getClient().$queryRaw<PgHandoffRow[]>`
            SELECT id, project_id, source_session_id, target_agent, summary,
                   open_questions_json, next_steps_json, files_json, status,
                   created_at, accepted_at
            FROM handoffs`;
        } catch (error) {
          throw searchBackendUnavailable("handoff_store", error);
        }
        const next = new Map(rows.map((row) => [row.id, toRecord(row)]));
        this.mirror = next;
        this.hydrated = true;
      } finally {
        this.hydrating = null;
      }
    })();
    return this.hydrating;
  }

  async insert(record: HandoffRecord): Promise<void> {
    await this.ensureHydrated();
    const captured = structuredClone(record);
    // Resolve canonical project id at the write seam (spec req 3): a caller
    // holding a retired id lands the row on the live target.
    captured.projectId = await getProjectIdentityAliasResolver().resolve(captured.projectId);
    try {
      await this.getClient().$executeRaw`
        INSERT INTO handoffs (
          id, project_id, source_session_id, target_agent, summary,
          open_questions_json, next_steps_json, files_json, status,
          created_at, accepted_at
        ) VALUES (
          ${captured.id}, ${captured.projectId}, ${captured.sourceSessionId},
          ${captured.targetAgent}, ${captured.summary},
          ${JSON.stringify(captured.openQuestions ?? [])},
          ${JSON.stringify(captured.nextSteps ?? [])},
          ${JSON.stringify(captured.files ?? [])}, ${captured.status},
          ${new Date(captured.createdAt)},
          ${captured.acceptedAt === null ? null : new Date(captured.acceptedAt)}
        )`;
    } catch (error) {
      throw searchBackendUnavailable("handoff_store", error);
    }
    this.mirror.set(record.id, captured);
  }

  async getById(id: string): Promise<HandoffRecord | null> {
    await this.ensureHydrated();
    const record = this.mirror.get(id);
    return record ? structuredClone(record) : null;
  }

  async listPending(projectId: string, targetAgent?: string | null): Promise<HandoffRecord[]> {
    await this.ensureHydrated();
    return [...this.mirror.values()]
      .filter(
        (record) =>
          record.projectId === projectId &&
          record.status === "open" &&
          (targetAgent == null ||
            record.targetAgent === targetAgent ||
            record.targetAgent === null),
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((record) => structuredClone(record));
  }

  async setStatus(
    id: string,
    status: "accepted" | "expired",
    acceptedAt?: number,
  ): Promise<HandoffRecord | null> {
    await this.ensureHydrated();
    const current = this.mirror.get(id);
    if (!current) return null;
    if (current.status !== "open") return structuredClone(current);

    const nextAcceptedAt = status === "accepted" ? (acceptedAt ?? Date.now()) : null;
    const acceptedDate = nextAcceptedAt === null ? null : new Date(nextAcceptedAt);
    let rows: PgHandoffRow[];
    try {
      rows = await this.getClient().$queryRaw<PgHandoffRow[]>`
        UPDATE handoffs
        SET status = ${status}, accepted_at = ${acceptedDate}
        WHERE id = ${id} AND status = 'open'
        RETURNING id, project_id, source_session_id, target_agent, summary,
                  open_questions_json, next_steps_json, files_json, status,
                  created_at, accepted_at`;
      if (!rows[0]) {
        rows = await this.getClient().$queryRaw<PgHandoffRow[]>`
        SELECT id, project_id, source_session_id, target_agent, summary,
               open_questions_json, next_steps_json, files_json, status,
               created_at, accepted_at FROM handoffs WHERE id = ${id}`;
      }
    } catch (error) {
      throw searchBackendUnavailable("handoff_store", error);
    }
    if (!rows[0]) return null;
    const persisted = toRecord(rows[0]);
    this.mirror.set(id, persisted);
    return structuredClone(persisted);
  }

  /**
   * Writes only the five allowlisted columns (AC-01.1). `status` /
   * `accepted_at` never appear in this SQL — they stay exclusively
   * `setStatus`'s paired write (AC-01.3). Absent patch fields are re-written
   * with their current mirror value rather than a partial `SET` list, which
   * keeps the query static; the effect on the row is identical either way.
   */
  async update(id: string, patch: HandoffUpdatePatch): Promise<HandoffRecord | null> {
    await this.ensureHydrated();
    const current = this.mirror.get(id);
    if (!current) return null;

    const merged: HandoffRecord = {
      ...current,
      ...(patch.targetAgent !== undefined ? { targetAgent: patch.targetAgent } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.openQuestions !== undefined ? { openQuestions: patch.openQuestions } : {}),
      ...(patch.nextSteps !== undefined ? { nextSteps: patch.nextSteps } : {}),
      ...(patch.files !== undefined ? { files: patch.files } : {}),
    };

    let rows: PgHandoffRow[];
    try {
      rows = await this.getClient().$queryRaw<PgHandoffRow[]>`
        UPDATE handoffs
        SET target_agent = ${merged.targetAgent}, summary = ${merged.summary},
            open_questions_json = ${JSON.stringify(merged.openQuestions ?? [])},
            next_steps_json = ${JSON.stringify(merged.nextSteps ?? [])},
            files_json = ${JSON.stringify(merged.files ?? [])}
        WHERE id = ${id}
        RETURNING id, project_id, source_session_id, target_agent, summary,
                  open_questions_json, next_steps_json, files_json, status,
                  created_at, accepted_at`;
    } catch (error) {
      throw searchBackendUnavailable("handoff_store", error);
    }
    if (!rows[0]) return null;
    const persisted = toRecord(rows[0]);
    this.mirror.set(id, persisted);
    return structuredClone(persisted);
  }

  /**
   * Hard-deletes in any status (AC-01.4). The DB's affected-row count is the
   * source of truth for whether anything existed; the in-process mirror is
   * only ever purged *after* that DB write succeeds, and it must be purged
   * (D3) — omitting `mirror.delete` leaves this store instance serving the
   * deleted row from memory for the rest of the process.
   */
  async delete(id: string): Promise<string | null> {
    await this.ensureHydrated();
    let affected: number;
    try {
      affected = await this.getClient().$executeRaw`DELETE FROM handoffs WHERE id = ${id}`;
    } catch (error) {
      throw searchBackendUnavailable("handoff_store", error);
    }
    if (affected === 0) return null;
    this.mirror.delete(id);
    return id;
  }

  async journalMode(): Promise<string> {
    await this.ensureHydrated();
    return "postgres";
  }

  /** Internal verification hook for async persistence and restart tests. */
  async __hydrate(): Promise<void> {
    await this.ensureHydrated();
  }

  /** Compatibility verification hook; all public writes are already durable. */
  async __drain(): Promise<void> {
    await this.ensureHydrated();
  }
}
