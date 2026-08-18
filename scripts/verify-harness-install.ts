#!/usr/bin/env bun
/**
 * verify-harness-install.ts — what is actually installed, per host, per artifact.
 *
 * Answers "are MCP, plugins, hooks, skills, commands and subagents installed?"
 * for Claude Code, Cursor, Codex and OpenCode by reading the real destinations
 * each installer writes to — not by trusting install-state.json, which records
 * intent and is exactly what goes stale.
 *
 * Why this exists: install-harness.sh skips a host whose recorded plugin
 * version equals the bundle version. Its self-heal check used to consult ONE
 * sentinel per host (for cursor, `~/.cursor/agents/massa-ai-*.md`), so a host
 * that had agents but had lost its hooks looked fully installed and was
 * skipped forever — measured live on Cursor, 2026-08-17. That probe now checks
 * every class (installer_plugin_sentinel_present in scripts/lib/installer-shared.sh),
 * and this script is the independent reading of the same disk state: it answers
 * "what is installed" rather than "should the installer run", and it is written
 * against the real destinations rather than sharing the probe's code, so the
 * two have to agree by observation instead of by construction.
 *
 *   bun scripts/verify-harness-install.ts
 *   bun scripts/verify-harness-install.ts --home /tmp/scratch-home
 *   bun scripts/verify-harness-install.ts --json
 *
 * Exit 0 when every expected artifact is present, 1 otherwise. "n/a" never
 * fails: it marks a class the host genuinely does not have.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const HOME = args.includes("--home") ? args[args.indexOf("--home") + 1]! : process.env.HOME!;
const AS_JSON = args.includes("--json");

type Status = "ok" | "missing" | "partial" | "n/a";
type Check = { host: string; artifact: string; status: Status; detail: string };

const results: Check[] = [];
const add = (host: string, artifact: string, status: Status, detail: string) =>
  results.push({ host, artifact, status, detail });

/** Files matching `massa-ai-*.<ext>` directly inside dir. */
function ownedFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((f) => f.startsWith("massa-ai-") && f.endsWith(ext));
  } catch {
    return [];
  }
}

function readJson(path: string): any | null {
  if (!existsSync(path)) return null;
  try {
    // tolerate .jsonc line comments and trailing commas (OpenCode allows them)
    const raw = readFileSync(path, "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The three harness skills the generator ships (generate-skill-artifacts.ts). */
const HARNESS_SKILLS = ["massa-ai", "persona-router", "profile"];

function checkSkills(host: string, skillsDir: string) {
  if (!existsSync(skillsDir)) {
    add(host, "skills", "missing", `no ${skillsDir.replace(HOME, "~")}`);
    return;
  }
  const present = HARNESS_SKILLS.filter((s) => existsSync(join(skillsDir, s, "SKILL.md")));
  const missing = HARNESS_SKILLS.filter((s) => !present.includes(s));
  add(
    host,
    "skills",
    missing.length === 0 ? "ok" : present.length ? "partial" : "missing",
    missing.length ? `have ${present.length}/3, missing: ${missing.join(", ")}` : "3/3 harness skills",
  );
}

function checkSubagents(host: string, dir: string, ext: string, expected: number) {
  const files = ownedFiles(dir, ext);
  add(
    host,
    "subagents",
    files.length === 0 ? "missing" : files.length >= expected ? "ok" : "partial",
    files.length ? `${files.length} (expected ${expected}) in ${dir.replace(HOME, "~")}` : `none in ${dir.replace(HOME, "~")}`,
  );
}

// How many specialist charters the repo currently ships, measured not assumed.
let EXPECTED_AGENTS = 18;
try {
  const charters = readdirSync(join(import.meta.dir, "..", "skills", "agents"), {
    withFileTypes: true,
  }).filter((d) => d.isDirectory());
  if (charters.length) EXPECTED_AGENTS = charters.length;
} catch {
  /* running outside a checkout — keep the default */
}

// ── Claude Code ──────────────────────────────────────────────────────────────
{
  const h = "claude";
  const dir = join(HOME, ".claude");

  // MCP definitions live in ~/.claude.json, NOT ~/.claude/settings.json.
  const mcp = readJson(join(HOME, ".claude.json"));
  const server = mcp?.mcpServers?.["massa-ai"];
  add(h, "mcp", server ? "ok" : "missing", server ? `~/.claude.json → ${String(server.command)}` : "no mcpServers['massa-ai'] in ~/.claude.json");

  // Two legitimate routes: marketplace (served in place) or file route.
  const registry = readJson(join(dir, "plugins", "installed_plugins.json"));
  const viaMarketplace = registry ? JSON.stringify(registry).includes("massa-ai@") : false;
  const fileRouteAgents = ownedFiles(join(dir, "agents"), ".md").length > 0;
  add(
    h,
    "plugin",
    viaMarketplace || fileRouteAgents ? "ok" : "missing",
    viaMarketplace ? "marketplace route (installed_plugins.json)" : fileRouteAgents ? "file route" : "neither route detected",
  );

  const installPathEarly: string | undefined =
    registry?.plugins?.["massa-ai@massa-ai"]?.[0]?.installPath;

  // Claude's two routes put hooks in DIFFERENT files, and this check used to
  // read only settings.json. On the marketplace route the installer skips the
  // settings.json merge and strips prior entries on purpose — the bundle's own
  // hooks/hooks.json is what Claude loads. So a correctly-installed marketplace
  // host reported `hooks MISSING`, and worse, the state it called healthy was
  // the double-fire: entries in BOTH files. Route first, then the right file.
  const settings = readJson(join(dir, "settings.json"));
  const inSettings = JSON.stringify(settings?.hooks ?? {}).includes("massa-ai-hook");
  const settingsEvents = settings?.hooks ? Object.keys(settings.hooks).length : 0;

  if (viaMarketplace) {
    const bundleHooks = installPathEarly ? readJson(join(installPathEarly, "hooks", "hooks.json")) : null;
    const bundleEvents = bundleHooks?.hooks ? Object.keys(bundleHooks.hooks) : [];
    const inBundle = JSON.stringify(bundleHooks?.hooks ?? {}).includes("massa-ai-hook");
    // Entries in settings.json TOO are not a bonus — both sources fire, so
    // every lifecycle event is ingested twice. Report it as a problem, because
    // it is one, and because it is invisible from any single file.
    add(
      h,
      "hooks",
      inBundle && inSettings ? "partial" : inBundle ? "ok" : "missing",
      inBundle && inSettings
        ? `DOUBLE-FIRE: ${bundleEvents.length} event(s) in the marketplace bundle AND massa-ai entries in ~/.claude/settings.json — both sources fire. Re-run apps/claude-plugin/install.sh --user to strip the settings.json copy.`
        : inBundle
          ? `${bundleEvents.length} event(s) served by the marketplace bundle (settings.json correctly has none)`
          : "no massa-ai hook entries in the marketplace bundle's hooks/hooks.json",
    );
  } else {
    add(
      h,
      "hooks",
      inSettings ? "ok" : "missing",
      inSettings
        ? `settings.json → ${settingsEvents} event(s)`
        : "no massa-ai hook entries in ~/.claude/settings.json",
    );
  }

  checkSkills(h, join(dir, "skills"));

  // On the marketplace route Claude serves commands and agents IN PLACE from
  // the cached bundle, so they are absent from ~/.claude/{commands,agents} by
  // design. That is not a reason to skip the check — resolve installPath and
  // count them there. Reporting "n/a" here would be an unverified claim of
  // absence, and would pass just as happily if the cache were empty.
  const installPath = installPathEarly;

  if (viaMarketplace && installPath && existsSync(installPath)) {
    const bundleCmds = existsSync(join(installPath, "commands"))
      ? readdirSync(join(installPath, "commands")).filter((f) => f.endsWith(".md")).length
      : 0;
    add(h, "commands", bundleCmds ? "ok" : "missing", `${bundleCmds} in the marketplace bundle`);
    const bundleAgents = ownedFiles(join(installPath, "agents"), ".md").length;
    add(
      h,
      "subagents",
      bundleAgents >= EXPECTED_AGENTS ? "ok" : bundleAgents ? "partial" : "missing",
      `${bundleAgents} (expected ${EXPECTED_AGENTS}) in the marketplace bundle`,
    );
  } else {
    const cmds = ownedFiles(join(dir, "commands"), ".md").length;
    add(h, "commands", cmds ? "ok" : "missing", `${cmds} in ~/.claude/commands`);
    checkSubagents(h, join(dir, "agents"), ".md", EXPECTED_AGENTS);
  }
}

// ── Cursor ───────────────────────────────────────────────────────────────────
{
  const h = "cursor";
  const dir = join(HOME, ".cursor");

  const mcp = readJson(join(dir, "mcp.json"));
  const server = mcp?.mcpServers?.["massa-ai"];
  add(h, "mcp", server ? "ok" : "missing", server ? `~/.cursor/mcp.json → ${String(server.command)}` : "no mcpServers['massa-ai']");

  const plugin = join(dir, "plugins", "local", "massa-ai");
  add(h, "plugin", existsSync(plugin) ? "ok" : "missing", existsSync(plugin) ? "~/.cursor/plugins/local/massa-ai" : "no ~/.cursor/plugins/local/massa-ai");

  // Cursor may take the Claude-bridge route, in which case hooks are delivered
  // from ~/.claude and ~/.cursor/hooks.json is deliberately left empty. Report
  // the route so an empty hooks.json is legible — but do NOT downgrade it to
  // "n/a". Detection only proves ~/.claude lists massa-ai; it is not evidence
  // that Cursor loads anything from it, and on Cursor 3.16.17 the bridge was
  // measured to deliver hooks while delivering neither plugin nor commands.
  // Explaining an absence away is exactly how this gap stayed hidden.
  const claudeReg = readJson(join(HOME, ".claude", "plugins", "installed_plugins.json"));
  const claudeSettings = readJson(join(HOME, ".claude", "settings.json"));
  const listed = Array.isArray(claudeReg?.plugins?.["massa-ai@massa-ai"]) &&
    claudeReg.plugins["massa-ai@massa-ai"].length > 0;
  const notDisabled = claudeSettings?.enabledPlugins?.["massa-ai@massa-ai"] !== false;
  const bridge = listed && notDisabled;

  const hooks = readJson(join(dir, "hooks.json"));
  const evts = hooks?.hooks ? Object.keys(hooks.hooks) : [];
  const ours = JSON.stringify(hooks ?? {}).includes("massa-ai");
  add(
    h,
    "hooks",
    ours ? "ok" : "missing",
    ours
      ? `hooks.json → ${evts.length} event(s)`
      : bridge
        ? "none in ~/.cursor/hooks.json — expected only if this host was installed with --prefer-bridge, which leaves hook wiring to ~/.claude; a default install wires them locally"
        : "no massa-ai entries in ~/.cursor/hooks.json",
  );

  checkSkills(h, join(dir, "skills"));

  // Cursor's generated workflow commands ship as `subdir/SKILL.md` INSIDE the
  // plugin directory (generate-skill-artifacts.ts: cursor -> skills,
  // subdir-skill-md), not as a separate commands/ surface. They exist; they
  // just live somewhere else. Calling the class "n/a" concealed that all of
  // them are missing whenever the plugin directory is.
  const cursorCmdDir = join(plugin, "skills");
  const cursorCmds = existsSync(cursorCmdDir)
    ? readdirSync(cursorCmdDir, { withFileTypes: true }).filter(
        (d) => d.isDirectory() && existsSync(join(cursorCmdDir, d.name, "SKILL.md")),
      ).length
    : 0;
  add(h, "commands", cursorCmds ? "ok" : "missing", `${cursorCmds} workflow skills in ${cursorCmdDir.replace(HOME, "~")}`);

  checkSubagents(h, join(dir, "agents"), ".md", EXPECTED_AGENTS);
}

// ── Codex ────────────────────────────────────────────────────────────────────
{
  const h = "codex";
  const dir = join(HOME, ".codex");

  const toml = existsSync(join(dir, "config.toml")) ? readFileSync(join(dir, "config.toml"), "utf8") : "";
  const hasMcp = /\[mcp_servers\.["']?massa-ai["']?\]/.test(toml);
  add(h, "mcp", hasMcp ? "ok" : "missing", hasMcp ? "~/.codex/config.toml → [mcp_servers.massa-ai]" : "no [mcp_servers.massa-ai] in ~/.codex/config.toml");

  const plugin = join(dir, "plugins", "massa-ai");
  add(h, "plugin", existsSync(plugin) ? "ok" : "missing", existsSync(plugin) ? "~/.codex/plugins/massa-ai" : "no ~/.codex/plugins/massa-ai");

  const hooks = readJson(join(dir, "hooks.json"));
  const ours = JSON.stringify(hooks ?? {}).includes("massa-ai");
  add(h, "hooks", ours ? "ok" : "missing", ours ? `hooks.json → ${Object.keys(hooks?.hooks ?? {}).length} event(s)` : "no massa-ai entries in ~/.codex/hooks.json");

  checkSkills(h, join(dir, "skills"));

  // Codex's generated workflow commands ship as flat `.md` INSIDE the plugin
  // directory (generate-skill-artifacts.ts: codex -> skills, flat-md), not in
  // ~/.codex/skills/. Looking in the wrong place and reporting "n/a" made a
  // fully-installed host read as one without the surface at all.
  const codexCmdDir = join(plugin, "skills");
  const codexCmds = existsSync(codexCmdDir)
    ? readdirSync(codexCmdDir).filter((f) => f.endsWith(".md")).length
    : 0;
  add(h, "commands", codexCmds ? "ok" : "missing", `${codexCmds} workflow commands in ${codexCmdDir.replace(HOME, "~")}`);

  checkSubagents(h, join(dir, "agents"), ".toml", EXPECTED_AGENTS);
}

// ── OpenCode ─────────────────────────────────────────────────────────────────
{
  const h = "opencode";
  const dir = join(HOME, ".config", "opencode");

  const cfg = readJson(join(dir, "opencode.json")) ?? readJson(join(dir, "opencode.jsonc"));
  const server = cfg?.mcp?.["massa-ai"];
  add(h, "mcp", server ? "ok" : "missing", server ? `opencode.json → ${JSON.stringify(server.command)}` : "no mcp['massa-ai'] in opencode.json(c)");

  const pluginJs = join(dir, "plugins", "massa-ai", "index.js");
  const isReal = existsSync(pluginJs) && !statSync(pluginJs, { throwIfNoEntry: false })?.isSymbolicLink();
  add(h, "plugin", existsSync(pluginJs) ? "ok" : "missing", existsSync(pluginJs) ? `plugins/massa-ai/index.js${isReal ? "" : " (symlink)"}` : "no plugins/massa-ai/index.js");

  // AD-017: OpenCode hooks are in-process handlers inside the plugin, not a file.
  add(
    h,
    "hooks",
    existsSync(pluginJs) ? "ok" : "missing",
    existsSync(pluginJs) ? "in-process handlers inside the plugin (no hooks file by design)" : "plugin absent, so no hook handlers",
  );

  checkSkills(h, join(dir, "skills"));

  const cmds = ownedFiles(join(dir, "command"), ".md").length;
  add(h, "commands", cmds ? "ok" : "missing", `${cmds} in ~/.config/opencode/command`);

  checkSubagents(h, join(dir, "agents"), ".md", EXPECTED_AGENTS);
}

// ── Report ───────────────────────────────────────────────────────────────────
if (AS_JSON) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const HOSTS = ["claude", "cursor", "codex", "opencode"];
  const ARTIFACTS = ["mcp", "plugin", "hooks", "skills", "commands", "subagents"];
  const mark = (s: Status) => (s === "ok" ? "  ok  " : s === "n/a" ? " n/a  " : s === "partial" ? "PARTIAL" : "MISSING");

  console.log(`\nmassa-ai harness install — HOME=${HOME}\n`);
  console.log(`${"artifact".padEnd(11)}${HOSTS.map((h) => h.padEnd(10)).join("")}`);
  console.log("-".repeat(11 + HOSTS.length * 10));
  for (const a of ARTIFACTS) {
    const row = HOSTS.map((h) => {
      const r = results.find((x) => x.host === h && x.artifact === a);
      return (r ? mark(r.status) : "  ?   ").padEnd(10);
    }).join("");
    console.log(`${a.padEnd(11)}${row}`);
  }

  const bad = results.filter((r) => r.status === "missing" || r.status === "partial");
  if (bad.length) {
    console.log(`\n${bad.length} problem(s):`);
    for (const r of bad) console.log(`  [${r.host}] ${r.artifact}: ${r.detail}`);
    console.log(`\nRepair everything the harness owns:`);
    console.log(`  bash scripts/install-harness.sh --all --mcp-source local --yes`);
    console.log(`\nOr a single host, without touching the others:`);
    console.log(`  bash apps/<host>-plugin/install.sh --user`);
    console.log(`\nThe harness still skips a host already recorded at the bundle version,`);
    console.log(`but only when EVERY artifact class it installed is still on disk — a`);
    console.log(`partial install like the ones above now reinstalls instead of skipping.`);
  } else {
    console.log(`\nAll expected artifacts present.`);
  }
  console.log();
}

process.exit(results.some((r) => r.status === "missing" || r.status === "partial") ? 1 : 0);
