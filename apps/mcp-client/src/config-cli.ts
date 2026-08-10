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
  type Host,
  type ProfileInventory,
  type SwitchReport,
  type VariantSyncHostResult,
} from "@massa-ai/shared";

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

Examples:
  massa-ai-config init
  massa-ai-config init --mistral your-api-key
  massa-ai-config use ollama --model qwen3-embedding:4b
  massa-ai-config use mistral --api-key your-key
  massa-ai-config set embedding.dimensions 1024
  massa-ai-config recover my-project --path /home/user/renamed-dir
  massa-ai-config profile set work --dry-run
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
