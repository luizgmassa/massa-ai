/**
 * generate-subagent-artifacts.ts — unit tests for the emitter + parser layer.
 *
 * The generator is the single source of truth for the 17 specialist agent files
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
  type Charter,
  type Host,
} from "../generate-subagent-artifacts";

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
      "  model_hint: GLM-5.2",
      "  permission: write",
    ].join("\n")) as { metadata: Record<string, unknown> };
    expect(y.metadata.model_hint).toBe("GLM-5.2");
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
    modelHint: "GLM-5.2",
    permission: "read-only",
    body: "Do the thing.",
    ...partial,
  };
}

describe("emitClaude", () => {
  test("read-only agent gets Read/Grep/Glob/Bash only + effort: high", () => {
    const out = emitClaude(charter({ name: "investigator" }));
    expect(out).toContain("name: massa-ai-investigator");
    expect(out).toContain('"Read","Grep","Glob","Bash"');
    expect(out).not.toContain("Write");
    expect(out).toContain("model: haiku");
    expect(out).toContain("effort: high");
    expect(out.endsWith("Do the thing.\n")).toBe(true);
  });

  test("write agent (builder) gets Write + Edit", () => {
    const out = emitClaude(charter({ name: "builder" }));
    expect(out).toContain('"Write"');
    expect(out).toContain('"Edit"');
    expect(out).toContain("model: sonnet");
  });
});

describe("emitCursor", () => {
  test("emits model = charter hint verbatim + reasoningEffort: max", () => {
    const out = emitCursor(charter({ name: "investigator", modelHint: "DeepSeek V4 Pro" }));
    expect(out).toContain("model: DeepSeek V4 Pro");
    expect(out).toContain("reasoningEffort: max");
    expect(out).toContain("name: massa-ai-investigator");
  });
});

describe("emitOpenCode", () => {
  test("write agent -> edit: allow, bash: allow + owned marker", () => {
    const out = emitOpenCode(charter({ name: "builder" }));
    expect(out).toContain("edit: allow");
    expect(out).toContain("bash: allow");
    expect(out).toContain("massa-ai-owned: true");
    // `all`, not `subagent` — OpenCode's Tab switcher lists primary/all only.
    expect(out).toContain("mode: all");
    // Model must be a resolvable provider/model-id, not the charter's
    // human-readable hint (which OpenCode silently ignores).
    expect(out).toMatch(/^model: [a-z0-9-]+\/[a-z0-9.-]+$/m);
  });

  test("planner (inspection-capable) -> edit: deny, bash ask", () => {
    const out = emitOpenCode(charter({ name: "planner" }));
    expect(out).toContain("edit: deny");
    expect(out).toContain('bash: { "*": "ask" }');
  });

  test("strict read-only agent -> edit: deny, bash: deny", () => {
    const out = emitOpenCode(charter({ name: "investigator" }));
    expect(out).toContain("edit: deny");
    expect(out).toContain("bash: deny");
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
    const out = emitCodex(charter({ name: "investigator" }));
    expect(out.split("\n")[0]).toBe("# massa-ai-owned");
    expect(out).toContain('name = "massa-ai-investigator"');
    expect(out).toContain('sandbox_mode = "read-only"');
    expect(out).toContain('model_reasoning_effort = "high"');
    expect(out).toContain('developer_instructions = """');
    // round-trips through a real TOML parser
    const parsed = toml.parse(out) as Record<string, unknown>;
    expect(parsed.name).toBe("massa-ai-investigator");
  });

  test("write codex agent (builder) -> sandbox workspace-write", () => {
    const out = emitCodex(charter({ name: "builder" }));
    expect(out).toContain('sandbox_mode = "workspace-write"');
    expect(out).toContain('model = "gpt-5.6-terra"');
  });

  test("body containing a triple-quote is escaped so the TOML still parses", () => {
    const out = emitCodex(charter({ name: "investigator", body: 'code """ here' }));
    expect(() => toml.parse(out)).not.toThrow();
  });
});

// ── Real charter loading ────────────────────────────────────────────────────

describe("loadCharter / loadAllCharters (repo charters)", () => {
  test("loadCharter reads investigator with description + model_hint", async () => {
    const c = await loadCharter("investigator");
    expect(c.name).toBe("investigator");
    expect(c.description.length).toBeGreaterThan(0);
    expect(c.modelHint.length).toBeGreaterThan(0);
  });

  test("loadAllCharters loads exactly the 17 specialists", async () => {
    const all = await loadAllCharters();
    expect(all.length).toBe(17);
    expect(new Set(all.map((c) => c.name)).size).toBe(17);
  });
});

// ── emitAll + drift gate ────────────────────────────────────────────────────

describe("emitAll + diffHost", () => {
  test("emitAll writes 17 files per host (68 total) into a temp tree", async () => {
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
        expect(files.length).toBe(17);
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
