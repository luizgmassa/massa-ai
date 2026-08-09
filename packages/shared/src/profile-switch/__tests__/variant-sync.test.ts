/**
 * syncGeneratedVariants unit tests — real fs + mkdtemp fixtures only (no
 * mock.module("fs")), mirroring engine.test.ts's idiom. Both the
 * DESTINATION (targetHome) and the SOURCE (sourceRoot) are fabricated
 * mkdtemp trees; neither test ever touches the real $HOME or this repo's
 * own gitignored apps/*-plugin/agent-profiles/.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveHostLayout, type Host, type HostFileLayout } from "../hosts.js";
import { switchProfile } from "../engine.js";
import { syncGeneratedVariants } from "../variant-sync.js";

let home: string;
let srcRoot: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-variant-sync-home-"));
  srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-variant-sync-src-"));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(srcRoot, { recursive: true, force: true });
});

function statePath(h: string): string {
  return path.join(h, ".config", "massa-ai", "install-state.json");
}

function writeState(h: string, state: unknown): void {
  const p = statePath(h);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + "\n");
}

function layoutFor(host: Host): HostFileLayout {
  const layout = resolveHostLayout(host, { targetHome: home });
  if (layout.route !== "files") throw new Error(`expected files route for ${host}`);
  return layout;
}

/** Stages a fixture "generated" profile dir under sourceRoot/apps/<host>-plugin/agent-profiles/. */
function stageSource(host: Host, profile: string, files: Record<string, string>): void {
  const dir = path.join(srcRoot, "apps", `${host}-plugin`, "agent-profiles", profile);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
}

/** Stages a fixture "installed" variant dir directly (bypassing switchProfile). */
function stageInstalledVariant(host: Host, profile: string, files: Record<string, string>): void {
  const dir = layoutFor(host).variantDir(profile);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
}

describe("syncGeneratedVariants", () => {
  test("(a) sourceRoot null -> every host skipped, nothing written anywhere", () => {
    const results = syncGeneratedVariants({ sourceRoot: null, targetHome: home });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.status).toBe("skipped");
      expect(r.reason).toContain("no source checkout");
      expect(r.files).toBe(0);
    }
    // Nothing under home was ever touched.
    expect(fs.existsSync(path.join(home, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(home, ".codex"))).toBe(false);
    expect(fs.existsSync(path.join(home, ".config"))).toBe(false);
  });

  test("(b) cursor -> skipped via route skip", () => {
    const results = syncGeneratedVariants({ sourceRoot: srcRoot, targetHome: home, hosts: ["cursor"] });
    expect(results).toHaveLength(1);
    expect(results[0].host).toBe("cursor");
    expect(results[0].status).toBe("skipped");
    expect(results[0].reason).toContain("inherit");
  });

  test("(c) variantsRoot missing -> skipped, reason never claims the host is uninstalled (F6)", () => {
    stageSource("claude", "balanced", { "massa-ai-x.md": "v1" });
    // Deliberately do NOT stage claude's installed variantsRoot.
    const results = syncGeneratedVariants({ sourceRoot: srcRoot, targetHome: home, hosts: ["claude"] });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("skipped");
    expect(results[0].reason).toBeDefined();
    expect(results[0].reason).not.toContain("not installed");
    expect(results[0].reason).toContain("variant tree not present");
  });

  test("(d) happy path -> files land in variantsRoot/<profile>/", () => {
    stageSource("claude", "balanced", { "massa-ai-x.md": "v1" });
    stageInstalledVariant("claude", "balanced", { "massa-ai-x.md": "v0" });

    const results = syncGeneratedVariants({ sourceRoot: srcRoot, targetHome: home, hosts: ["claude"] });

    expect(results[0].status).toBe("synced");
    expect(results[0].profiles).toEqual(["balanced"]);
    expect(results[0].files).toBe(1);
    const written = fs.readFileSync(path.join(layoutFor("claude").variantDir("balanced"), "massa-ai-x.md"), "utf8");
    expect(written).toBe("v1");
  });

  test("(e) THE LIVE-SYMLINK CASE — a sync without a subsequent switchProfile call still mutates the live-active file", () => {
    stageSource("opencode", "balanced", { "massa-ai-x.md": "v1" });
    stageInstalledVariant("opencode", "balanced", { "massa-ai-x.md": "v0" });

    // switchProfile only detects a host as installed when its activeDir already exists,
    // and only copies/symlinks for a route:"file" install (detectRoute).
    fs.mkdirSync(layoutFor("opencode").activeDir, { recursive: true });
    writeState(home, {
      version: 2,
      platforms: { opencode: { root: "/x", skills: [], skillsOwner: "plugin", installRoute: "file" } },
    });

    // Create the live symlink (opencode actives are symlinks into variantsRoot — engine.ts F3).
    switchProfile({ profile: "balanced", host: "opencode", targetHome: home });
    const activeFile = path.join(layoutFor("opencode").activeDir, "massa-ai-x.md");
    expect(fs.readFileSync(activeFile, "utf8")).toBe("v0");

    // Sync only — no second switchProfile call.
    syncGeneratedVariants({ sourceRoot: srcRoot, targetHome: home });

    expect(fs.readFileSync(activeFile, "utf8")).toBe("v1");
  });

  test("(f) no .tmp residue in the destination directory after a successful sync", () => {
    stageSource("claude", "balanced", { "massa-ai-x.md": "v1" });
    stageInstalledVariant("claude", "balanced", { "massa-ai-x.md": "v0" });

    syncGeneratedVariants({ sourceRoot: srcRoot, targetHome: home, hosts: ["claude"] });

    const entries = fs.readdirSync(layoutFor("claude").variantDir("balanced"));
    expect(entries.some((e) => e.endsWith(".tmp"))).toBe(false);
  });

  test("(f) no .tmp residue after a forced write failure", () => {
    stageSource("claude", "balanced", { "massa-ai-x.md": "v1" });
    stageInstalledVariant("claude", "balanced", { "massa-ai-x.md": "v0" });

    // Force failure AFTER the temp file is successfully created, so the
    // cleanup path is actually exercised (a permission-denied directory
    // would fail before any temp file exists, which cannot discriminate a
    // missing cleanup from a correct one — see the discrimination note in
    // the task brief). Pre-create the destination filename as an existing
    // directory: writeFileSync(tempFile) still succeeds (a distinct temp
    // name), but renameSync(tempFile, destName) fails — POSIX rename(2)
    // refuses to replace a directory with a non-directory.
    const destDir = layoutFor("claude").variantDir("balanced");
    fs.rmSync(path.join(destDir, "massa-ai-x.md"), { force: true });
    fs.mkdirSync(path.join(destDir, "massa-ai-x.md"));

    const results = syncGeneratedVariants({ sourceRoot: srcRoot, targetHome: home, hosts: ["claude"] });
    expect(results[0].status).toBe("failed");
    expect(results[0].error).toBeDefined();

    const entries = fs.readdirSync(destDir);
    expect(entries.some((e) => e.endsWith(".tmp"))).toBe(false);
  });

  test("(g) retained: a profile dir present only in variantsRoot survives and is reported", () => {
    stageSource("claude", "balanced", { "massa-ai-x.md": "v1" });
    stageInstalledVariant("claude", "balanced", { "massa-ai-x.md": "v0" });
    stageInstalledVariant("claude", "legacy-only", { "massa-ai-old.md": "old" });

    const results = syncGeneratedVariants({ sourceRoot: srcRoot, targetHome: home, hosts: ["claude"] });

    expect(results[0].retained).toEqual(["legacy-only"]);
    expect(fs.existsSync(layoutFor("claude").variantDir("legacy-only"))).toBe(true);
    expect(fs.readFileSync(path.join(layoutFor("claude").variantDir("legacy-only"), "massa-ai-old.md"), "utf8")).toBe("old");
  });

  test("(h) a rejected profile directory name is skipped — not written, not thrown", () => {
    const srcDir = path.join(srcRoot, "apps", "claude-plugin", "agent-profiles");
    // Backslash is a legal POSIX filename byte (not a separator on this
    // platform) but is rejected by isSafeDirName's Windows-separator guard.
    const evilName = "evil\\name";
    fs.mkdirSync(path.join(srcDir, evilName), { recursive: true });
    fs.writeFileSync(path.join(srcDir, evilName, "massa-ai-x.md"), "v1");
    stageInstalledVariant("claude", "balanced", { "massa-ai-x.md": "v0" });

    expect(() => syncGeneratedVariants({ sourceRoot: srcRoot, targetHome: home, hosts: ["claude"] })).not.toThrow();
    const results = syncGeneratedVariants({ sourceRoot: srcRoot, targetHome: home, hosts: ["claude"] });

    expect(results[0].status).toBe("synced");
    expect(results[0].profiles).not.toContain(evilName);
    expect(fs.existsSync(path.join(layoutFor("claude").variantsRoot, evilName))).toBe(false);
  });

  test("a per-host throw is caught and reported as failed, without aborting other hosts", () => {
    stageSource("claude", "balanced", { "massa-ai-x.md": "v1" });
    stageSource("codex", "balanced", { "massa-ai-x.toml": "v1" });
    stageInstalledVariant("claude", "balanced", { "massa-ai-x.md": "v0" });
    stageInstalledVariant("codex", "balanced", { "massa-ai-x.toml": "v0" });

    // Force claude's profile dir to fail while codex stays writable.
    const claudeDest = layoutFor("claude").variantDir("balanced");
    fs.chmodSync(claudeDest, 0o500);
    try {
      const results = syncGeneratedVariants({ sourceRoot: srcRoot, targetHome: home, hosts: ["claude", "codex"] });
      const claudeResult = results.find((r) => r.host === "claude")!;
      const codexResult = results.find((r) => r.host === "codex")!;
      expect(claudeResult.status).toBe("failed");
      expect(codexResult.status).toBe("synced");
    } finally {
      fs.chmodSync(claudeDest, 0o700);
    }
  });
});
