/**
 * Public-surface contract for the `app.js` module set.
 *
 * `app.js` is imported two ways and both are load-bearing:
 *
 *   - `await import("../static/app.js")` — every suite in this package reads
 *     named exports off the module namespace.
 *   - `<script type="module" src="/ui/app.js">` — the browser bootstrap, which
 *     publishes `globalThis.MASSA_AI_UI` for anything reaching the app through
 *     the global instead of an import.
 *
 * The two lists are deliberately NOT the same set, and the difference is the
 * part worth pinning: five symbols are reachable only through `MASSA_AI_UI`
 * (`startApp` and `renderDashboard` among them), and `readLogsLivePreference`
 * is a named export that was never added to the global object.
 *
 * This exists because `app.js` became a barrel over `lib/` + `views/` modules.
 * A barrel drops a symbol silently — the re-export just stops being written,
 * every other suite keeps passing because it imports something else, and the
 * loss surfaces as a blank tab in a browser nobody ran. Freezing both lists
 * literally means a dropped or accidentally-added symbol fails here, by name,
 * on the next run.
 *
 * Adding a symbol is expected to fail this test once: add it to the list below
 * in the same commit that exports it.
 */

import { describe, it, expect } from "bun:test";

const mod = (await import("../static/app.js")) as Record<string, unknown>;
const UI = ((globalThis as unknown as { MASSA_AI_UI?: Record<string, unknown> }).MASSA_AI_UI ??
  {}) as Record<string, unknown>;

/** Every named export of `app.js`, frozen at the pre-split commit (6a0b1c2d). */
const EXPECTED_NAMED_EXPORTS = [
  "CHECKPOINTS_LIST_BODY",
  "MEMORY_LEVELS",
  "MEMORY_TYPES",
  "buildConfigSectionBody",
  "escapeHtml",
  "handleConfigReveal",
  "handleConfigSave",
  "handleIndexStatusEvent",
  "handleLogsExport",
  "handleLogsLiveToggle",
  "handleMemoryDeleteProject",
  "handleMemoryDeleteProjectCancel",
  "handleMemoryDeleteProjectOpen",
  "handleProfileSwitch",
  "handleProfilesTabSwitch",
  "handleProjectIndexProgress",
  "handleRegistryAddProfile",
  "handleRegistryAgentTierEdit",
  "handleRegistryCellEdit",
  "handleRegistryClearOverlay",
  "handleRegistryDeleteProfile",
  "handleRegistryDuplicateProfile",
  "handleRegistryFormCancel",
  "handleRegistryFormToggle",
  "handleRegistryHostDefaultEdit",
  "handleRegistryRestore",
  "handleRegistrySaveAndApply",
  "handleRegistryWorkflowTierAdd",
  "handleRegistryWorkflowTierEdit",
  "handleRegistryWorkflowTierRemove",
  "handleServerRestart",
  "initRegistryOverlay",
  "initTheme",
  "isWriteModeEnabled",
  "joinModelId",
  "markdownToHtml",
  "mergeRegistryForDisplay",
  "readLogsLivePreference",
  "renderCheckpoints",
  "renderConfig",
  "renderHandoffs",
  "renderLogs",
  "renderMemoryBrowser",
  "renderModelRegistry",
  "renderProfiles",
  "renderProfilesView",
  "renderProjects",
  "renderProposals",
  "renderSearch",
  "runLogsLiveStream",
  "runRegenerateStream",
  "showBanner",
  "splitModelId",
  "stopLogsLiveStream",
  "toggleTheme",
].sort();

/** Every key of `globalThis.MASSA_AI_UI`, frozen at the same commit. */
const EXPECTED_UI_KEYS = [
  ...EXPECTED_NAMED_EXPORTS.filter((k) => k !== "readLogsLivePreference"),
  "collectConfigSectionFields",
  "createApiClient",
  "readInjectedApiKey",
  "renderDashboard",
  "startApp",
].sort();

describe("app.js public surface (barrel contract)", () => {
  it("exports exactly the frozen named-export set", () => {
    expect(Object.keys(mod).sort()).toEqual(EXPECTED_NAMED_EXPORTS);
  });

  it("publishes exactly the frozen MASSA_AI_UI key set", () => {
    expect(Object.keys(UI).sort()).toEqual(EXPECTED_UI_KEYS);
  });

  it("every named export is callable/usable, not an undefined re-export hole", () => {
    // A barrel that re-exports a name the source module no longer defines
    // yields `undefined` rather than a missing key, so the two set assertions
    // above would both still pass. This is the assertion that catches it.
    const holes = EXPECTED_NAMED_EXPORTS.filter((k) => mod[k] === undefined);
    expect(holes).toEqual([]);
  });

  it("every MASSA_AI_UI value is defined", () => {
    const holes = EXPECTED_UI_KEYS.filter((k) => UI[k] === undefined);
    expect(holes).toEqual([]);
  });

  it("the five UI-only symbols are genuinely absent from the named exports", () => {
    // Pins the asymmetry itself. If a later change starts exporting `startApp`
    // as a named export, that is a real surface change and should be a decision,
    // not a side effect.
    const uiOnly = EXPECTED_UI_KEYS.filter((k) => !EXPECTED_NAMED_EXPORTS.includes(k));
    expect(uiOnly).toEqual([
      "collectConfigSectionFields",
      "createApiClient",
      "readInjectedApiKey",
      "renderDashboard",
      "startApp",
    ]);
    for (const k of uiOnly) expect(mod[k]).toBeUndefined();
  });

  it("readLogsLivePreference is a named export and is not on MASSA_AI_UI", () => {
    expect(typeof mod.readLogsLivePreference).toBe("function");
    expect(UI.readLogsLivePreference).toBeUndefined();
  });

  it("shared identities: a symbol on both surfaces is the same function object", () => {
    // The barrel must re-export the module's own binding, never a wrapper. A
    // wrapper would break `mock.module`-style substitution and would make the
    // two surfaces drift under a later edit.
    const shared = EXPECTED_NAMED_EXPORTS.filter((k) => EXPECTED_UI_KEYS.includes(k));
    const mismatched = shared.filter((k) => mod[k] !== UI[k]);
    expect(mismatched).toEqual([]);
  });
});
