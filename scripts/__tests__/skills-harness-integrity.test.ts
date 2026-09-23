/**
 * Skills-harness integrity gate.
 *
 * Each describe block below discriminates against exactly one defect class that
 * shipped silently before this test existed (see
 * .specs/features/skills-harness-audit/audit-report.md):
 *
 *   1. Dispatch resolution  — a Dispatch: block named an agent no host
 *      registered, so the dispatch never resolved.
 *   2. No phantom roles     — `plan-critic` was mandated by the Plan Challenge
 *      gate with Charter = "role-based (no charter)" and no artifact anywhere.
 *   3. Policy single-source — the Plan Challenge Policy existed in two copies
 *      (root AGENTS.md vs skills/AGENTS.md) with opposite gate rules.
 *   4. Reference integrity  — dead relative links inside skills/.
 *   5. Router table <-> disk — router listed workflows/references that no longer
 *      matched the tree.
 *   6. Charter <-> artifact permission — charters said `read-only` while the
 *      shipped artifact granted Write/Edit.
 *   7. Retired role-routing layer — the persona catalog, its router skill,
 *      and the Capability Packet field that carried its id were removed
 *      (.specs/features/agent-roster-consolidation/spec.md PER AC-1, AC-7);
 *      a surviving mention would route to a file that no longer ships.
 *   8. Dispatch role defaults — a field value shared by every dispatch of a
 *      role lives once, in agent-orchestration.md's Role Defaults section.
 *   9. Charter reference base — all 18 charters cited their references bare
 *      (`references/x.md`) while owning no references/ directory, and every
 *      host installs charters to <host>/agents/ but references to
 *      <host>/skills/massa-ai/references/. The file existed, so class 4 passed:
 *      that check falls back to massa-ai's root for any citing file, which
 *      encodes the convention the charter never stated. A subagent reading only
 *      its own charter had no base to resolve against.
 *  10. Repo-root .specs cites — a reference claimed `.specs/STATE.md` where the
 *      file is `.specs/project/STATE.md` (1 of 45 cites). Unlike references/,
 *      `.specs/` is repo-root-anchored, so no skill-relative fallback hides it.
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
 * dispatch resolution and dispatch role-defaults describe blocks below.
 */
function dispatchBlocks(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith('> **Dispatch: `')) {
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
      expect(agent.startsWith("massa-ai-")).toBe(false);
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

  test("no dispatch block uses the retired massa-ai- prefix or an unquoted name (NAM AC-1)", async () => {
    const files = await skillMarkdownFiles();
    const offenders: string[] = [];
    for (const file of files) {
      const content = await read(file);
      for (const m of content.matchAll(/\*\*Dispatch: (?!`(?!massa-ai-)[a-z-]+`\*\*)([^*]+)\*\*/g)) {
        offenders.push(`${path.relative(REPO_ROOT, file)}: ${m[1]!.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the router states the Claude plugin-route namespaced dispatch rule (NAM AC-10)", async () => {
    const flat = (s: string) => s.replace(/\s+/g, " ");
    expect(flat(await read(ROUTER))).toContain(
      "On the Claude plugin route, dispatch the plugin-namespaced `massa-ai:<name>`",
    );
    expect(flat(await read(AGENT_ORCHESTRATION))).toContain(
      "**Claude plugin route: dispatch `massa-ai:<role>`.**",
    );
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
    const mapped = [...content.matchAll(/^\|\s*`[a-z-]+`\s*\|\s*`([a-z-]+)`\s*\|/gm)].map((m) => m[1]!);
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
    expect((await charterNames()).length).toBe(7);
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
  test("every references/, workflows/ and skills/agents/ path mentioned under skills/ exists", async () => {
    const files = await skillMarkdownFiles();
    const dead: string[] = [];
    for (const file of files) {
      const content = await read(file);
      const mentions = new Set<string>();
      // A skill mentions its own references/ first; files outside a skill root
      // (e.g. skills/AGENTS.md) resolve against massa-ai as before. A path is
      // dead only when it resolves in neither the mentioning skill's root nor
      // massa-ai's.
      const ownSkill = /skills\/([^/]+)\//.exec(
        path.relative(REPO_ROOT, file).replace(/\\/g, "/"),
      )?.[1];
      for (const m of content.matchAll(
        /`((?:references|workflows)\/[A-Za-z0-9._/-]+\.md)`/g,
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
   * allowlist (no charter uses one today) grants write only if it names
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
        path.join(REPO_ROOT, "apps/claude-plugin/agents", `${name}.md`),
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
        path.join(REPO_ROOT, "apps/codex-plugin/agents", `${name}.toml`),
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

  const ROUTER_CLAUSE =
    "Never load the `massa-ai` router skill; the dispatching workflow owns routing.";

  test("no charter contains a spawn prohibition of any shape (S5)", async () => {
    const names = await charterNames();
    expect(names.length).toBe(7); // guard the guard
    // STI-04.5 requires the failure to name the file AND the line, so the offender
    // is reported as `skills/agents/<name>/SKILL.md:<line>: <the matching line>`
    // rather than the bare charter name — a charter is long enough that the name
    // alone leaves the reader hunting for the paraphrase the class pattern matched.
    const offenders: string[] = [];
    for (const name of names) {
      const rel = `skills/agents/${name}/SKILL.md`;
      const lines = (
        await read(path.join(SKILLS_DIR, "agents", name, "SKILL.md"))
      ).split(/\r?\n/);
      lines.forEach((line, i) => {
        if (SPAWN_PROHIBITION_CLASS.test(line)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  test("all 7 charters retain the router self-routing clause (S5)", async () => {
    const names = await charterNames();
    expect(names.length).toBe(7);
    const withClause = new Set<string>();
    for (const name of names) {
      const charter = await read(
        path.join(SKILLS_DIR, "agents", name, "SKILL.md"),
      );
      if (charter.includes(ROUTER_CLAUSE)) withClause.add(name);
    }
    expect(withClause.size).toBe(7);
  });
});

// ── 7. Retired role-routing layer (PER AC-1, AC-7) ─────────────────────────

describe("retired persona layer: nothing under skills/ still routes to it", () => {
  /**
   * The Fool's red-team mode names "adversary personas" as a critique
   * technique; that is not the removed feature (spec Out of Scope), so its
   * directory is the one exemption.
   */
  const EXEMPT_DIR = path.join(SKILLS_DIR, "massa-ai", "references", "the-fool") + path.sep;
  const RETIRED_MENTION = /\bpersonas?\b|persona_pin/i;

  test("the router skill and the catalog directory are gone", async () => {
    expect(await exists(path.join(SKILLS_DIR, "persona-router"))).toBe(false);
    expect(await exists(path.join(SKILLS_DIR, "massa-ai", "personas"))).toBe(false);
  });

  test("no charter, workflow, reference, or registry mentions it", async () => {
    const files = await skillMarkdownFiles();
    expect(files.length).toBeGreaterThan(50); // guard the guard
    const offenders: string[] = [];
    for (const file of files) {
      if (file.startsWith(EXEMPT_DIR)) continue;
      (await read(file)).split(/\r?\n/).forEach((line, i) => {
        if (RETIRED_MENTION.test(line)) {
          offenders.push(`${path.relative(REPO_ROOT, file)}:${i + 1}: ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

// ── 8. Dispatch role defaults ──────────────────────────────────────────────

describe("dispatch role defaults: shared field values live in exactly one place", () => {
  /**
   * A role default is supplied once by `agent-orchestration.md`'s Role
   * Defaults section and never restated per block: the same field said twice
   * is the same field free to disagree. The pair of assertions below holds
   * that shape — the default must exist, AND no block may restate it.
   */
  const ROLE_DEFAULTS = path.join(
    SKILLS_DIR,
    "massa-ai",
    "references",
    "agent-orchestration.md",
  );

  /**
   * Field values `agent-orchestration.md` fixes for a role. Keyed by the agent
   * the default belongs to, or by `agent/mode` for a default that holds for one
   * mode only. A block restating any of these has forked the contract.
   */
  const DEFAULTED_FIELDS: Record<string, string[]> = {
    "code-reviewer": ["permissions"],
    "code-reviewer/review": ["fallback"],
    "designer": ["trigger", "sensors", "inputs", "firewall", "memory"],
  };

  test("agent-orchestration.md carries a Role Defaults section that forbids restating a default", async () => {
    const body = await read(ROLE_DEFAULTS);
    expect(body).toContain("### Role Defaults");
    // Presence of a heading proves nothing; the load-bearing claim is that the
    // defaults apply to every dispatch and are not to be restated.
    expect(body).toMatch(/A block that restates one has forked the contract/);
  });

  test("every defaulted field is actually stated in the Role Defaults section", async () => {
    // Guard the guard: a default removed from the reference while still absent
    // from every block would leave the field defined nowhere, and the
    // "no block restates it" assertion below would pass most loudly of all.
    const body = await read(ROLE_DEFAULTS);
    const start = body.indexOf("### Role Defaults");
    expect(start).toBeGreaterThan(-1);
    const section = body.slice(start);
    const absent: string[] = [];
    for (const [agent, fields] of Object.entries(DEFAULTED_FIELDS)) {
      for (const field of fields) {
        if (!section.includes(`\`${field}\``)) absent.push(`${agent}.${field}`);
      }
    }
    expect(absent).toEqual([]);
  });

  test("no Dispatch block restates a field the role defaults already fix", async () => {
    const files = await skillMarkdownFiles();
    let total = 0;
    const offenders: string[] = [];
    for (const file of files) {
      const content = await read(file);
      const blocks = dispatchBlocks(content);
      total += blocks.length;
      for (const block of blocks) {
        const agent = /\*\*Dispatch: `([^`]+)`\*\*/.exec(block)?.[1] ?? "unknown";
        const mode = /\(role: `[^`]+`, mode: `([^`]+)`\)/.exec(block)?.[1];
        const fields = [
          ...(DEFAULTED_FIELDS[agent] ?? []),
          ...(mode ? (DEFAULTED_FIELDS[`${agent}/${mode}`] ?? []) : []),
        ];
        for (const field of fields) {
          if (new RegExp(`^> - ${field}:`, "m").test(block)) {
            offenders.push(`${path.relative(REPO_ROOT, file)} -> ${agent}: restates ${field}`);
          }
        }
      }
    }
    // Guard the guard: the "dispatch resolution" describe block above already
    // requires >=20 blocks repo-wide; this parser must agree.
    expect(total).toBeGreaterThanOrEqual(20);
    expect(offenders).toEqual([]);
  });

  test("a role's non-defaulted fields are still written in its blocks", async () => {
    // Negative control for the assertion above. "No block restates a default"
    // is trivially satisfied by a block with no bullets at all, or by deleting
    // the blocks outright — so the fields that are NOT defaulted must still be
    // present. Designer keeps exactly scope/permissions/output.
    const files = await skillMarkdownFiles();
    let designerBlocks = 0;
    for (const file of files) {
      for (const block of dispatchBlocks(await read(file))) {
        if (!block.includes("**Dispatch: `designer`**")) continue;
        designerBlocks += 1;
        for (const field of ["scope", "permissions", "output"]) {
          expect(
            new RegExp(`^> - ${field}:`, "m").test(block),
            `${path.relative(REPO_ROOT, file)} designer block is missing ${field}`,
          ).toBe(true);
        }
      }
    }
    expect(designerBlocks).toBe(6);
  });
});

// ── 9. Portability of shipped harness prose ────────────────────────────────
//
// Everything under skills/ is copied byte-identically into four
// apps/*-plugin/skills/ bundles and published to npm. A path from one
// developer's home directory therefore ships to every user, and resolves for
// none of them.
//
// `references/maestro.md` and `references/maestro/fact-ledger.md` (both since
// removed) cited `/Users/<name>/Downloads/questions.md` in three places -- once as a named
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

  test("the Maestro files that carried the path are removed with their workflows", async () => {
    // agent-roster-consolidation WFL-02 (Inventory AC-3) deleted the whole
    // Maestro family, so the rule this test used to pin has no file left to
    // live in. Absence is asserted per path, not inferred from the scan above.
    const gone = [
      path.join(SKILLS_DIR, "massa-ai", "references", "maestro.md"),
      path.join(SKILLS_DIR, "massa-ai", "references", "maestro"),
      path.join(REPO_ROOT, "docs", "massa-ai-maestro.md"),
    ];
    const present: string[] = [];
    for (const p of gone) {
      if (await fs.stat(p).then(() => true, () => false)) present.push(path.relative(REPO_ROOT, p));
    }
    expect(present).toEqual([]);
  });

  test("the scan actually enumerated the tree", async () => {
    // Guard the guard: a mis-rooted walk finds no files and no offenders.
    expect((await skillMarkdownFiles()).length).toBeGreaterThan(100);
  });
});

// ── 9. Charter reference base ──────────────────────────────────────────────

/**
 * The one sentence that makes a bare `references/…` cite resolvable by a
 * subagent that has read nothing but its own charter. Charters install to
 * <host>/agents/ while the reference tree installs to
 * <host>/skills/massa-ai/references/ — sibling trees, so no relative path from
 * the charter reaches them and the base has to be named in the charter itself.
 */
const CHARTER_REFERENCE_BASE =
  "References (paths relative to the `massa-ai` skill directory):";

describe("charter reference base: a charter states where its references live", () => {
  test("every charter citing references/ names the massa-ai skill directory", async () => {
    const names = await charterNames();
    const offenders: string[] = [];
    let citing = 0;
    for (const name of names) {
      const file = path.join(SKILLS_DIR, "agents", name, "SKILL.md");
      const content = await read(file);
      if (!/`references\/[A-Za-z0-9._/-]+`/.test(content)) continue;
      citing += 1;
      if (!content.includes(CHARTER_REFERENCE_BASE)) {
        offenders.push(`${name}: cites references/ without naming the base skill`);
      }
    }
    expect(offenders).toEqual([]);
    // Guard the guard: a regex that stops matching makes every charter vacuously
    // compliant. Class 9 was found across every charter, so the citing set is
    // the whole roster.
    expect(citing).toBe(names.length);
  });

  test("every reference a charter cites resolves under skills/massa-ai/", async () => {
    const dead: string[] = [];
    let checked = 0;
    for (const name of await charterNames()) {
      const file = path.join(SKILLS_DIR, "agents", name, "SKILL.md");
      const content = await read(file);
      for (const m of content.matchAll(/`(references\/[A-Za-z0-9._/-]+)`/g)) {
        checked += 1;
        const target = path.join(SKILLS_DIR, "massa-ai", m[1]!.replace(/\/$/, ""));
        if (!(await exists(target))) {
          dead.push(`${name} -> ${m[1]}`);
        }
      }
    }
    expect(dead).toEqual([]);
    expect(checked).toBeGreaterThan(50);
  });
});

// ── 10. Repo-root .specs cites ─────────────────────────────────────────────

/**
 * Paths the harness documents as created on demand rather than tracked: the
 * onboarding output dir, the gitignored observation buffer, and the quick-task
 * template tree. Everything else under `.specs/` is a real tracked artifact and
 * a cite that misses it is a typo, not a forward reference.
 */
const SPECS_CREATED_ON_DEMAND = [
  ".specs/project/onboarding/",
  ".specs/observations.json",
  ".specs/quick/",
];
const SPECS_PLACEHOLDER = /NNN|<|\{|\*|slug/;

describe("repo-root .specs cites resolve", () => {
  test("no skills/ file cites a .specs path that does not exist", async () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const file of await skillMarkdownFiles()) {
      const content = await read(file);
      let fenced = false;
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]!;
        if (line.startsWith("```")) {
          fenced = !fenced;
          continue;
        }
        if (fenced) continue;
        for (const m of line.matchAll(/`(\.specs\/[A-Za-z0-9._/-]+)`/g)) {
          const cite = m[1]!;
          if (SPECS_PLACEHOLDER.test(cite)) continue;
          if (SPECS_CREATED_ON_DEMAND.some((p) => cite.startsWith(p))) continue;
          checked += 1;
          if (!(await exists(path.join(REPO_ROOT, cite.replace(/\/$/, ""))))) {
            offenders.push(`${path.relative(REPO_ROOT, file)}:${i + 1} -> ${cite}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    // Guard the guard: an over-broad allowlist or a dead regex checks nothing.
    expect(checked).toBeGreaterThan(20);
  });
});
