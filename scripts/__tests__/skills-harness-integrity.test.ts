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
 *   7. Persona <-> sub-agent boundary — the persona layer and the 15 charters
 *      shared no stated contract: no Capability Packet copy mentioned persona,
 *      no charter forbade self-routing or self-reading one, and persona-router's
 *      Stop Conditions read as an absolute ban on subagents rather than a bound
 *      on persona routing. See
 *      .specs/features/persona-agent-boundary/spec.md.
 *   8. Dispatch persona emission — the Capability Packet's `persona` field was
 *      defined (class 7) but no workflow `Dispatch:` block ever emitted it, so
 *      a subagent never actually received the id the contract describes. See
 *      .specs/features/persona-emit/spec.md.
 *
 * `bun run test:scripts` runs this file; CI runs that script.
 */

import { describe, test, expect } from "bun:test";
import { execFileSync } from "child_process";
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

/**
 * Every `Dispatch:` capability-packet block in a file, as the contiguous run
 * of `> `-prefixed lines starting at its `**Dispatch:` line. Shared by the
 * dispatch resolution and dispatch persona-emission describe blocks below.
 */
function dispatchBlocks(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^> \*\*Dispatch: `massa-ai-/.test(line)) {
      if (current) blocks.push(current.join("\n"));
      current = [line];
    } else if (current) {
      if (line.startsWith(">")) {
        current.push(line);
      } else {
        blocks.push(current.join("\n"));
        current = null;
      }
    }
  }
  if (current) blocks.push(current.join("\n"));
  return blocks;
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

// ── 3b. CHANGELOG heading-to-bump table single-source ──────────────────────
//
// Same mechanism as POLICY_KEYS above (P0-3), extended to the CHANGELOG
// heading→bump table: a distinctive substring of the canonical table must
// occur exactly once repo-wide, and that occurrence must live in
// CONTRIBUTING.md (see D6 in
// .specs/features/plugin-distribution-overhaul/design.md).

describe("CHANGELOG heading-to-bump table is single-sourced", () => {
  // Built by concatenation so this guard's own source never self-matches the
  // repo-wide scan below.
  const CHANGELOG_TABLE_SUBSTRING =
    "| `### Added` | new capability | minor bump (`" + "1.2.1` → `1.3.0`) |";
  const SELF_FILE = path.relative(REPO_ROOT, import.meta.path);

  /** Every git-tracked file, read as a repo-wide scan (matches .gitignore). */
  async function repoTrackedFiles(): Promise<string[]> {
    const output = execFileSync("git", ["ls-files"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return output.split("\n").filter(Boolean).filter((rel) => rel !== SELF_FILE);
  }

  test("the canonical heading table appears exactly once repo-wide, in CONTRIBUTING.md", async () => {
    const files = await repoTrackedFiles();
    const occurrences: string[] = [];
    for (const rel of files) {
      let content: string;
      try {
        content = await read(path.join(REPO_ROOT, rel));
      } catch {
        continue; // binary or unreadable — cannot contain the substring meaningfully
      }
      if (content.includes(CHANGELOG_TABLE_SUBSTRING)) occurrences.push(rel);
    }
    expect(occurrences).toEqual(["CONTRIBUTING.md"]);
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

// ── 7. Persona <-> sub-agent boundary (PAB) ────────────────────────────────
//
// Personas (skills/persona-router/ + skills/massa-ai/personas/) and the 15
// charters are different layers with no shared contract before this feature.
// Requirement IDs below are from
// .specs/features/persona-agent-boundary/spec.md.

describe("persona / sub-agent boundary", () => {
  /** The three files that define the Capability Packet, by design (see design.md A1). */
  const PACKET_FILES = [
    "AGENTS.md",
    path.join("massa-ai", "references", "agent-orchestration.md"),
    path.join("massa-ai", "references", "subagent-design.md"),
  ];

  /**
   * The persona field's semantics, byte-identical across all three packet
   * copies. Uniform text is what makes a substring gate meaningful — a
   * per-file paraphrase cannot be distinguished from a weakened one.
   */
  const PACKET_PERSONA_CLAUSE =
    "advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions";

  const PERSONA_ROUTER = path.join(SKILLS_DIR, "persona-router", "SKILL.md");

  /**
   * The span of a markdown section between a `## <heading>` line and the next
   * `##` heading (or end of file). Generalizes the charter-specific span below
   * to any named heading, so a rule's location can be asserted precisely
   * instead of merely "somewhere in the file" (Task A,
   * .specs/features/persona-emit/spec.md).
   */
  function namedSection(content: string, heading: string, label: string): string {
    const marker = `## ${heading}`;
    const start = content.indexOf(marker);
    expect(start, `${label} has no "${marker}" section`).toBeGreaterThanOrEqual(0);
    const rest = content.slice(start + marker.length);
    const nextHeading = rest.search(/^## /m);
    return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  }

  /**
   * The span of a charter between its `## Restrictions` heading and the next
   * `##` heading. PAB-02/AC2 and PAB-06 require the lines to live *there*, so a
   * whole-file search would not actually enforce the acceptance criterion.
   */
  function restrictionsSection(charter: string, name: string): string {
    return namedSection(charter, "Restrictions", `charter ${name}`);
  }

  /**
   * Deliberately narrow phrasings for a future edit that would *grant* a
   * persona authority it does not have — the contradiction-by-addition risk
   * accepted in design.md § Test design (cases 6, 8, 9). Each pattern anchors
   * on a modal or a direct object so the file's own denial prose ("grants no
   * tool access", "never authorizes", "cannot override") does not self-match:
   * those use "no"/"never"/"cannot", never "may"/"can" immediately before the
   * verb, and never "<verb> ... to the persona".
   */
  const AUTHORITY_GRANT_PATTERNS: RegExp[] = [
    /\bpersonas?\s+(?:may|can)\s+(?:grant|authorize|widen|override)\b/i,
    /\b(?:grant|authorize|widen|override)(?:s|ed|ing)?\s+(?:\w+\s+){0,3}(?:authority|permission|write scope)\s+to\s+(?:the\s+|a\s+)?persona\b/i,
  ];

  // PAB-01
  test("all three Capability Packet copies declare the optional persona field", async () => {
    const missing: string[] = [];
    for (const rel of PACKET_FILES) {
      const content = await read(path.join(SKILLS_DIR, rel));
      if (!content.includes("`persona`:") || !content.includes(PACKET_PERSONA_CLAUSE)) {
        missing.push(rel);
      }
    }
    expect(missing).toEqual([]);
  });

  // PAB-01/AC3 — a fourth packet *definition* would fork the contract
  // silently. Workflow dispatch blocks are packet *uses*, not definitions:
  // every `Dispatch:` block also carries this clause (see the dispatch
  // persona-emission describe block below), so this assertion strips
  // blockquote (`> `) lines — the format every dispatch block uses
  // exclusively — before scanning, isolating definitions from uses.
  test("the canonical persona clause appears in exactly those three files, outside dispatch-block uses", async () => {
    const files = await skillMarkdownFiles();
    const found: string[] = [];
    for (const file of files) {
      const content = await read(file);
      const definitionProse = content
        .split(/\r?\n/)
        .filter((line) => !line.startsWith(">"))
        .join("\n");
      if (definitionProse.includes(PACKET_PERSONA_CLAUSE)) {
        found.push(path.relative(SKILLS_DIR, file));
      }
    }
    expect(found.sort()).toEqual([...PACKET_FILES].sort());
  });

  // PAB-02
  test("every charter's Restrictions section carries the persona precedence line", async () => {
    const names = await charterNames();
    const missing: string[] = [];
    for (const name of names) {
      const charter = await read(path.join(SKILLS_DIR, "agents", name, "SKILL.md"));
      const section = restrictionsSection(charter, name);
      if (!section.includes("shapes emphasis only; these Restrictions win on any conflict")) {
        missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });

  // PAB-06/AC1, AC3, AC4
  test("every charter's Restrictions section forbids self-routing and self-reading a persona", async () => {
    const names = await charterNames();
    const missing: string[] = [];
    for (const name of names) {
      const charter = await read(path.join(SKILLS_DIR, "agents", name, "SKILL.md"));
      const section = restrictionsSection(charter, name);
      const bansRouter = section.includes(
        "never load the `massa-ai` or `persona-router` routers",
      );
      const bansPromptRead = section.includes("never open a `personas/` prompt file");
      if (!bansRouter || !bansPromptRead) missing.push(name);
    }
    expect(missing).toEqual([]);
  });

  // PAB-06/AC5 — presence alone would pass if the old sentence were re-added.
  test("no charter retains the superseded massa-ai-only restriction", async () => {
    const names = await charterNames();
    const offenders: string[] = [];
    for (const name of names) {
      const charter = await read(path.join(SKILLS_DIR, "agents", name, "SKILL.md"));
      if (charter.includes("never load the `massa-ai` router")) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  // PAB-04 — hardened (Task A): section-scoped, not merely present anywhere
  // in the file.
  test("persona-router's Stop Conditions section scopes its subagent prohibition to persona routing", async () => {
    const content = await read(PERSONA_ROUTER);
    const section = namedSection(content, "Stop Conditions", "persona-router/SKILL.md");
    expect(section).toContain("Persona routing itself stays inline");
    expect(section).toContain(
      "workflow-mandated agent dispatch is unaffected by an active persona route",
    );
  });

  // PAB-04 — the absence side; the design's own stated reason for it.
  test("persona-router no longer contains the unscoped prohibition", async () => {
    const content = await read(PERSONA_ROUTER);
    expect(content).not.toContain("launch subagents, create subprocess orchestration");
  });

  // PAB-03 + PAB-07 — hardened (Task A): section-scoped to where the boundary
  // is actually stated, not merely present anywhere in the file.
  test("persona-router's Persona And Sub-Agents section states persona grants no authority and reaches subagents as an id only", async () => {
    const content = await read(PERSONA_ROUTER);
    const section = namedSection(
      content,
      "Persona And Sub-Agents",
      "persona-router/SKILL.md",
    );
    expect(section).toContain("grants no tool access, no write scope, and no permission");
    expect(section).toContain("the persona is never authority");
    expect(section).toContain("carries the persona **id only**, never the persona prompt");
  });

  // PAB-05 — hardened (Task A): section-scoped.
  test("persona-router's Persona And Sub-Agents section states a persona route is not a specialist consultation", async () => {
    const content = await read(PERSONA_ROUTER);
    const section = namedSection(
      content,
      "Persona And Sub-Agents",
      "persona-router/SKILL.md",
    );
    expect(section).toContain("A persona route is not a specialist consultation");
  });

  // Task A negative structural assertion — closes the contradiction-by-addition
  // residual accepted in design.md § Test design for cases 6, 8, 9: a future
  // edit granting persona authority anywhere in this file now fails the gate,
  // instead of passing alongside the still-present denial prose.
  test("no authority-granting claim about persona appears anywhere in persona-router/SKILL.md", async () => {
    const content = await read(PERSONA_ROUTER);
    const offenders: string[] = [];
    for (const pattern of AUTHORITY_GRANT_PATTERNS) {
      const match = pattern.exec(content);
      if (match) offenders.push(`${pattern}: "${match[0]}"`);
    }
    expect(offenders).toEqual([]);
  });
});

// ── 8. Dispatch persona emission ───────────────────────────────────────────
//
// The Capability Packet's `persona` field was defined (class 7 / PAB-01) but
// deferred by .specs/features/persona-agent-boundary/spec.md § Out of scope:
// no workflow `Dispatch:` block emitted it. See
// .specs/features/persona-emit/spec.md.

describe("dispatch persona emission: every Dispatch block emits the optional persona field", () => {
  const PACKET_PERSONA_CLAUSE =
    "advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions";

  test("every Dispatch block on disk emits the optional persona field", async () => {
    const files = await skillMarkdownFiles();
    let total = 0;
    const missing: string[] = [];
    for (const file of files) {
      const content = await read(file);
      const blocks = dispatchBlocks(content);
      total += blocks.length;
      for (const block of blocks) {
        const hasPersonaBullet = /^> - persona:/m.test(block);
        if (!hasPersonaBullet || !block.includes(PACKET_PERSONA_CLAUSE)) {
          const m = /\*\*Dispatch: `([^`]+)`\*\*/.exec(block);
          missing.push(`${path.relative(REPO_ROOT, file)} -> ${m?.[1] ?? "unknown"}`);
        }
      }
    }
    // Guard the guard: the "dispatch resolution" describe block above already
    // requires >=20 blocks repo-wide; this parser must agree.
    expect(total).toBeGreaterThanOrEqual(20);
    expect(missing).toEqual([]);
  });
});
