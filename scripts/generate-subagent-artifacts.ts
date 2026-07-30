#!/usr/bin/env bun
/**
 * massa-ai subagent-artifacts generator (single source of truth).
 *
 * Reads every charter under skills/agents/ and emits per-host agent files into
 * apps/{claude,codex,cursor,opencode}-plugin/agents/. Outputs are checked into
 * git so the plugins ship without a runtime build step.
 *
 *   bun run scripts/generate-subagent-artifacts.ts        # emit 68 files (17 x 4 hosts)
 *   bun run scripts/generate-subagent-artifacts.ts --check # drift gate: diff vs checked-in
 *
 * Model + effort + permission are PINNED per host (spec, NOT advisory). A parity
 * test (T4) re-runs --check so charter-to-shipped drift fails CI.
 */

import { promises as fs } from "fs";
import path from "path";
import { tmpdir } from "os";
import {
  loadRegistry,
  profileFlagFrom,
  resolveTier,
  selectProfile,
  type Host as RegistryHost,
  type Registry,
  type Resolved,
} from "./lib/model-profiles.ts";

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
  "meta-judge",
  "judge",
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

// ── Model + effort resolution ───────────────────────────────────────────────
// The three hard-coded per-host model tables that used to live here are gone.
// Every model and effort value now comes from `skills/model-profiles.json`,
// resolved as (charter tier) x host x profile. See
// .specs/features/model-profile-registry/design.md.
//
// The emitters below own only HOST SYNTAX: which key name a host uses, and how it
// spells "inherit". They never know what a profile is.

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

// ── Types ───────────────────────────────────────────────────────────────────
export type Host = "claude" | "codex" | "cursor" | "opencode";
export type Permission = "read-only" | "write";

export interface Charter {
  name: SpecialistName;
  description: string;
  /**
   * Capability tier from `metadata.model_tier`, resolved against
   * `skills/model-profiles.json` to a concrete `{model, effort}` per host.
   * The charter owns this because the tier is a property of the agent's job.
   */
  modelTier: string;
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
    // used by the charters (metadata.model_tier / metadata.permission).
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
/** Where charters live. A parameter only so the throws below can be tested against the
 *  real loader instead of a re-implementation of it — production always uses the default. */
export const CHARTERS_DIR = path.join(SKILLS_DIR, "agents");

export async function loadCharter(
  name: SpecialistName,
  chartersDir: string = CHARTERS_DIR
): Promise<Charter> {
  const file = path.join(chartersDir, name, "SKILL.md");
  const raw = await fs.readFile(file, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const metadata = (frontmatter.metadata ?? {}) as Record<string, unknown>;
  const modelTier = String(metadata.model_tier ?? "");
  const permissionRaw = String(metadata.permission ?? "read-only");
  const permission: Permission =
    permissionRaw === "write" ? "write" : "read-only";
  const description = String(frontmatter.description ?? "");
  if (!description) {
    throw new Error(`charter ${name} missing description`);
  }
  // Never default a tier. A charter with no tier must stop the build, because a
  // silent default would ship some other model to users without anyone noticing.
  if (!modelTier) {
    throw new Error(
      `charter ${name} missing metadata.model_tier (expected one of the tiers in skills/model-profiles.json)`
    );
  }
  // A charter must not name a model. That is the drift this registry removes: the old
  // `metadata.model_hint` was a literal model name that Cursor consumed verbatim, and it
  // could disagree with the generator's own tables. Fail loudly if one reappears.
  if (metadata.model_hint !== undefined) {
    throw new Error(
      `charter ${name} still declares metadata.model_hint. Charters declare a tier ` +
        `(metadata.model_tier), never a model name — see skills/model-profiles.json.`
    );
  }
  return { name, description, modelTier, permission, body };
}

export async function loadAllCharters(): Promise<Charter[]> {
  const charters: Charter[] = [];
  for (const name of SPECIALIST_NAMES) {
    charters.push(await loadCharter(name));
  }
  return charters;
}

// ── Per-host emitters ───────────────────────────────────────────────────────

/**
 * Claude Code. Documented plugin-agent fields include name, description, model, effort,
 * tools. `model` accepts an alias, a full id, or `inherit` (which is also the default).
 * https://code.claude.com/docs/en/sub-agents.md
 *
 * CLA-04: omit hooks/mcpServers/permissionMode — rejected on plugin-shipped agents.
 */
export function emitClaude(c: Charter, m: Resolved): string {
  const agentName = `massa-ai-${c.name}`;
  const toolsJson = JSON.stringify(toolsFor(c.name));
  const lines = [
    "---",
    `name: ${agentName}`,
    `description: ${c.description}`,
    `tools: ${toolsJson}`,
    `model: ${m.model ?? "inherit"}`,
  ];
  if (m.effort !== null) lines.push(`effort: ${m.effort}`);
  lines.push("---", "");
  return lines.join("\n") + c.body + "\n";
}

/**
 * Cursor. Its subagent frontmatter is exactly five fields — name, description, model,
 * readonly, is_background — and NOTHING else.
 * https://cursor.com/docs/subagents.md
 *
 * Two keys this emitter used to write are not in that schema and never took effect:
 *   - `tools`: Cursor has no tool allowlist for markdown subagents. `readonly: true` is
 *     the documented permission mechanism, so that is what a read-only charter gets.
 *   - `reasoningEffort`: not a Cursor key. Effort is a bracket parameter on a pinned model
 *     id (`claude-opus-5[effort=high]`), which is only expressible when a model is pinned.
 *
 * `model` takes an id, not a display name, so the human-readable names this emitter used to
 * copy out of the charters could never resolve — and two of the three were absent from
 * Cursor's catalog entirely, usable only as per-machine BYOK entries. The registry therefore
 * pins nothing for Cursor and this emits the documented default, `inherit`; the retired
 * values are recorded in the frozen baseline fixture and in `spec.md` §1, which are the
 * places allowed to name a model. `readonly` is omitted for writers because `false` is
 * already its default.
 */
export function emitCursor(c: Charter, m: Resolved): string {
  const agentName = `massa-ai-${c.name}`;
  const model =
    m.model === null ? "inherit" : m.effort === null ? m.model : `${m.model}[effort=${m.effort}]`;
  const lines = ["---", `name: ${agentName}`, `description: ${c.description}`, `model: ${model}`];
  if (!WRITE_AGENTS.has(c.name)) lines.push(`readonly: true`);
  lines.push("---", "");
  return lines.join("\n") + c.body + "\n";
}

export function escapeTomlTripleQuote(s: string): string {
  return s.replace(/"""/g, '\\"\\"\\"');
}

/**
 * Codex. All six keys below are documented agent-TOML keys, and `sandbox_mode` is the
 * documented per-agent read-only mechanism (Codex has no `tools` key at any layer).
 * https://learn.chatgpt.com/docs/agent-configuration/subagents
 *
 * Note the effort enum here is `minimal|low|medium|high|xhigh` — Codex has no `max`.
 * Omitting `model` / `model_reasoning_effort` means "inherit from the parent session",
 * which is how a null registry value is spelled on this host.
 */
export function emitCodex(c: Charter, m: Resolved): string {
  const agentName = `massa-ai-${c.name}`;
  const isWrite = WRITE_AGENTS.has(c.name);
  const sandboxMode = isWrite ? "workspace-write" : "read-only";
  const bodyEscaped = escapeTomlTripleQuote(c.body);
  // CDX-07: top comment `# massa-ai-owned` for scoped uninstall. This is a real TOML
  // comment and is greped by apps/codex-plugin/install.sh — it stays.
  const lines = [
    "# massa-ai-owned",
    `name = "${agentName}"`,
    `description = ${tomlQuoted(c.description)}`,
  ];
  if (m.model !== null) lines.push(`model = "${m.model}"`);
  if (m.effort !== null) lines.push(`model_reasoning_effort = "${m.effort}"`);
  lines.push(
    `sandbox_mode = "${sandboxMode}"`,
    `developer_instructions = """${bodyEscaped}"""`,
    ""
  );
  return lines.join("\n");
}

export function tomlQuoted(s: string): string {
  // Basic TOML string escaping.
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Marker that scopes `massa-ai-config agents uninstall`. It lives in the BODY, not the
 * frontmatter — see emitOpenCode.
 */
export const OPENCODE_OWNED_MARKER = "<!-- massa-ai-owned: true -->";

/**
 * OpenCode. https://opencode.ai/docs/agents/
 *
 * Two keys this emitter used to write are not OpenCode keys, and OpenCode does not ignore
 * unknown keys — it forwards them to the model provider as model options:
 * "Any other options you specify in your agent configuration will be passed through
 * directly to the provider as model options."
 *
 *   - `name`: not a frontmatter key at all. "The markdown file name becomes the agent
 *     name." The file is already massa-ai-<n>.md, so dropping this is behaviour-preserving.
 *   - `metadata`: not a key either. But it is NOT dead — the literal substring
 *     "massa-ai-owned: true" scopes `agents uninstall` in
 *     apps/opencode-plugin/src/config-cli.ts, which installs real file copies (the
 *     install.sh path installs symlinks and scopes by filename instead). Deleting it would
 *     make uninstall match zero files and orphan 15 installed agents.
 *
 * So the marker MOVES to the first body line as a markdown comment. It is then body text
 * rather than a model option, while still containing the substring config-cli greps — which
 * also keeps uninstall working against agent files an older version installed in the
 * frontmatter form. No config-cli change needed.
 */
export function emitOpenCode(c: Charter, m: Resolved): string {
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
  const lines = [
    "---",
    `description: ${c.description}`,
    // `all` (not `subagent`): OpenCode's Tab switcher lists primary/all agents
    // only, so `subagent` made the 12 specialists unselectable by hand. `all`
    // keeps auto-delegation and @-mention while adding manual selection.
    `mode: all`,
  ];
  if (m.model !== null) lines.push(`model: ${m.model}`);
  if (m.effort !== null) lines.push(`reasoningEffort: ${m.effort}`);
  lines.push(`permission: ${permissionBlock}`, "---", "");
  return lines.join("\n") + OPENCODE_OWNED_MARKER + "\n" + c.body + "\n";
}

// ── Emit-all + check ────────────────────────────────────────────────────────
export interface EmitOptions {
  /** Pre-loaded registry; loaded from disk when omitted. */
  readonly registry?: Registry;
  /** `--profile=<name>`. Overrides the env var and each host's default. */
  readonly profileFlag?: string | null;
  /** Injected for tests; defaults to process.env. */
  readonly env?: Record<string, string | undefined>;
}

/** Which profile each host resolves against, after the full precedence chain. */
export function profilesPerHost(
  registry: Registry,
  opts: EmitOptions = {}
): Record<Host, string> {
  const out = {} as Record<Host, string>;
  for (const host of Object.keys(HOST_DIRS) as Host[]) {
    out[host] = selectProfile(registry, host as RegistryHost, {
      flag: opts.profileFlag ?? null,
      env: opts.env,
    });
  }
  return out;
}

export async function emitAll(
  targetDirs: Record<Host, string>,
  opts: EmitOptions = {}
): Promise<Record<Host, string>> {
  const charters = await loadAllCharters();
  const registry = opts.registry ?? loadRegistry();
  const profiles = profilesPerHost(registry, opts);
  for (const [host, dir] of Object.entries(targetDirs) as [Host, string][]) {
    await fs.mkdir(dir, { recursive: true });
    const profile = profiles[host];
    for (const c of charters) {
      // Resolution is (charter tier) x host x profile. A tier the profile does not
      // define, or a profile that does not support this host, throws by design.
      const resolved = resolveTier(registry, host as RegistryHost, profile, c.modelTier);
      const ext = host === "codex" ? "toml" : "md";
      const fileName = `massa-ai-${c.name}.${ext}`;
      const filePath = path.join(dir, fileName);
      const content =
        host === "claude"
          ? emitClaude(c, resolved)
          : host === "codex"
            ? emitCodex(c, resolved)
            : host === "cursor"
              ? emitCursor(c, resolved)
              : emitOpenCode(c, resolved);
      await fs.writeFile(filePath, content, "utf8");
    }
  }
  return profiles;
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

export async function runCheck(opts: EmitOptions = {}): Promise<number> {
  // Emit to a temp dir, diff against checked-in dirs.
  const tmp = await fs.mkdtemp(path.join(tmpdir(), "massa-ai-gen-"));
  try {
    const tmpDirs: Record<Host, string> = {
      claude: path.join(tmp, "claude"),
      codex: path.join(tmp, "codex"),
      cursor: path.join(tmp, "cursor"),
      opencode: path.join(tmp, "opencode"),
    };
    await emitAll(tmpDirs, opts);
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
  const opts: EmitOptions = { profileFlag: profileFlagFrom(args) };
  const check = args.includes("--check");
  if (check) {
    return runCheck(opts);
  }
  const profiles = await emitAll(HOST_DIRS, opts);
  const hostCount = Object.keys(HOST_DIRS).length;
  const total = SPECIALIST_NAMES.length * hostCount;
  console.log(
    `Emitted ${total} agent files (${SPECIALIST_NAMES.length} x ${hostCount} hosts).`
  );
  // Always report the resolved profile per host. Silence here would make a
  // --profile typo or a stray MASSA_AI_MODEL_PROFILE indistinguishable from a
  // normal run, and the whole point of the registry is that model choice is legible.
  for (const [host, profile] of Object.entries(profiles)) {
    console.log(`  ${host.padEnd(9)} profile: ${profile}`);
  }
  return 0;
}

if (import.meta.main) {
  const code = await main();
  if (code !== 0) {
    process.exit(code);
  }
}