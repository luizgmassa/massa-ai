export const HANDOFF_STATUSES = ["open", "accepted", "expired"] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];
export interface HandoffRecord { id: string; projectId: string; sourceSessionId: string | null; targetAgent: string | null; summary: string; openQuestions: string[]; nextSteps: string[]; files: string[]; status: HandoffStatus; createdAt: number; acceptedAt: number | null; }
/**
 * The five fields `update` is allowed to touch (AC-01.1/AC-01.3). `status`
 * and `acceptedAt` are deliberately absent — they stay exclusively
 * `setStatus`'s, a paired write this store has no corruption guard for.
 */
export interface HandoffUpdatePatch { targetAgent?: string | null; summary?: string; openQuestions?: string[]; nextSteps?: string[]; files?: string[]; }
export interface HandoffStore { insert(h: HandoffRecord): Promise<void>; getById(id: string): Promise<HandoffRecord | null>; listPending(projectId: string, targetAgent?: string | null): Promise<HandoffRecord[]>; setStatus(id: string, status: "accepted" | "expired", acceptedAt?: number): Promise<HandoffRecord | null>; update(id: string, patch: HandoffUpdatePatch): Promise<HandoffRecord | null>; delete(id: string): Promise<string | null>; journalMode(): Promise<string>; }
/** Test double; never selected by production factory. */
export class MemoryHandoffStore implements HandoffStore {
  public rows: HandoffRecord[] = [];
  async insert(row: HandoffRecord): Promise<void> { this.rows.push(structuredClone(row)); }
  async getById(id: string): Promise<HandoffRecord | null> { const row = this.rows.find((item) => item.id === id); return row ? structuredClone(row) : null; }
  async listPending(projectId: string, targetAgent?: string | null): Promise<HandoffRecord[]> { return this.rows.filter((row) => row.projectId === projectId && row.status === "open" && (targetAgent == null || row.targetAgent === targetAgent || row.targetAgent == null)).sort((a, b) => a.createdAt - b.createdAt).map((row) => structuredClone(row)); }
  async setStatus(id: string, status: "accepted" | "expired", acceptedAt?: number): Promise<HandoffRecord | null> { const row = this.rows.find((item) => item.id === id); if (!row) return null; row.status = status; row.acceptedAt = status === "accepted" ? acceptedAt ?? Date.now() : null; return structuredClone(row); }
  async update(id: string, patch: HandoffUpdatePatch): Promise<HandoffRecord | null> {
    const row = this.rows.find((item) => item.id === id);
    if (!row) return null;
    if (patch.targetAgent !== undefined) row.targetAgent = patch.targetAgent;
    if (patch.summary !== undefined) row.summary = patch.summary;
    if (patch.openQuestions !== undefined) row.openQuestions = patch.openQuestions;
    if (patch.nextSteps !== undefined) row.nextSteps = patch.nextSteps;
    if (patch.files !== undefined) row.files = patch.files;
    return structuredClone(row);
  }
  async delete(id: string): Promise<string | null> {
    const index = this.rows.findIndex((item) => item.id === id);
    if (index === -1) return null;
    this.rows.splice(index, 1);
    return id;
  }
  async journalMode(): Promise<string> { return "memory"; }
}
