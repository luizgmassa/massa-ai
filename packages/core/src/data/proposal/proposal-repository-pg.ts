/** PostgreSQL implementation of the durable asynchronous ProposalStore contract. */

import type { PrismaClient } from "../../generated/prisma/index.js";
import { getPrismaClient } from "../../kernel/prisma-client.js";
import { getProjectIdentityAliasResolver } from "../../kernel/alias-resolver.js";
import {
  searchBackendUnavailable,
  storeCorruption,
} from "../../kernel/search-diagnostics.js";
import {
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
  type ProposalCreateInput,
  type ProposalKind,
  type ProposalPayload,
  type ProposalRecord,
  type ProposalStatus,
  type ProposalStore,
  type ProposalUpdatePatch,
} from "./proposal-contract.js";
import {
  assertValidProposalPayload,
  isRecord,
  isValidProposalPayload,
} from "./proposal-payload-validation.js";

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

/**
 * Read-side application of the shared `PROPOSAL_PAYLOAD_RULES` table
 * (`proposal-payload-validation.ts`, D4). This is the *reader* half of the
 * "one table, two callers" contract — `create`/`update` below are the write
 * half, and neither may re-derive its own copy of the key table.
 */
function parsePayload(raw: string, kind: ProposalKind): ProposalPayload {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw storeCorruption("proposal.payload_json", error);
  }
  if (!isRecord(value)) {
    throw storeCorruption("proposal.payload_json", new TypeError("expected object"));
  }
  if (!isValidProposalPayload(kind, value)) {
    throw storeCorruption("proposal.payload_json", new TypeError("invalid proposal payload"));
  }
  return value as ProposalPayload;
}

function timestamp(value: unknown, field: string, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw storeCorruption(`proposal.${field}`, new TypeError("expected valid date"));
  }
  return value.getTime();
}

function toRecord(row: PgProposalRow): ProposalRecord {
  if (!(PROPOSAL_KINDS as readonly string[]).includes(row.kind)) {
    throw storeCorruption("proposal.kind", new TypeError("invalid kind"));
  }
  if (!(PROPOSAL_STATUSES as readonly string[]).includes(row.status)) {
    throw storeCorruption("proposal.status", new TypeError("invalid status"));
  }
  const decidedAt = timestamp(row.decided_at, "decided_at", true);
  if ((row.status === "pending") !== (decidedAt === null)) {
    throw storeCorruption("proposal.decided_at", new TypeError("status/date mismatch"));
  }
  const kind = row.kind as ProposalKind;
  return {
    id: row.id,
    projectId: row.project_id,
    kind,
    targetMemoryId: row.target_memory_id,
    payload: parsePayload(row.payload_json, kind),
    rationale: row.rationale,
    status: row.status as ProposalStatus,
    createdAt: timestamp(row.created_at, "created_at")!,
    decidedAt,
  };
}

export class PgProposalStore implements ProposalStore {
  private prisma!: PrismaClient;
  private mirror = new Map<string, ProposalRecord>();
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
        let rows: PgProposalRow[];
        try {
          rows = await this.getClient().$queryRaw<PgProposalRow[]>`
            SELECT id, project_id, kind, target_memory_id, payload_json,
                   rationale, status, created_at, decided_at FROM proposals`;
        } catch (error) {
          throw searchBackendUnavailable("proposal_store", error);
        }
        this.mirror = new Map(rows.map((row) => [row.id, toRecord(row)]));
        this.hydrated = true;
      } finally {
        this.hydrating = null;
      }
    })();
    return this.hydrating;
  }

  async insert(record: ProposalRecord): Promise<void> {
    await this.ensureHydrated();
    const captured = structuredClone(record);
    // Resolve canonical project id at the write seam (spec req 3).
    captured.projectId = await getProjectIdentityAliasResolver().resolve(captured.projectId);
    try {
      await this.getClient().$executeRaw`
        INSERT INTO proposals (
          id, project_id, kind, target_memory_id, payload_json, rationale,
          status, created_at, decided_at
        ) VALUES (
          ${captured.id}, ${captured.projectId}, ${captured.kind},
          ${captured.targetMemoryId}, ${JSON.stringify(captured.payload)},
          ${captured.rationale}, ${captured.status}, ${new Date(captured.createdAt)},
          ${captured.decidedAt === null ? null : new Date(captured.decidedAt)}
        )`;
    } catch (error) {
      throw searchBackendUnavailable("proposal_store", error);
    }
    this.mirror.set(record.id, captured);
  }

  async getById(id: string): Promise<ProposalRecord | null> {
    await this.ensureHydrated();
    const record = this.mirror.get(id);
    return record ? structuredClone(record) : null;
  }

  async listPending(projectId: string): Promise<ProposalRecord[]> {
    await this.ensureHydrated();
    return [...this.mirror.values()]
      .filter((record) => record.projectId === projectId && record.status === "pending")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((record) => structuredClone(record));
  }

  async setStatus(
    id: string,
    status: "approved" | "rejected",
    decidedAt?: number,
  ): Promise<ProposalRecord | null> {
    await this.ensureHydrated();
    const current = this.mirror.get(id);
    if (!current) return null;
    if (current.status !== "pending") return structuredClone(current);

    let rows: PgProposalRow[];
    try {
      rows = await this.getClient().$queryRaw<PgProposalRow[]>`
        UPDATE proposals
        SET status = ${status}, decided_at = ${new Date(decidedAt ?? Date.now())}
        WHERE id = ${id} AND status = 'pending'
        RETURNING id, project_id, kind, target_memory_id, payload_json,
                  rationale, status, created_at, decided_at`;
      if (!rows[0]) {
        rows = await this.getClient().$queryRaw<PgProposalRow[]>`
          SELECT id, project_id, kind, target_memory_id, payload_json,
                 rationale, status, created_at, decided_at
          FROM proposals WHERE id = ${id}`;
      }
    } catch (error) {
      throw searchBackendUnavailable("proposal_store", error);
    }
    if (!rows[0]) return null;
    const persisted = toRecord(rows[0]);
    this.mirror.set(id, persisted);
    return structuredClone(persisted);
  }

  /**
   * Manual create (AC-02.1): always lands at `status: "pending"` /
   * `decidedAt: null`, both stamped here rather than caller-suppliable, and
   * the payload is re-validated against T5's shared table before the row
   * is ever written — so a create can never write a row `parsePayload`
   * would refuse on the next read.
   */
  async create(input: ProposalCreateInput): Promise<ProposalRecord> {
    assertValidProposalPayload(input.kind, input.payload);
    const record: ProposalRecord = {
      id: input.id,
      projectId: input.projectId,
      kind: input.kind,
      targetMemoryId: input.targetMemoryId ?? null,
      payload: input.payload,
      rationale: input.rationale ?? "",
      status: "pending",
      createdAt: input.createdAt ?? Date.now(),
      decidedAt: null,
    };
    await this.insert(record);
    return record;
  }

  /**
   * Writes only `rationale` and `payload` (AC-02.3/AC-02.4). `kind` /
   * `targetMemoryId` / `status` / `decided_at` never appear in this SQL —
   * `applyProposal` branches on the first two, and the second two stay
   * exclusively `setStatus`'s paired write, whose corruption guard
   * (`toRecord`) throws when `(status === "pending") !== (decidedAt ===
   * null)`. A `payload` edit re-validates against the row's *existing*
   * `kind` — changing `kind` here would let a payload for the old kind slip
   * past validation for the new one.
   */
  async update(id: string, patch: ProposalUpdatePatch): Promise<ProposalRecord | null> {
    await this.ensureHydrated();
    const current = this.mirror.get(id);
    if (!current) return null;
    if (patch.payload !== undefined) {
      assertValidProposalPayload(current.kind, patch.payload);
    }

    const merged: ProposalRecord = {
      ...current,
      ...(patch.rationale !== undefined ? { rationale: patch.rationale } : {}),
      ...(patch.payload !== undefined ? { payload: patch.payload } : {}),
    };

    let rows: PgProposalRow[];
    try {
      rows = await this.getClient().$queryRaw<PgProposalRow[]>`
        UPDATE proposals
        SET rationale = ${merged.rationale}, payload_json = ${JSON.stringify(merged.payload)}
        WHERE id = ${id}
        RETURNING id, project_id, kind, target_memory_id, payload_json,
                  rationale, status, created_at, decided_at`;
    } catch (error) {
      throw searchBackendUnavailable("proposal_store", error);
    }
    if (!rows[0]) return null;
    const persisted = toRecord(rows[0]);
    this.mirror.set(id, persisted);
    return structuredClone(persisted);
  }

  /**
   * Hard-deletes in any status (AC-02.5), including `approved` — the memory
   * edit an approved proposal already applied is not reversed. As in
   * `PgHandoffStore.delete` (D3), the DB's affected-row count is the source
   * of truth and `mirror.delete` runs only after that write succeeds.
   */
  async delete(id: string): Promise<string | null> {
    await this.ensureHydrated();
    let affected: number;
    try {
      affected = await this.getClient().$executeRaw`DELETE FROM proposals WHERE id = ${id}`;
    } catch (error) {
      throw searchBackendUnavailable("proposal_store", error);
    }
    if (affected === 0) return null;
    this.mirror.delete(id);
    return id;
  }

  async journalMode(): Promise<string> {
    await this.ensureHydrated();
    return "postgres";
  }

  async __hydrate(): Promise<void> {
    await this.ensureHydrated();
  }

  async __drain(): Promise<void> {
    await this.ensureHydrated();
  }
}
