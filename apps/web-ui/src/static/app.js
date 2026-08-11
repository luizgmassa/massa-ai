/**
 * massa-ai Web UI — app.js (admin portal entry point).
 *
 * This file is a barrel. The app lives in `lib/` (shared leaves) and `views/`
 * (one module per tab, each owning its renderer and its write handlers), with
 * `start-app.js` holding the browser bootstrap.
 *
 * It exists as a single entry point because two callers depend on one:
 * `index.html` loads `/ui/app.js` as a module, and every suite in this package
 * imports `../static/app.js` and reads `globalThis.MASSA_AI_UI`.
 *
 * The two surfaces are deliberately not the same set — five symbols are
 * reachable only through `MASSA_AI_UI`, and `readLogsLivePreference` is a named
 * export that is not on it. `public-surface.test.ts` freezes both lists
 * literally, because a barrel drops a symbol silently: the re-export just stops
 * being written and nothing else notices.
 *
 * Write operations are gated by `isWriteModeEnabled()` (default ON for trusted
 * local callers carrying the massa-ai-api-key meta tag). Any /api/v1/* route is
 * callable with the injected key; trust is the gate, not a path blocklist.
 */

import { renderDashboard } from "./dashboard.js";
import { escapeHtml } from "./lib/html.js";
import { markdownToHtml } from "./lib/markdown.js";
import { initTheme, toggleTheme } from "./lib/theme.js";
import { readInjectedApiKey, isWriteModeEnabled, createApiClient } from "./lib/api-client.js";
import { showBanner } from "./lib/banner.js";
import { startApp } from "./start-app.js";

import { renderProjects, handleProjectIndexProgress, handleIndexStatusEvent } from "./views/projects.js";
import {
  MEMORY_TYPES,
  MEMORY_LEVELS,
  renderMemoryBrowser,
  handleMemoryDeleteProjectOpen,
  handleMemoryDeleteProjectCancel,
  handleMemoryDeleteProject,
} from "./views/memory.js";
import { renderSearch } from "./views/search.js";
import { renderHandoffs } from "./views/handoffs.js";
import { renderProposals } from "./views/proposals.js";
import { CHECKPOINTS_LIST_BODY, renderCheckpoints } from "./views/checkpoints.js";
import {
  renderLogs,
  readLogsLivePreference,
  runLogsLiveStream,
  stopLogsLiveStream,
  handleLogsLiveToggle,
  handleLogsExport,
} from "./views/logs.js";
import {
  renderConfig,
  buildConfigSectionBody,
  collectConfigSectionFields,
  handleConfigSave,
  handleConfigReveal,
  handleServerRestart,
} from "./views/config.js";
import {
  renderProfiles,
  renderProfilesView,
  handleProfilesTabSwitch,
  handleProfileSwitch,
} from "./views/profiles.js";
import { renderModelRegistry, splitModelId, joinModelId } from "./views/registry.js";
import {
  initRegistryOverlay,
  mergeRegistryForDisplay,
  handleRegistryCellEdit,
  handleRegistryHostDefaultEdit,
  handleRegistryAgentTierEdit,
  handleRegistryWorkflowTierEdit,
  handleRegistryFormToggle,
  handleRegistryFormCancel,
  handleRegistryWorkflowTierAdd,
  handleRegistryWorkflowTierRemove,
  handleRegistryAddProfile,
  handleRegistryDuplicateProfile,
  handleRegistryDeleteProfile,
  handleRegistryRestore,
  handleRegistryClearOverlay,
  runRegenerateStream,
  handleRegistrySaveAndApply,
} from "./views/registry-state.js";

export {
  CHECKPOINTS_LIST_BODY,
  MEMORY_LEVELS,
  MEMORY_TYPES,
  buildConfigSectionBody,
  escapeHtml,
  handleConfigReveal,
  handleConfigSave,
  handleIndexStatusEvent,
  handleLogsExport,
  handleLogsLiveToggle,
  handleMemoryDeleteProject,
  handleMemoryDeleteProjectCancel,
  handleMemoryDeleteProjectOpen,
  handleProfileSwitch,
  handleProfilesTabSwitch,
  handleProjectIndexProgress,
  handleRegistryAddProfile,
  handleRegistryAgentTierEdit,
  handleRegistryCellEdit,
  handleRegistryClearOverlay,
  handleRegistryDeleteProfile,
  handleRegistryDuplicateProfile,
  handleRegistryFormCancel,
  handleRegistryFormToggle,
  handleRegistryHostDefaultEdit,
  handleRegistryRestore,
  handleRegistrySaveAndApply,
  handleRegistryWorkflowTierAdd,
  handleRegistryWorkflowTierEdit,
  handleRegistryWorkflowTierRemove,
  handleServerRestart,
  initRegistryOverlay,
  initTheme,
  isWriteModeEnabled,
  joinModelId,
  markdownToHtml,
  mergeRegistryForDisplay,
  readLogsLivePreference,
  renderCheckpoints,
  renderConfig,
  renderHandoffs,
  renderLogs,
  renderMemoryBrowser,
  renderModelRegistry,
  renderProfiles,
  renderProfilesView,
  renderProjects,
  renderProposals,
  renderSearch,
  runLogsLiveStream,
  runRegenerateStream,
  showBanner,
  splitModelId,
  stopLogsLiveStream,
  toggleTheme,
};

// Export pure helpers + bootstrap on globalThis for both browser and Node import.
const MASSA_AI_UI = {
  markdownToHtml,
  escapeHtml,
  renderProjects,
  renderMemoryBrowser,
  renderSearch,
  renderHandoffs,
  renderProposals,
  renderCheckpoints,
  renderDashboard,
  renderLogs,
  renderConfig,
  buildConfigSectionBody,
  collectConfigSectionFields,
  renderProfiles,
  renderModelRegistry,
  splitModelId,
  joinModelId,
  initTheme,
  toggleTheme,
  isWriteModeEnabled,
  createApiClient,
  readInjectedApiKey,
  startApp,
  showBanner,
  handleConfigSave,
  handleServerRestart,
  handleConfigReveal,
  handleMemoryDeleteProjectOpen,
  handleMemoryDeleteProjectCancel,
  handleMemoryDeleteProject,
  stopLogsLiveStream,
  runLogsLiveStream,
  handleLogsLiveToggle,
  handleLogsExport,
  renderProfilesView,
  handleProfilesTabSwitch,
  handleProfileSwitch,
  initRegistryOverlay,
  mergeRegistryForDisplay,
  handleRegistryCellEdit,
  handleRegistryHostDefaultEdit,
  handleRegistryAgentTierEdit,
  handleRegistryWorkflowTierEdit,
  handleRegistryFormToggle,
  handleRegistryFormCancel,
  handleRegistryWorkflowTierAdd,
  handleRegistryWorkflowTierRemove,
  handleRegistryAddProfile,
  handleRegistryDuplicateProfile,
  handleRegistryDeleteProfile,
  handleRegistryRestore,
  handleRegistryClearOverlay,
  runRegenerateStream,
  handleRegistrySaveAndApply,
  handleProjectIndexProgress,
  handleIndexStatusEvent,
  MEMORY_TYPES,
  MEMORY_LEVELS,
  CHECKPOINTS_LIST_BODY,
};
if (typeof globalThis !== "undefined") {
  globalThis.MASSA_AI_UI = MASSA_AI_UI;
}

// Auto-start in a browser environment.
if (typeof document !== "undefined") {
  // defer until DOMContentLoaded if needed
  const ready = document.readyState;
  if (ready === "loading") {
    document.addEventListener("DOMContentLoaded", () => startApp());
  } else {
    startApp();
  }
}
