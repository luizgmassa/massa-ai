/**
 * Subagent parity test (T4).
 *
 * Asserts the 17 specialist agent files shipped across 4 hosts are byte-identical
 * to generator output (drift gate), correctly pinned per spec (model + effort +
 * permission), collision-free against host built-ins, exactly 17 per host, and
 * that Codex TOML parses with the # massa-ai-owned marker.
 *
 * Model and effort expectations come from `skills/model-profiles.json` plus each
 * charter's tier, checked against a frozen copy of origin/main's artifacts. The
 * FEATURES.md check is now doc-drift in the MPR-R11 direction: the doc must match the
 * charters and must NOT restate a model value. It used to assert the opposite.
 *
 * Spec: .specs/features/subagent-skills-plugin-parity/spec.md
 *       .specs/features/model-profile-registry/spec.md (MPR-R8..R11)
 */

import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs, readFileSync } from "fs";
import path from "path";
import toml from "toml";
import {
  HOST_EFFORT_ENUM,
  loadRegistry,
  resolveTier,
  selectProfile,
  type Host as RegistryHost,
} from "../lib/model-profiles.ts";
import { profilesSupporting } from "../generate-subagent-artifacts.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const GEN_SCRIPT = path.join(REPO_ROOT, "scripts/generate-subagent-artifacts.ts");

const SPECIALIST_NAMES = [
  "investigator",
  "planner",
  "builder",
  "reviewer",
  "context-curator",
  "verification-agent",
  "requirements-analyst",
  "architecture-specialist",
  "test-engineer",
  "documentation-agent",
  "audit-specialist",
  "mobile-specialist",
  "plan-critic",
  "furps-analyst",
  "navigator",
  "meta-judge",
  "judge",
] as const;
type SpecialistName = (typeof SPECIALIST_NAMES)[number];

const WRITE_AGENTS = new Set<SpecialistName>([
  "builder",
  "test-engineer",
  "documentation-agent",
]);

// ── Model + effort come from the REGISTRY, not a table copied into this file ──
// The four hard-coded per-host tables that used to live here are deleted. They were
// 60 hand-maintained facts that could disagree with the generator and with FEATURES.md,
// and three of fifteen roles had already drifted apart across hosts.
//
// TRAP this file must not fall into: deriving expectations from the same registry the
// generator reads makes a tautology — it passes whatever either contains. The
// discriminating half is the FROZEN baseline fixture below, extracted from origin/main
// with `git show`. Registry-derived assertions prove internal consistency; the frozen
// fixture proves the shipped bytes only changed where the spec says they may.
const REGISTRY = loadRegistry(path.join(REPO_ROOT, "skills/model-profiles.json"));

const BASELINE = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, ".specs/features/model-profile-registry/fixtures/baseline-main.json"),
    "utf8",
  ),
) as {
  baseCommit: string;
  agents: Record<string, Record<string, { model: string | null; effort: string | null; keys: string[] }>>;
};

/** Charter tier, read from the charter that owns it. */
function tierOf(name: SpecialistName): string {
  const raw = readFileSync(path.join(REPO_ROOT, "skills/agents", name, "SKILL.md"), "utf8");
  const m = /^  model_tier: *([A-Za-z0-9_-]+)/m.exec(raw);
  if (!m) throw new Error(`charter ${name} has no metadata.model_tier`);
  return m[1]!;
}

/** What the registry says this (host, agent) pair should be, under the host default profile. */
function expected(host: RegistryHost, name: SpecialistName) {
  const profile = selectProfile(REGISTRY, host, { env: {} });
  return resolveTier(REGISTRY, host, profile, tierOf(name));
}

// ── Documented frontmatter schemas, per host (MPR-R9) ───────────────────────
// A host key not on its list either does nothing or, on OpenCode, is forwarded to the
// model provider as a bogus model option. Each list cites the doc that defines it.
const ALLOWED_KEYS: Record<string, { keys: ReadonlySet<string>; source: string }> = {
  // name, description, model, effort, maxTurns, tools, disallowedTools, skills, memory,
  // background, isolation. hooks/mcpServers/permissionMode are rejected for plugin agents.
  claude: {
    keys: new Set([
      "name", "description", "model", "effort", "maxTurns", "tools",
      "disallowedTools", "skills", "memory", "background", "isolation",
    ]),
    source: "https://code.claude.com/docs/en/sub-agents.md",
  },
  // Required: name, description, developer_instructions. Optional: model,
  // model_reasoning_effort, sandbox_mode, mcp_servers, skills.config. No `tools` key exists.
  codex: {
    keys: new Set([
      "name", "description", "developer_instructions", "model",
      "model_reasoning_effort", "sandbox_mode", "mcp_servers",
    ]),
    source: "https://learn.chatgpt.com/docs/agent-configuration/subagents",
  },
  // EXACTLY five fields. No `tools`, no `reasoningEffort`.
  cursor: {
    keys: new Set(["name", "description", "model", "readonly", "is_background"]),
    source: "https://cursor.com/docs/subagents.md",
  },
  // No `name` (the filename is the agent name). `tools` is deprecated for `permission`.
  // reasoningEffort is legitimate: a documented generic provider pass-through.
  opencode: {
    keys: new Set([
      "description", "mode", "model", "temperature", "top_p", "permission",
      "steps", "hidden", "disable", "color", "prompt", "reasoningEffort",
    ]),
    source: "https://opencode.ai/docs/agents/",
  },
};

/** The shape OpenCode can actually resolve — rejects a display name under any provider. */
const OPENCODE_MODEL_ID = /^[a-z0-9-]+\/[a-z0-9.:-]+$/;

// ── Host built-in names (spec name-collision ACs) ───────────────────────────
const HOST_BUILTINS: Record<string, ReadonlySet<string>> = {
  claude: new Set(["Explore", "Plan", "general-purpose"]),
  codex: new Set(["default", "worker", "explorer"]),
  cursor: new Set(["Explore", "Plan", "general-purpose"]),
  opencode: new Set(["build", "plan", "general", "explore", "scout"]),
};

// ── Frontmatter parser (minimal, for .md agents) ───────────────────────────
function parseMdFrontmatter(raw: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if (!m) throw new Error("missing frontmatter");
  const fm: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const lm = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (lm) fm[lm[1]] = lm[2]!.trim();
  }
  return fm;
}

async function readAgentMd(hostDir: string, name: SpecialistName): Promise<string> {
  return fs.readFile(
    path.join(REPO_ROOT, "apps", hostDir, "agents", `massa-ai-${name}.md`),
    "utf8",
  );
}

async function readAgentToml(name: SpecialistName): Promise<string> {
  return fs.readFile(
    path.join(REPO_ROOT, "apps/codex-plugin/agents", `massa-ai-${name}.toml`),
    "utf8",
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("subagent parity — drift gate (CLA-07/CDX-08/CRS-06/OPC-08)", () => {
  test("generator --check exits 0 (no drift between charters and shipped files)", () => {
    const res = spawnSync("bun", ["run", GEN_SCRIPT, "--check"], {
      encoding: "utf8",
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("No drift");
  });
});

describe("subagent parity — exact 17 names per host (CLA-09/CRS-07/OPC-09)", () => {
  test("claude: exactly 17 specialist .md files with the registry names", async () => {
    const dir = path.join(REPO_ROOT, "apps/claude-plugin/agents");
    const files = (await fs.readdir(dir)).filter(
      (f) => f.startsWith("massa-ai-") && f.endsWith(".md"),
    );
    expect(files.length).toBe(17);
    const names = files.map((f) => f.replace(/^massa-ai-/, "").replace(/\.md$/, ""));
    expect(names.sort()).toEqual([...SPECIALIST_NAMES].sort());
  });

  test("codex: exactly 17 specialist .toml files with the registry names", async () => {
    const dir = path.join(REPO_ROOT, "apps/codex-plugin/agents");
    const files = (await fs.readdir(dir)).filter((f) => f.startsWith("massa-ai-") && f.endsWith(".toml"));
    expect(files.length).toBe(17);
    const names = files.map((f) => f.replace(/^massa-ai-/, "").replace(/\.toml$/, ""));
    expect(names.sort()).toEqual([...SPECIALIST_NAMES].sort());
  });

  test("cursor: exactly 17 specialist .md files", async () => {
    const dir = path.join(REPO_ROOT, "apps/cursor-plugin/agents");
    const files = (await fs.readdir(dir)).filter(
      (f) => f.startsWith("massa-ai-") && f.endsWith(".md"),
    );
    expect(files.length).toBe(17);
    const names = files.map((f) => f.replace(/^massa-ai-/, "").replace(/\.md$/, ""));
    expect(names.sort()).toEqual([...SPECIALIST_NAMES].sort());
  });

  test("opencode: exactly 17 specialist .md files", async () => {
    const dir = path.join(REPO_ROOT, "apps/opencode-plugin/agents");
    const files = (await fs.readdir(dir)).filter((f) => f.startsWith("massa-ai-") && f.endsWith(".md"));
    expect(files.length).toBe(17);
    const names = files.map((f) => f.replace(/^massa-ai-/, "").replace(/\.md$/, ""));
    expect(names.sort()).toEqual([...SPECIALIST_NAMES].sort());
  });
});

// ── T7: variant bundles, table-driven over (host, supported profile) ────────
//
// Population re-measured in-session (`bun -e` against loadRegistry/hostsSupportedBy,
// see the commit message), not copied from design.md/tasks.md — the standing lesson
// ("subagent numbers need re-measuring") applies to a NEW population exactly as much
// as an edited one.
describe("subagent parity — variant bundles: exact 17 per (host, supported profile) (MPS-01/MPS-12)", () => {
  const HOST_EXT: Record<RegistryHost, string> = {
    claude: "md",
    codex: "toml",
    cursor: "md",
    opencode: "md",
  };
  const HOSTS_LIST: RegistryHost[] = ["claude", "codex", "cursor", "opencode"];

  const cases = HOSTS_LIST.flatMap((host) =>
    profilesSupporting(REGISTRY, host).map((profile) => ({ host, profile })),
  );

  test("re-measured population: 22 (host, profile) pairs (5 general profiles x 3 general hosts + 7 profiles for opencode)", () => {
    expect(cases.length).toBe(22);
    expect(cases.filter((c) => c.host === "claude").length).toBe(5);
    expect(cases.filter((c) => c.host === "codex").length).toBe(5);
    expect(cases.filter((c) => c.host === "cursor").length).toBe(5);
    expect(cases.filter((c) => c.host === "opencode").length).toBe(7);
  });

  for (const { host, profile } of cases) {
    test(`${host}/${profile}: exactly 17 specialist .${HOST_EXT[host]} files with the registry names`, async () => {
      const ext = HOST_EXT[host];
      const dir = path.join(REPO_ROOT, `apps/${host}-plugin/agent-profiles/${profile}`);
      const files = (await fs.readdir(dir)).filter(
        (f) => f.startsWith("massa-ai-") && f.endsWith(`.${ext}`),
      );
      expect(files.length).toBe(17);
      const names = files.map((f) =>
        f.replace(/^massa-ai-/, "").replace(new RegExp(`\\.${ext}$`), ""),
      );
      expect(names.sort()).toEqual([...SPECIALIST_NAMES].sort());
    });
  }

  test("unsupported (host, profile) pairs ship no variant directory at all (MPS-01 AC3)", async () => {
    for (const host of ["claude", "codex", "cursor"] as RegistryHost[]) {
      for (const profile of ["open_models", "local_models"]) {
        const dir = path.join(REPO_ROOT, `apps/${host}-plugin/agent-profiles/${profile}`);
        await expect(fs.access(dir)).rejects.toThrow();
      }
    }
  });

  test("active agents/ byte-equals agent-profiles/<hostDefaults[host]>/ for every host (MPS-01 AC5)", async () => {
    for (const host of HOSTS_LIST) {
      const activeDir = path.join(REPO_ROOT, `apps/${host}-plugin/agents`);
      const defaultProfile = REGISTRY.hostDefaults[host]!;
      const variantDirPath = path.join(
        REPO_ROOT,
        `apps/${host}-plugin/agent-profiles/${defaultProfile}`,
      );
      const [activeFiles, variantFiles] = await Promise.all([
        fs.readdir(activeDir),
        fs.readdir(variantDirPath),
      ]);
      expect(activeFiles.sort()).toEqual(variantFiles.sort());
      for (const f of activeFiles) {
        const [a, b] = await Promise.all([
          fs.readFile(path.join(activeDir, f)),
          fs.readFile(path.join(variantDirPath, f)),
        ]);
        expect(a.equals(b)).toBe(true);
      }
    }
  });
});

describe("subagent parity — name collision (CLA-08/CDX-09/OPC-09)", () => {
  test("no shipped agent name collides with host built-ins", async () => {
    for (const [_host, builtins] of Object.entries(HOST_BUILTINS)) {
      for (const name of SPECIALIST_NAMES) {
        // The shipped name is massa-ai-<name>; the registry name is <name>.
        // Collision check is against the registry name (spec AC: "name fields").
        expect(builtins.has(name)).toBe(false);
        expect(builtins.has(`massa-ai-${name}`)).toBe(false);
      }
    }
  });
});

describe("subagent parity — Claude model + effort pin (CLA-10)", () => {
  test("each Claude agent matches the registry for its charter tier", async () => {
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("claude-plugin", name));
      const want = expected("claude", name);
      expect(fm.model).toBe(want.model ?? "inherit");
      if (want.effort === null) expect(fm.effort).toBeUndefined();
      else expect(fm.effort).toBe(want.effort);
    }
  });

  test("effort is a value Claude documents", async () => {
    // Enum imported, not restated — a second copy could disagree with the resolver.
    const legal = new Set(HOST_EFFORT_ENUM.claude!);
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("claude-plugin", name));
      if (fm.effort !== undefined) expect(legal.has(fm.effort)).toBe(true);
    }
  });
});

describe("subagent parity — Claude permission boundary (CLA-02/CLA-03)", () => {
  test("read-only agents lack Write/Edit; write agents include them", async () => {
    for (const name of SPECIALIST_NAMES) {
      const raw = await readAgentMd("claude-plugin", name);
      const fm = parseMdFrontmatter(raw);
      const tools = fm.tools ?? "";
      if (WRITE_AGENTS.has(name)) {
        expect(tools).toContain("Write");
        expect(tools).toContain("Edit");
      } else {
        expect(tools).not.toContain("Write");
        expect(tools).not.toContain("Edit");
      }
    }
  });

  test("no Claude agent sets hooks/mcpServers/permissionMode (CLA-04)", async () => {
    for (const name of SPECIALIST_NAMES) {
      const raw = await readAgentMd("claude-plugin", name);
      const fm = parseMdFrontmatter(raw);
      expect(fm.hooks).toBeUndefined();
      expect(fm.mcpServers).toBeUndefined();
      expect(fm.permissionMode).toBeUndefined();
    }
  });
});

describe("subagent parity — Codex model + effort pin (CDX-10)", () => {
  test("each Codex TOML matches the registry for its charter tier", async () => {
    for (const name of SPECIALIST_NAMES) {
      const parsed = toml.parse(await readAgentToml(name)) as Record<string, unknown>;
      const want = expected("codex", name);
      if (want.model === null) expect(parsed.model).toBeUndefined();
      else expect(parsed.model).toBe(want.model);
      if (want.effort === null) expect(parsed.model_reasoning_effort).toBeUndefined();
      else expect(parsed.model_reasoning_effort).toBe(want.effort);
    }
  });

  test("effort is a value Codex documents — note it has no 'max'", async () => {
    const legal = new Set(HOST_EFFORT_ENUM.codex!);
    for (const name of SPECIALIST_NAMES) {
      const parsed = toml.parse(await readAgentToml(name)) as Record<string, unknown>;
      const effort = parsed.model_reasoning_effort as string | undefined;
      if (effort !== undefined) {
        expect(legal.has(effort)).toBe(true);
        // Codex genuinely has no "max" level, unlike Claude — the asymmetry that makes
        // a single shared effort enum wrong.
        expect(HOST_EFFORT_ENUM.codex).not.toContain("max");
      }
    }
  });
});

describe("subagent parity — Codex permission boundary (CDX-02/CDX-03)", () => {
  test("read-only agents have sandbox_mode = read-only; write agents = workspace-write", async () => {
    for (const name of SPECIALIST_NAMES) {
      const raw = await readAgentToml(name);
      const parsed = toml.parse(raw) as Record<string, unknown>;
      const sandbox = parsed.sandbox_mode;
      if (WRITE_AGENTS.has(name)) {
        expect(sandbox).toBe("workspace-write");
      } else {
        expect(sandbox).toBe("read-only");
      }
    }
  });
});

describe("subagent parity — Codex TOML round-trip + owned marker (CDX-07)", () => {
  test("each Codex TOML parses without error + first line is # massa-ai-owned", async () => {
    for (const name of SPECIALIST_NAMES) {
      const raw = await readAgentToml(name);
      // First line is the ownership marker
      const firstLine = raw.split(/\r?\n/)[0] ?? "";
      expect(firstLine).toBe("# massa-ai-owned");
      // Parses cleanly (round-trip)
      const parsed = toml.parse(raw) as Record<string, unknown>;
      expect(parsed.name).toBe(`massa-ai-${name}`);
      expect(typeof parsed.developer_instructions).toBe("string");
      expect((parsed.developer_instructions as string).length).toBeGreaterThan(0);
    }
  });
});

describe("subagent parity — Cursor model + permission (CRS-08, MPR-R9)", () => {
  test("each Cursor agent matches the registry for its charter tier", async () => {
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("cursor-plugin", name));
      const want = expected("cursor", name);
      const wanted =
        want.model === null
          ? "inherit"
          : want.effort === null
            ? want.model
            : `${want.model}[effort=${want.effort}]`;
      expect(fm.model).toBe(wanted);
    }
  });

  test("no Cursor agent carries a key Cursor does not define", async () => {
    // `tools` and `reasoningEffort` shipped here for releases and did nothing.
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("cursor-plugin", name));
      expect(fm.tools).toBeUndefined();
      expect(fm.reasoningEffort).toBeUndefined();
    }
  });

  test("readonly: true on read-only charters, absent on writers", async () => {
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("cursor-plugin", name));
      if (WRITE_AGENTS.has(name)) expect(fm.readonly).toBeUndefined();
      else expect(fm.readonly).toBe("true");
    }
  });

  test("model is never a human-readable display name", async () => {
    // The defect: `model: DeepSeek V4 Pro`. Cursor takes ids; a display name cannot resolve.
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("cursor-plugin", name));
      expect(fm.model).not.toMatch(/[A-Z].*\s/);
    }
  });
});

describe("subagent parity — OpenCode model + effort pin (OPC-10)", () => {
  test("each OpenCode agent matches the registry for its charter tier", async () => {
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("opencode-plugin", name));
      const want = expected("opencode", name);
      if (want.model === null) expect(fm.model).toBeUndefined();
      else expect(fm.model).toBe(want.model);
      if (want.effort === null) expect(fm.reasoningEffort).toBeUndefined();
      else expect(fm.reasoningEffort).toBe(want.effort);
    }
  });

  test("every OpenCode model is a resolvable provider/model-id, never a display name", async () => {
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("opencode-plugin", name));
      if (fm.model !== undefined) expect(fm.model).toMatch(OPENCODE_MODEL_ID);
    }
  });

  test("no OpenCode agent emits `name` — the filename is the agent name", async () => {
    // OpenCode forwards unrecognized keys to the provider as model options, so a stray
    // `name:` was being sent as a bogus option on every invocation.
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("opencode-plugin", name));
      expect(fm.name).toBeUndefined();
    }
  });

  test("the filename stem still yields the intended agent name (D1)", async () => {
    for (const name of SPECIALIST_NAMES) {
      const file = path.join(
        REPO_ROOT,
        "apps/opencode-plugin/agents",
        `massa-ai-${name}.md`,
      );
      expect(path.basename(file, ".md")).toBe(`massa-ai-${name}`);
      await fs.access(file);
    }
  });
});

describe("subagent parity — OpenCode permission + owned marker (OPC-07)", () => {
  test("read-only agents have edit: deny + bash: deny (strict) or bash: ask (planner); write agents allow", async () => {
    for (const name of SPECIALIST_NAMES) {
      const raw = await readAgentMd("opencode-plugin", name);
      const fm = parseMdFrontmatter(raw);
      // `all`, not `subagent`: OpenCode's Tab switcher lists primary/all only,
      // so `subagent` made the 12 specialists unselectable by hand.
      expect(fm.mode).toBe("all");
      // The ownership marker is no longer a frontmatter key — see the dedicated
      // describe below. Frontmatter must NOT carry it, or OpenCode forwards it to the
      // provider as a model option.
      expect(fm.metadata).toBeUndefined();
      const perm = fm.permission ?? "";
      if (WRITE_AGENTS.has(name)) {
        expect(perm).toContain("edit: allow");
        expect(perm).toContain("bash: allow");
      } else if (name === "planner") {
        expect(perm).toContain("edit: deny");
        expect(perm).toContain('bash: { "*": "ask" }');
      } else if (name === "navigator") {
        expect(perm).toContain("edit: deny");
        expect(perm).toContain('bash: { "pwd": "allow", "*": "deny" }');
      } else {
        expect(perm).toContain("edit: deny");
        expect(perm).toContain("bash: deny");
      }
    }
  });
});

// ── MPR-R11: FEATURES.md is factored the same way the policy is ─────────────
//
// This replaces the old DOC-06 check, which asserted the OPPOSITE: that FEATURES.md
// contained the literal model names of all four per-host tables. Those tables are the
// duplication MPR-R1/R11 remove, so the test that pinned them had to invert, not relax.
// What makes this discriminating rather than decorative: it fails both ways — if the doc
// stops matching the charters, AND if any model literal or a second role-keyed table
// reappears anywhere in the file.

/** Split a markdown file into its tables: header cells + data rows of cells. */
function markdownTables(md: string): { header: string[]; rows: string[][] }[] {
  const cells = (line: string) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isDivider = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);

  const out: { header: string[]; rows: string[][] }[] = [];
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!isRow(lines[i]!) || !isRow(lines[i + 1] ?? "") || !isDivider(lines[i + 1]!)) continue;
    const header = cells(lines[i]!);
    const rows: string[][] = [];
    let j = i + 2;
    for (; j < lines.length && isRow(lines[j]!) && !isDivider(lines[j]!); j++) {
      rows.push(cells(lines[j]!));
    }
    out.push({ header, rows });
    i = j - 1;
  }
  return out;
}

/** Backticked tokens inside one table cell, e.g. "`low` `medium`" -> ["low","medium"]. */
function backticked(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
}

describe("subagent parity — FEATURES.md doc-drift (MPR-R11)", () => {
  const FEATURES = readFileSync(path.join(REPO_ROOT, "FEATURES.md"), "utf8");
  const TABLES = markdownTables(FEATURES);

  test("the role -> tier table matches the charters exactly", () => {
    const roleTier = TABLES.filter(
      (t) => t.header[0] === "Agent" && t.header[1] === "Tier",
    );
    expect(roleTier.length).toBe(1);

    const documented = new Map(roleTier[0]!.rows.map((r) => [r[0]!, r[1]!]));
    const charters = new Map(SPECIALIST_NAMES.map((n) => [n as string, tierOf(n)]));
    // Compared as maps: a row order change is not drift, a wrong tier is.
    expect([...documented.entries()].sort()).toEqual([...charters.entries()].sort());
  });

  test("it is the ONLY role-keyed table in the file", () => {
    // Kills the design.md section 6 mutation "reintroduce a per-host rationale column":
    // any second table keyed by agent name — with a model column, a rationale column, or
    // anything else — fails here regardless of what its other columns hold.
    const roleKeyed = TABLES.filter(
      (t) => t.rows.filter((r) => (SPECIALIST_NAMES as readonly string[]).includes(r[0]!)).length >= 8,
    );
    expect(roleKeyed.length).toBe(1);
    expect(roleKeyed[0]!.header).toEqual(["Agent", "Tier"]);
  });

  test("no per-host rationale column survives anywhere in the file", () => {
    // The four deleted columns were headed "Why" (Claude/Codex) and "Charter hint"
    // (Cursor/OpenCode). A rationale that exists once cannot disagree with itself.
    for (const t of TABLES) {
      expect(t.header).not.toContain("Why");
      expect(t.header.some((h) => h.startsWith("Charter hint"))).toBe(false);
    }
  });

  test("no registry model ID appears in FEATURES.md at all", () => {
    // The registry is the only hand-authored place naming a model (MPR-R1). Docs that
    // restate a model value are exactly how the four tables drifted apart.
    const ids = new Set<string>();
    for (const profile of Object.values(REGISTRY.profiles)) {
      for (const tiers of Object.values(profile.hosts)) {
        for (const resolved of Object.values(tiers)) {
          if (resolved.model !== null) ids.add(resolved.model);
        }
      }
    }
    expect(ids.size).toBeGreaterThan(0);
    const leaked = [...ids].filter((id) => FEATURES.includes(id));
    expect(leaked).toEqual([]);
  });

  test("the per-host effort column matches the resolver's enums, not a second copy", () => {
    const hostTable = TABLES.filter(
      (t) => t.header[0] === "Host" && t.header[3] === "Accepted effort values",
    );
    expect(hostTable.length).toBe(1);

    const byLabel: Record<string, RegistryHost> = {
      "Claude Code": "claude",
      Codex: "codex",
      Cursor: "cursor",
      OpenCode: "opencode",
    };
    const seen = new Set<RegistryHost>();
    for (const row of hostTable[0]!.rows) {
      const host = byLabel[row[0]!];
      expect(host).toBeDefined();
      seen.add(host!);
      const documented = backticked(row[3]!);
      const enumeration = HOST_EFFORT_ENUM[host!];
      if (enumeration === null) {
        // OpenCode: documented mechanism, deliberately no value enum. Must say so, and
        // must not smuggle in a made-up list.
        expect(documented).toEqual([]);
        expect(row[3]).toContain("any non-empty string");
      } else {
        expect(documented).toEqual([...enumeration]);
      }
      expect(row[4]).toMatch(/https:\/\//); // every row cites the doc that defines it
    }
    expect([...seen].sort()).toEqual(["claude", "codex", "cursor", "opencode"]);
  });
});
// ── MPR-R9: every emitted key is one the host documents ─────────────────────

describe("subagent parity — per-host frontmatter schema conformance (MPR-R9)", () => {
  test("Claude emits only documented plugin-agent fields", async () => {
    const { keys } = ALLOWED_KEYS.claude!;
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("claude-plugin", name));
      for (const k of Object.keys(fm)) expect(keys.has(k)).toBe(true);
    }
  });

  test("Cursor emits only its five documented fields", async () => {
    const { keys } = ALLOWED_KEYS.cursor!;
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("cursor-plugin", name));
      for (const k of Object.keys(fm)) expect(keys.has(k)).toBe(true);
    }
  });

  test("OpenCode emits only documented keys — no name, no metadata", async () => {
    const { keys } = ALLOWED_KEYS.opencode!;
    for (const name of SPECIALIST_NAMES) {
      const fm = parseMdFrontmatter(await readAgentMd("opencode-plugin", name));
      for (const k of Object.keys(fm)) expect(keys.has(k)).toBe(true);
    }
  });

  test("Codex emits only documented agent-TOML keys", async () => {
    const { keys } = ALLOWED_KEYS.codex!;
    for (const name of SPECIALIST_NAMES) {
      const parsed = toml.parse(await readAgentToml(name)) as Record<string, unknown>;
      for (const k of Object.keys(parsed)) expect(keys.has(k)).toBe(true);
    }
  });

  test("each host's allowed-key list cites the doc that defines it", () => {
    for (const [host, { source }] of Object.entries(ALLOWED_KEYS)) {
      expect(source).toMatch(/^https:\/\//);
      expect(host).toBeTruthy();
    }
  });
});

// ── OpenCode ownership marker relocation (D8/D9) ────────────────────────────

describe("subagent parity — OpenCode ownership marker lives in the body", () => {
  const MARKER = "<!-- massa-ai-owned: true -->";

  test("marker is present in every file, as the first body line", async () => {
    for (const name of SPECIALIST_NAMES) {
      const raw = await readAgentMd("opencode-plugin", name);
      const afterFm = raw.split(/^---\r?\n/m)[2] ?? "";
      expect(afterFm.split(/\r?\n/)[0]).toBe(MARKER);
    }
  });

  test("marker is NOT inside the frontmatter block", async () => {
    for (const name of SPECIALIST_NAMES) {
      const raw = await readAgentMd("opencode-plugin", name);
      const fmBlock = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw)![1]!;
      expect(fmBlock).not.toContain("massa-ai-owned");
    }
  });

  test("the substring config-cli.ts greps is still present, so uninstall stays scoped", async () => {
    // apps/opencode-plugin/src/config-cli.ts uses content.includes("massa-ai-owned: true").
    for (const name of SPECIALIST_NAMES) {
      const raw = await readAgentMd("opencode-plugin", name);
      expect(raw.includes("massa-ai-owned: true")).toBe(true);
    }
  });
});

// ── MPR-R8: frozen baseline regression ──────────────────────────────────────

describe("subagent parity — frozen baseline diff (MPR-R8)", () => {
  // The set of shipped pin changes the spec authorises. Anything else is a regression.
  // Cursor is wholesale: no resolvable Cursor model id exists (spec.md section 7).
  const ALLOWED_MODEL_CHANGES = new Set([
    "claude/navigator",
    "opencode/requirements-analyst",
    "opencode/planner",
    "claude/verification-agent",
    "codex/verification-agent",
    "opencode/verification-agent",
    // ALLWF-03 (T20): 8 read-only specialist charters bumped standard/light -> deep.
    // Cursor excepted wholesale (see the loop above); claude/navigator and
    // opencode/requirements-analyst were already authorised above and stay listed once.
    "claude/audit-specialist",
    "codex/audit-specialist",
    "opencode/audit-specialist",
    "claude/context-curator",
    "codex/context-curator",
    "opencode/context-curator",
    "claude/furps-analyst",
    "codex/furps-analyst",
    "opencode/furps-analyst",
    "claude/investigator",
    "codex/investigator",
    "opencode/investigator",
    "claude/mobile-specialist",
    "codex/mobile-specialist",
    "opencode/mobile-specialist",
    "codex/navigator",
    "opencode/navigator",
    "claude/requirements-analyst",
    "codex/requirements-analyst",
    "claude/reviewer",
    "codex/reviewer",
    "opencode/reviewer",
  ]);

  // The fixture is frozen to the base commit (45daaa1) and must never be regenerated, so it
  // only ever names the 15 specialists that existed there — `judge`/`meta-judge` landed later
  // via a concurrently-merged PR and have no baseline entry. Diff only the names the fixture
  // actually has an opinion about; the two new charters are covered by the registry-derived
  // assertions above instead, which is the correct instrument for a role with no "before".
  const BASELINE_NAMES = Object.keys(BASELINE.agents) as SpecialistName[];

  test("baseline fixture is pinned to a commit, not read from the live tree", () => {
    expect(BASELINE.baseCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(Object.keys(BASELINE.agents).length).toBe(15);
  });

  test("no model changed outside the enumerated set (cursor excepted wholesale)", async () => {
    const unexpected: string[] = [];
    for (const name of BASELINE_NAMES) {
      for (const host of ["claude", "codex", "cursor", "opencode"] as const) {
        const before = BASELINE.agents[name]![host]!;
        const after =
          host === "codex"
            ? (toml.parse(await readAgentToml(name)) as Record<string, unknown>)
            : parseMdFrontmatter(await readAgentMd(`${host}-plugin`, name));
        const afterModel = (after.model as string | undefined) ?? null;
        if (before.model === afterModel) continue;
        if (host === "cursor") continue; // authorised wholesale
        if (ALLOWED_MODEL_CHANGES.has(`${host}/${name}`)) continue;
        unexpected.push(`${host}/${name}: ${before.model} -> ${afterModel}`);
      }
    }
    expect(unexpected).toEqual([]);
  });

  test("Claude and Codex key sets are UNCHANGED from the baseline", async () => {
    for (const name of BASELINE_NAMES) {
      const claudeFm = parseMdFrontmatter(await readAgentMd("claude-plugin", name));
      expect(Object.keys(claudeFm)).toEqual(BASELINE.agents[name]!.claude!.keys);
      const codexKeys = [
        ...(await readAgentToml(name)).matchAll(/^([a-z_]+)\s*=/gm),
      ].map((m) => m[1]);
      expect(codexKeys).toEqual(BASELINE.agents[name]!.codex!.keys);
    }
  });

  test("every enumerated change actually happened — the diff is not empty", async () => {
    // Guards the inverse failure: a fixture test that passes because nothing changed.
    // navigator and requirements-analyst were re-bumped again by ALLWF-03 (T20, both
    // now `deep`), so their expected post-change model is the T20 value, not the
    // earlier SYNC-11-era one.
    const claudeNav = parseMdFrontmatter(await readAgentMd("claude-plugin", "navigator"));
    expect(BASELINE.agents.navigator!.claude!.model).toBe("sonnet");
    expect(claudeNav.model).toBe("opus");

    const ocPlanner = parseMdFrontmatter(await readAgentMd("opencode-plugin", "planner"));
    expect(BASELINE.agents.planner!.opencode!.model).toBe("opencode-go/glm-5.2");
    expect(ocPlanner.model).toBe("opencode-go/minimax-m3");

    const ocReq = parseMdFrontmatter(await readAgentMd("opencode-plugin", "requirements-analyst"));
    expect(BASELINE.agents["requirements-analyst"]!.opencode!.model).toBe(
      "opencode-go/deepseek-v4-pro",
    );
    expect(ocReq.model).toBe("opencode-go/minimax-m3");

    // ALLWF-03 (T20): read-only-specialist tier bump to `deep`, one sanity check per
    // remaining charter (host chosen to exercise a distinct provider each time).
    const claudeAudit = parseMdFrontmatter(await readAgentMd("claude-plugin", "audit-specialist"));
    expect(BASELINE.agents["audit-specialist"]!.claude!.model).toBe("sonnet");
    expect(claudeAudit.model).toBe("opus");

    const codexCtx = toml.parse(await readAgentToml("context-curator")) as Record<
      string,
      unknown
    >;
    expect(BASELINE.agents["context-curator"]!.codex!.model).toBe("gpt-5.4-mini");
    expect(codexCtx.model).toBe("gpt-5.6-sol");

    const ocFurps = parseMdFrontmatter(await readAgentMd("opencode-plugin", "furps-analyst"));
    expect(BASELINE.agents["furps-analyst"]!.opencode!.model).toBe("opencode-go/glm-5.2");
    expect(ocFurps.model).toBe("opencode-go/minimax-m3");

    const claudeInvestigator = parseMdFrontmatter(
      await readAgentMd("claude-plugin", "investigator"),
    );
    expect(BASELINE.agents["investigator"]!.claude!.model).toBe("haiku");
    expect(claudeInvestigator.model).toBe("opus");

    const codexMobile = toml.parse(await readAgentToml("mobile-specialist")) as Record<
      string,
      unknown
    >;
    expect(BASELINE.agents["mobile-specialist"]!.codex!.model).toBe("gpt-5.6-terra");
    expect(codexMobile.model).toBe("gpt-5.6-sol");

    const claudeReviewer = parseMdFrontmatter(await readAgentMd("claude-plugin", "reviewer"));
    expect(BASELINE.agents["reviewer"]!.claude!.model).toBe("sonnet");
    expect(claudeReviewer.model).toBe("opus");
  });
});
