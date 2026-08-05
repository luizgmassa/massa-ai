/**
 * Durable sensors for the generated-bundles contract (AD-016), added as
 * verification fix tasks for untracked-generated-bundles (UGB-01, UGB-17).
 *
 * Two mutations survived the feature's discrimination sensor without these:
 *  - deleting root `pretest:coverage` (the ONLY generation guard on the
 *    coverage path — check-coverage.ts invokes per-package `bun test`
 *    directly, bypassing every other pre-script), and
 *  - deleting a `.gitignore` managed-subtree entry (re-tracking generated
 *    output with every gate still green).
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..", "..");

describe("generation pre-script wiring (UGB-17)", () => {
  const scripts = (
    JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }
  ).scripts;

  // Every root test entry point that can reach bundle-reading suites must
  // chain generation. `pretest:coverage` is load-bearing on its own: the
  // coverage path has no other guard.
  for (const name of ["pretest:coverage", "pretest:scripts", "pretest:plugins"]) {
    test(`root ${name} chains generate:artifacts`, () => {
      expect(scripts[name]).toBe("bun run generate:artifacts");
    });
  }

  test("generate:artifacts runs both generators", () => {
    expect(scripts["generate:artifacts"]).toContain("generate-skill-artifacts.ts");
    expect(scripts["generate:artifacts"]).toContain("generate-subagent-artifacts.ts");
  });

  test("opencode package pretest chains both generators (turbo test path)", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, "apps", "opencode-plugin", "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.pretest).toContain("generate-skill-artifacts.ts");
    expect(pkg.scripts.pretest).toContain("generate-subagent-artifacts.ts");
  });
});

describe("managed subtrees stay gitignored (UGB-01)", () => {
  // Behavior-level, not text-level: `git check-ignore` verifies the ignore
  // decision itself, so any edit that stops covering a subtree fails here
  // regardless of how the .gitignore is formatted.
  const ignoredRepresentatives = [
    "apps/claude-plugin/skills/massa-ai/SKILL.md",
    "apps/codex-plugin/skills/persona-router/SKILL.md",
    "apps/cursor-plugin/skills/profile/SKILL.md",
    "apps/opencode-plugin/skills/agents/investigator/SKILL.md",
    "apps/claude-plugin/agents/massa-ai-builder.md",
    "apps/opencode-plugin/agent-profiles/work/massa-ai-builder.md",
    "apps/codex-plugin/hooks/massa-ai-hook",
    "apps/cursor-plugin/hooks/massa-ai-hook",
    "apps/opencode-plugin/lib/opencode-config.cjs",
  ];

  const trackedSurvivors = [
    "apps/codex-plugin/skills/def.md",
    "apps/cursor-plugin/skills/def/SKILL.md",
    "apps/codex-plugin/hooks/hooks.json",
    "apps/cursor-plugin/hooks/hooks.json",
    "apps/claude-plugin/hooks/massa-ai-hook.ts",
  ];

  const isIgnored = (relPath: string): boolean => {
    try {
      execFileSync("git", ["check-ignore", "-q", relPath], { cwd: repoRoot });
      return true;
    } catch {
      return false;
    }
  };

  for (const rel of ignoredRepresentatives) {
    test(`ignored: ${rel}`, () => {
      expect(isIgnored(rel)).toBe(true);
    });
  }

  for (const rel of trackedSurvivors) {
    test(`NOT ignored (hand-authored): ${rel}`, () => {
      expect(isIgnored(rel)).toBe(false);
    });
  }

  test("no generated bundle file is tracked", () => {
    const out = execFileSync(
      "git",
      [
        "ls-files",
        "apps/claude-plugin/skills/massa-ai",
        "apps/codex-plugin/skills/persona-router",
        "apps/cursor-plugin/skills/profile",
        "apps/opencode-plugin/skills/agents",
        "apps/claude-plugin/agents",
        "apps/codex-plugin/agents",
        "apps/cursor-plugin/agents",
        "apps/opencode-plugin/agents",
        "apps/claude-plugin/agent-profiles",
        "apps/codex-plugin/agent-profiles",
        "apps/cursor-plugin/agent-profiles",
        "apps/opencode-plugin/agent-profiles",
        "apps/codex-plugin/hooks/massa-ai-hook",
        "apps/cursor-plugin/hooks/massa-ai-hook",
        "apps/opencode-plugin/lib/opencode-config.cjs",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });
});
