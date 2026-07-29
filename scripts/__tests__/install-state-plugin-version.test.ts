/**
 * install-state-plugin-version.test.ts — PAI-06 state round-trip coverage.
 *
 * install-state.json v2 gains an optional per-platform `plugin` subfield
 * ({version, installedAt}) written by the plugin installers. install-skills.sh
 * never writes it, but its TSV intermediate + state rewrite must round-trip it
 * byte-identically (design C5), a pre-feature file with no `plugin` key must
 * round-trip with the key still absent (never {version: "", installedAt: ""}),
 * and the strict skills reader must keep hard-failing on a corrupt file.
 *
 * Every case drives the REAL scripts/install-skills.sh against a scratch
 * --target HOME with a mock `cursor-agent` binary on the child PATH, so the
 * cursor platform is detected deterministically on any machine.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const INSTALL_SKILLS = path.join(REPO_ROOT, "scripts", "install-skills.sh");

const PLUGIN_RECORD = { version: "1.9.1", installedAt: "2026-07-29T12:00:00Z" };
const TEST_TIMEOUT = 30000;

interface PlatformRecord {
  root: string;
  skills: string[];
  skillsOwner: string;
  plugin?: { version: string; installedAt: string };
}

async function writeState(home: string, platforms: Record<string, PlatformRecord>): Promise<string> {
  const file = path.join(home, ".config", "massa-ai", "install-state.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ version: 2, repository: REPO_ROOT, platforms }, null, 2) + "\n", "utf8");
  return file;
}

async function readState(file: string): Promise<{ version: number; repository: string; platforms: Record<string, PlatformRecord> }> {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function runInstallSkills(home: string, mockBin: string, args: string[]) {
  return spawnSync("bash", [INSTALL_SKILLS, ...args, "--target", home, "--yes"], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: TEST_TIMEOUT,
    env: { ...process.env, PATH: `${mockBin}:${process.env.PATH}` },
  });
}

describe("install-state v2 plugin-version round-trip (PAI-06)", () => {
  let home: string;
  let mockBin: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-state-home-"));
    mockBin = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-state-bin-"));
    // cursor detection goes through cursor-agent (platform_executables parity).
    await fs.writeFile(path.join(mockBin, "cursor-agent"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(mockBin, { recursive: true, force: true });
  });

  test(
    "--apply preserves a seeded plugin subfield byte-identically; an untouched platform keeps its record exactly",
    async () => {
      const stateFile = await writeState(home, {
        cursor: { root: path.join(home, ".cursor"), skills: ["massa-ai"], skillsOwner: "repo", plugin: PLUGIN_RECORD },
        claude: { root: path.join(home, ".claude"), skills: ["massa-ai"], skillsOwner: "plugin" },
      });

      const res = runInstallSkills(home, mockBin, ["--apply", "--platform", "cursor"]);
      expect(res.status).toBe(0);

      const after = await readState(stateFile);
      // Byte-identical subfield: same keys, same order, same values.
      expect(JSON.stringify(after.platforms.cursor.plugin)).toBe(JSON.stringify(PLUGIN_RECORD));
      // The skills fields are still rewritten by the apply itself.
      expect(after.platforms.cursor.skillsOwner).toBe("repo");
      expect(after.platforms.cursor.skills).toContain("massa-ai");
      // A platform this run never touched keeps its record exactly — and a
      // pre-feature record stays free of the plugin key.
      expect(after.platforms.claude).toEqual({
        root: path.join(home, ".claude"),
        skills: ["massa-ai"],
        skillsOwner: "plugin",
      });
      expect("plugin" in after.platforms.claude).toBe(false);
      expect(after.version).toBe(2);
      expect(after.repository).toBe(REPO_ROOT);
    },
    TEST_TIMEOUT,
  );

  test(
    "pre-feature v2 file (no plugin) round-trips with the subfield still absent — never an empty-literal object",
    async () => {
      const stateFile = await writeState(home, {
        cursor: { root: path.join(home, ".cursor"), skills: ["massa-ai"], skillsOwner: "repo" },
      });

      const res = runInstallSkills(home, mockBin, ["--apply", "--platform", "cursor"]);
      expect(res.status).toBe(0);

      const after = await readState(stateFile);
      expect("plugin" in after.platforms.cursor).toBe(false);
    },
    TEST_TIMEOUT,
  );

  test(
    "--uninstall on a plugin-owned platform keeps the whole record, plugin subfield byte-identical",
    async () => {
      const stateFile = await writeState(home, {
        cursor: { root: path.join(home, ".cursor"), skills: ["massa-ai"], skillsOwner: "plugin", plugin: PLUGIN_RECORD },
      });

      const res = runInstallSkills(home, mockBin, ["--uninstall", "--platform", "cursor"]);
      expect(res.status).toBe(0);

      const after = await readState(stateFile);
      expect(JSON.stringify(after.platforms.cursor.plugin)).toBe(JSON.stringify(PLUGIN_RECORD));
      expect(after.platforms.cursor.skillsOwner).toBe("plugin");
      expect(after.platforms.cursor.skills).toEqual(["massa-ai"]);
    },
    TEST_TIMEOUT,
  );

  test(
    "corrupt state file still exits 2 with the integration error (strict skills reader unchanged)",
    async () => {
      const stateFile = path.join(home, ".config", "massa-ai", "install-state.json");
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      await fs.writeFile(stateFile, "{not json", "utf8");

      const res = runInstallSkills(home, mockBin, ["--apply", "--platform", "cursor"]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("Installer state at");
      expect(res.stderr).toContain("is invalid");
    },
    TEST_TIMEOUT,
  );
});
