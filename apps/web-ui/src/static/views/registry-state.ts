/**
 * Model Catalog — the in-memory overlay, its CRUD, and the Save & Apply stream.
 *
 * Split from `registry.js` because that file reached 948 lines: the renderer and
 * this overlay state machine are two subjects, and the repo's coding guidelines
 * flag anything over ~600 lines for splitting. The renderer is pure
 * data-in/HTML-out; everything here mutates `ctx.state.registryOverlay` or talks
 * to the network.
 *
 * The overlay is a DELTA against the builtin registry (absent key = inherit,
 * null = delete), never a full copy — seeding it from the effective registry
 * writes the whole builtin back on every save and freezes that operator against
 * every future builtin addition.
 */

import { showBanner } from "../lib/banner.js";
import { REGISTRY_HOSTS } from "./registry.js";
import type {
  RegistryCell,
  RegistryProfile,
  RegistrySchema,
  RegistrySource,
  RegistryFormState,
  RegistryOverlayOverrideBreakdown,
} from "./registry.js";

// F2 fold: registryLoaded guard prevents re-init on every render. beforeunload
// guard when dirty (added in startApp).
//
// APCR-01 (design D-1): the server now deep-merges the overlay against the
// builtin as a real delta (absent key = inherit, null = delete). Seeding the
// in-memory overlay from the EFFECTIVE registry — as a prior fix here did —
// writes a full copy of the builtin back to the overlay file on every save,
// which freezes that operator against every future builtin addition (F1).
// Seed from source.overlay ONLY: an empty/absent overlay starts as an empty
// delta, and mergeRegistryForDisplay (below) is what makes add/duplicate/
// delete/edit visible before save without requiring a full-registry seed.

type RegistryHostsMap = Record<string, Record<string, RegistryCell>>;

/** `_delete: true` tombstones a builtin profile or removes an operator-added
 *  one; absent means "not deleted" (never written as `_delete: false`). */
interface RegistryOverlayProfile extends RegistryProfile { _delete?: boolean }

interface RegistryOverlay {
  profiles?: Record<string, RegistryOverlayProfile>;
  hostDefaults?: Record<string, string>;
  // present + null = tombstone; absent = inherit (both maps below).
  workflowTiers?: Record<string, string | null>;
  agentTiers?: Record<string, Record<string, string> | null>;
  tiers?: string[];
}

interface RegistryServerData {
  registry?: RegistrySchema;
  source?: RegistrySource;
  overlayOverrideCount?: number;
  overlayOverrideBreakdown?: RegistryOverlayOverrideBreakdown;
  agents?: unknown[];
  agentsError?: string | null;
}

/** Server-computed fields that `mergeRegistryForDisplay`'s rebuild branch (below) must carry
 *  through from `serverData` unchanged — every key of `RegistryServerData` except `registry`,
 *  which is the one field the branch legitimately rebuilds via merge (T46, WUT-17). This is
 *  the class-level guard the docblock's prose warning failed to be: `overlayOverrideCount` and
 *  `agents`/`agentsError` were named in prose and `overlayOverrideBreakdown` was still dropped,
 *  so the population here is typed against `RegistryServerData` itself rather than re-typed by
 *  hand — `_PassthroughKeysComplete` below fails `bun run type-check` if a field is ever added
 *  to the interface and not added to this list, and the reverse (a stray key not on the
 *  interface) is caught by the `readonly PassthroughKey[]` annotation on the export itself. */
type PassthroughKey = Exclude<keyof RegistryServerData, "registry">;
const PASSTHROUGH_KEYS_LITERAL = ["source", "overlayOverrideCount", "overlayOverrideBreakdown", "agents", "agentsError"] as const;
type _PassthroughKeysComplete = PassthroughKey extends (typeof PASSTHROUGH_KEYS_LITERAL)[number] ? true : false;
const _passthroughKeysComplete: _PassthroughKeysComplete = true;
void _passthroughKeysComplete;
export const SERVER_COMPUTED_PASSTHROUGH_KEYS: readonly PassthroughKey[] = PASSTHROUGH_KEYS_LITERAL;

interface RegistryState {
  registryLoaded?: boolean;
  registryOverlay?: RegistryOverlay;
  registryDirty?: boolean;
  registryForm?: RegistryFormState | null;
  registryServerData?: RegistryServerData;
  regenerating?: boolean;
  [key: string]: unknown;
}

interface RegistryStateCtx { state: RegistryState; render: () => void }

interface RegistryApiCtx extends RegistryStateCtx {
  api: { request: (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>; authHeaders?: () => Record<string, string> };
  root: Parameters<typeof showBanner>[0];
}

export function initRegistryOverlay(ctx: RegistryStateCtx, registry: RegistrySchema | null | undefined, source: RegistrySource | null | undefined): void {
  if (ctx.state.registryLoaded) return;
  const reg = registry || {};
  const src = source || {};
  const overlayData = src.overlay || null;

  const seed: RegistryOverlay = overlayData ? JSON.parse(JSON.stringify(overlayData)) : {};

  ctx.state.registryOverlay = {
    profiles: seed.profiles || {},
    hostDefaults: seed.hostDefaults || {},
    workflowTiers: seed.workflowTiers || {},
    agentTiers: seed.agentTiers || {},
    tiers: seed.tiers || reg.tiers || ["light", "standard", "deep"],
  };
  ctx.state.registryDirty = false;
  ctx.state.registryLoaded = true;
}

/** Merge a flat `{key: value}` overlay delta over the server's map, per key —
 *  never a truthiness fallback (an empty-but-present overlay object must not
 *  blank the server's map, APCR-11.4). A `null` overlay value tombstones the
 *  key (design D-1). */
function mergeFlatMapForDisplay<T>(serverMap: Record<string, T> | undefined, overlayMap: Record<string, T | null> | undefined): Record<string, T> {
  const merged = { ...serverMap } as Record<string, T>;
  for (const [key, value] of Object.entries(overlayMap || {})) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/** Per-agent, per-host merge of `agentTiers` (design D-1, D-4.3) — client twin of
 *  `mergeAgentTiers` in scripts/lib/model-profiles.ts (cross-boundary parity fixture
 *  `apps/web-ui/src/__tests__/fixtures/agent-tiers-parity.json` keeps the two provably
 *  identical). `overlay[agent] === null` deletes the whole agent entry; otherwise the
 *  agent's host map is merged against the base via `mergeFlatMapForDisplay` itself, so a
 *  host-level `null` tombstones just that key and an absent host key inherits. */
function mergeAgentTiersForDisplay(
  base: Record<string, Record<string, string>> | undefined,
  overlay: Record<string, Record<string, string> | null> | undefined,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const [agent, hostMap] of Object.entries(base || {})) {
    result[agent] = { ...hostMap };
  }
  for (const [agent, value] of Object.entries(overlay || {})) {
    if (value === null) {
      delete result[agent];
      continue;
    }
    result[agent] = mergeFlatMapForDisplay((base && base[agent]) || {}, value);
  }
  return result;
}

/** Merge one overlay profile over its server-side counterpart, per host and per tier.
 *  Mirrors `mergeProfile` in scripts/lib/model-profiles.ts: the overlay is a DELTA, so a
 *  host or tier it does not mention is retained from the server's profile, and a profile
 *  the server does not have passes through as a genuinely new one.
 *
 *  Whole-object replace here is the client twin of the server bug APCR-01 fixed: the saved
 *  overlay for an operator who edited only one host is `{hosts: {opencode: {...}}}`, and
 *  assigning that over the server's profile erases claude/codex/cursor from the display —
 *  their cells render as "—" and become uneditable. */
function mergeProfileForDisplay(baseProfile: RegistryProfile | null | undefined, overlayProfile: RegistryOverlayProfile): RegistryProfile {
  const { _delete: _unusedDelete, ...rest } = overlayProfile;
  void _unusedDelete;
  if (!baseProfile) return rest;
  const mergedHosts: RegistryHostsMap = { ...baseProfile.hosts };
  if (rest.hosts) {
    for (const [host, tierMap] of Object.entries(rest.hosts)) {
      const baseTierMap = mergedHosts[host];
      mergedHosts[host] = baseTierMap ? { ...baseTierMap, ...tierMap } : tierMap;
    }
  }
  return {
    description: rest.description !== undefined ? rest.description : baseProfile.description,
    hosts: mergedHosts,
  };
}

/** Build the display registry = server registry merged with in-memory overlay.
 *  This makes add/duplicate/delete/restore visible immediately (before save),
 *  instead of requiring a save+reload cycle. The renderer reads from this. */
export function mergeRegistryForDisplay(serverData: RegistryServerData | null | undefined, overlay: RegistryOverlay | null | undefined): RegistryServerData {
  const base = (serverData && serverData.registry) || {};
  if (!overlay || !overlay.profiles) return serverData || { registry: {}, source: {} };
  const merged: RegistrySchema = JSON.parse(JSON.stringify(base));
  merged.tiers = (overlay.tiers && overlay.tiers.length > 0) ? overlay.tiers : (merged.tiers || ["light", "standard", "deep"]);
  merged.hostDefaults = mergeFlatMapForDisplay(merged.hostDefaults, overlay.hostDefaults);
  merged.workflowTiers = mergeFlatMapForDisplay(merged.workflowTiers, overlay.workflowTiers);
  merged.agentTiers = mergeAgentTiersForDisplay(merged.agentTiers, overlay.agentTiers);
  // Merge profiles as a delta: skip _delete tombstones, deep-merge the rest per host/tier.
  merged.profiles = merged.profiles || {};
  for (const [key, val] of Object.entries(overlay.profiles)) {
    if (val && val._delete === true) {
      delete merged.profiles[key];
    } else if (val) {
      merged.profiles[key] = mergeProfileForDisplay(merged.profiles[key], val);
    }
  }
  // overlayOverrideCount (APCR-01.10) and overlayOverrideBreakdown (WUT-17, T46) are
  // server-computed from the saved overlay, not the in-memory display merge — carry both
  // through unchanged so the count and its named categories stay visible while
  // add/duplicate/delete/edit are shown pre-save. `agents`/`agentsError` (T6, design D-4.3)
  // are likewise server-computed (charter-derived) and must survive this rebuild branch, or
  // the Per-Agent Tier Overrides table loses its row source the instant any other field is
  // edited in the same session. This must-survive list is exactly
  // `SERVER_COMPUTED_PASSTHROUGH_KEYS` above — that constant, not this comment, is what a
  // test enforces, because `overlayOverrideBreakdown` was named nowhere near here and was
  // still the field the rebuild branch dropped.
  return {
    registry: merged,
    source: (serverData && serverData.source) || {},
    overlayOverrideCount: (serverData && serverData.overlayOverrideCount) || 0,
    overlayOverrideBreakdown: serverData ? serverData.overlayOverrideBreakdown : undefined,
    agents: (serverData && serverData.agents) || [],
    agentsError: serverData && serverData.agentsError,
  };
}

export function handleRegistryCellEdit(ctx: RegistryStateCtx, profile: string, host: string, tier: string, field: "model" | "effort", value: string | null): void {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] };
  if (!ctx.state.registryOverlay.profiles) ctx.state.registryOverlay.profiles = {};
  // Create-on-demand for the first edit of a profile the overlay has never touched. Leave
  // `description` absent rather than defaulting it to the profile key: the server's
  // mergeProfile() only inherits the builtin's description when the overlay's own is
  // `undefined` (APCR-11.6) - stamping the key here would overwrite a builtin profile's real
  // description with its own name on the very first cell edit.
  if (!ctx.state.registryOverlay.profiles[profile]) ctx.state.registryOverlay.profiles[profile] = { hosts: {} };
  const overlayProfile = ctx.state.registryOverlay.profiles[profile];
  if (!overlayProfile.hosts) overlayProfile.hosts = {};
  const hosts = overlayProfile.hosts;
  if (!hosts[host]) hosts[host] = {};
  const hostMap = hosts[host];
  if (!hostMap[tier]) hostMap[tier] = { model: null, effort: null };
  hostMap[tier][field] = value || null;
  ctx.state.registryDirty = true;
}

export function handleRegistryHostDefaultEdit(ctx: RegistryStateCtx, host: string, value: string): void {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {} };
  if (!ctx.state.registryOverlay.hostDefaults) ctx.state.registryOverlay.hostDefaults = {};
  ctx.state.registryOverlay.hostDefaults[host] = value;
  ctx.state.registryDirty = true;
}

/** Per-Agent Tier Overrides cell edit (design D-4.3, APUX-04, P1-A AC8). `value === ""`
 *  (the "(default: ...)" option) removes the override key entirely rather than writing a
 *  `null` tombstone — the spec's assumption row (P1-A) notes the builtin `agentTiers` ships
 *  `{}`, so there is nothing to tombstone; an absent key already inherits the charter tier.
 *  An emptied agent object is pruned so a fully-reset agent leaves no residue in the saved
 *  overlay. */
export function handleRegistryAgentTierEdit(ctx: RegistryStateCtx, agent: string, host: string, value: string): void {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, agentTiers: {}, tiers: ["light", "standard", "deep"] };
  if (!ctx.state.registryOverlay.agentTiers) ctx.state.registryOverlay.agentTiers = {};
  const agentTiers = ctx.state.registryOverlay.agentTiers;
  if (value === "") {
    const agentEntry = agentTiers[agent];
    if (agentEntry) {
      delete agentEntry[host];
      if (Object.keys(agentEntry).length === 0) delete agentTiers[agent];
    }
  } else {
    if (!agentTiers[agent]) agentTiers[agent] = {};
    const agentEntry = agentTiers[agent];
    agentEntry[host] = value;
  }
  ctx.state.registryDirty = true;
}

export function handleRegistryWorkflowTierEdit(ctx: RegistryStateCtx, workflow: string, value: string): void {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, workflowTiers: {} };
  if (!ctx.state.registryOverlay.workflowTiers) ctx.state.registryOverlay.workflowTiers = {};
  ctx.state.registryOverlay.workflowTiers[workflow] = value;
  ctx.state.registryDirty = true;
}

/** Opens/closes an inline registry form (design D-4.4). Clicking a trigger
 *  button whose form is already open closes it; clicking a different
 *  trigger switches forms. Replaces the old direct prompt()-driven handlers
 *  as the click target for Add Workflow Override / Add Profile / Duplicate
 *  Profile / Delete Profile. */
export function handleRegistryFormToggle(ctx: RegistryStateCtx, kind: string): void {
  if (ctx.state.registryForm && ctx.state.registryForm.kind === kind) {
    ctx.state.registryForm = null;
  } else {
    ctx.state.registryForm = { kind, error: null };
  }
  ctx.render();
}

/** Closes the currently open inline registry form without applying it. */
export function handleRegistryFormCancel(ctx: RegistryStateCtx): void {
  ctx.state.registryForm = null;
  ctx.render();
}

export function handleRegistryWorkflowTierAdd(ctx: RegistryStateCtx, workflow: string, tier: string): void {
  const existing = (ctx.state.registryOverlay && ctx.state.registryOverlay.workflowTiers) || {};
  if (!workflow || !workflow.trim()) return;
  const wf = workflow.trim();
  if (Object.prototype.hasOwnProperty.call(existing, wf)) {
    ctx.state.registryForm = { kind: "add-workflow", error: 'Workflow "' + wf + '" already has a tier. Edit it instead.' };
    ctx.render();
    return;
  }
  const tiers = (ctx.state.registryOverlay && ctx.state.registryOverlay.tiers) || ["light", "standard", "deep"];
  const trimmedTier = (tier || "").trim();
  if (!trimmedTier || !tiers.includes(trimmedTier)) {
    ctx.state.registryForm = { kind: "add-workflow", error: 'Tier "' + trimmedTier + '" is not one of ' + tiers.join(", ") + "." };
    ctx.render();
    return;
  }
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, workflowTiers: {} };
  if (!ctx.state.registryOverlay.workflowTiers) ctx.state.registryOverlay.workflowTiers = {};
  ctx.state.registryOverlay.workflowTiers[wf] = trimmedTier;
  ctx.state.registryDirty = true;
  ctx.state.registryForm = null;
  ctx.render();
}

export function handleRegistryWorkflowTierRemove(ctx: RegistryStateCtx, workflow: string): void {
  if (!ctx.state.registryOverlay) return;
  if (!ctx.state.registryOverlay.workflowTiers) return;
  // A `null` tombstone (design D-1), not a deleted key: under the server's deep merge, an
  // absent overlay key means "inherit the builtin's value" — deleting the key here would
  // make removal a silent no-op the next time the builtin still has this workflow tier.
  ctx.state.registryOverlay.workflowTiers[workflow] = null;
  ctx.state.registryDirty = true;
  ctx.render();
}

export function handleRegistryAddProfile(ctx: RegistryStateCtx, name: string, description?: string | null): void {
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  if (ctx.state.registryOverlay && ctx.state.registryOverlay.profiles && ctx.state.registryOverlay.profiles[trimmed]) {
    ctx.state.registryForm = { kind: "add-profile", error: 'Profile "' + trimmed + '" already exists.' };
    ctx.render();
    return;
  }
  const desc = (description && description.trim()) || trimmed;
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] };
  const tiers = ctx.state.registryOverlay.tiers || ["light", "standard", "deep"];
  const hosts: RegistryHostsMap = {};
  for (const h of REGISTRY_HOSTS) {
    hosts[h] = {};
    for (const t of tiers) hosts[h][t] = { model: null, effort: null };
  }
  if (!ctx.state.registryOverlay.profiles) ctx.state.registryOverlay.profiles = {};
  ctx.state.registryOverlay.profiles[trimmed] = { description: desc, hosts };
  ctx.state.registryDirty = true;
  ctx.state.registryForm = null;
  ctx.render();
}

// Both Duplicate and Delete build their "Available: ..." list from the DISPLAY registry
// (server registry merged with the in-memory overlay via mergeRegistryForDisplay), not the
// raw overlay. The overlay-only seed (APCR-01.8) leaves ctx.state.registryOverlay.profiles
// empty for an operator who has not edited anything this session, so reading the raw overlay
// made both pickers report "no profiles available" even though every builtin profile is
// selectable (APCR-11.5). mergeRegistryForDisplay already drops `_delete`-tombstoned
// profiles from its result, so no separate filter is needed here.
export function handleRegistryDuplicateProfile(ctx: RegistryStateCtx, sourceName: string, newName: string): void {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] };
  if (!ctx.state.registryOverlay.profiles) ctx.state.registryOverlay.profiles = {};
  const display = mergeRegistryForDisplay(ctx.state.registryServerData, ctx.state.registryOverlay);
  const available = (display && display.registry && display.registry.profiles) || {};
  if (!sourceName || !sourceName.trim()) return;
  const src = sourceName.trim();
  if (!available[src]) {
    ctx.state.registryForm = { kind: "duplicate-profile", error: 'Profile "' + src + '" not found.' };
    ctx.render();
    return;
  }
  if (!newName || !newName.trim()) return;
  const trimmedNew = newName.trim();
  if (Object.prototype.hasOwnProperty.call(available, trimmedNew)) {
    ctx.state.registryForm = { kind: "duplicate-profile", error: 'Profile "' + trimmedNew + '" already exists.' };
    ctx.render();
    return;
  }
  const copy: RegistryOverlayProfile = JSON.parse(JSON.stringify(available[src]));
  delete copy._delete;
  ctx.state.registryOverlay.profiles[trimmedNew] = copy;
  ctx.state.registryDirty = true;
  ctx.state.registryForm = null;
  ctx.render();
}

export function handleRegistryDeleteProfile(ctx: RegistryStateCtx, name: string): void {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] };
  if (!ctx.state.registryOverlay.profiles) ctx.state.registryOverlay.profiles = {};
  const display = mergeRegistryForDisplay(ctx.state.registryServerData, ctx.state.registryOverlay);
  const available = (display && display.registry && display.registry.profiles) || {};
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  if (!available[trimmed]) {
    ctx.state.registryForm = { kind: "delete-profile", error: 'Profile "' + trimmed + '" not found.' };
    ctx.render();
    return;
  }
  // The tombstone must land on the OVERLAY (the thing that gets saved), not the computed
  // display copy - create a minimal overlay entry when deleting a profile the overlay has
  // never touched (e.g. a builtin-only profile). `_delete: true` alone is a valid tombstone
  // (scripts/lib/model-profiles.ts mergeOverlay only checks that flag).
  if (!ctx.state.registryOverlay.profiles[trimmed]) {
    ctx.state.registryOverlay.profiles[trimmed] = { _delete: true };
  } else {
    ctx.state.registryOverlay.profiles[trimmed]._delete = true;
  }
  ctx.state.registryDirty = true;
  ctx.state.registryForm = null;
  ctx.render();
}

export function handleRegistryRestore(ctx: RegistryStateCtx, profile: string): void {
  if (!ctx.state.registryOverlay || !ctx.state.registryOverlay.profiles) return;
  const p = ctx.state.registryOverlay.profiles[profile];
  if (!p) return;
  delete p._delete;
  ctx.state.registryDirty = true;
  ctx.render();
}

export async function handleRegistryClearOverlay(ctx: RegistryApiCtx): Promise<void> {
  if (!confirm("Discard all your overrides? This deletes your saved changes and reverts every tool to the built-in defaults.")) return;
  try {
    const res = (await ctx.api.request("/api/v1/model-registry/overlay", { method: "DELETE" })) as { success?: boolean; error?: string } | null | undefined;
    if (res && res.success === false) {
      showBanner(ctx.root, "error", "Clear failed: " + (res.error || "unknown"));
      return;
    }
    showBanner(ctx.root, "success", "Overrides discarded. Reverted to the built-in defaults.");
    ctx.state.registryLoaded = false;
    ctx.state.registryDirty = false;
    ctx.render();
  } catch (e) {
    showBanner(ctx.root, "error", "Clear failed: " + String((e && (e as { message?: unknown }).message) || e));
  }
}

// ── Registry regenerate streaming handler (design D-4.5, T8, fix-loop 1) ────
// runRegenerateStream is the SSE fetch + APCR-06 classification logic, called
// ONLY from handleRegistrySaveAndApply below (the standalone "Regenerate
// Artifacts" button + its own confirm() no longer exist — T8, APUX-13). It
// carries no confirm() of its own; the single Save & Apply confirm covers
// both the save and the apply step. Returns `{ ok, reason }`: `ok` is true
// only for a full, unqualified success (every host installed, no
// variant-sync failures); on any other outcome `reason` is the exact
// diagnostic text this function would otherwise have shown on its own —
// stream-closed sentence, exit-code line, per-host failed/unsupported
// detail, or the spawn/network error — so the caller can fold the specific
// reason into its own banner instead of discarding it (fix-loop 1: the
// unified Save & Apply flow overwrites this function's own banner with a
// generic retry message, and that message must not lose the diagnostic).

const RESTART_SENTENCE = "Restart your CLI sessions (Claude, Codex, Cursor, OpenCode) to pick up the changes.";

interface RegenerateStreamEvent {
  type?: string;
  status?: string;
  host?: string;
  profile?: string;
  unsupported?: string;
  error?: string;
  failed?: string;
  exitCode?: number | null;
}

export async function runRegenerateStream(ctx: RegistryApiCtx): Promise<{ ok: boolean; reason?: string }> {
  if (ctx.state.regenerating) return { ok: false, reason: undefined };
  ctx.state.regenerating = true;
  ctx.render();
  let ok = false;
  let reason: string | undefined;

  try {
    const headers = (ctx.api && ctx.api.authHeaders) ? ctx.api.authHeaders() : {};
    const res = await fetch("/api/v1/model-registry/regenerate-and-install-stream", { method: "POST", headers });
    if (!res || !res.body || !res.body.getReader) {
      throw new Error("stream unavailable");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let gotDone = false;
    const installResults: { switched: string[]; skipped: string[]; unsupported: string[]; failed: string[] } = { switched: [], skipped: [], unsupported: [], failed: [] };
    const variantSyncResults: { synced: string[]; failed: string[] } = { synced: [], failed: [] };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Split on \n\n (SSE frame delimiter)
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        let event: RegenerateStreamEvent;
        try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (event.type === "line") {
          // append to log panel — in a real browser this updates the DOM.
          // For the handler contract, we just consume the line.
        } else if (event.type === "install") {
          // Classify by the server-derived status (APCR-06), not merely by
          // the event's presence — a failed/unsupported host must never land
          // in the success bucket. "unsupported" is its own class, never
          // folded into "skipped" (APCR-06.7).
          if (event.status === "switched") installResults.switched.push(event.host + " → " + event.profile);
          else if (event.status === "skipped") installResults.skipped.push(event.host as string);
          else if (event.status === "unsupported") installResults.unsupported.push((event.unsupported || event.host) as string);
          else if (event.status === "failed") installResults.failed.push(event.host + ": " + (event.error || event.failed || "unknown"));
        } else if (event.type === "variant-sync") {
          // Bridge-step frames (T3), emitted before the "install" frames —
          // one per host, copying the freshly regenerated agent-profiles
          // trees into that host's installed variant root. "skipped" is the
          // routine case (no source checkout, Cursor, or no variant tree
          // installed yet) and stays silent, matching how a "skipped"
          // install host needs no banner line on its own.
          if (event.status === "synced") variantSyncResults.synced.push(event.host as string);
          else if (event.status === "failed") variantSyncResults.failed.push(event.host + ": " + (event.error || "unknown"));
        } else if (event.type === "done") {
          gotDone = true;
          // APCR-06.6: the generator can exit 0 while at least one host's
          // install failed or was unsupported — that is not a success.
          var hadInstallProblems = installResults.failed.length > 0 || installResults.unsupported.length > 0 || variantSyncResults.failed.length > 0;
          if (event.exitCode === 0 && !hadInstallProblems) {
            ok = true;
            var parts = ["Regeneration complete."];
            if (variantSyncResults.synced.length > 0) parts.push("Synced: " + variantSyncResults.synced.join(", "));
            if (installResults.switched.length > 0) parts.push("Installed: " + installResults.switched.join(", "));
            if (installResults.skipped.length > 0) parts.push("Skipped: " + installResults.skipped.join(", "));
            parts.push(RESTART_SENTENCE);
            showBanner(ctx.root, "success", parts.join(" "), { persist: true });
          } else if (event.exitCode === null) {
            reason = "Regeneration failed: " + (event.error || "spawn error");
            showBanner(ctx.root, "error", reason);
          } else if (event.exitCode !== 0) {
            reason = "Regeneration failed (exit " + event.exitCode + ").";
            showBanner(ctx.root, "error", reason);
          } else {
            var errParts = ["Regeneration complete, but not every host installed."];
            if (variantSyncResults.failed.length > 0) errParts.push("Variant sync failed: " + variantSyncResults.failed.join("; "));
            if (installResults.switched.length > 0) errParts.push("Installed: " + installResults.switched.join(", "));
            if (installResults.skipped.length > 0) errParts.push("Skipped: " + installResults.skipped.join(", "));
            if (installResults.unsupported.length > 0) errParts.push("Unsupported: " + installResults.unsupported.join("; "));
            if (installResults.failed.length > 0) errParts.push("Failed: " + installResults.failed.join("; "));
            reason = errParts.join(" ");
            showBanner(ctx.root, "error", reason);
          }
          break;
        }
      }
    }
    if (!gotDone) {
      ok = false;
      reason = "Regeneration stream closed unexpectedly.";
      showBanner(ctx.root, "error", reason);
    }
  } catch (e) {
    ok = false;
    reason = "Regeneration failed: " + String((e && (e as { message?: unknown }).message) || e);
    showBanner(ctx.root, "error", reason);
  } finally {
    ctx.state.regenerating = false;
    ctx.render();
  }
  return { ok, reason };
}

interface RegistrySaveResponse {
  success?: boolean;
  details?: string[];
  error?: string;
}

/** Unified Save & Apply (design D-4.5, APUX-13, P1-C AC1-AC5). One confirm
 *  covering both steps: PUT the in-memory overlay, and — only on a successful
 *  save — run the existing regenerate-and-install stream (no second confirm).
 *  Replaces the separate "Save Overlay" + "Regenerate Artifacts" buttons. */
export async function handleRegistrySaveAndApply(ctx: RegistryApiCtx): Promise<void> {
  if (!confirm("Save changes and apply them to your installed agents? This overwrites installed variant directories, and you will need to restart your CLI sessions afterward.")) return;
  try {
    const res = (await ctx.api.request("/api/v1/model-registry", { method: "PUT", body: ctx.state.registryOverlay })) as RegistrySaveResponse | null | undefined;
    if (res && res.success === false) {
      const details = res.details ? res.details.join("; ") : (res.error || "Save failed.");
      showBanner(ctx.root, "error", "Save failed: " + details);
      return;
    }
  } catch (e) {
    showBanner(ctx.root, "error", "Save failed: " + String((e && (e as { message?: unknown }).message) || e));
    return;
  }
  // Reset the loaded/dirty guards so the next render re-inits from the newly
  // saved source.overlay (mirrors the old Save Overlay success path).
  ctx.state.registryDirty = false;
  ctx.state.registryLoaded = false;
  const { ok: applied, reason } = await runRegenerateStream(ctx);
  if (!applied) {
    // Overrides runRegenerateStream's own (more detailed) failure banner —
    // showBanner clears the prior banner, so this is what the operator sees
    // last. The leading sentence stays literal (P1-C AC4's safe-to-retry
    // contract); the specific reason (stream-closed, per-host failure,
    // exit-code line, spawn error) is folded in rather than discarded
    // (fix-loop 1).
    const detail = reason ? " Details: " + reason : "";
    showBanner(ctx.root, "error", "Changes saved, but applying them failed — press Save & Apply again to retry." + detail);
  }
}
