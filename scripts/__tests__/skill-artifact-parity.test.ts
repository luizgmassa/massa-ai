/**
 * Skill-bundle parity test (T11/T12, PDO-06, PDO-07).
 *
 * Mirrors subagent-parity.test.ts's shape for scripts/generate-skill-artifacts.ts:
 * the `--check` drift gate must pass against the checked-in bundles, and every
 * bundle must carry a byte-identical SKILL.md for massa-ai + persona-router plus
 * one SKILL.md per skills/agents/<name>/ charter — no symlinks anywhere, since
 * `npm pack` silently drops them (verified empirically, see design.md D2).
 *
 * T4/UGB-13: these bundles are gitignored build output (design.md Component 6) —
 * a `beforeAll` sentinel guard runs first so a checkout that never ran
 * `bun run generate:artifacts` fails loudly with an actionable message instead
 * of every assertion below failing vacuously with a bare ENOENT.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const GEN_SCRIPT = path.join(REPO_ROOT, "scripts/generate-skill-artifacts.ts");

const HOSTS = ["claude", "codex", "cursor", "opencode"] as const;

/**
 * Fails loudly, naming the missing artifact and the fix, instead of letting
 * every downstream assertion in this file fail vacuously against a bare
 * ENOENT (UGB-13).
 * Why: bundles are generated build output now — a fresh/stale checkout has
 *      none until `generate:artifacts` runs once.
 * Impacts: UGB-13, T4; every describe block below.
 * Test: bun test scripts/__tests__/skill-artifact-parity.test.ts
 */
beforeAll(async () => {
  for (const host of HOSTS) {
    const sentinel = path.join(REPO_ROOT, `apps/${host}-plugin/skills/massa-ai/SKILL.md`);
    try {
      await fs.access(sentinel);
    } catch {
      throw new Error(
        `Generated skill bundle missing at ${sentinel} — run 'bun run generate:artifacts' first.`,
      );
    }
  }
});

describe("skill-bundle parity — drift gate (PDO-06 AC2)", () => {
  test("generator --check exits 0 (no drift between skills/ and shipped bundles)", () => {
    const res = spawnSync("bun", ["run", GEN_SCRIPT, "--check"], {
      encoding: "utf8",
      cwd: REPO_ROOT,
      timeout: 60000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("No drift");
  });
});

describe("skill-bundle parity — byte identity (PDO-06 AC7)", () => {
  test.each(HOSTS)("%s: skills/massa-ai/SKILL.md is byte-identical to the source", async (host) => {
    const source = await fs.readFile(path.join(REPO_ROOT, "skills/massa-ai/SKILL.md"));
    const bundled = await fs.readFile(
      path.join(REPO_ROOT, `apps/${host}-plugin/skills/massa-ai/SKILL.md`),
    );
    expect(bundled.equals(source)).toBe(true);
  });

  test.each(HOSTS)("%s: skills/persona-router/SKILL.md is byte-identical to the source", async (host) => {
    const source = await fs.readFile(path.join(REPO_ROOT, "skills/persona-router/SKILL.md"));
    const bundled = await fs.readFile(
      path.join(REPO_ROOT, `apps/${host}-plugin/skills/persona-router/SKILL.md`),
    );
    expect(bundled.equals(source)).toBe(true);
  });

  test.each(HOSTS)("%s: skills/profile/SKILL.md is byte-identical to the source (T15)", async (host) => {
    const source = await fs.readFile(path.join(REPO_ROOT, "skills/profile/SKILL.md"));
    const bundled = await fs.readFile(
      path.join(REPO_ROOT, `apps/${host}-plugin/skills/profile/SKILL.md`),
    );
    expect(bundled.equals(source)).toBe(true);
  });

  test.each(HOSTS)("%s: every skills/agents/<name>/SKILL.md charter is bundled byte-identical", async (host) => {
    const agentsDir = path.join(REPO_ROOT, "skills/agents");
    const names = (await fs.readdir(agentsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const source = await fs.readFile(path.join(agentsDir, name, "SKILL.md"));
      const bundled = await fs.readFile(
        path.join(REPO_ROOT, `apps/${host}-plugin/skills/agents/${name}/SKILL.md`),
      );
      expect(bundled.equals(source)).toBe(true);
    }
  });
});

describe("skill-bundle parity — no symlinks (npm pack drops them silently)", () => {
  async function assertNoSymlinks(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const lst = await fs.lstat(abs);
      expect(lst.isSymbolicLink()).toBe(false);
      if (entry.isDirectory()) await assertNoSymlinks(abs);
    }
  }

  test.each(HOSTS)("%s: skills/ bundle contains zero symlinks", async (host) => {
    await assertNoSymlinks(path.join(REPO_ROOT, `apps/${host}-plugin/skills`));
  });

  test("opencode: lib/opencode-config.cjs is a real file, not a symlink", async () => {
    const lst = await fs.lstat(
      path.join(REPO_ROOT, "apps/opencode-plugin/lib/opencode-config.cjs"),
    );
    expect(lst.isSymbolicLink()).toBe(false);
    expect(lst.isFile()).toBe(true);
  });

  test("opencode: lib/opencode-config.cjs is byte-identical to scripts/lib/opencode-config.cjs", async () => {
    const source = await fs.readFile(path.join(REPO_ROOT, "scripts/lib/opencode-config.cjs"));
    const bundled = await fs.readFile(
      path.join(REPO_ROOT, "apps/opencode-plugin/lib/opencode-config.cjs"),
    );
    expect(bundled.equals(source)).toBe(true);
  });
});
