/**
 * Codex plugin installer integration tests (Phase 1, T5).
 *
 * Verifies the install.sh behavior against the spec acceptance criteria
 * (CPX-01, CPX-02, CPX-07) and the F5 array-append merge mitigation:
 * - user-scope install creates ~/.codex/plugins/massa-ai/ + merges hooks.json
 * - project-scope install creates ./.codex/plugins/massa-ai/
 * - array-append merge preserves pre-existing user hooks
 * - uninstall removes only owned entries; user hooks survive
 * - idempotent re-run is a no-op
 * - trust warning printed to stdout
 *
 * Uses spawnSync to run install.sh with an overridden HOME (temp dir),
 * mirroring the scripts/__tests__/install-agents.test.ts convention.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs, existsSync } from "fs";
import path from "path";
import os from "os";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const INSTALL_SH = path.resolve(
  REPO_ROOT,
  "apps/codex-plugin/install.sh",
);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mt-codex-install-"));
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

describe("codex-plugin install.sh (T5 / CPX-01,02,07 + F5)", () => {
  test("user-scope install creates ~/.codex/plugins/massa-ai/ + merges hooks.json with 6 events", async () => {
    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const pluginDir = path.join(tmp, ".codex/plugins/massa-ai");
    expect(await pathExists(path.join(pluginDir, ".codex-plugin/plugin.json"))).toBe(true);

    const cfg = await readJson(path.join(tmp, ".codex/hooks.json"));
    expect(cfg.hooks).toBeDefined();
    const expectedEvents = [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PreCompact",
      "Stop",
    ];
    expect(Object.keys(cfg.hooks).sort()).toEqual(expectedEvents.sort());
  });

  test("project-scope install creates ./.codex/plugins/massa-ai/", async () => {
    const res = runInstall(["--project"], { HOME: tmp }, tmp);
    expect(res.exitCode).toBe(0);

    const pluginDir = path.join(tmp, ".codex/plugins/massa-ai");
    expect(await pathExists(path.join(pluginDir, ".codex-plugin/plugin.json"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".codex/hooks.json"))).toBe(true);
  });

  test("array-append merge: pre-existing user hook survives alongside massa-ai entry", async () => {
    // Pre-create hooks.json with a user hook under SessionStart (no marker)
    await fs.mkdir(path.join(tmp, ".codex"), { recursive: true });
    const userHooks = {
      hooks: {
        SessionStart: [{ type: "command", command: "echo user-hook" }],
      },
      model: "gpt-5",
    };
    await fs.writeFile(
      path.join(tmp, ".codex/hooks.json"),
      JSON.stringify(userHooks),
    );

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const cfg = await readJson(path.join(tmp, ".codex/hooks.json"));
    const sessionStart = cfg.hooks.SessionStart as Record<string, unknown>[];
    expect(sessionStart.length).toBe(2);
    // User hook survives
    const userEntry = sessionStart.find(
      (e) => (e.command as string) === "echo user-hook",
    );
    expect(userEntry).toBeDefined();
    // massa-ai entry appended
    const owned = sessionStart.find(
      (e) => e._massaAiOwned === true,
    );
    expect(owned).toBeDefined();
    // User top-level key preserved
    expect(cfg.model).toBe("gpt-5");
  });

  test("uninstall removes only owned entries; user hook survives", async () => {
    await fs.mkdir(path.join(tmp, ".codex"), { recursive: true });
    const userHooks = {
      hooks: {
        SessionStart: [{ type: "command", command: "echo user-hook" }],
      },
      model: "gpt-5",
    };
    await fs.writeFile(
      path.join(tmp, ".codex/hooks.json"),
      JSON.stringify(userHooks),
    );

    runInstall(["--user"], { HOME: tmp });
    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const cfg = await readJson(path.join(tmp, ".codex/hooks.json"));
    const sessionStart = cfg.hooks.SessionStart as Record<string, unknown>[];
    // massa-ai entries gone
    expect(
      sessionStart.find((e) => e._massaAiOwned === true),
    ).toBeUndefined();
    // User hook survives
    expect(
      sessionStart.find((e) => (e.command as string) === "echo user-hook"),
    ).toBeDefined();
    expect(cfg.model).toBe("gpt-5");
    // Plugin dir removed
    expect(
      await pathExists(path.join(tmp, ".codex/plugins/massa-ai")),
    ).toBe(false);
  });

  test("idempotent: running --user twice produces no diff in hooks.json", async () => {
    runInstall(["--user"], { HOME: tmp });
    const afterFirst = await fs.readFile(
      path.join(tmp, ".codex/hooks.json"),
      "utf8",
    );
    runInstall(["--user"], { HOME: tmp });
    const afterSecond = await fs.readFile(
      path.join(tmp, ".codex/hooks.json"),
      "utf8",
    );
    expect(afterSecond).toBe(afterFirst);
  });

  test("trust warning printed to stdout (contains /hooks and trust)", () => {
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("/hooks");
    expect(res.stdout.toLowerCase()).toContain("trust");
  });

  test("MCP registration delegated to the single writer", () => {
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("scripts/install-agents.sh");
    expect(res.stdout.toLowerCase()).toContain("mcp");
    // No plugin-local MCP file is written into the installed bundle.
    expect(
      existsSync(path.join(tmp, ".codex/plugins/massa-ai/.mcp.json")),
    ).toBe(false);
  });

  // ── T5: 17 subagent TOML agents (CDX-01,02,05,06,07 + DOC-01) ──────────────
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

  test("CDX-01/DOC-01: user-scope install writes 17 TOML agents to ~/.codex/agents/ + prints summary", async () => {
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    // 17 TOML files at ~/.codex/agents/massa-ai-<name>.toml (OUTSIDE plugin dir)
    const agentsDir = path.join(tmp, ".codex/agents");
    for (const name of SPECIALIST_NAMES) {
      expect(
        await pathExists(path.join(agentsDir, `massa-ai-${name}.toml`)),
      ).toBe(true);
    }
    // Agents dir is OUTSIDE the plugin dir
    expect(agentsDir).not.toContain("plugins");

    // Install output mentions the 17 subagent specialists (DOC-01)
    expect(res.stdout).toContain("17 subagent specialists");
  });

  test("CDX-07: each TOML has # massa-ai-owned top comment", async () => {
    runInstall(["--user"], { HOME: tmp });
    for (const name of SPECIALIST_NAMES) {
      const content = await fs.readFile(
        path.join(tmp, `.codex/agents/massa-ai-${name}.toml`),
        "utf8",
      );
      const firstLine = content.split(/\r?\n/)[0] ?? "";
      expect(firstLine).toBe("# massa-ai-owned");
    }
  });

  test("CDX-05/CDX-06: uninstall removes only owned TOML; user agents preserved (R3)", async () => {
    runInstall(["--user"], { HOME: tmp });
    const agentsDir = path.join(tmp, ".codex/agents");

    // Pre-seed a user agent (no ownership marker)
    await fs.writeFile(
      path.join(agentsDir, "user-custom.toml"),
      'name = "user-custom"\ndescription = "user agent"\n',
    );

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    // 12 massa-ai-owned TOML files removed
    for (const name of SPECIALIST_NAMES) {
      expect(
        await pathExists(path.join(agentsDir, `massa-ai-${name}.toml`)),
      ).toBe(false);
    }
    // User agent survives (R3: no ownership marker)
    expect(await pathExists(path.join(agentsDir, "user-custom.toml"))).toBe(true);
  });

  test("CDX-06: idempotent re-run overwrites TOML with identical content", async () => {
    runInstall(["--user"], { HOME: tmp });
    const readAll = async () => {
      const out: Record<string, string> = {};
      for (const name of SPECIALIST_NAMES) {
        out[name] = await fs.readFile(
          path.join(tmp, `.codex/agents/massa-ai-${name}.toml`),
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

describe("codex-plugin skills bundling (PDO-08, PDO-09 / D3)", () => {
  test("install copies massa-ai + persona-router into ~/.codex/skills (not the plugin cache) as plugin-owned", async () => {
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("harness skills installed");

    for (const name of ["massa-ai", "persona-router"]) {
      const skillMd = path.join(tmp, `.codex/skills/${name}/SKILL.md`);
      expect(await pathExists(skillMd)).toBe(true);
      const lst = await fs.lstat(skillMd);
      expect(lst.isSymbolicLink()).toBe(false);
    }

    const state = await readJson(path.join(tmp, ".config/massa-ai/install-state.json"));
    const platforms = state.platforms as Record<string, { skillsOwner: string }>;
    expect(platforms.codex.skillsOwner).toBe("plugin");
  });

  test("the existing 6 host-command skills copy is unaffected — no massa-ai/persona-router leak into the plugin cache", async () => {
    runInstall(["--user"], { HOME: tmp });
    const pluginDir = path.join(tmp, ".codex/plugins/massa-ai");
    expect(await pathExists(path.join(pluginDir, "skills/massa-ai"))).toBe(false);
    expect(await pathExists(path.join(pluginDir, "skills/persona-router"))).toBe(false);
    for (const name of ["def", "find", "graph", "index", "map", "status"]) {
      expect(await pathExists(path.join(pluginDir, `skills/${name}.md`))).toBe(true);
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
            codex: { root: path.join(tmp, ".codex"), skillsOwner: "repo", skills: ["massa-ai", "persona-router"] },
          },
        },
        null,
        2,
      ),
    );
    const res = runInstall(["--user", "--verbose"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("repo-owned");
    expect(await pathExists(path.join(tmp, ".codex/skills/massa-ai"))).toBe(false);
  });

  test("uninstall removes only a plugin-owned skills install and its state record", async () => {
    runInstall(["--user"], { HOME: tmp });
    expect(await pathExists(path.join(tmp, ".codex/skills/massa-ai"))).toBe(true);

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);
    expect(await pathExists(path.join(tmp, ".codex/skills/massa-ai"))).toBe(false);
  });
});

// ── T8: generated workflow-command delivery + uninstall coverage ────────────
describe("codex-plugin generated workflow-command delivery (T8, WFC-08)", () => {
  const QUICK_SKILL_FILES = ["def", "find", "graph", "index", "map", "status"].map(
    (n) => `${n}.md`,
  );

  test("install delivers every skills/*.md source file (quick + generated), scan-derived count", async () => {
    const sourceSkillsDir = path.join(REPO_ROOT, "apps/codex-plugin/skills");
    const sourceFiles = (await fs.readdir(sourceSkillsDir)).filter((f) =>
      f.endsWith(".md"),
    );
    const generatedFiles = sourceFiles.filter(
      (f) => !QUICK_SKILL_FILES.includes(f),
    );
    // Sanity: workflow commands must actually be generated for this test to
    // discriminate anything (bun run generate:artifacts ran via pretest:plugins).
    expect(generatedFiles.length).toBeGreaterThan(0);

    const res = runInstall(["--user"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    const installedSkillsDir = path.join(tmp, ".codex/plugins/massa-ai/skills");
    const installedFiles = (await fs.readdir(installedSkillsDir)).filter((f) =>
      f.endsWith(".md"),
    );
    expect(installedFiles.sort()).toEqual(sourceFiles.sort());

    // Spot-check: a generated file carries the ownership marker and reaches
    // the installed copy byte-identical to source.
    const sampleStem = generatedFiles[0]!;
    const sourceBody = await fs.readFile(
      path.join(sourceSkillsDir, sampleStem),
      "utf8",
    );
    expect(sourceBody).toContain("<!-- massa-ai:generated workflow-command -->");
    const installedBody = await fs.readFile(
      path.join(installedSkillsDir, sampleStem),
      "utf8",
    );
    expect(installedBody).toBe(sourceBody);
  });

  test("delivery is source-driven, not a fixed list: a skill excluded from the bundle is not installed", async () => {
    // Mirrors the UGB-06 tarball-shaped-install pattern: copy the plugin into
    // a scratch tree, then remove one generated workflow-command skill from
    // the scratch bundle before installing from it. A hardcoded delivery list
    // would still "deliver" the excluded name (nothing to copy, silently
    // skipped by a stale reference) or over/under count; the real copy loop
    // enumerates the live directory, so the excluded file is provably absent
    // and every other file is provably present.
    const sourceSkillsDir = path.join(REPO_ROOT, "apps/codex-plugin/skills");
    const sourceFiles = (await fs.readdir(sourceSkillsDir)).filter((f) =>
      f.endsWith(".md"),
    );
    const excluded = sourceFiles.find((f) => !QUICK_SKILL_FILES.includes(f));
    expect(excluded).toBeDefined();

    const pkgRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mt-codex-skill-exclude-"),
    );
    try {
      const pkgDir = path.join(pkgRoot, "apps", "codex-plugin");
      await fs.cp(path.join(REPO_ROOT, "apps/codex-plugin"), pkgDir, {
        recursive: true,
        filter: (src) => !/[\\/](node_modules|\.turbo|coverage)($|[\\/])/.test(src),
      });
      await fs.rm(path.join(pkgDir, "skills", excluded!));
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

      const installedSkillsDir = path.join(tmp, ".codex/plugins/massa-ai/skills");
      const installedFiles = (await fs.readdir(installedSkillsDir)).filter((f) =>
        f.endsWith(".md"),
      );
      expect(installedFiles).not.toContain(excluded);
      expect(installedFiles.sort()).toEqual(
        sourceFiles.filter((f) => f !== excluded).sort(),
      );
    } finally {
      await fs.rm(pkgRoot, { recursive: true, force: true });
    }
  }, 30_000);

  test("uninstall removes the owned set only: whole plugin skills dir gone, harness skill dirs (~/.codex/skills) unaffected by the generated-command surface", async () => {
    runInstall(["--user"], { HOME: tmp });
    const installedSkillsDir = path.join(tmp, ".codex/plugins/massa-ai/skills");
    expect(await pathExists(installedSkillsDir)).toBe(true);

    // Sanity: generated commands never leaked into the harness skills dir —
    // only massa-ai/persona-router (the two names install_bundled_skills
    // copies) live there, never a workflow-command stem.
    const harnessSkillsDir = path.join(tmp, ".codex/skills");
    if (await pathExists(harnessSkillsDir)) {
      const harnessEntries = await fs.readdir(harnessSkillsDir);
      expect(harnessEntries.sort()).toEqual(["massa-ai", "persona-router"].sort());
    }

    const res = runInstall(["--uninstall"], { HOME: tmp });
    expect(res.exitCode).toBe(0);

    // Entire plugin dir (including its skills/*.md, quick + generated) is gone.
    expect(await pathExists(installedSkillsDir)).toBe(false);
    expect(
      await pathExists(path.join(tmp, ".codex/plugins/massa-ai")),
    ).toBe(false);
  });
});

// ── T6: generated-bundle contract (design Component 4 / UGB-05..08) ─────────
describe("codex-plugin generated-bundle contract (T6, UGB-05..08)", () => {
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
    // Mirrors the repo's relative layout (apps/codex-plugin sibling of
    // scripts/) so install.sh's pre-existing, unconditional
    // `source .../scripts/lib/installer-shared.sh` / banner.sh still
    // resolve — that dependency predates this feature and is out of scope.
    // The ONE thing a real npm tarball lacks, and the ONE thing this test
    // omits, is scripts/generate-*.ts (UGB-06's actual subject).
    const pkgRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mt-codex-tarball-"),
    );
    const pkgDir = path.join(pkgRoot, "apps", "codex-plugin");
    try {
      await fs.cp(path.join(REPO_ROOT, "apps/codex-plugin"), pkgDir, {
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
        await pathExists(path.join(tmp, ".codex/agents/massa-ai-navigator.toml")),
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
    expect(await pathExists(path.join(tmp, ".codex"))).toBe(false);
  });
});