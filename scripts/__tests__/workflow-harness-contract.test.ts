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
const EXPECTED_WORKFLOW_COUNT = 40;

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
    // Three legitimate holders of the old names: .specs/ is historical
    // record, CHANGELOG.md documents the removal, and THIS FILE carries them
    // as assertion data. Excluding self is required, not cosmetic -- git grep
    // reads tracked files, so the suite passes while uncommitted and fails the
    // moment it is committed.
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
        ":(exclude)scripts/__tests__/workflow-harness-contract.test.ts",
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

  // Isolation Gate (worktree-isolation-gate): the explicit action line, not just
  // the load clause above it. Per-file loop so deleting the line from any single
  // workflow flips exactly one assertion.
  for (const rel of IMPLEMENTATION_WORKFLOWS) {
    test(`${rel} carries the Isolation Gate action line`, async () => {
      const body = await readWorkflow(rel);
      expect(body).toContain("**Isolation Gate — before the first file edit:**");
    });
  }

  test("read-only workflows do NOT carry the Isolation Gate line", async () => {
    const impl = new Set<string>(IMPLEMENTATION_WORKFLOWS);
    const leaked: string[] = [];
    for (const rel of await listWorkflows()) {
      if (impl.has(rel)) continue;
      if ((await readWorkflow(rel)).includes("Isolation Gate — before the first file edit")) {
        leaked.push(rel);
      }
    }
    expect(leaked).toEqual([]);
  });

  test("the Isolation Gate line is byte-identical in all 16 workflows and names its mechanism", async () => {
    // Single-source discipline: the policy lives in implementation-delivery.md;
    // the per-workflow line only invokes it. Drift between copies, or a rewrite
    // that keeps the label but drops Stage 0–1 / evidence recording, fails here.
    const lines = new Set<string>();
    for (const rel of IMPLEMENTATION_WORKFLOWS) {
      const line = (await readWorkflow(rel))
        .split("\n")
        .find((l) => l.includes("Isolation Gate — before the first file edit"));
      expect(line).toBeDefined();
      lines.add(line!);
    }
    expect(lines.size).toBe(1);
    const [gate] = [...lines];
    expect(gate).toContain("`references/implementation-delivery.md` Stage 0–1");
    expect(gate).toContain("record the worktree path + branch");
    expect(gate).toContain("two legal skip reasons, verbatim");
  });

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

  test("the read-only complement is exactly 24 workflows", async () => {
    const all = await listWorkflows();
    expect(all.length - IMPLEMENTATION_WORKFLOWS.length).toBe(24);
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

  test("implementation-delivery.md Stage 1 records isolation evidence and forbids shared-checkout branch switches", async () => {
    // AC4 (worktree-isolation-gate): the cross-session rule the Isolation Gate
    // line invokes. Distinct from agent-orchestration.md's cross-subagent rule.
    const body = await readReference("implementation-delivery.md");
    expect(body).toContain("Record the isolation evidence immediately after creation");
    expect(body).toMatch(/Never switch branches in a\s+checkout another session may share/i);
    expect(body).toMatch(/cross-\*\*session\*\*/);
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

describe("roster: nothing advertises a specialist count other than 18", () => {
  /** The roster size every current-tense claim must agree with. */
  const ROSTER = 18;

  /**
   * A count-shaped claim, matched within ONE line.
   *
   * The previous form was a `git grep -E` for three literal spellings of "16".
   * It banned exactly the strings it was written against and nothing else, so
   * `docs/ONBOARDING.md` sat at "16 sub-agent specialists" through a whole
   * release: the hyphen in `sub-agent` defeated every alternative in the
   * pattern. `CLAUDE.md` said 15 and `.claude-plugin/marketplace.json` said 12
   * for the same reason — a guard against one wrong number cannot notice a
   * different wrong number. See
   * .specs/features/skills-directive-dedup/spec.md SDD-08.
   *
   * Line-scoped deliberately: a pattern allowing `\s+` between the digits and
   * the noun matches across a newline and pairs an unrelated `command_count=0`
   * with the word "specialist" forty lines later.
   */
  const COUNT_CLAIM = /(\d+)\s+(?:reusable\s+)?(?:sub-?agent\s+)?[Ss]pecialists?\b/;

  /**
   * Statements that narrate a PAST roster size and are correct as written.
   *
   * An allowlist rather than a cleverer regex: "is this sentence historical?"
   * is a judgment a pattern cannot make, and encoding it as one would either
   * leak real stale counts or fail on correct prose. Each entry is a decision
   * with a reason, and a new one forces that decision to be made again.
   */
  const HISTORICAL = [
    // OpenCode's `mode: subagent` behaviour, described as it was at the time.
    "made the 12 specialists impossible to select by hand",
    "made the 12 specialists unselectable by hand",
    // The frozen parity baseline predates judge/meta-judge, by construction.
    "only ever names the 15 specialists that existed there",
    // scripts/__tests__/fixtures/pyts-golden/lessons.json and
    // lessons-store-snapshot.json are FROZEN inputs: pyts-golden.test.ts
    // imports them (`with { type: "json" }` / `{ type: "text" }`) and writes
    // them into a temp root, so their text IS the fixture and editing it
    // breaks the golden comparison. The sentences narrate lesson L-007 -- a
    // past 15 -> 17 roster change that went red in CI -- and are correct as
    // written. Two substrings, because the store keeps a normalized `key`
    // beside the prose `text`. (designer-agent, D-8.)
    "A registry-count change (15→17 specialists)",
    "a registry count change 15 17 specialists",
  ];

  const SELF = "scripts/__tests__/workflow-harness-contract.test.ts";

  test(`no tracked source, doc, or installer claims a roster other than ${ROSTER}`, async () => {
    const proc = Bun.spawn(["git", "ls-files"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const files = (await new Response(proc.stdout).text())
      .split("\n")
      .filter(Boolean)
      // .specs/ is historical record and CHANGELOG.md documents each change;
      // this file carries the counts as assertion data.
      .filter((f) => !f.startsWith(".specs/") && f !== "CHANGELOG.md" && f !== SELF);

    const offenders: string[] = [];
    for (const rel of files) {
      let body: string;
      try {
        body = await fs.readFile(path.join(REPO_ROOT, rel), "utf8");
      } catch {
        continue; // binary or unreadable
      }
      body.split(/\r?\n/).forEach((line, i) => {
        if (HISTORICAL.some((h) => line.includes(h))) return;
        const m = COUNT_CLAIM.exec(line);
        if (m && m[1] !== String(ROSTER)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  test("the roster scan reads a real file list", async () => {
    // Guard the guard: an empty list yields no offenders trivially.
    const proc = Bun.spawn(["git", "ls-files"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const files = (await new Response(proc.stdout).text()).split("\n").filter(Boolean);
    expect(files.length).toBeGreaterThan(500);
  });

  test("the scan fires on a wrong count in any spelling", () => {
    // The three spellings the old literal pattern missed.
    for (const text of [
      "16 sub-agent specialists",
      "15 specialists",
      "12 subagent specialists",
      "9 reusable sub-agent specialists",
    ]) {
      const m = COUNT_CLAIM.exec(text);
      expect(m, `no match for ${text}`).not.toBeNull();
      expect(m![1]).not.toBe(String(ROSTER));
    }
  });

  test("a correct count in any spelling passes", () => {
    for (const text of [
      "18 specialists",
      "18 subagent specialists",
      "18 sub-agent specialists",
      "18 reusable sub-agent specialists",
    ]) {
      expect(COUNT_CLAIM.exec(text)![1]).toBe(String(ROSTER));
    }
  });

  test("the shell installers advertise 18", async () => {
    for (const rel of ["install.sh", "scripts/install-agents.sh"]) {
      const body = await fs.readFile(path.join(REPO_ROOT, rel), "utf8");
      expect(body).toContain("18 subagent specialists");
    }
  });
});

// ── 7. Reuse scan mandate, uniform across implementation workflows ────────
//
// .specs/features/workflow-reuse-naming-figma/ — REUSE-02, GATE-01, GATE-05.
// Committed red-by-design (T5, worktree-isolation-gate T2 precedent): the
// canonical action line does not exist in any of the 16 files yet — T6 lands
// it in the same session and turns this group green.

describe("reuse scan: uniform mandate across the 16 implementation workflows", () => {
  /** The uniform action line every implementation workflow must carry verbatim. */
  const REUSE_SCAN_MARKER = "**Reuse Scan — before writing new implementation code:**";
  const REUSE_SCAN_LINE =
    "**Reuse Scan — before writing new implementation code:** run the mandatory reuse scan per `references/code-reuse-scan.md` (separate read-only subagents; the reuse map's use/extend/new decisions are consumed before new code is planned or written) — or record its inline-fallback reason, verbatim.";

  for (const rel of IMPLEMENTATION_WORKFLOWS) {
    test(`${rel} carries the Reuse Scan action line`, async () => {
      const body = await readWorkflow(rel);
      expect(body).toContain(REUSE_SCAN_LINE);
    });
  }

  test("the Reuse Scan action line is byte-identical in all 16 workflows", async () => {
    const lines = new Set<string>();
    for (const rel of IMPLEMENTATION_WORKFLOWS) {
      const line = (await readWorkflow(rel))
        .split("\n")
        .find((l) => l.includes(REUSE_SCAN_MARKER));
      expect(line).toBeDefined();
      lines.add(line!);
    }
    expect(lines.size).toBe(1);
  });
});

// ── 8. Naming-standards load, present in every implementation workflow ────
//
// REUSE-independent (NAME-02, GATE-01, GATE-05). Committed red-by-design:
// 11 of the 16 files are missing the literal today (measured directly by
// grep against the live tree ahead of writing this assertion — the design
// doc's own evidence undercounted this at 10; spec-driven.md was also
// missing the literal in its own file body, not merely "via refs"). T6 adds
// the load bullet to all 11 and turns this group green.

describe("naming standards: loaded by every implementation workflow", () => {
  for (const rel of IMPLEMENTATION_WORKFLOWS) {
    test(`${rel} loads references/naming-standards.md`, async () => {
      const body = await readWorkflow(rel);
      expect(body).toContain("references/naming-standards.md");
    });
  }
});

// ── 9. New references for reuse scan, Figma wiring, design abstraction ────
//
// REUSE-01, FIGMA-01..08, ABST-01. Green from T1-T3; no red-by-design here.

describe("new references exist on disk", () => {
  const NEW_REFERENCES = [
    "code-reuse-scan.md",
    "figma-wiring.md",
    "design-implementation.md",
  ] as const;

  for (const name of NEW_REFERENCES) {
    test(`references/${name} exists`, async () => {
      expect(await exists(path.join(REFERENCES_DIR, name))).toBe(true);
    });
  }
});

// ── 10. Hook-chain ordering, guarded to activate once Phase 2 lands ───────
//
// design D11a / plan-critic F1: presence-only sensors cannot catch a future
// reorder or drop of the hook chain. These two assertions are written ahead
// of the hooks they check (Phase 2, T7-T10) so they pass vacuously today and
// bite the moment those hooks land, rather than being added only after the
// fact where they could not have caught a first-pass mistake. REUSE-03 +
// FIGMA-02/03.

describe("hook-chain ordering (guarded — activates when Phase 2 hook markers land)", () => {
  test("figma-pre-analysis.md's Stage 1 figma-wiring pointer indexes before its Stage 2 pointer, once both exist", async () => {
    const body = await readReference("figma-pre-analysis.md");
    const stage1Start = body.indexOf("## Stage 1");
    const stage2Start = body.indexOf("## Stage 2");
    expect(stage1Start).toBeGreaterThan(-1);
    expect(stage2Start).toBeGreaterThan(stage1Start);

    const stage1Section = body.slice(stage1Start, stage2Start);
    const stage2Section = body.slice(stage2Start);
    const stage1Pointer = stage1Section.indexOf("references/figma-wiring.md");
    const stage2Pointer = stage2Section.indexOf("references/figma-wiring.md");
    if (stage1Pointer === -1 || stage2Pointer === -1) {
      // T10 has not landed the conditional per-link-file / wiring-table
      // pointers yet; this activates once both stage sections reference
      // figma-wiring.md.
      return;
    }
    // Pointer IDENTITY, not just containment: each stage's pointer must be
    // the pointer that belongs to that stage. Stage 1 owns per-link file
    // creation; Stage 2 owns wiring-table population. A content swap of the
    // two pointer paragraphs (each still containing the figma-wiring.md
    // literal) must fail here.
    expect(stage1Section).toContain("create one file per supplied Figma link");
    expect(stage1Section).not.toContain("wiring table as that slice's retrieval");
    expect(stage2Section).toContain("wiring table");
    expect(stage2Section).not.toContain("create one file per supplied Figma link");
  });

  test("naming-standards.md keeps its Language rule block (NAME-01 content sensor)", async () => {
    const body = await readReference("naming-standards.md");
    expect(body).toContain("## Language");
    expect(body).toMatch(/Convert any non-English source term to English/);
    expect(body).toMatch(/Portuguese is the primary case/);
  });

  test("the spec-driven design phase guide carries the English-conversion clause (NAME-03)", async () => {
    const body = await readReference("spec-driven/design.md");
    expect(body).toContain("English-conversion rule from `references/naming-standards.md`");
  });

  test("spec-driven phase-guide hooks stay pointers, not restated tables, once Phase 2 lands them", async () => {
    const PHASE_GUIDES = [
      "spec-driven/specify.md",
      "spec-driven/design.md",
      "spec-driven/tasks.md",
      "spec-driven/execute.md",
    ] as const;

    for (const rel of PHASE_GUIDES) {
      const body = await readReference(rel);
      if (!body.includes("references/figma-wiring.md")) continue; // T8 not landed yet
      expect(body).not.toContain("| Number | Figma node id(s) |");
    }
  });

  test("spec-driven.md's reuse-scan clause indexes after the Specify step and before the Design/Tasks decision steps (REUSE-03)", async () => {
    const body = await readWorkflow("spec-driven.md");
    const specifyStep = body.indexOf("Run `Specify` with `references/spec-driven/specify.md`");
    const reuseClause = body.indexOf("references/code-reuse-scan.md");
    const designDecision = body.indexOf("Decide whether `Design` is required");
    const tasksDecision = body.indexOf("Decide whether `Tasks` is required");
    expect(specifyStep).toBeGreaterThan(-1);
    expect(reuseClause).toBeGreaterThan(specifyStep);
    expect(designDecision).toBeGreaterThan(reuseClause);
    expect(tasksDecision).toBeGreaterThan(designDecision);
  });
});

// ── 11. Plan Challenge Gate coverage ──────────────────────────────────────
//
// .specs/features/designer-agent/ — ADRG-01, ADRG-02.
//
// `skills/AGENTS.md` names the workflows that take the full Plan Challenge
// Gate. `workflows/adr.md` was named there and carried no gate step at all,
// and `workflows/refactor.md` carried none either — the policy reached both
// only if the orchestrator recalled the bootstrap list unaided. Every other
// workflow-side contract in this repo is inline in its own file for exactly
// that reason (references/agent-orchestration.md: "Every dispatch block in a
// workflow carries the prefixed name inline so dispatch never depends on this
// file being loaded").
//
// The list is PARSED from the policy sentence, never hardcoded here. A
// hardcoded copy would need the same edit the workflow needs, by the same
// person, in the same commit — so it could not catch the next omission. The
// policy line is the population.

describe("plan challenge: every full-gate workflow carries the gate step", () => {
  const REGISTRY = path.join(REPO_ROOT, "skills", "AGENTS.md");
  const MARKER = "Load full `workflows/the-fool.md` when the workflow is";

  /**
   * Backtick-quoted workflow names from the policy sentence, up to its first
   * `;` (after which the sentence lists risk domains, not workflows).
   * Newline-tolerant: the sentence wraps across lines in the source.
   */
  async function fullGateWorkflows(): Promise<string[]> {
    const body = await fs.readFile(REGISTRY, "utf8");
    const start = body.indexOf(MARKER);
    expect(start, `policy sentence not found in skills/AGENTS.md — marker: ${MARKER}`).toBeGreaterThan(-1);
    const rest = body.slice(start + MARKER.length);
    const clause = rest.slice(0, rest.indexOf(";")).replace(/\s+/g, " ");
    return [...clause.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]!);
  }

  test("the parsed population is real, not a vacuous empty list", async () => {
    // Guard the guard. A reworded policy sentence that yields [] or a partial
    // parse would make every assertion below pass by matching nothing.
    const names = await fullGateWorkflows();
    expect(names.length).toBeGreaterThanOrEqual(6);
    expect(names).toContain("adr");
    expect(names).toContain("refactor");
  });

  test("every named workflow exists on disk", async () => {
    const names = await fullGateWorkflows();
    const onDisk = new Set(await listWorkflows());
    const missing = names.filter((n) => !onDisk.has(`${n}.md`));
    expect(missing).toEqual([]);
  });

  test("every named workflow runs the Plan Challenge Gate", async () => {
    const names = await fullGateWorkflows();
    const without: string[] = [];
    for (const name of names) {
      const body = await readWorkflow(`${name}.md`);
      if (!/Plan Challenge (lite )?[Gg]ate/.test(body)) without.push(`${name}.md`);
    }
    expect(without).toEqual([]);
  });
});

// ── 12. Designer dispatch: presence and wording uniformity ────────────────
//
// .specs/features/designer-agent/ — DSG-05, DSG-06.
//
// Added after independent verification: two mutations survived every gate in
// the suite. Removing the whole `massa-ai-designer` block from one of the seven
// workflows was caught by NOTHING (the duplication ceiling shifted as a side
// effect of the line-window moving, which is not a check), and rewording one
// block's `trigger:` so the seven disagree was caught by nothing at all.
//
// The design named that drift risk and closed it with a one-time manual grep.
// A grep run once is not a sensor — it cannot fail on the edit that comes after
// it. This group is that grep, committed.
//
// Both directions, in the shape group 4 already uses for IMPLEMENTATION_WORKFLOWS:
// exactly these seven carry the block, and the trigger line is byte-identical
// across all of them. Uniformity is load-bearing, not cosmetic — the trigger
// sentence is what states the dispatch is mandatory-on-condition, so one file
// drifting to weaker wording silently makes it advisory there.

describe("designer dispatch: exactly 7 workflows, one wording", () => {
  /**
   * The screen-capable workflows (spec A1). Hardcoded deliberately, unlike
   * ADRG-02's parsed list: there is no policy sentence enumerating these, and
   * the point of the check is that the set cannot change silently. Adding an
   * eighth screen workflow SHOULD require editing this list.
   */
  const SCREEN_WORKFLOWS = [
    "design.md",
    "feature.md",
    "general.md",
    "implementation/implementation-fix.md",
    "mobile-figma/mobile-figma-audit.md",
    "mobile-figma/mobile-figma-fix.md",
    "spec-driven.md",
  ] as const;

  const DISPATCH_HEADER = "> **Dispatch: `massa-ai-designer`**";
  const TRIGGER_PREFIX = "> - trigger: the task creates or modifies a user-facing screen";

  test("each of the 7 carries the designer dispatch block", async () => {
    const without: string[] = [];
    for (const rel of SCREEN_WORKFLOWS) {
      const body = await readWorkflow(rel);
      if (!body.includes(DISPATCH_HEADER)) without.push(rel);
    }
    expect(without).toEqual([]);
  });

  test("no OTHER workflow carries it", async () => {
    // Negative control: without this, adding the block everywhere would pass.
    const extra: string[] = [];
    for (const rel of await listWorkflows()) {
      if ((SCREEN_WORKFLOWS as readonly string[]).includes(rel)) continue;
      const body = await readWorkflow(rel);
      if (body.includes(DISPATCH_HEADER)) extra.push(rel);
    }
    expect(extra).toEqual([]);
  });

  test("the trigger line is byte-identical across all 7", async () => {
    const seen = new Map<string, string[]>();
    for (const rel of SCREEN_WORKFLOWS) {
      const line = (await readWorkflow(rel))
        .split(/\r?\n/)
        .find((l) => l.startsWith(TRIGGER_PREFIX));
      // A missing trigger line is its own failure, distinct from a divergent one.
      expect(line, `${rel} has no designer trigger line`).toBeDefined();
      const key = line!.trim();
      seen.set(key, [...(seen.get(key) ?? []), rel]);
    }
    // Guard the guard: 7 files must have been read, not 0.
    expect([...seen.values()].flat().length).toBe(SCREEN_WORKFLOWS.length);
    expect([...seen.keys()].length, `divergent trigger wording: ${JSON.stringify([...seen.entries()], null, 1)}`).toBe(1);
  });
});

// ── 13. Nesting prohibition retirement (STI-04 / S6, S7) ──────────────────
//
// .specs/features/subagent-tool-inheritance/spec.md STI-04. The blanket
// "never spawn subagents" direction is retired from every reference that
// carried it in different words. Swept as a class -- a spawn verb followed
// (within a couple of words) by a "sub-...agent(s)" noun -- rather than any
// one literal phrase, because a literal-phrase sweep for the charter wording
// missed `references/spec-driven/sub-agents.md:70` ("It does NOT spawn
// further sub-agents."), caught only by re-enumerating the class. See
// design.md Verification Design, sensors S6 and S7.

describe("nesting prohibition retirement: references carry no spawn prohibition", () => {
  const SPAWN_PROHIBITION_CLASS =
    /\bspawn(?:s|ing|ed)?\s+(?:\w+\s+){0,2}(?:sub-?){1,3}agents?\b/i;

  /** Every .md file under skills/massa-ai/references/, recursively. */
  async function referenceMarkdownFiles(): Promise<string[]> {
    const out: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.name.endsWith(".md")) out.push(full);
      }
    }
    await walk(REFERENCES_DIR);
    return out.sort();
  }

  test("no file under references/ contains a spawn prohibition of any shape (S6)", async () => {
    const files = await referenceMarkdownFiles();
    expect(files.length).toBeGreaterThan(20); // guard the guard
    const offenders: string[] = [];
    for (const file of files) {
      const body = await fs.readFile(file, "utf8");
      if (SPAWN_PROHIBITION_CLASS.test(body)) {
        offenders.push(path.relative(REPO_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("spec-driven/sub-agents.md still states the batch-worker sequential-execution rule (S7)", async () => {
    const body = await readReference("spec-driven/sub-agents.md");
    expect(body).toContain(
      "Execution is strictly sequential within and across batches — there is no intra-phase or intra-batch parallelism.",
    );
    // The rule now lives under a retitled heading, not the retired "No
    // nesting:" label -- both directions are asserted so a heading revert
    // without dropping the sentence still fails here.
    expect(body).toContain("**Sequential execution:**");
    expect(body).not.toContain("**No nesting:**");
  });
});
