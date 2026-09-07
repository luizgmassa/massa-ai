#!/usr/bin/env bun

import {
  getConfigPath,
  configExists,
  loadConfig,
  saveConfig,
  initConfig,
  defaultMassaAiConfig,
} from "@massa-ai/shared/config";
import {
  listProfiles,
  switchProfile,
  reportSucceeded,
  syncGeneratedVariants,
  findRepoRootWithMarker,
  isHost,
  applyBootstrapState,
  assertKnownRuleId,
  bootstrapReportSucceeded,
  bootstrapStateFilePath,
  formatBootstrapInventory,
  formatBootstrapReport,
  resolveBootstrapState,
  setBootstrapRuleEnabled,
  type Host,
  type ProfileInventory,
  type SwitchReport,
  type VariantSyncHostResult,
} from "@massa-ai/shared";
import os from "os";
import path from "path";

// This CLI is a PUBLISHED app (npm) and, unlike apps/tools-api's routes,
// cannot depend on scripts/lib/model-profiles.ts at all — that tree ships
// only in a source checkout, not in the published package. `profile list`/
// `show` below therefore keep listProfiles()'s own last-resort "balanced"
// literal fallback rather than passing registry.hostDefaults (T2); the
// generic findRepoRootWithMarker walk below is fine to use for
// `syncGeneratedVariants`'s sourceRoot because it depends on nothing outside
// this package.
const GENERATOR_MARKER = "scripts/generate-subagent-artifacts.ts";
const GENERATOR_MARKER_MAX_LEVELS = 6;

/** One line per host that actually synced (skipped/failed hosts stay
 *  silent — skipped is the routine, published-install-adjacent no-op case,
 *  and a failed sync is not fatal to the switch that follows). */
function formatVariantSync(results: VariantSyncHostResult[]): void {
  for (const r of results) {
    if (r.status === "synced") {
      console.log(`  synced ${r.host}: ${r.files} file(s) across ${r.profiles.length} profile(s)`);
    }
  }
}

function help() {
  console.log(`
massa-ai-config - Configuration manager for massa-ai

Usage:
  massa-ai-config <command> [options]

Commands:
  init              Initialize massa-ai configuration
    --ollama          Use Ollama (local, default)
    --mistral <key>   Use Mistral with API key
    --openai <key>    Use OpenAI with API key

  path              Show config file path
  show              Show current configuration
  set <key> <val>   Set a configuration value
  use <provider>    Switch embedding provider
    --api-key <key>   API key (required for mistral/openai)
    --model <name>    Model name
    --base-url <url>  Base URL (for ollama)

  recover           Re-associate a project index with a new filesystem path
    <projectId>       Project ID to recover
    --path <newPath>  New filesystem path

  profile list      List shipped model profiles + per-host active profile
  profile show      Same as 'profile list'
  profile set <name> [--host <h>] [--dry-run]
                    Switch installed agents to a profile (restart required after)

  bootstrap list    List every startup-contract rule: state, default, description
  bootstrap show    Same as 'bootstrap list'
  bootstrap enable <rule-id> [--target <dir> --yes] [--dry-run]
  bootstrap disable <rule-id> [--target <dir> --yes] [--dry-run]
                    Toggle one rule and re-render MASSA-AI.md for every
                    recorded host (restart required after)

Examples:
  massa-ai-config init
  massa-ai-config init --mistral your-api-key
  massa-ai-config use ollama --model qwen3-embedding:4b
  massa-ai-config use mistral --api-key your-key
  massa-ai-config set embedding.dimensions 1024
  massa-ai-config recover my-project --path /home/user/renamed-dir
  massa-ai-config profile set work --dry-run
  massa-ai-config bootstrap list
  massa-ai-config bootstrap disable caveman
`);
}

export function parseOptions(args: string[]): Record<string, string | boolean> {
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        options[key] = args[i + 1];
        i++;
      } else {
        options[key] = true;
      }
    }
  }
  return options;
}

/** Thin formatting over the shared switch engine's ProfileInventory (P2 AC2 —
 * `profile list`/`profile show` print the same data `profile_list` returns). */
function formatProfileInventory(inventory: ProfileInventory): void {
  for (const h of inventory.hosts) {
    if (h.skipped) {
      console.log(`  ${h.host}: skipped (${h.skipReason})`);
      continue;
    }
    if (!h.installed) {
      console.log(`  ${h.host}: not installed`);
      continue;
    }
    console.log(
      `  ${h.host}: active=${h.activeProfile} bundle=${h.bundleVersion ?? "unknown"} supports=${
        h.availableProfiles.length > 0 ? h.availableProfiles.join(",") : "none"
      }`,
    );
  }
}

/** Thin formatting over the shared switch engine's SwitchReport. */
function formatSwitchReport(report: SwitchReport): void {
  console.log(`profile: ${report.profile}${report.dryRun ? " (dry run — no files changed)" : ""}`);
  for (const row of report.hosts) {
    const detail = row.reason ? `: ${row.reason}` : row.filesChanged !== undefined ? ` (${row.filesChanged} files changed)` : "";
    console.log(`  ${row.host}: ${row.status}${detail}`);
  }
  if (report.restartRequired) {
    console.log("\nA host session restart is required for the change to take effect.");
  }
}

export async function runCli(argv: string[]): Promise<number> {
  const args = argv;
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    help();
    return 0;
  }

  const options = parseOptions(args.slice(1));

  switch (command) {
  case "init": {
    initConfig();
    
    if (options.mistral && typeof options.mistral === "string") {
      const config = loadConfig();
      config.embedding = {
        provider: "mistral",
        model: "mistral-embed",
        apiKey: options.mistral,
        dimensions: 1024,
      };
      saveConfig(config);
      console.log("✓ Configured for Mistral embeddings");
    } else if (options.openai && typeof options.openai === "string") {
      const config = loadConfig();
      config.embedding = {
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: options.openai,
        dimensions: 1536,
      };
      saveConfig(config);
      console.log("✓ Configured for OpenAI embeddings");
    } else {
      console.log("✓ Configured for Ollama (local) embeddings");
    }
    
    console.log(`\nConfig file: ${getConfigPath()}`);
    break;
  }

  case "path": {
    console.log(getConfigPath());
    break;
  }

  case "show": {
    if (!configExists()) {
      console.log("No config file found. Run `massa-ai-config init` to create one.");
      console.log("\nUsing defaults:");
      console.log(JSON.stringify(defaultMassaAiConfig, null, 2));
      return 0;
    }
    
    const config = loadConfig();
    console.log(JSON.stringify(config, null, 2));
    break;
  }

  case "set": {
    const key = args[1];
    const value = args[2];
    
    if (!key || !value) {
      console.error("Usage: massa-ai-config set <key> <value>");
      return 1;
    }
    
    const config = loadConfig();
    const keys = key.split(".");
    let obj: Record<string, unknown> = config as unknown as Record<string, unknown>;
    
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]] as Record<string, unknown>;
    }
    
    const parsedValue = isNaN(Number(value)) ? value : Number(value);
    obj[keys[keys.length - 1]] = parsedValue;
    saveConfig(config);
    console.log(`✓ Set ${key} = ${value}`);
    break;
  }

  case "use": {
    const provider = args[1];
    
    if (!provider || !["ollama", "mistral", "openai"].includes(provider)) {
      console.error("Provider must be: ollama, mistral, or openai");
      return 1;
    }
    
    const config = loadConfig();
    
    if (provider === "ollama") {
      config.embedding = {
        provider: "ollama",
        model: (options.model as string) || "qwen3-embedding:4b",
        baseURL: (options["base-url"] as string) || "http://localhost:11434",
        // Must match the default model's output width: qwen3-embedding:4b
        // emits 2560-d vectors, and refuseOnDimensionMismatch fails loudly
        // on a config that disagrees with what the model returns.
        dimensions: 2560,
      };
    } else if (provider === "mistral") {
      if (!options["api-key"]) {
        console.error("Error: --api-key required for Mistral");
        return 1;
      }
      config.embedding = {
        provider: "mistral",
        model: (options.model as string) || "mistral-embed",
        apiKey: options["api-key"] as string,
        dimensions: 1024,
      };
    } else if (provider === "openai") {
      if (!options["api-key"]) {
        console.error("Error: --api-key required for OpenAI");
        return 1;
      }
      config.embedding = {
        provider: "openai",
        model: (options.model as string) || "text-embedding-3-small",
        apiKey: options["api-key"] as string,
        dimensions: 1536,
      };
    }
    
    saveConfig(config);
    console.log(`✓ Switched to ${provider} embeddings`);
    console.log(`  Model: ${config.embedding.model}`);
    break;
  }

  case "recover": {
    const projectId = args[1];
    const newPath = options.path as string | undefined;

    if (!projectId) {
      console.error("Error: projectId required. Usage: massa-ai-config recover <projectId> --path <newPath>");
      return 1;
    }
    if (!newPath || typeof newPath !== "string") {
      console.error("Error: --path required. Usage: massa-ai-config recover <projectId> --path <newPath>");
      return 1;
    }

    try {
      const { recoverProjectPath } = await import("./recover-project.js");
      const result = await recoverProjectPath(projectId, newPath);
      if (!result.found) {
        console.error(`Error: project "${projectId}" not found. Cannot recover — the project must be indexed first.`);
        return 1;
      }
      console.log(`✓ Recovered project "${projectId}" — path updated to ${newPath}`);
      console.log(`  Previous path: ${result.oldPath ?? "(none)"}`);
    } catch (e) {
      const err = e as Error;
      console.error(`Error: recovery failed — ${err.message}`);
      return 1;
    }
    break;
  }

  case "profile": {
    const subcommand = args[1];

    if (subcommand === "list" || subcommand === "show") {
      try {
        // No hostDefaults passed here (see the module-level comment) — this
        // published CLI cannot reach the registry, so an unrecorded host's
        // activeProfile falls back to listProfiles()'s own "balanced" literal.
        formatProfileInventory(listProfiles());
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        return 1;
      }
      return 0;
    }

    if (subcommand === "set") {
      const name = args[2];
      if (!name) {
        console.error("Usage: massa-ai-config profile set <name> [--host <h>] [--dry-run]");
        return 1;
      }
      const hostOpt = typeof options.host === "string" ? options.host : undefined;
      if (hostOpt !== undefined && !isHost(hostOpt)) {
        console.error(`Error: unknown host "${hostOpt}"`);
        return 1;
      }
      try {
        // Bridge apps/<host>-plugin/agent-profiles/ into the installed
        // variant root before switching, from a dev checkout only (T4) — a
        // null sourceRoot (published install, no scripts/ marker findable)
        // makes syncGeneratedVariants a silent no-op, so nothing prints.
        const sourceRoot = findRepoRootWithMarker(import.meta.dirname, GENERATOR_MARKER, GENERATOR_MARKER_MAX_LEVELS);
        formatVariantSync(syncGeneratedVariants({ sourceRoot }));

        const report = switchProfile({
          profile: name,
          host: hostOpt as Host | undefined,
          dryRun: options["dry-run"] === true,
        });
        formatSwitchReport(report);
        return reportSucceeded(report) ? 0 : 1;
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        return 1;
      }
    }

    console.error("Usage: massa-ai-config profile <list|show|set> ...");
    return 1;
  }

  /*
   * `bootstrap list|show|enable <id>|disable <id>` (T17/T18, BST-09, BST-11).
   * This block is byte-identical in `apps/mcp-client/src/config-cli.ts` and
   * `apps/opencode-plugin/src/config-cli.ts` except for the one
   * `import.meta.dirname` / `__dirname` line, the same single divergence the
   * `profile` block above already carries.
   *
   * Every branch here is a thin front over `@massa-ai/shared`: the registry
   * validates the id, the engine renders and delivers, and the two shared
   * formatters (T16) produce the text. Nothing in this block re-implements a
   * rule, a default, a status literal or a message the module already owns —
   * that is what keeps the two CLIs from drifting apart (design.md:446).
   *
   * BST-11 AC-4 / BST-11.5: nothing on this path opens a socket. The whole
   * point of the CLI front is that it still works when the massa-ai MCP server
   * is unreachable, because that is the state a user is in after disabling
   * `massa-ai-router` — the rule that loads the router which would otherwise
   * drive the toggle. No `bootstrap_*` MCP tool exists, deliberately
   * (design.md "MCP front | Not built").
   */
  case "bootstrap": {
    const subcommand = args[1];

    if (subcommand === "list" || subcommand === "show") {
      try {
        // Reads through the strict seam, so a malformed config.json surfaces
        // as a named ConfigParseError instead of silently listing defaults
        // that are not what is persisted.
        console.log(formatBootstrapInventory(resolveBootstrapState().state));
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        return 1;
      }
      return 0;
    }

    if (subcommand === "enable" || subcommand === "disable") {
      const ruleId = args[2];
      if (!ruleId) {
        console.error(
          "Usage: massa-ai-config bootstrap <enable|disable> <rule-id> [--target <dir> --yes] [--dry-run]",
        );
        return 1;
      }

      // BST-09 AC-8: validated here, before anything is read or written, so an
      // unknown id can never be the reason a file was touched. `setBootstrapRuleEnabled`
      // asserts the same thing internally (state.ts:165) — doing it again at the
      // dispatch boundary is what makes "changes no state" observable, since a
      // command that reached the writer at all has already reached its file.
      try {
        assertKnownRuleId(ruleId);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        return 1;
      }

      const targetOpt = typeof options.target === "string" ? options.target : undefined;
      const targetHome = targetOpt === undefined ? os.homedir() : path.resolve(targetOpt);

      // design.md:358-363: the typed command naming the mutation is the consent
      // against the resolved home, but a redirected target is the case
      // `installer_consent_gate` (scripts/install-skills.sh:133) already exists
      // for. Refused before the writer, so an unconfirmed target changes nothing.
      if (targetHome !== os.homedir() && options.yes !== true) {
        console.error(
          `Error: --target ${targetHome} is not your home (${os.homedir()}) — pass --yes to confirm writing there`,
        );
        return 1;
      }

      const dryRun = options["dry-run"] === true;

      try {
        if (dryRun) {
          // A dry run writes nothing at all, config.json included, so the
          // persisted flag is left alone and only the delivery plan is shown.
          console.log(
            `bootstrap ${subcommand} ${ruleId}: dry run — ${getConfigPath()} was not written`,
          );
        } else {
          setBootstrapRuleEnabled(ruleId, subcommand === "enable");
        }

        // The preference is process-scoped (spec BST-10 AC-11 fixes it at
        // ~/.config/massa-ai/config.json and `setBootstrapRuleEnabled` takes no
        // path), while the engine resolves the state it renders from under
        // `--target`. Those are the same file in the ordinary run and different
        // files under a redirected target or a moved XDG_CONFIG_HOME, so the
        // divergence is named rather than left to surprise the caller with a
        // render that ignored the flag it just set.
        const stateFile = bootstrapStateFilePath(targetHome);
        if (stateFile !== getConfigPath()) {
          console.error(
            `Warning: the rule state is persisted to ${getConfigPath()}, but --target renders from ${stateFile} — set XDG_CONFIG_HOME to move the persisted state`,
          );
        }

        // `skills/AGENTS.md` is the only marked-up copy of the contract and it
        // exists only in a checkout; a rendered MASSA-AI.md cannot serve because
        // the render strips every marker (render.ts:19-23). Outside a checkout
        // this stays undefined and the engine raises its own named
        // BootstrapSourceUnavailableError (engine.ts:265-270) rather than
        // rendering from a guessed source.
        const repoRoot = findRepoRootWithMarker(import.meta.dirname, GENERATOR_MARKER, GENERATOR_MARKER_MAX_LEVELS);
        const report = applyBootstrapState({
          targetHome,
          dryRun,
          sourcePath: repoRoot === null ? undefined : path.join(repoRoot, "skills", "AGENTS.md"),
        });
        console.log(formatBootstrapReport(report));
        return bootstrapReportSucceeded(report) ? 0 : 1;
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        return 1;
      }
    }

    console.error("Usage: massa-ai-config bootstrap <list|show|enable|disable> ...");
    return 1;
  }

  default:
    console.error(`Unknown command: ${command}`);
    help();
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
