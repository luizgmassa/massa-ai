/**
 * `skills/bootstrap/SKILL.md` contract (T20 / TASK-020, BST-11, BST-12 AC-4).
 *
 * Two independent claims, both scripted because both are the kind a reviewer
 * reads past:
 *
 * 1. **The skill names no MCP tool.** `skills/profile/SKILL.md:23` opens with
 *    a "prefer MCP when connected" clause, and this skill is written from that
 *    template. Copying that clause would have been silent: no `bootstrap_*`
 *    MCP tool exists, so an agent following it reaches for a tool that is not
 *    there, and BST-11.5 requires this surface to work with the massa-ai MCP
 *    server unreachable — which is precisely the state a user is in after
 *    disabling `massa-ai-router`.
 *
 *    The ban is deliberately narrow rather than "the file must not contain the
 *    string MCP". It must contain it: the file's job includes saying that no
 *    MCP tool exists and that the CLI keeps working without the server. A
 *    substring ban would be satisfied by deleting that explanation, which is
 *    the opposite of the requirement — and it would fire on the disclaimer
 *    itself, the "a claim of absence is the match" failure. So what is banned
 *    is a tool *identifier* (any `mcp__*` name, any snake_case identifier in
 *    backticks — the shape every tool in this repo's MCP surface has, e.g.
 *    `profile_list` / `profile_set`) and the template's preference clause.
 *    Both directions are asserted: the positive claims must be present too, so
 *    the ban cannot be passed by a file that says nothing at all.
 *
 * 2. **The documented id list is the registry's nine (BST-12 AC-4).** Parsed
 *    out of the skill's own `## The Rule Ids` section and compared against
 *    `BOOTSTRAP_RULE_IDS` in order, plus each id's documented default against
 *    `BOOTSTRAP_RULES`. Adding or removing a registry id without updating the
 *    skill fails here, naming the divergent ids.
 *
 * The registry is imported from its source module by relative path rather than
 * through `@massa-ai/shared`: `profile-cli-parity.test.ts` registers a
 * `mock.module` on that barrel, and `bun test scripts/__tests__` runs both
 * files in one process, so a barrel import here would make this suite's
 * subject depend on file ordering.
 *
 * Test: bun test scripts/__tests__/bootstrap-skill-contract.test.ts
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import path from "path";
import { BOOTSTRAP_RULE_IDS, BOOTSTRAP_RULES } from "../../packages/shared/src/bootstrap/rules.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const SKILL_PATH = path.join(REPO_ROOT, "skills/bootstrap/SKILL.md");
const SKILL = readFileSync(SKILL_PATH, "utf8");

/** Every backtick-delimited span in the skill body, deduped. */
function codeSpans(text: string): string[] {
  return [...new Set([...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!))];
}

/** The ids the skill documents, in the order it documents them. Scoped to the
 *  `## The Rule Ids` section so a backticked id quoted elsewhere in prose
 *  (Restrictions names `massa-ai-router`, for one) cannot pad the list. */
function documentedRuleIds(): string[] {
  const section = SKILL.split("## The Rule Ids")[1] ?? "";
  const body = section.split(/^## /m)[0] ?? "";
  return [...body.matchAll(/^- `([a-z0-9-]+)` — /gm)].map((m) => m[1]!);
}

/** The default each documented row claims: `Default: enabled` / `disabled`,
 *  bold or plain. */
function documentedDefaults(): Record<string, boolean> {
  const section = SKILL.split("## The Rule Ids")[1] ?? "";
  const body = section.split(/^## /m)[0] ?? "";
  const out: Record<string, boolean> = {};
  for (const m of body.matchAll(/^- `([a-z0-9-]+)` — .*?Default: \*{0,2}(enabled|disabled)\*{0,2}\./gm)) {
    out[m[1]!] = m[2] === "enabled";
  }
  return out;
}

describe("skills/bootstrap/SKILL.md — the CLI is the only front (BST-11 AC-4/BST-11.5)", () => {
  test("names no MCP tool identifier", () => {
    const spans = codeSpans(SKILL);
    // Print the population beside the verdict: a regex that resolved to
    // nothing would otherwise read exactly like a clean file.
    expect(spans.length).toBeGreaterThan(0);

    // Every MCP tool in this repo is snake_case (`profile_list`,
    // `synapse_get`, `memory_list`), and a hypothetical `bootstrap_toggle`
    // would be too — so the shape, not a fixed name list, is what is banned.
    const toolShaped = spans.filter((s) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(s));
    expect(toolShaped).toEqual([]);

    const mcpPrefixed = [...SKILL.matchAll(/\bmcp__[a-z0-9_-]+/gi)].map((m) => m[0]);
    expect(mcpPrefixed).toEqual([]);

    // The specific clause the template carries at skills/profile/SKILL.md:23.
    expect(SKILL).not.toMatch(/preferred when the massa-ai MCP server is connected/i);
    expect(SKILL).not.toMatch(/\bprefer\b[^.\n]{0,60}\bMCP\b/i);
    expect(SKILL).not.toMatch(/\bMCP\b[^.\n]{0,60}\bpreferred\b/i);
  });

  test("says positively that no MCP tool exists and the CLI works without the server", () => {
    // The inverse direction of the ban above. Without this, deleting every
    // mention of MCP would pass the ban while removing the reason for it.
    expect(SKILL).toMatch(/no `?bootstrap_?\*?`? MCP tool exists|There is no `?bootstrap/i);
    expect(SKILL).toMatch(/MCP server is unreachable/i);
    expect(SKILL).toContain("massa-ai-config");
  });

  test("advertises the whole documented command surface (BST-11 AC-2)", () => {
    for (const sub of ["bootstrap list", "bootstrap show", "bootstrap enable", "bootstrap disable"]) {
      expect(SKILL).toContain(sub);
    }
    expect(SKILL).toContain("--dry-run");
  });
});

describe("skills/bootstrap/SKILL.md — documented ids match the registry (BST-12 AC-4)", () => {
  test("the documented id list is exactly the registry's nine, in registry order", () => {
    const documented = documentedRuleIds();
    const registry = [...BOOTSTRAP_RULE_IDS];

    const missing = registry.filter((id) => !documented.includes(id));
    const extra = documented.filter((id) => !registry.includes(id));
    // Named divergence, which is what AC-4 asks for — a bare toEqual would
    // report two arrays and leave the reader to diff them.
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });

    expect(documented).toEqual(registry);
    expect(documented.length).toBe(9);
  });

  test("each documented default matches the registry default", () => {
    const documented = documentedDefaults();
    expect(Object.keys(documented).length).toBe(BOOTSTRAP_RULES.length);
    const divergent = BOOTSTRAP_RULES.filter((r) => documented[r.id] !== r.defaultEnabled).map(
      (r) => r.id,
    );
    expect(divergent).toEqual([]);
    // The one rule that ships off — asserted by name, so a registry flip that
    // also flipped the doc in the same direction still has to be deliberate.
    expect(documented["code-comments"]).toBe(false);
  });

  test("no id is described as protected or non-toggleable (BST-09 AC-3)", () => {
    expect(SKILL).toMatch(/no protected subset|every one of them can be switched both ways/i);
    expect(SKILL).toContain("massa-ai-config bootstrap enable massa-ai-router");
  });
});

describe("skills/bootstrap/SKILL.md — relays the engine's report (BST-11 AC-5, BST-10 AC-10a)", () => {
  test("relays written-not-wired with its --apply remedy, and never as success", () => {
    expect(SKILL).toContain("written-not-wired");
    expect(SKILL).toContain("scripts/install-skills.sh --apply");
    expect(SKILL).toMatch(/never (collapse|report) this .{0,40}(into `?written`?|as success)/i);
  });

  test("names every status literal the formatter can print", () => {
    for (const status of ["written", "written-not-wired", "skipped", "failed"]) {
      expect(SKILL).toContain(status);
    }
    expect(SKILL).toMatch(/no host installed/i);
    expect(SKILL).toMatch(/ignored persisted/i);
  });

  test("states the restart requirement and forbids claiming a toggle is live before it", () => {
    expect(SKILL).toMatch(/host session restart is required/i);
    expect(SKILL).toMatch(/never claim a toggle is live before/i);
  });
});

describe("skills/bootstrap/SKILL.md — frontmatter (skills.yml validation)", () => {
  test("carries the frontmatter fence, name and description the CI validator greps for", () => {
    const lines = SKILL.split("\n");
    expect(lines[0]).toBe("---");
    expect(SKILL).toMatch(/^name: bootstrap$/m);
    expect(SKILL).toMatch(/^description: .+/m);
    // Charter-only fields belong to skills/agents/*, never a top-level skill.
    expect(SKILL).not.toMatch(/^ {2}model_tier:/m);
    expect(SKILL).not.toMatch(/^ {2}model_hint:/m);
  });
});
