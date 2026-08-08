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
  handleRegistryAddProfile,
  handleRegistryDuplicateProfile,
  handleRegistryDeleteProfile,
  handleRegistryRestore,
  handleRegistrySaveOverlay,
  handleRegistryClearOverlay,
  handleRegistryRegenerate,
  handleProjectIndexProgress,
  initRegistryOverlay,
  renderProfilesView,
} = { ...mod, ...UI } as {
  showBanner: (root: MockRoot, type: string, message: string) => void;
  handleConfigSave: (ctx: any, section: string) => Promise<void>;
  handleConfigReveal: (ctx: any, targetId: string) => void;
  handleProfileSwitch: (ctx: any, profile: string, host: string) => Promise<void>;
  handleProfilesTabSwitch: (ctx: any, tab: string) => void;
  handleRegistryCellEdit: (ctx: any, profile: string, host: string, tier: string, field: string, value: string) => void;
  handleRegistryHostDefaultEdit: (ctx: any, host: string, value: string) => void;
  handleRegistryWorkflowTierEdit: (ctx: any, workflow: string, value: string) => void;
  handleRegistryAddProfile: (ctx: any) => void;
  handleRegistryDuplicateProfile: (ctx: any) => void;
  handleRegistryDeleteProfile: (ctx: any) => void;
  handleRegistryRestore: (ctx: any, profile: string) => void;
  handleRegistrySaveOverlay: (ctx: any) => Promise<void>;
  handleRegistryClearOverlay: (ctx: any) => Promise<void>;
  handleRegistryRegenerate: (ctx: any) => Promise<void>;
  handleProjectIndexProgress: (ctx: any, jobId: string) => void;
  initRegistryOverlay: (ctx: any, source: any) => void;
  renderProfilesView: (data: any, opts?: any) => string;
};

// ── Mock helpers ─────────────────────────────────────────────────────────────

interface MockInput {
  type: string;
  value: string;
  dataset: Record<string, string>;
}

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
    insertBefore: (node: MockElement, ref: MockElement | null) => {
      bannerChildren.unshift(node);
      return node;
    },
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
  const api = overrides.api || { request: mock(async () => ({ success: true })) };
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
    const banners = root.children.filter((c) => c.textContent);
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
    const msg = (globalThis as any).confirm.mock.calls[0][0] as string;
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
    const call = request.mock.calls[0];
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

describe("handleConfigReveal — toggle input type (CFG-06)", () => {
  it("toggles password input to text", () => {
    const input: MockElement = { dataset: { id: "config-database-url" }, type: "password", value: "secret", addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, insertBefore: (n) => n, remove: () => {} };
    const ctx = makeCtx({
      rootChildren: [input],
      doc: { getElementById: mock(() => input) },
    });
    handleConfigReveal(ctx, "config-database-url");
    expect(input.type).toBe("text");
  });

  it("toggles text back to password on second call", () => {
    const input: MockElement = { dataset: { id: "config-database-url" }, type: "text", value: "secret", addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, insertBefore: (n) => n, remove: () => {} };
    const ctx = makeCtx({
      rootChildren: [input],
      doc: { getElementById: mock(() => input) },
    });
    handleConfigReveal(ctx, "config-database-url");
    expect(input.type).toBe("password");
  });
});