/**
 * Result shapes returned by the switch engine (engine.ts). Kept separate
 * from engine.ts so any future front (CLI/route/MCP — later phases) can
 * depend on the report shape without pulling in fs/lock machinery.
 */
import type { Host } from "./hosts.js";

/** Per-host row of a `listProfiles()` inventory. `installed`/`availableProfiles`
 * come from on-disk variant directories only — never the registry
 * (MPS-02: offline-capable). */
export interface HostProfileState {
  readonly host: Host;
  readonly installed: boolean;
  readonly skipped: boolean;
  readonly skipReason: string | null;
  /** Recorded active profile, defaulting to "balanced" when no record
   * exists (P1 AC7). `null` for a skipped host (e.g. Cursor). */
  readonly activeProfile: string | null;
  /** From the existing `plugin.version` field (design C1) — never a
   * separately-recorded `bundleVersion`. */
  readonly bundleVersion: string | null;
  readonly availableProfiles: readonly string[];
}

export interface ProfileInventory {
  readonly hosts: readonly HostProfileState[];
}

export type HostSwitchStatus = "switched" | "skipped" | "unsupported" | "failed";

export interface HostSwitchResult {
  readonly host: Host;
  readonly status: HostSwitchStatus;
  readonly reason?: string;
  readonly filesChanged?: number;
}

export interface SwitchReport {
  readonly profile: string;
  readonly dryRun: boolean;
  readonly hosts: readonly HostSwitchResult[];
  /** True only for a real (non-dry-run) run with at least one "switched" row
   * (P1 AC2 — session restart required to take effect). */
  readonly restartRequired: boolean;
}

/** True when every host row is "switched" or "skipped" — no "unsupported"/
 * "failed" rows. Callers (CLI/route/MCP — later tasks) use this to decide a
 * non-zero exit for a partial multi-host failure, per the design's Error
 * Handling Strategy table ("mixed report" / "non-zero exit"). */
export function reportSucceeded(report: SwitchReport): boolean {
  return report.hosts.every((h) => h.status === "switched" || h.status === "skipped");
}
