/**
 * service — production composition of the Core `ProjectIdentityService`
 * (preview + apply) over the shared pg pool (spec public contract). T5
 * transports (REST/MCP) consume this factory; tests inject their own
 * client acquisition.
 *
 * Composition defaults match the T4 wiring: production invalidator registry
 * (five cache invalidators incl. the alias resolver) and the EventBus-backed
 * best-effort publisher.
 */

import { getPgPool } from "../../data/db-connection.js";
import {
  createProjectIdentityApplyService,
  type ProjectIdentityChangedPublisher,
} from "./apply.js";
import { ProjectIdentityError } from "./errors.js";
import type {
  ProjectIdentityApplyInput,
  ProjectIdentityApplyResult,
  ProjectIdentityPreview,
  ProjectIdentityPreviewInput,
  ProjectIdentityService,
  ProjectIdentityTransactionClient,
} from "./contracts.js";
import type { ProjectIdentityInvalidatorRegistry } from "./invalidator-registry.js";
import { ProjectIdentityPreviewPlanner } from "./planner.js";
import {
  createEventBusProjectIdentityChangedPublisher,
  createProductionProjectIdentityInvalidatorRegistry,
} from "./production-wiring.js";

/** Minimal pg PoolClient surface the adapter needs. */
interface PgClientLike {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
  release(): void;
}

/**
 * Adapt a raw pg PoolClient to the transaction client contract by issuing
 * real BEGIN/COMMIT/ROLLBACK statements.
 */
function wrapPgClient(client: PgClientLike): ProjectIdentityTransactionClient & PgClientLike {
  return Object.assign(client, {
    async beginTransaction(): Promise<void> {
      await client.query("BEGIN");
    },
    async commitTransaction(): Promise<void> {
      await client.query("COMMIT");
    },
    async rollbackTransaction(): Promise<void> {
      await client.query("ROLLBACK");
    },
  }) as ProjectIdentityTransactionClient & PgClientLike;
}

export interface CreateProjectIdentityServiceOptions {
  readonly schema?: string;
  readonly invalidators?: ProjectIdentityInvalidatorRegistry;
  readonly publisher?: ProjectIdentityChangedPublisher;
  /** Test seam: custom client acquisition. Defaults to the shared pg pool. */
  readonly acquireClient?: () => Promise<ProjectIdentityTransactionClient>;
  readonly releaseClient?: (client: ProjectIdentityTransactionClient) => Promise<void>;
}

/**
 * Build the Core identity service. Preview runs on a short-lived pooled
 * client (read-only); apply runs through the transactional apply service
 * with ordered locks, idempotency, and T4 post-commit invalidation/event.
 */
export function createProjectIdentityService(
  options: CreateProjectIdentityServiceOptions = {},
): ProjectIdentityService {
  const schema = options.schema ?? "public";
  const acquire =
    options.acquireClient ??
    (async () => {
      const pool = await getPgPool();
      return wrapPgClient(await pool.connect());
    });
  const release =
    options.releaseClient ??
    (async (client) => {
      (client as unknown as PgClientLike).release();
    });

  const applyService = createProjectIdentityApplyService(acquire, release, {
    invalidators: options.invalidators ?? createProductionProjectIdentityInvalidatorRegistry(),
    publisher: options.publisher ?? createEventBusProjectIdentityChangedPublisher(),
    schema,
  });

  return {
    async preview(input: ProjectIdentityPreviewInput): Promise<ProjectIdentityPreview> {
      // Acquire inside the typed boundary: a pool/connect failure must surface
      // as PROJECT_IDENTITY_BACKEND_UNAVAILABLE (503), matching apply (req 9).
      let client: ProjectIdentityTransactionClient;
      try {
        client = await acquire();
      } catch (error) {
        if (error instanceof ProjectIdentityError) throw error;
        throw new ProjectIdentityError("PROJECT_IDENTITY_BACKEND_UNAVAILABLE", { cause: error });
      }
      try {
        return await new ProjectIdentityPreviewPlanner(client, schema).preview(input);
      } finally {
        await release(client);
      }
    },
    apply(input: ProjectIdentityApplyInput): Promise<ProjectIdentityApplyResult> {
      return applyService.apply(input);
    },
  };
}
