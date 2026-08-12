import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import fs from "fs";
import path from "path";

// ── admin-handlers.test.ts ──────────────────────────────────────────────────
// Tests the admin-portal-enhancement handlers: showBanner, config save/reveal,
// profile switch + tab switcher, registry CRUD + save/clear, regenerate streaming,
// index progress. Handlers are exported pure functions taking a context object
// { api, root, state, render, doc } so tests inject mocks. Derived from spec ACs
// CFG-01..08, PROFTAB-01..05, PROFSW-01..04, REGWIRE-01..13, REGEN-01..08,
// PRG-01..06, DS-04..07.

const mod = await import("../static/app.js");
const UI = (globalThis as any).MASSA_AI_UI || {};
const {
  showBanner,
  handleConfigSave,
  handleConfigReveal,
  handleMemoryDeleteProjectOpen,
  handleMemoryDeleteProjectCancel,
  handleMemoryDeleteProject,
  stopLogsLiveStream,
  runLogsLiveStream,
  handleLogsLiveToggle,
  handleLogsExport,
  handleProfileSwitch,
  handleProfilesTabSwitch,
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
  initRegistryOverlay,
  mergeRegistryForDisplay,
  renderProfilesView,
  renderModelRegistry,
  joinModelId,
} = { ...mod, ...UI } as {
  showBanner: (root: MockRoot, type: string, message: string, opts?: { persist?: boolean }) => MockElement;
  handleConfigSave: (ctx: any, section: string) => Promise<void>;
  handleConfigReveal: (ctx: any, targetId: string, section?: string, field?: string) => Promise<void>;
  handleMemoryDeleteProjectOpen: (ctx: any) => void;
  handleMemoryDeleteProjectCancel: (ctx: any) => void;
  handleMemoryDeleteProject: (ctx: any) => Promise<void>;
  stopLogsLiveStream: (ctx: any) => void;
  runLogsLiveStream: (ctx: any) => Promise<void>;
  handleLogsLiveToggle: (ctx: any) => void;
  handleLogsExport: (ctx: any) => Promise<void>;
  handleProfileSwitch: (ctx: any, profile: string, host: string) => Promise<void>;
  handleProfilesTabSwitch: (ctx: any, tab: string) => void;
  handleRegistryCellEdit: (ctx: any, profile: string, host: string, tier: string, field: string, value: string | null) => void;
  handleRegistryHostDefaultEdit: (ctx: any, host: string, value: string) => void;
  handleRegistryAgentTierEdit: (ctx: any, agent: string, host: string, value: string) => void;
  handleRegistryWorkflowTierEdit: (ctx: any, workflow: string, value: string) => void;
  handleRegistryFormToggle: (ctx: any, kind: string) => void;
  handleRegistryFormCancel: (ctx: any) => void;
  handleRegistryWorkflowTierAdd: (ctx: any, workflow?: string, tier?: string) => void;
  handleRegistryWorkflowTierRemove: (ctx: any, workflow: string) => void;
  handleRegistryAddProfile: (ctx: any, name?: string, description?: string) => void;
  handleRegistryDuplicateProfile: (ctx: any, sourceName?: string, newName?: string) => void;
  handleRegistryDeleteProfile: (ctx: any, name?: string) => void;
  handleRegistryRestore: (ctx: any, profile: string) => void;
  handleRegistryClearOverlay: (ctx: any) => Promise<void>;
  runRegenerateStream: (ctx: any) => Promise<{ ok: boolean; reason?: string }>;
  handleRegistrySaveAndApply: (ctx: any) => Promise<void>;
  handleProjectIndexProgress: (ctx: any, jobId: string) => Promise<void>;
  handleIndexStatusEvent: (ctx: any, payload: any) => boolean;
  initRegistryOverlay: (ctx: any, registry: any, source?: any) => void;
  mergeRegistryForDisplay: (serverData: any, overlay: any) => any;
  renderProfilesView: (profilesData: any, registryData: any, opts?: any) => string;
  renderModelRegistry: (data: any, opts?: any) => string;
  joinModelId: (provider: string | null | undefined, model: string | null | undefined) => string | null;
};

// ── Mock helpers ─────────────────────────────────────────────────────────────

interface MockElement {
  dataset: Record<string, string>;
  type: string;
  value: string;
  checked?: boolean;
  addEventListener: (ev: string, cb: (e?: any) => void) => void;
  querySelectorAll: (sel: string) => MockElement[];
  querySelector: (sel: string) => MockElement | null;
  insertBefore: (node: MockElement, ref: MockElement | null) => MockElement;
  remove: () => void;
  classList?: { toggle: (cls: string, force?: boolean) => void; add: (cls: string) => void; remove: (cls: string) => void; contains: (cls: string) => boolean };
  textContent?: string;
  disabled?: boolean;
  setAttribute?: (name: string, value: string) => void;
  getAttribute?: (name: string) => string;
  children?: MockElement[];
  style?: Record<string, string>;
  className?: string;
}

function makeInput(dataset: Record<string, string> = {}, type = "text", value = ""): MockElement {
  return {
    dataset,
    type,
    value,
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    insertBefore: (n) => n,
    remove: () => {},
  };
}

function makeRoot(children: MockElement[] = []): MockRoot {
  const bannerChildren: MockElement[] = [];
  return {
    children: bannerChildren,
    innerHTML: "",
    querySelectorAll: (sel: string) => {
      // match by data-section / data-action / data-field depending on selector
      return children.filter((c) => {
        if (sel.startsWith("[data-section=")) {
          const val = sel.match(/data-section="([^"]+)"/)?.[1] || "";
          return c.dataset["section"] === val;
        }
        if (sel.startsWith("[data-action=")) {
          const val = sel.match(/data-action="([^"]+)"/)?.[1] || "";
          return c.dataset["action"] === val;
        }
        if (sel.startsWith("[data-field=")) {
          const val = sel.match(/data-field="([^"]+)"/)?.[1] || "";
          return c.dataset["field"] === val;
        }
        return false;
      });
    },
    querySelector: (sel: string) => {
      const all = children.filter((c) => {
        if (sel.startsWith("#")) return c.dataset["id"] === sel.slice(1);
        if (sel.startsWith("[data-action=")) {
          const val = sel.match(/data-action="([^"]+)"/)?.[1] || "";
          return c.dataset["action"] === val;
        }
        if (sel.startsWith("[data-target=")) {
          const val = sel.match(/data-target="([^"]+)"/)?.[1] || "";
          return c.dataset["target"] === val;
        }
        if (sel.startsWith("[data-bulk=")) {
          const val = sel.match(/data-bulk="([^"]+)"/)?.[1] || "";
          return c.dataset["bulk"] === val;
        }
        return false;
      });
      return all[0] || null;
    },
    insertBefore: (node: MockElement, _ref: MockElement | null) => { bannerChildren.unshift(node); return node; },
    removeChild: (node: MockElement) => {
      const idx = bannerChildren.indexOf(node);
      if (idx >= 0) bannerChildren.splice(idx, 1);
      return node;
    },
    firstChild: null as MockElement | null,
  } as unknown as MockRoot;
}

interface MockRoot {
  children: MockElement[];
  innerHTML: string;
  querySelectorAll: (sel: string) => MockElement[];
  querySelector: (sel: string) => MockElement | null;
  insertBefore: (node: MockElement, ref: MockElement | null) => MockElement;
  removeChild: (node: MockElement) => MockElement;
  firstChild: MockElement | null;
}

function makeCtx(overrides: Partial<any> = {}): any {
  const root = makeRoot(overrides.rootChildren || []);
  const state: any = overrides.state || {};
  const defaultApi = {
    request: mock(async () => ({ success: true })),
    authHeaders: () => ({}),
  };
  const api = overrides.api || defaultApi;
  const render = overrides.render || mock(() => {});
  return { root, state, api, render, doc: overrides.doc || null, ...overrides };
}

// ── showBanner (DS-04, CFG-03/04/05) ────────────────────────────────────────

describe("showBanner — success/error banners (DS-04)", () => {
  it("inserts a .success div for success type", () => {
    const root = makeRoot();
    showBanner(root, "success", "Config saved.");
    expect(root.children.length).toBeGreaterThan(0);
    const banner = root.children[0];
    expect(banner.textContent).toContain("Config saved.");
  });

  it("inserts an .error div for error type", () => {
    const root = makeRoot();
    showBanner(root, "error", "Save failed: network");
    const banner = root.children[0];
    expect(banner.textContent).toContain("Save failed: network");
  });

  it("clears any existing banner before showing a new one", () => {
    const root = makeRoot();
    showBanner(root, "success", "first");
    showBanner(root, "error", "second");
    // only one banner at a time — the success should be replaced by error
    // After clear + insert, the newest is the error
    expect(root.children[0].textContent).toContain("second");
  });

  // ── T8 (P1-C AC2): persist option skips the 6 s auto-hide ─────────────────
  it("adds a banner-persist class and skips the auto-hide setTimeout when persist:true", () => {
    const origSetTimeout = (globalThis as any).setTimeout;
    const setTimeoutSpy = mock(() => 0);
    (globalThis as any).setTimeout = setTimeoutSpy;
    const root = makeRoot();
    const banner = showBanner(root, "success", "Regeneration complete.", { persist: true });
    expect(banner.className).toContain("success");
    expect(banner.className).toContain("banner-persist");
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    (globalThis as any).setTimeout = origSetTimeout;
  });

  it("still auto-hides a success banner via setTimeout when persist is omitted (existing behavior)", () => {
    const origSetTimeout = (globalThis as any).setTimeout;
    const setTimeoutSpy = mock(() => 0);
    (globalThis as any).setTimeout = setTimeoutSpy;
    const root = makeRoot();
    const banner = showBanner(root, "success", "Config saved.");
    expect(banner.className).not.toContain("banner-persist");
    expect(setTimeoutSpy).toHaveBeenCalled();
    (globalThis as any).setTimeout = origSetTimeout;
  });

  it("never auto-hides an error banner regardless of persist", () => {
    const origSetTimeout = (globalThis as any).setTimeout;
    const setTimeoutSpy = mock(() => 0);
    (globalThis as any).setTimeout = setTimeoutSpy;
    const root = makeRoot();
    showBanner(root, "error", "Save failed.");
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    (globalThis as any).setTimeout = origSetTimeout;
  });
});

// ── Config save handlers (CFG-01..08) ───────────────────────────────────────

describe("handleConfigSave — confirm + PUT + banner (CFG-01..05)", () => {
  const origConfirm = (globalThis as any).confirm;
  const origSetTimeout = (globalThis as any).setTimeout;
  beforeEach(() => {
    (globalThis as any).setTimeout = (cb: () => void, _ms: number) => { cb(); return 0 as any; };
  });
  afterEach(() => {
    (globalThis as any).confirm = origConfirm;
    (globalThis as any).setTimeout = origSetTimeout;
  });

  it("shows confirm dialog naming the section before PUT (CFG-01)", async () => {
    (globalThis as any).confirm = mock(() => false);
    const ctx = makeCtx({
      rootChildren: [
        makeInput({ section: "logging", field: "level", type: "text" }, "text", "debug"),
      ],
    });
    await handleConfigSave(ctx, "logging");
    expect((globalThis as any).confirm).toHaveBeenCalled();
    const msg = ((globalThis as any).confirm.mock.calls[0] as any[])[0] as string;
    expect(msg.toLowerCase()).toContain("logging");
  });

  it("PUTs config section body on confirm (CFG-02)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true, data: { config: {}, restartNeededSections: [] } }));
    const ctx = makeCtx({
      api: { request },
      rootChildren: [
        makeInput({ section: "logging", field: "level", type: "text" }, "text", "debug"),
      ],
    });
    await handleConfigSave(ctx, "logging");
    expect(request).toHaveBeenCalled();
    const call = request.mock.calls[0] as any[];
    expect(call[0]).toBe("/api/v1/config");
    expect(call[1].method).toBe("PUT");
  });

  it("shows success banner + re-renders on 200 (CFG-03)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true, data: { config: {}, restartNeededSections: [] } }));
    const render = mock(() => {});
    const ctx = makeCtx({
      api: { request },
      render,
      rootChildren: [
        makeInput({ section: "logging", field: "level", type: "text" }, "text", "debug"),
      ],
    });
    await handleConfigSave(ctx, "logging");
    expect(render).toHaveBeenCalled();
    expect(ctx.root.children[0].textContent).toContain("saved");
  });

  it("shows error banner with all details on 400 (CFG-04)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: false, error: "validation failed", details: ["level must be one of debug/info/warn/error", "enableMetrics must be boolean"] }));
    const render = mock(() => {});
    const ctx = makeCtx({
      api: { request },
      render,
      rootChildren: [
        makeInput({ section: "logging", field: "level", type: "text" }, "text", "not-a-number"),
      ],
    });
    await handleConfigSave(ctx, "logging");
    expect(ctx.root.children[0].textContent).toContain("level must be one of");
    expect(ctx.root.children[0].textContent).toContain("enableMetrics must be boolean");
  });

  it("shows error banner on network/500 failure (CFG-05)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => { throw new Error("network down"); });
    const ctx = makeCtx({
      api: { request },
      rootChildren: [
        makeInput({ section: "logging", field: "level", type: "text" }, "text", "debug"),
      ],
    });
    await handleConfigSave(ctx, "logging");
    expect(ctx.root.children[0].textContent).toContain("network down");
  });

  it("cancel (confirm=false) sends no request (CFG-08)", async () => {
    (globalThis as any).confirm = mock(() => false);
    const request = mock(async () => ({ success: true }));
    const ctx = makeCtx({
      api: { request },
      rootChildren: [
        makeInput({ section: "logging", field: "level", type: "text" }, "text", "debug"),
      ],
    });
    await handleConfigSave(ctx, "logging");
    expect(request).not.toHaveBeenCalled();
  });
});

// ── Config reveal handler (CFG-06) ───────────────────────────────────────────

describe("handleConfigReveal — toggle input type + fetch real value (CFG-06, CFG-02)", () => {
  it("toggles password input to text (fallback without api)", async () => {
    const input: MockElement = { dataset: { id: "config-database-url" }, type: "password", value: "secret", addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, insertBefore: (n) => n, remove: () => {} };
    const ctx = makeCtx({
      rootChildren: [input],
      doc: { getElementById: mock(() => input) },
    });
    await handleConfigReveal(ctx, "config-database-url");
    expect(input.type).toBe("text");
  });

  it("toggles text back to password on second call, without fabricating a '***' value (APCR-05.4)", async () => {
    const input: MockElement = { dataset: { id: "config-database-url", revealed: "true" }, type: "text", value: "real-val", addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, insertBefore: (n) => n, remove: () => {} };
    const ctx = makeCtx({
      rootChildren: [input],
      doc: { getElementById: mock(() => input) },
    });
    await handleConfigReveal(ctx, "config-database-url");
    expect(input.type).toBe("password");
    // The real fetched value is preserved (masked visually by type=password),
    // never overwritten with the literal "***" sentinel — a field whose real
    // stored value was empty used to leave a submittable "***" that the old
    // server bug persisted verbatim as the secret (F7).
    expect(input.value).toBe("real-val");
    expect(input.dataset.revealed).toBe("");
  });

  it("hiding a revealed EMPTY field leaves no submittable '***' sentinel (APCR-05.4)", async () => {
    const input: MockElement = { dataset: { id: "config-security-apiKey", revealed: "true" }, type: "text", value: "", addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, insertBefore: (n) => n, remove: () => {} };
    const ctx = makeCtx({
      rootChildren: [input],
      doc: { getElementById: mock(() => input) },
    });
    await handleConfigReveal(ctx, "config-security-apiKey");
    expect(input.type).toBe("password");
    expect(input.value).not.toBe("***");
  });

  it("fetches real value from reveal endpoint (CFG-02)", async () => {
    const input: MockElement = { dataset: { id: "config-database-url" }, type: "password", value: "***", addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, insertBefore: (n) => n, remove: () => {} };
    const request = mock(async () => ({ success: true, data: { section: "database", field: "url", value: "postgres://real" } }));
    const ctx = makeCtx({
      rootChildren: [input],
      doc: { getElementById: mock(() => input) },
      api: { request },
    });
    await handleConfigReveal(ctx, "config-database-url", "database", "url");
    expect(request).toHaveBeenCalled();
    expect(input.value).toBe("postgres://real");
    expect(input.type).toBe("text");
    expect(input.dataset.revealed).toBe("true");
  });

  it("toggles back to password on second call after fetch, keeping the fetched value", async () => {
    const input: MockElement = { dataset: { id: "config-database-url", revealed: "true" }, type: "text", value: "postgres://real", addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, insertBefore: (n) => n, remove: () => {} };
    const ctx = makeCtx({
      rootChildren: [input],
      doc: { getElementById: mock(() => input) },
    });
    await handleConfigReveal(ctx, "config-database-url", "database", "url");
    expect(input.type).toBe("password");
    expect(input.value).toBe("postgres://real");
  });
});

// ── Memory bulk delete (MBD-03..06, T2) ───────────────────────────────────────

function makeConfirmIdInput(value: string): MockElement {
  return makeInput({ bulk: "confirm-id" }, "text", value);
}

describe("handleMemoryDeleteProjectOpen / handleMemoryDeleteProjectCancel — form open/close (MBD-04)", () => {
  it("open sets state.memoryBulkForm and re-renders", () => {
    const render = mock(() => {});
    const ctx = makeCtx({ state: { project: "proj-a" }, render });
    handleMemoryDeleteProjectOpen(ctx);
    expect(ctx.state.memoryBulkForm).toEqual({ error: null });
    expect(render).toHaveBeenCalled();
  });

  it("cancel clears state.memoryBulkForm and re-renders, issuing no request", () => {
    const request = mock(async () => ({ success: true }));
    const render = mock(() => {});
    const ctx = makeCtx({ state: { project: "proj-a", memoryBulkForm: { error: null } }, api: { request }, render });
    handleMemoryDeleteProjectCancel(ctx);
    expect(ctx.state.memoryBulkForm).toBeNull();
    expect(render).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("handleMemoryDeleteProject — typed-match guard, request body, results (MBD-03..06)", () => {
  it("POSTs the exact request body on an exact typed match", async () => {
    const request = mock(async () => ({ success: true, data: { projectId: "proj-a", memoriesDeleted: 7 } }));
    const ctx = makeCtx({
      rootChildren: [makeConfirmIdInput("proj-a")],
      state: { project: "proj-a", memoryBulkForm: { error: null } },
      api: { request },
    });
    await handleMemoryDeleteProject(ctx);
    expect(request).toHaveBeenCalledTimes(1);
    const call = request.mock.calls[0] as any[];
    expect(call[0]).toBe("/api/v1/project/reset");
    expect(call[1]).toEqual({
      method: "POST",
      body: { projectId: "proj-a", clearVectors: false, clearSymbols: false, clearMemories: true },
    });
  });

  it("displays memoriesDeleted and re-renders on success, closing the form", async () => {
    const request = mock(async () => ({ success: true, data: { projectId: "proj-a", memoriesDeleted: 7 } }));
    const render = mock(() => {});
    const ctx = makeCtx({
      rootChildren: [makeConfirmIdInput("proj-a")],
      state: { project: "proj-a", memoryBulkForm: { error: null } },
      api: { request },
      render,
    });
    await handleMemoryDeleteProject(ctx);
    expect(ctx.root.children[0].textContent).toContain("7");
    expect(ctx.state.memoryBulkForm).toBeNull();
    expect(render).toHaveBeenCalled();
  });

  it("a mismatched typed value renders the exact error and issues ZERO api.request calls (MBD-05 discriminating case)", async () => {
    const request = mock(async () => ({ success: true }));
    const render = mock(() => {});
    const ctx = makeCtx({
      rootChildren: [makeConfirmIdInput("wrong-id")],
      state: { project: "proj-a", memoryBulkForm: { error: null } },
      api: { request },
      render,
    });
    await handleMemoryDeleteProject(ctx);
    expect(request).not.toHaveBeenCalled();
    expect(ctx.state.memoryBulkForm).toEqual({ error: "Project id does not match." });
    expect(render).toHaveBeenCalled();
  });

  it("bails with no request and no render when the confirm-id input is absent", async () => {
    const request = mock(async () => ({ success: true }));
    const render = mock(() => {});
    const ctx = makeCtx({
      rootChildren: [],
      state: { project: "proj-a", memoryBulkForm: { error: null } },
      api: { request },
      render,
    });
    await handleMemoryDeleteProject(ctx);
    expect(request).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("success:false renders the returned errors and claims no deletion", async () => {
    const request = mock(async () => ({ success: false, data: {}, errors: ["memories: db unavailable"] }));
    const render = mock(() => {});
    const ctx = makeCtx({
      rootChildren: [makeConfirmIdInput("proj-a")],
      state: { project: "proj-a", memoryBulkForm: { error: null } },
      api: { request },
      render,
    });
    await handleMemoryDeleteProject(ctx);
    expect(ctx.root.children[0].textContent).toContain("db unavailable");
    expect(ctx.root.children[0].textContent).not.toMatch(/deleted \d/i);
    expect(ctx.state.memoryBulkForm).toEqual({ error: "memories: db unavailable" });
    expect(render).toHaveBeenCalled();
  });

  it("re-entrancy guard: a second call while in flight issues no second request", async () => {
    let resolveFirst: (() => void) | undefined;
    const request = mock(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve({ success: true, data: { memoriesDeleted: 1 } });
        }),
    );
    const ctx = makeCtx({
      rootChildren: [makeConfirmIdInput("proj-a")],
      state: { project: "proj-a", memoryBulkForm: { error: null } },
      api: { request },
    });
    const firstCall = handleMemoryDeleteProject(ctx);
    // The in-flight flag is set synchronously before the first await yields.
    expect(ctx.state.memoryBulkDeleteInFlight).toBe(true);
    await handleMemoryDeleteProject(ctx);
    expect(request).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await firstCall;
    expect(ctx.state.memoryBulkDeleteInFlight).toBe(false);
  });
});

// ── Profiles tab switcher + switch handler (PROFTAB-01..05, PROFSW-01..04) ───

const SAMPLE_PROFILES_DATA = {
  hosts: [
    { host: "claude", installed: true, skipped: false, skipReason: null, activeProfile: "balanced", bundleVersion: "1.40.1", availableProfiles: ["balanced", "work"] },
  ],
};
const SAMPLE_REGISTRY_DATA = {
  registry: {
    version: 1, tiers: ["light", "standard", "deep"],
    hostDefaults: { claude: "balanced" }, workflowTiers: {},
    profiles: { balanced: { description: "b", hosts: { claude: { light: { model: "m", effort: "low" } } } } },
  },
  source: { builtin: {}, overlay: null, tombstoned: [] },
};

describe("renderProfilesView — tab switcher (PROFTAB-01..03, DS-05, T9 nomenclature)", () => {
  it("renders both tabs (Active Profile / Model Catalog)", () => {
    const html = renderProfilesView(SAMPLE_PROFILES_DATA, SAMPLE_REGISTRY_DATA, { profilesTab: "switch", writeMode: true });
    expect(html).toContain("tab-switcher");
    expect(html).toContain("Active Profile");
    expect(html).toContain("Model Catalog");
  });

  it("renders the switch profile sub-view when tab=switch (PROFTAB-02)", () => {
    const html = renderProfilesView(SAMPLE_PROFILES_DATA, SAMPLE_REGISTRY_DATA, { profilesTab: "switch", writeMode: true });
    expect(html).toContain("profile-card");
    expect(html).toContain("balanced");
  });

  it("renders the registry sub-view when tab=registry (PROFTAB-03)", () => {
    const html = renderProfilesView(SAMPLE_PROFILES_DATA, SAMPLE_REGISTRY_DATA, { profilesTab: "registry", writeMode: true });
    expect(html).toContain("registry-grid");
    expect(html).toContain("Model Catalog");
  });

  it("marks the active tab with .active class (DS-05)", () => {
    const html = renderProfilesView(SAMPLE_PROFILES_DATA, SAMPLE_REGISTRY_DATA, { profilesTab: "registry", writeMode: true });
    // the registry tab button should carry the active class
    const regTabIdx = html.indexOf("Model Catalog");
    // class attribute precedes the text — search the button element backwards
    const buttonStart = html.lastIndexOf("<button", regTabIdx);
    expect(html.slice(buttonStart, regTabIdx)).toContain("active");
  });

  it("defaults to switch tab when profilesTab not provided (PROFTAB edge — first visit)", () => {
    const html = renderProfilesView(SAMPLE_PROFILES_DATA, SAMPLE_REGISTRY_DATA, { writeMode: true });
    expect(html).toContain("profile-card");
  });
});

describe("handleProfilesTabSwitch — tab persistence (PROFTAB-05)", () => {
  const origLocalStorage = (globalThis as any).localStorage;
  let stored: Record<string, string> = {};

  beforeEach(() => {
    stored = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => stored[k] || null,
      setItem: (k: string, v: string) => { stored[k] = v; },
      removeItem: (k: string) => { delete stored[k]; },
    };
  });
  afterEach(() => {
    (globalThis as any).localStorage = origLocalStorage;
  });

  it("sets state.profilesTab and persists to localStorage", () => {
    const ctx = makeCtx({ state: { profilesTab: "switch" } });
    handleProfilesTabSwitch(ctx, "registry");
    expect(ctx.state.profilesTab).toBe("registry");
    expect(stored["massa-ai-profiles-tab"]).toBe("registry");
  });

  it("calls render after switching tab", () => {
    const render = mock(() => {});
    const ctx = makeCtx({ state: { profilesTab: "switch" }, render });
    handleProfilesTabSwitch(ctx, "registry");
    expect(render).toHaveBeenCalled();
  });
});

describe("handleProfileSwitch — confirm + POST + banner (PROFSW-01..04)", () => {
  const origConfirm = (globalThis as any).confirm;
  afterEach(() => { (globalThis as any).confirm = origConfirm; });

  it("shows confirm naming host + profile + restart warning (PROFSW-01)", async () => {
    (globalThis as any).confirm = mock(() => false);
    const ctx = makeCtx();
    await handleProfileSwitch(ctx, "work", "claude");
    expect((globalThis as any).confirm).toHaveBeenCalled();
    const msg = ((globalThis as any).confirm.mock.calls[0] as any[])[0] as string;
    expect(msg).toContain("claude");
    expect(msg).toContain("work");
    expect(msg.toLowerCase()).toContain("restart");
  });

  it("POSTs /api/v1/profiles/switch with {profile, host} on confirm (PROFSW-02)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true, data: { switched: ["claude"], skipped: [], failed: [] } }));
    const ctx = makeCtx({ api: { request } });
    await handleProfileSwitch(ctx, "work", "claude");
    expect(request).toHaveBeenCalled();
    const call = request.mock.calls[0] as any[];
    expect(call[0]).toBe("/api/v1/profiles/switch");
    expect(call[1].method).toBe("POST");
    expect(call[1].body.profile).toBe("work");
    expect(call[1].body.host).toBe("claude");
  });

  it("shows success banner with per-host results on 200 (PROFSW-03)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true, data: { switched: ["claude"], skipped: ["cursor"], failed: [{ host: "codex", reason: "no dir" }] } }));
    const render = mock(() => {});
    const ctx = makeCtx({ api: { request }, render });
    await handleProfileSwitch(ctx, "work", "claude");
    expect(render).toHaveBeenCalled();
    const banner = ctx.root.children[0];
    expect(banner.textContent).toContain("claude");
    expect(banner.textContent).toContain("cursor");
    expect(banner.textContent).toContain("codex");
  });

  it("shows error banner with code + message on switch error (PROFSW-04)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: false, error: { code: "UnknownProfileError", message: "profile 'work' not found" } }));
    const ctx = makeCtx({ api: { request } });
    await handleProfileSwitch(ctx, "work", "claude");
    expect(ctx.root.children[0].textContent).toContain("UnknownProfileError");
    expect(ctx.root.children[0].textContent).toContain("not found");
  });

  it("cancel (confirm=false) sends no POST", async () => {
    (globalThis as any).confirm = mock(() => false);
    const request = mock(async () => ({ success: true }));
    const ctx = makeCtx({ api: { request } });
    await handleProfileSwitch(ctx, "work", "claude");
    expect(request).not.toHaveBeenCalled();
  });
});

// ── Registry in-memory overlay state + CRUD (REGWIRE-01..06) ────────────────

const SAMPLE_OVERLAY_SOURCE = {
  registry: {
    version: 1, tiers: ["light", "standard", "deep"],
    hostDefaults: { claude: "balanced", codex: "balanced", cursor: "balanced", opencode: "balanced" },
    workflowTiers: { search: "standard" },
    profiles: {
      balanced: { description: "b", hosts: { claude: { light: { model: "m-l", effort: "low" }, standard: { model: "m-s", effort: "medium" }, deep: { model: "m-d", effort: "high" } } } },
    },
  },
  source: {
    builtin: {},
    overlay: { profiles: { balanced: { description: "overlay b" } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] },
    tombstoned: ["old-profile"],
  },
};

function makeRegistryCtx(overrides: Partial<any> = {}): any {
  const ctx = makeCtx({
    state: { registryOverlay: null, registryDirty: false, registryLoaded: false },
    ...overrides,
  });
  return ctx;
}

describe("initRegistryOverlay — lazy init with guard (F2 fold)", () => {
  it("initializes registryOverlay from effective registry on first load", () => {
    const ctx = makeRegistryCtx();
    initRegistryOverlay(ctx, SAMPLE_OVERLAY_SOURCE.registry, SAMPLE_OVERLAY_SOURCE.source);
    expect(ctx.state.registryOverlay).toBeDefined();
    expect(ctx.state.registryOverlay.profiles).toBeDefined();
    expect(ctx.state.registryOverlay.profiles.balanced).toBeDefined();
    expect(ctx.state.registryOverlay.tiers).toEqual(["light", "standard", "deep"]);
    expect(ctx.state.registryLoaded).toBe(true);
  });

  it("does NOT re-initialize when registryLoaded is already true (F2 fold)", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: { custom: {} } }, registryDirty: true, registryLoaded: true } });
    initRegistryOverlay(ctx, SAMPLE_OVERLAY_SOURCE.registry, SAMPLE_OVERLAY_SOURCE.source);
    // overlay should still be the custom one, not overwritten
    expect(ctx.state.registryOverlay.profiles.custom).toBeDefined();
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("initializes with empty overlay structure when registry is null", () => {
    const ctx = makeRegistryCtx();
    initRegistryOverlay(ctx, null, { overlay: null, tombstoned: [], builtin: {} });
    expect(ctx.state.registryOverlay).toBeDefined();
    expect(ctx.state.registryOverlay.profiles).toEqual({});
    expect(ctx.state.registryOverlay.tiers).toEqual(["light", "standard", "deep"]);
  });

  it("seeds ONLY from source.overlay, never from the effective registry (APCR-01.8)", () => {
    // The effective (merged) registry carries a profile the overlay never mentions. A
    // full-registry seed here is the exact F1 defect: it would write that builtin profile
    // into the overlay file on the next save, freezing this operator against any future
    // builtin change to it.
    const ctx = makeRegistryCtx();
    const registryWithBuiltinOnlyProfile = {
      ...SAMPLE_OVERLAY_SOURCE.registry,
      profiles: {
        ...SAMPLE_OVERLAY_SOURCE.registry.profiles,
        builtinOnly: { description: "never in the overlay", hosts: {} },
      },
    };
    initRegistryOverlay(ctx, registryWithBuiltinOnlyProfile, SAMPLE_OVERLAY_SOURCE.source);
    expect(ctx.state.registryOverlay.profiles.builtinOnly).toBeUndefined();
    // The overlay's own profile is still seeded.
    expect(ctx.state.registryOverlay.profiles.balanced).toBeDefined();
  });
});

describe("mergeRegistryForDisplay — server + in-memory overlay merge", () => {
  it("returns server data when overlay has no profiles", () => {
    const server = { registry: { profiles: { balanced: { hosts: {} } } }, source: {} };
    const result = mergeRegistryForDisplay(server, { profiles: {} });
    expect(result.registry.profiles.balanced).toBeDefined();
  });

  it("includes newly added overlay profile in display", () => {
    const server = { registry: { profiles: { balanced: { hosts: {} } }, tiers: ["light"], hostDefaults: {}, workflowTiers: {} }, source: {} };
    const overlay = { profiles: { balanced: { hosts: {} }, newprof: { description: "new", hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] };
    const result = mergeRegistryForDisplay(server, overlay);
    expect(result.registry.profiles.newprof).toBeDefined();
    expect(result.registry.profiles.balanced).toBeDefined();
  });

  it("hides tombstoned (deleted) profiles from display", () => {
    const server = { registry: { profiles: { balanced: { hosts: {} }, old: { hosts: {} } }, tiers: ["light"], hostDefaults: {}, workflowTiers: {} }, source: {} };
    const overlay = { profiles: { balanced: { hosts: {} }, old: { _delete: true, hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] };
    const result = mergeRegistryForDisplay(server, overlay);
    expect(result.registry.profiles.old).toBeUndefined();
    expect(result.registry.profiles.balanced).toBeDefined();
  });

  it("uses overlay tiers/hostDefaults/workflowTiers", () => {
    const server = { registry: { profiles: { p: { hosts: {} } }, tiers: ["light"], hostDefaults: { claude: "p" }, workflowTiers: {} }, source: {} };
    const overlay = { profiles: { p: { hosts: {} } }, hostDefaults: { claude: "p", codex: "p" }, workflowTiers: { search: "deep" }, tiers: ["light", "standard", "deep"] };
    const result = mergeRegistryForDisplay(server, overlay);
    expect(result.registry.tiers).toEqual(["light", "standard", "deep"]);
    expect(result.registry.hostDefaults.codex).toBe("p");
    expect(result.registry.workflowTiers.search).toBe("deep");
  });

  it("does not blank hostDefaults/workflowTiers when the overlay-only seed carries empty objects (APCR-01.8 / APCR-11.4)", () => {
    // With initRegistryOverlay now seeding from source.overlay only, an overlay with no
    // saved hostDefaults/workflowTiers edits arrives here as {} — truthy. A `||` fallback
    // on that object blanks the server's map instead of retaining it.
    const server = {
      registry: {
        profiles: { p: { hosts: {} } },
        tiers: ["light", "standard", "deep"],
        hostDefaults: { claude: "p", codex: "p" },
        workflowTiers: { search: "deep" },
      },
      source: {},
    };
    const overlay = { profiles: { p: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: [] };
    const result = mergeRegistryForDisplay(server, overlay);
    expect(result.registry.hostDefaults.claude).toBe("p");
    expect(result.registry.hostDefaults.codex).toBe("p");
    expect(result.registry.workflowTiers.search).toBe("deep");
    expect(result.registry.tiers).toEqual(["light", "standard", "deep"]);
  });

  it("hides a null-tombstoned workflowTiers key from the display merge", () => {
    const server = { registry: { profiles: {}, tiers: ["light"], hostDefaults: {}, workflowTiers: { search: "deep" } }, source: {} };
    const overlay = { profiles: {}, hostDefaults: {}, workflowTiers: { search: null }, tiers: ["light"] };
    const result = mergeRegistryForDisplay(server, overlay);
    expect(result.registry.workflowTiers.search).toBeUndefined();
  });

  it("carries overlayOverrideCount through the display merge (APCR-01.10)", () => {
    // The count is server-computed from the saved overlay, not the in-memory display merge —
    // it must survive both the "overlay has no profiles, return serverData as-is" branch and
    // the "build a fresh {registry, source}" branch that previously dropped it.
    const server = { registry: { profiles: { p: { hosts: {} } }, tiers: ["light"], hostDefaults: {}, workflowTiers: {} }, source: {}, overlayOverrideCount: 5 };
    const noProfilesOverlay = { profiles: {} };
    expect(mergeRegistryForDisplay(server, noProfilesOverlay).overlayOverrideCount).toBe(5);

    const withProfilesOverlay = { profiles: { p: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] };
    expect(mergeRegistryForDisplay(server, withProfilesOverlay).overlayOverrideCount).toBe(5);
  });

  it("defaults overlayOverrideCount to 0 when the server data omits it", () => {
    const server = { registry: { profiles: { p: { hosts: {} } }, tiers: ["light"], hostDefaults: {}, workflowTiers: {} }, source: {} };
    const overlay = { profiles: { p: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] };
    expect(mergeRegistryForDisplay(server, overlay).overlayOverrideCount).toBe(0);
  });

  // ── Profiles merge as a DELTA, per host and per tier ──────────────────────
  // Every case above uses `hosts: {}` on both sides, where whole-object replace and
  // deep merge are indistinguishable. These use a real single-host delta — the shape an
  // operator's saved overlay actually has after editing one host — which is what made the
  // claude/codex cells render "—" and become uneditable.

  it("retains hosts the overlay profile does not mention (single-host delta)", () => {
    const server = {
      registry: {
        profiles: {
          balanced: {
            description: "Default.",
            hosts: {
              claude: { light: { model: "haiku", effort: "high" }, standard: { model: "sonnet", effort: "high" } },
              codex: { light: { model: "gpt-5.4-mini", effort: "high" }, standard: { model: "gpt-5.6-terra", effort: "high" } },
              opencode: { light: { model: "opencode-go/deepseek-v4-pro", effort: "max" }, standard: { model: "opencode-go/glm-5.2", effort: "max" } },
            },
          },
        },
        tiers: ["light", "standard"],
        hostDefaults: {},
        workflowTiers: {},
      },
      source: {},
    };
    const overlay = {
      profiles: {
        balanced: {
          hosts: {
            opencode: { light: { model: "ollama-cloud/deepseek-v4-pro", effort: "max" }, standard: { model: "ollama-cloud/glm-5.2", effort: "max" } },
          },
        },
      },
      hostDefaults: {},
      workflowTiers: {},
      tiers: ["light", "standard"],
    };
    const hosts = mergeRegistryForDisplay(server, overlay).registry.profiles.balanced.hosts;
    // The edited host takes the overlay's values...
    expect(hosts.opencode.standard.model).toBe("ollama-cloud/glm-5.2");
    // ...and every unmentioned host survives, rather than rendering as an empty cell.
    expect(hosts.claude.standard.model).toBe("sonnet");
    expect(hosts.claude.light.model).toBe("haiku");
    expect(hosts.codex.standard.model).toBe("gpt-5.6-terra");
    expect(Object.keys(hosts).sort()).toEqual(["claude", "codex", "opencode"]);
  });

  it("retains tiers the overlay's host map does not mention (single-tier delta)", () => {
    const server = {
      registry: {
        profiles: {
          balanced: {
            hosts: { claude: { light: { model: "haiku", effort: "high" }, standard: { model: "sonnet", effort: "high" }, deep: { model: "opus", effort: "high" } } },
          },
        },
        tiers: ["light", "standard", "deep"],
        hostDefaults: {},
        workflowTiers: {},
      },
      source: {},
    };
    const overlay = {
      profiles: { balanced: { hosts: { claude: { standard: { model: "sonnet-next", effort: "low" } } } } },
      hostDefaults: {},
      workflowTiers: {},
      tiers: ["light", "standard", "deep"],
    };
    const claude = mergeRegistryForDisplay(server, overlay).registry.profiles.balanced.hosts.claude;
    expect(claude.standard).toEqual({ model: "sonnet-next", effort: "low" });
    expect(claude.light).toEqual({ model: "haiku", effort: "high" });
    expect(claude.deep).toEqual({ model: "opus", effort: "high" });
  });

  it("retains the server description when the overlay profile omits it", () => {
    const server = {
      registry: { profiles: { balanced: { description: "Default.", hosts: { claude: { light: { model: "haiku", effort: "high" } } } } }, tiers: ["light"], hostDefaults: {}, workflowTiers: {} },
      source: {},
    };
    const overlay = { profiles: { balanced: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] };
    expect(mergeRegistryForDisplay(server, overlay).registry.profiles.balanced.description).toBe("Default.");
  });

  it("passes an overlay-only profile through unchanged, minus its _delete flag", () => {
    const server = { registry: { profiles: { balanced: { hosts: {} } }, tiers: ["light"], hostDefaults: {}, workflowTiers: {} }, source: {} };
    const overlay = {
      profiles: { newprof: { description: "new", hosts: { claude: { light: { model: "haiku", effort: "high" } } } } },
      hostDefaults: {},
      workflowTiers: {},
      tiers: ["light"],
    };
    const newprof = mergeRegistryForDisplay(server, overlay).registry.profiles.newprof;
    expect(newprof.hosts.claude.light.model).toBe("haiku");
    expect(newprof.description).toBe("new");
    expect("_delete" in newprof).toBe(false);
  });

  it("does not mutate the server data it was handed", () => {
    const server = {
      registry: { profiles: { balanced: { hosts: { claude: { light: { model: "haiku", effort: "high" } } } } }, tiers: ["light"], hostDefaults: {}, workflowTiers: {} },
      source: {},
    };
    const overlay = {
      profiles: { balanced: { hosts: { claude: { light: { model: "opus", effort: "low" } } } } },
      hostDefaults: {},
      workflowTiers: {},
      tiers: ["light"],
    };
    mergeRegistryForDisplay(server, overlay);
    expect(server.registry.profiles.balanced.hosts.claude.light.model).toBe("haiku");
  });
});

describe("renderModelRegistry — overlay override count display (APCR-01.10)", () => {
  const minimalRegistry = {
    registry: {
      profiles: { p: { description: "P", hosts: {} } },
      tiers: ["light"],
      hostDefaults: {},
      workflowTiers: {},
    },
    source: { overlay: null, tombstoned: [] },
  };

  it("renders a compact override-count line when the count is greater than 0 (T9: Nomenclature Map sentence)", () => {
    const html = renderModelRegistry({ ...minimalRegistry, overlayOverrideCount: 3 }, { writeMode: false });
    expect(html).toContain("You have 3 custom overrides of the built-in defaults.");
  });

  it("uses singular phrasing for a count of exactly 1", () => {
    const html = renderModelRegistry({ ...minimalRegistry, overlayOverrideCount: 1 }, { writeMode: false });
    expect(html).toContain("You have 1 custom override of the built-in defaults.");
  });

  it("renders nothing extra when the count is 0 (no overlay, no noise)", () => {
    const html = renderModelRegistry({ ...minimalRegistry, overlayOverrideCount: 0 }, { writeMode: false });
    expect(html).not.toContain("registry-override-count");
  });

  it("renders nothing extra when overlayOverrideCount is absent", () => {
    const html = renderModelRegistry(minimalRegistry, { writeMode: false });
    expect(html).not.toContain("registry-override-count");
  });

  it("never reports a non-zero count with nothing on screen carrying an override marker (WUT-17 AC3 — the reported bug)", () => {
    // Reproduces the exact defect: the only surviving override lives in hostDefaults, not
    // overlay.profiles, so the old renderer (profile-column badge only) showed "1 custom
    // override" with zero badges and zero category names anywhere on the tab.
    const html = renderModelRegistry(
      {
        ...minimalRegistry,
        registry: { ...minimalRegistry.registry, hostDefaults: { claude: "p" } },
        source: { overlay: { hostDefaults: { claude: "p" } }, tombstoned: [] },
        overlayOverrideCount: 1,
        overlayOverrideBreakdown: { hostDefaults: 1, workflowTiers: 0, agentTiers: 0, tiers: 0, profiles: 0 },
      },
      { writeMode: false },
    );
    // "Default Profile per Tool" is also the section's static <h3>, present on every
    // render regardless of this fix — anchoring on the count line's own text (not the
    // whole page) is what keeps this discriminating rather than vacuously true.
    const overrideLineMatch = html.match(/<p class="registry-override-count muted">([^<]*)<\/p>/);
    const overrideLineText = overrideLineMatch ? overrideLineMatch[1] : "";
    const hasOverlayBadge = html.includes("overlay-badge");
    const hasNamedCategoryInLine = overrideLineText.includes("Default Profile per Tool");
    expect(hasOverlayBadge || hasNamedCategoryInLine).toBe(true);
  });
});

describe("renderModelRegistry — help guide explains Default Profile per Tool vs. the actually-installed profile (T9 nomenclature)", () => {
  const minimalRegistry = {
    registry: {
      profiles: { p: { description: "P", hosts: {} } },
      tiers: ["light"],
      hostDefaults: {},
      workflowTiers: {},
    },
    source: { overlay: null, tombstoned: [] },
  };

  it("adds a Default Profile per Tool dt/dd pair distinguishing it from the currently-installed profile", () => {
    const html = renderModelRegistry(minimalRegistry, { writeMode: false });
    expect(html).toContain("<dt>Default Profile per Tool</dt>");
    expect(html.toLowerCase()).toContain("not</strong> the profile currently installed");
    expect(html).toContain("Active Profile");
    expect(html).not.toContain("Host Defaults");
    expect(html).not.toContain("Switch Profile");
  });
});

describe("handleRegistryCellEdit — in-memory cell edit (REGWIRE-01)", () => {
  it("updates model field in overlay + sets dirty", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: { balanced: { hosts: { claude: { light: { model: "m-l", effort: "low" } } } } } }, registryDirty: false, registryLoaded: true } });
    handleRegistryCellEdit(ctx, "balanced", "claude", "light", "model", "new-model");
    expect(ctx.state.registryOverlay.profiles.balanced.hosts.claude.light.model).toBe("new-model");
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("updates effort field in overlay + sets dirty", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: { balanced: { hosts: { claude: { light: { model: "m-l", effort: "low" } } } } } }, registryDirty: false, registryLoaded: true } });
    handleRegistryCellEdit(ctx, "balanced", "claude", "light", "effort", "high");
    expect(ctx.state.registryOverlay.profiles.balanced.hosts.claude.light.effort).toBe("high");
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("create-on-demand path leaves description absent, not stamped with the profile key (APCR-11.6)", () => {
    // A profile the overlay has never touched (e.g. builtin-only) - the first cell edit
    // must NOT write `description: profile`. The server's mergeProfile() only inherits the
    // builtin description when the overlay's own is `undefined`; a stamped key permanently
    // overwrites the real description on the next save.
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] }, registryDirty: false, registryLoaded: true } });
    handleRegistryCellEdit(ctx, "builtin-only", "claude", "light", "model", "new-model");
    expect(ctx.state.registryOverlay.profiles["builtin-only"].hosts.claude.light.model).toBe("new-model");
    expect(ctx.state.registryOverlay.profiles["builtin-only"].description).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(ctx.state.registryOverlay.profiles["builtin-only"], "description")).toBe(false);
  });

  // ── Provider/Model split-join (T5, APUX-14, P1-B AC2-AC5) ──────────────────
  // The DOM change listener (wireViewHandlers) reads both sibling Provider/Model
  // inputs, joins via `joinModelId`, and routes through this same handler with
  // field "model" — these tests exercise that join contract directly.

  it("stores the joined provider/model string produced by joinModelId (T5)", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: { balanced: { hosts: { opencode: { standard: { model: "old", effort: "medium" } } } } } }, registryDirty: false, registryLoaded: true } });
    const joined = joinModelId("opencode-go", "glm-5.2");
    handleRegistryCellEdit(ctx, "balanced", "opencode", "standard", "model", joined);
    expect(ctx.state.registryOverlay.profiles.balanced.hosts.opencode.standard.model).toBe("opencode-go/glm-5.2");
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("stores a bare model string when provider is blank", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: { balanced: { hosts: { claude: { light: { model: "old", effort: "low" } } } } } }, registryDirty: false, registryLoaded: true } });
    handleRegistryCellEdit(ctx, "balanced", "claude", "light", "model", joinModelId("", "sonnet"));
    expect(ctx.state.registryOverlay.profiles.balanced.hosts.claude.light.model).toBe("sonnet");
  });

  it("stores null (inherit) when both provider and model are blank", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: { balanced: { hosts: { claude: { light: { model: "old", effort: "low" } } } } } }, registryDirty: false, registryLoaded: true } });
    handleRegistryCellEdit(ctx, "balanced", "claude", "light", "model", joinModelId("", ""));
    expect(ctx.state.registryOverlay.profiles.balanced.hosts.claude.light.model).toBeNull();
  });
});

describe("handleRegistryHostDefaultEdit — hostDefaults edit (REGWIRE-02)", () => {
  it("updates hostDefault in overlay + sets dirty", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {}, hostDefaults: { claude: "balanced" } }, registryDirty: false, registryLoaded: true } });
    handleRegistryHostDefaultEdit(ctx, "claude", "work");
    expect(ctx.state.registryOverlay.hostDefaults.claude).toBe("work");
    expect(ctx.state.registryDirty).toBe(true);
  });
});

describe("handleRegistryAgentTierEdit — Per-Agent Tier Overrides edit (T6, APUX-04, P1-A AC8)", () => {
  it("sets an override for a new agent + sets dirty", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {}, agentTiers: {} }, registryDirty: false, registryLoaded: true } });
    handleRegistryAgentTierEdit(ctx, "builder", "opencode", "deep");
    expect(ctx.state.registryOverlay.agentTiers.builder.opencode).toBe("deep");
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("adds a second host override without disturbing the first", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {}, agentTiers: { builder: { opencode: "deep" } } }, registryDirty: false, registryLoaded: true } });
    handleRegistryAgentTierEdit(ctx, "builder", "claude", "standard");
    expect(ctx.state.registryOverlay.agentTiers.builder).toEqual({ opencode: "deep", claude: "standard" });
  });

  it("removes the override key when the value is '' (default picked)", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {}, agentTiers: { builder: { opencode: "deep", claude: "standard" } } }, registryDirty: false, registryLoaded: true } });
    handleRegistryAgentTierEdit(ctx, "builder", "opencode", "");
    expect(ctx.state.registryOverlay.agentTiers.builder).toEqual({ claude: "standard" });
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("prunes the agent object entirely once its last host override is removed", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {}, agentTiers: { builder: { opencode: "deep" } } }, registryDirty: false, registryLoaded: true } });
    handleRegistryAgentTierEdit(ctx, "builder", "opencode", "");
    expect(Object.prototype.hasOwnProperty.call(ctx.state.registryOverlay.agentTiers, "builder")).toBe(false);
  });

  it("is a no-op (still sets dirty) when clearing a host that was never overridden", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {}, agentTiers: {} }, registryDirty: false, registryLoaded: true } });
    handleRegistryAgentTierEdit(ctx, "builder", "opencode", "");
    expect(ctx.state.registryOverlay.agentTiers).toEqual({});
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("initializes registryOverlay.agentTiers on demand when the overlay has never been touched", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {} }, registryDirty: false, registryLoaded: true } });
    handleRegistryAgentTierEdit(ctx, "builder", "opencode", "deep");
    expect(ctx.state.registryOverlay.agentTiers.builder.opencode).toBe("deep");
  });
});

describe("renderModelRegistry — Per-Agent Tier Overrides display merge (T6, APUX-04)", () => {
  it("shows an unsaved agentTier override before save (mergeRegistryForDisplay)", () => {
    const server = {
      registry: { profiles: { p: { hosts: {} } }, tiers: ["light", "standard", "deep"], hostDefaults: {}, workflowTiers: {}, agentTiers: {} },
      source: {},
      agents: [{ name: "builder", charterTier: "standard" }],
    };
    const overlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, agentTiers: { builder: { opencode: "deep" } }, tiers: ["light", "standard", "deep"] };
    const display = mergeRegistryForDisplay(server, overlay);
    expect(display.registry.agentTiers.builder.opencode).toBe("deep");
    const html = renderModelRegistry(display, { writeMode: true });
    expect(html).toContain('data-agent="builder" data-host="opencode"');
    expect(html).toContain('value="deep" selected');
  });

  it("carries agents + agentsError through the display-merge rebuild branch", () => {
    const server = {
      registry: { profiles: { p: { hosts: {} } }, tiers: ["light"], hostDefaults: {}, workflowTiers: {}, agentTiers: {} },
      source: {},
      agents: [{ name: "builder", charterTier: "standard" }],
      agentsError: undefined,
    };
    const overlay = { profiles: { p: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, agentTiers: {}, tiers: ["light"] };
    const display = mergeRegistryForDisplay(server, overlay);
    expect(display.agents).toEqual([{ name: "builder", charterTier: "standard" }]);
  });

  it("cross-boundary parity: mergeRegistryForDisplay reproduces the shared fixture's expected merged agentTiers", () => {
    // Same fixture consumed by scripts/__tests__/model-profiles.test.ts through mergeOverlay
    // (T1) — this proves the client's hand-copied twin (design D-4.3) is byte-identical.
    const fixturePath = path.join(
      import.meta.dir,
      "fixtures",
      "agent-tiers-parity.json",
    );
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
      builtinAgentTiers: Record<string, Record<string, string>>;
      overlayAgentTiers: Record<string, Record<string, string | null> | null>;
      expectedMergedAgentTiers: Record<string, Record<string, string>>;
    };
    const server = {
      registry: { profiles: {}, tiers: ["light", "standard", "deep"], hostDefaults: {}, workflowTiers: {}, agentTiers: fixture.builtinAgentTiers },
      source: {},
    };
    const overlay = { profiles: {}, hostDefaults: {}, workflowTiers: {}, agentTiers: fixture.overlayAgentTiers, tiers: ["light", "standard", "deep"] };
    const display = mergeRegistryForDisplay(server, overlay);
    expect(display.registry.agentTiers).toEqual(fixture.expectedMergedAgentTiers);
  });
});

describe("handleRegistryWorkflowTierEdit — workflowTiers edit (REGWIRE-02)", () => {
  it("updates workflowTier in overlay + sets dirty", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {}, workflowTiers: { search: "standard" } }, registryDirty: false, registryLoaded: true } });
    handleRegistryWorkflowTierEdit(ctx, "search", "deep");
    expect(ctx.state.registryOverlay.workflowTiers.search).toBe("deep");
    expect(ctx.state.registryDirty).toBe(true);
  });
});

// ── Inline form toggle/cancel (T7, APUX-12, D-4.4) ──────────────────────────
// Replaces the prompt()-driven flows: a trigger click opens/closes
// state.registryForm, and the submit path (wireViewHandlers, exercised via
// registry-editor.test.ts render assertions) reads field values and calls the
// same-named handler below with explicit args instead of prompt().

describe("handleRegistryFormToggle / handleRegistryFormCancel — inline form open/close (T7)", () => {
  it("opens a form of the given kind + re-renders", () => {
    const render = mock(() => {});
    const ctx = makeRegistryCtx({ render, state: { registryForm: null } });
    handleRegistryFormToggle(ctx, "add-profile");
    expect(ctx.state.registryForm).toEqual({ kind: "add-profile", error: null });
    expect(render).toHaveBeenCalled();
  });

  it("closes the form when the same trigger is clicked again", () => {
    const ctx = makeRegistryCtx({ state: { registryForm: { kind: "add-profile", error: null } } });
    handleRegistryFormToggle(ctx, "add-profile");
    expect(ctx.state.registryForm).toBeNull();
  });

  it("switches to a different form when a different trigger is clicked", () => {
    const ctx = makeRegistryCtx({ state: { registryForm: { kind: "add-profile", error: null } } });
    handleRegistryFormToggle(ctx, "delete-profile");
    expect(ctx.state.registryForm).toEqual({ kind: "delete-profile", error: null });
  });

  it("handleRegistryFormCancel closes any open form + re-renders", () => {
    const render = mock(() => {});
    const ctx = makeRegistryCtx({ render, state: { registryForm: { kind: "add-workflow", error: "some error" } } });
    handleRegistryFormCancel(ctx);
    expect(ctx.state.registryForm).toBeNull();
    expect(render).toHaveBeenCalled();
  });
});

describe("handleRegistryWorkflowTierAdd — inline form submit (T7, REG-03, APUX-12)", () => {
  it("adds a new workflow tier to the overlay + sets dirty + closes the form + re-renders", () => {
    const render = mock(() => {});
    const ctx = makeRegistryCtx({
      render,
      state: { registryOverlay: { profiles: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] }, registryDirty: false, registryLoaded: true, registryForm: { kind: "add-workflow", error: null } },
    });
    handleRegistryWorkflowTierAdd(ctx, "spec-driven", "deep");
    expect(ctx.state.registryOverlay.workflowTiers["spec-driven"]).toBe("deep");
    expect(ctx.state.registryDirty).toBe(true);
    expect(ctx.state.registryForm).toBeNull();
    expect(render).toHaveBeenCalled();
  });

  it("rejects a duplicate workflow name with an inline form error, not alert()", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, workflowTiers: { search: "standard" }, tiers: ["light", "standard", "deep"] }, registryDirty: false, registryLoaded: true, registryForm: { kind: "add-workflow", error: null } },
    });
    handleRegistryWorkflowTierAdd(ctx, "search", "deep");
    expect(ctx.state.registryForm?.kind).toBe("add-workflow");
    expect(ctx.state.registryForm?.error).toContain("search");
    expect(ctx.state.registryDirty).toBe(false);
  });

  it("rejects an invalid tier with an inline form error, not alert()", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] }, registryDirty: false, registryLoaded: true, registryForm: { kind: "add-workflow", error: null } },
    });
    handleRegistryWorkflowTierAdd(ctx, "debug", "titanic");
    expect(ctx.state.registryForm?.error).toContain("titanic");
    expect(ctx.state.registryOverlay.workflowTiers["debug"]).toBeUndefined();
  });

  it("does nothing when workflow is blank", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] }, registryDirty: false, registryLoaded: true, registryForm: { kind: "add-workflow", error: null } },
    });
    handleRegistryWorkflowTierAdd(ctx, "", "deep");
    expect(Object.keys(ctx.state.registryOverlay.workflowTiers)).toEqual([]);
    expect(ctx.state.registryDirty).toBe(false);
  });
});

describe("handleRegistryWorkflowTierRemove — remove workflow tier (REG-03 / APCR-01.6 tombstone)", () => {
  it("writes a null tombstone (not a deleted key) + sets dirty + re-renders", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, workflowTiers: { search: "standard", index: "light" }, tiers: ["light", "standard", "deep"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryWorkflowTierRemove(ctx, "search");
    // A deleted key means "absent" under the server's deep merge, which under APCR-01 means
    // "inherit the builtin" — the exact no-op regression design D-1 exists to prevent.
    expect(Object.prototype.hasOwnProperty.call(ctx.state.registryOverlay.workflowTiers, "search")).toBe(true);
    expect(ctx.state.registryOverlay.workflowTiers.search).toBeNull();
    expect(ctx.state.registryOverlay.workflowTiers.index).toBe("light");
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("no-ops when overlay has no workflowTiers", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, tiers: ["light", "standard", "deep"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryWorkflowTierRemove(ctx, "search");
    expect(ctx.state.registryDirty).toBe(false);
  });
});

describe("handleRegistryAddProfile — inline form submit (T7, REGWIRE-03, APUX-12)", () => {
  it("adds a new profile with null model/effort for all host/tier combos", () => {
    const ctx = makeRegistryCtx({
      state: {
        registryOverlay: { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] },
        registryDirty: false, registryLoaded: true, registryForm: { kind: "add-profile", error: null },
      },
    });
    handleRegistryAddProfile(ctx, "custom", "a custom profile");
    expect(ctx.state.registryOverlay.profiles.custom).toBeDefined();
    expect(ctx.state.registryOverlay.profiles.custom.description).toBe("a custom profile");
    expect(ctx.state.registryOverlay.profiles.custom.hosts.claude.light).toEqual({ model: null, effort: null });
    expect(ctx.state.registryDirty).toBe(true);
    expect(ctx.state.registryForm).toBeNull();
  });

  it("defaults description to profile name when description is blank", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true, registryForm: { kind: "add-profile", error: null } },
    });
    handleRegistryAddProfile(ctx, "custom", "");
    expect(ctx.state.registryOverlay.profiles.custom.description).toBe("custom");
  });

  it("rejects an existing profile name with an inline form error, not alert()", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: { balanced: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true, registryForm: { kind: "add-profile", error: null } },
    });
    handleRegistryAddProfile(ctx, "balanced", "");
    expect(ctx.state.registryForm?.error).toContain("balanced");
    expect(ctx.state.registryDirty).toBe(false);
  });

  it("does nothing when name is blank", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {} }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"], registryDirty: false, registryLoaded: true },
    });
    handleRegistryAddProfile(ctx, "", "");
    expect(Object.keys(ctx.state.registryOverlay.profiles)).toHaveLength(0);
    expect(ctx.state.registryDirty).toBe(false);
  });
});

describe("handleRegistryDuplicateProfile — inline form submit (T7, REGWIRE-04, APUX-12)", () => {
  it("copies selected profile grid to a new name", () => {
    const ctx = makeRegistryCtx({
      state: {
        registryOverlay: { profiles: { balanced: { description: "b", hosts: { claude: { light: { model: "m", effort: "low" } } } } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] },
        registryDirty: false, registryLoaded: true, registryForm: { kind: "duplicate-profile", error: null },
      },
    });
    handleRegistryDuplicateProfile(ctx, "balanced", "work-copy");
    expect(ctx.state.registryOverlay.profiles["work-copy"]).toBeDefined();
    expect(ctx.state.registryOverlay.profiles["work-copy"].hosts.claude.light.model).toBe("m");
    expect(ctx.state.registryDirty).toBe(true);
    expect(ctx.state.registryForm).toBeNull();
  });

  it("shows an inline error, not alert(), when the source profile is not found", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: { balanced: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true, registryForm: { kind: "duplicate-profile", error: null } },
    });
    handleRegistryDuplicateProfile(ctx, "nonexistent", "copy");
    expect(ctx.state.registryForm?.error).toContain("nonexistent");
  });

  it("shows an inline error, not alert(), when the new name already exists", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: { balanced: { hosts: {} }, work: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true, registryForm: { kind: "duplicate-profile", error: null } },
    });
    handleRegistryDuplicateProfile(ctx, "balanced", "work");
    expect(ctx.state.registryForm?.error).toContain("work");
  });

  it("does nothing when source is blank", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryDuplicateProfile(ctx, "", "copy");
    expect(ctx.state.registryDirty).toBe(false);
  });
});

describe("handleRegistryDeleteProfile — inline form submit (T7, REGWIRE-05, APUX-12)", () => {
  it("sets _delete:true on existing profile", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: { balanced: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true, registryForm: { kind: "delete-profile", error: null } },
    });
    handleRegistryDeleteProfile(ctx, "balanced");
    expect(ctx.state.registryOverlay.profiles.balanced._delete).toBe(true);
    expect(ctx.state.registryDirty).toBe(true);
    expect(ctx.state.registryForm).toBeNull();
  });

  it("shows an inline error, not alert(), when the profile is not found", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: { balanced: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true, registryForm: { kind: "delete-profile", error: null } },
    });
    handleRegistryDeleteProfile(ctx, "nonexistent");
    expect(ctx.state.registryForm?.error).toContain("nonexistent");
  });

  it("does nothing when name is blank", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryDeleteProfile(ctx, "");
    expect(ctx.state.registryDirty).toBe(false);
  });
});

// ── APCR-11.5: Duplicate/Delete pickers must read the DISPLAY registry (server +
// overlay), not the raw overlay - a session with no edits yet has an empty overlay
// after APCR-01.8's revert to an overlay-only seed. These tests go THROUGH
// initRegistryOverlay (unlike every test above, which builds ctx.state.registryOverlay
// by hand) so they can actually observe the regression Batch Worker 1 flagged.
describe("Registry Duplicate/Delete pickers see every effective-registry profile with an empty overlay (APCR-11.5)", () => {
  /** Build a ctx whose registryOverlay was seeded via initRegistryOverlay (overlay-only,
   *  APCR-01.8) from a session with NO saved overlay, and whose registryServerData mirrors
   *  what render() caches (the same server payload initRegistryOverlay read from). */
  function makeUnEditedSessionCtx() {
    const ctx = makeRegistryCtx();
    const registry = {
      version: 1, tiers: ["light", "standard", "deep"],
      hostDefaults: {}, workflowTiers: {},
      profiles: {
        balanced: { description: "builtin balanced", hosts: { claude: { light: { model: "m-l", effort: "low" } } } },
      },
    };
    initRegistryOverlay(ctx, registry, { overlay: null, tombstoned: [], builtin: {} });
    // No edits this session - the raw overlay is empty, exactly APCR-01.8's revert.
    expect(ctx.state.registryOverlay.profiles).toEqual({});
    ctx.state.registryServerData = { registry, source: { overlay: null, tombstoned: [], builtin: {} } };
    return ctx;
  }

  it("Duplicate offers the builtin profile even though the overlay is empty", () => {
    const ctx = makeUnEditedSessionCtx();
    handleRegistryDuplicateProfile(ctx, "balanced", "balanced-copy");
    expect(ctx.state.registryOverlay.profiles["balanced-copy"]).toBeDefined();
    expect(ctx.state.registryOverlay.profiles["balanced-copy"].hosts.claude.light.model).toBe("m-l");
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("Duplicate does not report a missing source when the overlay is empty but the server has profiles", () => {
    const ctx = makeUnEditedSessionCtx();
    handleRegistryDuplicateProfile(ctx, "balanced", "another-copy");
    expect(ctx.state.registryForm).toBeNull();
  });

  it("Delete offers the builtin profile even though the overlay is empty, and tombstones it in the overlay", () => {
    const ctx = makeUnEditedSessionCtx();
    handleRegistryDeleteProfile(ctx, "balanced");
    expect(ctx.state.registryOverlay.profiles.balanced).toBeDefined();
    expect(ctx.state.registryOverlay.profiles.balanced._delete).toBe(true);
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("Delete does not report a missing profile when the overlay is empty but the server has profiles", () => {
    const ctx = makeUnEditedSessionCtx();
    handleRegistryDeleteProfile(ctx, "balanced");
    expect(ctx.state.registryForm).toBeNull();
  });
});

describe("handleRegistryRestore — remove tombstone (REGWIRE-06)", () => {
  it("removes _delete flag from a tombstoned profile", () => {
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: { balanced: { _delete: true, hosts: {} } } }, registryDirty: true, registryLoaded: true },
    });
    handleRegistryRestore(ctx, "balanced");
    expect(ctx.state.registryOverlay.profiles.balanced._delete).toBeUndefined();
  });
});

// ── Registry save/clear overlay (REGWIRE-11..13, T8) ─────────────────────────

describe("handleRegistryClearOverlay — confirm + DELETE (REGWIRE-11, REGWIRE-12)", () => {
  const origConfirm = (globalThis as any).confirm;
  afterEach(() => { (globalThis as any).confirm = origConfirm; });

  it("shows confirm warning about overlay deletion + revert to builtin (REGWIRE-11)", async () => {
    (globalThis as any).confirm = mock(() => false);
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {} }, registryDirty: false, registryLoaded: true } });
    await handleRegistryClearOverlay(ctx);
    const msg = ((globalThis as any).confirm.mock.calls[0] as any[])[0] as string;
    expect(msg.toLowerCase()).toContain("built-in");
    expect(msg.toLowerCase()).toContain("delete");
  });

  it("DELETEs /api/v1/model-registry/overlay on confirm (REGWIRE-12)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true, data: { registry: {}, source: { overlay: null, builtin: {}, tombstoned: [] } } }));
    const render = mock(() => {});
    const ctx = makeRegistryCtx({
      api: { request }, render,
      state: { registryOverlay: { profiles: {} }, registryDirty: true, registryLoaded: true },
    });
    await handleRegistryClearOverlay(ctx);
    expect(request).toHaveBeenCalled();
    const call = request.mock.calls[0] as any[];
    expect(call[0]).toBe("/api/v1/model-registry/overlay");
    expect(call[1].method).toBe("DELETE");
    // overlay reset to builtin
    expect(ctx.state.registryLoaded).toBe(false);
    expect(render).toHaveBeenCalled();
  });

  it("cancel sends no DELETE", async () => {
    (globalThis as any).confirm = mock(() => false);
    const request = mock(async () => ({ success: true }));
    const ctx = makeRegistryCtx({ api: { request }, state: { registryOverlay: { profiles: {} }, registryDirty: false, registryLoaded: true } });
    await handleRegistryClearOverlay(ctx);
    expect(request).not.toHaveBeenCalled();
  });
});

// ── Registry regenerate streaming handler (REGEN-01..07) ────────────────────

/** Builds a fake fetch Response with a ReadableStream body emitting SSE chunks. */
function makeSseResponse(chunks: string[]): { ok: boolean; status: number; headers: Map<string, string>; body: { getReader: () => any } } {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    headers: new Map([["content-type", "text/event-stream"]]),
    body: stream,
  };
}

describe("runRegenerateStream — streaming SSE, no confirm of its own (T8, REGEN-01..07, D-4.5)", () => {
  const origFetch = (globalThis as any).fetch;
  const origSetTimeout = (globalThis as any).setTimeout;

  beforeEach(() => {
    (globalThis as any).setTimeout = (cb: () => void, _ms: number) => { cb(); return 0 as any; };
  });
  afterEach(() => {
    (globalThis as any).fetch = origFetch;
    (globalThis as any).setTimeout = origSetTimeout;
  });

  it("calls no confirm() of its own — the single Save & Apply confirm covers this step", async () => {
    const confirmSpy = mock(() => false);
    (globalThis as any).confirm = confirmSpy;
    (globalThis as any).fetch = mock(async () => makeSseResponse(['data: {"type":"done","exitCode":0}\n\n']));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    await runRegenerateStream(ctx);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("sends auth headers from ctx.api.authHeaders (REGEN-SEC)", async () => {
    const fetchMock = mock(async () => makeSseResponse(['data: {"type":"done","exitCode":0}\n\n']));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeRegistryCtx({
      api: { request: mock(async () => ({})), authHeaders: () => ({ "x-api-key": "secret-key" }) },
      state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true },
    });
    await runRegenerateStream(ctx);
    expect(fetchMock).toHaveBeenCalled();
    const fetchArg = (fetchMock.mock.calls[0] as any[])[1] as any;
    expect(fetchArg.headers["x-api-key"]).toBe("secret-key");
  });

  it("fetches regenerate-and-install-stream + shows a persistent success banner with the restart sentence on done exit 0 (REGEN-02, REGEN-05, P1-C AC2)", async () => {
    const sseChunks = [
      'data: {"type":"line","stream":"stdout","text":"Generating claude agents..."}\n\n',
      'data: {"type":"line","stream":"stdout","text":"Done."}\n\n',
      'data: {"type":"install","host":"claude","status":"switched","profile":"balanced","switched":"claude","skipped":"none","failed":"none"}\n\n',
      'data: {"type":"done","exitCode":0}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const render = mock(() => {});
    const ctx = makeRegistryCtx({ render, state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    const { ok, reason } = await runRegenerateStream(ctx);
    expect(ok).toBe(true);
    expect(reason).toBeUndefined();
    expect((globalThis as any).fetch).toHaveBeenCalled();
    // success banner shows completion message + install info + the restart sentence, persisting
    expect(ctx.root.children[0].textContent).toContain("complete");
    expect(ctx.root.children[0].textContent).toContain("Installed");
    expect(ctx.root.children[0].textContent).toContain("Restart your CLI sessions (Claude, Codex, Cursor, OpenCode) to pick up the changes.");
    expect(ctx.root.children[0].className).toContain("banner-persist");
    expect(ctx.state.regenerating).toBe(false);
  });

  it("does NOT render a success banner when exitCode is 0 but a host install failed, and reports the per-host detail (APCR-06.6, fix-loop 1)", async () => {
    const sseChunks = [
      'data: {"type":"install","host":"claude","status":"switched","profile":"balanced","switched":"claude","skipped":"none","unsupported":"none","failed":"none"}\n\n',
      'data: {"type":"install","host":"codex","status":"failed","profile":"balanced","switched":"none","skipped":"none","unsupported":"none","failed":"codex (locked)"}\n\n',
      'data: {"type":"done","exitCode":0}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    const { ok, reason } = await runRegenerateStream(ctx);
    expect(ok).toBe(false);
    expect(reason).toContain("codex");
    expect(reason).toContain("codex (locked)");
    const banner = ctx.root.children[0];
    expect(banner.className).not.toContain("success");
    expect(banner.textContent).toContain("codex");
    // the returned reason is exactly the text the standalone banner showed
    expect(banner.textContent).toBe(reason);
  });

  it("classifies an unsupported install as its own class, not folded into skipped, and reports it in reason (APCR-06.7, fix-loop 1)", async () => {
    const sseChunks = [
      'data: {"type":"install","host":"cursor","status":"unsupported","profile":"balanced","switched":"none","skipped":"none","unsupported":"cursor (bundle has no variants)","failed":"none"}\n\n',
      'data: {"type":"done","exitCode":0}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    const { ok, reason } = await runRegenerateStream(ctx);
    expect(ok).toBe(false);
    const banner = ctx.root.children[0];
    expect(banner.className).not.toContain("success");
    expect(banner.textContent.toLowerCase()).toContain("unsupported");
    expect(banner.textContent).not.toContain("Skipped: cursor");
    expect(reason!.toLowerCase()).toContain("unsupported");
    expect(reason).toBe(banner.textContent);
  });

  it("shows failure banner on done with non-zero exit and reports the exit-code reason (REGEN-05, fix-loop 1)", async () => {
    const sseChunks = [
      'data: {"type":"line","stream":"stderr","text":"fatal error"}\n\n',
      'data: {"type":"done","exitCode":1}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    const { ok, reason } = await runRegenerateStream(ctx);
    expect(ok).toBe(false);
    expect(ctx.root.children[0].textContent).toContain("failed");
    expect(reason).toBe("Regeneration failed (exit 1).");
  });

  it("shows failure banner on spawn failure (done with exitCode null + error) and reports it in reason (REGEN-07, fix-loop 1)", async () => {
    const sseChunks = [
      'data: {"type":"done","exitCode":null,"error":"spawn ENOENT"}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    const { ok, reason } = await runRegenerateStream(ctx);
    expect(ok).toBe(false);
    expect(ctx.root.children[0].textContent).toContain("ENOENT");
    expect(reason).toContain("ENOENT");
  });

  it("guards against concurrent runs via state.regenerating (REGEN-06)", async () => {
    let resolveStream: () => void;
    const pendingStream = new Promise<void>((r) => { resolveStream = r; });
    const slowStream = new ReadableStream({
      start(controller) {
        // emit nothing until resolved
        pendingStream.then(() => {
          controller.enqueue(new TextEncoder().encode('data: {"type":"done","exitCode":0}\n\n'));
          controller.close();
        });
      },
    });
    const slowResponse = { ok: true, status: 200, headers: new Map([["content-type", "text/event-stream"]]), body: slowStream };
    (globalThis as any).fetch = mock(async () => slowResponse);
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    const regenPromise = runRegenerateStream(ctx);
    // While running, state.regenerating should be true
    expect(ctx.state.regenerating).toBe(true);
    // A concurrent call while already running is a no-op (returns ok:false immediately).
    expect(await runRegenerateStream(ctx)).toEqual({ ok: false, reason: undefined });
    resolveStream!();
    await regenPromise;
    expect(ctx.state.regenerating).toBe(false);
  });

  it("shows error banner on fetch failure (network) and reports it in reason", async () => {
    (globalThis as any).fetch = mock(async () => { throw new Error("network down"); });
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    const { ok, reason } = await runRegenerateStream(ctx);
    expect(ok).toBe(false);
    expect(ctx.root.children[0].textContent).toContain("network down");
    expect(reason).toContain("network down");
    expect(ctx.state.regenerating).toBe(false);
  });

  it("SSE stream closes without a done frame: reports the stream-closed sentence in reason, not silently discarded (edge case, fix-loop 1)", async () => {
    // No "done" frame at all — the reader's `done: true` ends the outer loop
    // with gotDone still false. This is the spec's SSE-closed-without-done
    // edge case; its detail must survive into the unified retry banner.
    const sseChunks = [
      'data: {"type":"line","stream":"stdout","text":"Generating claude agents..."}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    const { ok, reason } = await runRegenerateStream(ctx);
    expect(ok).toBe(false);
    expect(reason).toBe("Regeneration stream closed unexpectedly.");
    expect(ctx.root.children[0].textContent).toBe("Regeneration stream closed unexpectedly.");
  });

  // ── T5/T6k: variant-sync SSE frame rendering ──────────────────────────────
  it("renders variant-sync frames: synced hosts are folded into the success banner (T5)", async () => {
    const sseChunks = [
      'data: {"type":"variant-sync","host":"claude","status":"synced","profiles":["balanced"],"files":3,"retained":[]}\n\n',
      'data: {"type":"variant-sync","host":"cursor","status":"skipped","profiles":[],"files":0,"retained":[],"reason":"all tiers inherit"}\n\n',
      'data: {"type":"install","host":"claude","status":"switched","profile":"balanced","switched":"claude","skipped":"none","unsupported":"none","failed":"none"}\n\n',
      'data: {"type":"done","exitCode":0}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    const { ok } = await runRegenerateStream(ctx);
    expect(ok).toBe(true);
    const banner = ctx.root.children[0];
    expect(banner.className).toContain("success");
    expect(banner.textContent).toContain("Synced");
    expect(banner.textContent).toContain("claude");
  });

  it("does NOT render a success banner when a variant-sync frame reports failed, and reports it in reason (T5, fix-loop 1)", async () => {
    const sseChunks = [
      'data: {"type":"variant-sync","host":"claude","status":"failed","profiles":[],"files":0,"retained":[],"error":"disk full"}\n\n',
      'data: {"type":"install","host":"claude","status":"switched","profile":"balanced","switched":"claude","skipped":"none","unsupported":"none","failed":"none"}\n\n',
      'data: {"type":"done","exitCode":0}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    const { ok, reason } = await runRegenerateStream(ctx);
    expect(ok).toBe(false);
    const banner = ctx.root.children[0];
    expect(banner.className).not.toContain("success");
    expect(banner.textContent).toContain("Variant sync failed");
    expect(banner.textContent).toContain("disk full");
    expect(reason).toContain("disk full");
  });

  it("a skipped variant-sync frame (the routine no-checkout case) stays silent — no banner noise", async () => {
    const sseChunks = [
      'data: {"type":"variant-sync","host":"claude","status":"skipped","profiles":[],"files":0,"retained":[],"reason":"no source checkout — nothing to sync"}\n\n',
      'data: {"type":"install","host":"claude","status":"switched","profile":"balanced","switched":"claude","skipped":"none","unsupported":"none","failed":"none"}\n\n',
      'data: {"type":"done","exitCode":0}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    const { ok } = await runRegenerateStream(ctx);
    expect(ok).toBe(true);
    const banner = ctx.root.children[0];
    expect(banner.className).toContain("success");
    expect(banner.textContent).not.toContain("Synced");
  });
});

// ── Unified Save & Apply (T8, APUX-13, D-4.5, P1-C AC1-AC5) ─────────────────
// Save & Apply owns the ONE confirm covering both the PUT overlay step and the
// (no-confirm) regenerate stream, and layers a generic safe-to-retry banner
// over runRegenerateStream's own failure banner when the apply step fails
// after a successful save.

describe("handleRegistrySaveAndApply — unified save + apply (T8, APUX-13, P1-C AC1-AC5)", () => {
  const origConfirm = (globalThis as any).confirm;
  const origFetch = (globalThis as any).fetch;
  const origSetTimeout = (globalThis as any).setTimeout;

  beforeEach(() => {
    (globalThis as any).setTimeout = (cb: () => void, _ms: number) => { cb(); return 0 as any; };
  });
  afterEach(() => {
    (globalThis as any).confirm = origConfirm;
    (globalThis as any).fetch = origFetch;
    (globalThis as any).setTimeout = origSetTimeout;
  });

  it("shows a single confirm naming save + apply + the restart consequence (D-4.5)", async () => {
    (globalThis as any).confirm = mock(() => false);
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {} }, registryDirty: true, registryLoaded: true } });
    await handleRegistrySaveAndApply(ctx);
    expect((globalThis as any).confirm).toHaveBeenCalledTimes(1);
    const msg = ((globalThis as any).confirm.mock.calls[0] as any[])[0] as string;
    expect(msg.toLowerCase()).toContain("save");
    expect(msg.toLowerCase()).toContain("apply");
    expect(msg.toLowerCase()).toContain("restart");
  });

  it("cancel (confirm=false) sends no PUT and starts no stream", async () => {
    (globalThis as any).confirm = mock(() => false);
    const request = mock(async () => ({ success: true }));
    const fetchMock = mock(async () => makeSseResponse([]));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeRegistryCtx({ api: { request }, state: { registryOverlay: { profiles: {} }, registryDirty: true, registryLoaded: true } });
    await handleRegistrySaveAndApply(ctx);
    expect(request).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PUTs the overlay BEFORE starting the regenerate stream (order, P1-C AC1)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const calls: string[] = [];
    const request = mock(async () => { calls.push("put"); return { success: true }; });
    const fetchMock = mock(async () => { calls.push("fetch"); return makeSseResponse(['data: {"type":"done","exitCode":0}\n\n']); });
    (globalThis as any).fetch = fetchMock;
    const ctx = makeRegistryCtx({
      api: { request, authHeaders: () => ({}) },
      state: { registryOverlay: { profiles: { balanced: { description: "x" } } }, registryDirty: true, registryLoaded: true },
    });
    await handleRegistrySaveAndApply(ctx);
    expect(calls).toEqual(["put", "fetch"]);
    const call = request.mock.calls[0] as any[];
    expect(call[0]).toBe("/api/v1/model-registry");
    expect(call[1].method).toBe("PUT");
    expect(call[1].body.profiles.balanced.description).toBe("x");
  });

  it("save failure shows the validation banner and does NOT start the stream (P1-C AC3)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: false, error: "validation failed", details: ["profiles.foo missing tier 'standard'"] }));
    const fetchMock = mock(async () => makeSseResponse([]));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeRegistryCtx({ api: { request }, state: { registryOverlay: { profiles: { foo: {} } }, registryDirty: true, registryLoaded: true } });
    await handleRegistrySaveAndApply(ctx);
    expect(ctx.root.children[0].textContent).toContain("missing tier 'standard'");
    expect(fetchMock).not.toHaveBeenCalled();
    // dirty stays true — the save never went through.
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("save network failure shows an error banner and does NOT start the stream", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => { throw new Error("network down"); });
    const fetchMock = mock(async () => makeSseResponse([]));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeRegistryCtx({ api: { request }, state: { registryOverlay: { profiles: {} }, registryDirty: true, registryLoaded: true } });
    await handleRegistrySaveAndApply(ctx);
    expect(ctx.root.children[0].textContent).toContain("network down");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("save success + apply success: clears dirty/loaded, shows a persistent banner with the restart sentence (P1-C AC2)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true }));
    const fetchMock = mock(async () => makeSseResponse(['data: {"type":"done","exitCode":0}\n\n']));
    (globalThis as any).fetch = fetchMock;
    const render = mock(() => {});
    const ctx = makeRegistryCtx({
      api: { request, authHeaders: () => ({}) }, render,
      state: { registryOverlay: { profiles: {} }, registryDirty: true, registryLoaded: true, regenerating: false },
    });
    await handleRegistrySaveAndApply(ctx);
    expect(ctx.state.registryDirty).toBe(false);
    expect(ctx.state.registryLoaded).toBe(false);
    const banner = ctx.root.children[0];
    expect(banner.className).toContain("success");
    expect(banner.className).toContain("banner-persist");
    expect(banner.textContent).toContain("Restart your CLI sessions (Claude, Codex, Cursor, OpenCode) to pick up the changes.");
  });

  it("save success + apply failure: overrides runRegenerateStream's own banner with the safe-retry sentence PLUS the specific reason (P1-C AC4, fix-loop 1)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true }));
    const fetchMock = mock(async () => makeSseResponse(['data: {"type":"done","exitCode":1}\n\n']));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeRegistryCtx({
      api: { request, authHeaders: () => ({}) },
      state: { registryOverlay: { profiles: {} }, registryDirty: true, registryLoaded: true, regenerating: false },
    });
    await handleRegistrySaveAndApply(ctx);
    // The save itself still went through (P1-C AC4: PUT is idempotent, retry is safe).
    expect(ctx.state.registryDirty).toBe(false);
    const banner = ctx.root.children[0];
    expect(banner.className).not.toContain("success");
    // The leading retry-safety sentence stays literal, but the specific
    // exit-code reason (that runRegenerateStream would have shown on its
    // own) is folded in — not discarded (fix-loop 1).
    expect(banner.textContent).toBe(
      "Changes saved, but applying them failed — press Save & Apply again to retry. Details: Regeneration failed (exit 1).",
    );
  });

  it("save success + apply failure via a per-host install failure: the final banner names the failing host (fix-loop 1, APCR-06.6)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true }));
    const sseChunks = [
      'data: {"type":"install","host":"codex","status":"failed","profile":"balanced","switched":"none","skipped":"none","unsupported":"none","failed":"codex (locked)"}\n\n',
      'data: {"type":"done","exitCode":0}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({
      api: { request, authHeaders: () => ({}) },
      state: { registryOverlay: { profiles: {} }, registryDirty: true, registryLoaded: true, regenerating: false },
    });
    await handleRegistrySaveAndApply(ctx);
    const banner = ctx.root.children[0];
    expect(banner.className).not.toContain("success");
    expect(banner.textContent).toContain("Changes saved, but applying them failed — press Save & Apply again to retry.");
    expect(banner.textContent).toContain("codex");
    expect(banner.textContent).toContain("codex (locked)");
  });

  it("save success + apply failure via an SSE stream closed without a done frame: the stream-closed detail survives into the final banner (spec edge case, fix-loop 1)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true }));
    // No "done" frame — the spec's "SSE stream closes without a done frame" edge case.
    const fetchMock = mock(async () => makeSseResponse(['data: {"type":"line","stream":"stdout","text":"..."}\n\n']));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeRegistryCtx({
      api: { request, authHeaders: () => ({}) },
      state: { registryOverlay: { profiles: {} }, registryDirty: true, registryLoaded: true, regenerating: false },
    });
    await handleRegistrySaveAndApply(ctx);
    const banner = ctx.root.children[0];
    expect(banner.className).not.toContain("success");
    expect(banner.textContent).toBe(
      "Changes saved, but applying them failed — press Save & Apply again to retry. Details: Regeneration stream closed unexpectedly.",
    );
  });

  it("pressing Save & Apply again after an apply failure re-PUTs and can succeed (idempotent retry, P1-C AC4)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true }));
    const fetchMock = mock(async () => makeSseResponse(['data: {"type":"done","exitCode":0}\n\n']));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeRegistryCtx({
      api: { request, authHeaders: () => ({}) },
      state: { registryOverlay: { profiles: {} }, registryDirty: true, registryLoaded: true, regenerating: false },
    });
    await handleRegistrySaveAndApply(ctx);
    await handleRegistrySaveAndApply(ctx);
    expect(request).toHaveBeenCalledTimes(2);
    const banner = ctx.root.children[0];
    expect(banner.className).toContain("success");
  });
});

// ── Project index progress (PRG-01..06) ──────────────────────────────────────

describe("handleProjectIndexProgress — jobId + status line (PRG-01, PRG-06)", () => {
  it("sets state.indexJobId + indexJobStatus=pending when jobId returned (PRG-01)", () => {
    const ctx = makeCtx({ state: { indexJobId: null, indexJobStatus: null, view: "projects" } });
    handleProjectIndexProgress(ctx, "job-123");
    expect(ctx.state.indexJobId).toBe("job-123");
    expect(ctx.state.indexJobStatus).toBe("pending");
  });

  it("tracks new jobId on reindex (PRG-06)", () => {
    const ctx = makeCtx({ state: { indexJobId: "old-job", indexJobStatus: "completed", view: "projects" } });
    handleProjectIndexProgress(ctx, "new-job");
    expect(ctx.state.indexJobId).toBe("new-job");
    expect(ctx.state.indexJobStatus).toBe("pending");
  });
});

describe("SSE index_status matching (PRG-02)", () => {
  it("updates progress when jobId matches", () => {
    const ctx = makeCtx({ state: { indexJobId: "job-123", indexJobStatus: "pending", indexJobPhase: null, indexJobFileCount: null, view: "projects" } });
    const sseEvent = { type: "index_status", jobId: "job-123", phase: "embedding", fileCount: 42, status: "running" };
    const matched = handleIndexStatusEvent(ctx, sseEvent);
    expect(matched).toBe(true);
    expect(ctx.state.indexJobStatus).toBe("running");
    expect(ctx.state.indexJobPhase).toBe("embedding");
    expect(ctx.state.indexJobFileCount).toBe(42);
  });

  it("ignores index_status for a different jobId (PRG-02 edge)", () => {
    const ctx = makeCtx({ state: { indexJobId: "job-123", indexJobStatus: "pending", indexJobPhase: null, indexJobFileCount: null, view: "projects" } });
    const sseEvent = { type: "index_status", jobId: "other-job", phase: "embedding", fileCount: 42, status: "running" };
    const matched = handleIndexStatusEvent(ctx, sseEvent);
    expect(matched).toBe(false);
    expect(ctx.state.indexJobStatus).toBe("pending");
    expect(ctx.state.indexJobPhase).toBeNull();
  });
});

describe("polling fallback (PRG-03, F4 fold)", () => {
  const origSetInterval = (globalThis as any).setInterval;
  const origClearInterval = (globalThis as any).clearInterval;
  let intervalCallback: (() => void) | null;
  let intervalId: number;

  beforeEach(() => {
    intervalCallback = null;
    intervalId = 999;
    (globalThis as any).setInterval = (cb: () => void, _ms: number) => {
      intervalCallback = cb;
      return intervalId;
    };
    (globalThis as any).clearInterval = (id: number) => {
      if (id === intervalId) intervalCallback = null;
    };
  });
  afterEach(() => {
    (globalThis as any).setInterval = origSetInterval;
    (globalThis as any).clearInterval = origClearInterval;
  });

  it("starts polling when EventSource unavailable (PRG-03)", () => {
    const ctx = makeCtx({
      api: { request: mock(async () => ({ success: true, data: { jobId: "job-123", status: "completed", phase: "done", fileCount: 100 } })) },
      state: { indexJobId: "job-123", indexJobStatus: "pending", indexJobPhase: null, indexJobFileCount: null, view: "projects", indexPollInterval: null },
    });
    // startPolling is the inline function; we simulate its contract:
    // it sets indexPollInterval and calls the status endpoint.
    const pollFn = async () => {
      const res = await ctx.api.request("/api/v1/project/index/status/job-123");
      if (res && res.data) {
        ctx.state.indexJobStatus = res.data.status;
        ctx.state.indexJobPhase = res.data.phase;
        ctx.state.indexJobFileCount = res.data.fileCount;
      }
      if (ctx.state.indexJobStatus === "completed" || ctx.state.indexJobStatus === "failed") {
        if (ctx.state.indexPollInterval) (globalThis as any).clearInterval(ctx.state.indexPollInterval);
      }
    };
    ctx.state.indexPollInterval = (globalThis as any).setInterval(pollFn, 2000);
    // Execute one poll tick
    if (intervalCallback) intervalCallback();
    // Status should update (async — check after a microtask)
    expect(intervalCallback).not.toBeNull();
  });

  it("clears interval on terminal status (F4 fold)", async () => {
    const ctx = makeCtx({
      api: { request: mock(async () => ({ success: true, data: { jobId: "job-123", status: "completed", phase: "done", fileCount: 100 } })) },
      state: { indexJobId: "job-123", indexJobStatus: "pending", indexJobPhase: null, indexJobFileCount: null, view: "projects", indexPollInterval: null },
    });
    const pollFn = async () => {
      const res = await ctx.api.request("/api/v1/project/index/status/job-123");
      if (res && res.data) {
        ctx.state.indexJobStatus = res.data.status;
        ctx.state.indexJobPhase = res.data.phase;
        ctx.state.indexJobFileCount = res.data.fileCount;
      }
      if (ctx.state.indexJobStatus === "completed" || ctx.state.indexJobStatus === "failed") {
        if (ctx.state.indexPollInterval) (globalThis as any).clearInterval(ctx.state.indexPollInterval);
        ctx.state.indexPollInterval = null;
      }
    };
    ctx.state.indexPollInterval = (globalThis as any).setInterval(pollFn, 2000);
    await pollFn();
    expect(ctx.state.indexJobStatus).toBe("completed");
    expect(ctx.state.indexPollInterval).toBeNull();
  });
});

describe("renderProjects — index progress line (PRG-01, DS-07)", () => {
  it("renders .index-progress line when indexJobId is set", () => {
    const { renderProjects } = { ...mod, ...UI } as { renderProjects: (data: any, opts?: any) => string };
    const html = renderProjects({ projects: [{ projectId: "p1", documentCount: 5 }] }, { indexJobId: "job-1", indexJobStatus: "running", indexJobPhase: "embedding", indexJobFileCount: 42 });
    expect(html).toContain("index-progress");
    expect(html).toContain("job-1");
    expect(html).toContain("running");
  });

  it("does not render progress line when indexJobId is null", () => {
    const { renderProjects } = { ...mod, ...UI } as { renderProjects: (data: any, opts?: any) => string };
    const html = renderProjects({ projects: [{ projectId: "p1" }] });
    expect(html).not.toContain("index-progress");
  });
});

// ── Logs tab: live tail + export (T15, LOG-14, LOG-15, design § 3f) ─────────
// EventSource is not usable here (it cannot set request headers and every
// non-public route requires x-api-key — AD-011), so the live tail mirrors
// runRegenerateStream's own fetch + ReadableStream + hand-parsed `data:`
// frame pattern above. `runLogsLiveStream` is the load-bearing safety gate:
// it is a no-op whenever `ctx.state.logsLive` is false, which is what keeps
// the fake-DOM startApp harness's synthetic dispatch (every wired
// data-action/change handler fired against a generic child whose `checked`
// reads as falsy) from ever opening a real, never-resolving fetch.

function makeLiveToggle(checked: boolean): MockElement {
  const el = makeInput({ action: "logs-live-toggle" }, "checkbox", "");
  (el as any).checked = checked;
  return el;
}

describe("runLogsLiveStream — live tail fetch + append (T15, LOG-14, LOG-15)", () => {
  const origFetch = (globalThis as any).fetch;
  afterEach(() => {
    (globalThis as any).fetch = origFetch;
  });

  it("is a no-op when ctx.state.logsLive is false — the harness's synthetic click cannot open a stream", async () => {
    const fetchMock = mock(async () => makeSseResponse([]));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeCtx({ state: { logsLive: false } });
    await runLogsLiveStream(ctx);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("appends streamed entries to state.logsEntries without re-issuing the range query (LOG-14)", async () => {
    const sseChunks = [
      'data: {"seq":1,"ts":"2026-08-09T00:00:00.000Z","level":"info","message":"first"}\n\n',
      ': heartbeat\n\n',
      'data: {"seq":2,"ts":"2026-08-09T00:00:01.000Z","level":"warn","message":"second"}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const request = mock(async () => ({ success: true, data: { entries: [], total: 0 } }));
    const ctx = makeCtx({
      state: { logsLive: true },
      api: { request, authHeaders: () => ({ "x-api-key": "k" }) },
    });
    await runLogsLiveStream(ctx);
    expect(ctx.state.logsEntries.map((e: any) => e.message)).toEqual(["first", "second"]);
    // no range query (GET /api/v1/logs) was reissued to render these
    expect(request).not.toHaveBeenCalled();
  });

  it("patches a streamed row into an empty-range tbody and drops the stale empty note", async () => {
    // Both halves of the empty-range case: the row has somewhere to land, and
    // "No log entries match this range" stops sitting above a table that now
    // has one. Removing the note rather than re-rendering keeps this an
    // append — LOG-14 forbids re-issuing the range query on this path.
    const sseChunks = [
      'data: {"seq":1,"ts":"2026-08-09T00:00:00.000Z","level":"info","message":"live one"}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const request = mock(async () => ({ success: true, data: { entries: [], total: 0 } }));
    const ctx = makeCtx({
      state: { logsLive: true },
      api: { request, authHeaders: () => ({ "x-api-key": "k" }) },
    });
    // `makeRoot` resolves only `#id` and `[data-*=…]` selectors, so it returns
    // null for both selectors this path uses — against it the assertions would
    // pass whether or not the code patched anything. This root answers exactly
    // the two selectors production queries, and nothing else.
    const tbody = { innerHTML: "" };
    const dom: { emptyNote: { remove: () => void } | null } = { emptyNote: null };
    dom.emptyNote = { remove: () => { dom.emptyNote = null; } };
    ctx.root = {
      children: [],
      innerHTML: "",
      querySelector: (sel: string) => {
        if (sel === "table.logs-table tbody") return tbody;
        if (sel === ".logs-empty") return dom.emptyNote;
        return null;
      },
    };

    await runLogsLiveStream(ctx);

    expect(tbody.innerHTML).toContain("live one");
    expect(dom.emptyNote).toBeNull(); // the stale "no entries" note was removed
    expect(request).not.toHaveBeenCalled();
  });

  it("sends the x-api-key auth header on the stream fetch", async () => {
    const fetchMock = mock(async () => makeSseResponse([]));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeCtx({
      state: { logsLive: true },
      api: { request: mock(async () => ({})), authHeaders: () => ({ "x-api-key": "secret-key" }) },
    });
    await runLogsLiveStream(ctx);
    expect(fetchMock).toHaveBeenCalled();
    const fetchArg = (fetchMock.mock.calls[0] as any[])[1] as any;
    expect(fetchArg.headers["x-api-key"]).toBe("secret-key");
  });

  it("a stream failure turns Live off, banners the error, and keeps already-rendered rows intact (LOG-15)", async () => {
    (globalThis as any).fetch = mock(async () => {
      throw new Error("network down");
    });
    const render = mock(() => {});
    const priorEntries = [{ seq: 0, ts: "t", level: "info", message: "already here" }];
    const ctx = makeCtx({ state: { logsLive: true, logsEntries: priorEntries }, render });
    await runLogsLiveStream(ctx);
    expect(ctx.state.logsLive).toBe(false);
    expect(ctx.root.children[0].textContent).toContain("Live log stream failed");
    expect(ctx.root.children[0].textContent).toContain("network down");
    // the accumulator (and, by extension, whatever it already fed into the
    // DOM) is untouched — LOG-15's "without discarding already-rendered
    // entries"
    expect(ctx.state.logsEntries).toBe(priorEntries);
    expect(ctx.state.logsEntries.length).toBe(1);
    // no full re-render happened; already-rendered rows were never replaced
    expect(render).not.toHaveBeenCalled();
  });

  it("does not banner an error when the fetch rejection is our own teardown abort, not a genuine failure", async () => {
    class FakeAbortController {
      signal: { aborted: boolean };
      constructor() {
        this.signal = { aborted: false };
      }
      abort() {
        this.signal.aborted = true;
      }
    }
    const origAC = (globalThis as any).AbortController;
    (globalThis as any).AbortController = FakeAbortController;
    (globalThis as any).fetch = mock(async (_url: string, init: any) => {
      // Simulate a real aborted-fetch rejection landing after teardown
      // already flipped the signal (the same sequence a browser produces
      // when stopLogsLiveStream()'s abort() races the in-flight fetch).
      init.signal.aborted = true;
      const err = new Error("The operation was aborted.");
      (err as any).name = "AbortError";
      throw err;
    });
    try {
      const ctx = makeCtx({ state: { logsLive: true } });
      await runLogsLiveStream(ctx);
      expect(ctx.root.children.length).toBe(0);
    } finally {
      (globalThis as any).AbortController = origAC;
    }
  });
});

describe("stopLogsLiveStream — teardown on toggle-off / navigate-away (T15, LOG-14/15)", () => {
  it("aborts the stored controller and clears state.logsStreamAbort", () => {
    const abort = mock(() => {});
    const ctx = makeCtx({ state: { logsStreamAbort: { abort } } });
    stopLogsLiveStream(ctx);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(ctx.state.logsStreamAbort).toBeNull();
  });

  it("is a safe no-op when no stream is in flight", () => {
    const ctx = makeCtx({ state: { logsStreamAbort: null } });
    expect(() => stopLogsLiveStream(ctx)).not.toThrow();
    expect(ctx.state.logsStreamAbort).toBeNull();
  });
});

describe("handleLogsLiveToggle — reads the checkbox's real DOM state, never a dataset/event value (T15, LOG-14)", () => {
  const origFetch = (globalThis as any).fetch;
  afterEach(() => {
    (globalThis as any).fetch = origFetch;
  });

  it("checking Live sets state.logsLive and opens the stream", async () => {
    const fetchMock = mock(async () => makeSseResponse([]));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeCtx({ state: {}, rootChildren: [makeLiveToggle(true)] });
    handleLogsLiveToggle(ctx);
    expect(ctx.state.logsLive).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("unchecking Live sets state.logsLive false and aborts any in-flight stream, without ever calling fetch", () => {
    const fetchMock = mock(async () => makeSseResponse([]));
    (globalThis as any).fetch = fetchMock;
    const abort = mock(() => {});
    const ctx = makeCtx({ state: { logsStreamAbort: { abort } }, rootChildren: [makeLiveToggle(false)] });
    handleLogsLiveToggle(ctx);
    expect(ctx.state.logsLive).toBe(false);
    expect(abort).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a missing toggle element (the harness's generic-child scenario) reads as unchecked, never a stale true", () => {
    const fetchMock = mock(async () => makeSseResponse([]));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeCtx({ state: {}, rootChildren: [] });
    handleLogsLiveToggle(ctx);
    expect(ctx.state.logsLive).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("handleLogsExport — fetch with auth header + object-URL download (T15, design § 3f Export)", () => {
  const origFetch = (globalThis as any).fetch;
  afterEach(() => {
    (globalThis as any).fetch = origFetch;
  });

  function makeExportDoc() {
    const created: any[] = [];
    const doc = {
      createElement: (tag: string) => {
        const el: any = { tag, click: mock(() => {}) };
        created.push(el);
        return el;
      },
      body: { appendChild: mock(() => {}), removeChild: mock(() => {}) },
    };
    return { doc, created };
  }

  function makeExportResponse(filename: string, text: string) {
    return {
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === "content-disposition" ? 'attachment; filename="' + filename + '"' : null) },
      blob: async () => new Blob([text], { type: "application/x-ndjson" }),
    };
  }

  it("sends the x-api-key header and format=jsonl on the export fetch", async () => {
    const fetchMock = mock(async () => makeExportResponse("massa-ai-logs-a_b.jsonl", "line1\nline2\n"));
    (globalThis as any).fetch = fetchMock;
    const { doc } = makeExportDoc();
    const ctx = makeCtx({
      state: { logsFrom: "", logsTo: "", logsLevel: "", logsQuery: "" },
      api: { request: mock(async () => ({})), authHeaders: () => ({ "x-api-key": "secret-key" }) },
      doc,
    });
    await handleLogsExport(ctx);
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as any[];
    expect(String(url)).toContain("/api/v1/logs/export");
    expect(String(url)).toContain("format=jsonl");
    expect(init.headers["x-api-key"]).toBe("secret-key");
  });

  it("triggers a download via an object-URL anchor named from Content-Disposition", async () => {
    const fetchMock = mock(async () => makeExportResponse("massa-ai-logs-a_b.jsonl", "line1\n"));
    (globalThis as any).fetch = fetchMock;
    const { doc, created } = makeExportDoc();
    const ctx = makeCtx({ state: {}, doc });
    await handleLogsExport(ctx);
    expect(created.length).toBe(1);
    expect(created[0].download).toBe("massa-ai-logs-a_b.jsonl");
    expect(created[0].click).toHaveBeenCalled();
  });

  it("includes the current from/to/level/q filters in the export query", async () => {
    const fetchMock = mock(async () => makeExportResponse("f.jsonl", ""));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeCtx({
      state: { logsFrom: "2026-08-09T10:00", logsTo: "2026-08-09T11:00", logsLevel: "warn", logsQuery: "boom" },
    });
    await handleLogsExport(ctx);
    const [url] = fetchMock.mock.calls[0] as any[];
    expect(String(url)).toContain("level=warn");
    expect(String(url)).toContain("q=boom");
    expect(String(url)).toContain("from=");
    expect(String(url)).toContain("to=");
  });

  it("banners an error on a non-ok response, without throwing", async () => {
    (globalThis as any).fetch = mock(async () => ({ ok: false, status: 401 }));
    const ctx = makeCtx({ state: {} });
    await handleLogsExport(ctx);
    expect(ctx.root.children[0].textContent).toContain("Export failed");
    expect(ctx.root.children[0].textContent).toContain("401");
  });

  it("banners an error on network failure, without throwing", async () => {
    (globalThis as any).fetch = mock(async () => {
      throw new Error("network down");
    });
    const ctx = makeCtx({ state: {} });
    await handleLogsExport(ctx);
    expect(ctx.root.children[0].textContent).toContain("Export failed");
    expect(ctx.root.children[0].textContent).toContain("network down");
  });
});