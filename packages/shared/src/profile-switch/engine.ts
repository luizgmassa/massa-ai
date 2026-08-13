/**
 * Model-profile switch engine (design "Component 2 — Switch engine"). The
 * one implementation MCP tools, both config-CLIs, and the OpenCode
 * in-process tool front (later phases) — this module owns no host-specific
 * UI, only fs + state + lock orchestration.
 *
 * Validation order (design): state readable+writable -> hosts detected ->
 * variant availability (unknown-profile check) -> lock acquired -> per-host
 * tracked-path guard -> per-host copy -> per-host state write. Copies happen
 * before that host's state write, and a host's failure never rolls back
 * another host's completed switch (per-host atomicity) — only state-file
 * corruption/unwritability is a global precondition (design F4 amendment).
 *
 * T2b / AC-02.4: the per-host tracked-path guard (`checkTrackedPathGuard`,
 * below) is this engine's runtime replacement for the "would dirty a
 * checkout" refusal `hosts.ts`'s `detectRoute` used to hard-code for codex
 * (D2). Retiring that refusal removed a guard with nothing behind it except
 * one machine's measurement (spec E5); this one checks the actual checkout
 * about to be written, every time.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { HOSTS, type Host, resolveHostLayout, detectRoute, type HostFileLayout } from "./hosts.js";
import { readInstallState, updatePlatform, UnwritableInstallStateError, type InstallState } from "./state.js";
import { acquireLock, type AcquireLockOptions } from "./lock.js";
import { resolveClaudeMarketplaceRoot } from "./claude-marketplace.js";
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

/**
 * Composes the claude marketplace install root once per call (design § 4c,
 * verbatim — shared by `listProfiles`, `switchProfile`, and
 * `variant-sync.ts`'s `syncGeneratedVariants`). Every host but claude, and
 * every claude install whose recorded route isn't `"marketplace"`, yields an
 * empty map — `resolveHostLayout` then falls through to its normal
 * `$HOME`-derived (or `projectRoot`) path, unchanged from before this task.
 * `undefined` for `claude` specifically means "route is marketplace but the
 * root could not be resolved" — callers must special-case that (CPP-06),
 * never pass it through to `resolveHostLayout` expecting a safe fallback.
 */
function marketplaceRoots(targetHome: string, state: InstallState): Partial<Record<Host, string>> {
  return state.platforms.claude?.installRoute === "marketplace"
    ? { claude: resolveClaudeMarketplaceRoot({ targetHome }) ?? undefined }
    : {};
}

/** CPP-06: the reason string for a claude marketplace switch whose install
 * root could not be resolved — names the registry path resolution was
 * attempted against, per spec P1-Claude AC6 ("a reason naming the unresolved
 * path"). */
function claudeMarketplaceUnresolvedReason(targetHome: string): string {
  const registryPath = path.join(targetHome, ".claude", "plugins", "installed_plugins.json");
  return (
    `claude installRoute is "marketplace" but no install root could be resolved from ${registryPath} ` +
    "— re-run the Claude plugin installer, or verify the plugin registry file"
  );
}

// ── listProfiles ─────────────────────────────────────────────────────────

export interface ListProfilesOptions extends CommonOpts {
  hosts?: readonly Host[];
  /** Per-host declared default profile (registry `hostDefaults`, rank 3 of
   *  profile resolution — `scripts/lib/model-profiles.ts:356`). Used only
   *  when a host has no recorded `modelProfile` in install-state: that
   *  value drives what `installActiveProfiles` *writes* on the next
   *  regenerate (not merely what the UI shows), so a caller that can reach
   *  the registry should pass this rather than accept the last-resort
   *  literal below. Omit when the registry is unreachable (e.g. the two
   *  published config-CLIs, which cannot depend on `scripts/lib`) — the
   *  literal is the correct degrade, not a bug to work around. */
  hostDefaults?: Readonly<Record<string, string>>;
}

/**
 * Enumerates installed variant dirs per detected host + reads recorded
 * state. Never touches the registry — every profile name comes from
 * on-disk directories (MPS-02 offline requirement); `opts.hostDefaults` is
 * the one exception, an optional caller-supplied map read only as the
 * fallback for a host with no recorded `modelProfile`.
 *
 * ACCEPTED RISK (plan-critic F3, not fixed here): a host with no recorded
 * `modelProfile` is still auto-installed on the next regenerate — this
 * change only makes that auto-install target the registry's declared
 * default instead of a hardcoded literal. Refusing to auto-install an
 * unswitched host at all would be a separate, unrequested behaviour change.
 */
export function listProfiles(opts: ListProfilesOptions = {}): ProfileInventory {
  const { targetHome, stateFilePath } = resolveCommon(opts);
  const state = readInstallState(stateFilePath);
  const roots = marketplaceRoots(targetHome, state);
  const universe = opts.hosts ?? HOSTS;

  const hosts: HostProfileState[] = universe.map((host) => {
    // CPP-06: a marketplace route whose install root is unresolvable reports
    // installed:false with no available profiles — never the file-route
    // fallback resolveHostLayout would otherwise compute for claude.
    if (host === "claude" && state.platforms.claude?.installRoute === "marketplace" && roots.claude === undefined) {
      const platform = state.platforms.claude;
      return {
        host,
        installed: false,
        skipped: false,
        skipReason: null,
        activeProfile: platform.modelProfile?.profile ?? opts.hostDefaults?.[host] ?? "balanced",
        bundleVersion: platform.plugin?.version ?? null,
        availableProfiles: [],
      };
    }
    const layout = resolveHostLayout(host, { targetHome, projectRoot: opts.projectRoot, marketplaceRoot: roots });
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
      activeProfile: platform?.modelProfile?.profile ?? opts.hostDefaults?.[host] ?? "balanced",
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

/** The massa-ai-owned filenames a switch of this host would write into
 * `dir` — shared by both copy strategies below and by the tracked-path
 * guard, so the guard checks exactly what is about to be written, no more
 * and no less. */
function matchingFileNames(dir: string, glob: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && matchesGlob(e.name, glob))
    .map((e) => e.name);
}

// ── T2b / AC-02.4: runtime tracked-path guard ───────────────────────────
//
// D2 retired the "would dirty a checkout" refusal that used to block a
// codex marketplace switch outright — that premise held only while plugin
// bundles were checked in, and AD-016 made them gitignored generated output
// on this machine (spec E5). But E5 measured ONE machine: a checkout
// predating AD-016, a fork made before it, or a user who deliberately
// committed a generated bundle file would still be dirtied by an in-place
// rewrite. This guard is what makes the retirement safe generally rather
// than only on the author's machine — it runs right before a host's files
// are overwritten, scoped to what is actually true of THIS checkout.

/** Distinguishes "git isn't installed at all" (ENOENT) from "git is
 * installed but `dir` isn't inside a work tree" — the two cases the guard
 * must tell apart, since only the former is truly "could not check"
 * (AC-02.4); the latter is a definite, verified "nothing here is tracked." */
function detectGitAvailability(dir: string): "no-git" | "not-a-repo" | "in-repo" {
  try {
    const out = execFileSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.toString().trim() === "true" ? "in-repo" : "not-a-repo";
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" ? "no-git" : "not-a-repo";
  }
}

/** Of `filenames` (relative to `dir`), returns the subset git's index
 * already tracks in the repo `dir` belongs to. Never throws — a git failure
 * here is treated as "nothing tracked" rather than blocking a switch on an
 * unrelated git error. */
function gitTrackedFileNames(dir: string, filenames: readonly string[]): Set<string> {
  if (filenames.length === 0) return new Set();
  try {
    const out = execFileSync("git", ["-C", dir, "ls-files", "--", ...filenames], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Set(
      out
        .toString()
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

/** Result of the T2b guard for one host's about-to-be-overwritten files. */
interface TrackedPathGuardResult {
  /** true when a destination file is confirmed git-tracked — the caller
   *  must refuse the write and name `path`. */
  readonly blocked: boolean;
  readonly path?: string;
  /** true when git itself was unavailable and the guard could not verify
   *  anything — the caller proceeds, but must record this rather than
   *  reporting success as if the guard had actually run (AC-02.4). */
  readonly unchecked: boolean;
}

const GUARD_PASS: TrackedPathGuardResult = { blocked: false, unchecked: false };
const GUARD_UNCHECKED: TrackedPathGuardResult = { blocked: false, unchecked: true };

/**
 * Before `filenames` are overwritten in `activeDir`, verifies none of them
 * is a git-tracked path. `activeDir` not existing yet (first-ever install)
 * or `filenames` being empty short-circuits to a pass — there is nothing to
 * dirty. A directory that exists but isn't inside a git work tree is also a
 * verified pass, not "unchecked": there is definitively no git to dirty
 * there. Only a missing `git` binary is genuinely unverifiable (AC-02.4).
 */
function checkTrackedPathGuard(activeDir: string, filenames: readonly string[]): TrackedPathGuardResult {
  if (filenames.length === 0 || !fs.existsSync(activeDir)) return GUARD_PASS;

  const availability = detectGitAvailability(activeDir);
  if (availability === "no-git") return GUARD_UNCHECKED;
  if (availability === "not-a-repo") return GUARD_PASS;

  const tracked = gitTrackedFileNames(activeDir, filenames);
  if (tracked.size === 0) return GUARD_PASS;
  const offending = filenames.find((name) => tracked.has(name));
  return { blocked: true, path: path.join(activeDir, offending!), unchecked: false };
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

  const roots = marketplaceRoots(targetHome, state);

  // CPP-06: a claude marketplace route whose install root cannot be resolved
  // fails loud, naming the unresolved registry path, and is excluded from
  // layout resolution entirely — never falling through to resolveHostLayout's
  // file-route defaults for claude.
  const unresolvedRows: HostSwitchResult[] = [];
  const resolvableUniverse = universe.filter((host) => {
    if (host !== "claude") return true;
    if (state.platforms.claude?.installRoute !== "marketplace") return true;
    if (roots.claude !== undefined) return true;
    unresolvedRows.push({ host, status: "failed", reason: claudeMarketplaceUnresolvedReason(targetHome) });
    return false;
  });

  const layouts = resolvableUniverse.map((host) => ({
    host,
    layout: resolveHostLayout(host, { targetHome, projectRoot: opts.projectRoot, marketplaceRoot: roots }),
  }));
  const skipRows: HostSwitchResult[] = [
    ...unresolvedRows,
    ...layouts
      .filter((l) => l.layout.route === "skip")
      .map((l) => ({ host: l.host, status: "skipped" as HostSwitchStatus, reason: (l.layout as { reason: string }).reason })),
  ];

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

      const route = detectRoute(state.platforms[h.host], h.host);
      if (route.kind === "refuse") {
        rows.push({ host: h.host, status: "failed", reason: route.reason });
        continue;
      }

      if (dryRun) {
        rows.push({ host: h.host, status: "switched" });
        continue;
      }

      // T2b / AC-02.4: the runtime replacement for the refusal D2 retired —
      // right before this host's files are overwritten, refuse a write that
      // would dirty a git-tracked path in the destination checkout.
      const candidateNames = matchingFileNames(h.variantDir, h.layout.activeGlob);
      const guard = checkTrackedPathGuard(h.layout.activeDir, candidateNames);
      if (guard.blocked) {
        rows.push({
          host: h.host,
          status: "failed",
          reason: `refusing to write ${guard.path} — it is tracked by git and this switch would dirty the checkout`,
        });
        continue;
      }

      try {
        const filesChanged = copyVariant(h.host, h.layout, h.variantDir);
        updatePlatform(stateFilePath, h.host, {
          modelProfile: { profile: opts.profile, switchedAt: new Date().toISOString() },
        });
        rows.push({
          host: h.host,
          status: "switched",
          filesChanged,
          ...(guard.unchecked
            ? { reason: "tracked-path guard could not verify (git unavailable) — proceeded unchecked" }
            : {}),
        });
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
