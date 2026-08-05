import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { configExists, initConfig, loadConfig } from "@massa-ai/shared/config"
import {
  ObservationEmitter,
  makeDefaultDeps,
  buildToolPayload,
  buildPromptPayload,
  buildSessionPayload,
} from "./observation-emitter"
import {
  SessionProjectPin,
  computePluginProjectId,
  gitToplevelSafe,
  agentIdOf,
} from "./session-project-pin"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MASSA_AI_API_URL = process.env.MASSA_AI_API_URL || "http://localhost:3333"
const FETCH_TIMEOUT_MS = 5_000
const REINDEX_DEBOUNCE_MS = 60_000
const REINDEX_FILE_THRESHOLD = 15
const MAX_EDITED_FILES_TRACKED = 200

// ---------------------------------------------------------------------------
// Auto-configuration
// ---------------------------------------------------------------------------

function ensureConfig(): void {
  if (!configExists()) {
    initConfig()
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  massa-ai initialized with default configuration                  ║
║                                                                ║
║  Config: ~/.config/massa-ai/config.json                           ║
║  Provider: Ollama (local, free)                                ║
║                                                                ║
║  To change provider:                                           ║
║    npx massa-ai-config use mistral --api-key YOUR_KEY             ║
║    npx massa-ai-config use openai --api-key YOUR_KEY              ║
╚═══════════════════════════════════════════════════════════════╝
`)
  }
}

// ---------------------------------------------------------------------------
// HTTP client with timeout + abort
// ---------------------------------------------------------------------------

async function massaAiFetch<T = unknown>(
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${MASSA_AI_API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`massa-ai ${res.status}: ${text.slice(0, 200)}`)
    }
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const MassaAiPlugin: Plugin = async ({ project, directory, worktree, client }: PluginInput) => {
  // Auto-configure on first run
  ensureConfig()
  
  loadConfig()

  const projectPath = worktree || directory

  // Per-session project id memo (M45/HAR-04): the first event of a session
  // computes the id (project?.id > git toplevel basename > directory basename
  // > "default"); later events of that session reuse it even from subdirectory
  // contexts. `projectId` (no session) keeps the same computed value for the
  // request/response tools below.
  const projectPins = new SessionProjectPin({
    computeProjectId: () =>
      computePluginProjectId({
        projectId: project?.id,
        directory,
        gitToplevel: gitToplevelSafe,
      }),
  })
  const projectId = projectPins.for(undefined)

  // Per-plugin-instance state
  const editedFiles = new Set<string>()
  let reindexTimer: ReturnType<typeof setTimeout> | null = null
  let reindexInFlight = false
  let apiAvailable = true

  // Lifecycle observation emitter (SG-7/#21). Non-blocking, batched, debounced.
  // Mirrors apps/claude-plugin/hooks: emits raw host events to
  // POST /api/v1/hook/batch; the server classifies into the 33-category taxonomy.
  const observations = new ObservationEmitter({
    deps: makeDefaultDeps({
      apiUrl: MASSA_AI_API_URL,
      log,
      enabled: () => apiAvailable,
    }),
  })

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function log(level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
    client.app.log({
      body: { service: "massa-ai", level, message, extra },
    }).catch(() => {})
  }

  function toast(message: string, variant: "success" | "error" | "info" = "info") {
    client.tui.showToast({
      body: { message: `[massa-ai] ${message}`, variant },
    }).catch(() => {})
  }

  function fireAndForget(endpoint: string, body: Record<string, unknown>, label: string) {
    massaAiFetch(endpoint, body).catch((err) => {
      log("warn", `${label} failed`, { error: err instanceof Error ? err.message : String(err) })
    })
  }

  function scheduleReindex() {
    if (!apiAvailable || reindexInFlight) return
    if (reindexTimer) clearTimeout(reindexTimer)

    reindexTimer = setTimeout(async () => {
      if (reindexInFlight) return
      reindexInFlight = true
      const count = editedFiles.size
      try {
        await massaAiFetch("/api/v1/project/index", {
          projectPath,
          projectId,
          forceReindex: false,
          warmCache: false,
        })
        editedFiles.clear()
        log("info", `Incremental reindex completed (${count} files changed)`)
      } catch (err) {
        log("warn", "Reindex failed", { error: err instanceof Error ? err.message : String(err) })
      } finally {
        reindexInFlight = false
        reindexTimer = null
      }
    }, REINDEX_DEBOUNCE_MS)
  }

  function trackFile(filePath: string | undefined) {
    if (!filePath || typeof filePath !== "string") return
    if (editedFiles.size >= MAX_EDITED_FILES_TRACKED) return
    editedFiles.add(filePath)
    if (editedFiles.size >= REINDEX_FILE_THRESHOLD) {
      scheduleReindex()
    }
  }

  return {
    // -----------------------------------------------------------------------
    // No `tool` key: AD-017 — plugins deliver, MCP serves tools, hooks
    // observe. The MCP server registered by scripts/install-agents.sh is the
    // one canonical tool surface (54 tools); in-process tools are never a
    // coverage mechanism. `tool` is optional on Hooks, so omitting it is
    // valid per @opencode-ai/plugin's type.
    //
    // Events - typed to real Hooks interface
    // -----------------------------------------------------------------------

    // Health check + auto-index on session start
    "session.created": async () => {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 3_000)
        const res = await fetch(`${MASSA_AI_API_URL}/health`, { signal: controller.signal })
        clearTimeout(timer)
        apiAvailable = res.ok
        if (apiAvailable) {
          log("info", `Connected to massa-ai API at ${MASSA_AI_API_URL}`)
        } else {
          toast("massa-ai API unhealthy", "error")
        }
      } catch {
        apiAvailable = false
        log("warn", `massa-ai API unreachable at ${MASSA_AI_API_URL}`)
      }
      // Emit session-start observation (best-effort, non-blocking).
      observations.emit({
        event: "session-start",
        projectId,
        payload: buildSessionPayload({ cwd: projectPath }),
      })
    },

    // Capture git operations after bash execution
    // Hooks interface: tool.execute.after(input: { tool, sessionID, callID, args }, output: { title, output, metadata })
    "tool.execute.after": async (input, output) => {
      if (!apiAvailable) return

      // Emit a post-tool-use observation for EVERY tool (SG-7/#21). The server
      // classifies via payload.tool_name (Read/Write/Bash/Edit/etc.). We pass
      // OpenCode tool names raw; TOOL_NAME_NORMALIZE maps them. Non-blocking.
      observations.emit({
        event: "post-tool-use",
        projectId: projectPins.for(input.sessionID),
        sessionId: input.sessionID,
        agentId: agentIdOf(input),
        payload: buildToolPayload({
          tool: input.tool,
          args: input.args,
          output: output.output,
          cwd: projectPath,
          sessionId: input.sessionID,
        }),
      })

      if (input.tool !== "bash") return

      const cmd = String(input.args?.command || "")
      if (!cmd.includes("git commit") && !cmd.includes("git merge") && !cmd.includes("git rebase")) return

      const result = String(output.output || "").slice(0, 300)
      fireAndForget("/api/v1/memory/store", {
        content: `Git: ${cmd.slice(0, 200)}\nResult: ${result}`,
        type: "code",
        projectId: projectPins.for(input.sessionID),
        sessionId: input.sessionID,
        tags: ["git"],
        importance: 0.6,
        format: "toon",
      }, "git-capture")
    },

    // Compaction: fetch real memories and inject as context, + build snapshot
    // Hooks interface: experimental.session.compacting(input: { sessionID }, output: { context: string[], prompt?: string })
    "experimental.session.compacting": async (input, output) => {
      if (!apiAvailable) return

      try {
        const memories = await massaAiFetch<{ success: boolean; data?: { memories?: Array<{ content: string }> } }>(
          "/api/v1/memory/search",
          {
            query: `project ${projectId} critical decisions patterns`,
            projectId,
            sessionId: input.sessionID,
            limit: 5,
            minImportance: 0.5,
            includePersistent: true,
            format: "json",
          },
          3_000,
        )

        if (memories?.data?.memories?.length) {
          const memoryText = memories.data.memories
            .map((m, i) => `${i + 1}. ${m.content}`)
            .join("\n")
          output.context.push(`## massa-ai - Persistent Memories\n${memoryText}`)
        }
      } catch (err) {
        log("debug", "Failed to fetch memories for compaction", {
          error: err instanceof Error ? err.message : String(err),
        })
      }

      // Build + persist a reference-based compaction snapshot (Phase 3 C1).
      // Fire-and-forget: the snapshot is a bounded TOC with runnable search
      // calls — zero information loss, raw events stay in the observation store.
      try {
        await massaAiFetch(
          "/api/v1/hook/compact-snapshot",
          {
            sessionId: input.sessionID,
            projectId: projectPins.for(input.sessionID),
            persist: true,
          },
          5_000,
        )
      } catch (err) {
        log("debug", "Failed to build compaction snapshot", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },

    // Inject massa-ai env vars into shell
    // Hooks interface: shell.env(input: { cwd, sessionID?, callID? }, output: { env })
    "shell.env": async (input, output) => {
      output.env.MASSA_AI_PROJECT_ID = projectPins.for(input.sessionID)
      output.env.MASSA_AI_PROJECT_PATH = projectPath
      output.env.MASSA_AI_API_URL = MASSA_AI_API_URL
    },

    // Unified event handler for file tracking + LSP diagnostics + observations
    event: async ({ event }) => {
      // Track file edits for incremental reindex
      if (event.type === "file.edited") {
        trackFile(event.properties.file)
        // fall through — also emit nothing here (file.edited has no lifecycle kind)
        return
      }
      if (event.type === "file.watcher.updated") {
        trackFile(event.properties.file)
        return
      }

      // ── Lifecycle observations (SG-7/#21) ──────────────────────────────
      // OpenCode has no dedicated session-start/stop or user-prompt-submit
      // hooks (unlike Claude Code). The closest lifecycle signals flow through
      // the generic `event` hook:
      //  - command.executed       → user-prompt (typed command / slash cmd)
      //  - message.part.updated   → post-tool-use for tool parts reaching
      //                              completed/error (covers MCP + agent tools
      //                              that bypass tool.execute.after)
      //  - session.idle/deleted   → session-end
      if (apiAvailable && event.type === "command.executed") {
        const p = event.properties as { arguments?: string; name?: string; sessionID?: string }
        const text = [p.name, p.arguments].filter(Boolean).join(" ").trim()
        if (text) {
          observations.emit({
            event: "user-prompt",
            projectId: projectPins.for(p.sessionID),
            sessionId: p.sessionID,
            agentId: agentIdOf(p),
            payload: buildPromptPayload({ prompt: text, cwd: projectPath }),
          })
        }
      }

      if (apiAvailable && event.type === "message.part.updated") {
        const part = (event.properties as { part?: { type?: string; tool?: string; state?: { status?: string; error?: string; output?: string; input?: unknown }; sessionID?: string; messageID?: string } }).part
        if (part?.type === "tool" && part.tool && part.state) {
          const status = part.state.status
          if (status === "completed" || status === "error") {
            observations.emit({
              event: "post-tool-use",
              projectId: projectPins.for(part.sessionID),
              sessionId: part.sessionID,
              agentId: agentIdOf(part),
              payload: buildToolPayload({
                tool: part.tool,
                args: part.state.input,
                output: status === "error" ? part.state.error : part.state.output,
                cwd: projectPath,
                sessionId: part.sessionID,
              }),
              importance: status === "error" ? 0.7 : undefined,
            })
          }
        }
      }

      if (apiAvailable && (event.type === "session.idle" || event.type === "session.deleted")) {
        const p = event.properties as { sessionID?: string }
        observations.emit({
          event: "session-end",
          projectId: projectPins.for(p.sessionID),
          sessionId: p.sessionID,
          agentId: agentIdOf(p),
          payload: buildSessionPayload({ cwd: projectPath }),
        })
        // On session.idle, also best-effort flush buffered observations so a
        // short session doesn't lose events to the debounce window.
        if (event.type === "session.idle") void observations.flush()
      }

      // LSP diagnostics: track persistent errors
      if (!apiAvailable) return
      if (event.type !== "lsp.client.diagnostics") return

      const props = event.properties as { path?: string; diagnostics?: Array<{ severity?: number; message?: string }> }
      const errors = props.diagnostics?.filter(d => d.severity === 1) || []
      if (errors.length === 0) return

      // Only track files with 3+ errors (persistent problems)
      if (errors.length >= 3) {
        const file = props.path || "unknown"
        const messages = errors.slice(0, 3).map(e => e.message).join("; ")
        fireAndForget("/api/v1/memory/store", {
          content: `LSP errors in ${file}: ${messages} (${errors.length} total)`,
          type: "pattern",
          projectId,
          tags: ["lsp", "error", "diagnostics"],
          importance: 0.4,
          format: "toon",
        }, "lsp-diagnostics")
      }
    },

    // Best-effort flush on plugin teardown.
    dispose: async () => {
      try {
        await observations.dispose()
      } catch {
        // swallow — dispose must never throw
      }
    },
  }
}

export default MassaAiPlugin
