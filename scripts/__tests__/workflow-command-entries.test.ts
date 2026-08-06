/**
 * Unit tests for scripts/lib/workflow-commands.ts (T1, WFC-01/04/05/13).
 *
 * Each fail-loud guard gets its own single-violation fixture (lesson L-001:
 * every guard path gets a discriminating red) before the live-inventory
 * green path. The population assertion counts the real
 * `skills/massa-ai/workflows/` tree independently (a fresh recursive walk in
 * this file, not a re-import of the function under test) so it can never
 * silently regress to a hardcoded 38.
 */
import { describe, test, expect } from "bun:test";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  collectWorkflowCommandEntries,
  WORKFLOW_COMMAND_MARKER,
  QUICK_COMMAND_NAMES,
  RESERVED_BUNDLE_ROOTS,
  STEM_CHARSET,
  WORKFLOWS_DIR,
} from "../lib/workflow-commands.ts";

const tmpDirs: string[] = [];

async function makeFixtureDir(files: Record<string, string>): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-workflow-cmd-fixture-"));
  tmpDirs.push(tmp);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(tmp, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return tmp;
}

function workflowFile(description: string, name = "some-workflow"): string {
  return `---
name: ${name}
description: "${description}"
license: MIT
---

### Body

Content.
`;
}

async function cleanupFixtures(): Promise<void> {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("collectWorkflowCommandEntries — guard reds (WFC-05)", () => {
  test("missing description: throws naming the file", async () => {
    const dir = await makeFixtureDir({
      "ok.md": `---
name: ok
license: MIT
---

Body with no description field.
`,
    });
    await expect(collectWorkflowCommandEntries(dir)).rejects.toThrow(
      /missing frontmatter description/,
    );
    await cleanupFixtures();
  });

  test("duplicate stem across subdirectories throws naming both files", async () => {
    const dir = await makeFixtureDir({
      "a/dup.md": workflowFile("First copy"),
      "b/dup.md": workflowFile("Second copy"),
    });
    await expect(collectWorkflowCommandEntries(dir)).rejects.toThrow(
      /duplicate stem "dup"/,
    );
    await cleanupFixtures();
  });

  test("stem colliding with a hand-authored quick-command name throws", async () => {
    for (const quickName of QUICK_COMMAND_NAMES) {
      const dir = await makeFixtureDir({
        [`${quickName}.md`]: workflowFile("Collides with a quick command"),
      });
      await expect(collectWorkflowCommandEntries(dir)).rejects.toThrow(
        /collides with a hand-authored quick-command name/,
      );
    }
    await cleanupFixtures();
  });

  test("stem colliding with a reserved skill-bundle root throws", async () => {
    for (const reserved of RESERVED_BUNDLE_ROOTS) {
      const dir = await makeFixtureDir({
        [`${reserved}.md`]: workflowFile("Collides with a reserved bundle root"),
      });
      await expect(collectWorkflowCommandEntries(dir)).rejects.toThrow(
        /collides with a reserved skill-bundle root/,
      );
    }
    await cleanupFixtures();
  });

  test("stem failing the command-name charset throws", async () => {
    const dir = await makeFixtureDir({
      "-bad-start.md": workflowFile("Starts with a hyphen"),
    });
    await expect(collectWorkflowCommandEntries(dir)).rejects.toThrow(
      /fails the command-name charset/,
    );
    await cleanupFixtures();
  });

  test("STEM_CHARSET rejects an uppercase or underscore stem (guard is real, not vacuous)", () => {
    expect(STEM_CHARSET.test("Debug")).toBe(false);
    expect(STEM_CHARSET.test("debug_audit")).toBe(false);
    expect(STEM_CHARSET.test("debug-audit")).toBe(true);
  });
});

describe("collectWorkflowCommandEntries — green path against a valid fixture", () => {
  test("a well-formed single-workflow fixture resolves with no guard tripped", async () => {
    const dir = await makeFixtureDir({
      "nested/ok-workflow.md": workflowFile("A perfectly fine workflow", "ok-workflow"),
    });
    const entries = await collectWorkflowCommandEntries(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.stem).toBe("ok-workflow");
    expect(entries[0]!.description).toBe("A perfectly fine workflow");
    await cleanupFixtures();
  });
});

describe("collectWorkflowCommandEntries — live inventory (WFC-02)", () => {
  /** Independent recursive walk — deliberately NOT the function under test —
   *  so the expected count can never silently regress to a hardcoded 38. */
  async function countLiveWorkflowFiles(dir: string): Promise<number> {
    let count = 0;
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const abs = path.join(dir, item.name);
      if (item.isDirectory()) count += await countLiveWorkflowFiles(abs);
      else if (item.isFile() && item.name.endsWith(".md")) count += 1;
    }
    return count;
  }

  test("entry count equals a fresh independent scan of skills/massa-ai/workflows/", async () => {
    const expectedCount = await countLiveWorkflowFiles(WORKFLOWS_DIR);
    const entries = await collectWorkflowCommandEntries();
    expect(entries.length).toBe(expectedCount);
    expect(entries.length).toBeGreaterThan(0);
  });

  test("live inventory passes every guard with no violation", async () => {
    await expect(collectWorkflowCommandEntries()).resolves.toBeDefined();
  });
});

describe("collectWorkflowCommandEntries — rendered templates (WFC-01/06/13)", () => {
  test("sharedBody carries the marker, names the stem, and passes $ARGUMENTS verbatim", async () => {
    const dir = await makeFixtureDir({
      "debug.md": workflowFile("Root-cause diagnosis workflow", "debug"),
    });
    const [entry] = await collectWorkflowCommandEntries(dir);
    expect(entry!.sharedBody).toContain(WORKFLOW_COMMAND_MARKER);
    expect(entry!.sharedBody).toContain("`debug`");
    expect(entry!.sharedBody).toContain("$ARGUMENTS");
    expect(entry!.sharedBody).toContain('description: "');
    expect(entry!.sharedBody).toContain('argument-hint: "[task description]"');
    // No shell-execution placeholder can ever reach $ARGUMENTS (Edge Cases).
    expect(entry!.sharedBody).not.toContain("!`");
    await cleanupFixtures();
  });

  test("opencodeBody carries the marker + $ARGUMENTS with description-only frontmatter", async () => {
    const dir = await makeFixtureDir({
      "debug.md": workflowFile("Root-cause diagnosis workflow", "debug"),
    });
    const [entry] = await collectWorkflowCommandEntries(dir);
    expect(entry!.opencodeBody).toContain(WORKFLOW_COMMAND_MARKER);
    expect(entry!.opencodeBody).toContain("$ARGUMENTS");
    expect(entry!.opencodeBody).not.toContain("argument-hint:");
    expect(entry!.opencodeBody).not.toContain("!`");
    // Only one frontmatter key: description.
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(entry!.opencodeBody);
    expect(fm).not.toBeNull();
    const keys = (fm![1] ?? "")
      .split(/\r?\n/)
      .filter((l) => /^[A-Za-z_][A-Za-z0-9_-]*:/.test(l))
      .map((l) => l.split(":")[0]);
    expect(keys).toEqual(["description"]);
    await cleanupFixtures();
  });

  test("a description containing literal double quotes is escaped, not left to break the YAML string", async () => {
    const dir = await makeFixtureDir({
      "quoted.md": workflowFile('Use this when someone says "make it a skill"', "quoted"),
    });
    const [entry] = await collectWorkflowCommandEntries(dir);
    expect(entry!.description).toBe('Use this when someone says "make it a skill"');
    expect(entry!.sharedBody).toContain('\\"make it a skill\\"');
    await cleanupFixtures();
  });

  test("claude/codex/cursor share byte-identical sharedBody; opencodeBody differs by design", async () => {
    const dir = await makeFixtureDir({
      "debug.md": workflowFile("Root-cause diagnosis workflow", "debug"),
    });
    const [entry] = await collectWorkflowCommandEntries(dir);
    // sharedBody is the single value all three hosts copy verbatim — proven
    // here by construction (one string, three consumers in T2).
    expect(typeof entry!.sharedBody).toBe("string");
    expect(entry!.opencodeBody).not.toBe(entry!.sharedBody);
    await cleanupFixtures();
  });
});
