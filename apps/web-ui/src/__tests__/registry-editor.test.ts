import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";

const mod = await import("../static/app.js");
const UI = (globalThis as any).MASSA_AI_UI || {};
const { renderModelRegistry, splitModelId, joinModelId } = { ...mod, ...UI } as {
  renderModelRegistry: (data: unknown, opts?: { writeMode?: boolean; registryForm?: { kind: string; error: string | null } | null }) => string;
  splitModelId: (model: string | null | undefined) => { provider: string; model: string };
  joinModelId: (provider: string | null | undefined, model: string | null | undefined) => string | null;
};

const SAMPLE_REGISTRY = {
  registry: {
    version: 1,
    tiers: ["light", "standard", "deep"],
    hostDefaults: { claude: "balanced", codex: "balanced", cursor: "balanced", opencode: "balanced" },
    workflowTiers: { search: "standard", index: "light", audit: "deep" },
    agentTiers: { builder: { opencode: "deep" } },
    profiles: {
      balanced: {
        description: "Balanced profile",
        hosts: {
          claude: { light: { model: "claude-sonnet", effort: "low" }, standard: { model: "claude-sonnet", effort: "medium" }, deep: { model: "claude-opus", effort: "high" } },
          codex: { light: { model: "gpt-4o-mini", effort: "minimal" }, standard: { model: "gpt-4o", effort: "medium" }, deep: { model: "o1", effort: "high" } },
          cursor: { light: { model: null, effort: null }, standard: { model: "claude-sonnet", effort: null }, deep: { model: "claude-opus", effort: null } },
          opencode: { light: { model: "qwen-mini", effort: "low" }, standard: { model: "opencode-go/glm-5.2", effort: "medium" }, deep: { model: "qwen-max", effort: "high" } },
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
  agents: [
    { name: "builder", charterTier: "standard" },
    { name: "reviewer", charterTier: "light" },
  ],
};

describe("renderModelRegistry — grid render (REG-01)", () => {
  const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });

  it("renders profiles as columns", () => {
    expect(html).toContain("balanced");
    expect(html).toContain("work");
  });

  it("renders Tool + Tier leading columns instead of the merged host/tier header (T4, APUX-06)", () => {
    expect(html).toContain("Claude");
    expect(html).toContain("Light");
    expect(html).toContain("Standard");
    expect(html).toContain("Deep");
    expect(html).not.toContain("claude / light");
    expect(html).not.toContain("codex / deep");
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

describe("renderModelRegistry — Tool + Tier leading columns (T4, APUX-06, P1-B AC1)", () => {
  it("renders Tool and Tier header cells before the profile columns", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    const theadEnd = html.indexOf("</thead>");
    const thead = html.slice(0, theadEnd);
    expect(thead).toContain("<th>Tool</th>");
    expect(thead).toContain("<th>Tier</th>");
  });

  it("gives the Tool cell a rowspan equal to tiers.length", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    const tierCount = SAMPLE_REGISTRY.registry.tiers.length;
    expect(html).toContain('<th class="tool-cell" rowspan="' + tierCount + '">');
  });

  it("renders exactly one tool cell per host (first tier row only)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    const toolCellMatches = html.match(/class="tool-cell"/g) || [];
    expect(toolCellMatches.length).toBe(4); // one per REGISTRY_HOSTS entry
  });

  it("capitalizes tool and tier labels while data-* attributes keep raw lowercase ids", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('<th class="tool-cell" rowspan="3">Claude</th>');
    expect(html).toContain('<th class="tool-cell" rowspan="3">OpenCode</th>');
    expect(html).toContain('<th class="tier-cell">Light</th>');
    expect(html).toContain('<th class="tier-cell">Standard</th>');
    expect(html).toContain('<th class="tier-cell">Deep</th>');
    expect(html).toContain('data-host="claude"');
    expect(html).toContain('data-tier="light"');
  });

  it("wraps the grid in a .grid-scroll horizontal-scroll container", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('<div class="grid-scroll"><table class="registry-grid">');
  });
});

describe("splitModelId / joinModelId — provider/model split-join (T5, APUX-14, P1-B AC2-AC5)", () => {
  it("splits on the FIRST slash only, keeping the remainder in model", () => {
    expect(splitModelId("a/b/c")).toEqual({ provider: "a", model: "b/c" });
  });

  it("splits a bare model id (no slash) into an empty provider", () => {
    expect(splitModelId("m")).toEqual({ provider: "", model: "m" });
  });

  it("splits null/empty into two empty strings", () => {
    expect(splitModelId(null)).toEqual({ provider: "", model: "" });
    expect(splitModelId("")).toEqual({ provider: "", model: "" });
    expect(splitModelId(undefined)).toEqual({ provider: "", model: "" });
  });

  it("joins provider + model with a single slash", () => {
    expect(joinModelId("a", "b/c")).toBe("a/b/c");
  });

  it("joins a bare model when provider is blank", () => {
    expect(joinModelId("", "m")).toBe("m");
  });

  it("joins both-blank to null, never '' or the string 'null'", () => {
    expect(joinModelId("", "")).toBeNull();
    expect(joinModelId(null, null)).toBeNull();
    expect(joinModelId("  ", "  ")).toBeNull();
  });

  it("round-trips split -> join back to the original string", () => {
    for (const original of ["opencode-go/glm-5.2", "sonnet", "a/b/c/d"]) {
      const { provider, model } = splitModelId(original);
      expect(joinModelId(provider, model)).toBe(original);
    }
  });
});

describe("renderModelRegistry — Provider/Model split fields + hints (T5, APUX-14, APUX-05, P1-B AC2-AC5)", () => {
  it("renders separate Provider and Model inputs for the opencode/standard/balanced cell", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-provider"');
    expect(html).toContain('data-action="registry-model"');
    // opencode/standard/balanced is "opencode-go/glm-5.2" in SAMPLE_REGISTRY.
    expect(html).toContain('class="registry-provider-input" data-action="registry-provider" data-profile="balanced" data-host="opencode" data-tier="standard" value="opencode-go"');
    expect(html).toContain('class="registry-model-input" data-action="registry-model" data-profile="balanced" data-host="opencode" data-tier="standard" value="glm-5.2"');
  });

  it("renders empty Provider and Model inputs for a null-model cell", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-profile="balanced" data-host="cursor" data-tier="light" value=""');
  });

  it("carries placeholder + title hints on both Provider and Model inputs", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('placeholder="e.g. opencode-go, zai-coding-plan, local — leave blank for Claude/Codex"');
    expect(html).toContain('title="e.g. opencode-go, zai-coding-plan, local — leave blank for Claude/Codex"');
    expect(html).toContain('placeholder="e.g. sonnet · gpt-5.6-terra · glm-5.2"');
    expect(html).toContain('title="e.g. sonnet · gpt-5.6-terra · glm-5.2"');
  });

  it("renders read mode as a plain joined string, no split inputs", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).not.toContain('data-action="registry-provider"');
    expect(html).not.toContain('data-action="registry-model"');
    expect(html).toContain("opencode-go/glm-5.2");
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

  it("renders tombstoned profiles in a restorable list (REG-06, REG-07, T9: Removed Profiles nomenclature)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("Removed Profiles (restorable)");
    expect(html).not.toContain("Deleted (restorable)");
    expect(html).toContain("old-profile");
    expect(html).toContain('data-action="registry-restore"');
    expect(html).toContain('data-profile="old-profile"');
  });

  it("hides restore buttons when write mode off", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).not.toContain('data-action="registry-restore"');
  });
});

describe("renderModelRegistry — hostDefaults + workflowTiers (REG-08, REG-09, T9 nomenclature)", () => {
  it("renders hostDefaults editor with per-host selects, labeled Default Profile per Tool", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("Default Profile per Tool");
    expect(html).not.toContain("Host Defaults");
    expect(html).toContain('data-action="registry-hostDefault"');
    expect(html).toContain('data-host="claude"');
    expect(html).toContain('data-host="codex"');
  });

  it("renders workflowTiers editor with per-workflow selects, labeled Per-Workflow Tier Overrides", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("Per-Workflow Tier Overrides");
    expect(html).not.toContain("<h3>Workflow Tiers</h3>");
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

  it("renders Add Workflow Tier button when write mode on (REG-03)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-workflowTier-add"');
    expect(html).toContain("Add Workflow Tier");
  });

  it("renders Remove button per workflow tier row when write mode on (REG-03)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-workflowTier-remove"');
    expect(html).toContain('data-workflow="search"');
  });

  it("hides Add + Remove workflow tier buttons when write mode off", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).not.toContain('data-action="registry-workflowTier-add"');
    expect(html).not.toContain('data-action="registry-workflowTier-remove"');
  });
});

describe("renderModelRegistry — Per-Agent Tier Overrides table (T6, APUX-04, P1-A AC7-AC8)", () => {
  it("renders the section heading after Per-Workflow Tier Overrides (T9 nomenclature)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    const workflowIdx = html.indexOf("<h3>Per-Workflow Tier Overrides</h3>");
    const agentIdx = html.indexOf("<h3>Per-Agent Tier Overrides</h3>");
    expect(workflowIdx).toBeGreaterThan(-1);
    expect(agentIdx).toBeGreaterThan(workflowIdx);
  });

  it("renders one row per agent with one dropdown per tool", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-agent="builder"');
    expect(html).toContain('data-agent="reviewer"');
    const builderSelects = (html.match(/data-agent="builder"/g) || []).length;
    expect(builderSelects).toBe(4); // one select per REGISTRY_HOSTS entry
  });

  it("labels the default option with the raw charterTier and declared tiers with capitalized labels + raw values", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("(default: standard)"); // builder's charterTier, unmodified
    expect(html).toContain("(default: light)"); // reviewer's charterTier, unmodified
    expect(html).toContain('<option value="light">Light</option>');
    expect(html).toContain('<option value="standard">Standard</option>');
    expect(html).toContain('<option value="deep">Deep</option>');
  });

  it("selects the effective override and marks the cell overridden (builder/opencode -> deep)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    const selectStart = html.indexOf('data-agent="builder" data-host="opencode"');
    expect(selectStart).toBeGreaterThan(-1);
    const cellStart = html.lastIndexOf("<td", selectStart);
    const cellEnd = html.indexOf("</td>", selectStart);
    const cellHtml = html.slice(cellStart, cellEnd);
    expect(cellHtml).toContain('class="overridden"');
    expect(cellHtml).toContain('value="deep" selected');
  });

  it("leaves a non-overridden cell unmarked with no option selected", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    const selectStart = html.indexOf('data-agent="reviewer" data-host="claude"');
    const cellStart = html.lastIndexOf("<td", selectStart);
    const cellEnd = html.indexOf("</td>", selectStart);
    const cellHtml = html.slice(cellStart, cellEnd);
    expect(cellHtml).not.toContain('class="overridden"');
    expect(cellHtml).not.toContain("selected");
  });

  it("disables the dropdowns in read mode", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    const selectStart = html.indexOf('data-action="registry-agentTier"');
    expect(selectStart).toBeGreaterThan(-1);
    const selectEnd = html.indexOf(">", selectStart);
    expect(html.slice(selectStart, selectEnd)).toContain("disabled");
  });

  it("shows a muted notice instead of the table when agents is empty", () => {
    const html = renderModelRegistry({ ...SAMPLE_REGISTRY, agents: [] }, { writeMode: true });
    expect(html).toContain("Per-Agent Tier Overrides");
    expect(html).toContain("No agents found.");
    expect(html).not.toContain('data-action="registry-agentTier"');
  });

  it("shows a muted notice naming the error when agentsError is present", () => {
    const html = renderModelRegistry({ ...SAMPLE_REGISTRY, agentsError: "checkout absent" }, { writeMode: true });
    expect(html).toContain("Agent list unavailable");
    expect(html).toContain("checkout absent");
    expect(html).not.toContain('data-action="registry-agentTier"');
  });
});

describe("renderModelRegistry — action buttons (T8, APUX-13, REG-14, REG-15, P1-C AC5)", () => {
  it("renders exactly one Save & Apply button when write mode on, and no separate Save Overlay/Regenerate buttons (P1-C AC5)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-save-apply"');
    expect(html).toContain("Save &amp; Apply");
    expect(html).not.toContain('data-action="registry-save-overlay"');
    expect(html).not.toContain('data-action="registry-regenerate"');
  });

  it("renders clear-overlay button when write mode on, labeled Discard All Overrides (REG-14, REG-15, T9 nomenclature)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-clear-overlay"');
    expect(html).toContain("Discard All Overrides");
    expect(html).not.toContain("Reset to Built-in");
  });

  it("hides all action buttons when write mode off", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).not.toContain('data-action="registry-save-apply"');
    expect(html).not.toContain('data-action="registry-save-overlay"');
    expect(html).not.toContain('data-action="registry-regenerate"');
    expect(html).not.toContain('data-action="registry-clear-overlay"');
  });
});

describe("renderModelRegistry — overlay error + empty state (REG-16, T9 nomenclature)", () => {
  it("shows a load-error banner when overlayError present, without saying 'overlay'", () => {
    const html = renderModelRegistry({
      registry: SAMPLE_REGISTRY.registry,
      source: { overlay: null, tombstoned: [] },
      overlayError: "corrupted JSON",
    }, { writeMode: true });
    expect(html).toContain("Saved changes could not be loaded");
    expect(html).not.toContain("Overlay error");
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

  it("shows a catalog error message when _error present (UIC-06)", () => {
    // T14: "Registry load error" renamed "Catalog load error" — negative
    // vocabulary sensor (P2-D AC1) bans user-visible "registry".
    const html = renderModelRegistry({ registry: { profiles: {} }, source: {}, _error: "Route not found" }, { writeMode: true });
    expect(html).toContain("Catalog load error");
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
    expect(html).not.toContain('data-action="registry-save-apply"');
  });
});

describe("renderModelRegistry — help section (REG-01, T8, T14)", () => {
  it("renders a collapsible details help section", () => {
    // T14: bare "?" summary + "registry-help" class replaced by the shared
    // `.help-card` titled collapsible ("About this tab"), design D-5/D-6.
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("<details");
    expect(html).toContain('class="help-card"');
    expect(html).toContain("<summary>About this tab</summary>");
  });

  it("explains every current action button (T8: Save & Apply replaces Save Overlay + Regenerate Artifacts; T9: Discard All Overrides)", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("Add Profile");
    expect(html).toContain("Duplicate Profile");
    expect(html).toContain("Delete Profile");
    expect(html).toContain("Save &amp; Apply");
    expect(html).toContain("Discard All Overrides");
    expect(html).not.toContain("Save Overlay");
    expect(html).not.toContain("Regenerate Artifacts");
    expect(html).not.toContain("Reset to Built-in");
  });

  it("help section appears after action buttons", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    const actionIdx = html.indexOf('data-action="registry-clear-overlay"');
    const helpIdx = html.indexOf('class="help-card"');
    expect(actionIdx).toBeGreaterThan(-1);
    expect(helpIdx).toBeGreaterThan(actionIdx);
  });

  it("renders help section in read mode too (buttons absent, help present)", () => {
    // T14: "Button Guide" heading replaced by "Managing Profiles" as part of
    // the plain-English rewrite (design D-6, APUX-10).
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).toContain("<details");
    expect(html).toContain("Managing Profiles");
  });
});

describe("renderModelRegistry — help card content (T14, APUX-10)", () => {
  it("explains what a profile is and the three capability tiers", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("What A Profile Is");
    expect(html).toContain("Capability Tiers");
    expect(html).toContain("<strong>Light</strong>");
    expect(html).toContain("<strong>Standard</strong>");
    expect(html).toContain("<strong>Deep</strong>");
  });

  it("explains the Save & Apply flow including the CLI-restart consequence", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("Restart your CLI sessions (Claude, Codex, Cursor, OpenCode) afterward");
  });

  it("explains Per-Agent Tier Overrides and Removed Profiles", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("<h4>Per-Agent Tier Overrides</h4>");
    expect(html).toContain("<h4>Removed Profiles</h4>");
  });
});

describe("renderModelRegistry — inline dropdown forms replace prompt() (T7, APUX-12, D-4.4, P2-D AC2-AC6)", () => {
  it("renders no inline form when registryForm is absent", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).not.toContain('class="registry-inline-form');
  });

  it("add-workflow: renders a workflow + tier select excluding already-overridden workflows", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "add-workflow", error: null } });
    expect(html).toContain('data-action="registry-form-workflow"');
    expect(html).toContain('data-action="registry-form-tier"');
    // search/index/audit already have overrides in SAMPLE_REGISTRY.workflowTiers.
    const formStart = html.indexOf('data-action="registry-form-workflow"');
    const formEnd = html.indexOf("</select>", formStart);
    const workflowOptions = html.slice(formStart, formEnd);
    expect(workflowOptions).not.toContain('value="search"');
    expect(workflowOptions).not.toContain('value="index"');
    expect(workflowOptions).not.toContain('value="audit"');
    expect(workflowOptions).toContain('value="debug"');
    expect(html).toContain('data-action="registry-form-submit">Add</button>');
    expect(html).toContain('data-action="registry-form-cancel">Cancel</button>');
  });

  it("add-workflow: renders a muted notice instead of the form when every stem is taken", () => {
    const allTaken: Record<string, string> = {};
    for (const stem of [
      "adr", "architecture-audit", "architecture-fix", "bugs-audit", "bugs-fix",
      "code-quality-audit", "code-quality-fix", "commit", "debug", "design",
      "discovery", "exploration", "feature", "furps-refinement", "general",
      "implementation-audit", "implementation-fix", "judge-with-debate",
      "long-session", "maestro", "maestro-audit", "maestro-fix",
      "mobile-figma-audit", "mobile-figma-fix", "onboarding", "pr-review",
      "refactor", "requirements-audit", "requirements-fix", "rfc",
      "security-audit", "security-fix", "skill-architect", "spec-driven",
      "tdd", "tests-audit", "tests-fix", "the-fool", "ticket", "to-prd",
    ]) {
      allTaken[stem] = "standard";
    }
    const registryAllTaken = {
      ...SAMPLE_REGISTRY,
      registry: { ...SAMPLE_REGISTRY.registry, workflowTiers: allTaken },
    };
    const html = renderModelRegistry(registryAllTaken, { writeMode: true, registryForm: { kind: "add-workflow", error: null } });
    expect(html).not.toContain('data-action="registry-form-workflow"');
    expect(html).toContain("already has a tier override");
    expect(html).toContain('data-action="registry-form-cancel"');
  });

  it("add-workflow: renders the inline .form-error instead of alert() when the form carries an error", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "add-workflow", error: 'Workflow "search" already has a tier. Edit it instead.' } });
    expect(html).toContain('class="form-error"');
    expect(html).toContain("already has a tier");
  });

  it("duplicate-profile: renders a source-profile select from the display registry + a new-name input", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "duplicate-profile", error: null } });
    expect(html).toContain('data-action="registry-form-source"');
    expect(html).toContain('value="balanced"');
    expect(html).toContain('value="work"');
    expect(html).toContain('data-action="registry-form-new-name"');
    expect(html).toContain('data-action="registry-form-submit">Duplicate</button>');
  });

  it("duplicate-profile: renders a muted notice when there are no profiles to duplicate", () => {
    // profileNames.length === 0 alone hits the page's own top-level "No profiles in
    // registry" empty state before reaching profileActions at all; carrying an
    // unrelated _error keeps the rest of the page (and this notice) reachable.
    const empty = { registry: { profiles: {}, tiers: ["light"] }, source: {}, _error: "unrelated" };
    const html = renderModelRegistry(empty, { writeMode: true, registryForm: { kind: "duplicate-profile", error: null } });
    expect(html).not.toContain('data-action="registry-form-source"');
    expect(html).toContain("No profiles available to duplicate");
  });

  it("delete-profile: renders a profile select from the display registry", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "delete-profile", error: null } });
    expect(html).toContain('data-action="registry-form-profile"');
    expect(html).toContain('value="balanced"');
    expect(html).toContain('value="work"');
    expect(html).toContain('data-action="registry-form-submit">Delete</button>');
  });

  it("add-profile: renders name + description inputs, both hinted", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "add-profile", error: null } });
    expect(html).toContain('data-action="registry-form-name"');
    expect(html).toContain('data-action="registry-form-description"');
    const nameStart = html.indexOf('data-action="registry-form-name"');
    const nameEnd = html.indexOf("/>", nameStart);
    expect(html.slice(nameStart, nameEnd)).toContain("placeholder=");
    expect(html.slice(nameStart, nameEnd)).toContain("title=");
    expect(html).toContain('data-action="registry-form-submit">Add</button>');
  });

  it("renders only the form matching the open kind, not the others", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "add-profile", error: null } });
    expect(html).toContain('data-action="registry-form-name"');
    expect(html).not.toContain('data-action="registry-form-source"');
    expect(html).not.toContain('data-action="registry-form-profile"');
    expect(html).not.toContain('data-action="registry-form-workflow"');
  });

  it("renders no inline form in read mode even when registryForm is set", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false, registryForm: { kind: "add-profile", error: null } });
    expect(html).not.toContain('class="registry-inline-form');
  });
});

// ── Fix-loop 2, gap 2 (T11, APUX-09, P2-F AC4) ──────────────────────────────
// `.button-row` groups every inline-form's action buttons instead of leaving
// them visually piled, but no test asserted the literal class. It renders
// only inside the Models catalog's four inline forms (Add Workflow Override,
// Duplicate Profile, Delete Profile, Add Profile) — one assertion per emission
// site in app.js, both branches (has options / empty-state notice) where each
// form renders two different bodies.

const EMPTY_PROFILES_REGISTRY = { registry: { profiles: {}, tiers: ["light"] }, source: {}, _error: "unrelated" };

const ALL_WORKFLOW_STEMS_TAKEN: Record<string, string> = {};
for (const stem of [
  "adr", "architecture-audit", "architecture-fix", "bugs-audit", "bugs-fix",
  "code-quality-audit", "code-quality-fix", "commit", "debug", "design",
  "discovery", "exploration", "feature", "furps-refinement", "general",
  "implementation-audit", "implementation-fix", "judge-with-debate",
  "long-session", "maestro", "maestro-audit", "maestro-fix",
  "mobile-figma-audit", "mobile-figma-fix", "onboarding", "pr-review",
  "refactor", "requirements-audit", "requirements-fix", "rfc",
  "security-audit", "security-fix", "skill-architect", "spec-driven",
  "tdd", "tests-audit", "tests-fix", "the-fool", "ticket", "to-prd",
]) {
  ALL_WORKFLOW_STEMS_TAKEN[stem] = "standard";
}
const REGISTRY_ALL_WORKFLOW_STEMS_TAKEN = {
  ...SAMPLE_REGISTRY,
  registry: { ...SAMPLE_REGISTRY.registry, workflowTiers: ALL_WORKFLOW_STEMS_TAKEN },
};

describe("Models catalog inline-form button-row grouping (T11, APUX-09, P2-F AC4)", () => {
  it("add-workflow form (workflows available): Add/Cancel pair renders inside .button-row", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "add-workflow", error: null } });
    expect(html).toContain('class="button-row"');
  });

  it("add-workflow form (every stem taken — empty-state notice): lone Cancel renders inside .button-row", () => {
    const html = renderModelRegistry(REGISTRY_ALL_WORKFLOW_STEMS_TAKEN, { writeMode: true, registryForm: { kind: "add-workflow", error: null } });
    expect(html).toContain('class="button-row"');
  });

  it("duplicate-profile form (profiles available): Duplicate/Cancel pair renders inside .button-row", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "duplicate-profile", error: null } });
    expect(html).toContain('class="button-row"');
  });

  it("duplicate-profile form (no profiles — empty-state notice): lone Cancel renders inside .button-row", () => {
    const html = renderModelRegistry(EMPTY_PROFILES_REGISTRY, { writeMode: true, registryForm: { kind: "duplicate-profile", error: null } });
    expect(html).toContain('class="button-row"');
  });

  it("delete-profile form (profiles available): Delete/Cancel pair renders inside .button-row", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "delete-profile", error: null } });
    expect(html).toContain('class="button-row"');
  });

  it("delete-profile form (no profiles — empty-state notice): lone Cancel renders inside .button-row", () => {
    const html = renderModelRegistry(EMPTY_PROFILES_REGISTRY, { writeMode: true, registryForm: { kind: "delete-profile", error: null } });
    expect(html).toContain('class="button-row"');
  });

  it("add-profile form: Add/Cancel pair renders inside .button-row", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "add-profile", error: null } });
    expect(html).toContain('class="button-row"');
  });
});

// ── Structural no-prompt sensor (T7, P2-D AC6, advisory finding #4) ─────────
// Scans only the source SPANS of handleRegistry* functions and
// renderModelRegistry/renderProfilesView for `prompt(`/`alert(` — never a
// whole-file scan, so the (out-of-scope) Memory tab prompt() at a different
// function is never a false positive here.

/** The Models tab moved to its own modules when app.js was split: the catalog
 *  renderer in `views/registry.js`, every `handleRegistry*` in
 *  `views/registry-state.js`, and `renderProfilesView` in `views/profiles.js`.
 *  All three are read so the scanned population is exactly the one this sensor
 *  was written against — reading fewer would silently shrink it, and the
 *  span-count sanity assertion below is what catches that (it did, twice,
 *  during the split). */
const MODELS_TAB_SOURCE = [
  fs.readFileSync(path.join(import.meta.dir, "..", "static", "views", "registry.ts"), "utf8"),
  fs.readFileSync(path.join(import.meta.dir, "..", "static", "views", "registry-state.js"), "utf8"),
  fs.readFileSync(path.join(import.meta.dir, "..", "static", "views", "profiles.ts"), "utf8"),
].join("\n");

/** The Memory tab moved to its own module too. This sensor's control case reads
 *  it from there; the assertion itself is unchanged, only the file the source
 *  is read from. */
const MEMORY_VIEW_SOURCE = fs.readFileSync(
  path.join(import.meta.dir, "..", "static", "views", "memory.ts"),
  "utf8",
);

/** Extracts the full source text of every top-level `function name(...)  { ... }`
 *  declaration (optionally `export`/`async`) whose name matches `namePattern`,
 *  using a small brace-depth lexer that ignores braces inside string/template
 *  literals and comments so it never mis-closes on `"{" `/`"}"` inside a
 *  rendered HTML string. */
function extractFunctionSpans(source: string, namePattern: RegExp): { name: string; span: string }[] {
  const spans: { name: string; span: string }[] = [];
  const declRe = /(export\s+)?(async\s+)?function\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(source))) {
    const name = m[3];
    if (!namePattern.test(name)) continue;
    // Walk past the parameter list (balance parens) to find the body's opening brace.
    let i = declRe.lastIndex;
    let parenDepth = 1;
    while (parenDepth > 0 && i < source.length) {
      if (source[i] === "(") parenDepth++;
      else if (source[i] === ")") parenDepth--;
      i++;
    }
    while (i < source.length && source[i] !== "{") i++;
    let braceDepth = 0;
    let state: "normal" | "sq" | "dq" | "tpl" | "line" | "block" = "normal";
    let j = i;
    for (; j < source.length; j++) {
      const c = source[j];
      const prev = source[j - 1];
      if (state === "normal") {
        if (c === "'") state = "sq";
        else if (c === '"') state = "dq";
        else if (c === "`") state = "tpl";
        else if (c === "/" && source[j + 1] === "/") state = "line";
        else if (c === "/" && source[j + 1] === "*") state = "block";
        else if (c === "{") braceDepth++;
        else if (c === "}") {
          braceDepth--;
          if (braceDepth === 0) { j++; break; }
        }
      } else if (state === "sq") {
        if (c === "'" && prev !== "\\") state = "normal";
      } else if (state === "dq") {
        if (c === '"' && prev !== "\\") state = "normal";
      } else if (state === "tpl") {
        if (c === "`" && prev !== "\\") state = "normal";
      } else if (state === "line") {
        if (c === "\n") state = "normal";
      } else if (state === "block") {
        if (c === "*" && source[j + 1] === "/") { state = "normal"; j++; }
      }
    }
    spans.push({ name, span: source.slice(m.index, j) });
  }
  return spans;
}

describe("no-prompt/no-alert structural sensor — Models tab (T7, P2-D AC6)", () => {
  const targetSpans = extractFunctionSpans(MODELS_TAB_SOURCE, /^(handleRegistry\w+|renderModelRegistry|renderProfilesView)$/);

  it("finds at least the known Models-tab handler + renderer functions (sensor sanity — a 0-span result proves nothing)", () => {
    const names = targetSpans.map((s) => s.name);
    expect(names).toContain("renderModelRegistry");
    expect(names).toContain("renderProfilesView");
    expect(names).toContain("handleRegistryAddProfile");
    expect(names).toContain("handleRegistryDuplicateProfile");
    expect(names).toContain("handleRegistryDeleteProfile");
    expect(names).toContain("handleRegistryWorkflowTierAdd");
    expect(targetSpans.length).toBeGreaterThanOrEqual(6);
  });

  it("contains zero prompt( calls across every handleRegistry*/renderModelRegistry/renderProfilesView span", () => {
    const offenders = targetSpans.filter((s) => s.span.includes("prompt("));
    expect(offenders.map((o) => o.name)).toEqual([]);
  });

  it("contains zero alert( calls across every handleRegistry*/renderModelRegistry/renderProfilesView span", () => {
    const offenders = targetSpans.filter((s) => s.span.includes("alert("));
    expect(offenders.map((o) => o.name)).toEqual([]);
  });

  it("the Memory tab's unrelated prompt() (out of scope for this sensor) still exists in the file", () => {
    // Proves the sensor is scoped to specific function spans, not a whole-file
    // scan that would trivially also "pass" a repo with no prompt() anywhere.
    expect(MEMORY_VIEW_SOURCE).toContain('prompt("Edit memory content:", "")');
  });
});

// ── T9 (APUX-07, P2-D AC1): Nomenclature Map, row-by-row on renderModelRegistry ─

describe("renderModelRegistry — Nomenclature Scheme A per-row assertions (T9, APUX-07)", () => {
  const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: null });

  it('H2 "Model Registry" -> "Model Catalog"', () => {
    expect(html).toContain("<h2>Model Catalog</h2>");
    expect(html).not.toContain("Model Registry");
  });

  it('"Host Defaults" -> "Default Profile per Tool"', () => {
    expect(html).toContain("<h3>Default Profile per Tool</h3>");
    expect(html).not.toContain("Host Defaults");
  });

  it('"Workflow Tiers" -> "Per-Workflow Tier Overrides"', () => {
    expect(html).toContain("<h3>Per-Workflow Tier Overrides</h3>");
    expect(html).not.toContain("<h3>Workflow Tiers</h3>");
  });

  it('"Per-Agent Tier Overrides" section is present (new section row)', () => {
    expect(html).toContain("<h3>Per-Agent Tier Overrides</h3>");
  });

  it('"overlay" badge / count sentence -> "override" badge / new sentence', () => {
    expect(html).toContain(">override<");
    expect(html).not.toContain(">overlay<");
  });

  it('"Save Overlay" + "Regenerate Artifacts" -> single "Save & Apply"', () => {
    expect(html).toContain("Save &amp; Apply");
    expect(html).not.toContain("Save Overlay");
    expect(html).not.toContain("Regenerate Artifacts");
  });

  it('"Reset to Built-in (clear overlay)" -> "Discard All Overrides"', () => {
    expect(html).toContain("Discard All Overrides");
    expect(html).not.toContain("Reset to Built-in");
  });

  it('"Deleted (restorable)" -> "Removed Profiles (restorable)"', () => {
    expect(html).toContain("Removed Profiles (restorable)");
    expect(html).not.toContain("Deleted (restorable)");
  });

  it("data-action values, state keys and registry JSON keys keep their internal names (only user-visible text changed)", () => {
    expect(html).toContain('data-action="registry-hostDefault"');
    expect(html).toContain('data-action="registry-workflowTier"');
    expect(html).toContain('data-action="registry-clear-overlay"');
    expect(html).toContain('data-action="registry-save-apply"');
    expect(html).toContain('class="registry-hostDefaults"');
    expect(html).toContain('class="registry-workflowTiers"');
  });
});