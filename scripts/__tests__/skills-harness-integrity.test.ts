/**
 * Skills-harness integrity gate.
 *
 * Each describe block below discriminates against exactly one defect class that
 * shipped silently before this test existed (see
 * .specs/features/skills-harness-audit/audit-report.md):
 *
 *   1. Dispatch resolution  — workflows named bare roles (`investigator`) while
 *      every host registers `massa-ai-investigator`, so no dispatch resolved.
 *   2. No phantom roles     — `plan-critic` was mandated by the Plan Challenge
 *      gate with Charter = "role-based (no charter)" and no artifact anywhere.
 *   3. Policy single-source — the Plan Challenge Policy existed in two copies
 *      (root AGENTS.md vs skills/AGENTS.md) with opposite gate rules.
 *   4. Reference integrity  — dead relative links inside skills/.
 *   5. Router table <-> disk — router listed workflows/references that no longer
 *      matched the tree.
 *   6. Charter <-> artifact permission — charters said `read-only` while the
 *      shipped artifact granted Write/Edit.
 *
 * `bun run test:scripts` runs this file; CI runs that script.
 */

import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const SKILLS_DIR = path.join(REPO_ROOT, "skills");
const ROUTER = path.join(SKILLS_DIR, "massa-ai", "SKILL.md");
const AGENT_ORCHESTRATION = path.join(
  SKILLS_DIR,
  "massa-ai",
  "references",
  "agent-orchestration.md",
);

const HOSTS = [
  { dir: "claude-plugin", ext: "md" },
  { dir: "codex-plugin", ext: "toml" },
  { dir: "cursor-plugin", ext: "md" },
  { dir: "opencode-plugin", ext: "md" },
] as const;

async function read(p: string): Promise<string> {
  return fs.readFile(p, "utf8");
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Every .md file under skills/, recursively. */
async function skillMarkdownFiles(): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
    }
  }
  await walk(SKILLS_DIR);
  return out.sort();
}

async function charterNames(): Promise<string[]> {
  const entries = await fs.readdir(path.join(SKILLS_DIR, "agents"), {
    withFileTypes: true,
  });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// ── 1. Dispatch resolution (P0-1) ──────────────────────────────────────────

describe("dispatch resolution: every Dispatch: block names a shipped agent", () => {
  test("each dispatch target exists as a generated artifact in all 4 host dirs", async () => {
    const files = await skillMarkdownFiles();
    const targets: { agent: string; file: string }[] = [];
    let blocks = 0;
    for (const file of files) {
      const content = await read(file);
      blocks += [...content.matchAll(/\*\*Dispatch:/g)].length;
      for (const m of content.matchAll(
        /\*\*Dispatch: `([^`]+)`\*\*/g,
      )) {
        targets.push({ agent: m[1]!, file: path.relative(REPO_ROOT, file) });
      }
    }
    // Guard the guard: every dispatch block must be parseable, and the harness
    // must still have dispatch blocks at all. Otherwise a syntax change could
    // make this test pass by matching nothing.
    expect(targets.length).toBe(blocks);
    expect(targets.length).toBeGreaterThanOrEqual(20);

    const missing: string[] = [];
    for (const { agent, file } of targets) {
      expect(agent.startsWith("massa-ai-")).toBe(true);
      for (const host of HOSTS) {
        const artifact = path.join(
          REPO_ROOT,
          "apps",
          host.dir,
          "agents",
          `${agent}.${host.ext}`,
        );
        if (!(await exists(artifact))) {
          missing.push(`${file} -> ${agent} (missing in ${host.dir})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test("no dispatch block uses a bare role name", async () => {
    const files = await skillMarkdownFiles();
    const bare: string[] = [];
    for (const file of files) {
      const content = await read(file);
      for (const m of content.matchAll(/\*\*Dispatch: (?!`massa-ai-)([^*]+)\*\*/g)) {
        bare.push(`${path.relative(REPO_ROOT, file)}: ${m[1]!.trim()}`);
      }
    }
    expect(bare).toEqual([]);
  });
});

// ── 2. No phantom roles (P0-2) ─────────────────────────────────────────────

describe("no phantom roles: every orchestration role has a real charter", () => {
  test("agent-orchestration.md Roles table charter paths all resolve", async () => {
    const content = await read(AGENT_ORCHESTRATION);
    const charterPaths = [
      ...content.matchAll(/`(skills\/agents\/[a-z-]+\/SKILL\.md)`/g),
    ].map((m) => m[1]!);
    expect(charterPaths.length).toBeGreaterThanOrEqual(10);
    const missing: string[] = [];
    for (const rel of new Set(charterPaths)) {
      if (!(await exists(path.join(REPO_ROOT, rel)))) missing.push(rel);
    }
    expect(missing).toEqual([]);
  });

  test("no role is documented as charter-less", async () => {
    const content = await read(AGENT_ORCHESTRATION);
    expect(content).not.toContain("role-based (no charter)");
  });

  test("every charter is registered in skills/AGENTS.md and in the generator", async () => {
    const names = await charterNames();
    const registry = await read(path.join(SKILLS_DIR, "AGENTS.md"));
    const generator = await read(
      path.join(REPO_ROOT, "scripts/generate-subagent-artifacts.ts"),
    );
    for (const name of names) {
      expect(registry).toContain(`skills/agents/${name}/SKILL.md`);
      expect(generator).toContain(`"${name}"`);
    }
  });
});

// ── 3. Policy single-source (P0-3) ─────────────────────────────────────────

describe("policy single-source: one copy of each agent policy", () => {
  const POLICY_KEYS = [
    "plan_challenge:",
    "conversation_feedback:",
    "persona_router:",
  ];

  test("root AGENTS.md restates no policy block", async () => {
    const content = await read(path.join(REPO_ROOT, "AGENTS.md"));
    for (const key of POLICY_KEYS) {
      // The prose may name the keys; a YAML block declares them at line start.
      const declared = content
        .split(/\r?\n/)
        .filter((l) => l.trimStart().startsWith(key) && !l.trimStart().startsWith("`"));
      expect(declared).toEqual([]);
    }
  });

  test("skills/AGENTS.md declares each policy exactly once, inside the bootstrap block", async () => {
    const content = await read(path.join(SKILLS_DIR, "AGENTS.md"));
    const start = content.indexOf("<!-- massa-ai:bootstrap");
    const end = content.indexOf("<!-- massa-ai:bootstrap:end -->");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block = content.slice(start, end);
    for (const key of POLICY_KEYS) {
      const all = content
        .split(/\r?\n/)
        .filter((l) => l.trimStart().startsWith(key));
      expect(all.length).toBe(1);
      expect(block).toContain(key);
    }
  });

  test("no skills file points at a vantage-dependent ../../AGENTS.md policy path", async () => {
    const files = await skillMarkdownFiles();
    const offenders: string[] = [];
    for (const file of files) {
      const content = await read(file);
      if (/\.\.\/\.\.\/AGENTS\.md/.test(content)) {
        offenders.push(path.relative(REPO_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── 4. Reference integrity ─────────────────────────────────────────────────

describe("reference integrity: relative harness paths resolve on disk", () => {
  test("every references/, workflows/, personas/ and skills/agents/ path mentioned under skills/ exists", async () => {
    const files = await skillMarkdownFiles();
    const dead: string[] = [];
    for (const file of files) {
      const content = await read(file);
      const mentions = new Set<string>();
      for (const m of content.matchAll(
        /`((?:references|workflows|personas)\/[A-Za-z0-9._\/-]+\.md)`/g,
      )) {
        mentions.add(path.join(SKILLS_DIR, "massa-ai", m[1]!));
      }
      for (const m of content.matchAll(
        /`(skills\/[A-Za-z0-9._\/-]+\.md)`/g,
      )) {
        mentions.add(path.join(REPO_ROOT, m[1]!));
      }
      for (const target of mentions) {
        if (!(await exists(target))) {
          dead.push(`${path.relative(REPO_ROOT, file)} -> ${path.relative(REPO_ROOT, target)}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });
});

// ── 5. Router table <-> disk ───────────────────────────────────────────────

describe("router table matches the workflow and reference trees", () => {
  test("every workflow file on disk appears in the router table, and vice versa", async () => {
    const router = await read(ROUTER);
    const listed = new Set(
      [...router.matchAll(/`(workflows\/[A-Za-z0-9._\/-]+\.md)`/g)].map((m) => m[1]!),
    );

    const onDisk = new Set<string>();
    const workflowsRoot = path.join(SKILLS_DIR, "massa-ai", "workflows");
    async function walk(dir: string): Promise<void> {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.name.endsWith(".md")) {
          onDisk.add(path.relative(path.join(SKILLS_DIR, "massa-ai"), full));
        }
      }
    }
    await walk(workflowsRoot);

    const unlisted = [...onDisk].filter((w) => !listed.has(w)).sort();
    const missing = [...listed].filter((w) => !onDisk.has(w)).sort();
    expect(unlisted).toEqual([]);
    expect(missing).toEqual([]);
  });

  test("every reference path listed in the router exists", async () => {
    const router = await read(ROUTER);
    const listed = new Set(
      [...router.matchAll(/`(references\/[A-Za-z0-9._\/-]+)`/g)].map((m) => m[1]!),
    );
    expect(listed.size).toBeGreaterThan(20);
    const missing: string[] = [];
    for (const rel of listed) {
      const target = path.join(SKILLS_DIR, "massa-ai", rel);
      if (!(await exists(target))) missing.push(rel);
    }
    expect(missing).toEqual([]);
  });
});

// ── 6. Charter <-> artifact permission (P2) ────────────────────────────────

describe("charter permission matches the shipped artifact", () => {
  test("metadata.permission agrees with Write/Edit in the Claude artifact", async () => {
    const names = await charterNames();
    const mismatches: string[] = [];
    for (const name of names) {
      const charter = await read(
        path.join(SKILLS_DIR, "agents", name, "SKILL.md"),
      );
      const permMatch = /^\s{2}permission:\s*(\S+)\s*$/m.exec(charter);
      expect(permMatch, `charter ${name} declares no metadata.permission`).not.toBeNull();
      const declaredWrite = permMatch![1] === "write";

      const artifact = await read(
        path.join(REPO_ROOT, "apps/claude-plugin/agents", `massa-ai-${name}.md`),
      );
      const toolsLine =
        artifact.split(/\r?\n/).find((l) => l.startsWith("tools:")) ?? "";
      const grantsWrite = toolsLine.includes("Write") || toolsLine.includes("Edit");

      if (declaredWrite !== grantsWrite) {
        mismatches.push(
          `${name}: charter=${permMatch![1]} artifact=${grantsWrite ? "write" : "read-only"}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("codex sandbox_mode agrees with the charter permission", async () => {
    const names = await charterNames();
    const mismatches: string[] = [];
    for (const name of names) {
      const charter = await read(
        path.join(SKILLS_DIR, "agents", name, "SKILL.md"),
      );
      const declaredWrite = /^\s{2}permission:\s*write\s*$/m.test(charter);
      const toml = await read(
        path.join(REPO_ROOT, "apps/codex-plugin/agents", `massa-ai-${name}.toml`),
      );
      const sandboxWrite = /sandbox_mode = "workspace-write"/.test(toml);
      if (declaredWrite !== sandboxWrite) {
        mismatches.push(`${name}: charter=${declaredWrite} codex=${sandboxWrite}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("every charter forbids recursive subagent spawning", async () => {
    const names = await charterNames();
    for (const name of names) {
      const charter = await read(
        path.join(SKILLS_DIR, "agents", name, "SKILL.md"),
      );
      expect(charter, `charter ${name} lacks the no-recursion restriction`).toContain(
        "Never spawn subagents",
      );
    }
  });
});
