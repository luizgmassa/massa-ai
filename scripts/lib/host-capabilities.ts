/**
 * Per-host capability table (XP-06 / TASK-XP-009).
 *
 * The single explicit declaration of what differs between the 4 hosts the
 * subagent/skill generators emit for. Some fields are mechanically consumed
 * by the generators today (T10/T11); the rest are documentation-bearing —
 * consumed by `docs/adding-a-host.md` (T13) and exercised by the fixture-host
 * discrimination test (T12) so the table stays load-bearing rather than
 * decorative.
 *
 * `HOSTS`/`Host` are re-exported from `scripts/lib/model-profiles.ts` — the
 * one array-first, canonical enumeration (design.md C5) — never duplicated
 * here.
 *
 * SPEC_DEVIATION (accepted, T9): design.md's `HostCapabilities.ownershipMarker`
 * is typed `"frontmatter" | "body"`. Measured reality (apps/claude-plugin/
 * install.sh:489-494, apps/cursor-plugin/install.sh:433-436) is that Claude
 * and Cursor scope ownership by the `massa-ai-` FILENAME prefix — neither a
 * frontmatter field nor a body marker is written or read for that purpose.
 * Documenting them as "frontmatter" would be inaccurate at exactly the kind
 * of doc-vs-reality gap this feature (XP-08/09) exists to stop introducing.
 * The type below adds `"filename"` as a third value; Codex's top-of-file
 * `# massa-ai-owned` TOML comment (apps/codex-plugin/install.sh:483) is
 * classed `"frontmatter"` (it plays the frontmatter role structurally — a
 * fixed top-of-file position read before any other field) to preserve
 * design's intended two-way contrast against OpenCode's `"body"`, which is
 * forced there by `forwardsUnknownFrontmatter` (see below). No production
 * code depends on this field's exact enum; only docs and the fixture test do.
 */

import { HOSTS, type Host } from "./model-profiles.ts";

export { HOSTS, type Host };

export interface HostCapabilities {
  /** File extension the generator writes for this host's agent files. */
  artifactExtension: "md" | "toml";
  /** How the host derives an agent's displayed identity/name. */
  agentIdentity: "frontmatter-name" | "filename";
  /**
   * Where the "this file is massa-ai-generated" ownership signal lives, so
   * `agents uninstall` (or the equivalent per-host script) can scope itself
   * to owned files without touching a user's own agents.
   * See the SPEC_DEVIATION note above for `"filename"`.
   */
  ownershipMarker: "frontmatter" | "body" | "filename";
  /**
   * WHY `ownershipMarker` is forced to `"body"` for a host: true means the
   * host forwards unrecognized frontmatter keys to the model provider as
   * model options, so a marker key placed in frontmatter would leak as a
   * bogus provider option instead of being ignored.
   */
  forwardsUnknownFrontmatter: boolean;
  /**
   * How the shared hook binary (apps/claude-plugin/hooks/massa-ai-hook.ts)
   * reaches this host's plugin bundle: `"source"` = this host IS the source
   * file; `"real-copy"` = a real, chmod'd file copy (never a symlink — `npm
   * pack` drops symlink entries); `"none"` = no hook binary at all (in-process
   * handlers).
   */
  hookBinaryDelivery: "source" | "real-copy" | "none";
  /** Extra directories (beyond skills/{massa-ai,persona-router,agents}) this
   *  host's skill bundle manages, relative to the plugin root. */
  extraManagedRoots: readonly string[];
  /**
   * Whether a `SessionStart` hook's stdout is actually delivered into the
   * model's context on this host (the ai-memory evidence: Kimi Code and Grok
   * Build CLI both silently discard SessionStart stdout, which is why their
   * handoff injection had to move to UserPromptSubmit instead). `null` means
   * unverified for this host — this repo does not currently rely on the
   * behavior either way for that host, so no measurement was ever forced.
   */
  sessionStartStdoutDelivered: boolean | null;
  /**
   * Which hook event actually carries the persona-router / AGENTS.md startup
   * contract into the model's context for this host, per
   * skills/massa-ai/personas/README.md's "Automatic Routing" section. `null`
   * means neither — the contract is delivered through a managed instruction
   * file installed once, not through a session-lifecycle hook at all.
   */
  handoffInjectionPoint: "session-start" | "user-prompt-submit" | null;
  /**
   * How this host gates which tools — including MCP tools inherited from the
   * parent session — a dispatched sub-agent can call. Documentation-bearing
   * only (STI-15 / TASK-007): no emitter reads this field, and it drives no
   * generation decision. The fix lives entirely in
   * `scripts/generate-subagent-artifacts.ts`'s `claudeToolPolicyFor`, because
   * Claude was the only host with an inheritance defect.
   *
   * Claude is `"denylist"` because its generator emitted a `tools:`
   * ALLOWLIST, and Claude's own docs state an allowlisted subagent "can't
   * edit files, write files, or use any MCP tools" — omission excludes MCP by
   * construction. The fix moved ordinary charters to `disallowedTools`, which
   * Claude documents as leaving MCP intact: "The subagent keeps Bash, MCP
   * tools, and the rest of its pool." The other three hosts never had an
   * allowlist to maintain: each already inherits every tool, MCP included,
   * through a mechanism that is not a tool gate at all — see each host's
   * per-value citation below and
   * `.specs/features/subagent-tool-inheritance/spec.md` § Evidence for the
   * full verbatim citations this field condenses.
   */
  toolGating: "denylist" | "none" | "sandbox" | "permission-map";
}

/**
 * Frozen, hand-authored, one entry per host. See each field's docblock above
 * for what it means; per-value justification lives inline below, citing the
 * measured source.
 */
const RAW_CAPABILITIES: Record<Host, HostCapabilities> = {
  claude: {
    artifactExtension: "md",
    // https://code.claude.com/docs/en/sub-agents.md — documented `name:` field.
    agentIdentity: "frontmatter-name",
    // apps/claude-plugin/install.sh:489-494 — uninstall globs `agents/massa-ai-*.md`.
    ownershipMarker: "filename",
    forwardsUnknownFrontmatter: false,
    // apps/claude-plugin/hooks/massa-ai-hook.ts IS the canonical source file.
    hookBinaryDelivery: "source",
    extraManagedRoots: [],
    // Not relied upon: this repo delivers the startup contract to Claude via
    // a managed instruction file, not a SessionStart hook (see
    // handoffInjectionPoint), so the behavior was never forced to be measured.
    sessionStartStdoutDelivered: null,
    // skills/massa-ai/personas/README.md "Automatic Routing": "Claude Code and
    // OpenCode receive it through their managed instruction files."
    handoffInjectionPoint: null,
    // Claude docs, `tools` field: "Inherits every tool available to subagents
    // if omitted." Allowlist example: "The subagent can't edit files, write
    // files, or use any MCP tools." `disallowedTools` example: "The subagent
    // keeps Bash, MCP tools, and the rest of its pool." — the only host that
    // needed a fix (spec.md § Evidence, Claude row).
    toolGating: "denylist",
  },
  codex: {
    artifactExtension: "toml",
    // https://learn.chatgpt.com/docs/agent-configuration/subagents — `name = "..."`.
    agentIdentity: "frontmatter-name",
    // apps/codex-plugin/install.sh:478-489 — uninstall matches the literal
    // "# massa-ai-owned" first line of each TOML file (CDX-07).
    ownershipMarker: "frontmatter",
    forwardsUnknownFrontmatter: false,
    // HOOK_BINARY_HOSTS in generate-skill-artifacts.ts: real chmod'd copy.
    hookBinaryDelivery: "real-copy",
    extraManagedRoots: [],
    // skills/massa-ai/personas/README.md: "Codex and Cursor receive this
    // contract through SessionStart context" — proven working, unlike the
    // Kimi/Grok discard case the ai-memory evidence documents.
    sessionStartStdoutDelivered: true,
    handoffInjectionPoint: "session-start",
    // Codex docs (per spec.md § Evidence): "session settings, such as
    // sandbox_mode, mcp_servers, and skills... inherit from the parent when
    // the custom agent file omits them." No `tools` key exists at any layer;
    // the permission mechanism is `sandbox_mode`, not a tool gate.
    toolGating: "sandbox",
  },
  cursor: {
    artifactExtension: "md",
    // https://cursor.com/docs/subagents.md — documented `name:` field.
    agentIdentity: "frontmatter-name",
    // apps/cursor-plugin/install.sh:433-436 — agents copied/removed by the
    // massa-ai- filename prefix (CRS-04), same mechanism as Claude.
    ownershipMarker: "filename",
    forwardsUnknownFrontmatter: false,
    hookBinaryDelivery: "real-copy",
    extraManagedRoots: [],
    // Same README citation as codex.
    sessionStartStdoutDelivered: true,
    handoffInjectionPoint: "session-start",
    // Cursor docs, "Can I use MCP tools in subagents?": "Yes. Subagents
    // inherit all tools from the parent, including MCP tools from configured
    // servers." No allowlist exists at all; the separate permission
    // mechanism is `readonly: true`, not a tool gate.
    toolGating: "none",
  },
  opencode: {
    artifactExtension: "md",
    // emitOpenCode's own docblock: "The markdown file name becomes the agent
    // name" — OpenCode has no `name` frontmatter key at all.
    agentIdentity: "filename",
    // The marker MOVES to the first body line (OPENCODE_OWNED_MARKER) because
    // frontmatter forwarding would leak it as a bogus provider model option.
    ownershipMarker: "body",
    // https://opencode.ai/docs/agents/: "Any other options you specify in
    // your agent configuration will be passed through directly to the
    // provider as model options."
    forwardsUnknownFrontmatter: true,
    // No shared hook binary — OpenCode uses in-process handlers (src/index.ts).
    hookBinaryDelivery: "none",
    // managedRootsFor's opencode branch: the vendored opencode-config.cjs
    // copy, plus the generated workflow-command directory (T2/WFC-02) — a
    // wholly-generated root with no hand-authored siblings on this host, so
    // it rides the plain directory-root prune/check machinery instead of
    // the marker-scoped mechanism the three shared-directory hosts need.
    extraManagedRoots: ["lib", "command"],
    sessionStartStdoutDelivered: null,
    // Same README citation as claude.
    handoffInjectionPoint: null,
    // OpenCode docs (per spec.md § Evidence): `tools` is deprecated in favour
    // of the `permission` map; patterns are "matched as wildcard patterns
    // against the underlying tool name, so the same syntax works for
    // built-ins, custom tools, and MCP tools" — e.g. `"mymcp_*": "deny"`
    // denies every tool from an MCP server. The emitter writes only `edit`
    // and `bash` keys, so no MCP pattern is denied.
    toolGating: "permission-map",
  },
};

/** Deep-frozen so `capabilitiesFor` really is a read-only export (7-step Step 4). */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

export const HOST_CAPABILITIES: Readonly<Record<Host, HostCapabilities>> = deepFreeze(RAW_CAPABILITIES);

/** Read-only accessor — the table itself is already frozen, this is the
 *  documented entry point generators/docs/tests are expected to use. */
export function capabilitiesFor(host: Host): HostCapabilities {
  return HOST_CAPABILITIES[host];
}
