/**
 * Model Catalog tab — the {host, tier} x profile grid, the inline
 * add/duplicate/delete/restore forms, the in-memory overlay and its CRUD, and
 * the Save & Apply regenerate stream.
 *
 * The overlay is a DELTA against the builtin registry (absent key = inherit,
 * null = delete), never a full copy — seeding it from the effective registry
 * freezes an operator against every future builtin addition.
 */

import { escapeHtml } from "../lib/html.js";
import { isWriteModeEnabled } from "../lib/api-client.js";

// ── Model-registry editor (T12 — REG-01..18 UI side) ────────────────────────

export const REGISTRY_HOSTS = ["claude", "codex", "cursor", "opencode"] as const;

type RegistryHost = (typeof REGISTRY_HOSTS)[number];

/** Frontend copy of HOST_EFFORT_ENUM (scripts/lib/model-profiles.ts:71).
 *  Kept in sync manually; the frontend cannot import from scripts/lib. */
const UI_HOST_EFFORT_ENUM: Record<RegistryHost, string[]> = {
  claude: ["low", "medium", "high", "xhigh", "max"],
  codex: ["minimal", "low", "medium", "high", "xhigh"],
  cursor: [],
  opencode: ["low", "medium", "high", "max"],
};

/** Display labels for the Tool column (design D-4.1). Not a simple capitalize —
 *  "opencode" -> "OpenCode" needs its own casing. `data-*` attributes keep the
 *  raw lowercase host id; only this label is user-facing. */
const REGISTRY_HOST_LABELS: Record<RegistryHost, string> = { claude: "Claude", codex: "Codex", cursor: "Cursor", opencode: "OpenCode" };

/** Capitalizes the first letter of a raw tier id ("light" -> "Light") for the
 *  Tier column and per-agent tier dropdown labels (design D-4.1, D-4.3). */
function capitalizeLabel(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Hints (placeholder + title) for the Provider/Model split fields (design D-4.2, APUX-05).
const REGISTRY_PROVIDER_HINT = "e.g. opencode-go, zai-coding-plan, local — leave blank for Claude/Codex";
const REGISTRY_MODEL_HINT = "e.g. sonnet · gpt-5.6-terra · glm-5.2";

/**
 * Splits a stored registry model string into its Provider + Model display parts
 * (design D-4.2, APUX-14). Splits on the FIRST "/" only, so a multi-segment
 * OpenCode id like "a/b/c" keeps its remainder intact as the Model part.
 * `null`/`""`/`undefined` (the "inherit" sentinel) render as two empty fields.
 *
 *   splitModelId("a/b/c") -> { provider: "a", model: "b/c" }
 *   splitModelId("m")     -> { provider: "", model: "m" }
 *   splitModelId(null)    -> { provider: "", model: "" }
 */
export function splitModelId(model: string | null | undefined): { provider: string; model: string } {
  if (!model) return { provider: "", model: "" };
  const idx = model.indexOf("/");
  if (idx === -1) return { provider: "", model };
  return { provider: model.slice(0, idx), model: model.slice(idx + 1) };
}

/**
 * Joins Provider + Model back into the single string the overlay stores
 * (design D-4.2, APUX-14, P1-B AC5). Both blank -> `null` (never `""` or the
 * string `"null"`), so a cleared cell round-trips to the "inherit" sentinel.
 *
 *   joinModelId("a", "b/c") -> "a/b/c"
 *   joinModelId("", "m")    -> "m"
 *   joinModelId("", "")     -> null
 */
export function joinModelId(provider: string | null | undefined, model: string | null | undefined): string | null {
  const p = (provider || "").trim();
  const m = (model || "").trim();
  if (!p && !m) return null;
  if (!p) return m;
  return p + "/" + m;
}

/** Frontend copy of the live workflow inventory (basenames from
 *  skills/massa-ai/workflows/ - all .md files). Kept in sync manually; the
 *  frontend cannot import from scripts/lib. Used by the Workflow Tiers picker. */
const WORKFLOW_STEMS = [
  "adr", "architecture-audit", "architecture-fix", "bugs-audit", "bugs-fix",
  "code-quality-audit", "code-quality-fix", "commit", "debug", "design",
  "discovery", "exploration", "feature", "furps-refinement", "general",
  "implementation-audit", "implementation-fix", "judge-with-debate",
  "long-session", "maestro", "maestro-audit", "maestro-fix",
  "mobile-figma-audit", "mobile-figma-fix", "onboarding", "pr-review",
  "refactor", "requirements-audit", "requirements-fix", "rfc",
  "security-audit", "security-fix", "skill-architect", "spec-driven",
  "tdd", "tests-audit", "tests-fix", "the-fool", "ticket", "to-prd",
];

// ── Registry inline forms (design D-4.4, APUX-12, P2-D AC2-AC6) ────────────
// Replaces the old prompt()/alert() flows for Add Workflow Override, Duplicate
// Profile, Delete Profile and Add Profile. state.registryForm tracks which
// form (if any) is open: null | { kind, error }. The renderer emits the open
// form's markup under its trigger button row; wireViewHandlers reads the
// rendered field values on submit and dispatches to the same-named handler.

interface RegistryFormState {
  kind?: string;
  error?: string | null;
}

/** Renders the inline `.form-error` line when the current form carries a
 *  validation error (duplicate name, unknown workflow, etc.) — replaces
 *  `alert()` for these flows. */
function renderRegistryFormError(formState: RegistryFormState | null | undefined): string {
  return formState && formState.error
    ? '<p class="form-error">' + escapeHtml(formState.error) + "</p>"
    : "";
}

function renderAddWorkflowForm(formState: RegistryFormState | null | undefined, existingWorkflows: string[], tiers: string[]): string {
  const available = WORKFLOW_STEMS.filter((s) => !existingWorkflows.includes(s));
  if (available.length === 0) {
    return (
      '<div class="registry-inline-form">' +
      '<p class="muted">Every known workflow already has a tier override. Remove one first to add another.</p>' +
      '<div class="button-row"><button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button></div>' +
      "</div>"
    );
  }
  const workflowOptions = available.map((s) => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + "</option>").join("");
  const tierOptions = tiers.map((t) => '<option value="' + escapeHtml(t) + '">' + escapeHtml(capitalizeLabel(t)) + "</option>").join("");
  return (
    '<div class="registry-inline-form form-field">' +
    renderRegistryFormError(formState) +
    '<label>Workflow<select data-action="registry-form-workflow" title="Pick a workflow that does not yet have a tier override">' + workflowOptions + "</select></label>" +
    '<label>Tier<select data-action="registry-form-tier" title="The tier to pin this workflow to">' + tierOptions + "</select></label>" +
    '<div class="button-row">' +
    '<button type="button" class="btn btn-primary" data-action="registry-form-submit">Add</button>' +
    '<button type="button" class="btn btn-secondary" data-action="registry-form-cancel">Cancel</button>' +
    "</div></div>"
  );
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

interface RegistryCell {
  model?: string | null;
  effort?: string | null;
}

interface RegistryProfile {
  description?: string;
  hosts?: Partial<Record<RegistryHost, Record<string, RegistryCell>>>;
}

interface RegistrySchema {
  profiles?: Record<string, RegistryProfile>;
  tiers?: string[];
  hostDefaults?: Partial<Record<RegistryHost, string>>;
  workflowTiers?: Record<string, string>;
  agentTiers?: Record<string, Partial<Record<RegistryHost, string>>>;
}

interface RegistrySource {
  overlay?: { profiles?: Record<string, unknown> } | null;
  tombstoned?: string[];
}

interface RegistryAgent {
  name: string;
  charterTier: string;
}

interface RegistryPayload {
  registry?: RegistrySchema;
  source?: RegistrySource;
  overlayError?: string;
  _error?: unknown;
  overlayOverrideCount?: number;
  agents?: RegistryAgent[];
  agentsError?: string;
}

interface RegistryRenderOpts {
  writeMode?: boolean;
  unsaved?: unknown;
  registryForm?: unknown;
}

/**
 * Model-registry editor renderer. Renders a grid (rows = {host, tier} pairs,
 * columns = profiles, cells = {model, effort}). Marks overlay-sourced cells.
 * Effort constrained to HOST_EFFORT_ENUM per host. Add/duplicate/delete/restore
 * profile flows, hostDefaults + workflowTiers editable, regenerate +
 * clear-overlay + save-overlay buttons.
 */
export function renderModelRegistry(data: unknown, opts?: RegistryRenderOpts | null): string {
  const payload = (data || {}) as RegistryPayload;
  const registry = payload.registry || {};
  const source = payload.source || {};
  const overlayError = payload.overlayError;
  const writeMode = opts && opts.writeMode !== undefined ? opts.writeMode : isWriteModeEnabled();
  const unsaved = opts && opts.unsaved ? ' <span class="badge" style="background:rgba(245,158,11,0.15);color:#92400e;">unsaved changes</span>' : "";
  const registryFormState = ((opts && opts.registryForm) || null) as RegistryFormState | null;

  const profiles = registry.profiles || {};
  const profileNames = Object.keys(profiles);
  const tiers = registry.tiers || [];
  const hostDefaults = registry.hostDefaults || {};
  const workflowTiers = registry.workflowTiers || {};
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

  // APCR-01.10: the only available mitigation for the AC9 known limitation (a stale
  // full-copy overlay entry stays frozen on an old builtin value) is making the override
  // count visible. A compact, honest line — nothing rendered when there is nothing to
  // override, so an operator with no overlay sees no noise.
  const overlayOverrideCount = typeof payload.overlayOverrideCount === "number" ? payload.overlayOverrideCount : 0;
  const overlayOverrideLine = overlayOverrideCount > 0
    ? '<p class="registry-override-count muted">You have ' + overlayOverrideCount +
      " custom override" + (overlayOverrideCount === 1 ? "" : "s") + " of the built-in defaults.</p>"
    : "";

  // Build rows = {host, tier} pairs
  const rows: { host: RegistryHost; tier: string }[] = [];
  for (const host of REGISTRY_HOSTS) {
    for (const tier of tiers) {
      rows.push({ host, tier });
    }
  }

  // Grid header: profile names as columns
  const headerCells = profileNames.map((p) => {
    const isOverlay = Object.prototype.hasOwnProperty.call(overlayProfiles, p);
    const overlayMark = isOverlay ? ' <span class="badge overlay-badge">override</span>' : "";
    return "<th>" + escapeHtml(p) + overlayMark + "</th>";
  }).join("");

  // Grid body: rows = {host, tier}, cells = {model, effort}
  const bodyRows = rows.map((row) => {
    const cells = profileNames.map((profileName) => {
      const profile = profiles[profileName];
      if (!profile || !profile.hosts) return '<td class="cell-empty">—</td>';
      const hostMap = profile.hosts[row.host];
      if (!hostMap) return '<td class="cell-empty">—</td>';
      const cell = hostMap[row.tier];
      if (!cell) return '<td class="cell-empty">—</td>';
      const model = cell.model || "";
      const effort = cell.effort || "";
      const isOverlay = Object.prototype.hasOwnProperty.call(overlayProfiles, profileName);
      const overlayClass = isOverlay ? " overlay-sourced" : "";
      const effortOptions = UI_HOST_EFFORT_ENUM[row.host];
      let effortInput: string;
      if (effortOptions && effortOptions.length > 0) {
        const opts2 = effortOptions.map((e) => {
          const sel = e === effort ? " selected" : "";
          return '<option value="' + escapeHtml(e) + '"' + sel + ">" + escapeHtml(e) + "</option>";
        }).join("");
        effortInput = '<select data-action="registry-effort" data-profile="' + escapeHtml(profileName) + '" data-host="' + escapeHtml(row.host) + '" data-tier="' + escapeHtml(row.tier) + '" data-type="enum"' + (writeMode ? "" : " disabled") + ">" + opts2 + "</select>";
      } else if (effortOptions === null) {
        effortInput = '<input type="text" data-action="registry-effort" data-profile="' + escapeHtml(profileName) + '" data-host="' + escapeHtml(row.host) + '" data-tier="' + escapeHtml(row.tier) + '" value="' + escapeHtml(effort) + '" data-type="text"' + (writeMode ? "" : " disabled") + " />";
      } else {
        effortInput = '<span class="muted">n/a</span>';
      }
      // Provider input above Model input above Effort (design D-4.2, APUX-14):
      // the overlay still stores one joined model string per cell — split only
      // for display, joined back on change by the wireViewHandlers listener.
      const modelIdParts = splitModelId(model);
      const providerModelAttrs = ' data-profile="' + escapeHtml(profileName) + '" data-host="' + escapeHtml(row.host) + '" data-tier="' + escapeHtml(row.tier) + '"';
      const modelInput = writeMode
        ? '<input type="text" class="registry-provider-input" data-action="registry-provider"' + providerModelAttrs + ' value="' + escapeHtml(modelIdParts.provider) + '" placeholder="' + escapeHtml(REGISTRY_PROVIDER_HINT) + '" title="' + escapeHtml(REGISTRY_PROVIDER_HINT) + '" />' +
          '<input type="text" class="registry-model-input" data-action="registry-model"' + providerModelAttrs + ' value="' + escapeHtml(modelIdParts.model) + '" placeholder="' + escapeHtml(REGISTRY_MODEL_HINT) + '" title="' + escapeHtml(REGISTRY_MODEL_HINT) + '" />'
        : '<span>' + escapeHtml(model || "—") + "</span>";
      return '<td class="registry-cell' + overlayClass + '">' + modelInput + effortInput + "</td>";
    }).join("");
    // First tier row of each host carries the Tool cell (rowspan across every
    // tier row for that host); subsequent rows omit it (design D-4.1).
    const isFirstTierRowForHost = row.tier === tiers[0];
    const toolCell = isFirstTierRowForHost
      ? '<th class="tool-cell" rowspan="' + tiers.length + '">' + escapeHtml(REGISTRY_HOST_LABELS[row.host] || capitalizeLabel(row.host)) + "</th>"
      : "";
    const tierCell = '<th class="tier-cell">' + escapeHtml(capitalizeLabel(row.tier)) + "</th>";
    return "<tr>" + toolCell + tierCell + cells + "</tr>";
  }).join("");

  const grid =
    '<div class="grid-scroll"><table class="registry-grid"><thead><tr><th>Tool</th><th>Tier</th>' + headerCells + "</tr></thead><tbody>" + bodyRows + "</tbody></table></div>";

  // hostDefaults editor
  const hostDefaultsRows = REGISTRY_HOSTS.map((host) => {
    const current = hostDefaults[host] || "";
    const opts2 = profileNames.map((p) => {
      const sel = p === current ? " selected" : "";
      return '<option value="' + escapeHtml(p) + '"' + sel + ">" + escapeHtml(p) + "</option>";
    }).join("");
    return (
      '<div class="config-field"><label>' + escapeHtml(host) + "</label>" +
      '<select data-action="registry-hostDefault" data-host="' + escapeHtml(host) + '"' + (writeMode ? "" : " disabled") + ">" + opts2 + "</select></div>"
    );
  }).join("");

  // workflowTiers editor
  const workflowTierNames = Object.keys(workflowTiers);
  const workflowTiersRows = workflowTierNames.map((wf) => {
    const current = workflowTiers[wf] || "";
    const tierOpts = tiers.map((t) => {
      const sel = t === current ? " selected" : "";
      return '<option value="' + escapeHtml(t) + '"' + sel + ">" + escapeHtml(t) + "</option>";
    }).join("");
    const rmBtn = writeMode
      ? ' <button type="button" class="btn-delete" data-action="registry-workflowTier-remove" data-workflow="' + escapeHtml(wf) + '" style="padding:0.1rem 0.4rem;font-size:0.75rem;">Remove</button>'
      : "";
    return (
      '<div class="config-field"><label>' + escapeHtml(wf) + "</label>" +
      '<select data-action="registry-workflowTier" data-workflow="' + escapeHtml(wf) + '"' + (writeMode ? "" : " disabled") + ">" + tierOpts + "</select>" + rmBtn + "</div>"
    );
  }).join("");

  const addWorkflowTierBtn = writeMode
    ? '<div class="registry-actions"><button type="button" class="btn btn-secondary" data-action="registry-workflowTier-add">Add Workflow Tier</button></div>' +
      (registryFormState && registryFormState.kind === "add-workflow" ? renderAddWorkflowForm(registryFormState, workflowTierNames, tiers) : "")
    : "";

  // Per-Agent Tier Overrides table (design D-4.3, APUX-04, P1-A AC7-AC8). Data
  // is payload.agents (from GET, charter-derived) + the DISPLAY registry's
  // agentTiers (already merged with unsaved in-memory overlay edits by
  // mergeRegistryForDisplay, so an unsaved pick renders before save).
  const agents = payload.agents || [];
  const agentsError = payload.agentsError;
  const agentTiersDisplay = registry.agentTiers || {};
  let agentTierSection: string;
  if (agentsError) {
    agentTierSection =
      '<div class="registry-agentTiers"><h3>Per-Agent Tier Overrides</h3>' +
      '<p class="muted">Agent list unavailable: ' + escapeHtml(agentsError) + "</p></div>";
  } else if (agents.length === 0) {
    agentTierSection =
      '<div class="registry-agentTiers"><h3>Per-Agent Tier Overrides</h3>' +
      '<p class="muted">No agents found.</p></div>';
  } else {
    const agentHeaderCells = REGISTRY_HOSTS.map((h) => "<th>" + escapeHtml(REGISTRY_HOST_LABELS[h]) + "</th>").join("");
    const agentBodyRows = agents.map((agent) => {
      const perHost = agentTiersDisplay[agent.name] || {};
      const cells = REGISTRY_HOSTS.map((host) => {
        const effective = perHost[host] || "";
        const overriddenClass = effective ? ' class="overridden"' : "";
        const options =
          '<option value="">(default: ' + escapeHtml(agent.charterTier) + ")</option>" +
          tiers.map((t) => {
            const sel = t === effective ? " selected" : "";
            return '<option value="' + escapeHtml(t) + '"' + sel + ">" + escapeHtml(capitalizeLabel(t)) + "</option>";
          }).join("");
        return (
          "<td" + overriddenClass + '><select data-action="registry-agentTier" data-agent="' + escapeHtml(agent.name) + '" data-host="' + escapeHtml(host) + '"' + (writeMode ? "" : " disabled") + ">" + options + "</select></td>"
        );
      }).join("");
      return "<tr><th>" + escapeHtml(agent.name) + "</th>" + cells + "</tr>";
    }).join("");
    agentTierSection =
      '<div class="registry-agentTiers"><h3>Per-Agent Tier Overrides</h3>' +
      '<div class="grid-scroll"><table class="registry-grid"><thead><tr><th>Agent</th>' + agentHeaderCells + "</tr></thead><tbody>" + agentBodyRows + "</tbody></table></div></div>";
  }

  // Profile management: add / duplicate / delete / restore
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

  const tombstonedList = tombstoned.length
    ? '<div class="tombstoned"><h4>Removed Profiles (restorable)</h4>' +
      tombstoned.map((p) => {
        const restoreBtn = writeMode
          ? ' <button type="button" class="btn btn-secondary" data-action="registry-restore" data-profile="' + escapeHtml(p) + '">Restore</button>'
          : "";
        return '<div class="tombstoned-item" data-tombstoned="' + escapeHtml(p) + '">' + escapeHtml(p) + restoreBtn + "</div>";
      }).join("") +
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
    '<p>A profile is a named bundle of model choices — one model and effort setting per tool (Claude, Codex, Cursor, OpenCode) and per capability tier. Switching a tool to a different profile changes which model every agent on that tool runs.</p>' +
    '<h4>Capability Tiers</h4>' +
    '<p><strong>Light</strong>, <strong>Standard</strong>, and <strong>Deep</strong> are the three capability tiers a profile assigns a model to, from fastest/cheapest to most capable. An agent runs whichever tier its charter — or your Per-Agent Tier Override below — names.</p>' +
    '<h4>Managing Profiles</h4>' +
    '<dl>' +
    '<dt>Add Profile</dt><dd>Creates a new profile with a name you choose. The new profile starts with empty model/effort cells for every tool and tier.</dd>' +
    '<dt>Duplicate Profile</dt><dd>Copies an existing profile (you choose which) to a new name. Useful for creating a variant of an existing profile without re-entering all cells.</dd>' +
    '<dt>Delete Profile</dt><dd>Removes a profile. If it is one of the built-in profiles, it moves to the Removed Profiles list below (restorable). If you added it yourself, it is removed entirely.</dd>' +
    '</dl>' +
    '<h4>Default Profile per Tool</h4>' +
    '<dl>' +
    '<dt>Default Profile per Tool</dt><dd>The declared default profile per tool, used only the first time that tool is auto-installed (it has no recorded active profile yet). It is <strong>not</strong> the profile currently installed on this machine — a tool can be running any profile you switched it to, regardless of what Default Profile per Tool reads here. See the "Active Profile" tab to view each tool\'s actual active profile and to change it.</dd>' +
    '</dl>' +
    '<h4>Per-Workflow Tier Overrides</h4>' +
    '<p>Maps a workflow name to a tier, overriding the charter default for agents dispatched under that workflow. Add one (e.g., <code>spec-driven &rarr; deep</code>) to pin a heavier model tier for a specific workflow.</p>' +
    '<h4>Per-Agent Tier Overrides</h4>' +
    '<p>Maps one agent to a tier, per tool — the only way to run, for example, <code>builder</code> at Deep on OpenCode while it stays Standard everywhere else. Pick the <code>(default: ...)</code> option to remove the override and go back to inheriting the agent\'s charter tier.</p>' +
    '<h4>Save &amp; Apply</h4>' +
    '<p>Persists every unsaved change on this tab (profile cells, Default Profile per Tool, Per-Workflow Tier Overrides, Per-Agent Tier Overrides, add/duplicate/delete profile) to your local machine, then regenerates and installs the agent files for every tool. Asks for confirmation first. <strong>Restart your CLI sessions (Claude, Codex, Cursor, OpenCode) afterward</strong> — an already-running session keeps using the model it started with until you do.</p>' +
    '<h4>Discard All Overrides</h4>' +
    '<p>Deletes your saved changes, reverting every tool to the built-in defaults. Asks for confirmation. All profiles you added, cell overrides, default-profile changes, and Per-Workflow/Per-Agent overrides are lost. Removed profiles are restored.</p>' +
    '<h4>Removed Profiles</h4>' +
    '<p>A deleted built-in profile is not gone forever — it moves to the Removed Profiles list below, where Restore brings it back.</p>' +
    '</div>' +
    '</details>';

  return (
    '<section class="view"><h2>Model Catalog</h2>' + unsaved +
    registryError +
    overlayBanner +
    overlayOverrideLine +
    grid +
    '<div class="registry-hostDefaults"><h3>Default Profile per Tool</h3>' + hostDefaultsRows + "</div>" +
    '<div class="registry-workflowTiers"><h3>Per-Workflow Tier Overrides</h3>' + workflowTiersRows + addWorkflowTierBtn + "</div>" +
    agentTierSection +
    profileActions +
    tombstonedList +
    actionButtons +
    helpSection +
    "</section>"
  );
}
