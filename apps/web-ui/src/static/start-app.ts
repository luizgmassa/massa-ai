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
import type { LogsDoc } from "./views/logs.js";
import { renderConfig } from "./views/config.js";
import type { ConfigDocument } from "./views/config.js";
import { PROFILES_TAB_STORAGE_KEY, renderProfilesView } from "./views/profiles.js";
import { renderModelRegistry } from "./views/registry.js";
import { initRegistryOverlay, mergeRegistryForDisplay } from "./views/registry-state.js";

/** Per-endpoint response envelope shapes, extracted from each renderer's own
 *  (mostly unexported) parameter type via `Parameters<typeof fn>[n]` rather
 *  than re-declared here — this is the same idiom already used for `root`
 *  typing elsewhere (e.g. `ProfileSwitchCtx.root: Parameters<typeof
 *  showBanner>[0]` in `views/profiles.ts`), so each shape can never drift from
 *  the function that actually consumes it. */
type ProjectListResult = { data?: Parameters<typeof renderProjects>[0] } | null | undefined;
type MemoryListResult = Parameters<typeof renderMemoryBrowser>[0];
type SearchApiResult = Parameters<typeof renderSearch>[0];
type HandoffsApiResult = Parameters<typeof renderHandoffs>[0];
type ProposalsApiResult = Parameters<typeof renderProposals>[0];
type CheckpointsApiResult = Parameters<typeof renderCheckpoints>[0];
type LogsApiResult = Parameters<typeof renderLogs>[0];
type ConfigApiResult = { success?: boolean; data?: Parameters<typeof renderConfig>[0]; error?: unknown } | null | undefined;
type ProfilesApiResult = { data?: Parameters<typeof renderProfilesView>[0] } | null | undefined;
type RegistryOfProfilesApiResult = { success?: boolean; data?: Parameters<typeof renderProfilesView>[1]; error?: unknown } | null | undefined;
type ModelRegistryApiResult = { data?: Parameters<typeof renderModelRegistry>[0] } | null | undefined;

/** View names the hash router recognizes; anything else falls back to "projects". */
const KNOWN_VIEWS = [
  "projects",
  "memory",
  "search",
  "handoffs",
  "proposals",
  "checkpoints",
  "dashboard",
  "logs",
  "config",
  "profiles",
  "model-registry",
] as const;
type ViewName = (typeof KNOWN_VIEWS)[number];

interface AppMemoryFilters {
  type: string;
  level: string;
  minImportance: string;
  [key: string]: string;
}

interface AppLogEntry {
  ts?: string;
  level?: string;
  message?: string;
  meta?: unknown;
}

/**
 * The one app-wide state object every view reads and mutates through its own
 * ctx. Kept as a single flat shape (matching the pre-conversion object
 * literal) rather than one interface per tab, because every view already
 * receives the SAME object — splitting it here would just be a second,
 * divergent copy of the per-view `*State` interfaces those modules already
 * declare for themselves. `registryOverlay`/`registryServerData` reuse
 * `mergeRegistryForDisplay`'s own (unexported) parameter/return types for the
 * same reason.
 */
interface AppState {
  view: ViewName;
  project: string;
  memoryFilters: AppMemoryFilters;
  memoryOffset: number;
  memoryBulkForm?: { error?: string | null } | null;
  searchQuery: string;
  profilesTab: string;
  // `null` is excluded (unlike `mergeRegistryForDisplay`'s own overlay
  // parameter, which accepts it): `initRegistryOverlay`'s ctx.state field
  // type does not, and every read site in registry-state.ts treats
  // null/undefined identically via a truthy check, so dropping null here is
  // behaviour-neutral — RegistryOverlay|undefined is still assignable
  // wherever RegistryOverlay|null|undefined is expected.
  registryOverlay?: Exclude<Parameters<typeof mergeRegistryForDisplay>[1], null>;
  registryDirty: boolean;
  registryLoaded: boolean;
  registryForm: { kind?: string } | null;
  registryServerData?: Exclude<Parameters<typeof mergeRegistryForDisplay>[0], null>;
  regenerating: boolean;
  indexJobId: string | null;
  indexJobStatus: string | null;
  indexJobPhase: string | null;
  indexJobFileCount: number | null;
  indexPollInterval: ReturnType<typeof setInterval> | null;
  // Logs tab (design § 3f, LOG-13): from/to/level/q filters, the Live
  // toggle, the streamed-entry accumulator, and the live stream's
  // AbortController — the last two are populated by T15's handlers, not by
  // this render path.
  logsFrom: string;
  logsTo: string;
  logsLevel: string;
  logsQuery: string;
  logsLive?: boolean;
  logsEntries: AppLogEntry[];
  logsStreamAbort: AbortController | null;
  [key: string]: unknown;
}

/**
 * Structural DOM element shape, not a real DOM type — production passes a
 * real `Element` (`doc.getElementById("app")`), the fake-DOM test harness in
 * `start-app-dispatch.test.ts` passes a plain object. Mirrors
 * `wire-view-handlers.ts`'s own `WireElement`: `root` is threaded, unmodified,
 * into every `views/*.ts` handler's own — differently shaped but structurally
 * compatible — `*Ctx.root` parameter, exactly like `wireViewHandlers` itself
 * already does for the click/change wiring it owns.
 */
interface AppRootElement {
  dataset: Record<string, string>;
  type: string;
  checked?: boolean;
  value: string;
  remove?: () => void;
  innerHTML: string;
  textContent?: string;
  addEventListener: (type: string, listener: (ev?: unknown) => void) => void;
  closest?: (selectors: string) => AppRootElement | null;
  querySelectorAll: (selectors: string) => AppRootElement[];
  querySelector: (selectors: string) => AppRootElement | null;
  insertBefore?: (node: unknown, ref: unknown) => unknown;
  firstChild?: unknown;
  children?: unknown[];
}

interface AppStartOpts {
  document?: Document | null;
  base?: string;
}

export function startApp(opts?: AppStartOpts): void {
  opts = opts || {};
  const maybeDoc = opts.document || (typeof document !== "undefined" ? document : null);
  if (!maybeDoc) return;
  const doc: Document = maybeDoc;
  const root = doc.getElementById("app") as unknown as AppRootElement;
  const projectSelect = doc.getElementById("project-select") as HTMLSelectElement;
  const themeToggle = doc.getElementById("theme-toggle")!;
  const api = createApiClient({ base: opts.base });

  const state: AppState = {
    view: "projects",
    project: "",
    memoryFilters: { type: "", level: "", minImportance: "" },
    memoryOffset: 0,
    searchQuery: "",
    profilesTab: "switch",
    registryOverlay: undefined,
    registryDirty: false,
    registryLoaded: false,
    registryForm: null,
    regenerating: false,
    indexJobId: null,
    indexJobStatus: null,
    indexJobPhase: null,
    indexJobFileCount: null,
    indexPollInterval: null,
    logsFrom: "",
    logsTo: "",
    logsLevel: "",
    logsQuery: "",
    // Seeded once from the stored preference (T44/WUT-19): the pre-fix code
    // seeded `false` unconditionally and then guarded a re-read behind
    // `state.logsLive === undefined`, a condition that literal `false` can
    // never satisfy, so `writeLogsLivePreference` had never once been read
    // back. Reading it here, exactly once, keeps the same "a toggle made in
    // this page always outranks the stored value" property the removed
    // per-render guard protected — after this seed, `state.logsLive` is
    // always a concrete boolean, never `undefined` again, so no later render
    // re-reads storage over an in-session choice.
    logsLive: readLogsLivePreference() ?? false,
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

  // The one ctx object every view handler below takes — built once so every
  // call site shares the same live `root`/`state`/`api`/`render`/`doc`
  // bindings instead of re-allocating an equivalent literal per call (the
  // pre-conversion source built an equivalent `{ api, root, state, render,
  // doc }` object ad hoc at each of these call sites). `doc` (T39, D9):
  // `handleConfigReveal` and `handleLogsExport` both read it — dropping it
  // silently no-ops the Config tab's secret-reveal button and the Logs
  // export. The real `Document` cannot satisfy `ConfigDocument`/`LogsDoc`
  // directly under structural typing (`Document.body.appendChild`'s
  // generic signature is what T28 collided on), so the two structural
  // types are reused unmodified and the real value is cast to their
  // intersection once, here, at the boundary — never widened, never
  // dropped again.
  const ctx = { api, root, state, render, doc: doc as unknown as ConfigDocument & LogsDoc };

  function setNavActive(): void {
    doc.querySelectorAll(".nav a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === "#" + hashFor(state.view));
    });
  }
  function hashFor(view: string): string {
    return "/" + view;
  }
  function viewFromHash(h: string | null | undefined): ViewName {
    const name = (h || "").replace(/^#\/?/, "");
    return (KNOWN_VIEWS as readonly string[]).includes(name) ? (name as ViewName) : "projects";
  }

  async function refreshProjectsForSelect(): Promise<void> {
    try {
      const res = (await api.request("/api/v1/project/list")) as ProjectListResult;
      const projects = ((res && res.data) || { projects: [] }).projects || [];
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

  async function render(): Promise<void> {
    setNavActive();
    // F4 fold: clear index poll interval when navigating away from projects
    if (state.view !== "projects") clearIndexPoll(ctx);
    // T15 (LOG-14/15 teardown): abort any in-flight Logs live-tail stream
    // when navigating away from the logs view — mirrors clearIndexPoll()'s
    // discipline above.
    if (state.view !== "logs") stopLogsLiveStream(ctx);
    try {
      if (state.view === "projects") {
        const res = (await api.request("/api/v1/project/list")) as ProjectListResult;
        root.innerHTML = renderProjects((res && res.data) || { projects: [] }, {
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
        const body: Record<string, unknown> = {
          limit: 50,
          offset: state.memoryOffset,
        };
        if (state.memoryFilters.type) body.type = state.memoryFilters.type;
        if (state.memoryFilters.level) body.level = Number(state.memoryFilters.level);
        if (state.memoryFilters.minImportance !== "")
          body.minImportance = Number(state.memoryFilters.minImportance);
        if (state.project) body.projectId = state.project;
        const data = (await api.request("/api/v1/memory/list", { method: "POST", body })) as MemoryListResult;
        root.innerHTML = renderMemoryBrowser(data, {
          filters: state.memoryFilters,
          project: state.project,
          memoryBulkForm: state.memoryBulkForm,
        });
      } else if (state.view === "search") {
        let data: SearchApiResult = null;
        if (state.searchQuery.trim()) {
          const body: Record<string, unknown> = { query: state.searchQuery, format: "json", limit: 20 };
          if (state.project) body.projectId = state.project;
          data = (await api.request("/api/v1/memory/search", { method: "POST", body })) as SearchApiResult;
        }
        root.innerHTML = renderSearch(data, { query: state.searchQuery });
      } else if (state.view === "handoffs") {
        let data: HandoffsApiResult = null;
        if (state.project) {
          data = (await api.request("/api/v1/handoff/list", {
            method: "POST",
            body: { projectId: state.project },
          })) as HandoffsApiResult;
        }
        root.innerHTML = renderHandoffs(data, { project: state.project });
      } else if (state.view === "proposals") {
        let data: ProposalsApiResult = null;
        if (state.project) {
          data = (await api.request("/api/v1/proposal/list", {
            method: "POST",
            body: { projectId: state.project },
          })) as ProposalsApiResult;
        }
        root.innerHTML = renderProposals(data, { project: state.project });
      } else if (state.view === "checkpoints") {
        const body: Record<string, unknown> = { ...CHECKPOINTS_LIST_BODY };
        if (state.project) body.projectId = state.project;
        const data = (await api.request("/api/v1/checkpoints/list", { method: "POST", body })) as CheckpointsApiResult;
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
        const data = (await api.request("/api/v1/logs" + (qs ? "?" + qs : ""))) as LogsApiResult;
        root.innerHTML = renderLogs(data, state);
        // Resume the tail after the markup exists — `appendLogsLiveEntry`
        // needs the tbody it patches into to be on screen already.
        if (state.logsLive) runLogsLiveStream(ctx);
      } else if (state.view === "config") {
        const data = (await api.request("/api/v1/config")) as ConfigApiResult;
        if (data && data.success === false) {
          root.innerHTML = '<section class="view"><h2>Config</h2>' + errorBlock(data) + "</section>";
        } else {
          root.innerHTML = renderConfig((data && data.data) || { config: {}, restartNeededSections: [] }, { writeMode: isWriteModeEnabled() });
        }
      } else if (state.view === "profiles") {
        const profilesRes = (await api.request("/api/v1/profiles")) as ProfilesApiResult;
        const registryRes = (await api.request("/api/v1/model-registry")) as RegistryOfProfilesApiResult;
        const registryData =
          (registryRes && registryRes.success !== false && registryRes.data) ||
          { registry: {}, source: {}, _error: registryRes && registryRes.error };
        initRegistryOverlay(ctx, registryData.registry, registryData.source);
        // Cached so handleRegistryDuplicateProfile/handleRegistryDeleteProfile (Component 3,
        // triggered from wireViewHandlers' own `ctx`, not ctxObj) can read the same display
        // registry this render used, instead of only the raw overlay (APCR-11.5).
        state.registryServerData = registryData;
        // `mergeRegistryForDisplay`'s own return type (`RegistryServerData`,
        // registry-state.ts) and `renderProfilesView`'s expected
        // `RegistryPayload` (registry.ts) are two independently declared
        // shapes that differ only in `agents`' element type — both already
        // converted, neither owned by this task. The cast is the contained
        // fix; the runtime value is the same server-fetched object either way.
        const displayData = mergeRegistryForDisplay(registryData, state.registryOverlay) as unknown as Parameters<typeof renderProfilesView>[1];
        root.innerHTML = renderProfilesView(
          (profilesRes && profilesRes.data) || { hosts: [] },
          displayData,
          { profilesTab: state.profilesTab || "switch", writeMode: isWriteModeEnabled(), unsaved: state.registryDirty, registryForm: state.registryForm },
        );
      } else if (state.view === "model-registry") {
        const data = (await api.request("/api/v1/model-registry")) as ModelRegistryApiResult;
        const regData = (data && data.data) || { registry: {}, source: {} };
        initRegistryOverlay(ctx, regData.registry, regData.source);
        state.registryServerData = regData;
        const displayData = mergeRegistryForDisplay(regData, state.registryOverlay) as unknown as Parameters<typeof renderModelRegistry>[0];
        root.innerHTML = renderModelRegistry(displayData, { writeMode: isWriteModeEnabled(), unsaved: state.registryDirty, registryForm: state.registryForm });
      }
    } catch (e) {
      root.innerHTML = '<div class="error">Connection error: ' + escapeHtml(String((e as { message?: unknown }).message || e)) + "</div>";
    }
    wireViewHandlers(ctx);
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
      clearIndexPoll(ctx);
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
            if (handleIndexStatusEvent(ctx, payload)) {
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
          startIndexPoll(ctx, state.indexJobId);
        }
      };
    } catch {
      // EventSource unavailable — polling fallback starts when a job is tracked
    }
  }
  // PRG-03: if EventSource is unavailable and a job is tracked, poll immediately.
  // (startIndexPoll is called from handleProjectIndex when EventSource is absent.)
}
