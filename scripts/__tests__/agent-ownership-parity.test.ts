/**
 * Agent-file ownership parity (NAM AC-4, T5): the bash predicates inlined in
 * every plugin installer and in scripts/lib/installer-shared.sh must be
 * byte-identical, and must give the same verdict as the TS twin
 * (packages/shared/src/profile-switch/ownership.ts) on one fixture set.
 * Expected verdicts are pinned too, so the two languages cannot agree on a
 * wrong answer.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  OWNED_MARKER_MD,
  isOwnedAgentFile,
  isOwnedAgentLink,
} from "../../packages/shared/src/profile-switch/ownership.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const BLOCK_START = "# >>> massa-ai agent ownership predicates >>>";
const BLOCK_END = "# <<< massa-ai agent ownership predicates <<<";
const CARRIERS = [
  "apps/claude-plugin/install.sh",
  "apps/codex-plugin/install.sh",
  "apps/cursor-plugin/install.sh",
  "apps/opencode-plugin/install.sh",
  "scripts/lib/installer-shared.sh",
];

function extractBlock(rel: string): string {
  const text = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) throw new Error(`${rel}: ownership block not found`);
  return text.slice(start, end + BLOCK_END.length);
}

const MARKED = `---\nname: builder\n---\n${OWNED_MARKER_MD}\nbody\n`;
const UNMARKED = "---\nname: builder\n---\nmy own builder\n";

/** name → [content, expected is_owned_agent verdict] for regular .md files. */
const MD_FIXTURES: Record<string, [string, boolean]> = {
  "marked.md": [MARKED, true],
  "unmarked.md": [UNMARKED, false],
  "marker-mid-body.md": [`---\nname: x\n---\nintro\n${OWNED_MARKER_MD}\n`, false],
  "marker-line1-no-frontmatter.md": [`${OWNED_MARKER_MD}\nbody\n`, false],
  "unclosed-frontmatter.md": [`---\nname: x\n${OWNED_MARKER_MD}\n`, false],
  "marker-no-trailing-newline.md": [`---\nname: x\n---\n${OWNED_MARKER_MD}`, true],
  "crlf-marker.md": [`---\r\nname: x\r\n---\r\n${OWNED_MARKER_MD}\r\n`, false],
  "empty.md": ["", false],
  "massa-ai-reviewer.md": [UNMARKED, true],
  "massa-ai-verification-agent.md": ["", true],
  "massa-ai-mine.md": [UNMARKED, false],
};

/** name → [content, expected is_owned_agent_toml verdict]. */
const TOML_FIXTURES: Record<string, [string, boolean]> = {
  "marked.toml": ['# massa-ai-owned\nname = "builder"\n', true],
  "unmarked.toml": ['name = "builder"\n', false],
  "massa-ai-builder.toml": ['name = "builder"\n', false],
  "marker-second-line.toml": ['name = "x"\n# massa-ai-owned\n', false],
  "empty.toml": ["", false],
};

let root: string;
let agentsDir: string;
/** link name → [target (relative to root when not absolute), expected is_owned_agent_link verdict]. */
let LINK_FIXTURES: Record<string, [string, boolean]>;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-ownership-parity-"));
  agentsDir = path.join(root, "agents");
  fs.mkdirSync(agentsDir);
  for (const [name, [content]] of Object.entries({ ...MD_FIXTURES, ...TOML_FIXTURES })) {
    fs.writeFileSync(path.join(agentsDir, name), content);
  }
  const elsewhere = path.join(root, "dotfiles");
  fs.mkdirSync(elsewhere);
  fs.writeFileSync(path.join(elsewhere, "marked-target.md"), MARKED);
  fs.writeFileSync(path.join(elsewhere, "unmarked-target.md"), UNMARKED);
  LINK_FIXTURES = {
    "bundle.md": ["/gone/apps/opencode-plugin/agents/bundle.md", true],
    "variant.md": ["/h/.config/opencode/plugins/massa-ai/agent-profiles/work/variant.md", true],
    "bundle-other-base.md": ["/gone/apps/opencode-plugin/agents/elsewhere.md", false],
    "to-marked.md": [path.join(elsewhere, "marked-target.md"), true],
    "to-unmarked.md": [path.join(elsewhere, "unmarked-target.md"), false],
    "dangling.md": [path.join(elsewhere, "missing.md"), false],
    "massa-ai-navigator.md": ["/anywhere/at/all.md", true],
    "massa-ai-mine-link.md": ["/anywhere/at/all.md", false],
  };
  const linksDir = path.join(root, "links");
  fs.mkdirSync(linksDir);
  for (const [name, [target]] of Object.entries(LINK_FIXTURES)) {
    fs.symlinkSync(target, path.join(linksDir, name));
  }
  // A symlink to a marked .md is never an owned regular file (claude/cursor/codex).
  fs.symlinkSync(path.join(elsewhere, "marked-target.md"), path.join(agentsDir, "symlink-to-marked.md"));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Runs one bash predicate over paths; returns path → verdict. */
function bashVerdicts(fn: string, paths: string[]): Record<string, boolean> {
  const script = `${extractBlock(CARRIERS[0]!)}\nfor p in "$@"; do if ${fn} "$p"; then echo "1"; else echo "0"; fi; done\n`;
  const res = spawnSync("bash", ["-c", script, "bash", ...paths], { encoding: "utf8" });
  expect(res.status).toBe(0);
  const lines = res.stdout.trim().split("\n");
  expect(lines.length).toBe(paths.length);
  return Object.fromEntries(paths.map((p, i) => [p, lines[i] === "1"]));
}

describe("agent ownership predicates — one definition, two languages", () => {
  test("every carrier holds a byte-identical predicate block", () => {
    const blocks = CARRIERS.map(extractBlock);
    for (const [i, block] of blocks.entries()) {
      expect(`${CARRIERS[i]}\n${block}`).toBe(`${CARRIERS[i]}\n${blocks[0]}`);
    }
  });

  test("the legacy name list is the same 18 names in bash and TS", async () => {
    const { LEGACY_AGENT_NAMES } = await import("../../packages/shared/src/profile-switch/ownership.ts");
    const m = /MASSA_AI_LEGACY_AGENT_NAMES=" ([^"]+) "/.exec(extractBlock(CARRIERS[0]!));
    expect(m![1]!.split(" ")).toEqual([...LEGACY_AGENT_NAMES]);
    expect(LEGACY_AGENT_NAMES.length).toBe(18);
  });

  test("is_owned_agent (claude/cursor) == isOwnedAgentFile on .md fixtures, and both match the pinned verdict", () => {
    const names = [...Object.keys(MD_FIXTURES), "symlink-to-marked.md"];
    const paths = names.map((n) => path.join(agentsDir, n));
    const bash = bashVerdicts("is_owned_agent", paths);
    for (const [i, p] of paths.entries()) {
      const expected = MD_FIXTURES[names[i]!]?.[1] ?? false;
      expect(`${names[i]} bash=${bash[p]} ts=${isOwnedAgentFile(p)}`).toBe(
        `${names[i]} bash=${expected} ts=${expected}`,
      );
    }
  });

  test("is_owned_agent_toml (codex) == isOwnedAgentFile on .toml fixtures, and both match the pinned verdict", () => {
    const names = Object.keys(TOML_FIXTURES);
    const paths = names.map((n) => path.join(agentsDir, n));
    const bash = bashVerdicts("is_owned_agent_toml", paths);
    for (const [i, p] of paths.entries()) {
      const expected = TOML_FIXTURES[names[i]!]![1];
      expect(`${names[i]} bash=${bash[p]} ts=${isOwnedAgentFile(p)}`).toBe(
        `${names[i]} bash=${expected} ts=${expected}`,
      );
    }
  });

  test("is_owned_agent_link (opencode) == isOwnedAgentLink on symlink fixtures, and a regular file is never owned", () => {
    const names = Object.keys(LINK_FIXTURES);
    const paths = [...names.map((n) => path.join(root, "links", n)), path.join(agentsDir, "marked.md")];
    const bash = bashVerdicts("is_owned_agent_link", paths);
    for (const [i, p] of paths.entries()) {
      const name = names[i] ?? "regular marked.md";
      const expected = LINK_FIXTURES[name]?.[1] ?? false;
      expect(`${name} bash=${bash[p]} ts=${isOwnedAgentLink(p)}`).toBe(`${name} bash=${expected} ts=${expected}`);
    }
  });
});
