/**
 * Model profile registry — load, validate, select, resolve.
 *
 * The registry (`skills/model-profiles.json`) is the ONLY hand-authored place that names a
 * model or an effort level for any host. This module turns it into resolved `{model, effort}`
 * pairs. It knows nothing about host FILE SYNTAX — rendering a pair into `effort: high` vs
 * `model_reasoning_effort = "high"` vs a `[effort=high]` bracket parameter belongs to the
 * emitters in `scripts/generate-subagent-artifacts.ts`.
 *
 * V2 shape: a `models` catalog (dropdown options only — cells never reference it, D4) plus
 * `profiles`, each with a per-host default cell and optional per-agent overrides. Resolution
 * for an agent on a tool is `profile.agents[agent][host]` first, then `profile.hosts[host]`
 * (`resolveAgent`). A cell stores the RESOLVED model string directly, never a catalog id, so
 * a reference can never dangle.
 *
 * Every failure is a named error. Nothing falls back to a default model, ever — a typo in a
 * profile name must stop the build, not silently ship a different model to users.
 *
 * No dependency outside node:fs / node:path, so this runs in the deterministic gate and
 * without node_modules.
 */

import { readFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { configDir } from "../../packages/shared/src/config/xdg.ts";

// ── Hosts ───────────────────────────────────────────────────────────────────
export const HOSTS = ["claude", "codex", "cursor", "opencode"] as const;
export type Host = (typeof HOSTS)[number];

export function isHost(v: unknown): v is Host {
  return typeof v === "string" && (HOSTS as readonly string[]).includes(v);
}

// ── Resolved pair (a "cell") ─────────────────────────────────────────────────
/** `model: null` / `effort: null` mean "do not pin — inherit". Rendered per host. */
export interface Resolved {
  readonly model: string | null;
  readonly effort: string | null;
}
export type Cell = Resolved;

// ── Catalog ──────────────────────────────────────────────────────────────────
/** A dropdown option (D2/D4). Keyed by id in the registry — the id is an overlay merge key
 *  only, never stored in a cell. `context1m` is valid only when `host === "claude"`. */
export interface ModelEntry {
  readonly name: string;
  readonly host: Host;
  readonly provider: string;
  readonly model: string;
  readonly context1m?: boolean;
}

/** `(provider ? provider + "/" : "") + model + (context1m ? "[1m]" : "")` — the one function
 *  that builds a resolved model string from a catalog entry. Server and UI both call this. */
export function resolvedModelString(entry: {
  readonly provider: string;
  readonly model: string;
  readonly context1m?: boolean;
}): string {
  return (entry.provider ? entry.provider + "/" : "") + entry.model + (entry.context1m ? "[1m]" : "");
}

export interface Profile {
  readonly description: string;
  readonly hosts: { readonly [host: string]: Cell };
  /** Per-agent overrides (D1), keyed by agent name then host. This lib knows nothing about
   *  which agents exist (see file header), so agent-name validity is not checked here — the
   *  generator warns instead. */
  readonly agents?: { readonly [agent: string]: { readonly [host: string]: Cell } };
}

export interface Registry {
  readonly version: number;
  readonly models: { readonly [id: string]: ModelEntry };
  readonly profiles: { readonly [name: string]: Profile };
}

// ── Documented per-host effort enums ────────────────────────────────────────
// Each entry cites the doc that defines it. A value outside the host's enum is
// InvalidEffortError — we never ship an effort string a host will reject or ignore.
//
//   claude   effort: low|medium|high|xhigh|max
//            https://code.claude.com/docs/en/sub-agents.md
//   codex    model_reasoning_effort = "minimal|low|medium|high|xhigh"
//            https://learn.chatgpt.com/docs/config-file/config-reference
//   cursor   NO effort key exists. Effort is a bracket parameter on a model id
//            (`claude-opus-5[effort=high]`), so an effort is only meaningful when a
//            model id is pinned. Bracket syntax on `inherit` is undocumented.
//            https://cursor.com/docs/subagents.md
//   opencode reasoningEffort is a generic provider pass-through. opencode.ai/docs/models
//            documents enums for Anthropic/OpenAI/Google providers; the opencode-go
//            provider's values were initially unenumerated. The shipped registry only
//            uses "high" and "max" (all opencode-go entries), and the user requested a
//            constrained dropdown for UI consistency. The enum below is the union of
//            standard tier names used across the registry, accepting the trade-off that
//            a future provider may need a value outside this list (which would then be
//            a validation error to be added to the enum, not a silent pass-through).
//            https://opencode.ai/docs/agents/
export const HOST_EFFORT_ENUM: Readonly<Record<Host, readonly string[] | null>> = {
  claude: ["low", "medium", "high", "xhigh", "max"],
  codex: ["minimal", "low", "medium", "high", "xhigh"],
  cursor: [],
  opencode: ["low", "medium", "high", "max"],
};

// ── Errors ──────────────────────────────────────────────────────────────────
export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

/** Thrown once, listing every violation found — a registry with six mistakes should take
 *  one edit/run cycle to fix, not six. */
export class RegistryValidationError extends RegistryError {
  readonly violations: readonly string[];
  constructor(violations: readonly string[]) {
    super(
      `model-profiles registry is invalid (${violations.length} violation(s)):\n` +
        violations.map((v) => `  - ${v}`).join("\n"),
    );
    this.name = "RegistryValidationError";
    this.violations = violations;
  }
}

function namedError(name: string, message: string): RegistryError {
  const e = new RegistryError(message);
  e.name = name;
  return e;
}

export const UnknownProfileError = (profile: string, known: readonly string[]) =>
  namedError(
    "UnknownProfileError",
    `unknown profile "${profile}". Known profiles: ${known.join(", ")}. ` +
      `Profiles are data in skills/model-profiles.json — add it there rather than expecting a fallback.`,
  );

export const MissingHostError = (profile: string, host: string, supported: readonly string[]) =>
  namedError(
    "MissingHostError",
    `profile "${profile}" does not support host "${host}" (supports: ${supported.join(", ") || "none"}). ` +
      `This is deliberate for host-specific profiles; pick a profile that supports ${host}.`,
  );

export const InvalidEffortError = (where: string, host: Host, effort: string | null) =>
  namedError(
    "InvalidEffortError",
    `invalid effort ${JSON.stringify(effort)} at ${where}: host "${host}" accepts ` +
      (HOST_EFFORT_ENUM[host] === null
        ? "any non-empty string"
        : HOST_EFFORT_ENUM[host]!.length === 0
          ? "only null (this host has no effort key)"
          : `one of ${HOST_EFFORT_ENUM[host]!.join(", ")}, or null`),
  );

// ── Validation ──────────────────────────────────────────────────────────────
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateCell(raw: unknown, where: string, hostName: string): string[] {
  const errs: string[] = [];
  if (!isPlainObject(raw)) {
    errs.push(`${where} is not an object`);
    return errs;
  }
  const model = raw.model;
  const effort = raw.effort;
  if (!(model === null || (typeof model === "string" && model.trim() !== ""))) {
    errs.push(`${where}.model must be a non-empty string or null`);
  }
  if (!(effort === null || (typeof effort === "string" && effort.trim() !== ""))) {
    errs.push(`${where}.effort must be a non-empty string or null`);
  } else if (isHost(hostName)) {
    const err = effortViolation(hostName, model, effort as string | null, where);
    if (err) errs.push(err);
  }
  return errs;
}

/**
 * Validate a parsed registry, collecting EVERY violation before throwing.
 * Returns the value narrowed to `Registry` on success.
 */
export function validateRegistry(raw: unknown): Registry {
  const v: string[] = [];

  if (!isPlainObject(raw)) throw new RegistryValidationError(["registry root is not an object"]);

  if (raw.version !== 2) v.push(`version must be 2, got ${JSON.stringify(raw.version)}`);

  // models — the dropdown catalog. Cells are never cross-checked against it (D4).
  const models = raw.models;
  if (!isPlainObject(models)) {
    v.push("models must be an object (may be empty)");
  } else {
    for (const [id, mRaw] of Object.entries(models)) {
      const where = `models.${id}`;
      if (!isPlainObject(mRaw)) {
        v.push(`${where} is not an object`);
        continue;
      }
      if (typeof mRaw.name !== "string" || mRaw.name.trim() === "") {
        v.push(`${where}.name is required and must be a non-empty string`);
      }
      if (!isHost(mRaw.host)) {
        v.push(`${where}.host is not a known host (${HOSTS.join(", ")})`);
      }
      if (typeof mRaw.provider !== "string") {
        v.push(`${where}.provider must be a string (may be empty)`);
      }
      if (typeof mRaw.model !== "string" || mRaw.model.trim() === "") {
        v.push(`${where}.model must be a non-empty string`);
      }
      if (mRaw.context1m !== undefined) {
        if (typeof mRaw.context1m !== "boolean") {
          v.push(`${where}.context1m must be a boolean`);
        } else if (mRaw.context1m && mRaw.host !== "claude") {
          v.push(`${where}.context1m is only allowed when host is "claude"`);
        }
      }
    }
  }

  // profiles
  const profiles = raw.profiles;
  if (!isPlainObject(profiles) || Object.keys(profiles).length === 0) {
    throw new RegistryValidationError(["profiles must be a non-empty object"]);
  }
  if (!isPlainObject(profiles.balanced)) {
    v.push(`profiles.balanced is required`);
  }

  for (const [pName, pRaw] of Object.entries(profiles)) {
    if (!isPlainObject(pRaw)) {
      v.push(`profiles.${pName} is not an object`);
      continue;
    }
    if (typeof pRaw.description !== "string" || pRaw.description.trim() === "") {
      v.push(`profiles.${pName}.description is required and must be a non-empty string`);
    }
    const hosts = pRaw.hosts;
    if (!isPlainObject(hosts) || Object.keys(hosts).length === 0) {
      v.push(`profiles.${pName}.hosts must be a non-empty object`);
    } else {
      for (const [hName, cellRaw] of Object.entries(hosts)) {
        if (!isHost(hName)) {
          v.push(`profiles.${pName}.hosts.${hName} is not a known host (${HOSTS.join(", ")})`);
          continue;
        }
        v.push(...validateCell(cellRaw, `profiles.${pName}.hosts.${hName}`, hName));
      }
    }

    const agents = pRaw.agents;
    if (agents !== undefined) {
      if (!isPlainObject(agents)) {
        v.push(`profiles.${pName}.agents must be an object`);
      } else {
        for (const [aName, aRaw] of Object.entries(agents)) {
          if (!isPlainObject(aRaw)) {
            v.push(`profiles.${pName}.agents.${aName} is not an object`);
            continue;
          }
          for (const [hName, cellRaw] of Object.entries(aRaw)) {
            if (!isHost(hName)) {
              v.push(`profiles.${pName}.agents.${aName}.${hName} is not a known host (${HOSTS.join(", ")})`);
              continue;
            }
            v.push(...validateCell(cellRaw, `profiles.${pName}.agents.${aName}.${hName}`, hName));
          }
        }
      }
    }
  }

  if (v.length > 0) throw new RegistryValidationError(v);
  return raw as unknown as Registry;
}

/**
 * Effort legality for a host, given whether a model is pinned.
 *
 * Cursor is the interesting case: it has no effort key at all, so an effort is only
 * expressible as a bracket parameter on a pinned model id. With `model: null` (inherit)
 * there is nowhere to put one, and bracket syntax on `inherit` is undocumented — so an
 * effort alongside a null model is rejected rather than silently dropped.
 */
export function effortViolation(
  host: Host,
  model: unknown,
  effort: string | null,
  where: string,
): string | null {
  const enumFor = HOST_EFFORT_ENUM[host];
  if (effort === null) return null;
  if (host === "cursor") {
    if (model === null) {
      return `${where}.effort must be null when model is null: Cursor has no effort key, and effort is only expressible as a bracket parameter on a pinned model id`;
    }
    return null; // rendered as [effort=...] on the id
  }
  if (enumFor === null) return null; // no enum for this host (none currently; was opencode)
  if (enumFor.length === 0) return `${where}.effort must be null for host "${host}"`;
  if (!enumFor.includes(effort)) {
    return `${where}.effort ${JSON.stringify(effort)} is not one of ${enumFor.join(", ")} for host "${host}"`;
  }
  return null;
}

// ── v1 detection and backup (D5) ─────────────────────────────────────────────
const V1_MARKER_KEYS = ["tiers", "hostDefaults", "workflowTiers", "agentTiers"] as const;

/** A v1 registry/overlay carries a v1-only top-level key, or a `hosts.<host>` leaf shaped
 *  like a tier map (no `model` key) rather than a cell. Detection only needs one profile's
 *  one host to prove the shape, so it returns on the first hit. */
export function isV1Shaped(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (V1_MARKER_KEYS.some((k) => k in raw)) return true;
  const profiles = raw.profiles;
  if (!isPlainObject(profiles)) return false;
  for (const pRaw of Object.values(profiles)) {
    if (!isPlainObject(pRaw)) continue;
    const hosts = pRaw.hosts;
    if (!isPlainObject(hosts)) continue;
    for (const hRaw of Object.values(hosts)) {
      if (isPlainObject(hRaw) && !("model" in hRaw)) return true;
    }
  }
  return false;
}

/** Renames a v1 overlay out of the way (D5) — `model-profiles.v1.json`, or
 *  `model-profiles.v1.<epoch>.json` if that name is already taken. Returns the backup path.
 *  This is the read path's only mutation, and it happens once per load. */
export function backupV1Overlay(overlayPath: string): string {
  const dir = path.dirname(overlayPath);
  let target = path.join(dir, "model-profiles.v1.json");
  if (existsSync(target)) {
    target = path.join(dir, `model-profiles.v1.${Date.now()}.json`);
  }
  renameSync(overlayPath, target);
  return target;
}

// ── Loading ─────────────────────────────────────────────────────────────────
export const DEFAULT_REGISTRY_PATH = path.join(
  path.resolve(import.meta.dirname, "..", ".."),
  "skills",
  "model-profiles.json",
);

export function loadRegistry(file: string = DEFAULT_REGISTRY_PATH): Registry {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new RegistryError(`cannot read model registry at ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new RegistryError(`model registry at ${file} is not valid JSON: ${(e as Error).message}`);
  }
  return validateRegistry(parsed);
}

// ── Profile selection ───────────────────────────────────────────────────────
export interface SelectOpts {
  /** `--profile=<name>` from argv. Highest precedence. */
  readonly flag?: string | null;
  /** Injected for tests; defaults to process.env. */
  readonly env?: Record<string, string | undefined>;
  /**
   * The host's recorded active profile from `install-state.json`
   * (`platforms.<host>.modelProfile.profile`), threaded in by callers that
   * hold the state — `selectProfile` stays fs-free. Rank 3 of 4: the switch
   * engine records operator intent, so a regeneration must not silently
   * reset the actives to the registry's per-host default (agent-drift followup T1 —
   * measured 2026-09-21: a post-switch regeneration re-emitted actives from the
   * registry default, and the session-start drift hook caught the divergence).
   */
  readonly stateProfile?: string | null;
}

export const PROFILE_ENV_VAR = "MASSA_AI_MODEL_PROFILE";

/**
 * Precedence, first match wins: `--profile` > MASSA_AI_MODEL_PROFILE >
 * stateProfile (install-state's recorded `modelProfile`) > `"balanced"`.
 * An unknown name at any rank throws.
 *
 * Selection also verifies the profile SUPPORTS this host, so `--profile=open_models` fails
 * before a single file is written rather than partway through emitting 60 of them.
 */
export function selectProfile(registry: Registry, host: Host, opts: SelectOpts = {}): string {
  const env = opts.env ?? process.env;
  const raw =
    opts.flag?.trim() || env[PROFILE_ENV_VAR]?.trim() || opts.stateProfile?.trim() || "balanced";
  const known = Object.keys(registry.profiles);
  const profile = registry.profiles[raw];
  if (!profile) throw UnknownProfileError(raw, known);
  if (!(host in profile.hosts)) {
    throw MissingHostError(raw, host, Object.keys(profile.hosts));
  }
  return raw;
}

/** Parse `--profile=x` / `--profile x` out of an argv slice. Returns null when absent. */
export function profileFlagFrom(argv: readonly string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a.startsWith("--profile=")) return a.slice("--profile=".length);
    if (a === "--profile") return argv[i + 1] ?? "";
  }
  return null;
}

// ── Resolution ──────────────────────────────────────────────────────────────
/** Resolution for an agent on a host: `profile.agents[agent][host]` first, then
 *  `profile.hosts[host]` (spec D1/Registry v2 shape). `agent` is a bare name, unchecked
 *  against any charter list — this lib knows nothing about which agents exist. */
export function resolveAgent(registry: Registry, host: Host, profile: string, agent: string): Resolved {
  const p = registry.profiles[profile];
  if (!p) throw UnknownProfileError(profile, Object.keys(registry.profiles));
  const hostCell = p.hosts[host];
  if (!hostCell) throw MissingHostError(profile, host, Object.keys(p.hosts));
  const override = p.agents?.[agent]?.[host];
  return override ?? hostCell;
}

/** Hosts a profile supports, sorted. Used by docs generation and the CLI's error text. */
export function hostsSupportedBy(registry: Registry, profile: string): Host[] {
  const p = registry.profiles[profile];
  if (!p) throw UnknownProfileError(profile, Object.keys(registry.profiles));
  return HOSTS.filter((h) => h in p.hosts);
}

// ── Effective registry (builtin + overlay) ──────────────────────────────────

export type OverlayModelEntry = ModelEntry;

export interface OverlayCellMap {
  readonly [host: string]: Cell | null;
}
export interface OverlayProfile {
  readonly description?: string;
  readonly hosts?: OverlayCellMap;
  readonly agents?: Record<string, OverlayCellMap | null>;
  readonly _delete?: true;
}

/** `null` is the tombstone (design D-1): key absent means "inherit the builtin's value", key
 *  present non-null means "override", key present `null` means "delete this key from the
 *  merged registry". `models.<id> = null` tombstones the whole catalog entry. */
export interface OverlayData {
  readonly models?: Record<string, OverlayModelEntry | null>;
  readonly profiles?: Record<string, OverlayProfile>;
}

/** Per-category breakdown of surviving overlay entries — one key per top-level
 *  `OverlayData` key `normalizeOverlay` handles, so the UI never has to re-derive the
 *  counting rule to say *where* an override lives. Values sum to `overlayOverrideCount`. */
export interface OverlayOverrideBreakdown {
  readonly models: number;
  readonly profiles: number;
}

function zeroBreakdown(): OverlayOverrideBreakdown {
  return { models: 0, profiles: 0 };
}

export interface EffectiveRegistryResult {
  readonly registry: Registry;
  readonly source: {
    readonly builtin: Registry;
    readonly overlay: OverlayData | null;
    readonly tombstoned: string[];
  };
  /** Count of overlay entries that survive normalization — how much of the registry the
   *  operator's overlay is actually overriding, after collapsing entries that are
   *  byte-identical to the current builtin. `0` when there is no overlay. */
  readonly overlayOverrideCount: number;
  /** The same count, broken down per category, so the UI can mark exactly which overlay
   *  sections are non-empty rather than re-deriving the counting rule. */
  readonly overlayOverrideBreakdown: OverlayOverrideBreakdown;
  readonly overlayError?: string;
  /** Set when a v1 overlay was found and backed up on this load (D5/D7). */
  readonly v1BackupPath?: string;
}

function isOverlayProfile(v: unknown): v is OverlayProfile {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function loadEffectiveRegistry(opts?: { readonly overlayPath?: string }): EffectiveRegistryResult {
  const builtin = loadRegistry(DEFAULT_REGISTRY_PATH);
  const overlayPath = opts?.overlayPath ?? path.join(configDir("massa-ai"), "model-profiles.json");

  if (!existsSync(overlayPath)) {
    return {
      registry: builtin,
      source: { builtin, overlay: null, tombstoned: [] },
      overlayOverrideCount: 0,
      overlayOverrideBreakdown: zeroBreakdown(),
    };
  }

  let overlayRaw: unknown;
  try {
    const text = readFileSync(overlayPath, "utf8");
    overlayRaw = JSON.parse(text);
  } catch (e) {
    console.warn(`[massa-ai] Overlay parse failure at ${overlayPath}: ${(e as Error).message}`);
    return {
      registry: builtin,
      source: { builtin, overlay: null, tombstoned: [] },
      overlayOverrideCount: 0,
      overlayOverrideBreakdown: zeroBreakdown(),
      overlayError: `overlay parse failed: ${(e as Error).message}`,
    };
  }

  if (!isPlainObject(overlayRaw)) {
    console.warn(`[massa-ai] Overlay at ${overlayPath} is not an object`);
    return {
      registry: builtin,
      source: { builtin, overlay: null, tombstoned: [] },
      overlayOverrideCount: 0,
      overlayOverrideBreakdown: zeroBreakdown(),
      overlayError: "overlay root is not an object",
    };
  }

  // v1 overlay (D5): detected once, backed up once, and the builtin is used for this load.
  if (isV1Shaped(overlayRaw)) {
    const backupPath = backupV1Overlay(overlayPath);
    console.warn(
      `[massa-ai] Overlay at ${overlayPath} is a v1 (tiers-based) format, no longer supported. ` +
        `It has been renamed to ${backupPath} and the built-in registry is used instead.`,
    );
    return {
      registry: builtin,
      source: { builtin, overlay: null, tombstoned: [] },
      overlayOverrideCount: 0,
      overlayOverrideBreakdown: zeroBreakdown(),
      v1BackupPath: backupPath,
    };
  }

  const overlay = overlayRaw as OverlayData;
  const merged = mergeOverlay(builtin, overlay);

  try {
    const validated = validateRegistry(merged);
    const normalizedOverlay = normalizeOverlay(builtin, overlay);
    const { total, breakdown } = countOverlayEntries(normalizedOverlay);
    return {
      registry: validated,
      source: {
        builtin,
        overlay: normalizedOverlay,
        tombstoned: collectTombstoned(builtin, overlay),
      },
      overlayOverrideCount: total,
      overlayOverrideBreakdown: breakdown,
    };
  } catch (e) {
    console.warn(`[massa-ai] Overlay merge validation failed: ${(e as Error).message}`);
    return {
      registry: builtin,
      source: { builtin, overlay: null, tombstoned: [] },
      overlayOverrideCount: 0,
      overlayOverrideBreakdown: zeroBreakdown(),
      overlayError: `overlay validation failed: ${(e as Error).message}`,
    };
  }
}

function collectTombstoned(builtin: Registry, overlay: OverlayData): string[] {
  if (!overlay.profiles) return [];
  const tombstoned: string[] = [];
  for (const [key, val] of Object.entries(overlay.profiles)) {
    if (isOverlayProfile(val) && val._delete === true && key in builtin.profiles) {
      tombstoned.push(key);
    }
  }
  return tombstoned;
}

/**
 * Overlay + builtin -> merged registry (design D-1). The overlay is a *delta*:
 * `models.<id>` is replaced whole (a `null` value tombstones it), and a profile merges per
 * `hosts.<host>` leaf and per `agents.<agent>.<host>` leaf — an absent key inherits the
 * builtin's value, a `null` leaf tombstones it. A profile's `_delete: true` tombstones the
 * whole profile.
 *
 * The route (`apps/tools-api/src/routes/model-registry.ts`) calls this directly through
 * `profilesLib()` rather than keeping a hand-copied twin — identical input cannot produce
 * differing output when there is only one implementation.
 */
export function mergeOverlay(builtin: Registry, overlay: OverlayData): Record<string, unknown> {
  const result: Record<string, unknown> = JSON.parse(JSON.stringify(builtin));

  if (overlay.models) {
    result.models = mergeFlatMap(builtin.models, overlay.models);
  }

  if (overlay.profiles) {
    const profiles = result.profiles as Record<string, unknown>;
    for (const [key, val] of Object.entries(overlay.profiles)) {
      if (!isOverlayProfile(val)) continue;
      if (val._delete === true) {
        delete profiles[key];
        continue;
      }
      profiles[key] = mergeProfile(builtin.profiles[key], val);
    }
    result.profiles = profiles;
  }

  return result;
}

/** Per-key merge of a flat `{key: value}` map against the builtin. A `null` overlay value
 *  deletes the key from the result; every other builtin key not mentioned in the overlay is
 *  retained. Reused for both `models` (whole-entry replace) and, one level deeper, for a
 *  profile's `hosts`/`agents.<agent>` cell maps. */
function mergeFlatMap<T>(
  builtin: { readonly [key: string]: T },
  overlay: Record<string, T | null>,
): Record<string, T> {
  const result: Record<string, T> = { ...builtin };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Per-agent, per-host merge of a profile's `agents` overlay — mirrors `mergeFlatMap` one
 *  level deeper. `overlay[agent] === null` deletes the whole agent entry; otherwise the
 *  agent's host cell map is merged against the builtin's via `mergeFlatMap` itself, so a
 *  host-level `null` tombstones just that key and an absent host key inherits. */
function mergeAgents(
  builtin: { readonly [agent: string]: { readonly [host: string]: Cell } },
  overlay: Record<string, OverlayCellMap | null>,
): Record<string, Record<string, Cell>> {
  const result: Record<string, Record<string, Cell>> = {};
  for (const [agent, hostMap] of Object.entries(builtin)) {
    result[agent] = { ...hostMap };
  }
  for (const [agent, value] of Object.entries(overlay)) {
    if (value === null) {
      delete result[agent];
      continue;
    }
    result[agent] = mergeFlatMap(builtin[agent] ?? {}, value);
  }
  return result;
}

/** Merge one overlay profile against its builtin counterpart, per host cell and per
 *  agent/host cell. A host or agent the overlay does not mention is retained from the
 *  builtin. A profile the builtin does not have (a genuinely new profile) passes through
 *  as-is. */
function mergeProfile(builtinProfile: Profile | undefined, overlayProfile: OverlayProfile): Record<string, unknown> {
  const { _delete: _unused, ...rest } = overlayProfile;
  void _unused;
  if (!builtinProfile) {
    return rest as Record<string, unknown>;
  }
  const mergedHosts = rest.hosts ? mergeFlatMap(builtinProfile.hosts, rest.hosts) : { ...builtinProfile.hosts };
  const mergedAgents = rest.agents ? mergeAgents(builtinProfile.agents ?? {}, rest.agents) : builtinProfile.agents;
  const result: Record<string, unknown> = {
    description: rest.description !== undefined ? rest.description : builtinProfile.description,
    hosts: mergedHosts,
  };
  if (mergedAgents && Object.keys(mergedAgents).length > 0) result.agents = mergedAgents;
  return result;
}

/**
 * Read-path normalization: drop overlay entries whose value is byte-identical to the
 * current builtin's value at the same path, and drop `null` tombstones for keys the builtin
 * does not have. Read-only — it never rewrites the overlay file; a full-copy overlay
 * collapses to a real delta only once the UI re-seeds from `source.overlay` (which now
 * carries the normalized form) and saves.
 */
function normalizeOverlay(builtin: Registry, overlay: OverlayData): OverlayData {
  const result: { -readonly [K in keyof OverlayData]?: OverlayData[K] } = {};

  if (overlay.models) {
    const normalized = normalizeFlatMap(builtin.models, overlay.models);
    if (Object.keys(normalized).length > 0) result.models = normalized;
  }

  if (overlay.profiles) {
    const normalized: Record<string, OverlayProfile> = {};
    for (const [key, val] of Object.entries(overlay.profiles)) {
      if (!isOverlayProfile(val)) continue;
      if (val._delete === true) {
        normalized[key] = val;
        continue;
      }
      const normalizedProfile = normalizeProfile(builtin.profiles[key], val);
      if (normalizedProfile) normalized[key] = normalizedProfile;
    }
    if (Object.keys(normalized).length > 0) result.profiles = normalized;
  }

  return result;
}

function normalizeFlatMap<T>(
  builtin: { readonly [key: string]: T },
  overlay: Record<string, T | null>,
): Record<string, T | null> {
  const result: Record<string, T | null> = {};
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) {
      if (key in builtin) result[key] = null; // tombstone for a real key — kept
      continue; // tombstone for a key the builtin lacks — dropped, it is a no-op
    }
    if (!(key in builtin) || JSON.stringify(value) !== JSON.stringify(builtin[key])) {
      result[key] = value;
    }
  }
  return result;
}

/** Per-agent normalization of a profile's `agents` overlay — mirrors `normalizeFlatMap` one
 *  level deeper. A whole-agent `null` tombstone survives only if the builtin actually has
 *  that agent (otherwise it is a no-op and dropped); the per-host cell map reuses
 *  `normalizeFlatMap` directly against the agent's builtin host map (or `{}` for a genuinely
 *  new agent). */
function normalizeAgents(
  builtin: { readonly [agent: string]: { readonly [host: string]: Cell } },
  overlay: Record<string, OverlayCellMap | null>,
): Record<string, OverlayCellMap | null> {
  const result: Record<string, OverlayCellMap | null> = {};
  for (const [agent, value] of Object.entries(overlay)) {
    if (value === null) {
      if (agent in builtin) result[agent] = null; // tombstone for a real agent — kept
      continue; // tombstone for an agent the builtin lacks — dropped, it is a no-op
    }
    const normalizedHosts = normalizeFlatMap(builtin[agent] ?? {}, value);
    if (Object.keys(normalizedHosts).length > 0) result[agent] = normalizedHosts;
  }
  return result;
}

function normalizeProfile(builtinProfile: Profile | undefined, overlayProfile: OverlayProfile): OverlayProfile | null {
  if (!builtinProfile) return overlayProfile; // a genuinely new profile — nothing to collapse

  const result: { description?: string; hosts?: OverlayCellMap; agents?: Record<string, OverlayCellMap | null> } = {};

  if (overlayProfile.description !== undefined && overlayProfile.description !== builtinProfile.description) {
    result.description = overlayProfile.description;
  }

  if (overlayProfile.hosts) {
    const normalizedHosts = normalizeFlatMap(builtinProfile.hosts, overlayProfile.hosts);
    if (Object.keys(normalizedHosts).length > 0) result.hosts = normalizedHosts;
  }

  if (overlayProfile.agents) {
    const normalizedAgents = normalizeAgents(builtinProfile.agents ?? {}, overlayProfile.agents);
    if (Object.keys(normalizedAgents).length > 0) result.agents = normalizedAgents;
  }

  if (result.description === undefined && result.hosts === undefined && result.agents === undefined) return null;
  return result;
}

/** Count of leaf overlay entries surviving normalization — the size of what the operator's
 *  overlay is actually overriding — plus a per-category breakdown so the UI can say *where*
 *  those overrides live without re-deriving this rule. `total` is always the sum of
 *  `breakdown`'s two values. */
function countOverlayEntries(overlay: OverlayData): {
  total: number;
  breakdown: OverlayOverrideBreakdown;
} {
  const breakdown: { -readonly [K in keyof OverlayOverrideBreakdown]: number } = zeroBreakdown();
  if (overlay.models) breakdown.models = Object.keys(overlay.models).length;
  if (overlay.profiles) {
    for (const val of Object.values(overlay.profiles)) {
      if (!isOverlayProfile(val)) continue;
      if (val._delete === true) {
        breakdown.profiles += 1;
        continue;
      }
      if (val.description !== undefined) breakdown.profiles += 1;
      if (val.hosts) breakdown.profiles += Object.keys(val.hosts).length;
      if (val.agents) {
        for (const hostMap of Object.values(val.agents)) {
          breakdown.profiles += hostMap === null ? 1 : Object.keys(hostMap).length;
        }
      }
    }
  }
  const total = breakdown.models + breakdown.profiles;
  return { total, breakdown };
}
