/**
 * Subprocess harness for config tests that must touch a real filesystem.
 *
 * `CONFIG_DIR` is a module-level const (`config-loader.ts:7`) frozen when the
 * module is evaluated, and `bun test` shares one process across every file in
 * the package. Assigning `XDG_CONFIG_HOME` in-process therefore comes too late
 * whenever any sibling suite has already imported `config-loader` — and the
 * test would silently write into the developer's real `~/.config/massa-ai/`.
 *
 * Everything here runs the code under test in a **subprocess** whose
 * `XDG_CONFIG_HOME` is set before `bun` loads a single module. That turns "set
 * the env var before importing" from an ordering convention into a process
 * boundary that cannot be violated by accident.
 */

import fs from "fs";
import os from "os";
import path from "path";

/** Absolute paths to the modules under test, for the child's import statements. */
export const LOADER = path.join(import.meta.dir, "..", "config-loader.ts");
export const CONFIG_TYPES = path.join(import.meta.dir, "..", "massa-ai-config.ts");
export const API_KEY = path.join(import.meta.dir, "..", "api-key.ts");

export interface IsolatedConfigHome {
  /** Value handed to the child as XDG_CONFIG_HOME. */
  xdgHome: string;
  /** What the child's `getConfigDir()` must resolve to. */
  configDir: string;
  /** What the child's `getConfigPath()` must resolve to. */
  configPath: string;
  /** Scratch dir holding both the XDG home and the generated child scripts. */
  scriptDir: string;
}

export function makeIsolatedConfigHome(prefix = "massa-ai-cfg-"): IsolatedConfigHome {
  const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const xdgHome = path.join(scriptDir, "xdg");
  const configDir = path.join(xdgHome, "massa-ai");
  return { scriptDir, xdgHome, configDir, configPath: path.join(configDir, "config.json") };
}

export function removeIsolatedConfigHome(home: IsolatedConfigHome): void {
  // Tests may chmod the config dir read-only to exercise the unwritable path;
  // restore write permission first or rmSync fails on its children.
  try {
    if (fs.existsSync(home.configDir)) fs.chmodSync(home.configDir, 0o700);
  } catch {
    // Best effort — the dir may not exist.
  }
  fs.rmSync(home.scriptDir, { recursive: true, force: true });
}

function writeScript(home: IsolatedConfigHome, name: string, source: string): string {
  const file = path.join(home.scriptDir, `${name}.ts`);
  fs.writeFileSync(file, source);
  return file;
}

/**
 * A `MASSA_AI_API_KEY` leaking in from the developer's real environment would
 * make every "no key configured" scenario resolve from env instead of
 * provisioning — the suite would pass while testing nothing. It is stripped by
 * default; a test that wants the env branch passes it back via `extraEnv`.
 */
function childEnv(
  home: IsolatedConfigHome,
  extraEnv: Record<string, string>,
): Record<string, string> {
  const { MASSA_AI_API_KEY: _stripped, ...inherited } = process.env as Record<string, string>;
  return { ...inherited, XDG_CONFIG_HOME: home.xdgHome, ...extraEnv };
}

export interface IsolatedRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Run a script to completion with an isolated XDG_CONFIG_HOME. */
export function runIsolated(
  home: IsolatedConfigHome,
  name: string,
  source: string,
  args: string[] = [],
  extraEnv: Record<string, string> = {},
): IsolatedRunResult {
  const file = writeScript(home, name, source);
  const proc = Bun.spawnSync(["bun", file, ...args], { env: childEnv(home, extraEnv) });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

/** Same, but async, so the parent can observe the filesystem while it runs. */
export function spawnIsolated(
  home: IsolatedConfigHome,
  name: string,
  source: string,
  args: string[] = [],
  extraEnv: Record<string, string> = {},
) {
  const file = writeScript(home, name, source);
  return Bun.spawn(["bun", file, ...args], {
    env: childEnv(home, extraEnv),
    stdout: "pipe",
    stderr: "pipe",
  });
}
