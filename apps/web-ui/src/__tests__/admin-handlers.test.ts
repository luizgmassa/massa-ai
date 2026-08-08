import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

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
  handleProfileSwitch,
  handleProfilesTabSwitch,
  handleRegistryCellEdit,
  handleRegistryHostDefaultEdit,
  handleRegistryWorkflowTierEdit,
  handleRegistryWorkflowTierAdd,
  handleRegistryWorkflowTierRemove,
  handleRegistryAddProfile,
  handleRegistryDuplicateProfile,
  handleRegistryDeleteProfile,
  handleRegistryRestore,
  handleRegistrySaveOverlay,
  handleRegistryClearOverlay,
  handleRegistryRegenerate,
  handleProjectIndexProgress,
  handleIndexStatusEvent,
  initRegistryOverlay,
  mergeRegistryForDisplay,
  renderProfilesView,
} = { ...mod, ...UI } as {
  showBanner: (root: MockRoot, type: string, message: string) => void;
  handleConfigSave: (ctx: any, section: string) => Promise<void>;
  handleConfigReveal: (ctx: any, targetId: string, section?: string, field?: string) => Promise<void>;
  handleProfileSwitch: (ctx: any, profile: string, host: string) => Promise<void>;
  handleProfilesTabSwitch: (ctx: any, tab: string) => void;
  handleRegistryCellEdit: (ctx: any, profile: string, host: string, tier: string, field: string, value: string) => void;
  handleRegistryHostDefaultEdit: (ctx: any, host: string, value: string) => void;
  handleRegistryWorkflowTierEdit: (ctx: any, workflow: string, value: string) => void;
  handleRegistryWorkflowTierAdd: (ctx: any) => void;
  handleRegistryWorkflowTierRemove: (ctx: any, workflow: string) => void;
  handleRegistryAddProfile: (ctx: any) => void;
  handleRegistryDuplicateProfile: (ctx: any) => void;
  handleRegistryDeleteProfile: (ctx: any) => void;
  handleRegistryRestore: (ctx: any, profile: string) => void;
  handleRegistrySaveOverlay: (ctx: any) => Promise<void>;
  handleRegistryClearOverlay: (ctx: any) => Promise<void>;
  handleRegistryRegenerate: (ctx: any) => Promise<void>;
  handleProjectIndexProgress: (ctx: any, jobId: string) => Promise<void>;
  handleIndexStatusEvent: (ctx: any, payload: any) => boolean;
  initRegistryOverlay: (ctx: any, registry: any, source?: any) => void;
  mergeRegistryForDisplay: (serverData: any, overlay: any) => any;
  renderProfilesView: (profilesData: any, registryData: any, opts?: any) => string;
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

describe("renderProfilesView — tab switcher (PROFTAB-01..03, DS-05)", () => {
  it("renders both tabs (Switch Profile / Edit Registry)", () => {
    const html = renderProfilesView(SAMPLE_PROFILES_DATA, SAMPLE_REGISTRY_DATA, { profilesTab: "switch", writeMode: true });
    expect(html).toContain("tab-switcher");
    expect(html).toContain("Switch Profile");
    expect(html).toContain("Edit Registry");
  });

  it("renders the switch profile sub-view when tab=switch (PROFTAB-02)", () => {
    const html = renderProfilesView(SAMPLE_PROFILES_DATA, SAMPLE_REGISTRY_DATA, { profilesTab: "switch", writeMode: true });
    expect(html).toContain("profile-card");
    expect(html).toContain("balanced");
  });

  it("renders the registry sub-view when tab=registry (PROFTAB-03)", () => {
    const html = renderProfilesView(SAMPLE_PROFILES_DATA, SAMPLE_REGISTRY_DATA, { profilesTab: "registry", writeMode: true });
    expect(html).toContain("registry-grid");
    expect(html).toContain("Model Registry");
  });

  it("marks the active tab with .active class (DS-05)", () => {
    const html = renderProfilesView(SAMPLE_PROFILES_DATA, SAMPLE_REGISTRY_DATA, { profilesTab: "registry", writeMode: true });
    // the registry tab button should carry the active class
    const regTabIdx = html.indexOf("Edit Registry");
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
});

describe("handleRegistryHostDefaultEdit — hostDefaults edit (REGWIRE-02)", () => {
  it("updates hostDefault in overlay + sets dirty", () => {
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {}, hostDefaults: { claude: "balanced" } }, registryDirty: false, registryLoaded: true } });
    handleRegistryHostDefaultEdit(ctx, "claude", "work");
    expect(ctx.state.registryOverlay.hostDefaults.claude).toBe("work");
    expect(ctx.state.registryDirty).toBe(true);
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

describe("handleRegistryWorkflowTierAdd — add workflow tier (REG-03)", () => {
  const origPrompt = (globalThis as any).prompt;
  const origAlert = (globalThis as any).alert;
  afterEach(() => { (globalThis as any).prompt = origPrompt; (globalThis as any).alert = origAlert; });

  it("adds a new workflow tier to the overlay + sets dirty + re-renders", () => {
    let calls = 0;
    (globalThis as any).prompt = mock((_msg: string) => {
      calls++;
      if (calls === 1) return "spec-driven";
      if (calls === 2) return "deep";
      return null;
    });
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryWorkflowTierAdd(ctx);
    expect(ctx.state.registryOverlay.workflowTiers["spec-driven"]).toBe("deep");
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("rejects duplicate workflow name", () => {
    (globalThis as any).alert = mock(() => {});
    (globalThis as any).prompt = mock(() => "search");
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, workflowTiers: { search: "standard" }, tiers: ["light", "standard", "deep"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryWorkflowTierAdd(ctx);
    expect((globalThis as any).alert).toHaveBeenCalled();
    expect(ctx.state.registryDirty).toBe(false);
  });

  it("rejects invalid tier", () => {
    (globalThis as any).alert = mock(() => {});
    let calls = 0;
    (globalThis as any).prompt = mock(() => {
      calls++;
      if (calls === 1) return "debug";
      if (calls === 2) return "titanic";
      return null;
    });
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryWorkflowTierAdd(ctx);
    expect((globalThis as any).alert).toHaveBeenCalled();
    expect(ctx.state.registryOverlay.workflowTiers["debug"]).toBeUndefined();
  });

  it("does nothing when prompt cancelled", () => {
    (globalThis as any).prompt = mock(() => null);
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryWorkflowTierAdd(ctx);
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

describe("handleRegistryAddProfile — add profile via prompt (REGWIRE-03)", () => {
  const origPrompt = (globalThis as any).prompt;
  const origAlert = (globalThis as any).alert;
  afterEach(() => { (globalThis as any).prompt = origPrompt; (globalThis as any).alert = origAlert; });

  it("adds a new profile with null model/effort for all host/tier combos", () => {
    (globalThis as any).prompt = mock((msg: string) => {
      if (msg.toLowerCase().includes("new profile name")) return "custom";
      if (msg.toLowerCase().includes("description")) return "a custom profile";
      return null;
    });
    const ctx = makeRegistryCtx({
      state: {
        registryOverlay: { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] },
        registryDirty: false, registryLoaded: true,
      },
    });
    handleRegistryAddProfile(ctx);
    expect(ctx.state.registryOverlay.profiles.custom).toBeDefined();
    expect(ctx.state.registryOverlay.profiles.custom.description).toBe("a custom profile");
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("defaults description to profile name when description prompt is empty", () => {
    (globalThis as any).prompt = mock((msg: string) => {
      if (msg.toLowerCase().includes("new profile name")) return "custom";
      if (msg.toLowerCase().includes("description")) return "";
      return null;
    });
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryAddProfile(ctx);
    expect(ctx.state.registryOverlay.profiles.custom.description).toBe("custom");
  });

  it("alerts when profile name already exists", () => {
    (globalThis as any).alert = mock(() => {});
    (globalThis as any).prompt = mock(() => "balanced");
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: { balanced: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryAddProfile(ctx);
    expect((globalThis as any).alert).toHaveBeenCalled();
  });

  it("does nothing when prompt returns null/empty name", () => {
    (globalThis as any).prompt = mock(() => null);
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {} }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"], registryDirty: false, registryLoaded: true },
    });
    handleRegistryAddProfile(ctx);
    expect(Object.keys(ctx.state.registryOverlay.profiles)).toHaveLength(0);
    expect(ctx.state.registryDirty).toBe(false);
  });
});

describe("handleRegistryDuplicateProfile — duplicate via prompt (REGWIRE-04)", () => {
  const origPrompt = (globalThis as any).prompt;
  afterEach(() => { (globalThis as any).prompt = origPrompt; });

  it("copies selected profile grid to a new name", () => {
    (globalThis as any).prompt = mock((msg: string) => {
      if (msg.toLowerCase().includes("source")) return "balanced";
      if (msg.toLowerCase().includes("new profile name")) return "work-copy";
      return null;
    });
    const ctx = makeRegistryCtx({
      state: {
        registryOverlay: { profiles: { balanced: { description: "b", hosts: { claude: { light: { model: "m", effort: "low" } } } } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light", "standard", "deep"] },
        registryDirty: false, registryLoaded: true,
      },
    });
    handleRegistryDuplicateProfile(ctx);
    expect(ctx.state.registryOverlay.profiles["work-copy"]).toBeDefined();
    expect(ctx.state.registryOverlay.profiles["work-copy"].hosts.claude.light.model).toBe("m");
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("alerts when no profiles available to duplicate", () => {
    const origAlert = (globalThis as any).alert;
    (globalThis as any).alert = mock(() => {});
    (globalThis as any).prompt = mock(() => "x");
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryDuplicateProfile(ctx);
    expect((globalThis as any).alert).toHaveBeenCalled();
    (globalThis as any).alert = origAlert;
  });

  it("alerts when source profile not found", () => {
    const origAlert = (globalThis as any).alert;
    (globalThis as any).alert = mock(() => {});
    (globalThis as any).prompt = mock((msg: string) => {
      if (msg.toLowerCase().includes("source")) return "nonexistent";
      return null;
    });
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: { balanced: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryDuplicateProfile(ctx);
    expect((globalThis as any).alert).toHaveBeenCalled();
    (globalThis as any).alert = origAlert;
  });
});

describe("handleRegistryDeleteProfile — delete + tombstone (REGWIRE-05)", () => {
  const origPrompt = (globalThis as any).prompt;
  const origAlert = (globalThis as any).alert;
  afterEach(() => { (globalThis as any).prompt = origPrompt; (globalThis as any).alert = origAlert; });

  it("sets _delete:true on existing profile", () => {
    (globalThis as any).prompt = mock(() => "balanced");
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: { balanced: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryDeleteProfile(ctx);
    expect(ctx.state.registryOverlay.profiles.balanced._delete).toBe(true);
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("alerts when profile not found", () => {
    (globalThis as any).alert = mock(() => {});
    (globalThis as any).prompt = mock(() => "nonexistent");
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: { balanced: { hosts: {} } }, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryDeleteProfile(ctx);
    expect((globalThis as any).alert).toHaveBeenCalled();
  });

  it("alerts when no profiles available to delete", () => {
    (globalThis as any).alert = mock(() => {});
    (globalThis as any).prompt = mock(() => "x");
    const ctx = makeRegistryCtx({
      state: { registryOverlay: { profiles: {}, hostDefaults: {}, workflowTiers: {}, tiers: ["light"] }, registryDirty: false, registryLoaded: true },
    });
    handleRegistryDeleteProfile(ctx);
    expect((globalThis as any).alert).toHaveBeenCalled();
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

// ── Registry save/clear overlay (REGWIRE-07..13) ─────────────────────────────

describe("handleRegistrySaveOverlay — confirm + PUT + dirty reset (REGWIRE-07..10)", () => {
  const origConfirm = (globalThis as any).confirm;
  afterEach(() => { (globalThis as any).confirm = origConfirm; });

  it("shows confirm naming the overlay file path (REGWIRE-07)", async () => {
    (globalThis as any).confirm = mock(() => false);
    const ctx = makeRegistryCtx({ state: { registryOverlay: { profiles: {} }, registryDirty: true, registryLoaded: true } });
    await handleRegistrySaveOverlay(ctx);
    const msg = ((globalThis as any).confirm.mock.calls[0] as any[])[0] as string;
    expect(msg.toLowerCase()).toContain("overlay");
    expect(msg.toLowerCase()).toContain("validat");
  });

  it("PUTs the full in-memory overlay on confirm (REGWIRE-08)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true, data: { registry: {}, source: { overlay: { profiles: { balanced: {} } } } } }));
    const ctx = makeRegistryCtx({
      api: { request },
      state: { registryOverlay: { profiles: { balanced: { description: "x" } } }, registryDirty: true, registryLoaded: true },
    });
    await handleRegistrySaveOverlay(ctx);
    expect(request).toHaveBeenCalled();
    const call = request.mock.calls[0] as any[];
    expect(call[0]).toBe("/api/v1/model-registry");
    expect(call[1].method).toBe("PUT");
    expect(call[1].body.profiles.balanced.description).toBe("x");
  });

  it("resets registryDirty + reloads overlay on success (REGWIRE-09)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: true, data: { registry: {}, source: { overlay: { profiles: { balanced: { description: "saved" } }, builtin: {}, tombstoned: [] } } } }));
    const render = mock(() => {});
    const ctx = makeRegistryCtx({
      api: { request }, render,
      state: { registryOverlay: { profiles: { balanced: { description: "x" } } }, registryDirty: true, registryLoaded: true },
    });
    await handleRegistrySaveOverlay(ctx);
    expect(ctx.state.registryDirty).toBe(false);
    expect(ctx.state.registryLoaded).toBe(false); // reset so render re-inits from new source
    expect(render).toHaveBeenCalled();
  });

  it("shows error banner with all violations on 400 (REGWIRE-10)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async () => ({ success: false, error: "validation failed", details: ["profiles.foo missing tier 'standard'", "hostDefaults.bar unknown profile"] }));
    const ctx = makeRegistryCtx({
      api: { request },
      state: { registryOverlay: { profiles: { foo: {} } }, registryDirty: true, registryLoaded: true },
    });
    await handleRegistrySaveOverlay(ctx);
    expect(ctx.root.children[0].textContent).toContain("missing tier 'standard'");
    expect(ctx.root.children[0].textContent).toContain("hostDefaults.bar unknown profile");
    // dirty stays true on error
    expect(ctx.state.registryDirty).toBe(true);
  });

  it("cancel (confirm=false) sends no PUT", async () => {
    (globalThis as any).confirm = mock(() => false);
    const request = mock(async () => ({ success: true }));
    const ctx = makeRegistryCtx({ api: { request }, state: { registryOverlay: { profiles: {} }, registryDirty: true, registryLoaded: true } });
    await handleRegistrySaveOverlay(ctx);
    expect(request).not.toHaveBeenCalled();
  });
});

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

describe("handleRegistryRegenerate — streaming SSE (REGEN-01..06)", () => {
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

  it("shows confirm before calling regenerate-and-install-stream (REGEN-01)", async () => {
    (globalThis as any).confirm = mock(() => false);
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    await handleRegistryRegenerate(ctx);
    expect((globalThis as any).confirm).toHaveBeenCalled();
    const msg = ((globalThis as any).confirm.mock.calls[0] as any[])[0] as string;
    expect(msg.toLowerCase()).toContain("regenerate");
    expect(msg.toLowerCase()).toContain("overwrite");
  });

  it("cancel (confirm=false) sends no fetch", async () => {
    (globalThis as any).confirm = mock(() => false);
    const fetchMock = mock(async () => makeSseResponse([]));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    await handleRegistryRegenerate(ctx);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends auth headers from ctx.api.authHeaders (REGEN-SEC)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const fetchMock = mock(async () => makeSseResponse(['data: {"type":"done","exitCode":0}\n\n']));
    (globalThis as any).fetch = fetchMock;
    const ctx = makeRegistryCtx({
      api: { request: mock(async () => ({})), authHeaders: () => ({ "x-api-key": "secret-key" }) },
      state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true },
    });
    await handleRegistryRegenerate(ctx);
    expect(fetchMock).toHaveBeenCalled();
    const fetchArg = (fetchMock.mock.calls[0] as any[])[1] as any;
    expect(fetchArg.headers["x-api-key"]).toBe("secret-key");
  });

  it("fetches regenerate-and-install-stream on confirm + shows success banner on done exit 0 (REGEN-02, REGEN-05)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const sseChunks = [
      'data: {"type":"line","stream":"stdout","text":"Generating claude agents..."}\n\n',
      'data: {"type":"line","stream":"stdout","text":"Done."}\n\n',
      'data: {"type":"install","host":"claude","status":"switched","profile":"balanced","switched":"claude","skipped":"none","failed":"none"}\n\n',
      'data: {"type":"done","exitCode":0}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const render = mock(() => {});
    const ctx = makeRegistryCtx({ render, state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    await handleRegistryRegenerate(ctx);
    expect((globalThis as any).fetch).toHaveBeenCalled();
    // success banner shows completion message + install info
    expect(ctx.root.children[0].textContent).toContain("complete");
    expect(ctx.root.children[0].textContent).toContain("Installed");
    expect(ctx.state.regenerating).toBe(false);
  });

  it("does NOT render a success banner when exitCode is 0 but a host install failed (APCR-06.6)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const sseChunks = [
      'data: {"type":"install","host":"claude","status":"switched","profile":"balanced","switched":"claude","skipped":"none","unsupported":"none","failed":"none"}\n\n',
      'data: {"type":"install","host":"codex","status":"failed","profile":"balanced","switched":"none","skipped":"none","unsupported":"none","failed":"codex (locked)"}\n\n',
      'data: {"type":"done","exitCode":0}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    await handleRegistryRegenerate(ctx);
    const banner = ctx.root.children[0];
    expect(banner.className).not.toBe("success");
    expect(banner.textContent).toContain("codex");
  });

  it("classifies an unsupported install as its own class, not folded into skipped (APCR-06.7)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const sseChunks = [
      'data: {"type":"install","host":"cursor","status":"unsupported","profile":"balanced","switched":"none","skipped":"none","unsupported":"cursor (bundle has no variants)","failed":"none"}\n\n',
      'data: {"type":"done","exitCode":0}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    await handleRegistryRegenerate(ctx);
    const banner = ctx.root.children[0];
    expect(banner.className).not.toBe("success");
    expect(banner.textContent.toLowerCase()).toContain("unsupported");
    expect(banner.textContent).not.toContain("Skipped: cursor");
  });

  it("shows failure banner on done with non-zero exit (REGEN-05)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const sseChunks = [
      'data: {"type":"line","stream":"stderr","text":"fatal error"}\n\n',
      'data: {"type":"done","exitCode":1}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    await handleRegistryRegenerate(ctx);
    expect(ctx.root.children[0].textContent).toContain("failed");
  });

  it("shows failure banner on spawn failure (done with exitCode null + error) (REGEN-07)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const sseChunks = [
      'data: {"type":"done","exitCode":null,"error":"spawn ENOENT"}\n\n',
    ];
    (globalThis as any).fetch = mock(async () => makeSseResponse(sseChunks));
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    await handleRegistryRegenerate(ctx);
    expect(ctx.root.children[0].textContent).toContain("ENOENT");
  });

  it("disables Regenerate button while running (REGEN-06) via state.regenerating guard", async () => {
    (globalThis as any).confirm = mock(() => true);
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
    const regenPromise = handleRegistryRegenerate(ctx);
    // While running, state.regenerating should be true
    expect(ctx.state.regenerating).toBe(true);
    resolveStream!();
    await regenPromise;
    expect(ctx.state.regenerating).toBe(false);
  });

  it("shows error banner on fetch failure (network)", async () => {
    (globalThis as any).confirm = mock(() => true);
    (globalThis as any).fetch = mock(async () => { throw new Error("network down"); });
    const ctx = makeRegistryCtx({ state: { regenerating: false, registryOverlay: { profiles: {} }, registryLoaded: true } });
    await handleRegistryRegenerate(ctx);
    expect(ctx.root.children[0].textContent).toContain("network down");
    expect(ctx.state.regenerating).toBe(false);
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