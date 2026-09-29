import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { buildOpenCodeAgentAnnouncement, openCodeAgentDirs } from "../agent-announcement";

const OWNED = "<!-- massa-ai-owned: true -->";
let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-oc-announce-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeAgent(dir: string, name: string, frontmatter: string, marker = OWNED): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${frontmatter}\n---\n${marker}\n# Body\n`);
}

describe("buildOpenCodeAgentAnnouncement", () => {
  test("a task dispatch of an owned agent announces model and reasoningEffort", () => {
    writeAgent(path.join(root, "a"), "judge", "mode: all\nmodel: opencode-go/minimax-m3\nreasoningEffort: max");
    expect(buildOpenCodeAgentAnnouncement("task", { subagent_type: "judge" }, [path.join(root, "a")])).toBe(
      "Agent dispatch: judge — model opencode-go/minimax-m3, effort max",
    );
  });

  test("absent keys announce inherit", () => {
    writeAgent(path.join(root, "a"), "judge", "mode: all");
    expect(buildOpenCodeAgentAnnouncement("task", { subagent_type: "judge" }, [path.join(root, "a")])).toBe(
      "Agent dispatch: judge — model inherit, effort inherit",
    );
  });

  test("a user file shadowing an owned agent silences the announcement", () => {
    writeAgent(path.join(root, "a"), "judge", "model: first", "# not owned");
    writeAgent(path.join(root, "b"), "judge", "model: second");
    expect(
      buildOpenCodeAgentAnnouncement("task", { subagent_type: "judge" }, [path.join(root, "a"), path.join(root, "b")]),
    ).toBeNull();
  });

  test("a missing project file falls through to the user agent", () => {
    writeAgent(path.join(root, "b"), "judge", "model: second");
    expect(
      buildOpenCodeAgentAnnouncement("task", { subagent_type: "judge" }, [path.join(root, "a"), path.join(root, "b")]),
    ).toContain("model second");
  });

  test("other tools, foreign agents and path-shaped names stay silent", () => {
    writeAgent(path.join(root, "a"), "judge", "model: m");
    const dirs = [path.join(root, "a")];
    expect(buildOpenCodeAgentAnnouncement("bash", { subagent_type: "judge" }, dirs)).toBeNull();
    expect(buildOpenCodeAgentAnnouncement("task", { subagent_type: "general" }, dirs)).toBeNull();
    expect(buildOpenCodeAgentAnnouncement("task", { subagent_type: "../a/judge" }, dirs)).toBeNull();
    expect(buildOpenCodeAgentAnnouncement("task", undefined, dirs)).toBeNull();
  });
});

describe("openCodeAgentDirs", () => {
  test("project agents come before the XDG user agents", () => {
    expect(openCodeAgentDirs("/p", { XDG_CONFIG_HOME: "/x" })).toEqual(["/p/.opencode/agents", "/x/opencode/agents"]);
  });

  test("a blank XDG_CONFIG_HOME falls back to ~/.config", () => {
    expect(openCodeAgentDirs("/p", { XDG_CONFIG_HOME: " " })[1]).toBe(path.join(os.homedir(), ".config", "opencode", "agents"));
  });
});
