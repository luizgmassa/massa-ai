/**
 * Model Catalog — the in-memory overlay, its CRUD (models + profiles), and the
 * Save & Apply stream. Split from `registry.js` (renderer) at 948 lines.
 *
 * The overlay is a DELTA against the builtin registry (absent key = inherit,
 * null = tombstone), never a full copy. Merge semantics mirror
 * `mergeOverlay`/`mergeFlatMap`/`mergeAgents` (scripts/lib/model-profiles.ts):
 * `models.<id>` is replaced whole; a profile's `hosts.<host>` and
 * `agents.<agent>.<host>` are each a LEAF — always a whole-cell write.
 */

import { showBanner } from "../lib/banner.js";
import { REGISTRY_HOSTS, resolvedModelString, generateModelId, isRegistryHost } from "./registry.js";
import type {
  RegistryCell,
  RegistryModel,
  RegistryProfile,
  RegistrySchema,
  RegistrySource,
  RegistryFormState,
  RegistryOverlayOverrideBreakdown,
} from "./registry.js";

type RegistryHostCellMap = Record<string, RegistryCell>;
type OverlayCellMap = Record<string, RegistryCell | null>;

/** `_delete: true` tombstones a builtin profile or removes an operator-added
 *  one; absent means "not deleted" (never written as `_delete: false`). */
interface RegistryOverlayProfile {
  description?: string;
  hosts?: Record<string, RegistryCell | null>;
  agents?: Record<string, OverlayCellMap | null>;
  _delete?: boolean;
}

interface RegistryOverlay {
  models?: Record<string, RegistryModel | null>;
  profiles?: Record<string, RegistryOverlayProfile>;
}

interface RegistryServerData {
  registry?: RegistrySchema;
  source?: RegistrySource;
  overlayOverrideCount?: number;
  overlayOverrideBreakdown?: RegistryOverlayOverrideBreakdown;
  agents?: unknown[];
  agentsError?: string | null;
}

/** Fields `mergeRegistryForDisplay`'s rebuild branch must carry through from `serverData`
 *  unchanged (every `RegistryServerData` key except `registry`). Typed against the interface
 *  itself so a new field forces `tsc` to fail here until this list is updated too. */
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
  agentOverridesProfile?: string;
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
  const src = source || {};
  const overlayData = src.overlay || null;

  const seed: RegistryOverlay = overlayData ? JSON.parse(JSON.stringify(overlayData)) : {};

  ctx.state.registryOverlay = {
    models: seed.models || {},
    profiles: seed.profiles || {},
  };
  ctx.state.registryDirty = false;
  ctx.state.registryLoaded = true;
}

function ensureOverlay(ctx: RegistryStateCtx): RegistryOverlay {
  if (!ctx.state.registryOverlay) ctx.state.registryOverlay = { models: {}, profiles: {} };
  if (!ctx.state.registryOverlay.models) ctx.state.registryOverlay.models = {};
  if (!ctx.state.registryOverlay.profiles) ctx.state.registryOverlay.profiles = {};
  return ctx.state.registryOverlay;
}

/** Merge a flat `{key: value}` overlay delta over the server's map. A `null` value tombstones. */
function mergeFlatMapForDisplay<T>(serverMap: Record<string, T> | undefined, overlayMap: Record<string, T | null> | undefined): Record<string, T> {
  const merged = { ...serverMap } as Record<string, T>;
  for (const [key, value] of Object.entries(overlayMap || {})) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/** Per-agent, per-host merge of a profile's `agents` overlay — client twin of `mergeAgents`
 *  (scripts/lib/model-profiles.ts). `overlay[agent] === null` deletes the whole entry. */
function mergeAgentsForDisplay<T>(
  base: Record<string, Record<string, T>> | undefined,
  overlay: Record<string, Record<string, T | null> | null> | undefined,
): Record<string, Record<string, T>> {
  const result: Record<string, Record<string, T>> = {};
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

/** Merge one overlay profile over its server counterpart, per host/agent leaf — mirrors
 *  `mergeProfile` (scripts/lib/model-profiles.ts). */
function mergeProfileForDisplay(baseProfile: RegistryProfile | null | undefined, overlayProfile: RegistryOverlayProfile): RegistryProfile {
  const { _delete: _unusedDelete, ...rest } = overlayProfile;
  void _unusedDelete;
  if (!baseProfile) return rest as RegistryProfile;
  const mergedHosts: RegistryHostCellMap = rest.hosts ? mergeFlatMapForDisplay(baseProfile.hosts, rest.hosts) : { ...baseProfile.hosts };
  const mergedAgents = rest.agents ? mergeAgentsForDisplay(baseProfile.agents || {}, rest.agents) : baseProfile.agents;
  const result: RegistryProfile = {
    description: rest.description !== undefined ? rest.description : baseProfile.description,
    hosts: mergedHosts,
  };
  if (mergedAgents && Object.keys(mergedAgents).length > 0) result.agents = mergedAgents;
  return result;
}

/** Display registry = server registry merged with the in-memory overlay, so
 *  add/duplicate/delete/restore/edit are visible before save. The renderer reads from this. */
export function mergeRegistryForDisplay(serverData: RegistryServerData | null | undefined, overlay: RegistryOverlay | null | undefined): RegistryServerData {
  const base = (serverData && serverData.registry) || {};
  if (!overlay || (!overlay.profiles && !overlay.models)) return serverData || { registry: {}, source: {} };
  const merged: RegistrySchema = JSON.parse(JSON.stringify(base));
  merged.models = overlay.models ? mergeFlatMapForDisplay(merged.models, overlay.models) : merged.models || {};
  merged.profiles = merged.profiles || {};
  for (const [key, val] of Object.entries(overlay.profiles || {})) {
    if (val && val._delete === true) {
      delete merged.profiles[key];
    } else if (val) {
      merged.profiles[key] = mergeProfileForDisplay(merged.profiles[key], val);
    }
  }
  // Server-computed fields (SERVER_COMPUTED_PASSTHROUGH_KEYS) survive this rebuild unchanged.
  return {
    registry: merged,
    source: (serverData && serverData.source) || {},
    overlayOverrideCount: (serverData && serverData.overlayOverrideCount) || 0,
    overlayOverrideBreakdown: serverData ? serverData.overlayOverrideBreakdown : undefined,
    agents: (serverData && serverData.agents) || [],
    agentsError: serverData && serverData.agentsError,
  };
}

/** Reads the current DISPLAY cell (server + overlay), or a blank cell — the base an edit's
 *  untouched field is read from (a host leaf is whole-cell replace). */
function currentHostCell(ctx: RegistryStateCtx, profile: string, host: string): RegistryCell {
  const display = mergeRegistryForDisplay(ctx.state.registryServerData, ctx.state.registryOverlay);
  const p = display.registry && display.registry.profiles && display.registry.profiles[profile];
  return (p && p.hosts && p.hosts[host]) || { model: null, effort: null };
}

function currentAgentCell(ctx: RegistryStateCtx, profile: string, agent: string, host: string): RegistryCell {
  const display = mergeRegistryForDisplay(ctx.state.registryServerData, ctx.state.registryOverlay);
  const p = display.registry && display.registry.profiles && display.registry.profiles[profile];
  const agentMap = p && p.agents && p.agents[agent];
  return (agentMap && agentMap[host]) || { model: null, effort: null };
}

function isBuiltinProfile(ctx: RegistryStateCtx, profile: string): boolean {
  const builtinProfiles =
    ctx.state.registryServerData &&
    ctx.state.registryServerData.source &&
    ctx.state.registryServerData.source.builtin &&
    ctx.state.registryServerData.source.builtin.profiles;
  if (!builtinProfiles) return true;
  return Object.prototype.hasOwnProperty.call(builtinProfiles, profile);
}

/** Writes a whole cell into `overlay.profiles[profile].hosts[host]`, preserving the sibling
 *  field. Does not call `ctx.render()` — multi-cell callers render once at the end. */
function writeHostCell(ctx: RegistryStateCtx, profile: string, host: string, field: "model" | "effort", value: string | null): void {
  const overlay = ensureOverlay(ctx);
  if (!overlay.profiles![profile]) overlay.profiles![profile] = {};
  const p = overlay.profiles![profile];
  if (!p.hosts) p.hosts = {};
  const base = currentHostCell(ctx, profile, host);
  p.hosts[host] = { ...base, [field]: value || null };
  ctx.state.registryDirty = true;
}

/** Writes a whole cell into `overlay.profiles[profile].agents[agent][host]`. `field ===
 *  "model"` with `value === ""` writes `null` for a builtin profile (D1); a non-builtin
 *  profile has no built-in override to reset past, so the key is deleted instead. A new
 *  override seeds `effort` from the profile's own host cell; an `effort`-only edit with no
 *  existing override is a no-op (the control is UI-hidden in that state). */
function writeAgentCell(ctx: RegistryStateCtx, profile: string, agent: string, host: string, field: "model" | "effort", value: string | null): void {
  const overlay = ensureOverlay(ctx);
  if (!overlay.profiles![profile]) overlay.profiles![profile] = {};
  const p = overlay.profiles![profile];
  if (!p.agents) p.agents = {};
  if (!p.agents[agent] || p.agents[agent] === null) p.agents[agent] = {};
  const agentMap = p.agents[agent] as OverlayCellMap;
  const base = currentAgentCell(ctx, profile, agent, host);
  const hadOverride = !!base.model;

  if (field === "model" && !value) {
    if (isBuiltinProfile(ctx, profile)) {
      agentMap[host] = null;
    } else {
      delete agentMap[host];
      if (Object.keys(agentMap).length === 0) delete p.agents[agent];
    }
    ctx.state.registryDirty = true;
    return;
  }

  if (field === "effort" && !hadOverride) return;

  if (field === "model") {
    agentMap[host] = { model: value, effort: hadOverride ? base.effort ?? null : currentHostCell(ctx, profile, host).effort ?? null };
  } else {
    agentMap[host] = { ...base, effort: value || null };
  }
  ctx.state.registryDirty = true;
}

export function handleRegistryHostCellEdit(ctx: RegistryStateCtx, profile: string, host: string, field: "model" | "effort", value: string | null): void {
  writeHostCell(ctx, profile, host, field, value);
  ctx.render();
}

export function handleRegistryAgentCellEdit(ctx: RegistryStateCtx, profile: string, agent: string, host: string, field: "model" | "effort", value: string | null): void {
  writeAgentCell(ctx, profile, agent, host, field, value);
  ctx.render();
}

export function handleAgentOverridesProfileChange(ctx: RegistryStateCtx, profile: string): void {
  ctx.state.agentOverridesProfile = profile;
  ctx.render();
}

// ── Models CRUD (AC4) ────────────────────────────────────────────────────────

export function handleModelFormOpenAdd(ctx: RegistryStateCtx): void {
  if (ctx.state.registryForm && ctx.state.registryForm.kind === "model-add") {
    ctx.state.registryForm = null;
  } else {
    ctx.state.registryForm = { kind: "model-add", host: "claude", name: "", provider: "", model: "", context1m: false, error: null };
  }
  ctx.render();
}

export function handleModelFormOpenEdit(ctx: RegistryStateCtx, id: string): void {
  if (ctx.state.registryForm && ctx.state.registryForm.kind === "model-edit" && ctx.state.registryForm.editId === id) {
    ctx.state.registryForm = null;
    ctx.render();
    return;
  }
  const display = mergeRegistryForDisplay(ctx.state.registryServerData, ctx.state.registryOverlay);
  const model = (display.registry && display.registry.models && display.registry.models[id]) || undefined;
  if (!model) return;
  ctx.state.registryForm = {
    kind: "model-edit",
    editId: id,
    host: model.host,
    name: model.name,
    provider: model.provider,
    model: model.model,
    context1m: !!model.context1m,
    error: null,
  };
  ctx.render();
}

/** The Tool select's own `change` listener — the only field re-rendered live, so the 1M
 *  checkbox (Claude-only, D2) can react while the form stays open. */
export function handleModelFormHostChange(ctx: RegistryStateCtx, host: string): void {
  if (!ctx.state.registryForm) return;
  ctx.state.registryForm = { ...ctx.state.registryForm, host };
  ctx.render();
}

/** Rewrites every profile-grid cell and per-agent override, for `host`, matching
 *  `oldResolved` to `newResolved` (D4, AC4). Reads one display snapshot up front. */
function rewriteMatchingModelCells(ctx: RegistryStateCtx, host: string, oldResolved: string, newResolved: string): void {
  const display = mergeRegistryForDisplay(ctx.state.registryServerData, ctx.state.registryOverlay);
  const profiles = (display.registry && display.registry.profiles) || {};
  for (const [profileName, profile] of Object.entries(profiles)) {
    const hostCell = profile.hosts && profile.hosts[host];
    if (hostCell && hostCell.model === oldResolved) {
      writeHostCell(ctx, profileName, host, "model", newResolved);
    }
    const agents = profile.agents || {};
    for (const [agentName, hostMap] of Object.entries(agents)) {
      const cell = hostMap[host];
      if (cell && cell.model === oldResolved) {
        writeAgentCell(ctx, profileName, agentName, host, "model", newResolved);
      }
    }
  }
}

/** Submits the Add/Edit Model form (AC4). Edit rewrites every cell/override that held the
 *  model's OLD resolved string, for the model's (old) host — D4. */
export function handleModelFormSubmit(ctx: RegistryStateCtx, data: { name?: unknown; host?: unknown; provider?: unknown; model?: unknown; context1m?: unknown }): void {
  const form = ctx.state.registryForm;
  if (!form || (form.kind !== "model-add" && form.kind !== "model-edit")) return;

  const name = String(data.name || "").trim();
  const host = String(data.host || "").trim();
  const provider = String(data.provider || "").trim();
  const model = String(data.model || "").trim();
  const context1m = host === "claude" && !!data.context1m;

  if (!name) { ctx.state.registryForm = { ...form, error: "Name is required." }; ctx.render(); return; }
  if (!isRegistryHost(host)) { ctx.state.registryForm = { ...form, error: "Tool is required." }; ctx.render(); return; }
  if (!model) { ctx.state.registryForm = { ...form, error: "Model is required." }; ctx.render(); return; }

  const overlay = ensureOverlay(ctx);
  const display = mergeRegistryForDisplay(ctx.state.registryServerData, ctx.state.registryOverlay);
  const existingModels = (display.registry && display.registry.models) || {};
  const newEntry: RegistryModel = { name, host, provider, model, context1m };

  if (form.kind === "model-add") {
    const id = generateModelId(host, name, Object.keys(existingModels));
    overlay.models![id] = newEntry;
  } else {
    const id = form.editId as string;
    const oldEntry = existingModels[id];
    overlay.models![id] = newEntry;
    if (oldEntry) {
      const oldResolved = resolvedModelString(oldEntry);
      const newResolved = resolvedModelString(newEntry);
      // A host change means the old cells never belonged to the new host's model space.
      if (oldResolved !== newResolved && oldEntry.host === host) {
        rewriteMatchingModelCells(ctx, oldEntry.host, oldResolved, newResolved);
      }
    }
  }
  ctx.state.registryDirty = true;
  ctx.state.registryForm = null;
  ctx.render();
}

/** Deletes a model (AC4): builtin is tombstoned (`null`); operator-added is dropped outright.
 *  Cells still holding its resolved string render as `custom: <string>` (D4). No confirm()
 *  here — that's the wiring site's job. */
export function handleModelDelete(ctx: RegistryStateCtx, id: string): void {
  const overlay = ensureOverlay(ctx);
  const builtinModels = (ctx.state.registryServerData && ctx.state.registryServerData.source && ctx.state.registryServerData.source.builtin && ctx.state.registryServerData.source.builtin.models) || {};
  if (Object.prototype.hasOwnProperty.call(builtinModels, id)) {
    overlay.models![id] = null;
  } else {
    delete overlay.models![id];
  }
  if (ctx.state.registryForm && ctx.state.registryForm.kind === "model-edit" && ctx.state.registryForm.editId === id) {
    ctx.state.registryForm = null;
  }
  ctx.state.registryDirty = true;
  ctx.render();
}

/** Opens/closes an inline registry form. Clicking a trigger button whose form is already
 *  open closes it; clicking a different trigger switches forms. */
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

export function handleRegistryAddProfile(ctx: RegistryStateCtx, name: string, description?: string | null): void {
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  const overlay = ensureOverlay(ctx);
  const display = mergeRegistryForDisplay(ctx.state.registryServerData, ctx.state.registryOverlay);
  const available = (display && display.registry && display.registry.profiles) || {};
  if (Object.prototype.hasOwnProperty.call(available, trimmed)) {
    ctx.state.registryForm = { kind: "add-profile", error: 'Profile "' + trimmed + '" already exists.' };
    ctx.render();
    return;
  }
  const desc = (description && description.trim()) || trimmed;
  const hosts: RegistryHostCellMap = {};
  for (const h of REGISTRY_HOSTS) hosts[h] = { model: null, effort: null };
  overlay.profiles![trimmed] = { description: desc, hosts };
  ctx.state.registryDirty = true;
  ctx.state.registryForm = null;
  ctx.render();
}

// Duplicate/Delete build their "Available: ..." list from the DISPLAY registry (server +
// overlay), not the raw (overlay-only-seeded) overlay, or every builtin profile would read
// as unavailable to an operator who has not edited anything yet.
export function handleRegistryDuplicateProfile(ctx: RegistryStateCtx, sourceName: string, newName: string): void {
  const overlay = ensureOverlay(ctx);
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
  overlay.profiles![trimmedNew] = copy;
  ctx.state.registryDirty = true;
  ctx.state.registryForm = null;
  ctx.render();
}

export function handleRegistryDeleteProfile(ctx: RegistryStateCtx, name: string): void {
  const overlay = ensureOverlay(ctx);
  const display = mergeRegistryForDisplay(ctx.state.registryServerData, ctx.state.registryOverlay);
  const available = (display && display.registry && display.registry.profiles) || {};
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  if (!available[trimmed]) {
    ctx.state.registryForm = { kind: "delete-profile", error: 'Profile "' + trimmed + '" not found.' };
    ctx.render();
    return;
  }
  // Tombstone lands on the OVERLAY (what gets saved) — create a minimal entry if untouched.
  if (!overlay.profiles![trimmed]) {
    overlay.profiles![trimmed] = { _delete: true };
  } else {
    overlay.profiles![trimmed]._delete = true;
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

// ── Registry regenerate streaming handler ───────────────────────────────────
// SSE fetch + classification, called only from handleRegistrySaveAndApply. `ok` is true only
// for a full success; otherwise `reason` is the diagnostic text so the caller can fold it in.

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
          // Classify by server-derived status — failed/unsupported must never read as success.
          if (event.status === "switched") installResults.switched.push(event.host + " → " + event.profile);
          else if (event.status === "skipped") installResults.skipped.push(event.host as string);
          else if (event.status === "unsupported") installResults.unsupported.push((event.unsupported || event.host) as string);
          else if (event.status === "failed") installResults.failed.push(event.host + ": " + (event.error || event.failed || "unknown"));
        } else if (event.type === "variant-sync") {
          // One per host, before the "install" frames. "skipped" is routine and stays silent.
          if (event.status === "synced") variantSyncResults.synced.push(event.host as string);
          else if (event.status === "failed") variantSyncResults.failed.push(event.host + ": " + (event.error || "unknown"));
        } else if (event.type === "done") {
          gotDone = true;
          // exit 0 with a failed/unsupported host is still not a success.
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

/** Unified Save & Apply: one confirm, PUT the overlay, then (on success) run the
 *  regenerate-and-install stream with no second confirm. */
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
  // Reset guards so the next render re-inits from the newly saved source.overlay.
  ctx.state.registryDirty = false;
  ctx.state.registryLoaded = false;
  const { ok: applied, reason } = await runRegenerateStream(ctx);
  if (!applied) {
    // Overrides runRegenerateStream's own failure banner; the specific reason is folded in.
    const detail = reason ? " Details: " + reason : "";
    showBanner(ctx.root, "error", "Changes saved, but applying them failed — press Save & Apply again to retry." + detail);
  }
}
