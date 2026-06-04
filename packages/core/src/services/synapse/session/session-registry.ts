/**
 * SessionRegistry — in-memory store of agent sessions.
 *
 * Kept deliberately simple: a Map keyed by sessionId with lazy TTL eviction.
 * Persistence is out of scope; sessions are by definition ephemeral context
 * windows for an agent working on a task right now.
 */

import type { AgentSession } from "../types.js";
import {
  WorkingMemoryBuffer,
  type WorkingMemoryBufferConfig,
} from "../buffer/working-memory-buffer.js";

const TOKEN_RE = /[a-z0-9_]{2,}/g;

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of text.toLowerCase().matchAll(TOKEN_RE)) {
    tokens.add(match[0]);
  }
  return tokens;
}

export interface CreateSessionInput {
  sessionId: string;
  agentId: string;
  workspaceId?: string;
  taskContext?: string;
  taskEmbedding?: Float32Array | number[];
  ttlMs?: number;
  /** Provide a buffer config to attach a WorkingMemoryBuffer to this session. */
  bufferConfig?: WorkingMemoryBufferConfig;
  /**
   * Maximum entries in accessHistory before LRU eviction kicks in (IMP-11).
   * Defaults to 1000 — large enough for any single agent run, small enough
   * to keep memory predictable.
   */
  accessHistoryMaxEntries?: number;
}

const DEFAULT_ACCESS_HISTORY_LIMIT = 1000;

export class SessionRegistry {
  private sessions = new Map<string, AgentSession>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 3_600_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  create(input: CreateSessionInput, now: number = Date.now()): AgentSession {
    const ttl = input.ttlMs ?? this.defaultTtlMs;
    const session: AgentSession = {
      sessionId: input.sessionId,
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      taskContext: input.taskContext,
      taskTokens: input.taskContext ? tokenize(input.taskContext) : undefined,
      taskEmbedding: input.taskEmbedding,
      createdAt: now,
      expiresAt: now + ttl,
      accessHistory: new Map(),
      accessHistoryLimit: input.accessHistoryMaxEntries ?? DEFAULT_ACCESS_HISTORY_LIMIT,
      buffer: input.bufferConfig ? new WorkingMemoryBuffer(input.bufferConfig) : undefined,
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Retrieve a live session. IMP-10: an active `get()` slides the TTL
   * forward so a session in use does not silently expire mid-task.
   * The slide is bounded to defaultTtlMs from `now` — accessing a session
   * never extends it beyond what a fresh `create()` would give.
   */
  get(sessionId: string, now: number = Date.now()): AgentSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.expiresAt <= now) {
      this.sessions.delete(sessionId);
      return null;
    }
    const refreshed = now + this.defaultTtlMs;
    if (refreshed > session.expiresAt) {
      session.expiresAt = refreshed;
    }
    return session;
  }

  /**
   * Update the task context for an existing session and refresh its TTL.
   */
  updateTaskContext(
    sessionId: string,
    taskContext: string,
    taskEmbedding?: Float32Array | number[],
    now: number = Date.now(),
  ): AgentSession | null {
    const session = this.get(sessionId, now);
    if (!session) return null;
    session.taskContext = taskContext;
    session.taskTokens = tokenize(taskContext);
    if (taskEmbedding) session.taskEmbedding = taskEmbedding;
    session.expiresAt = now + this.defaultTtlMs;
    return session;
  }

  /**
   * Record that the agent accessed a memory inside this session.
   * Used by agent-affinity scoring.
   *
   * IMP-11: the Map is bounded by `accessHistoryLimit`. Re-recording an
   * existing key refreshes its recency (delete-then-set), keeping the LRU
   * intuition exact even with the small overhead.
   */
  recordAccess(sessionId: string, memoryId: string, now: number = Date.now()): void {
    const session = this.get(sessionId, now);
    if (!session) return;
    const history = session.accessHistory;
    if (history.has(memoryId)) {
      const current = history.get(memoryId)!;
      history.delete(memoryId);
      history.set(memoryId, current + 1);
      return;
    }
    history.set(memoryId, 1);
    while (history.size > session.accessHistoryLimit) {
      const oldest = history.keys().next().value;
      if (oldest === undefined) break;
      history.delete(oldest);
    }
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /** Evict expired sessions. Called opportunistically. */
  evictExpired(now: number = Date.now()): number {
    let evicted = 0;
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
        evicted++;
      }
    }
    return evicted;
  }

  size(): number {
    return this.sessions.size;
  }

  /** Test hook. */
  clear(): void {
    this.sessions.clear();
  }
}

let registry: SessionRegistry | null = null;

export function getSessionRegistry(): SessionRegistry {
  if (!registry) registry = new SessionRegistry();
  return registry;
}

export function resetSessionRegistry(): void {
  registry = null;
}
