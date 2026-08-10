/**
 * Bridges the generated-on-demand plugin variant bundles
 * (`apps/<host>-plugin/agent-profiles/<profile>/`, AD-016 — gitignored
 * build output emitted by `scripts/generate-subagent-artifacts.ts`) into
 * each host's installed `variantsRoot` (`hosts.ts` layout), so "Regenerate
 * Artifacts" actually changes what a subsequent profile switch installs.
 *
 * Without this bridge, nothing copies the regenerated tree into the
 * `variantsRoot` an installed host reads from (measured: an operator's
 * `apps/opencode-plugin/agent-profiles/balanced` carried a freshly
 * regenerated overlay while the installed
 * `~/.config/opencode/plugins/massa-ai/agent-profiles/balanced` still
 * carried a stale v1.41.0 tree) — regenerate would regenerate, then install
 * from the stale tree.
 *
 * No-op without a source checkout (`sourceRoot: null`): every host is
 * reported `"skipped"`. This is the published-install case (npm/marketplace
 * installs never ship `apps/*-plugin/agent-profiles/`), so an end user
 * installing from npm sees zero behaviour change — only a developer running
 * from a checkout (where `getDeploymentRoot()` resolves) gets the bridge.
 *
 * NEVER deletes: a profile directory present in `variantsRoot` but no
 * longer emitted by the source tree is left alone and reported in
 * `retained`.
 *
 * Live-symlink hazard (measured, hosts.ts / engine.ts): an OpenCode active
 * agent is a symlink resolving straight into `variantsRoot/<profile>/<file>`
 * (`engine.ts`'s `repointOpencodeVariant`). A bare `copyFileSync` onto that
 * path is not atomic — a concurrent reader (the live symlink target) can
 * observe a half-written file mid-copy. Every file this module writes goes
 * through a temp file created in the *destination* directory plus
 * `renameSync` — `rename(2)` is atomic only within one directory, which is
 * why the temp file is never `os.tmpdir()`. This mirrors
 * `packages/shared/src/config/config-loader.ts`'s `writeFileAtomically`
 * temp-name shape (pid + monotonic counter + random bytes), duplicated
 * rather than imported: that module resolves the config dir at import time,
 * and this one must stay free of import-time filesystem side effects.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { HOSTS, type Host, resolveHostLayout } from "./hosts.js";
import { readInstallState, type InstallState } from "./state.js";
import { resolveClaudeMarketplaceRoot } from "./claude-marketplace.js";

export interface VariantSyncHostResult {
  readonly host: Host;
  readonly status: "synced" | "skipped" | "failed";
  /** Profile names written this call. */
  readonly profiles: string[];
  /** Installed profiles the source no longer emits — never deleted. */
  readonly retained: string[];
  /** Files written this call. */
  readonly files: number;
  /** Why the host was skipped. */
  readonly reason?: string;
  /** Why the host failed. */
  readonly error?: string;
}

export interface VariantSyncOptions {
  /** Repo root housing `apps/<host>-plugin/agent-profiles/`; `null` skips
   *  every host (the published-install case — see module docblock). */
  readonly sourceRoot: string | null;
  readonly targetHome?: string;
  readonly hosts?: readonly Host[];
}

function defaultStatePath(targetHome: string): string {
  return path.join(targetHome, ".config", "massa-ai", "install-state.json");
}

/**
 * Composes the claude marketplace install root once per call (design § 4c,
 * verbatim — the same helper `engine.ts` carries for `listProfiles` /
 * `switchProfile`, duplicated here rather than exported/imported: both are
 * private, and the state each reads is loaded independently in its own
 * caller). Every host but claude, and every claude install whose recorded
 * route isn't `"marketplace"`, yields an empty map — `resolveHostLayout`
 * then falls through to its normal `$HOME`-derived path, unchanged from
 * before this task. An unresolvable claude root maps `claude` to `undefined`
 * on purpose: `syncHost` treats that identically to "no marketplace root
 * supplied" and falls through to the ordinary `$HOME`-derived layout, which
 * still resolves deterministically to a path a plain (non-marketplace)
 * claude install would use — there is no destructive write to guard against
 * here, unlike `engine.ts`'s CPP-06 special case for `switchProfile`.
 */
function marketplaceRoots(targetHome: string, state: InstallState): Partial<Record<Host, string>> {
  return state.platforms.claude?.installRoute === "marketplace"
    ? { claude: resolveClaudeMarketplaceRoot({ targetHome }) ?? undefined }
    : {};
}

let tempFileCounter = 0;

/**
 * Writes `content` under a unique hidden name inside `destDir`, then
 * `rename(2)`s it over `destName` — atomic within the directory, so a
 * concurrent reader of `destName` (including through a symlink resolving
 * here, per the module docblock) never observes a partial write. Any throw
 * removes the temp file best-effort and leaves no residue on either path.
 */
function writeFileIntoDirAtomically(destDir: string, destName: string, content: Buffer): void {
  const unique = `${process.pid}.${++tempFileCounter}.${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(destDir, `.${destName}.${unique}.tmp`);
  try {
    fs.writeFileSync(tempFile, content);
    fs.renameSync(tempFile, path.join(destDir, destName));
  } catch (error) {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Best effort: the temp file may never have been created.
    }
    throw error;
  }
}

/** A directory name safe to join under `variantsRoot` without escaping it:
 *  no path separators, and not a `.`/`..` traversal segment. Rejected names
 *  are silently skipped — never written, never thrown. */
function isSafeDirName(name: string): boolean {
  if (name === "." || name === "..") return false;
  if (name.includes("/") || name.includes("\\") || name.includes(path.sep)) return false;
  return path.basename(name) === name;
}

function syncHost(
  host: Host,
  sourceRoot: string,
  targetHome: string | undefined,
  marketplaceRoot: Partial<Record<Host, string>>,
): VariantSyncHostResult {
  const layout = resolveHostLayout(host, { targetHome, marketplaceRoot });
  if (layout.route === "skip") {
    return { host, status: "skipped", profiles: [], retained: [], files: 0, reason: layout.reason };
  }

  const srcDir = path.join(sourceRoot, "apps", `${host}-plugin`, "agent-profiles");
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    return { host, status: "skipped", profiles: [], retained: [], files: 0, reason: "no generated variants for this host" };
  }

  // F6: this codebase's own "installed" signal is existsSync(activeDir), NOT
  // variantsRoot — an absent variantsRoot here means no prior switch has
  // ever populated it, not that the host itself is uninstalled. The reason
  // string below must never claim otherwise.
  if (!fs.existsSync(layout.variantsRoot)) {
    return {
      host,
      status: "skipped",
      profiles: [],
      retained: [],
      files: 0,
      reason:
        `variant tree not present at ${layout.variantsRoot} — run the plugin installer ` +
        "or an initial profile switch",
    };
  }

  const profiles: string[] = [];
  let files = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!isSafeDirName(entry.name)) continue; // rejected: never written, never thrown

    const srcProfileDir = path.join(srcDir, entry.name);
    const destProfileDir = path.join(layout.variantsRoot, entry.name);
    fs.mkdirSync(destProfileDir, { recursive: true });

    for (const fileEntry of fs.readdirSync(srcProfileDir, { withFileTypes: true })) {
      if (!fileEntry.isFile()) continue;
      const content = fs.readFileSync(path.join(srcProfileDir, fileEntry.name));
      writeFileIntoDirAtomically(destProfileDir, fileEntry.name, content);
      files++;
    }
    profiles.push(entry.name);
  }

  const retained = fs
    .readdirSync(layout.variantsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !profiles.includes(e.name))
    .map((e) => e.name)
    .sort();

  return { host, status: "synced", profiles: profiles.sort(), retained, files };
}

/**
 * Copies every profile directory `apps/<host>-plugin/agent-profiles/<profile>/`
 * finds under `sourceRoot` into that host's installed `variantsRoot`, for
 * every requested host `resolveHostLayout` resolves to a `"files"` route.
 * Never deletes a directory that only exists on the installed side (see
 * `retained`), and never throws — a per-host failure is caught and reported
 * as `status:"failed"` without aborting the remaining hosts.
 */
export function syncGeneratedVariants(opts: VariantSyncOptions): VariantSyncHostResult[] {
  const hosts = opts.hosts ?? HOSTS;

  if (!opts.sourceRoot) {
    return hosts.map((host) => ({
      host,
      status: "skipped",
      profiles: [],
      retained: [],
      files: 0,
      reason: "no source checkout — nothing to sync",
    }));
  }

  const sourceRoot = opts.sourceRoot;
  const targetHome = opts.targetHome ?? os.homedir();
  // Read-only — never creates install-state.json or its parent directories;
  // a missing file resolves to the empty v2 default (state.ts), so an
  // absent state simply yields an empty marketplaceRoots() map below.
  const state = readInstallState(defaultStatePath(targetHome));
  const roots = marketplaceRoots(targetHome, state);

  return hosts.map((host) => {
    try {
      return syncHost(host, sourceRoot, opts.targetHome, roots);
    } catch (err) {
      return { host, status: "failed", profiles: [], retained: [], files: 0, error: (err as Error).message };
    }
  });
}
