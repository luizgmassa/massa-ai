import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
  buildClaudeAgentAnnouncement,
  buildCodexAgentAnnouncement,
  main,
  runAgentStart,
  type ClaudeAgentLocations,
} from "../hooks/massa-ai-hook.ts";

const OWNED = "<!-- massa-ai-owned: true -->";

let root: string;
let where: ClaudeAgentLocations;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-agent-start-"));
  where = {
    pluginRoot: path.join(root, "plugin"),
    home: path.join(root, "home"),
    cwd: path.join(root, "project"),
  };
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function claudeAgent(frontmatter: string, marker = OWNED): string {
  return `---\nname: x\n${frontmatter}\n---\n${marker}\n# Body\nmodel: body-line-is-not-frontmatter\n`;
}

const dispatch = (subagentType: string, extra: Record<string, unknown> = {}) => ({
  tool_name: "Agent",
  tool_input: { subagent_type: subagentType, description: "d", prompt: "p", ...extra },
});

describe("Claude agent-start announcement", () => {
  test("a plugin-namespaced massa-ai agent announces the installed model and effort", () => {
    writeText(path.join(where.pluginRoot, "agents", "judge.md"), claudeAgent("model: claude-opus-5-5[1m]\neffort: high"));
    expect(buildClaudeAgentAnnouncement(dispatch("massa-ai:judge"), where, {})).toBe(
      "🤖 [massa-ai] Agent dispatch: judge — model claude-opus-5-5[1m], effort high",
    );
  });

  test("absent model and effort keys announce inherit, never a body line", () => {
    writeText(path.join(where.pluginRoot, "agents", "judge.md"), claudeAgent("description: d"));
    expect(buildClaudeAgentAnnouncement(dispatch("massa-ai:judge"), where, {})).toBe(
      "🤖 [massa-ai] Agent dispatch: judge — model inherit, effort inherit",
    );
  });

  test("a bare name resolves the project agent before the user agent", () => {
    writeText(path.join(where.home, ".claude", "agents", "judge.md"), claudeAgent("model: user-model\neffort: low"));
    expect(buildClaudeAgentAnnouncement(dispatch("judge"), where, {})).toContain("model user-model, effort low");
    writeText(path.join(where.cwd, ".claude", "agents", "judge.md"), claudeAgent("model: project-model\neffort: max"));
    expect(buildClaudeAgentAnnouncement(dispatch("judge"), where, {})).toContain("model project-model, effort max");
  });

  test("a user project file shadowing the owned agent silences the announcement", () => {
    writeText(path.join(where.home, ".claude", "agents", "judge.md"), claudeAgent("model: owned-model"));
    writeText(path.join(where.cwd, ".claude", "agents", "judge.md"), claudeAgent("model: user-model", "# mine"));
    expect(buildClaudeAgentAnnouncement(dispatch("judge"), where, {})).toBeNull();
  });

  test("a bare name never reads the plugin bundle", () => {
    writeText(path.join(where.pluginRoot, "agents", "judge.md"), claudeAgent("model: bundle-model"));
    expect(buildClaudeAgentAnnouncement(dispatch("judge"), where, {})).toBeNull();
  });

  test("an agent file without the ownership marker is not a massa-ai agent", () => {
    writeText(path.join(where.pluginRoot, "agents", "judge.md"), claudeAgent("model: m", "# not owned"));
    expect(buildClaudeAgentAnnouncement(dispatch("massa-ai:judge"), where, {})).toBeNull();
  });

  test("non-Agent tools, foreign agents and path-shaped names stay silent", () => {
    writeText(path.join(where.pluginRoot, "agents", "judge.md"), claudeAgent("model: m"));
    expect(buildClaudeAgentAnnouncement({ ...dispatch("massa-ai:judge"), tool_name: "Bash" }, where, {})).toBeNull();
    expect(buildClaudeAgentAnnouncement(dispatch("Explore"), where, {})).toBeNull();
    expect(buildClaudeAgentAnnouncement(dispatch("massa-ai:../agents/judge"), where, {})).toBeNull();
    expect(buildClaudeAgentAnnouncement({ tool_name: "Agent" }, where, {})).toBeNull();
  });

  test("the legacy Task tool name is announced too", () => {
    writeText(path.join(where.pluginRoot, "agents", "judge.md"), claudeAgent("model: m\neffort: e"));
    expect(buildClaudeAgentAnnouncement({ ...dispatch("massa-ai:judge"), tool_name: "Task" }, where, {})).toContain("judge");
  });

  test("a model on the Agent call is surfaced as a runtime override", () => {
    writeText(path.join(where.pluginRoot, "agents", "judge.md"), claudeAgent("model: m\neffort: e"));
    expect(buildClaudeAgentAnnouncement(dispatch("massa-ai:judge", { model: "sonnet" }), where, {})).toBe(
      "🤖 [massa-ai] Agent dispatch: judge — model m, effort e · runtime model override: sonnet (Agent call)",
    );
  });

  test("CLAUDE_CODE_SUBAGENT_MODEL wins over the Agent call; inherit is not an override", () => {
    writeText(path.join(where.pluginRoot, "agents", "judge.md"), claudeAgent("model: m\neffort: e"));
    const call = dispatch("massa-ai:judge", { model: "sonnet" });
    expect(buildClaudeAgentAnnouncement(call, where, { CLAUDE_CODE_SUBAGENT_MODEL: "haiku" })).toContain(
      "runtime model override: haiku (CLAUDE_CODE_SUBAGENT_MODEL)",
    );
    expect(buildClaudeAgentAnnouncement(call, where, { CLAUDE_CODE_SUBAGENT_MODEL: "inherit" })).toContain(
      "runtime model override: sonnet (Agent call)",
    );
  });

  test("runAgentStart emits one systemMessage object and reads the payload cwd", () => {
    writeText(path.join(root, "elsewhere", ".claude", "agents", "judge.md"), claudeAgent("model: m\neffort: e"));
    const stdin = JSON.stringify({ ...dispatch("judge"), cwd: path.join(root, "elsewhere") });
    expect(JSON.parse(runAgentStart(stdin, where, {})!)).toEqual({
      systemMessage: "🤖 [massa-ai] Agent dispatch: judge — model m, effort e",
    });
  });

  test("a path-shaped bare name never resolves outside the agents directory", () => {
    writeText(path.join(where.cwd, ".claude", "judge.md"), claudeAgent("model: m"));
    expect(buildClaudeAgentAnnouncement(dispatch("../judge"), where, {})).toBeNull();
  });

  test("runAgentStart degrades to null on malformed or non-object stdin", () => {
    expect(runAgentStart("{", where, {})).toBeNull();
    expect(runAgentStart("[]", where, {})).toBeNull();
    expect(runAgentStart("", where, {})).toBeNull();
  });
});

describe("Codex agent-start announcement", () => {
  const codexHome = () => path.join(root, "codex");
  const pluginRoot = () => path.join(codexHome(), "plugins", "massa-ai");
  const agentsDir = () => path.join(codexHome(), "agents");
  const toml = (name: string, body: string, marker = "# massa-ai-owned") =>
    `${marker}\nname = "${name}"\ndescription = "d"\n${body}\n`;

  test("SubagentStart announces the installed TOML model and reasoning effort", () => {
    writeText(path.join(agentsDir(), "judge.toml"), toml("judge", 'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "high"'));
    expect(buildCodexAgentAnnouncement({ agent_type: "judge", model: "gpt-5.6-sol" }, [agentsDir()])).toBe(
      "🤖 [massa-ai] Agent dispatch: judge — model gpt-5.6-sol, effort high",
    );
  });

  test("a runtime model differing from the file is surfaced", () => {
    writeText(path.join(agentsDir(), "judge.toml"), toml("judge", 'model = "gpt-5.6-sol"'));
    expect(buildCodexAgentAnnouncement({ agent_type: "judge", model: "gpt-5.6-terra" }, [agentsDir()])).toBe(
      "🤖 [massa-ai] Agent dispatch: judge — model gpt-5.6-sol, effort inherit · runtime model: gpt-5.6-terra",
    );
  });

  test("unowned files, mismatched names and foreign agent types stay silent", () => {
    writeText(path.join(agentsDir(), "judge.toml"), toml("judge", 'model = "m"', "# user agent"));
    expect(buildCodexAgentAnnouncement({ agent_type: "judge" }, [agentsDir()])).toBeNull();
    writeText(path.join(agentsDir(), "judge.toml"), toml("other", 'model = "m"'));
    expect(buildCodexAgentAnnouncement({ agent_type: "judge" }, [agentsDir()])).toBeNull();
    expect(buildCodexAgentAnnouncement({ agent_type: "default" }, [agentsDir()])).toBeNull();
    expect(buildCodexAgentAnnouncement({ agent_type: "../judge" }, [agentsDir()])).toBeNull();
  });

  test("an inherited model reports the runtime model Codex supplies", () => {
    writeText(path.join(agentsDir(), "judge.toml"), toml("judge", 'model_reasoning_effort = "low"'));
    expect(buildCodexAgentAnnouncement({ agent_type: "judge", model: "gpt-5.6-sol" }, [agentsDir()])).toBe(
      "🤖 [massa-ai] Agent dispatch: judge — model inherit, effort low · runtime model: gpt-5.6-sol",
    );
  });

  test("keys inside developer_instructions never count as the agent's model", () => {
    writeText(
      path.join(agentsDir(), "judge.toml"),
      toml("judge", 'developer_instructions = """\nmodel = "from-body"\n"""'),
    );
    expect(buildCodexAgentAnnouncement({ agent_type: "judge" }, [agentsDir()])).toBe(
      "🤖 [massa-ai] Agent dispatch: judge — model inherit, effort inherit",
    );
  });

  test("a symlinked hook still finds agents through CODEX_HOME", () => {
    const home = path.join(root, "custom-codex");
    writeText(path.join(home, "agents", "judge.toml"), toml("judge", 'model = "m"'));
    const out = runAgentStart(JSON.stringify({ agent_type: "judge" }), where, { CODEX_HOME: home }, "codex");
    expect(JSON.parse(out!).systemMessage).toContain("judge — model m");
  });

  test("runAgentStart codex reads <CODEX_DIR>/agents derived from the installed plugin dir", () => {
    writeText(path.join(agentsDir(), "judge.toml"), toml("judge", 'model = "m"\nmodel_reasoning_effort = "e"'));
    const out = runAgentStart(JSON.stringify({ agent_type: "judge" }), { ...where, pluginRoot: pluginRoot() }, {}, "codex");
    expect(JSON.parse(out!)).toEqual({ systemMessage: "🤖 [massa-ai] Agent dispatch: judge — model m, effort e" });
  });

  test("an unknown host announces nothing, even for a Claude-shaped payload", () => {
    writeText(path.join(where.pluginRoot, "agents", "judge.md"), claudeAgent("model: m"));
    writeText(path.join(agentsDir(), "judge.toml"), toml("judge", 'model = "m"'));
    expect(runAgentStart(JSON.stringify(dispatch("massa-ai:judge")), where, {}, "cursor")).toBeNull();
    expect(runAgentStart(JSON.stringify({ agent_type: "judge" }), { ...where, pluginRoot: pluginRoot() }, {}, "cursor")).toBeNull();
  });

  test("the first agents directory holding the file wins", () => {
    writeText(path.join(root, "first", "judge.toml"), toml("judge", 'model = "first"'));
    writeText(path.join(root, "second", "judge.toml"), toml("judge", 'model = "second"'));
    expect(buildCodexAgentAnnouncement({ agent_type: "judge" }, [path.join(root, "first"), path.join(root, "second")])).toContain(
      "model first",
    );
  });
});

describe("agent-start never posts an observation", () => {
  const originalArgv = process.argv;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    process.argv = originalArgv;
    globalThis.fetch = originalFetch;
  });

  test("main() with agent-start makes zero network calls, whatever the payload", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("{}");
    }) as unknown as typeof fetch;
    process.argv = ["bun", "massa-ai-hook.ts", "agent-start"];
    await main(JSON.stringify({ ...dispatch("Explore"), session_id: "s" }));
    process.argv = ["bun", "massa-ai-hook.ts", "agent-start", "codex"];
    await main(JSON.stringify({ agent_type: "judge", session_id: "s" }));
    expect(calls).toBe(0);
  });
});

describe("agent-start subprocess contract", () => {
  const PLUGIN_DIR = path.resolve(import.meta.dir, "..");
  const HOOK = path.join(PLUGIN_DIR, "hooks", "massa-ai-hook.ts");

  function run(stdin: string, args: string[] = ["agent-start"]) {
    return spawnSync("bun", ["run", HOOK, ...args], {
      input: stdin,
      encoding: "utf8",
      env: { ...process.env, MASSA_AI_API_BASE: "http://127.0.0.1:9", CLAUDE_CODE_SUBAGENT_MODEL: "" },
      timeout: 30_000,
    });
  }

  test("a real bundle agent prints exactly one systemMessage line and exits 0", () => {
    const bundled = fs.readFileSync(path.join(PLUGIN_DIR, "agents", "code-reviewer.md"), "utf8");
    const model = /^model:\s*(.+)$/m.exec(bundled)?.[1]?.trim() ?? "inherit";
    const res = run(JSON.stringify(dispatch("massa-ai:code-reviewer")));
    expect(res.status).toBe(0);
    const lines = res.stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(Object.keys(parsed)).toEqual(["systemMessage"]);
    expect(parsed.systemMessage).toContain(`Agent dispatch: code-reviewer — model ${model}`);
  }, 30_000);

  test("a foreign agent produces no stdout and exits 0", () => {
    const res = run(JSON.stringify(dispatch("Explore")));
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
  }, 30_000);
});
