/**
 * Claude marketplace install-root resolver (design "4a.
 * `packages/shared/src/profile-switch/claude-marketplace.ts`", CPP-01, CPP-02,
 * CPP-06).
 *
 * On a marketplace install, Claude copies the plugin bundle into its own
 * versioned cache directory (`~/.claude/plugins/cache/<marketplace>/<plugin>/
 * <version>`), recorded in `~/.claude/plugins/installed_plugins.json`. That
 * path moves on every `claude plugin update`, so this module deliberately
 * keeps no module-level state — every call re-reads the registry from disk.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ClaudeMarketplaceRootOptions {
  targetHome?: string;
  /** Registry key; defaults to "massa-ai@massa-ai". */
  pluginKey?: string;
}

/** Default registry key: `<plugin-name>@<marketplace-name>` — both sides are
 *  "massa-ai" for this project's own marketplace listing. */
const DEFAULT_PLUGIN_KEY = "massa-ai@massa-ai";

interface InstalledPluginRecord {
  scope?: string;
  installPath?: string;
  version?: string;
  installedAt?: string;
  lastUpdated?: string;
  gitCommitSha?: string;
}

interface InstalledPluginsFile {
  version?: number;
  plugins?: Record<string, InstalledPluginRecord[]>;
}

/**
 * Deterministic record selection when `installed_plugins.json` lists more
 * than one record for the plugin key (spec Edge Cases): prefer `scope ===
 * "user"` records over any other scope; within the chosen pool, the record
 * with the most recent `lastUpdated` wins; a tie (equal timestamps, or no
 * record in the pool has a parseable `lastUpdated`) falls through to the
 * last entry in array order. `>=` (not `>`) in the comparison below is what
 * makes "most recent, then last entry" a single loop: on a tie, the
 * later-indexed record always replaces the earlier one.
 */
function selectRecord(records: InstalledPluginRecord[]): InstalledPluginRecord | undefined {
  if (records.length === 0) return undefined;
  const userScoped = records.filter((r) => r.scope === "user");
  const pool = userScoped.length > 0 ? userScoped : records;

  let best: InstalledPluginRecord | undefined;
  let bestTime = -Infinity;
  for (const record of pool) {
    const parsed = record.lastUpdated ? Date.parse(record.lastUpdated) : NaN;
    if (Number.isFinite(parsed) && parsed >= bestTime) {
      best = record;
      bestTime = parsed;
    }
  }
  return best ?? pool[pool.length - 1];
}

/**
 * Resolves the versioned install root Claude copied the plugin bundle into,
 * or null when the registry is absent, unparseable, lists no record for the
 * plugin, or names a path that does not exist on disk.
 *
 * NEVER cached: the path is version pinned
 * (~/.claude/plugins/cache/<mp>/<plugin>/<version>) and moves on every
 * `claude plugin update`.
 */
export function resolveClaudeMarketplaceRoot(
  opts: ClaudeMarketplaceRootOptions = {},
): string | null {
  const targetHome = opts.targetHome ?? os.homedir();
  const pluginKey = opts.pluginKey ?? DEFAULT_PLUGIN_KEY;
  const registryPath = path.join(targetHome, ".claude", "plugins", "installed_plugins.json");

  let records: InstalledPluginRecord[] | undefined;
  try {
    const raw = fs.readFileSync(registryPath, "utf8");
    const parsed = JSON.parse(raw) as InstalledPluginsFile;
    records = parsed?.plugins?.[pluginKey];
  } catch {
    // Absent file, unreadable file, or unparseable JSON — all resolve to null
    // (CPP-06), never a throw.
    return null;
  }

  if (!Array.isArray(records) || records.length === 0) return null;

  const selected = selectRecord(records);
  const installPath = selected?.installPath;
  if (!installPath) return null;

  try {
    if (!fs.existsSync(installPath)) return null;
  } catch {
    return null;
  }

  return installPath;
}
