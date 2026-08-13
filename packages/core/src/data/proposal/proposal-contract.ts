import { assertValidProposalPayload } from "./proposal-payload-validation.js";

export const PROPOSAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_KINDS = ["memory.create", "memory.update", "memory.tag"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export interface CreateMemoryPayload { content: string; type?: string; level?: number; importance?: number; tags?: string[]; }
export interface UpdateMemoryPayload { content?: string; importance?: number; tags?: string[]; }
export interface TagMemoryPayload { tags: string[]; }
export type ProposalPayload = CreateMemoryPayload | UpdateMemoryPayload | TagMemoryPayload;
export interface ProposalRecord { id: string; projectId: string; kind: ProposalKind; targetMemoryId: string | null; payload: ProposalPayload; rationale: string; status: ProposalStatus; createdAt: number; decidedAt: number | null; }

/** Input to `create` (AC-02.1): the store stamps `status: "pending"` and
 * `decidedAt: null` itself — those two fields are never caller-supplied here,
 * which is what keeps them out of reach of a manual `insert()` misuse. */
export interface ProposalCreateInput {
  id: string;
  projectId: string;
  kind: ProposalKind;
  payload: ProposalPayload;
  rationale?: string;
  targetMemoryId?: string | null;
  createdAt?: number;
}

/** The two fields `update` is allowed to touch (AC-02.3/AC-02.4). `kind`,
 * `targetMemoryId`, `status` and `decidedAt` are deliberately absent. */
export interface ProposalUpdatePatch {
  rationale?: string;
  payload?: ProposalPayload;
}

export interface ProposalStore {
  insert(p: ProposalRecord): Promise<void>;
  getById(id: string): Promise<ProposalRecord | null>;
  listPending(projectId: string): Promise<ProposalRecord[]>;
  setStatus(id: string, status: "approved" | "rejected", decidedAt?: number): Promise<ProposalRecord | null>;
  create(input: ProposalCreateInput): Promise<ProposalRecord>;
  update(id: string, patch: ProposalUpdatePatch): Promise<ProposalRecord | null>;
  delete(id: string): Promise<string | null>;
  journalMode(): Promise<string>;
}

export class MemoryProposalStore implements ProposalStore {
  public rows: ProposalRecord[] = [];

  async insert(row: ProposalRecord): Promise<void> {
    this.rows.push(structuredClone(row));
  }

  async getById(id: string): Promise<ProposalRecord | null> {
    const row = this.rows.find((item) => item.id === id);
    return row ? structuredClone(row) : null;
  }

  async listPending(projectId: string): Promise<ProposalRecord[]> {
    return this.rows
      .filter((row) => row.projectId === projectId && row.status === "pending")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((row) => structuredClone(row));
  }

  async setStatus(
    id: string,
    status: "approved" | "rejected",
    decidedAt?: number,
  ): Promise<ProposalRecord | null> {
    const row = this.rows.find((item) => item.id === id);
    if (!row) return null;
    if (row.status !== "pending") return structuredClone(row);
    row.status = status;
    row.decidedAt = decidedAt ?? Date.now();
    return structuredClone(row);
  }

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
    this.rows.push(structuredClone(record));
    return structuredClone(record);
  }

  async update(id: string, patch: ProposalUpdatePatch): Promise<ProposalRecord | null> {
    const row = this.rows.find((item) => item.id === id);
    if (!row) return null;
    if (patch.payload !== undefined) assertValidProposalPayload(row.kind, patch.payload);
    if (patch.rationale !== undefined) row.rationale = patch.rationale;
    if (patch.payload !== undefined) row.payload = patch.payload;
    return structuredClone(row);
  }

  async delete(id: string): Promise<string | null> {
    const index = this.rows.findIndex((item) => item.id === id);
    if (index === -1) return null;
    this.rows.splice(index, 1);
    return id;
  }

  async journalMode(): Promise<string> {
    return "memory";
  }
}
