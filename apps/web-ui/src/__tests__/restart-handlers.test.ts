import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// ── restart-handlers.test.ts ────────────────────────────────────────────────
// admin-portal-restart (APR-04/05, AC-5/AC-6): the Restart Server button, the
// health-poll recovery flow, and the diff-based restart proposal banner after
// a config save. Mirrors admin-handlers.test.ts's mock harness: handlers take
// ctx { api, root, state, render, doc }; banners land in root.children via
// insertBefore.

const mod = await import("../static/app.js");
const UI = (globalThis as any).MASSA_AI_UI || {};
const { renderConfig, handleServerRestart, handleConfigSave } = { ...mod, ...UI } as {
  renderConfig: (data: any, opts?: { writeMode?: boolean }) => string;
  handleServerRestart: (ctx: any, opts?: { pollIntervalMs?: number; maxAttempts?: number }) => Promise<void>;
  handleConfigSave: (ctx: any, section: string) => Promise<void>;
};

interface MockElement {
  dataset: Record<string, string>;
  type?: string;
  value?: string;
  checked?: boolean;
  className?: string;
  textContent?: string;
  remove?: () => void;
}

function makeRoot(children: MockElement[] = []) {
  const bannerChildren: MockElement[] = [];
  return {
    children: bannerChildren,
    innerHTML: "",
    querySelectorAll: (sel: string) => {
      if (sel.startsWith("[data-section=")) {
        const val = sel.match(/data-section="([^"]+)"/)?.[1] || "";
        return children.filter((c) => c.dataset["section"] === val);
      }
      if (sel === ".success, .error") return [...bannerChildren];
      return [];
    },
    insertBefore: (node: MockElement) => {
      bannerChildren.unshift(node);
      return node;
    },
    firstChild: null,
  };
}

function makeCtx(overrides: Partial<any> = {}): any {
  const root = overrides.root || makeRoot(overrides.rootChildren || []);
  return {
    root,
    state: {},
    api: overrides.api || { request: mock(async () => ({ success: true })) },
    render: overrides.render || mock(() => {}),
    doc: null,
    ...overrides,
  };
}

const origConfirm = (globalThis as any).confirm;
const origSetTimeout = (globalThis as any).setTimeout;
beforeEach(() => {
  (globalThis as any).setTimeout = (cb: () => void) => {
    cb();
    return 0 as any;
  };
});
afterEach(() => {
  (globalThis as any).confirm = origConfirm;
  (globalThis as any).setTimeout = origSetTimeout;
});

describe("renderConfig — Restart Server button gating (AC-5)", () => {
  it("renders the button in write mode", () => {
    const html = renderConfig({ config: {}, restartNeededSections: [] }, { writeMode: true });
    expect(html).toContain('data-action="server-restart"');
    expect(html).toContain("Restart Server");
  });

  it("omits the button when write mode is off", () => {
    const html = renderConfig({ config: {}, restartNeededSections: [] }, { writeMode: false });
    expect(html).not.toContain('data-action="server-restart"');
  });
});

describe("handleServerRestart (APR-04)", () => {
  it("declined confirm sends nothing", async () => {
    (globalThis as any).confirm = mock(() => false);
    const request = mock(async () => ({ success: true }));
    await handleServerRestart(makeCtx({ api: { request } }));
    expect(request).not.toHaveBeenCalled();
  });

  it("409 refusal shows the server's reason verbatim", async () => {
    (globalThis as any).confirm = mock(() => true);
    const reason = "dev watcher active (bun --watch owns this process's lifecycle)";
    const request = mock(async () => ({ success: false, error: "restart refused", reason }));
    const ctx = makeCtx({ api: { request } });
    await handleServerRestart(ctx);
    expect(ctx.root.children[0].className).toContain("error");
    expect(ctx.root.children[0].textContent).toContain(reason);
  });

  it("success polls /health until recovery, then reports back up", async () => {
    (globalThis as any).confirm = mock(() => true);
    let healthCalls = 0;
    const request = mock(async (path: string) => {
      if (path === "/api/v1/system/restart") return { success: true, restarting: true, mode: "respawn" };
      healthCalls++;
      if (healthCalls < 3) throw new Error("ECONNREFUSED");
      return { status: "ok" };
    });
    const render = mock(() => {});
    const ctx = makeCtx({ api: { request }, render });
    await handleServerRestart(ctx, { pollIntervalMs: 1, maxAttempts: 10 });
    expect(healthCalls).toBe(3);
    expect(ctx.root.children[0].textContent).toContain("back up");
    expect(render).toHaveBeenCalled();
  });

  it("bounded poll gives up with an actionable error", async () => {
    (globalThis as any).confirm = mock(() => true);
    const request = mock(async (path: string) => {
      if (path === "/api/v1/system/restart") return { success: true, restarting: true, mode: "supervised" };
      throw new Error("ECONNREFUSED");
    });
    const ctx = makeCtx({ api: { request } });
    await handleServerRestart(ctx, { pollIntervalMs: 1, maxAttempts: 2 });
    expect(ctx.root.children[0].className).toContain("error");
    expect(ctx.root.children[0].textContent).toContain("did not come back");
  });
});

describe("handleConfigSave — restart proposal banner twins (APR-05, AC-6)", () => {
  function saveCtx(changedRestartSections: string[]) {
    const request = mock(async () => ({
      success: true,
      data: { config: {}, restartNeededSections: ["embedding"], changedRestartSections },
    }));
    return makeCtx({
      api: { request },
      rootChildren: [
        { dataset: { section: "embedding", field: "dimensions" }, type: "number", value: "2560" },
      ],
    });
  }

  it("a changed restart section proposes a restart (persistent banner)", async () => {
    (globalThis as any).confirm = mock(() => true);
    const ctx = saveCtx(["embedding"]);
    await handleConfigSave(ctx, "embedding");
    const banner = ctx.root.children[0];
    expect(banner.textContent).toContain("Restart required to apply: embedding");
    expect(banner.textContent).toContain("Restart Server button");
    expect(banner.className).toContain("banner-persist");
  });

  it("an unchanged save proposes nothing", async () => {
    (globalThis as any).confirm = mock(() => true);
    const ctx = saveCtx([]);
    await handleConfigSave(ctx, "embedding");
    const banner = ctx.root.children[0];
    expect(banner.textContent).not.toContain("Restart required");
    expect(banner.className).not.toContain("banner-persist");
  });
});
