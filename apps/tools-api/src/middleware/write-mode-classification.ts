/**
 * Read-only route classification (HPC-03, design.md §D1 "The classification").
 *
 * `write-mode.ts` (T2) is default-deny: every non-`GET` route is treated as a
 * write unless it appears here. This table is therefore an allowlist of
 * *reads* — the narrow, reviewable set — not an allowlist of writes, which
 * would be unbounded and would grow stale silently.
 *
 * Every entry below was traced to source before being admitted (AC-03.3): the
 * trace is the evidence, not the route's name. `POST /search/project` reads
 * like a pure read and is not one — `autoReindex` + `projectPath` reach
 * `SearchController.handleAutoReindex` → `ensureFreshIndex`, which writes the
 * index. It stays on the allowlist with a body sanitizer (AC-03.3a) rather
 * than being dropped, because dropping it would 403 project search entirely
 * on a read-only instance — a real functional loss for no additional safety
 * over neutralising the one field that matters.
 *
 * `apps/tools-api/src/middleware/write-mode-classification.test.ts` traces
 * and behaviourally tests every entry, including the four traced clean by a
 * prior investigation (`/context/optimized`, `/memory/list`, `/memory/search`,
 * `/checkpoints/list`) and the five traced fresh here (`/search/code`,
 * `/handoff/list`, `/proposal/list`, `/context/compress`, `/symbol/impact`).
 */

export interface ReadOnlyRouteEntry {
  /** HTTP method as registered in the route file. Every entry here is POST. */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Full request path, exactly as it is mounted (`/api/v1/...`). */
  path: string;
  /**
   * Why this route is safe to allow while read-only mode is active. Carries
   * the source trace inline — file:line citations for every hop from the
   * route handler down to the point the read/write verdict was decided.
   */
  justification: string;
  /**
   * Body mutation applied, in place, before the request reaches the route
   * handler — neutralises a write-triggering field this route's own schema
   * exposes (AC-03.3a). Absent when the route has no such field.
   */
  sanitizeBody?: (body: Record<string, unknown>) => void;
}

export const READ_ONLY_ROUTES: readonly ReadOnlyRouteEntry[] = [
  {
    method: "POST",
    path: "/api/v1/search/project",
    justification:
      "WRITES when autoReindex+projectPath are both set. " +
      "apps/tools-api/src/routes/search.ts:48-106 passes the raw request body to " +
      "SearchProjectTool.handle(), which forwards it unchanged to " +
      "SearchController.searchProject " +
      "(packages/core/src/services/search/search-controller.ts:132-179): autoReindex " +
      "defaults to false at :140, and at :177-179 `if (autoReindex && projectPath) " +
      "this.handleAutoReindex(projectId, projectPath)` calls the private helper at " +
      ":364-389, which calls `this.contextualSearch.ensureFreshIndex(...)` — a real " +
      "index write. Kept on the allowlist with a sanitizer (AC-03.3a) instead of being " +
      "dropped, so read-only mode does not 403 project search entirely.",
    sanitizeBody: (body) => {
      body.autoReindex = false;
    },
  },
  {
    method: "POST",
    path: "/api/v1/search/code",
    justification:
      "Clean. apps/tools-api/src/routes/search.ts:108-126's request schema exposes only " +
      "{query, projectId, limit} — no `autoReindex` field exists on this route to flip. " +
      "packages/core/src/tools/search_code.ts:56-62 delegates to SearchProjectTool.handle " +
      "with `autoReindex: false` hardcoded at line 61 regardless of caller input, so the " +
      "write path proven above for /search/project is structurally unreachable from here.",
  },
  {
    method: "POST",
    path: "/api/v1/memory/search",
    justification:
      "Clean. apps/tools-api/src/routes/memory.ts:126-138 (`POST /search`) delegates the " +
      "raw body to SearchMemoriesTool.handle(), which " +
      "(packages/core/src/tools/search_memories.ts:93-121) only calls " +
      "`MemoryController.search(...)` and formats the result for the response — no " +
      "repository mutation on any code path this handler can reach.",
  },
  {
    method: "POST",
    path: "/api/v1/memory/list",
    justification:
      "Clean. apps/tools-api/src/routes/memory.ts:243-268 calls only " +
      "`getMemoryRepository().search(...)`, then filters/paginates the result in the " +
      "route handler itself — no repository write method is reachable from this handler.",
  },
  {
    method: "POST",
    path: "/api/v1/checkpoints/list",
    justification:
      "Clean. apps/tools-api/src/routes/checkpoints.ts:56-68 delegates to " +
      "ListCheckpointsTool.handle(), which " +
      "(packages/core/src/tools/list_checkpoints.ts:90-99) calls only " +
      "`checkpointManager.listCheckpoints(...)` and `checkpointManager.getStats()` — both " +
      "reads over existing state, never a checkpoint create/delete/restore call.",
  },
  {
    method: "POST",
    path: "/api/v1/handoff/list",
    justification:
      "Clean. apps/tools-api/src/routes/handoff.ts:174-213 calls only " +
      "`service().listPending(...)`, which " +
      "(packages/core/src/services/handoff/handoff-service.ts:228-229) is a direct " +
      "pass-through to `this.store.listPending(...)` — never `begin` (:115), `accept` " +
      "(:173) or `cancel` (:182), the service's three write entry points.",
  },
  {
    method: "POST",
    path: "/api/v1/proposal/list",
    justification:
      "Clean. apps/tools-api/src/routes/proposals.ts:36-73 calls only " +
      "`job().listPending(...)`, which " +
      "(packages/core/src/services/jobs/auto-improve-job.ts:113) is a direct pass-through " +
      "to `this.proposalStore.listPending(...)` — never `approve` (:111) or `reject` " +
      "(:112), the job's two write entry points.",
  },
  {
    method: "POST",
    path: "/api/v1/context/compress",
    justification:
      "Clean. apps/tools-api/src/routes/context.ts:29-68 delegates to " +
      "CompressContextTool.handle(), which " +
      "(packages/core/src/tools/compress_context.ts:67-118) runs `compressWithMetrics` " +
      "over the request's own `content` string in memory and returns the result — no " +
      "repository, index, or filesystem write on any code path.",
  },
  {
    method: "POST",
    path: "/api/v1/context/optimized",
    justification:
      "Clean. apps/tools-api/src/routes/context.ts:70-101 delegates to " +
      "GetOptimizedContextTool.handle(), which " +
      "(packages/core/src/tools/get_optimized_context.ts:105-110) calls " +
      "`ContextController.getOptimizedContext(p)`. That controller " +
      "(packages/core/src/services/context/context-controller.ts:161) hardcodes " +
      "`autoReindex: false` on its own internal search call, so the write path proven " +
      "for /search/project is structurally unreachable here even though this route's " +
      "schema also carries `projectPath`.",
  },
  {
    method: "POST",
    path: "/api/v1/symbol/impact",
    justification:
      "Clean. apps/tools-api/src/routes/workspace.ts:542-673 calls " +
      "`getGraphController().analyzeImpact(...)`, which " +
      "(packages/core/src/services/symbol/graph-controller.ts:189-232) delegates to " +
      "`impactAnalysisService.analyze(...)` " +
      "(packages/core/src/services/symbol/impact-analysis.ts). Every git invocation there " +
      "runs through `execFileSync` for `rev-parse`/`diff`/`status`-class read commands, " +
      "plus one `hash-object -t tree --stdin` with no `-w` flag (so nothing is written to " +
      "the git object database) — no `git commit`, `git add`, or `-w` flag anywhere in " +
      "the module.",
  },
];

/**
 * Normalises exactly one trailing slash (AC-03.9): `/list/` and `/list`
 * collapse to the same classification key. Measured against this worktree's
 * `elysia@1.4.29`: `POST /api/v1/handoff/list/` matches the same route as
 * `/list`, and the global `onBeforeHandle` hook receives the raw, unnormalised
 * string — so without this, an allowlisted read would 403 over a trailing
 * slash alone (over-blocking, not a bypass; default-deny already covers the
 * write side against any string variant).
 */
export function normalizeRoutePath(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

const READ_ONLY_INDEX: ReadonlyMap<string, ReadOnlyRouteEntry> = new Map(
  READ_ONLY_ROUTES.map((entry) => [`${entry.method} ${entry.path}`, entry]),
);

/**
 * Look up a route's read-only classification by method + path. Path is
 * normalised for exactly one trailing slash before the lookup (AC-03.9).
 * Returns `undefined` for anything not explicitly classified — the caller
 * (write-mode.ts) treats that as default-deny (AC-03.2).
 */
export function findReadOnlyRoute(method: string, path: string): ReadOnlyRouteEntry | undefined {
  return READ_ONLY_INDEX.get(`${method.toUpperCase()} ${normalizeRoutePath(path)}`);
}
