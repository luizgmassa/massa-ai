/**
 * Model Catalog tab — the typed models catalog (CRUD), the host x profile
 * model-select grid, Per-Agent Model Overrides, the inline
 * add/duplicate/delete/restore profile forms, the in-memory overlay and its
 * CRUD, and the Save & Apply regenerate stream.
 *
 * The overlay is a DELTA against the builtin registry (absent key = inherit,
 * null = tombstone), never a full copy — seeding it from the effective
 * registry freezes an operator against every future builtin addition.
 */

import { escapeHtml } from "../lib/html.js";
import { isWriteModeEnabled } from "../lib/api-client.js";

// ── Model-registry editor (model-catalog-revamp T3 — AC4/AC5/AC6 UI side) ───

export const REGISTRY_HOSTS = ["claude", "codex", "cursor", "opencode"] as const;

export type RegistryHost = (typeof REGISTRY_HOSTS)[number];

export function isRegistryHost(v: string | null | undefined): v is RegistryHost {
  return !!v && (REGISTRY_HOSTS as readonly string[]).includes(v);
}

/** Frontend copy of HOST_EFFORT_ENUM (scripts/lib/model-profiles.ts:71).
 *  Kept in sync manually; the frontend cannot import from scripts/lib. */
const UI_HOST_EFFORT_ENUM: Record<RegistryHost, string[]> = {
  claude: ["low", "medium", "high", "xhigh", "max"],
  codex: ["minimal", "low", "medium", "high", "xhigh"],
  cursor: [],
  opencode: ["low", "medium", "high", "max"],
};

/** Display labels for the Tool column. Not a simple capitalize —
 *  "opencode" -> "OpenCode" needs its own casing. `data-*` attributes keep the
 *  raw lowercase host id; only this label is user-facing. */
export const REGISTRY_HOST_LABELS: Record<RegistryHost, string> = { claude: "Claude", codex: "Codex", cursor: "Cursor", opencode: "OpenCode" };

/** Section names for the `OverlayOverrideBreakdown` (scripts/lib/model-profiles.ts)
 *  counts. Order matches the page's top-to-bottom layout: Models, then the profile grid. */
const OVERLAY_CATEGORY_ORDER = ["models", "profiles"] as const;
const OVERLAY_CATEGORY_LABELS: Record<(typeof OVERLAY_CATEGORY_ORDER)[number], string> = {
  models: "Models",
  profiles: "Model Catalog profiles",
};

// Hints (placeholder + title) for the Provider/Model fields on the Add/Edit Model form.
const REGISTRY_PROVIDER_HINT = "e.g. opencode-go, zai-coding-plan, local — leave blank for Claude/Codex";
const REGISTRY_MODEL_HINT = "e.g. sonnet · gpt-5.6-terra · glm-5.2";

/**
 * Client twin of `resolvedModelString` (scripts/lib/model-profiles.ts): builds
 * the one resolved string a catalog entry stands for. Both server and UI call
 * this — a cell always stores this string, never a catalog id (D4).
 */
export function resolvedModelString(entry: { provider?: string | null; model: string; context1m?: boolean }): string {
  return (entry.provider ? entry.provider + "/" : "") + entry.model + (entry.context1m ? "[1m]" : "");
}

function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "model";
}

/** New catalog id = slug(tool + name), unique against `existingIds` by appending -2, -3, ... */
export function generateModelId(host: string, name: string, existingIds: readonly string[]): string {
  const base = slugify(host + "-" + name);
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(base + "-" + n)) n++;
  return base + "-" + n;
}

// ── Registry inline forms (D-4.4-style) ─────────────────────────────────────
// state.registryForm tracks which form (if any) is open: null | { kind, error, ... }.
// The renderer emits the open form's markup under its trigger button row;
// wireViewHandlers reads the rendered field values on submit and dispatches to
// the same-named handler.

export interface RegistryFormState {
  kind?: string;
  error?: string | null;
  // Add/Edit Model form fields (model-catalog-revamp AC4).
  editId?: string;
  name?: string;
  host?: string;
  provider?: string;
  model?: string;
  context1m?: boolean;
}

/** Renders the inline `.form-error` line when the current form carries a
 *  validation error (duplicate name, unknown profile, etc.) — replaces
 *  `alert()` for these flows. */
function renderRegistryFormError(formState: RegistryFormState | null | undefined): string {
  return formState && formState.error
    ? '<p class="form-error">' + escapeHtml(formState.error) + "</p>"
    : "";
}

function renderDuplicateProfileForm(formState: RegistryFormState | null | undefined, profileNames: string[]): string {
  if (profileNames.length === 0) {
    return (
      '<div class="registry-inline-form">' +
      '<p class="muted">No profiles available to duplicate. Add a profile first.</p>' +
      '<div class="button-row"><button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button></div>' +
      "</div>"
    );
  }
  const profileOptions = profileNames.map((p) => '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + "</option>").join("");
  return (
    '<div class="registry-inline-form form-field">' +
    renderRegistryFormError(formState) +
    '<label>Source Profile<select data-action="registry-form-source" title="The profile to copy">' + profileOptions + "</select></label>" +
    '<label>New Name<input type="text" data-action="registry-form-new-name" placeholder="e.g. work-variant" title="A new, unused profile name" /></label>' +
    '<div class="button-row">' +
    '<button type="button" class="btn btn-primary" data-action="registry-form-submit">Duplicate</button>' +
    '<button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button>' +
    "</div></div>"
  );
}

function renderDeleteProfileForm(formState: RegistryFormState | null | undefined, profileNames: string[]): string {
  if (profileNames.length === 0) {
    return (
      '<div class="registry-inline-form">' +
      '<p class="muted">No profiles available to delete.</p>' +
      '<div class="button-row"><button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button></div>' +
      "</div>"
    );
  }
  const profileOptions = profileNames.map((p) => '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + "</option>").join("");
  return (
    '<div class="registry-inline-form form-field">' +
    renderRegistryFormError(formState) +
    '<label>Profile<select data-action="registry-form-profile" title="The profile to delete">' + profileOptions + "</select></label>" +
    '<div class="button-row">' +
    '<button type="button" class="btn btn-danger" data-action="registry-form-submit">Delete</button>' +
    '<button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button>' +
    "</div></div>"
  );
}

function renderAddProfileForm(formState: RegistryFormState | null | undefined): string {
  return (
    '<div class="registry-inline-form form-field">' +
    renderRegistryFormError(formState) +
    '<label>Name<input type="text" data-action="registry-form-name" placeholder="e.g. work-variant" title="A new, unused profile name" /></label>' +
    '<label>Description<input type="text" data-action="registry-form-description" placeholder="optional — defaults to the name" title="Optional profile description" /></label>' +
    '<div class="button-row">' +
    '<button type="button" class="btn btn-primary" data-action="registry-form-submit">Add</button>' +
    '<button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button>' +
    "</div></div>"
  );
}

/**
 * Add/Edit Model form (AC4). The 1M-context checkbox renders only when the
 * form's current `host` is `claude` (D2) — `host` is the one field the
 * wiring's `model-form-host` listener keeps in `registryForm` across a
 * re-render so the checkbox can react to it live.
 * ponytail: the other fields (name/provider/model) are read live from the DOM
 * at submit via `collectFormData`, not tracked in state, so switching Tool
 * mid-edit resets them to the form's opening values on this re-render —
 * acceptable for an admin form; track full draft state if that bites.
 */
function renderModelForm(formState: RegistryFormState): string {
  const isEdit = formState.kind === "model-edit";
  const host = isRegistryHost(formState.host) ? formState.host : "claude";
  const hostOptions = REGISTRY_HOSTS.map(
    (h) => '<option value="' + h + '"' + (h === host ? " selected" : "") + ">" + escapeHtml(REGISTRY_HOST_LABELS[h]) + "</option>",
  ).join("");
  const checkbox =
    host === "claude"
      ? '<label class="checkbox-field"><input type="checkbox" data-create="context1m" data-form="model-form"' +
        (formState.context1m ? " checked" : "") +
        ' /> 1M context</label>'
      : "";
  return (
    '<div class="registry-inline-form form-field">' +
    renderRegistryFormError(formState) +
    '<label>Name<input type="text" data-create="name" data-form="model-form" value="' + escapeHtml(formState.name || "") + '" placeholder="e.g. Sonnet 5" /></label>' +
    '<label>Tool<select data-create="host" data-form="model-form" data-action="model-form-host">' + hostOptions + "</select></label>" +
    '<label>Provider (optional)<input type="text" data-create="provider" data-form="model-form" value="' + escapeHtml(formState.provider || "") + '" placeholder="' + escapeHtml(REGISTRY_PROVIDER_HINT) + '" title="' + escapeHtml(REGISTRY_PROVIDER_HINT) + '" /></label>' +
    '<label>Model<input type="text" data-create="model" data-form="model-form" value="' + escapeHtml(formState.model || "") + '" placeholder="' + escapeHtml(REGISTRY_MODEL_HINT) + '" title="' + escapeHtml(REGISTRY_MODEL_HINT) + '" /></label>' +
    checkbox +
    '<div class="button-row">' +
    '<button type="button" class="btn btn-primary" data-action="model-form-submit">' + (isEdit ? "Save" : "Add") + "</button>" +
    '<button type="button" class="btn btn-secondary" data-action="model-form-cancel">Cancel</button>' +
    "</div></div>"
  );
}

/** {model, effort} cell, shared by the overlay delta and the server's own
 *  registry — optional properties ONLY (`model?: string | null`, never
 *  `model: string | undefined`): ABSENT means inherit, PRESENT (even `null`)
 *  is an explicit override/tombstone, and a `| undefined` union would invite
 *  writing the key with value `undefined`, which the merge misreads as an
 *  override rather than "not present". */
export interface RegistryCell {
  model?: string | null;
  effort?: string | null;
}

/** A catalog entry (dropdown option only — cells never reference it by id, D4). */
export interface RegistryModel {
  name: string;
  host: RegistryHost;
  provider: string;
  model: string;
  context1m?: boolean;
}

export interface RegistryProfile {
  description?: string;
  hosts?: Record<string, RegistryCell>;
  agents?: Record<string, Record<string, RegistryCell>>;
}

export interface RegistrySchema {
  models?: Record<string, RegistryModel>;
  profiles?: Record<string, RegistryProfile>;
}

export interface RegistrySource {
  builtin?: RegistrySchema;
  overlay?: {
    models?: Record<string, RegistryModel | null>;
    profiles?: Record<string, unknown>;
  } | null;
  tombstoned?: string[];
}

/** Frontend mirror of `OverlayOverrideBreakdown` (scripts/lib/model-profiles.ts) — the
 *  per-category count of overlay entries surviving normalization. Render-only: these
 *  numbers are server-computed and already sum to `overlayOverrideCount` by
 *  construction, so this file must never recompute them. */
export interface RegistryOverlayOverrideBreakdown {
  models: number;
  profiles: number;
}

interface RegistryAgent {
  name: string;
}

export interface RegistryPayload {
  registry?: RegistrySchema;
  source?: RegistrySource;
  overlayError?: string;
  _error?: unknown;
  overlayOverrideCount?: number;
  overlayOverrideBreakdown?: RegistryOverlayOverrideBreakdown;
  agents?: RegistryAgent[];
  agentsError?: string;
  v1BackupPath?: string;
}

interface RegistryRenderOpts {
  writeMode?: boolean;
  unsaved?: unknown;
  registryForm?: unknown;
  agentOverridesProfile?: string;
}

/** Extracted so both the profile grid and the Per-Agent Model Overrides table
 *  render the same {model, effort} pair the same way (model-catalog-revamp T3). */
function renderEffortControl(host: RegistryHost, effort: string, writeMode: boolean, action: string, attrs: string, ariaLabel: string): string {
  const effortOptions = UI_HOST_EFFORT_ENUM[host];
  const ariaAttr = ' aria-label="' + escapeHtml(ariaLabel) + '"';
  if (effortOptions && effortOptions.length > 0) {
    const opts = effortOptions
      .map((e) => '<option value="' + escapeHtml(e) + '"' + (e === effort ? " selected" : "") + ">" + escapeHtml(e) + "</option>")
      .join("");
    return '<select data-action="' + action + '"' + attrs + ariaAttr + ' data-type="enum"' + (writeMode ? "" : " disabled") + ">" + opts + "</select>";
  } else if (effortOptions === null) {
    return '<input type="text" data-action="' + action + '"' + attrs + ariaAttr + ' value="' + escapeHtml(effort) + '" data-type="text"' + (writeMode ? "" : " disabled") + " />";
  }
  return '<span class="muted">n/a</span>';
}

/** Renders the `<option>`s for a model `<select>` (AC5/AC6): the catalog's
 *  models for `host` (sorted by name), plus a leading sentinel option
 *  (`Inherit` on the profile grid, `Profile default` per agent), plus a
 *  trailing `custom: <string>` option when `currentValue` matches no catalog
 *  entry for this host (D4: an edited/deleted model's old string still shows
 *  as custom rather than disappearing). */
function renderModelSelectOptions(models: Record<string, RegistryModel>, host: RegistryHost, currentValue: string, sentinelLabel: string): string {
  const catalog = Object.values(models)
    .filter((m) => m.host === host)
    .sort((a, b) => a.name.localeCompare(b.name));
  const seen = new Set<string>();
  let options = '<option value=""' + (currentValue ? "" : " selected") + ">" + escapeHtml(sentinelLabel) + "</option>";
  for (const m of catalog) {
    const resolved = resolvedModelString(m);
    seen.add(resolved);
    options += '<option value="' + escapeHtml(resolved) + '"' + (resolved === currentValue ? " selected" : "") + ">" + escapeHtml(m.name) + "</option>";
  }
  if (currentValue && !seen.has(currentValue)) {
    options += '<option value="' + escapeHtml(currentValue) + '" selected>custom: ' + escapeHtml(currentValue) + "</option>";
  }
  return options;
}

function renderModelsTable(models: Record<string, RegistryModel>, writeMode: boolean): string {
  const ids = Object.keys(models).sort((a, b) => models[a].name.localeCompare(models[b].name));
  if (ids.length === 0) return '<p class="empty">No models in the catalog.</p>';
  const rows = ids
    .map((id) => {
      const m = models[id];
      const resolved = resolvedModelString(m);
      const actions = writeMode
        ? '<button type="button" class="btn-edit" data-action="model-edit" data-id="' + escapeHtml(id) + '">Edit</button> ' +
          '<button type="button" class="btn-delete" data-action="model-delete" data-id="' + escapeHtml(id) + '">Delete</button>'
        : "";
      return (
        "<tr><td>" + escapeHtml(m.name) + "</td><td>" + escapeHtml(REGISTRY_HOST_LABELS[m.host] || m.host) + "</td><td>" +
        escapeHtml(resolved) + "</td><td>" + actions + "</td></tr>"
      );
    })
    .join("");
  return (
    '<div class="grid-scroll"><table class="registry-grid models-table"><thead><tr><th>Name</th><th>Tool</th><th>Resolved model</th><th>Actions</th></tr></thead><tbody>' +
    rows +
    "</tbody></table></div>"
  );
}

/** Models section (AC4): table + Add Model trigger + the inline Add/Edit form. */
function renderModelsSection(models: Record<string, RegistryModel>, writeMode: boolean, formState: RegistryFormState | null): string {
  const table = renderModelsTable(models, writeMode);
  const addBtn = writeMode ? '<div class="registry-actions"><button type="button" class="btn btn-secondary" data-action="model-add">Add Model</button></div>' : "";
  const form =
    writeMode && formState && (formState.kind === "model-add" || formState.kind === "model-edit") ? renderModelForm(formState) : "";
  return '<div class="registry-models"><h3>Models</h3>' + table + addBtn + form + "</div>";
}

/** Profiles card (AC5, V3/V4): rows = tools, columns = profiles, cell = model select +
 *  effort. Carries a heading and short help text like the Models and Per-Agent Model
 *  Overrides cards, and hosts `actionsHtml` (the Add/Duplicate/Delete Profile buttons + their
 *  inline forms) so profile management sits next to the grid it manages, instead of after
 *  the unrelated Per-Agent section further down the page. */
function renderProfileGrid(
  profiles: Record<string, RegistryProfile>,
  profileNames: string[],
  models: Record<string, RegistryModel>,
  overlayProfiles: Record<string, unknown>,
  writeMode: boolean,
  actionsHtml: string,
): string {
  const headerCells = profileNames
    .map((p) => {
      const isOverlay = Object.prototype.hasOwnProperty.call(overlayProfiles, p);
      return "<th>" + escapeHtml(p) + (isOverlay ? ' <span class="badge overlay-badge">override</span>' : "") + "</th>";
    })
    .join("");

  const bodyRows = REGISTRY_HOSTS.map((host) => {
    const cells = profileNames
      .map((profileName) => {
        const profile = profiles[profileName];
        const cell = (profile && profile.hosts && profile.hosts[host]) || {};
        const model = cell.model || "";
        const effort = cell.effort || "";
        const isOverlay = Object.prototype.hasOwnProperty.call(overlayProfiles, profileName);
        const overlayClass = isOverlay ? " overlay-sourced" : "";
        const attrs = ' data-profile="' + escapeHtml(profileName) + '" data-host="' + escapeHtml(host) + '"';
        const hostLabel = REGISTRY_HOST_LABELS[host];
        const modelSelect = writeMode
          ? '<select data-action="registry-model-select"' + attrs + ' aria-label="' + escapeHtml(profileName + " · " + hostLabel + " model") + '">' +
            renderModelSelectOptions(models, host, model, "Inherit") + "</select>"
          : "<span>" + escapeHtml(model || "—") + "</span>";
        const effortControl = renderEffortControl(host, effort, writeMode, "registry-effort", attrs, profileName + " · " + hostLabel + " effort");
        return '<td class="registry-cell' + overlayClass + '">' + modelSelect + effortControl + "</td>";
      })
      .join("");
    return '<tr><th class="tool-cell">' + escapeHtml(REGISTRY_HOST_LABELS[host]) + "</th>" + cells + "</tr>";
  }).join("");

  return (
    '<div class="registry-profile-grid"><h3>Profiles</h3>' +
    '<p class="muted">Rows are tools, columns are profiles.</p>' +
    actionsHtml +
    '<div class="grid-scroll"><table class="registry-grid"><thead><tr><th>Tool</th>' + headerCells + "</tr></thead><tbody>" + bodyRows + "</tbody></table></div>" +
    "</div>"
  );
}

/** Per-Agent Model Overrides (AC6): a profile selector, rows = the agents the
 *  server reports (`payload.agents`, from the directory scan — never
 *  hardcoded), columns = tools, cell = model select (first option "Profile
 *  default") + effort. */
function renderAgentOverridesSection(
  agents: RegistryAgent[],
  agentsError: string | undefined,
  profiles: Record<string, RegistryProfile>,
  profileNames: string[],
  models: Record<string, RegistryModel>,
  selectedProfile: string,
  writeMode: boolean,
): string {
  const profileOptions = profileNames
    .map((p) => '<option value="' + escapeHtml(p) + '"' + (p === selectedProfile ? " selected" : "") + ">" + escapeHtml(p) + "</option>")
    .join("");
  const profileSelect = '<label>Profile<select data-action="agent-overrides-profile">' + profileOptions + "</select></label>";

  if (agentsError) {
    return (
      '<div class="registry-agent-overrides"><h3>Per-Agent Model Overrides</h3>' +
      profileSelect +
      '<p class="muted">Agent list unavailable: ' + escapeHtml(agentsError) + "</p></div>"
    );
  }
  if (agents.length === 0) {
    return (
      '<div class="registry-agent-overrides"><h3>Per-Agent Model Overrides</h3>' +
      profileSelect +
      '<p class="muted">No agents found.</p></div>'
    );
  }

  const profile = profiles[selectedProfile];
  const profileHosts = (profile && profile.hosts) || {};
  const headerCells = REGISTRY_HOSTS.map((h) => "<th>" + escapeHtml(REGISTRY_HOST_LABELS[h]) + "</th>").join("");
  const bodyRows = agents
    .map((agent) => {
      const perHost = (profile && profile.agents && profile.agents[agent.name]) || {};
      const cells = REGISTRY_HOSTS.map((host) => {
        const cell = perHost[host] || {};
        const model = cell.model || "";
        const hasOverride = !!model;
        const effort = cell.effort || "";
        const attrs = ' data-profile="' + escapeHtml(selectedProfile) + '" data-agent="' + escapeHtml(agent.name) + '" data-host="' + escapeHtml(host) + '"';
        const overriddenClass = hasOverride ? ' class="overridden"' : "";
        const hostLabel = REGISTRY_HOST_LABELS[host];
        const modelSelect = writeMode
          ? '<select data-action="registry-agent-model-select"' + attrs + ' aria-label="' + escapeHtml(agent.name + " · " + hostLabel + " model") + '">' +
            renderModelSelectOptions(models, host, model, "Profile default") + "</select>"
          : "<span>" + escapeHtml(model || "—") + "</span>";
        // V1: an agent row with no override has no effort of its own to edit — rendering an
        // editable effort select there (defaulting to the host enum's first option, e.g.
        // "low"/"minimal") misrepresented the row as pinned to that value while the effective
        // effort was actually the profile's own. Show the inherited value as disabled text
        // instead, and only render the real control once an override exists.
        let effortControl: string;
        if (hasOverride) {
          effortControl = renderEffortControl(host, effort, writeMode, "registry-agent-effort", attrs, agent.name + " · " + hostLabel + " effort");
        } else {
          const inherited = (profileHosts[host] && profileHosts[host].effort) || "";
          effortControl = inherited ? '<span class="muted" title="Inherited from the profile default">' + escapeHtml(inherited) + " (profile)</span>" : "";
        }
        return "<td" + overriddenClass + ">" + modelSelect + effortControl + "</td>";
      }).join("");
      return "<tr><th>" + escapeHtml(agent.name) + "</th>" + cells + "</tr>";
    })
    .join("");

  return (
    '<div class="registry-agent-overrides"><h3>Per-Agent Model Overrides</h3>' +
    profileSelect +
    '<div class="grid-scroll"><table class="registry-grid"><thead><tr><th>Agent</th>' + headerCells + "</tr></thead><tbody>" + bodyRows + "</tbody></table></div></div>"
  );
}

/**
 * Model-registry editor renderer (model-catalog-revamp T3, AC4/AC5/AC6). Renders
 * the Models CRUD section, a grid (rows = tools, columns = profiles, cells = a
 * model select + effort), the Per-Agent Model Overrides table, and the
 * existing add/duplicate/delete/restore profile flows plus Save & Apply /
 * Discard All Overrides.
 */
export function renderModelRegistry(data: RegistryPayload | null | undefined, opts?: RegistryRenderOpts | null): string {
  const payload: RegistryPayload = data || {};
  const registry = payload.registry || {};
  const source = payload.source || {};
  const overlayError = payload.overlayError;
  const writeMode = opts && opts.writeMode !== undefined ? opts.writeMode : isWriteModeEnabled();
  const unsaved = opts && opts.unsaved ? ' <span class="badge" style="background:rgba(245,158,11,0.15);color:#92400e;">unsaved changes</span>' : "";
  const registryFormState = ((opts && opts.registryForm) || null) as RegistryFormState | null;

  const models = registry.models || {};
  const profiles = registry.profiles || {};
  const profileNames = Object.keys(profiles);
  const overlayProfiles = (source.overlay && source.overlay.profiles) || {};
  const tombstoned = source.tombstoned || [];

  if (profileNames.length === 0 && !overlayError && !payload._error) {
    return '<section class="view"><h2>Model Catalog</h2><p class="empty">No profiles in the catalog.</p></section>';
  }

  const registryError = payload._error
    ? '<div class="error">Catalog load error: ' + escapeHtml(typeof payload._error === "string" ? payload._error : JSON.stringify(payload._error)) + "</div>"
    : "";

  const overlayBanner = overlayError
    ? '<div class="error">Saved changes could not be loaded: ' + escapeHtml(overlayError) + " (showing builtin)</div>"
    : "";

  const v1BackupPath = payload.v1BackupPath;
  const v1BackupBanner = v1BackupPath
    ? '<div class="warning">The previous tier-based overlay was backed up to <code>' + escapeHtml(v1BackupPath) + "</code> and ignored — re-enter your custom models.</div>"
    : "";

  const overlayOverrideCount = typeof payload.overlayOverrideCount === "number" ? payload.overlayOverrideCount : 0;
  const overlayBreakdown = payload.overlayOverrideBreakdown;
  const overlayCategoryParts = overlayBreakdown
    ? OVERLAY_CATEGORY_ORDER.filter((key) => overlayBreakdown[key] > 0).map((key) => overlayBreakdown[key] + " in " + OVERLAY_CATEGORY_LABELS[key])
    : [];
  const overlayOverrideLine = overlayOverrideCount > 0
    ? '<p class="registry-override-count muted">You have ' + overlayOverrideCount +
      " custom override" + (overlayOverrideCount === 1 ? "" : "s") + " of the built-in defaults" +
      (overlayCategoryParts.length > 0 ? ": " + overlayCategoryParts.join(", ") : "") + ".</p>"
    : "";

  const modelsSection = renderModelsSection(models, writeMode, registryFormState);

  // Profile management: add / duplicate / delete / restore (unchanged, AC5) — rendered
  // INSIDE the Profiles card (V4), next to the grid it manages, instead of after the
  // unrelated Per-Agent Model Overrides section further down the page.
  const profileActions = writeMode
    ? '<div class="registry-actions">' +
      '<button type="button" class="btn btn-secondary" data-action="registry-add-profile">Add Profile</button>' +
      '<button type="button" class="btn btn-secondary" data-action="registry-duplicate-profile">Duplicate Profile</button>' +
      '<button type="button" class="btn btn-secondary" data-action="registry-delete-profile">Delete Profile</button>' +
      "</div>" +
      (registryFormState && registryFormState.kind === "add-profile" ? renderAddProfileForm(registryFormState) : "") +
      (registryFormState && registryFormState.kind === "duplicate-profile" ? renderDuplicateProfileForm(registryFormState, profileNames) : "") +
      (registryFormState && registryFormState.kind === "delete-profile" ? renderDeleteProfileForm(registryFormState, profileNames) : "")
    : "";

  const grid = renderProfileGrid(profiles, profileNames, models, overlayProfiles, writeMode, profileActions);

  const agents = payload.agents || [];
  const agentsError = payload.agentsError;
  const selectedProfile =
    opts && opts.agentOverridesProfile && profileNames.includes(opts.agentOverridesProfile)
      ? opts.agentOverridesProfile
      : profileNames.includes("balanced")
        ? "balanced"
        : profileNames[0] || "";
  const agentOverridesSection = renderAgentOverridesSection(agents, agentsError, profiles, profileNames, models, selectedProfile, writeMode);

  const tombstonedList = tombstoned.length
    ? '<div class="tombstoned"><h4>Removed Profiles (restorable)</h4>' +
      tombstoned
        .map((p) => {
          const restoreBtn = writeMode
            ? ' <button type="button" class="btn btn-secondary" data-action="registry-restore" data-profile="' + escapeHtml(p) + '">Restore</button>'
            : "";
          return '<div class="tombstoned-item" data-tombstoned="' + escapeHtml(p) + '">' + escapeHtml(p) + restoreBtn + "</div>";
        })
        .join("") +
      "</div>"
    : "";

  const actionButtons = writeMode
    ? '<div class="registry-action-buttons">' +
      '<button type="button" class="btn btn-primary" data-action="registry-save-apply">Save &amp; Apply</button>' +
      '<button type="button" class="btn btn-danger" data-action="registry-clear-overlay">Discard All Overrides</button>' +
      "</div>"
    : "";

  const helpSection = '<details class="help-card"><summary>About this tab</summary>' +
    '<div class="help-card-body">' +
    '<h4>What A Profile Is</h4>' +
    '<p>A profile is a named bundle of model choices — one model and effort setting per tool (Claude, Codex, Cursor, OpenCode). Switching a tool to a different profile changes which model every agent on that tool runs.</p>' +
    '<h4>Models</h4>' +
    '<p>The catalog of models available to pick from. Each model belongs to one tool; the 1M context checkbox is only available for Claude Code, and appends <code>[1m]</code> to the resolved model string. Editing a model rewrites every profile cell and per-agent override that used its old value; deleting a model is always allowed — cells that still hold its value keep showing it as <code>custom: ...</code>.</p>' +
    '<h4>Managing Profiles</h4>' +
    '<dl>' +
    '<dt>Add Profile</dt><dd>Creates a new profile with a name you choose. The new profile starts with empty model/effort cells for every tool.</dd>' +
    '<dt>Duplicate Profile</dt><dd>Copies an existing profile (you choose which) to a new name. Useful for creating a variant of an existing profile without re-entering all cells.</dd>' +
    '<dt>Delete Profile</dt><dd>Removes a profile. If it is one of the built-in profiles, it moves to the Removed Profiles list below (restorable). If you added it yourself, it is removed entirely.</dd>' +
    '</dl>' +
    '<h4>Per-Agent Model Overrides</h4>' +
    '<p>Picks a different model for one agent on one tool, within the selected profile — the only way to run, for example, <code>senior-engineer</code> on a stronger model than the rest of the profile. Pick <code>Profile default</code> to remove the override and inherit the profile\'s own model for that tool. Read-only agents carry no override in the built-in profiles, so they always resolve to the profile default — by convention the default should be the profile\'s strongest model.</p>' +
    '<h4>Save &amp; Apply</h4>' +
    '<p>Persists every unsaved change on this tab (models, profile cells, per-agent overrides, add/duplicate/delete profile) to your local machine, then regenerates and installs the agent files for every tool. Asks for confirmation first. <strong>Restart your CLI sessions (Claude, Codex, Cursor, OpenCode) afterward</strong> — an already-running session keeps using the model it started with until you do.</p>' +
    '<h4>Discard All Overrides</h4>' +
    '<p>Deletes your saved changes, reverting every tool to the built-in defaults. Asks for confirmation. All models and profiles you added, cell overrides, and per-agent overrides are lost. Removed profiles are restored.</p>' +
    '<h4>Removed Profiles</h4>' +
    '<p>A deleted built-in profile is not gone forever — it moves to the Removed Profiles list below, where Restore brings it back.</p>' +
    '</div>' +
    '</details>';

  return (
    '<section class="view"><h2>Model Catalog</h2>' + unsaved +
    registryError +
    overlayBanner +
    v1BackupBanner +
    overlayOverrideLine +
    modelsSection +
    grid +
    agentOverridesSection +
    tombstonedList +
    actionButtons +
    helpSection +
    "</section>"
  );
}
