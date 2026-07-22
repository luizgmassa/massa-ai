/**
 * Tool Definitions for MCP Client
 *
 * Define as ferramentas expostas ao MCP host (OpenCode/Claude)
 * e o mapeamento para endpoints da Tools API.
 *
 * Wave 6 N31: search/memory tool defs extracted to tool-defs/ modules.
 * Remaining tools (project, synapse, hooks/exec) stay inline pending T12.
 */

import {
  STRUCTURAL_FQN_DESCRIPTION,
  STRUCTURAL_SYMBOL_KIND_SCHEMA,
} from "@massa-th0th/shared";
import { SEARCH_TOOL_DEFINITIONS } from "./tool-defs/tool-defs-search.js";
import { MEMORY_TOOL_DEFINITIONS } from "./tool-defs/tool-defs-memory.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  apiEndpoint: string;
  apiMethod: "GET" | "POST" | "PATCH" | "DELETE";
}

// ── Lookup maps for interleaving extracted tools in canonical order ───────

const SEARCH_BY_NAME = new Map(
  SEARCH_TOOL_DEFINITIONS.map((t) => [t.name, t] as const),
);
const MEMORY_BY_NAME = new Map(
  MEMORY_TOOL_DEFINITIONS.map((t) => [t.name, t] as const),
);

// ── Remaining inline tool definitions (T12 will extract these) ─────────────

const REMAINING_TOOLS: ToolDefinition[] = [
  {
    name: "index",
    description:
      "Index a project directory for contextual code search with semantic embeddings",
    apiEndpoint: "/api/v1/project/index",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Absolute path to the project directory to index",
        },
        projectId: {
          type: "string",
          description:
            "Unique identifier for the project (defaults to directory name)",
        },
        forceReindex: {
          type: "boolean",
          description: "Force reindex even if project already exists",
          default: false,
        },
        warmCache: {
          type: "boolean",
          description:
            "Pre-cache common queries after indexing for faster initial searches",
          default: false,
        },
        warmupQueries: {
          type: "array",
          items: { type: "string" },
          description:
            "Custom queries to pre-cache (uses defaults if not provided)",
        },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "index_status",
    description:
      "Get durable background-index status. Completed structural jobs include activatedGraphGenerationId and parserDiagnostics with exact aggregate diagnosticsCount, recoveredFiles, hardFailureFiles, staleFiles, and language counts; raw per-file diagnostics are not expanded.",
    apiEndpoint: "/api/v1/project/index/status/:jobId",
    apiMethod: "GET",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "Job ID returned from index",
        },
      },
      required: ["jobId"],
    },
  },

  // ── Symbol Graph tools ──────────────────────────────────────────────────

  {
    name: "list_projects",
    description:
      "List all indexed projects with their status (pending/indexing/indexed/error), file counts, symbol counts, and last indexed time.",
    apiEndpoint: "/api/v1/workspace/list",
    apiMethod: "GET",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "indexing", "indexed", "error", "all"],
          description: "Filter by workspace status. Defaults to 'all'.",
          default: "all",
        },
      },
    },
  },

  {
    name: "project_map",
    description:
      "Aggregate view of one active graph generation: identity, exact parser-diagnostic summary, stats, PageRank backbone, symbol counts using the canonical 18-kind schema-v2 taxonomy, extension distribution, and recent files. Raw per-file diagnostics are not expanded. Use this as a one-shot project summary.",
    apiEndpoint: "/api/v1/workspace/:id/map",
    apiMethod: "GET",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The project ID (as registered via index_project).",
        },
        centralityLimit: {
          type: "number",
          description: "Max number of top central files to include. Default 20.",
          default: 20,
        },
        recentLimit: {
          type: "number",
          description: "Max number of recently indexed files to include. Default 10.",
          default: 10,
        },
      },
      required: ["id"],
    },
  },

  {
    name: "get_architecture",
    description:
      "Get the architecture map for a project: packages, entry points, routes, hotspots, communities, layers, and opt-in cycles (Tarjan SCC over CALL edges). " +
      "Pass aspects:[\"cycles\"] to surface strongly connected components (file-level call cycles). Unknown aspect values return a teaching error listing valid values.",
    apiEndpoint: "/api/v1/project/:id/architecture",
    apiMethod: "GET",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The project ID (as registered via index_project).",
        },
        aspects: {
          type: "array",
          items: { type: "string" },
          description:
            "Opt-in aspects. Only \"cycles\" today: runs iterative Tarjan SCC over CALL edges and returns { cycles, cycles_truncated }. Unknown values return a 400 teaching error listing valid values.",
        },
        centralityLimit: {
          type: "number",
          description: "Max number of top central files to include. Default 20.",
          default: 20,
        },
        format: {
          type: "string",
          enum: ["json", "toon", "tree"],
          description: "Output format (json, toon, or tree). Default: json.",
          default: "json",
        },
        fields: {
          type: "array",
          items: { type: "string" },
          description:
            "Projection — keep only these keys (dotted paths supported). Absent/empty → full data.",
        },
      },
      required: ["id"],
    },
  },

  // ── Project reset ───────────────────────────────────────────────────────

  {
    name: "reset_project",
    description:
      "Delete all indexed data for a project: vector embeddings, symbol graph (definitions/references/imports/centrality), and stored memories. " +
      "Use before a full reindex or to free space. Each scope (vectors, symbols, memories) can be toggled independently.",
    apiEndpoint: "/api/v1/project/reset",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The project ID to reset",
        },
        clearVectors: {
          type: "boolean",
          description: "Delete vector embeddings used for semantic search (default: true)",
          default: true,
        },
        clearSymbols: {
          type: "boolean",
          description: "Delete symbol graph: definitions, references, imports, file index, centrality scores (default: true)",
          default: true,
        },
        clearMemories: {
          type: "boolean",
          description: "Delete stored memories for this project (default: true)",
          default: true,
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "read_file",
    description: "Read a specific file (or line range) with symbol metadata and imports. Use instead of Read/grep when you have filePath+lineStart+lineEnd from a search result.",
    apiEndpoint: "/api/v1/file/read",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "File path (absolute or relative to project root)" },
        projectId: { type: "string", description: "Project ID for symbol metadata" },
        offset: { type: "number", description: "1-indexed start line (alternative to lineStart)" },
        limit: { type: "number", description: "Number of lines to return (alternative to lineEnd)" },
        lineStart: { type: "number", description: "First line to read (1-indexed)" },
        lineEnd: { type: "number", description: "Last line to read (1-indexed)" },
        compress: { type: "boolean", description: "Auto-compress content > 100 lines (default: true)", default: true },
        targetRatio: { type: "number", description: "Compression target ratio (0.3 = 70% reduction)", default: 0.3 },
        format: { type: "string", enum: ["json", "toon"], description: "Output format", default: "json" },
        fields: {
          type: "array",
          items: { type: "string" },
          description:
            "Projection — keep only these keys (dotted paths supported, e.g. ['nodes.symbol']). Absent/empty → full data.",
        },
        includeSymbols: { type: "boolean", description: "Include symbol definitions/references (default: true)", default: true },
        includeImports: { type: "boolean", description: "Extract file imports (default: true)", default: true },
      },
      required: ["filePath"],
    },
  },
  {
    name: "synapse_session",
    description: "Create a Synapse cognitive session. Returns sessionId to pass as sessionId on every search. Activates task alignment, agent affinity, and optional working memory.",
    apiEndpoint: "/api/v1/synapse/session",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Override the generated session ID" },
        agentId: { type: "string", description: "Stable identifier of the calling agent" },
        workspaceId: { type: "string", description: "Project ID this session is scoped to" },
        taskContext: { type: "string", description: "One-sentence description of the current task" },
        ttlMs: { type: "number", description: "Session TTL in ms (default: 1h)", default: 3600000 },
        enableBuffer: { type: "boolean", description: "Enable working-memory buffer", default: true },
        bufferMaxSize: { type: "number", description: "Maximum working-memory entries" },
        bufferTtlMs: { type: "number", description: "Working-memory entry TTL in ms" },
        accessHistoryMaxEntries: { type: "number", description: "Maximum access-history entries" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "synapse_get",
    description: "Inspect a Synapse session, including expiry, access history, and buffer state.",
    apiEndpoint: "/api/v1/synapse/session/:id",
    apiMethod: "GET",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Session ID" } },
      required: ["id"],
    },
  },
  {
    name: "synapse_update",
    description: "Replace a Synapse session task context and refresh its activity window.",
    apiEndpoint: "/api/v1/synapse/session/:id",
    apiMethod: "PATCH",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Session ID" },
        taskContext: { type: "string", description: "Replacement task context" },
        taskEmbedding: { type: "array", items: { type: "number" }, description: "Precomputed task-context embedding" },
      },
      required: ["id", "taskContext"],
    },
  },
  {
    name: "synapse_end",
    description: "End and remove a Synapse session.",
    apiEndpoint: "/api/v1/synapse/session/:id",
    apiMethod: "DELETE",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Session ID" } },
      required: ["id"],
    },
  },
  {
    name: "synapse_prime",
    description: "Seed the Synapse working-memory buffer with recalled memories before searching. Call at session start with recall results.",
    apiEndpoint: "/api/v1/synapse/session/:id/prime",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Session ID from synapse_session" },
        entries: { type: "array", description: "Search results to seed into the buffer", items: { type: "object" } },
      },
      required: ["id", "entries"],
    },
  },
  {
    name: "synapse_access",
    description: "Record file access for affinity scoring — boosts that file in future searches. Call after reading or editing a file.",
    apiEndpoint: "/api/v1/synapse/session/:id/access",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Session ID" },
        memoryId: { type: "string", description: "Chunk ID that was accessed" },
      },
      required: ["id", "memoryId"],
    },
  },
  {
    name: "synapse_prefetch",
    description: "Build a prefetch query for an opened file and optionally prime matching entries into the session buffer.",
    apiEndpoint: "/api/v1/synapse/session/:id/prefetch",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Session ID" },
        filePath: { type: "string", description: "Path of the file just opened" },
        symbols: { type: "array", items: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
        chains: { type: "array", items: { type: "string" } },
        maxResults: { type: "number" },
        minImportance: { type: "number" },
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" }, content: { type: "string" }, score: { type: "number" }, metadata: { type: "object" },
            },
            required: ["id", "content"],
          },
        },
      },
      required: ["id", "filePath"],
    },
  },
  {
    name: "synapse_list",
    description: "List the number of active Synapse sessions after evicting expired sessions.",
    apiEndpoint: "/api/v1/synapse/sessions",
    apiMethod: "GET",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "synapse_task_begin",
    description:
      "Begin a task envelope: create session → prime (if entries) → first search → prefetch first hit → record access. " +
      "Returns { sessionId, search, primed, partial, errors }. Session is always returned; partial=true + errors[] when a sub-step fails; search may be null when search failed. " +
      "Use synapse_task_end to clean up.",
    apiEndpoint: "/api/v1/synapse/task/begin",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Stable identifier of the calling agent" },
        taskContext: { type: "string", description: "One-sentence description of the current task" },
        workspaceId: { type: "string", description: "Project ID this session is scoped to" },
        query: { type: "string", description: "First search query" },
        projectId: { type: "string", description: "Project ID for the search" },
        entries: {
          type: "array",
          description: "Optional entries to prime the buffer with (from recall)",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              content: { type: "string" },
              score: { type: "number" },
              metadata: { type: "object" },
            },
            required: ["id", "content"],
          },
        },
        limit: { type: "number", description: "Max results for the first search (default 10)" },
      },
      required: ["agentId", "query", "projectId"],
    },
  },
  {
    name: "synapse_task_end",
    description:
      "End a Synapse task: compute summary (accessCount, topFiles) and DELETE the session. " +
      "Returns { sessionId, durationMs, accessCount, topFiles }. A follow-up GET on the session returns 404.",
    apiEndpoint: "/api/v1/synapse/task/:id/end",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Session ID from synapse_task_begin" },
      },
      required: ["id"],
    },
  },
  {
    name: "reindex",
    description: "Force full reindex of a project workspace. Use when autoReindex (configurable via search.autoReindexMaxFiles, default 200) is insufficient after a large refactor. Requires the project's absolute path.",
    apiEndpoint: "/api/v1/workspace/:id/reindex",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project ID" },
        projectPath: { type: "string", description: "Absolute path to project directory" },
      },
      required: ["id", "projectPath"],
    },
  },
  {
    name: "hook_ingest",
    description:
      "Passively ingest a batch of lifecycle events (session-start, user-prompt, pre/post-tool-use, pre-compact, session-end) as Observations. Fire-and-forget; consolidated into memories later by the LLM bridge. Useful for non-Claude hosts.",
    apiEndpoint: "/api/v1/hook/batch",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        events: {
          type: "array",
          description: "Lifecycle events to ingest (validated atomically)",
          items: {
            type: "object",
            properties: {
              event: {
                type: "string",
                enum: [
                  "session-start",
                  "user-prompt",
                  "pre-tool-use",
                  "post-tool-use",
                  "pre-compact",
                  "session-end",
                ],
              },
              projectId: { type: "string" },
              sessionId: { type: "string" },
              payload: { type: "object", description: "Event-specific payload" },
              importance: { type: "number", minimum: 0, maximum: 1 },
              agentId: { type: "string" },
              ts: { type: "number", description: "Epoch ms (defaults to now)" },
            },
            required: ["event", "projectId", "payload"],
          },
        },
      },
      required: ["events"],
    },
  },
  {
    name: "compact_snapshot",
    description:
      "Build a reference-based compaction snapshot — bounded <~2KB table-of-contents with runnable recall/search calls for the current session's observations (SESSION continuity, not task state). Zero information loss — raw events stay in PostgreSQL; the snapshot points to them. Distinct from checkpoints (which version task progress). Optionally persists the snapshot as an observation of category 'compaction-snapshots'. Use on /compact or PreCompact for session continuity.",
    apiEndpoint: "/api/v1/hook/compact-snapshot",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Session ID to build the snapshot for",
        },
        projectId: {
          type: "string",
          description: "Project ID (defaults to 'default')",
        },
        persist: {
          type: "boolean",
          default: false,
          description:
            "If true, persist the snapshot as an observation of category 'compaction-snapshots'",
        },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "bootstrap",
    description:
      "Scan a project (git log, README, docs, package manifests, top central files from PageRank) and create LLM-summarized seed memories so an agent begins with usable context. Idempotent — skips if already bootstrapped unless force=true. LLM-off degrades silently to rule-based seeds. Never throws.",
    apiEndpoint: "/api/v1/bootstrap",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project identifier" },
        projectPath: {
          type: "string",
          description: "Project root path (defaults to server cwd)",
        },
        force: {
          type: "boolean",
          default: false,
          description: "Refresh even if already bootstrapped",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "handoff_begin",
    description:
      "Begin a cross-session handoff: leave a structured record (summary, open questions, next steps, files) for a later agent to discover on session start. The handoff is persisted in the Handoff table AND dual-written as a searchable memory (FTS-discoverable). Optional LLM summary-polish (default-off). Never throws.",
    apiEndpoint: "/api/v1/handoff/begin",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project identifier (required)" },
        sourceSessionId: { type: "string", description: "Session leaving the handoff" },
        targetAgent: { type: "string", description: "Target agent name (omit = broadcast)" },
        summary: { type: "string", description: "Handoff summary (max 1024 chars; empty = auto-polish when LLM on)" },
        openQuestions: { type: "array", items: { type: "string" } },
        nextSteps: { type: "array", items: { type: "string" } },
        files: { type: "array", items: { type: "string" } },
      },
      required: ["projectId"],
    },
  },
  {
    name: "handoff_accept",
    description:
      "Accept an open handoff by id. Flips status open→accepted, sets accepted_at, emits handoff:accepted. Missing/expired/already-accepted/project-mismatch ids return a clear {ok:false, reason}. Never throws.",
    apiEndpoint: "/api/v1/handoff/accept",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Handoff id (required)" },
        projectId: { type: "string", description: "Optional project scope check" },
      },
      required: ["id"],
    },
  },
  {
    name: "handoff_cancel",
    description:
      "Cancel (expire) an open handoff by id. Flips status open→expired (no event). Same failure semantics as accept on missing/non-open/project-mismatch. Never throws.",
    apiEndpoint: "/api/v1/handoff/cancel",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Handoff id (required)" },
        projectId: { type: "string", description: "Optional project scope check" },
      },
      required: ["id"],
    },
  },
  {
    name: "handoff_list_pending",
    description:
      "List open handoffs for a project (optionally filtered by target agent), ordered oldest-first. The recall-path surfacing primitive for auto-inject on session start. Never throws.",
    apiEndpoint: "/api/v1/handoff/list",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project identifier (required)" },
        targetAgent: { type: "string", description: "Optional target agent filter" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "list_proposals",
    description:
      "List pending auto-improvement proposals for a project (newest-first). The review-gate surfacing primitive: proposals are generated by the auto-improve loop from recurring patterns (repeated queries, hot files, common fixes). Never throws.",
    apiEndpoint: "/api/v1/proposal/list",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project identifier (required)" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "approve_proposal",
    description:
      "Approve a pending auto-improvement proposal by id. Applies the proposed memory edit, flips status pending→approved, and emits memory:auto-improved. Missing/non-pending/project-mismatch/apply-failed ids return a clear {ok:false, reason}. Never throws.",
    apiEndpoint: "/api/v1/proposal/approve",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Proposal id (required)" },
        projectId: { type: "string", description: "Optional project scope check" },
        source: {
          type: "string",
          enum: ["llm", "rule-based"],
          description: "Origin of the proposal (audit; default rule-based)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "reject_proposal",
    description:
      "Reject a pending auto-improvement proposal by id. Flips status pending→rejected (no memory edit applied, no event emitted). Same failure semantics as approve on missing/non-pending/project-mismatch. Never throws.",
    apiEndpoint: "/api/v1/proposal/reject",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Proposal id (required)" },
        projectId: { type: "string", description: "Optional project scope check" },
        reason: { type: "string", description: "Optional rejection reason (audit)" },
      },
      required: ["id"],
    },
  },
  {
    name: "execute",
    description:
      "Run code in a detected polyglot sandbox runtime (js/ts/python/shell/ruby/go/rust/php/perl/r). " +
      "Returns stdout/stderr. Local-dev trust model: code runs on the host as the current user — " +
      "no OS-level isolation. Timeout default 30s, cap 300s. Pass `intent` to trim large outputs.",
    apiEndpoint: "/api/v1/executor/execute",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "shell", "ruby", "go", "rust", "php", "perl", "r"],
          description: "Language/runtime to execute the code in.",
        },
        code: { type: "string", description: "Source code to execute." },
        timeout: { type: "number", description: "Max runtime in ms (default 30000, cap 300000)." },
        background: { type: "boolean", description: "Detach instead of killing on timeout (default false).", default: false },
        cwd: { type: "string", description: "Working directory (defaults to project root)." },
        intent: {
          type: "string",
          description: "Optional query. When output > ~5KB, only sections matching this intent are returned.",
        },
      },
      required: ["language", "code"],
    },
  },
  {
    name: "execute_file",
    description:
      "Read a file into a sandboxed FILE_CONTENT variable and run code over it. Only what your code " +
      "prints enters the conversation. Enforces project-root containment + a secrets deny-glob by default.",
    apiEndpoint: "/api/v1/executor/execute_file",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project-relative (or absolute, under root) file path." },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "shell", "ruby", "go", "rust", "php", "perl", "r"],
          description: "Language/runtime to execute the code in.",
        },
        code: {
          type: "string",
          description: "Code to run over the file. FILE_CONTENT (text) and file_path (absolute) are in scope.",
        },
        timeout: { type: "number", description: "Max runtime in ms (default 30000, cap 300000)." },
        intent: { type: "string", description: "Optional intent query to trim large outputs." },
      },
      required: ["path", "language", "code"],
    },
  },
  {
    name: "batch_execute",
    description:
      "Run N shell commands in parallel via run-pool (order-preserving, concurrency-capped). " +
      "Returns per-command stdout/stderr/exitCode in input order. Default concurrency = cpu count; " +
      "failures do not abort siblings.",
    apiEndpoint: "/api/v1/executor/batch_execute",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        commands: {
          type: "array",
          items: { type: "string" },
          description: "Shell commands to run (order is preserved in results).",
        },
        queries: {
          type: "array",
          items: { type: "string" },
          description: "Optional queries to scope auto-indexing of outputs (reserved; currently a no-op stub).",
        },
        timeout: { type: "number", description: "Per-command timeout in ms (default 30000)." },
        concurrency: { type: "number", description: "Max in-flight commands (default = host cpu count)." },
        cwd: { type: "string", description: "Working directory (defaults to project root)." },
        query_scope: { type: "string", description: "Optional scope label for the batch (diagnostics only)." },
      },
      required: ["commands"],
    },
  },
  {
    name: "fetch_and_index",
    description:
      "Fetch URL(s), convert HTML to markdown (JSON → key-path chunks), and " +
      "index them for search. SSRF-guarded: loopback/private/link-local/IMDS " +
      "IPs are blocked, including redirect-to-internal and DNS-rebind. Parallel " +
      "fetch (run-pool, cpu-capped), serial per-URL indexing. TTL-cached (~24h).",
    apiEndpoint: "/api/v1/web/fetch_and_index",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Single URL to fetch and index (single-shape).",
        },
        source: {
          type: "string",
          description: "Label for the indexed content when using single `url`.",
        },
        requests: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "URL to fetch." },
              source: {
                type: "string",
                description: "Label for this URL's indexed content.",
              },
            },
            required: ["url"],
          },
          description:
            "Batch shape: array of {url, source?}. Use with concurrency>1 for " +
            "parallel fetch. Output preserves input order.",
        },
        concurrency: {
          type: "number",
          description:
            "Max URLs fetched in parallel (1-8, default 1). Capped by cpu count.",
        },
        force: {
          type: "boolean",
          description: "Skip cache and re-fetch even if recently indexed.",
        },
        ttl: {
          type: "number",
          description:
            "Override cache freshness window in ms (0 bypasses cache like force).",
        },
      },
    },
  },
  {
    name: "rename_project",
    description:
      "Rename a project identity transactionally. Default dryRun=true previews " +
      "canonical roots, per-store counts, conflicts, and a planHash. To apply, " +
      "call again with dryRun=false, a caller-chosen operationId (idempotency " +
      "key), and the preview's planHash as expectedPlanHash. The retired source " +
      "ID remains a working alias.",
    apiEndpoint: "/api/v1/project/rename",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        sourceProjectId: {
          type: "string",
          description: "Current project ID to rename from",
        },
        targetProjectId: {
          type: "string",
          description: "New project ID (must be unused and never retired)",
        },
        dryRun: {
          type: "boolean",
          description:
            "Preview only (default true). Set false with operationId + expectedPlanHash to apply.",
        },
        operationId: {
          type: "string",
          description: "Idempotency key, required when dryRun=false",
        },
        expectedPlanHash: {
          type: "string",
          description: "planHash from the dryRun preview, required when dryRun=false",
        },
      },
      required: ["sourceProjectId", "targetProjectId"],
    },
  },
  {
    name: "merge_projects",
    description:
      "Merge one project identity into another transactionally (same canonical " +
      "root required). Default dryRun=true previews counts, conflicts, and a " +
      "planHash. To apply, call again with dryRun=false, a caller-chosen " +
      "operationId, and the preview's planHash as expectedPlanHash. The retired " +
      "source ID remains a working alias.",
    apiEndpoint: "/api/v1/project/merge",
    apiMethod: "POST",
    inputSchema: {
      type: "object",
      properties: {
        sourceProjectId: {
          type: "string",
          description: "Project ID to merge from (retired afterwards)",
        },
        targetProjectId: {
          type: "string",
          description: "Live project ID to merge into",
        },
        dryRun: {
          type: "boolean",
          description:
            "Preview only (default true). Set false with operationId + expectedPlanHash to apply.",
        },
        operationId: {
          type: "string",
          description: "Idempotency key, required when dryRun=false",
        },
        expectedPlanHash: {
          type: "string",
          description: "planHash from the dryRun preview, required when dryRun=false",
        },
      },
      required: ["sourceProjectId", "targetProjectId"],
    },
  },
];

// ── Canonical order (pinned by T02 characterization test) ───────────────────
// Interleave remaining tools with extracted search/memory tools in the exact
// order the characterization test pins.

const CANONICAL_ORDER = [
  "index",
  "index_status",
  "search",
  "remember",
  "recall",
  "memory_update",
  "memory_delete",
  "list_checkpoints",
  "create_checkpoint",
  "restore_checkpoint",
  "compress",
  "optimized_context",
  "analytics",
  "list_projects",
  "project_map",
  "get_architecture",
  "search_definitions",
  "get_references",
  "go_to_definition",
  "trace_path",
  "impact_analysis",
  "reset_project",
  "read_file",
  "synapse_session",
  "synapse_get",
  "synapse_update",
  "synapse_end",
  "synapse_prime",
  "synapse_access",
  "synapse_prefetch",
  "synapse_list",
  "synapse_task_begin",
  "synapse_task_end",
  "symbol_snippet",
  "memory_list",
  "reindex",
  "hook_ingest",
  "compact_snapshot",
  "bootstrap",
  "handoff_begin",
  "handoff_accept",
  "handoff_cancel",
  "handoff_list_pending",
  "list_proposals",
  "approve_proposal",
  "reject_proposal",
  "execute",
  "execute_file",
  "batch_execute",
  "fetch_and_index",
  "rename_project",
  "merge_projects",
] as const;

const REMAINING_BY_NAME = new Map(
  REMAINING_TOOLS.map((t) => [t.name, t] as const),
);

export const TOOL_DEFINITIONS: ToolDefinition[] = CANONICAL_ORDER.map(
  (name) =>
    SEARCH_BY_NAME.get(name) ??
    MEMORY_BY_NAME.get(name) ??
    REMAINING_BY_NAME.get(name)!,
);

/**
 * Get tool definition by name
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}
