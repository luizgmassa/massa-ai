/**
 * install-skills.ts — in-process coverage for the state machine, symlink/check
 * branches, platform detection, and the CLI shell (parseArgs + main).
 *
 * The sibling install-skills.test.ts covers the happy-path apply for claude;
 * these tests close the remaining branches: every loadState error/migration
 * path, saveState round-trip, extractBootstrap errors, codex-home resolution,
 * PATH-scoped tool detection, check/uninstall drift branches, and the argv
 * entrypoint driven directly (including a real apply via a fake tool on PATH).
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs, chmodSync, existsSync, symlinkSync, writeFileSync } from "fs";
import path from "path";
import os from "os";

import {
  loadState,
  saveState,
  extractBootstrapBlock,
  extractBootstrap,
  resolveCodexHome,
  platformRoot,
  statePath,
  detectInstalledTools,
  checkPlatform,
  uninstallPlatform,
  applyPlatform,
  discoverSkillSources,
  parseArgs,
  main,
  IntegrationError,
  BOOTSTRAP_START,
  BOOTSTRAP_END,
  PLATFORMS,
  type InstallerState,
  type PlatformRecord,
} from "../install-skills";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const BOOTSTRAP = `${BOOTSTRAP_START}\nmanaged block body\n${BOOTSTRAP_END}`;

async function seedSkillRepo(tmp: string): Promise<{ root: string; skills: Map<string, string> }> {
  const root = path.join(tmp, "repo");
  const skillsDir = path.join(root, "skills");
  await fs.mkdir(path.join(skillsDir, "alpha"), { recursive: true });
  await fs.writeFile(path.join(skillsDir, "alpha", "SKILL.md"), "# alpha");
  await fs.mkdir(path.join(skillsDir, "beta"), { recursive: true });
  await fs.writeFile(path.join(skillsDir, "beta", "SKILL.md"), "# beta");
  // a dir without SKILL.md is skipped
  await fs.mkdir(path.join(skillsDir, "no-skill-md"), { recursive: true });
  await fs.writeFile(path.join(root, "AGENTS.md"), `${BOOTSTRAP}\n`);
  const skills = await discoverSkillSources(root);
  return { root, skills };
}

// ── loadState ───────────────────────────────────────────────────────────────

describe("loadState", () => {
  let tmp: string;
  let home: string;
  let codexHome: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-state-"));
    home = path.join(tmp, "home");
    codexHome = path.join(home, ".codex");
    await fs.mkdir(home, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("missing file -> fresh default v2 state", async () => {
    const st = await loadState(path.join(tmp, "nope.json"), home, codexHome);
    expect(st).toEqual({ version: 2, repository: null, platforms: {} });
  });

  test("malformed JSON -> IntegrationError", async () => {
    const f = path.join(tmp, "bad.json");
    await fs.writeFile(f, "{ not json");
    await expect(loadState(f, home, codexHome)).rejects.toThrow(/Malformed JSON/);
  });

  test("non-object root -> IntegrationError", async () => {
    const f = path.join(tmp, "arr.json");
    await fs.writeFile(f, "[1,2,3]");
    await expect(loadState(f, home, codexHome)).rejects.toThrow(/Expected a JSON object/);
  });

  test("v1 migration: platform array -> v2 records", async () => {
    const f = path.join(tmp, "v1.json");
    await fs.writeFile(f, JSON.stringify({ version: 1, repository: "r", platforms: ["claude", "codex"] }));
    const st = await loadState(f, home, codexHome);
    expect(st.version).toBe(2);
    expect(st.repository).toBe("r");
    expect(Object.keys(st.platforms).sort()).toEqual(["claude", "codex"]);
    expect(st.platforms.claude.root).toBe(platformRoot(home, codexHome, "claude"));
  });

  test("v1 migration: invalid (non-array) platforms -> IntegrationError", async () => {
    const f = path.join(tmp, "v1bad.json");
    await fs.writeFile(f, JSON.stringify({ version: 1, platforms: "nope" }));
    await expect(loadState(f, home, codexHome)).rejects.toThrow(/Invalid platform list/);
  });

  test("v1 migration: unknown platform name -> IntegrationError", async () => {
    const f = path.join(tmp, "v1unk.json");
    await fs.writeFile(f, JSON.stringify({ version: 1, platforms: ["claude", "bogus"] }));
    await expect(loadState(f, home, codexHome)).rejects.toThrow(/Invalid platform/);
  });

  test("unsupported version -> IntegrationError", async () => {
    const f = path.join(tmp, "v9.json");
    await fs.writeFile(f, JSON.stringify({ version: 9, platforms: {} }));
    await expect(loadState(f, home, codexHome)).rejects.toThrow(/Unsupported installer state version/);
  });

  test("v2 invalid platforms shape -> IntegrationError", async () => {
    const f = path.join(tmp, "v2bad.json");
    await fs.writeFile(f, JSON.stringify({ version: 2, platforms: "nope" }));
    await expect(loadState(f, home, codexHome)).rejects.toThrow(/Invalid platform records/);
  });

  test("v2 invalid platform record (not object) -> IntegrationError", async () => {
    const f = path.join(tmp, "v2rec.json");
    await fs.writeFile(f, JSON.stringify({ version: 2, platforms: { claude: "nope" } }));
    await expect(loadState(f, home, codexHome)).rejects.toThrow(/Invalid platform record/);
  });

  test("v2 invalid root (missing/empty) -> IntegrationError", async () => {
    const f = path.join(tmp, "v2root.json");
    await fs.writeFile(f, JSON.stringify({ version: 2, platforms: { claude: { root: "", skills: [] } } }));
    await expect(loadState(f, home, codexHome)).rejects.toThrow(/Invalid platform root/);
  });

  test("v2 invalid skill list (slash / dot / non-string) -> IntegrationError", async () => {
    const f = path.join(tmp, "v2skills.json");
    await fs.writeFile(
      f,
      JSON.stringify({ version: 2, platforms: { claude: { root: "/h", skills: ["a/b"] } } }),
    );
    await expect(loadState(f, home, codexHome)).rejects.toThrow(/Invalid skill list/);
  });

  test("v2 valid state dedupes skills and preserves repository", async () => {
    const f = path.join(tmp, "v2ok.json");
    const state: InstallerState = {
      version: 2,
      repository: "/repo",
      platforms: { claude: { root: "/h/.claude", skills: ["alpha", "alpha", "beta"] } },
    };
    await fs.writeFile(f, JSON.stringify(state));
    const st = await loadState(f, home, codexHome);
    expect(st.platforms.claude.skills).toEqual(["alpha", "beta"]);
    expect(st.repository).toBe("/repo");
  });
});

// ── saveState round-trip ────────────────────────────────────────────────────

describe("saveState", () => {
  test("writes + reads back, creating parent dirs", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-save-"));
    try {
      const f = path.join(tmp, "nested", "state.json");
      const state: InstallerState = {
        version: 2,
        repository: "/r",
        platforms: { claude: { root: "/h/.claude", skills: ["x"] } },
      };
      await saveState(f, state);
      const back = await loadState(f, path.join(tmp, "home"), path.join(tmp, "home", ".codex"));
      expect(back.platforms.claude.skills).toEqual(["x"]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── extractBootstrapBlock / extractBootstrap ────────────────────────────────

describe("extractBootstrapBlock", () => {
  test("extracts a single managed block", () => {
    expect(extractBootstrapBlock(`pre\n${BOOTSTRAP}\npost`)).toBe(BOOTSTRAP);
  });

  test("throws when no markers present", () => {
    expect(() => extractBootstrapBlock("nothing here")).toThrow(/Bootstrap block not found/);
  });

  test("throws on duplicated/incomplete markers", () => {
    expect(() => extractBootstrapBlock(`${BOOTSTRAP_START}\n${BOOTSTRAP_START}\n${BOOTSTRAP_END}`)).toThrow(
      /incomplete or duplicated/,
    );
  });
});

describe("extractBootstrap", () => {
  test("rethrows IntegrationError from the block parser", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-ext-"));
    try {
      const root = path.join(tmp, "repo");
      await fs.mkdir(path.join(root, "skills"), { recursive: true });
      await fs.writeFile(path.join(root, "skills", "AGENTS.md"), "no markers");
      await expect(extractBootstrap(root)).rejects.toThrow(IntegrationError);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("throws IntegrationError when the agents file is missing", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-ext2-"));
    try {
      await expect(extractBootstrap(tmp)).rejects.toThrow(/Missing canonical agents file/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── resolveCodexHome / platformRoot / statePath ─────────────────────────────

describe("resolveCodexHome", () => {
  test("explicit override wins", () => {
    expect(resolveCodexHome("/h", "/explicit/codex")).toBe(path.resolve("/explicit/codex"));
  });

  test("prefers ~/.codex when present", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-codex-"));
    try {
      await fs.mkdir(path.join(tmp, ".codex"));
      expect(resolveCodexHome(tmp)).toBe(path.resolve(path.join(tmp, ".codex")));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("falls back to ~/.config/codex when .codex absent", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-codex2-"));
    try {
      await fs.mkdir(path.join(tmp, ".config", "codex"), { recursive: true });
      expect(resolveCodexHome(tmp)).toBe(path.resolve(path.join(tmp, ".config", "codex")));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("defaults to ~/.codex when neither exists", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-codex3-"));
    try {
      expect(resolveCodexHome(tmp)).toBe(path.resolve(path.join(tmp, ".codex")));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("platformRoot + statePath", () => {
  test("platformRoot maps each platform", () => {
    expect(platformRoot("/h", "/h/.codex", "claude")).toBe(path.join("/h", ".claude"));
    expect(platformRoot("/h", "/h/.codex", "codex")).toBe("/h/.codex");
    expect(platformRoot("/h", "/h/.codex", "cursor")).toBe(path.join("/h", ".cursor"));
    expect(platformRoot("/h", "/h/.codex", "opencode")).toBe(path.join("/h", ".config", "opencode"));
  });

  test("statePath nests under .config/massa-ai", () => {
    expect(statePath("/h")).toBe(path.join("/h", ".config", "massa-ai", "install-state.json"));
  });
});

// ── detectInstalledTools ────────────────────────────────────────────────────

describe("detectInstalledTools", () => {
  test("finds a fake claude binary via command -v", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-path-"));
    try {
      const bin = path.join(dir, "claude");
      writeFileSync(bin, "#!/bin/sh\necho claude\n");
      chmodSync(bin, 0o755);
      const found = detectInstalledTools(["claude"], dir);
      expect(found.has("claude")).toBe(true);
      expect(found.get("claude")!.executable).toBe("claude");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("returns empty when nothing is on PATH", () => {
    expect(detectInstalledTools(PLATFORMS as unknown as Array<(typeof PLATFORMS)[number]>, "/nonexistent-path-zzz").size).toBe(0);
  });
});

// ── checkPlatform / uninstallPlatform drift branches ────────────────────────

describe("checkPlatform drift branches", () => {
  let tmp: string;
  let home: string;
  let codexHome: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-check-"));
    home = path.join(tmp, "home");
    codexHome = path.join(home, ".codex");
    await fs.mkdir(home, { recursive: true });
  });
  afterEach(async () => fs.rm(tmp, { recursive: true, force: true }));

  async function seed(): Promise<{ root: string; skills: Map<string, string> }> {
    return seedSkillRepo(tmp);
  }

  test("reports wrong-target symlink and non-symlink conflict", async () => {
    const { root, skills } = await seed();
    const skillsDir = path.join(platformRoot(home, codexHome, "claude"), "skills");
    await fs.mkdir(skillsDir, { recursive: true });
    // beta exists but points elsewhere (wrong target)
    symlinkSync("/some/other/place", path.join(skillsDir, "beta"));
    // alpha is a regular file (not a symlink)
    writeFileSync(path.join(skillsDir, "alpha"), "not a symlink");

    const results = await checkPlatform("claude", home, codexHome, skills, undefined, root);
    expect(results.some((r) => r.message.includes("exists but is not a symlink"))).toBe(true);
    expect(results.some((r) => r.message.includes("symlink points to"))).toBe(true);
  });

  test("reports a stale managed symlink present in state but absent from skills", async () => {
    const { root, skills } = await seed();
    const skillsDir = path.join(platformRoot(home, codexHome, "claude"), "skills");
    await fs.mkdir(skillsDir, { recursive: true });
    // stale symlink pointing into repo
    const staleTarget = path.join(root, "skills", "ghost");
    await fs.mkdir(staleTarget, { recursive: true });
    symlinkSync(staleTarget, path.join(skillsDir, "ghost"));

    const stateRecord: PlatformRecord = { root: platformRoot(home, codexHome, "claude"), skills: ["ghost"] };
    const results = await checkPlatform("claude", home, codexHome, skills, stateRecord, root);
    expect(results.some((r) => r.message.includes("Stale symlink: ghost"))).toBe(true);
  });

  test("no drift when all expected symlinks are correct", async () => {
    const { root, skills } = await seed();
    const skillsDir = path.join(platformRoot(home, codexHome, "claude"), "skills");
    await fs.mkdir(skillsDir, { recursive: true });
    for (const [name, src] of skills) symlinkSync(src, path.join(skillsDir, name));
    const results = await checkPlatform("claude", home, codexHome, skills, undefined, root);
    expect(results.length).toBe(0);
  });
});

describe("uninstallPlatform branches", () => {
  test("removes a tracked repo-pointing symlink + bootstrap block (non-dry-run)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-uninst-"));
    try {
      const home = path.join(tmp, "home");
      const codexHome = path.join(home, ".codex");
      const { root, skills } = await seedSkillRepo(tmp);
      // install first
      await applyPlatform("claude", home, codexHome, skills, BOOTSTRAP, false);
      const stateRecord: PlatformRecord = {
        root: platformRoot(home, codexHome, "claude"),
        skills: [...skills.keys()],
      };
      const res = await uninstallPlatform("claude", home, codexHome, stateRecord, root, false);
      expect(res.results.some((r) => r.message.includes("Removed symlink"))).toBe(true);
      expect(res.results.some((r) => r.message.includes("Bootstrap block removed"))).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("dry-run reports would-change for tracked symlinks + bootstrap", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-uninst-dry-"));
    try {
      const home = path.join(tmp, "home");
      const codexHome = path.join(home, ".codex");
      const { root, skills } = await seedSkillRepo(tmp);
      await applyPlatform("claude", home, codexHome, skills, BOOTSTRAP, false);
      const stateRecord: PlatformRecord = {
        root: platformRoot(home, codexHome, "claude"),
        skills: [...skills.keys()],
      };
      const res = await uninstallPlatform("claude", home, codexHome, stateRecord, root, true);
      expect(res.results.some((r) => r.status === "would-change")).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── applyPlatform edge: conflict + idempotent re-run ────────────────────────

describe("applyPlatform edge cases", () => {
  test("aborts with an error result when a target path is a regular file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-conflict-"));
    try {
      const home = path.join(tmp, "home");
      const codexHome = path.join(home, ".codex");
      const { skills } = await seedSkillRepo(tmp);
      const skillsDir = path.join(platformRoot(home, codexHome, "claude"), "skills");
      await fs.mkdir(skillsDir, { recursive: true });
      writeFileSync(path.join(skillsDir, "alpha"), "regular file conflict");
      const res = await applyPlatform("claude", home, codexHome, skills, BOOTSTRAP, false);
      expect(res.results.some((r) => r.status === "error" && r.message.includes("Conflict"))).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("replaces a wrong-target symlink and writes bootstrap when markers absent", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-relink-"));
    try {
      const home = path.join(tmp, "home");
      const codexHome = path.join(home, ".codex");
      const { root, skills } = await seedSkillRepo(tmp);
      const skillsDir = path.join(platformRoot(home, codexHome, "claude"), "skills");
      await fs.mkdir(skillsDir, { recursive: true });
      // alpha points to wrong target
      await fs.mkdir(path.join(root, "wrong"));
      symlinkSync(path.join(root, "wrong"), path.join(skillsDir, "alpha"));
      const res = await applyPlatform("claude", home, codexHome, skills, BOOTSTRAP, false);
      expect(res.results.some((r) => r.message.startsWith("Symlinked:"))).toBe(true);
      expect(res.results.some((r) => r.message.includes("Bootstrap block written"))).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── discoverSkillSources edge ───────────────────────────────────────────────

describe("discoverSkillSources edge cases", () => {
  test("throws IntegrationError when the skills dir is missing", async () => {
    await expect(discoverSkillSources("/nonexistent-root-xyz")).rejects.toThrow(IntegrationError);
  });

  test("throws when no installable skills are found", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-empty-"));
    try {
      await fs.mkdir(path.join(tmp, "skills", "empty"), { recursive: true });
      await expect(discoverSkillSources(tmp)).rejects.toThrow(/No installable skills/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── parseArgs ───────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  test("defaults to apply + all platforms + real home", () => {
    const opts = parseArgs([]);
    expect(opts.action).toBe("apply");
    expect(opts.platforms).toEqual([...PLATFORMS]);
    expect(opts.target).toBe(os.homedir());
  });

  test("parses action + platform all + flags", () => {
    const opts = parseArgs(["--uninstall", "--platform", "all", "--yes", "--json"]);
    expect(opts.action).toBe("uninstall");
    expect(opts.platforms).toEqual([...PLATFORMS]);
    expect(opts.yes).toBe(true);
    expect(opts.json).toBe(true);
  });

  test("--platform <single> restricts", () => {
    expect(parseArgs(["--platform", "codex"]).platforms).toEqual(["codex"]);
  });

  test("--target / --repo-root / --dry-run / --check", () => {
    const opts = parseArgs(["--dry-run", "--target", "/t", "--repo-root", "/r"]);
    expect(opts.action).toBe("dry-run");
    expect(opts.target).toBe("/t");
    expect(opts.repoRoot).toBe("/r");
    expect(parseArgs(["--check"]).action).toBe("check");
  });

  test("exits 2 on an unknown platform", () => {
    const origExit = process.exit;
    (process as { exit: unknown }).exit = ((code?: number) => {
      throw new Error(`__EXIT__${code}`);
    }) as never;
    try {
      expect(() => parseArgs(["--platform", "bogus"])).toThrow(/__EXIT__2/);
    } finally {
      process.exit = origExit;
    }
  });

  test("exits 2 on an unknown flag", () => {
    const origExit = process.exit;
    (process as { exit: unknown }).exit = ((code?: number) => {
      throw new Error(`__EXIT__${code}`);
    }) as never;
    try {
      expect(() => parseArgs(["--bogus-flag"])).toThrow(/__EXIT__2/);
    } finally {
      process.exit = origExit;
    }
  });

  test("exits 0 on --help", () => {
    const origExit = process.exit;
    (process as { exit: unknown }).exit = ((code?: number) => {
      throw new Error(`__EXIT__${code ?? 0}`);
    }) as never;
    try {
      expect(() => parseArgs(["--help"])).toThrow(/__EXIT__0/);
    } finally {
      process.exit = origExit;
    }
  });
});

// ── main (argv entrypoint) ──────────────────────────────────────────────────

describe("main (argv entrypoint)", () => {
  let tmp: string;
  let savedPath: string | undefined;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skills-main-"));
    savedPath = process.env.PATH;
  });
  afterEach(async () => {
    process.env.PATH = savedPath;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("refuses real $HOME without --yes -> exit 1", async () => {
    const oErr = console.error;
    try {
      console.error = () => {};
      const code = await main(["--target", os.homedir(), "--repo-root", REPO_ROOT]);
      expect(code).toBe(1);
    } finally {
      console.error = oErr;
    }
  });

  test("apply with no agent tools on PATH -> exit 2", async () => {
    const oErr = console.error;
    const oWarn = console.warn;
    try {
      console.error = () => {};
      console.warn = () => {};
      process.env.PATH = "/nonexistent-path-zzz";
      const code = await main(["--apply", "--target", tmp, "--repo-root", REPO_ROOT]);
      expect(code).toBe(2);
    } finally {
      console.error = oErr;
      console.warn = oWarn;
    }
  });

  test("uninstall against an empty home -> exit 0", async () => {
    const code = await main(["--uninstall", "--target", tmp, "--repo-root", REPO_ROOT]);
    expect(code).toBe(0);
  });

  test("check against an empty home reports drift -> exit 1", async () => {
    const code = await main(["--check", "--target", tmp, "--repo-root", REPO_ROOT]);
    expect(code).toBe(1);
  });

  test("bad repo-root (no skills dir) -> IntegrationError -> exit 2", async () => {
    const oErr = console.error;
    try {
      console.error = () => {};
      const code = await main(["--uninstall", "--target", tmp, "--repo-root", "/nonexistent-root-xyz"]);
      expect(code).toBe(2);
    } finally {
      console.error = oErr;
    }
  });

  test("full apply via a fake claude on PATH, then idempotent re-apply + check", async () => {
    const bin = path.join(tmp, "bin");
    await fs.mkdir(bin, { recursive: true });
    const claudeBin = path.join(bin, "claude");
    writeFileSync(claudeBin, "#!/bin/sh\necho claude\n");
    chmodSync(claudeBin, 0o755);
    process.env.PATH = `${bin}:${savedPath ?? ""}`;

    async function runJson(args: string[]): Promise<{ code: number; status?: string; errs: string[] }> {
      const out: string[] = [];
      const errs: string[] = [];
      const oLog = console.log;
      const oWarn = console.warn;
      const oErr = console.error;
      try {
        console.log = (...a: unknown[]) => out.push(a.join(" "));
        console.warn = (...a: unknown[]) => out.push(a.join(" "));
        console.error = (...a: unknown[]) => errs.push(a.join(" "));
        const code = await main(args);
        const blob = out.find((l) => l.startsWith("{"));
        const status = blob ? (JSON.parse(blob) as { status: string }).status : undefined;
        return { code, status, errs };
      } finally {
        console.log = oLog;
        console.warn = oWarn;
        console.error = oErr;
      }
    }

    const apply1 = await runJson(["--apply", "--platform", "claude", "--target", tmp, "--repo-root", REPO_ROOT, "--yes", "--json"]);
    expect({ code: apply1.code, errs: apply1.errs }).toEqual({ code: 0, errs: [] });
    // symlinks created for every discovered skill
    const discovered = await discoverSkillSources(REPO_ROOT);
    const claudeSkills = path.join(tmp, ".claude", "skills");
    for (const name of discovered.keys()) {
      expect(existsSync(path.join(claudeSkills, name))).toBe(true);
    }
    expect(existsSync(path.join(tmp, ".claude", "AGENTS.md"))).toBe(true);

    // idempotent re-apply -> still 0
    const apply2 = await runJson(["--apply", "--platform", "claude", "--target", tmp, "--repo-root", REPO_ROOT, "--yes"]);
    expect(apply2.code).toBe(0);

    // check (scoped to claude) -> no drift -> 0
    const check = await runJson(["--check", "--platform", "claude", "--target", tmp, "--repo-root", REPO_ROOT]);
    expect(check.code).toBe(0);

    // uninstall -> removes -> 0
    const uninst = await runJson(["--uninstall", "--platform", "claude", "--target", tmp, "--repo-root", REPO_ROOT]);
    expect(uninst.code).toBe(0);

    // check again (scoped to claude) -> drift -> 1
    const check2 = await runJson(["--check", "--platform", "claude", "--target", tmp, "--repo-root", REPO_ROOT]);
    expect(check2.code).toBe(1);
  });

  test("--json emits a JSON status object", async () => {
    const out: string[] = [];
    const oLog = console.log;
    try {
      console.log = (...a: unknown[]) => out.push(a.join(" "));
      await main(["--check", "--target", tmp, "--repo-root", REPO_ROOT, "--json"]);
    } finally {
      console.log = oLog;
    }
    const blob = out.find((l) => l.startsWith("{"));
    expect(blob).toBeDefined();
    const parsed = JSON.parse(blob!) as { status: string };
    expect(["drift", "ok", "error", "changed", "would-change"]).toContain(parsed.status);
  });
});
