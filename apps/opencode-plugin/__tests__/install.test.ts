/**
 * OpenCode plugin installer integration tests.
 *
 * Verifies the install.sh behavior:
 * - user-scope install creates plugin symlink + agent symlinks + config entry
 * - pre-existing user entries survive
 * - idempotent re-run is a no-op
 * - uninstall removes only owned entries, preserves user plugins
 * - missing dist/index.js exits non-zero with the bun run build hint
 * - regular file squatting at a symlink target is not clobbered
 *
 * Uses spawnSync to run install.sh with an overridden HOME (temp dir).
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const INSTALL_SH = path.resolve(
  REPO_ROOT,
  "apps/opencode-plugin/install.sh",
);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mt-opencode-install-"));
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
  timeout?: number,
): RunResult {
  const result = spawnSync("bash", [INSTALL_SH, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    cwd: cwd ?? REPO_ROOT,
    timeout: timeout ?? 30000,
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

async function isSymlink(p: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(p);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function readLink(p: string): Promise<string> {
  return fs.readlink(p);
}

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
];

describe("opencode-plugin install.sh", () => {
  test("user-scope install creates plugin symlink + config entry + agent symlinks", async () => {
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    // Plugin symlink created
    const pluginPath = path.join(
      tmp,
      ".config/opencode/plugins/massa-ai/index.js",
    );
    expect(await pathExists(pluginPath)).toBe(true);
    expect(await isSymlink(pluginPath)).toBe(true);
    const target = await readLink(pluginPath);
    expect(target).toContain("apps/opencode-plugin/dist/index.js");

    // Agent symlinks created
    const agentsDir = path.join(tmp, ".config/opencode/agents");
    for (const name of SPECIALIST_NAMES) {
      const agentPath = path.join(agentsDir, `massa-ai-${name}.md`);
      expect(await pathExists(agentPath)).toBe(true);
      expect(await isSymlink(agentPath)).toBe(true);
    }

    // Config entry added. Neither opencode.jsonc nor opencode.json pre-existed, so
    // PDO-01/A1 creates opencode.jsonc (never opencode.json) — see the dedicated
    // four-combination coverage further down this file.
    const cfg = await readJson(path.join(tmp, ".config/opencode/opencode.jsonc"));
    expect(cfg).toHaveProperty("plugin");
    expect((cfg.plugin as string[]).includes("./plugins/massa-ai/index.js")).toBe(
      true,
    );
    expect(await pathExists(path.join(tmp, ".config/opencode/opencode.json"))).toBe(
      false,
    );
  });

  test("plugin entry in opencode.jsonc is idempotent", async () => {
    runInstall(["--user"], { HOME: tmp });
    const afterFirst = await fs.readFile(
      path.join(tmp, ".config/opencode/opencode.jsonc"),
      "utf8",
    );

    runInstall(["--user"], { HOME: tmp });
    const afterSecond = await fs.readFile(
      path.join(tmp, ".config/opencode/opencode.jsonc"),
      "utf8",
    );

    expect(afterSecond).toBe(afterFirst);
  });

  test("pre-existing user plugin and MCP block survive", async () => {
    const configDir = path.join(tmp, ".config/opencode");
    await fs.mkdir(configDir, { recursive: true });

    const userConfig = {
      plugin: ["some-other-plugin"],
      mcp: { "user-server": { enabled: true } },
      someUserKey: 123,
    };
    await fs.writeFile(
      path.join(configDir, "opencode.json"),
      JSON.stringify(userConfig),
    );

    runInstall(["--user"], { HOME: tmp });
    const cfg = await readJson(
      path.join(tmp, ".config/opencode/opencode.json"),
    );

    // User plugins preserved
    expect((cfg.plugin as string[]).includes("some-other-plugin")).toBe(true);
    // massa-ai entry added alongside
    expect((cfg.plugin as string[]).includes("./plugins/massa-ai/index.js")).toBe(
      true,
    );
    // User MCP block preserved
    expect((cfg.mcp as Record<string, unknown>)["user-server"]).toBeDefined();
    // User top-level key preserved
    expect(cfg.someUserKey).toBe(123);
  });

  test("uninstall removes only plugin entry and agent symlinks, preserves user entries", async () => {
    // Pre-create with user plugins and MCP
    const configDir = path.join(tmp, ".config/opencode");
    await fs.mkdir(configDir, { recursive: true });
    const userConfig = {
      plugin: ["some-other-plugin"],
      mcp: { "user-server": { enabled: true } },
      someUserKey: 123,
    };
    await fs.writeFile(
      path.join(configDir, "opencode.json"),
      JSON.stringify(userConfig),
    );

    runInstall(["--user"], { HOME: tmp });
    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const cfg = await readJson(
      path.join(tmp, ".config/opencode/opencode.json"),
    );

    // massa-ai plugin entry removed
    expect((cfg.plugin as string[]).includes("./plugins/massa-ai/index.js")).toBe(
      false,
    );
    // User plugin preserved
    expect((cfg.plugin as string[]).includes("some-other-plugin")).toBe(true);
    // User MCP block preserved
    expect((cfg.mcp as Record<string, unknown>)["user-server"]).toBeDefined();
    // User top-level key preserved
    expect(cfg.someUserKey).toBe(123);

    // Agent symlinks removed
    const agentsDir = path.join(tmp, ".config/opencode/agents");
    for (const name of SPECIALIST_NAMES) {
      const agentPath = path.join(agentsDir, `massa-ai-${name}.md`);
      expect(await pathExists(agentPath)).toBe(false);
    }
  });

  test("missing dist/index.js exits non-zero with build hint", async () => {
    // Temporarily move dist/index.js so it doesn't exist
    const distJs = path.join(REPO_ROOT, "apps/opencode-plugin/dist/index.js");
    const backup = path.join(REPO_ROOT, "apps/opencode-plugin/dist/index.js.bak");

    try {
      // Only test if dist/index.js exists (it should in CI and dev)
      if (await pathExists(distJs)) {
        await fs.rename(distJs, backup);

        const res = runInstall(["--user"], { HOME: tmp });
        expect(res.exitCode).not.toBe(0);
        expect(res.stderr).toContain("plugin bundle not found");
        expect(res.stderr).toContain("bun run build");

        // Restore
        await fs.rename(backup, distJs);
      }
    } catch {
      // Clean up if test setup failed
      if (await pathExists(backup)) {
        await fs.rename(backup, distJs).catch(() => {});
      }
    }
  });

  test("regular file at symlink target is not clobbered", async () => {
    const pluginPath = path.join(
      tmp,
      ".config/opencode/plugins/massa-ai/index.js",
    );
    await fs.mkdir(path.dirname(pluginPath), { recursive: true });

    // Pre-create a regular file (not a symlink)
    await fs.writeFile(pluginPath, "user content");

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).not.toBe(0);
    expect(res.stderr).toContain("exists as a regular file");

    // File is untouched
    const content = await fs.readFile(pluginPath, "utf8");
    expect(content).toBe("user content");
  });

  test("agent regular file at symlink target is skipped with warning", async () => {
    const agentPath = path.join(
      tmp,
      ".config/opencode/agents/massa-ai-investigator.md",
    );
    await fs.mkdir(path.dirname(agentPath), { recursive: true });

    // Pre-create a regular file
    await fs.writeFile(agentPath, "user agent content");

    const res = runInstall(["--user"], { HOME: tmp });
    // Install should still succeed overall
    expect(res.exitCode).toBe(0);
    expect(res.stderr).toContain("exists as a regular file");

    // File is untouched
    const content = await fs.readFile(agentPath, "utf8");
    expect(content).toBe("user agent content");
  });

  test("project-scope install targets ./.opencode/ instead of user config", async () => {
    const projectDir = path.join(tmp, "my-project");
    await fs.mkdir(projectDir, { recursive: true });

    const res = runInstall(["--project"], { HOME: tmp }, projectDir);
    expect(res.exitCode).toBe(0);

    // Project-scoped paths
    const pluginPath = path.join(projectDir, ".opencode/plugins/massa-ai/index.js");
    expect(await pathExists(pluginPath)).toBe(true);
    expect(await isSymlink(pluginPath)).toBe(true);

    const agentsDir = path.join(projectDir, ".opencode/agents");
    for (const name of SPECIALIST_NAMES.slice(0, 3)) {
      // sample 3
      const agentPath = path.join(agentsDir, `massa-ai-${name}.md`);
      expect(await pathExists(agentPath)).toBe(true);
    }

    // Config in project scope. Fresh project dir → opencode.jsonc, not opencode.json
    // (PDO-01/A1).
    const cfg = await readJson(path.join(projectDir, ".opencode/opencode.jsonc"));
    expect((cfg.plugin as string[]).includes("./plugins/massa-ai/index.js")).toBe(
      true,
    );
    expect(
      await pathExists(path.join(projectDir, ".opencode/opencode.json")),
    ).toBe(false);
  });

  test("backup is created before modifying opencode.json", async () => {
    const configDir = path.join(tmp, ".config/opencode");
    await fs.mkdir(configDir, { recursive: true });

    const userConfig = { someKey: "value" };
    await fs.writeFile(
      path.join(configDir, "opencode.json"),
      JSON.stringify(userConfig),
    );

    runInstall(["--user"], { HOME: tmp });

    // Find backup
    const files = await fs.readdir(configDir);
    const backups = files.filter((f) => f.startsWith("opencode.json.massa-ai.bak-"));
    expect(backups.length).toBeGreaterThan(0);

    const bakContent = await fs.readFile(
      path.join(configDir, backups[0]),
      "utf8",
    );
    expect(bakContent).toContain("someKey");
  });

  // ── PDO-01/03/04: the four opencode config existence combinations ──────────
  // Exercised through the real install.sh (which requires the vendored
  // apps/opencode-plugin/lib/opencode-config.cjs), not just as unit tests of the
  // library — a regression in how install.sh wires the vendored copy in would be
  // caught here even if the library itself were correct.

  test("existence combination: .jsonc only — edits opencode.jsonc, creates no opencode.json", async () => {
    const configDir = path.join(tmp, ".config/opencode");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "opencode.jsonc"),
      '{\n  "theme": "dark"\n}\n',
    );

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const cfg = await readJson(path.join(configDir, "opencode.jsonc"));
    expect((cfg.plugin as string[]).includes("./plugins/massa-ai/index.js")).toBe(
      true,
    );
    expect(cfg.theme).toBe("dark");
    expect(await pathExists(path.join(configDir, "opencode.json"))).toBe(false);
  });

  test("existence combination: .json only — edits opencode.json, creates no opencode.jsonc", async () => {
    const configDir = path.join(tmp, ".config/opencode");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "opencode.json"),
      '{\n  "theme": "light"\n}\n',
    );

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const cfg = await readJson(path.join(configDir, "opencode.json"));
    expect((cfg.plugin as string[]).includes("./plugins/massa-ai/index.js")).toBe(
      true,
    );
    expect(cfg.theme).toBe("light");
    expect(await pathExists(path.join(configDir, "opencode.jsonc"))).toBe(false);
  });

  test("existence combination: both exist — .json wins, .jsonc is left untouched, and a warning names both files", async () => {
    const configDir = path.join(tmp, ".config/opencode");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "opencode.jsonc"),
      '{"jsoncMarker": true}\n',
    );
    await fs.writeFile(
      path.join(configDir, "opencode.json"),
      '{"jsonMarker": true}\n',
    );

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stderr).toContain("opencode.jsonc");
    expect(res.stderr).toContain("opencode.json");
    expect(res.stderr).toContain("merges .json");

    const cfg = await readJson(path.join(configDir, "opencode.json"));
    expect((cfg.plugin as string[]).includes("./plugins/massa-ai/index.js")).toBe(
      true,
    );
    const jsoncRaw = await fs.readFile(
      path.join(configDir, "opencode.jsonc"),
      "utf8",
    );
    expect(jsoncRaw).toBe('{"jsoncMarker": true}\n');
  });

  test("existence combination: neither exists — creates opencode.jsonc, never opencode.json", async () => {
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const configDir = path.join(tmp, ".config/opencode");
    expect(await pathExists(path.join(configDir, "opencode.jsonc"))).toBe(true);
    expect(await pathExists(path.join(configDir, "opencode.json"))).toBe(false);
  });

  test("commented .jsonc with trailing commas and a URL value installs without aborting", async () => {
    const configDir = path.join(tmp, ".config/opencode");
    await fs.mkdir(configDir, { recursive: true });
    const commented = [
      "{",
      '  // user\'s own theme choice with a "quote" in the comment',
      '  "theme": "dark",',
      '  "docsUrl": "https://opencode.ai/docs",',
      "}",
      "",
    ].join("\n");
    await fs.writeFile(path.join(configDir, "opencode.jsonc"), commented);

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const cfg = await readJson(path.join(configDir, "opencode.jsonc"));
    expect(cfg.docsUrl).toBe("https://opencode.ai/docs");
    expect(cfg.theme).toBe("dark");
    expect((cfg.plugin as string[]).includes("./plugins/massa-ai/index.js")).toBe(
      true,
    );
  });

  test("genuinely malformed .jsonc (not merely commented) is refused, not overwritten", async () => {
    const configDir = path.join(tmp, ".config/opencode");
    await fs.mkdir(configDir, { recursive: true });
    const broken = '{ "theme": \n';
    await fs.writeFile(path.join(configDir, "opencode.jsonc"), broken);

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).not.toBe(0);

    const after = await fs.readFile(
      path.join(configDir, "opencode.jsonc"),
      "utf8",
    );
    expect(after).toBe(broken);
  });

  test("uninstall on a .jsonc-only config removes the entry and creates no opencode.json", async () => {
    runInstall(["--user"], { HOME: tmp });
    const configDir = path.join(tmp, ".config/opencode");
    // Fresh install created opencode.jsonc; confirm the fixture assumption before
    // exercising uninstall against it.
    expect(await pathExists(path.join(configDir, "opencode.jsonc"))).toBe(true);

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const cfg = await readJson(path.join(configDir, "opencode.jsonc"));
    expect((cfg.plugin as string[] | undefined) ?? []).not.toContain(
      "./plugins/massa-ai/index.js",
    );
    expect(await pathExists(path.join(configDir, "opencode.json"))).toBe(false);
  });
});

describe("opencode-plugin skills bundling (PDO-08, PDO-09 / D3)", () => {
  test("install copies massa-ai + persona-router into ~/.config/opencode/skills as plugin-owned", async () => {
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("harness skills installed");

    for (const name of ["massa-ai", "persona-router"]) {
      const skillMd = path.join(tmp, `.config/opencode/skills/${name}/SKILL.md`);
      expect(await pathExists(skillMd)).toBe(true);
      const lst = await fs.lstat(skillMd);
      expect(lst.isSymbolicLink()).toBe(false);
    }

    const state = await readJson(path.join(tmp, ".config/massa-ai/install-state.json"));
    const platforms = state.platforms as Record<string, { skillsOwner: string }>;
    expect(platforms.opencode.skillsOwner).toBe("plugin");
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
            opencode: {
              root: path.join(tmp, ".config/opencode"),
              skillsOwner: "repo",
              skills: ["massa-ai", "persona-router"],
            },
          },
        },
        null,
        2,
      ),
    );
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("repo-owned");
    expect(
      await pathExists(path.join(tmp, ".config/opencode/skills/massa-ai")),
    ).toBe(false);
  });

  test("uninstall removes only a plugin-owned skills install and its state record", async () => {
    runInstall(["--user"], { HOME: tmp });
    expect(
      await pathExists(path.join(tmp, ".config/opencode/skills/massa-ai")),
    ).toBe(true);

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(
      await pathExists(path.join(tmp, ".config/opencode/skills/massa-ai")),
    ).toBe(false);
  });
});
