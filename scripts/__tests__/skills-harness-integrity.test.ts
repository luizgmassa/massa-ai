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
 *   7. Persona <-> sub-agent boundary — the persona layer and the 17 charters
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
    if (line.startsWith('> **Dispatch: `massa-ai-')) {
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
  // agent-orchestration.md used to carry a partial roster: a 12-row table, a
  // 7-item bullet list, and a prose mapping paragraph, all naming the same
  // agents. Table membership tracked the commit that added each agent and no
  // property of the agent -- not permission, not dispatch usage, not whether it
  // had a legacy name. `judge` and `meta-judge` were absent for a whole release
  // because the guard here asserted that mentioned charter paths RESOLVE, which
  // an unmentioned charter cannot fail.
  //
  // The roster now lives once, in skills/AGENTS.md's Agent Table, guarded by
  // "every charter is registered in skills/AGENTS.md and in the generator"
  // below. This file keeps only the legacy role vocabulary, which lives nowhere
  // else. See .specs/features/skills-directive-dedup/.
  test("agent-orchestration.md carries no second roster", async () => {
    const content = await read(AGENT_ORCHESTRATION);
    const charterPaths = [
      ...content.matchAll(/`(skills\/agents\/[a-z-]+\/SKILL\.md)`/g),
    ].map((m) => m[1]!);
    expect(charterPaths).toEqual([]);
  });

  test("agent-orchestration.md points at the one roster", async () => {
    const content = await read(AGENT_ORCHESTRATION);
    expect(content).toContain("skills/AGENTS.md");
    expect(content).toMatch(/roster lives in one place/i);
  });

  test("every legacy role maps to an agent that exists", async () => {
    // The legacy column is this file's own content, so it needs its own check:
    // a rename that retires an agent must not leave a legacy alias pointing at
    // nothing.
    const content = await read(AGENT_ORCHESTRATION);
    const mapped = [...content.matchAll(/\|\s*`massa-ai-([a-z-]+)`\s*\|/g)].map((m) => m[1]!);
    expect(mapped.length).toBeGreaterThanOrEqual(5);
    const names = new Set(await charterNames());
    expect(mapped.filter((n) => !names.has(n))).toEqual([]);
  });

  test("no role is documented as charter-less", async () => {
    const content = await read(AGENT_ORCHESTRATION);
    expect(content).not.toContain("role-based (no charter)");
  });

  // Roster coverage is asserted against skills/AGENTS.md -- the one place it
  // lives -- by "every charter is registered in skills/AGENTS.md and in the
  // generator" below. An earlier fix instead added a coverage check against
  // agent-orchestration.md, which closed the symptom while preserving the
  // two-roster split that caused it; the split is now gone, so the check is
  // replaced by the negative assertion above.
  test("the roster guard enumerated a real charter list", async () => {
    // Guard the guard: an empty charter list makes every coverage check here
    // vacuous, including the AGENTS.md one below.
    expect((await charterNames()).length).toBeGreaterThanOrEqual(17);
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
      // A skill mentions its own references/ first (persona-router grew one in
      // persona-router-token-optimization T3); files outside a skill root
      // (e.g. skills/AGENTS.md) resolve against massa-ai as before. A path is
      // dead only when it resolves in neither the mentioning skill's root nor
      // massa-ai's.
      const ownSkill = /skills\/([^/]+)\//.exec(
        path.relative(REPO_ROOT, file).replace(/\\/g, "/"),
      )?.[1];
      for (const m of content.matchAll(
        /`((?:references|workflows|personas)\/[A-Za-z0-9._/-]+\.md)`/g,
      )) {
        const inMassaAi = path.join(SKILLS_DIR, "massa-ai", m[1]!);
        const inOwnSkill = ownSkill
          ? path.join(SKILLS_DIR, ownSkill, m[1]!)
          : inMassaAi;
        mentions.add((await exists(inOwnSkill)) ? inOwnSkill : inMassaAi);
      }
      for (const m of content.matchAll(
        /`(skills\/[A-Za-z0-9._/-]+\.md)`/g,
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
      [...router.matchAll(/`(workflows\/[A-Za-z0-9._/-]+\.md)`/g)].map((m) => m[1]!),
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
      [...router.matchAll(/`(references\/[A-Za-z0-9._/-]+)`/g)].map((m) => m[1]!),
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
  /**
   * Whether the Claude artifact's key grants Write/Edit, under the
   * three-way policy STI-01 introduced (.specs/features/
   * subagent-tool-inheritance/design.md Component 1/2): `disallowedTools:`
   * (denylist) blocks write when it names Write/Edit; a narrow `tools:`
   * allowlist (only `navigator` today) grants write only if it names
   * Write/Edit; and neither key present means the charter inherits the full
   * pool, Write/Edit included. The prior version of this check read only the
   * `tools:` line, which is why it read every write charter as read-only the
   * moment STI-01 stopped emitting that key for them — a sanctioned change,
   * not a regression, mirroring the CLA-02/03 rewrite in
   * subagent-parity.test.ts (S3).
   */
  function claudeGrantsWrite(artifact: string): boolean {
    const lines = artifact.split(/\r?\n/);
    const disallowedLine = lines.find((l) => l.startsWith("disallowedTools:"));
    if (disallowedLine) {
      return !(disallowedLine.includes("Write") || disallowedLine.includes("Edit"));
    }
    const toolsLine = lines.find((l) => l.startsWith("tools:"));
    if (toolsLine) {
      return toolsLine.includes("Write") || toolsLine.includes("Edit");
    }
    return true; // neither key: inherits the full pool
  }

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
      const grantsWrite = claudeGrantsWrite(artifact);

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

  // STI-04 / S5 — the blanket "never spawn subagents" prohibition is retired
  // (.specs/features/subagent-tool-inheritance/spec.md); this replaces the
  // superseded assertion above that required the phrase's presence. The
  // prohibition is swept as a class — a spawn verb followed (within a couple
  // of words) by a "sub-...agent(s)" noun — rather than the literal charter
  // phrase, because a literal-phrase sweep missed a paraphrase
  // (`skills/massa-ai/references/spec-driven/sub-agents.md:70`, "It does NOT
  // spawn further sub-agents.") that only a class sweep caught. See
  // .specs/features/subagent-tool-inheritance/design.md Verification Design,
  // sensor S5.
  const SPAWN_PROHIBITION_CLASS =
    /\bspawn(?:s|ing|ed)?\s+(?:\w+\s+){0,2}(?:sub-?){1,3}agents?\b/i;

  const ROUTER_PERSONA_CLAUSE =
    "Never load the `massa-ai` or `persona-router` routers, and never open a `personas/` prompt file; the dispatching workflow owns routing and persona selection.";

  test("no charter contains a spawn prohibition of any shape (S5)", async () => {
    const names = await charterNames();
    expect(names.length).toBeGreaterThanOrEqual(17); // guard the guard
    const offenders: string[] = [];
    for (const name of names) {
      const charter = await read(
        path.join(SKILLS_DIR, "agents", name, "SKILL.md"),
      );
      if (SPAWN_PROHIBITION_CLASS.test(charter)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  test("all 18 charters retain the router/persona self-routing clause (S5)", async () => {
    const names = await charterNames();
    expect(names.length).toBe(18);
    const withClause = new Set<string>();
    for (const name of names) {
      const charter = await read(
        path.join(SKILLS_DIR, "agents", name, "SKILL.md"),
      );
      if (charter.includes(ROUTER_PERSONA_CLAUSE)) withClause.add(name);
    }
    expect(withClause.size).toBe(18);
  });
});

// ── 7. Persona <-> sub-agent boundary (PAB) ────────────────────────────────
//
// Personas (skills/persona-router/ + skills/massa-ai/personas/) and the 17
// charters are different layers with no shared contract before this feature.
// Requirement IDs below are from
// .specs/features/persona-agent-boundary/spec.md.

describe("persona / sub-agent boundary", () => {
  /**
   * The two files that define the Capability Packet, by design (see
   * design.md A1). `skills/AGENTS.md` was a third copy; its recorded
   * rationale ("installer copies it to hosts") was factually wrong —
   * `install-skills.sh` extracts only the bootstrap block, so the registry
   * never reaches hosts — and the mirror is deleted (see
   * .specs/features/registry-cleanup-skill-imports/design.md D4).
   */
  const PACKET_FILES = [
    path.join("massa-ai", "references", "agent-orchestration.md"),
    path.join("massa-ai", "references", "subagent-design.md"),
  ];

  /**
   * The persona field's semantics, byte-identical across both packet
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
   * Files whose persona prose must never grant authority. The two packet
   * definitions join persona-router here: PE-02 left them presence-only, so a
   * contradicting sentence could be added to a *definition* — the worst place
   * for one — and every gate would stay green. `AGENTS.md` is re-added
   * directly (not spread from `PACKET_FILES`) so shrinking the packet-file
   * list does not silently drop persona-authority prose scanning over the
   * bootstrap Persona Router Policy the file still carries.
   */
  const AUTHORITY_SCANNED_FILES = [
    path.join("persona-router", "SKILL.md"),
    // The reference carries the persona-boundary elaboration moved out of
    // SKILL.md (persona-router-token-optimization T3); widened after a
    // seeded-red run proved the scanner reaches it.
    path.join("persona-router", "references", "routing-details.md"),
    "AGENTS.md",
    ...PACKET_FILES,
  ];

  /**
   * An authority-granting claim is detected structurally, not by phrase list.
   *
   * The earlier approach enumerated phrasings (`persona may grant`, `grant
   * authority to the persona`). It killed the two mutations it was written
   * against and nothing else: "a persona is permitted to write" and "personas
   * hold write access" both sailed through. Enumeration cannot win here — the
   * space of ways to say "persona has power" is unbounded.
   *
   * So invert it. Find every sentence that mentions a persona *and* an
   * authority term, then require that sentence to carry a negator. This
   * repository's actual rules all do ("grants **no** tool access", "**never**
   * overrides", "is **never** authority"), so correct prose passes while any
   * affirmative grant fails regardless of how it is worded.
   */
  const AUTHORITY_TERM =
    /\b(?:grant|authoriz|widen|overrid|permit|allow|entitl|empower|confer)\w*\b|\bwrite (?:scope|access|permission)\b|\bauthority\b|\bpermissions?\b|\btool access\b/i;
  const NEGATOR = /\b(?:never|not|no|non-|cannot|can't|neither|nor|without|only)\b/i;

  /** Sentence-ish split: markdown lines are short, so split on both. */
  function sentences(content: string): string[] {
    return content
      .split(/\r?\n/)
      .flatMap((line) => line.split(/(?<=[.!?;])\s+/))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function authorityGrants(content: string): string[] {
    return sentences(content).filter(
      (s) => /\bpersonas?\b/i.test(s) && AUTHORITY_TERM.test(s) && !NEGATOR.test(s),
    );
  }

  // PAB-01
  test("both Capability Packet copies declare the optional persona field", async () => {
    const missing: string[] = [];
    for (const rel of PACKET_FILES) {
      const content = await read(path.join(SKILLS_DIR, rel));
      if (!content.includes("`persona`:") || !content.includes(PACKET_PERSONA_CLAUSE)) {
        missing.push(rel);
      }
    }
    expect(missing).toEqual([]);
  });

  // PAB-01/AC3 — a third packet *definition* would fork the contract
  // silently. Workflow dispatch blocks are packet *uses*, not definitions:
  // every `Dispatch:` block also carries this clause (see the dispatch
  // persona-emission describe block below), so this assertion strips
  // blockquote (`> `) lines — the format every dispatch block uses
  // exclusively — before scanning, isolating definitions from uses.
  test("the canonical persona clause appears in exactly those two files, outside dispatch-block uses", async () => {
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
  //
  // STI-04 (.specs/features/subagent-tool-inheritance/) moved this clause
  // from mid-sentence ("Never spawn subagents, never load the...") to the
  // start of the Restrictions bullet, and design.md's Component 3 edit table
  // mandates recapitalizing it into its own sentence ("Never load the...").
  // `bansRouter` is matched case-insensitively on the leading word only for
  // that reason -- the rest of the phrase, and the separate prompt-read ban
  // below, are still matched at exact case.
  test("every charter's Restrictions section forbids self-routing and self-reading a persona", async () => {
    const names = await charterNames();
    const missing: string[] = [];
    for (const name of names) {
      const charter = await read(path.join(SKILLS_DIR, "agents", name, "SKILL.md"));
      const section = restrictionsSection(charter, name);
      const bansRouter = /never load the `massa-ai` or `persona-router` routers/i.test(
        section,
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

  // Negative structural assertion — closes the contradiction-by-addition
  // residual accepted in design.md § Test design for cases 6, 8, 9, and PE-02
  // for cases 1 and 2. A future edit granting persona authority in the router
  // OR in any of the two packet definitions now fails the gate, instead of
  // passing alongside the still-present denial prose.
  test("no file grants persona authority in prose", async () => {
    const offenders: string[] = [];
    for (const rel of AUTHORITY_SCANNED_FILES) {
      const content = await read(path.join(SKILLS_DIR, rel));
      for (const sentence of authorityGrants(content)) {
        offenders.push(`${rel}: "${sentence.slice(0, 120)}"`);
      }
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

// ── 9. Portability of shipped harness prose ────────────────────────────────
//
// Everything under skills/ is copied byte-identically into four
// apps/*-plugin/skills/ bundles and published to npm. A path from one
// developer's home directory therefore ships to every user, and resolves for
// none of them.
//
// `references/maestro.md` and `references/maestro/fact-ledger.md` cited
// `/Users/<name>/Downloads/questions.md` in three places -- once as a named
// tier of the fact ledger's evidence taxonomy, so an agent was told to
// quarantine claims as `excluded/unverified` unless they appeared in a file it
// could not open. See .specs/features/skills-directive-dedup/spec.md SDD-02.
//
// This scans the whole tree rather than pinning the three known sites: fixing
// three occurrences leaves the fourth.

describe("portability: no shipped harness file names a developer's machine", () => {
  /** Absolute home-directory paths on macOS and Linux respectively. */
  const HOME_PATH = /\/(?:Users|home)\/[A-Za-z0-9._-]+\//;

  test("no file under skills/ contains an absolute home-directory path", async () => {
    const offenders: string[] = [];
    for (const file of await skillMarkdownFiles()) {
      const content = await read(file);
      content.split(/\r?\n/).forEach((line, i) => {
        if (HOME_PATH.test(line)) {
          offenders.push(`${path.relative(REPO_ROOT, file)}:${i + 1}: ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  test("the Maestro coverage-checklist rule survived the path removal", async () => {
    // Absence of the path must not be reachable by deleting the rule. Both
    // files still have to instruct the agent on how to treat a checklist.
    const index = await read(
      path.join(SKILLS_DIR, "massa-ai", "references", "maestro.md"),
    );
    const ledger = await read(
      path.join(SKILLS_DIR, "massa-ai", "references", "maestro", "fact-ledger.md"),
    );
    for (const body of [index, ledger]) {
      expect(body).toMatch(/coverage checklist/i);
    }
    expect(ledger).toMatch(/excluded\/unverified/);
    expect(index).toMatch(/excluded\/unverified/);
  });

  test("the scan actually enumerated the tree", async () => {
    // Guard the guard: a mis-rooted walk finds no files and no offenders.
    expect((await skillMarkdownFiles()).length).toBeGreaterThan(100);
  });
});
