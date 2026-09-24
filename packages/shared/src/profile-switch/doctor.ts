/**
 * Agent runtime drift report (agent-runtime-drift, T02) — the one-shot,
 * offline, READ-ONLY answer to "what model will this host's massa-ai agents
 * actually run, and does every recording of that answer agree?"
 *
 * Three recordings of the truth exist and can disagree independently:
 *   1. the live tree the host loads (directory-source route) or the pinned
 *      cache snapshot (registry-cache route) — resolved by
 *      `resolveClaudeMarketplaceInstall`;
 *   2. `install-state.json`'s recorded plugin version + active profile;
 *   3. `installed_plugins.json`'s pinned version (Claude's own registry).
 * Plus one recording the product cannot control: host env overrides
 * (`CLAUDE_CODE_SUBAGENT_MODEL`), which nullify every per-agent model at
 * runtime and are therefore REPORTED, never hidden.
 *
 * Route semantics of drift (INV of the spec): on `directory-source`, stale
 * actives mean "the tree moved — re-run profile_set / regenerate"; on
 * `registry-cache`, the same drift means "plugin update needed".
 *
 * Never throws (INV1): every read is guarded; an unreadable source degrades
 * to null/false rather than failing the caller. Never writes (INV1).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readInstalledPluginVersion,
  resolveClaudeMarketplaceInstall,
} from "./claude-marketplace.js";
import { parseFrontmatter } from "./frontmatter.js";
import { isOwnedAgentFile } from "./ownership.js";
import { readInstallState, type InstallState } from "./state.js";
import type { Host } from "./hosts.js";

/** Host env vars that override per-agent models at runtime. Extend here, not
 *  at call sites — the doctor reports the first present, non-blank one. */
export const ENV_OVERRIDE_VARS = ["CLAUDE_CODE_SUBAGENT_MODEL"] as const;

export interface EnvOverride {
  readonly name: string;
  readonly value: string;
}

export interface AgentRoleRuntime {
  /** Agent file base name, e.g. "code-explorer.md". */
  readonly name: string;
  readonly model: string | null;
  readonly effort: string | null;
  /** true ONLY when both the active file and the recorded profile's variant
   *  exist and their bytes differ — an incomparable pair (missing side) is
   *  unknown, not drift (no false positives, spec R2 of the critique). */
  readonly staleVariant: boolean;
}

export interface AgentRuntimeReport {
  readonly host: Host;
  readonly route: "directory-source" | "registry-cache" | "unresolved";
  readonly liveRoot: string | null;
  /** Version declared by the live root's own plugin.json (the tree the host loads). */
  readonly sourceVersion: string | null;
  /** Version recorded in install-state.json (stale-able). */
  readonly stateVersion: string | null;
  /** Version pinned by Claude's installed_plugins.json (stale-able). */
  readonly pinnedVersion: string | null;
  /** Recorded active profile (install-state modelProfile). */
  readonly activeProfile: string | null;
  readonly roles: readonly AgentRoleRuntime[];
  readonly envOverride: EnvOverride | null;
  /** sourceVersion vs stateVersion disagreement (both present, unequal). */
  readonly versionDrift: boolean;
  /** Any role's active file disagrees with its recorded profile variant. */
  readonly profileMaterialized: boolean;
}

export interface RuntimeDriftOptions {
  targetHome?: string;
  stateFilePath?: string;
  pluginKey?: string;
  /** Injectable env (tests); defaults to process.env. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Inject when the caller already holds the state (avoids a second read). */
  state?: InstallState;
  host?: Host;
}

function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function readJsonFile<T>(filePath: string): T | null {
  const raw = readTextFile(filePath);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readPluginVersion(pluginRoot: string): string | null {
  const manifest = readJsonFile<{ version?: unknown }>(
    path.join(pluginRoot, ".claude-plugin", "plugin.json"),
  );
  return typeof manifest?.version === "string" ? manifest.version : null;
}

/** First present, non-blank override var — the one that wins at runtime. */
function detectEnvOverride(
  env: Readonly<Record<string, string | undefined>>,
): EnvOverride | null {
  for (const name of ENV_OVERRIDE_VARS) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) {
      return { name, value: value.trim() };
    }
  }
  return null;
}

/** Roles = the massa-ai-owned agent files present in the live root's agents dir. */
function readRoles(
  liveRoot: string,
  activeProfile: string | null,
): AgentRoleRuntime[] {
  const agentsDir = path.join(liveRoot, "agents");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const roles: AgentRoleRuntime[] = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".md") || !isOwnedAgentFile(path.join(agentsDir, entry.name))) {
      continue;
    }
    const activeRaw = readTextFile(path.join(agentsDir, entry.name));
    let model: string | null = null;
    let effort: string | null = null;
    if (activeRaw !== null) {
      try {
        const { frontmatter } = parseFrontmatter(activeRaw);
        model = typeof frontmatter.model === "string" ? frontmatter.model : null;
        effort = typeof frontmatter.effort === "string" ? frontmatter.effort : null;
      } catch {
        // Unparseable frontmatter — the file exists but says nothing reliable.
      }
    }
    let staleVariant = false;
    if (activeProfile && activeRaw !== null) {
      const variantRaw = readTextFile(
        path.join(liveRoot, "agent-profiles", activeProfile, entry.name),
      );
      if (variantRaw !== null) {
        staleVariant = variantRaw !== activeRaw;
      }
    }
    roles.push({ name: entry.name, model, effort, staleVariant });
  }
  return roles.sort((a, b) => a.name.localeCompare(b.name));
}

export function runtimeDriftReport(opts: RuntimeDriftOptions = {}): AgentRuntimeReport {
  const targetHome = opts.targetHome ?? os.homedir();
  const host: Host = opts.host ?? "claude";
  const stateFilePath =
    opts.stateFilePath ?? path.join(targetHome, ".config", "massa-ai", "install-state.json");

  let state: InstallState | null = opts.state ?? null;
  if (state === null) {
    try {
      state = readInstallState(stateFilePath);
    } catch {
      state = null; // absent/unwritable/corrupt — degraded, never thrown
    }
  }
  const platform = state?.platforms?.[host];
  const stateVersion = typeof platform?.plugin?.version === "string" ? platform.plugin.version : null;
  const activeProfile = platform?.modelProfile?.profile ?? null;

  if (host !== "claude") {
    return {
      host,
      route: "unresolved",
      liveRoot: null,
      sourceVersion: null,
      stateVersion,
      pinnedVersion: null,
      activeProfile,
      roles: [],
      envOverride: detectEnvOverride(opts.env ?? process.env),
      versionDrift: false,
      profileMaterialized: false,
    };
  }

  const install = resolveClaudeMarketplaceInstall({ targetHome, pluginKey: opts.pluginKey });
  const liveRoot = install?.root ?? null;
  const sourceVersion = liveRoot === null ? null : readPluginVersion(liveRoot);
  const pinnedVersion = readInstalledPluginVersion({ targetHome, pluginKey: opts.pluginKey });

  const roles = liveRoot === null ? [] : readRoles(liveRoot, activeProfile);

  return {
    host: "claude",
    route: install?.route ?? "unresolved",
    liveRoot,
    sourceVersion,
    stateVersion,
    pinnedVersion,
    activeProfile,
    roles,
    envOverride: detectEnvOverride(opts.env ?? process.env),
    versionDrift:
      sourceVersion !== null && stateVersion !== null && sourceVersion !== stateVersion,
    profileMaterialized: roles.some((role) => role.staleVariant),
  };
}
