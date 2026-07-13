export const PROPOSAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_KINDS = ["memory.create", "memory.update", "memory.tag"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export interface CreateMemoryPayload { content: string; type?: string; level?: number; importance?: number; tags?: string[]; }
export interface UpdateMemoryPayload { content?: string; importance?: number; tags?: string[]; }
export interface TagMemoryPayload { tags: string[]; }
export type ProposalPayload = CreateMemoryPayload | UpdateMemoryPayload | TagMemoryPayload;
export interface ProposalRecord { id: string; projectId: string; kind: ProposalKind; targetMemoryId: string | null; payload: ProposalPayload; rationale: string; status: ProposalStatus; createdAt: number; decidedAt: number | null; }
export interface ProposalStore { insert(p: ProposalRecord): void; getById(id: string): ProposalRecord | null; listPending(projectId: string): ProposalRecord[]; setStatus(id: string, status: "approved" | "rejected", decidedAt?: number): ProposalRecord | null; journalMode(): string; }
export class MemoryProposalStore implements ProposalStore { public rows: ProposalRecord[] = []; insert(row: ProposalRecord): void { this.rows.push(structuredClone(row)); } getById(id: string): ProposalRecord | null { const row = this.rows.find((item) => item.id === id); return row ? structuredClone(row) : null; } listPending(projectId: string): ProposalRecord[] { return this.rows.filter((row) => row.projectId === projectId && row.status === "pending").sort((a, b) => a.createdAt - b.createdAt).map((row) => structuredClone(row)); } setStatus(id: string, status: "approved" | "rejected", decidedAt?: number): ProposalRecord | null { const row = this.rows.find((item) => item.id === id); if (!row) return null; row.status = status; row.decidedAt = decidedAt ?? Date.now(); return structuredClone(row); } journalMode(): string { return "memory"; } }
