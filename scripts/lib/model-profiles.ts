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

import { readFileSync } from "fs";
import path from "path";

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
//   opencode reasoningEffort is a generic provider pass-through, not an enumerable
//            field. opencode.ai/docs/models documents enums for Anthropic/OpenAI/Google
//            but names no value for the `opencode-go` provider, so this cannot be
//            enumerated without inventing evidence. Any non-empty string is accepted.
//            https://opencode.ai/docs/agents/
export const HOST_EFFORT_ENUM: Readonly<Record<Host, readonly string[] | null>> = {
  claude: ["low", "medium", "high", "xhigh", "max"],
  codex: ["minimal", "low", "medium", "high", "xhigh"],
  cursor: [],
  opencode: null,
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
  if (enumFor === null) return null; // opencode: provider pass-through, not enumerable
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
