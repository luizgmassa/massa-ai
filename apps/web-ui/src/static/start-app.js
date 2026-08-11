/**
 * Browser bootstrap: app state, the view dispatcher, and DOM wiring.
 *
 * This module is the only place that knows about the live DOM, the hash route,
 * the SSE subscription and the `beforeunload` guard. Everything it renders and
 * every write it performs lives in `views/` — it builds the one
 * `ctx = { api, root, state, render, doc }` those handlers take and wires it to
 * the markup they produced.
 */

import { renderDashboard, fetchDashboardData } from "./dashboard.js";
import { wireViewHandlers } from "./wire-view-handlers.js";
import { escapeHtml, errorBlock } from "./lib/html.js";
import { createApiClient, isWriteModeEnabled } from "./lib/api-client.js";
import { initTheme, toggleTheme } from "./lib/theme.js";
import { renderProjects, handleIndexStatusEvent, clearIndexPoll, startIndexPoll } from "./views/projects.js";
import { renderMemoryBrowser } from "./views/memory.js";
import { renderSearch } from "./views/search.js";
import { renderHandoffs } from "./views/handoffs.js";
import { renderProposals } from "./views/proposals.js";
import { CHECKPOINTS_LIST_BODY, renderCheckpoints } from "./views/checkpoints.js";
import {
  renderLogs,
  logsDatetimeLocalToIso,
  readLogsLivePreference,
  runLogsLiveStream,
  stopLogsLiveStream,
} from "./views/logs.js";
import { renderConfig } from "./views/config.js";
import { PROFILES_TAB_STORAGE_KEY, renderProfilesView } from "./views/profiles.js";
import { renderModelRegistry } from "./views/registry.js";
import { initRegistryOverlay, mergeRegistryForDisplay } from "./views/registry-state.js";

export function startApp(opts) {
  opts = opts || {};
  const doc = opts.document || (typeof document !== "undefined" ? document : null);
  if (!doc) return;
  const root = doc.getElementById("app");
  const projectSelect = doc.getElementById("project-select");
  const themeToggle = doc.getElementById("theme-toggle");
  const api = createApiClient({ base: opts.base });

  const state = {
    view: "projects",
    project: "",
    memoryFilters: { type: "", level: "", minImportance: "" },
    memoryOffset: 0,
    searchQuery: "",
    profilesTab: "switch",
    registryOverlay: null,
    registryDirty: false,
    registryLoaded: false,
    registryForm: null,
    regenerating: false,
    indexJobId: null,
    indexJobStatus: null,
    indexJobPhase: null,
    indexJobFileCount: null,
    indexPollInterval: null,
    // Logs tab (design § 3f, LOG-13): from/to/level/q filters, the Live
    // toggle, the streamed-entry accumulator, and the live stream's
    // AbortController — the last two are populated by T15's handlers, not by
    // this render path.
    logsFrom: "",
    logsTo: "",
    logsLevel: "",
    logsQuery: "",
    logsLive: false,
    logsEntries: [],
    logsStreamAbort: null,
  };
  try {
    if (typeof localStorage !== "undefined") {
      const t = localStorage.getItem(PROFILES_TAB_STORAGE_KEY);
      if (t === "switch" || t === "registry") state.profilesTab = t;
    }
  } catch {
    // localStorage unavailable — default switch tab
  }

  initTheme(doc);

  function setNavActive() {
    doc.querySelectorAll(".nav a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === "#" + hashFor(state.view));
    });
  }
  function hashFor(view) {
    return "/" + view;
  }
  function viewFromHash(h) {
    const name = (h || "").replace(/^#\/?/, "");
    return ["projects", "memory", "search", "handoffs", "proposals", "checkpoints", "dashboard", "logs", "config", "profiles", "model-registry"].includes(name)
      ? name
      : "projects";
  }

  async function refreshProjectsForSelect() {
    try {
      const data = await api.request("/api/v1/project/list");
      const projects = ((data && data.data) || {}).projects || [];
      projectSelect.innerHTML =
        '<option value="">(select)</option>' +
        projects
          .map((p) => {
            const id = p.projectId || p.id || "";
            return '<option value="' + escapeHtml(id) + '">' + escapeHtml(id) + "</option>";
          })
          .join("");
    } catch {}
  }

  async function render() {
    setNavActive();
    // F4 fold: clear index poll interval when navigating away from projects
    if (state.view !== "projects") clearIndexPoll({ state });
    // T15 (LOG-14/15 teardown): abort any in-flight Logs live-tail stream
    // when navigating away from the logs view — mirrors clearIndexPoll()'s
    // discipline above.
    if (state.view !== "logs") stopLogsLiveStream({ state });
    try {
      if (state.view === "projects") {
        const data = await api.request("/api/v1/project/list");
        root.innerHTML = renderProjects((data && data.data) || { projects: [] }, {
          indexJobId: state.indexJobId,
          indexJobStatus: state.indexJobStatus,
          indexJobPhase: state.indexJobPhase,
          indexJobFileCount: state.indexJobFileCount,
        });
        // If a job completed, refresh project list
        if (state.indexJobStatus === "completed" || state.indexJobStatus === "failed") {
          // Clear the completed job after a render so the progress line disappears on next nav
          // but keep it visible until then
        }
      } else if (state.view === "memory") {
        const body = {
          limit: 50,
          offset: state.memoryOffset,
        };
        if (state.memoryFilters.type) body.type = state.memoryFilters.type;
        if (state.memoryFilters.level) body.level = Number(state.memoryFilters.level);
        if (state.memoryFilters.minImportance !== "")
          body.minImportance = Number(state.memoryFilters.minImportance);
        if (state.project) body.projectId = state.project;
        const data = await api.request("/api/v1/memory/list", { method: "POST", body });
        root.innerHTML = renderMemoryBrowser(data, {
          filters: state.memoryFilters,
          project: state.project,
          memoryBulkForm: state.memoryBulkForm,
        });
      } else if (state.view === "search") {
        let data = null;
        if (state.searchQuery.trim()) {
          const body = { query: state.searchQuery, format: "json", limit: 20 };
          if (state.project) body.projectId = state.project;
          data = await api.request("/api/v1/memory/search", { method: "POST", body });
        }
        root.innerHTML = renderSearch(data, { query: state.searchQuery });
      } else if (state.view === "handoffs") {
        let data = null;
        if (state.project) {
          data = await api.request("/api/v1/handoff/list", {
            method: "POST",
            body: { projectId: state.project },
          });
        }
        root.innerHTML = renderHandoffs(data, { project: state.project });
      } else if (state.view === "proposals") {
        let data = null;
        if (state.project) {
          data = await api.request("/api/v1/proposal/list", {
            method: "POST",
            body: { projectId: state.project },
          });
        }
        root.innerHTML = renderProposals(data, { project: state.project });
      } else if (state.view === "checkpoints") {
        const body = { ...CHECKPOINTS_LIST_BODY };
        if (state.project) body.projectId = state.project;
        const data = await api.request("/api/v1/checkpoints/list", { method: "POST", body });
        root.innerHTML = renderCheckpoints(data);
      } else if (state.view === "dashboard") {
        const data = await fetchDashboardData(api);
        root.innerHTML = renderDashboard(data);
      } else if (state.view === "logs") {
        const params = new URLSearchParams();
        const fromIso = logsDatetimeLocalToIso(state.logsFrom);
        const toIso = logsDatetimeLocalToIso(state.logsTo);
        if (fromIso) params.set("from", fromIso);
        if (toIso) params.set("to", toIso);
        if (state.logsLevel) params.set("level", state.logsLevel);
        if (state.logsQuery) params.set("q", state.logsQuery);
        const qs = params.toString();
        const data = await api.request("/api/v1/logs" + (qs ? "?" + qs : ""));
        // Seed Live from the stored preference only when this session has not
        // decided yet, so a toggle made in this page always outranks it.
        if (state.logsLive === undefined) {
          const stored = readLogsLivePreference();
          if (stored !== undefined) state.logsLive = stored;
        }
        root.innerHTML = renderLogs(data, state);
        // Resume the tail after the markup exists — `appendLogsLiveEntry`
        // needs the tbody it patches into to be on screen already.
        if (state.logsLive) runLogsLiveStream({ api, root, state, render });
      } else if (state.view === "config") {
        const data = await api.request("/api/v1/config");
        if (data && data.success === false) {
          root.innerHTML = '<section class="view"><h2>Config</h2>' + errorBlock(data) + "</section>";
        } else {
          root.innerHTML = renderConfig((data && data.data) || { config: {}, restartNeededSections: [] }, { writeMode: isWriteModeEnabled() });
        }
      } else if (state.view === "profiles") {
        const profilesRes = await api.request("/api/v1/profiles");
        const registryRes = await api.request("/api/v1/model-registry");
        const registryData = (registryRes && registryRes.success !== false && registryRes.data) || { registry: {}, source: {}, _error: registryRes && registryRes.error };
        const ctxObj = { api, root, state, render, doc };
        initRegistryOverlay(ctxObj, registryData.registry, registryData.source);
        // Cached so handleRegistryDuplicateProfile/handleRegistryDeleteProfile (Component 3,
        // triggered from wireViewHandlers' own `ctx`, not ctxObj) can read the same display
        // registry this render used, instead of only the raw overlay (APCR-11.5).
        state.registryServerData = registryData;
        const displayData = mergeRegistryForDisplay(registryData, state.registryOverlay);
        root.innerHTML = renderProfilesView(
          (profilesRes && profilesRes.data) || { hosts: [] },
          displayData,
          { profilesTab: state.profilesTab || "switch", writeMode: isWriteModeEnabled(), unsaved: state.registryDirty, registryForm: state.registryForm },
        );
      } else if (state.view === "model-registry") {
        const data = await api.request("/api/v1/model-registry");
        const ctxObj = { api, root, state, render, doc };
        const regData = (data && data.data) || { registry: {}, source: {} };
        initRegistryOverlay(ctxObj, regData.registry, regData.source);
        state.registryServerData = regData;
        const displayData = mergeRegistryForDisplay(regData, state.registryOverlay);
        root.innerHTML = renderModelRegistry(displayData, { writeMode: isWriteModeEnabled(), unsaved: state.registryDirty, registryForm: state.registryForm });
      }
    } catch (e) {
      root.innerHTML = '<div class="error">Connection error: ' + escapeHtml(String(e.message || e)) + "</div>";
    }
    wireViewHandlers({ api, root, state, render, doc });
  }


  // global controls
  themeToggle?.addEventListener("click", () => toggleTheme(doc));
  projectSelect?.addEventListener("change", () => {
    state.project = projectSelect.value;
    // Edge case (spec P1-Bulk): a project change while the bulk-delete
    // confirmation is open closes it without issuing a request — the typed
    // value belonged to the previous project.
    state.memoryBulkForm = null;
    render();
  });
  doc.querySelectorAll(".nav a").forEach((a) => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      state.view = viewFromHash(a.getAttribute("href"));
      if (globalThis.location) globalThis.location.hash = hashFor(state.view);
      render();
    });
  });
  if (globalThis.location) {
    state.view = viewFromHash(globalThis.location.hash);
    globalThis.addEventListener?.("hashchange", () => {
      state.view = viewFromHash(globalThis.location.hash);
      render();
    });
  }

  refreshProjectsForSelect().finally(render);

  // F2 fold: beforeunload guard when registry has unsaved changes.
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", (ev) => {
      // F4 fold: clear index poll on unload
      clearIndexPoll({ state });
      if (state.registryDirty) {
        ev.preventDefault();
        ev.returnValue = "You have unsaved registry changes. Leave anyway?";
        return ev.returnValue;
      }
    });
  }

  // SSE: subscribe to /api/v1/events for real-time updates (Wave 7 T10)
  // T8: extend to track index_status for the tracked jobId (PRG-02) + poll fallback (PRG-03).
  if (typeof EventSource !== "undefined") {
    try {
      const sseBase = opts.base || "";
      const es = new EventSource(sseBase + "/api/v1/events");
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          // PRG-02: update index progress when jobId matches
          if (data && (data.type === "index_status" || data.event === "index_status")) {
            const payload = data.payload || data;
            const ctxObj = { api, root, state, render, doc };
            if (handleIndexStatusEvent(ctxObj, payload)) {
              if (state.view === "projects") render();
            }
            return; // handled; don't double-render
          }
          // Refresh current view on observation events
          if (data && (data.type === "observation" || data.event === "observation")) {
            render();
          }
        } catch {
          // ignore parse errors
        }
      };
      es.onerror = () => {
        // PRG-03: start polling fallback when SSE errors + a job is tracked
        if (state.indexJobId && state.indexJobStatus !== "completed" && state.indexJobStatus !== "failed" && !state.indexPollInterval) {
          startIndexPoll({ api, root, state, render, doc }, state.indexJobId);
        }
      };
    } catch {
      // EventSource unavailable — polling fallback starts when a job is tracked
    }
  }
  // PRG-03: if EventSource is unavailable and a job is tracked, poll immediately.
  // (startIndexPoll is called from handleProjectIndex when EventSource is absent.)
}
