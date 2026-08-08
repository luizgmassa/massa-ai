import { describe, it, expect } from "bun:test";

const mod = await import("../static/app.js");
const UI = (globalThis as any).MASSA_AI_UI || {};
const { renderModelRegistry } = { ...mod, ...UI } as {
  renderModelRegistry: (data: unknown, opts?: { writeMode?: boolean }) => string;
};

const SAMPLE_REGISTRY = {
  registry: {
    version: 1,
    tiers: ["light", "standard", "deep"],
    hostDefaults: { claude: "balanced", codex: "balanced", cursor: "balanced", opencode: "balanced" },
    workflowTiers: { search: "standard", index: "light", audit: "deep" },
    profiles: {
      balanced: {
        description: "Balanced profile",
        hosts: {
          claude: { light: { model: "claude-sonnet", effort: "low" }, standard: { model: "claude-sonnet", effort: "medium" }, deep: { model: "claude-opus", effort: "high" } },
          codex: { light: { model: "gpt-4o-mini", effort: "minimal" }, standard: { model: "gpt-4o", effort: "medium" }, deep: { model: "o1", effort: "high" } },
          cursor: { light: { model: null, effort: null }, standard: { model: "claude-sonnet", effort: null }, deep: { model: "claude-opus", effort: null } },
          opencode: { light: { model: "qwen-mini", effort: "low" }, standard: { model: "qwen", effort: "medium" }, deep: { model: "qwen-max", effort: "high" } },
        },
      },
      work: {
        description: "Work profile",
        hosts: {
          claude: { light: { model: "claude-haiku", effort: "low" }, standard: { model: "claude-sonnet", effort: "high" }, deep: { model: "claude-opus", effort: "max" } },
        },
      },
    },
  },
  source: {
    builtin: {},
    overlay: {
      profiles: { work: { description: "Custom work profile", hosts: {} } },
      hostDefaults: { codex: "work" },
    },
    tombstoned: ["old-profile"],
  },
};

describe("renderModelRegistry — grid render (REG-01)", () => {
  const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });

  it("renders profiles as columns", () => {
    expect(html).toContain("balanced");
    expect(html).toContain("work");
  });

  it("renders host/tier pairs as rows", () => {
    expect(html).toContain("claude / light");
    expect(html).toContain("claude / standard");
    expect(html).toContain("codex / deep");
    expect(html).toContain("cursor / light");
    expect(html).toContain("opencode / standard");
  });

  it("renders model + effort cells", () => {
    expect(html).toContain("claude-sonnet");
    expect(html).toContain("gpt-4o");
    expect(html).toContain("claude-opus");
  });

  it("renders a table with thead + tbody", () => {
    expect(html).toContain('<table class="registry-grid">');
    expect(html).toContain("<thead>");
    expect(html).toContain("<tbody>");
  });
});

describe("renderModelRegistry — overlay attribution (REG-02)", () => {
  it("marks overlay-sourced profile columns with overlay badge", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("overlay-badge");
    const workHeaderIdx = html.indexOf("work");
    const headerEnd = html.indexOf("</th>", workHeaderIdx);
    expect(html.slice(workHeaderIdx, headerEnd)).toContain("overlay");
  });

  it("does not mark builtin profiles with overlay badge", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    const balancedIdx = html.indexOf("balanced");
    const headerEnd = html.indexOf("</th>", balancedIdx);
    expect(html.slice(balancedIdx, headerEnd)).not.toContain("overlay-badge");
  });

  it("adds overlay-sourced class to overlay cells", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("overlay-sourced");
  });
});

describe("renderModelRegistry — effort enum constraint (REG-03)", () => {
  it("renders effort select for claude with correct enum values", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-host="claude"');
    expect(html).toContain("low");
    expect(html).toContain("medium");
    expect(html).toContain("high");
    expect(html).toContain("xhigh");
    expect(html).toContain("max");
  });

  it("renders effort select for codex with minimal option", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("minimal");
  });

  it("renders dropdown for opencode effort (constrained enum)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-host="opencode"');
    expect(html).toContain('data-type="enum"');
    expect(html).toContain('value="max"');
    expect(html).toContain('value="high"');
  });

  it("renders n/a for cursor effort (empty enum)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("n/a");
  });
});

describe("renderModelRegistry — profile management (REG-04..07)", () => {
  it("renders Add Profile button when write mode on", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-add-profile"');
    expect(html).toContain("Add Profile");
  });

  it("renders Duplicate Profile button when write mode on", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-duplicate-profile"');
  });

  it("renders Delete Profile button when write mode on", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-delete-profile"');
  });

  it("hides profile management buttons when write mode off", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).not.toContain('data-action="registry-add-profile"');
    expect(html).not.toContain('data-action="registry-duplicate-profile"');
    expect(html).not.toContain('data-action="registry-delete-profile"');
  });

  it("renders tombstoned profiles in a restorable list (REG-06, REG-07)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("Deleted (restorable)");
    expect(html).toContain("old-profile");
    expect(html).toContain('data-action="registry-restore"');
    expect(html).toContain('data-profile="old-profile"');
  });

  it("hides restore buttons when write mode off", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).not.toContain('data-action="registry-restore"');
  });
});

describe("renderModelRegistry — hostDefaults + workflowTiers (REG-08, REG-09)", () => {
  it("renders hostDefaults editor with per-host selects", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("Host Defaults");
    expect(html).toContain('data-action="registry-hostDefault"');
    expect(html).toContain('data-host="claude"');
    expect(html).toContain('data-host="codex"');
  });

  it("renders workflowTiers editor with per-workflow selects", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("Workflow Tiers");
    expect(html).toContain('data-action="registry-workflowTier"');
    expect(html).toContain('data-workflow="search"');
    expect(html).toContain('data-workflow="index"');
    expect(html).toContain('data-workflow="audit"');
  });

  it("lists tier options in workflowTiers selects", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("light");
    expect(html).toContain("standard");
    expect(html).toContain("deep");
  });
});

describe("renderModelRegistry — action buttons (REG-10, REG-13, REG-14, REG-15)", () => {
  it("renders Save Overlay button when write mode on (REG-10)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-save-overlay"');
    expect(html).toContain("Save Overlay");
  });

  it("renders Regenerate Artifacts button when write mode on (REG-13)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-regenerate"');
    expect(html).toContain("Regenerate Artifacts");
  });

  it("renders clear-overlay button when write mode on (REG-14, REG-15)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-clear-overlay"');
    expect(html).toContain("Reset to Built-in");
  });

  it("hides all action buttons when write mode off", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).not.toContain('data-action="registry-save-overlay"');
    expect(html).not.toContain('data-action="registry-regenerate"');
    expect(html).not.toContain('data-action="registry-clear-overlay"');
  });
});

describe("renderModelRegistry — overlay error + empty state (REG-16)", () => {
  it("shows overlay error banner when overlayError present", () => {
    const html = renderModelRegistry({
      registry: SAMPLE_REGISTRY.registry,
      source: { overlay: null, tombstoned: [] },
      overlayError: "corrupted JSON",
    }, { writeMode: true });
    expect(html).toContain("Overlay error");
    expect(html).toContain("corrupted JSON");
    expect(html).toContain("showing builtin");
  });

  it("renders empty state when no profiles", () => {
    const html = renderModelRegistry({ registry: { profiles: {} }, source: {} }, { writeMode: true });
    expect(html).toContain("No profiles");
  });

  it("renders empty state when registry empty and no overlay error", () => {
    const html = renderModelRegistry({}, { writeMode: true });
    expect(html).toContain("No profiles");
  });

  it("shows registry error message when _error present (UIC-06)", () => {
    const html = renderModelRegistry({ registry: { profiles: {} }, source: {}, _error: "Route not found" }, { writeMode: true });
    expect(html).toContain("Registry load error");
    expect(html).toContain("Route not found");
  });
});

describe("renderModelRegistry — cell inputs", () => {
  it("renders model text inputs when write mode on", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-model"');
  });

  it("renders model as text (not input) when write mode off", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).not.toContain('data-action="registry-model"');
    expect(html).toContain("claude-sonnet");
  });

  it("effort selects are disabled when write mode off", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).toContain("disabled");
  });
});

describe("renderModelRegistry — defaults writeMode", () => {
  it("defaults writeMode to isWriteModeEnabled() when not passed", () => {
    delete (globalThis as any).MASSA_AI_WEB_WRITE_MODE;
    delete (globalThis as any).document;
    delete (globalThis as any).localStorage;
    const html = renderModelRegistry(SAMPLE_REGISTRY);
    expect(html).not.toContain('data-action="registry-save-overlay"');
  });
});

describe("renderModelRegistry — help section (REG-01)", () => {
  it("renders a collapsible details help section", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("<details");
    expect(html).toContain('class="registry-help"');
    expect(html).toContain("<summary>?</summary>");
  });

  it("explains all six action buttons", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("Add Profile");
    expect(html).toContain("Duplicate Profile");
    expect(html).toContain("Delete Profile");
    expect(html).toContain("Save Overlay");
    expect(html).toContain("Regenerate Artifacts");
    expect(html).toContain("Reset to Built-in");
  });

  it("help section appears after action buttons", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    const actionIdx = html.indexOf('data-action="registry-clear-overlay"');
    const helpIdx = html.indexOf('class="registry-help"');
    expect(actionIdx).toBeGreaterThan(-1);
    expect(helpIdx).toBeGreaterThan(actionIdx);
  });

  it("renders help section in read mode too (buttons absent, help present)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).toContain("<details");
    expect(html).toContain("Button Guide");
  });
});