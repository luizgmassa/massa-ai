/**
 * Bootstrap render entry point (TASK-012, BST-01 / BST-10).
 *
 * Covers the three branches of `scripts/render-bootstrap.ts`'s module
 * resolution ladder and the degrade-to-defaults path, which are the two things
 * the task's done-when list makes load-bearing:
 *
 *   - The ladder is keyed on whether bun is available, not on which files
 *     happen to be present. `installer_detect_runner`
 *     (`scripts/lib/installer-shared.sh:23-33`) returns `node` first whenever
 *     node is on PATH, and node is always on PATH here as the node-gyp build
 *     helper — so the "bun is unavailable but the source is present" case below
 *     is the one that distinguishes a correct ladder from one that would take
 *     the bun branch on no machine at all.
 *   - An unreadable `config.json` renders the registry defaults, warns naming
 *     the file and the parse failure, and writes nothing (BST-10 AC-10b). The
 *     "a real preference is honoured" case is asserted beside it, because a
 *     renderer that always rendered defaults would pass the degrade case alone.
 *
 * Every scratch home here is a `mktemp`-style directory under the OS temp dir;
 * nothing in this file reads or writes the developer's real home.
 *
 * `bun run test:scripts` runs this file; CI runs that script.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";

import {
  BOOTSTRAP_DIST_ENTRY,
  BOOTSTRAP_SOURCE_ENTRY,
  BUILD_COMMAND,
  main,
  parseArgs,
  renderBootstrapForInstaller,
  resolveRendererEntry,
  resolveRuleStateForRender,
  type BootstrapApi,
} from "../render-bootstrap.ts";

import * as bootstrapBarrel from "../../packages/shared/src/bootstrap/index.ts";
import * as sharedRootBarrel from "../../packages/shared/src/index.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "../..");
const AGENTS_SOURCE = path.join(REPO_ROOT, "skills", "AGENTS.md");
const BOOTSTRAP_START = "<!-- massa-ai:bootstrap:start -->";
const BOOTSTRAP_END = "<!-- massa-ai:bootstrap:end -->";

const api = bootstrapBarrel as unknown as BootstrapApi;

let TMP = "";

function scratch(name: string): string {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeConfig(home: string, contents: string): string {
  const configPath = path.join(home, ".config", "massa-ai", "config.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, contents);
  return configPath;
}

/** A repo root holding only what the arguments ask for, so a ladder branch can
 *  be exercised without a real checkout on either side of it. */
function fakeRepo(name: string, opts: { source?: boolean; dist?: boolean }): string {
  const root = scratch(name);
  if (opts.source) {
    const p = path.join(root, BOOTSTRAP_SOURCE_ENTRY);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "export const marker = 'source';\n");
  }
  if (opts.dist) {
    const p = path.join(root, BOOTSTRAP_DIST_ENTRY);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "export const marker = 'dist';\n");
  }
  return root;
}

beforeAll(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), "massa-ai-render-bootstrap-"));
});

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("module resolution ladder", () => {
  test("branch 1: bun plus the TypeScript source wins", () => {
    const root = fakeRepo("ladder-both", { source: true, dist: true });
    const entry = resolveRendererEntry({ repoRoot: root, hasBun: true });
    expect(entry.kind).toBe("source");
    expect(entry.specifier).toBe(path.join(root, BOOTSTRAP_SOURCE_ENTRY));
  });

  test("branch 2: without bun the source is not taken, even when it is present", () => {
    const root = fakeRepo("ladder-nobun", { source: true, dist: true });
    const entry = resolveRendererEntry({ repoRoot: root, hasBun: false });
    expect(entry.kind).toBe("dist");
    expect(entry.specifier).toBe(path.join(root, BOOTSTRAP_DIST_ENTRY));
  });

  test("branch 2: with bun but no source, the built dist is taken", () => {
    const root = fakeRepo("ladder-distonly", { dist: true });
    const entry = resolveRendererEntry({ repoRoot: root, hasBun: true });
    expect(entry.kind).toBe("dist");
  });

  test("branch 3: neither reachable throws BootstrapRendererUnavailableError", () => {
    const root = fakeRepo("ladder-none", {});
    let thrown: Error | undefined;
    try {
      resolveRendererEntry({ repoRoot: root, hasBun: true });
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.name).toBe("BootstrapRendererUnavailableError");
  });

  test("branch 3: the refusal quotes the exact build command", () => {
    const root = fakeRepo("ladder-none-msg", {});
    expect(() => resolveRendererEntry({ repoRoot: root, hasBun: false })).toThrow(BUILD_COMMAND);
    expect(BUILD_COMMAND).toBe("bun run build");
  });

  test("branch 3: the refusal names both candidate paths", () => {
    const root = fakeRepo("ladder-none-paths", {});
    let message = "";
    try {
      resolveRendererEntry({ repoRoot: root, hasBun: true });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(path.join(root, BOOTSTRAP_SOURCE_ENTRY));
    expect(message).toContain(path.join(root, BOOTSTRAP_DIST_ENTRY));
  });

  test("branch 3 renders nothing — no default contract is produced or written", async () => {
    const root = fakeRepo("ladder-none-render", {});
    const home = scratch("ladder-none-home");
    const out = path.join(home, "MASSA-AI.md");

    await expect(
      renderBootstrapForInstaller({
        repoRoot: root,
        targetHome: home,
        host: "claude",
        sourcePath: AGENTS_SOURCE,
        hasBun: true,
        onWarning: () => {},
      }),
    ).rejects.toThrow(BUILD_COMMAND);

    expect(fs.existsSync(out)).toBe(false);
  });

  test("a module the ladder picked but the runtime cannot load fails by name", async () => {
    // "The build exists" and "this runner can load it" are different questions:
    // the real dist barrel fails ERR_MODULE_NOT_FOUND under node's ESM loader
    // because its siblings use extensionless relative specifiers. Whatever the
    // cause, the installer must get a named refusal and no default render.
    const root = scratch("ladder-unloadable");
    const distEntry = path.join(root, BOOTSTRAP_DIST_ENTRY);
    fs.mkdirSync(path.dirname(distEntry), { recursive: true });
    fs.writeFileSync(distEntry, "import './definitely-not-here';\n");

    const home = scratch("ladder-unloadable-home");
    let thrown: Error | undefined;
    try {
      await renderBootstrapForInstaller({
        repoRoot: root,
        targetHome: home,
        host: "claude",
        sourcePath: AGENTS_SOURCE,
        hasBun: false,
        onWarning: () => {},
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown?.name).toBe("BootstrapRendererUnloadableError");
    expect(thrown?.message).toContain(distEntry);
    expect(fs.existsSync(path.join(home, "MASSA-AI.md"))).toBe(false);
  });

  test("the ladder's chosen module is the one actually imported", async () => {
    // The dist branch resolves a real file, so "picked dist" and "loaded dist"
    // are separate claims and this asserts the second one.
    const root = fakeRepo("ladder-import", { dist: true });
    const entry = resolveRendererEntry({ repoRoot: root, hasBun: false });
    const loaded = (await import(entry.specifier)) as { marker: string };
    expect(loaded.marker).toBe("dist");
  });
});

describe("rule state resolution and the BST-10 AC-10b degrade", () => {
  test("a malformed config.json warns naming the file and the parse failure", () => {
    const home = scratch("degrade-malformed");
    const configPath = writeConfig(home, "{ this is not json");
    const warnings: string[] = [];

    const resolved = resolveRuleStateForRender(api, configPath, (m) => warnings.push(m));

    expect(resolved.degraded).toBe(true);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain(configPath);
    expect(warnings[0]).toContain("ConfigParseError");
    expect(warnings[0]).toContain("was not written");
  });

  test("the degrade renders exactly the registry defaults", () => {
    const home = scratch("degrade-defaults");
    const configPath = writeConfig(home, "{ nope");
    const resolved = resolveRuleStateForRender(api, configPath, () => {});
    expect(resolved.state).toEqual(bootstrapBarrel.bootstrapRuleDefaults());
  });

  test("the degrade writes nothing to config.json", () => {
    const home = scratch("degrade-nowrite");
    const configPath = writeConfig(home, "{ still not json\n");
    const before = fs.readFileSync(configPath, "utf-8");
    resolveRuleStateForRender(api, configPath, () => {});
    expect(fs.readFileSync(configPath, "utf-8")).toBe(before);
  });

  test("a JSON array is not a config document and degrades the same way", () => {
    const home = scratch("degrade-array");
    const configPath = writeConfig(home, "[1,2,3]");
    const warnings: string[] = [];
    const resolved = resolveRuleStateForRender(api, configPath, (m) => warnings.push(m));
    expect(resolved.degraded).toBe(true);
    expect(warnings[0]).toContain("not a JSON object");
  });

  test("an absent config.json warns nothing and is not created", () => {
    const home = scratch("degrade-absent");
    const configPath = path.join(home, ".config", "massa-ai", "config.json");
    const warnings: string[] = [];
    const resolved = resolveRuleStateForRender(api, configPath, (m) => warnings.push(m));
    expect(warnings).toEqual([]);
    expect(resolved.degraded).toBe(false);
    expect(fs.existsSync(configPath)).toBe(false);
  });

  test("a readable preference is honoured, so the degrade case is not vacuous", () => {
    const home = scratch("state-honoured");
    const configPath = writeConfig(
      home,
      JSON.stringify({ bootstrap: { rules: { "plan-challenge": false } } }),
    );
    const resolved = resolveRuleStateForRender(api, configPath, () => {});
    expect(resolved.degraded).toBe(false);
    expect(resolved.state["plan-challenge"]).toBe(false);
    expect(resolved.state["caveman"]).toBe(true);
  });

  test("an unregistered persisted id is reported, not fatal (BST-10 AC-12)", () => {
    const home = scratch("state-ignored");
    const configPath = writeConfig(
      home,
      JSON.stringify({ bootstrap: { rules: { "no-such-rule": false } } }),
    );
    const resolved = resolveRuleStateForRender(api, configPath, () => {});
    expect(resolved.ignoredStateKeys).toEqual(["no-such-rule"]);
    expect(resolved.degraded).toBe(false);
  });
});

describe("rendering for the installer", () => {
  test("the contract is emitted wrapped in the managed marker pair (BST-01 AC-2)", async () => {
    const home = scratch("render-contract");
    const result = await renderBootstrapForInstaller({
      repoRoot: REPO_ROOT,
      targetHome: home,
      host: "claude",
      sourcePath: AGENTS_SOURCE,
      hasBun: true,
      onWarning: () => {},
    });
    const lines = result.contract.split("\n");
    expect(lines[0]).toBe(BOOTSTRAP_START);
    expect(lines[lines.length - 2]).toBe(BOOTSTRAP_END);
    expect(result.contract).toContain("Coding Session Startup Contract");
  });

  test("the pointer is emitted wrapped and stays within 10 lines (BST-04 AC-6)", async () => {
    const home = scratch("render-pointer");
    const result = await renderBootstrapForInstaller({
      repoRoot: REPO_ROOT,
      targetHome: home,
      host: "codex",
      sourcePath: AGENTS_SOURCE,
      hasBun: true,
      onWarning: () => {},
    });
    expect(result.pointer.split("\n")[0]).toBe(BOOTSTRAP_START);
    expect(result.pointer.trimEnd().split("\n").length).toBeLessThanOrEqual(10);
    expect(result.pointer).toContain(path.join(home, ".codex", "MASSA-AI.md"));
    expect(result.pointer).not.toContain("Plan Challenge Policy");
  });

  test("a disabled rule disappears from the rendered contract", async () => {
    const home = scratch("render-disabled");
    writeConfig(home, JSON.stringify({ bootstrap: { rules: { "plan-challenge": false } } }));
    const result = await renderBootstrapForInstaller({
      repoRoot: REPO_ROOT,
      targetHome: home,
      host: "claude",
      sourcePath: AGENTS_SOURCE,
      hasBun: true,
      onWarning: () => {},
    });
    expect(result.contract).not.toContain("## Plan Challenge Policy");
  });

  test("an unreadable source is refused by name, not rendered from defaults", async () => {
    const home = scratch("render-nosource");
    await expect(
      renderBootstrapForInstaller({
        repoRoot: REPO_ROOT,
        targetHome: home,
        host: "claude",
        sourcePath: path.join(home, "absent-AGENTS.md"),
        hasBun: true,
        onWarning: () => {},
      }),
    ).rejects.toThrow("could not read the bootstrap source");
  });
});

describe("CLI surface", () => {
  test("--target-home, --host and --source are required", () => {
    expect(() => parseArgs(["--host", "claude"], REPO_ROOT)).toThrow("--target-home");
  });

  test("--repo-root defaults to the repository the script lives in", () => {
    const parsed = parseArgs(
      ["--target-home", "/tmp/x", "--host", "claude", "--source", AGENTS_SOURCE],
      REPO_ROOT,
    );
    expect(parsed.repoRoot).toBe(REPO_ROOT);
  });

  test("main writes both output files and exits 0", async () => {
    const home = scratch("cli-outputs");
    const contractOut = path.join(home, "out", "MASSA-AI.block");
    const pointerOut = path.join(home, "out", "pointer.block");

    const code = await main(
      [
        "--target-home",
        home,
        "--host",
        "cursor",
        "--source",
        AGENTS_SOURCE,
        "--contract-out",
        contractOut,
        "--pointer-out",
        pointerOut,
      ],
      REPO_ROOT,
    );

    expect(code).toBe(0);
    expect(fs.readFileSync(contractOut, "utf-8").startsWith(BOOTSTRAP_START)).toBe(true);
    expect(fs.readFileSync(pointerOut, "utf-8")).toContain(
      path.join(home, ".cursor", "MASSA-AI.md"),
    );
  });

  test("main exits non-zero and writes no output file when no renderer is reachable", async () => {
    const root = fakeRepo("cli-norenderer", {});
    const home = scratch("cli-norenderer-home");
    const contractOut = path.join(home, "out", "MASSA-AI.block");

    const code = await main(
      [
        "--target-home",
        home,
        "--host",
        "claude",
        "--source",
        AGENTS_SOURCE,
        "--contract-out",
        contractOut,
        "--repo-root",
        root,
      ],
      REPO_ROOT,
    );

    expect(code).not.toBe(0);
    expect(fs.existsSync(contractOut)).toBe(false);
  });
});

describe("export surface (PC-B1)", () => {
  test("the bootstrap barrel exists and carries the module's public symbols", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, BOOTSTRAP_SOURCE_ENTRY))).toBe(true);
    expect(typeof bootstrapBarrel.renderBootstrap).toBe("function");
    expect(typeof bootstrapBarrel.resolveBootstrapState).toBe("function");
    expect(typeof bootstrapBarrel.applyBootstrapState).toBe("function");
    expect(typeof bootstrapBarrel.setBootstrapRuleEnabled).toBe("function");
    expect(bootstrapBarrel.BOOTSTRAP_RULE_IDS.length).toBe(9);
  });

  test("the package root barrel re-exports them, the way profile-switch is exported", () => {
    expect(typeof sharedRootBarrel.renderBootstrap).toBe("function");
    expect(typeof sharedRootBarrel.applyBootstrapState).toBe("function");
    expect(typeof sharedRootBarrel.bootstrapRuleDefaults).toBe("function");
    expect(sharedRootBarrel.BOOTSTRAP_STATE_PATH).toBe("bootstrap.rules");
  });
});
