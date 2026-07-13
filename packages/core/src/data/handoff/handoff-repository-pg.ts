/** PostgreSQL implementation of the synchronous HandoffStore contract. */

import { logger } from "@massa-th0th/shared";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { getPrismaClient } from "../../services/query/prisma-client.js";
import type {
  HandoffRecord,
  HandoffStatus,
  HandoffStore,
} from "./handoff-repository.js";

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

function jsonArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function toRecord(row: PgHandoffRow): HandoffRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceSessionId: row.source_session_id,
    targetAgent: row.target_agent,
    summary: row.summary,
    openQuestions: jsonArray(row.open_questions_json),
    nextSteps: jsonArray(row.next_steps_json),
    files: jsonArray(row.files_json),
    status: row.status as HandoffStatus,
    createdAt: row.created_at.getTime(),
    acceptedAt: row.accepted_at?.getTime() ?? null,
  };
}

export class PgHandoffStore implements HandoffStore {
  private prisma!: PrismaClient;
  private mirror = new Map<string, HandoffRecord>();
  private hydrated = false;
  private hydrating: Promise<void> | null = null;
  private pendingById = new Map<string, Promise<void>>();
  private pending = new Set<Promise<void>>();

  private getClient(): PrismaClient {
    if (!this.prisma) this.prisma = getPrismaClient();
    return this.prisma;
  }

  private ensureHydrated(): Promise<void> {
    if (this.hydrated) return Promise.resolve();
    if (this.hydrating) return this.hydrating;
    this.hydrating = (async () => {
      try {
        const rows = await this.getClient().$queryRaw<PgHandoffRow[]>`
          SELECT id, project_id, source_session_id, target_agent, summary,
                 open_questions_json, next_steps_json, files_json, status,
                 created_at, accepted_at
          FROM handoffs`;
        const next = new Map(rows.map((row) => [row.id, toRecord(row)]));
        // Calls made before hydration completed are authoritative locally.
        for (const [id, record] of this.mirror) next.set(id, record);
        this.mirror = next;
        this.hydrated = true;
      } catch (error) {
        logger.warn("PgHandoffStore hydrate failed (best-effort)", {
          error: (error as Error).message,
        });
      } finally {
        this.hydrating = null;
      }
    })();
    return this.hydrating;
  }

  private enqueue(id: string, operation: () => Promise<void>): void {
    const previous = this.pendingById.get(id);
    const run = async () => {
      await this.ensureHydrated();
      try {
        await operation();
      } catch (error) {
        logger.warn("PgHandoffStore persistence failed (best-effort)", {
          id,
          error: (error as Error).message,
        });
      }
    };
    const task = previous ? previous.then(run, run) : run();
    this.pendingById.set(id, task);
    this.pending.add(task);
    void task.finally(() => {
      this.pending.delete(task);
      if (this.pendingById.get(id) === task) this.pendingById.delete(id);
    });
  }

  insert(record: HandoffRecord): void {
    const captured = structuredClone(record);
    this.mirror.set(record.id, captured);
    this.enqueue(record.id, async () => {
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
    });
  }

  getById(id: string): HandoffRecord | null {
    void this.ensureHydrated();
    const record = this.mirror.get(id);
    return record ? structuredClone(record) : null;
  }

  listPending(projectId: string, targetAgent?: string | null): HandoffRecord[] {
    void this.ensureHydrated();
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

  setStatus(
    id: string,
    status: "accepted" | "expired",
    acceptedAt?: number,
  ): HandoffRecord | null {
    const current = this.mirror.get(id);
    if (!current) {
      void this.ensureHydrated();
      return null;
    }
    if (current.status !== "open") return structuredClone(current);

    const next: HandoffRecord = {
      ...current,
      status,
      acceptedAt: status === "accepted" ? (acceptedAt ?? Date.now()) : null,
    };
    this.mirror.set(id, next);
    this.enqueue(id, async () => {
      const acceptedDate = next.acceptedAt === null ? null : new Date(next.acceptedAt);
      const rows = await this.getClient().$queryRaw<PgHandoffRow[]>`
        UPDATE handoffs
        SET status = ${status}, accepted_at = ${acceptedDate}
        WHERE id = ${id} AND status = 'open'
        RETURNING id, project_id, source_session_id, target_agent, summary,
                  open_questions_json, next_steps_json, files_json, status,
                  created_at, accepted_at`;
      if (rows[0]) {
        this.mirror.set(id, toRecord(rows[0]));
        return;
      }
      // Another process won the conditional transition; converge the mirror.
      const persisted = await this.getClient().$queryRaw<PgHandoffRow[]>`
        SELECT id, project_id, source_session_id, target_agent, summary,
               open_questions_json, next_steps_json, files_json, status,
               created_at, accepted_at FROM handoffs WHERE id = ${id}`;
      if (persisted[0]) this.mirror.set(id, toRecord(persisted[0]));
    });
    return structuredClone(next);
  }

  journalMode(): string {
    void this.ensureHydrated();
    return "postgres";
  }

  /** Internal verification hook for async persistence and restart tests. */
  async __hydrate(): Promise<void> {
    await this.ensureHydrated();
  }

  /** Internal verification hook; waits until hydration and writes settle. */
  async __drain(): Promise<void> {
    do {
      const tasks = [
        ...(this.hydrating ? [this.hydrating] : []),
        ...this.pending,
      ];
      if (tasks.length === 0) break;
      await Promise.all(tasks);
    } while (this.hydrating || this.pending.size > 0);
  }
}
