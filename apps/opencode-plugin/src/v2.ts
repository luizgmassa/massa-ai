import type { Plugin } from "@opencode/plugin"
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
import { buildOpenCodeAgentAnnouncement, openCodeAgentDirs } from "./agent-announcement"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MASSA_AI_API_URL = process.env.MASSA_AI_API_URL || "http://localhost:3333"
const FETCH_TIMEOUT_MS = 5_000
// Env-tunable for tests only (10 ms there); 60 s in production. Read once at
// module load — a runtime change has no effect (AD-010: listed in turbo.json
// tasks.test.passThroughEnv).
const REINDEX_DEBOUNCE_MS = Number(process.env.MASSA_AI_REINDEX_DEBOUNCE_MS || 60_000)
const REINDEX_FILE_THRESHOLD = 15
const MAX_EDITED_FILES_TRACKED = 200
const MAX_PENDING_TOOL_CALLS = 200

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
// Plugin (V2 API — the host loads the default export and expects
// { id, setup }: hooks register on ctx domains inside setup, cleanup is the
// function setup returns). Plugin.define is an identity function, so the
// object is built directly and @opencode/plugin stays a type-only import:
// the bundle carries no copy of `effect`, which V2 hosts require to be their
// own instance. src/index.ts is the V1 entry; install.sh picks one by host
// version.
// ---------------------------------------------------------------------------

const plugin: Plugin.Plugin = {
  id: "massa-ai",

  async setup(ctx) {
    // Auto-configure on first run
    ensureConfig()
    
    loadConfig()

    // V2 context: ctx.location is already worktree-resolved (V1:
    // `worktree || directory`).
    const directory = ctx.location.directory
    const projectPath = directory

    // Per-session project id memo (M45/HAR-04): the first event of a session
    // computes the id (project?.id > git toplevel basename > directory basename
    // > "default"); later events of that session reuse it even from subdirectory
    // contexts. `projectId` (no session) keeps the same computed value for the
    // request/response tools below.
    const projectPins = new SessionProjectPin({
      computeProjectId: () =>
        computePluginProjectId({
          projectId: ctx.location.project?.id,
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

    // Call-id → { name, input } join for the session.tool.* lifecycle events
    // (name and args arrive on separate events — see the handler). Bounded:
    // oldest entry evicted at the cap.
    const pendingToolCalls = new Map<string, { name?: string; input?: unknown }>()

    function memoToolCall(id: string | undefined, patch: { name?: string; input?: unknown }) {
      if (!id) return
      const entry = pendingToolCalls.get(id) ?? {}
      Object.assign(entry, patch)
      if (pendingToolCalls.size >= MAX_PENDING_TOOL_CALLS) {
        const oldest = pendingToolCalls.keys().next()
        if (!oldest.done) pendingToolCalls.delete(oldest.value)
      }
      pendingToolCalls.set(id, entry)
    }

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

    // V2 ctx exposes no plugin-side app.log domain — plain console with a
    // prefix, best-effort by nature (V1 routed to client.app.log).
    function log(level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
      console.log(`[massa-ai] [${level}] ${message}`, extra ?? "")
    }

    // V2 ctx exposes no TUI API — V1's client.tui.showToast was best-effort
    // (`.catch(() => {})`), so log instead. Variant kept in the output so
    // error/success intent stays observable.
    function toast(message: string, variant: "success" | "error" | "info" = "info") {
      console.log(`[massa-ai] [toast:${variant}] ${message}`)
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

    // -------------------------------------------------------------------------
    // Hook registration (V2). No in-process tool registrations: AD-017 —
    // plugins deliver, MCP serves tools, hooks observe. The MCP server
    // registered by scripts/install-agents.sh is the one canonical tool
    // surface (59 tools); in-process tools are never a coverage mechanism.
    // -------------------------------------------------------------------------

    await ctx.tool.hook("execute.before", (event) => {
      const ev = event as any
      try {
        const line = buildOpenCodeAgentAnnouncement(ev.tool, ev.input ?? ev.args, openCodeAgentDirs(directory, process.env))
        if (line) toast(line)
      } catch {}
    })

    // Capture git operations after bash execution.
    // V2 event: { tool, sessionID, agent, messageID, id, input, status, result|error } —
    // args live in `input` (V1: `args`), tool output in `result.output` (V1:
    // separate `output.output` argument). Read defensively for host drift.
    await ctx.tool.hook("execute.after", (event) => {
      const ev = event as any
      if (!apiAvailable) return

      const args = ev.input ?? ev.args
      const output = ev.result?.output ?? ev.output
      const sessionId: string | undefined = ev.sessionID

      // Emit a post-tool-use observation for EVERY tool (SG-7/#21). The server
      // classifies via payload.tool_name (Read/Write/Bash/Edit/etc.). We pass
      // OpenCode tool names raw; TOOL_NAME_NORMALIZE maps them. Non-blocking.
      observations.emit({
        event: "post-tool-use",
        projectId: projectPins.for(sessionId),
        sessionId,
        agentId: agentIdOf(ev),
        payload: buildToolPayload({
          tool: ev.tool,
          args,
          output,
          cwd: projectPath,
          sessionId,
        }),
      })

      if (ev.tool !== "bash") return

      const cmd = String(args?.command || "")
      if (!cmd.includes("git commit") && !cmd.includes("git merge") && !cmd.includes("git rebase")) return

      const result = String(output || "").slice(0, 300)
      fireAndForget("/api/v1/memory/store", {
        content: `Git: ${cmd.slice(0, 200)}\nResult: ${result}`,
        type: "code",
        projectId: projectPins.for(sessionId),
        sessionId,
        tags: ["git"],
        importance: 0.6,
        format: "toon",
      }, "git-capture")
    })

    // Compaction: fetch real memories and inject as context, + build snapshot.
    // V2's `compaction` hook receives the full model request — `messages` is
    // the transcript being summarized, so memories are appended as a user-role
    // message (V1 pushed strings into output.context[]). Never set
    // `event.result`: that hands the host a finished summary and skips the
    // model call entirely.
    await ctx.session.hook("compaction", async (event) => {
      if (!apiAvailable) return

      try {
        const memories = await massaAiFetch<{ success: boolean; data?: { memories?: Array<{ content: string }> } }>(
          "/api/v1/memory/search",
          {
            query: `project ${projectId} critical decisions patterns`,
            projectId,
            sessionId: event.sessionID,
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
          if (Array.isArray(event.messages)) {
            event.messages.push({
              role: "user",
              content: [{ type: "text", text: `## massa-ai - Persistent Memories\n${memoryText}` }],
            } as any)
          }
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
            sessionId: event.sessionID,
            projectId: projectPins.for(event.sessionID),
            persist: true,
          },
          5_000,
        )
      } catch (err) {
        log("debug", "Failed to build compaction snapshot", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })

    // User-prompt observation (V1 watched `command.executed` on the event
    // stream — that event no longer exists in V2). The `prompt` hook runs
    // once per admitted user prompt; commands submitting via session.prompt
    // run it too.
    await ctx.session.hook("prompt", (event) => {
      if (!apiAvailable) return
      const text = String(event.prompt?.text ?? "").trim()
      if (!text) return
      observations.emit({
        event: "user-prompt",
        projectId: projectPins.for(event.sessionID),
        sessionId: event.sessionID,
        agentId: agentIdOf(event),
        payload: buildPromptPayload({ prompt: text, cwd: projectPath }),
      })
    })

    // Inject massa-ai env vars into shell. V2's `create.before` event IS the
    // shell launch payload — mutate `env` in place. sessionID is not in the
    // public type; read defensively.
    await ctx.shell.hook("create.before", (event) => {
      const ev = event as any
      ev.env.MASSA_AI_PROJECT_ID = projectPins.for(ev.sessionID)
      ev.env.MASSA_AI_PROJECT_PATH = projectPath
      ev.env.MASSA_AI_API_URL = MASSA_AI_API_URL
    })

    // Unified event stream. V2 replaces V1's `event` hook (and the separate
    // `session.created` hook, folded in below) with one async subscription.
    const controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        await handleEvent(event as any)
      }
    })().catch(() => {}) // dispose aborts the iterator — swallow the rejection

    async function handleEvent(event: { type: string; properties?: any; data?: any }) {
      // V1 events carried payloads in `properties`; V2 events carry them in `data`.
      const props = event.properties ?? event.data ?? {}

      // Health check + auto-index on session start (folded V1 `session.created`
      // hook — V2 has no direct hook for it; the event type name survives).
      if (event.type === "session.created") {
        try {
          const healthController = new AbortController()
          const timer = setTimeout(() => healthController.abort(), 3_000)
          const res = await fetch(`${MASSA_AI_API_URL}/health`, { signal: healthController.signal })
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
      }

      // Track file edits for incremental reindex. V2 renames file.edited /
      // file.watcher.updated to filesystem.changed (with an add/change/unlink
      // kind); the V1 names stay for hosts that still emit them.
      if (event.type === "file.edited" || event.type === "file.watcher.updated") {
        trackFile(props.file)
        return
      }
      if (event.type === "filesystem.changed") {
        if (props.event !== "unlink") trackFile(props.file)
        return
      }

      // ── Lifecycle observations (SG-7/#21) ──────────────────────────────
      // OpenCode has no dedicated session-start/stop or user-prompt-submit
      // hooks (unlike Claude Code). The closest lifecycle signals:
      //  - session.hook("prompt")   → user-prompt (registered above; V1 used
      //                              the now-defunct command.executed event)
      //  - session.tool.* events    → post-tool-use for tool completions
      //                              (covers MCP + agent tools that bypass
      //                              tool.execute.after; V1 used the
      //                              now-defunct message.part.updated event)
      //  - session.idle/deleted   → session-end
      // One tool call is split across three events — name (input.started),
      // args (called), outcome (success/failed) — joined by the call id.
      if (event.type === "session.tool.input.started") {
        const p = props as { id?: string; name?: string }
        memoToolCall(p.id, { name: p.name })
      }

      if (event.type === "session.tool.called") {
        const p = props as { id?: string; input?: unknown }
        memoToolCall(p.id, { input: p.input })
      }

      if (event.type === "session.tool.success" || event.type === "session.tool.failed") {
        const p = props as {
          id?: string
          sessionID?: string
          content?: Array<{ type?: string; text?: string }>
          error?: { message?: string }
        }
        const entry = p.id ? pendingToolCalls.get(p.id) : undefined
        if (p.id) pendingToolCalls.delete(p.id)
        const toolName = entry?.name
        if (!apiAvailable || !toolName) return
        const failed = event.type === "session.tool.failed"
        observations.emit({
          event: "post-tool-use",
          projectId: projectPins.for(p.sessionID),
          sessionId: p.sessionID,
          agentId: agentIdOf(p),
          payload: buildToolPayload({
            tool: toolName,
            args: entry?.input,
            output: failed
              ? p.error?.message ?? String(p.error ?? "")
              : p.content?.find((c) => c?.type === "text" && typeof c.text === "string")?.text,
            cwd: projectPath,
            sessionId: p.sessionID,
          }),
          importance: failed ? 0.7 : undefined,
        })
      }

      if (apiAvailable && (event.type === "session.idle" || event.type === "session.deleted")) {
        const p = props as { sessionID?: string }
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

      // shortcut: V2 event stream exposes no LSP diagnostics event (checked
      // the full OpenCodeEvent union in @opencode/plugin@2.0.28); restore the
      // V1 lsp.client.diagnostics → /memory/store capture when the host adds one.
    }

    // Best-effort teardown (V1 `dispose`): stop the event subscription and
    // flush buffered observations. Never throws.
    return async () => {
      controller.abort()
      try {
        await observations.dispose()
      } catch {
        // swallow — dispose must never throw
      }
    }
  },
}

export default plugin
