/**
 * Cursor plugin installer integration tests (Phase 2, T10).
 *
 * Verifies the install.sh behavior against the spec acceptance criteria
 * (CRS-01, CRS-02, CRS-07) and the F5 array-append merge mitigation:
 * - user-scope install creates ~/.cursor/plugins/local/massa-ai/ + merges hooks.json
 * - project-scope install creates ./.cursor/plugins/local/massa-ai/
 * - array-append merge preserves pre-existing user hooks
 * - uninstall removes only owned entries; user hooks survive
 * - idempotent re-run is a no-op
 * - MCP registration delegated to scripts/install-agents.sh (single writer)
 *
 * Uses spawnSync to run install.sh with an overridden HOME (temp dir),
 * mirroring the apps/codex-plugin/__tests__/install.test.ts convention.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs, existsSync } from "fs";
import path from "path";
import os from "os";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const INSTALL_SH = path.resolve(
  REPO_ROOT,
  "apps/cursor-plugin/install.sh",
);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mt-cursor-install-"));
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

// ── T6: Claude-bridge fixture helpers ────────────────────────────────────
// Shapes mirror the live-machine capture in
// .specs/features/plugin-architecture-unification/context.md (2026-08-05) —
// never invented.
interface RegistryOpts {
  /** plugins["massa-ai@massa-ai"] is a non-empty array (default) vs []. */
  listed?: boolean;
  /** enabledPlugins["massa-ai@massa-ai"]: true (default) | false | "absent-key" | "absent-file". */
  enabled?: boolean | "absent-key" | "absent-file";
  /** Write unparsable JSON to installed_plugins.json instead. */
  corrupt?: boolean;
}

async function writeClaudeRegistry(home: string, opts: RegistryOpts = {}) {
  const claudeDir = path.join(home, ".claude");
  await fs.mkdir(path.join(claudeDir, "plugins"), { recursive: true });
  const registryPath = path.join(claudeDir, "plugins", "installed_plugins.json");

  if (opts.corrupt) {
    await fs.writeFile(registryPath, "{ not json");
  } else {
    const listed = opts.listed ?? true;
    const registry = {
      version: 2,
      plugins: {
        "massa-ai@massa-ai": listed
          ? [
              {
                scope: "user",
                installPath:
                  "/Users/x/.claude/plugins/cache/massa-ai/massa-ai/1.28.0",
                version: "1.28.0",
                installedAt: "2026-08-05T21:11:52.743Z",
                lastUpdated: "2026-08-05T21:11:52.743Z",
                gitCommitSha: "96ee1850a984169dad07366790acc4a08cf17825",
              },
            ]
          : [],
      },
    };
    await fs.writeFile(registryPath, JSON.stringify(registry));
  }

  if (opts.enabled === "absent-file") return;
  const settingsPath = path.join(claudeDir, "settings.json");
  if (opts.enabled === "absent-key") {
    await fs.writeFile(settingsPath, JSON.stringify({ someOtherKey: true }));
  } else {
    await fs.writeFile(
      settingsPath,
      JSON.stringify({
        enabledPlugins: { "massa-ai@massa-ai": opts.enabled ?? true },
      }),
    );
  }
}

async function ownedHookCount(hooksJsonPath: string): Promise<number> {
  if (!(await pathExists(hooksJsonPath))) return 0;
  const cfg = await readJson(hooksJsonPath);
  const hooks = (cfg.hooks ?? {}) as Record<string, Record<string, unknown>[]>;
  return Object.values(hooks)
    .flat()
    .filter((e) => (e as Record<string, unknown>)._massaAiOwned === true).length;
}

describe("cursor-plugin install.sh (T10 / CRS-01,02,07 + F5)", () => {
  test("user-scope install creates ~/.cursor/plugins/local/massa-ai/ + merges hooks.json with 7 events", async () => {
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const pluginDir = path.join(tmp, ".cursor/plugins/local/massa-ai");
    expect(await pathExists(path.join(pluginDir, ".cursor-plugin/plugin.json"))).toBe(true);
    // Agents land in the flat dir Cursor discovers, not inside the plugin dir.
    expect(await pathExists(path.join(tmp, ".cursor/agents/massa-ai-navigator.md"))).toBe(true);
    expect(await pathExists(path.join(pluginDir, "agents"))).toBe(false);

    const cfg = await readJson(path.join(tmp, ".cursor/hooks.json"));
    expect(cfg).toHaveProperty("version");
    expect(cfg).toHaveProperty("hooks");
    const hooks = cfg.hooks as Record<string, unknown[]>;
    const expectedEvents = [
      "sessionStart",
      "sessionEnd",
      "beforeSubmitPrompt",
      "preToolUse",
      "postToolUse",
      "preCompact",
      "stop",
    ];
    expect(Object.keys(hooks).sort()).toEqual(expectedEvents.sort());
  });

  test("project-scope install creates ./.cursor/plugins/local/massa-ai/", async () => {
    const res = runInstall(["--project"], { HOME: tmp }, tmp);
    expect(res.exitCode).toBe(0);

    const pluginDir = path.join(tmp, ".cursor/plugins/local/massa-ai");
    expect(await pathExists(path.join(pluginDir, ".cursor-plugin/plugin.json"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".cursor/hooks.json"))).toBe(true);
  });

  test("array-append merge: pre-existing user hook survives alongside massa-ai entry", async () => {
    // Pre-create hooks.json with a user hook under sessionStart (no marker)
    await fs.mkdir(path.join(tmp, ".cursor"), { recursive: true });
    const userHooks = {
      version: 1,
      hooks: {
        sessionStart: [{ command: "user-script" }],
      },
    };
    await fs.writeFile(
      path.join(tmp, ".cursor/hooks.json"),
      JSON.stringify(userHooks),
    );

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const cfg = await readJson(path.join(tmp, ".cursor/hooks.json"));
    const sessionStart = cfg.hooks!.sessionStart as Record<string, unknown>[];
    expect(sessionStart.length).toBe(2);
    // User hook survives
    const userEntry = sessionStart.find(
      (e) => (e.command as string) === "user-script",
    );
    expect(userEntry).toBeDefined();
    // massa-ai entry appended
    const owned = sessionStart.find(
      (e) => e._massaAiOwned === true,
    );
    expect(owned).toBeDefined();
    // Top-level version preserved
    expect(cfg.version).toBe(1);
  });

  test("uninstall removes only owned entries; user hook survives", async () => {
    await fs.mkdir(path.join(tmp, ".cursor"), { recursive: true });
    const userHooks = {
      version: 1,
      hooks: {
        sessionStart: [{ command: "user-script" }],
      },
    };
    await fs.writeFile(
      path.join(tmp, ".cursor/hooks.json"),
      JSON.stringify(userHooks),
    );

    runInstall(["--user"], { HOME: tmp });
    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const cfg = await readJson(path.join(tmp, ".cursor/hooks.json"));
    const sessionStart = cfg.hooks!.sessionStart as Record<string, unknown>[];
    // massa-ai entries gone
    expect(
      sessionStart.find((e) => e._massaAiOwned === true),
    ).toBeUndefined();
    // User hook survives
    expect(
      sessionStart.find((e) => (e.command as string) === "user-script"),
    ).toBeDefined();
    // Plugin dir removed
    expect(
      await pathExists(path.join(tmp, ".cursor/plugins/local/massa-ai")),
    ).toBe(false);
  });

  test("idempotent: running --user twice produces no diff in hooks.json", async () => {
    runInstall(["--user"], { HOME: tmp });
    const afterFirst = await fs.readFile(
      path.join(tmp, ".cursor/hooks.json"),
      "utf8",
    );
    runInstall(["--user"], { HOME: tmp });
    const afterSecond = await fs.readFile(
      path.join(tmp, ".cursor/hooks.json"),
      "utf8",
    );
    expect(afterSecond).toBe(afterFirst);
  });

  test("MCP registration delegated to the single writer", () => {
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("scripts/install-agents.sh");
    expect(res.stdout.toLowerCase()).toContain("mcp");
    // No plugin-local MCP file is written into the installed bundle.
    expect(
      existsSync(path.join(tmp, ".cursor/plugins/local/massa-ai/mcp.json")),
    ).toBe(false);
  });

  // ── T6: 17 subagent specialists bundled into plugin agents/ (CRS-01,04,07 + DOC-01) ─
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
  ];

  test("CRS-01/CRS-04/DOC-01: install copies all 17 specialists into ~/.cursor/agents/ as regular files + prints summary", async () => {
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    // Flat ~/.cursor/agents/ is the only directory Cursor discovers
    // subagents from (CRS-04, corrected); real copies, never symlinks.
    const agentsDir = path.join(tmp, ".cursor/agents");
    for (const name of SPECIALIST_NAMES) {
      const agentPath = path.join(agentsDir, `massa-ai-${name}.md`);
      expect(await pathExists(agentPath)).toBe(true);
      expect((await fs.lstat(agentPath)).isSymbolicLink()).toBe(false);
    }
    // Exactly 17 massa-ai-owned .md files
    const files = (await fs.readdir(agentsDir)).filter(
      (f) => f.startsWith("massa-ai-") && f.endsWith(".md"),
    );
    expect(files.length).toBe(17);
    // Nothing is bundled into the plugin dir anymore
    expect(
      await pathExists(path.join(tmp, ".cursor/plugins/local/massa-ai/agents")),
    ).toBe(false);

    // Install output mentions the 17 subagent specialists (DOC-01)
    expect(res.stdout).toContain("17 subagent specialists");
  });

  test("migration: a pre-fix agents copy inside the plugin dir is removed on install", async () => {
    const staleDir = path.join(tmp, ".cursor/plugins/local/massa-ai/agents");
    await fs.mkdir(staleDir, { recursive: true });
    await fs.writeFile(path.join(staleDir, "massa-ai-navigator.md"), "stale");

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(await pathExists(staleDir)).toBe(false);
    expect(
      await pathExists(path.join(tmp, ".cursor/agents/massa-ai-navigator.md")),
    ).toBe(true);
  });

  test("CRS-05: uninstall removes plugin dir + owned agents; user agents survive", async () => {
    runInstall(["--user"], { HOME: tmp });
    const agentsDir = path.join(tmp, ".cursor/agents");
    expect(await pathExists(path.join(agentsDir, "massa-ai-navigator.md"))).toBe(true);
    // A user-authored agent in the same flat dir must survive uninstall.
    await fs.writeFile(path.join(agentsDir, "my-own-agent.md"), "user agent");

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(
      await pathExists(path.join(tmp, ".cursor/plugins/local/massa-ai")),
    ).toBe(false);
    const remaining = await fs.readdir(agentsDir);
    expect(remaining.filter((f) => f.startsWith("massa-ai-"))).toEqual([]);
    expect(remaining).toContain("my-own-agent.md");
  });
});

describe("cursor-plugin Claude-bridge preference (T6, PAU-08..11)", () => {
  test("bridge detected: no local plugin dir, zero owned hook entries, agents+skills present, installRoute=bridge", async () => {
    await writeClaudeRegistry(tmp);
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    expect(
      await pathExists(path.join(tmp, ".cursor/plugins/local/massa-ai")),
    ).toBe(false);
    expect(await ownedHookCount(path.join(tmp, ".cursor/hooks.json"))).toBe(0);
    expect(
      await pathExists(path.join(tmp, ".cursor/agents/massa-ai-navigator.md")),
    ).toBe(true);
    expect(
      await pathExists(path.join(tmp, ".cursor/skills/massa-ai/SKILL.md")),
    ).toBe(true);

    const state = await readJson(
      path.join(tmp, ".config/massa-ai/install-state.json"),
    );
    const platforms = state.platforms as Record<
      string,
      { installRoute?: string }
    >;
    expect(platforms.cursor.installRoute).toBe("bridge");
  });

  test("no Claude registry: full local install, installRoute=local", async () => {
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    expect(
      await pathExists(
        path.join(tmp, ".cursor/plugins/local/massa-ai/.cursor-plugin/plugin.json"),
      ),
    ).toBe(true);
    expect(
      await ownedHookCount(path.join(tmp, ".cursor/hooks.json")),
    ).toBeGreaterThan(0);

    const state = await readJson(
      path.join(tmp, ".config/massa-ai/install-state.json"),
    );
    const platforms = state.platforms as Record<
      string,
      { installRoute?: string }
    >;
    expect(platforms.cursor.installRoute).toBe("local");
  });

  test("massa-ai listed but enabledPlugins is false: local fallback", async () => {
    await writeClaudeRegistry(tmp, { enabled: false });
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    expect(
      await pathExists(
        path.join(tmp, ".cursor/plugins/local/massa-ai/.cursor-plugin/plugin.json"),
      ),
    ).toBe(true);
    const state = await readJson(
      path.join(tmp, ".config/massa-ai/install-state.json"),
    );
    const platforms = state.platforms as Record<
      string,
      { installRoute?: string }
    >;
    expect(platforms.cursor.installRoute).toBe("local");
  });

  test("absent settings.json / absent enabledPlugins key: treated as enabled → bridge", async () => {
    await writeClaudeRegistry(tmp, { enabled: "absent-file" });
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    const state = await readJson(
      path.join(tmp, ".config/massa-ai/install-state.json"),
    );
    const platforms = state.platforms as Record<
      string,
      { installRoute?: string }
    >;
    expect(platforms.cursor.installRoute).toBe("bridge");
  });

  test("empty massa-ai@massa-ai array in registry: local fallback", async () => {
    await writeClaudeRegistry(tmp, { listed: false });
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    const state = await readJson(
      path.join(tmp, ".config/massa-ai/install-state.json"),
    );
    const platforms = state.platforms as Record<
      string,
      { installRoute?: string }
    >;
    expect(platforms.cursor.installRoute).toBe("local");
  });

  test("corrupt installed_plugins.json: local fallback, not a crash", async () => {
    await writeClaudeRegistry(tmp, { corrupt: true });
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(
      await pathExists(
        path.join(tmp, ".cursor/plugins/local/massa-ai/.cursor-plugin/plugin.json"),
      ),
    ).toBe(true);
    const state = await readJson(
      path.join(tmp, ".config/massa-ai/install-state.json"),
    );
    const platforms = state.platforms as Record<
      string,
      { installRoute?: string }
    >;
    expect(platforms.cursor.installRoute).toBe("local");
  });

  test("pre-existing local install + bridge appears: one run converges (local dir gone, owned hooks stripped)", async () => {
    runInstall(["--user"], { HOME: tmp });
    expect(
      await pathExists(path.join(tmp, ".cursor/plugins/local/massa-ai")),
    ).toBe(true);
    expect(
      await ownedHookCount(path.join(tmp, ".cursor/hooks.json")),
    ).toBeGreaterThan(0);

    await writeClaudeRegistry(tmp);
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    expect(
      await pathExists(path.join(tmp, ".cursor/plugins/local/massa-ai")),
    ).toBe(false);
    expect(await ownedHookCount(path.join(tmp, ".cursor/hooks.json"))).toBe(0);
    expect(
      await pathExists(path.join(tmp, ".cursor/agents/massa-ai-navigator.md")),
    ).toBe(true);

    const state = await readJson(
      path.join(tmp, ".config/massa-ai/install-state.json"),
    );
    const platforms = state.platforms as Record<
      string,
      { installRoute?: string }
    >;
    expect(platforms.cursor.installRoute).toBe("bridge");
  });

  test("project scope keeps the local branch even when a user-scope bridge is present", async () => {
    await writeClaudeRegistry(tmp);
    const res = runInstall(["--project"], { HOME: tmp }, tmp);
    expect(res.exitCode).toBe(0);
    expect(
      await pathExists(
        path.join(tmp, ".cursor/plugins/local/massa-ai/.cursor-plugin/plugin.json"),
      ),
    ).toBe(true);
    const state = await readJson(
      path.join(tmp, ".config/massa-ai/install-state.json"),
    );
    const platforms = state.platforms as Record<
      string,
      { installRoute?: string }
    >;
    expect(platforms.cursor.installRoute).toBe("local");
  });

  test("uninstall after a local install removes plugin dir, owned hooks, and flat agents", async () => {
    runInstall(["--user"], { HOME: tmp });
    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    expect(
      await pathExists(path.join(tmp, ".cursor/plugins/local/massa-ai")),
    ).toBe(false);
    expect(
      await pathExists(path.join(tmp, ".cursor/agents/massa-ai-navigator.md")),
    ).toBe(false);
    expect(await ownedHookCount(path.join(tmp, ".cursor/hooks.json"))).toBe(0);
  });

  test("uninstall after a bridge install removes owned agents (no local dir ever existed)", async () => {
    await writeClaudeRegistry(tmp);
    runInstall(["--user"], { HOME: tmp });
    expect(
      await pathExists(path.join(tmp, ".cursor/agents/massa-ai-navigator.md")),
    ).toBe(true);

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(
      await pathExists(path.join(tmp, ".cursor/plugins/local/massa-ai")),
    ).toBe(false);
    expect(
      await pathExists(path.join(tmp, ".cursor/agents/massa-ai-navigator.md")),
    ).toBe(false);
  });
});

describe("cursor-plugin skills bundling (PDO-08, PDO-09 / D3)", () => {
  test("install copies massa-ai + persona-router into ~/.cursor/skills (not the plugin cache) as plugin-owned", async () => {
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("harness skills installed");

    for (const name of ["massa-ai", "persona-router"]) {
      const skillMd = path.join(tmp, `.cursor/skills/${name}/SKILL.md`);
      expect(await pathExists(skillMd)).toBe(true);
      const lst = await fs.lstat(skillMd);
      expect(lst.isSymbolicLink()).toBe(false);
    }

    const state = await readJson(path.join(tmp, ".config/massa-ai/install-state.json"));
    const platforms = state.platforms as Record<string, { skillsOwner: string }>;
    expect(platforms.cursor.skillsOwner).toBe("plugin");
  });

  test("the existing 6 host-command skills copy is unaffected — no massa-ai/persona-router leak into the plugin cache", async () => {
    runInstall(["--user"], { HOME: tmp });
    const pluginDir = path.join(tmp, ".cursor/plugins/local/massa-ai");
    expect(await pathExists(path.join(pluginDir, "skills/massa-ai"))).toBe(false);
    expect(await pathExists(path.join(pluginDir, "skills/persona-router"))).toBe(false);
    for (const name of ["def", "find", "graph", "index", "map", "status"]) {
      expect(await pathExists(path.join(pluginDir, `skills/${name}/SKILL.md`))).toBe(true);
    }
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
            cursor: { root: path.join(tmp, ".cursor"), skillsOwner: "repo", skills: ["massa-ai", "persona-router"] },
          },
        },
        null,
        2,
      ),
    );
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("repo-owned");
    expect(await pathExists(path.join(tmp, ".cursor/skills/massa-ai"))).toBe(false);
  });

  test("uninstall removes only a plugin-owned skills install and its state record", async () => {
    runInstall(["--user"], { HOME: tmp });
    expect(await pathExists(path.join(tmp, ".cursor/skills/massa-ai"))).toBe(true);

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(await pathExists(path.join(tmp, ".cursor/skills/massa-ai"))).toBe(false);
  });
});

// ── T7: generated-bundle contract (design Component 4 / UGB-05..08) ─────────
describe("cursor-plugin generated-bundle contract (T7, UGB-05..08)", () => {
  function isNoise(p: string): boolean {
    return /[\\/](node_modules|\.turbo|coverage)($|[\\/])/.test(p);
  }

  async function pathWithoutBun(): Promise<string> {
    const which = spawnSync("which", ["bun"], { encoding: "utf8" });
    const bunPath = (which.stdout || "").trim();
    const bunDir = bunPath ? path.dirname(bunPath) : "";
    const dirs = (process.env.PATH || "").split(path.delimiter);
    return dirs.filter((d) => d !== bunDir).join(path.delimiter);
  }

  test("UGB-06: tarball-shaped install (no repo generator sources) skips generation and installs the shipped bundle", async () => {
    // Mirrors the repo's relative layout (apps/cursor-plugin sibling of
    // scripts/) so install.sh's pre-existing, unconditional
    // `source .../scripts/lib/installer-shared.sh` / banner.sh still
    // resolve — that dependency predates this feature and is out of scope.
    // The ONE thing a real npm tarball lacks, and the ONE thing this test
    // omits, is scripts/generate-*.ts (UGB-06's actual subject).
    const pkgRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mt-cursor-tarball-"),
    );
    const pkgDir = path.join(pkgRoot, "apps", "cursor-plugin");
    try {
      await fs.cp(path.join(REPO_ROOT, "apps/cursor-plugin"), pkgDir, {
        recursive: true,
        filter: (src) => !isNoise(src),
      });
      await fs.mkdir(path.join(pkgRoot, "scripts", "lib"), { recursive: true });
      await fs.copyFile(
        path.join(REPO_ROOT, "scripts/banner.sh"),
        path.join(pkgRoot, "scripts/banner.sh"),
      );
      await fs.copyFile(
        path.join(REPO_ROOT, "scripts/lib/installer-shared.sh"),
        path.join(pkgRoot, "scripts/lib/installer-shared.sh"),
      );

      const res = spawnSync("bash", [path.join(pkgDir, "install.sh"), "--user"], {
        encoding: "utf8",
        env: { ...process.env, HOME: tmp },
        cwd: pkgDir,
        timeout: 30000,
      });
      expect(res.status).toBe(0);
      expect(
        await pathExists(
          path.join(tmp, ".cursor/agents/massa-ai-navigator.md"),
        ),
      ).toBe(true);
    } finally {
      await fs.rm(pkgRoot, { recursive: true, force: true });
    }
  }, 30_000);

  test("UGB-07: missing bun in a repo-checkout context exits non-zero before any host-config mutation", async () => {
    const pathNoBun = await pathWithoutBun();
    const res = spawnSync("bash", [INSTALL_SH, "--user"], {
      encoding: "utf8",
      env: { ...process.env, HOME: tmp, PATH: pathNoBun },
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(res.status).not.toBe(0);
    expect(res.status).toBe(3);
    expect(res.stderr).toContain("bun required");
    expect(await pathExists(path.join(tmp, ".cursor"))).toBe(false);
  });
});