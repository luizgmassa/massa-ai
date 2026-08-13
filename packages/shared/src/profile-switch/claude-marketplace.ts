/**
 * Claude marketplace install-root resolver (design "4a.
 * `packages/shared/src/profile-switch/claude-marketplace.ts`", CPP-01, CPP-02,
 * CPP-06, and MDS-01 / design D1 for the directory-source branch below).
 *
 * On a marketplace install, Claude copies the plugin bundle into its own
 * versioned cache directory (`~/.claude/plugins/cache/<marketplace>/<plugin>/
 * <version>`), recorded in `~/.claude/plugins/installed_plugins.json`. That
 * path moves on every `claude plugin update`, so this module deliberately
 * keeps no module-level state — every call re-reads the registry from disk.
 *
 * MDS-01 / D1 — that cache path is wrong for a **directory-source**
 * marketplace: Claude loads the plugin live from the source directory named
 * in `~/.claude/plugins/known_marketplaces.json`, and the cache is only a
 * point-in-time snapshot (spec E1-E2). `resolveClaudeMarketplaceRoot` now
 * checks that registry FIRST, ahead of the existing `installed_plugins.json`
 * path: when the plugin's marketplace is `source.source === "directory"`,
 * the live root is composed from that directory's own
 * `.claude-plugin/marketplace.json` (`plugins[]` matched by name → `.source`,
 * resolved against `installLocation`) instead of the cache. Every failure
 * *inside* that directory-source resolution — including an unreadable
 * `known_marketplaces.json` itself (AC-01.3) — resolves `null`, never a
 * throw and never a silent fall-through to the cache branch: a directory
 * source whose registry is broken is a broken install, not "must be the
 * other kind." Only when `known_marketplaces.json` names no directory
 * source for this marketplace at all (absent entry, or a non-"directory"
 * `source.source`) does resolution fall through to the cache path below,
 * unchanged (AC-01.2 — an explicitly accepted, unmeasured risk for that
 * "other kind," not a correctness claim; see spec Out of Scope / MDS-05).
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

interface KnownMarketplaceSource {
  /** e.g. "directory" | "github" | other Claude-defined kinds. Only
   *  "directory" is interpreted here (AC-01.1); every other value is
   *  deliberately opaque to this module (AC-01.2). */
  source?: string;
}

interface KnownMarketplaceEntry {
  source?: KnownMarketplaceSource;
  installLocation?: string;
}

/** `~/.claude/plugins/known_marketplaces.json` — keyed by marketplace name
 *  (the right-hand side of a `<plugin>@<marketplace>` registry key). */
type KnownMarketplacesFile = Record<string, KnownMarketplaceEntry>;

interface MarketplaceManifestPlugin {
  name?: string;
  /** Relative path from the manifest's own directory-source root to the
   *  live plugin bundle, e.g. "./apps/claude-plugin" (spec E1). Manifest-
   *  supplied, untrusted data — see `isContainedPath` (AC-01.6). */
  source?: string;
}

/** A directory source's own `.claude-plugin/marketplace.json`. */
interface MarketplaceManifest {
  plugins?: MarketplaceManifestPlugin[];
}

/** Splits a `<plugin>@<marketplace>` registry key into its two halves
 *  (AC-01.5 — the marketplace name is read from the key, never hardcoded:
 *  "massa-ai@massa-ai" makes the two sides look interchangeable, and they
 *  are not). Returns `null` for a key with no "@" — callers fall through to
 *  the cache-path lookup, which already treats an arbitrary string as a
 *  literal `installed_plugins.json` key exactly as before this change. */
function splitPluginKey(pluginKey: string): { pluginName: string; marketplaceName: string } | null {
  const at = pluginKey.indexOf("@");
  if (at === -1) return null;
  const pluginName = pluginKey.slice(0, at);
  const marketplaceName = pluginKey.slice(at + 1);
  if (!pluginName || !marketplaceName) return null;
  return { pluginName, marketplaceName };
}

/** AC-01.6: `candidate` must be `root` itself or a descendant of it.
 *  `plugins[i].source` is manifest-supplied relative data, and composing it
 *  against `installLocation` is the first code path that turns manifest
 *  content into a live **write** target — a `../`-escaping value that
 *  happens to exist on disk must not be trusted just because `existsSync`
 *  says yes. */
function isContainedPath(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * D1's directory-source branch. Returns:
 *  - `undefined` when `known_marketplaces.json` does not name a directory
 *    source for this marketplace at all (no entry, or `source.source !==
 *    "directory"`) — the signal for the caller to fall through to the
 *    `installed_plugins.json` cache path unchanged (AC-01.2).
 *  - `string | null` once a directory source IS named: `null` for every
 *    failure from that point on (AC-01.3: missing `installLocation`, absent
 *    or unparseable `.claude-plugin/marketplace.json`, no matching plugin
 *    entry, an out-of-bounds composed path (AC-01.6), or a composed path
 *    that doesn't exist on disk) — deliberately NOT falling through to the
 *    cache branch, because a directory-source install with a broken
 *    manifest is a broken install, not evidence it must be the other kind.
 *
 * AC-01.3 also covers `known_marketplaces.json` itself being absent or
 * unparseable: that resolves `null` directly, even if `installed_plugins.
 * json` separately holds an otherwise-valid record. This registry is the
 * only source of truth for *which* kind of marketplace this is; losing it
 * must not silently default to "must be the cache kind."
 */
function resolveDirectorySourceRoot(targetHome: string, pluginKey: string): string | null | undefined {
  const split = splitPluginKey(pluginKey);
  if (!split) return undefined;
  const { pluginName, marketplaceName } = split;

  const knownMarketplacesPath = path.join(targetHome, ".claude", "plugins", "known_marketplaces.json");
  let known: KnownMarketplacesFile;
  try {
    known = JSON.parse(fs.readFileSync(knownMarketplacesPath, "utf8")) as KnownMarketplacesFile;
  } catch {
    return null; // AC-01.3: absent or unparseable known_marketplaces.json.
  }

  const entry = known?.[marketplaceName];
  if (!entry || entry.source?.source !== "directory") return undefined; // AC-01.2: any other kind, unchanged.

  // Confirmed directory source — every remaining failure is null, never a
  // fall-through to the cache branch (design D1).
  const installLocation = entry.installLocation;
  if (!installLocation) return null;

  const manifestPath = path.join(installLocation, ".claude-plugin", "marketplace.json");
  let manifest: MarketplaceManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MarketplaceManifest;
  } catch {
    return null;
  }

  const plugin = manifest.plugins?.find((p) => p?.name === pluginName);
  const relSource = plugin?.source;
  if (!relSource) return null;

  const resolvedInstallLocation = path.resolve(installLocation);
  const composed = path.resolve(resolvedInstallLocation, relSource);
  if (!isContainedPath(resolvedInstallLocation, composed)) return null; // AC-01.6

  try {
    if (!fs.existsSync(composed)) return null;
  } catch {
    return null;
  }

  return composed;
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
 * Resolves the live plugin root Claude actually reads. For a directory-
 * source marketplace (MDS-01/D1) that is the composed live source directory
 * (see `resolveDirectorySourceRoot`); for every other kind it is the
 * versioned install root Claude copied the plugin bundle into, or null when
 * the registry is absent, unparseable, lists no record for the plugin, or
 * names a path that does not exist on disk.
 *
 * NEVER cached: the path is version pinned
 * (~/.claude/plugins/cache/<mp>/<plugin>/<version>) and moves on every
 * `claude plugin update`; the directory-source branch re-reads both its
 * registries on every call for the same reason.
 */
export function resolveClaudeMarketplaceRoot(
  opts: ClaudeMarketplaceRootOptions = {},
): string | null {
  const targetHome = opts.targetHome ?? os.homedir();
  const pluginKey = opts.pluginKey ?? DEFAULT_PLUGIN_KEY;

  const directoryResult = resolveDirectorySourceRoot(targetHome, pluginKey);
  if (directoryResult !== undefined) return directoryResult; // AC-01.1 / AC-01.3 / AC-01.6

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
