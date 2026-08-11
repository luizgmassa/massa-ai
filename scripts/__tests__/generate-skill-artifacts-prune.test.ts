/**
 * Prune-before-emit unit tests for scripts/generate-skill-artifacts.ts
 * (T1, UGB-03/04).
 *
 * emitAll() must remove each managed root's prior contents — derived only
 * from managedRootsFor()/hookBinaryHosts(), never a second literal list —
 * before copying, so a file whose source was deleted does not survive
 * regeneration as a stale artifact. Everything OUTSIDE those managed roots
 * (hand-authored quick skills that live directly under `skills/`, the
 * `apps/{codex,cursor}-plugin/skills/{def,find,graph,index,map,status}`
 * class, and `hooks.json` beside the generated `hooks/massa-ai-hook`) must
 * never be touched by prune.
 *
 * All assertions run against a scratch temp dir via emitAll's injectable
 * targetRoots/hosts/capsLookup seam (same pattern as the fixture-host block
 * in host-capabilities.test.ts) — the real checked-in `apps/*-plugin` trees
 * are never written by this file.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { emitAll, managedRootsFor, type CapsLookup } from "../generate-skill-artifacts.ts";
import { capabilitiesFor, type Host, type HostCapabilities } from "../lib/host-capabilities.ts";

const tmpDirs: string[] = [];

async function makeTmpRoot(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "massa-ai-skill-prune-"));
  tmpDirs.push(tmp);
  return tmp;
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("generate-skill-artifacts emitAll — prune-before-emit (T1, UGB-04)", () => {
  test("a stale file inside a managed root (skills/agents/) vanishes after emit", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots: Record<string, string> = { codex: path.join(tmp, "codex") };

    const staleFile = path.join(targetRoots.codex!, "skills", "agents", "deleted-agent", "SKILL.md");
    await fs.mkdir(path.dirname(staleFile), { recursive: true });
    await fs.writeFile(staleFile, "stale content from a deleted source");

    await emitAll(targetRoots, ["codex"]);

    await expect(fs.access(staleFile)).rejects.toThrow();
  });

  test("a stale file inside skills/massa-ai/ vanishes after emit", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots: Record<string, string> = { claude: path.join(tmp, "claude") };

    const staleFile = path.join(targetRoots.claude!, "skills", "massa-ai", "stale-reference.md");
    await fs.mkdir(path.dirname(staleFile), { recursive: true });
    await fs.writeFile(staleFile, "stale");

    await emitAll(targetRoots, ["claude"]);

    await expect(fs.access(staleFile)).rejects.toThrow();
  });

  test("a hand-authored quick-skill file beside the managed roots (apps/codex-plugin/skills/def.md class) survives emit", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots: Record<string, string> = { codex: path.join(tmp, "codex") };

    // Lives directly under skills/, a sibling of the managed
    // skills/{massa-ai,persona-router,profile,agents} roots — never inside one.
    const quickSkill = path.join(targetRoots.codex!, "skills", "def.md");
    await fs.mkdir(path.dirname(quickSkill), { recursive: true });
    await fs.writeFile(quickSkill, "# quick skill\nhand-authored, not generated");

    await emitAll(targetRoots, ["codex"]);

    const survived = await fs.readFile(quickSkill, "utf8");
    expect(survived).toBe("# quick skill\nhand-authored, not generated");
  });

  test("hooks.json beside hooks/massa-ai-hook survives emit (file-level prune, not directory-level)", async () => {
    const tmp = await makeTmpRoot();
    const targetRoots: Record<string, string> = { codex: path.join(tmp, "codex") };

    const hooksJson = path.join(targetRoots.codex!, "hooks", "hooks.json");
    await fs.mkdir(path.dirname(hooksJson), { recursive: true });
    await fs.writeFile(hooksJson, JSON.stringify({ hooks: [] }));

    await emitAll(targetRoots, ["codex"]);

    const survived = await fs.readFile(hooksJson, "utf8");
    expect(survived).toBe(JSON.stringify({ hooks: [] }));
    // The generated hook binary itself is present (overwritten, not merely spared).
    const hookStat = await fs.stat(path.join(targetRoots.codex!, "hooks", "massa-ai-hook"));
    expect(hookStat.isFile()).toBe(true);
  });

  test("a stale hook-binary file is removed when a host stops being a hookBinaryDelivery: real-copy host (capability-table-driven prune)", async () => {
    const tmp = await makeTmpRoot();
    const FIXTURE_HOST = "fixturehost";
    const targetRoots: Record<string, string> = { [FIXTURE_HOST]: path.join(tmp, FIXTURE_HOST) };

    const withHookCaps: HostCapabilities = {
      artifactExtension: "md",
      agentIdentity: "filename",
      ownershipMarker: "body",
      forwardsUnknownFrontmatter: false,
      hookBinaryDelivery: "real-copy",
      extraManagedRoots: [],
      sessionStartStdoutDelivered: null,
      handoffInjectionPoint: null,
      toolGating: "none",
    };
    const withHookLookup: CapsLookup = (host) =>
      host === FIXTURE_HOST ? withHookCaps : capabilitiesFor(host as Host);
    await emitAll(targetRoots, [FIXTURE_HOST], withHookLookup);

    const hookPath = path.join(targetRoots[FIXTURE_HOST]!, "hooks", "massa-ai-hook");
    await expect(fs.stat(hookPath)).resolves.toBeTruthy();

    const withoutHookCaps: HostCapabilities = { ...withHookCaps, hookBinaryDelivery: "none" };
    const withoutHookLookup: CapsLookup = (host) =>
      host === FIXTURE_HOST ? withoutHookCaps : capabilitiesFor(host as Host);
    await emitAll(targetRoots, [FIXTURE_HOST], withoutHookLookup);

    await expect(fs.access(hookPath)).rejects.toThrow();
  });

  test("prune list is derived from managedRootsFor() — the parent 'skills' dir itself is never a pruned root", () => {
    // Structural guard: pruning the parent would delete hand-authored quick
    // skills that live directly under it (apps/codex-plugin/skills/def.md).
    expect(managedRootsFor("claude")).not.toContain("skills");
  });
});
