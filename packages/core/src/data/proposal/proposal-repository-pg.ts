/** PostgreSQL implementation of the synchronous ProposalStore contract. */

import { logger } from "@massa-th0th/shared";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { getPrismaClient } from "../../services/query/prisma-client.js";
import type {
  ProposalKind,
  ProposalPayload,
  ProposalRecord,
  ProposalStatus,
  ProposalStore,
} from "./proposal-contract.js";

interface PgProposalRow {
  id: string;
  project_id: string;
  kind: string;
  target_memory_id: string | null;
  payload_json: string;
  rationale: string;
  status: string;
  created_at: Date;
  decided_at: Date | null;
}

function payload(raw: string): ProposalPayload {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object"
      ? (value as ProposalPayload)
      : ({ content: "" } as ProposalPayload);
  } catch {
    return { content: "" } as ProposalPayload;
  }
}

function toRecord(row: PgProposalRow): ProposalRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as ProposalKind,
    targetMemoryId: row.target_memory_id,
    payload: payload(row.payload_json),
    rationale: row.rationale,
    status: row.status as ProposalStatus,
    createdAt: row.created_at.getTime(),
    decidedAt: row.decided_at?.getTime() ?? null,
  };
}

export class PgProposalStore implements ProposalStore {
  private prisma!: PrismaClient;
  private mirror = new Map<string, ProposalRecord>();
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
        const rows = await this.getClient().$queryRaw<PgProposalRow[]>`
          SELECT id, project_id, kind, target_memory_id, payload_json,
                 rationale, status, created_at, decided_at FROM proposals`;
        const next = new Map(rows.map((row) => [row.id, toRecord(row)]));
        for (const [id, record] of this.mirror) next.set(id, record);
        this.mirror = next;
        this.hydrated = true;
      } catch (error) {
        logger.warn("PgProposalStore hydrate failed (best-effort)", {
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
        logger.warn("PgProposalStore persistence failed (best-effort)", {
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

  insert(record: ProposalRecord): void {
    const captured = structuredClone(record);
    this.mirror.set(record.id, captured);
    this.enqueue(record.id, async () => {
      await this.getClient().$executeRaw`
        INSERT INTO proposals (
          id, project_id, kind, target_memory_id, payload_json, rationale,
          status, created_at, decided_at
        ) VALUES (
          ${captured.id}, ${captured.projectId}, ${captured.kind},
          ${captured.targetMemoryId}, ${JSON.stringify(captured.payload ?? {})},
          ${captured.rationale}, ${captured.status}, ${new Date(captured.createdAt)},
          ${captured.decidedAt === null ? null : new Date(captured.decidedAt)}
        )`;
    });
  }

  getById(id: string): ProposalRecord | null {
    void this.ensureHydrated();
    const record = this.mirror.get(id);
    return record ? structuredClone(record) : null;
  }

  listPending(projectId: string): ProposalRecord[] {
    void this.ensureHydrated();
    return [...this.mirror.values()]
      .filter((record) => record.projectId === projectId && record.status === "pending")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((record) => structuredClone(record));
  }

  setStatus(
    id: string,
    status: "approved" | "rejected",
    decidedAt?: number,
  ): ProposalRecord | null {
    const current = this.mirror.get(id);
    if (!current) {
      void this.ensureHydrated();
      return null;
    }
    if (current.status !== "pending") return structuredClone(current);

    const next: ProposalRecord = {
      ...current,
      status,
      decidedAt: decidedAt ?? Date.now(),
    };
    this.mirror.set(id, next);
    this.enqueue(id, async () => {
      const rows = await this.getClient().$queryRaw<PgProposalRow[]>`
        UPDATE proposals
        SET status = ${status}, decided_at = ${new Date(next.decidedAt!)}
        WHERE id = ${id} AND status = 'pending'
        RETURNING id, project_id, kind, target_memory_id, payload_json,
                  rationale, status, created_at, decided_at`;
      if (rows[0]) {
        this.mirror.set(id, toRecord(rows[0]));
        return;
      }
      const persisted = await this.getClient().$queryRaw<PgProposalRow[]>`
        SELECT id, project_id, kind, target_memory_id, payload_json,
               rationale, status, created_at, decided_at
        FROM proposals WHERE id = ${id}`;
      if (persisted[0]) this.mirror.set(id, toRecord(persisted[0]));
    });
    return structuredClone(next);
  }

  journalMode(): string {
    void this.ensureHydrated();
    return "postgres";
  }

  async __hydrate(): Promise<void> {
    await this.ensureHydrated();
  }

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
