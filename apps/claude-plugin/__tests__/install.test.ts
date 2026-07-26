/**
 * Claude Code plugin installer integration tests (Phase 4, T16).
 *
 * Verifies the install.sh behavior against the spec acceptance criteria
 * (INS-08, INS-09) and the F5 array-append merge mitigation for Claude Code's
 * nested matcher-group + hooks[] settings.json shape:
 * - user-scope install copies commands to ~/.claude/commands/ + merges hooks
 *   into ~/.claude/settings.json with 5 events
 * - array-append merge preserves pre-existing user matcher-group entries
 * - uninstall removes only owned hooks entries + commands/agents, preserves
 *   user hooks and user top-level keys
 * - idempotent re-run is a no-op
 *
 * Uses spawnSync to run install.sh with an overridden HOME (temp dir),
 * mirroring the apps/codex-plugin/__tests__/install.test.ts convention.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const INSTALL_SH = path.resolve(
  REPO_ROOT,
  "apps/claude-plugin/install.sh",
);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mt-claude-install-"));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function runInstall(
  args: string[],
  env: Record<string, string>,
  cwd?: string,
): RunResult {
  const result = spawnSync("bash", [INSTALL_SH, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    cwd: cwd ?? REPO_ROOT,
    timeout: 30000,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

async function readJson(p: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(p, "utf8"));
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const EXPECTED_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PostToolUse",
  "PreCompact",
  "Stop",
];

describe("claude-plugin install.sh (T16 / INS-08,09 + F5)", () => {
  test("user-scope install copies commands + merges settings.json with 5 events", async () => {
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    // Commands copied to ~/.claude/commands/ (prefixed massa-ai-)
    const commandsDir = path.join(tmp, ".claude/commands");
    const files = await fs.readdir(commandsDir);
    const mtFiles = files.filter((f) => f.startsWith("massa-ai-"));
    expect(mtFiles.length).toBeGreaterThan(0);

    // Generated subagents copied
    expect(
      await pathExists(path.join(tmp, ".claude/agents/massa-ai-navigator.md")),
    ).toBe(true);

    // Hooks merged into settings.json with all 5 events
    const cfg = await readJson(path.join(tmp, ".claude/settings.json"));
    expect(cfg).toHaveProperty("hooks");
    const hooks = cfg.hooks as Record<string, unknown[]>;
    expect(Object.keys(hooks).sort()).toEqual(EXPECTED_EVENTS.sort());

    // Each owned entry has the matcher-group + hooks[] shape
    for (const evt of EXPECTED_EVENTS) {
      const arr = hooks[evt] as Record<string, unknown>[];
      const owned = arr.find((e) => e._massaAiOwned === true);
      expect(owned).toBeDefined();
      expect(owned!.hooks).toBeDefined();
      const inner = (owned!.hooks as Record<string, unknown>[])[0];
      expect(inner.type).toBe("command");
      expect(inner.command as string).toContain("massa-ai-hook.ts");
    }
  });

  test("array-append merge: pre-existing user matcher-group entry survives alongside massa-ai entry", async () => {
    // Pre-create settings.json with a user hook under SessionStart (no marker)
    await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
    const userSettings = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "echo user-hook" }] },
        ],
      },
      someUserKey: true,
    };
    await fs.writeFile(
      path.join(tmp, ".claude/settings.json"),
      JSON.stringify(userSettings),
    );

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const cfg = await readJson(path.join(tmp, ".claude/settings.json"));
    const sessionStart = (cfg.hooks as Record<string, unknown[]>).SessionStart as Record<
      string,
      unknown
    >[];
    expect(sessionStart.length).toBe(2);
    // User matcher-group entry survives
    const userEntry = sessionStart.find(
      (e) =>
        Array.isArray(e.hooks) &&
        ((e.hooks as Record<string, unknown>[])[0]?.command as string) ===
          "echo user-hook",
    );
    expect(userEntry).toBeDefined();
    // massa-ai owned entry appended
    const owned = sessionStart.find((e) => e._massaAiOwned === true);
    expect(owned).toBeDefined();
    // User top-level key preserved
    expect(cfg.someUserKey).toBe(true);
    // All 5 events present (the other 4 were absent → created)
    const hooks = cfg.hooks as Record<string, unknown[]>;
    expect(Object.keys(hooks).sort()).toEqual(EXPECTED_EVENTS.sort());
  });

  test("uninstall removes only owned entries + commands/agents; user hooks survive", async () => {
    await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
    const userSettings = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "echo user-hook" }] },
        ],
      },
      someUserKey: true,
    };
    await fs.writeFile(
      path.join(tmp, ".claude/settings.json"),
      JSON.stringify(userSettings),
    );

    runInstall(["--user"], { HOME: tmp });
    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const cfg = await readJson(path.join(tmp, ".claude/settings.json"));
    const sessionStart = (cfg.hooks as Record<string, unknown[]>).SessionStart as Record<
      string,
      unknown
    >[];
    // massa-ai owned entry gone
    expect(
      sessionStart.find((e) => e._massaAiOwned === true),
    ).toBeUndefined();
    // User matcher-group entry survives
    expect(
      sessionStart.find(
        (e) =>
          Array.isArray(e.hooks) &&
          ((e.hooks as Record<string, unknown>[])[0]?.command as string) ===
            "echo user-hook",
      ),
    ).toBeDefined();
    // User top-level key preserved
    expect(cfg.someUserKey).toBe(true);
    // Owned commands removed
    const commandsDir = path.join(tmp, ".claude/commands");
    if (await pathExists(commandsDir)) {
      const files = await fs.readdir(commandsDir);
      expect(files.filter((f) => f.startsWith("massa-ai-"))).toHaveLength(0);
    }
    // Generated subagents removed on uninstall (massa-ai- prefix is the marker)
    expect(
      await pathExists(path.join(tmp, ".claude/agents/massa-ai-navigator.md")),
    ).toBe(false);
  });

  test("idempotent: running --user twice produces no diff in settings.json", async () => {
    runInstall(["--user"], { HOME: tmp });
    const afterFirst = await fs.readFile(
      path.join(tmp, ".claude/settings.json"),
      "utf8",
    );
    runInstall(["--user"], { HOME: tmp });
    const afterSecond = await fs.readFile(
      path.join(tmp, ".claude/settings.json"),
      "utf8",
    );
    expect(afterSecond).toBe(afterFirst);
  });

  // ── T3: 15 subagent specialists (CLA-01, CLA-02, CLA-05, CLA-06, DOC-01) ──
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
  ];

  test("CLA-01/DOC-01: user-scope install copies 15 subagent specialists + prints summary line", async () => {
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    // 15 specialist agent files at ~/.claude/agents/massa-ai-<name>.md
    for (const name of SPECIALIST_NAMES) {
      expect(
        await pathExists(path.join(tmp, `.claude/agents/massa-ai-${name}.md`)),
      ).toBe(true);
    }

    // Install output mentions the 15 subagent specialists (DOC-01)
    expect(res.stdout).toContain("15 subagent specialists");
  });

  test("CLA-02: read-only agents lack Write/Edit; write agents include them", async () => {
    runInstall(["--user"], { HOME: tmp });
    const readOnlyAgents = SPECIALIST_NAMES.filter(
      (n) => n !== "builder" && n !== "test-engineer" && n !== "documentation-agent",
    );
    const writeAgents = ["builder", "test-engineer", "documentation-agent"];

    for (const name of readOnlyAgents) {
      const content = await fs.readFile(
        path.join(tmp, `.claude/agents/massa-ai-${name}.md`),
        "utf8",
      );
      const toolsLine = content.split("\n").find((l) => l.startsWith("tools:")) ?? "";
      expect(toolsLine).not.toContain("Write");
      expect(toolsLine).not.toContain("Edit");
    }
    for (const name of writeAgents) {
      const content = await fs.readFile(
        path.join(tmp, `.claude/agents/massa-ai-${name}.md`),
        "utf8",
      );
      const toolsLine = content.split("\n").find((l) => l.startsWith("tools:")) ?? "";
      expect(toolsLine).toContain("Write");
      expect(toolsLine).toContain("Edit");
    }
  });

  test("CLA-05: uninstall removes every massa-ai-owned specialist, preserves user agents", async () => {
    runInstall(["--user"], { HOME: tmp });
    // Sanity: all 15 specialists present before uninstall
    for (const name of SPECIALIST_NAMES) {
      expect(
        await pathExists(path.join(tmp, `.claude/agents/massa-ai-${name}.md`)),
      ).toBe(true);
    }
    // A user-owned agent without the massa-ai- prefix must survive uninstall
    const userAgent = path.join(tmp, ".claude/agents/my-own-agent.md");
    await fs.writeFile(userAgent, "---\nname: my-own-agent\n---\n");

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    // Every generated specialist removed — navigator included, it is generated too
    for (const name of SPECIALIST_NAMES) {
      expect(
        await pathExists(path.join(tmp, `.claude/agents/massa-ai-${name}.md`)),
      ).toBe(false);
    }
    expect(await pathExists(userAgent)).toBe(true);
  });

  test("CLA-06: idempotent re-run overwrites specialists with identical content", async () => {
    runInstall(["--user"], { HOME: tmp });
    const readAll = async () => {
      const out: Record<string, string> = {};
      for (const name of SPECIALIST_NAMES) {
        out[name] = await fs.readFile(
          path.join(tmp, `.claude/agents/massa-ai-${name}.md`),
          "utf8",
        );
      }
      return out;
    };
    const afterFirst = await readAll();
    runInstall(["--user"], { HOME: tmp });
    const afterSecond = await readAll();
    for (const name of SPECIALIST_NAMES) {
      expect(afterSecond[name]).toBe(afterFirst[name]);
    }
  });
});

describe("claude-plugin skills bundling (PDO-08, PDO-09 / D3)", () => {
  test("install copies massa-ai + persona-router into ~/.claude/skills as plugin-owned", async () => {
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("harness skills installed");

    for (const name of ["massa-ai", "persona-router"]) {
      const skillMd = path.join(tmp, `.claude/skills/${name}/SKILL.md`);
      expect(await pathExists(skillMd)).toBe(true);
      const lst = await fs.lstat(skillMd);
      expect(lst.isSymbolicLink()).toBe(false);
    }

    const state = await readJson(path.join(tmp, ".config/massa-ai/install-state.json"));
    const platforms = state.platforms as Record<string, { skillsOwner: string }>;
    expect(platforms.claude.skillsOwner).toBe("plugin");
  });

  test("install defers to install-skills.sh when the state file already records a repo-owned install", async () => {
    const stateFile = path.join(tmp, ".config/massa-ai/install-state.json");
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(
      stateFile,
      JSON.stringify(
        {
          version: 2,
          platforms: {
            claude: { root: path.join(tmp, ".claude"), skillsOwner: "repo", skills: ["massa-ai", "persona-router"] },
          },
        },
        null,
        2,
      ),
    );
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("repo-owned");
    expect(await pathExists(path.join(tmp, ".claude/skills/massa-ai"))).toBe(false);
  });

  test("uninstall removes only a plugin-owned skills install and its state record", async () => {
    runInstall(["--user"], { HOME: tmp });
    expect(await pathExists(path.join(tmp, ".claude/skills/massa-ai"))).toBe(true);

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(await pathExists(path.join(tmp, ".claude/skills/massa-ai"))).toBe(false);
    expect(await pathExists(path.join(tmp, ".claude/skills/persona-router"))).toBe(false);

    const stateFile = path.join(tmp, ".config/massa-ai/install-state.json");
    if (await pathExists(stateFile)) {
      const state = await readJson(stateFile);
      const platforms = state.platforms as Record<string, unknown>;
      expect(platforms.claude).toBeUndefined();
    }
  });

  test("uninstall never touches a repo-owned skills install", async () => {
    const skillsDir = path.join(tmp, ".claude/skills/massa-ai");
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(path.join(skillsDir, "SKILL.md"), "repo-owned content");
    const stateFile = path.join(tmp, ".config/massa-ai/install-state.json");
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(
      stateFile,
      JSON.stringify(
        {
          version: 2,
          platforms: {
            claude: { root: path.join(tmp, ".claude"), skillsOwner: "repo", skills: ["massa-ai"] },
          },
        },
        null,
        2,
      ),
    );
    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(
      await fs.readFile(path.join(skillsDir, "SKILL.md"), "utf8"),
    ).toBe("repo-owned content");
    const state = await readJson(stateFile);
    const platforms = state.platforms as Record<string, { skillsOwner: string }>;
    expect(platforms.claude.skillsOwner).toBe("repo");
  });
});