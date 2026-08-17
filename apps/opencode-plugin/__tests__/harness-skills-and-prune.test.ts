/**
 * apps/opencode-plugin/install.sh — IPT-05 (AC-05.1/05.3) and IPT-02 site 4
 * (AC-02.4a's regular-file-survives case, as a bun-level companion to
 * scripts/tests/test-installer-prune-opencode.sh's shell coverage).
 *
 * AC-05.3 requires a BEHAVIOURAL guard — actually running install.sh against
 * a scratch HOME and reading what landed on disk — not a static parse of the
 * `for name in …` literal (that shortcut is explicitly rejected, same as
 * AC-03.4 rejects it for the sibling requirement). This file supplies that
 * guard for opencode; the static cross-check against the generator's
 * constant (AC-05.3a) is scoped to T8, not this file.
 *
 * Uses spawnSync to run install.sh with an overridden HOME (temp dir), same
 * harness pattern as install.test.ts in this directory.
 */

import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const INSTALL_SH = path.resolve(REPO_ROOT, "apps/opencode-plugin/install.sh");

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe("opencode-plugin harness skills (IPT-05, AC-05.1/AC-05.3)", () => {
  test("a scratch-HOME install lands exactly the three harness skill directories", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "mt-opencode-harness-skills-"),
    );
    try {
      const res = spawnSync("bash", [INSTALL_SH, "--user"], {
        encoding: "utf8",
        env: { ...process.env, HOME: tmp },
        cwd: REPO_ROOT,
        timeout: 30000,
      });
      expect(res.status).toBe(0);

      const skillsDir = path.join(tmp, ".config/opencode/skills");
      const entries = (await fs.readdir(skillsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      // Not a scan-and-count of what happened to be present under the
      // bundle's skills/ dir (AC-05.2 rejects deriving the list that way) —
      // an exact-equality assertion against the three named directories.
      expect(entries).toEqual(["massa-ai", "persona-router", "profile"]);

      for (const name of entries) {
        expect(
          await pathExists(path.join(skillsDir, name, "SKILL.md")),
        ).toBe(true);
      }
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("opencode-plugin agent prune ownership (IPT-02 site 4, AC-02.3/AC-02.5)", () => {
  test("a regular file at an owned agent path is never pruned, even across two installs", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "mt-opencode-agent-prune-owner-"),
    );
    try {
      const agentsDir = path.join(tmp, ".config/opencode/agents");
      await fs.mkdir(agentsDir, { recursive: true });
      const regularFile = path.join(agentsDir, "massa-ai-fake-specialist.md");
      const content = "a regular file the prune must never delete";
      await fs.writeFile(regularFile, content);

      // Two installs — the prune runs on every pass, not just the first.
      for (let i = 0; i < 2; i++) {
        const res = spawnSync("bash", [INSTALL_SH, "--user"], {
          encoding: "utf8",
          env: { ...process.env, HOME: tmp },
          cwd: REPO_ROOT,
          timeout: 30000,
        });
        expect(res.status).toBe(0);
      }

      expect(await pathExists(regularFile)).toBe(true);
      expect(await fs.readFile(regularFile, "utf8")).toBe(content);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
