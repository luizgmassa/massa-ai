import { readFileSync } from "fs"
import { homedir } from "os"
import path from "path"

const OWNED_MARKER_MD = "<!-- massa-ai-owned: true -->"
const AGENT_NAME = /^[a-z0-9][a-z0-9-]*$/

function frontmatterValue(frontmatter: string, key: string): string | null {
  const match = new RegExp(`^${key}:[ \\t]*(.+?)\\r?$`, "m").exec(frontmatter)
  const value = match?.[1]?.trim().replace(/^["']|["']$/g, "")
  return value ? value : null
}

export function openCodeAgentDirs(directory: string, env: Readonly<Record<string, string | undefined>>): string[] {
  const xdg = env.XDG_CONFIG_HOME?.trim()
  return [
    path.join(directory, ".opencode", "agents"),
    path.join(xdg ? xdg : path.join(homedir(), ".config"), "opencode", "agents"),
  ]
}

export function buildOpenCodeAgentAnnouncement(tool: string, args: unknown, agentDirs: string[]): string | null {
  if (tool !== "task" || !args || typeof args !== "object") return null
  const name = (args as Record<string, unknown>).subagent_type
  if (typeof name !== "string" || !AGENT_NAME.test(name)) return null
  for (const dir of agentDirs) {
    let raw: string
    try {
      raw = readFileSync(path.join(dir, `${name}.md`), "utf8")
    } catch {
      continue
    }
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([^\r\n]*)/.exec(raw)
    if (!match || match[2]!.trim() !== OWNED_MARKER_MD) return null
    const model = frontmatterValue(match[1]!, "model") ?? "inherit"
    const effort = frontmatterValue(match[1]!, "reasoningEffort") ?? "inherit"
    return `Agent dispatch: ${name} — model ${model}, effort ${effort}`
  }
  return null
}
