/**
 * Config tab — the 15 sectioned forms, per-section save, secret reveal, and the
 * server restart action.
 *
 * `CONFIG_SECTIONS` is the declarative field schema the whole tab is generated
 * from: every input, its coercion on save, and its Field guide entry come from
 * one row here.
 */

import { escapeHtml, renderGuideText } from "../lib/html.js";
import { isWriteModeEnabled } from "../lib/api-client.js";
import { showBanner } from "../lib/banner.js";
import { CONFIG_SECTIONS } from "./config-sections.js";

// Re-exported for compatibility with any existing consumer importing the
// section schema from this module rather than from config-sections.js.
export { CONFIG_SECTIONS };

// Derived from the value import rather than re-declared: stays exactly in
// sync with config-sections.ts's own `ConfigSection`/`ConfigField` shapes
// with no second copy of those interfaces to drift.
type ConfigSectionEntry = (typeof CONFIG_SECTIONS)[number];
type ConfigFieldEntry = ConfigSectionEntry["fields"][number];

interface ConfigResponse {
  config?: Record<string, unknown>;
  restartNeededSections?: string[];
  // WUT-18 (T43): the shipped default config, masked the same way as
  // `config`. Optional — every existing caller that omits it (every
  // pre-T43 test fixture) keeps rendering exactly as before: a field with no
  // persisted value and no `defaults` to fall back to still renders blank.
  defaults?: Record<string, unknown>;
}

// ── Admin portal view stubs (renderers land in T10-T12) ────────────────────

/**
 * Config view renderer. Renders 15 collapsible section cards from the
 * GET /api/v1/config response. Each card generated from declarative field
 * definitions. Sensitive fields masked (type=password) with reveal toggle.
 * Sections in restartNeededSections show a badge. Per-section Save sends
 * only that section to PUT /api/v1/config.
 */

const SENSITIVE_FIELDS = new Set(["database.url", "embedding.apiKey", "llm.apiKey", "security.apiKey"]);

function getConfigFieldValue(config: Record<string, unknown>, sectionKey: string, fieldName: string): unknown {
  if (sectionKey === "dataDir") return config[sectionKey] || "";
  const section = config[sectionKey];
  if (!section) return undefined;
  const parts = fieldName.split(".");
  let val: unknown = section;
  for (const p of parts) {
    val = val && typeof val === "object" ? (val as Record<string, unknown>)[p] : undefined;
  }
  return val;
}

export interface ResolvedConfigField {
  value: unknown;
  /** True only when a real shipped default filled a gap the persisted file
   *  left open. The 5 fields with no shipped default (`embedding.apiKey`,
   *  `compression.prompt`, `logging.file`, `security.apiKey`,
   *  `security.allowedExtensions`) still resolve `value: undefined` here and
   *  render blank, exactly as before T43. */
  inherited: boolean;
}

/**
 * A field's effective display value (WUT-18 AC5): the persisted value from
 * `config` when present, the shipped default from `defaults` otherwise. Reuses
 * `getConfigFieldValue`'s dotted-path walk for both trees rather than a second
 * copy of it, so `config` and `defaults` are read identically.
 */
export function resolveConfigFieldValue(
  config: Record<string, unknown>,
  defaults: Record<string, unknown> | undefined,
  sectionKey: string,
  fieldName: string,
): ResolvedConfigField {
  const persisted = getConfigFieldValue(config, sectionKey, fieldName);
  if (persisted !== undefined) return { value: persisted, inherited: false };
  const defaultValue = defaults ? getConfigFieldValue(defaults, sectionKey, fieldName) : undefined;
  return { value: defaultValue, inherited: defaultValue !== undefined };
}

function renderConfigField(sectionKey: string, field: ConfigFieldEntry, value: unknown, inherited: boolean): string {
  const fieldId = "config-" + sectionKey + "-" + field.name.replace(/\./g, "-");
  const inputName = "config-" + sectionKey + "-" + field.name;
  const isSensitive = field.sensitive || SENSITIVE_FIELDS.has(sectionKey + "." + field.name);
  const displayValue = value === undefined || value === null ? "" : String(value);

  let inputHtml: string;
  if (field.type === "boolean") {
    const checked = value === true ? " checked" : "";
    inputHtml = '<input type="checkbox" id="' + fieldId + '" name="' + inputName + '"' + checked + ' data-section="' + sectionKey + '" data-field="' + field.name + '" data-type="boolean" />';
  } else if (field.type === "enum") {
    const options = (field.enum || []).map((opt) => {
      const sel = opt === value ? " selected" : "";
      return '<option value="' + escapeHtml(opt) + '"' + sel + ">" + escapeHtml(opt) + "</option>";
    }).join("");
    inputHtml = '<select id="' + fieldId + '" name="' + inputName + '" data-section="' + sectionKey + '" data-field="' + field.name + '" data-type="enum">' + options + "</select>";
  } else if (field.type === "number") {
    inputHtml = '<input type="number" id="' + fieldId + '" name="' + inputName + '" value="' + escapeHtml(displayValue) + '" data-section="' + sectionKey + '" data-field="' + field.name + '" data-type="number" step="any" />';
  } else if (field.type === "string[]") {
    const arrVal = Array.isArray(value) ? value.join(", ") : displayValue;
    inputHtml = '<input type="text" id="' + fieldId + '" name="' + inputName + '" value="' + escapeHtml(arrVal) + '" data-section="' + sectionKey + '" data-field="' + field.name + '" data-type="string[]" placeholder="comma-separated" />';
  } else if (field.type === "json") {
    // A textarea, because the value is structured and a single-line input
    // cannot show it. `undefined` renders empty rather than the string
    // "undefined" — an absent block is meaningful here (it means the built-in
    // default applies), so it must round-trip as absent and not as text.
    const jsonVal = value === undefined || value === null ? "" : JSON.stringify(value, null, 2);
    inputHtml = '<textarea id="' + fieldId + '" name="' + inputName + '" rows="12" data-section="' + sectionKey + '" data-field="' + field.name + '" data-type="json" spellcheck="false">' + escapeHtml(jsonVal) + "</textarea>";
  } else {
    const inputType = isSensitive ? "password" : "text";
    inputHtml = '<input type="' + inputType + '" id="' + fieldId + '" name="' + inputName + '" value="' + escapeHtml(displayValue) + '" data-section="' + sectionKey + '" data-field="' + field.name + '" data-type="text" />';
  }

  let revealBtn = "";
  if (isSensitive) {
    revealBtn = ' <button type="button" class="reveal-btn" data-action="config-reveal" data-target="' + fieldId + '" data-section="' + sectionKey + '" data-field="' + field.name + '">reveal</button>';
  }

  // WUT-18 (T43): "inherited" and "explicitly set" stay visually distinguishable
  // — a muted class on the wrapper plus a `title` tooltip, never on the input's
  // own `data-section`/`data-field`/`data-type` attributes `collectConfigSectionFields`
  // and the guard tests key on.
  const wrapperClass = inherited ? "config-field config-field-inherited" : "config-field";
  const wrapperTitle = inherited ? ' title="Inherited from the built-in default — not set in config.json"' : "";

  return (
    '<div class="' + wrapperClass + '"' + wrapperTitle + ">" +
    '<label for="' + fieldId + '">' + escapeHtml(field.label) + "</label>" +
    inputHtml + revealBtn +
    "</div>"
  );
}

export function renderConfig(data: ConfigResponse | null | undefined, opts?: { writeMode?: boolean }): string {
  const payload = data || {};
  const config = payload.config || {};
  const defaults = payload.defaults || {};
  const restart = payload.restartNeededSections || [];
  const writeMode = opts && opts.writeMode !== undefined ? opts.writeMode : isWriteModeEnabled();
  const restartSet = new Set(restart);

  const cards = CONFIG_SECTIONS.map((section) => {
    const isRestart = restartSet.has(section.key);
    const badge = isRestart ? ' <span class="badge restart-badge">restart needed</span>' : "";
    const sectionConfig = section.key === "dataDir" ? config[section.key] : config[section.key];
    const notConfiguredNote = (section.key === "capturePolicy" && sectionConfig === undefined)
      ? '<div class="config-info-note">Not configured &mdash; using built-in defaults (DEFAULT_POLICY from the capture-policy pure module)</div>'
      : "";
    const fieldsHtml = section.fields.map((field) => {
      const resolved = resolveConfigFieldValue(config, defaults, section.key, field.name);
      return renderConfigField(section.key, field, resolved.value, resolved.inherited);
    }).join("");
    const saveBtn = writeMode
      ? '<button type="button" class="save-btn btn-primary" data-action="config-save" data-section="' + section.key + '">Save</button>'
      : "";
    const guideEntries = section.fields.filter((f) => f.guide).map((f) => {
      return "<dt>" + escapeHtml(f.label) + "</dt><dd>" + renderGuideText(f.guide) + "</dd>";
    }).join("");
    const fieldGuide = guideEntries
      ? '<details class="config-field-guide"><summary>Field guide</summary>' +
        '<div class="config-field-guide-body"><dl>' + guideEntries + "</dl></div></details>"
      : "";
    return (
      '<div class="config-section" data-section="' + section.key + '">' +
      '<h3 class="config-section-header">' + escapeHtml(section.label) + badge + "</h3>" +
      notConfiguredNote +
      '<div class="config-fields">' + fieldsHtml + "</div>" +
      saveBtn +
      fieldGuide +
      "</div>"
    );
  }).join("");

  const helpCard =
    '<details class="help-card"><summary>About this tab</summary>' +
    '<div class="help-card-body">' +
    '<h4>How Config Saves</h4>' +
    '<p>Each section below saves independently — editing a field and pressing that section\'s Save button writes only that section, leaving every other section untouched.</p>' +
    '<h4>Sections That Require A Restart</h4>' +
    '<p>A section badged as requiring one takes effect only after the massa-ai server process restarts; saving it does not change the behavior of the already-running process.</p>' +
    '<p>Each section\'s own "Field guide" toggle explains its individual fields, defaults, and examples.</p>' +
    '</div>' +
    '</details>';

  // Restart Server action (APR-04). One action surface: the save-flow's
  // restart proposal banner points here instead of embedding a second button.
  // Sibling of the heading, not inside it — a button has no place in an h2's
  // content model.
  const restartBtn = writeMode
    ? '<button type="button" class="restart-server-btn btn-danger" data-action="server-restart">Restart Server</button>'
    : "";

  return '<section class="view"><div class="view-header"><h2>Config</h2>' + restartBtn + "</div>" + helpCard + cards + "</section>";
}

/**
 * Refuses a path segment that would reach `Object.prototype` rather than the
 * object being built.
 *
 * Written as literal `===` comparisons, not a `Set` lookup. Both are correct,
 * but only this shape is legible to CodeQL's `js/prototype-pollution-utility`
 * query as a sanitizer — a `Set.has()` call is opaque to it, and the alert
 * survived two attempts that used one.
 *
 * Every real segment comes from `CONFIG_SECTIONS`' hardcoded `field.name`
 * table, so none of these can occur today and refusing them changes no output.
 * A walker that assigns down a dotted path is worth making unable to pollute
 * regardless of who calls it next.
 */
function setByPath(obj: Record<string, unknown>, dottedPath: string, value: unknown): void {
  const parts = dottedPath.split(".");
  let cur: Record<string, unknown> = obj;
  // The guard sits on each write rather than once up front, so the chain is
  // provably safe at every hop instead of only at entry.
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (key === "__proto__" || key === "constructor" || key === "prototype") return;
    if (!Object.prototype.hasOwnProperty.call(cur, key) || typeof cur[key] !== "object" || cur[key] === null) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (last === "__proto__" || last === "constructor" || last === "prototype") return;
  cur[last] = value;
}

export function buildConfigSectionBody(sectionKey: string, fieldValues: Record<string, unknown>): Record<string, unknown> {
  const sectionDef = CONFIG_SECTIONS.find((s) => s.key === sectionKey);
  if (!sectionDef) return {};

  if (sectionKey === "dataDir") {
    return { dataDir: fieldValues.dataDir || "" };
  }

  const nested: Record<string, unknown> = {};
  for (const field of sectionDef.fields) {
    const raw = fieldValues[field.name];
    let val: unknown = raw;
    if (field.type === "number") {
      val = raw === "" || raw === undefined ? undefined : Number(raw);
    } else if (field.type === "boolean") {
      val = raw === true || raw === "true" || raw === "on";
    } else if (field.type === "string[]") {
      val = raw && typeof raw === "string"
        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
        : Array.isArray(raw) ? raw : [];
    } else if (field.type === "json") {
      // An empty textarea means "no configured block", which is not the same
      // as an empty array: absent lets the server's own default apply, while
      // `[]` would be a policy with no rules at all.
      const text = typeof raw === "string" ? raw.trim() : "";
      if (text === "") {
        val = undefined;
      } else {
        try {
          val = JSON.parse(text);
        } catch (e) {
          // Thrown, never coerced. Submitting unparseable text would either be
          // rejected by the server with a message about the wrong thing, or —
          // worse — accepted as a string where a structure was meant.
          throw new Error(
            'Field "' + field.label + '" is not valid JSON: ' + ((e && (e as Error).message) || String(e)),
          );
        }
      }
    }
    if (val !== undefined) setByPath(nested, field.name, val);
  }
  return { [sectionKey]: nested };
}

/** The subset of an input element `collectConfigSectionFields` reads —
 *  structurally the same shape `lib/forms.ts`'s `collectFormData` uses, plus
 *  `remove?` so the same root also satisfies `showBanner`'s element shape
 *  when its own `querySelectorAll(".success, .error")` call runs against it. */
interface ConfigFieldElement {
  dataset?: { field?: string; [key: string]: string | undefined };
  type?: string;
  checked?: boolean;
  value?: string;
  remove?: () => void;
}

interface ConfigFormRoot {
  querySelectorAll(selectors: string): { forEach(cb: (el: ConfigFieldElement) => void): void };
}

/** Collect field values for a config section from the rendered DOM. */
export function collectConfigSectionFields(root: ConfigFormRoot, section: string): Record<string, unknown> {
  const fieldValues: Record<string, unknown> = {};
  const els = root.querySelectorAll('[data-section="' + section + '"]');
  els.forEach((el) => {
    const field = el.dataset && el.dataset.field;
    if (!field) return;
    if (el.type === "checkbox") fieldValues[field] = !!el.checked;
    else fieldValues[field] = el.value;
  });
  return fieldValues;
}

interface ConfigSaveResponse {
  success?: boolean;
  details?: string[];
  error?: string;
  data?: { changedRestartSections?: string[] };
}

interface RestartResponse {
  success?: boolean;
  mode?: string;
  reason?: string;
  error?: string;
}

interface ConfigApi {
  request: (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>;
}

/** The subset of a `getElementById` target `handleConfigReveal` mutates —
 *  structural, not `HTMLInputElement`, so the fake-DOM test harness still
 *  satisfies it. */
interface ConfigRevealElement {
  type: string;
  dataset: { revealed?: string; [key: string]: string | undefined };
  value: string;
}

// Exported so `wire-view-handlers.ts` can type `WireViewHandlersCtx.doc`
// against this same structural shape (T39) rather than re-declaring an
// equivalent, driftable copy.
export interface ConfigDocument {
  getElementById?: (id: string) => ConfigRevealElement | null;
}

interface ConfigCtx {
  root: ConfigFormRoot;
  api: ConfigApi;
  render: () => void;
  state?: { serverRestartInFlight?: boolean; [key: string]: unknown };
  doc?: ConfigDocument | null;
}

export async function handleConfigSave(ctx: ConfigCtx, section: string): Promise<void> {
  const sectionDef = CONFIG_SECTIONS.find((s) => s.key === section);
  const label = sectionDef ? sectionDef.label : section;
  if (!confirm("Save " + label + " config? A backup will be created.")) return;
  const fieldValues = collectConfigSectionFields(ctx.root, section);
  // Built outside the request try/catch, and a `json` field throws on
  // unparseable text — so it needs its own guard, or a typo in the Rules box
  // would reject as an unhandled error with no banner at all.
  let body: Record<string, unknown>;
  try {
    body = buildConfigSectionBody(section, fieldValues);
  } catch (e) {
    showBanner(ctx.root, "error", "Save failed: " + ((e && (e as Error).message) || String(e)));
    return;
  }
  try {
    const res = (await ctx.api.request("/api/v1/config", { method: "PUT", body })) as ConfigSaveResponse | null;
    if (res && res.success === false) {
      const details = res.details ? res.details.join("; ") : (res.error || "Save failed.");
      showBanner(ctx.root, "error", "Save failed: " + details);
      return;
    }
    const changed = (res && res.data && res.data.changedRestartSections) || [];
    if (changed.length > 0) {
      // Diff-based restart proposal (APR-05): only when a restart-relevant
      // value actually changed in THIS save. Persistent — the running
      // process will not pick the change up on its own.
      showBanner(
        ctx.root,
        "success",
        "Config section " + section + " saved. Restart required to apply: " + changed.join(", ") +
          " — use the Restart Server button to apply now.",
        { persist: true },
      );
    } else {
      showBanner(ctx.root, "success", "Config section " + section + " saved. Backup created.");
    }
    ctx.render();
  } catch (e) {
    showBanner(ctx.root, "error", "Save failed: " + String((e && (e as Error).message) || e));
  }
}

/** Restart the API server (APR-04): confirm, POST, then poll /health until
 *  the replacement answers. Poll knobs are injectable for tests. */
export async function handleServerRestart(
  ctx: ConfigCtx,
  opts?: { pollIntervalMs?: number; maxAttempts?: number },
): Promise<void> {
  opts = opts || {};
  const pollIntervalMs = opts.pollIntervalMs !== undefined ? opts.pollIntervalMs : 1000;
  const maxAttempts = opts.maxAttempts !== undefined ? opts.maxAttempts : 30;
  // Re-entrancy guard: a second click during the poll loop would interleave
  // two banner cycles. Scoped to the app instance's state, NOT the module —
  // a module-level flag latched by one harness's never-resolving request
  // would silently disable the handler for every later caller in the same
  // process. Server-side arm/consume is already one-shot.
  const state: NonNullable<ConfigCtx["state"]> = ctx.state || (ctx.state = {});
  if (state.serverRestartInFlight) return;
  if (!confirm("Restart the massa-ai API server? In-flight requests will be dropped.")) return;
  state.serverRestartInFlight = true;
  try {
    await runServerRestart(ctx, pollIntervalMs, maxAttempts);
  } finally {
    state.serverRestartInFlight = false;
  }
}

async function runServerRestart(ctx: ConfigCtx, pollIntervalMs: number, maxAttempts: number): Promise<void> {
  let res: RestartResponse | null;
  try {
    res = (await ctx.api.request("/api/v1/system/restart", { method: "POST", body: {} })) as RestartResponse | null;
  } catch (e) {
    showBanner(ctx.root, "error", "Restart request failed: " + String((e && (e as Error).message) || e));
    return;
  }
  if (!res || res.success === false) {
    // 409 dev-watch carries a specific reason — show it verbatim, never a
    // generic message (APUX fix-loop 1 lesson).
    const reason = (res && (res.reason || res.error)) || "restart refused";
    showBanner(ctx.root, "error", "Restart refused: " + reason);
    return;
  }
  showBanner(
    ctx.root,
    "success",
    "Restarting (" + res.mode + " mode)… waiting for the server to come back.",
    { persist: true },
  );
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    try {
      const health = await ctx.api.request("/health");
      if (health) {
        showBanner(ctx.root, "success", "Server is back up.");
        ctx.render();
        return;
      }
    } catch {
      // Expected while the listener is down — keep polling.
    }
  }
  showBanner(
    ctx.root,
    "error",
    "Server did not come back after " + Math.round((maxAttempts * pollIntervalMs) / 1000) +
      " s — check the server process (respawn mode cannot recover if the replacement failed to bind).",
  );
}

export async function handleConfigReveal(ctx: ConfigCtx, targetId: string, section?: string, field?: string): Promise<void> {
  const el = ctx.doc && ctx.doc.getElementById ? ctx.doc.getElementById(targetId) : null;
  if (!el) return;
  if (el.type === "text" && el.dataset.revealed === "true") {
    // Hide: mask the display only (type back to password). Do NOT overwrite
    // el.value with the literal "***" sentinel — on a field whose real
    // stored value is empty, that fabricates a submittable value that used
    // to be persisted verbatim as the real secret (F7/APCR-05). Leaving
    // el.value untouched also preserves an edit the operator made while the
    // field was revealed, instead of silently discarding it.
    el.type = "password";
    el.dataset.revealed = "";
    return;
  }
  if (!ctx.api || !section || !field) {
    if (el.type === "password") el.type = "text";
    return;
  }
  try {
    const res = (await ctx.api.request(
      "/api/v1/config/reveal?section=" + encodeURIComponent(section) + "&field=" + encodeURIComponent(field),
    )) as { success?: boolean; data?: { value?: string } } | null;
    if (res && res.success !== false && res.data) {
      el.value = res.data.value || "";
      el.type = "text";
      el.dataset.revealed = "true";
    }
  } catch {
    if (el.type === "password") el.type = "text";
  }
}
