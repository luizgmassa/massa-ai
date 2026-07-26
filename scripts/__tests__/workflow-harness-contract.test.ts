/**
 * Workflow harness contract gate.
 *
 * Locks the invariants introduced by .specs/features/workflow-harness-overhaul/.
 * Each group below discriminates against one way the harness silently rots:
 *
 *   1. Removal completeness — the chat-restart / context-handoff surface is gone
 *      from disk, and no tracked source still points at it.
 *   2. Surgical negative control — long-session and the MCP handoff_* tools
 *      SURVIVED. A blunt "delete everything named handoff" would fail here.
 *   3. Universal intake — every workflow on disk loads project-context. The set
 *      is derived from the filesystem, so a NEW workflow cannot skip it.
 *   4. Mutation-scoped references — exactly the 16 implementation workflows load
 *      the delivery/annotation/root-cause references, and the 19 read-only ones
 *      provably do NOT. Both directions are asserted; a one-line deletion in any
 *      single workflow flips exactly one assertion.
 *   5. Invariant correctness — not that the references EXIST, but that the
 *      decisions they encode still say what was decided: the circling threshold
 *      is two, merge requires approval, isolation has no size exemption, the
 *      rationale block has all three fields, precedence puts the nearest
 *      ancestor above the repo root. A reference shipping the wrong threshold
 *      passes a presence check and fails this one.
 *   6. Roster count — nothing anywhere still advertises 16 specialists,
 *      including the two shell installers, which have no other gate.
 *
 * `bun run test:scripts` runs this file; CI runs that script.
 */

import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const SKILL_DIR = path.join(REPO_ROOT, "skills", "massa-ai");
const WORKFLOWS_DIR = path.join(SKILL_DIR, "workflows");
const REFERENCES_DIR = path.join(SKILL_DIR, "references");

/** Total workflow files expected after the overhaul removed three routes. */
const EXPECTED_WORKFLOW_COUNT = 35;

/**
 * The workflows that mutate the repository. These, and only these, carry the
 * delivery / annotation / root-cause contract. Paths are relative to
 * `skills/massa-ai/workflows/` and use forward slashes on every platform.
 */
const IMPLEMENTATION_WORKFLOWS = [
  "architecture/architecture-fix.md",
  "bugs/bugs-fix.md",
  "code-quality/code-quality-fix.md",
  "debug.md",
  "design.md",
  "feature.md",
  "general.md",
  "implementation/implementation-fix.md",
  "maestro/maestro-fix.md",
  "maestro/maestro.md",
  "mobile-figma/mobile-figma-fix.md",
  "refactor.md",
  "requirements/requirements-fix.md",
  "security/security-fix.md",
  "spec-driven.md",
  "tests/tests-fix.md",
] as const;

/** References every implementation workflow must load before mutating. */
const MUTATION_REFERENCES = [
  "references/implementation-delivery.md",
  "references/code-annotation.md",
  "references/root-cause-scripts.md",
] as const;

/** Paths deleted by the overhaul, relative to the repo root. */
const REMOVED_PATHS = [
  "skills/massa-ai/workflows/restart-save.md",
  "skills/massa-ai/workflows/restart-load.md",
  "skills/massa-ai/workflows/agent-handoff.md",
  "skills/massa-ai/references/restart-state.md",
  "skills/massa-ai/references/handoff-package.md",
  "skills/agents/handoff-writer",
  "apps/claude-plugin/agents/massa-ai-handoff-writer.md",
  "apps/codex-plugin/agents/massa-ai-handoff-writer.toml",
  "apps/cursor-plugin/agents/massa-ai-handoff-writer.md",
  "apps/opencode-plugin/agents/massa-ai-handoff-writer.md",
] as const;

/** Route names that must not appear in any live source file. */
const REMOVED_ROUTE_TOKENS = [
  "restart-save",
  "restart-load",
  "agent-handoff",
  "handoff-writer",
  "handoff-package",
  "restart-state",
] as const;

/**
 * Recursively lists workflow files under `skills/massa-ai/workflows/`.
 *
 * Derived from disk rather than hardcoded so a workflow added later is force-
 * enrolled in the intake contract instead of silently exempt.
 *
 * @returns Repo-relative-to-workflows paths with forward slashes, sorted.
 */
async function listWorkflows(): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".md")) {
        out.push(path.relative(WORKFLOWS_DIR, full).split(path.sep).join("/"));
      }
    }
  }
  await walk(WORKFLOWS_DIR);
  return out.sort();
}

/**
 * Reads a workflow file.
 *
 * @param rel - Path relative to `skills/massa-ai/workflows/`.
 */
function readWorkflow(rel: string): Promise<string> {
  return fs.readFile(path.join(WORKFLOWS_DIR, rel), "utf8");
}

/**
 * Reads one of the harness references.
 *
 * @param name - Bare file name inside `skills/massa-ai/references/`.
 */
function readReference(name: string): Promise<string> {
  return fs.readFile(path.join(REFERENCES_DIR, name), "utf8");
}

/** @returns true when the path exists on disk (file or directory). */
async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

// ── 1. Removal completeness ───────────────────────────────────────────────

describe("removal: the chat-restart and context-handoff surface is gone", () => {
  for (const rel of REMOVED_PATHS) {
    test(`${rel} does not exist`, async () => {
      expect(await exists(path.join(REPO_ROOT, rel))).toBe(false);
    });
  }

  test("no live source references a removed route", async () => {
    // .specs/ is historical record and CHANGELOG.md documents the removal
    // itself; both legitimately keep the old names.
    const proc = Bun.spawn(
      [
        "git",
        "grep",
        "-l",
        "-E",
        REMOVED_ROUTE_TOKENS.join("|"),
        "--",
        ".",
        ":(exclude).specs",
        ":(exclude)CHANGELOG.md",
      ],
      { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
    );
    const hits = (await new Response(proc.stdout).text())
      .split("\n")
      .filter(Boolean);
    expect(hits).toEqual([]);
  });
});

// ── 2. Negative control: the removal was surgical ─────────────────────────

describe("survival: compaction and the MCP handoff tools were not collateral", () => {
  test("workflows/long-session.md still exists and owns the Session Guide", async () => {
    const body = await readWorkflow("long-session.md");
    expect(body).toContain("Session Guide");
  });

  test("references/mcp-tools.md still documents all four handoff_* tools", async () => {
    const body = await readReference("mcp-tools.md");
    for (const tool of [
      "handoff_begin",
      "handoff_accept",
      "handoff_cancel",
      "handoff_list_pending",
    ]) {
      expect(body).toContain(tool);
    }
  });
});

// ── 3. Universal project-context intake ───────────────────────────────────

describe("intake: every workflow loads references/project-context.md", () => {
  test(`exactly ${EXPECTED_WORKFLOW_COUNT} workflow files exist`, async () => {
    expect((await listWorkflows()).length).toBe(EXPECTED_WORKFLOW_COUNT);
  });

  test("no workflow is missing the intake line", async () => {
    const missing: string[] = [];
    for (const rel of await listWorkflows()) {
      if (!(await readWorkflow(rel)).includes("references/project-context.md")) {
        missing.push(rel);
      }
    }
    expect(missing).toEqual([]);
  });
});

// ── 4. Mutation-scoped references, asserted in both directions ────────────

describe("delivery scope: only mutating workflows carry the delivery contract", () => {
  test("the declared implementation set matches files that exist on disk", async () => {
    const onDisk = new Set(await listWorkflows());
    const phantom = IMPLEMENTATION_WORKFLOWS.filter((w) => !onDisk.has(w));
    expect(phantom).toEqual([]);
  });

  for (const rel of IMPLEMENTATION_WORKFLOWS) {
    test(`${rel} loads all three mutation references`, async () => {
      const body = await readWorkflow(rel);
      const absent = MUTATION_REFERENCES.filter((r) => !body.includes(r));
      expect(absent).toEqual([]);
    });
  }

  test("read-only workflows do NOT load the delivery reference", async () => {
    const impl = new Set<string>(IMPLEMENTATION_WORKFLOWS);
    const leaked: string[] = [];
    for (const rel of await listWorkflows()) {
      if (impl.has(rel)) continue;
      if (
        (await readWorkflow(rel)).includes("references/implementation-delivery.md")
      ) {
        leaked.push(rel);
      }
    }
    expect(leaked).toEqual([]);
  });

  test("the read-only complement is exactly 19 workflows", async () => {
    const all = await listWorkflows();
    expect(all.length - IMPLEMENTATION_WORKFLOWS.length).toBe(19);
  });
});

// ── 5. Invariant correctness of the encoded decisions ─────────────────────

describe("invariants: the references still encode the decisions that were made", () => {
  test("root-cause-scripts.md sets the circling threshold at two, not three", async () => {
    const body = await readReference("root-cause-scripts.md");
    expect(body).toMatch(/two consecutive failed fix attempts/i);
    expect(body).toMatch(/Two is the threshold, not three/i);
  });

  test("root-cause-scripts.md forbids more code reading as the next action", async () => {
    const body = await readReference("root-cause-scripts.md");
    expect(body).toContain("Forbidden Next Actions");
    expect(body).toMatch(/Reading more source files/i);
    expect(body).toMatch(/real runtime data/i);
  });

  test("implementation-delivery.md forbids merging without user approval", async () => {
    const body = await readReference("implementation-delivery.md");
    expect(body).toMatch(/merge is never automatic/i);
    expect(body).toMatch(
      /Do not run `gh pr merge` without explicit user approval/i,
    );
  });

  test("implementation-delivery.md grants worktree isolation no size exemption", async () => {
    const body = await readReference("implementation-delivery.md");
    expect(body).toMatch(/no\s+size\s+exemption/i);
    expect(body).toMatch(/only two legal skip reasons/i);
  });

  test("implementation-delivery.md documents the gh-absent degraded path", async () => {
    const body = await readReference("implementation-delivery.md");
    expect(body).toContain("Degraded Paths");
    expect(body).toMatch(/not installed or not authenticated/i);
  });

  test("code-annotation.md keeps all three rationale fields", async () => {
    const body = await readReference("code-annotation.md");
    for (const field of ["// Why:", "// Impacts:", "// Test:"]) {
      expect(body).toContain(field);
    }
  });

  test("code-annotation.md maps every language it claims to map", async () => {
    const body = await readReference("code-annotation.md");
    for (const lang of [
      "Java",
      "Kotlin",
      "TypeScript",
      "Python",
      "Swift",
      "Rust",
      "Go",
      "C#",
      "Ruby",
      "PHP",
      "Shell",
      "SQL",
    ]) {
      expect(body).toContain(`| ${lang}`);
    }
  });

  test("code-annotation.md requires a regression test that fails first", async () => {
    const body = await readReference("code-annotation.md");
    expect(body).toMatch(/fails before the fix/i);
    expect(body).toMatch(/never been red proves nothing/i);
  });

  test("project-context.md puts the nearest ancestor above the repo root", async () => {
    const body = await readReference("project-context.md");
    const nearest = body.indexOf("Nearest-ancestor");
    const root = body.indexOf("Repo-root");
    expect(nearest).toBeGreaterThan(-1);
    expect(root).toBeGreaterThan(-1);
    expect(nearest).toBeLessThan(root);
  });

  test("project-context.md carries the dedupe guard and the ignore contract", async () => {
    const body = await readReference("project-context.md");
    expect(body).toContain("Dedupe Guard");
    expect(body).toMatch(/once per conversation/i);
    expect(body).toMatch(/node_modules/);
  });
});

// ── 6. Roster count ───────────────────────────────────────────────────────

describe("roster: nothing still advertises 16 specialists", () => {
  test("no tracked source, doc, or shell installer says 16 specialists", async () => {
    const proc = Bun.spawn(
      [
        "git",
        "grep",
        "-l",
        "-E",
        "16 subagent|16 [Ss]pecialist|16 reusable sub-agent",
        "--",
        ".",
        ":(exclude).specs",
        ":(exclude)CHANGELOG.md",
      ],
      { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
    );
    const hits = (await new Response(proc.stdout).text())
      .split("\n")
      .filter(Boolean);
    expect(hits).toEqual([]);
  });

  test("the shell installers advertise 15", async () => {
    for (const rel of ["install.sh", "scripts/install-agents.sh"]) {
      const body = await fs.readFile(path.join(REPO_ROOT, rel), "utf8");
      expect(body).toContain("15 subagent specialists");
    }
  });
});
