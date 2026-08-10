/**
 * Per-host active/variant path resolution + install-route detection for the
 * profile-switch engine (design "Component 2 — Switch engine", host path
 * table). This module owns no filesystem access — callers use the returned
 * paths against real fs calls (engine.ts) or fixture temp dirs (tests).
 *
 * Host list is duplicated (not imported) from `scripts/lib/model-profiles.ts`
 * deliberately: that module lives outside `packages/shared`'s publishable
 * source tree, and importing across that boundary would break the package.
 * The four host ids are fixed by the registry/generator contract already.
 */
import os from "node:os";
import path from "node:path";
import type { PlatformRecord } from "./state.js";

export const HOSTS = ["claude", "codex", "cursor", "opencode"] as const;
export type Host = (typeof HOSTS)[number];

export function isHost(v: unknown): v is Host {
  return typeof v === "string" && (HOSTS as readonly string[]).includes(v);
}

/** A host whose agents live on disk as files (claude, codex, opencode). */
export interface HostFileLayout {
  readonly host: Host;
  readonly route: "files";
  /** Directory containing the active `massa-ai-*` agent files. */
  readonly activeDir: string;
  /** Glob suffix identifying massa-ai-owned files in `activeDir`. */
  readonly activeGlob: string;
  /** Root directory holding one subdirectory per shipped profile. */
  readonly variantsRoot: string;
  /** Full path to a given profile's variant directory. */
  variantDir(profile: string): string;
}

/** Cursor: switching changes nothing (every tier resolves to inherit) — the
 * switch layer skips it uniformly, never consulting any path (design
 * Component 1: the generator still emits Cursor variants for parity; this
 * module is the switch-time skip). */
export interface HostSkipLayout {
  readonly host: Host;
  readonly route: "skip";
  readonly reason: string;
}

export type HostLayout = HostFileLayout | HostSkipLayout;

export interface ResolveHostLayoutOpts {
  /** Defaults to `os.homedir()` — the installers' own `$TARGET_HOME` default. */
  targetHome?: string;
  /** Project-local root override per host, mirroring each installer's
   * `--project` flag (`$(pwd)/.claude`, `$(pwd)/.codex`, `$(pwd)/.opencode`).
   * When set for a host, it replaces the whole `$HOME`-derived root for that
   * host — not just a suffix. */
  projectRoot?: Partial<Record<Host, string>>;
  /** Pre-resolved marketplace bundle root per host. Supplied by the caller
   * (engine/variant-sync) so this module keeps owning no fs access. When
   * present for claude, it replaces the whole `$HOME`-derived root —
   * `projectRoot.claude` still keeps precedence over it, since an explicit
   * `--project` override is a stronger statement than a discovered install. */
  marketplaceRoot?: Partial<Record<Host, string>>;
}

const CURSOR_SKIP_REASON = "all tiers inherit — Cursor publishes no resolvable model IDs";

function fileLayout(
  host: Host,
  activeDir: string,
  activeGlob: string,
  variantsRoot: string,
): HostFileLayout {
  return {
    host,
    route: "files",
    activeDir,
    activeGlob,
    variantsRoot,
    variantDir: (profile: string) => path.join(variantsRoot, profile),
  };
}

/** Resolves a host's active/variant paths per the design's host path table. */
export function resolveHostLayout(host: Host, opts: ResolveHostLayoutOpts = {}): HostLayout {
  const targetHome = opts.targetHome ?? os.homedir();
  const override = opts.projectRoot?.[host];

  switch (host) {
    case "cursor":
      return { host, route: "skip", reason: CURSOR_SKIP_REASON };

    case "claude": {
      const marketplaceRoot = opts.marketplaceRoot?.claude;
      if (override === undefined && marketplaceRoot !== undefined) {
        return fileLayout(
          host,
          path.join(marketplaceRoot, "agents"),
          "massa-ai-*.md",
          path.join(marketplaceRoot, "agent-profiles"),
        );
      }
      const root = override ?? path.join(targetHome, ".claude");
      return fileLayout(
        host,
        path.join(root, "agents"),
        "massa-ai-*.md",
        path.join(root, "massa-ai", "agent-profiles"),
      );
    }

    case "codex": {
      const root = override ?? path.join(targetHome, ".codex");
      return fileLayout(
        host,
        path.join(root, "agents"),
        "massa-ai-*.toml",
        path.join(root, "massa-ai", "agent-profiles"),
      );
    }

    case "opencode": {
      const root = override ?? path.join(targetHome, ".config", "opencode");
      const pluginsDir = path.join(root, "plugins", "massa-ai");
      return fileLayout(host, path.join(root, "agents"), "massa-ai-*.md", path.join(pluginsDir, "agent-profiles"));
    }
  }
}

export type RouteDecision = { kind: "proceed" } | { kind: "refuse"; reason: string };

/**
 * F1 route detection. `installRoute` is installer-owned (design Data Model);
 * the engine only ever reads it and never infers a route from file
 * presence/absence — an empty active dir on the marketplace route is
 * indistinguishable from "not installed", so guessing would risk a
 * switched-but-never-read report. Absent field (pre-feature install, or a
 * host never installed) refuses loud with guidance to re-run the installer.
 *
 * `host` is an OPTIONAL TRAILING parameter (pre-mortem #3, binding):
 * `detectRoute` is re-exported from `packages/shared/src/index.ts` and is
 * therefore published `@massa-ai/shared` API. A leading `host` parameter
 * would put a `PlatformRecord` in the host slot for any out-of-tree caller,
 * making `route` read `undefined` and every host refuse. With the parameter
 * trailing and optional, every existing single-argument call compiles and
 * behaves identically, and the marketplace-proceed path activates only when
 * a caller explicitly supplies `host: "claude"` — omitting it keeps today's
 * conservative refusal.
 */
export function detectRoute(platform: PlatformRecord | undefined, host?: Host): RouteDecision {
  const route = platform?.installRoute;
  if (route === "file") return { kind: "proceed" };
  if (route === "marketplace") {
    if (host === "claude") return { kind: "proceed" };
    if (host === "codex") {
      return {
        kind: "refuse",
        reason:
          "codex marketplace-route installs are refused (in-place bundle rewrite would dirty a checkout " +
          "and break the drift gate) — use the dev path: MASSA_AI_MODEL_PROFILE + regenerate.",
      };
    }
    return {
      kind: "refuse",
      reason:
        "claude/codex marketplace-route installs are refused (in-place bundle rewrite would dirty a checkout " +
        "and break the drift gate) — use the dev path: MASSA_AI_MODEL_PROFILE + regenerate.",
    };
  }
  return {
    kind: "refuse",
    reason: "no install route recorded — re-run the installer to record the install route",
  };
}
