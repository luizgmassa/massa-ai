/**
 * Emit + marker-scoped prune unit tests for generate-skill-artifacts.ts's
 * workflow-command branch (T2, WFC-02/03/06).
 *
 * Runs entirely against scratch temp dirs via emitAll's injectable
 * targetRoots/hosts seam — the real checked-in apps/*-plugin trees are never
 * written by this file. The live workflow inventory (skills/massa-ai/
 * workflows/) IS read (collectWorkflowCommandEntries has no seam for that in
 * production code), so counts below are always scan-derived, never
 * hardcoded.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { emitAll } from "../generate-skill-artifacts.ts";
import { collectWorkflowCommandEntries, WORKFLOW_COMMAND_MARKER } from "../lib/workflow-commands.ts";

const tmpDirs: string[] = [];

async function makeTmpRoot(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-workflow-cmd-emit-"));
  tmpDirs.push(tmp);
  return tmp;
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("emitAll — workflow commands, per-host shape (T2, WFC-02)", () => {
  test("claude: one commands/<stem>.md per live workflow, each carrying the marker", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots = { claude: path.join(tmp, "claude") };
    await emitAll(targetRoots, ["claude"]);

    const entries = await collectWorkflowCommandEntries();
    const commandsDir = path.join(targetRoots.claude, "commands");
    for (const entry of entries) {
      const content = await fs.readFile(path.join(commandsDir, `${entry.stem}.md`), "utf8");
      expect(content).toContain(WORKFLOW_COMMAND_MARKER);
      expect(content).toBe(entry.sharedBody);
    }
  });

  test("codex: one skills/<stem>.md per live workflow", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots = { codex: path.join(tmp, "codex") };
    await emitAll(targetRoots, ["codex"]);

    const entries = await collectWorkflowCommandEntries();
    const skillsDir = path.join(targetRoots.codex, "skills");
    for (const entry of entries) {
      const content = await fs.readFile(path.join(skillsDir, `${entry.stem}.md`), "utf8");
      expect(content).toBe(entry.sharedBody);
    }
  });

  test("cursor: one skills/<stem>/SKILL.md per live workflow", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots = { cursor: path.join(tmp, "cursor") };
    await emitAll(targetRoots, ["cursor"]);

    const entries = await collectWorkflowCommandEntries();
    const skillsDir = path.join(targetRoots.cursor, "skills");
    for (const entry of entries) {
      const content = await fs.readFile(path.join(skillsDir, entry.stem, "SKILL.md"), "utf8");
      expect(content).toBe(entry.sharedBody);
    }
  });

  test("opencode: one command/massa-ai-<stem>.md per live workflow, opencode variant body", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots = { opencode: path.join(tmp, "opencode") };
    await emitAll(targetRoots, ["opencode"]);

    const entries = await collectWorkflowCommandEntries();
    const commandDir = path.join(targetRoots.opencode, "command");
    for (const entry of entries) {
      const content = await fs.readFile(path.join(commandDir, `massa-ai-${entry.stem}.md`), "utf8");
      expect(content).toBe(entry.opencodeBody);
      expect(content).not.toContain("argument-hint:");
    }
  });
});

describe("emitAll — workflow commands, double-run byte-idempotency (WFC-06)", () => {
  test("two consecutive emits produce byte-identical trees for all three shared hosts", async () => {
    const tmp = await makeTmpRoot();
    const hosts = ["claude", "codex", "cursor"] as const;
    const targetRoots = Object.fromEntries(hosts.map((h) => [h, path.join(tmp, h)]));

    await emitAll(targetRoots, hosts);
    const entries = await collectWorkflowCommandEntries();
    const firstRun = new Map<string, string>();
    for (const host of hosts) {
      for (const entry of entries) {
        const p =
          host === "cursor"
            ? path.join(targetRoots[host]!, "skills", entry.stem, "SKILL.md")
            : path.join(targetRoots[host]!, host === "claude" ? "commands" : "skills", `${entry.stem}.md`);
        firstRun.set(`${host}:${entry.stem}`, await fs.readFile(p, "utf8"));
      }
    }

    await emitAll(targetRoots, hosts);
    for (const host of hosts) {
      for (const entry of entries) {
        const p =
          host === "cursor"
            ? path.join(targetRoots[host]!, "skills", entry.stem, "SKILL.md")
            : path.join(targetRoots[host]!, host === "claude" ? "commands" : "skills", `${entry.stem}.md`);
        const second = await fs.readFile(p, "utf8");
        expect(second).toBe(firstRun.get(`${host}:${entry.stem}`));
      }
    }
  });
});

describe("emitAll — workflow commands, scratch add/delete set-diff (WFC-03)", () => {
  test("emit is a full re-derivation from the live scan: a manually removed emitted file is restored exactly on re-run, matching the live stem set", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots = { claude: path.join(tmp, "claude") };
    await emitAll(targetRoots, ["claude"]);
    const entries = await collectWorkflowCommandEntries();

    const commandsDir = path.join(targetRoots.claude, "commands");
    const before = (await fs.readdir(commandsDir)).sort();
    expect(before).toEqual(entries.map((e) => `${e.stem}.md`).sort());

    // Simulate a workflow deletion by removing one emitted file directly,
    // then re-running emit: prune-before-emit must restore it exactly
    // (full re-derivation, WFC-03's "gain or lose exactly that stem").
    const sampleStem = entries[0]!.stem;
    await fs.rm(path.join(commandsDir, `${sampleStem}.md`));
    await emitAll(targetRoots, ["claude"]);
    const after = (await fs.readdir(commandsDir)).sort();
    expect(after).toEqual(entries.map((e) => `${e.stem}.md`).sort());
  });
});

describe("emitAll — workflow commands, marker-scoped prune (WFC-06)", () => {
  test("a stale marker-bearing file (source workflow deleted) is pruned by re-emit", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots = { claude: path.join(tmp, "claude") };
    const commandsDir = path.join(targetRoots.claude, "commands");
    await fs.mkdir(commandsDir, { recursive: true });
    const staleFile = path.join(commandsDir, "deleted-workflow.md");
    await fs.writeFile(
      staleFile,
      `---\ndescription: "stale"\n---\n${WORKFLOW_COMMAND_MARKER}\n\nStale content.\n`,
    );

    await emitAll(targetRoots, ["claude"]);

    await expect(fs.access(staleFile)).rejects.toThrow();
  });

  test("a hand-authored quick-command file (no marker) survives prune + re-emit", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots = { claude: path.join(tmp, "claude") };
    const commandsDir = path.join(targetRoots.claude, "commands");
    await fs.mkdir(commandsDir, { recursive: true });
    const quickFile = path.join(commandsDir, "def.md");
    const quickContent = "---\ndescription: hand-authored quick command\n---\n\nBody, no marker.\n";
    await fs.writeFile(quickFile, quickContent);

    await emitAll(targetRoots, ["claude"]);

    const survived = await fs.readFile(quickFile, "utf8");
    expect(survived).toBe(quickContent);
  });

  test("a hand-authored cursor quick-skill dir (skills/def/SKILL.md, no marker) survives prune + re-emit", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots = { cursor: path.join(tmp, "cursor") };
    const quickDir = path.join(targetRoots.cursor, "skills", "def");
    await fs.mkdir(quickDir, { recursive: true });
    const quickFile = path.join(quickDir, "SKILL.md");
    const quickContent = "---\ndescription: hand-authored quick skill\n---\n\nBody, no marker.\n";
    await fs.writeFile(quickFile, quickContent);

    await emitAll(targetRoots, ["cursor"]);

    const survived = await fs.readFile(quickFile, "utf8");
    expect(survived).toBe(quickContent);
  });
});
