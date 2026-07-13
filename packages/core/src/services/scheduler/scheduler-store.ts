import type { ScheduledJob } from "./scheduler-types.js";
/** Backend-neutral scheduler persistence contract. */
export interface ScheduledJobStore { save(job: ScheduledJob): void; get(id: string): ScheduledJob | null; listAll(): ScheduledJob[]; listEnabled(): ScheduledJob[]; delete(id: string): void; }
