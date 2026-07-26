#!/usr/bin/env bun
/**
 * massa-ai subagent-artifacts generator (single source of truth).
 *
 * Reads every charter under skills/agents/ and emits per-host agent files into
 * apps/{claude,codex,cursor,opencode}-plugin/agents/. Outputs are checked into
 * git so the plugins ship without a runtime build step.
 *
 *   bun run scripts/generate-subagent-artifacts.ts        # emit 64 files (16 x 4 hosts)
 *   bun run scripts/generate-subagent-artifacts.ts --check # drift gate: diff vs checked-in
 *
 * Model + effort + permission are PINNED per host (spec, NOT advisory). A parity
 * test (T4) re-runs --check so charter-to-shipped drift fails CI.
 */

import { promises as fs } from "fs";
import path from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

// ── Paths ───────────────────────────────────────────────────────────────────
const ROOT = path.resolve(import.meta.dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const APPS_DIR = path.join(ROOT, "apps");

const HOST_DIRS: Record<Host, string> = {
  claude: path.join(APPS_DIR, "claude-plugin", "agents"),
  codex: path.join(APPS_DIR, "codex-plugin", "agents"),
  cursor: path.join(APPS_DIR, "cursor-plugin", "agents"),
  opencode: path.join(APPS_DIR, "opencode-plugin", "agents"),
};

// ── Charter registry (every charter under skills/agents/) ───────────────────
const SPECIALIST_NAMES = [
  "investigator",
  "planner",
  "builder",
  "reviewer",
  "context-curator",
  "verification-agent",
  "requirements-analyst",
  "architecture-specialist",
  "test-engineer",
  "documentation-agent",
  "audit-specialist",
  "mobile-specialist",
  "plan-critic",
  "furps-analyst",
  "navigator",
] as const;
type SpecialistName = (typeof SPECIALIST_NAMES)[number];

// ── Write-permission set (spec AC CLA-03 / design.md) ───────────────────────
// These three charters declare `permission: write` (test-engineer and
// documentation-agent are scoped writers: test files / doc files only, with a
// disjoint write set). Charter frontmatter and this set must agree —
// scripts/__tests__/skills-harness-integrity.test.ts enforces that.
const WRITE_AGENTS: ReadonlySet<SpecialistName> = new Set<SpecialistName>([
  "builder",
  "test-engineer",
  "documentation-agent",
]);

// ── Model-pinning tables (spec, PINNED, NOT advisory) ───────────────────────
// Claude aliases + effort: high (spec Claude table)
const AGENT_MODELS_CLAUDE: Record<SpecialistName, "haiku" | "sonnet" | "opus"> = {
  investigator: "haiku",
  "context-curator": "haiku",
  "documentation-agent": "haiku",
  "requirements-analyst": "sonnet",
  planner: "opus",
  builder: "sonnet",
  reviewer: "sonnet",
  "verification-agent": "sonnet",
  "test-engineer": "sonnet",
  "audit-specialist": "sonnet",
  "mobile-specialist": "sonnet",
  "architecture-specialist": "opus",
  "plan-critic": "opus",
  "furps-analyst": "sonnet",
  navigator: "sonnet",
};

// Codex IDs + model_reasoning_effort = "high" (spec Codex table)
const AGENT_MODELS_CODEX: Record<SpecialistName, string> = {
  investigator: "gpt-5.4-mini",
  "context-curator": "gpt-5.4-mini",
  "documentation-agent": "gpt-5.4-mini",
  "requirements-analyst": "gpt-5.6-terra",
  planner: "gpt-5.6-sol",
  builder: "gpt-5.6-terra",
  reviewer: "gpt-5.6-terra",
  "verification-agent": "gpt-5.6-terra",
  "test-engineer": "gpt-5.6-terra",
  "audit-specialist": "gpt-5.6-terra",
  "mobile-specialist": "gpt-5.6-terra",
  "architecture-specialist": "gpt-5.6-sol",
  "plan-critic": "gpt-5.6-sol",
  "furps-analyst": "gpt-5.6-terra",
  navigator: "gpt-5.4-mini",
};

// OpenCode ids + reasoningEffort: max (spec OpenCode table). OpenCode resolves
// `model` as `<provider>/<model-id>` and silently falls back to the session
// default on anything else — the charter's human-readable model_hint
// ("DeepSeek V4 Pro") is not resolvable, so OpenCode pins ids like the other
// two hosts. The tier split matches the charter hints.
const AGENT_MODELS_OPENCODE: Record<SpecialistName, string> = {
  investigator: "opencode-go/deepseek-v4-pro",
  "context-curator": "opencode-go/deepseek-v4-pro",
  "documentation-agent": "opencode-go/deepseek-v4-pro",
  "requirements-analyst": "opencode-go/deepseek-v4-pro",
  planner: "opencode-go/glm-5.2",
  builder: "opencode-go/glm-5.2",
  reviewer: "opencode-go/glm-5.2",
  "verification-agent": "opencode-go/glm-5.2",
  "test-engineer": "opencode-go/glm-5.2",
  "audit-specialist": "opencode-go/glm-5.2",
  "mobile-specialist": "opencode-go/glm-5.2",
  "architecture-specialist": "opencode-go/minimax-m3",
  "plan-critic": "opencode-go/minimax-m3",
  "furps-analyst": "opencode-go/glm-5.2",
  navigator: "opencode-go/deepseek-v4-pro",
};

// Cursor uses charter metadata.model_hint verbatim + reasoningEffort: max.
// (Resolved at parse time from each charter's frontmatter.)

// ── Permission -> tools mapping (spec permission mapping) ───────────────────
// Navigator precedent (apps/claude-plugin/agents/massa-ai-navigator.md) uses
// JSON-array tools with capital "Glob"; match that convention for all Claude/Cursor agents.
const READ_ONLY_TOOLS = ["Read", "Grep", "Glob", "Bash"];
const WRITE_TOOLS = [...READ_ONLY_TOOLS, "Write", "Edit"];

// Charters whose tool set is not the default read-only/write set. The navigator
// is index-first: it reaches the massa-ai MCP surface and needs only `pwd` from
// the shell (charter metadata.tools: mcp-index).
const AGENT_TOOLS_OVERRIDE: Partial<Record<SpecialistName, readonly string[]>> = {
  navigator: ["mcp__massa-ai__*", "Read", "Grep", "Glob", "Bash(pwd)"],
};

export function toolsFor(name: SpecialistName): readonly string[] {
  const override = AGENT_TOOLS_OVERRIDE[name];
  if (override) return override;
  return WRITE_AGENTS.has(name) ? WRITE_TOOLS : READ_ONLY_TOOLS;
}

// OpenCode bash permission (spec OPC-07 / design.md plan-critic F4).
// Default: write agents -> bash: allow; planner -> bash: { "*": "ask" };
// every other read-only agent -> bash: deny. Overrides narrow that further.
const OPENCODE_BASH_OVERRIDE: Partial<Record<SpecialistName, string>> = {
  planner: `{ "*": "ask" }`,
  navigator: `{ "pwd": "allow", "*": "deny" }`,
};

// ── Host built-in names (spec name-collision ACs) ───────────────────────────
const HOST_BUILTINS: Record<Host, ReadonlySet<string>> = {
  claude: new Set(["Explore", "Plan", "general-purpose"]),
  codex: new Set(["default", "worker", "explorer"]),
  cursor: new Set(["Explore", "Plan", "general-purpose"]),
  opencode: new Set(["build", "plan", "general", "explore", "scout"]),
};

// ── Types ───────────────────────────────────────────────────────────────────
export type Host = "claude" | "codex" | "cursor" | "opencode";
export type Permission = "read-only" | "write";

export interface Charter {
  name: SpecialistName;
  description: string;
  modelHint: string;
  permission: Permission;
  body: string;
}

// ── YAML frontmatter parser (minimal, charter-shaped) ───────────────────────
export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) {
    throw new Error(
      "charter missing YAML frontmatter (--- ... ---) block"
    );
  }
  const yamlText = match[1] ?? "";
  const body = (match[2] ?? "").replace(/^\r?\n/, "");
  const frontmatter = parseSimpleYaml(yamlText);
  return { frontmatter, body };
}

export function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1] as string;
    const rest = (m[2] ?? "").trim();
    if (rest !== "") {
      result[key] = unquoteScalar(rest);
      i++;
      continue;
    }
    // Nested mapping (e.g. metadata: block). Only one level of nesting is
    // used by the charters (metadata.model_hint / metadata.permission).
    const nested: Record<string, unknown> = {};
    i++;
    while (i < lines.length) {
      const nestedLine = lines[i] ?? "";
      if (/^\s{2,}\S/.test(nestedLine) === false) break;
      const nm = /^\s{2,}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(nestedLine);
      if (!nm) break;
      nested[nm[1] as string] = unquoteScalar((nm[2] ?? "").trim());
      i++;
    }
    result[key] = nested;
  }
  return result;
}

export function unquoteScalar(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

// ── Charter loader ──────────────────────────────────────────────────────────
export async function loadCharter(name: SpecialistName): Promise<Charter> {
  const file = path.join(SKILLS_DIR, "agents", name, "SKILL.md");
  const raw = await fs.readFile(file, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const metadata = (frontmatter.metadata ?? {}) as Record<string, unknown>;
  const modelHint = String(metadata.model_hint ?? "");
  const permissionRaw = String(metadata.permission ?? "read-only");
  const permission: Permission =
    permissionRaw === "write" ? "write" : "read-only";
  const description = String(frontmatter.description ?? "");
  if (!description) {
    throw new Error(`charter ${name} missing description`);
  }
  if (!modelHint) {
    throw new Error(`charter ${name} missing metadata.model_hint`);
  }
  return { name, description, modelHint, permission, body };
}

export async function loadAllCharters(): Promise<Charter[]> {
  const charters: Charter[] = [];
  for (const name of SPECIALIST_NAMES) {
    charters.push(await loadCharter(name));
  }
  return charters;
}

// ── Per-host emitters ───────────────────────────────────────────────────────

export function emitClaude(c: Charter): string {
  const agentName = `massa-ai-${c.name}`;
  const toolsJson = JSON.stringify(toolsFor(c.name));
  const model = AGENT_MODELS_CLAUDE[c.name];
  // CLA-04: omit hooks/mcpServers/permissionMode (blocked on plugin-shipped agents)
  const fm = [
    "---",
    `name: ${agentName}`,
    `description: ${c.description}`,
    `tools: ${toolsJson}`,
    `model: ${model}`,
    `effort: high`,
    "---",
    "",
  ].join("\n");
  return fm + c.body + "\n";
}

export function emitCursor(c: Charter): string {
  const agentName = `massa-ai-${c.name}`;
  const toolsJson = JSON.stringify(toolsFor(c.name));
  // CRS-08: model = charter hint verbatim; reasoningEffort: max (pass-through)
  const fm = [
    "---",
    `name: ${agentName}`,
    `description: ${c.description}`,
    `tools: ${toolsJson}`,
    `model: ${c.modelHint}`,
    `reasoningEffort: max`,
    "---",
    "",
  ].join("\n");
  return fm + c.body + "\n";
}

export function escapeTomlTripleQuote(s: string): string {
  return s.replace(/"""/g, '\\"\\"\\"');
}

export function emitCodex(c: Charter): string {
  const agentName = `massa-ai-${c.name}`;
  const isWrite = WRITE_AGENTS.has(c.name);
  const sandboxMode = isWrite ? "workspace-write" : "read-only";
  const model = AGENT_MODELS_CODEX[c.name];
  const bodyEscaped = escapeTomlTripleQuote(c.body);
  // CDX-07: top comment `# massa-ai-owned` for scoped uninstall
  const lines = [
    "# massa-ai-owned",
    `name = "${agentName}"`,
    `description = ${tomlQuoted(c.description)}`,
    `model = "${model}"`,
    `model_reasoning_effort = "high"`,
    `sandbox_mode = "${sandboxMode}"`,
    `developer_instructions = """${bodyEscaped}"""`,
    "",
  ];
  return lines.join("\n");
}

export function tomlQuoted(s: string): string {
  // Basic TOML string escaping.
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function emitOpenCode(c: Charter): string {
  const agentName = `massa-ai-${c.name}`;
  const isWrite = WRITE_AGENTS.has(c.name);
  // OPC-07: permission per-agent bash mapping
  const bashOverride = OPENCODE_BASH_OVERRIDE[c.name];
  let permissionBlock: string;
  if (isWrite) {
    permissionBlock = `{ edit: allow, bash: allow }`;
  } else if (bashOverride) {
    permissionBlock = `{ edit: deny, bash: ${bashOverride} }`;
  } else {
    permissionBlock = `{ edit: deny, bash: deny }`;
  }
  // OPC-07: metadata ownership marker (hosts ignore unknown frontmatter)
  const fm = [
    "---",
    `name: ${agentName}`,
    `description: ${c.description}`,
    // `all` (not `subagent`): OpenCode's Tab switcher lists primary/all agents
    // only, so `subagent` made the 12 specialists unselectable by hand. `all`
    // keeps auto-delegation and @-mention while adding manual selection.
    `mode: all`,
    `model: ${AGENT_MODELS_OPENCODE[c.name]}`,
    `reasoningEffort: max`,
    `permission: ${permissionBlock}`,
    `metadata: { massa-ai-owned: true }`,
    "---",
    "",
  ].join("\n");
  return fm + c.body + "\n";
}

// ── Emit-all + check ────────────────────────────────────────────────────────
export async function emitAll(targetDirs: Record<Host, string>): Promise<void> {
  const charters = await loadAllCharters();
  for (const [host, dir] of Object.entries(targetDirs) as [Host, string][]) {
    await fs.mkdir(dir, { recursive: true });
    for (const c of charters) {
      const ext = host === "codex" ? "toml" : "md";
      const fileName = `massa-ai-${c.name}.${ext}`;
      const filePath = path.join(dir, fileName);
      const content =
        host === "claude"
          ? emitClaude(c)
          : host === "codex"
            ? emitCodex(c)
            : host === "cursor"
              ? emitCursor(c)
              : emitOpenCode(c);
      await fs.writeFile(filePath, content, "utf8");
    }
  }
}

export async function diffHost(
  generatedDir: string,
  checkedInDir: string,
  host: Host
): Promise<string[]> {
  // Compare every generated charter file per host. Non-massa-ai files in the
  // host dir are not generator-owned and are ignored.
  const ext = host === "codex" ? "toml" : "md";
  const expected = SPECIALIST_NAMES.map(
    (n) => `massa-ai-${n}.${ext}`
  );
  const diffs: string[] = [];
  for (const rel of expected) {
    const gp = path.join(generatedDir, rel);
    const cp = path.join(checkedInDir, rel);
    const [gbuf, cbuf] = await Promise.all([
      fs.readFile(gp).catch(() => null),
      fs.readFile(cp).catch(() => null),
    ]);
    if (gbuf === null && cbuf !== null) {
      diffs.push(`+ ${rel} (missing in generated)`);
    } else if (gbuf !== null && cbuf === null) {
      diffs.push(`- ${rel} (missing in checked-in)`);
    } else if (gbuf !== null && cbuf !== null) {
      if (!gbuf.equals(cbuf)) {
        diffs.push(`M ${rel}`);
      }
    }
  }
  return diffs;
}

export async function runCheck(): Promise<number> {
  // Emit to a temp dir, diff against checked-in dirs.
  const tmp = await fs.mkdtemp(path.join(tmpdir(), "massa-ai-gen-"));
  try {
    const tmpDirs: Record<Host, string> = {
      claude: path.join(tmp, "claude"),
      codex: path.join(tmp, "codex"),
      cursor: path.join(tmp, "cursor"),
      opencode: path.join(tmp, "opencode"),
    };
    await emitAll(tmpDirs);
    let drift = false;
    for (const host of Object.keys(HOST_DIRS) as Host[]) {
      const diffs = await diffHost(tmpDirs[host], HOST_DIRS[host], host);
      if (diffs.length > 0) {
        drift = true;
        console.error(
          `[${host}] drift detected (${diffs.length} file(s) differ):`
        );
        for (const d of diffs) {
          console.error(`  ${d}`);
        }
      }
    }
    if (drift) {
      console.error(
        "\nDrift detected. Re-run `bun run scripts/generate-subagent-artifacts.ts` and commit the output."
      );
      return 1;
    }
    console.log("No drift: generated files match checked-in files.");
    return 0;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = argv;
  const check = args.includes("--check");
  if (check) {
    return runCheck();
  }
  await emitAll(HOST_DIRS);
  const hostCount = Object.keys(HOST_DIRS).length;
  const total = SPECIALIST_NAMES.length * hostCount;
  console.log(
    `Emitted ${total} agent files (${SPECIALIST_NAMES.length} x ${hostCount} hosts).`
  );
  return 0;
}

if (import.meta.main) {
  const code = await main();
  if (code !== 0) {
    process.exit(code);
  }
}