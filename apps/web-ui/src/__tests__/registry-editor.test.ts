import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { WORKFLOW_STEMS } from "../static/views/registry.js";

const mod = await import("../static/app.js");
const UI = (globalThis as any).MASSA_AI_UI || {};
const { renderModelRegistry, renderProfilesView } = { ...mod, ...UI } as {
  renderModelRegistry: (
    data: unknown,
    opts?: { writeMode?: boolean; registryForm?: Record<string, unknown> | null; agentOverridesProfile?: string },
  ) => string;
  renderProfilesView: (profilesData: unknown, registryData: unknown, opts?: Record<string, unknown> | null) => string;
};

const SAMPLE_REGISTRY = {
  registry: {
    models: {
      "claude-sonnet-5": { name: "Sonnet 5", host: "claude", provider: "", model: "claude-sonnet-5" },
      "claude-opus-5-5": { name: "Opus 5.5", host: "claude", provider: "", model: "claude-opus-5-5" },
      "codex-gpt-5": { name: "GPT-5", host: "codex", provider: "", model: "gpt-5" },
      "opencode-go-glm-5-2": { name: "GLM 5.2", host: "opencode", provider: "opencode-go", model: "glm-5.2" },
    },
    profiles: {
      balanced: {
        description: "Balanced profile",
        hosts: {
          claude: { model: "claude-sonnet-5", effort: "medium" },
          codex: { model: "gpt-5", effort: "medium" },
          cursor: { model: null, effort: null },
          opencode: { model: "opencode-go/glm-5.2", effort: "high" },
        },
        agents: {
          builder: { opencode: { model: "opencode-go/glm-5.2", effort: "max" } },
        },
      },
      work: {
        description: "Work profile",
        hosts: {
          claude: { model: "claude-opus-5-5", effort: "max" },
        },
      },
    },
  },
  source: {
    builtin: {
      models: {
        "claude-sonnet-5": { name: "Sonnet 5", host: "claude", provider: "", model: "claude-sonnet-5" },
        "codex-gpt-5": { name: "GPT-5", host: "codex", provider: "", model: "gpt-5" },
        "opencode-go-glm-5-2": { name: "GLM 5.2", host: "opencode", provider: "opencode-go", model: "glm-5.2" },
      },
    },
    overlay: {
      profiles: { work: { description: "Custom work profile", hosts: {} } },
      models: { "claude-opus-5-5": { name: "Opus 5.5", host: "claude", provider: "", model: "claude-opus-5-5" } },
    },
    tombstoned: ["old-profile"],
  },
  agents: [{ name: "builder" }, { name: "reviewer" }],
};

describe("renderModelRegistry — Models section (AC4)", () => {
  it("renders every catalog model as a table row: name, tool, resolved model", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("<h3>Models</h3>");
    expect(html).toContain("Sonnet 5");
    expect(html).toContain("claude-sonnet-5");
    expect(html).toContain("GLM 5.2");
    expect(html).toContain("opencode-go/glm-5.2");
  });

  it("renders Edit + Delete per row in write mode, and hides both in read mode", () => {
    const write = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(write).toContain('data-action="model-edit" data-id="claude-sonnet-5"');
    expect(write).toContain('data-action="model-delete" data-id="claude-sonnet-5"');
    const read = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(read).not.toContain('data-action="model-edit"');
    expect(read).not.toContain('data-action="model-delete"');
  });

  it("renders an Add Model trigger in write mode only", () => {
    expect(renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true })).toContain('data-action="model-add"');
    expect(renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false })).not.toContain('data-action="model-add"');
  });

  it("renders the Add Model form with Name, Tool, Provider, Model fields", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "model-add", host: "claude" } });
    expect(html).toContain('data-create="name" data-form="model-form"');
    expect(html).toContain('data-create="host" data-form="model-form"');
    expect(html).toContain('data-create="provider" data-form="model-form"');
    expect(html).toContain('data-create="model" data-form="model-form"');
    expect(html).toContain('data-action="model-form-submit"');
    expect(html).toContain('data-action="model-form-cancel"');
  });

  it("1M-context checkbox renders only when the form's Tool is Claude (D2)", () => {
    const claudeForm = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "model-add", host: "claude" } });
    expect(claudeForm).toContain('data-create="context1m"');
    expect(claudeForm).toContain("1M context");

    const codexForm = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "model-add", host: "codex" } });
    expect(codexForm).not.toContain('data-create="context1m"');

    const cursorForm = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "model-add", host: "cursor" } });
    expect(cursorForm).not.toContain('data-create="context1m"');

    const opencodeForm = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "model-add", host: "opencode" } });
    expect(opencodeForm).not.toContain('data-create="context1m"');
  });

  it("the checked 1M checkbox and a context1m:true catalog entry both surface [1m] on the resolved string", () => {
    const checkedForm = renderModelRegistry(SAMPLE_REGISTRY, {
      writeMode: true,
      registryForm: { kind: "model-add", host: "claude", context1m: true },
    });
    expect(checkedForm).toContain('data-create="context1m" data-form="model-form" checked');

    const registryWith1m = {
      ...SAMPLE_REGISTRY,
      registry: {
        ...SAMPLE_REGISTRY.registry,
        models: { ...SAMPLE_REGISTRY.registry.models, "claude-fable-1m": { name: "Fable (1M)", host: "claude", provider: "", model: "claude-fable-5-1", context1m: true } },
      },
    };
    const table = renderModelRegistry(registryWith1m, { writeMode: true });
    expect(table).toContain("claude-fable-5-1[1m]");
  });

  it("Edit prefills Name/Tool/Provider/Model/1M from the model being edited", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, {
      writeMode: true,
      registryForm: { kind: "model-edit", editId: "claude-opus-5-5", host: "claude", name: "Opus 5.5", provider: "", model: "claude-opus-5-5", context1m: false },
    });
    expect(html).toContain('value="Opus 5.5"');
    expect(html).toContain('value="claude-opus-5-5"');
    expect(html).toContain('data-action="model-form-submit">Save</button>');
  });

  it("renders an inline .form-error instead of alert() when the model form carries an error", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "model-add", host: "claude", error: "Model is required." } });
    expect(html).toContain('class="form-error"');
    expect(html).toContain("Model is required.");
  });

  it("empty catalog renders an empty-state message, not a missing table", () => {
    const html = renderModelRegistry({ ...SAMPLE_REGISTRY, registry: { ...SAMPLE_REGISTRY.registry, models: {} } }, { writeMode: true });
    expect(html).toContain("No models in the catalog.");
  });
});

describe("renderModelRegistry — profile grid uses tool rows + model-select cells (AC5)", () => {
  const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });

  it("renders profiles as columns and tools as rows (no tier rows/column)", () => {
    expect(html).toContain("balanced");
    expect(html).toContain("work");
    expect(html).toContain("Claude");
    expect(html).toContain("Codex");
    expect(html).toContain("Cursor");
    expect(html).toContain("OpenCode");
    expect(html).not.toContain("<th>Tier</th>");
    expect(html).not.toContain('class="tier-cell"');
  });

  it("renders a model <select> per cell listing that host's catalog models", () => {
    expect(html).toContain('data-action="registry-model-select" data-profile="balanced" data-host="claude"');
    const start = html.indexOf('data-action="registry-model-select" data-profile="balanced" data-host="claude"');
    const end = html.indexOf("</select>", start);
    const cellHtml = html.slice(start, end);
    expect(cellHtml).toContain(">Sonnet 5<");
    expect(cellHtml).toContain(">Opus 5.5<");
    expect(cellHtml).not.toContain(">GPT-5<"); // codex-only model must not leak into the claude select
  });

  it("first option is Inherit, selected when the cell has no model", () => {
    const start = html.indexOf('data-action="registry-model-select" data-profile="balanced" data-host="cursor"');
    const end = html.indexOf("</select>", start);
    const cellHtml = html.slice(start, end);
    expect(cellHtml).toContain('<option value="" selected>Inherit</option>');
  });

  it("a cell string matching no catalog model for that host renders as a custom: option", () => {
    const withCustom = {
      ...SAMPLE_REGISTRY,
      registry: {
        ...SAMPLE_REGISTRY.registry,
        profiles: {
          ...SAMPLE_REGISTRY.registry.profiles,
          balanced: {
            ...SAMPLE_REGISTRY.registry.profiles.balanced,
            hosts: { ...SAMPLE_REGISTRY.registry.profiles.balanced.hosts, claude: { model: "some/deleted-model", effort: "high" } },
          },
        },
      },
    };
    const out = renderModelRegistry(withCustom, { writeMode: true });
    expect(out).toContain("custom: some/deleted-model");
  });

  it("renders read mode as a plain string, no select", () => {
    const readHtml = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(readHtml).not.toContain('data-action="registry-model-select"');
    expect(readHtml).toContain("claude-sonnet-5");
  });

  it("wraps the grid in a .grid-scroll horizontal-scroll container", () => {
    expect(html).toContain('<div class="grid-scroll">');
  });

  it("marks overlay-sourced profile columns with an override badge, and only those", () => {
    expect(html).toContain("overlay-badge");
    const workHeaderIdx = html.indexOf(">work<");
    const headerStart = html.lastIndexOf("<th>", workHeaderIdx);
    const headerEnd = html.indexOf("</th>", workHeaderIdx);
    expect(html.slice(headerStart, headerEnd)).toContain("overlay-badge");
    const balancedHeaderIdx = html.indexOf(">balanced<");
    const balancedStart = html.lastIndexOf("<th>", balancedHeaderIdx);
    const balancedEnd = html.indexOf("</th>", balancedHeaderIdx);
    expect(html.slice(balancedStart, balancedEnd)).not.toContain("overlay-badge");
  });

  it("names the non-zero breakdown categories (models, profiles) in the count line", () => {
    const out = renderModelRegistry(
      { ...SAMPLE_REGISTRY, overlayOverrideCount: 3, overlayOverrideBreakdown: { models: 1, profiles: 2 } },
      { writeMode: true },
    );
    expect(out).toContain("You have 3 custom overrides of the built-in defaults: 1 in Models, 2 in Model Catalog profiles.");
  });
});

describe("renderModelRegistry — effort enum constraint (unchanged per host)", () => {
  const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });

  it("renders effort select for claude/codex/opencode with the documented enum", () => {
    expect(html).toContain("xhigh");
    expect(html).toContain("minimal");
    expect(html).toContain('data-type="enum"');
  });

  it("renders n/a for cursor effort (empty enum)", () => {
    expect(html).toContain("n/a");
  });
});

describe("renderModelRegistry — no tiers, no Default Profile per Tool, no Per-Workflow section (AC5)", () => {
  const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });

  it("removed sections and vocabulary do not appear", () => {
    expect(html).not.toContain("Default Profile per Tool");
    expect(html).not.toContain("Per-Workflow Tier Overrides");
    expect(html).not.toContain("Capability Tiers");
    expect(html).not.toContain('data-action="registry-hostDefault"');
    expect(html).not.toContain('data-action="registry-workflowTier"');
    expect(html).not.toContain("Per-Agent Tier Overrides");
  });
});

describe("renderModelRegistry — Per-Agent Model Overrides (AC6)", () => {
  it("renders a profile selector", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="agent-overrides-profile"');
    expect(html).toContain("<h3>Per-Agent Model Overrides</h3>");
  });

  it("rows come from payload.agents, never hardcoded — an injected fake agent name renders", () => {
    const withFakeAgent = { ...SAMPLE_REGISTRY, agents: [...SAMPLE_REGISTRY.agents, { name: "zzz-injected-fake-agent" }] };
    const html = renderModelRegistry(withFakeAgent, { writeMode: true });
    expect(html).toContain("zzz-injected-fake-agent");
  });

  it("cell select's first option is Profile default, selected when the agent has no override", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, agentOverridesProfile: "balanced" });
    const start = html.indexOf('data-action="registry-agent-model-select" data-profile="balanced" data-agent="reviewer" data-host="claude"');
    const end = html.indexOf("</select>", start);
    expect(html.slice(start, end)).toContain('<option value="" selected>Profile default</option>');
  });

  it("an agent with an override shows the overridden model selected, not Profile default", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, agentOverridesProfile: "balanced" });
    const start = html.indexOf('data-action="registry-agent-model-select" data-profile="balanced" data-agent="builder" data-host="opencode"');
    const end = html.indexOf("</select>", start);
    const cell = html.slice(start, end);
    expect(cell).toContain('value="opencode-go/glm-5.2" selected');
    expect(cell).not.toContain('value="" selected');
  });

  it("selects the requested profile via agentOverridesProfile, defaulting to balanced", () => {
    const defaultProfile = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(defaultProfile).toContain('<option value="balanced" selected>balanced</option>');

    const explicit = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, agentOverridesProfile: "work" });
    expect(explicit).toContain('<option value="work" selected>work</option>');
  });

  it("agentsError renders a muted notice instead of a table", () => {
    const html = renderModelRegistry({ ...SAMPLE_REGISTRY, agents: [], agentsError: "charter read failed" }, { writeMode: true });
    expect(html).toContain("Agent list unavailable: charter read failed");
  });

  it("no agents renders a muted notice", () => {
    const html = renderModelRegistry({ ...SAMPLE_REGISTRY, agents: [] }, { writeMode: true });
    expect(html).toContain("No agents found.");
  });

  it("renders read mode as plain strings, no select", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(html).not.toContain('data-action="registry-agent-model-select"');
  });

  it("renderProfilesView forwards agentOverridesProfile through to renderModelRegistry (start-app.ts wiring)", () => {
    const html = renderProfilesView({ hosts: [] }, SAMPLE_REGISTRY, { profilesTab: "registry", writeMode: true, agentOverridesProfile: "work" });
    expect(html).toContain('<option value="work" selected>work</option>');
  });
});

describe("renderModelRegistry — profile management (unchanged)", () => {
  it("renders Add/Duplicate/Delete Profile buttons in write mode, hides them in read mode", () => {
    const write = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(write).toContain('data-action="registry-add-profile"');
    expect(write).toContain('data-action="registry-duplicate-profile"');
    expect(write).toContain('data-action="registry-delete-profile"');
    const read = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(read).not.toContain('data-action="registry-add-profile"');
  });

  it("renders tombstoned profiles in a restorable list", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain("Removed Profiles (restorable)");
    expect(html).toContain('data-tombstoned="old-profile"');
    expect(html).toContain('data-action="registry-restore" data-profile="old-profile"');
  });

  it("duplicate-profile form: source select + new-name input", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "duplicate-profile", error: null } });
    expect(html).toContain('data-action="registry-form-source"');
    expect(html).toContain('value="balanced"');
    expect(html).toContain('data-action="registry-form-new-name"');
  });

  it("delete-profile form: profile select", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "delete-profile", error: null } });
    expect(html).toContain('data-action="registry-form-profile"');
  });

  it("add-profile form: name + description inputs", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "add-profile", error: null } });
    expect(html).toContain('data-action="registry-form-name"');
    expect(html).toContain('data-action="registry-form-description"');
  });

  it("renders only the form matching the open kind, not the others", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, registryForm: { kind: "add-profile", error: null } });
    expect(html).toContain('data-action="registry-form-name"');
    expect(html).not.toContain('data-action="registry-form-source"');
    expect(html).not.toContain('data-action="registry-form-profile"');
  });

  it("renders no inline form in read mode even when registryForm is set", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false, registryForm: { kind: "add-profile", error: null } });
    expect(html).not.toContain('class="registry-inline-form');
  });
});

describe("renderModelRegistry — action buttons + empty/error states", () => {
  it("renders Save & Apply and Discard All Overrides in write mode only", () => {
    const write = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(write).toContain('data-action="registry-save-apply"');
    expect(write).toContain('data-action="registry-clear-overlay"');
    const read = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: false });
    expect(read).not.toContain('data-action="registry-save-apply"');
  });

  it("renders an overlay error banner and still shows the builtin grid", () => {
    const html = renderModelRegistry({ ...SAMPLE_REGISTRY, overlayError: "bad json" }, { writeMode: true });
    expect(html).toContain("Saved changes could not be loaded");
    expect(html).toContain("bad json");
  });

  it("renders the empty state when there are no profiles", () => {
    const html = renderModelRegistry({ registry: { profiles: {} }, source: {} }, { writeMode: true });
    expect(html).toContain("No profiles in the catalog.");
  });

  it("shows the unsaved-changes badge only when opts.unsaved is set", () => {
    const unsaved = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, unsaved: true } as any);
    expect(unsaved).toContain("unsaved changes");
    const saved = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(saved).not.toContain("unsaved changes");
  });
});

describe("renderModelRegistry — help section", () => {
  const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });

  it('h2 is "Model Catalog"', () => {
    expect(html).toContain("<h2>Model Catalog</h2>");
  });

  it("documents Models, Per-Agent Model Overrides, Save & Apply, Discard All Overrides", () => {
    expect(html).toContain("<h4>Models</h4>");
    expect(html).toContain("<h4>Per-Agent Model Overrides</h4>");
    expect(html).toContain("<h4>Save &amp; Apply</h4>");
    expect(html).toContain("<h4>Discard All Overrides</h4>");
  });

  it("notes that read-only agents follow the profile default, so the default should be the strongest model", () => {
    expect(html).toContain("resolve to the profile default");
    expect(html).toContain("strongest model");
  });

  it("does not document any removed section", () => {
    expect(html).not.toContain("<h4>Capability Tiers</h4>");
    expect(html).not.toContain("<h4>Default Profile per Tool</h4>");
    expect(html).not.toContain("<h4>Per-Workflow Tier Overrides</h4>");
  });
});

// ── Fix round: findings 6, 11, V1, V3, V4 ────────────────────────────────────

describe("renderModelRegistry — accessible names on grid and per-agent selects (finding 11)", () => {
  it("labels the profile-grid model and effort selects with profile · tool", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('data-action="registry-model-select" data-profile="balanced" data-host="claude" aria-label="balanced · Claude model"');
    expect(html).toContain('data-action="registry-effort" data-profile="balanced" data-host="claude" aria-label="balanced · Claude effort"');
  });

  it("labels the per-agent model select with agent · tool", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, agentOverridesProfile: "balanced" });
    expect(html).toContain(
      'data-action="registry-agent-model-select" data-profile="balanced" data-agent="builder" data-host="opencode" aria-label="builder · OpenCode model"',
    );
  });
});

describe("renderModelRegistry — Per-Agent effort control hidden until an override exists (V1)", () => {
  it("shows the inherited profile effort as disabled text, not an editable select, when no override exists", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, agentOverridesProfile: "balanced" });
    const start = html.indexOf('data-action="registry-agent-model-select" data-profile="balanced" data-agent="reviewer" data-host="claude"');
    const cellEnd = html.indexOf("</td>", start);
    const cellHtml = html.slice(start, cellEnd);
    expect(cellHtml).not.toContain('data-action="registry-agent-effort"');
    expect(cellHtml).toContain("medium (profile)");
  });

  it("still renders an editable effort select once an override exists", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true, agentOverridesProfile: "balanced" });
    const start = html.indexOf('data-action="registry-agent-model-select" data-profile="balanced" data-agent="builder" data-host="opencode"');
    const cellEnd = html.indexOf("</td>", start);
    const cellHtml = html.slice(start, cellEnd);
    expect(cellHtml).toContain('data-action="registry-agent-effort"');
  });
});

describe("renderModelRegistry — Profiles card (V3)", () => {
  it("wraps the grid in a card with an h3 heading and short help text", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).toContain('<div class="registry-profile-grid"><h3>Profiles</h3>');
    expect(html).toContain("Rows are tools, columns are profiles.");
  });
});

describe("renderModelRegistry — profile management moved into the Profiles card, next to the grid (V4)", () => {
  it("Add/Duplicate/Delete Profile buttons render inside .registry-profile-grid, before its grid-scroll table", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    const cardStart = html.indexOf('<div class="registry-profile-grid">');
    const addProfileIdx = html.indexOf('data-action="registry-add-profile"', cardStart);
    const gridScrollIdx = html.indexOf('<div class="grid-scroll">', cardStart);
    expect(cardStart).toBeGreaterThanOrEqual(0);
    expect(addProfileIdx).toBeGreaterThan(cardStart);
    expect(addProfileIdx).toBeLessThan(gridScrollIdx);
  });

  it("no longer renders the profile-management buttons after Per-Agent Model Overrides", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    const perAgentIdx = html.indexOf("<h3>Per-Agent Model Overrides</h3>");
    const addProfileIdx = html.indexOf('data-action="registry-add-profile"');
    expect(addProfileIdx).toBeGreaterThanOrEqual(0);
    expect(addProfileIdx).toBeLessThan(perAgentIdx);
  });
});

describe("renderModelRegistry — v1BackupPath warning banner (finding 6)", () => {
  it("shows an escaped warning banner naming the backup path", () => {
    const html = renderModelRegistry({ ...SAMPLE_REGISTRY, v1BackupPath: '/tmp/<danger>&"overlay".json' }, { writeMode: true });
    expect(html).toContain('class="warning"');
    expect(html).toContain("backed up to");
    expect(html).toContain("&lt;danger&gt;");
    expect(html).not.toContain("<danger>");
  });

  it("renders nothing extra when v1BackupPath is absent", () => {
    const html = renderModelRegistry(SAMPLE_REGISTRY, { writeMode: true });
    expect(html).not.toContain('class="warning"');
  });
});

// ── Structural no-prompt sensor: the Model Catalog tab never uses prompt()/alert() ──
// Scans only the source SPANS of handleRegistry*/handleModel*/renderModelRegistry/
// renderProfilesView — never a whole-file scan, so the (out-of-scope) Memory tab
// prompt() at a different function is never a false positive here.

const MODELS_TAB_SOURCE = [
  fs.readFileSync(path.join(import.meta.dir, "..", "static", "views", "registry.ts"), "utf8"),
  fs.readFileSync(path.join(import.meta.dir, "..", "static", "views", "registry-state.ts"), "utf8"),
  fs.readFileSync(path.join(import.meta.dir, "..", "static", "views", "profiles.ts"), "utf8"),
].join("\n");

const MEMORY_VIEW_SOURCE = fs.readFileSync(path.join(import.meta.dir, "..", "static", "views", "memory.ts"), "utf8");

function extractFunctionSpans(source: string, namePattern: RegExp): { name: string; span: string }[] {
  const spans: { name: string; span: string }[] = [];
  const declRe = /(export\s+)?(async\s+)?function\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(source))) {
    const name = m[3];
    if (!namePattern.test(name)) continue;
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

describe("no-prompt/no-alert structural sensor — Model Catalog tab", () => {
  const targetSpans = extractFunctionSpans(MODELS_TAB_SOURCE, /^(handleRegistry\w+|handleModel\w+|handleAgentOverridesProfileChange|renderModelRegistry|renderProfilesView)$/);

  it("reads a non-trivial Model-Catalog-tab and Memory-tab source population from disk", () => {
    expect(MODELS_TAB_SOURCE.length).toBeGreaterThan(20000);
    expect(MEMORY_VIEW_SOURCE.length).toBeGreaterThan(5000);
  });

  it("finds at least the known handler + renderer functions (sensor sanity — a 0-span result proves nothing)", () => {
    const names = targetSpans.map((s) => s.name);
    expect(names).toContain("renderModelRegistry");
    expect(names).toContain("renderProfilesView");
    expect(names).toContain("handleRegistryAddProfile");
    expect(names).toContain("handleRegistryDuplicateProfile");
    expect(names).toContain("handleRegistryDeleteProfile");
    expect(names).toContain("handleModelFormSubmit");
    expect(names).toContain("handleModelDelete");
    expect(targetSpans.length).toBeGreaterThanOrEqual(8);
  });

  it("contains zero prompt( calls across every matched span", () => {
    const offenders = targetSpans.filter((s) => s.span.includes("prompt("));
    expect(offenders.map((o) => o.name)).toEqual([]);
  });

  it("contains zero alert( calls across every matched span", () => {
    const offenders = targetSpans.filter((s) => s.span.includes("alert("));
    expect(offenders.map((o) => o.name)).toEqual([]);
  });

  it("the Memory tab's unrelated prompt() (out of scope for this sensor) still exists in the file", () => {
    expect(MEMORY_VIEW_SOURCE).toContain('prompt("Edit memory content:", "")');
  });
});
