/**
 * Model profile registry — load, validate, select, resolve.
 *
 * The registry (`skills/model-profiles.json`) is the ONLY hand-authored place that names a
 * model or an effort level for any host. This module turns it into resolved `{model, effort}`
 * pairs. It knows nothing about host FILE SYNTAX — rendering a pair into `effort: high` vs
 * `model_reasoning_effort = "high"` vs a `[effort=high]` bracket parameter belongs to the
 * emitters in `scripts/generate-subagent-artifacts.ts`.
 *
 * It also knows nothing about WHICH AGENTS EXIST. A tier arrives as an argument, read from the
 * charter that owns it (`skills/agents/<n>/SKILL.md` -> `metadata.model_tier`). That is why
 * adding an agent needs no change here.
 *
 * Every failure is a named error. Nothing falls back to a default model, ever — a typo in a
 * profile name must stop the build, not silently ship a different model to users.
 *
 * No dependency outside node:fs / node:path, so this runs in the deterministic gate and
 * without node_modules.
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { configDir } from "../../packages/shared/src/config/xdg.ts";

// ── Hosts ───────────────────────────────────────────────────────────────────
export const HOSTS = ["claude", "codex", "cursor", "opencode"] as const;
export type Host = (typeof HOSTS)[number];

export function isHost(v: unknown): v is Host {
  return typeof v === "string" && (HOSTS as readonly string[]).includes(v);
}

// ── Resolved pair ───────────────────────────────────────────────────────────
/** `model: null` / `effort: null` mean "do not pin — inherit". Rendered per host. */
export interface Resolved {
  readonly model: string | null;
  readonly effort: string | null;
}

export interface HostTierMap {
  readonly [tier: string]: Resolved;
}
export interface Profile {
  readonly description: string;
  readonly hosts: { readonly [host: string]: HostTierMap };
}
export interface Registry {
  readonly version: number;
  readonly tiers: readonly string[];
  readonly hostDefaults: { readonly [host: string]: string };
  readonly workflowTiers: { readonly [name: string]: string };
  /** Per-agent per-host tier overrides (design D-1). Opt-in user-overlay data, same standing
   *  as `workflowTiers` — this lib knows nothing about which agents exist (see file header),
   *  so agent-name validity is deliberately not checked here (the generator warns instead). */
  readonly agentTiers: { readonly [agent: string]: { readonly [host: string]: string } };
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

export const MissingTierError = (profile: string, host: string, tier: string) =>
  namedError(
    "MissingTierError",
    `profile "${profile}" host "${host}" defines no entry for tier "${tier}"`,
  );

export const UnknownTierError = (tier: string, known: readonly string[], where: string) =>
  namedError(
    "UnknownTierError",
    `unknown tier "${tier}" at ${where}. Declared tiers: ${known.join(", ")}`,
  );

export const UnknownWorkflowError = (name: string, known: readonly string[]) =>
  namedError(
    "UnknownWorkflowError",
    `no tier declared for workflow "${name}". Declared: ${known.join(", ") || "none"}`,
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

/**
 * Validate a parsed registry, collecting EVERY violation before throwing.
 * Returns the value narrowed to `Registry` on success.
 */
export function validateRegistry(raw: unknown): Registry {
  const v: string[] = [];

  if (!isPlainObject(raw)) throw new RegistryValidationError(["registry root is not an object"]);

  if (raw.version !== 1) v.push(`version must be 1, got ${JSON.stringify(raw.version)}`);

  // tiers
  const tiers = raw.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0 || !tiers.every((t) => typeof t === "string")) {
    throw new RegistryValidationError(["tiers must be a non-empty array of strings"]);
  }
  const tierList = tiers as string[];
  if (new Set(tierList).size !== tierList.length) v.push("tiers contains duplicates");

  // profiles
  const profiles = raw.profiles;
  if (!isPlainObject(profiles) || Object.keys(profiles).length === 0) {
    throw new RegistryValidationError(["profiles must be a non-empty object"]);
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
      continue;
    }
    for (const [hName, hRaw] of Object.entries(hosts)) {
      if (!isHost(hName)) {
        v.push(`profiles.${pName}.hosts.${hName} is not a known host (${HOSTS.join(", ")})`);
        continue;
      }
      if (!isPlainObject(hRaw)) {
        v.push(`profiles.${pName}.hosts.${hName} is not an object`);
        continue;
      }
      // every declared tier present, and no extras
      for (const t of tierList) {
        if (!(t in hRaw)) v.push(`profiles.${pName}.hosts.${hName} is missing tier "${t}"`);
      }
      for (const t of Object.keys(hRaw)) {
        if (!tierList.includes(t)) {
          v.push(`profiles.${pName}.hosts.${hName} declares unknown tier "${t}"`);
        }
      }
      for (const [tName, tRaw] of Object.entries(hRaw)) {
        if (!tierList.includes(tName)) continue;
        const where = `profiles.${pName}.hosts.${hName}.${tName}`;
        if (!isPlainObject(tRaw)) {
          v.push(`${where} is not an object`);
          continue;
        }
        const model = tRaw.model;
        const effort = tRaw.effort;
        if (!(model === null || (typeof model === "string" && model.trim() !== ""))) {
          v.push(`${where}.model must be a non-empty string or null`);
        }
        if (!(effort === null || (typeof effort === "string" && effort.trim() !== ""))) {
          v.push(`${where}.effort must be a non-empty string or null`);
        } else {
          const err = effortViolation(hName, model, effort as string | null, where);
          if (err) v.push(err);
        }
      }
    }
  }

  // hostDefaults — every host, naming a profile that supports it
  const hostDefaults = raw.hostDefaults;
  if (!isPlainObject(hostDefaults)) {
    v.push("hostDefaults must be an object");
  } else {
    for (const h of HOSTS) {
      const target = hostDefaults[h];
      if (typeof target !== "string" || target.trim() === "") {
        v.push(`hostDefaults.${h} is required and must name a profile`);
        continue;
      }
      const prof = (profiles as Record<string, unknown>)[target];
      if (!isPlainObject(prof)) {
        v.push(`hostDefaults.${h} names unknown profile "${target}"`);
      } else {
        const pHosts = prof.hosts;
        if (isPlainObject(pHosts) && !(h in pHosts)) {
          v.push(
            `hostDefaults.${h} names profile "${target}", which does not support host "${h}". ` +
              `A host's default must be a profile it can actually resolve.`,
          );
        }
      }
    }
    for (const k of Object.keys(hostDefaults)) {
      if (!isHost(k)) v.push(`hostDefaults.${k} is not a known host`);
    }
  }

  // workflowTiers
  const workflowTiers = raw.workflowTiers;
  if (!isPlainObject(workflowTiers)) {
    v.push("workflowTiers must be an object (may be empty)");
  } else {
    for (const [wName, wTier] of Object.entries(workflowTiers)) {
      if (typeof wTier !== "string" || !tierList.includes(wTier)) {
        v.push(
          `workflowTiers.${wName} must be one of ${tierList.join(", ")}, got ${JSON.stringify(wTier)}`,
        );
      }
    }
  }

  // agentTiers — optional section (design D-1), sibling of workflowTiers. Absent is treated
  // as `{}` rather than left `undefined`: several downstream call sites (merge, normalize,
  // count, the generator's diff) need an iterable, never a branch on presence. Agent-name
  // validity is NOT checked here — this lib knows nothing about which agents exist (file
  // header); the generator warns on a stale name instead (design D-2).
  const agentTiersRaw = raw.agentTiers;
  if (agentTiersRaw === undefined) {
    (raw as Record<string, unknown>).agentTiers = {};
  } else if (!isPlainObject(agentTiersRaw)) {
    v.push("agentTiers must be an object (may be omitted)");
  } else {
    for (const [aName, aRaw] of Object.entries(agentTiersRaw)) {
      if (!isPlainObject(aRaw)) {
        v.push(`agentTiers.${aName} is not an object`);
        continue;
      }
      for (const [hName, tRaw] of Object.entries(aRaw)) {
        if (!isHost(hName)) {
          v.push(`agentTiers.${aName}.${hName} is not a known host (${HOSTS.join(", ")})`);
          continue;
        }
        if (typeof tRaw !== "string" || !tierList.includes(tRaw)) {
          v.push(
            `agentTiers.${aName}.${hName} must be one of ${tierList.join(", ")}, got ${JSON.stringify(tRaw)}`,
          );
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
}

export const PROFILE_ENV_VAR = "MASSA_AI_MODEL_PROFILE";

/**
 * Precedence, first match wins: `--profile` > MASSA_AI_MODEL_PROFILE > hostDefaults[host].
 * There is no fourth rank — an unknown name at any rank throws.
 *
 * Selection also verifies the profile SUPPORTS this host, so `--profile=open_models` fails
 * before a single file is written rather than partway through emitting 60 of them.
 */
export function selectProfile(registry: Registry, host: Host, opts: SelectOpts = {}): string {
  const env = opts.env ?? process.env;
  const raw = opts.flag?.trim() || env[PROFILE_ENV_VAR]?.trim() || registry.hostDefaults[host];
  if (!raw) {
    throw namedError(
      "InvalidHostDefaultError",
      `no profile resolved for host "${host}": hostDefaults.${host} is missing`,
    );
  }
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
export function resolveTier(
  registry: Registry,
  host: Host,
  profile: string,
  tier: string,
): Resolved {
  const p = registry.profiles[profile];
  if (!p) throw UnknownProfileError(profile, Object.keys(registry.profiles));
  if (!registry.tiers.includes(tier)) {
    throw UnknownTierError(tier, registry.tiers, `resolveTier(${host}, ${profile})`);
  }
  const hostMap = p.hosts[host];
  if (!hostMap) throw MissingHostError(profile, host, Object.keys(p.hosts));
  const entry = hostMap[tier];
  if (!entry) throw MissingTierError(profile, host, tier);
  return entry;
}

export function workflowTier(registry: Registry, name: string): string {
  const t = registry.workflowTiers[name];
  if (!t) throw UnknownWorkflowError(name, Object.keys(registry.workflowTiers));
  return t;
}

/** Hosts a profile supports, sorted. Used by docs generation and the CLI's error text. */
export function hostsSupportedBy(registry: Registry, profile: string): Host[] {
  const p = registry.profiles[profile];
  if (!p) throw UnknownProfileError(profile, Object.keys(registry.profiles));
  return HOSTS.filter((h) => h in p.hosts);
}

/** Count of hand-authored model-bearing facts in the registry (MPR-R2 accounting). */
export function countRegistryFacts(registry: Registry): number {
  let n = 0;
  for (const p of Object.values(registry.profiles)) {
    for (const hostMap of Object.values(p.hosts)) n += Object.keys(hostMap).length;
  }
  return n;
}

// ── Effective registry (builtin + overlay) ──────────────────────────────────

export interface OverlayProfile {
  readonly description?: string;
  readonly hosts?: { readonly [host: string]: HostTierMap };
  readonly _delete?: true;
}

/** `null` is the nested-deletion tombstone (design D-1): key absent means "inherit the
 *  builtin's value", key present non-null means "override", key present `null` means
 *  "delete this key from the merged registry". Scoped to the two flat maps — `tiers`
 *  is an ordered array and stays a whole-value replace. */
export interface OverlayData {
  readonly profiles?: Record<string, OverlayProfile>;
  readonly hostDefaults?: Record<string, string | null>;
  readonly workflowTiers?: Record<string, string | null>;
  /** Two-level delta (design D-1): `agentTiers[agent] === null` tombstones the whole agent
   *  entry; `agentTiers[agent][host] === null` tombstones one host key; an absent key at
   *  either level inherits. */
  readonly agentTiers?: Record<string, Record<string, string | null> | null>;
  readonly tiers?: string[];
}

export interface EffectiveRegistryResult {
  readonly registry: Registry;
  readonly source: {
    readonly builtin: Registry;
    readonly overlay: OverlayData | null;
    readonly tombstoned: string[];
  };
  /** Count of overlay entries that survive normalization (APCR-01.10) — how much of the
   *  registry the operator's overlay is actually overriding, after collapsing entries that
   *  are byte-identical to the current builtin. `0` when there is no overlay. */
  readonly overlayOverrideCount: number;
  readonly overlayError?: string;
}

function isOverlayProfile(v: unknown): v is OverlayProfile {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function loadEffectiveRegistry(opts?: {
  readonly overlayPath?: string;
}): EffectiveRegistryResult {
  const builtin = loadRegistry(DEFAULT_REGISTRY_PATH);
  const overlayPath =
    opts?.overlayPath ?? path.join(configDir("massa-ai"), "model-profiles.json");

  if (!existsSync(overlayPath)) {
    return {
      registry: builtin,
      source: { builtin, overlay: null, tombstoned: [] },
      overlayOverrideCount: 0,
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
      overlayError: `overlay parse failed: ${(e as Error).message}`,
    };
  }

  if (!isPlainObject(overlayRaw)) {
    console.warn(`[massa-ai] Overlay at ${overlayPath} is not an object`);
    return {
      registry: builtin,
      source: { builtin, overlay: null, tombstoned: [] },
      overlayOverrideCount: 0,
      overlayError: "overlay root is not an object",
    };
  }

  const overlay = overlayRaw as OverlayData;

  const merged = mergeOverlay(builtin, overlay);

  try {
    const validated = validateRegistry(merged);
    const normalizedOverlay = normalizeOverlay(builtin, overlay);
    return {
      registry: validated,
      source: {
        builtin,
        overlay: normalizedOverlay,
        tombstoned: collectTombstoned(builtin, overlay),
      },
      overlayOverrideCount: countOverlayEntries(normalizedOverlay),
    };
  } catch (e) {
    console.warn(`[massa-ai] Overlay merge validation failed: ${(e as Error).message}`);
    return {
      registry: builtin,
      source: { builtin, overlay: null, tombstoned: [] },
      overlayOverrideCount: 0,
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
 * Overlay + builtin -> merged registry (design D-1). The overlay is a *delta*: deep-merged
 * per profile/host/tier, and per key for the two flat maps (`hostDefaults`,
 * `workflowTiers`) — an absent key inherits the builtin's value, a `null` value tombstones
 * it. `tiers` is an ordered array and stays a whole-value replace. A profile's `_delete:
 * true` tombstones the whole profile, unchanged from before.
 *
 * The route (`apps/tools-api/src/routes/model-registry.ts`) calls this directly through
 * `profilesLib()` rather than keeping a hand-copied twin (APCR-01.7) — identical input
 * cannot produce differing output when there is only one implementation.
 */
export function mergeOverlay(builtin: Registry, overlay: OverlayData): Record<string, unknown> {
  const result: Record<string, unknown> = JSON.parse(JSON.stringify(builtin));

  if (overlay.tiers) {
    result.tiers = [...overlay.tiers];
  }

  if (overlay.hostDefaults) {
    result.hostDefaults = mergeFlatMap(builtin.hostDefaults, overlay.hostDefaults);
  }

  if (overlay.workflowTiers) {
    result.workflowTiers = mergeFlatMap(builtin.workflowTiers, overlay.workflowTiers);
  }

  if (overlay.agentTiers) {
    result.agentTiers = mergeAgentTiers(builtin.agentTiers, overlay.agentTiers);
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

/** Per-key merge of a flat `{host/workflow: value}` map against the builtin. A `null`
 *  overlay value deletes the key from the result; every other builtin key not mentioned in
 *  the overlay is retained (APCR-01.2). */
function mergeFlatMap(
  builtin: { readonly [key: string]: string },
  overlay: Record<string, string | null>,
): Record<string, string> {
  const result: Record<string, string> = { ...builtin };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Per-agent, per-host merge of `agentTiers` (design D-1) — mirrors `mergeFlatMap` one level
 *  deeper. `overlay[agent] === null` deletes the whole agent entry; otherwise the agent's
 *  host map is merged against the builtin's via `mergeFlatMap` itself, so a host-level
 *  `null` tombstones just that key and an absent host key inherits. */
function mergeAgentTiers(
  builtin: { readonly [agent: string]: { readonly [host: string]: string } },
  overlay: Record<string, Record<string, string | null> | null>,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
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

/** Merge one overlay profile against its builtin counterpart, per host and per tier
 *  (APCR-01.1). A host or tier the overlay does not mention is retained from the builtin.
 *  A profile the builtin does not have (a genuinely new profile) passes through as-is. */
function mergeProfile(
  builtinProfile: Profile | undefined,
  overlayProfile: OverlayProfile,
): Record<string, unknown> {
  const { _delete: _unused, ...rest } = overlayProfile;
  void _unused;
  if (!builtinProfile) {
    return rest as Record<string, unknown>;
  }
  const mergedHosts: Record<string, unknown> = { ...builtinProfile.hosts };
  if (rest.hosts) {
    for (const [host, tierMap] of Object.entries(rest.hosts)) {
      const builtinTierMap = builtinProfile.hosts[host];
      mergedHosts[host] = builtinTierMap ? { ...builtinTierMap, ...tierMap } : tierMap;
    }
  }
  return {
    description: rest.description !== undefined ? rest.description : builtinProfile.description,
    hosts: mergedHosts,
  };
}

/**
 * Read-path normalization (design D-1, TD-4): drop overlay entries whose value is
 * byte-identical to the current builtin's value at the same path, and drop `null`
 * tombstones for keys the builtin does not have. Read-only — it never rewrites the overlay
 * file; a full-copy overlay collapses to a real delta only once the UI re-seeds from
 * `source.overlay` (which now carries the normalized form) and saves.
 */
function normalizeOverlay(builtin: Registry, overlay: OverlayData): OverlayData {
  const result: { -readonly [K in keyof OverlayData]?: OverlayData[K] } = {};

  if (overlay.tiers) {
    result.tiers = overlay.tiers;
  }

  if (overlay.hostDefaults) {
    const normalized = normalizeFlatMap(builtin.hostDefaults, overlay.hostDefaults);
    if (Object.keys(normalized).length > 0) result.hostDefaults = normalized;
  }

  if (overlay.workflowTiers) {
    const normalized = normalizeFlatMap(builtin.workflowTiers, overlay.workflowTiers);
    if (Object.keys(normalized).length > 0) result.workflowTiers = normalized;
  }

  if (overlay.agentTiers) {
    const normalized = normalizeAgentTiers(builtin.agentTiers, overlay.agentTiers);
    if (Object.keys(normalized).length > 0) result.agentTiers = normalized;
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

function normalizeFlatMap(
  builtin: { readonly [key: string]: string },
  overlay: Record<string, string | null>,
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
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

/** Per-agent normalization of `agentTiers` (design D-1) — mirrors `normalizeFlatMap` one
 *  level deeper. A whole-agent `null` tombstone survives only if the builtin actually has
 *  that agent (otherwise it is a no-op and dropped); the per-host map reuses
 *  `normalizeFlatMap` directly against the agent's builtin host map (or `{}` for a genuinely
 *  new agent), so byte-identical leaves and no-op host tombstones drop the same way. */
function normalizeAgentTiers(
  builtin: { readonly [agent: string]: { readonly [host: string]: string } },
  overlay: Record<string, Record<string, string | null> | null>,
): Record<string, Record<string, string | null> | null> {
  const result: Record<string, Record<string, string | null> | null> = {};
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

function normalizeProfile(
  builtinProfile: Profile | undefined,
  overlayProfile: OverlayProfile,
): OverlayProfile | null {
  if (!builtinProfile) return overlayProfile; // a genuinely new profile — nothing to collapse

  const result: { description?: string; hosts?: Record<string, HostTierMap> } = {};

  if (overlayProfile.description !== undefined && overlayProfile.description !== builtinProfile.description) {
    result.description = overlayProfile.description;
  }

  if (overlayProfile.hosts) {
    const hosts: Record<string, HostTierMap> = {};
    for (const [host, tierMap] of Object.entries(overlayProfile.hosts)) {
      const builtinTierMap = builtinProfile.hosts[host];
      if (!builtinTierMap) {
        hosts[host] = tierMap;
        continue;
      }
      const normalizedTiers: Record<string, Resolved> = {};
      for (const [tier, resolved] of Object.entries(tierMap)) {
        const builtinResolved = builtinTierMap[tier];
        if (!builtinResolved || JSON.stringify(resolved) !== JSON.stringify(builtinResolved)) {
          normalizedTiers[tier] = resolved;
        }
      }
      if (Object.keys(normalizedTiers).length > 0) hosts[host] = normalizedTiers;
    }
    if (Object.keys(hosts).length > 0) result.hosts = hosts;
  }

  if (result.description === undefined && result.hosts === undefined) return null;
  return result;
}

/** APCR-01.10: count of leaf overlay entries surviving normalization — the size of what the
 *  operator's overlay is actually overriding. */
function countOverlayEntries(overlay: OverlayData): number {
  let n = 0;
  if (overlay.hostDefaults) n += Object.keys(overlay.hostDefaults).length;
  if (overlay.workflowTiers) n += Object.keys(overlay.workflowTiers).length;
  if (overlay.agentTiers) {
    for (const value of Object.values(overlay.agentTiers)) {
      // A surviving whole-agent tombstone counts as one override (removing that agent's
      // overrides entirely); otherwise count each surviving host-level leaf (design D-1).
      n += value === null ? 1 : Object.keys(value).length;
    }
  }
  if (overlay.tiers) n += 1;
  if (overlay.profiles) {
    for (const val of Object.values(overlay.profiles)) {
      if (!isOverlayProfile(val)) continue;
      if (val._delete === true) {
        n += 1;
        continue;
      }
      if (val.description !== undefined) n += 1;
      if (val.hosts) {
        for (const tierMap of Object.values(val.hosts)) {
          n += Object.keys(tierMap).length;
        }
      }
    }
  }
  return n;
}
