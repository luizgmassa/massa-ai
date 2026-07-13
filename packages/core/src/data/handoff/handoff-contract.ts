export const HANDOFF_STATUSES = ["open", "accepted", "expired"] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];
export interface HandoffRecord { id: string; projectId: string; sourceSessionId: string | null; targetAgent: string | null; summary: string; openQuestions: string[]; nextSteps: string[]; files: string[]; status: HandoffStatus; createdAt: number; acceptedAt: number | null; }
export interface HandoffStore { insert(h: HandoffRecord): void; getById(id: string): HandoffRecord | null; listPending(projectId: string, targetAgent?: string | null): HandoffRecord[]; setStatus(id: string, status: "accepted" | "expired", acceptedAt?: number): HandoffRecord | null; journalMode(): string; }
/** Test double; never selected by production factory. */
export class MemoryHandoffStore implements HandoffStore {
  public rows: HandoffRecord[] = [];
  insert(row: HandoffRecord): void { this.rows.push(structuredClone(row)); }
  getById(id: string): HandoffRecord | null { const row = this.rows.find((item) => item.id === id); return row ? structuredClone(row) : null; }
  listPending(projectId: string, targetAgent?: string | null): HandoffRecord[] { return this.rows.filter((row) => row.projectId === projectId && row.status === "open" && (targetAgent == null || row.targetAgent === targetAgent || row.targetAgent == null)).sort((a, b) => a.createdAt - b.createdAt).map((row) => structuredClone(row)); }
  setStatus(id: string, status: "accepted" | "expired", acceptedAt?: number): HandoffRecord | null { const row = this.rows.find((item) => item.id === id); if (!row) return null; row.status = status; row.acceptedAt = status === "accepted" ? acceptedAt ?? Date.now() : null; return structuredClone(row); }
  journalMode(): string { return "memory"; }
}
