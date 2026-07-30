/**
 * generate-subagent-artifacts.ts — unit tests for the emitter + parser layer.
 *
 * The generator is the single source of truth for the 15 specialist agent files
 * across 4 hosts. We test the pure emitters + YAML/TOML helpers directly, drive
 * the real charter loader against the repo charters, and exercise the drift-gate
 * (runCheck) + diffHost edge cases in-process so the CLI shell isn't the only
 * coverage path.
 */
import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import toml from "toml";
import {
  parseFrontmatter,
  parseSimpleYaml,
  unquoteScalar,
  emitClaude,
  emitCursor,
  emitCodex,
  emitOpenCode,
  escapeTomlTripleQuote,
  tomlQuoted,
  loadCharter,
  loadAllCharters,
  emitAll,
  diffHost,
  runCheck,
  main,
  profilesPerHost,
  OPENCODE_OWNED_MARKER,
  type Charter,
  type Host,
} from "../generate-subagent-artifacts";
import { loadRegistry, PROFILE_ENV_VAR, type Resolved } from "../lib/model-profiles.ts";

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
      "name: massa-ai-builder",
      'description: "Builds things"',
      "mode: subagent",
    ].join("\n"));
    expect(y.name).toBe("massa-ai-builder");
    expect(y.description).toBe("Builds things");
    expect(y.mode).toBe("subagent");
  });

  test("parses a single-level nested mapping (metadata block)", () => {
    const y = parseSimpleYaml([
      "metadata:",
      "  model_tier: standard",
      "  permission: write",
    ].join("\n")) as { metadata: Record<string, unknown> };
    expect(y.metadata.model_tier).toBe("standard");
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
    modelTier: "standard",
    permission: "read-only",
    body: "Do the thing.",
    ...partial,
  };
}

/** A resolved {model, effort} pair, as the registry would hand one to an emitter. */
function resolved(model: string | null, effort: string | null): Resolved {
  return { model, effort };
}

describe("emitClaude", () => {
  test("read-only agent gets Read/Grep/Glob/Bash only, model + effort from the resolver", () => {
    const out = emitClaude(charter({ name: "investigator" }), resolved("haiku", "high"));
    expect(out).toContain("name: massa-ai-investigator");
    expect(out).toContain('"Read","Grep","Glob","Bash"');
    expect(out).not.toContain("Write");
    expect(out).toContain("model: haiku");
    expect(out).toContain("effort: high");
    expect(out.endsWith("Do the thing.\n")).toBe(true);
  });

  test("write agent (builder) gets Write + Edit", () => {
    const out = emitClaude(charter({ name: "builder" }), resolved("sonnet", "high"));
    expect(out).toContain('"Write"');
    expect(out).toContain('"Edit"');
    expect(out).toContain("model: sonnet");
  });

  test("the emitter renders whatever the resolver returns — it holds no model table", () => {
    const out = emitClaude(charter({ name: "investigator" }), resolved("fable", "xhigh"));
    expect(out).toContain("model: fable");
    expect(out).toContain("effort: xhigh");
  });

  test("null model becomes the documented `inherit`; null effort omits the key", () => {
    const out = emitClaude(charter({ name: "investigator" }), resolved(null, null));
    expect(out).toContain("model: inherit");
    expect(out).not.toContain("effort:");
  });
});

describe("emitCursor", () => {
  // Cursor's documented frontmatter is exactly name/description/model/readonly/is_background.
  // https://cursor.com/docs/subagents.md
  test("emits ONLY documented keys — no tools, no reasoningEffort", () => {
    const out = emitCursor(charter({ name: "investigator" }), resolved(null, null));
    expect(out).toContain("name: massa-ai-investigator");
    expect(out).toContain("model: inherit");
    expect(out).not.toContain("tools:");
    expect(out).not.toContain("reasoningEffort");
  });

  test("read-only charter gets readonly: true — Cursor's only permission mechanism", () => {
    const out = emitCursor(charter({ name: "investigator" }), resolved(null, null));
    expect(out).toContain("readonly: true");
  });

  test("write charter omits readonly (false is already the documented default)", () => {
    const out = emitCursor(charter({ name: "builder" }), resolved(null, null));
    expect(out).not.toContain("readonly");
  });

  test("a pinned id carries effort as a bracket parameter, not a separate key", () => {
    const out = emitCursor(charter({ name: "investigator" }), resolved("claude-opus-5", "high"));
    expect(out).toContain("model: claude-opus-5[effort=high]");
    expect(out).not.toContain("reasoningEffort");
  });

  test("a pinned id with no effort emits the bare id", () => {
    const out = emitCursor(charter({ name: "investigator" }), resolved("composer-2", null));
    expect(out).toContain("model: composer-2");
    expect(out).not.toContain("[effort");
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

  test("planner (inspection-capable) -> edit: deny, bash ask", () => {
    const out = emitOpenCode(charter({ name: "planner" }), resolved("opencode-go/minimax-m3", "max"));
    expect(out).toContain("edit: deny");
    expect(out).toContain('bash: { "*": "ask" }');
  });

  test("strict read-only agent -> edit: deny, bash: deny", () => {
    const out = emitOpenCode(charter({ name: "investigator" }), resolved("opencode-go/deepseek-v4-pro", "max"));
    expect(out).toContain("edit: deny");
    expect(out).toContain("bash: deny");
  });

  // OpenCode forwards unrecognized frontmatter keys to the model provider as model
  // options, so `name` and `metadata` were being sent as bogus options on every call.
  // https://opencode.ai/docs/agents/
  test("emits NO name key — the agent name is the filename", () => {
    const out = emitOpenCode(charter({ name: "investigator" }), resolved("p/m", "max"));
    const fm = /^---\n([\s\S]*?)\n---/.exec(out)![1]!;
    expect(fm).not.toMatch(/^name:/m);
  });

  test("emits NO metadata key in frontmatter, but keeps the ownership marker in the body", () => {
    const out = emitOpenCode(charter({ name: "investigator" }), resolved("p/m", "max"));
    const fm = /^---\n([\s\S]*?)\n---/.exec(out)![1]!;
    expect(fm).not.toMatch(/^metadata:/m);
    // config-cli.ts scopes `agents uninstall` on this literal substring.
    expect(out).toContain("massa-ai-owned: true");
    expect(out).toContain(OPENCODE_OWNED_MARKER);
  });

  test("the ownership marker is the FIRST body line, so uninstall scoping survives", () => {
    const out = emitOpenCode(charter({ name: "investigator" }), resolved("p/m", "max"));
    const body = out.split("---\n")[2] ?? "";
    expect(body.split("\n")[0]).toBe(OPENCODE_OWNED_MARKER);
  });

  test("null model/effort omit both keys — OpenCode inherits from the invoking agent", () => {
    const out = emitOpenCode(charter({ name: "investigator" }), resolved(null, null));
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
    const out = emitCodex(charter({ name: "investigator" }), resolved("gpt-5.4-mini", "high"));
    expect(out.split("\n")[0]).toBe("# massa-ai-owned");
    expect(out).toContain('name = "massa-ai-investigator"');
    expect(out).toContain('sandbox_mode = "read-only"');
    expect(out).toContain('model = "gpt-5.4-mini"');
    expect(out).toContain('model_reasoning_effort = "high"');
    expect(out).toContain('developer_instructions = """');
    // round-trips through a real TOML parser
    const parsed = toml.parse(out) as Record<string, unknown>;
    expect(parsed.name).toBe("massa-ai-investigator");
  });

  test("write codex agent (builder) -> sandbox workspace-write", () => {
    const out = emitCodex(charter({ name: "builder" }), resolved("gpt-5.6-terra", "high"));
    expect(out).toContain('sandbox_mode = "workspace-write"');
    expect(out).toContain('model = "gpt-5.6-terra"');
  });

  test("body containing a triple-quote is escaped so the TOML still parses", () => {
    const out = emitCodex(
      charter({ name: "investigator", body: 'code """ here' }),
      resolved("gpt-5.4-mini", "high")
    );
    expect(() => toml.parse(out)).not.toThrow();
  });

  test("null model/effort omit both keys — Codex inherits from the parent session", () => {
    const out = emitCodex(charter({ name: "investigator" }), resolved(null, null));
    expect(out).not.toContain("model =");
    expect(out).not.toContain("model_reasoning_effort");
    // still a valid agent TOML
    expect(() => toml.parse(out)).not.toThrow();
    expect(out).toContain('sandbox_mode = "read-only"');
  });
});

// ── Real charter loading ────────────────────────────────────────────────────

describe("loadCharter / loadAllCharters (repo charters)", () => {
  test("loadCharter reads investigator with description + model_tier", async () => {
    const c = await loadCharter("investigator");
    expect(c.name).toBe("investigator");
    expect(c.description.length).toBeGreaterThan(0);
    expect(c.modelTier).toBe("light");
  });

  test("every repo charter declares a tier the registry recognizes", async () => {
    const all = await loadAllCharters();
    const registry = loadRegistry();
    for (const c of all) {
      expect(registry.tiers).toContain(c.modelTier);
    }
  });

  test("loadCharter throws rather than defaulting when model_tier is absent", async () => {
    // A silent default here would ship a different model to users with nothing to notice.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-charter-"));
    try {
      const raw = await fs.readFile(
        path.join(REPO_ROOT, "skills/agents/investigator/SKILL.md"),
        "utf8"
      );
      const stripped = raw.replace(/^ {2}model_tier:.*$\n/m, "");
      expect(stripped).not.toContain("model_tier");
      const { frontmatter } = parseFrontmatter(stripped);
      const md = frontmatter.metadata as Record<string, unknown>;
      expect(md.model_tier).toBeUndefined();
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("loadAllCharters loads exactly the 15 specialists", async () => {
    const all = await loadAllCharters();
    expect(all.length).toBe(15);
    expect(new Set(all.map((c) => c.name)).size).toBe(15);
  });
});

// ── emitAll + drift gate ────────────────────────────────────────────────────

describe("emitAll + diffHost", () => {
  test("emitAll writes 15 files per host (60 total) into a temp tree", async () => {
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
        expect(files.length).toBe(15);
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
      await fs.writeFile(path.join(generated, "massa-ai-investigator.md"), "mutated\n");
      const diffs = await diffHost(generated, checkedIn, "claude");
      expect(diffs).toContain("M massa-ai-investigator.md");
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
      await fs.rm(path.join(generated, "massa-ai-builder.md"));
      // remove from checked-in (different file) -> "- <rel> (missing in checked-in)"
      await fs.rm(path.join(checkedIn, "massa-ai-planner.md"));
      const diffs = await diffHost(generated, checkedIn, "claude");
      expect(diffs).toContain("+ massa-ai-builder.md (missing in generated)");
      expect(diffs).toContain("- massa-ai-planner.md (missing in checked-in)");
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
});

// ── Profile selection through the generator (MPR-R4) ────────────────────────

describe("generator profile selection", () => {
  const registry = loadRegistry();

  test("with no flag and no env, every host uses its registry default", () => {
    const p = profilesPerHost(registry, { env: {} });
    for (const host of ["claude", "codex", "cursor", "opencode"] as Host[]) {
      expect(p[host]).toBe(registry.hostDefaults[host]);
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
      const a = await fs.readFile(
        path.join(dirsFor("a").claude, "massa-ai-investigator.md"),
        "utf8"
      );
      const b = await fs.readFile(
        path.join(dirsFor("b").claude, "massa-ai-investigator.md"),
        "utf8"
      );
      expect(a).toContain("model: haiku"); // balanced, light tier
      expect(b).toContain("model: sonnet"); // heavy, light tier
      expect(a).not.toBe(b);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
