#!/usr/bin/env bun
/**
 * massa-ai subagent-artifacts generator (single source of truth).
 *
 * Reads every charter under skills/agents/ and emits per-host agent files into
 * apps/{claude,codex,cursor,opencode}-plugin/agents/. Outputs are checked into
 * git so the plugins ship without a runtime build step.
 *
 *   bun run scripts/generate-subagent-artifacts.ts        # emit 72 files (18 x 4 hosts)
 *   bun run scripts/generate-subagent-artifacts.ts --check # drift gate: diff vs checked-in
 *
 * Model + effort + permission are PINNED per host (spec, NOT advisory). A parity
 * test (T4) re-runs --check so charter-to-shipped drift fails CI.
 */

import { promises as fs } from "fs";
import path from "path";
import { tmpdir, homedir } from "os";
import {
  hostsSupportedBy,
  loadRegistry,
  loadEffectiveRegistry,
  profileFlagFrom,
  resolveAgent,
  selectProfile,
  type Registry,
  type Resolved,
} from "./lib/model-profiles.ts";
import { HOSTS, capabilitiesFor, type Host } from "./lib/host-capabilities.ts";
export { HOSTS, type Host };
// agent-runtime-drift T02: one parser, two consumers — the generator (writer)
// and the profile-switch doctor (reader). A second parser here would let the
// writer and the reader disagree about what `model:` means.
import { parseFrontmatter } from "../packages/shared/src/profile-switch/frontmatter.ts";
// agent-drift followup T1: the actives' profile rank-3 source — the SAME
// state file (and the same default path resolution) the switch engine reads,
// so generator and engine cannot disagree about what "active" means.
import { readInstallState } from "../packages/shared/src/profile-switch/state.ts";
import type { InstallState } from "../packages/shared/src/profile-switch/state.ts";

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

// Per-host plugin bundle root (parent of both `agents/` and `agent-profiles/`).
// design.md Component 1: variant dirs are a SIBLING of `agents/`, at the bundle
// top level — never nested inside it (A5).
const PLUGIN_ROOT_DIRS: Record<Host, string> = {
  claude: path.join(APPS_DIR, "claude-plugin"),
  codex: path.join(APPS_DIR, "codex-plugin"),
  cursor: path.join(APPS_DIR, "cursor-plugin"),
  opencode: path.join(APPS_DIR, "opencode-plugin"),
};
export { PLUGIN_ROOT_DIRS };

/** Directory name variant trees live under, sibling of `agents/` (A5). */
export const AGENT_PROFILES_DIRNAME = "agent-profiles";

/** Full path to a given (host, profile) variant directory. */
export function variantDir(
  host: Host,
  profile: string,
  pluginRootDirs: Record<Host, string> = PLUGIN_ROOT_DIRS,
): string {
  return path.join(pluginRootDirs[host], AGENT_PROFILES_DIRNAME, profile);
}

/** Registry profile names that support a given host, in registry-declared order
 *  (built on `hostsSupportedBy`, never a re-derivation of its membership rule). */
export function profilesSupporting(registry: Registry, host: Host): string[] {
  return Object.keys(registry.profiles).filter((p) => hostsSupportedBy(registry, p).includes(host));
}

// ── Charter registry (every charter under skills/agents/) ───────────────────
/** A charter name is just its directory name under `skills/agents/` — no compile-time
 *  enumeration, so adding an agent is a new charter directory, nothing here. */
export type SpecialistName = string;

// ── Write-permission set (spec AC CLA-03 / design.md) ───────────────────────
// These five charters declare `permission: write` (test-engineer,
// documentation-agent, judge, and designer are scoped writers: test files /
// doc files / the agent's own judge-N report / UI-layer files only, each with
// a disjoint write set). Charter frontmatter and this set must agree —
// scripts/__tests__/skills-harness-integrity.test.ts enforces that.
const WRITE_AGENTS: ReadonlySet<SpecialistName> = new Set<SpecialistName>([
  "builder",
  "test-engineer",
  "documentation-agent",
  "judge",
  "designer",
]);

// ── Model + effort resolution ───────────────────────────────────────────────
// The three hard-coded per-host model tables that used to live here are gone.
// Every model and effort value now comes from `skills/model-profiles.json`,
// resolved per (host, profile, agent) via `resolveAgent` — override-first, falling
// back to the profile's host default. See .specs/features/model-catalog-revamp/spec.md.
//
// The emitters below own only HOST SYNTAX: which key name a host uses, and how it
// spells "inherit". They never know what a profile is.

// ── Permission -> tool-gating mapping (STI-01/STI-02) ────────────────────────
// Navigator precedent (apps/claude-plugin/agents/massa-ai-navigator.md) uses
// JSON-array tools with capital "Glob"; match that convention for the one
// remaining allowlisted agent.

// Charters whose tool set is not the default inherit/denylist policy. The
// navigator is index-first: it reaches the massa-ai MCP surface and needs
// only `pwd` from the shell (charter metadata.tools: mcp-index). This is the
// only entry point that can still narrow a Claude sub-agent to an allowlist —
// every other charter is gated by claudeToolPolicyFor below.
const AGENT_TOOLS_OVERRIDE: Partial<Record<SpecialistName, readonly string[]>> = {
  navigator: ["mcp__massa-ai__*", "Read", "Grep", "Glob", "Bash(pwd)"],
};

// The three write-capable built-ins in Claude's documented sub-agent pool
// (design.md Tech Decisions "Denylist contents"). `Bash` is excluded because it
// was already granted to read-only agents under the old allowlist — this change
// does not narrow it further.
const READ_ONLY_DISALLOWED = ["Write", "Edit", "NotebookEdit"];

export type ClaudeToolPolicy =
  | { readonly kind: "allowlist"; readonly tools: readonly string[] }
  | { readonly kind: "denylist"; readonly disallowed: readonly string[] }
  | { readonly kind: "inherit" };

/**
 * Decides which of Claude's two tool-gating mechanisms a charter uses
 * (STI-01/STI-02). An `AGENT_TOOLS_OVERRIDE` entry keeps the deliberate narrow
 * allowlist (navigator). A `WRITE_AGENTS` member inherits every tool the
 * parent session has active, including MCP — Claude documents no cross-server
 * MCP wildcard for `tools`, so an allowlist can never be dynamic, and
 * `disallowedTools` (not `tools`) is the only mechanism that inherits.
 * Everything else — including a future charter whose frontmatter permission
 * value is unrecognized, which `loadCharter` already coerces to `read-only` —
 * gets the read-only denylist: fail safe, not fail open (STI-01.6). Gating on
 * `WRITE_AGENTS` rather than `Charter.permission` keeps this consistent with
 * `emitCursor`/`emitCodex`/`emitOpenCode`, which already gate on that set.
 */
export function claudeToolPolicyFor(name: SpecialistName): ClaudeToolPolicy {
  const override = AGENT_TOOLS_OVERRIDE[name];
  if (override) return { kind: "allowlist", tools: override };
  if (WRITE_AGENTS.has(name)) return { kind: "inherit" };
  return { kind: "denylist", disallowed: READ_ONLY_DISALLOWED };
}

// OpenCode bash permission (spec OPC-07 / design.md plan-critic F4).
// Default: write agents -> bash: allow; planner -> bash: { "*": "ask" };
// every other read-only agent -> bash: deny. Overrides narrow that further.
const OPENCODE_BASH_OVERRIDE: Partial<Record<SpecialistName, string>> = {
  planner: `{ "*": "ask" }`,
  navigator: `{ "pwd": "allow", "*": "deny" }`,
};

// ── Types ───────────────────────────────────────────────────────────────────
// Host is imported from ./lib/host-capabilities.ts (re-exported from
// lib/model-profiles.ts) — the single canonical enumeration (design.md C5).
export type Permission = "read-only" | "write";

export interface Charter {
  name: SpecialistName;
  description: string;
  permission: Permission;
  body: string;
}

// ── Charter loader ──────────────────────────────────────────────────────────
/** Where charters live. A parameter only so the throws below can be tested against the
 *  real loader instead of a re-implementation of it — production always uses the default. */
export const CHARTERS_DIR = path.join(SKILLS_DIR, "agents");

/**
 * Charter directory names under `skills/agents/`, sorted — the inventory this generator
 * emits, replacing the old hand-maintained `SPECIALIST_NAMES` list. Mirrors the directory
 * scan `generate-skill-artifacts.ts:155-166` already does: a dir with no `SKILL.md` is
 * skipped rather than treated as a charter.
 */
export async function scanCharterNames(chartersDir: string = CHARTERS_DIR): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(chartersDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const dirNames = entries
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const out: string[] = [];
  for (const name of dirNames) {
    try {
      await fs.access(path.join(chartersDir, name, "SKILL.md"));
      out.push(name);
    } catch {
      // agent dir with no charter is not this generator's problem
    }
  }
  return out;
}

export async function loadCharter(
  name: SpecialistName,
  chartersDir: string = CHARTERS_DIR
): Promise<Charter> {
  const file = path.join(chartersDir, name, "SKILL.md");
  const raw = await fs.readFile(file, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const metadata = (frontmatter.metadata ?? {}) as Record<string, unknown>;
  const permissionRaw = String(metadata.permission ?? "read-only");
  const permission: Permission =
    permissionRaw === "write" ? "write" : "read-only";
  const description = String(frontmatter.description ?? "");
  if (!description) {
    throw new Error(`charter ${name} missing description`);
  }
  // A charter must not name a model. That is the drift this registry removes: the old
  // `metadata.model_hint` was a literal model name that Cursor consumed verbatim, and it
  // could disagree with the generator's own resolution. Fail loudly if one reappears.
  if (metadata.model_hint !== undefined) {
    throw new Error(
      `charter ${name} still declares metadata.model_hint. Models are resolved per ` +
        `(host, profile, agent) — see skills/model-profiles.json.`
    );
  }
  return { name, description, permission, body };
}

export async function loadAllCharters(chartersDir: string = CHARTERS_DIR): Promise<Charter[]> {
  const names = await scanCharterNames(chartersDir);
  const charters: Charter[] = [];
  for (const name of names) {
    charters.push(await loadCharter(name, chartersDir));
  }
  return charters;
}

// ── Per-host emitters ───────────────────────────────────────────────────────

/**
 * Claude Code. Documented plugin-agent fields include name, description, model, effort,
 * tools, disallowedTools. `model` accepts an alias, a full id, or `inherit` (which is also
 * the default).
 * https://code.claude.com/docs/en/sub-agents.md
 *
 * CLA-04: omit hooks/mcpServers/permissionMode — rejected on plugin-shipped agents.
 *
 * STI-01/STI-02: the gating key is decided by claudeToolPolicyFor and stays in the slot
 * `tools` used to occupy — allowlist emits `tools:` (JSON array, unchanged for navigator),
 * denylist emits `disallowedTools:` (comma-separated, the form Claude's own docs use for
 * that field), and inherit emits neither key so the sub-agent gets every tool the parent
 * session has active, including any MCP server.
 */
export function emitClaude(c: Charter, m: Resolved): string {
  const agentName = `massa-ai-${c.name}`;
  const policy = claudeToolPolicyFor(c.name);
  const lines = ["---", `name: ${agentName}`, `description: ${c.description}`];
  if (policy.kind === "allowlist") {
    lines.push(`tools: ${JSON.stringify(policy.tools)}`);
  } else if (policy.kind === "denylist") {
    lines.push(`disallowedTools: ${policy.disallowed.join(", ")}`);
  }
  lines.push(`model: ${m.model ?? "inherit"}`);
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
  /** `--profile=<name>`. Overrides the env var, the recorded state profile, and each host's default. */
  readonly profileFlag?: string | null;
  /** Injected for tests; defaults to process.env. */
  readonly env?: Record<string, string | undefined>;
  /**
   * Per-host recorded active profile from `install-state.json`
   * (`platforms.<host>.modelProfile.profile`) — rank 3 of the selection
   * precedence (agent-drift followup T1). `main()` threads it so a
   * regeneration re-emits the ACTIVES for the profile the operator switched
   * to, instead of silently resetting them to `"balanced"`
   * (measured 2026-09-21: a post-switch regenerate re-emitted claude actives
   * from `balanced` while the state said `work`; the session-start drift
   * hook caught the divergence). Absent for a host → that host falls through
   * to `"balanced"`, exactly as before.
   */
  readonly stateProfiles?: Partial<Record<Host, string>>;
  /**
   * Dedup set for `warnStaleAgentOverrides`. A
   * real run's `main()` calls both `emitAll` and `emitVariants` against the same registry,
   * so a per-entry warn would print twice without a Set shared across both calls. Defaults
   * to a fresh, call-local `Set` when omitted — safe for a single isolated call, but a
   * caller invoking more than one emit function against the same registry in one run MUST
   * create the `Set` once and pass it to every call.
   */
  readonly warnedStaleAgents?: Set<string>;
}

type EmitFn = (c: Charter, m: Resolved) => string;

/** Per-host body-rendering dispatch. Byte-identity-constrained: string
 *  rendering itself stays per-host (design.md C5 "Not moved"), only the
 *  SELECTION of which renderer to call is now table-shaped rather than a
 *  nested ternary. */
const EMIT_BY_HOST: Record<Host, EmitFn> = {
  claude: emitClaude,
  codex: emitCodex,
  cursor: emitCursor,
  opencode: emitOpenCode,
};

/**
 * agent-drift followup T1: the rank-3 selection source, extracted from
 * `main()` so the state → profiles mapping is unit-testable without touching
 * a real home. Pure projection of the switch engine's own state shape —
 * a host with no recorded `modelProfile` contributes nothing and falls
 * through to `"balanced"` downstream.
 */
export function stateProfilesFromInstallState(state: InstallState): Partial<Record<Host, string>> {
  const out: Partial<Record<Host, string>> = {};
  for (const host of HOSTS) {
    const recorded = state.platforms[host]?.modelProfile?.profile;
    if (recorded) out[host] = recorded;
  }
  return out;
}

/**
 * A recorded rank-3 profile that no longer exists in the registry (removed,
 * renamed) or no longer supports this host degrades to "no recorded profile"
 * instead of throwing — mirroring the tolerant fallback each installer's own
 * `recorded_profile()` re-apply step already gives an unknown variant
 * directory. `--profile`/env stay hard errors (an operator's typo right now
 * should fail loud); only the state-sourced value is stale-tolerant, since it
 * reflects a historical switch this run did not request.
 */
function validStateProfile(registry: Registry, host: Host, profile: string | null | undefined): string | null {
  if (!profile) return null;
  const entry = registry.profiles[profile];
  if (!entry || !(host in entry.hosts)) return null;
  return profile;
}

/** Which profile each host resolves against, after the full precedence chain. */
export function profilesPerHost(
  registry: Registry,
  opts: EmitOptions = {},
  hosts: readonly Host[] = HOSTS
): Record<Host, string> {
  const out = {} as Record<Host, string>;
  for (const host of hosts) {
    out[host] = selectProfile(registry, host, {
      flag: opts.profileFlag ?? null,
      env: opts.env,
      stateProfile: validStateProfile(registry, host, opts.stateProfiles?.[host] ?? null),
    });
  }
  return out;
}

/** Emits the full charter set for one (host, profile) pair into `dir`. Shared by
 *  `emitAll` (active `agents/`, selected profile) and `emitVariants` (every
 *  supported profile, `agent-profiles/<profile>/`) so the two never drift apart —
 *  it is the reason active `agents/` byte-equals `agent-profiles/<default>/`
 *  (MPS-01 AC5). */
async function emitHostProfile(
  host: Host,
  profile: string,
  dir: string,
  charters: readonly Charter[],
  registry: Registry
): Promise<void> {
  // Prune-before-emit (UGB-04, T2): remove this directory's prior contents
  // before repopulating it, so a file left behind by a renamed or removed
  // charter does not survive regeneration once git stops tracking deletions.
  // Shared by both callers (emitAll's active `agents/`, emitVariants'
  // `agent-profiles/<profile>/`), so the two can never prune inconsistently.
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const emit = EMIT_BY_HOST[host];
  for (const c of charters) {
    // Resolution is override-first: `profile.agents[c.name][host]` wins over
    // `profile.hosts[host]` when present (registry v2 shape, `resolveAgent`). A profile
    // that does not support this host still throws by design.
    const resolved = resolveAgent(registry, host, profile, c.name);
    const ext = capabilitiesFor(host).artifactExtension;
    const fileName = `massa-ai-${c.name}.${ext}`;
    const filePath = path.join(dir, fileName);
    const content = emit(c, resolved);
    await fs.writeFile(filePath, content, "utf8");
  }
}

/**
 * `hosts` is an APPENDED third parameter (default `HOSTS`) — every existing
 * 2-arg call site (2 production + 6 in generate-subagent-artifacts.test.ts)
 * keeps working unmodified. It exists so a fixture-host test can restrict or
 * extend which hosts get iterated without touching the production 4-host set
 * (XP-06 AC-2 / T12).
 */
export async function emitAll(
  targetDirs: Record<Host, string>,
  opts: EmitOptions = {},
  hosts: readonly Host[] = HOSTS
): Promise<Record<Host, string>> {
  const charters = await loadAllCharters();
  const registry = opts.registry ?? loadRegistry();
  warnStaleAgentOverrides(registry, charters, opts.warnedStaleAgents ?? new Set());
  const profiles = profilesPerHost(registry, opts, hosts);
  for (const host of hosts) {
    await emitHostProfile(host, profiles[host], targetDirs[host], charters, registry);
  }
  return profiles;
}

export interface EmitVariantsOptions {
  /** Pre-loaded registry; loaded from disk when omitted. */
  readonly registry?: Registry;
  /** See `EmitOptions.warnedStaleAgents` — the same dedup Set, threaded here so a real run
   *  (`main()`, calling both `emitAll` and `emitVariants`) warns each stale name once. */
  readonly warnedStaleAgents?: Set<string>;
}

/**
 * A profile's `agents` map is opt-in USER-OVERLAY data that names agents by bare string —
 * this lib deliberately does not check agent-name existence at the registry-validation layer
 * (`scripts/lib/model-profiles.ts` knows nothing about which agents exist, see its file
 * header). This generator DOES know the charter set, so it is the layer that warns: a
 * deleted-charter agent name left behind in a profile's overrides must not brick
 * regeneration, but it must not be silent either.
 *
 * `warned` is caller-supplied and threaded through `EmitOptions`/`EmitVariantsOptions` so a
 * real run — `main()` calls both `emitAll` and `emitVariants` against the same registry —
 * prints each stale name exactly once total, not once per caller. The shipped built-in
 * carries no stale override, so `--check`'s normal-path output never gains a warn line it
 * did not have before.
 */
export function warnStaleAgentOverrides(
  registry: Registry,
  charters: readonly Charter[],
  warned: Set<string>
): void {
  const charterNames = new Set(charters.map((c) => c.name));
  const stale = new Set<string>();
  for (const profile of Object.values(registry.profiles)) {
    for (const agentName of Object.keys(profile.agents ?? {})) {
      if (!charterNames.has(agentName)) stale.add(agentName);
    }
  }
  for (const agentName of stale) {
    if (warned.has(agentName)) continue;
    warned.add(agentName);
    console.warn(`[massa-ai] a profile's agents override names unknown agent "${agentName}" — ignored`);
  }
}

/**
 * design.md Component 1 — for each host, for each registry profile supporting
 * that host (`profilesSupporting`, registry-declared order), emit the full
 * charter set into `pluginRootDirs[host]/agent-profiles/<profile>/`. A profile
 * that does not support a host gets no directory for that host at all — the
 * switch engine (packages/shared/src/profile-switch/) reads that absence as
 * "unsupported by profile" (MPS-01 AC3), so this function must never create an
 * empty placeholder for an unsupported (host, profile) pair.
 *
 * Returns the per-host list of profile names emitted, for callers/tests that
 * want to assert the shape without re-deriving it.
 */
export async function emitVariants(
  pluginRootDirs: Record<Host, string> = PLUGIN_ROOT_DIRS,
  opts: EmitVariantsOptions = {},
  hosts: readonly Host[] = HOSTS
): Promise<Record<Host, string[]>> {
  const charters = await loadAllCharters();
  const registry = opts.registry ?? loadRegistry();
  warnStaleAgentOverrides(registry, charters, opts.warnedStaleAgents ?? new Set());
  const out = {} as Record<Host, string[]>;
  for (const host of hosts) {
    const profiles = profilesSupporting(registry, host);
    out[host] = profiles;

    // Prune-before-emit (UGB-04, T2): a whole variant directory for a
    // profile no longer supported by this host — dropped from the registry,
    // or one that lost this host's support — must not survive regeneration.
    // Reuses staleVariantDirs(), the same detector `--check` already calls,
    // rather than re-deriving "which directories are stale".
    const stale = await staleVariantDirs(pluginRootDirs[host], profiles);
    for (const staleName of stale) {
      await fs.rm(path.join(pluginRootDirs[host], AGENT_PROFILES_DIRNAME, staleName), {
        recursive: true,
        force: true,
      });
    }

    for (const profile of profiles) {
      const dir = variantDir(host, profile, pluginRootDirs);
      await emitHostProfile(host, profile, dir, charters, registry);
    }
  }
  return out;
}

/**
 * Full-inventory diff (T6, MPS-01/MPS-12): lists BOTH directories directly
 * rather than checking a fixed known-name set, so a stray leftover file — one
 * this generator no longer produces for either the active `agents/` dir or a
 * variant `agent-profiles/<profile>/` dir — is caught exactly like a missing
 * or changed file, not just a divergence among the currently-scanned charter names
 * (`scanCharterNames`). Both directories this function is called against
 * (active agent dirs, variant dirs) are flat — no subdirectories — so a
 * single `readdir` per side is the whole inventory; `host` is accepted for
 * call-site symmetry with the rest of this module's per-host API, unused in
 * the diff itself (a directory this function is pointed at never mixes hosts).
 */
export async function diffHost(
  generatedDir: string,
  checkedInDir: string,
  _host: Host
): Promise<string[]> {
  const [genEntries, checkedEntries] = await Promise.all([
    fs.readdir(generatedDir).catch(() => [] as string[]),
    fs.readdir(checkedInDir).catch(() => [] as string[]),
  ]);
  const all = [...new Set([...genEntries, ...checkedEntries])].sort();
  const diffs: string[] = [];
  for (const rel of all) {
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

/**
 * Whole-directory staleness (T6, MPS-01 AC2): checked-in `agent-profiles/`
 * subdirectories under a host's plugin root that are NOT in the host's
 * currently-supported profile list — i.e. a profile that was removed from the
 * registry (or lost this host from a profile it used to support), whose
 * variant directory nonetheless still ships. A per-profile `diffHost` call
 * alone can never catch this: the moment a profile drops out of
 * `profilesSupporting`, the caller simply stops diffing that directory.
 * Returns the stale subdirectory names, sorted; empty when the checked-in
 * `agent-profiles/` root itself does not exist yet.
 */
export async function staleVariantDirs(
  checkedInPluginRoot: string,
  supportedProfiles: readonly string[]
): Promise<string[]> {
  const root = path.join(checkedInPluginRoot, AGENT_PROFILES_DIRNAME);
  const entries = await fs.readdir(root).catch(() => [] as string[]);
  const supported = new Set(supportedProfiles);
  return entries.filter((e) => !supported.has(e)).sort();
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
    // Shared across this function's own emitAll + emitVariants calls so a stale agent
    // override — were the --check builtin ever to carry one — warns once, not twice,
    // mirroring main()'s own threading below.
    const warnedStaleAgents = new Set<string>();
    await emitAll(tmpDirs, { ...opts, warnedStaleAgents });
    let drift = false;
    for (const host of HOSTS) {
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

    // Variant trees (T6, MPS-01 AC2/MPS-12): full-inventory diff of every
    // currently-supported (host, profile) variant dir, PLUS detection of a
    // whole stale variant directory left over after a profile is removed from
    // the registry (design.md: "catches stale entries after a profile
    // removal, not just changed files") — a per-profile diff alone would
    // silently stop looking at a directory the moment its profile is dropped
    // from `profilesSupporting`.
    const registry = opts.registry ?? loadRegistry();
    const tmpPluginDirs: Record<Host, string> = {
      claude: path.join(tmp, "variants", "claude-plugin"),
      codex: path.join(tmp, "variants", "codex-plugin"),
      cursor: path.join(tmp, "variants", "cursor-plugin"),
      opencode: path.join(tmp, "variants", "opencode-plugin"),
    };
    const supportedByHost = await emitVariants(tmpPluginDirs, { registry, warnedStaleAgents });
    for (const host of HOSTS) {
      for (const profile of supportedByHost[host]) {
        const genDir = variantDir(host, profile, tmpPluginDirs);
        const checkedDir = variantDir(host, profile, PLUGIN_ROOT_DIRS);
        const diffs = await diffHost(genDir, checkedDir, host);
        if (diffs.length > 0) {
          drift = true;
          console.error(
            `[${host}/${AGENT_PROFILES_DIRNAME}/${profile}] drift detected (${diffs.length} file(s) differ):`
          );
          for (const d of diffs) {
            console.error(`  ${d}`);
          }
        }
      }

      const stale = await staleVariantDirs(PLUGIN_ROOT_DIRS[host], supportedByHost[host]);
      for (const profileDirName of stale) {
        drift = true;
        console.error(
          `[${host}/${AGENT_PROFILES_DIRNAME}/${profileDirName}] drift detected: stale variant ` +
            `directory (profile no longer supported by ${host})`
        );
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
  // Runtime generation reads the effective registry (builtin + overlay merged)
  // so regenerated variants reflect the operator's overlay. The --check path
  // stays on loadRegistry (builtin alone) so a broken overlay never fails the
  // build gate (REG-13, REG-18 generate-side, T14 F3).
  const effective = loadEffectiveRegistry();
  const registry = effective.registry;
  if (effective.overlayError) {
    console.warn(`Warning: overlay error — ${effective.overlayError} (using builtin)`);
  }
  // Created once and threaded through BOTH calls below — a real run reaches emitAll then
  // emitVariants against this same registry, so a shared Set is what keeps a stale agent
  // override warning exactly once.
  const warnedStaleAgents = new Set<string>();
  // agent-drift followup T1: the recorded active profile (install-state's
  // modelProfile) outranks "balanced" so a regeneration re-emits the ACTIVES
  // for the profile the operator switched to instead of silently resetting
  // them to the default. Absent/unreadable state → empty map, and
  // every host falls through to "balanced" exactly as before (fresh
  // installs and CI keep their behavior). A recorded profile that no longer
  // exists or no longer supports this host is dropped by validStateProfile
  // and also falls through to "balanced" — a stale historical switch must
  // degrade like an unknown variant directory does, not crash the whole
  // regeneration (T8 section 3, test-model-profile-installer-reapply.sh).
  const stateProfiles: Partial<Record<Host, string>> = {};
  try {
    // Same default resolution as the switch engine's defaultStatePath.
    const state = readInstallState(path.join(homedir(), ".config", "massa-ai", "install-state.json"));
    Object.assign(stateProfiles, stateProfilesFromInstallState(state));
  } catch {
    // No state / unreadable state → no rank-3 entries. Deliberately silent:
    // a fresh checkout has no state, and that is the normal path.
  }
  const runtimeOpts: EmitOptions = { ...opts, registry, warnedStaleAgents, stateProfiles };
  const profiles = await emitAll(HOST_DIRS, runtimeOpts);
  const hostCount = Object.keys(HOST_DIRS).length;
  const charterCount = (await scanCharterNames()).length;
  const total = charterCount * hostCount;
  console.log(
    `Emitted ${total} agent files (${charterCount} x ${hostCount} hosts).`
  );
  // Always report the resolved profile per host. Silence here would make a
  // --profile typo or a stray MASSA_AI_MODEL_PROFILE indistinguishable from a
  // normal run, and the whole point of the registry is that model choice is legible.
  for (const [host, profile] of Object.entries(profiles)) {
    const fromState = stateProfiles[host] === profile ? " (from install-state)" : "";
    console.log(`  ${host.padEnd(9)} profile: ${profile}${fromState}`);
  }
  // Variant trees (design.md Component 1, MPS-01): every profile a host supports,
  // pre-rendered under agent-profiles/<profile>/ — independent of --profile/env,
  // which only picks the ACTIVE profile above.
  const variantProfiles = await emitVariants(PLUGIN_ROOT_DIRS, { registry, warnedStaleAgents });
  let variantTotal = 0;
  for (const [host, ps] of Object.entries(variantProfiles)) {
    variantTotal += ps.length * charterCount;
    console.log(`  ${host.padEnd(9)} variants: ${ps.join(", ")}`);
  }
  console.log(`Emitted ${variantTotal} variant agent files.`);
  return 0;
}

if (import.meta.main) {
  const code = await main();
  if (code !== 0) {
    process.exit(code);
  }
}