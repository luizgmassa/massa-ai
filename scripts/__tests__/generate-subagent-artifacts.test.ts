/**
 * generate-subagent-artifacts.ts — unit tests for the emitter + parser layer.
 *
 * The generator is the single source of truth for the 7 agent files
 * across 4 hosts. We test the pure emitters + YAML/TOML helpers directly, drive
 * the real charter loader against the repo charters, and exercise the drift-gate
 * (runCheck) + diffHost edge cases in-process so the CLI shell isn't the only
 * coverage path.
 */
import { describe, test, expect, spyOn } from "bun:test";
import { promises as fs } from "fs";
import { spawnSync } from "child_process";
import path from "path";
import os from "os";
import toml from "toml";
import {
  claudeToolPolicyFor,
  emitClaude,
  emitCursor,
  emitCodex,
  emitOpenCode,
  escapeTomlTripleQuote,
  tomlQuoted,
  loadCharter,
  loadAllCharters,
  emitAll,
  emitVariants,
  diffHost,
  runCheck,
  main,
  profilesPerHost,
  stateProfilesFromInstallState,
  readStateProfiles,
  warnStaleAgentOverrides,
  OPENCODE_OWNED_MARKER,
  type Charter,
  type Host,
} from "../generate-subagent-artifacts";
// The frontmatter parser moved out of the generator into the shared module the
// doctor also reads (agent-runtime-drift T02) — one parser, two consumers.
import {
  parseFrontmatter,
  parseSimpleYaml,
  unquoteScalar,
} from "../../packages/shared/src/profile-switch/frontmatter.ts";
import { loadRegistry, PROFILE_ENV_VAR, type Registry, type Resolved } from "../lib/model-profiles.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");

// ── YAML frontmatter parsing ────────────────────────────────────────────────

describe("unquoteScalar", () => {
  test("strips matching surrounding quotes and leaves unquoted values as-is", () => {
    expect(unquoteScalar('"hi"')).toBe("hi");
    expect(unquoteScalar("'hi'")).toBe("hi");
    expect(unquoteScalar("hi")).toBe("hi");
    expect(unquoteScalar('""')).toBe("");
    expect(unquoteScalar("a'b")).toBe("a'b"); // mismatched -> untouched
  });
});

describe("parseSimpleYaml", () => {
  test("parses scalars, skips comments + blank lines, and unquotes", () => {
    const y = parseSimpleYaml([
      "# a comment",
      "",
      "name: builder",
      'description: "Builds things"',
      "mode: subagent",
    ].join("\n"));
    expect(y.name).toBe("builder");
    expect(y.description).toBe("Builds things");
    expect(y.mode).toBe("subagent");
  });

  test("parses a single-level nested mapping (metadata block)", () => {
    const y = parseSimpleYaml([
      "metadata:",
      "  author: massa-ai",
      "  permission: write",
    ].join("\n")) as { metadata: Record<string, unknown> };
    expect(y.metadata.author).toBe("massa-ai");
    expect(y.metadata.permission).toBe("write");
  });
});

describe("parseFrontmatter", () => {
  test("splits frontmatter + body and strips the leading blank line", () => {
    const raw = "---\nname: x\ndescription: y\n---\n\nbody line one\nbody line two";
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.name).toBe("x");
    expect(body.startsWith("body line one")).toBe(true);
  });

  test("throws when the frontmatter block is missing", () => {
    expect(() => parseFrontmatter("no frontmatter here")).toThrow(/frontmatter/);
  });
});

// ── Per-host emitters ───────────────────────────────────────────────────────

function charter(partial: Partial<Charter> & { name: Charter["name"] }): Charter {
  return {
    description: "A charter",
    permission: "read-only",
    body: "Do the thing.",
    ...partial,
  };
}

/** A resolved {model, effort} pair, as the registry would hand one to an emitter. */
function resolved(model: string | null, effort: string | null): Resolved {
  return { model, effort };
}

// S1 (design.md Verification Design table): claudeToolPolicyFor returns the right kind
// per class. Mutation-proved against "flip the WRITE_AGENTS branch to return denylist" —
// see the T1 commit message for the observed-RED record.
describe("claudeToolPolicyFor (STI-01/STI-02)", () => {
  // agent-roster-consolidation A9 retired the navigator allowlist: code-explorer, which
  // absorbed navigator, is read-only through the same denylist as every other reader.
  test("code-explorer (the former allowlisted navigator role) returns the read-only denylist", () => {
    expect(claudeToolPolicyFor("code-explorer")).toEqual({
      kind: "denylist",
      disallowed: ["Write", "Edit", "NotebookEdit"],
    });
  });

  test("every WRITE_AGENTS member returns inherit", () => {
    for (const name of ["builder", "designer", "judge", "test-engineer"] as const) {
      expect(claudeToolPolicyFor(name)).toEqual({ kind: "inherit" });
    }
  });

  test("a charter outside WRITE_AGENTS (code-reviewer) returns the read-only denylist", () => {
    expect(claudeToolPolicyFor("code-reviewer")).toEqual({
      kind: "denylist",
      disallowed: ["Write", "Edit", "NotebookEdit"],
    });
  });

  // STI-01.6: claudeToolPolicyFor is keyed on SpecialistName / WRITE_AGENTS membership,
  // never on Charter.permission (design.md Tech Decisions "Gate on WRITE_AGENTS, not
  // Charter.permission") — so a charter whose frontmatter declares an unrecognized
  // permission value still resolves to the denylist, exactly like an ordinary read-only
  // charter, as long as its name is outside WRITE_AGENTS. loadCharter already coerces any
  // unrecognized metadata.permission to "read-only" (existing, unchanged behavior); this
  // test proves the coercion and the tool policy agree end-to-end rather than trusting two
  // separate reads of the same fact.
  test("a charter with an unrecognized metadata.permission value coerces to read-only, and its tool policy is still the denylist", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-charter-"));
    try {
      const raw = await fs.readFile(
        path.join(REPO_ROOT, "skills/agents/code-explorer/SKILL.md"),
        "utf8"
      );
      const mutated = raw.replace(/^ {2}permission:.*$/m, "  permission: some-unrecognized-value");
      expect(mutated).not.toBe(raw); // the harness itself must actually mutate the fixture
      await fs.mkdir(path.join(tmp, "code-explorer"), { recursive: true });
      await fs.writeFile(path.join(tmp, "code-explorer", "SKILL.md"), mutated);
      const c = await loadCharter("code-explorer", tmp);
      expect(c.permission).toBe("read-only"); // loadCharter's existing fail-safe coercion
      expect(claudeToolPolicyFor(c.name)).toEqual({
        kind: "denylist",
        disallowed: ["Write", "Edit", "NotebookEdit"],
      });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

// S2 (design.md Verification Design table): emitClaude output per class, including key
// order. Mutation-proved against "re-add tools: to the denylist branch" — see the T1
// commit message for the observed-RED record.
describe("emitClaude", () => {
  /** The frontmatter key names in the order they appear, ignoring the --- fences. */
  function keyOrder(out: string): string[] {
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(out)![1]!;
    return fm
      .split("\n")
      .map((l) => /^([A-Za-z]+):/.exec(l)?.[1])
      .filter((k): k is string => Boolean(k));
  }

  test("read-only agent (code-explorer, no override) gets the denylist, never an allowlist", () => {
    const out = emitClaude(charter({ name: "code-explorer" }), resolved("haiku", "high"));
    expect(out).toContain("name: code-explorer");
    expect(out).toContain("disallowedTools: Write, Edit, NotebookEdit");
    expect(out).not.toContain("tools:");
    expect(out).toContain("model: haiku");
    expect(out).toContain("effort: high");
    expect(out.endsWith("Do the thing.\n")).toBe(true);
  });

  test("write agent (builder) gets neither tools: nor disallowedTools:", () => {
    const out = emitClaude(charter({ name: "builder" }), resolved("sonnet", "high"));
    expect(out).not.toContain("tools:");
    expect(out).not.toContain("disallowedTools:");
    expect(out).toContain("model: sonnet");
  });

  test("no agent emits a tools: allowlist — the navigator exception is retired (A9)", () => {
    for (const name of ["builder", "code-explorer", "code-reviewer", "designer", "judge", "product-manager", "test-engineer"] as const) {
      expect(emitClaude(charter({ name }), resolved("opus", "high"))).not.toMatch(/^tools:/m);
    }
  });

  test("key order is name, description, <gate>, model, effort for both classes", () => {
    expect(keyOrder(emitClaude(charter({ name: "code-explorer" }), resolved("haiku", "high")))).toEqual([
      "name", "description", "disallowedTools", "model", "effort",
    ]);
    expect(keyOrder(emitClaude(charter({ name: "builder" }), resolved("sonnet", "high")))).toEqual([
      "name", "description", "model", "effort",
    ]);
  });

  test("the emitter renders whatever the resolver returns — it holds no model table", () => {
    const out = emitClaude(charter({ name: "code-explorer" }), resolved("fable", "xhigh"));
    expect(out).toContain("model: fable");
    expect(out).toContain("effort: xhigh");
  });

  test("null model becomes the documented `inherit`; null effort omits the key", () => {
    const out = emitClaude(charter({ name: "code-explorer" }), resolved(null, null));
    expect(out).toContain("model: inherit");
    expect(out).not.toContain("effort:");
  });

  test("the ownership marker is the FIRST body line, outside the frontmatter", () => {
    const out = emitClaude(charter({ name: "code-explorer" }), resolved("haiku", "high"));
    const [, fm, body] = out.split("---\n");
    expect(fm).not.toContain("massa-ai-owned");
    expect(body!.split("\n")[0]).toBe(OWNED_MARKER_MD);
  });
});

describe("emitCursor", () => {
  // Cursor's documented frontmatter is exactly name/description/model/readonly/is_background.
  // https://cursor.com/docs/subagents.md
  test("emits ONLY documented keys — no tools, no reasoningEffort", () => {
    const out = emitCursor(charter({ name: "code-explorer" }), resolved(null, null));
    expect(out).toContain("name: code-explorer");
    expect(out).toContain("model: inherit");
    expect(out).not.toContain("tools:");
    expect(out).not.toContain("reasoningEffort");
  });

  test("read-only charter gets readonly: true — Cursor's only permission mechanism", () => {
    const out = emitCursor(charter({ name: "code-explorer" }), resolved(null, null));
    expect(out).toContain("readonly: true");
  });

  test("write charter omits readonly (false is already the documented default)", () => {
    const out = emitCursor(charter({ name: "builder" }), resolved(null, null));
    expect(out).not.toContain("readonly");
  });

  test("a pinned id carries effort as a bracket parameter, not a separate key", () => {
    const out = emitCursor(charter({ name: "code-explorer" }), resolved("claude-opus-5", "high"));
    expect(out).toContain("model: claude-opus-5[effort=high]");
    expect(out).not.toContain("reasoningEffort");
  });

  test("a pinned id with no effort emits the bare id", () => {
    const out = emitCursor(charter({ name: "code-explorer" }), resolved("composer-2", null));
    expect(out).toContain("model: composer-2");
    expect(out).not.toContain("[effort");
  });

  test("the ownership marker is the FIRST body line, never a frontmatter key", () => {
    const out = emitCursor(charter({ name: "code-explorer" }), resolved(null, null));
    const [, fm, body] = out.split("---\n");
    expect(fm).not.toContain("massa-ai-owned");
    expect(body!.split("\n")[0]).toBe(OWNED_MARKER_MD);
  });
});

describe("emitOpenCode", () => {
  test("write agent -> edit: allow, bash: allow", () => {
    const out = emitOpenCode(charter({ name: "builder" }), resolved("opencode-go/glm-5.2", "max"));
    expect(out).toContain("edit: allow");
    expect(out).toContain("bash: allow");
    // `all`, not `subagent` — OpenCode's Tab switcher lists primary/all only.
    expect(out).toContain("mode: all");
    expect(out).toMatch(/^model: [a-z0-9-]+\/[a-z0-9.:-]+$/m);
  });

  test("no read-only agent gets a bash override — the planner/navigator overrides are retired (A9)", () => {
    for (const name of ["code-explorer", "code-reviewer", "product-manager"] as const) {
      const out = emitOpenCode(charter({ name }), resolved("opencode-go/minimax-m3", "max"));
      expect(out).toContain("permission: { edit: deny, bash: deny }");
    }
  });

  test("strict read-only agent -> edit: deny, bash: deny", () => {
    const out = emitOpenCode(charter({ name: "code-explorer" }), resolved("opencode-go/deepseek-v4-pro", "max"));
    expect(out).toContain("edit: deny");
    expect(out).toContain("bash: deny");
  });

  // OpenCode forwards unrecognized frontmatter keys to the model provider as model
  // options, so `name` and `metadata` were being sent as bogus options on every call.
  // https://opencode.ai/docs/agents/
  test("emits NO name key — the agent name is the filename", () => {
    const out = emitOpenCode(charter({ name: "code-explorer" }), resolved("p/m", "max"));
    const fm = /^---\n([\s\S]*?)\n---/.exec(out)![1]!;
    expect(fm).not.toMatch(/^name:/m);
  });

  test("emits NO metadata key in frontmatter, but keeps the ownership marker in the body", () => {
    const out = emitOpenCode(charter({ name: "code-explorer" }), resolved("p/m", "max"));
    const fm = /^---\n([\s\S]*?)\n---/.exec(out)![1]!;
    expect(fm).not.toMatch(/^metadata:/m);
    // config-cli.ts scopes `agents uninstall` on this literal substring.
    expect(out).toContain("massa-ai-owned: true");
    expect(out).toContain(OWNED_MARKER_MD);
  });

  test("the ownership marker is the FIRST body line, so uninstall scoping survives", () => {
    const out = emitOpenCode(charter({ name: "code-explorer" }), resolved("p/m", "max"));
    const body = out.split("---\n")[2] ?? "";
    expect(body.split("\n")[0]).toBe(OWNED_MARKER_MD);
  });

  test("null model/effort omit both keys — OpenCode inherits from the invoking agent", () => {
    const out = emitOpenCode(charter({ name: "code-explorer" }), resolved(null, null));
    const fm = /^---\n([\s\S]*?)\n---/.exec(out)![1]!;
    expect(fm).not.toMatch(/^model:/m);
    expect(fm).not.toMatch(/^reasoningEffort:/m);
    expect(fm).toContain("mode: all");
  });
});

describe("emitCodex + TOML helpers", () => {
  test("escapeTomlTripleQuote escapes every double-quote in a run of three", () => {
    // '"""' -> '\"\"\"' (backslash-quote x3)
    const expected = "a" + [0, 1, 2].map(() => "\\\"").join("") + "b";
    expect(escapeTomlTripleQuote('a"""b')).toBe(expected);
  });

  test("tomlQuoted backslash-escapes backslashes and double quotes", () => {
    expect(tomlQuoted('he said "hi"\\done')).toBe('"he said \\"hi\\"\\\\done"');
  });

  test("read-only codex agent -> sandbox read-only + massa-ai-owned header", () => {
    const out = emitCodex(charter({ name: "code-explorer" }), resolved("gpt-5.4-mini", "high"));
    expect(out.split("\n")[0]).toBe("# massa-ai-owned");
    expect(out).toContain('name = "code-explorer"');
    expect(out).toContain('sandbox_mode = "read-only"');
    expect(out).toContain('model = "gpt-5.4-mini"');
    expect(out).toContain('model_reasoning_effort = "high"');
    expect(out).toContain('developer_instructions = """');
    // round-trips through a real TOML parser
    const parsed = toml.parse(out) as Record<string, unknown>;
    expect(parsed.name).toBe("code-explorer");
  });

  test("write codex agent (builder) -> sandbox workspace-write", () => {
    const out = emitCodex(charter({ name: "builder" }), resolved("gpt-5.6-terra", "high"));
    expect(out).toContain('sandbox_mode = "workspace-write"');
    expect(out).toContain('model = "gpt-5.6-terra"');
  });

  test("body containing a triple-quote is escaped so the TOML still parses", () => {
    const out = emitCodex(
      charter({ name: "code-explorer", body: 'code """ here' }),
      resolved("gpt-5.4-mini", "high")
    );
    expect(() => toml.parse(out)).not.toThrow();
  });

  test("null model/effort omit both keys — Codex inherits from the parent session", () => {
    const out = emitCodex(charter({ name: "code-explorer" }), resolved(null, null));
    expect(out).not.toContain("model =");
    expect(out).not.toContain("model_reasoning_effort");
    // still a valid agent TOML
    expect(() => toml.parse(out)).not.toThrow();
    expect(out).toContain('sandbox_mode = "read-only"');
  });
});

// ── Real charter loading ────────────────────────────────────────────────────

describe("loadCharter / loadAllCharters (repo charters)", () => {
  test("loadCharter reads investigator with description + read-only permission", async () => {
    const c = await loadCharter("investigator");
    expect(c.name).toBe("investigator");
    expect(c.description.length).toBeGreaterThan(0);
    expect(c.permission).toBe("read-only");
  });

  /**
   * Write one charter into a throwaway charters dir and load it with the REAL loader.
   *
   * The previous version of these tests stripped a field from raw text, called
   * `parseFrontmatter` directly, and asserted the field was undefined — it never called
   * `loadCharter` and never asserted a throw, so it stayed green against a loader that
   * silently defaulted the tier. Found by T9's independent validation (gap 2); the guard
   * itself was correct, only its test was decorative.
   */
  async function loadFromTemp(transform: (raw: string) => string): Promise<Charter> {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-charter-"));
    try {
      const raw = await fs.readFile(
        path.join(REPO_ROOT, "skills/agents/code-explorer/SKILL.md"),
        "utf8"
      );
      await fs.mkdir(path.join(tmp, "code-explorer"), { recursive: true });
      await fs.writeFile(path.join(tmp, "code-explorer", "SKILL.md"), transform(raw));
      return await loadCharter("code-explorer", tmp);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }

  test("the temp-charter harness itself round-trips an unmodified charter", async () => {
    // Without this, a broken harness would make every throw-assertion below pass for the
    // wrong reason — a thrown ENOENT is still a thrown error.
    const c = await loadFromTemp((raw) => raw);
    expect(c.name).toBe("investigator");
    expect(c.description.length).toBeGreaterThan(0);
  });

  test("loadCharter throws when the retired model_hint reappears", async () => {
    // A charter must never name a model (D4). `model_hint` was a literal model name Cursor
    // consumed verbatim, free to disagree with the generator's resolution.
    await expect(
      loadFromTemp((raw) => raw.replace(/^ {2}permission:.*$/m, "$&\n  model_hint: Some Model"))
    ).rejects.toThrow(/still declares metadata\.model_hint/);
  });

  test("loadCharter throws on a charter with no description", async () => {
    await expect(
      loadFromTemp((raw) => raw.replace(/^description:.*$\n/m, ""))
    ).rejects.toThrow(/missing description/);
  });

  test("loadAllCharters loads exactly the 7 charters", async () => {
    const all = await loadAllCharters();
    expect(all.length).toBe(7);
    expect(new Set(all.map((c) => c.name)).size).toBe(7);
  });
});

// ── emitAll + drift gate ────────────────────────────────────────────────────

describe("emitAll + diffHost", () => {
  test("emitAll writes 7 files per host (28 total) into a temp tree", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-gen-"));
    try {
      const dirs: Record<Host, string> = {
        claude: path.join(tmp, "claude"),
        codex: path.join(tmp, "codex"),
        cursor: path.join(tmp, "cursor"),
        opencode: path.join(tmp, "opencode"),
      };
      await emitAll(dirs);
      for (const host of ["claude", "codex", "cursor", "opencode"] as Host[]) {
        const ext = host === "codex" ? "toml" : "md";
        const files = (await fs.readdir(dirs[host])).filter((f) => f.endsWith(`.${ext}`));
        expect(files.length).toBe(7);
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("diffHost reports no diffs when generated == checked-in (real drift gate)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-gen-"));
    try {
      const tmpClaude = path.join(tmp, "claude");
      const checkedInClaude = path.join(REPO_ROOT, "apps/claude-plugin/agents");
      await emitAll({ claude: tmpClaude, codex: path.join(tmp, "codex"), cursor: path.join(tmp, "cursor"), opencode: path.join(tmp, "opencode") });
      const diffs = await diffHost(tmpClaude, checkedInClaude, "claude");
      expect(diffs).toEqual([]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("diffHost flags a modified file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-gen-"));
    try {
      // checkedIn dir holds the "expected" set; generated dir is mutated.
      const generated = path.join(tmp, "claude");
      const checkedIn = path.join(tmp, "expected");
      await emitAll({ claude: generated, codex: path.join(tmp, "codex"), cursor: path.join(tmp, "cursor"), opencode: path.join(tmp, "opencode") });
      await fs.mkdir(checkedIn, { recursive: true });
      // copy generated as the baseline expected, then mutate one generated file
      for (const f of await fs.readdir(generated)) {
        await fs.copyFile(path.join(generated, f), path.join(checkedIn, f));
      }
      await fs.writeFile(path.join(generated, "code-explorer.md"), "mutated\n");
      const diffs = await diffHost(generated, checkedIn, "claude");
      expect(diffs).toContain("M code-explorer.md");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("diffHost flags a file missing in generated vs missing in checked-in", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-gen-"));
    try {
      const generated = path.join(tmp, "claude");
      const checkedIn = path.join(tmp, "expected");
      await emitAll({ claude: generated, codex: path.join(tmp, "codex"), cursor: path.join(tmp, "cursor"), opencode: path.join(tmp, "opencode") });
      await fs.mkdir(checkedIn, { recursive: true });
      for (const f of await fs.readdir(generated)) {
        await fs.copyFile(path.join(generated, f), path.join(checkedIn, f));
      }
      // remove from generated -> "+ <rel> (missing in generated)"
      await fs.rm(path.join(generated, "builder.md"));
      // remove from checked-in (different file) -> "- <rel> (missing in checked-in)"
      await fs.rm(path.join(checkedIn, "judge.md"));
      const diffs = await diffHost(generated, checkedIn, "claude");
      expect(diffs).toContain("+ builder.md (missing in generated)");
      expect(diffs).toContain("- judge.md (missing in checked-in)");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("runCheck / main drift gate", () => {
  test("runCheck() reports no drift against the checked-in agent files", async () => {
    const code = await runCheck();
    expect(code).toBe(0);
  });

  test("main(['--check']) exits 0 (parity with the parity-test subprocess gate)", async () => {
    const code = await main(["--check"]);
    expect(code).toBe(0);
  });

  test("readStateProfiles reads the rank-3 profile from an arbitrary install-state.json path", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-state-"));
    const statePath = path.join(dir, "install-state.json");
    await fs.writeFile(
      statePath,
      JSON.stringify({
        version: 2,
        platforms: {
          claude: { root: "/x", skills: [], skillsOwner: "plugin", modelProfile: { profile: "cheap" } },
        },
      }),
    );
    try {
      expect(readStateProfiles(statePath)).toEqual({ claude: "cheap" });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("readStateProfiles degrades to an empty map for a missing/unreadable path", () => {
    expect(readStateProfiles(path.join(os.tmpdir(), "massa-ai-state-does-not-exist.json"))).toEqual({});
  });

});

// ── main()/runCheck behavioral threading of the recorded install-state
// profile (agent-drift followup T1/T1b) ─────────────────────────────────────
//
// The retired test above only checked that `readStateProfiles(` appeared
// before `if (check)` in main()'s source text — a mutant that keeps that call
// but drops its result on the floor (never assigning it into `opts`, or
// dropping `opts` from the `runCheck(opts)` call) reads as source-order-clean
// and stays green. These tests exercise the REAL `main()`/`runCheck()` against
// the real checked-in `apps/claude-plugin/agents/` tree, backing up and
// restoring its 18 files around each run so a mid-run failure or crash never
// leaves the checked-in bundle mutated.
describe("main()/runCheck thread the recorded install-state profile end-to-end (agent-drift T1/T1b)", () => {
  const CLAUDE_AGENTS_DIR = path.join(REPO_ROOT, "apps/claude-plugin/agents");
  const GENERATOR_SCRIPT = path.join(REPO_ROOT, "scripts/generate-subagent-artifacts.ts");

  async function backupDir(dir: string): Promise<Map<string, Buffer>> {
    const backup = new Map<string, Buffer>();
    for (const f of await fs.readdir(dir)) {
      backup.set(f, await fs.readFile(path.join(dir, f)));
    }
    return backup;
  }

  async function restoreDir(dir: string, backup: Map<string, Buffer>): Promise<void> {
    for (const [f, buf] of backup) {
      await fs.writeFile(path.join(dir, f), buf);
    }
  }

  async function writeInstallState(homeDir: string, profile: string): Promise<void> {
    const configDir = path.join(homeDir, ".config", "massa-ai");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "install-state.json"),
      JSON.stringify({
        version: 2,
        platforms: {
          claude: { root: "/x", skills: [], skillsOwner: "plugin", modelProfile: { profile } },
        },
      }),
    );
  }

  /**
   * readStateProfiles()'s default path is built from `homedir()`, and
   * `main()`/`runCheck()` take no injection for it. Bun's `os.homedir()`
   * resolves HOME once at process start and ignores a later in-process
   * reassignment of `process.env.HOME` (measured directly: `bun -e` code that
   * sets `process.env.HOME` then calls `os.homedir()` still returns the real
   * system home; only a HOME set on the process's own env BEFORE it starts is
   * honored). So exercising the real CLI entrypoint's HOME-derived default
   * needs a fresh child process, not an in-process override — `spawnSync`
   * with an explicit `env`, exactly like a real invocation with a different
   * $HOME. `import.meta.main` runs `main(process.argv.slice(2))` for us.
   */
  function runGeneratorInSubprocess(args: string[], homeDir: string): number {
    const res = spawnSync(
      process.execPath,
      [GENERATOR_SCRIPT, ...args],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: homeDir, XDG_CONFIG_HOME: path.join(homeDir, ".config") },
        encoding: "utf8",
      },
    );
    if (res.error) throw res.error;
    return res.status ?? 1;
  }

  test("main() (real run, no --check) re-emits claude's ACTIVE agents for the recorded install-state " +
    "profile, not balanced (T1: main() must not drop readStateProfiles()'s result)", async () => {
    const backup = await backupDir(CLAUDE_AGENTS_DIR);
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-home-"));
    try {
      await writeInstallState(homeDir, "cheap");
      const code = runGeneratorInSubprocess([], homeDir);
      expect(code).toBe(0);

      const out = await fs.readFile(path.join(CLAUDE_AGENTS_DIR, "massa-ai-documentation-agent.md"), "utf8");
      // Compare against an independent "cheap" emission (the same production
      // resolver, a throwaway target dir) instead of a hardcoded model literal.
      const tmpOut = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-gen-"));
      await emitAll(
        { claude: tmpOut, codex: tmpOut, cursor: tmpOut, opencode: tmpOut },
        { profileFlag: "cheap", env: {} },
        ["claude"],
      );
      const expected = await fs.readFile(path.join(tmpOut, "massa-ai-documentation-agent.md"), "utf8");
      expect(out).toBe(expected);
      // And it must actually have moved off the checked-in ("balanced") baseline.
      expect(out).not.toBe(backup.get("massa-ai-documentation-agent.md")!.toString("utf8"));
    } finally {
      await restoreDir(CLAUDE_AGENTS_DIR, backup);
    }
  });

  test("main(['--check']) resolves the SAME recorded profile a real run would: 0 against a " +
    "cheap-flavored checked-in tree, and flags drift once the state is dropped (T1b: runCheck must " +
    "receive readStateProfiles()'s result, not a state-blind default)", async () => {
    const backup = await backupDir(CLAUDE_AGENTS_DIR);
    const homeWithState = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-home-"));
    const homeWithoutState = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-home-"));
    try {
      // Make the checked-in tree itself "cheap"-flavored, mirroring an operator
      // whose machine is switched to "cheap" and who just regenerated.
      const unused = path.join(os.tmpdir(), "massa-ai-unused-host-dir");
      await emitAll(
        { claude: CLAUDE_AGENTS_DIR, codex: unused, cursor: unused, opencode: unused },
        { profileFlag: "cheap", env: {} },
        ["claude"],
      );
      await writeInstallState(homeWithState, "cheap");

      const codeWithState = runGeneratorInSubprocess(["--check"], homeWithState);
      expect(codeWithState).toBe(0); // recorded state matches the cheap checked-in tree

      const codeWithoutState = runGeneratorInSubprocess(["--check"], homeWithoutState); // no install-state.json at all
      expect(codeWithoutState).toBe(1); // default "balanced" now mismatches the cheap tree
    } finally {
      await restoreDir(CLAUDE_AGENTS_DIR, backup);
    }
  });
});

// ── Profile selection through the generator (MPR-R4) ────────────────────────

describe("generator profile selection", () => {
  const registry = loadRegistry();

  test("with no flag and no env, every host falls back to \"balanced\"", () => {
    const p = profilesPerHost(registry, { env: {} });
    for (const host of ["claude", "codex", "cursor", "opencode"] as Host[]) {
      expect(p[host]).toBe("balanced");
    }
  });

  test("--profile overrides every host at once", () => {
    const p = profilesPerHost(registry, { profileFlag: "cheap", env: {} });
    for (const host of ["claude", "codex", "cursor", "opencode"] as Host[]) {
      expect(p[host]).toBe("cheap");
    }
  });

  test("MASSA_AI_MODEL_PROFILE applies when no flag is given", () => {
    const p = profilesPerHost(registry, { env: { [PROFILE_ENV_VAR]: "heavy" } });
    expect(p.claude).toBe("heavy");
  });

  test("install-state's recorded profile outranks the host default (agent-drift followup T1)", () => {
    const state = {
      version: 2,
      platforms: {
        claude: { root: "/x", skills: [], skillsOwner: "plugin", modelProfile: { profile: "cheap" } },
      },
    } as unknown as Parameters<typeof stateProfilesFromInstallState>[0];
    const p = profilesPerHost(registry, { env: {}, stateProfiles: stateProfilesFromInstallState(state) });
    expect(p.claude).toBe("cheap");
  });

  test("stateProfilesFromInstallState projects only hosts with a recorded modelProfile", () => {
    const state = {
      version: 2,
      platforms: {
        claude: { root: "/x", skills: [], skillsOwner: "plugin", modelProfile: { profile: "work" } },
        codex: { root: "/y", skills: [], skillsOwner: "plugin" },
      },
    } as unknown as Parameters<typeof stateProfilesFromInstallState>[0];
    const out = stateProfilesFromInstallState(state);
    expect(out).toEqual({ claude: "work" });
  });

  test("the flag beats the recorded state profile", () => {
    const p = profilesPerHost(registry, {
      profileFlag: "heavy",
      env: {},
      stateProfiles: { claude: "cheap" },
    });
    expect(p.claude).toBe("heavy");
  });

  test("the flag wins over the env var", () => {
    const p = profilesPerHost(registry, {
      profileFlag: "cheap",
      env: { [PROFILE_ENV_VAR]: "heavy" },
    });
    expect(p.claude).toBe("cheap");
  });

  test("an unknown profile throws instead of silently emitting the default", () => {
    expect(() => profilesPerHost(registry, { profileFlag: "chaep", env: {} })).toThrow(
      /unknown profile/
    );
  });

  test("selecting a host-specific profile for an unsupported host throws", () => {
    // open_models supports OpenCode only; claude must not silently inherit.
    expect(() => profilesPerHost(registry, { profileFlag: "open_models", env: {} })).toThrow(
      /does not support host "claude"/
    );
  });

  test("a different profile actually changes the emitted bytes", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-gen-"));
    try {
      const dirsFor = (sub: string): Record<Host, string> => ({
        claude: path.join(tmp, sub, "claude"),
        codex: path.join(tmp, sub, "codex"),
        cursor: path.join(tmp, sub, "cursor"),
        opencode: path.join(tmp, sub, "opencode"),
      });
      await emitAll(dirsFor("a"), { env: {} });
      await emitAll(dirsFor("b"), { profileFlag: "heavy", env: {} });
      // builder is a standard-tier charter: balanced pins sonnet, heavy pins opus.
      const a = await fs.readFile(
        path.join(dirsFor("a").claude, "builder.md"),
        "utf8"
      );
      const b = await fs.readFile(
        path.join(dirsFor("b").claude, "builder.md"),
        "utf8"
      );
      expect(a).toContain("model: sonnet"); // balanced, standard tier
      expect(b).toContain("model: opus"); // heavy, standard tier
      expect(a).not.toBe(b);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── per-agent override resolution + stale-name warn (registry v2, D1) ───────

/** Clone the builtin `balanced` profile with an extra `agents.<agent>` override merged in,
 *  for a registry that otherwise resolves exactly like the shipped one. */
function withAgentOverride(
  builtin: Registry,
  agent: string,
  hostOverrides: Record<string, { model: string | null; effort: string | null }>,
): Registry {
  return {
    ...builtin,
    profiles: {
      ...builtin.profiles,
      balanced: {
        ...builtin.profiles.balanced,
        agents: { ...builtin.profiles.balanced.agents, [agent]: hostOverrides },
      },
    },
  };
}

describe("per-agent override resolution (registry v2, D1)", () => {
  test("profile.agents[agent][host] wins over the profile's host default for that host only — an unmentioned host still resolves the host default", async () => {
    const builtin = loadRegistry();
    // investigator carries no override in the shipped registry, so it resolves the
    // profile's own host default (ALLWF-03: read-only specialists run the strongest
    // model). Override claude to "haiku"; codex is never mentioned and must stay default.
    const registry = withAgentOverride(builtin, "investigator", {
      claude: { model: "haiku", effort: "high" },
    });
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-gen-"));
    try {
      const dirs: Record<Host, string> = {
        claude: path.join(tmp, "claude"),
        codex: path.join(tmp, "codex"),
        cursor: path.join(tmp, "cursor"),
        opencode: path.join(tmp, "opencode"),
      };
      await emitAll(dirs, { registry, env: {} });
      const claudeOut = await fs.readFile(path.join(dirs.claude, "massa-ai-investigator.md"), "utf8");
      const codexOut = await fs.readFile(path.join(dirs.codex, "massa-ai-investigator.toml"), "utf8");
      expect(claudeOut).toContain("model: haiku"); // overridden
      expect(codexOut).toContain('model = "gpt-5.6-sol"'); // balanced host default, unaffected
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("an override changes only that agent's emitted file, not its siblings", async () => {
    const builtin = loadRegistry();
    const registry = withAgentOverride(builtin, "investigator", {
      claude: { model: "haiku", effort: "high" },
    });
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-gen-"));
    try {
      const dirs: Record<Host, string> = {
        claude: path.join(tmp, "claude"),
        codex: path.join(tmp, "codex"),
        cursor: path.join(tmp, "cursor"),
        opencode: path.join(tmp, "opencode"),
      };
      await emitAll(dirs, { registry, env: {} });
      const investigatorOut = await fs.readFile(path.join(dirs.claude, "massa-ai-investigator.md"), "utf8");
      const plannerOut = await fs.readFile(path.join(dirs.claude, "massa-ai-planner.md"), "utf8");
      expect(investigatorOut).toContain("model: haiku");
      expect(plannerOut).toContain("model: opus"); // balanced host default, untouched
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("stale agent-override warn (registry v2)", () => {
  test("a real run's emitAll + emitVariants against the same registry, sharing ONE Set, print the stale-name warn EXACTLY ONCE total — not once per caller", async () => {
    const builtin = loadRegistry();
    const registry = withAgentOverride(builtin, "an-agent-nobody-charters", {
      claude: { model: "haiku", effort: "high" },
    });
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-gen-"));
    try {
      const dirs: Record<Host, string> = {
        claude: path.join(tmp, "agents", "claude"),
        codex: path.join(tmp, "agents", "codex"),
        cursor: path.join(tmp, "agents", "cursor"),
        opencode: path.join(tmp, "agents", "opencode"),
      };
      const pluginRootDirs: Record<Host, string> = {
        claude: path.join(tmp, "variants", "claude-plugin"),
        codex: path.join(tmp, "variants", "codex-plugin"),
        cursor: path.join(tmp, "variants", "cursor-plugin"),
        opencode: path.join(tmp, "variants", "opencode-plugin"),
      };
      // Mirrors main() exactly: ONE Set created once, threaded through both calls.
      const warnedStaleAgents = new Set<string>();
      await emitAll(dirs, { registry, env: {}, warnedStaleAgents });
      await emitVariants(pluginRootDirs, { registry, warnedStaleAgents });

      const staleWarnCalls = warnSpy.mock.calls.filter((args) =>
        String(args[0] ?? "").includes('names unknown agent "an-agent-nobody-charters"'),
      );
      expect(staleWarnCalls.length).toBe(1);
      // The emission itself still succeeded — a stale override must not brick the build.
      const claudeOut = await fs.readdir(dirs.claude);
      expect(claudeOut.length).toBe(7);
    } finally {
      warnSpy.mockRestore();
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("without a shared Set, two independent calls each warn once — the exact bug the shared Set exists to prevent", () => {
    const builtin = loadRegistry();
    const registry = withAgentOverride(builtin, "an-agent-nobody-charters", {
      claude: { model: "haiku", effort: "high" },
    });
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const charters: Charter[] = [charter({ name: "investigator" })];
      warnStaleAgentOverrides(registry, charters, new Set()); // caller A's own Set
      warnStaleAgentOverrides(registry, charters, new Set()); // caller B's own Set — no sharing
      const staleWarnCalls = warnSpy.mock.calls.filter((args) =>
        String(args[0] ?? "").includes('names unknown agent "an-agent-nobody-charters"'),
      );
      expect(staleWarnCalls.length).toBe(2); // the double-print bug, reproduced deliberately
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("a shared Set collapses that same double-print to one", () => {
    const builtin = loadRegistry();
    const registry = withAgentOverride(builtin, "an-agent-nobody-charters", {
      claude: { model: "haiku", effort: "high" },
    });
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const charters: Charter[] = [charter({ name: "code-explorer" })];
      const shared = new Set<string>();
      warnStaleAgentOverrides(registry, charters, shared);
      warnStaleAgentOverrides(registry, charters, shared);
      const staleWarnCalls = warnSpy.mock.calls.filter((args) =>
        String(args[0] ?? "").includes('names unknown agent "an-agent-nobody-charters"'),
      );
      expect(staleWarnCalls.length).toBe(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("the shipped builtin — no stale override — produces ZERO stale-name warn lines, keeping --check output stable", async () => {
    const registry = loadRegistry(); // the real shipped builtin: no agent names outside the charter set
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-gen-"));
    try {
      const dirs: Record<Host, string> = {
        claude: path.join(tmp, "claude"),
        codex: path.join(tmp, "codex"),
        cursor: path.join(tmp, "cursor"),
        opencode: path.join(tmp, "opencode"),
      };
      await emitAll(dirs, { registry, env: {} });
      const staleWarnCalls = warnSpy.mock.calls.filter((args) =>
        String(args[0] ?? "").includes("names unknown agent"),
      );
      expect(staleWarnCalls.length).toBe(0);
    } finally {
      warnSpy.mockRestore();
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("an override naming a real charter never warns", async () => {
    const builtin = loadRegistry();
    const registry = withAgentOverride(builtin, "investigator", {
      claude: { model: "haiku", effort: "high" },
    });
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      // The FULL real charter set — every override the shipped registry already carries
      // (builder, designer, test-engineer, documentation-agent) names a real charter too,
      // so only a singleton fake charter list would make those look stale.
      const charters = await loadAllCharters();
      warnStaleAgentOverrides(registry, charters, new Set());
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
