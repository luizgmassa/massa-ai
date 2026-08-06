/**
 * install-state-plugin-version.test.ts — PAI-06 state round-trip coverage,
 * extended by T10 (MPS-03) to the model-profile-switching fields.
 *
 * install-state.json v2 gains an optional per-platform `plugin` subfield
 * ({version, installedAt}) written by the plugin installers. install-skills.sh
 * never writes it, but its TSV intermediate + state rewrite must round-trip it
 * byte-identically (design C5), a pre-feature file with no `plugin` key must
 * round-trip with the key still absent (never {version: "", installedAt: ""}),
 * and the strict skills reader must keep hard-failing on a corrupt file.
 *
 * T10 adds the same round-trip obligation for two more optional fields:
 * `installRoute` (installer-owned, "file" | "marketplace" for claude; codex/
 * opencode are unconditionally "file"; cursor has its own "local" | "bridge"
 * vocabulary — AD-017/T6, plugin-architecture-unification) and `modelProfile`
 * ({profile, switchedAt}, switch-engine-owned). install-skills.sh's TSV
 * intermediate originally carried only 6 columns (platform/root/csv/owner/
 * plugin-version/plugin-installedAt) — extending state with two more optional
 * fields that TSV never parsed would have silently dropped them on every
 * `--apply`/`--uninstall` run, which is exactly the defect this file's
 * existing plugin-subfield tests exist to catch for the `plugin` field. The
 * TSV now carries 9 columns (fields 7-9: installRoute, modelProfile.profile,
 * modelProfile.switchedAt).
 *
 * Every case drives the REAL scripts/install-skills.sh against a scratch
 * --target HOME with a mock `cursor-agent` binary on the child PATH, so the
 * cursor platform is detected deterministically on any machine.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs, existsSync } from "fs";
import path from "path";
import os from "os";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const INSTALL_SKILLS = path.join(REPO_ROOT, "scripts", "install-skills.sh");

const PLUGIN_RECORD = { version: "1.9.1", installedAt: "2026-07-29T12:00:00Z" };
const MODEL_PROFILE_RECORD = { profile: "work", switchedAt: "2026-01-01T00:00:00Z" };
const TEST_TIMEOUT = 30000;

interface PlatformRecord {
  root: string;
  skills: string[];
  skillsOwner: string;
  plugin?: { version: string; installedAt: string };
  installRoute?: string;
  modelProfile?: { profile: string; switchedAt: string };
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

describe("plugin version record parity (PAI-03, R7, F)", () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-parity-home-"));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  test("root + all four plugin package.json versions are equal (closes latent F — no PR gate runs version:sync)", async () => {
    const rootVersion = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf8")).version;
    for (const host of ["claude", "codex", "cursor", "opencode"]) {
      const pkg = JSON.parse(
        await fs.readFile(path.join(REPO_ROOT, "apps", `${host}-plugin`, "package.json"), "utf8"),
      );
      expect(pkg.version).toBe(rootVersion);
    }
  });

  test(
    "record shape is identical across the claude/codex/cursor installers",
    async () => {
      const rootVersion = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf8")).version;
      for (const host of ["claude", "codex", "cursor"]) {
        const res = spawnSync(
          "bash",
          [path.join(REPO_ROOT, "apps", `${host}-plugin`, "install.sh"), "--user"],
          {
            encoding: "utf8",
            cwd: REPO_ROOT,
            timeout: TEST_TIMEOUT,
            // SKIP pins claude/codex to the file route — a real host CLI on a
            // dev box must never be invoked from a test.
            env: { ...process.env, HOME: home, MASSA_AI_SKIP_PLUGIN_REGISTRY: "1" },
          },
        );
        expect(res.status).toBe(0);
        const state = await readState(path.join(home, ".config", "massa-ai", "install-state.json"));
        const plugin = state.platforms[host].plugin!;
        expect(Object.keys(plugin).sort()).toEqual(["installedAt", "version"]);
        expect(plugin.version).toBe(rootVersion);
        expect(plugin.installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        // T10 (MPS-03, design F1): installRoute is written on every install
        // path. claude/codex are pinned to the file route by the SKIP env
        // above. Cursor has its own two-value vocabulary (AD-017/T6:
        // "bridge" | "local", joining claude's "marketplace" | "file" rather
        // than reusing it) and needs no SKIP var — its bridge probe is a
        // plain read of $HOME/.claude/plugins/installed_plugins.json, already
        // sandboxed by the redirected HOME above with no live-CLI risk; with
        // no registry file present it falls back to "local".
        expect(state.platforms[host].installRoute).toBe(host === "cursor" ? "local" : "file");
        await fs.rm(path.join(home, ".config"), { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );
});

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

// ── T10 (MPS-03): installRoute + modelProfile round-trip through install-skills.sh ──
//
// Mirrors the PAI-06 describe block above exactly, for the two fields T10
// adds: `installRoute` (installer-owned) and `modelProfile` (engine-owned,
// {profile, switchedAt}). install-skills.sh is not the writer of either field
// — it must round-trip whatever is already there byte-identically, the same
// pass-through discipline `plugin` already had.
describe("install-state v2 model-profile-switching round-trip (T10, MPS-03)", () => {
  let home: string;
  let mockBin: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-mps-state-home-"));
    mockBin = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-mps-state-bin-"));
    await fs.writeFile(path.join(mockBin, "cursor-agent"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(mockBin, { recursive: true, force: true });
  });

  test(
    "--apply preserves seeded installRoute + modelProfile byte-identically; an untouched platform keeps its record exactly",
    async () => {
      const stateFile = await writeState(home, {
        cursor: {
          root: path.join(home, ".cursor"),
          skills: ["massa-ai"],
          skillsOwner: "repo",
          installRoute: "file",
          modelProfile: MODEL_PROFILE_RECORD,
        },
        claude: {
          root: path.join(home, ".claude"),
          skills: ["massa-ai"],
          skillsOwner: "plugin",
          installRoute: "marketplace",
          modelProfile: { profile: "home", switchedAt: "2026-02-02T00:00:00Z" },
        },
      });

      const res = runInstallSkills(home, mockBin, ["--apply", "--platform", "cursor"]);
      expect(res.status).toBe(0);

      const after = await readState(stateFile);
      // The touched platform's fields survive byte-identically.
      expect(after.platforms.cursor.installRoute).toBe("file");
      expect(JSON.stringify(after.platforms.cursor.modelProfile)).toBe(JSON.stringify(MODEL_PROFILE_RECORD));
      expect(after.platforms.cursor.skillsOwner).toBe("repo");
      // A platform this run never touched keeps ITS fields exactly too.
      expect(after.platforms.claude.installRoute).toBe("marketplace");
      expect(JSON.stringify(after.platforms.claude.modelProfile)).toBe(
        JSON.stringify({ profile: "home", switchedAt: "2026-02-02T00:00:00Z" }),
      );
    },
    TEST_TIMEOUT,
  );

  test(
    "pre-feature v2 file (no installRoute/modelProfile) round-trips with both fields still absent",
    async () => {
      const stateFile = await writeState(home, {
        cursor: { root: path.join(home, ".cursor"), skills: ["massa-ai"], skillsOwner: "repo" },
      });

      const res = runInstallSkills(home, mockBin, ["--apply", "--platform", "cursor"]);
      expect(res.status).toBe(0);

      const after = await readState(stateFile);
      expect("installRoute" in after.platforms.cursor).toBe(false);
      expect("modelProfile" in after.platforms.cursor).toBe(false);
    },
    TEST_TIMEOUT,
  );

  test(
    "--uninstall on a plugin-owned platform keeps installRoute + modelProfile byte-identical",
    async () => {
      const stateFile = await writeState(home, {
        cursor: {
          root: path.join(home, ".cursor"),
          skills: ["massa-ai"],
          skillsOwner: "plugin",
          plugin: PLUGIN_RECORD,
          installRoute: "file",
          modelProfile: MODEL_PROFILE_RECORD,
        },
      });

      const res = runInstallSkills(home, mockBin, ["--uninstall", "--platform", "cursor"]);
      expect(res.status).toBe(0);

      const after = await readState(stateFile);
      expect(after.platforms.cursor.installRoute).toBe("file");
      expect(JSON.stringify(after.platforms.cursor.modelProfile)).toBe(JSON.stringify(MODEL_PROFILE_RECORD));
      expect(JSON.stringify(after.platforms.cursor.plugin)).toBe(JSON.stringify(PLUGIN_RECORD));
    },
    TEST_TIMEOUT,
  );
});

// ── T10: every record_plugin_version() preserves a pre-existing modelProfile ──
//
// Exercises the FULL install path (install_bundled_skills's whole-record
// replace, then record_plugin_version's own write) end to end for all four
// installers, proving neither step silently drops a profile a prior switch
// recorded — the exact defect a fresh install.sh install with a recorded
// profile has actually exhibited (T8/T9 commit messages) before the
// whole-record-replace fix. OpenCode is skipped when unbuilt, same guard
// convention as verify-package-contents.test.ts.
describe("record_plugin_version() preserves a pre-existing modelProfile (T10, MPS-03)", () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-mps-record-home-"));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  const HOSTS: Array<{ host: string; configDir: string }> = [
    { host: "claude", configDir: ".claude" },
    { host: "codex", configDir: ".codex" },
    { host: "cursor", configDir: ".cursor" },
    { host: "opencode", configDir: path.join(".config", "opencode") },
  ];

  for (const { host, configDir } of HOSTS) {
    const opencodeBuilt = existsSync(path.join(REPO_ROOT, "apps/opencode-plugin/dist/index.js"));
    const maybeTest = host === "opencode" && !opencodeBuilt ? test.skip : test;

    maybeTest(
      `${host}: a pre-existing modelProfile survives a full install run`,
      async () => {
        await writeState(home, {
          [host]: {
            root: path.join(home, configDir),
            skills: [],
            skillsOwner: "plugin",
            modelProfile: MODEL_PROFILE_RECORD,
          },
        });
        await fs.mkdir(path.join(home, configDir), { recursive: true });

        const res = spawnSync(
          "bash",
          [path.join(REPO_ROOT, "apps", `${host}-plugin`, "install.sh"), "--user"],
          {
            encoding: "utf8",
            cwd: REPO_ROOT,
            timeout: TEST_TIMEOUT,
            env: { ...process.env, HOME: home, MASSA_AI_SKIP_PLUGIN_REGISTRY: "1" },
          },
        );
        expect(res.status).toBe(0);

        const state = await readState(path.join(home, ".config", "massa-ai", "install-state.json"));
        expect(JSON.stringify(state.platforms[host].modelProfile)).toBe(JSON.stringify(MODEL_PROFILE_RECORD));
        // Cursor's fallback route is "local", not "file" — see the identical
        // note in the "record shape is identical" test above (AD-017/T6).
        expect(state.platforms[host].installRoute).toBe(host === "cursor" ? "local" : "file");
      },
      TEST_TIMEOUT,
    );
  }
});
