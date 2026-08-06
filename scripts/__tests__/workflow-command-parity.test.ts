/**
 * Workflow-command cross-host contract test (T4, WFC-09/WFC-10).
 *
 * Mirrors skill-artifact-parity.test.ts's shape: a `beforeAll` sentinel
 * fails loudly, naming `bun run generate:artifacts`, if the checked-in
 * bundles are absent (AD-016 — generated build output, gitignored, never
 * checked in). Everything below reads the live checked-out
 * apps/*-plugin trees plus a fresh scan of skills/massa-ai/workflows/ — no
 * count in this file is ever a hardcoded 38.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import {
  collectWorkflowCommandEntries,
  WORKFLOW_COMMAND_MARKER,
  QUICK_COMMAND_NAMES,
} from "../lib/workflow-commands.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");

beforeAll(async () => {
  const sentinel = path.join(REPO_ROOT, "apps/claude-plugin/commands/debug.md");
  try {
    await fs.access(sentinel);
  } catch {
    throw new Error(
      `Generated workflow-command bundle missing at ${sentinel} — run 'bun run generate:artifacts' first.`,
    );
  }
});

describe("workflow-command parity — per-host count equals live scan (WFC-10)", () => {
  test("claude: commands/ generated-file count equals the live workflow scan", async () => {
    const entries = await collectWorkflowCommandEntries();
    const dir = path.join(REPO_ROOT, "apps/claude-plugin/commands");
    const mdFiles = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name);
    let generatedCount = 0;
    for (const f of mdFiles) {
      const content = await fs.readFile(path.join(dir, f), "utf8");
      if (content.includes(WORKFLOW_COMMAND_MARKER)) generatedCount++;
    }
    expect(generatedCount).toBe(entries.length);
  });

  test("codex: skills/ generated-file count equals the live workflow scan", async () => {
    const entries = await collectWorkflowCommandEntries();
    const dir = path.join(REPO_ROOT, "apps/codex-plugin/skills");
    const mdFiles = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name);
    let generatedCount = 0;
    for (const f of mdFiles) {
      const content = await fs.readFile(path.join(dir, f), "utf8");
      if (content.includes(WORKFLOW_COMMAND_MARKER)) generatedCount++;
    }
    expect(generatedCount).toBe(entries.length);
  });

  test("cursor: skills/<stem>/SKILL.md generated-dir count equals the live workflow scan", async () => {
    const entries = await collectWorkflowCommandEntries();
    const dir = path.join(REPO_ROOT, "apps/cursor-plugin/skills");
    const stemDirs = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    let generatedCount = 0;
    for (const stem of stemDirs) {
      const skillMd = path.join(dir, stem, "SKILL.md");
      const content = await fs.readFile(skillMd, "utf8").catch(() => "");
      if (content.includes(WORKFLOW_COMMAND_MARKER)) generatedCount++;
    }
    expect(generatedCount).toBe(entries.length);
  });

  test("opencode: command/ file count equals the live workflow scan", async () => {
    const entries = await collectWorkflowCommandEntries();
    const dir = path.join(REPO_ROOT, "apps/opencode-plugin/command");
    const mdFiles = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name);
    expect(mdFiles.length).toBe(entries.length);
    for (const entry of entries) {
      expect(mdFiles).toContain(`massa-ai-${entry.stem}.md`);
    }
  });
});

describe("workflow-command parity — byte identity claude == codex == cursor (WFC-10)", () => {
  test("every generated stem's on-disk body is byte-identical across claude/codex/cursor", async () => {
    const entries = await collectWorkflowCommandEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const claudeBody = await fs.readFile(
        path.join(REPO_ROOT, "apps/claude-plugin/commands", `${entry.stem}.md`),
        "utf8",
      );
      const codexBody = await fs.readFile(
        path.join(REPO_ROOT, "apps/codex-plugin/skills", `${entry.stem}.md`),
        "utf8",
      );
      const cursorBody = await fs.readFile(
        path.join(REPO_ROOT, "apps/cursor-plugin/skills", entry.stem, "SKILL.md"),
        "utf8",
      );
      expect(codexBody).toBe(claudeBody);
      expect(cursorBody).toBe(claudeBody);
      expect(claudeBody).toBe(entry.sharedBody);
    }
  });
});

describe("workflow-command parity — marker presence on disk (WFC-06/WFC-07)", () => {
  test("every generated file on every host carries the ownership marker", async () => {
    const entries = await collectWorkflowCommandEntries();
    for (const entry of entries) {
      const claudeBody = await fs.readFile(
        path.join(REPO_ROOT, "apps/claude-plugin/commands", `${entry.stem}.md`),
        "utf8",
      );
      const opencodeBody = await fs.readFile(
        path.join(REPO_ROOT, "apps/opencode-plugin/command", `massa-ai-${entry.stem}.md`),
        "utf8",
      );
      expect(claudeBody).toContain(WORKFLOW_COMMAND_MARKER);
      expect(opencodeBody).toContain(WORKFLOW_COMMAND_MARKER);
    }
  });
});

describe("workflow-command parity — description sourced from workflow frontmatter (WFC-04/WFC-13)", () => {
  async function walkMd(dir: string): Promise<string[]> {
    const out: string[] = [];
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const abs = path.join(dir, item.name);
      if (item.isDirectory()) out.push(...(await walkMd(abs)));
      else if (item.isFile() && item.name.endsWith(".md")) out.push(abs);
    }
    return out;
  }

  function unquote(s: string): string {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  test("every entry's description matches an independent read of its source workflow frontmatter", async () => {
    const workflowsDir = path.join(REPO_ROOT, "skills/massa-ai/workflows");
    const files = await walkMd(workflowsDir);
    const entries = await collectWorkflowCommandEntries();
    expect(entries.length).toBe(files.length);
    expect(entries.length).toBeGreaterThan(0);

    for (const file of files) {
      const stem = path.basename(file, ".md");
      const raw = await fs.readFile(file, "utf8");
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
      expect(block).not.toBeNull();
      const descLine = /^description:\s*(.*)$/m.exec(block![1]!);
      expect(descLine).not.toBeNull();
      const expectedDescription = unquote(descLine![1]!.trim());

      const entry = entries.find((e) => e.stem === stem);
      expect(entry).toBeDefined();
      expect(entry!.description).toBe(expectedDescription);

      // The rendered claude file embeds it too, via the "description —
      // explicit massa-ai '<stem>' workflow" field.
      const claudeBody = await fs.readFile(
        path.join(REPO_ROOT, "apps/claude-plugin/commands", `${stem}.md`),
        "utf8",
      );
      expect(claudeBody).toContain(expectedDescription.replace(/"/g, '\\"'));
    }
  });
});

describe("workflow-command parity — no shell-execution placeholders (Edge Cases)", () => {
  test("no generated command body on any host contains a shell-execution placeholder", async () => {
    const entries = await collectWorkflowCommandEntries();
    const hostFiles = [
      ...entries.map((e) => path.join(REPO_ROOT, "apps/claude-plugin/commands", `${e.stem}.md`)),
      ...entries.map((e) => path.join(REPO_ROOT, "apps/codex-plugin/skills", `${e.stem}.md`)),
      ...entries.map((e) => path.join(REPO_ROOT, "apps/cursor-plugin/skills", e.stem, "SKILL.md")),
      ...entries.map((e) => path.join(REPO_ROOT, "apps/opencode-plugin/command", `massa-ai-${e.stem}.md`)),
    ];
    for (const file of hostFiles) {
      const content = await fs.readFile(file, "utf8");
      expect(content).not.toContain("!`");
    }
  });
});

describe("workflow-command parity — the 6×3 quick files stay tracked and marker-free (WFC-06)", () => {
  const quickPaths: Array<[dir: string, files: string[]]> = [
    ["apps/claude-plugin/commands", QUICK_COMMAND_NAMES.map((n) => `${n}.md`)],
    ["apps/codex-plugin/skills", QUICK_COMMAND_NAMES.map((n) => `${n}.md`)],
    ["apps/cursor-plugin/skills", QUICK_COMMAND_NAMES.map((n) => `${n}/SKILL.md`)],
  ];

  for (const [dir, files] of quickPaths) {
    for (const rel of files) {
      test(`${dir}/${rel} is git-tracked and carries no workflow-command marker`, async () => {
        const res = spawnSync("git", ["ls-files", "--error-unmatch", `${dir}/${rel}`], {
          cwd: REPO_ROOT,
          encoding: "utf8",
        });
        expect(res.status).toBe(0);
        const content = await fs.readFile(path.join(REPO_ROOT, dir, rel), "utf8");
        expect(content).not.toContain(WORKFLOW_COMMAND_MARKER);
      });
    }
  }
});

describe("workflow-command parity — .gitignore negation lines are text-locked (WFC-09)", () => {
  // Text-level on purpose: `git check-ignore` reports an already-TRACKED path
  // as not-ignored regardless of pattern, so removing a `!` negation for a
  // tracked quick file is behaviorally invisible until a fresh clone. The
  // literal lines are the only discriminating surface (validation.md gap 1).
  const negationBlocks: Array<[star: string, negations: string[]]> = [
    [
      "apps/claude-plugin/commands/*.md",
      QUICK_COMMAND_NAMES.map((n) => `!apps/claude-plugin/commands/${n}.md`),
    ],
    [
      "apps/codex-plugin/skills/*.md",
      QUICK_COMMAND_NAMES.map((n) => `!apps/codex-plugin/skills/${n}.md`),
    ],
    [
      "apps/cursor-plugin/skills/*/SKILL.md",
      QUICK_COMMAND_NAMES.map((n) => `!apps/cursor-plugin/skills/${n}/SKILL.md`),
    ],
  ];

  test("every star pattern and all 6 quick-file negations per shared dir are present verbatim", async () => {
    const gitignore = await fs.readFile(path.join(REPO_ROOT, ".gitignore"), "utf8");
    const lines = new Set(gitignore.split("\n").map((l) => l.trim()));
    for (const [star, negations] of negationBlocks) {
      expect(lines.has(star)).toBe(true);
      for (const neg of negations) {
        expect(lines.has(neg)).toBe(true);
      }
    }
    expect(lines.has("apps/opencode-plugin/command/")).toBe(true);
  });
});

describe("workflow-command parity — generator --check drift gate is clean (WFC-07/WFC-09)", () => {
  test("bun run scripts/generate-skill-artifacts.ts --check exits 0", () => {
    const res = spawnSync(
      "bun",
      ["run", path.join(REPO_ROOT, "scripts/generate-skill-artifacts.ts"), "--check"],
      { encoding: "utf8", cwd: REPO_ROOT, timeout: 60000 },
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("No drift");
  });
});
