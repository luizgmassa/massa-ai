import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { logger } from "@massa-ai/shared";
import { ManagedRunRepositoryPg } from "../../data/managed-runs/managed-run-repository-pg.js";
import type { ManagedRunLease } from "../../data/managed-runs/managed-run-contract.js";

export type HeavyWorkKind = "reindex" | "maintenance";

export interface HeavyWorkState {
  busy: boolean;
  reason?: string;
}

type HeavyWorkRepository = Pick<ManagedRunRepositoryPg, "begin" | "heartbeat" | "release" | "getAnyActive">;

const HEARTBEAT_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;

let repositoryOverride: HeavyWorkRepository | null = null;

export function _setHeavyWorkRepositoryForTesting(repository: HeavyWorkRepository | null): void {
  repositoryOverride = repository;
}

function repository(): HeavyWorkRepository {
  return repositoryOverride ?? ManagedRunRepositoryPg.getInstance();
}

export async function withHeavyWorkLease<T>(
  kind: HeavyWorkKind,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let repo: HeavyWorkRepository | undefined;
  let lease: ManagedRunLease | undefined;
  try {
    repo = repository();
    const outcome = await repo.begin({
      projectId: `heavy-work:${label}:${randomUUID()}`,
      runKind: kind,
      eventId: `heavy-work:${label}`,
    });
    if (outcome.status === "acquired") lease = outcome.lease;
  } catch (error) {
    logger.warn("heavy-work lease unavailable; running without it", { label, error: error as Error });
  }
  if (!repo || !lease) return fn();

  const heldRepo = repo;
  const heldLease = lease;
  const heartbeatController = new AbortController();
  void (async () => {
    while (true) {
      try { await delay(HEARTBEAT_MS, undefined, { signal: heartbeatController.signal }); }
      catch { return; }
      try { await heldRepo.heartbeat(heldLease); } catch { /* best-effort */ }
    }
  })();

  try {
    return await fn();
  } finally {
    heartbeatController.abort();
    try {
      await heldRepo.release(heldLease);
    } catch (error) {
      logger.warn("heavy-work lease release failed; it expires on its own", { label, error: error as Error });
    }
  }
}

export async function probeHeavyWork(): Promise<HeavyWorkState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`heavy-work probe timed out after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS);
  });
  try {
    const active = await Promise.race([repository().getAnyActive(), timeout]);
    if (!active) return { busy: false };
    return { busy: true, reason: `${active.runKind} run ${active.runId} (${active.projectId})` };
  } finally {
    clearTimeout(timer);
  }
}
