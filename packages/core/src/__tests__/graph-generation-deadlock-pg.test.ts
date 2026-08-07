/**
 * Deadlock reproduction: lease renewal vs per-file generation writes.
 *
 * Every symbol_* table FKs to workspaces(project_id), so a per-file
 * writeFileGeneration transaction takes an implicit FOR KEY SHARE on the
 * workspaces row *after* it has taken FOR UPDATE on its graph_generations row
 * (generation → workspace order). The lease methods must lock in that same
 * order — a workspace-first lease method forms an AB-BA cycle with any
 * in-flight file writer and PostgreSQL aborts one side with SQLSTATE 40P01.
 *
 * This suite hammers repository.heartbeat concurrently with 10-wide
 * writeFileGeneration batches against a real PostgreSQL and asserts that no
 * 40P01 escapes the repository layer. Gated like its lifecycle sibling:
 * RUN_GRAPH_GENERATION_DEADLOCK=1 + MASSA_AI_DEDICATED=1 against the
 * dedicated throwaway-database server.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import type {
  GraphGenerationLease,
  GraphGenerationRepository,
} from "../data/graph-generation/graph-generation-contract.js";
import { isRetriableTransactionError } from "../data/with-deadlock-retry.js";

const expectedAdminUrl = "postgresql://test@127.0.0.1:5433/postgres";
const integrationRequested = process.env.RUN_GRAPH_GENERATION_DEADLOCK === "1" &&
  process.env.MASSA_AI_DEDICATED === "1";
const databaseName = `massa_graph_deadlock_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const projectId = "deadlock-project";

const WRITE_BATCHES = 30;
const BATCH_WIDTH = 10;

let admin: Client | undefined;
let db: Client | undefined;
let repository: GraphGenerationRepository;
let writeFileGeneration: (input: {
  lease: GraphGenerationLease;
  file: Record<string, unknown>;
  definitions: unknown[];
  references: unknown[];
  imports: unknown[];
}) => Promise<{ status: string }>;
let ownsDatabase = false;
let previousDatabaseUrl: string | undefined;

function migrations(): string[] {
  const root = join(import.meta.dir, "../../prisma/migrations");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((directory) => readFileSync(join(root, directory, "migration.sql"), "utf8"));
}

function fileWrite(lease: GraphGenerationLease, relativePath: string) {
  return {
    lease,
    file: {
      project_id: projectId,
      relative_path: relativePath,
      content_hash: `hash-${relativePath}`,
      mtime: 1,
      size: 10,
      indexed_at: Date.now(),
      symbol_count: 0,
      chunk_count: 0,
      language: "typescript",
      parser_status: "ok",
      parser_error_count: 0,
      diagnostics: [],
      is_stale: false,
    },
    definitions: [],
    references: [],
    imports: [],
  };
}

beforeAll(async () => {
  if (!integrationRequested) return;
  const isDarwinArm64 = process.platform === "darwin" && process.arch === "arm64";
  const isLinuxX64 = process.platform === "linux" && process.arch === "x64";
  if (!isDarwinArm64 && !isLinuxX64) {
    throw new Error(`graph-generation deadlock PG tests require macOS arm64 or Linux glibc x64, got ${process.platform}/${process.arch}`);
  }
  expect(process.env.GRAPH_GENERATION_TEST_ADMIN_URL).toBe(expectedAdminUrl);
  expect(databaseName).toMatch(/^massa_graph_deadlock_[a-zA-Z0-9_]+$/);

  admin = new Client({ connectionString: expectedAdminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  ownsDatabase = true;

  const databaseUrl = `postgresql://test@127.0.0.1:5433/${databaseName}`;
  db = new Client({ connectionString: databaseUrl });
  await db.connect();
  for (const migration of migrations()) await db.query(migration);

  previousDatabaseUrl = process.env.DATABASE_URL;
  // The batch writers and the heartbeat loop each need a live interactive
  // transaction; raise the pool above BATCH_WIDTH + 1 so contention is on
  // row locks, not on connection acquisition.
  process.env.DATABASE_URL = `${databaseUrl}?connection_limit=25`;
  const prisma = await import("../kernel/prisma-client.js");
  prisma._resetPrismaForTesting();
  const repositoryModule = await import("../data/graph-generation/graph-generation-repository-pg.js");
  repository = repositoryModule.GraphGenerationRepositoryPg.getInstance();
  const generationModule = await import("../data/symbol/symbol-repo-generation.js");
  writeFileGeneration = generationModule.writeFileGeneration as typeof writeFileGeneration;

  await db.query(
    `INSERT INTO workspaces (project_id, project_path, display_name, status, updated_at)
     VALUES ($1, '/tmp/deadlock-project', 'Deadlock', 'indexed', NOW())`,
    [projectId],
  );
});

afterAll(async () => {
  if (!integrationRequested) return;
  const { disconnectPrisma } = await import("../kernel/prisma-client.js");
  await disconnectPrisma();
  await db?.end();
  if (admin && ownsDatabase) {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName],
    );
    await admin.query(`DROP DATABASE "${databaseName}"`);
    ownsDatabase = false;
  }
  await admin?.end();
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

describe.skipIf(!integrationRequested)("graph-generation lock-order deadlock", () => {
  test("continuous heartbeat concurrent with 10-wide file-write batches surfaces no 40P01", async () => {
    const begun = await repository.begin({
      projectId,
      expectedActiveGenerationId: null,
      fingerprint: "structural:v2",
      inputSnapshotHash: `snapshot:${randomUUID()}`,
      expectedFilesCount: WRITE_BATCHES * BATCH_WIDTH,
      leaseTtlMs: 60_000,
    });
    expect(begun.status).toBe("acquired");
    if (begun.status !== "acquired") throw new Error("begin failed");
    const lease = begun.lease;

    const deadlocks: unknown[] = [];
    let writersDone = false;

    const heartbeatLoop = (async () => {
      while (!writersDone) {
        try {
          const outcome = await repository.heartbeat(lease, 60_000);
          expect(outcome.status).toBe("renewed");
        } catch (error) {
          if (!isRetriableTransactionError(error)) throw error;
          deadlocks.push(error);
        }
      }
    })();

    for (let batch = 0; batch < WRITE_BATCHES && deadlocks.length === 0; batch++) {
      await Promise.all(Array.from({ length: BATCH_WIDTH }, (_, index) =>
        writeFileGeneration(fileWrite(lease, `src/f${batch}-${index}.ts`))
          .then((outcome) => expect(outcome.status).toBe("written"))
          .catch((error) => {
            if (!isRetriableTransactionError(error)) throw error;
            deadlocks.push(error);
          }),
      ));
    }
    writersDone = true;
    await heartbeatLoop;

    expect(deadlocks).toHaveLength(0);
  }, 120_000);
});
