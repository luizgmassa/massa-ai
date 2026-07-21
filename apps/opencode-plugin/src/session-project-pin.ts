/**
 * SessionProjectPin — per-session memo of the plugin's project id
 * (M45 / HAR-04, OpenCode emitter half).
 *
 * The first event of a session computes the id with the precedence
 *   project?.id  >  git toplevel basename  >  directory basename  >  "default"
 * and memos it; later events of the same session reuse the memoized id even
 * when the host reports a subdirectory context. Events without a session id
 * are not memoized (nothing to key on) — the id is recomputed, matching prior
 * behavior. The memo is bounded (oldest session evicted at the cap).
 *
 * Also exports `agentIdOf` (HAR-06 emitter half): emits carry `agentId` when
 * the host context provides one, honestly omitted otherwise.
 */

import { spawnSync } from "child_process";

export const DEFAULT_MAX_SESSIONS = 1_000;

export interface SessionProjectPinDeps {
  /** Compute the project id from the plugin instance context. */
  computeProjectId: () => string;
  /** Memo bound (oldest session evicted). Default 1000. */
  maxSessions?: number;
}

export class SessionProjectPin {
  private readonly deps: SessionProjectPinDeps;
  private readonly memo = new Map<string, string>();

  constructor(deps: SessionProjectPinDeps) {
    this.deps = deps;
  }

  /** Project id for an event of `sessionId` (unmemoized when absent). */
  for(sessionId?: string): string {
    if (!sessionId) return this.deps.computeProjectId();
    const hit = this.memo.get(sessionId);
    if (hit !== undefined) return hit;
    const id = this.deps.computeProjectId();
    const max = this.deps.maxSessions ?? DEFAULT_MAX_SESSIONS;
    if (this.memo.size >= max) {
      const oldest = this.memo.keys().next();
      if (!oldest.done) this.memo.delete(oldest.value);
    }
    this.memo.set(sessionId, id);
    return id;
  }

  /** Number of memoized sessions (test introspection). */
  get size(): number {
    return this.memo.size;
  }
}

/**
 * Compute the plugin project id:
 * explicit project id > git toplevel basename > directory basename > "default".
 */
export function computePluginProjectId(params: {
  projectId?: string;
  /** Directory to attribute (plugin worktree || directory). */
  directory?: string;
  /** Injectable git toplevel lookup for tests; must never throw. */
  gitToplevel?: (cwd: string) => string | undefined;
}): string {
  if (params.projectId) return params.projectId;
  if (params.directory) {
    const top = params.gitToplevel?.(params.directory);
    const topBase = top?.split("/").pop();
    if (topBase) return topBase;
    const dirBase = params.directory.split("/").pop();
    if (dirBase) return dirBase;
  }
  return "default";
}

/** Silent-degrading `git rev-parse --show-toplevel` (never throws). */
export function gitToplevelSafe(cwd: string): string | undefined {
  try {
    const res = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      timeout: 1_000,
    });
    if (res.status !== 0) return undefined;
    const out = (res.stdout ?? "").trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract a host-provided agent id (HAR-06): returns the `agent` field when it
 * is a non-empty string, undefined otherwise. Never throws.
 */
export function agentIdOf(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const agent = (value as { agent?: unknown }).agent;
  return typeof agent === "string" && agent.length > 0 ? agent : undefined;
}
