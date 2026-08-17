/**
 * Byte-identical render characterization for the `app.js` split.
 *
 * Every other suite in this package asserts on *substrings* of rendered HTML —
 * `toContain('data-action="registry-save-apply"')` and so on. That is the right
 * shape for pinning a specific decision, and the wrong shape for proving a
 * behavior-preserving move: a renderer can lose a whole help card, a `<dl>`, or
 * an attribute order and still contain every substring anyone thought to assert.
 *
 * So this file freezes the exact output string of every renderer, for a fixed
 * set of inputs, into `fixtures/render-golden.json`. The fixture was generated
 * from `app.js` at commit 6a0b1c2d — before a single line moved — and is
 * committed, so it keeps describing the pre-split behavior no matter what the
 * working tree later says. A baseline regenerated from the live tree would go
 * green against whatever the refactor happened to produce, which is the one
 * thing it must not do.
 *
 * Regenerate deliberately and never to "fix" a failure:
 *
 *   MASSA_AI_WRITE_GOLDEN=1 bun test src/__tests__/render-golden.test.ts
 *
 * A diff here after a move means the move changed output. That is the signal.
 */

import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";

// Through `unknown`: the namespace also carries non-callable exports
// (`CHECKPOINTS_LIST_BODY`, `MEMORY_TYPES`), so it does not overlap a
// call-signature index type directly.
const mod = (await import("../static/app.js")) as unknown as Record<
  string,
  (...args: unknown[]) => unknown
>;

const FIXTURE_PATH = path.join(import.meta.dir, "fixtures", "render-golden.json");

/**
 * Write mode is read through `isWriteModeEnabled()`, which consults
 * `globalThis.MASSA_AI_WEB_WRITE_MODE` first. Under bun:test there is no
 * `localStorage` and no `document`, so this flag is the only input that matters
 * and the cases below are fully deterministic.
 */
function withWriteMode<T>(enabled: boolean, fn: () => T): T {
  const g = globalThis as unknown as { MASSA_AI_WEB_WRITE_MODE?: boolean };
  const prior = g.MASSA_AI_WEB_WRITE_MODE;
  g.MASSA_AI_WEB_WRITE_MODE = enabled;
  try {
    return fn();
  } finally {
    if (prior === undefined) delete g.MASSA_AI_WEB_WRITE_MODE;
    else g.MASSA_AI_WEB_WRITE_MODE = prior;
  }
}

// ── Fixed inputs ────────────────────────────────────────────────────────────
// Deliberately awkward: markdown, HTML metacharacters, quotes, nested dotted
// config paths, a `json`-typed field, an absent optional block, multi-segment
// OpenCode model ids. A sanitized happy-path input proves the least.

const NASTY = 'a<b>"c"&d\'e';

const PROJECTS = { projects: [{ projectId: NASTY, documentCount: 12 }, { id: "p2" }] };

const MEMORIES = {
  data: {
    memories: [
      { id: "m1", type: "code", level: 1, importance: 0.5, content: "# H\n\n**b** `c` <script>x</script>" },
      { id: NASTY, type: "pattern", level: 2, importance: 0.9, content: "- one\n- two\n\n1. a\n2. b" },
      { id: "m3", type: "decision", level: 3, importance: 0.75, content: "```js\nconst a = {b: 1};\n```" },
    ],
    total: 137,
    limit: 50,
    offset: 50,
  },
};

const SEARCH_RESULTS = {
  data: { results: [{ content: "[link](https://example.com) and *em*", score: 0.42 }, { text: "no score" }] },
};

const HANDOFFS = {
  data: {
    pending: [
      { id: "h1", targetAgent: NASTY, status: "pending", summary: "## Summary\n\nwith `code`" },
      { id: "h2", status: "accepted" },
    ],
  },
};

const PROPOSALS = {
  data: { pending: [{ id: "p1", type: "consolidation", status: "pending", description: "**why**" }, { id: "p2" }] },
};

const CHECKPOINTS = {
  data: {
    checkpoints: [
      {
        id: "c1",
        taskId: NASTY,
        type: "manual",
        status: "in_progress",
        description: "d<e>",
        progressPercent: 40,
        currentStep: "s",
        totalSteps: 5,
        completedSteps: 2,
        checkpointType: "milestone",
      },
    ],
  },
};

const LOGS = {
  data: {
    entries: [
      { ts: "2026-08-10T10:00:00.000Z", level: "error", message: "boom <b>", meta: { a: 1 } },
      { ts: "2026-08-10T10:00:01.000Z", level: "info", message: "ok" },
    ],
    total: 99,
    source: "buffer",
    truncated: true,
  },
};

const LOGS_STATE = { logsFrom: "2026-08-10T09:00", logsTo: "", logsLevel: "error", logsQuery: NASTY, logsLive: true };

const CONFIG = {
  config: {
    database: { url: "postgresql://u:p@h:5432/d" },
    embedding: { provider: "ollama", model: "qwen3-embedding:4b", dimensions: 2560 },
    search: { queryUnderstanding: { enabled: true, cacheTtlMs: 1000 }, rerank: { enabled: false } },
    memory: { decay: { lambda: 0.1 }, autoImprove: { enabled: true, reviewGate: false } },
    security: { apiKey: "sekrit", corsOrigins: ["a", "b"] },
    logging: { level: "debug", enableMetrics: true },
    dataDir: "/tmp/d",
    // capturePolicy deliberately absent — exercises the "not configured" note
    // and the `json` field's undefined-renders-empty branch.
  },
  // T43 (WUT-18 AC5): a deliberately small default set, not the full ~104-field
  // defaultMassaAiConfig blob — enough to exercise the inherited-field marking
  // across text/number/boolean field types (embedding.baseURL not persisted
  // above; the whole llm section absent above) without a golden diff too large
  // to review by eye.
  defaults: {
    embedding: { baseURL: "http://localhost:11434" },
    llm: { enabled: false, baseUrl: "http://localhost:11434/v1", model: "qwen2.5:7b-instruct" },
  },
  restartNeededSections: ["database", "security"],
};

const PROFILES = {
  hosts: [
    { host: "claude", installed: true, activeProfile: "work", availableProfiles: ["work", "home"], bundleVersion: "1.48.0" },
    { host: "codex", installed: true, activeProfile: null, availableProfiles: [] },
    { host: "cursor", installed: false },
    { host: "opencode", skipped: true, skipReason: "no config dir" },
  ],
};

const REGISTRY = {
  registry: {
    tiers: ["light", "standard", "deep"],
    profiles: {
      work: {
        description: "work",
        hosts: {
          claude: { light: { model: "haiku", effort: "low" }, standard: { model: "sonnet", effort: "high" }, deep: { model: "opus", effort: "max" } },
          codex: { light: { model: "gpt-5.6-terra", effort: "minimal" } },
          cursor: { standard: { model: null, effort: null } },
          opencode: { deep: { model: "zai-coding-plan/glm-5.2/x", effort: "max" } },
        },
      },
      cheap: { description: "cheap", hosts: { claude: { light: { model: "haiku", effort: "low" } } } },
    },
    hostDefaults: { claude: "work", codex: "work", cursor: "cheap", opencode: "work" },
    workflowTiers: { "spec-driven": "deep", refactor: "standard" },
    agentTiers: { builder: { opencode: "deep" } },
  },
  source: { overlay: { profiles: { cheap: {} } }, tombstoned: ["legacy"] },
  overlayOverrideCount: 3,
  agents: [
    { name: "builder", charterTier: "standard" },
    { name: NASTY, charterTier: "light" },
  ],
};

// T42 (WUT-17 AC3/AC4): a dedicated fixture, not a mutation of REGISTRY above — REGISTRY
// also feeds `renderProfilesView/*`, and the task's own scoping requirement is that a
// golden diff touch only `renderModelRegistry/*` keys. Exercises all three non-profile
// overlay categories (hostDefaults, workflowTiers, agentTiers) plus a server-computed
// breakdown, so the count line names its categories and every corresponding row/cell
// carries the badge.
const REGISTRY_NON_PROFILE_OVERLAY = {
  ...REGISTRY,
  source: {
    overlay: { hostDefaults: { cursor: "cheap" }, workflowTiers: { "spec-driven": "deep" }, agentTiers: { builder: { opencode: "deep" } } },
    tombstoned: ["legacy"],
  },
  overlayOverrideCount: 3,
  overlayOverrideBreakdown: { hostDefaults: 1, workflowTiers: 1, agentTiers: 1, tiers: 0, profiles: 0 },
};

type Case = { name: string; run: () => unknown };

const CASES: Case[] = [];
const add = (name: string, run: () => unknown) => CASES.push({ name, run });

for (const wm of [false, true]) {
  const s = wm ? "write" : "read";
  add(`renderProjects/${s}`, () => withWriteMode(wm, () => mod.renderProjects(PROJECTS, {})));
  add(`renderProjects/${s}/indexing`, () =>
    withWriteMode(wm, () =>
      mod.renderProjects(PROJECTS, { indexJobId: "j1", indexJobStatus: "running", indexJobPhase: "embed", indexJobFileCount: 42 }),
    ),
  );
  add(`renderProjects/${s}/empty`, () => withWriteMode(wm, () => mod.renderProjects({ projects: [] }, {})));
  add(`renderMemoryBrowser/${s}`, () =>
    withWriteMode(wm, () => mod.renderMemoryBrowser(MEMORIES, { filters: { type: "code", level: 2, minImportance: 0.3 }, project: NASTY })),
  );
  add(`renderMemoryBrowser/${s}/bulkForm`, () =>
    withWriteMode(wm, () => mod.renderMemoryBrowser(MEMORIES, { filters: {}, project: "p", memoryBulkForm: { error: "nope" } })),
  );
  add(`renderMemoryBrowser/${s}/noProject`, () => withWriteMode(wm, () => mod.renderMemoryBrowser(MEMORIES, { filters: {} })));
  add(`renderMemoryBrowser/${s}/empty`, () =>
    withWriteMode(wm, () => mod.renderMemoryBrowser({ data: { memories: [], total: 0, limit: 50, offset: 0 } }, { filters: {} })),
  );
  add(`renderSearch/${s}`, () => withWriteMode(wm, () => mod.renderSearch(SEARCH_RESULTS, { query: NASTY })));
  add(`renderSearch/${s}/blank`, () => withWriteMode(wm, () => mod.renderSearch(null, { query: "" })));
  add(`renderSearch/${s}/noResults`, () => withWriteMode(wm, () => mod.renderSearch({ data: { results: [] } }, { query: "zz" })));
  add(`renderHandoffs/${s}`, () => withWriteMode(wm, () => mod.renderHandoffs(HANDOFFS, { project: NASTY })));
  add(`renderHandoffs/${s}/noProject`, () => withWriteMode(wm, () => mod.renderHandoffs(HANDOFFS, {})));
  add(`renderHandoffs/${s}/empty`, () => withWriteMode(wm, () => mod.renderHandoffs({ data: { pending: [] } }, { project: "p" })));
  add(`renderProposals/${s}`, () => withWriteMode(wm, () => mod.renderProposals(PROPOSALS, { project: "p" })));
  add(`renderProposals/${s}/noProject`, () => withWriteMode(wm, () => mod.renderProposals(PROPOSALS, {})));
  add(`renderProposals/${s}/empty`, () => withWriteMode(wm, () => mod.renderProposals({ data: { pending: [] } }, { project: "p" })));
  add(`renderCheckpoints/${s}`, () => withWriteMode(wm, () => mod.renderCheckpoints(CHECKPOINTS)));
  add(`renderCheckpoints/${s}/empty`, () => withWriteMode(wm, () => mod.renderCheckpoints({ data: { checkpoints: [] } })));
  add(`renderLogs/${s}`, () => withWriteMode(wm, () => mod.renderLogs(LOGS, LOGS_STATE)));
  add(`renderLogs/${s}/emptyLive`, () =>
    withWriteMode(wm, () => mod.renderLogs({ data: { entries: [], total: 0, source: "file" } }, { logsLive: true })),
  );
  add(`renderLogs/${s}/emptyStill`, () =>
    withWriteMode(wm, () => mod.renderLogs({ data: { entries: [], total: 0, source: "file" } }, { logsLive: false })),
  );
  add(`renderConfig/${s}`, () => withWriteMode(wm, () => mod.renderConfig(CONFIG, { writeMode: wm })));
  add(`renderProfiles/${s}`, () => withWriteMode(wm, () => mod.renderProfiles(PROFILES, { writeMode: wm })));
  add(`renderProfiles/${s}/empty`, () => withWriteMode(wm, () => mod.renderProfiles({ hosts: [] }, { writeMode: wm })));
  add(`renderModelRegistry/${s}`, () => withWriteMode(wm, () => mod.renderModelRegistry(REGISTRY, { writeMode: wm, unsaved: true })));
  for (const kind of ["add-workflow", "duplicate-profile", "delete-profile", "add-profile"]) {
    add(`renderModelRegistry/${s}/form:${kind}`, () =>
      withWriteMode(wm, () => mod.renderModelRegistry(REGISTRY, { writeMode: wm, registryForm: { kind, error: "bad" } })),
    );
  }
  add(`renderProfilesView/${s}/switch`, () =>
    withWriteMode(wm, () => mod.renderProfilesView(PROFILES, REGISTRY, { profilesTab: "switch", writeMode: wm })),
  );
  add(`renderProfilesView/${s}/registry`, () =>
    withWriteMode(wm, () => mod.renderProfilesView(PROFILES, REGISTRY, { profilesTab: "registry", writeMode: wm })),
  );
}

// Error branches — every renderer's `success === false` path.
add("errorBlock/string", () => mod.renderMemoryBrowser({ success: false, error: "plain" }, {}));
add("errorBlock/object", () => mod.renderSearch({ success: false, error: { code: "E1", message: "m" } }, { query: "q" }));
add("errorBlock/unshaped", () => mod.renderHandoffs({ success: false, error: { weird: true } }, { project: "p" }));
add("renderCheckpoints/toonString", () => mod.renderCheckpoints({ data: "toon-formatted-string" }));
add("renderLogs/error", () => mod.renderLogs({ success: false, error: "nope" }, {}));
add("renderModelRegistry/overlayError", () =>
  mod.renderModelRegistry({ ...REGISTRY, overlayError: "bad json", _error: { code: "X" } }, { writeMode: true }),
);
add("renderModelRegistry/noAgents", () => mod.renderModelRegistry({ ...REGISTRY, agents: [] }, { writeMode: true }));
add("renderModelRegistry/agentsError", () =>
  mod.renderModelRegistry({ ...REGISTRY, agentsError: "charter read failed" }, { writeMode: true }),
);
add("renderModelRegistry/nonProfileOverlay", () =>
  mod.renderModelRegistry(REGISTRY_NON_PROFILE_OVERLAY, { writeMode: true }),
);

// Pure helpers — string in, string/JSON out.
for (const [i, src] of [
  "# h1\n## h2\n\npara *em* **bold** `code`\n\n- a\n- b\n\n1. x\n2. y\n\n```ts\nconst a: {b: 1} = x;\n```\n\n[l](https://e.com)",
  "<script>alert(1)</script>",
  "",
  "unterminated ```\ncode",
].entries()) {
  add(`markdownToHtml/${i}`, () => mod.markdownToHtml(src));
}
add("escapeHtml/nasty", () => mod.escapeHtml(NASTY));
add("escapeHtml/nullish", () => JSON.stringify([mod.escapeHtml(null), mod.escapeHtml(undefined)]));
add("splitModelId", () =>
  JSON.stringify(["a/b/c", "m", "", null, "a/"].map((v) => mod.splitModelId(v as unknown))),
);
add("joinModelId", () =>
  JSON.stringify([["a", "b/c"], ["", "m"], ["", ""], [" p ", " m "]].map(([p, m]) => mod.joinModelId(p, m))),
);
add("buildConfigSectionBody/dataDir", () => JSON.stringify(mod.buildConfigSectionBody("dataDir", { dataDir: "/x" })));
add("buildConfigSectionBody/search", () =>
  JSON.stringify(
    mod.buildConfigSectionBody("search", {
      autoReindexMaxFiles: "10",
      "queryUnderstanding.enabled": true,
      "queryUnderstanding.hydeEnabled": "on",
      "queryUnderstanding.cacheTtlMs": "",
      "rerank.enabled": false,
    }),
  ),
);
add("buildConfigSectionBody/security", () =>
  JSON.stringify(mod.buildConfigSectionBody("security", { apiKey: "k", corsOrigins: "a, b ,", allowedExtensions: "" })),
);
add("buildConfigSectionBody/capturePolicyJson", () =>
  JSON.stringify(
    mod.buildConfigSectionBody("capturePolicy", { maxMatchWork: "5", rules: '[{"pattern":"a","disposition":"Keep"}]' }),
  ),
);
add("buildConfigSectionBody/capturePolicyEmptyJson", () =>
  JSON.stringify(mod.buildConfigSectionBody("capturePolicy", { rules: "   " })),
);
add("buildConfigSectionBody/unknownSection", () => JSON.stringify(mod.buildConfigSectionBody("nope", {})));
add("buildConfigSectionBody/badJsonThrows", () => {
  try {
    mod.buildConfigSectionBody("capturePolicy", { rules: "{not json" });
    return "DID NOT THROW";
  } catch (e) {
    return String((e as Error).message);
  }
});
add("mergeRegistryForDisplay/delta", () =>
  JSON.stringify(
    mod.mergeRegistryForDisplay(REGISTRY, {
      profiles: { work: { hosts: { opencode: { deep: { model: "x", effort: "low" } } } }, gone: { _delete: true }, fresh: { description: "f", hosts: {} } },
      hostDefaults: { claude: "cheap", codex: null },
      workflowTiers: { refactor: null, debug: "light" },
      agentTiers: { builder: { claude: "deep" }, dropped: null },
      tiers: ["light", "standard", "deep"],
    }),
  ),
);
add("mergeRegistryForDisplay/noOverlay", () => JSON.stringify(mod.mergeRegistryForDisplay(REGISTRY, null)));

// ── Fixture I/O ─────────────────────────────────────────────────────────────

function renderAll(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of CASES) out[c.name] = String(c.run());
  return out;
}

if (process.env.MASSA_AI_WRITE_GOLDEN === "1") {
  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(renderAll(), null, 2) + "\n", "utf8");
}

const golden = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Record<string, string>;
const actual = renderAll();

describe("render golden fixture (pre-split behavior, frozen at 6a0b1c2d)", () => {
  it("case list matches the fixture exactly — no silently added or dropped case", () => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(golden).sort());
  });

  it("has a non-trivial case population (a 0-case run would pass vacuously)", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(80);
    // Guards against a fixture of empty strings, which would also "match".
    const nonEmpty = Object.values(golden).filter((v) => v.length > 40).length;
    expect(nonEmpty).toBeGreaterThanOrEqual(70);
  });

  for (const c of CASES) {
    it(`${c.name} renders byte-identically`, () => {
      expect(actual[c.name]).toBe(golden[c.name]);
    });
  }
});
