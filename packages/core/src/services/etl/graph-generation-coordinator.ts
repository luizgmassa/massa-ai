import { createHash } from "node:crypto";
import { getGraphGenerationRepository } from "../../data/graph-generation/graph-generation-repository-factory.js";
import { withDeadlockRetry } from "../../data/with-deadlock-retry.js";
import type {
  ActivateGraphGenerationOutcome,
  GraphGenerationLease,
  GraphGenerationRepository,
} from "../../data/graph-generation/graph-generation-contract.js";

const GRAPH_GENERATION_LEASE_TTL_MS = 300_000;

export interface GraphInputSnapshotEntry {
  relativePath: string;
  contentHash: string;
  size: number;
}

export function buildGraphInputSnapshotHash(files: readonly GraphInputSnapshotEntry[]): string {
  const canonicalSnapshot = [...files]
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map(({ relativePath, contentHash, size }) => [relativePath.normalize("NFC"), contentHash, size]);
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalSnapshot)).digest("hex")}`;
}

export interface BeginGraphBuildInput {
  projectId: string;
  expectedActiveGenerationId: string | null;
  fingerprint: string;
  inputSnapshotHash: string;
  expectedFilesCount: number;
}

export class GraphGenerationCoordinator {
  constructor(private readonly repository: GraphGenerationRepository = getGraphGenerationRepository()) {}

  async begin(input: BeginGraphBuildInput): Promise<GraphGenerationLease> {
    const deadline = Date.now() + GRAPH_GENERATION_LEASE_TTL_MS;
    for (;;) {
      const outcome = await this.repository.begin({ ...input, leaseTtlMs: GRAPH_GENERATION_LEASE_TTL_MS });
      if (outcome.status === "acquired") return outcome.lease;
      if (outcome.status === "stale_active") {
        throw new Error(`graph_generation_stale_active:${outcome.activeGenerationId ?? "none"}`);
      }
      if (Date.now() >= deadline) throw new Error(`graph_generation_busy:${outcome.generationId}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async heartbeat(lease: GraphGenerationLease): Promise<void> {
    // The lease renewal UPDATE contends with concurrent per-file Load writes
    // for the generation row; a transient deadlock (40P01) here would otherwise
    // abort the whole index run. Retry — the renewal is idempotent.
    const outcome = await withDeadlockRetry(
      () => this.repository.heartbeat(lease, GRAPH_GENERATION_LEASE_TTL_MS),
      { operation: "graph_generation.heartbeat", maxAttempts: 3 },
    );
    if (outcome.status !== "renewed") throw new Error("graph_generation_lease_lost");
  }

  async activate(lease: GraphGenerationLease): Promise<Extract<ActivateGraphGenerationOutcome, { status: "activated" }>> {
    const completeness = await this.repository.complete(lease);
    if (completeness.status === "incomplete") {
      throw new Error(`graph_generation_incomplete:${completeness.reasons.join(",")}`);
    }
    if (completeness.status === "lease_lost") throw new Error("graph_generation_lease_lost");
    if (completeness.status === "stale_active") {
      throw new Error(`graph_generation_stale_active:${completeness.activeGenerationId ?? "none"}`);
    }

    const activation = await this.repository.activate(lease);
    if (activation.status === "activated") return activation;
    if (activation.status === "incomplete") {
      throw new Error(`graph_generation_incomplete:${activation.reasons.join(",")}`);
    }
    if (activation.status === "lease_lost") throw new Error("graph_generation_lease_lost");
    throw new Error(`graph_generation_stale_active:${activation.activeGenerationId ?? "none"}`);
  }

  async abort(lease: GraphGenerationLease, reason: string): Promise<void> {
    const outcome = await this.repository.abort(lease, reason);
    if (outcome.status === "lease_lost") throw new Error("graph_generation_lease_lost_during_abort");
  }

  async cleanup(lease: GraphGenerationLease): Promise<void> {
    await this.repository.cleanupSuperseded(lease.projectId, { retainedGenerationIds: [lease.generationId] });
  }
}
