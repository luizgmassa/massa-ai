/**
 * Checkpoint Manager
 *
 * Domain facade + storage for task/INDEX state checkpoints. Serializes task
 * state as gzip-compressed JSON blobs.
 *
 * This versions TASK/INDEX execution state (progress, decisions, files), NOT
 * session continuity. It is the complement of `CompactionSnapshotService`
 * (packages/core/src/services/hooks/compaction-snapshot-service.ts), which
 * preserves SESSION continuity (a bounded TOC of lifecycle events) in
 * observations.db. See `packages/core/src/services/SESSION-STATE.md` for the
 * full reconciliation.
 *
 * Structural gap #16: checkpoints were SQLite-only. The storage contract is now
 * `ICheckpointStore` (checkpoint-store.ts). `CheckpointManager` is BOTH:
 *   - the SQLite-canonical `ICheckpointStore` implementation (raw bun:sqlite,
 *     same schema as before), AND
 *   - a domain facade that holds the restore integrity logic (memory existence
 *     + file-conflict checks + restore-instruction generation), which is
 *     backend-agnostic.
 * `getInstance()` selects the PG store (PgCheckpointStore) when DATABASE_URL is
 * postgres and delegates storage to it, keeping the restore domain logic here
 * so the MCP tools and AutoCheckpointer keep calling `CheckpointManager`
 * unchanged (one-backend rule, mirroring getMemoryRepository /
 * getScheduledJobStore / getSessionStore).
 *
 * Performance Optimizations:
 * - Lazy deserialization: listCheckpointsMetadata() skips state decompression
 *   (Complexity: O(N) queries but O(1) decompression per checkpoint)
 * - On-demand state loading: getCheckpointState() deserializes only when needed
 *   (Measured speedup: 10-50x for metadata-only operations)
 */

import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";
import {
  TaskCheckpoint,
  TaskState,
  CheckpointType,
  RestoreResult,
  config,
  logger,
} from "@massa-th0th/shared";
import type {
  ICheckpointStore,
  CheckpointMetadata,
  ListCheckpointsOptions,
  CreateCheckpointOptions,
  CheckpointStats,
} from "./checkpoint-store.js";

// ── Internal row type ────────────────────────────────────────

interface CheckpointRow {
  id: string;
  task_id: string;
  task_description: string | null;
  agent_id: string | null;
  project_id: string | null;
  state: Buffer;
  state_schema_version: number;
  memory_ids: string | null;
  file_changes: string | null;
  checkpoint_type: string;
  parent_checkpoint_id: string | null;
  created_at: number;
  expires_at: number | null;
}

// Re-export metadata type for backward compatibility (previously defined here).
export type { CheckpointMetadata } from "./checkpoint-store.js";

// ── Implementation ───────────────────────────────────────────

export class CheckpointManager implements ICheckpointStore {
  private db!: Database;
  /**
   * When DATABASE_URL is postgres, storage is delegated to this store; the
   * restore integrity logic stays on CheckpointManager (domain facade).
   * Null means SQLite mode (this.db is the storage).
   */
  private delegate: ICheckpointStore | null = null;
  private static instance: CheckpointManager | null = null;

  static getInstance(): CheckpointManager {
    if (!CheckpointManager.instance) {
      CheckpointManager.instance = new CheckpointManager();
    }
    return CheckpointManager.instance;
  }

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const databaseUrl = process.env.DATABASE_URL;
    const isPostgres =
      databaseUrl?.startsWith("postgresql://") ||
      databaseUrl?.startsWith("postgres://");

    if (isPostgres) {
      // PG backend: delegate storage to PgCheckpointStore (async-mirror +
      // write-through, same discipline as PgSynapseSessionStore). Keep the
      // restore domain logic on this facade. Lazy require so bun:sqlite /
      // the pg adapter stay out of the PG path's import graph.
      try {
        const { PgCheckpointStore } = require("./checkpoint-store-pg.js") as {
          PgCheckpointStore: new () => ICheckpointStore;
        };
        this.delegate = new PgCheckpointStore();
        logger.info("CheckpointManager initialized (PostgreSQL backend)");
      } catch (e) {
        // Fall back to SQLite if the PG store cannot be constructed.
        logger.warn(
          "PgCheckpointStore unavailable — falling back to SQLite (best-effort)",
          { error: (e as Error).message },
        );
        this.delegate = null;
        this.initializeSqlite();
      }
      return;
    }

    this.initializeSqlite();
  }

  private initializeSqlite(): void {
    const dataDir = config.get("dataDir") as string;
    const dbPath = path.join(dataDir, "memories.db");

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec("PRAGMA busy_timeout = 3000");
    this.db.exec("PRAGMA journal_mode = WAL");

    this.createSchema();
    logger.info("CheckpointManager initialized (SQLite backend)");
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_checkpoints (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        task_description TEXT,
        agent_id TEXT,
        project_id TEXT,
        state BLOB NOT NULL,
        state_schema_version INTEGER DEFAULT 1,
        memory_ids TEXT,
        file_changes TEXT,
        checkpoint_type TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON task_checkpoints(task_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON task_checkpoints(project_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON task_checkpoints(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_type ON task_checkpoints(checkpoint_type);
    `);
  }

  // ── Create ───────────────────────────────────────────────

  /**
   * Create a new checkpoint.
   *
   * State is gzip-compressed to minimize storage. Typical compression
   * ratios are 5-10x for JSON task state.
   */
  createCheckpoint(
    state: TaskState,
    options: CreateCheckpointOptions = {},
  ): TaskCheckpoint {
    if (this.delegate) return this.delegate.createCheckpoint(state, options);
    const {
      agentId,
      projectId,
      checkpointType = CheckpointType.MANUAL,
      memoryIds = [],
      fileChanges = [],
      parentCheckpointId,
      ttlMs = 7 * 24 * 60 * 60 * 1000, // 7 days
    } = options;

    const id = this.generateId(checkpointType);
    const now = Date.now();
    const expiresAt = now + ttlMs;

    // Serialize and compress state
    const stateJson = JSON.stringify(state);
    const compressed = this.compress(stateJson);

    this.db
      .prepare(
        `
        INSERT INTO task_checkpoints (
          id, task_id, task_description, agent_id, project_id,
          state, state_schema_version,
          memory_ids, file_changes,
          checkpoint_type, parent_checkpoint_id,
          created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        state.taskId,
        state.description || null,
        agentId || null,
        projectId || null,
        compressed,
        1,
        JSON.stringify(memoryIds),
        JSON.stringify(fileChanges),
        checkpointType,
        parentCheckpointId || null,
        now,
        expiresAt,
      );

    const checkpoint: TaskCheckpoint = {
      id,
      taskId: state.taskId,
      taskDescription: state.description,
      agentId,
      projectId,
      state,
      memoryIds,
      fileChanges,
      checkpointType,
      parentCheckpointId,
      createdAt: now,
      expiresAt,
    };

    logger.info("Checkpoint created", {
      id,
      taskId: state.taskId,
      type: checkpointType,
      compressedBytes: compressed.byteLength,
      originalBytes: stateJson.length,
    });

    return checkpoint;
  }

  // ── Read ─────────────────────────────────────────────────

  /**
   * Get a checkpoint by ID.
   */
  getCheckpoint(checkpointId: string): TaskCheckpoint | null {
    if (this.delegate) return this.delegate.getCheckpoint(checkpointId);
    const row = this.db
      .prepare("SELECT * FROM task_checkpoints WHERE id = ?")
      .get(checkpointId) as CheckpointRow | null;

    return row ? this.rowToCheckpoint(row) : null;
  }

  /**
   * List checkpoints with optional filters.
   */
  listCheckpoints(options: ListCheckpointsOptions = {}): TaskCheckpoint[] {
    if (this.delegate) return this.delegate.listCheckpoints(options);
    const {
      taskId,
      projectId,
      checkpointType,
      includeExpired = false,
      limit = 20,
      offset = 0,
    } = options;

    const conditions: string[] = [];
    const params: any[] = [];

    if (taskId) {
      conditions.push("task_id = ?");
      params.push(taskId);
    }

    if (projectId) {
      conditions.push("project_id = ?");
      params.push(projectId);
    }

    if (checkpointType) {
      conditions.push("checkpoint_type = ?");
      params.push(checkpointType);
    }

    if (!includeExpired) {
      conditions.push("(expires_at IS NULL OR expires_at > ?)");
      params.push(Date.now());
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(limit, offset);

    const rows = this.db
      .prepare(
        `
        SELECT * FROM task_checkpoints
        ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(...params) as CheckpointRow[];

    return rows.map((r) => this.rowToCheckpoint(r));
  }

  /**
   * List checkpoints metadata without deserializing state (lazy deserialization).
   * 
   * Performance: 10-50x faster than listCheckpoints() for metadata-only operations.
   * Use this when you only need checkpoint IDs, timestamps, types, etc.
   * 
   * @example
   * // Fast: Get list of checkpoint IDs and timestamps
   * const metadata = manager.listCheckpointsMetadata({ taskId: "task_1" });
   * for (const meta of metadata) {
   *   console.log(`${meta.id}: ${new Date(meta.createdAt)}`);
   * }
   * 
   * // Then deserialize only the one you need:
   * const state = manager.getCheckpointState(selectedId);
   */
  listCheckpointsMetadata(options: ListCheckpointsOptions = {}): CheckpointMetadata[] {
    if (this.delegate) return this.delegate.listCheckpointsMetadata(options);
    const {
      taskId,
      projectId,
      checkpointType,
      includeExpired = false,
      limit = 20,
      offset = 0,
    } = options;

    const conditions: string[] = [];
    const params: any[] = [];

    if (taskId) {
      conditions.push("task_id = ?");
      params.push(taskId);
    }

    if (projectId) {
      conditions.push("project_id = ?");
      params.push(projectId);
    }

    if (checkpointType) {
      conditions.push("checkpoint_type = ?");
      params.push(checkpointType);
    }

    if (!includeExpired) {
      conditions.push("(expires_at IS NULL OR expires_at > ?)");
      params.push(Date.now());
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(limit, offset);

    const rows = this.db
      .prepare(
        `
        SELECT 
          id, task_id, task_description, agent_id, project_id,
          LENGTH(state) as state_size,
          memory_ids, file_changes,
          checkpoint_type, parent_checkpoint_id,
          created_at, expires_at
        FROM task_checkpoints
        ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(...params) as Array<Omit<CheckpointRow, "state" | "state_schema_version"> & { state_size: number }>;

    return rows.map((r) => this.rowToMetadata(r));
  }

  /**
   * Get checkpoint state by ID (lazy deserialization).
   * 
   * Use this after listCheckpointsMetadata() to deserialize only the checkpoint you need.
   * 
   * @param checkpointId - Checkpoint ID
   * @returns Deserialized task state, or null if not found
   */
  getCheckpointState(checkpointId: string): TaskState | null {
    if (this.delegate) return this.delegate.getCheckpointState(checkpointId);
    const row = this.db
      .prepare("SELECT state FROM task_checkpoints WHERE id = ?")
      .get(checkpointId) as { state: Buffer } | null;

    if (!row) return null;

    const stateJson = this.decompress(
      row.state instanceof Buffer ? row.state : Buffer.from(row.state),
    );
    return JSON.parse(stateJson);
  }

  /**
   * Get the latest checkpoint for a task.
   */
  getLatestCheckpoint(taskId: string): TaskCheckpoint | null {
    if (this.delegate) return this.delegate.getLatestCheckpoint(taskId);
    const row = this.db
      .prepare(
        `
        SELECT * FROM task_checkpoints
        WHERE task_id = ?
          AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY created_at DESC
        LIMIT 1
      `,
      )
      .get(taskId, Date.now()) as CheckpointRow | null;

    return row ? this.rowToCheckpoint(row) : null;
  }

  // ── Restore ──────────────────────────────────────────────

  /**
   * Restore a checkpoint, verifying memory and file integrity.
   */
  restoreCheckpoint(checkpointId: string): RestoreResult | null {
    const checkpoint = this.getCheckpoint(checkpointId);
    if (!checkpoint) return null;

    // Check which referenced memories still exist (backend-aware: SQLite queries
    // the memories table; PG queries via the PG store / prisma best-effort).
    const validMemoryIds: string[] = [];
    const missingMemoryIds: string[] = [];

    if (checkpoint.memoryIds.length > 0) {
      const existingSet = new Set(this.countExistingMemoryIds(checkpoint.memoryIds));
      for (const mid of checkpoint.memoryIds) {
        if (existingSet.has(mid)) {
          validMemoryIds.push(mid);
        } else {
          missingMemoryIds.push(mid);
        }
      }
    }

    // Check for file conflicts (files that changed since checkpoint)
    const fileConflicts: string[] = [];
    for (const filePath of checkpoint.fileChanges) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs > checkpoint.createdAt) {
          fileConflicts.push(filePath);
        }
      } catch {
        // File no longer exists — also a conflict
        fileConflicts.push(filePath);
      }
    }

    // Generate restore instructions
    const restoreInstructions = this.generateRestoreInstructions(
      checkpoint,
      validMemoryIds,
      missingMemoryIds,
      fileConflicts,
    );

    logger.info("Checkpoint restored", {
      checkpointId,
      taskId: checkpoint.taskId,
      validMemories: validMemoryIds.length,
      missingMemories: missingMemoryIds.length,
      fileConflicts: fileConflicts.length,
    });

    return {
      checkpoint,
      validMemoryIds,
      missingMemoryIds,
      fileConflicts,
      restoreInstructions,
    };
  }

  // ── Delete / Cleanup ─────────────────────────────────────

  /**
   * Delete a checkpoint by ID.
   */
  deleteCheckpoint(checkpointId: string): boolean {
    if (this.delegate) return this.delegate.deleteCheckpoint(checkpointId);
    const result = this.db
      .prepare("DELETE FROM task_checkpoints WHERE id = ?")
      .run(checkpointId);
    return (result as any).changes > 0;
  }

  /**
   * Purge expired checkpoints.
   */
  purgeExpired(): number {
    if (this.delegate) return this.delegate.purgeExpired();
    const result = this.db
      .prepare(
        "DELETE FROM task_checkpoints WHERE expires_at IS NOT NULL AND expires_at < ?",
      )
      .run(Date.now());
    const count = (result as any).changes ?? 0;

    if (count > 0) {
      logger.info("Expired checkpoints purged", { count });
    }

    return count;
  }

  // ── Backend-aware memory existence (restore integrity check) ─

  /**
   * Count which of the given memory ids still exist. SQLite queries the
   * memories table (same DB as task_checkpoints). PG backends query via the PG
   * store / prisma best-effort. Used by restoreCheckpoint's integrity check.
   */
  countExistingMemoryIds(memoryIds: string[]): string[] {
    if (this.delegate) return this.delegate.countExistingMemoryIds(memoryIds);
    if (memoryIds.length === 0) return [];
    const placeholders = memoryIds.map(() => "?").join(",");
    try {
      const existingRows = this.db
        .prepare(`SELECT id FROM memories WHERE id IN (${placeholders})`)
        .all(...memoryIds) as Array<{ id: string }>;
      return existingRows.map((r) => r.id);
    } catch (e) {
      // memories table missing or query failed — best-effort: assume all exist
      // so a restore is never blocked by an unrelated query error.
      logger.warn("countExistingMemoryIds failed (best-effort: assuming all exist)", {
        error: (e as Error).message,
      });
      return memoryIds;
    }
  }

  /**
   * Await backend readiness before a read (hydration race fix, #16).
   * SQLite reads are synchronous (bun:sqlite) so this resolves immediately;
   * the PG backend awaits its mirror hydration so the first read after a
   * process restart observes persisted rows.
   */
  ensureReady(): Promise<void> {
    if (this.delegate) return this.delegate.ensureReady();
    return Promise.resolve();
  }

  // ── Stats ────────────────────────────────────────────────

  getStats(): CheckpointStats {
    if (this.delegate) return this.delegate.getStats();
    const total = (
      this.db
        .prepare("SELECT COUNT(*) as count FROM task_checkpoints")
        .get() as { count: number }
    ).count;

    const byType = this.db
      .prepare(
        "SELECT checkpoint_type, COUNT(*) as count FROM task_checkpoints GROUP BY checkpoint_type",
      )
      .all() as Array<{ checkpoint_type: string; count: number }>;

    const sizeRow = this.db
      .prepare(
        "SELECT SUM(LENGTH(state)) as total_size FROM task_checkpoints",
      )
      .get() as { total_size: number | null };

    const oldestRow = this.db
      .prepare(
        "SELECT MIN(created_at) as oldest FROM task_checkpoints",
      )
      .get() as { oldest: number | null };

    const typeMap: Record<string, number> = {};
    for (const row of byType) {
      typeMap[row.checkpoint_type] = row.count;
    }

    return {
      totalCheckpoints: total,
      byType: typeMap,
      totalSizeBytes: sizeRow.total_size ?? 0,
      oldestCheckpointAge: oldestRow.oldest
        ? Date.now() - oldestRow.oldest
        : undefined,
    };
  }

  // ── Private helpers ──────────────────────────────────────

  private compress(json: string): Buffer {
    const input = Buffer.from(json, "utf-8");
    const deflated = Bun.deflateSync(input);
    return Buffer.from(deflated);
  }

  private decompress(data: Buffer): string {
    const inflated = Bun.inflateSync(new Uint8Array(data));
    return Buffer.from(inflated).toString("utf-8");
  }

  private rowToCheckpoint(row: CheckpointRow): TaskCheckpoint {
    const stateJson = this.decompress(
      row.state instanceof Buffer ? row.state : Buffer.from(row.state),
    );
    const state: TaskState = JSON.parse(stateJson);

    return {
      id: row.id,
      taskId: row.task_id,
      taskDescription: row.task_description ?? undefined,
      agentId: row.agent_id ?? undefined,
      projectId: row.project_id ?? undefined,
      state,
      memoryIds: row.memory_ids ? JSON.parse(row.memory_ids) : [],
      fileChanges: row.file_changes ? JSON.parse(row.file_changes) : [],
      checkpointType: row.checkpoint_type as CheckpointType,
      parentCheckpointId: row.parent_checkpoint_id ?? undefined,
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? undefined,
    };
  }

  /**
   * Convert row to lightweight metadata (no state deserialization).
   * This is the key optimization: skips decompress() and JSON.parse().
   */
  private rowToMetadata(
    row: Omit<CheckpointRow, "state" | "state_schema_version"> & { state_size: number }
  ): CheckpointMetadata {
    const memoryIds = row.memory_ids ? JSON.parse(row.memory_ids) : [];
    const fileChanges = row.file_changes ? JSON.parse(row.file_changes) : [];

    return {
      id: row.id,
      taskId: row.task_id,
      taskDescription: row.task_description ?? undefined,
      agentId: row.agent_id ?? undefined,
      projectId: row.project_id ?? undefined,
      checkpointType: row.checkpoint_type as CheckpointType,
      parentCheckpointId: row.parent_checkpoint_id ?? undefined,
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? undefined,
      compressedSizeBytes: row.state_size,
      memoryCount: memoryIds.length,
      fileChangeCount: fileChanges.length,
    };
  }

  private generateRestoreInstructions(
    checkpoint: TaskCheckpoint,
    validMemoryIds: string[],
    missingMemoryIds: string[],
    fileConflicts: string[],
  ): string {
    const lines: string[] = [];
    const state = checkpoint.state;

    lines.push(`## Checkpoint Restore: ${state.description}`);
    lines.push(`Task ID: ${state.taskId}`);
    lines.push(
      `Status at checkpoint: ${state.status} (${state.progress.percentage}% complete)`,
    );
    lines.push(`Current step: ${state.progress.currentStep}`);

    if (state.agentState.nextAction) {
      lines.push(`\n### Next Action\n${state.agentState.nextAction}`);
    }

    if (state.agentState.pendingValidations.length > 0) {
      lines.push(`\n### Pending Validations`);
      for (const v of state.agentState.pendingValidations) {
        lines.push(`- ${v}`);
      }
    }

    if (state.context.decisions.length > 0) {
      lines.push(
        `\n### Decisions Made (${validMemoryIds.length}/${state.context.decisions.length} memories available)`,
      );
    }

    if (missingMemoryIds.length > 0) {
      lines.push(
        `\n### Warning: ${missingMemoryIds.length} referenced memories no longer exist`,
      );
    }

    if (fileConflicts.length > 0) {
      lines.push(
        `\n### File Conflicts (${fileConflicts.length} files changed since checkpoint)`,
      );
      for (const f of fileConflicts) {
        lines.push(`- ${f}`);
      }
    }

    if (state.context.errors.length > 0) {
      lines.push(`\n### Previous Errors (${state.context.errors.length})`);
      for (const err of state.context.errors.slice(-3)) {
        lines.push(`- ${err.message} (step: ${err.step ?? "unknown"})`);
      }
    }

    if (state.context.learnings.length > 0) {
      lines.push(`\n### Learnings`);
      for (const l of state.context.learnings) {
        lines.push(`- ${l}`);
      }
    }

    return lines.join("\n");
  }

  private generateId(type: CheckpointType): string {
    return `ckpt_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  close(): void {
    if (this.delegate) {
      this.delegate.close();
      this.delegate = null;
    }
    this.db?.close();
    CheckpointManager.instance = null;
  }
}
