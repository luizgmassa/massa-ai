/**
 * Model-profile switch engine (design "Component 2 — Switch engine"). The
 * one implementation MCP tools, both config-CLIs, and the OpenCode
 * in-process tool front (later phases) — this module owns no host-specific
 * UI, only fs + state + lock orchestration.
 *
 * Validation order (design): state readable+writable -> hosts detected ->
 * variant availability (unknown-profile check) -> lock acquired -> per-host
 * copy -> per-host state write. Copies happen before that host's state
 * write, and a host's failure never rolls back another host's completed
 * switch (per-host atomicity) — only state-file corruption/unwritability is
 * a global precondition (design F4 amendment).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { HOSTS, type Host, resolveHostLayout, detectRoute, type HostFileLayout } from "./hosts.js";
import { readInstallState, updatePlatform, UnwritableInstallStateError, type InstallState } from "./state.js";
import { acquireLock, type AcquireLockOptions } from "./lock.js";
import type { HostProfileState, ProfileInventory, HostSwitchResult, HostSwitchStatus, SwitchReport } from "./report.js";

export class SwitchEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwitchEngineError";
  }
}

function namedError(name: string, message: string): SwitchEngineError {
  const err = new SwitchEngineError(message);
  err.name = name;
  return err;
}

export const UnknownProfileError = (profile: string, known: readonly string[]): SwitchEngineError =>
  namedError(
    "UnknownProfileError",
    `unknown profile "${profile}" — installed: ${known.length > 0 ? known.join(", ") : "none"}`,
  );

export const NoHostsDetectedError = (): SwitchEngineError =>
  namedError("NoHostsDetectedError", "no installed hosts found");

interface CommonOpts {
  targetHome?: string;
  projectRoot?: Partial<Record<Host, string>>;
  stateFilePath?: string;
}

function defaultStatePath(targetHome: string): string {
  return path.join(targetHome, ".config", "massa-ai", "install-state.json");
}

function resolveCommon(opts: CommonOpts): { targetHome: string; stateFilePath: string } {
  const targetHome = opts.targetHome ?? os.homedir();
  const stateFilePath = opts.stateFilePath ?? defaultStatePath(targetHome);
  return { targetHome, stateFilePath };
}

// ── listProfiles ─────────────────────────────────────────────────────────

export interface ListProfilesOptions extends CommonOpts {
  hosts?: readonly Host[];
}

/** Enumerates installed variant dirs per detected host + reads recorded
 * state. Never touches the registry — every profile name comes from
 * on-disk directories (MPS-02 offline requirement). */
export function listProfiles(opts: ListProfilesOptions = {}): ProfileInventory {
  const { targetHome, stateFilePath } = resolveCommon(opts);
  const state = readInstallState(stateFilePath);
  const universe = opts.hosts ?? HOSTS;

  const hosts: HostProfileState[] = universe.map((host) => {
    const layout = resolveHostLayout(host, { targetHome, projectRoot: opts.projectRoot });
    if (layout.route === "skip") {
      return {
        host,
        installed: false,
        skipped: true,
        skipReason: layout.reason,
        activeProfile: null,
        bundleVersion: null,
        availableProfiles: [],
      };
    }
    const installed = fs.existsSync(layout.activeDir);
    const availableProfiles = listVariantProfiles(layout);
    const platform = state.platforms[host];
    return {
      host,
      installed,
      skipped: false,
      skipReason: null,
      activeProfile: platform?.modelProfile?.profile ?? "balanced",
      bundleVersion: platform?.plugin?.version ?? null,
      availableProfiles,
    };
  });

  return { hosts };
}

function listVariantProfiles(layout: HostFileLayout): string[] {
  if (!fs.existsSync(layout.variantsRoot)) return [];
  return fs
    .readdirSync(layout.variantsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// ── switchProfile ────────────────────────────────────────────────────────

export interface SwitchProfileOptions extends CommonOpts {
  profile: string;
  host?: Host;
  hosts?: readonly Host[];
  dryRun?: boolean;
  /** Test seam only — passed through to lock.acquireLock. */
  lock?: Pick<AcquireLockOptions, "clock" | "identity" | "staleAfterMs">;
}

function matchesGlob(filename: string, glob: string): boolean {
  const starIdx = glob.indexOf("*");
  if (starIdx === -1) return filename === glob;
  const prefix = glob.slice(0, starIdx);
  const suffix = glob.slice(starIdx + 1);
  return (
    filename.length >= prefix.length + suffix.length && filename.startsWith(prefix) && filename.endsWith(suffix)
  );
}

/** Assert the state file's location can be written to, without writing
 * anything — the global precondition that state corruption/unwritability
 * fails before any copy (design F4 amendment). */
function assertStateWritable(stateFilePath: string): void {
  const dir = path.dirname(stateFilePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    throw UnwritableInstallStateError(stateFilePath, (err as Error).message);
  }
  const checkPath = fs.existsSync(stateFilePath) ? stateFilePath : dir;
  try {
    fs.accessSync(checkPath, fs.constants.W_OK);
  } catch (err) {
    throw UnwritableInstallStateError(stateFilePath, (err as Error).message);
  }
}

/** claude/codex: overwrite only massa-ai-owned files present in the
 * variant; never delete a file (massa-ai-owned or not) missing from it. */
function copyFileRouteVariant(layout: HostFileLayout, variantDir: string): number {
  fs.mkdirSync(layout.activeDir, { recursive: true });
  let changed = 0;
  for (const entry of fs.readdirSync(variantDir, { withFileTypes: true })) {
    if (!entry.isFile() || !matchesGlob(entry.name, layout.activeGlob)) continue;
    fs.copyFileSync(path.join(variantDir, entry.name), path.join(layout.activeDir, entry.name));
    changed++;
  }
  return changed;
}

/** opencode (F3): actives stay symlinks — repoint each massa-ai-owned
 * symlink at the new profile's variant file. A regular file where a
 * symlink is expected is user content and is left untouched forever,
 * mirroring `apps/opencode-plugin/install.sh`'s pre-flight; normalizing to
 * a copy would freeze that agent on every future upgrade. */
function repointOpencodeVariant(layout: HostFileLayout, variantDir: string): number {
  fs.mkdirSync(layout.activeDir, { recursive: true });
  let changed = 0;
  for (const entry of fs.readdirSync(variantDir, { withFileTypes: true })) {
    if (!entry.isFile() || !matchesGlob(entry.name, layout.activeGlob)) continue;
    const dest = path.join(layout.activeDir, entry.name);
    const target = path.resolve(path.join(variantDir, entry.name));

    let destExists = true;
    let destIsSymlink = false;
    try {
      destIsSymlink = fs.lstatSync(dest).isSymbolicLink();
    } catch {
      destExists = false;
    }
    if (destExists && !destIsSymlink) continue; // pre-flight: never clobber a regular file

    const tmp = `${dest}.massa-ai-switch.${crypto.randomUUID()}`;
    fs.symlinkSync(target, tmp);
    fs.renameSync(tmp, dest);
    changed++;
  }
  return changed;
}

function copyVariant(host: Host, layout: HostFileLayout, variantDir: string): number {
  return host === "opencode" ? repointOpencodeVariant(layout, variantDir) : copyFileRouteVariant(layout, variantDir);
}

/**
 * Replaces the active installed agent files for every detected, supported
 * host with the chosen profile's variant, per host: validate -> plan ->
 * copy -> record. Host processing follows the fixed `HOSTS` order for
 * stable, deterministic reports.
 */
export function switchProfile(opts: SwitchProfileOptions): SwitchReport {
  const { targetHome, stateFilePath } = resolveCommon(opts);
  const dryRun = opts.dryRun ?? false;
  const requested = opts.host ? [opts.host] : (opts.hosts ?? HOSTS);
  const universe = HOSTS.filter((h) => requested.includes(h));

  // Global precondition: state must be readable (Corrupt propagates before
  // anything else) and, for a real run, writable.
  const state: InstallState = readInstallState(stateFilePath);
  if (!dryRun) assertStateWritable(stateFilePath);

  const layouts = universe.map((host) => ({ host, layout: resolveHostLayout(host, { targetHome, projectRoot: opts.projectRoot }) }));
  const skipRows: HostSwitchResult[] = layouts
    .filter((l) => l.layout.route === "skip")
    .map((l) => ({ host: l.host, status: "skipped" as HostSwitchStatus, reason: (l.layout as { reason: string }).reason }));

  const fileHosts = layouts.filter(
    (l): l is { host: Host; layout: HostFileLayout } => l.layout.route === "files",
  );

  if (fileHosts.length === 0) {
    // e.g. host: "cursor" requested alone — nothing to detect/validate.
    return { profile: opts.profile, dryRun, hosts: orderRows(universe, skipRows), restartRequired: false };
  }

  const installedFileHosts = fileHosts.filter((h) => fs.existsSync(h.layout.activeDir));
  if (installedFileHosts.length === 0) throw NoHostsDetectedError();

  // Unknown-profile check: purely data-driven, independent of route
  // eligibility (a marketplace-refused host still "knows" what it ships).
  const withAvailability = fileHosts.map((h) => {
    const variantsRootExists = fs.existsSync(h.layout.variantsRoot);
    const variantDir = h.layout.variantDir(opts.profile);
    const available = variantsRootExists && fs.existsSync(variantDir) && fs.statSync(variantDir).isDirectory();
    return { ...h, variantsRootExists, variantDir, available };
  });

  if (!withAvailability.some((h) => h.available)) {
    const known = new Set<string>();
    for (const h of withAvailability) {
      if (!h.variantsRootExists) continue;
      for (const name of listVariantProfiles(h.layout)) known.add(name);
    }
    throw UnknownProfileError(opts.profile, [...known].sort());
  }

  const lock = dryRun ? null : acquireLock(stateFilePath, opts.lock);
  try {
    const rows: HostSwitchResult[] = [...skipRows];
    for (const h of withAvailability) {
      if (!h.variantsRootExists) {
        rows.push({ host: h.host, status: "unsupported", reason: "bundle has no variants — upgrade plugin" });
        continue;
      }
      if (!h.available) {
        const supported = listVariantProfiles(h.layout);
        rows.push({
          host: h.host,
          status: "unsupported",
          reason: `profile "${opts.profile}" not supported on ${h.host} (supports: ${supported.join(", ") || "none"})`,
        });
        continue;
      }

      const route = detectRoute(state.platforms[h.host]);
      if (route.kind === "refuse") {
        rows.push({ host: h.host, status: "failed", reason: route.reason });
        continue;
      }

      if (dryRun) {
        rows.push({ host: h.host, status: "switched" });
        continue;
      }

      try {
        const filesChanged = copyVariant(h.host, h.layout, h.variantDir);
        updatePlatform(stateFilePath, h.host, {
          modelProfile: { profile: opts.profile, switchedAt: new Date().toISOString() },
        });
        rows.push({ host: h.host, status: "switched", filesChanged });
      } catch (err) {
        rows.push({ host: h.host, status: "failed", reason: (err as Error).message });
      }
    }

    const ordered = orderRows(universe, rows);
    const restartRequired = !dryRun && ordered.some((r) => r.status === "switched");
    return { profile: opts.profile, dryRun, hosts: ordered, restartRequired };
  } finally {
    lock?.release();
  }
}

function orderRows(universe: readonly Host[], rows: readonly HostSwitchResult[]): HostSwitchResult[] {
  const byHost = new Map(rows.map((r) => [r.host, r] as const));
  return HOSTS.filter((h) => universe.includes(h) && byHost.has(h)).map((h) => byHost.get(h)!);
}
