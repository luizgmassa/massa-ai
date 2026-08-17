/**
 * IPT-05 AC-05.3 — behavioural guard for cursor's harness skill bundling.
 *
 * install_bundled_skills (apps/cursor-plugin/install.sh) must install exactly
 * the three harness skills the generator's own constant names
 * (scripts/generate-skill-artifacts.ts:138 —
 * ["massa-ai", "persona-router", "profile"]), not just massa-ai and
 * persona-router. This is deliberately a real run of install.sh against a
 * scratch HOME, not a static parse of the `for name in …` literal — AC-05.3
 * rejects the "read the list rather than run it" shortcut, the same one
 * AC-03.4 rejects for the sibling requirement.
 *
 * It must NOT be satisfied by scanning apps/cursor-plugin/skills/ and
 * installing every directory with a SKILL.md — that directory ships 51
 * entries (49 with a root SKILL.md, one per workflow skill), and
 * install_bundled_skills installs harness skills only; workflow skills reach
 * the user through the command-skill copy loop, a different mechanism
 * entirely (D6).
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const INSTALL_SH = path.resolve(REPO_ROOT, "apps/cursor-plugin/install.sh");

const EXPECTED_HARNESS_SKILLS = ["massa-ai", "persona-router", "profile"];

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mt-cursor-harness-skills-"));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe("cursor-plugin harness skill bundling (IPT-05 AC-05.1, AC-05.3)", () => {
  test("a scratch-HOME install lands exactly the three harness skill directories", async () => {
    // MASSA_AI_SKIP_ARTIFACT_GENERATION=1: this checkout's bundle is already
    // generated and shared with sibling in-flight workers in this worktree —
    // regenerating it here would race their edits.
    const res = spawnSync("bash", [INSTALL_SH, "--user"], {
      encoding: "utf8",
      env: { ...process.env, HOME: tmp, MASSA_AI_SKIP_ARTIFACT_GENERATION: "1" },
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(res.status).toBe(0);

    const harnessSkillsDir = path.join(tmp, ".cursor/skills");
    const entries = (
      await fs.readdir(harnessSkillsDir, { withFileTypes: true })
    )
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    expect(entries).toEqual([...EXPECTED_HARNESS_SKILLS].sort());

    for (const name of EXPECTED_HARNESS_SKILLS) {
      expect(
        await pathExists(path.join(harnessSkillsDir, name, "SKILL.md")),
      ).toBe(true);
    }
  }, 30_000);

  test("uninstall removes all three plugin-owned harness skills, including profile", async () => {
    const install = spawnSync("bash", [INSTALL_SH, "--user"], {
      encoding: "utf8",
      env: { ...process.env, HOME: tmp, MASSA_AI_SKIP_ARTIFACT_GENERATION: "1" },
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(install.status).toBe(0);

    const harnessSkillsDir = path.join(tmp, ".cursor/skills");
    expect(await pathExists(path.join(harnessSkillsDir, "profile"))).toBe(
      true,
    );

    const uninstall = spawnSync("bash", [INSTALL_SH, "--uninstall"], {
      encoding: "utf8",
      env: { ...process.env, HOME: tmp, MASSA_AI_SKIP_ARTIFACT_GENERATION: "1" },
      cwd: REPO_ROOT,
      timeout: 30000,
    });
    expect(uninstall.status).toBe(0);

    for (const name of EXPECTED_HARNESS_SKILLS) {
      expect(await pathExists(path.join(harnessSkillsDir, name))).toBe(false);
    }
  }, 30_000);
});
