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

describe("cursor-plugin install.sh (T10 / CRS-01,02,07 + F5)", () => {
  test("user-scope install creates ~/.cursor/plugins/local/massa-ai/ + merges hooks.json with 7 events", async () => {
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const pluginDir = path.join(tmp, ".cursor/plugins/local/massa-ai");
    expect(await pathExists(path.join(pluginDir, ".cursor-plugin/plugin.json"))).toBe(true);
    expect(await pathExists(path.join(pluginDir, "agents/massa-ai-navigator.md"))).toBe(true);

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

  test("CRS-01/CRS-04/DOC-01: install copies all 17 specialists into plugin agents/ + prints summary", async () => {
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const agentsDir = path.join(tmp, ".cursor/plugins/local/massa-ai/agents");
    // 17 specialists, navigator included (CRS-01/CRS-04)
    for (const name of SPECIALIST_NAMES) {
      expect(
        await pathExists(path.join(agentsDir, `massa-ai-${name}.md`)),
      ).toBe(true);
    }
    // Total 17 .md files in agents/
    const files = (await fs.readdir(agentsDir)).filter((f) => f.endsWith(".md"));
    expect(files.length).toBe(17);

    // Install output mentions the 17 subagent specialists (DOC-01)
    expect(res.stdout).toContain("17 subagent specialists");
  });

  test("CRS-05: uninstall removes whole plugin dir (all 17 agents gone)", async () => {
    runInstall(["--user"], { HOME: tmp });
    const agentsDir = path.join(tmp, ".cursor/plugins/local/massa-ai/agents");
    expect(await pathExists(agentsDir)).toBe(true);

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    // Whole plugin dir removed (CRS-05: unchanged behavior)
    expect(
      await pathExists(path.join(tmp, ".cursor/plugins/local/massa-ai")),
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

// ── T9: generated workflow-command delivery + exclusion-list audit ──────────
describe("cursor-plugin generated workflow-command delivery (T9, WFC-08)", () => {
  const QUICK_STEM_NAMES = ["def", "find", "graph", "index", "map", "status"];
  const RESERVED_BUNDLE_ROOTS = ["massa-ai", "persona-router", "agents", "profile"];

  async function sourceStemDirs(): Promise<string[]> {
    const skillsDir = path.join(REPO_ROOT, "apps/cursor-plugin/skills");
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const stems: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (RESERVED_BUNDLE_ROOTS.includes(e.name)) continue;
      if (await pathExists(path.join(skillsDir, e.name, "SKILL.md"))) {
        stems.push(e.name);
      }
    }
    return stems;
  }

  test("install delivers every command-skill stem dir (quick + generated), scan-derived count", async () => {
    const sourceStems = await sourceStemDirs();
    const generatedStems = sourceStems.filter((s) => !QUICK_STEM_NAMES.includes(s));
    // Sanity: workflow commands must actually be generated for this test to
    // discriminate anything (bun run generate:artifacts ran via pretest:plugins).
    expect(generatedStems.length).toBeGreaterThan(0);

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const installedSkillsDir = path.join(tmp, ".cursor/plugins/local/massa-ai/skills");
    const installedStems = (
      await fs.readdir(installedSkillsDir, { withFileTypes: true })
    )
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(installedStems.sort()).toEqual(sourceStems.sort());

    // Spot-check: a generated stem's SKILL.md carries the ownership marker
    // and reaches the installed copy byte-identical to source.
    const sampleStem = generatedStems[0]!;
    const sourceBody = await fs.readFile(
      path.join(REPO_ROOT, "apps/cursor-plugin/skills", sampleStem, "SKILL.md"),
      "utf8",
    );
    expect(sourceBody).toContain("<!-- massa-ai:generated workflow-command -->");
    const installedBody = await fs.readFile(
      path.join(installedSkillsDir, sampleStem, "SKILL.md"),
      "utf8",
    );
    expect(installedBody).toBe(sourceBody);
  });

  test("WFC-08 audit fix: profile/ (harness bundle) is excluded from the command-skill copy, never mislabeled as a command", async () => {
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    const installedSkillsDir = path.join(tmp, ".cursor/plugins/local/massa-ai/skills");
    expect(await pathExists(path.join(installedSkillsDir, "profile"))).toBe(false);
    // massa-ai/persona-router/agents already asserted absent elsewhere; profile
    // was the pre-existing gap (design.md Risks table) — this is its regression
    // guard. Observed red before the install.sh exclusion-list fix: profile/
    // WAS present in installedSkillsDir (leaked, mislabeled as a command skill).
    for (const reserved of ["massa-ai", "persona-router", "agents"]) {
      expect(await pathExists(path.join(installedSkillsDir, reserved))).toBe(false);
    }
  });

  test("delivery is source-driven, not a fixed list: a stem excluded from the bundle is not installed", async () => {
    // Mirrors the UGB-06 tarball-shaped-install pattern: copy the plugin into
    // a scratch tree, then remove one generated workflow-command stem dir
    // from the scratch bundle before installing from it.
    const sourceStems = await sourceStemDirs();
    const excluded = sourceStems.find((s) => !QUICK_STEM_NAMES.includes(s));
    expect(excluded).toBeDefined();

    const pkgRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mt-cursor-stem-exclude-"),
    );
    try {
      const pkgDir = path.join(pkgRoot, "apps", "cursor-plugin");
      await fs.cp(path.join(REPO_ROOT, "apps/cursor-plugin"), pkgDir, {
        recursive: true,
        filter: (src) => !/[\\/](node_modules|\.turbo|coverage)($|[\\/])/.test(src),
      });
      await fs.rm(path.join(pkgDir, "skills", excluded!), {
        recursive: true,
        force: true,
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

      const installedSkillsDir = path.join(tmp, ".cursor/plugins/local/massa-ai/skills");
      const installedStems = (
        await fs.readdir(installedSkillsDir, { withFileTypes: true })
      )
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      expect(installedStems).not.toContain(excluded);
      expect(installedStems.sort()).toEqual(
        sourceStems.filter((s) => s !== excluded).sort(),
      );
    } finally {
      await fs.rm(pkgRoot, { recursive: true, force: true });
    }
  }, 30_000);

  test("uninstall removes the owned set only: whole plugin dir gone (generated + quick stem dirs together)", async () => {
    runInstall(["--user"], { HOME: tmp });
    const installedSkillsDir = path.join(tmp, ".cursor/plugins/local/massa-ai/skills");
    expect(await pathExists(installedSkillsDir)).toBe(true);

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(await pathExists(installedSkillsDir)).toBe(false);
    expect(
      await pathExists(path.join(tmp, ".cursor/plugins/local/massa-ai")),
    ).toBe(false);
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
          path.join(tmp, ".cursor/plugins/local/massa-ai/agents/massa-ai-navigator.md"),
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